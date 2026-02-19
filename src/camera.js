/**
 * camera.js — Keyframed camera path for the 30s animation.
 *
 * Staged zoom-out: intimate Waterloo → regional Ontario/Quebec → national Canada → Arctic.
 * Uses CatmullRomCurve3 splines for buttery smooth position + lookAt interpolation.
 * Slow rotation in the final hold (25-30s).
 */

import * as THREE from 'three';
import { GLOBE_RADIUS, latLonToVec3 } from './globe.js';

// ─── Key geographic positions ────────────────────────────────────────────────
const WATERLOO = latLonToVec3(43.46, -80.52, GLOBE_RADIUS);
const OTTAWA   = latLonToVec3(45.42, -75.69, GLOBE_RADIUS);
const MONTREAL = latLonToVec3(45.50, -73.57, GLOBE_RADIUS);

// Ontario/Quebec midpoint
const REGIONAL_LOOK = WATERLOO.clone().add(OTTAWA).add(MONTREAL).multiplyScalar(1 / 3);
const REGIONAL_DIR  = REGIONAL_LOOK.clone().normalize();

// Canada center
const CANADA_CENTER = latLonToVec3(56, -96, GLOBE_RADIUS);
const CANADA_DIR    = CANADA_CENTER.clone().normalize();

// Canada + Arctic
const ARCTIC_CENTER = latLonToVec3(60, -96, GLOBE_RADIUS);
const ARCTIC_DIR    = ARCTIC_CENTER.clone().normalize();

// ─── Helper ──────────────────────────────────────────────────────────────────
function camPos(dir, dist) {
  return dir.clone().normalize().multiplyScalar(dist);
}

// ─── Build spline curves from keyframes ──────────────────────────────────────
function buildTimedSpline(keyframes, accessor) {
  const SAMPLES = 300;
  const points = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const elapsed = (i / SAMPLES) * 30;

    let lo = keyframes[0];
    let hi = keyframes[keyframes.length - 1];
    for (let k = 0; k < keyframes.length - 1; k++) {
      if (elapsed >= keyframes[k].t && elapsed <= keyframes[k + 1].t) {
        lo = keyframes[k];
        hi = keyframes[k + 1];
        break;
      }
    }

    let t = 0;
    if (hi.t !== lo.t) {
      const raw = (elapsed - lo.t) / (hi.t - lo.t);
      t = raw < 0.5
        ? 16 * raw * raw * raw * raw * raw
        : 1 - Math.pow(-2 * raw + 2, 5) / 2;
    }

    const a = accessor(lo);
    const b = accessor(hi);
    const rA = a.length();
    const rB = b.length();
    const r = rA + (rB - rA) * t;
    const dir = new THREE.Vector3().lerpVectors(
      a.clone().normalize(),
      b.clone().normalize(),
      t,
    ).normalize().multiplyScalar(r);

    points.push(dir);
  }

  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.25);
}

// ─── FOV spline (smooth) ────────────────────────────────────────────────────
function getFOV(elapsed) {
  if (elapsed <= 9.5) return 24;
  if (elapsed <= 11) {
    // Transition: Single node → 3-node view (9.5-11s)
    const raw = (elapsed - 9.5) / 1.5;
    const t = raw < 0.5 ? 16 * raw ** 5 : 1 - Math.pow(-2 * raw + 2, 5) / 2;
    return 24 + (32 - 24) * t;
  }
  if (elapsed <= 20.5) return 32;
  if (elapsed <= 22) {
    // Transition: Waterloo 3-node → Regional (20.5-22s)
    const raw = (elapsed - 20.5) / 1.5;
    const t = raw < 0.5 ? 16 * raw ** 5 : 1 - Math.pow(-2 * raw + 2, 5) / 2;
    return 32 + (25 - 32) * t;
  }
  if (elapsed <= 23.5) return 25;
  if (elapsed <= 25) {
    // Transition: Regional → National (23.5-25s)
    const raw = (elapsed - 23.5) / 1.5;
    const t = raw < 0.5 ? 16 * raw ** 5 : 1 - Math.pow(-2 * raw + 2, 5) / 2;
    return 25 + (16 - 25) * t;
  }
  if (elapsed <= 26.5) return 16;
  if (elapsed <= 28) {
    // Transition: National → Full view (26.5-28s)
    const raw = (elapsed - 26.5) / 1.5;
    const t = raw < 0.5 ? 16 * raw ** 5 : 1 - Math.pow(-2 * raw + 2, 5) / 2;
    return 16 + (14 - 16) * t;
  }
  return 14;
}

