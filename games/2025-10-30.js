(function () {
  // Drone Math Delivery - Canvas Game (Visual & Audio Enhancements)
  // For ages 7-9. Answer 10 math questions correctly to win.
  // 3 wrong answers = game over.
  // All rendering in a 720x480 canvas inside element with ID 'game-of-the-day-stage'.
  // Sounds are generated with the Web Audio API. Accessible via keyboard and mouse.
  'use strict';

  // CONFIG
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL_CORRECT = 10;
  const MAX_WRONG = 3;
  const MIN_BODY_FONT = 16; // ensure >=14px
  const IMPORTANT_FONT = 22; // ensure >=18px

  // Retrieve container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error("Container with id 'game-of-the-day-stage' not found. Cannot initialize game.");
    return;
  }

  // Clear container and add canvas
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.userSelect = 'none';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Drone math delivery game. Use number keys 1-3 to answer, arrow keys or tab to change selection, space or enter to select. Press M to mute/unmute. Press R to restart.'
  );
  canvas.style.display = 'block';
  canvas.style.background = '#e8f7ff';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Accessibility: make focusable
  canvas.tabIndex = 0;

  // Audio context setup with error handling
  let audioContext = null;
  let audioAllowed = false;
  let ambientGain = null;
  let ambientOsc = null;
  let masterGain = null;
  let noiseNode = null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
      // create master gain
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.8;
      masterGain.connect(audioContext.destination);
    } else {
      console.warn('Web Audio API not supported in this browser.');
    }
  } catch (e) {
    console.warn('Error creating AudioContext:', e);
    audioContext = null;
  }

  // Resumable audio on user gesture
  function ensureAudioAllowed() {
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
      audioContext
        .resume()
        .then(() => {
          audioAllowed = true;
          startAmbient();
        })
        .catch((e) => {
          console.warn('AudioContext resume failed:', e);
          audioAllowed = false;
        });
    } else {
      audioAllowed = true;
      startAmbient();
    }
  }

  // Ambient gentle wind + filtered noise + slow oscillator to create a calm techy hum
  function startAmbient() {
    if (!audioContext || ambientOsc || noiseNode) return;
    try {
      // gentle sine drone
      ambientOsc = audioContext.createOscillator();
      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = 110;

      const lfo = audioContext.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.18;

      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 8;
      lfo.connect(lfoGain);
      lfoGain.connect(ambientOsc.frequency);

      ambientGain = audioContext.createGain();
      ambientGain.gain.value = 0.02;

      ambientOsc.connect(ambientGain);
      ambientGain.connect(masterGain || audioContext.destination);

      ambientOsc.start();
      lfo.start();
      ambientOsc._lfo = lfo;
      ambientOsc._lfoGain = lfoGain;

      // create subtle filtered white noise (wind)
      try {
        const bufferSize = 2 * audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.25;
        noiseNode = audioContext.createBufferSource();
        noiseNode.buffer = buffer;
        noiseNode.loop = true;
        const noiseFilter = audioContext.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 900;
        const noiseGain = audioContext.createGain();
        noiseGain.gain.value = 0.02;
        noiseNode.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain || audioContext.destination);
        noiseNode.start();
        noiseNode._filter = noiseFilter;
        noiseNode._gain = noiseGain;
      } catch (e) {
        console.warn('Ambient noise creation failed:', e);
      }
    } catch (e) {
      console.warn('Failed to start ambient sound:', e);
      ambientOsc = null;
    }
  }

  function stopAmbient() {
    if (!audioContext) return;
    try {
      if (ambientOsc) {
        ambientOsc._lfo && ambientOsc._lfo.stop();
        ambientOsc.stop();
      }
    } catch (e) {
      /* ignore */
    }
    ambientOsc = null;
    ambientGain = null;
    try {
      if (noiseNode) {
        noiseNode.stop();
        noiseNode.disconnect();
      }
    } catch (e) {
      // ignore
    }
    noiseNode = null;
  }

  // Play short sound effects
  function playBeep({
    freq = 800,
    type = 'sine',
    duration = 0.12,
    gain = 0.15,
    attack = 0.01,
    decay = 0.08,
    filterFreq = null,
  } = {}) {
    if (!audioContext || !audioAllowed || muted) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      let node = osc;
      let filter = null;
      if (filterFreq) {
        filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        node.connect(filter);
        node = filter;
      }

      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.linearRampToValueAtTime(gain, now + attack);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration + decay);

      node.connect(gainNode);
      gainNode.connect(masterGain || audioContext.destination);

      osc.start(now);
      osc.stop(now + duration + decay + 0.05);
    } catch (e) {
      console.warn('playBeep failed:', e);
    }
  }

  function playSelect() {
    // soft click
    playBeep({ freq: 600, duration: 0.06, gain: 0.05, attack: 0.005 });
  }

  function playCorrect() {
    if (!audioContext || !audioAllowed || muted) return;
    try {
      const now = audioContext.currentTime;
      const notes = [880, 1100, 1320];
      notes.forEach((n, i) => {
        const osc = audioContext.createOscillator();
        osc.type = i === 1 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(n, now + i * 0.02);
        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.08 / (i + 1), now + 0.02 + i * 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4 + i * 0.06);
        // small highpass to keep clarity
        const hp = audioContext.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 400;
        osc.connect(hp);
        hp.connect(g);
        g.connect(masterGain || audioContext.destination);
        osc.start(now + i * 0.02);
        osc.stop(now + 0.5 + i * 0.06);
      });
    } catch (e) {
      console.warn('playCorrect failed:', e);
    }
  }

  function playWrong() {
    if (!audioContext || !audioAllowed || muted) return;
    // lower dull thud + short buzzer
    playBeep({ freq: 180, type: 'sawtooth', duration: 0.2, gain: 0.16, filterFreq: 900 });
    setTimeout(() => playBeep({ freq: 220, type: 'square', duration: 0.1, gain: 0.12 }), 120);
  }

  // Game state
  let score = 0;
  let wrong = 0;
  let currentQuestion = null;
  let options = [];
  let focusedOption = 0; // for keyboard focus
  let isPaused = false;
  let gameState = 'playing'; // 'playing', 'won', 'lost'
  let questionIndex = 0;

  // Drone visual state
  const drone = {
    x: WIDTH / 2,
    y: 160,
    vx: 0,
    bobPhase: 0,
    rotation: 0,
    rotTarget: 0,
    liftTween: 0, // animation state for celebratory lift
    hitShake: 0, // shake on wrong
  };

  // Floating clouds and balloons for background
  const floaters = [];
  for (let i = 0; i < 6; i++) {
    floaters.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT * 0.6,
      size: 30 + Math.random() * 40,
      speed: 0.2 + Math.random() * 0.6,
      type: Math.random() > 0.7 ? 'balloon' : 'cloud',
      wobble: Math.random() * Math.PI * 2,
      shift: Math.random() * 50,
    });
  }

  // Particles for confetti and sparks
  const particles = [];

  // Answer button boxes (will be computed)
  let answerBoxes = [];

  // Box animation states (scale for focus)
  let boxStates = [];

  // Generate a question (no changes to logic)
  function generateQuestion(index) {
    // Increase difficulty slowly
    const level = Math.min(5, Math.floor(index / 2) + 1);
    let a, b, op, answer;
    if (Math.random() < 0.6) {
      // addition/subtraction
      if (Math.random() < 0.5) {
        a = Math.floor(Math.random() * (10 * level)) + 1;
        b = Math.floor(Math.random() * Math.min(10 * level, a)) + 1;
        op = Math.random() < 0.5 ? '+' : '-';
        answer = op === '+' ? a + b : a - b;
      } else {
        a = Math.floor(Math.random() * (10 * level)) + 1;
        b = Math.floor(Math.random() * (10 * level)) + 1;
        op = '+';
        answer = a + b;
      }
    } else {
      // simple multiplication
      a = Math.floor(Math.random() * (level + 2)) + 2;
      b = Math.floor(Math.random() * 5) + 2;
      op = '×';
      answer = a * b;
    }

    // prepare options: one correct and two distractors
    const opts = new Set();
    opts.add(answer);
    while (opts.size < 3) {
      let delta;
      if (Math.random() < 0.6) {
        delta = Math.floor(Math.random() * 5) + 1;
      } else {
        delta = Math.floor(Math.random() * 10) + 1;
      }
      const sign = Math.random() < 0.5 ? -1 : 1;
      let candidate = answer + sign * delta;
      // avoid negative or equal
      if (candidate < 0) candidate = Math.abs(candidate) + 1;
      if (candidate === answer) candidate += 2;
      opts.add(candidate);
    }
    const optsArr = Array.from(opts);
    // shuffle
    for (let i = optsArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optsArr[i], optsArr[j]] = [optsArr[j], optsArr[i]];
    }
    return {
      text: `${a} ${op} ${b} = ?`,
      correct: answer,
      options: optsArr,
    };
  }

  function startNewQuestion() {
    currentQuestion = generateQuestion(questionIndex);
    options = currentQuestion.options;
    focusedOption = 0;
    // initialize box states
    boxStates = options.map(() => ({ scale: 1, highlight: 0 }));
    // compute answer boxes based on text sizes and layout rules.
    layoutAnswerBoxes();
  }

  function layoutAnswerBoxes() {
    // We'll draw question in center-top area, answers below in three boxes.
    // Ensure no overlap with drone (drone at y=160).
    answerBoxes = [];
    ctx.font = `${IMPORTANT_FONT}px sans-serif`;
    const questionText = currentQuestion ? currentQuestion.text : '';
    const qMetrics = ctx.measureText(questionText);
    const qW = Math.min(qMetrics.width, WIDTH - 40);

    // Compute answer box widths by measuring each option text.
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const padd = 16;
    const boxHe = 52;
    const gap = 18;
    const totalWidthEstimate =
      options.reduce((sum, opt) => {
        const w = ctx.measureText(String(opt)).width + padd * 2 + 22; // include icon space
        return sum + w;
      }, 0) + gap * (options.length - 1);

    let startX = Math.max(20, (WIDTH - totalWidthEstimate) / 2);
    const y = 260;
    // create boxes and ensure they don't overlap the drone area (drone at y=160 with size ~60)
    let finalY = y;
    const droneBottom = drone.y + 40;
    if (finalY < droneBottom + 20) finalY = droneBottom + 36;
    // Ensure finalY + boxHe doesn't overlap with bottom instructions area (reserve bottom 70px)
    const bottomReserve = 70;
    if (finalY + boxHe > HEIGHT - bottomReserve) finalY = HEIGHT - bottomReserve - boxHe - 10;

    for (let i = 0; i < options.length; i++) {
      const text = String(options[i]);
      const w = Math.max(92, ctx.measureText(text).width + padd * 2 + 22);
      const box = {
        x: startX,
        y: finalY,
        w,
        h: boxHe,
        text,
        index: i,
      };
      answerBoxes.push(box);
      startX += w + gap;
    }
  }

  // Input handling
  function handleOptionSelection(idx) {
    if (gameState !== 'playing') return;
    const chosen = options[idx];
    if (chosen === currentQuestion.correct) {
      score++;
      playCorrect();
      triggerCorrectVisuals();
    } else {
      wrong++;
      playWrong();
      triggerWrongVisuals();
    }
    questionIndex++;
    // animate drone rotation slightly toward chosen option
    drone.rotTarget = (idx - 1) * 0.18;
    // small lateral nudge
    drone.vx += (idx - 1) * 1.6;

    // Check end conditions
    if (score >= GOAL_CORRECT) {
      gameState = 'won';
      stopAmbient();
      // flourish sound and particles
      setTimeout(() => {
        // little celebratory sound
        playCorrect();
      }, 200);
    } else if (wrong >= MAX_WRONG) {
      gameState = 'lost';
      stopAmbient();
      // low thud
      playBeep({ freq: 140, type: 'sine', duration: 0.4, gain: 0.18 });
    } else {
      startNewQuestion();
    }
  }

  // Mouse interaction: click detection
  canvas.addEventListener('pointerdown', function (e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    ensureAudioAllowed();
    // Check answer boxes
    for (let box of answerBoxes) {
      if (cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h) {
        focusedOption = box.index;
        playSelect();
        handleOptionSelection(box.index);
        return;
      }
    }
    // Check speaker icon (top center small circle)
    const speakerX = WIDTH / 2;
    const speakerY = 30;
    const d = Math.hypot(cx - speakerX, cy - speakerY);
    if (d <= 14) {
      toggleAudioMute();
      return;
    }
    // If clicked on restart buttons in end screens
    if (gameState === 'won' || gameState === 'lost') {
      const btn = getRestartButtonRect();
      if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
        restartGame();
      }
    }
  });

  // Keyboard controls
  window.addEventListener('keydown', function (e) {
    // Provide keyboard access
    if (e.key === 'm' || e.key === 'M') {
      // toggle audio
      toggleAudioMute();
      e.preventDefault();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      restartGame();
      e.preventDefault();
      return;
    }
    if (gameState !== 'playing') {
      if (e.key === 'Enter' || e.key === ' ') {
        // restart if finished
        restartGame();
        e.preventDefault();
      }
      return;
    }
    ensureAudioAllowed();
    if (e.key === 'ArrowLeft') {
      focusedOption = (focusedOption - 1 + options.length) % options.length;
      playSelect();
      e.preventDefault();
      return;
    } else if (e.key === 'ArrowRight') {
      focusedOption = (focusedOption + 1) % options.length;
      playSelect();
      e.preventDefault();
      return;
    } else if (e.key === 'Tab') {
      // cycle focus
      focusedOption = (focusedOption + (e.shiftKey ? -1 : 1) + options.length) % options.length;
      playSelect();
      e.preventDefault();
      return;
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        focusedOption = idx;
        handleOptionSelection(idx);
      }
      e.preventDefault();
      return;
    } else if (e.key === 'Enter' || e.key === ' ') {
      playSelect();
      handleOptionSelection(focusedOption);
      e.preventDefault();
      return;
    }
  });

  // Keep track if audio muted
  let muted = false;
  function toggleAudioMute() {
    if (!audioContext) return;
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.8;
    // stop or start ambient accordingly
    if (muted) stopAmbient();
    else ensureAudioAllowed();
  }

  function getRestartButtonRect() {
    const w = 220;
    const h = 52;
    return {
      x: (WIDTH - w) / 2,
      y: HEIGHT / 2 + 60,
      w,
      h,
    };
  }

  function restartGame() {
    score = 0;
    wrong = 0;
    questionIndex = 0;
    gameState = 'playing';
    drone.x = WIDTH / 2;
    drone.y = 160;
    drone.vx = 0;
    drone.bobPhase = 0;
    drone.rotation = 0;
    drone.rotTarget = 0;
    drone.liftTween = 0;
    drone.hitShake = 0;
    particles.length = 0;
    ensureAudioAllowed();
    startNewQuestion();
  }

  // Visual effects triggers
  function triggerCorrectVisuals() {
    // drone lift
    drone.liftTween = 1.0;
    // spawn gentle confetti
    for (let i = 0; i < 18; i++) {
      particles.push({
        x: drone.x + (Math.random() - 0.5) * 40,
        y: drone.y + 10,
        vx: (Math.random() - 0.5) * 2,
        vy: -1 - Math.random() * 2,
        size: 6 + Math.random() * 6,
        life: 80 + Math.floor(Math.random() * 60),
        color: (['#ffd66b', '#9be7ff', '#ffd1d1', '#b6ffd6'])[Math.floor(Math.random() * 4)],
        type: 'confetti',
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  function triggerWrongVisuals() {
    // drone dips and shakes
    drone.hitShake = 1.0;
    drone.vx += (Math.random() - 0.5) * 4;
    // small spark particles
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: drone.x + (Math.random() - 0.5) * 40,
        y: drone.y + 6,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2,
        size: 4 + Math.random() * 3,
        life: 30 + Math.floor(Math.random() * 30),
        color: '#ffb3b3',
        type: 'spark',
      });
    }
  }

  // Drawing helpers
  function drawRoundedRect(x, y, w, h, r, style = '#000', fill = true) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = style;
      ctx.fill();
    } else {
      ctx.strokeStyle = style;
      ctx.stroke();
    }
  }

  function drawBackground() {
    // layered gradient sky with subtle radial sun
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#eaf8ff');
    sky.addColorStop(0.5, '#e3f6ff');
    sky.addColorStop(1, '#ffffff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft distant hills
    ctx.save();
    ctx.translate(0, 0);
    drawHill(-120, HEIGHT - 160, 420, '#dff3e6', 0.6);
    drawHill(100, HEIGHT - 140, 360, '#d1f2de', 0.9);
    drawHill(320, HEIGHT - 170, 500, '#c6ebd6', 0.7);
    ctx.restore();

    // sun
    const sunX = WIDTH - 100;
    const sunY = 80;
    const grd = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 90);
    grd.addColorStop(0, 'rgba(255,243,186,0.95)');
    grd.addColorStop(1, 'rgba(255,243,186,0.02)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 80, 0, Math.PI * 2);
    ctx.fill();

    // soft ground
    ctx.fillStyle = '#f6fff5';
    ctx.fillRect(0, HEIGHT - 60, WIDTH, 60);

    // draw floaters with parallax
    const time = performance.now() / 1000;
    for (let f of floaters) {
      const px = f.x + Math.sin(time * (0.2 + f.speed * 0.2) + f.wobble) * 8;
      const py = f.y + Math.cos(time * (0.15 + f.speed * 0.15) + f.shift) * 6;
      if (f.type === 'cloud') drawCloud(px, py, f.size, 0.95);
      else drawBalloon(px, py, f.size);
      // subtle vertical drift
      f.x += (f.type === 'cloud' ? -0.12 : 0.08) * f.speed;
      if (f.x < -120) f.x = WIDTH + Math.random() * 80;
      if (f.x > WIDTH + 120) f.x = -Math.random() * 80;
    }

    // soft vignette to focus center
    const vig = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 3, 120, WIDTH / 2, HEIGHT / 3, WIDTH);
    vig.addColorStop(0, 'rgba(0,0,0,0.00)');
    vig.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawHill(x, y, w, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const h = 60;
    ctx.quadraticCurveTo(x + w * 0.25, y - h, x + w * 0.5, y - 12);
    ctx.quadraticCurveTo(x + w * 0.75, y + h, x + w, y);
    ctx.lineTo(x + w, HEIGHT);
    ctx.lineTo(x, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCloud(cx, cy, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.6, size * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - size * 0.42, cy + 6, size * 0.4, size * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + size * 0.45, cy + 2, size * 0.36, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBalloon(cx, cy, size) {
    ctx.save();
    // string
    ctx.strokeStyle = 'rgba(80,80,80,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.6);
    ctx.quadraticCurveTo(cx + 6, cy + size * 1.0, cx, cy + size * 1.4);
    ctx.stroke();
    // balloon
    const g = ctx.createLinearGradient(cx - size * 0.6, cy - size * 0.6, cx + size * 0.6, cy + size * 0.6);
    g.addColorStop(0, '#fff1f1');
    g.addColorStop(1, '#ffd1d1');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.5, size * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDrone() {
    // bobbing effect
    drone.bobPhase += 0.03;
    // apply lift or shake damping
    if (drone.liftTween > 0) {
      drone.liftTween -= 0.02;
      drone.y -= 0.6; // lift up
    } else {
      // normal bob
      drone.y += Math.sin(drone.bobPhase) * 0.12;
    }
    if (drone.hitShake > 0) {
      drone.hitShake -= 0.03;
      drone.y += Math.sin(performance.now() / 60) * 0.6;
      // small rotation jitter
      drone.rotation += (Math.random() - 0.5) * 0.02;
    }

    drone.x += drone.vx;
    drone.vx *= 0.92;

    // slowly relax rotation towards rotTarget
    drone.rotation += (drone.rotTarget - drone.rotation) * 0.06;

    // Keep drone within bounds
    drone.x = Math.max(80, Math.min(WIDTH - 80, drone.x));

    // draw drone with stylized lines and package
    const x = drone.x;
    const y = drone.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(drone.rotation);

    // shadow
    ctx.fillStyle = 'rgba(20,20,20,0.06)';
    ctx.beginPath();
    ctx.ellipse(0, 42, 52, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // rotor blur rings
    const t = performance.now() / 120;
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * 56, -6);
      const blur = Math.abs(Math.sin(t + i));
      ctx.fillStyle = `rgba(255,255,255,${0.35 * blur})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 28 + blur * 6, 6 + blur * 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // main body
    // pod shadow
    ctx.fillStyle = '#f6c86b';
    drawRoundedRect(-66, -22, 132, 44, 14, '#f6c86b', true);

    // panel
    ctx.fillStyle = '#ffd66b';
    drawRoundedRect(-60, -18, 120, 36, 12, '#ffd66b', true);

    // cockpit gloss
    ctx.fillStyle = '#7fe9ff';
    ctx.beginPath();
    ctx.ellipse(16, -6, 30, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(4, -12, 10, 6, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // friendly eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(8, -8, 6, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(22, -8, 6, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.ellipse(10, -6, 2.8, 2.8, 0, 0, Math.PI * 2);
    ctx.ellipse(24, -6, 2.8, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // small antenna
    ctx.strokeStyle = '#7a4d20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -20);
    ctx.lineTo(-10, -30);
    ctx.stroke();
    ctx.fillStyle = '#ff7a7a';
    ctx.beginPath();
    ctx.arc(-10, -32, 3, 0, Math.PI * 2);
    ctx.fill();

    // landing skids
    ctx.strokeStyle = '#7a4d20';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-40, 28);
    ctx.lineTo(-14, 28);
    ctx.moveTo(14, 28);
    ctx.lineTo(40, 28);
    ctx.stroke();

    // package hanging below
    ctx.save();
    const pkgY = 36 + Math.sin(performance.now() / 180) * 2;
    ctx.translate(0, pkgY);
    // strap
    ctx.strokeStyle = '#9b6b3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -30);
    ctx.lineTo(-10, -6);
    ctx.moveTo(10, -30);
    ctx.lineTo(10, -6);
    ctx.stroke();
    // box
    ctx.fillStyle = '#f2e3c8';
    drawRoundedRect(-20, -6, 40, 30, 6, '#f2e3c8', true);
    ctx.strokeStyle = '#d7c3a0';
    ctx.lineWidth = 1;
    ctx.strokeRect(-20, -6, 40, 30);
    // little label
    ctx.fillStyle = '#ffd66b';
    drawRoundedRect(-8, 0, 16, 10, 3, '#ffd66b', true);
    ctx.restore();

    // propeller arms and blades
    ctx.fillStyle = '#9fb5c9';
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * 56, -6);
      ctx.rotate(Math.sin(t + i) * 0.6);
      // arm
      ctx.fillStyle = '#9fb5c9';
      drawRoundedRect(-4, -2, 48, 6, 3, '#9fb5c9', true);
      // prop disc
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(28, 0, 8, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.beginPath();
      ctx.ellipse(28, 0, 24, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // Text boxes must not overlap. We'll layout UI carefully.
  function drawUI() {
    // Score top-left
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const padding = 12;
    const scoreText = `Score: ${score}/${GOAL_CORRECT}`;
    const scoreW = Math.ceil(ctx.measureText(scoreText).width) + padding * 2;
    const scoreBox = { x: 12, y: 12, w: scoreW, h: 36 };
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    drawRoundedRect(scoreBox.x, scoreBox.y, scoreBox.w, scoreBox.h, 8, ctx.fillStyle, true);
    ctx.fillStyle = '#123a4a';
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    ctx.fillText(scoreText, scoreBox.x + padding, scoreBox.y + 24);

    // Lives top-right
    const livesText = `Misses: ${wrong}/${MAX_WRONG}`;
    const livesW = Math.ceil(ctx.measureText(livesText).width) + padding * 2;
    const livesBox = { x: WIDTH - livesW - 12, y: 12, w: livesW, h: 36 };
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    drawRoundedRect(livesBox.x, livesBox.y, livesBox.w, livesBox.h, 8, ctx.fillStyle, true);
    ctx.fillStyle = '#123a4a';
    ctx.fillText(livesText, livesBox.x + padding, livesBox.y + 24);

    // Audio status - top center
    const speakerX = WIDTH / 2;
    const speakerY = 30;
    // background circle
    ctx.beginPath();
    ctx.arc(speakerX, speakerY, 14, 0, Math.PI * 2);
    ctx.fillStyle = audioContext ? (muted ? '#ffd6d6' : '#e6ffef') : '#f2f2f2';
    ctx.fill();
    ctx.strokeStyle = '#d6d6d6';
    ctx.stroke();
    // small speaker icon
    ctx.fillStyle = '#123a4a';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(audioContext ? (muted ? 'Audio Off (M)' : 'Audio On (M)') : 'Audio Unavailable', speakerX, speakerY + 4);
    ctx.textAlign = 'start';

    // Instructions bottom-center
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const instructions = 'Use 1-3 keys or arrow keys + Enter to answer. Press M to toggle audio, R to restart.';
    const instrW = ctx.measureText(instructions).width;
    const instrX = (WIDTH - instrW) / 2;
    const instrY = HEIGHT - 28;
    // put background rectangle behind instructions
    drawRoundedRect(instrX - 12, instrY - 20, instrW + 24, 40, 10, 'rgba(255,255,255,0.92)', true);
    ctx.fillStyle = '#123a4a';
    ctx.fillText(instructions, instrX, instrY - 6);

    // Question text in center top area
    ctx.font = `${IMPORTANT_FONT}px sans-serif`;
    const qText = currentQuestion ? currentQuestion.text : '';
    const qW = Math.min(ctx.measureText(qText).width, WIDTH - 40);
    const qX = (WIDTH - qW) / 2 - 12;
    const qY = 200 - 64;
    drawRoundedRect(qX, qY - 6, qW + 24, 52, 12, 'rgba(255,255,255,0.94)', true);
    ctx.fillStyle = '#0e3742';
    ctx.textAlign = 'center';
    ctx.fillText(qText, WIDTH / 2, qY + 30);
    ctx.textAlign = 'start';
  }

  // Draw answer options
  function drawAnswers() {
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    for (let i = 0; i < answerBoxes.length; i++) {
      const box = answerBoxes[i];
      // animate scale and highlight
      const state = boxStates[i] || { scale: 1, highlight: 0 };
      // make focus scale slightly larger
      const targetScale = i === focusedOption ? 1.03 : 1.0;
      state.scale += (targetScale - state.scale) * 0.12;
      state.highlight += ((i === focusedOption ? 1 : 0) - state.highlight) * 0.12;
      boxStates[i] = state;

      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(state.scale, state.scale);
      ctx.translate(-cx, -cy);

      // background
      const base = i === focusedOption ? '#e8fbff' : '#ffffff';
      const grad = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
      if (i === focusedOption) {
        grad.addColorStop(0, '#f4feff');
        grad.addColorStop(1, '#e8fbff');
      } else {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#fafafa');
      }
      drawRoundedRect(box.x, box.y, box.w, box.h, 10, grad, true);

      // subtle border
      ctx.strokeStyle = i === focusedOption ? '#7fd6ff' : 'rgba(100,100,100,0.16)';
      ctx.lineWidth = i === focusedOption ? 2 : 1;
      drawRoundedRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10, ctx.strokeStyle, false);

      // small icon on left (package)
      const iconX = box.x + 12;
      const iconY = box.y + box.h / 2;
      ctx.fillStyle = '#ffd66b';
      drawRoundedRect(iconX - 12, iconY - 12, 24, 24, 5, '#ffd66b', true);
      ctx.fillStyle = '#d7b57a';
      ctx.fillRect(iconX - 8, iconY - 4, 16, 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.strokeRect(iconX - 12, iconY - 12, 24, 24);

      // text
      ctx.fillStyle = '#0e3742';
      ctx.font = `${MIN_BODY_FONT}px sans-serif`;
      const txtX = box.x + 40;
      const txtY = box.y + box.h / 2 + 6;
      ctx.fillText((i + 1) + '. ' + box.text, txtX, txtY);

      // landing pad shadow below
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#eef8ff';
      ctx.beginPath();
      ctx.ellipse(box.x + box.w / 2, box.y + box.h + 12, box.w / 3, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      ctx.restore();
    }
  }

  // Draw particles
  function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      // physics
      p.vy += 0.06 * (p.type === 'confetti' ? 0.2 : 0.4);
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.type === 'confetti') {
        p.rot += p.rotSpeed;
      }
      // draw
      ctx.save();
      ctx.globalAlpha = Math.max(0.12, Math.min(1, p.life / 120));
      if (p.type === 'confetti') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (p.life <= 0 || p.y > HEIGHT + 40 || p.x < -40 || p.x > WIDTH + 40) {
        particles.splice(i, 1);
      }
    }
  }

  // End screens
  function drawEndScreen() {
    // dim and continue background elements
    ctx.fillStyle = 'rgba(6, 20, 28, 0.35)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const title = gameState === 'won' ? 'Delivery Complete!' : 'Game Over';
    ctx.font = '36px sans-serif';
    ctx.fillStyle = '#ffffff';
    const titleW = ctx.measureText(title).width;
    ctx.fillText(title, (WIDTH - titleW) / 2, HEIGHT / 2 - 20);

    ctx.font = `${IMPORTANT_FONT}px sans-serif`;
    const msg =
      gameState === 'won'
        ? `You answered ${score} questions! Nice work.`
        : `You had ${wrong} misses. Try again to make more deliveries!`;
    ctx.fillStyle = '#ffffff';
    const mW = ctx.measureText(msg).width;
    ctx.fillText(msg, (WIDTH - mW) / 2, HEIGHT / 2 + 12);

    // Restart button
    const btn = getRestartButtonRect();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd66b';
    drawRoundedRect(btn.x, btn.y, btn.w, btn.h, 12, ctx.fillStyle, true);
    ctx.restore();
    ctx.fillStyle = '#123a4a';
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const btnText = 'Restart (R)';
    const btnTextW = ctx.measureText(btnText).width;
    ctx.fillText(btnText, btn.x + (btn.w - btnTextW) / 2, btn.y + btn.h / 2 + 6);
  }

  // Main update and render loop
  function updateAndRender() {
    // update drone slight movement towards center
    drone.x += (WIDTH / 2 - drone.x) * 0.02;

    // damping for rot target easing
    drone.rotTarget *= 0.99;

    // Draw everything
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawDrone();
    drawUI();
    drawAnswers();
    updateAndDrawParticles();

    // If ended, show overlay
    if (gameState === 'won' || gameState === 'lost') {
      drawEndScreen();
    }

    requestAnimationFrame(updateAndRender);
  }

  // Initialize first question and start loop
  startNewQuestion();
  updateAndRender();

  // initial audio resume on first user gesture for browser autoplay policies
  function onFirstInteraction() {
    ensureAudioAllowed();
    window.removeEventListener('pointerdown', onFirstInteraction);
    window.removeEventListener('keydown', onFirstInteraction);
  }
  window.addEventListener('pointerdown', onFirstInteraction);
  window.addEventListener('keydown', onFirstInteraction);

  // Provide accessible error handling: if audio fails, show small toast inside canvas, logged to console
  if (!audioContext) {
    console.warn('AudioContext unavailable. Sounds will be disabled.');
    // show small message briefly
    setTimeout(() => {
      const oldFont = ctx.font;
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      drawRoundedRect(12, HEIGHT - 90, 260, 38, 8, 'rgba(0,0,0,0.5)', true);
      ctx.fillStyle = '#fff';
      ctx.fillText('Audio not available in this browser.', 22, HEIGHT - 63);
      ctx.font = oldFont;
    }, 400);
  }

  // Provide a small animation to hint keyboard controls if inactive
  let idleTimer = null;
  function startIdleHint() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // show hint by pulsing focused option briefly
      focusedOption = (focusedOption + 1) % Math.max(1, options.length);
      playSelect();
    }, 8000);
  }
  window.addEventListener('mousemove', startIdleHint);
  window.addEventListener('keydown', startIdleHint);
  window.addEventListener('pointerdown', startIdleHint);
  startIdleHint();

  // Safety: ensure text does not overlap by measuring layout on question changes.
  // Already handled by startNewQuestion/layoutAnswerBoxes.

  // Export nothing; all inside closure.
})();