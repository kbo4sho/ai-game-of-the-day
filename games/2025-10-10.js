(function() {
  // Enhanced Machine Merge - Visual & Audio Improvements Only
  // Renders into element with ID "game-of-the-day-stage"
  // Canvas exactly 720x480. All graphics via canvas. All audio via Web Audio API.
  // Game mechanics and math logic left unchanged.

  // ======== Constants & Setup ========
  const STAGE_ID = 'game-of-the-day-stage';
  const WIDTH = 720;
  const HEIGHT = 480;

  const container = document.getElementById(STAGE_ID);
  if (!container) {
    throw new Error(`Container element with ID "${STAGE_ID}" not found.`);
  }

  // Prepare container and canvas
  container.innerHTML = '';
  container.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Machine Merge math game. Use arrow keys to move, space to pick/drop parts, M to toggle audio, Escape to restart.'
  );
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Utilities
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const TAU = Math.PI * 2;

  // ======== Audio: Web Audio API Setup (Robust) ========
  let audioCtx = null;
  let audioEnabled = true;
  let audioInitError = false;

  // Background audio nodes
  let bgGain = null;
  let bgOscA = null;
  let bgOscB = null;
  let bgLfo = null;
  let noiseBuffer = null;

  function createNoiseBuffer(ctx) {
    const sampleRate = ctx.sampleRate || 44100;
    const buffer = ctx.createBuffer(1, sampleRate * 1, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    return buffer;
  }

  function initAudio() {
    if (audioCtx || audioInitError) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();

      // Create background texture: two low oscillators + slow LFO + gentle filter
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.02; // default gentle background
      bgGain.connect(audioCtx.destination);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.7;
      filter.connect(bgGain);

      bgOscA = audioCtx.createOscillator();
      bgOscA.type = 'sine';
      bgOscA.frequency.value = 110;
      const oscAGain = audioCtx.createGain();
      oscAGain.gain.value = 0.035;
      bgOscA.connect(oscAGain);
      oscAGain.connect(filter);

      bgOscB = audioCtx.createOscillator();
      bgOscB.type = 'triangle';
      bgOscB.frequency.value = 55;
      const oscBGain = audioCtx.createGain();
      oscBGain.gain.value = 0.02;
      bgOscB.connect(oscBGain);
      oscBGain.connect(filter);

      // gentle amplitude modulation for life
      bgLfo = audioCtx.createOscillator();
      bgLfo.type = 'sine';
      bgLfo.frequency.value = 0.18; // slow pulse
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.012;
      bgLfo.connect(lfoGain);
      lfoGain.connect(bgGain.gain);

      // start oscillators
      bgOscA.start();
      bgOscB.start();
      bgLfo.start();

      // create noise buffer for short percussive sounds
      noiseBuffer = createNoiseBuffer(audioCtx);
    } catch (e) {
      console.warn('Audio initialization failed:', e);
      audioInitError = true;
      audioEnabled = false;
      audioCtx = null;
    }
  }

  function resumeAudioOnInteraction() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('Audio resume failed:', e);
        audioEnabled = false;
      });
    }
  }

  function setAudioEnabled(enabled) {
    audioEnabled = enabled && !audioInitError;
    if (!bgGain) return;
    // smooth change to avoid clicks
    try {
      const now = audioCtx.currentTime;
      bgGain.gain.cancelScheduledValues(now);
      bgGain.gain.setValueAtTime(bgGain.gain.value, now);
      bgGain.gain.linearRampToValueAtTime(audioEnabled ? 0.02 : 0.0, now + 0.25);
    } catch (e) {
      // ignore scheduling errors
      bgGain.gain.value = audioEnabled ? 0.02 : 0;
    }
  }

  // Sound generation helpers
  function playOscTone({
    freq = 440,
    type = 'sine',
    duration = 0.12,
    volume = 0.12,
    attack = 0.01,
    decay = 0.06,
    detune = 0
  } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      f.type = 'lowpass';
      f.frequency.value = Math.max(600, freq * 2);
      o.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration - decay);

      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('playOscTone error', e);
    }
  }

  function playNoiseBurst({ duration = 0.08, volume = 0.08, filterFreq = 2000 } = {}) {
    if (!audioEnabled || !audioCtx || !noiseBuffer) return;
    try {
      const src = audioCtx.createBufferSource();
      src.buffer = noiseBuffer;
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 150;
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filterFreq;
      src.connect(f);
      f.connect(lp);
      lp.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(volume, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      src.start(now);
      src.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('playNoiseBurst error', e);
    }
  }

  // Friendly sound wrappers
  function playPickSound() {
    playNoiseBurst({ duration: 0.06, volume: 0.06, filterFreq: 2500 });
    playOscTone({
      freq: 980,
      type: 'triangle',
      duration: 0.12,
      volume: 0.06,
      attack: 0.01,
      decay: 0.06
    });
  }

  function playDropSound() {
    playNoiseBurst({ duration: 0.08, volume: 0.07, filterFreq: 1800 });
    playOscTone({
      freq: 720,
      type: 'sine',
      duration: 0.16,
      volume: 0.08,
      attack: 0.01,
      decay: 0.08
    });
  }

  function playCorrectSound() {
    if (!audioEnabled || !audioCtx) return;
    // Pleasant triad arpeggio across three notes
    const notes = [720, 900, 1080];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playOscTone({
          freq,
          type: 'sine',
          duration: 0.22,
          volume: 0.12,
          attack: 0.01,
          decay: 0.08
        });
      }, idx * 160);
    });
    // little noise sparkle after
    setTimeout(() => playNoiseBurst({ duration: 0.22, volume: 0.06, filterFreq: 4000 }), 460);
  }

  function playWrongSound() {
    playOscTone({
      freq: 220,
      type: 'sawtooth',
      duration: 0.18,
      volume: 0.10,
      attack: 0.01,
      decay: 0.09
    });
    setTimeout(() => {
      playOscTone({
        freq: 170,
        type: 'sine',
        duration: 0.15,
        volume: 0.07,
        attack: 0.01,
        decay: 0.07
      });
    }, 100);
    playNoiseBurst({ duration: 0.12, volume: 0.05, filterFreq: 900 });
  }

  // Initialize audio gently on first user gesture
  function tryInitAudioOnGesture() {
    initAudio();
  }

  // ======== Core Game Classes & Logic (unchanged mechanics) ========
  class Part {
    constructor(x, y, speed, value, belt) {
      this.x = x;
      this.y = y;
      this.speed = speed;
      this.value = value;
      this.radius = 22;
      this.belt = belt;
      this.id = Math.random().toString(36).substr(2, 9);
      this.picked = false;
      // subtle wobble for visual life
      this.phase = Math.random() * TAU;
      this.rotation = Math.random() * TAU;
    }

    draw(ctx, gameTime, armX, armY) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // floating wobble when not picked
      if (!this.picked) {
        this.phase += 0.02;
        const wob = Math.sin(this.phase) * 2;
        ctx.translate(0, wob);
        this.rotation += 0.004 * Math.sign(this.speed);
      } else {
        // held items slightly bob with arm
        this.rotation += 0.06;
      }

      // subtle shadow
      ctx.beginPath();
      ctx.fillStyle = 'rgba(6,10,12,0.14)';
      ctx.ellipse(6, 14, this.radius + 6, this.radius * 0.6 + 4, 0, 0, TAU);
      ctx.fill();

      // body with soft radial gradient and rim
      const baseColors = ['#79d6c7', '#ffd7a9', '#c9b6fb', '#ffbac9', '#bfe7ff'];
      const base = baseColors[(this.value + this.belt) % baseColors.length];
      const grd = ctx.createRadialGradient(-6, -6, this.radius * 0.2, 0, 0, this.radius + 4);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.4, base);
      grd.addColorStop(1, '#dfeef0');

      // subtle glow when near arm tray
      const dx = this.x - armX;
      const dy = this.y - (armY + 26);
      const dist = Math.hypot(dx, dy);
      const near = dist < 48;

      if (near && !this.picked) {
        ctx.shadowColor = 'rgba(150,200,180,0.45)';
        ctx.shadowBlur = 14;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.fillStyle = grd;
      ctx.strokeStyle = '#98a6a8';
      ctx.lineWidth = 1.5;
      ctx.arc(0, 0, this.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();

      // faint gear teeth hint around rim
      ctx.save();
      ctx.rotate(this.rotation);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(120,120,120,0.15)';
      for (let t = 0; t < 10; t++) {
        const ang = (t / 10) * TAU;
        ctx.beginPath();
        const x1 = Math.cos(ang) * (this.radius + 1);
        const y1 = Math.sin(ang) * (this.radius + 1);
        const x2 = Math.cos(ang) * (this.radius + 6);
        const y2 = Math.sin(ang) * (this.radius + 6);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      // center label
      ctx.beginPath();
      ctx.fillStyle = '#222';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.value), 0, 0);

      ctx.restore();
    }

    update(dt) {
      if (this.picked) return;
      this.x += this.speed * dt;
      // wrap horizontally
      if (this.speed > 0 && this.x - this.radius > WIDTH + 40) {
        this.x = -40;
      } else if (this.speed < 0 && this.x + this.radius < -40) {
        this.x = WIDTH + 40;
      }
    }
  }

  class Arm {
    constructor() {
      this.x = WIDTH / 2;
      this.y = HEIGHT - 120;
      this.width = 110;
      this.height = 22;
      this.holding = [];
      this.cooldown = 0;
      this.bobPhase = 0;
    }

    draw(ctx, t) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // subtle bobbing for motion
      this.bobPhase += 0.02;
      const bob = Math.sin(this.bobPhase) * 2;
      ctx.translate(0, bob);

      // shadow under arm
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(-this.width / 2 + 6, 12 + bob, this.width, 9);

      // arm beam with soft gradient
      roundRect(ctx, -this.width / 2, -12, this.width, 24, 12);
      const beamGrad = ctx.createLinearGradient(-this.width / 2, -12, this.width / 2, 12);
      beamGrad.addColorStop(0, '#eaf6f6');
      beamGrad.addColorStop(1, '#d9eef0');
      ctx.fillStyle = beamGrad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#9aaab0';
      ctx.stroke();

      // tray with gentle gloss
      roundRect(ctx, -48, 14, 96, 34, 10);
      const trayGrad = ctx.createLinearGradient(0, 14, 0, 48);
      trayGrad.addColorStop(0, '#ffffffe8');
      trayGrad.addColorStop(1, '#e6f3fb');
      ctx.fillStyle = trayGrad;
      ctx.fill();
      ctx.strokeStyle = '#8aa0b1';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // held parts representation
      for (let i = 0; i < this.holding.length; i++) {
        const p = this.holding[i];
        ctx.save();
        const offsetX = -22 + i * 44;
        ctx.translate(offsetX, 30);
        // soft circle background
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.arc(0, 0, 18, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.fillStyle = '#2b2b2b';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.value), 0, 0);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  class Game {
    constructor(ctx) {
      this.ctx = ctx;
      this.lastTime = performance.now();
      this.parts = [];
      this.arm = new Arm();
      this.belts = [
        { y: 140, direction: 1, speedBase: 30 },
        { y: 210, direction: -1, speedBase: 36 }
      ];
      this.level = 1;
      this.maxLevels = 5;
      this.attemptsLeft = 3;
      this.target = 8;
      this.message =
        'Welcome! Press Space or Click to pick up parts. Collect two parts that add to the Target.';
      this.messageTimer = 0;
      this.showHelp = true;
      this.running = true;
      this.win = false;
      this.solvedThisLevel = false;
      this.animationRequest = null;
      this.mouse = { x: 0, y: 0, down: false };
      this.keys = {};
      this.audioVisualOn = true;
      this.confetti = []; // visual celebration particles
      this.sparkles = []; // small sparkles for pickups
      this.initLevel();

      this.bindHandlers();
      this.loop = this.loop.bind(this);
      this.animationRequest = requestAnimationFrame(this.loop);
    }

    bindHandlers() {
      canvas.addEventListener('keydown', (e) => {
        tryInitAudioOnGesture();
        resumeAudioOnInteraction();
        if (e.key === 'm' || e.key === 'M') {
          setAudioEnabled(!audioEnabled);
          this.message = audioEnabled ? 'Sound on' : 'Sound off';
          this.messageTimer = 2000;
          e.preventDefault();
          return;
        }
        if (e.key === 'Escape') {
          this.restart();
          e.preventDefault();
          return;
        }
        if (e.key === ' ') {
          this.tryPickOrDrop();
          e.preventDefault();
        }
        this.keys[e.key] = true;
      });

      canvas.addEventListener('keyup', (e) => {
        this.keys[e.key] = false;
      });

      canvas.addEventListener('mousedown', (e) => {
        tryInitAudioOnGesture();
        resumeAudioOnInteraction();
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        this.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
        this.mouse.down = true;
        this.arm.x = clamp(this.mouse.x, 60, WIDTH - 60);
        this.tryPickOrDrop();
      });

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        this.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
      });

      canvas.addEventListener('mouseup', (e) => {
        this.mouse.down = false;
      });

      canvas.addEventListener('click', () => canvas.focus());
    }

    initLevel() {
      this.parts = [];
      this.arm.holding = [];
      this.solvedThisLevel = false;
      this.win = false;
      this.attemptsLeft = 3;
      this.message = `Level ${this.level}. Build a pair that adds to the Target.`;
      this.messageTimer = 3000;
      this.showHelp = this.level === 1;

      const minTarget = 5 + (this.level - 1) * 1;
      const maxTarget = 10 + (this.level - 1) * 2;
      this.target = randInt(minTarget, maxTarget);

      const pairA = randInt(1, this.target - 1);
      const pairB = this.target - pairA;
      const count = 6;
      for (let i = 0; i < count; i++) {
        const beltIndex = i % 2;
        const belt = this.belts[beltIndex];
        const y = belt.y + (beltIndex === 0 ? -6 : -4);
        const direction = belt.direction;
        const speed = (belt.speedBase + randInt(-8, 8)) * direction;
        let value;
        if (i === 0) value = pairA;
        else if (i === 1) value = pairB;
        else value = randInt(1, Math.max(2, this.target - 1));
        const x = randInt(20, WIDTH - 20);
        this.parts.push(new Part(x, y, speed, value, beltIndex));
      }

      // reset effects
      this.confetti = [];
      this.sparkles = [];
    }

    tryPickOrDrop() {
      if (this.arm.cooldown > 0) return;
      if (this.arm.holding.length < 2) {
        const trayX = this.arm.x;
        const trayY = this.arm.y + 26;
        let best = null;
        let bestDist = 9999;
        for (const p of this.parts) {
          if (p.picked) continue;
          const dx = p.x - trayX;
          const dy = p.y - trayY;
          const dist = Math.hypot(dx, dy);
          if (dist < 40 && dist < bestDist) {
            best = p;
            bestDist = dist;
          }
        }
        if (best) {
          best.picked = true;
          this.arm.holding.push(best);
          playPickSound();
          this.message = 'Picked a part. Place two parts into the gearbox!';
          this.messageTimer = 2000;
          this.arm.cooldown = 200;
          // small sparkles around tray
          this.spawnSparkles(trayX, trayY, 8, '#8fe4c9');
          return;
        }
        for (const p of this.parts) {
          if (p.picked) continue;
          const dx = p.x - this.arm.x;
          const dy = p.y - (this.arm.y - 8);
          const dist = Math.hypot(dx, dy);
          if (dist < 30) {
            p.picked = true;
            this.arm.holding.push(p);
            playPickSound();
            this.message = 'Picked a part!';
            this.messageTimer = 1200;
            this.arm.cooldown = 200;
            this.spawnSparkles(p.x, p.y, 6, '#ffd7a9');
            return;
          }
        }
      } else {
        const gearboxX = WIDTH - 120;
        const gearboxY = HEIGHT / 2;
        const dx = this.arm.x - gearboxX;
        const dy = this.arm.y - gearboxY;
        const dist = Math.hypot(dx, dy);
        if (dist < 120) {
          while (this.arm.holding.length > 2) {
            const extra = this.arm.holding.pop();
            extra.picked = false;
            extra.x = clamp(this.arm.x + randInt(-30, 30), 40, WIDTH - 40);
            playDropSound();
          }

          if (this.arm.holding.length === 2) {
            const sum = this.arm.holding[0].value + this.arm.holding[1].value;
            if (sum === this.target) {
              playCorrectSound();
              this.message = `Nice! ${this.arm.holding[0].value} + ${this.arm.holding[1].value} = ${this.target}`;
              this.messageTimer = 3000;
              this.solvedThisLevel = true;
              // create confetti and sparkle celebration
              this.emitConfetti(40);
              this.spawnSparkles(gearboxX, gearboxY, 30, '#ffffff');
              this.parts = this.parts.filter(p => !this.arm.holding.includes(p));
              this.arm.holding = [];
              setTimeout(() => this.nextLevel(), 1200);
            } else {
              playWrongSound();
              this.attemptsLeft--;
              this.message = `Try again: ${this.arm.holding[0].value} + ${this.arm.holding[1].value} = ${sum}`;
              this.messageTimer = 2500;
              for (const p of this.arm.holding) {
                p.picked = false;
                p.x = clamp(this.arm.x + randInt(-20, 20), 40, WIDTH - 40);
              }
              this.arm.holding = [];
              this.arm.cooldown = 300;
              if (this.attemptsLeft <= 0) {
                this.message = 'Out of attempts! Restarting level...';
                this.messageTimer = 2200;
                setTimeout(() => this.initLevel(), 1200);
              }
            }
          } else {
            playDropSound();
            for (const p of this.arm.holding) {
              p.picked = false;
              p.x = clamp(this.arm.x + randInt(-20, 20), 40, WIDTH - 40);
            }
            this.arm.holding = [];
            this.message = 'You need two parts to test the gearbox.';
            this.messageTimer = 1500;
          }
          return;
        } else {
          for (const p of this.arm.holding) {
            p.picked = false;
            p.x = clamp(this.arm.x + randInt(-20, 20), 40, WIDTH - 40);
          }
          this.arm.holding = [];
          playDropSound();
          this.message = 'Dropped parts back on the belts.';
          this.messageTimer = 1200;
          this.arm.cooldown = 180;
        }
      }
    }

    nextLevel() {
      if (this.level >= this.maxLevels) {
        this.win = true;
        this.message = 'You fixed the Mega Machine! Great work!';
        this.messageTimer = 4000;
        playCorrectSound();
        this.emitConfetti(120);
      } else {
        this.level++;
        this.initLevel();
      }
    }

    restart() {
      this.level = 1;
      this.initLevel();
      this.win = false;
      this.message = 'Game restarted. Have fun!';
      this.messageTimer = 2000;
    }

    update(dt) {
      if (!this.running) return;

      const moveSpeed = 220;
      if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) {
        this.arm.x -= moveSpeed * dt;
      }
      if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) {
        this.arm.x += moveSpeed * dt;
      }
      if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) {
        this.arm.y -= moveSpeed * 0.5 * dt;
      }
      if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) {
        this.arm.y += moveSpeed * 0.5 * dt;
      }
      this.arm.x = clamp(this.arm.x, 60, WIDTH - 60);
      this.arm.y = clamp(this.arm.y, HEIGHT - 200, HEIGHT - 80);

      if (this.keys['Enter']) {
        this.tryPickOrDrop();
        this.keys['Enter'] = false;
      }

      for (const p of this.parts) {
        p.update(dt);
      }

      for (let i = 0; i < this.arm.holding.length; i++) {
        const p = this.arm.holding[i];
        const targetX = this.arm.x + (-22 + i * 44);
        const targetY = this.arm.y + 26;
        p.x += (targetX - p.x) * Math.min(1, dt * 12);
        p.y += (targetY - p.y) * Math.min(1, dt * 12);
      }

      if (this.arm.cooldown > 0) {
        this.arm.cooldown = Math.max(0, this.arm.cooldown - dt * 1000);
      }

      if (this.messageTimer > 0) {
        this.messageTimer -= dt * 1000;
        if (this.messageTimer <= 0) this.message = '';
      }

      // update effects
      this.updateConfetti(dt);
      this.updateSparkles(dt);
    }

    // Confetti for celebration (non-intrusive)
    emitConfetti(count = 40) {
      for (let i = 0; i < count; i++) {
        this.confetti.push({
          x: WIDTH - 120,
          y: HEIGHT / 2,
          vx: (Math.random() - 0.5) * 220,
          vy: -120 + Math.random() * -40,
          rot: Math.random() * TAU,
          drot: (Math.random() - 0.5) * 6,
          size: randInt(6, 12),
          color: ['#79d6c7', '#ffd7a9', '#c9b6fb', '#ffbac9', '#bfe7ff'][randInt(0, 4)],
          life: 2 + Math.random() * 1.8
        });
      }
    }

    updateConfetti(dt) {
      for (let i = this.confetti.length - 1; i >= 0; i--) {
        const c = this.confetti[i];
        c.vy += 380 * dt; // gravity
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += c.drot * dt;
        c.life -= dt;
        if (c.y > HEIGHT + 20 || c.life <= 0) this.confetti.splice(i, 1);
      }
    }

    spawnSparkles(x, y, count = 10, color = '#ffffff') {
      for (let i = 0; i < count; i++) {
        this.sparkles.push({
          x: x + randInt(-18, 18),
          y: y + randInt(-10, 10),
          vx: (Math.random() - 0.5) * 140,
          vy: (Math.random() - 0.5) * 140,
          size: Math.random() * 3 + 1,
          color,
          life: 0.6 + Math.random() * 0.6
        });
      }
    }

    updateSparkles(dt) {
      for (let i = this.sparkles.length - 1; i >= 0; i--) {
        const s = this.sparkles[i];
        s.vy += 220 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        if (s.life <= 0) this.sparkles.splice(i, 1);
      }
    }

    // Drawing layers
    drawBackground(ctx) {
      // subtle layered gradient sky
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, '#f4fbff');
      g.addColorStop(0.5, '#eafaf6');
      g.addColorStop(1, '#f7fbff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // distant soft hills
      ctx.save();
      ctx.fillStyle = '#e6f8f1';
      ctx.beginPath();
      ctx.moveTo(0, 260);
      ctx.quadraticCurveTo(120, 200, 240, 260);
      ctx.quadraticCurveTo(360, 320, 480, 260);
      ctx.quadraticCurveTo(620, 200, WIDTH, 260);
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.lineTo(0, HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // floating clouds (animated by time)
      const t = performance.now() / 1000;
      ctx.save();
      ctx.globalAlpha = 0.85;
      drawCloud(ctx, 80 + Math.sin(t * 0.3) * 8, 60 + Math.cos(t * 0.2) * 6, 60, '#ffffff');
      drawCloud(ctx, 220 + Math.cos(t * 0.25) * 12, 40 + Math.sin(t * 0.3) * 6, 44, '#ffffff');
      drawCloud(ctx, 520 + Math.sin(t * 0.2) * 10, 70 + Math.cos(t * 0.4) * 6, 50, '#ffffff');
      ctx.globalAlpha = 1;
      ctx.restore();

      // big machine frame on right with subtle metallic sheen
      ctx.save();
      ctx.translate(WIDTH - 180, HEIGHT / 2 - 20);
      roundRect(ctx, -120, -140, 240, 280, 16);
      const frameGrad = ctx.createLinearGradient(-120, -140, 120, 140);
      frameGrad.addColorStop(0, '#f3faf9');
      frameGrad.addColorStop(1, '#eef7f5');
      ctx.fillStyle = frameGrad;
      ctx.fill();
      ctx.strokeStyle = '#c3d7d3';
      ctx.lineWidth = 2;
      ctx.stroke();

      // porthole glass
      ctx.beginPath();
      ctx.fillStyle = '#e8fbff';
      ctx.arc(0, -50, 36, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#9cc3cf';
      ctx.stroke();

      // small ambient light
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.ellipse(-22, -28, 40, 14, 0, 0, TAU);
      ctx.fill();

      // target label area
      ctx.beginPath();
      roundRect(ctx, -70, 20, 140, 70, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#9aaeb7';
      ctx.stroke();

      ctx.fillStyle = '#2b2b2b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Gearbox Target', 0, 16);
      ctx.restore();
    }

    drawConveyorAndParts(ctx) {
      for (let b = 0; b < this.belts.length; b++) {
        const belt = this.belts[b];
        const y = belt.y;
        // belt backing with subtle highlight
        roundRect(ctx, 20, y - 28, WIDTH - 260, 56, 14);
        const beltGrad = ctx.createLinearGradient(20, y - 28, WIDTH - 240, y + 28);
        beltGrad.addColorStop(0, '#eef9f8');
        beltGrad.addColorStop(0.5, '#e6f6f3');
        beltGrad.addColorStop(1, '#f0fbfa');
        ctx.fillStyle = beltGrad;
        ctx.fill();

        // moving stripe pattern
        ctx.save();
        ctx.beginPath();
        ctx.rect(20, y - 28, WIDTH - 260, 56);
        ctx.clip();
        const stripeW = 26;
        const offset = ((performance.now() / 28) * belt.direction) % stripeW;
        ctx.strokeStyle = 'rgba(163,224,212,0.55)';
        ctx.lineWidth = 4;
        for (let x = 20 - stripeW + offset; x < WIDTH; x += stripeW) {
          ctx.beginPath();
          ctx.moveTo(x, y - 24);
          ctx.lineTo(x + 18, y + 24);
          ctx.stroke();
        }
        ctx.restore();

        // belt edge screws
        ctx.fillStyle = '#d0d8db';
        for (let s = 24; s < WIDTH - 236; s += 60) {
          ctx.beginPath();
          ctx.arc(s, y - 20, 3.5, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(s, y + 20, 3.5, 0, TAU);
          ctx.fill();
        }
      }

      // draw parts (with improved visuals)
      const time = performance.now();
      for (const p of this.parts) p.draw(ctx, time, this.arm.x, this.arm.y);
    }

    drawMachineDetail(ctx) {
      ctx.save();
      const gx = WIDTH - 120;
      const gy = HEIGHT / 2;

      // frame for target display
      roundRect(ctx, gx - 70, gy + 20, 140, 70, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#9aaeb7';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#2b2b2b';
      ctx.font = 'bold 38px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.target), gx, gy + 56);

      // animated gears with rotation based on time
      const t = performance.now() / 1000;
      drawGear(ctx, gx - 40, gy - 30, 22, 10, '#c2e7e1', '#8ab6a9', t * 0.9);
      drawGear(ctx, gx + 30, gy - 10, 28, 12, '#fde0c2', '#e6b884', -t * 0.6);

      // small status LEDs
      ctx.beginPath();
      ctx.fillStyle = '#ffefb8';
      ctx.arc(gx - 52, gy + 48, 6, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#dff7ef';
      ctx.arc(gx - 36, gy + 48, 6, 0, TAU);
      ctx.fill();

      ctx.restore();
    }

    drawArmAndUI(ctx) {
      // arm behind parts slightly to create layering
      this.arm.draw(ctx, performance.now());

      // HUD panel
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(ctx, 10, 10, 270, 92, 12);
      ctx.fill();
      ctx.strokeStyle = '#dfe6e6';
      ctx.stroke();

      ctx.fillStyle = '#223';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Level ${this.level}/${this.maxLevels}`, 26, 34);

      ctx.font = '13px sans-serif';
      ctx.fillText(`Attempts: ${this.attemptsLeft}`, 26, 56);
      ctx.fillText('Controls: ← → move  Space/Click pick/drop  M toggle sound', 26, 78);

      // audio status pill
      const iconX = 262;
      const iconY = 34;
      roundRect(ctx, iconX, iconY - 14, 38, 28, 8);
      ctx.fillStyle = audioEnabled ? '#7fc9a9' : '#dcdcdc';
      ctx.fill();
      ctx.strokeStyle = '#c7dbd6';
      ctx.stroke();

      ctx.fillStyle = audioEnabled ? '#fff' : '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(audioEnabled ? 'ON' : 'OFF', iconX + 19, iconY + 3);

      ctx.restore();

      // Message area (semi-transparent)
      if (this.message) {
        ctx.save();
        ctx.globalAlpha = 0.96;
        roundRect(ctx, WIDTH / 2 - 260, HEIGHT - 96, 520, 60, 12);
        const msgGrad = ctx.createLinearGradient(
          WIDTH / 2 - 260,
          HEIGHT - 96,
          WIDTH / 2 + 260,
          HEIGHT - 36
        );
        msgGrad.addColorStop(0, 'rgba(255,255,255,0.98)');
        msgGrad.addColorStop(1, 'rgba(245,250,250,0.98)');
        ctx.fillStyle = msgGrad;
        ctx.fill();
        ctx.strokeStyle = '#cdd9dc';
        ctx.stroke();

        ctx.fillStyle = '#2b2b2b';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.message, WIDTH / 2, HEIGHT - 60);
        ctx.restore();
      }

      // Accessibility hint
      ctx.save();
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#6a6a6a';
      ctx.textAlign = 'left';
      ctx.fillText('Use arrows and space. Press M to toggle sound. Press Esc to restart.', 14, HEIGHT - 10);
      ctx.restore();
    }

    drawEffects(ctx) {
      // confetti
      for (const c of this.confetti) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.globalAlpha = clamp(c.life, 0, 1);
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
        ctx.restore();
      }

      // sparkles
      for (const s of this.sparkles) {
        ctx.save();
        ctx.globalAlpha = clamp(s.life, 0, 1);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    drawWinScreen(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      roundRect(ctx, WIDTH / 2 - 260, HEIGHT / 2 - 120, 520, 240, 18);
      ctx.fill();
      ctx.strokeStyle = '#d7e6e6';
      ctx.stroke();

      ctx.fillStyle = '#20323a';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Mega Machine Fixed!', WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = '18px sans-serif';
      ctx.fillText('You solved all levels. Great engineering thinking!', WIDTH / 2, HEIGHT / 2 + 16);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#6a6a6a';
      ctx.fillText('Press Escape to play again.', WIDTH / 2, HEIGHT / 2 + 56);
      ctx.restore();
    }

    draw(ctx) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      this.drawBackground(ctx);
      this.drawConveyorAndParts(ctx);
      this.drawMachineDetail(ctx);
      this.drawArmAndUI(ctx);
      this.drawEffects(ctx);

      if (this.win) {
        this.drawWinScreen(ctx);
      }

      // small floating decorative bubbles (calm and subtle)
      ctx.save();
      ctx.globalAlpha = 0.12;
      const t = performance.now() / 1000;
      for (let i = 0; i < 6; i++) {
        const bx = (i * 110 + ((t * (i + 1) * 6) % 110)) % WIDTH;
        const by = 40 + Math.sin(t * (i + 1)) * 10;
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(bx, by, 7 + (i % 3), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt);
      try {
        this.draw(this.ctx);
      } catch (e) {
        console.error('Render error', e);
      }
      this.animationRequest = requestAnimationFrame(this.loop);
    }

    stop() {
      this.running = false;
      if (this.animationRequest) cancelAnimationFrame(this.animationRequest);
    }
  }

  // ======== Drawing Helpers ========
  function roundRect(ctx, x, y, w, h, r) {
    const radius = r || 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawCloud(ctx, x, y, size, color = '#fff') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.6, 0, TAU);
    ctx.arc(x + size * 0.6, y + 4, size * 0.5, 0, TAU);
    ctx.arc(x - size * 0.5, y + 4, size * 0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawGear(ctx, x, y, radius, teeth, colorLight, colorDark, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    // teeth as thick lines with rounded caps
    for (let i = 0; i < teeth; i++) {
      const ang = (i / teeth) * TAU;
      const x1 = Math.cos(ang) * radius;
      const y1 = Math.sin(ang) * radius;
      const x2 = Math.cos(ang) * (radius + 8);
      const y2 = Math.sin(ang) * (radius + 8);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = colorDark;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // center disc
    ctx.beginPath();
    ctx.fillStyle = colorLight;
    ctx.arc(0, 0, radius - 6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = colorDark;
    ctx.lineWidth = 2;
    ctx.stroke();

    // hub
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(0, 0, radius / 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ======== Initialization and Error Handling ========
  try {
    initAudio();
  } catch (e) {
    console.warn('Audio unavailable:', e);
    audioInitError = true;
    audioEnabled = false;
  }
  setAudioEnabled(audioEnabled);

  const game = new Game(ctx);

  // Accessibility aria updates
  function updateAria() {
    const desc = `Machine Merge. Level ${game.level}. Target ${game.target}. ${game.attemptsLeft} attempts remaining. Use arrows to move the arm, space to pick or drop parts, M to toggle sound.`;
    canvas.setAttribute('aria-label', desc);
  }
  setInterval(updateAria, 1000);

  // Resume audio on first user interaction
  ['click', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(
      evt,
      () => {
        tryInitAudioOnGesture();
        resumeAudioOnInteraction();
      },
      { once: true }
    );
  });

  // Audio context state handling
  if (audioCtx) {
    audioCtx.onstatechange = () => {
      if (audioCtx.state === 'suspended') {
        game.message = 'Audio suspended; press a key or click to resume audio.';
        game.messageTimer = 3000;
      }
    };
  }

  // Graceful cleanup
  window.addEventListener('beforeunload', () => {
    try {
      if (bgOscA) bgOscA.disconnect();
      if (bgOscB) bgOscB.disconnect();
      if (bgLfo) bgLfo.disconnect();
      if (bgGain) bgGain.disconnect();
      if (audioCtx) audioCtx.close();
    } catch (e) {
      // ignore
    }
  });

  // Expose minimal debug hooks
  window.__MachineMergeGame = {
    restart: () => game.restart(),
    toggleSound: () => setAudioEnabled(!audioEnabled)
  };
})();