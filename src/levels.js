/**
 * Level data.
 *
 * Platforms are described by the position of their TOP surface, which is what
 * you actually care about when placing a jump. `pad()` converts that into the
 * centre-and-size form the physics wants.
 *
 * Phone tuning: pads are wide (5 units and up), gaps are short enough to clear
 * with a single jump, and each level is a two-to-three minute run. A thumbstick
 * is less precise than a keyboard, so nothing here asks for a pixel-perfect
 * landing.
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
 * so that platforms in shadow stay readable on a phone screen in daylight —
 * especially in the night palette.
 */
const PALETTES = {
  day: { skyTop: 0x2a5cbf, skyMid: 0x8dc0ff, skyBottom: 0xffd9ad, fog: 0xa8cbff, ground: 0x3a5f8a, sun: 0xfff3dc, ambient: 0xaed2ff },
  dusk: { skyTop: 0x1d2a63, skyMid: 0xff8f6b, skyBottom: 0xffdcae, fog: 0xffb193, ground: 0x6f5a8c, sun: 0xffd3ab, ambient: 0xffdfd0, ambientIntensity: 0.48 },
  night: { skyTop: 0x060a1c, skyMid: 0x2c2464, skyBottom: 0x6a3480, fog: 0x2b2455, ground: 0x171331, sun: 0xdbe6ff, ambient: 0x93a6e8, ambientIntensity: 0.7, sunIntensity: 1.6 },
  bloom: { skyTop: 0x15406b, skyMid: 0x5fcfdc, skyBottom: 0xdcf4bc, fog: 0xa6e2da, ground: 0x2f6b5a, sun: 0xfffbe4, ambient: 0xbdf0e8 },
};

/* ------------------------------------------------------------------ *
 *  Level 1 — Chasers, and the first Spiker you must not land on
 * ------------------------------------------------------------------ */

const level1 = {
  name: 'Sunrise Steps',
  intro: 'Drag to look, stick to run, JUMP to jump. Land on green Chasers.',
  palette: PALETTES.day,
  spawn: [0, 2.5, 4],
  killY: -22,
  goal: [53, 6.7, 4],
  platforms: [
    pad(0, 0, 0, 14, 14),
    pad(11, 1, 0, 7, 9),
    pad(19, 2, 0, 7, 9),
    pad(26.5, 2.5, -3, 7, 7),
    pad(33.5, 3, -3, 5.5, 5.5, { motion: { axis: 'z', dist: 4, period: 5.5 }, color: 0xffc94d }),
    pad(40, 3.5, -3, 10, 10),
    pad(47, 4.5, 1, 6, 6),
    pad(53, 5.5, 4, 11, 11),
    pillar(53, 7.2, 8.5, 3, 3, 8),
  ],
  checkpoints: [[40, 4.5, -3]],
  enemies: [
    // Parked short of the spawn pad, and slow to notice you: the first few
    // seconds are for finding the controls.
    { type: 'chaser', at: [6, 0.6, -4], cfg: { aggro: 10 } },
    { type: 'chaser', at: [11, 1.6, 1] },
    { type: 'chaser', at: [19, 2.6, -1], cfg: { speed: 4.4 } },
    { type: 'spiker', at: [26.5, 3.1, -3] },
    { type: 'chaser', at: [40, 4.1, -5] },
    { type: 'spiker', at: [40, 4.1, 0], cfg: { patrol: 3 } },
    { type: 'chaser', at: [53, 6.1, 1] },
    { type: 'chaser', at: [53, 6.1, 6] },
  ],
  coins: [
    ...coinArc(7, 0.4, 0, 3, 0, 5),
    ...coinArc(15, 1.4, 0, 3, 0, 5),
    ...coinRow(19, 2, -2, 0, 2, 3),
    ...coinArc(23, 2.4, -1, 3, -2, 5),
    ...coinRow(40, 3.5, -6, 2, 0, 4),
    ...coinArc(43.5, 4, -1, 3, 2, 5),
    ...coinRow(50, 5.5, 4, 2, 0, 4),
  ],
};

/* ------------------------------------------------------------------ *
 *  Level 2 — Shooters: dodge the shot, then take the stomp
 * ------------------------------------------------------------------ */

const level2 = {
  name: 'Shooter Ridge',
  intro: 'Yellow Shooters lob shots. Their ring flashes just before they fire.',
  palette: PALETTES.dusk,
  spawn: [0, 2.5, 0],
  killY: -22,
  goal: [13, 9.5, -24],
  platforms: [
    pad(0, 0, 0, 12, 12),
    pad(0, 0.8, -10, 9, 10),
    pillar(-5, 2.4, -10, 2.6, 2.6, 6),
    pillar(5, 2.4, -10, 2.6, 2.6, 6),
    pad(0, 2, -19, 10, 8),
    pad(-6, 3.2, -25, 6.5, 6.5),
    pad(0, 4.4, -30, 7, 7),
    pad(7, 5.6, -25, 6.5, 6.5),
    pad(7, 7, -17.5, 5.5, 5.5, { motion: { axis: 'z', dist: 3.5, period: 6 }, color: 0xffc94d }),
    pad(13, 8.2, -24, 9, 9),
    pillar(13, 9.9, -28.5, 3, 3, 8),
  ],
  checkpoints: [[0, 3, -19], [0, 5.4, -30]],
  enemies: [
    { type: 'chaser', at: [0, 0.6, -3] },
    { type: 'shooter', at: [-5, 3.1, -10] },
    { type: 'shooter', at: [5, 3.1, -10], cfg: { fireInterval: 2.4 } },
    { type: 'spiker', at: [0, 2.6, -19] },
    { type: 'chaser', at: [-6, 3.8, -25] },
    { type: 'shooter', at: [0, 5, -30], cfg: { fireInterval: 1.8, range: 26 } },
    { type: 'chaser', at: [7, 6.2, -25] },
    { type: 'spiker', at: [13, 8.8, -22] },
    { type: 'chaser', at: [13, 8.8, -26] },
  ],
  coins: [
    ...coinRow(-4, 0, 0, 2, 0, 5),
    ...coinArc(0, 0.8, -5, 0, -5, 5),
    ...coinRow(-3, 2, -19, 2, 0, 4),
    ...coinArc(-3, 3.2, -27, 3, -2, 5),
    ...coinRow(7, 5.6, -23, 0, -2, 3),
    ...coinArc(9, 7, -20, 4, 2, 5),
    ...coinRow(10, 8.2, -24, 2, 0, 4),
  ],
};

