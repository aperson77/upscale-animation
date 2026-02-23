/**
 * camera.js — Keyframed camera path for the 60s animation.
 *
 * 4-shot structure after Beat 4:
 *   Shot 1 (25.5-33s): Southern Canada — Van/Cal/Waterloo/Ottawa/Montreal/Newfoundland
 *   Shot 2 (35-43s):   Whole Canada — all ground clusters
 *   Shot 3 (45-50s):   Satellite — dedicated satellite connection
 *   Shot 4 (52-60s):   Global — rotating globe, orbiting satellite
 * Direct keyframe interpolation with cosine easing — smooth, no overshoot.
 */

import * as THREE from 'three';
import { GLOBE_RADIUS, latLonToVec3 } from './globe.js';

// ─── Key geographic positions ────────────────────────────────────────────────
const WATERLOO     = latLonToVec3(43.46, -80.52, GLOBE_RADIUS);
const OTTAWA       = latLonToVec3(45.42, -75.69, GLOBE_RADIUS);
const MONTREAL     = latLonToVec3(45.50, -73.57, GLOBE_RADIUS);
const NEWFOUNDLAND = latLonToVec3(48.50, -55.50, GLOBE_RADIUS);

// 3-city centroid — Waterloo/Ottawa/Montréal only (for the connect scene)
const THREE_CITY_LOOK = WATERLOO.clone().add(OTTAWA).add(MONTREAL).multiplyScalar(1 / 3);
const THREE_CITY_DIR  = THREE_CITY_LOOK.clone().normalize();

// Eastern Canada midpoint — includes Newfoundland (for wider shot)
const REGIONAL_LOOK = WATERLOO.clone().add(OTTAWA).add(MONTREAL).add(NEWFOUNDLAND).multiplyScalar(1 / 4);
const REGIONAL_DIR  = REGIONAL_LOOK.clone().normalize();

// Full globe — camera looks slightly south so satellite is clearly above the limb
const GLOBE_CENTER = latLonToVec3(48, -92, GLOBE_RADIUS);
const GLOBE_DIR    = GLOBE_CENTER.clone().normalize();

// Canada-wide — centered higher to include all Arctic nodes up to Alert (80°N)
const CANADA_WIDE     = latLonToVec3(62, -97, GLOBE_RADIUS);
const CANADA_WIDE_DIR = CANADA_WIDE.clone().normalize();

// Southern Canada — midpoint of all 6 southern cities (Van, Cal, Wat, Ott, Mtl, NF)
const SOUTHERN_LOOK = latLonToVec3(47, -88, GLOBE_RADIUS);
const SOUTHERN_DIR  = SOUTHERN_LOOK.clone().normalize();

// Western expansion — centered between Waterloo and Calgary/Vancouver
// so that Waterloo remains visible on the east side of frame
const WEST_LOOK = latLonToVec3(48, -100, GLOBE_RADIUS);
const WEST_DIR  = WEST_LOOK.clone().normalize();

// Satellite view — look near satellite altitude so it's centered in frame.
// Camera from south-east at distance 6 — both satellite (upper frame) and
// ground stations (lower frame) fit within FOV 36°.
const SAT_LOOK    = latLonToVec3(55, -100, 3.2);  // just below satellite orbit altitude
const SAT_CAM_DIR = latLonToVec3(30, -80, GLOBE_RADIUS).clone().normalize();

