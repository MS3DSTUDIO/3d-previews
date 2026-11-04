// From the 4 corner markers of a drawing page to where the page is in front of the camera.
// Page coordinates: origin at the centre of the page, width = 1, x right, y up.
export const PAGE_W = 215.9, PAGE_H = 279.4;
const MARK = 13, INSET = 10;
const U = (xmm, ymm) => [(xmm - PAGE_W / 2) / PAGE_W, (PAGE_H / 2 - ymm) / PAGE_W];
const TL = [[INSET, INSET], [PAGE_W - INSET - MARK, INSET], [PAGE_W - INSET - MARK, PAGE_H - INSET - MARK], [INSET, PAGE_H - INSET - MARK]];
// the 4 corners of each of the page's 4 markers, clockwise from its own top-left, as the detector reports them
export const MARKER_POINTS = TL.map(([x, y]) => [U(x, y), U(x + MARK, y), U(x + MARK, y + MARK), U(x, y + MARK)]);
const REF = [[-0.5, PAGE_H / PAGE_W / 2], [0.5, PAGE_H / PAGE_W / 2], [0.5, -PAGE_H / PAGE_W / 2], [-0.5, -PAGE_H / PAGE_W / 2]];

export const pageOfId = (id) => Math.floor(id / 4) + 1;
export const mmToPage = U;

function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    if (Math.abs(A[p][i]) < 1e-12) return null;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

// least-squares homography, page point -> image point; image points are scaled for a stable solve
export function homography(src, dst) {
  let mx = 0, my = 0;
  for (const p of dst) { mx += p[0]; my += p[1]; }
  mx /= dst.length; my /= dst.length;
  let sc = 0;
  for (const p of dst) sc += Math.hypot(p[0] - mx, p[1] - my);
  sc = sc / dst.length || 1;
  const A = Array.from({ length: 8 }, () => new Array(8).fill(0)), b = new Array(8).fill(0);
  const add = (row, rhs) => {
    for (let i = 0; i < 8; i++) {
      b[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) A[i][j] += row[i] * row[j];
    }
  };
  src.forEach(([x, y], i) => {
    const u = (dst[i][0] - mx) / sc, v = (dst[i][1] - my) / sc;
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  });
  const h = solve(A, b);
  if (!h) return null;
  return [sc * h[0] + mx * h[6], sc * h[1] + mx * h[7], sc * h[2] + mx, sc * h[3] + my * h[6], sc * h[4] + my * h[7], sc * h[5] + my, h[6], h[7], 1];
}

