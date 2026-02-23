/**
 * connections.js
 * Blue hub-to-hub great-circle arcs between clusters, with traveling
 * light pulses. These represent telecom fibers connecting the locations
 * and only appear after each location completes its gold interconnect.
 */

import * as THREE from 'three';
// globe.js no longer needed — arc endpoints use actual hub positions

// ─── Colors ─────────────────────────────────────────────────────────────────
const TUBE_COLOR    = 0x4488cc;
const TUBE_OPACITY  = 0.30;
const GLOW_COLOR_R  = 0.35;
const GLOW_COLOR_G  = 0.60;
const GLOW_COLOR_B  = 1.00;

// ─── Geometry ───────────────────────────────────────────────────────────────
const ARC_SEGMENTS   = 64;
const TUBE_RADIUS    = 0.0014;
const ARC_BASE_LIFT  = 0.05;

// ─── Glow overlay ───────────────────────────────────────────────────────────
const GLOW_TUBULAR        = 64;
const GLOW_RADIAL         = 6;
const GLOW_VERTS_PER_RING = GLOW_RADIAL + 1;
const GLOW_TRAIL          = 0.10;   // length of the bright pulse head
const GLOW_BRIGHT_DRAW    = 6.0;    // brightness during draw phase
const GLOW_BRIGHT_FLOW    = 4.0;    // brightness for flowing pulses
const DRAW_SPEED          = 1.2;    // seconds to draw the full arc (smoother)
const PULSE_SPEED         = 0.20;   // traversals per second for flowing pulses
const PULSE_COUNT         = 2;      // number of flowing pulses per edge

// ─── Edge definitions ──────────────────────────────────────────────────────
const EDGE_DEFS = [
  // Step 1 — 3-city connect (camera hold 23-30, hex IC fires at 23.5)
  { from: 'Waterloo',      to: 'Ottawa',         revealT: 25.0 },
  { from: 'Ottawa',        to: 'Montréal',       revealT: 25.0 },
  // Step 2 — Newfoundland connects (camera hold 33-39.5, hex IC fires at 33.5)
  { from: 'Montréal',      to: 'Newfoundland',   revealT: 35.0 },
  // Step 3 — Calgary/Vancouver connect (camera hold 42-48, hex IC fires at 42.5)
  { from: 'Waterloo',      to: 'Calgary',        revealT: 44.0 },
  { from: 'Calgary',       to: 'Vancouver',      revealT: 44.0 },
  // Step 4 — all Canada, Northern cities connect (camera hold 50.5-56, hex IC fires at 51)
  { from: 'Yellowknife',   to: 'Inuvik',         revealT: 52.0 },
  { from: 'Inuvik',        to: 'Tuktoyaktuk',    revealT: 52.0 },
  { from: 'Iqaluit',       to: 'Cambridge Bay',  revealT: 52.0 },
  { from: 'Cambridge Bay', to: 'Yellowknife',    revealT: 52.5 },
  { from: 'Churchill',     to: 'Iqaluit',        revealT: 52.5 },
  { from: 'Tuktoyaktuk',   to: 'Cambridge Bay',  revealT: 52.5 },
  { from: 'Alert',         to: 'Iqaluit',        revealT: 53.0 },
  { from: 'Cambridge Bay', to: 'Alert',          revealT: 53.0 },
  { from: 'Churchill',     to: 'Yellowknife',    revealT: 53.0 },
  { from: 'Whitehorse',    to: 'Inuvik',         revealT: 52.5 },
  { from: 'Whitehorse',    to: 'Yellowknife',    revealT: 53.0 },
];

// ─── Great-circle arc ──────────────────────────────────────────────────────
function arcPoints(a, b, segments = ARC_SEGMENTS) {
  const dirA = a.clone().normalize();
  const dirB = b.clone().normalize();
  const rA = a.length();  // actual hub radius
  const rB = b.length();

  const angDist = dirA.angleTo(dirB);
  const maxLift = ARC_BASE_LIFT + angDist * 0.12;

  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lift = 4 * t * (1 - t);  // 0 at endpoints, 1 at midpoint
    const baseR = rA + (rB - rA) * t;
    const r = baseR + maxLift * lift;
    pts.push(
      new THREE.Vector3().lerpVectors(dirA, dirB, t).normalize().multiplyScalar(r),
    );
  }
  return pts;
}

