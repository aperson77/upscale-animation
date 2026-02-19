/**
 * camera.js — Keyframed camera path for the 35s animation.
 *
 * Staged zoom-out: intimate Waterloo → regional Ontario/Quebec → full Canada + Arctic.
 * Direct keyframe interpolation with cosine easing — smooth, no overshoot.
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

// Canada + Arctic
const ARCTIC_CENTER = latLonToVec3(60, -96, GLOBE_RADIUS);
const ARCTIC_DIR    = ARCTIC_CENTER.clone().normalize();

// ─── Helper ──────────────────────────────────────────────────────────────────
function camPos(dir, dist) {
  return dir.clone().normalize().multiplyScalar(dist);
}

// ─── Smooth cosine ease (no overshoot, C1 continuous) ────────────────────────
function cosineEase(t) {
  return (1 - Math.cos(t * Math.PI)) * 0.5;
}

// ─── FOV keyframes ──────────────────────────────────────────────────────────
const FOV_KF = [
  { t:  0,    fov: 24 },
  { t:  9.5,  fov: 24 },
  { t: 11,    fov: 32 },
  { t: 24.5,  fov: 32 },
  { t: 25.5,  fov: 28 },  // 3-location shot
  { t: 31,    fov: 28 },
  { t: 33,    fov: 14 },
  { t: 35,    fov: 14 },
];

function getFOV(elapsed) {
  if (elapsed <= FOV_KF[0].t) return FOV_KF[0].fov;
  if (elapsed >= FOV_KF[FOV_KF.length - 1].t) return FOV_KF[FOV_KF.length - 1].fov;

  for (let k = 0; k < FOV_KF.length - 1; k++) {
    if (elapsed >= FOV_KF[k].t && elapsed <= FOV_KF[k + 1].t) {
      const lo = FOV_KF[k];
      const hi = FOV_KF[k + 1];
      if (hi.t === lo.t) return lo.fov;
      const raw = (elapsed - lo.t) / (hi.t - lo.t);
      const t = cosineEase(raw);
      return lo.fov + (hi.fov - lo.fov) * t;
    }
  }
  return FOV_KF[FOV_KF.length - 1].fov;
}

// ─── Reusable vectors ────────────────────────────────────────────────────────
const _pos  = new THREE.Vector3();
const _look = new THREE.Vector3();

// ─── createCameraController ──────────────────────────────────────────────────
export function createCameraController(camera, heroNodePos, hubPos) {

  const heroDir  = heroNodePos.clone().normalize();
  const heroLook = heroNodePos.clone();
  const hubDir   = hubPos.clone().normalize();
  const hubLook  = hubPos.clone();

  // ── Keyframe table ──────────────────────────────────────────────────────
  const KF = [
    // Scene 1a: Single node close-up (0-9.5s)
    { t:  0,    pos: camPos(heroDir, 2.06),     look: heroLook.clone()       },
    { t:  9.5,  pos: camPos(heroDir, 2.06),     look: heroLook.clone()       },
    // Scene 1b: Pull back to reveal 3 Waterloo nodes (9.5-11s)
    { t: 11,    pos: camPos(hubDir, 2.08),      look: hubLook.clone()        },
    // Hold on Waterloo cluster (11-24.5s)
    { t: 24.5,  pos: camPos(hubDir, 2.08),      look: hubLook.clone()        },
    // Scene 2: Regional — 3 locations with Ottawa/Montreal interconnect (25.5-31s)
    { t: 25.5,  pos: camPos(REGIONAL_DIR, 2.6), look: REGIONAL_LOOK.clone()  },
    { t: 31,    pos: camPos(REGIONAL_DIR, 2.6), look: REGIONAL_LOOK.clone()  },
    // Scene 3: Pull-out to full globe (31-33s), hold for Arctic cascade (33-35s)
    { t: 33,    pos: camPos(ARCTIC_DIR, 6.0),   look: ARCTIC_CENTER.clone()  },
    { t: 35,    pos: camPos(ARCTIC_DIR, 6.0),   look: ARCTIC_CENTER.clone()  },
  ];

  // ── Direct keyframe interpolation ─────────────────────────────────────────
  function update(elapsedSec) {
    const elapsed = Math.max(0, elapsedSec);

    // Find keyframe pair
    let lo = KF[0];
    let hi = KF[KF.length - 1];
    for (let k = 0; k < KF.length - 1; k++) {
      if (elapsed >= KF[k].t && elapsed <= KF[k + 1].t) {
        lo = KF[k];
        hi = KF[k + 1];
        break;
      }
    }

    // Cosine-eased interpolation (smooth in/out, no overshoot)
    let t = 0;
    if (hi.t !== lo.t) {
      const raw = (elapsed - lo.t) / (hi.t - lo.t);
      t = cosineEase(raw);
    }

    // Spherical-style interpolation: blend directions, blend radii
    const rA = lo.pos.length();
    const rB = hi.pos.length();
    const r = rA + (rB - rA) * t;
    _pos.lerpVectors(lo.pos, hi.pos, t).normalize().multiplyScalar(r);

    // LookAt: same spherical blend
    const lrA = lo.look.length();
    const lrB = hi.look.length();
    const lr = lrA + (lrB - lrA) * t;
    _look.lerpVectors(lo.look, hi.look, t).normalize().multiplyScalar(lr);

    camera.fov = getFOV(elapsed);
    camera.updateProjectionMatrix();
    camera.position.copy(_pos);
    camera.lookAt(_look);
  }

  return { update };
}
