# CREATIVE BRIEF — UpScale Quantum Interconnect Animation (v4)

## Purpose
A 30-second cinematic animation rendered in Blender. One component of an investor pitch to Two Small Fish Ventures. Its job: make the audience *feel* the problem and the magnitude of the solution. Zero jargon. Zero labels except one line of text and the final wordmark.

The animation communicates two levels of connection without ever explaining them:
1. Quantum nodes at a single site → linked into a working subnet (local interconnect)
2. Subnets at different sites → linked into a network over existing telecom fiber (quantum communication layer)

**Maximum scope: Canada coast-to-coast + satellite/Arctic coverage.** No global zoom-out. The furthest the camera goes is a view of Canada with orbital satellite nodes above.

## Output
- Three.js + Vite web animation (vanilla JS)
- Self-contained embeddable module with play/pause/seekTo/destroy API
- 60fps, <5MB, all modern browsers
- Can be deployed as: hero section, scroll-triggered, standalone page, or embedded component
- Can also be screen-recorded to MP4 if a video file is needed

## Logo
The UpScale Quantum logo file is included in the project. It shows:
- "UpScale" — steel blue text, clean sans-serif
- "Quantum" — beneath, slightly lighter, with a small accent/antenna mark at the trailing edge
The logo should appear as-is in the final frame of the animation.

## Brand Colors
- Background: `#0d1520` (deep navy/black)
- Steel blue: `#4a6a8a` (structure, "Up" in logo)
- Copper: `#b07a3d` (UpScale accent, interconnect)
- Copper glow: `#d4a04a` (active/connected state)
- Node blue: `#8cb4e0` (quantum devices, unconnected)
- White text: `#e8edf2`
- Dim text: `rgba(232, 237, 242, 0.35)`
- Classical fiber: `rgba(160, 170, 185, 0.25)` (grey, thin, dim)
- Globe surface: `#0f1729`
- Grid/wireframe: `rgba(140, 180, 224, 0.08)`

---

## VISUAL LANGUAGE

### Quantum nodes (unconnected)
- Small glowing spheres, `#8cb4e0` (blue)
- Each pulses at its own independent rhythm (random phase, slightly different speeds)
- Clustered 2-4 per location (reflecting real multi-device quantum labs)

### Classical telecom fiber (existing infrastructure)
- Thin, grey, dim lines between city locations
- Small grey particles flowing along them
- Looks like plumbing — functional, basic, always there
- These lines STAY VISIBLE after quantum connections appear alongside them

### UpScale local interconnect (within a site)
- Short copper connections between nodes within a cluster
- Visible paired particles (two dots traveling together — entanglement)
- Warm glow, gentle pulse
- When connected: nodes shift from blue to copper and begin pulsing IN SYNC

### UpScale quantum communication layer (between sites)
- Copper connections running ALONGSIDE the grey telecom lines — same curved path, new layer
- Visually distinct from classical: thicker, copper-blue shimmer, paired particles
- The audience sees both grey and copper coexisting on the same route
- This is literally the product: quantum layer on existing telecom fiber

### Connected vs. isolated (the key visual distinction)
- **Isolated:** nodes pulse at random independent rhythms
- **Connected within a subnet:** nodes pulse in SYNC (same phase, same timing)
- **Connected across subnets:** synchronized pulse ripples between sites
- This is visible and immediate — the audience *sees* coordination without being told

---

## THE 30 SECONDS

### BEAT 1 — "One Machine, Then Three Islands" (0s–5s)

Camera tight on a single quantum node at Waterloo. Pulsing blue. An abstract lattice of interconnected points tries to assemble around it — asymmetric, three-dimensional, complex. Gets ~70% complete over 3.5 seconds. Then connections break, points scatter and fade. Can't finish alone.

Camera pulls back slightly. Two more nodes are revealed nearby — same site, same lab. All three pulsing at different rhythms. Uncoordinated. Three machines in the same place, each working alone.

---

### BEAT 2 — "The Local Interconnect" (5s–10s)

The center Waterloo node shifts from blue to copper — fast, like ignition (0.4 seconds). A copper connection fires to the adjacent node: bright glowing head particle racing along a short line, leaving a warm trail. Paired particles follow. Target node turns copper on arrival. Connection fires to the third. Third turns copper.

All three now pulsing in SYNC. Same rhythm, same phase. The shift from independent rhythms to synchronized pulsing should be obvious and satisfying.

Quick payoff (~1 second): the lattice from Beat 1 reappears and assembles COMPLETELY. Pieces arrive from the direction of all three nodes, snapping into place. What one machine couldn't solve, three connected machines just did. Hold briefly, then fade.

**The audience understands: local connection unlocks capability.**

---

### BEAT 3 — "Isolated Subnets" (10s–16s)

Camera pulls back to reveal the Canadian landscape on the globe. Other quantum clusters fade in at their real locations:
- Toronto (3 nodes)
- Ottawa (2 nodes)
- Montréal (3 nodes)
- Sherbrooke (2 nodes)

Each cluster's nodes pulse independently — they haven't been locally connected yet, and the clusters can't reach each other.

Grey telecom fiber lines are visible between the cities. Small grey particles flow along them. The classical internet works.

