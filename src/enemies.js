import * as THREE from 'three';
import { geo, mat } from './scene.js';
import { makeBody, moveAndCollide, groundBelow } from './physics.js';

/* ------------------------------------------------------------------ *
 *  Shared base
 * ------------------------------------------------------------------ */

export class Entity {
  constructor(game) {
    this.game = game;
    this.alive = true;
    this.group = new THREE.Group();
    game.scene.add(this.group);
  }

  destroy() {
    this.alive = false;
    this.game.scene.remove(this.group);
  }
}

export class Enemy extends Entity {
  constructor(game, pos, cfg = {}) {
    super(game);
    this.type = cfg.type ?? 'enemy';
    this.label = cfg.label ?? 'Enemy';
    this.color = cfg.color ?? 0xffffff;
    this.radius = cfg.radius ?? 0.55;
    this.height = cfg.height ?? this.radius * 2;
    this.speed = cfg.speed ?? 3.2;
    this.aggro = cfg.aggro ?? 17;
    this.patrol = cfg.patrol ?? 2.4;
    this.gravity = cfg.gravity ?? -32;
    this.flying = cfg.flying ?? false;
    this.spiked = cfg.spiked ?? false;
    this.stompable = cfg.stompable ?? true;
    this.contactDamage = cfg.contactDamage ?? 1;
    this.countsAsThreat = true;

    this.body = makeBody(pos, new THREE.Vector3(this.radius * 2, this.height, this.radius * 2));
    this.home = pos.clone();
    this.grounded = false;
    this.facing = Math.random() * Math.PI * 2;
    this.t = Math.random() * 20;
    this.phase = Math.random() * Math.PI * 2;
    this.alerted = false;

    this.roll = new THREE.Group();
    this.face = new THREE.Group();
    this.group.add(this.roll, this.face);
  }

  get pos() { return this.body.pos; }
  get top() { return this.body.pos.y + this.height * 0.5; }
  get bottom() { return this.body.pos.y - this.height * 0.5; }

  /* --- movement helpers --- */

  toPlayer() {
    const v = new THREE.Vector3().subVectors(this.game.player.pos, this.pos);
    v.y = 0;
    return v;
  }

  groundAheadOf(dir, lookahead = 0.75) {
    const x = this.pos.x + dir.x * (this.radius + lookahead);
    const z = this.pos.z + dir.z * (this.radius + lookahead);
    return groundBelow(this.game.boxes, x, z, this.bottom + 0.2, 1.3);
  }

  wanderDir() {
    const target = new THREE.Vector3(
      this.home.x + Math.cos(this.t * 0.55 + this.phase) * this.patrol,
      this.pos.y,
      this.home.z + Math.sin(this.t * 0.55 + this.phase) * this.patrol,
    );
    const d = target.sub(this.pos);
    d.y = 0;
    return d.lengthSq() < 0.05 ? new THREE.Vector3() : d.normalize();
  }

  /** Direction to move this frame: toward the player when aggroed, else patrol. */
  steer() {
    const to = this.toPlayer();
    const dist = to.length();
    const player = this.game.player;
    const reachable = !player.dead && dist < this.aggro && Math.abs(player.pos.y - this.pos.y) < 9;
    this.alerted = reachable;

    let dir = reachable && dist > 0.001 ? to.divideScalar(dist) : this.wanderDir();
    if (dir.lengthSq() < 0.001) return dir;

    // Don't walk off the edge of the platform we're standing on.
    if (!this.flying && this.grounded && !this.groundAheadOf(dir)) {
      const left = new THREE.Vector3(dir.z, 0, -dir.x);
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      if (this.groundAheadOf(left)) dir = left;
      else if (this.groundAheadOf(right)) dir = right;
      else dir = new THREE.Vector3();
    }
    return dir;
  }

  driveHorizontal(dir, dt, speed = this.speed, accel = 24) {
    const tx = dir.x * speed;
    const tz = dir.z * speed;
    const a = accel * dt;
    this.body.vel.x += THREE.MathUtils.clamp(tx - this.body.vel.x, -a, a);
    this.body.vel.z += THREE.MathUtils.clamp(tz - this.body.vel.z, -a, a);
    if (dir.lengthSq() > 0.01) this.facing = Math.atan2(dir.x, dir.z);
  }

