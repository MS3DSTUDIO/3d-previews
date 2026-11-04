// The geometry shared by the page and the tracking worker. A plain script on purpose: the worker loads it with importScripts, tracker.js with import. Everything hangs on self.TC.
// Page coordinates: origin at the centre of the page, width = 1, x right, y up.
(function () {
  const PAGE_W = 215.9, PAGE_H = 279.4;
  const MARK = 13, INSET = 10;
  const U = (xmm, ymm) => [(xmm - PAGE_W / 2) / PAGE_W, (PAGE_H / 2 - ymm) / PAGE_W];
  const TL = [[INSET, INSET], [PAGE_W - INSET - MARK, INSET], [PAGE_W - INSET - MARK, PAGE_H - INSET - MARK], [INSET, PAGE_H - INSET - MARK]];
  // the 4 corners of each of the page's 4 markers, clockwise from its own top-left, as the detector reports them
  const MARKER_POINTS = TL.map(([x, y]) => [U(x, y), U(x + MARK, y), U(x + MARK, y + MARK), U(x, y + MARK)]);

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
  function homography(src, dst) {
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

  function project(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  }

  function invert(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-14) return null;
    return [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, (c * d - a * f) / det, C / det, (b * g - a * h) / det, (a * e - b * d) / det];
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
  function fitPage(list) {
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

  self.TC = { PAGE_W, PAGE_H, MARKER_POINTS, U, homography, project, invert, fitPage, pageOfId: (id) => Math.floor(id / 4) + 1 };
})();
