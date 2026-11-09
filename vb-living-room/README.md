# Virginia Beach · Living Room - 360° tour

Interactive 360° living room tour with two viewing spots and a photo gallery (Maureen Stevens Design · visualisation MS3DSTUDIO).

Live: https://ms3dstudio.github.io/3d-previews/vb-living-room/

| File | What it is |
|---|---|
| `index.html` | Viewer page (Pannellum 2.5.6), same UI as the 629 Burdette kitchen tour, plus an Adjust panel (brightness, contrast, clarity, texture) |
| `tour.js` / `tour.json` | Tour data: the two spots, their views, the circle that moves between them, photo hotspots, gallery captions |
| `pano_piano.jpg` | Piano Side spot (by the sunroom arch, facing the piano, with the white console and stools in view), 6000×3000 equirectangular |
| `pano_fireplace.jpg` | Fireplace Side spot (between the coffee table and the swivel chair), 6000×3000 |
| `*_m.jpg` | 4096×2048 copies for phones and low-memory GPUs |
| `still_*.jpg` / `thumb_*.jpg` | Gallery photos (the 11 v6 renders) and thumbnails |
| `og.jpg` | Link preview image |
| `logo.webp` | Maureen Stevens Design logo (links to maureenstevens.com) |

Both panoramas face north at the centre (yaw 0 = north wall, 90 = east windows, 180 = south).
Adjust (top right) sets brightness (lifts the scene without clipping highlights), contrast, clarity and texture for the 360 and the photos. A link can carry a setting, for example `?br=20&ct=10&cl=40&tx=30`.
To replace a panorama with a colour-graded version, overwrite both of its files with the same names.

## Updates

- 11/09: raised hearth and new fireplace styling (both 360s re-rendered), new photos 11 (white console with stools) and 08B (bar sink and art).
- 11/09 (round 2): bar upper cabinets now run the full side wall to the curtain and up to the ceiling (glass doors plus a solid end door), sink and faucet moved to the bar-cart side with the landscape art beside it, fireplace mantel and surround rebuilt from the site photo, Piano Side 360 moved to the arch so the white console and stools are in view; all 11 photos and both 360s re-rendered.