  integrate(dt) {
    if (!this.flying) this.body.vel.y += this.gravity * dt;
    const contacts = moveAndCollide(this.body, this.game.boxes, dt);
    this.grounded = contacts.grounded;
    if (this.body.pos.y < this.game.killY) this.destroy();
    return contacts;
  }

  /* --- presentation --- */

  applyRoll(dt) {
    const v = this.body.vel;
    const speed = Math.hypot(v.x, v.z);
    if (speed < 0.02) return;
    const axis = new THREE.Vector3(v.z, 0, -v.x).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(axis, (speed * dt) / Math.max(0.25, this.radius));
    this.roll.quaternion.premultiply(q);
  }

  syncMesh(dt) {
    this.group.position.copy(this.body.pos);
    this.face.rotation.y = this.facing;
    this.applyRoll(dt);
  }

  /* --- interactions --- */

  update(dt) {
    this.t += dt;
    this.driveHorizontal(this.steer(), dt);
    this.integrate(dt);
    this.syncMesh(dt);
  }

  /** Player landed on our head. Return { bounce, hurt }. */
  onStomp() {
    if (!this.stompable) return { bounce: 0.45, hurt: true };
    this.die('stomp');
    return { bounce: 1 };
  }

  /** Player ran into our side. */
  onTouch() {
    return { hurt: this.contactDamage };
  }

  die(cause = 'stomp') {
    if (!this.alive) return;
    this.game.fx.burst(this.pos, this.color, cause === 'explosion' ? 18 : 13, { spread: 6, up: 5.5 });
    this.destroy();
    this.game.onEnemyDefeated(this, cause);
  }
}

/* ------------------------------------------------------------------ *
 *  Shared bits of decoration
 * ------------------------------------------------------------------ */

function addEyes(parent, { y = 0.22, spread = 0.26, size = 0.14, depth = 0.5, angry = false } = {}) {
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(geo.lowSphere, mat(0xffffff, { roughness: 0.2 }));
    white.scale.setScalar(size);
    white.position.set(side * spread, y, depth);
    parent.add(white);

    const pupil = new THREE.Mesh(geo.lowSphere, mat(0x101426, { roughness: 0.2 }));
    pupil.scale.setScalar(size * 0.52);
    pupil.position.set(side * spread * 1.03, y - size * 0.05, depth + size * 0.62);
    parent.add(pupil);

    if (angry) {
      const brow = new THREE.Mesh(geo.box, mat(0x1a1020, { roughness: 0.5 }));
      brow.scale.set(size * 1.7, size * 0.42, size * 0.42);
      brow.position.set(side * spread, y + size * 0.95, depth + size * 0.3);
      brow.rotation.z = side * 0.5;
      parent.add(brow);
    }
  }
}

function addSpikes(parent, radius, count = 14, color = 0xdfe6f5, length = 0.42) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const dir = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
    const spike = new THREE.Mesh(geo.cone, mat(color, { roughness: 0.35, metalness: 0.4 }));
    spike.scale.set(radius * 0.3, radius * length * 2, radius * 0.3);
    spike.position.copy(dir).multiplyScalar(radius * 0.95);
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    spike.castShadow = true;
    parent.add(spike);
  }
}

function sphereBody(radius, color, opts = {}) {
  const mesh = new THREE.Mesh(geo.sphere, mat(color, { roughness: 0.42, metalness: 0.08, ...opts }));
  mesh.scale.setScalar(radius);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------ *
 *  1. Ball — chases you, stompable
 * ------------------------------------------------------------------ */

export class Ball extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'ball', label: 'Ball', color: 0x36d6a6, radius: 0.55, speed: 3.6, ...cfg,
    });
    this.roll.add(sphereBody(this.radius, this.color));
    addEyes(this.face, { y: this.radius * 0.35, spread: this.radius * 0.42, size: this.radius * 0.26, depth: this.radius * 0.86 });
  }
}

/* ------------------------------------------------------------------ *
 *  2. Spike Ball — chases you, NOT stompable
 * ------------------------------------------------------------------ */

export class SpikeBall extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'spike_ball', label: 'Spike Ball', color: 0x99a6c2, radius: 0.55,
      speed: 2.9, spiked: true, stompable: false, ...cfg,
    });
    this.roll.add(sphereBody(this.radius, this.color, { metalness: 0.5, roughness: 0.3 }));
    addSpikes(this.roll, this.radius, 16);
    addEyes(this.face, { y: this.radius * 0.3, spread: this.radius * 0.4, size: this.radius * 0.24, depth: this.radius * 1.12, angry: true });
  }
}

