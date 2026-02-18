# CREATIVE BRIEF — UpScale Quantum Interconnect Animation

## Purpose
A 30-second cinematic Three.js animation. One component of an investor pitch. Its only job: make the audience *feel* the problem and the magnitude of the solution in under half a minute. Zero jargon. Zero labels except one line of text and the final wordmark.

## Brand Colors
- Background: `#0d1520`
- Globe/structure: `#0f1729`
- Steel blue: `#4a6a8a`
- Copper (UpScale): `#b07a3d`
- Copper glow: `#d4a04a`
- Node blue: `#8cb4e0`
- White text: `#e8edf2`
- Dim text: `rgba(232, 237, 242, 0.35)`
- Grid lines: `rgba(140, 180, 224, 0.08)`

## Font
Inter (Google Fonts) — weights 400, 600, 700

---

## THE 30 SECONDS

The animation zooms out in stages — each stage reveals more isolation, then more connection. The pattern is: show isolation → show interconnect → zoom out wider → repeat at bigger scale. This creates a rhythm that builds conviction.

---

### BEAT 1 — "One Machine" (0s–5s)

Camera tight on the Waterloo node. Close-up. Pulsing blue. Orbiting particles showing activity. An abstract geometric lattice tries to assemble around it — gets ~70% there, impressive, complex — then stalls, flickers, collapses. The node pulses hard once. Can't finish alone.

---

### BEAT 2 — "Three Islands" (5s–11s)

Camera pulls back smoothly. Toronto and Ottawa nodes fade into view — forming a triangle across southern Ontario. All three pulsing independently. Grey classical internet lines connect them. Data flows on those grey lines (small particles moving).

A quantum particle fires from Waterloo toward Toronto along the classical line. It **shatters on contact** — fragments scatter, glow dies. A second attempt from Ottawa to Waterloo — same failure.

These three powerful machines sit 300km apart and cannot share quantum information. The isolation is visceral at this small, local scale.

Text fades in: **"These machines cannot talk to each other."** Hold 2s, fade.

---

### BEAT 3 — "The Interconnect (Local)" (11s–15s)

The Waterloo node shifts to copper. A new connection line — copper-blue, glowing, visually distinct from the grey classical lines — fires toward Toronto along the *same fiber path* as the classical line. But this time the quantum particle **holds**. It arrives. Toronto shifts to copper. Ottawa connects. The Ontario triangle is alive — three nodes pulsing in unison.

Quick flash: the lattice from Beat 1 reappears near the triangle and this time **assembles completely** — pieces arriving from all three nodes. The thing one machine couldn't solve, three connected machines just did.

---

### BEAT 4 — "Canada + Space" (15s–22s)

Camera pulls back further. The rest of Canada's quantum nodes fade in at their real locations: Montreal, Sherbrooke, Calgary, Vancouver. Satellites appear in orbit above — including Arctic coverage.

Same pattern: they're isolated. A quantum particle tries to reach from Montreal to Vancouver — fails on the classical line.

Then the copper cascade ripples outward from the Ontario triangle. Montreal connects. Sherbrooke. Lines arc westward to Calgary, Vancouver. Lines arc **upward** to satellite nodes — copper connections curving into orbit and back down, covering Arctic and remote regions.

Canada's quantum network comes alive — ground nodes and satellites linked in a warm copper-blue web.

Two fast flashes (1 second each):
1. A message travels the coast-to-coast network — a red probe tries to intercept — instant detection, probe fades, message arrives intact (encryption)
2. Nodes from Vancouver to Ottawa pulse in perfect synchrony — GPS satellites flicker and go dark — the quantum timing network continues uninterrupted (timing without GPS)

---

### BEAT 5 — "Global" (22s–27s)

Camera pulls back to full globe view. The rest of the world's quantum nodes fade in — Boston, London, Zurich, Delft, Tokyo, Beijing, Sydney, Singapore, Bangalore, and others. All isolated. All blue.

