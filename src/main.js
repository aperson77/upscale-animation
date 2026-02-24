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
  renderer.setPixelRatio(window.devicePixelRatio); // full native resolution
}
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ─── Post-processing ──────────────────────────────────────────────────────────
// Use actual pixel dimensions (includes devicePixelRatio) for crisp bloom
const dpr = RECORD_MODE ? 1 : window.devicePixelRatio;
const w0 = RECORD_MODE ? 3840 : Math.floor(window.innerWidth * dpr);
const h0 = RECORD_MODE ? 2160 : Math.floor(window.innerHeight * dpr);

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
const gridBursts = createGridBursts(globe.globeGroup, globe.clusters, camera);

// ─── Camera controller ────────────────────────────────────────────────────────
const waterlooCluster = globe.clusters.find(c => c.name === 'Waterloo');
const cameraCtrl = createCameraController(camera, globe.heroNode.position, waterlooCluster.hub.position);

// ─── Master timeline ──────────────────────────────────────────────────────────
const timeline = new Timeline({ loop: false });
window.__timeline = timeline;

// ─── HTML overlay references ──────────────────────────────────────────────────
const overlayWordmark = document.getElementById('wordmark');

// ─── Capability pulse (58s) ─────────────────────────────────────────────────
const PULSE_T   = 61.0;
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
const GLOBE_FADE_START = 67.0;  // globe starts fading (after rotating for ~8s)
const GLOBE_FADE_END   = 68.0;  // globe fully invisible in 1s, only background + logo

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
  if (timeline.t >= 59.0) {
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
function updateOverlays() {
  // Wordmark fades in at 65-66s (over the rotating globe)
  const wordmarkIn = timeline.window(65.0, 66.0);

  // After globe fades out (68s), logo expands in place from center
  const growT = timeline.window(68.0, 70.0);

  overlayWordmark.style.opacity = Math.max(wordmarkIn, growT > 0 ? 1 : 0).toFixed(3);

  const eased = growT * growT * (3 - 2 * growT); // smoothstep
  const scale = 1 + eased * 0.6;  // 1× → 1.6×
  overlayWordmark.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
}

// ─── Resize (real-time mode only) ─────────────────────────────────────────────
if (!RECORD_MODE) {
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = window.devicePixelRatio;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(pr);
    composer.setSize(w, h);
    bloomPass.resolution.set(Math.floor(w * pr), Math.floor(h * pr));
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
    let timelineStarted = false;

    function recordLoop() {
      if (recorder.inIntro) {
        // Intro phase: start screen with logo + "Click to begin"
        recorder.captureIntroFrame();
      } else {
        // Animation phase
        if (!timelineStarted) {
          timeline.start();
          timelineStarted = true;
        }
        tick(recorder.fixedDt);

        const wordmarkIn = timeline.window(65.0, 66.0);
        const growT = timeline.window(68.0, 70.0);
        const eased = growT * growT * (3 - 2 * growT);
        const wordmarkOpacity = Math.max(wordmarkIn, growT > 0 ? 1 : 0);
        const wordmarkScale = 1 + eased * 0.6;
        recorder.captureFrame(wordmarkOpacity, wordmarkScale);
      }

      if (!recorder.done) {
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
