/**
 * On-screen controls for phones: a floating thumbstick on the left, a drag
 * area for the camera on the right, and jump / dash buttons under the right
 * thumb.
 *
 * Every control is a DOM element tagged with `data-control`, so a pointer is
 * routed by what it landed on rather than by comparing screen coordinates.
 * Pointers are captured on press, which keeps a thumb that slides outside its
 * button (or off the screen edge) attached to the control it started on.
 */

export const IS_TOUCH =
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
  navigator.maxTouchPoints > 0 ||
  'ontouchstart' in window;

/** Phones and small tablets: the tier we cut render cost for. */
export const IS_SMALL_SCREEN = Math.min(innerWidth, innerHeight) < 820;
export const MOBILE_TIER = IS_TOUCH && IS_SMALL_SCREEN;

const STICK_RADIUS = 62; // px of thumb travel for full tilt
const DEADZONE = 0.16;

export class TouchControls {
  constructor() {
    this.root = document.getElementById('touch');
    this.stickZone = this.root?.querySelector('[data-control="stick"]') ?? null;
    this.stickBase = this.root?.querySelector('.stick-base') ?? null;
    this.stickKnob = this.root?.querySelector('.stick-knob') ?? null;

    /** Normalised movement: x = strafe right, y = walk away from the camera. */
    this.stick = { x: 0, y: 0 };
    this.lookDX = 0;
    this.lookDY = 0;
    this.jumpHeld = false;
    this.jumpTapped = false;
    this.dashTapped = false;
    this.sensitivity = 0.0055;
    this.active = false;
    this.dashReady = true;

    /** pointerId -> { control, element, startX, startY, lastX, lastY } */
    this.pointers = new Map();

    if (!this.root) return;

    this.root.addEventListener('pointerdown', this.onDown, { passive: false });
    this.root.addEventListener('pointermove', this.onMove, { passive: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.root.addEventListener(type, this.onUp, { passive: false });
    }
    // Scrolling and zooming are already off via `touch-action: none` in the
    // stylesheet; this only stops the long-press menu on a held button.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => this.reset());
  }

  show() {
    this.active = true;
    this.root?.classList.remove('hidden');
  }

  /** Dim the dash button while the dash is on cooldown. */
  setDashReady(ready) {
    if (ready === this.dashReady) return;
    this.dashReady = ready;
    this.root?.querySelector('.tbtn.dash')?.classList.toggle('cooling', !ready);
  }

  hide() {
    this.active = false;
    this.reset();
    this.root?.classList.add('hidden');
  }

  reset() {
    this.pointers.clear();
    this.stick.x = 0;
    this.stick.y = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.jumpHeld = false;
    this.hideStick();
    for (const el of this.root?.querySelectorAll('.tbtn') ?? []) el.classList.remove('down');
  }

  onDown = (e) => {
    const el = e.target.closest?.('[data-control]');
    if (!el) return;
    const control = el.dataset.control;
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);

    this.pointers.set(e.pointerId, {
      control, element: el, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
    });

    if (control === 'stick') {
      this.placeStick(e.clientX, e.clientY);
      this.moveKnob(0, 0);
    } else if (control === 'jump') {
      this.jumpTapped = true;
      this.jumpHeld = true;
      el.classList.add('down');
    } else if (control === 'dash') {
      this.dashTapped = true;
      el.classList.add('down');
    }
  };

  onMove = (e) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();

    if (p.control === 'stick') {
      let dx = (e.clientX - p.startX) / STICK_RADIUS;
      let dy = (e.clientY - p.startY) / STICK_RADIUS;
      let len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
        len = 1;
        // Let the origin trail a thumb that has slid past full tilt, so the
        // stick stays usable without lifting off.
        p.startX = e.clientX - dx * STICK_RADIUS;
        p.startY = e.clientY - dy * STICK_RADIUS;
      }
      const tilt = len <= DEADZONE ? 0 : (len - DEADZONE) / (1 - DEADZONE);
      const ux = len > 1e-4 ? dx / len : 0;
      const uy = len > 1e-4 ? dy / len : 0;
      this.stick.x = ux * tilt;
      this.stick.y = -uy * tilt; // screen-up is "away from the camera"
      this.placeStick(p.startX, p.startY);
      this.moveKnob(dx * STICK_RADIUS, dy * STICK_RADIUS);
    } else if (p.control === 'look') {
      this.lookDX += (e.clientX - p.lastX) * this.sensitivity;
      this.lookDY += (e.clientY - p.lastY) * this.sensitivity;
    }

    p.lastX = e.clientX;
    p.lastY = e.clientY;
  };

  onUp = (e) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);

    if (p.control === 'stick') {
      this.stick.x = 0;
      this.stick.y = 0;
      this.hideStick();
    } else if (p.control === 'jump') {
      this.jumpHeld = false;
      p.element.classList.remove('down');
    } else if (p.control === 'dash') {
      p.element.classList.remove('down');
    }
  };

  placeStick(x, y) {
    if (!this.stickBase) return;
    this.stickBase.style.transform = `translate(${x}px, ${y}px)`;
    this.stickBase.classList.add('visible');
  }

  moveKnob(dx, dy) {
    if (!this.stickKnob) return;
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  hideStick() {
    this.stickBase?.classList.remove('visible');
    this.moveKnob(0, 0);
  }

  /** Read (and clear) the one-shot taps and accumulated camera drag. */
  consume() {
    const out = {
      jumpTapped: this.jumpTapped,
      dashTapped: this.dashTapped,
      dx: this.lookDX,
      dy: this.lookDY,
    };
    this.jumpTapped = false;
    this.dashTapped = false;
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }
}
