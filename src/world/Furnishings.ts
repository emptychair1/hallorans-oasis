import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type Item = {
  name: string;
  url: string;
  width: number;
  height: number;
  depth: number;
  x: number;
  z: number;
  yaw: number;
};

const ITEMS: Item[] = [
  { name: 'round table', url: '/assets/models/simple_round_table_obj.glb', width: 1.4, height: 0.8, depth: 1.4, x: 0, z: 0.5, yaw: 0 },
  { name: 'left Barcelona chair', url: '/assets/models/barcelona_chair.glb', width: 1.0, height: 0.9, depth: 1.0, x: -1.65, z: 0.5, yaw: -Math.PI / 2 },
  { name: 'right Barcelona chair', url: '/assets/models/barcelona_chair.glb', width: 1.0, height: 0.9, depth: 1.0, x: 1.65, z: 0.5, yaw: Math.PI / 2 },
  { name: 'inert portal', url: '/assets/models/sci-fi_portal_gateway.glb', width: 2.6, height: 3.1, depth: 0.8, x: 0, z: -4.5, yaw: 0 }
];

/** Approved models only. Dimensions are provisional, with no geometry edits. */
export async function addFurnishings(
  root: THREE.Group,
  roomBounds: THREE.Box3,
  loader: GLTFLoader,
  isDisposed: () => boolean
): Promise<void> {
  const roomSize = roomBounds.getSize(new THREE.Vector3());
  // Keep the portal just in front of the back wall; all items stay inside.
  const portalZ = roomBounds.min.z + Math.min(0.8, roomSize.z * 0.12);
  for (const item of ITEMS) {
    try {
      const gltf = await loader.loadAsync(item.url);
      const model = gltf.scene;
      if (isDisposed()) return;
      model.updateMatrixWorld(true);
      const raw = new THREE.Box3().setFromObject(model);
      const size = raw.getSize(new THREE.Vector3());
      if (raw.isEmpty() || Math.min(size.x, size.y, size.z) <= 0) {
        console.warn('[Oasis] Invalid model bounds:', item.name);
        continue;
      }
      // Uniform scaling preserves original asset proportions.
      const factor = Math.min(item.width / size.x, item.height / size.y, item.depth / size.z);
      model.scale.multiplyScalar(factor);
      model.updateMatrixWorld(true);
      const scaled = new THREE.Box3().setFromObject(model);
      const center = scaled.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -scaled.min.y, -center.z);
      const pivot = new THREE.Group();
      pivot.name = item.name;
      pivot.add(model);
      pivot.position.set(
        THREE.MathUtils.clamp(item.x, roomBounds.min.x + 1, roomBounds.max.x - 1),
        roomBounds.min.y,
        item.name === 'inert portal' ? portalZ : item.z
      );
      pivot.rotation.y = item.yaw;
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.receiveShadow = true;
          object.castShadow = false;
        }
      });
      root.add(pivot);
      console.info('[Oasis] Placed approved model', item.name, item.url);
    } catch (error) {
      console.error('[Oasis] Approved model failed to load:', item.url, error);
    }
  }
}
