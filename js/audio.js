// 소리는 전부 코드로 합성한다. 압박감의 절반은 소리다:
// 심장 박동, 내 숨소리, 관중 함성, 귀 울림, 맞았을 때 먹먹해지는 귀.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.muffle.connect(comp);
    comp.connect(this.master);
    this.master.connect(c.destination);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // 관중: 잡음 + 웅성이는 띠 두 개
    this.crowd = c.createGain();
    this.crowd.gain.value = 0;
    this.crowd.connect(this.muffle);
    const mk = (f, q, g) => {
      const src = c.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gain = c.createGain();
      gain.gain.value = g;
      src.connect(bp); bp.connect(gain); gain.connect(this.crowd);
      src.start(0, Math.random());
      return { bp, gain };
    };
    this.crowdLow = mk(420, 0.7, 0.8);
    this.crowdHigh = mk(1500, 1.1, 0.34);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.31; lg.gain.value = 0.22;
    lfo.connect(lg); lg.connect(this.crowdLow.gain.gain);
    lfo.start();

    // 귀 울림
    this.ringOsc = c.createOscillator();
    this.ringOsc.frequency.value = 3950;
    this.ringGain = c.createGain();
    this.ringGain.gain.value = 0;
    this.ringOsc.connect(this.ringGain);
    this.ringGain.connect(this.master);
    this.ringOsc.start();

    // 깔리는 저음: 코너에 몰릴수록 커진다
    this.drone = c.createOscillator();
    this.drone.type = 'sawtooth';
    this.drone.frequency.value = 44;
    const dlp = c.createBiquadFilter();
    dlp.type = 'lowpass'; dlp.frequency.value = 130;
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0;
    this.drone.connect(dlp); dlp.connect(this.droneGain); this.droneGain.connect(this.muffle);
    this.drone.start();
  }

  get ok() { return !!this.ctx; }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  pan(x) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, x));
    p.connect(this.muffle);
    return p;
  }

  noiseHit({ f = 800, q = 0.8, type = 'bandpass', peak = 0.5, a = 0.002, d = 0.12, pan = 0, sweep = 0 }) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = c.createBiquadFilter();
    flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    if (sweep) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f * sweep), t + a + d);
    const g = c.createGain();
    this.env(g, t, a, peak, d);
    s.connect(flt); flt.connect(g); g.connect(this.pan(pan));
    s.start(t, Math.random());
    s.stop(t + a + d + 0.05);
  }

  tone({ f = 100, to = 0, type = 'sine', peak = 0.5, a = 0.002, d = 0.2, pan = 0 }) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
    const g = c.createGain();
    this.env(g, t, a, peak, d);
    o.connect(g); g.connect(this.pan(pan));
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  /** 내가 맞는 소리. 머리 안에서 울리는 둔탁한 소리 */
  takeHit(power, pan) {
    this.tone({ f: 150, to: 34, peak: 0.9 * power + 0.2, d: 0.22 + power * 0.14 });
    this.noiseHit({ f: 1400, q: 0.5, peak: 0.55 * power + 0.2, d: 0.08, sweep: 0.3, pan });
    this.noiseHit({ f: 240, q: 1, peak: 0.6, d: 0.16, pan });
  }

  /** 내 주먹이 꽂히는 소리 */
  landHit(power, counter = false) {
    // 낮은 쿵 + 가죽이 살에 박히는 찰싹 + (세면) 뼈 울림
    this.tone({ f: 120, to: 50, peak: 0.55 + power * 0.3, d: 0.11 + power * 0.06 });
    this.tone({ f: 58, to: 30, peak: 0.25 + power * 0.45, d: 0.18 + power * 0.1 });
    if (power > 0.8 || counter) this.noiseHit({ f: 5200, q: 4, peak: 0.16 + power * 0.1, d: 0.025 });
    if (counter) this.tone({ f: 340, to: 120, type: 'triangle', peak: 0.22, d: 0.09 });
    this.noiseHit({ f: 1700, q: 0.7, peak: 0.42 + power * 0.25, d: 0.05, sweep: 0.4 });
    this.noiseHit({ f: 3800, q: 1.5, peak: 0.1 + power * 0.12, d: 0.03 });
  }

  block(pan) {
    this.noiseHit({ f: 620, q: 1.2, peak: 0.55, d: 0.07, pan, sweep: 0.5 });
    this.tone({ f: 200, to: 90, peak: 0.34, d: 0.07, pan });
  }

  parry() {
    this.noiseHit({ f: 2600, q: 2.5, peak: 0.42, d: 0.06 });
    this.tone({ f: 620, to: 310, peak: 0.24, d: 0.12 });
  }

  /** 펀치가 귀 옆으로 스쳐 가는 소리 */
  whoosh(pan, loud = 0.5) {
    this.noiseHit({ f: 500, q: 1.5, a: 0.05, d: 0.16, peak: loud, pan, sweep: 4.5 });
  }

  /** 상대가 큰 걸 준비할 때 숨 들이켜는 소리 */
  grunt(pan = 0, low = 1) {
    this.noiseHit({ f: 480 * low, q: 3, a: 0.03, d: 0.13, peak: 0.28, pan, sweep: 0.62 });
    this.tone({ f: 118 * low, to: 74 * low, type: 'sawtooth', peak: 0.05, a: 0.02, d: 0.14, pan });
  }

  step() { this.noiseHit({ f: 130, q: 1, peak: 0.34, d: 0.08 }); }
  rope() { this.tone({ f: 88, to: 54, type: 'triangle', peak: 0.5, d: 0.35 }); this.noiseHit({ f: 300, peak: 0.3, d: 0.2 }); }
  thud() { this.tone({ f: 80, to: 26, peak: 1, d: 0.5 }); this.noiseHit({ f: 180, peak: 0.8, d: 0.3 }); }
  count() { this.tone({ f: 170, to: 120, type: 'triangle', peak: 0.7, d: 0.16 }); this.noiseHit({ f: 700, peak: 0.42, d: 0.05 }); }
  breath(strength, inhale) {
    this.noiseHit({ f: inhale ? 1900 : 950, q: 1.1, a: inhale ? 0.1 : 0.03, d: inhale ? 0.22 : 0.28, peak: 0.1 + strength * 0.18 });
  }

  heart(strength) {
    if (!this.ok) return;
    this.tone({ f: 62, to: 34, peak: 0.7 + strength * 0.5, a: 0.004, d: 0.12 });
    setTimeout(() => this.tone({ f: 52, to: 30, peak: 0.42 + strength * 0.42, a: 0.004, d: 0.14 }), 160);
  }

  bell(times = 1) {
    if (!this.ok) return;
    for (let i = 0; i < times; i++) {
      setTimeout(() => {
        for (const [f, p] of [[1180, 0.32], [1812, 0.2], [2640, 0.12], [3990, 0.06]]) {
          this.tone({ f, peak: p, d: 1.3, type: 'sine' });
        }
      }, i * 260);
    }
  }

  setCrowd(v) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.crowd.gain.setTargetAtTime(0.03 + v * 0.3, t, 0.25);
    this.crowdHigh.gain.gain.setTargetAtTime(0.14 + v * 0.75, t, 0.3);
  }

  roar(v = 1) {
    if (!this.ok) return;
    this.noiseHit({ f: 1000, q: 0.4, a: 0.08, d: 1.1, peak: 0.28 * v });
  }

  setRing(v) {
    if (!this.ok) return;
    this.ringGain.gain.setTargetAtTime(v * 0.05, this.ctx.currentTime, 0.04);
  }

  setMuffle(v) {
    if (!this.ok) return;
    const f = 20000 * Math.pow(1 - Math.min(0.985, v), 2.2) + 240;
    this.muffle.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.06);
  }

  setDrone(v) {
    if (!this.ok) return;
    this.droneGain.gain.setTargetAtTime(v * 0.22, this.ctx.currentTime, 0.4);
  }
}
