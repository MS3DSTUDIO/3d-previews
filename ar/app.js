// The Little Discoverers, web AR for one page of the book (English).
// The camera looks for the 4 corner markers printed only on the drawing page, then checks the colouring. Coloured well: the scene stands on the paper with its sound. Not yet: Kimo appears and shows what to colour.
// The sound file is the clock: the animation always shows the time the sound has reached, so they cannot drift apart.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { fitPage, followOne, PageFilter, poseMatrix, pageOfId } from "./tracker.js";
import { ColorCheck, SHOW } from "./colorcheck.js";

const PAGES = {
  "01": "The Gate to the Color Forest", "02": "The Three Apples and the Magic Bridge", "03": "The River Comes Back to Life",
  "04": "A Sun That Brings Back the Warmth", "05": "The Three Primary Colors", "06": "Ginger and the Map", "07": "The Secret of Green",
  "08": "Momo Needs a Friend", "09": "The Color Tree Awakens", "10": "The Forest Celebration",
};
// Where the drawing sits on the printed page, in mm (book_pages.py): the scene stands exactly on it. Page width = 1 unit.
const PAGE_W = 215.9, PAGE_H = 279.4, ART_W = 181.9, ART_H = 135.84, ART_TOP = 42;
const ART_Y = (PAGE_H / 2 - ART_TOP - ART_H / 2) / PAGE_W;
const LOST_GRACE_MS = 1200;  // a hand passing the camera must not stop the story
const HIDE_AFTER_MS = 500;   // no marker seen for this long: the scene steps off the page
const FOCAL = 0.8;           // typical phone main camera: focal length as a share of the long side of the picture
const MEASURE_MS = 450;      // how often the colours are read while Kimo waits
const KIMO_SIZE = 1.5, KIMO_LEAN = (35 * Math.PI) / 180, KIMO_AT = [(33 - PAGE_W / 2) / PAGE_W, (PAGE_H / 2 - 212) / PAGE_W];
const LINES = {
  start: "Let's color this picture first, and then the magic will begin!",
  almost: "Great job! Just a little more color, and the magic will wake up!",
  yay: "Wow, what beautiful colors! Here comes the magic!",
  red: "This part loves red. Can you color it red?", orange: "This part loves orange. Can you color it orange?",
  yellow: "This part loves yellow. Can you color it yellow?", green: "This part loves green. Can you color it green?",
  blue: "This part loves blue. Can you color it blue?", purple: "This part loves purple. Can you color it purple?",
  brown: "This part loves brown. Can you color it brown?", grey: "This part loves grey. Can you color it grey?",
};

const m = location.pathname.match(/S1_E1_P(\d\d)/);
const id = m ? m[1] : null;
const params = new URLSearchParams(location.search);
const TEST = params.has("test");
const NOCHECK = params.has("nocheck");   // for the studio: see the story without colouring a page first
const base = "../assets/";
const $ = (s) => document.querySelector(s);
const state = { phase: "search", found: 0, lost: 0, visible: false, ended: false, audioOk: false, time: 0, duration: 0, error: null, lines: [], score: null, measures: 0 };
window.__ar = state;

function fail(text) {
  state.error = text;
  $("#start-panel").hidden = false;
  $("#progress").hidden = true;
  $("#start").hidden = true;
  const e = $("#message");
  e.textContent = text;
  e.hidden = false;
}

function hint(text) {
  const h = $("#hint");
  h.textContent = text || "";
  h.hidden = !text;
}

// a model made on the 4.4-wide scene page, standing on the drawing
function placeOnPage(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root.getObjectByName("Page"));
  const w = box.max.x - box.min.x;
  const cx = (box.max.x + box.min.x) / 2, cz = (box.max.z + box.min.z) / 2;
  // the real painted paper shows through: only what stands on it is drawn
  root.traverse((o) => {
    if (/^(Page|Ground)/.test(o.name)) o.visible = false;
    if (o.isMesh) o.frustumCulled = false;
  });
  const holder = new THREE.Group();
  const s = ART_W / PAGE_W / w;
  holder.scale.setScalar(s);
  holder.rotation.x = Math.PI / 2;  // the scene's up becomes the page's facing direction
  holder.position.set(-cx * s, ART_Y + cz * s, 0);
  holder.add(root);
  return holder;
}

