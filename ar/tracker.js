// From where the page was found in the picture to where it is in front of the camera; the measuring itself is in track_core.js and tracker_worker.js.
import "./track_core.js";
const TC = self.TC;
export const PAGE_W = TC.PAGE_W, PAGE_H = TC.PAGE_H, MARKER_POINTS = TC.MARKER_POINTS, homography = TC.homography, project = TC.project, fitPage = TC.fitPage, pageOfId = TC.pageOfId, mmToPage = TC.U;
const REF = [[-0.5, PAGE_H / PAGE_W / 2], [0.5, PAGE_H / PAGE_W / 2], [0.5, -PAGE_H / PAGE_W / 2], [-0.5, -PAGE_H / PAGE_W / 2]];

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

// What lens is this phone? A flat page of known shape tells it, once it is seen at an angle: its width and height must come out equal in 3D. Returns the focal length in video pixels, or null when the view gives no answer.
export function focalFrom(H, vw, vh) {
  const cx = vw / 2, cy = vh / 2;
  const a = [H[0] - cx * H[6], H[3] - cy * H[6], H[6]], b = [H[1] - cx * H[7], H[4] - cy * H[7], H[7]];
  const down = a[2] * a[2] - b[2] * b[2];
  if (Math.abs(down) < 0.02) return null;   // looking nearly straight down: no answer in this view
  const f2 = (b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) / down;
  return f2 > 0 ? Math.sqrt(f2) : null;
}

// One Euro smoothing of the page's 4 corners on screen: steady when the hand is still, quick when it moves
class Euro {
  constructor(minCut = 2.5, beta = 0.04, dCut = 1) { this.minCut = minCut; this.beta = beta; this.dCut = dCut; this.x = null; }
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
  // The page's own two directions are kept exactly as measured, not squared up into a perfect rotation. Squaring them up is only right if the lens guess is perfect; kept like this,
  // everything lying on the paper lands exactly where the camera sees the paper, on any phone, from any angle. The lens guess can then only affect how tall things lean, not where they stand.
  const r1 = h1.map((v) => v / lam), r2 = h2.map((v) => v / lam), t = h3.map((v) => v / lam);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => { const l = len(v); return v.map((x) => x / l); };
  const z = norm(cross(r1, r2));
  // camera frame (x right, y down, z ahead) -> three.js frame (x right, y up, z behind)
  return [r1[0], -r1[1], -r1[2], 0, r2[0], -r2[1], -r2[2], 0, z[0], -z[1], -z[2], 0, t[0], -t[1], -t[2], 1];
}