/* ------------------------------------------------------------------ *
 *  Level 3 — a climb where the Spikers own the landing spots
 * ------------------------------------------------------------------ */

const level3 = {
  name: 'Spike Spiral',
  intro: 'Spikers cannot be stomped — jump over them and keep climbing.',
  palette: PALETTES.night,
  spawn: [0, 2.5, 3],
  killY: -22,
  goal: [0, 20.1, -4],
  platforms: [
    pad(0, 0, 0, 14, 14),
    pad(-8, 2, -5, 6.5, 6.5),
    pad(0, 4, -10, 8, 6.5),
    pad(8, 6, -5, 6.5, 6.5),
    pad(8, 8.2, 2, 6, 6, { motion: { axis: 'x', dist: 3.5, period: 6 }, color: 0xb47bff }),
    pad(0, 10.2, 4, 9, 7),
    pad(-8, 12.4, 0, 6.5, 7),
    pad(-8, 14.6, -8, 6.5, 6.5),
    pad(0, 16.6, -12, 8, 6.5),
    pad(0, 18.8, -4, 11, 11),
    pillar(0, 20.5, 0, 3, 3, 8),
  ],
  checkpoints: [[0, 11.2, 4], [0, 17.6, -12]],
  enemies: [
    { type: 'chaser', at: [3, 0.6, -3] },
    { type: 'spiker', at: [-8, 2.6, -5] },
    { type: 'chaser', at: [0, 4.6, -10] },
    { type: 'shooter', at: [8, 6.6, -5], cfg: { fireInterval: 2.2 } },
    { type: 'spiker', at: [0, 10.8, 4], cfg: { patrol: 3 } },
    { type: 'chaser', at: [0, 10.8, 6] },
    { type: 'spiker', at: [-8, 13, 0] },
    { type: 'chaser', at: [-8, 15.2, -8], cfg: { speed: 4.4 } },
    { type: 'shooter', at: [0, 17.2, -12], cfg: { range: 20 } },
    { type: 'spiker', at: [-3, 19.4, -4] },
    { type: 'chaser', at: [3, 19.4, -6] },
  ],
  coins: [
    ...coinArc(-4, 0, -2, -4, -3, 5),
    ...coinArc(-5, 2, -7, 5, -3, 5),
    ...coinArc(4, 4, -9, 4, 4, 5),
    ...coinRow(0, 10.2, 2, 0, 2, 3),
    ...coinArc(-4, 10.2, 3, -4, -3, 5),
    ...coinRow(-8, 14.6, -8, 0, 2, 3),
    ...coinArc(-4, 16.6, -11, 4, 3, 5),
    ...coinRow(-3, 18.8, -4, 2, 0, 4),
  ],
};

/* ------------------------------------------------------------------ *
 *  Level 4 — all three kinds in one arena
 * ------------------------------------------------------------------ */

const level4 = {
  name: 'Last Stand',
  intro: 'All three kinds, one arena. Clear a path and take the star.',
  palette: PALETTES.bloom,
  spawn: [0, 3, 20],
  killY: -20,
  goal: [0, 9.8, -16],
  platforms: [
    pad(0, 0, 17, 12, 12),
    pad(0, 0.5, 4, 28, 20),
    pillar(-10, 3, -2, 5, 5, 8),
    pillar(10, 3, -2, 5, 5, 8),
    pillar(-10, 3, 9, 5, 5, 8),
    pillar(10, 3, 9, 5, 5, 8),
    pad(0, 4.5, -8, 11, 8),
    pad(-7, 6.5, -14, 6, 6),
    pad(7, 6.5, -14, 6, 6),
    pad(0, 8.5, -16, 10, 9),
    pillar(0, 10.2, -20, 3, 3, 9),
  ],
  checkpoints: [[0, 1.5, 4]],
  enemies: [
    { type: 'chaser', at: [-6, 1.1, 8] },
    { type: 'chaser', at: [6, 1.1, 8] },
    { type: 'spiker', at: [0, 1.1, 6] },
    { type: 'chaser', at: [-8, 1.1, 0], cfg: { speed: 4.6 } },
    { type: 'chaser', at: [8, 1.1, 0], cfg: { speed: 4.6 } },
    { type: 'spiker', at: [0, 1.1, -2], cfg: { patrol: 4 } },
    { type: 'shooter', at: [-10, 3.6, -2] },
    { type: 'shooter', at: [10, 3.6, -2] },
    { type: 'shooter', at: [-10, 3.6, 9], cfg: { fireInterval: 2.6 } },
    { type: 'shooter', at: [10, 3.6, 9], cfg: { fireInterval: 2.6 } },
    { type: 'spiker', at: [0, 5.1, -8] },
    { type: 'chaser', at: [-7, 7.1, -14] },
    { type: 'chaser', at: [7, 7.1, -14] },
    { type: 'spiker', at: [0, 9.1, -16] },
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
