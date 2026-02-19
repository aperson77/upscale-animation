/**
 * particles.js — Beat 1 close-up animation.
 *
 * A single node attempts a complex computation and fails.
 *
 * 0–0.5s:     Quiet hero node, subtle pulse.
 * 0.5–3.5s:   A compact hexagonal grid/mesh GROWS outward from the node
 *             (2–3 node-widths radius). Concentric WAVE PULSES ripple
 *             outward from the node every ~0.55s, lighting up grid lines
 *             and intersection points as they pass. Data dots flow along
 *             edges. Grid is dense near the node, fading at the perimeter.
 * 3.5–4.5s:   GLITCH FAILURE — digital corruption from outer edges inward.
 *             Waves stutter and fragment. Grid sections blink, jitter, die.
 * 4.5–5.0s:   Other Waterloo nodes + hub fade in.
 */

import * as THREE from 'three';

// ─── Colors ─────────────────────────────────────────────────────────────────
const NODE_COLOR = 0x8cb4e0;
const GRID_COLOR = new THREE.Color(0.4, 0.6, 1.0);    // blue-white grid lines
const VERT_COLOR = new THREE.Color(0.55, 0.75, 1.0);  // brighter intersections
const DOT_COLOR  = new THREE.Color(0.85, 0.93, 1.0);  // bright data pulses

// ─── Timing ─────────────────────────────────────────────────────────────────
const BUILD_START    = 0.5;
const BUILD_END      = 7.0;   // lattice extends over this period
const COLLAPSE_START = 7.0;   // lattice fully built → glitch
const COLLAPSE_END   = 9.0;   // 2s glitch — dramatic failure
const OTHERS_REVEAL  = 9.0;

// ─── Grid config ────────────────────────────────────────────────────────────
// Tight grid for close-up framing (FOV 24°)
const HEX_RINGS    = 4;
const HEX_SPACING  = 0.0016;
const MAX_RADIUS   = HEX_RINGS * HEX_SPACING;  // 0.0052
const FADE_START   = MAX_RADIUS * 0.5;          // radial fade begins at 50%

const VERT_SIZE = 0.0019;
const DOT_SIZE  = 0.0020;
const DOT_COUNT = 20;

// ─── Wave pulse config ──────────────────────────────────────────────────────
const WAVE_INTERVAL  = 0.55;   // new wave every 0.55s — brisk at start
const WAVE_SPEED     = 0.014;  // radial expansion (units/sec) — faster initially
const WAVE_WIDTH     = 0.003;  // ring thickness — wider, softer
const WAVE_INTENSITY = 1.0;    // peak brightness — subtle glow, not flash

