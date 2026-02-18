/**
 * main.js
 * Scene bootstrap, post-processing pipeline, and top-level animation loop.
 * The Timeline instance is the single source of truth for all timing.
 */

import * as THREE from 'three';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js';

import { Timeline }                   from './timing.js';
import { createGlobe }                from './globe.js';
import { createClassicalConnections }  from './connections.js';
import { createCameraController }      from './camera.js';
import { createAct1Animations }        from './particles.js';
import { createQuantumFailures }       from './quantum_fail.js';
import { createCascade }               from './cascade.js';
import { createVignettes }             from './vignettes.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const BG_COLOR = new THREE.Color(0x0d1520);

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = BG_COLOR;

// ─── Lighting ─────────────────────────────────────────────────────────────────
// Ambient only. The globe uses MeshBasicMaterial (ignores lights entirely).
// Nodes use MeshStandardMaterial for emissive+bloom, but should look uniform —
// directional lights are removed to prevent specular tinting varying per node.
const ambientLight = new THREE.AmbientLight(0x1a2535, 0.9);
scene.add(ambientLight);

// ─── Camera ───────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.01,
  1000,
);
camera.position.set(0, 0.5, 7);
camera.lookAt(0, 0, 0);

// ─── Renderer ─────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ─── Post-processing ──────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.38,  // strength — slightly softer
  0.28,  // radius  — tighter halo, reduces blurry spread
  0.75,  // threshold — fires on bright emissive nodes
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ─── Scene modules ────────────────────────────────────────────────────────────
const globe     = createGlobe(scene);
const classical = createClassicalConnections(globe.globeGroup, globe.groundNodes);
const act1      = createAct1Animations(globe.globeGroup, globe.heroNode);
const qfail     = createQuantumFailures(
  globe.globeGroup,
  classical.curves,
  classical.edgeList,
  globe.groundNodes,
);
const cascade   = createCascade(globe.globeGroup, globe.nodes);
const vignettes = createVignettes(globe.globeGroup, globe.nodes);

// ─── Camera controller ────────────────────────────────────────────────────────
// Replaces the static position set above — controller owns camera movement.
const cameraCtrl = createCameraController(camera);

// ─── Master timeline ──────────────────────────────────────────────────────────
const timeline = new Timeline({ loop: false });

// Expose on window for live debugging in browser console:
//   timeline.pause() / timeline.resume() / timeline.t
window.__timeline = timeline;

// ─── HTML overlay references ──────────────────────────────────────────────────
const overlayAct2    = document.getElementById('text-act2');
const overlayWordmark = document.getElementById('wordmark');

// ─── Resize ───────────────────────────────────────────────────────────────────
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
}
window.addEventListener('resize', onResize);

// ─── Click-to-start ───────────────────────────────────────────────────────────
const startScreen = document.getElementById('start-screen');

startScreen.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  timeline.start();
}, { once: true });

// ─── HTML overlay driver ──────────────────────────────────────────────────────
// Drives CSS opacity on the two text overlays based on timeline windows.
function updateOverlays() {
  // "These machines cannot talk to each other." — Beat 2, ~9–10.5s
  // Fade in 0.5s, hold 1.5s, fade out 0.5s
  const act2TextIn  = timeline.window(9.0, 9.5);    // 0.5s fade-in
  const act2TextOut = timeline.window(10.5, 11.0);  // 0.5s fade-out
  overlayAct2.style.opacity = (act2TextIn - act2TextOut).toFixed(3);

  // UpScale wordmark — fades in at 28.5s into Final beat
  const wordmarkIn = timeline.window(28.5, 30.0);   // 1.5s fade-in
  overlayWordmark.style.opacity = wordmarkIn.toFixed(3);
}

// ─── Animation loop ───────────────────────────────────────────────────────────
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05); // seconds, capped at 50ms
  lastTime  = now;

  // Tick the timeline
  timeline.update(dt);

  // Update scene modules
  globe.update(timeline.t, dt, timeline.progress);
  classical.update(timeline.t, dt, timeline.progress);
  act1.update(timeline.t, dt, timeline.progress);
  qfail.update(timeline.t, dt);
  cascade.update(timeline.t, dt);
  vignettes.update(timeline.t, dt);
  cameraCtrl.update(timeline.progress);

  // Drive HTML overlays
  updateOverlays();

  composer.render();
}

animate();
