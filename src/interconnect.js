/**
 * interconnect.js — Gold interconnect sequence for cluster nodes.
 *
 * Each cluster goes through: hub ignition → node-to-hub connections draw →
 * nodes sync pulsing → copper hex lattice assembles → hold → fade.
 *
 * Waterloo goes first (during the Waterloo close-up), then Ottawa and
 * Montréal play the same sequence in parallel during the 3-location shot.
 *
 * The Waterloo-specific grey lines + failed pulse (pre-interconnect) are
 * handled separately inside createInterconnect.
 */

import * as THREE from 'three';
import { COLOR_BLUE_NODE } from './globe.js';

// ─── Colors ──────────────────────────────────────────────────────────────────
const COPPER        = 0xd4a04a;
const COPPER_COLOR  = new THREE.Color(COPPER);
const COPPER_GRID   = new THREE.Color(0.83, 0.63, 0.29);
const COPPER_VERT   = new THREE.Color(0.95, 0.75, 0.35);
const COPPER_DOT    = new THREE.Color(1.0, 0.85, 0.45);

const GREY_LINE_COLOR   = 0x606060;
const GREY_LINE_OPACITY = 1.0;

// ─── Pre-interconnect: grey lines + failed pulse (Waterloo only) ─────────
const GREY_LINES_START    = 11.0;
const GREY_LINES_FADE_DUR = 1.2;
const GREY_LINES_END      = 14.5;
const FAILED_PULSE_START  = 12.5;
const FAILED_PULSE_DUR    = 1.8;

// ─── Default timing constants ──────────────────────────────────────────────
const DEFAULT_CONN_DRAW_DUR = 0.8;
const DEFAULT_FLOW_SPEED    = 0.8;
const DEFAULT_HEX_RINGS     = 8;

const LATTICE_BUILD_DUR = 1.0;
const LATTICE_HOLD_DUR  = 1.5;
const LATTICE_FADE_DUR  = 0.5;

// ─── Tube config ────────────────────────────────────────────────────────────
const TUBE_RADIUS   = 0.0006;
const TUBE_SEGMENTS = 24;
const GLOW_TUBULAR  = 64;
const GLOW_RADIAL   = 6;
const GLOW_VERTS_PER_RING = GLOW_RADIAL + 1;
const GLOW_TRAIL    = 0.06;
const GLOW_BRIGHT   = 6.0;
const FLOW_BRIGHT   = 3.0;
const NODE_SIDE_OFFSET = 0.0026;
const HUB_SIDE_OFFSET  = 0.0012;
const COLOR_TRANSITION_DUR = 0.5;
const _blueColor = new THREE.Color(COLOR_BLUE_NODE);
const _lerpColor = new THREE.Color();

// ─── Lattice config ──────────────────────────────────────────────────────────
const HEX_SPACING = 0.002;
const VERT_SIZE   = 0.0012;

// ─── Wave config ─────────────────────────────────────────────────────────────
const WAVE_SPEED     = 0.022;
const WAVE_WIDTH     = 0.004;
const WAVE_INTENSITY = 1.4;
const WAVE_INTERVAL  = 0.70;

// ─── Data dots ──────────────────────────────────────────────────────────────
const DOT_COUNT = 25;
const DOT_SIZE  = 0.0018;
const DOT_COLOR = new THREE.Color(1.0, 0.85, 0.50);

// ─── Helpers ────────────────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function hexDist(q, r) { return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); }

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