// ─── Reusable vectors ────────────────────────────────────────────────────────
const _pos  = new THREE.Vector3();
const _look = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();

// ─── createCameraController ──────────────────────────────────────────────────
// heroNodePos: the actual world position of the hero node (Vector3)
// hubPos: the Waterloo hub position — center of 3-node view (Vector3)
export function createCameraController(camera, heroNodePos, hubPos) {

  // Use the hero node's real position for Scene 1 targeting
  const heroDir  = heroNodePos.clone().normalize();
  const heroLook = heroNodePos.clone();

  // Hub is the center of the 3-node cluster
  const hubDir  = hubPos.clone().normalize();
  const hubLook = hubPos.clone();

  // ── Keyframe table ──────────────────────────────────────────────────────
  const KF = [
    // Scene 1a: Single node close-up (0-9.5s) — hero node fills frame
    { t:  0,   pos: camPos(heroDir, 2.06),     look: heroLook.clone()       },
    { t:  9.5, pos: camPos(heroDir, 2.06),     look: heroLook.clone()       },
    // Scene 1b: Pull back to reveal 3 Waterloo nodes (9.5-11s) — center on hub
    { t: 11,   pos: camPos(hubDir, 2.08),      look: hubLook.clone()        },
    // Hold on Waterloo cluster through grey lines, failed pulse, interconnect (11-20.5s)
    { t: 20.5, pos: camPos(hubDir, 2.08),      look: hubLook.clone()        },
    // Scene 2: Regional Ontario/Quebec (22-23.5s) — HOLD steady
    { t: 22,   pos: camPos(REGIONAL_DIR, 2.5), look: REGIONAL_LOOK.clone()  },
    { t: 23.5, pos: camPos(REGIONAL_DIR, 2.5), look: REGIONAL_LOOK.clone()  },
    // Scene 3: National Canada (25-26.5s) — HOLD steady
    { t: 25,   pos: camPos(CANADA_DIR, 5.0),   look: CANADA_CENTER.clone()  },
    { t: 26.5, pos: camPos(CANADA_DIR, 5.0),   look: CANADA_CENTER.clone()  },
    // Scene 4: Full view + Arctic (28-30s) — HOLD steady
    { t: 28,   pos: camPos(ARCTIC_DIR, 6.0),   look: ARCTIC_CENTER.clone()  },
    { t: 29,   pos: camPos(ARCTIC_DIR, 6.0),   look: ARCTIC_CENTER.clone()  },
    { t: 30,   pos: camPos(ARCTIC_DIR, 6.0),   look: ARCTIC_CENTER.clone()  },
  ];

  const posCurve  = buildTimedSpline(KF, kf => kf.pos);
  const lookCurve = buildTimedSpline(KF, kf => kf.look);

  function update(progress) {
    const p = Math.max(0, Math.min(1, progress));

    posCurve.getPoint(p, _pos);
    lookCurve.getPoint(p, _look);

    // Slow rotation in final hold (28-30s): ~5° total
    const elapsed = p * 30;
    if (elapsed > 28) {
      const rotT = (elapsed - 28) / 2;
      const angle = rotT * (5 * Math.PI / 180);
      _axis.copy(ARCTIC_DIR).normalize();
      _quat.setFromAxisAngle(_axis, angle);
      _pos.applyQuaternion(_quat);
    }

    camera.fov = getFOV(elapsed);
    camera.updateProjectionMatrix();
    camera.position.copy(_pos);
    camera.lookAt(_look);
  }

  return { update };
}
