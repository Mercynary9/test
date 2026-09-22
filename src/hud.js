import { ENEMY_TYPES } from './enemies.js';
import { IS_TOUCH } from './touch.js';

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.hearts = document.getElementById('hearts');
    this.coins = document.getElementById('coins');
    this.enemies = document.getElementById('enemies-left');
    this.deaths = document.getElementById('deaths');
    this.levelName = document.getElementById('level-name');
    this.toastEl = document.getElementById('toast');
    this.hint = document.getElementById('hint');
    this.overlay = document.getElementById('overlay');
    this.overlayBody = document.getElementById('overlay-body');
    this.overlayBtn = document.getElementById('overlay-btn');
    this.overlayTip = document.getElementById('overlay-tip');
    this.pauseBtn = document.getElementById('btn-pause');
    this.restartBtn = document.getElementById('btn-restart');
    this.title = this.overlay.querySelector('h1');
    this.sub = this.overlay.querySelector('.sub');
    this.toastTimer = 0;
    this.hintLife = 14;
    this.lastHp = -1;

    this.hint.innerHTML = IS_TOUCH
      ? 'Stick to run · <b>JUMP</b> twice to double jump · <b>DASH</b> to dash'
      : '<b>WASD</b> move · <b>Space</b> jump ×2 · <b>Shift</b> dash · <b>Mouse</b> camera · <b>P</b> pause';
    if (this.overlayTip) {
      this.overlayTip.textContent = IS_TOUCH
        ? 'Hold the phone in two hands: left thumb runs, right thumb jumps.'
        : 'Click the canvas to capture the mouse. Esc releases it.';
    }

    document.getElementById('loading')?.classList.add('hidden');
  }

  show() { this.root.classList.remove('hidden'); }

  /** Give the control reminder a fresh 14 seconds, then let it fade out. */
  refreshHint() {
    this.hintLife = 14;
    this.hint.classList.remove('faded');
  }

  hide() { this.root.classList.add('hidden'); }

  setHearts(hp, max) {
    if (hp === this.lastHp) return;
    this.lastHp = hp;
    let html = '';
    for (let i = 0; i < max; i++) {
      html += `<span class="heart${i < hp ? '' : ' empty'}">${i < hp ? '❤️' : '🤍'}</span>`;
    }
    this.hearts.innerHTML = html;
  }

  setStats({ coins, enemies, deaths, level }) {
    if (coins !== undefined) this.coins.textContent = coins;
    if (enemies !== undefined) this.enemies.textContent = enemies;
    if (deaths !== undefined) this.deaths.textContent = deaths;
    if (level !== undefined) this.levelName.textContent = level;
  }

  toast(message, seconds = 2.6) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  update(dt) {
    if (this.hintLife > 0) {
      this.hintLife -= dt;
      if (this.hintLife <= 0) this.hint.classList.add('faded');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }

  showOverlay({ title, sub, body = '', button, onClick }) {
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.overlayBody.innerHTML = body;
    this.overlayBtn.textContent = button;
    this.overlayBtn.onclick = onClick;
    this.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.overlay.classList.add('hidden');
  }

  /** The three enemy kinds, as shown on the menu and the pause panel. */
  static bestiaryHtml() {
    const rows = Object.values(ENEMY_TYPES).map((e) => `
      <div class="row">
        <span class="dot" style="color:${e.color}"></span>
        <span><span class="name">${e.name}</span><span class="desc">${e.desc}</span></span>
      </div>`).join('');
    return `<div class="bestiary">${rows}</div>`;
  }

  static controlsHtml() {
    return IS_TOUCH
      ? `<div class="controls-help">
           <div><b>Left thumb</b> — drag anywhere on the left to run</div>
           <div><b>JUMP</b> — tap to jump, tap again in the air to double jump; hold for height</div>
           <div><b>DASH</b> — a quick burst forward</div>
           <div><b>Right thumb</b> — drag the screen to swing the camera</div>
         </div>`
      : `<div class="controls-help">
           <div><b>WASD</b> — move</div>
           <div><b>Space</b> — jump, press again for a double jump</div>
           <div><b>Shift</b> — dash</div>
           <div><b>Mouse / arrows</b> — camera · <b>P</b> pause · <b>R</b> restart</div>
         </div>`;
  }
}
