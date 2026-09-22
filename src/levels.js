/**
 * Level data.
 *
 * Platforms are described by the position of their TOP surface, which is what
 * you actually care about when placing a jump. `pad()` converts that into the
 * centre-and-size form the physics wants.
 */

const THICK = 1.2;

/** A platform whose walkable surface sits at `topY`. */
function pad(x, topY, z, w, d, opts = {}) {
  return {
    pos: [x, topY - THICK * 0.5, z],
    size: [w, opts.thickness ?? THICK, d],
    color: opts.color,
    motion: opts.motion,
    top: topY,
  };
}

/** A tall block you can jump on top of and also bump into. */
function pillar(x, topY, z, w, d, height, opts = {}) {
  return {
    pos: [x, topY - height * 0.5, z],
    size: [w, height, d],
    color: opts.color,
    top: topY,
  };
}

/** `n` coins in a line, floating `h` above the given point. */
function coinRow(x, y, z, dx, dz, n, h = 1.1) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([x + dx * i, y + h, z + dz * i]);
  return out;
}

/** `n` coins in an arc, the shape of a jump. */
function coinArc(x, y, z, dx, dz, n, height = 1.8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push([x + dx * t, y + 1.1 + Math.sin(t * Math.PI) * height, z + dz * t]);
  }
  return out;
}

/**
 * `ambient` is the fill light, kept deliberately brighter than the sky colour
 * so that platforms in shadow stay readable — especially in the night palette.
 */
const PALETTES = {
  day: { skyTop: 0x2a5cbf, skyMid: 0x8dc0ff, skyBottom: 0xffd9ad, fog: 0xa8cbff, ground: 0x3a5f8a, sun: 0xfff3dc, ambient: 0xaed2ff },
  dusk: { skyTop: 0x1d2a63, skyMid: 0xff8f6b, skyBottom: 0xffdcae, fog: 0xffb193, ground: 0x6f5a8c, sun: 0xffd3ab, ambient: 0xffdfd0, ambientIntensity: 0.42 },
  night: { skyTop: 0x060a1c, skyMid: 0x2c2464, skyBottom: 0x6a3480, fog: 0x2b2455, ground: 0x171331, sun: 0xdbe6ff, ambient: 0x93a6e8, ambientIntensity: 0.62, sunIntensity: 1.5 },
  bloom: { skyTop: 0x15406b, skyMid: 0x5fcfdc, skyBottom: 0xdcf4bc, fog: 0xa6e2da, ground: 0x2f6b5a, sun: 0xfffbe4, ambient: 0xbdf0e8 },
};

/* ------------------------------------------------------------------ *
 *  Level 1 — the basics: chase it, stomp it, don't touch the spikes
 * ------------------------------------------------------------------ */

const level1 = {
  name: 'Sky Steps',
  intro: 'Stomp the green Balls. The grey Spike Balls cannot be stomped — keep away from them.',
  palette: PALETTES.day,
  spawn: [0, 2.5, 4],
  killY: -22,
  goal: [63, 7.6, 4],
  platforms: [
    pad(0, 0, 0, 14, 14),
    pad(12, 1, 0, 6, 8),
    pad(20, 2, 0, 6, 8),
    pad(27.5, 2.5, -3, 6, 6),
    pad(34.5, 3, -3, 4.5, 4.5, { motion: { axis: 'z', dist: 4.5, period: 5 }, color: 0xffc94d }),
    pad(42, 3.5, -3, 9, 10),
    pad(49.5, 4.5, 1, 5, 5),
    pad(56, 5.5, 4, 5, 5),
    pad(63, 6.5, 4, 11, 11),
    pillar(63, 8.2, 8.5, 3, 3, 8),
  ],
  checkpoints: [[42, 4.5, -3]],
  enemies: [
    { type: 'ball', at: [4, 1.5, -2] },
    { type: 'ball', at: [12, 2.5, 1] },
    { type: 'ball', at: [20, 3.5, -1], cfg: { speed: 4.2 } },
    { type: 'spike_ball', at: [27.5, 4, -3] },
    { type: 'ball', at: [42, 5, -5] },
    { type: 'spike_ball', at: [42, 5, -1], cfg: { patrol: 3 } },
    { type: 'red_ball', at: [63, 8, 2] },
    { type: 'ball', at: [63, 8, 6] },
  ],
  coins: [
    ...coinArc(7.5, 0.4, 0, 3, 0, 5),
    ...coinArc(15.5, 1.4, 0, 3, 0, 5),
    ...coinRow(20, 2, -2, 0, 2, 3),
    ...coinArc(23.5, 2.4, -1, 3, -2, 5),
    ...coinRow(42, 3.5, -6, 2, 0, 4),
    ...coinArc(45.5, 4, -2, 3, 2, 5),
    ...coinRow(60, 6.5, 4, 2, 0, 4),
  ],
};

