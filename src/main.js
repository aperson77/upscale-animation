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
import { createInterconnect }          from './interconnect.js';
import { createArcticActivation }      from './arctic.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const BG_COLOR = new THREE.Color(0x0d1520);

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = BG_COLOR;

// ─── Lighting ─────────────────────────────────────────────────────────────────
// Ambient light for any future MeshStandardMaterial usage.
// Globe and nodes currently use MeshBasicMaterial (ignores lights).
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
  0.30,  // strength — subtle, warm
  0.50,  // radius  — soft spread
  0.85,  // threshold — only bright emissive nodes fire
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ─── Scene modules ────────────────────────────────────────────────────────────
const globe = createGlobe(scene, renderer);

const classical = createClassicalConnections(globe.globeGroup, globe.clusters);
const act1 = createAct1Animations(globe.globeGroup, globe.heroNode, globe.clusters);
const interconnect = createInterconnect(globe.globeGroup, globe.clusters);
const arctic = createArcticActivation(globe.globeGroup, globe.clusters, globe.satelliteNodes, globe.droneNodes);

// ─── Camera controller ────────────────────────────────────────────────────────
// Replaces the static position set above — controller owns camera movement.
const waterlooCluster = globe.clusters.find(c => c.name === 'Waterloo');
const cameraCtrl = createCameraController(camera, globe.heroNode.position, waterlooCluster.hub.position);

// ─── Master timeline ──────────────────────────────────────────────────────────
const timeline = new Timeline({ loop: false });

// Expose on window for live debugging in browser console:
//   timeline.pause() / timeline.resume() / timeline.t
window.__timeline = timeline;

// ─── HTML overlay references ──────────────────────────────────────────────────
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
function updateOverlays() {
  // UpScale wordmark — fades in at the end over full Arctic network
  const wordmarkIn = timeline.window(34.0, 35.0);    // 1s fade-in
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
  classical.update(timeline.t, dt);
  act1.update(timeline.t, dt);
  interconnect.update(timeline.t, dt);
  arctic.update(timeline.t, dt);
  cameraCtrl.update(timeline.t);

  // Drive HTML overlays
  updateOverlays();

  composer.render();
}

animate();
