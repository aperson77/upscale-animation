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

// ─── Start screen intro (recorded before animation begins) ──────────────────
const INTRO_HOLD_S = 2.0;   // seconds showing start screen
const INTRO_FADE_S = 0.8;   // seconds fading it out
const INTRO_TOTAL_S = INTRO_HOLD_S + INTRO_FADE_S;
const INTRO_FRAMES  = Math.ceil(REC_FPS * INTRO_TOTAL_S);

// Start screen colors (matches CSS --bg-navy, --dim-text)
const BG_NAVY = '#0d1520';

// ─── Query-param check ──────────────────────────────────────────────────────
export function isRecordMode() {
  return new URLSearchParams(window.location.search).has('record');
}

// ─── Recorder ────────────────────────────────────────────────────────────────
export class Recorder {
  constructor(glCanvas) {
    this.glCanvas   = glCanvas;
    this.animFrames  = Math.ceil(REC_FPS * (TOTAL_DURATION / 1000));
    this.totalFrames = INTRO_FRAMES + this.animFrames; // intro + animation
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

    // ── Pre-load logo and pre-invert for wordmark compositing ──────────────
    // The logo is dark navy text on a white background.
    // CSS does: filter:invert(1) → light text on black bg
    //           mix-blend-mode:screen → black becomes transparent, text glows
    // We replicate this by manually inverting RGB, then drawing with screen blend.
    this.logoInverted = null;
    this.logoReady    = false;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = img.naturalWidth;
      c.height = img.naturalHeight;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      const id = cx.getImageData(0, 0, c.width, c.height);
      const d  = id.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = 255 - d[i];     // R
        d[i + 1] = 255 - d[i + 1]; // G
        d[i + 2] = 255 - d[i + 2]; // B
        // alpha unchanged
      }
      cx.putImageData(id, 0, 0);
      this.logoInverted = c;
      this.logoReady = true;
    };
    img.src = '/logo.png';

    // ── Progress indicator ─────────────────────────────────────────────────
    this._initProgressUI();
  }

  // ── Public getters ──────────────────────────────────────────────────────────

  get fixedDt()    { return 1 / REC_FPS; }
  get width()      { return REC_WIDTH; }
  get height()     { return REC_HEIGHT; }
  get done()       { return this.frameIndex >= this.totalFrames; }
  get progress()   { return this.frameIndex / this.totalFrames; }
  get inIntro()    { return this.frameIndex < INTRO_FRAMES; }

  /** True when the encoder queue is too deep and we should pause rendering. */
  get backpressure() { return this.encoder.encodeQueueSize > 15; }

  // ── Capture one frame ───────────────────────────────────────────────────────

  captureFrame(wordmarkOpacity = 0, wordmarkScale = 1) {
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

    // 3. Wordmark logo (centered, scales up, invert + screen blend — matches CSS)
    if (wordmarkOpacity > 0.001 && this.logoReady) {
      ctx.save();
      ctx.globalAlpha = wordmarkOpacity;
      ctx.globalCompositeOperation = 'screen';
      const logoH = 80 * (REC_HEIGHT / 1080) * wordmarkScale;
      const logoW = (this.logoInverted.width / this.logoInverted.height) * logoH;
      const x = (REC_WIDTH - logoW) / 2;
      const y = (REC_HEIGHT - logoH) / 2;
      ctx.drawImage(this.logoInverted, x, y, logoW, logoH);
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

  // ── Capture start screen frame ──────────────────────────────────────────────

  captureIntroFrame() {
    const ctx = this.ctx;
    const introTime = this.frameIndex / REC_FPS;

    // Background — solid navy
    ctx.fillStyle = BG_NAVY;
    ctx.fillRect(0, 0, REC_WIDTH, REC_HEIGHT);

    // Fade out during the last INTRO_FADE_S seconds
    const fadeT = introTime > INTRO_HOLD_S
      ? (introTime - INTRO_HOLD_S) / INTRO_FADE_S
      : 0;
    const alpha = 1 - Math.min(fadeT, 1);

    if (alpha > 0.001 && this.logoReady) {
      ctx.save();
      ctx.globalAlpha = alpha;

      // Logo — centered, pre-inverted + screen blend (matches CSS)
      ctx.globalCompositeOperation = 'screen';
      const logoH = 100 * (REC_HEIGHT / 1080);  // scale relative to 1080p baseline
      const logoW = (this.logoInverted.width / this.logoInverted.height) * logoH;
      const lx = (REC_WIDTH - logoW) / 2;
      const ly = (REC_HEIGHT - logoH) / 2 - 28 * (REC_HEIGHT / 1080); // offset up for prompt below
      ctx.drawImage(this.logoInverted, lx, ly, logoW, logoH);
      ctx.globalCompositeOperation = 'source-over';

      // "Click to begin" text — pulsing opacity
      const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(introTime * Math.PI));
      ctx.globalAlpha = alpha * pulse;
      ctx.fillStyle = 'rgba(232, 237, 242, 0.35)';
      const fontSize = Math.round(13 * (REC_HEIGHT / 1080));
      ctx.font = `400 ${fontSize}px Inter, sans-serif`;
      ctx.letterSpacing = '0.14em';
      ctx.textAlign = 'center';
      ctx.fillText('CLICK TO BEGIN', REC_WIDTH / 2, ly + logoH + 28 * (REC_HEIGHT / 1080));

      ctx.restore();
    }

    // Encode
    const timestamp = this.frameIndex * (1_000_000 / REC_FPS);
    const frame     = new VideoFrame(this.comp, { timestamp });
    const keyFrame  = this.frameIndex % (REC_FPS * 2) === 0;
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
