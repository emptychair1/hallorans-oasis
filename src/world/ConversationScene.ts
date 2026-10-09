import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { unzipSync } from 'fflate';
import { WalkControls } from './WalkControls';

const BASE = '/assets/models/';
const ASSETS = {
  sky: 'nebula_skybox_16k.glb',
  chair: 'aeroshell_glide_chair_b.glb',
  table: 'elegant_dining_table_set.glb',
  lamp: 'old_table_lamp_v03.glb',
  piper: 'free_stylized_cartoon_girl_rigged_character.glb'
} as const;

export class ConversationScene {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(64, 1, 0.05, 2000);
  private renderer: THREE.WebGLRenderer;
  private loader = new GLTFLoader();
  private frame: number | null = null;
  private disposed = false;
  private readonly controls: WalkControls;
  private assets: THREE.Object3D[] = [];
  private readonly onResize = () => this.resize();

  constructor(private mount: HTMLElement) {
    this.scene.background = new THREE.Color(0x030308);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    mount.appendChild(this.renderer.domElement);
    this.camera.position.set(-1.25, 1.70, 0.65);
    this.camera.lookAt(1.25, 1.12, -0.3);
    this.controls = new WalkControls(this.mount, this.camera);
    this.controls.setBounds(new THREE.Box3(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 4, 8)));
    this.scene.add(new THREE.HemisphereLight(0xdce5ff, 0x17101a, 2));
    const warm = new THREE.PointLight(0xffc28a, 28, 9);
    warm.position.set(1.2, 2.5, 0.5);
    this.scene.add(warm);
    const fill = new THREE.DirectionalLight(0xb6c7ff, 2);
    fill.position.set(-4, 6, 4);
    this.scene.add(fill);

