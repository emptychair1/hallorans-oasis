import * as THREE from 'three';

export class OasisScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly calibrationCube: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private frameId: number | null = null;
  private disposed = false;

  constructor(private readonly mount: HTMLElement) {
    this.scene.background = new THREE.Color(0x050608);

    this.camera.position.set(0, 1.65, 5);
    this.camera.lookAt(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mount.appendChild(this.renderer.domElement);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({
        color: 0x111319,
        roughness: 0.96,
        metalness: 0
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(20, 20, 0x41454d, 0x202229);
    grid.position.y = 0.002;
    this.scene.add(grid);

    this.calibrationCube = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 1.25, 1.25),
      new THREE.MeshStandardMaterial({
        color: 0x747881,
        roughness: 0.68,
        metalness: 0.04
      })
    );
    this.calibrationCube.position.set(0, 0.625, 0);
    this.calibrationCube.castShadow = true;
    this.calibrationCube.receiveShadow = true;
    this.scene.add(this.calibrationCube);

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x171922, 1.35);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    this.resize();
    window.addEventListener('resize', this.resize, { passive: true });
    window.visualViewport?.addEventListener('resize', this.resize, { passive: true });
  }

  start(): void {
    if (this.frameId !== null || this.disposed) return;

    const render = (): void => {
      if (this.disposed) return;

      this.calibrationCube.rotation.y += 0.003;
      this.renderer.render(this.scene, this.camera);
      this.frameId = window.requestAnimationFrame(render);
    };

    render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);

    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });

    this.renderer.dispose();
    this.renderer.domElement.remove();
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
