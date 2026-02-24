/**
 * grid-bursts.js — Network-scale quantum lattice grid flashes.
 *
 * At each network milestone, a gold grid pattern pulses outward across
 * the connected network. The grid spans the city bounding box with
 * tight spacing (many small squares) and large, prominent gold circles
 * at each intersection — clearly visible at the zoomed-out camera distance.
 *
 * Bursts:
 *   27.0s  3-city (Waterloo/Ottawa/Montréal)
 *   37.5s  Coast-to-coast (NF + Calgary + Vancouver join)
 *   55.0s  All Canada
 */

import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';

// ─── Colors (bright gold — must stand out against dark globe) ───────────────
const GRID_COLOR = new THREE.Color(1.00, 0.80, 0.20);  // bright gold grid lines
const VERT_COLOR = new THREE.Color(1.00, 0.95, 0.50);  // very bright gold circles

// ─── Wave pulse config ──────────────────────────────────────────────────────
const WAVE_INTERVAL = 0.85;
const WAVE_WIDTH    = 0.30;   // fraction of max radius (wider = more visible)

// ─── Round point texture (soft circle with glow halo) ───────────────────────
function createCircleTexture() {
  const size = 128;  // higher res for larger circles
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0,    'rgba(255,255,255,1)');
  grad.addColorStop(0.3,  'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6,  'rgba(255,255,255,0.4)');
  grad.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const circleTex = createCircleTexture();

// ─── Reference dimensions ───────────────────────────────────────────────────
const BASE_SPACING   = 0.0014;  // same as particles.js GRID_SPACING

// ─── Burst definitions ──────────────────────────────────────────────────────
const BURST_DEFS = [
  {
    t: 27.0, dur: 3.0,
    cities: ['Waterloo', 'Ottawa', 'Montréal'],
    height: 0.005,
    viewDist: 2.7,
  },
  {
    t: 37.5, dur: 3.0,
    cities: ['Waterloo', 'Ottawa', 'Montréal', "St. John's", 'Calgary', 'Vancouver'],
    height: 0.008,
    viewDist: 4.0,
    targetCells: 65,   // smaller squares for coast-to-coast view
    flat: true,        // camera-aligned grid orientation
  },
  {
    t: 49.0, dur: 3.5,
    allCanada: true,
    height: 0.012,
    viewDist: 4.5,
    targetCells: 35,   // smaller squares for full Canada view
  },
];

// ─── Canadian city names ────────────────────────────────────────────────────
const CANADA_CITIES = [
  'Waterloo', 'Ottawa', 'Montréal', "St. John's", 'Calgary', 'Vancouver',
  'Iqaluit', 'Yellowknife', 'Inuvik', 'Tuktoyaktuk', 'Alert',
  'Cambridge Bay', 'Churchill', 'Whitehorse',
];

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// ─── Single grid burst ─────────────────────────────────────────────────────
class GridBurst {
  constructor(globeGroup, center, halfW, halfH, spacing, pointSize, height, flat = false, camera = null) {
    this.group = new THREE.Group();
    globeGroup.add(this.group);

    this.spacing = spacing;

    // Tangent frame at the centroid on the sphere
    const normal = center.clone().normalize();
    let tangent, bitangent;

    if (flat && camera) {
      // Align grid with screen axes: project camera right/up onto the tangent plane
      // so grid lines appear perfectly horizontal/vertical on screen
      camera.updateMatrixWorld();
      const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const camUp    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      // Project onto tangent plane (remove component along surface normal)
      tangent   = camRight.clone().addScaledVector(normal, -camRight.dot(normal)).normalize();
      bitangent = camUp.clone().addScaledVector(normal, -camUp.dot(normal)).normalize();
    } else {
      tangent = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), normal);
      if (tangent.length() < 0.01) {
        tangent.crossVectors(new THREE.Vector3(1, 0, 0), normal);
      }
      tangent.normalize();
      bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    }

    const surfaceR = GLOBE_RADIUS + 0.03 + height;

    // Always project onto sphere surface (follows globe curvature).
    // When camera-aligned, tangent/bitangent come from camera axes
    // so the grid orientation matches the screen while curving with the globe.
    function toWorld(x, y) {
      const p = center.clone()
        .addScaledVector(tangent, x)
        .addScaledVector(bitangent, y);
      return p.normalize().multiplyScalar(surfaceR);
    }

    // ── Generate rectangular grid vertices ────────────────────────────────
    this.verts = [];
    const vertMap = new Map();
    const maxHalf = Math.max(halfW, halfH);
    this.maxRadius = maxHalf * spacing;
    const gaussSigma = this.maxRadius * 0.65;  // wider sigma = less edge fade

    for (let row = -halfH; row <= halfH; row++) {
      for (let col = -halfW; col <= halfW; col++) {
        const x = col * spacing;
        const y = row * spacing;
        const dist = Math.sqrt(x * x + y * y);
        const ringW = Math.abs(col) / Math.max(halfW, 1);
        const ringH = Math.abs(row) / Math.max(halfH, 1);
        const ringFrac = Math.max(ringW, ringH);
        const radialFade = Math.exp(-(dist * dist) / (2 * gaussSigma * gaussSigma));
        const pulsePhase = (col * 2.7 + row * 3.1) % (Math.PI * 2);

        const idx = this.verts.length;
        vertMap.set(`${col},${row}`, idx);
        this.verts.push({
          idx, col, row, dist,
          worldPos: toWorld(x, y),
          ringFrac, radialFade, pulsePhase,
        });
      }
    }

    // ── Generate edges (right + down neighbors) ──────────────────────────
    this.edges = [];
    const ADJ = [[1, 0], [0, 1]];
    for (const v of this.verts) {
      for (const [dc, dr] of ADJ) {
        const nIdx = vertMap.get(`${v.col + dc},${v.row + dr}`);
        if (nIdx === undefined) continue;
        const nv = this.verts[nIdx];
        const edgeDist = (v.dist + nv.dist) / 2;
        const radialFade = Math.min(v.radialFade, nv.radialFade);
        const ringFrac = Math.max(v.ringFrac, nv.ringFrac);
        this.edges.push({
          a: v.idx, b: nIdx, dist: edgeDist,
          ringFrac, radialFade,
        });
      }
    }

    // ── Vertex Points (large gold circles) ──────────────────────────────
    const nV = this.verts.length;
    this.vPosArr = new Float32Array(nV * 3);
    this.vColArr = new Float32Array(nV * 3);
    const vGeo = new THREE.BufferGeometry();
    vGeo.setAttribute('position', new THREE.BufferAttribute(this.vPosArr, 3));
    vGeo.setAttribute('color', new THREE.BufferAttribute(this.vColArr, 3));

    this.vertMesh = new THREE.Points(vGeo, new THREE.PointsMaterial({
      size: pointSize, map: circleTex, transparent: true,
      blending: THREE.AdditiveBlending, sizeAttenuation: false,
      depthWrite: false, vertexColors: true,
    }));
    this.group.add(this.vertMesh);

    for (const v of this.verts) {
      const i3 = v.idx * 3;
      this.vPosArr[i3] = v.worldPos.x;
      this.vPosArr[i3 + 1] = v.worldPos.y;
      this.vPosArr[i3 + 2] = v.worldPos.z;
    }

    // ── Edge LineSegments ──────────────────────────────────────────────────
    const nE = this.edges.length;
    this.ePosArr = new Float32Array(nE * 6);
    this.eColArr = new Float32Array(nE * 6);
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(this.ePosArr, 3));
    eGeo.setAttribute('color', new THREE.BufferAttribute(this.eColArr, 3));

    this.edgeMesh = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.group.add(this.edgeMesh);

    this.vGeo = vGeo;
    this.eGeo = eGeo;
  }

  update(age, dur) {
    if (age < 0 || age > dur) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;

    // Build phase: grid grows outward ring by ring (first 30%)
    const buildPhase = Math.min(age / (dur * 0.30), 1);
    // Fade phase: grid dims out in final 25%
    const fadePhase = age > dur * 0.75 ? (age - dur * 0.75) / (dur * 0.25) : 0;
    const masterFade = 1 - Math.min(fadePhase, 1);
    const maxR = this.maxRadius;

    // ── Update vertices ────────────────────────────────────────────────
    for (const v of this.verts) {
      const i3 = v.idx * 3;

      const revealAge = buildPhase - v.ringFrac;
      if (revealAge < 0) {
        this.vColArr[i3] = this.vColArr[i3 + 1] = this.vColArr[i3 + 2] = 0;
        continue;
      }
      const fadeIn = Math.min(revealAge / 0.2, 1);

      const breath = (1 - Math.cos(age * 1.2 + v.pulsePhase)) * 0.5;
      const sitePulse = 0.85 + 0.30 * breath;
      const baseBright = 0.90 * sitePulse;  // very bright

      // Wave pulses
      let waveBright = 0;
      const nWaves = Math.floor(age / WAVE_INTERVAL);
      for (let wi = Math.max(0, nWaves - 3); wi <= nWaves; wi++) {
        const wAge = age - wi * WAVE_INTERVAL;
        if (wAge < 0) continue;
        const waveSpeed = this.spacing * 12;
        const wr = wAge * waveSpeed;
        const wFade = Math.max(0, 1 - wr / (maxR * 1.2));
        const d = Math.abs(v.dist - wr);
        const ringWidth = maxR * WAVE_WIDTH;
        if (d < ringWidth) {
          waveBright = Math.max(waveBright, (1 - d / ringWidth) * wFade * 0.8);
        }
      }

      let bright = (baseBright + waveBright) * fadeIn * v.radialFade * masterFade;
      if (bright < 0.001) {
        this.vColArr[i3] = this.vColArr[i3 + 1] = this.vColArr[i3 + 2] = 0;
        continue;
      }

      this.vColArr[i3]     = VERT_COLOR.r * bright;
      this.vColArr[i3 + 1] = VERT_COLOR.g * bright;
      this.vColArr[i3 + 2] = VERT_COLOR.b * bright;
    }
    this.vGeo.attributes.color.needsUpdate = true;

    // ── Update edges ──────────────────────────────────────────────────
    for (let ei = 0; ei < this.edges.length; ei++) {
      const edge = this.edges[ei];
      const e0 = ei * 6;
      const aI3 = edge.a * 3;
      const bI3 = edge.b * 3;

      const revealAge = buildPhase - edge.ringFrac;
      if (revealAge < 0) {
        for (let k = 0; k < 6; k++) this.eColArr[e0 + k] = 0;
        this.ePosArr[e0] = this.ePosArr[e0 + 3] = this.vPosArr[aI3];
        this.ePosArr[e0 + 1] = this.ePosArr[e0 + 4] = this.vPosArr[aI3 + 1];
        this.ePosArr[e0 + 2] = this.ePosArr[e0 + 5] = this.vPosArr[aI3 + 2];
        continue;
      }

      const drawT = Math.min(revealAge / 0.25, 1);
      const drawE = easeOutCubic(drawT);
      const baseBright = 0.50;  // brighter edges

      let waveBright = 0;
      const nWaves = Math.floor(age / WAVE_INTERVAL);
      for (let wi = Math.max(0, nWaves - 3); wi <= nWaves; wi++) {
        const wAge = age - wi * WAVE_INTERVAL;
        if (wAge < 0) continue;
        const waveSpeed = this.spacing * 12;
        const wr = wAge * waveSpeed;
        const wFade = Math.max(0, 1 - wr / (maxR * 1.2));
        const d = Math.abs(edge.dist - wr);
        const ringWidth = maxR * WAVE_WIDTH;
        if (d < ringWidth) {
          waveBright = Math.max(waveBright, (1 - d / ringWidth) * wFade * 0.5);
        }
      }

      let bright = (baseBright + waveBright) * drawE * edge.radialFade * masterFade;
      if (bright < 0.001) {
        for (let k = 0; k < 6; k++) this.eColArr[e0 + k] = 0;
        continue;
      }

      const ax = this.vPosArr[aI3], ay = this.vPosArr[aI3 + 1], az = this.vPosArr[aI3 + 2];
      const bx = this.vPosArr[bI3], by = this.vPosArr[bI3 + 1], bz = this.vPosArr[bI3 + 2];

      this.ePosArr[e0]     = ax; this.ePosArr[e0 + 1] = ay; this.ePosArr[e0 + 2] = az;
      if (drawE < 1) {
        this.ePosArr[e0 + 3] = ax + (bx - ax) * drawE;
        this.ePosArr[e0 + 4] = ay + (by - ay) * drawE;
        this.ePosArr[e0 + 5] = az + (bz - az) * drawE;
      } else {
        this.ePosArr[e0 + 3] = bx; this.ePosArr[e0 + 4] = by; this.ePosArr[e0 + 5] = bz;
      }

      const cr = GRID_COLOR.r * bright, cg = GRID_COLOR.g * bright, cb = GRID_COLOR.b * bright;
      this.eColArr[e0] = cr; this.eColArr[e0 + 1] = cg; this.eColArr[e0 + 2] = cb;
      this.eColArr[e0 + 3] = cr; this.eColArr[e0 + 4] = cg; this.eColArr[e0 + 5] = cb;
    }
    this.eGeo.attributes.position.needsUpdate = true;
    this.eGeo.attributes.color.needsUpdate = true;
  }
}

