(function () {
  // Machine Math — improved visuals & audio (only visuals/audio changed)
  // Renders inside the element with ID "game-of-the-day-stage".
  // Controls unchanged.

  // -----------------------
  // Setup container & canvas
  // -----------------------
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Error: container element with id "game-of-the-day-stage" not found.');
    return;
  }
  container.style.position = 'relative';
  container.style.userSelect = 'none';
  container.setAttribute('tabindex', '0'); // focusable

  // Clean container
  container.innerHTML = '';

  // Accessibility live region (offscreen)
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  container.appendChild(liveRegion);

  // Canvas creation (exactly 720x480)
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  canvas.setAttribute('aria-label', 'Machine Math game canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Focus container for keyboard input
  container.focus();

  // -----------------------
  // Utility functions
  // -----------------------
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function safeText(s) {
    return String(s);
  }

  // -----------------------
  // Enhanced Audio Manager
  // - Uses layered ambient pad, LFOs, simple noise generator
  // - All sounds synthesized via Web Audio API
  // -----------------------
  class AudioManager {
    constructor() {
      this.enabled = true;
      this.available = false;
      this.ctx = null;
      this.master = null;
      this.bgGain = null;
      this.pad = null;
      this.padFilter = null;
      this.padLfo = null;
      this.noiseBuffer = null;
      this.initPromise = this.init();
    }

    async init() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio API not supported');

        this.ctx = new AudioCtx();

        // master gain
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);

        // background pad (gentle ambient)
        this.bgGain = this.ctx.createGain();
        this.bgGain.gain.value = 0.02;
        this.bgGain.connect(this.master);

        // create pad filter
        this.padFilter = this.ctx.createBiquadFilter();
        this.padFilter.type = 'lowpass';
        this.padFilter.frequency.value = 900;
        this.padFilter.Q.value = 0.7;
        this.padFilter.connect(this.bgGain);

        // two detuned oscillators for warm pad
        const o1 = this.ctx.createOscillator();
        o1.type = 'sine';
        o1.frequency.value = 110;
        const o2 = this.ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.value = 112;

        const padGain1 = this.ctx.createGain();
        padGain1.gain.value = 0.012;
        const padGain2 = this.ctx.createGain();
        padGain2.gain.value = 0.01;

        o1.connect(padGain1);
        o2.connect(padGain2);
        padGain1.connect(this.padFilter);
        padGain2.connect(this.padFilter);

        this.pad = { o1, o2, g1: padGain1, g2: padGain2 };

        // subtle LFO modulating pad filter cutoff
        this.padLfo = this.ctx.createOscillator();
        this.padLfo.type = 'sine';
        this.padLfo.frequency.value = 0.06;
        this.padLfoGain = this.ctx.createGain();
        this.padLfoGain.gain.value = 220; // mod depth
        this.padLfo.connect(this.padLfoGain);
        this.padLfoGain.connect(this.padFilter.frequency);

        // try to start oscillators (may throw if not user-gestureed)
        try {
          o1.start();
          o2.start();
          this.padLfo.start();
        } catch (e) {
          // browsers may prevent starting before interaction
        }

        // pre-generate a short noise buffer for percussive sounds
        this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 1, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.5));
        }

        this.available = true;
        return true;
      } catch (err) {
        console.warn('Audio init failed:', err);
        this.available = false;
        return false;
      }
    }

    async ensureStarted() {
      if (!this.available) return false;
      try {
        if (this.ctx.state === 'suspended') {
          await this.ctx.resume();
        }
        // gently bring pad up a little
        if (this.bgGain) this.bgGain.gain.setTargetAtTime(0.02, this.ctx.currentTime, 0.05);
        return true;
      } catch (err) {
        console.warn('Audio resume failed:', err);
        return false;
      }
    }

    setMuted(muted) {
      this.enabled = !muted;
      if (this.master) {
        // smooth ramp
        try {
          const t = this.ctx.currentTime;
          this.master.gain.cancelScheduledValues(t);
          this.master.gain.setValueAtTime(this.master.gain.value, t);
          this.master.gain.linearRampToValueAtTime(this.enabled ? 0.9 : 0.0, t + 0.08);
        } catch (e) {
          this.master.gain.value = this.enabled ? 0.9 : 0;
        }
      }
    }

    // short click with small noise tail (less harsh)
    playClick() {
      if (!this.available || !this.enabled) return;
      try {
        const t = this.ctx.currentTime;
        // tone
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 820;
        const g = this.ctx.createGain();
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(this.master);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        o.start(t);
        o.stop(t + 0.16);

        // subtle noise tail (buffer source)
        const nb = this.ctx.createBufferSource();
        nb.buffer = this.noiseBuffer;
        const ng = this.ctx.createGain();
        ng.gain.value = 0.0008;
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'highpass';
        nf.frequency.value = 1500;
        nb.connect(nf);
        nf.connect(ng);
        ng.connect(this.master);
        nb.start(t);
        ng.gain.exponentialRampToValueAtTime(0.000001, t + 0.18);
        nb.stop(t + 0.18);
      } catch (e) {
        console.warn('playClick error', e);
      }
    }

    // warm, bell-like arpeggio for correct answer
    playCorrect() {
      if (!this.available || !this.enabled) return;
      try {
        const now = this.ctx.currentTime;
        const notes = [660, 880, 1100];
        notes.forEach((freq, i) => {
          const o = this.ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = freq;
          // slight FM for sparkle
          const fm = this.ctx.createOscillator();
          fm.type = 'sine';
          fm.frequency.value = 4 + i;
          const fmGain = this.ctx.createGain();
          fmGain.gain.value = 4 + i * 2;
          fm.connect(fmGain);
          fmGain.connect(o.frequency);
          const g = this.ctx.createGain();
          g.gain.value = 0.0001;
          o.connect(g);
          g.connect(this.master);
          const t0 = now + i * 0.09;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.06);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
          try {
            fm.start(t0);
          } catch (e) {}
          o.start(t0);
          o.stop(t0 + 0.8);
          fm.stop(t0 + 0.8);
        });
      } catch (e) {
        console.warn('playCorrect error', e);
      }
    }

    // soft descending thud with filtered noise for wrong answer
    playWrong() {
      if (!this.available || !this.enabled) return;
      try {
        const now = this.ctx.currentTime;
        // low saw oscillator
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.45);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1200, now);
        f.frequency.exponentialRampToValueAtTime(300, now + 0.45);
        const g = this.ctx.createGain();
        g.gain.value = 0.00001;
        o.connect(f);
        f.connect(g);
        g.connect(this.master);
        g.gain.setValueAtTime(0.00001, now);
        g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.00001, now + 0.6);
        o.start(now);
        o.stop(now + 0.62);

        // hit of filtered noise for body
        const nb = this.ctx.createBufferSource();
        nb.buffer = this.noiseBuffer;
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = 250;
        nf.Q.value = 0.8;
        const ng = this.ctx.createGain();
        ng.gain.value = 0.0008;
        nb.connect(nf);
        nf.connect(ng);
        ng.connect(this.master);
        ng.gain.setValueAtTime(0.0008, now);
        ng.gain.exponentialRampToValueAtTime(0.000001, now + 0.6);
        nb.start(now);
        nb.stop(now + 0.6);
      } catch (e) {
        console.warn('playWrong error', e);
      }
    }

    // mechanical process whoosh: percussive clicks + descending metallic ring
    playProcess() {
      if (!this.available || !this.enabled) return;
      try {
        const now = this.ctx.currentTime;
        // quick rhythmic clicks
        for (let i = 0; i < 3; i++) {
          const t0 = now + i * 0.08;
          const o = this.ctx.createOscillator();
          o.type = 'square';
          o.frequency.value = 1000 - i * 180;
          const g = this.ctx.createGain();
          g.gain.value = 0.0001;
          o.connect(g);
          g.connect(this.master);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.06 - i * 0.01, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
          o.start(t0);
          o.stop(t0 + 0.14);
        }

        // metallic descending thin ring
        const o2 = this.ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(900, now);
        o2.frequency.exponentialRampToValueAtTime(220, now + 0.9);
        const bf = this.ctx.createBiquadFilter();
        bf.type = 'highpass';
        bf.frequency.value = 400;
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.000001, now);
        o2.connect(bf);
        bf.connect(g2);
        g2.connect(this.master);
        g2.gain.linearRampToValueAtTime(0.09, now + 0.06);
        g2.gain.exponentialRampToValueAtTime(0.000001, now + 1.0);
        o2.start(now);
        o2.stop(now + 1.0);
      } catch (e) {
        console.warn('playProcess error', e);
      }
    }
  }

  const audio = new AudioManager();

  // -----------------------
  // Game logic (unchanged)
  // -----------------------
  const OPS = ['+', '-', '×']; // multiplication shown as ×
  function applyOp(a, op, b) {
    if (op === '+') return a + b;
    if (op === '-') return a - b;
    if (op === '×') return a * b;
    return a;
  }

  class MachineGame {
    constructor(ctx, canvas, audio, liveRegion) {
      this.ctx = ctx;
      this.canvas = canvas;
      this.audio = audio;
      this.liveRegion = liveRegion;

      // game state
      this.numbers = [1, 2, 3];
      this.ops = ['+', '+'];
      this.target = 0;
      this.attempts = 0;
      this.maxAttempts = 4;
      this.round = 0;
      this.totalRounds = 6;
      this.solvedCount = 0;
      this.selectionIndex = 0; // 0..4 mapping: 0 gear0,1 op0,2 gear1,3 op1,4 gear2
      this.animationTime = 0;
      this.running = true;
      this.muted = false;

      // visual elements
      this.gearAngle = 0;
      this.particles = [];
      this.confetti = [];

      // mascot blink state
      this.mascot = {
        blinkTimer: randInt(120, 280),
        bob: 0
      };

      // initialize first round
      this.newRound();

      // input handlers
      this.setupInput();

      // start animation loop
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame((t) => this.frame(t));
    }

    newRound() {
      this.round++;
      if (this.round > this.totalRounds) {
        // done; show summary
        this.endGame();
        return;
      }
      // generate numbers and compute target using a random solution
      this.numbers = [randInt(1, 9), randInt(1, 9), randInt(1, 9)];
      const solutionOps = [OPS[randInt(0, OPS.length - 1)], OPS[randInt(0, OPS.length - 1)]];
      let value = applyOp(this.numbers[0], solutionOps[0], this.numbers[1]);
      value = applyOp(value, solutionOps[1], this.numbers[2]);
      this.target = value;
      // scramble displayed ops
      this.ops = [OPS[randInt(0, OPS.length - 1)], OPS[randInt(0, OPS.length - 1)]];
      // reset attempts
      this.attempts = 0;
      this.selectionIndex = 0;
      this.addLive(`Round ${this.round} of ${this.totalRounds}. Target ${this.target}. Use arrows or click to set operations and numbers. Press Enter to process.`);
    }

    endGame() {
      this.running = false;
      this.addLive(`Game complete. You solved ${this.solvedCount} out of ${this.totalRounds} puzzles.`);
    }

    addLive(text) {
      try {
        this.liveRegion.textContent = text;
      } catch (e) {
        // ignore
      }
    }

    setupInput() {
      // keyboard
      this.keyDownHandler = (e) => {
        // ensure audio context is started on first user interaction
        if (this.audio && this.audio.available) {
          this.audio.ensureStarted().catch(() => {});
        }
        if (!this.running) {
          // allow restart with Enter
          if (e.key === 'Enter') {
            this.restart();
          }
          return;
        }

        if (e.key === 'ArrowLeft') {
          this.selectionIndex = clamp(this.selectionIndex - 1, 0, 4);
          this.audio.playClick();
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          this.selectionIndex = clamp(this.selectionIndex + 1, 0, 4);
          this.audio.playClick();
          e.preventDefault();
        } else if (e.key === 'ArrowUp') {
          this.changeSelected(1);
          e.preventDefault();
        } else if (e.key === 'ArrowDown') {
          this.changeSelected(-1);
          e.preventDefault();
        } else if (e.key === ' ' || e.key === 'Spacebar') {
          this.toggleSelected();
          e.preventDefault();
        } else if (e.key === 'Enter') {
          this.processMachine();
          e.preventDefault();
        } else if (e.key.toLowerCase() === 'm') {
          this.toggleMute();
          e.preventDefault();
        }
      };
      container.addEventListener('keydown', this.keyDownHandler);

      // pointer events
      this.canvas.addEventListener('pointerdown', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        this.handlePointer(x, y);
        // start audio context on interaction
        if (this.audio && this.audio.available) {
          this.audio.ensureStarted().catch(() => {});
        }
      });
    }

    restart() {
      this.round = 0;
      this.solvedCount = 0;
      this.running = true;
      this.newRound();
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame((t) => this.frame(t));
    }

    toggleMute() {
      this.muted = !this.muted;
      this.audio.setMuted(this.muted);
      this.addLive(this.muted ? 'Sound muted.' : 'Sound unmuted.');
    }

    changeSelected(delta) {
      if (!this.running) return;
      if (this.selectionIndex % 2 === 0) {
        const gearIndex = this.selectionIndex / 2;
        this.numbers[gearIndex] = clamp(this.numbers[gearIndex] + delta, 1, 12);
        this.audio.playClick();
      } else {
        const opIndex = Math.floor(this.selectionIndex / 2);
        const currentIndex = OPS.indexOf(this.ops[opIndex]);
        const nextIndex = (currentIndex + (delta > 0 ? 1 : OPS.length - 1)) % OPS.length;
        this.ops[opIndex] = OPS[nextIndex];
        this.audio.playClick();
      }
      this.addLive(`Selected ${this.describeSelection()}. Numbers: ${this.numbers.join(', ')}. Operations: ${this.ops.join(', ')}.`);
    }

    toggleSelected() {
      if (!this.running) return;
      if (this.selectionIndex % 2 === 0) {
        const gearIndex = this.selectionIndex / 2;
        this.numbers[gearIndex] = randInt(1, 9);
        this.audio.playClick();
      } else {
        const opIndex = Math.floor(this.selectionIndex / 2);
        const i = OPS.indexOf(this.ops[opIndex]);
        this.ops[opIndex] = OPS[(i + 1) % OPS.length];
        this.audio.playClick();
      }
      this.addLive(`Selected ${this.describeSelection()}.`);
    }

    describeSelection() {
      if (this.selectionIndex % 2 === 0) {
        return `gear ${this.selectionIndex / 2 + 1}`;
      } else {
        return `lever ${Math.floor(this.selectionIndex / 2) + 1}`;
      }
    }

    handlePointer(x, y) {
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;
      const gearX = [cx - 200, cx, cx + 200];
      const gearY = cy - 20;
      const gearR = 60;
      for (let i = 0; i < 3; i++) {
        const dx = x - gearX[i];
        const dy = y - gearY;
        if (dx * dx + dy * dy <= gearR * gearR) {
          this.selectionIndex = i * 2;
          this.numbers[i] = (this.numbers[i] % 9) + 1;
          this.audio.playClick();
          this.addLive(`Changed gear ${i + 1} to ${this.numbers[i]}.`);
          return;
        }
      }

      const leverX = [cx - 100, cx + 100];
      const leverY = cy - 20;
      const leverW = 80;
      const leverH = 40;
      for (let j = 0; j < 2; j++) {
        const lx = leverX[j] - leverW / 2;
        const ly = leverY - leverH / 2 - 20;
        if (x >= lx && x <= lx + leverW && y >= ly && y <= ly + leverH) {
          this.selectionIndex = j * 2 + 1;
          const idx = OPS.indexOf(this.ops[j]);
          this.ops[j] = OPS[(idx + 1) % OPS.length];
          this.audio.playClick();
          this.addLive(`Set lever ${j + 1} to ${this.ops[j]}.`);
          return;
        }
      }

      const btnX = this.canvas.width / 2 - 80;
      const btnY = this.canvas.height - 80;
      const btnW = 160;
      const btnH = 48;
      if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
        this.processMachine();
      }
    }

    processMachine() {
      if (!this.running) return;
      this.attempts++;
      this.audio.playProcess();
      let v = applyOp(this.numbers[0], this.ops[0], this.numbers[1]);
      v = applyOp(v, this.ops[1], this.numbers[2]);
      if (v === this.target) {
        this.solvedCount++;
        this.addLive(`Correct! You reached ${v}. Great job!`);
        this.audio.playCorrect();
        this.spawnConfetti(30);
        setTimeout(() => {
          this.newRound();
        }, 900);
      } else {
        this.audio.playWrong();
        this.addLive(`Oops — result ${v} does not match target ${this.target}. Attempt ${this.attempts} of ${this.maxAttempts}.`);
        if (this.attempts >= this.maxAttempts) {
          const sol = this.findSolution();
          if (sol) {
            this.addLive(
              `Here's a helpful hint: try ${this.numbers[0]} ${sol[0]} ${this.numbers[1]} ${sol[1]} ${this.numbers[2]} = ${this.target}. Moving to next round.`
            );
            this.spawnParticles(20);
            setTimeout(() => {
              this.newRound();
            }, 1400);
          } else {
            this.addLive('No valid solution found (unexpected). Moving on.');
            setTimeout(() => this.newRound(), 1000);
          }
        }
      }
    }

    findSolution() {
      for (const a of OPS) {
        for (const b of OPS) {
          let v = applyOp(this.numbers[0], a, this.numbers[1]);
          v = applyOp(v, b, this.numbers[2]);
          if (v === this.target) return [a, b];
        }
      }
      return null;
    }

    spawnParticles(n) {
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: this.canvas.width / 2 + randInt(-50, 50),
          y: this.canvas.height / 2 + randInt(-30, 30),
          vx: (Math.random() - 0.5) * 2,
          vy: -Math.random() * 2 - 1,
          life: randInt(40, 80),
          color: `hsla(${randInt(160, 220)},50%,60%,0.9)`
        });
      }
    }

    spawnConfetti(n) {
      for (let i = 0; i < n; i++) {
        this.confetti.push({
          x: this.canvas.width / 2 + randInt(-200, 200),
          y: this.canvas.height / 2 - 60 + randInt(-20, 20),
          vx: (Math.random() - 0.5) * 6,
          vy: Math.random() * 3 + 1,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.2,
          life: randInt(80, 180),
          color: `hsla(${randInt(0, 360)},70%,60%,0.95)`
        });
      }
    }

    updateParticles() {
      for (let p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.life--;
      }
      this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.canvas.height + 50);

      for (let c of this.confetti) {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.05;
        c.rot += c.vr;
        c.life--;
      }
      this.confetti = this.confetti.filter((c) => c.life > 0 && c.y < this.canvas.height + 50);
    }

    // Improved background: soft gradient, subtle grid, floating orbs, ground band
    drawBackground() {
      // vertical soft gradient
      const g = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
      g.addColorStop(0, '#EAF7F6');
      g.addColorStop(0.6, '#F6FBFF');
      g.addColorStop(1, '#FFFFFF');
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // subtle diagonal grid for depth
      this.ctx.save();
      this.ctx.globalAlpha = 0.03;
      this.ctx.strokeStyle = '#0B8793';
      this.ctx.lineWidth = 1;
      for (let i = -this.canvas.height; i < this.canvas.width; i += 28) {
        this.ctx.beginPath();
        this.ctx.moveTo(i + (this.animationTime * 0.02 % 28), 0);
        this.ctx.lineTo(i + this.canvas.height + (this.animationTime * 0.02 % 28), this.canvas.height);
        this.ctx.stroke();
      }
      this.ctx.restore();

      // floating soft orbs (parallax)
      for (let i = 0; i < 5; i++) {
        const x = (i * 170 + this.animationTime * (0.03 + 0.01 * i)) % (this.canvas.width + 300) - 120;
        const y = 80 + Math.sin((i + this.animationTime / 600) * 0.9) * 12;
        this.ctx.beginPath();
        const orbGrad = this.ctx.createRadialGradient(x - 6, y - 6, 2, x, y, 80);
        orbGrad.addColorStop(0, 'rgba(11,135,147,0.08)');
        orbGrad.addColorStop(1, 'rgba(255,255,255,0)');
        this.ctx.fillStyle = orbGrad;
        this.ctx.arc(x, y, 80, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // soft ground band
      this.ctx.fillStyle = 'rgba(12,45,60,0.02)';
      this.ctx.fillRect(0, this.canvas.height - 60, this.canvas.width, 80);

      // gentle vignette
      this.ctx.save();
      const v = this.ctx.createRadialGradient(
        this.canvas.width / 2,
        this.canvas.height / 2,
        120,
        this.canvas.width / 2,
        this.canvas.height / 2,
        700
      );
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.04)');
      this.ctx.fillStyle = v;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }

    // Draw a friendly robot mascot to add charm (canvas only)
    drawMascot(x, y, scale = 1) {
      // bobbing
      const bob = Math.sin(this.animationTime / 600) * 4;
      // body shadow
      this.ctx.save();
      this.ctx.translate(x, y + bob);
      this.ctx.scale(scale, scale);

      // shadow under mascot
      this.ctx.beginPath();
      this.ctx.fillStyle = 'rgba(10,20,20,0.08)';
      this.ctx.ellipse(0, 76, 48, 12, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // body
      this.ctx.beginPath();
      this.ctx.fillStyle = '#F6FBFA';
      this.ctx.roundRect ? this.ctx.roundRect(-36, -10, 72, 80, 10) : this.roundedRect(this.ctx, -36, -10, 72, 80, 10);
      this.ctx.fill();

      // chest panel
      this.ctx.beginPath();
      this.ctx.fillStyle = '#D7EEF2';
      this.ctx.fillRect(-28, 6, 56, 36);
      // little screen
      this.ctx.beginPath();
      this.ctx.fillStyle = '#0B8793';
      this.ctx.fillRect(-18, 12, 36, 24);
      // eyes (blinking)
      const blink = this.mascot.blinkTimer <= 6;
      this.ctx.beginPath();
      this.ctx.fillStyle = '#073B4C';
      if (blink) {
        this.ctx.fillRect(-10, -4, 8, 2);
        this.ctx.fillRect(2, -4, 8, 2);
      } else {
        this.ctx.arc(-6, -6, 6, 0, Math.PI * 2);
        this.ctx.arc(6, -6, 6, 0, Math.PI * 2);
        this.ctx.fill();
        // eye reflections
        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.beginPath();
        this.ctx.arc(-4, -8, 2, 0, Math.PI * 2);
        this.ctx.arc(8, -8, 2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // antenna
      this.ctx.beginPath();
      this.ctx.strokeStyle = '#D6EEF3';
      this.ctx.lineWidth = 3;
      this.ctx.moveTo(0, -10);
      this.ctx.lineTo(0, -32);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.fillStyle = '#FFB86B';
      this.ctx.arc(0, -36, 6, 0, Math.PI * 2);
      this.ctx.fill();

      // smile
      this.ctx.beginPath();
      this.ctx.strokeStyle = '#073B4C';
      this.ctx.lineWidth = 2;
      this.ctx.arc(0, 6, 10, 0, Math.PI, false);
      this.ctx.stroke();

      this.ctx.restore();

      // update blink timer
      this.mascot.blinkTimer--;
      if (this.mascot.blinkTimer <= 0) {
        this.mascot.blinkTimer = randInt(120, 280);
      }
    }

    // Machine drawing updated with shadows, highlights, and selection glow
    drawMachine() {
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;

      // machine base with subtle shadow
      this.ctx.save();
      this.ctx.shadowColor = 'rgba(14,44,52,0.12)';
      this.ctx.shadowBlur = 18;
      this.ctx.fillStyle = '#E9F8F6';
      this.roundedRect(this.ctx, cx - 320, cy - 120, 640, 240, 28);
      this.ctx.fill();
      this.ctx.restore();

      // console panel with inner glow
      this.ctx.save();
      this.ctx.fillStyle = '#D8EEF1';
      this.roundedRect(this.ctx, cx - 260, cy - 100, 520, 76, 14);
      this.ctx.fill();
      this.ctx.restore();

      // small status badges
      this.ctx.fillStyle = '#073B4C';
      this.ctx.font = '18px "Segoe UI", Roboto, sans-serif';
      this.ctx.fillText('Target', cx - 240, cy - 72);
      this.ctx.fillStyle = '#0B8793';
      this.ctx.font = '34px "Segoe UI", Roboto, sans-serif';
      this.ctx.fillText(String(this.target), cx - 160, cy - 68);

      // round/attempts
      this.ctx.fillStyle = '#073B4C';
      this.ctx.font = '14px "Segoe UI", Roboto, sans-serif';
      this.ctx.fillText(`Round ${this.round}/${this.totalRounds}`, cx + 10, cy - 72);
      this.ctx.fillText(`Attempts ${this.attempts}/${this.maxAttempts}`, cx + 10, cy - 52);

      // decorative subtle ruler under console
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(11,135,147,0.08)';
      this.ctx.lineWidth = 2;
      for (let i = -200; i <= 200; i += 20) {
        this.ctx.beginPath();
        this.ctx.moveTo(cx + i, cy - 48);
        this.ctx.lineTo(cx + i, cy - 38);
        this.ctx.stroke();
      }
      this.ctx.restore();

      // draw levers (ops)
      const leverX = [cx - 100, cx + 100];
      const gearY = cy - 20;
      for (let j = 0; j < 2; j++) {
        const lx = leverX[j];
        const ly = gearY;
        const w = 84;
        const h = 44;
        // lever body with slight gradient
        const lg = this.ctx.createLinearGradient(lx - w / 2, ly - h / 2 - 20, lx + w / 2, ly + h / 2 - 20);
        lg.addColorStop(0, '#FFFFFF');
        lg.addColorStop(1, '#E6F6F6');
        this.ctx.fillStyle = lg;
        this.roundedRect(this.ctx, lx - w / 2, ly - h / 2 - 20, w, h, 12);
        this.ctx.fill();

        // highlight if selected
        if (this.selectionIndex === j * 2 + 1) {
          this.ctx.save();
          this.ctx.globalAlpha = 0.22;
          this.ctx.fillStyle = '#0B8793';
          this.roundedRect(this.ctx, lx - w / 2 - 6, ly - h / 2 - 26, w + 12, h + 12, 14);
          this.ctx.fill();
          this.ctx.restore();
        }

        // op label
        this.ctx.fillStyle = this.selectionIndex === j * 2 + 1 ? '#062E31' : '#274B53';
        this.ctx.font = '28px "Segoe UI", Roboto, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.ops[j], lx, ly - 8 - 20 + 4);
        // little handle
        this.ctx.beginPath();
        this.ctx.fillStyle = '#D6EEF3';
        this.ctx.ellipse(lx, ly + 18 - 20, 30, 9, 0, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // draw gears
      const gearX = [cx - 200, cx, cx + 200];
      const gearR = 60;
      for (let i = 0; i < 3; i++) {
        const x = gearX[i];
        const y = gearY;
        const angle = this.gearAngle * (i % 2 === 0 ? 1 : -1) * (1 + i * 0.1);
        const selected = this.selectionIndex === i * 2;
        // add small bounce to selected gear
        const bounce = selected ? Math.sin(this.animationTime / 80) * 3 : 0;
        this.drawGear(
          x,
          y + bounce,
          gearR,
          angle,
          i === 0 ? '#CFF7E6' : i === 1 ? '#FFF0C4' : '#FFDDE8',
          selected ? '#0B8793' : '#376B78',
          String(this.numbers[i]),
          selected
        );
      }

      // process button with glow
      const btnX = this.canvas.width / 2 - 80;
      const btnY = this.canvas.height - 80;
      const btnW = 160;
      const btnH = 48;
      this.ctx.save();
      // glow
      this.ctx.beginPath();
      this.ctx.fillStyle = 'rgba(11,135,147,0.12)';
      this.ctx.roundRect ? this.ctx.roundRect(btnX - 8, btnY - 6, btnW + 16, btnH + 12, 16) : this.roundedRect(this.ctx, btnX - 8, btnY - 6, btnW + 16, btnH + 12, 16);
      this.ctx.fill();
      // button
      this.ctx.fillStyle = '#0B8793';
      this.roundedRect(this.ctx, btnX, btnY, btnW, btnH, 14);
      this.ctx.fill();
      // label
      this.ctx.fillStyle = '#F6FBFA';
      this.ctx.font = '20px "Segoe UI", Roboto, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('Process', btnX + btnW / 2, btnY + btnH / 2);
      this.ctx.restore();

      // sound indicator pill
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.fillStyle = this.muted ? 'rgba(255,90,90,0.95)' : 'rgba(125,211,199,0.95)';
      this.ctx.ellipse(this.canvas.width - 48, 40, 22, 14, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#073B4C';
      this.ctx.font = '12px "Segoe UI", Roboto, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(this.muted ? 'Muted' : 'Audio', this.canvas.width - 72, 44);
      this.ctx.restore();

      // mascot left side
      this.drawMascot(84, this.canvas.height / 2 + 40, 1.0);
    }

    // Custom gear drawing using canvas primitives with highlights/shadows
    drawGear(cx, cy, r, angle, fillColor, strokeColor, label, selected = false) {
      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.rotate(angle);

      // shadow/glow
      if (selected) {
        this.ctx.shadowColor = 'rgba(11,135,147,0.25)';
        this.ctx.shadowBlur = 18;
      } else {
        this.ctx.shadowColor = 'rgba(0,0,0,0.08)';
        this.ctx.shadowBlur = 12;
      }

      // outer teeth
      this.ctx.beginPath();
      const teeth = 12;
      for (let t = 0; t < teeth; t++) {
        const a0 = (t / teeth) * Math.PI * 2;
        const a1 = ((t + 0.5) / teeth) * Math.PI * 2;
        const a2 = ((t + 1) / teeth) * Math.PI * 2;
        const r0 = r;
        const r1 = r + 9;
        const x0 = Math.cos(a0) * r0;
        const y0 = Math.sin(a0) * r0;
        const x1 = Math.cos(a1) * r1;
        const y1 = Math.sin(a1) * r1;
        const x2 = Math.cos(a2) * r0;
        const y2 = Math.sin(a2) * r0;
        if (t === 0) this.ctx.moveTo(x0, y0);
        this.ctx.lineTo(x1, y1);
        this.ctx.lineTo(x2, y2);
      }
      this.ctx.closePath();

      // tooth fill with gradient
      const tg = this.ctx.createLinearGradient(-r, -r, r, r);
      tg.addColorStop(0, this._lightenColor(fillColor, 0.08));
      tg.addColorStop(1, fillColor);
      this.ctx.fillStyle = tg;
      this.ctx.fill();

      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = strokeColor;
      this.ctx.stroke();

      // inner disc
      this.ctx.beginPath();
      this.ctx.arc(0, 0, r - 18, 0, Math.PI * 2);
      this.ctx.fillStyle = '#F8FFFF';
      this.ctx.fill();
      this.ctx.strokeStyle = '#D6EEF3';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // center label
      this.ctx.fillStyle = '#073B4C';
      this.ctx.font = '28px "Segoe UI", Roboto, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(label, 0, 0);

      // subtle metallic highlight arc
      this.ctx.beginPath();
      this.ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      this.ctx.lineWidth = 2;
      this.ctx.arc(-8, -8, r - 22, -0.6, 1.2);
      this.ctx.stroke();

      // reset shadow
      this.ctx.restore();
    }

    // small helper to slightly lighten a hex color (basic)
    _lightenColor(hex, amount) {
      try {
        // accept #RRGGBB or rgb(...) or named - fallback to original
        if (hex[0] === '#') {
          const num = parseInt(hex.slice(1), 16);
          let r = (num >> 16) + Math.round(255 * amount);
          let g = ((num >> 8) & 0x00FF) + Math.round(255 * amount);
          let b = (num & 0x0000FF) + Math.round(255 * amount);
          r = clamp(r, 0, 255);
          g = clamp(g, 0, 255);
          b = clamp(b, 0, 255);
          return `rgb(${r},${g},${b})`;
        }
      } catch (e) {
        // ignore and return original
      }
      return hex;
    }

    roundedRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    // Overlay includes confetti, particles, instruction card with translucent glass look
    drawOverlay() {
      // confetti
      for (let c of this.confetti) {
        this.ctx.save();
        this.ctx.translate(c.x, c.y);
        this.ctx.rotate(c.rot);
        this.ctx.fillStyle = c.color;
        this.ctx.fillRect(-5, -7, 10, 14);
        this.ctx.restore();
      }

      // floating particles
      for (let p of this.particles) {
        this.ctx.beginPath();
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = clamp(p.life / 80, 0, 1);
        this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      }

      // instructions "glass" panel bottom-left
      const x = 18;
      const y = this.canvas.height - 138;
      this.ctx.save();
      // slight backdrop
      this.ctx.fillStyle = 'rgba(255,255,255,0.65)';
      this.roundedRect(this.ctx, x, y, 300, 120, 12);
      this.ctx.fill();
      // thin border
      this.ctx.strokeStyle = 'rgba(11,135,147,0.08)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      this.ctx.restore();

      this.ctx.fillStyle = '#073B4C';
      this.ctx.font = '14px "Segoe UI", Roboto, sans-serif';
      this.ctx.fillText('Controls', x + 12, y + 24);
      this.ctx.font = '12px "Segoe UI", Roboto, sans-serif';
      this.ctx.fillText('← / → : move selection', x + 12, y + 44);
      this.ctx.fillText('↑ / ↓ : change number or operation', x + 12, y + 64);
      this.ctx.fillText('Space : randomize selection', x + 12, y + 84);
      this.ctx.fillText('Enter : process   M : mute/unmute', x + 12, y + 104);
    }

    frame(t) {
      if (!this.running) {
        // final screen
        this.drawBackground();
        ctx.fillStyle = '#073B4C';
        ctx.font = '28px "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`All done! You solved ${this.solvedCount}/${this.totalRounds} puzzles.`, 60, 200);
        ctx.font = '18px "Segoe UI", Roboto, sans-serif';
        ctx.fillText('Press Enter to play again.', 60, 240);
        return;
      }

      const dt = (t - this.lastTime) / 1000;
      this.lastTime = t;
      this.animationTime += dt * 1000;
      this.gearAngle += dt * 0.9;

      // update mascot bob (small)
      this.mascot.bob = Math.sin(this.animationTime / 600) * 3;

      // update particles
      this.updateParticles();

      // clear and draw
      this.drawBackground();
      this.drawMachine();
      this.drawOverlay();

      // floating status text
      this.ctx.fillStyle = '#0B8793';
      this.ctx.font = '14px "Segoe UI", Roboto, sans-serif';
      this.ctx.fillText(`Try to make the machine output the target number. Round ${this.round}`, 18, 26);

      this.rafId = requestAnimationFrame((tt) => this.frame(tt));
    }
  }

  // -----------------------
  // Initialize audio then start game
  // -----------------------
  audio.initPromise
    .then(() => {
      // status prompt for enabling audio
      const statusText = document.createElement('div');
      statusText.style.position = 'absolute';
      statusText.style.left = '8px';
      statusText.style.top = '8px';
      statusText.style.background = 'rgba(255,255,255,0.7)';
      statusText.style.padding = '6px 10px';
      statusText.style.borderRadius = '10px';
      statusText.style.fontFamily = 'Segoe UI, Roboto, sans-serif';
      statusText.style.fontSize = '12px';
      statusText.style.color = '#073B4C';
      statusText.style.pointerEvents = 'none';
      statusText.textContent = audio.available ? 'Audio ready — press any key or click to enable sound' : 'Audio not available on this device';
      container.appendChild(statusText);

      const removeStatus = () => {
        try {
          statusText.remove();
        } catch (e) {}
        if (audio.available) audio.ensureStarted().catch(() => {});
        window.removeEventListener('keydown', removeStatus);
        canvas.removeEventListener('pointerdown', removeStatus);
      };

      window.addEventListener('keydown', removeStatus, { once: true });
      canvas.addEventListener('pointerdown', removeStatus, { once: true });

      try {
        const game = new MachineGame(ctx, canvas, audio, liveRegion);
        container.game = game;
      } catch (e) {
        console.error('Failed to start game:', e);
        liveRegion.textContent = 'An unexpected error occurred while starting the game.';
      }
    })
    .catch((err) => {
      console.warn('Audio init promise rejected', err);
      try {
        const game = new MachineGame(ctx, canvas, audio, liveRegion);
        container.game = game;
      } catch (e) {
        console.error('Failed to start game:', e);
        liveRegion.textContent = 'An unexpected error occurred while starting the game.';
      }
    });

  // Polyfill: add roundRect for older browsers if not present on CanvasRenderingContext2D
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const ctx = this;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
  }
})();