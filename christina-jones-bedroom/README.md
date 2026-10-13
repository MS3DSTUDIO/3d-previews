# Christina Jones · Bedroom - 360° tour

Interactive 360° bedroom tour with three design versions, day and night, and a photo gallery (Maureen Stevens Design · visualisation MS3DSTUDIO).

Live: https://ms3dstudio.github.io/3d-previews/christina-jones-bedroom/

| File | What it is |
|---|---|
| `index.html` | Viewer page (Pannellum 2.5.6), same UI as the 629 Burdette tour |
| `tour.js` / `tour.json` | Tour data: versions, views, photo hotspots, gallery captions |
| `pano_day.jpg` / `pano_night.jpg` | Original scheme, 6000×3000 equirectangular panoramas |
| `pano_v{1,2,3}_{day,night}.jpg` | Version 1-3 panoramas, 6000×3000 |
| `*_m.jpg` | 4096×2048 copies of each panorama for phones and low-memory GPUs |
| `still_{day,night}_*.jpg` / `thumb_*` | Original scheme gallery photos (9 cameras × day and night) and thumbnails |
| `still_v{1,2,3}_day_*.jpg` / `thumb_v*` | Version 1-3 gallery photos (9 cameras, day) and thumbnails |
| `logo.webp` | Maureen Stevens Design logo (links to maureenstevens.com) |

The Version switch (Original / V1 / V2 / V3) and the Lighting switch (Day / Night) swap the panorama, and the Photos gallery shows the matching set.
Versions 1-3 have day photos only, so at night the gallery shows their day photos.
The page opens on Version 1. A link can open a given option directly, for example `?v=v2&t=night`.
To replace a panorama with a colour-graded version, overwrite both of its files with the same names.
