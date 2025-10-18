(function () {
  // Drone Math Adventure — Enhanced visuals & audio
  // Game for ages 7-9. Renders inside #game-of-the-day-stage in a 720x480 canvas.
  // Uses Web Audio API for sounds. Keyboard accessible. Clear win/loss conditions.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_CORRECT = 10;
  const MAX_LIVES = 3;
  const PACKAGE_COUNT = 5;
  const DRONE_RADIUS = 22;
  const PACKAGE_SIZE = { w: 70, h: 40 };
  const UI_PADDING = 10;
  const MIN_BODY_FONT = 16;
  const IMPORTANT_FONT = 22;

  // Get container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container element #game-of-the-day-stage not found.");
    return;
  }

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // allow keyboard focus
  canvas.style.outline = "none";
  container.innerHTML = "";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Canvas 2D context unavailable.");
    return;
  }

  // Audio setup with error handling
  let audioCtx = null;
  let masterGain = null;
  let bgGain = null;
  let bgOscA = null;
  let bgOscB = null;
  let bgFilter = null;
  let bgStarted = false;
  let audioAllowed = true; // will be false if audio context creation fails
  let audioMuted = false;

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio API not supported");
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioCtx.destination);

    // Ambient background: two slow oscillators through a filter & gain
    bgGain = audioCtx.createGain();
    bgGain.gain.value = 0.05;
    bgGain.connect(masterGain);

    bgFilter = audioCtx.createBiquadFilter();
    bgFilter.type = "lowpass";
    bgFilter.frequency.value = 600;
    bgFilter.Q.value = 0.8;
    bgFilter.connect(bgGain);

    // create but do not start until user gesture (some browsers block)
    bgOscA = audioCtx.createOscillator();
    bgOscA.type = "sine";
    bgOscA.frequency.value = 120;

    bgOscB = audioCtx.createOscillator();
    // make second oscillator slightly detuned with triangle for warmth
    bgOscB.type = "triangle";
    bgOscB.frequency.value = 168;

    // route both through filter
    const bgMerger = audioCtx.createGain();
    bgMerger.gain.value = 0.8;
    bgOscA.connect(bgMerger);
    bgOscB.connect(bgMerger);
    bgMerger.connect(bgFilter);

    // LFO to gently move filter frequency for breathing effect
    try {
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.08; // very slow
      lfoGain.gain.value = 150; // variation around base
      lfo.connect(lfoGain);
      lfoGain.connect(bgFilter.frequency);
      lfo.start();
    } catch (e) {
      // non-critical; continue
    }

    try {
      // Do not call start() here to avoid requiring gesture. We'll start on first interaction.
    } catch (e) {
      // swallow
    }
  } catch (err) {
    console.warn("Audio unavailable:", err);
    audioAllowed = false;
    audioMuted = true;
  }

  // Utility: ensure audio context resumed and background started on first user gesture
  function ensureAudioStarted() {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => {
        console.warn("Audio resume failed:", e);
      });
    }
    if (!bgStarted) {
      try {
        bgOscA.start();
        bgOscB.start();
        bgStarted = true;
      } catch (e) {
        // ignore if already started or blocked
      }
    }
  }

  // Sound effects using oscillators (with error handling)
  function playSuccessChime() {
    if (!audioAllowed || audioMuted) return;
    try {
      const now = audioCtx.currentTime;
      // short harmonic chord with exponential decay
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(masterGain);

      const freqs = [880, 1100, 660];
      const oscs = freqs.map((f) => {
        const o = audioCtx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        const filt = audioCtx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 2200;
        o.connect(filt);
        filt.connect(gain);
        o.start(now);
        return o;
      });

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

      oscs.forEach((o) => {
        try {
          o.stop(now + 0.75);
        } catch (e) {}
      });
    } catch (e) {
      console.warn("playSuccessChime failed:", e);
    }
  }

  function playWrongBuzzer() {
    if (!audioAllowed || audioMuted) return;
    try {
      const now = audioCtx.currentTime;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.connect(masterGain);

      const o = audioCtx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 220;

      const f = audioCtx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 260;
      f.Q.value = 0.8;

      o.connect(f);
      f.connect(g);

      o.start(now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      o.frequency.exponentialRampToValueAtTime(80, now + 0.4);
      try {
        o.stop(now + 0.45);
      } catch (e) {}
    } catch (e) {
      console.warn("playWrongBuzzer failed:", e);
    }
  }

  // A soft "near" ping that's gentle and rate-limited
  const nearPingTimestamps = {}; // packageId -> lastTime
  function playNearPing(pkgId) {
    if (!audioAllowed || audioMuted) return;
    const now = performance.now();
    if (nearPingTimestamps[pkgId] && now - nearPingTimestamps[pkgId] < 800) return;
    nearPingTimestamps[pkgId] = now;
    try {
      const tNow = audioCtx.currentTime;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.connect(masterGain);

      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.value = 1320;

      const f = audioCtx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 2400;

      o.connect(f);
      f.connect(g);
      o.start(tNow);
      g.gain.setValueAtTime(0.0001, tNow);
      g.gain.exponentialRampToValueAtTime(0.035, tNow + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, tNow + 0.25);
      try {
        o.stop(tNow + 0.3);
      } catch (e) {}
    } catch (e) {
      console.warn("playNearPing failed:", e);
    }
  }

  // Particle system for gentle celebratory sparkles (limited)
  const particles = [];
  function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 2.4,
        vy: (Math.random() - 1.5) * 2.4,
        size: 2 + Math.random() * 3,
        life: 0.6 + Math.random() * 0.6,
        t: 0,
        color,
      });
    }
    // limit particle count
    if (particles.length > 200) particles.splice(0, particles.length - 200);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 1.2 * dt; // gravity
      if (p.t > p.life) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const alpha = 1 - p.t / p.life;
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Helper hex -> rgba
  function hexToRgba(hex, alpha = 1) {
    // Accept hex like #rrggbb or r,g,b string
    if (hex.indexOf(",") > -1) return `rgba(${hex},${alpha})`;
    if (hex[0] === "#") hex = hex.slice(1);
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Game state
  let state = "playing"; // 'playing', 'won', 'lost'
  let score = 0;
  let lives = MAX_LIVES;
  let question = null; // { a, b, op, answer }
  let packages = []; // array of package objects
  let keys = {};
  let mouse = { x: 0, y: 0 };
  let drone = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, speed: 3.5 };
  let lastTime = performance.now();

  // Restart function
  function resetGame() {
    score = 0;
    lives = MAX_LIVES;
    state = "playing";
    drone.x = WIDTH / 2;
    drone.y = HEIGHT / 2;
    drone.vx = 0;
    drone.vy = 0;
    generateQuestionAndPackages();
    ensureAudioStarted();
    // clear particles & near pings
    particles.length = 0;
    for (const k in nearPingTimestamps) delete nearPingTimestamps[k];
  }

  // Generate a simple math question (addition/subtraction, answers 0-20)
  function makeQuestion() {
    const ops = ["+", "-"];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b;
    if (op === "+") {
      a = Math.floor(Math.random() * 11); // 0..10
      b = Math.floor(Math.random() * 11); // 0..10
    } else {
      // subtraction ensure non-negative
      a = Math.floor(Math.random() * 11); // 0..10
      b = Math.floor(Math.random() * (a + 1)); // 0..a
    }
    const answer = op === "+" ? a + b : a - b;
    return { a, b, op, answer };
  }

  // Generate packages with one correct answer and others incorrect
  function generateQuestionAndPackages() {
    question = makeQuestion();
    packages = [];
    const correctValue = question.answer;
    const incorrectSet = new Set();
    // create 4 incorrect distinct values
    while (incorrectSet.size < PACKAGE_COUNT - 1) {
      let val = correctValue + (Math.floor(Math.random() * 11) - 5);
      if (val < 0 || val === correctValue || val > 20) {
        val = Math.floor(Math.random() * 21);
      }
      if (val !== correctValue) incorrectSet.add(val);
    }
    const values = [correctValue, ...Array.from(incorrectSet)];
    // Shuffle values
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    // Place packages in non-overlapping positions, top 3/4 of screen
    const margin = 40;
    for (let i = 0; i < PACKAGE_COUNT; i++) {
      const baseX = margin + i * ((WIDTH - margin * 2) / PACKAGE_COUNT);
      const x = baseX + Math.random() * 30 - 15;
      const y = 80 + Math.random() * (HEIGHT - 220);
      const vx = (Math.random() - 0.5) * 0.8;
      const vy = (Math.random() - 0.5) * 0.8;
      packages.push({
        id: i + "_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
        x,
        y,
        vx,
        vy,
        w: PACKAGE_SIZE.w,
        h: PACKAGE_SIZE.h,
        value: values[i],
        collected: false,
        wobble: Math.random() * Math.PI * 2,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  // Initialize
  generateQuestionAndPackages();

  // Controls
  window.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;
    // Start audio on any key as many browsers require gesture
    ensureAudioStarted();

    if (state !== "playing") {
      if (e.key.toLowerCase() === "r") {
        resetGame();
      }
    } else {
      // M to mute
      if (e.key.toLowerCase() === "m") {
        audioMuted = !audioMuted;
      }
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

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    // If in end state, clicking restart button will restart game
    if (state === "won" || state === "lost") {
      const btn = getRestartButtonRect();
      if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
        resetGame();
        return;
      }
    }
    // Clicking toggles audio if clicked near audio toggle
    const audioRect = getAudioTextRect();
    if (
      cx >= audioRect.x &&
      cx <= audioRect.x + audioRect.w &&
      cy >= audioRect.y &&
      cy <= audioRect.y + audioRect.h
    ) {
      audioMuted = !audioMuted;
      ensureAudioStarted();
    }
  });

  // Restart button layout
  function getRestartButtonRect() {
    const btnW = 260;
    const btnH = 48;
    return { x: WIDTH / 2 - btnW / 2, y: HEIGHT / 2 + 80, w: btnW, h: btnH };
  }

  // Audio text rect (top center)
  function getAudioTextRect() {
    ctx.font = `${MIN_BODY_FONT}px Arial`;
    const txt = audioMuted ? "Audio: Off (M)" : audioAllowed ? "Audio: On (M)" : "Audio: Unavailable";
    const m = ctx.measureText(txt);
    const w = m.width + UI_PADDING * 2;
    const h = MIN_BODY_FONT + UI_PADDING * 2;
    const x = WIDTH / 2 - w / 2;
    const y = UI_PADDING;
    return { x, y, w, h, txt };
  }

  // Draw helper: draw text with background using measureText to compute size
  function drawTextBox(text, font, x, y, align = "left", fillStyle = "#000", bgStyle = "rgba(255,255,255,0.7)", padding = UI_PADDING) {
    ctx.save();
    ctx.font = font;
    let metrics = ctx.measureText(text);
    let textWidth = metrics.width;
    const textHeight = parseInt(font, 10) || MIN_BODY_FONT;
    let boxW = textWidth + padding * 2;
    let boxH = textHeight + padding * 2;

    let drawX = x;
    if (align === "center") drawX = x - boxW / 2;
    if (align === "right") drawX = x - boxW;

    ctx.fillStyle = bgStyle;
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    roundRect(ctx, drawX, y, boxW, boxH, 8, true, false);
    ctx.fillStyle = fillStyle;
    ctx.textBaseline = "top";
    ctx.fillText(text, drawX + padding, y + padding);
    ctx.restore();
    return { x: drawX, y, w: boxW, h: boxH, textWidth, textHeight };
  }

  // Round rectangle utility
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === "undefined") r = 6;
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

  // Collision detection: circle vs rect
  function circleRectCollision(cx, cy, r, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
  }

  // Update loop
  function update(dt) {
    if (state !== "playing") {
      updateParticles(dt);
      return;
    }
    // Input handling: arrow keys or WASD
    let moveX = 0;
    let moveY = 0;
    if (keys["arrowleft"] || keys["a"]) moveX = -1;
    if (keys["arrowright"] || keys["d"]) moveX = 1;
    if (keys["arrowup"] || keys["w"]) moveY = -1;
    if (keys["arrowdown"] || keys["s"]) moveY = 1;

    // Smooth movement
    const sp = drone.speed;
    drone.vx += (moveX * sp - drone.vx) * 0.25;
    drone.vy += (moveY * sp - drone.vy) * 0.25;
    drone.x += drone.vx;
    drone.y += drone.vy;
    // Keep inside bounds
    drone.x = Math.max(DRONE_RADIUS + 2, Math.min(WIDTH - DRONE_RADIUS - 2, drone.x));
    drone.y = Math.max(DRONE_RADIUS + 2, Math.min(HEIGHT - DRONE_RADIUS - 2, drone.y));

    // Update packages positions
    for (const p of packages) {
      p.x += p.vx;
      p.y += p.vy;
      p.wobble += 0.02;
      p.pulse += 0.04;
      // bounce on edges
      if (p.x < 10) p.vx = Math.abs(p.vx) + 0.2;
      if (p.x + p.w > WIDTH - 10) p.vx = -Math.abs(p.vx) - 0.2;
      if (p.y < 60) p.vy = Math.abs(p.vy) + 0.2;
      if (p.y + p.h > HEIGHT - 80) p.vy = -Math.abs(p.vy) - 0.2;
    }

    // Collision with packages
    for (const p of packages) {
      if (p.collected) continue;
      if (circleRectCollision(drone.x, drone.y, DRONE_RADIUS, p.x, p.y, p.w, p.h)) {
        p.collected = true;
        if (p.value === question.answer) {
          // Correct
          score += 1;
          playSuccessChime();
          spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "#7be37b", 18);
          if (score >= TARGET_CORRECT) {
            state = "won";
          } else {
            // small celebration, then new question
            setTimeout(() => {
              generateQuestionAndPackages();
            }, 400);
          }
        } else {
          // Wrong
          lives -= 1;
          playWrongBuzzer();
          spawnParticles(p.x + p.w / 2, p.y + p.h / 2, "255,120,120", 12);
          if (lives <= 0) {
            state = "lost";
          } else {
            // remove wrong package and continue
            setTimeout(() => {
              // keep same question but generate a new set of packages so player has fresh try
              generateQuestionAndPackages();
            }, 400);
          }
        }
      }
    }

    // Provide "near" audio hint if drone near a correct package
    for (const p of packages) {
      if (p.collected) continue;
      if (p.value !== question.answer) continue;
      const dx = p.x + p.w / 2 - drone.x;
      const dy = p.y + p.h / 2 - drone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        playNearPing(p.id);
      }
    }

    updateParticles(dt);
  }

  // Draw loop
  function draw() {
    // clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // calming sky gradient background with soft sun
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#dff6ff");
    g.addColorStop(0.5, "#f7fbff");
    g.addColorStop(1, "#fbfff7");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle sun glow
    const sunX = WIDTH - 100;
    const sunY = 80;
    const sunR = 48;
    const rad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, sunR);
    rad.addColorStop(0, "rgba(255,242,200,0.95)");
    rad.addColorStop(0.6, "rgba(255,242,200,0.25)");
    rad.addColorStop(1, "rgba(255,242,200,0)");
    ctx.fillStyle = rad;
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

    // parallax layered soft cloud shapes
    drawSoftClouds();

    // soft ground shapes and distant shapes
    drawWackyBackground();

    // Draw packages (below drone sometimes) — keep z-order nice: packages first
    for (const p of packages) {
      drawPackage(p);
    }

    // Draw drone
    drawDrone(drone);

    // Draw particles on top
    drawParticles();

    // Draw UI: Score (top-left), audio toggle (top-center), lives (top-right)
    // Score box
    ctx.font = `${IMPORTANT_FONT}px Arial`;
    const scoreText = `Correct: ${score}/${TARGET_CORRECT}`;
    const scoreBox = drawTextBox(scoreText, `${IMPORTANT_FONT}px Arial`, UI_PADDING, UI_PADDING, "left", "#073", "rgba(255,255,255,0.92)", UI_PADDING);

    // Audio toggle (top center) ensure spacing
    const audioRect = getAudioTextRect();
    let audioY = audioRect.y;
    if (scoreBox.x + scoreBox.w + 12 > audioRect.x && scoreBox.y + scoreBox.h > audioRect.y) {
      audioY = audioRect.y + scoreBox.h + 12;
    }
    const audioText = audioMuted ? "Audio: Off (M)" : audioAllowed ? "Audio: On (M)" : "Audio: Unavailable";
    const audioBox = drawTextBox(audioText, `${MIN_BODY_FONT}px Arial`, WIDTH / 2, audioY, "center", "#114", "rgba(255,255,255,0.92)", UI_PADDING);

    // Lives (top-right)
    ctx.font = `${IMPORTANT_FONT}px Arial`;
    const livesText = `Lives: ${"❤".repeat(lives)}${"♡".repeat(MAX_LIVES - lives)}`;
    const livesMetrics = ctx.measureText(livesText);
    const livesW = livesMetrics.width + UI_PADDING * 2;
    const livesX = WIDTH - livesW - UI_PADDING;
    drawTextBox(livesText, `${IMPORTANT_FONT}px Arial`, livesX + livesW, UI_PADDING, "right", "#711", "rgba(255,255,255,0.92)", UI_PADDING);

    // Draw current question near top center (below audio if audio moved down)
    ctx.font = `${IMPORTANT_FONT + 4}px Arial`;
    const qText = `Solve: ${question.a} ${question.op} ${question.b} = ?`;
    // place it below audio area, ensure spacing
    let qY = audioY + MIN_BODY_FONT + UI_PADDING * 2 + 6;
    qY = Math.max(qY, scoreBox.y + scoreBox.h + 12);
    const qBox = drawTextBox(qText, `${IMPORTANT_FONT + 4}px Arial`, WIDTH / 2, qY, "center", "#003a", "rgba(255,255,255,0.95)", UI_PADDING);

    // Draw instructions bottom-center (multi-line) with softer style
    const instructions = [
      "Controls: Arrow keys or WASD to fly the drone.",
      "Goal: Collect the package with the correct answer 10 times.",
      "Wrong package = lose a life. 3 wrong answers → Game Over.",
      "Press M to toggle audio. Press R or click Restart to play again.",
    ];
    drawMultilineBox(instructions, `${MIN_BODY_FONT}px Arial`, WIDTH / 2, HEIGHT - 110, "center");

    // If game over or won, overlay end screen
    if (state === "won") {
      drawEndScreen(true);
    } else if (state === "lost") {
      drawEndScreen(false);
    }
  }

  // Helper to draw multiline instruction box
  function drawMultilineBox(lines, font, xCenter, yStart) {
    ctx.save();
    ctx.font = font;
    const lineHeight = parseInt(font, 10) + 6;
    // compute max width
    let maxW = 0;
    for (const line of lines) {
      const m = ctx.measureText(line).width;
      if (m > maxW) maxW = m;
    }
    const boxW = Math.min(maxW + UI_PADDING * 2, WIDTH - 60);
    const boxH = lineHeight * lines.length + UI_PADDING * 2;
    const x = xCenter - boxW / 2;
    const y = yStart;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundRect(ctx, x, y, boxW, boxH, 10, true, false);
    ctx.fillStyle = "#003a";
    ctx.textBaseline = "top";
    ctx.font = font;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + UI_PADDING, y + UI_PADDING + i * lineHeight);
    }
    ctx.restore();
  }

  // Draw package box with improved visuals
  function drawPackage(p) {
    ctx.save();
    // wobble small hover and gentle scale pulse
    const wob = Math.sin(p.wobble) * 4;
    const pulse = 1 + Math.sin(p.pulse) * 0.025;
    const x = p.x;
    const y = p.y + wob;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(x + p.w / 2, y + p.h + 12, p.w / 2.4, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // body gradient
    const grad = ctx.createLinearGradient(x, y, x + p.w, y + p.h);
    if (p.value === question.answer && !p.collected) {
      grad.addColorStop(0, "#ffeaa7");
      grad.addColorStop(1, "#ffd36b");
    } else {
      grad.addColorStop(0, "#fff7e6");
      grad.addColorStop(1, "#ffd8a8");
    }
    ctx.fillStyle = grad;
    ctx.save();
    ctx.translate(x + p.w / 2, y + p.h / 2);
    ctx.scale(pulse, pulse);
    roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, 10, true, false);
    ctx.restore();

    // border
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, p.w, p.h, 10, false, true);

    // glowing ring if correct and in range
    if (!p.collected && p.value === question.answer) {
      const dx = p.x + p.w / 2 - drone.x;
      const dy = p.y + p.h / 2 - drone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const glow = Math.max(0, 1 - dist / 160);
      if (glow > 0.02) {
        ctx.save();
        ctx.globalAlpha = 0.35 * glow;
        ctx.strokeStyle = "#6fe39a";
        ctx.lineWidth = 6 * glow;
        ctx.beginPath();
        ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w * 0.9, p.h * 1.1, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // number text
    ctx.font = `20px Arial`;
    ctx.fillStyle = "#172a2d";
    ctx.textBaseline = "middle";
    const txt = String(p.value);
    const tw = ctx.measureText(txt).width;
    ctx.fillText(txt, x + (p.w - tw) / 2, y + p.h / 2);

    // small tape detail
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(x + 10, y + 6, p.w - 20, 6);
    ctx.restore();
  }

  // Draw drone with smoother styling
  function drawDrone(d) {
    ctx.save();
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + DRONE_RADIUS + 10, DRONE_RADIUS * 1.6, DRONE_RADIUS / 2.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // tilt based on velocity for a bit of character
    const tilt = Math.max(-0.35, Math.min(0.35, d.vx / 12));
    ctx.translate(d.x, d.y);
    ctx.rotate(tilt);

    // body with soft gradient
    const bodyGrad = ctx.createLinearGradient(-DRONE_RADIUS - 6, -DRONE_RADIUS, DRONE_RADIUS + 6, DRONE_RADIUS);
    bodyGrad.addColorStop(0, "#74d0f1");
    bodyGrad.addColorStop(1, "#4aa8d6");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, DRONE_RADIUS + 8, DRONE_RADIUS - 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // cockpit glass
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, -6, DRONE_RADIUS - 8, DRONE_RADIUS / 1.9 - 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, -6, DRONE_RADIUS - 12, DRONE_RADIUS / 2.5 - 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // propellers - semi-transparent rotating blades
    const propOffsets = [
      { dx: -28, dy: -18 },
      { dx: 28, dy: -18 },
      { dx: -28, dy: 18 },
      { dx: 28, dy: 18 },
    ];
    let t = performance.now() / 160;
    for (let i = 0; i < propOffsets.length; i++) {
      const p = propOffsets[i];
      const cx = p.dx;
      const cy = p.dy;
      // shaft
      ctx.fillStyle = "#333a";
      ctx.fillRect(cx - 3, cy - 3, 6, 14);
      // blades (rotating)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * (i % 2 === 0 ? 1 : -1));
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(-26, -5, 52, 10);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(-26, -5, 52, 10);
      ctx.restore();
    }

    // eyes and smile for friendliness
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-8, -6, 5, 0, Math.PI * 2);
    ctx.arc(8, -6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#002425";
    ctx.beginPath();
    ctx.arc(-8, -6, 2.2, 0, Math.PI * 2);
    ctx.arc(8, -6, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 6, 8, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();

    // glow if near correct package
    ctx.restore();
    let nearCorrect = packages.some((p) => {
      if (p.collected) return false;
      const dx = p.x + p.w / 2 - d.x;
      const dy = p.y + p.h / 2 - d.y;
      return Math.sqrt(dx * dx + dy * dy) < 100 && p.value === question.answer;
    });
    if (nearCorrect) {
      ctx.save();
      ctx.fillStyle = "rgba(120, 255, 180, 0.06)";
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, DRONE_RADIUS * 2.2, DRONE_RADIUS * 2.0, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Soft clouds drawing
  function drawSoftClouds() {
    ctx.save();
    ctx.globalAlpha = 0.9;
    const t = performance.now() / 6000;
    const cloudColors = ["rgba(255,255,255,0.9)", "rgba(248,252,255,0.85)"];
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 170 + (t * 30) * (i % 2 ? 1.1 : 0.9)) % (WIDTH + 200)) - 100;
      const cy = 40 + i * 18;
      ctx.fillStyle = cloudColors[i % cloudColors.length];
      drawCloud(cx, cy, 46 + (i % 3) * 8, 1 + i * 0.1);
    }
    ctx.restore();
  }

  function drawCloud(cx, cy, radius, scale = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.2, radius * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(-radius * 0.7, 0, radius * 0.8, radius * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(radius * 0.7, 0, radius * 0.8, radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Wacky background drawing (ground shapes)
  function drawWackyBackground() {
    ctx.save();
    // distant soft shapes
    for (let i = 0; i < 6; i++) {
      const x = i * 140 + 20;
      ctx.fillStyle = `rgba(${150 + (i * 10) % 100}, ${200 - i * 12}, ${230 - i * 6}, 0.06)`;
      ctx.beginPath();
      ctx.moveTo(x, HEIGHT - 40);
      ctx.lineTo(x + 40, HEIGHT - 120 - (i % 3) * 8);
      ctx.lineTo(x + 80, HEIGHT - 40);
      ctx.closePath();
      ctx.fill();
    }
    // floating bubbles
    for (let i = 0; i < 10; i++) {
      const rr = 10 + (i * 7) % 30;
      const x = (i * 73) % WIDTH + ((i * 13) % 30);
      const y = (i * 53) % (HEIGHT - 150) + 30;
      ctx.fillStyle = `rgba(200,230,255,${0.03 + (i % 3) * 0.02})`;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    // ground band
    const grd = ctx.createLinearGradient(0, HEIGHT - 120, 0, HEIGHT);
    grd.addColorStop(0, "#f4fff6");
    grd.addColorStop(1, "#f1f7f3");
    ctx.fillStyle = grd;
    ctx.fillRect(0, HEIGHT - 120, WIDTH, 120);
    ctx.restore();
  }

  // Draw end screens
  function drawEndScreen(won) {
    ctx.save();
    // dark overlay
    ctx.fillStyle = "rgba(6,10,15,0.56)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // center box
    const boxW = 560;
    const boxH = 220;
    const bx = WIDTH / 2 - boxW / 2;
    const by = HEIGHT / 2 - boxH / 2 - 20;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    roundRect(ctx, bx, by, boxW, boxH, 12, true, false);

    // title
    ctx.fillStyle = won ? "#0a8b4a" : "#c43a3a";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `28px Arial`;
    if (won) {
      ctx.fillText("Victory! You are a Drone Math Hero!", WIDTH / 2, by + 18);
    } else {
      ctx.fillText("Game Over — The sky gets tricky!", WIDTH / 2, by + 18);
    }

    // message
    ctx.font = `18px Arial`;
    ctx.fillStyle = "#114";
    const msg = won
      ? `You collected ${score} correct answers! Great work.`
      : `You collected ${score} correct answers. Try again to beat your score!`;
    ctx.fillText(msg, WIDTH / 2, by + 62);

    // decorative small icons
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 9; i++) {
      const xx = bx + 40 + i * 56;
      const yy = by + boxH - 36;
      ctx.beginPath();
      ctx.arc(xx, yy, 8, 0, Math.PI * 2);
      ctx.fillStyle = won ? "#7be37b" : "#ff9a9a";
      ctx.fill();
    }
    ctx.restore();

    // Restart button
    const btn = getRestartButtonRect();
    ctx.fillStyle = won ? "#0a8b4a" : "#c43a3a";
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12, true, false);
    ctx.fillStyle = "#fff";
    ctx.font = `20px Arial`;
    ctx.textBaseline = "middle";
    ctx.fillText("Restart (R) / Click Here", WIDTH / 2, btn.y + btn.h / 2);

    ctx.restore();
  }

  // Main loop
  function loop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // Initial focus and hint
  canvas.focus();
  // Expose some state for debugging (not required, but helpful)
  window.__droneMathGame = {
    reset: resetGame,
    mute: () => (audioMuted = true),
    unmute: () => (audioMuted = false),
    setVolume: (v) => {
      if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
    },
  };

  // Ensure Audio context start on first interaction
  function handleFirstInteraction() {
    ensureAudioStarted();
    window.removeEventListener("mousedown", handleFirstInteraction);
    window.removeEventListener("touchstart", handleFirstInteraction);
    window.removeEventListener("keydown", handleFirstInteraction);
  }
  window.addEventListener("mousedown", handleFirstInteraction);
  window.addEventListener("touchstart", handleFirstInteraction);
  window.addEventListener("keydown", handleFirstInteraction);
})();