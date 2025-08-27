(function () {
  // Electricity Math Game - Visual & Audio Enhancements Only
  // Renders entirely inside the element with id "game-of-the-day-stage"
  // Canvas 720x480, all graphics via canvas, sounds via Web Audio API.
  // Author: Educational Game Designer AI (visual/audio improvements)
  'use strict';

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const CANVAS_ID = 'game-canvas';
  const STAGE_ID = 'game-of-the-day-stage';

  // Find container
  const container = document.getElementById(STAGE_ID);
  if (!container) {
    console.error('Game container element with id "' + STAGE_ID + '" not found.');
    return;
  }
  // Make container focusable and accessible
  container.tabIndex = 0;
  container.setAttribute('role', 'application');
  container.setAttribute(
    'aria-label',
    'Spark Circuit: an electricity-themed math game for children ages 7 to 9.'
  );
  container.style.outline = 'none';

  // Create canvas (exactly 720x480)
  const existing = document.getElementById(CANVAS_ID);
  if (existing) existing.remove();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.id = CANVAS_ID;
  canvas.style.display = 'block';
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  container.innerHTML = '';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Canvas context not available.');
    return;
  }

  // Time tracker for animations
  let globalTime = 0;

  // Web Audio setup with robust error handling
  let audioAvailable = true;
  let audioCtx = null;
  let bgMainGain = null;
  let bgOsc1 = null;
  let bgOsc2 = null;
  let bgLFO = null;
  let bgStarted = false;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    // Use master gain for background control
    bgMainGain = audioCtx.createGain();
    bgMainGain.gain.value = 0.035; // gentle background
    bgMainGain.connect(audioCtx.destination);

    // Two gentle oscillators to form a soft pad
    bgOsc1 = audioCtx.createOscillator();
    bgOsc1.type = 'sine';
    bgOsc1.frequency.value = 110; // low hum

    bgOsc2 = audioCtx.createOscillator();
    bgOsc2.type = 'triangle';
    bgOsc2.frequency.value = 165; // harmonic layer

    // individual gains for texture
    const g1 = audioCtx.createGain();
    g1.gain.value = 0.8;
    const g2 = audioCtx.createGain();
    g2.gain.value = 0.45;

    // gentle lowpass for mellowing
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;

    // subtle tremolo using LFO on main gain
    bgLFO = audioCtx.createOscillator();
    bgLFO.type = 'sine';
    bgLFO.frequency.value = 0.12; // very slow
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.012;

    try {
      bgOsc1.connect(g1);
      bgOsc2.connect(g2);
      g1.connect(lp);
      g2.connect(lp);
      lp.connect(bgMainGain);

      bgLFO.connect(lfoGain);
      lfoGain.connect(bgMainGain.gain);
    } catch (innerErr) {
      console.warn('Audio node connection failed:', innerErr);
    }
    // We'll start oscillators upon first user gesture
  } catch (e) {
    console.warn('Web Audio API not available or blocked:', e);
    audioAvailable = false;
    audioCtx = null;
    bgMainGain = null;
    bgOsc1 = bgOsc2 = bgLFO = null;
  }

  // Safe resume and start background
  function safeResumeAudio() {
    if (!audioAvailable || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch((err) => {
          console.warn('AudioContext resume failed:', err);
        });
      }
      if (!bgStarted) {
        // start background oscillators safely
        try {
          bgOsc1.start();
          bgOsc2.start();
          bgLFO.start();
          bgStarted = true;
        } catch (e) {
          // might already be started
        }
      }
    } catch (err) {
      console.warn('safeResumeAudio error:', err);
    }
  }

  // Low-level beep with richer envelope and optional pan
  function playBeep({ freq = 880, type = 'sine', duration = 0.12, gain = 0.08, slide = 0, pan = 0 } = {}) {
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;

      // optional panner (StereoPannerNode)
      let panNode = null;
      try {
        panNode = audioCtx.createStereoPanner();
        panNode.pan.value = pan;
      } catch (e) {
        panNode = null;
      }

      o.connect(g);
      if (panNode) {
        g.connect(panNode);
        panNode.connect(audioCtx.destination);
      } else {
        g.connect(audioCtx.destination);
      }

      // envelope
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);

      if (slide !== 0) {
        o.frequency.linearRampToValueAtTime(freq + slide, now + duration);
      }
      o.start(now);
      o.stop(now + duration + 0.05);
    } catch (e) {
      console.warn('playBeep failed', e);
    }
  }

  // Enhanced event sounds
  function playCorrectSound() {
    // stack of harmonious beeps with light panning
    playBeep({ freq: 660, type: 'sine', duration: 0.22, gain: 0.06, slide: 120, pan: -0.15 });
    setTimeout(() => playBeep({ freq: 880, type: 'triangle', duration: 0.12, gain: 0.04, pan: 0.12 }), 80);
    setTimeout(() => playBeep({ freq: 1320, type: 'sine', duration: 0.08, gain: 0.03, pan: 0.05 }), 160);
  }

  function playIncorrectSound() {
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 160;
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      o.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      // envelope: short buzz
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      o.start(now);
      o.stop(now + 0.36);
    } catch (e) {
      console.warn('playIncorrectSound failed', e);
    }
  }

  function playSelectSound() {
    playBeep({ freq: 420, type: 'sine', duration: 0.08, gain: 0.045, pan: -0.05 });
  }

  function playLaunchSound() {
    playBeep({ freq: 520, type: 'triangle', duration: 0.18, gain: 0.06, slide: -120 });
  }

  // Configure and start background when user interacts
  function ensureBackgroundStarted() {
    if (!audioAvailable || !audioCtx) return;
    try {
      // connect oscillators if not already connected (some browsers require reconnection)
      if (bgOsc1 && bgOsc2 && bgLFO && bgMainGain) {
        // recreate connections safely if needed (try/catch to avoid exceptions)
        try {
          // create internal gain nodes if reference missing
          // Already connected earlier; ensure LFO is modulating slightly
          // Do nothing else; start was handled in safeResumeAudio
        } catch (e) {
          console.warn('Background connect error', e);
        }
      }
    } catch (e) {
      console.warn('ensureBackgroundStarted error', e);
    }
  }

  // Game state (do not change math logic)
  const totalRounds = 6;
  let currentRound = 0;
  let score = 0;
  let roundTarget = 0;
  let givenAddend = 0;
  let choices = [];
  let correctChoiceIndex = 0;
  let bulbs = [];
  let message = 'Click or press Space to start. Use Left/Right and Enter to choose.';
  let gamePhase = 'intro';
  let selectedIndex = 0;
  let draggingBattery = null;
  let mouse = { x: 0, y: 0 };
  let lastTime = 0;
  let animationParticles = [];
  // decorative electrons that travel along wires (visual only)
  const electrons = [];

  // Visual helpers
  function drawRoundedRect(ctxLocal, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctxLocal.beginPath();
    ctxLocal.moveTo(x + r, y);
    ctxLocal.arcTo(x + w, y, x + w, y + h, r);
    ctxLocal.arcTo(x + w, y + h, x, y + h, r);
    ctxLocal.arcTo(x, y + h, x, y, r);
    ctxLocal.arcTo(x, y, x + w, y, r);
    ctxLocal.closePath();
  }

  // Create next round (unchanged logic)
  function seedRound() {
    currentRound++;
    roundTarget = 6 + Math.floor(Math.random() * 13);
    givenAddend = 1 + Math.floor(Math.random() * Math.min(9, roundTarget - 1));
    const correct = roundTarget - givenAddend;
    const distractors = new Set();
    while (distractors.size < 2) {
      let d = correct + (Math.floor(Math.random() * 7) - 3);
      if (d < 0) d = Math.abs(d);
      if (d === correct) continue;
      distractors.add(d);
    }
    const arr = Array.from(distractors);
    arr.push(correct);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    choices = [];
    const baseY = 380;
    const spacing = 140;
    for (let i = 0; i < 3; i++) {
      choices.push({
        id: i,
        value: arr[i],
        x: 160 + i * spacing,
        y: baseY,
        r: 32,
        selected: i === 0,
        dragging: false,
        vx: 0,
        vy: 0,
        used: false,
        flyingTo: null,
        flyingProgress: 0
      });
    }
    correctChoiceIndex = choices.findIndex((c) => c.value === correct);
    selectedIndex = 0;
    message = `Charge the bulb: ${givenAddend} + ? = ${roundTarget}`;
    gamePhase = 'playing';
  }

  // Initialize bulbs (unchanged logic but will add some visual flags)
  function initBulbs() {
    bulbs = [];
    const count = 5;
    const startX = 160;
    const gap = 100;
    for (let i = 0; i < count; i++) {
      bulbs.push({
        id: i,
        x: startX + i * gap,
        y: 160,
        r: 28,
        required: 0,
        lit: false,
        pulse: 0 // visual pulse for glow
      });
    }
    for (const b of bulbs) {
      b.required = 5 + Math.floor(Math.random() * 11);
      b.lit = false;
      b.pulse = 0;
    }
  }

  function pointToBulb(px, py) {
    for (const b of bulbs) {
      const dx = px - b.x;
      const dy = py - b.y;
      if (Math.sqrt(dx * dx + dy * dy) < b.r + 24) {
        return b;
      }
    }
    return null;
  }

  // Start game
  function startGame() {
    score = 0;
    currentRound = 0;
    initBulbs();
    seedRound();
    safeResumeAudio();
    ensureBackgroundStarted();
    message = 'Make the right choice to charge bulbs. Drag or use keyboard.';
  }

  // Input handling (only visuals/audio started/resume changes allowed)
  function onKeyDown(e) {
    safeResumeAudio();
    if (gamePhase === 'intro') {
      if (e.key === ' ' || e.key === 'Enter') {
        startGame();
        e.preventDefault();
        return;
      }
    }
    if (gamePhase === 'playing') {
      if (e.key === 'ArrowLeft') {
        selectedIndex = (selectedIndex + choices.length - 1) % choices.length;
        playSelectSound();
      } else if (e.key === 'ArrowRight') {
        selectedIndex = (selectedIndex + 1) % choices.length;
        playSelectSound();
      } else if (e.key === 'Enter' || e.key === ' ') {
        const c = choices[selectedIndex];
        const targetBulb = bulbs.reduce((best, b) => {
          if (b.lit) return best;
          if (!best) return b;
          const distB = Math.abs(b.x - WIDTH / 2);
          const distBest = Math.abs(best.x - WIDTH / 2);
          return distB < distBest ? b : best;
        }, null);
        if (targetBulb) {
          launchBatteryTo(c, targetBulb);
          playLaunchSound();
        }
        e.preventDefault();
      }
    } else if (gamePhase === 'finished') {
      if (e.key === 'Enter' || e.key === ' ') {
        startGame();
        e.preventDefault();
      }
    }
  }

  // Mouse / touch events (unchanged mechanics)
  canvas.addEventListener('mousedown', function (e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    safeResumeAudio();
    if (gamePhase === 'intro') {
      startGame();
      return;
    }
    if (gamePhase !== 'playing') return;
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      const dx = mouse.x - c.x;
      const dy = mouse.y - c.y;
      if (Math.sqrt(dx * dx + dy * dy) <= c.r) {
        c.dragging = true;
        draggingBattery = c;
        selectedIndex = i;
        playSelectSound();
        break;
      }
    }
  });

  canvas.addEventListener('mousemove', function (e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (draggingBattery) {
      draggingBattery.x = mouse.x;
      draggingBattery.y = mouse.y;
    }
  });

  canvas.addEventListener('mouseup', function (e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (draggingBattery) {
      const b = pointToBulb(mouse.x, mouse.y);
      if (b) {
        launchBatteryTo(draggingBattery, b);
        playLaunchSound();
      } else {
        playSelectSound();
        const originX = 160 + draggingBattery.id * 140;
        const originY = 380;
        draggingBattery.vx = (originX - draggingBattery.x) * 0.2;
        draggingBattery.vy = (originY - draggingBattery.y) * 0.2;
      }
      draggingBattery.dragging = false;
      draggingBattery = null;
    }
  });

  canvas.addEventListener(
    'touchstart',
    function (e) {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      mouse.x = (t.clientX - rect.left) * (canvas.width / rect.width);
      mouse.y = (t.clientY - rect.top) * (canvas.height / rect.height);
      safeResumeAudio();
      if (gamePhase === 'intro') {
        startGame();
        return;
      }
      if (gamePhase !== 'playing') return;
      for (let i = 0; i < choices.length; i++) {
        const c = choices[i];
        const dx = mouse.x - c.x;
        const dy = mouse.y - c.y;
        if (Math.sqrt(dx * dx + dy * dy) <= c.r) {
          c.dragging = true;
          draggingBattery = c;
          selectedIndex = i;
          playSelectSound();
          break;
        }
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    function (e) {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      mouse.x = (t.clientX - rect.left) * (canvas.width / rect.width);
      mouse.y = (t.clientY - rect.top) * (canvas.height / rect.height);
      if (draggingBattery) {
        draggingBattery.x = mouse.x;
        draggingBattery.y = mouse.y;
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchend',
    function (e) {
      e.preventDefault();
      if (draggingBattery) {
        const b = pointToBulb(mouse.x, mouse.y);
        if (b) {
          launchBatteryTo(draggingBattery, b);
          playLaunchSound();
        } else {
          const originX = 160 + draggingBattery.id * 140;
          const originY = 380;
          draggingBattery.vx = (originX - draggingBattery.x) * 0.2;
          draggingBattery.vy = (originY - draggingBattery.y) * 0.2;
        }
        draggingBattery.dragging = false;
        draggingBattery = null;
      }
    },
    { passive: false }
  );

  // Launch battery to bulb (visual: set velocity and flyingTo)
  function launchBatteryTo(battery, bulb) {
    if (!battery || !bulb || gamePhase !== 'playing') return;
    const dx = bulb.x - battery.x;
    const dy = bulb.y - battery.y;
    battery.vx = dx * 0.12;
    battery.vy = dy * 0.12;
    battery.flyingTo = bulb;
    battery.flyingProgress = 0;
    // create small electron trail for visual only
    for (let i = 0; i < 6; i++) {
      electrons.push({
        x: battery.x,
        y: battery.y,
        vx:
          Math.cos(Math.atan2(dy, dx)) * (1 + Math.random() * 2) +
          (Math.random() - 0.5) * 0.4,
        vy:
          Math.sin(Math.atan2(dy, dx)) * (1 + Math.random() * 2) +
          (Math.random() - 0.5) * 0.4,
        life: 30 + Math.floor(Math.random() * 20),
        color: 'rgba(180,230,255,0.95)',
        size: 2 + Math.random() * 2
      });
    }
  }

  // Resolve battery to bulb (must keep math logic unchanged)
  function resolveBatteryToBulb(battery, bulb) {
    const sum = givenAddend + battery.value;
    const correct = sum === roundTarget;
    if (correct) {
      bulb.lit = true;
      score += 10;
      playCorrectSound();
      createSparkles(bulb.x, bulb.y, 16);
      message = `Great! ${givenAddend} + ${battery.value} = ${roundTarget}. Bulb lit!`;
    } else {
      playIncorrectSound();
      score = Math.max(0, score - 2);
      message = `Not quite. ${givenAddend} + ${battery.value} = ${sum}. Try again!`;
      createZap(bulb.x, bulb.y);
    }
    battery.used = true;
    if (correct) {
      const notLit = bulbs.filter((b) => !b.lit);
      if (notLit.length === 0) {
        gamePhase = 'finished';
        message = `All bulbs lit! You scored ${score} points. Press Enter to play again.`;
      } else {
        if (currentRound < totalRounds) {
          seedRound();
        } else {
          gamePhase = 'finished';
          message = `Great job! You scored ${score} points. Press Enter to play again.`;
        }
      }
    } else {
      const available = choices.filter((c) => !c.used);
      if (available.length === 0) {
        const values = [roundTarget - givenAddend];
        while (values.length < 3) {
          let d = Math.max(0, Math.floor(Math.random() * 13));
          if (!values.includes(d)) values.push(d);
        }
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [values[i], values[j]] = [values[j], values[i]];
        }
        for (let i = 0; i < 3; i++) {
          choices[i].value = values[i];
          choices[i].used = false;
          choices[i].x = 160 + i * 140;
          choices[i].y = 380;
        }
        message = 'Choices refreshed. Try again!';
      }
    }
  }

  // Particles and visual feedback (enhanced)
  function createSparkles(x, y, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      animationParticles.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 1,
        life: 50 + Math.floor(Math.random() * 40),
        color: `hsl(${180 + Math.random() * 60}, 85%, ${60 + Math.random() * 20}%)`,
        size: 2 + Math.random() * 3,
        fade: 0.98
      });
    }
  }

  function createZap(x, y) {
    for (let i = 0; i < 8; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5);
      animationParticles.push({
        x: x + Math.random() * 10 - 5,
        y: y + Math.random() * 10 - 5,
        vx: Math.cos(ang) * (1 + Math.random() * 2),
        vy: Math.sin(ang) * (1 + Math.random() * 2),
        life: 30 + Math.floor(Math.random() * 20),
        color: `rgba(255,150,50,${0.6 + Math.random() * 0.4})`,
        size: 2 + Math.random() * 3,
        fade: 0.92
      });
    }
  }

  // Update loop
  function update(dt) {
    globalTime += dt * 0.0166; // approximate seconds
    // Update batteries
    for (const c of choices) {
      if (c.used) {
        c.x += (700 - c.x) * 0.06;
        c.y += (420 - c.y) * 0.06;
      } else if (c.flyingTo) {
        c.flyingProgress += 0.06;
        c.x += c.vx;
        c.y += c.vy;
        const dx = c.x - c.flyingTo.x;
        const dy = c.y - c.flyingTo.y;
        if (Math.sqrt(dx * dx + dy * dy) < 18 || c.flyingProgress > 1.2) {
          const bulb = c.flyingTo;
          c.flyingTo = null;
          resolveBatteryToBulb(c, bulb);
        }
      } else if (c.dragging) {
        // follow pointer updated elsewhere
      } else {
        if (Math.abs(c.vx) > 0.01 || Math.abs(c.vy) > 0.01) {
          c.x += c.vx;
          c.y += c.vy;
          c.vx *= 0.82;
          c.vy *= 0.82;
        } else {
          const originX = 160 + c.id * 140;
          const originY = 380;
          c.x += (originX - c.x) * 0.08;
          c.y += (originY - c.y) * 0.08;
        }
      }
    }

    // Update particles
    for (let i = animationParticles.length - 1; i >= 0; i--) {
      const p = animationParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gentle gravity
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.life--;
      p.size *= p.fade || 0.99;
      if (p.life <= 0 || p.size < 0.2) {
        animationParticles.splice(i, 1);
      }
    }

    // Update electrons
    for (let i = electrons.length - 1; i >= 0; i--) {
      const e = electrons[i];
      e.x += e.vx;
      e.y += e.vy;
      e.vy += 0.02;
      e.life--;
      if (e.life <= 0) {
        electrons.splice(i, 1);
      }
    }

    // Bulb pulse animation for lit bulbs
    for (const b of bulbs) {
      if (b.lit) {
        b.pulse = 0.8 + Math.sin(globalTime * 3 + b.id) * 0.2;
      } else {
        b.pulse = 0;
      }
    }

    // Background ambient subtle dynamic: slightly modulate bgMainGain if available
    if (audioAvailable && bgMainGain && bgLFO && audioCtx) {
      try {
        // nothing to do every frame since LFO does modulation automatically
      } catch (e) {
        // ignore
      }
    }
  }

  // Drawing - full scene with improved visuals
  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Soft textured background gradient with subtle noise-like circles (drawn procedurally)
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#f1fbff');
    bg.addColorStop(0.5, '#eafbf2');
    bg.addColorStop(1, '#f6fff6');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // distant abstract hills for depth
    drawHills();

    // light floating orbs to make scene lively (soft, low contrast)
    drawFloatingOrbs();

    // circuit board area
    ctx.save();
    ctx.translate(0, 0);
    drawRoundedRect(ctx, 40, 110, WIDTH - 80, 300, 18);
    // textured board gradient
    const boardGr = ctx.createLinearGradient(40, 110, 40, 410);
    boardGr.addColorStop(0, '#0f3a36');
    boardGr.addColorStop(1, '#083735');
    ctx.fillStyle = boardGr;
    ctx.fill();

    // subtle grid lines
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(60 + i * 80, 130);
      ctx.lineTo(60 + i * 80, 380);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.stroke();
    }

    // decorative conductive traces connecting bulbs
    drawTraces();
    ctx.restore();

    // Characters with slight bobbing animation
    drawProfessorVolt(80, 320, globalTime);
    drawSparky(620, 360, globalTime);

    // Draw bulbs (with glow and animated filament)
    for (const b of bulbs) {
      drawBulb(b);
      ctx.font = '14px "Segoe UI", Arial';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      if (!b.lit) {
        ctx.fillText(b.required, b.x, b.y + 46);
      } else {
        ctx.fillText('ON', b.x, b.y + 46);
      }
    }

    // Header panel with soft drop shadow
    drawHeaderPanel();

    // Batteries
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      drawBattery(c, i === selectedIndex && !c.used);
    }

    // Render electrons
    for (const e of electrons) {
      ctx.beginPath();
      ctx.fillStyle = e.color;
      ctx.globalAlpha = Math.max(0.2, e.life / 40);
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Particles
    for (const p of animationParticles) {
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0.05, p.life / 80);
      ctx.arc(p.x, p.y, Math.max(0.6, p.size), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Bottom status and message
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '14px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score, 18, HEIGHT - 22);
    ctx.textAlign = 'center';
    wrapText(message, WIDTH / 2, HEIGHT - 22, 520, 14);

    // Audio icon
    drawAudioIcon(HEIGHT - 60, WIDTH - 60);

    // Overlay intro/finished panels
    if (gamePhase === 'intro' || gamePhase === 'finished') {
      ctx.save();
      ctx.fillStyle = 'rgba(4,20,24,0.55)';
      ctx.fillRect(80, 100, WIDTH - 160, 220);
      ctx.fillStyle = '#fff';
      ctx.font = '22px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      if (gamePhase === 'intro') {
        ctx.fillText('Spark Circuit', WIDTH / 2, 150);
        ctx.font = '16px "Segoe UI", Arial';
        ctx.fillText('Welcome! Solve addition puzzles to charge the bulbs.', WIDTH / 2, 190);
        ctx.fillText('Drag a battery to a bulb or use ← → and Enter. Press Space to start.', WIDTH / 2, 220);
        ctx.fillText('Each correct answer lights a bulb. Try to light them all!', WIDTH / 2, 250);
      } else {
        ctx.fillText('All Done!', WIDTH / 2, 150);
        ctx.font = '16px "Segoe UI", Arial';
        ctx.fillText(`You scored ${score} points.`, WIDTH / 2, 190);
        ctx.fillText('Press Enter or click to play again.', WIDTH / 2, 220);
      }
      ctx.restore();
    }

    // Keyboard hint box
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    drawRoundedRect(ctx, WIDTH - 210, 18, 190, 66, 10);
    ctx.fill();
    ctx.fillStyle = '#073742';
    ctx.font = '12px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Keyboard: ← → to choose; Enter to send', WIDTH - 196, 40);
    ctx.fillText('Space to start/pick; Drag with mouse or touch', WIDTH - 196, 58);
    ctx.restore();
  }

  // Drawing helper implementations (enhanced visuals)

  function drawHills() {
    // layered hills for depth
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#e6fff0';
    ctx.beginPath();
    ctx.moveTo(0, 140);
    ctx.quadraticCurveTo(120, 90, 240, 140);
    ctx.quadraticCurveTo(360, 190, 480, 140);
    ctx.quadraticCurveTo(600, 90, WIDTH, 140);
    ctx.lineTo(WIDTH, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawFloatingOrbs() {
    const time = globalTime;
    for (let i = 0; i < 8; i++) {
      const ox = 80 + i * 80 + Math.sin(time * 0.3 + i) * 6;
      const oy = 40 + Math.cos(time * 0.2 + i * 0.5) * 8;
      const r = 10 + (i % 3);
      const g = ctx.createRadialGradient(ox - r / 4, oy - r / 4, 1, ox, oy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0.06)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTraces() {
    // draw a gentle glowing trace that connects bulbs
    ctx.save();
    for (let i = 0; i < bulbs.length - 1; i++) {
      const a = bulbs[i];
      const b = bulbs[i + 1];
      // base trace
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + 38);
      const midX = (a.x + b.x) / 2;
      ctx.quadraticCurveTo(midX, a.y + 70, b.x, b.y + 38);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 6;
      ctx.stroke();

      // conductive stripe
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + 38);
      ctx.quadraticCurveTo(midX, a.y + 60, b.x, b.y + 38);
      ctx.strokeStyle = 'rgba(180,240,255,0.06)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // moving highlight when bulbs lit
      if (a.lit || b.lit) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y + 38);
        ctx.quadraticCurveTo(midX, a.y + 50, b.x, b.y + 38);
        ctx.strokeStyle = 'rgba(255,240,180,0.14)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawProfessorVolt(x, y, t) {
    ctx.save();
    const bob = Math.sin(t * 2 + (x + y) * 0.01) * 4;
    ctx.translate(x, y + bob);
    // friendly lightning body with gradient
    const grad = ctx.createLinearGradient(-30, -80, 30, 10);
    grad.addColorStop(0, '#fff2a8');
    grad.addColorStop(1, '#ffd24d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-20, -10);
    ctx.lineTo(0, -70);
    ctx.lineTo(10, -50);
    ctx.lineTo(-5, -40);
    ctx.lineTo(20, -5);
    ctx.lineTo(-6, -8);
    ctx.closePath();
    ctx.fill();

    // face with subtle shadow
    ctx.beginPath();
    ctx.arc(0, -30, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8e6';
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-4, -32, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -32, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.beginPath();
    ctx.arc(0, -26, 5, 0, Math.PI);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // glasses
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(-4, -32, 3.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4, -32, 3.4, 0, Math.PI * 2);
    ctx.stroke();

    // nameplate
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '11px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Professor Volt', 0, 4);
    ctx.restore();
  }

  function drawSparky(x, y, t) {
    ctx.save();
    const bob = Math.cos(t * 2.5 + (x + y) * 0.02) * 3.5;
    ctx.translate(x, y + bob);
    // glow gradient
    const grad = ctx.createRadialGradient(-6, -6, 2, 0, 0, 24);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.15, '#bff7ff');
    grad.addColorStop(1, '#33aaff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = '#062a2a';
    ctx.beginPath();
    ctx.arc(-6, -4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -4, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // antenna
    ctx.beginPath();
    ctx.moveTo(12, -12);
    ctx.lineTo(26, -22);
    ctx.strokeStyle = '#ffd24d';
    ctx.lineWidth = 3;
    ctx.stroke();

    // small sparkle near antenna
    ctx.beginPath();
    ctx.fillStyle = '#fff8c6';
    ctx.arc(27, -23, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBulb(b) {
    ctx.save();
    // glow when lit
    if (b.lit) {
      const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, 90);
      g.addColorStop(0, 'rgba(255,245,200,0.95)');
      g.addColorStop(0.5, 'rgba(255,230,140,0.25)');
      g.addColorStop(1, 'rgba(255,230,140,0.02)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 88 * b.pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // glass bulb
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.lit ? '#fffbe2' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(60,60,60,0.06)';
    ctx.stroke();

    // filament animated
    ctx.save();
    ctx.beginPath();
    const wiggle = Math.sin(globalTime * 12 + b.id) * 2;
    ctx.moveTo(b.x - 8, b.y + wiggle);
    ctx.quadraticCurveTo(b.x - 4, b.y - 10 + wiggle, b.x, b.y);
    ctx.quadraticCurveTo(b.x + 4, b.y + 10 + wiggle, b.x + 8, b.y + wiggle);
    ctx.strokeStyle = b.lit ? '#ff9b2e' : '#888';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // base
    ctx.fillStyle = '#bdbdbd';
    drawRoundedRect(ctx, b.x - 12, b.y + b.r - 6, 24, 12, 3);
    ctx.fill();

    // highlight
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.ellipse(b.x - 8, b.y - 6, 6, 10, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBattery(b, highlight) {
    ctx.save();
    // shadow
    ctx.beginPath();
    ctx.ellipse(b.x + 10, b.y + 20, 40, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();

    // main metal gradient
    const grad = ctx.createLinearGradient(b.x - 30, b.y - 18, b.x + 30, b.y + 18);
    grad.addColorStop(0, '#ffd97a');
    grad.addColorStop(0.5, '#ffd24d');
    grad.addColorStop(1, '#f2c42f');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, b.x - 30, b.y - 18, 60, 36, 8);
    ctx.fill();

    // top terminal
    drawRoundedRect(ctx, b.x + 12, b.y - 10, 10, 20, 3);
    ctx.fillStyle = '#e6e9eb';
    ctx.fill();

    // metallic sheen
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.ellipse(b.x - 6, b.y - 6, 18, 10, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // number label with contrast
    ctx.fillStyle = '#073742';
    ctx.font = 'bold 16px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('+' + b.value, b.x, b.y + 6);

    // visual capacity bar showing relative value (for kids visual cue) - decor only
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    drawRoundedRect(ctx, b.x - 22, b.y + 20, 44, 6, 3);
    ctx.fill();

    const maxVal = 12;
    const w = Math.max(0, Math.min(44, (b.value / maxVal) * 44));
    ctx.fillStyle = '#33aaff';
    drawRoundedRect(ctx, b.x - 22, b.y + 20, w, 6, 3);
    ctx.fill();

    // highlight for selected battery
    if (!b.used && highlight) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // dim if used
    if (b.used) {
      ctx.globalAlpha = 0.38;
    }
    ctx.restore();
  }

  function drawHeaderPanel() {
    ctx.save();
    drawRoundedRect(ctx, 40, 18, WIDTH - 80, 62, 12);
    const grd = ctx.createLinearGradient(40, 18, WIDTH - 40, 80);
    grd.addColorStop(0, '#04494b');
    grd.addColorStop(1, '#0b8e96');
    ctx.fillStyle = grd;
    ctx.fill();
    // soft inner shadow
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    drawRoundedRect(ctx, 40, 18, WIDTH - 80, 12, 12);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#fff';
    ctx.font = '20px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Spark Circuit', 64, 44);
    ctx.font = '16px "Segoe UI", Arial';
    ctx.fillText(`Round ${currentRound} / ${totalRounds}`, WIDTH - 170, 44);
    ctx.font = '18px "Segoe UI", Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    if (gamePhase === 'playing') {
      ctx.fillText(`${givenAddend} + ? = ${roundTarget}`, WIDTH / 2, 69);
    } else {
      ctx.fillText('Click or press Space to begin', WIDTH / 2, 69);
    }
    ctx.restore();
  }

  function drawAudioIcon(rowY, colX) {
    const x = colX;
    const y = rowY;
    ctx.save();
    ctx.translate(x, y);
    drawRoundedRect(ctx, -38, -28, 76, 56, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    // speaker
    ctx.fillStyle = '#073742';
    ctx.beginPath();
    ctx.moveTo(-18, -8);
    ctx.lineTo(-2, -18);
    ctx.lineTo(-2, 18);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();
    // waves based on audio availability
    if (audioAvailable) {
      ctx.strokeStyle = '#33aaff';
      ctx.lineWidth = 2;
      const w = 10 + Math.sin(globalTime * 3) * 2;
      ctx.beginPath();
      ctx.arc(10, 0, w, -Math.PI / 6, Math.PI / 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(10, 0, w + 6, -Math.PI / 6, Math.PI / 6);
      ctx.stroke();
      ctx.font = '10px "Segoe UI", Arial';
      ctx.fillStyle = '#073742';
      ctx.textAlign = 'left';
      ctx.fillText('Audio On', 18, 4);
    } else {
      ctx.strokeStyle = 'rgba(200,40,40,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, -8);
      ctx.lineTo(18, 8);
      ctx.stroke();
      ctx.font = '10px "Segoe UI", Arial';
      ctx.fillStyle = '#073742';
      ctx.textAlign = 'left';
      ctx.fillText('Audio Unavailable', 18, 4);
    }
    ctx.restore();
  }

  // small utility to wrap long text in canvas
  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let testLine = '';
    let ty = y;
    for (let n = 0; n < words.length; n++) {
      const word = words[n];
      testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, ty);
        line = word + ' ';
        ty += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, ty);
  }

  // Main loop
  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = (ts - lastTime) / 16.666; // relative to 60fps
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Start loop
  requestAnimationFrame(loop);

  // Accessibility keyboard wiring
  container.addEventListener('keydown', onKeyDown);
  window.addEventListener('keydown', function (e) {
    const active = document.activeElement === container || document.activeElement === canvas;
    if (active) {
      onKeyDown(e);
    }
  });

  // Initial state
  gamePhase = 'intro';
  message = 'Welcome! Click or press Space to start.';

  // Minimal aria-live for assistive tech
  container.setAttribute('aria-live', 'polite');

  // Handle audio start on first interaction anywhere in container
  function userGestureStart() {
    safeResumeAudio();
    ensureBackgroundStarted();
    // connect bg nodes and start gently if not started
    if (audioAvailable && audioCtx && !bgStarted) {
      try {
        // ensure gain nodes exist and connect oscillators to destination
        // slight ramp up for comfort
        if (bgMainGain) {
          bgMainGain.gain.cancelScheduledValues(audioCtx.currentTime);
          bgMainGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
          bgMainGain.gain.linearRampToValueAtTime(0.035, audioCtx.currentTime + 0.8);
        }
      } catch (e) {
        console.warn('Background ramp error', e);
      }
    }
    // remove one-time listener
    container.removeEventListener('pointerdown', userGestureStart);
    container.removeEventListener('keydown', userGestureStart);
  }

  // Add one-time listeners to start audio on user action
  container.addEventListener('pointerdown', userGestureStart, { once: true });
  container.addEventListener('keydown', userGestureStart, { once: true });

  // Inform if audio unavailable
  if (!audioAvailable) {
    console.info('Audio is not available. The game will run silently.');
  }
})();