// Kimo the guide: bigger than in the story and leaning back like a pop-up figure, so a phone held above the page sees his face. His feet stand beside his printed head.
function placeKimo(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root.getObjectByName("Page"));
  const w = box.max.x - box.min.x;
  const unit = w / 4.4;   // one scene unit (see ld_lib.py)
  root.traverse((o) => {
    if (/^(Page|Ground)/.test(o.name)) o.visible = false;
    if (o.isMesh) o.frustumCulled = false;
  });
  const holder = new THREE.Group();
  const s = (ART_W / PAGE_W / w) * KIMO_SIZE;
  holder.scale.setScalar(s);
  holder.rotation.x = KIMO_LEAN;
  const feet = new THREE.Vector3(-1.62 * unit, 0, 0.92 * unit).multiplyScalar(s).applyEuler(holder.rotation);
  holder.position.set(KIMO_AT[0], KIMO_AT[1], 0.01).sub(feet);
  holder.add(root);
  return holder;
}

async function main() {
  if (!id || !PAGES[id]) return fail("This page of the book was not found. Please scan the code on the page again.");
  document.title = `${PAGES[id]} - The Little Discoverers`;
  $("#page-name").textContent = `Page ${Number(id)}: ${PAGES[id]}`;

  const audio = new Audio(`${base}P${id}.mp3`);
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  state.audio = audio;
  const voice = new Audio(`${base}kimo_yay.mp3`);
  voice.preload = "auto";
  voice.setAttribute("playsinline", "");
  state.voice = voice;

  // load everything first, so the story starts at once when the page is found
  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await loader.loadAsync(`${base}P${id}.glb`, (e) => {
      if (e.total) $("#bar").style.width = `${Math.round((100 * e.loaded) / e.total)}%`;
    });
  } catch (err) {
    return fail("The story could not load. Please check your internet and try again.");
  }
  const holder = placeOnPage(gltf.scene);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = gltf.animations[0];
  mixer.clipAction(clip).play();
  mixer.setTime(0);
  state.duration = clip.duration;

  let kimo = null, check = null;
  if (!NOCHECK) {
    try {
      const k = await loader.loadAsync(`${base}kimo.glb`);
      kimo = { holder: placeKimo(k.scene), mixer: new THREE.AnimationMixer(k.scene), dur: k.animations[0].duration };
      kimo.mixer.clipAction(k.animations[0]).play();
      const z = await fetch(`${base}P${id}_zones.json`).then((r) => r.json());
      if (z.zones.length) check = new ColorCheck(z);
    } catch (err) {
      console.error("colour check not available", err);   // a child must never be locked out of the story by a failed download
    }
  }

  $("#progress").hidden = true;
  $("#start").hidden = false;

  // a browser allows sound only after a tap, so the Start tap also unlocks both sounds
  $("#start").addEventListener("click", async () => {
    $("#start").disabled = true;
    try {
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      state.audioOk = true;
      await voice.play();
      voice.pause();
      voice.currentTime = 0;
    } catch (err) {
      state.audioOk = false;
    }
    try {
      await startAR(audio, voice, holder, mixer, clip, kimo, check);
      $("#start-panel").hidden = true;
      $("#controls").hidden = false;
      hint(`Point your camera at the drawing you colored, page ${Number(id)}. Show its black corner squares.`);
    } catch (err) {
      console.error(err && err.stack || err);
      fail("Please allow the camera to see the story, then reload this page.");
    }
  }, { once: true });
}

