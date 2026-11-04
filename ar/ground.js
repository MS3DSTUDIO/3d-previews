// What makes a 3D figure sit ON the paper instead of floating over it: a sun casting a real shadow across the page, and a soft dark contact where things touch the paper.
// All of it lives in page coordinates (width = 1, x right, y up the page, z out of the paper), so the shadow stays put when the phone moves.
import * as THREE from "three";

const SUN_FROM = [-0.45, -0.3, 1];     // from the viewer's left and front, so faces stay lit and the shadow falls away behind the figure
const REACH_X = 0.56, REACH_Y = 0.72;  // half the page plus a little
const CONTACT_H = 0.3;                 // things higher than this above the paper (about 65 mm) leave no contact shadow

const BLUR = {
  uniforms: { map: { value: null }, step: { value: new THREE.Vector2() } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `uniform sampler2D map; uniform vec2 step; varying vec2 vUv;
    void main() {
      vec4 s = texture2D(map, vUv) * 0.227;
      s += (texture2D(map, vUv + step * 1.385) + texture2D(map, vUv - step * 1.385)) * 0.316;
      s += (texture2D(map, vUv + step * 3.231) + texture2D(map, vUv - step * 3.231)) * 0.070;
      gl_FragColor = s;
    }`,
};

export class PageGround {
  constructor(renderer, scene, anchor) {
    this.renderer = renderer; this.scene = scene;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // the sun and its shadow on the paper
    const sun = new THREE.DirectionalLight(0xfff4e6, 2.1);
    sun.position.fromArray(SUN_FROM).multiplyScalar(1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = -0.95; c.right = 0.95; c.top = 0.95; c.bottom = -0.95; c.near = 0.1; c.far = 3.5;
    sun.shadow.radius = 2;   // soft edge about 4 mm on the page; much more and a thin figure's legs wash out
    sun.shadow.bias = -0.0006;
    anchor.add(sun, sun.target);
    this.sun = sun;
    const size = [REACH_X * 2, REACH_Y * 2];
    // wider than the page: a tall tree's shadow carries on over the table the paper lies on, it does not stop at a hard edge
    this.onPaper = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.ShadowMaterial({ color: 0x2b2118, opacity: 0.38, depthWrite: false }));
    this.onPaper.position.z = 0.0012;
    this.onPaper.receiveShadow = true;
    this.onPaper.renderOrder = 2;
    anchor.add(this.onPaper);

    // the contact: the scene seen from under the paper, darker the lower it is, then blurred
    const opt = { depthBuffer: false, type: THREE.UnsignedByteType };
    const w = 256, h = Math.round((256 * REACH_Y) / REACH_X);
    this.rtA = new THREE.WebGLRenderTarget(w, h, { ...opt, depthBuffer: true });
    this.rtB = new THREE.WebGLRenderTarget(w, h, opt);
    this.rtC = new THREE.WebGLRenderTarget(w, h, opt);
    this.look = new THREE.OrthographicCamera(-REACH_X, REACH_X, REACH_Y, -REACH_Y, 0, CONTACT_H);
    this.look.rotation.x = Math.PI;   // from under the page, looking up out of it
    anchor.add(this.look);
    const depth = new THREE.MeshDepthMaterial();
    depth.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace("gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );", "gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 1.5 ) );");
    };
    this.depth = depth;
    this.blur = new THREE.ShaderMaterial({ ...BLUR, uniforms: THREE.UniformsUtils.clone(BLUR.uniforms), depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blur);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.Camera();
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ map: this.rtC.texture, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }));
    this.contact.scale.y = -1;   // the camera under the page sees it upside down
    this.contact.position.z = 0.0008;
    this.contact.renderOrder = 1;
    anchor.add(this.contact);
    this.tick = 0;
    this.slow = 0;
  }

  pass(input, output, dx, dy) {
    this.blur.uniforms.map.value = input.texture;
    this.blur.uniforms.step.value.set(dx / input.width, dy / input.height);
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // call once a frame before the real render. hide = other flat things on the page that must not leave a contact (the glow)
  update(hide, frameMs) {
    // a phone that struggles keeps the contact and drops the sun's shadow map: the story must stay smooth
    this.slow = this.slow * 0.97 + (frameMs > 55 ? 0.03 : 0);
    if (this.slow > 0.6 && this.sun.castShadow) {
      this.sun.castShadow = false;
      this.onPaper.visible = false;
      this.renderer.shadowMap.enabled = false;
      window.__ar && (window.__ar.sunOff = true);
    }
    if (this.tick++ % 2) return;   // the contact changes slowly: every second frame is plenty
    const r = this.renderer;
    const auto = r.shadowMap.autoUpdate;
    const alpha = r.getClearAlpha();
    const was = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    this.contact.visible = false;
    this.onPaper.visible = false;
    r.shadowMap.autoUpdate = false;
    r.setClearAlpha(0);
    this.scene.overrideMaterial = this.depth;
    r.setRenderTarget(this.rtA);
    r.clear();
    r.render(this.scene, this.look);
    this.scene.overrideMaterial = null;
    this.pass(this.rtA, this.rtB, 1.6, 0);
    this.pass(this.rtB, this.rtC, 0, 1.6);
    r.setRenderTarget(null);
    r.setClearAlpha(alpha);
    r.shadowMap.autoUpdate = auto;
    hide.forEach((o, i) => { o.visible = was[i]; });
    this.contact.visible = true;
    this.onPaper.visible = this.sun.castShadow;
  }
}
