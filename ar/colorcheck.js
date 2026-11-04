// Has the child coloured what Kimo asked for? Rule from the production guide: a zone counts when 50% of it is in the right colour family, the page passes at 60% of the zones' area.
import { project, mmToPage } from "./tracker.js";

const ART = { x: 17, y: 42, w: 181.9, h: 135.84 };
export const ZONE_PASS = 0.5, PAGE_PASS = 0.6;
// Pages with a colour reference ("ref"): the WHOLE picture must be finished, and of what is coloured, 60% must match the colour page. A pencil page always has small gaps, so finished = 80% of the cells.
// The picture is also cut into squares of about 23 mm, and nearly all of them must be coloured, so big trees cannot make up for a corner or a character left white.
export const FINISHED = 0.8, MATCH = 0.6, TILE_DONE = 0.5, TILES_DONE = 0.92;
const TILES_X = 8, TILES_Y = 6, TILE_MIN = 25;
const NAMES = ["none", "red", "orange", "yellow", "green", "blue", "purple", "pink", "brown", "grey"];
// neighbours a pencil can honestly look like under a phone camera
const NEAR = { red: ["red", "orange", "pink"], orange: ["orange", "red", "yellow", "brown"], yellow: ["yellow", "orange"], green: ["green"], blue: ["blue", "purple"], purple: ["purple", "blue", "pink"], pink: ["pink", "red", "purple"], brown: ["brown", "orange", "red"], grey: ["grey"] };
export const SHOW = { red: "#e3262e", orange: "#ff8c1a", yellow: "#ffd300", green: "#2e9e44", blue: "#1f5fbf", purple: "#7b3fa0", pink: "#f7a1c4", brown: "#7a4a2a", grey: "#8e9196" };

// same rule as families() in book_zones.py, except that a light grey pencil on the page still counts as grey; r, g, b 0..1 after the paper has been made white
function family(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const s = mx > 0 ? d / mx : 0;
  if (s < 0.09) return mx < 0.9 ? 9 : 0;
  let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h >= 5 && h < 45 && mx < 0.62) return 8;
  if (h >= 345 || h < 12) return 1;
  if (h < 38) return 2;
  if (h < 68) return 3;
  if (h < 178) return 4;   // real green pencils lean toward teal under a phone camera
  if (h < 255) return 5;
  if (h < 300) return 6;
  return 7;
}

// clear printed paper between the bottom markers and in the side margins, in mm
const PAPER_SPOTS = [];
for (let x = 40; x <= 176; x += 12) PAPER_SPOTS.push([x, 263]);
for (let y = 60; y <= 170; y += 14) { PAPER_SPOTS.push([5.5, y]); PAPER_SPOTS.push([210.4, y]); }