// ─── buildClusterIC ─────────────────────────────────────────────────────────
// Builds the gold interconnect for a single cluster: node→hub connections,
// synchronized pulsing, and copper hex lattice.
function buildClusterIC(group, cluster, config, circleTex) {
  const hub    = cluster.hub;
  const hubPos = hub.position.clone();
  const nodes  = cluster.nodes;

  const {
    ignitionT,
    connStarts,
    connDrawDur   = DEFAULT_CONN_DRAW_DUR,
    flowSpeed     = DEFAULT_FLOW_SPEED,
    hexRings      = DEFAULT_HEX_RINGS,
    latticeBuildDur = LATTICE_BUILD_DUR,
    latticeHoldDur  = LATTICE_HOLD_DUR,
    latticeFadeDur  = LATTICE_FADE_DUR,
  } = config;

  // Set hub reveal time so globe.js fades it in at ignition
  cluster.hubRevealT = ignitionT;

  // ── Build node→hub connections ──────────────────────────────────────────
  const connections = [];

  for (let i = 0; i < nodes.length && i < connStarts.length; i++) {
    const node    = nodes[i];
    const nodePos = node.position.clone();
    const startT  = connStarts[i];

    const toNode  = new THREE.Vector3().subVectors(nodePos, hubPos);
    const dir     = toNode.clone().normalize();
    const tubeDist = toNode.length();
    const startPos = hubPos.clone().addScaledVector(dir, HUB_SIDE_OFFSET);
    const endPos   = hubPos.clone().addScaledVector(dir, tubeDist - NODE_SIDE_OFFSET);
    const curve    = new THREE.LineCurve3(startPos, endPos);

    // Tube
    const tubeGeo = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, TUBE_RADIUS, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: COPPER, transparent: true, opacity: 0, depthWrite: false,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.visible = false;
    group.add(tubeMesh);

    const totalIndices = tubeGeo.index
      ? tubeGeo.index.count
      : tubeGeo.attributes.position.count;

    // Glow overlay — per-vertex colored traveling light
    const glowGeo = new THREE.TubeGeometry(curve, GLOW_TUBULAR, TUBE_RADIUS, GLOW_RADIAL, false);
    const glowColors = new Float32Array(glowGeo.attributes.position.count * 3);
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
    const glowMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.renderOrder = 10;
    glowMesh.visible = false;
    group.add(glowMesh);

    connections.push({
      node, nodePos, curve,
      tubeMesh, tubeMat, tubeGeo,
      totalIndices,
      glowMesh, glowGeo, glowColors,
      startT,
      activated: false,
      drawn: false,
      drawnT: 0,
    });
  }

  // ── Connection state tracking ─────────────────────────────────────────
  let allConnected  = false;
  let allConnectedT = 0;
  let flowAccum     = 0;  // dt accumulator for flowing pulses (survives timeline end)

  // Dynamic lattice timing — computed when first pulse reaches hub
  let lattBuildStart = Infinity;
  let lattBuildEnd   = Infinity;
  let lattHoldEnd    = Infinity;
  let lattFadeEnd    = Infinity;

  // ── Build success lattice (hex grid centered on hub) ──────────────────
  const maxRadius = hexRings * HEX_SPACING;
  const fadeStart = maxRadius * 0.5;

  const hubNormal   = hubPos.clone().normalize();
  const hubTangent  = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), hubNormal).normalize();
  const hubBitangent = new THREE.Vector3()
    .crossVectors(hubNormal, hubTangent).normalize();

  function toHubWorld(x, y, h) {
    return hubPos.clone()
      .addScaledVector(hubTangent, x)
      .addScaledVector(hubBitangent, y)
      .addScaledVector(hubNormal, h);
  }

  // Project node positions onto hub tangent plane to get "source directions"
  const nodeAngles = nodes.map(n => {
    const rel = n.position.clone().sub(hubPos);
    const tx = rel.dot(hubTangent);
    const ty = rel.dot(hubBitangent);
    return Math.atan2(ty, tx);
  });

  // Generate hex vertices
  const verts   = [];
  const vertMap = new Map();

  for (let q = -hexRings; q <= hexRings; q++) {
    for (let r = -hexRings; r <= hexRings; r++) {
      const ring = hexDist(q, r);
      if (ring > hexRings) continue;

      const x    = HEX_SPACING * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
      const y    = HEX_SPACING * (1.5 * r);
      const dist = Math.sqrt(x * x + y * y);
      const h    = 0.003 + ring * 0.0002;

      const radialFade = dist <= fadeStart
        ? 1
        : Math.max(0, 1 - (dist - fadeStart) / (maxRadius - fadeStart));

      const angle = Math.atan2(y, x);
      let nearestNode = 0;
      let bestAngleDiff = Infinity;
      for (let ni = 0; ni < nodeAngles.length; ni++) {
        let diff = Math.abs(angle - nodeAngles[ni]);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < bestAngleDiff) {
          bestAngleDiff = diff;
          nearestNode = ni;
        }
      }

      const revealDelay = (dist / maxRadius) * 0.7;

      const idx = verts.length;
      vertMap.set(`${q},${r}`, idx);
      verts.push({
        idx, q, r, ring, dist,
        baseX: x, baseY: y, h,
        worldPos: toHubWorld(x, y, h),
        radialFade,
        sourceNode: nearestNode,
        revealDelay,
      });
    }
  }

  // Generate hex edges
  const ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const latticeEdges = [];

  for (const v of verts) {
    for (const [dq, dr] of ADJ) {
      const nIdx = vertMap.get(`${v.q + dq},${v.r + dr}`);
      if (nIdx === undefined || v.idx >= nIdx) continue;
      const nv = verts[nIdx];
      const edgeDist = (v.dist + nv.dist) / 2;
      const radialFade = Math.min(v.radialFade, nv.radialFade);
      const revealDelay = Math.max(v.revealDelay, nv.revealDelay);
      const aIdx = v.ring <= nv.ring ? v.idx : nIdx;
      const bIdx = aIdx === v.idx ? nIdx : v.idx;
      latticeEdges.push({ a: aIdx, b: bIdx, dist: edgeDist, radialFade, revealDelay });
    }
  }

  const nVerts = verts.length;
  const nEdges = latticeEdges.length;

  // ── Vertex Points ─────────────────────────────────────────────────────
  const vPosArr = new Float32Array(nVerts * 3);
  const vColArr = new Float32Array(nVerts * 3);
  const vGeo = new THREE.BufferGeometry();
  vGeo.setAttribute('position', new THREE.BufferAttribute(vPosArr, 3));
  vGeo.setAttribute('color', new THREE.BufferAttribute(vColArr, 3));

  const vMat = new THREE.PointsMaterial({
    size: VERT_SIZE, map: circleTex, transparent: true,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
    depthWrite: false, vertexColors: true,
  });
  const vertexPoints = new THREE.Points(vGeo, vMat);
  vertexPoints.visible = false;
  group.add(vertexPoints);

  for (const v of verts) {
    const i3 = v.idx * 3;
    vPosArr[i3]     = v.worldPos.x;
    vPosArr[i3 + 1] = v.worldPos.y;
    vPosArr[i3 + 2] = v.worldPos.z;
  }

  // ── Edge LineSegments ─────────────────────────────────────────────────
  const ePosArr = new Float32Array(nEdges * 6);
  const eColArr = new Float32Array(nEdges * 6);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePosArr, 3));
  eGeo.setAttribute('color', new THREE.BufferAttribute(eColArr, 3));

  const eMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const edgeLines = new THREE.LineSegments(eGeo, eMat);
  edgeLines.visible = false;
  group.add(edgeLines);

  // ── Data dots (flowing along lattice edges) ───────────────────────────
  const dotInfos = [];
  let _seed = 42 + Math.round(ignitionT * 100); // different seed per cluster
  function dotRand() { _seed = (_seed * 16807 + 0) % 2147483647; return _seed / 2147483647; }
  for (let d = 0; d < DOT_COUNT; d++) {
    dotInfos.push({
      edgeIdx: Math.floor(dotRand() * nEdges),
      speed:   0.65 + dotRand() * 0.55,
      pos:     dotRand(),
    });
  }

  const dPosArr = new Float32Array(DOT_COUNT * 3);
  const dColArr = new Float32Array(DOT_COUNT * 3);
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPosArr, 3));
  dGeo.setAttribute('color', new THREE.BufferAttribute(dColArr, 3));

  const dMat = new THREE.PointsMaterial({
    size: DOT_SIZE, map: circleTex, transparent: true,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
    depthWrite: false, vertexColors: true,
  });
  const dotMesh = new THREE.Points(dGeo, dMat);
  dotMesh.visible = false;
  group.add(dotMesh);

  // ── Lattice wave brightness (periodic pulses) ─────────────────────────
  const maxWaveAge = maxRadius / WAVE_SPEED * 1.5;

  function getLatticWaveBright(elapsed, dist) {
    const buildAge = elapsed - lattBuildStart;
    if (buildAge < 0.1) return 0;

    const firstWave = lattBuildStart + 0.15;
    if (elapsed < firstWave) return 0;

    let peak = 0;
    const startT = Math.max(firstWave, elapsed - maxWaveAge);
    const firstIdx = Math.ceil((startT - firstWave) / WAVE_INTERVAL);
    const lastIdx  = Math.floor((elapsed - firstWave) / WAVE_INTERVAL);

    for (let wi = firstIdx; wi <= lastIdx; wi++) {
      const waveT = firstWave + wi * WAVE_INTERVAL;
      const age = elapsed - waveT;
      if (age < 0) continue;

      const radius = age * WAVE_SPEED;
      const waveFade = Math.max(0, 1 - radius / (maxRadius * 1.2));
      const d = Math.abs(dist - radius);

      if (d < WAVE_WIDTH) {
        const ring = (1 - d / WAVE_WIDTH) * waveFade;
        peak = Math.max(peak, ring);
      }
    }

    return peak * WAVE_INTENSITY;
  }

  // ── Per-frame update ──────────────────────────────────────────────────
  function update(elapsed, dt) {
    if (elapsed < ignitionT) return;

    // Phase A: Ignition
    if (!hub.active) {
      hub.active = true;
    }

    // Phase B/C/D: Connections
    for (let ci = 0; ci < connections.length; ci++) {
      const conn = connections[ci];

      if (elapsed < conn.startT) continue;

      const drawAge = elapsed - conn.startT;
      const drawT   = Math.min(drawAge / connDrawDur, 1);
      const drawE   = easeOutCubic(drawT);

      // Show tube with drawRange
      conn.tubeMesh.visible = true;
      conn.tubeMat.opacity  = 0.8;

      if (conn.tubeGeo.index) {
        conn.tubeGeo.index.count = Math.floor(drawE * conn.totalIndices);
      } else {
        conn.tubeGeo.setDrawRange(0, Math.floor(drawE * conn.totalIndices));
      }

      // Mark as drawn when tube finishes
      if (drawT >= 1 && !conn.drawn) {
        conn.drawn  = true;
        conn.drawnT = elapsed;
        conn.node.haloBoost = true;
      }

      // Smooth blue → gold color transition
      if (conn.drawn) {
        const colorT = Math.min((elapsed - conn.drawnT) / COLOR_TRANSITION_DUR, 1);
        _lerpColor.copy(_blueColor).lerp(COPPER_COLOR, colorT);
        conn.node.baseColor = _lerpColor.clone();
      }
    }

    // ── All connected: sync nodes + reverse pulses ──────────────────────
    if (!allConnected && connections.every(c => c.drawn)) {
      allConnected  = true;
      allConnectedT = elapsed;
      // Lattice triggers when first pulse reaches hub
      lattBuildStart = elapsed + 1.0 / flowSpeed;
      lattBuildEnd   = lattBuildStart + latticeBuildDur;
      lattHoldEnd    = lattBuildEnd + latticeHoldDur;
      lattFadeEnd    = lattHoldEnd + latticeFadeDur;
      // Immediately snap all nodes to same phase
      for (const node of nodes) {
        node.syncState    = 'synced';
        node.phase        = 0;
        node.pulseFreq    = 0.40;
        node.syncFreq     = 0.40;
        node.baseEmissive = 2.0;
      }
    }

    if (allConnected) {
      flowAccum += dt;
      const sinceAll = elapsed - allConnectedT;

      // Fade emissive flash over 0.4s
      if (sinceAll < 0.4) {
        for (const node of nodes) {
          node.baseEmissive = 2.0 - (sinceAll / 0.4) * 1.0;
        }
      } else {
        for (const node of nodes) {
          node.baseEmissive = 1.0;
        }
      }

      // Reverse pulses: node → hub side (uses flowAccum so pulses survive timeline end)
      const pulsePos  = 1.0 - ((flowAccum * flowSpeed) % 1);
      const pulseAtHub = pulsePos < GLOW_TRAIL;

      // Hub brightens when pulse arrives
      if (pulseAtHub) {
        hub.mat.opacity = Math.min(1.0, hub.mat.opacity + 4.0 * dt);
        const hubBright = 1.0 + (1.0 - pulsePos / GLOW_TRAIL) * 1.5;
        hub.mesh.scale.setScalar(1.0 + (hubBright - 1.0) * 0.05);
      }

      for (const conn of connections) {
        conn.glowMesh.visible = true;
        const colors = conn.glowColors;
        for (let ring = 0; ring <= GLOW_TUBULAR; ring++) {
          const t = ring / GLOW_TUBULAR;
          let bright = 0;
          const dist = Math.abs(t - pulsePos);
          if (dist < GLOW_TRAIL) {
            bright = Math.pow(1 - dist / GLOW_TRAIL, 2) * FLOW_BRIGHT;
          }
          for (let r = 0; r < GLOW_VERTS_PER_RING; r++) {
            const i3 = (ring * GLOW_VERTS_PER_RING + r) * 3;
            colors[i3]     = bright * 0.95;
            colors[i3 + 1] = bright * 0.75;
            colors[i3 + 2] = bright * 0.35;
          }
        }
        conn.glowGeo.attributes.color.needsUpdate = true;
      }
    }

    // ── Lattice ─────────────────────────────────────────────────────────
    const showLattice = elapsed >= lattBuildStart && elapsed < lattFadeEnd;
    vertexPoints.visible = showLattice;
    edgeLines.visible    = showLattice;
    dotMesh.visible      = showLattice;

    if (showLattice) {
      let globalFade = 1;
      if (elapsed > lattHoldEnd) {
        globalFade = Math.max(0, 1 - (elapsed - lattHoldEnd) / (lattFadeEnd - lattHoldEnd));
      }

      const buildAge = elapsed - lattBuildStart;

      // ── Update vertices ────────────────────────────────────────────
      for (const v of verts) {
        const i3 = v.idx * 3;

        const vertRevealAge = buildAge - v.revealDelay;
        if (vertRevealAge < 0) {
          vColArr[i3] = vColArr[i3 + 1] = vColArr[i3 + 2] = 0;
          continue;
        }

        const fadeIn      = Math.min(vertRevealAge / 0.25, 1);
        const subtlePulse = 0.92 + 0.08 * Math.sin(elapsed * 2 + v.idx * 0.3);
        const baseBright  = 0.5 * subtlePulse;
        const waveBright  = getLatticWaveBright(elapsed, v.dist);

        const bright = (baseBright + waveBright) * fadeIn * v.radialFade * globalFade;

        vColArr[i3]     = COPPER_VERT.r * bright;
        vColArr[i3 + 1] = COPPER_VERT.g * bright;
        vColArr[i3 + 2] = COPPER_VERT.b * bright;
      }

      vGeo.attributes.color.needsUpdate = true;

      // ── Update edges ───────────────────────────────────────────────
      for (let ei = 0; ei < nEdges; ei++) {
        const edge = latticeEdges[ei];
        const e0 = ei * 6;
        const e1 = e0 + 3;
        const aI3 = edge.a * 3;
        const bI3 = edge.b * 3;

        const edgeRevealAge = buildAge - edge.revealDelay;
        if (edgeRevealAge < 0) {
          for (let k = 0; k < 6; k++) eColArr[e0 + k] = 0;
          ePosArr[e0]     = vPosArr[aI3];
          ePosArr[e0 + 1] = vPosArr[aI3 + 1];
          ePosArr[e0 + 2] = vPosArr[aI3 + 2];
          ePosArr[e1]     = vPosArr[aI3];
          ePosArr[e1 + 1] = vPosArr[aI3 + 1];
          ePosArr[e1 + 2] = vPosArr[aI3 + 2];
          continue;
        }

        const drawT = Math.min(edgeRevealAge / 0.3, 1);
        const drawE = easeOutCubic(drawT);
        const baseBright = 0.40;
        const waveBright = getLatticWaveBright(elapsed, edge.dist) * 0.7;
        const bright     = (baseBright + waveBright) * drawE * edge.radialFade * globalFade;

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

        const cr = COPPER_GRID.r * bright;
        const cg = COPPER_GRID.g * bright;
        const cb = COPPER_GRID.b * bright;
        eColArr[e0] = cr; eColArr[e0 + 1] = cg; eColArr[e0 + 2] = cb;
        eColArr[e1] = cr; eColArr[e1 + 1] = cg; eColArr[e1 + 2] = cb;
      }

      eGeo.attributes.position.needsUpdate = true;
      eGeo.attributes.color.needsUpdate    = true;

      // ── Update data dots ───────────────────────────────────────────
      for (let di = 0; di < DOT_COUNT; di++) {
        const dot  = dotInfos[di];
        const edge = latticeEdges[dot.edgeIdx];
        const d3   = di * 3;
        const aI3  = edge.a * 3;
        const bI3  = edge.b * 3;

        const edgeRevealAge = buildAge - edge.revealDelay;
        if (edgeRevealAge < 0.4) {
          dColArr[d3] = dColArr[d3 + 1] = dColArr[d3 + 2] = 0;
          dPosArr[d3] = vPosArr[aI3]; dPosArr[d3 + 1] = vPosArr[aI3 + 1]; dPosArr[d3 + 2] = vPosArr[aI3 + 2];
          continue;
        }

        dot.pos += dot.speed * dt;
        if (dot.pos > 1) dot.pos -= 1;

        const t  = dot.pos;
        const ax = vPosArr[aI3], ay = vPosArr[aI3 + 1], az = vPosArr[aI3 + 2];
        const bx = vPosArr[bI3], by = vPosArr[bI3 + 1], bz = vPosArr[bI3 + 2];

        dPosArr[d3]     = ax + (bx - ax) * t;
        dPosArr[d3 + 1] = ay + (by - ay) * t;
        dPosArr[d3 + 2] = az + (bz - az) * t;

        const dotBright = 0.8 * edge.radialFade * globalFade;
        dColArr[d3]     = DOT_COLOR.r * dotBright;
        dColArr[d3 + 1] = DOT_COLOR.g * dotBright;
        dColArr[d3 + 2] = DOT_COLOR.b * dotBright;
      }

      dGeo.attributes.position.needsUpdate = true;
      dGeo.attributes.color.needsUpdate    = true;
    }
  }

  return { connections, update };
}

