/**
 * arctic.js — Local gold interconnects for Canada/Arctic ground clusters.
 *
 * After the camera settles on the full-globe shot, each ground cluster
 * goes through a fast gold hub-connect sequence:
 *   - Multi-node clusters: copper tubes draw from each node to hub
 *   - 1-node clusters: node just turns gold instantly
 *
 * Satellite/drone connections are handled separately in a later phase.
 */

import * as THREE from 'three';

// ─── Colors — Copper for local ICs ────────────────────────────────────────────
const COPPER        = 0xd4a04a;
const COPPER_COLOR  = new THREE.Color(COPPER);
const COPPER_GLOW_R = 0.95;
const COPPER_GLOW_G = 0.75;
const COPPER_GLOW_B = 0.35;

// ─── Geometry ────────────────────────────────────────────────────────────────
const TUBE_RADIUS     = 0.0006;
const GLOW_TUBULAR    = 64;
const GLOW_RADIAL     = 6;
const GLOW_VERTS_PER_RING = GLOW_RADIAL + 1;
const GLOW_TRAIL      = 0.08;
const GLOW_BRIGHT_DRAW = 6.0;
const GLOW_BRIGHT_FLOW = 3.5;
const PULSE_SPEED      = 0.25;
const PULSE_COUNT      = 2;

// Clusters that go through local gold IC
const LOCAL_IC_CLUSTER_NAMES = [
  'Calgary', 'Vancouver',
  'Iqaluit', 'Yellowknife', 'Inuvik', 'Alert', 'Cambridge Bay', 'Churchill',
];

const LOCAL_IC_START    = 32.8;
const LOCAL_IC_STAGGER  = 0.05;
const LOCAL_IC_DUR      = 0.2;

const ACTIVATION_T = 32.8; // first IC fires at this time

// ─── Helpers ────────────────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function buildTubeConnection(group, curve, segments = 24) {
  const tubeGeo = new THREE.TubeGeometry(curve, segments, TUBE_RADIUS, 6, false);
  const tubeMat = new THREE.MeshBasicMaterial({
    color: COPPER, transparent: true, opacity: 0, depthWrite: false,
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

// ─── createArcticActivation ──────────────────────────────────────────────────
export function createArcticActivation(globeGroup, clusters, satelliteNodes, droneNodes) {
  const group = new THREE.Group();
  globeGroup.add(group);

  const clusterMap = {};
  for (const c of clusters) clusterMap[c.name] = c;

  let localICs = [];
  let singleNodeGolds = [];
  let initialized = false;

  function init() {
    let icIdx = 0;
    for (const name of LOCAL_IC_CLUSTER_NAMES) {
      const cluster = clusterMap[name];
      if (!cluster) continue;

      const startT = LOCAL_IC_START + icIdx * LOCAL_IC_STAGGER;

      // 1-node clusters: no tube needed, just turn gold
      if (cluster.nodes.length <= 1) {
        singleNodeGolds.push({
          cluster,
          node: cluster.nodes[0] || null,
          revealT: startT,
          activated: false,
        });
        icIdx++;
        continue;
      }

      // Multi-node clusters: build copper tubes from each node to hub
      const hubPos = cluster.hub.position.clone();

      for (let ni = 0; ni < cluster.nodes.length; ni++) {
        const node    = cluster.nodes[ni];
        const nodePos = node.position.clone();
        const dir     = new THREE.Vector3().subVectors(nodePos, hubPos).normalize();
        const dist    = nodePos.distanceTo(hubPos);

        const startP = hubPos.clone().addScaledVector(dir, 0.0012);
        const endP   = hubPos.clone().addScaledVector(dir, dist - 0.0026);
        const curve  = new THREE.LineCurve3(startP, endP);
        const conn   = buildTubeConnection(group, curve, 24);

        localICs.push({
          ...conn,
          revealT: startT + ni * 0.05,
          drawDur: LOCAL_IC_DUR,
          drawn: false,
          drawnT: 0,
          flowAccum: 0,
          node,
          cluster,
          clusterName: name,
        });
      }

      icIdx++;
    }

    initialized = true;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  function update(elapsed, dt) {
    if (elapsed < ACTIVATION_T) return;

    if (!initialized) init();

    // ── 1-node clusters: instant gold ──────────────────────────────────
    for (const sg of singleNodeGolds) {
      if (sg.activated || elapsed < sg.revealT) continue;
      sg.activated = true;
      sg.cluster.hub.active = true;
      if (sg.node) {
        sg.node.baseColor  = COPPER_COLOR.clone();
        sg.node.haloBoost  = true;
        sg.node.syncState  = 'synced';
        sg.node.phase      = 0;
        sg.node.pulseFreq  = 0.40;
        sg.node.syncFreq   = 0.40;
      }
    }

    // ── Update local copper interconnects (multi-node clusters) ────────
    for (const ic of localICs) {
      if (elapsed < ic.revealT) continue;

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

      // Glow for local ICs (copper)
      ic.glowMesh.visible = true;
      const colors = ic.glowColors;

      if (!ic.drawn) {
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
            colors[i3]     = bright * COPPER_GLOW_R;
            colors[i3 + 1] = bright * COPPER_GLOW_G;
            colors[i3 + 2] = bright * COPPER_GLOW_B;
          }
        }
      } else {
        ic.flowAccum += dt;
        for (let ring = 0; ring <= GLOW_TUBULAR; ring++) {
          const t = ring / GLOW_TUBULAR;
          let bright = 0;
          for (let pi = 0; pi < PULSE_COUNT; pi++) {
            const offset   = pi / PULSE_COUNT;
            const pulsePos = (ic.flowAccum * PULSE_SPEED * 2 + offset) % 1;
            const dist     = Math.abs(t - pulsePos);
            const wrapDist = Math.min(dist, 1 - dist);
            if (wrapDist < GLOW_TRAIL) {
              const b = Math.pow(1 - wrapDist / GLOW_TRAIL, 2) * GLOW_BRIGHT_FLOW;
              bright = Math.max(bright, b);
            }
          }
          for (let r = 0; r < GLOW_VERTS_PER_RING; r++) {
            const i3 = (ring * GLOW_VERTS_PER_RING + r) * 3;
            colors[i3]     = bright * COPPER_GLOW_R;
            colors[i3 + 1] = bright * COPPER_GLOW_G;
            colors[i3 + 2] = bright * COPPER_GLOW_B;
          }
        }
      }

      ic.glowGeo.attributes.color.needsUpdate = true;
    }
  }

  return { group, update };
}
