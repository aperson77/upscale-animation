/**
 * connections.js
 * Classical telecom fiber — grey great-circle arcs between cluster HUBS,
 * with small grey particles flowing along them.
 * These represent existing infrastructure and stay visible permanently.
 */

import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';

const LINE_COLOR     = 0xa0aab9;
const LINE_OPACITY   = 0.25;
const PARTICLE_COLOR = 0xa0aab9;

const ARC_SEGMENTS       = 64;
const PARTICLES_PER_EDGE = 4;
const PARTICLE_RADIUS    = 0.002;
const PARTICLE_SPEED     = 0.08; // traversals per second
const ARC_BASE_LIFT      = 0.05; // base elevation above globe surface

// ─── Edge definitions ────────────────────────────────────────────────────────
// Edges connect cluster hubs by cluster name. revealT = when they become visible.
const EDGE_DEFS = [
  { from: 'Waterloo',    to: 'Ottawa',     revealT: 22   },
  { from: 'Ottawa',      to: 'Montréal',   revealT: 22   },
  { from: 'Waterloo',    to: 'Calgary',    revealT: 25   },
  { from: 'Calgary',     to: 'Vancouver',  revealT: 25   },
  { from: 'Yellowknife', to: 'Inuvik',     revealT: 28   },
];

// ─── Great-circle arc ────────────────────────────────────────────────────────
function arcPoints(a, b, segments = ARC_SEGMENTS) {
  const dirA = a.clone().normalize();
  const dirB = b.clone().normalize();

  // Longer arcs rise higher — compute angular distance
  const angDist = dirA.angleTo(dirB);
  const maxLift = ARC_BASE_LIFT + angDist * 0.12; // longer arcs get more lift

  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lift = 4 * t * (1 - t); // parabolic: 0 at endpoints, 1 at midpoint
    const r = GLOBE_RADIUS + ARC_BASE_LIFT + maxLift * lift;
    pts.push(
      new THREE.Vector3().lerpVectors(dirA, dirB, t).normalize().multiplyScalar(r),
    );
  }
  return pts;
}

// ─── createClassicalConnections ──────────────────────────────────────────────
export function createClassicalConnections(globeGroup, clusters) {
  const group = new THREE.Group();
  globeGroup.add(group);

  // Build a name→cluster lookup
  const clusterMap = {};
  for (const c of clusters) clusterMap[c.name] = c;

  const edges = [];
  const _pt = new THREE.Vector3();

  for (const def of EDGE_DEFS) {
    const cA = clusterMap[def.from];
    const cB = clusterMap[def.to];
    if (!cA || !cB) continue;

    const hubA = cA.hub.position;
    const hubB = cB.hub.position;
    const pts = arcPoints(hubA, hubB);
    const curve = new THREE.CatmullRomCurve3(pts);

    // ── Line mesh — TubeGeometry for smooth thin tube ─────────────────────
    const tubeGeo = new THREE.TubeGeometry(curve, ARC_SEGMENTS, 0.002, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color:       LINE_COLOR,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.visible = false;
    group.add(tubeMesh);

    // ── Flowing particles ─────────────────────────────────────────────────
    const particles = [];
    for (let p = 0; p < PARTICLES_PER_EDGE; p++) {
      const pMat = new THREE.MeshBasicMaterial({
        color:       PARTICLE_COLOR,
        transparent: true,
        opacity:     0,
      });
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(PARTICLE_RADIUS, 8, 6),
        pMat,
      );
      pMesh.visible = false;
      group.add(pMesh);
      particles.push({
        mesh: pMesh,
        mat:  pMat,
        progress: p / PARTICLES_PER_EDGE, // evenly spaced
        speed: PARTICLE_SPEED + (Math.random() - 0.5) * 0.02,
      });
    }

    edges.push({
      def,
      curve,
      tubeMesh,
      tubeMat,
      particles,
      revealT: def.revealT,
    });
  }

  // ── Update ──────────────────────────────────────────────────────────────
  const FADE_DUR = 1.5;

  function update(elapsed, dt) {
    for (const edge of edges) {
      const fade = Math.min(Math.max((elapsed - edge.revealT) / FADE_DUR, 0), 1);

      edge.tubeMesh.visible = fade > 0;
      edge.tubeMat.opacity = LINE_OPACITY * fade;

      for (const p of edge.particles) {
        p.mesh.visible = fade > 0;
        p.mat.opacity = 0.3 * fade;

        if (fade > 0) {
          p.progress = (p.progress + p.speed * dt) % 1;
          edge.curve.getPoint(p.progress, _pt);
          p.mesh.position.copy(_pt);
        }
      }
    }
  }

  return { group, edges, update };
}
