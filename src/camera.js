/**
 * camera.js — Keyframed camera path for the 30s animation.
 *
 * Two-phase movement:
 *  - Beat 1 (p 0–0.167):  Extreme close-up on Waterloo.  Camera STATIC.
 *  - Beat 2 (p 0.167–0.300): Slow pullback to Ontario triangle view.
 *  - Hold   (p 0.300–1.000): Static hold on Ontario triangle; wordmark at 28.5s.
 *
 * Position uses normalized-lerp (nlerp): direction and radius interpolated
 * separately so the camera arcs smoothly around the globe.
 */

import * as THREE from 'three';
import { GLOBE_RADIUS, latLonToVec3 } from './globe.js';
import { ease }                        from './timing.js';

// ─── Hero node (Waterloo) ─────────────────────────────────────────────────────
const HERO_POS = latLonToVec3(43.46, -80.52, GLOBE_RADIUS);
const HERO_DIR = HERO_POS.clone().normalize();
const TORONTO_POS = latLonToVec3(43.65, -79.38, GLOBE_RADIUS);
const OTTAWA_POS  = latLonToVec3(45.42, -75.69, GLOBE_RADIUS);

// ─── Beat 1 camera — tight above Waterloo ────────────────────────────────────
const A1_POS = HERO_DIR.clone().multiplyScalar(GLOBE_RADIUS + 0.06);

// ─── LookAt targets ───────────────────────────────────────────────────────────
const ONTARIO_LOOK = HERO_POS.clone()
  .add(TORONTO_POS)
  .add(OTTAWA_POS)
  .multiplyScalar(1 / 3);

// ─── Ontario hold position ────────────────────────────────────────────────────
const ONTARIO_DIR   = ONTARIO_LOOK.clone().normalize();
const ONTARIO_RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), ONTARIO_DIR).normalize();
const ONTARIO_UP    = new THREE.Vector3().crossVectors(ONTARIO_DIR, ONTARIO_RIGHT).normalize();
const ONTARIO_MAP_UP = new THREE.Vector3(0, 1, 0).projectOnPlane(ONTARIO_DIR).normalize();
// Telephoto: far away + narrow FOV → flattens globe into map-like view
const ONTARIO_POS   = ONTARIO_DIR.clone()
  .multiplyScalar(GLOBE_RADIUS + 0.28);

// FOV transitions: Beat 1 uses default 50°, Ontario hold uses narrow FOV
const BEAT1_FOV    = 50;
const ONTARIO_FOV  = 18;

// ─── Keyframe table ───────────────────────────────────────────────────────────
const KF = [
  // ── Beat 1 (0–5s): static close-up on Waterloo ───────────────────────────
  { p: 0.000, pos: A1_POS.clone(),    look: HERO_POS.clone(),       fn: ease.inOutCubic },
  { p: 0.167, pos: A1_POS.clone(),    look: HERO_POS.clone(),       fn: ease.inOutQuint }, //  5s — smooth exit

  // ── Beat 2 (5–9s): gradual Ontario reveal ────────────────────────────────
  { p: 0.315, pos: ONTARIO_POS.clone(), look: ONTARIO_LOOK.clone(), fn: ease.inOutQuint }, // softer, slightly longer settle

  // ── Hold (9–30s): static on Ontario triangle; wordmark at 28.5s ──────────
  { p: 1.000, pos: ONTARIO_POS.clone(), look: ONTARIO_LOOK.clone(), fn: ease.inOutCubic }, // 30s — hold
];

// ─── Reusable vectors ─────────────────────────────────────────────────────────
const _camPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _dirLo  = new THREE.Vector3();
const _dirHi  = new THREE.Vector3();
const _upBlend = new THREE.Vector3();

// ─── createCameraController ───────────────────────────────────────────────────
export function createCameraController(camera) {
  function upBlendForProgress(p) {
    const upT = THREE.MathUtils.clamp((p - 0.167) / 0.05, 0, 1);
    return _upBlend.copy(new THREE.Vector3(0, 1, 0)).lerp(ONTARIO_MAP_UP, upT).normalize();
  }

  function update(progress) {
    const p = Math.max(0, Math.min(1, progress));

    // Beat 1 hard-lock — zero drift.
    if (p <= 0.167) {
      camera.fov = BEAT1_FOV;
      camera.updateProjectionMatrix();
      camera.up.copy(upBlendForProgress(p));
      camera.position.copy(A1_POS);
      camera.lookAt(HERO_POS);
      return;
    }

    // Find surrounding keyframes
    let lo = KF[0];
    let hi = KF[KF.length - 1];

    for (let i = 0; i < KF.length - 1; i++) {
      if (p >= KF[i].p && p <= KF[i + 1].p) {
        lo = KF[i];
        hi = KF[i + 1];
        break;
      }
    }

    if (lo === hi || hi.p === lo.p) {
      camera.up.copy(upBlendForProgress(p));
      camera.position.copy(hi.pos);
      camera.lookAt(hi.look);
      return;
    }

    const rawT   = (p - lo.p) / (hi.p - lo.p);
    const easedT = lo.fn(rawT);

    // Nlerp: arc the camera around the globe rather than cutting through space.
    const rLo = lo.pos.length();
    const rHi = hi.pos.length();
    const r   = rLo + (rHi - rLo) * easedT;

    _dirLo.copy(lo.pos).normalize();
    _dirHi.copy(hi.pos).normalize();
    _camPos.lerpVectors(_dirLo, _dirHi, easedT).normalize().multiplyScalar(r);

    _lookAt.lerpVectors(lo.look, hi.look, easedT);

    // Interpolate FOV: Beat 1 (50°) → Ontario hold (18°) during pullback
    const fovT = THREE.MathUtils.clamp((p - 0.167) / (0.315 - 0.167), 0, 1);
    const fovEased = fovT * fovT * (3 - 2 * fovT); // smoothstep
    camera.fov = BEAT1_FOV + (ONTARIO_FOV - BEAT1_FOV) * fovEased;
    camera.updateProjectionMatrix();

    camera.up.copy(upBlendForProgress(p));
    camera.position.copy(_camPos);
    camera.lookAt(_lookAt);
  }

  return { update };
}