export class ColorCheck {
  constructor(data) {
    this.w = data.w; this.h = data.h; this.any = data.any; this.zones = data.zones;
    const bin = atob(data.map);
    this.map = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) this.map[i] = bin.charCodeAt(i);
    this.ok = data.zones.map((z) => {
      const set = new Set();
      for (const f of [z.f, ...(z.also || [])]) for (const n of NEAR[f] || [f]) set.add(NAMES.indexOf(n));
      return set;
    });
    this.cells = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const z = this.map[y * this.w + x];
      if (z) this.cells.push({ z: z - 1, p: mmToPage(ART.x + ((x + 0.5) / this.w) * ART.w, ART.y + ((y + 0.5) / this.h) * ART.h) });
    }
    this.paper = PAPER_SPOTS.map(([x, y]) => mmToPage(x, y));
    this.total = this.zones.reduce((s, z) => s + z.a, 0) || 1;
    this.ref = null;
    if (data.ref) {
      const r = atob(data.ref);
      this.ref = [];
      this.nearOf = NAMES.map((name) => new Set((NEAR[name] || []).map((v) => NAMES.indexOf(v))));
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const f = r.charCodeAt(y * this.w + x);
        if (f) this.ref.push({ f, i: y * this.w + x, tile: Math.floor((y * TILES_Y) / this.h) * TILES_X + Math.floor((x * TILES_X) / this.w), p: mmToPage(ART.x + ((x + 0.5) / this.w) * ART.w, ART.y + ((y + 0.5) / this.h) * ART.h) });
      }
      this.state = new Uint8Array(this.ref.length);
    }
  }

  // the whole picture against the colour page. state of each cell: 1 still white, 2 coloured and matching, 3 coloured but another colour
  measureWhole(read, wr, wg, wb) {
    let seen = 0, coloured = 0, right = 0;
    const lacking = {};
    const tileSeen = new Uint16Array(TILES_X * TILES_Y), tileDone = new Uint16Array(TILES_X * TILES_Y);
    this.ref.forEach((c, k) => {
      const v = read(c.p);
      if (!v) { this.state[k] = 0; return; }
      seen++;
      tileSeen[c.tile]++;
      const f = family(Math.min(v[0] / wr, 1), Math.min(v[1] / wg, 1), Math.min(v[2] / wb, 1));
      if (f === 0 || f === 9) {
        this.state[k] = 1;
        lacking[c.f] = (lacking[c.f] || 0) + 1;
      } else {
        coloured++;
        tileDone[c.tile]++;
        if (this.nearOf[c.f].has(f)) { right++; this.state[k] = 2; } else { this.state[k] = 3; lacking[c.f] = (lacking[c.f] || 0) + 1; }
      }
    });
    if (seen < this.ref.length * 0.7) return null;
    const coverage = coloured / seen, match = coloured ? right / coloured : 0;
    let tiles = 0, full = 0;
    for (let t = 0; t < tileSeen.length; t++) if (tileSeen[t] >= TILE_MIN) { tiles++; if (tileDone[t] / tileSeen[t] >= TILE_DONE) full++; }
    const tilesDone = tiles ? full / tiles : 0;
    const finished = coverage >= FINISHED && tilesDone >= TILES_DONE;
    const sorted = Object.keys(lacking).sort((a, b) => lacking[b] - lacking[a]).map((i) => NAMES[i]);
    return { whole: true, coverage, match, tilesDone, score: Math.min(coverage / FINISHED, 1) * Math.min(match / MATCH, 1), blank: coverage < 0.1, finished, asks: sorted, ask: sorted[0] || null, pass: finished && match >= MATCH, failing: [true] };
  }

  // img: the camera frame (ImageData); H: page -> frame. Returns the page's score and what to ask for next, or null if too little of the page is in view.
  measure(img, H) {
    const { data, width: W, height: Ht } = img;
    const avg = (px, py) => {
      const cx = Math.round(px), cy = Math.round(py);
      if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= Ht - 1) return null;
      let r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((cy + dy) * W + cx + dx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      return [r / 9, g / 9, b / 9];
    };
    // the paper tells us the room's light and the paper's own tint (KDP prints on white or cream)
    const pr = [], pg = [], pb = [];
    for (const q of this.paper) {
      const p = project(H, q[0], q[1]);
      const c = avg(p[0], p[1]);
      if (c) { pr.push(c[0]); pg.push(c[1]); pb.push(c[2]); }
    }
    if (pr.length < 6) return null;
    const hi = (a) => a.sort((x, y) => x - y)[Math.floor(a.length * 0.75)];
    const wr = hi(pr) || 1, wg = hi(pg) || 1, wb = hi(pb) || 1;
    if (this.ref) return this.measureWhole((q) => { const p = project(H, q[0], q[1]); return avg(p[0], p[1]); }, wr, wg, wb);
    const n = this.zones.length;
    const seen = new Uint32Array(n), right = new Uint32Array(n), coloured = new Uint32Array(n);
    for (const c of this.cells) {
      const p = project(H, c.p[0], c.p[1]);
      const v = avg(p[0], p[1]);
      if (!v) continue;
      const f = family(Math.min(v[0] / wr, 1), Math.min(v[1] / wg, 1), Math.min(v[2] / wb, 1));
      seen[c.z]++;
      if (f && f !== 9) coloured[c.z]++;   // printed lines and shadow read as grey, so grey alone is not colouring
      else if (f === 9 && this.ok[c.z].has(9)) coloured[c.z]++;
      if (this.any ? f !== 0 && f !== 9 : this.ok[c.z].has(f)) right[c.z]++;
    }
    let passed = 0, anyColour = 0, seenArea = 0;
    const lacking = {};
    this.zones.forEach((z, i) => {
      if (seen[i] < z.a * 0.5) return;     // out of view: neither for nor against
      seenArea += z.a;
      anyColour += (coloured[i] / seen[i]) * z.a;
      if (right[i] / seen[i] >= ZONE_PASS) passed += z.a;
      else lacking[z.f] = (lacking[z.f] || 0) + z.a;
    });
    if (seenArea < this.total * 0.7) return null;
    let ask = null;
    for (const f of Object.keys(lacking)) if (!ask || lacking[f] > lacking[ask]) ask = f;
    return { score: passed / seenArea, blank: anyColour / seenArea < 0.1, ask, pass: passed / seenArea >= PAGE_PASS, failing: this.zones.map((z, i) => seen[i] >= z.a * 0.5 && right[i] / seen[i] < ZONE_PASS) };
  }

  // A soft glow over the zones of one colour that still want colouring, drawn on a canvas the size of the zone map
  paintGlow(ctx, colour, failing, ask) {
    const img = ctx.createImageData(this.w, this.h);
    if (this.ref) {
      // what is still white, or another colour, softly shows the colour it has on the colour page
      this.ref.forEach((c, k) => {
        if (this.state[k] !== 1 && this.state[k] !== 3) return;
        const v = parseInt(SHOW[NAMES[c.f]].slice(1), 16);
        img.data[c.i * 4] = v >> 16; img.data[c.i * 4 + 1] = (v >> 8) & 255; img.data[c.i * 4 + 2] = v & 255; img.data[c.i * 4 + 3] = 255;
      });
      ctx.putImageData(img, 0, 0);
      return;
    }
    const c = parseInt(colour.slice(1), 16);
    for (let i = 0; i < this.map.length; i++) {
      const z = this.map[i];
      if (z && failing[z - 1] && (!ask || this.any || this.zones[z - 1].f === ask)) {
        img.data[i * 4] = c >> 16; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