/* ------------------------------------------------------------------ *
 *  Level 2 — ranged fire, and the shell you can kick back
 * ------------------------------------------------------------------ */

const level2 = {
  name: 'Shell Shoals',
  intro: 'Shell Balls shoot. Stomp one, then walk into the shell it drops to kick it through the rest.',
  palette: PALETTES.dusk,
  spawn: [0, 2.5, 0],
  killY: -22,
  goal: [6, 16.4, -40],
  platforms: [
    pad(0, 0, 0, 12, 12),
    pad(0, 0.8, -11, 8, 12),
    pillar(-5, 2.4, -11, 2.4, 2.4, 6),
    pillar(5, 2.4, -11, 2.4, 2.4, 6),
    pad(0, 2, -20, 10, 8),
    pad(-7.5, 3, -26, 5, 6),
    pad(0, 4, -30, 6, 6),
    pad(7.5, 5, -26, 5, 6),
    pad(7.5, 6.5, -18, 4.5, 4.5, { motion: { axis: 'z', dist: 5, period: 6 }, color: 0xffc94d }),
    pad(14, 7.5, -26, 6, 8),
    pad(14, 9, -34, 6, 6),
    pad(6, 10.5, -38, 7, 7),
    pillar(6, 12, -44, 3, 3, 9),
    pad(-2, 12, -38, 5, 5),
    pad(-2, 13.5, -44, 5, 5),
    pad(6, 15, -40, 10, 10),
  ],
  checkpoints: [[0, 3, -20], [14, 8.5, -26]],
  enemies: [
    { type: 'ball', at: [0, 1.5, -3] },
    { type: 'shell_ball', at: [-5, 3.6, -11] },
    { type: 'shell_ball', at: [5, 3.6, -11] },
    { type: 'spike_ball', at: [0, 3, -20] },
    { type: 'ball', at: [-7.5, 4, -26] },
    { type: 'red_ball', at: [0, 5, -30] },
    { type: 'shell_ball', at: [14, 8.5, -26], cfg: { fireInterval: 1.6 } },
    { type: 'red_ball', at: [14, 10, -34] },
    { type: 'horn_red_ball', at: [6, 11.5, -38] },
    { type: 'spike_ball', at: [6, 16, -42] },
    { type: 'horn_red_ball', at: [6, 16, -38] },
    { type: 'shell_ball', at: [6, 13.5, -44], cfg: { range: 26 } },
  ],
  coins: [
    ...coinRow(-4, 0, 0, 2, 0, 5),
    ...coinArc(0, 0.8, -6, 0, -6, 5),
    ...coinRow(-3, 2, -20, 2, 0, 4),
    ...coinArc(-4, 3, -28, 4, -2, 5),
    ...coinRow(14, 7.5, -24, 0, -2, 4),
    ...coinArc(10, 9, -36, -4, -2, 5),
    ...coinRow(3, 15, -40, 2, 0, 4),
  ],
};

/* ------------------------------------------------------------------ *
 *  Level 3 — the air force and the demolition crew
 * ------------------------------------------------------------------ */

