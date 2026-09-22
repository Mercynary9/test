import * as THREE from 'three';

export function createRenderer(canvas, { mobile = false } = {}) {
  // Phone GPUs cannot afford MSAA at 3x device pixel ratio; the cap costs far
  // less visually than the frame rate does.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  sky.frustumCulled = false;
  return sky;
}

export function createScene(palette, { mobile = false } = {}) {
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
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  const s = mobile ? 42 : 60; // tighter frustum keeps 1024px shadows crisp
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // a taller field of view on portrait phones keeps the platform ahead in frame
  const camera = new THREE.PerspectiveCamera(mobile ? 68 : 62, innerWidth / innerHeight, 0.1, 500);

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
