/**
 * arctic.js — Ground cluster gold ICs + satellite blue arcs.
 *
 * Phase 1a (30.0s — Shot 1): Southern city copper ICs (Calgary, Vancouver)
 * Phase 1b (36.0s — Shot 2): Arctic cluster copper ICs
 *   - Multi-node clusters: copper tubes draw node→hub
 *   - 1-node clusters: instant gold
 *
 * Phase 2 (46.5s — Shot 3): Satellite uplinks — straight lines from ground to orbit:
 *   - 6 uplinks: Calgary, Iqaluit, Yellowknife, Churchill, Cambridge Bay, Alert
 *   - Satellite freezes orbit when uplinks fire, shifts to gold when drawn
 *
 * Phase 3 (52.0s — Shot 4): Satellite released, arcs fade out
 *   - Orbit unfreezes so satellite orbits freely
 *   - Blue arcs fade out over 2s to mask disconnect
 */

import * as THREE from 'three';

// ─── Colors — Copper (local ICs) ─────────────────────────────────────────────
const COPPER        = 0xd4a04a;
const COPPER_COLOR  = new THREE.Color(COPPER);
const COPPER_GLOW_R = 0.95;
const COPPER_GLOW_G = 0.75;
const COPPER_GLOW_B = 0.35;

// ─── Colors — Blue (satellite arcs — matches connections.js) ─────────────────
const BLUE_TUBE     = 0x4488cc;
const BLUE_GLOW_R   = 0.35;
const BLUE_GLOW_G   = 0.60;
const BLUE_GLOW_B   = 1.00;

// ─── Geometry ────────────────────────────────────────────────────────────────
const TUBE_RADIUS     = 0.0012;
const GLOW_TUBULAR    = 64;
const GLOW_RADIAL     = 6;
const GLOW_VERTS_PER_RING = GLOW_RADIAL + 1;
const GLOW_TRAIL      = 0.08;
const GLOW_BRIGHT_DRAW = 6.0;
const GLOW_BRIGHT_FLOW = 3.5;
const PULSE_SPEED      = 0.25;
const PULSE_COUNT      = 2;

// ─── Ground cluster IC definitions ───────────────────────────────────────────
// Southern cities fire during Shot 1, Arctic clusters during Shot 2
// Multi-node cities (Calgary, Vancouver, Iqaluit, Yellowknife) now handled by interconnect.js
const SOUTHERN_IC_NAMES = [];
const ARCTIC_IC_NAMES   = ['Inuvik', 'Tuktoyaktuk', 'Alert', 'Cambridge Bay', 'Churchill', 'Whitehorse'];
const LOCAL_IC_CLUSTER_NAMES = [...SOUTHERN_IC_NAMES, ...ARCTIC_IC_NAMES];

const SOUTHERN_IC_START = 36.0;  // after Cal/Van connections draw
const ARCTIC_IC_START   = 45.0;  // during all-Canada view (44.5-52.5)
const LOCAL_IC_STAGGER  = 0.05;
const LOCAL_IC_DUR      = 0.2;

// ─── Satellite uplink definitions — ALL cities connect to satellite ──────────
const SAT_TO_GROUND = [
  { from: 'Sat-Polar', to: 'Waterloo',      t: 54.0, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Ottawa',        t: 54.0, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Montréal',      t: 54.0, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Calgary',       t: 54.3, dur: 0.8 },
  { from: 'Sat-Polar', to: "St. John's",    t: 54.3, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Vancouver',     t: 54.3, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Iqaluit',       t: 54.6, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Yellowknife',   t: 54.6, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Churchill',     t: 54.9, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Cambridge Bay', t: 54.9, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Inuvik',        t: 55.2, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Tuktoyaktuk',   t: 55.2, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Alert',         t: 55.5, dur: 0.8 },
  { from: 'Sat-Polar', to: 'Whitehorse',   t: 55.5, dur: 0.8 },
];

const ARC_FADE_START   = 59.0;  // fade out blue arcs as camera leaves satellite
const ARC_FADE_DUR     = 2.0;   // seconds to fully fade arcs
const GROUND_IC_START  = 33.0;  // earliest IC (NF at 33.5)
const SPACE_ARC_START  = 54.0;

// ─── Helpers ────────────────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function buildTubeConnection(group, curve, segments = 24, tubeColor = COPPER) {
  const tubeGeo = new THREE.TubeGeometry(curve, segments, TUBE_RADIUS, 8, false);
  const tubeMat = new THREE.MeshBasicMaterial({
    color: tubeColor, transparent: true, opacity: 0, depthWrite: false,
  });
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  tubeMesh.visible = false;
  group.add(tubeMesh);

  const totalIndices = tubeGeo.index
    ? tubeGeo.index.count
    : tubeGeo.attributes.position.count;

  const glowGeo = new THREE.TubeGeometry(curve, GLOW_TUBULAR, TUBE_RADIUS * 1.2, GLOW_RADIAL, false);
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

  return { tubeMesh, tubeMat, tubeGeo, totalIndices, glowMesh, glowGeo, glowColors };
}

