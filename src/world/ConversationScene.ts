import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = '/assets/models/';
const ASSETS = {
  sky: 'nebula_skybox_16k.glb',
  chair: 'modern_chair.glb',
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
  private pointers = new Map<number, { x: number; y: number }>();
  private yaw = 0;
  private pitch = 0;
  private assets: THREE.Object3D[] = [];
  private readonly onResize = () => this.resize();
  private readonly onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private readonly onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.yaw = THREE.MathUtils.clamp(this.yaw - (e.clientX - p.x) * 0.0025, -1.6, 1.6);
    this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - p.y) * 0.0025, -0.5, 0.5);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    p.x = e.clientX; p.y = e.clientY;
  };
  private readonly onUp = (e: PointerEvent) => { this.pointers.delete(e.pointerId); };

  constructor(private mount: HTMLElement) {
    this.scene.background = new THREE.Color(0x030308);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    mount.appendChild(this.renderer.domElement);
    this.camera.position.set(-1.35, 1.12, 0.95);
    this.camera.lookAt(1.05, 1.08, -0.3);
    this.camera.rotation.order = 'YXZ';
    this.yaw = this.camera.rotation.y;
    this.pitch = this.camera.rotation.x;
    this.scene.add(new THREE.HemisphereLight(0xdce5ff, 0x17101a, 2));
    const warm = new THREE.PointLight(0xffc28a, 28, 9);
    warm.position.set(1.2, 2.5, 0.5);
    this.scene.add(warm);
    const fill = new THREE.DirectionalLight(0xb6c7ff, 2);
    fill.position.set(-4, 6, 4);
    this.scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshPhysicalMaterial({ color: 0x090b14, metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    this.scene.add(floor);
    this.assets.push(floor);

    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer.domElement.addEventListener('pointermove', this.onMove);
    this.renderer.domElement.addEventListener('pointerup', this.onUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onUp);
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    this.resize();
  }

  start(): void {
    if (this.frame !== null) return;
    void this.populate();
    const render = () => {
      if (this.disposed) return;
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
      }
    }
    const chair = await this.model(ASSETS.chair, 'approved lounge chair');
    if (chair) {
      this.place(chair, 1.5, 1.5, -1.25, -0.3, -Math.PI / 2);
      this.place(chair.clone(true), 1.5, 1.5, 1.25, -0.3, Math.PI / 2);
    }
    const table = await this.model(ASSETS.table, 'approved floating dining set');
    if (table) this.place(table, 1.7, 1.2, 0, -0.3, 0, 0.7);
    const lamp = await this.model(ASSETS.lamp, 'approved antique lamp');
    if (lamp) this.place(lamp, 0.38, 0.65, 0.5, -0.3, 0, 0.75);
    const piper = await this.model(ASSETS.piper, 'approved Piper character');
    if (piper) {
      // Keep original rig and pose intact until the skeleton and animations are inspected.
      this.place(piper, 0.9, 1.7, 1.25, -0.3, -Math.PI / 2);
      console.info('[Oasis] Piper model loaded; seated animation not yet verified');
    }
    document.querySelector('.foundation-status span:last-child')?.replaceChildren(
      document.createTextNode("HALLORAN'S OASIS · COMPOSITION STUDY 0.6")
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
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onUp);
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
