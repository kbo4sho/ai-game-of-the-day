(function () {
  // Enhanced Drone Math Adventure — Visuals & Audio Upgrades Only
  // Renders into element with id "game-of-the-day-stage"
  // Gameplay, scoring and math logic preserved exactly as original.
  // All visuals are canvas-drawn. All audio generated with Web Audio API.
  // Canvas size exactly 720 x 480.

  // Configuration (kept game-critical values the same)
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 12;
  const TARGET_CORRECT = 10;
  const WRONG_ALLOWED = 3;
  const FONT_BODY = '16px Arial';
  const FONT_IMPORTANT = '20px Arial';
  const FONT_TITLE = '28px "Segoe UI", Arial';

  // Container & Canvas
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element #game-of-the-day-stage not found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.setAttribute('role', 'application');
  container.setAttribute(
    'aria-label',
    'Drone Math Adventure. Use number keys 1 to 3 to answer. Press Space to start audio. Press R to restart.'
  );

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Audio: Web Audio API setup with robust error handling
  let audioCtx = null;
  let masterGain = null;
  let ambienceOsc = null;
  let ambienceGain = null;
  let ambienceFilter = null;
  let pulseLFO = null;
  let audioEnabled = false;
  let muted = false;
  let audioInitTried = false;

  function safeCreateAudioContext() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not available');
      audioCtx = new AC();
      return true;
    } catch (err) {
      console.warn('Audio context creation failed:', err);
      audioCtx = null;
      return false;
    }
  }

  function initAudio() {
    if (audioInitTried) return;
    audioInitTried = true;

    if (!safeCreateAudioContext()) {
      audioEnabled = false;
      return;
    }

    try {
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.12; // comfortable overall volume
      masterGain.connect(audioCtx.destination);

      // Ambient pad oscillator with low-frequency amplitude modulation for a soft background
      ambienceOsc = audioCtx.createOscillator();
      ambienceOsc.type = 'sine';
      ambienceOsc.frequency.value = 110; // base pitch
      ambienceFilter = audioCtx.createBiquadFilter();
      ambienceFilter.type = 'lowpass';
      ambienceFilter.frequency.value = 420; // mellow tone

      // Slight movement: pulse LFO shapes the amplitude
      pulseLFO = audioCtx.createOscillator();
      pulseLFO.type = 'sine';
      pulseLFO.frequency.value = 0.12; // very slow breathe
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.025; // subtle depth

      ambienceGain = audioCtx.createGain();
      ambienceGain.gain.value = 0.02; // soft background level

      // Connect nodes: LFO -> ambienceGain.gain
      pulseLFO.connect(lfoGain);
      lfoGain.connect(ambienceGain.gain);

      ambienceOsc.connect(ambienceFilter);
      ambienceFilter.connect(ambienceGain);
      ambienceGain.connect(masterGain);

      // gentle stereo movement by panning (optional fallback)
      try {
        if (audioCtx.createStereoPanner) {
          const pan = audioCtx.createStereoPanner();
          pan.pan.value = -0.08;
          ambienceGain.disconnect();
          ambienceGain.connect(pan);
          pan.connect(masterGain);
        }
      } catch (e) {
        // ignore if not supported
      }

      // Start oscillators
      ambienceOsc.start();
      pulseLFO.start();

      audioEnabled = true;
    } catch (e) {
      console.warn('Audio initialization error:', e);
      audioEnabled = false;
    }
  }

  // Utility to safely resume audio context on user gesture
  async function ensureAudioRunning() {
    if (!audioEnabled || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
    } catch (e) {
      console.warn('Audio resume failed:', e);
    }
  }

  // Helper to schedule short sound effects using Oscillator, Gain and filter
  function playTone({
    frequency = 440,
    type = 'sine',
    duration = 0.15,
    volume = 0.08,
    attack = 0.005,
    release = 0.06,
    filterFreq = 1200
  }) {
    if (!audioEnabled || muted || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + attack);
      gain.gain.linearRampToValueAtTime(0.0001, now + duration - release);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.02);
      // Let GC clean up nodes when they stop
    } catch (err) {
      console.warn('playTone error:', err);
    }
  }

  // Compose feedback sounds: correct (bright chime), incorrect (soft thud + minor)
  function playCorrect() {
    playTone({
      frequency: 660,
      type: 'sine',
      duration: 0.14,
      volume: 0.12,
      attack: 0.004,
      release: 0.06,
      filterFreq: 1800
    });
    setTimeout(
      () =>
        playTone({
          frequency: 880,
          type: 'triangle',
          duration: 0.12,
          volume: 0.09,
          attack: 0.004,
          release: 0.05,
          filterFreq: 2400
        }),
      80
    );
    // tiny bell harmonic
    setTimeout(
      () =>
        playTone({
          frequency: 1320,
          type: 'sine',
          duration: 0.10,
          volume: 0.06,
          attack: 0.003,
          release: 0.04,
          filterFreq: 3000
        }),
      140
    );
  }

  function playIncorrect() {
    // low thud
    playTone({
      frequency: 160,
      type: 'sawtooth',
      duration: 0.22,
      volume: 0.10,
      attack: 0.005,
      release: 0.08,
      filterFreq: 600
    });
    // small descending minor
    setTimeout(
      () =>
        playTone({
          frequency: 220,
          type: 'sine',
          duration: 0.14,
          volume: 0.07,
          attack: 0.004,
          release: 0.06,
          filterFreq: 900
        }),
      80
    );
  }

  function playSelectClick() {
    playTone({
      frequency: 880,
      type: 'square',
      duration: 0.06,
      volume: 0.04,
      attack: 0.002,
      release: 0.03,
      filterFreq: 2200
    });
  }

  function playWinFanfare() {
    // small fanfare sequence
    playTone({
      frequency: 880,
      type: 'sine',
      duration: 0.16,
      volume: 0.12,
      attack: 0.004,
      release: 0.06,
      filterFreq: 2800
    });
    setTimeout(
      () =>
        playTone({
          frequency: 1100,
          type: 'triangle',
          duration: 0.14,
          volume: 0.10,
          attack: 0.004,
          release: 0.06,
          filterFreq: 3200
        }),
      140
    );
    setTimeout(
      () =>
        playTone({
          frequency: 1320,
          type: 'sine',
          duration: 0.10,
          volume: 0.08,
          attack: 0.003,
          release: 0.04,
          filterFreq: 3600
        }),
      260
    );
  }

  // Game state variables (mechanics unchanged)
  let state = 'intro'; // 'intro'|'playing'|'won'|'lost'
  let score = 0;
  let lives = WRONG_ALLOWED;
  let question = null;
  let options = [];
  let correctIndex = 0;
  let selectedIndex = 0;
  let droneX = WIDTH / 2;
  let droneY = HEIGHT / 3;
  let droneTargetX = droneX;
  let droneTargetY = droneY;
  let animations = [];
  let spawnStars = [];

  // Visual background elements
  const parallaxHills = [
    { offset: 0.0, color1: '#e8f6ff', color2: '#d3eefc', height: 140, speed: 0.02 },
    { offset: 0.3, color1: '#e3f2fb', color2: '#cfeaf8', height: 120, speed: 0.035 },
    { offset: 0.6, color1: '#d6eef8', color2: '#bfe4f4', height: 90, speed: 0.055 }
  ];

  const bgParticles = [];
  for (let i = 0; i < 28; i++) {
    bgParticles.push({
      x: Math.random() * WIDTH,
      y: Math.random() * (HEIGHT * 0.5),
      size: 1 + Math.random() * 2,
      speed: 0.02 + Math.random() * 0.06,
      alpha: 0.06 + Math.random() * 0.12
    });
  }

  // Timing
  let lastTime = performance.now();

  // Accessibility: announcements
  function announce(text) {
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-label', text + '. ' + 'Score ' + score + ', lives ' + lives);
    latestAnnouncement = text;
    latestAnnouncementTimer = 2400;
  }
  let latestAnnouncement = '';
  let latestAnnouncementTimer = 0;

  // Math question generator (kept unchanged)
  function makeQuestion() {
    const typeRand = Math.random();
    let a, b, op, correct;
    if (typeRand < 0.6) {
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * 20) + 1;
      op = '+';
      correct = a + b;
    } else if (typeRand < 0.9) {
      a = Math.floor(Math.random() * 20) + 5;
      b = Math.floor(Math.random() * 15);
      op = '-';
      correct = a - b;
    } else {
      a = Math.floor(Math.random() * 8) + 2;
      b = Math.floor(Math.random() * 8) + 2;
      op = '×';
      correct = a * b;
    }
    const opts = new Set();
    opts.add(correct);
    while (opts.size < 3) {
      const perturb = Math.floor(Math.random() * 7) - 3;
      let val = correct + perturb;
      if (val < 0) val = Math.abs(val) + 1;
      if (val === correct) val = correct + (Math.random() < 0.5 ? 2 : -2);
      opts.add(val);
    }
    const arrayOpts = Array.from(opts);
    for (let i = arrayOpts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arrayOpts[i], arrayOpts[j]] = [arrayOpts[j], arrayOpts[i]];
    }
    correctIndex = arrayOpts.indexOf(correct);
    options = arrayOpts;
    question = `${a} ${op} ${b} = ?`;
    selectedIndex = 0;
    announce('New question: ' + question);
  }

  function resetGame() {
    score = 0;
    lives = WRONG_ALLOWED;
    spawnStars = [];
    animations = [];
    droneX = WIDTH / 2;
    droneY = HEIGHT / 3;
    droneTargetX = droneX;
    droneTargetY = droneY;
    latestAnnouncement = '';
    latestAnnouncementTimer = 0;
    makeQuestion();
    state = 'playing';
    announce(
      'Game started. Answer ' +
        TARGET_CORRECT +
        ' questions correctly to win. You have ' +
        WRONG_ALLOWED +
        ' lives.'
    );
  }

  let optionRects = [];
  let restartRect = null;

  // Drawing helpers
  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawBackground(now) {
    // soft gradient sky top to bottom
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#f3fbff');
    g.addColorStop(0.55, '#e9f7ff');
    g.addColorStop(1, '#f7fbff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle sun / glow
    const sunX = WIDTH * 0.12 + Math.sin(now / 8000) * 8;
    const sunY = HEIGHT * 0.15 + Math.cos(now / 7000) * 6;
    const rad = 56;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, rad);
    sunGrad.addColorStop(0, 'rgba(255,240,200,0.9)');
    sunGrad.addColorStop(0.5, 'rgba(255,240,200,0.25)');
    sunGrad.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunX - rad, sunY - rad, rad * 2, rad * 2);

    // moving parallax hills
    parallaxHills.forEach((hill, idx) => {
      const t = (now * hill.speed) / 1000;
      ctx.beginPath();
      const baseY = HEIGHT - hill.height + idx * 8;
      ctx.moveTo(-200 + (t % 400), HEIGHT);
      for (let x = -200; x <= WIDTH + 200; x += 40) {
        const y = baseY + Math.sin(x / 80 + t + idx) * 18;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(WIDTH + 200, HEIGHT);
      ctx.closePath();
      const lg = ctx.createLinearGradient(0, baseY - hill.height, 0, HEIGHT);
      lg.addColorStop(0, hill.color1);
      lg.addColorStop(1, hill.color2);
      ctx.fillStyle = lg;
      ctx.fill();
    });

    // faint floating particles (like pollen) for depth, move upward slowly
    bgParticles.forEach(p => {
      p.x += Math.sin(now / 4000 + p.x) * 0.02;
      p.y -= p.speed;
      if (p.y < -10) p.y = HEIGHT * 0.45 + Math.random() * 40;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // soft cloud layers (kept subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 4; i++) {
      const cx = (i * 210 + Math.sin(now / (5000 + i * 600)) * 18) % (WIDTH + 240) - 120;
      const cy = 60 + i * 18 + Math.sin(now / (4600 + i * 800)) * 6;
      drawCloud(cx, cy, 60 + (i % 2) * 16, 0.88 - i * 0.08);
    }
  }

  function drawCloud(cx, cy, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size, size * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + size * 0.7, cy + 6, size * 0.8, size * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - size * 0.6, cy + 4, size * 0.7, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDrone(x, y, t, hoverPhase) {
    // polished drone with glow, soft shadows and smoother props
    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(hoverPhase / 230) * 4;
    ctx.translate(0, bob);

    // drop shadow
    ctx.beginPath();
    ctx.ellipse(0, 46, 86, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,20,30,0.06)';
    ctx.fill();

    // subtle glow around drone
    const glow = ctx.createRadialGradient(0, -4, 10, 0, -4, 80);
    glow.addColorStop(0, 'rgba(139,211,255,0.22)');
    glow.addColorStop(1, 'rgba(139,211,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, -4, 78, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // main body with gradient
    const bodyGrad = ctx.createLinearGradient(-50, -20, 50, 20);
    bodyGrad.addColorStop(0, '#a1e4ff');
    bodyGrad.addColorStop(0.6, '#8bd3ff');
    bodyGrad.addColorStop(1, '#6ec3f7');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#3a91b2';
    ctx.lineWidth = 2;
    drawRoundedRect(-50, -22, 100, 44, 12);

    // cockpit window
    const winGrad = ctx.createLinearGradient(-15, -12, 30, 12);
    winGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
    winGrad.addColorStop(1, 'rgba(255,255,255,0.35)');
    ctx.fillStyle = winGrad;
    ctx.beginPath();
    ctx.ellipse(-6, -2, 34, 18, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // nose
    ctx.fillStyle = '#5fbff0';
    ctx.beginPath();
    ctx.moveTo(50, 0);
    ctx.lineTo(70, -10);
    ctx.lineTo(70, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // eyes (playful)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-20, 0, 12, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(12, 0, 12, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0b2b36';
    const eyeShift = Math.sin(hoverPhase / 240) * 1.8;
    ctx.beginPath();
    ctx.ellipse(-20 + eyeShift, 0 + Math.sin(hoverPhase / 200) * 0.8, 5.4, 6.2, 0, 0, Math.PI * 2);
    ctx.ellipse(12 + eyeShift, 0 + Math.cos(hoverPhase / 210) * 0.8, 5.4, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // arms with rotor hubs
    ctx.strokeStyle = '#5aa7c7';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-38, -12);
    ctx.lineTo(-86, -40);
    ctx.moveTo(38, -12);
    ctx.lineTo(86, -40);
    ctx.moveTo(-38, 12);
    ctx.lineTo(-86, 40);
    ctx.moveTo(38, 12);
    ctx.lineTo(86, 40);
    ctx.stroke();

    // rotors with gentle blur-like semi-transparent blades
    for (let i = 0; i < 4; i++) {
      const rotorAngle = t / 70 + i * Math.PI * 0.5;
      const rx = Math.cos((i * Math.PI) / 2) * 90;
      const ry = Math.sin((i * Math.PI) / 2) * 40;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rotorAngle);
      // translucent blades for motion effect
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(60,60,60,0.34)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 36, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // small hub
      ctx.beginPath();
      ctx.fillStyle = '#2f3b42';
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawStar(x, y, r, filled = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * r, -Math.sin((18 + i * 72) / 180 * Math.PI) * r);
      ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * (r / 2.3), -Math.sin((54 + i * 72) / 180 * Math.PI) * (r / 2.3));
    }
    ctx.closePath();
    ctx.fillStyle = filled ? '#ffd166' : 'rgba(255,209,102,0.38)';
    ctx.fill();
    ctx.strokeStyle = '#e6b543';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawUI(now) {
    ctx.font = FONT_IMPORTANT;
    ctx.textBaseline = 'top';
    ctx.lineWidth = 1;

    // Score top-left within a rounded pill
    const scoreText = 'Stars: ' + score + ' / ' + TARGET_CORRECT;
    ctx.font = FONT_IMPORTANT;
    const scoreW = ctx.measureText(scoreText).width;
    const scoreX = PADDING;
    const scoreY = PADDING;
    const scorePadX = 12;
    const scorePadY = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = 'rgba(6,66,99,0.06)';
    ctx.lineWidth = 1;
    drawRoundedRect(scoreX - scorePadX, scoreY - scorePadY, scoreW + scorePadX * 2, 36, 18);
    ctx.fillStyle = '#0b5394';
    ctx.fillText(scoreText, scoreX, scoreY + 2);

    // Lives top-right with heart-ish visuals
    const livesText = 'Lives: ' + lives;
    const livesPadX = 12;
    const livesX = WIDTH - ctx.measureText(livesText).width - PADDING - livesPadX;
    const livesY = PADDING;
    drawRoundedRect(livesX - livesPadX, livesY - scorePadY, ctx.measureText(livesText).width + livesPadX * 2, 36, 18);
    ctx.fillStyle = '#b22222';
    ctx.fillText(livesText, livesX + 4, livesY + 2);

    // Instructions bottom-center with translucent background
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'bottom';
    const instr =
      state === 'intro'
        ? 'Press Space or Click to Start. Use 1/2/3 to choose, arrows to move selection, Enter to confirm. M to mute, R to restart.'
        : 'Choose the correct answer! Keys: 1-3 to pick, Enter to confirm. M to mute. R to restart.';
    const instrW = ctx.measureText(instr).width;
    const instrX = Math.max(PADDING, (WIDTH - instrW) / 2);
    const instrY = HEIGHT - PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(instrX - 10, instrY - 40, instrW + 20, 44);
    ctx.fillStyle = '#064273';
    ctx.fillText(instr, instrX, instrY - 6);

    // audio icon near bottom-left (keeps small and unobtrusive)
    drawSpeaker(PADDING, HEIGHT - 60, muted ? 0.5 : 1);

    // announcement box (subtle)
    if (latestAnnouncementTimer > 0 && latestAnnouncement) {
      ctx.font = FONT_BODY;
      const ta = latestAnnouncement;
      const taW = ctx.measureText(ta).width;
      const taX = (WIDTH - taW) / 2;
      const taY = instrY - 72;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(taX - 10, taY - 10, taW + 20, 36);
      ctx.fillStyle = '#0b4f6c';
      ctx.fillText(ta, taX, taY + 6);
    }

    // small keyboard help top center
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const help = 'Keyboard: 1-3 select • Enter confirm • M mute • R restart';
    const helpW = ctx.measureText(help).width;
    const helpX = (WIDTH - helpW) / 2;
    const helpY = PADDING + 4;
    ctx.fillText(help, helpX, helpY + 24);
  }

  function drawSpeaker(x, y, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#2b6b98';
    ctx.strokeStyle = '#184a6b';
    ctx.lineWidth = 2;
    ctx.fillRect(x - 6, y - 6, 32, 32);
    ctx.strokeRect(x - 6, y - 6, 32, 32);
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 2);
    ctx.lineTo(x + 10, y + 10);
    ctx.lineTo(x + 2, y + 18);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (!muted) {
      ctx.beginPath();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.arc(x + 16, y + 10, 8, -0.7, 0.7);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.moveTo(x + 22, y + 2);
      ctx.lineTo(x + 8, y + 24);
      ctx.moveTo(x + 8, y + 2);
      ctx.lineTo(x + 22, y + 24);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Easing
  function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  // Main draw loop
  function draw(now) {
    const dt = now - lastTime;
    lastTime = now;

    // draw background with parallax and particles
    drawBackground(now);

    // smooth drone movement towards target using eased lerp
    const dx = droneTargetX - droneX;
    const dy = droneTargetY - droneY;
    droneX += dx * Math.min(1, 0.02 + Math.sqrt(Math.abs(dx)) * 0.0028);
    droneY += dy * Math.min(1, 0.02 + Math.sqrt(Math.abs(dy)) * 0.0028);

    // draw drone with better bob and rotor animation
    drawDrone(droneX, droneY, now, now);

    // draw star progress bar (top-center)
    const starsStartX = WIDTH / 2 - (TARGET_CORRECT * 14) / 2;
    for (let i = 0; i < TARGET_CORRECT; i++) {
      const x = starsStartX + i * 14;
      const y = PADDING + 60;
      if (i < score) drawStar(x, y, 6, true);
      else drawStar(x, y, 6, false);
    }

    // draw question area
    ctx.font = FONT_TITLE;
    ctx.fillStyle = '#073b4c';
    ctx.textBaseline = 'top';
    const questionY = HEIGHT / 2 - 60;
    ctx.font = FONT_TITLE;
    const qW = ctx.measureText(question || '').width;
    const qPad = 12;
    const qX = (WIDTH - Math.max(280, qW)) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    drawRoundedRect(qX - qPad, questionY - qPad, Math.max(280, qW) + qPad * 2, 52, 12);
    ctx.fillStyle = '#073b4c';
    ctx.fillText(question || '', qX + 6, questionY + 6);

    // options area - well spaced, clean backgrounds
    ctx.font = FONT_BODY;
    optionRects = [];
    const optY = questionY + 72;
    const spacing = 18;
    // compute widths to ensure no overlap
    const optionWidths = options.map((o, idx) => ctx.measureText(idx + 1 + '. ' + o).width + 28);
    const totalW = optionWidths.reduce((a, b) => a + b, 0) + spacing * (options.length - 1);
    let startX = (WIDTH - totalW) / 2;
    for (let i = 0; i < options.length; i++) {
      const w = optionWidths[i];
      const h = 54;
      const x = startX;
      const y = optY;
      // selected visual: soft animated pulse
      if (selectedIndex === i) {
        const pulse = 1 + Math.sin(now / 260) * 0.02;
        ctx.fillStyle = `rgba(133,193,82,${0.96 * pulse})`;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      drawRoundedRect(x, y, w, h, 10);

      // subtle icon to left of text (small badge)
      const badgeX = x + 8;
      const badgeY = y + 10;
      ctx.beginPath();
      ctx.fillStyle = selectedIndex === i ? '#fff' : '#8bd3ff';
      ctx.arc(badgeX + 10, badgeY + 12, 10, 0, Math.PI * 2);
      ctx.fill();

      // text
      ctx.fillStyle = '#073b4c';
      ctx.fillText(i + 1 + '. ' + options[i], x + 28, y + 14);
      optionRects[i] = { x, y, w, h };
      startX += w + spacing;
    }

    // keyboard hint below options
    ctx.font = FONT_BODY;
    const hintText = 'Press 1,2,3 or Click an option. Press Enter to confirm.';
    const hintW = ctx.measureText(hintText).width;
    const hintX = (WIDTH - hintW) / 2;
    const hintY = optY + 72;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(hintX - 10, hintY - 10, hintW + 20, 36);
    ctx.fillStyle = '#064273';
    ctx.fillText(hintText, hintX, hintY + 6);

    // play small selection click if user just moved selection? (no direct state for last input here)

    // Draw animations (collecting stars and spark effects)
    animations = animations.filter(a => {
      const localT = (now - a.t0) / a.duration;
      if (a.type === 'collect') {
        const sx = a.sx;
        const sy = a.sy;
        const tx = a.tx;
        const ty = a.ty;
        const p = easeOutCubic(Math.min(1, localT));
        const cx = sx + (tx - sx) * p;
        const cy = sy + (ty - sy) * p - (1 - p) * 18;
        drawStar(cx, cy, 8 * (1 - 0.15 * p), true);
        if (localT >= 1) return false;
        return true;
      } else if (a.type === 'spark') {
        for (let k = 0; k < 7; k++) {
          const ang = (k / 7) * Math.PI * 2 + a.offset;
          const r = 8 + localT * 46;
          const x = a.x + Math.cos(ang) * r;
          const y = a.y + Math.sin(ang) * r;
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, ${150 + k * 8}, 80, ${1 - localT})`;
          ctx.arc(x, y, 4 * (1 - localT) + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (localT >= 1) return false;
        return true;
      }
      return false;
    });

    // overlay for intro/win/loss while preserving UI spacing
    if (state === 'won' || state === 'lost' || state === 'intro') {
      const boxW = 520;
      const boxH = 220;
      const boxX = (WIDTH - boxW) / 2;
      const boxY = (HEIGHT - boxH) / 2 - 10;
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      drawRoundedRect(boxX, boxY, boxW, boxH, 14);

      ctx.font = FONT_TITLE;
      ctx.fillStyle = '#0b3b59';
      ctx.textBaseline = 'top';
      const title = state === 'intro' ? 'Drone Math Adventure' : state === 'won' ? 'YOU WIN!' : 'GAME OVER';
      const titleW = ctx.measureText(title).width;
      ctx.fillText(title, boxX + (boxW - titleW) / 2, boxY + 18);

      ctx.font = FONT_BODY;
      ctx.fillStyle = '#064273';
      let message = '';
      if (state === 'intro') {
        message =
          'Help your friendly drone collect ' +
          TARGET_CORRECT +
          ' stars by answering math questions.\nYou can make up to ' +
          WRONG_ALLOWED +
          ' mistakes. Press Space or Click to begin.';
      } else if (state === 'won') {
        message = 'Great flying! You collected ' + score + ' stars. Press R or Click to play again.';
      } else {
        message = 'Oops! Your drone ran out of lives. You collected ' + score + ' stars. Press R or Click to try again.';
      }
      const lines = message.split('\n');
      let textY = boxY + 72;
      for (const line of lines) {
        const lw = ctx.measureText(line).width;
        ctx.fillText(line, boxX + (boxW - lw) / 2, textY);
        textY += 26;
      }

      // restart button
      const btnText = 'Restart (R)';
      ctx.font = FONT_IMPORTANT;
      const btnW = ctx.measureText(btnText).width + 28;
      const btnH = 46;
      const btnX = boxX + (boxW - btnW) / 2;
      const btnY = boxY + boxH - btnH - 18;
      ctx.fillStyle = '#8bd3ff';
      ctx.strokeStyle = '#4a9bbf';
      ctx.lineWidth = 1;
      drawRoundedRect(btnX, btnY, btnW, btnH, 10);
      ctx.fillStyle = '#073b4c';
      ctx.fillText(btnText, btnX + 14, btnY + 8);

      restartRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    } else {
      restartRect = null;
    }

    if (latestAnnouncementTimer > 0) latestAnnouncementTimer -= dt;

    requestAnimationFrame(draw);
  }

  // Input handlers (preserve mechanics)
  canvas.addEventListener('keydown', async e => {
    if (e.key === 'm' || e.key === 'M') {
      muted = !muted;
      announce(muted ? 'Muted' : 'Sound on');
      e.preventDefault();
      return;
    }
    if (state === 'intro') {
      if (e.code === 'Space' || e.key === 'Enter') {
        try {
          initAudio();
          await ensureAudioRunning();
        } catch (e) {
          console.warn('Audio start error', e);
        }
        resetGame();
        e.preventDefault();
      }
      return;
    }
    if (state === 'won' || state === 'lost') {
      if (e.key === 'r' || e.key === 'R' || e.code === 'Space') {
        try {
          initAudio();
        } catch (err) {}
        resetGame();
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case '1':
      case '2':
      case '3': {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < options.length) {
          selectedIndex = idx;
          announce('Selected option ' + (idx + 1));
          playSelectClick();
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowUp':
        selectedIndex = (selectedIndex + options.length - 1) % options.length;
        playSelectClick();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        selectedIndex = (selectedIndex + 1) % options.length;
        playSelectClick();
        break;
      case 'Enter':
        confirmSelection();
        break;
      case 'r':
      case 'R':
        resetGame();
        break;
      default:
        break;
    }
  });

  canvas.addEventListener('click', async e => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    if (state === 'intro') {
      try {
        initAudio();
        await ensureAudioRunning();
      } catch (ex) {}
      resetGame();
      return;
    }
    if (
      restartRect &&
      cx >= restartRect.x &&
      cx <= restartRect.x + restartRect.w &&
      cy >= restartRect.y &&
      cy <= restartRect.y + restartRect.h
    ) {
      resetGame();
      return;
    }
    if (state === 'won' || state === 'lost') {
      resetGame();
      return;
    }
    for (let i = 0; i < optionRects.length; i++) {
      const r = optionRects[i];
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        selectedIndex = i;
        confirmSelection();
        playSelectClick();
        return;
      }
    }
    // toggle mute by clicking speaker area
    const spX = PADDING;
    const spY = HEIGHT - 60;
    if (cx >= spX - 10 && cx <= spX + 32 && cy >= spY - 10 && cy <= spY + 32) {
      muted = !muted;
      announce(muted ? 'Muted' : 'Sound unmuted');
      return;
    }
  });

  function confirmSelection() {
    if (state !== 'playing') return;
    const chosen = selectedIndex;
    const now = performance.now();
    const rect = optionRects[chosen];
    if (rect) {
      droneTargetX = rect.x + rect.w / 2;
      droneTargetY = rect.y - 40;
    }
    if (chosen === correctIndex) {
      score++;
      spawnStars.push({
        t: now,
        fromX: rect ? rect.x + rect.w / 2 : droneX,
        fromY: rect ? rect.y + rect.h / 2 : droneY
      });
      const tx = WIDTH / 2 - (TARGET_CORRECT * 14) / 2 + (score - 1) * 14;
      const ty = PADDING + 60;
      animations.push({
        type: 'collect',
        t0: now,
        duration: 600,
        sx: rect ? rect.x + rect.w / 2 : droneX,
        sy: rect ? rect.y + rect.h / 2 : droneY,
        tx,
        ty
      });
      animations.push({
        type: 'spark',
        t0: now,
        duration: 700,
        x: rect ? rect.x + rect.w / 2 : droneX,
        y: rect ? rect.y + rect.h / 2 : droneY,
        offset: Math.random() * 2
      });
      playCorrect();
      announce('Correct! You have ' + score + ' stars.');
      if (score >= TARGET_CORRECT) {
        state = 'won';
        announce('You win! Great job.');
        try {
          playWinFanfare();
        } catch (e) {}
      } else {
        setTimeout(() => {
          makeQuestion();
        }, 700);
      }
    } else {
      lives--;
      animations.push({
        type: 'spark',
        t0: now,
        duration: 700,
        x: rect ? rect.x + rect.w / 2 : droneX,
        y: rect ? rect.y + rect.h / 2 : droneY,
        offset: Math.random() * 2
      });
      playIncorrect();
      announce('Oops! That was not correct. Lives left: ' + lives);
      if (lives <= 0) {
        state = 'lost';
        announce('Game over. Press R to try again.');
      } else {
        setTimeout(() => {
          makeQuestion();
        }, 700);
      }
    }
  }

  // Start animation loop and prepare initial question
  lastTime = performance.now();
  requestAnimationFrame(draw);
  makeQuestion();
  state = 'intro';

  // Focus canvas for keyboard controls
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (e) {}
  }, 50);

  // Expose minimal API for debugging and audio control
  window.DroneMathGame = {
    startAudio: initAudio,
    isAudioEnabled: () => audioEnabled,
    mute: v => {
      muted = !!v;
    }
  };

  // Gesture based audio initialization for browsers that require user gestures
  canvas.addEventListener('mousedown', async () => {
    if (!audioInitTried) {
      try {
        initAudio();
      } catch (e) {}
    } else if (audioEnabled && audioCtx && audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (e) {
        // ignore resume errors
      }
    }
  });

  // Accessibility focus blur announcement
  canvas.addEventListener('blur', () => {
    latestAnnouncement = 'Canvas lost focus. Click or press Tab to focus the game for keyboard control.';
    latestAnnouncementTimer = 2000;
  });

  // Visibility change: suspend/resume audio
  document.addEventListener('visibilitychange', () => {
    if (audioCtx && typeof audioCtx.suspend === 'function') {
      if (document.hidden) {
        audioCtx.suspend().catch(() => {});
      } else {
        audioCtx.resume().catch(() => {});
      }
    }
  });

  // Top-level error handling
  window.addEventListener('error', ev => {
    console.error('Unhandled error in Drone Math Adventure:', ev.error || ev.message);
    announce('An unexpected error occurred. Try refreshing the page.');
  });
})();