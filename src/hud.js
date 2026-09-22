import { ENEMY_TYPES } from './enemies.js';

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.hearts = document.getElementById('hearts');
    this.coins = document.getElementById('coins');
    this.enemies = document.getElementById('enemies-left');
    this.deaths = document.getElementById('deaths');
    this.levelName = document.getElementById('level-name');
    this.toastEl = document.getElementById('toast');
    this.overlay = document.getElementById('overlay');
    this.overlayBody = document.getElementById('overlay-body');
    this.overlayBtn = document.getElementById('overlay-btn');
    this.title = this.overlay.querySelector('h1');
    this.sub = this.overlay.querySelector('.sub');
    this.toastTimer = 0;
    this.lastHp = -1;
    document.getElementById('loading')?.classList.add('hidden');
  }

  show() { this.root.classList.remove('hidden'); }
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

  toast(message, seconds = 2.4) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  update(dt) {
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
    this.overlayBtn.focus();
  }

  hideOverlay() {
    this.overlay.classList.add('hidden');
  }

  static bestiaryHtml() {
    const rows = Object.values(ENEMY_TYPES).map((e) => `
      <div class="row">
        <span class="dot" style="color:${e.color}"></span>
        <span><span class="name">${e.name}</span><span class="desc">${e.desc}</span></span>
      </div>`).join('');
    return `<div class="bestiary">${rows}</div>`;
  }
}
