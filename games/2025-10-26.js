(function () {
  // Drone Math Adventure - Enhanced Visuals & Audio
  // Renders into existing element with id "game-of-the-day-stage"
  // All visuals drawn on a canvas 720x480
  // Sounds generated with Web Audio API oscillators and filters
  // Controls unchanged: Mouse click answers, Number keys 1-4, Arrow keys to change selection, Enter to confirm,
  // M to toggle audio, R to restart.

  // CONFIG
  const GAME_WIDTH = 720;
  const GAME_HEIGHT = 480;
  const GOAL_CORRECT = 10;
  const MAX_WRONG = 3;
  const PADDING = 12; // min spacing for UI
  const BODY_FONT = '16px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const IMPORTANT_FONT = '22px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const TITLE_FONT = '28px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const CHOICE_FONT = '20px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';

  // Locate stage element
  const stage = document.getElementById('game-of-the-day-stage');
  if (!stage) {
    console.error('Stage element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear stage and create canvas
  stage.innerHTML = '';
  stage.style.position = 'relative';
  stage.style.width = GAME_WIDTH + 'px';
  stage.style.height = GAME_HEIGHT + 'px';
  const canvas = document.createElement('canvas');
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Adventure: a math game for kids with keyboard and mouse controls.'
  );
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Audio setup with robust error handling
  let audioCtx = null;
  let audioEnabled = true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    } else {
      audioEnabled = false;
      console.warn('Web Audio API not supported in this browser.');
    }
  } catch (e) {
    audioEnabled = false;
    console.warn('AudioContext creation failed:', e);
  }

  function tryResumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('Audio resume failed:', e);
      });
    }
  }

  // Background ambient pad (layered) and occasional motif
  let bgNodes = {
    padA: null,
    padB: null,
    padGain: null,
    padFilter: null,
    motifTimeout: null,
    lfo: null,
    lfoGain: null
  };

  function startBackgroundSound() {
    if (!audioCtx || !audioEnabled) return;
    stopBackgroundSound();
    try {
      tryResumeAudio();

      // Main pad layers
      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.02; // low overall volume

      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 1200;
      padFilter.Q.value = 0.8;

      // Layer A - slow triangle pad
      const padA = audioCtx.createOscillator();
      const padAGain = audioCtx.createGain();
      padA.type = 'triangle';
      padA.frequency.value = 110;
      padAGain.gain.value = 0.6;
      // Slight detune effect using LFO
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = 4;
      lfo.connect(lfoGain);
      lfoGain.connect(padA.frequency);

      padA.connect(padAGain);
      padAGain.connect(padFilter);

      // Layer B - subtle sine that adds warmth
      const padB = audioCtx.createOscillator();
      const padBGain = audioCtx.createGain();
      padB.type = 'sine';
      padB.frequency.value = 176;
      padBGain.gain.value = 0.5;
      padB.connect(padBGain);
      padBGain.connect(padFilter);

      padFilter.connect(padGain);
      padGain.connect(audioCtx.destination);

      padA.start();
      padB.start();
      lfo.start();

      // slow movement in filter freq
      const now = audioCtx.currentTime;
      padFilter.frequency.setValueAtTime(1200, now);
      padFilter.frequency.linearRampToValueAtTime(900, now + 8);
      padFilter.frequency.linearRampToValueAtTime(1300, now + 18);
      padFilter.frequency.linearRampToValueAtTime(1000, now + 30);

      // Keep references for stopping
      bgNodes.padA = padA;
      bgNodes.padB = padB;
      bgNodes.padGain = padGain;
      bgNodes.padFilter = padFilter;
      bgNodes.lfo = lfo;
      bgNodes.lfoGain = lfoGain;

      // Occasional gentle chime motif (not too frequent)
      function scheduleMotif() {
        if (!audioCtx || !audioEnabled) return;
        // small melodic arpeggio
        const times = [0, 0.16, 0.36];
        const freqs = [440, 550, 660];
        const base = audioCtx.currentTime + 0.05;
        times.forEach((t, i) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freqs[i], base + t);
          g.gain.setValueAtTime(0.06, base + t);
          g.gain.exponentialRampToValueAtTime(0.001, base + t + 0.26);
          o.connect(g);
          g.connect(audioCtx.destination);
          o.start(base + t);
          o.stop(base + t + 0.28);
        });
        // schedule next motif between 6 and 12 seconds
        bgNodes.motifTimeout = setTimeout(scheduleMotif, 6000 + Math.random() * 6000);
      }
      scheduleMotif();
    } catch (e) {
      console.warn('Background sound error:', e);
    }
  }

  function stopBackgroundSound() {
    try {
      if (bgNodes.motifTimeout) {
        clearTimeout(bgNodes.motifTimeout);
        bgNodes.motifTimeout = null;
      }
      if (bgNodes.padA) {
        try {
          bgNodes.padA.stop();
        } catch (e) {}
        try {
          bgNodes.padA.disconnect();
        } catch (e) {}
        bgNodes.padA = null;
      }
      if (bgNodes.padB) {
        try {
          bgNodes.padB.stop();
        } catch (e) {}
        try {
          bgNodes.padB.disconnect();
        } catch (e) {}
        bgNodes.padB = null;
      }
      if (bgNodes.lfo) {
        try {
          bgNodes.lfo.stop();
        } catch (e) {}
        try {
          bgNodes.lfo.disconnect();
        } catch (e) {}
        bgNodes.lfo = null;
      }
      if (bgNodes.padFilter) {
        try {
          bgNodes.padFilter.disconnect();
        } catch (e) {}
        bgNodes.padFilter = null;
      }
      if (bgNodes.padGain) {
        try {
          bgNodes.padGain.disconnect();
        } catch (e) {}
        bgNodes.padGain = null;
      }
    } catch (e) {
      console.warn('Error stopping background sound:', e);
    }
  }

  function playBeep(options = {}) {
    if (!audioCtx || !audioEnabled) return;
    try {
      tryResumeAudio();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = options.type || 'sine';
      osc.frequency.setValueAtTime(options.freq || 880, now);
      const vol = typeof options.volume === 'number' ? options.volume : 0.12;
      gain.gain.setValueAtTime(vol, now);
      const env = options.duration || 0.18;
      gain.gain.exponentialRampToValueAtTime(0.001, now + env);
      osc.connect(gain);
      if (options.filter) {
        const f = audioCtx.createBiquadFilter();
        f.type = options.filter.type || 'lowpass';
        f.frequency.value = options.filter.freq || 1200;
        gain.connect(f);
        f.connect(audioCtx.destination);
      } else {
        gain.connect(audioCtx.destination);
      }
      osc.start(now);
      osc.stop(now + env + 0.02);
    } catch (e) {
      console.warn('playBeep error:', e);
    }
  }

  function playCorrectSound() {
    if (!audioCtx || !audioEnabled) return;
    try {
      tryResumeAudio();
      const now = audioCtx.currentTime;
      // whoosh upward sweep (bright) + chime
      // sweep
      const sweep = audioCtx.createOscillator();
      const sweepG = audioCtx.createGain();
      sweep.type = 'sawtooth';
      sweep.frequency.setValueAtTime(240, now);
      sweep.frequency.exponentialRampToValueAtTime(880, now + 0.28);
      sweepG.gain.setValueAtTime(0.12, now);
      sweepG.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      const sweepFilter = audioCtx.createBiquadFilter();
      sweepFilter.type = 'highpass';
      sweepFilter.frequency.value = 200;
      sweep.connect(sweepG);
      sweepG.connect(sweepFilter);
      sweepFilter.connect(audioCtx.destination);

      // bright bell
      const bell = audioCtx.createOscillator();
      const bellG = audioCtx.createGain();
      bell.type = 'triangle';
      bell.frequency.setValueAtTime(880, now + 0.06);
      bellG.gain.setValueAtTime(0.08, now + 0.06);
      bellG.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      bell.connect(bellG);
      bellG.connect(audioCtx.destination);

      sweep.start(now);
      sweep.stop(now + 0.34);
      bell.start(now + 0.06);
      bell.stop(now + 0.42);
    } catch (e) {
      console.warn('playCorrectSound error:', e);
    }
  }

  function playIncorrectSound() {
    if (!audioCtx || !audioEnabled) return;
    try {
      tryResumeAudio();
      const now = audioCtx.currentTime;
      // short low thud with small clicking tail
      const thud = audioCtx.createOscillator();
      const thudG = audioCtx.createGain();
      thud.type = 'square';
      thud.frequency.setValueAtTime(160, now);
      thudG.gain.setValueAtTime(0.14, now);
      thudG.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      const lowFilter = audioCtx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = 700;
      thud.connect(thudG);
      thudG.connect(lowFilter);
      lowFilter.connect(audioCtx.destination);

      // small click
      const click = audioCtx.createOscillator();
      const clickG = audioCtx.createGain();
      click.type = 'square';
      click.frequency.setValueAtTime(1100, now + 0.06);
      clickG.gain.setValueAtTime(0.06, now + 0.06);
      clickG.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      click.connect(clickG);
      clickG.connect(audioCtx.destination);

      thud.start(now);
      thud.stop(now + 0.3);
      click.start(now + 0.06);
      click.stop(now + 0.16);
    } catch (e) {
      console.warn('playIncorrectSound error:', e);
    }
  }

  // small soft hover selection sound (very low volume, optional)
  let lastSelectionIndex = -1;
  function playSelectSound() {
    if (!audioCtx || !audioEnabled) return;
    try {
      tryResumeAudio();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      g.gain.setValueAtTime(0.02, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch (e) {
      console.warn('playSelectSound error:', e);
    }
  }

  // Game state
  let state = {
    correct: 0,
    wrong: 0,
    selectionIndex: 0,
    currentQuestion: null,
    answered: false,
    droneX: GAME_WIDTH / 2,
    droneY: GAME_HEIGHT / 2 + 40,
    droneTargetX: GAME_WIDTH / 2,
    droneTargetY: GAME_HEIGHT / 2 + 40,
    wobble: 0,
    showVictory: false,
    showGameOver: false,
    audioOn: audioEnabled,
    animTime: 0,
    particles: [], // for small visual effects
    confetti: [] // for victory
  };

  // Utility: random integer inclusive
  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  // Generate math question appropriate for ages 7-9 (unchanged logic)
  function generateQuestion(difficultyLevel) {
    const ops = ['+', '-', '×'];
    const op = ops[randInt(0, difficultyLevel < 2 ? 1 : 2)];
    let a, b;
    if (op === '+') {
      a = randInt(1, 10 + difficultyLevel * 5);
      b = randInt(1, 10 + difficultyLevel * 5);
    } else if (op === '-') {
      a = randInt(1, 10 + difficultyLevel * 5);
      b = randInt(1, a);
    } else {
      a = randInt(2, 5 + difficultyLevel);
      b = randInt(2, 5 + difficultyLevel);
    }
    let questionText = `${a} ${op} ${b} = ?`;
    let correct;
    if (op === '+') correct = a + b;
    else if (op === '-') correct = a - b;
    else correct = a * b;

    const choices = new Set();
    choices.add(correct);
    while (choices.size < 4) {
      const variance = Math.max(1, Math.round(Math.abs(correct) * 0.4));
      let cand = correct + randInt(-variance - 3, variance + 3);
      if (cand === correct) cand += randInt(1, 3);
      if (cand < 0) cand = Math.abs(cand) + randInt(0, 2);
      choices.add(cand);
    }
    const choiceArr = Array.from(choices);
    for (let i = choiceArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choiceArr[i], choiceArr[j]] = [choiceArr[j], choiceArr[i]];
    }
    const correctIndex = choiceArr.indexOf(correct);
    return {
      text: questionText,
      choices: choiceArr,
      correctIndex: correctIndex
    };
  }

  // Start or restart game
  function startGame() {
    state.correct = 0;
    state.wrong = 0;
    state.selectionIndex = 0;
    state.answered = false;
    state.droneX = GAME_WIDTH / 2;
    state.droneY = GAME_HEIGHT / 2 + 40;
    state.droneTargetX = GAME_WIDTH / 2;
    state.droneTargetY = GAME_HEIGHT / 2 + 40;
    state.showVictory = false;
    state.showGameOver = false;
    state.animTime = 0;
    state.particles = [];
    state.confetti = [];
    state.currentQuestion = generateQuestion(0);
    if (state.audioOn) {
      tryResumeAudio();
      startBackgroundSound();
    } else {
      stopBackgroundSound();
    }
  }

  // UI layout computations
  const layout = {
    score: { x: PADDING + 6, y: PADDING + 6 },
    lives: { x: GAME_WIDTH - PADDING - 6, y: PADDING + 6 },
    questionBox: { x: 60, y: 60, w: GAME_WIDTH - 120, h: 110 },
    droneArea: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 - 10 },
    choicesBox: { x: 60, y: 190, w: GAME_WIDTH - 120, h: 170 },
    instructions: { x: GAME_WIDTH / 2, y: GAME_HEIGHT - 40 }
  };

  // Rounded rectangle helper
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
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

  // Helper to draw text with background rectangle ensuring readability and padding
  function drawTextBox(
    text,
    font,
    x,
    y,
    align = 'left',
    padding = 8,
    bgColor = 'rgba(255,255,255,0.75)',
    textColor = '#111'
  ) {
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = Math.max(16, parseInt(font, 10) || 16);
    let boxX = x;
    if (align === 'center') boxX = x - textWidth / 2 - padding;
    else if (align === 'right') boxX = x - textWidth - padding * 2;
    const boxY = y - textHeight - padding / 2;
    const boxW = textWidth + padding * 2;
    const boxH = textHeight + padding;
    let bx = Math.max(6, boxX);
    let by = Math.max(6, boxY);
    ctx.fillStyle = bgColor;
    roundRect(ctx, bx, by, boxW, boxH, 8, true, false);
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'top';
    ctx.textAlign = align;
    ctx.font = font;
    ctx.fillText(text, x, by + padding / 4);
    return { boxX: bx, boxY: by, boxW, boxH };
  }

  // Choice boxes computed for mouse hit testing
  function computeChoiceBoxes(question) {
    const boxes = [];
    const boxWidth = layout.choicesBox.w / 2 - 14;
    const boxHeight = 58;
    const startX = layout.choicesBox.x;
    const startY = layout.choicesBox.y + 10;
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = startX + col * (boxWidth + 20);
      const y = startY + row * (boxHeight + 16);
      boxes.push({ x, y, w: boxWidth, h: boxHeight });
    }
    return boxes;
  }

  // Draw battery icon (small)
  function drawBattery(x, y, w, h, fillPct, strokeColor = '#123') {
    ctx.save();
    ctx.translate(x, y);
    // body
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, 0, 0, w, h, 4, true, false);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.6;
    roundRect(ctx, 0, 0, w, h, 4, false, true);
    // terminal
    ctx.fillStyle = '#fff';
    roundRect(ctx, w - 4, Math.floor(h * 0.25), 6, Math.floor(h * 0.5), 2, true, true);
    // fill level
    const innerPad = 4;
    const levelW = Math.max(2, (w - innerPad * 2) * Math.min(1, Math.max(0, fillPct)));
    ctx.fillStyle = fillPct > 0.4 ? '#2a7a3a' : fillPct > 0.15 ? '#d8a533' : '#a02a2a';
    roundRect(ctx, innerPad, innerPad, levelW, h - innerPad * 2, 2, true, false);
    ctx.restore();
  }

  // Drawing drone (enhanced)
  function drawDrone(x, y, tilt = 0, propSpeed = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt * 0.06);
    // subtle bobbing
    const bob = Math.sin(state.animTime * 3) * 2;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(0, 48 + bob, 68, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // body shape with gradient
    const bodyW = 92;
    const bodyH = 40;
    const grad = ctx.createLinearGradient(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2);
    grad.addColorStop(0, '#8fd3e8');
    grad.addColorStop(1, '#6aa9c2');
    ctx.fillStyle = grad;
    roundRect(ctx, -bodyW / 2, -20 + bob, bodyW, bodyH, 12, true, false);

    // cockpit glass
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(-12, -6 + bob, 20, 14, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(-18, -6 + bob, 6, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // friendly eyes / indicators
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(6, -8 + bob, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b2230';
    ctx.beginPath();
    ctx.ellipse(10, -8 + bob, 3, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // skid
    ctx.strokeStyle = '#354b52';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-36, 22 + bob);
    ctx.lineTo(36, 22 + bob);
    ctx.stroke();

    // arms
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#314a52';
    ctx.beginPath();
    ctx.moveTo(-30, -6 + bob);
    ctx.lineTo(-70, -42 + bob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(30, -6 + bob);
    ctx.lineTo(70, -42 + bob);
    ctx.stroke();

    // propellers with subtle blur effect
    drawProp(-70, -42 + bob, propSpeed);
    drawProp(70, -42 + bob, propSpeed);

    // small indicator light (blinking)
    const blink = (Math.sin(state.animTime * 6) + 1) / 2;
    ctx.fillStyle = `rgba(250,250,80,${0.3 + 0.7 * blink})`;
    ctx.beginPath();
    ctx.ellipse(26, -14 + bob, 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // paint a battery slot on drone to show carrying state
    const padX = -8;
    const padY = 6 + bob;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    roundRect(ctx, padX, padY, 36, 16, 3, true, false);
    ctx.strokeStyle = '#0f2b32';
    ctx.lineWidth = 1.6;
    roundRect(ctx, padX, padY, 36, 16, 3, false, true);
    // small fill to indicate collected proportion relative to goal (not necessary, just decorative)
    const filled = Math.min(1, state.correct / GOAL_CORRECT);
    ctx.fillStyle = filled > 0.4 ? '#2a7a3a' : '#d8a533';
    roundRect(ctx, padX + 3, padY + 3, Math.round(30 * filled), 10, 2, true, false);

    ctx.restore();
  }

  function drawProp(cx, cy, speed) {
    ctx.save();
    ctx.translate(cx, cy);
    // soft translucent discs rotated to simulate blur
    const blades = 4;
    for (let i = 0; i < blades; i++) {
      ctx.rotate((Math.PI * 2 / blades) * i + speed * 0.45);
      ctx.fillStyle = 'rgba(20,20,20,0.16)';
      ctx.beginPath();
      ctx.ellipse(18, 0, 26, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Particle utilities for visual effects
  function spawnParticles(x, y, count = 18, color = '#8fd3e8', spread = 60) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 90;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40 * Math.random(),
        life: 0.6 + Math.random() * 0.6,
        age: 0,
        size: 3 + Math.random() * 4,
        color
      });
    }
  }

  function spawnConfetti(x, y, count = 80) {
    const colors = ['#f6c85f', '#8fd3e8', '#6aa9c2', '#ffd1dc', '#b6e7a6'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 180;
      state.confetti.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120 * Math.random(),
        life: 1.2 + Math.random() * 1.2,
        age: 0,
        size: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 8
      });
    }
  }

  // Draw the entire scene
  function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // soft layered sky gradient
    const grd = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    grd.addColorStop(0, '#eaf9ff');
    grd.addColorStop(0.5, '#f7fcff');
    grd.addColorStop(1, '#fffefc');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // distant hills parallax (gentle)
    const t = state.animTime;
    drawHills(t);

    // sun / orb
    const sunX = 100 + Math.sin(t * 0.12) * 18;
    const sunY = 60 + Math.cos(t * 0.09) * 4;
    const sunGrad = ctx.createRadialGradient(sunX - 6, sunY - 6, 2, sunX, sunY, 60);
    sunGrad.addColorStop(0, 'rgba(255,250,200,0.95)');
    sunGrad.addColorStop(1, 'rgba(255,250,200,0.08)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.ellipse(sunX, sunY, 36, 36, 0, 0, Math.PI * 2);
    ctx.fill();

    // floating clouds with subtle motion
    drawClouds(t);

    // Score top-left with battery icons
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    drawTextBox('', IMPORTANT_FONT, layout.score.x, layout.score.y + 6, 'left', 10, 'rgba(255,255,255,0.85)', '#084');
    // draw batteries next to score number
    const batteryX = layout.score.x + 8;
    const batteryY = layout.score.y + 10;
    for (let i = 0; i < GOAL_CORRECT; i++) {
      const bx = batteryX + i * 18;
      drawBattery(bx, batteryY, 14, 8, i < state.correct ? 1 : 0, i < state.correct ? '#063' : '#6666');
    }
    // label
    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = '#053';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${state.correct}/${GOAL_CORRECT}`, layout.score.x + 12, layout.score.y + 28);

    // Lives top-right
    ctx.textAlign = 'right';
    drawTextBox('', IMPORTANT_FONT, layout.lives.x, layout.lives.y + 6, 'right', 10, 'rgba(255,255,255,0.85)', '#840');
    // draw life icons (hearts) to represent remaining lives
    const livesLeft = Math.max(0, MAX_WRONG - state.wrong);
    const lifeXStart = layout.lives.x - 12;
    const lifeY = layout.lives.y + 12;
    for (let i = 0; i < MAX_WRONG; i++) {
      const lx = lifeXStart - i * 18;
      drawHeart(lx, lifeY, 12, i < livesLeft ? '#d13' : '#ddd');
    }
    // label
    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = '#430';
    ctx.textAlign = 'right';
    ctx.fillText('Lives', layout.lives.x - 6, layout.lives.y + 28);

    // Audio status small icon left of bottom-left text
    ctx.textAlign = 'left';
    const audioText = state.audioOn ? 'Sound: On (M to mute)' : 'Sound: Off (M to unmute)';
    drawTextBox(audioText, BODY_FONT, 12, GAME_HEIGHT - 12, 'left', 8, 'rgba(255,255,255,0.72)', '#333');

    // Question area
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, layout.questionBox.x, layout.questionBox.y, layout.questionBox.w, layout.questionBox.h, 14, true, false);

    // Move drone smoothly toward target
    const droneTargetX = state.droneTargetX;
    const droneTargetY = state.droneTargetY;
    state.droneX += (droneTargetX - state.droneX) * 0.08;
    state.droneY += (droneTargetY - state.droneY) * 0.06;
    const tilt = (state.droneTargetX - state.droneX) * 0.02 + Math.sin(state.animTime * 6) * 0.02;
    const propSpeed = state.animTime * 0.38;
    drawDrone(state.droneX, state.droneY, tilt, propSpeed);

    // draw question text centered in question box
    ctx.fillStyle = '#05242a';
    ctx.font = TITLE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const qx = layout.questionBox.x + layout.questionBox.w / 2;
    const qy = layout.questionBox.y + 12;
    drawMultilineWrappedText(state.currentQuestion.text, ctx, qx, qy, layout.questionBox.w - 36, TITLE_FONT, 'center', '#062');

    // Choices area background
    ctx.fillStyle = 'rgba(250,255,250,0.92)';
    roundRect(ctx, layout.choicesBox.x, layout.choicesBox.y, layout.choicesBox.w, layout.choicesBox.h, 12, true, false);

    // Draw choices
    ctx.font = CHOICE_FONT;
    const boxes = computeChoiceBoxes(state.currentQuestion);
    for (let i = 0; i < 4; i++) {
      const box = boxes[i];
      const isSelected = i === state.selectionIndex;
      const answered = state.answered;
      // box background with subtle gradient
      const boxGrad = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
      boxGrad.addColorStop(0, 'rgba(255,255,255,0.96)');
      boxGrad.addColorStop(1, isSelected ? 'rgba(230,245,255,0.96)' : 'rgba(250,252,250,0.96)');
      ctx.fillStyle = boxGrad;
      roundRect(ctx, box.x, box.y, box.w, box.h, 10, true, false);

      // border styles
      if (isSelected && !answered) {
        ctx.strokeStyle = '#2f78a6';
        ctx.lineWidth = 3;
        roundRect(ctx, box.x - 1, box.y - 1, box.w + 2, box.h + 2, 10, false, true);
      } else if (answered) {
        if (i === state.currentQuestion.correctIndex) {
          ctx.strokeStyle = '#2a7a3a';
          ctx.lineWidth = 4;
          roundRect(ctx, box.x - 1, box.y - 1, box.w + 2, box.h + 2, 10, false, true);
        } else if (i === state.selectionIndex && state.selectionIndex !== state.currentQuestion.correctIndex) {
          ctx.strokeStyle = '#a02a2a';
          ctx.lineWidth = 4;
          roundRect(ctx, box.x - 1, box.y - 1, box.w + 2, box.h + 2, 10, false, true);
        } else {
          ctx.strokeStyle = 'rgba(0,0,0,0.06)';
          ctx.lineWidth = 1;
          roundRect(ctx, box.x, box.y, box.w, box.h, 10, false, true);
        }
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        roundRect(ctx, box.x, box.y, box.w, box.h, 10, false, true);
      }

      // Choice label number
      ctx.fillStyle = '#123';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 16px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      const labelX = box.x + 12;
      const labelY = box.y + box.h / 2;
      ctx.fillText(`${i + 1}.`, labelX, labelY);

      // Choice value centered
      ctx.font = CHOICE_FONT;
      ctx.fillStyle = '#053';
      ctx.textAlign = 'center';
      ctx.fillText(String(state.currentQuestion.choices[i]), box.x + box.w / 2 + 6, box.y + box.h / 2);
    }

    // Instructions bottom center
    ctx.textAlign = 'center';
    ctx.font = BODY_FONT;
    ctx.fillStyle = '#053';
    const instructions =
      'Use 1-4 or arrow keys + Enter to pick. Click choice to answer. Press M to toggle sound. R to restart.';
    drawMultilineWrappedText(instructions, ctx, layout.instructions.x, layout.instructions.y - 6, GAME_WIDTH - 40, BODY_FONT, 'center', '#053');

    // update and draw particles
    updateParticles();

    // Victory or game over overlays
    if (state.showVictory || state.showGameOver) {
      ctx.fillStyle = 'rgba(3,13,30,0.5)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      const title = state.showVictory ? 'Victory! Drone Delivered All Batteries!' : 'Game Over';
      const subtitle = state.showVictory ? `You answered ${state.correct} correctly!` : `You answered ${state.correct} correctly. Try again!`;
      ctx.font = TITLE_FONT;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(title, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);
      ctx.font = IMPORTANT_FONT;
      ctx.fillText(subtitle, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 18);
      ctx.font = BODY_FONT;
      ctx.fillText('Press R or click anywhere to restart.', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16);
    }

    // Accessibility text alternatives: small label bottom-left
    ctx.font = '13px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText('Accessible controls: keyboard and mouse supported.', 8, GAME_HEIGHT - 18);
  }

  function drawHills(t) {
    // multiple parallax hills
    function hill(yOffset, amplitude, hue, speed, opacity) {
      ctx.save();
      ctx.translate(0, yOffset);
      ctx.fillStyle = `rgba(${hue}, ${opacity})`;
      ctx.beginPath();
      ctx.moveTo(-200, GAME_HEIGHT);
      for (let x = -200; x <= GAME_WIDTH + 200; x += 40) {
        const px = x;
        const py = Math.sin(x * 0.02 + t * speed) * amplitude + 40;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(GAME_WIDTH + 200, GAME_HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // draw three layered soft hills
    hill(260, 20, '200,230,245', 0.2, 0.45);
    hill(300, 32, '195,225,240', 0.14, 0.5);
    hill(340, 46, '185,215,235', 0.08, 0.6);
  }

  function drawClouds(t) {
    const baseAlpha = 0.75;
    for (let i = 0; i < 5; i++) {
      const cx = (i * 160 + (t * 8 + i * 30) % 360) % (GAME_WIDTH + 120) - 60;
      const cy = 40 + (i % 2) * 18 + Math.sin(t * 0.5 + i) * 6;
      ctx.fillStyle = `rgba(255,255,255,${baseAlpha - i * 0.08})`;
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.ellipse(cx + j * 28, cy + (j % 2) * 6, 34, 22, j * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawHeart(cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    const topCurveHeight = size * 0.3;
    ctx.moveTo(0, topCurveHeight);
    ctx.bezierCurveTo(0, topCurveHeight - size * 0.3, -size / 2, topCurveHeight - size * 0.3, -size / 2, topCurveHeight);
    ctx.bezierCurveTo(-size / 2, topCurveHeight + size / 2, 0, topCurveHeight + size - 4, 0, topCurveHeight + size);
    ctx.bezierCurveTo(0, topCurveHeight + size - 4, size / 2, topCurveHeight + size / 2, size / 2, topCurveHeight);
    ctx.bezierCurveTo(size / 2, topCurveHeight - size * 0.3, 0, topCurveHeight - size * 0.3, 0, topCurveHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMultilineWrappedText(text, ctx, x, y, maxWidth, font, align = 'left', color = '#000') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    const words = text.split(' ');
    let line = '';
    const lineHeight = Math.max(18, parseInt(font, 10) + 6);
    let drawY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, drawY);
        line = words[n] + ' ';
        drawY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line.trim(), x, drawY);
    }
  }

  // update and draw particles/confetti
  function updateParticles() {
    const dt = Math.min(1 / 30, 0.016 + state.animTime * 0); // safe dt approximation
    // particle update
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.age += Math.min(0.016, 0.032);
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016 + 18 * 0.016; // gravity
      p.vx *= 0.99;
      p.vy += 18 * 0.016;
      const alpha = Math.max(0, 1 - p.age / p.life);
      if (alpha <= 0.02) state.particles.splice(i, 1);
      else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // confetti update
    for (let i = state.confetti.length - 1; i >= 0; i--) {
      const c = state.confetti[i];
      c.age += Math.min(0.016, 0.032);
      c.x += c.vx * 0.016;
      c.y += c.vy * 0.016;
      c.vy += 300 * 0.016; // gravity stronger
      c.vx *= 0.995;
      c.rot += c.spin * 0.016;
      const alpha = Math.max(0, 1 - c.age / c.life);
      if (alpha <= 0.02 || c.y > GAME_HEIGHT + 60) state.confetti.splice(i, 1);
      else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }

  // Handle answer selection (keeps logic but adds visual/audio effects)
  function submitAnswer(index) {
    if (state.showVictory || state.showGameOver) return;
    if (state.answered) return;
    state.selectionIndex = index;
    state.answered = true;
    if (index === state.currentQuestion.correctIndex) {
      state.correct += 1;
      playCorrectSound();
      // spawn gentle particles at drone
      spawnParticles(state.droneX, state.droneY - 20, 18, '#8fd3e8');
      // drone flies to top-right and back (unchanged mechanics)
      state.droneTargetX = randInt(GAME_WIDTH - 140, GAME_WIDTH - 80);
      state.droneTargetY = randInt(90, 140);
      setTimeout(() => {
        if (state.correct >= GOAL_CORRECT) {
          handleVictory();
        } else {
          state.currentQuestion = generateQuestion(Math.floor(state.correct / 3));
          state.selectionIndex = 0;
          state.answered = false;
          state.droneTargetX = GAME_WIDTH / 2 + randInt(-30, 30);
          state.droneTargetY = GAME_HEIGHT / 2 + randInt(10, 60);
        }
      }, 900);
    } else {
      state.wrong += 1;
      playIncorrectSound();
      // small recoil visual particles
      spawnParticles(state.droneX - 10, state.droneY, 10, '#ffb3b3', 30);
      state.droneTargetX = Math.max(80, Math.min(GAME_WIDTH - 80, state.droneX - 90));
      state.droneTargetY = state.droneY + 30;
      setTimeout(() => {
        if (state.wrong >= MAX_WRONG) handleGameOver();
        else {
          state.currentQuestion = generateQuestion(Math.floor(state.correct / 3));
          state.selectionIndex = 0;
          state.answered = false;
          state.droneTargetX = GAME_WIDTH / 2 + randInt(-30, 30);
          state.droneTargetY = GAME_HEIGHT / 2 + randInt(10, 60);
        }
      }, 900);
    }
  }

  function handleVictory() {
    state.showVictory = true;
    state.answered = false;
    stopBackgroundSound();
    // celebratory confetti and fanfare
    spawnConfetti(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 120);
    if (audioCtx && state.audioOn) {
      try {
        playBeep({ freq: 560, duration: 0.18, volume: 0.08, type: 'sine' });
        setTimeout(() => playBeep({ freq: 740, duration: 0.28, volume: 0.08, type: 'sine' }), 150);
        setTimeout(() => playBeep({ freq: 980, duration: 0.35, volume: 0.08, type: 'sine' }), 320);
        setTimeout(() => playBeep({ freq: 1240, duration: 0.4, volume: 0.07, type: 'sine' }), 540);
      } catch (e) {
        console.warn('Victory sound error:', e);
      }
    }
  }

  function handleGameOver() {
    state.showGameOver = true;
    state.answered = false;
    stopBackgroundSound();
    if (audioCtx && state.audioOn) playIncorrectSound();
  }

  // Input handling
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (state.showVictory || state.showGameOver) {
      startGame();
      return;
    }
    const boxes = computeChoiceBoxes(state.currentQuestion);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        submitAnswer(i);
        return;
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (!state.answered && !state.showVictory && !state.showGameOver) {
      const boxes = computeChoiceBoxes(state.currentQuestion);
      let hovered = -1;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          hovered = i;
          break;
        }
      }
      if (hovered !== -1 && hovered !== state.selectionIndex) {
        state.selectionIndex = hovered;
        // subtle selection audio but avoid frequent triggers
        if (lastSelectionIndex !== hovered) {
          lastSelectionIndex = hovered;
          playSelectSound();
        }
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.key >= '1' && e.key <= '4') {
      const idx = Number(e.key) - 1;
      submitAnswer(idx);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (!state.showVictory && !state.showGameOver) {
        state.selectionIndex = (state.selectionIndex + 1) % 4;
        playSelectSound();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (!state.showVictory && !state.showGameOver) {
        state.selectionIndex = (state.selectionIndex + 3) % 4;
        playSelectSound();
      }
    } else if (e.key === 'Enter') {
      if (state.showVictory || state.showGameOver) {
        startGame();
      } else {
        submitAnswer(state.selectionIndex);
      }
    } else if (e.key.toLowerCase() === 'm') {
      state.audioOn = !state.audioOn;
      if (state.audioOn) {
        audioEnabled = true;
        tryResumeAudio();
        startBackgroundSound();
      } else {
        stopBackgroundSound();
      }
    } else if (e.key.toLowerCase() === 'r') {
      startGame();
    }
  });

  // Animation loop
  let lastTime = 0;
  function loop(t) {
    const dt = (t - lastTime) / 1000 || 0;
    lastTime = t;
    state.animTime += dt;
    // gentle wobble update
    if (state.answered && state.wrong > 0) {
      state.wobble += dt * 8;
    } else {
      state.wobble += dt * 2;
    }
    draw();
    requestAnimationFrame(loop);
  }

  // Start initial
  startGame();
  requestAnimationFrame(loop);

  // Global error handling
  window.addEventListener('unhandledrejection', (e) => {
    console.warn('Unhandled promise rejection:', e.reason);
  });
  window.addEventListener('error', (e) => {
    console.warn('Window error:', e.message, 'at', e.filename, ':', e.lineno);
  });
})();