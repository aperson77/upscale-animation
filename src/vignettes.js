/**
 * vignettes.js — Act 3 capability vignettes (t = 50–62 s).
 *
 * Four sequential ~3 s visual moments, abstract and suggestive:
 *  V1  t=51–54   Distributed Computing  — nodes sync-pulse, assembly blooms
 *  V2  t=54.5–57.8 Unbreakable Encryption — packet travels, intercept fails
 *  V3  t=58–61   GPS-Free Timing        — concentric rings expand in unison
 *  V4  t=60.5–63 Networked Sensing      — noise converges into coherent signal
 *
 * All geometry lives in globeGroup so it rotates with the globe.
 */

import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';

const C_BLUE   = new THREE.Color(0x1a85ff);
const C_COPPER = new THREE.Color(0xd4a04a);
const C_RED    = new THREE.Color(0xff3a1a);
const C_WHITE  = new THREE.Color(0xe8edf2);

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function arcPoints(a, b, segs = 48, elev = 1.030) {
  const dA = a.clone().normalize(), dB = b.clone().normalize();
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    pts.push(
      new THREE.Vector3().lerpVectors(dA, dB, i / segs)
        .normalize().multiplyScalar(GLOBE_RADIUS * elev),
    );
  }
  return pts;
}

export function createVignettes(globeGroup, nodes) {
  const byName = new Map(nodes.map(n => [n.name, n]));
  const get    = name => byName.get(name);

  // ── V1: Distributed Computing ─────────────────────────────────────────────
  // 16 particle points fly inward toward Waterloo suggesting assembly
  const V1_START = 24.5, V1_END = 26.5;
  const V1_SYNC  = ['Waterloo', 'Toronto', 'Ottawa'];
  const heroPos  = get('Waterloo')?.position.clone() ?? new THREE.Vector3();

  const v1N   = 16;
  const v1Buf = new Float32Array(v1N * 3);
  const v1Geo = new THREE.BufferGeometry();
  v1Geo.setAttribute('position', new THREE.BufferAttribute(v1Buf, 3));
  const v1Mat = new THREE.PointsMaterial({
    color: C_COPPER, size: 0.014, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false,
  });
  globeGroup.add(new THREE.Points(v1Geo, v1Mat));

  const v1Start = Array.from({ length: v1N }, () =>
    heroPos.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.9,
      (Math.random() - 0.5) * 0.9,
      (Math.random() - 0.5) * 0.9,
    )),
  );
  const v1Cur = v1Start.map(p => p.clone());

  // ── V2: Unbreakable Encryption ────────────────────────────────────────────
  const V2_START = 26.0, V2_END = 28.5;
  const v2From   = get('Waterloo')?.position ?? new THREE.Vector3();
  const v2To     = get('Toronto')?.position  ?? new THREE.Vector3();
  const v2Curve  = new THREE.CatmullRomCurve3(arcPoints(v2From, v2To));
  const v2Mid    = v2Curve.getPoint(0.5);

  // Traveling packet — sphere mesh so it renders circular, not square
  const v2pMat = new THREE.MeshBasicMaterial({ color: C_BLUE, transparent: true, opacity: 0 });
  const v2Packet = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), v2pMat);
  v2Packet.visible = false;
  globeGroup.add(v2Packet);

  // Red probe
  const v2ProbeStart = v2Mid.clone().add(
    new THREE.Vector3(0.5, 0.3, 0.1).normalize().multiplyScalar(0.5),
  );
  const v2ProbeMat = new THREE.MeshBasicMaterial({ color: C_RED, transparent: true, opacity: 0 });
  const v2Probe    = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), v2ProbeMat);
  v2Probe.position.copy(v2ProbeStart);
  globeGroup.add(v2Probe);

  // Detection ripple (torus that expands radially)
  const v2RipMat = new THREE.MeshBasicMaterial({
    color: C_WHITE, transparent: true, opacity: 0, side: THREE.DoubleSide,
  });
  const v2Rip = new THREE.Mesh(new THREE.TorusGeometry(0.001, 0.003, 6, 36), v2RipMat);
  v2Rip.position.copy(v2Mid);
  v2Rip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v2Mid.clone().normalize());
  globeGroup.add(v2Rip);

  // ── V3: GPS-Free Timing ───────────────────────────────────────────────────
  const V3_START  = 27.5, V3_END = 29.5;
  const V3_NAMES  = ['Waterloo', 'Toronto', 'Ottawa'];
  const V3_RINGS  = 3;
  const V3_GAP    = 0.45; // delay between successive rings per node

  const v3Rings = [];
  for (const name of V3_NAMES) {
    const nPos = get(name)?.position;
    if (!nPos) continue;
    const outward = nPos.clone().normalize();
    for (let r = 0; r < V3_RINGS; r++) {
      const mat  = new THREE.MeshBasicMaterial({ color: C_COPPER, transparent: true, opacity: 0, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.001, 0.003, 6, 36), mat);
      mesh.position.copy(nPos);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);
      globeGroup.add(mesh);
      v3Rings.push({ mesh, mat, delay: r * V3_GAP, ringT: 0, active: false });
    }
  }

  // ── V4: Networked Sensing ─────────────────────────────────────────────────
  const V4_START = 28.5, V4_END = 31.0;
  const v4Ctr    = get('Waterloo')?.position.clone() ?? new THREE.Vector3();
  const v4N      = 40;
  const v4Buf    = new Float32Array(v4N * 3);
  const v4Geo    = new THREE.BufferGeometry();
  v4Geo.setAttribute('position', new THREE.BufferAttribute(v4Buf, 3));
  const v4Mat = new THREE.PointsMaterial({
    color: C_BLUE, size: 0.011, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false,
  });
  globeGroup.add(new THREE.Points(v4Geo, v4Mat));

  const v4Offsets = Array.from({ length: v4N }, () =>
    new THREE.Vector3((Math.random()-0.5)*0.35, (Math.random()-0.5)*0.35, (Math.random()-0.5)*0.35),
  );

  // ── Update ────────────────────────────────────────────────────────────────
  function update(t, dt) {
    const active = t >= V1_START - 0.5 && t <= V4_END + 1.0;
    if (!active) { v1Mat.opacity = 0; v2pMat.opacity = 0; v2ProbeMat.opacity = 0; v2RipMat.opacity = 0; v4Mat.opacity = 0; return; }

    // ── V1 ──
    if (t >= V1_START && t <= V1_END) {
      const vt      = t - V1_START;
      const dur     = V1_END - V1_START;
      const fadeIn  = clamp01(vt / 0.5);
      const fadeOut = clamp01((vt - dur + 0.7) / 0.7);
      v1Mat.opacity = fadeIn * (1 - fadeOut) * 0.85;

      const conv = clamp01(vt / 2.0);
      const ease = conv * conv;
      for (let i = 0; i < v1N; i++) {
        v1Cur[i].lerpVectors(v1Start[i], heroPos, ease);
        v1Buf[i * 3    ] = v1Cur[i].x;
        v1Buf[i * 3 + 1] = v1Cur[i].y;
        v1Buf[i * 3 + 2] = v1Cur[i].z;
      }
      v1Geo.attributes.position.needsUpdate = true;

      // Sync pulse on specific nodes
      const syncA = 1 + 0.065 * Math.sin(vt * 4.0 * Math.PI);
      for (const name of V1_SYNC) {
        const n = get(name); if (n) n.mesh.scale.setScalar(syncA);
      }
    } else { v1Mat.opacity = 0; }

    // ── V2 ──
    if (t >= V2_START && t < V2_END) {
      const vt = t - V2_START;

      // Packet travels to midpoint (0–1.4 s)
      if (vt <= 1.4) {
        v2Packet.position.copy(v2Curve.getPoint(clamp01(vt / 1.4) * 0.52));
        v2Packet.visible = true;
        v2pMat.opacity = clamp01(vt / 0.3);
      }
      // Probe approaches (0.8–1.9 s)
      if (vt >= 0.8 && vt < 1.9) {
        const prog = (vt - 0.8) / 1.1;
        v2Probe.position.lerpVectors(v2ProbeStart, v2Mid, prog * prog);
        v2ProbeMat.opacity = clamp01(prog / 0.3) * 0.9;
      }
      // Ripple + probe fades (1.9–2.5 s)
      if (vt >= 1.9 && vt < 2.5) {
        const rp = (vt - 1.9) / 0.6;
        v2Rip.scale.setScalar(1 + rp * 9);
        v2RipMat.opacity   = Math.max(0, 1 - rp) * 0.85;
        v2ProbeMat.opacity = Math.max(0, 1 - rp * 2.5) * 0.9;
      } else if (vt < 1.9) {
        v2Rip.scale.setScalar(0.01); v2RipMat.opacity = 0;
      }
      // Packet continues and arrives (1.9–3.2 s)
      if (vt >= 1.9 && vt < 3.2) {
        const prog = 0.52 + (vt - 1.9) / 1.3 * 0.48;
        v2Packet.position.copy(v2Curve.getPoint(Math.min(prog, 1)));
        v2pMat.opacity = Math.max(0, (3.2 - vt) / 0.5);
      }
    } else { v2pMat.opacity = 0; v2Packet.visible = false; v2ProbeMat.opacity = 0; if (t >= V2_END) { v2RipMat.opacity = 0; } }

    // ── V3 ──
    if (t >= V3_START && t < V3_END + 2) {
      const vt = t - V3_START;
      for (const ring of v3Rings) {
        if (vt < ring.delay) { ring.mat.opacity = 0; continue; }
        if (!ring.active) { ring.active = true; ring.ringT = 0; }
        ring.ringT += dt;
        const prog = clamp01(ring.ringT / 1.4);
        ring.mesh.scale.setScalar(1 + prog * 20);
        ring.mat.opacity = Math.max(0, 1 - prog) * 0.7;
        if (prog >= 1) { ring.ringT = 0; ring.active = false; } // replay each ring
      }
    } else { for (const ring of v3Rings) ring.mat.opacity = 0; }

    // ── V4 ──
    if (t >= V4_START && t <= V4_END) {
      const vt      = t - V4_START;
      const dur     = V4_END - V4_START;
      const fadeIn  = clamp01(vt / 0.5);
      const fadeOut = clamp01((vt - dur + 0.6) / 0.6);
      v4Mat.opacity = fadeIn * (1 - fadeOut) * 0.75;

      // Noise radius shrinks from full → 0 over 1.6 s (converging)
      const noiseScale = Math.max(0, 1 - clamp01(vt / 1.6));
      for (let i = 0; i < v4N; i++) {
        const pos = v4Ctr.clone().add(v4Offsets[i].clone().multiplyScalar(noiseScale));
        v4Buf[i * 3    ] = pos.x;
        v4Buf[i * 3 + 1] = pos.y;
        v4Buf[i * 3 + 2] = pos.z;
      }
      v4Geo.attributes.position.needsUpdate = true;
    } else { v4Mat.opacity = 0; }
  }

  return { update };
}
