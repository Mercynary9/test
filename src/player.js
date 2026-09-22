import * as THREE from 'three';
import { geo, mat } from './scene.js';
import { makeBody, moveAndCollide } from './physics.js';

export const PLAYER = {
  width: 0.9,
  height: 1.5,
  speed: 8.4,
  accel: 70,
  airAccel: 42,
  friction: 14,
  gravity: -34,
  fallGravity: -46,
  jumpSpeed: 13.4,
  doubleJumpSpeed: 11.6,
  stompBounce: 13.0,
  coyote: 0.11,
  jumpBuffer: 0.12,
  dashSpeed: 19,
  dashTime: 0.17,
  dashCooldown: 0.65,
  maxHp: 3,
  invulnTime: 1.25,
};

export class Player {
  constructor(game, spawn) {
    this.game = game;
    this.body = makeBody(spawn, new THREE.Vector3(PLAYER.width, PLAYER.height, PLAYER.width));
    this.grounded = false;
    this.coyoteLeft = 0;
    this.jumpBuffered = 0;
    this.jumpsLeft = 2;
    this.jumpHeld = false;
    this.dashLeft = 0;
    this.dashCooldown = 0;
    this.dashDir = new THREE.Vector3(0, 0, 1);
    this.hp = PLAYER.maxHp;
    this.invuln = 0;
    this.facing = 0;
    this.squash = 1;
    this.dead = false;
    this.deadTimer = 0;
    this.groundPlatform = null;

    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.group.add(this.visual);

    const bodyMesh = new THREE.Mesh(geo.sphere, mat(0x63d2ff, { roughness: 0.32, metalness: 0.12 }));
    bodyMesh.scale.set(0.46, 0.5, 0.46);
    bodyMesh.position.y = -0.2;
    bodyMesh.castShadow = true;
    this.visual.add(bodyMesh);

    const head = new THREE.Mesh(geo.sphere, mat(0x9fe8ff, { roughness: 0.3 }));
    head.scale.setScalar(0.4);
    head.position.y = 0.4;
    head.castShadow = true;
    this.visual.add(head);

    const capMesh = new THREE.Mesh(geo.dome, mat(0xffd257, { roughness: 0.4 }));
    capMesh.scale.setScalar(0.44);
    capMesh.position.y = 0.44;
    this.visual.add(capMesh);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(geo.lowSphere, mat(0xffffff, { roughness: 0.2 }));
      eye.scale.setScalar(0.12);
      eye.position.set(side * 0.14, 0.45, 0.33);
      this.visual.add(eye);
      const pupil = new THREE.Mesh(geo.lowSphere, mat(0x131a2e, { roughness: 0.2 }));
      pupil.scale.setScalar(0.06);
      pupil.position.set(side * 0.15, 0.45, 0.41);
      this.visual.add(pupil);
    }

    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(geo.sphere, mat(0xff7bd5, { roughness: 0.45 }));
      foot.scale.set(0.2, 0.13, 0.28);
      foot.position.set(side * 0.24, -0.66, 0.06);
      foot.castShadow = true;
      this.visual.add(foot);
      this[side < 0 ? 'footL' : 'footR'] = foot;
    }

    this.aura = new THREE.Mesh(geo.sphere, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.aura.scale.setScalar(0.95);
    this.group.add(this.aura);

    game.scene.add(this.group);
    this.syncMesh(0);
  }

  get pos() { return this.body.pos; }
  get feet() { return this.body.pos.y - PLAYER.height * 0.5; }
  get head() { return this.body.pos.y + PLAYER.height * 0.5; }

  respawn(spawn) {
    this.body.pos.copy(spawn);
    this.body.vel.set(0, 0, 0);
    this.hp = PLAYER.maxHp;
    this.invuln = PLAYER.invulnTime;
    this.dead = false;
    this.deadTimer = 0;
    this.jumpsLeft = 2;
    this.dashLeft = 0;
    this.dashCooldown = 0;
  }

  /**
   * @param {object} intent { forward, right, jumpTapped, jumpHeld, dashTapped, yaw }
   */
  update(dt, intent) {
    const b = this.body;

    if (this.dead) {
      this.deadTimer += dt;
      b.vel.y += PLAYER.gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      this.visual.rotation.z += dt * 6;
      this.syncMesh(dt);
      return;
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    // --- desired horizontal direction, relative to the camera ---
    const wish = new THREE.Vector3(intent.right, 0, intent.forward);
    if (wish.lengthSq() > 1) wish.normalize();
    const yaw = intent.yaw;
    // camera-relative: +forward walks away from the camera, +right strafes
    const dir = new THREE.Vector3(
      wish.x * Math.cos(yaw) - wish.z * Math.sin(yaw),
      0,
      -wish.x * Math.sin(yaw) - wish.z * Math.cos(yaw),
    );

    // --- dash ---
    if (intent.dashTapped && this.dashCooldown <= 0) {
      this.dashDir.copy(dir.lengthSq() > 0.01 ? dir : new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)));
      this.dashDir.normalize();
      this.dashLeft = PLAYER.dashTime;
      this.dashCooldown = PLAYER.dashCooldown;
      this.game.sfx.dash();
      this.game.fx.burst(this.pos.clone().setY(this.feet + 0.2), 0x9fe8ff, 8, { spread: 3, up: 2, size: 0.12, life: 0.35 });
    }

    if (this.dashLeft > 0) {
      this.dashLeft -= dt;
      b.vel.x = this.dashDir.x * PLAYER.dashSpeed;
      b.vel.z = this.dashDir.z * PLAYER.dashSpeed;
      if (b.vel.y < 0) b.vel.y *= 0.7;
    } else {
      const accel = (this.grounded ? PLAYER.accel : PLAYER.airAccel) * dt;
      const targetX = dir.x * PLAYER.speed;
      const targetZ = dir.z * PLAYER.speed;
      b.vel.x += THREE.MathUtils.clamp(targetX - b.vel.x, -accel, accel);
      b.vel.z += THREE.MathUtils.clamp(targetZ - b.vel.z, -accel, accel);

      if (dir.lengthSq() < 0.01 && this.grounded) {
        const damp = Math.max(0, 1 - PLAYER.friction * dt);
        b.vel.x *= damp;
        b.vel.z *= damp;
      }
    }

    // --- jumping: coyote time, input buffering, variable height, double jump ---
    if (intent.jumpTapped) this.jumpBuffered = PLAYER.jumpBuffer;
    this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    this.coyoteLeft = Math.max(0, this.coyoteLeft - dt);

    if (this.jumpBuffered > 0) {
      if (this.grounded || this.coyoteLeft > 0) {
        b.vel.y = PLAYER.jumpSpeed;
        this.jumpsLeft = 1;
        this.jumpBuffered = 0;
        this.coyoteLeft = 0;
        this.grounded = false;
        this.squash = 1.35;
        this.game.sfx.jump();
      } else if (this.jumpsLeft > 0) {
        b.vel.y = PLAYER.doubleJumpSpeed;
        this.jumpsLeft = 0;
        this.jumpBuffered = 0;
        this.squash = 1.3;
        this.game.sfx.doubleJump();
        this.game.fx.burst(this.pos.clone().setY(this.feet), 0xffffff, 10, { spread: 4, up: 1.5, size: 0.11, life: 0.4 });
      }
    }

    // releasing the button early cuts the arc short
    if (!intent.jumpHeld && b.vel.y > 4.5) b.vel.y = 4.5;

    const g = b.vel.y > 0 ? PLAYER.gravity : PLAYER.fallGravity;
    b.vel.y = Math.max(b.vel.y + g * dt, -46);

    // --- ride moving platforms ---
    if (this.groundPlatform && this.grounded) {
      b.pos.add(this.groundPlatform.delta);
    }

    const wasFalling = b.vel.y < -6;
    const contacts = moveAndCollide(b, this.game.boxes, dt);
    const landed = contacts.grounded && !this.grounded;
    this.grounded = contacts.grounded;
    this.groundPlatform = contacts.ground ?? null;

    if (this.grounded) {
      this.coyoteLeft = PLAYER.coyote;
      this.jumpsLeft = 2;
      if (landed && wasFalling) {
        this.squash = 0.68;
        this.game.fx.burst(this.pos.clone().setY(this.feet), 0xd8e6ff, 7, { spread: 3.2, up: 1.6, size: 0.1, life: 0.3 });
      }
    }

    if (dir.lengthSq() > 0.01) this.facing = Math.atan2(dir.x, dir.z);
    this.syncMesh(dt);
  }

  bounce(strength = 1) {
    this.body.vel.y = PLAYER.stompBounce * strength;
    this.jumpsLeft = Math.max(this.jumpsLeft, 1);
    this.squash = 1.4;
  }

  hurt(amount, fromPos) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= amount;
    this.invuln = PLAYER.invulnTime;
    const away = new THREE.Vector3().subVectors(this.pos, fromPos ?? this.pos);
    away.y = 0;
    if (away.lengthSq() < 0.001) away.set(0, 0, 1);
    away.normalize().multiplyScalar(8.5);
    this.body.vel.x = away.x;
    this.body.vel.z = away.z;
    this.body.vel.y = 8;
    this.dashLeft = 0;
    this.game.fx.burst(this.pos, 0xff5d6c, 14, { spread: 6, up: 5 });
    return true;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.body.vel.set(0, 11, 0);
    this.game.fx.burst(this.pos, 0x63d2ff, 18, { spread: 7, up: 7 });
  }

  syncMesh(dt) {
    this.group.position.copy(this.body.pos);
    this.visual.rotation.y = this.facing;

    this.squash += (1 - this.squash) * Math.min(1, dt * 12);
    const stretch = THREE.MathUtils.clamp(this.squash, 0.6, 1.45);
    this.visual.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    // little leg shuffle while running, tucked legs in the air
    const speed = Math.hypot(this.body.vel.x, this.body.vel.z);
    if (this.footL && this.footR) {
      if (this.grounded && speed > 0.6) {
        const t = performance.now() * 0.001 * Math.min(18, 4 + speed * 1.7);
        this.footL.position.z = 0.06 + Math.sin(t) * 0.22;
        this.footR.position.z = 0.06 - Math.sin(t) * 0.22;
        this.footL.position.y = -0.66 + Math.max(0, Math.sin(t)) * 0.1;
        this.footR.position.y = -0.66 + Math.max(0, -Math.sin(t)) * 0.1;
      } else {
        this.footL.position.z = 0.06;
        this.footR.position.z = 0.06;
        this.footL.position.y = this.grounded ? -0.66 : -0.56;
        this.footR.position.y = this.grounded ? -0.66 : -0.56;
      }
    }

    // invulnerability blink
    const blinking = this.invuln > 0 && !this.dead;
    this.visual.visible = !blinking || Math.floor(this.invuln * 14) % 2 === 0;
    this.aura.material.opacity = this.dashLeft > 0 ? 0.35 : Math.max(0, this.dashCooldown > 0 ? 0 : 0);
  }
}
