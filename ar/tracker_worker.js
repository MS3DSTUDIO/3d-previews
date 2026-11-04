// Holds the page steady, away from the drawing thread so the story never stutters.
// The 4 printed markers only say WHERE the page is and which page it is. After that, about a hundred points of the drawing itself are followed from frame to frame:
// they cover the whole page, so the pose is far steadier than from 4 tiny squares, and the page stays locked when a marker is cropped or a hand covers it.
importScripts("vendor/aruco/cv.js", "vendor/aruco/aruco.js", "vendor/aruco/ld_dict.js", "track_core.js");
const { homography, project, invert, fitPage, pageOfId, PAGE_W, PAGE_H, MARKER_POINTS } = self.TC;
const detector = new AR.Detector({ dictionaryName: "LD" });

const LEVELS = 4, WIN = 5, MAX_POINTS = 90, MIN_POINTS = 50, MIN_INLIERS = 12, CHECK_EVERY = 12;
const HW = 0.5, HH = (0.5 * PAGE_H) / PAGE_W;

// ---- image pyramid: level 0 is half the camera size, each next level half again
function makePyramid(rgba, w, h, old) {
  const pyr = old && old[0].w === w >> 1 && old[0].h === h >> 1 ? old : [];
  let lw = w >> 1, lh = h >> 1;
  for (let l = 0; l < LEVELS; l++) {
    if (!pyr[l]) pyr[l] = { w: lw, h: lh, d: new Uint8Array(lw * lh) };
    lw >>= 1; lh >>= 1;
  }
  const L0 = pyr[0].d, W0 = pyr[0].w, H0 = pyr[0].h, row = w * 4;
  for (let y = 0; y < H0; y++) {
    let i = 2 * y * row, o = y * W0;
    for (let x = 0; x < W0; x++, i += 8, o++) {
      // green carries nearly all the sharpness and costs nothing; the 2x2 average takes out sensor noise
      L0[o] = (rgba[i + 1] + rgba[i + 5] + rgba[i + row + 1] + rgba[i + row + 5] + 2) >> 2;
    }
  }
  for (let l = 1; l < LEVELS; l++) {
    const a = pyr[l - 1], b = pyr[l];
    for (let y = 0; y < b.h; y++) {
      let i = 2 * y * a.w, o = y * b.w;
      for (let x = 0; x < b.w; x++, i += 2, o++) b.d[o] = (a.d[i] + a.d[i + 1] + a.d[i + a.w] + a.d[i + a.w + 1] + 2) >> 2;
    }
  }
  return pyr;
}

