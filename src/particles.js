/**
 * particles.js — Beat 1 close-up animation.
 *
 * A single node attempts a complex computation and fails.
 *
 * 0–2.5s:    Quiet hero node, subtle pulse.
 * 2.5–9.0s:  A rectangular grid GROWS outward from the node.
 *            Grid sites gently pulse/vibrate to show "action."
 *            Concentric WAVE PULSES ripple outward. Data dots flow
 *            along edges. Grid dims with Gaussian fade at edges
 *            to suggest scalability.
 * 9.0–11.0s: GLITCH FAILURE — digital corruption from outer edges inward.
 *            Grid sections blink, jitter, die. Failure is obvious.
 * 11.0s:     Other Waterloo nodes + hub fade in.
 */

import * as THREE from 'three';

// ─── Colors ─────────────────────────────────────────────────────────────────
const GRID_COLOR = new THREE.Color(0.4, 0.6, 1.0);    // blue-white grid lines
const VERT_COLOR = new THREE.Color(0.55, 0.75, 1.0);  // brighter intersections
const DOT_COLOR  = new THREE.Color(0.85, 0.93, 1.0);  // bright data pulses

// ─── Timing ─────────────────────────────────────────────────────────────────
const BUILD_START     = 8.5;   // grid appears after zoom-in lands on close-up (t=8)
const BUILD_END       = 13.0;  // grid fully extended (4.5s slow build — each ring takes its time)
const GRID_FADE_START = 13.0;  // fade begins as camera starts pulling back to 3 nodes
const GRID_FADE_END   = 15.0;  // fully gone by the time zoom-out completes

// ─── Grid config ────────────────────────────────────────────────────────────
// Rectangular grid for close-up framing (FOV 24°)
const GRID_HALF    = 3;                             // -3 to +3 = 7×7 grid
const GRID_SPACING = 0.0014;
const MAX_RADIUS   = GRID_HALF * GRID_SPACING;      // furthest point
const GAUSS_SIGMA  = MAX_RADIUS * 0.55;              // Gaussian fall-off width

const VERT_SIZE = 0.0019;
const DOT_SIZE  = 0.0020;
const DOT_COUNT = 20;

// ─── Wave pulse config ──────────────────────────────────────────────────────
const WAVE_INTERVAL  = 0.85;   // new wave every 0.85s (slower, more stately)
const WAVE_SPEED     = 0.009;  // radial expansion (units/sec) — slower ripples
const WAVE_WIDTH     = 0.004;  // ring thickness (wider for softer look)
const WAVE_INTENSITY = 1.0;    // peak brightness