const level3 = {
  name: 'Boom Heights',
  intro: 'Flyer Balls dive from above. Stomping a Bomb Ball lights its fuse — the blast clears a whole platform.',
  palette: PALETTES.night,
  spawn: [0, 2.5, 0],
  killY: -24,
  goal: [0, 34.4, -6],
  platforms: [
    pad(0, 0, 0, 14, 14),
    pad(-9, 2, -6, 6, 6),
    pad(0, 4, -11, 7, 6),
    pad(9, 6, -6, 6, 6),
    pad(9, 8.5, 2, 5, 6, { motion: { axis: 'x', dist: 5, period: 5.5 }, color: 0xb47bff }),
    pad(0, 10.5, 4, 9, 7),
    pad(-9, 13, 0, 6, 8),
    pad(-9, 15.5, -9, 6, 6),
    pad(0, 17.5, -13, 8, 6),
    pad(9, 20, -9, 6, 6),
    pad(9, 22.5, 0, 5, 5, { motion: { axis: 'z', dist: 5, period: 6 }, color: 0xb47bff }),
    pad(2, 24.5, 5, 8, 7),
    pad(-7, 27, 2, 6, 7),
    pad(-7, 29.5, -6, 6, 6),
    pad(0, 31.5, -12, 6, 6),
    pad(0, 33.5, -6, 12, 12),
    pillar(0, 35.2, -2, 3, 3, 9),
  ],
  checkpoints: [[0, 11.5, 4], [0, 18.5, -13], [2, 25.5, 5]],
  enemies: [
    { type: 'ball', at: [3, 1.5, -3] },
    { type: 'bomb_ball', at: [-9, 3, -6] },
    { type: 'flyer_ball', at: [0, 7.5, -11] },
    { type: 'big_ball', at: [9, 7.5, -6] },
    { type: 'flyer_ball', at: [0, 14, 4], cfg: { patrol: 4 } },
    { type: 'bomb_ball', at: [0, 11.5, 6] },
    { type: 'spike_ball', at: [-9, 14, 0] },
    { type: 'red_ball', at: [-9, 16.5, -9] },
    { type: 'big_ball', at: [0, 19, -13] },
    { type: 'flyer_ball', at: [9, 24, -9] },
    { type: 'horn_red_ball', at: [2, 25.5, 5] },
    { type: 'bomb_ball', at: [-7, 28, 2] },
    { type: 'shell_ball', at: [-7, 30.5, -6] },
    { type: 'flyer_ball', at: [0, 36, -6] },
    { type: 'big_ball', at: [-3, 34.5, -8] },
    { type: 'horn_red_ball', at: [3, 34.5, -4] },
  ],
  coins: [
    ...coinArc(-4, 0, -3, -5, -3, 5),
    ...coinArc(-5, 2, -8, 5, -3, 5),
    ...coinArc(4, 4, -9, 5, 3, 5),
    ...coinRow(0, 10.5, 2, 0, 2, 3),
    ...coinArc(-4, 10.5, 3, -5, -3, 5),
    ...coinRow(-9, 15.5, -9, 0, 2, 3),
    ...coinArc(4, 17.5, -11, 5, 2, 5),
    ...coinRow(2, 24.5, 3, 2, 0, 4),
    ...coinArc(-3, 27, 0, -4, -6, 5),
    ...coinRow(-3, 33.5, -6, 2, 0, 4),
  ],
};

/* ------------------------------------------------------------------ *
 *  Level 4 — every enemy at once
 * ------------------------------------------------------------------ */

const level4 = {
  name: 'Grand Melee',
  intro: 'All eight kinds share one arena. Clear the ring, then take the star.',
  palette: PALETTES.bloom,
  spawn: [0, 3, 22],
  killY: -20,
  goal: [0, 10.2, -16],
  platforms: [
    pad(0, 0, 18, 12, 12),
    pad(0, 0.5, 4, 30, 22),
    pillar(-11, 3, -4, 5, 5, 8),
    pillar(11, 3, -4, 5, 5, 8),
    pillar(-11, 3, 10, 5, 5, 8),
    pillar(11, 3, 10, 5, 5, 8),
    pad(0, 4.5, -8, 10, 8),
    pad(-7, 6.5, -14, 5, 5),
    pad(7, 6.5, -14, 5, 5),
    pad(0, 8.5, -1, 7, 7, { motion: { axis: 'y', dist: 3.4, period: 7 }, color: 0xffc94d }),
    pad(0, 8.5, -16, 9, 9),
    pillar(0, 10.2, -20, 3, 3, 9),
  ],
  checkpoints: [[0, 1.5, 4]],
  enemies: [
    { type: 'ball', at: [-6, 2, 8] },
    { type: 'ball', at: [6, 2, 8] },
    { type: 'spike_ball', at: [0, 2, 6] },
    { type: 'red_ball', at: [-8, 2, 0] },
    { type: 'horn_red_ball', at: [8, 2, 0] },
    { type: 'big_ball', at: [0, 2.5, -2] },
    { type: 'bomb_ball', at: [-4, 2, 4] },
    { type: 'bomb_ball', at: [4, 2, 4] },
    { type: 'shell_ball', at: [-11, 4, -4] },
    { type: 'shell_ball', at: [11, 4, -4] },
    { type: 'flyer_ball', at: [-11, 7, 10] },
    { type: 'flyer_ball', at: [11, 7, 10] },
    { type: 'spike_ball', at: [0, 6, -8] },
    { type: 'red_ball', at: [-7, 8, -14] },
    { type: 'horn_red_ball', at: [7, 8, -14] },
    { type: 'flyer_ball', at: [0, 12, -16] },
  ],
  coins: [
    ...coinRow(-10, 0.5, 12, 2.5, 0, 9),
    ...coinRow(-10, 0.5, -4, 2.5, 0, 9),
    ...coinRow(-4, 4.5, -8, 2, 0, 5),
    ...coinRow(-7, 6.5, -14, 0, 1.6, 3),
    ...coinRow(7, 6.5, -14, 0, 1.6, 3),
    ...coinRow(-3, 8.5, -16, 1.5, 0, 5),
  ],
};

export const LEVELS = [level1, level2, level3, level4];