// Opening globe establishing shot — tilted to show NA, Arctic, edge of Europe
// Camera drifts slowly westward toward hero (lon -80.5) so zoom is a seamless continuation
const OPENING_LOOK_0 = latLonToVec3(50, -74, GLOBE_RADIUS);
const OPENING_DIR_0  = OPENING_LOOK_0.clone().normalize();
// Drift endpoint already pointing toward hero's longitude — seamless transition into zoom
const OPENING_LOOK_4 = latLonToVec3(48, -79, GLOBE_RADIUS);
const OPENING_DIR_4  = OPENING_LOOK_4.clone().normalize();

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
  { t:  0,    fov: 45 },   // Globe establishing shot
  { t:  4,    fov: 44 },   // Hold — zoom begins
  { t:  8,    fov: 24 },   // Hero close-up (one smooth zoom)
  { t: 13,    fov: 24 },   // Hold through grid sequence (compressed)
  { t: 15,    fov: 32 },   // Pull back to 3 Waterloo nodes
  { t: 20,    fov: 32 },   // Hold Waterloo cluster
  { t: 23,    fov: 22 },   // View 1 — 3-city (Wat/Ott/Mtl)
  { t: 30,    fov: 22 },   // Hold through IC + connections + grid
  { t: 33,    fov: 28 },   // View 2 — + Newfoundland
  { t: 39.5,  fov: 28 },   // Hold through IC + connections + grid
  { t: 42,    fov: 38 },   // View 3 — + Calgary/Vancouver (wider to show NF)
  { t: 48,    fov: 38 },   // Hold through IC + connections + grid
  { t: 50.5,  fov: 40 },   // View 4 — all Canada + Arctic
  { t: 58.5,  fov: 40 },   // Hold through IC + connections + grid
  { t: 60.5,  fov: 36 },   // Smooth transition into satellite shot
  { t: 63,    fov: 36 },   // Hold satellite
  { t: 65,    fov: 32 },   // Globe — zoomed out, whole Earth visible
  { t: 80,    fov: 32 },   // Hold through end
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
  // Opening hold 4s with camera drift, zoom from 4→8
  const KF = [
    // Opening: Globe establishing shot — Earth from space (0-4s)
    { t:  0,    pos: camPos(OPENING_DIR_0, 5.5),     look: OPENING_LOOK_0.clone()    },
    { t:  4,    pos: camPos(OPENING_DIR_4, 5.5),     look: OPENING_LOOK_4.clone()    },
    // Zoom to hero node close-up (4-8s)
    { t:  8,    pos: camPos(heroDir, 2.06),           look: heroLook.clone()          },
    // Hold close-up through grid sequence (8-13s, compressed from 15.5)
    { t: 13,    pos: camPos(heroDir, 2.06),           look: heroLook.clone()          },
    // Pull back to reveal 3 Waterloo nodes (13-15s)
    { t: 15,    pos: camPos(hubDir, 2.08),            look: hubLook.clone()           },
    // Hold on Waterloo cluster (15-20s)
    { t: 20,    pos: camPos(hubDir, 2.08),            look: hubLook.clone()           },
    // View 1: 3-city — Waterloo/Ottawa/Montréal (23-30s, 7s hold)
    { t: 23,    pos: camPos(THREE_CITY_DIR, 2.7),    look: THREE_CITY_LOOK.clone()   },
    { t: 30,    pos: camPos(THREE_CITY_DIR, 2.7),    look: THREE_CITY_LOOK.clone()   },
    // View 2: + Newfoundland (33-39.5s, 6.5s hold)
    { t: 33,    pos: camPos(REGIONAL_DIR, 3.2),       look: REGIONAL_LOOK.clone()     },
    { t: 39.5,  pos: camPos(REGIONAL_DIR, 3.2),       look: REGIONAL_LOOK.clone()     },
    // View 3: + Calgary/Vancouver (42-48s, 6s hold) — zoomed out so NF visible
    { t: 42,    pos: camPos(WEST_DIR, 4.0),           look: WEST_LOOK.clone()         },
    { t: 48,    pos: camPos(WEST_DIR, 4.0),           look: WEST_LOOK.clone()         },
    // View 4: All Canada + Arctic (50.5-58.5s hold)
    { t: 50.5,  pos: camPos(CANADA_WIDE_DIR, 4.5),   look: CANADA_WIDE.clone()       },
    { t: 58.5,  pos: camPos(CANADA_WIDE_DIR, 4.5),   look: CANADA_WIDE.clone()       },
    // Smooth transition to satellite (58.5-60.5s, 2s blend)
    { t: 60.5,  pos: camPos(SAT_CAM_DIR, 6.0),       look: SAT_LOOK.clone()          },
    { t: 63,    pos: camPos(SAT_CAM_DIR, 6.0),       look: SAT_LOOK.clone()          },
    // Globe — zoom out further so whole globe is visible, then rotate (65-80s)
    { t: 65,    pos: camPos(GLOBE_DIR, 9.0),          look: GLOBE_CENTER.clone()      },
    { t: 80,    pos: camPos(GLOBE_DIR, 9.0),          look: GLOBE_CENTER.clone()      },
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

    // Smooth eased interpolation parameter
    let t = 0;
    if (hi.t !== lo.t) {
      const raw = (elapsed - lo.t) / (hi.t - lo.t);
      t = cosineEase(raw);
    }

    // Google-Earth-style zoom: exponential radius interpolation
    // Camera speed is proportional to altitude — fast when far, slow when close
    const rA = lo.pos.length();
    const rB = hi.pos.length();
    let r;
    if (rA > 0.01 && rB > 0.01 && Math.abs(rA - rB) > 0.1) {
      r = rA * Math.pow(rB / rA, t);  // exponential: Google Earth feel
    } else {
      r = rA + (rB - rA) * t;          // linear for small/no distance changes
    }
    _pos.lerpVectors(lo.pos, hi.pos, t).normalize().multiplyScalar(r);

    // LookAt: same exponential blend for consistent feel
    const lrA = lo.look.length();
    const lrB = hi.look.length();
    let lr;
    if (lrA > 0.01 && lrB > 0.01 && Math.abs(lrA - lrB) > 0.1) {
      lr = lrA * Math.pow(lrB / lrA, t);
    } else {
      lr = lrA + (lrB - lrA) * t;
    }
    _look.lerpVectors(lo.look, hi.look, t).normalize().multiplyScalar(lr);

    camera.fov = getFOV(elapsed);
    camera.updateProjectionMatrix();
    camera.position.copy(_pos);
    camera.lookAt(_look);
  }

  return { update };
}