// ─── Shared glow update (used by both local ICs and space arcs) ─────────────
function updateGlow(arc, dt) {
  arc.glowMesh.visible = true;
  const colors = arc.glowColors;
  const gR = arc.glowR, gG = arc.glowG, gB = arc.glowB;

  if (!arc.drawn) {
    const drawAge = Math.max(0, arc._elapsed - arc.revealT);
    const drawT   = Math.min(drawAge / arc.drawDur, 1);
    const drawE   = easeOutCubic(drawT);

    for (let ring = 0; ring <= GLOW_TUBULAR; ring++) {
      const t = ring / GLOW_TUBULAR;
      let bright = 0;
      if (t <= drawE) {
        const dist = drawE - t;
        if (dist < GLOW_TRAIL) {
          bright = Math.pow(1 - dist / GLOW_TRAIL, 2) * GLOW_BRIGHT_DRAW;
        }
      }
      for (let r = 0; r < GLOW_VERTS_PER_RING; r++) {
        const i3 = (ring * GLOW_VERTS_PER_RING + r) * 3;
        colors[i3]     = bright * gR;
        colors[i3 + 1] = bright * gG;
        colors[i3 + 2] = bright * gB;
      }
    }
  } else {
    arc.flowAccum += dt;
    for (let ring = 0; ring <= GLOW_TUBULAR; ring++) {
      const t = ring / GLOW_TUBULAR;
      let bright = 0;
      for (let pi = 0; pi < PULSE_COUNT; pi++) {
        const offset   = pi / PULSE_COUNT;
        const pulsePos = (arc.flowAccum * PULSE_SPEED * 2 + offset) % 1;
        const dist     = Math.abs(t - pulsePos);
        const wrapDist = Math.min(dist, 1 - dist);
        if (wrapDist < GLOW_TRAIL) {
          const b = Math.pow(1 - wrapDist / GLOW_TRAIL, 2) * GLOW_BRIGHT_FLOW;
          bright = Math.max(bright, b);
        }
      }
      for (let r = 0; r < GLOW_VERTS_PER_RING; r++) {
        const i3 = (ring * GLOW_VERTS_PER_RING + r) * 3;
        colors[i3]     = bright * gR;
        colors[i3 + 1] = bright * gG;
        colors[i3 + 2] = bright * gB;
      }
    }
  }

  arc.glowGeo.attributes.color.needsUpdate = true;
}

