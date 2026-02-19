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
const TUBE_RADIUS    = 0.0008;
const ARC_BASE_LIFT  = 0.05;

// ─── Glow overlay ───────────────────────────────────────────────────────────
const GLOW_TUBULAR        = 64;
const GLOW_RADIAL         = 6;
const GLOW_VERTS_PER_RING = GLOW_RADIAL + 1;
const GLOW_TRAIL          = 0.10;   // length of the bright pulse head
const GLOW_BRIGHT_DRAW    = 6.0;    // brightness during draw phase
const GLOW_BRIGHT_FLOW    = 4.0;    // brightness for flowing pulses
const DRAW_SPEED          = 0.8;    // seconds to draw the full arc
const PULSE_SPEED         = 0.20;   // traversals per second for flowing pulses
const PULSE_COUNT         = 2;      // number of flowing pulses per edge

// ─── Edge definitions ──────────────────────────────────────────────────────
const EDGE_DEFS = [
  { from: 'Waterloo',    to: 'Ottawa',     revealT: 28.5 },
  { from: 'Ottawa',      to: 'Montréal',   revealT: 28.5 },
  { from: 'Waterloo',    to: 'Calgary',    revealT: 33.5 },
  { from: 'Calgary',     to: 'Vancouver',  revealT: 33.5 },
  { from: 'Yellowknife', to: 'Inuvik',     revealT: 33.5 },
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

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

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
    const curve = new THREE.CatmullRomCurve3(pts);

    // ── Base tube ───────────────────────────────────────────────────────
    const tubeGeo = new THREE.TubeGeometry(curve, ARC_SEGMENTS, TUBE_RADIUS, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color:       TUBE_COLOR,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.visible = false;
    group.add(tubeMesh);

    const totalIndices = tubeGeo.index
      ? tubeGeo.index.count
      : tubeGeo.attributes.position.count;

    // ── Glow overlay tube — per-vertex colored light pulses ─────────────
    const glowGeo = new THREE.TubeGeometry(curve, GLOW_TUBULAR, TUBE_RADIUS * 1.2, GLOW_RADIAL, false);
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
      def, curve,
      tubeMesh, tubeMat, tubeGeo, totalIndices,
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

      // ── Draw phase: tube extends along arc ─────────────────────────
      const drawT = Math.min(age / DRAW_SPEED, 1);
      const drawE = easeOutCubic(drawT);

      edge.tubeMesh.visible = true;
      edge.tubeMat.opacity  = TUBE_OPACITY;

      if (edge.tubeGeo.index) {
        edge.tubeGeo.index.count = Math.floor(drawE * edge.totalIndices);
      } else {
        edge.tubeGeo.setDrawRange(0, Math.floor(drawE * edge.totalIndices));
      }

      if (drawT >= 1 && !edge.drawn) {
        edge.drawn  = true;
        edge.drawnT = elapsed;
      }

      // ── Glow: traveling light ──────────────────────────────────────
      edge.glowMesh.visible = true;
      const colors = edge.glowColors;

      if (!edge.drawn) {
        // During draw: single bright head at the draw front
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
