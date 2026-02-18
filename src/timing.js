/**
 * timing.js — Master timeline for the UpScale animation.
 *
 * A single Timeline instance drives everything: camera path, opacity fades,
 * beat animations, and text overlays. All other modules receive either the
 * raw elapsed seconds or the clamped phase-progress values exposed here.
 *
 * Beat boundaries (all in milliseconds):
 *   BEAT1      0 –  5 000   One Machine — close-up Waterloo, lattice attempt fails
 *   BEAT2   5 000 – 11 000   Three Islands — Ontario triangle, quantum failures, text
 *   BEAT3  11 000 – 15 000   The Interconnect — copper cascade, Ontario triangle connects
 *   BEAT4  15 000 – 22 000   Canada + Space — national network + satellites
 *   BEAT5  22 000 – 27 000   Global — worldwide cascade
 *   FINAL  27 000 – 30 000   Stillness + wordmark
 */

// ─── Phase table ─────────────────────────────────────────────────────────────
export const PHASES = Object.freeze({
  BEAT1: { start:      0, end:  5_000 },
  BEAT2: { start:  5_000, end: 11_000 },
  BEAT3: { start: 11_000, end: 15_000 },
  BEAT4: { start: 15_000, end: 22_000 },
  BEAT5: { start: 22_000, end: 27_000 },
  FINAL: { start: 27_000, end: 30_000 },
});

export const TOTAL_DURATION = 30_000; // ms

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

  /** Elapsed time in seconds (0 → 30). */
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
  get beat5() { return this.phase('BEAT5'); }
  get final() { return this.phase('FINAL'); }

  /**
   * Returns the name of the currently active phase.
   */
  get currentPhase() {
    for (const [name, { start, end }] of Object.entries(PHASES)) {
      if (this._elapsed >= start && this._elapsed < end) return name;
    }
    return this._elapsed >= TOTAL_DURATION ? 'FINAL' : null;
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
