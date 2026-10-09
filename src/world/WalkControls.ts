import * as THREE from 'three';

export class WalkControls {
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, { mode: 'walk' | 'look'; x: number; y: number; ox: number; oy: number }>();
  private readonly stick = new THREE.Vector2();
  private readonly smoothed = new THREE.Vector2();
  private readonly pad = document.createElement('div');
  private readonly nub = document.createElement('div');
  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private bounds: THREE.Box3 | null = null;

  constructor(private readonly mount: HTMLElement, private readonly camera: THREE.PerspectiveCamera) {
    this.pad.className = 'walk-pad';
    this.nub.className = 'walk-nub';
    this.pad.append(this.nub);
    mount.append(this.pad);
    mount.addEventListener('pointerdown', this.down);
    mount.addEventListener('pointermove', this.drag);
    mount.addEventListener('pointerup', this.up);
    mount.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.reset);
  }

  setBounds(bounds: THREE.Box3): void {
    this.bounds = bounds.clone();
    this.camera.rotation.order = 'YXZ';
    this.yaw = this.targetYaw = this.camera.rotation.y;
    this.pitch = this.targetPitch = this.camera.rotation.x;
  }

  tick(seconds: number): void {
    if (!this.bounds || seconds <= 0) return;
    const dt = Math.min(seconds, 0.05);
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-18 * dt));
    this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-18 * dt));
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.smoothed.lerp(this.stick, 1 - Math.exp(-9 * dt));
    const x = this.smoothed.x + Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const y = this.smoothed.y + Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const motion = new THREE.Vector2(x, y);
    if (motion.lengthSq() < 0.001) return;
    const strength = Math.min(1, motion.length());
    motion.normalize().multiplyScalar(dt * 2.8 * strength);
    const dx = Math.cos(this.yaw) * motion.x - Math.sin(this.yaw) * motion.y;
    const dz = -Math.sin(this.yaw) * motion.x - Math.cos(this.yaw) * motion.y;
    const margin = 1.2;
    if (this.bounds.max.x - this.bounds.min.x > margin * 2) {
      this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x + dx, this.bounds.min.x + margin, this.bounds.max.x - margin);
    }
    if (this.bounds.max.z - this.bounds.min.z > margin * 2) {
      this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z + dz, this.bounds.min.z + margin, this.bounds.max.z - margin);
    }
  }

  dispose(): void {
    this.mount.removeEventListener('pointerdown', this.down);
    this.mount.removeEventListener('pointermove', this.drag);
    this.mount.removeEventListener('pointerup', this.up);
    this.mount.removeEventListener('pointercancel', this.up);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.reset);
    this.pad.remove();
  }

  private readonly keyDown = (e: KeyboardEvent): void => {
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(e.code)) {
      e.preventDefault();
      this.keys.add(e.code);
    }
  };
  private readonly keyUp = (e: KeyboardEvent): void => { this.keys.delete(e.code); };
  private readonly reset = (): void => {
    this.keys.clear();
    this.pointers.clear();
    this.stick.set(0, 0);
    this.smoothed.set(0, 0);
    this.nub.style.transform = '';
  };
  private readonly down = (e: PointerEvent): void => {
    if (!this.bounds) return;
    e.preventDefault();
    const rect = this.pad.getBoundingClientRect();
    const insidePad = e.clientX >= rect.left - 16 && e.clientX <= rect.right + 16 &&
      e.clientY >= rect.top - 16 && e.clientY <= rect.bottom + 16;
    const mode = insidePad &&
      !Array.from(this.pointers.values()).some((p) => p.mode === 'walk') ? 'walk' : 'look';
    this.pointers.set(e.pointerId, { mode, x: e.clientX, y: e.clientY,
      ox: mode === 'walk' ? rect.left + rect.width / 2 : e.clientX,
      oy: mode === 'walk' ? rect.top + rect.height / 2 : e.clientY });
    if (mode === 'walk') this.drag(e);
    this.mount.setPointerCapture(e.pointerId);
  };
  private readonly drag = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.mode === 'walk') {
      this.stick.set(
        THREE.MathUtils.clamp((e.clientX - p.ox) / 45, -1, 1),
        THREE.MathUtils.clamp((p.oy - e.clientY) / 55, -1, 1)
      );
      if (this.stick.length() > 1) this.stick.normalize();
      this.nub.style.transform = 'translate(' + this.stick.x * 28 + 'px,' + -this.stick.y * 28 + 'px)';
    } else {
      this.targetYaw -= (e.clientX - p.x) * 0.004;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - (e.clientY - p.y) * 0.004, -1.45, 1.45);
    }
    p.x = e.clientX;
    p.y = e.clientY;
  };
  private readonly up = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.mode === 'walk') {
      this.stick.set(0, 0);
      this.nub.style.transform = '';
    }
    if (this.mount.hasPointerCapture(e.pointerId)) this.mount.releasePointerCapture(e.pointerId);
  };
}
