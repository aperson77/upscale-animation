/**
 * main.js
 * Scene bootstrap, post-processing pipeline, and top-level animation loop.
 * The Timeline instance is the single source of truth for all timing.
 *
 * ?record mode: renders every frame at fixed 1/60s timestep, encodes to
 * high-quality VP9 WebM at 1920×1080, and downloads automatically.
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
import { createGridBursts }            from './grid-bursts.js';
import { isRecordMode, Recorder }      from './recorder.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const BG_COLOR     = new THREE.Color(0x0d1520);
const RECORD_MODE  = isRecordMode();

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = BG_COLOR;

// ─── Lighting ─────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x1a2535, 0.9);
scene.add(ambientLight);

// ─── Camera ───────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  50,
  RECORD_MODE ? 3840 / 2160 : window.innerWidth / window.innerHeight,
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
  preserveDrawingBuffer: RECORD_MODE, // needed to read canvas for encoding
});

if (RECORD_MODE) {
  renderer.setSize(3840, 2160);
  renderer.setPixelRatio(1);
} else {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
}
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ─── Post-processing ──────────────────────────────────────────────────────────
const w0 = RECORD_MODE ? 3840 : window.innerWidth;
const h0 = RECORD_MODE ? 2160 : window.innerHeight;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(w0, h0),
  0.35,  // strength — slightly boosted for 4K clarity
  0.60,  // radius  — soft, diffuse spread
  0.25,  // threshold — low for headroom with progressive network brightness
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ─── Scene modules ────────────────────────────────────────────────────────────
const globe = createGlobe(scene, renderer);

const classical = createClassicalConnections(globe.globeGroup, globe.clusters);
const act1 = createAct1Animations(globe.globeGroup, globe.heroNode, globe.clusters);
const interconnect = createInterconnect(globe.globeGroup, globe.clusters);
const arctic = createArcticActivation(globe.globeGroup, globe.clusters, globe.satelliteNodes, globe.droneNodes);
const gridBursts = createGridBursts(globe.globeGroup, globe.clusters);

// ─── Camera controller ────────────────────────────────────────────────────────
const waterlooCluster = globe.clusters.find(c => c.name === 'Waterloo');
const cameraCtrl = createCameraController(camera, globe.heroNode.position, waterlooCluster.hub.position);

// ─── Master timeline ──────────────────────────────────────────────────────────
const timeline = new Timeline({ loop: false });
window.__timeline = timeline;

// ─── HTML overlay references ──────────────────────────────────────────────────
const overlayWordmark = document.getElementById('wordmark');

// ─── Capability pulse (58s) ─────────────────────────────────────────────────
const PULSE_T   = 67.0;
const PULSE_DUR = 0.5;
let pulseRings  = null;
let pulseFired  = false;

function initPulseRings() {
  pulseRings = [];
  const ringGeo = new THREE.RingGeometry(0.002, 0.003, 32);

  const allNodes = [];
  for (const c of globe.clusters) {
    for (const n of c.nodes) allNodes.push(n);
  }
  for (const s of globe.satelliteNodes) allNodes.push(s);
  for (const d of globe.droneNodes) allNodes.push(d);

  for (const node of allNodes) {
    if (!node.mesh || !node.mesh.visible) continue;
    const pos = node.mesh.position;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo.clone(), mat);
    ring.position.copy(pos);
    ring.lookAt(pos.clone().multiplyScalar(2));
    ring.visible = false;
    globe.globeGroup.add(ring);
    pulseRings.push({ mesh: ring, mat });
  }
}

function updatePulse(elapsed) {
  if (elapsed < PULSE_T) return;

  if (!pulseFired) {
    initPulseRings();
    pulseFired = true;
  }

  const age = elapsed - PULSE_T;
  if (age > PULSE_DUR) {
    for (const pr of pulseRings) pr.mesh.visible = false;
    return;
  }

  const t = age / PULSE_DUR;
  const scale = 1 + t * 5;
  const opacity = 1 - t * t;

  for (const pr of pulseRings) {
    pr.mesh.visible = true;
    pr.mesh.scale.setScalar(scale);
    pr.mat.opacity = opacity;
  }
}

// ─── Globe fade-out timing (globe fades, then only logo + background) ───────
const GLOBE_FADE_START = 77.0;  // globe starts fading (after rotating for ~12s)
const GLOBE_FADE_END   = 79.0;  // globe fully invisible, only background + logo

// ─── Shared tick function ─────────────────────────────────────────────────────
function tick(dt) {
  timeline.update(dt);

  globe.update(timeline.t, dt, timeline.progress, camera);
  classical.update(timeline.t, dt);
  act1.update(timeline.t, dt);
  interconnect.update(timeline.t, dt);
  arctic.update(timeline.t, dt);
  gridBursts.update(timeline.t, dt);
  cameraCtrl.update(timeline.t);

  updatePulse(timeline.t);

  // Globe rotation during finale (opening uses camera drift instead)
  if (timeline.t >= 65.0) {
    globe.globeGroup.rotation.y += 0.025 * dt;
  }

  // Globe fade-out: reduce tone mapping exposure so 3D geometry disappears
  // (scene.background is unaffected by tone mapping — stays as the base color)
  if (timeline.t >= GLOBE_FADE_START) {
    const fadeT = Math.min((timeline.t - GLOBE_FADE_START) / (GLOBE_FADE_END - GLOBE_FADE_START), 1);
    renderer.toneMappingExposure = 1.0 - fadeT;
  } else {
    renderer.toneMappingExposure = 1.0;
  }

  composer.render();
}

// ─── HTML overlay driver ──────────────────────────────────────────────────────
// Cache the vertical shift needed to center the logo (computed once)
let logoShiftY = null;

function updateOverlays() {
  // Wordmark fades in at 60-61s (over the rotating globe), stays through fade-out
  const wordmarkIn = timeline.window(75.0, 76.0);

  // After globe fades out, logo grows bigger and moves to center
  const growT = timeline.window(79.0, 80.0);

  overlayWordmark.style.opacity = Math.max(wordmarkIn, growT > 0 ? 1 : 0).toFixed(3);

  if (growT > 0) {
    if (logoShiftY === null) {
      // Element is at bottom: 28%. Compute pixels to shift up to reach viewport center.
      const vh = window.innerHeight;
      const elementBottomFromTop = vh * 0.72;  // bottom: 28% → 72% from top
      const elementCenterFromTop = elementBottomFromTop - 28; // ~half of 56px height
      logoShiftY = elementCenterFromTop - vh * 0.5;
    }
    const eased = growT * growT * (3 - 2 * growT); // smoothstep
    const scale = 1 + eased * 0.6;  // 1× → 1.6×
    const shiftPx = eased * logoShiftY;
    overlayWordmark.style.transform =
      `translateX(-50%) translateY(-${shiftPx.toFixed(1)}px) scale(${scale.toFixed(3)})`;
  } else {
    overlayWordmark.style.transform = 'translateX(-50%)';
  }
}

// ─── Resize (real-time mode only) ─────────────────────────────────────────────
if (!RECORD_MODE) {
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  }
  window.addEventListener('resize', onResize);
}

// ─── Start ────────────────────────────────────────────────────────────────────
const startScreen = document.getElementById('start-screen');

if (RECORD_MODE) {
  // ── Recording mode ───────────────────────────────────────────────────────
  startScreen.classList.add('hidden');
  const recorder = new Recorder(renderer.domElement);

  // Wait briefly for logo to load, then start
  setTimeout(() => {
    timeline.start();

    function recordLoop() {
      tick(recorder.fixedDt);

      const wordmarkOpacity = timeline.window(75.0, 76.0);
      recorder.captureFrame(wordmarkOpacity);

      if (!recorder.done) {
        // Throttle if encoder queue is deep
        if (recorder.backpressure) {
          setTimeout(recordLoop, 5);
        } else {
          requestAnimationFrame(recordLoop);
        }
      } else {
        recorder.finalize();
      }
    }

    recordLoop();
  }, 500);

} else {
  // ── Real-time mode ───────────────────────────────────────────────────────
  startScreen.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    timeline.start();
  }, { once: true });

  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;

    tick(dt);
    updateOverlays();
  }

  animate();
}
