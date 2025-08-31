(function () {
  // Enhanced Wacky Machine Math - Visuals & Audio Improvements
  // Core game mechanics unchanged. All visuals drawn with canvas.
  // Sounds generated with Web Audio API. Renders into element with ID 'game-of-the-day-stage'.

  // ====== Configuration ======
  const GAME_WIDTH = 720;
  const GAME_HEIGHT = 480;
  const LEVEL_COUNT = 5;
  const MAX_PARTS = 6;

  // Color palette
  const BG_TOP = '#eaf6ff';
  const BG_BOTTOM = '#eef9f2';
  const ACCENT_1 = '#6bb3ff';
  const ACCENT_2 = '#ffd28a';
  const TEXT_COLOR = '#12333a';
  const MACHINE_METAL_1 = '#d9eaf6';
  const MACHINE_METAL_2 = '#c1d9e9';
  const PART_COLOR = '#ffd89b';
  const PART_COLOR_ALT = '#ffd1e0';
  const SHADOW = 'rgba(20,40,50,0.12)';
  const FONT = '16px "Segoe UI", Roboto, sans-serif';
  const TITLE_FONT = 'bold 20px "Segoe UI", Roboto, sans-serif';

  // ====== Setup canvas and accessibility ======
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with ID "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  canvas.style.width = GAME_WIDTH + 'px';
  canvas.style.height = GAME_HEIGHT + 'px';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Wacky Machine Math. Add number parts to match the machine target. Use mouse or keyboard to play.'
  );
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    console.error('2D context not available.');
    return;
  }

  // ====== Audio Manager (Web Audio API) ======
  class AudioManager {
    constructor() {
      this.enabled = true;
      this.ctx = null;
      this.master = null;
      this.bgNodes = [];
      this.bgGain = null;
      this.isBgPlaying = false;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
      } catch (e) {
        console.warn('Web Audio API not available:', e);
        this.enabled = false;
        this.ctx = null;
      }

      if (this.ctx) {
        this.master = this.safeCreateGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        // Modern autoplay/resume handling
        const resumeIfNeeded = () => {
          if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch((err) => {
              console.warn('Audio context resume failed:', err);
            });
          }
          window.removeEventListener('pointerdown', resumeIfNeeded);
          window.removeEventListener('keydown', resumeIfNeeded);
        };
        window.addEventListener('pointerdown', resumeIfNeeded);
        window.addEventListener('keydown', resumeIfNeeded);
      }
    }

    safeCreateGain() {
      if (!this.ctx) return null;
      try {
        return this.ctx.createGain();
      } catch (e) {
        console.warn('Gain creation failed:', e);
        return null;
      }
    }

    safeCreateOsc(type = 'sine') {
      if (!this.ctx) return null;
      try {
        const o = this.ctx.createOscillator();
        o.type = type;
        return o;
      } catch (e) {
        console.warn('Oscillator creation failed:', e);
        return null;
      }
    }

    // Click: short, bright, subtle
    playClick() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.safeCreateOsc('triangle');
        const gain = this.safeCreateGain();
        if (!osc || !gain) return;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        osc.frequency.setValueAtTime(880, now);
        // quick downward glide for crisp click
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
        osc.connect(gain).connect(this.master);
        osc.start(now);
        osc.stop(now + 0.18);
      } catch (e) {
        console.warn('playClick error:', e);
      }
    }

    // Correct: gentle arpeggio with shimmering filter
    playCorrect() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const notes = [520, 660, 880];
        notes.forEach((freq, i) => {
          const o = this.safeCreateOsc('sine');
          const g = this.safeCreateGain();
          const filt = this.ctx.createBiquadFilter();
          filt.type = 'lowpass';
          filt.frequency.value = 1200 + i * 300;
          g.gain.setValueAtTime(0.0001, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.06, now + i * 0.1);
          g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.6);
          o.frequency.setValueAtTime(freq, now + i * 0.02);
          o.connect(filt);
          filt.connect(g).connect(this.master);
          o.start(now + i * 0.02);
          o.stop(now + i * 0.6);
        });
        // small sparkle overlay
        const s = this.safeCreateOsc('triangle');
        const sg = this.safeCreateGain();
        if (s && sg) {
          sg.gain.setValueAtTime(0.0001, now);
          sg.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
          sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
          s.frequency.setValueAtTime(2200, now);
          s.connect(sg).connect(this.master);
          s.start(now);
          s.stop(now + 0.46);
        }
      } catch (e) {
        console.warn('playCorrect error:', e);
      }
    }

    // Incorrect: low wobble with slight distortion feel
    playIncorrect() {
      if (!this.enabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const o = this.safeCreateOsc('sawtooth');
        const g = this.safeCreateGain();
        const filt = this.ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(1000, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
        o.frequency.setValueAtTime(160, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.36);
        o.connect(filt).connect(g).connect(this.master);
        o.start(now);
        o.stop(now + 0.46);
      } catch (e) {
        console.warn('playIncorrect error:', e);
      }
    }

    // Background ambient: two slow oscillators with gentle LFOs and filter
    startBackground() {
      if (!this.enabled || !this.ctx || this.isBgPlaying) return;
      try {
        const now = this.ctx.currentTime;
        this.bgGain = this.safeCreateGain();
        if (!this.bgGain) return;
        this.bgGain.gain.value = 0.035; // very subtle
        this.bgGain.connect(this.master);

        // Low drone
        const drone = this.safeCreateOsc('sine');
        drone.frequency.value = 55;
        const droneFilt = this.ctx.createBiquadFilter();
        droneFilt.type = 'lowpass';
        droneFilt.frequency.value = 200;
        drone.connect(droneFilt).connect(this.bgGain);
        drone.start(now);
        this.bgNodes.push(drone);

        // Higher shimmer with slow wobble
        const shimmer = this.safeCreateOsc('sine');
        shimmer.frequency.value = 110;
        const shimmerGain = this.safeCreateGain();
        shimmerGain.gain.value = 0.012;
        shimmer.connect(shimmerGain).connect(this.bgGain);
        shimmer.start(now);
        this.bgNodes.push(shimmer);

        // LFO to modulate shimmer amplitude
        const lfo = this.safeCreateOsc('sine');
        lfo.frequency.value = 0.08;
        const lfoGain = this.safeCreateGain();
        lfoGain.gain.value = 0.01;
        lfo.connect(lfoGain);
        lfoGain.connect(shimmerGain.gain);
        lfo.start(now);
        this.bgNodes.push(lfo);

        // Gentle filter sweep LFO to add movement
        const filtLfo = this.safeCreateOsc('sine');
        filtLfo.frequency.value = 0.05;
        const filtGain = this.safeCreateGain();
        filtGain.gain.value = 400;
        filtLfo.connect(filtGain);
        filtGain.connect(droneFilt.frequency);
        filtLfo.start(now);
        this.bgNodes.push(filtLfo);

        this.isBgPlaying = true;
      } catch (e) {
        console.warn('startBackground error:', e);
      }
    }

    stopBackground() {
      if (!this.ctx || !this.isBgPlaying) return;
      try {
        for (const node of this.bgNodes) {
          try {
            node.stop();
          } catch (e) {
            // ignore
          }
          try {
            node.disconnect();
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        console.warn('stopBackground error:', e);
      } finally {
        this.bgNodes = [];
        this.bgGain = null;
        this.isBgPlaying = false;
      }
    }

    toggleEnabled() {
      this.enabled = !this.enabled;
      if (this.enabled) {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch((err) => console.warn('resume failed', err));
        }
        this.startBackground();
      } else {
        this.stopBackground();
      }
    }
  }

  const audio = new AudioManager();
  if (audio.enabled) {
    audio.startBackground();
  }

  // ====== Utilities ======
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function subsetSumExists(parts, target) {
    const possible = new Set([0]);
    for (const p of parts) {
      const next = new Set(possible);
      for (const s of possible) next.add(s + p);
      for (const v of next) possible.add(v);
      if (possible.has(target)) return true;
    }
    return possible.has(target);
  }

  function pickPartsForTarget(target, count) {
    const minPart = 1;
    const maxPart = Math.max(3, Math.floor(target * 0.9));
    const solution = [];
    let remaining = target;
    let picks = rand(1, Math.min(3, count));
    for (let i = 0; i < picks; i++) {
      if (i === picks - 1) {
        solution.push(remaining);
      } else {
        const maxPossible = Math.max(minPart, Math.floor(remaining - (picks - i - 1) * minPart));
        const v = Math.max(minPart, rand(1, maxPossible));
        solution.push(v);
        remaining -= v;
      }
    }
    const parts = solution.slice();
    while (parts.length < count) {
      let d = rand(1, Math.max(1, target + 3));
      parts.push(d);
    }
    for (let i = parts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }
    if (!subsetSumExists(parts, target)) {
      parts[0] = Math.max(1, target - 1);
      parts[1] = target - parts[0];
    }
    return parts.slice(0, count);
  }

  // ====== Game State ======
  let levelIndex = 0;
  let levels = [];
  let parts = [];
  let machineParts = [];
  let selectedPartIndex = -1;
  let isAnimating = false;
  let animationTicks = 0;
  let feedbackText = '';
  let showMuted = !audio.enabled;
  let usedAttempts = 0;

  // decorative orbs for calming effect
  const orbs = Array.from({ length: 8 }, (_, i) => ({
    x: rand(40, GAME_WIDTH - 40),
    y: rand(40, GAME_HEIGHT - 40),
    r: rand(10, 32),
    hue: rand(160, 200),
    phase: Math.random() * Math.PI * 2,
    speed: (Math.random() * 0.5 + 0.2) / 600,
  }));

  // confetti particles for success
  const confetti = [];

  function spawnConfetti(x, y) {
    for (let i = 0; i < 28; i++) {
      confetti.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * -6 - 1,
        w: rand(6, 10),
        h: rand(6, 10),
        color: `hsl(${rand(10, 340)} 85% 60%)`,
        life: rand(800, 1400),
        age: 0,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.1,
      });
    }
  }

  // Initialize levels
  function initLevels() {
    levels = [];
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const difficulty = i + 1;
      const target = rand(5 + difficulty * 2, 8 + difficulty * 4);
      const count = Math.min(MAX_PARTS, 3 + difficulty);
      const partsList = pickPartsForTarget(target, count);
      levels.push({
        target,
        partsList,
      });
    }
  }

  // Start a specific level
  function startLevel(idx) {
    levelIndex = idx;
    const level = levels[levelIndex];
    parts = [];
    machineParts = [];
    selectedPartIndex = -1;
    usedAttempts = 0;
    feedbackText = 'Place parts so their sum equals the machine target.';
    const trayX = 40;
    const trayY = 300;
    const spacing = 100;
    for (let i = 0; i < level.partsList.length; i++) {
      const p = {
        id: `p${i}`,
        value: level.partsList[i],
        x: trayX + i * spacing + (Math.random() - 0.5) * 8,
        y: trayY + (i % 2 === 0 ? -6 : 6),
        tx: trayX + i * spacing,
        ty: trayY,
        w: 72,
        h: 48,
        inMachine: false,
        visible: true,
        color: i % 2 === 0 ? PART_COLOR : PART_COLOR_ALT,
        bobPhase: Math.random() * Math.PI * 2,
      };
      parts.push(p);
    }
    isAnimating = false;
    animationTicks = 0;
  }

  initLevels();
  startLevel(0);

  // ====== Drawing Helpers ======
  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawShadowedRect(x, y, w, h, r, fillStyle) {
    ctx.save();
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = fillStyle;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    // background gradient
    const g = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    g.addColorStop(0, BG_TOP);
    g.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // soft brushed texture lines (subtle)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let i = 0; i < GAME_HEIGHT / 20; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 20 + (animationTicks * 0.02) % 20);
      ctx.lineTo(GAME_WIDTH, i * 20 + (animationTicks * 0.02) % 20);
      ctx.stroke();
    }
    ctx.restore();

    // animate orbs
    for (const orb of orbs) {
      orb.phase += orb.speed * 60;
      const ox = orb.x + Math.cos(orb.phase) * 6;
      const oy = orb.y + Math.sin(orb.phase) * 6;
      const rg = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.r * 2.4);
      rg.addColorStop(0, `rgba(180,220,240,0.22)`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(ox, oy, orb.r * 2.4, orb.r * 1.4, orb.phase * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // left mascot robot
    drawRobot(80, 130, animationTicks);

    // machine area
    const machineX = 420;
    const machineY = 70;
    const machineW = 260;
    const machineH = 280;

    // metallic body with gradient and highlight
    const mg = ctx.createLinearGradient(machineX, machineY, machineX + machineW, machineY + machineH);
    mg.addColorStop(0, MACHINE_METAL_1);
    mg.addColorStop(1, MACHINE_METAL_2);
    drawShadowedRect(machineX, machineY, machineW, machineH, 14, mg);

    // machine window (white glossy)
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, machineX + 20, machineY + 18, machineW - 40, 120, 10);
    ctx.fillStyle = '#fff';
    ctx.fill();
    // glossy overlay
    ctx.globalCompositeOperation = 'lighter';
    const gloss = ctx.createLinearGradient(machineX + 20, machineY + 18, machineX + 20, machineY + 18 + 120);
    gloss.addColorStop(0, 'rgba(255,255,255,0.6)');
    gloss.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = gloss;
    roundRect(ctx, machineX + 20, machineY + 18, machineW - 40, 120, 10);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // target display
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 34px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`TARGET: ${levels[levelIndex].target}`, machineX + 28, machineY + 64);

    // gauge arc
    ctx.strokeStyle = '#bfe8ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(machineX + machineW / 2, machineY + 200, 46, Math.PI, Math.PI * 1.95);
    ctx.stroke();

    // current sum
    const currentSum = machineParts.reduce((s, p) => s + p.value, 0);
    ctx.font = 'bold 24px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(`Sum: ${currentSum}`, machineX + 28, machineY + 220);

    // animated gears
    drawGears(machineX + 40, machineY + 160, 28, animationTicks * 0.06, '#cbe6ff');
    drawGear(machineX + 210, machineY + 160, 16, -animationTicks * 0.08, '#ffd2b3');

    // tray area
    drawShadowedRect(20, 250, 360, 200, 12, '#f7fffb');
    ctx.font = 'bold 18px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#23414a';
    ctx.fillText('Parts Tray (click or use keys 1-' + parts.length + ')', 28, 276);

    // Draw parts (tray)
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      // bobbing motion for non-selected parts
      if (p.visible && selectedPartIndex !== i) {
        p.bobPhase = (p.bobPhase || 0) + 0.05;
        p.y = p.ty + Math.sin(p.bobPhase) * 4;
      }
      // smooth movement
      p.x += (p.tx - p.x) * 0.18;
      p.y += (p.ty - p.y) * 0.18;
      drawPart(p, i === selectedPartIndex);
    }

    // Draw placed parts inside machine (stacked)
    const placedBaseX = machineX + 40;
    const placedBaseY = machineY + 120;
    for (let i = 0; i < machineParts.length; i++) {
      const mp = machineParts[i];
      const px = placedBaseX + (i % 3) * 72;
      const py = placedBaseY + Math.floor(i / 3) * 56;
      ctx.save();
      ctx.translate(px, py);
      drawPart({ ...mp, x: px, y: py, tx: px, ty: py }, false);
      ctx.restore();
    }

    // Controls and buttons
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = FONT;
    ctx.fillText('Controls:', 28, 380);
    ctx.fillText('Click part -> Click machine to add. Or press 1-' + parts.length + ' then Enter to add.', 28, 400);
    ctx.fillText('Backspace removes last part. R runs the machine. Arrow keys to select.', 28, 420);

    // Buttons
    drawButton(GAME_WIDTH - 200, GAME_HEIGHT - 100, 160, 44, 'Run Machine (R)', ACCENT_1);
    drawButton(
      GAME_WIDTH - 200,
      GAME_HEIGHT - 42,
      160,
      36,
      showMuted ? 'Audio Off (M)' : 'Audio On (M)',
      showMuted ? '#c2c2c2' : ACCENT_2
    );

    // Level info
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = FONT;
    ctx.fillText(`Level ${levelIndex + 1} of ${LEVEL_COUNT}`, GAME_WIDTH - 220, 36);

    // Feedback
    ctx.fillStyle = '#0e3940';
    ctx.font = 'bold 18px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(feedbackText, 20, GAME_HEIGHT - 12);

    // Audio status dot
    ctx.beginPath();
    ctx.fillStyle = showMuted ? '#9b9b9b' : '#2d7a2d';
    ctx.arc(GAME_WIDTH - 42, 40, 10, 0, Math.PI * 2);
    ctx.fill();

    // Animate confetti
    updateAndDrawConfetti();

    // subtle machine lights pulsing when animation active
    if (isAnimating) {
      const pulse = (Math.sin(animationTicks * 0.1) + 1) / 2;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,220,120,${0.05 + pulse * 0.06})`;
      ctx.ellipse(machineX + machineW / 2, machineY + 35, machineW / 2, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPart(p, highlighted) {
    ctx.save();
    ctx.translate(p.x, p.y);
    // drop shadow
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    roundRect(ctx, -p.w / 2 + 4, -p.h / 2 + 8, p.w, p.h, 8);
    ctx.fill();

    // main body with subtle gradient
    const grad = ctx.createLinearGradient(-p.w / 2, -p.h / 2, p.w / 2, p.h / 2);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, '#fff7ea');
    roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 8);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = highlighted ? 3 : 1.2;
    ctx.strokeStyle = highlighted ? ACCENT_1 : '#b28b6a';
    ctx.stroke();

    // number
    ctx.fillStyle = '#21333b';
    ctx.font = 'bold 20px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.value), 0, 0);

    // bolt decoration
    ctx.fillStyle = '#7a5f4e';
    ctx.beginPath();
    ctx.arc(-p.w / 4, -p.h / 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // small shine
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(-p.w / 6, -p.h / 3, p.w * 0.18, p.h * 0.08, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawGears(x, y, r, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.95;
    const teeth = 10;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const sx = Math.cos(a) * (r + 6);
      const sy = Math.sin(a) * (r + 6);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(sx, sy);
      ctx.lineTo(Math.cos(a + 0.05) * r, Math.sin(a + 0.05) * r);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGear(x, y, r, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawButton(x, y, w, h, text, color) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0b2430';
    ctx.font = 'bold 14px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.textAlign = 'start';
  }

  function drawRobot(cx, cy, t) {
    // playful robot mascot to left of machine
    ctx.save();
    ctx.translate(cx, cy);
    // body
    ctx.fillStyle = '#f0f8ff';
    roundRect(ctx, -48, -40, 96, 96, 12);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#bcd7ea';
    ctx.stroke();
    // head
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -28, -72, 56, 40, 8);
    ctx.fill();
    ctx.stroke();
    // eyes bright when machine correct
    const eyePulse = (Math.sin(t * 0.08) + 1) * 0.5 * 0.6 + 0.4;
    ctx.fillStyle = `rgba(34,81,255,${Math.min(1, eyePulse)})`;
    ctx.beginPath();
    ctx.arc(-10, -52, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(10, -52, 5, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.strokeStyle = '#7da8d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -42, 10, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    // antenna
    ctx.fillStyle = '#ffd28a';
    ctx.beginPath();
    ctx.arc(0, -82, 5 + Math.sin(t * 0.08) * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ====== Interaction ======
  function pickPartAt(x, y) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!p.visible) continue;
      const left = p.x - p.w / 2;
      const right = p.x + p.w / 2;
      const top = p.y - p.h / 2;
      const bottom = p.y + p.h / 2;
      if (x >= left && x <= right && y >= top && y <= bottom) return i;
    }
    return -1;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const idx = pickPartAt(x, y);
    if (idx >= 0) {
      selectedPartIndex = idx;
      audio.playClick();
      return;
    }
    // Run Machine button region
    if (x >= GAME_WIDTH - 200 && x <= GAME_WIDTH - 40 && y >= GAME_HEIGHT - 100 && y <= GAME_HEIGHT - 56) {
      runMachine();
      return;
    }
    // Audio toggle region
    if (x >= GAME_WIDTH - 200 && x <= GAME_WIDTH - 40 && y >= GAME_HEIGHT - 42 && y <= GAME_HEIGHT - 6) {
      showMuted = !showMuted;
      audio.toggleEnabled();
      feedbackText = showMuted ? 'Audio muted' : 'Audio enabled';
      return;
    }
    // Machine area click (add selected or remove placed)
    const machineX = 420;
    const machineY = 70;
    const machineW = 260;
    const machineH = 280;
    if (x >= machineX && x <= machineX + machineW && y >= machineY && y <= machineY + machineH) {
      if (selectedPartIndex >= 0) {
        addSelectedPartToMachine();
      } else {
        const mpIndex = pickMachinePartAt(x, y);
        if (mpIndex >= 0) removeMachinePart(mpIndex);
      }
      return;
    }
  });

  function pickMachinePartAt(x, y) {
    const machineX = 420;
    const machineY = 70;
    const placedBaseX = machineX + 40;
    const placedBaseY = machineY + 120;
    for (let i = 0; i < machineParts.length; i++) {
      const px = placedBaseX + (i % 3) * 72;
      const py = placedBaseY + Math.floor(i / 3) * 56;
      const left = px - 36;
      const right = px + 36;
      const top = py - 24;
      const bottom = py + 24;
      if (x >= left && x <= right && y >= top && y <= bottom) return i;
    }
    return -1;
  }

  // Keyboard controls
  canvas.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= String(Math.max(1, parts.length))) {
      const idx = Math.min(parts.length - 1, parseInt(e.key, 10) - 1);
      selectedPartIndex = idx;
      audio.playClick();
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
        if (parts.length === 0) break;
        selectedPartIndex = (selectedPartIndex + 1 + parts.length) % parts.length;
        audio.playClick();
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if (parts.length === 0) break;
        selectedPartIndex = (selectedPartIndex - 1 + parts.length) % parts.length;
        audio.playClick();
        e.preventDefault();
        break;
      case 'Enter':
      case ' ':
        if (selectedPartIndex >= 0) addSelectedPartToMachine();
        e.preventDefault();
        break;
      case 'Backspace':
        removeLastMachinePart();
        e.preventDefault();
        break;
      case 'r':
      case 'R':
        runMachine();
        e.preventDefault();
        break;
      case 'm':
      case 'M':
        showMuted = !showMuted;
        audio.toggleEnabled();
        e.preventDefault();
        break;
      default:
        break;
    }
  });

  function addSelectedPartToMachine() {
    if (selectedPartIndex < 0 || selectedPartIndex >= parts.length) {
      feedbackText = 'Select a part first (click or press 1-' + parts.length + ').';
      return;
    }
    const part = parts[selectedPartIndex];
    if (!part.visible) {
      feedbackText = 'That part is already used.';
      return;
    }
    // move into machine slot
    const machineX = 420;
    const slotX = 420 + 40 + (machineParts.length % 3) * 72;
    const slotY = 70 + 120 + Math.floor(machineParts.length / 3) * 56;
    part.tx = slotX;
    part.ty = slotY;
    part.visible = false;
    machineParts.push({ id: part.id, value: part.value, color: part.color });
    selectedPartIndex = -1;
    feedbackText = 'Placed part inside the machine.';
    audio.playClick();
  }

  function removeMachinePart(index) {
    if (index < 0 || index >= machineParts.length) return;
    const mp = machineParts.splice(index, 1)[0];
    const returnSlot = parts.find((p) => p.id === mp.id);
    if (returnSlot) {
      returnSlot.visible = true;
      returnSlot.tx = returnSlot.tx;
      returnSlot.ty = returnSlot.ty;
    } else {
      const trayX = 40 + (parts.length % 4) * 100;
      const trayY = 300 + Math.floor(parts.length / 4) * 60;
      parts.push({
        id: mp.id,
        value: mp.value,
        x: trayX,
        y: trayY,
        tx: trayX,
        ty: trayY,
        w: 72,
        h: 48,
        inMachine: false,
        visible: true,
        color: mp.color,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }
    feedbackText = 'Removed a part from the machine.';
    audio.playClick();
  }

  function removeLastMachinePart() {
    if (machineParts.length === 0) {
      feedbackText = 'No parts in the machine to remove.';
      return;
    }
    const last = machineParts.pop();
    const slotIdx = parts.findIndex((p) => p.id === last.id);
    if (slotIdx >= 0) {
      parts[slotIdx].visible = true;
      parts[slotIdx].tx = parts[slotIdx].tx;
      parts[slotIdx].ty = parts[slotIdx].ty;
    } else {
      parts.push({
        id: last.id,
        value: last.value,
        x: 40,
        y: 300,
        tx: 40,
        ty: 300,
        w: 72,
        h: 48,
        visible: true,
        color: last.color,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }
    feedbackText = 'Removed the last part.';
    audio.playClick();
  }

  // ====== Run Machine & Level progression (logic unchanged) ======
  function runMachine() {
    if (isAnimating) return;
    usedAttempts++;
    const target = levels[levelIndex].target;
    const sum = machineParts.reduce((s, p) => s + p.value, 0);
    if (sum === target) {
      isAnimating = true;
      animationTicks = 0;
      feedbackText = 'Perfect! Machine is happy!';
      if (audio.enabled) audio.playCorrect();
      // spawn confetti at machine center
      spawnConfetti(420 + 130, 70 + 120);
      setTimeout(() => {
        levelIndex++;
        if (levelIndex >= levels.length) {
          feedbackText = 'You fixed all the machines! Great job!';
          // change orbs color for celebration
          for (const orb of orbs) orb.hue = rand(20, 330);
        } else {
          feedbackText = 'Level up! New machine appears...';
          startLevel(levelIndex);
        }
        isAnimating = false;
      }, 1200);
    } else {
      feedbackText = `Not quite. Machine shows ${sum}. Try again.`;
      if (audio.enabled) audio.playIncorrect();
      isAnimating = true;
      animationTicks = 0;
      setTimeout(() => {
        isAnimating = false;
      }, 700);
    }
  }

  // ====== Confetti & Particles animation ======
  function updateAndDrawConfetti() {
    const now = performance.now();
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.age += 16;
      p.vy += 0.22; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.995;
      p.vy *= 0.998;
      p.rot += p.vrot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      if (p.age > p.life || p.y > GAME_HEIGHT + 40) {
        confetti.splice(i, 1);
      }
    }
  }

  // ====== Animation loop ======
  let last = performance.now();
  function loop(now) {
    const dt = now - last;
    last = now;
    animationTicks += dt / 16;

    // animate orbs movement
    for (const orb of orbs) {
      orb.phase += orb.speed * dt;
      orb.x += Math.cos(orb.phase) * 0.02 * dt;
      orb.y += Math.sin(orb.phase) * 0.01 * dt;
    }

    // move parts toward tx/ty and remove tray parts when arrived if marked invisible
    for (const p of parts) {
      if (!p.visible) {
        p.x += (p.tx - p.x) * 0.18;
        p.y += (p.ty - p.y) * 0.18;
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!p.visible) {
        if (Math.hypot(p.x - p.tx, p.y - p.ty) < 6) {
          parts.splice(i, 1);
        }
      }
    }

    if (!audio.enabled && audio.isBgPlaying) audio.stopBackground();
    if (audio.enabled && audio.ctx && !audio.isBgPlaying) audio.startBackground();

    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // ====== Global keyboard reset ======
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      initLevels();
      startLevel(0);
      feedbackText = 'Game reset. Start again!';
      audio.playClick();
    }
  });

  // Focus canvas for keyboard input
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (e) {
      // ignore
    }
  }, 100);

  console.log('Wacky Machine Math loaded with enhanced visuals and audio. Use mouse or keyboard. Press Escape to reset.');

  if (!audio.enabled) {
    feedbackText = 'Audio unavailable. You can still play with visual cues.';
  }
})();