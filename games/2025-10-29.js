(function () {
  // Enhanced Drone Math Adventure (visuals & audio improved)
  // Renders game inside element with ID 'game-of-the-day-stage'
  // Only canvas and Web Audio API used. No external assets.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 12; // spacing for UI elements
  const TARGET_CORRECT = 10; // win condition
  const MAX_WRONG = 3; // lose condition

  // Visual style constants
  const SKY_TOP = '#dff3ff';
  const SKY_BOTTOM = '#e9f8ff';
  const GROUND_COLOR = '#e6f2ff';
  const DRONE_COLOR = '#5f97ff';
  const DRONE_ACCENT = '#ffd76a';
  const BUTTON_COLOR = '#ffffff';
  const BUTTON_BORDER = '#4d6fa9';
  const TEXT_COLOR = '#063247';
  const SHADOW_COLOR = 'rgba(0,0,0,0.12)';
  const FONT_BODY = '16px "Segoe UI", Roboto, Arial, sans-serif';
  const FONT_BIG = '22px "Segoe UI", Roboto, Arial, sans-serif';
  const FONT_TITLE = '28px "Segoe UI", Roboto, Arial, sans-serif';
  const BUTTON_PADDING = 10;

  // Container setup
  let container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container with id "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = WIDTH + 'px';
  container.style.height = HEIGHT + 'px';
  container.style.userSelect = 'none';
  container.style.webkitUserSelect = 'none';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Adventure: Answer math questions. Use number keys or click. Press M to mute, R to restart.'
  );
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Accessibility: hidden description element
  const desc = document.createElement('div');
  desc.style.position = 'absolute';
  desc.style.left = '-9999px';
  desc.style.top = '-9999px';
  desc.setAttribute('aria-hidden', 'false');
  desc.textContent =
    'Drone Math Adventure. Answer 10 questions correctly to win. Three wrong answers ends the game. Controls: 1-3 to choose, Enter to confirm, arrow keys to navigate, M to mute, R to restart.';
  container.appendChild(desc);

  // Audio setup with robust error handling
  let audioCtx = null;
  let ambientNodes = null;
  let soundOn = true;
  let noiseBuffer = null;
  let awaitingFirstGesture = true;

  function createAudioContext() {
    if (audioCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      audioCtx.suspend(); // start suspended until user gesture
    } catch (e) {
      console.warn('AudioContext not available:', e);
      audioCtx = null;
      soundOn = false;
    }
  }

  function createNoiseBuffer() {
    if (!audioCtx) return null;
    try {
      const sampleRate = audioCtx.sampleRate;
      const duration = 1.0; // 1 second looped noise
      const length = sampleRate * duration;
      const buffer = audioCtx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.25; // low volume noise
      }
      return buffer;
    } catch (e) {
      console.warn('Noise buffer creation failed', e);
      return null;
    }
  }

  // Ambient background: gentle pad + low pulse + soft wind (noise)
  function initAmbient() {
    if (!audioCtx || ambientNodes) return;
    try {
      const master = audioCtx.createGain();
      master.gain.value = 0.0001; // start silent
      master.connect(audioCtx.destination);

      // Pad: two detuned oscillators
      const padOscA = audioCtx.createOscillator();
      padOscA.type = 'sine';
      padOscA.frequency.value = 160;

      const padOscB = audioCtx.createOscillator();
      padOscB.type = 'sine';
      padOscB.frequency.value = 164; // slight detune

      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.03;

      // gentle lowpass to make it warm
      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 900;

      padOscA.connect(padFilter);
      padOscB.connect(padFilter);
      padFilter.connect(padGain);
      padGain.connect(master);

      // Slow LFO to modulate pad filter freq for movement
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07; // very slow
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 200;
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      // Pulse: subtle rhythmic element
      const pulseOsc = audioCtx.createOscillator();
      pulseOsc.type = 'sine';
      pulseOsc.frequency.value = 60;
      const pulseGain = audioCtx.createGain();
      pulseGain.gain.value = 0.005;
      pulseOsc.connect(pulseGain);
      pulseGain.connect(master);

      // Wind/noise
      noiseBuffer = createNoiseBuffer();
      let noiseSource = null;
      if (noiseBuffer) {
        noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 1200;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.value = 0.01;
        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(master);
      }

      // Start nodes (we might start them later when resuming)
      try {
        padOscA.start();
        padOscB.start();
        pulseOsc.start();
        lfo.start();
        if (noiseSource) noiseSource.start();
      } catch (e) {
        // nodes may already be started if reinitialized
      }

      ambientNodes = {
        master,
        padOscA,
        padOscB,
        padGain,
        padFilter,
        lfo,
        lfoGain,
        pulseOsc,
        pulseGain,
        noiseSource,
      };
    } catch (e) {
      console.warn('initAmbient failed', e);
      ambientNodes = null;
    }
  }

  function startBackground() {
    createAudioContext();
    if (!audioCtx) return;
    initAmbient();
    if (!ambientNodes) return;
    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch((e) => console.warn('Audio resume failed', e));
      }
      // gentle fade in
      const t = audioCtx.currentTime;
      ambientNodes.master.gain.cancelScheduledValues(t);
      ambientNodes.master.gain.setValueAtTime(0.0001, t);
      ambientNodes.master.gain.linearRampToValueAtTime(0.035, t + 1.2);
    } catch (e) {
      console.warn('startBackground error', e);
    }
  }

  function stopBackground() {
    if (!audioCtx || !ambientNodes) return;
    try {
      const t = audioCtx.currentTime;
      ambientNodes.master.gain.cancelScheduledValues(t);
      ambientNodes.master.gain.setValueAtTime(ambientNodes.master.gain.value, t);
      ambientNodes.master.gain.linearRampToValueAtTime(0.0001, t + 0.8);
    } catch (e) {
      console.warn('stopBackground error', e);
    }
  }

  // Sound effect utilities using oscillators and noise
  function playClick() {
    if (!audioCtx || !soundOn) return;
    try {
      const now = audioCtx.currentTime;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(audioCtx.destination);
      const osc = audioCtx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 800;
      osc.connect(gain);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {
      console.warn('playClick error', e);
    }
  }

  function playCorrect() {
    if (!audioCtx || !soundOn) return;
    try {
      const now = audioCtx.currentTime;
      // harmonic chime cluster
      const freqs = [660, 990, 1320];
      freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = i === 1 ? 'triangle' : 'sine';
        osc.frequency.value = f;
        const gain = audioCtx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06 / (i + 1), now + 0.02 + i * 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 + i * 0.05);
        osc.start(now);
        osc.stop(now + 0.6 + i * 0.05);
      });
      // soft sparkle noise
      if (noiseBuffer) {
        const s = audioCtx.createBufferSource();
        s.buffer = noiseBuffer;
        const nf = audioCtx.createBiquadFilter();
        nf.type = 'highpass';
        nf.frequency.value = 1200;
        const ng = audioCtx.createGain();
        ng.gain.value = 0.0001;
        s.connect(nf);
        nf.connect(ng);
        ng.connect(audioCtx.destination);
        s.start(now);
        ng.gain.setValueAtTime(0.0001, now);
        ng.gain.exponentialRampToValueAtTime(0.02, now + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        s.stop(now + 0.3);
      }
    } catch (e) {
      console.warn('playCorrect error', e);
    }
  }

  function playWrong() {
    if (!audioCtx || !soundOn) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 160;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.52);
    } catch (e) {
      console.warn('playWrong error', e);
    }
  }

  // Game state variables (mechanics unchanged)
  let correctCount = 0;
  let wrongCount = 0;
  let currentQuestion = null;
  let choices = [];
  let selectedIndex = 0;
  let gameState = 'playing'; // 'playing', 'won', 'lost'
  let shakeTimer = 0;
  let animationTick = 0;
  let lastActionMsg = '';
  let correctAnswer = null;

  // Utility functions
  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function generateQuestion() {
    // Preserved math logic (ages 7-9)
    const typeRoll = Math.random();
    let a, b, op, answer, text;
    if (typeRoll < 0.5) {
      a = randInt(1, 20);
      b = randInt(1, 20);
      op = '+';
      answer = a + b;
      text = `${a} + ${b} = ?`;
    } else if (typeRoll < 0.85) {
      a = randInt(5, 25);
      b = randInt(1, a - 1);
      op = '−';
      answer = a - b;
      text = `${a} − ${b} = ?`;
    } else {
      a = randInt(2, 7);
      b = randInt(2, 6);
      op = '×';
      answer = a * b;
      text = `${a} × ${b} = ?`;
    }

    const opts = new Set();
    opts.add(answer);
    while (opts.size < 3) {
      let delta = randInt(1, Math.max(3, Math.floor(answer * 0.5) + 1));
      if (Math.random() < 0.5) delta = -delta;
      const candidate = answer + delta;
      if (candidate >= 0 && !opts.has(candidate)) opts.add(candidate);
    }
    const optArray = Array.from(opts);
    for (let i = optArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optArray[i], optArray[j]] = [optArray[j], optArray[i]];
    }
    return { text, answer, choices: optArray };
  }

  function startNewQuestion() {
    const q = generateQuestion();
    currentQuestion = q.text;
    choices = q.choices;
    correctAnswer = q.answer;
    selectedIndex = 0;
  }

  // Initialize
  startNewQuestion();

  // Input handling
  function ensureAudioOnUserGesture() {
    if (!awaitingFirstGesture) return;
    createAudioContext();
    if (audioCtx) {
      startBackground();
    }
    awaitingFirstGesture = false;
  }

  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (awaitingFirstGesture) ensureAudioOnUserGesture();
    if (gameState === 'won' || gameState === 'lost') {
      if (e.key.toLowerCase() === 'r') {
        restartGame();
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      selectedIndex = (selectedIndex + choices.length - 1) % choices.length;
      lastActionMsg = `Selected choice ${selectedIndex + 1}`;
      playClick();
    } else if (e.key === 'ArrowRight') {
      selectedIndex = (selectedIndex + 1) % choices.length;
      lastActionMsg = `Selected choice ${selectedIndex + 1}`;
      playClick();
    } else if (e.key === 'Enter') {
      submitAnswer(selectedIndex);
    } else if (['1', '2', '3'].includes(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < choices.length) {
        selectedIndex = idx;
        submitAnswer(idx);
      }
    } else if (e.key.toLowerCase() === 'm') {
      toggleSound();
    } else if (e.key.toLowerCase() === 'r') {
      restartGame();
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (awaitingFirstGesture) ensureAudioOnUserGesture();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (gameState === 'won' || gameState === 'lost') {
      const restartRect = getRestartButtonRect();
      if (pointInRect(x, y, restartRect)) {
        restartGame();
      }
      return;
    }

    const speakerRect = getSpeakerRect();
    if (pointInRect(x, y, speakerRect)) {
      toggleSound();
      return;
    }

    const btnRects = getChoiceButtonRects();
    for (let i = 0; i < btnRects.length; i++) {
      if (pointInRect(x, y, btnRects[i])) {
        selectedIndex = i;
        playClick();
        submitAnswer(i);
        return;
      }
    }
  });

  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  function getSpeakerRect() {
    const size = 34;
    return { x: WIDTH - PADDING - size, y: PADDING, w: size, h: size };
  }

  function getScoreRect() {
    return { x: PADDING, y: PADDING, w: 220, h: 40 };
  }

  function getLivesRect() {
    return { x: WIDTH - PADDING - 180, y: PADDING, w: 180, h: 40 };
  }

  function getQuestionRect() {
    const w = WIDTH - 2 * PADDING - 160;
    return { x: (WIDTH - w) / 2, y: 70, w, h: 80 };
  }

  function getChoiceButtonRects() {
    const btnW = (WIDTH - PADDING * 2 - 40) / 3;
    const btnH = 64;
    const y = 280;
    const rects = [];
    for (let i = 0; i < 3; i++) {
      rects.push({ x: PADDING + i * (btnW + 20), y, w: btnW, h: btnH });
    }
    return rects;
  }

  function getInstructionsRect() {
    const h = 64;
    return { x: PADDING, y: HEIGHT - PADDING - h, w: WIDTH - 2 * PADDING, h };
  }

  function getRestartButtonRect() {
    const w = 180;
    const h = 48;
    return { x: (WIDTH - w) / 2, y: HEIGHT / 2 + 60, w, h };
  }

  // Submission logic (unchanged mechanics)
  function submitAnswer(idx) {
    if (gameState !== 'playing') return;
    if (idx < 0 || idx >= choices.length) return;
    const chosen = choices[idx];
    if (chosen === correctAnswer) {
      correctCount++;
      lastActionMsg = `Correct! ${chosen}`;
      playCorrect();
      spawnParticles(true);
      shakeTimer = 10;
      if (correctCount >= TARGET_CORRECT) {
        gameState = 'won';
        stopBackground();
      } else {
        startNewQuestion();
      }
    } else {
      wrongCount++;
      lastActionMsg = `Wrong. You picked ${chosen}`;
      playWrong();
      spawnParticles(false);
      shakeTimer = 18;
      if (wrongCount >= MAX_WRONG) {
        gameState = 'lost';
        stopBackground();
      } else {
        startNewQuestion();
      }
    }
  }

  function restartGame() {
    correctCount = 0;
    wrongCount = 0;
    startNewQuestion();
    gameState = 'playing';
    shakeTimer = 0;
    awaitingFirstGesture = true;
    lastActionMsg = 'Game restarted';
    try {
      if (audioCtx && audioCtx.state === 'running' && soundOn) {
        startBackground();
      }
    } catch (e) {
      console.warn(e);
    }
  }

  function toggleSound() {
    createAudioContext();
    soundOn = !soundOn;
    if (soundOn) {
      startBackground();
    } else {
      stopBackground();
    }
  }

  // Visual helpers
  function clearScreen() {
    // vertical sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle vignette
    ctx.fillStyle = 'rgba(8, 20, 30, 0.02)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawRoundedRect(x, y, w, h, r = 8, fill = true, stroke = true) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Particles for celebration / feedback
  const particles = [];
  function spawnParticles(success) {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2 - 20;
    const count = success ? 22 : 12;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = success ? 2 + Math.random() * 3 : 1 + Math.random() * 2;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 60 + Math.floor(Math.random() * 30),
        color: success ? (i % 2 ? '#ffd76a' : '#9be7ff') : '#f0a2a2',
        size: success ? 3 + Math.random() * 3 : 2 + Math.random() * 2,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.06; // gravity gentle
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Drone drawing with soft shadows and subtle motion
  function drawDrone(x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.save();
    // apply shake
    if (shakeTimer > 0) {
      const shakeOffset = Math.sin(animationTick / 3) * 4;
      ctx.translate(shakeOffset, 0);
    }
    ctx.translate(cx, cy);

    // shadow/ground under drone
    ctx.fillStyle = 'rgba(10,30,50,0.06)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.48, w * 0.5, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = DRONE_COLOR;
    ctx.strokeStyle = 'rgba(20,60,100,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.46, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // windows
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-w * 0.14, -4, w * 0.12, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.18, -2, w * 0.08, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // accent stripe with subtle gradient
    const grad = ctx.createLinearGradient(-w * 0.45, 0, w * 0.45, 0);
    grad.addColorStop(0, DRONE_ACCENT);
    grad.addColorStop(1, '#ffdca4');
    ctx.fillStyle = grad;
    ctx.fillRect(-w * 0.45, h * 0.12, w * 0.9, h * 0.12);

    // arms & propellers animated
    const pr = Math.min(w, h) * 0.12;
    const armLen = w * 0.66;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 6;
      const ax = Math.cos(angle) * armLen / 2;
      const ay = Math.sin(angle) * armLen / 2 - 8;
      // arm
      ctx.strokeStyle = 'rgba(40,80,130,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ax, ay);
      ctx.stroke();

      // propeller disc with rotating blades
      ctx.save();
      ctx.translate(ax, ay);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // blades
      ctx.rotate(animationTick / 8 + i);
      ctx.fillStyle = 'rgba(167,194,232,0.9)';
      for (let b = 0; b < 3; b++) {
        ctx.save();
        ctx.rotate((b / 3) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -pr * 0.45, pr * 0.18, pr * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    // face details
    ctx.fillStyle = '#2b3b4d';
    ctx.beginPath();
    ctx.arc(-w * 0.14, -4, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.18, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#2b3b4d';
    ctx.lineWidth = 1.2;
    ctx.arc(0, h * 0.02, 8, 0.12 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  // Draw soft clouds moving horizontally (parallax)
  const clouds = [];
  function initClouds() {
    clouds.length = 0;
    for (let i = 0; i < 6; i++) {
      clouds.push({
        x: Math.random() * WIDTH,
        y: 30 + Math.random() * 120,
        scale: 0.7 + Math.random() * 1.1,
        speed: 0.15 + Math.random() * 0.3,
        alpha: 0.5 + Math.random() * 0.4,
      });
    }
  }
  initClouds();

  function drawCloud(cx, cy, scale, alpha) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 24, 0, 0, Math.PI * 2);
    ctx.ellipse(30, -6, 28, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(58, 0, 32, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(28, 10, 34, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Draw UI
  function drawUI() {
    // moving clouds background
    for (let c of clouds) {
      c.x += c.speed;
      if (c.x - 120 > WIDTH) c.x = -120;
      drawCloud(c.x, c.y, c.scale, c.alpha);
    }

    // ground subtle pattern near bottom
    ctx.fillStyle = GROUND_COLOR;
    ctx.fillRect(0, HEIGHT - 120, WIDTH, 120);
    // soft ground stripes
    ctx.strokeStyle = 'rgba(20,80,140,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < WIDTH; i += 18) {
      ctx.beginPath();
      ctx.moveTo(i, HEIGHT - 80 + Math.sin((i + animationTick) / 40) * 4);
      ctx.lineTo(i + 12, HEIGHT - 40 + Math.cos((i + animationTick) / 40) * 3);
      ctx.stroke();
    }

    // Score
    ctx.font = FONT_BIG;
    ctx.textBaseline = 'middle';
    const scoreRect = getScoreRect();
    const scoreText = `Score: ${correctCount}/${TARGET_CORRECT}`;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0;
    // soft blur-like background panel
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(160,200,255,0.6)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(scoreRect.x, scoreRect.y, scoreRect.w, scoreRect.h, 10, true, true);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(scoreText, scoreRect.x + PADDING, scoreRect.y + scoreRect.h / 2);

    // Lives
    const livesRect = getLivesRect();
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrongCount)} / ${MAX_WRONG}`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(255,230,160,0.6)';
    drawRoundedRect(livesRect.x, livesRect.y, livesRect.w, livesRect.h, 10, true, true);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(livesText, livesRect.x + PADDING, livesRect.y + livesRect.h / 2);

    // Speaker
    const sp = getSpeakerRect();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(200,225,255,0.7)';
    drawRoundedRect(sp.x, sp.y, sp.w, sp.h, 8, true, true);
    // glyph
    ctx.fillStyle = TEXT_COLOR;
    const centerX = sp.x + sp.w * 0.35;
    const centerY = sp.y + sp.h / 2;
    ctx.fillRect(centerX - 6, centerY - 7, 12, 14);
    ctx.beginPath();
    ctx.moveTo(centerX + 6, centerY - 10);
    ctx.lineTo(centerX + 18, centerY);
    ctx.lineTo(centerX + 6, centerY + 10);
    ctx.closePath();
    ctx.fill();
    if (soundOn) {
      ctx.strokeStyle = '#2b6cb0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sp.x + sp.w - 10, sp.y + sp.h / 2 - 9);
      ctx.lineTo(sp.x + sp.w - 4, sp.y + sp.h / 2 - 4);
      ctx.moveTo(sp.x + sp.w - 10, sp.y + sp.h / 2 + 0);
      ctx.lineTo(sp.x + sp.w - 4, sp.y + sp.h / 2 + 6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#a0a0a0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sp.x + 6, sp.y + 6);
      ctx.lineTo(sp.x + sp.w - 6, sp.y + sp.h - 6);
      ctx.moveTo(sp.x + sp.w - 6, sp.y + 6);
      ctx.lineTo(sp.x + 6, sp.y + sp.h - 6);
      ctx.stroke();
    }

    // Question box
    const qRect = getQuestionRect();
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.strokeStyle = 'rgba(200,225,255,0.7)';
    ctx.lineWidth = 1.5;
    drawRoundedRect(qRect.x, qRect.y, qRect.w, qRect.h, 12, true, true);
    // question text
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = FONT_TITLE;
    const qText = currentQuestion || '';
    const maxWidth = qRect.w - 2 * PADDING;
    const qWidth = ctx.measureText(qText).width;
    if (qWidth <= maxWidth) {
      ctx.fillText(qText, qRect.x + (qRect.w - qWidth) / 2, qRect.y + qRect.h / 2 + 6);
    } else {
      // simple wrap
      const words = qText.split(' ');
      let line = '';
      const lines = [];
      for (let w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width <= maxWidth) {
          line = test;
        } else {
          lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
      const lineHeight = 30;
      const startY = qRect.y + (qRect.h - lines.length * lineHeight) / 2;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(
          lines[i],
          qRect.x + (qRect.w - ctx.measureText(lines[i]).width) / 2,
          startY + i * lineHeight + 18
        );
      }
    }

    // Drone to left of question
    drawDrone(qRect.x - 150, qRect.y - 10, 130, 90);

    // Choice buttons
    const btnRects = getChoiceButtonRects();
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < btnRects.length; i++) {
      const r = btnRects[i];
      // shadow
      ctx.fillStyle = SHADOW_COLOR;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(r.x + 2, r.y + 6, r.w, r.h, 10) : null;
      ctx.fillRect(r.x + 2, r.y + 6, r.w, r.h);

      // background
      ctx.fillStyle = BUTTON_COLOR;
      ctx.strokeStyle = BUTTON_BORDER;
      ctx.lineWidth = selectedIndex === i ? 3 : 1.6;
      drawRoundedRect(r.x, r.y, r.w, r.h, 12, true, true);

      // number prefix
      ctx.fillStyle = '#5c7db0';
      ctx.font = '18px "Segoe UI", Roboto, Arial, sans-serif';
      const prefix = `${i + 1}. `;
      ctx.fillText(prefix, r.x + BUTTON_PADDING, r.y + r.h / 2);

      // value centered
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = FONT_BIG;
      const valueText = String(choices[i]);
      const valueWidth = ctx.measureText(valueText).width;
      const valueX = r.x + (r.w - valueWidth) / 2 + 6;
      ctx.fillText(valueText, valueX, r.y + r.h / 2);

      // selected accent outline
      if (selectedIndex === i) {
        ctx.strokeStyle = DRONE_ACCENT;
        ctx.lineWidth = 3;
        drawRoundedRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12, 8, false, true);
      }
    }

    // Instructions area
    const instrRect = getInstructionsRect();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(200,225,255,0.6)';
    drawRoundedRect(instrRect.x, instrRect.y, instrRect.w, instrRect.h, 10, true, true);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'top';
    const instr =
      'Click a choice or press 1-3. ← → to change selection. Enter to submit. M mute, R restart.';
    const maxInstrW = instrRect.w - 2 * PADDING;
    const instrWords = instr.split(' ');
    let lines = [];
    let cur = '';
    for (let w of instrWords) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width <= maxInstrW) {
        cur = test;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], instrRect.x + PADDING, instrRect.y + PADDING + i * 20);
    }

    // last action small text
    ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#3a3a3a';
    const msg = lastActionMsg || '';
    ctx.fillText(msg, instrRect.x + PADDING, instrRect.y + PADDING + lines.length * 20 + 6);

    // render particles above everything
    updateParticles();
    drawParticles();
  }

  // End screen overlay (kept win/loss logic)
  function drawEndScreen() {
    ctx.fillStyle = 'rgba(4,8,20,0.55)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = FONT_TITLE;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';

    let title = '';
    if (gameState === 'won') {
      title = 'Victory! Drone Fleet Celebrates!';
    } else if (gameState === 'lost') {
      title = 'Game Over. Grounded for now.';
    } else {
      title = 'Finished';
    }
    const titleW = ctx.measureText(title).width;
    ctx.fillText(title, (WIDTH - titleW) / 2, HEIGHT / 2 - 40);

    ctx.font = FONT_BIG;
    let message = '';
    if (gameState === 'won') {
      message = `You answered ${correctCount} questions correctly!`;
    } else {
      message = `You got ${wrongCount} wrong. Correct: ${correctCount}.`;
    }
    const msgW = ctx.measureText(message).width;
    ctx.fillText(message, (WIDTH - msgW) / 2, HEIGHT / 2);

    // Restart button
    const r = getRestartButtonRect();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#9ad1ff';
    ctx.lineWidth = 1.6;
    drawRoundedRect(r.x, r.y, r.w, r.h, 10, true, true);
    ctx.fillStyle = '#1b3f6b';
    ctx.font = '18px "Segoe UI", Roboto, Arial, sans-serif';
    const btnText = 'Restart (R)';
    const bw = ctx.measureText(btnText).width;
    ctx.fillText(btnText, r.x + (r.w - bw) / 2, r.y + r.h / 2);

    // audio hint
    ctx.font = FONT_BODY;
    ctx.fillStyle = '#ffffff';
    const audioHint = 'Press M to toggle sound.';
    ctx.fillText(audioHint, (WIDTH - ctx.measureText(audioHint).width) / 2, r.y + r.h + 30);
  }

  // Main loop
  function update() {
    animationTick++;
    if (shakeTimer > 0) shakeTimer--;
    clearScreen();
    drawUI();
    if (gameState !== 'playing') {
      drawEndScreen();
    }
    requestAnimationFrame(update);
  }

  // Particle initialization on first user gesture
  function onFirstInteraction() {
    if (!awaitingFirstGesture) return;
    ensureAudioOnUserGesture();
  }
  ['mousedown', 'touchstart', 'keydown'].forEach((ev) => {
    window.addEventListener(ev, onFirstInteraction, { once: true });
  });

  // Start audio context if allowed (but ambient will remain silent until gesture)
  createAudioContext();
  if (audioCtx && !awaitingFirstGesture && soundOn) {
    startBackground();
  }

  // Start loop
  canvas.focus();
  requestAnimationFrame(update);

  // Ensure container keyboard focusing helps canvas
  container.addEventListener('keydown', () => {
    if (document.activeElement !== canvas) canvas.focus();
  });

  // graceful error logging
  window.addEventListener('error', (ev) => {
    console.error('Error in Drone Math Adventure:', ev.message);
  });

  // rounded rect polyfill for some contexts (not necessary but safe)
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
    };
  }

  // Expose minimal interface for tests
  window.__droneMathGame = {
    restart: restartGame,
    toggleSound,
    getState: () => ({ correctCount, wrongCount, gameState }),
  };
})();