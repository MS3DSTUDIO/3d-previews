# Virginia Beach · Living Room - 360° tour

Interactive 360° living room tour with two viewing spots and a photo gallery (Maureen Stevens Design · visualisation MS3DSTUDIO).

Live: https://ms3dstudio.github.io/3d-previews/vb-living-room/

| File | What it is |
|---|---|
| `index.html` | Viewer page (Pannellum 2.5.6), same UI as the 629 Burdette kitchen tour, plus a Brightness / Contrast panel (Adjust) |
| `tour.js` / `tour.json` | Tour data: the two spots, their views, the circle that moves between them, photo hotspots, gallery captions |
| `pano_piano.jpg` | Piano Side spot (north end of the large sofa), 6000×3000 equirectangular |
| `pano_fireplace.jpg` | Fireplace Side spot (between the coffee table and the swivel chair), 6000×3000 |
| `*_m.jpg` | 4096×2048 copies for phones and low-memory GPUs |
| `still_*.jpg` / `thumb_*.jpg` | Gallery photos (the 9 v4 renders) and thumbnails |
| `og.jpg` | Link preview image |
| `logo.webp` | Maureen Stevens Design logo (links to maureenstevens.com) |

Both panoramas face north at the centre (yaw 0 = north wall, 90 = east windows, 180 = south).
Adjust (top right) changes brightness and contrast of the 360 and the photos. A link can carry a setting, for example `?b=115&c=105`.
To replace a panorama with a colour-graded version, overwrite both of its files with the same names.

## Updates

- 11/09: raised hearth and new fireplace styling (both 360s re-rendered), new photos 11 (white console with stools) and 08B (bar sink and art).
