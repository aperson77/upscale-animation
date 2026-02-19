/**
 * interconnect.js — Beat 2: Local Interconnect at Waterloo (5-10s)
 *
 * After Beat 1's solo failure, the 3 Waterloo nodes connect to a shared hub,
 * synchronize pulsing, and the hex lattice that failed before now succeeds.
 *
 * Timeline:
 *   5.0-5.4s  Phase A  Ignition — hub activates, hero turns copper
 *   5.4-6.2s  Phase B  Connection 1 — hero node → hub
 *   6.2-7.0s  Phase C  Connection 2 — node 2 → hub
 *   7.0-7.8s  Phase D  Connection 3 — node 3 → hub
 *   7.8-8.2s  Phase E  Sync snap — nodes synchronize pulsing
 *   8.2-9.0s  Phase F  Lattice success — copper hex grid assembles from 3 dirs
 *   9.0-10.0s Phase G  Hold + fade lattice; connections persist
 */

import * as THREE from 'three';

// ─── Colors ──────────────────────────────────────────────────────────────────
const COPPER        = 0xd4a04a;
const COPPER_COLOR  = new THREE.Color(COPPER);
const COPPER_GRID   = new THREE.Color(0.83, 0.63, 0.29);
const COPPER_VERT   = new THREE.Color(0.95, 0.75, 0.35);
const COPPER_DOT    = new THREE.Color(1.0, 0.85, 0.45);

const GREY_LINE_COLOR   = 0x606060;
const GREY_LINE_OPACITY = 1.0;

// ─── Pre-interconnect: grey lines + failed pulse ────────────────────────────
const GREY_LINES_START    = 11.0;  // after zoom stabilizes
const GREY_LINES_FADE_DUR = 1.2;
const GREY_LINES_END      = 16.5;  // fade out as copper connections appear
const FAILED_PULSE_START  = 12.5;  // after grey lines fully faded in
const FAILED_PULSE_DUR    = 1.8;   // light travels and fades

// ─── Timing constants ────────────────────────────────────────────────────────
const IGNITION_START = 16.0;
const IGNITION_END   = 16.4;

const CONN_STARTS = [16.4, 17.2, 18.0]; // hero, node2, node3
const CONN_DRAW_DUR = 0.8;              // seconds per connection draw

const SYNC_START = 18.8;
const SYNC_END   = 19.2;

const LATTICE_BUILD_START = 19.2;
const LATTICE_BUILD_END   = 20.0;
const LATTICE_HOLD_END    = 20.3;
const LATTICE_FADE_END    = 20.5;

// ─── Tube config ──────────────────────────────────────────────────────────────
const TUBE_RADIUS   = 0.001;
const TUBE_SEGMENTS = 24;
const HEAD_RADIUS   = 0.0018;
const PARTICLE_RADIUS = 0.0012;
const PARTICLE_SPEED  = 0.3;  // loops per second

// ─── Lattice config ──────────────────────────────────────────────────────────
const HEX_RINGS   = 6;
const HEX_SPACING = 0.002;
const MAX_RADIUS  = HEX_RINGS * HEX_SPACING;
const FADE_START  = MAX_RADIUS * 0.5;
const VERT_SIZE   = 0.0012;

// ─── Wave config (lattice build) ─────────────────────────────────────────────
const WAVE_SPEED     = 0.022;
const WAVE_WIDTH     = 0.004;
const WAVE_INTENSITY = 1.8;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutQuint(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}
function hexDist(q, r) { return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); }

function createCircleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0,   'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ─── createInterconnect ──────────────────────────────────────────────────────
export function createInterconnect(globeGroup, clusters) {
  const group = new THREE.Group();
  globeGroup.add(group);

  const waterloo = clusters.find(c => c.name === 'Waterloo');
  if (!waterloo) return { group, update: () => {} };

  const hub      = waterloo.hub;
  const hubPos   = hub.position.clone();
  const nodes    = waterloo.nodes;     // [hero, node2, node3]

  // Hub stays hidden during single-node close-up, appears with the 3-node reveal
  waterloo.hubRevealT = 15.0;

  // ── Grey node-to-node lines (pre-interconnect) ────────────────────────
  // 3 grey lines connecting each pair of the 3 Waterloo nodes
  const greyLines = [];
  const nodePairs = [[0, 1], [0, 2], [1, 2]];

  for (const [ai, bi] of nodePairs) {
    const posA = nodes[ai].position.clone();
    const posB = nodes[bi].position.clone();
    const curve = new THREE.LineCurve3(posA, posB);
    const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.0002, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: GREY_LINE_COLOR,
      transparent: false,
      opacity: 1,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(tubeGeo, tubeMat);
    mesh.visible = false;
    group.add(mesh);
    greyLines.push({ mesh, mat: tubeMat, curve, ai, bi });
  }

  // Failed pulse: light travels along grey line 0 (hero → node 1)
  // Uses a TubeGeometry with per-vertex colors — visible at any distance
  const PULSE_TUBULAR = 128;
  const PULSE_RADIAL  = 6;
  const PULSE_VERTS_PER_RING = PULSE_RADIAL + 1;
  const pulseGlowGeo = new THREE.TubeGeometry(
    greyLines[0].curve, PULSE_TUBULAR, 0.0002, PULSE_RADIAL, false,
  );
  const pulseGlowColors = new Float32Array(
    pulseGlowGeo.attributes.position.count * 3,
  );
  pulseGlowGeo.setAttribute(
    'color', new THREE.BufferAttribute(pulseGlowColors, 3),
  );
  const pulseGlowMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const pulseGlowMesh = new THREE.Mesh(pulseGlowGeo, pulseGlowMat);
  pulseGlowMesh.renderOrder = 10;
  pulseGlowMesh.visible = false;
  group.add(pulseGlowMesh);

  // Scatter particles — light fragments that fly off the line as the pulse fails
  const SCATTER_COUNT = 10;
  const scatterPosArr = new Float32Array(SCATTER_COUNT * 3);
  const scatterColArr = new Float32Array(SCATTER_COUNT * 3);
  const scatterGeo = new THREE.BufferGeometry();
  scatterGeo.setAttribute('position', new THREE.BufferAttribute(scatterPosArr, 3));
  scatterGeo.setAttribute('color', new THREE.BufferAttribute(scatterColArr, 3));
  const scatterMat = new THREE.PointsMaterial({
    size: 0.00012, map: createCircleTexture(), transparent: true,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
    depthWrite: false, depthTest: false, vertexColors: true,
  });
  const scatterPoints = new THREE.Points(scatterGeo, scatterMat);
  scatterPoints.renderOrder = 11;
  scatterPoints.visible = false;
  group.add(scatterPoints);

  // Pre-compute scatter data: perpendicular directions from grey line 0
  const lineDir = greyLines[0].curve.v2.clone().sub(greyLines[0].curve.v1).normalize();
  const lineNormal = lineDir.clone().cross(
    greyLines[0].curve.v1.clone().normalize()
  ).normalize();
  const lineBinormal = lineDir.clone().cross(lineNormal).normalize();

  // Each scatter particle has: spawn time (as fraction of pulse), drift direction, speed
  const scatterParticles = [];
  for (let i = 0; i < SCATTER_COUNT; i++) {
    const spawnFrac = 0.3 + (i / SCATTER_COUNT) * 0.6; // spawn between 30-90% of pulse duration
    const angle = Math.random() * Math.PI * 2;
    const driftDir = lineNormal.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(lineBinormal, Math.sin(angle));
    scatterParticles.push({
      spawnFrac,
      driftDir,
      speed: 0.0008 + Math.random() * 0.0012,
      life: 0, // 0 = not spawned yet
    });
  }

  // ── Build node→hub connections ──────────────────────────────────────────
  const connections = [];
  const _pt = new THREE.Vector3();

  for (let i = 0; i < nodes.length; i++) {
    const node    = nodes[i];
    const nodePos = node.position.clone();
    const startT  = CONN_STARTS[i];

    // LineCurve3 from node to hub
    const curve = new THREE.LineCurve3(nodePos, hubPos);

    // TubeGeometry
    const tubeGeo = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, TUBE_RADIUS, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: COPPER,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.visible = false;
    group.add(tubeMesh);

    // Total index count for drawRange
    const totalIndices = tubeGeo.index
      ? tubeGeo.index.count
      : tubeGeo.attributes.position.count;

    // Glowing head sphere
    const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 12, 8);
    const headMat = new THREE.MeshBasicMaterial({
      color: COPPER,
      transparent: true,
      opacity: 0,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.visible = false;
    group.add(headMesh);

    // 2 paired particles
    const particles = [];
    for (let p = 0; p < 2; p++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: COPPER,
        transparent: true,
        opacity: 0,
      });
      const pMesh = new THREE.Mesh(
        new THREE.SphereGeometry(PARTICLE_RADIUS, 8, 6),
        pMat,
      );
      pMesh.visible = false;
      group.add(pMesh);
      particles.push({
        mesh: pMesh,
        mat: pMat,
        offset: p * 0.12,    // paired: close together
        progress: p * 0.12,
      });
    }

    connections.push({
      node, nodePos, curve,
      tubeMesh, tubeMat, tubeGeo,
      totalIndices,
      headMesh, headMat,
      particles,
      startT,
      activated: false,
      drawn: false,
    });
  }

  // ── Sync state tracking ─────────────────────────────────────────────────
  let syncTriggered = false;
  let flashStart = 0;

  // ── Build success lattice (hex grid centered on hub) ────────────────────
  const hubNormal   = hubPos.clone().normalize();
  const hubTangent  = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), hubNormal).normalize();
  const hubBitangent = new THREE.Vector3()
    .crossVectors(hubNormal, hubTangent).normalize();

  function toHubWorld(x, y, h) {
    return hubPos.clone()
      .addScaledVector(hubTangent, x)
      .addScaledVector(hubBitangent, y)
      .addScaledVector(hubNormal, h);
  }

  // Project node positions onto hub tangent plane to get "source directions"
  const nodeAngles = nodes.map(n => {
    const rel = n.position.clone().sub(hubPos);
    const tx = rel.dot(hubTangent);
    const ty = rel.dot(hubBitangent);
    return Math.atan2(ty, tx);
  });

  // Generate hex vertices
  const verts = [];
  const vertMap = new Map();

  for (let q = -HEX_RINGS; q <= HEX_RINGS; q++) {
    for (let r = -HEX_RINGS; r <= HEX_RINGS; r++) {
      const ring = hexDist(q, r);
      if (ring > HEX_RINGS) continue;

      const x    = HEX_SPACING * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
      const y    = HEX_SPACING * (1.5 * r);
      const dist = Math.sqrt(x * x + y * y);
      const h    = 0.003 + ring * 0.0002;  // slightly above hub

      const radialFade = dist <= FADE_START
        ? 1
        : Math.max(0, 1 - (dist - FADE_START) / (MAX_RADIUS - FADE_START));

      // Assign to nearest source node (by angle)
      const angle = Math.atan2(y, x);
      let nearestNode = 0;
      let bestAngleDiff = Infinity;
      for (let ni = 0; ni < nodeAngles.length; ni++) {
        let diff = Math.abs(angle - nodeAngles[ni]);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < bestAngleDiff) {
          bestAngleDiff = diff;
          nearestNode = ni;
        }
      }

      // Reveal time: based on distance from source + ring
      const revealDelay = (dist / MAX_RADIUS) * 0.7; // 0-0.7s spread across grid

      const idx = verts.length;
      vertMap.set(`${q},${r}`, idx);
      verts.push({
        idx, q, r, ring, dist,
        baseX: x, baseY: y, h,
        worldPos: toHubWorld(x, y, h),
        radialFade,
        sourceNode: nearestNode,
        revealDelay,
      });
    }
  }

  // Generate hex edges
  const ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const latticeEdges = [];

  for (const v of verts) {
    for (const [dq, dr] of ADJ) {
      const nIdx = vertMap.get(`${v.q + dq},${v.r + dr}`);
      if (nIdx === undefined || v.idx >= nIdx) continue;
      const nv = verts[nIdx];
      const edgeDist = (v.dist + nv.dist) / 2;
      const radialFade = Math.min(v.radialFade, nv.radialFade);
      const revealDelay = Math.max(v.revealDelay, nv.revealDelay);
      const aIdx = v.ring <= nv.ring ? v.idx : nIdx;
      const bIdx = aIdx === v.idx ? nIdx : v.idx;
      latticeEdges.push({ a: aIdx, b: bIdx, dist: edgeDist, radialFade, revealDelay });
    }
  }

  const nVerts = verts.length;
  const nEdges = latticeEdges.length;
  const circleTex = createCircleTexture();

  // ── Vertex Points ───────────────────────────────────────────────────────
  const vPosArr = new Float32Array(nVerts * 3);
  const vColArr = new Float32Array(nVerts * 3);
  const vGeo = new THREE.BufferGeometry();
  vGeo.setAttribute('position', new THREE.BufferAttribute(vPosArr, 3));
  vGeo.setAttribute('color', new THREE.BufferAttribute(vColArr, 3));

  const vMat = new THREE.PointsMaterial({
    size: VERT_SIZE, map: circleTex, transparent: true,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
    depthWrite: false, vertexColors: true,
  });
  const vertexPoints = new THREE.Points(vGeo, vMat);
  vertexPoints.visible = false;
  group.add(vertexPoints);

  for (const v of verts) {
    const i3 = v.idx * 3;
    vPosArr[i3] = v.worldPos.x;
    vPosArr[i3 + 1] = v.worldPos.y;
    vPosArr[i3 + 2] = v.worldPos.z;
  }

  // ── Edge LineSegments ───────────────────────────────────────────────────
  const ePosArr = new Float32Array(nEdges * 6);
  const eColArr = new Float32Array(nEdges * 6);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePosArr, 3));
  eGeo.setAttribute('color', new THREE.BufferAttribute(eColArr, 3));

  const eMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const edgeLines = new THREE.LineSegments(eGeo, eMat);
  edgeLines.visible = false;
  group.add(edgeLines);

  // ── Lattice wave brightness ─────────────────────────────────────────────
  function getLatticWaveBright(elapsed, dist) {
    const buildAge = elapsed - LATTICE_BUILD_START;
    if (buildAge < 0.1) return 0;

    // Single expanding wave during build
    const waveRadius = buildAge * WAVE_SPEED;
    const d = Math.abs(dist - waveRadius);
    if (d < WAVE_WIDTH) {
      const waveFade = Math.max(0, 1 - waveRadius / (MAX_RADIUS * 1.2));
      return (1 - d / WAVE_WIDTH) * waveFade * WAVE_INTENSITY;
    }
    return 0;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  function update(elapsed, dt) {
    // ── Grey node-to-node lines (pre-interconnect) ────────────────────────
    if (elapsed >= GREY_LINES_START && elapsed < GREY_LINES_END + 0.5) {
      // Smooth fade in over 0.6s, fade out as copper connections replace them
      const fadeIn = Math.min((elapsed - GREY_LINES_START) / GREY_LINES_FADE_DUR, 1);
      const fadeOut = elapsed > GREY_LINES_END
        ? Math.max(0, 1 - (elapsed - GREY_LINES_END) / 0.5)
        : 1;
      const greyOpacity = fadeIn * fadeOut;

      for (const gl of greyLines) {
        gl.mesh.visible = greyOpacity > 0;
        gl.mat.opacity = greyOpacity;
        gl.mat.transparent = greyOpacity < 1;
      }

      // ── Hero node brightens before releasing pulse ──────────────────
      const flashLeadIn = 0.4;  // starts brightening 0.4s before pulse
      const flashFade = 0.25;   // dims back over 0.25s after pulse starts
      if (elapsed >= FAILED_PULSE_START - flashLeadIn &&
          elapsed < FAILED_PULSE_START + flashFade) {
        const flashAge = elapsed - (FAILED_PULSE_START - flashLeadIn);
        if (flashAge < flashLeadIn) {
          // Building up: ease-in to very bright
          const ramp = flashAge / flashLeadIn;
          nodes[0].baseEmissive = 1.0 + ramp * ramp * 4.0; // up to 5.0x
        } else {
          // Releasing: quick dim back
          const releaseT = (flashAge - flashLeadIn) / flashFade;
          nodes[0].baseEmissive = 5.0 - releaseT * 4.0; // back to 1.0
        }
      } else if (elapsed >= FAILED_PULSE_START + flashFade) {
        nodes[0].baseEmissive = 1.0;
      }

      // ── Failed pulse: light travels along grey line 0 ─────────────────
      if (elapsed >= FAILED_PULSE_START && elapsed < FAILED_PULSE_START + FAILED_PULSE_DUR) {
        const pAge = elapsed - FAILED_PULSE_START;
        const pT   = pAge / FAILED_PULSE_DUR;

        // Start off the side of the node, travel further before fading to nothing
        const startOffset = 0.18;
        const endPos = 0.70;
        const headPos = startOffset + pT * (2 - pT) * (endPos - startOffset);

        // Brightness drops to zero — pulse dies from dimming
        const globalDim = Math.max(0, Math.pow(1 - pT * 1.25, 3.0));

        // Trail length: tight concentrated point
        const trailLen = 0.06;

        pulseGlowMesh.visible = true;

        // Color each ring of the tube — values > 1.0 with AdditiveBlending = bright glow
        for (let ring = 0; ring <= PULSE_TUBULAR; ring++) {
          const t = ring / PULSE_TUBULAR;
          let bright = 0;

          if (t <= headPos && t >= headPos - trailLen) {
            const distFromHead = (headPos - t) / trailLen;
            const localBright = Math.pow(1 - distFromHead, 2);
            bright = localBright * globalDim * 14.0;
          }

          // Set all vertices in this ring — white-hot light
          for (let r = 0; r < PULSE_VERTS_PER_RING; r++) {
            const vi = ring * PULSE_VERTS_PER_RING + r;
            const i3 = vi * 3;
            pulseGlowColors[i3]     = bright;
            pulseGlowColors[i3 + 1] = bright;
            pulseGlowColors[i3 + 2] = bright;
          }
        }
        pulseGlowGeo.attributes.color.needsUpdate = true;

        // Scatter particles — spawn and drift as pulse dims
        scatterPoints.visible = true;
        const _spawnPt = new THREE.Vector3();
        for (let si = 0; si < SCATTER_COUNT; si++) {
          const sp = scatterParticles[si];
          const i3 = si * 3;

          if (pT >= sp.spawnFrac && sp.life === 0) {
            // Spawn at the pulse head position on the grey line
            greyLines[0].curve.getPoint(headPos, _spawnPt);
            sp.baseX = _spawnPt.x;
            sp.baseY = _spawnPt.y;
            sp.baseZ = _spawnPt.z;
            sp.spawnBright = globalDim * 14.0; // match pulse brightness at this moment
            sp.life = 0.001; // mark as spawned
          }

          if (sp.life > 0) {
            sp.life += dt;
            const drift = sp.life * sp.speed;
            const fade = Math.max(0, 1 - sp.life / 0.6); // fade over 0.6s

            scatterPosArr[i3]     = sp.baseX + sp.driftDir.x * drift;
            scatterPosArr[i3 + 1] = sp.baseY + sp.driftDir.y * drift;
            scatterPosArr[i3 + 2] = sp.baseZ + sp.driftDir.z * drift;

            const bright = fade * (sp.spawnBright || 1.0);
            scatterColArr[i3]     = bright;
            scatterColArr[i3 + 1] = bright;
            scatterColArr[i3 + 2] = bright;
          } else {
            scatterColArr[i3] = scatterColArr[i3 + 1] = scatterColArr[i3 + 2] = 0;
          }
        }
        scatterGeo.attributes.position.needsUpdate = true;
        scatterGeo.attributes.color.needsUpdate = true;
      } else {
        pulseGlowMesh.visible = false;
        // Keep scatter visible briefly after pulse ends for lingering particles
        if (elapsed >= FAILED_PULSE_START + FAILED_PULSE_DUR &&
            elapsed < FAILED_PULSE_START + FAILED_PULSE_DUR + 0.6) {
          scatterPoints.visible = true;
          for (let si = 0; si < SCATTER_COUNT; si++) {
            const sp = scatterParticles[si];
            const i3 = si * 3;
            if (sp.life > 0) {
              sp.life += dt;
              const drift = sp.life * sp.speed;
              const fade = Math.max(0, 1 - sp.life / 0.6);
              scatterPosArr[i3]     = sp.baseX + sp.driftDir.x * drift;
              scatterPosArr[i3 + 1] = sp.baseY + sp.driftDir.y * drift;
              scatterPosArr[i3 + 2] = sp.baseZ + sp.driftDir.z * drift;
              const bright = fade * (sp.spawnBright || 1.0);
              scatterColArr[i3]     = bright;
              scatterColArr[i3 + 1] = bright;
              scatterColArr[i3 + 2] = bright;
            }
          }
          scatterGeo.attributes.position.needsUpdate = true;
          scatterGeo.attributes.color.needsUpdate = true;
        } else {
          scatterPoints.visible = false;
          // Reset scatter for potential replay
          for (const sp of scatterParticles) sp.life = 0;
        }
      }
    } else {
      // Hide grey lines outside window
      for (const gl of greyLines) gl.mesh.visible = false;
      pulseGlowMesh.visible = false;
      scatterPoints.visible = false;
    }

    if (elapsed < IGNITION_START) return;

    // ── Phase A: Ignition (5.0-5.4s) ──────────────────────────────────────
    if (elapsed >= IGNITION_START && !hub.active) {
      hub.active = true;
    }

    // Hero node turns copper at ignition
    if (elapsed >= IGNITION_START && !connections[0].activated) {
      connections[0].activated = true;
      nodes[0].baseColor = new THREE.Color(COPPER);
    }

    // ── Phase B/C/D: Connections ──────────────────────────────────────────
    for (let ci = 0; ci < connections.length; ci++) {
      const conn = connections[ci];

      // Activate node (turn copper) at connection start
      if (ci > 0 && elapsed >= conn.startT && !conn.activated) {
        conn.activated = true;
        conn.node.baseColor = new THREE.Color(COPPER);
      }

      if (elapsed < conn.startT) continue;

      const drawAge = elapsed - conn.startT;
      const drawT = Math.min(drawAge / CONN_DRAW_DUR, 1);
      const drawE = easeOutCubic(drawT);

      // Show tube with drawRange
      conn.tubeMesh.visible = true;
      conn.tubeMat.opacity = 0.8;

      if (conn.tubeGeo.index) {
        conn.tubeGeo.index.count = Math.floor(drawE * conn.totalIndices);
      } else {
        conn.tubeGeo.setDrawRange(0, Math.floor(drawE * conn.totalIndices));
      }

      // Head sphere
      if (drawT < 1) {
        conn.headMesh.visible = true;
        conn.headMat.opacity = 0.9;
        conn.curve.getPoint(drawE, _pt);
        conn.headMesh.position.copy(_pt);
      } else {
        // Fade head after draw complete
        if (!conn.drawn) conn.drawn = true;
        const fadeAge = drawAge - CONN_DRAW_DUR;
        const headFade = Math.max(0, 1 - fadeAge / 0.3);
        conn.headMat.opacity = 0.9 * headFade;
        conn.headMesh.visible = headFade > 0;
      }

      // Paired particles (only after draw complete)
      if (conn.drawn) {
        for (const p of conn.particles) {
          p.mesh.visible = true;
          p.mat.opacity = 0.7;
          p.progress = (p.progress + PARTICLE_SPEED * dt) % 1;
          conn.curve.getPoint(p.progress, _pt);
          p.mesh.position.copy(_pt);
        }
      }
    }

    // ── Phase E: Sync Snap (7.8-8.2s) ────────────────────────────────────
    if (elapsed >= SYNC_START && !syncTriggered) {
      syncTriggered = true;
      flashStart = elapsed;
      for (const node of nodes) {
        node.syncState = 'syncing';
        node.syncTarget = 0;
        node.syncFreq = 0.40;
      }
    }

    // Brief brightness flash at sync moment
    if (syncTriggered && elapsed < flashStart + 0.15) {
      for (const node of nodes) {
        node.baseEmissive = 1.5;
      }
    } else if (syncTriggered && elapsed < SYNC_END) {
      for (const node of nodes) {
        node.baseEmissive = 1.0;
      }
    }

    // ── Phase F: Lattice Success (8.2-9.0s) ──────────────────────────────
    const showLattice = elapsed >= LATTICE_BUILD_START && elapsed < LATTICE_FADE_END;
    vertexPoints.visible = showLattice;
    edgeLines.visible = showLattice;

    if (showLattice) {
      // Global fade multiplier for hold+fade
      let globalFade = 1;
      if (elapsed > LATTICE_HOLD_END) {
        globalFade = Math.max(0, 1 - (elapsed - LATTICE_HOLD_END) / (LATTICE_FADE_END - LATTICE_HOLD_END));
      }

      const buildDur = LATTICE_BUILD_END - LATTICE_BUILD_START;
      const buildAge = elapsed - LATTICE_BUILD_START;

      // ── Update vertices ──────────────────────────────────────────────
      for (const v of verts) {
        const i3 = v.idx * 3;

        // Reveal: based on per-vertex delay during build
        const vertRevealAge = buildAge - v.revealDelay;
        if (vertRevealAge < 0) {
          vColArr[i3] = vColArr[i3 + 1] = vColArr[i3 + 2] = 0;
          continue;
        }

        const fadeIn = Math.min(vertRevealAge / 0.25, 1);
        const subtlePulse = 0.85 + 0.15 * Math.sin(elapsed * 3 + v.idx * 0.5);
        const baseBright = 0.3 * subtlePulse;
        const waveBright = getLatticWaveBright(elapsed, v.dist);

        const bright = (baseBright + waveBright) * fadeIn * v.radialFade * globalFade;

        vColArr[i3]     = COPPER_VERT.r * bright;
        vColArr[i3 + 1] = COPPER_VERT.g * bright;
        vColArr[i3 + 2] = COPPER_VERT.b * bright;
      }

      vGeo.attributes.color.needsUpdate = true;

      // ── Update edges ─────────────────────────────────────────────────
      for (let ei = 0; ei < nEdges; ei++) {
        const edge = latticeEdges[ei];
        const e0 = ei * 6;
        const e1 = e0 + 3;
        const aI3 = edge.a * 3;
        const bI3 = edge.b * 3;

        const edgeRevealAge = buildAge - edge.revealDelay;
        if (edgeRevealAge < 0) {
          for (let k = 0; k < 6; k++) eColArr[e0 + k] = 0;
          // Collapse endpoints
          ePosArr[e0]     = vPosArr[aI3];
          ePosArr[e0 + 1] = vPosArr[aI3 + 1];
          ePosArr[e0 + 2] = vPosArr[aI3 + 2];
          ePosArr[e1]     = vPosArr[aI3];
          ePosArr[e1 + 1] = vPosArr[aI3 + 1];
          ePosArr[e1 + 2] = vPosArr[aI3 + 2];
          continue;
        }

        const drawT = Math.min(edgeRevealAge / 0.3, 1);
        const drawE = easeOutCubic(drawT);
        const baseBright = 0.25;
        const waveBright = getLatticWaveBright(elapsed, edge.dist) * 0.8;
        const bright = (baseBright + waveBright) * drawE * edge.radialFade * globalFade;

        // Positions
        const ax = vPosArr[aI3], ay = vPosArr[aI3 + 1], az = vPosArr[aI3 + 2];
        const bx = vPosArr[bI3], by = vPosArr[bI3 + 1], bz = vPosArr[bI3 + 2];

        ePosArr[e0]     = ax; ePosArr[e0 + 1] = ay; ePosArr[e0 + 2] = az;
        if (drawT < 1) {
          ePosArr[e1]     = ax + (bx - ax) * drawE;
          ePosArr[e1 + 1] = ay + (by - ay) * drawE;
          ePosArr[e1 + 2] = az + (bz - az) * drawE;
        } else {
          ePosArr[e1] = bx; ePosArr[e1 + 1] = by; ePosArr[e1 + 2] = bz;
        }

        const cr = COPPER_GRID.r * bright;
        const cg = COPPER_GRID.g * bright;
        const cb = COPPER_GRID.b * bright;
        eColArr[e0] = cr; eColArr[e0 + 1] = cg; eColArr[e0 + 2] = cb;
        eColArr[e1] = cr; eColArr[e1 + 1] = cg; eColArr[e1 + 2] = cb;
      }

      eGeo.attributes.position.needsUpdate = true;
      eGeo.attributes.color.needsUpdate = true;
    }
  }

  return { group, update };
}
