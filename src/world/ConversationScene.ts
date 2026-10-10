import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { unzipSync } from 'fflate';
import { WalkControls } from './WalkControls';

const BASE = '/assets/models/';
const ASSETS = {
  sky: 'nebula_skybox_16k.glb',
  chair: 'aeroshell_glide_chair_b.glb',
  table: 'elegant_dining_table_set.glb',
  lamp: 'old_table_lamp_v03.glb',
  piper: 'mj_talking_audition.glb',
  arm: 'robotic_prosthetic_arm.glb',
  dress: 'black_dress.glb'
} as const;

export class ConversationScene {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(64, 1, 0.05, 2000);
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private loader = new GLTFLoader();
  private frame: number | null = null;
  private disposed = false;
  private mouthTargets: Array<{ mesh: THREE.Mesh; index: number; baseline: number }> = [];
  private expressionTargets: Array<{ mesh: THREE.Mesh; index: number; baseline: number; kind: 'smile' | 'blink' | 'surprise' }> = [];
  private expression: 'neutral' | 'smile' | 'blink' | 'surprise' = 'neutral';
  private expressionCurrent = 0;
  private mouthLevel = 0;
  private mouthCurrent = 0;
  private readonly controls: WalkControls;
  private faceMode = false;
  private faceTarget: THREE.Vector3 | null = null;
  private savedCamera: { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } | null = null;
  private assets: THREE.Object3D[] = [];
  private readonly onResize = () => this.resize();