/* ------------------------------------------------------------------ *
 *  3. Shell Ball — shoots; stomping it leaves a kickable shell
 * ------------------------------------------------------------------ */

export class ShellBall extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'shell_ball', label: 'Shell Ball', color: 0xffc94d, radius: 0.58,
      speed: 1.5, patrol: 1.6, aggro: 24, ...cfg,
    });
    this.range = cfg.range ?? 22;
    this.fireInterval = cfg.fireInterval ?? 1.9;
    this.fireTimer = 0.7 + Math.random();

    this.roll.add(sphereBody(this.radius, this.color));

    const shell = new THREE.Mesh(geo.dome, mat(0xe0742a, { roughness: 0.4 }));
    shell.scale.setScalar(this.radius * 1.06);
    shell.position.y = this.radius * 0.1;
    shell.castShadow = true;
    this.roll.add(shell);

    const muzzle = new THREE.Mesh(geo.cylinder, mat(0x3b4664, { roughness: 0.3, metalness: 0.5 }));
    muzzle.scale.set(this.radius * 0.2, this.radius * 0.7, this.radius * 0.2);
    muzzle.rotation.x = Math.PI * 0.5;
    muzzle.position.set(0, this.radius * 0.05, this.radius * 1.0);
    this.face.add(muzzle);

    addEyes(this.face, { y: this.radius * 0.42, spread: this.radius * 0.4, size: this.radius * 0.24, depth: this.radius * 0.82 });
  }

  update(dt) {
    this.t += dt;

    // Shell Balls hold their ground and take aim rather than charging.
    const to = this.toPlayer();
    const dist = to.length();
    const canSee = !this.game.player.dead && dist < this.range;

    if (canSee) {
      this.facing = Math.atan2(to.x, to.z);
      this.driveHorizontal(new THREE.Vector3(), dt, 0, 18);
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval;
        this.shoot();
      }
    } else {
      this.driveHorizontal(this.steer(), dt, this.speed);
      this.fireTimer = Math.min(this.fireTimer, 0.8);
    }

    this.integrate(dt);
    this.syncMesh(dt);
  }

  shoot() {
    const target = this.game.player.pos.clone();
    const origin = this.pos.clone();
    origin.y += this.radius * 0.1;
    const dir = target.sub(origin);
    dir.y += 0.2;
    if (dir.lengthSq() < 0.001) return;
    dir.normalize();
    origin.addScaledVector(dir, this.radius + 0.25);
    this.game.spawnProjectile(origin, dir.multiplyScalar(13), this);
    this.game.sfx.shoot();
  }

  onStomp() {
    // The body is defeated; the shell it was wearing drops as a kickable prop.
    this.game.fx.burst(this.pos, this.color, 12, { spread: 5, up: 5 });
    const shell = new Shell(this.game, this.pos.clone());
    this.game.enemies.push(shell);
    this.destroy();
    this.game.onEnemyDefeated(this, 'stomp');
    this.game.toast('Shell popped — walk into it to kick!');
    return { bounce: 1 };
  }
}

/* ------------------------------------------------------------------ *
 *  3b. The kickable shell left behind by a Shell Ball
 * ------------------------------------------------------------------ */