At ~12s: A bright blue quantum signal (paired particles) fires from Waterloo's subnet toward Toronto along the grey fiber. As it travels, it quietly **dissolves** — opacity fading smoothly, particles dispersing into fading wisps. The information doesn't survive the classical line. Not violent, not dramatic. Just incompatible.

At ~13s: Same thing, Montréal → Ottawa. Same quiet dissolution.

At ~14s: **1.5 seconds of STILLNESS.** Nothing moves except gentle independent pulsing. Isolated clusters sitting in the dark, unable to reach each other.

Text appears centered: **"These machines cannot talk to each other."**
Clean, white, centered in frame with subtle dark gradient behind it. Fade in 0.5s, hold 1.5s, fade out 0.5s.

---

### BEAT 4 — "The Network" (16s–25s)

Brief dimming (~0.3 seconds) — a breath.

**Phase A — Local interconnects activate everywhere (~2 seconds):**
Toronto's 3 nodes link copper internally. Ottawa's 2 nodes link. Montréal's 3 nodes. Sherbrooke's 2. Fast — each cluster gets its local interconnect within 0.3–0.5 seconds. Each cluster begins pulsing in sync within itself.

Now every cluster is a synchronized subnet — but the subnets are still isolated from each other.

**Phase B — Subnet-to-subnet connections over existing fiber (~4 seconds):**
A copper connection fires from Waterloo's subnet to Toronto's subnet — running ALONGSIDE the existing grey telecom line. Same curved path, but the copper line is visually distinct: thicker, warmer, glowing. The audience sees both: grey (old infrastructure) + copper (new quantum layer) running together.

Paired particles travel the copper line. It **holds**. Arrives at Toronto's subnet.

Toronto → Ottawa. Ottawa → Montréal. Montréal → Sherbrooke. The cascade accelerates.

Calgary and Vancouver clusters fade in at their real coordinates and connect — copper lines arcing westward alongside grey fiber.

Lines arc **UPWARD** to satellite nodes in orbit — copper connections curving through space, over Arctic regions, and back down to ground stations. The network extends beyond line-of-sight.

**Canada's quantum network comes alive** — subnets linked coast to coast, ground to orbit.

**Phase C — Two 1-second capability flashes:**
1. (~23s) A message travels the coast-to-coast copper network. A red probe touches the line — instant detection ripple — probe fades, message arrives intact. (Quantum-secure encryption)
2. (~24s) Nodes from Vancouver to Ottawa pulse in perfect synchrony. GPS satellite nodes above flicker and go dark. The quantum timing network continues uninterrupted. (GPS-free timing)

---

### FINAL (25s–30s)

Camera holds at Canadian view. The full network pulses gently — all subnets synchronized, copper connections alive, satellites linked. Classical grey fiber and quantum copper coexist visually.

3 seconds of stillness. The network breathes.

At ~27s: UpScale Quantum logo fades in bottom-center. Uses the actual logo image file. Hold.

Done.

---

## NODE COORDINATES

**Each location is a CLUSTER of 2-4 nodes.**

| Location | Lat | Long | Nodes | Notes |
|----------|-----|------|-------|-------|
| Waterloo, ON | 43.46°N | 80.52°W | 3 | Hero cluster. Cascade origin. |
| Toronto, ON | 43.65°N | 79.38°W | 3 | |
| Ottawa, ON | 45.42°N | 75.69°W | 2 | |
| Montréal, QC | 45.50°N | 73.57°W | 3 | |
| Sherbrooke, QC | 45.40°N | 71.89°W | 2 | |
| Calgary, AB | 51.05°N | 114.07°W | 2 | |
| Vancouver, BC | 49.28°N | 123.12°W | 2 | |

**Satellite nodes:** 3-4 nodes in orbital paths above Canada, including Arctic coverage.

**Classical fiber connections (grey lines between clusters):**
- Waterloo ↔ Toronto
- Toronto ↔ Ottawa
- Ottawa ↔ Montréal
- Montréal ↔ Sherbrooke
- Toronto ↔ Montréal
- Calgary ↔ Vancouver
- Waterloo ↔ Calgary (long arc)

---

## Technical — Three.js

### Stack
- Three.js + Vite, vanilla JS
- EffectComposer with UnrealBloomPass for glow (subtle — warm, not nuclear)
- All text as HTML/CSS overlay on canvas
- Self-contained embeddable module: play(), pause(), resume(), seekTo(0-1), reset(), destroy()

### Rendering
- Dark minimal globe (wireframe/dot grid, not photorealistic)
- Bloom post-processing (strength ≤ 0.3, threshold 0.85)
- Camera on spline path: close-up → cluster → regional → national
- Target: 60fps, <5MB, all modern browsers
- Responsive, handles resize
- Holds on final frame

---

## Priority Order
1. Globe + node clusters + camera staged zoom-out (foundation)
2. Local interconnect within Waterloo cluster (first "aha")
3. Subnet-to-subnet cascade with two-layer visual: grey + copper parallel (second "aha")
4. Beat 1 lattice attempt/failure and completion payoff
5. Quantum signal dissolving on classical lines
6. Capability flashes + logo fade-in