// ─── createArcticActivation ──────────────────────────────────────────────────
export function createArcticActivation(globeGroup, clusters, satelliteNodes, droneNodes) {
  const group = new THREE.Group();
  globeGroup.add(group);

  const clusterMap = {};
  for (const c of clusters) clusterMap[c.name] = c;

  const satMap = {};
  for (const s of satelliteNodes) satMap[s.name] = s;

  const droneMap = {};
  for (const d of droneNodes) droneMap[d.name] = d;

  // State
  let localICs = [];
  let singleNodeGolds = [];
  let spaceArcs = [];
  let groundInitDone = false;
  let spaceInitDone  = false;

  function getPos(name) {
    if (satMap[name]) return satMap[name].position.clone();
    if (droneMap[name]) return droneMap[name].position.clone();
    if (clusterMap[name]) return clusterMap[name].hub.position.clone();
    return null;
  }

  // ── Init ground cluster ICs ────────────────────────────────────────────
  function initGround() {
    let icIdx = 0;
    for (const name of LOCAL_IC_CLUSTER_NAMES) {
      const cluster = clusterMap[name];
      if (!cluster) continue;

      const baseT  = SOUTHERN_IC_NAMES.includes(name) ? SOUTHERN_IC_START : ARCTIC_IC_START;
      const startT = baseT + icIdx * LOCAL_IC_STAGGER;

      if (cluster.nodes.length <= 1) {
        singleNodeGolds.push({
          cluster, node: cluster.nodes[0] || null,
          revealT: startT, activated: false,
        });
        icIdx++;
        continue;
      }

      const hubPos = cluster.hub.position.clone();
      for (let ni = 0; ni < cluster.nodes.length; ni++) {
        const node    = cluster.nodes[ni];
        const nodePos = node.position.clone();
        const dir     = new THREE.Vector3().subVectors(nodePos, hubPos).normalize();
        const dist    = nodePos.distanceTo(hubPos);
        const startP  = hubPos.clone().addScaledVector(dir, 0.0012);
        const endP    = hubPos.clone().addScaledVector(dir, dist - 0.0026);
        const curve   = new THREE.LineCurve3(startP, endP);
        const conn    = buildTubeConnection(group, curve, 24);

        localICs.push({
          ...conn,
          revealT: startT + ni * 0.05,
          drawDur: LOCAL_IC_DUR,
          drawn: false, drawnT: 0, flowAccum: 0,
          _elapsed: 0,
          glowR: COPPER_GLOW_R, glowG: COPPER_GLOW_G, glowB: COPPER_GLOW_B,
          node, cluster, clusterName: name,
        });
      }
      icIdx++;
    }
    groundInitDone = true;
  }

  // ── Init satellite uplinks — unit-height cylinders that track satellite ──
  const _yUp = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();

  function initSpace() {
    for (const def of SAT_TO_GROUND) {
      const groundPos = getPos(def.to);    // ground hub (static)
      if (!groundPos) continue;

      // Unit-height cylinder — scaled each frame to match satellite distance
      const geo = new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, 1, 6, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: BLUE_TUBE, transparent: true, opacity: 0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      group.add(mesh);

      spaceArcs.push({
        mesh, mat, geo,
        groundPos: groundPos.clone(),
        revealT: def.t, drawDur: def.dur,
        drawn: false,
        fromName: def.from, toName: def.to,
      });
    }
    spaceInitDone = true;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  function update(elapsed, dt) {
    // ── Phase 1: Ground cluster local ICs ────────────────────────────────
    if (elapsed >= GROUND_IC_START) {
      if (!groundInitDone) initGround();

      for (const sg of singleNodeGolds) {
        if (sg.activated || elapsed < sg.revealT) continue;
        sg.activated = true;
        sg.cluster.hub.active = true;
        if (sg.node) {
          sg.node.baseColor = COPPER_COLOR.clone();
          sg.node.baseEmissive = 1.15; // brightness boost for single-node city
          sg.node.haloBoost = true;
          sg.node.syncState = 'synced';
          sg.node.phase     = 0;
          sg.node.pulseFreq = 0.40;
          sg.node.syncFreq  = 0.40;
        }
      }

      for (const ic of localICs) {
        if (elapsed < ic.revealT) continue;
        ic._elapsed = elapsed;

        const age   = elapsed - ic.revealT;
        const drawT = Math.min(age / ic.drawDur, 1);
        const drawE = easeOutCubic(drawT);

        ic.tubeMesh.visible = true;
        ic.tubeMat.opacity  = 0.8;

        if (ic.tubeGeo.index) {
          ic.tubeGeo.index.count = Math.floor(drawE * ic.totalIndices);
        } else {
          ic.tubeGeo.setDrawRange(0, Math.floor(drawE * ic.totalIndices));
        }

        if (drawT >= 1 && !ic.drawn) {
          ic.drawn  = true;
          ic.drawnT = elapsed;
          ic.cluster.hub.active = true;
          ic.node.baseColor     = COPPER_COLOR.clone();
          ic.node.haloBoost     = true;
          ic.node.syncState     = 'synced';
          ic.node.phase         = 0;
          ic.node.pulseFreq     = 0.40;
          ic.node.syncFreq      = 0.40;
        }

        updateGlow(ic, dt);
      }
    }

    // ── Phase 2: Satellite uplinks — cylinders dynamically track satellite ──
    if (elapsed >= SPACE_ARC_START) {
      if (!spaceInitDone) initSpace();

      // Arc fade-out — masks disconnect as camera leaves satellite
      const fadeProgress = elapsed >= ARC_FADE_START
        ? Math.min((elapsed - ARC_FADE_START) / ARC_FADE_DUR, 1)
        : 0;

      for (const arc of spaceArcs) {
        if (elapsed < arc.revealT) continue;

        if (fadeProgress >= 1) {
          arc.mesh.visible = false;
          continue;
        }

        // Get live satellite position (it's orbiting)
        const satNode = satMap[arc.fromName];
        if (!satNode) continue;
        const satPos = satNode.position;

        // Recompute cylinder transform to track satellite
        _dir.subVectors(satPos, arc.groundPos);
        const length = _dir.length();
        _dir.normalize();
        arc.mesh.position.lerpVectors(arc.groundPos, satPos, 0.5);
        arc.mesh.quaternion.setFromUnitVectors(_yUp, _dir);
        arc.mesh.scale.set(1, length, 1);  // unit-height geo → stretch to fit

        const age   = elapsed - arc.revealT;
        const drawT = Math.min(age / arc.drawDur, 1);
        const drawE = easeOutCubic(drawT);

        arc.mesh.visible = true;
        arc.mat.opacity  = drawE * 0.5 * (1 - fadeProgress);

        if (drawT >= 1 && !arc.drawn) {
          arc.drawn = true;
          if (satNode) satNode.baseColor = COPPER_COLOR.clone();
        }
      }
    }
  }

  return { group, update };
}
