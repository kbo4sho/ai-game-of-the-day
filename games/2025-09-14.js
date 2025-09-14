(function () {
  // Enhanced Visuals & Audio for Educational Math Game: Machine Mash
  // Renders a 720x480 canvas into #game-of-the-day-stage
  // Improvements are strictly visual and audio; game mechanics unchanged.

  // Ensure the target container exists
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Game container '#game-of-the-day-stage' not found.");
    return;
  }

  // Clear container and create canvas (exact size requested)
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = "720px";
  canvas.style.height = "480px";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Machine Mash math game. Use left and right arrows or keys 1,2,3 to pick a machine. Press Space to catch a number. Press A to toggle audio."
  );
  canvas.tabIndex = 0; // focusable for keyboard
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Canvas context not available.");
    return;
  }

  // Game area constants
  const W = 720;
  const H = 480;

  // Audio setup
  let audioEnabled = true;
  let audioAllowedByUser = false;
  const AudioCtx = window.AudioContext || window.webkitAudioContext || null;
  let audioCtx = null;
  let masterGain = null;
  let bgGain = null;
  let bgFilter = null;
  let bgLfo = null;
  let bgOsc1 = null;
  let bgOsc2 = null;

  // Particle system for subtle visual flourishes
  let particles = [];

  // Helper: create audio context on user gesture with robust error handling
  function initAudioOnUserGesture() {
    if (!AudioCtx) {
      audioEnabled = false;
      return;
    }
    if (audioCtx) return;
    try {
      audioCtx = new AudioCtx();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.12;
      masterGain.connect(audioCtx.destination);

      // Background ambient: two detuned sine oscillators through a lowpass filter
      bgOsc1 = audioCtx.createOscillator();
      bgOsc2 = audioCtx.createOscillator();
      bgOsc1.type = "sine";
      bgOsc2.type = "sine";
      bgOsc1.frequency.value = 110;
      bgOsc2.frequency.value = 138; // slightly detuned

      // gentle filter
      bgFilter = audioCtx.createBiquadFilter();
      bgFilter.type = "lowpass";
      bgFilter.frequency.value = 800;

      // slow LFO modulating filter frequency for movement
      bgLfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      bgLfo.type = "sine";
      bgLfo.frequency.value = 0.07; // very slow
      lfoGain.gain.value = 220;
      bgLfo.connect(lfoGain);
      lfoGain.connect(bgFilter.frequency);

      // Subtle amplitude pulsing
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.06;

      // Connect chain
      bgOsc1.connect(bgFilter);
      bgOsc2.connect(bgFilter);
      bgFilter.connect(bgGain);
      bgGain.connect(masterGain);

      // Start sources
      bgOsc1.start();
      bgOsc2.start();
      bgLfo.start();

      audioAllowedByUser = true;
    } catch (e) {
      console.warn("AudioContext failed to initialize:", e);
      audioEnabled = false;
      audioCtx = null;
      bgOsc1 = bgOsc2 = bgLfo = null;
    }
  }

  function toggleAudio() {
    if (!AudioCtx) {
      audioEnabled = false;
      return;
    }
    if (!audioCtx) {
      initAudioOnUserGesture();
      return;
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => {
        console.warn("AudioContext resume failed:", e);
        audioEnabled = false;
      });
    }
    audioEnabled = !audioEnabled;
    if (masterGain) {
      masterGain.gain.value = audioEnabled ? 0.12 : 0.0;
    }
  }

  // Safe oscillator creation with error handling
  function safeCreateOscillator() {
    if (!audioCtx) return null;
    try {
      return audioCtx.createOscillator();
    } catch (e) {
      console.warn("Oscillator creation failed:", e);
      return null;
    }
  }

  // Small helper for bell-like envelope using a couple oscillators and FM
  function playBell(frequency = 660, duration = 0.5, velocity = 0.08) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const carrier = safeCreateOscillator();
      const mod = safeCreateOscillator();
      const modGain = audioCtx.createGain();
      const g = audioCtx.createGain();
      if (!carrier || !mod) return;

      // FM bell-ish
      mod.type = "sine";
      mod.frequency.value = frequency * 2.1;
      modGain.gain.value = frequency * 0.12;
      mod.connect(modGain);

      carrier.type = "sine";
      carrier.frequency.value = frequency;
      modGain.connect(carrier.frequency);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, velocity), now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      carrier.connect(g);
      g.connect(masterGain);

      mod.start(now);
      carrier.start(now);
      carrier.stop(now + duration + 0.02);
      mod.stop(now + duration + 0.02);
    } catch (e) {
      console.warn("playBell error:", e);
    }
  }

  // Soft percussive click for UI navigation (improved)
  function playClickTone() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = safeCreateOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      if (!o) return;
      o.type = "triangle";
      o.frequency.value = 880;
      f.type = "highpass";
      f.frequency.value = 400;
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      o.start(now);
      o.stop(now + 0.18);
    } catch (e) {
      console.warn("playClickTone error:", e);
    }
  }

  // Correct sequence is pleasant, keep but subtle
  function playCorrectSequence() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const notes = [880, 1100, 1320];
      let t = audioCtx.currentTime;
      notes.forEach((f, i) => {
        const o = safeCreateOscillator();
        if (!o) return;
        const g = audioCtx.createGain();
        o.type = i === notes.length - 1 ? "sine" : "triangle";
        o.frequency.value = f;
        o.connect(g);
        g.connect(masterGain);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.start(t);
        o.stop(t + 0.12);
        t += 0.06;
      });
    } catch (e) {
      console.warn("playCorrectSequence error:", e);
    }
  }

  function playWrongBuzz() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const o = safeCreateOscillator();
      if (!o) return;
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1000;
      o.type = "sawtooth";
      o.frequency.value = 220;
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      o.start(now);
      o.stop(now + 0.35);
    } catch (e) {
      console.warn("playWrongBuzz error:", e);
    }
  }

  // New sounds: spawn, drop, catch
  function playSpawnTone() {
    // gentle bell-ish for new ball
    playBell(540, 0.28, 0.05);
  }

  function playDropTone() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = safeCreateOscillator();
      const g = audioCtx.createGain();
      const hp = audioCtx.createBiquadFilter();
      if (!o) return;
      o.type = "sine";
      o.frequency.value = 440;
      hp.type = "highpass";
      hp.frequency.value = 240;
      o.connect(hp);
      hp.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.045, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.start(now);
      o.stop(now + 0.2);
    } catch (e) {
      console.warn("playDropTone error:", e);
    }
  }

  function playCatchTone(success = true) {
    if (!audioEnabled || !audioCtx) return;
    try {
      if (success) {
        // quick bright pluck
        playBell(780, 0.18, 0.07);
      } else {
        // duller pluck
        playBell(320, 0.22, 0.05);
      }
    } catch (e) {
      console.warn("playCatchTone error:", e);
    }
  }

  // Game state (unchanged mechanics)
  let lastTime = performance.now();
  let spawnTimer = 0;
  let spawnInterval = 1400; // ms between numbers
  let balls = [];
  let selectorIndex = 1; // between 0 and 2 (three machines)
  let catching = false;
  let catchCooldown = 0;
  let level = 0;
  let paused = false;
  let showHints = true;
  let speakerVisible = true;

  const levels = [
    {
      label: "Starter Sparks",
      machines: [
        { op: (n) => n + 1, label: "+1", color: "#FFD166" },
        { op: (n) => n + 2, label: "+2", color: "#06D6A0" },
        { op: (n) => n + 3, label: "+3", color: "#4CC9F0" },
      ],
      target: 7,
      goal: 4,
      allowedMisses: 5,
      spawnInterval: 1500,
    },
    {
      label: "Gear Shift",
      machines: [
        { op: (n) => n - 1, label: "-1", color: "#FF6B6B" },
        { op: (n) => n + 2, label: "+2", color: "#FFD166" },
        { op: (n) => n * 2, label: "×2", color: "#06D6A0" },
      ],
      target: 8,
      goal: 5,
      allowedMisses: 5,
      spawnInterval: 1300,
    },
    {
      label: "Turbo Mix",
      machines: [
        { op: (n) => Math.max(1, n - 2), label: "-2", color: "#FFB4A2" },
        { op: (n) => n * 2, label: "×2", color: "#CBF3F0" },
        { op: (n) => n + 4, label: "+4", color: "#90BE6D" },
      ],
      target: 10,
      goal: 6,
      allowedMisses: 6,
      spawnInterval: 1200,
    },
  ];

  // Score and counters
  let correctCount = 0;
  let missedCount = 0;
  let totalCaught = 0;

  // Conveyor / machine layout (unchanged)
  const beltY = 160;
  const chuteY = 220;
  const machineY = 260;
  const machinesX = [120, 360, 600];
  const machineWidth = 160;
  const machineHeight = 140;

  // Visual animation helper
  let wiggle = 0;

  // Utility functions
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function resetLevel(lvlIndex = 0) {
    level = Math.max(0, Math.min(lvlIndex, levels.length - 1));
    balls = [];
    selectorIndex = 1;
    catching = false;
    catchCooldown = 0;
    correctCount = 0;
    missedCount = 0;
    totalCaught = 0;
    spawnTimer = 0;
    spawnInterval = levels[level].spawnInterval || 1400;
    paused = false;
    particles = [];
  }

  resetLevel(0);

  // Ball object: moves along belt from left to right then drops into chute
  function spawnBall() {
    const value = randInt(1, 9);
    const b = {
      x: -30,
      y: beltY,
      vx: 60 + Math.random() * 40, // pixels per second
      value: value,
      state: "rolling", // rolling -> dropping -> processed or fallen
      targetMachine: null,
      dropY: beltY,
      caught: false,
      processed: false,
      id: Math.random().toString(36).substr(2, 9),
      bob: Math.random() * Math.PI * 2,
    };
    balls.push(b);

    // Visual sparkle at spawn
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: b.x + 6,
        y: b.y,
        vx: Math.cos((i / 6) * Math.PI * 2) * (40 + Math.random() * 30),
        vy: Math.sin((i / 6) * Math.PI * 2) * (10 + Math.random() * 20) - 10,
        life: 700 + Math.random() * 200,
        t: 0,
        color: "rgba(255,230,150,0.98)",
        size: 2 + Math.random() * 3,
      });
    }
    playSpawnTone();
  }

  // Process a ball into a machine index (mechanics preserved)
  function processBall(ball, machineIndex) {
    const machine = levels[level].machines[machineIndex];
    let result;
    try {
      result = machine.op(ball.value);
    } catch (e) {
      console.warn("Machine operation failed:", e);
      result = NaN;
    }
    totalCaught++;
    ball.processed = true;

    // Check correctness against target
    const target = levels[level].target;
    if (result === target) {
      correctCount++;
      playCorrectSequence();
      flashFeedback("correct", machinesX[machineIndex], machineY);
      summonParticleBurst(machinesX[machineIndex], machineY - 20, "#07c160");
      playCatchTone(true);
    } else {
      missedCount++;
      playWrongBuzz();
      flashFeedback("wrong", machinesX[machineIndex], machineY);
      summonParticleBurst(machinesX[machineIndex], machineY - 20, "#ff6b6b");
      playCatchTone(false);
    }

    // preserve same mechanic: ball will be removed by existing logic
    setTimeout(() => {
      // allow visual bubble to persist briefly
    }, 400);
  }

  // Visual feedback bubbles
  let feedbacks = [];
  function flashFeedback(kind, x, y) {
    feedbacks.push({
      kind,
      x,
      y,
      t: 0,
    });
  }

  // summon particles helper
  function summonParticleBurst(x, y, color = "#fff") {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 60;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 600 + Math.random() * 400,
        t: 0,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // Input handling (preserve behavior)
  const keyState = {};
  function onKeyDown(e) {
    initAudioOnUserGesture();

    if (e.key === "ArrowLeft") {
      keyState.left = true;
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      keyState.right = true;
      e.preventDefault();
    } else if (e.key === " ") {
      keyState.space = true;
      e.preventDefault();
    } else if (e.key === "1") {
      selectorIndex = 0;
      playClickTone();
    } else if (e.key === "2") {
      selectorIndex = 1;
      playClickTone();
    } else if (e.key === "3") {
      selectorIndex = 2;
      playClickTone();
    } else if (e.key.toLowerCase() === "a") {
      toggleAudio();
      playClickTone();
    } else if (e.key.toLowerCase() === "h") {
      showHints = !showHints;
    } else if (e.key.toLowerCase() === "p") {
      paused = !paused;
    } else if (
      e.key === "Enter" &&
      (correctCount >= levels[level].goal || missedCount >= levels[level].allowedMisses)
    ) {
      if (correctCount >= levels[level].goal) {
        resetLevel(Math.min(level + 1, levels.length - 1));
      } else {
        resetLevel(level);
      }
    }
  }

  function onKeyUp(e) {
    if (e.key === "ArrowLeft") {
      keyState.left = false;
    } else if (e.key === "ArrowRight") {
      keyState.right = false;
    } else if (e.key === " ") {
      keyState.space = false;
    }
  }

  // Mouse support for selecting machines & toggling audio
  function onMouseDown(e) {
    initAudioOnUserGesture();
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Check if clicked on machines
    for (let i = 0; i < machinesX.length; i++) {
      const mx0 = machinesX[i] - machineWidth / 2;
      const mx1 = machinesX[i] + machineWidth / 2;
      const my0 = machineY;
      const my1 = machineY + machineHeight;
      if (mx >= mx0 && mx <= mx1 && my >= my0 && my <= my1) {
        selectorIndex = i;
        playClickTone();
        return;
      }
    }

    // Check speaker icon area top-right
    if (mx > W - 58 && mx < W - 20 && my > 12 && my < 44) {
      toggleAudio();
      playClickTone();
    }
  }

  // Catch logic: attempt to catch a dropping ball
  function tryCatch() {
    if (catchCooldown > 0) return;
    catchCooldown = 180; // ms cooldown
    playClickTone();
    for (let b of balls) {
      if (b.state === "dropping" && b.targetMachine === selectorIndex && !b.caught && !b.processed) {
        b.caught = true;
        b.state = "caught";
        processBall(b, selectorIndex);
        return;
      }
    }
    // nothing caught => small penalty (mechanic unchanged)
    missedCount++;
    playWrongBuzz();
  }

  // Focus management for accessibility (visual only)
  canvas.addEventListener("focus", () => {
    // intentionally left for future accessible visuals
  });

  // Register events
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener(
    "touchstart",
    function (e) {
      e.preventDefault();
      const touch = e.touches[0];
      onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    },
    { passive: false }
  );

  // Main update and draw loop
  function update(dt) {
    if (paused) return;

    wiggle += dt * 0.002;

    // Spawn logic
    spawnTimer += dt;
    spawnInterval = levels[level].spawnInterval || spawnInterval;
    if (spawnTimer > spawnInterval) {
      spawnTimer = spawnTimer % spawnInterval;
      spawnBall();
    }

    // Update balls
    for (let b of balls) {
      // subtle bob while rolling
      b.bob += dt * 0.006;
      if (b.state === "rolling") {
        b.x += (b.vx * dt) / 1000;
        b.y = beltY + Math.sin(b.bob) * 4;

        // If approaching machine chute horizontally, start dropping
        for (let i = 0; i < machinesX.length; i++) {
          const mx = machinesX[i];
          if (b.x > mx - 22 && b.x < mx + 22) {
            b.state = "dropping";
            b.targetMachine = i;
            b.dropY = b.y;
            playDropTone();

            // small visual cue particles for drop
            particles.push({
              x: b.x,
              y: b.y + 8,
              vx: (Math.random() - 0.5) * 60,
              vy: -40 - Math.random() * 20,
              life: 500,
              t: 0,
              color: "rgba(200,230,255,0.95)",
              size: 2 + Math.random() * 2,
            });
            break;
          }
        }
        if (b.x > W + 30) {
          b.state = "gone";
          missedCount++;
        }
      } else if (b.state === "dropping") {
        // vertical drop with easing
        b.y += (dt / 1000) * 160;
        if (b.y >= chuteY + 28) {
          if (!b.caught && !b.processed) {
            b.processed = true;
            missedCount++;
            playWrongBuzz();
            flashFeedback("wrong", machinesX[b.targetMachine], machineY);
          }
          b.state = "landed";
        }
      } else if (b.state === "caught" || b.state === "landed" || b.state === "processed") {
        b.y += (dt / 1000) * 20;
        b.x += (dt / 1000) * 6; // drift
      }
    }

    // Cull old balls
    balls = balls.filter(
      (b) =>
        !(
          b.x > W + 200 ||
          b.y > H + 200 ||
          b.state === "gone" ||
          (b.processed && b.y > H + 80)
        )
    );

    // Handle catching input
    if (keyState.space) {
      tryCatch();
      keyState.space = false;
    }

    // keyboard left/right control selector
    if (keyState.left) {
      selectorIndex = Math.max(0, selectorIndex - 1);
      keyState.left = false;
    } else if (keyState.right) {
      selectorIndex = Math.min(2, selectorIndex + 1);
      keyState.right = false;
    }

    // cooldown timer
    catchCooldown = Math.max(0, catchCooldown - dt);

    // Update feedback animations
    for (let f of feedbacks) {
      f.t += dt;
    }
    feedbacks = feedbacks.filter((f) => f.t < 900);

    // Update particles
    for (let p of particles) {
      p.t += dt;
      const lifeRatio = Math.min(1, p.t / p.life);
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000 + (dt / 1000) * 18; // gravity
      // fade and slow down
      p.vx *= 0.995;
      p.vy *= 0.995;
    }
    particles = particles.filter((p) => p.t < p.life);
  }

  // Utility rounded rect draw
  function drawRoundedRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Draw rotating gear shape helper
  function drawGear(cx, cy, radius, teeth, rotation, color, stroke = "rgba(0,0,0,0.06)") {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a1 = (i / teeth) * Math.PI * 2;
      const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
      const r1 = radius * 0.86;
      const r2 = radius * 1.16;
      const x1 = Math.cos(a1) * r1;
      const y1 = Math.sin(a1) * r1;
      const x2 = Math.cos(a2) * r2;
      const y2 = Math.sin(a2) * r2;
      if (i === 0) ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(Math.cos((i + 1) / teeth * Math.PI * 2) * r1, Math.sin((i + 1) / teeth * Math.PI * 2) * r1);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  }

  // Draw the scene
  function draw() {
    // background gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#f3fbff");
    g.addColorStop(0.6, "#e9f6ff");
    g.addColorStop(1, "#e6f3ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // subtle floating background clouds (simple shapes)
    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 6; i++) {
      const cx = (i / 5) * W + Math.sin(wiggle * 0.6 + i) * 20;
      const cy = 48 + (i % 2) * 18 + Math.cos(wiggle * 0.4 + i) * 6;
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.ellipse(cx, cy, 72, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 42, cy + 6, 34, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 40, cy + 6, 36, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // decorative mechanical background subtle gears
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 180;
      const y = 110 - (i % 2) * 16;
      drawGear(
        x,
        y,
        22 + (i % 3) * 3,
        10 + (i % 3) * 2,
        wiggle * 0.002 * (i % 3 + 1),
        "rgba(60,80,110,0.06)",
        "rgba(60,80,110,0.06)"
      );
    }

    // Header: Level name and target
    ctx.fillStyle = "#223";
    ctx.font = "700 20px 'Segoe UI', Roboto, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Level: " + levels[level].label, 12, 28);

    // Target display with soft panel
    ctx.save();
    drawRoundedRect(ctx, W / 2 - 110, 6, 220, 44, 10);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.04)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#0d3b66";
    ctx.font = "800 26px 'Segoe UI', Roboto, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Target: " + levels[level].target, W / 2, 36);
    ctx.restore();

    // Speaker icon and audio status (top-right)
    ctx.save();
    const speakerX = W - 64;
    const speakerY = 10;
    drawRoundedRect(ctx, speakerX, speakerY, 52, 36, 8);
    ctx.fillStyle = audioEnabled ? "rgba(7,193,96,0.9)" : "rgba(217,83,79,0.9)";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 12px 'Segoe UI'";
    ctx.textAlign = "center";
    ctx.fillText(audioEnabled ? "Audio ON" : "Audio OFF", speakerX + 26, speakerY + 22);
    ctx.restore();

    // Decorative stage base and conveyor belt
    ctx.save();
    // stage shadow
    ctx.beginPath();
    ctx.rect(10, beltY + 18, W - 20, 6);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fill();

    // belt
    ctx.fillStyle = "#dfeefb";
    drawRoundedRect(ctx, 20, beltY - 20, W - 40, 60, 12);
    ctx.fill();

    // belt stripes (animated)
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      const offset = (wiggle * 8) % 72;
      ctx.moveTo(24 + i * 72 + offset, beltY + 8);
      ctx.lineTo(24 + i * 72 + offset, beltY + 36);
      ctx.stroke();
    }
    ctx.restore();

    // Draw machines with richer visuals
    for (let i = 0; i < machinesX.length; i++) {
      const mx = machinesX[i];
      const m = levels[level].machines[i];
      ctx.save();
      ctx.translate(mx, machineY);

      // machine body gradient
      const mg = ctx.createLinearGradient(-machineWidth / 2, 0, machineWidth / 2, machineHeight);
      mg.addColorStop(0, shadeColor(m.color, -6));
      mg.addColorStop(1, shadeColor(m.color, 6));
      ctx.fillStyle = mg;
      drawRoundedRect(ctx, -machineWidth / 2, 0, machineWidth, machineHeight, 18);
      ctx.fill();

      // machine glass window with inner animated processor
      const winX = -machineWidth / 2 + 14;
      const winW = machineWidth - 28;
      drawRoundedRect(ctx, winX, 12, winW, 64, 10);

      // glass effect
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fill();
      ctx.fillStyle = "rgba(10,40,80,0.06)";
      ctx.fillRect(winX + 8, 18, winW - 16, 44);

      // inner processor glowing circles
      const glowX = -machineWidth / 2 + 30;
      for (let gIdx = 0; gIdx < 3; gIdx++) {
        const gx = glowX + gIdx * 36;
        const gy = 44;
        const r = 8 + Math.sin(wiggle * 0.02 + i + gIdx) * 2;
        ctx.beginPath();
        ctx.arc(gx, gy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.08 + 0.06 * Math.sin(wiggle * 0.02 + gIdx)})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();
      }

      // operation label
      ctx.fillStyle = "#0d2b3a";
      ctx.font = "700 20px 'Segoe UI'";
      ctx.textAlign = "center";
      ctx.fillText(m.label, 0, 42);

      // top small gear for each machine
      drawGear(
        -machineWidth / 2 + 28,
        18,
        10,
        8,
        wiggle * 0.002 * (i + 1),
        "rgba(40,60,90,0.12)",
        "rgba(0,0,0,0.04)"
      );
      drawGear(
        machineWidth / 2 - 28,
        18,
        8,
        8,
        -wiggle * 0.002 * (i + 1.3),
        "rgba(40,60,90,0.10)",
        "rgba(0,0,0,0.03)"
      );

      // chutes and legs
      ctx.fillStyle = "rgba(30,40,60,0.9)";
      drawRoundedRect(ctx, -36, 78, 72, 28, 8);
      ctx.fill();
      ctx.fillStyle = "rgba(30,40,60,0.85)";
      ctx.fillRect(-machineWidth / 2 + 16, machineHeight - 16, 28, 12);
      ctx.fillRect(machineWidth / 2 - 44, machineHeight - 16, 28, 12);

      // small status lights
      for (let li = 0; li < 3; li++) {
        const lx = -machineWidth / 2 + 22 + li * 36;
        const ly = machineHeight - 36;
        const on = (selectorIndex === i && li === 1) || Math.random() > 0.65;
        ctx.beginPath();
        ctx.arc(lx, ly, 5, 0, Math.PI * 2);
        ctx.fillStyle = on ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.08)";
        ctx.fill();
        if (on) {
          ctx.beginPath();
          ctx.arc(lx, ly, 3, 0, Math.PI * 2);
          ctx.fillStyle = li === 1 ? "#ffd166" : li === 0 ? "#07c160" : "#ff6b6b";
          ctx.fill();
        }
      }

      // highlight selected machine
      if (selectorIndex === i) {
        ctx.strokeStyle = "rgba(255,218,121,0.95)";
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, -machineWidth / 2 + 6, 6, machineWidth - 12, machineHeight - 12, 18);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw selector pointer (you) as animated banner
    const sx = machinesX[selectorIndex];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, beltY - 48 + Math.sin(wiggle * 0.006) * 6);
    ctx.lineTo(sx - 18, beltY - 20);
    ctx.lineTo(sx + 18, beltY - 20);
    ctx.closePath();
    ctx.fillStyle = "#ff7f50";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 12px 'Segoe UI'";
    ctx.textAlign = "center";
    ctx.fillText("YOU", sx, beltY - 28 + Math.sin(wiggle * 0.006) * 6);
    ctx.restore();

    // Friendly robot mascot on left: purely decorative, eyes follow selector
    drawMascot(44, H - 120, selectorIndex);

    // Draw balls with soft shading and sheen
    for (let b of balls) {
      ctx.save();
      ctx.translate(b.x, b.y);

      // shadow
      ctx.beginPath();
      ctx.ellipse(0, 18, 22, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.fill();

      // body radial gradient
      const grad = ctx.createRadialGradient(-6, -6, 4, 0, 0, 24);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.45, "#fafafa");
      grad.addColorStop(1, "#e6eef6");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      // outline
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(34,50,65,0.12)";
      ctx.stroke();

      // number text
      ctx.fillStyle = "#223";
      ctx.font = "700 16px 'Segoe UI'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.value.toString(), 0, 0);

      // small sheen
      ctx.beginPath();
      ctx.ellipse(-6, -6, 6, 3.6, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fill();
      ctx.restore();
    }

    // Draw floating small counters and UI
    ctx.fillStyle = "#0d2b3a";
    ctx.font = "700 18px 'Segoe UI'";
    ctx.textAlign = "left";
    ctx.fillText("Correct: " + correctCount + " / " + levels[level].goal, 12, H - 56);
    ctx.fillText("Misses: " + missedCount + " / " + levels[level].allowedMisses, 12, H - 28);

    // Draw friendly hints area
    if (showHints) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(ctx, W - 260, H - 110, 248, 98, 10);
      ctx.fill();
      ctx.fillStyle = "#0d2b3a";
      ctx.font = "600 12px 'Segoe UI'";
      ctx.textAlign = "left";
      ctx.fillText("How to play:", W - 246, H - 88);
      ctx.font = "500 12px 'Segoe UI'";
      ctx.fillText("1) Use ← → or keys 1/2/3 to pick a machine", W - 246, H - 68);
      ctx.fillText("2) Press Space when a number drops into the machine", W - 246, H - 52);
      ctx.fillText("3) Aim to get numbers that make the target", W - 246, H - 36);
      ctx.fillText("A: Toggle audio  •  P: Pause  •  H: Toggle hints", W - 246, H - 18);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      drawRoundedRect(ctx, W - 180, H - 76, 160, 56, 8);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = "500 12px 'Segoe UI'";
      ctx.fillText("Press H for help", W - 100, H - 40);
      ctx.restore();
    }

    // Draw particles (sparks, bubbles)
    for (let p of particles) {
      const lifeRatio = 1 - Math.min(1, p.t / p.life);
      ctx.globalAlpha = lifeRatio;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw feedback animations
    for (let f of feedbacks) {
      const p = f.t / 900;
      ctx.globalAlpha = 1 - p;
      if (f.kind === "correct") {
        ctx.fillStyle = "#07c160";
        ctx.beginPath();
        ctx.arc(f.x, f.y - p * 40, 22 * (1 - p * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "700 16px 'Segoe UI'";
        ctx.textAlign = "center";
        ctx.fillText("+1", f.x, f.y - p * 40 + 4);
      } else {
        ctx.fillStyle = "#ff6b6b";
        ctx.beginPath();
        ctx.arc(f.x, f.y - p * 40, 22 * (1 - p * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "700 16px 'Segoe UI'";
        ctx.textAlign = "center";
        ctx.fillText("-1", f.x, f.y - p * 40 + 4);
      }
      ctx.globalAlpha = 1;
    }

    // Draw end-level panel if won or lost
    if (correctCount >= levels[level].goal || missedCount >= levels[level].allowedMisses) {
      ctx.save();
      ctx.fillStyle = "rgba(10,10,20,0.6)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "800 36px 'Segoe UI'";
      if (correctCount >= levels[level].goal) {
        ctx.fillText("Level Complete!", W / 2, H / 2 - 12);
        ctx.font = "600 20px 'Segoe UI'";
        ctx.fillText("Press Enter to go to the next level", W / 2, H / 2 + 24);
      } else {
        ctx.fillText("Out of Chances", W / 2, H / 2 - 12);
        ctx.font = "600 20px 'Segoe UI'";
        ctx.fillText("Press Enter to try again", W / 2, H / 2 + 24);
      }
      ctx.restore();
    }

    // Footer: accessibility instruction
    ctx.fillStyle = "#2b2d42";
    ctx.font = "500 12px 'Segoe UI'";
    ctx.textAlign = "left";
    ctx.fillText("Controls: ← → or 1/2/3 to select, Space to catch, A audio, H help", 12, H - 8);
  }

  // Draw a friendly mascot robot
  function drawMascot(x, y, selector) {
    ctx.save();
    ctx.translate(x, y);

    // body
    drawRoundedRect(ctx, -28, -38, 56, 64, 10);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.stroke();

    // face panel with eyes that follow selected machine
    const targetX = machinesX[selector] || machinesX[1];
    const angle = Math.atan2(beltY - y, targetX - x);
    const eyeOffsetX = Math.cos(angle) * 6;
    const eyeOffsetY = Math.sin(angle) * 3;

    // eyes
    ctx.fillStyle = "#0d2b3a";
    ctx.beginPath();
    ctx.ellipse(-10 + eyeOffsetX * 0.4, -12 + eyeOffsetY * 0.4, 6, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10 + eyeOffsetX * 0.4, -12 + eyeOffsetY * 0.4, 6, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // pupils
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-8 + eyeOffsetX, -12 + eyeOffsetY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12 + eyeOffsetX, -12 + eyeOffsetY, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // antenna
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(0, -54);
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -58, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd166";
    ctx.fill();

    // friendly smile
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    ctx.arc(0, -6, 12, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    ctx.restore();
  }

  // Shade color helper
  function shadeColor(hex, percent) {
    // hex may be like #rrggbb
    const c = hex.replace("#", "");
    const num = parseInt(c, 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00ff) + percent;
    let b = (num & 0x0000ff) + percent;
    r = Math.max(Math.min(255, r), 0);
    g = Math.max(Math.min(255, g), 0);
    b = Math.max(Math.min(255, b), 0);
    return "#" + (r << 16 | g << 8 | b).toString(16).padStart(6, "0");
  }

  // Game loop
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Periodic cleanup on unload
  window.addEventListener("beforeunload", () => {
    try {
      if (bgOsc1) bgOsc1.stop();
      if (bgOsc2) bgOsc2.stop();
      if (bgLfo) bgLfo.stop();
      if (audioCtx && typeof audioCtx.close === "function") audioCtx.close();
    } catch (e) {
      // ignore
    }
  });

  // Friendly start prompt overlay logic
  const startPrompt = { shown: false };

  function drawStartOverlay() {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    drawRoundedRect(ctx, W / 2 - 200, H / 2 - 84, 400, 168, 14);
    ctx.fill();
    ctx.fillStyle = "#223";
    ctx.font = "700 20px 'Segoe UI'";
    ctx.textAlign = "center";
    ctx.fillText("Welcome to Machine Mash!", W / 2, H / 2 - 36);
    ctx.font = "500 14px 'Segoe UI'";
    ctx.fillText("Move machines with ← →, press Space to catch a number.", W / 2, H / 2 - 8);
    ctx.fillText("Press A to toggle audio. Click or press any key to begin.", W / 2, H / 2 + 16);
    ctx.restore();
  }

  function firstUserGesture() {
    if (!startPrompt.shown) {
      startPrompt.shown = true;
      initAudioOnUserGesture();
    }
  }

  function onFirstGestureEvent() {
    firstUserGesture();
    canvas.removeEventListener("click", onFirstGestureEvent);
    window.removeEventListener("keydown", onFirstGestureEvent);
  }
  canvas.addEventListener("click", onFirstGestureEvent);
  window.addEventListener("keydown", onFirstGestureEvent);

  // Keep drawing overlay until touched
  (function overlayLoop() {
    if (!startPrompt.shown) {
      draw();
      drawStartOverlay();
      requestAnimationFrame(overlayLoop);
    }
  })();

  // Touch / click: ensure audio starts if necessary
  canvas.addEventListener("pointerdown", () => {
    initAudioOnUserGesture();
  });

  // Expose restart function on the element for testing or manual control (accessible)
  container.restartGame = function () {
    resetLevel(0);
  };

  // Error handling: warn when audio cannot be used
  if (!AudioCtx) {
    console.warn("Web Audio API not supported in this browser. Sounds disabled.");
    audioEnabled = false;
  }
})();