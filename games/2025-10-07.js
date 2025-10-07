(function () {
  // Enhanced visuals & audio for Robo-Assembly
  // Renders into element with id "game-of-the-day-stage"
  // Keeps original game mechanics and math logic intact.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_MACHINES = 5;
  const PART_COUNT = 9;
  const BELT_Y = 300;
  const BELT_HEIGHT = 110;
  const PART_SPEED = 0.5;
  const PALETTE = {
    bgTop: '#e9f7fb',
    bgBottom: '#e6f0ee',
    belt: '#dbe7e4',
    beltShadow: '#b8c9c4',
    gear: '#9fb6c3',
    partFill: ['#F9C784', '#C7E7B9', '#C8E6F5', '#F6D1E1', '#E7D3FF', '#FFE5B4'],
    text: '#13323e',
    selector: '#ff6b6b',
    robotPrimary: '#2ea3a3',
    robotSecondary: '#1d6f6f',
    shadow: 'rgba(15,25,30,0.15)'
  };

  // Grab parent element
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with id "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = `${WIDTH}px`;
  container.style.height = `${HEIGHT}px`;
  container.style.maxWidth = `${WIDTH}px`;
  container.style.maxHeight = `${HEIGHT}px`;
  container.style.userSelect = 'none';
  container.style.fontFamily = 'Inter, Roboto, sans-serif';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  canvas.style.display = 'block';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Robo assembly machine math game');
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Screen reader region
  const statusRegion = document.createElement('div');
  statusRegion.setAttribute('role', 'status');
  statusRegion.setAttribute('aria-live', 'polite');
  statusRegion.style.position = 'absolute';
  statusRegion.style.left = '-9999px';
  statusRegion.style.top = 'auto';
  statusRegion.style.width = '1px';
  statusRegion.style.height = '1px';
  statusRegion.style.overflow = 'hidden';
  container.appendChild(statusRegion);

  // Utilities
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Audio Manager (Web Audio API) - robust error handling and layered ambient
  class AudioManager {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.ambientNodes = [];
      this.enabled = false;
      this.muted = false;
    }

    async initFromUserGesture() {
      if (this.enabled) return true;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio not supported');
        this.ctx = new AudioCtx();

        // master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.9;
        this.masterGain.connect(this.ctx.destination);

        // resume if suspended (some browsers require gesture)
        if (this.ctx.state === 'suspended') {
          try {
            await this.ctx.resume();
          } catch (err) {
            /* ignore */
          }
        }

        this.enabled = true;
        this.startAmbient();
        return true;
      } catch (err) {
        console.warn('Audio init failed:', err);
        this.enabled = false;
        this.ctx = null;
        return false;
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      if (!this.masterGain || !this.ctx) return;
      const now = this.ctx.currentTime;
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, now + 0.12);
      } catch (err) {
        console.warn('toggleMute error', err);
      }
    }

    startAmbient() {
      if (!this.enabled || this.ambientNodes.length) return;
      try {
        const ctx = this.ctx;
        // Two gentle detuned sine oscillators as pad
        const g = ctx.createGain();
        g.gain.value = 0.06;
        g.connect(this.masterGain);

        const oscA = ctx.createOscillator();
        oscA.type = 'sine';
        oscA.frequency.value = 110;

        const oscB = ctx.createOscillator();
        oscB.type = 'sine';
        oscB.frequency.value = 138.5;

        // subtle stereo panner movement
        const panA = (ctx.createStereoPanner && ctx.createStereoPanner()) || null;
        const panB = (ctx.createStereoPanner && ctx.createStereoPanner()) || null;
        if (panA) {
          panA.pan.value = -0.2;
          oscA.connect(panA);
          panA.connect(g);
        } else {
          oscA.connect(g);
        }
        if (panB) {
          panB.pan.value = 0.2;
          oscB.connect(panB);
          panB.connect(g);
        } else {
          oscB.connect(g);
        }

        // LFO to gently wobble detune or gain
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08; // slow
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 1.5;

        // route LFO to detune parameters
        try {
          lfo.connect(lfoGain);
          lfoGain.connect(oscA.frequency);
          lfoGain.connect(oscB.frequency);
        } catch (err) {
          // not all browsers allow connecting to frequency directly; fallback to gain modulation (no-op)
        }

        // gentle reverb-ish: lowpass + gain
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        g.connect(filter);
        filter.connect(this.masterGain); // subtle coloration

        // start
        try {
          oscA.start();
        } catch (e) {}
        try {
          oscB.start();
        } catch (e) {}
        try {
          lfo.start();
        } catch (e) {}

        this.ambientNodes = [oscA, oscB, lfo, lfoGain, panA, panB, g, filter];
      } catch (err) {
        console.warn('startAmbient failed', err);
      }
    }

    stopAmbient() {
      if (!this.enabled || !this.ambientNodes.length) return;
      try {
        for (const node of this.ambientNodes) {
          if (!node) continue;
          try {
            if (typeof node.stop === 'function') node.stop();
          } catch (e) {}
          try {
            node.disconnect();
          } catch (e) {}
        }
      } catch (err) {
        console.warn('stopAmbient error', err);
      } finally {
        this.ambientNodes = [];
      }
    }

    // gentle pluck for selecting / clicking
    playClick() {
      if (!this.enabled || !this.ctx) return;
      try {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(880, now);

        // short bandpass to make it pluck-like
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1100;
        bp.Q.value = 5;

        const g = ctx.createGain();
        g.gain.value = 0.0001;

        o.connect(bp);
        bp.connect(g);
        g.connect(this.masterGain);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

        try {
          o.start(now);
          o.stop(now + 0.28);
        } catch (e) {}
      } catch (err) {
        console.warn('playClick failed', err);
      }
    }

    // pleasant chord for correct assembly
    playCorrect() {
      if (!this.enabled || !this.ctx) return;
      try {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const freqs = [520, 660, 820]; // simple major-ish cluster
        const gain = ctx.createGain();
        gain.connect(this.masterGain);
        gain.gain.value = 0.0001;

        freqs.forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = i === 0 ? 'sine' : 'triangle';
          o.frequency.setValueAtTime(f, now);
          const outG = ctx.createGain();
          outG.gain.value = 0.0001;
          o.connect(outG);
          outG.connect(gain);
          outG.gain.setValueAtTime(0.0001, now);
          outG.gain.exponentialRampToValueAtTime(0.08 / (i + 1), now + 0.02 + i * 0.02);
          outG.gain.exponentialRampToValueAtTime(0.0001, now + 0.9 + i * 0.05);
          try {
            o.start(now + i * 0.02);
            o.stop(now + 0.95 + i * 0.05);
          } catch (e) {}
        });

        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
      } catch (err) {
        console.warn('playCorrect failed', err);
      }
    }

    // soft thud / buzzer for wrong
    playWrong() {
      if (!this.enabled || !this.ctx) return;
      try {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(160, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        filter.Q.value = 1;

        const g = ctx.createGain();
        g.gain.value = 0.0001;

        o.connect(filter);
        filter.connect(g);
        g.connect(this.masterGain);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

        try {
          o.start(now);
          o.stop(now + 0.5);
        } catch (e) {}
      } catch (err) {
        console.warn('playWrong failed', err);
      }
    }

    showUnavailable() {
      console.warn('Audio unavailable.');
    }
  }

  const audio = new AudioManager();

  // Part class (visual improvements only)
  class Part {
    constructor(id, x, y, number, shapeIdx = 0, color = null) {
      this.id = id;
      this.x = x;
      this.y = y;
      this.baseY = y;
      this.number = number;
      this.shapeIdx = shapeIdx;
      this.color = color || pick(PALETTE.partFill);
      this.radius = 28;
      this.selected = false;
      this.hover = false;
      this.dropShadow = 12;
    }

    // Draw with bobbing, shadow, and small highlight
    draw(ctx, t, angle = 0) {
      ctx.save();
      // bobbing offset
      const bob = Math.sin((t / 600) + (this.id % 7) * 0.8) * 6;
      ctx.translate(this.x, this.baseY + bob);
      ctx.rotate(angle * 0.8);

      // shadow beneath part
      ctx.beginPath();
      ctx.fillStyle = PALETTE.shadow;
      ctx.ellipse(0, this.radius + 12, this.radius * 0.95, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // body
      ctx.beginPath();
      const r = this.radius;
      ctx.fillStyle = this.selected ? '#fff7d9' : this.color;
      ctx.strokeStyle = this.selected ? '#ff9b9b' : '#7a8e8b';
      ctx.lineWidth = this.selected ? 3.5 : 1.8;

      // organic gear-like blob using bezier arcs
      ctx.moveTo(-r, -r * 0.55);
      ctx.quadraticCurveTo(-r * 1.25, 0, -r, r * 0.6);
      ctx.quadraticCurveTo(-r * 0.5, r * 1.2, 0, r * 0.9);
      ctx.quadraticCurveTo(r * 0.5, r * 1.2, r, r * 0.6);
      ctx.quadraticCurveTo(r * 1.25, 0, r, -r * 0.55);
      ctx.quadraticCurveTo(r * 0.45, -r * 1.05, 0, -r * 1.05);
      ctx.quadraticCurveTo(-r * 0.45, -r * 1.05, -r, -r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // bolts
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * r * 0.55, -r * 0.2, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // number with slight drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.number), 1, 1);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(String(this.number), 0, 0);

      // hover ring
      if (this.hover && !this.selected) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    contains(px, py) {
      // Use circular hit area (with small tolerance)
      const dx = px - this.x;
      const dy = py - this.baseY;
      return Math.sqrt(dx * dx + dy * dy) <= this.radius + 8;
    }
  }

  // Main Game class (mechanics preserved; visuals/audio enhanced)
  class Game {
    constructor() {
      this.parts = [];
      this.lastPartId = 0;
      this.running = true;
      this.assembled = 0;
      this.machineIndex = 0;
      this.target = 0;
      this.requiredParts = [];
      this.currentSum = 0;
      this.selectedIds = new Set();
      this.time = 0;
      this.lastTime = performance.now();
      this.speed = PART_SPEED;
      this.selectorIndex = 0;
      this.hoverPart = null;
      this.message = '';
      this.messageTimer = 0;
      this.won = false;
      this.showInstructions = true;
      this.particles = []; // celebration/feedback particles
      this.robotBlink = 0;
      this.init();
    }

    init() {
      this.parts = [];
      this.lastPartId = 0;
      this.assembled = 0;
      this.machineIndex = 0;
      this.won = false;
      this.selectedIds.clear();
      this.selectorIndex = 0;
      this.particles = [];
      this.robotBlink = 0;
      this.createNextMachine();
      for (let i = 0; i < PART_COUNT; i++) {
        this.spawnPart(WIDTH + i * 80 + randInt(0, 80));
      }
      this.updateStatus(`Welcome! Target: ${this.target}. Use arrow keys and Enter to pick parts.`);
    }

    updateStatus(text) {
      statusRegion.textContent = text;
    }

    createNextMachine() {
      this.machineIndex++;
      const count = clamp(2 + Math.floor(this.machineIndex / 3), 2, 4);
      const nums = [];
      for (let i = 0; i < count; i++) {
        const n = randInt(1, Math.min(12, 6 + this.machineIndex));
        nums.push(n);
      }
      // adjust sum if too large
      let sum = nums.reduce((a, b) => a + b, 0);
      if (sum > 20) {
        while (sum > 20) {
          const idx = randInt(0, nums.length - 1);
          nums[idx] = Math.max(1, nums[idx] - 1);
          sum = nums.reduce((a, b) => a + b, 0);
        }
      }
      this.requiredParts = nums.slice();
      this.target = nums.reduce((a, b) => a + b, 0);
      this.currentSum = 0;
      this.selectedIds.clear();
      this.spawnRequiredPartsOnBelt(nums);
      this.updateStatus(`Assemble machine ${this.machineIndex}. Target power: ${this.target}.`);
    }

    spawnRequiredPartsOnBelt(nums) {
      const baseX = WIDTH + 60;
      const spacing = 110;
      for (let i = 0; i < nums.length; i++) {
        const x = baseX + i * spacing + randInt(-10, 10);
        const y = BELT_Y + BELT_HEIGHT / 2 + randInt(-15, 15);
        const p = new Part(++this.lastPartId, x, y, nums[i]);
        p.color = pick(PALETTE.partFill);
        this.parts.push(p);
      }
    }

    spawnPart(x) {
      const y = BELT_Y + BELT_HEIGHT / 2 + randInt(-18, 18);
      const number = randInt(1, 12);
      const p = new Part(++this.lastPartId, x, y, number);
      this.parts.push(p);
    }

    handlePick(part) {
      if (this.won) return;
      if (!part) return;

      // toggle selection
      if (this.selectedIds.has(part.id)) {
        this.selectedIds.delete(part.id);
        part.selected = false;
        this.recalcSum();
        audio.playClick();
        this.updateStatus(`Removed ${part.number}. Current sum ${this.currentSum} / ${this.target}.`);
        return;
      }

      this.selectedIds.add(part.id);
      part.selected = true;
      this.recalcSum();
      audio.playClick();

      if (this.currentSum === this.target) {
        audio.playCorrect();
        this.assembled++;
        this.message = 'Machine assembled! Great job!';
        this.messageTimer = 1500;
        this.spawnFeedback('correct', part.x, part.y);
        this.updateStatus(`Correct! Machine assembled. ${this.assembled} / ${TARGET_MACHINES}`);
        this.parts = this.parts.filter(p => !this.selectedIds.has(p.id));
        this.selectedIds.clear();
        this.currentSum = 0;
        if (this.assembled >= TARGET_MACHINES) {
          this.win();
          return;
        }
        setTimeout(() => {
          this.createNextMachine();
        }, 900);
      } else if (this.currentSum > this.target) {
        audio.playWrong();
        this.message = 'Oh no — too much power! Try again.';
        this.messageTimer = 1500;
        this.spawnFeedback('wrong', part.x, part.y);
        this.updateStatus(`Too much. Current sum ${this.currentSum}. Resetting selections.`);
        this.parts.forEach(p => (p.selected = false));
        this.selectedIds.clear();
        this.currentSum = 0;
      } else {
        this.updateStatus(`Selected ${part.number}. Current sum ${this.currentSum} / ${this.target}.`);
      }
    }

    recalcSum() {
      let sum = 0;
      for (const id of this.selectedIds) {
        const p = this.parts.find(x => x.id === id);
        if (p) sum += p.number;
      }
      this.currentSum = sum;
    }

    win() {
      this.won = true;
      this.message = 'You assembled all machines! You win!';
      this.messageTimer = 4000;
      audio.playCorrect();
      this.spawnFeedback('victory', WIDTH / 2, HEIGHT / 2);
      this.updateStatus('Victory! You assembled all machines. Press R to play again.');
    }

    restart() {
      this.init();
      this.message = '';
      this.messageTimer = 0;
      this.won = false;
    }

    // spawn small visual feedback (particles)
    spawnFeedback(type, x, y) {
      if (type === 'correct') {
        for (let i = 0; i < 14; i++) {
          this.particles.push({
            x,
            y,
            vx: Math.cos(i / 14 * Math.PI * 2) * (1 + Math.random() * 2),
            vy: Math.sin(i / 14 * Math.PI * 2) * (1 + Math.random() * 2) - 1.4,
            life: 900 + Math.random() * 400,
            size: 4 + Math.random() * 6,
            color: pick(['#FF6B6B', '#FFD166', '#06D6A0', '#4D96FF', '#C77DFF'])
          });
        }
      } else if (type === 'wrong') {
        for (let i = 0; i < 10; i++) {
          this.particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 2.6,
            vy: -Math.random() * 2 - 0.5,
            life: 600 + Math.random() * 300,
            size: 6 + Math.random() * 6,
            color: '#f1a1a1'
          });
        }
      } else if (type === 'victory') {
        for (let i = 0; i < 60; i++) {
          this.particles.push({
            x: x + (Math.random() - 0.5) * 200,
            y: y + (Math.random() - 0.5) * 120,
            vx: (Math.random() - 0.5) * 2.8,
            vy: (Math.random() - 0.5) * 2.8,
            life: 1200 + Math.random() * 800,
            size: 6 + Math.random() * 10,
            color: pick(['#FF6B6B', '#FFD166', '#06D6A0', '#4D96FF', '#C77DFF'])
          });
        }
      }
    }

    // Main update loop (physics/particles)
    update(dt) {
      this.time += dt;
      // move parts
      for (const p of this.parts) {
        p.x -= this.speed * dt;
      }
      // prune left
      this.parts = this.parts.filter(p => p.x > -120);

      // spawn new parts if needed
      while (this.parts.length < PART_COUNT) {
        const lastX = this.parts.length ? Math.max(...this.parts.map(p => p.x)) : WIDTH;
        this.spawnPart(lastX + randInt(80, 140));
      }

      if (this.selectorIndex >= this.parts.length) this.selectorIndex = Math.max(0, this.parts.length - 1);

      // message timer
      if (this.messageTimer > 0) {
        this.messageTimer -= dt;
        if (this.messageTimer <= 0) this.message = '';
      }

      // update particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const s = this.particles[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.05; // gravity
        s.life -= dt;
        if (s.life <= 0) this.particles.splice(i, 1);
      }

      // robot blink timer
      if (this.robotBlink <= 0 && Math.random() < 0.006) {
        this.robotBlink = 220 + Math.random() * 520;
      } else {
        this.robotBlink = Math.max(0, this.robotBlink - dt);
      }
    }

    // Drawing functions
    draw() {
      // background gradient
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, PALETTE.bgTop);
      g.addColorStop(1, PALETTE.bgBottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // soft clouds / pattern
      this.drawSoftClouds();

      // friendly robot character on left
      this.drawRobot();

      // gears and factory elements
      this.drawGears();

      // conveyor belt
      this.drawBelt();

      // draw parts with bobbing and shadows
      const now = performance.now();
      const angleBase = (now % 6000) / 6000 * Math.PI * 2;
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        const a = angleBase * (0.2 + (p.id % 5) * 0.05);
        p.draw(ctx, now, a);
      }

      // selector (robotic claw)
      this.drawSelector();

      // HUD
      this.drawHUD();

      // particles (feedback)
      this.drawParticles();

      // message overlay
      if (this.message) {
        ctx.save();
        ctx.fillStyle = 'rgba(20,20,30,0.9)';
        roundRect(ctx, 80, 40, 560, 36, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.message, WIDTH / 2, 58);
        ctx.restore();
      }

      // victory celebration
      if (this.won) {
        this.drawCelebration();
      }

      // instructions overlay
      if (this.showInstructions) this.drawInstructions();
    }

    drawSoftClouds() {
      // soft ellipse shapes to create a friendly factory sky
      ctx.save();
      for (let i = -40; i < WIDTH + 80; i += 140) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.ellipse((i + (this.time / 8) % 140), 60, 80, 28, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawRobot() {
      // stylized robot helper on left side
      ctx.save();
      const rx = 60,
        ry = BELT_Y - 50;
      // body shadow
      ctx.beginPath();
      ctx.fillStyle = PALETTE.shadow;
      ctx.ellipse(rx, ry + 28, 42, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      // torso
      ctx.fillStyle = PALETTE.robotPrimary;
      roundRect(ctx, rx - 36, ry - 54, 72, 88, 10);
      ctx.fill();

      // chest panel
      ctx.fillStyle = PALETTE.robotSecondary;
      roundRect(ctx, rx - 26, ry - 28, 52, 38, 6);
      ctx.fill();

      // eye / head
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(rx, ry - 74, 30, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      // eyes - blinking
      ctx.fillStyle = '#092022';
      const blinkProgress = this.robotBlink > 0 ? Math.max(0, (this.robotBlink < 60 ? this.robotBlink / 60 : 1)) : 1;
      const eyeH = 8 * blinkProgress;
      // left eye
      roundRect(ctx, rx - 12 - 6, ry - 78 - (8 - eyeH), 12, Math.max(2, eyeH), 3);
      // right eye
      roundRect(ctx, rx + 6 - 6, ry - 78 - (8 - eyeH), 12, Math.max(2, eyeH), 3);
      ctx.fillStyle = '#092022';
      ctx.fill();

      // arm: animated to follow selector
      const targetPart = this.hoverPart || (this.parts.length ? this.parts[clamp(this.selectorIndex, 0, this.parts.length - 1)] : null);
      const armX = targetPart ? targetPart.x : rx + 60;
      const armY = targetPart ? targetPart.baseY - 38 : ry - 30;
      ctx.strokeStyle = '#6b6f72';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(rx + 34, ry - 30);
      // simple easing toward target for a gentle motion
      const midX = rx + 34 + (armX - (rx + 34)) * 0.5;
      const midY = ry - 30 + (armY - (ry - 30)) * 0.45;
      ctx.quadraticCurveTo(midX, midY, armX, armY);
      ctx.stroke();

      // claw
      ctx.save();
      ctx.translate(armX, armY);
      ctx.fillStyle = PALETTE.selector;
      ctx.beginPath();
      ctx.arc(-8, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    }

    drawGears() {
      // larger, softly rotating gears as background elements
      const now = performance.now() / 1000;
      const positions = [
        { x: 140, y: 110, r: 40, s: 0.02 },
        { x: 230, y: 150, r: 28, s: -0.03 },
        { x: 80, y: 180, r: 22, s: 0.015 }
      ];
      for (const g of positions) this.drawGear(g.x, g.y, g.r, now * g.s);
    }

    drawGear(cx, cy, radius, angle) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = PALETTE.gear;
      ctx.strokeStyle = 'rgba(18,32,36,0.12)';
      ctx.lineWidth = 2;
      const teeth = 12;
      const inner = radius * 0.58;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        const r = radius + (i % 2 ? 6 : 0);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = '#dfeff2';
      ctx.arc(0, 0, inner, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawBelt() {
      ctx.save();
      // belt base with subtle texture lines
      ctx.fillStyle = PALETTE.belt;
      roundRect(ctx, 0, BELT_Y, WIDTH, BELT_HEIGHT, 8);
      ctx.fill();

      // soft top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(ctx, 0, BELT_Y, WIDTH, Math.floor(BELT_HEIGHT / 3), 8);
      ctx.fill();

      // belt underside shadow
      ctx.fillStyle = PALETTE.beltShadow;
      ctx.fillRect(0, BELT_Y + BELT_HEIGHT - 14, WIDTH, 14);

      // moving dashed stripe
      ctx.strokeStyle = 'rgba(20,30,30,0.06)';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      const dashOffset = (performance.now() / 40) % 40;
      ctx.setLineDash([34, 28]);
      ctx.lineDashOffset = -dashOffset;
      ctx.beginPath();
      ctx.moveTo(10, BELT_Y + BELT_HEIGHT - 26);
      ctx.lineTo(WIDTH - 10, BELT_Y + BELT_HEIGHT - 26);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    drawSelector() {
      let p = null;
      if (this.hoverPart) p = this.hoverPart;
      else if (this.parts.length) p = this.parts[clamp(this.selectorIndex, 0, this.parts.length - 1)];
      if (!p) return;

      ctx.save();
      const cx = p.x;
      const cy = p.baseY - 70;
      // arm
      ctx.strokeStyle = '#6b6f72';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, p.baseY - 30);
      ctx.stroke();

      // claw
      ctx.translate(cx, p.baseY - 18);
      ctx.fillStyle = PALETTE.selector;
      ctx.beginPath();
      ctx.arc(-8, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // highlight ring
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,107,107,0.9)';
      ctx.lineWidth = 3;
      ctx.arc(p.x, p.baseY, p.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawHUD() {
      ctx.save();
      // translucent white top panel
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      roundRect(ctx, 10, 8, WIDTH - 20, 78, 10);
      ctx.fill();

      // target
      ctx.fillStyle = PALETTE.text;
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Machine Power:', 28, 30);
      ctx.font = 'bold 28px monospace';
      ctx.fillText(String(this.target), 28, 62);

      // selected sum badge
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#e6e6e6';
      roundRect(ctx, 220, 20, 150, 56, 8);
      ctx.fill();
      ctx.stroke();
      ctx.font = '16px sans-serif';
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'center';
      ctx.fillText('Selected Power', 295, 36);
      ctx.font = 'bold 22px monospace';
      ctx.fillText(String(this.currentSum), 295, 62);
      ctx.restore();

      // assembled count
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(`Assembled: ${this.assembled} / ${TARGET_MACHINES}`, WIDTH - 22, 36);

      // speaker icon (top-right)
      const spX = WIDTH - 46,
        spY = 62;
      ctx.save();
      ctx.beginPath();
      // soft rounded rect as button
      ctx.fillStyle = audio.enabled && !audio.muted ? '#2ea3a3' : '#c9c9c9';
      roundRect(ctx, spX - 18, spY - 12, 36, 24, 6);
      ctx.fill();

      // speaker triangle
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(spX - 18, spY);
      ctx.lineTo(spX - 6, spY - 10);
      ctx.lineTo(spX - 6, spY + 10);
      ctx.closePath();
      ctx.fill();

      // animated bars if audio active
      if (audio.enabled && !audio.muted) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(spX - 2, spY - 7);
        ctx.lineTo(spX + 4, spY - 12 + Math.sin(performance.now() / 300) * 3);
        ctx.moveTo(spX - 2, spY);
        ctx.lineTo(spX + 6, spY + Math.cos(performance.now() / 240) * 3);
        ctx.moveTo(spX - 2, spY + 7);
        ctx.lineTo(spX + 4, spY + 12 + Math.sin(performance.now() / 360) * 3);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(spX - 6, spY - 8, 6, 16);
      }
      ctx.restore();

      // help text at bottom
      ctx.font = '12px sans-serif';
      ctx.fillStyle = 'rgba(17,40,43,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText('Keys: ← → select, Enter pick, S enable sound, M mute, R restart, H toggle help', 28, HEIGHT - 14);
      ctx.restore();
    }

    drawParticles() {
      for (const p of this.particles) {
        ctx.save();
        ctx.globalAlpha = clamp(p.life / 1000, 0, 1);
        ctx.fillStyle = p.color;
        // simple rectangle confetti or circles
        if (Math.random() > 0.5) {
          ctx.fillRect(p.x, p.y, p.size, p.size * 1.6);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawInstructions() {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      roundRect(ctx, 120, 120, 480, 200, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.stroke();

      ctx.fillStyle = PALETTE.text;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Robo-Assembly Instructions', WIDTH / 2, 150);

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      const lines = [
        'Assemble each machine by selecting parts whose numbers add',
        'exactly to the target power shown at the top left.',
        '',
        'Use the arrow keys to move the robotic claw and Enter or Space to pick.',
        'You can also click or tap parts. If the sum is too large, selections reset.',
        '',
        'Assemble 5 machines to win. Press S to enable sound (required on some browsers).',
        'Press H to hide these instructions.'
      ];
      let y = 180;
      for (const line of lines) {
        ctx.fillText(line, 150, y);
        y += 22;
      }
      ctx.restore();
    }

    drawCelebration() {
      // big victory message with subtle shadow
      ctx.save();
      ctx.fillStyle = '#20323a';
      ctx.font = '44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Victory! All machines assembled!', WIDTH / 2, 220);
      ctx.font = '18px sans-serif';
      ctx.fillText('Press R to play again.', WIDTH / 2, 250);
      ctx.restore();
    }
  }

  // rounded rect helper
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Instantiate game
  const game = new Game();

  // Pointer handling
  let isPointerDown = false;
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    let found = null;
    for (const p of game.parts) {
      if (p.contains(mx, my)) {
        found = p;
        p.hover = true;
      } else {
        p.hover = false;
      }
    }
    game.hoverPart = found;
    if (found) {
      const idx = game.parts.indexOf(found);
      if (idx >= 0) game.selectorIndex = idx;
    }
  });

  canvas.addEventListener('mouseleave', () => {
    for (const p of game.parts) p.hover = false;
    game.hoverPart = null;
  });

  canvas.addEventListener('click', async (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    // speaker area toggling
    const spX = WIDTH - 46,
      spY = 62;
    if (mx >= spX - 30 && mx <= spX + 30 && my >= spY - 20 && my <= spY + 20) {
      if (!audio.enabled) {
        const ok = await audio.initFromUserGesture();
        if (!ok) {
          game.updateStatus('Audio not available on this device or blocked by browser.');
          audio.showUnavailable();
        } else {
          game.updateStatus('Audio enabled.');
        }
      } else {
        audio.toggleMute();
        game.updateStatus(audio.muted ? 'Audio muted.' : 'Audio unmuted.');
      }
      return;
    }

    // hide instructions if clicked in overlay
    if (game.showInstructions) {
      const ix = 120,
        iy = 120,
        iw = 480,
        ih = 200;
      if (mx >= ix && mx <= ix + iw && my >= iy && my <= iy + ih) {
        game.showInstructions = false;
        game.updateStatus('Instructions hidden. Good luck!');
        return;
      }
    }

    // click parts
    for (const p of game.parts) {
      if (p.contains(mx, my)) {
        if (audio.ctx && audio.ctx.state === 'suspended') {
          audio.ctx.resume().catch(() => {});
        }
        game.handlePick(p);
        return;
      }
    }
  });

  // Keyboard handling
  canvas.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowRight') {
      game.selectorIndex = clamp(game.selectorIndex + 1, 0, Math.max(0, game.parts.length - 1));
      audio.playClick();
      e.preventDefault();
      game.updateStatus('Moved right.');
    } else if (e.key === 'ArrowLeft') {
      game.selectorIndex = clamp(game.selectorIndex - 1, 0, Math.max(0, game.parts.length - 1));
      audio.playClick();
      e.preventDefault();
      game.updateStatus('Moved left.');
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      const p = game.parts[game.selectorIndex];
      if (p) game.handlePick(p);
      e.preventDefault();
    } else if (e.key.toLowerCase() === 's') {
      const ok = await audio.initFromUserGesture();
      if (!ok) game.updateStatus('Audio unavailable on this device or blocked by browser.');
      else game.updateStatus('Audio enabled.');
    } else if (e.key.toLowerCase() === 'm') {
      if (!audio.enabled) {
        game.updateStatus('Audio is not enabled. Press S to enable sound.');
      } else {
        audio.toggleMute();
        game.updateStatus(audio.muted ? 'Audio muted.' : 'Audio unmuted.');
      }
    } else if (e.key.toLowerCase() === 'r') {
      game.restart();
      game.updateStatus('Game restarted.');
    } else if (e.key.toLowerCase() === 'h') {
      game.showInstructions = !game.showInstructions;
      game.updateStatus(game.showInstructions ? 'Showing instructions.' : 'Hiding instructions.');
    }
  });

  // Focus for keyboard
  canvas.addEventListener('focus', () => {});
  canvas.focus();

  // Keep canvas fixed size
  function onResize() {}
  window.addEventListener('resize', onResize);

  // Main animation loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(60, now - last);
    last = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Initial status for screen readers
  game.updateStatus('Welcome to Robo-Assembly! Press H for instructions. Use arrow keys and Enter to play.');

  // Expose minimal API
  window.RoboAssemblyGame = {
    restart: () => game.restart(),
    enableAudio: async () => {
      const ok = await audio.initFromUserGesture();
      return ok;
    }
  };
})();