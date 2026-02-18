/**
 * connections.js
 * Classical internet — faint grey great-circle arcs between ground nodes,
 * with small grey particles flowing along them.
 * All geometry lives inside globeGroup so it rotates with the globe.
 *
 * Two render groups with independent reveal timing:
 *   ontGroup  — only Waterloo↔Toronto↔Ottawa edges, visible from Beat 2
 *   allGroup  — all other edges, visible from Canada pullback (Beat 4)
 */

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { GLOBE_RADIUS } from './globe.js';

const LINE_COLOR     = new THREE.Color(0x3a5572);
const PARTICLE_COLOR = new THREE.Color(0x4e6a88);


const ARC_SEGMENTS        = 64;
const PARTICLES_PER_EDGE  = 3;
const PARTICLE_SIZE       = 0.002;
const PARTICLE_SPEED_BASE = 0.10; // traversals per second
const EDGE_MARGIN         = 0.00015; // tiny safety gap so lines stop exactly at node edge visually

// Waterloo=0, Toronto=1, Ottawa=2 in groundNodes (from globe.js GROUND_NODES order)
const ONTARIO_IDX = new Set([0, 1, 2]);

// ─── Great-circle arc ─────────────────────────────────────────────────────────
function arcPoints(a, b, segments = ARC_SEGMENTS, maxElevation = 1.002) {
  const dirA = a.clone().normalize();
  const dirB = b.clone().normalize();
  const pts  = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Parabolic elevation: flat at endpoints (1.0), peaks in the middle
    const lift = 4 * t * (1 - t); // 0 at t=0,1 — 1 at t=0.5
    const elevation = 1 + (maxElevation - 1) * lift;
    pts.push(
      new THREE.Vector3()
        .lerpVectors(dirA, dirB, t)
        .normalize()
        .multiplyScalar(GLOBE_RADIUS * elevation),
    );
  }
  return pts;
}

function toLinePositions(points) {
  const arr = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    arr[i * 3    ] = points[i].x;
    arr[i * 3 + 1] = points[i].y;
    arr[i * 3 + 2] = points[i].z;
  }
  return arr;
}

function nodeVisualRadius(node) {
  const baseR = node?.mesh?.geometry?.parameters?.radius ?? 0.0028;
  const scale = node?.mesh?.scale?.x ?? 1;
  return baseR * scale;
}

function snapArcEndpointsToNodeEdges(points, nodeA, nodeB) {
  if (points.length < 3) return points;

  const out = points.map(p => p.clone());
  const aCenter = nodeA.position;
  const bCenter = nodeB.position;
  const aRadius = nodeVisualRadius(nodeA) + EDGE_MARGIN;
  const bRadius = nodeVisualRadius(nodeB) + EDGE_MARGIN;

  // Surface normals at each node (radial direction on globe)
  const aNorm = aCenter.clone().normalize();
  const bNorm = bCenter.clone().normalize();

  // Snap to the SIDE facing the counterpart node by projecting
  // the direction onto the tangent plane (removes radial component).
  const aDir = bCenter.clone().sub(aCenter);
  aDir.addScaledVector(aNorm, -aDir.dot(aNorm));
  if (aDir.lengthSq() > 1e-12) {
    aDir.normalize();
    out[0].copy(aCenter).addScaledVector(aDir, aRadius);
  }

  const bDir = aCenter.clone().sub(bCenter);
  bDir.addScaledVector(bNorm, -bDir.dot(bNorm));
  if (bDir.lengthSq() > 1e-12) {
    bDir.normalize();
    out[out.length - 1].copy(bCenter).addScaledVector(bDir, bRadius);
  }

  return out;
}

// ─── Build sparse-mesh edges (nearest-neighbour, ~60% density) ───────────────
function buildEdges(groundNodes) {
  const used    = new Set();
  const edgeArr = [];

  for (let i = 0; i < groundNodes.length; i++) {
    const posA = groundNodes[i].position;

    const sorted = groundNodes
      .map((n, j) => ({ j, d: posA.distanceTo(n.position) }))
      .filter(x => x.j !== i)
      .sort((a, b) => a.d - b.d);

    const k = (i % 5 === 0) ? 3 : 2;
    for (let m = 0; m < k && m < sorted.length; m++) {
      const j   = sorted[m].j;
      const key = Math.min(i, j) + '_' + Math.max(i, j);
      if (!used.has(key)) {
        used.add(key);
        edgeArr.push([i, j]);
      }
    }
  }

  return edgeArr;
}

// ─── Particle system builder ──────────────────────────────────────────────────
function makeParticles(curveIndices) {
  const total = curveIndices.length * PARTICLES_PER_EDGE;
  const buf   = new Float32Array(total * 3);
  const geo   = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));

  const mat = new THREE.PointsMaterial({
    color:           PARTICLE_COLOR,
    size:            PARTICLE_SIZE,
    transparent:     true,
    opacity:         0,
    sizeAttenuation: true,
    depthWrite:      false,
  });

  const state = [];
  for (const ci of curveIndices) {
    for (let p = 0; p < PARTICLES_PER_EDGE; p++) {
      state.push({ ci, progress: p / PARTICLES_PER_EDGE, speed: PARTICLE_SPEED_BASE + Math.random() * 0.06 });
    }
  }

  return { pts: new THREE.Points(geo, mat), mat, geo, buf, state };
}

