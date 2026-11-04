// Finds the printed corner markers in a camera frame, away from the drawing thread so the story never stutters.
importScripts("vendor/aruco/cv.js", "vendor/aruco/aruco.js", "vendor/aruco/ld_dict.js");
const detector = new AR.Detector({ dictionaryName: "LD" });
self.onmessage = (e) => {
  const { buf, w, h, t } = e.data;
  const t0 = performance.now();
  const data = new Uint8ClampedArray(buf);
  const found = detector.detect({ width: w, height: h, data });
  const markers = found.map((m) => ({ id: m.id, corners: m.corners.map((c) => [c.x, c.y]) }));
  self.postMessage({ markers, t, ms: performance.now() - t0, buf }, [buf]);
};
