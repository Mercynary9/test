/** Tiny WebAudio blip synth — no asset files needed. */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, { type = 'square', slide = 0, gain = 1, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, { gain = 0.5, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(env).connect(this.master);
    src.start(t0);
  }

  jump() { this.tone(430, 0.12, { slide: 320, type: 'triangle' }); }
  doubleJump() { this.tone(620, 0.13, { slide: 360, type: 'triangle' }); }
  dash() { this.noise(0.16, { gain: 0.32 }); this.tone(240, 0.12, { slide: 420, type: 'sawtooth', gain: 0.5 }); }
  stomp() { this.tone(300, 0.09, { slide: -180 }); this.tone(760, 0.1, { type: 'triangle', delay: 0.05 }); }
  bounce() { this.tone(520, 0.09, { slide: 260, type: 'triangle', gain: 0.7 }); }
  hurt() { this.tone(300, 0.26, { slide: -190, type: 'sawtooth' }); }
  coin() { this.tone(980, 0.07, { type: 'triangle' }); this.tone(1420, 0.12, { type: 'triangle', delay: 0.06 }); }
  kick() { this.tone(180, 0.14, { slide: 140, type: 'sawtooth' }); this.noise(0.1, { gain: 0.3 }); }
  shoot() { this.tone(680, 0.1, { slide: -380, type: 'sawtooth', gain: 0.5 }); }
  fuse() { this.tone(1200, 0.05, { type: 'square', gain: 0.4 }); }
  explode() { this.noise(0.5, { gain: 0.8 }); this.tone(120, 0.42, { slide: -70, type: 'sawtooth' }); }
  checkpoint() { [660, 880].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', delay: i * 0.09 })); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', delay: i * 0.11 })); }
  die() { [440, 330, 220, 150].forEach((f, i) => this.tone(f, 0.2, { type: 'square', delay: i * 0.1 })); }
}
