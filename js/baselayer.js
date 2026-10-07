// Base layer: an image, looping video, or 3D model rendered centred into an
// offscreen target with user scale / position / rotation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const IMG = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;
const VID = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i;
const MODEL = /\.(glb|gltf|obj|stl|fbx)$/i;

export function classify(file) {
  const n = file.name || '';
  if (file.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(n) && !VID.test(n)) return 'audio';
  if (file.type.startsWith('video/') || VID.test(n)) return 'video';
  if (file.type.startsWith('image/') || IMG.test(n)) return 'image';
  if (MODEL.test(n)) return 'model';
  return null;
}

export class BaseLayer {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, stencilBuffer: false, type: THREE.UnsignedByteType });
    this.rt.texture.colorSpace = THREE.NoColorSpace;
    this.aspect = 1;

    this.scene2d = new THREE.Scene();
    this.cam2d = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.cam2d.position.z = 1;
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));
    this.scene2d.add(this.plane);

    this.scene3d = new THREE.Scene();
    this.cam3d = new THREE.PerspectiveCamera(40, 1, .01, 100);
    this.cam3d.position.z = 3.2;
    this.scene3d.add(new THREE.HemisphereLight(0xffffff, 0x303040, 2));
    const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(2, 3, 4); this.scene3d.add(key);
    this.rim = new THREE.PointLight(0x00f0c8, 20, 20); this.rim.position.set(-3, 1, 2); this.scene3d.add(this.rim);
    this.group = new THREE.Group();
    this.scene3d.add(this.group);

    this.kind = null;         // 'image' | 'video' | 'model'
    this.name = '';
    this.texture = null;
    this.video = null;
    this.model = null;
    this.spinAngle = 0;
    this.transform = { x: 0, y: 0, scale: 1, rot: 0, opacity: 1, pulse: .25, spin: .3, preserve: .3 };
    this.onChange = null;
  }

  get active() { return this.kind !== null; }
  get linear() { return this.kind === 'model'; }
  get preserve() { return this.active ? this.transform.preserve : 0; }
  get rtTexture() { return this.rt.texture; }

  resize(w, h) { this.rt.setSize(w, h); this.aspect = w / h; this.cam3d.aspect = this.aspect; this.cam3d.updateProjectionMatrix(); this.cam2d.left = -this.aspect; this.cam2d.right = this.aspect; this.cam2d.updateProjectionMatrix(); }

  resetTransform() { Object.assign(this.transform, { x: 0, y: 0, scale: 1, rot: 0 }); this._changed(); }
  _changed() { if (this.onChange) this.onChange(this); }

  clear() {
    if (this.texture) { this.texture.dispose(); this.texture = null; }
    if (this.video) { this.video.pause(); if (this.video.src.startsWith('blob:')) URL.revokeObjectURL(this.video.src); this.video = null; }
    if (this.model) { this.group.remove(this.model); this.model.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.model = null; }
    this.kind = null; this.name = '';
    this._changed();
  }

  async load(file) {
    const kind = classify(file);
    if (!kind || kind === 'audio') throw new Error(`Unsupported file: ${file.name}`);
    if (kind === 'image') await this._loadImage(file);
    else if (kind === 'video') await this._loadVideo(file);
    else await this._loadModel(file);
    this.name = file.name;
    this._changed();
  }

  async _loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not decode image')); i.src = url; });
      this.clear();
      const tex = new THREE.Texture(img); tex.needsUpdate = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
      this.texture = tex; this.imgAspect = img.width / img.height;
      this.plane.material.map = tex; this.plane.material.needsUpdate = true;
      this.kind = 'image';
    } finally { URL.revokeObjectURL(url); }
  }

  async _loadVideo(file) {
    const v = document.createElement('video');
    v.src = URL.createObjectURL(file); v.loop = true; v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('Could not decode video')); });
    this.clear();
    await v.play().catch(() => {});
    const tex = new THREE.VideoTexture(v); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    this.video = v; this.texture = tex; this.imgAspect = v.videoWidth / v.videoHeight || 1;
    this.plane.material.map = tex; this.plane.material.needsUpdate = true;
    this.kind = 'video';
  }

  async _loadModel(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const url = URL.createObjectURL(file);
    let obj;
    try {
      if (ext === 'glb' || ext === 'gltf') obj = (await new GLTFLoader().loadAsync(url)).scene;
      else if (ext === 'obj') obj = await new OBJLoader().loadAsync(url);
      else if (ext === 'fbx') obj = await new FBXLoader().loadAsync(url);
      else if (ext === 'stl') obj = new THREE.Mesh(await new STLLoader().loadAsync(url));
    } finally { URL.revokeObjectURL(url); }
    const fallback = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: .35, roughness: .45 });
    obj.traverse(o => {
      if (o.isMesh) {
        if (!o.material || (Array.isArray(o.material) ? o.material.some(m => !m.isMaterial) : !o.material.isMaterial) || ext === 'stl' || ext === 'obj') {
          if (!o.material || ext === 'stl' || (ext === 'obj' && !o.material.map)) o.material = fallback;
        }
        if (o.geometry && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      }
    });
    // Normalise: centre on origin, fit in a unit sphere.
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * .5 || 1;
    const holder = new THREE.Group();
    obj.position.sub(center);
    holder.add(obj);
    holder.scale.setScalar(1 / radius);
    this.clear();
    this.model = holder; this.group.add(holder);
    this.kind = 'model';
  }

  render(audio, beat, dt) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    if (!this.kind) { r.setRenderTarget(null); return; }
    const t = this.transform;
    const pulse = 1 + t.pulse * .35 * audio.x + t.pulse * .15 * beat;
    const s = t.scale * pulse;
    if (this.kind === 'model') {
      this.spinAngle += t.spin * dt * (1 + audio.w * .6) + beat * dt * 2;
      const vis = 2 * 3.2 * Math.tan(THREE.MathUtils.degToRad(20)) * .5; // half visible height at z=0
      this.group.position.set(t.x * vis * this.aspect, t.y * vis, 0);
      this.group.scale.setScalar(s * .85);
      this.group.rotation.set(THREE.MathUtils.degToRad(t.rot) * .5, this.spinAngle, THREE.MathUtils.degToRad(t.rot));
      this.rim.color.setHSL((performance.now() * .00005) % 1, .8, .5);
      this.rim.intensity = 10 + 30 * audio.x;
      r.render(this.scene3d, this.cam3d);
    } else {
      const ia = this.imgAspect || 1;
      let h = 2 * .8, w = h * ia;
      if (w > 2 * this.aspect * .8) { w = 2 * this.aspect * .8; h = w / ia; }
      this.plane.scale.set(w * s, h * s, 1);
      this.plane.position.set(t.x * this.aspect, t.y, 0);
      this.plane.rotation.z = -THREE.MathUtils.degToRad(t.rot);
      r.render(this.scene2d, this.cam2d);
    }
    r.setRenderTarget(null);
  }
}