// ─── Seeded PRNG ────────────────────────────────────────────────────────────
function createRNG(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// ─── Round point texture ────────────────────────────────────────────────────
function createCircleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0,   'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// ─── createAct1Animations ───────────────────────────────────────────────────
export function createAct1Animations(globeGroup, heroNode, clusters) {
  const rand  = createRNG(42);
  const group = new THREE.Group();
  globeGroup.add(group);

  const heroPos   = heroNode.position.clone();
  const normal    = heroPos.clone().normalize();
  const tangent   = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
  const bitangent = new THREE.Vector3()
    .crossVectors(normal, tangent).normalize();

  function toWorld(x, y, h) {
    return heroPos.clone()
      .addScaledVector(tangent, x)
      .addScaledVector(bitangent, y)
      .addScaledVector(normal, h);
  }

  // ── Generate rectangular grid vertices ────────────────────────────────
  const verts   = [];
  const vertMap = new Map();

  for (let row = -GRID_HALF; row <= GRID_HALF; row++) {
    for (let col = -GRID_HALF; col <= GRID_HALF; col++) {
      const x    = col * GRID_SPACING;
      const y    = row * GRID_SPACING;
      const dist = Math.sqrt(x * x + y * y);
      const ring = Math.max(Math.abs(col), Math.abs(row)); // Chebyshev distance
      const h    = 0.004 + ring * 0.0003;

      // Gaussian fade: bright at center, smoothly dimming at edges
      const radialFade = Math.exp(-(dist * dist) / (2 * GAUSS_SIGMA * GAUSS_SIGMA));

      // Reveal time: inner cells first
      const revealT = BUILD_START + (ring / GRID_HALF) * (BUILD_END - BUILD_START - 0.8);

      // Per-vertex pulse phase (varied so sites don't pulse in unison)
      const pulsePhase = (col * 2.7 + row * 3.1) % (Math.PI * 2);

      const idx = verts.length;
      vertMap.set(`${col},${row}`, idx);
      verts.push({
        idx, col, row, ring, dist,
        baseX: x, baseY: y, h,
        worldPos: toWorld(x, y, h),
        revealT, radialFade, pulsePhase,
      });
    }
  }

  // ── Generate edges (4-connected: right and down only to avoid dupes) ──
  const ADJ   = [[1, 0], [0, 1]];
  const edges = [];

  for (const v of verts) {
    for (const [dc, dr] of ADJ) {
      const nIdx = vertMap.get(`${v.col + dc},${v.row + dr}`);
      if (nIdx === undefined) continue;

      const nv       = verts[nIdx];
      const edgeRing = Math.max(v.ring, nv.ring);
      const edgeDist = (v.dist + nv.dist) / 2;
      const revealT  = Math.max(v.revealT, nv.revealT);
      const radialFade = Math.min(v.radialFade, nv.radialFade);

      // a = inner vertex, b = outer (for draw direction)
      const aIdx = v.ring <= nv.ring ? v.idx : nIdx;
      const bIdx = aIdx === v.idx ? nIdx : v.idx;

      edges.push({ a: aIdx, b: bIdx, ring: edgeRing, dist: edgeDist, revealT, radialFade });
    }
  }

  const nVerts = verts.length;
  const nEdges = edges.length;

  // ── Shared texture ──────────────────────────────────────────────────────
  const circleTex = createCircleTexture();

  // ── Vertex Points (grid intersections) ──────────────────────────────────
  const vPosArr = new Float32Array(nVerts * 3);
  const vColArr = new Float32Array(nVerts * 3);
  const vGeo    = new THREE.BufferGeometry();
  vGeo.setAttribute('position', new THREE.BufferAttribute(vPosArr, 3));
  vGeo.setAttribute('color',    new THREE.BufferAttribute(vColArr, 3));

  const vMat = new THREE.PointsMaterial({
    size: VERT_SIZE, map: circleTex, transparent: true,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
    depthWrite: false, vertexColors: true,
  });
  const vertexPoints = new THREE.Points(vGeo, vMat);
  group.add(vertexPoints);

  // Init positions
  for (const v of verts) {
    const i3 = v.idx * 3;
    vPosArr[i3] = v.worldPos.x; vPosArr[i3 + 1] = v.worldPos.y; vPosArr[i3 + 2] = v.worldPos.z;
  }

  // ── Edge LineSegments ───────────────────────────────────────────────────
  const ePosArr = new Float32Array(nEdges * 6);
  const eColArr = new Float32Array(nEdges * 6);
  const eGeo    = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePosArr, 3));
  eGeo.setAttribute('color',    new THREE.BufferAttribute(eColArr, 3));

  const eMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const edgeLines = new THREE.LineSegments(eGeo, eMat);
  group.add(edgeLines);

  // ── Data dots (dt-accumulated so slowdown is smooth) ────────────────────
  const dotInfos = [];
  for (let d = 0; d < DOT_COUNT; d++) {
    dotInfos.push({
      edgeIdx: Math.floor(rand() * nEdges),
      speed:   0.40 + rand() * 0.35,   // slower data flow
      pos:     rand(),
    });
  }

  const dPosArr = new Float32Array(DOT_COUNT * 3);
  const dColArr = new Float32Array(DOT_COUNT * 3);
  const dGeo    = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPosArr, 3));
  dGeo.setAttribute('color',    new THREE.BufferAttribute(dColArr, 3));

  const dMat = new THREE.PointsMaterial({
    size: DOT_SIZE, map: circleTex, transparent: true,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
    depthWrite: false, vertexColors: true,
  });
  const dotMesh = new THREE.Points(dGeo, dMat);
  dotMesh.visible = false;  // dots disabled — grid uses waves + vertex breathing only
  group.add(dotMesh);

  // ── Reusable vector ───────────────────────────────────────────────────────
  const _p = new THREE.Vector3();

  // ── Wave pulse brightness ─────────────────────────────────────────────────
  const FIRST_WAVE = BUILD_START + 0.3;
  const MAX_WAVE_AGE = MAX_RADIUS / WAVE_SPEED * 1.5;

  function getWaveBright(elapsed, dist) {
    if (elapsed < FIRST_WAVE) return 0;

    if (elapsed >= GRID_FADE_END) return 0;

    const buildP = elapsed < BUILD_START ? 0
      : elapsed < BUILD_END ? (elapsed - BUILD_START) / (BUILD_END - BUILD_START)
      : 1;

    let peak = 0;
    const startT = Math.max(FIRST_WAVE, elapsed - MAX_WAVE_AGE);
    const firstIdx = Math.ceil((startT - FIRST_WAVE) / WAVE_INTERVAL);
    const lastIdx  = Math.floor((elapsed - FIRST_WAVE) / WAVE_INTERVAL);

    for (let wi = firstIdx; wi <= lastIdx; wi++) {
      const waveT = FIRST_WAVE + wi * WAVE_INTERVAL;
      const age   = elapsed - waveT;
      if (age < 0) continue;

      const waveSlowdown = 1 - buildP * buildP * 0.8;
      const radius   = age * WAVE_SPEED * waveSlowdown;
      const waveFade = Math.max(0, 1 - radius / (MAX_RADIUS * 1.2));
      const d        = Math.abs(dist - radius);

      if (d < WAVE_WIDTH) {
        const ring = (1 - d / WAVE_WIDTH) * waveFade;
        peak = Math.max(peak, ring);
      }
    }

    const buildDim = 1 - buildP * buildP * 0.4;
    return peak * WAVE_INTENSITY * buildDim;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  function update(elapsed, dt) {
    // Past grid end — hide everything instantly
    if (elapsed >= GRID_FADE_END) {
      vertexPoints.visible = false;
      edgeLines.visible    = false;
      return;
    }

    let anyVisible = false;

    // ── Update vertices ─────────────────────────────────────────────────
    for (const v of verts) {
      const i3 = v.idx * 3;

      const revealAge = elapsed - v.revealT;
      if (revealAge < 0) {
        vColArr[i3] = vColArr[i3 + 1] = vColArr[i3 + 2] = 0;
        vPosArr[i3] = v.worldPos.x; vPosArr[i3 + 1] = v.worldPos.y; vPosArr[i3 + 2] = v.worldPos.z;
        continue;
      }

      const fadeIn = Math.min(revealAge / 0.3, 1);

      // Base brightness with breathing (consistent with globe nodes)
      const siteBreath = (1 - Math.cos(elapsed * 1.2 + v.pulsePhase)) * 0.5;
      const sitePulse = 0.85 + 0.30 * siteBreath;
      const baseBright = 0.40 * sitePulse;

      // Wave brightness
      const waveBright = getWaveBright(elapsed, v.dist) * 0.5;

      let bright = (baseBright + waveBright) * fadeIn * v.radialFade;

      // Gentle vibration at grid sites (tiny position wobble)
      const vibeX = Math.sin(elapsed * 1.8 + v.pulsePhase) * 0.00003 * v.radialFade;
      const vibeY = Math.cos(elapsed * 1.5 + v.pulsePhase * 1.3) * 0.00003 * v.radialFade;

      // ── Progressive strain — grid dims slightly as it extends ────
      if (elapsed >= BUILD_START && elapsed < BUILD_END) {
        const bP = (elapsed - BUILD_START) / (BUILD_END - BUILD_START);
        bright *= 1 - bP * bP * 0.2;  // only 20% dim at full extent
      }

      // ── Fade out during zoom-out to 3 nodes ─────────────────────
      if (elapsed >= GRID_FADE_START) {
        const fadeP = (elapsed - GRID_FADE_START) / (GRID_FADE_END - GRID_FADE_START);
        bright *= 1 - Math.min(fadeP, 1);
      }

      if (bright < 0.001) {
        vColArr[i3] = vColArr[i3 + 1] = vColArr[i3 + 2] = 0;
        vPosArr[i3] = v.worldPos.x; vPosArr[i3 + 1] = v.worldPos.y; vPosArr[i3 + 2] = v.worldPos.z;
        continue;
      }

      anyVisible = true;

      vColArr[i3]     = VERT_COLOR.r * bright;
      vColArr[i3 + 1] = VERT_COLOR.g * bright;
      vColArr[i3 + 2] = VERT_COLOR.b * bright;

      // Apply vibration to position
      if (vibeX !== 0 || vibeY !== 0) {
        _p.copy(v.worldPos)
          .addScaledVector(tangent, vibeX)
          .addScaledVector(bitangent, vibeY);
        vPosArr[i3] = _p.x; vPosArr[i3 + 1] = _p.y; vPosArr[i3 + 2] = _p.z;
      } else {
        vPosArr[i3] = v.worldPos.x; vPosArr[i3 + 1] = v.worldPos.y; vPosArr[i3 + 2] = v.worldPos.z;
      }
    }

    vGeo.attributes.position.needsUpdate = true;
    vGeo.attributes.color.needsUpdate    = true;

    // ── Update edges ────────────────────────────────────────────────────
    for (let ei = 0; ei < nEdges; ei++) {
      const edge = edges[ei];
      const e0   = ei * 6;
      const e1   = e0 + 3;
      const aI3  = edge.a * 3;
      const bI3  = edge.b * 3;

      const revealAge = elapsed - edge.revealT;
      if (revealAge < 0) {
        for (let k = 0; k < 6; k++) eColArr[e0 + k] = 0;
        ePosArr[e0] = ePosArr[e1] = vPosArr[aI3];
        ePosArr[e0 + 1] = ePosArr[e1 + 1] = vPosArr[aI3 + 1];
        ePosArr[e0 + 2] = ePosArr[e1 + 2] = vPosArr[aI3 + 2];
        continue;
      }

      const drawT = Math.min(revealAge / 0.6, 1);  // slower edge draw-in
      const drawE = easeOutCubic(drawT);

      const baseBright = 0.25;
      const waveBright = getWaveBright(elapsed, edge.dist) * 0.4;
      let bright = (baseBright + waveBright) * drawE * edge.radialFade;

      if (elapsed >= BUILD_START && elapsed < BUILD_END) {
        const bP = (elapsed - BUILD_START) / (BUILD_END - BUILD_START);
        bright *= 1 - bP * bP * 0.2;
      }

      // Fade out during zoom-out
      if (elapsed >= GRID_FADE_START) {
        const fadeP = (elapsed - GRID_FADE_START) / (GRID_FADE_END - GRID_FADE_START);
        bright *= 1 - Math.min(fadeP, 1);
      }

      if (bright < 0.001) {
        for (let k = 0; k < 6; k++) eColArr[e0 + k] = 0;
        continue;
      }

      anyVisible = true;

      const ax = vPosArr[aI3], ay = vPosArr[aI3 + 1], az = vPosArr[aI3 + 2];
      const bx = vPosArr[bI3], by = vPosArr[bI3 + 1], bz = vPosArr[bI3 + 2];

      ePosArr[e0]     = ax; ePosArr[e0 + 1] = ay; ePosArr[e0 + 2] = az;
      if (drawT < 1) {
        ePosArr[e1]     = ax + (bx - ax) * drawE;
        ePosArr[e1 + 1] = ay + (by - ay) * drawE;
        ePosArr[e1 + 2] = az + (bz - az) * drawE;
      } else {
        ePosArr[e1] = bx; ePosArr[e1 + 1] = by; ePosArr[e1 + 2] = bz;
      }

      const cr = GRID_COLOR.r * bright;
      const cg = GRID_COLOR.g * bright;
      const cb = GRID_COLOR.b * bright;
      eColArr[e0] = cr; eColArr[e0 + 1] = cg; eColArr[e0 + 2] = cb;
      eColArr[e1] = cr; eColArr[e1 + 1] = cg; eColArr[e1 + 2] = cb;
    }

    eGeo.attributes.position.needsUpdate = true;
    eGeo.attributes.color.needsUpdate    = true;

    // ── Update data dots ────────────────────────────────────────────────
    for (let di = 0; di < DOT_COUNT; di++) {
      const dot  = dotInfos[di];
      const edge = edges[dot.edgeIdx];
      const d3   = di * 3;
      const aI3  = edge.a * 3;
      const bI3  = edge.b * 3;

      const revealAge = elapsed - edge.revealT;
      if (revealAge < 0.4) {
        dColArr[d3] = dColArr[d3 + 1] = dColArr[d3 + 2] = 0;
        dPosArr[d3] = vPosArr[aI3]; dPosArr[d3 + 1] = vPosArr[aI3 + 1]; dPosArr[d3 + 2] = vPosArr[aI3 + 2];
        continue;
      }

      let slowdown = 1;

      if (elapsed >= BUILD_START && elapsed < BUILD_END) {
        const bP = (elapsed - BUILD_START) / (BUILD_END - BUILD_START);
        slowdown = Math.max(0, 1 - bP * bP * bP);
      } else if (elapsed >= BUILD_END) {
        slowdown = 0;
      }

      // Dots disabled but keeping loop structure
      let dotFade = 1;

      dot.pos += dot.speed * slowdown * dt;
      if (dot.pos > 1) dot.pos -= 1;

      const t = dot.pos;

      const ax = vPosArr[aI3], ay = vPosArr[aI3 + 1], az = vPosArr[aI3 + 2];
      const bx = vPosArr[bI3], by = vPosArr[bI3 + 1], bz = vPosArr[bI3 + 2];

      dPosArr[d3]     = ax + (bx - ax) * t;
      dPosArr[d3 + 1] = ay + (by - ay) * t;
      dPosArr[d3 + 2] = az + (bz - az) * t;

      const dotBright = 0.8 * edge.radialFade * dotFade;
      dColArr[d3]     = DOT_COLOR.r * dotBright;
      dColArr[d3 + 1] = DOT_COLOR.g * dotBright;
      dColArr[d3 + 2] = DOT_COLOR.b * dotBright;
    }

    dGeo.attributes.position.needsUpdate = true;
    dGeo.attributes.color.needsUpdate    = true;

    // ── Visibility ──────────────────────────────────────────────────────
    const show = (anyVisible || (elapsed >= BUILD_START && elapsed < GRID_FADE_END));
    vertexPoints.visible = show;
    edgeLines.visible    = show;
    // dotMesh stays hidden — no moving dots on grid
  }

  return { group, verts, edges, update };
}
