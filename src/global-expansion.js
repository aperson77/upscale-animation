/**
 * global-expansion.js
 * Intercontinental blue arcs that grow during the global expansion phase (59-66s).
 * Uses CubicBezierCurve3 tubes with camera-facing culling — only arcs visible
 * to the camera are rendered.
 */

import * as THREE from 'three';

// ─── Colors ──────────────────────────────────────────────────────────────────
const TUBE_COLOR    = 0x4488cc;
const TUBE_OPACITY  = 0.28;
const DRAW_SPEED    = 0.8;

// ─── Geometry ─────────────────────────────────────────────────────────────────
const TUBE_RADIUS    = 0.0018;   // thicker than Canadian arcs for visibility at distance
const TUBE_SEGMENTS  = 32;
const ARC_BASE_LIFT  = 0.04;

// ─── Intercontinental edge definitions ────────────────────────────────────────
const EDGE_DEFS = [
  // Wave A (t=60.0) — Americas + transatlantic
  { from: 'Waterloo',       to: 'Washington DC',  revealT: 60.0 },
  { from: 'Washington DC',  to: 'New York',       revealT: 60.0 },
  { from: 'New York',       to: 'London',         revealT: 60.5 },
  { from: 'Bogota',         to: 'Sao Paulo',      revealT: 60.5 },
  { from: 'Mexico City',    to: 'Bogota',         revealT: 60.3 },
  { from: 'Lima',           to: 'Mexico City',    revealT: 60.7 },
  // Wave B (t=62.5) — Europe/Africa/Asia links
  { from: 'London',         to: 'Paris',          revealT: 62.5 },
  { from: 'Paris',          to: 'Berlin',         revealT: 62.5 },
  { from: 'London',         to: 'Stockholm',      revealT: 62.7 },
  { from: 'Madrid',         to: 'Paris',          revealT: 62.6 },
  { from: 'Rome',           to: 'Cairo',          revealT: 62.7 },
  { from: 'Cairo',          to: 'Nairobi',        revealT: 62.9 },
  { from: 'Lagos',          to: 'Nairobi',        revealT: 62.8 },
  { from: 'Berlin',         to: 'Moscow',         revealT: 62.9 },
  { from: 'Riyadh',         to: 'Cairo',          revealT: 63.0 },
  { from: 'Riyadh',         to: 'Mumbai',         revealT: 63.1 },
  { from: 'New Delhi',      to: 'Mumbai',         revealT: 63.1 },
  // Wave C (t=64.5) — Asia-Pacific mesh
  { from: 'Mumbai',         to: 'Singapore',      revealT: 64.5 },
  { from: 'Singapore',      to: 'Bangkok',        revealT: 64.5 },
  { from: 'Singapore',      to: 'Jakarta',        revealT: 64.6 },
  { from: 'Beijing',        to: 'Tokyo',          revealT: 64.7 },
  { from: 'Tokyo',          to: 'Seoul',          revealT: 64.7 },
  { from: 'Shanghai',       to: 'Singapore',      revealT: 64.9 },
  { from: 'Tokyo',          to: 'Sydney',         revealT: 64.9 },
  { from: 'Sydney',         to: 'Melbourne',      revealT: 64.8 },
  { from: 'Sao Paulo',      to: 'Buenos Aires',   revealT: 65.1 },
  { from: 'Santiago',       to: 'Buenos Aires',   revealT: 65.0 },
  { from: 'Santiago',       to: 'Lima',           revealT: 65.1 },
  { from: 'Moscow',         to: 'Beijing',        revealT: 65.1 },
];

// ─── Clean bezier arc between two surface points ────────────────────────────
function buildGlobeArc(a, b) {
  const dirA = a.clone().normalize();
  const dirB = b.clone().normalize();
  const angDist = dirA.angleTo(dirB);
  const lift = ARC_BASE_LIFT + angDist * 0.10;

  // Control points along the straight line, pushed radially outward
  const cpA = a.clone().lerp(b, 0.33);
  const rA = cpA.length();
  cpA.normalize().multiplyScalar(rA + lift);
  const cpB = a.clone().lerp(b, 0.67);
  const rB = cpB.length();
  cpB.normalize().multiplyScalar(rB + lift);

  return new THREE.CubicBezierCurve3(a.clone(), cpA, cpB, b.clone());
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

// ─── Reusable vectors ────────────────────────────────────────────────────────
const _camLocal = new THREE.Vector3();

// ─── createGlobalExpansion ────────────────────────────────────────────────────
export function createGlobalExpansion(globeGroup, clusters) {
  const group = new THREE.Group();
  globeGroup.add(group);

  const clusterMap = {};
  for (const c of clusters) clusterMap[c.name] = c;

  let edges = null;
  let initialized = false;

  function init() {
    edges = [];

    for (const def of EDGE_DEFS) {
      const cA = clusterMap[def.from];
      const cB = clusterMap[def.to];
      if (!cA || !cB) continue;

      const hubA = cA.hub.position;
      const hubB = cB.hub.position;
      const curve = buildGlobeArc(hubA, hubB);

      // Midpoint direction for camera-facing check
      const midDir = hubA.clone().add(hubB).normalize();

      const tubeGeo = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, TUBE_RADIUS, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: TUBE_COLOR, transparent: true, opacity: 0, depthWrite: false,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.visible = false;
      group.add(tubeMesh);

      edges.push({
        def, tubeMesh, tubeMat, midDir,
        revealT: def.revealT,
        drawn: false,
      });
    }
    initialized = true;
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function update(elapsed, dt, camera) {
    if (elapsed < 59.0) return;
    if (!initialized) init();

    // Camera direction in globeGroup's local space for facing check
    _camLocal.copy(camera.position);
    globeGroup.worldToLocal(_camLocal);
    const camDir = _camLocal.normalize();

    for (const edge of edges) {
      if (elapsed < edge.revealT) continue;

      // Camera-facing culling — skip arcs on the far side of the globe
      const facing = edge.midDir.dot(camDir);
      if (facing < -0.1) {
        edge.tubeMesh.visible = false;
        continue;
      }

      const age = elapsed - edge.revealT;
      const drawT = Math.min(age / DRAW_SPEED, 1);
      const drawE = easeOutCubic(drawT);

      // Fade opacity for arcs near the limb (facing 0 to 0.3)
      const limbFade = facing < 0.3 ? (facing + 0.1) / 0.4 : 1.0;

      edge.tubeMesh.visible = true;
      edge.tubeMat.opacity  = drawE * TUBE_OPACITY * Math.max(0, limbFade);

      if (drawT >= 1 && !edge.drawn) {
        edge.drawn = true;
      }
    }
  }

  return { group, update };
}
