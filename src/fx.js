import * as THREE from 'three';
import { geo, mat } from './scene.js';

/** Pooled cube-confetti bursts and expanding shock rings. */
export class Fx {
  constructor(scene, limit = 260) {
    this.scene = scene;
    this.limit = limit;
    this.bits = [];
    this.pool = [];
    this.rings = [];
  }

  acquire(color) {
    const mesh = this.pool.pop() ?? new THREE.Mesh(geo.box, mat(0xffffff, { roughness: 0.4 }));
    mesh.material = mat(color, { roughness: 0.4, emissive: color, emissiveIntensity: 0.35 });
    mesh.visible = true;
    this.scene.add(mesh);
    return mesh;
  }

  burst(pos, color, count = 14, opts = {}) {
    const spread = opts.spread ?? 6;
    const up = opts.up ?? 6;
    const size = opts.size ?? 0.16;
    const life = opts.life ?? 0.75;
    for (let i = 0; i < count; i++) {
      if (this.bits.length >= this.limit) break;
      const mesh = this.acquire(color);
      mesh.position.copy(pos);
      const s = size * (0.6 + Math.random() * 0.8);
      mesh.scale.setScalar(s);
      this.bits.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          Math.random() * up + up * 0.25,
          (Math.random() - 0.5) * spread,
        ),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(12),
        life,
        maxLife: life,
        scale: s,
      });
    }
  }

  ring(pos, color, maxRadius = 4, life = 0.45) {
    const mesh = new THREE.Mesh(geo.sphere, new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }));
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.3);
    this.scene.add(mesh);
    this.rings.push({ mesh, life, maxLife: life, maxRadius });
  }

  update(dt) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.pool.push(b.mesh);
        this.bits.splice(i, 1);
        continue;
      }
      b.vel.y -= 26 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      b.mesh.scale.setScalar(b.scale * Math.max(0.05, b.life / b.maxLife));
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.maxLife;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      r.mesh.scale.setScalar(0.3 + k * r.maxRadius);
      r.mesh.material.opacity = 0.55 * (1 - k);
    }
  }

  clear() {
    for (const b of this.bits) this.scene.remove(b.mesh);
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      r.mesh.material.dispose();
    }
    this.bits.length = 0;
    this.rings.length = 0;
  }
}