// ---- Lucas-Kanade: where did this small patch go?
const n = (2 * WIN + 1) * (2 * WIN + 1), SIDE = 2 * WIN + 3;
const grid = new Float32Array(SIDE * SIDE), patch = new Float32Array(n), gx = new Float32Array(n), gy = new Float32Array(n);
// follow one point from prev to cur; (x, y) and the result are in level 0 pixels; returns [x, y, residual] or null
function follow(prev, cur, x, y, gxIn, gyIn, top) {
  let ux = gxIn, uy = gyIn;   // first guess of the motion, level 0 pixels
  let res = 0;
  for (let l = top; l >= 0; l--) {
    const s = 1 / (1 << l), P = prev[l], C = cur[l];
    const px = x * s, py = y * s;
    if (px < WIN + 2 || py < WIN + 2 || px > P.w - WIN - 3 || py > P.h - WIN - 3) { if (l === 0) return null; continue; }
    // the patch once, with one pixel extra all round for its slopes
    const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0, A = (1 - fx) * (1 - fy), B = fx * (1 - fy), D = (1 - fx) * fy, E = fx * fy;
    let g = 0;
    const pd = P.d, pw = P.w;
    for (let dy = -WIN - 1; dy <= WIN + 1; dy++) {
      let i = (y0 + dy) * pw + x0 - WIN - 1;
      for (let dx = 0; dx < SIDE; dx++, i++, g++) grid[g] = A * pd[i] + B * pd[i + 1] + D * pd[i + pw] + E * pd[i + pw + 1];
    }
    let a = 0, b = 0, c = 0, k = 0;
    for (let r = 1; r < SIDE - 1; r++) for (let q = 1; q < SIDE - 1; q++, k++) {
      const o = r * SIDE + q;
      const ix = (grid[o + 1] - grid[o - 1]) / 2, iy = (grid[o + SIDE] - grid[o - SIDE]) / 2;
      patch[k] = grid[o]; gx[k] = ix; gy[k] = iy;
      a += ix * ix; b += ix * iy; c += iy * iy;
    }
    const det = a * c - b * b;
    if (det < 1e-3 * (a + c) * (a + c) || a + c < 100) { if (l === 0) return null; continue; }
    let vx = ux * s, vy = uy * s;
    const cd = C.d, cw = C.w;
    for (let it = 0; it < 5; it++) {
      const qx = px + vx, qy = py + vy;
      if (qx < WIN + 1 || qy < WIN + 1 || qx > C.w - WIN - 2 || qy > C.h - WIN - 2) return null;
      const X0 = qx | 0, Y0 = qy | 0, FX = qx - X0, FY = qy - Y0, A2 = (1 - FX) * (1 - FY), B2 = FX * (1 - FY), D2 = (1 - FX) * FY, E2 = FX * FY;
      let e1 = 0, e2 = 0;
      k = 0; res = 0;
      for (let dy = -WIN; dy <= WIN; dy++) {
        let i = (Y0 + dy) * cw + X0 - WIN;
        for (let dx = -WIN; dx <= WIN; dx++, k++, i++) {
          const diff = patch[k] - (A2 * cd[i] + B2 * cd[i + 1] + D2 * cd[i + cw] + E2 * cd[i + cw + 1]);
          e1 += diff * gx[k]; e2 += diff * gy[k]; res += diff < 0 ? -diff : diff;
        }
      }
      const dvx = (c * e1 - b * e2) / det, dvy = (a * e2 - b * e1) / det;
      vx += dvx; vy += dvy;
      if (dvx * dvx + dvy * dvy < 0.0025) break;
    }
    ux = vx / s; uy = vy / s;
  }
  return [x + ux, y + uy, res / n];
}

// ---- points worth following: strong corners of the drawing, spread evenly over the page
function findPoints(im, H, have) {
  const HI = invert(H);
  if (!HI) return [];
  const toLevel = (q) => [q[0] / 2, q[1] / 2];
  const CW = 28, cols = Math.floor(im.w / CW), rows = Math.floor(im.h / CW);
  const taken = new Uint8Array(cols * rows);
  for (const p of have) {
    const c = Math.floor(p.x / CW), r = Math.floor(p.y / CW);
    if (c >= 0 && r >= 0 && c < cols && r < rows) taken[r * cols + c] = 1;
  }
  const out = [], d = im.d, W = im.w;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (taken[r * cols + c]) continue;
    let best = 0, bx = 0, by = 0;
    for (let y = Math.max(r * CW, WIN + 4); y < Math.min((r + 1) * CW, im.h - WIN - 4); y += 2) for (let x = Math.max(c * CW, WIN + 4); x < Math.min((c + 1) * CW, W - WIN - 4); x += 2) {
      let a = 0, b = 0, e = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const i = (y + dy) * W + x + dx;
        const ix = d[i + 1] - d[i - 1], iy = d[i + W] - d[i - W];
        a += ix * ix; b += ix * iy; e += iy * iy;
      }
      const lam = (a + e - Math.sqrt((a - e) * (a - e) + 4 * b * b)) / 2;   // the weaker direction: a straight line scores low, a corner high
      if (lam > best) { best = lam; bx = x; by = y; }
    }
    if (best < 4000) continue;
    const q = project(HI, bx * 2, by * 2);
    // only on the printed page, and away from its very edge (what lies beyond is the table)
    if (Math.abs(q[0]) > HW - 0.015 || Math.abs(q[1]) > HH - 0.015) continue;
    out.push({ x: bx, y: by, px: q[0], py: q[1], bad: 0, s: best });
  }
  out.sort((a, b) => b.s - a.s);
  return out;
}

