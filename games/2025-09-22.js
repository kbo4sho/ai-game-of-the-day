(() => {
  // Improved Fix-the-Machine: visuals and audio enhancement
  // Renders into the element with id "game-of-the-day-stage"
  // Canvas is exactly 720x480. All visuals drawn with canvas methods.
  // Sounds are generated with Web Audio API oscillators and filters.
  // Game mechanics and math logic unchanged.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const NUM_GEARS = 3;
  const MAX_LEVELS = 6;

  // Helper clamp
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Get container element
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = WIDTH + 'px';
  container.style.height = HEIGHT + 'px';
  container.setAttribute('role', 'application');
  container.setAttribute('aria-label', 'Fix the Machine math game');

  // Create canvas element (exact 720x480)
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute(
    'aria-label',
    'Machine play area. Use arrow keys to set numbers and Enter to run.'
  );
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Create a non-interactive UI overlay for text
  const ui = document.createElement('div');
  ui.style.position = 'absolute';
  ui.style.left = '10px';
  ui.style.top = '10px';
  ui.style.width = (WIDTH - 20) + 'px';
  ui.style.pointerEvents = 'none';
  ui.style.color = '#0b2433';
  ui.style.fontFamily = 'Arial, Helvetica, sans-serif';
  container.appendChild(ui);

  // Accessible live region
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.style.top = 'auto';
  container.appendChild(live);

  // Instructions block shown above canvas
  const instructions = document.createElement('div');
  instructions.style.pointerEvents = 'none';
  instructions.innerHTML =
    'Goal: Set the three dials so their SUM equals the machine target. Click a dial or use Tab to choose it, then use ↑/↓ to change. Press Space or Enter to RUN.';
  instructions.style.fontSize = '13px';
  instructions.style.padding = '6px';
  instructions.style.background = 'rgba(255,255,255,0.85)';
  instructions.style.borderRadius = '8px';
  instructions.style.width = 'calc(100% - 12px)';
  ui.appendChild(instructions);

  // Audio indicator text
  const audioIndicator = document.createElement('div');
  audioIndicator.style.pointerEvents = 'none';
  audioIndicator.style.marginTop = '6px';
  audioIndicator.style.fontSize = '13px';
  audioIndicator.textContent = 'Audio: initializing...';
  ui.appendChild(audioIndicator);

  // small tip at bottom
  const tip = document.createElement('div');
  tip.style.position = 'absolute';
  tip.style.left = '0';
  tip.style.bottom = '8px';
  tip.style.width = '100%';
  tip.style.textAlign = 'center';
  tip.style.pointerEvents = 'none';
  tip.style.fontSize = '12px';
  tip.style.color = '#0b2433';
  tip.textContent =
    'Tip: Press M to toggle background sound. Press R to reset. Click or press Enter to run.';
  container.appendChild(tip);

  // Game state
  const state = {
    level: 0,
    target: 0,
    dials: [0, 0, 0],
    selected: 0,
    running: false,
    runProgress: 0,
    solvedCount: 0,
    moves: 0,
    maxMoves: 20,
    animationTime: 0,
    systemOK: true,
    backgroundOn: true
  };

  // Generate solvable level: keep logic same as original
  const makeLevel = (levelIndex) => {
    const rangeMax = 9;
    const dials = [];
    for (let i = 0; i < NUM_GEARS; i++) {
      dials.push(Math.floor(Math.random() * (rangeMax + 1)));
    }
    const target = dials.reduce((a, b) => a + b, 0);
    return { dialsStart: dials, target };
  };

  // Audio manager using Web Audio API. Strong error handling and user-gesture init.
  class AudioManager {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.bgNode = null; // composite node for background
      this.available = false;
      this.initialized = false;
      this.gainLimit = 0.7;
      this.bgActive = true;
      this.lfo = null;
    }

    async init() {
      if (this.initialized) return;
      this.initialized = true;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio API not supported.');
        this.ctx = new AudioCtx();

        // master gain with safety clamp
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.6;
        this.master.connect(this.ctx.destination);

        // Background ambient: gentle pad using two detuned oscillators -> filter -> gain
        const bgGain = this.ctx.createGain();
        bgGain.gain.value = 0.02;
        const oscA = this.ctx.createOscillator();
        const oscB = this.ctx.createOscillator();
        oscA.type = 'sine';
        oscB.type = 'sine';
        oscA.frequency.value = 110;
        oscB.frequency.value = 110 * 1.003; // slight detune
        const bgFilter = this.ctx.createBiquadFilter();
        bgFilter.type = 'lowpass';
        bgFilter.frequency.value = 900;
        // subtle LFO on filter frequency to breathe
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.07; // slow
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 120;
        lfo.connect(lfoGain);
        lfoGain.connect(bgFilter.frequency);
        oscA.connect(bgFilter);
        oscB.connect(bgFilter);
        bgFilter.connect(bgGain);
        bgGain.connect(this.master);
        oscA.start();
        oscB.start();
        lfo.start();

        this.bgNode = { oscA, oscB, bgGain, bgFilter, lfo, lfoGain };
        this.available = true;
        this.bgActive = true;
        audioIndicator.textContent = 'Audio: on';
      } catch (err) {
        console.warn('Audio init failed:', err);
        this.available = false;
        audioIndicator.textContent = 'Audio: unavailable';
      }
    }

    setBackground(on) {
      if (!this.available || !this.bgNode) return;
      try {
        // smooth fade
        const t = this.ctx.currentTime;
        const target = on ? 0.02 : 0.0001;
        this.bgNode.bgGain.gain.cancelScheduledValues(t);
        this.bgNode.bgGain.gain.setTargetAtTime(target, t, 0.4);
        this.bgActive = on;
      } catch (err) {
        console.warn('Failed to toggle background:', err);
      }
    }

    // Play a short, friendly tick when dial changes
    playTick() {
      if (!this.available) return;
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = 'triangle';
        osc.frequency.value = 900 + Math.random() * 300;
        filter.type = 'highpass';
        filter.frequency.value = 400;
        gain.gain.value = 0.0001;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.06, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        osc.start(t);
        osc.stop(t + 0.16);
      } catch (err) {
        console.warn('tick sound failed', err);
      }
    }

    // Gentle success chime: arpeggio with soft envelope
    playSuccess() {
      if (!this.available) return;
      try {
        const t = this.ctx.currentTime;
        const base = 330;
        const intervals = [0, 3, 7, 12]; // semitone pattern approximated by multipliers
        intervals.forEach((i, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
          const freq = base * Math.pow(2, i / 12);
          osc.frequency.value = freq + Math.random() * 2;
          osc.connect(gain);
          gain.connect(this.master);
          const start = t + idx * 0.09;
          gain.gain.value = 0.0001;
          gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
          osc.start(start);
          osc.stop(start + 0.5);
        });
      } catch (err) {
        console.warn('success sound failed', err);
      }
    }

    // Soft buzzer that's less harsh: low wobble with filtered noise
    playBuzzer() {
      if (!this.available) return;
      try {
        const t = this.ctx.currentTime;
        // use oscillator with detune and filter for mellow buzz
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.value = 160;
        filter.type = 'bandpass';
        filter.frequency.value = 220;
        filter.Q.value = 0.8;
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 6;
        lfoGain.gain.value = 10;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        gain.gain.value = 0.0001;
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.5);
        osc.start(t);
        lfo.start(t);
        osc.stop(t + 0.62);
        lfo.stop(t + 0.62);
      } catch (err) {
        console.warn('buzzer sound failed', err);
      }
    }
  }

  const audio = new AudioManager();

  const ensureAudioOnUserGesture = async () => {
    if (!audio.initialized) {
      await audio.init();
      audio.setBackground(state.backgroundOn);
    }
  };

  // Game class manages logic and drawing
  class Game {
    constructor(ctx) {
      this.ctx = ctx;
      this.lastTime = performance.now();
      this.levelData = [];
      for (let i = 0; i < MAX_LEVELS; i++) this.levelData.push(makeLevel(i));
      this.resetToLevel(0);
      this.bindEvents();
      this.animationId = requestAnimationFrame((t) => this.loop(t));
      this.confetti = [];
      this.parallaxOffset = 0;
      this.shake = 0;
    }

    resetToLevel(index) {
      state.level = index;
      const data = this.levelData[index];
      state.dials = data.dialsStart.map((v) => {
        const offset = Math.floor(Math.random() * 7) - 3;
        return clamp(v + offset, 0, 9);
      });
      state.target = data.target;
      state.selected = 0;
      state.running = false;
      state.runProgress = 0;
      state.moves = 0;
      state.solvedCount = 0;
      state.animationTime = 0;
      live.textContent = `Level ${state.level + 1}: target ${state.target}. Use arrow keys or click dials.`;
    }

    nextLevel() {
      if (state.level < MAX_LEVELS - 1) {
        this.resetToLevel(state.level + 1);
      } else {
        live.textContent = 'All machines fixed! Great job! Press Enter to play again.';
        this.spawnConfetti(80);
        setTimeout(() => this.resetToLevel(0), 3000);
      }
    }

    bindEvents() {
      canvas.addEventListener('keydown', async (e) => {
        await ensureAudioOnUserGesture();
        const key = e.key;
        if (key === 'Tab') {
          e.preventDefault();
          state.selected = (state.selected + 1) % NUM_GEARS;
          this.announceSelection();
        } else if (key === 'ArrowRight') {
          state.selected = (state.selected + 1) % NUM_GEARS;
          this.announceSelection();
        } else if (key === 'ArrowLeft') {
          state.selected = (state.selected - 1 + NUM_GEARS) % NUM_GEARS;
          this.announceSelection();
        } else if (key === 'ArrowUp') {
          state.dials[state.selected] = clamp(state.dials[state.selected] + 1, 0, 9);
          audio.playTick();
          state.moves++;
        } else if (key === 'ArrowDown') {
          state.dials[state.selected] = clamp(state.dials[state.selected] - 1, 0, 9);
          audio.playTick();
          state.moves++;
        } else if (key === ' ' || key === 'Enter') {
          this.runMachine();
        } else if (key.toLowerCase() === 'r') {
          this.resetToLevel(state.level);
        } else if (key.toLowerCase() === 'm') {
          state.backgroundOn = !state.backgroundOn;
          audio.setBackground(state.backgroundOn);
          audioIndicator.textContent = 'Audio: ' + (state.backgroundOn ? 'on' : 'muted');
        }
      });

      canvas.addEventListener('click', async (e) => {
        await ensureAudioOnUserGesture();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dialIndex = this.dialIndexAt(x, y);
        if (dialIndex !== -1) {
          const dialCenter = this.dialCenter(dialIndex);
          if (y < dialCenter.y) {
            state.dials[dialIndex] = clamp(state.dials[dialIndex] + 1, 0, 9);
          } else {
            state.dials[dialIndex] = clamp(state.dials[dialIndex] - 1, 0, 9);
          }
          state.selected = dialIndex;
          state.moves++;
          audio.playTick();
          this.announceSelection();
          return;
        }
        if (x > WIDTH / 2 - 80 && x < WIDTH / 2 + 80 && y > HEIGHT - 100 && y < HEIGHT - 40) {
          this.runMachine();
        }
      });

      canvas.addEventListener(
        'wheel',
        async (e) => {
          e.preventDefault();
          await ensureAudioOnUserGesture();
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const idx = this.dialIndexAt(x, y);
          if (idx !== -1) {
            state.dials[idx] = clamp(state.dials[idx] + (e.deltaY < 0 ? 1 : -1), 0, 9);
            audio.playTick();
            state.moves++;
          }
        },
        { passive: false }
      );

      canvas.addEventListener('mouseenter', () => {
        canvas.focus();
      });

      // First pointer down should initialize audio per autoplay policy
      canvas.addEventListener(
        'pointerdown',
        async () => {
          await ensureAudioOnUserGesture();
        },
        { once: true }
      );
    }

    announceSelection() {
      live.textContent = `Selected dial ${state.selected + 1}. Value ${state.dials[state.selected]}. Target ${state.target}.`;
    }

    dialCenter(index) {
      const spacing = 160;
      const centerY = HEIGHT / 2 + 10;
      const startX = WIDTH / 2 - spacing;
      return { x: startX + index * spacing, y: centerY };
    }

    dialIndexAt(x, y) {
      for (let i = 0; i < NUM_GEARS; i++) {
        const c = this.dialCenter(i);
        const dx = x - c.x;
        const dy = y - c.y;
        if (dx * dx + dy * dy <= 48 * 48) return i;
      }
      return -1;
    }

    runMachine() {
      if (state.running) return;
      state.running = true;
      state.runProgress = 0;
      state.animationTime = 0;
      audio.playTick();
      live.textContent = 'Machine starting...';
    }

    spawnConfetti(n) {
      for (let i = 0; i < n; i++) {
        this.confetti.push({
          x: WIDTH / 2 + (Math.random() - 0.5) * 160,
          y: HEIGHT / 2 + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 1.5) * 6,
          size: 4 + Math.random() * 6,
          color: `hsl(${Math.random() * 360},70%,55%)`,
          rot: Math.random() * Math.PI * 2,
          life: 60 + Math.random() * 60,
          shape: Math.random() > 0.5 ? 'rect' : 'circle'
        });
      }
    }

    update(dt) {
      if (state.running) {
        state.runProgress += dt * 0.0018;
        state.animationTime += dt;
        if (state.runProgress >= 1) {
          state.running = false;
          state.runProgress = 1;
          const sum = state.dials.reduce((a, b) => a + b, 0);
          if (sum === state.target) {
            audio.playSuccess();
            this.spawnConfetti(22);
            live.textContent = `Nice! The sum is ${sum}. Machine fixed! Press Enter for next machine.`;
            setTimeout(() => this.nextLevel(), 1000);
          } else {
            audio.playBuzzer();
            live.textContent = `Oops! The sum is ${sum}. Try again.`;
            this.shake = 12;
          }
        } else {
          if (Math.random() < 0.02) audio.playTick();
        }
      }
      // confetti physics
      for (let i = this.confetti.length - 1; i >= 0; i--) {
        const p = this.confetti[i];
        p.vy += 0.18;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += 0.16;
        p.life -= 1;
        if (p.life <= 0 || p.y > HEIGHT + 50) this.confetti.splice(i, 1);
      }
      this.parallaxOffset += dt * 0.02;
      if (this.shake) {
        this.shake = Math.max(0, this.shake - dt * 0.02);
      }
    }

    draw() {
      const c = this.ctx;
      // clear
      c.clearRect(0, 0, WIDTH, HEIGHT);

      // layered background: soft gradient + floating chips + subtle grid
      const g = c.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, '#f4fbff');
      g.addColorStop(1, '#eaf6f8');
      c.fillStyle = g;
      c.fillRect(0, 0, WIDTH, HEIGHT);

      // subtle diagonal grid
      c.save();
      c.globalAlpha = 0.06;
      c.strokeStyle = '#a8d0da';
      c.lineWidth = 1;
      for (let i = -HEIGHT; i < WIDTH; i += 28) {
        c.beginPath();
        c.moveTo(i + this.parallaxOffset * 0.6, 0);
        c.lineTo(i + this.parallaxOffset * 0.6 + HEIGHT, HEIGHT);
        c.stroke();
      }
      c.restore();

      // decorative floating 'circuit nodes' with soft glow (parallax)
      for (let i = 0; i < 8; i++) {
        const px = (this.parallaxOffset * (0.5 + i * 0.03) + i * 90) % (WIDTH + 60) - 30;
        const py = 40 + (i % 4) * 90 + Math.sin(Date.now() / 1200 + i) * 8;
        c.save();
        c.globalAlpha = 0.12 + (i % 3) * 0.03;
        const rad = 18 + (i % 3) * 6;
        const glow = c.createRadialGradient(px, py, 0, px, py, rad * 2);
        glow.addColorStop(0, 'rgba(120,200,190,0.55)');
        glow.addColorStop(1, 'rgba(120,200,190,0.0)');
        c.fillStyle = glow;
        c.beginPath();
        c.arc(px, py, rad * 1.6, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      // machine base with soft drop shadow and rounded panel
      c.save();
      const shakeX = this.shake ? Math.sin(this.animationTime * 0.04) * this.shake : 0;
      c.translate(shakeX, 0);

      // outer chassis shadow
      c.fillStyle = 'rgba(20,40,50,0.06)';
      this.roundRect(c, 36, 76, WIDTH - 72, HEIGHT - 152, 22);
      c.fill();

      // chassis panel
      c.fillStyle = '#ffffff';
      this.roundRect(c, 40, 80, WIDTH - 80, HEIGHT - 160, 20);
      c.fill();

      // inner panel with subtle radial highlight
      c.save();
      const innerX = 48,
        innerY = 88,
        innerW = WIDTH - 96,
        innerH = HEIGHT - 176;
      const radGrad = c.createRadialGradient(WIDTH * 0.35, HEIGHT * 0.25, 20, WIDTH / 2, HEIGHT / 2, 400);
      radGrad.addColorStop(0, 'rgba(240,250,254,0.95)');
      radGrad.addColorStop(1, 'rgba(230,246,248,0.95)');
      c.fillStyle = radGrad;
      this.roundRect(c, innerX, innerY, innerW, innerH, 16);
      c.fill();
      c.restore();

      // machine display
      const dispX = WIDTH / 2 - 160,
        dispY = 100,
        dispW = 320,
        dispH = 64;
      c.fillStyle = '#031b22';
      this.roundRect(c, dispX, dispY, dispW, dispH, 10);
      c.fill();

      // soft glowing text 'TARGET'
      c.fillStyle = '#9fe8e2';
      c.font = '700 28px Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor = 'rgba(159,232,226,0.35)';
      c.shadowBlur = 8;
      c.fillText('TARGET: ' + state.target, WIDTH / 2, dispY + dispH / 2);
      c.shadowBlur = 0;

      // decorative side robot character implemented with canvas shapes
      this.drawRobot(c, 84, HEIGHT / 2 + 10, 0.88, this.parallaxOffset);

      // connecting pipes / wires
      c.save();
      c.strokeStyle = 'rgba(20,80,95,0.18)';
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(130, 170);
      c.quadraticCurveTo(200, 150, 280, 190);
      c.stroke();
      c.beginPath();
      c.moveTo(WIDTH - 130, 170);
      c.quadraticCurveTo(WIDTH - 200, 150, WIDTH - 280, 190);
      c.stroke();
      c.restore();

      // Dials / gears
      for (let i = 0; i < NUM_GEARS; i++) {
        const pos = this.dialCenter(i);
        const dialValue = state.dials[i];
        const isSelected = state.selected === i;
        const rot =
          (state.running ? state.runProgress * (i + 1) * Math.PI * 2 : 0) +
          (isSelected ? Math.sin(Date.now() / 360) * 0.08 : 0);
        this.drawEnhancedDial(c, pos.x, pos.y, 48, dialValue, rot, isSelected);
      }

      // progress bar
      c.save();
      const pbX = WIDTH / 2 - 180,
        pbY = HEIGHT / 2 + 90,
        pbW = 360,
        pbH = 14;
      c.fillStyle = '#e6f6f6';
      c.fillRect(pbX, pbY, pbW, pbH);
      // progress with soft gradient
      const pg = c.createLinearGradient(pbX, pbY, pbX + pbW, pbY);
      pg.addColorStop(0, '#4cd6c7');
      pg.addColorStop(1, '#2aaea3');
      c.fillStyle = pg;
      c.fillRect(pbX, pbY, pbW * state.runProgress, pbH);
      c.strokeStyle = 'rgba(20,40,50,0.08)';
      c.strokeRect(pbX, pbY, pbW, pbH);
      c.restore();

      // Run button
      c.save();
      const btnX = WIDTH / 2 - 80,
        btnY = HEIGHT - 100,
        btnW = 160,
        btnH = 48;
      // button gradient
      const btnGrad = c.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
      btnGrad.addColorStop(0, '#34bfa0');
      btnGrad.addColorStop(1, '#1d9b87');
      c.fillStyle = btnGrad;
      this.roundRect(c, btnX, btnY, btnW, btnH, 12);
      c.fill();
      // button text
      c.fillStyle = '#ffffff';
      c.font = '600 18px Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('RUN MACHINE', btnX + btnW / 2, btnY + btnH / 2 + 2);
      c.restore();

      // moves indicator
      c.fillStyle = '#0b2433';
      c.font = '13px Arial';
      c.textAlign = 'left';
      c.fillText(
        'Moves: ' + state.moves + (state.moves > state.maxMoves ? ' (too many moves!)' : ''),
        62,
        HEIGHT - 40
      );

      // audio speaker icon
      c.save();
      c.translate(WIDTH - 92, 40);
      c.fillStyle = state.backgroundOn && audio.available ? '#178f76' : '#9aa7aa';
      c.beginPath();
      c.moveTo(-18, -10);
      c.lineTo(-8, -10);
      c.lineTo(6, -20);
      c.lineTo(6, 20);
      c.lineTo(-8, 10);
      c.lineTo(-18, 10);
      c.closePath();
      c.fill();
      if (audio.available && state.backgroundOn) {
        c.beginPath();
        c.strokeStyle = '#178f76';
        c.lineWidth = 2;
        c.arc(12, 0, 14, -0.6, 0.6);
        c.stroke();
      }
      c.restore();

      // confetti
      for (const p of this.confetti) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.globalAlpha = Math.max(0.1, Math.min(1, p.life / 80));
        if (p.shape === 'rect') {
          c.fillStyle = p.color;
          c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          c.beginPath();
          c.fillStyle = p.color;
          c.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }

      c.restore(); // end translate/shake
    }

    // draw an enhanced dial with soft shadows, center screw, and subtle animated glow
    drawEnhancedDial(c, x, y, r, value, rotation = 0, selected = false) {
      c.save();
      c.translate(x, y);
      c.rotate(rotation);

      // outer bezel with metallic gradient
      const bezelGrad = c.createLinearGradient(-r - 10, -r - 10, r + 10, r + 10);
      bezelGrad.addColorStop(0, '#f7fafb');
      bezelGrad.addColorStop(0.5, '#dfeef1');
      bezelGrad.addColorStop(1, '#c6dfe2');
      c.fillStyle = bezelGrad;
      c.beginPath();
      c.arc(0, 0, r + 10, 0, Math.PI * 2);
      c.fill();

      // teeth painted with soft shadow
      const teeth = 12;
      for (let i = 0; i < teeth; i++) {
        const ang = (i / teeth) * Math.PI * 2;
        const tx = Math.cos(ang) * (r + 12);
        const ty = Math.sin(ang) * (r + 12);
        c.save();
        c.translate(tx, ty);
        c.rotate(ang);
        c.fillStyle = '#e6f3f2';
        c.fillRect(-6, -3, 12, 6);
        c.restore();
      }

      // face with subtle inner shadow
      c.beginPath();
      const faceGrad = c.createRadialGradient(-r / 3, -r / 3, r / 6, 0, 0, r);
      faceGrad.addColorStop(0, '#ffffff');
      faceGrad.addColorStop(1, '#dfeff0');
      c.fillStyle = faceGrad;
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();

      // center screw
      c.beginPath();
      c.fillStyle = '#9fb9b4';
      c.arc(0, 0, 8, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(10,10,10,0.08)';
      c.stroke();

      // numeric label
      c.fillStyle = '#083038';
      c.font = '36px "Comic Sans MS", Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(value), 0, 0);

      // selected halo
      if (selected) {
        c.save();
        c.globalAlpha = 0.12;
        c.fillStyle = '#7be8d2';
        c.beginPath();
        c.arc(0, 0, r + 18, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      c.restore();
    }

    // draw a friendly robot mascot built from simple shapes (no external images)
    drawRobot(c, x, y, scale = 1, offset = 0) {
      c.save();
      c.translate(x, y);
      c.scale(scale, scale);

      // shadow under robot
      c.beginPath();
      c.fillStyle = 'rgba(4,28,34,0.08)';
      c.ellipse(0, 70, 40, 12, 0, 0, Math.PI * 2);
      c.fill();

      // body
      c.fillStyle = '#e8fbf8';
      this.roundRect(c, -36, -10, 72, 82, 12);
      c.fill();
      c.strokeStyle = '#b6e7df';
      c.lineWidth = 2;
      c.stroke();

      // head
      c.beginPath();
      c.fillStyle = '#ffffff';
      c.rect(-28, -58, 56, 40);
      c.fill();
      c.strokeStyle = '#bfe4df';
      c.lineWidth = 2;
      c.stroke();

      // eyes (LEDs)
      const blink = (Math.sin(offset * 0.02) + 1) * 0.5;
      c.fillStyle = '#083038';
      c.beginPath();
      c.arc(-12, -38, 6, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(12, -38, 6, 0, Math.PI * 2);
      c.fill();

      // smiling mouth
      c.beginPath();
      c.strokeStyle = '#0b2433';
      c.lineWidth = 2;
      c.arc(0, -22, 10, 0, Math.PI, false);
      c.stroke();

      // antenna
      c.beginPath();
      c.strokeStyle = '#bfe4df';
      c.lineWidth = 3;
      c.moveTo(0, -58);
      c.lineTo(0, -72);
      c.stroke();
      c.beginPath();
      c.fillStyle = '#34bfa0';
      c.arc(0, -74, 4, 0, Math.PI * 2);
      c.fill();

      // control panel on body
      c.save();
      c.translate(0, 4);
      c.fillStyle = '#f1fffd';
      c.fillRect(-22, 4, 44, 36);
      c.strokeStyle = '#cfeee7';
      c.strokeRect(-22, 4, 44, 36);

      // small LEDs on panel
      const leds = 4;
      for (let i = 0; i < leds; i++) {
        const lx = -18 + i * 12;
        c.beginPath();
        c.fillStyle = i === 1 ? '#ffd064' : i === 2 ? '#7be8d2' : '#a6e0d7';
        c.arc(lx, 16, 4, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();

      c.restore();
    }

    // helper: rounded rect path
    roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    loop(time) {
      const dt = time - this.lastTime;
      this.lastTime = time;
      this.update(dt);
      this.draw();
      this.animationId = requestAnimationFrame((t) => this.loop(t));
    }
  }

  // Start game
  const game = new Game(ctx);

  live.textContent =
    'Welcome to Fix-the-Machine! Focus the game area and follow the instructions to set the dials so their sum matches the target number.';

  // global unhandled rejection logging
  window.addEventListener('unhandledrejection', (ev) => {
    console.error('Unhandled promise rejection:', ev.reason);
  });
})();