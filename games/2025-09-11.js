(function () {
  // MACHINE MATH - Enhanced Visuals & Audio
  // All changes limited to visuals and audio only.
  'use strict';

  /* -------------------------
     Basic setup and utilities
     ------------------------- */
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container element with ID "game-of-the-day-stage" not found.');
    return;
  }

  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = '720px';
  container.style.height = '480px';
  container.setAttribute('aria-label', 'Machine Math Game. A number puzzle game for children.');
  container.setAttribute('role', 'application');

  // Accessible live region
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  liveRegion.style.whiteSpace = 'nowrap';
  container.appendChild(liveRegion);

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.style.outline = 'none';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Machine Math game area. Use keyboard or mouse to play.');
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const copy = obj => JSON.parse(JSON.stringify(obj));
  const nowMs = () => performance.now();

  /* -------------------------
     Enhanced Audio manager using Web Audio API
     - More musical, gentle background with LFO
     - Generated click/noise via buffer
     ------------------------- */
  class AudioManager {
    constructor() {
      this.enabled = false;
      this.context = null;
      this.gainMaster = null;
      this.bgNodes = null;
      this.analyser = null;
      this.muted = false;
      this.initAttempted = false;
      this.pulse = 0; // visual pulse level 0..1 for UI
    }

    async init() {
      if (this.initAttempted) return;
      this.initAttempted = true;
      try {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) throw new Error('Web Audio API not supported');
        this.context = new C();
        // Master gain with smooth parameter
        this.gainMaster = this.context.createGain();
        this.gainMaster.gain.value = 0.55;
        this.gainMaster.connect(this.context.destination);

        // analyser (for lightweight visual pulse)
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;
        this.analyser.smoothingTimeConstant = 0.6;
        this.analyser.connect(this.gainMaster);

        // start gentle background audio
        this.startBackground();

        this.enabled = true;
      } catch (err) {
        console.warn('Audio init failed:', err);
        this.enabled = false;
        this.context = null;
      }
    }

    async resumeIfNeeded() {
      if (!this.context) return;
      try {
        if (this.context.state === 'suspended' && typeof this.context.resume === 'function') {
          await this.context.resume();
        }
      } catch (e) {
        console.warn('Audio resume failed:', e);
      }
    }

    // Internal helper to create a short noise burst buffer
    _createNoiseBuffer(duration = 0.06) {
      try {
        const sr = this.context.sampleRate;
        const len = Math.floor(duration * sr);
        const buf = this.context.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / len); // fade out
        }
        return buf;
      } catch (e) {
        console.warn('Noise buffer creation failed', e);
        return null;
      }
    }

    // Play a more nuanced tone with envelope and optional filter
    _playTone({ freq = 440, duration = 0.2, type = 'sine', when = 0, volume = 0.12, filter = {} } = {}) {
      if (!this.context || this.muted) return;
      try {
        const t0 = this.context.currentTime + when;
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        const filterNode = this.context.createBiquadFilter();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(volume, t0 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        // filter
        filterNode.type = filter.type || 'lowpass';
        filterNode.frequency.setValueAtTime(filter.freq || 2200, t0);
        filterNode.Q.value = filter.Q || 0.8;
        osc.connect(filterNode);
        filterNode.connect(gain);
        // route through analyser to master
        gain.connect(this.analyser);
        osc.start(t0);
        osc.stop(t0 + duration + 0.02);
      } catch (e) {
        console.warn('Error _playTone:', e);
      }
    }

    // Click combines a short sine and a tiny noise for tactile feel
    playClick() {
      if (!this.context || this.muted) return;
      try {
        // short high click
        this._playTone({ freq: 960, duration: 0.04, type: 'sine', volume: 0.06, filter: { freq: 6000 } });
        // quick low sub-click
        this._playTone({ freq: 220, duration: 0.08, type: 'square', when: 0.01, volume: 0.02, filter: { freq: 800 } });
        // small noise
        const buf = this._createNoiseBuffer(0.035);
        if (buf) {
          const src = this.context.createBufferSource();
          const g = this.context.createGain();
          src.buffer = buf;
          g.gain.value = 0.02;
          src.connect(g);
          g.connect(this.analyser);
          src.start();
        }
      } catch (e) {
        console.warn('playClick failed', e);
      }
    }

    // Error sound: gentle descending minor motif
    playError() {
      if (!this.context || this.muted) return;
      try {
        this._playTone({ freq: 300, duration: 0.12, type: 'sawtooth', volume: 0.08, filter: { freq: 900 } });
        this._playTone({ freq: 260, duration: 0.14, type: 'sawtooth', when: 0.07, volume: 0.06, filter: { freq: 800 } });
      } catch (e) {
        console.warn('playError failed', e);
      }
    }

    // Success jingle (simple two-note arpeggio)
    playSuccess() {
      if (!this.context || this.muted) return;
      try {
        this._playTone({ freq: 880, duration: 0.12, type: 'sine', volume: 0.08, filter: { freq: 6000 } });
        this._playTone({ freq: 1100, duration: 0.16, type: 'sine', when: 0.08, volume: 0.08, filter: { freq: 7000 } });
        // bright bell-like overtone
        this._playTone({ freq: 1760, duration: 0.14, type: 'triangle', when: 0.12, volume: 0.04, filter: { freq: 9000 } });
      } catch (e) {
        console.warn('playSuccess failed', e);
      }
    }

    // Start warm ambient background with gentle modulation
    startBackground() {
      if (!this.context || this.bgNodes) return;
      try {
        const dest = this.analyser || this.gainMaster;

        // Two detuned low oscillators for pad
        const oscA = this.context.createOscillator();
        const oscB = this.context.createOscillator();
        const gainA = this.context.createGain();
        const gainB = this.context.createGain();

        oscA.type = 'sine';
        oscB.type = 'sine';
        oscA.frequency.value = 55;
        oscB.frequency.value = 66; // harmonic-ish detune

        gainA.gain.value = 0.018;
        gainB.gain.value = 0.014;

        // small filter to keep tones soft
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        // gentle amplitude LFO
        const lfo = this.context.createOscillator();
        const lfoGain = this.context.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 0.12; // slow breathe
        lfoGain.gain.value = 0.006;
        // baseline gain
        const baseGain = this.context.createGain();
        baseGain.gain.value = 0.03;

        // connections
        oscA.connect(gainA);
        oscB.connect(gainB);
        gainA.connect(filter);
        gainB.connect(filter);
        filter.connect(baseGain);
        baseGain.connect(dest);

        // LFO modulates the baseGain for pulsing
        lfo.connect(lfoGain);
        lfoGain.connect(baseGain.gain);

        // start everything
        oscA.start();
        oscB.start();
        lfo.start();

        // keep references
        this.bgNodes = { oscA, oscB, gainA, gainB, filter, lfo, lfoGain, baseGain };

        // kick off a light analyser-pulse read loop to update visual pulse value
        this._startPulseLoop();
      } catch (e) {
        console.warn('startBackground failed:', e);
      }
    }

    _startPulseLoop() {
      if (!this.context || !this.analyser) return;
      try {
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        const loop = () => {
          if (!this.context || !this.analyser) return;
          try {
            this.analyser.getByteFrequencyData(data);
            // compute a simple normalized pulse from low-mid energy
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            const avg = sum / data.length / 255;
            // smooth pulse
            this.pulse = this.pulse * 0.85 + avg * 0.15;
          } catch (e) {
            // ignore
          }
          if (this.bgNodes) requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        console.warn('_startPulseLoop failed', e);
      }
    }

    stopBackground() {
      if (!this.bgNodes) return;
      try {
        const nodes = this.bgNodes;
        ['oscA', 'oscB', 'lfo'].forEach(k => {
          if (nodes[k] && typeof nodes[k].stop === 'function') {
            try { nodes[k].stop(); } catch (e) { /* ignore */ }
            try { nodes[k].disconnect(); } catch (e) { /* ignore */ }
          }
        });
        ['gainA', 'gainB', 'filter', 'lfoGain', 'baseGain'].forEach(k => {
          if (nodes[k]) {
            try { nodes[k].disconnect(); } catch (e) { /* ignore */ }
          }
        });
      } catch (e) {
        console.warn('stopBackground failed', e);
      }
      this.bgNodes = null;
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.gainMaster) {
        // smooth change to avoid click
        try {
          this.gainMaster.gain.setTargetAtTime(this.muted ? 0.0001 : 0.55, this.context.currentTime, 0.02);
        } catch (e) {
          this.gainMaster.gain.value = this.muted ? 0.0001 : 0.55;
        }
      }
      return this.muted;
    }
  }

  const audio = new AudioManager();

  /* -------------------------
     Game logic (UNCHANGED)
     ------------------------- */

  const OP_TYPES = [
    { type: 'add', value: 1, label: '+1' },
    { type: 'add', value: 2, label: '+2' },
    { type: 'add', value: 3, label: '+3' },
    { type: 'add', value: 4, label: '+4' },
    { type: 'sub', value: 1, label: '-1' },
    { type: 'sub', value: 2, label: '-2' },
    { type: 'sub', value: 3, label: '-3' },
    { type: 'mul', value: 2, label: '×2' },
    { type: 'mul', value: 3, label: '×3' }
  ];

  function applyOp(num, op) {
    let result = num;
    switch (op.type) {
      case 'add':
        result = num + op.value;
        break;
      case 'sub':
        result = num - op.value;
        break;
      case 'mul':
        result = num * op.value;
        break;
    }
    result = clamp(Math.round(result), -50, 200);
    return result;
  }

  function generatePuzzle(level) {
    const seqLen = clamp(2 + Math.floor(level / 2), 2, 5);
    const start = randInt(1, 10);
    let cur = start;
    const seq = [];
    for (let i = 0; i < seqLen; i++) {
      const candidate = OP_TYPES[randInt(0, OP_TYPES.length - 1)];
      let chosen = candidate;
      if (Math.random() < 0.1 + level * 0.05) {
        chosen = OP_TYPES[randInt(0, OP_TYPES.length - 1)];
      }
      seq.push(chosen);
      cur = applyOp(cur, chosen);
    }
    const target = cur;
    const pool = [];
    seq.forEach(op => pool.push(copy(op)));
    while (pool.length < Math.min(6, seqLen + 3)) {
      const p = copy(OP_TYPES[randInt(0, OP_TYPES.length - 1)]);
      pool.push(p);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return { start, target, sequence: seq, pool };
  }

  /* -------------------------
     Game State
     ------------------------- */
  const Game = {
    level: 1,
    maxLevel: 5,
    puzzle: null,
    current: 0,
    moves: [],
    selectedIndex: 0,
    status: 'playing',
    attempts: 0,
    hintsUsed: 0,
    audioEnabled: false,
    lastActionTime: 0,
    time: 0,
    particles: [] // visual particle effects
  };

  function startLevel(level) {
    Game.level = level;
    Game.puzzle = generatePuzzle(level);
    Game.current = Game.puzzle.start;
    Game.moves = [];
    Game.selectedIndex = 0;
    Game.status = 'playing';
    Game.attempts = 0;
    Game.hintsUsed = 0;
    Game.lastActionTime = 0;
    Game.particles.length = 0;
    updateLive(`Level ${level}. Start number ${Game.current}. Target ${Game.puzzle.target}. Use operations to reach the target.`);
    requestRender();
  }

  function spawnParticles(x, y, color = '#ffd36a', count = 16) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 90;
      Game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        life: 800 + Math.random() * 500,
        born: nowMs(),
        color,
        size: 2 + Math.random() * 4
      });
    }
  }

  function applyFromPool(index) {
    if (!Game.puzzle || Game.status !== 'playing') return;
    if (index < 0 || index >= Game.puzzle.pool.length) return;
    const op = Game.puzzle.pool[index];
    Game.current = applyOp(Game.current, op);
    Game.moves.push(op);
    Game.attempts++;
    Game.lastActionTime = performance.now();
    audio.playClick();
    // spawn a small subtle spark at tiles region
    const col = index % 3;
    const row = Math.floor(index / 3);
    const tileX = 130 + col * (100 + 20);
    const tileY = 220 + row * (60 + 16);
    spawnParticles(tileX + 50, tileY + 30, '#ffd36a', 8);

    if (Game.current === Game.puzzle.target && Game.moves.length >= Game.puzzle.sequence.length) {
      Game.status = 'levelComplete';
      audio.playSuccess();
      updateLive(`Great! You made ${Game.current}. Level ${Game.level} complete.`);
      // celebratory particles near machine center
      spawnParticles(360, 200, '#7bd389', 30);
      setTimeout(() => {
        if (Game.level < Game.maxLevel) {
          startLevel(Game.level + 1);
        } else {
          Game.status = 'won';
          updateLive('You repaired the big machine! You finished all levels.');
        }
      }, 1200);
    } else {
      if (Game.moves.length > Game.puzzle.sequence.length + 2) {
        audio.playError();
        updateLive('Try a different sequence. You can undo with Backspace or U.');
        // gentle error particle
        spawnParticles(360, 200, '#ff6b6b', 10);
      }
    }
  }

  function undoMove() {
    if (Game.moves.length === 0) return;
    Game.moves.pop();
    let cur = Game.puzzle.start;
    for (const m of Game.moves) cur = applyOp(cur, m);
    Game.current = cur;
    audio.playClick();
    updateLive(`Undid last move. Current value ${Game.current}.`);
  }

  function hint() {
    if (!Game.puzzle || Game.status !== 'playing') return;
    if (Game.hintsUsed >= 2) {
      updateLive('No more hints available for this level.');
      return;
    }
    const nextIndex = Game.moves.length;
    if (nextIndex >= Game.puzzle.sequence.length) {
      updateLive('You are at or beyond the sequence length. Try different steps or undo.');
      return;
    }
    const needed = Game.puzzle.sequence[nextIndex];
    const poolIndex = Game.puzzle.pool.findIndex(p => p.type === needed.type && p.value === needed.value);
    if (poolIndex >= 0) {
      Game.hintsUsed++;
      applyFromPool(poolIndex);
      updateLive(`Hint used. Applied ${needed.label}.`);
    } else {
      Game.hintsUsed++;
      updateLive(`Hint: You need ${needed.label} next.`);
    }
  }

  function restartLevel() {
    startLevel(Game.level);
    audio.playClick();
  }

  function updateLive(msg) {
    liveRegion.textContent = msg;
  }

  /* -------------------------
     Visual Theme & Drawing helpers (Enhanced)
     ------------------------- */
  const theme = {
    backgroundTop: '#e8f7ff',
    backgroundBottom: '#fbf7ee',
    panel: '#f6fbff',
    accent: '#ff7a4d',
    softAccent: '#ffb186',
    calm: '#6ca0dc',
    dark: '#18344a',
    tileFill: '#ffffff',
    tileBorder: '#cbd6df',
    selected: '#fff0e8',
    success: '#7bd389',
    error: '#ff7b7b',
    robot: '#d6f0ff',
    wire: '#dfeaf2'
  };

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawGear(ctx, cx, cy, radius, teeth, angle, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    const toothWidth = Math.PI * 2 / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * toothWidth;
      const inner = radius * 0.75;
      const outer = radius;
      ctx.arc(0, 0, inner, a, a + toothWidth * 0.5);
      const mid = a + toothWidth * 0.5;
      ctx.lineTo(Math.cos(mid) * outer, Math.sin(mid) * outer);
      ctx.arc(0, 0, outer, mid, a + toothWidth);
      ctx.lineTo(Math.cos(a + toothWidth) * inner, Math.sin(a + toothWidth) * inner);
    }
    ctx.closePath();
    ctx.fill();
    // center hub
    ctx.fillStyle = '#1f2b33';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Draw friendly robot character
  function drawRobot(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    // body shadow
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.ellipse(0, 58, 60, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = theme.robot;
    roundedRect(ctx, -48, -10, 96, 80, 10);
    ctx.fillStyle = '#cbeefc';
    ctx.strokeStyle = '#9fcfe9';
    ctx.lineWidth = 2;
    ctx.stroke();

    // face panel
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, -36, -6, 72, 44, 8);
    ctx.strokeStyle = '#eef7fb';
    ctx.stroke();

    // eyes (animated)
    const eyeOffset = Math.sin(t * 2.2) * 2;
    ctx.fillStyle = '#07344a';
    ctx.beginPath();
    ctx.ellipse(-16, 6 + eyeOffset, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(16, 6 - eyeOffset, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // smile
    ctx.strokeStyle = '#0b4156';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 18, 12, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // antenna
    ctx.fillStyle = '#ffd36a';
    ctx.beginPath();
    ctx.arc(0, -22 + Math.sin(t * 3) * 1.5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f7d39a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -6);
    ctx.stroke();

    ctx.restore();
  }

  /* -------------------------
     Rendering - improved visuals and subtle animations
     ------------------------- */
  let rafId = null;
  function render() {
    Game.time += 0.016;
    const t = Game.time;

    // gradient background resembling soft sky + warm floor
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, theme.backgroundTop);
    g.addColorStop(0.6, '#f9fbff');
    g.addColorStop(1, theme.backgroundBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // subtle circuit pattern / grid - low opacity to avoid distraction
    ctx.save();
    ctx.strokeStyle = 'rgba(30,60,80,0.03)';
    ctx.lineWidth = 1;
    for (let x = 20; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(t + x) * 2, 0);
      ctx.lineTo(x + Math.sin(t + x) * 2, canvas.height);
      ctx.stroke();
    }
    for (let y = 20; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.cos(t + y) * 1.5);
      ctx.lineTo(canvas.width, y + Math.cos(t + y) * 1.5);
      ctx.stroke();
    }
    ctx.restore();

    // main machine panel
    ctx.save();
    ctx.shadowColor = 'rgba(20,40,60,0.06)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = theme.panel;
    roundedRect(ctx, 60, 90, 600, 330, 18);
    ctx.restore();

    // left-side robot + gears
    drawRobot(ctx, 110, 240, t);
    drawGear(ctx, 170, 220, 44, 12, t * 1.2, '#a7d0ff');
    drawGear(ctx, 230, 265, 30, 8, -t * 1.6, '#ffd6a5');
    drawGear(ctx, 270, 200, 20, 6, t * 2.2, '#d0f0c0');

    // pipes/track
    ctx.fillStyle = theme.wire || '#e6eef8';
    roundedRect(ctx, 120, 110, 480, 60, 12);
    ctx.fillStyle = '#fff';
    roundedRect(ctx, 130, 120, 460, 40, 10);

    ctx.fillStyle = theme.dark;
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Machine Input → Current Value → Target', 140, 100);

    // number boxes with soft glow
    function drawNumberBox(x, y, w, h, label, value, highlight) {
      ctx.save();
      // background
      ctx.fillStyle = highlight ? '#f2fff4' : '#ffffff';
      ctx.shadowColor = highlight ? 'rgba(123,211,137,0.25)' : 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = highlight ? 18 : 8;
      roundedRect(ctx, x, y, w, h, 10);
      ctx.shadowBlur = 0;
      // border
      ctx.strokeStyle = '#e5eef3';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // label
      ctx.fillStyle = '#2f3b45';
      ctx.font = '500 13px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + 18);
      // value with subtle scale animation when changes
      ctx.font = '700 30px Arial';
      const scale = highlight ? 1.06 : 1.0;
      ctx.save();
      ctx.translate(x + w / 2, y + 42);
      ctx.scale(scale, scale);
      ctx.fillStyle = highlight ? theme.success : '#123';
      ctx.fillText(String(value), 0, 0);
      ctx.restore();
      ctx.restore();
    }

    drawNumberBox(150, 130, 120, 60, 'Input', Game.puzzle ? Game.puzzle.start : '-', false);
    drawNumberBox(300, 130, 150, 60, 'Current', Game.current, Game.current === (Game.puzzle ? Game.puzzle.target : null));
    drawNumberBox(480, 130, 120, 60, 'Target', Game.puzzle ? Game.puzzle.target : '-', true);

    // draw operation tiles with nicer visuals and subtle animations
    const tileX = 130;
    const tileY = 220;
    const tileW = 100;
    const tileH = 60;
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';

    if (Game.puzzle) {
      for (let i = 0; i < Game.puzzle.pool.length; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = tileX + col * (tileW + 20);
        const y = tileY + row * (tileH + 16);
        const isSelected = i === Game.selectedIndex;
        // tile shadow and elevation
        ctx.save();
        ctx.shadowColor = 'rgba(10,30,50,0.08)';
        ctx.shadowBlur = isSelected ? 18 : 8;
        ctx.fillStyle = isSelected ? theme.selected : theme.tileFill;
        roundedRect(ctx, x, y, tileW, tileH, 8);
        ctx.restore();
        // border
        ctx.strokeStyle = isSelected ? theme.accent : theme.tileBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 0.5, y + 0.5, tileW - 1, tileH - 1);
        // label with small transform if selected
        ctx.fillStyle = '#1b2b34';
        ctx.font = isSelected ? 'bold 22px Arial' : '20px Arial';
        ctx.fillText(Game.puzzle.pool[i].label, x + tileW / 2, y + 38 + (isSelected ? Math.sin(t * 6 + i) * 2 : 0));
        // little lever glyph
        ctx.save();
        ctx.fillStyle = '#9aa9b3';
        ctx.globalAlpha = isSelected ? 0.95 : 0.8;
        ctx.translate(x + 8, y + 8);
        ctx.fillRect(0, 0, 18, 6);
        ctx.beginPath();
        ctx.arc(9, 18, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // subtle glow for recently applied tiles
        if (Game.lastActionTime && (nowMs() - Game.lastActionTime) < 700) {
          const dist = Math.abs(i - (Game.puzzle.pool.length - 1));
          ctx.strokeStyle = `rgba(255,150,80,${0.25 - dist * 0.03})`;
          ctx.lineWidth = 4 * (1 - (nowMs() - Game.lastActionTime) / 700);
          ctx.strokeRect(x - 2, y - 2, tileW + 4, tileH + 4);
        }
      }
    }

    // instruction panel with improved layout
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundedRect(ctx, 430, 210, 210, 120, 10);
    ctx.fillStyle = '#123';
    ctx.font = '600 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Controls:', 440, 232);
    ctx.font = '13px Arial';
    ctx.fillText('← / → : Move selection', 440, 252);
    ctx.fillText('Enter : Apply operation', 440, 270);
    ctx.fillText('U / Backspace : Undo', 440, 288);
    ctx.fillText('H : Hint (2 max)  Space : Toggle sound', 440, 306);

    // status
    ctx.fillStyle = '#123';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    const statusMsg = Game.status === 'won' ? 'You finished all levels! Press R to play again.' :
      Game.status === 'levelComplete' ? `Level ${Game.level} complete!` :
        `Level ${Game.level}. Moves: ${Game.moves.length}. Attempts: ${Game.attempts}.`;
    ctx.fillText(statusMsg, 70, 370);

    // audio icon with pulse indicator
    const audioOn = audio.enabled && !audio.muted;
    ctx.save();
    const ax = 660, ay = 20;
    ctx.translate(ax, ay);
    // base speaker
    ctx.fillStyle = audioOn ? theme.success : '#b9c7cf';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(6, 6);
    ctx.lineTo(12, 0);
    ctx.lineTo(12, 24);
    ctx.lineTo(6, 18);
    ctx.lineTo(0, 18);
    ctx.closePath();
    ctx.fill();
    // pulse arcs (use audio.pulse to modulate)
    const pulse = audio && audio.pulse ? (0.2 + audio.pulse * 1.6) : 0.2;
    if (audioOn) {
      ctx.strokeStyle = 'rgba(123,211,137,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(18, 12, 8 + pulse * 6, -0.4, 0.4);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(20, 20);
      ctx.stroke();
    }
    ctx.restore();

    // overlay when finished
    if (Game.status === 'won') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('You fixed the Mega Machine!', canvas.width / 2, canvas.height / 2 - 10);
      ctx.font = '20px Arial';
      ctx.fillText('Press R to play again.', canvas.width / 2, canvas.height / 2 + 30);
    }

    // animated pipe glow after action
    if (Game.lastActionTime && nowMs() - Game.lastActionTime < 700) {
      const elapsed = nowMs() - Game.lastActionTime;
      const alpha = 1 - (elapsed / 700);
      ctx.strokeStyle = `rgba(255,150,80,${0.65 * alpha})`;
      ctx.lineWidth = 8 * alpha;
      ctx.beginPath();
      ctx.moveTo(260, 160);
      ctx.lineTo(430, 160);
      ctx.stroke();
    }

    // update & render particles
    const now = nowMs();
    for (let i = Game.particles.length - 1; i >= 0; i--) {
      const p = Game.particles[i];
      const age = now - p.born;
      if (age > p.life) {
        Game.particles.splice(i, 1);
        continue;
      }
      const lifeRatio = 1 - age / p.life;
      // simple physics
      p.vy += 60 * 0.016; // gravity
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      ctx.globalAlpha = lifeRatio;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    rafId = requestAnimationFrame(render);
  }

  function requestRender() {
    if (!rafId) rafId = requestAnimationFrame(render);
  }

  /* -------------------------
     Input handling (keyboard & mouse)
     - Kept game mechanics intact; just ensure audio init on first gesture
     ------------------------- */

  function handleKey(e) {
    // attempt to init audio on first gesture
    audio.init().then(() => audio.resumeIfNeeded()).catch(() => { /* ignore */ });

    if (!Game.puzzle) return;
    const key = e.key.toLowerCase();
    if (key === 'arrowleft') {
      Game.selectedIndex = (Game.selectedIndex - 1 + Game.puzzle.pool.length) % Game.puzzle.pool.length;
      audio.playClick();
      e.preventDefault();
      updateLive(`Selected ${Game.puzzle.pool[Game.selectedIndex].label}.`);
    } else if (key === 'arrowright') {
      Game.selectedIndex = (Game.selectedIndex + 1) % Game.puzzle.pool.length;
      audio.playClick();
      e.preventDefault();
      updateLive(`Selected ${Game.puzzle.pool[Game.selectedIndex].label}.`);
    } else if (key === 'enter') {
      applyFromPool(Game.selectedIndex);
      e.preventDefault();
    } else if (key === 'backspace' || key === 'u') {
      undoMove();
      e.preventDefault();
    } else if (key === 'h') {
      hint();
      e.preventDefault();
    } else if (key === ' ') {
      audio.init().then(() => {
        const muted = audio.toggleMute();
        updateLive(muted ? 'Audio muted.' : 'Audio unmuted.');
      }).catch(() => updateLive('Audio not available on this device.'));
      e.preventDefault();
    } else if (key === 'r') {
      if (Game.status === 'won') {
        startLevel(1);
      } else {
        restartLevel();
      }
      e.preventDefault();
    }
  }

  function handleClick(e) {
    audio.init().then(() => audio.resumeIfNeeded()).catch(() => { /* ignore */ });
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (Game.puzzle) {
      const tileX = 130;
      const tileY = 220;
      const tileW = 100;
      const tileH = 60;
      for (let i = 0; i < Game.puzzle.pool.length; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = tileX + col * (tileW + 20);
        const y = tileY + row * (tileH + 16);
        if (mx >= x && mx <= x + tileW && my >= y && my <= y + tileH) {
          Game.selectedIndex = i;
          applyFromPool(i);
          return;
        }
      }
      // audio toggle click region
      if (mx >= 660 && mx <= 700 && my >= 2 && my <= 38) {
        audio.init().then(() => {
          const muted = audio.toggleMute();
          updateLive(muted ? 'Audio muted.' : 'Audio unmuted.');
        }).catch(() => updateLive('Audio not available.'));
      }
    }
  }

  canvas.addEventListener('keydown', handleKey);
  canvas.addEventListener('click', handleClick);
  container.addEventListener('click', () => canvas.focus());
  canvas.addEventListener('focus', () => updateLive('Canvas focused. Use arrow keys to select an operation, Enter to apply.'));

  canvas.addEventListener('touchstart', function (e) {
    if (e.touches && e.touches.length > 0) {
      const t = e.touches[0];
      handleClick({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => { } });
      e.preventDefault();
    }
  }, { passive: false });

  /* -------------------------
     Start overlay (visual prompt to begin)
     ------------------------- */
  function showStartOverlay() {
    // render overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme.backgroundTop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = theme.dark;
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Machine Math!', canvas.width / 2, 140);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#1b3a4a';
    ctx.fillText('Help a friendly robot fix the machine by choosing operations.', canvas.width / 2, 180);
    ctx.fillText('Click or press any key to begin.', canvas.width / 2, 210);

    ctx.fillStyle = theme.calm;
    roundedRect(ctx, canvas.width / 2 - 90, 260, 180, 52, 12);
    ctx.fillStyle = '#fff';
    ctx.font = '600 18px Arial';
    ctx.fillText('Start Game', canvas.width / 2, 295);

    function beginOnce(e) {
      audio.init().then(() => audio.resumeIfNeeded()).catch(() => {
        updateLive('Audio could not start. The game will still work without sound.');
      });
      startLevel(1);
      window.removeEventListener('keydown', beginOnce);
      canvas.removeEventListener('click', beginOnce);
    }
    window.addEventListener('keydown', beginOnce, { once: true });
    canvas.addEventListener('click', beginOnce, { once: true });
  }

  showStartOverlay();

  // Clean up on unload
  window.addEventListener('unload', () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (audio && audio.context) {
      try {
        audio.stopBackground();
        if (audio.context.close) audio.context.close();
      } catch (e) { /* ignore */ }
    }
  });

  updateLive('Welcome to Machine Math. Press any key or click to start. After starting, use arrow keys and Enter or tap tiles to play. Press Space to toggle sound.');
  requestRender();

  setTimeout(() => { if (!rafId) requestRender(); }, 500);

})();