export class Shell extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'shell', label: 'Shell', color: 0xe0742a, radius: 0.46,
      height: 0.62, speed: 0, stompable: true, ...cfg,
    });
    this.countsAsThreat = false;
    this.state = 'idle';
    this.kickSpeed = 17;
    this.kickGrace = 0;

    const dome = new THREE.Mesh(geo.dome, mat(0xe0742a, { roughness: 0.38 }));
    dome.scale.set(this.radius, this.radius * 0.9, this.radius);
    dome.position.y = -0.18;
    dome.castShadow = true;
    this.roll.add(dome);

    const rim = new THREE.Mesh(geo.cylinder, mat(0xffe3a6, { roughness: 0.45 }));
    rim.scale.set(this.radius * 1.0, 0.12, this.radius * 1.0);
    rim.position.y = -0.2;
    rim.castShadow = true;
    this.roll.add(rim);
  }

  kick(dir) {
    this.state = 'moving';
    const d = dir.clone();
    d.y = 0;
    if (d.lengthSq() < 0.001) d.set(0, 0, 1);
    d.normalize();
    this.body.vel.x = d.x * this.kickSpeed;
    this.body.vel.z = d.z * this.kickSpeed;
    // nudge clear of the kicker and stay harmless for a moment, so the kick
    // itself never costs you a heart
    this.body.pos.addScaledVector(d, 0.25);
    this.kickGrace = 0.3;
    this.game.sfx.kick();
    this.game.fx.burst(this.pos, 0xffe3a6, 8, { spread: 4, up: 3, life: 0.35 });
  }

  stop() {
    this.state = 'idle';
    this.body.vel.x = 0;
    this.body.vel.z = 0;
  }

  update(dt) {
    this.t += dt;
    this.kickGrace = Math.max(0, this.kickGrace - dt);
    const prevX = this.body.vel.x;
    const prevZ = this.body.vel.z;

    if (this.state === 'idle') {
      this.body.vel.x *= Math.max(0, 1 - 12 * dt);
      this.body.vel.z *= Math.max(0, 1 - 12 * dt);
      this.group.position.y = this.body.pos.y + Math.sin(this.t * 3) * 0.02;
    }

    const contacts = this.integrate(dt);
    if (!this.alive) return;

    if (this.state === 'moving') {
      // ricochet off walls instead of stopping dead
      if (contacts.wallX) this.body.vel.x = -prevX;
      if (contacts.wallZ) this.body.vel.z = -prevZ;
      if (contacts.wallX || contacts.wallZ) this.game.sfx.bounce();

      // a rolling shell wipes out anything it touches
      for (const other of this.game.enemies) {
        if (other === this || !other.alive || other.type === 'shell') continue;
        if (Math.abs(other.pos.x - this.pos.x) < other.radius + this.radius &&
            Math.abs(other.pos.z - this.pos.z) < other.radius + this.radius &&
            Math.abs(other.pos.y - this.pos.y) < (other.height + this.height) * 0.6) {
          other.die('shell');
          this.game.addScore(50);
        }
      }
    }

    this.syncMesh(dt);
  }

  onStomp() {
    if (this.state === 'moving') {
      this.stop();
      return { bounce: 0.85 };
    }
    return { bounce: 0.85 };
  }

  onTouch() {
    if (this.state === 'moving') return { hurt: this.kickGrace > 0 ? 0 : 1 };
    const dir = new THREE.Vector3().subVectors(this.pos, this.game.player.pos);
    this.kick(dir);
    return { hurt: 0 };
  }
}

/* ------------------------------------------------------------------ *
 *  4. Red Ball — chases and jumps at the same time, stompable
 * ------------------------------------------------------------------ */

export class RedBall extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'red_ball', label: 'Red Ball', color: 0xff4d55, radius: 0.55, speed: 4.2, ...cfg,
    });
    this.jumpSpeed = cfg.jumpSpeed ?? 12.5;
    this.jumpInterval = cfg.jumpInterval ?? 1.05;
    this.jumpTimer = Math.random() * this.jumpInterval;
    this.buildVisual();
  }

  buildVisual() {
    this.roll.add(sphereBody(this.radius, this.color));
    addEyes(this.face, { y: this.radius * 0.35, spread: this.radius * 0.42, size: this.radius * 0.26, depth: this.radius * 0.86, angry: true });
  }

  update(dt) {
    this.t += dt;
    this.driveHorizontal(this.steer(), dt, this.speed, 30);

    this.jumpTimer -= dt;
    if (this.grounded && this.jumpTimer <= 0) {
      // hop higher when the player is above us, so it can follow you up
      const above = this.game.player.pos.y - this.pos.y;
      this.body.vel.y = this.jumpSpeed * (above > 1.5 ? 1.15 : 1);
      this.jumpTimer = this.jumpInterval * (0.75 + Math.random() * 0.5);
      this.grounded = false;
    }

    this.integrate(dt);

    // squash on landing for a springy read
    const stretch = THREE.MathUtils.clamp(1 + this.body.vel.y * 0.012, 0.82, 1.2);
    this.roll.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    this.syncMesh(dt);
  }
}

/* ------------------------------------------------------------------ *
 *  5. Horn Red Ball — like a Red Ball, but the spike makes it unstompable
 * ------------------------------------------------------------------ */

