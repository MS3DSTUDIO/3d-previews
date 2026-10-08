# Christina Jones · Bedroom - 360° tour

Interactive 360° bedroom tour, day and night, with a photo gallery (Maureen Stevens Design · visualisation MS3DSTUDIO).

Live: https://ms3dstudio.github.io/3d-previews/christina-jones-bedroom/

| File | What it is |
|---|---|
| `index.html` | Viewer page (Pannellum 2.5.6), same UI as the 629 Burdette tour |
| `tour.js` / `tour.json` | Tour data: views, photo hotspots, gallery captions |
| `pano_day.jpg` / `pano_night.jpg` | 6000×3000 equirectangular panoramas |
| `pano_day_m.jpg` / `pano_night_m.jpg` | 4096×2048 copies for phones and low-memory GPUs |
| `still_{day,night}_*.jpg` / `thumb_*` | Gallery photos (9 cameras × day and night) and thumbnails |
| `logo.webp` | Maureen Stevens Design logo (links to maureenstevens.com) |

The Lighting switch (Day / Night) swaps the panorama, and the Photos gallery shows the matching set.
To replace a panorama with a colour-graded version, overwrite both of its files with the same names.
