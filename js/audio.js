/**
 * Procedural sound effects via the Web Audio API.
 *
 * Nothing is loaded from disk: every cue is synthesised from oscillators and a
 * short noise buffer. That keeps the offline bundle small and, more usefully
 * for a sensory-sensitive player, keeps every cue soft-edged and predictable --
 * short attacks, exponential decays, no clipping transients.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  /** Must be called from a user gesture; iOS starts the context suspended. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone({ from, to = from, type = 'sine', dur = 0.18, gain = 0.3, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    // Small ramp in rather than an instant start: avoids the click that makes
    // a cue feel sharp.
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.25, gain = 0.25, freq = 900 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(amp).connect(this.master);
    src.start(t0);
  }

  jump()    { this._tone({ from: 320, to: 760, type: 'triangle', dur: 0.22, gain: 0.26 }); }
  duck()    { this._tone({ from: 300, to: 130, type: 'sine', dur: 0.24, gain: 0.3 }); }
  lane()    { this._tone({ from: 520, to: 620, type: 'sine', dur: 0.1, gain: 0.18 }); }
  coin()    { this._tone({ from: 880, dur: 0.09, gain: 0.2, type: 'sine' });
              this._tone({ from: 1320, dur: 0.14, gain: 0.16, type: 'sine', delay: 0.07 }); }
  shield()  { [523, 659, 784, 1047].forEach((f, i) =>
                this._tone({ from: f, dur: 0.2, gain: 0.18, type: 'triangle', delay: i * 0.08 })); }
  block()   { this._noise({ dur: 0.18, gain: 0.18, freq: 1600 }); }
  crash()   { this._noise({ dur: 0.45, gain: 0.3, freq: 520 });
              this._tone({ from: 220, to: 70, type: 'sawtooth', dur: 0.45, gain: 0.16 }); }
  fanfare() { [523, 659, 784].forEach((f, i) =>
                this._tone({ from: f, dur: 0.35, gain: 0.16, type: 'triangle', delay: i * 0.12 })); }
  ready()   { this._tone({ from: 660, dur: 0.12, gain: 0.2, type: 'sine' }); }
  go()      { this._tone({ from: 660, to: 990, dur: 0.3, gain: 0.24, type: 'triangle' }); }
}
