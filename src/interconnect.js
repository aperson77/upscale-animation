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

// ─── Default timing constants ──────────────────────────────────────────────
const DEFAULT_CONN_DRAW_DUR = 0.8;
const DEFAULT_FLOW_SPEED    = 0.8;
const DEFAULT_GRID_HALF     = 5;

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
const NODE_SIDE_OFFSET = 0.0024;  // exactly NODE_RADIUS — tube starts at node surface
const HUB_SIDE_OFFSET  = 0.0012;  // between hex center and edge — tube visually meets the edge
const COLOR_TRANSITION_DUR = 0.5;
const ENTANGLE_TRANSITION_DUR = 0.8; // copper → bright yellow after entanglement
const ENTANGLED_COLOR = new THREE.Color(0xffe066); // lighter brighter yellow
const _blueColor = new THREE.Color(COLOR_BLUE_NODE);
const _lerpColor = new THREE.Color();

// ─── Lattice config ──────────────────────────────────────────────────────────
const GRID_SPACING = 0.002;
const VERT_SIZE    = 0.0012;

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
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function gridDist(col, row) { return Math.max(Math.abs(col), Math.abs(row)); }

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
    hexRings      = DEFAULT_GRID_HALF,
    latticeBuildDur = LATTICE_BUILD_DUR,
    latticeHoldDur  = LATTICE_HOLD_DUR,
    latticeFadeDur  = LATTICE_FADE_DUR,
    skipLattice   = false,
  } = config;

  // Set hub reveal time so globe.js fades it in at ignition
  cluster.hubRevealT = ignitionT;

  // ── Build connections (node → hexagon, all at once) ──
  const connections = [];

  for (let i = 0; i < nodes.length; i++) {
    const node    = nodes[i];
    const nodePos = node.position.clone();

    // Direct line from node surface to hub edge along the real direction between them
    const toHub    = new THREE.Vector3().subVectors(hubPos, nodePos);
    const dir      = toHub.clone().normalize();
    const nodeEnd  = nodePos.clone().addScaledVector(dir, NODE_SIDE_OFFSET);
    const hubEnd   = hubPos.clone().addScaledVector(dir, -HUB_SIDE_OFFSET);

    // Single tube: grows from node toward hexagon
    const tubeCurve = new THREE.LineCurve3(nodeEnd, hubEnd);
    const tubeGeo = new THREE.TubeGeometry(tubeCurve, TUBE_SEGMENTS, TUBE_RADIUS, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: COPPER, transparent: true, opacity: 0, depthWrite: false,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.visible = false;
    group.add(tubeMesh);
    const tubeTotal = tubeGeo.index
      ? tubeGeo.index.count : tubeGeo.attributes.position.count;

    // Glow overlay — same curve for traveling light after connection
    const glowGeo = new THREE.TubeGeometry(tubeCurve, GLOW_TUBULAR, TUBE_RADIUS, GLOW_RADIAL, false);
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
      node, nodePos, curve: tubeCurve,
      tubeMesh, tubeMat, tubeGeo, tubeTotal,
      glowMesh, glowGeo, glowColors,
      startT: ignitionT,
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

  // ── Build success lattice (rectangular grid centered on hub) ─────────
  // skipLattice: only build tubes + pulses, no lattice grid
  if (skipLattice) {
    function update(elapsed, dt) {
      if (elapsed < ignitionT) return;
      if (!hub.active) hub.active = true;

      for (let ci = 0; ci < connections.length; ci++) {
        const conn = connections[ci];
        if (elapsed < conn.startT) continue;
        const drawAge = elapsed - conn.startT;
        const drawT   = Math.min(drawAge / connDrawDur, 1);
        const drawE   = easeInOutCubic(drawT);
        conn.tubeMesh.visible = true;
        conn.tubeMat.opacity  = 0.8;
        if (conn.tubeGeo.index) {
          conn.tubeGeo.index.count = Math.floor(drawE * conn.tubeTotal);
        } else {
          conn.tubeGeo.setDrawRange(0, Math.floor(drawE * conn.tubeTotal));
        }
        if (drawT >= 1 && !conn.drawn) {
          conn.drawn  = true;
          conn.drawnT = elapsed;
        }
        if (conn.drawn) {
          const colorT = Math.min((elapsed - conn.drawnT) / COLOR_TRANSITION_DUR, 1);
          _lerpColor.copy(_blueColor).lerp(COPPER_COLOR, colorT);
          conn.node.baseColor = _lerpColor.clone();
        }
      }

      if (!allConnected && connections.every(c => c.drawn)) {
        allConnected  = true;
        allConnectedT = elapsed;
        cluster.clusterSynced = true;
        cluster.clusterSyncStartT = elapsed;
        cluster.leadPhase = nodes[0].phase;
        for (const node of nodes) {
          node.baseEmissive = 1.0;
          node.clusterSynced = true;
        }
      }

      if (allConnected) {
        flowAccum += dt;
        const sinceAll = elapsed - allConnectedT;
        const entangleT = Math.min(sinceAll / ENTANGLE_TRANSITION_DUR, 1);
        const entangleE = entangleT * entangleT * (3 - 2 * entangleT);
        _lerpColor.copy(COPPER_COLOR).lerp(ENTANGLED_COLOR, entangleE);
        for (const conn of connections) conn.tubeMat.color.copy(_lerpColor);
        hub.mat.color.copy(_lerpColor);
        for (const node of nodes) node.baseColor.copy(COPPER_COLOR).lerp(ENTANGLED_COLOR, entangleE);

        const pulsePos = (flowAccum * flowSpeed) % 1;
        const pulseAtHub = pulsePos > (1 - GLOW_TRAIL);
        if (pulseAtHub) {
          hub.mat.opacity = Math.min(1.0, hub.mat.opacity + 2.0 * dt);
          const hubProximity = (pulsePos - (1 - GLOW_TRAIL)) / GLOW_TRAIL;
          const hubBright = 1.0 + hubProximity * 0.6;
          hub.mesh.scale.setScalar(1.0 + (hubBright - 1.0) * 0.03);
        }

        const FADE_ZONE = 0.15;
        let endpointFade = 1;
        if (pulsePos < FADE_ZONE) endpointFade = pulsePos / FADE_ZONE;
        else if (pulsePos > (1 - FADE_ZONE)) endpointFade = (1 - pulsePos) / FADE_ZONE;

        const glowR = 0.95 + entangleE * 0.05;
        const glowG = 0.75 + entangleE * 0.13;
        const glowB = 0.35 + entangleE * 0.05;
        for (const conn of connections) {
          conn.glowMesh.visible = true;
          const colors = conn.glowColors;
          for (let ring = 0; ring <= GLOW_TUBULAR; ring++) {
            const t = ring / GLOW_TUBULAR;
            let bright = 0;
            const dist = Math.abs(t - pulsePos);
            if (dist < GLOW_TRAIL) {
              bright = Math.pow(1 - dist / GLOW_TRAIL, 2) * FLOW_BRIGHT * endpointFade;
            }
            for (let r = 0; r < GLOW_VERTS_PER_RING; r++) {
              const i3 = (ring * GLOW_VERTS_PER_RING + r) * 3;
              colors[i3]     = bright * glowR;
              colors[i3 + 1] = bright * glowG;
              colors[i3 + 2] = bright * glowB;
            }
          }
          conn.glowGeo.attributes.color.needsUpdate = true;
        }
      }
    }
    return { connections, update };
  }

  const gridHalf  = hexRings;
  const maxRadius = gridHalf * GRID_SPACING;
  const gaussSigma = maxRadius * 0.55;

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

  // Generate rectangular grid vertices
  const verts   = [];
  const vertMap = new Map();

  for (let row = -gridHalf; row <= gridHalf; row++) {
    for (let col = -gridHalf; col <= gridHalf; col++) {
      const x    = col * GRID_SPACING;
      const y    = row * GRID_SPACING;
      const dist = Math.sqrt(x * x + y * y);
      const ring = gridDist(col, row);
      const h    = 0.003 + ring * 0.0002;

      // Gaussian fade: bright at center, smooth fall-off at edges
      const radialFade = Math.exp(-(dist * dist) / (2 * gaussSigma * gaussSigma));

      const revealDelay = (dist / maxRadius) * 0.7;

      const idx = verts.length;
      vertMap.set(`${col},${row}`, idx);
      verts.push({
        idx, col, row, ring, dist,
        baseX: x, baseY: y, h,
        worldPos: toHubWorld(x, y, h),
        radialFade,
        revealDelay,
        pulsePhase: (col * 2.7 + row * 3.1) % (Math.PI * 2),
      });
    }
  }

  // Generate rectangular grid edges (4-connected: right and down)
  const ADJ = [[1, 0], [0, 1]];
  const latticeEdges = [];

  for (const v of verts) {
    for (const [dc, dr] of ADJ) {
      const nIdx = vertMap.get(`${v.col + dc},${v.row + dr}`);
      if (nIdx === undefined) continue;
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

  // ── Data dots (stationary at vertices, occasional blink) ─────────────
  const dotInfos = [];
  let _seed = 42 + Math.round(ignitionT * 100); // different seed per cluster
  function dotRand() { _seed = (_seed * 16807 + 0) % 2147483647; return _seed / 2147483647; }
  for (let d = 0; d < DOT_COUNT; d++) {
    dotInfos.push({
      vertIdx:    Math.floor(dotRand() * nVerts),
      blinkFreq:  1.5 + dotRand() * 3.0,   // 1.5–4.5 Hz — varied blink rates
      blinkPhase: dotRand() * Math.PI * 2,  // random phase offset
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

    // Phase B/C/D: Connections — grow from both ends, meet in middle
    for (let ci = 0; ci < connections.length; ci++) {
      const conn = connections[ci];

      if (elapsed < conn.startT) continue;

      const drawAge = elapsed - conn.startT;
      const drawT   = Math.min(drawAge / connDrawDur, 1);
      const drawE   = easeInOutCubic(drawT);

      // Single tube: grows from node toward hexagon
      conn.tubeMesh.visible = true;
      conn.tubeMat.opacity  = 0.8;
      if (conn.tubeGeo.index) {
        conn.tubeGeo.index.count = Math.floor(drawE * conn.tubeTotal);
      } else {
        conn.tubeGeo.setDrawRange(0, Math.floor(drawE * conn.tubeTotal));
      }

      // Mark as drawn when tube reaches hexagon
      if (drawT >= 1 && !conn.drawn) {
        conn.drawn  = true;
        conn.drawnT = elapsed;
      }

      // Smooth blue → copper color transition on node
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
      // Signal globe.js: cluster nodes sync to cluster's lead phase
      cluster.clusterSynced = true;
      cluster.clusterSyncStartT = elapsed;
      cluster.leadPhase = nodes[0].phase; // start from first node's current phase
      for (const node of nodes) {
        node.baseEmissive = 1.0;
        node.clusterSynced = true;
      }
    }

    if (allConnected) {
      flowAccum += dt;
      const sinceAll = elapsed - allConnectedT;

      // ── Entanglement color transition: copper → bright yellow ──────────
      const entangleT = Math.min(sinceAll / ENTANGLE_TRANSITION_DUR, 1);
      const entangleE = entangleT * entangleT * (3 - 2 * entangleT); // smoothstep
      _lerpColor.copy(COPPER_COLOR).lerp(ENTANGLED_COLOR, entangleE);
      // Transition tube colors
      for (const conn of connections) {
        conn.tubeMat.color.copy(_lerpColor);
      }
      // Transition hub color to bright yellow
      hub.mat.color.copy(_lerpColor);
      // Transition node colors to match — all nodes get lighter together
      for (const node of nodes) {
        node.baseColor.copy(COPPER_COLOR).lerp(ENTANGLED_COLOR, entangleE);
      }

      // Pulses travel node(t=0) → hub(t=1) with smooth fade at endpoints
      const pulsePos  = (flowAccum * flowSpeed) % 1;
      const pulseAtHub = pulsePos > (1 - GLOW_TRAIL);

      // Hub brightens gently when pulse arrives (pulse near t=1 = hub end)
      if (pulseAtHub) {
        hub.mat.opacity = Math.min(1.0, hub.mat.opacity + 2.0 * dt);
        const hubProximity = (pulsePos - (1 - GLOW_TRAIL)) / GLOW_TRAIL;
        const hubBright = 1.0 + hubProximity * 0.6;
        hub.mesh.scale.setScalar(1.0 + (hubBright - 1.0) * 0.03);
      }

      // Endpoint fade zones: pulse fades out near hub (t=1) and fades in near node (t=0)
      const FADE_ZONE = 0.15; // fraction of tube length for fade-in/out
      let endpointFade = 1;
      if (pulsePos < FADE_ZONE) {
        endpointFade = pulsePos / FADE_ZONE;           // fade in from node end
      } else if (pulsePos > (1 - FADE_ZONE)) {
        endpointFade = (1 - pulsePos) / FADE_ZONE;     // fade out at hub end
      }

      // Glow pulse colors also shift to entangled yellow
      const glowR = 0.95 + entangleE * 0.05;  // → 1.0
      const glowG = 0.75 + entangleE * 0.13;  // → 0.88
      const glowB = 0.35 + entangleE * 0.05;  // → 0.40
      for (const conn of connections) {
        conn.glowMesh.visible = true;
        const colors = conn.glowColors;
        for (let ring = 0; ring <= GLOW_TUBULAR; ring++) {
          const t = ring / GLOW_TUBULAR;
          let bright = 0;
          const dist = Math.abs(t - pulsePos);
          if (dist < GLOW_TRAIL) {
            bright = Math.pow(1 - dist / GLOW_TRAIL, 2) * FLOW_BRIGHT * endpointFade;
          }
          for (let r = 0; r < GLOW_VERTS_PER_RING; r++) {
            const i3 = (ring * GLOW_VERTS_PER_RING + r) * 3;
            colors[i3]     = bright * glowR;
            colors[i3 + 1] = bright * glowG;
            colors[i3 + 2] = bright * glowB;
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
        const latticeBreath = (1 - Math.cos(elapsed * 1.8 + v.pulsePhase)) * 0.5;
        const subtlePulse = 0.88 + 0.32 * latticeBreath;
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
        const drawE = easeInOutCubic(drawT);
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

      // ── Update data dots — stationary at vertices, occasional blink ──
      for (let di = 0; di < DOT_COUNT; di++) {
        const dot = dotInfos[di];
        const d3  = di * 3;
        // Place at vertex position (fixed, no movement)
        const vi3 = dot.vertIdx * 3;
        dPosArr[d3]     = vPosArr[vi3];
        dPosArr[d3 + 1] = vPosArr[vi3 + 1];
        dPosArr[d3 + 2] = vPosArr[vi3 + 2];

        const v = verts[dot.vertIdx];
        const vertRevealAge = buildAge - v.revealDelay;
        if (vertRevealAge < 0.3) {
          dColArr[d3] = dColArr[d3 + 1] = dColArr[d3 + 2] = 0;
          continue;
        }

        // Random blink: use sin with unique phase/freq — ON when > 0.3
        const blinkVal = Math.sin(elapsed * dot.blinkFreq + dot.blinkPhase);
        const on = blinkVal > 0.3 ? 1.0 : 0.0;
        const dotBright = on * 0.7 * v.radialFade * globalFade;
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

  const clusterMap = {};
  for (const c of clusters) clusterMap[c.name] = c;

  const circleTex = createCircleTexture();

  // Helper: build IC for a named cluster if it exists and has >1 node
  function tryBuild(name, config) {
    const cluster = clusterMap[name];
    if (!cluster || cluster.nodes.length < 2) return null;
    const starts = new Array(cluster.nodes.length).fill(config.ignitionT);
    return buildClusterIC(group, cluster, { connStarts: starts, ...config }, circleTex);
  }

  // ── Cluster interconnects — all multi-node cities ───────────────────
  const allICs = [
    // Waterloo — during close-up (17.5-25s), fires shortly after 3 nodes appear
    // Lattice holds long enough to overlap with the camera pull-back start (t=25)
    // so the hex gently fades while the camera moves — no abrupt cut
    tryBuild('Waterloo', {
      ignitionT: 15.5, connDrawDur: 0.8, flowSpeed: 0.8,
      hexRings: 8, latticeBuildDur: 1.5, latticeHoldDur: 3.5, latticeFadeDur: 1.5,
    }),
    // Ottawa — tubes + pulses only, fires at start of 3-city view
    tryBuild('Ottawa', {
      ignitionT: 23.5, connDrawDur: 0.6, flowSpeed: 0.9, skipLattice: true,
    }),
    // Montréal — tubes + pulses only, fires at start of 3-city view
    tryBuild('Montréal', {
      ignitionT: 23.5, connDrawDur: 0.6, flowSpeed: 0.9, skipLattice: true,
    }),
    // Newfoundland — tubes + pulses only, fires at start of regional view
    tryBuild('Newfoundland', {
      ignitionT: 33.5, connDrawDur: 0.5, flowSpeed: 1.0, skipLattice: true,
    }),
    // Calgary — tubes + pulses only, fires at start of west view
    tryBuild('Calgary', {
      ignitionT: 42.5, connDrawDur: 0.5, flowSpeed: 1.0, skipLattice: true,
    }),
    // Vancouver — tubes + pulses only, fires at start of west view
    tryBuild('Vancouver', {
      ignitionT: 42.5, connDrawDur: 0.5, flowSpeed: 1.0, skipLattice: true,
    }),
    // Iqaluit — tubes + pulses only, fires at start of Canada-wide view
    tryBuild('Iqaluit', {
      ignitionT: 51.0, connDrawDur: 0.5, flowSpeed: 1.0, skipLattice: true,
    }),
    // Yellowknife — tubes + pulses only, fires at start of Canada-wide view
    tryBuild('Yellowknife', {
      ignitionT: 51.0, connDrawDur: 0.5, flowSpeed: 1.0, skipLattice: true,
    }),
  ].filter(Boolean);

  // ── Update ────────────────────────────────────────────────────────────
  function update(elapsed, dt) {
    for (const ic of allICs) ic.update(elapsed, dt);
  }

  return { group, update };
}
