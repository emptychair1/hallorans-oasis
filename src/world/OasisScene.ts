import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WalkControls } from './WalkControls';
import { addFurnishings } from './Furnishings';

const ROOM_URL = '/assets/models/white-room1.glb';
const TARGET_ROOM_SPAN_METERS = 14;

export class OasisScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(65, 1, 0.05, 500);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly roomRoot = new THREE.Group();
  private readonly loader = new GLTFLoader();
  private frameId: number | null = null;
  private disposed = false;
  private readonly controls: WalkControls;
  private previousFrame = 0;

  constructor(private readonly mount: HTMLElement) {
    this.scene.background = new THREE.Color(0x101114);
    this.scene.add(this.roomRoot);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mount.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x66616a, 2.2));

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xd9e5ff, 1.0);
    fill.position.set(-5, 5, -4);
    this.scene.add(fill);

    this.camera.position.set(0, 2, 5);
    this.camera.lookAt(0, 1.6, 0);

    this.controls = new WalkControls(this.mount, this.camera);
    this.resize();
    window.addEventListener('resize', this.resize, { passive: true });
    window.visualViewport?.addEventListener('resize', this.resize, { passive: true });
  }

  start(): void {
    if (this.disposed || this.frameId !== null) return;
    void this.loadRoom();

    const render = (now: number): void => {
      const dt = this.previousFrame ? (now - this.previousFrame) / 1000 : 0;
      this.previousFrame = now;
      this.controls.tick(dt);
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
      this.frameId = window.requestAnimationFrame(render);
    };
    this.frameId = window.requestAnimationFrame(render);
  }

  private async loadRoom(): Promise<void> {
    try {
      const gltf = await this.loader.loadAsync(ROOM_URL);
      if (this.disposed) {
        this.disposeObject(gltf.scene);
        return;
      }

      const room = gltf.scene;
      room.updateMatrixWorld(true);
      const originalBounds = new THREE.Box3().setFromObject(room);
      const originalSize = originalBounds.getSize(new THREE.Vector3());
      const largestHorizontal = Math.max(originalSize.x, originalSize.z);

      if (originalBounds.isEmpty() || !Number.isFinite(largestHorizontal) || largestHorizontal <= 0) {
        throw new Error('Room model has invalid bounds');
      }

      // Normalize the source room to a generous real-world footprint.
      // This is a provisional scale until its true measurements are confirmed.
      const scale = TARGET_ROOM_SPAN_METERS / largestHorizontal;
      room.scale.multiplyScalar(scale);
      room.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(room);
      const center = bounds.getCenter(new THREE.Vector3());
      room.position.x -= center.x;
      room.position.z -= center.z;
      room.position.y -= bounds.min.y;
      room.updateMatrixWorld(true);

      const finalBounds = new THREE.Box3().setFromObject(room);
      const finalSize = finalBounds.getSize(new THREE.Vector3());

      room.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.receiveShadow = true;
        object.castShadow = false;
      });

      this.roomRoot.add(room);

      // The approved room's glass frontage faces +Z in the exterior study.
      // Enter at eye level and face that frontage. No geometry is changed.
      const eyeHeight = Math.min(1.65, Math.max(0.9, finalSize.y * 0.45));
      this.camera.position.set(0, eyeHeight, -finalSize.z * 0.12);
      this.camera.lookAt(0, eyeHeight, finalSize.z * 0.4);
      this.camera.updateProjectionMatrix();
      void addFurnishings(this.roomRoot, finalBounds, this.loader, () => this.disposed);

      console.info('[Oasis] Room loaded', {
        source: ROOM_URL,
        originalSize: originalSize.toArray(),
        scale,
        normalizedSize: finalSize.toArray()
      });

      document.querySelector('.foundation-status span:last-child')?.replaceChildren(
        document.createTextNode('HALLORAN\'S OASIS · FURNISHING STUDY 0.4')
      );
    } catch (error) {
      console.error('[Oasis] Could not load approved room asset', error);
      document.querySelector('.foundation-status span:last-child')?.replaceChildren(
        document.createTextNode('ROOM ASSET FAILED TO LOAD')
      );
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
    this.frameId = null;

    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);

    this.controls.dispose();
    this.disposeObject(this.roomRoot);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
  };
}