async function startAR(audio, voice, holder, mixer, clip, kimo, check) {
  const video = $("#cam");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: TEST ? true : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener("loadedmetadata", r, { once: true }));
  let vw = video.videoWidth, vh = video.videoHeight;
  let f = Math.max(vw, vh) * FOCAL;   // phone lenses differ a little; the page itself still lines up, only the height of the scene changes slightly

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  $("#ar").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a0, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.3, 0.6, 1);
  scene.add(sun);
  const anchor = new THREE.Group();
  anchor.matrixAutoUpdate = false;
  anchor.visible = false;
  scene.add(anchor);
  anchor.add(holder);
  if (kimo) { anchor.add(kimo.holder); kimo.holder.visible = false; }

  // the glow over what still wants colouring
  let glow = null, glowCtx = null;
  if (check) {
    const c = document.createElement("canvas");
    c.width = check.w; c.height = check.h;
    glowCtx = c.getContext("2d");
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    glow = new THREE.Mesh(new THREE.PlaneGeometry(ART_W / PAGE_W, ART_H / PAGE_W), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    glow.position.set(0, ART_Y, 0.002);
    glow.visible = false;
    anchor.add(glow);
  }

  // the video fills the screen and is cropped to it; the 3D camera must see exactly what the crop shows
  const fit = () => {
    const W = window.innerWidth, H = window.innerHeight;
    renderer.setSize(W, H);
    const k = Math.max(W / vw, H / vh);
    camera.fov = (2 * Math.atan((H / 2) / (f * k)) * 180) / Math.PI;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  };
  fit();
  window.addEventListener("resize", fit);

  const showPlay = (on) => { $("#replay").hidden = !on; };
  const playSound = () => {
    if (state.ended) return;
    audio.play().then(() => { state.audioOk = true; $("#sound-fix").hidden = true; })
      .catch(() => { state.audioOk = false; $("#sound-fix").hidden = false; });
  };
  const askForPage = () => hint(`Point your camera at the drawing you colored, page ${Number(id)}. Show its black corner squares.`);

  // ---- Kimo's words
  let speaking = false, nextSpeak = 0, repeats = 0, saidAlmost = false, saidStart = false, currentAsk = null, passes = 0, fails = 0, lastMeasure = 0, yayTimer = null, lastResult = null;
  voice.addEventListener("ended", () => {
    speaking = false;
    nextSpeak = performance.now() + Math.min(6000 + repeats * 3000, 15000);
    repeats++;
    if (state.phase === "yay") beginStory();
  });
  const say = (line) => {
    speaking = true;
    state.lines.push(line);
    hint(LINES[line]);
    voice.src = `${base}kimo_${line}.mp3`;
    voice.play().catch(() => { speaking = false; nextSpeak = performance.now() + 6000; });
  };
  const beginStory = () => {
    clearTimeout(yayTimer);
    state.phase = "story";
    if (glow) glow.visible = false;
    hint("");
    if (state.visible) playSound();
  };
  const updateGuide = (r) => {
    if (!glow) return;
    const colour = check.any ? "#ffd300" : SHOW[r.ask] || "#ffd300";
    check.paintGlow(glowCtx, colour, r.failing, r.ask);
    glow.material.map.needsUpdate = true;
    glow.visible = r.failing.some(Boolean);
  };
  const guideNow = (r) => {
    if (speaking || performance.now() < nextSpeak) return;
    if (r.blank && !saidStart) { saidStart = true; say("start"); return; }
    if (r.score >= 0.3 && !saidAlmost) { saidAlmost = true; say("almost"); return; }
    if (check.any) { say(r.score >= 0.3 ? "almost" : "start"); return; }
    if (r.ask) say(r.ask);
  };
  const judge = (r) => {
    state.score = r.score;
    state.measures++;
    lastResult = r;
    if (r.pass) { passes++; fails = 0; } else { fails++; passes = 0; }
    if (passes >= 2) {
      state.phase = "yay";
      if (glow) glow.visible = false;
      voice.pause();
      say("yay");
      yayTimer = setTimeout(beginStory, 6000);   // the story starts even if this line cannot play
      return;
    }
    if (state.phase === "check" && fails >= 3) state.phase = "guide";
    if (state.phase === "guide") {
      if (r.ask !== currentAsk || state.measures % 4 === 0) { currentAsk = r.ask; updateGuide(r); }
      guideNow(r);
    }
  };

  let lostTimer = null;
  const onFound = () => {
    state.found++;
    state.visible = true;
    clearTimeout(lostTimer);
    if (state.phase === "search") {
      passes = 0; fails = 0;
      if (check) { state.phase = "check"; hint("Let me see your colors..."); } else state.phase = "story";
    }
    if (state.phase === "story") { hint(""); playSound(); }
    if (state.phase === "guide" && lastResult) hint("");
  };
  const onLost = () => {
    state.lost++;
    state.visible = false;
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => {
      audio.pause();
      if (state.phase === "check") state.phase = "search";
      if (state.phase === "guide") { voice.pause(); speaking = false; nextSpeak = 0; }
      if (!state.ended) askForPage();
    }, LOST_GRACE_MS);
  };
  audio.addEventListener("ended", () => { state.ended = true; showPlay(true); });
  $("#replay").addEventListener("click", () => {
    state.ended = false;
    showPlay(false);
    audio.currentTime = 0;
    if (state.visible) playSound();
  });
  $("#sound").addEventListener("click", () => {
    audio.muted = !audio.muted;
    voice.muted = audio.muted;
    $("#sound").textContent = audio.muted ? "Sound off" : "Sound on";
    $("#sound").setAttribute("aria-pressed", String(!audio.muted));
  });
  $("#sound-fix").addEventListener("click", playSound);

  // camera frames go to the marker finder one at a time
  const grab = document.createElement("canvas");
  grab.width = vw; grab.height = vh;
  const gx = grab.getContext("2d", { willReadFrequently: true });
  const worker = new Worker("../tracker_worker.js");
  let busy = false, Hraw = null, Hshow = null, lastSeen = 0, candidates = 0, otherPage = 0, otherCount = 0, misses = 0;
  const filter = new PageFilter();
  const mine = Number(id);
  const send = () => {
    if (busy || video.readyState < 2) return;
    if (video.videoWidth !== vw || video.videoHeight !== vh) {   // the phone was turned
      vw = video.videoWidth; vh = video.videoHeight;
      f = Math.max(vw, vh) * FOCAL;
      grab.width = vw; grab.height = vh;
      fit();
    }
    busy = true;
    gx.drawImage(video, 0, 0, vw, vh);
    const img = gx.getImageData(0, 0, vw, vh);
    worker.postMessage({ buf: img.data.buffer, w: vw, h: vh, t: performance.now() }, [img.data.buffer]);
  };
  const showOtherPage = (p) => {
    const b = $("#other-page");
    b.textContent = `This is page ${p}. Open page ${p}`;
    b.hidden = false;
    hint("");
    b.onclick = () => { location.href = `../S1_E1_P${String(p).padStart(2, "0")}/`; };
  };
  worker.onmessage = (e) => {
    busy = false;
    const now = performance.now();
    state.detectMs = e.data.ms;
    const list = [], others = {};
    for (const mk of e.data.markers) {
      const p = pageOfId(mk.id);
      if (p === mine) list.push({ index: mk.id % 4, corners: mk.corners });
      else others[p] = (others[p] || 0) + 1;
    }
    state.markers = list.length;
    let H = null;
    if (list.length >= 2) {
      const r = fitPage(list);
      if (r) H = r.H;
    } else if (list.length === 1 && Hraw && now - lastSeen < 600) {
      H = followOne(Hraw, list[0]);
    }
    if (H && !state.visible) {
      // first sight: two frames in a row, so a chance look-alike in a picture can never start anything
      candidates++;
      if (candidates < 2) H = null;
    }
    misses = H ? 0 : misses + 1;
    if (H) {
      candidates = 0;
      Hraw = H;
      lastSeen = now;
      Hshow = filter.apply(H, now);
      if (!state.visible) onFound();
      otherCount = 0;
      // the frame the markers were found in is still on the canvas: read the colours from it
      if ((state.phase === "check" || state.phase === "guide") && list.length >= 2 && now - lastMeasure > MEASURE_MS) {
        lastMeasure = now;
        const r = check.measure(gx.getImageData(0, 0, vw, vh), H);
        if (r) judge(r);
      }
    } else {
      if (list.length === 0) candidates = 0;
      const best = Object.keys(others).find((k) => others[k] >= 2);
      otherCount = best ? otherCount + 1 : 0;
      otherPage = best ? Number(best) : 0;
    }
    if (otherCount >= 2 && !state.visible) showOtherPage(otherPage);
    else $("#other-page").hidden = true;
    state.otherPage = otherCount >= 2 ? otherPage : 0;
  };

  // if sound is refused the story still moves, on its own clock
  let silentT = 0, last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    send();
    // lost means several looks in a row without the page: a slow phone that simply looks less often has not lost it
    if (state.visible && misses >= 3 && now - lastSeen > HIDE_AFTER_MS) { onLost(); Hraw = null; filter.reset(); candidates = 0; }
    anchor.visible = state.visible && !!Hshow;
    if (anchor.visible) {
      anchor.matrix.fromArray(poseMatrix(Hshow, vw, vh, f));
      anchor.matrixWorldNeedsUpdate = true;
    }
    const inStory = state.phase === "story";
    holder.visible = inStory;
    if (kimo) {
      const kimoOn = state.phase === "guide" || state.phase === "yay";
      kimo.holder.visible = kimoOn;
      if (kimoOn && anchor.visible) kimo.mixer.setTime((now / 1000) % kimo.dur);
    }
    if (glow && glow.visible) glow.material.opacity = 0.45 + 0.3 * Math.sin(now / 280);
    let t = audio.currentTime;
    if (!state.audioOk && state.visible && inStory) t = silentT = Math.min(silentT + dt, clip.duration);
    if (!state.audioOk && !(state.visible && inStory)) t = silentT;
    t = Math.min(t, clip.duration - 0.001);
    if (inStory) mixer.setTime(t);
    state.time = t;
    renderer.render(scene, camera);
  });
  state.H = () => Hshow;
  if (TEST) { testMeter(audio, "peak"); testMeter(voice, "voicePeak"); }
}

// test only: is real signal coming out of a sound element?
function testMeter(el, key) {
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(el);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    an.connect(ctx.destination);
    ctx.resume();
    const d = new Float32Array(an.fftSize);
    state[key] = 0;
    setInterval(() => {
      an.getFloatTimeDomainData(d);
      for (const v of d) state[key] = Math.max(state[key], Math.abs(v));
    }, 100);
    window[`__meter_${key}`] = an;
  } catch (e) {
    state.meterError = String(e);
  }
}

main().catch((e) => { console.error(e); fail("Something went wrong. Please reload this page."); });
