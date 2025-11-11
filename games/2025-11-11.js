(function () {
  // Drone Math Delivery - Enhanced Visuals & Audio
  // Renders into element with id "game-of-the-day-stage"
  // This version improves visuals (colors, animations, backgrounds, characters)
  // and audio using only Canvas and Web Audio API. No external assets.
  "use strict";

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_CORRECT = 10;
  const MAX_LIVES = 3;
  const FONT_FAMILY = "Arial, sans-serif";

  // Attempt to find the stage element
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    console.error("Missing container element with id 'game-of-the-day-stage'.");
    return;
  }

  // Clean stage contents and create canvas
  stage.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.setAttribute("tabindex", "0"); // make focusable for keyboard events
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Global state
  let gameState = {
    running: true,
    correctCount: 0,
    wrongCount: 0,
    lives: MAX_LIVES,
    currentProblem: null,
    inputText: "",
    message: "",
    timeSinceLastCorrect: 0,
    droneX: 100,
    droneY: HEIGHT / 2,
    droneTargetX: 100,
    droneWobble: 0,
    animations: [],
    soundEnabled: true,
    audioReady: false,
    audioError: null,
    bgHumGain: null,
    lastTick: null,
    endState: null, // null | "win" | "lose"
    // visual extras
    bgOffset: 0,
    clouds: [],
    confetti: [],
  };

  // Layout constants
  const PADDING = 12;
  const TOP_UI_HEIGHT = 64;
  const BOTTOM_UI_HEIGHT = 84;
  const CENTER_AREA = {
    x: PADDING,
    y: TOP_UI_HEIGHT + PADDING,
    w: WIDTH - PADDING * 2,
    h: HEIGHT - TOP_UI_HEIGHT - BOTTOM_UI_HEIGHT - PADDING * 2,
  };

  // Button regions for click detection
  const regions = {
    okButton: null,
    restartButton: null,
    soundToggle: null,
    keypadButtons: [],
  };

  // Utility: measure text width with given font size and weight
  function measureText(text, size = 16, weight = "normal") {
    ctx.save();
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    const m = ctx.measureText(text);
    ctx.restore();
    return m.width;
  }

  // Audio setup with error handling
  let audioCtx = null;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    } else {
      throw new Error("Web Audio API not supported");
    }
  } catch (err) {
    audioCtx = null;
    gameState.audioError = err.message || String(err);
    console.warn("AudioContext creation failed:", err);
  }

  function ensureAudio() {
    if (!audioCtx) return false;
    // Some browsers require resume on user gesture
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => {
        console.warn("Audio resume failed", e);
      });
    }
    return true;
  }

  // Start gentle background hum if audio ready - richer timbre with two oscillators
  function startBackgroundHum() {
    if (!audioCtx) return;
    try {
      if (gameState.bgHumGain) return; // already running
      const masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.0005; // baseline quiet
      const oscA = audioCtx.createOscillator();
      const oscB = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();

      oscA.type = "sine";
      oscA.frequency.value = 110; // base
      oscB.type = "triangle";
      oscB.frequency.value = 132; // a little detuned

      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.7;

      oscA.connect(masterGain);
      oscB.connect(masterGain);
      masterGain.connect(filter);
      filter.connect(audioCtx.destination);

      oscA.start();
      oscB.start();

      gameState.bgHumGain = masterGain;
      gameState.bgHumOscA = oscA;
      gameState.bgHumOscB = oscB;
      gameState.bgHumFilter = filter;
      gameState.audioReady = true;

      // Respect sound enabled setting
      setSoundEnabled(gameState.soundEnabled);
    } catch (e) {
      console.warn("Background hum setup failed", e);
      gameState.audioError = e.message || String(e);
    }
  }

  // Toggle sound on/off
  function setSoundEnabled(enabled) {
    gameState.soundEnabled = enabled;
    if (gameState.bgHumGain && audioCtx) {
      try {
        gameState.bgHumGain.gain.setTargetAtTime(
          enabled ? 0.0009 : 0.0,
          audioCtx.currentTime,
          0.02
        );
      } catch (e) {
        console.warn("setSoundEnabled error", e);
      }
    }
  }

  // Play short chime for correct - softened and layered
  function playCorrect() {
    if (!audioCtx || !gameState.soundEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.connect(audioCtx.destination);

      const o1 = audioCtx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = 720;

      const o2 = audioCtx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 960;

      const f = audioCtx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2300;

      o1.connect(f);
      o2.connect(f);
      f.connect(g);

      o1.start(now);
      o2.start(now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      o1.stop(now + 0.7);
      o2.stop(now + 0.55);
    } catch (e) {
      console.warn("playCorrect error", e);
    }
  }

  // Play buzz for wrong answer - softened
  function playWrong() {
    if (!audioCtx || !gameState.soundEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const flt = audioCtx.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.value = 180;
      flt.type = "lowpass";
      flt.frequency.value = 1200;
      g.gain.value = 0.00001;
      o.connect(flt);
      flt.connect(g);
      g.connect(audioCtx.destination);
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.00001, now + 0.35);
      o.stop(now + 0.36);
    } catch (e) {
      console.warn("playWrong error", e);
    }
  }

  // Click sound - short pluck
  function playClick() {
    if (!audioCtx || !gameState.soundEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.value = 1100;
      o.connect(g);
      g.connect(audioCtx.destination);
      g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(0.04, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      o.start(now);
      o.stop(now + 0.1);
    } catch (e) {
      console.warn("playClick error", e);
    }
  }

  // Whoosh / delivery sound - swept filter for motion
  function playDeliverWhoosh() {
    if (!audioCtx || !gameState.soundEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const flt = audioCtx.createBiquadFilter();
      o.type = "triangle";
      o.frequency.value = 300;
      flt.type = "bandpass";
      flt.frequency.value = 400;
      flt.Q.value = 0.8;
      o.connect(flt);
      flt.connect(g);
      g.connect(audioCtx.destination);
      g.gain.value = 0.00001;
      o.start(now);
      // sweep filter for a whoosh
      flt.frequency.setValueAtTime(120, now);
      flt.frequency.exponentialRampToValueAtTime(1400, now + 0.28);
      g.gain.exponentialRampToValueAtTime(0.035, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      o.stop(now + 0.5);
    } catch (e) {
      console.warn("playDeliverWhoosh error", e);
    }
  }

  // Helper: create a new math problem suitable for ages 7-9
  function makeProblem(correctCount) {
    // Increase difficulty slowly as player gets more correct
    const level = Math.min(4, Math.floor(correctCount / 3) + 1);
    let a, b, op, answer;
    if (level === 1) {
      op = "+";
      a = randInt(0, 10);
      b = randInt(0, 10);
      answer = a + b;
    } else if (level === 2) {
      op = Math.random() < 0.6 ? "+" : "-";
      a = randInt(0, 12);
      b = randInt(0, a);
      answer = op === "+" ? a + b : a - b;
    } else if (level === 3) {
      op = Math.random() < 0.5 ? "+" : "-";
      a = randInt(0, 20);
      b = op === "-" ? randInt(0, a) : randInt(0, 20);
      answer = op === "+" ? a + b : a - b;
    } else {
      if (Math.random() < 0.5) {
        op = "×";
        a = randInt(2, 6);
        b = randInt(2, 6);
        answer = a * b;
      } else {
        op = "+";
        a = randInt(0, 30);
        b = randInt(0, 30);
        answer = a + b;
      }
    }
    return { a, b, op, answer };
  }

  // Utility random int inclusive
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Reset and start new game
  function resetGame() {
    gameState.running = true;
    gameState.correctCount = 0;
    gameState.wrongCount = 0;
    gameState.lives = MAX_LIVES;
    gameState.inputText = "";
    gameState.animations = [];
    gameState.message = "Welcome! Type your answer and press Enter or click OK.";
    gameState.currentProblem = makeProblem(0);
    gameState.droneX = 100;
    gameState.droneY = CENTER_AREA.y + CENTER_AREA.h / 2;
    gameState.droneTargetX = gameState.droneX;
    gameState.droneWobble = 0;
    gameState.endState = null;
    gameState.bgOffset = 0;
    gameState.clouds = createCloudSet();
    gameState.confetti = [];
    if (ensureAudio()) startBackgroundHum();
    gameLoopResetTime();
  }

  // Create set of cloud objects for parallax
  function createCloudSet() {
    const arr = [];
    for (let i = 0; i < 5; i++) {
      arr.push({
        x: Math.random() * WIDTH,
        y: 20 + Math.random() * 140,
        w: 60 + Math.random() * 100,
        h: 20 + Math.random() * 40,
        speed: 0.08 + Math.random() * 0.12,
        shade: Math.random() * 0.06 + 0.95,
      });
    }
    return arr;
  }

  // Game Over handling
  function finishGame(state) {
    gameState.running = false;
    gameState.endState = state;
    if (state === "win") {
      gameState.message = `Hooray! You delivered ${TARGET_CORRECT} packages! Press R to restart.`;
      playCorrect();
      spawnConfetti();
    } else {
      gameState.message = `Oh no! You lost all lives. Press R to try again.`;
      playWrong();
    }
  }

  // Submit answer logic
  function submitAnswer() {
    if (!gameState.running) return;
    const raw = gameState.inputText.trim();
    if (raw.length === 0) {
      gameState.message = "Please enter a number answer.";
      return;
    }
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
      gameState.message = "Invalid number. Use digits and press Enter or OK.";
      return;
    }
    const correct = parsed === gameState.currentProblem.answer;
    if (correct) {
      gameState.correctCount += 1;
      gameState.message = "Correct! The drone happily flies to deliver the package.";
      gameState.inputText = "";
      // animate drone to right then back
      animateDroneDeliver();
      playCorrect();
      gameState.timeSinceLastCorrect = 0;
      if (gameState.correctCount >= TARGET_CORRECT) {
        // finish handled after animation or here immediate? Keep same behavior: finish here.
        finishGame("win");
      } else {
        // prepare next problem after short delay via animation callback
      }
    } else {
      gameState.wrongCount += 1;
      gameState.lives -= 1;
      gameState.message = "Oops! Wrong answer. Try the next one.";
      gameState.inputText = "";
      gameState.droneWobble = 1.0;
      playWrong();
      if (gameState.lives <= 0) {
        finishGame("lose");
      } else {
        gameState.currentProblem = makeProblem(gameState.correctCount);
      }
    }
  }

  // Drone delivery animation: drone goes to a 'package' (right side), a star appears, then returns.
  function animateDroneDeliver() {
    const startX = gameState.droneX;
    const targetX = CENTER_AREA.x + CENTER_AREA.w - 120;
    const duration = 900; // ms to go right
    const returnDuration = 600;
    const startTime = performance.now();
    const anim = {
      type: "deliver",
      startTime,
      duration,
      returnDuration,
      startX,
      targetX,
      phase: "going",
      done: false,
    };
    gameState.animations.push(anim);
    // play whoosh
    playDeliverWhoosh();
  }

  // Sparkle animation spawn
  function spawnSparkles(x, y, count) {
    for (let i = 0; i < count; i++) {
      const a = {
        type: "spark",
        x,
        y,
        vx: (Math.random() - 0.5) * 2.2,
        vy: -Math.random() * 2.2 - 0.6,
        life: 700 + Math.random() * 700,
        born: performance.now(),
        color: Math.random() > 0.5 ? "#FFF59D" : "#FFECB3",
      };
      gameState.animations.push(a);
    }
  }

  // Confetti for win
  function spawnConfetti() {
    for (let i = 0; i < 40; i++) {
      gameState.confetti.push({
        x: WIDTH / 2 + (Math.random() - 0.5) * 240,
        y: HEIGHT / 2 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 2.5,
        vy: -2 - Math.random() * 2,
        rot: Math.random() * Math.PI,
        vrota: (Math.random() - 0.5) * 0.15,
        life: 2000 + Math.random() * 1600,
        born: performance.now(),
        color: ["#FF7F50", "#FFD54F", "#90CAF9", "#A5D6A7"][Math.floor(Math.random() * 4)],
      });
    }
  }

  // Draw helper: rounded rect
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Draw main frame
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Animated background
    drawBackground();

    // Draw top UI: score left, lives right, sound toggle near top-center
    drawTopUI();

    // Draw center play area border and landmarks
    drawPlayArea();

    // Draw drone and package
    drawSceneObjects();

    // Draw problem and input UI
    drawProblemArea();

    // Draw bottom instructions
    drawBottomInstructions();

    // Confetti if any
    drawConfetti();

    // If not running: end screen overlay
    if (!gameState.running && gameState.endState) {
      drawEndScreen();
    }
  }

  // Animated background with subtle gradient shift and parallax clouds
  function drawBackground() {
    // moving gradient background
    gameState.bgOffset += 0.02;
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    const t = (Math.sin(gameState.bgOffset / 18) + 1) / 2;
    g.addColorStop(0, lerpColor("#E9FBFF", "#FFF4E6", t * 0.3));
    g.addColorStop(1, lerpColor("#F6FCFF", "#EAF7EF", t));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun with soft glow
    const sunX = WIDTH - 110;
    const sunY = 80;
    const grd = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 70);
    grd.addColorStop(0, "rgba(255,238,156,0.95)");
    grd.addColorStop(1, "rgba(255,238,156,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
    ctx.fill();

    // layered distant hills
    drawHills();

    // clouds with parallax
    for (const c of gameState.clouds) {
      c.x += c.speed;
      if (c.x - c.w > WIDTH) c.x = -c.w - Math.random() * 80;
      drawCloud(c.x, c.y, c.w, c.h, c.shade);
    }

    // tiny whimsical motes
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * 84 + ((i % 3) * 14);
      const y = 40 + ((i * 37) % 110) + Math.sin((performance.now() / 900) + i) * 6;
      drawTinyMote(x, y, 5 + (i % 3));
    }
    ctx.globalAlpha = 1.0;
  }

  function drawHills() {
    ctx.save();
    // distant green
    ctx.fillStyle = "#E8F6EF";
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 90);
    ctx.quadraticCurveTo(120, HEIGHT - 140, 260, HEIGHT - 92);
    ctx.quadraticCurveTo(380, HEIGHT - 30, 520, HEIGHT - 88);
    ctx.quadraticCurveTo(640, HEIGHT - 130, WIDTH, HEIGHT - 90);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();

    // closer hill
    ctx.fillStyle = "#DFF2E6";
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 60);
    ctx.quadraticCurveTo(180, HEIGHT - 110, 360, HEIGHT - 62);
    ctx.quadraticCurveTo(520, HEIGHT - 20, WIDTH, HEIGHT - 60);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCloud(cx, cy, w, h, shade) {
    const grad = ctx.createLinearGradient(cx - w, cy - h, cx + w, cy + h);
    const base = `rgba(255,255,255,${shade})`;
    grad.addColorStop(0, base);
    grad.addColorStop(1, "rgba(240,250,255,0.9)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.8, h, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - w * 0.45, cy + 6, w * 0.45, h * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.4, cy + 4, w * 0.4, h * 0.75, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.03)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawTinyMote(x, y, r) {
    ctx.fillStyle = "#FFF7E6";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lerp between two hex colors (simple)
  function lerpColor(a, b, t) {
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bl = Math.round(pa.b + (pb.b - pa.b) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function hexToRgb(hex) {
    const stripped = hex.replace("#", "");
    const bigint = parseInt(stripped, 16);
    if (stripped.length === 6) {
      return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
    } else {
      // fallback white
      return { r: 255, g: 255, b: 255 };
    }
  }

  // Top UI rendering
  function drawTopUI() {
    // translucent rounded bar
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    roundRect(ctx, 8, 8, WIDTH - 16, TOP_UI_HEIGHT - 16, 12);
    ctx.fill();
    ctx.restore();

    // score at top-left with small icon
    const scoreText = `Delivered: ${gameState.correctCount}/${TARGET_CORRECT}`;
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillStyle = "#052A3A";
    ctx.fillText(scoreText, PADDING + 10, PADDING + 26);
    // little package icon
    drawSmallPackage(PADDING + 8, PADDING + 32);

    // lives top-right with heart icons
    const livesText = `Lives: ${gameState.lives}`;
    ctx.font = `600 18px ${FONT_FAMILY}`;
    const lw = ctx.measureText(livesText).width;
    const lx = WIDTH - PADDING - (lw + 84);
    ctx.fillStyle = "#052A3A";
    ctx.fillText(livesText, lx + 60, PADDING + 26);
    // hearts
    for (let i = 0; i < MAX_LIVES; i++) {
      const hx = lx + 10 + i * 22;
      drawHeart(hx, PADDING + 16, 14, i < gameState.lives ? "#FF6B6B" : "#FFECEB");
    }

    // sound toggle center top
    const soundText = gameState.soundEnabled ? "Sound: On (S)" : "Sound: Off (S)";
    ctx.font = `600 14px ${FONT_FAMILY}`;
    const swt = ctx.measureText(soundText).width;
    const sx = (WIDTH - swt) / 2 - 8;
    const sy = PADDING + 8;
    ctx.fillStyle = "rgba(255,255,255,0.0)";
    roundRect(ctx, sx - 10, sy - 6, swt + 20, 32, 8);
    ctx.fill();
    ctx.fillStyle = "#052A3A";
    ctx.fillText(soundText, sx, sy + 18);
    regions.soundToggle = { x: sx - 10, y: sy - 6, w: swt + 20, h: 32 };
  }

  function drawSmallPackage(x, y) {
    ctx.save();
    ctx.fillStyle = "#FFDCB3";
    roundRect(ctx, x, y, 18, 12, 3);
    ctx.fill();
    ctx.strokeStyle = "#D7A36A";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#FF7A59";
    ctx.fillRect(x + 8, y + 2, 2, 8);
    ctx.restore();
  }

  function drawHeart(x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - size / 2, x - size, y - size / 2, x - size, y + size / 4);
    ctx.bezierCurveTo(x - size, y + size / 1.2, x - size / 2, y + size, x, y + size / 1.5);
    ctx.bezierCurveTo(x + size / 2, y + size, x + size, y + size / 1.2, x + size, y + size / 4);
    ctx.bezierCurveTo(x + size, y - size / 2, x, y - size / 2, x, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Play area (delivery zone & landmarks)
  function drawPlayArea() {
    ctx.save();
    ctx.strokeStyle = "rgba(5,42,58,0.06)";
    ctx.lineWidth = 2;
    roundRect(ctx, CENTER_AREA.x, CENTER_AREA.y, CENTER_AREA.w, CENTER_AREA.h, 12);
    ctx.stroke();
    ctx.restore();
    // Delivery zone
    const dzx = CENTER_AREA.x + CENTER_AREA.w - 140;
    const dzy = CENTER_AREA.y + 40;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    roundRect(ctx, dzx, dzy, 120, CENTER_AREA.h - 80, 8);
    ctx.fill();
    // landing pad
    ctx.fillStyle = "#F9E79F";
    roundRect(ctx, dzx + 12, CENTER_AREA.y + CENTER_AREA.h - 120, 96, 36, 6);
    ctx.fill();
    ctx.fillStyle = "#6C4F9B";
    ctx.font = `700 14px ${FONT_FAMILY}`;
    ctx.fillText("Delivery Zone", dzx + 18, CENTER_AREA.y + CENTER_AREA.h - 94);
    // playful landmark left
    ctx.save();
    ctx.translate(CENTER_AREA.x + 28, CENTER_AREA.y + CENTER_AREA.h - 60);
    drawPlayHouse();
    ctx.restore();
  }

  function drawPlayHouse() {
    // base
    ctx.fillStyle = "#FFECB3";
    roundRect(ctx, 0, 0, 60, 42, 6);
    ctx.fill();
    // roof
    ctx.fillStyle = "#FF8A80";
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(30, -22);
    ctx.lineTo(66, 0);
    ctx.closePath();
    ctx.fill();
    // door
    ctx.fillStyle = "#7E57C2";
    roundRect(ctx, 24, 18, 12, 24, 3);
    ctx.fill();
  }

  // Draw scene objects: package, drone, sparkles
  function drawSceneObjects() {
    // Draw package near delivery zone with shadow
    const pkgX = CENTER_AREA.x + CENTER_AREA.w - 110;
    const pkgY = CENTER_AREA.y + CENTER_AREA.h / 2 - 40;
    drawPackage(pkgX, pkgY, 60, 40);

    // Drone shadow
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(gameState.droneX, CENTER_AREA.y + CENTER_AREA.h - 36, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw drone at current state
    drawDrone(gameState.droneX, gameState.droneY, gameState.droneWobble);

    // Draw sparkles and animations
    for (let i = 0; i < gameState.animations.length; i++) {
      const a = gameState.animations[i];
      if (a.type === "spark") {
        const age = performance.now() - a.born;
        if (age > a.life) continue;
        const t = age / a.life;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = a.color || "#FFF59D";
        ctx.beginPath();
        ctx.arc(a.x + a.vx * t * 140, a.y + a.vy * t * 140 - t * 6, 2 + (1 - t) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPackage(x, y, w, h) {
    ctx.save();
    // box shadow
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    roundRect(ctx, x + 4, y + h - 4, w, 6, 3);
    ctx.fill();
    // box
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, "#FFF1E0");
    grad.addColorStop(1, "#FFDAB9");
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = "#CC9966";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // ribbon
    ctx.fillStyle = "#FF6F61";
    roundRect(ctx, x + w / 2 - 5, y + 4, 10, h - 8, 2);
    ctx.fill();
    ctx.fillRect(x + 6, y + h / 2 - 4, w - 12, 8);
    ctx.restore();
  }

  function drawDrone(x, y, wobble) {
    ctx.save();
    ctx.translate(x, y);
    // small tilt
    ctx.rotate(Math.sin((performance.now() + x) / 700) * 0.02 - wobble * 0.02);

    // body shadow
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    roundRect(ctx, -34, -10, 68, 24, 10);
    ctx.fill();

    // body with glossy gradient
    const bodyGrad = ctx.createLinearGradient(-36, -20, 36, 20);
    bodyGrad.addColorStop(0, "#6CCFF6");
    bodyGrad.addColorStop(1, "#3EA8D7");
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, -36, -18, 72, 36, 10);
    ctx.fill();

    // canopy highlight
    ctx.beginPath();
    ctx.ellipse(0, -8, 26, 10, 0, Math.PI, 0);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fill();

    // face: friendly eyes with little pupils
    ctx.fillStyle = "#052A3A";
    ctx.beginPath();
    ctx.arc(-12, -2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, -2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // pupils
    ctx.fillStyle = "#052A3A";
    ctx.beginPath();
    ctx.arc(-11, -2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(13, -2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // propellers with motion blur
    drawProp(-34, -18, wobble, 12, 1);
    drawProp(34, -18, wobble, 12, -1);
    drawProp(-34, 18, wobble, 12, 1);
    drawProp(34, 18, wobble, 12, -1);

    // legs
    ctx.strokeStyle = "#073B4C";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 18);
    ctx.lineTo(-22, 28);
    ctx.moveTo(14, 18);
    ctx.lineTo(22, 28);
    ctx.stroke();

    // little antenna
    ctx.strokeStyle = "#052A3A";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, -30);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -32, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#FFD54F";
    ctx.fill();

    ctx.restore();
  }

  // Draw propeller with consistent spin and subtle blur
  function drawProp(cx, cy, wobble, r, dir) {
    ctx.save();
    ctx.translate(cx, cy);
    const time = performance.now() / 80;
    const spin = time * (dir * 1.6);
    ctx.rotate(spin);
    // feathered blade
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(0.6);
      ctx.fillStyle = `rgba(246,248,255,${0.7 - i * 0.18})`;
      ctx.beginPath();
      ctx.ellipse(
        0,
        -r * 0.3 - i * 0.6,
        r * (1 + wobble * 0.4) * (1 - i * 0.18),
        r / 3,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawProblemArea() {
    // Problem text centered in the play area
    const probText = `${gameState.currentProblem.a} ${gameState.currentProblem.op} ${gameState.currentProblem.b} = ?`;
    ctx.font = `700 32px ${FONT_FAMILY}`;
    const pw = measureText(probText, 32, "700");
    const px = CENTER_AREA.x + (CENTER_AREA.w - pw) / 2;
    const py = CENTER_AREA.y + 60;
    // background box with subtle shadow
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, px - 18, py - 40, pw + 36, 64, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(5,42,58,0.04)";
    ctx.stroke();

    ctx.fillStyle = "#052A3A";
    ctx.fillText(probText, px, py);

    // Input box
    const inputW = 160;
    const inputH = 44;
    const ix = CENTER_AREA.x + (CENTER_AREA.w - inputW) / 2;
    const iy = py + 36;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundRect(ctx, ix, iy, inputW, inputH, 10);
    ctx.fill();
    ctx.strokeStyle = "#E1F5FE";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Text inside input
    ctx.font = `400 20px ${FONT_FAMILY}`;
    ctx.fillStyle = "#073B4C";
    const inputDisplay = gameState.inputText.length ? gameState.inputText : "Type answer...";
    ctx.fillText(inputDisplay, ix + 12, iy + 28);

    // OK button to the right with shadow
    const okW = 80;
    const okH = inputH;
    const okx = ix + inputW + 12;
    const oky = iy;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#66D2A1";
    roundRect(ctx, okx, oky, okW, okH, 10);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#05386B";
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillText(
      "OK",
      okx + okW / 2 - measureText("OK", 18, "700") / 2,
      oky + 28
    );
    regions.okButton = { x: okx, y: oky, w: okW, h: okH };

    // Message under input (wrapped if necessary)
    ctx.font = `16px ${FONT_FAMILY}`;
    ctx.fillStyle = "#073B4C";
    const msg = gameState.message;
    const maxWidth = CENTER_AREA.w - 40;
    drawWrappedText(msg, CENTER_AREA.x + 20, iy + inputH + 22, maxWidth, 18);

    // Draw keypad below for children assistance
    drawKeypad(ix, iy + inputH + 46);
  }

  // Draw wrapped text with simple line breaks
  function drawWrappedText(text, x, y, maxW, lineH) {
    const words = text.split(" ");
    let line = "";
    let curY = y;
    ctx.font = `16px ${FONT_FAMILY}`;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxW && n > 0) {
        ctx.fillText(line.trim(), x, curY);
        line = words[n] + " ";
        curY += lineH;
      } else {
        line = testLine;
      }
    }
    if (line) ctx.fillText(line.trim(), x, curY);
  }

  function drawKeypad(x, y) {
    const btnW = 56;
    const btnH = 44;
    const gap = 10;
    ctx.font = `600 18px ${FONT_FAMILY}`;
    regions.keypadButtons = [];
    const numbers = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["←", "0", "↵"],
    ];
    for (let r = 0; r < numbers.length; r++) {
      for (let c = 0; c < numbers[r].length; c++) {
        const bx = x + c * (btnW + gap);
        const by = y + r * (btnH + gap);
        ctx.fillStyle = "rgba(255,255,255,0.96)";
        roundRect(ctx, bx, by, btnW, btnH, 8);
        ctx.fill();
        ctx.strokeStyle = "#EAF6FF";
        ctx.stroke();
        ctx.fillStyle = "#075985";
        const label = numbers[r][c];
        ctx.fillText(label, bx + (btnW - measureText(label, 18)) / 2, by + 28);
        regions.keypadButtons.push({ x: bx, y: by, w: btnW, h: btnH, value: numbers[r][c] });
      }
    }
  }

  function drawBottomInstructions() {
    const instrLines = [
      "Controls: Type digits, Backspace to delete, Enter/OK to submit.",
      "Keyboard: S = sound, R = restart after game ends.",
      "Goal: Deliver 10 packages. Fail after 3 wrong answers.",
    ];
    ctx.font = `14px ${FONT_FAMILY}`;
    const lineHeight = 20;
    const totalH = instrLines.length * lineHeight;
    let startY = HEIGHT - BOTTOM_UI_HEIGHT + (BOTTOM_UI_HEIGHT - totalH) / 2;
    for (let i = 0; i < instrLines.length; i++) {
      const txt = instrLines[i];
      const tw = measureText(txt, 14);
      const tx = (WIDTH - tw) / 2;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      roundRect(ctx, tx - 10, startY - 14, tw + 20, lineHeight + 6, 8);
      ctx.fill();
      ctx.fillStyle = "#052A3A";
      ctx.fillText(txt, tx, startY + lineHeight - 6);
      startY += lineHeight;
    }
  }

  function drawEndScreen() {
    // translucent overlay
    ctx.fillStyle = "rgba(5,42,58,0.55)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // central card
    const cardW = 520;
    const cardH = 260;
    const cx = (WIDTH - cardW) / 2;
    const cy = (HEIGHT - cardH) / 2;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundRect(ctx, cx, cy, cardW, cardH, 12);
    ctx.fill();
    ctx.restore();

    // title
    ctx.font = `bold 28px ${FONT_FAMILY}`;
    ctx.fillStyle = "#052A3A";
    const title = gameState.endState === "win" ? "Victory!" : "Game Over";
    ctx.fillText(title, cx + (cardW - measureText(title, 28, "bold")) / 2, cy + 54);

    // message
    ctx.font = `16px ${FONT_FAMILY}`;
    ctx.fillStyle = "#073B4C";
    const msg = gameState.message;
    ctx.fillText(msg, cx + (cardW - measureText(msg, 16)) / 2, cy + 92);

    // score summary
    const summary = `Delivered: ${gameState.correctCount}. Mistakes: ${gameState.wrongCount}.`;
    ctx.fillText(summary, cx + (cardW - measureText(summary, 16)) / 2, cy + 124);

    // restart button
    const btnW = 160;
    const btnH = 44;
    const bx = cx + (cardW - btnW) / 2;
    const by = cy + cardH - 84;
    ctx.fillStyle = "#66D2A1";
    roundRect(ctx, bx, by, btnW, btnH, 10);
    ctx.fill();
    ctx.fillStyle = "#05386B";
    ctx.font = `700 18px ${FONT_FAMILY}`;
    const label = "Restart (R)";
    ctx.fillText(label, bx + (btnW - measureText(label, 18, "700")) / 2, by + 28);
    regions.restartButton = { x: bx, y: by, w: btnW, h: btnH };
  }

  // Draw confetti particles
  function drawConfetti() {
    const now = performance.now();
    for (let i = gameState.confetti.length - 1; i >= 0; i--) {
      const p = gameState.confetti[i];
      const age = now - p.born;
      if (age > p.life) {
        gameState.confetti.splice(i, 1);
        continue;
      }
      const t = age / p.life;
      p.vy += 0.04; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrota;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = 1 - t * 0.8;
      ctx.fillStyle = p.color;
      ctx.fillRect(-4, -6, 8, 12);
      ctx.restore();
    }
  }

  // Input handling
  canvas.addEventListener("keydown", (e) => {
    if (!e.key) return;
    // allow number keys, backspace, enter, s, r
    if (e.key >= "0" && e.key <= "9") {
      if (!gameState.running && gameState.endState) return;
      if (gameState.inputText.length < 6) {
        gameState.inputText += e.key;
        playClick();
      }
      e.preventDefault();
    } else if (e.key === "Backspace") {
      gameState.inputText = gameState.inputText.slice(0, -1);
      playClick();
      e.preventDefault();
    } else if (e.key === "Enter") {
      submitAnswer();
      e.preventDefault();
    } else if (e.key.toLowerCase() === "s") {
      setSoundEnabled(!gameState.soundEnabled);
      playClick();
      e.preventDefault();
    } else if (e.key.toLowerCase() === "r") {
      if (!gameState.running && gameState.endState) {
        resetGame();
        playClick();
      } else {
        resetGame();
        playClick();
      }
    } else if (e.key === "-" || e.key === "+") {
      if (gameState.inputText.length === 0) {
        gameState.inputText = e.key;
        playClick();
      }
    }
  });

  // Mouse / pointer input
  canvas.addEventListener("click", function (ev) {
    const rect = canvas.getBoundingClientRect();
    const mx = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const my = (ev.clientY - rect.top) * (canvas.height / rect.height);
    if (regions.soundToggle && pointInRect(mx, my, regions.soundToggle)) {
      setSoundEnabled(!gameState.soundEnabled);
      playClick();
      return;
    }
    if (regions.okButton && pointInRect(mx, my, regions.okButton)) {
      submitAnswer();
      playClick();
      return;
    }
    for (const b of regions.keypadButtons) {
      if (pointInRect(mx, my, b)) {
        if (b.value === "←") {
          gameState.inputText = gameState.inputText.slice(0, -1);
        } else if (b.value === "↵") {
          submitAnswer();
        } else {
          if (gameState.inputText.length < 6) gameState.inputText += b.value;
        }
        playClick();
        return;
      }
    }
    if (regions.restartButton && pointInRect(mx, my, regions.restartButton)) {
      resetGame();
      playClick();
      return;
    }
    canvas.focus();
    if (ensureAudio()) startBackgroundHum();
  });

  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // Input accessibility: display audio error message if audio blocked
  function drawAudioErrorInfo() {
    if (!audioCtx && gameState.audioError) {
      ctx.font = `14px ${FONT_FAMILY}`;
      const msg = "Audio not available: " + gameState.audioError;
      const w = measureText(msg, 14);
      const x = WIDTH - w - 12;
      const y = HEIGHT - 20;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      roundRect(ctx, x - 8, y - 16, w + 16, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#4A4A4A";
      ctx.fillText(msg, x, y);
    }
  }

  // Main update loop
  function gameLoopResetTime() {
    gameState.lastTick = performance.now();
  }

  function update(dt) {
    if (gameState.running) {
      gameState.timeSinceLastCorrect += dt;
      const now = performance.now();

      for (let i = gameState.animations.length - 1; i >= 0; i--) {
        const a = gameState.animations[i];
        if (a.type === "deliver") {
          const elapsed = now - a.startTime;
          if (a.phase === "going") {
            const t = Math.min(1, elapsed / a.duration);
            const ease = 1 - Math.pow(1 - t, 3);
            gameState.droneX = a.startX + (a.targetX - a.startX) * ease;
            gameState.droneWobble = (1 - t) * 0.6;
            if (t >= 1) {
              spawnSparkles(a.targetX + 40, gameState.droneY - 30, 12);
              a.phase = "returning";
              a.returnStart = now + 120;
            }
          } else if (a.phase === "returning") {
            const t2 = Math.min(1, (now - a.returnStart) / a.returnDuration);
            const ease2 = t2 < 0 ? 0 : 1 - Math.pow(1 - t2, 3);
            gameState.droneX = a.targetX - (a.targetX - a.startX) * ease2;
            gameState.droneWobble = Math.max(0, 0.6 * (1 - t2));
            if (t2 >= 1) {
              a.done = true;
              gameState.animations.splice(i, 1);
              gameState.currentProblem = makeProblem(gameState.correctCount);
            }
          }
        }
      }

      // remove finished sparks automatically
      for (let i = gameState.animations.length - 1; i >= 0; i--) {
        if (gameState.animations[i].done) {
          gameState.animations.splice(i, 1);
        }
      }
    } else {
      gameState.droneWobble *= 0.96;
    }

    // Update drone vertical bobbing
    const bob = Math.sin((performance.now() / 600) + gameState.droneX / 90) * 6;
    gameState.droneY = CENTER_AREA.y + CENTER_AREA.h / 2 + bob;

    // Update confetti velocities over time handled in drawConfetti
  }

  // Main animation frame
  function frame(now) {
    if (!gameState.lastTick) gameState.lastTick = now;
    const dt = now - gameState.lastTick;
    gameState.lastTick = now;
    try {
      update(dt);
      render();
      drawAudioErrorInfo();
    } catch (e) {
      console.error("Render/update error", e);
      return;
    }
    requestAnimationFrame(frame);
  }

  // Initialize
  canvas.style.outline = "none";
  canvas.focus();
  resetGame();
  if (ensureAudio()) startBackgroundHum();
  requestAnimationFrame(frame);

  // Expose debug object
  window._droneMathGame = {
    state: gameState,
    reset: resetGame,
  };

  // Proper error handling: all audio creation wrapped in try/catch and audioCtx creation handled.

})();