// ─── createInterconnect ──────────────────────────────────────────────────────
export function createInterconnect(globeGroup, clusters) {
  const group = new THREE.Group();
  globeGroup.add(group);

  const waterloo = clusters.find(c => c.name === 'Waterloo');
  const ottawa   = clusters.find(c => c.name === 'Ottawa');
  const montreal = clusters.find(c => c.name === 'Montréal');

  if (!waterloo) return { group, update: () => {} };

  const waterlooNodes = waterloo.nodes;
  const circleTex = createCircleTexture();

  // ── Grey node-to-node lines (Waterloo pre-interconnect) ───────────────
  const greyLines = [];
  const nodePairs = [[0, 1], [0, 2], [1, 2]];

  for (const [ai, bi] of nodePairs) {
    const posA = waterlooNodes[ai].position.clone();
    const posB = waterlooNodes[bi].position.clone();
    const curve = new THREE.LineCurve3(posA, posB);
    const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.0002, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: GREY_LINE_COLOR, transparent: false, opacity: 1, depthWrite: true,
    });
    const mesh = new THREE.Mesh(tubeGeo, tubeMat);
    mesh.visible = false;
    group.add(mesh);
    greyLines.push({ mesh, mat: tubeMat, curve, ai, bi });
  }

  // ── Failed pulse geometry (Waterloo only) ─────────────────────────────
  const PULSE_TUBULAR = 128;
  const PULSE_RADIAL  = 6;
  const PULSE_VERTS_PER_RING = PULSE_RADIAL + 1;
  const pulseGlowGeo = new THREE.TubeGeometry(
    greyLines[0].curve, PULSE_TUBULAR, 0.0002, PULSE_RADIAL, false,
  );
  const pulseGlowColors = new Float32Array(
    pulseGlowGeo.attributes.position.count * 3,
  );
  pulseGlowGeo.setAttribute(
    'color', new THREE.BufferAttribute(pulseGlowColors, 3),
  );
  const pulseGlowMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  });
  const pulseGlowMesh = new THREE.Mesh(pulseGlowGeo, pulseGlowMat);
  pulseGlowMesh.renderOrder = 10;
  pulseGlowMesh.visible = false;
  group.add(pulseGlowMesh);

  // Scatter particles
  const SCATTER_COUNT = 10;
  const scatterPosArr = new Float32Array(SCATTER_COUNT * 3);
  const scatterColArr = new Float32Array(SCATTER_COUNT * 3);
  const scatterGeo = new THREE.BufferGeometry();
  scatterGeo.setAttribute('position', new THREE.BufferAttribute(scatterPosArr, 3));
  scatterGeo.setAttribute('color', new THREE.BufferAttribute(scatterColArr, 3));
  const scatterMat = new THREE.PointsMaterial({
    size: 0.00012, map: circleTex, transparent: true,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
    depthWrite: false, depthTest: false, vertexColors: true,
  });
  const scatterPoints = new THREE.Points(scatterGeo, scatterMat);
  scatterPoints.renderOrder = 11;
  scatterPoints.visible = false;
  group.add(scatterPoints);

  const lineDir = greyLines[0].curve.v2.clone().sub(greyLines[0].curve.v1).normalize();
  const lineNormal = lineDir.clone().cross(
    greyLines[0].curve.v1.clone().normalize()
  ).normalize();
  const lineBinormal = lineDir.clone().cross(lineNormal).normalize();

  const scatterParticles = [];
  for (let i = 0; i < SCATTER_COUNT; i++) {
    const spawnFrac = 0.3 + (i / SCATTER_COUNT) * 0.6;
    const angle = Math.random() * Math.PI * 2;
    const driftDir = lineNormal.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(lineBinormal, Math.sin(angle));
    scatterParticles.push({
      spawnFrac, driftDir,
      speed: 0.0008 + Math.random() * 0.0012,
      life: 0,
    });
  }

  // ── Cluster interconnects ─────────────────────────────────────────────
  const waterlooIC = buildClusterIC(group, waterloo, {
    ignitionT:  16.0,
    connStarts: [17.4, 18.2, 19.0],
    connDrawDur: 0.8,
    flowSpeed:   0.8,
    hexRings:    8,
    latticeBuildDur: 1.0,
    latticeHoldDur:  1.5,
    latticeFadeDur:  0.5,
  }, circleTex);

  const ottawaIC = ottawa ? buildClusterIC(group, ottawa, {
    ignitionT:  26.0,
    connStarts: [26.4, 26.8],
    connDrawDur: 0.5,
    flowSpeed:   1.0,
    hexRings:    6,
    latticeBuildDur: 0.8,
    latticeHoldDur:  1.0,
    latticeFadeDur:  0.3,
  }, circleTex) : null;

  const montrealIC = montreal ? buildClusterIC(group, montreal, {
    ignitionT:  26.0,
    connStarts: [26.4, 26.8, 27.2],
    connDrawDur: 0.5,
    flowSpeed:   1.0,
    hexRings:    6,
    latticeBuildDur: 0.8,
    latticeHoldDur:  1.0,
    latticeFadeDur:  0.3,
  }, circleTex) : null;

  // ── Update ────────────────────────────────────────────────────────────
  function update(elapsed, dt) {
    // ── Grey lines + failed pulse (Waterloo only) ─────────────────────
    if (elapsed >= GREY_LINES_START && elapsed < GREY_LINES_END + 0.5) {
      const fadeIn  = Math.min((elapsed - GREY_LINES_START) / GREY_LINES_FADE_DUR, 1);
      const fadeOut = elapsed > GREY_LINES_END
        ? Math.max(0, 1 - (elapsed - GREY_LINES_END) / 0.5)
        : 1;
      const greyOpacity = fadeIn * fadeOut;

      for (const gl of greyLines) {
        gl.mesh.visible  = greyOpacity > 0;
        gl.mat.opacity   = greyOpacity;
        gl.mat.transparent = greyOpacity < 1;
      }

      // Hero node brightens before releasing pulse
      const flashLeadIn = 0.4;
      const flashFade   = 0.25;
      if (elapsed >= FAILED_PULSE_START - flashLeadIn &&
          elapsed < FAILED_PULSE_START + flashFade) {
        const flashAge = elapsed - (FAILED_PULSE_START - flashLeadIn);
        if (flashAge < flashLeadIn) {
          const ramp = flashAge / flashLeadIn;
          waterlooNodes[0].baseEmissive = 1.0 + ramp * ramp * 4.0;
        } else {
          const releaseT = (flashAge - flashLeadIn) / flashFade;
          waterlooNodes[0].baseEmissive = 5.0 - releaseT * 4.0;
        }
      } else if (elapsed >= FAILED_PULSE_START + flashFade) {
        waterlooNodes[0].baseEmissive = 1.0;
      }

      // Failed pulse: light travels along grey line 0
      if (elapsed >= FAILED_PULSE_START && elapsed < FAILED_PULSE_START + FAILED_PULSE_DUR) {
        const pAge = elapsed - FAILED_PULSE_START;
        const pT   = pAge / FAILED_PULSE_DUR;

        const startOffset = 0.18;
        const endPos      = 0.70;
        const headPos     = startOffset + pT * (2 - pT) * (endPos - startOffset);
        const globalDim   = Math.max(0, Math.pow(1 - pT * 1.25, 3.0));
        const trailLen    = 0.06;

        pulseGlowMesh.visible = true;

        for (let ring = 0; ring <= PULSE_TUBULAR; ring++) {
          const t = ring / PULSE_TUBULAR;
          let bright = 0;

          if (t <= headPos && t >= headPos - trailLen) {
            const distFromHead = (headPos - t) / trailLen;
            const localBright  = Math.pow(1 - distFromHead, 2);
            bright = localBright * globalDim * 14.0;
          }

          for (let r = 0; r < PULSE_VERTS_PER_RING; r++) {
            const vi = ring * PULSE_VERTS_PER_RING + r;
            const i3 = vi * 3;
            pulseGlowColors[i3]     = bright;
            pulseGlowColors[i3 + 1] = bright;
            pulseGlowColors[i3 + 2] = bright;
          }
        }
        pulseGlowGeo.attributes.color.needsUpdate = true;

        // Scatter particles
        scatterPoints.visible = true;
        const _spawnPt = new THREE.Vector3();
        for (let si = 0; si < SCATTER_COUNT; si++) {
          const sp = scatterParticles[si];
          const i3 = si * 3;

          if (pT >= sp.spawnFrac && sp.life === 0) {
            greyLines[0].curve.getPoint(headPos, _spawnPt);
            sp.baseX = _spawnPt.x;
            sp.baseY = _spawnPt.y;
            sp.baseZ = _spawnPt.z;
            sp.spawnBright = globalDim * 14.0;
            sp.life = 0.001;
          }

          if (sp.life > 0) {
            sp.life += dt;
            const drift = sp.life * sp.speed;
            const fade  = Math.max(0, 1 - sp.life / 0.6);

            scatterPosArr[i3]     = sp.baseX + sp.driftDir.x * drift;
            scatterPosArr[i3 + 1] = sp.baseY + sp.driftDir.y * drift;
            scatterPosArr[i3 + 2] = sp.baseZ + sp.driftDir.z * drift;

            const bright = fade * (sp.spawnBright || 1.0);
            scatterColArr[i3]     = bright;
            scatterColArr[i3 + 1] = bright;
            scatterColArr[i3 + 2] = bright;
          } else {
            scatterColArr[i3] = scatterColArr[i3 + 1] = scatterColArr[i3 + 2] = 0;
          }
        }
        scatterGeo.attributes.position.needsUpdate = true;
        scatterGeo.attributes.color.needsUpdate    = true;
      } else {
        pulseGlowMesh.visible = false;
        if (elapsed >= FAILED_PULSE_START + FAILED_PULSE_DUR &&
            elapsed < FAILED_PULSE_START + FAILED_PULSE_DUR + 0.6) {
          scatterPoints.visible = true;
          for (let si = 0; si < SCATTER_COUNT; si++) {
            const sp = scatterParticles[si];
            const i3 = si * 3;
            if (sp.life > 0) {
              sp.life += dt;
              const drift = sp.life * sp.speed;
              const fade  = Math.max(0, 1 - sp.life / 0.6);
              scatterPosArr[i3]     = sp.baseX + sp.driftDir.x * drift;
              scatterPosArr[i3 + 1] = sp.baseY + sp.driftDir.y * drift;
              scatterPosArr[i3 + 2] = sp.baseZ + sp.driftDir.z * drift;
              const bright = fade * (sp.spawnBright || 1.0);
              scatterColArr[i3]     = bright;
              scatterColArr[i3 + 1] = bright;
              scatterColArr[i3 + 2] = bright;
            }
          }
          scatterGeo.attributes.position.needsUpdate = true;
          scatterGeo.attributes.color.needsUpdate    = true;
        } else {
          scatterPoints.visible = false;
          for (const sp of scatterParticles) sp.life = 0;
        }
      }
    } else {
      for (const gl of greyLines) gl.mesh.visible = false;
      pulseGlowMesh.visible = false;
      scatterPoints.visible = false;
    }

    // ── Gold interconnects (all clusters) ────────────────────────────────
    waterlooIC.update(elapsed, dt);
    if (ottawaIC)   ottawaIC.update(elapsed, dt);
    if (montrealIC) montrealIC.update(elapsed, dt);
  }

  return { group, update };
}