// ---- a page pose that most points agree with; a hand or a blurred point cannot pull it away
function robustFit(pts, Hguess) {
  const N = pts.length;
  if (N < 8) return null;
  const err = (H, p) => {
    const q = project(H, p.px, p.py);
    return Math.hypot(q[0] - p.x * 2, q[1] - p.y * 2);
  };
  let bestH = null, bestCount = -1;
  const tryH = (H) => {
    if (!H) return;
    let count = 0;
    for (const p of pts) if (err(H, p) < 5) count++;
    if (count > bestCount) { bestCount = count; bestH = H; }
  };
  tryH(Hguess);
  for (let it = 0; it < 40 && bestCount < N * 0.9; it++) {
    const pick = [];
    while (pick.length < 4) {
      const p = pts[Math.floor(Math.random() * N)];
      if (!pick.includes(p)) pick.push(p);
    }
    tryH(homography(pick.map((p) => [p.px, p.py]), pick.map((p) => [p.x * 2, p.y * 2])));
  }
  if (!bestH) return null;
  // polish on all that agree, tightening once
  let H = bestH;
  for (const tol of [5, 3]) {
    const use = pts.filter((p) => err(H, p) < tol);
    if (use.length < 8) break;
    const h = homography(use.map((p) => [p.px, p.py]), use.map((p) => [p.x * 2, p.y * 2]));
    if (h) H = h;
  }
  let inliers = 0, minX = 9, maxX = -9, minY = 9, maxY = -9;
  for (const p of pts) {
    p.ok = err(H, p) < 3;
    p.bad = p.ok ? 0 : p.bad + 1;
    if (p.ok) { inliers++; minX = Math.min(minX, p.px); maxX = Math.max(maxX, p.px); minY = Math.min(minY, p.py); maxY = Math.max(maxY, p.py); }
  }
  return { H, inliers, spread: Math.min(maxX - minX, (maxY - minY) / 1.3) };
}

// ---- markers
function detectAll(rgba, w, h) {
  const found = detector.detect({ width: w, height: h, data: rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer) });
  return found.map((m) => ({ id: m.id, corners: m.corners.map((c) => [c.x, c.y]) }));
}
const crops = {};
// look only where the markers should be: much faster than the whole frame, same sharpness
function detectNear(rgba, w, h, H, page) {
  const out = [];
  MARKER_POINTS.forEach((pts, k) => {
    const q = pts.map((p) => project(H, p[0], p[1]));
    const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - size * 0.7)), y0 = Math.max(0, Math.floor(Math.min(...ys) - size * 0.7));
    const x1 = Math.min(w, Math.ceil(Math.max(...xs) + size * 0.7)), y1 = Math.min(h, Math.ceil(Math.max(...ys) + size * 0.7));
    const cw = x1 - x0, ch = y1 - y0;
    if (cw < size || ch < size || cw < 24 || ch < 24 || Math.min(...xs) < 1 || Math.min(...ys) < 1 || Math.max(...xs) > w - 2 || Math.max(...ys) > h - 2) return;
    const need = cw * ch * 4;
    if (!crops[k] || crops[k].length !== need) crops[k] = new Uint8ClampedArray(need);
    const c = crops[k];
    for (let y = 0; y < ch; y++) c.set(rgba.subarray((y + y0) * w * 4 + x0 * 4, (y + y0) * w * 4 + x1 * 4), y * cw * 4);
    for (const m of detectAll(c, cw, ch)) {
      if (pageOfId(m.id) === page && m.id % 4 === k) out.push({ index: k, corners: m.corners.map((p) => [p[0] + x0, p[1] + y0]) });
    }
  });
  return out;
}

// ---- the tracker
let prevPyr = null, spare = null, points = [], Hcur = null, tracking = false, frame = 0, confirm = 0, lastTracked = -999, seedMarkers = 0, velocity = [0, 0], shaken = false;

function seed(H, pyr, count) {
  Hcur = H;
  tracking = true;
  seedMarkers = count;
  velocity = [0, 0];
  points = findPoints(pyr[0], H, []).slice(0, MAX_POINTS);
  if (points.length < MIN_INLIERS) { tracking = false; points = []; }
}

