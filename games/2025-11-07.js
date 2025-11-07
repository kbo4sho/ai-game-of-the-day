(function () {
  // Drone Math Game (Visual & Audio Enhancements)
  // Renders entirely into the element with id "game-of-the-day-stage".
  // Only visuals and audio changed; game mechanics and math logic preserved.

  // Basic config
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL = 10; // number of correct answers needed to win
  const MAX_WRONG = 3; // lives

  // Find container and create canvas
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element #game-of-the-day-stage not found.');
    return;
  }
  container.innerHTML = ''; // clear
  container.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Drone Math Game canvas');
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: false });

  // Fonts and spacing
  const PADDING = 12;
  const UI_FONT =
    '16px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const IMPORTANT_FONT =
    '22px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const TITLE_FONT =
    '28px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';

  // Audio state and resources
  let audioCtx = null;
  let audioAvailable = true;
  let audioInitialized = false;
  let muted = false;
  let bgNodes = null; // container for background oscillator nodes
  let masterGain = null;

  // Particles for subtle feedback (visual only)
  const particles = [];

  function safeRequestAudioContext() {
    // Create AudioContext with error handling
    if (audioInitialized) return;
    audioInitialized = true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 1.0;
      masterGain.connect(audioCtx.destination);
      // low global volume to keep audio gentle
      masterGain.gain.value = muted ? 0 : 0.9;
    } catch (err) {
      console.warn('Web Audio API not available:', err);
      audioAvailable = false;
      audioCtx = null;
    }
  }

  function resumeAudioIfNeeded() {
    if (!audioAvailable || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => console.warn('Could not resume audio context:', e));
    }
  }

  function createBackgroundSound() {
    // Create a layered ambient pad with slow LFO amplitude modulation.
    if (!audioAvailable || !audioCtx) return null;
    try {
      // ensure previous background stopped
      if (bgNodes) {
        stopBackgroundSound();
      }
      const nodes = {};
      // master for background
      nodes.gain = audioCtx.createGain();
      nodes.gain.gain.value = 0.045; // gentle base
      nodes.gain.connect(masterGain);

      // two detuned oscillators for warm pad
      nodes.oscA = audioCtx.createOscillator();
      nodes.oscA.type = 'sine';
      nodes.oscA.frequency.value = 110; // base
      const aFilter = audioCtx.createBiquadFilter();
      aFilter.type = 'lowpass';
      aFilter.frequency.value = 900;
      nodes.oscA.connect(aFilter);
      aFilter.connect(nodes.gain);

      nodes.oscB = audioCtx.createOscillator();
      nodes.oscB.type = 'sawtooth';
      nodes.oscB.frequency.value = 132; // a fifth above
      const bFilter = audioCtx.createBiquadFilter();
      bFilter.type = 'lowpass';
      bFilter.frequency.value = 1000;
      nodes.oscB.connect(bFilter);
      bFilter.connect(nodes.gain);

      // subtle LFO controlling gain
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(nodes.gain.gain);

      nodes.lfo = lfo;
      nodes.lfoGain = lfoGain;
      nodes.filters = [aFilter, bFilter];

      // start them
      const now = audioCtx.currentTime;
      try {
        nodes.oscA.start(now);
        nodes.oscB.start(now);
        nodes.lfo.start(now);
      } catch (e) {
        // ignore if already started
      }

      return nodes;
    } catch (err) {
      console.warn('Error creating background sound:', err);
      return null;
    }
  }

  function startBackgroundSound() {
    if (!audioAvailable || !audioCtx) return;
    try {
      if (!bgNodes) {
        bgNodes = createBackgroundSound();
      }
      // ensure master gain respects muted flag
      if (masterGain) masterGain.gain.value = muted ? 0 : 0.9;
    } catch (e) {
      console.warn('Error starting background sound:', e);
    }
  }

  function stopBackgroundSound() {
    if (!audioAvailable || !audioCtx || !bgNodes) return;
    try {
      // Ramp down gently
      const g = bgNodes.gain;
      const now = audioCtx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + 0.6);

      // Stop oscillators after ramp
      setTimeout(() => {
        try {
          if (bgNodes.oscA && bgNodes.oscA.stop) bgNodes.oscA.stop();
          if (bgNodes.oscB && bgNodes.oscB.stop) bgNodes.oscB.stop();
          if (bgNodes.lfo && bgNodes.lfo.stop) bgNodes.lfo.stop();
        } catch (e) {
          // ignore stop errors
        }
        bgNodes = null;
      }, 700);
    } catch (e) {
      console.warn('Error stopping background sound:', e);
      bgNodes = null;
    }
  }

  // Sound effects
  function envelopeTone({ freq = 440, dur = 0.25, type = 'sine', volume = 0.12, detune = 0 } = {}) {
    if (!audioAvailable || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      if (detune) o.detune.value = detune;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      const now = audioCtx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.start(now);
      o.stop(now + dur + 0.05);
    } catch (e) {
      console.warn('Error creating envelope tone:', e);
    }
  }

  function playStartSound() {
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // warm chord
      [220, 277.18, 330].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(masterGain);
        const start = now + i * 0.04;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(0.07, start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
        try {
          o.start(start);
          o.stop(start + 0.65);
        } catch (e) {}
      });
    } catch (e) {
      console.warn('Error playing start sound:', e);
    }
  }

  function playCorrectSound() {
    // Pleasant arpeggio + soft whoosh particle spawn
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [660, 880, 990];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(masterGain);
        const start = now + i * 0.06;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(0.12, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
        try {
          o.start(start);
          o.stop(start + 0.3);
        } catch (e) {}
      });
    } catch (e) {
      console.warn('Error playing correct sound:', e);
    }
    spawnParticles({
      type: 'spark',
      color: '#ffd25a',
      count: 12,
      origin: { x: WIDTH - 160, y: HEIGHT / 2 },
    });
  }

  function playWrongSound() {
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // low descending sawtooth with slight noise-ish effect
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, now);
      o.frequency.linearRampToValueAtTime(120, now + 0.45);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      o.connect(g);
      g.connect(masterGain);
      g.gain.linearRampToValueAtTime(0.16, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      try {
        o.start(now);
        o.stop(now + 0.5);
      } catch (e) {}
    } catch (e) {
      console.warn('Error playing wrong sound:', e);
    }
    spawnParticles({
      type: 'smoke',
      color: '#c6d6e8',
      count: 8,
      origin: { x: WIDTH - 160, y: HEIGHT / 2 },
    });
  }

  function playVictorySound() {
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // rising cluster
      for (let i = 0; i < 6; i++) {
        const o = audioCtx.createOscillator();
        o.type = i % 2 === 0 ? 'sine' : 'triangle';
        o.frequency.value = 300 + i * 120;
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(masterGain);
        const start = now + i * 0.05;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(0.09, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        try {
          o.start(start);
          o.stop(start + 0.55);
        } catch (e) {}
      }
      // airy shimmer
      envelopeTone({ freq: 1200, dur: 1.2, type: 'sine', volume: 0.06 });
    } catch (e) {
      console.warn('Error playing victory sound:', e);
    }
    spawnParticles({
      type: 'burst',
      color: '#8be6a8',
      count: 28,
      origin: { x: WIDTH - 160, y: HEIGHT / 2 - 10 },
    });
  }

  // Particle system (simple, performant)
  function spawnParticles({
    type = 'spark',
    color = '#ffd25a',
    count = 10,
    origin = { x: WIDTH / 2, y: HEIGHT / 2 },
  } = {}) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed =
        (Math.random() * 1.8 + (type === 'burst' ? 2.6 : 0.8)) *
        (type === 'smoke' ? 0.6 : 1);
      particles.push({
        x: origin.x + (Math.random() * 12 - 6),
        y: origin.y + (Math.random() * 12 - 6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.4,
        life: Math.random() * 0.9 + 0.7,
        age: 0,
        color,
        size: Math.random() * 3 + (type === 'burst' ? 2.5 : 1),
        type,
      });
    }
  }

  // Game state
  let state = {
    mode: 'start', // 'start' | 'playing' | 'victory' | 'gameover'
    correct: 0,
    wrong: 0,
    question: null,
    choices: [],
    selectedIndex: 0,
    // Drone visual progress (0..GOAL)
    progress: 0,
    lastActionTime: 0,
  };

  // Answer boxes rectangles for hit testing
  let answerBoxes = [];

  // Utility to generate question appropriate for ages 7-9 (kept unchanged)
  function generateQuestion() {
    const ops = ['+', '+', '+', '-', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a;
    let b;
    let answer;
    if (op === '+') {
      a = Math.floor(Math.random() * 20) + 1; // 1-20
      b = Math.floor(Math.random() * 20) + 1;
      answer = a + b;
    } else if (op === '-') {
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * a) + 0; // ensure non-negative result
      answer = a - b;
    } else {
      a = Math.floor(Math.random() * 6) + 1; // 1-6
      b = Math.floor(Math.random() * 6) + 1;
      answer = a * b;
    }
    const qText = `${a} ${op} ${b} = ?`;
    const choices = new Set();
    choices.add(answer);
    while (choices.size < 3) {
      const delta = Math.floor(Math.random() * 5) + 1;
      const sign = Math.random() < 0.5 ? -1 : 1;
      const choiceValue = Math.max(0, answer + sign * delta);
      choices.add(choiceValue);
    }
    const choicesArr = Array.from(choices);
    for (let i = choicesArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choicesArr[i], choicesArr[j]] = [choicesArr[j], choicesArr[i]];
    }
    return {
      text: qText,
      answer,
      choices: choicesArr,
    };
  }

  function startNewQuestion() {
    const q = generateQuestion();
    state.question = q.text;
    state.choices = q.choices;
    state.correctAnswer = q.answer;
    state.selectedIndex = 0;
    state.lastActionTime = Date.now();
    computeAnswerBoxes();
  }

  // Layout helpers using ctx.measureText
  function drawTextWithBackground(
    text,
    x,
    y,
    font,
    textColor = '#051',
    bgColor = 'rgba(255,255,255,0.8)',
    padding = 10,
    align = 'left'
  ) {
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);
    const textHeight = Math.ceil(parseInt(font, 10)); // approximate
    let bx = x;
    if (align === 'center') {
      bx = x - textWidth / 2 - padding;
    } else if (align === 'right') {
      bx = x - textWidth - padding * 2;
    }
    const by = y;
    ctx.fillStyle = bgColor;
    ctx.fillRect(bx, by, textWidth + padding * 2, textHeight + padding);
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'top';
    if (align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y + padding / 2);
    } else if (align === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(text, bx + textWidth + padding, y + padding / 2);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(text, bx + padding, y + padding / 2);
    }
    return { bx, by, bw: textWidth + padding * 2, bh: textHeight + padding };
  }

  // Compute answer box positions ensuring non-overlap and using measureText
  function computeAnswerBoxes() {
    ctx.font = IMPORTANT_FONT;
    const textWidths = state.choices.map((c) =>
      Math.ceil(ctx.measureText(String(c)).width)
    );
    const boxHe = Math.max(46, parseInt(IMPORTANT_FONT, 10) + 16);
    const spacingMin = 14;
    const totalTextWidth = textWidths.reduce((a, b) => a + b, 0);
    const totalBoxPadding = textWidths.length * 28;
    let totalWidth = totalTextWidth + totalBoxPadding + (state.choices.length - 1) * spacingMin;
    const maxAreaWidth = WIDTH - 260; // leave room for drone on right
    if (totalWidth > maxAreaWidth) {
      totalWidth = maxAreaWidth;
    }
    const startX = Math.round((WIDTH - totalWidth) / 2);
    const y = Math.round(HEIGHT * 0.45);
    answerBoxes = [];
    let x = startX;
    for (let i = 0; i < state.choices.length; i++) {
      const tw = textWidths[i];
      const boxW = tw + 28;
      answerBoxes.push({
        x,
        y,
        w: boxW,
        h: boxHe,
        text: String(state.choices[i]),
        index: i,
      });
      x += boxW + spacingMin;
    }
  }

  // Hit test for clicks
  function hitTestAnswer(mx, my) {
    for (const box of answerBoxes) {
      if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h) {
        return box.index;
      }
    }
    return -1;
  }

  // Input handlers
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    resumeAudioIfNeeded();
    safeRequestAudioContext();

    // Start background on first user interaction if not running
    startBackgroundSound();

    if (state.mode === 'start') {
      // Start the game
      startGame();
      return;
    } else if (state.mode === 'playing') {
      const hit = hitTestAnswer(mx, my);
      if (hit >= 0) {
        state.selectedIndex = hit;
        submitAnswer();
        return;
      }
    } else if (state.mode === 'victory' || state.mode === 'gameover') {
      if (isInsideRestart(mx, my)) {
        restartGame();
      } else {
        restartGame();
      }
    }
    // Handle clicking audio icon area
    if (isInsideAudioToggle(mx, my)) {
      toggleMute();
    }
  });

  function isInsideRestart(mx, my) {
    const bw = 160;
    const bh = 46;
    const bx = (WIDTH - bw) / 2;
    const by = HEIGHT - bh - 20;
    return mx >= bx && mx <= bx + bw && my >= by && my <= by + bh;
  }

  function isInsideAudioToggle(mx, my) {
    const bx = 10;
    const by = HEIGHT - 44;
    const bw = 140;
    const bh = 34;
    return mx >= bx && mx <= bx + bw && my >= by && my <= by + bh;
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key === 'm' || key === 'M') {
      toggleMute();
    } else if (key === 'r' || key === 'R') {
      if (state.mode === 'victory' || state.mode === 'gameover') {
        restartGame();
      } else if (state.mode === 'start') {
        startGame();
      } else {
        restartGame();
      }
    } else if ((key === ' ' || key === 'Spacebar') && state.mode === 'start') {
      startGame();
      e.preventDefault();
    } else if (state.mode === 'playing') {
      if (key >= '1' && key <= '3') {
        const idx = parseInt(key, 10) - 1;
        if (idx < state.choices.length) {
          state.selectedIndex = idx;
          submitAnswer();
        }
      } else if (key === 'ArrowLeft') {
        state.selectedIndex = (state.selectedIndex - 1 + state.choices.length) % state.choices.length;
      } else if (key === 'ArrowRight') {
        state.selectedIndex = (state.selectedIndex + 1) % state.choices.length;
      } else if (key === 'Enter') {
        submitAnswer();
      }
    }
    resumeAudioIfNeeded();
    safeRequestAudioContext();
    startBackgroundSound();
  });

  function toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.9;
  }

  // Game flow
  function startGame() {
    state.mode = 'playing';
    state.correct = 0;
    state.wrong = 0;
    state.progress = 0;
    startNewQuestion();
    safeRequestAudioContext();
    resumeAudioIfNeeded();
    startBackgroundSound();
    playStartSound();
    lastTick = performance.now();
  }

  function restartGame() {
    state.mode = 'start';
    state.correct = 0;
    state.wrong = 0;
    state.progress = 0;
    state.question = null;
    state.choices = [];
    state.selectedIndex = 0;
    answerBoxes = [];
    particles.length = 0;
    stopBackgroundSound();
  }

  function submitAnswer() {
    if (state.mode !== 'playing') return;
    const chosen = state.choices[state.selectedIndex];
    const isCorrect = Number(chosen) === Number(state.correctAnswer);
    if (isCorrect) {
      state.correct++;
      state.progress = Math.min(GOAL, state.progress + 1);
      playCorrectSound();
      // small visual boost
      if (state.correct >= GOAL) {
        state.mode = 'victory';
        stopBackgroundSound();
        playVictorySound();
        return;
      }
      setTimeout(startNewQuestion, 420);
    } else {
      state.wrong++;
      playWrongSound();
      if (state.wrong >= MAX_WRONG) {
        state.mode = 'gameover';
        stopBackgroundSound();
        return;
      } else {
        setTimeout(startNewQuestion, 450);
      }
    }
  }

  // Drawing utilities and enhanced visuals
  function drawBackground() {
    // gradient sky and subtle sun glow
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#e6f8ff');
    g.addColorStop(0.5, '#f3fbff');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft rolling hills
    ctx.save();
    ctx.translate(0, HEIGHT * 0.33);
    drawHill('#d8f0e6', 0.9, 30, 0);
    drawHill('#cdebe0', 0.7, 24, 120);
    drawHill('#bfe7d8', 0.5, 18, 60);
    ctx.restore();

    // sun with gentle glow
    const sunX = 90 + Math.sin(performance.now() / 3000) * 6;
    const sunY = 70 + Math.cos(performance.now() / 4500) * 4;
    const sunR = 36;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, sunR);
    sunGrad.addColorStop(0, 'rgba(255,255,200,0.95)');
    sunGrad.addColorStop(1, 'rgba(255,230,120,0.15)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();

    // drifting clouds (soft shapes)
    const t = performance.now() / 1000;
    const cloudCenters = [
      { x: 120 + Math.sin(t / 4) * 20, y: 60 },
      { x: 320 + Math.cos(t / 5) * 12, y: 80 },
      { x: 520 + Math.sin(t / 6) * 14, y: 52 },
    ];
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    cloudCenters.forEach((c, i) => {
      const scale = 1 + i * 0.08;
      drawCloud(c.x, c.y, 28 * scale);
    });

    // soft airflow vector lines (very subtle)
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(100,160,200,0.08)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const y = 40 + i * 64;
      ctx.moveTo(10, y);
      for (let x = 10; x <= WIDTH - 10; x += 16) {
        const yy = y + Math.sin(x / 40 + performance.now() / 9000 + i) * 8;
        ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawHill(color, amplitude = 0.5, frequency = 24, offset = 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 140);
    for (let x = 0; x <= WIDTH; x += 6) {
      const y = 100 + Math.sin((x + offset + performance.now() / 20) / frequency) * amplitude * 20;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, 220);
    ctx.lineTo(0, 220);
    ctx.closePath();
    ctx.fill();
  }

  function drawCloud(cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx - r * 0.6, cy, r * 0.7, 0, Math.PI * 2);
    ctx.arc(cx, cy - r * 0.2, r * 0.9, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.7, cy, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTopUI() {
    // Score top-left with polished card
    ctx.font = UI_FONT;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#053';
    const scoreText = `Correct: ${state.correct}/${GOAL}`;
    const sBox = drawTextWithBackground(scoreText, PADDING, PADDING, UI_FONT, '#073', 'rgba(255,255,255,0.98)', 12, 'left');

    // Lives top-right with hearts shaped icons
    const livesRemaining = Math.max(0, MAX_WRONG - state.wrong);
    const livesText = `Lives: ${livesRemaining}`;
    ctx.font = UI_FONT;
    const metrics = ctx.measureText(livesText);
    const textWidth = Math.ceil(metrics.width);
    const bx = WIDTH - textWidth - PADDING * 4 - 110;
    const by = PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.fillRect(bx, by, textWidth + PADDING * 2 + 90, parseInt(UI_FONT, 10) + PADDING);
    ctx.fillStyle = '#6a2';
    ctx.textAlign = 'left';
    ctx.fillText(livesText, bx + PADDING, by + PADDING / 2);

    // draw heart icons to visually represent lives
    for (let i = 0; i < MAX_WRONG; i++) {
      const hx = bx + textWidth + PADDING + 18 + i * 22;
      const hy = by + 8;
      drawHeart(hx + 6, hy + 8, 8, i < livesRemaining ? '#ff6b6b' : '#eee');
    }

    // Audio status bottom-left (accessible)
    ctx.font =
      '14px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
    const audioText = audioAvailable ? (muted ? 'Audio: Off (M)' : 'Audio: On (M)') : 'Audio: Unavailable';
    const ax = PADDING;
    const ay = HEIGHT - 44;
    const audMetrics = ctx.measureText(audioText);
    const aw = Math.ceil(audMetrics.width) + PADDING * 2 + 18;
    const ah = 34;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.fillRect(ax, ay, aw, ah);
    ctx.fillStyle = '#333';
    ctx.fillText(audioText, ax + PADDING + 18, ay + 10);
    // little audio icon
    drawAudioIcon(ax + 6, ay + 8, muted);

    // Instructions bottom-center
    ctx.font =
      '16px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
    const inst =
      state.mode === 'start'
        ? 'Press Space or Click to Start. Use 1-3, arrows or click answers.'
        : 'Use 1-3 or click. Enter to submit. Press M to toggle audio.';
    const centerX = WIDTH / 2;
    const instWidth = Math.ceil(ctx.measureText(inst).width);
    const ix = centerX - instWidth / 2 - PADDING;
    const iy = HEIGHT - 44;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.fillRect(ix, iy, instWidth + PADDING * 2, 34);
    ctx.fillStyle = '#014';
    ctx.textAlign = 'center';
    ctx.fillText(inst, centerX, iy + 8);
  }

  function drawAudioIcon(x, y, mutedFlag) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = mutedFlag ? '#999' : '#1a73e8';
    ctx.beginPath();
    ctx.moveTo(2, 8);
    ctx.lineTo(8, 8);
    ctx.lineTo(12, 4);
    ctx.lineTo(12, 12);
    ctx.lineTo(8, 8);
    ctx.lineTo(2, 8);
    ctx.closePath();
    ctx.fill();
    if (!mutedFlag) {
      ctx.strokeStyle = 'rgba(26,115,232,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(17, 9, 4, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#c44';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, 5);
      ctx.lineTo(21, 13);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeart(cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + r / 2);
    ctx.bezierCurveTo(cx, cy - r / 1.5, cx - r, cy - r / 1.5, cx - r, cy + r / 2);
    ctx.bezierCurveTo(cx - r, cy + r * 1.5, cx, cy + r * 1.9, cx, cy + r * 2.4);
    ctx.bezierCurveTo(cx, cy + r * 1.9, cx + r, cy + r * 1.5, cx + r, cy + r / 2);
    ctx.bezierCurveTo(cx + r, cy - r / 1.5, cx, cy - r / 1.5, cx, cy + r / 2);
    ctx.fill();
    ctx.restore();
  }

  function drawQuestionArea() {
    // card with soft shadow
    ctx.font = TITLE_FONT;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#053';
    const question = state.question || 'Get ready!';
    ctx.font = TITLE_FONT;
    const metrics = ctx.measureText(question);
    const w = Math.ceil(metrics.width);
    const h = parseInt(TITLE_FONT, 10) + 12;
    const boxW = Math.max(320, w + 60);
    const x = WIDTH / 2 - boxW / 2 - 60;
    const y = 68;
    // shadow
    ctx.fillStyle = 'rgba(3,20,40,0.04)';
    ctx.fillRect(x + 6, y + 6, boxW, h + 18);
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.fillRect(x, y, boxW, h + 18);
    ctx.fillStyle = '#043';
    ctx.textAlign = 'left';
    ctx.fillText(question, x + 18, y + 8);
  }

  function drawChoices() {
    ctx.font = IMPORTANT_FONT;
    for (const box of answerBoxes) {
      const isSelected = state.selectedIndex === box.index && state.mode === 'playing';
      // subtle gradient in box
      const grad = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
      grad.addColorStop(0, isSelected ? '#fff7e6' : '#ffffff');
      grad.addColorStop(1, isSelected ? '#fff5d9' : '#fbfdff');
      ctx.fillStyle = grad;
      // rounded rect
      roundRect(ctx, box.x, box.y, box.w, box.h, 10);
      ctx.fill();
      // border
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = isSelected ? '#f5b400' : '#d6eaf1';
      ctx.stroke();
      // text
      ctx.fillStyle = '#053';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(box.text, box.x + box.w / 2, box.y + box.h / 2 - 2);
      // label number
      ctx.font =
        '12px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      ctx.fillStyle = '#6b7';
      ctx.textAlign = 'left';
      ctx.fillText(String(box.index + 1), box.x + 8, box.y + 8);
      ctx.font = IMPORTANT_FONT;
    }
  }

  function roundRect(ctxRef, x, y, w, h, r) {
    ctxRef.beginPath();
    ctxRef.moveTo(x + r, y);
    ctxRef.arcTo(x + w, y, x + w, y + h, r);
    ctxRef.arcTo(x + w, y + h, x, y + h, r);
    ctxRef.arcTo(x, y + h, x, y, r);
    ctxRef.arcTo(x, y, x + w, y, r);
    ctxRef.closePath();
  }

  // Drone drawing improved
  function drawDrone() {
    const baseX = WIDTH - 160;
    const baseY = HEIGHT / 2 + (GOAL - state.progress) * 6 - 20;
    const t = performance.now() / 500;
    const bob = Math.sin(t) * 6;
    const x = baseX;
    const y = baseY + bob;
    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(x + 18, y + 54, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    // main fuselage
    const bodyW = 56;
    const bodyH = 30;
    const gradient = ctx.createLinearGradient(-bodyW, -bodyH, bodyW, bodyH);
    gradient.addColorStop(0, '#e9f9ff');
    gradient.addColorStop(1, '#d6f0ff');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#0a4';
    ctx.lineWidth = 2;
    roundRect(ctx, -bodyW, -bodyH / 1.2, bodyW * 2, bodyH * 1.6, 12);
    ctx.fill();
    ctx.stroke();

    // cockpit glass
    ctx.fillStyle = 'rgba(28,112,158,0.12)';
    ctx.beginPath();
    ctx.ellipse(8, -4, 20, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,80,110,0.18)';
    ctx.stroke();

    // friendly face (eyes)
    ctx.fillStyle = '#0b3040';
    ctx.beginPath();
    ctx.arc(0, -2, 2.6, 0, Math.PI * 2);
    ctx.arc(14, -2, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // rotor arms with animated blades and subtle blur effect (drawn as thin ellipses)
    const rotorOffsets = [
      { rx: -46, ry: -22 },
      { rx: 46, ry: -22 },
      { rx: -46, ry: 22 },
      { rx: 46, ry: 22 },
    ];
    const rotAngle = performance.now() / 110;
    rotorOffsets.forEach((o, i) => {
      // arm
      ctx.strokeStyle = 'rgba(8,48,64,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(o.rx / 2, o.ry / 2);
      ctx.lineTo(o.rx, o.ry);
      ctx.stroke();
      // hub
      ctx.fillStyle = '#f7f9fc';
      ctx.beginPath();
      ctx.arc(o.rx, o.ry, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cfe';
      ctx.stroke();

      // blades: draw semi-transparent fan with rotation to give motion blur
      ctx.save();
      ctx.translate(o.rx, o.ry);
      ctx.rotate(rotAngle + i * 0.6);
      for (let b = 0; b < 3; b++) {
        ctx.fillStyle = 'rgba(120,160,180,0.16)';
        ctx.beginPath();
        ctx.ellipse(0, 14, 4, 16, b * (Math.PI * 2 / 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    ctx.restore();

    // Altitude meter with better visuals
    const meterX = WIDTH - 88;
    const meterY = 40;
    const meterW = 28;
    const meterH = 240;
    // background card
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.fillRect(meterX - 12, meterY - 8, meterW + 28, meterH + 16);
    ctx.strokeStyle = '#e0f1ef';
    ctx.strokeRect(meterX - 12 + 0.5, meterY - 8 + 0.5, meterW + 28 - 1, meterH + 16 - 1);
    // meter track
    ctx.fillStyle = '#f2fbf5';
    roundRect(ctx, meterX, meterY, meterW, meterH, 6);
    ctx.fill();
    // filled portion
    const filledH = Math.round((state.progress / GOAL) * meterH);
    const gradFill = ctx.createLinearGradient(0, meterY, 0, meterY + meterH);
    gradFill.addColorStop(0, '#97e7b8');
    gradFill.addColorStop(1, '#5dc38e');
    ctx.fillStyle = gradFill;
    roundRect(ctx, meterX, meterY + (meterH - filledH), meterW, filledH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,120,80,0.12)';
    ctx.strokeRect(meterX + 0.5, meterY + 0.5, meterW - 1, meterH - 1);

    // labels
    ctx.fillStyle = '#224';
    ctx.font =
      '12px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Altitude', meterX + meterW / 2, meterY - 18);
    ctx.fillText(`${state.progress}/${GOAL}`, meterX + meterW / 2, meterY + meterH + 8);
  }

  function drawStarsCollected() {
    const sx = WIDTH - 180;
    const sy = 18 + 40;
    for (let i = 0; i < GOAL; i++) {
      const cx = sx + (i % 5) * 18;
      const cy = sy + Math.floor(i / 5) * 18;
      drawStar(cx, cy, 6, i < state.progress ? '#ffd24d' : '#f0f0f0', i < state.progress ? '#e68400' : '#ccc');
    }
  }

  function drawStar(cx, cy, r, fill, stroke) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const sx = cx + Math.cos(a) * r;
      const sy = cy + Math.sin(a) * r;
      ctx.lineTo(sx, sy);
      const a2 = a + Math.PI / 5;
      ctx.lineTo(cx + Math.cos(a2) * (r / 2), cy + Math.sin(a2) * (r / 2));
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // draw end screen with card style
  function drawEndScreen() {
    ctx.fillStyle = 'rgba(6,18,28,0.32)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = TITLE_FONT;
    const title = state.mode === 'victory' ? 'Mission Accomplished!' : 'Game Over';
    const subtitle =
      state.mode === 'victory'
        ? 'The drone is airborne! Great job!'
        : `You had ${state.wrong} wrong answers. Try again!`;
    ctx.font = TITLE_FONT;
    const titleW = Math.ceil(ctx.measureText(title).width);
    const boxW = Math.max(420, titleW + 60);
    const bx = (WIDTH - boxW) / 2;
    const by = HEIGHT / 2 - 110;
    // card with soft shadow and accent
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    roundRect(ctx, bx, by, boxW, 220, 14);
    ctx.fill();
    ctx.strokeStyle = '#dff6f0';
    ctx.stroke();

    ctx.fillStyle = '#063';
    ctx.font = TITLE_FONT;
    ctx.fillText(title, WIDTH / 2, by + 24);
    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = '#024';
    ctx.fillText(subtitle, WIDTH / 2, by + 80);

    // decorative small drone icon
    ctx.save();
    ctx.translate(WIDTH / 2 + boxW / 2 - 60, by + 40);
    ctx.scale(0.8, 0.8);
    drawMiniDrone(ctx);
    ctx.restore();

    // restart button
    const bw = 160;
    const bh = 46;
    const rx = (WIDTH - bw) / 2;
    const ry = by + 130;
    ctx.fillStyle = '#e6f8ff';
    roundRect(ctx, rx, ry, bw, bh, 10);
    ctx.fill();
    ctx.strokeStyle = '#7cc';
    ctx.stroke();
    ctx.fillStyle = '#045';
    ctx.font = '18px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
    ctx.fillText('Restart (R)', WIDTH / 2, ry + 12);

    // small hint
    ctx.font = '14px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
    ctx.fillStyle = '#113';
    ctx.fillText('Press R or click Restart to play again.', WIDTH / 2, ry + 44);
  }

  function drawMiniDrone(ctxLocal) {
    ctxLocal.save();
    ctxLocal.fillStyle = '#eaf7ff';
    ctxLocal.strokeStyle = '#0b3';
    ctxLocal.lineWidth = 1.4;
    ctxLocal.beginPath();
    ctxLocal.ellipse(-10, 4, 18, 9, 0, 0, Math.PI * 2);
    ctxLocal.fill();
    ctxLocal.stroke();
    // rotors
    ctxLocal.fillStyle = '#f5f5f0';
    ctxLocal.beginPath();
    ctxLocal.arc(-30, -8, 4, 0, Math.PI * 2);
    ctxLocal.fill();
    ctxLocal.beginPath();
    ctxLocal.arc(10, -8, 4, 0, Math.PI * 2);
    ctxLocal.fill();
    ctxLocal.restore();
  }

  // Particles draw and update
  function updateAndDrawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      // physics
      p.vy += 0.02 * (p.type === 'smoke' ? 0.02 : 0.08); // gravity-like
      p.x += p.vx;
      p.y += p.vy;
      // fade
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = alpha;
      if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 2, p.size * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Accessibility focus highlight helper (keeps existing)
  // Main draw loop
  let lastTick = performance.now();
  function frame() {
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;

    // clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawBackground();
    drawTopUI();
    drawQuestionArea();

    if (state.mode === 'start') {
      // big start card
      ctx.font = '26px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#023';
      const title = 'Drone Math — Power the Drone!';
      const subtitle = 'Answer 10 correctly to lift off. 3 wrong answers and the mission fails.';
      const w1 = Math.ceil(ctx.measureText(title).width);
      ctx.font = '16px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      const w2 = Math.ceil(ctx.measureText(subtitle).width);
      const boxW = Math.max(w1, w2) + 60;
      const bx = (WIDTH - boxW) / 2;
      const by = HEIGHT / 2 - 70;
      // card
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      roundRect(ctx, bx, by, boxW, 140, 12);
      ctx.fill();
      ctx.strokeStyle = '#e6f7f3';
      ctx.stroke();
      ctx.fillStyle = '#024';
      ctx.font = '26px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      ctx.fillText(title, WIDTH / 2, by + 10);
      ctx.font = '16px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      ctx.fillText(subtitle, WIDTH / 2, by + 56);
      ctx.fillStyle = '#046';
      ctx.font = '18px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      ctx.fillText('Press Space or Click to Start. Use 1-3 or click answers.', WIDTH / 2, by + 96);

      // friendly drone doodle on start
      ctx.save();
      ctx.translate(WIDTH / 2 + 190, HEIGHT / 2 - 40);
      ctx.scale(0.9, 0.9);
      ctx.fillStyle = '#fff2cc';
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c89';
      ctx.stroke();
      ctx.restore();
    } else if (state.mode === 'playing') {
      drawChoices();
      drawDrone();
      drawStarsCollected();
    } else if (state.mode === 'victory' || state.mode === 'gameover') {
      drawDrone();
      drawStarsCollected();
      drawEndScreen();
    }

    // accessibility focus highlight
    if (state.mode === 'playing' && answerBoxes[state.selectedIndex]) {
      const b = answerBoxes[state.selectedIndex];
      ctx.save();
      ctx.strokeStyle = '#ffd86b';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
      ctx.restore();
    }

    // update/draw particles
    updateAndDrawParticles(dt);

    requestAnimationFrame(frame);
  }

  // initial setup
  safeRequestAudioContext();
  restartGame();
  ctx.font = UI_FONT;
  computeAnswerBoxes();

  // Start render loop
  requestAnimationFrame(frame);

  // Expose some debug functions to console
  window.__droneMathGame = {
    restart: restartGame,
    start: startGame,
    state,
  };
})();