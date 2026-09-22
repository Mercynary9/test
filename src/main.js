import * as THREE from 'three';
import { createRenderer, createScene, applyPalette, fovForAspect, MAX_PIXEL_RATIO } from './scene.js';
import { Input } from './input.js';
import { TouchControls, IS_TOUCH, MOBILE_TIER } from './touch.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Fx } from './fx.js';
import { Player, PLAYER } from './player.js';
import { buildLevel } from './level.js';
import { LEVELS } from './levels.js';
import { spawnEnemy, Projectile } from './enemies.js';
import { bodiesOverlap, rayDistance } from './physics.js';

const FIXED_STEP = 1 / 120;
const MAX_SUBSTEPS = 8;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = createRenderer(this.canvas);

    const parts = createScene(LEVELS[0].palette);
    this.sceneParts = parts;
    this.scene = parts.scene;
    this.camera = parts.camera;
    this.sun = parts.sun;

    this.input = new Input(this.canvas);
    this.touch = new TouchControls();
    this.hud = new Hud();
    this.sfx = new Sfx();
    this.fx = new Fx(this.scene);

    this.state = 'menu';
    this.levelIndex = 0;
    this.score = 0;
    this.totalCoins = 0;
    this.totalDefeated = 0;
    this.deaths = 0;

    this.enemies = [];
    this.projectiles = [];
    this.boxes = [];
    this.killY = -25;

    this.yaw = 0;
    this.pitch = MOBILE_TIER ? 0.36 : 0.28; // a touch more top-down on a small screen
    this.camDistance = MOBILE_TIER ? 10 : 11;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.shake = 0;
    this.lookIdle = 0;

    // Dynamic resolution: the phone tier renders below native and climbs back
    // up when there is headroom.
    this.resScale = 1;
    this.frameAvg = 1 / 60;
    this.perfTimer = 0;

    this.lastTime = performance.now();
    this.accumulator = 0;

    for (const event of ['resize', 'orientationchange']) {
      addEventListener(event, this.queueResize);
    }
    // iOS reports a stale innerHeight right after a rotation and while the URL
    // bar collapses, so the viewport is the more reliable signal.
    window.visualViewport?.addEventListener('resize', this.queueResize);

    // Locking the phone or switching apps should not cost you a heart.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    if (!IS_TOUCH) {
      document.addEventListener('pointerlockchange', () => {
        if (this.state === 'playing' && !this.input.locked) this.pause();
      });
    }

    this.hud.pauseBtn.addEventListener('click', () => {
      if (this.state === 'playing') {
        this.input.release();
        this.pause();
      } else if (this.state === 'paused') {
        this.resume();
      }
    });
    this.hud.restartBtn.addEventListener('click', () => {
      if (this.state !== 'menu') this.loadLevel(this.levelIndex);
    });

    this.resize();
    this.showMenu();
    requestAnimationFrame(this.frame);
  }

  queueResize = () => {
    this.resize();
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.resize(), 260);
  };

  resize() {
    const aspect = innerWidth / innerHeight;
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(aspect);
    this.camera.updateProjectionMatrix();
    // Portrait sees less to either side, so the camera sits closer in.
    this.camDistance = MOBILE_TIER ? (aspect < 1 ? 9 : 10.5) : 11;
    this.applyResolution();
  }

  applyResolution() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO) * this.resScale);
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  /** Full screen hides the browser chrome, which is most of a phone's HUD room. */
  async enterFullscreen() {
    if (!IS_TOUCH || document.fullscreenElement) return;
    try {
      await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    } catch {
      /* Refused (iOS Safari, or a user gesture the browser did not like) — the
         game plays fine in the normal viewport. */
    }
  }

  /* ---------------------------------------------------------------- *
   *  Level lifecycle
   * ---------------------------------------------------------------- */

  showMenu() {
    this.state = 'menu';
    this.hud.hide();
    this.touch.hide();
    this.hud.showOverlay({
      title: 'Sky Stomp',
      sub: 'Four levels. Three kinds of enemy.',
      body: Hud.bestiaryHtml() + Hud.controlsHtml(),
      button: 'Start',
      onClick: () => this.startRun(),
    });
  }

  startRun() {
    this.totalCoins = 0;
    this.totalDefeated = 0;
    this.deaths = 0;
    this.score = 0;
    this.enterFullscreen();
    this.loadLevel(0);
  }

  loadLevel(index) {
    this.levelIndex = index;
    const data = LEVELS[index];

    if (this.level) this.level.dispose();
    for (const e of this.enemies) e.destroy();
    for (const p of this.projectiles) p.destroy();
    if (this.player) this.scene.remove(this.player.group);
    this.fx.clear();

    this.enemies = [];
    this.projectiles = [];

    applyPalette(this.sceneParts, data.palette);

    this.level = buildLevel(this.scene, data);
    this.boxes = this.level.boxes;
    this.killY = this.level.killY;
    this.respawnPoint = this.level.spawn.clone();

    this.player = new Player(this, this.level.spawn.clone());

    for (const spec of data.enemies) {
      this.enemies.push(spawnEnemy(this, spec.type, new THREE.Vector3(...spec.at), spec.cfg ?? {}));
    }

    this.levelCoins = 0;
    this.levelDefeated = 0;
    this.levelTime = 0;
    this.enemyTotal = this.enemies.length;

    // snap the camera behind the player rather than sweeping in from the last level
    this.yaw = 0;
    this.pitch = MOBILE_TIER ? 0.36 : 0.28;
    this.lookIdle = 0;
    this.camPos.copy(this.player.pos).add(new THREE.Vector3(0, 4, this.camDistance));
    this.camera.position.copy(this.camPos);

    this.hud.show();
    this.hud.hideOverlay();
    this.hud.lastHp = -1;
    this.refreshHud();
    this.hud.toast(data.intro, 4.5);
    this.hud.refreshHint();
    if (IS_TOUCH) this.touch.show();

    this.state = 'playing';
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.sfx.resume();
    this.input.capture(this.canvas);
  }

  refreshHud() {
    this.hud.setHearts(this.player.hp, PLAYER.maxHp);
    this.hud.setStats({
      coins: this.totalCoins + this.levelCoins,
      enemies: this.remainingThreats(),
      deaths: this.deaths,
      level: `${this.levelIndex + 1}/${LEVELS.length} · ${LEVELS[this.levelIndex].name}`,
    });
  }

  /** Stompable enemies still standing. Spikers are hazards, not a tally. */
  remainingThreats() {
    return this.enemies.reduce((n, e) => n + (e.alive && e.countsAsThreat ? 1 : 0), 0);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.touch.hide();
    this.hud.showOverlay({
      title: 'Paused',
      sub: `${LEVELS[this.levelIndex].name} — ${this.remainingThreats()} enemies left`,
      body: Hud.bestiaryHtml() + Hud.controlsHtml(),
      button: 'Resume',
      onClick: () => this.resume(),
    });
  }

  resume() {
    if (this.state !== 'paused') return;
    this.hud.hideOverlay();
    if (IS_TOUCH) this.touch.show();
    this.state = 'playing';
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.sfx.resume();
    this.input.capture(this.canvas);
  }

  completeLevel() {
    if (this.state !== 'playing') return; // touching the star is a one-time event
    this.state = 'complete';
    this.sfx.win();
    this.fx.burst(this.level.goalPos, 0xffd257, 34, { spread: 12, up: 10, life: 1.3 });
    this.fx.ring(this.level.goalPos, 0xffe38a, 9, 0.8);
    this.input.release();
    this.touch.hide();

    this.totalCoins += this.levelCoins;
    this.totalDefeated += this.levelDefeated;

    const last = this.levelIndex >= LEVELS.length - 1;
    const stats = `<p class="stat-line">
      Coins <b>${this.levelCoins}</b> ·
      Enemies stomped <b>${this.levelDefeated}</b> ·
      Falls <b>${this.deaths}</b> ·
      Score <b>${this.score ?? 0}</b>
    </p>`;

    if (last) {
      this.hud.showOverlay({
        title: 'You win!',
        sub: 'Every level cleared.',
        body: `${stats}<p class="stat-line">Total coins <b>${this.totalCoins}</b> · Total stomped <b>${this.totalDefeated}</b> · Final score <b>${this.score ?? 0}</b></p>`,
        button: 'Play again',
        onClick: () => this.startRun(),
      });
    } else {
      this.hud.showOverlay({
        title: `${LEVELS[this.levelIndex].name} cleared`,
        sub: `Next up: ${LEVELS[this.levelIndex + 1].name}`,
        body: stats,
        button: 'Next level',
        onClick: () => this.loadLevel(this.levelIndex + 1),
      });
    }
  }

  /* ---------------------------------------------------------------- *
   *  Hooks used by entities
   * ---------------------------------------------------------------- */

  spawnProjectile(pos, vel, owner) {
    this.projectiles.push(new Projectile(this, pos, vel, owner));
  }

  onEnemyDefeated(enemy, cause) {
    if (enemy.countsAsThreat) this.levelDefeated++;
    this.addScore(100);
    if (cause === 'stomp') this.sfx.stomp();
    this.shake = Math.max(this.shake, 0.16);
  }

  addScore(points) {
    this.score = (this.score ?? 0) + points;
  }

  toast(message) {
    this.hud.toast(message);
  }

  /* ---------------------------------------------------------------- *
   *  Simulation
   * ---------------------------------------------------------------- */

  fixedUpdate(dt, intent) {
    this.levelTime += dt;
    this.level.update(dt);
    this.player.update(dt, intent);

    for (const enemy of this.enemies.slice()) {
      if (enemy.alive) enemy.update(dt);
    }
    for (const p of this.projectiles.slice()) {
      if (p.alive) p.update(dt);
    }

    this.resolveContacts();

    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    if (this.state === 'playing') this.checkFate();
  }

  resolveContacts() {
    const player = this.player;
    if (player.dead) return;

    /* --- enemies --- */
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (!bodiesOverlap(player.body, enemy.body, 0.04)) continue;

      const falling = player.body.vel.y < -0.6;
      const aboveHead = player.feet > enemy.top - Math.min(0.5, enemy.height * 0.45);
      const stomping = falling && aboveHead && player.pos.y > enemy.pos.y;

      const result = stomping ? enemy.onStomp() : enemy.onTouch();

      if (result?.hurt) {
        if (player.hurt(result.hurt === true ? 1 : result.hurt, enemy.pos)) {
          this.sfx.hurt();
          this.shake = Math.max(this.shake, 0.35);
          this.refreshHud();
        }
        if (stomping) player.bounce(result.bounce ?? 0.5);
      } else if (result?.bounce) {
        player.bounce(result.bounce);
        this.sfx.bounce();
      }
    }

    /* --- projectiles --- */
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      if (!bodiesOverlap(player.body, p.body, 0.05)) continue;
      if (player.hurt(p.damage, p.pos)) {
        this.sfx.hurt();
        this.shake = Math.max(this.shake, 0.3);
        this.refreshHud();
      }
      p.pop();
    }

    /* --- coins --- */
    for (const coin of this.level.coins) {
      if (coin.taken) continue;
      if (player.pos.distanceToSquared(coin.mesh.position) > 1.8) continue;
      coin.taken = true;
      coin.mesh.visible = false;
      this.levelCoins++;
      this.addScore(10);
      this.sfx.coin();
      this.fx.burst(coin.mesh.position, 0xffd257, 7, { spread: 3, up: 3, size: 0.1, life: 0.4 });
      this.refreshHud();
    }

    /* --- checkpoints --- */
    for (const cp of this.level.checkpoints) {
      if (cp.active) continue;
      if (player.pos.distanceToSquared(cp.pos) > 4.5) continue;
      this.level.activateCheckpoint(cp);
      this.respawnPoint.copy(cp.pos).add(new THREE.Vector3(0, 1.2, 0));
      this.sfx.checkpoint();
      this.hud.toast('Checkpoint reached');
      this.fx.ring(cp.pos, 0x6bf0a8, 3, 0.4);
    }

    /* --- goal --- */
    if (player.pos.distanceTo(this.level.goalPos) < 2.2) this.completeLevel();
  }

  checkFate() {
    const player = this.player;
    if (player.dead) {
      if (player.deadTimer > 1.1) this.respawn();
      return;
    }
    if (player.hp <= 0 || player.pos.y < this.killY) {
      player.kill();
      this.sfx.die();
      this.deaths++;
      this.refreshHud();
    }
  }

  respawn() {
    this.player.respawn(this.respawnPoint);
    this.fx.ring(this.respawnPoint, 0x63d2ff, 3, 0.4);
    this.refreshHud();
  }

  /* ---------------------------------------------------------------- *
   *  Camera
   * ---------------------------------------------------------------- */

  updateCamera(dt, look) {
    const turnKeys = (this.input.down('ArrowRight') ? 1 : 0) - (this.input.down('ArrowLeft') ? 1 : 0);
    const pitchKeys = (this.input.down('ArrowDown') ? 1 : 0) - (this.input.down('ArrowUp') ? 1 : 0);

    const manual = Math.abs(look.dx) > 1e-4 || Math.abs(look.dy) > 1e-4 || turnKeys || pitchKeys;
    this.lookIdle = manual ? 0 : this.lookIdle + dt;

    this.yaw -= look.dx + turnKeys * 2.0 * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.dy + pitchKeys * 1.4 * dt, -0.3, 1.05);

    // Thumb-friendly assist: with no drag for a moment, the camera drifts around
    // behind the direction of travel so one thumb can steer the whole level.
    if (IS_TOUCH && this.state === 'playing' && this.lookIdle > 0.45 && !this.player.dead) {
      const v = this.player.body.vel;
      const speed = Math.hypot(v.x, v.z);
      if (speed > 2.2) {
        const wanted = Math.atan2(-v.x, -v.z);
        let diff = (wanted - this.yaw) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * Math.min(1, dt * 1.6);
      }
    }

    const target = this.player.pos.clone();
    target.y += 1.0;

    const cosP = Math.cos(this.pitch);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * cosP,
      Math.sin(this.pitch) + 0.28,
      Math.cos(this.yaw) * cosP,
    ).normalize();

    // keep walls from sitting between the camera and the player
    const clearance = rayDistance(this.boxes, target, offset, this.camDistance) - 0.45;
    const distance = THREE.MathUtils.clamp(clearance, 3.2, this.camDistance);

    const wanted = target.clone().addScaledVector(offset, distance);
    this.camPos.lerp(wanted, 1 - Math.exp(-14 * dt));
    this.camTarget.lerp(target, 1 - Math.exp(-18 * dt));

    this.camera.position.copy(this.camPos);
    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 2.4);
      const s = this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camTarget);

    // keep the shadow frustum centred on the action
    this.sun.position.copy(this.player.pos).add(new THREE.Vector3(24, 42, 18));
    this.sun.target.position.copy(this.player.pos);
    this.sun.target.updateMatrixWorld();

    this.sceneParts.sky.position.copy(this.camera.position);
  }

  /* ---------------------------------------------------------------- *
   *  Frame
   * ---------------------------------------------------------------- */

  /** Trade resolution for frame rate when a device cannot keep up, and back. */
  updatePerf(dt) {
    this.frameAvg += (dt - this.frameAvg) * 0.08;
    this.perfTimer += dt;
    if (this.perfTimer < 1.5) return;
    this.perfTimer = 0;

    const before = this.resScale;
    if (this.frameAvg > 1 / 45 && this.resScale > 0.62) {
      this.resScale = Math.max(0.62, this.resScale - 0.12);
    } else if (this.frameAvg < 1 / 58 && this.resScale < 1) {
      this.resScale = Math.min(1, this.resScale + 0.1);
    }
    if (before !== this.resScale) this.applyResolution();
  }

  frame = (now) => {
    requestAnimationFrame(this.frame);

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Read taps before consume() clears them.
    const keyJump = this.input.tapped('Space');
    const keyDash = this.input.tapped('ShiftLeft', 'ShiftRight');
    const restart = this.input.tapped('KeyR');
    const pauseTapped = this.input.tapped('KeyP');
    const mouse = this.input.consume();
    const pad = this.touch.consume();

    if (this.state === 'playing' || this.state === 'paused') {
      if (restart) {
        this.loadLevel(this.levelIndex);
        return;
      }
      if (pauseTapped) {
        if (this.state === 'playing') { this.input.release(); this.pause(); } else this.resume();
      }
    }

    if (this.state === 'playing') {
      const stick = this.touch.stick;
      const intent = {
        forward: THREE.MathUtils.clamp(
          (this.input.down('KeyW') ? 1 : 0) - (this.input.down('KeyS') ? 1 : 0) + stick.y, -1, 1),
        right: THREE.MathUtils.clamp(
          (this.input.down('KeyD') ? 1 : 0) - (this.input.down('KeyA') ? 1 : 0) + stick.x, -1, 1),
        jumpTapped: keyJump || pad.jumpTapped,
        jumpHeld: this.input.down('Space') || this.touch.jumpHeld,
        dashTapped: keyDash || pad.dashTapped,
        yaw: this.yaw,
      };

      this.accumulator = Math.min(this.accumulator + dt, FIXED_STEP * MAX_SUBSTEPS);
      let first = true;
      while (this.accumulator >= FIXED_STEP) {
        this.accumulator -= FIXED_STEP;
        this.fixedUpdate(FIXED_STEP, {
          ...intent,
          jumpTapped: first ? intent.jumpTapped : false,
          dashTapped: first ? intent.dashTapped : false,
        });
        first = false;
        if (this.state !== 'playing') break;
      }

      this.refreshHud();
    }

    if (this.player && this.level) {
      const look = this.state === 'playing'
        ? { dx: mouse.dx + pad.dx, dy: mouse.dy + pad.dy }
        : { dx: 0, dy: 0 };
      this.updateCamera(dt, look);
      if (this.state !== 'playing') this.level.update(dt * 0.35);
    }

    if (this.player) this.touch.setDashReady(this.player.dashCooldown <= 0);

    this.fx.update(dt);
    this.hud.update(dt);
    this.updatePerf(dt);
    this.renderer.render(this.scene, this.camera);
  };
}

// exposed for debugging from the console: window.game.player, window.game.enemies, ...
window.game = new Game();
