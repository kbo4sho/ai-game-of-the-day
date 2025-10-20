(function () {
  // Enhanced Drone Math Catcher (visuals & audio improved)
  // Mechanics preserved from original: moves, collisions, scoring, win/lose, question generation.
  // Renders inside element with ID 'game-of-the-day-stage'.

  // -------------------------
  // Constants & Stage Setup
  // -------------------------
  const STAGE_ID = "game-of-the-day-stage";
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_CORRECT = 10;
  const MAX_WRONG = 3;
  const PADDING = 10;
  const MIN_BODY_FONT = 14;
  const IMPORTANT_FONT = 20;

  const container = document.getElementById(STAGE_ID);
  if (!container) {
    console.error(`Container element with id "${STAGE_ID}" not found.`);
    return;
  }
  container.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = "block";
  canvas.style.background = "#E8F6FF";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Drone math catcher game. Move the drone to catch the bubble with the correct answer. Use arrow keys or WASD. Press M to mute sound."
  );

  // -------------------------
  // Audio: Web Audio API setup
  // -------------------------
  let audioCtx = null;
  let masterGain = null;
  let bgNodes = []; // active background oscillator nodes
  let audioEnabled = true;
  let audioInitAttempted = false;
  let bgFilter = null;

  function createAudioContext() {
    if (audioCtx || audioInitAttempted) return;
    audioInitAttempted = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio API not supported");
      audioCtx = new AC();

      // master gain controllable for mute
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.16; // gentle baseline
      masterGain.connect(audioCtx.destination);

      // gentle lowpass for background to keep sounds soft
      bgFilter = audioCtx.createBiquadFilter();
      bgFilter.type = "lowpass";
      bgFilter.frequency.value = 700;
      bgFilter.Q.value = 0.7;
      bgFilter.connect(masterGain);

      // create layered background pads (sine + triangle, subtle detune)
      const now = audioCtx.currentTime;
      const tones = [
        { type: "sine", freq: 86, gain: 0.012 }, // low pad
        { type: "triangle", freq: 130, gain: 0.01 }, // mid pad
        { type: "sine", freq: 196, gain: 0.008 }, // air
      ];
      bgNodes = tones.map((t, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = t.type;
        osc.frequency.value = t.freq * (1 + (i === 1 ? -0.003 : i === 2 ? 0.004 : 0));
        const g = audioCtx.createGain();
        g.gain.value = t.gain;
        // slow LFO to modulate amplitude slightly
        const lfo = audioCtx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.05 + i * 0.02;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = t.gain * 0.6;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        osc.connect(g);
        g.connect(bgFilter);
        osc.start(now);
        lfo.start(now);
        return { osc, g, lfo, lfoGain };
      });

      if (!audioEnabled) {
        masterGain.gain.value = 0;
      }
    } catch (e) {
      console.warn("Audio initialization failed:", e);
      audioCtx = null;
      audioInitAttempted = true;
      audioEnabled = false;
    }
  }

  function resumeAudioIfRequired() {
    if (!audioCtx) return;
    if (typeof audioCtx.resume === "function") {
      audioCtx.resume().catch((e) => {
        console.warn("Audio resume failed:", e);
      });
    }
  }

  // Utility: create a short envelope oscillator tone
  function playTone({ type = "sine", freq = 440, duration = 0.3, peak = 0.1, detune = 0 }) {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      if (detune) o.detune.value = detune;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      console.warn("playTone error:", e);
    }
  }

  // Correct chime: quick arpeggio with bright timbres
  function playCorrectSound() {
    if (!audioCtx || !audioEnabled) return;
    try {
      const base = 660;
      const now = audioCtx.currentTime;
      const intervals = [0, 4, 7]; // major triad
      for (let i = 0; i < intervals.length; i++) {
        const freq = base * Math.pow(2, intervals[i] / 12);
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? "triangle" : "sine";
        o.frequency.value = freq;
        const g = audioCtx.createGain();
        const start = now + i * 0.06;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.28 + i * 0.04);
        o.connect(g);
        g.connect(masterGain);
        o.start(start);
        o.stop(start + 0.36 + i * 0.04);
      }
    } catch (e) {
      console.warn("playCorrectSound error:", e);
    }
  }

  // Incorrect: soft descending minor-ish tone
  function playIncorrectSound() {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(260, now);
      o.frequency.exponentialRampToValueAtTime(140, now + 0.28);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      o.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + 0.34);
    } catch (e) {
      console.warn("playIncorrectSound error:", e);
    }
  }

  // Toggle audio with gentle ramp
  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (!audioCtx) {
      // user may toggle before audio initialization
      if (audioEnabled) createAudioContext();
      resumeAudioIfRequired();
    }
    if (!masterGain) return;
    try {
      const now = audioCtx ? audioCtx.currentTime : 0;
      if (!audioEnabled) {
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(0, now + 0.12);
      } else {
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value || 0, now);
        masterGain.gain.linearRampToValueAtTime(0.16, now + 0.12);
      }
    } catch (e) {
      // fallback immediate set
      try {
        masterGain.gain.value = audioEnabled ? 0.16 : 0;
      } catch (ee) {
        console.warn("toggleAudio error:", ee);
      }
    }
  }

  // -------------------------
  // Game state (keeps mechanics intact)
  // -------------------------
  const state = {
    mode: "loading", // 'playing', 'win', 'gameover'
    drone: {
      x: WIDTH / 2,
      y: HEIGHT - 120,
      vx: 0,
      vy: 0,
      speed: 180,
      radius: 26,
    },
    keys: { left: false, right: false, up: false, down: false },
    mouse: { x: null, y: null, active: false },
    question: null,
    bubbles: [],
    correctCount: 0,
    wrongCount: 0,
    lastSpawn: 0,
    spawnInterval: 1200,
    lastTime: performance.now(),
    feedbackFlash: { color: null, t: 0 },
    rngCounter: 0,
    particles: [], // visual-only particles on catches
  };

  // -------------------------
  // Helpers
  // -------------------------
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function nowMs() {
    return performance.now();
  }

  // -------------------------
  // Math generation (unchanged logic)
  // -------------------------
  function generateQuestion() {
    const ops = ["+", "+", "+", "-", "-", "×"];
    const op = ops[randomInt(0, ops.length - 1)];
    let a, b, answer;
    if (op === "+") {
      a = randomInt(1, 20);
      b = randomInt(1, 20);
      answer = a + b;
    } else if (op === "-") {
      a = randomInt(1, 20);
      b = randomInt(1, Math.min(19, a));
      answer = a - b;
    } else {
      a = randomInt(2, 6);
      b = randomInt(2, 6);
      answer = a * b;
    }
    const qText = `${a} ${op} ${b} = ?`;
    const choices = new Set();
    choices.add(answer);
    while (choices.size < 4) {
      const delta = randomInt(1, Math.max(3, Math.floor(Math.abs(answer / 5) + 3)));
      const sign = Math.random() < 0.5 ? -1 : 1;
      let cand = answer + sign * delta;
      if (cand < 0) cand = Math.abs(cand) + 1;
      choices.add(cand);
    }
    const arr = Array.from(choices);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return { qText, answer, choices: arr };
  }

  // -------------------------
  // Bubbles spawn (unchanged logic, visual properties added)
  // -------------------------
  function spawnBubblesForQuestion(question) {
    const bubbles = [];
    const marginLeft = 60;
    const marginRight = WIDTH - 60;
    const total = question.choices.length;
    const spacing = (marginRight - marginLeft) / (total - 1 || 1);
    for (let i = 0; i < total; i++) {
      const x = marginLeft + spacing * i + randomInt(-20, 20);
      const y = randomInt(120, 220) + randomInt(-40, 40);
      const vy = randomInt(10, 35) / 50;
      const val = question.choices[i];
      const isCorrect = val === question.answer;
      bubbles.push({
        id: `${Date.now()}-${i}-${state.rngCounter++}`,
        x,
        y,
        vy,
        value: val,
        isCorrect,
        r: 30 + Math.floor(Math.random() * 6),
        wobbleSeed: Math.random() * 1000,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }
    state.bubbles = bubbles;
  }

  // -------------------------
  // Particles (visual only)
  // -------------------------
  function spawnCatchParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 80;
      const life = 400 + Math.random() * 400;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life,
        t0: nowMs(),
        color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  // -------------------------
  // Game control (start/end) - mechanics preserved
  // -------------------------
  function startNewGame() {
    state.mode = "playing";
    state.drone.x = WIDTH / 2;
    state.drone.y = HEIGHT - 120;
    state.drone.vx = 0;
    state.drone.vy = 0;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.feedbackFlash.t = 0;
    state.lastSpawn = nowMs();
    state.spawnInterval = 1200;
    state.bubbles = [];
    state.particles = [];
    state.question = generateQuestion();
    spawnBubblesForQuestion(state.question);
    state.lastTime = performance.now();
    createAudioContext();
    resumeAudioIfRequired();
    requestAnimationFrame(loop);
  }

  function endGame(win) {
    state.mode = win ? "win" : "gameover";
    if (audioCtx && masterGain && audioEnabled) {
      if (win) playCorrectSound();
      else playIncorrectSound();
    }
  }

  // -------------------------
  // Input handlers (preserve keys & behavior)
  // -------------------------
  window.addEventListener("keydown", (e) => {
    createAudioContext();
    resumeAudioIfRequired();

    const key = e.key;
    if (key === "ArrowLeft" || key === "a" || key === "A") state.keys.left = true;
    else if (key === "ArrowRight" || key === "d" || key === "D") state.keys.right = true;
    else if (key === "ArrowUp" || key === "w" || key === "W") state.keys.up = true;
    else if (key === "ArrowDown" || key === "s" || key === "S") state.keys.down = true;
    else if (key === "m" || key === "M") toggleAudio();
    else if (key === "Enter") {
      if (state.mode === "win" || state.mode === "gameover") {
        startNewGame();
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    const key = e.key;
    if (key === "ArrowLeft" || key === "a" || key === "A") state.keys.left = false;
    else if (key === "ArrowRight" || key === "d" || key === "D") state.keys.right = false;
    else if (key === "ArrowUp" || key === "w" || key === "W") state.keys.up = false;
    else if (key === "ArrowDown" || key === "s" || key === "S") state.keys.down = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    state.mouse.x = mx;
    state.mouse.y = my;
  });

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (state.mode === "win" || state.mode === "gameover") {
      const btn = restartButtonRect();
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        startNewGame();
        return;
      }
    }

    if (state.mode === "playing") {
      for (const b of state.bubbles.slice()) {
        const dx = b.x - mx;
        const dy = b.y - my;
        if (Math.sqrt(dx * dx + dy * dy) <= b.r + 5) {
          handleBubbleCatch(b);
          break;
        }
      }
    }
  });

  function restartButtonRect() {
    const font = `${IMPORTANT_FONT}px sans-serif`;
    const text = "Restart";
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const tw = Math.ceil(metrics.width);
    const th = IMPORTANT_FONT;
    const bw = tw + PADDING * 2;
    const bh = th + PADDING * 2;
    const x = WIDTH / 2 - bw / 2;
    const y = HEIGHT / 2 + 40;
    return { x, y, w: bw, h: bh, text, font };
  }

  // -------------------------
  // Collision / Catch logic (preserved)
  // -------------------------
  function handleBubbleCatch(bubble) {
    state.bubbles = state.bubbles.filter((b) => b.id !== bubble.id);
    if (bubble.isCorrect) {
      state.correctCount++;
      state.feedbackFlash.color = "rgba(80,200,120,0.28)";
      state.feedbackFlash.t = nowMs();
      spawnCatchParticles(bubble.x, bubble.y, "rgba(100,220,140,0.95)", 14);
      playCorrectSound();
      if (state.correctCount >= TARGET_CORRECT) {
        endGame(true);
        return;
      }
      state.question = generateQuestion();
      spawnBubblesForQuestion(state.question);
    } else {
      state.wrongCount++;
      state.feedbackFlash.color = "rgba(255,80,80,0.28)";
      state.feedbackFlash.t = nowMs();
      spawnCatchParticles(bubble.x, bubble.y, "rgba(255,140,120,0.95)", 8);
      playIncorrectSound();
      if (state.wrongCount >= MAX_WRONG) {
        endGame(false);
        return;
      }
      setTimeout(() => {
        if (state.mode !== "playing") return;
        const val = bubble.value + (Math.random() < 0.5 ? -2 : 2);
        const newBubble = {
          id: `${Date.now()}-spawn${state.rngCounter++}`,
          x: Math.min(Math.max(60, bubble.x + randomInt(-40, 40)), WIDTH - 60),
          y: Math.min(Math.max(120, bubble.y + randomInt(-20, 20)), HEIGHT - 180),
          vy: randomInt(10, 30) / 50,
          value: val,
          isCorrect: val === state.question.answer,
          r: 28 + Math.floor(Math.random() * 8),
          wobbleSeed: Math.random() * 1000,
          pulsePhase: Math.random() * Math.PI * 2,
        };
        state.bubbles.push(newBubble);
      }, 700);
    }
  }

  // -------------------------
  // Drawing helpers (enhanced visuals)
  // -------------------------
  function clearCanvas() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#dff6ff");
    sky.addColorStop(0.6, "#e9fbf0");
    sky.addColorStop(1, "#ffffff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // distant soft hills (parallax)
    drawHills();

    // subtle ambient floating shapes (non-distracting)
    drawAmbientOrbs();
  }

  function drawHills() {
    const t = nowMs() / 8000;
    // three layered hills with different colors and vertical offsets
    const hills = [
      { color: "#eafaf0", amp: 28, yBase: 380, speed: 0.2 },
      { color: "#d7f0e8", amp: 40, yBase: 400, speed: 0.12 },
      { color: "#c6e8de", amp: 60, yBase: 430, speed: 0.06 },
    ];
    for (const h of hills) {
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT);
      for (let x = 0; x <= WIDTH; x += 16) {
        const yy =
          h.yBase +
          Math.sin((x / 120) * Math.PI * 2 + t * h.speed) * h.amp * Math.sin((x + t * 40) / 200);
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.closePath();
      ctx.fillStyle = h.color;
      ctx.fill();
    }
  }

  function drawAmbientOrbs() {
    const baseAlpha = 0.05;
    for (let i = 0; i < 12; i++) {
      const x = (i * 63) % WIDTH;
      const y = (i * 97 + nowMs() / (120 + i * 3)) % HEIGHT;
      const r = 24 + (i % 3) * 8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,230,255,${baseAlpha})`;
      ctx.fill();
    }
  }

  // Draw UI panels with improved styling
  function drawUI() {
    // Top-left: correct count
    const scoreText = `Correct: ${state.correctCount}/${TARGET_CORRECT}`;
    const scoreFont = `${IMPORTANT_FONT}px system-ui, sans-serif`;
    ctx.font = scoreFont;
    ctx.textBaseline = "top";
    const scoreMetrics = ctx.measureText(scoreText);
    const sw = Math.ceil(scoreMetrics.width) + PADDING * 2;
    const sh = IMPORTANT_FONT + PADDING * 2;
    const sx = PADDING;
    const sy = PADDING;
    // panel with slight blur-like stroke
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundFillRect(sx, sy, sw, sh, 8);
    ctx.strokeStyle = "rgba(40,80,100,0.08)";
    ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    ctx.fillStyle = "#0b3d2e";
    ctx.fillText(scoreText, sx + PADDING, sy + PADDING);

    // Top-right: lives remaining with little battery-like icon
    const livesText = `Wrong left: ${MAX_WRONG - state.wrongCount}`;
    ctx.font = scoreFont;
    const livesMetrics = ctx.measureText(livesText);
    const lw = Math.ceil(livesMetrics.width) + PADDING * 2 + 28;
    const lh = IMPORTANT_FONT + PADDING * 2;
    const lx = WIDTH - PADDING - lw;
    const ly = PADDING;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundFillRect(lx, ly, lw, lh, 8);
    ctx.strokeStyle = "rgba(40,80,100,0.08)";
    ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1);
    // battery icon
    drawLivesIcon(lx + 8, ly + (lh - 16) / 2, 18, 12, Math.max(0, MAX_WRONG - state.wrongCount));
    ctx.fillStyle = "#08323a";
    ctx.fillText(livesText, lx + 36, ly + PADDING);

    // Audio indicator (speaker icon) next to lives
    drawAudioIcon(lx - 34, ly + (lh - 20) / 2, 20, 20, audioEnabled);

    // Question center-top
    const qFont = `${IMPORTANT_FONT + 2}px system-ui, sans-serif`;
    ctx.font = qFont;
    ctx.fillStyle = "#012b2a";
    ctx.textBaseline = "middle";
    const qText = state.question ? state.question.qText : "Loading...";
    const qm = ctx.measureText(qText);
    const qW = Math.ceil(qm.width) + PADDING * 2;
    const qH = IMPORTANT_FONT + 8 + PADDING;
    const qX = WIDTH / 2 - qW / 2;
    const qY = 48 - qH / 2;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundFillRect(qX, qY, qW, qH, 10);
    ctx.strokeStyle = "rgba(40,80,100,0.06)";
    ctx.strokeRect(qX + 0.5, qY + 0.5, qW - 1, qH - 1);
    ctx.fillStyle = "#08323a";
    ctx.fillText(qText, qX + PADDING, qY + qH / 2);

    // Instructions bottom
    const instructions = [
      "Move: Arrow keys or WASD. Click a bubble to catch it.",
      "Press M to mute/unmute sound. Press Enter to restart after game ends.",
    ];
    ctx.font = `${MIN_BODY_FONT}px system-ui, sans-serif`;
    const lineH = MIN_BODY_FONT + 6;
    let maxW = 0;
    for (const line of instructions) maxW = Math.max(maxW, ctx.measureText(line).width);
    const instrW = maxW + PADDING * 2;
    const instrH = instructions.length * lineH + PADDING * 2;
    const ix = WIDTH / 2 - instrW / 2;
    const iy = HEIGHT - instrH - 12;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundFillRect(ix, iy, instrW, instrH, 8);
    ctx.strokeStyle = "rgba(40,80,100,0.06)";
    ctx.strokeRect(ix + 0.5, iy + 0.5, instrW - 1, instrH - 1);
    ctx.fillStyle = "#0b3d2e";
    for (let i = 0; i < instructions.length; i++) {
      ctx.fillText(instructions[i], ix + PADDING, iy + PADDING + i * lineH);
    }
  }

  function roundFillRect(x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.closePath();
      ctx.fill();
    } else {
      // fallback
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
    }
  }

  function drawLivesIcon(x, y, w, h, livesLeft) {
    // simple battery-like capsule showing remaining wrongs allowed visually
    ctx.save();
    ctx.translate(x, y);
    // outline
    ctx.fillStyle = "rgba(10,10,10,0.06)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(10,10,10,0.12)";
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    // inner fill proportional to livesLeft (0..MAX_WRONG)
    const pct = Math.max(0, Math.min(1, livesLeft / MAX_WRONG));
    ctx.fillStyle = pct > 0.5 ? "#7bd389" : pct > 0.2 ? "#ffd66b" : "#ff8a75";
    const innerW = Math.max(2, Math.floor((w - 4) * pct));
    ctx.fillRect(2, 2, innerW, h - 4);
    ctx.restore();
  }

  function drawAudioIcon(x, y, w, h, on) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundFillRect(-4, -4, w + 8, h + 8, 6);
    ctx.strokeStyle = "rgba(40,80,100,0.06)";
    ctx.strokeRect(-3.5, -3.5, w + 7, h + 7);

    // draw speaker with canvas shapes
    ctx.fillStyle = on ? "#0a3" : "#888";
    ctx.beginPath();
    ctx.moveTo(3, 6);
    ctx.lineTo(10, 6);
    ctx.lineTo(14, 3);
    ctx.lineTo(14, h - 3);
    ctx.lineTo(10, h - 6);
    ctx.lineTo(3, h - 6);
    ctx.closePath();
    ctx.fill();

    if (on) {
      // draw arcs waves
      ctx.strokeStyle = "#0a3";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(16, h / 2, 6, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(16, h / 2, 10, -0.6, 0.6);
      ctx.stroke();
    } else {
      // draw small slash
      ctx.strokeStyle = "#b33";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(w + 2, h + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw drone with more detail and subtle animations
  function drawDrone(drone, t = 0) {
    const { x, y, radius } = drone;
    ctx.save();
    ctx.translate(x, y);

    // subtle shadow
    const shadowScale = 1.2;
    ctx.beginPath();
    ctx.ellipse(6, radius + 12, radius * 0.95 * shadowScale, radius * 0.32 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,10,20,0.09)";
    ctx.fill();

    // body gradient
    const bodyW = radius * 2.2;
    const bodyH = radius * 1.2;
    const g = ctx.createLinearGradient(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2);
    g.addColorStop(0, "#ffd66b");
    g.addColorStop(1, "#ffcc4d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,80,40,0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // window/face
    ctx.beginPath();
    ctx.fillStyle = "#0b3a3a";
    ctx.ellipse(0, 0, radius * 0.6, radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6ff7d3";
    ctx.beginPath();
    ctx.ellipse(-6, -4, 6, 6, 0, 0, Math.PI * 2); // left eye
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, -4, 6, 6, 0, 0, Math.PI * 2); // right eye
    ctx.fill();

    // slight eye blink animation (timed)
    const blink = Math.abs(Math.sin(t / 900 + (x + y) / 300)) > 0.98 ? 0.5 : 1;
    ctx.fillStyle = `rgba(0,0,0,${0.08 * blink})`;
    ctx.fillRect(-12, -2, 8, 2 * (1 - blink));
    ctx.fillRect(6, -2, 8, 2 * (1 - blink));

    // landing legs
    ctx.strokeStyle = "rgba(40,40,50,0.12)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-bodyW / 3, bodyH / 2);
    ctx.lineTo(-bodyW / 3, bodyH / 2 + 18);
    ctx.moveTo(bodyW / 3, bodyH / 2);
    ctx.lineTo(bodyW / 3, bodyH / 2 + 18);
    ctx.stroke();

    // propellers (rotating)
    const spin = (t / 140) % (Math.PI * 2);
    const props = [
      { cx: -bodyW / 2 + 6, cy: -bodyH / 2 + 2 },
      { cx: bodyW / 2 - 6, cy: -bodyH / 2 + 2 },
      { cx: -bodyW / 2 + 6, cy: bodyH / 2 - 2 },
      { cx: bodyW / 2 - 6, cy: bodyH / 2 - 2 },
    ];
    for (let i = 0; i < props.length; i++) {
      drawPropeller(props[i].cx, props[i].cy, spin + i * 0.5, radius * 0.9);
    }

    ctx.restore();
  }

  function drawPropeller(cx, cy, spin, scale) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    // hub
    ctx.beginPath();
    ctx.fillStyle = "rgba(30,40,60,0.85)";
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    // blades (semi-transparent for subtle motion)
    ctx.fillStyle = "rgba(20,30,40,0.18)";
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.ellipse(0, -scale * 0.18, scale * 0.6, scale * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Bubbles with pulsing, subtle glow & soft shadows
  function drawBubbles(bubbles) {
    const t = nowMs() / 1000;
    for (const b of bubbles) {
      const pulse = 1 + Math.sin(t * 3 + b.pulsePhase) * 0.03;
      const wobble = Math.sin((t + b.wobbleSeed) * 2) * 0.6;
      const rx = b.x + wobble;
      const ry = b.y;

      // shadow
      ctx.beginPath();
      ctx.ellipse(rx + 6, ry + 10, b.r * 0.9, b.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(10,10,20,0.06)";
      ctx.fill();

      // body with radial gradient
      const grad = ctx.createRadialGradient(rx - b.r * 0.2, ry - b.r * 0.3, b.r * 0.1, rx, ry, b.r);
      if (b.isCorrect) {
        grad.addColorStop(0, "rgba(230,255,240,0.98)");
        grad.addColorStop(0.6, "rgba(155,230,180,0.95)");
        grad.addColorStop(1, "rgba(120,200,150,0.95)");
      } else {
        grad.addColorStop(0, "rgba(245,250,255,0.98)");
        grad.addColorStop(0.6, "rgba(190,205,255,0.95)");
        grad.addColorStop(1, "rgba(160,185,255,0.95)");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rx, ry, b.r * pulse, 0, Math.PI * 2);
      ctx.fill();

      // rim stroke
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.stroke();

      // highlight ellipse
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.ellipse(rx - b.r * 0.35, ry - b.r * 0.45, b.r * 0.36, b.r * 0.22, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // number
      ctx.fillStyle = "#072a22";
      ctx.font = `bold ${Math.max(18, Math.floor(b.r / 1.5))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(b.value), rx, ry + Math.sin(t * 1.3 + b.pulsePhase) * 1.5);
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // Draw particles
  function drawParticles(dt) {
    const now = nowMs();
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      const life = now - p.t0;
      if (life > p.life) {
        state.particles.splice(i, 1);
        continue;
      }
      const t = life / p.life;
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 0.5 * 150 * (t * t) * 0.0001;
      ctx.beginPath();
      ctx.fillStyle = p.color.replace("0.95", String(1 - t).slice(0, 4));
      ctx.arc(x, y, Math.max(0.6, p.size * (1 - t)), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // -------------------------
  // Main loop & update (mechanics preserved)
  // -------------------------
  function loop() {
    if (state.mode !== "playing") {
      draw();
      return;
    }
    const t0 = nowMs();
    const dt = Math.min(100, t0 - state.lastTime);
    update(dt / 1000);
    draw();
    state.lastTime = t0;
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const d = state.drone;
    // input
    let moveX = 0;
    let moveY = 0;
    if (state.keys.left) moveX -= 1;
    if (state.keys.right) moveX += 1;
    if (state.keys.up) moveY -= 1;
    if (state.keys.down) moveY += 1;

    if (
      state.mouse.x !== null &&
      state.mouse.y !== null &&
      !state.keys.left &&
      !state.keys.right &&
      !state.keys.up &&
      !state.keys.down
    ) {
      const dx = state.mouse.x - d.x;
      const dy = state.mouse.y - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 8) {
        moveX = dx / dist;
        moveY = dy / dist;
      }
    }

    if (moveX !== 0 || moveY !== 0) {
      const len = Math.sqrt(moveX * moveX + moveY * moveY);
      moveX /= len;
      moveY /= len;
      d.x += moveX * d.speed * dt;
      d.y += moveY * d.speed * dt;
    } else {
      d.x += Math.sin(nowMs() / 600) * 0.2;
      d.y += Math.cos(nowMs() / 700) * 0.15;
    }

    d.x = Math.max(30, Math.min(WIDTH - 30, d.x));
    d.y = Math.max(80, Math.min(HEIGHT - 140, d.y));

    // update bubbles
    for (const b of state.bubbles) {
      b.y += b.vy;
      b.x += Math.sin((nowMs() + b.x) / 1200) * 0.4;
      if (b.y > HEIGHT - 120) b.y = 120 + Math.random() * 40;
      if (b.y < 100) b.y = 100 + Math.random() * 60;
    }

    // collisions
    for (const b of state.bubbles.slice()) {
      const dx = b.x - d.x;
      const dy = b.y - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= b.r + d.radius * 0.6) {
        handleBubbleCatch(b);
      }
    }

    // feedback flash
    if (state.feedbackFlash.t > 0) {
      if (nowMs() - state.feedbackFlash.t > 420) state.feedbackFlash.t = 0;
    }

    // particles physics update (positions handled in drawParticles)
    // prune old particles occasionally
    if (state.particles.length > 150) state.particles.splice(0, state.particles.length - 150);
  }

  function draw() {
    clearCanvas();

    if (state.feedbackFlash.t > 0) {
      ctx.fillStyle = state.feedbackFlash.color;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // draw bubbles behind drone for depth
    drawBubbles(state.bubbles);

    // draw drone
    drawDrone(state.drone, nowMs());

    // draw particles on top
    drawParticles();

    // UI overlays
    drawUI();

    // end screens
    if (state.mode === "win") drawEndScreen(true);
    else if (state.mode === "gameover") drawEndScreen(false);
  }

  // End screen keeps original messages but improved visuals
  function drawEndScreen(win) {
    ctx.fillStyle = "rgba(6,10,18,0.42)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const title = win ? "You Win! Drone delivered the packages!" : "Game Over. Drone needs a recharge.";
    const subtitle = win
      ? `You answered ${state.correctCount} questions correctly!`
      : `You made ${state.wrongCount} wrong answers.`;
    const titleFont = `${IMPORTANT_FONT + 6}px system-ui, sans-serif`;
    const subFont = `${MIN_BODY_FONT + 2}px system-ui, sans-serif`;

    ctx.font = titleFont;
    ctx.fillStyle = win ? "#c7ffd4" : "#ffd6d6";
    const tm = ctx.measureText(title);
    const tw = Math.ceil(tm.width);
    ctx.font = subFont;
    const sm = ctx.measureText(subtitle);
    const sw = Math.ceil(sm.width);
    const panelW = Math.max(tw, sw) + PADDING * 6;
    const panelH = 140;
    const px = WIDTH / 2 - panelW / 2;
    const py = HEIGHT / 2 - panelH / 2 - 40;

    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundFillRect(px, py, panelW, panelH, 12);
    ctx.strokeStyle = "rgba(40,80,100,0.06)";
    ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

    ctx.font = titleFont;
    ctx.fillStyle = win ? "#0a6a2f" : "#8a1d2b";
    ctx.fillText(title, px + PADDING * 3, py + PADDING * 2);

    ctx.font = subFont;
    ctx.fillStyle = "#123541";
    ctx.fillText(subtitle, px + PADDING * 3, py + PADDING * 2 + 40);

    // small celebratory/ash graphic
    if (win) {
      // simple ribbon
      ctx.fillStyle = "#ffd66b";
      ctx.beginPath();
      ctx.moveTo(px + panelW - 70, py + 18);
      ctx.lineTo(px + panelW - 28, py + 40);
      ctx.lineTo(px + panelW - 70, py + 62);
      ctx.closePath();
      ctx.fill();
    } else {
      // small battery drained icon
      ctx.fillStyle = "#ff9b9b";
      ctx.fillRect(px + panelW - 74, py + 24, 36, 28);
    }

    // restart button
    const btn = restartButtonRect();
    ctx.fillStyle = "#64b5f6";
    roundFillRect(btn.x, btn.y, btn.w, btn.h, 8);
    ctx.strokeStyle = "#2b6a9a";
    ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1);
    ctx.fillStyle = "#012";
    ctx.font = btn.font;
    ctx.fillText(btn.text, btn.x + PADDING, btn.y + PADDING);

    // Enter instruction
    ctx.font = `${MIN_BODY_FONT}px system-ui, sans-serif`;
    ctx.fillStyle = "#fff";
    const msg = "Press Enter or click Restart to play again";
    const mm = ctx.measureText(msg);
    ctx.fillText(msg, WIDTH / 2 - mm.width / 2, btn.y + btn.h + 28);
  }

  // -------------------------
  // Loading/start screen (improved)
  // -------------------------
  function drawLoadingScreen() {
    clearCanvas();
    ctx.fillStyle = "#0b3d2e";
    const title = "Drone Math Catcher";
    const fontTitle = "30px system-ui, sans-serif";
    ctx.font = fontTitle;
    const tmetrics = ctx.measureText(title);
    ctx.fillText(title, WIDTH / 2 - tmetrics.width / 2, HEIGHT / 2 - 88);

    // larger drawn drone
    drawDrone({ x: WIDTH / 2, y: HEIGHT / 2 - 10, radius: 38 }, nowMs());

    const lines = [
      "Catch the bubble with the correct answer to the question.",
      `Get ${TARGET_CORRECT} correct answers to win. ${MAX_WRONG} wrongs and it's game over.`,
      "Click to begin. Press M to mute/unmute sound anytime.",
    ];
    ctx.font = `${MIN_BODY_FONT}px system-ui, sans-serif`;
    ctx.fillStyle = "#08323a";
    for (let i = 0; i < lines.length; i++) {
      const m = ctx.measureText(lines[i]);
      ctx.fillText(lines[i], WIDTH / 2 - m.width / 2, HEIGHT / 2 + 60 + i * 22);
    }

    const btnText = "Start Game";
    const btnFont = `${IMPORTANT_FONT}px system-ui, sans-serif`;
    ctx.font = btnFont;
    const bm = ctx.measureText(btnText);
    const bw = Math.ceil(bm.width) + PADDING * 2;
    const bh = IMPORTANT_FONT + PADDING * 2;
    const bx = WIDTH / 2 - bw / 2;
    const by = HEIGHT / 2 + 120;
    ctx.fillStyle = "#fdd835";
    roundFillRect(bx, by, bw, bh, 8);
    ctx.strokeStyle = "#b58a06";
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = "#012";
    ctx.fillText(btnText, bx + PADDING, by + PADDING);

    canvas.addEventListener(
      "click",
      function onStartClick(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        // start on any click for convenience
        canvas.removeEventListener("click", onStartClick);
        startNewGame();
      },
      { once: true }
    );
  }

  // -------------------------
  // Utility polyfill for roundRect if missing
  // -------------------------
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // Kick off
  state.mode = "loading";
  drawLoadingScreen();

  console.info("Drone Math Catcher ready. Click to start and allow audio if you want sound.");
})();