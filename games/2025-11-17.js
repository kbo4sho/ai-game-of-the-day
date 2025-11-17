(function () {
  // Enhanced Drone Math Quest (Visuals & Audio improved)
  'use strict';

  // Configuration
  const CANVAS_WIDTH = 720;
  const CANVAS_HEIGHT = 480;
  const GOAL_SCORE = 10;
  const MAX_WRONG = 3;
  const DRONE_SPEED = 6;
  const OPTION_COUNT = 4;
  const PADDING = 12; // UI padding at least 10px required

  // Get stage container
  const stage = document.getElementById('game-of-the-day-stage');
  if (!stage) {
    console.error('Missing container element with id "game-of-the-day-stage". Game cannot start.');
    return;
  }

  stage.setAttribute(
    'aria-label',
    'Drone Math Quest. Use left and right arrow keys to move the drone. Press number keys 1 to 4 to choose an answer or click the answer boxes. Press M to toggle audio, R to restart.'
  );
  stage.tabIndex = 0; // make focusable

  // Create canvas inside stage
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.style.width = CANVAS_WIDTH + 'px';
  canvas.style.height = CANVAS_HEIGHT + 'px';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Drone Math Quest game canvas');
  canvas.style.outline = 'none';
  stage.innerHTML = '';
  stage.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('2D context not supported.');
    return;
  }

  // Audio setup with error handling
  let audioCtx = null;
  let masterGain = null;
  let ambientGain = null;
  let audioAvailable = true;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio API not supported in this browser.');
    audioCtx = new AudioCtx();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.07; // base level
    masterGain.connect(audioCtx.destination);

    // Subtle ambient pad: two detuned sine oscillators through a gentle lowpass and reverb-like node (delay+feedback)
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0.7;
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 900;
    lowpass.Q.value = 0.6;

    // Create two detuned oscillators
    const oscA = audioCtx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 110; // A2
    const oscB = audioCtx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 116; // slightly detuned

    const padGainA = audioCtx.createGain();
    padGainA.gain.value = 0.6;
    const padGainB = audioCtx.createGain();
    padGainB.gain.value = 0.5;

    // subtle tremolo
    const trem = audioCtx.createOscillator();
    trem.type = 'sine';
    trem.frequency.value = 0.08;
    const tremGain = audioCtx.createGain();
    tremGain.gain.value = 0.06;

    trem.connect(tremGain);
    tremGain.connect(padGainA.gain);
    tremGain.connect(padGainB.gain);

    oscA.connect(padGainA);
    oscB.connect(padGainB);
    padGainA.connect(lowpass);
    padGainB.connect(lowpass);

    lowpass.connect(ambientGain);

    // small delay+feedback to give warmth
    const delay = audioCtx.createDelay();
    delay.delayTime.value = 0.28;
    const fb = audioCtx.createGain();
    fb.gain.value = 0.18;
    ambientGain.connect(delay);
    delay.connect(fb);
    fb.connect(delay);

    const ambientToMaster = audioCtx.createGain();
    ambientToMaster.gain.value = 0.35;
    ambientGain.connect(ambientToMaster);
    ambientToMaster.connect(masterGain);

    oscA.start();
    oscB.start();
    trem.start();
  } catch (err) {
    console.warn('Audio disabled:', err);
    audioAvailable = false;
  }

  let soundOn = audioAvailable;

  // Utility: generated sounds using Web Audio
  function safeAudioOp(fn) {
    if (!audioAvailable || !soundOn) return;
    try {
      fn();
    } catch (e) {
      console.warn('Audio op failed', e);
    }
  }

  // Play soft pluck / chime for correct answer (pleasant, not jarring)
  function playCorrectSound() {
    safeAudioOp(() => {
      const now = audioCtx.currentTime;
      // Create two quick plucks
      const freqs = [880, 1100, 1320];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        // gentle filter for body
        const flt = audioCtx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 2500;
        o.connect(flt);
        flt.connect(g);
        g.connect(masterGain);
        const t = now + i * 0.07;
        o.start(t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        o.stop(t + 0.28);
      });
    });
  }

  // Play gentle 'error' negative sound: soft thud and tiny noise
  function playIncorrectSound() {
    safeAudioOp(() => {
      const t0 = audioCtx.currentTime;
      // low thud
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(220, t0);
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      o.start(t0);
      g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.frequency.exponentialRampToValueAtTime(120, t0 + 0.35);
      o.stop(t0 + 0.38);

      // small filtered noise pop
      const bufferSize = 2 * audioCtx.sampleRate;
      const noiseBuf = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.6;
      }
      const noiseSrc = audioCtx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      const nf = audioCtx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 900;
      const ng = audioCtx.createGain();
      ng.gain.value = 0.0001;
      noiseSrc.connect(nf);
      nf.connect(ng);
      ng.connect(masterGain);
      noiseSrc.start(t0 + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      noiseSrc.stop(t0 + 0.13);
    });
  }

  // Small whoosh for selection or hover
  function playSelectWhoosh() {
    safeAudioOp(() => {
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.14);
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      o.start(t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.stop(t + 0.18);
    });
  }

  // Game state
  let drone = {
    x: CANVAS_WIDTH / 2,
    y: 140,
    width: 120,
    height: 50,
    vx: 0
  };

  let score = 0;
  let wrong = 0;
  let currentQuestion = null;
  let options = []; // option objects
  let gameState = 'playing'; // playing, won, lost
  let keysDown = {};
  let lastInputTime = 0;
  let cloudOffset = 0;

  // Particle system for subtle feedback (confetti, sparks)
  const particles = [];

  function spawnConfetti(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.8,
        life: 120 + Math.floor(Math.random() * 80),
        size: 4 + Math.random() * 6,
        color: randomPalette(),
        spin: (Math.random() - 0.5) * 0.12,
        type: 'confetti'
      });
    }
  }

  function spawnSpark(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const s = 2 + Math.random() * 2.6;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 50 + Math.floor(Math.random() * 30),
        size: 2 + Math.random() * 3,
        color: 'rgba(255,255,255,0.9)',
        type: 'spark'
      });
    }
  }

  function randomPalette() {
    const arr = ['#ffd58a', '#ffb3b3', '#b3ffe0', '#b3d9ff', '#f0c6ff'];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // For responsive text layout, fonts
  const fonts = {
    title: '28px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
    important: '20px Inter, system-ui, sans-serif',
    body: '16px Inter, system-ui, sans-serif',
    small: '14px Inter, system-ui, sans-serif'
  };

  // Generate a new math question (logic unchanged)
  function generateQuestion() {
    const types = ['add', 'sub', 'missing'];
    const type = types[Math.floor(Math.random() * types.length)];
    if (type === 'add') {
      const a = randInt(2, 12);
      const b = randInt(2, 12);
      const correct = a + b;
      return {
        text: `${a} + ${b} = ?`,
        correct
      };
    } else if (type === 'sub') {
      const a = randInt(5, 15);
      const b = randInt(1, a - 1);
      const correct = a - b;
      return {
        text: `${a} - ${b} = ?`,
        correct
      };
    } else {
      // missing addend
      const b = randInt(2, 10);
      const correct = randInt(2, 12);
      const a = correct - b;
      if (a < 0) return generateQuestion();
      return {
        text: `? + ${b} = ${correct}`,
        correct: a
      };
    }
  }

  // Utility random
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Create options (same logic)
  function createOptions(correct) {
    const set = new Set([correct]);
    while (set.size < OPTION_COUNT) {
      let delta = randInt(1, 6);
      let candidate = Math.random() < 0.5 ? correct + delta : correct - delta;
      if (candidate < 0) candidate = correct + delta + 2;
      set.add(candidate);
    }
    const arr = Array.from(set);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.map((v, idx) => ({ value: v, index: idx }));
  }

  // Place option rectangles
  function layoutOptions(optionValues) {
    options = [];
    const margin = 30;
    const areaWidth = CANVAS_WIDTH - margin * 2;
    const gap = 18;
    const boxW = (areaWidth - gap * (OPTION_COUNT - 1)) / OPTION_COUNT;
    const boxH = 74;
    const startX = margin;
    const y = 268;
    optionValues.forEach((opt, i) => {
      const x = startX + i * (boxW + gap);
      options.push({
        x,
        y,
        w: boxW,
        h: boxH,
        value: opt.value,
        isCorrect: opt.value === currentQuestion.correct,
        index: i,
        pulse: 0 // for subtle animation
      });
    });
  }

  function newQuestion() {
    currentQuestion = generateQuestion();
    const optVals = createOptions(currentQuestion.correct);
    layoutOptions(optVals);
  }

  function resetGame() {
    score = 0;
    wrong = 0;
    drone.x = CANVAS_WIDTH / 2;
    drone.vx = 0;
    gameState = 'playing';
    newQuestion();
    lastInputTime = performance.now();
    particles.length = 0;
    // gently ramp ambient if available
    if (audioAvailable && masterGain) {
      try {
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        masterGain.gain.setValueAtTime(0.07, audioCtx.currentTime);
      } catch (e) {}
    }
  }

  // Hit test for options
  function hitOption(x, y) {
    for (const opt of options) {
      if (x >= opt.x && x <= opt.x + opt.w && y >= opt.y && y <= opt.y + opt.h) {
        return opt;
      }
    }
    return null;
  }

  function hitRestart(x, y) {
    const btn = getRestartButtonRect();
    return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
  }

  function getRestartButtonRect() {
    const w = 220;
    const h = 52;
    return {
      x: CANVAS_WIDTH / 2 - w / 2,
      y: CANVAS_HEIGHT / 2 + 60,
      w,
      h
    };
  }

  // Player selects an option (only visuals and audio added; logic preserved)
  function selectOption(opt) {
    if (gameState !== 'playing') return;
    if (!opt) return;
    playSelectWhoosh();
    if (opt.isCorrect) {
      score += 1;
      playCorrectSound();
      // celebratory visual
      spawnConfetti(opt.x + opt.w / 2, opt.y + 10, 20);
      // small bump
      const prevY = drone.y;
      drone.y = 112;
      setTimeout(() => {
        drone.y = prevY;
      }, 220);
      if (score >= GOAL_SCORE) {
        gameState = 'won';
        // gentle fade of ambient
        if (audioAvailable && masterGain) {
          try {
            masterGain.gain.exponentialRampToValueAtTime(0.02, audioCtx.currentTime + 0.8);
          } catch (e) {}
        }
        // big celebration particles
        spawnConfetti(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40, 60);
      } else {
        newQuestion();
      }
    } else {
      wrong += 1;
      playIncorrectSound();
      spawnSpark(opt.x + opt.w / 2, opt.y + opt.h / 2, 12);
      // shake drone
      const origX = drone.x;
      let shakeTimes = 6;
      const shakeInterval = setInterval(() => {
        drone.x = origX + (Math.random() - 0.5) * 18;
        shakeTimes--;
        if (shakeTimes <= 0) {
          clearInterval(shakeInterval);
          drone.x = origX;
        }
      }, 45);
      if (wrong >= MAX_WRONG) {
        gameState = 'lost';
      } else {
        // regenerate options for variety
        const optVals = createOptions(currentQuestion.correct);
        layoutOptions(optVals);
      }
    }
  }

  // Keyboard
  function keyDownHandler(e) {
    lastInputTime = performance.now();
    if (e.key === 'ArrowLeft') {
      keysDown.ArrowLeft = true;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      keysDown.ArrowRight = true;
      e.preventDefault();
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (options[idx]) {
        selectOption(options[idx]);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      const centerX = drone.x;
      let best = null;
      let bestDist = Infinity;
      for (const opt of options) {
        const optCenter = opt.x + opt.w / 2;
        const d = Math.abs(optCenter - centerX);
        if (d < bestDist) {
          bestDist = d;
          best = opt;
        }
      }
      if (best) selectOption(best);
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'r') {
      resetGame();
    } else if (e.key.toLowerCase() === 'm') {
      soundOn = !soundOn;
      if (!soundOn) {
        if (masterGain) masterGain.gain.setValueAtTime(0.0001, audioCtx ? audioCtx.currentTime : 0);
      } else {
        if (masterGain) masterGain.gain.setValueAtTime(0.07, audioCtx ? audioCtx.currentTime : 0);
      }
    }
  }

  function keyUpHandler(e) {
    if (e.key === 'ArrowLeft') {
      keysDown.ArrowLeft = false;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      keysDown.ArrowRight = false;
      e.preventDefault();
    }
  }

  // Pointer handlers
  function pointerDownHandler(e) {
    canvas.focus();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    if (gameState === 'playing') {
      const hit = hitOption(x, y);
      if (hit) {
        selectOption(hit);
        return;
      }
    } else {
      if (hitRestart(x, y)) {
        resetGame();
        return;
      }
    }
    const audioIconRect = getAudioIconRect();
    if (
      x >= audioIconRect.x &&
      x <= audioIconRect.x + audioIconRect.w &&
      y >= audioIconRect.y &&
      y <= audioIconRect.y + audioIconRect.h
    ) {
      soundOn = !soundOn;
      if (!soundOn) {
        if (masterGain) masterGain.gain.setValueAtTime(0.0001, audioCtx ? audioCtx.currentTime : 0);
      } else {
        if (masterGain) masterGain.gain.setValueAtTime(0.07, audioCtx ? audioCtx.currentTime : 0);
      }
      return;
    }
  }

  window.addEventListener('keydown', keyDownHandler);
  window.addEventListener('keyup', keyUpHandler);
  canvas.addEventListener('pointerdown', pointerDownHandler);

  function getAudioIconRect() {
    const w = 44;
    const h = 34;
    return {
      x: CANVAS_WIDTH - w - PADDING,
      y: PADDING + 6,
      w,
      h
    };
  }

  // Drawing functions (improved visuals)
  function drawBackground(dt) {
    // Soft gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    g.addColorStop(0, '#eaf6ff');
    g.addColorStop(0.6, '#f7fbff');
    g.addColorStop(1, '#fffefc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Gentle sun
    const sunX = 96;
    const sunY = 64;
    const sunR = 40;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, sunR);
    sunGrad.addColorStop(0, 'rgba(255,240,200,0.95)');
    sunGrad.addColorStop(1, 'rgba(255,230,140,0.12)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    // Hills with subtle texture
    ctx.fillStyle = '#eaf6eb';
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);
    ctx.quadraticCurveTo(160, 380 + Math.sin(performance.now() / 2000) * 6, 360, CANVAS_HEIGHT - 72);
    ctx.quadraticCurveTo(520, 360 + Math.cos(performance.now() / 1800) * 8, CANVAS_WIDTH, CANVAS_HEIGHT - 50);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // moving clouds (soft)
    cloudOffset += dt * 0.02;
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 210) + cloudOffset * (i + 1) * 22) % (CANVAS_WIDTH + 260) - 130;
      const cy = 40 + (i % 2) * 26 + Math.sin((performance.now() / 1200) + i) * 6;
      drawCloud(cx, cy, 58 + (i % 3) * 10, 26 + (i % 2) * 6, `rgba(255,255,255,${0.92 - i * 0.12})`);
    }

    // subtle floating shapes (soft overlays)
    for (let i = 0; i < 6; i++) {
      const x = ((i * 160) + cloudOffset * 8) % CANVAS_WIDTH;
      const y = 360 + Math.sin((performance.now() / 900) + i) * 6;
      ctx.fillStyle = `rgba(200, 230, 255, 0.08)`;
      ctx.beginPath();
      ctx.ellipse(x + 20, y, 44, 14, Math.sin(i) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCloud(cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - rx * 0.6, cy + 6, rx * 0.72, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + rx * 0.6, cy + 6, rx * 0.72, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDrone() {
    const x = drone.x;
    const y = drone.y;
    const w = drone.width;
    const h = drone.height;

    // soft drop shadow
    ctx.fillStyle = 'rgba(10,20,30,0.08)';
    ctx.beginPath();
    ctx.ellipse(x, y + h + 18, w * 0.62, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // main body with glossy gradient
    const grad = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    grad.addColorStop(0, '#8fcdf6');
    grad.addColorStop(0.6, '#6fb7e9');
    grad.addColorStop(1, '#5aa3d8');
    ctx.fillStyle = grad;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 14);
    ctx.fill();

    // cockpit glass
    const glassGrad = ctx.createLinearGradient(x - 10, y - 12, x + 26, y + 8);
    glassGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
    glassGrad.addColorStop(1, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(x + 12, y - 6, w * 0.22, h * 0.48, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // friendly smile mark
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x + 20, y - 6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#034f84';
    ctx.fillRect(x - 8, y + 3, 24, 4);

    // rotors with subtle blur lines
    for (let i = -1; i <= 1; i += 2) {
      const rx = x + i * (w / 2 - 6);
      const ry = y - h / 2 - 8;
      ctx.fillStyle = '#fff2d8';
      roundRect(ctx, rx - 9, ry - 6, 18, 12, 7);
      // fast blades with translucency
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate((performance.now() / 1000) * (i * 6));
      ctx.fillStyle = 'rgba(20,32,40,0.6)';
      ctx.fillRect(-40, -3, 80, 6);
      ctx.restore();
      // light reflection
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(rx + 6, ry - 2, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // antenna
    ctx.fillStyle = '#034f84';
    ctx.fillRect(x + w / 2 - 28, y - h / 2 - 2, 4, 18);
    ctx.fillStyle = '#ff8a80';
    ctx.beginPath();
    ctx.arc(x + w / 2 - 26, y - h / 2 - 6, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOptions(now = performance.now()) {
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];

      // animate pulse slightly for focused box
      opt.pulse = opt.pulse ? opt.pulse * 0.92 : 0;
      const centerX = drone.x;
      const optCenter = opt.x + opt.w / 2;
      const dist = Math.abs(centerX - optCenter);
      if (dist < 80) {
        opt.pulse = Math.min(1, opt.pulse + 0.12);
      }

      // package base shadow & card
      ctx.save();
      // gentle lift effect when focused
      const lift = opt.pulse * -6;
      ctx.translate(0, lift);

      // box background with soft stroke
      ctx.fillStyle = 'rgba(255,255,250,0.98)';
      roundRect(ctx, opt.x, opt.y, opt.w, opt.h, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(12,84,126,0.06)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // decorative tape
      ctx.fillStyle = '#fff0d6';
      roundRect(ctx, opt.x + opt.w * 0.12, opt.y + opt.h * 0.18, opt.w * 0.76, opt.h * 0.14, 4);
      ctx.fill();

      // number badge
      ctx.fillStyle = '#2b7bbf';
      roundRect(ctx, opt.x + 8, opt.y + 10, 28, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.fillText(String(i + 1), opt.x + 18 - ctx.measureText(String(i + 1)).width / 2, opt.y + 10 + 18 - 6);

      // value label centered
      ctx.font = fonts.important;
      ctx.fillStyle = '#073642';
      const text = String(opt.value);
      const metrics = ctx.measureText(text);
      let fontToUse = fonts.important;
      if (metrics.width > opt.w - 36) {
        fontToUse = '18px sans-serif';
      }
      ctx.font = fontToUse;
      const tw = ctx.measureText(text).width;
      const tx = opt.x + opt.w / 2 - tw / 2;
      const ty = opt.y + opt.h / 2 + 8;
      // translucent highlight behind text
      ctx.fillStyle = 'rgba(255,255,255,0.84)';
      roundRect(ctx, tx - 8, ty - 22, tw + 16, 34, 8);
      ctx.fill();
      ctx.fillStyle = '#073642';
      ctx.fillText(text, tx, ty);

      // subtle focus outline if near drone
      if (opt.pulse > 0.03) {
        ctx.strokeStyle = `rgba(43,123,191,${0.06 + opt.pulse * 0.18})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(opt.x + 4, opt.y + 4, opt.w - 8, opt.h - 8);
      }
      ctx.restore();
    }
  }

  // Draw HUD and informational UI
  function drawUI() {
    // Score top-left
    ctx.font = fonts.important;
    const scoreText = `Stars: ${score}/${GOAL_SCORE}`;
    const scorePadding = PADDING;
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreBoxW = scoreMetrics.width + scorePadding * 2;
    const scoreBoxH = 38;
    const scoreX = PADDING;
    const scoreY = PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(ctx, scoreX, scoreY, scoreBoxW, scoreBoxH, 10);
    ctx.fill();
    ctx.fillStyle = '#074a67';
    ctx.fillText(scoreText, scoreX + scorePadding, scoreY + 26);

    // Lives top-right
    ctx.font = fonts.important;
    const livesText = `Strikes: ${wrong}/${MAX_WRONG}`;
    const livesMetrics = ctx.measureText(livesText);
    const livesW = livesMetrics.width + scorePadding * 2;
    const livesH = 38;
    const livesX = CANVAS_WIDTH - livesW - PADDING - 56; // leave space for audio icon
    const livesY = PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(ctx, livesX, livesY, livesW, livesH, 10);
    ctx.fill();
    ctx.fillStyle = '#8b0000';
    ctx.fillText(livesText, livesX + scorePadding, livesY + 26);

    // Audio icon top-right
    const audioRect = getAudioIconRect();
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    roundRect(ctx, audioRect.x, audioRect.y, audioRect.w, audioRect.h, 8);
    ctx.fill();

    // Draw speaker glyph
    ctx.fillStyle = '#1b2b33';
    ctx.beginPath();
    ctx.moveTo(audioRect.x + 8, audioRect.y + audioRect.h / 2 - 6);
    ctx.lineTo(audioRect.x + 20, audioRect.y + audioRect.h / 2 - 12);
    ctx.lineTo(audioRect.x + 20, audioRect.y + audioRect.h / 2 + 12);
    ctx.lineTo(audioRect.x + 8, audioRect.y + audioRect.h / 2 + 6);
    ctx.closePath();
    ctx.fill();

    if (soundOn && audioAvailable) {
      ctx.strokeStyle = '#2b7bbf';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(audioRect.x + 27, audioRect.y + audioRect.h / 2 - 2, 10, -Math.PI / 6, Math.PI / 6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#a0a0a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(audioRect.x + 22, audioRect.y + 8);
      ctx.lineTo(audioRect.x + 36, audioRect.y + 22);
      ctx.moveTo(audioRect.x + 36, audioRect.y + 8);
      ctx.lineTo(audioRect.x + 22, audioRect.y + 22);
      ctx.stroke();
    }

    // Bottom-center instructions (kept compact)
    ctx.font = fonts.body;
    ctx.fillStyle = '#073642';
    const lines = [
      'Use ← → to steer the drone. Click or press 1–4 to choose.',
      'Collect 10 stars to win. 3 wrong answers ends the run.'
    ];
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const boxW = widest + PADDING * 2;
    const boxH = lines.length * 20 + PADDING * 2;
    const bx = CANVAS_WIDTH / 2 - boxW / 2;
    const by = CANVAS_HEIGHT - boxH - PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fill();
    ctx.fillStyle = '#073642';
    ctx.font = fonts.body;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + PADDING, by + PADDING + (i + 1) * 18 - 4);
    }
  }

  function drawQuestionPanel() {
    ctx.font = '22px sans-serif';
    const qText = currentQuestion ? currentQuestion.text : '';
    const metrics = ctx.measureText(qText);
    const boxW = Math.min(CANVAS_WIDTH - 120, metrics.width + PADDING * 2 + 20);
    const boxH = 48;
    const bx = CANVAS_WIDTH / 2 - boxW / 2;
    const by = 196 - boxH / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    roundRect(ctx, bx, by, boxW, boxH, 12);
    ctx.fill();
    ctx.fillStyle = '#023047';
    ctx.fillText(qText, bx + PADDING + 6, by + 32);
  }

  function drawEndScreen() {
    ctx.fillStyle = 'rgba(6, 12, 20, 0.44)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.textAlign = 'center';
    if (gameState === 'won') {
      ctx.font = '34px sans-serif';
      const title = 'Victory! Drone Fleet Celebrates!';
      const tm = ctx.measureText(title);
      const boxW = Math.min(CANVAS_WIDTH - 80, tm.width + 60);
      const boxH = 160;
      const bx = CANVAS_WIDTH / 2 - boxW / 2;
      const by = CANVAS_HEIGHT / 2 - boxH / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      roundRect(ctx, bx, by, boxW, boxH, 12);
      ctx.fill();
      ctx.fillStyle = '#034f84';
      ctx.fillText(title, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 14);
      ctx.font = '18px sans-serif';
      ctx.fillStyle = '#2b7bbf';
      ctx.fillText(`You collected ${score} stars! Great job!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 18);
    } else if (gameState === 'lost') {
      ctx.font = '34px sans-serif';
      const title = 'Game Over — Oops!';
      const tm = ctx.measureText(title);
      const boxW = Math.min(CANVAS_WIDTH - 80, tm.width + 60);
      const boxH = 160;
      const bx = CANVAS_WIDTH / 2 - boxW / 2;
      const by = CANVAS_HEIGHT / 2 - boxH / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      roundRect(ctx, bx, by, boxW, boxH, 12);
      ctx.fill();
      ctx.fillStyle = '#8b0000';
      ctx.fillText(title, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 14);
      ctx.font = '18px sans-serif';
      ctx.fillStyle = '#6a3b3b';
      ctx.fillText(`You had ${wrong} strikes. Try again!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 18);
    }
    // Restart button
    const btn = getRestartButtonRect();
    ctx.fillStyle = '#ffd58a';
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = '20px sans-serif';
    ctx.fillText('Restart Game (R)', btn.x + btn.w / 2, btn.y + btn.h / 2 + 7);
    ctx.textAlign = 'start';
  }

  // Utility rounding
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.min(w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // Particle update & draw
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      // apply physics
      p.vy += 0.08; // gravity
      p.vx *= 0.995;
      p.vy *= 0.998;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.type === 'confetti') {
        p.size *= 0.997;
      }
      if (p.life <= 0 || p.y > CANVAS_HEIGHT + 40 || p.x < -40 || p.x > CANVAS_WIDTH + 40) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      if (p.type === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((performance.now() / 1000) * (p.spin || 0.3));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Main loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;

    if (gameState === 'playing') {
      update(dt);
    }

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawBackground(dt);
    // Draw packages under drone (background elements)
    drawOptions(now);
    drawParticles();
    drawDrone();
    drawQuestionPanel();
    drawUI();

    // helpful aiming line
    ctx.strokeStyle = 'rgba(2,48,71,0.06)';
    ctx.lineWidth = 2;
    const centerX = drone.x;
    let nearest = null;
    let nd = Infinity;
    for (const opt of options) {
      const cx = opt.x + opt.w / 2;
      const d = Math.abs(cx - centerX);
      if (d < nd) {
        nd = d;
        nearest = opt;
      }
    }
    if (nearest) {
      ctx.beginPath();
      ctx.moveTo(centerX, drone.y + drone.height / 2);
      ctx.lineTo(nearest.x + nearest.w / 2, nearest.y + 4);
      ctx.stroke();
      // subtle focus stroke
      ctx.strokeStyle = 'rgba(43,123,191,0.08)';
      ctx.lineWidth = 6;
      ctx.strokeRect(nearest.x + 6, nearest.y + 6, nearest.w - 12, nearest.h - 12);
    }

    if (gameState === 'won' || gameState === 'lost') {
      drawEndScreen();
    }

    requestAnimationFrame(loop);
  }

  function update(dt) {
    // Movement as before
    if (keysDown.ArrowLeft) {
      drone.vx = -DRONE_SPEED;
    } else if (keysDown.ArrowRight) {
      drone.vx = DRONE_SPEED;
    } else {
      drone.vx = 0;
    }
    drone.x += drone.vx;
    const halfW = drone.width / 2;
    if (drone.x < halfW + 8) drone.x = halfW + 8;
    if (drone.x > CANVAS_WIDTH - halfW - 8) drone.x = CANVAS_WIDTH - halfW - 8;

    // gentle bobbing for drone's y when idle
    const bob = Math.sin(performance.now() / 420) * 2;
    if (drone.y !== 140) {
      // leave temporary y alone (like when bumped)
    } else {
      drone.y = 140 + bob;
    }

    // update options pulse animation
    for (const opt of options) {
      // minor easing
      opt.pulse = opt.pulse ? opt.pulse * 0.94 : 0;
    }

    // particles
    updateParticles();
  }

  // Fonts baseline init
  function initFonts() {
    ctx.font = fonts.title;
    ctx.textBaseline = 'top';
  }

  // Start
  initFonts();
  resetGame();
  requestAnimationFrame(loop);

  // Small audio hint if audio not available
  if (!audioAvailable) {
    const warnText = document.createElement('div');
    warnText.innerText = 'Audio not available';
    warnText.style.position = 'absolute';
    warnText.style.left = '8px';
    warnText.style.top = '8px';
    warnText.style.background = 'rgba(255,255,255,0.6)';
    warnText.style.padding = '4px 8px';
    warnText.style.borderRadius = '6px';
    warnText.style.fontSize = '12px';
    stage.appendChild(warnText);
  }

  // Try to resume audio context on user gesture with proper error handling
  stage.addEventListener('click', () => {
    if (!audioAvailable) return;
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('AudioContext resume failed:', e);
      });
    }
  });

  // Prevent selection
  canvas.addEventListener('mousedown', (e) => e.preventDefault());

  // Clean up on unload
  window.addEventListener('unload', () => {
    try {
      if (audioCtx && typeof audioCtx.close === 'function') audioCtx.close();
    } catch (e) {}
  });
})();