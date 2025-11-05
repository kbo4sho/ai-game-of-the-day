(function () {
  // Drone Math Collector - Enhanced Visuals & Audio
  // NOTE: Game mechanics unchanged; visuals and audio improved.
  // All graphics via Canvas; all sounds generated with Web Audio API.
  // Renders inside element with id "game-of-the-day-stage"

  // ------------------------------
  // Constants and Initialization
  // ------------------------------
  const CONTAINER_ID = "game-of-the-day-stage";
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL_CORRECT = 10;
  const MAX_WRONG = 3;
  const PACKAGE_SPAWN_INTERVAL = 1400; // ms
  const PACKAGE_SPEED_MIN = 0.4;
  const PACKAGE_SPEED_MAX = 1.2;

  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error(`Container element with id "${CONTAINER_ID}" not found.`);
    return;
  }

  // Ensure container is clean and focusable
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.width = WIDTH + "px";
  container.style.height = HEIGHT + "px";
  container.setAttribute("tabindex", "0");

  // Accessible live region
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  container.appendChild(liveRegion);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Drone math game. Move with arrow keys or WASD. Press space to pick packages."
  );
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("2D context unavailable.");
    return;
  }

  // Utility functions
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (min, max) => min + Math.random() * (max - min);
  const nowMs = () => performance.now();

  // ------------------------------
  // Audio Setup with Error Handling
  // ------------------------------
  let audioCtx = null;
  let audioEnabled = true;
  let ambientNodes = null;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    // Build a gentle ambient pad using two oscillators and a slow LFO-driven filter
    function startAmbient() {
      if (!audioCtx) return null;
      try {
        const master = audioCtx.createGain();
        master.gain.value = 0.022; // subtle overall volume
        master.connect(audioCtx.destination);

        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        osc1.type = "sine";
        osc2.type = "triangle";
        osc1.frequency.value = 110;
        osc2.frequency.value = 220;

        // gentle detune
        osc2.detune.value = 6;

        const filter = audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 900;

        // slow LFO to modulate filter cutoff for organic motion
        const lfo = audioCtx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.05; // very slow
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 200;
        lfo.connect(lfoGain).connect(filter.frequency);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(master);

        osc1.start();
        osc2.start();
        lfo.start();

        return { master, osc1, osc2, filter, lfo, lfoGain };
      } catch (err) {
        console.warn("Ambient audio creation failed:", err);
        return null;
      }
    }

    ambientNodes = startAmbient();
  } catch (e) {
    console.warn("AudioContext unavailable:", e);
    audioCtx = null;
    audioEnabled = false;
  }

  // Create short, friendly sounds using Web Audio API
  function safeAudioAction(fn) {
    if (!audioEnabled || !audioCtx) return;
    try {
      fn();
    } catch (err) {
      console.warn("Audio action failed:", err);
    }
  }

  // Correct pickup sound: bright bell + soft whoosh
  function playCorrectSound() {
    safeAudioAction(() => {
      const t0 = audioCtx.currentTime;
      const bell = audioCtx.createOscillator();
      bell.type = "sine";
      bell.frequency.setValueAtTime(880, t0);
      bell.frequency.exponentialRampToValueAtTime(660, t0 + 0.35);

      const bellGain = audioCtx.createGain();
      bellGain.gain.setValueAtTime(0.0001, t0);
      bellGain.gain.linearRampToValueAtTime(0.12, t0 + 0.01);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);

      // small high shimmer
      const shimmer = audioCtx.createOscillator();
      shimmer.type = "triangle";
      shimmer.frequency.setValueAtTime(1400, t0);
      shimmer.frequency.exponentialRampToValueAtTime(2200, t0 + 0.18);
      const shimmerGain = audioCtx.createGain();
      shimmerGain.gain.setValueAtTime(0.0001, t0);
      shimmerGain.gain.linearRampToValueAtTime(0.04, t0 + 0.01);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);

      // warm resonant filter
      const f = audioCtx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 6;
      f.frequency.value = 900;

      bell.connect(f).connect(bellGain).connect(audioCtx.destination);
      shimmer.connect(shimmerGain).connect(audioCtx.destination);

      bell.start(t0);
      shimmer.start(t0);
      bell.stop(t0 + 1.05);
      shimmer.stop(t0 + 0.48);
    });
  }

  // Wrong sound: soft thud + low descending
  function playWrongSound() {
    safeAudioAction(() => {
      const t0 = audioCtx.currentTime;
      const thud = audioCtx.createOscillator();
      thud.type = "square";
      thud.frequency.setValueAtTime(220, t0);
      thud.frequency.exponentialRampToValueAtTime(80, t0 + 0.35);

      const thudGain = audioCtx.createGain();
      thudGain.gain.setValueAtTime(0.0001, t0);
      thudGain.gain.linearRampToValueAtTime(0.08, t0 + 0.01);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);

      // subtle low filter for body
      const f = audioCtx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 900;

      thud.connect(f).connect(thudGain).connect(audioCtx.destination);

      thud.start(t0);
      thud.stop(t0 + 0.9);
    });
  }

  // Spawn sound: small bell pluck
  function playSpawnSound() {
    safeAudioAction(() => {
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(520, t0);
      o.frequency.exponentialRampToValueAtTime(420, t0 + 0.18);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.045, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + 0.46);
    });
  }

  // Toggle audio on/off (gracefully handle suspend/resume)
  function toggleAudio() {
    if (!audioCtx) {
      audioEnabled = false;
      return;
    }
    // prefer to toggle by muting ambient and setting audioEnabled
    audioEnabled = !audioEnabled;
    if (ambientNodes && ambientNodes.master) {
      ambientNodes.master.gain.value = audioEnabled ? 0.022 : 0.00001;
    }
    announce(audioEnabled ? "Audio on" : "Audio off");
    // If audio was suspended, try resume when enabling
    if (audioEnabled && audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => console.warn("Audio resume failed:", e));
    }
  }

  // ------------------------------
  // Game State
  // ------------------------------
  let lastTime = nowMs();
  let spawnTimer = 0;
  let packages = [];
  let keys = {};
  let mouse = { x: 0, y: 0, down: false };
  let gameState = "playing"; // 'playing', 'victory', 'gameover'
  let correctCount = 0;
  let wrongCount = 0;
  let currentQuestion = null;
  let accessibleMessage = "";

  const drone = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    radius: 26,
    vx: 0,
    vy: 0,
    speed: 2.2,
    propellerAngle: 0
  };

  // Color palette (calming)
  const BG_TOP = "#DFF6FF";
  const BG_BOTTOM = "#EAF9F1";
  const MOUNTAIN_COLOR = "#CFEFF2";
  const HILL_COLOR = "#BEE6C9";
  const CLOUD_COLOR = "rgba(255,255,255,0.95)";
  const PACKAGE_COLORS = ["#FFD6A5", "#BDE0FE", "#CDEAC0", "#F6C2D7"];
  const DRONE_COLOR = "#6C6CE5";
  const DRONE_ACCENT = "#F6F8FF";
  const TEXT_COLOR = "#123456";
  const UI_BG = "rgba(255,255,255,0.9)";

  // ------------------------------
  // Math Question Generation (unchanged)
  // ------------------------------
  function generateQuestion() {
    const types = ["add", "sub", "add", "add", "mul"];
    const t = types[Math.floor(Math.random() * types.length)];
    let a, b, answer, text;
    if (t === "add") {
      a = Math.floor(Math.random() * 11);
      b = Math.floor(Math.random() * 11);
      answer = a + b;
      text = `${a} + ${b} = ?`;
    } else if (t === "sub") {
      a = Math.floor(Math.random() * 11) + 5;
      b = Math.floor(Math.random() * 6);
      answer = a - b;
      text = `${a} - ${b} = ?`;
    } else {
      a = Math.floor(Math.random() * 5) + 2;
      b = Math.floor(Math.random() * 5) + 2;
      answer = a * b;
      text = `${a} × ${b} = ?`;
    }
    return { a, b, answer, text, type: t };
  }

  function createPackagesForQuestion(question) {
    const correct = question.answer;
    const wrongs = new Set();
    while (wrongs.size < 2) {
      let candidate;
      if (Math.random() < 0.5) {
        candidate = correct + (Math.floor(Math.random() * 5) - 2);
      } else {
        candidate = Math.max(
          0,
          correct + (Math.random() < 0.5 ? -3 : 3) + Math.floor(Math.random() * 3)
        );
      }
      if (candidate !== correct && candidate >= 0 && candidate <= 100) wrongs.add(candidate);
    }
    const answers = shuffleArray([correct, ...Array.from(wrongs)]);
    const margin = 60;
    const step = (WIDTH - margin * 2) / (answers.length - 1);
    const list = answers.map((ans, i) => {
      return {
        id: Math.random().toString(36).slice(2, 9),
        x: margin + step * i,
        y: -30 - Math.random() * 80,
        w: 82,
        h: 54,
        vx: (Math.random() - 0.5) * 0.2,
        vy: PACKAGE_SPEED_MIN + Math.random() * (PACKAGE_SPEED_MAX - PACKAGE_SPEED_MIN),
        value: ans,
        color: PACKAGE_COLORS[i % PACKAGE_COLORS.length],
        alive: true,
        rotation: (Math.random() - 0.5) * 0.06,
        bobPhase: Math.random() * Math.PI * 2
      };
    });
    return list;
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function newQuestion() {
    currentQuestion = generateQuestion();
    packages = createPackagesForQuestion(currentQuestion);
    announce(`New question: ${currentQuestion.text}`);
  }

  function announce(text) {
    accessibleMessage = text;
    liveRegion.textContent = text;
  }

  // ------------------------------
  // Input Handling (unchanged behavior)
  // ------------------------------
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;

    if (e.key.toLowerCase() === "r") {
      if (gameState === "victory" || gameState === "gameover") {
        restartGame();
      } else {
        restartGame();
      }
    }

    if (e.key === " " || e.key === "Spacebar") {
      if (gameState === "playing") {
        pickOverlappingPackage();
      }
      e.preventDefault();
    }

    if (["1", "2", "3"].includes(e.key) && gameState === "playing") {
      const idx = parseInt(e.key, 10) - 1;
      if (packages[idx]) {
        pickPackage(packages[idx]);
      }
    }

    if (e.key.toLowerCase() === "m") {
      toggleAudio();
      announce(audioEnabled ? "Audio on" : "Audio off");
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
    mouse.down = true;
    const p = packages.find((pck) => {
      return (
        mouse.x >= pck.x - pck.w / 2 &&
        mouse.x <= pck.x + pck.w / 2 &&
        mouse.y >= pck.y - pck.h / 2 &&
        mouse.y <= pck.y + pck.h / 2
      );
    });
    if (p && gameState === "playing") {
      pickPackage(p);
    }

    if ((gameState === "victory" || gameState === "gameover") && restartButtonRect) {
      const r = restartButtonRect;
      if (
        mouse.x >= r.x &&
        mouse.x <= r.x + r.w &&
        mouse.y >= r.y &&
        mouse.y <= r.y + r.h
      ) {
        restartGame();
      }
    }
  });

  canvas.addEventListener("mouseup", () => {
    mouse.down = false;
  });

  // ------------------------------
  // Collision and Picking (unchanged behavior)
  // ------------------------------
  function pickOverlappingPackage() {
    const collided = packages.find((p) => circleRectCollision(drone.x, drone.y, drone.radius, p));
    if (collided) {
      pickPackage(collided);
    } else {
      announce("No package in reach. Fly closer to a package and press space.");
    }
  }

  function circleRectCollision(cx, cy, r, rect) {
    const rx = rect.x - rect.w / 2;
    const ry = rect.y - rect.h / 2;
    const closestX = clamp(cx, rx, rx + rect.w);
    const closestY = clamp(cy, ry, ry + rect.h);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= r * r;
  }

  function pickPackage(p) {
    if (!p || !p.alive) return;
    p.alive = false;
    if (p.value === currentQuestion.answer) {
      correctCount++;
      playCorrectSound();
      announce(
        `Correct! ${currentQuestion.text} Answer: ${currentQuestion.answer}. ${correctCount} correct collected.`
      );
      if (correctCount >= GOAL_CORRECT) {
        gameState = "victory";
        announce(`You collected ${GOAL_CORRECT} correct packages! Victory! Press R to restart.`);
      } else {
        setTimeout(newQuestion, 700);
      }
    } else {
      wrongCount++;
      playWrongSound();
      announce(`Oops! That was ${p.value}. Wrong answers: ${wrongCount} out of ${MAX_WRONG}.`);
      if (wrongCount >= MAX_WRONG) {
        gameState = "gameover";
        announce(`Game over. You made ${wrongCount} incorrect picks. Press R to try again.`);
      }
    }
  }

  // ------------------------------
  // Restart
  // ------------------------------
  function restartGame() {
    correctCount = 0;
    wrongCount = 0;
    packages = [];
    gameState = "playing";
    drone.x = WIDTH / 2;
    drone.y = HEIGHT / 2;
    newQuestion();
    announce("Game restarted. " + currentQuestion.text);
  }

  // ------------------------------
  // Draw Helpers
  // ------------------------------
  function roundRect(ctxLocal, x, y, w, h, r, fill, stroke) {
    ctxLocal.beginPath();
    ctxLocal.moveTo(x + r, y);
    ctxLocal.arcTo(x + w, y, x + w, y + h, r);
    ctxLocal.arcTo(x + w, y + h, x, y + h, r);
    ctxLocal.arcTo(x, y + h, x, y, r);
    ctxLocal.arcTo(x, y, x + w, y, r);
    ctxLocal.closePath();
    if (fill) ctxLocal.fill();
    if (stroke) ctxLocal.stroke();
  }

  function measureTextSize(text, font = "16px sans-serif") {
    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const w = metrics.width;
    ctx.restore();
    return w;
  }

  // ------------------------------
  // Visual Elements
  // ------------------------------
  // subtle motes for ambiance
  const motes = new Array(28).fill(0).map(() => ({
    x: Math.random() * WIDTH,
    y: Math.random() * HEIGHT,
    r: Math.random() * 1.8 + 0.6,
    vx: (Math.random() - 0.5) * 0.06,
    vy: (Math.random() - 0.5) * 0.06,
    alpha: Math.random() * 0.5 + 0.12
  }));

  function drawBackground(delta) {
    // Gradient sky
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, BG_TOP);
    grad.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Sun (soft glow)
    const sunX = 80 + Math.sin(performance.now() / 7000) * 20;
    const sunY = 72;
    const sunR = 42;
    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.2);
    g.addColorStop(0, "rgba(255,245,200,0.95)");
    g.addColorStop(0.4, "rgba(255,245,200,0.45)");
    g.addColorStop(1, "rgba(255,245,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Distant mountains layer
    drawMountains(performance.now() / 1400, 0.15, 60, MOUNTAIN_COLOR);
    drawMountains(performance.now() / 900, 0.25, 30, HILL_COLOR);

    // Moving clouds (gentle)
    const t = performance.now() / 1000;
    drawCloud(WIDTH * 0.18 + Math.sin(t * 0.28) * 40, 82, 70, 0.98);
    drawCloud(WIDTH * 0.72 + Math.cos(t * 0.22) * 50, 120, 52, 0.9);
    drawCloud(WIDTH * 0.45 + Math.sin(t * 0.16) * 36, 50, 40, 0.95);

    // subtle motes
    ctx.save();
    for (const m of motes) {
      m.x += m.vx * delta;
      m.y += m.vy * delta;
      if (m.x < -10) m.x = WIDTH + 10;
      if (m.x > WIDTH + 10) m.x = -10;
      if (m.y < -10) m.y = HEIGHT + 10;
      if (m.y > HEIGHT + 10) m.y = -10;
      ctx.fillStyle = `rgba(255,255,255,${m.alpha})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMountains(time, parallax, heightOffset, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const offset = Math.sin(time * parallax) * 60;
    ctx.moveTo(-50 + offset, HEIGHT - 40);
    const peaks = 6;
    for (let i = 0; i <= peaks; i++) {
      const px = (i / peaks) * (WIDTH + 100) - 50;
      const py =
        HEIGHT -
        heightOffset -
        Math.abs(Math.sin((i + time * 0.6) * 0.7)) * (80 + (i % 2) * 30);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(WIDTH + 80, HEIGHT - 40);
    ctx.lineTo(WIDTH + 80, HEIGHT);
    ctx.lineTo(-80, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCloud(cx, cy, size, alpha = 1) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx - size * 0.5, cy, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + size * 0.2, cy - size * 0.08, size * 0.7, size * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + size * 0.7, cy, size * 0.5, size * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw drone with more visual detail
  function drawDrone() {
    const bob = Math.sin(performance.now() / 220) * 2;
    ctx.save();
    ctx.translate(drone.x, drone.y + bob);

    // Shadow
    ctx.fillStyle = "rgba(20,40,60,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 42, 48, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = DRONE_COLOR;
    roundRect(ctx, -34, -18, 68, 36, 10, true, false);

    // dome/glass
    ctx.fillStyle = DRONE_ACCENT;
    ctx.beginPath();
    ctx.ellipse(0, -8, 18, 10, 0, Math.PI, 2 * Math.PI);
    ctx.fill();

    // arms
    ctx.fillStyle = "rgba(30,34,80,0.9)";
    roundRect(ctx, -48, -6, 14, 6, 3, true, false);
    roundRect(ctx, 34, -6, 14, 6, 3, true, false);

    // propeller rotors with motion blur arcs
    const pa = drone.propellerAngle;
    ctx.save();
    ctx.translate(-41, -8);
    // rotation blur
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 8, pa * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(41, -8);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 8, -pa * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // propeller hubs
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(-41, -8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(41, -8, 6, 0, Math.PI * 2);
    ctx.fill();

    // face detail
    ctx.fillStyle = "#0B2942";
    ctx.beginPath();
    ctx.arc(-8, -2, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, -2, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // engine glow when moving
    const movingStrength = (Math.abs(drone.vx) + Math.abs(drone.vy)) / 4;
    if (movingStrength > 0.02) {
      const glow = ctx.createRadialGradient(0, 18, 2, 0, 18, 26);
      glow.addColorStop(0, `rgba(108,108,229,${0.18 * movingStrength})`);
      glow.addColorStop(1, `rgba(108,108,229,0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 18, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // update propeller angle
    drone.propellerAngle += 0.18 + Math.abs(drone.vx) * 0.02 + Math.abs(drone.vy) * 0.02;
  }

  // Draw package with ribbon and subtle animation
  function drawPackages(delta) {
    packages.forEach((p) => {
      if (!p.alive) return;
      // update position
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.vx += (Math.random() - 0.5) * 0.01;
      p.vx = clamp(p.vx, -0.6, 0.6);
      p.bobPhase += 0.06 * delta;

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + p.h / 2 + 6, p.w * 0.42, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // subtle tilt animation
      const tilt = Math.sin(p.bobPhase) * 0.04 + p.rotation;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(tilt);

      // package body
      ctx.fillStyle = p.color;
      roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 8, true, false);

      // top flap shading
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.18);

      // ribbon
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      roundRect(ctx, -p.w / 2 + 8, -10, p.w - 16, 20, 6, true, false);

      // small ribbon vertical stripe
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(-6, -p.h / 2 + 6, 12, p.h - 12);

      // value text
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(p.value), 0, 0);

      ctx.restore();

      // respawn if below screen
      if (p.y - p.h / 2 > HEIGHT + 40) {
        p.y = -40;
        p.x = 40 + Math.random() * (WIDTH - 80);
      }
    });
  }

  // ------------------------------
  // UI Drawing
  // ------------------------------
  let restartButtonRect = null;

  function drawUI() {
    // Score (left)
    ctx.font = "20px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    const scoreText = `Correct: ${correctCount}/${GOAL_CORRECT}`;
    const scoreW = measureTextSize(scoreText, "20px sans-serif");
    const scorePad = 12;
    const scoreBox = { x: 12, y: 12, w: scoreW + scorePad * 2, h: 40 };

    ctx.fillStyle = UI_BG;
    roundRect(ctx, scoreBox.x, scoreBox.y, scoreBox.w, scoreBox.h, 10, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(scoreText, scoreBox.x + scorePad, scoreBox.y + scoreBox.h / 2);

    // Lives (right)
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrongCount)}`;
    const livesW = measureTextSize(livesText, "20px sans-serif");
    const livesPad = 12;
    const livesBox = {
      x: WIDTH - livesW - livesPad * 2 - 12,
      y: 12,
      w: livesW + livesPad * 2,
      h: 40
    };
    ctx.fillStyle = UI_BG;
    roundRect(ctx, livesBox.x, livesBox.y, livesBox.w, livesBox.h, 10, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(livesText, livesBox.x + livesPad, livesBox.y + livesBox.h / 2);

    // Audio center-top
    const audioText = audioEnabled ? "Audio: On (M)" : "Audio: Off (M)";
    ctx.font = "16px sans-serif";
    const audioW = measureTextSize(audioText, "16px sans-serif");
    const audioPad = 8;
    let audioX = Math.floor((WIDTH - audioW - audioPad * 2) / 2);
    const audioBox = { x: audioX, y: 14, w: audioW + audioPad * 2, h: 34 };

    // Ensure spacing
    if (audioBox.x - (scoreBox.x + scoreBox.w) < 12) {
      audioBox.x = scoreBox.x + scoreBox.w + 12;
    }
    if (livesBox.x - (audioBox.x + audioBox.w) < 12) {
      audioBox.x = livesBox.x - audioBox.w - 12;
    }
    ctx.fillStyle = UI_BG;
    roundRect(ctx, audioBox.x, audioBox.y, audioBox.w, audioBox.h, 8, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(audioText, audioBox.x + audioPad, audioBox.y + audioBox.h / 2);

    // Current question center-top below audio
    ctx.font = "22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const qText = currentQuestion ? currentQuestion.text : "";
    const qW = measureTextSize(qText, "22px sans-serif");
    const qPad = 14;
    const qBox = {
      x: Math.floor((WIDTH - qW - qPad * 2) / 2),
      y: audioBox.y + audioBox.h + 10,
      w: qW + qPad * 2,
      h: 44
    };
    ctx.fillStyle = UI_BG;
    roundRect(ctx, qBox.x, qBox.y, qBox.w, qBox.h, 10, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(qText, qBox.x + qBox.w / 2, qBox.y + 10);

    // Instructions bottom block
    const instructions = [
      "Controls: Arrow keys or WASD to fly. Space to pick up a package.",
      "You can also click or press 1/2/3 to pick the left/middle/right package.",
      `Goal: Collect ${GOAL_CORRECT} correct packages. Wrong picks allowed: ${MAX_WRONG}.`,
      "Press M to toggle audio. Press R to restart."
    ];
    ctx.font = "15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const lineHeight = 20;
    const maxLineWidth = WIDTH - 44;
    let maxW = 0;
    instructions.forEach((line) => {
      const w = Math.min(measureTextSize(line, "15px sans-serif"), maxLineWidth);
      if (w > maxW) maxW = w;
    });
    const instrW = maxW + 26;
    const instrH = instructions.length * lineHeight + 18;
    const instrX = Math.floor((WIDTH - instrW) / 2);
    const instrY = HEIGHT - instrH - 12;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundRect(ctx, instrX, instrY, instrW, instrH, 12, true, false);
    ctx.fillStyle = TEXT_COLOR;
    instructions.forEach((line, idx) => {
      ctx.fillText(line, WIDTH / 2, instrY + 10 + idx * lineHeight);
    });
  }

  // ------------------------------
  // End Screens (visual refresh)
  // ------------------------------
  function drawEndScreen() {
    ctx.save();
    // subtle dark overlay
    ctx.fillStyle = "rgba(6,10,20,0.46)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // central panel with soft shadow
    const panelW = 520;
    const panelH = 260;
    const panelX = (WIDTH - panelW) / 2;
    const panelY = (HEIGHT - panelH) / 2;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, panelX, panelY, panelW, panelH, 12, true, false);
    ctx.shadowBlur = 0;

    // Title and message
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    if (gameState === "victory") {
      ctx.fillText("🎉 Victory! 🎉", panelX + panelW / 2, panelY + 18);
      ctx.font = "20px sans-serif";
      ctx.fillText(
        `You collected ${correctCount} correct packages!`,
        panelX + panelW / 2,
        panelY + 62
      );
    } else {
      ctx.fillText("Game Over", panelX + panelW / 2, panelY + 18);
      ctx.font = "20px sans-serif";
      ctx.fillText(
        `You made ${wrongCount} incorrect picks.`,
        panelX + panelW / 2,
        panelY + 62
      );
    }

    ctx.font = "16px sans-serif";
    ctx.fillText("Great flying! Try again to beat your best.", panelX + panelW / 2, panelY + 110);

    // Restart button
    const btnW = 180;
    const btnH = 46;
    const btnX = panelX + panelW / 2 - btnW / 2;
    const btnY = panelY + panelH - btnH - 28;
    restartButtonRect = { x: btnX, y: btnY, w: btnW, h: btnH };

    ctx.fillStyle = "#6C6CE5";
    roundRect(ctx, btnX, btnY, btnW, btnH, 8, true, false);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "18px sans-serif";
    ctx.fillText("Restart (R)", btnX + btnW / 2, btnY + 12);

    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#333";
    ctx.fillText("Or press R key", panelX + panelW / 2, btnY + btnH + 6);

    ctx.restore();
  }

  // ------------------------------
  // Game Loop and Update
  // ------------------------------
  function update(delta) {
    if (gameState !== "playing") return;

    // Drone movement
    const moveX = keys["arrowleft"] || keys["a"] ? -1 : keys["arrowright"] || keys["d"] ? 1 : 0;
    const moveY = keys["arrowup"] || keys["w"] ? -1 : keys["arrowdown"] || keys["s"] ? 1 : 0;
    drone.vx = moveX * drone.speed;
    drone.vy = moveY * drone.speed;

    drone.x += drone.vx * delta;
    drone.y += drone.vy * delta;
    drone.x = clamp(drone.x, drone.radius + 6, WIDTH - drone.radius - 6);
    drone.y = clamp(drone.y, drone.radius + 20, HEIGHT - drone.radius - 100);

    // Spawn packages occasionally if less than 3 alive
    spawnTimer += delta;
    const aliveCount = packages.filter((p) => p.alive).length;
    if (spawnTimer > PACKAGE_SPAWN_INTERVAL && aliveCount < 3) {
      spawnTimer = 0;
      const p = {
        id: Math.random().toString(36).slice(2, 9),
        x: 40 + Math.random() * (WIDTH - 80),
        y: -30,
        w: 82,
        h: 54,
        vx: (Math.random() - 0.5) * 0.4,
        vy: PACKAGE_SPEED_MIN + Math.random() * (PACKAGE_SPEED_MAX - PACKAGE_SPEED_MIN),
        value:
          Math.random() < 0.4
            ? currentQuestion.answer
            : Math.max(
                0,
                currentQuestion.answer + (Math.floor(Math.random() * 7) - 3)
              ),
        color: PACKAGE_COLORS[Math.floor(Math.random() * PACKAGE_COLORS.length)],
        alive: true,
        rotation: (Math.random() - 0.5) * 0.06,
        bobPhase: Math.random() * Math.PI * 2
      };
      packages.push(p);
      playSpawnSound();
    }

    // Check automatic collision pickup
    packages.forEach((p) => {
      if (p.alive && circleRectCollision(drone.x, drone.y, drone.radius, p)) {
        pickPackage(p);
      }
    });
  }

  function render(now) {
    const dt = now - lastTime;
    const delta = dt / 16.6667; // normalized to ~60fps
    lastTime = now;

    // Draw scene
    drawBackground(delta);
    drawPackages(delta);
    drawDrone();
    drawUI();

    // targeting indicator
    ctx.save();
    ctx.strokeStyle = "rgba(18,52,86,0.12)";
    ctx.beginPath();
    ctx.arc(drone.x, drone.y, drone.radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (gameState === "victory" || gameState === "gameover") {
      drawEndScreen();
    }

    // Update logic (after drawing for smoother input)
    update(delta);

    requestAnimationFrame(render);
  }

  // ------------------------------
  // Start Game
  // ------------------------------
  try {
    newQuestion();
    announce(
      "Welcome! Solve the math questions by picking the correct packages. Use arrow keys or WASD to fly. Press R to restart anytime."
    );
    lastTime = nowMs();
    requestAnimationFrame(render);
  } catch (e) {
    console.error("Error starting the game:", e);
    ctx.fillStyle = "#000";
    ctx.font = "18px sans-serif";
    ctx.fillText("An error occurred starting the game. Please reload.", 20, 40);
    announce("An error occurred starting the game. Please reload the page.");
  }
})();