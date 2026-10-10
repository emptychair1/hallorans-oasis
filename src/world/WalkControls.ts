export class WalkControls {
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;

  constructor(private readonly mount: HTMLElement, private readonly camera: import('three').PerspectiveCamera) {
    // Seated-view controls: drag to look around. There is deliberately no locomotion.
    this.mount.addEventListener('pointerdown', this.down);
    this.mount.addEventListener('pointermove', this.drag);
    this.mount.addEventListener('pointerup', this.up);
    this.mount.addEventListener('pointercancel', this.up);
    window.addEventListener('blur', this.reset);
  }

  tick(seconds: number): void {
    if (seconds <= 0) return;
    const dt = Math.min(seconds, 0.05);
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-25 * dt));
    this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-25 * dt));
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  dispose(): void {
    this.mount.removeEventListener('pointerdown', this.down);
    this.mount.removeEventListener('pointermove', this.drag);
    this.mount.removeEventListener('pointerup', this.up);
    this.mount.removeEventListener('pointercancel', this.up);
    window.removeEventListener('blur', this.reset);
    this.pointers.clear();
  }

  private readonly down = (event: PointerEvent): void => {
    // Only the scene canvas should capture look gestures, never the Piper chat UI.
    if (!(event.target instanceof HTMLCanvasElement)) return;
    event.preventDefault();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.mount.setPointerCapture(event.pointerId);
  };

  private readonly drag = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    this.targetYaw -= (event.clientX - pointer.x) * 0.006;
    this.targetPitch = Math.max(-1.45, Math.min(1.45,
      this.targetPitch - (event.clientY - pointer.y) * 0.006));
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };

  private readonly up = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    if (this.mount.hasPointerCapture(event.pointerId)) this.mount.releasePointerCapture(event.pointerId);
  };

  private readonly reset = (): void => {
    this.pointers.clear();
  };
}