function step(rgba, w, h, page) {
  frame++;
  const pyr = makePyramid(rgba, w, h, spare);
  let others = {}, H = null, inliers = 0, markerCount = null;

  if (tracking) {
    const moved = [];
    const dxs = [], dys = [];
    // the coarse levels are only for fast moves: a steady hand does not need them
    const fast = Math.hypot(velocity[0], velocity[1]);
    const top = shaken || fast > 10 ? LEVELS - 1 : fast > 3 ? 2 : 1;
    for (const p of points) {
      const r = follow(prevPyr, pyr, p.x, p.y, velocity[0], velocity[1], top);
      if (!r || r[2] > 26) continue;
      dxs.push(r[0] - p.x); dys.push(r[1] - p.y);
      p.x = r[0]; p.y = r[1];
      moved.push(p);
    }
    shaken = moved.length < points.length * 0.7;
    if (dxs.length) {
      dxs.sort((a, b) => a - b); dys.sort((a, b) => a - b);
      velocity = [dxs[dxs.length >> 1], dys[dys.length >> 1]];
    }
    const fit = robustFit(moved, Hcur);
    // enough of the page must agree: a few points on a hand are not the page
    if (fit && fit.inliers >= MIN_INLIERS && fit.spread > 0.22) {
      H = Hcur = fit.H;
      inliers = fit.inliers;
      points = moved.filter((p) => p.bad < 3);
      lastTracked = frame;
      if (points.length < MIN_POINTS || frame % 20 === 0) {
        if (points.length < MAX_POINTS) points = points.concat(findPoints(pyr[0], H, points).slice(0, MAX_POINTS - points.length));
      }
      // now and then the markers check that the drawing's points have not slowly slid
      if (frame % CHECK_EVERY === 0) {
        const list = detectNear(rgba, w, h, H, page);
        markerCount = list.length;
        const r = list.length >= 2 ? fitPage(list) : null;
        if (r) {
          let off = 0;
          for (const m of list) for (const q of MARKER_POINTS[m.index]) {
            const a = project(H, q[0], q[1]), b = project(r.H, q[0], q[1]);
            off += Math.hypot(a[0] - b[0], a[1] - b[1]);
          }
          off /= list.length * 4;
          const reseed = off > 12 || (list.length === 4 && seedMarkers < 4);
          if (reseed) {
            H = r.H;
            seed(H, pyr, list.length);
            if (!tracking) H = null;
          } else if (list.length >= 3 && off < 5) {
            // a small pull toward what the markers say, so an error at the start fades instead of staying for ever
            const HI = invert(r.H);
            if (HI) for (const p of points) {
              const q = project(HI, p.x * 2, p.y * 2);
              p.px += 0.04 * (q[0] - p.px); p.py += 0.04 * (q[1] - p.py);
            }
          }
        }
      }
    } else {
      tracking = false;
      points = [];
    }
  }

  if (!tracking) {
    const all = detectAll(rgba, w, h);
    const mine = [];
    for (const m of all) {
      const p = pageOfId(m.id);
      if (p === page) mine.push({ index: m.id % 4, corners: m.corners });
      else others[p] = (others[p] || 0) + 1;
    }
    markerCount = mine.length;
    const r = mine.length >= 2 ? fitPage(mine) : null;
    if (r) {
      confirm++;
      // first sight: two frames in a row, so a chance look-alike in a picture can never start anything
      if (confirm >= 2 || frame - lastTracked < 45) {
        seed(r.H, pyr, r.used);
        if (tracking) { H = r.H; lastTracked = frame; }
      }
    } else confirm = 0;
  } else confirm = 0;

  spare = prevPyr;
  prevPyr = pyr;
  return { H, inliers, others, markers: markerCount, points: points.length };
}

self.onmessage = (e) => {
  const { buf, w, h, t, page } = e.data;
  const t0 = performance.now();
  const r = step(new Uint8ClampedArray(buf), w, h, page);
  r.t = t;
  r.ms = performance.now() - t0;
  self.postMessage(r);
};
