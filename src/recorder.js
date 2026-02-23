/**
 * recorder.js — Frame-perfect video export using WebCodecs + webm-muxer.
 *
 * Usage: open the app with ?record in the URL.
 * Renders every frame at a fixed 1/60s timestep, encodes to VP9,
 * and downloads a high-quality WebM when finished.
 *
 * Composites the WebGL canvas + CSS vignette + wordmark logo into
 * an offscreen canvas before encoding each frame.
 */

import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import { TOTAL_DURATION } from './timing.js';

// ─── Recording constants ────────────────────────────────────────────────────
const REC_WIDTH   = 3840;
const REC_HEIGHT  = 2160;
const REC_FPS     = 60;
const REC_BITRATE = 80_000_000; // 80 Mbps — very high quality VP9 at 4K

// ─── Query-param check ──────────────────────────────────────────────────────
export function isRecordMode() {
  return new URLSearchParams(window.location.search).has('record');
}

// ─── Recorder ────────────────────────────────────────────────────────────────
export class Recorder {
  constructor(glCanvas) {
    this.glCanvas   = glCanvas;
    this.totalFrames = Math.ceil(REC_FPS * (TOTAL_DURATION / 1000)); // auto-sync with timeline
    this.frameIndex  = 0;

    // ── Composite canvas (WebGL + overlays) ────────────────────────────────
    this.comp = document.createElement('canvas');
    this.comp.width  = REC_WIDTH;
    this.comp.height = REC_HEIGHT;
    this.ctx = this.comp.getContext('2d');

    // ── WebM muxer ─────────────────────────────────────────────────────────
    this.target = new ArrayBufferTarget();
    this.muxer  = new Muxer({
      target: this.target,
      video: {
        codec: 'V_VP9',
        width:  REC_WIDTH,
        height: REC_HEIGHT,
      },
    });

    // ── Video encoder ──────────────────────────────────────────────────────
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error:  (e) => console.error('VideoEncoder error:', e),
    });

    this.encoder.configure({
      codec:     'vp09.00.10.08', // VP9 Profile 0, Level 1.0
      width:     REC_WIDTH,
      height:    REC_HEIGHT,
      bitrate:   REC_BITRATE,
      framerate: REC_FPS,
    });

    // ── Pre-load logo for wordmark compositing ─────────────────────────────
    this.logo      = null;
    this.logoReady = false;
    const img = new Image();
    img.onload = () => { this.logo = img; this.logoReady = true; };
    img.src = '/logo.png';

    // ── Progress indicator ─────────────────────────────────────────────────
    this._initProgressUI();
  }

  // ── Public getters ──────────────────────────────────────────────────────────

  get fixedDt()  { return 1 / REC_FPS; }
  get width()    { return REC_WIDTH; }
  get height()   { return REC_HEIGHT; }
  get done()     { return this.frameIndex >= this.totalFrames; }
  get progress() { return this.frameIndex / this.totalFrames; }

  /** True when the encoder queue is too deep and we should pause rendering. */
  get backpressure() { return this.encoder.encodeQueueSize > 15; }

  // ── Capture one frame ───────────────────────────────────────────────────────

  captureFrame(wordmarkOpacity = 0) {
    const ctx = this.ctx;

    // 1. Draw the WebGL canvas
    ctx.drawImage(this.glCanvas, 0, 0, REC_WIDTH, REC_HEIGHT);

    // 2. Vignette (matches CSS radial-gradient on #overlay::after)
    const cx = REC_WIDTH / 2;
    const cy = REC_HEIGHT / 2;
    const grad = ctx.createRadialGradient(cx, cy, REC_WIDTH * 0.275, cx, cy, REC_WIDTH * 0.5);
    grad.addColorStop(0, 'rgba(13,21,32,0)');
    grad.addColorStop(1, 'rgba(13,21,32,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, REC_WIDTH, REC_HEIGHT);

    // 3. Wordmark logo (matches CSS: centered, bottom 28%, height 56px, inverted)
    if (wordmarkOpacity > 0.001 && this.logoReady) {
      ctx.save();
      ctx.globalAlpha = wordmarkOpacity;
      ctx.filter = 'invert(1)';
      const logoH = 56;
      const logoW = (this.logo.naturalWidth / this.logo.naturalHeight) * logoH;
      const x = (REC_WIDTH - logoW) / 2;
      const y = REC_HEIGHT * 0.72 - logoH; // bottom: 28% → top = 72% minus logo height
      ctx.drawImage(this.logo, x, y, logoW, logoH);
      ctx.restore();
    }

    // 4. Encode
    const timestamp = this.frameIndex * (1_000_000 / REC_FPS); // microseconds
    const frame     = new VideoFrame(this.comp, { timestamp });
    const keyFrame  = this.frameIndex % (REC_FPS * 2) === 0; // keyframe every 2s
    this.encoder.encode(frame, { keyFrame });
    frame.close();

    this.frameIndex++;
    this._updateProgress();
  }

  // ── Finalize and download ───────────────────────────────────────────────────

  async finalize() {
    this._setProgressText('Encoding final frames...');
    await this.encoder.flush();
    this.encoder.close();
    this.muxer.finalize();

    const blob = new Blob([this.target.buffer], { type: 'video/webm' });
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);

    this._setProgressText(`Done! ${sizeMB} MB — downloading...`);

    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = 'upscale-animation.webm';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  // ── Progress UI ─────────────────────────────────────────────────────────────

  _initProgressUI() {
    const bar = document.createElement('div');
    bar.id = 'rec-progress';
    Object.assign(bar.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '9999', background: 'rgba(13,21,32,0.9)', border: '1px solid #4a6a8a',
      borderRadius: '8px', padding: '12px 24px', fontFamily: 'Inter, sans-serif',
      fontSize: '13px', color: '#8cb4e0', letterSpacing: '0.05em', textAlign: 'center',
      minWidth: '280px',
    });
    bar.innerHTML = `
      <div style="margin-bottom:6px">RECORDING</div>
      <div style="background:#1a2535;border-radius:4px;height:6px;overflow:hidden">
        <div id="rec-fill" style="height:100%;width:0%;background:#4488cc;transition:width 0.3s"></div>
      </div>
      <div id="rec-label" style="margin-top:6px;font-size:11px;color:#5a8aba">0% — 0 / 3600 frames</div>
    `;
    document.body.appendChild(bar);
    this._fill  = bar.querySelector('#rec-fill');
    this._label = bar.querySelector('#rec-label');
  }

  _updateProgress() {
    const pct = (this.progress * 100).toFixed(1);
    this._fill.style.width = `${pct}%`;
    this._label.textContent = `${pct}% — ${this.frameIndex} / ${this.totalFrames} frames`;
  }

  _setProgressText(text) {
    this._fill.style.width = '100%';
    this._label.textContent = text;
  }
}