export class HornRedBall extends RedBall {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'horn_red_ball', label: 'Horn Red Ball', color: 0xd92b4a,
      speed: 4.0, spiked: true, stompable: false, ...cfg,
    });
  }

  buildVisual() {
    this.roll.add(sphereBody(this.radius, this.color));

    const horn = new THREE.Mesh(geo.cone, mat(0xf4f7ff, { roughness: 0.25, metalness: 0.45 }));
    horn.scale.set(this.radius * 0.36, this.radius * 1.15, this.radius * 0.36);
    horn.position.y = this.radius * 1.05;
    horn.castShadow = true;
    this.roll.add(horn);

    for (const side of [-1, 1]) {
      const sideHorn = new THREE.Mesh(geo.cone, mat(0xf4f7ff, { roughness: 0.25, metalness: 0.45 }));
      sideHorn.scale.set(this.radius * 0.24, this.radius * 0.7, this.radius * 0.24);
      sideHorn.position.set(side * this.radius * 0.72, this.radius * 0.62, 0);
      sideHorn.rotation.z = side * -0.75;
      sideHorn.castShadow = true;
      this.roll.add(sideHorn);
    }

    addEyes(this.face, { y: this.radius * 0.3, spread: this.radius * 0.42, size: this.radius * 0.26, depth: this.radius * 0.86, angry: true });
  }
}

/* ------------------------------------------------------------------ *
 *  6. Flyer Ball — hovers out of reach and dive-bombs, stompable
 * ------------------------------------------------------------------ */

export class FlyerBall extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'flyer_ball', label: 'Flyer Ball', color: 0xb47bff, radius: 0.5,
      speed: 3.0, flying: true, aggro: 20, patrol: 3.2, ...cfg,
    });
    this.hoverY = pos.y;
    this.diveRange = cfg.diveRange ?? 8;
    this.diveCooldown = 1.2 + Math.random();
    this.diving = 0;

    this.roll.add(sphereBody(this.radius, this.color));
    addEyes(this.face, { y: this.radius * 0.3, spread: this.radius * 0.4, size: this.radius * 0.26, depth: this.radius * 0.86 });

    this.wings = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(geo.box, mat(0xf0e4ff, { roughness: 0.4, transparent: true, opacity: 0.85 }));
      wing.scale.set(this.radius * 1.5, this.radius * 0.1, this.radius * 0.8);
      wing.position.set(side * this.radius * 1.1, this.radius * 0.5, 0);
      this.face.add(wing);
      this.wings.push({ mesh: wing, side });
    }
  }

  update(dt) {
    this.t += dt;
    const to = this.toPlayer();
    const dist = to.length();
    const player = this.game.player;
    const chasing = !player.dead && dist < this.aggro;

    this.diveCooldown -= dt;

    if (this.diving > 0) {
      this.diving -= dt;
      const target = new THREE.Vector3().subVectors(this.diveTarget, this.pos);
      if (target.lengthSq() > 0.04) {
        target.normalize().multiplyScalar(13);
        this.body.vel.lerp(target, Math.min(1, dt * 7));
      }
      if (this.diving <= 0) this.diveCooldown = 1.6;
    } else {
      const dir = chasing && dist > 0.001 ? to.divideScalar(dist) : this.wanderDir();
      this.driveHorizontal(dir, dt, this.speed, 16);

      const bob = Math.sin(this.t * 2.1 + this.phase) * 0.5;
      const wantY = (chasing ? player.pos.y + 3.0 : this.hoverY) + bob;
      this.body.vel.y += THREE.MathUtils.clamp((wantY - this.pos.y) * 4 - this.body.vel.y, -30 * dt, 30 * dt) * 6;
      this.body.vel.y = THREE.MathUtils.clamp(this.body.vel.y, -9, 9);

      if (chasing && dist < this.diveRange && this.diveCooldown <= 0 && player.pos.y < this.pos.y) {
        this.diving = 0.55;
        this.diveTarget = player.pos.clone();
        this.game.sfx.tone(820, 0.18, { slide: -520, type: 'sawtooth', gain: 0.4 });
      }
    }

    this.integrate(dt);
    if (!this.alive) return;

    const flap = Math.sin(this.t * (this.diving > 0 ? 34 : 17)) * 0.8;
    for (const w of this.wings) w.mesh.rotation.z = w.side * (0.25 + flap * 0.5);

    this.group.position.copy(this.body.pos);
    this.face.rotation.y = this.facing;
    this.roll.rotation.x = this.diving > 0 ? 0.6 : Math.sin(this.t * 2) * 0.1;
  }
}

