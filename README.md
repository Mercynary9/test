# Sky Stomp — a 3D jump platformer for phones

Run, jump, double-jump and dash across floating islands, stomp what can be
stomped, dodge what cannot, and reach the star at the end of each of the four
levels. Built with [three.js](https://threejs.org/) and played with two thumbs.

No build step and nothing to install — plain ES modules and one
`<script type="importmap">` pointing at the three.js CDN build.

## Run it

ES modules need to be served over HTTP (opening `index.html` from the file
system will not work), so start any static server in this folder:

```bash
python3 -m http.server 8000
# or:  npx --yes http-server -p 8000 -c-1 .
```

Then open <http://localhost:8000/>. To play it on a real phone, open
`http://<your-computer's-LAN-ip>:8000/` from the phone on the same network. An
internet connection is needed on first load so the browser can fetch three.js
from the CDN.

## Controls

The game detects a touch screen and shows the on-screen controls only there;
with a keyboard attached it plays as a desktop game instead.

| Touch | Action |
| --- | --- |
| Left thumb, anywhere on the left | Floating thumbstick — run (relative to the camera) |
| **JUMP** | Jump. Tap again in mid-air for a double jump; hold for a full-height jump, release early for a short hop |
| **DASH** | Dash. The button dims while it recharges |
| Right thumb, dragged anywhere else | Swing the camera |
| ⏸ / ⟲ (top right) | Pause · restart the level |

| Keyboard | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `Space` | Jump / double jump (hold for height) |
| `Shift` | Dash |
| Mouse (click to capture, `Esc` to release) or arrow keys | Camera |
| `P` · `R` | Pause · restart the level |

Landing on an enemy's head is a *stomp*. Anything with spikes on top hurts you
instead, so those have to be jumped over or run around.

## The three enemies

| Enemy | Behaviour | Stomp result |
| --- | --- | --- |
| **Chaser** (green) | Runs at you across the ground, and hops when you are above it, so it can follow you up a ledge. | Defeated. |
| **Shooter** (yellow) | Holds its platform and lobs arcing shots at you from up to ~22 units away. A ring flashes around it just before it fires. | Defeated. |
| **Spiker** (grey, spiked) | Chases you, a little slower than a Chaser, covered in spikes. | Not stompable — it bounces you off and costs a heart. |

The **left** counter in the HUD tracks the stompable enemies still standing.
Spikers are hazards rather than targets, so they are not counted: nothing in the
game asks you to clear them, only to get past them.

## Levels

1. **Sunrise Steps** — Chasers, one moving platform, and the first Spiker.
2. **Shooter Ridge** — Shooters on pillars; learn to read the flash and close in.
3. **Spike Spiral** — a climb where the Spikers stand on the landing spots.
4. **Last Stand** — all three kinds in one arena.

Coins are optional; checkpoint rings set where you respawn after a fall.

## Built for a phone

- **On-screen controls** (`src/touch.js`): a thumbstick whose origin appears
  where your thumb lands and trails it if you slide past full tilt, plus JUMP and
  DASH buttons. Each control is a DOM element tagged `data-control`, so a pointer
  is routed by what it landed on rather than by comparing screen coordinates, and
  pointers are captured on press so a thumb that slides off a button stays
  attached to it. Several fingers work at once: run, turn the camera and jump
  together.
- **Camera assist**: let go of the camera for half a second while running and it
  drifts around behind your direction of travel, so one thumb can steer a whole
  level.
- **A render tier for phones** (`MOBILE_TIER` in `src/touch.js`): MSAA off, a
  1024² shadow map over a tighter frustum, a nearer far plane, fewer particles,
  and a pixel-ratio ceiling of 1.5. On top of that, `updatePerf()` in
  `src/main.js` measures the frame time and scales the framebuffer between 100%
  and 62% to hold the frame rate, climbing back up when there is headroom.
- **Portrait and landscape**: the camera keeps a fixed *horizontal* field of view
  where the aspect ratio allows it (`fovForAspect()`), pulls in a little closer in
  portrait, and re-measures after the rotation settles — an orientation change on
  iOS reports a stale `innerHeight` for a moment.
- **Phone housekeeping**: `viewport-fit=cover` with `env(safe-area-inset-*)`
  padding for notches and home bars, `touch-action: none` plus
  `overscroll-behavior: none` so a drag never scrolls or pulls to refresh, no tap
  highlight or text selection, an inline SVG favicon (no extra request), a
  full-screen request on Start, and an automatic pause when you lock the phone or
  switch apps.

## Layout

```
index.html        page shell, HUD markup, touch-control markup, three.js import map
styles.css        HUD, overlays and on-screen controls
src/main.js       Game class: loop, level lifecycle, contacts, camera, perf scaler
src/touch.js      on-screen thumbstick and buttons; device tier flags
src/input.js      keyboard and pointer-lock mouse (desktop)
src/physics.js    AABB bodies, per-axis collision resolution, ray/ground queries
src/player.js     movement, jumping, dashing, damage, animation
src/enemies.js    Chaser, Shooter, Spiker and their projectiles
src/levels.js     level data (platforms, enemies, coins, checkpoints, palettes)
src/level.js      turns level data into meshes + collision boxes
src/scene.js      renderer, lights, gradient sky, shared geometry/materials
src/fx.js         particle bursts and shock rings
src/hud.js        hearts, counters, toasts, overlays
src/audio.js      WebAudio blips (no asset files)
```

### Adding an enemy

Subclass `Enemy` in `src/enemies.js`, give it an `update(dt)` (or reuse the
default chase behaviour) and an `onStomp()` / `onTouch()` returning
`{ bounce, hurt }`, then register it in `ENEMY_TYPES`. The registry drives both
`spawnEnemy()` and the in-game list of enemies on the menu and pause panels.

### Adding a level

Append an entry to `LEVELS` in `src/levels.js`. Platforms are declared by the
height of their *top* surface via `pad()` / `pillar()`, which is the number you
actually care about when placing a jump. Keep pads wide and gaps short: a
thumbstick is less precise than a keyboard.

## Implementation notes

- The simulation runs on a fixed 1/120 s timestep (up to 8 substeps per frame)
  so physics stays identical regardless of display refresh rate — and identical
  on a phone that is dropping frames.
- Collision is AABB-vs-AABB, resolved one axis at a time. Each axis only
  resolves overlaps that *this step's motion* created — without that guard, a
  body resting on a wide platform gets ejected sideways by half the platform's
  width. `unembed()` is the safety net for anything that ends up fully inside a
  solid.
- Jumping has coyote time, input buffering and variable height, so the controls
  stay forgiving at platform edges — which matters more when the jump button is
  under a thumb.
- Enemies check for ground ahead before stepping, so they patrol their platform
  instead of walking off it.
