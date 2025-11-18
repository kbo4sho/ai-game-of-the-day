(function () {
  // Enhanced Drone Math Adventure (Visuals & Audio improvements only)
  // Game renders inside element with id "game-of-the-day-stage".
  // All drawing via canvas and all audio via Web Audio API.
  // No external assets. Keeps original game mechanics and math logic.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL = 10;
  const MAX_WRONG = 3;
  const ANSWER_COUNT = 4;
  const PADDING = 12; // min 10px required

  // Get stage element
  const stage = document.getElementById('game-of-the-day-stage');
  if (!stage) {
    console.error('Cannot find element with id "game-of-the-day-stage". Game will not start.');
    return;
  }

  // Clear children and ensure container has correct size
  stage.innerHTML = '';
  stage.style.width = WIDTH + 'px';
  stage.style.height = HEIGHT + 'px';
  stage.style.position = 'relative';
  stage.style.userSelect = 'none';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // make focusable for keyboard controls
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Drone math game. Answer math questions by clicking or pressing keys 1 to 4. Press M to toggle sound, R to restart.'
  );
  canvas.style.outline = 'none';
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // HiDPI support
  function fixHiDPICanvas() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    canvas.style.width = WIDTH + 'px';
    canvas.style.height = HEIGHT + 'px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  fixHiDPICanvas();

  // Audio context creation with error handling
  let audioCtx = null;
  let audioAllowed = true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio API not supported');
    audioCtx = new AudioContext();
    // Some browsers require resume on user gesture; start suspended and resume later on first interaction.
    if (audioCtx.state !== 'running') {
      audioCtx.suspend().catch(() => {});
    }
  } catch (e) {
    audioCtx = null;
    audioAllowed = false;
    console.warn('Audio unavailable:', e);
  }

  // Sound manager using oscillators, gain nodes, and simple noise
  const Sound = {
    masterGain: null,
    ambientGain: null,
    ambientNodes: [],
    enabled: true,
    init() {
      if (!audioCtx) return;
      try {
        this.masterGain = audioCtx.createGain();
        this.masterGain.gain.value = 0.75;
        this.masterGain.connect(audioCtx.destination);

        // Ambient pad (two oscillators slightly detuned)
        const g = audioCtx.createGain();
        g.gain.value = 0.02;
        g.connect(this.masterGain);
        this.ambientGain = g;

        const oscA = audioCtx.createOscillator();
        oscA.type = 'sine';
        oscA.frequency.value = 110; // low warm tone
        const oscB = audioCtx.createOscillator();
        oscB.type = 'sine';
        oscB.frequency.value = 132; // detuned
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(g);
        oscA.start();
        oscB.start();
        this.ambientNodes.push(oscA, oscB, filter);
      } catch (err) {
        console.error('Error initializing audio nodes:', err);
        audioAllowed = false;
      }
    },

    async resumeIfNeeded() {
      if (!audioCtx) return Promise.resolve();
      if (audioCtx.state === 'running') return Promise.resolve();
      try {
        await audioCtx.resume();
      } catch (e) {
        console.warn('Audio resume failed:', e);
      }
    },

    // Small pleasant arpeggio for correct answers
    playCorrect() {
      if (!audioAllowed || !this.enabled || !audioCtx) return;
      try {
        const now = audioCtx.currentTime;
        const base = 660;
        const times = [0, 0.08, 0.18];
        const freqs = [base, base * 1.25, base * 1.5];
        for (let i = 0; i < freqs.length; i++) {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          const f = audioCtx.createBiquadFilter();
          o.type = i % 2 === 0 ? 'triangle' : 'sine';
          o.frequency.setValueAtTime(freqs[i], now + times[i]);
          g.gain.setValueAtTime(0.0001, now + times[i]);
          g.gain.exponentialRampToValueAtTime(0.12, now + times[i] + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + times[i] + 0.28 + i * 0.04);
          f.type = 'lowpass';
          f.frequency.value = 3000;
          o.connect(f);
          f.connect(g);
          g.connect(this.masterGain);
          o.start(now + times[i]);
          o.stop(now + times[i] + 0.4 + i * 0.06);
        }
      } catch (e) {
        console.warn('playCorrect error:', e);
      }
    },

    // Low thud and brief dissonant wobble for incorrect
    playIncorrect() {
      if (!audioAllowed || !this.enabled || !audioCtx) return;
      try {
        const now = audioCtx.currentTime;
        // thud
        const o1 = audioCtx.createOscillator();
        const g1 = audioCtx.createGain();
        o1.type = 'sawtooth';
        o1.frequency.setValueAtTime(130, now);
        g1.gain.setValueAtTime(0.0001, now);
        g1.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
        g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        o1.connect(g1);
        g1.connect(this.masterGain);
        o1.start(now);
        o1.stop(now + 0.6);

        // wobble noise (short)
        const bufferSize = 4096;
        const noise = audioCtx.createBufferSource();
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
        noise.buffer = buffer;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.linearRampToValueAtTime(0.06, now + 0.01);
        noiseGain.gain.linearRampToValueAtTime(0.0001, now + 0.18);
        noise.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.22);
      } catch (e) {
        console.warn('playIncorrect error:', e);
      }
    },

    // Small click for UI interactions
    clickTone() {
      if (!audioAllowed || !this.enabled || !audioCtx) return;
      try {
        const now = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(880, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.09, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        o.connect(g);
        g.connect(this.masterGain);
        o.start(now);
        o.stop(now + 0.1);
      } catch (e) {
        console.warn('clickTone error:', e);
      }
    },

    toggle() {
      this.enabled = !this.enabled;
    }
  };

  if (audioAllowed) Sound.init();

  // Game state (kept unchanged)
  let score = 0;
  let wrongs = 0;
  let question = null;
  let choices = [];
  let gameState = 'start'; // start, playing, win, gameover
  let droneX = 80;
  let droneY = HEIGHT / 2;
  let bobOffset = 0;
  let hoverTime = 0;
  let lastAnswerTime = 0;
  let flashy = 0;
  let muteVisualFlash = 0;
  let audioUnavailable = !audioAllowed;

  // Buttons for answers
  const buttons = []; // each: {x,y,w,h,label,index}
  let hoveredButton = -1;

  // Particles for visual feedback (sparks, smoke)
  const particles = [];

  // Colors and palettes (more lively)
  const palette = {
    skyTop: '#A9E7FF',
    skyBottom: '#DFF7FF',
    cloud: '#FFFFFF',
    drone: '#FF7B6B',
    prop: '#2E7FB2',
    accent: '#FFD66B',
    text: '#073042',
    button: '#6EE7C6',
    buttonDark: '#54C9A1',
    wrong: '#FF6B6B',
    win: '#57D68F',
    board: '#FFFFFF',
    hill1: '#91D57B',
    hill2: '#5FB869',
    sun: '#FFD36F',
    shadow: 'rgba(0,0,0,0.12)'
  };

  // Fonts
  const fonts = {
    title: '24px Inter, system-ui, sans-serif',
    body: '16px Inter, system-ui, sans-serif',
    big: '30px Inter, system-ui, sans-serif',
    button: '18px Inter, system-ui, sans-serif',
    small: '13px Inter, system-ui, sans-serif'
  };

  // Utility: measure text and draw background rectangle (improved with subtle shadow)
  function drawTextBox(text, x, y, font, padding = PADDING, align = 'left', fillStyle = palette.text, bg = palette.board) {
    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const fontSize = parseInt(font, 10) || 16;
    let drawX = x;
    if (align === 'center') drawX = x - textW / 2;
    else if (align === 'right') drawX = x - textW;
    const boxX = drawX - padding;
    const boxY = y - fontSize - padding / 2;
    const boxW = textW + padding * 2;
    const boxH = fontSize + padding;
    // subtle shadow
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 8;
    roundRect(ctx, boxX, boxY, boxW, boxH, 8, bg);
    ctx.shadowBlur = 0;
    // text
    ctx.fillStyle = fillStyle;
    ctx.fillText(text, drawX, y);
    ctx.restore();
    return { boxX, boxY, boxW, boxH, textW };
  }

  // Round rect helper
  function roundRect(ctx, x, y, w, h, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Generate question - DO NOT CHANGE LOGIC
  function generateQuestion() {
    const level = Math.min(5, Math.floor(score / 2) + 1);
    const typeRoll = Math.random();
    let a, b, op, answer;
    if (typeRoll < 0.6) {
      op = Math.random() < 0.5 ? '+' : '-';
      if (op === '+') {
        a = randInt(1, 15);
        b = randInt(1, Math.max(4, 16 - a));
        answer = a + b;
      } else {
        a = randInt(1, 20);
        b = randInt(1, Math.min(a, 12));
        answer = a - b;
      }
    } else {
      op = 'x';
      a = randInt(2, Math.min(6, level + 3));
      b = randInt(2, Math.min(6, level + 2));
      answer = a * b;
    }

    const correct = answer;
    const choiceSet = new Set([correct]);
    while (choiceSet.size < ANSWER_COUNT) {
      let perturb;
      if (Math.random() < 0.6) {
        perturb = correct + randInt(-5, 6);
      } else {
        perturb = correct + randInt(-10, 11);
      }
      if (op === 'x') {
        if (perturb <= 0) perturb = Math.abs(perturb) + 2;
      } else {
        if (perturb < 0) perturb = Math.abs(perturb);
      }
      choiceSet.add(perturb);
    }
    const arr = shuffle(Array.from(choiceSet));
    return {
      text: `${a} ${op} ${b} = ?`,
      correctIndex: arr.indexOf(correct),
      choices: arr
    };
  }

  // Helpers
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // UI layout ensures no overlap: reserve top area for score/lives, center for play, bottom for instructions
  function layoutButtons() {
    buttons.length = 0;
    const areaY = 240; // center
    const totalWidth = WIDTH - PADDING * 4;
    const btnW = Math.min(240, Math.floor((totalWidth - (ANSWER_COUNT - 1) * PADDING) / ANSWER_COUNT));
    const btnH = 56;
    const startX = (WIDTH - (btnW * ANSWER_COUNT + PADDING * (ANSWER_COUNT - 1))) / 2;
    for (let i = 0; i < ANSWER_COUNT; i++) {
      const x = startX + i * (btnW + PADDING);
      const y = areaY;
      buttons.push({ x, y, w: btnW, h: btnH, label: '', index: i });
    }
  }
  layoutButtons();

  // Mouse interactions for hover
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    hoveredButton = -1;
    if (gameState === 'playing') {
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          hoveredButton = i;
          break;
        }
      }
    } else {
      hoveredButton = -1;
    }
  });

  // Input handling
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    handleClick(x, y);
  });

  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      Sound.toggle();
      muteVisualFlash = 12;
      try {
        Sound.clickTone();
      } catch (err) {}
    } else if (e.key === 'r' || e.key === 'R') {
      if (gameState === 'win' || gameState === 'gameover' || gameState === 'start') {
        restartGame();
      }
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (gameState === 'playing') selectAnswer(idx);
    } else if (e.key === 'Enter') {
      if (gameState === 'start') {
        startGame();
      }
    }
  });

  canvas.addEventListener('focus', () => {
    if (audioAllowed && audioCtx) Sound.resumeIfNeeded();
  });

  // Resume audio on first pointerdown gesture
  canvas.addEventListener('pointerdown', async () => {
    if (audioAllowed && audioCtx) {
      try {
        await Sound.resumeIfNeeded();
      } catch (e) {}
    }
  });

  function handleClick(x, y) {
    if (gameState === 'start') {
      startGame();
      return;
    }
    if (gameState === 'playing') {
      for (const b of buttons) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          selectAnswer(b.index);
          return;
        }
      }
    } else if (gameState === 'win' || gameState === 'gameover') {
      const btn = getRestartButtonRect();
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        restartGame();
      }
    }
  }

  function selectAnswer(idx) {
    const now = Date.now();
    if (!question || !choices.length) return;
    if (now - lastAnswerTime < 400) return; // debounce
    lastAnswerTime = now;
    if (idx === question.correctIndex) {
      score++;
      droneX += Math.floor((WIDTH - 160) / GOAL); // advance drone
      flashy = 18;
      createCorrectParticles(droneX + 8, droneY);
      try {
        Sound.playCorrect();
      } catch (err) {}
      if (score >= GOAL) {
        gameState = 'win';
        try {
          Sound.clickTone();
        } catch (err) {}
      } else {
        question = generateQuestion();
        choices = question.choices.slice();
      }
    } else {
      wrongs++;
      createIncorrectParticles(droneX + 8, droneY + 6);
      try {
        Sound.playIncorrect();
      } catch (err) {}
      hoverTime = 16;
      if (wrongs >= MAX_WRONG) {
        gameState = 'gameover';
      } else {
        droneX = Math.max(80, droneX - 30);
      }
    }
  }

  function startGame() {
    score = 0;
    wrongs = 0;
    droneX = 80;
    bobOffset = 0;
    question = generateQuestion();
    choices = question.choices.slice();
    gameState = 'playing';
    try {
      Sound.playCorrect(); // friendly beep to indicate start
    } catch (err) {}
  }

  function restartGame() {
    score = 0;
    wrongs = 0;
    droneX = 80;
    question = null;
    choices = [];
    gameState = 'start';
  }

  function getRestartButtonRect() {
    const w = 220;
    const h = 56;
    return { x: (WIDTH - w) / 2, y: HEIGHT / 2 + 60, w, h };
  }

  // Visual elements drawing (enhanced)

  function clear() {
    // gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, palette.skyTop);
    g.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawBackground(elapsed) {
    // sun
    const t = elapsed / 1000;
    const sunX = WIDTH - 100 + Math.sin(t / 3) * 6;
    const sunY = 80 + Math.cos(t / 2) * 3;
    const sunRadius = 36;
    const sunG = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, sunRadius);
    sunG.addColorStop(0, '#fff6d6');
    sunG.addColorStop(0.4, palette.sun);
    sunG.addColorStop(1, 'rgba(255,211,111,0.0)');
    ctx.fillStyle = sunG;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // rolling hills parallax
    drawHill(0.6, t, palette.hill2, 60, 0.8);
    drawHill(0.9, t, palette.hill1, 90, 1.2);

    // moving clouds with soft shadows
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 230 + (elapsed / 30) * (i + 1)) % (WIDTH + 300)) - 150;
      const cy = 50 + (i % 3) * 42 + Math.sin((elapsed / 1000) + i) * 6;
      drawCloud(cx, cy, 48 + (i % 3) * 12, palette.cloud, 0.95 - (i % 3) * 0.08);
    }

    // gentle ambient particles (floating motes)
    for (let i = 0; i < 12; i++) {
      const px = ((i * 71 + (elapsed / 40) * (i + 1)) % (WIDTH + 200)) - 100;
      const py = 40 + (i % 4) * 42 + Math.sin((elapsed / 800) + i) * 8;
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, py, 2 + (i % 3) * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHill(speedMult, elapsed, color, baseHeight, scale) {
    ctx.save();
    const pathY = HEIGHT - baseHeight;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    ctx.lineTo(0, pathY);
    for (let x = 0; x <= WIDTH; x += 10) {
      const y = pathY - Math.sin((x / 120) * Math.PI * scale + elapsed / (200 * speedMult)) * 18 - Math.cos(x / 150) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCloud(x, y, size, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(x + size * 0.55, y - size * 0.12, size * 0.7, size * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(x - size * 0.55, y - size * 0.12, size * 0.7, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // soft inner highlight
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(x - size * 0.25, y - size * 0.05, size * 0.45, size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDrone() {
    ctx.save();
    const x = droneX;
    const y = droneY + Math.sin(bobOffset / 420) * 6;
    // soft glow
    ctx.save();
    ctx.fillStyle = 'rgba(255,160,140,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // shadow
    ctx.fillStyle = palette.shadow;
    ctx.beginPath();
    ctx.ellipse(x, y + 34, 58, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // drone body with gradient
    const bodyW = 100;
    const bodyH = 42;
    const bodyX = x - bodyW / 2;
    const bodyY = y - 18;
    const grad = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY + bodyH);
    grad.addColorStop(0, lightenColor(palette.drone, 8));
    grad.addColorStop(1, palette.drone);
    roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 12, grad);

    // metallic edges
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    roundRectStroke(ctx, bodyX + 2, bodyY + 2, bodyW - 4, bodyH - 4, 10, 'rgba(255,255,255,0.06)');

    // cockpit window
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x - 18, y - 2, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#CFF4FF';
    ctx.beginPath();
    ctx.ellipse(x - 18, y - 2, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // battery panel on body
    const batX = x + 14;
    const batW = 34;
    const batH = 18;
    roundRect(ctx, batX - batW / 2, y - 9, batW, batH, 6, '#FFF8E6');
    // segments inside
    const seg = 4;
    const filledSeg = Math.round((score / GOAL) * seg);
    for (let i = 0; i < seg; i++) {
      const sx = batX - batW / 2 + 4 + i * 7;
      const sy = y - 7;
      roundRect(ctx, sx, sy, 5, 12, 2, i < filledSeg ? palette.win : '#E6F7FF');
    }

    // propellers with spinning blur
    for (let i = -1; i <= 1; i += 2) {
      const px = x + i * 60;
      const py = y - 8;
      // mount
      roundRect(ctx, px - 6, py - 6, 12, 12, 4, '#0f4f66');
      // blades (rotate)
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((bobOffset / 30) * i);
      // soft blade
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // darker core
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // playful antenna with blinking tip
    ctx.strokeStyle = '#FFD66B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 24, y - 18);
    ctx.quadraticCurveTo(x - 32, y - 40, x - 6, y - 34);
    ctx.stroke();
    ctx.fillStyle = (Math.floor(bobOffset / 120) % 2 === 0) ? '#FFD66B' : '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x - 6, y - 34, 6, 0, Math.PI * 2);
    ctx.fill();

    // friendly eyes to make it characterful
    ctx.fillStyle = '#063449';
    ctx.beginPath();
    ctx.arc(x - 30, y - 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 6, y - 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function roundRectStroke(ctx, x, y, w, h, r, strokeStyle) {
    ctx.save();
    ctx.beginPath();
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
    ctx.restore();
  }

  function lightenColor(hex, percent) {
    // simple lighten assuming hex rrggbb
    try {
      const c = hex.replace('#', '');
      const num = parseInt(c, 16);
      let r = (num >> 16) + percent;
      let g = ((num >> 8) & 0x00FF) + percent;
      let b = (num & 0x0000FF) + percent;
      r = Math.min(255, Math.max(0, r));
      g = Math.min(255, Math.max(0, g));
      b = Math.min(255, Math.max(0, b));
      return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    } catch (e) {
      return hex;
    }
  }

  function drawBatteryRow() {
    const startX = 28;
    const y = 22;
    const h = 28;
    let x = startX;
    for (let i = 0; i < GOAL; i++) {
      const filled = i < score;
      const bw = 30;
      roundRect(ctx, x, y, bw, h, 6, '#FFFFFF');
      // inner fill
      const innerW = bw - 8;
      const innerX = x + 4;
      const innerY = y + 6;
      roundRect(ctx, innerX, innerY, innerW, h - 12, 4, filled ? palette.win : 'rgba(230,245,255,0.9)');
      // little terminal
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x + bw - 4, y + 8, 4, h - 16);
      // tiny glow when filled
      if (filled) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(innerX + 2, innerY + 2, innerW - 4, (h - 12) / 2);
        ctx.restore();
      }
      x += bw + 8;
    }
  }

  function drawTopUI() {
    // left: title small
    ctx.font = fonts.title;
    ctx.fillStyle = palette.text;
    drawTextBox('Drone Math Adventure', PADDING + 8, 28 + 6, fonts.title, 10, 'left', palette.text, 'rgba(255,255,255,0.85)');

    // middle: progress text
    ctx.font = fonts.body;
    const scoreText = `Batteries: ${score}/${GOAL}`;
    const scoreBox = drawTextBox(scoreText, WIDTH / 2, 28 + 6, fonts.body, PADDING, 'center', palette.text, 'rgba(255,255,255,0.9)');

    // right: lives
    const livesText = `Lives: ${MAX_WRONG - wrongs}`;
    const metrics = ctx.measureText(livesText);
    drawTextBox(livesText, WIDTH - PADDING - 8, 28 + 6, fonts.body, PADDING, 'right', (MAX_WRONG - wrongs) > 1 ? palette.text : palette.wrong, 'rgba(255,255,255,0.95)');

    // audio status small indicator
    const audioText = audioUnavailable ? 'Audio unavailable' : (Sound.enabled ? 'Sound: On (M)' : 'Sound: Off (M)');
    ctx.font = fonts.small;
    drawTextBox(audioText, WIDTH - PADDING - 8, 28 + 36, fonts.small, 8, 'right', Sound.enabled ? palette.text : palette.wrong, 'rgba(255,255,255,0.9)');
  }

  function drawQuestionArea() {
    const centerX = WIDTH / 2;
    const y = 170;
    ctx.font = fonts.big;
    ctx.fillStyle = palette.text;
    drawTextBox(question.text, centerX, y, fonts.big, PADDING + 6, 'center', palette.text, 'rgba(255,255,255,0.95)');
  }

  function drawAnswerButtons() {
    ctx.font = fonts.button;
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const label = `${i + 1}. ${choices[i]}`;
      b.label = label;
      // background color with depth
      const isHovered = hoveredButton === i;
      let bg = (gameState !== 'playing') ? '#F3F6F9' : (isHovered ? palette.buttonDark : palette.button);
      if (gameState !== 'playing') bg = '#F3F6F9';
      // shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = isHovered ? 14 : 6;
      roundRect(ctx, b.x, b.y, b.w, b.h, 10, bg);
      ctx.restore();

      // numeric badge
      const badgeX = b.x + 12;
      const badgeY = b.y + b.h / 2;
      roundRect(ctx, badgeX - 4, badgeY - 14, 28, 28, 8, '#FFFFFF');
      ctx.fillStyle = palette.text;
      ctx.font = '14px ' + (fonts.button.split(' ')[0]);
      ctx.fillText((i + 1).toString(), badgeX + 6, badgeY + 6 - 4);

      // label text
      ctx.font = fonts.button;
      ctx.fillStyle = palette.text;
      const metrics = ctx.measureText(label);
      const tx = badgeX + 38;
      const ty = b.y + b.h / 2 + 6;
      // draw label with clipped area if needed
      drawClippedText(label, tx, ty, b.x + b.w - 12, fonts.button);
    }
  }

  function drawClippedText(text, x, y, maxX, font) {
    ctx.save();
    ctx.font = font;
    let display = text;
    while (ctx.measureText(display).width > (maxX - x) && display.length > 3) {
      display = display.slice(0, -1);
    }
    if (display !== text) display = display.slice(0, -3) + '...';
    ctx.fillText(display, x, y);
    ctx.restore();
  }

  function drawInstructions() {
    const text = gameState === 'start'
      ? 'Welcome! Help the drone collect batteries by answering math questions. Click to start. Use keys 1-4 or click answers. Press M to mute. Press R to restart.'
      : 'Pick the correct answer. Collect 10 batteries. 3 wrong answers and the drone loses power. Press M to toggle sound. Use keys 1-4.';
    ctx.font = fonts.body;
    ctx.fillStyle = palette.text;
    const lines = wrapTextToWidth(text, WIDTH - PADDING * 4, fonts.body);
    const totalHeight = lines.length * 20 + PADDING;
    const boxW = WIDTH - PADDING * 4;
    const boxX = PADDING * 2;
    const boxY = HEIGHT - totalHeight - 12;
    roundRect(ctx, boxX, boxY, boxW, totalHeight + 6, 10, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = palette.text;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], boxX + PADDING, boxY + 20 + i * 20);
    }
  }

  function wrapTextToWidth(text, maxW, font) {
    ctx.font = font;
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const w of words) {
      const test = current ? current + ' ' + w : w;
      const m = ctx.measureText(test).width;
      if (m > maxW - PADDING * 2) {
        if (current) lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawWinScreen() {
    ctx.save();
    roundRect(ctx, 64, 64, WIDTH - 128, HEIGHT - 128, 12, 'rgba(255,255,255,0.98)');
    ctx.font = fonts.big;
    ctx.fillStyle = palette.text;
    drawTextBox('Victory! Drone is fully charged!', WIDTH / 2, HEIGHT / 2 - 48, fonts.big, PADDING + 6, 'center', palette.win, 'rgba(255,255,255,0.0)');
    ctx.font = fonts.title;
    drawTextBox('You collected all 10 batteries. Great flying!', WIDTH / 2, HEIGHT / 2 - 8, fonts.title, PADDING + 6, 'center', palette.text, 'rgba(255,255,255,0.0)');
    // celebratory confetti particles
    for (let i = 0; i < 8; i++) {
      createConfetti(WIDTH / 2, HEIGHT / 2 - 20);
    }
    const btn = getRestartButtonRect();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12, palette.button);
    ctx.font = fonts.button;
    ctx.fillStyle = palette.text;
    ctx.fillText('Restart (R)', btn.x + btn.w / 2 - ctx.measureText('Restart (R)').width / 2, btn.y + btn.h / 2 + 6);
    ctx.restore();
  }

  function drawGameOverScreen() {
    ctx.save();
    roundRect(ctx, 64, 64, WIDTH - 128, HEIGHT - 128, 12, 'rgba(255,255,255,0.98)');
    ctx.font = fonts.big;
    ctx.fillStyle = palette.text;
    drawTextBox('Game Over', WIDTH / 2, HEIGHT / 2 - 48, fonts.big, PADDING + 6, 'center', palette.wrong, 'rgba(255,255,255,0.0)');
    ctx.font = fonts.title;
    drawTextBox('The drone ran out of power after 3 wrong answers.', WIDTH / 2, HEIGHT / 2 - 8, fonts.title, PADDING + 6, 'center', palette.text, 'rgba(255,255,255,0.0)');
    const btn = getRestartButtonRect();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, palette.wrong);
    ctx.font = fonts.button;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Try Again (R)', btn.x + btn.w / 2 - ctx.measureText('Try Again (R)').width / 2, btn.y + btn.h / 2 + 6);
    ctx.restore();
  }

  function drawAudioCue() {
    const x = WIDTH - 44;
    const y = 56;
    ctx.save();
    roundRect(ctx, x - 8, y - 18, 48, 36, 8, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = Sound.enabled ? '#2E7D52' : '#FF6B6B';
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 8, y - 6);
    ctx.lineTo(x + 16, y - 12);
    ctx.lineTo(x + 16, y + 12);
    ctx.lineTo(x + 8, y + 6);
    ctx.lineTo(x, y + 6);
    ctx.closePath();
    ctx.fill();
    // small M label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px sans-serif';
    ctx.fillText('M', x + 20, y + 6);
    // subtle pulse when toggled
    if (muteVisualFlash > 0) {
      ctx.beginPath();
      ctx.arc(x + 8, y, 28 - muteVisualFlash, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,215,100,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Particle system functions
  function createCorrectParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: x + randInt(-8, 8),
        y: y + randInt(-8, 8),
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 1.2 - 0.3,
        size: Math.random() * 3 + 2,
        life: 60 + Math.random() * 20,
        color: ['#FFD66B', '#FFFFFF', '#57D68F'][Math.floor(Math.random() * 3)],
        type: 'spark'
      });
    }
  }

  function createIncorrectParticles(x, y) {
    for (let i = 0; i < 12; i++) {
      particles.push({
        x: x + randInt(-10, 10),
        y: y + randInt(-2, 8),
        vx: (Math.random() - 0.5) * 1.6,
        vy: -Math.random() * 0.6,
        size: Math.random() * 6 + 4,
        life: 40 + Math.random() * 30,
        color: '#D9534F',
        type: 'smoke'
      });
    }
  }

  function createConfetti(x, y) {
    particles.push({
      x: x + randInt(-60, 60),
      y: y + randInt(-40, 40),
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 2 + 1,
      size: Math.random() * 6 + 4,
      life: 90 + Math.random() * 60,
      color: ['#FF7B6B', '#FFD66B', '#57D68F', '#6EE7C6'][Math.floor(Math.random() * 4)],
      type: 'confetti',
      rot: Math.random() * Math.PI
    });
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.type === 'smoke') {
        p.vy -= 0.02;
        p.vx *= 0.99;
      } else if (p.type === 'spark') {
        p.vy += 0.04;
      } else if (p.type === 'confetti') {
        p.vy += 0.06;
        p.rot += 0.12;
      }
      p.life -= 1;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function renderParticles() {
    for (const p of particles) {
      ctx.save();
      if (p.type === 'smoke') {
        ctx.globalAlpha = Math.max(0, p.life / 60) * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'spark') {
        ctx.globalAlpha = Math.max(0, p.life / 80);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'confetti') {
        ctx.globalAlpha = Math.max(0, p.life / 120);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size / 2);
      }
      ctx.restore();
    }
  }

  // Main loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    update(dt);
    render(now);
    requestAnimationFrame(loop);
  }

  function update(dt) {
    bobOffset += dt;
    if (flashy > 0) flashy -= 1;
    if (hoverTime > 0) hoverTime -= 1;
    if (muteVisualFlash > 0) muteVisualFlash -= 1;
    droneX = Math.max(80, Math.min(WIDTH - 120, droneX));
    updateParticles();
  }

  function render(elapsed) {
    clear();
    drawBackground(elapsed);
    drawBatteryRow();
    drawTopUI();

    if (gameState === 'start') {
      ctx.font = fonts.big;
      drawTextBox('Drone Math Adventure', WIDTH / 2, 120, fonts.big, PADDING + 6, 'center', palette.text, 'rgba(255,255,255,0.95)');
      ctx.font = fonts.title;
      drawTextBox('Collect 10 batteries by answering math questions!', WIDTH / 2, 160, fonts.title, PADDING + 6, 'center', palette.text, 'rgba(255,255,255,0.95)');
      ctx.font = fonts.body;
      drawTextBox('Click anywhere or press Enter to start', WIDTH / 2, 200, fonts.body, PADDING + 6, 'center', palette.text, 'rgba(255,255,255,0.95)');
      // friendly drone with gentle bob
      drawDrone();
    } else if (gameState === 'playing') {
      drawDrone();
      drawQuestionArea();
      drawAnswerButtons();

      if (flashy > 0) {
        ctx.save();
        ctx.globalAlpha = 0.12 + (flashy / 18) * 0.18;
        roundRect(ctx, 60, 120, WIDTH - 120, 220, 12, 'rgba(87,214,138,0.12)');
        ctx.restore();
      }

      if (hoverTime > 0) {
        ctx.save();
        ctx.globalAlpha = 0.08 + (hoverTime / 16) * 0.14;
        roundRect(ctx, 60, 120, WIDTH - 120, 220, 12, 'rgba(255,107,107,0.12)');
        ctx.restore();
      }
    } else if (gameState === 'win') {
      drawDrone();
      drawWinScreen();
    } else if (gameState === 'gameover') {
      drawDrone();
      drawGameOverScreen();
    }

    // particles and overlays
    renderParticles();

    drawInstructions();
    drawAudioCue();

    // small accessibility text at bottom-left
    ctx.font = fonts.small;
    ctx.fillStyle = '#073042';
    ctx.fillText('Keyboard: 1-4 to answer, M toggle sound, R restart', 14, HEIGHT - 12);

    if (audioUnavailable) {
      drawTextBox('Audio is unavailable on this device or browser.', WIDTH / 2, HEIGHT - 40, '14px sans-serif', PADDING, 'center', palette.text, 'rgba(255,250,250,0.9)');
    }
  }

  // Start initial state and loop
  restartGame();
  requestAnimationFrame(loop);

  // Resize handling, keep canvas fixed but ensure crispness
  window.addEventListener('resize', () => {
    fixHiDPICanvas();
    layoutButtons();
  });

  // Expose a global for debug (optional)
  window.__droneMathGame = {
    restart: restartGame,
    start: startGame,
    getState: () => ({ score, wrongs, gameState })
  };

  // Enable audio on first gesture (robust)
  function enableAudioOnGesture() {
    function resume() {
      if (audioAllowed && audioCtx) {
        Sound.resumeIfNeeded();
      }
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
    }
    document.addEventListener('pointerdown', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
  }
  enableAudioOnGesture();

  // Error handling: catch unhandled exceptions and show friendly message
  window.addEventListener('error', function (e) {
    console.error('Unhandled error in game:', e.message);
    try {
      ctx.save();
      roundRect(ctx, 40, 40, WIDTH - 80, 80, 8, '#fff0f0');
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#900';
      ctx.fillText('An error occurred. Please reload the page.', 60, 84);
      ctx.restore();
    } catch (ex) {
      // ignore rendering errors
    }
  });
})();