function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

// ─── createClassicalConnections ────────────────────────────────────────────
export function createClassicalConnections(globeGroup, clusters) {
  const group = new THREE.Group();
  globeGroup.add(group);

  const clusterMap = {};
  for (const c of clusters) clusterMap[c.name] = c;

  const edges = [];

  for (const def of EDGE_DEFS) {
    const cA = clusterMap[def.from];
    const cB = clusterMap[def.to];
    if (!cA || !cB) continue;

    const hubA = cA.hub.position;
    const hubB = cB.hub.position;
    const pts  = arcPoints(hubA, hubB);
    const fullCurve = new THREE.CatmullRomCurve3(pts);

    // Split arc into two halves: A→mid and B→mid (both grow outward, meet in middle)
    const halfIdx = Math.floor(pts.length / 2);
    const ptsA = pts.slice(0, halfIdx + 1);                   // A-end to midpoint
    const ptsB = pts.slice(halfIdx).reverse();                 // B-end to midpoint
    const curveA = new THREE.CatmullRomCurve3(ptsA);
    const curveB = new THREE.CatmullRomCurve3(ptsB);

    const halfSegs = Math.max(Math.floor(ARC_SEGMENTS / 2), 16);

    // ── A-half tube (grows from city A toward midpoint) ─────────────────
    const tubeGeoA = new THREE.TubeGeometry(curveA, halfSegs, TUBE_RADIUS, 8, false);
    const tubeMatA = new THREE.MeshBasicMaterial({
      color: TUBE_COLOR, transparent: true, opacity: 0, depthWrite: false,
    });
    const tubeMeshA = new THREE.Mesh(tubeGeoA, tubeMatA);
    tubeMeshA.visible = false;
    group.add(tubeMeshA);
    const totalA = tubeGeoA.index ? tubeGeoA.index.count : tubeGeoA.attributes.position.count;

    // ── B-half tube (grows from city B toward midpoint) ─────────────────
    const tubeGeoB = new THREE.TubeGeometry(curveB, halfSegs, TUBE_RADIUS, 8, false);
    const tubeMatB = new THREE.MeshBasicMaterial({
      color: TUBE_COLOR, transparent: true, opacity: 0, depthWrite: false,
    });
    const tubeMeshB = new THREE.Mesh(tubeGeoB, tubeMatB);
    tubeMeshB.visible = false;
    group.add(tubeMeshB);
    const totalB = tubeGeoB.index ? tubeGeoB.index.count : tubeGeoB.attributes.position.count;

    // ── Glow overlay tube — full arc for traveling light pulses ──────────
    const glowGeo = new THREE.TubeGeometry(fullCurve, GLOW_TUBULAR, TUBE_RADIUS * 1.2, GLOW_RADIAL, false);
    const glowColors = new Float32Array(glowGeo.attributes.position.count * 3);
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
    const glowMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent:  true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
      depthTest:    false,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.renderOrder = 10;
    glowMesh.visible = false;
    group.add(glowMesh);

    edges.push({
      def, curve: fullCurve,
      tubeMeshA, tubeMatA, tubeGeoA, totalA,
      tubeMeshB, tubeMatB, tubeGeoB, totalB,
      glowMesh, glowGeo, glowColors,
      revealT: def.revealT,
      drawn: false,
      drawnT: 0,
      flowAccum: 0,
    });
  }

  // ── Update ────────────────────────────────────────────────────────────
  function update(elapsed, dt) {
    for (const edge of edges) {
      if (elapsed < edge.revealT) continue;

      const age = elapsed - edge.revealT;

      // ── Draw phase: both halves extend toward midpoint simultaneously ──
      const drawT = Math.min(age / DRAW_SPEED, 1);
      const drawE = easeInOutCubic(drawT);

      // A-half: grows from city A toward midpoint
      edge.tubeMeshA.visible = true;
      edge.tubeMatA.opacity  = TUBE_OPACITY;
      if (edge.tubeGeoA.index) {
        edge.tubeGeoA.index.count = Math.floor(drawE * edge.totalA);
      } else {
        edge.tubeGeoA.setDrawRange(0, Math.floor(drawE * edge.totalA));
      }

      // B-half: grows from city B toward midpoint
      edge.tubeMeshB.visible = true;
      edge.tubeMatB.opacity  = TUBE_OPACITY;
      if (edge.tubeGeoB.index) {
        edge.tubeGeoB.index.count = Math.floor(drawE * edge.totalB);
      } else {
        edge.tubeGeoB.setDrawRange(0, Math.floor(drawE * edge.totalB));
      }

      if (drawT >= 1 && !edge.drawn) {
        edge.drawn  = true;
        edge.drawnT = elapsed;
      }

      // ── Glow: traveling light ──────────────────────────────────────
      edge.glowMesh.visible = true;
      const colors = edge.glowColors;

      if (!edge.drawn) {
        // During draw: two bright heads converging from each end toward middle
        for (let ring = 0; ring <= GLOW_TUBULAR; ring++) {
          const t = ring / GLOW_TUBULAR;
          let bright = 0;

          // Head growing from A-side (t=0 toward t=0.5)
          const frontA = drawE * 0.5;  // A-side front position (0→0.5)
          if (t <= frontA) {
            const dist = frontA - t;
            if (dist < GLOW_TRAIL) {
              bright = Math.max(bright, Math.pow(1 - dist / GLOW_TRAIL, 2) * GLOW_BRIGHT_DRAW);
            }
          }

          // Head growing from B-side (t=1 toward t=0.5)
          const frontB = 1.0 - drawE * 0.5;  // B-side front position (1→0.5)
          if (t >= frontB) {
            const dist = t - frontB;
            if (dist < GLOW_TRAIL) {
              bright = Math.max(bright, Math.pow(1 - dist / GLOW_TRAIL, 2) * GLOW_BRIGHT_DRAW);
            }
          }

          for (let r = 0; r < GLOW_VERTS_PER_RING; r++) {
            const i3 = (ring * GLOW_VERTS_PER_RING + r) * 3;
            colors[i3]     = bright * GLOW_COLOR_R;
            colors[i3 + 1] = bright * GLOW_COLOR_G;
            colors[i3 + 2] = bright * GLOW_COLOR_B;
          }
        }
      } else {
        // After drawn: multiple flowing pulses (flowAccum survives timeline end)
        edge.flowAccum += dt;

        for (let ring = 0; ring <= GLOW_TUBULAR; ring++) {
          const t = ring / GLOW_TUBULAR;
          let bright = 0;

          for (let pi = 0; pi < PULSE_COUNT; pi++) {
            const offset = pi / PULSE_COUNT;
            const pulsePos = (edge.flowAccum * PULSE_SPEED + offset) % 1;
            const dist = Math.abs(t - pulsePos);
            const wrapDist = Math.min(dist, 1 - dist); // wrap-around

            if (wrapDist < GLOW_TRAIL) {
              const b = Math.pow(1 - wrapDist / GLOW_TRAIL, 2) * GLOW_BRIGHT_FLOW;
              bright = Math.max(bright, b);
            }
          }

          for (let r = 0; r < GLOW_VERTS_PER_RING; r++) {
            const i3 = (ring * GLOW_VERTS_PER_RING + r) * 3;
            colors[i3]     = bright * GLOW_COLOR_R;
            colors[i3 + 1] = bright * GLOW_COLOR_G;
            colors[i3 + 2] = bright * GLOW_COLOR_B;
          }
        }
      }

      edge.glowGeo.attributes.color.needsUpdate = true;
    }
  }

  return { group, edges, update };
}
