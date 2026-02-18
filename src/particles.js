/**
 * particles.js — Beat 1 close-up animation.
 *
 * Creates:
 *  1. Four orbital particles circling the hero node (visible through Beat 1).
 *  2. A molecular hex lattice (1 centre + 6 ring) that assembles, stalls with
 *     jitter, then scatters — fitting inside the 5 s Beat 1 window.
 *  3. Hero node emissive intensity ramps up during assembly, spikes at stall,
 *     then decays when the lattice collapses.
 *
 * All geometry lives inside globeGroup (co-rotates with the globe).
 * Everything fades out as the camera pulls back at t=5 s, gone by t=7 s.
 */

import * as THREE from 'three';

// ─── Colours ──────────────────────────────────────────────────────────────────
const C_BLUE     = new THREE.Color(0x4da8ff);
const C_BLUE_DIM = new THREE.Color(0x2a80d0);

const ATOM_R = 0.001;   // significantly smaller than NODE_RADIUS (0.003)

// ─── Beat 1 timing (absolute seconds) ────────────────────────────────────────
const BUILD_END   = 2.8;   // lattice fully assembled
const STALL_END   = 4.2;   // stall / jitter phase ends
const SCATTER_END = 5.0;   // collapse complete (Beat 1 ends at 5 s)

// ─── Tangent frame at hero surface ───────────────────────────────────────────
function tangentFrame(heroPos) {
  const heroN = heroPos.clone().normalize();
  const heroT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), heroN).normalize();
  const heroB = new THREE.Vector3().crossVectors(heroN, heroT).normalize();
  return { heroN, heroT, heroB };
}

function makeTp(heroPos, { heroN, heroT, heroB }) {
  return (u, v, h = 0.05) =>
    heroPos.clone()
      .addScaledVector(heroT, u)
      .addScaledVector(heroB, v)
      .addScaledVector(heroN, h);
}

