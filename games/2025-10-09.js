(function () {
  // Educational Math Game: "Machine Menders" (Visual & Audio Enhancements)
  // Enhancements: improved visuals (colors, subtle animations, particles), richer procedural audio (Web Audio API).
  // Important: Game mechanics and math logic remain unchanged.
  'use strict';

  // Utility helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Locate stage element
  const stage = document.getElementById('game-of-the-day-stage');
  if (!stage) {
    console.error('Game container with ID "game-of-the-day-stage" not found.');
    return;
  }

  // Clear stage
  while (stage.firstChild) stage.removeChild(stage.firstChild);

  // Screen-reader region for accessible messages
  const sr = document.createElement('div');
  sr.setAttribute('role', 'region');
  sr.setAttribute('aria-live', 'polite');
  sr.style.position = 'absolute';
  sr.style.left = '-9999px';
  sr.style.width = '1px';
  sr.style.height = '1px';
  sr.style.overflow = 'hidden';
  sr.id = 'machine-menders-sr';
  stage.appendChild(sr);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Machine Menders math game canvas');
  stage.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Audio setup with robust error handling
  let audioContext = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioContext = new AC();
    } else {
      audioContext = null;
      console.warn('Web Audio API not supported.');
    }
  } catch (err) {
    audioContext = null;
    console.warn('Failed to create AudioContext:', err);
  }

  // Audio nodes and state
  let audioEnabled = false;
  let ambientGain = null;
  let ambientFilter = null;
  let ambientOsc1 = null;
  let ambientOsc2 = null;
  let ambientLFO = null;
  let masterGain = null;

  // Create a gentle ambient pad using two detuned oscillators and slow LFO-modulated filter
  function createBackgroundSound() {
    if (!audioContext) return;
    try {
      // master gain
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(audioContext.destination);

      // ambient bus
      ambientGain = audioContext.createGain();
      ambientGain.gain.value = 0.035; // very subtle
      ambientGain.connect(masterGain);

      // lowpass filter to soften harmonics
      ambientFilter = audioContext.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 700;
      ambientFilter.Q.value = 0.8;
      ambientFilter.connect(ambientGain);

      // two detuned sine-ish oscillators with triangle for warmth
      ambientOsc1 = audioContext.createOscillator();
      ambientOsc1.type = 'sine';
      ambientOsc1.frequency.value = 220;
      ambientOsc1.detune.value = -6;

      ambientOsc2 = audioContext.createOscillator();
      ambientOsc2.type = 'triangle';
      ambientOsc2.frequency.value = 330;
      ambientOsc2.detune.value = 4;

      // gentle phasing via stereo panner for movement
      const panner = audioContext.createStereoPanner();
      panner.pan.value = 0;
      panner.connect(ambientFilter);

      ambientOsc1.connect(ambientFilter);
      ambientOsc2.connect(ambientFilter);

      // small LFO to modulate filter cutoff
      ambientLFO = audioContext.createOscillator();
      ambientLFO.type = 'sine';
      ambientLFO.frequency.value = 0.12; // slow
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 260;
      ambientLFO.connect(lfoGain);
      lfoGain.connect(ambientFilter.frequency);

      ambientOsc1.start();
      ambientOsc2.start();
      ambientLFO.start();
      audioEnabled = true;
      updateSR('Sound enabled.');
    } catch (e) {
      console.warn('Error creating ambient sound:', e);
      audioEnabled = false;
      updateSR('Sound could not be enabled.');
    }
  }

  // Gracefully stop ambient nodes
  function stopBackgroundSound() {
    if (!audioContext) return;
    try {
      if (ambientOsc1) {
        ambientOsc1.stop();
        ambientOsc1.disconnect();
        ambientOsc1 = null;
      }
      if (ambientOsc2) {
        ambientOsc2.stop();
        ambientOsc2.disconnect();
        ambientOsc2 = null;
      }
      if (ambientLFO) {
        ambientLFO.stop();
        ambientLFO.disconnect();
        ambientLFO = null;
      }
      if (ambientFilter) {
        ambientFilter.disconnect();
        ambientFilter = null;
      }
      if (ambientGain) {
        ambientGain.disconnect();
        ambientGain = null;
      }
      if (masterGain) {
        masterGain.disconnect();
        masterGain = null;
      }
      audioEnabled = false;
      updateSR('Sound disabled.');
    } catch (e) {
      console.warn('Error stopping ambient sound:', e);
    }
  }

  // Generic tone with smoother envelope, filter and optional waveform
  function playTone(freq = 440, options = {}) {
    if (!audioContext || !audioEnabled) return;
    try {
      const {
        type = 'sine',
        duration = 0.28,
        volume = 0.12,
        attack = 0.01,
        release = 0.12,
        filterFreq = Math.max(800, freq * 2)
      } = options;

      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      const f = audioContext.createBiquadFilter();

      o.type = type;
      o.frequency.value = freq;
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      f.Q.value = 0.7;

      o.connect(f);
      f.connect(g);
      g.connect(audioContext.destination);

      // envelope
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

      o.start(now);
      o.stop(now + duration + release + 0.05);

      // disconnect cleanup shortly after stop to avoid leaks
      setTimeout(() => {
        try {
          o.disconnect();
          f.disconnect();
          g.disconnect();
        } catch (e) {}
      }, (duration + release + 0.1) * 1000);
    } catch (e) {
      console.warn('playTone error:', e);
    }
  }

  // Soft percussive click for selection (subtle)
  function playClick() {
    if (!audioContext || !audioEnabled) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      osc.type = 'square';
      osc.frequency.value = 1200;
      filter.type = 'highpass';
      filter.frequency.value = 800;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch (e) {
      console.warn('playClick error:', e);
    }
  }

  // Correct: warm bell cluster and twinkle particles
  function playCorrect() {
    if (!audioContext || !audioEnabled) return;
    try {
      // cluster arpeggio
      playTone(660, { type: 'sine', duration: 0.14, volume: 0.11, filterFreq: 2200 });
      setTimeout(() => playTone(880, { type: 'triangle', duration: 0.18, volume: 0.11, filterFreq: 2600 }), 140);
      setTimeout(() => playTone(990, { type: 'sine', duration: 0.24, volume: 0.095, filterFreq: 3000 }), 300);
    } catch (e) {
      console.warn('playCorrect error:', e);
    }
  }

  // Incorrect: lower thud + fizz
  function playIncorrect() {
    if (!audioContext || !audioEnabled) return;
    try {
      // thud
      playTone(160, { type: 'sine', duration: 0.26, volume: 0.12, filterFreq: 600 });
      // subtle fizz
      setTimeout(() => {
        playTone(900, { type: 'sawtooth', duration: 0.28, volume: 0.04, filterFreq: 1500 });
      }, 40);
    } catch (e) {
      console.warn('playIncorrect error:', e);
    }
  }

  // Game constants
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const MACHINE_X = WIDTH / 2;
  const MACHINE_Y = HEIGHT / 2 + 10;
  const MAX_LEVELS = 8;
  const START_LIVES = 3;

  // Particle helpers for visuals (confetti, sparks, steam puffs)
  class Particle {
    constructor(x, y, vx, vy, life, size, color, type = 'confetti') {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.life = life;
      this.maxLife = life;
      this.size = size;
      this.color = color;
      this.type = type;
      this.rotation = Math.random() * Math.PI * 2;
      this.spin = (Math.random() - 0.5) * 0.12;
    }

    update(dt) {
      this.x += this.vx * dt * 0.06;
      this.y += this.vy * dt * 0.06;

      // gravity for confetti and sparks
      if (this.type !== 'steam') {
        this.vy += 0.02 * dt * 0.06;
      } else {
        // steam rises and spreads
        this.vy -= 0.003 * dt * 0.06;
        this.vx += (Math.random() - 0.5) * 0.02 * dt * 0.06;
      }

      this.life -= dt;
      this.rotation += this.spin;
    }

    draw(ctx) {
      const t = Math.max(0, Math.min(1, 1 - this.life / this.maxLife));
      ctx.save();

      if (this.type === 'confetti') {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.globalAlpha = 0.9 * (1 - t);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
      } else if (this.type === 'spark') {
        ctx.beginPath();
        ctx.globalAlpha = 0.9 * (1 - t);
        ctx.fillStyle = this.color;
        ctx.arc(this.x, this.y, this.size * (1 - t) + 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // steam
        ctx.beginPath();
        ctx.globalAlpha = 0.45 * (1 - t);
        ctx.fillStyle = this.color;
        ctx.ellipse(this.x, this.y, this.size * 1.2 * (1 + t), this.size * (0.6 + t * 0.8), this.rotation * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Game state class (keeps mechanics unchanged)
  class Game {
    constructor() {
      this.level = 0;
      this.lives = START_LIVES;
      this.score = 0;
      this.state = 'menu'; // menu, playing, win, lose, anim
      this.parts = [];
      this.target = null;
      this.selectorIndex = 0;
      this.anim = { t: 0 };
      this.lastTime = performance.now();
      this.shake = 0;
      this.paused = false;
      this.soundAllowed = !!audioEnabled;
      this.particles = []; // particle list for visual effects
      this.eyeBlinkTimer = 0;
      this.initInput();
      this.generateLevel();
      this._bindVisibility();
      this.updateSRInstructions();
      this.loop = this.loop.bind(this);
      this.loop();
    }

    updateSRInstructions() {
      const controls = [
        'Keyboard: arrow keys to move selection, Enter or Space to pick, number keys 1–4 to choose a part.',
        'Click or tap a part to select it.',
        'Press S to toggle sound.',
        'Press R to restart the game when over.'
      ];
      updateSR(
        `Welcome to Machine Menders. Fix machines by choosing the correct part to complete the math. ` +
          `You have ${START_LIVES} hearts. ` +
          `Controls: ${controls.join(' ')}`
      );
    }

    _bindVisibility() {
      document.addEventListener('visibilitychange', () => {
        if (!audioContext) return;
        if (document.hidden) {
          audioContext.suspend().catch(() => {});
        } else {
          audioContext.resume().catch(() => {});
        }
      });
    }

    initInput() {
      // Mouse & touch click handler
      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        if (this.state === 'menu') {
          this.startGame();
          return;
        }

        if (this.state === 'win' || this.state === 'lose') {
          this.restart();
          return;
        }

        // detect part click
        for (let i = 0; i < this.parts.length; i++) {
          const p = this.parts[i];
          const dx = x - p.x;
          const dy = y - p.y;
          if (Math.hypot(dx, dy) < p.radius + 8) {
            playClick();
            this.pickPart(i);
            return;
          }
        }
      });

      // Keyboard
      window.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;

        if (this.state === 'menu' && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          this.startGame();
          return;
        }

        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          this.toggleSound();
          return;
        }

        if ((this.state === 'win' || this.state === 'lose') && e.key.toLowerCase() === 'r') {
          e.preventDefault();
          this.restart();
          return;
        }

        if (this.state !== 'playing') return;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          this.selectorIndex = (this.selectorIndex - 1 + this.parts.length) % this.parts.length;
          this.updateSRSelection();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          this.selectorIndex = (this.selectorIndex + 1) % this.parts.length;
          this.updateSRSelection();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          playClick();
          this.pickPart(this.selectorIndex);
        } else {
          const n = parseInt(e.key, 10);
          if (!Number.isNaN(n) && n >= 1 && n <= 9) {
            if (n <= this.parts.length) {
              e.preventDefault();
              playClick();
              this.pickPart(n - 1);
            }
          }
        }
      });
    }

    toggleSound() {
      if (!audioContext) {
        updateSR('Sound unavailable on this device.');
        return;
      }
      if (!audioEnabled) {
        audioContext.resume().then(() => {
          createBackgroundSound();
        }).catch((err) => {
          console.warn('Audio resume failed:', err);
          updateSR('Unable to enable sound due to browser restrictions.');
        });
      } else {
        stopBackgroundSound();
      }
      this.soundAllowed = audioEnabled;
    }

    generateLevel() {
      // Game math unchanged
      const levelNum = this.level + 1;
      const type = levelNum <= 3 ? 'add' : (levelNum <= 6 ? pick(['add', 'sub']) : pick(['add', 'sub']));
      const maxTarget = 10 + levelNum * 2;
      let a;
      let b;
      let target;
      let missingOnLeft = Math.random() < 0.5;

      if (type === 'add') {
        a = rand(1, Math.max(4, Math.min(12, maxTarget - 1)));
        b = rand(1, Math.max(3, Math.min(12, maxTarget - a)));
        target = a + b;
      } else {
        a = rand(5, Math.max(6, Math.min(18, maxTarget)));
        target = rand(1, Math.max(3, Math.min(10, a - 1)));
        b = a - target;
      }

      const missingValue = missingOnLeft ? a : b;
      const expression = { type, a, b, target, missingOnLeft, missingValue };
      this.target = expression;

      // options unchanged
      const correct = missingValue;
      const choices = new Set([correct]);
      while (choices.size < 4) {
        const delta = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
        choices.add(clamp(correct + delta, 0, Math.max(1, correct + 6)));
      }
      const arr = Array.from(choices);

      // shuffle
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }

      // place parts in circular layout with slight variation
      const ringRadius = 160;
      this.parts = arr.map((val, idx) => {
        const angle = (Math.PI * 2 * idx) / arr.length - Math.PI / 2 + (Math.random() - 0.5) * 0.22;
        const px = MACHINE_X + Math.cos(angle) * ringRadius + rand(-8, 8);
        const py = MACHINE_Y + Math.sin(angle) * ringRadius + rand(-8, 8);
        return {
          value: val,
          x: px,
          y: py,
          baseX: px,
          baseY: py,
          radius: 36,
          wobble: Math.random() * Math.PI * 2,
          picked: false,
          pickedTime: 0
        };
      });

      this.selectorIndex = 0;
      this.shake = 0;
      this.anim = { t: 0 };
      this.state = 'playing';
      updateSR(`Level ${this.level + 1}. Fix the machine: ${this.getExpressionText()}. Choose the correct part.`);
    }

    getExpressionText() {
      const e = this.target;
      if (!e) return '';
      if (e.type === 'add') {
        if (e.missingOnLeft) return `? + ${e.b} = ${e.target}`;
        return `${e.a} + ? = ${e.target}`;
      } else {
        if (e.missingOnLeft) return `? - ${e.b} = ${e.target}`;
        return `${e.a} - ? = ${e.target}`;
      }
    }

    pickPart(index) {
      if (this.state !== 'playing') return;
      if (index < 0 || index >= this.parts.length) return;
      const part = this.parts[index];
      this.selectorIndex = index;
      part.picked = true;
      part.pickedStart = { x: part.x, y: part.y };
      part.pickedTime = 0;

      // subtle indicator sound (already played on input handler)
      // Evaluate
      const chosen = part.value;
      const correct = this.target.missingValue;
      if (chosen === correct) {
        this.onCorrect();
      } else {
        this.onIncorrect();
      }
    }

    onCorrect() {
      this.score += 10 + this.level * 2;
      playCorrect();
      this.spawnConfetti(MACHINE_X, MACHINE_Y - 8);
      updateSR('Correct! The part fits. The machine hums happily.');
      this.state = 'anim';
      this.anim = { type: 'success', t: 0, duration: 1200 };
      setTimeout(() => {
        this.level++;
        if (this.level >= MAX_LEVELS) {
          this.win();
        } else {
          this.generateLevel();
        }
      }, 1200);
    }

    onIncorrect() {
      this.lives -= 1;
      playIncorrect();
      this.spawnSparks(MACHINE_X, MACHINE_Y + 6);
      this.shake = 12;
      updateSR(`Oops! That part doesn't fit. ${this.lives} ${this.lives === 1 ? 'heart' : 'hearts'} remaining.`);
      if (this.lives <= 0) {
        setTimeout(() => this.lose(), 650);
      }
    }

    startGame() {
      this.level = 0;
      this.lives = START_LIVES;
      this.score = 0;
      if (audioContext && !audioEnabled) {
        audioContext.resume().then(() => {
          createBackgroundSound();
        }).catch((err) => {
          console.warn('Audio resume failed:', err);
        });
      }
      this.generateLevel();
    }

    restart() {
      this.state = 'menu';
      this.level = 0;
      this.lives = START_LIVES;
      this.score = 0;
      this.parts = [];
      this.target = null;
      this.particles = [];
      updateSR('Game reset. Click or press Enter to start.');
    }

    win() {
      this.state = 'win';
      updateSR('You fixed all the machines! You win! Press R or click to play again.');
      if (audioContext && audioEnabled) {
        setTimeout(() => playTone(880, { type: 'sine', duration: 0.16, volume: 0.11 }), 0);
        setTimeout(() => playTone(660, { type: 'triangle', duration: 0.18, volume: 0.11 }), 160);
        setTimeout(() => playTone(990, { type: 'sine', duration: 0.26, volume: 0.12 }), 360);
      }
      // celebratory confetti burst
      this.spawnConfetti(MACHINE_X, MACHINE_Y - 10, 48);
    }

    lose() {
      this.state = 'lose';
      updateSR('The machine could not be repaired. Game over. Press R to try again.');
      // low failure chord
      if (audioContext && audioEnabled) {
        playTone(120, { type: 'sine', duration: 0.4, volume: 0.14, filterFreq: 600 });
        setTimeout(() => playTone(170, { type: 'sine', duration: 0.34, volume: 0.08, filterFreq: 700 }), 60);
      }
      // small smoke puffs
      for (let i = 0; i < 6; i++) {
        this.particles.push(
          new Particle(
            MACHINE_X + rand(-40, 40),
            MACHINE_Y + 20 + rand(-6, 6),
            rand(-6, 6),
            rand(-14, -6),
            900 + Math.random() * 600,
            12 + Math.random() * 8,
            'rgba(190,190,190,0.95)',
            'steam'
          )
        );
      }
    }

    updateSR(text) {
      updateSR(text);
    }

    // Spawn helpers
    spawnConfetti(x, y, count = 22) {
      const palette = ['#FFB86B', '#6BE2C6', '#6BA8FF', '#FFD2E3', '#FFD86B'];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 90;
        const vx = Math.cos(angle) * speed * 0.02;
        const vy = Math.sin(angle) * speed * 0.02 - 0.6;
        const size = 6 + Math.random() * 8;
        const life = 700 + Math.random() * 700;
        this.particles.push(
          new Particle(x + rand(-12, 12), y + rand(-6, 6), vx, vy, life, size, pick(palette), 'confetti')
        );
      }
    }

    spawnSparks(x, y, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 160;
        const vx = Math.cos(angle) * speed * 0.02;
        const vy = Math.sin(angle) * speed * 0.02 - 0.3;
        const size = 2 + Math.random() * 3;
        const life = 220 + Math.random() * 240;
        this.particles.push(
          new Particle(
            x + rand(-8, 8),
            y + rand(-6, 6),
            vx,
            vy,
            life,
            size,
            'rgba(255,210,120,0.98)',
            'spark'
          )
        );
      }
    }

    update(dt) {
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt * 0.02);
      }

      // update parts wobble and picked animations
      this.parts.forEach((p, i) => {
        p.wobble += dt * 0.004 + i * 0.00008;
        p.x = p.baseX + Math.sin(p.wobble) * 6;
        p.y = p.baseY + Math.cos(p.wobble * 0.9) * 4;
        if (p.picked) {
          p.pickedTime += dt;
          const duration = 420;
          const t = clamp(p.pickedTime / duration, 0, 1);
          p.x = p.pickedStart.x + (MACHINE_X - p.pickedStart.x) * easeOut(t);
          p.y = p.pickedStart.y + (MACHINE_Y + 10 - p.pickedStart.y) * easeOut(t);
          p.radius = 36 * (1 - 0.45 * easeOut(t));
        } else {
          p.radius = 36;
        }
      });

      // particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pr = this.particles[i];
        pr.update(dt);
        if (pr.life <= 0 || pr.y > HEIGHT + 80 || pr.x < -80 || pr.x > WIDTH + 80) {
          this.particles.splice(i, 1);
        }
      }

      // simple eye blink timer
      this.eyeBlinkTimer -= dt;
      if (this.eyeBlinkTimer <= 0) {
        this.eyeBlinkTimer = 1800 + Math.random() * 3000;
        this.blink = 140; // blink duration
      }
      if (this.blink > 0) {
        this.blink = Math.max(0, this.blink - dt);
      }

      // animate success
      if (this.state === 'anim' && this.anim) {
        this.anim.t += dt;
        if (this.anim.t >= this.anim.duration) {
          this.anim = { t: 0 };
          this.state = 'playing';
        }
      }
    }

    drawBackground() {
      // layered gradient with subtle moving radial highlight
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, '#EAF7FF');
      g.addColorStop(0.6, '#F7FBFF');
      g.addColorStop(1, '#F7FFF7');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // faint radial glow behind machine to focus attention
      const rg = ctx.createRadialGradient(MACHINE_X, MACHINE_Y - 40, 20, MACHINE_X, MACHINE_Y - 40, 420);
      rg.addColorStop(0, 'rgba(255,255,220,0.14)');
      rg.addColorStop(0.3, 'rgba(255,255,220,0.06)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // soft drifting cloud shapes (slow, subtle)
      ctx.globalAlpha = 0.88;
      for (let i = 0; i < 4; i++) {
        const t = Date.now() * 0.0002 * (0.7 + i * 0.2);
        const cx = (i * 210 + Math.sin(t + i) * 30) % (WIDTH + 240) - 120;
        const cy = 60 + i * 18;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 70, 28, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 44, cy + 8, 42, 20, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 44, cy + 6, 48, 22, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // stylized ground with tiles / floor texture
      ctx.fillStyle = '#E9F6EE';
      ctx.fillRect(0, HEIGHT - 84, WIDTH, 84);

      // grid lines for subtle workshop floor
      ctx.strokeStyle = 'rgba(0,0,0,0.03)';
      ctx.lineWidth = 1;
      for (let x = 20; x < WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, HEIGHT - 84);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawMachine() {
      ctx.save();

      // apply shake translation
      const shx = (Math.random() - 0.5) * this.shake;
      const shy = (Math.random() - 0.5) * this.shake;
      ctx.translate(shx, shy);

      // machine base with layered panels
      roundRect(ctx, MACHINE_X - 172, MACHINE_Y - 100, 344, 200, 22, true, false);

      // panel gradient
      const bodyG = ctx.createLinearGradient(MACHINE_X - 172, MACHINE_Y - 100, MACHINE_X - 172, MACHINE_Y + 100);
      bodyG.addColorStop(0, '#F8FBFF');
      bodyG.addColorStop(1, '#E9F6FF');
      ctx.fillStyle = bodyG;
      roundRect(ctx, MACHINE_X - 160, MACHINE_Y - 90, 320, 180, 18, true, false);

      // top signage
      ctx.fillStyle = '#EAF6FF';
      roundRect(ctx, MACHINE_X - 110, MACHINE_Y - 98, 220, 28, 10, true, false);
      ctx.fillStyle = '#0F4C4A';
      ctx.font = '18px "Segoe UI", Roboto, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Repair Console', MACHINE_X, MACHINE_Y - 78);

      // left decorative gear
      drawGear(ctx, MACHINE_X - 122, MACHINE_Y - 4, 44, 12, '#D8EEFF', '#7FB7FF', Date.now() * 0.0018);

      // right decorative gear
      drawGear(ctx, MACHINE_X + 122, MACHINE_Y - 4, 36, 10, '#FFF1E0', '#FFCFA0', -Date.now() * 0.0022);

      // face / central screen
      ctx.save();

      // screen frame
      ctx.fillStyle = '#1B3740';
      roundRect(ctx, MACHINE_X - 86, MACHINE_Y - 72, 172, 96, 12, true, false);

      // screen inner
      ctx.fillStyle = '#EAF6FF';
      roundRect(ctx, MACHINE_X - 78, MACHINE_Y - 64, 156, 80, 10, true, false);

      // eyes - blinking animation (use this.blink)
      const blinkProgress = this.blink > 0 ? 1 - this.blink / 140 : 0;
      const eyeClose = Math.max(0, Math.min(1, blinkProgress * 1.8));

      // left eye
      ctx.fillStyle = '#0B3B2E';
      const eyeY = MACHINE_Y - 32;
      const eyeOffsetX = 26;

      // eye white (left)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(MACHINE_X - eyeOffsetX, eyeY, 12, 10 * (1 - 0.6 * eyeClose), 0, 0, Math.PI * 2);
      ctx.fill();

      // pupil (left)
      ctx.fillStyle = '#113333';
      ctx.beginPath();
      ctx.arc(MACHINE_X - eyeOffsetX, eyeY, 5, 0, Math.PI * 2);
      ctx.fill();

      // right eye
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(MACHINE_X + eyeOffsetX, eyeY, 12, 10 * (1 - 0.6 * eyeClose), 0, 0, Math.PI * 2);
      ctx.fill();

      // pupil (right)
      ctx.fillStyle = '#113333';
      ctx.beginPath();
      ctx.arc(MACHINE_X + eyeOffsetX, eyeY, 5, 0, Math.PI * 2);
      ctx.fill();

      // mouth (slot) lights up on success animation
      const mouthW = 74;
      const mouthH = 12;
      const mouthGlow = this.state === 'anim' && this.anim && this.anim.type === 'success'
        ? 1 - Math.abs(this.anim.t / this.anim.duration - 0.5) * 2
        : 0;
      const mouthX = MACHINE_X - mouthW / 2;
      const mouthY = MACHINE_Y + 14;
      ctx.fillStyle = '#252525';
      roundRect(ctx, mouthX, mouthY, mouthW, mouthH, 6, true, false);

      if (mouthGlow > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(140,255,200,${0.35 * mouthGlow})`;
        roundRect(ctx, mouthX - 6, mouthY - 6, mouthW + 12, mouthH + 12, 8, true, false);
        ctx.globalCompositeOperation = 'source-over';
      }

      // small display line above mouth for numbers
      ctx.fillStyle = '#083233';
      ctx.font = '20px "Segoe UI", Roboto, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.getExpressionText(), MACHINE_X, MACHINE_Y - 46);

      ctx.restore();

      // small status lights & pipes for character
      ctx.save();
      // left pipe
      ctx.fillStyle = '#DADFEA';
      roundRect(ctx, MACHINE_X - 172, MACHINE_Y + 20, 40, 12, 6, true, false);
      // right pipe
      roundRect(ctx, MACHINE_X + 132, MACHINE_Y + 20, 40, 12, 6, true, false);
      ctx.restore();

      // hearts and level
      ctx.font = '16px "Segoe UI", Roboto, Arial';
      ctx.textAlign = 'left';
      let heartX = 18;
      for (let i = 0; i < this.lives; i++) {
        drawHeart(ctx, heartX + i * 22, 18, 10, '#FF6B81');
      }
      ctx.fillStyle = '#0F3B37';
      ctx.fillText(`Level ${this.level + 1} / ${MAX_LEVELS}`, WIDTH - 150, 24);
      ctx.fillText(`Score: ${this.score}`, WIDTH - 150, 44);

      ctx.restore();
    }

    drawParts() {
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        const selected = i === this.selectorIndex && this.state === 'playing';
        ctx.save();

        // part shadow (soft)
        ctx.beginPath();
        ctx.fillStyle = 'rgba(5,20,12,0.08)';
        ctx.ellipse(p.x + 6, p.y + 18, p.radius * 0.9, p.radius * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();

        // mounting plate
        const plateG = ctx.createLinearGradient(p.x - p.radius, p.y - p.radius, p.x + p.radius, p.y + p.radius);
        plateG.addColorStop(0, '#FFFDF8');
        plateG.addColorStop(1, '#F6EFE3');
        ctx.fillStyle = plateG;
        roundRect(ctx, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2, 16, true, false);

        // spinning miniature gear
        drawMiniGear(ctx, p.x, p.y + 6, p.radius + 8, 8, '#F5F3EA', '#CFBFA2', Date.now() * 0.0035 * ((i % 2) ? 1 : -1));

        // numeric plate overlay with subtle bevel
        ctx.fillStyle = '#0E3340';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 6, p.radius - 10, 0, Math.PI * 2);
        ctx.fill();

        // number
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px "Segoe UI", Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.value, p.x, p.y - 0);

        // keyboard hint
        ctx.fillStyle = selected ? '#2B8A78' : '#7C8790';
        ctx.font = '12px "Segoe UI", Roboto, Arial';
        ctx.fillText(`${i + 1}`, p.x + p.radius - 12, p.y + p.radius - 6);

        // selection ring with animated pulsing
        if (selected) {
          const pulse = 1 + Math.sin(Date.now() * 0.007) * 0.08;
          ctx.lineWidth = 3;
          ctx.strokeStyle = `rgba(106,227,193,${0.95})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (p.radius + 6) * pulse, 0, Math.PI * 2);
          ctx.stroke();
        }

        // picked glow
        if (p.picked) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(160,255,210,0.14)';
          ctx.lineWidth = 18 * (1 - clamp(p.pickedTime / 420, 0, 1));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius + 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }

        ctx.restore();
      }
    }

    drawParticles() {
      for (const pr of this.particles) {
        pr.draw(ctx);
      }
    }

    drawFooter() {
      ctx.save();
      ctx.globalAlpha = 0.95;

      // speaker icon
      const sx = 44;
      const sy = HEIGHT - 32;
      ctx.fillStyle = audioEnabled ? '#2B8A78' : '#7C8790';

      // speaker body
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy - 8);
      ctx.lineTo(sx - 2, sy - 8);
      ctx.lineTo(sx + 6, sy - 16);
      ctx.lineTo(sx + 6, sy + 16);
      ctx.lineTo(sx - 2, sy + 8);
      ctx.lineTo(sx - 12, sy + 8);
      ctx.closePath();
      ctx.fill();

      // small waves
      ctx.strokeStyle = audioEnabled ? 'rgba(43,138,120,0.9)' : 'rgba(124,135,144,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + 12, sy - 2, 6, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx + 12, sy - 2, 10, -0.6, 0.6);
      ctx.stroke();

      ctx.fillStyle = '#0E3936';
      ctx.font = '13px "Segoe UI", Roboto, Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Press S to toggle sound', sx + 44, sy - 2);
      ctx.restore();
    }

    drawOverlay() {
      // menu overlay
      if (this.state === 'menu') {
        ctx.save();
        ctx.fillStyle = 'rgba(6,18,22,0.28)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '30px "Segoe UI", Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Machine Menders', WIDTH / 2, HEIGHT / 2 - 48);
        ctx.font = '16px "Segoe UI", Roboto, Arial';
        ctx.fillText('Fix the machines by choosing the correct part to complete each math problem.', WIDTH / 2, HEIGHT / 2 - 18);
        ctx.fillText('Click, tap, or press Enter to start. Controls: arrows, numbers 1–4, S for sound.', WIDTH / 2, HEIGHT / 2 + 2);
        ctx.fillStyle = '#F1F9F4';
        roundRect(ctx, WIDTH / 2 - 86, HEIGHT / 2 + 36, 172, 46, 12, true, false);
        ctx.fillStyle = '#083233';
        ctx.font = '20px "Segoe UI", Roboto, Arial';
        ctx.fillText('Start Game', WIDTH / 2, HEIGHT / 2 + 68 - 8);
        ctx.restore();
      }

      if (this.state === 'win') {
        ctx.save();
        ctx.fillStyle = 'rgba(6, 30, 20, 0.7)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#FFFCEB';
        ctx.font = '30px "Segoe UI", Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('You Fixed All the Machines!', WIDTH / 2, HEIGHT / 2 - 12);
        ctx.font = '18px "Segoe UI", Roboto, Arial';
        ctx.fillText(`Final score: ${this.score}`, WIDTH / 2, HEIGHT / 2 + 18);
        ctx.fillText('Press R or click to play again.', WIDTH / 2, HEIGHT / 2 + 44);
        ctx.restore();
      }

      if (this.state === 'lose') {
        ctx.save();
        ctx.fillStyle = 'rgba(48, 12, 12, 0.72)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#FFF4F6';
        ctx.font = '28px "Segoe UI", Roboto, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Machine Failure', WIDTH / 2, HEIGHT / 2 - 6);
        ctx.font = '16px "Segoe UI", Roboto, Arial';
        ctx.fillText(`You repaired ${this.level} machines. Final score: ${this.score}`, WIDTH / 2, HEIGHT / 2 + 22);
        ctx.fillText('Press R or click to try again.', WIDTH / 2, HEIGHT / 2 + 46);
        ctx.restore();
      }
    }

    draw(dt) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      this.drawBackground();
      this.drawMachine();
      this.drawParts();
      this.drawParticles();
      this.drawFooter();

      // subtle hint text
      ctx.fillStyle = '#0F3B37';
      ctx.font = '13px "Segoe UI", Roboto, Arial';
      ctx.textAlign = 'left';
      ctx.fillText('Pick the part that completes the expression shown on the machine.', 14, HEIGHT - 8);

      // sound status pill
      ctx.save();
      ctx.fillStyle = audioEnabled ? 'rgba(100,220,180,0.10)' : 'rgba(200,200,200,0.06)';
      roundRect(ctx, WIDTH - 180, HEIGHT - 40, 164, 30, 12, true, false);
      ctx.fillStyle = audioEnabled ? '#2B8A78' : '#7C8790';
      ctx.font = '12px "Segoe UI", Roboto, Arial';
      ctx.textAlign = 'right';
      ctx.fillText(audioEnabled ? 'Sound: On' : 'Sound: Off', WIDTH - 20, HEIGHT - 20);
      ctx.restore();

      this.drawOverlay();
    }

    loop() {
      const now = performance.now();
      const dt = now - (this.lastTime || now);
      this.lastTime = now;
      if (!this.paused) {
        this.update(dt);
        this.draw(dt);
      }
      requestAnimationFrame(this.loop);
    }

    updateSRSelection() {
      const p = this.parts[this.selectorIndex];
      if (p) updateSR(`Selected part ${this.selectorIndex + 1}: ${p.value}`);
    }
  }

  // Drawing helpers (all canvas operations)
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawGear(ctx, cx, cy, radius, teeth, color1, color2, spin) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin || 0);

    // base
    ctx.beginPath();
    ctx.fillStyle = color1;
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // teeth
    ctx.fillStyle = color2;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tx = Math.cos(a) * (radius + 6);
      const ty = Math.sin(a) * (radius + 6);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.rect(-4, -7, 8, 14);
      ctx.fill();
      ctx.restore();
    }

    // center highlight
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMiniGear(ctx, cx, cy, radius, teeth, color1, color2, spin) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin || 0);
    ctx.beginPath();
    ctx.fillStyle = color1;
    ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color2;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const tx = Math.cos(a) * radius;
      const ty = Math.sin(a) * radius;
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHeart(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - size / 2, x - size, y - size / 2, x - size, y + size / 4);
    ctx.bezierCurveTo(x - size, y + size, x, y + size * 1.2, x, y + size * 1.6);
    ctx.bezierCurveTo(x, y + size * 1.2, x + size, y + size, x + size, y + size / 4);
    ctx.bezierCurveTo(x + size, y - size / 2, x, y - size / 2, x, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // SR helper
  function updateSR(message) {
    if (!sr) return;
    sr.textContent = message;
    console.log('[SR]', message);
  }

  // Instantiate game
  const game = new Game();

  // Inform user about audio status
  if (!audioContext) {
    updateSR('Note: Audio is not available in this browser. The game is still playable with visual feedback.');
  } else {
    updateSR('Press S to toggle sound. Click or press Enter to start the game.');
  }

  // Ensure audio context is resumed on first user gesture to allow immediate sounds on some browsers
  const ensureAudioOnGesture = () => {
    if (!audioContext) return;
    const resumeOnce = () => {
      audioContext.resume().then(() => {
        // do nothing; audio will be enabled when user toggles sound
      }).catch(() => {});
      window.removeEventListener('pointerdown', resumeOnce);
      window.removeEventListener('keydown', resumeOnce);
    };
    window.addEventListener('pointerdown', resumeOnce, { once: true });
    window.addEventListener('keydown', resumeOnce, { once: true });
  };
  ensureAudioOnGesture();
})();