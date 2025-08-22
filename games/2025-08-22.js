(function () {
  // Power-Up Circuit: Visual & Audio polish update
  // All changes confined to visuals and audio. Game mechanics and math logic preserved.
  // Renders inside element with ID "game-of-the-day-stage".
  // Author: educational game designer AI (visual/audio enhancements).

  // -----------------------
  // Configuration & Setup
  // -----------------------
  const STAGE_ID = "game-of-the-day-stage";
  const WIDTH = 720;
  const HEIGHT = 480;

  // Ensure container exists
  const container = document.getElementById(STAGE_ID);
  if (!container) {
    console.error(`Game container with ID "${STAGE_ID}" not found.`);
    return;
  }

  // Clear container and create canvas
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.width = WIDTH + "px";
  container.style.height = HEIGHT + "px";
  container.style.userSelect = "none";

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Power-Up Circuit math game. Use arrow keys or WASD to move Sparkie and collect numbered energy bits to match lamp targets."
  );
  canvas.style.display = "block";
  container.appendChild(canvas);

  // Hidden ARIA live region for screen readers
  const sr = document.createElement("div");
  sr.setAttribute("aria-live", "polite");
  sr.style.position = "absolute";
  sr.style.left = "-9999px";
  sr.style.width = "1px";
  sr.style.height = "1px";
  sr.style.overflow = "hidden";
  sr.id = "game-of-the-day-status";
  container.appendChild(sr);

  const ctx = canvas.getContext("2d", { alpha: false });

  // -----------------------
  // Audio Initialization & Effects (Web Audio API)
  // -----------------------
  let audioCtx = null;
  let audioEnabled = true;
  let bgGain = null;
  let bgNodes = null; // to store nodes for background so we can stop them on error

  function safeCreateAudioContext() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio API not supported");
      return new AC();
    } catch (err) {
      console.warn("AudioContext creation failed:", err);
      return null;
    }
  }

  function initAudio() {
    // Initialize a calming evolving ambient pad with subtle movement.
    if (audioCtx) return; // already initialized
    try {
      audioCtx = safeCreateAudioContext();
      if (!audioCtx) {
        audioEnabled = false;
        return;
      }

      // master gain
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.02; // gentle by default
      bgGain.connect(audioCtx.destination);

      // Two detuned oscillators for chordal pad
      const oscA = audioCtx.createOscillator();
      const oscB = audioCtx.createOscillator();
      oscA.type = "sine";
      oscB.type = "sine";
      oscA.frequency.value = 110;
      oscB.frequency.value = 138.59; // slightly detuned for pleasant interval

      // Lowpass filter to soften
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 800;
      lp.Q.value = 0.8;

      // Subtle amplitude LFO for breathing effect
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.12;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.012;

      // Connect chain: oscA/oscB -> lp -> bgGain -> destination
      oscA.connect(lp);
      oscB.connect(lp);
      lp.connect(bgGain);

      // LFO modulates bgGain.gain
      lfo.connect(lfoGain);
      lfoGain.connect(bgGain.gain);

      // Start
      const now = audioCtx.currentTime;
      oscA.start(now);
      oscB.start(now);
      lfo.start(now);

      bgNodes = { oscA, oscB, lp, lfo, lfoGain };

      audioEnabled = true;
    } catch (err) {
      console.warn("initAudio error:", err);
      audioCtx = null;
      audioEnabled = false;
    }
  }

  // Set background volume safely
  function setBackgroundVolume(vol) {
    if (!bgGain || !audioCtx) return;
    try {
      bgGain.gain.setTargetAtTime(Math.max(0, Math.min(0.12, vol)), audioCtx.currentTime, 0.02);
    } catch (err) {
      console.warn("setBackgroundVolume error:", err);
    }
  }

  // Toggle audio with user feedback and safe resume
  function toggleAudio() {
    if (!audioCtx) {
      initAudio();
      if (!audioCtx) {
        audioEnabled = false;
        announce("Audio unavailable");
        return;
      }
    }
    // Some browsers require user gesture to resume
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => console.warn("audio resume failed", e));
    }
    audioEnabled = !audioEnabled;
    setBackgroundVolume(audioEnabled ? 0.02 : 0.0);
    announce(audioEnabled ? "Audio turned on" : "Audio turned off");
  }

  // Utility to create a short scheduled oscillator tone
  function playTone({ freq = 440, type = "sine", duration = 0.2, gain = 0.08, detune = 0 }) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      g.gain.value = 0.0001;
      const now = audioCtx.currentTime;
      o.connect(g);
      g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (err) {
      console.warn("playTone error:", err);
    }
  }

  // Pickup sound: quick FM-like blip (using modulating oscillator to change frequency)
  function playPickup() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const carrier = audioCtx.createOscillator();
      const mod = audioCtx.createOscillator();
      const modGain = audioCtx.createGain();
      const g = audioCtx.createGain();
      carrier.type = "sawtooth";
      carrier.frequency.value = 660;
      mod.type = "sine";
      mod.frequency.value = 880;
      modGain.gain.value = 60; // modulation depth
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      carrier.start(now);
      mod.start(now);
      carrier.stop(now + 0.24);
      mod.stop(now + 0.24);
    } catch (err) {
      console.warn("playPickup error:", err);
    }
  }

  // Success chime: pleasant arpeggio of three notes
  function playSuccess() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const baseTime = audioCtx.currentTime + 0.0;
      const notes = [660, 880, 1100];
      notes.forEach((f, i) => {
        const dur = 0.28;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "triangle";
        o.frequency.value = f;
        o.connect(g);
        g.connect(audioCtx.destination);
        const t = baseTime + i * 0.12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t);
        o.stop(t + dur + 0.02);
      });
    } catch (err) {
      console.warn("playSuccess error:", err);
    }
  }

  // Error buzz: short filtered noise + low growl
  function playError() {
    if (!audioEnabled || !audioCtx) return;
    try {
      // create a short noisy thud using oscillator shaped with filter
      const o = audioCtx.createOscillator();
      const f = audioCtx.createBiquadFilter();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.value = 160;
      f.type = "bandpass";
      f.frequency.value = 300;
      f.Q.value = 1.2;
      o.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      o.start(now);
      o.stop(now + 0.36);
    } catch (err) {
      console.warn("playError error:", err);
    }
  }

  // -----------------------
  // Game Objects & State (unchanged)
  // -----------------------
  const keys = {};
  const pointer = { x: 0, y: 0, down: false };

  // Sparkie (player)
  const player = {
    x: WIDTH / 2,
    y: HEIGHT - 80,
    r: 18,
    color1: "#FFD66B",
    color2: "#FFAA00",
    vx: 0,
    vy: 0,
    speed: 160, // pixels per second
  };

  // Lamps (targets)
  const lampCount = 3;
  let lamps = [];

  // Energy bits (collectible number pellets)
  let pellets = [];

  // Level and game flow
  let level = 1;
  let score = 0;
  let lives = 3;
  let gameState = "start"; // start, playing, levelComplete, gameOver
  let lastTime = null;

  // Timers
  let spawnTimer = 0;
  const spawnInterval = 1.0; // spawn pellet every second-ish

  // Accessibility announcer
  function announce(message) {
    try {
      sr.textContent = message;
    } catch (err) {
      console.warn("announce error", err);
    }
  }

  // -----------------------
  // Utility Functions
  // -----------------------
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randint(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  // Lamps setup
  function resetLampsForLevel(lv) {
    lamps = [];
    const padding = 40;
    const spacing = (WIDTH - padding * 2) / (lampCount - 1);
    for (let i = 0; i < lampCount; i++) {
      const targetBase = 6 + lv * 2; // base grows with level (unchanged)
      const target = randint(targetBase, targetBase + 6);
      lamps.push({
        x: padding + spacing * i,
        y: 90,
        r: 44,
        target: target,
        sum: 0,
        lit: false,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  // Pellets reset
  function resetPellets() {
    pellets = [];
    for (let i = 0; i < 6; i++) spawnPellet();
  }

  // Spawn pellet (unchanged spawn logic)
  function spawnPellet() {
    if (pellets.length > 14) return;
    const n = randint(1, Math.min(9, 2 + level * 3));
    const p = {
      x: rand(40, WIDTH - 40),
      y: rand(160, HEIGHT - 120),
      r: 14,
      value: n,
      vx: rand(-20, 20),
      vy: rand(-10, 10),
      wobble: Math.random() * Math.PI * 2,
      hueOffset: Math.random() * 40 - 20,
    };
    pellets.push(p);
  }

  // Initialize level
  function startLevel(lv) {
    level = lv;
    resetLampsForLevel(level);
    resetPellets();
    spawnTimer = 0;
    gameState = "playing";
    announce(
      `Level ${level}. Help Sparkie light up ${lampCount} lamps by collecting numbers that add to each lamp's target.`
    );
  }

  function restartGame() {
    level = 1;
    score = 0;
    lives = 3;
    player.x = WIDTH / 2;
    player.y = HEIGHT - 80;
    startLevel(level);
  }

  // -----------------------
  // Collision Helpers (unchanged)
  // -----------------------
  function circleCollision(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const r = a.r + b.r;
    return dx * dx + dy * dy <= r * r;
  }

  // -----------------------
  // Input Handling (unchanged functionality; slight additions for audio resume)
  // -----------------------
  window.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch((err) => console.warn("audio resume failed", err));
    }
    if (e.key === " ") {
      toggleAudio();
    }
    if (e.key === "Enter") {
      if (gameState === "start" || gameState === "levelComplete" || gameState === "gameOver") {
        restartGame();
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });

  // Mouse / touch handlers
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    pointer.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  canvas.addEventListener(
    "mousedown",
    (e) => {
      pointer.down = true;
      const rect = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      pointer.y = (e.clientY - rect.top) * (canvas.height / rect.height);
      // Clicking speaker area toggles audio
      const sx = WIDTH - 52;
      const sy = 12;
      if (pointer.x >= sx && pointer.x <= sx + 40 && pointer.y >= sy && pointer.y <= sy + 40) {
        toggleAudio();
      }
      if (gameState === "start" || gameState === "levelComplete" || gameState === "gameOver") {
        restartGame();
      }
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch((err) => console.warn("audio resume failed", err));
      }
    },
    false
  );

  canvas.addEventListener("mouseup", () => {
    pointer.down = false;
  });

  canvas.addEventListener(
    "touchstart",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0];
      pointer.x = (t.clientX - rect.left) * (canvas.width / rect.width);
      pointer.y = (t.clientY - rect.top) * (canvas.height / rect.height);
      pointer.down = true;
      e.preventDefault();
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch((err) => console.warn("audio resume failed", err));
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0];
      pointer.x = (t.clientX - rect.left) * (canvas.width / rect.width);
      pointer.y = (t.clientY - rect.top) * (canvas.height / rect.height);
      e.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      pointer.down = false;
      e.preventDefault();
    },
    { passive: false }
  );

  // -----------------------
  // Drawing Helpers (polished visuals)
  // -----------------------
  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // subtle animated grid and floating elements for depth
  function drawBackground(ts = performance.now()) {
    // gradient sky with slight teal tint
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#f0fbff");
    g.addColorStop(0.6, "#eaf7f2");
    g.addColorStop(1, "#f5fbff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft circuit grid overlay (very subtle)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#1a6a7a";
    ctx.lineWidth = 1;
    const gridSize = 48;
    const offset = (ts / 800) % gridSize;
    for (let x = -gridSize + offset; x < WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = -gridSize + offset; y < HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    // animated soft floating orbs representing components
    for (let i = 0; i < 6; i++) {
      ctx.save();
      const ox = (i * 123.7) % WIDTH + Math.sin(ts / 1400 + i) * 18;
      const oy = 40 + (i % 3) * 28 + Math.cos(ts / 1200 + i) * 8;
      const orbGrad = ctx.createRadialGradient(ox - 8, oy - 8, 4, ox, oy, 40);
      orbGrad.addColorStop(0, "rgba(255,245,220,0.85)");
      orbGrad.addColorStop(1, "rgba(110,190,210,0.06)");
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.ellipse(ox, oy, 64 - (i % 4) * 8, 18, Math.PI / 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ground strip with subtle texture
    ctx.save();
    ctx.fillStyle = "#eefaf3";
    ctx.fillRect(0, HEIGHT - 100, WIDTH, 100);
    // slight shadow line
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    ctx.fillRect(0, HEIGHT - 102, WIDTH, 4);
    ctx.restore();

    // left power pole stylized (kept but improved)
    ctx.save();
    ctx.translate(48, HEIGHT - 120);
    // pole
    ctx.fillStyle = "#6b4a2a";
    drawRoundedRect(ctx, -12, -40, 24, 120, 6);
    // decorative panel
    ctx.fillStyle = "#fffbec";
    ctx.beginPath();
    ctx.moveTo(-22, -24);
    ctx.quadraticCurveTo(0, -44, 22, -24);
    ctx.lineTo(22, -8);
    ctx.quadraticCurveTo(0, -28, -22, -8);
    ctx.closePath();
    ctx.fill();
    // small LED
    ctx.beginPath();
    ctx.fillStyle = "#ffd66b";
    ctx.arc(0, -14, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw connection wires between lamps with soft glow
  function drawWires() {
    const unlitColor = "rgba(24,66,110,0.12)";
    const litColor = "rgba(255,206,77,0.25)";
    ctx.save();
    for (let i = 0; i < lamps.length - 1; i++) {
      const a = lamps[i];
      const b = lamps[i + 1];
      // choose color based on either lit
      ctx.strokeStyle = a.lit || b.lit ? litColor : unlitColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + 36);
      // curve like a wire
      const cx = (a.x + b.x) / 2;
      ctx.quadraticCurveTo(cx, a.y + 70 + Math.sin(performance.now() / 600 + i) * 6, b.x, b.y + 36);
      ctx.stroke();
      // finer highlight
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x + 6, a.y + 34);
      ctx.quadraticCurveTo(cx + 6, a.y + 64, b.x - 6, b.y + 34);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Lamp drawing with glass refraction and soft glow when lit
  function drawLamp(l) {
    ctx.save();
    ctx.translate(l.x, l.y);
    l.wobble += 0.02;
    const wob = Math.sin(l.wobble) * 4;
    // Outer soft glow if lit
    if (l.lit) {
      const glow = ctx.createRadialGradient(0, 0, l.r * 0.6, 0, 0, l.r * 2.6);
      glow.addColorStop(0, "rgba(255,244,190,0.85)");
      glow.addColorStop(1, "rgba(255,180,40,0.02)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, l.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.98;
    }

    // Lamp glass: layered gradient
    const glassGrad = ctx.createRadialGradient(-12, -10, 8, 0, 0, l.r * 2);
    glassGrad.addColorStop(0, l.lit ? "#fffef0" : "#ffffff");
    glassGrad.addColorStop(0.6, l.lit ? "#fff2b2" : "#e8f0ff");
    glassGrad.addColorStop(1, l.lit ? "#fff0a2" : "#d8e8ff");
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(wob, 0, l.r, l.r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // metallic base
    const baseGrad = ctx.createLinearGradient(-18, 30, 18, 44);
    baseGrad.addColorStop(0, "#8c8c8c");
    baseGrad.addColorStop(1, "#4f4f4f");
    ctx.fillStyle = baseGrad;
    ctx.fillRect(-18, 30, 36, 14);

    // filament or icon
    ctx.strokeStyle = l.lit ? "#ffb703" : "#6e6e6e";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(0, 8, 8, 0);
    ctx.stroke();

    // wiring terminals
    ctx.fillStyle = "#2e3f47";
    ctx.beginPath();
    ctx.arc(-12, 36, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, 36, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // target and sum text
    ctx.fillStyle = "#123";
    ctx.font = "600 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Target ${l.target}`, 0, -l.r - 14);
    ctx.font = "800 22px serif";
    ctx.fillStyle = l.lit ? "#2b5a2b" : "#15406a";
    ctx.fillText(`${l.sum}`, 0, 8);

    ctx.restore();
  }

  // Pellets: shiny LED-like chips with gentle float
  function drawPellet(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    p.wobble += 0.08;
    const shift = Math.sin(p.wobble) * 3;
    // soft outer glow
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 140, 140, 0.07)`;
    ctx.arc(shift, 0, p.r + 8, 0, Math.PI * 2);
    ctx.fill();
    // rim
    const rimGrad = ctx.createLinearGradient(-p.r, -p.r, p.r, p.r);
    rimGrad.addColorStop(0, "#fff4f4");
    rimGrad.addColorStop(1, "#ffd6d6");
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(shift, 0, p.r + 3, 0, Math.PI * 2);
    ctx.fill();

    // inner body with slight hue variation
    const bodyGrad = ctx.createLinearGradient(-p.r, -p.r, p.r, p.r);
    const hue = 12 + (p.value / 9) * 30 + p.hueOffset;
    bodyGrad.addColorStop(0, `hsl(${hue}, 95%, 62%)`);
    bodyGrad.addColorStop(1, `hsl(${hue - 12}, 85%, 52%)`);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(shift, 0, p.r, 0, Math.PI * 2);
    ctx.fill();

    // small spec highlight
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(-p.r * 0.35 + shift, -p.r * 0.45, p.r * 0.28, p.r * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // number label
    ctx.fillStyle = "#3a0b0b";
    ctx.font = "700 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.value.toString(), shift, 0);
    ctx.restore();
  }

  // Player with subtle particle trail; face and personality polished
  const playerTrail = [];

  function emitPlayerTrail(px, py) {
    // keep trail small to avoid heavy load
    playerTrail.push({
      x: px + rand(-2, 2),
      y: py + rand(-2, 2),
      a: 0.9,
      s: rand(6, 14),
      life: 0.6,
      t: performance.now(),
    });
    if (playerTrail.length > 40) playerTrail.shift();
  }

  function drawPlayer(pl) {
    ctx.save();
    // emit trail slightly each frame
    if (Math.random() > 0.3) emitPlayerTrail(pl.x, pl.y);

    // draw trail particles
    for (let i = playerTrail.length - 1; i >= 0; i--) {
      const t = playerTrail[i];
      const age = (performance.now() - t.t) / 1000;
      if (age > t.life) {
        playerTrail.splice(i, 1);
        continue;
      }
      const alpha = (1 - age / t.life) * t.a;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,200,80,${alpha})`;
      ctx.arc(t.x, t.y + age * 4, t.s * (1 - age / t.life), 0, Math.PI * 2);
      ctx.fill();
    }

    // main glow
    const glow = ctx.createRadialGradient(pl.x, pl.y, 6, pl.x, pl.y, 44);
    glow.addColorStop(0, "rgba(255,246,208,0.95)");
    glow.addColorStop(1, "rgba(255,170,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 36, 0, Math.PI * 2);
    ctx.fill();

    // spark body (slightly glossy)
    ctx.beginPath();
    const bodyGrad = ctx.createLinearGradient(pl.x - pl.r, pl.y - pl.r, pl.x + pl.r, pl.y + pl.r);
    bodyGrad.addColorStop(0, "#fff7d6");
    bodyGrad.addColorStop(0.6, "#ffd66b");
    bodyGrad.addColorStop(1, "#ffaa00");
    ctx.fillStyle = bodyGrad;
    ctx.arc(pl.x, pl.y, pl.r, 0, Math.PI * 2);
    ctx.fill();

    // face details
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.ellipse(pl.x - 6, pl.y - 4, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(pl.x + 6, pl.y - 3, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6b3b00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pl.x, pl.y + 4, 8, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();

    // tail spark (animated)
    ctx.save();
    ctx.translate(pl.x, pl.y);
    ctx.rotate(Math.sin(performance.now() / 200) * 0.12);
    ctx.strokeStyle = "rgba(255,215,110,0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-pl.r - 2, 2);
    ctx.lineTo(-pl.r - 12, 6);
    ctx.lineTo(-pl.r - 6, 12);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // HUD with refined styling
  function drawHUD() {
    ctx.save();
    // translucent top panel with slight blur effect imitation
    ctx.fillStyle = "rgba(8,18,32,0.06)";
    ctx.fillRect(0, 0, WIDTH, 54);

    // left info
    ctx.fillStyle = "#123";
    ctx.font = "700 18px 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, 12, 26);
    ctx.fillText(`Level: ${level}`, 160, 26);
    ctx.fillText(`Lives: ${lives}`, 260, 26);

    // speaker / audio status (rounded)
    const sx = WIDTH - 56;
    const sy = 10;
    ctx.fillStyle = audioEnabled ? "rgba(255,214,103,0.95)" : "rgba(200,200,200,0.9)";
    drawRoundedRect(ctx, sx, sy, 48, 36, 8);
    ctx.fillStyle = "#222";
    ctx.font = "600 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(audioEnabled ? "SOUND ON" : "SOUND OFF", sx + 24, sy + 22);
    ctx.restore();
  }

  // Start / complete / game over overlays with gentle styling
  function drawStartScreen() {
    ctx.save();
    ctx.fillStyle = "rgba(6,12,24,0.5)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "800 30px sans-serif";
    ctx.fillText("Power-Up Circuit", WIDTH / 2, 120);
    ctx.font = "600 16px sans-serif";
    ctx.fillText("Help Sparkie light the lamps by collecting energy bits (numbers).", WIDTH / 2, 152);
    ctx.fillText("Use arrow keys or WASD to move. Space toggles audio. Click or press Enter to start.", WIDTH / 2, 176);

    // friendly start button circle
    ctx.beginPath();
    ctx.fillStyle = "#ffd66b";
    ctx.ellipse(WIDTH / 2, 320, 74, 74, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.font = "700 20px sans-serif";
    ctx.fillText("Click to Start", WIDTH / 2, 326);
    ctx.restore();
  }

  function drawLevelComplete() {
    ctx.save();
    ctx.fillStyle = "rgba(2,12,24,0.45)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "800 26px sans-serif";
    ctx.fillText("All lamps powered!", WIDTH / 2, 150);
    ctx.font = "700 18px sans-serif";
    ctx.fillText(`Level ${level} complete. Score: ${score}`, WIDTH / 2, 190);
    ctx.font = "600 14px sans-serif";
    ctx.fillText("Click or press Enter to continue to the next challenge.", WIDTH / 2, 240);
    ctx.restore();
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "800 30px sans-serif";
    ctx.fillText("Oh no! Power outage!", WIDTH / 2, 150);
    ctx.font = "700 20px sans-serif";
    ctx.fillText(`Final Score: ${score}`, WIDTH / 2, 200);
    ctx.font = "600 14px sans-serif";
    ctx.fillText("Click or press Enter to try again and power up the town!", WIDTH / 2, 240);
    ctx.restore();
  }

  // -----------------------
  // Gameplay Logic (kept intact)
  // -----------------------
  function update(dt) {
    if (gameState !== "playing") return;

    // Player movement via keyboard
    let vx = 0,
      vy = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) vx -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) vx += 1;
    if (keys["ArrowUp"] || keys["w"] || keys["W"]) vy -= 1;
    if (keys["ArrowDown"] || keys["s"] || keys["S"]) vy += 1;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx = (vx / len) * player.speed;
      vy = (vy / len) * player.speed;
    }
    // Pointer control (mouse) nudges player
    if (pointer.down) {
      const dx = pointer.x - player.x;
      const dy = pointer.y - player.y;
      vx += dx * 1.4;
      vy += dy * 1.4;
    }
    player.x += vx * dt;
    player.y += vy * dt;
    // Boundaries
    player.x = Math.max(22, Math.min(WIDTH - 22, player.x));
    player.y = Math.max(120, Math.min(HEIGHT - 24, player.y));

    // Pellets move slightly
    for (const p of pellets) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 24 || p.x > WIDTH - 24) p.vx *= -1;
      if (p.y < 140 || p.y > HEIGHT - 40) p.vy *= -1;
      p.vx *= 0.995;
      p.vy *= 0.995;
    }

    // Spawn new pellets occasionally
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      if (Math.random() < 0.85) spawnPellet();
    }

    // Collision with pellets
    for (let i = pellets.length - 1; i >= 0; i--) {
      const p = pellets[i];
      if (circleCollision(player, { x: p.x, y: p.y, r: p.r })) {
        // Collect pellet
        playPickup();
        // Which lamp to assign to? We'll assign to the nearest unlit lamp.
        const unlit = lamps.filter((l) => !l.lit);
        if (unlit.length === 0) {
          score += p.value;
          announce(`Collected ${p.value} energy. No lamps need energy right now.`);
        } else {
          let nearest = unlit[0];
          let best = Infinity;
          for (const l of unlit) {
            const d = (l.x - player.x) ** 2 + (l.y - player.y) ** 2;
            if (d < best) {
              best = d;
              nearest = l;
            }
          }
          nearest.sum += p.value;
          announce(`Delivered ${p.value} energy to a lamp. Lamp at ${nearest.x} now has ${nearest.sum}.`);
          if (nearest.sum === nearest.target) {
            nearest.lit = true;
            score += nearest.target * 2;
            playSuccess();
            announce(`Bingo! Lamp reached target ${nearest.target} and lit up!`);
          } else if (nearest.sum > nearest.target) {
            playError();
            lives -= 1;
            nearest.sum = Math.max(0, Math.floor(nearest.sum / 2));
            announce(
              `Oops! Lamp overloaded. Lives left: ${lives}. The lamp's energy decreased to ${nearest.sum}.`
            );
            if (lives <= 0) {
              gameState = "gameOver";
              announce("Game over. Try again to help Sparkie power the town.");
            }
          } else {
            score += p.value;
          }
        }
        // gentle visual feedback: small flash at player's position (non-intrusive)
        playerTrail.push({
          x: player.x,
          y: player.y,
          a: 0.9,
          s: 18,
          life: 0.28,
          t: performance.now(),
        });
        pellets.splice(i, 1);
      }
    }

    // Check if all lamps are lit
    if (lamps.every((l) => l.lit)) {
      gameState = "levelComplete";
      level += 1;
      score += 50;
      playSuccess();
      announce(`Level complete! You powered all lamps. Score ${score}. Click or press Enter to continue.`);
    }
  }

  // -----------------------
  // Main Loop
  // -----------------------
  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;

    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Update based on state
    if (gameState === "start") {
      drawBackground(ts);
      drawPlayer(player);
      drawHUD();
      drawStartScreen();
    } else if (gameState === "playing") {
      update(dt);
      drawBackground(ts);
      // wires first for depth
      drawWires();
      // Draw lamps
      for (const l of lamps) drawLamp(l);
      // Draw pellets
      for (const p of pellets) drawPellet(p);
      // Draw player
      drawPlayer(player);
      drawHUD();
      // Little instruction hint bar
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(8, HEIGHT - 84, WIDTH - 16, 72);
      ctx.fillStyle = "#123";
      ctx.font = "600 14px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        "Collect numbers and deliver them to lamps to match the target sums. Avoid overloads.",
        14,
        HEIGHT - 54
      );
    } else if (gameState === "levelComplete") {
      drawBackground(ts);
      drawWires();
      for (const l of lamps) drawLamp(l);
      for (const p of pellets) drawPellet(p);
      drawPlayer(player);
      drawHUD();
      drawLevelComplete();
    } else if (gameState === "gameOver") {
      drawBackground(ts);
      drawWires();
      for (const l of lamps) drawLamp(l);
      drawHUD();
      drawGameOver();
    }

    // Draw small audio indicator (visual cue for audio state)
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = audioEnabled ? "#e9f7d9" : "#f7e9e9";
    const sx = WIDTH - 76;
    const sy = 8;
    drawRoundedRect(ctx, sx, sy, 62, 36, 6);
    ctx.fillStyle = "#222";
    ctx.font = "600 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(audioEnabled ? "Audio: On" : "Audio: Off", sx + 31, sy + 22);
    ctx.restore();

    requestAnimationFrame(loop);
  }

  // -----------------------
  // Initialization
  // -----------------------
  function init() {
    try {
      initAudio();
      if (!audioCtx) {
        announce("Audio is not available. You can still play the game with visual feedback.");
      } else {
        setBackgroundVolume(audioEnabled ? 0.02 : 0.0);
      }
    } catch (err) {
      console.warn("Audio init error", err);
    }

    resetLampsForLevel(1);
    resetPellets();

    gameState = "start";
    announce(
      "Welcome to Power-Up Circuit! Press Enter or click to start. Use arrow keys or WASD to move Sparkie and collect numbers for lamps."
    );

    requestAnimationFrame(loop);
  }

  // Start
  init();

  // Expose debug helpers
  canvas.gameDebug = {
    restart: restartGame,
    toggleAudio: toggleAudio,
    getState: () => ({
      level,
      score,
      lives,
      gameState,
      lamps: JSON.parse(JSON.stringify(lamps)),
      pellets: JSON.parse(JSON.stringify(pellets)),
    }),
  };
})();