  constructor(private mount: HTMLElement) {
    this.scene.background = new THREE.Color(0x030308);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    mount.appendChild(this.renderer.domElement);
    // Study 6.7: restrained HDR bloom for candle and metallic highlights.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.28, 1.8));
    this.composer.addPass(new OutputPass());
    // Study 10.1: move Josh another three inches closer along the established chair-to-table axis.
    // Three inches = 0.0762 scene units; preserve height, viewing target, rotation order, and all other scene settings.
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(-1.0644, 1.18, -0.30);
    this.camera.lookAt(0.6444, 1.58, -0.30);
    this.controls = new WalkControls(this.mount, this.camera);
    // Study 6.1: lower only the global hemisphere fill for more directional contrast.
    this.scene.add(new THREE.HemisphereLight(0xdce5ff, 0x17101a, 0.28));
    // Study 6.2: soften the existing warm point light without moving or recoloring it.
    const warm = new THREE.PointLight(0xffc28a, 8, 9);
    warm.position.set(1.2, 2.5, 0.5);
    this.scene.add(warm);
    // Study 6.3: reduce only the cool directional fill; warm accent and bloom follow separately.
    const fill = new THREE.DirectionalLight(0xb6c7ff, 0.55);
    fill.position.set(-4, 6, 4);
    this.scene.add(fill);

    // Study 6.4: local candlelight pool, without changing existing lighting or assets.
    const candleGlow = new THREE.PointLight(0xffa65c, 2.8, 2.8, 2);
    candleGlow.position.set(0.42, 1.63, 0.12);
    this.scene.add(candleGlow);

    // Study 6.6: faint rose-violet accent opposite the approved candlelight.
    const violetAccent = new THREE.PointLight(0x9d65ca, 1.2, 3.5, 2);
    violetAccent.position.set(-1.35, 2.2, -0.65);
    this.scene.add(violetAccent);

    // Study 7.2: gentle warm fill on Piper's shadow-side cheek.
    const cheekFill = new THREE.PointLight(0xffd3b3, 1.05, 2.1, 2);
    cheekFill.position.set(-0.15, 1.95, -0.15);
    this.scene.add(cheekFill);

    // Marble016 floor audition. Decode the approved ZIP in-browser without
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
    // Study 4.4: subtle planar reflections over the existing marble.
    // The marble remains opaque and unchanged; only this overlay reflects.
    const reflectionSize = Math.min(512, Math.max(256, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.65)));
    const reflection = new Reflector(new THREE.PlaneGeometry(200, 200), {
      textureWidth: reflectionSize,
      textureHeight: reflectionSize,
      color: 0x777777,
      clipBias: 0.004,
    });
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.y = -0.009;
    // Reflector uses ShaderMaterial; alter its actual output, not an unused
    // onBeforeCompile chunk. Preserve the stone beneath via transparency.
    const reflectionMaterial = reflection.material as THREE.ShaderMaterial;
    // ReflectorShader outputs an opaque vec4 by default. Replace that exact
    // output expression so the marble underneath remains visible.
    const opaqueOutput = 'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );';
    if (reflectionMaterial.fragmentShader.includes(opaqueOutput)) {
      reflectionMaterial.fragmentShader = reflectionMaterial.fragmentShader.replace(
        opaqueOutput,
        'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 0.15 );'
      );
    } else {
      console.error('[Oasis] Reflector shader output changed; reflection overlay disabled');
      reflection.visible = false;
    }
    // Fade only the distant reflection toward the existing sky.
    reflectionMaterial.vertexShader = reflectionMaterial.vertexShader.replace(
      'void main() {',
      'varying vec3 vOasisFloorWorld;\nvoid main() {\n  vOasisFloorWorld = (modelMatrix * vec4(position, 1.0)).xyz;'
    );
    reflectionMaterial.fragmentShader = reflectionMaterial.fragmentShader.replace(
      'void main() {',
      'varying vec3 vOasisFloorWorld;\nvoid main() {'
    ).replace(
      'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 0.15 );',
      'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 0.15 * (1.0 - smoothstep(140.0, 260.0, distance(vOasisFloorWorld.xz, cameraPosition.xz))));'
    );
    reflectionMaterial.transparent = true;
    reflectionMaterial.depthWrite = false;
    reflectionMaterial.needsUpdate = true;
    this.scene.add(reflection);
    this.assets.push(reflection);
    // Neutral floor-only light to reveal dark tile without altering the room.
    const floorLight = new THREE.DirectionalLight(0xffffff, 2.2);
    floorLight.position.set(-2, 5, 3);
    floorLight.layers.set(1);
    this.scene.add(floorLight);
    floor.layers.enable(1);

    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    this.resize();
  }

  private async loadTilesFloor(floor: THREE.Mesh): Promise<void> {
    try {
      const response = await fetch('/assets/models/Marble016_2K-JPG.zip');
      if (!response.ok) throw new Error('Marble016 ZIP HTTP ' + response.status);
      const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
      console.info('[Oasis] Marble016 ZIP contents:', Object.keys(files));
      const entries = Object.entries(files).filter(([name]) => /\.(jpe?g|png)$/i.test(name));
      const find = (pattern: RegExp) => entries.find(([name]) => pattern.test(name))?.[1];
      const color = find(/(?:color|diffuse|albedo)\.(?:jpe?g|png)$/i);
      const normal = find(/normal(?:gl|dx)?\.(?:jpe?g|png)$/i);
      const rough = find(/roughness\.(?:jpe?g|png)$/i);
      const ao = find(/(?:ambientocclusion|_ao)\.(?:jpe?g|png)$/i);
      if (!color) throw new Error('Marble016 ZIP contains no recognized color map: ' + entries.map(([n]) => n).join(', '));
      const loader = new THREE.TextureLoader();
      const load = async (bytes: Uint8Array, srgb = false): Promise<THREE.Texture> => {
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
        try {
          const texture = await loader.loadAsync(url);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(4, 4);
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
        color: 0x858585,
        roughness: 0.065,
        metalness: 0.08,
      });
      if (this.disposed) { material.dispose(); return; }
      // Only the distant floor fades. Its colors, scale, and polish stay fixed.
      material.transparent = true;
      material.depthWrite = false;
      material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace(
          'void main() {',
          'varying vec3 vOasisFloorWorld;\nvoid main() {\n  vOasisFloorWorld = (modelMatrix * vec4(position, 1.0)).xyz;'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          'void main() {',
          'varying vec3 vOasisFloorWorld;\nvoid main() {'
        ).replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n diffuseColor.a *= 1.0 - smoothstep(140.0, 260.0, distance(vOasisFloorWorld.xz, cameraPosition.xz));'
        );
      };
      floor.material = material;
      console.info('[Oasis] Marble016 material loaded from ZIP', entries.map(([n]) => n));
      this.setFloorStatus('MARBLE016 FLOOR STUDY 9.1 · SEATED VIEW · ARMS HIDDEN · TEXTURE LOADED');
    } catch (error) {
      console.error('[Oasis] Marble016 floor audition failed:', error);
      this.setFloorStatus('MARBLE016 FLOOR STUDY 9.1 · SEATED VIEW · ARMS HIDDEN · TEXTURE ERROR');
    }
  }

  private setFloorStatus(label: string): void {
    document.querySelector('.foundation-status span:last-child')?.replaceChildren(
      document.createTextNode("HALLORAN'S OASIS · " + label)
    );
  }

  toggleFaceCamera(): boolean {
    if (!this.faceMode) {
      this.savedCamera = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), fov: this.camera.fov };
      // Aim at the loaded avatar's actual upper-face region, not a guessed world height.
      const target = this.faceTarget ?? new THREE.Vector3(0.6444, 1.35, -0.30);
      this.camera.position.copy(target).add(new THREE.Vector3(-0.85, 0.025, 0));
      this.camera.fov = 35;
      this.camera.lookAt(target);
      this.faceMode = true;
    } else {
      if (this.savedCamera) {
        this.camera.position.copy(this.savedCamera.position);
        this.camera.quaternion.copy(this.savedCamera.quaternion);
        this.camera.fov = this.savedCamera.fov;
      }
      this.savedCamera = null;
      this.faceMode = false;
    }
    this.camera.updateProjectionMatrix();
    return this.faceMode;
  }

  setSpeechLevel(level: number): void {
    this.mouthLevel = THREE.MathUtils.clamp(level, 0, 1);
  }

  setExpression(expression: 'neutral' | 'smile' | 'blink' | 'surprise'): void {
    this.expression = expression;
  }

  private updateExpression(): void {
    const active = this.expression !== 'neutral';
    this.expressionCurrent += ((active ? 0.65 : 0) - this.expressionCurrent) * 0.12;
    for (const target of this.expressionTargets) {
      const influences = target.mesh.morphTargetInfluences;
      if (!influences) continue;
      influences[target.index] = THREE.MathUtils.clamp(target.baseline + (target.kind === this.expression ? this.expressionCurrent : 0), 0, 1);
    }
  }

  private updateMouth(): void {
    this.mouthCurrent += (this.mouthLevel - this.mouthCurrent) * 0.38;
    for (const target of this.mouthTargets) {
      if (!target.mesh.morphTargetInfluences) continue;
      target.mesh.morphTargetInfluences[target.index] = THREE.MathUtils.lerp(target.baseline, 1, this.mouthCurrent);
    }
  }

  start(): void {
    if (this.frame !== null) return;
    void this.populate().catch(error => { console.error('[Oasis] Startup failed', error); document.querySelector('.foundation-status span:last-child')?.replaceChildren(document.createTextNode('STUDY 10.4 · STARTUP FAILED')); });
    let previous = 0;
    const render = (now: number) => {
      if (this.disposed) return;
      if (!this.faceMode) this.controls.tick(previous ? Math.min((now - previous) / 1000, 0.05) : 0);
      previous = now;
      this.updateExpression();
      this.updateMouth();
      this.composer.render();
      this.frame = requestAnimationFrame(render);
    };
    this.frame = requestAnimationFrame(render);
  }

  // Reconstruct the uploaded GLB from its two GitHub-hosted parts.
  // Keep the source files intact and avoid a build-time binary dependency.
  private async loadMJFromParts(): Promise<import('three/addons/loaders/GLTFLoader.js').GLTF> {
    const parts = await Promise.all([1, 2].map(async number => {
      const path = BASE + 'mj_talking_audition.part0' + number;
      const response = await fetch(path);
      if (!response.ok) throw new Error('MJ model part ' + number + ': HTTP ' + response.status);
      return new Uint8Array(await response.arrayBuffer());
    }));
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'glTF' ||
        new DataView(bytes.buffer).getUint32(8, true) !== total) {
      throw new Error('MJ model reconstruction failed GLB header validation');
    }
    return this.loader.parseAsync(bytes.buffer, BASE);
  }

  private async model(file: string, label: string): Promise<THREE.Group | null> {
    try {
      document.querySelector('.foundation-status span:last-child')?.replaceChildren(document.createTextNode('STUDY 10.3 · LOADING ' + label.toUpperCase()));
      const gltf = file === ASSETS.piper
        ? await this.loadMJFromParts()
        : await this.loader.loadAsync(BASE + file);
      if (this.disposed) return null;
      gltf.scene.name = label;
      return gltf.scene;
    } catch (e) {
      console.error('[Oasis] Failed to load', file, e);
      document.querySelector('.foundation-status span:last-child')?.replaceChildren(document.createTextNode('STUDY 10.3 · FAILED ' + label.toUpperCase()));
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
    // Study 9.1: temporarily remove first-person prosthetic arms for a clean seated-view audition.
    // Keep the camera in the scene independently of the arm asset.
    this.scene.add(this.camera);
    const chair = await this.model(ASSETS.chair, 'approved lounge chair');
    if (chair) {
      this.place(chair, 0.85, 0.95, -0.9476, -0.3, -Math.PI);
      this.place(chair.clone(true), 0.85, 0.95, 0.6444, -0.3, 0);
    }
    const table = await this.model(ASSETS.table, 'approved floating dining set');
    if (table) this.place(table, 1.4, 1.2, 0, -0.3, 0, 0.76);
    const piper = await this.model(ASSETS.piper, 'approved Piper character');
    if (piper) {
      // Study 10.11.2: reduce aggressive hair alpha clipping on the identified mesh.
      // Keep depth writing enabled so overlapping hair cards remain stable.
      const hairAudit: string[] = [];
      piper.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (/hair|lambert10/i.test(material.name) || node.name === 'Object_35') {
            hairAudit.push(node.name + ':' + material.name + ':alpha=' + material.alphaTest);
          }
        }
        if (node.name !== 'Object_35') return;
        const adjust = (material: THREE.Material): THREE.Material => {
          if (material.name !== 'lambert10') return material;
          const copy = material.clone();
          copy.depthWrite = true;
          copy.depthTest = true;
          copy.side = THREE.DoubleSide;
          copy.transparent = false;
          copy.alphaTest = 0.08;
          copy.needsUpdate = true;
          return copy;
        };
        node.material = Array.isArray(node.material)
          ? node.material.map(adjust)
          : adjust(node.material);
      });
      console.info('[Oasis] Hair material audit:', hairAudit);
      // Non-invasive diagnostic inventory. No changes to hair rendering.
      const diagnostics: string[] = [];
      piper.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          const mat = material as THREE.MeshStandardMaterial;
          const map = mat.map;
          const alphaMap = mat.alphaMap;
          const likelyHair = /hair|scalp|bang|fringe|lambert10/i.test(node.name + ' ' + material.name) || node.name === 'Object_35';
          if (!likelyHair) continue;
          const geometry = node.geometry;
          diagnostics.push([
            node.name, material.name || '(unnamed)',
            'visible=' + node.visible,
            'triangles=' + (geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count || 0) / 3),
            'transparent=' + material.transparent,
            'alphaTest=' + material.alphaTest,
            'opacity=' + material.opacity,
            'side=' + material.side,
            'depthWrite=' + material.depthWrite,
            'depthTest=' + material.depthTest,
            'renderOrder=' + node.renderOrder,
            'map=' + (map ? map.image?.width + 'x' + map.image?.height : 'none'),
            'alphaMap=' + (alphaMap ? 'yes' : 'no')
          ].join(' | '));
        }
      });
      console.info('[Oasis] Hair diagnostics:', diagnostics);
      const panel = document.createElement('details');
      panel.className = 'oasis-hair-diagnostics';
      panel.innerHTML = '<summary>HAIR DIAGNOSTICS</summary>';
      const output = document.createElement('pre');
      output.textContent = diagnostics.length ? diagnostics.join('\\n') : 'No named hair meshes found. Inspect full mesh inventory.';
      panel.appendChild(output);
      document.body.appendChild(panel);

      // Bind only the verified mouth-open morph; preserve all other facial controls.
      this.mouthTargets = [];
      piper.traverse(node => {
        if (!(node instanceof THREE.Mesh) || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
        for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
          if (!/(?:^|[_ .])mouth[_ .]?open(?:$|[_ .])/i.test(name)) continue;
          this.mouthTargets.push({ mesh: node, index, baseline: node.morphTargetInfluences[index] || 0 });
        }
      });
      // Inspect the actual exported GLB morph names; unsupported cues remain neutral.
      this.expressionTargets = [];
      piper.traverse(node => {
        if (!(node instanceof THREE.Mesh) || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
        for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
          const normalized = name.toLowerCase().replace(/[^a-z]/g, '');
          const kind = /smile|happy|grin/.test(normalized) ? 'smile'
            : /blink|eyesclosed/.test(normalized) ? 'blink'
            : /surprise|eyeswide|eyewide/.test(normalized) ? 'surprise' : null;
          if (kind) this.expressionTargets.push({ mesh: node, index, baseline: node.morphTargetInfluences[index] || 0, kind });
        }
      });
      console.info('[Oasis] Voice mouth targets:', this.mouthTargets.length);
      console.info('[Oasis] Available expression morphs:', this.expressionTargets.map(target => target.kind));
      document.getElementById('oasis-mesh-inspector')?.remove();
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
      rotate(/^CC_Base_L_Thigh$/, 'x', -Math.PI * 0.46);
      rotate(/^CC_Base_R_Thigh$/, 'x', -Math.PI * 0.46);
      rotate(/^CC_Base_L_Calf$/, 'x', -Math.PI * 0.49);
      rotate(/^CC_Base_R_Calf$/, 'x', -Math.PI * 0.49);
      // Relax arms from the T-pose.
      rotate(/^CC_Base_L_Upperarm(?:_|$)/, 'z', -Math.PI * 0.32);
      rotate(/^CC_Base_R_Upperarm(?:_|$)/, 'z', Math.PI * 0.32);
      // Ease both elbows forward from the shoulder; retain approved elbow bends.
      rotate(/^CC_Base_L_Upperarm(?:_|$)/, 'x', -Math.PI * 0.12);
      rotate(/^CC_Base_R_Upperarm(?:_|$)/, 'x', -Math.PI * 0.12);
      // Bring forearms forward toward the lap, without touching the approved leg pose.
      rotate(/^CC_Base_L_Forearm(?:_|$)/, 'x', Math.PI * 0.36);
      rotate(/^CC_Base_R_Forearm(?:_|$)/, 'x', Math.PI * 0.36);
      // Wrist-only study: turn palms toward thighs. Leave chair position unchanged.
      rotate(/^CC_Base_L_Hand(?:_|$)/, 'x', Math.PI * 0.12);
      rotate(/^CC_Base_R_Hand(?:_|$)/, 'x', -Math.PI * 0.12);
      piper.updateMatrixWorld(true);
      // Study 10.8: use Piper's existing avatar clothing. Do not overlay the separate static dress prop.
      const placedPiper = this.place(piper, 1.25, 1.5494, 0.6444, -0.3, -Math.PI / 2);
      if (placedPiper) {
        placedPiper.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(placedPiper);
        if (!bounds.isEmpty()) {
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          this.faceTarget = new THREE.Vector3(center.x, bounds.min.y + size.y * 0.87, center.z);
          console.info('[Oasis] Facial audition target:', this.faceTarget.toArray());
        }
      }
    }
    document.querySelector('.foundation-status span:last-child')?.replaceChildren(
      document.createTextNode("HALLORAN'S OASIS · STUDY 10.11.3 · BUILD 10.11.3 · HAIR DIAGNOSTICS")
    );
  }

  private resize(): void {
    const w = Math.max(1, this.mount.clientWidth);
    const h = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    // Keep bloom/postprocessing at native CSS resolution on phones to restore responsive navigation.
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
  }

  dispose(): void {
    this.disposed = true;
    this.mouthTargets = [];
    this.expressionTargets = [];
    document.querySelector('.oasis-hair-diagnostics')?.remove();
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
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