The copper cascade extends outward from Canada — crossing the Atlantic to Europe, the Pacific to Asia. Node by node, the entire globe transforms. Satellites link continents through orbital arcs.

Two fast flashes (1 second each):
1. Nodes across multiple continents flash in perfect synchrony — scattered sensor signals resolve into one clear coherent pattern (networked sensing)
2. A massive lattice assembles from nodes spanning the full globe — far more complex than the one that failed in Beat 1 (distributed computing at global scale)

---

### FINAL (27s–30s)

Wide globe. Fully connected network pulsing gently. Copper-blue web alive. 2 seconds of stillness.

Wordmark fades in bottom center:
- "Up" in `#4a6a8a` + "Scale" in `#b07a3d`
- "Quantum" beneath in dim text

Hold. Done.

---

## Technical

### Stack
- **Three.js** for 3D rendering
- **Theatre.js** for visual timeline authoring (keyframe camera, properties, timing in a GUI — compiles out for production so no runtime cost)
- **Vite** for dev server and bundling
- Vanilla JS (no React required, but component is framework-agnostic)

### Architecture — Embeddable Module
Build as a self-contained module that can be dropped into any website context later:

```
UpScaleAnimation(containerElement, options?)
```

Exposes:
- `play()` — start from beginning
- `pause()` / `resume()`
- `seekTo(progress)` — 0 to 1, enables scroll-driven playback later
- `reset()` — return to frame 0
- `destroy()` — clean up WebGL context and listeners

This means the animation works as:
- A **hero section** (autoplay on load)
- A **scroll-triggered section** (wire seekTo to scroll position)
- A **standalone page** (play on click)
- An **embedded component** in any framework

### Rendering
- Dark minimal globe (wireframe/dot grid, not photorealistic)
- Bloom post-processing (subtle — warm, not nuclear)
- Camera on CatmullRomCurve3 path: close-up → pullback → orbital → wide
- Nodes at real lat/long coordinates on sphere
- Connection lines as animated curves with glowing head + trail
- All text as HTML/CSS overlay on canvas
- Target: 60fps, <5MB total weight, works in Chrome/Safari/Firefox/Edge
- Responsive (works in 16:9 presentation and standard browser windows)
- Holds on final frame by default

### Node Coordinates (approximate lat/long)

**Canada (dense cluster — UpScale's home ecosystem):**
- Waterloo, ON: 43.46°N, 80.52°W ← UpScale / IQC (cascade origin)
- Toronto, ON: 43.65°N, 79.38°W
- Ottawa, ON: 45.42°N, 75.69°W
- Montreal, QC: 45.50°N, 73.57°W
- Sherbrooke, QC: 45.40°N, 71.89°W
- Calgary, AB: 51.05°N, 114.07°W
- Vancouver, BC: 49.28°N, 123.12°W

**Global:**
- Boston, US: 42.36°N, 71.06°W
- Boulder, US: 40.01°N, 105.27°W
- Bay Area, US: 37.77°N, 122.42°W
- Chicago, US: 41.88°N, 87.63°W
- London, UK: 51.51°N, 0.13°W
- Zurich, CH: 47.38°N, 8.54°E
- Delft, NL: 52.01°N, 4.36°E
- Paris, FR: 48.86°N, 2.35°E
- Beijing, CN: 39.90°N, 116.40°E
- Tokyo, JP: 35.68°N, 139.69°E
- Sydney, AU: 33.87°S, 151.21°E
- Singapore: 1.35°N, 103.82°E
- Bangalore, IN: 12.97°N, 77.59°E
- Plus 10-15 additional nodes for visual density
- 3-4 satellite nodes in orbital paths

Canada should appear visibly node-dense relative to the rest of the globe — this subtly reinforces that UpScale is emerging from the heart of the world's densest quantum ecosystem.

---

## Priority Order for Building
1. Globe + nodes + camera pullback (foundation)
2. Cascade animation (emotional climax)
3. Beat 1 single-node attempt/failure
4. Classical line failure moments in Beat 2
5. Four 1-second capability flashes
6. Polish (bloom, text timing, wordmark)
