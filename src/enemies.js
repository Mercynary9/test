import * as THREE from 'three';
import { geo, mat } from './scene.js';
import { makeBody, moveAndCollide, groundBelow } from './physics.js';

/**
 * Three kinds of enemy, and nothing else:
 *
 *   Chaser  — runs at you on the ground, hops to follow you up a ledge. Stomp it.
 *   Shooter — holds its platform and lobs shots at you. Stomp it.
 *   Spiker  — chases you covered in spikes. Cannot be stomped; it has to be dodged.
 *
 * Every one of them is a ball with eyes, so a glance tells you which rule
 * applies: green means stompable, yellow means it shoots, spikes mean keep off.
 */

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
    this.spiked = cfg.spiked ?? false;
    this.stompable = cfg.stompable ?? true;
    this.contactDamage = cfg.contactDamage ?? 1;
    // Only enemies you can actually clear are counted in the HUD.
    this.countsAsThreat = cfg.countsAsThreat ?? this.stompable;

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
    if (this.grounded && !this.groundAheadOf(dir)) {
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
    this.body.vel.y += this.gravity * dt;
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
    this.game.fx.burst(this.pos, this.color, 13, { spread: 6, up: 5.5 });
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
 *  1. Chaser — runs at you and hops after you, stompable
 * ------------------------------------------------------------------ */

export class Chaser extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'chaser', label: 'Chaser', color: 0x36d6a6, radius: 0.55, speed: 4.0, ...cfg,
    });
    this.hopSpeed = cfg.hopSpeed ?? 11.5;
    this.hopInterval = cfg.hopInterval ?? 1.1;
    this.hopTimer = Math.random() * this.hopInterval;

    this.roll.add(sphereBody(this.radius, this.color));
    addEyes(this.face, {
      y: this.radius * 0.35, spread: this.radius * 0.42,
      size: this.radius * 0.26, depth: this.radius * 0.86, angry: true,
    });
  }

  update(dt) {
    this.t += dt;
    this.driveHorizontal(this.steer(), dt, this.speed, 30);

    // Hop only when the player is above us: on the flat it keeps its feet on
    // the ground, so the chase stays readable.
    this.hopTimer -= dt;
    const above = this.game.player.pos.y - this.pos.y;
    if (this.grounded && this.alerted && above > 1.2 && this.hopTimer <= 0) {
      this.body.vel.y = this.hopSpeed;
      this.hopTimer = this.hopInterval * (0.8 + Math.random() * 0.5);
      this.grounded = false;
    }

    this.integrate(dt);
    if (!this.alive) return;

    const stretch = THREE.MathUtils.clamp(1 + this.body.vel.y * 0.012, 0.84, 1.18);
    this.roll.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    this.syncMesh(dt);
  }
}

/* ------------------------------------------------------------------ *
 *  2. Shooter — holds its ground and lobs shots, stompable
 * ------------------------------------------------------------------ */

export class Shooter extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'shooter', label: 'Shooter', color: 0xffc94d, radius: 0.58,
      speed: 1.5, patrol: 1.6, aggro: 24, ...cfg,
    });
    this.range = cfg.range ?? 22;
    this.fireInterval = cfg.fireInterval ?? 2.0;
    this.shotSpeed = cfg.shotSpeed ?? 13;
    this.fireTimer = 0.8 + Math.random();

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

    // A ring that flashes as the shot charges: the tell you jump on.
    this.tell = new THREE.Mesh(geo.torus, new THREE.MeshBasicMaterial({
      color: 0xffe79a, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.tell.scale.setScalar(this.radius * 1.5);
    this.tell.rotation.x = Math.PI * 0.5;
    this.group.add(this.tell);

    addEyes(this.face, {
      y: this.radius * 0.42, spread: this.radius * 0.4,
      size: this.radius * 0.24, depth: this.radius * 0.82,
    });
  }

  update(dt) {
    this.t += dt;

    const to = this.toPlayer();
    const dist = to.length();
    const canSee = !this.game.player.dead && dist < this.range;
    this.alerted = canSee;

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
    if (!this.alive) return;

    const charge = canSee ? THREE.MathUtils.clamp(1 - this.fireTimer / 0.45, 0, 1) : 0;
    this.tell.material.opacity = charge * 0.7;
    this.tell.scale.setScalar(this.radius * (1.5 + charge * 0.5));
    this.syncMesh(dt);
  }

  shoot() {
    const origin = this.pos.clone();
    origin.y += this.radius * 0.1;
    const dir = this.game.player.pos.clone().sub(origin);
    dir.y += 0.2;
    if (dir.lengthSq() < 0.001) return;
    dir.normalize();
    origin.addScaledVector(dir, this.radius + 0.25);
    this.game.spawnProjectile(origin, dir.multiplyScalar(this.shotSpeed), this);
    this.game.sfx.shoot();
  }
}

/* ------------------------------------------------------------------ *
 *  3. Spiker — chases you, cannot be stomped
 * ------------------------------------------------------------------ */

export class Spiker extends Enemy {
  constructor(game, pos, cfg = {}) {
    super(game, pos, {
      type: 'spiker', label: 'Spiker', color: 0x99a6c2, radius: 0.55,
      speed: 2.8, spiked: true, stompable: false, ...cfg,
    });
    this.roll.add(sphereBody(this.radius, this.color, { metalness: 0.5, roughness: 0.3 }));
    addSpikes(this.roll, this.radius, 16);
    addEyes(this.face, {
      y: this.radius * 0.3, spread: this.radius * 0.4,
      size: this.radius * 0.24, depth: this.radius * 1.12, angry: true,
    });
  }
}

/* ------------------------------------------------------------------ *
 *  Projectiles fired by Shooters
 * ------------------------------------------------------------------ */

export class Projectile extends Entity {
  constructor(game, pos, vel, owner) {
    super(game);
    this.owner = owner;
    this.radius = 0.26;
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
    this.game.fx.burst(this.pos, 0xffb457, 6, { spread: 3.5, up: 2.5, size: 0.11, life: 0.3 });
    this.destroy();
  }
}

/* ------------------------------------------------------------------ *
 *  Registry
 * ------------------------------------------------------------------ */

export const ENEMY_TYPES = {
  chaser: {
    ctor: Chaser, name: 'Chaser', color: '#36d6a6',
    desc: 'Runs at you and hops to follow you up. Land on it to pop it.',
  },
  shooter: {
    ctor: Shooter, name: 'Shooter', color: '#ffc94d',
    desc: 'Holds its platform and lobs shots. Dodge the shot, then stomp it.',
  },
  spiker: {
    ctor: Spiker, name: 'Spiker', color: '#99a6c2',
    desc: 'Chases you covered in spikes. Cannot be stomped — jump over it.',
  },
};

export function spawnEnemy(game, type, pos, cfg = {}) {
  const entry = ENEMY_TYPES[type];
  if (!entry) throw new Error(`Unknown enemy type: ${type}`);
  return new entry.ctor(game, pos, cfg);
}