export function project(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

function collect(list) {
  const src = [], dst = [];
  for (const m of list) m.corners.forEach((c, k) => { src.push(MARKER_POINTS[m.index][k]); dst.push(c); });
  return { src, dst };
}

function meanError(H, list) {
  const per = list.map((m) => {
    let e = 0;
    m.corners.forEach((c, k) => {
      const q = MARKER_POINTS[m.index][k];
      const p = project(H, q[0], q[1]);
      e += Math.hypot(p[0] - c[0], p[1] - c[1]);
    });
    return e / 4;
  });
  return { per, mean: per.reduce((a, b) => a + b, 0) / per.length };
}

// Are the markers really the printed layout? Returns H using every marker that agrees, or null.
export function fitPage(list) {
  const use = list.slice();
  while (use.length >= 2) {
    const { src, dst } = collect(use);
    const H = homography(src, dst);
    if (!H) return null;
    const { per, mean } = meanError(H, use);
    if (mean < 3) return { H, used: use.length, error: mean };
    let worst = 0;
    per.forEach((e, i) => { if (e > per[worst]) worst = i; });
    use.splice(worst, 1);
  }
  return null;
}

// One marker left (a hand over the rest): move the last known page with it, without letting it tilt wildly.
export function followOne(Hprev, m) {
  const pts = MARKER_POINTS[m.index];
  const pred = pts.map((q) => project(Hprev, q[0], q[1]));
  const cen = (a) => a.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  const c0 = cen(pred), c1 = cen(m.corners);
  if (Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > 80) return null;
  let a = 0, b = 0, n0 = 0;
  pred.forEach((p, i) => {
    const x0 = p[0] - c0[0], y0 = p[1] - c0[1], x1 = m.corners[i][0] - c1[0], y1 = m.corners[i][1] - c1[1];
    a += x0 * x1 + y0 * y1; b += x0 * y1 - y0 * x1; n0 += x0 * x0 + y0 * y0;
  });
  a /= n0; b /= n0;
  const S = [a, -b, c1[0] - a * c0[0] + b * c0[1], b, a, c1[1] - b * c0[0] - a * c0[1], 0, 0, 1];
  const out = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = S[r * 3] * Hprev[c] + S[r * 3 + 1] * Hprev[3 + c] + S[r * 3 + 2] * Hprev[6 + c];
  const k = out[8];
  return out.map((v) => v / k);
}

// One Euro smoothing of the page's 4 corners on screen: steady when the hand is still, quick when it moves
class Euro {
  constructor(minCut = 1.2, beta = 0.02, dCut = 1) { this.minCut = minCut; this.beta = beta; this.dCut = dCut; this.x = null; }
  alpha(cut, dt) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  step(v, dt) {
    if (this.x === null) { this.x = v; this.dx = 0; return v; }
    const d = (v - this.x) / dt;
    const ad = this.alpha(this.dCut, dt);
    this.dx += ad * (d - this.dx);
    const a = this.alpha(this.minCut + this.beta * Math.abs(this.dx), dt);
    this.x += a * (v - this.x);
    return this.x;
  }
}
export class PageFilter {
  constructor() { this.f = Array.from({ length: 8 }, () => new Euro()); this.last = 0; }
  reset() { this.f.forEach((e) => { e.x = null; }); }
  apply(H, now) {
    const dt = Math.max((now - this.last) / 1000, 0.008);
    this.last = now;
    const pts = [];
    REF.forEach((q, i) => {
      const p = project(H, q[0], q[1]);
      pts.push([this.f[2 * i].step(p[0], dt), this.f[2 * i + 1].step(p[1], dt)]);
    });
    return homography(REF, pts);
  }
}

// H in video pixels -> a 4x4 matrix (column order) from page to camera, for a camera looking down -z. f is the lens focal length in video pixels.
export function poseMatrix(H, vw, vh, f) {
  const cx = vw / 2, cy = vh / 2;
  const col = (i) => [(H[i] - cx * H[6 + i]) / f, (H[3 + i] - cy * H[6 + i]) / f, H[6 + i]];
  const h1 = col(0), h2 = col(1), h3 = col(2);
  const len = (v) => Math.hypot(v[0], v[1], v[2]);
  const lam = (len(h1) + len(h2)) / 2 * (h3[2] < 0 ? -1 : 1);
  const r1 = h1.map((v) => v / lam), r2 = h2.map((v) => v / lam), t = h3.map((v) => v / lam);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => { const l = len(v); return v.map((x) => x / l); };
  const z = norm(cross(r1, r2));
  const a = norm([r1[0] + r2[0], r1[1] + r2[1], r1[2] + r2[2]]);
  const b = norm(cross(z, a));
  const R1 = [(a[0] - b[0]) * Math.SQRT1_2, (a[1] - b[1]) * Math.SQRT1_2, (a[2] - b[2]) * Math.SQRT1_2];
  const R2 = [(a[0] + b[0]) * Math.SQRT1_2, (a[1] + b[1]) * Math.SQRT1_2, (a[2] + b[2]) * Math.SQRT1_2];
  // camera frame (x right, y down, z ahead) -> three.js frame (x right, y up, z behind)
  return [R1[0], -R1[1], -R1[2], 0, R2[0], -R2[1], -R2[2], 0, z[0], -z[1], -z[2], 0, t[0], -t[1], -t[2], 1];
}