// ─── Seeded PRNG ────────────────────────────────────────────────────────────
function createRNG(seed) {
  return function () {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// ─── Fast integer hash (glitch randomness) ──────────────────────────────────
function hash(n) {
  n = ((n >> 16) ^ n) * 0x45d9f3b | 0;
  n = ((n >> 16) ^ n) * 0x45d9f3b | 0;
  return ((n >> 16) ^ n) & 0x7fffffff;
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
function hexDist(q, r) { return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); }

// ─── createAct1Animations ───────────────────────────────────────────────────
export function createAct1Animations(globeGroup, heroNode, clusters) {
  const rand  = createRNG(42);
  const group = new THREE.Group();
  globeGroup.add(group);

  // All Waterloo nodes are always visible — during the single-node close-up
  // the other nodes are simply out of frame due to camera framing.

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

  // ── Generate hex grid vertices ──────────────────────────────────────────
  const verts   = [];
  const vertMap = new Map();

  for (let q = -HEX_RINGS; q <= HEX_RINGS; q++) {
    for (let r = -HEX_RINGS; r <= HEX_RINGS; r++) {
      const ring = hexDist(q, r);
      if (ring > HEX_RINGS) continue;

      const x    = HEX_SPACING * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
      const y    = HEX_SPACING * (1.5 * r);
      const dist = Math.sqrt(x * x + y * y);
      const h    = 0.004 + ring * 0.0003;

      // Radial fade: bright at center, fading at perimeter
      const radialFade = dist <= FADE_START
        ? 1
        : Math.max(0, 1 - (dist - FADE_START) / (MAX_RADIUS - FADE_START));

      // Reveal time: inner rings first
      const revealT = BUILD_START + (ring / HEX_RINGS) * (BUILD_END - BUILD_START - 0.8);

      const idx = verts.length;
      vertMap.set(`${q},${r}`, idx);
      verts.push({
        idx, q, r, ring, dist,
        baseX: x, baseY: y, h,
        worldPos: toWorld(x, y, h),
        revealT, radialFade,
      });
    }
  }

  // ── Generate edges ──────────────────────────────────────────────────────
  const ADJ   = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const edges = [];

  for (const v of verts) {
    for (const [dq, dr] of ADJ) {
      const nIdx = vertMap.get(`${v.q + dq},${v.r + dr}`);
      if (nIdx === undefined || v.idx >= nIdx) continue;

      const nv       = verts[nIdx];
      const edgeRing = Math.max(v.ring, nv.ring);
      const edgeDist = (v.dist + nv.dist) / 2; // midpoint distance for waves
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
      speed:   0.65 + rand() * 0.55,
      pos:     rand(),   // accumulated position 0→1, updated with dt
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
  group.add(dotMesh);

  // ── Reusable vector ───────────────────────────────────────────────────────
  const _p = new THREE.Vector3();

  // ── Wave pulse brightness ─────────────────────────────────────────────────
  // Returns extra brightness from wave pulses at a given radial distance.
  const FIRST_WAVE = BUILD_START + 0.3;
  const MAX_WAVE_AGE = MAX_RADIUS / WAVE_SPEED * 1.5; // time for wave to exit grid

  function getWaveBright(elapsed, dist, baseX, baseY) {
    if (elapsed < FIRST_WAVE) return 0;

    const collapseP = elapsed >= COLLAPSE_START
      ? (elapsed - COLLAPSE_START) / (COLLAPSE_END - COLLAPSE_START)
      : 0;

    // Build progress: as lattice extends, everything slows
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

      // During collapse: waves skip and fragment
      if (collapseP > 0) {
        const h1 = hash(wi * 777);
        if (h1 % 3 === 0) continue;

        const angle  = Math.atan2(baseY, baseX);
        const sector = hash(wi * 333 + Math.floor((angle + Math.PI) * 3));
        if (sector % 5 < collapseP * 5) continue;
      }

      // Waves slow as lattice extends — speed drops to 20% at full build
      const waveSlowdown = 1 - buildP * buildP * 0.8;
      const radius   = age * WAVE_SPEED * waveSlowdown;
      const waveFade = Math.max(0, 1 - radius / (MAX_RADIUS * 1.2));
      const d        = Math.abs(dist - radius);

      if (d < WAVE_WIDTH) {
        const ring = (1 - d / WAVE_WIDTH) * waveFade;
        peak = Math.max(peak, ring);
      }
    }

    // Waves dim as lattice grows, further during collapse
    const buildDim = 1 - buildP * buildP * 0.4;
    return peak * WAVE_INTENSITY * buildDim * (1 - collapseP * 0.7);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  function update(elapsed, dt) {

    const glitchFrame = Math.floor(elapsed * 30);  // 30fps — digital choppy
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

      // Base brightness: steady during build, no pulsing
      const baseBright = 0.30;

      // Wave brightness — gentle glow, not blinking
      const waveBright = getWaveBright(elapsed, v.dist, v.baseX, v.baseY) * 0.5;

      let bright = (baseBright + waveBright) * fadeIn * v.radialFade;
      let jitterX = 0, jitterY = 0;
      let dead = false;

      // ── Progressive strain — grid dims more as it extends ─────────
      if (elapsed >= BUILD_START && elapsed < COLLAPSE_START) {
        const bP = (elapsed - BUILD_START) / (BUILD_END - BUILD_START);
        // Quadratic curve: subtle at first, obvious by the end
        bright *= 1 - bP * bP * 0.4;
      }

      // ── Glitch during collapse ──────────────────────────────────────
      if (elapsed >= COLLAPSE_START) {
        const cP    = (elapsed - COLLAPSE_START) / (COLLAPSE_END - COLLAPSE_START);
        // Outer rings die first, inner rings last
        const delay = (HEX_RINGS - v.ring) / HEX_RINGS * 0.4;
        const gT    = Math.max(0, (cP - delay) / (1 - delay));

        if (gT >= 0.85) {
          dead = true;
        } else if (gT > 0) {
          // Per-vertex sporadic digital glitch
          const h1 = hash(v.idx * 1000 + glitchFrame);
          const h2 = hash(v.idx * 2000 + glitchFrame);

          // Blink off — increasing probability as collapse progresses
          const blinkChance = gT * 8;
          if ((h1 % 10) < blinkChance) {
            bright = 0;
          } else {
            bright *= (1 - gT * 0.6);
          }

          // Jitter — vertices scatter outward
          jitterX = ((h1 % 200) / 200 - 0.5) * gT * 0.003;
          jitterY = ((h2 % 200) / 200 - 0.5) * gT * 0.003;

          // White flash — rare bright spike
          const flashH = hash(v.idx * 5000 + Math.floor(elapsed * 15));
          if ((flashH % 5) === 0 && gT > 0.3 && bright > 0) {
            bright = 2.0;
          }
        }
      }

      if (dead) {
        vColArr[i3] = vColArr[i3 + 1] = vColArr[i3 + 2] = 0;
        vPosArr[i3] = v.worldPos.x; vPosArr[i3 + 1] = v.worldPos.y; vPosArr[i3 + 2] = v.worldPos.z;
        continue;
      }

      anyVisible = true;

      vColArr[i3]     = VERT_COLOR.r * bright;
      vColArr[i3 + 1] = VERT_COLOR.g * bright;
      vColArr[i3 + 2] = VERT_COLOR.b * bright;

      if (jitterX !== 0 || jitterY !== 0) {
        _p.copy(v.worldPos)
          .addScaledVector(tangent, jitterX)
          .addScaledVector(bitangent, jitterY);
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

      // Edge draws outward from inner vertex
      const drawT = Math.min(revealAge / 0.35, 1);
      const drawE = easeOutCubic(drawT);

      // Base + wave brightness — steady, no flickering
      const baseBright = 0.25;
      const waveBright = getWaveBright(elapsed, edge.dist, 0, 0) * 0.4;
      let bright = (baseBright + waveBright) * drawE * edge.radialFade;
      let dead = false;

      // ── Progressive strain — edges dim as grid extends ────────────
      if (elapsed >= BUILD_START && elapsed < COLLAPSE_START) {
        const bP = (elapsed - BUILD_START) / (BUILD_END - BUILD_START);
        bright *= 1 - bP * bP * 0.4;
      }

      // ── Glitch ──────────────────────────────────────────────────────
      if (elapsed >= COLLAPSE_START) {
        const cP    = (elapsed - COLLAPSE_START) / (COLLAPSE_END - COLLAPSE_START);
        const delay = (HEX_RINGS - edge.ring) / HEX_RINGS * 0.35;
        const gT    = Math.max(0, (cP - delay) / (1 - delay));

        if (gT >= 0.85) {
          dead = true;
        } else if (gT > 0) {
          const h1 = hash(ei * 3000 + glitchFrame);
          if ((h1 % 10) < gT * 8) {
            bright = 0;
          } else {
            bright *= (1 - gT * 0.6);
          }
        }
      }

      if (dead) {
        for (let k = 0; k < 6; k++) eColArr[e0 + k] = 0;
        continue;
      }

      if (bright > 0.001) anyVisible = true;

      // Positions
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

      let dotAlive = true;
      let slowdown = 1;

      // Dots progressively slow as lattice extends — stopped by BUILD_END
      if (elapsed >= BUILD_START && elapsed < BUILD_END) {
        const bP = (elapsed - BUILD_START) / (BUILD_END - BUILD_START);
        // Cubic: fast at first, obviously slowing in second half, stopped at end
        slowdown = Math.max(0, 1 - bP * bP * bP);
      } else if (elapsed >= BUILD_END) {
        slowdown = 0; // fully stopped
      }

      if (elapsed >= COLLAPSE_START) {
        const cP    = (elapsed - COLLAPSE_START) / (COLLAPSE_END - COLLAPSE_START);
        const delay = (HEX_RINGS - edge.ring) / HEX_RINGS * 0.35;
        const gT    = Math.max(0, (cP - delay) / (1 - delay));
        if (gT >= 0.65) dotAlive = false;
      }

      if (!dotAlive) {
        dColArr[d3] = dColArr[d3 + 1] = dColArr[d3 + 2] = 0;
        continue;
      }

      // Accumulate position with dt — no jumps, smooth slowdown
      dot.pos += dot.speed * slowdown * dt;
      if (dot.pos > 1) dot.pos -= 1; // wrap smoothly

      const t = dot.pos;

      const ax = vPosArr[aI3], ay = vPosArr[aI3 + 1], az = vPosArr[aI3 + 2];
      const bx = vPosArr[bI3], by = vPosArr[bI3 + 1], bz = vPosArr[bI3 + 2];

      dPosArr[d3]     = ax + (bx - ax) * t;
      dPosArr[d3 + 1] = ay + (by - ay) * t;
      dPosArr[d3 + 2] = az + (bz - az) * t;

      const dotBright = 0.8 * edge.radialFade;
      dColArr[d3]     = DOT_COLOR.r * dotBright;
      dColArr[d3 + 1] = DOT_COLOR.g * dotBright;
      dColArr[d3 + 2] = DOT_COLOR.b * dotBright;
    }

    dGeo.attributes.position.needsUpdate = true;
    dGeo.attributes.color.needsUpdate    = true;

    // ── Visibility ──────────────────────────────────────────────────────
    const show = anyVisible || elapsed < COLLAPSE_END;
    vertexPoints.visible = show;
    edgeLines.visible    = show;
    dotMesh.visible      = show;

    // ── Hero node dims during collapse ──────────────────────────────────
    if (elapsed >= COLLAPSE_START && elapsed < COLLAPSE_END) {
      const dimT = (elapsed - COLLAPSE_START) / (COLLAPSE_END - COLLAPSE_START);
      // Dims to ~0.6 as grid fails, then recovers in last 30%
      if (dimT < 0.7) {
        heroNode.mat.color.setHex(NODE_COLOR).multiplyScalar(1.0 - dimT * 0.6);
      } else {
        const rT = (dimT - 0.7) / 0.3;
        heroNode.mat.color.setHex(NODE_COLOR).multiplyScalar(0.58 + rT * 0.42);
      }
    }

    // ── After collapse: resting state ───────────────────────────────────
    if (elapsed >= COLLAPSE_END && elapsed < OTHERS_REVEAL + 0.5) {
      heroNode.mat.color.setHex(NODE_COLOR);
      heroNode.mesh.scale.setScalar(1);
    }
  }

  return { group, verts, edges, update };
}
