/**
 * Touch controls: a floating virtual stick on the left half of the screen,
 * camera drag on the right half, and JUMP / DASH buttons.
 *
 * The stick reports an analogue vector in the same shape the keyboard produces
 * (`forward` / `right`), so `Player` needs no knowledge of how it was driven.
 * Jump reports both a tap and a held state, which keeps variable jump height
 * working on a phone exactly as it does with the spacebar.
 */
export class TouchControls {
  static isTouchDevice() {
    return (
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
      navigator.maxTouchPoints > 0
    );
  }

  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = TouchControls.isTouchDevice();

    this.moveX = 0;
    this.moveY = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.jumpHeld = false;
    this.jumpTapped = false;
    this.dashTapped = false;

    this.onPause = null;
    this.onRestart = null;

    this.stick = null; // { id, originX, originY }
    this.look = null;  // { id, x, y }
    this.radius = 58;
    this.deadZone = 0.14;
    this.lookSensitivity = 0.0052;

    if (!this.enabled) return;

    document.body.classList.add('touch');
    this.buildUi();
    this.bind();
  }

  buildUi() {
    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    ui.innerHTML = `
      <div class="stick" hidden><div class="knob"></div></div>
      <div class="pad">
        <button class="tbtn dash" type="button" data-act="dash">DASH</button>
        <button class="tbtn jump" type="button" data-act="jump">JUMP</button>
      </div>
      <div class="sys">
        <button class="tbtn tiny" type="button" data-act="pause" aria-label="Pause">❚❚</button>
        <button class="tbtn tiny" type="button" data-act="restart" aria-label="Restart level">↺</button>
      </div>`;
    document.body.appendChild(ui);

    this.ui = ui;
    this.stickEl = ui.querySelector('.stick');
    this.knobEl = ui.querySelector('.knob');

    for (const btn of ui.querySelectorAll('.tbtn')) {
      const act = btn.dataset.act;

      const press = (e) => {
        e.preventDefault();
        btn.classList.add('down');
        btn.setPointerCapture?.(e.pointerId);
        if (act === 'jump') {
          this.jumpHeld = true;
          this.jumpTapped = true;
        } else if (act === 'dash') {
          this.dashTapped = true;
        } else if (act === 'pause') {
          this.onPause?.();
        } else if (act === 'restart') {
          this.onRestart?.();
        }
      };

      const release = (e) => {
        e.preventDefault();
        btn.classList.remove('down');
        if (act === 'jump') this.jumpHeld = false;
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      // a touch that slides off the button still ends the hold
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  bind() {
    const canvas = this.canvas;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);

      if (e.clientX < innerWidth * 0.5) {
        if (this.stick) return; // one stick at a time
        this.stick = { id: e.pointerId, originX: e.clientX, originY: e.clientY };
        this.showStick(e.clientX, e.clientY, 0, 0);
      } else {
        if (this.look) return;
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    }, { passive: false });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;

      if (this.stick && e.pointerId === this.stick.id) {
        e.preventDefault();
        let dx = e.clientX - this.stick.originX;
        let dy = e.clientY - this.stick.originY;
        const dist = Math.hypot(dx, dy);

        // Dragging past the ring drags the ring along, so the stick never
        // "runs out" mid-sprint.
        if (dist > this.radius) {
          const pull = (dist - this.radius) / dist;
          this.stick.originX += dx * pull;
          this.stick.originY += dy * pull;
          dx = e.clientX - this.stick.originX;
          dy = e.clientY - this.stick.originY;
        }

        const nx = dx / this.radius;
        const ny = dy / this.radius;
        const mag = Math.hypot(nx, ny);
        if (mag < this.deadZone) {
          this.moveX = 0;
          this.moveY = 0;
        } else {
          this.moveX = nx;
          this.moveY = -ny; // screen-up is forward
        }
        this.showStick(this.stick.originX, this.stick.originY, dx, dy);
        return;
      }

      if (this.look && e.pointerId === this.look.id) {
        e.preventDefault();
        this.lookDX += (e.clientX - this.look.x) * this.lookSensitivity;
        this.lookDY += (e.clientY - this.look.y) * this.lookSensitivity;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
      }
    }, { passive: false });

    const end = (e) => {
      if (this.stick && e.pointerId === this.stick.id) {
        this.stick = null;
        this.moveX = 0;
        this.moveY = 0;
        this.stickEl.hidden = true;
      }
      if (this.look && e.pointerId === this.look.id) this.look = null;
    };

    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  showStick(x, y, dx, dy) {
    this.stickEl.hidden = false;
    this.stickEl.style.left = `${x}px`;
    this.stickEl.style.top = `${y}px`;
    this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  setVisible(visible) {
    if (!this.enabled) return;
    this.ui.classList.toggle('active', visible);
    if (!visible) this.reset();
  }

  reset() {
    this.stick = null;
    this.look = null;
    this.moveX = 0;
    this.moveY = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.jumpHeld = false;
    this.jumpTapped = false;
    this.dashTapped = false;
    if (this.stickEl) this.stickEl.hidden = true;
    if (this.ui) for (const b of this.ui.querySelectorAll('.tbtn')) b.classList.remove('down');
  }

  /** Current input; one-shot flags (taps, look delta) are cleared by reading. */
  read() {
    const out = {
      moveX: this.moveX,
      moveY: this.moveY,
      lookDX: this.lookDX,
      lookDY: this.lookDY,
      jumpTapped: this.jumpTapped,
      jumpHeld: this.jumpHeld,
      dashTapped: this.dashTapped,
    };
    this.lookDX = 0;
    this.lookDY = 0;
    this.jumpTapped = false;
    this.dashTapped = false;
    return out;
  }
}