/* ------------------------------------------------------------------ *
 *  7. Bomb Ball — chases; stomping lights the fuse instead of killing it
 * ------------------------------------------------------------------ */

export class BombBall extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'bomb_ball', label: 'Bomb Ball', color: 0x2c3247, radius: 0.58, speed: 3.3, ...cfg,
    });
    this.fuse = 0;
    this.fuseTime = cfg.fuseTime ?? 1.3;
    this.blastRadius = cfg.blastRadius ?? 4.2;
    this.tickTimer = 0;

    this.roll.add(sphereBody(this.radius, this.color, { roughness: 0.5, metalness: 0.25 }));
    addEyes(this.face, { y: this.radius * 0.2, spread: this.radius * 0.4, size: this.radius * 0.25, depth: this.radius * 0.88, angry: true });

    const cap = new THREE.Mesh(geo.cylinder, mat(0x6a7490, { roughness: 0.4, metalness: 0.5 }));
    cap.scale.set(this.radius * 0.3, this.radius * 0.28, this.radius * 0.3);
    cap.position.y = this.radius * 0.95;
    this.face.add(cap);

    this.wick = new THREE.Mesh(geo.sphere, new THREE.MeshBasicMaterial({ color: 0xffc14d }));
    this.wick.scale.setScalar(this.radius * 0.16);
    this.wick.position.y = this.radius * 1.24;
    this.face.add(this.wick);
    this.wick.visible = false;
  }

  update(dt) {
    this.t += dt;

    if (this.fuse > 0) {
      this.fuse -= dt;
      this.body.vel.x *= Math.max(0, 1 - 9 * dt);
      this.body.vel.z *= Math.max(0, 1 - 9 * dt);

      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        this.tickTimer = Math.max(0.09, this.fuse * 0.3);
        this.game.sfx.fuse();
        this.game.fx.burst(this.pos.clone().setY(this.top + 0.25), 0xffc14d, 3, { spread: 1, up: 1.4, size: 0.08, life: 0.3 });
      }

      const pulse = 1 + Math.sin(this.t * 34) * 0.12;
      this.roll.scale.setScalar(pulse);
      this.wick.visible = Math.floor(this.t * 22) % 2 === 0;

      if (this.fuse <= 0) {
        this.explode();
        return;
      }
    } else {
      this.driveHorizontal(this.steer(), dt);
    }

    this.integrate(dt);
    if (this.alive) this.syncMesh(dt);
  }

  explode() {
    this.game.explode(this.pos.clone(), this.blastRadius, this);
    this.destroy();
    this.game.onEnemyDefeated(this, 'explosion');
  }

  onStomp() {
    if (this.fuse <= 0) {
      this.fuse = this.fuseTime;
      this.tickTimer = 0;
      this.game.toast('Fuse lit — get clear!');
    }
    return { bounce: 1 };
  }

  onTouch() {
    // Once the fuse is burning the body is harmless — the blast is the threat,
    // so bouncing off the top doesn't also cost you a heart on the way up.
    if (this.fuse > 0) return { hurt: 0 };
    return { hurt: this.contactDamage };
  }
}

/* ------------------------------------------------------------------ *
 *  8. Big Ball — slow and heavy; one stomp splits it into two Balls
 * ------------------------------------------------------------------ */

export class BigBall extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'big_ball', label: 'Big Ball', color: 0x7ad44b, radius: 1.15,
      speed: 2.3, aggro: 20, ...cfg,
    });
    this.splits = cfg.splits ?? 2;
    this.roll.add(sphereBody(this.radius, this.color, { roughness: 0.55 }));

    for (let i = 0; i < 5; i++) {
      const spot = new THREE.Mesh(geo.lowSphere, mat(0x4f9a2c, { roughness: 0.6 }));
      const a = (i / 5) * Math.PI * 2;
      spot.scale.setScalar(this.radius * 0.26);
      spot.position.set(Math.cos(a) * this.radius * 0.8, Math.sin(a * 1.7) * this.radius * 0.5, Math.sin(a) * this.radius * 0.8);
      this.roll.add(spot);
    }

    addEyes(this.face, { y: this.radius * 0.3, spread: this.radius * 0.34, size: this.radius * 0.2, depth: this.radius * 0.92 });
  }

  onStomp() {
    this.game.fx.burst(this.pos, this.color, 20, { spread: 8, up: 6 });
    for (let i = 0; i < this.splits; i++) {
      const angle = (i / this.splits) * Math.PI * 2 + Math.random();
      const offset = new THREE.Vector3(Math.cos(angle) * 0.9, 0.2, Math.sin(angle) * 0.9);
      const child = new Ball(this.game, this.pos.clone().add(offset), { radius: 0.45, speed: 4.4 });
      child.body.vel.set(Math.cos(angle) * 5, 6, Math.sin(angle) * 5);
      this.game.enemies.push(child);
      this.game.trackSpawn(child);
    }
    this.destroy();
    this.game.onEnemyDefeated(this, 'stomp');
    this.game.toast('It split in two!');
    return { bounce: 1 };
  }
}

