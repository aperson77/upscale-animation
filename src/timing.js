/**
 * timing.js — Master timeline for the UpScale animation.
 *
 * A single Timeline instance drives everything: camera path, opacity fades,
 * beat animations, and text overlays. All other modules receive either the
 * raw elapsed seconds or the clamped phase-progress values exposed here.
 *
 * Phase boundaries (all in milliseconds):
 *   BEAT1      0 –  5 000   One Machine — close-up Waterloo, lattice attempt fails
 *   BEAT2   5 000 – 10 000   Local Interconnect — Waterloo's 3 nodes link + lattice payoff
 *   BEAT3  10 000 – 16 000   Isolated Subnets — zoom out, quantum dissolution, text
 *   BEAT4  16 000 – 25 000   The Network — local interconnects everywhere, subnet cascade
 *   SHOT1  25 000 – 33 000   Southern Canada — Waterloo/Ottawa/Montreal connections
 *   SHOT2  35 000 – 43 000   Whole Canada — all ground clusters + connections
 *   SHOT3  45 000 – 50 000   Satellite — dedicated satellite connection shot
 *   SHOT4  52 000 – 60 000   Global — rotating globe, satellite orbiting freely
 */

// ─── Phase table ─────────────────────────────────────────────────────────────
export const PHASES = Object.freeze({
  BEAT1: { start:      0, end:  7_000 },
  BEAT2: { start:  7_000, end: 12_000 },
  BEAT3: { start: 12_000, end: 18_000 },
  BEAT4: { start: 18_000, end: 27_000 },
  SHOT1: { start: 20_000, end: 42_000 },
  SHOT2: { start: 42_000, end: 53_000 },
  SHOT3: { start: 53_000, end: 57_000 },
  SHOT4: { start: 59_000, end: 71_000 },
});

export const TOTAL_DURATION = 71_000; // ms

// ─── Easing functions ─────────────────────────────────────────────────────────
// All take t ∈ [0, 1] and return a value ∈ [0, 1].
export const ease = {
  linear:     (t) => t,
  in:         (t) => t * t,
  out:        (t) => t * (2 - t),
  inOut:      (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  inCubic:    (t) => t * t * t,
  outCubic:   (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  inOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
};

// ─── Helper: clamp ───────────────────────────────────────────────────────────
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ─── Timeline ────────────────────────────────────────────────────────────────
export class Timeline {
  /**
   * @param {object} opts
   * @param {boolean} opts.loop – If true, restarts after TOTAL_DURATION.
   *                              If false (default), holds on the final frame.
   */
  constructor({ loop = false } = {}) {
    this.loop     = loop;
    this._elapsed = 0;     // milliseconds
    this.running  = false;
  }

  // ── Playback control ────────────────────────────────────────────────────────

  start()  { this.running = true; }
  pause()  { this.running = false; }
  resume() { this.running = true; }

  reset() {
    this._elapsed = 0;
    this.running  = false;
  }

  /**
   * Advance the timeline.
   * @param {number} dt – Frame delta in **seconds**.
   */
  update(dt) {
    if (!this.running) return;
    this._elapsed += dt * 1000;
    if (this.loop) {
      this._elapsed = this._elapsed % TOTAL_DURATION;
    } else {
      this._elapsed = Math.min(this._elapsed, TOTAL_DURATION);
    }
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  /** Elapsed time in milliseconds (0 → TOTAL_DURATION). */
  get ms() { return this._elapsed; }

  /** Elapsed time in seconds (0 → 60). */
  get t() { return this._elapsed / 1000; }

  /** Overall animation progress, 0 → 1. */
  get progress() { return this._elapsed / TOTAL_DURATION; }

  /** Whether the animation has finished (only meaningful when loop = false). */
  get done() { return !this.loop && this._elapsed >= TOTAL_DURATION; }

  // ── Phase progress values (0 before, linear 0-1 during, 1 after) ──────────

  /**
   * Returns the normalised progress [0, 1] of a named phase.
   * 0 = phase hasn't started yet
   * 0–1 = linearly through the phase
   * 1 = phase is complete
   * @param {keyof PHASES} name
   */
  phase(name) {
    const p = PHASES[name];
    if (!p) throw new Error(`Unknown phase: ${name}`);
    return clamp01((this._elapsed - p.start) / (p.end - p.start));
  }

  // Convenience shorthands
  get beat1() { return this.phase('BEAT1'); }
  get beat2() { return this.phase('BEAT2'); }
  get beat3() { return this.phase('BEAT3'); }
  get beat4() { return this.phase('BEAT4'); }
  get shot1() { return this.phase('SHOT1'); }
  get shot2() { return this.phase('SHOT2'); }
  get shot3() { return this.phase('SHOT3'); }
  get shot4() { return this.phase('SHOT4'); }

  /**
   * Returns the name of the currently active phase.
   */
  get currentPhase() {
    for (const [name, { start, end }] of Object.entries(PHASES)) {
      if (this._elapsed >= start && this._elapsed < end) return name;
    }
    return this._elapsed >= TOTAL_DURATION ? 'SHOT4' : null;
  }

  // ── Sub-range helper ────────────────────────────────────────────────────────

  /**
   * Returns a normalised [0, 1] progress for an arbitrary time window
   * defined in seconds (convenient for sub-events).
   * @param {number} startSec
   * @param {number} endSec
   */
  window(startSec, endSec) {
    return clamp01((this.t - startSec) / (endSec - startSec));
  }
}
