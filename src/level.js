import * as THREE from 'three';
import { geo, mat } from './scene.js';
import { makeSolid } from './physics.js';

const TAU = Math.PI * 2;
const DEFAULT_TOP = 0xbfe0ff;
const DEFAULT_BODY = 0x4a6ea8;

/**
 * Turns a level description into meshes + collision boxes.
 * Returns a handle with `update(dt)` for the animated props.
 */
export function buildLevel(scene, data) {
  const root = new THREE.Group();
  scene.add(root);

  const boxes = [];
  const movers = [];
  const coins = [];
  const checkpoints = [];

  /* ---- platforms ---- */
  for (const p of data.platforms) {
    const center = new THREE.Vector3(...p.pos);
    const size = new THREE.Vector3(...p.size);
    const topColor = p.color ?? DEFAULT_TOP;
    const bodyColor = p.color ? shade(p.color, -0.35) : DEFAULT_BODY;

    const group = new THREE.Group();
    group.position.copy(center);

    const body = new THREE.Mesh(geo.box, mat(bodyColor, { roughness: 0.85 }));
    body.scale.copy(size);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // a thin bright slab so the walkable surface reads clearly from above
    const capThickness = Math.min(0.22, size.y * 0.35);
    const cap = new THREE.Mesh(geo.box, mat(topColor, { roughness: 0.6 }));
    cap.scale.set(size.x * 1.002, capThickness, size.z * 1.002);
    cap.position.y = size.y * 0.5 - capThickness * 0.5 + 0.002;
    cap.receiveShadow = true;
    group.add(cap);

    // a tapered skirt underneath: makes platforms read as floating islands
    if (size.y <= 2.5) {
      const span = Math.min(size.x, size.z);
      const skirt = new THREE.Mesh(geo.cone, mat(shade(bodyColor, -0.2), { roughness: 0.95 }));
      skirt.scale.set(span * 0.46, span * 0.34, span * 0.46);
      skirt.rotation.x = Math.PI;
      skirt.position.y = -size.y * 0.5 - span * 0.17;
      group.add(skirt); // no shadow casting: the blobs it threw read as holes
    }

    root.add(group);

    const solid = makeSolid(center, size, { mesh: group });
    boxes.push(solid);

    if (p.motion) {
      movers.push({
        solid,
        axis: p.motion.axis,
        base: center[p.motion.axis],
        dist: p.motion.dist,
        period: p.motion.period,
        phase: p.motion.phase ?? 0,
      });
    }
  }

  /* ---- coins ---- */
  for (const c of data.coins ?? []) {
    const mesh = new THREE.Mesh(geo.torus, mat(0xffd257, { roughness: 0.25, metalness: 0.7, emissive: 0x6b4a00, emissiveIntensity: 0.6 }));
    mesh.scale.setScalar(0.32);
    mesh.position.set(...c);
    mesh.castShadow = true;
    root.add(mesh);
    coins.push({ mesh, pos: mesh.position.clone(), taken: false, phase: Math.random() * TAU });
  }

  /* ---- checkpoints ---- */
  (data.checkpoints ?? []).forEach((c, i) => {
    const group = new THREE.Group();
    group.position.set(...c);

    const ring = new THREE.Mesh(geo.torus, mat(0x8fa7d6, { roughness: 0.3, metalness: 0.5, emissive: 0x24314f, emissiveIntensity: 0.8 }));
    ring.scale.setScalar(1.05);
    ring.position.y = 1.0;
    ring.castShadow = true;
    group.add(ring);

    const post = new THREE.Mesh(geo.cylinder, mat(0x6d80ab, { roughness: 0.6 }));
    post.scale.set(0.12, 1.0, 0.12);
    post.position.y = 0.5;
    group.add(post);

    root.add(group);
    checkpoints.push({ group, ring, pos: new THREE.Vector3(...c), index: i, active: false });
  });

  /* ---- goal ---- */
  const goalPos = new THREE.Vector3(...data.goal);
  const goal = new THREE.Group();
  goal.position.copy(goalPos);

  const star = new THREE.Mesh(geo.octa, mat(0xffe38a, { roughness: 0.2, metalness: 0.3, emissive: 0xffb01f, emissiveIntensity: 1.1 }));
  star.scale.setScalar(0.8);
  star.castShadow = true;
  goal.add(star);

  const halo = new THREE.Mesh(geo.torus, mat(0xfff3c4, { roughness: 0.3, emissive: 0xffc94d, emissiveIntensity: 0.9 }));
  halo.scale.setScalar(1.35);
  halo.rotation.x = Math.PI * 0.5;
  goal.add(halo);

  const beam = new THREE.Mesh(geo.cylinder, new THREE.MeshBasicMaterial({
    color: 0xffe38a, transparent: true, opacity: 0.16, depthWrite: false,
  }));
  beam.scale.set(1.1, 26, 1.1);
  beam.position.y = 12;
  goal.add(beam);

  root.add(goal);

  const goalLight = new THREE.PointLight(0xffd257, 24, 18, 2);
  goalLight.position.copy(goalPos);
  root.add(goalLight);

  let time = 0;

  return {
    root,
    boxes,
    coins,
    checkpoints,
    goal,
    goalPos,
    spawn: new THREE.Vector3(...data.spawn),
    killY: data.killY ?? -25,

    update(dt) {
      time += dt;

      for (const m of movers) {
        const next = m.base + Math.sin((time / m.period) * TAU + m.phase) * m.dist;
        m.solid.delta.set(0, 0, 0);
        m.solid.delta[m.axis] = next - m.solid.center[m.axis];
        m.solid.center[m.axis] = next;
        m.solid.mesh.position.copy(m.solid.center);
      }

      for (const c of coins) {
        if (c.taken) continue;
        c.mesh.rotation.y += dt * 2.6;
        c.mesh.rotation.z = 0.35;
        c.mesh.position.y = c.pos.y + Math.sin(time * 2.4 + c.phase) * 0.14;
      }

      for (const cp of checkpoints) {
        cp.ring.rotation.y += dt * (cp.active ? 3.2 : 0.9);
        cp.ring.position.y = 1.0 + Math.sin(time * 2 + cp.index) * 0.06;
      }

      star.rotation.y += dt * 1.6;
      star.rotation.x += dt * 0.7;
      star.position.y = Math.sin(time * 1.8) * 0.22;
      halo.rotation.z += dt * 1.1;
      halo.scale.setScalar(1.35 + Math.sin(time * 2.4) * 0.09);
      goalLight.intensity = 22 + Math.sin(time * 3) * 8;
    },

    activateCheckpoint(cp) {
      cp.active = true;
      cp.ring.material = mat(0x6bf0a8, { roughness: 0.25, metalness: 0.4, emissive: 0x1e9a5c, emissiveIntensity: 1.2 });
    },

    dispose() {
      scene.remove(root);
      root.traverse((obj) => {
        if (obj.isMesh && obj.material?.dispose && obj.material.userData?.unique) obj.material.dispose();
      });
    },
  };
}

/** Lighten (t > 0) or darken (t < 0) a hex colour. */
function shade(hex, t) {
  const c = new THREE.Color(hex);
  if (t >= 0) c.lerp(new THREE.Color(0xffffff), t);
  else c.lerp(new THREE.Color(0x000000), -t);
  return c.getHex();
}
