(function () {
  // Enhanced Educational Drone Math Game (Visuals & Audio Upgrades)
  // Renders into the existing element with id "game-of-the-day-stage"
  // Canvas dimensions: 720 x 480
  // Game mechanics unchanged.

  // --------------------------
  // Configuration and State
  // --------------------------
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 10;
  const TARGET_CORRECT = 10;
  const MAX_WRONG = 3;
  const FONT_BODY = '16px "Segoe UI", Roboto, Arial, sans-serif';
  const FONT_LARGE = '22px "Segoe UI", Roboto, Arial, sans-serif';
  const FONT_BIG = '28px "Segoe UI", Roboto, Arial, sans-serif';

  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Missing container element with id "game-of-the-day-stage". Game cannot start.');
    return;
  }

  // Clear container and create canvas
  container.innerHTML = '';
  container.setAttribute('role', 'application');
  container.setAttribute(
    'aria-label',
    'Drone math game. Use number keys 1-3 or click answers. Press M to toggle sound. Press R to restart.'
  );
  container.style.outline = 'none';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Math game canvas showing drone and interactive math questions.'
  );
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Offscreen live region for screen readers
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  container.appendChild(liveRegion);

  // --------------------------
  // Audio Setup using Web Audio API (improved ambient, with proper error handling)
  // --------------------------
  let audioCtx = null;
  let masterGain = null;
  let ambientGain = null;
  let ambientLowOsc = null;
  let ambientHighOsc = null;
  let ambientFilter = null;
  let soundEnabled = true;
  let audioAvailable = true;

  function initAudioContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        audioAvailable = false;
        console.warn('Web Audio API not supported in this browser.');
        return;
      }
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.55;
      masterGain.connect(audioCtx.destination);

      // create a gentle ambient pad using two detuned oscillators and a lowpass filter
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0.02;

      ambientFilter = audioCtx.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 700;
      ambientFilter.Q.value = 0.8;

      // Low drone
      ambientLowOsc = audioCtx.createOscillator();
      ambientLowOsc.type = 'sine';
      ambientLowOsc.frequency.value = 110;

      // High gentle sine
      ambientHighOsc = audioCtx.createOscillator();
      ambientHighOsc.type = 'sine';
      ambientHighOsc.frequency.value = 220;

      // subtle LFO to modulate filter cutoff
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(ambientFilter.frequency);

      ambientLowOsc.connect(ambientGain);
      ambientHighOsc.connect(ambientGain);
      ambientGain.connect(ambientFilter);
      ambientFilter.connect(masterGain);

      ambientLowOsc.start();
      ambientHighOsc.start();
      lfo.start();
    } catch (e) {
      audioAvailable = false;
      console.error('Error initializing AudioContext:', e);
    }
  }

  function resumeAudioIfNeeded() {
    if (!audioAvailable || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('AudioContext resume failed:', e);
      });
    }
  }

  // Play a tone with safe audio-context usage
  function playTone({
    frequency = 440,
    duration = 0.25,
    type = 'sine',
    gain = 0.08,
    attack = 0.005,
    detune = 0,
    delay = 0,
    filter = null,
  }) {
    if (!audioAvailable || !audioCtx || !soundEnabled) return;
    try {
      const now = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      osc.detune.value = detune;

      // optional filter
      let outNode = g;
      if (filter && filter.type) {
        try {
          const f = audioCtx.createBiquadFilter();
          f.type = filter.type;
          if (filter.freq) f.frequency.value = filter.freq;
          if (filter.Q) f.Q.value = filter.Q;
          osc.connect(f);
          f.connect(g);
        } catch (e) {
          osc.connect(g);
        }
      } else {
        osc.connect(g);
      }

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + attack + duration);

      g.connect(masterGain);
      osc.start(now);
      osc.stop(now + attack + duration + 0.05);
    } catch (e) {
      console.warn('playTone error:', e);
    }
  }

  // richer correct sound with small chord and rising sparkle; also spawn particles
  function playCorrectSound() {
    if (!audioAvailable || !audioCtx || !soundEnabled) return;
    try {
      // short arpeggio
      playTone({ frequency: 880, duration: 0.09, type: 'triangle', gain: 0.045, detune: -5 });
      playTone({ frequency: 660, duration: 0.15, type: 'sine', gain: 0.04, delay: 0.07 });
      playTone({ frequency: 990, duration: 0.12, type: 'sine', gain: 0.03, delay: 0.14 });
      // soft bell
      playTone({
        frequency: 1320,
        duration: 0.18,
        type: 'sine',
        gain: 0.02,
        delay: 0.2,
        filter: { type: 'highpass', freq: 600 },
      });
    } catch (e) {
      console.warn('playCorrectSound error:', e);
    }
    // visual pulse and particles
    audioPulse = 1.2;
    spawnParticles(true);
  }

  // wrong sound: soft buzz + rumble
  function playWrongSound() {
    if (!audioAvailable || !audioCtx || !soundEnabled) return;
    try {
      playTone({ frequency: 200, duration: 0.28, type: 'sawtooth', gain: 0.12 });
      // low rumble
      playTone({ frequency: 80, duration: 0.45, type: 'sine', gain: 0.06, detune: -20 });
      playTone({ frequency: 140, duration: 0.18, type: 'square', gain: 0.05, delay: 0.12 });
    } catch (e) {
      console.warn('playWrongSound error:', e);
    }
    audioPulse = 0.9;
    spawnParticles(false);
  }

  // --------------------------
  // Game Variables
  // --------------------------
  let question = null;
  let answers = [];
  let correctIndex = 0;
  let score = 0;
  let wrong = 0;
  let elapsed = 0;
  let lastTime = 0;
  let propellerAngle = 0;
  let running = true;
  let showVictory = false;
  let showGameOver = false;
  let shaking = 0;
  let audioPulse = 0; // visual pulse for audio feedback
  let autoplayHintTimer = 0;

  // Pointer interaction states
  let hoverIndex = -1;
  let pressedIndex = -1;

  // Particle system for subtle celebrations and errors
  const particles = [];

  // Answer button layout
  const answerButtons = [
    { x: 110, y: 320, w: 160, h: 70 },
    { x: 280, y: 320, w: 160, h: 70 },
    { x: 450, y: 320, w: 160, h: 70 },
  ];

  // Initialize audio context (may require user gesture to resume)
  initAudioContext();

  // --------------------------
  // Utilities: Math Questions for age 7-9 (unchanged)
  // --------------------------
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateQuestion() {
    const types = ['add', 'sub', 'mul', 'bond'];
    const type = types[randomInt(0, types.length - 1)];

    let q = '';
    let correct = 0;

    if (type === 'add') {
      const a = randomInt(3, 18);
      const b = randomInt(1, 12);
      correct = a + b;
      q = `${a} + ${b} = ?`;
    } else if (type === 'sub') {
      let a = randomInt(7, 20);
      let b = randomInt(1, 6);
      if (b > a) [a, b] = [b, a];
      correct = a - b;
      q = `${a} − ${b} = ?`;
    } else if (type === 'mul') {
      const a = randomInt(2, 6);
      const b = randomInt(2, 6);
      correct = a * b;
      q = `${a} × ${b} = ?`;
    } else {
      const total = Math.random() < 0.6 ? 10 : 20;
      const a = randomInt(1, Math.min(8, total - 1));
      correct = total - a;
      q = `${a} + ? = ${total}`;
    }

    const wrongs = new Set();
    while (wrongs.size < 6) {
      const delta = randomInt(-4, 5);
      const candidate = correct + delta;
      if (candidate >= 0 && candidate !== correct) wrongs.add(candidate);
    }
    const wrongArray = Array.from(wrongs);
    const choices = [];
    correctIndex = randomInt(0, 2);
    for (let i = 0; i < 3; i++) {
      if (i === correctIndex) choices.push(correct);
      else choices.push(wrongArray.pop());
    }

    return { q, choices, correctIndex, correct };
  }

  function nextQuestion() {
    const qobj = generateQuestion();
    question = qobj.q;
    answers = qobj.choices;
    correctIndex = qobj.correctIndex;
    // hint animation
    autoplayHintTimer = 0.6;
  }

  // --------------------------
  // Drawing Helpers (Enhanced visuals)
  // --------------------------
  function clear() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
  }

  function drawRoundedRect(x, y, w, h, r, fillStyle, strokeStyle, shadow) {
    ctx.save();
    if (shadow) {
      ctx.shadowColor = shadow.color || 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = shadow.blur || 8;
      ctx.shadowOffsetX = shadow.x || 0;
      ctx.shadowOffsetY = shadow.y || 2;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fillStyle) {
      // support gradient object
      if (fillStyle && fillStyle.type === 'grad') {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        fillStyle.stops.forEach((s) => g.addColorStop(s.offset, s.color));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = fillStyle;
      }
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTopUI() {
    ctx.font = FONT_LARGE;
    ctx.textBaseline = 'top';
    // Score box
    const scoreText = `Score: ${score}/${TARGET_CORRECT}`;
    const scoreWidth = ctx.measureText(scoreText).width;
    const scorePadding = 10;
    const scoreBgW = scoreWidth + scorePadding * 2;
    const scoreBgH = 38;
    const scoreX = PADDING;
    const scoreY = PADDING;

    drawRoundedRect(
      scoreX,
      scoreY,
      scoreBgW,
      scoreBgH,
      10,
      { type: 'grad', stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#e7fbff' }] },
      '#2d4f5f',
      { color: 'rgba(0,0,0,0.08)', blur: 8, x: 0, y: 2 }
    );
    ctx.fillStyle = '#08364a';
    ctx.fillText(scoreText, scoreX + scorePadding, scoreY + 7);

    // Lives top-right
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrong)}`;
    const livesWidth = ctx.measureText(livesText).width;
    const livesBgW = livesWidth + scorePadding * 2;
    const livesBgH = 38;
    const livesX = WIDTH - PADDING - livesBgW;
    const livesY = PADDING;

    drawRoundedRect(
      livesX,
      livesY,
      livesBgW,
      livesBgH,
      10,
      { type: 'grad', stops: [{ offset: 0, color: '#fff5f5' }, { offset: 1, color: '#fff0f0' }] },
      '#3a2b2b',
      { color: 'rgba(0,0,0,0.08)', blur: 8, x: 0, y: 2 }
    );
    ctx.fillStyle = '#8b0000';
    ctx.fillText(livesText, livesX + scorePadding, livesY + 7);

    // Audio indicator just left of lives (visual cue)
    const audioX = livesX - 48;
    const audioY = PADDING + 6;
    drawRoundedRect(
      audioX - 6,
      audioY - 6,
      46,
      30,
      8,
      'rgba(255,255,255,0.9)',
      '#333',
      { color: 'rgba(0,0,0,0.08)', blur: 6, x: 0, y: 2 }
    );
    ctx.save();
    ctx.translate(audioX, audioY + 6);
    // speaker shape
    ctx.fillStyle = soundEnabled ? '#157F0A' : '#9A9A9A';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(8, 2);
    ctx.lineTo(16, -2);
    ctx.lineTo(16, 18);
    ctx.lineTo(8, 14);
    ctx.lineTo(0, 14);
    ctx.closePath();
    ctx.fill();

    // animated wave
    ctx.strokeStyle = soundEnabled ? '#157F0A' : '#9A9A9A';
    ctx.lineWidth = 2;
    if (soundEnabled) {
      ctx.beginPath();
      const r = 6 + Math.sin(audioPulse * Math.PI) * 3;
      ctx.arc(20, 8, r, -0.7, 0.7);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(20, 2);
      ctx.lineTo(32, 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Parallax clouds and subtle horizon elements
  function drawBackground() {
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#E6F8FF');
    g.addColorStop(0.5, '#F3FBFF');
    g.addColorStop(1, '#F8FFF9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // distant soft sun
    ctx.save();
    ctx.globalAlpha = 0.12;
    const sunX = WIDTH - 120;
    const sunY = 80;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 120);
    sunGrad.addColorStop(0, '#fff7c7');
    sunGrad.addColorStop(1, 'rgba(255,215,140,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // soft rolling hills / horizon
    ctx.save();
    ctx.translate(0, HEIGHT - 84);
    ctx.fillStyle = '#dff3ff';
    ctx.fillRect(0, 0, WIDTH, 84);
    // layered hills shapes
    ctx.fillStyle = '#e6f7ff';
    ctx.beginPath();
    ctx.moveTo(0, 60);
    ctx.quadraticCurveTo(120, 10 + Math.sin(elapsed) * 4, 240, 60);
    ctx.quadraticCurveTo(360, 110, 480, 40);
    ctx.quadraticCurveTo(600, 0, 720, 60);
    ctx.lineTo(720, 84);
    ctx.lineTo(0, 84);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // moving clouds (parallax)
    drawCloud(80 + Math.sin(elapsed * 0.2) * 20, 70 + Math.cos(elapsed * 0.3) * 6, 64, 16, '#ffffff', '#e9f6ff');
    drawCloud(560 + Math.sin(elapsed * 0.15) * 12, 60 + Math.sin(elapsed * 0.1) * 8, 80, 20, '#fff8ff', '#eaf5ff');
    drawCloud(420 + Math.cos(elapsed * 0.12) * 14, 140 + Math.sin(elapsed * 0.18) * 6, 52, 12, '#ffffff', '#eefaff');
    drawCloud(260 + Math.cos(elapsed * 0.14) * 10, 40 + Math.sin(elapsed * 0.11) * 5, 44, 10, '#ffffff', '#eff8ff');
  }

  function drawCloud(cx, cy, size, puff, color, shade) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    // soft shadow for clouds
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = shade || '#e8f6ff';
    ctx.beginPath();
    const count = 6 + Math.floor(size / 14);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const rx = cx + Math.cos(angle) * (size * 0.5) * (0.8 + Math.random() * 0.4);
      const ry = cy + Math.sin(angle) * (size * 0.25) * (0.9 + Math.random() * 0.25);
      ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, size * 0.18 + Math.random() * (puff * 0.18), 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color || '#fff';
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.ellipse(cx - size * 0.06, cy, size * 0.82, size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawDrone(x, y) {
    ctx.save();
    // subtle hover bob + shake
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (shaking > 0) {
      shakeOffsetX = Math.sin(shaking * 50 + elapsed * 40) * 6 * shaking;
      shakeOffsetY = Math.cos(shaking * 40 + elapsed * 30) * 3 * shaking;
    }
    ctx.translate(x + shakeOffsetX, y + shakeOffsetY);

    // Body with layered shading
    const bodyW = 140;
    const bodyH = 64;
    const bodyX = -bodyW / 2;
    const bodyY = -bodyH / 2;
    // body shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.16)';
    ctx.shadowBlur = 12;
    drawRoundedRect(bodyX - 2, bodyY + 6, bodyW + 4, bodyH + 12, 18, '#000000', null);
    ctx.restore();

    // gradient body
    const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
    bodyGrad.addColorStop(0, '#FFEFBD');
    bodyGrad.addColorStop(1, '#FFD27F');
    drawRoundedRect(bodyX, bodyY, bodyW, bodyH, 16, bodyGrad, '#3b2f1f');

    // window with inner reflection
    ctx.fillStyle = '#AEE9FF';
    ctx.beginPath();
    ctx.ellipse(0, -6, 36, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#06607a';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.ellipse(-8, -12, 12, 6, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // rotor arms and propellers: spinning blur + translucent blade arcs
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(side * (bodyW / 2 + 4), -18);
      const spin = propellerAngle * side;
      // arm
      ctx.fillStyle = '#dfeaff';
      ctx.fillRect(-6, -6, 12, 32);

      // hub
      ctx.beginPath();
      ctx.fillStyle = '#1d2f3a';
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      // blades: draw multiple translucent rotated ellipses for motion blur
      const bladeCount = 6;
      for (let b = 0; b < bladeCount; b++) {
        const t = spin + (b / bladeCount) * Math.PI * 2;
        ctx.save();
        ctx.rotate(t);
        ctx.globalAlpha = 0.12 + 0.02 * b;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(0, -36 + b * 0.5, 36 - b * 2.5, 8 - b * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }

    // face details
    ctx.fillStyle = '#3b2f1f';
    ctx.beginPath();
    ctx.arc(-14, 6, 3, 0, Math.PI * 2);
    ctx.arc(14, 6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#3b2f1f';
    ctx.lineWidth = 1.5;
    ctx.arc(0, 18, 10, 0, Math.PI, false);
    ctx.stroke();

    // small package holder beneath
    ctx.fillStyle = '#fff4e6';
    ctx.fillRect(-26, 28, 52, 26);
    ctx.strokeStyle = '#7b4a23';
    ctx.strokeRect(-26, 28, 52, 26);
    ctx.fillStyle = '#7b4a23';
    ctx.fillText('pkg', -10, 32);

    ctx.restore();
  }

  function drawQuestionArea() {
    ctx.font = FONT_BIG;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#073B4C';
    const qText = `Question: ${question}`;
    const qWidth = ctx.measureText(qText).width;
    const bgW = Math.min(qWidth + 48, WIDTH - 160);
    const bgH = 48;
    const qX = (WIDTH - bgW) / 2;
    const qY = 90;
    drawRoundedRect(
      qX,
      qY,
      bgW,
      bgH,
      12,
      { type: 'grad', stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#f0fbff' }] },
      '#1a4b61',
      { color: 'rgba(0,0,0,0.06)', blur: 10, x: 0, y: 2 }
    );
    ctx.fillStyle = '#042b33';
    ctx.fillText(qText, qX + 18, qY + 10);
  }

  function drawAnswerButtons() {
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'middle';
    answers.forEach((ans, i) => {
      const b = answerButtons[i];
      const hovered = hoverIndex === i;
      const pressed = pressedIndex === i;
      const isHint = autoplayHintTimer > 0 && i === correctIndex;

      // scale and shadow on hover/press
      const scale = pressed ? 0.98 : hovered ? 1.03 : 1.0;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // background
      const base = isHint
        ? { type: 'grad', stops: [{ offset: 0, color: '#f7fff6' }, { offset: 1, color: '#e8fff0' }] }
        : { type: 'grad', stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#f6fbff' }] };
      drawRoundedRect(b.x, b.y, b.w, b.h, 12, base, hovered ? '#0b3248' : '#203b4b', {
        color: 'rgba(0,0,0,0.08)',
        blur: 10,
        x: 0,
        y: 3,
      });

      // subtle icon circle for index
      const iconX = b.x + 28;
      const iconY = b.y + b.h / 2;
      ctx.beginPath();
      ctx.fillStyle = '#0b3248';
      ctx.arc(iconX, iconY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText(String(i + 1), iconX - 6, iconY - 9 + 14 / 2);

      // answer text
      ctx.fillStyle = '#052F3A';
      ctx.font = FONT_BODY;
      const valText = String(ans);
      const valWidth = ctx.measureText(valText).width;
      ctx.fillText(valText, b.x + b.w / 2 - valWidth / 2 + 12, b.y + b.h / 2);

      // small check hint glow for correct choice during autoplay hint
      if (isHint && autoplayHintTimer > 0) {
        const glowAlpha = 0.25 * (autoplayHintTimer / 0.6);
        ctx.fillStyle = `rgba(20,120,40,${glowAlpha})`;
        ctx.fillRect(b.x + 6, b.y + b.h - 8, b.w - 12, 6);
      }
      ctx.restore();
    });
  }

  function drawProgressStars() {
    const startX = WIDTH / 2 - (TARGET_CORRECT * 18) / 2;
    const y = 56;
    for (let i = 0; i < TARGET_CORRECT; i++) {
      const x = startX + i * 18;
      ctx.save();
      ctx.translate(x, y);
      const outerR = 7;
      const innerR = 3.2;
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const a1 = (p * 2 * Math.PI) / 5 - Math.PI / 2;
        const a2 = a1 + Math.PI / 5;
        const x1 = Math.cos(a1) * outerR;
        const y1 = Math.sin(a1) * outerR;
        const x2 = Math.cos(a2) * innerR;
        const y2 = Math.sin(a2) * innerR;
        if (p === 0) ctx.moveTo(x1, y1);
        else ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fillStyle = i < score ? '#FFD54A' : 'rgba(200,200,200,0.35)';
      ctx.fill();
      ctx.strokeStyle = '#8b6b00';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBottomInstructions() {
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'top';
    const lines = [
      'Controls: Click an answer or press 1, 2, 3. Press M to toggle sound. Press R to restart.',
      'Goal: Answer 10 questions correctly. Too many wrong answers (3) and the drone returns home (game over).',
    ];
    const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bgW = maxWidth + 28;
    const x = (WIDTH - bgW) / 2;
    const y = HEIGHT - 74;
    drawRoundedRect(
      x,
      y,
      bgW,
      68,
      10,
      { type: 'grad', stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#f4fbff' }] },
      '#2e4a59',
      { color: 'rgba(0,0,0,0.06)', blur: 8, x: 0, y: 2 }
    );
    ctx.fillStyle = '#052F3A';
    lines.forEach((line, idx) => {
      ctx.fillText(line, x + 14, y + 8 + idx * 22);
    });
  }

  function drawVictoryScreen() {
    // overlay with soft confetti background
    ctx.save();
    ctx.fillStyle = 'rgba(6, 30, 22, 0.88)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // celebratory big text
    ctx.font = '32px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#fff9e6';
    const txt = 'Victory! The drone delivered all the packages!';
    const w = ctx.measureText(txt).width;
    ctx.fillText(txt, WIDTH / 2 - w / 2, HEIGHT / 2 - 60);

    ctx.font = FONT_LARGE;
    ctx.fillStyle = '#e6ffe9';
    const sub = `You answered ${score} correctly. Press R to play again.`;
    const sw = ctx.measureText(sub).width;
    ctx.fillText(sub, WIDTH / 2 - sw / 2, HEIGHT / 2 - 10);

    // small glowing button hint to press R
    ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#dfffe9';
    const hint = 'Press R to restart';
    const hw = ctx.measureText(hint).width;
    drawRoundedRect(
      WIDTH / 2 - hw / 2 - 12,
      HEIGHT / 2 + 24,
      hw + 24,
      34,
      8,
      '#0b4b33',
      '#dfffe9',
      { color: 'rgba(0,0,0,0.25)', blur: 8, x: 0, y: 2 }
    );
    ctx.fillStyle = '#eafff3';
    ctx.fillText(hint, WIDTH / 2 - hw / 2, HEIGHT / 2 + 30);
    ctx.restore();
  }

  function drawGameOverScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(35, 6, 10, 0.95)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = '30px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#ffdede';
    const txt = 'Game Over — the drone had to return home!';
    const w = ctx.measureText(txt).width;
    ctx.fillText(txt, WIDTH / 2 - w / 2, HEIGHT / 2 - 60);

    ctx.font = FONT_LARGE;
    ctx.fillStyle = '#ffdfdf';
    const sub = `Correct answers: ${score}. Press R to try again.`;
    const sw = ctx.measureText(sub).width;
    ctx.fillText(sub, WIDTH / 2 - sw / 2, HEIGHT / 2 - 10);

    ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
    const hint = 'Press R to restart';
    const hw = ctx.measureText(hint).width;
    drawRoundedRect(
      WIDTH / 2 - hw / 2 - 12,
      HEIGHT / 2 + 24,
      hw + 24,
      34,
      8,
      '#5a1f1f',
      '#ffdede',
      { color: 'rgba(0,0,0,0.25)', blur: 8, x: 0, y: 2 }
    );
    ctx.fillStyle = '#ffdede';
    ctx.fillText(hint, WIDTH / 2 - hw / 2, HEIGHT / 2 + 30);
    ctx.restore();
  }

  // --------------------------
  // Particle system
  // --------------------------
  function spawnParticles(success) {
    const count = success ? 16 : 12;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (1 + Math.random() * 2) * (success ? 1.6 : 1.2);
      particles.push({
        x: 180 + Math.sin(elapsed) * 6 + (Math.random() - 0.5) * 40,
        y: 200 + Math.cos(elapsed * 0.6) * 6 + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 1.2,
        life: 0.9 + Math.random() * 0.8,
        size: 3 + Math.random() * 4,
        color: success ? randomChoice(['#FFD54A', '#A5E06B', '#90E0FF', '#FFB4C6']) : '#FF7A7A',
        spin: (Math.random() - 0.5) * 8,
      });
    }
  }

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += 18 * dt; // gravity
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
    }
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / 1.2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // --------------------------
  // Game Logic (unchanged core behavior)
  // --------------------------
  function answerSelected(index) {
    if (!running) return;
    resumeAudioIfNeeded();
    if (index === correctIndex) {
      score++;
      liveAnnounce(`Correct! Score ${score}`);
      playCorrectSound();
      audioPulse = 1;
      if (score >= TARGET_CORRECT) {
        showVictory = true;
        running = false;
        liveAnnounce('Victory! You completed the game.');
        return;
      } else {
        nextQuestion();
      }
    } else {
      wrong++;
      liveAnnounce(`Oops. Wrong answer. ${Math.max(0, MAX_WRONG - wrong)} lives left.`);
      playWrongSound();
      shaking = 0.6;
      if (wrong >= MAX_WRONG) {
        showGameOver = true;
        running = false;
        liveAnnounce('Game over. The drone returned home.');
        return;
      }
    }
  }

  function liveAnnounce(text) {
    liveRegion.textContent = text;
  }

  // --------------------------
  // Input Handling (improved pointer interactions)
  // --------------------------
  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;

    // toggle sound if click near audio icon area top-right
    ctx.font = FONT_LARGE;
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrong)}`;
    const livesWidth = ctx.measureText(livesText).width;
    const livesBgW = livesWidth + 8 * 2;
    const livesX = WIDTH - PADDING - livesBgW;
    const audioX = livesX - 48;
    const audioRect = { x: audioX - 6, y: PADDING, w: 46, h: 30 };

    if (mx >= audioRect.x && mx <= audioRect.x + audioRect.w && my >= audioRect.y && my <= audioRect.y + audioRect.h) {
      toggleSound();
      return;
    }

    // check answer button clicks
    for (let i = 0; i < answerButtons.length; i++) {
      const b = answerButtons[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        answerSelected(i);
        return;
      }
    }

    // restart if on end screens and clicking center
    if (!running) {
      // clicking anywhere triggers instruction to restart via key or restart function
      liveAnnounce('Press R to restart the game.');
    }
  });

  // more responsive pointer handling: hover, down, up
  canvas.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    let found = -1;
    for (let i = 0; i < answerButtons.length; i++) {
      const b = answerButtons[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        found = i;
        break;
      }
    }
    hoverIndex = found;
  });

  canvas.addEventListener('mousedown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    for (let i = 0; i < answerButtons.length; i++) {
      const b = answerButtons[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        pressedIndex = i;
        break;
      }
    }
  });

  canvas.addEventListener('mouseup', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    let clicked = -1;
    for (let i = 0; i < answerButtons.length; i++) {
      const b = answerButtons[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        clicked = i;
        break;
      }
    }
    if (clicked !== -1 && clicked === pressedIndex) {
      answerSelected(clicked);
    }
    pressedIndex = -1;
  });

  function toggleSound() {
    soundEnabled = !soundEnabled;
    liveAnnounce(soundEnabled ? 'Sound on' : 'Sound off');
    if (audioAvailable && audioCtx) {
      if (masterGain) masterGain.gain.value = soundEnabled ? 0.55 : 0.0;
    }
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.key >= '1' && ev.key <= '3') {
      const idx = parseInt(ev.key, 10) - 1;
      answerSelected(idx);
      resumeAudioIfNeeded();
      ev.preventDefault();
    } else if (ev.key.toLowerCase() === 'm') {
      toggleSound();
    } else if (ev.key.toLowerCase() === 'r') {
      restartGame();
    }
  });

  // --------------------------
  // Restart and Initialization
  // --------------------------
  function restartGame() {
    score = 0;
    wrong = 0;
    elapsed = 0;
    lastTime = performance.now();
    propellerAngle = 0;
    running = true;
    showVictory = false;
    showGameOver = false;
    shaking = 0;
    audioPulse = 0;
    particles.length = 0;
    nextQuestion();
    liveAnnounce('Game restarted. Answer the question. Good luck!');
    resumeAudioIfNeeded();
  }

  // --------------------------
  // Animation Loop
  // --------------------------
  function update(dt) {
    elapsed += dt;
    propellerAngle += dt * 10; // slightly faster rotation for blur effect
    if (shaking > 0) {
      shaking -= dt * 0.9;
      if (shaking < 0) shaking = 0;
    }
    if (audioPulse > 0) {
      audioPulse -= dt * 1.1;
      if (audioPulse < 0) audioPulse = 0;
    }
    if (autoplayHintTimer > 0) {
      autoplayHintTimer -= dt;
    }
    // update particles
    updateParticles(dt);
  }

  function render() {
    clear();
    drawBackground();
    drawTopUI();
    drawProgressStars();
    drawQuestionArea();
    drawAnswerButtons();
    drawBottomInstructions();

    // draw drone in center-left
    const droneX = 180 + Math.sin(elapsed) * 6;
    const droneY = 200 + Math.cos(elapsed * 0.6) * 6;
    drawDrone(droneX, droneY);

    // floating packages / cute icons near right with slight bob
    for (let i = 0; i < 4; i++) {
      const sx = 520 + i * 36;
      const sy = 150 + Math.sin(elapsed * 1.1 + i) * 8;
      ctx.save();
      ctx.fillStyle = '#FFDFBA';
      ctx.fillRect(sx, sy, 22, 18, 4);
      ctx.strokeStyle = '#7b4a23';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, 22, 18);
      ctx.fillStyle = '#7b4a23';
      ctx.font = 'bold 14px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillText('+', sx + 6, sy + 2);
      ctx.restore();
    }

    // particles on top
    drawParticles();

    // visual audio pulse overlay in top-left (gentle)
    if (audioPulse > 0 && soundEnabled) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(30,140,60,${0.06 * audioPulse})`;
      ctx.beginPath();
      ctx.arc(60, 60, 52 + audioPulse * 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // subtle screen flash on wrong
    if (shaking > 0 && wrong > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.08, shaking * 0.08);
      ctx.fillStyle = '#ffefef';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }

    if (showVictory) {
      drawVictoryScreen();
    } else if (showGameOver) {
      drawGameOverScreen();
    }
  }

  function loop(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (running) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // --------------------------
  // Start Game
  // --------------------------
  try {
    nextQuestion();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  } catch (e) {
    console.error('Error starting game loop:', e);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#000';
    ctx.font = FONT_LARGE;
    const msg = 'An error occurred starting the game. Please reload the page.';
    ctx.fillText(msg, 20, 20);
  }

  // Expose a few functions for debugging in console (non-essential)
  window._droneMathGame = {
    restart: restartGame,
    toggleSound,
    getState: () => ({ score, wrong, running, showVictory, showGameOver }),
  };
})();