// ─── createGridBursts ───────────────────────────────────────────────────────
export function createGridBursts(globeGroup, clusters, camera) {
  const clusterMap = {};
  for (const c of clusters) clusterMap[c.name] = c;

  // Per-burst lazy init: each burst inits right before it fires so the camera
  // is at the correct position for screen-aligned flat grids.
  const burstSlots = BURST_DEFS.map(def => ({ def, burst: null, t: def.t, dur: def.dur }));

  function initBurst(slot) {
    const def = slot.def;
    const cityNames = def.allCanada ? CANADA_CITIES : def.cities;

    // Get hub positions in globeGroup local space
    const positions = [];
    for (const name of cityNames) {
      const c = clusterMap[name];
      if (c && c.hub) positions.push(c.hub.position.clone());
    }
    if (positions.length === 0) return;

    // Centroid
    const centroid = new THREE.Vector3();
    for (const p of positions) centroid.add(p);
    centroid.divideScalar(positions.length);

    // Build tangent frame at centroid to compute bounding box in local 2D
    const normal = centroid.clone().normalize();
    const tangent = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), normal);
    if (tangent.length() < 0.01) {
      tangent.crossVectors(new THREE.Vector3(1, 0, 0), normal);
    }
    tangent.normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    // Project positions into 2D tangent space to find bounding rectangle
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    for (const p of positions) {
      const diff = p.clone().sub(centroid);
      const u = diff.dot(tangent);
      const v = diff.dot(bitangent);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }

    // Add padding (40% beyond bounding box)
    const spanU = (maxU - minU) * 1.4 || 0.02;
    const spanV = (maxV - minV) * 1.4 || 0.02;

    // More cells = smaller squares. Per-burst target or default 40.
    const maxSpan = Math.max(spanU, spanV);
    const targetCells = def.targetCells || 40;
    const spacing = Math.max(BASE_SPACING * 0.7, maxSpan / targetCells);

    // Grid half-counts to cover the full bounding box
    const halfW = Math.max(4, Math.ceil(spanU / 2 / spacing));
    const halfH = Math.max(4, Math.ceil(spanV / 2 / spacing));

    // Fixed pixel size — sizeAttenuation:false means size is in pixels.
    // 5px circles — visible but smaller than nodes so they aren't confused.
    const pointSize = 5;

    slot.burst = new GridBurst(
      globeGroup, centroid, halfW, halfH, spacing, pointSize, def.height,
      !!def.flat, def.flat ? camera : null,
    );
  }

  function update(elapsed, dt) {
    for (const slot of burstSlots) {
      // Lazy init each burst 0.5s before it fires
      if (!slot.burst && elapsed >= slot.t - 0.5) {
        initBurst(slot);
      }
      if (slot.burst) {
        const age = elapsed - slot.t;
        slot.burst.update(age, slot.dur);
      }
    }
  }

  return { update };
}
