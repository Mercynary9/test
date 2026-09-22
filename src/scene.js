import * as THREE from 'three';
import { MOBILE_TIER } from './touch.js';

/** The pixel-ratio ceiling: phone GPUs cannot afford a 3x framebuffer. */
export const MAX_PIXEL_RATIO = MOBILE_TIER ? 1.5 : 2;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // MSAA is the first thing to go on a phone; the dynamic resolution scaler
    // in main.js keeps the framebuffer honest instead.
    antialias: !MOBILE_TIER,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = MOBILE_TIER ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

/**
 * Keep the *horizontal* field of view fixed so a portrait phone sees as much of
 * the level to either side as a landscape one. three.js `fov` is vertical, so it
 * has to be derived from the aspect ratio on every resize and rotation.
 */
const H_FOV = THREE.MathUtils.degToRad(80);

export function fovForAspect(aspect) {
  const vertical = 2 * Math.atan(Math.tan(H_FOV * 0.5) / Math.max(0.35, aspect));
  // A phone in portrait would need a fisheye 120 degrees to hold the same
  // horizontal span, so the vertical angle is capped: portrait trades width for
  // a taller view, which is the useful half for a platformer anyway.
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vertical), 54, 74);
}

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vWorld;
  uniform vec3 top;
  uniform vec3 middle;
  uniform vec3 bottom;
  void main() {
    float h = normalize(vWorld).y;
    vec3 c = h > 0.0 ? mix(middle, top, pow(h, 0.7)) : mix(middle, bottom, pow(-h, 0.6));
    gl_FragColor = vec4(c, 1.0);
  }
`;

function createSky(palette) {
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(palette.skyTop) },
      middle: { value: new THREE.Color(palette.skyMid) },
      bottom: { value: new THREE.Color(palette.skyBottom) },
    },
  });
  // Smaller than the camera's far plane, which is pulled in on mobile.
  const radius = MOBILE_TIER ? 280 : 400;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, MOBILE_TIER ? 24 : 32, MOBILE_TIER ? 12 : 16), material);
  sky.frustumCulled = false;
  return sky;
}

export function createScene(palette) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(palette.fog, 60, 220);

  const sky = createSky(palette);
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(palette.ambient ?? palette.skyMid, palette.ground, 1.0);
  scene.add(hemi);

  // a floor of fill light so shadowed platforms stay readable, even at night
  const ambient = new THREE.AmbientLight(palette.ambient ?? palette.skyMid, palette.ambientIntensity ?? 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(palette.sun, 2.0);
  sun.position.set(24, 42, 18);
  sun.castShadow = true;
  // A 1024 map over a tighter frustum costs a quarter of the fill and, because
  // the frustum follows the player, looks no softer on a phone-sized screen.
  const shadowRes = MOBILE_TIER ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  const s = MOBILE_TIER ? 38 : 60;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const aspect = innerWidth / innerHeight;
  const camera = new THREE.PerspectiveCamera(fovForAspect(aspect), aspect, 0.1, MOBILE_TIER ? 340 : 500);

  return { scene, camera, sun, sky, hemi, ambient };
}

export function applyPalette(parts, palette) {
  parts.scene.fog.color.set(palette.fog);
  parts.sky.material.uniforms.top.value.set(palette.skyTop);
  parts.sky.material.uniforms.middle.value.set(palette.skyMid);
  parts.sky.material.uniforms.bottom.value.set(palette.skyBottom);
  parts.hemi.color.set(palette.ambient ?? palette.skyMid);
  parts.hemi.groundColor.set(palette.ground);
  parts.ambient.color.set(palette.ambient ?? palette.skyMid);
  parts.ambient.intensity = palette.ambientIntensity ?? 0.5;
  parts.sun.color.set(palette.sun);
  parts.sun.intensity = palette.sunIntensity ?? 2.0;
}

/** Shared standard materials, keyed by colour + options. */
const matCache = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.65,
      metalness: opts.metalness ?? 0.05,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      flatShading: opts.flatShading ?? false,
    });
    matCache.set(key, m);
  }
  return m;
}

/** Geometry singletons so hundreds of props stay cheap. */
export const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  lowSphere: new THREE.SphereGeometry(1, 10, 8),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 14),
  torus: new THREE.TorusGeometry(1, 0.22, 10, 22),
  octa: new THREE.OctahedronGeometry(1, 0),
  dome: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
};
