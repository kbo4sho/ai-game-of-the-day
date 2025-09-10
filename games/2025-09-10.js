(function () {
  // Machine Math (visual & audio polish)
  // Improvements: richer visuals (gradients, gentle animations, confetti), improved audio (ambient pad, conveyor pulse, nicer SFX).
  // NOTE: Game mechanics and math logic remain unchanged.

  // Utility helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const rand = (a = 0, b = 1) => Math.random() * (b - a) + a;

  // Game config
  const WIDTH = 720;
  const HEIGHT = 480;
  const MAX_ROUNDS = 5;
  const INITIAL_SPEED = 1.0;
  const COG_RADIUS = 28;

  // Calming pastel palette with playful accents
  const COLORS = {
    backgroundTop: '#EAF6F4',
    backgroundBottom: '#F7FBFF',
    stage: '#F0FAF8',
    conveyor: '#CDECE6',
    cog: '#FFF3D9',
    cogAccent: '#FFC780',
    arm: '#A9E6D8',
    slot: '#F6FBFB',
    text: '#1D3840',
    good: '#2a9d8f',
    bad: '#e85f4e',
    speaker: '#5E6B73',
    glow: 'rgba(42,157,143,0.14)',
    accentSoft: 'rgba(255,183,77,0.08)'
  };

  // Container & canvas setup (render entirely inside element with ID game-of-the-day-stage)
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    throw new Error('Game container element with ID "game-of-the-day-stage" not found.');
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.userSelect = 'none';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Machine Math game canvas');
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: false });

  // Ensure a roundRect helper on context for convenience (fallback to our roundRect implementation)
  if (typeof ctx.roundRect !== 'function') {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // Accessible status region for screen readers
  const sr = document.createElement('div');
  sr.setAttribute('aria-live', 'polite');
  sr.setAttribute('role', 'status');
  sr.style.position = 'absolute';
  sr.style.left = '-10000px';
  sr.style.width = '1px';
  sr.style.height = '1px';
  sr.style.overflow = 'hidden';
  container.appendChild(sr);

  // Audio state and nodes
  let audioEnabled = true;
  let audioInitialized = false;
  let audioError = null;
  let audioContext = null;
  let masterGain = null;
  let bgGainNode = null;
  let padOscA = null;
  let padOscB = null;
  let padFilter = null;
  let conveyorPulseGain = null;
  let conveyorPulseOsc = null;
  let clickFilter = null;
  let clickDelay = null;

  // Audio initialization (graceful error handling)
  async function initAudio() {
    if (audioInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio API not supported');
      audioContext = new AudioCtx();

      // Master gain with fallback
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(audioContext.destination);

      // Background pad (two detuned sine/triangle oscillators -> filter -> slow amplitude tremolo)
      padOscA = audioContext.createOscillator();
      padOscB = audioContext.createOscillator();
      padFilter = audioContext.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 1200;
      padFilter.Q.value = 0.6;

      padOscA.type = 'sine';
      padOscA.frequency.value = 110;
      padOscB.type = 'sine';
      padOscB.frequency.value = 113;

      bgGainNode = audioContext.createGain();
      bgGainNode.gain.value = 0.05; // quiet background pad

      padOscA.connect(padFilter);
      padOscB.connect(padFilter);
      padFilter.connect(bgGainNode);
      bgGainNode.connect(masterGain);

      // Slight dynamic movement via LFO on filter cutoff
      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08; // slow
      lfoGain.gain.value = 200; // modulation range
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);
      lfo.start();

      padOscA.start();
      padOscB.start();

      // Conveyor pulse: low rhythmic thump (subtle)
      conveyorPulseOsc = audioContext.createOscillator();
      conveyorPulseOsc.type = 'sine';
      conveyorPulseOsc.frequency.value = 55; // low thump
      conveyorPulseGain = audioContext.createGain();
      conveyorPulseGain.gain.value = 0.0; // stays mostly silent; we trigger envelope
      const convFilter = audioContext.createBiquadFilter();
      convFilter.type = 'lowpass';
      convFilter.frequency.value = 400;
      conveyorPulseOsc.connect(convFilter);
      convFilter.connect(conveyorPulseGain);
      conveyorPulseGain.connect(masterGain);
      conveyorPulseOsc.start();

      // Click filter and short delay for a touch of space
      clickFilter = audioContext.createBiquadFilter();
      clickFilter.type = 'highpass';
      clickFilter.frequency.value = 800;
      clickDelay = audioContext.createDelay();
      clickDelay.delayTime.value = 0.06;
      // chain created in each SFX to avoid reuse issues

      audioInitialized = true;
      audioError = null;
    } catch (err) {
      audioInitialized = false;
      audioEnabled = false;
      audioError = err ? err.message || String(err) : 'Unknown audio error';
      console.warn('Audio init error:', audioError);
    }
  }

  // Play a gentle pick/place sound (improved)
  function playClick() {
    if (!audioEnabled || !audioInitialized) return;
    try {
      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      o.type = 'triangle';
      o.frequency.value = 880 + rand(-30, 30);
      g.gain.value = 0.0001;
      const hp = audioContext.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600;
      o.connect(hp);
      hp.connect(g);
      // gentle click with tiny delay for space
      const d = audioContext.createDelay();
      d.delayTime.value = 0.03;
      g.connect(d);
      d.connect(masterGain);
      g.connect(masterGain);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      o.start(now);
      o.stop(now + 0.18);
    } catch (e) {
      console.warn('playClick error', e);
    }
  }

  // Correct solution fanfare (warm arpeggio with echo)
  function playCorrect() {
    if (!audioEnabled || !audioInitialized) return;
    try {
      const now = audioContext.currentTime;
      const notes = [440, 550, 660].map(n => n * (Math.random() * 0.02 + 0.99));
      notes.forEach((freq, i) => {
        const o = audioContext.createOscillator();
        const g = audioContext.createGain();
        const filt = audioContext.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 1500;
        o.type = i === 1 ? 'sine' : 'triangle';
        o.frequency.value = freq;
        g.gain.value = 0.0001;
        o.connect(filt);
        filt.connect(g);

        // short stereo-ish delay (simulate light reverb)
        const delay = audioContext.createDelay();
        delay.delayTime.value = 0.08 + i * 0.03;
        g.connect(delay);
        delay.connect(masterGain);
        g.connect(masterGain);

        const t0 = now + i * 0.07;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
        o.start(t0);
        o.stop(t0 + 0.45);
      });

      // light celebratory ping
      const ping = audioContext.createOscillator();
      const pg = audioContext.createGain();
      ping.type = 'sine';
      ping.frequency.value = 1200;
      pg.gain.value = 0.0001;
      ping.connect(pg);
      pg.connect(masterGain);
      pg.gain.setValueAtTime(0.0001, now + 0.25);
      pg.gain.exponentialRampToValueAtTime(0.09, now + 0.28);
      pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      ping.start(now + 0.25);
      ping.stop(now + 0.95);
    } catch (e) {
      console.warn('playCorrect error', e);
    }
  }

  // Wrong / error sound (soft, friendly)
  function playWrong() {
    if (!audioEnabled || !audioInitialized) return;
    try {
      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      const filt = audioContext.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 900;
      o.type = 'square';
      o.frequency.value = 220;
      g.gain.value = 0.0001;
      o.connect(filt);
      filt.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      o.start(now);
      o.stop(now + 0.32);
    } catch (e) {
      console.warn('playWrong error', e);
    }
  }

  // Soft conveyor 'thump' triggered when a cog passes a certain x (periodic)
  function triggerConveyorThump(intensity = 0.06) {
    if (!audioEnabled || !audioInitialized) return;
    try {
      const now = audioContext.currentTime;
      const g = audioContext.createGain();
      const o = audioContext.createOscillator();
      o.type = 'sine';
      o.frequency.value = 60 + rand(-8, 8);
      const lp = audioContext.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      o.connect(lp);
      lp.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(intensity, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      o.start(now);
      o.stop(now + 0.28);
    } catch (e) {
      console.warn('triggerConveyorThump error', e);
    }
  }

  // Visual helper: rounded rectangle
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Game classes (mechanics unchanged)
  class Cog {
    constructor(number, x, y, speed) {
      this.number = number;
      this.x = x;
      this.y = y;
      this.theta = Math.random() * Math.PI * 2;
      this.speed = speed;
      this.radius = COG_RADIUS;
      this.picked = false;
      this.id = Math.random().toString(36).slice(2);
      this.shineOffset = Math.random() * Math.PI * 2;
    }

    update(dt) {
      if (!this.picked) {
        this.x += this.speed * dt;
        this.theta += 0.8 * dt;
        if (this.x > WIDTH + this.radius) {
          this.x = -this.radius;
          // subtle conveyor thump when wrap occurs
          triggerConveyorThump(0.04);
        } else if (this.x < -this.radius) {
          this.x = WIDTH + this.radius;
          triggerConveyorThump(0.04);
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.theta);

      // soft shadow
      ctx.fillStyle = 'rgba(24,36,36,0.06)';
      ctx.beginPath();
      ctx.ellipse(6, this.radius + 8, this.radius * 1.05, this.radius * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();

      // Teeth with subtle gradient
      for (let i = 0; i < 8; i++) {
        ctx.rotate((Math.PI * 2) / 8);
        ctx.fillStyle = COLORS.cogAccent;
        ctx.beginPath();
        ctx.roundRect(-6, this.radius - 6, 12, 12, 3);
        ctx.fill();
      }

      // Main circle (radial gradient)
      const g = ctx.createRadialGradient(0, -6, this.radius * 0.1, 0, 6, this.radius - 4);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.35, COLORS.cog);
      g.addColorStop(1, '#F0D9A8');
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.arc(0, 0, this.radius - 6, 0, Math.PI * 2);
      ctx.fill();

      // Friendly eyes with slight blink animation (frame-based)
      const blink = 0.9 + Math.sin(Date.now() * 0.004 + this.shineOffset) * 0.08;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(-8, -6, 5, 5 * blink, 0, 0, Math.PI * 2);
      ctx.ellipse(8, -6, 5, 5 * blink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(-8, -6, 2, 0, Math.PI * 2);
      ctx.arc(8, -6, 2, 0, Math.PI * 2);
      ctx.fill();

      // Number with soft shadow
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.number), 1, 11);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(this.number), 0, 10);

      // tiny glossy highlight
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(-10, -12, 8, 4, -0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    containsPoint(px, py) {
      const dx = px - this.x;
      const dy = py - this.y;
      return dx * dx + dy * dy <= this.radius * this.radius;
    }
  }

  class Slot {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.width = 110;
      this.height = 70;
      this.filledCog = null;
      this.pulse = 0;
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // softly glowing background if empty
      if (!this.filledCog) {
        ctx.fillStyle = COLORS.glow;
        roundRect(ctx, -this.width / 2 - 6, -this.height / 2 - 6, this.width + 12, this.height + 12, 16);
        ctx.fill();
      }

      // Slot base with slight inner bevel using gradient
      const grad = ctx.createLinearGradient(0, -this.height / 2, 0, this.height / 2);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(1, COLORS.slot);
      ctx.fillStyle = grad;
      roundRect(ctx, -this.width / 2, -this.height / 2, this.width, this.height, 12);
      ctx.fill();

      // slot label
      ctx.fillStyle = 'rgba(29,56,64,0.9)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Slot', 0, -this.height / 2 - 12);

      // subtle 'ready' pulse if empty
      if (!this.filledCog) {
        this.pulse = (this.pulse + 0.05) % (Math.PI * 2);
        ctx.strokeStyle = `rgba(42,157,143,${0.08 + 0.04 * Math.sin(this.pulse)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        roundRect(ctx, -this.width / 2 + 4, -this.height / 2 + 4, this.width - 8, this.height - 8, 10);
        ctx.stroke();
      }

      // if filled, draw the cog slightly smaller and with a glow
      if (this.filledCog) {
        ctx.save();
        ctx.translate(0, 8);
        ctx.scale(0.8, 0.8);
        // glow behind the inserted cog
        ctx.fillStyle = 'rgba(255,220,160,0.22)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 42, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        this.filledCog.draw(ctx);
        ctx.restore();
      }

      ctx.restore();
    }

    containsPoint(px, py) {
      return (
        px >= this.x - this.width / 2 &&
        px <= this.x + this.width / 2 &&
        py >= this.y - this.height / 2 &&
        py <= this.y + this.height / 2
      );
    }
  }

  // Decorative confetti for success (visual only)
  const confettiParticles = [];
  function spawnConfetti(x, y, count = 28) {
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: x + rand(-20, 20),
        y: y + rand(-10, 10),
        vx: rand(-2.6, 2.6),
        vy: rand(-6, -2),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.08, 0.08),
        size: rand(6, 12),
        color: ['#FFC780', '#FFB6B6', '#CDECE6', '#FFD77F'][randInt(0, 3)],
        life: randInt(60, 140)
      });
    }
  }

  // Main Game class (mechanics preserved)
  class MachineMathGame {
    constructor(ctx) {
      this.ctx = ctx;
      this.cogs = [];
      this.slots = [];
      this.armX = WIDTH / 2;
      this.armY = 110;
      this.armTargetX = this.armX;
      this.armSpeed = 400;
      this.heldCog = null;
      this.conveyorY = 220;
      this.conveyorSpeed = INITIAL_SPEED;
      this.round = 1;
      this.score = 0;
      this.targetSum = 5;
      this.elapsed = 0;
      this.lastTime = performance.now();
      this.paused = false;
      this.ready = false;
      this.message = 'Press Space or Click a cog to pick it up.';
      this.hint = 'Use ← → or drag; press Space to pick/place. Press M to toggle sound.';
      this.note = '';
      this.speakerAnimating = 0;
      this.hoverSpeaker = false;
      this.initLevel();
      this.bindEvents();
      this.isPlaying = true;
      sr.innerText = `Welcome to Machine Math. Target: ${this.targetSum}. ${this.message}`;
    }

    initLevel() {
      this.cogs = [];
      const count = 7;
      for (let i = 0; i < count; i++) {
        const n = randInt(1, Math.min(9, 4 + this.round));
        const x = (i / count) * WIDTH + randInt(-40, 40);
        const y = this.conveyorY + randInt(-10, 10);
        const speed = this.conveyorSpeed * (randInt(80, 120) / 100);
        this.cogs.push(new Cog(n, x, y, speed));
      }
      this.slots = [];
      const sx = WIDTH / 2;
      this.slots.push(new Slot(sx - 130, 360));
      this.slots.push(new Slot(sx + 130, 360));
      this.heldCog = null;
      this.targetSum = clamp(3 + this.round + randInt(0, 3), 3, 15);
      this.message = `Assemble two cogs that add up to ${this.targetSum}.`;
      this.hint = 'Drag or use arrow keys and Space. M toggles sound.';
      this.ready = true;
      sr.innerText = `Round ${this.round}. Target: ${this.targetSum}. ${this.message}`;
    }

    bindEvents() {
      // keyboard controls
      window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          this.armTargetX = clamp(this.armTargetX - 60, 40, WIDTH - 40);
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          this.armTargetX = clamp(this.armTargetX + 60, 40, WIDTH - 40);
          e.preventDefault();
        } else if (e.key === ' ' || e.key === 'Spacebar') {
          this.tryPickOrPlace();
          e.preventDefault();
        } else if (e.key.toLowerCase() === 'm') {
          toggleAudio();
        } else if (e.key === 'Enter' && !this.isPlaying) {
          this.resetGame();
        }
      });

      // mouse / touch events
      let dragging = false;
      let dragOffsetX = 0;

      canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // speaker hit area (top-right)
        if (this.isPointOnSpeaker(mx, my)) {
          toggleAudio();
          this.speakerAnimating = 6;
          return;
        }

        // If clicked on a cog, pick it up
        for (let cog of this.cogs) {
          if (!cog.picked && cog.containsPoint(mx, my)) {
            this.pickCog(cog);
            dragging = true;
            dragOffsetX = cog.x - mx;
            return;
          }
        }
        // Click near arm to set target pos
        if (Math.abs(my - this.armY) < 80) {
          this.armTargetX = clamp(mx, 40, WIDTH - 40);
        }
      });

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // update speaker hover
        this.hoverSpeaker = this.isPointOnSpeaker(mx, my);

        if (!dragging) return;
        if (this.heldCog) {
          this.heldCog.x = clamp(mx + dragOffsetX, 20, WIDTH - 20);
          this.heldCog.y = this.armY + 24;
        }
      });

      window.addEventListener('mouseup', (e) => {
        if (dragging) {
          dragging = false;
          if (this.heldCog) {
            let placed = false;
            for (const slot of this.slots) {
              if (slot.containsPoint(this.heldCog.x, this.heldCog.y)) {
                this.placeInSlot(slot);
                placed = true;
                break;
              }
            }
            if (!placed) {
              this.dropToConveyor();
            }
          }
        }
      });

      // touch
      canvas.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = t.clientX - rect.left;
        const my = t.clientY - rect.top;
        if (this.isPointOnSpeaker(mx, my)) {
          toggleAudio();
          this.speakerAnimating = 6;
          e.preventDefault();
          return;
        }
        for (let cog of this.cogs) {
          if (!cog.picked && cog.containsPoint(mx, my)) {
            this.pickCog(cog);
            e.preventDefault();
            return;
          }
        }
        if (Math.abs(my - this.armY) < 100) {
          this.armTargetX = clamp(mx, 40, WIDTH - 40);
        }
      }, { passive: false });
    }

    isPointOnSpeaker(px, py) {
      const sx = WIDTH - 40;
      const sy = 60;
      const dx = px - sx;
      const dy = py - sy;
      return dx * dx + dy * dy <= 18 * 18;
    }

    pickCog(cog) {
      if (this.heldCog) return;
      cog.picked = true;
      this.heldCog = cog;
      cog.x = this.armX;
      cog.y = this.armY + 24;
      playClick();
      sr.innerText = `Picked up a ${cog.number}.`;
    }

    tryPickOrPlace() {
      if (this.heldCog) {
        let placed = false;
        for (const slot of this.slots) {
          if (slot.containsPoint(this.armX, slot.y)) {
            this.placeInSlot(slot);
            placed = true;
            break;
          }
        }
        if (!placed) {
          this.dropToConveyor();
        }
      } else {
        let nearest = null;
        let bestD = 1e9;
        for (const cog of this.cogs) {
          if (!cog.picked) {
            const d = Math.abs(cog.x - this.armX) + Math.abs(cog.y - this.armY);
            if (d < bestD && d < 120) {
              bestD = d;
              nearest = cog;
            }
          }
        }
        if (nearest) {
          this.pickCog(nearest);
        } else {
          this.note = 'No cog within reach. Move closer!';
          playWrong();
          sr.innerText = 'No cog within reach. Move closer!';
        }
      }
    }

    placeInSlot(slot) {
      if (slot.filledCog) {
        this.note = 'This slot is already filled.';
        playWrong();
        sr.innerText = 'Slot already filled. Choose another.';
        this.dropToConveyor();
        return;
      }
      slot.filledCog = this.heldCog;
      slot.filledCog.x = slot.x;
      slot.filledCog.y = slot.y;
      this.heldCog = null;
      playClick();
      sr.innerText = `Placed a cog in a slot.`;
      if (this.slots.every(s => s.filledCog)) {
        this.checkSolution();
      }
    }

    dropToConveyor() {
      if (this.heldCog) {
        this.heldCog.picked = false;
        this.heldCog.speed = this.conveyorSpeed * (randInt(90, 110) / 100);
        this.heldCog.y = this.conveyorY + randInt(-8, 8);
        this.heldCog = null;
        playClick();
      }
    }

    checkSolution() {
      const sum = this.slots.reduce((s, slot) => s + (slot.filledCog ? slot.filledCog.number : 0), 0);
      if (sum === this.targetSum) {
        this.score++;
        this.message = 'Perfect! The machine whirs to life.';
        playCorrect();
        sr.innerText = `${this.message} You completed round ${this.round}.`;
        // spawn confetti centered near machine mouth
        spawnConfetti(WIDTH / 2, 200, 32);
        setTimeout(() => {
          this.showMachineSuccess();
        }, 500);
      } else {
        this.message = `Oops. That adds to ${sum}. Try again.`;
        playWrong();
        sr.innerText = `Incorrect. ${this.message}`;
        setTimeout(() => {
          for (const slot of this.slots) {
            if (slot.filledCog) {
              const c = slot.filledCog;
              c.picked = false;
              c.x = slot.x + randInt(-80, 80);
              c.y = this.conveyorY + randInt(-12, 12);
              c.speed = this.conveyorSpeed * (randInt(80, 120) / 100);
              slot.filledCog = null;
            }
          }
        }, 600);
      }
    }

    showMachineSuccess() {
      this.note = 'A toy is made!';
      for (const slot of this.slots) {
        if (slot.filledCog) {
          const idx = this.cogs.indexOf(slot.filledCog);
          if (idx >= 0) this.cogs.splice(idx, 1);
        }
        slot.filledCog = null;
      }
      // toy parade visual: spawn a few parade pieces moving across
      for (let i = 0; i < 3; i++) {
        spawnConfetti(120 + i * 80, HEIGHT - 80, 10);
      }
      this.round++;
      this.conveyorSpeed = clamp(this.conveyorSpeed + 0.15, 0.8, 2.5);
      if (this.score >= MAX_ROUNDS || this.round > MAX_ROUNDS) {
        this.winGame();
      } else {
        setTimeout(() => {
          this.initLevel();
        }, 900);
      }
    }

    winGame() {
      this.isPlaying = false;
      this.message = 'You win! The Machine built a parade of toys!';
      sr.innerText = `Congratulations! ${this.message} Press Enter to play again.`;
      playCorrect();
      // big confetti burst
      spawnConfetti(WIDTH / 2, HEIGHT / 2, 120);
    }

    resetGame() {
      this.round = 1;
      this.score = 0;
      this.conveyorSpeed = INITIAL_SPEED;
      this.isPlaying = true;
      this.initLevel();
      this.lastTime = performance.now();
    }

    update(dt) {
      if (!this.isPlaying) {
        // Update confetti even when paused so final animation remains lively
      }
      this.elapsed += dt;

      // Arm movement smoothing
      const dist = this.armTargetX - this.armX;
      const move = clamp(dist, -this.armSpeed * dt / 1000, this.armSpeed * dt / 1000);
      this.armX += move;

      // Update cogs
      for (const cog of this.cogs) {
        cog.speed = this.conveyorSpeed * (Math.sign(cog.speed) || 1);
        cog.update(dt / 16);
      }

      // hold behavior
      if (this.heldCog) {
        this.heldCog.x += (this.armX - this.heldCog.x) * 0.45;
        this.heldCog.y += (this.armY + 24 - this.heldCog.y) * 0.25;
      }

      // speaker animation tick (when toggled)
      if (this.speakerAnimating > 0) this.speakerAnimating -= dt / 60;

      // conveyor-based audio: small pulse when first cog crosses midline each second
      const now = performance.now();
      // simple pulse condition: randomly pulse small chance each update to avoid constant audio
      if (audioEnabled && audioInitialized && Math.random() < 0.006 * this.conveyorSpeed) {
        triggerConveyorThump(0.02 * this.conveyorSpeed);
      }

      // update confetti particles
      for (let i = confettiParticles.length - 1; i >= 0; i--) {
        const p = confettiParticles[i];
        p.vy += 0.2; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life--;
        if (p.life <= 0 || p.y > HEIGHT + 40) confettiParticles.splice(i, 1);
      }
    }

    draw() {
      // background gradient
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, COLORS.backgroundTop);
      g.addColorStop(1, COLORS.backgroundBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // soft atmosphere shapes (parallax subtle movement)
      drawDecorativeShapes(ctx, this.elapsed);

      // stage with inner gradient
      ctx.fillStyle = COLORS.stage;
      roundRect(ctx, 18, 40, WIDTH - 36, HEIGHT - 70, 18);
      ctx.fill();
      // stage inner shadow
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const sg = ctx.createLinearGradient(0, 40, 0, HEIGHT - 30);
      sg.addColorStop(0, 'rgba(255,255,255,0.18)');
      sg.addColorStop(1, 'rgba(0,0,0,0.02)');
      ctx.fillStyle = sg;
      roundRect(ctx, 18, 40, WIDTH - 36, HEIGHT - 70, 18);
      ctx.fill();
      ctx.restore();

      // Conveyor belt container
      ctx.save();
      ctx.translate(0, this.conveyorY);
      // conveyor gradient
      const cg = ctx.createLinearGradient(0, -34, 0, 46);
      cg.addColorStop(0, '#E8F9F4');
      cg.addColorStop(1, '#CFEDE2');
      ctx.fillStyle = cg;
      roundRect(ctx, 20, -34, WIDTH - 40, 80, 14);
      ctx.fill();

      // moving stripe pattern for conveyor (visual only)
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      const offset = (Date.now() / 180) % 70;
      for (let i = -1; i < 12; i++) {
        const sx = 40 + i * 70 + offset;
        ctx.beginPath();
        ctx.ellipse((sx % WIDTH) - 10, 6, 10, 6, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Draw cogs sorted by y for depth
      const drawList = this.cogs.slice().sort((a, b) => a.y - b.y);
      for (const cog of drawList) {
        cog.draw(ctx);
      }

      // Robotic arm
      this.drawArm(ctx);

      // slots
      for (const slot of this.slots) slot.draw(ctx);

      // HUD: round / target / score with subtle panel
      ctx.save();
      // gentle top bar
      const barGrad = ctx.createLinearGradient(0, 18, 0, 48);
      barGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
      barGrad.addColorStop(1, 'rgba(255,255,255,0.6)');
      ctx.fillStyle = barGrad;
      roundRect(ctx, 24, 18, WIDTH - 48, 36, 10);
      ctx.fill();

      ctx.fillStyle = COLORS.text;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Round: ${this.round}`, 40, 38);
      ctx.textAlign = 'center';
      ctx.fillText(`Target: ${this.targetSum}`, WIDTH / 2, 38);
      ctx.textAlign = 'right';
      ctx.fillText(`Built: ${this.score}`, WIDTH - 40, 38);
      ctx.restore();

      // machine face / playful decorations near the arm for character
      this.drawMachineFace(ctx);

      // messages & hints
      ctx.fillStyle = 'rgba(29,56,64,0.9)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.message, WIDTH / 2, HEIGHT - 28);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(29,56,64,0.7)';
      ctx.fillText(this.hint, WIDTH / 2, HEIGHT - 10);

      // speaker icon (top-right)
      this.drawSpeaker(ctx);

      // confetti draw
      drawConfetti(ctx);

      // If game over overlay
      if (!this.isPlaying) {
        ctx.fillStyle = 'rgba(29,56,64,0.6)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('You did it! Parade of toys!', WIDTH / 2, HEIGHT / 2 - 10);
        ctx.font = '16px sans-serif';
        ctx.fillText('Press Enter to play again', WIDTH / 2, HEIGHT / 2 + 22);
      }
    }

    drawArm(ctx) {
      ctx.save();
      ctx.translate(this.armX, this.armY);

      // arm shadow
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.ellipse(0, 80, 64, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      // column with subtle gradient
      const g = ctx.createLinearGradient(0, -80, 0, 60);
      g.addColorStop(0, '#CFF6EB');
      g.addColorStop(1, '#8FDCC2');
      ctx.fillStyle = g;
      roundRect(ctx, -20, -80, 40, 140, 12);
      ctx.fill();

      // gripper
      ctx.save();
      ctx.translate(0, 60);
      // soft metal bar
      ctx.fillStyle = '#7FBFAD';
      roundRect(ctx, -44, -8, 88, 16, 6);
      ctx.fill();
      // fingers
      ctx.fillStyle = '#5DAE96';
      roundRect(ctx, -38, -12, 18, 20, 4);
      roundRect(ctx, 20, -12, 18, 20, 4);
      ctx.restore();

      ctx.restore();

      // If held cog, draw it anchored to the arm (slight bob)
      if (this.heldCog) {
        ctx.save();
        ctx.globalAlpha = 1;
        this.heldCog.draw(ctx);
        ctx.restore();
      }
    }

    drawMachineFace(ctx) {
      // a friendly machine mouth/eyes near the center for personality
      const sx = WIDTH / 2;
      const sy = 180;
      ctx.save();
      // head plate
      const plateW = 220;
      const plateH = 80;
      const pg = ctx.createLinearGradient(sx - plateW / 2, sy - plateH / 2, sx + plateW / 2, sy + plateH / 2);
      pg.addColorStop(0, '#FFFFFF');
      pg.addColorStop(1, '#E6F6F0');
      ctx.fillStyle = pg;
      roundRect(ctx, sx - plateW / 2, sy - plateH / 2, plateW, plateH, 14);
      ctx.fill();

      // eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(sx - 50, sy - 6, 14, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(sx + 50, sy - 6, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(sx - 50, sy - 6, 4, 0, Math.PI * 2);
      ctx.arc(sx + 50, sy - 6, 4, 0, Math.PI * 2);
      ctx.fill();

      // smiling mouth (animated on success)
      const smileScale = 1 + 0.1 * Math.sin(this.elapsed / 180);
      ctx.strokeStyle = '#2D4C4B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx - 40, sy + 14);
      ctx.quadraticCurveTo(sx, sy + 30 * smileScale, sx + 40, sy + 14);
      ctx.stroke();

      ctx.restore();
    }

    drawSpeaker(ctx) {
      const sx = WIDTH - 40;
      const sy = 60;
      ctx.save();
      // base speaker box
      ctx.fillStyle = COLORS.speaker;
      roundRect(ctx, sx - 14, sy - 12, 28, 24, 6);
      ctx.fill();

      // sound waves or mute cross
      ctx.strokeStyle = audioEnabled ? COLORS.good : COLORS.bad;
      ctx.lineWidth = 2;
      if (audioEnabled) {
        const t = Date.now() / 400;
        ctx.beginPath();
        ctx.arc(sx + 16, sy, 12 + Math.sin(t) * 1.6, -0.6, 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx + 16, sy, 18 + Math.sin(t * 1.1) * 1.8, -0.6, 0.6);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(sx + 6, sy - 8);
        ctx.lineTo(sx + 24, sy + 8);
        ctx.moveTo(sx + 24, sy - 8);
        ctx.lineTo(sx + 6, sy + 8);
        ctx.stroke();
      }

      // small halo when hovered or toggled
      if (this.hoverSpeaker || this.speakerAnimating > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.ellipse(sx + 6, sy + 2, 30, 30, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Decorative shapes function with subtle motion
  function drawDecorativeShapes(ctx, elapsed = 0) {
    // floating blobs
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(120,180,170,0.08)';
    ctx.beginPath();
    ctx.ellipse(110 + Math.sin(elapsed / 900) * 6, 90 + Math.cos(elapsed / 1200) * 4, 70, 36, 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(560 + Math.cos(elapsed / 700) * 8, 140 + Math.sin(elapsed / 1000) * 6, 90, 40, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // faint gear motif top-right
    ctx.restore();
    ctx.save();
    ctx.translate(WIDTH - 100, 80);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? 'rgba(255,180,120,0.11)' : 'rgba(160,200,190,0.07)';
      ctx.beginPath();
      ctx.arc(-i * 18, i * 10, 22 - i * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Confetti drawing
  function drawConfetti(ctx) {
    for (const p of confettiParticles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
  }

  // Instantiate game
  const game = new MachineMathGame(ctx);

  // Main loop
  function loop(now) {
    const dt = now - game.lastTime;
    game.lastTime = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(loop);
  }

  // Start audio on user gesture (lazy init)
  function resumeAudioOnGesture() {
    if (!audioInitialized && audioEnabled) {
      initAudio().then(() => {
        if (!audioInitialized) {
          audioEnabled = false;
          sr.innerText = 'Audio could not be started.';
        } else {
          sr.innerText = 'Audio enabled. Press M to mute.';
        }
      }).catch((e) => {
        audioEnabled = false;
        sr.innerText = 'Audio initialization failed.';
        console.warn(e);
      });
    } else if (audioInitialized && audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        console.warn('Audio resume failed:', err);
      });
    }
  }

  // Toggle audio on/off with safety checks
  function toggleAudio() {
    if (!audioInitialized && !audioError) {
      initAudio().then(() => {
        if (audioInitialized) {
          audioEnabled = true;
          sr.innerText = 'Audio enabled.';
        } else {
          audioEnabled = false;
          sr.innerText = 'Audio unavailable.';
        }
      }).catch((e) => {
        audioEnabled = false;
        sr.innerText = 'Audio cannot be enabled.';
      });
      return;
    }
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      if (masterGain) masterGain.gain.value = 0.6;
      if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      sr.innerText = 'Audio on.';
    } else {
      if (masterGain) masterGain.gain.value = 0;
      sr.innerText = 'Audio muted. Press M to unmute.';
    }
  }

  // Setup gesture listeners to initialize audio (many browsers require user gesture)
  function setupGestureInit() {
    const once = () => {
      resumeAudioOnGesture();
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
      window.removeEventListener('touchstart', once);
    };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
    window.addEventListener('touchstart', once);
  }
  setupGestureInit();

  requestAnimationFrame(loop);

  // Expose dataset flag
  container.dataset.gameReady = 'true';

  // Console hint
  console.log('Machine Math (polished) started. Controls: Arrow keys or drag. Space to pick/place. M to toggle sound.');

})();