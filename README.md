# Sky Stomp — a 3D jump platformer

A small 3D platformer built with [three.js](https://threejs.org/): run, jump,
double-jump and dash across floating islands, stomp what can be stomped, and
reach the star at the end of each of the four levels.

No build step, no dependencies to install — it is plain ES modules and one
`<script type="importmap">` pointing at the three.js CDN build.

## Run it

ES modules need to be served over HTTP (opening `index.html` straight from the
file system will not work), so start any static server in this folder:

```bash
python3 -m http.server 8000
# or:  npx --yes http-server -p 8000 -c-1 .
```

Then open <http://localhost:8000/>. An internet connection is needed on first
load so the browser can fetch three.js from the CDN.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move (relative to the camera) |
| `Space` | Jump — press again in mid-air for a double jump |
| `Space` (held vs. tapped) | Hold for a full-height jump, release early for a short hop |
| `Shift` | Dash |
| Mouse | Look around (click the canvas to capture the pointer, `Esc` releases it) |
| Arrow keys | Turn the camera without the mouse |
| `P` | Pause / resume |
| `R` | Restart the current level |

Landing on an enemy's head is a *stomp*. Anything with spikes on top hurts you
instead, so those have to be dodged — or hit with a kicked shell.

## The eight enemies

| Enemy | Behaviour | Stomp result |
| --- | --- | --- |
| **Ball** | Chases you along the ground. | Defeated. |
| **Spike Ball** | Chases you, covered in spikes. | Not stompable — costs a heart. |
| **Shell Ball** | Holds its ground and lobs shots at you. | Defeated, and drops a kickable shell. |
| **Red Ball** | Chases *and* jumps, so it can follow you up. | Defeated. |
| **Horn Red Ball** | A Red Ball with a horn — same jumping chase. | Not stompable — costs a heart. |
| **Flyer Ball** | Hovers above you and dive-bombs. | Defeated (you can meet it mid-dive). |
| **Bomb Ball** | Chases you; stomping lights its fuse instead of killing it. | Fuse lit — the blast clears everything nearby, you included. |
| **Big Ball** | Slow and heavy. | Splits into two quick Balls. |

The first five are the enemies from the brief. Flyer Ball, Bomb Ball and Big
Ball were added to round the roster out to eight, keeping to the same
"stompable vs. not" language the others are built on.

**Shells.** Stomping a Shell Ball leaves its shell behind. Walk into a resting
shell to kick it: it rockets off, ricochets off walls, and flattens every enemy
it touches — including Spike Balls and Horn Red Balls, which you cannot stomp.
A moving shell hurts you too, so keep out of its lane; stomping one stops it
dead so you can re-aim.

## Levels

1. **Sky Steps** — the basics: chase-and-stomp, spikes, one moving platform.
2. **Shell Shoals** — ranged fire from Shell Balls, and the shells they leave.
3. **Boom Heights** — a vertical climb with Flyer Balls, Bomb Balls and Big Balls.
4. **Grand Melee** — all eight kinds in one arena.

Coins are optional; checkpoint rings set where you respawn after a fall.

## Layout

```
index.html        page shell, HUD markup, three.js import map
styles.css        HUD and overlay styling
src/main.js       Game class: loop, level lifecycle, contacts, camera
src/physics.js    AABB bodies, per-axis collision resolution, ray/ground queries
src/player.js     movement, jumping, dashing, damage, animation
src/enemies.js    the eight enemy types, shells and projectiles
src/levels.js     level data (platforms, enemies, coins, checkpoints, palettes)
src/level.js      turns level data into meshes + collision boxes
src/scene.js      renderer, lights, gradient sky, shared geometry/materials
src/fx.js         particle bursts and shock rings
src/hud.js        hearts, counters, toasts, overlays
src/audio.js      WebAudio blips (no asset files)
```

### Adding an enemy

Subclass `Enemy` in `src/enemies.js`, give it a `update(dt)` (or reuse the
default chase behaviour) and an `onStomp()` / `onTouch()` returning
`{ bounce, hurt }`, then register it in `ENEMY_TYPES`. The registry drives both
`spawnEnemy()` and the in-game bestiary panel.

### Adding a level

Append an entry to `LEVELS` in `src/levels.js`. Platforms are declared by the
height of their *top* surface via `pad()` / `pillar()`, which is the number you
actually care about when placing a jump.

## Implementation notes

- The simulation runs on a fixed 1/120 s timestep (up to 8 substeps per frame)
  so physics stays identical regardless of display refresh rate.
- Collision is AABB-vs-AABB, resolved one axis at a time. Each axis only
  resolves overlaps that *this step's motion* created — without that guard, a
  body resting on a wide platform gets ejected sideways by half the platform's
  width. `unembed()` is the safety net for anything that ends up fully inside a
  solid.
- Jumping has coyote time, input buffering and variable height, so the controls
  stay forgiving at platform edges.
- Enemies check for ground ahead before stepping, so they patrol their platform
  instead of walking off it.
