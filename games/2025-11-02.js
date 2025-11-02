(function () {
  // Drone Math Dash - Enhanced visuals & audio
  // All visuals drawn with Canvas API. All audio via Web Audio API (oscillators/filters).
  // Renders into container with ID "game-of-the-day-stage".
  // Does NOT change game mechanics or math logic.

  // Configuration constants
  const CANVAS_WIDTH = 720;
  const CANVAS_HEIGHT = 480;
  const UI_PADDING = 12;
  const TARGET_CORRECT = 10;
  const MAX_WRONG = 3;
  const MIN_BODY_FONT = 14;
  const IMPORTANT_FONT = 20;

  // Safely get container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container element with ID 'game-of-the-day-stage' not found.");
    return;
  }

  // Clear container and create canvas
  container.innerHTML = "";
  container.style.position = "relative";
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Drone Math Dash game canvas");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Audio context with safety handling
  let audioEnabled = true;
  let audioContext = null;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Web Audio API not supported.");
    audioContext = new AudioContext();
  } catch (err) {
    console.warn("Could not create AudioContext:", err);
    audioEnabled = false;
    audioContext = null;
  }

  // Audio graph components
  let ambientGain = null;
  let ambientNodes = null;

  // Particle system for visual feedback (stars, sparks)
  function createParticle(x, y, color, size, vx, vy, life) {
    return { x, y, color, size, vx, vy, life, maxLife: life, alpha: 1 };
  }

  // Game state
  const state = {
    running: false,
    correctCount: 0,
    wrongCount: 0,
    lives: MAX_WRONG,
    goal: TARGET_CORRECT,
    question: null,
    answers: [],
    selectedIndex: 0,
    message: "Welcome! Press Start to play.",
    phase: "menu", // 'menu', 'playing', 'victory', 'gameover'
    lastActionTime: 0,
    drone: {
      x: 120,
      y: 160,
      angle: 0,
      bob: 0,
      targetX: 360,
      targetY: 200,
      speed: 80,
      collected: 0
    },
    clouds: [],
    mountains: [],
    particles: [],
    soundOn: audioEnabled,
    keyboardBuffer: null,
    buttonHoverIndex: -1,
    recentCorrectPulse: 0,
    shake: { x: 0, y: 0, duration: 0 },
    sun: { x: 560, y: 80, r: 42, glow: 0 }
  };

  // Initialize ambient audio (soft pad + slow pulsing)
  function initAmbientAudio() {
    if (!audioEnabled || !audioContext) return;
    try {
      ambientGain = audioContext.createGain();
      ambientGain.gain.value = state.soundOn ? 0.03 : 0;
      ambientGain.connect(audioContext.destination);

      // Two oscillators for gentle pad, detuned + lowpass filter
      const oscA = audioContext.createOscillator();
      const oscB = audioContext.createOscillator();
      const gainA = audioContext.createGain();
      const gainB = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      oscA.type = "sine";
      oscB.type = "sine";
      oscA.frequency.value = 110;
      oscB.frequency.value = 88;
      gainA.gain.value = 0.02;
      gainB.gain.value = 0.018;

      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.8;

      oscA.connect(gainA);
      oscB.connect(gainB);

      gainA.connect(filter);
      gainB.connect(filter);
      filter.connect(ambientGain);

      oscA.start();
      oscB.start();

      // LFO for slow movement on filter frequency
      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = 200;

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      ambientNodes = { oscA, oscB, gainA, gainB, filter, lfo, lfoGain };
      audioContext._ambientNodes = ambientNodes;
    } catch (e) {
      console.warn("Ambient audio init failed:", e);
    }
  }

  if (audioEnabled && audioContext) {
    initAmbientAudio();
  }

  // Play a generic tone with envelope
  function playTone(freq = 440, type = "sine", duration = 0.2, volume = 0.12) {
    if (!audioEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(5500, now);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (e) {
      console.warn("playTone error:", e);
    }
  }

  function playCorrectSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      // Pleasant rising arpeggio with gentle filter
      playTone(880, "sine", 0.12, 0.06);
      setTimeout(() => playTone(1180, "sine", 0.11, 0.055), 110);
      setTimeout(() => playTone(1560, "sine", 0.14, 0.05), 230);
      // small bell tail
      setTimeout(() => playTone(2200, "triangle", 0.18, 0.03), 340);
    } catch (e) {
      console.warn("correct sound error:", e);
    }
  }

  function playWrongSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      // Soft low buzz then small descending thud
      playTone(220, "square", 0.14, 0.12);
      setTimeout(() => playTone(160, "sawtooth", 0.12, 0.09), 110);
    } catch (e) {
      console.warn("wrong sound error:", e);
    }
  }

  function playSelectSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      playTone(540, "sine", 0.09, 0.06);
    } catch (e) {
      console.warn("select sound error:", e);
    }
  }

  // Clouds and mountains init
  function initClouds() {
    state.clouds = [];
    for (let i = 0; i < 7; i++) {
      state.clouds.push({
        x: Math.random() * CANVAS_WIDTH,
        y: 20 + Math.random() * 140,
        size: 60 + Math.random() * 140,
        speed: 6 + Math.random() * 18,
        offset: Math.random() * 2000
      });
    }
  }

  function initMountains() {
    state.mountains = [];
    // Create layered mountains for parallax
    const layers = 3;
    for (let l = 0; l < layers; l++) {
      const depth = l + 1;
      const color = ["#D6EFD6", "#C1E3C1", "#B3DAC1"][l] || "#CFEFD0";
      const speed = 6 / (depth + 0.5);
      const peaks = [];
      let x = -40;
      while (x < CANVAS_WIDTH + 100) {
        const peakHeight = 80 + Math.random() * (120 - l * 20);
        const width = 80 + Math.random() * 160;
        peaks.push({ x, peakHeight, width });
        x += width * 0.9;
      }
      state.mountains.push({ color, speed, peaks, offset: Math.random() * 500 });
    }
  }

  initClouds();
  initMountains();

  // Math question generator (unchanged logic)
  function generateQuestion() {
    const a = Math.floor(Math.random() * 11) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const op = Math.random() < 0.7 ? "+" : "-";
    let q, answer;
    if (op === "+") {
      q = `${a} + ${b}`;
      answer = a + b;
    } else {
      const big = Math.max(a, b);
      const small = Math.min(a, b);
      q = `${big} - ${small}`;
      answer = big - small;
    }
    const answers = new Set();
    answers.add(answer);
    while (answers.size < 4) {
      const perturb = Math.floor((Math.random() * 9) - 4);
      const candidate = answer + perturb;
      if (candidate >= 0 && !answers.has(candidate)) answers.add(candidate);
    }
    const arr = Array.from(answers);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return { q, answer, choices: arr };
  }

  // Start or restart game (keeps mechanics)
  function startGame() {
    state.running = true;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.lives = MAX_WRONG;
    state.phase = "playing";
    state.selectedIndex = 0;
    state.drone = {
      x: 120,
      y: 160,
      angle: 0,
      bob: 0,
      targetX: 360 + Math.random() * 200 - 100,
      targetY: 140 + Math.random() * 60,
      speed: 120,
      collected: 0
    };
    initClouds();
    initMountains();
    state.particles.length = 0;
    nextQuestion();
    if (audioContext && audioContext.state === "suspended" && state.soundOn) {
      audioContext.resume().catch(() => {});
    }
  }

  function nextQuestion() {
    const generated = generateQuestion();
    state.question = generated.q;
    state.answers = generated.choices;
    state.correctAnswer = generated.answer;
    state.selectedIndex = 0;
    state.message = "Choose the correct answer!";
    state.drone.targetX = 220 + Math.random() * 280;
    state.drone.targetY = 100 + Math.random() * 160;
  }

  // Answer button positions
  function getAnswerButtonRects() {
    const btns = [];
    const radius = 44;
    const cxLeft = CANVAS_WIDTH * 0.28;
    const cxRight = CANVAS_WIDTH * 0.72;
    const cyTop = CANVAS_HEIGHT * 0.55;
    const cyGap = 98;
    btns.push({ x: cxLeft, y: cyTop, r: radius });
    btns.push({ x: cxRight, y: cyTop, r: radius });
    btns.push({ x: cxLeft, y: cyTop + cyGap, r: radius });
    btns.push({ x: cxRight, y: cyTop + cyGap, r: radius });
    return btns;
  }

  // Pointer to canvas coordinates (support touch)
  function pointerToCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x: x * (canvas.width / rect.width), y: y * (canvas.height / rect.height) };
  }

  function handleClick(e) {
    if (state.phase === "menu") {
      const pos = pointerToCanvas(e);
      if (isInsideStartButton(pos)) {
        startGame();
      }
      return;
    }
    const pos = pointerToCanvas(e);
    if (state.phase === "playing") {
      const rects = getAnswerButtonRects();
      for (let i = 0; i < rects.length; i++) {
        const dx = pos.x - rects[i].x;
        const dy = pos.y - rects[i].y;
        if (dx * dx + dy * dy <= rects[i].r * rects[i].r) {
          // Visual feedback for click
          state.selectedIndex = i;
          if (state.soundOn) playSelectSound();
          selectAnswer(i, true);
          return;
        }
      }
    } else if (state.phase === "victory" || state.phase === "gameover") {
      if (isInsideRestartButton(pos)) {
        startGame();
      }
    }
  }

  function isInsideStartButton(pos) {
    const w = 220;
    const h = 56;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = CANVAS_HEIGHT * 0.62;
    return pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h;
  }

  function isInsideRestartButton(pos) {
    const w = 220;
    const h = 56;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = CANVAS_HEIGHT * 0.66;
    return pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h;
  }

  function selectAnswer(index, submitImmediately = false) {
    state.selectedIndex = index;
    if (state.soundOn) playSelectSound();
    if (submitImmediately) {
      submitAnswer();
    }
  }

  function spawnCorrectParticles(x, y) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const p = createParticle(x, y, "#FFD166", 3 + Math.random() * 4, vx, vy, 700 + Math.random() * 400);
      state.particles.push(p);
    }
    // small star trail to UI stars
    for (let i = 0; i < 5; i++) {
      const p = createParticle(x, y, "#FFF1A8", 2 + Math.random() * 2, -40 - Math.random() * 60, -30 - Math.random() * 30, 900 + Math.random() * 400);
      state.particles.push(p);
    }
  }

  function spawnWrongParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const p = createParticle(x, y, "#FF6B6B", 3 + Math.random() * 3, vx, vy, 500 + Math.random() * 300);
      state.particles.push(p);
    }
  }

  function submitAnswer() {
    const chosen = state.answers[state.selectedIndex];
    if (chosen === undefined) return;
    if (chosen === state.correctAnswer) {
      state.correctCount += 1;
      state.drone.collected += 1;
      state.message = "Great! +1";
      state.recentCorrectPulse = 600;
      if (state.soundOn) playCorrectSound();
      // spawn particles at drone location
      spawnCorrectParticles(state.drone.x, state.drone.y);
      if (state.correctCount >= state.goal) {
        state.phase = "victory";
        state.running = false;
        state.message = "You reached the goal!";
      } else {
        setTimeout(() => {
          nextQuestion();
        }, 550);
      }
    } else {
      state.wrongCount += 1;
      state.lives = Math.max(0, MAX_WRONG - state.wrongCount);
      state.message = "Oops! That's not right.";
      if (state.soundOn) playWrongSound();
      spawnWrongParticles(state.drone.x, state.drone.y);
      // small shake for wrong answer
      state.shake.duration = 240;
      state.shake.x = (Math.random() - 0.5) * 8;
      state.shake.y = (Math.random() - 0.5) * 6;
      state.drone.targetX = 80 + Math.random() * 560;
      state.drone.targetY = 100 + Math.random() * 180;
      if (state.wrongCount >= MAX_WRONG) {
        state.phase = "gameover";
        state.running = false;
      } else {
        setTimeout(() => {
          nextQuestion();
        }, 600);
      }
    }
  }

  // Keyboard handling
  function handleKeyDown(e) {
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      state.soundOn = !state.soundOn;
      if (ambientGain) ambientGain.gain.value = state.soundOn ? 0.03 : 0;
      return;
    }
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      startGame();
      return;
    }
    if (state.phase === "menu") {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startGame();
      }
      return;
    }
    if (state.phase === "victory" || state.phase === "gameover") {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startGame();
      }
      return;
    }
    if (state.phase === "playing") {
      if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        e.preventDefault();
        selectAnswer(idx, true);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        state.selectedIndex = (state.selectedIndex + 4 - 1) % 4;
        if (state.soundOn) playSelectSound();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        state.selectedIndex = (state.selectedIndex + 1) % 4;
        if (state.soundOn) playSelectSound();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        submitAnswer();
      }
    }
  }

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
  }

  function wrapText(text, maxWidth, font) {
    ctx.font = font;
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (let w of words) {
      const test = current ? current + " " + w : w;
      const metrics = ctx.measureText(test);
      if (metrics.width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // Enhanced drone drawing with subtle glow and shadow
  function drawDrone(x, y, bob, angle) {
    ctx.save();
    ctx.translate(x, y + Math.sin(bob) * 6);
    ctx.rotate(angle);

    // soft halo when recent correct
    if (state.recentCorrectPulse > 0) {
      const p = Math.max(0.2, state.recentCorrectPulse / 600);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,209,102,${0.18 * p})`;
      ctx.ellipse(0, 34, 78 * p, 18 * p, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // shadow
    ctx.fillStyle = "rgba(10,20,30,0.08)";
    ctx.beginPath();
    ctx.ellipse(0, 40, 60, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // body gradient
    const g = ctx.createLinearGradient(-70, -20, 70, 30);
    g.addColorStop(0, "#8ED1FF");
    g.addColorStop(0.6, "#A7D3FF");
    g.addColorStop(1, "#E8F7FF");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 72, 36, 0, 0, Math.PI * 2);
    ctx.fill();

    // goggles with reflective shine
    const g2 = ctx.createLinearGradient(-28, -12, 28, 12);
    g2.addColorStop(0, "#223249");
    g2.addColorStop(0.4, "#2C3E50");
    g2.addColorStop(1, "#3A5567");
    ctx.fillStyle = g2;
    roundRect(ctx, -34, -14, 68, 28, 8, true, false);

    ctx.fillStyle = "#DDF7FF";
    roundRect(ctx, -28, -10, 56, 18, 6, true, false);

    // expressive eye pupil
    ctx.fillStyle = "#0B2B3F";
    ctx.beginPath();
    ctx.ellipse(2, -2, 6, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // arms and props (animated)
    const armColor = "#FFBC99";
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const ax = Math.cos(a) * 52;
      const ay = Math.sin(a) * 18;
      ctx.strokeStyle = armColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 10);
      ctx.lineTo(ax, ay - 8);
      ctx.stroke();

      // prop disc with subtle rotation (using bob)
      ctx.save();
      ctx.translate(ax, ay - 16);
      ctx.rotate(Math.sin(bob + i * 0.6));
      ctx.fillStyle = "#FFF0D9";
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(-12, -2, 24, 4);
      ctx.restore();
    }

    // smile accent
    ctx.strokeStyle = "#F97B75";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 14, 8, 0.1, Math.PI - 0.1);
    ctx.stroke();

    ctx.restore();
  }

  // helper for rounded rectangle drawing with stroke/fill
  function roundRect(ctxRef, x, y, w, h, r, fill, stroke) {
    const c = ctxRef;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    if (fill) c.fill();
    if (stroke) c.stroke();
  }

  // cloud drawing (soft edges)
  function drawCloud(c) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.size * 0.6, c.size * 0.34, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.size * 0.28, c.y - c.size * 0.08, c.size * 0.45, c.size * 0.25, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - c.size * 0.22, c.y - c.size * 0.08, c.size * 0.45, c.size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw mountains
  function drawMountains() {
    for (let i = 0; i < state.mountains.length; i++) {
      const layer = state.mountains[i];
      ctx.save();
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = 0.95 - i * 0.12;
      ctx.beginPath();
      ctx.moveTo(-40, CANVAS_HEIGHT);
      for (const p of layer.peaks) {
        const x = p.x + (Date.now() / 1000) * layer.speed * 0.3;
        const px = (x % (CANVAS_WIDTH + 200)) - 100;
        ctx.lineTo(px + p.width * 0.5, CANVAS_HEIGHT - p.peakHeight);
        ctx.quadraticCurveTo(px + p.width * 0.2, CANVAS_HEIGHT - p.peakHeight + 6, px + p.width, CANVAS_HEIGHT);
      }
      ctx.lineTo(CANVAS_WIDTH + 40, CANVAS_HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Update logic (movement, particles, animation)
  let lastTimestamp = 0;
  function update(dt) {
    // update clouds
    for (let c of state.clouds) {
      c.x += (c.speed * dt) / 1000;
      c.offset += dt;
      if (c.x - c.size * 0.8 > CANVAS_WIDTH) {
        c.x = -c.size * 0.8;
        c.y = 10 + Math.random() * 140;
      }
    }

    // update drone movement
    if (state.phase === "playing") {
      const d = state.drone;
      const dx = d.targetX - d.x;
      const dy = d.targetY - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        const step = (d.speed * dt) / 1000;
        d.x += (dx / dist) * Math.min(step, dist);
        d.y += (dy / dist) * Math.min(step, dist);
      }
      d.bob += dt / 250;
      d.angle = Math.sin(d.bob) * 0.06;
    } else {
      state.drone.bob += dt / 500;
      state.drone.angle = Math.sin(state.drone.bob) * 0.03;
    }

    // update particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0 || p.size <= 0.2) {
        state.particles.splice(i, 1);
        continue;
      }
      // apply movement with mild drag and gravity
      p.vx *= 0.995;
      p.vy += 0.06 * (dt / 16);
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      p.alpha = Math.max(0, p.life / p.maxLife);
      p.size *= 0.999;
    }

    // shake decay
    if (state.shake.duration > 0) {
      state.shake.duration -= dt;
      if (state.shake.duration <= 0) {
        state.shake.x = 0;
        state.shake.y = 0;
      }
    }

    // recent correct pulse decay
    if (state.recentCorrectPulse > 0) {
      state.recentCorrectPulse -= dt;
    }
  }

  // Main draw function
  function draw() {
    // clear
    ctx.save();
    // global canvas clear
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // background gradient with subtle diagonal light
    const bg = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    bg.addColorStop(0, "#CFF5FF");
    bg.addColorStop(0.6, "#EAFDF1");
    bg.addColorStop(1, "#FFFDF8");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // sun glow
    const sun = state.sun;
    sun.glow = 0.6 + 0.4 * Math.sin(Date.now() / 1200);
    const sunG = ctx.createRadialGradient(sun.x, sun.y, 8, sun.x, sun.y, 120);
    sunG.addColorStop(0, `rgba(255,220,120,${0.85 * sun.glow})`);
    sunG.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = sunG;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // mountains
    drawMountains();

    // clouds
    for (let c of state.clouds) drawCloud(c);

    // ground hills foreground
    ctx.save();
    const groundG = ctx.createLinearGradient(0, CANVAS_HEIGHT - 180, 0, CANVAS_HEIGHT);
    groundG.addColorStop(0, "#E4F6E6");
    groundG.addColorStop(1, "#D6F2D6");
    ctx.fillStyle = groundG;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);
    ctx.quadraticCurveTo(120, 360, 240, 400);
    ctx.quadraticCurveTo(420, 460, 720, 380);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Top-left score UI
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const scoreText = `Stars: ${state.correctCount}/${state.goal}`;
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreW = scoreMetrics.width + UI_PADDING * 2 + 30;
    const scoreH = 36;
    const scoreX = UI_PADDING;
    const scoreY = UI_PADDING;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    drawRoundedRect(scoreX, scoreY, scoreW, scoreH, 10);
    // little star icon
    ctx.fillStyle = "#FFD166";
    ctx.beginPath();
    const sx = scoreX + 10;
    const sy = scoreY + scoreH / 2 - 6;
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#073B4C";
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    ctx.fillText(scoreText, scoreX + 28, scoreY + scoreH / 2 + 5);

    // Lives UI top-right
    const livesText = `Lives: ${Math.max(0, state.lives)}`;
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const livesMetrics = ctx.measureText(livesText);
    const livesW = livesMetrics.width + UI_PADDING * 2 + 40;
    const livesH = 36;
    const livesX = CANVAS_WIDTH - livesW - UI_PADDING;
    const livesY = UI_PADDING;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    drawRoundedRect(livesX, livesY, livesW, livesH, 10);
    ctx.fillStyle = "#073B4C";
    ctx.fillText(livesText, livesX + UI_PADDING, livesY + livesH / 2 + 5);

    // sound icon to right
    ctx.fillStyle = state.soundOn ? "#4CAF50" : "#D32F2F";
    ctx.beginPath();
    const spX = livesX + livesW - UI_PADDING - 18;
    const spY = livesY + livesH / 2 - 8;
    ctx.moveTo(spX, spY + 6);
    ctx.lineTo(spX + 7, spY + 6);
    ctx.lineTo(spX + 14, spY - 2);
    ctx.lineTo(spX + 14, spY + 14);
    ctx.lineTo(spX + 7, spY + 6);
    ctx.fill();

    // question box centered top
    ctx.font = `${IMPORTANT_FONT}px sans-serif`;
    const questionText = state.phase === "playing" ? state.question : "Drone Math Dash";
    const qMetrics = ctx.measureText(questionText);
    const qW = Math.min(CANVAS_WIDTH * 0.7, qMetrics.width + UI_PADDING * 2 + 20);
    const qH = 48;
    const qX = (CANVAS_WIDTH - qW) / 2;
    // ensure spacing from top UIs
    const topOccupiedY = Math.max(scoreY + scoreH, livesY + livesH);
    const qY = Math.max(UI_PADDING + 8, topOccupiedY + UI_PADDING);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    drawRoundedRect(qX, qY, qW, qH, 10);
    ctx.fillStyle = "#073B4C";
    ctx.font = `${IMPORTANT_FONT}px sans-serif`;
    ctx.fillText(questionText, qX + UI_PADDING + 4, qY + qH / 2 + 6);

    // drone drawing with possible canvas shake
    if (state.shake.duration > 0) {
      ctx.translate(state.shake.x, state.shake.y);
    }
    drawDrone(state.drone.x, state.drone.y, state.drone.bob, state.drone.angle);
    if (state.shake.duration > 0) ctx.translate(-state.shake.x, -state.shake.y);

    // draw collected stars along bottom-left
    for (let i = 0; i < state.drone.collected; i++) {
      ctx.save();
      const sx2 = 18 + i * 22;
      const sy2 = CANVAS_HEIGHT - 14;
      ctx.fillStyle = "#FFD166";
      ctx.beginPath();
      ctx.arc(sx2, sy2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.stroke();
      ctx.restore();
    }

    // Answer buttons - with subtle shadows and pulsing selected
    const rects = getAnswerButtonRects();
    ctx.font = `${MIN_BODY_FONT + 2}px sans-serif`;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      // compute hover pulse
      const isSelected = i === state.selectedIndex;
      const hoverPulse = isSelected ? 1 + 0.03 * Math.sin(Date.now() / 160) : 1;
      ctx.save();
      ctx.beginPath();
      const bg = isSelected ? "rgba(152,231,255,0.98)" : "rgba(255,255,255,0.98)";
      ctx.fillStyle = bg;
      ctx.shadowColor = "rgba(4,22,32,0.08)";
      ctx.shadowBlur = 10;
      ctx.arc(r.x, r.y, r.r * hoverPulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // number label
      ctx.fillStyle = "#0A3D62";
      ctx.font = `${MIN_BODY_FONT}px sans-serif`;
      const label = `${i + 1}.`;
      ctx.fillText(label, r.x - r.r + 12, r.y - r.r + 22);
      // answer text centered
      const ansText = state.answers[i] !== undefined ? String(state.answers[i]) : "";
      ctx.font = `${IMPORTANT_FONT - 2}px sans-serif`;
      const metrics = ctx.measureText(ansText);
      ctx.fillText(ansText, r.x - metrics.width / 2, r.y + 8);
      // focus ring
      if (isSelected) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#1098F7";
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // draw particles
    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.05, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.8 + 0.4 * Math.sin((p.life / p.maxLife) * Math.PI)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Instruction area bottom center
    const instructions = [
      "Controls: Click answers or use keys 1-4, Arrow keys to move, Enter to submit.",
      "M to toggle sound. R to restart.",
      state.message
    ];
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const maxInstrW = CANVAS_WIDTH * 0.88;
    const lines = [];
    for (let line of instructions) {
      const wrapped = wrapText(line, maxInstrW, `${MIN_BODY_FONT}px sans-serif`);
      wrapped.forEach((l) => lines.push(l));
    }
    const lineHeight = 18;
    const instrH = lines.length * lineHeight + UI_PADDING * 2;
    const instrW = Math.min(maxInstrW, 640);
    const instrX = (CANVAS_WIDTH - instrW) / 2;
    const instrY = CANVAS_HEIGHT - instrH - UI_PADDING;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    drawRoundedRect(instrX, instrY, instrW, instrH, 10);
    ctx.fillStyle = "#083D77";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], instrX + UI_PADDING, instrY + UI_PADDING + (i + 1) * lineHeight - 6);
    }

    // Overlay screens
    if (state.phase === "menu") drawMenu();
    else if (state.phase === "victory") drawVictory();
    else if (state.phase === "gameover") drawGameOver();

    ctx.restore();
  }

  // Menu screen with improved visuals
  function drawMenu() {
    ctx.save();
    ctx.fillStyle = "rgba(6, 30, 50, 0.18)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const title = "Drone Math Dash";
    ctx.font = `34px sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    const tm = ctx.measureText(title);
    const titleX = (CANVAS_WIDTH - tm.width) / 2;
    const titleY = CANVAS_HEIGHT * 0.26;
    // title box
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    const boxW = tm.width + UI_PADDING * 3;
    const boxH = 62;
    const boxX = titleX - UI_PADDING;
    const boxY = titleY - 40;
    drawRoundedRect(boxX, boxY, boxW, boxH, 12);
    ctx.fillStyle = "#06304A";
    ctx.fillText(title, titleX, titleY);

    // description
    ctx.font = `${MIN_BODY_FONT + 2}px sans-serif`;
    const desc = "Help the friendly drone gather " + state.goal + " stars by solving fun math problems. You can make up to " + MAX_WRONG + " mistakes.";
    const lines = wrapText(desc, CANVAS_WIDTH * 0.78, `${MIN_BODY_FONT + 2}px sans-serif`);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    const descW = CANVAS_WIDTH * 0.74;
    const descH = lines.length * 18 + UI_PADDING * 2;
    const descX = (CANVAS_WIDTH - descW) / 2;
    const descY = titleY + 12;
    drawRoundedRect(descX, descY, descW, descH, 10);
    ctx.fillStyle = "#083D77";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], descX + UI_PADDING, descY + UI_PADDING + (i + 1) * 18 - 6);
    }

    // Start button
    const w = 220;
    const h = 56;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = CANVAS_HEIGHT * 0.62;
    ctx.fillStyle = "#7EECD7";
    drawRoundedRect(x, y, w, h, 12);
    ctx.fillStyle = "#052A3B";
    ctx.font = `22px sans-serif`;
    const startText = "Start Adventure";
    const m = ctx.measureText(startText);
    ctx.fillText(startText, x + (w - m.width) / 2, y + h / 2 + 8);

    // tip
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const note = "Tip: Press Enter to start. Use keys 1-4 to pick answers.";
    ctx.fillStyle = "#FFFFFF";
    const nm = ctx.measureText(note);
    ctx.fillText(note, (CANVAS_WIDTH - nm.width) / 2, y + h + 36);

    ctx.restore();
  }

  function drawVictory() {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const title = "You Win!";
    ctx.font = `36px sans-serif`;
    ctx.fillStyle = "#FFF6C6";
    const m = ctx.measureText(title);
    const x = (CANVAS_WIDTH - m.width) / 2;
    const y = CANVAS_HEIGHT * 0.26;
    ctx.fillText(title, x, y);

    ctx.font = `${MIN_BODY_FONT + 2}px sans-serif`;
    const lines = wrapText(`Hooray! The drone collected ${state.correctCount} stars. Great job solving the problems!`, CANVAS_WIDTH * 0.78, `${MIN_BODY_FONT + 2}px sans-serif`);
    const boxW = CANVAS_WIDTH * 0.78;
    const boxH = lines.length * 18 + UI_PADDING * 2;
    const boxX = (CANVAS_WIDTH - boxW) / 2;
    const boxY = y + 14;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    drawRoundedRect(boxX, boxY, boxW, boxH, 12);
    ctx.fillStyle = "#073B4C";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], boxX + UI_PADDING, boxY + UI_PADDING + (i + 1) * 18 - 6);
    }

    // Restart button
    const bw = 220;
    const bh = 56;
    const bx = (CANVAS_WIDTH - bw) / 2;
    const by = boxY + boxH + 28;
    ctx.fillStyle = "#CFFFEA";
    drawRoundedRect(bx, by, bw, bh, 10);
    ctx.fillStyle = "#05386B";
    ctx.font = `20px sans-serif`;
    const bt = "Play Again";
    const bm = ctx.measureText(bt);
    ctx.fillText(bt, bx + (bw - bm.width) / 2, by + bh / 2 + 8);

    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const note = "Press 'R' or Enter to play again.";
    const nm = ctx.measureText(note);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(note, (CANVAS_WIDTH - nm.width) / 2, by + bh + 30);

    ctx.restore();
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.46)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const title = "Game Over";
    ctx.font = `36px sans-serif`;
    ctx.fillStyle = "#FFD6D6";
    const m = ctx.measureText(title);
    const x = (CANVAS_WIDTH - m.width) / 2;
    const y = CANVAS_HEIGHT * 0.26;
    ctx.fillText(title, x, y);

    ctx.font = `${MIN_BODY_FONT + 2}px sans-serif`;
    const lines = wrapText(`Oh no! The drone ran out of lives. You answered ${state.correctCount} correctly. Try again to reach ${state.goal}!`, CANVAS_WIDTH * 0.78, `${MIN_BODY_FONT + 2}px sans-serif`);
    const boxW = CANVAS_WIDTH * 0.78;
    const boxH = lines.length * 18 + UI_PADDING * 2;
    const boxX = (CANVAS_WIDTH - boxW) / 2;
    const boxY = y + 14;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    drawRoundedRect(boxX, boxY, boxW, boxH, 12);
    ctx.fillStyle = "#073B4C";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], boxX + UI_PADDING, boxY + UI_PADDING + (i + 1) * 18 - 6);
    }

    // Restart button
    const bw = 220;
    const bh = 56;
    const bx = (CANVAS_WIDTH - bw) / 2;
    const by = boxY + boxH + 28;
    ctx.fillStyle = "#FFD8E5";
    drawRoundedRect(bx, by, bw, bh, 10);
    ctx.fillStyle = "#05386B";
    ctx.font = `20px sans-serif`;
    const bt = "Try Again";
    const bm = ctx.measureText(bt);
    ctx.fillText(bt, bx + (bw - bm.width) / 2, by + bh / 2 + 8);

    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    const note = "Press 'R' or Enter to try again.";
    const nm = ctx.measureText(note);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(note, (CANVAS_WIDTH - nm.width) / 2, by + bh + 30);

    ctx.restore();
  }

  // Animation loop
  function loop(ts) {
    if (!lastTimestamp) lastTimestamp = ts;
    const dt = ts - lastTimestamp;
    lastTimestamp = ts;

    try {
      update(dt);
      draw();
    } catch (e) {
      console.error("Render error:", e);
    }

    requestAnimationFrame(loop);
  }

  // Mouse move for hover selection visual
  canvas.addEventListener("mousemove", function (e) {
    const pos = pointerToCanvas(e);
    const rects = getAnswerButtonRects();
    let hover = -1;
    for (let i = 0; i < rects.length; i++) {
      const dx = pos.x - rects[i].x;
      const dy = pos.y - rects[i].y;
      if (dx * dx + dy * dy <= rects[i].r * rects[i].r) {
        hover = i;
        break;
      }
    }
    if (hover !== state.buttonHoverIndex) {
      state.buttonHoverIndex = hover;
      if (hover >= 0 && state.soundOn) playSelectSound();
    }
  });

  canvas.addEventListener("click", handleClick);
  canvas.addEventListener(
    "touchstart",
    function (e) {
      handleClick(e);
      e.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener("keydown", handleKeyDown);

  // initial menu
  state.phase = "menu";
  state.running = false;
  state.message = "Press Start or Enter to begin!";

  // Kick off loop
  requestAnimationFrame(loop);

  // Expose restart on container
  container.restartGame = () => {
    startGame();
  };

  // Clean up audio nodes on unload
  window.addEventListener("beforeunload", () => {
    try {
      if (audioContext) {
        if (audioContext._ambientNodes) {
          try {
            audioContext._ambientNodes.oscA && audioContext._ambientNodes.oscA.disconnect();
            audioContext._ambientNodes.oscB && audioContext._ambientNodes.oscB.disconnect();
            audioContext._ambientNodes.lfo && audioContext._ambientNodes.lfo.disconnect();
            audioContext._ambientNodes.filter && audioContext._ambientNodes.filter.disconnect();
            audioContext._ambientNodes.gainA && audioContext._ambientNodes.gainA.disconnect();
            audioContext._ambientNodes.gainB && audioContext._ambientNodes.gainB.disconnect();
          } catch (e) {
            // ignore per-node errors
          }
        }
        audioContext.close && audioContext.close();
      }
    } catch (e) {
      // ignore
    }
  });
})();