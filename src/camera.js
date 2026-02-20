/**
 * camera.js — Keyframed camera path for the 60s animation.
 *
 * 4-shot structure after Beat 4:
 *   Shot 1 (25.5-33s): Southern Canada — Van/Cal/Waterloo/Ottawa/Montreal
 *   Shot 2 (35-43s):   Whole Canada — all ground clusters
 *   Shot 3 (45-50s):   Satellite — dedicated satellite connection
 *   Shot 4 (52-60s):   Global — rotating globe, orbiting satellite
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

// Full globe — camera looks slightly south so satellite is clearly above the limb
const GLOBE_CENTER = latLonToVec3(48, -92, GLOBE_RADIUS);
const GLOBE_DIR    = GLOBE_CENTER.clone().normalize();

// Canada-wide — centered to balance all 11 ground clusters (Waterloo→Alert)
const CANADA_WIDE     = latLonToVec3(55, -97, GLOBE_RADIUS);
const CANADA_WIDE_DIR = CANADA_WIDE.clone().normalize();

// Southern Canada — midpoint of all 5 southern cities (Van, Cal, Wat, Ott, Mtl)
const SOUTHERN_LOOK = latLonToVec3(47, -95, GLOBE_RADIUS);
const SOUTHERN_DIR  = SOUTHERN_LOOK.clone().normalize();

// Satellite view — look near satellite altitude so it's centered in frame.
// Camera from south-east at distance 6 — both satellite (upper frame) and
// ground stations (lower frame) fit within FOV 36°.
const SAT_LOOK    = latLonToVec3(55, -100, 3.2);  // just below satellite orbit altitude
const SAT_CAM_DIR = latLonToVec3(30, -80, GLOBE_RADIUS).clone().normalize();

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
  { t: 25.5,  fov: 18 },   // Shot 1a — tight 3-location (Wat/Ott/Mtl)
  { t: 29,    fov: 18 },   // hold tight through connections
  { t: 31,    fov: 28 },   // Shot 1b — pull back to all 5 southern cities
  { t: 33,    fov: 28 },
  { t: 35,    fov: 35 },   // Shot 2 — all Canada clusters
  { t: 43,    fov: 35 },
  { t: 45,    fov: 36 },   // Shot 3 — satellite (wider to capture ground + orbit)
  { t: 50,    fov: 36 },
  { t: 52,    fov: 36 },   // Shot 4 — global rotating view
  { t: 60,    fov: 36 },
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
    { t:  0,    pos: camPos(heroDir, 2.06),         look: heroLook.clone()          },
    { t:  9.5,  pos: camPos(heroDir, 2.06),         look: heroLook.clone()          },
    // Scene 1b: Pull back to reveal 3 Waterloo nodes (9.5-11s)
    { t: 11,    pos: camPos(hubDir, 2.08),           look: hubLook.clone()           },
    // Hold on Waterloo cluster (11-24.5s)
    { t: 24.5,  pos: camPos(hubDir, 2.08),           look: hubLook.clone()           },
    // Shot 1a: 3-location tight view — Waterloo/Ottawa/Montreal (25.5-29s)
    { t: 25.5,  pos: camPos(REGIONAL_DIR, 2.6),      look: REGIONAL_LOOK.clone()     },
    { t: 29,    pos: camPos(REGIONAL_DIR, 2.6),      look: REGIONAL_LOOK.clone()     },
    // Shot 1b: Pull back to reveal all 5 southern cities (29-31s), hold (31-33s)
    { t: 31,    pos: camPos(SOUTHERN_DIR, 3.5),       look: SOUTHERN_LOOK.clone()     },
    { t: 33,    pos: camPos(SOUTHERN_DIR, 3.5),       look: SOUTHERN_LOOK.clone()     },
    // Shot 2: Whole Canada — all ground clusters, tighter (35-43s)
    { t: 35,    pos: camPos(CANADA_WIDE_DIR, 4.5),   look: CANADA_WIDE.clone()       },
    { t: 43,    pos: camPos(CANADA_WIDE_DIR, 4.5),   look: CANADA_WIDE.clone()       },
    // Shot 3: Satellite — further back so both satellite + ground fit (45-50s)
    { t: 45,    pos: camPos(SAT_CAM_DIR, 6.0),       look: SAT_LOOK.clone()          },
    { t: 50,    pos: camPos(SAT_CAM_DIR, 6.0),       look: SAT_LOOK.clone()          },
    // Shot 4: Global — rotating globe, orbiting satellite (52-60s)
    { t: 52,    pos: camPos(GLOBE_DIR, 6.0),          look: GLOBE_CENTER.clone()      },
    { t: 57,    pos: camPos(GLOBE_DIR, 6.0),          look: GLOBE_CENTER.clone()      },
    { t: 60,    pos: camPos(GLOBE_DIR, 7.5),          look: GLOBE_CENTER.clone()      },
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
