(function () {
  // Drone Math Adventure - Enhanced Visuals & Audio
  // Renders inside element with ID 'game-of-the-day-stage'
  // Uses only Canvas drawing and Web Audio API, no external assets.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_CORRECT = 10;
  const MAX_WRONG = 3;
  const PADDING = 12; // spacing for UI
  const BODY_FONT = '16px sans-serif';
  const IMPORTANT_FONT = '22px sans-serif';
  const TITLE_FONT = '30px sans-serif';
  const ANSWER_FONT = '20px sans-serif';

  // Get stage element
  const stage = document.getElementById('game-of-the-day-stage');
  if (!stage) {
    console.error('Element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear stage and set up
  stage.innerHTML = '';
  stage.style.position = 'relative';
  stage.style.width = WIDTH + 'px';
  stage.style.height = HEIGHT + 'px';

  // Accessibility live region
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  stage.appendChild(liveRegion);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('tabindex', '0'); // focusable
  canvas.style.outline = 'none';
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Audio setup with careful error handling
  let audioCtx = null;
  let masterGain = null;
  let ambientNodes = [];
  let audioEnabled = true;

  function safeCreateAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported');
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.18; // default gentle volume
      masterGain.connect(audioCtx.destination);
      return audioCtx;
    } catch (err) {
      console.warn('Audio context creation failed:', err);
      audioEnabled = false;
      audioCtx = null;
      masterGain = null;
      return null;
    }
  }

  // Create ambient pad with gentle modulation and filter
  function initAmbient() {
    if (!audioEnabled) return;
    if (!safeCreateAudioContext()) return;
    try {
      // small number of layered oscillators for warm pad
      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.04;
      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 900;
      padFilter.Q.value = 0.7;

      // slow LFO to modulate filter frequency
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06; // very slow
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      // two oscillators detuned
      const o1 = audioCtx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 110; // low
      const o1Gain = audioCtx.createGain();
      o1Gain.gain.value = 0.6;

      const o2 = audioCtx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 138.59; // a slightly detuned harmonic
      const o2Gain = audioCtx.createGain();
      o2Gain.gain.value = 0.35;

      // connect chain
      o1.connect(o1Gain);
      o2.connect(o2Gain);
      o1Gain.connect(padGain);
      o2Gain.connect(padGain);
      padGain.connect(padFilter);
      padFilter.connect(masterGain);

      // start
      o1.start();
      o2.start();
      lfo.start();

      ambientNodes.push({ o1, o2, lfo, padGain, padFilter });
    } catch (err) {
      console.warn('Ambient init failed:', err);
    }
  }

  // Safely stop ambient nodes
  function stopAmbient() {
    if (!audioCtx) return;
    try {
      for (const n of ambientNodes) {
        try { n.o1.stop(); } catch (e) {}
        try { n.o2.stop(); } catch (e) {}
        try { n.lfo.stop(); } catch (e) {}
      }
      ambientNodes = [];
    } catch (err) {
      console.warn('Error stopping ambient:', err);
    }
  }

  // Play a short tone created via oscillator and shaped envelope
  function playTone({ freq = 440, duration = 0.25, type = 'sine', attack = 0.01, release = 0.12, detune = 0 } = {}) {
    if (!audioEnabled || !safeCreateAudioContext()) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 5000;

      osc.type = type;
      osc.frequency.value = freq;
      if (detune) osc.detune.value = detune;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      const now = audioCtx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

      osc.start(now);
      osc.stop(now + duration + release + 0.05);
    } catch (err) {
      console.warn('playTone error:', err);
    }
  }

  // Play a pleasant bell/chime (correct answer) using two oscillators + short echo
  function playCorrectChime() {
    if (!audioEnabled || !safeCreateAudioContext()) return;
    try {
      const now = audioCtx.currentTime;
      // Create master gain for this chime
      const chGain = audioCtx.createGain();
      chGain.gain.value = 0.12;
      chGain.connect(masterGain);

      // simple delay for warm tail
      const delay = audioCtx.createDelay(1.0);
      delay.delayTime.value = 0.12;
      const fb = audioCtx.createGain();
      fb.gain.value = 0.35;
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(chGain);

      // main oscillator (bell)
      const oA = audioCtx.createOscillator();
      oA.type = 'sine';
      oA.frequency.value = 660;
      const gA = audioCtx.createGain();
      gA.gain.value = 1.0;

      const oB = audioCtx.createOscillator();
      oB.type = 'sine';
      oB.frequency.value = 880;
      const gB = audioCtx.createGain();
      gB.gain.value = 0.6;

      // mild bit of detune for shimmer
      oA.detune.value = -6;
      oB.detune.value = 8;

      // small lowpass filter for tone color
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;

      // connections
      oA.connect(gA);
      oB.connect(gB);
      gA.connect(lp);
      gB.connect(lp);
      lp.connect(chGain);
      lp.connect(delay);

      // envelopes
      const t0 = now;
      gA.gain.setValueAtTime(0.0001, t0);
      gA.gain.linearRampToValueAtTime(1.0, t0 + 0.02);
      gA.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);

      gB.gain.setValueAtTime(0.0001, t0);
      gB.gain.linearRampToValueAtTime(0.7, t0 + 0.03);
      gB.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);

      oA.start(t0);
      oB.start(t0);
      oA.stop(t0 + 1.6);
      oB.stop(t0 + 1.8);
    } catch (err) {
      console.warn('playCorrectChime error:', err);
    }
  }

  // Play a soft buzzer for incorrect answers
  function playIncorrectBuzz() {
    if (!audioEnabled || !safeCreateAudioContext()) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 220;

      osc.type = 'square';
      osc.frequency.value = 220;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch (err) {
      console.warn('playIncorrectBuzz error:', err);
    }
  }

  // Utility helpers
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  function generateQuestion() {
    // Randomly choose addition or subtraction, easy levels (do not change logic)
    const type = Math.random() < 0.6 ? 'add' : 'sub';
    if (type === 'add') {
      const a = randInt(1, 12);
      const b = randInt(1, 12);
      const answer = a + b;
      const options = makeOptions(answer, 4, 1, 24);
      return { text: `${a} + ${b} = ?`, answer, options };
    } else {
      let a = randInt(5, 20);
      let b = randInt(1, a - 1);
      const answer = a - b;
      const options = makeOptions(answer, 4, 0, 20);
      return { text: `${a} - ${b} = ?`, answer, options };
    }
  }

  function makeOptions(correct, count, min, max) {
    const set = new Set();
    set.add(correct);
    while (set.size < count) {
      const delta = randInt(-4, 4);
      const candidate = correct + delta;
      if (candidate >= min && candidate <= max) set.add(candidate);
    }
    const arr = Array.from(set);
    // shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Game State
  let state = {
    screen: 'start', // 'start', 'playing', 'win', 'lose'
    score: 0,
    wrong: 0,
    question: null,
    selectedIndex: 0,
    optionsBoxes: [],
    drones: [],
    clock: 0,
    audioOn: true,
    audioIconRect: null,
    startButton: null,
    restartButton: null,
  };

  // Create drones with more detail for visuals
  function createDrones() {
    state.drones = [];
    const colors = ['#FFB4C0', '#9ED7FF', '#FFF3A0', '#B9FFC9', '#D9B4FF'];
    for (let i = 0; i < 6; i++) {
      state.drones.push({
        x: Math.random() * WIDTH,
        y: 110 + Math.random() * 220,
        vx: 0.2 + Math.random() * 0.9,
        vy: Math.sin(Math.random() * Math.PI * 2) * 0.22,
        size: 22 + Math.random() * 18,
        color: colors[i % colors.length],
        rotorAng: Math.random() * Math.PI * 2,
        bobPhase: Math.random() * Math.PI * 2,
        parcelGlow: Math.random(),
      });
    }
  }

  createDrones();

  // Layout positions
  function layoutPositions() {
    const scorePos = { x: PADDING, y: PADDING };
    const livesPos = { x: WIDTH - PADDING, y: PADDING };
    const questionPos = { x: WIDTH / 2, y: 72 };
    const answersArea = { x: WIDTH / 2, y: 180, width: WIDTH - 2 * PADDING, height: 220 };
    const instructionPos = { x: WIDTH / 2, y: HEIGHT - 60 };
    return { scorePos, livesPos, questionPos, answersArea, instructionPos };
  }

  // Improved drawTextWithBackground with rounded background and drop shadow
  function drawTextWithBackground(text, font, x, y, align = 'left', textColor = '#000', bgColor = 'rgba(255,255,255,0.85)') {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = parseInt(font, 10) + 6;
    let bx = x;
    if (align === 'center') bx = x - textWidth / 2;
    else if (align === 'right') bx = x - textWidth;
    const padding = 10;

    // background with subtle shadow
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = bgColor;
    roundRect(ctx, bx - padding, y - padding / 2, textWidth + padding * 2, textHeight + padding, 8, true, false, bgColor);

    // text
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = textColor;
    ctx.fillText(text, x, y);
    ctx.restore();
    return { bx: bx - padding, by: y - padding / 2, bw: textWidth + padding * 2, bh: textHeight + padding };
  }

  // Background with layered parallax clouds and subtle hills
  function drawBackground(t) {
    // sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, '#E9F7FF');
    grad.addColorStop(0.6, '#F6FFF7');
    grad.addColorStop(1, '#FFFDF2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // layered distant hills (soft shapes)
    ctx.save();
    ctx.globalAlpha = 0.9;
    drawHill(0.4, '#E8F4E7', t * 0.0009, 40);
    drawHill(0.6, '#E0F0E0', t * 0.0006, 60);
    drawHill(0.8, '#D6EED6', t * 0.0003, 80);
    ctx.restore();

    // ground
    const groundY = HEIGHT - 76;
    ctx.fillStyle = '#F2FAF0';
    ctx.fillRect(0, groundY, WIDTH, 76);

    // soft grass stripes
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let gx = 0; gx < WIDTH; gx += 12) {
      ctx.fillStyle = gx % 24 === 0 ? '#EAF7E6' : '#F0FAF0';
      ctx.fillRect(gx, groundY + 44 + Math.sin((gx + t * 0.02) * 0.02) * 4, 12, 12);
    }
    ctx.restore();

    // moving clouds - several layers
    for (let i = 0; i < 7; i++) {
      const speed = 0.02 + (i % 3) * 0.01;
      const cx = ((t * speed) + i * 160) % (WIDTH + 260) - 130;
      const cy = 40 + ((i % 4) * 36) + Math.sin((t * 0.001) + i) * 6;
      drawCloud(cx, cy, 34 + (i % 3) * 14, 0.95 - (i % 3) * 0.12);
    }
  }

  function drawHill(offset, color, phase, height) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    const step = 30;
    for (let x = 0; x <= WIDTH; x += step) {
      const y = HEIGHT - height - Math.sin((x * 0.02) + phase * 30 + offset * 10) * 18;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCloud(cx, cy, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFFFFF';
    // soft layered clouds made of several arcs
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(
        cx + i * (size * 0.35),
        cy + Math.abs(i) * 4,
        size * 0.7 - Math.abs(i) * 6,
        size * 0.5 - Math.abs(i) * 4,
        i * 0.1,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw a polished drone with parcel and soft shadow
  function drawDrone(drone, t) {
    ctx.save();
    // bobbing motion
    const bob = Math.sin((t * 0.0015) + drone.bobPhase) * 6;
    let x = drone.x;
    let y = drone.y + bob;
    ctx.translate(x, y);

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(0, drone.size * 0.9, drone.size * 1.0, drone.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body with gradient
    const bodyRadiusX = drone.size * 1.2;
    const bodyRadiusY = drone.size * 0.8;
    const g = ctx.createLinearGradient(-bodyRadiusX, -bodyRadiusY, bodyRadiusX, bodyRadiusY);
    g.addColorStop(0, lighten(drone.color, 0.06));
    g.addColorStop(1, darken(drone.color, 0.06));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyRadiusX, bodyRadiusY, -0.08, 0, Math.PI * 2);
    ctx.fill();

    // rim
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // cockpit glass
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.ellipse(-drone.size * 0.2, -drone.size * 0.05, drone.size * 0.5, drone.size * 0.33, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // parcel hanging below
    ctx.save();
    const parcelY = drone.size * 0.9;
    // cords
    ctx.strokeStyle = 'rgba(80,80,80,0.35)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-drone.size * 0.35, drone.size * 0.35);
    ctx.lineTo(-drone.size * 0.35, parcelY);
    ctx.moveTo(drone.size * 0.35, drone.size * 0.35);
    ctx.lineTo(drone.size * 0.35, parcelY);
    ctx.stroke();

    // parcel box with subtle glow if active
    const parcelW = drone.size * 0.9;
    const parcelH = drone.size * 0.7;
    const glow = 0.08 + (Math.sin((t * 0.003) + drone.parcelGlow) + 1) * 0.03;
    ctx.fillStyle = `rgba(255, 250, 225, ${0.95})`;
    roundRect(ctx, -parcelW / 2, parcelY - parcelH / 2, parcelW, parcelH, 6, true, false, `rgba(255,250,225,${1})`);
    ctx.strokeStyle = `rgba(140, 110, 60, 0.9)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(-parcelW / 2, parcelY - parcelH / 2, parcelW, parcelH);
    ctx.restore();

    // rotors - two small arms with spinning blades
    const rotorOffset = drone.size * 0.95;
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * rotorOffset, -drone.size * 0.45);
      ctx.rotate(drone.rotorAng);
      // arm
      ctx.fillStyle = 'rgba(50,50,50,0.85)';
      roundRect(
        ctx,
        -drone.size * 0.06,
        -drone.size * 0.9,
        drone.size * 0.12,
        drone.size * 1.6,
        6,
        true,
        false,
        'rgba(50,50,50,0.85)'
      );
      // blades: translucent, fast
      for (let b = 0; b < 3; b++) {
        ctx.save();
        ctx.rotate((b / 3) * Math.PI * 2);
        ctx.fillStyle = 'rgba(30,30,30,0.55)';
        ctx.beginPath();
        ctx.ellipse(0, -drone.size * 1.05, drone.size * 0.12, drone.size * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // Helpers to lighten/darken color hex
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function lighten(hex, amt) {
    const c = hexToRgb(hex);
    const r = Math.min(255, Math.round(c.r + 255 * amt));
    const g = Math.min(255, Math.round(c.g + 255 * amt));
    const b = Math.min(255, Math.round(c.b + 255 * amt));
    return rgbToHex(r, g, b);
  }
  function darken(hex, amt) {
    const c = hexToRgb(hex);
    const r = Math.max(0, Math.round(c.r - 255 * amt));
    const g = Math.max(0, Math.round(c.g - 255 * amt));
    const b = Math.max(0, Math.round(c.b - 255 * amt));
    return rgbToHex(r, g, b);
  }

  // Draw UI elements with improved visuals
  function drawUI() {
    ctx.save();
    ctx.font = BODY_FONT;
    ctx.textBaseline = 'top';

    const pos = layoutPositions();

    // Small header bar
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    roundRect(ctx, 8, 8, WIDTH - 16, 46, 10, true, false, 'rgba(255,255,255,0.6)');
    ctx.restore();

    // Score top-left
    const scoreText = `Score: ${state.score}`;
    drawTextWithBackground(scoreText, BODY_FONT, pos.scorePos.x + 10, pos.scorePos.y + 10, 'left', '#033', 'rgba(255,255,255,0.0)');

    // Lives top-right
    const livesText = `Mistakes: ${state.wrong} / ${MAX_WRONG}`;
    ctx.font = BODY_FONT;
    const livesMetrics = ctx.measureText(livesText);
    const livesX = WIDTH - PADDING - 10;
    const livesBox = drawTextWithBackground(livesText, BODY_FONT, livesX, pos.livesPos.y + 10, 'right', '#331', 'rgba(255,255,255,0.0)');

    // Audio toggle icon (drawn speaker)
    const iconSize = 30;
    const iconX = livesBox.bx - PADDING - iconSize;
    const iconY = pos.livesPos.y + 8;
    drawSpeakerIcon(iconX, iconY, iconSize, state.audioOn);

    state.audioIconRect = { x: iconX, y: iconY, w: iconSize, h: iconSize };

    ctx.restore();
  }

  // Draw a speaker icon using canvas (no emoji)
  function drawSpeakerIcon(x, y, size, on) {
    ctx.save();
    // background rounded
    ctx.fillStyle = on ? 'rgba(80,200,120,0.95)' : 'rgba(180,180,180,0.95)';
    roundRect(ctx, x, y, size, size, 8, true, false, ctx.fillStyle);
    // speaker body
    const cx = x + size * 0.34;
    const cy = y + size * 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.18, cy - size * 0.18);
    ctx.lineTo(cx, cy - size * 0.18);
    ctx.lineTo(cx + size * 0.18, cy - size * 0.34);
    ctx.lineTo(cx + size * 0.18, cy + size * 0.34);
    ctx.lineTo(cx, cy + size * 0.18);
    ctx.lineTo(cx - size * 0.18, cy + size * 0.18);
    ctx.closePath();
    ctx.fill();
    // sound waves
    ctx.strokeStyle = on ? '#fff' : '#eee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + size * 0.22, cy, size * 0.22, -0.6, 0.6);
    ctx.stroke();
    if (on) {
      ctx.beginPath();
      ctx.arc(cx + size * 0.34, cy, size * 0.34, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw question and answer boxes with subtle animation
  function drawQuestionAndAnswers() {
    const pos = layoutPositions();
    ctx.save();
    // Question background bar
    ctx.font = IMPORTANT_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const q = state.question ? state.question.text : 'Press Start to begin';
    const qMetrics = ctx.measureText(q);
    const qPad = 14;
    roundRect(ctx, pos.questionPos.x - qMetrics.width / 2 - qPad, pos.questionPos.y - 6, qMetrics.width + qPad * 2, 42 + 10, 10, true, false, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = '#0B4';
    ctx.fillText(q, pos.questionPos.x, pos.questionPos.y + 8);
    ctx.restore();

    // Answers: two rows of two, with hover/selection highlights
    const opts = state.question ? state.question.options : [];
    state.optionsBoxes = [];
    const area = { x: WIDTH / 2 - 260, y: pos.questionPos.y + 62, w: 520, h: 220 };
    const boxW = 240;
    const boxH = 82;
    const gapX = 40;
    const gapY = 18;

    ctx.save();
    ctx.font = ANSWER_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < opts.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = area.x + col * (boxW + gapX);
      const by = area.y + row * (boxH + gapY);

      const isSelected = state.selectedIndex === i && state.screen === 'playing';
      const isHover = false; // reserved for possible hover logic

      // background gradient depending on selection
      const bg = ctx.createLinearGradient(bx, by, bx + boxW, by + boxH);
      if (isSelected) {
        bg.addColorStop(0, '#E6FFF0');
        bg.addColorStop(1, '#CFF5D9');
      } else {
        bg.addColorStop(0, '#FFFFFF');
        bg.addColorStop(1, '#FCFEFF');
      }
      roundRect(ctx, bx, by, boxW, boxH, 12, true, false, bg);

      // subtle shadow border
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

      // number badge
      ctx.fillStyle = isSelected ? '#2A7' : '#9AC';
      roundRect(ctx, bx + 8, by + 12, 28, 28, 8, true, false, ctx.fillStyle);
      ctx.fillStyle = '#033';
      ctx.font = '14px sans-serif';
      ctx.fillText(String(i + 1), bx + 22, by + 26);

      // answer text
      ctx.font = ANSWER_FONT;
      ctx.fillStyle = '#033';
      ctx.fillText(String(opts[i]), bx + boxW / 2 + 10, by + boxH / 2);
      state.optionsBoxes.push({ x: bx, y: by, w: boxW, h: boxH });
    }
    ctx.restore();
  }

  // Rounded rectangle helper
  function roundRect(ctx, x, y, w, h, r, fill, stroke, fillColor) {
    if (r < 0) r = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fillColor || '#fff';
      ctx.fill();
    }
    if (stroke) ctx.stroke();
  }

  // Draw overlays (start / end) with nicer cards and icons
  function drawOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(6,10,20,0.28)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  function drawStartScreen() {
    drawOverlay();
    ctx.save();
    ctx.font = TITLE_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#032';
    ctx.fillText('Drone Math Adventure', WIDTH / 2, 110);

    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = '#014';
    ctx.fillText('Help the friendly drones deliver parcels!', WIDTH / 2, 158);

    ctx.font = BODY_FONT;
    ctx.fillStyle = '#022';
    const lines = [
      'Goal: Answer 10 questions correctly.',
      `You can make up to ${MAX_WRONG} mistakes.`,
      'Use 1-4, arrow keys, or click answers. Press Enter to confirm.',
      'Press SPACE or click START to begin. Toggle sound with the speaker icon.',
    ];
    let y = 210;
    for (let line of lines) {
      const metrics = ctx.measureText(line);
      roundRect(ctx, WIDTH / 2 - metrics.width / 2 - 12, y - 6, metrics.width + 24, 28, 8, true, false, 'rgba(255,255,255,0.96)');
      ctx.fillStyle = '#012';
      ctx.fillText(line, WIDTH / 2, y);
      y += 36;
    }

    // Start button with subtle drop shadow
    const btnW = 160;
    const btnH = 56;
    const bx = WIDTH / 2 - btnW / 2;
    const by = y + 6;
    roundRect(ctx, bx, by, btnW, btnH, 12, true, false, '#6BC8FF');
    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = '#033';
    ctx.fillText('START', WIDTH / 2, by + 14);
    state.startButton = { x: bx, y: by, w: btnW, h: btnH };

    // small hint below
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#044';
    ctx.fillText('Tip: Listen for friendly chimes on correct answers', WIDTH / 2, by + btnH + 18);
    ctx.restore();
  }

  function drawEndScreen(win) {
    drawOverlay();
    ctx.save();
    ctx.font = TITLE_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = win ? '#0A6' : '#B02020';
    const title = win ? 'Hooray! Drones Delivered Everything!' : 'Oh no! Some parcels were missed';
    ctx.fillText(title, WIDTH / 2, 110);

    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = '#013';
    ctx.fillText(`Score: ${state.score}`, WIDTH / 2, 160);

    ctx.font = BODY_FONT;
    ctx.fillStyle = '#013';
    const message = win
      ? 'You guided the drones home with great math skill! Well done!'
      : 'Try again to help the drones practice and improve their deliveries.';
    const metrics = ctx.measureText(message);
    roundRect(ctx, WIDTH / 2 - metrics.width / 2 - 12, 210 - 6, metrics.width + 24, 28, 8, true, false, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = '#013';
    ctx.fillText(message, WIDTH / 2, 210);

    // Restart button
    const btnW = 180;
    const btnH = 56;
    const bx = WIDTH / 2 - btnW / 2;
    const by = 254;
    roundRect(ctx, bx, by, btnW, btnH, 12, true, false, '#FFD76B');
    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = '#333';
    ctx.fillText('PLAY AGAIN', WIDTH / 2, by + 14);
    state.restartButton = { x: bx, y: by, w: btnW, h: btnH };

    // keyboard hint
    ctx.font = BODY_FONT;
    ctx.fillStyle = '#024';
    ctx.fillText('Press R to restart', WIDTH / 2, by + btnH + 18);
    ctx.restore();
  }

  // Accessibility announcements
  function announceForAccessibility(text) {
    if (!liveRegion) return;
    liveRegion.textContent = '';
    // small delay to ensure screen readers notice changes
    setTimeout(() => {
      liveRegion.textContent = text;
    }, 100);
  }

  // Input handling
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    handleClick(mx, my);
    // Unlock audio on first interaction
    if (audioEnabled && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    canvas.focus();
  });

  function handleClick(mx, my) {
    if (state.screen === 'start') {
      const b = state.startButton;
      if (b && pointInRect(mx, my, b)) {
        startGame();
        return;
      }
    } else if (state.screen === 'playing') {
      // audio toggle
      if (state.audioIconRect && pointInRect(mx, my, state.audioIconRect)) {
        toggleAudio();
        return;
      }
      // click answer boxes
      for (let i = 0; i < state.optionsBoxes.length; i++) {
        if (pointInRect(mx, my, state.optionsBoxes[i])) {
          state.selectedIndex = i;
          submitAnswer();
          return;
        }
      }
    } else if (state.screen === 'win' || state.screen === 'lose') {
      const b = state.restartButton;
      if (b && pointInRect(mx, my, b)) {
        restartGame();
        return;
      }
    }
  }

  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // Keyboard controls
  canvas.addEventListener('keydown', (e) => {
    if (state.screen === 'start') {
      if (e.code === 'Space' || e.code === 'Enter') {
        startGame();
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'm') toggleAudio();
    } else if (state.screen === 'playing') {
      if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key, 10) - 1;
        if (state.question && idx < state.question.options.length) {
          state.selectedIndex = idx;
          submitAnswer();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (state.question) state.selectedIndex = (state.selectedIndex + state.question.options.length - 1) % state.question.options.length;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (state.question) state.selectedIndex = (state.selectedIndex + 1) % state.question.options.length;
      } else if (e.key === 'Enter') {
        submitAnswer();
      } else if (e.key.toLowerCase() === 'm') {
        toggleAudio();
      }
    } else if (state.screen === 'win' || state.screen === 'lose') {
      if (e.key.toLowerCase() === 'r' || e.code === 'Enter') {
        restartGame();
      }
      if (e.key.toLowerCase() === 'm') toggleAudio();
    }
  });

  // Toggle audio (init if necessary)
  function toggleAudio() {
    if (!audioCtx && audioEnabled) {
      safeCreateAudioContext();
      if (audioCtx) {
        initAmbient();
      } else {
        audioEnabled = false;
        state.audioOn = false;
        announceForAccessibility('Audio not available.');
        return;
      }
    }
    state.audioOn = !state.audioOn;
    if (audioCtx && masterGain) {
      masterGain.gain.value = state.audioOn ? 0.18 : 0;
    }
    if (state.audioOn) {
      // ensure ambient present
      if (audioEnabled && ambientNodes.length === 0) initAmbient();
    } else {
      // slowly silence ambient (we keep nodes but set master gain to 0 above)
    }
    announceForAccessibility(`Audio ${state.audioOn ? 'on' : 'off'}`);
  }

  // Game control functions (do not change mechanics)
  function startGame() {
    safeCreateAudioContext();
    if (audioEnabled && audioCtx) initAmbient();
    state.screen = 'playing';
    state.score = 0;
    state.wrong = 0;
    state.selectedIndex = 0;
    state.question = generateQuestion();
    announceForAccessibility('Game started. ' + state.question.text);
  }

  function restartGame() {
    state.screen = 'start';
    state.score = 0;
    state.wrong = 0;
    state.selectedIndex = 0;
    state.question = null;
    announceForAccessibility('Game restarted. Press start to play again.');
  }

  function submitAnswer() {
    if (!state.question) return;
    const chosen = state.question.options[state.selectedIndex];
    if (chosen === state.question.answer) {
      state.score += 1;
      // play pleasant chime
      if (state.audioOn) {
        playCorrectChime();
        // a small additional bright tone
        setTimeout(() => playTone({ freq: 980, duration: 0.12, type: 'sine', attack: 0.01 }), 120);
      }
      announceForAccessibility(`Correct! ${state.question.text.replace('= ?', `= ${chosen}`)}. Score ${state.score}.`);
      if (state.score >= TARGET_CORRECT) {
        state.screen = 'win';
        announceForAccessibility('You won! All packages delivered. Press R to play again.');
        return;
      }
    } else {
      state.wrong += 1;
      if (state.audioOn) playIncorrectBuzz();
      announceForAccessibility(`Oops, ${chosen} is not correct. ${state.question.text.replace('= ?', `= ${state.question.answer}`)}. Wrong ${state.wrong} of ${MAX_WRONG}.`);
      if (state.wrong >= MAX_WRONG) {
        state.screen = 'lose';
        announceForAccessibility('Game over. The drones need practice. Press R to try again.');
        return;
      }
    }
    // next question
    state.question = generateQuestion();
    state.selectedIndex = 0;
  }

  // Animation loop and update logic
  let lastTS = performance.now();
  function loop(ts) {
    const dt = ts - lastTS;
    lastTS = ts;
    state.clock += dt;
    update(dt / 1000);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // Move drones across screen with wrap-around
    for (let d of state.drones) {
      d.x += d.vx * dt * 80;
      d.rotorAng += 14 * dt * (0.8 + d.size * 0.02);
      d.y += Math.sin((state.clock * 0.002) + d.x * 0.01) * 0.15;
      if (d.x - d.size > WIDTH + 60) {
        d.x = -60 - d.size;
        d.y = 110 + Math.random() * 200;
      }
    }

    // If ambient is on and audio context suspended/resumed on user interaction, try to resume
    if (audioEnabled && audioCtx && audioCtx.state === 'suspended') {
      // attempt to resume silently, best-effort
      audioCtx.resume().catch(() => {});
    }
  }

  function render() {
    // clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // background
    drawBackground(state.clock);

    // draw drones behind UI
    for (let d of state.drones) drawDrone(d, state.clock);

    // UI bar and elements
    drawUI();

    // Question and answers or overlays
    if (state.screen === 'start') {
      drawQuestionAndAnswers(); // placeholders
      drawStartScreen();
    } else if (state.screen === 'playing') {
      drawQuestionAndAnswers();
      // bottom instruction
      const ipos = layoutPositions().instructionPos;
      ctx.save();
      ctx.font = BODY_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const instr = '1-4 or click an answer. Use arrows/Enter. Toggle sound with speaker icon';
      const metrics = ctx.measureText(instr);
      roundRect(ctx, ipos.x - metrics.width / 2 - 12, ipos.y - 8, metrics.width + 24, 28, 8, true, false, 'rgba(255,255,255,0.94)');
      ctx.fillStyle = '#012';
      ctx.fillText(instr, ipos.x, ipos.y);
      ctx.restore();
    } else if (state.screen === 'win') {
      drawQuestionAndAnswers();
      drawEndScreen(true);
    } else if (state.screen === 'lose') {
      drawQuestionAndAnswers();
      drawEndScreen(false);
    }

    // Overlap guard (ensure instruction not overlapping answers)
    ensureNoOverlap();
  }

  // Ensure no overlap between instruction and answers; if overlap, move instruction down a bit
  function ensureNoOverlap() {
    const pos = layoutPositions();
    ctx.font = BODY_FONT;
    const instr = state.screen === 'playing'
      ? '1-4 or click an answer. Use arrows/Enter. Toggle sound with speaker icon'
      : '';
    const metrics = ctx.measureText(instr);
    const instrRect = {
      x: pos.instructionPos.x - metrics.width / 2 - 12,
      y: pos.instructionPos.y - 8,
      w: metrics.width + 24,
      h: 28,
    };
    const answersRect = { x: WIDTH / 2 - 260, y: pos.questionPos.y + 62, w: 520, h: 220 };
    if (rectsOverlap(instrRect, answersRect)) {
      // redraw instruction just below answers area
      ctx.save();
      const newY = answersRect.y + answersRect.h + 8;
      roundRect(ctx, instrRect.x, newY, instrRect.w, instrRect.h, 8, true, false, 'rgba(255,255,255,0.95)');
      ctx.fillStyle = '#012';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(instr, pos.instructionPos.x, newY + 6);
      ctx.restore();
    }
  }

  function rectsOverlap(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  // Initialize audio on first user gesture if possible
  canvas.addEventListener('focus', () => {
    if (audioEnabled && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  });

  // Initial accessibility message
  announceForAccessibility('Welcome to Drone Math Adventure. Press Space to start.');

  // Start animation loop
  requestAnimationFrame(loop);

  // Expose some controls for debugging (optional)
  window._droneMathGame = {
    state,
    startGame,
    restartGame,
    toggleAudio,
  };
})();