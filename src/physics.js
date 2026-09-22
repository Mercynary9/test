import * as THREE from 'three';

/**
 * Axis-aligned box collision. Everything solid in the world is a `SolidBox`
 * ({ center, half }); everything that moves through the world is a `Body`
 * ({ pos, size, vel }) whose `pos` is its centre.
 *
 * Movement is resolved one axis at a time (X, then Z, then Y). Resolving
 * per-axis keeps a body from tunnelling into a corner and gives clean
 * "landed on top" / "hit a wall" contact flags.
 */

export function makeBody(pos, size) {
  return { pos: pos.clone(), size: size.clone(), vel: new THREE.Vector3() };
}

export function makeSolid(center, size, extra = {}) {
  return {
    center: center.clone(),
    half: size.clone().multiplyScalar(0.5),
    delta: new THREE.Vector3(),
    ...extra,
  };
}

function overlaps(body, box, pad = 0) {
  return (
    Math.abs(body.pos.x - box.center.x) < body.size.x * 0.5 + box.half.x + pad &&
    Math.abs(body.pos.y - box.center.y) < body.size.y * 0.5 + box.half.y + pad &&
    Math.abs(body.pos.z - box.center.z) < body.size.z * 0.5 + box.half.z + pad
  );
}

/** How deep the body reaches into the box along one axis, for a given coordinate. */
function penetration(body, box, axis, value) {
  return body.size[axis] * 0.5 + box.half[axis] - Math.abs(value - box.center[axis]);
}

// Anything shallower than this counts as touching rather than overlapping. It
// absorbs the float error left by a previous resolution, so a body sitting
// flush on a surface is not mistaken for one embedded in it.
const SKIN = 1e-3;

/**
 * Push the body out of everything it hit *while moving along `axis` this step*.
 *
 * The `prevValue` guard is what makes per-axis resolution safe: a body resting
 * on a wide platform already overlaps it on X and Z by metres, and without the
 * guard the X pass would happily eject it sideways by that much. Only an
 * overlap that this step's motion created gets resolved.
 */
function resolveAxis(body, boxes, axis, prevValue, out) {
  for (const box of boxes) {
    if (!overlaps(body, box)) continue;

    const pen = penetration(body, box, axis, body.pos[axis]);
    if (pen <= 0) continue;
    if (penetration(body, box, axis, prevValue) > SKIN) continue;

    const d = body.pos[axis] - box.center[axis];
    const sign = d === 0 ? 1 : Math.sign(d);

    if (axis === 'y') {
      if (sign > 0) {
        body.pos.y += pen;
        if (body.vel.y < 0) body.vel.y = 0;
        out.grounded = true;
        out.ground = box;
      } else {
        body.pos.y -= pen;
        if (body.vel.y > 0) body.vel.y = 0;
        out.ceiling = true;
      }
    } else {
      body.pos[axis] += sign * pen;
      body.vel[axis] = 0;
      out.wall = true;
      out.wallAxis = axis;
      out.wallSign = sign;
      if (axis === 'x') out.wallX = true;
      else out.wallZ = true;
    }
  }
}

/**
 * Safety net for a body that ended up fully inside a solid (spawned there, or
 * shoved in by a moving platform): push it out the shortest way.
 */
function unembed(body, boxes, out) {
  for (const box of boxes) {
    if (!overlaps(body, box)) continue;

    const px = penetration(body, box, 'x', body.pos.x);
    const py = penetration(body, box, 'y', body.pos.y);
    const pz = penetration(body, box, 'z', body.pos.z);
    if (px <= SKIN || py <= SKIN || pz <= SKIN) continue; // merely touching

    const axis = py <= px && py <= pz ? 'y' : px <= pz ? 'x' : 'z';
    const pen = axis === 'y' ? py : axis === 'x' ? px : pz;
    const d = body.pos[axis] - box.center[axis];
    const sign = d === 0 ? 1 : Math.sign(d);
    body.pos[axis] += sign * pen;

    if (axis === 'y') {
      if (sign > 0) {
        if (body.vel.y < 0) body.vel.y = 0;
        out.grounded = true;
        out.ground = box;
      } else if (body.vel.y > 0) {
        body.vel.y = 0;
      }
    } else {
      body.vel[axis] = 0;
      out.wall = true;
    }
  }
}

/** Integrate `body` by `dt` against `boxes`, returning the contacts it made. */
export function moveAndCollide(body, boxes, dt) {
  const out = {
    grounded: false, ceiling: false, wall: false, wallX: false, wallZ: false,
    ground: null, wallAxis: null, wallSign: 0,
  };

  const prevX = body.pos.x;
  const prevY = body.pos.y;
  const prevZ = body.pos.z;

  body.pos.x += body.vel.x * dt;
  resolveAxis(body, boxes, 'x', prevX, out);

  body.pos.z += body.vel.z * dt;
  resolveAxis(body, boxes, 'z', prevZ, out);

  body.pos.y += body.vel.y * dt;
  resolveAxis(body, boxes, 'y', prevY, out);

  unembed(body, boxes, out);

  // Standing exactly on a surface leaves a hair of space, which would make
  // `grounded` flicker off for a frame. Probe just below the feet instead.
  if (!out.grounded && body.vel.y <= 0.001) {
    const probe = { pos: body.pos.clone(), size: body.size, vel: body.vel };
    probe.pos.y -= 0.08;
    for (const box of boxes) {
      if (!overlaps(probe, box)) continue;
      if (probe.pos.y - box.center.y > 0) {
        out.grounded = true;
        out.ground = box;
        break;
      }
    }
  }

  return out;
}

/** True when solid ground exists within `reach` below the given point. */
export function groundBelow(boxes, x, z, y, reach = 1.4) {
  for (const box of boxes) {
    if (Math.abs(x - box.center.x) > box.half.x) continue;
    if (Math.abs(z - box.center.z) > box.half.z) continue;
    const top = box.center.y + box.half.y;
    if (top <= y + 0.05 && top >= y - reach) return true;
  }
  return false;
}

/** Cheap overlap test between two bodies, used for entity-vs-entity contact. */
export function bodiesOverlap(a, b, pad = 0) {
  return (
    Math.abs(a.pos.x - b.pos.x) < (a.size.x + b.size.x) * 0.5 + pad &&
    Math.abs(a.pos.y - b.pos.y) < (a.size.y + b.size.y) * 0.5 + pad &&
    Math.abs(a.pos.z - b.pos.z) < (a.size.z + b.size.z) * 0.5 + pad
  );
}

const _box3 = new THREE.Box3();
const _ray = new THREE.Ray();

/**
 * Distance along `dir` from `origin` to the first solid, or `maxDist` when the
 * ray is clear. Used to pull the chase camera in front of walls.
 */
export function rayDistance(boxes, origin, dir, maxDist) {
  _ray.set(origin, dir);
  let nearest = maxDist;
  const hit = new THREE.Vector3();
  for (const box of boxes) {
    _box3.setFromCenterAndSize(box.center, box.half.clone().multiplyScalar(2));
    if (_box3.containsPoint(origin)) continue;
    if (_ray.intersectBox(_box3, hit)) {
      const d = origin.distanceTo(hit);
      if (d < nearest) nearest = d;
    }
  }
  return nearest;
}