// ─── Updatable two-point line (no GC) ────────────────────────────────────────
function makeUpdLine(mat) {
  const buf = new Float32Array(6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
  return { line: new THREE.Line(geo, mat), buf, geo };
}

// ─── 1. Orbital particles ────────────────────────────────────────────────────
function buildOrbital(heroPos, { heroN, heroT, heroB }, globeGroup) {
  const COUNT = 4;
  const buf   = new Float32Array(COUNT * 3);
  const geo   = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));

  const mat = new THREE.PointsMaterial({
    color:           C_BLUE,
    size:            0.001,
    transparent:     true,
    opacity:         0.9,
    sizeAttenuation: true,
    depthWrite:      false,
  });
  globeGroup.add(new THREE.Points(geo, mat));

  const cfg = [
    { r: 0.009, spd:  1.30, ph: 0.00,    tilt:  0.00 },
    { r: 0.007, spd: -1.00, ph: 2.20,    tilt:  0.50 },
    { r: 0.010, spd:  1.60, ph: Math.PI, tilt: -0.40 },
    { r: 0.008, spd: -1.20, ph: 4.40,    tilt:  0.70 },
  ];

  const _v = new THREE.Vector3();
  const _t = new THREE.Vector3();

  return function update(t, alpha) {
    mat.opacity = 0.85 * alpha;
    for (let i = 0; i < COUNT; i++) {
      const c   = cfg[i];
      const ang = t * c.spd * Math.PI * 2 + c.ph;
      _t.copy(heroT).addScaledVector(heroN, -c.tilt).normalize();
      _v.copy(heroPos)
        .addScaledVector(_t,    Math.cos(ang) * c.r)
        .addScaledVector(heroB, Math.sin(ang) * c.r);
      buf[i * 3    ] = _v.x;
      buf[i * 3 + 1] = _v.y;
      buf[i * 3 + 2] = _v.z;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

// ─── 2. Molecular hex lattice ─────────────────────────────────────────────────
// 1 centre + 6 hexagonal ring = 7 atoms, 12 bonds.
// Assembles smoothly to full completion in BUILD_END seconds, stalls with
// vibration, then scatters. Familiar molecular style from the original code.
function buildLattice(tp, globeGroup) {
  const r = 0.008;
  const defs = [
    [0, 0, 0.003],
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return [r * Math.cos(a), r * Math.sin(a), 0.003];
    }),
  ];
  const bonds = [
    [0,1],[0,2],[0,3],[0,4],[0,5],[0,6],
    [1,2],[2,3],[3,4],[4,5],[5,6],[6,1],
  ];

  const group   = new THREE.Group();
  globeGroup.add(group);
  const atomGeo = new THREE.SphereGeometry(ATOM_R, 6, 5);

  const atoms = defs.map(([u, v, h]) => {
    const mat  = new THREE.MeshBasicMaterial({ color: C_BLUE, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(atomGeo, mat);
    mesh.position.copy(tp(u, v, h));
    group.add(mesh);
    const su = u || (Math.random() - 0.5) * 0.02;
    const sv = v || (Math.random() - 0.5) * 0.02;
    return { mesh, mat, base: mesh.position.clone(), scatter: new THREE.Vector3(su, sv, 0.01).normalize() };
  });

  const bondLines = bonds.map(([ai, bi]) => {
    const mat = new THREE.LineBasicMaterial({ color: C_BLUE_DIM, transparent: true, opacity: 0, depthWrite: false });
    const obj = makeUpdLine(mat);
    group.add(obj.line);
    return { ...obj, mat, ai, bi };
  });

  const scatterSpd = atoms.map(() => 0.008 + Math.random() * 0.008);

  return function update(t, alpha) {
    if (alpha <= 0) {
      atoms.forEach(a => (a.mat.opacity = 0));
      bondLines.forEach(b => (b.mat.opacity = 0));
      return;
    }

    let buildP = 0, scatterP = 0;
    if (t < 0)              { buildP = 0; }
    else if (t < BUILD_END) { buildP = t / BUILD_END; }
    else if (t < STALL_END) { buildP = 1; }
    else if (t < SCATTER_END) {
      buildP   = 1;
      scatterP = (t - STALL_END) / (SCATTER_END - STALL_END);
    } else {
      buildP = 0; scatterP = 1;
    }

    // Stall jitter: vibrate positions when assembled but stuck
    const jitter = (t >= BUILD_END && t < SCATTER_END)
      ? Math.min((t - BUILD_END) / 0.6, 1) * 0.001 * Math.sin(t * 20) : 0;

    atoms.forEach((a, i) => {
      const birth = i / atoms.length;
      const build = Math.min(Math.max((buildP - birth) / (1 / atoms.length + 0.15), 0), 1);
      a.mat.opacity = build * (1 - scatterP) * alpha;
      const p = a.base.clone();
      if (scatterP > 0) p.addScaledVector(a.scatter, scatterP * scatterSpd[i]);
      if (jitter) {
        p.x += Math.sin(i * 2.1 + t * 15) * jitter;
        p.y += Math.cos(i * 1.9 + t * 12) * jitter;
      }
      a.mesh.position.copy(p);
    });

    const bBuild = Math.min(Math.max(buildP * 1.6 - 0.5, 0), 1);
    bondLines.forEach(b => {
      b.mat.opacity = bBuild * (1 - scatterP) * 0.45 * alpha;
      const pa = atoms[b.ai].mesh.position, pb = atoms[b.bi].mesh.position;
      b.buf[0]=pa.x; b.buf[1]=pa.y; b.buf[2]=pa.z;
      b.buf[3]=pb.x; b.buf[4]=pb.y; b.buf[5]=pb.z;
      b.geo.attributes.position.needsUpdate = true;
    });
  };
}

// ─── 3. Hero node emissive pulse ─────────────────────────────────────────────
// particles.js owns hero emissiveIntensity during Beat 1 only.
function updateHeroPulse(heroNode, t) {
  if (t >= SCATTER_END) {
    heroNode.mat.emissiveIntensity = 1.55; // hand back to globe.js baseline
    return;
  }
  if (t < BUILD_END) {
    // Ramp up: 2.4 → 3.2 while assembling
    heroNode.mat.emissiveIntensity = 2.4 + 0.8 * (t / BUILD_END);
    return;
  }
  if (t < STALL_END) {
    // Stall: rapid irregular pulse + spike at peak
    const stallFrac = (t - BUILD_END) / (STALL_END - BUILD_END);
    const pulse     = Math.sin(t * 7 * Math.PI) * 0.8 * stallFrac;
    heroNode.mat.emissiveIntensity = 3.2 + pulse;
    return;
  }
  // Scatter: decay back to base
  const decay = 1 - (t - STALL_END) / (SCATTER_END - STALL_END);
  heroNode.mat.emissiveIntensity = 1.55 + 1.65 * decay;
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * @param {THREE.Group} globeGroup
 * @param {object}      heroNode — globe node with .position and .mat
 * @returns {{ update(t: number, dt: number, progress: number): void }}
 */
export function createAct1Animations(globeGroup, heroNode) {
  const heroPos = heroNode.position;
  const frame   = tangentFrame(heroPos);
  const tp      = makeTp(heroPos, frame);

  const updateOrbital = buildOrbital(heroPos, frame, globeGroup);
  const updateLattice = buildLattice(tp, globeGroup);

  return {
    update(t, _dt, progress) {
      // Done once Beat 2 pull-back is established (p > 0.233 = 7 s)
      if (progress > 0.233) return;

      // act1Alpha: full through Beat 1, fades over t=5–7 s
      const act1Alpha = progress < 0.167
        ? 1.0
        : Math.max(0, 1 - (progress - 0.167) / 0.066);

      updateOrbital(t, act1Alpha);
      updateLattice(t, act1Alpha);
      updateHeroPulse(heroNode, t);
    },
  };
}
