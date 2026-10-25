/* =========================================================
   IRON ECLIPSE — procedural audio
   All sound is synthesized at runtime with the Web Audio API.
   ========================================================= */
(() => {
  'use strict';

  const IRON = (window.IRON = window.IRON || {});

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.compressor = null;
      this.noiseBuffer = null;
      this.muted = false;
      this.musicGain = null;
      this.musicNodes = [];
      this.musicTimer = null;
      this.musicTheme = null;
      this.musicDucked = false;
      this.lastAt = Object.create(null);
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      try {
        this.ctx = new Ctx();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 18;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.004;
        this.compressor.release.value = 0.2;

        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.62;
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.55;
        this.musicGain.connect(this.master);

        this.makeNoise();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (error) {
        console.warn('Audio unavailable:', error);
      }
    }

    makeNoise() {
      const length = Math.floor(this.ctx.sampleRate * 1.5);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      }
      this.noiseBuffer = buffer;
    }

    get ready() {
      return !!(this.ctx && this.master);
    }

    get now() {
      return this.ctx ? this.ctx.currentTime : 0;
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master && this.ctx) {
        this.master.gain.cancelScheduledValues(this.now);
        this.master.gain.setTargetAtTime(muted ? 0 : 0.62, this.now, 0.025);
      }
    }

    setMusicDucked(ducked) {
      this.musicDucked = ducked;
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setTargetAtTime(ducked ? 0.18 : 0.55, this.now, 0.15);
      }
    }

    tone(freq, endFreq, duration, volume, type = 'sine', delay = 0, filterFreq = 0) {
      if (!this.ready) return;
      const t0 = this.now + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, freq), t0);
      if (endFreq && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      let node = osc;
      if (filterFreq > 0) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        filter.Q.value = 0.7;
        osc.connect(filter);
        node = filter;
      }
      node.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    }

    noise(duration, volume, filterType = 'lowpass', frequency = 900, delay = 0, sweepTo = 0) {
      if (!this.ready) return;
      const t0 = this.now + delay;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(Math.max(30, frequency), t0);
      if (sweepTo) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + duration);
      }
      filter.Q.value = filterType === 'bandpass' ? 1.2 : 0.6;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(t0);
      source.stop(t0 + duration + 0.03);
    }

    play(name) {
      if (!this.ready) return;
      const t = this.now;
      const throttle = {
        enemyShot: 0.035,
        hit: 0.025,
        shieldHit: 0.04,
        explosion: 0.045,
      }[name];
      if (throttle && this.lastAt[name] && t - this.lastAt[name] < throttle) return;
      this.lastAt[name] = t;

      switch (name) {
        case 'cannon':
          this.tone(118, 38, 0.32, 0.24, 'sine');
          this.tone(250, 74, 0.14, 0.08, 'square', 0, 600);
          this.noise(0.16, 0.15, 'lowpass', 1500, 0, 260);
          break;
        case 'enemyShot':
          this.tone(340, 130, 0.12, 0.055, 'sawtooth', 0, 1600);
          this.noise(0.06, 0.025, 'bandpass', 1100);
          break;
        case 'heavyShot':
          this.tone(170, 52, 0.3, 0.11, 'square', 0, 500);
          this.noise(0.18, 0.08, 'lowpass', 850);
          break;
        case 'missile':
          this.noise(0.35, 0.07, 'bandpass', 700, 0, 2200);
          this.tone(190, 420, 0.35, 0.025, 'triangle');
          break;
        case 'hit':
          this.tone(700, 250, 0.06, 0.04, 'square');
          this.noise(0.045, 0.05, 'highpass', 1500);
          break;
        case 'shieldHit':
          this.tone(480, 980, 0.16, 0.08, 'sine');
          this.tone(1200, 620, 0.1, 0.04, 'triangle');
          break;
        case 'explosion':
          this.noise(0.55, 0.24, 'lowpass', 1400, 0, 90);
          this.tone(82, 24, 0.52, 0.18, 'sine');
          this.noise(0.2, 0.08, 'highpass', 900);
          break;
        case 'bigExplosion':
          this.noise(1.1, 0.34, 'lowpass', 1100, 0, 50);
          this.tone(70, 18, 1.0, 0.26, 'sine');
          this.tone(120, 40, 0.8, 0.1, 'sawtooth', 0, 400);
          break;
        case 'dash':
          this.noise(0.25, 0.09, 'bandpass', 360, 0, 1700);
          this.tone(160, 55, 0.2, 0.04, 'sine');
          break;
        case 'pickup':
          this.tone(660, 660, 0.11, 0.05, 'sine');
          this.tone(990, 990, 0.16, 0.045, 'sine', 0.07);
          break;
        case 'ui':
          this.tone(420, 500, 0.045, 0.025, 'square');
          break;
        case 'alarm':
          this.tone(220, 220, 0.16, 0.08, 'sawtooth', 0, 1200);
          this.tone(330, 330, 0.16, 0.06, 'sawtooth', 0.18, 1400);
          this.tone(220, 220, 0.16, 0.08, 'sawtooth', 0.36, 1200);
          break;
        case 'shieldDown':
          this.tone(520, 80, 0.65, 0.14, 'sawtooth', 0, 1000);
          this.noise(0.5, 0.12, 'bandpass', 500, 0, 120);
          break;
        case 'bossRoar':
          this.tone(58, 28, 1.1, 0.22, 'sawtooth', 0, 260);
          this.tone(87, 41, 0.9, 0.1, 'square', 0.05, 300);
          this.noise(1.2, 0.1, 'lowpass', 380, 0, 80);
          break;
        case 'bossPhase':
          this.tone(55, 30, 0.9, 0.2, 'sawtooth', 0, 240);
          this.tone(220, 440, 0.3, 0.06, 'square', 0.1, 1600);
          this.noise(0.7, 0.08, 'lowpass', 900);
          break;
        case 'shockwave':
          this.tone(90, 32, 0.5, 0.12, 'sine');
          this.noise(0.45, 0.11, 'lowpass', 500, 0, 90);
          break;
        case 'beam':
          this.tone(660, 280, 0.55, 0.045, 'sawtooth', 0, 1800);
          this.noise(0.35, 0.045, 'bandpass', 1600, 0, 500);
          break;
        case 'charge':
          this.tone(120, 720, 0.8, 0.05, 'sawtooth', 0, 1400);
          this.tone(240, 1440, 0.8, 0.025, 'triangle', 0.05);
          this.noise(0.8, 0.035, 'bandpass', 500, 0, 2600);
          break;
        case 'levelClear':
          [440, 554.37, 659.25, 880].forEach((freq, i) => {
            this.tone(freq, freq, 0.38, 0.065, 'triangle', i * 0.12);
          });
          break;
        case 'victory':
          [220, 277.18, 329.63, 440, 554.37].forEach((freq, i) => {
            this.tone(freq, freq, 1.8, 0.07, 'triangle', i * 0.09);
          });
          this.tone(110, 55, 2.4, 0.08, 'sine');
          break;
        case 'gameOver':
          [220, 185, 146.83, 110].forEach((freq, i) => {
            this.tone(freq, freq * 0.94, 0.7, 0.08, 'sawtooth', i * 0.22, 700);
          });
          break;
        default:
          break;
      }
    }

    startMusic(levelId) {
      if (!this.ready) return;
      this.stopMusic();
      const themes = {
        dust: { root: 55, chord: [1, 1.5, 2, 2.4], scale: [1, 1.2, 1.5, 1.8, 2], tempo: 2.4 },
        cryo: { root: 65.41, chord: [1, 1.5, 2.25, 2.5], scale: [1, 1.33, 1.5, 2, 2.67], tempo: 2.8 },
        ash: { root: 49, chord: [1, 1.5, 2, 2.67], scale: [1, 1.2, 1.5, 1.8, 2.4], tempo: 2.1 },
        sovereign: { root: 41.2, chord: [1, 1.5, 1.89, 2.38], scale: [1, 1.2, 1.5, 1.8, 2], tempo: 1.45 },
      };
      const theme = themes[levelId] || themes.dust;
      this.musicTheme = theme;
      this.musicGain.gain.setValueAtTime(this.musicDucked ? 0.18 : 0.55, this.now);

      const padGain = this.ctx.createGain();
      padGain.gain.value = 0.0001;
      padGain.connect(this.musicGain);
      padGain.gain.setTargetAtTime(0.042, this.now, 1.1);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = levelId === 'sovereign' ? 260 : 420;
      filter.Q.value = 1.2;
      filter.connect(padGain);

      theme.chord.forEach((ratio, index) => {
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = index === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.value = theme.root * ratio;
        osc.detune.value = index * 4 - 6;
        oscGain.gain.value = index === 0 ? 0.18 : 0.1;
        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start();
        this.musicNodes.push(osc);
      });

      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.055;
      lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain);
      lfoGain.connect(padGain.gain);
      lfo.start();
      this.musicNodes.push(lfo);

      let step = 0;
      const playStep = () => {
        if (!this.ready) return;
        const ratio = theme.scale[step % theme.scale.length];
        const freq = theme.root * ratio * (step % 4 === 3 ? 2 : 4);
        this.musicNote(freq, 0.05, levelId === 'sovereign' ? 0.06 : 0.035);
        if (levelId === 'sovereign' && step % 2 === 0) {
          this.musicNote(theme.root * 0.7, 0.55, 0.06, 'sine');
        }
        step += 1;
      };
      playStep();
      this.musicTimer = window.setInterval(playStep, theme.tempo * 1000);
    }

    musicNote(freq, duration, volume, type = 'triangle') {
      if (!this.ready || !this.musicGain) return;
      const t0 = this.now;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    }

    stopMusic() {
      if (this.musicTimer) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setTargetAtTime(0.0001, this.now, 0.12);
      }
      const nodes = this.musicNodes.slice();
      this.musicNodes = [];
      if (this.ctx) {
        window.setTimeout(() => {
          nodes.forEach((node) => {
            try {
              node.stop();
            } catch (error) {
              /* already stopped */
            }
          });
        }, 300);
      }
    }

    victorySting() {
      this.stopMusic();
      this.play('victory');
    }
  }

  IRON.AudioEngine = AudioEngine;
})();
