(function () {
  "use strict";

  // Game constants (unchanged mechanics)
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL_CORRECT = 10; // win condition
  const MAX_WRONG = 3; // lose condition
  const DRONE_RADIUS = 28;
  const ANSWER_RADIUS = 26;
  const UI_PADDING = 10;
  const BODY_FONT = "16px Inter, system-ui, sans-serif";
  const LARGE_FONT = "22px Inter, system-ui, sans-serif";
  const TITLE_FONT = "28px Inter, system-ui, sans-serif";
  const TICK = 1000 / 60; // approx 60fps

  // Find container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("No element with id 'game-of-the-day-stage' found.");
    return;
  }

  // Clear container and set up canvas
  container.innerHTML = "";
  container.style.position = "relative";
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "Drone Math Collector game");
  canvas.style.background = "#eaf6ff";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Enhanced audio setup with proper error handling and controllable gain
  let audioEnabled = true;
  let audioContext = null;
  let audioNodes = {
    bgGain: null,
    bgOsc1: null,
    bgOsc2: null,
    bgFilter: null
  };

  function initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        audioEnabled = false;
        console.warn("Web Audio API not supported in this browser.");
        return;
      }
      audioContext = new AudioContext();

      // Create gentle layered background: low drone + slow shimmering oscillator
      const bgGain = audioContext.createGain();
      bgGain.gain.value = 0.0045; // initial quiet ambient
      const bgFilter = audioContext.createBiquadFilter();
      bgFilter.type = "lowpass";
      bgFilter.frequency.value = 900;
      bgFilter.Q.value = 0.9;

      const bgOsc1 = audioContext.createOscillator();
      bgOsc1.type = "sine";
      bgOsc1.frequency.value = 60; // deep hum

      const bgOsc2 = audioContext.createOscillator();
      bgOsc2.type = "triangle";
      bgOsc2.frequency.value = 110; // soft upper layer

      // subtle amplitude modulation (breathing)
      const lfo = audioContext.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.18; // very slow
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 0.0025;

      // routing
      bgOsc1.connect(bgFilter);
      bgOsc2.connect(bgFilter);
      bgFilter.connect(bgGain);
      bgGain.connect(audioContext.destination);

      // lfo modulates bgGain gain
      lfo.connect(lfoGain);
      lfoGain.connect(bgGain.gain);

      bgOsc1.start();
      bgOsc2.start();
      lfo.start();

      audioNodes.bgGain = bgGain;
      audioNodes.bgFilter = bgFilter;
      audioNodes.bgOsc1 = bgOsc1;
      audioNodes.bgOsc2 = bgOsc2;
      audioNodes.bgLFO = lfo;
      audioNodes.lfoGain = lfoGain;

      // Respect initial audioEnabled state; if off, silence bg immediately
      if (!audioEnabled) {
        bgGain.gain.setValueAtTime(0, audioContext.currentTime);
      }
    } catch (e) {
      audioEnabled = false;
      console.warn("Unable to initialize AudioContext:", e);
    }
  }

  try {
    initAudio();
  } catch (err) {
    console.warn("Audio initialization error:", err);
  }

  // Helper to toggle audio safely
  function setAudioEnabled(val) {
    audioEnabled = !!val;
    if (!audioContext || !audioNodes.bgGain) return;
    try {
      const t = audioContext.currentTime;
      // Ramp gain smoothly instead of suspending to avoid context issues
      audioNodes.bgGain.gain.cancelScheduledValues(t);
      if (audioEnabled) {
        audioNodes.bgGain.gain.setValueAtTime(0.0001, t);
        audioNodes.bgGain.gain.exponentialRampToValueAtTime(0.0045, t + 0.6);
      } else {
        audioNodes.bgGain.gain.setValueAtTime(audioNodes.bgGain.gain.value || 0.0045, t);
        audioNodes.bgGain.gain.exponentialRampToValueAtTime(0.00001, t + 0.4);
      }
    } catch (e) {
      console.warn("Error toggling audio:", e);
    }
  }

  // Sound play functions using WebAudio with error handling
  function playCorrectSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const t = audioContext.currentTime;
      // Layered bell/chime
      const gain = audioContext.createGain();
      gain.gain.value = 0.0001;
      const filter = audioContext.createBiquadFilter();
      filter.type = "highshelf";
      filter.frequency.value = 1200;
      filter.gain.value = 6;
      gain.connect(filter);
      filter.connect(audioContext.destination);

      // three harmonic oscillators for warm bell
      const o1 = audioContext.createOscillator();
      const o2 = audioContext.createOscillator();
      const o3 = audioContext.createOscillator();
      o1.type = "sine";
      o2.type = "triangle";
      o3.type = "sine";
      o1.frequency.setValueAtTime(880, t);
      o2.frequency.setValueAtTime(1320, t);
      o3.frequency.setValueAtTime(1760, t);

      o1.connect(gain);
      o2.connect(gain);
      o3.connect(gain);

      // envelope
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

      // gentle pitch glide on one oscillator
      o2.frequency.exponentialRampToValueAtTime(980, t + 0.5);

      o1.start(t);
      o2.start(t);
      o3.start(t);
      o1.stop(t + 1.0);
      o2.stop(t + 1.0);
      o3.stop(t + 1.0);
    } catch (e) {
      console.warn("Error playing correct sound:", e);
    }
  }

  function playWrongSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const t = audioContext.currentTime;
      const g = audioContext.createGain();
      g.gain.value = 0.0001;
      const filter = audioContext.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;
      g.connect(filter);
      filter.connect(audioContext.destination);

      const o = audioContext.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(220, t);

      o.connect(g);

      // envelope and frequency sweep down
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

      o.frequency.exponentialRampToValueAtTime(80, t + 0.5);

      o.start(t);
      o.stop(t + 0.55);
    } catch (e) {
      console.warn("Error playing wrong sound:", e);
    }
  }

  function playClickSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const t = audioContext.currentTime;
      const g = audioContext.createGain();
      g.gain.value = 0.0001;
      g.connect(audioContext.destination);
      const o = audioContext.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(1000, t);
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.start(t);
      o.stop(t + 0.13);
    } catch (e) {
      console.warn("Error playing click sound:", e);
    }
  }

  // Local state
  let keys = {};
  let mouse = { x: 0, y: 0 };
  let gameState = "menu"; // menu, playing, win, gameover
  let score = 0;
  let wrong = 0;
  let currentQuestion = null;
  let answers = [];
  let tickCount = 0;
  let drone = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, angle: 0 };
  let lastTime = performance.now();
  let soundPulse = 0;

  // Particle trail for visual flair (no gameplay impact)
  const particles = [];

  // Ensure accessible instructions visible as text (drawn on canvas),
  // but also set an offscreen aria-live for screen readers:
  const ariaLive = document.createElement("div");
  ariaLive.setAttribute("aria-live", "polite");
  ariaLive.style.position = "absolute";
  ariaLive.style.left = "-9999px";
  container.appendChild(ariaLive);

  function announce(text) {
    ariaLive.textContent = text;
  }

  // Helper: clamp
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Create a math question for ages 7-9 (simple addition/subtraction, maybe small multiplication)
  function generateQuestion(difficulty = 1) {
    // difficulty increases as score increases
    const typeRoll = Math.random();
    let a, b, correct, text;
    if (typeRoll < 0.6) {
      // addition/subtraction within small ranges
      a = Math.floor(Math.random() * (5 + difficulty * 2)) + 1;
      b = Math.floor(Math.random() * (5 + difficulty * 2)) + 1;
      if (Math.random() < 0.5) {
        correct = a + b;
        text = `${a} + ${b} = ?`;
      } else {
        // ensure non-negative
        if (a < b) [a, b] = [b, a];
        correct = a - b;
        text = `${a} - ${b} = ?`;
      }
    } else {
      // simple multiplication small
      a = Math.floor(Math.random() * (2 + difficulty)) + 1;
      b = Math.floor(Math.random() * (2 + difficulty)) + 1;
      correct = a * b;
      text = `${a} × ${b} = ?`;
    }
    return { text, correct };
  }

  // Create answer items: circles that the player collects by touching
  function spawnAnswers(question) {
    answers = [];
    const correct = question.correct;
    // generate two distractors reasonably close but not equal
    const distractors = new Set();
    while (distractors.size < 2) {
      const offset = (Math.random() < 0.5 ? -1 : 1) * (Math.floor(Math.random() * 4) + 1);
      let val = correct + offset;
      if (val < 0) val = Math.abs(val) + 1;
      if (val !== correct) distractors.add(val);
    }
    const options = [correct, ...Array.from(distractors)];
    // scramble
    options.sort(() => Math.random() - 0.5);

    // Spawn in three different non-overlapping zones (left, center, right)
    const zones = [
      { x: WIDTH * 0.2, y: HEIGHT * 0.35 },
      { x: WIDTH * 0.5, y: HEIGHT * 0.3 },
      { x: WIDTH * 0.8, y: HEIGHT * 0.4 }
    ];
    for (let i = 0; i < options.length; i++) {
      const startX = zones[i].x + (Math.random() * 80 - 40);
      const startY = zones[i].y + (Math.random() * 80 - 40);
      answers.push({
        id: i,
        value: options[i],
        x: clamp(startX, ANSWER_RADIUS + 40, WIDTH - ANSWER_RADIUS - 40),
        y: clamp(startY, 100 + ANSWER_RADIUS, HEIGHT - 120 - ANSWER_RADIUS),
        vx: (Math.random() - 0.5) * (0.6 + score * 0.06),
        vy: (Math.random() - 0.5) * (0.4 + score * 0.04),
        wobble: Math.random() * Math.PI * 2,
        scale: 1 + Math.random() * 0.08
      });
    }
  }

  // Start a fresh game
  function startGame() {
    score = 0;
    wrong = 0;
    tickCount = 0;
    drone.x = WIDTH / 2;
    drone.y = HEIGHT / 2;
    drone.vx = 0;
    drone.vy = 0;
    gameState = "playing";
    currentQuestion = generateQuestion(1);
    spawnAnswers(currentQuestion);
    announce("Game started. Use arrow keys or WASD to fly the drone and collect the correct answer.");
    // Ensure audio is resumed on user gesture if necessary
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume().catch((e) => {
        console.warn("Audio resume failed:", e);
      });
    }
  }

  // Reset to menu
  function goToMenu() {
    gameState = "menu";
    announce("Menu. Press Enter or click Start to begin.");
  }

  goToMenu();

  // Input handlers
  window.addEventListener("keydown", (e) => {
    // space or enter to start from menu
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") e.preventDefault();
    keys[e.key.toLowerCase()] = true;

    if (gameState === "menu" && (e.key === "Enter" || e.key.toLowerCase() === " ")) {
      startGame();
    } else if ((gameState === "win" || gameState === "gameover") && (e.key === "r" || e.key === "R" || e.key === "Enter")) {
      startGame();
    }

    // toggle sound with m
    if (e.key.toLowerCase() === "m") {
      setAudioEnabled(!audioEnabled);
      playClickSound();
      announce(`Sound ${audioEnabled ? "on" : "off"}`);
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    // restart or menu click detection: check if click is inside button rectangles when showing end screens
    if (gameState === "menu") {
      // check start button area
      const btn = getMenuStartButtonRect();
      if (pointInRect(mx, my, btn)) {
        playClickSound();
        startGame();
      }
    } else if (gameState === "win" || gameState === "gameover") {
      const btn = getEndButtonRect();
      if (pointInRect(mx, my, btn)) {
        playClickSound();
        startGame();
      }
    } else if (gameState === "playing") {
      // clicking the sound icon toggles sound
      const sd = getSoundIconRect();
      if (pointInRect(mx, my, sd)) {
        setAudioEnabled(!audioEnabled);
        playClickSound();
        announce(`Sound ${audioEnabled ? "on" : "off"}`);
      } else {
        // else clicking will "nudge" drone toward click for accessibility
        const dx = mx - drone.x;
        const dy = my - drone.y;
        const dist = Math.hypot(dx, dy) || 1;
        drone.vx += (dx / dist) * 1.8;
        drone.vy += (dy / dist) * 1.8;
      }
    }
  });

  function pointInRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // UI layout helper rects
  function getScoreRect(text) {
    ctx.font = BODY_FONT;
    const metrics = ctx.measureText(text);
    const w = metrics.width + UI_PADDING * 2;
    const h = 36;
    return { x: UI_PADDING, y: UI_PADDING, w, h };
  }

  function getLivesRect(text) {
    ctx.font = BODY_FONT;
    const metrics = ctx.measureText(text);
    const w = metrics.width + UI_PADDING * 2 + 24;
    const h = 36;
    return { x: WIDTH - w - UI_PADDING, y: UI_PADDING, w, h };
  }

  function getQuestionRect(text) {
    ctx.font = LARGE_FONT;
    const metrics = ctx.measureText(text);
    const w = Math.min(metrics.width + UI_PADDING * 4, WIDTH - 200);
    const h = 48;
    return { x: (WIDTH - w) / 2, y: 10 + 36 + 8, w, h };
  }

  function getInstructionsRect(lines) {
    ctx.font = BODY_FONT;
    // multiple lines stacked bottom-center
    const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const w = maxWidth + UI_PADDING * 4;
    const h = lines.length * 20 + UI_PADDING * 2;
    return { x: (WIDTH - w) / 2, y: HEIGHT - h - 10, w, h };
  }

  function getMenuStartButtonRect() {
    const w = 220;
    const h = 56;
    return { x: (WIDTH - w) / 2, y: HEIGHT / 2 - 20, w, h };
  }

  function getEndButtonRect() {
    const w = 240;
    const h = 56;
    return { x: (WIDTH - w) / 2, y: HEIGHT / 2 + 40, w, h };
  }

  function getSoundIconRect() {
    const w = 40;
    const h = 36;
    return { x: WIDTH - w - UI_PADDING - 80, y: UI_PADDING, w, h };
  }

  // Drawing helpers
  function drawRoundedRect(ctx, x, y, w, h, r = 8) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // Save precomputed colors for consistency
  const palette = {
    primary: "#2a7fb0",
    accent: "#ffd166",
    soft: "#f2fbff",
    dark: "#06314a",
    danger: "#c84b4b"
  };

  // Drawing background with gentle parallax hills and sun
  function drawBackground(nowTick) {
    // sky gradient with soft vignette
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#dff6ff");
    sky.addColorStop(0.6, "#e8fbff");
    sky.addColorStop(1, "#f7fbff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun (soft glow)
    const sunX = WIDTH * 0.86;
    const sunY = HEIGHT * 0.12;
    const sunR = 46;
    const grad = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, sunR * 1.8);
    grad.addColorStop(0, "rgba(255,224,102,0.95)");
    grad.addColorStop(0.2, "rgba(255,238,170,0.6)");
    grad.addColorStop(1, "rgba(255,238,170,0.0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // distant hills (two layers with slow horizontal movement)
    function hill(yBase, amplitude, color, speedFactor, detail) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-50, HEIGHT);
      ctx.lineTo(-50, yBase);
      const segments = 8;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // offset x allowing slow shift with tick
        const x = t * (WIDTH + 100) - 50 + Math.sin((nowTick / 120) * speedFactor + t * detail) * 18;
        const y = yBase + Math.sin(t * Math.PI * 2 + (nowTick / 120) * 0.4 * speedFactor) * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(WIDTH + 50, HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    hill(HEIGHT * 0.74, 18, "rgba(38,92,90,0.06)", 0.8, 3.4);
    hill(HEIGHT * 0.70, 28, "rgba(37,96,133,0.08)", 1.2, 4.0);

    // flying birds - simple icons for calm life (very subtle)
    const birdCount = 3;
    for (let i = 0; i < birdCount; i++) {
      const bx = ((nowTick * 0.4) + i * 240) % (WIDTH + 80) - 40;
      const by = 50 + i * 14 + Math.sin(nowTick / 60 + i) * 6;
      ctx.strokeStyle = "rgba(30,30,30,0.12)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx - 12, by);
      ctx.quadraticCurveTo(bx - 6, by - 10, bx, by);
      ctx.quadraticCurveTo(bx + 6, by - 10, bx + 12, by);
      ctx.stroke();
    }
  }

  // Drawing the enhanced drone with subtle animations
  function drawDrone(ctx, d, nowTick) {
    // produce small engine particles when moving
    const speed = Math.hypot(d.vx, d.vy);
    if (gameState === "playing" && speed > 0.4) {
      const emitCount = Math.min(3, Math.floor(speed * 1.5));
      for (let i = 0; i < emitCount; i++) {
        particles.push({
          x: d.x - Math.cos(d.angle) * 6 + (Math.random() * 6 - 3),
          y: d.y - Math.sin(d.angle) * 6 + (Math.random() * 6 - 3),
          vx: -d.vx * 0.3 + (Math.random() * 0.6 - 0.3),
          vy: -d.vy * 0.3 + (Math.random() * 0.6 - 0.3),
          life: 0.6 + Math.random() * 0.4,
          size: 2 + Math.random() * 3,
          hue: 200 + Math.random() * 30
        });
      }
    }

    // shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.14)";
    ctx.shadowBlur = 10;

    // main transformation
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);

    // body with gradient
    const bodyW = 56;
    const bodyH = 40;
    const bodyGrad = ctx.createLinearGradient(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2);
    bodyGrad.addColorStop(0, "#ffffff");
    bodyGrad.addColorStop(0.6, "#dbf3ff");
    bodyGrad.addColorStop(1, "#d1f0ff");
    ctx.fillStyle = bodyGrad;
    drawRoundedRect(ctx, -bodyW / 2, -bodyH / 2, bodyW, bodyH, 12);

    // decorative stripe
    ctx.fillStyle = palette.primary;
    ctx.fillRect(-bodyW / 2 + 6, -6, bodyW - 12, 8);

    // cockpit glass with highlight
    ctx.beginPath();
    ctx.ellipse(6, -2, 13, 10, Math.PI / 10, 0, Math.PI * 2);
    const glassGrad = ctx.createLinearGradient(0, -12, 12, 6);
    glassGrad.addColorStop(0, "rgba(255,255,255,0.85)");
    glassGrad.addColorStop(1, "rgba(210,243,255,0.6)");
    ctx.fillStyle = glassGrad;
    ctx.fill();

    // smile and eyes
    ctx.beginPath();
    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = 1.2;
    ctx.arc(-8, 6, 7, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#2a7fb0";
    ctx.beginPath();
    ctx.arc(-10, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-2, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // propeller arms and spinning rotors
    const propPositions = [-1, 1];
    const rotorSpin = nowTick / 6 + speed * 8;
    for (let i = 0; i < propPositions.length; i++) {
      const side = propPositions[i];
      const px = side * (bodyW / 2 + 6);
      const py = -12;
      // arm
      ctx.strokeStyle = "#7b7b7b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 18);
      ctx.stroke();

      // rotor (fast spinning blur)
      ctx.save();
      ctx.translate(px, py - 24);
      ctx.rotate(rotorSpin * (i === 0 ? 1 : -1));
      // draw 3 blurred blades as arcs
      for (let b = 0; b < 3; b++) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.ellipse(Math.cos(b) * 6, Math.sin(b) * 2, 14, 6, b * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // small thruster flame at rear (animated)
    const flameLen = 6 + Math.min(10, speed * 4);
    ctx.save();
    ctx.translate(-bodyW / 2 - 4, 2);
    const flameGrad = ctx.createLinearGradient(-flameLen, 0, 0, 0);
    flameGrad.addColorStop(0, "rgba(255,190,60,0.0)");
    flameGrad.addColorStop(0.5, "rgba(255,190,60,0.18)");
    flameGrad.addColorStop(1, "rgba(255,140,20,0.6)");
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.ellipse(-flameLen / 2, 0, flameLen, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // subtle outer shadow reset
    ctx.shadowBlur = 0;
  }

  // Drawing answer bubble with glow and subtle ring
  function drawAnswer(ctx, a, highlight = false, nowTick = 0) {
    ctx.save();
    // wobble animation
    const wob = Math.sin(a.wobble + nowTick / 30) * 2;
    a.wobble += 0.01;
    const scalePulse = 1 + Math.sin(nowTick / 18 + a.wobble) * 0.02 + (highlight ? 0.06 : 0);
    ctx.translate(a.x, a.y + wob);
    ctx.scale(scalePulse * a.scale, scalePulse * a.scale);

    // glow
    ctx.beginPath();
    const glow = ctx.createRadialGradient(0, 0, ANSWER_RADIUS * 0.2, 0, 0, ANSWER_RADIUS * 1.6);
    glow.addColorStop(0, "rgba(255,255,255,0.7)");
    glow.addColorStop(0.5, "rgba(205,241,255,0.26)");
    glow.addColorStop(1, "rgba(205,241,255,0.0)");
    ctx.fillStyle = glow;
    ctx.arc(0, 0, ANSWER_RADIUS * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // outer ring
    ctx.beginPath();
    ctx.fillStyle = highlight ? "#fff8e6" : "#ffffff";
    ctx.strokeStyle = highlight ? "#ffd166" : "#cfe9ff";
    ctx.lineWidth = 3;
    ctx.arc(0, 0, ANSWER_RADIUS + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // inner circle with subtle gradient
    ctx.beginPath();
    const innerGrad = ctx.createLinearGradient(-ANSWER_RADIUS, -ANSWER_RADIUS, ANSWER_RADIUS, ANSWER_RADIUS);
    innerGrad.addColorStop(0, "#f6ffff");
    innerGrad.addColorStop(1, "#e6fbff");
    ctx.fillStyle = innerGrad;
    ctx.arc(0, 0, ANSWER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // shiny highlight
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.ellipse(-8, -10, 10, 6, 0.25, 0, Math.PI * 2);
    ctx.fill();

    // number text
    ctx.font = "20px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#083047";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(a.value), 0, 0);

    // outer orbiting ring for highlight
    if (highlight) {
      ctx.strokeStyle = "rgba(255,209,102,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ANSWER_RADIUS + 12 + Math.sin(nowTick / 10) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Collision detection (unchanged logic / behavior)
  function checkCollisions() {
    for (let i = answers.length - 1; i >= 0; i--) {
      const a = answers[i];
      const dx = a.x - drone.x;
      const dy = a.y - drone.y;
      const dist = Math.hypot(dx, dy);
      if (dist < DRONE_RADIUS + ANSWER_RADIUS - 6) {
        // collision happened
        if (a.value === currentQuestion.correct) {
          score++;
          playCorrectSound();
          announce(`Correct! Your score is ${score}.`);
          // feedback pulse
          soundPulse = 10;
          // next question or win
          if (score >= GOAL_CORRECT) {
            gameState = "win";
            announce("You win! Press R or click Restart to play again.");
            return;
          } else {
            // generate next question with mild difficulty
            currentQuestion = generateQuestion(1 + Math.floor(score / 3));
            spawnAnswers(currentQuestion);
            return;
          }
        } else {
          wrong++;
          playWrongSound();
          announce(`Oops! That was ${a.value}. You have ${wrong} wrong answers.`);
          // visual feedback: shake drone and flash
          drone.vx += (Math.random() - 0.5) * 3;
          drone.vy += (Math.random() - 0.5) * 3;
          // remove collided wrong answer but keep others
          answers.splice(i, 1);
          if (wrong >= MAX_WRONG) {
            gameState = "gameover";
            announce("Game over. Press R or click Restart to try again.");
            return;
          } else {
            // optionally spawn a new distractor to maintain three options
            // spawn one random distractor around edges
            const val = currentQuestion.correct + (Math.random() < 0.5 ? -1 : 1) * (Math.floor(Math.random() * 4) + 1);
            answers.push({
              id: Date.now(),
              value: val === currentQuestion.correct ? val + 2 : val,
              x: clamp(Math.random() * (WIDTH - 80) + 40, ANSWER_RADIUS + 40, WIDTH - ANSWER_RADIUS - 40),
              y: clamp(Math.random() * (HEIGHT - 200) + 120, 100 + ANSWER_RADIUS, HEIGHT - 120 - ANSWER_RADIUS),
              vx: (Math.random() - 0.5) * (0.6 + score * 0.06),
              vy: (Math.random() - 0.5) * (0.4 + score * 0.04),
              wobble: Math.random() * Math.PI * 2,
              scale: 1 + Math.random() * 0.08
            });
          }
        }
      }
    }
  }

  // Update logic (unchanged mechanics)
  function update(dt) {
    tickCount++;
    const nowTick = tickCount;
    if (gameState !== "playing") {
      // slow subtle animations only
      for (const a of answers) {
        a.wobble += 0.01;
      }
      // drift particles slowly
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * 0.1;
        p.y += p.vy * 0.1;
        p.life -= 0.003;
        if (p.life <= 0) particles.splice(i, 1);
      }
      return;
    }

    // Player movement: keyboard
    const speed = 2.1 + score * 0.05;
    const accel = 0.25;
    if (keys["arrowup"] || keys["w"]) drone.vy -= accel;
    if (keys["arrowdown"] || keys["s"]) drone.vy += accel;
    if (keys["arrowleft"] || keys["a"]) drone.vx -= accel;
    if (keys["arrowright"] || keys["d"]) drone.vx += accel;

    // Gentle drag
    drone.vx *= 0.92;
    drone.vy *= 0.92;

    // Limit speed
    drone.vx = clamp(drone.vx, -speed * 1.6, speed * 1.6);
    drone.vy = clamp(drone.vy, -speed * 1.6, speed * 1.6);

    drone.x += drone.vx;
    drone.y += drone.vy;

    // Boundaries
    drone.x = clamp(drone.x, DRONE_RADIUS + 6, WIDTH - DRONE_RADIUS - 6);
    drone.y = clamp(drone.y, DRONE_RADIUS + 80, HEIGHT - DRONE_RADIUS - 80);

    // tilt based on vx and vy for better feel
    const targetAngle = Math.atan2(drone.vy, drone.vx) * 0.12;
    drone.angle += (targetAngle - drone.angle) * 0.12;

    // Update answers movement
    for (const a of answers) {
      a.x += a.vx;
      a.y += a.vy;
      // gentle bounce off walls
      if (a.x < ANSWER_RADIUS + 12 || a.x > WIDTH - ANSWER_RADIUS - 12) a.vx *= -1;
      if (a.y < 120 + ANSWER_RADIUS || a.y > HEIGHT - 120 - ANSWER_RADIUS) a.vy *= -1;
      // keep inside
      a.x = clamp(a.x, ANSWER_RADIUS + 12, WIDTH - ANSWER_RADIUS - 12);
      a.y = clamp(a.y, 120 + ANSWER_RADIUS, HEIGHT - 120 - ANSWER_RADIUS);
      // slight drift to keep things lively
      a.vx += (Math.random() - 0.5) * 0.02;
      a.vy += (Math.random() - 0.5) * 0.02;
      // small scale breathing
      a.scale = 1 + Math.sin(nowTick / 50 + a.wobble) * 0.02;
    }

    // update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy += 0.02;
      p.life -= 0.01;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Collision check
    checkCollisions();

    // background pulse for audio visual indicator
    soundPulse = Math.max(0, soundPulse - 0.25);
  }

  // UI drawing ensuring non overlapping using measureText and rectangles
  function render() {
    // clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background
    drawBackground(tickCount);

    // Soft fluffy clouds (several layers)
    drawCloud(ctx, 100, 80, 1.0, 0.95, tickCount, 0.3);
    drawCloud(ctx, 540, 60, 0.92, 0.9, tickCount, 0.25);
    drawCloud(ctx, 360, 120, 1.04, 0.92, tickCount, 0.18);
    drawCloud(ctx, 200, 140, 0.7, 0.6, tickCount, 0.15);

    // subtle foreground faint pattern (soft grid) to add depth
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.strokeStyle = "#083047";
    for (let x = 0; x < WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, HEIGHT * 0.5);
      ctx.lineTo(x + 8, HEIGHT * 0.5 + 6);
      ctx.stroke();
    }
    ctx.restore();

    // UI: score top-left
    ctx.font = BODY_FONT;
    const scoreText = `Correct: ${score}/${GOAL_CORRECT}`;
    const scoreRect = getScoreRect(scoreText);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    drawRoundedRect(ctx, scoreRect.x, scoreRect.y, scoreRect.w, scoreRect.h, 8);
    ctx.fillStyle = "#1c3e5a";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(scoreText, scoreRect.x + UI_PADDING, scoreRect.y + scoreRect.h / 2);

    // Sound visual icon and box
    const soundRect = getSoundIconRect();
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    drawRoundedRect(ctx, scoreRect.x + scoreRect.w + 8, soundRect.y, soundRect.w, soundRect.h, 8);
    // draw speaker glyph
    ctx.save();
    ctx.translate(scoreRect.x + scoreRect.w + 20, soundRect.y + soundRect.h / 2);
    ctx.fillStyle = audioEnabled ? "#256085" : "#9aa6ad";
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(-2, -8);
    ctx.lineTo(6, -14);
    ctx.lineTo(6, 14);
    ctx.lineTo(-2, 8);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    if (audioEnabled) {
      ctx.strokeStyle = "#256085";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(10, -2, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12.5, -2, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      // muted X
      ctx.strokeStyle = "#9aa6ad";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, -6);
      ctx.lineTo(12, 6);
      ctx.moveTo(12, -6);
      ctx.lineTo(2, 6);
      ctx.stroke();
    }
    ctx.restore();

    // Lives top-right
    ctx.font = BODY_FONT;
    const livesText = `Wrong: ${wrong}/${MAX_WRONG}`;
    const livesRect = getLivesRect(livesText);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    drawRoundedRect(ctx, livesRect.x, livesRect.y, livesRect.w, livesRect.h, 8);
    ctx.fillStyle = "#873b3b";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(livesText, livesRect.x + UI_PADDING, livesRect.y + livesRect.h / 2);

    // Question top-center (ensuring not overlapping)
    if (currentQuestion) {
      ctx.font = LARGE_FONT;
      const qText = currentQuestion.text;
      const qRect = getQuestionRect(qText);
      ctx.fillStyle = "rgba(255,255,255,0.98)";
      drawRoundedRect(ctx, qRect.x, qRect.y, qRect.w, qRect.h, 10);
      ctx.fillStyle = "#06314a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(qText, qRect.x + qRect.w / 2, qRect.y + qRect.h / 2);
    }

    // Instructions bottom-center
    const lines = [
      "Fly the drone to collect the correct answer!",
      "Goal: collect 10 correct answers. You lose after 3 wrong picks.",
      "Controls: Arrow keys or WASD to move. Click or press M to toggle sound. Press R to restart."
    ];
    ctx.font = BODY_FONT;
    const instRect = getInstructionsRect(lines);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    drawRoundedRect(ctx, instRect.x, instRect.y, instRect.w, instRect.h, 8);
    ctx.fillStyle = "#0b3954";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let yy = instRect.y + UI_PADDING;
    for (const line of lines) {
      ctx.fillText(line, instRect.x + UI_PADDING, yy);
      yy += 20;
    }

    // Draw answers
    for (const a of answers) {
      // highlight if near drone
      const d = Math.hypot(a.x - drone.x, a.y - drone.y);
      drawAnswer(ctx, a, d < 120, tickCount);
    }

    // Draw particles behind drone (so they appear under the drone)
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1) * 0.9;
      ctx.fillStyle = `hsla(${p.hue},80%,60%,0.9)`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw drone last (so it's on top)
    drawDrone(ctx, drone, tickCount);

    // If paused/menu/win/gameover overlay
    if (gameState === "menu") {
      drawMenu();
    } else if (gameState === "win") {
      drawEndScreen(true);
    } else if (gameState === "gameover") {
      drawEndScreen(false);
    }

    // Sound activity visual cue (tiny pulsing circle near sound icon)
    ctx.beginPath();
    const pulseR = 4 + Math.sin(tickCount / 6) * 2 * (audioEnabled ? 1 : 0.2);
    ctx.fillStyle = audioEnabled ? "rgba(37,96,133,0.95)" : "rgba(150,150,150,0.6)";
    ctx.arc(scoreRect.x + scoreRect.w + 28, soundRect.y + soundRect.h + 6 - UI_PADDING, pulseR, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMenu() {
    // translucent overlay with subtle blur-style
    ctx.fillStyle = "rgba(7,20,40,0.28)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // title box with gentle border glow
    const title = "Drone Math Collector";
    ctx.font = TITLE_FONT;
    const tMetrics = ctx.measureText(title);
    const tW = Math.min(tMetrics.width, WIDTH - 80);
    const tx = (WIDTH - tW) / 2;
    const ty = HEIGHT * 0.22;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    drawRoundedRect(ctx, tx - 12, ty - 22, tW + 24, 60, 10);
    ctx.fillStyle = "#06314a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, WIDTH / 2, ty + 6);

    // small description pill
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText("A calm learning game — collect the right answers to win.", WIDTH / 2, ty + 48);

    // start button with drop shadow
    const btn = getMenuStartButtonRect();
    ctx.save();
    ctx.shadowColor = "rgba(12,40,60,0.18)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#fff8e6";
    drawRoundedRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.restore();
    ctx.fillStyle = "#2a6f97";
    ctx.font = "20px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Start the Drone Adventure", btn.x + btn.w / 2, btn.y + btn.h / 2);

    // instructions below
    ctx.font = BODY_FONT;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("Collect correct answers by flying the drone. Avoid wrong picks!", WIDTH / 2, btn.y + btn.h + 36);
    ctx.fillText("Click the Start button or press Enter to begin.", WIDTH / 2, btn.y + btn.h + 56);
  }

  function drawEndScreen(won) {
    // overlay
    ctx.fillStyle = "rgba(5, 15, 30, 0.45)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.font = TITLE_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    const title = won ? "Victory! You mastered drone math!" : "Game Over - Keep practicing!";
    ctx.fillText(title, WIDTH / 2, HEIGHT * 0.28);
    // details
    ctx.font = LARGE_FONT;
    ctx.fillStyle = won ? "#ffd166" : "#ff8a8a";
    ctx.fillText(won ? `Score: ${score}/${GOAL_CORRECT}` : `Correct: ${score}  Wrong: ${wrong}`, WIDTH / 2, HEIGHT * 0.38);
    // restart button
    const btn = getEndButtonRect();
    ctx.fillStyle = won ? "#e6ffe9" : "#fff0f0";
    drawRoundedRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
    ctx.fillStyle = "#06314a";
    ctx.font = "20px Inter, system-ui, sans-serif";
    ctx.fillText("Restart (R) and try again", btn.x + btn.w / 2, btn.y + btn.h / 2);
    // small hint
    ctx.font = BODY_FONT;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Click Restart or press R to play again.", WIDTH / 2, btn.y + btn.h + 36);
  }

  // Cloud drawing simple shapes for background with gentle drift
  function drawCloud(ctx, x, y, scale = 1, alpha = 1, nowTick = 0, speed = 0.2) {
    ctx.save();
    const move = Math.sin((nowTick * speed) / 60 + x * 0.01) * 18;
    ctx.translate(x + move, y + Math.cos((nowTick * speed) / 120 + x * 0.02) * 6);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.arc(24, -6, 18, 0, Math.PI * 2);
    ctx.arc(40, 2, 20, 0, Math.PI * 2);
    ctx.arc(18, 10, 16, 0, Math.PI * 2);
    ctx.fill();

    // slight bottom shadow to give depth
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.02)";
    ctx.ellipse(20, 20, 36, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Main loop
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Accessibility: draw focus outlines and ensure canvas informs keyboard users
  // Provide a keyboard-only help shortcut: pressing "h" will announce controls
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "h") {
      announce("Controls: Arrow keys or W A S D to move, click the screen to nudge the drone, M toggles sound, R to restart.");
    }
  });

  // Resize and layout: ensure canvas stays the desired size
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.setAttribute("width", WIDTH);
  canvas.setAttribute("height", HEIGHT);

  // Start screen assets: spawn some floating answers even on menu for lively feel
  function initMenuAnswers() {
    currentQuestion = generateQuestion(1);
    spawnAnswers(currentQuestion);
  }
  initMenuAnswers();

  // Expose small debug API (non-intrusive)
  window._droneMathGame = {
    start: startGame,
    menu: goToMenu,
    getState: () => ({ score, wrong, gameState }),
    toggleAudio: () => {
      setAudioEnabled(!audioEnabled);
      playClickSound();
    }
  };
})();