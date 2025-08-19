(function () {
  // Enhanced Electricity-themed Math Game (visuals & audio upgraded)
  // Renders entirely inside element with id "game-of-the-day-stage"
  // ONLY visuals and audio were improved; game mechanics and math logic left intact.

  // Configuration (unchanged core gameplay sizes)
  const WIDTH = 720;
  const HEIGHT = 480;
  const BUBBLE_RADIUS = 20;
  const BULB_COUNT = 4;
  const START_LIVES = 3;
  const TARGET_MIN = 6;
  const TARGET_MAX = 14;
  const SPAWN_INTERVAL_MS = 1500;
  const DIFFICULTY_INCREASE_EVERY = 15000;
  const MAX_BUBBLE_VALUE = 5;

  // Refined calming palette and subtle accents
  const COLORS = {
    bgTop: "#E6F7FF",
    bgBottom: "#FDFEFF",
    panel: "#F7FCFF",
    bolt: "#FFCF66",
    spark: "#6DE0A7",
    bulbOff: "#F1F5FA",
    bulbOn: "#FFF6B8",
    text: "#08304B",
    wrong: "#FF6B6B",
    correct: "#2ECC71",
    collector: "#74A7FF",
    bubbleFillA: "#BEEFE2",
    bubbleFillB: "#DFF8F0",
    accent: "#6D9BF1",
    shadow: "rgba(5,20,30,0.12)",
  };

  // Container and canvas setup
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("No container with id 'game-of-the-day-stage' found.");
    return;
  }
  container.style.position = "relative";
  container.style.width = WIDTH + "px";
  container.style.height = HEIGHT + "px";
  container.style.overflow = "hidden";

  // Accessibility area for screen readers
  const srInstructions = document.createElement("div");
  srInstructions.setAttribute("aria-live", "polite");
  srInstructions.style.position = "absolute";
  srInstructions.style.left = "-9999px";
  srInstructions.style.width = "1px";
  srInstructions.style.height = "1px";
  srInstructions.style.overflow = "hidden";
  srInstructions.id = "game-of-the-day-sr";
  srInstructions.innerText =
    "Electric Math: Move the collector with arrow keys or mouse. Catch number charges and press 1-4 to send them to matching bulbs. Match sums exactly to light bulbs.";
  container.appendChild(srInstructions);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Electric Math game canvas");
  canvas.style.display = "block";
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: true });

  // Audio setup with robust error handling
  let audioCtx = null;
  let audioEnabled = true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio API not supported");
    audioCtx = new AC();
  } catch (err) {
    console.warn("Audio unavailable:", err && err.message ? err.message : err);
    audioEnabled = false;
    audioCtx = null;
  }

  // Master audio nodes (created only if available)
  let masterGain = null;
  let humNode = null;
  let humGain = null;
  let humLFO = null;

  if (audioCtx) {
    try {
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.12; // safe default
      masterGain.connect(audioCtx.destination);
    } catch (err) {
      console.warn("Failed to create master gain:", err);
      masterGain = null;
      audioEnabled = false;
    }
  }

  // State (core gameplay state preserved)
  let lastTime = performance.now();
  let spawnTimer = 0;
  let spawnInterval = SPAWN_INTERVAL_MS;
  let difficultyTimer = 0;
  let running = false;
  let muted = !audioEnabled;
  let score = 0;
  let lives = START_LIVES;
  let level = 1;
  let bulbs = [];
  let bubbles = [];
  let collector = {
    x: WIDTH / 2,
    targetX: WIDTH / 2, // smoothing target
    y: HEIGHT - 80,
    width: 120,
    height: 40,
    speed: 300,
    carrying: null,
  };
  let keys = {};
  let lastSpawnId = 0;
  let messages = [];
  let particles = []; // background current particles
  const MAX_PARTICLES = 28;

  // Accessibility announce helper
  function announce(text) {
    try {
      srInstructions.innerText = text;
    } catch (e) {
      // ignore
    }
  }

  // Initialize bulbs
  function initBulbs() {
    bulbs = [];
    const padding = 40;
    const usableWidth = WIDTH - padding * 2;
    const spacing = usableWidth / BULB_COUNT;
    for (let i = 0; i < BULB_COUNT; i++) {
      const target = randInt(TARGET_MIN, TARGET_MAX);
      bulbs.push({
        id: i + 1,
        x: padding + spacing * i + spacing / 2,
        y: HEIGHT - 160,
        radius: 36,
        current: 0,
        target,
        lit: false,
        overloaded: false,
        glowPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  // Utility functions
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }
  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  // Bubble spawn (kept identical mechanics)
  function spawnBubble() {
    const x = rand(40, WIDTH - 40);
    const val = randInt(1, MAX_BUBBLE_VALUE);
    const id = ++lastSpawnId;
    bubbles.push({
      id,
      x,
      y: -BUBBLE_RADIUS,
      vy: rand(30, 60) + level * 5,
      radius: BUBBLE_RADIUS,
      value: val,
      caught: false,
      targetBulb: null,
      returning: false,
      wobble: Math.random() * Math.PI * 2,
      spin: Math.random() * 0.5 - 0.25,
      hue: 160 + Math.random() * 30,
    });
    // gentle spawn particle
    spawnParticle(x, 20, "#BEECE6");
  }

  // Background particle system for soft motion
  function initParticles() {
    particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push({
        x: Math.random() * WIDTH,
        y: Math.random() * (HEIGHT - 140),
        size: 6 + Math.random() * 10,
        speed: 5 + Math.random() * 15,
        alpha: 0.06 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        color: `rgba(110,160,255,0.1)`,
      });
    }
  }

  function spawnParticle(x, y, color) {
    particles.push({
      x,
      y,
      size: 6 + Math.random() * 10,
      speed: 30 + Math.random() * 40,
      alpha: 0.12,
      phase: 0,
      color: color || `rgba(110,160,255,0.12)`,
      ttl: 700,
      created: performance.now(),
    });
  }

  // Safe audio helpers and improved sound design
  function safeGain() {
    if (!audioCtx || !masterGain) return null;
    try {
      const g = audioCtx.createGain();
      g.connect(masterGain);
      return g;
    } catch (e) {
      console.warn("Gain creation failed:", e);
      return null;
    }
  }

  function createEnvelopedOsc({ freq = 440, type = "sine", duration = 0.2, attack = 0.01, release = 0.12, filter = null, gain = 0.08 } = {}) {
    if (!audioCtx || !masterGain) return null;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration - release);
      if (filter) {
        const f = audioCtx.createBiquadFilter();
        f.type = filter.type || "lowpass";
        f.frequency.value = filter.freq || 1200;
        osc.connect(f);
        f.connect(g);
      } else {
        osc.connect(g);
      }
      g.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      // cleanup via onended when possible
      osc.onended = () => {
        try {
          if (g.disconnect) g.disconnect();
        } catch (e) {}
      };
      return { osc, g };
    } catch (err) {
      console.warn("Oscillator creation failed:", err);
      return null;
    }
  }

  // Play categorized beeps with gentler envelopes and filtered timbres
  function playBeep(type = "correct") {
    if (muted || !audioCtx || !masterGain) return;
    try {
      if (type === "correct") {
        // soft ascending triad
        createEnvelopedOsc({
          freq: 680,
          type: "sine",
          duration: 0.22,
          gain: 0.09,
          attack: 0.01,
          release: 0.05,
          filter: { type: "lowpass", freq: 2200 },
        });
        setTimeout(() => createEnvelopedOsc({
          freq: 820,
          type: "sine",
          duration: 0.18,
          gain: 0.06,
          attack: 0.01,
          release: 0.06,
          filter: { type: "lowpass", freq: 2400 },
        }), 70);
      } else if (type === "wrong") {
        // muted, soft thud with low filter
        createEnvelopedOsc({
          freq: 140,
          type: "sine",
          duration: 0.28,
          gain: 0.06,
          attack: 0.005,
          release: 0.12,
          filter: { type: "lowpass", freq: 600 },
        });
        // small noisy click
        const now = audioCtx.currentTime;
        try {
          const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.04, audioCtx.sampleRate);
          const data = noiseBuf.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
          const src = audioCtx.createBufferSource();
          src.buffer = noiseBuf;
          const g = audioCtx.createGain();
          g.gain.value = 0.015;
          const filt = audioCtx.createBiquadFilter();
          filt.type = "highpass";
          filt.frequency.value = 900;
          src.connect(filt);
          filt.connect(g);
          g.connect(masterGain);
          src.start(now);
          src.stop(now + 0.04);
        } catch (e) {
          // ignore noise generation errors
        }
      } else if (type === "pickup") {
        createEnvelopedOsc({
          freq: 520,
          type: "triangle",
          duration: 0.12,
          gain: 0.06,
          attack: 0.005,
          release: 0.04,
          filter: { type: "lowpass", freq: 1800 },
        });
      } else if (type === "light") {
        // pleasant chime sequence
        createEnvelopedOsc({ freq: 920, type: "sine", duration: 0.22, gain: 0.07, attack: 0.005, release: 0.05 });
        setTimeout(() => createEnvelopedOsc({ freq: 1180, type: "sine", duration: 0.22, gain: 0.06, attack: 0.005, release: 0.05 }), 100);
        setTimeout(() => createEnvelopedOsc({ freq: 1400, type: "sine", duration: 0.18, gain: 0.05, attack: 0.005, release: 0.05 }), 200);
      } else if (type === "spark") {
        createEnvelopedOsc({
          freq: 1000 + Math.random() * 200,
          type: "sawtooth",
          duration: 0.08,
          gain: 0.04,
          attack: 0.004,
          release: 0.02,
          filter: { type: "highpass", freq: 800 },
        });
      } else {
        createEnvelopedOsc({ freq: 660, type: "sine", duration: 0.16, gain: 0.06 });
      }
    } catch (err) {
      console.warn("Sound playback error:", err);
    }
  }

  // Background hum implementation with gentle movement and error handling
  function startBackgroundHum() {
    if (muted || !audioCtx || !masterGain) return;
    if (humNode) return;
    try {
      humNode = audioCtx.createOscillator();
      humGain = audioCtx.createGain();
      humLFO = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();

      humNode.type = "sine";
      humNode.frequency.value = 54 + Math.random() * 6;
      humGain.gain.value = 0.014;

      humLFO.type = "sine";
      humLFO.frequency.value = 0.07 + Math.random() * 0.06;
      lfoGain.gain.value = 6 + Math.random() * 4;

      humLFO.connect(lfoGain);
      lfoGain.connect(humNode.frequency);

      humNode.connect(humGain);
      humGain.connect(masterGain);

      humNode.start();
      humLFO.start();
    } catch (err) {
      console.warn("Background hum failed:", err);
      humNode = null;
      humGain = null;
      humLFO = null;
    }
  }

  function stopBackgroundHum() {
    try {
      if (humNode) {
        humNode.stop();
        humNode.disconnect();
      }
      if (humLFO) {
        humLFO.stop();
        humLFO.disconnect();
      }
      if (humGain) {
        humGain.disconnect();
      }
    } catch (e) {
      // ignore stop errors
    }
    humNode = null;
    humGain = null;
    humLFO = null;
  }

  // Input handling (preserve behavior)
  document.addEventListener("keydown", (e) => {
    keys[e.key] = true;

    if (e.key === " " || e.key === "Spacebar") {
      attemptPickup();
      e.preventDefault();
    }
    if (["1", "2", "3", "4"].includes(e.key)) {
      const bulbIndex = Number(e.key) - 1;
      sendToBulb(bulbIndex);
    }
    if (e.key.toLowerCase() === "m") toggleMute();

    // Start game & resume audio on first user gesture
    if (!running) startGame();
  });
  document.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });

  // Mouse controls
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    collector.targetX = Math.min(WIDTH - collector.width / 2, Math.max(collector.width / 2, e.clientX - rect.left));
  });
  canvas.addEventListener("click", (e) => {
    if (!running) {
      startGame();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= (b.radius + 10) * (b.radius + 10)) {
        sendToBulb(i);
        return;
      }
    }
    attemptPickup();
  });

  // Attempt to pick up nearest bubble (preserved)
  function attemptPickup() {
    if (collector.carrying) return;
    for (let bub of bubbles) {
      if (bub.caught || bub.returning) continue;
      const withinX =
        bub.x >= collector.x - collector.width / 2 - bub.radius &&
        bub.x <= collector.x + collector.width / 2 + bub.radius;
      const withinY =
        bub.y + bub.radius >= collector.y - collector.height / 2 &&
        bub.y - bub.radius <= collector.y + collector.height / 2;
      if (withinX && withinY) {
        bub.caught = true;
        collector.carrying = bub;
        playBeep("pickup");
        announce(`Picked up a ${bub.value} charge. Press 1 to 4 to send them to bulbs.`);
        // small pickup visual burst
        for (let i = 0; i < 6; i++) spawnParticle(bub.x + rand(-8, 8), bub.y + rand(-8, 8), "rgba(109,208,167,0.9)");
        break;
      }
    }
  }

  // Send carried bubble to bulb (preserved)
  function sendToBulb(index) {
    if (!collector.carrying) {
      announce("No charge to send. Move to a falling charge and catch it.");
      return;
    }
    if (index < 0 || index >= bulbs.length) return;
    const bub = collector.carrying;
    bub.caught = false;
    bub.returning = true;
    bub.targetBulb = index;
    const b = bulbs[index];
    const dx = b.x - bub.x;
    const dy = b.y - bub.y;
    const dist = Math.hypot(dx, dy);
    const travelTime = 0.5;
    bub.vx = dx / travelTime;
    bub.vy = dy / travelTime;
    collector.carrying = null;
    playBeep("spark");
    announce(`Sent a ${bub.value} charge to bulb ${index + 1}.`);
    // subtle send particle
    spawnParticle(bub.x, bub.y, "rgba(255,207,102,0.9)");
  }

  // Start and reset game (preserved logic but improved audio resume)
  function startGame() {
    running = true;
    score = 0;
    lives = START_LIVES;
    level = 1;
    spawnInterval = SPAWN_INTERVAL_MS;
    difficultyTimer = 0;
    messages = [];
    initBulbs();
    bubbles = [];
    collector.x = WIDTH / 2;
    collector.targetX = WIDTH / 2;
    collector.carrying = null;
    lastTime = performance.now();
    spawnTimer = 0;
    lastSpawnId = 0;
    muted = muted && !audioCtx ? true : muted;
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch((err) => console.warn("AudioContext resume failed:", err));
    }
    if (audioCtx) startBackgroundHum();
    initParticles();
    announce("Game started. Catch charges and send to bulbs to light them.");
    requestAnimationFrame(loop);
  }

  // End game (preserved)
  function endGame(win = false) {
    running = false;
    stopBackgroundHum();
    if (win) {
      announce(`Congratulations! You lit all the bulbs. Score ${score}. Press any key to play again.`);
      playBeep("light");
    } else {
      announce(`Game over. Score ${score}. Press any key to try again.`);
    }
  }

  // Messages (floating)
  function pushMessage(text, x, y, color = COLORS.text) {
    messages.push({
      text,
      x,
      y,
      life: 2000,
      created: performance.now(),
      color,
    });
  }

  // Main loop (keeps mechanics intact)
  function loop(ts) {
    const dt = Math.min(50, ts - lastTime) / 1000;
    lastTime = ts;
    if (!running) {
      drawIntro();
      return;
    }

    spawnTimer += dt * 1000;
    difficultyTimer += dt * 1000;

    if (difficultyTimer >= DIFFICULTY_INCREASE_EVERY) {
      difficultyTimer = 0;
      level++;
      spawnInterval = Math.max(600, spawnInterval - 120);
      pushMessage(`Level ${level}! Bubbles fall faster.`, WIDTH / 2, 60, COLORS.spark);
    }

    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnBubble();
    }

    // Keyboard movement (same effect) but collector.x will ease toward targetX
    if (keys["ArrowLeft"] || keys["a"]) {
      collector.targetX -= collector.speed * dt;
    }
    if (keys["ArrowRight"] || keys["d"]) {
      collector.targetX += collector.speed * dt;
    }
    collector.targetX = Math.max(collector.width / 2, Math.min(WIDTH - collector.width / 2, collector.targetX));
    // Smooth movement to targetX for pleasant visuals without changing collision responsiveness much
    collector.x += (collector.targetX - collector.x) * Math.min(1, dt * 12);

    // Update bubbles
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (b.caught && b !== collector.carrying) b.caught = false;
      if (b.caught && b === collector.carrying) {
        b.x = collector.x;
        b.y = collector.y - collector.height / 2 - b.radius - 4;
      } else if (b.returning && b.targetBulb != null) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const tb = bulbs[b.targetBulb];
        const dx = b.x - tb.x;
        const dy = b.y - tb.y;
        if (Math.hypot(dx, dy) < tb.radius + b.radius) {
          b.returning = false;
          b.vx = 0;
          b.vy = 0;
          resolveBubbleArrival(b, tb);
          bubbles.splice(i, 1);
        }
      } else {
        b.y += b.vy * dt;
        // gentle wobble for charm
        b.wobble += dt * 4;
        b.x += Math.sin(b.wobble) * 6 * dt * 20 * (0.5 + (b.value / MAX_BUBBLE_VALUE) * 0.7) * 0.03;
      }

      if (b.y - b.radius > HEIGHT + 40) {
        if (b.caught) collector.carrying = null;
        bubbles.splice(i, 1);
        lives--;
        pushMessage("Missed!", WIDTH / 2, 80, COLORS.wrong);
        playBeep("wrong");
        announce(`You missed a charge. Lives remaining ${lives}.`);
        if (lives <= 0) {
          endGame(false);
          return;
        }
      }
    }

    // Update messages lifetime
    const now = performance.now();
    messages = messages.filter((m) => now - m.created < m.life);

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.ttl) {
        if (now - p.created > p.ttl) {
          particles.splice(i, 1);
          continue;
        }
        p.y -= (p.speed || 10) * dt;
        p.alpha *= 0.99;
      } else {
        p.x += Math.sin(p.phase + now / 3000) * 6 * dt;
        p.y += (p.speed * dt) * 0.18;
        p.phase += dt * 0.5;
        if (p.y > HEIGHT - 120) p.y = -20;
      }
    }

    // Bulbs win check
    if (bulbs.every((b) => b.lit)) {
      endGame(true);
      return;
    }

    // Draw
    draw();

    requestAnimationFrame(loop);
  }

  // Resolve bubble arrival (kept core logic but added small visual/audio cues)
  function resolveBubbleArrival(bubble, bulb) {
    bulb.current += bubble.value;
    if (bulb.current === bulb.target) {
      bulb.lit = true;
      bulb.overloaded = false;
      score += 10;
      pushMessage("Perfect! Bulb lit.", bulb.x, bulb.y - 60, COLORS.correct);
      playBeep("light");
      announce(`Bulb ${bulb.id} lit! Good job. Score ${score}.`);
      // gentle sparkles
      for (let i = 0; i < 8; i++) spawnParticle(bulb.x + rand(-20, 20), bulb.y + rand(-10, 10), "rgba(255,207,102,0.95)");
    } else if (bulb.current < bulb.target) {
      score += 1;
      pushMessage(`+${bubble.value}`, bulb.x, bulb.y - 30, COLORS.spark);
      playBeep("correct");
      announce(`Added ${bubble.value} to bulb ${bulb.id}. It now has ${bulb.current} of ${bulb.target}.`);
      spawnParticle(bulb.x + rand(-6, 6), bulb.y - 6, "rgba(109,208,167,0.9)");
    } else {
      bulb.overloaded = true;
      bulb.lit = false;
      score = Math.max(0, score - 3);
      lives = Math.max(0, lives - 1);
      pushMessage("Overloaded!", bulb.x, bulb.y - 50, COLORS.wrong);
      playBeep("wrong");
      announce(`Oh no! Bulb ${bulb.id} overloaded. Lives ${lives}.`);
      setTimeout(() => {
        bulb.current = 0;
        bulb.overloaded = false;
      }, 900);
      for (let i = 0; i < 10; i++) spawnParticle(bulb.x + rand(-28, 28), bulb.y + rand(-20, 20), "rgba(255,107,107,0.9)");
      if (lives <= 0) {
        endGame(false);
      }
    }
  }

  // Drawing functions - enhanced visuals but canvas-only
  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawTopPanel();

    for (let i = 0; i < bulbs.length; i++) {
      drawBulb(bulbs[i], i);
      ctx.save();
      ctx.fillStyle = COLORS.text;
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`(${i + 1})`, bulbs[i].x, bulbs[i].y + bulbs[i].radius + 22);
      ctx.restore();
    }

    for (let b of bubbles) drawBubble(b);
    drawCollector();
    drawHUD();
    drawMessages();
    drawParticles();
  }

  function drawBackground() {
    // subtle animated gradient
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    const t = performance.now() / 8000;
    const offset = Math.sin(t) * 0.06 + 0.5;
    grad.addColorStop(0, COLORS.bgTop);
    grad.addColorStop(Math.max(0.1, offset - 0.05), "#Eef9ff");
    grad.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft radial glow top-left
    const rg = ctx.createRadialGradient(80, 60, 10, 80, 60, 200);
    rg.addColorStop(0, "rgba(255,240,200,0.08)");
    rg.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // gentle circuit lines with subtle motion
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 2;
    const shift = Math.sin(performance.now() / 1800) * 12;
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(109,168,255,${0.08 + i * 0.02})`;
      ctx.beginPath();
      const y = 60 + i * 80;
      ctx.moveTo(20, y + Math.sin(i + performance.now() / 2000) * 6);
      ctx.bezierCurveTo(160, y - 20 + shift * 0.02, 300, y + 40 - shift * 0.02, WIDTH - 20, y + Math.cos(i + performance.now() / 2200) * 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTopPanel() {
    drawSparky(80, 100);
    drawVolt(WIDTH - 110, 100);

    ctx.save();
    ctx.fillStyle = COLORS.text;
    ctx.font = "26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Electric Math: Charge the Bulbs!", WIDTH / 2, 44);

    ctx.font = "13px sans-serif";
    ctx.fillStyle = "#27496D";
    ctx.fillText("Catch numbered charges and press 1-4 to send them to bulbs. Match sums to light them!", WIDTH / 2, 68);

    // audio indicator small friendly icon
    ctx.fillStyle = muted ? COLORS.wrong : COLORS.correct;
    roundRectFill(WIDTH - 36, 18, 36, 20, 8);
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(muted ? "MUTED" : "SOUND", WIDTH - 18, 33);
    ctx.restore();
  }

  function drawSparky(cx, cy) {
    ctx.save();
    // battery body with subtle shading
    const bpW = 68, bpH = 48;
    const bx = cx - bpW / 2, by = cy - bpH / 2;
    const grad = ctx.createLinearGradient(bx, by, bx + bpW, by + bpH);
    grad.addColorStop(0, "#FFD87F");
    grad.addColorStop(1, "#FFCF66");
    roundRect(ctx, bx, by, bpW, bpH, 12);
    ctx.fillStyle = grad;
    ctx.fill();

    // glossy highlight
    ctx.globalAlpha = 0.12;
    roundRect(ctx, bx + 6, by + 6, bpW - 12, bpH - 18, 8);
    ctx.fillStyle = "#FFF";
    ctx.fill();
    ctx.globalAlpha = 1;

    // face
    ctx.fillStyle = "#fff";
    circle(ctx, cx - 6, cy - 4, 10);
    circle(ctx, cx + 14, cy - 4, 10);
    ctx.fillStyle = COLORS.text;
    circle(ctx, cx - 6, cy - 4, 2.5);
    circle(ctx, cx + 14, cy - 4, 2.5);
    // smile
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx + 3, cy + 4, 7, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // tail spark gentle curve
    ctx.fillStyle = COLORS.spark;
    ctx.beginPath();
    ctx.moveTo(cx - 36, cy + 8);
    ctx.quadraticCurveTo(cx - 68, cy - 24, cx - 30, cy - 36);
    ctx.quadraticCurveTo(cx - 10, cy - 18, cx - 18, cy - 6);
    ctx.fill();
    ctx.restore();
  }

  function drawVolt(cx, cy) {
    ctx.save();
    // head
    const hw = 60, hh = 44;
    roundRect(ctx, cx - hw / 2, cy - hh / 2, hw, hh, 8);
    ctx.fillStyle = "#DBEEFF";
    ctx.fill();

    // eyes
    ctx.fillStyle = COLORS.text;
    circle(ctx, cx - 10, cy - 14, 5);
    circle(ctx, cx + 10, cy - 14, 5);

    // antenna
    ctx.strokeStyle = COLORS.bolt;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh / 2);
    ctx.lineTo(cx, cy - hh / 2 - 18);
    ctx.stroke();
    ctx.fillStyle = COLORS.spark;
    circle(ctx, cx, cy - hh / 2 - 22, 6);

    // body
    roundRect(ctx, cx - 36, cy + 12, 72, 52, 10);
    ctx.fillStyle = "#CFEAFF";
    ctx.fill();

    // smile
    ctx.strokeStyle = COLORS.text;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy + 6);
    ctx.quadraticCurveTo(cx, cy + 14, cx + 8, cy + 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawBulb(bulb) {
    ctx.save();
    // base socket shadow
    ctx.fillStyle = COLORS.shadow;
    roundRect(ctx, bulb.x - 32, bulb.y + 26, 64, 18, 6);
    ctx.fill();

    // glass with soft highlight - pulsing when lit
    const pulse = bulb.lit ? 0.12 + 0.06 * Math.sin(performance.now() / 250 + bulb.glowPhase) : 0;
    ctx.beginPath();
    ctx.arc(bulb.x, bulb.y, bulb.radius + 2 + pulse * 6, 0, Math.PI * 2);
    ctx.fillStyle = bulb.lit ? COLORS.bulbOn : COLORS.bulbOff;
    ctx.fill();

    // inner glass rim
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(bulb.x - 6, bulb.y - 8, bulb.radius * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();

    // filament
    ctx.strokeStyle = bulb.lit ? COLORS.bolt : "#9AA6B8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bulb.x - 10, bulb.y);
    ctx.lineTo(bulb.x, bulb.y + 8);
    ctx.lineTo(bulb.x + 10, bulb.y);
    ctx.stroke();

    // label text
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${bulb.current} / ${bulb.target}`, bulb.x, bulb.y + 6);

    // overload halo
    if (bulb.overloaded) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = COLORS.wrong;
      ctx.beginPath();
      ctx.arc(bulb.x, bulb.y, bulb.radius + 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawBubble(b) {
    ctx.save();
    // soft shadow
    ctx.fillStyle = "rgba(6,18,32,0.08)";
    ctx.beginPath();
    ctx.ellipse(b.x + 6, b.y + 8, b.radius * 0.9, b.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // gradient fill
    const g = ctx.createLinearGradient(b.x - b.radius, b.y - b.radius, b.x + b.radius, b.y + b.radius);
    g.addColorStop(0, `hsl(${b.hue},60%,86%)`);
    g.addColorStop(1, `hsl(${b.hue + 10},70%,94%)`);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // glossy highlight
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.ellipse(b.x - b.radius / 3, b.y - b.radius / 2, b.radius * 0.6, b.radius * 0.3, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.globalAlpha = 1;

    // number
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(b.value), b.x, b.y + 6);

    // returning sparkle
    if (b.returning) {
      ctx.fillStyle = COLORS.spark;
      ctx.beginPath();
      ctx.arc(b.x + b.radius - 6, b.y - b.radius + 6, 4 + Math.abs(Math.sin(performance.now() / 120)) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCollector() {
    ctx.save();
    // subtle shadow
    ctx.fillStyle = COLORS.shadow;
    roundRect(ctx, collector.x - collector.width / 2 + 4, collector.y - collector.height / 2 + 6, collector.width, collector.height, 10);
    ctx.fill();

    // base
    const gx = ctx.createLinearGradient(collector.x - collector.width / 2, collector.y - collector.height / 2, collector.x + collector.width / 2, collector.y + collector.height / 2);
    gx.addColorStop(0, "#82B8FF");
    gx.addColorStop(1, "#74A7FF");
    roundRect(ctx, collector.x - collector.width / 2, collector.y - collector.height / 2, collector.width, collector.height, 10);
    ctx.fillStyle = gx;
    ctx.fill();

    // face
    ctx.fillStyle = "#fff";
    circle(ctx, collector.x - 24, collector.y - 6, 6);
    circle(ctx, collector.x - 10, collector.y - 6, 6);
    ctx.fillStyle = COLORS.text;
    circle(ctx, collector.x - 24, collector.y - 6, 2);
    circle(ctx, collector.x - 10, collector.y - 6, 2);
    ctx.strokeStyle = COLORS.text;
    ctx.beginPath();
    ctx.moveTo(collector.x - 18, collector.y + 0);
    ctx.quadraticCurveTo(collector.x - 14, collector.y + 8, collector.x - 6, collector.y + 0);
    ctx.stroke();

    // carrying bubble indicator
    if (collector.carrying) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(collector.x + 26, collector.y - 6, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.text;
      ctx.font = "bold 14px Arial";
      ctx.fillText(String(collector.carrying.value), collector.x + 26, collector.y - 2);
    }
    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${score}`, 20, 30);
    ctx.fillText(`Lives: ${lives}`, 20, 52);
    ctx.fillText(`Level: ${level}`, 140, 30);
    ctx.font = "12px Arial";
    ctx.fillStyle = "#27496D";
    ctx.fillText(`Move: ← → or mouse • Catch: move into charge • Send: 1-4 or click a bulb`, 20, 74);
    ctx.restore();
  }

  function drawMessages() {
    ctx.save();
    for (let m of messages) {
      const age = performance.now() - m.created;
      const alpha = 1 - age / m.life;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = m.color;
      ctx.font = "18px Arial";
      ctx.textAlign = "center";
      ctx.fillText(m.text, m.x, m.y - age / 30);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (let p of particles) {
      ctx.globalAlpha = p.alpha || 0.08;
      ctx.fillStyle = p.color || "rgba(110,160,255,0.08)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * 0.6, p.size * 0.4, p.phase || 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawIntro() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawTopPanel();
    drawCollector();
    initBulbs();
    for (let i = 0; i < bulbs.length; i++) drawBulb(bulbs[i]);

    ctx.save();
    ctx.fillStyle = COLORS.text;
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Click or press any key to begin", WIDTH / 2, HEIGHT / 2 + 20);
    ctx.font = "14px Arial";
    ctx.fillText("Use arrows or mouse to move. Catch number charges and press 1-4 to send them to bulbs.", WIDTH / 2, HEIGHT / 2 + 46);
    ctx.restore();
  }

  // Helpers for shapes
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
  function roundRectFill(x, y, w, h, r) {
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  }

  // Toggle mute improved: pause/resume background audio
  function toggleMute() {
    muted = !muted;
    if (muted) {
      stopBackgroundHum();
      playBeep("wrong");
      announce("Audio muted");
    } else {
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch((err) => console.warn("Audio resume failed:", err));
      }
      startBackgroundHum();
      playBeep("correct");
      announce("Audio unmuted");
    }
  }

  // Initialize and draw initial screen
  initBulbs();
  initParticles();
  drawIntro();
  announce("Electric Math ready. Click or press any key to start.");

  // Expose some controls for debugging (safe)
  window.__electricMath = {
    startGame,
    endGame,
    toggleMute,
  };
})();