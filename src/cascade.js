/**
 * cascade.js — Act 3 cascade.
 * Quantum connections light up the Ontario triangle: Waterloo → Toronto,
 * Waterloo → Ottawa, then Toronto ↔ Ottawa closes the triangle.
 * Connected nodes shift from blue → copper-gold over ~2 s.
 *
 * Wave pairs: [fromName, toName]
 */

import * as THREE from 'three';
import { Line2 }        from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial }  from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry }  from 'three/examples/jsm/lines/LineGeometry.js';
import { GLOBE_RADIUS } from './globe.js';

const Q_COPPER = new THREE.Color(0xd4a04a);

const ARC_SEGS  = 64;
const ARC_DRAW_SPEED = 0.08; // world-units per second so all arcs draw at consistent speed
const CASCADE_START = 21; // seconds — Ontario triangle cascade starts after Waterloo interconnect fires
const EDGE_MARGIN = 0.00015;

// Great-circle arc matching classical connections: flat at endpoints, parabolic
// lift in the middle so lines look straight from the telephoto camera view.
function qArcPoints(a, b, maxElevation = 1.002) {
  const dA  = a.clone().normalize();
  const dB  = b.clone().normalize();
  const pts = [];
  for (let i = 0; i <= ARC_SEGS; i++) {
    const t    = i / ARC_SEGS;
    const lift = 4 * t * (1 - t); // 0 at endpoints, 1 at midpoint
    const elevation = 1 + (maxElevation - 1) * lift;
    pts.push(
      new THREE.Vector3()
        .lerpVectors(dA, dB, t)
        .normalize()
        .multiplyScalar(GLOBE_RADIUS * elevation),
    );
  }
  return pts;
}

function nodeVisualRadius(node) {
  const baseR = node?.mesh?.geometry?.parameters?.radius ?? 0.0028;
  const scale = node?.mesh?.scale?.x ?? 1;
  return baseR * scale;
}

function snapArcEndpointsToNodeEdges(points, fromNode, toNode) {
  if (points.length < 3) return points;

  const out = points.map(p => p.clone());
  const aCenter = fromNode.position;
  const bCenter = toNode.position;
  const aRadius = nodeVisualRadius(fromNode) + EDGE_MARGIN;
  const bRadius = nodeVisualRadius(toNode) + EDGE_MARGIN;

  // Project onto tangent plane so lines snap to the SIDE of nodes
  const aNorm = aCenter.clone().normalize();
  const bNorm = bCenter.clone().normalize();

  const aDir = bCenter.clone().sub(aCenter);
  aDir.addScaledVector(aNorm, -aDir.dot(aNorm));
  if (aDir.lengthSq() > 1e-12) out[0].copy(aCenter).addScaledVector(aDir.normalize(), aRadius);

  const bDir = aCenter.clone().sub(bCenter);
  bDir.addScaledVector(bNorm, -bDir.dot(bNorm));
  if (bDir.lengthSq() > 1e-12) out[out.length - 1].copy(bCenter).addScaledVector(bDir.normalize(), bRadius);
  return out;
}

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += points[i - 1].distanceTo(points[i]);
  }
  return len;
}

// Cascade wave schedule: t = seconds after CASCADE_START (t=13s)
const WAVES = [
  { t: 0.5, pairs: [
    ['Waterloo', 'Toronto'],
  ]},
  { t: 1.0, pairs: [
    ['Waterloo', 'Ottawa'],
  ]},
  { t: 1.6, pairs: [               // close the triangle
    ['Toronto', 'Ottawa'],
  ]},
];

export function createCascade(globeGroup, nodes) {
  const nodeByName = new Map(nodes.map(n => [n.name, n]));

  // Flat list of arc descriptors — geometry built lazily when wave fires
  const arcDescs = [];
  for (const wave of WAVES) {
    for (const pair of wave.pairs) {
      const [fromName, toName] = pair;
      const fromNode = nodeByName.get(fromName);
      const toNode   = nodeByName.get(toName);
      if (!fromNode || !toNode) continue;
      arcDescs.push({
        waveT: wave.t,
        fromNode, toNode,
        phase: 'waiting',
        drawT: 0,
        drawDur: 1.0,
        built: false,
        line: null, drawGeo: null, drawMat: null,
      });
    }
  }

  function buildArc(arc) {
    const pts = snapArcEndpointsToNodeEdges(
      qArcPoints(arc.fromNode.position, arc.toNode.position),
      arc.fromNode,
      arc.toNode,
    );
    const positions = new Float32Array((ARC_SEGS + 1) * 3);
    for (let i = 0; i <= ARC_SEGS; i++) {
      positions[i * 3    ] = pts[i].x;
      positions[i * 3 + 1] = pts[i].y;
      positions[i * 3 + 2] = pts[i].z;
    }

    // Single thick Line2 — no glow overlay
    const geo = new LineGeometry();
    geo.setPositions(positions);
    const mat = new LineMaterial({
      color:       Q_COPPER,
      transparent: true,
      opacity:     0.92,
      linewidth:   3, // pixels — visibly thicker than classical connections
      depthWrite:  false,
    });
    mat.resolution.set(window.innerWidth, window.innerHeight);
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    geo.instanceCount = 0;
    globeGroup.add(line);

    arc.drawGeo = geo;
    arc.drawMat = mat;
    arc.line    = line;
    arc.drawDur = Math.max(pathLength(pts) / ARC_DRAW_SPEED, 1.0);
    arc.built   = true;
  }

  function update(t, dt) {
    if (t < CASCADE_START - 0.2 || t > 30) return;

    const cascadeT = t - CASCADE_START;

    for (const arc of arcDescs) {
      if (arc.phase === 'waiting') {
        if (cascadeT >= arc.waveT) {
          if (!arc.built) buildArc(arc);
          arc.phase = 'drawing';
          arc.drawT = 0;
          arc.fromNode.cascadeConnected = true;
        }
        continue;
      }

      if (arc.phase === 'drawing') {
        arc.drawT += dt;
        arc.drawMat.resolution.set(window.innerWidth, window.innerHeight);
        const prog         = Math.min(arc.drawT / arc.drawDur, 1);
        const segmentCount = Math.max(1, Math.round(prog * ARC_SEGS));
        arc.drawGeo.instanceCount = segmentCount;

        if (prog >= 1) {
          arc.phase = 'done';
          arc.toNode.cascadeConnected = true;
        }
        continue;
      }
    }

    // Shift connected node emissive color toward copper
    for (const node of nodes) {
      if (!node.cascadeConnected) continue;
      node.cascadeColor.lerp(Q_COPPER, dt * 0.55);
      node.mat.emissive.copy(node.cascadeColor);
    }
  }

  return { update };
}
