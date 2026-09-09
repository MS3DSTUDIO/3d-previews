# Model viewer site

Static `<model-viewer>` page for client previews. No build step, no server code.

## Drop-in files

| File | Notes |
|---|---|
| `model.glb` | Blender > File > Export > glTF 2.0 (.glb). Keep under 100 MB (GitHub hard limit). |
| `poster.webp` | Still shown while the GLB downloads. Optional but recommended on mobile. |
| `model.usdz` | Optional. Improves iOS AR fidelity on metallic materials. Set `ios-src` on the tag. |
| `hdri/*.hdr` | Five environments. 1k or 512px is plenty; keep each under ~2 MB. |

Edit the `CONFIG` block near the bottom of `index.html` to rename environments
or rebalance per-HDRI exposure.

## Deploy

Push to a GitHub repo, then Settings > Pages > Source: `main` / root.
`.nojekyll` is present so Pages serves the files verbatim.

## Gotchas

- **Pin the model-viewer version.** The `<script>` tag uses an exact version on purpose.
  `@latest` will eventually break this link without warning.
- **AR needs HTTPS.** Android Scene Viewer will not launch from `file://` or plain http.
  GitHub Pages is https, so it works once deployed.
- **Bake procedural materials.** glTF only carries Principled-BSDF-style setups.
  Procedural noise, node groups and geometry-nodes materials must be baked to textures first.