// ─── createClassicalConnections ───────────────────────────────────────────────
export function createClassicalConnections(globeGroup, groundNodes) {
  const ontGroup = new THREE.Group();
  const allGroup = new THREE.Group();
  globeGroup.add(ontGroup);
  globeGroup.add(allGroup);

  // Separate line materials so opacity can be driven independently
  const ontLineMat = new LineMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: 0,
    linewidth: 1, // pixels
    depthWrite: false,
  });
  ontLineMat.resolution.set(window.innerWidth, window.innerHeight);
  const allLineMat = new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 0, depthWrite: false });

  const edgeList  = buildEdges(groundNodes);
  const curves    = [];
  const isOntEdge = [];
  const ontDynamic = [];

  for (const [i, j] of edgeList) {
    const pts   = arcPoints(groundNodes[i].position, groundNodes[j].position);
    const curve = new THREE.CatmullRomCurve3(pts);
    curves.push(curve);

    const isOnt = ONTARIO_IDX.has(i) && ONTARIO_IDX.has(j);
    isOntEdge.push(isOnt);

    if (isOnt) {
      const geo = new LineGeometry();
      const posBuf = toLinePositions(pts);
      geo.setPositions(posBuf);
      const line = new Line2(geo, ontLineMat);
      line.computeLineDistances();
      ontGroup.add(line);
      ontDynamic.push({ i, j, curve, geo, posBuf });
    } else {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      allGroup.add(new THREE.Line(geo, allLineMat));
    }
  }

  // Particle systems — exclude Ontario edges from allCIs to avoid double particles
  const ontCIs = edgeList.map((_, ci) => ci).filter(ci =>  isOntEdge[ci]);
  const allCIs = edgeList.map((_, ci) => ci).filter(ci => !isOntEdge[ci]);

  const ontP = makeParticles(ontCIs);
  const allP = makeParticles(allCIs);
  ontGroup.add(ontP.pts);
  allGroup.add(allP.pts);

  const _pt = new THREE.Vector3();

  function updateOntarioEdgeGeometry() {
    for (const edge of ontDynamic) {
      const a = groundNodes[edge.i];
      const b = groundNodes[edge.j];

      // Rebuild arc from current node positions and snap endpoints to live node edges.
      const snapped = snapArcEndpointsToNodeEdges(arcPoints(a.position, b.position), a, b);

      // Update curve for particle system
      edge.curve.points = snapped;
      edge.curve.updateArcLengths();

      // Write snapped points directly to line buffer (no CatmullRom re-interpolation)
      for (let k = 0; k < snapped.length; k++) {
        edge.posBuf[k * 3    ] = snapped[k].x;
        edge.posBuf[k * 3 + 1] = snapped[k].y;
        edge.posBuf[k * 3 + 2] = snapped[k].z;
      }
      edge.geo.setPositions(edge.posBuf);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function update(_elapsed, dt, progress = 1) {
    // Ontario triangle: fades in during Beat 1→2 pullback (p=0.167→0.233, t=5–7s)
    const ontReveal = progress < 0.167
      ? 0
      : Math.min((progress - 0.167) / 0.066, 1.0);

    // Full network: only 3 Ontario nodes exist so allGroup is always empty — keep hidden.
    const allReveal = 0;

    // Fade out classical lines when cascade (better connection) starts drawing
    const CASCADE_START = 13.0;
    const cascadeFade = _elapsed > CASCADE_START
      ? Math.max(0, 1 - (_elapsed - CASCADE_START) / 0.6)
      : 1;

    ontLineMat.resolution.set(window.innerWidth, window.innerHeight);
    ontLineMat.opacity = 1.00 * ontReveal * cascadeFade;
    ontP.mat.opacity   = 0; // particles removed — lines only
    allLineMat.opacity = 0.35 * allReveal;
    allP.mat.opacity   = 0.45 * allReveal;

    ontGroup.visible = ontReveal > 0;
    allGroup.visible = allReveal > 0;

    if (ontReveal > 0) updateOntarioEdgeGeometry();

    if (ontReveal > 0) {
      for (let pi = 0; pi < ontP.state.length; pi++) {
        const ps = ontP.state[pi];
        ps.progress = (ps.progress + ps.speed * dt) % 1;
        curves[ps.ci].getPoint(ps.progress, _pt);
        ontP.buf[pi * 3    ] = _pt.x;
        ontP.buf[pi * 3 + 1] = _pt.y;
        ontP.buf[pi * 3 + 2] = _pt.z;
      }
      ontP.geo.attributes.position.needsUpdate = true;
    }

    if (allReveal > 0) {
      for (let pi = 0; pi < allP.state.length; pi++) {
        const ps = allP.state[pi];
        ps.progress = (ps.progress + ps.speed * dt) % 1;
        curves[ps.ci].getPoint(ps.progress, _pt);
        allP.buf[pi * 3    ] = _pt.x;
        allP.buf[pi * 3 + 1] = _pt.y;
        allP.buf[pi * 3 + 2] = _pt.z;
      }
      allP.geo.attributes.position.needsUpdate = true;
    }
  }

  return {
    group:   ontGroup,
    lineMat: ontLineMat,
    pMat:    ontP.mat,
    edgeList,
    curves,
    update,
  };
}