/* ------------------------------------------------------------------ *
 *  Projectiles fired by Shell Balls
 * ------------------------------------------------------------------ */

export class Projectile extends Entity {
  constructor(game, pos, vel, owner) {
    super(game);
    this.owner = owner;
    this.radius = 0.24;
    this.body = makeBody(pos, new THREE.Vector3(this.radius * 2, this.radius * 2, this.radius * 2));
    this.body.vel.copy(vel);
    this.life = 4;
    this.damage = 1;

    const mesh = new THREE.Mesh(geo.lowSphere, mat(0xffe79a, { emissive: 0xff9b3d, emissiveIntensity: 1.6, roughness: 0.3 }));
    mesh.scale.setScalar(this.radius);
    this.group.add(mesh);

    const halo = new THREE.Mesh(geo.lowSphere, new THREE.MeshBasicMaterial({
      color: 0xffb457, transparent: true, opacity: 0.28, depthWrite: false,
    }));
    halo.scale.setScalar(this.radius * 1.9);
    this.group.add(halo);
    this.group.position.copy(pos);
  }

  get pos() { return this.body.pos; }

  update(dt) {
    this.life -= dt;
    this.body.vel.y -= 7 * dt; // gentle arc so shots read as lobbed
    const contacts = moveAndCollide(this.body, this.game.boxes, dt);
    if (contacts.wall || contacts.grounded || contacts.ceiling || this.life <= 0 || this.pos.y < this.game.killY) {
      this.pop();
      return;
    }
    this.group.position.copy(this.body.pos);
    this.group.rotation.y += dt * 8;
  }

  pop() {
    this.game.fx.burst(this.pos, 0xffb457, 7, { spread: 3.5, up: 2.5, size: 0.11, life: 0.3 });
    this.destroy();
  }
}

/* ------------------------------------------------------------------ *
 *  Registry
 * ------------------------------------------------------------------ */

export const ENEMY_TYPES = {
  ball: {
    ctor: Ball, name: 'Ball', color: '#36d6a6',
    desc: 'Chases you along the ground. Stomp it.',
  },
  spike_ball: {
    ctor: SpikeBall, name: 'Spike Ball', color: '#99a6c2',
    desc: 'Chases you. NOT stompable — spikes hurt. Dodge or use a shell.',
  },
  shell_ball: {
    ctor: ShellBall, name: 'Shell Ball', color: '#ffc94d',
    desc: 'Shoots from range. Stomped, it leaves a kickable shell.',
  },
  red_ball: {
    ctor: RedBall, name: 'Red Ball', color: '#ff4d55',
    desc: 'Chases and jumps at the same time. Stompable.',
  },
  horn_red_ball: {
    ctor: HornRedBall, name: 'Horn Red Ball', color: '#d92b4a',
    desc: 'A Red Ball with a spike — jumps at you and cannot be stomped.',
  },
  flyer_ball: {
    ctor: FlyerBall, name: 'Flyer Ball', color: '#b47bff',
    desc: 'Hovers above you, then dive-bombs. Stompable mid-dive.',
  },
  bomb_ball: {
    ctor: BombBall, name: 'Bomb Ball', color: '#6a7490',
    desc: 'Stomping lights its fuse. The blast clears everything nearby — including you.',
  },
  big_ball: {
    ctor: BigBall, name: 'Big Ball', color: '#7ad44b',
    desc: 'Slow and heavy. One stomp splits it into two quick Balls.',
  },
};

export function spawnEnemy(game, type, pos, cfg = {}) {
  const entry = ENEMY_TYPES[type];
  if (!entry) throw new Error(`Unknown enemy type: ${type}`);
  return new entry.ctor(game, pos, cfg);
}
