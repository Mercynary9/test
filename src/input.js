/** Keyboard + pointer-lock mouse input. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys that went down since the last consume()
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.sensitivity = 0.0024;

    const held = new Set([
      'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight',
    ]);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (held.has(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (held.has(e.code)) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock?.();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX * this.sensitivity;
      this.mouseDY += e.movementY * this.sensitivity;
    });
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True once per physical key press. */
  tapped(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  consume() {
    this.pressed.clear();
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  release() {
    document.exitPointerLock?.();
  }
}