    // Tiles074 floor audition. Decode the approved ZIP in-browser without
    // modifying the uploaded source asset or requiring manual extraction.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.22, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    this.scene.add(floor);
    this.assets.push(floor);
    void this.loadTilesFloor(floor);

    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    this.resize();
  }

  private async loadTilesFloor(floor: THREE.Mesh): Promise<void> {
    try {
      const response = await fetch('/assets/models/Tiles074_2K-JPG.zip');
      if (!response.ok) throw new Error('Tiles074 ZIP HTTP ' + response.status);
      const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
      const entries = Object.entries(files).filter(([name]) => /\.(jpe?g|png)$/i.test(name));
      const find = (pattern: RegExp) => entries.find(([name]) => pattern.test(name))?.[1];
      const color = find(/(?:color|diffuse|albedo)\.(?:jpe?g|png)$/i);
      const normal = find(/normal(?:gl|dx)?\.(?:jpe?g|png)$/i);
      const rough = find(/roughness\.(?:jpe?g|png)$/i);
      const ao = find(/(?:ambientocclusion|_ao)\.(?:jpe?g|png)$/i);
      if (!color) throw new Error('Tiles074 ZIP contains no recognized color map: ' + entries.map(([n]) => n).join(', '));
      const loader = new THREE.TextureLoader();
      const load = async (bytes: Uint8Array, srgb = false): Promise<THREE.Texture> => {
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
        try {
          const texture = await loader.loadAsync(url);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(18, 18);
          texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
          return texture;
        } finally { URL.revokeObjectURL(url); }
      };
      const material = new THREE.MeshStandardMaterial({
        map: await load(color, true),
        normalMap: normal ? await load(normal) : null,
        roughnessMap: rough ? await load(rough) : null,
        aoMap: ao ? await load(ao) : null,
        color: 0xffffff,
        roughness: 0.24,
        metalness: 0.06,
      });
      if (this.disposed) { material.dispose(); return; }
      floor.material = material;
      console.info('[Oasis] Tiles074 material loaded from ZIP', entries.map(([n]) => n));
    } catch (error) {
      console.error('[Oasis] Tiles074 floor audition failed:', error);
    }
  }

  start(): void {
    if (this.frame !== null) return;
    void this.populate();
    let previous = 0;
    const render = (now: number) => {
      if (this.disposed) return;
      this.controls.tick(previous ? Math.min((now - previous) / 1000, 0.05) : 0);
      previous = now;
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(render);
    };
    this.frame = requestAnimationFrame(render);
  }

  private async model(file: string, label: string): Promise<THREE.Group | null> {
    try {
      const gltf = await this.loader.loadAsync(BASE + file);
      if (this.disposed) return null;
      gltf.scene.name = label;
      return gltf.scene;
    } catch (e) {
      console.error('[Oasis] Failed to load', file, e);
      return null;
    }
  }

  private place(model: THREE.Group, maxWidth: number, maxHeight: number, x: number, z: number, yaw = 0, y = 0): THREE.Group | null {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    if (bounds.isEmpty() || size.y <= 0 || Math.max(size.x, size.z) <= 0) return null;
    const factor = Math.min(maxWidth / Math.max(size.x, size.z), maxHeight / size.y);
    model.scale.multiplyScalar(factor);
    model.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(model);
    const center = scaled.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaled.min.y, -center.z);
    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.position.set(x, y, z);
    pivot.rotation.y = yaw;
    this.scene.add(pivot);
    this.assets.push(pivot);
    return pivot;
  }

  private async populate(): Promise<void> {
    // Source assets are used unchanged. Positions are a first visual study, not approved placements.
    const sky = await this.model(ASSETS.sky, 'approved nebula');
    if (sky) {
      sky.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(sky);
      const size = bounds.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z);
      if (span > 0) {
        sky.scale.multiplyScalar(800 / span);
        sky.position.copy(bounds.getCenter(new THREE.Vector3()).multiplyScalar(-800 / span));
        sky.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) { m.side = THREE.DoubleSide; m.depthWrite = false; }
            obj.renderOrder = -10;
          }
        });
        this.scene.add(sky); this.assets.push(sky);
        // Mirror the original upper sky across the horizontal plane.
        // Unlike rotating the sky 180 degrees, this preserves the horizon's
        // position and copies its visible hemisphere directly below it.
        const lowerSky = sky.clone(true);
        lowerSky.scale.y *= -1;
        // Raise the reflected hemisphere to meet the original shell's visible edge.
        // Keep both sky layers distant from the furniture and navigation.
        lowerSky.position.y -= 240;
        lowerSky.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            obj.renderOrder = -11;
            obj.material = Array.isArray(obj.material)
              ? obj.material.map(m => m.clone())
              : obj.material.clone();
          }
        });
        this.scene.add(lowerSky);
        this.assets.push(lowerSky);
      }
    }
    const chair = await this.model(ASSETS.chair, 'approved lounge chair');
    if (chair) {
      this.place(chair, 0.85, 0.95, -0.9476, -0.3, -Math.PI);
      this.place(chair.clone(true), 0.85, 0.95, 0.6444, -0.3, 0);
    }
    const table = await this.model(ASSETS.table, 'approved floating dining set');
    if (table) this.place(table, 1.4, 1.2, 0, -0.3, 0, 0.76);
    const piper = await this.model(ASSETS.piper, 'approved Piper character');
    if (piper) {
      // Non-destructive first seated-pose study. Original GLB stays unchanged.
      const bones = new Map<string, THREE.Bone>();
      piper.traverse(node => {
        if (node instanceof THREE.Bone) bones.set(node.name, node);
      });
      const rotate = (pattern: RegExp, axis: 'x' | 'y' | 'z', radians: number) => {
        const bone = [...bones.entries()].find(([name]) => pattern.test(name))?.[1];
        if (bone) bone.rotation[axis] += radians;
        else console.warn('[Oasis] Pose bone not found:', pattern.source);
      };
      // Hip flexion and bent knees. Keep the head and torso untouched.
      rotate(/^CC_Base_L_Thigh_04$/, 'x', -Math.PI * 0.46);
      rotate(/^CC_Base_R_Thigh_/, 'x', -Math.PI * 0.46);
      rotate(/^CC_Base_L_Calf_05$/, 'x', -Math.PI * 0.49);
      rotate(/^CC_Base_R_Calf_/, 'x', -Math.PI * 0.49);
      // Relax arms from the T-pose.
      rotate(/^CC_Base_L_Upperarm_/, 'z', -Math.PI * 0.32);
      rotate(/^CC_Base_R_Upperarm_/, 'z', Math.PI * 0.32);
      // Ease both elbows forward from the shoulder; retain approved elbow bends.
      rotate(/^CC_Base_L_Upperarm_/, 'x', -Math.PI * 0.12);
      rotate(/^CC_Base_R_Upperarm_/, 'x', -Math.PI * 0.12);
      // Bring forearms forward toward the lap, without touching the approved leg pose.
      rotate(/^CC_Base_L_Forearm_/, 'x', Math.PI * 0.36);
      rotate(/^CC_Base_R_Forearm_/, 'x', Math.PI * 0.36);
      // Wrist-only study: turn palms toward thighs. Leave chair position unchanged.
      rotate(/^CC_Base_L_Hand_/, 'x', Math.PI * 0.12);
      rotate(/^CC_Base_R_Hand_/, 'x', -Math.PI * 0.12);
      piper.updateMatrixWorld(true);
      this.place(piper, 1.25, 1.5494, 0.6444, -0.3, -Math.PI / 2);
    }
    document.querySelector('.foundation-status span:last-child')?.replaceChildren(
      document.createTextNode("HALLORAN'S OASIS · TILES074 FLOOR STUDY 4.0")
    );
  }

  private resize(): void {
    const w = Math.max(1, this.mount.clientWidth);
    const h = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    // Shared geometry/materials from cloned chairs are disposed only once.
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const root of this.assets) root.traverse(o => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
    });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
