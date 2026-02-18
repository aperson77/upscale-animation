/**
 * quantum_fail.js
 * Act 2 — quantum signals travel classical arcs but lose coherence en route.
 * The dot dims and shrinks as it travels, then scatters into quiet dissolution.
 * All geometry lives inside globeGroup so it rotates with the globe.
 */

import * as THREE from 'three';

const Q_COLOR = new THREE.Color(0x1a85ff); // quantum blue

const TRAVEL_SPEED = 0.011; // world-units / sec so every route moves at the same speed
const SCATTER_DUR = 0.20; // shorter dissolution so next failure starts sooner
const N_SCATTER   = 6;    // tiny dissolution fragments
const FIRST_START = 8.0;  // first failure begins during Beat 2
const NEXT_GAP    = 0.05; // minimal pause before the second failure begins

const ROUTES = [
  { from: 'Waterloo', to: 'Toronto', failProg: 0.82 },
  { from: 'Waterloo', to: 'Ottawa',  failProg: 0.33 },
];

function curveLength(curve) {
  const samples = curve.getPoints(96);
  let len = 0;
  for (let i = 1; i < samples.length; i++) len += samples[i - 1].distanceTo(samples[i]);
  return len;
}

function findRoute(curves, edgeList, groundNodes, fromName, toName) {
  const idxByName = new Map(groundNodes.map((n, i) => [n.name, i]));
  const fromIdx = idxByName.get(fromName);
  const toIdx   = idxByName.get(toName);
  if (fromIdx == null || toIdx == null) return null;

  for (let ci = 0; ci < edgeList.length; ci++) {
    const [a, b] = edgeList[ci];
    if (a === fromIdx && b === toIdx) return { curve: curves[ci], reverse: false };
    if (a === toIdx && b === fromIdx) return { curve: curves[ci], reverse: true };
  }
  return null;
}

export function createQuantumFailures(globeGroup, curves, edgeList, groundNodes) {
  const routeData = ROUTES
    .map((route) => {
      const found = findRoute(curves, edgeList, groundNodes, route.from, route.to);
      if (!found) return null;
      return { ...found, failProg: route.failProg };
    })
    .filter(Boolean);

  // ── Shared traveling dot ────────────────────────────────────────────────────
  const travelMat = new THREE.MeshStandardMaterial({
    color:             Q_COLOR,
    emissive:          Q_COLOR,
    emissiveIntensity: 4.0,
    transparent:       true,
    opacity:           1.0,
  });
  const travelDot = new THREE.Mesh(new THREE.SphereGeometry(0.0008, 8, 6), travelMat);
  travelDot.visible = false;
  globeGroup.add(travelDot);

  // ── Per-failure objects ─────────────────────────────────────────────────────
  const failures = routeData.map((route) => {
    const travelDur = Math.max((curveLength(route.curve) * route.failProg) / TRAVEL_SPEED, 1.0);

    // Scatter cloud — a handful of tiny fragments at the point of dissolution
    const scatBuf = new Float32Array(N_SCATTER * 3);
    const scatGeo = new THREE.BufferGeometry();
    scatGeo.setAttribute('position', new THREE.BufferAttribute(scatBuf, 3));
    const scatMat = new THREE.PointsMaterial({
      color:           Q_COLOR,
      size:            0.0012,
      sizeAttenuation: true,
      transparent:     true,
      opacity:         0,
      depthWrite:      false,
    });
    globeGroup.add(new THREE.Points(scatGeo, scatMat));

    const scatPos = Array.from({ length: N_SCATTER }, () => new THREE.Vector3());
    const scatVel = Array.from({ length: N_SCATTER }, () => new THREE.Vector3());

    return {
      curve: route.curve,
      reverse: route.reverse,
      failProg: route.failProg,
      travelDur,
      phase: 'waiting',
      phaseT: 0,
      scatBuf, scatGeo, scatMat, scatPos, scatVel,
    };
  });

  const _pt = new THREE.Vector3();
  let activeIdx = -1;
  let nextStartAt = FIRST_START;
  let nextIdxToStart = 0;

  function startFailure(idx) {
    if (idx < 0 || idx >= failures.length) return;
    failures[idx].phase = 'traveling';
    failures[idx].phaseT = 0;
    activeIdx = idx;
  }

  function update(t, dt) {
    if (t < 6 || t > 30 || failures.length === 0) { travelDot.visible = false; return; }

    travelDot.visible = false;

    // Start first (and then second) failure in strict sequence.
    if (activeIdx === -1 && nextIdxToStart < failures.length && t >= nextStartAt) {
      startFailure(nextIdxToStart);
      nextIdxToStart += 1;
    }

    const f = activeIdx >= 0 ? failures[activeIdx] : null;
    if (!f) return;

    f.phaseT += dt;

    // ── Traveling — dims and shrinks the whole way ───────────────────────────
    if (f.phase === 'traveling') {
      const prog = Math.min(f.phaseT / f.travelDur, 1);
      const u = prog * f.failProg;
      f.curve.getPoint(f.reverse ? 1 - u : u, _pt);
      travelDot.position.copy(_pt);

      // Signal degrades as it travels: fades to ~15% opacity, shrinks to ~30% size
      travelMat.opacity = 1.0 - prog * 0.85;
      travelDot.scale.setScalar(1.0 - prog * 0.70);
      travelDot.visible = true;

      if (prog >= 1) {
        // Seed scatter at the point where signal gave up
        for (let i = 0; i < N_SCATTER; i++) {
          f.scatPos[i].copy(_pt);
          f.scatVel[i].set(
            (Math.random() - 0.5) * 0.005,
            (Math.random() - 0.5) * 0.005,
            (Math.random() - 0.5) * 0.005,
          );
        }
        f.scatMat.opacity = 0.55;
        f.phase  = 'scattering';
        f.phaseT = 0;
      }
      return;
    }

    // ── Scattering — quiet dissolution ───────────────────────────────────────
    if (f.phase === 'scattering') {
      const prog = f.phaseT / SCATTER_DUR;

      for (let i = 0; i < N_SCATTER; i++) {
        f.scatPos[i].addScaledVector(f.scatVel[i], dt);
        f.scatBuf[i * 3    ] = f.scatPos[i].x;
        f.scatBuf[i * 3 + 1] = f.scatPos[i].y;
        f.scatBuf[i * 3 + 2] = f.scatPos[i].z;
      }
      f.scatGeo.attributes.position.needsUpdate = true;
      f.scatMat.opacity = Math.max(0, 1 - prog) * 0.55;

      if (prog >= 1) {
        f.scatMat.opacity = 0;
        f.phase = 'done';
        if (nextIdxToStart < failures.length) {
          nextStartAt = t + NEXT_GAP;
        }
        activeIdx = -1;
      }
    }
  }

  return { update };
}
