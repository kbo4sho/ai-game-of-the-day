(function() {
  'use strict';

  // Enhanced Educational Drone Math Game
  // Render into #game-of-the-day-stage using canvas sized 720x480
  // Only visuals and audio have been improved. Game mechanics unchanged.

  // Configuration constants
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 10;
  const GOAL_SCORE = 10;
  const MAX_LIVES = 3;
  const PACKAGE_COUNT = 4;
  const MIN_BODY_FONT = 16;
  const IMPORTANT_FONT = 20;
  const DRONE_SIZE = 36;
  const PACKAGE_RADIUS = 26;
  const CLOUD_COUNT = 6;

  // Color palette (calm, child-friendly)
  const PALETTE = {
    skyTop: '#bfe9ff',
    skyBottom: '#f7fbff',
    sun: '#ffd89b',
    hill1: '#dff3e8',
    hill2: '#bfead1',
    uiBg: 'rgba(255,255,255,0.90)',
    uiText: '#05386b',
    droneBody: '#178f77',
    droneAccent: '#2bd0a6',
    packageBody: '#ffda77',
    packageTrim: '#b77b3a',
    shadow: 'rgba(0,0,0,0.22)',
    correctFlash: 'rgba(42,157,143,0.14)',
    wrongFlash: 'rgba(239,68,68,0.12)'
  };

  // DOM setup and canvas creation
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('No element with id "game-of-the-day-stage" found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = WIDTH + 'px';
  container.style.height = HEIGHT + 'px';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Game. Use arrow keys to fly and space to pick packages. Press S to enable sound.'
  );
  canvas.tabIndex = 0;
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });

  // Accessibility live region
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  container.appendChild(live);

  // Mouse tracking for hover effects
  let mousePos = { x: -9999, y: -9999 };

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mousePos.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mouseleave', () => {
    mousePos.x = -9999;
    mousePos.y = -9999;
  });

  // Audio setup with robust error handling and enhanced ambient
  let audioCtx = null;
  let globalGain = null;
  let ambientNodes = [];
  let audioEnabled = false;

  function tryCreateAudio() {
    if (audioCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      globalGain = audioCtx.createGain();
      globalGain.gain.value = 0.0;
      globalGain.connect(audioCtx.destination);
      audioEnabled = false;
      startAmbient();
    } catch (err) {
      console.warn('AudioContext creation failed:', err);
      audioCtx = null;
      globalGain = null;
      audioEnabled = false;
    }
  }

  // Stop ambient nodes safely
  function stopAmbient() {
    try {
      ambientNodes.forEach((n) => {
        try { n.osc.stop(); } catch (e) {}
        try { n.lfo.stop(); } catch (e) {}
        try { n.pan && n.pan.disconnect(); } catch (e) {}
        try { clearInterval(n._panTicker); } catch (e) {}
      });
    } catch (e) {
      // ignore errors on stop
    }
    ambientNodes = [];
  }

  // Start a gentle layered ambient pad (soft, low volume)
  function startAmbient() {
    if (!audioCtx || !globalGain) return;
    stopAmbient();
    try {
      // Two soft pads with slow LFOs and subtle panning
      const padSpecs = [
        { type: 'sine', freq: 110, gain: 0.0035, lfoFreq: 0.04, panRate: 0.02 },
        { type: 'triangle', freq: 165, gain: 0.0026, lfoFreq: 0.03, panRate: 0.015 }
      ];
      for (const spec of padSpecs) {
        const osc = audioCtx.createOscillator();
        osc.type = spec.type;
        osc.frequency.value = spec.freq;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        filter.Q.value = 0.7;

        const gain = audioCtx.createGain();
        gain.gain.value = spec.gain;

        const pan = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
        if (pan) pan.pan.value = 0;

        // Slow LFO to modulate frequency (subtle)
        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = spec.lfoFreq;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = spec.freq * 0.03; // subtle detune

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        osc.connect(filter);
        filter.connect(gain);
        if (pan) {
          gain.connect(pan);
          pan.connect(globalGain);
        } else {
          gain.connect(globalGain);
        }

        osc.start();
        lfo.start();

        ambientNodes.push({ osc, lfo, gain, pan, spec });
      }

      // small slow updater to animate panning if supported
      ambientNodes.forEach((n) => {
        if (!n.pan) return;
        n._panPhase = Math.random() * Math.PI * 2;
        n._panTicker = setInterval(() => {
          try {
            n._panPhase += (n.spec && n.spec.panRate) || 0.02;
            const p = Math.sin(n._panPhase) * 0.3;
            n.pan.pan.setValueAtTime(p, audioCtx.currentTime);
          } catch (e) {}
        }, 200);
      });
    } catch (e) {
      console.warn('Failed to start ambient audio:', e);
    }
  }

  // Toggle audio enabled with safe ramp
  function setAudioEnabled(enabled) {
    try {
      if (!audioCtx) tryCreateAudio();
      if (!audioCtx || !globalGain) return;
      audioEnabled = !!enabled;
      audioCtx.resume().catch(() => {});
      // Use a gentle ramp so it doesn't startle
      globalGain.gain.cancelScheduledValues(audioCtx.currentTime);
      globalGain.gain.setTargetAtTime(audioEnabled ? 0.06 : 0.0, audioCtx.currentTime, 0.06);
    } catch (e) {
      console.warn('Error toggling audio:', e);
      audioEnabled = false;
    }
  }

  // Sound effects using Web Audio API (chime and soft buzz)
  function playCorrect() {
    if (!audioCtx || !globalGain || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const baseFreqs = [880, 1100, 1320]; // pleasing ascending tones
      baseFreqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        const band = audioCtx.createBiquadFilter();
        band.type = 'lowpass';
        band.frequency.value = 3000;
        o.connect(band);
        band.connect(g);
        g.connect(globalGain);
        const start = now + i * 0.03;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.08, start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
        o.start(start);
        o.stop(start + 0.38);
      });
    } catch (e) {
      console.warn('playCorrect failed', e);
    }
  }

  function playWrong() {
    if (!audioCtx || !globalGain || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 220;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
      o.connect(filter);
      filter.connect(g);
      g.connect(globalGain);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      o.frequency.setValueAtTime(220, now);
      o.frequency.exponentialRampToValueAtTime(110, now + 0.18);
      o.start(now);
      o.stop(now + 0.26);
    } catch (e) {
      console.warn('playWrong failed', e);
    }
  }

  // Lightweight "pickup" sound for space key / click (used by selection via handleSelection)
  function playPickup() {
    if (!audioCtx || !globalGain || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'square';
      o.frequency.value = 660;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(globalGain);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.start(now);
      o.stop(now + 0.14);
    } catch (e) {
      console.warn('playPickup failed', e);
    }
  }

  // Utility helpers
  function randRange(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Game state
  let score = 0;
  let lives = MAX_LIVES;
  let packages = [];
  let drone = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, size: DRONE_SIZE };
  let keys = {};
  let question = null;
  let gameState = 'playing';
  let lastTime = performance.now();
  let flashTimer = 0;
  let clouds = [];
  let particles = []; // for visual feedback (confetti / smoke)

  // Cloud initialization with parallax depth
  function initClouds() {
    clouds = [];
    for (let i = 0; i < CLOUD_COUNT; i++) {
      clouds.push({
        x: Math.random() * WIDTH,
        y: Math.random() * (HEIGHT * 0.45),
        size: 40 + Math.random() * 90,
        vx: 0.1 + Math.random() * 0.6,
        wobble: Math.random() * 1000,
        depth: 0.5 + Math.random() * 1.4
      });
    }
  }

  // Math question generation (unchanged)
  function generateQuestion() {
    const ops = ['+', '-', '*'];
    let op = Math.random() < 0.7 ? (Math.random() < 0.6 ? '+' : '-') : '*';
    if (op === '*') {
      const a = randRange(2, 8);
      const b = randRange(2, 8);
      const ans = a * b;
      return { a, b, op, answer: ans };
    } else if (op === '+') {
      const a = randRange(1, 20);
      const b = randRange(1, 20);
      return { a, b, op, answer: a + b };
    } else {
      let a = randRange(1, 20);
      let b = randRange(1, a);
      return { a, b, op: '-', answer: a - b };
    }
  }

  // Generate options (unchanged)
  function generateOptions(correct) {
    const opts = new Set();
    opts.add(correct);
    while (opts.size < PACKAGE_COUNT) {
      const delta = randRange(1, 6);
      const sign = Math.random() < 0.5 ? -1 : 1;
      let val = correct + sign * delta;
      if (val < 0) val = Math.abs(val) + 1;
      opts.add(val);
    }
    const arr = Array.from(opts);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Spawn packages with nicer positions and slight stagger
  function spawnPackages() {
    packages = [];
    const opts = generateOptions(question.answer);
    const attemptsLimit = 200;
    for (let i = 0; i < opts.length; i++) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < attemptsLimit) {
        attempts++;
        const marginTop = 80;
        const x = PACKAGE_RADIUS + Math.random() * (WIDTH - PACKAGE_RADIUS * 2);
        const y = marginTop + PACKAGE_RADIUS + Math.random() * (HEIGHT - marginTop - PACKAGE_RADIUS - 120);
        const candidate = {
          x,
          y,
          r: PACKAGE_RADIUS,
          number: opts[i],
          vx: (Math.random() * 0.8 - 0.4),
          vy: 0,
          wobble: Math.random() * 2000,
          id: i,
          highlight: 0
        };
        let ok = true;
        for (const p of packages) {
          if (distance(candidate, p) < candidate.r + p.r + 8) { ok = false; break; }
        }
        if (y < marginTop + 10) ok = false;
        if (ok) { packages.push(candidate); placed = true; }
      }
      if (!placed) {
        packages.push({
          x: 80 + i * 140,
          y: 160,
          r: PACKAGE_RADIUS,
          number: opts[i],
          vx: 0,
          vy: 0,
          wobble: i * 100,
          id: i,
          highlight: 0
        });
      }
    }
  }

  // Reset game (mechanics preserved)
  function resetGame() {
    score = 0;
    lives = MAX_LIVES;
    drone.x = WIDTH / 2;
    drone.y = HEIGHT - 100;
    keys = {};
    question = generateQuestion();
    spawnPackages();
    gameState = 'playing';
    flashTimer = 0;
    lastTime = performance.now();
    particles = [];
    live.textContent = `New question: ${question.a} ${question.op} ${question.b} = ?`;
  }

  // Initialize audio and visuals
  tryCreateAudio();
  initClouds();
  question = generateQuestion();
  spawnPackages();

  // Input handling (keyboard)
  canvas.addEventListener('keydown', (e) => {
    const key = e.key;
    keys[key] = true;
    if (key === 's' || key === 'S') {
      tryCreateAudio();
      setAudioEnabled(!audioEnabled);
    }
    if ((key === 'r' || key === 'R') && (gameState === 'victory' || gameState === 'gameover')) {
      resetGame();
      audioCtx && audioCtx.resume().catch(() => {});
    }
    if (['1', '2', '3', '4'].includes(key) && gameState === 'playing') {
      const idx = parseInt(key, 10) - 1;
      if (packages[idx]) {
        handleSelection(packages[idx]);
      }
    }
    if (key === ' ' && gameState === 'playing') {
      let nearest = null;
      let minD = Infinity;
      for (const p of packages) {
        const d = distance(p, drone);
        if (d < minD) { minD = d; nearest = p; }
      }
      if (nearest && minD <= 80) {
        playPickup();
        handleSelection(nearest);
      }
    }
  });
  canvas.addEventListener('keyup', (e) => { delete keys[e.key]; });

  // Mouse click handling
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (gameState === 'playing') {
      for (let i = 0; i < packages.length; i++) {
        const p = packages[i];
        if (Math.hypot(p.x - mx, p.y - my) <= p.r + 4) {
          playPickup();
          handleSelection(p);
          return;
        }
      }
      const audRect = getAudioButtonRect();
      if (mx >= audRect.x && mx <= audRect.x + audRect.w && my >= audRect.y && my <= audRect.y + audRect.h) {
        tryCreateAudio();
        setAudioEnabled(!audioEnabled);
        return;
      }
    } else {
      const btn = getRestartButtonRect();
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        resetGame();
        return;
      }
    }
  });

  // Touch support
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = canvas.getBoundingClientRect();
    const tx = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const ty = (touch.clientY - rect.top) * (canvas.height / rect.height);
    const clickEvent = new MouseEvent('click', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    canvas.dispatchEvent(clickEvent);
    e.preventDefault();
  }, { passive: false });

  // UI drawing helpers
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawUITextBox(text, x, y, font = '16px sans-serif', padding = PADDING, align = 'left', bg = PALETTE.uiBg, fg = PALETTE.uiText) {
    ctx.save();
    ctx.font = font;
    ctx.textBaseline = 'top';
    const metrics = ctx.measureText(text);
    const w = metrics.width;
    const h = parseInt(font, 10) + 6;
    let drawX = x;
    if (align === 'center') drawX = x - w / 2 - padding;
    if (align === 'right') drawX = x - w - padding * 2;
    const rectX = drawX - padding;
    const rectY = y - padding;
    const rectW = w + padding * 2;
    const rectH = h + padding * 2;
    ctx.fillStyle = bg;
    roundRect(ctx, rectX, rectY, rectW, rectH, 8);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(text, rectX + padding, rectY + padding + 2);
    ctx.restore();
    return { x: rectX, y: rectY, w: rectW, h: rectH };
  }

  // Enhanced drone drawing (friendly character)
  function drawDrone(x, y, size, t) {
    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(t / 200) * 4;
    ctx.translate(0, bob);

    // shadow beneath
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(8, size * 0.6 + 8, size * 0.9, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // main body gradient
    const bodyGrad = ctx.createLinearGradient(-size, -size * 0.4, size, size * 0.6);
    bodyGrad.addColorStop(0, PALETTE.droneBody);
    bodyGrad.addColorStop(1, PALETTE.droneAccent);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.9, size * 0.6, Math.sin(t / 200) * 0.05, 0, Math.PI * 2);
    ctx.fill();

    // cockpit glass
    ctx.save();
    ctx.fillStyle = '#e8fbf2';
    ctx.beginPath();
    ctx.ellipse(-size * 0.18, -size * 0.05, size * 0.36, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.08, -size * 0.18, size * 0.2, size * 0.12, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // propellers with subtle rotation
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * size * 0.78, -size * 0.18);
      ctx.rotate(Math.sin(t / 80 + i) * 1.1);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, -6, size * 0.22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(0, 6, size * 0.6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // cargo hook
    ctx.fillStyle = '#6c757d';
    ctx.beginPath();
    ctx.rect(-6, size * 0.42, 12, 12);
    ctx.fill();

    // friendly eye dots
    ctx.fillStyle = '#083d77';
    ctx.beginPath();
    ctx.arc(size * 0.08, -size * 0.05, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw fluffy cloud using canvas primitives
  function drawCloud(c, t) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ffffff';
    const wob = Math.sin((t + c.wobble) / 600) * 6;
    const scale = c.depth;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + wob, c.size * 0.62 * scale, c.size * 0.36 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - c.size * 0.28 * scale, c.y + 6 + wob, c.size * 0.5 * scale, c.size * 0.28 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.size * 0.28 * scale, c.y + 8 + wob, c.size * 0.5 * scale, c.size * 0.28 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Visual particle system for feedback
  function spawnParticles(x, y, correct) {
    const count = correct ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 1.2 + (correct ? 0.6 : 0.2));
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (correct ? 1.2 : 0.5),
        life: 60 + Math.floor(Math.random() * 40),
        size: correct ? (2 + Math.random() * 4) : (4 + Math.random() * 4),
        color: correct ? (['#8be7b8', '#ffd166', '#fff1a6'][Math.floor(Math.random() * 3)]) : '#b0b0b0',
        gravity: correct ? 0.04 : 0.06,
        fade: true
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.02, p.life / 120);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Handle package selection (preserve game logic)
  function handleSelection(pkg) {
    if (gameState !== 'playing') return;
    if (!pkg) return;
    if (pkg.number === question.answer) {
      score++;
      flashTimer = 18;
      spawnParticles(pkg.x, pkg.y, true);
      playCorrect();
      live.textContent = `Correct! ${question.a} ${question.op} ${question.b} = ${question.answer}. Score ${score}/${GOAL_SCORE}.`;
      if (score >= GOAL_SCORE) {
        gameState = 'victory';
        live.textContent = `Victory! You delivered ${GOAL_SCORE} correct packages. Press R to restart.`;
        return;
      } else {
        question = generateQuestion();
        spawnPackages();
      }
    } else {
      lives--;
      flashTimer = 34;
      spawnParticles(pkg.x, pkg.y, false);
      playWrong();
      live.textContent = `Oops! ${pkg.number} is not ${question.a} ${question.op} ${question.b}. Lives left: ${lives}.`;
      if (lives <= 0) {
        gameState = 'gameover';
        live.textContent = `Game over. You had ${score} correct answers. Press R to restart.`;
      }
    }
  }

  // UI geometry for audio button
  function getAudioButtonRect() {
    const font = `${MIN_BODY_FONT}px sans-serif`;
    ctx.font = font;
    const text = audioEnabled ? 'Sound: On (S)' : 'Sound: Off (S)';
    const metrics = ctx.measureText(text);
    const w = metrics.width + PADDING * 2 + 28;
    const h = MIN_BODY_FONT + PADDING * 2 + 6;
    const x = PADDING;
    const y = HEIGHT - h - PADDING;
    return { x, y, w, h, text };
  }

  // UI geometry for restart button
  function getRestartButtonRect() {
    const font = `${IMPORTANT_FONT}px sans-serif`;
    ctx.font = font;
    const text = 'Restart (R)';
    const metrics = ctx.measureText(text);
    const w = metrics.width + PADDING * 2;
    const h = IMPORTANT_FONT + PADDING * 2 + 6;
    const x = (WIDTH - w) / 2;
    const y = HEIGHT / 2 + 70;
    return { x, y, w, h, text };
  }

  // Main loop
  function loop(now) {
    const dt = Math.min(60, now - lastTime);
    lastTime = now;
    update(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  // Update game objects
  function update(dt) {
    // clouds drift
    for (const c of clouds) {
      c.x += c.vx * (dt / 16) * c.depth * 0.8;
      if (c.x - c.size > WIDTH) c.x = -c.size;
    }

    if (gameState !== 'playing') {
      updateParticles();
      return;
    }

    // Drone movement
    const speed = 0.25 * dt;
    if (keys['ArrowLeft'] || keys['Left']) drone.x -= speed;
    if (keys['ArrowRight'] || keys['Right']) drone.x += speed;
    if (keys['ArrowUp'] || keys['Up']) drone.y -= speed;
    if (keys['ArrowDown'] || keys['Down']) drone.y += speed;
    drone.x = clamp(drone.x, DRONE_SIZE * 0.6, WIDTH - DRONE_SIZE * 0.6);
    drone.y = clamp(drone.y, DRONE_SIZE * 0.5, HEIGHT - DRONE_SIZE * 0.5 - 60);

    // Packages bob and slight horizontal drift, and highlight when mouse near
    for (const p of packages) {
      p.wobble = (p.wobble + dt) % 100000;
      p.x += Math.sin(p.wobble / 800) * 0.25;
      p.y += Math.sin(p.wobble / 700) * 0.15;
      p.x = clamp(p.x, p.r + 8, WIDTH - p.r - 8);
      p.y = clamp(p.y, 90 + p.r, HEIGHT - p.r - 80);

      // highlight on mouse hover or proximity to drone
      const hoverDist = Math.hypot(p.x - mousePos.x, p.y - mousePos.y);
      const droneDist = Math.hypot(p.x - drone.x, p.y - drone.y);
      const target = (hoverDist < 56 || droneDist < 78) ? 1 : 0;
      p.highlight += (target - p.highlight) * 0.22;
    }

    if (flashTimer > 0) flashTimer--;
    updateParticles();
  }

  // Draw everything
  function draw(t) {
    // clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun
    ctx.save();
    const sunX = WIDTH * 0.12;
    const sunY = HEIGHT * 0.12;
    const sunRad = 40;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, sunRad * 2.8);
    sunGlow.addColorStop(0, PALETTE.sun);
    sunGlow.addColorStop(1, 'rgba(255,210,150,0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRad * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // clouds
    for (const c of clouds) drawCloud(c, t);

    // rolling hills / distant landscape
    ctx.save();
    // far hills
    ctx.fillStyle = PALETTE.hill2;
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT * 0.78);
    for (let x = 0; x <= WIDTH; x += 18) {
      const y = HEIGHT * 0.78 + Math.sin((x + t / 12) / 90) * 14;
      ctx.lineTo(x, y - 40);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();
    // near hills
    ctx.fillStyle = PALETTE.hill1;
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT * 0.85);
    for (let x = 0; x <= WIDTH; x += 20) {
      const y = HEIGHT * 0.85 + Math.sin((x + t / 8) / 60) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // draw packages with enhanced visuals
    for (let i = 0; i < packages.length; i++) {
      const p = packages[i];
      const bob = Math.sin((t + p.wobble) / 220) * 6;
      // shadow
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(p.x + 6, p.y + p.r + 8 + bob * 0.1, p.r * 0.95, p.r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // package body with tape and stitching
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      const highlight = p.highlight;
      // soft glow if hovered
      if (highlight > 0.06) {
        ctx.save();
        ctx.globalAlpha = highlight * 0.6;
        ctx.fillStyle = 'rgba(255,220,140,0.65)';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.6, p.r * 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // body
      ctx.fillStyle = PALETTE.packageBody;
      ctx.strokeStyle = PALETTE.packageTrim;
      ctx.lineWidth = 2;
      roundRect(ctx, -p.r, -p.r, p.r * 2, p.r * 2, 8);
      ctx.fill();
      ctx.stroke();

      // tape stripe
      ctx.fillStyle = '#f4d67a';
      ctx.fillRect(-p.r + 6, -6, p.r * 2 - 12, 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-p.r + 6, -6, p.r * 2 - 12, 12);

      // label circle for number
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, p.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.stroke();

      // number text
      ctx.fillStyle = PALETTE.uiText;
      ctx.font = `${IMPORTANT_FONT}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(String(p.number), 0, 0);

      // small index in corner
      ctx.fillStyle = 'rgba(8,61,119,0.08)';
      ctx.font = `${MIN_BODY_FONT}px sans-serif`;
      ctx.fillText(`${i + 1}`, p.r - 8, -p.r + 10);
      ctx.restore();
    }

    // draw drone
    drawDrone(drone.x, drone.y + Math.sin(t / 200) * 4, drone.size, t);

    // score UI top-left
    ctx.save();
    const scoreText = `Score: ${score}/${GOAL_SCORE}`;
    ctx.font = `${IMPORTANT_FONT}px sans-serif`;
    const scoreRect = drawUITextBox(scoreText, PADDING, PADDING, `${IMPORTANT_FONT}px sans-serif`, PADDING, 'left', PALETTE.uiBg, PALETTE.uiText);
    ctx.restore();

    // lives top-right with heart icons
    ctx.save();
    const livesText = `Lives: ${lives}`;
    ctx.font = `${IMPORTANT_FONT}px sans-serif`;
    const livesMetrics = ctx.measureText(livesText);
    const livesRect = drawUITextBox(livesText, WIDTH - PADDING - livesMetrics.width - PADDING, PADDING, `${IMPORTANT_FONT}px sans-serif`, PADDING, 'left', PALETTE.uiBg, PALETTE.uiText);
    // small hearts
    const heartsX = livesRect.x + livesRect.w - 8 - 18;
    for (let i = 0; i < MAX_LIVES; i++) {
      ctx.beginPath();
      const hx = heartsX - i * 18;
      const hy = livesRect.y + 10;
      ctx.fillStyle = i < lives ? '#ff6b6b' : 'rgba(255,107,107,0.18)';
      ctx.moveTo(hx, hy);
      ctx.bezierCurveTo(hx - 6, hy - 8, hx - 18, hy + 6, hx, hy + 18);
      ctx.bezierCurveTo(hx + 18, hy + 6, hx + 6, hy - 8, hx, hy);
      ctx.fill();
    }
    ctx.restore();

    // Question box top-center with adaptive placement
    ctx.save();
    const qText = `Solve: ${question.a} ${question.op} ${question.b} = ?`;
    ctx.font = `${IMPORTANT_FONT + 2}px sans-serif`;
    const qMetrics = ctx.measureText(qText);
    let qx = WIDTH / 2;
    let qy = PADDING;
    const leftBoxRight = scoreRect.x + scoreRect.w;
    const rightBoxLeft = livesRect.x;
    const qLeft = qx - qMetrics.width / 2 - PADDING;
    const qRight = qx + qMetrics.width / 2 + PADDING;
    if (qLeft < leftBoxRight + 10 || qRight > rightBoxLeft - 10) {
      qy = scoreRect.y + scoreRect.h + 12;
    }
    drawUITextBox(qText, qx, qy, `${IMPORTANT_FONT + 2}px sans-serif`, PADDING, 'center', PALETTE.uiBg, PALETTE.uiText);
    ctx.restore();

    // Instruction box bottom-center (two lines)
    ctx.save();
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const instrLines = [
      'Controls: Arrows to fly • Space to pick nearest • 1-4 keys to pick packages • Click to pick • S to toggle sound',
      'Goal: Answer 10 correctly. Wrong answers: lose 1 life. Lose all lives = Game Over. Press R to restart.'
    ];
    const lineHeights = instrLines.map(l => MIN_BODY_FONT + 6);
    const maxWidth = Math.max(...instrLines.map(l => ctx.measureText(l).width));
    const boxW = maxWidth + PADDING * 2;
    const boxH = lineHeights.reduce((a, b) => a + b, 0) + PADDING * 2;
    const boxX = (WIDTH - boxW) / 2;
    const boxY = HEIGHT - boxH - PADDING;
    ctx.fillStyle = PALETTE.uiBg;
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.uiText;
    ctx.textBaseline = 'top';
    let ly = boxY + PADDING;
    for (const line of instrLines) {
      ctx.fillText(line, boxX + PADDING, ly);
      ly += MIN_BODY_FONT + 6;
    }
    ctx.restore();

    // audio button bottom-left with icon animation (pulse if enabled)
    const aud = getAudioButtonRect();
    ctx.save();
    ctx.fillStyle = PALETTE.uiBg;
    roundRect(ctx, aud.x, aud.y, aud.w, aud.h, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.uiText;
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    ctx.fillText(aud.text, aud.x + PADDING, aud.y + PADDING + 2);

    // audio icon circle
    const iconX = aud.x + aud.w - 18;
    const iconY = aud.y + aud.h / 2;
    ctx.beginPath();
    ctx.fillStyle = audioEnabled ? PALETTE.droneAccent : '#b6b6b6';
    ctx.arc(iconX, iconY, 8 + (audioEnabled ? Math.sin(t / 300) * 0.8 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // flash overlay depending on last answer (soft)
    if (flashTimer > 0) {
      ctx.save();
      const alpha = Math.min(0.7, flashTimer / 36);
      // alternate color based on parity (simple cue)
      const color = (flashTimer % 2 === 0) ? PALETTE.correctFlash : PALETTE.wrongFlash;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }

    // Draw particles
    drawParticles();

    // End screens overlay (victory/gameover)
    if (gameState === 'victory' || gameState === 'gameover') {
      ctx.save();
      ctx.fillStyle = 'rgba(5,61,107,0.78)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const title = gameState === 'victory' ? 'YOU WON!' : 'GAME OVER';
      const message = gameState === 'victory' ? `You delivered ${GOAL_SCORE} correct packages!` : `You answered ${score} correctly.`;

      ctx.fillStyle = '#fff';
      ctx.font = `${IMPORTANT_FONT + 12}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 40);
      ctx.font = `${IMPORTANT_FONT}px sans-serif`;
      ctx.fillText(message, WIDTH / 2, HEIGHT / 2 + 0);

      const btn = getRestartButtonRect();
      ctx.fillStyle = '#ffd166';
      roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
      ctx.fill();
      ctx.fillStyle = '#05386b';
      ctx.font = `${IMPORTANT_FONT}px sans-serif`;
      ctx.fillText(btn.text, WIDTH / 2, btn.y + btn.h / 2);
      ctx.restore();
    }
  }

  // Kick off the loop
  requestAnimationFrame(loop);

  // Ensure focus for keyboard input
  canvas.addEventListener('focus', () => {});
  setTimeout(() => { try { canvas.focus(); } catch (e) {} }, 200);

  // Expose minimal API for debugging
  window.__droneMathGame = {
    reset: resetGame,
    toggleSound: () => setAudioEnabled(!audioEnabled)
  };

  // Initial live region message
  live.textContent = `Welcome! Answer ${GOAL_SCORE} questions correctly to win. Use the controls shown. Press S to enable sound.`;

})();