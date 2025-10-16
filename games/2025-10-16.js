(function () {
  // Drone Math Adventure - Enhanced visuals & audio
  // Renders inside element with ID "game-of-the-day-stage".
  // Game mechanics unchanged. Visuals improved with canvas-only drawing.
  // Sounds generated with Web Audio API oscillators/filters. No external assets.

  // Retrieve container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with ID "game-of-the-day-stage" not found.');
    return;
  }

  // Clear container and create canvas
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Adventure. Answer math questions by clicking or pressing keys 1 to 4. Press M to toggle audio. Press R to restart.'
  );
  canvas.style.display = 'block';
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  // Layout constants
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 12;
  const TOP_UI_HEIGHT = 56;
  const BOTTOM_UI_HEIGHT = 96;
  const GAME_AREA = {
    x: 0,
    y: TOP_UI_HEIGHT,
    w: WIDTH,
    h: HEIGHT - TOP_UI_HEIGHT - BOTTOM_UI_HEIGHT,
  };

  // Fonts
  const FONT_BODY =
    '16px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const FONT_IMPORTANT =
    '22px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const FONT_TITLE =
    '28px Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';

  // Game parameters (unchanged)
  const TARGET_CORRECT = 10;
  const MAX_WRONG = 3;

  // State
  let correctCount = 0;
  let wrongCount = 0;
  let currentQuestion = null;
  let choices = []; // [{text, value, x,y,r,animScale}]
  let gameState = 'start'; // 'start', 'playing', 'victory', 'gameover'
  let focusedChoiceIndex = 0;
  let lastAnswerResult = null; // 'correct' | 'wrong' | null
  let shakeTime = 0;
  let droneX = WIDTH / 2;
  let droneY = TOP_UI_HEIGHT + GAME_AREA.h - 60;
  let droneTargetX = droneX;
  let droneTargetY = droneY;
  let bgHumOn = true;
  let lastTick = performance.now();
  let mouse = { x: 0, y: 0, inside: false };
  let hoverChoiceIndex = -1;
  let particles = []; // simple particle effects for visuals

  // Audio setup with error handling
  let audioCtx = null;
  let masterGain = null;
  let ambientNodes = null;

  function createAudioContextSafe() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const ac = new Ctx();

      // Master gain for easy mute control
      const master = ac.createGain();
      master.gain.value = 1.0;
      master.connect(ac.destination);

      // Ambient gentle hum: two detuned oscillators through filter + slight tremolo
      const ambientGain = ac.createGain();
      ambientGain.gain.value = 0.06; // gentle overall
      const oscA = ac.createOscillator();
      oscA.type = 'sine';
      oscA.frequency.value = 110;
      oscA.detune.value = -6;

      const oscB = ac.createOscillator();
      oscB.type = 'sine';
      oscB.frequency.value = 220;
      oscB.detune.value = 6;

      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      lp.Q.value = 0.8;

      // subtle amplitude modulation (tremolo)
      const lfo = ac.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 0.02;

      oscA.connect(lp);
      oscB.connect(lp);
      lp.connect(ambientGain);
      lfo.connect(lfoGain);
      lfoGain.connect(ambientGain.gain);

      ambientGain.connect(master);

      // Start nodes
      oscA.start();
      oscB.start();
      lfo.start();

      audioCtx = ac;
      masterGain = master;
      ambientNodes = { oscA, oscB, lp, lfo, ambientGain };

      return ac;
    } catch (e) {
      console.warn('AudioContext creation failed:', e);
      return null;
    }
  }

  audioCtx = createAudioContextSafe();
  if (!audioCtx) {
    bgHumOn = false;
  }

  // Toggle ambient hum smoothly
  function toggleBackgroundHum(on) {
    if (!audioCtx || !masterGain || !ambientNodes) {
      bgHumOn = false;
      return;
    }
    try {
      const ac = audioCtx;
      const now = ac.currentTime;
      const target = on ? 0.06 : 0.0;
      ambientNodes.ambientGain.gain.cancelScheduledValues(now);
      ambientNodes.ambientGain.gain.setValueAtTime(ambientNodes.ambientGain.gain.value, now);
      ambientNodes.ambientGain.gain.linearRampToValueAtTime(target, now + 0.35);
      bgHumOn = on;
    } catch (e) {
      console.warn('toggleBackgroundHum error:', e);
    }
  }

  // Generic small sound with envelope
  function playTone({
    frequency = 440,
    duration = 0.18,
    type = 'sine',
    volume = 0.12,
    detune = 0,
  } = {}) {
    if (!audioCtx || !masterGain) return;
    try {
      const ac = audioCtx;
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;
      osc.detune.value = detune;

      const gain = ac.createGain();
      gain.gain.value = 0.0001;

      // gentle lowpass for smoother tones
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(600, frequency * 2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(now);

      // envelope
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.stop(now + duration + 0.04);
    } catch (e) {
      console.warn('playTone error:', e);
    }
  }

  function playClickSound() {
    // quick high click for selection
    playTone({ frequency: 1200, duration: 0.06, type: 'square', volume: 0.06 });
  }

  function playCorrectSound() {
    if (!audioCtx) return;
    // Pleasant ascending triad arpeggio
    playTone({ frequency: 660, duration: 0.08, type: 'sine', volume: 0.06 });
    setTimeout(
      () => playTone({ frequency: 880, duration: 0.10, type: 'triangle', volume: 0.045 }),
      90
    );
    setTimeout(
      () => playTone({ frequency: 1100, duration: 0.16, type: 'sawtooth', volume: 0.035 }),
      200
    );
  }

  function playWrongSound() {
    // soft low "thump" with short noise-like buzzy tone
    playTone({ frequency: 220, duration: 0.12, type: 'sine', volume: 0.08 });
    setTimeout(() => playTone({ frequency: 160, duration: 0.10, type: 'sawtooth', volume: 0.05 }), 60);
  }

  function playVictoryJingle() {
    if (!audioCtx) return;
    // short, warm major chord arpeggio
    const nowOffset = 0;
    playTone({ frequency: 660, duration: 0.14, type: 'sine', volume: 0.07, detune: 0 });
    setTimeout(
      () => playTone({ frequency: 830, duration: 0.14, type: 'triangle', volume: 0.06 }),
      120
    );
    setTimeout(
      () => playTone({ frequency: 990, duration: 0.18, type: 'sine', volume: 0.05 }),
      240
    );
  }

  // Particle utilities for visual feedback
  function spawnParticles(x, y, color = '#fff', count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 2.4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 1.2,
        life: 40 + Math.floor(Math.random() * 40),
        age: 0,
        size: 2 + Math.random() * 4,
        color,
        fade: Math.random() * 0.02 + 0.01,
      });
    }
  }

  // Math question generator (kept logic)
  function generateQuestion() {
    const a = Math.floor(Math.random() * 11); // 0..10
    const b = Math.floor(Math.random() * 11); // 0..10
    const add = Math.random() < 0.6; // more addition
    const op = add ? '+' : '-';
    let questionText = `${a} ${op} ${b}`;
    let answer = add ? a + b : a - b;
    // ensure non-negative answer for this age
    if (answer < 0) {
      // flip to addition
      questionText = `${a + b} - ${a}`;
      answer = b;
    }
    // generate 3 distractors within small range, ensure unique
    const distractors = new Set();
    while (distractors.size < 3) {
      let delta = Math.floor(Math.random() * 7) - 3; // -3..3
      if (delta === 0) delta = 4; // avoid correct
      let cand = answer + delta;
      if (cand < 0) cand = Math.abs(cand) + 1;
      distractors.add(cand);
    }
    const options = [answer, ...Array.from(distractors)];
    // shuffle
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    currentQuestion = { text: questionText, answer };
    choices = []; // place four circular choice buttons inside GAME_AREA, non-overlapping
    const positions = [];
    const cols = 2;
    const rows = 2;
    const marginX = 40;
    const marginY = 20;
    const cellW = (GAME_AREA.w - marginX * 2) / cols;
    const cellH = (GAME_AREA.h - marginY * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = marginX + c * cellW + cellW / 2;
        const cy = GAME_AREA.y + marginY + r * cellH + cellH / 2;
        positions.push({ x: cx, y: cy });
      }
    }
    // small shuffle of positions
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    const baseR = Math.min(cellW, cellH) / 3.2;
    for (let i = 0; i < options.length; i++) {
      const pos = positions[i];
      const jitterX = (Math.random() - 0.5) * 30;
      const jitterY = (Math.random() - 0.5) * 20;
      choices.push({
        text: String(options[i]),
        value: options[i],
        x: pos.x + jitterX,
        y: pos.y + jitterY,
        r: baseR + (Math.random() * 6 - 3),
        animScale: 1,
      });
    }
    focusedChoiceIndex = 0;
  }

  // UI helpers
  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.fill();
  }

  function drawTopUI() {
    ctx.save();
    // Score top-left
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'middle';

    // Soft translucent pill backgrounds
    const scoreText = `Stars: ${correctCount}/${TARGET_CORRECT}`;
    const scoreWpad = 18;
    const scoreH = 36;
    ctx.font = FONT_IMPORTANT;
    const scoreW = ctx.measureText(scoreText).width + scoreWpad;
    const scoreX = PADDING;
    const scoreY = PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    drawRoundedRect(scoreX, scoreY, scoreW, scoreH, 10);
    ctx.strokeStyle = 'rgba(34,102,136,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#063b4b';
    ctx.fillText(scoreText, scoreX + 10, scoreY + scoreH / 2);

    // Lives top-right
    const livesText = `Lives: ${Math.max(MAX_WRONG - wrongCount, 0)}`;
    ctx.font = FONT_IMPORTANT;
    const livesW = ctx.measureText(livesText).width + scoreWpad;
    const livesH = 36;
    const livesX = WIDTH - livesW - PADDING;
    const livesY = PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    drawRoundedRect(livesX, livesY, livesW, livesH, 10);
    ctx.strokeStyle = 'rgba(102,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#6b0d0d';
    ctx.fillText(livesText, livesX + 10, livesY + livesH / 2);

    // Audio indicator
    const audioText = bgHumOn ? 'Audio: On (M)' : 'Audio: Off (M)';
    ctx.font = FONT_BODY;
    const audioW = ctx.measureText(audioText).width + 18;
    const audioH = 26;
    const audioX = livesX - audioW - 10;
    const audioY = PADDING + (livesH - audioH) / 2;
    ctx.fillStyle = bgHumOn ? 'rgba(225,255,220,0.95)' : 'rgba(250,250,250,0.9)';
    drawRoundedRect(audioX, audioY, audioW, audioH, 8);
    ctx.fillStyle = bgHumOn ? '#1b5e20' : '#333';
    ctx.fillText(audioText, audioX + 8, audioY + audioH / 2);

    ctx.restore();
  }

  function drawBottomUI() {
    ctx.save();
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'top';
    const instructions = [
      'Click a cloud or press keys 1-4 to answer.',
      'Goal: Collect 10 stars by answering correctly. 3 wrong answers = Game Over.',
      'Press R to restart. Press M to toggle audio.',
    ];
    const padding = 12;
    // Measure widest text line
    let maxWidth = 0;
    instructions.forEach((line) => {
      const w = ctx.measureText(line).width;
      if (w > maxWidth) maxWidth = w;
    });
    const boxW = Math.min(WIDTH - PADDING * 4, maxWidth + padding * 2);
    const boxH = instructions.length * 20 + padding * 2;
    const boxX = (WIDTH - boxW) / 2;
    const boxY = HEIGHT - BOTTOM_UI_HEIGHT + (BOTTOM_UI_HEIGHT - boxH) / 2;
    // subtle translucent panel
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    drawRoundedRect(boxX, boxY, boxW, boxH, 12);
    ctx.fillStyle = '#2d2d2d';
    ctx.font = FONT_BODY;
    for (let i = 0; i < instructions.length; i++) {
      ctx.fillText(instructions[i], boxX + padding, boxY + padding + i * 20);
    }
    ctx.restore();
  }

  // Draw background sky with gentle parallax clouds and subtle hills
  const cloudPool = [];
  function initCloudPool() {
    cloudPool.length = 0;
    const count = 6;
    for (let i = 0; i < count; i++) {
      cloudPool.push({
        x: Math.random() * WIDTH,
        y: 30 + Math.random() * (GAME_AREA.y + GAME_AREA.h * 0.3),
        scale: 0.9 + Math.random() * 1.6,
        speed: 0.1 + Math.random() * 0.25,
        alpha: 0.6 + Math.random() * 0.3,
      });
    }
  }
  initCloudPool();

  function drawCloud(cx, cy, scale = 1, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(120,170,200,0.28)';
    ctx.lineWidth = 2;
    // cloud composed of several overlapping circles
    const r = 28 * scale;
    ctx.beginPath();
    ctx.arc(cx - r * 0.8, cy, r * 0.9, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(cx - r * 0.2, cy - r * 0.45, r * 1.1, Math.PI * 1.0, Math.PI * 1.95);
    ctx.arc(cx + r * 0.5, cy - r * 0.35, r * 0.9, Math.PI * 1.15, Math.PI * 2.0);
    ctx.arc(cx + r * 1.0, cy, r * 0.6, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw improved drone with spinning propellers and subtle shadow
  function drawDrone(x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    // shadow beneath drone
    ctx.beginPath();
    const shadowW = 74;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.ellipse(0, 26, shadowW / 2, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // body gradient
    const bodyW = 92;
    const bodyH = 36;
    const grd = ctx.createLinearGradient(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2);
    grd.addColorStop(0, '#e0f7ff');
    grd.addColorStop(1, '#cfeefb');
    ctx.fillStyle = grd;
    drawRoundedRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 14);

    // body inner stripe
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(-bodyW / 2 + 6, -8, bodyW - 12, 12);
    // small logo circle
    ctx.beginPath();
    ctx.fillStyle = '#ffeb3b';
    ctx.arc(-18, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', -18, 0);

    // front window
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.ellipse(18, 0, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Propellers and supports
    const rotAngle = t / 80;
    const rotorPositions = [
      { dx: -48, dy: -20 },
      { dx: 48, dy: -20 },
      { dx: -48, dy: 20 },
      { dx: 48, dy: 20 },
    ];
    for (let i = 0; i < rotorPositions.length; i++) {
      const ro = rotorPositions[i];
      // support arm
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(70,70,70,0.16)';
      ctx.lineWidth = 3;
      ctx.moveTo(ro.dx * 0.38, ro.dy * 0.35);
      ctx.lineTo(ro.dx * 0.8, ro.dy * 0.9);
      ctx.stroke();

      // rotor hub
      ctx.beginPath();
      ctx.fillStyle = '#f3f6f8';
      ctx.strokeStyle = 'rgba(90,90,90,0.2)';
      ctx.lineWidth = 1;
      ctx.arc(ro.dx, ro.dy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // spinning blades (two blades rotated)
      ctx.save();
      ctx.translate(ro.dx, ro.dy);
      ctx.rotate(rotAngle * (i % 2 ? -1.2 : 1.2) + i);
      ctx.fillStyle = 'rgba(20,20,20,0.12)';
      for (let b = 0; b < 2; b++) {
        ctx.beginPath();
        ctx.ellipse(0, 18 - b * 12, 3.8 + b * 1.2, 22, Math.PI / 6 * (b % 2 ? 1 : -1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // Draw answer cloud with nicer visuals
  function drawChoice(choice, index, now) {
    const { x, y, r, text } = choice;
    ctx.save();
    // subtle hover scale and whole-cloud shadow
    const isHover = hoverChoiceIndex === index || focusedChoiceIndex === index;
    const targetScale = isHover ? 1.06 : choice.animScale || 1;
    // animate scale towards target
    choice.animScale = (choice.animScale || 1) + (targetScale - (choice.animScale || 1)) * 0.16;
    const scale = choice.animScale;

    // shadow under cloud
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.ellipse(x, y + r * 0.9, r * 0.95 * scale, r * 0.35 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // cloud body with soft gradient
    const grd = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#f2fbff');
    ctx.fillStyle = grd;
    ctx.strokeStyle = 'rgba(120,170,200,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - r * 0.6 * scale, y, r * 0.55 * scale, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(
      x - r * 0.15 * scale,
      y - r * 0.5 * scale,
      r * 0.7 * scale,
      Math.PI * 1.0,
      Math.PI * 1.9
    );
    ctx.arc(x + r * 0.4 * scale, y - r * 0.4 * scale, r * 0.6 * scale, Math.PI * 1.2, Math.PI * 2.0);
    ctx.arc(x + r * 0.85 * scale, y, r * 0.45 * scale, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // soft glint highlight
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.ellipse(x - r * 0.55 * scale, y - r * 0.15 * scale, r * 0.35 * scale, r * 0.18 * scale, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // answer text
    ctx.fillStyle = '#04384c';
    ctx.font = `${Math.round(20 * scale)}px Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    // ensure it fits
    let fontSize = Math.round(20 * scale);
    ctx.font = `${fontSize}px Inter, sans-serif`;
    let tw = ctx.measureText(text).width;
    while (tw > r * 1.5 * scale && fontSize > 12) {
      fontSize--;
      ctx.font = `${fontSize}px Inter, sans-serif`;
      tw = ctx.measureText(text).width;
    }
    ctx.fillText(text, x, y);

    // index badge
    ctx.fillStyle = '#1f4b57';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${index + 1}`, x - r - 6, y - r - 6);

    // keyboard focus halo
    if (focusedChoiceIndex === index && gameState === 'playing') {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,149,0,0.95)';
      ctx.lineWidth = 3;
      ctx.ellipse(x, y, r * 1.08 * scale, r * 0.95 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Handle answer attempt (mechanics unchanged)
  function handleAnswerChoice(index) {
    if (gameState !== 'playing') return;
    const choice = choices[index];
    if (!choice) return;
    playClickSound(); // subtle click on any selection
    if (choice.value === currentQuestion.answer) {
      correctCount++;
      lastAnswerResult = 'correct';
      playCorrectSound();
      // animate drone to chosen cloud
      droneTargetX = choice.x;
      droneTargetY = choice.y - 44;
      // spawn sparkle particles
      spawnParticles(choice.x, choice.y - 8, '#fff9c4', 28);
      spawnParticles(choice.x, choice.y - 8, '#b2f2ff', 8);
      // small celebration indicator
      shakeTime = 20;
    } else {
      wrongCount++;
      lastAnswerResult = 'wrong';
      playWrongSound();
      // shake
      shakeTime = 26;
      // nudge drone away
      droneTargetX = WIDTH / 2 + (Math.random() - 0.5) * 80;
      droneTargetY = TOP_UI_HEIGHT + GAME_AREA.h - 60;
      // spawn subtle red particles
      spawnParticles(choice.x, choice.y - 8, '#ffd6d6', 16);
    }
    // check end conditions
    if (correctCount >= TARGET_CORRECT) {
      gameState = 'victory';
      // celebratory sound
      setTimeout(() => {
        playVictoryJingle();
      }, 120);
      // extra confetti
      for (let i = 0; i < 3; i++) {
        spawnParticles(
          WIDTH / 2 + (Math.random() - 0.5) * 120,
          HEIGHT / 2 + (Math.random() - 0.5) * 80,
          `hsl(${Math.random() * 360},70%,60%)`,
          20
        );
      }
    } else if (wrongCount >= MAX_WRONG) {
      gameState = 'gameover';
    } else {
      // prepare next question after a short delay
      setTimeout(() => {
        generateQuestion();
        lastAnswerResult = null;
      }, 700);
    }
  }

  // Input handling
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (gameState === 'start') {
      // Start the game when clicking anywhere on canvas
      startGame();
      return;
    }
    if (gameState === 'victory' || gameState === 'gameover') {
      // Restart if clicked
      const restartClicked = true; // any click restarts
      if (restartClicked) startGame();
      return;
    }
    // Check choices clicked
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      const dx = mx - c.x;
      const dy = my - c.y;
      if (Math.sqrt(dx * dx + dy * dy) <= c.r * 1.15) {
        handleAnswerChoice(i);
        return;
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    mouse.x = mx;
    mouse.y = my;
    mouse.inside = true;
    // update hover choice index
    hoverChoiceIndex = -1;
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      const dx = mx - c.x;
      const dy = my - c.y;
      if (Math.sqrt(dx * dx + dy * dy) <= c.r * 1.15) {
        hoverChoiceIndex = i;
        break;
      }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.inside = false;
    hoverChoiceIndex = -1;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'M' || e.key === 'm') {
      // toggle audio
      if (!audioCtx) {
        audioCtx = createAudioContextSafe();
        if (!audioCtx) {
          bgHumOn = false;
          return;
        } else {
          toggleBackgroundHum(true);
        }
      } else {
        toggleBackgroundHum(!bgHumOn);
      }
    } else if (e.key === 'R' || e.key === 'r') {
      startGame();
    } else if (gameState === 'start') {
      if (e.key === 'Enter' || e.key === ' ') startGame();
    } else if (gameState === 'victory' || gameState === 'gameover') {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'r' || e.key === 'R') startGame();
    } else if (gameState === 'playing') {
      // number keys 1-4
      if (/^[1-4]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        focusedChoiceIndex = idx;
        handleAnswerChoice(idx);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        focusedChoiceIndex = (focusedChoiceIndex + 1) % choices.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        focusedChoiceIndex = (focusedChoiceIndex - 1 + choices.length) % choices.length;
      } else if (e.key === 'Enter' || e.key === ' ') {
        handleAnswerChoice(focusedChoiceIndex);
      }
    }
  });

  // Game flow
  function startGame() {
    correctCount = 0;
    wrongCount = 0;
    focusedChoiceIndex = 0;
    lastAnswerResult = null;
    shakeTime = 0;
    droneX = WIDTH / 2;
    droneY = TOP_UI_HEIGHT + GAME_AREA.h - 60;
    droneTargetX = droneX;
    droneTargetY = droneY;
    gameState = 'playing';
    generateQuestion();
    // ensure audio context resumed on user gesture
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('Audio resume failed:', e);
      });
    }
    toggleBackgroundHum(bgHumOn);
  }

  // Start screen drawing
  function drawStartScreen(now) {
    // soft textured background
    ctx.fillStyle = '#eaf8ff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // drifting clouds
    for (let i = 0; i < cloudPool.length; i++) {
      const c = cloudPool[i];
      drawCloud(c.x, c.y, c.scale, c.alpha);
    }

    // title card
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = FONT_TITLE;
    ctx.textAlign = 'center';
    const title = 'Drone Math Adventure';
    const boxW = 520;
    const boxH = 84;
    const bx = (WIDTH - boxW) / 2;
    const by = 24;
    ctx.fillStyle = 'rgba(240,255,255,0.9)';
    drawRoundedRect(bx, by, boxW, boxH, 14);
    ctx.fillStyle = '#04384c';
    ctx.font = FONT_TITLE;
    ctx.fillText(title, WIDTH / 2, by + 18);

    // gentle mascot drone in center
    drawDrone(WIDTH / 2, HEIGHT / 2 - 10, now / 60);

    // prompt panel
    ctx.font = FONT_IMPORTANT;
    ctx.textAlign = 'center';
    const instr = 'Click to launch! Collect 10 stars by answering math questions.';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const instrW = 540;
    const instrH = 56;
    const ix = (WIDTH - instrW) / 2;
    const iy = HEIGHT - 140;
    drawRoundedRect(ix, iy, instrW, instrH, 12);
    ctx.fillStyle = '#04384c';
    ctx.font = FONT_BODY;
    wrapTextCenter(instr, WIDTH / 2, iy + 12, instrW - 20, 18);

    // small controls hint
    ctx.font = FONT_BODY;
    ctx.fillStyle = '#255';
    ctx.fillText(
      'Controls: Click clouds or press 1-4. M toggles audio. R restarts.',
      WIDTH / 2,
      iy + instrH + 8
    );
  }

  // Victory screen
  function drawVictoryScreen(now) {
    // pale celebratory gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#fffef7');
    g.addColorStop(1, '#e8fff4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // confetti
    for (let i = 0; i < 36; i++) {
      ctx.fillStyle = `hsl(${(i * 37) % 360}, 70%, ${55 + (i % 3) * 5}%)`;
      const x = (i * 53) % WIDTH + Math.sin((i + now / 200) / 4) * 12;
      const y =
        HEIGHT / 2 +
        Math.cos((i + now / 300) / 3) * 50 -
        Math.abs(Math.sin(now / 700 + i)) * 90;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((now / 500 + i) % Math.PI);
      ctx.fillRect(-4, -8, 8, 16);
      ctx.restore();
    }

    ctx.fillStyle = '#084b36';
    ctx.font = FONT_TITLE;
    ctx.textAlign = 'left';
    ctx.fillText('You did it! Drone Champion!', PADDING * 2, PADDING * 2);

    // summary card
    const stext = `Stars collected: ${correctCount}/${TARGET_CORRECT}`;
    ctx.font = FONT_IMPORTANT;
    const sm = ctx.measureText(stext);
    const bw = sm.width + PADDING * 2;
    const bh = 48;
    const bx = (WIDTH - bw) / 2;
    const by = HEIGHT / 2 - 28;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    drawRoundedRect(bx, by, bw, bh, 12);
    ctx.fillStyle = '#073b2f';
    ctx.fillText(stext, bx + PADDING, by + bh / 2);

    ctx.font = FONT_BODY;
    ctx.fillStyle = '#333';
    ctx.fillText('Press R or click to play again.', bx, by + bh + 18);
  }

  // Game over screen
  function drawGameOverScreen(now) {
    ctx.fillStyle = '#fff6f6';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = '#6b0d0d';
    ctx.font = FONT_TITLE;
    ctx.textAlign = 'left';
    ctx.fillText('Game Over - Drones need rest', PADDING * 2, PADDING * 2);

    // sad drone
    drawDrone(WIDTH / 2, HEIGHT / 2 - 6, now / 90);

    // summary
    const stext = `Stars collected: ${correctCount}/${TARGET_CORRECT}`;
    ctx.font = FONT_IMPORTANT;
    const sm = ctx.measureText(stext);
    const bw = sm.width + PADDING * 2;
    const bh = 44;
    const bx = (WIDTH - bw) / 2;
    const by = HEIGHT / 2 + 64;
    ctx.fillStyle = 'rgba(255,240,240,0.95)';
    drawRoundedRect(bx, by, bw, bh, 10);
    ctx.fillStyle = '#660000';
    ctx.fillText(stext, bx + PADDING, by + bh / 2);

    ctx.font = FONT_BODY;
    ctx.fillStyle = '#333';
    ctx.fillText('Press R to try again.', bx, by + bh + 18);
  }

  // Wrap text centered helper
  function wrapTextCenter(text, cx, y, maxWidth, lineHeight) {
    ctx.textAlign = 'center';
    const words = text.split(' ');
    let line = '';
    let cursorY = y;
    ctx.font = FONT_BODY;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line.trim(), cx, cursorY);
        line = words[n] + ' ';
        cursorY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), cx, cursorY);
  }

  // Drawing loop - playing state
  function draw(now) {
    // clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#e9f9ff');
    bg.addColorStop(1, '#f7fcff');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // moving clouds (background)
    for (let i = 0; i < cloudPool.length; i++) {
      const c = cloudPool[i];
      c.x += c.speed;
      if (c.x - 120 > WIDTH) {
        c.x = -120 - Math.random() * 80;
        c.y = 12 + Math.random() * (GAME_AREA.y + GAME_AREA.h * 0.25);
      }
      drawCloud(c.x, c.y, c.scale, c.alpha);
    }

    // soft rolling hills at bottom (decorative)
    ctx.save();
    ctx.fillStyle = '#e7fff5';
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 40);
    ctx.quadraticCurveTo(120, HEIGHT - 90, 240, HEIGHT - 60);
    ctx.quadraticCurveTo(360, HEIGHT - 30, 480, HEIGHT - 70);
    ctx.quadraticCurveTo(600, HEIGHT - 110, 720, HEIGHT - 60);
    ctx.lineTo(720, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw top & bottom UI
    drawTopUI();
    drawBottomUI();

    // draw different screens
    if (gameState === 'start') {
      drawStartScreen(now || performance.now());
      return;
    }
    if (gameState === 'victory') {
      drawVictoryScreen(now || performance.now());
      return;
    }
    if (gameState === 'gameover') {
      drawGameOverScreen(now || performance.now());
      return;
    }

    // playing state content
    // question area card
    ctx.font = FONT_IMPORTANT;
    ctx.fillStyle = '#053b4a';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const qText = currentQuestion ? `Solve: ${currentQuestion.text}` : 'Preparing...';
    ctx.font = FONT_IMPORTANT;
    const qMetrics = ctx.measureText(qText);
    const qW = Math.min(WIDTH - PADDING * 4, qMetrics.width + PADDING * 2);
    const qH = 44;
    const qX = (WIDTH - qW) / 2;
    const qY = PADDING + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    drawRoundedRect(qX, qY, qW, qH, 12);
    ctx.fillStyle = '#003a4d';
    ctx.fillText(qText, qX + PADDING, qY + 12);

    // Draw choices (clouds)
    for (let i = 0; i < choices.length; i++) {
      drawChoice(choices[i], i, now || performance.now());
    }

    // Update drone smoothing & shake
    droneX += (droneTargetX - droneX) * 0.08;
    droneY += (droneTargetY - droneY) * 0.08;
    const wobble = Math.sin((now || performance.now()) / 130) * 0.8;
    const shakeX = (Math.random() - 0.5) * (shakeTime > 0 ? 8 : 0);
    const shakeY = (Math.random() - 0.5) * (shakeTime > 0 ? 6 : 0);
    drawDrone(droneX + shakeX, droneY + shakeY, now / 60);

    // feedback text near drone
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    if (lastAnswerResult === 'correct') {
      ctx.fillStyle = 'rgba(12,110,54,0.95)';
      ctx.fillText('+1 star!', droneX, droneY - 64);
    } else if (lastAnswerResult === 'wrong') {
      ctx.fillStyle = 'rgba(128,24,24,0.95)';
      ctx.fillText('Oops!', droneX, droneY - 64);
    }

    // soft trajectory line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(80,155,200,0.14)';
    ctx.lineWidth = 2;
    ctx.moveTo(WIDTH / 2, TOP_UI_HEIGHT + GAME_AREA.h);
    ctx.quadraticCurveTo((WIDTH / 2 + droneX) / 2, droneY - 80, droneX, droneY);
    ctx.stroke();

    // particles update & draw
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.size *= 0.992;
      p.color = p.color;
      const alpha = Math.max(0, 1 - p.age / p.life);
      if (alpha <= 0.02) {
        particles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.arc(p.x, p.y, Math.max(0.6, p.size), 0, Math.PI * 2);
      ctx.fill();
    }

    // Decrement shakeTime
    if (shakeTime > 0) shakeTime--;

    // Accessibility hint
    ctx.font = FONT_BODY;
    ctx.fillStyle = '#444';
    ctx.textAlign = 'left';
    ctx.fillText('Focus with arrows, select with Enter, or press 1-4.', PADDING, HEIGHT - BOTTOM_UI_HEIGHT + 8);
  }

  // Convert hex or hsl string into rgba with alpha fallback (basic)
  function hexToRgba(input, alpha = 1) {
    // accept hsl as well
    try {
      if (input.startsWith('hsl')) {
        // create a temporary canvas to get computed color
        const tmp = document.createElement('canvas').getContext('2d');
        tmp.fillStyle = input;
        const color = tmp.fillStyle; // will be rgb(...)
        return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
      } else {
        // hex form
        let hex = input.replace('#', '');
        if (hex.length === 3) {
          hex = hex.split('').map((c) => c + c).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    } catch (e) {
      // fallback white
      return `rgba(255,255,255,${alpha})`;
    }
  }

  // Utility to wrap text (left aligned)
  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    ctx.font = FONT_BODY;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }

  // Main loop
  function loop(ts) {
    const now = ts || performance.now();
    // update cloud offsets slightly for gentle parallax
    for (let i = 0; i < cloudPool.length; i++) {
      cloudPool[i].x += Math.cos(now / 10000 + i) * 0.01;
    }
    draw(now);
    lastTick = now;
    requestAnimationFrame(loop);
  }

  // Start rendering
  requestAnimationFrame(loop);

  // Start page initially
  gameState = 'start';
  draw(performance.now());

  // Expose minimal debug in window for testing (non-intrusive)
  window.__droneMathGame = {
    startGame,
    getState: () => ({ gameState, correctCount, wrongCount }),
  };
})();