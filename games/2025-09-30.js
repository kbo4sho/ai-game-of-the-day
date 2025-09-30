(function () {
  // Machine Math Catcher - Visual & Audio Enhancement
  // NOTE: Gameplay logic, math, and mechanics preserved from original.
  // This script improves visuals (canvas-only) and audio (WebAudio API).
  // Renders inside #game-of-the-day-stage at exactly 720x480.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const CONTAINER_ID = "game-of-the-day-stage";
  const MAX_LEVEL = 6;

  // Utility functions
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const deepCopy = (o) => JSON.parse(JSON.stringify(o));

  // Find container
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error("Game container not found:", CONTAINER_ID);
    return;
  }

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Machine Math Catcher. Use arrow keys to move, space to catch. Press Enter to start."
  );
  canvas.tabIndex = 0; // make focusable
  container.innerHTML = "";
  container.appendChild(canvas);

  // Create hidden live region for accessibility updates
  const live = document.createElement("div");
  live.setAttribute("aria-live", "polite");
  live.style.position = "absolute";
  live.style.left = "-9999px";
  container.appendChild(live);

  const ctx = canvas.getContext("2d");

  // Palette and style improvements
  const bgColor = "#e9f6fb";
  const pastel = [
    "#F6C1D9",
    "#CFE8D8",
    "#FFE9A8",
    "#CDE7FF",
    "#E7D9FF",
    "#FFD5B8",
    "#D6E9F8",
    "#E6D6FF"
  ];
  const machineColor = "#9FB3C9";
  const accent = "#5F8AA0";
  const textColor = "#23343e";
  const softShadow = "rgba(20,30,40,0.12)";

  // Audio setup with error handling and richer ambient
  let audioEnabled = true;
  let audioContext = null;
  let masterGain = null;
  let ambientGain = null;
  let ambientNodes = []; // array of oscillators + filters
  let audioInitAttempted = false;

  function initAudio() {
    if (audioInitAttempted) return;
    audioInitAttempted = true;
    if (!audioEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();
      // master gain
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioContext.destination);

      // Ambient group
      ambientGain = audioContext.createGain();
      ambientGain.gain.value = 0.06;
      ambientGain.connect(masterGain);

      // Create a gentle layered ambient pad using 2 oscillators with slow LFOs and a lowpass
      const createAmbientLayer = (freq, type, detune = 0, gain = 0.03) => {
        const o = audioContext.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.detune.value = detune;
        const filt = audioContext.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 700;
        filt.Q.value = 0.8;
        const g = audioContext.createGain();
        g.gain.value = 0.0001;
        o.connect(filt);
        filt.connect(g);
        g.connect(ambientGain);
        o.start();

        // smooth fade in
        const now = audioContext.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + 1.2);

        // LFO to modulate filter cutoff to make breathing pad
        const lfo = audioContext.createOscillator();
        lfo.frequency.value = 0.08 + Math.random() * 0.06;
        const lfoGain = audioContext.createGain();
        lfoGain.gain.value = 220 + Math.random() * 120;
        lfo.connect(lfoGain);
        lfoGain.connect(filt.frequency);
        lfo.start();

        ambientNodes.push({ osc: o, filt, gainNode: g, lfo });
      };

      // Two layered oscillators with slight detune for warmth
      createAmbientLayer(180, "sine", -6, 0.038);
      createAmbientLayer(280, "triangle", 10, 0.028);

      // Subtle filtered noise for texture
      const noiseGain = audioContext.createGain();
      noiseGain.gain.value = 0.0008;
      const bufferSize = 2 * audioContext.sampleRate;
      const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.3;
      const noiseNode = audioContext.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      noiseNode.loop = true;
      const noiseFilter = audioContext.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.value = 800;
      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ambientGain);
      noiseNode.start();
      ambientNodes.push({ noiseNode, noiseFilter, noiseGain });
    } catch (e) {
      console.warn("Audio initialization failed:", e);
      audioEnabled = false;
      audioContext = null;
      masterGain = null;
      ambientGain = null;
      ambientNodes = [];
    }
  }

  // General-purpose sound: oscillator with envelope, filter, optional pan
  function playTone({
    freq = 880,
    type = "sine",
    duration = 0.18,
    peak = 0.12,
    release = 0.06,
    filter = null,
    pan = 0
  } = {}) {
    if (!audioEnabled || !audioContext || !masterGain) return;
    try {
      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = audioContext.createGain();
      g.gain.value = 0.0001;

      let nodeOut = g;
      // apply optional filter
      if (filter) {
        const f = audioContext.createBiquadFilter();
        f.type = filter.type || "lowpass";
        f.frequency.value = filter.frequency || 1200;
        f.Q.value = filter.q || 0.8;
        o.connect(f);
        f.connect(g);
      } else {
        o.connect(g);
      }

      // panner
      const p = audioContext.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(masterGain);

      o.start(now);
      // envelope
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
      o.stop(now + duration + release + 0.02);
    } catch (e) {
      console.warn("playTone error:", e);
    }
  }

  // Specialized sound effects
  function playPickupSound() {
    // short metallic ping with slight highpass
    playTone({
      freq: 960,
      type: "triangle",
      duration: 0.12,
      peak: 0.09,
      filter: { type: "highpass", frequency: 4000 },
      pan: rand(-0.6, 0.6)
    });
    setTimeout(
      () =>
        playTone({
          freq: 720,
          type: "sine",
          duration: 0.14,
          peak: 0.055,
          pan: rand(-0.4, 0.4)
        }),
      60
    );
  }

  function playCorrectSound() {
    if (!audioEnabled || !audioContext) return;
    // pleasant arpeggio + soft bell
    playTone({
      freq: 880,
      type: "sine",
      duration: 0.12,
      peak: 0.11,
      filter: { type: "lowpass", frequency: 2200 },
      pan: -0.2
    });
    setTimeout(
      () =>
        playTone({
          freq: 1320,
          type: "triangle",
          duration: 0.18,
          peak: 0.07,
          filter: { type: "lowpass", frequency: 2600 },
          pan: 0.2
        }),
      70
    );
    setTimeout(
      () =>
        playTone({
          freq: 660,
          type: "sine",
          duration: 0.16,
          peak: 0.06,
          filter: { type: "lowpass", frequency: 1800 }
        }),
      130
    );
    // quick subtle metallic spark
    setTimeout(
      () =>
        playTone({
          freq: 2400,
          type: "sine",
          duration: 0.06,
          peak: 0.03,
          filter: { type: "highpass", frequency: 2000 }
        }),
      40
    );
    playPickupSound();
  }

  function playIncorrectSound() {
    // soft descending thud + wobble
    playTone({
      freq: 320,
      type: "sawtooth",
      duration: 0.22,
      peak: 0.09,
      filter: { type: "lowpass", frequency: 900 },
      pan: -0.2
    });
    setTimeout(
      () =>
        playTone({
          freq: 220,
          type: "sawtooth",
          duration: 0.26,
          peak: 0.07,
          filter: { type: "lowpass", frequency: 700 },
          pan: 0.2
        }),
      80
    );
    // small click
    setTimeout(
      () =>
        playTone({
          freq: 1200,
          type: "square",
          duration: 0.06,
          peak: 0.03,
          filter: { type: "highpass", frequency: 1200 }
        }),
      160
    );
  }

  function toggleAudio() {
    if (!audioContext) initAudio();
    if (!audioEnabled || !audioContext) return;
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    if (ambientGain) {
      ambientGain.gain.value = ambientGain.gain.value > 0.03 ? 0 : 0.06;
    }
  }

  // Game objects and state
  let keys = {};
  let mouseX = WIDTH / 2;

  class FallingItem {
    constructor(x, y, vy, value, color, id) {
      this.x = x;
      this.y = y;
      this.vy = vy;
      this.value = value;
      this.color = color;
      this.radius = 28;
      this.id = id;
      this.rotation = rand(0, Math.PI * 2);
      this.spin = rand(-0.06, 0.06);
      this.bob = rand(0, Math.PI * 2); // gentle bobbing
      this.glow = 0;
    }
    update(dt) {
      this.y += this.vy * dt;
      this.rotation += this.spin * dt * 60;
      this.bob += dt * 2;
      // gentle glow if it's the correct answer
      if (this.value === state.targetAnswer) {
        this.glow = Math.min(1, this.glow + dt * 1.6);
      } else {
        this.glow = Math.max(0, this.glow - dt * 1.2);
      }
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y + Math.sin(this.bob) * 3);
      ctx.rotate(this.rotation);

      // drop shadow
      ctx.beginPath();
      ctx.fillStyle = "rgba(20,30,40,0.12)";
      ctx.ellipse(0, this.radius + 12, this.radius * 0.9, this.radius * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();

      // subtle radial gradient for gear body
      const grad = ctx.createRadialGradient(-6, -6, this.radius * 0.2, 0, 0, this.radius + 4);
      grad.addColorStop(0, shade(this.color, 24));
      grad.addColorStop(0.6, this.color);
      grad.addColorStop(1, shade(this.color, -18));
      ctx.fillStyle = grad;
      ctx.strokeStyle = shade(this.color, -26);
      ctx.lineWidth = 2;

      // main gear circle
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // teeth (rounded blocks)
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        const tx = Math.cos(angle) * (this.radius + 8);
        const ty = Math.sin(angle) * (this.radius + 8);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(angle);
        ctx.beginPath();
        roundRect(ctx, -4, -5, 8, 10, 2, true, false);
        ctx.restore();
      }

      // subtle center hub
      ctx.beginPath();
      ctx.fillStyle = shade(this.color, -6);
      ctx.arc(0, 0, this.radius * 0.38, 0, Math.PI * 2);
      ctx.fill();

      // highlight ring
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1.4;
      ctx.arc(-4, -4, this.radius * 0.85, -0.4, Math.PI * 1.3);
      ctx.stroke();

      // number text with soft shadow
      ctx.font = "bold 18px Verdana, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = 2;
      ctx.fillText(String(this.value), 0, 2);
      ctx.shadowBlur = 0;

      // glow rim for correct answers
      if (this.glow > 0.02) {
        const gAlpha = Math.min(0.5, this.glow * 0.9);
        ctx.beginPath();
        ctx.lineWidth = 6;
        ctx.strokeStyle = `rgba(138, 220, 170, ${0.4 * gAlpha})`;
        ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // Robot basket controlled by player - enhanced character
  const basket = {
    x: WIDTH / 2,
    y: HEIGHT - 70,
    width: 160,
    height: 42,
    speed: 380,
    color: "#FEFFF7",
    handleOffset: 28,
    eyeOpen: 1,
    bob: 0,
    draw(ctx) {
      ctx.save();
      // slight bob for life
      this.bob = Math.sin(performance.now() * 0.003 + this.x * 0.01) * 3;
      ctx.translate(this.x, this.y + this.bob);

      // shadow
      ctx.beginPath();
      ctx.fillStyle = "rgba(12, 22, 32, 0.14)";
      ctx.ellipse(0, 34, this.width * 0.55, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // basket body
      ctx.fillStyle = this.color;
      ctx.strokeStyle = "#c9d5de";
      roundRect(ctx, -this.width / 2, -this.height / 2, this.width, this.height, 10, true, true);

      // decorative stripes
      ctx.fillStyle = "#e9f3fa";
      ctx.fillRect(-this.width / 2 + 14, -6, 16, 12);
      ctx.fillRect(this.width / 2 - 30, -6, 16, 12);

      // mechanical arm to basket handle
      ctx.beginPath();
      ctx.strokeStyle = "#6f7f8f";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.moveTo(-this.width / 2 + this.handleOffset, -this.height / 2);
      ctx.lineTo(-this.width / 2 + this.handleOffset - 10, -this.height / 2 - 40);
      ctx.stroke();

      // cute robot face attached to the arm
      ctx.save();
      ctx.translate(-this.width / 2 + this.handleOffset - 20, -this.height / 2 - 54);
      // head
      ctx.fillStyle = "#EAF4F9";
      ctx.strokeStyle = "#b6c7d2";
      roundRect(ctx, -26, -18, 52, 36, 8, true, true);
      // eyes with slight tracking to basket center
      const eyeX = clamp((basket.x - this.x) * 0.02, -4, 4);
      ctx.fillStyle = "#2b3740";
      ctx.beginPath();
      ctx.ellipse(-10 + eyeX, 0, 5, 6 * this.eyeOpen, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(10 + eyeX, 0, 5, 6 * this.eyeOpen, 0, 0, Math.PI * 2);
      ctx.fill();
      // mouth
      ctx.fillStyle = "#7a8896";
      roundRect(ctx, -8, 10, 16, 4, 2, true, false);
      ctx.restore();

      // little bolts
      ctx.fillStyle = "#9fb0bb";
      ctx.beginPath();
      ctx.arc(this.width / 2 - 18, 0, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  };

  // Game state (do not change semantics)
  let state = {
    mode: "menu", // menu | playing | levelComplete | win
    level: 1,
    score: 0,
    items: [],
    spawnTimer: 0,
    requiredCorrect: 5,
    caughtCorrect: 0,
    timeLeft: 30,
    targetProblem: null,
    targetAnswer: null,
    spawnInterval: 1200, // ms
    gravity: 80, // pixels per second
    paused: false,
    soundOn: true,
    touchedAudioPermission: false
  };

  // Level parameter generator (unchanged logic)
  function setupLevel(level) {
    state.items = [];
    state.caughtCorrect = 0;
    state.score = state.score; // preserve
    state.level = level;
    state.spawnTimer = 0;
    state.timeLeft = 30 + Math.max(0, 6 - level) * 5;
    const levelConfig = [
      { op: "add", maxA: 5, maxB: 5, required: 4, spawn: 1400, gravity: 70 },
      { op: "add", maxA: 10, maxB: 10, required: 5, spawn: 1200, gravity: 90 },
      { op: "sub", maxA: 10, maxB: 9, required: 5, spawn: 1200, gravity: 100 },
      { op: "sub", maxA: 15, maxB: 10, required: 6, spawn: 1000, gravity: 120 },
      { op: "mult", maxA: 5, maxB: 5, required: 6, spawn: 900, gravity: 130 },
      { op: "mix", maxA: 10, maxB: 6, required: 7, spawn: 800, gravity: 150 }
    ];
    const cfg = levelConfig[Math.min(level - 1, levelConfig.length - 1)];
    state.requiredCorrect = cfg.required;
    state.spawnInterval = cfg.spawn;
    state.gravity = cfg.gravity;
    const op = cfg.op === "mix" ? choose(["add", "sub", "mult"]) : cfg.op;
    let a, b, ans;
    if (op === "add") {
      a = Math.floor(rand(1, cfg.maxA + 1));
      b = Math.floor(rand(1, cfg.maxB + 1));
      ans = a + b;
      state.targetProblem = `${a} + ${b}`;
    } else if (op === "sub") {
      a = Math.floor(rand(2, cfg.maxA + 1));
      b = Math.floor(rand(1, Math.min(a - 1, cfg.maxB) + 1));
      ans = a - b;
      state.targetProblem = `${a} - ${b}`;
    } else if (op === "mult") {
      a = Math.floor(rand(2, cfg.maxA + 1));
      b = Math.floor(rand(1, cfg.maxB + 1));
      ans = a * b;
      state.targetProblem = `${a} × ${b}`;
    } else {
      a = 1;
      b = 1;
      ans = 2;
      state.targetProblem = "1 + 1";
    }
    state.targetAnswer = ans;
    announce(`Level ${level}. Solve: ${state.targetProblem}. Catch ${state.requiredCorrect} matching gears.`);
  }

  // Accessibility announcement
  function announce(msg) {
    if (!live) return;
    live.textContent = msg;
  }

  // Helpers for drawing
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    r = Math.min(r, w / 2, h / 2);
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

  function shade(hex, percent) {
    try {
      const num = parseInt(hex.slice(1), 16);
      let r = (num >> 16) + percent;
      let g = ((num >> 8) & 0x00FF) + percent;
      let b = (num & 0x0000FF) + percent;
      r = clamp(Math.round(r), 0, 255);
      g = clamp(Math.round(g), 0, 255);
      b = clamp(Math.round(b), 0, 255);
      return "#" + (r << 16 | g << 8 | b).toString(16).padStart(6, "0");
    } catch (e) {
      return hex;
    }
  }

  // Spawn items periodically (unchanged logic)
  let nextItemId = 1;
  function spawnItem() {
    const x = rand(60, WIDTH - 60);
    const y = -40;
    const vy = state.gravity * (0.007 + Math.random() * 0.015) + state.gravity * 0.3;
    let value;
    const chanceCorrect = 0.28 + Math.min(0.4, state.level * 0.05);
    if (Math.random() < chanceCorrect) {
      value = state.targetAnswer;
    } else {
      const spread = Math.max(3, Math.floor(state.level * 2));
      value = state.targetAnswer + Math.floor(rand(-spread, spread + 1));
      if (value < 0) value = Math.abs(value) + 1;
      if (value === state.targetAnswer) value += 2;
    }
    const color = choose(pastel);
    const item = new FallingItem(x, y, vy, value, color, nextItemId++);
    state.items.push(item);
  }

  // Collision detection (unchanged semantics)
  function checkCatch(item) {
    const left = basket.x - basket.width / 2;
    const right = basket.x + basket.width / 2;
    const top = basket.y - basket.height / 2;
    return item.y + item.radius > top - 6 && item.y < basket.y + basket.height && item.x > left && item.x < right;
  }

  // Input handling (similar, with audio unlock)
  canvas.addEventListener("keydown", (e) => {
    keys[e.key] = true;
    if (state.mode === "menu" && (e.key === "Enter" || e.key === " ")) {
      startGame();
    }
    if (e.key === "m" || e.key === "M") {
      if (audioContext && audioContext.state === "suspended") audioContext.resume().catch(() => {});
      if (audioEnabled && ambientGain) {
        ambientGain.gain.value = ambientGain.gain.value > 0.03 ? 0 : 0.06;
      }
    }
    if (e.key === "p" || e.key === "P") {
      state.paused = !state.paused;
      if (state.paused) announce("Game paused");
      else announce("Game resumed");
    }
  });
  canvas.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });
  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", " ", "Spacebar"].includes(e.key)) {
      e.preventDefault();
    }
    keys[e.key] = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
  });

  canvas.addEventListener("mousedown", (e) => {
    if (!state.touchedAudioPermission) {
      try {
        initAudio();
        if (audioContext && audioContext.state === "suspended") audioContext.resume().catch(() => {});
      } catch (err) {}
      state.touchedAudioPermission = true;
    }
    if (state.mode === "menu") startGame();
  });

  // Game controls: move basket
  function updateInput(dt) {
    const left = keys["ArrowLeft"] || keys["a"] || keys["A"];
    const right = keys["ArrowRight"] || keys["d"] || keys["D"];
    let targetX = basket.x;
    if (left) targetX -= basket.speed * dt;
    if (right) targetX += basket.speed * dt;
    if (!left && !right) {
      targetX = mouseX;
    }
    basket.x = clamp(targetX, basket.width / 2 + 6, WIDTH - basket.width / 2 - 6);
  }

  // Main update loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(60, now - lastTime) / 1000;
    lastTime = now;
    if (state.mode === "playing" && !state.paused) {
      state.spawnTimer += dt * 1000;
      if (state.spawnTimer >= state.spawnInterval) {
        state.spawnTimer = 0;
        spawnItem();
      }
      for (let it of state.items) {
        it.update(dt);
      }
      for (let i = state.items.length - 1; i >= 0; i--) {
        const it = state.items[i];
        if (checkCatch(it)) {
          const correct = it.value === state.targetAnswer;
          if (correct) {
            state.caughtCorrect++;
            state.score += 10;
            // use enhanced sound
            if (audioContext) {
              playCorrectSound();
            }
            announce(`Correct! Caught ${it.value}. ${state.caughtCorrect} of ${state.requiredCorrect}`);
          } else {
            state.score = Math.max(0, state.score - 2);
            if (audioContext) playIncorrectSound();
            announce(`Oops! ${it.value} is not ${state.targetAnswer}`);
          }
          // small pickup visual tick effect (spawn a gentle particle burst)
          spawnPickupBurst(it.x, it.y, it.color);
          state.items.splice(i, 1);
        } else if (it.y - it.radius > HEIGHT + 40) {
          if (it.value === state.targetAnswer) {
            state.score = Math.max(0, state.score - 3);
            announce("A correct gear fell! Try to catch them.");
          }
          state.items.splice(i, 1);
        }
      }
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        if (state.caughtCorrect >= state.requiredCorrect) {
          advanceLevel();
        } else {
          state.mode = "levelComplete";
          announce(`Time's up. You caught ${state.caughtCorrect} of ${state.requiredCorrect}. Press Enter to retry.`);
        }
      } else if (state.caughtCorrect >= state.requiredCorrect) {
        advanceLevel();
      }
      updateInput(dt);
    }
    render();
    requestAnimationFrame(loop);
  }

  // Advance level / Win (unchanged semantics)
  function advanceLevel() {
    state.mode = "levelComplete";
    if (state.level >= MAX_LEVEL) {
      state.mode = "win";
      announce(`Amazing! You beat all levels and scored ${state.score} points. Press Enter to play again.`);
    } else {
      announce(`Level ${state.level} complete! Catch ${state.requiredCorrect} solved. Press Enter for next level.`);
    }
  }

  // Start or restart game
  function startGame() {
    if (!state.touchedAudioPermission) {
      try {
        initAudio();
        if (audioContext && audioContext.state === "suspended") audioContext.resume().catch(() => {});
      } catch (e) {}
      state.touchedAudioPermission = true;
    }
    state.mode = "playing";
    state.score = 0;
    state.level = 1;
    setupLevel(1);
    announce(`Starting level ${state.level}. Solve ${state.targetProblem}`);
  }

  function nextOrRetry() {
    if (state.mode === "levelComplete") {
      if (state.caughtCorrect >= state.requiredCorrect) {
        state.level = Math.min(MAX_LEVEL, state.level + 1);
        setupLevel(state.level);
        state.mode = "playing";
      } else {
        setupLevel(state.level);
        state.mode = "playing";
      }
    } else if (state.mode === "win") {
      state.score = 0;
      state.level = 1;
      setupLevel(1);
      state.mode = "playing";
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (state.mode === "menu") {
        startGame();
      } else if (state.mode === "levelComplete" || state.mode === "win") {
        nextOrRetry();
      }
    }
  });

  // Visual effects: background rotating gears and pickup particle bursts
  const bgGears = [];
  for (let i = 0; i < 6; i++) {
    bgGears.push({
      x: rand(80, WIDTH - 80),
      y: rand(40, HEIGHT - 160),
      r: rand(18, 46),
      rotation: rand(0, Math.PI * 2),
      spin: rand(-0.02, 0.02),
      color: choose(["rgba(255,255,255,0.06)", "rgba(200,220,235,0.06)", "rgba(220,235,245,0.06)"])
    });
  }

  const pickupParticles = [];
  function spawnPickupBurst(x, y, baseColor) {
    // light particles for visual feedback
    for (let i = 0; i < 8; i++) {
      pickupParticles.push({
        x,
        y,
        vx: Math.cos(rand(0, Math.PI * 2)) * rand(20, 80),
        vy: Math.sin(rand(-Math.PI / 2, Math.PI / 2)) * rand(-40, -10),
        life: rand(0.5, 0.95),
        age: 0,
        color: baseColor
      });
    }
    // also play a quick pickup ping
    if (audioContext) playPickupSound();
  }

  // Drawing everything
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // soft gradient sky with faint textures
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, shade(bgColor, -8));
    grad.addColorStop(1, bgColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle drifting cloud shapes
    drawClouds(ctx);

    // background whisper gears
    for (let g of bgGears) {
      g.rotation += g.spin;
      drawBackgroundGear(ctx, g.x, g.y, g.r, g.rotation, g.color);
    }

    // large factory silhouette
    drawWackyMachines(ctx);

    // conveyor and foreground elements
    drawConveyor(ctx);

    // falling items
    for (let it of state.items) {
      it.draw(ctx);
    }

    // particles update & draw
    updateAndDrawParticles(ctx);

    // basket (robot)
    basket.draw(ctx);

    // HUD
    drawHUD(ctx);

    // overlays
    if (state.mode === "menu") drawMenu(ctx);
    else if (state.mode === "levelComplete") drawLevelComplete(ctx);
    else if (state.mode === "win") drawWin(ctx);
  }

  function drawClouds(ctx) {
    ctx.save();
    const t = performance.now() * 0.00008;
    for (let i = 0; i < 4; i++) {
      const cx = (i * 260 + (t * 40) % 260) - 80;
      const cy = 40 + i * 12;
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.ellipse(cx, cy, 64, 22, 0.2, 0, Math.PI * 2);
      ctx.ellipse(cx + 40, cy + 6, 48, 18, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBackgroundGear(ctx, x, y, r, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const tx = Math.cos(angle) * (r + 6);
      const ty = Math.sin(angle) * (r + 6);
      ctx.fillRect(tx - 3, ty - 3, 6, 6);
    }
    ctx.restore();
  }

  function drawWackyMachines(ctx) {
    ctx.save();
    // left factory block with glass panel and subtle highlights
    ctx.fillStyle = machineColor;
    ctx.strokeStyle = shade(machineColor, -20);
    ctx.lineWidth = 1.6;
    roundRect(ctx, 24, 44, 240, 220, 18, true, true);

    // animated control glass with glow
    const t = performance.now() * 0.002;
    const glassX = 36;
    const glassY = 64;
    ctx.save();
    ctx.translate(glassX, glassY);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, 0, 0, 92, 120, 10, true, false);
    // moving indicator lights
    for (let i = 0; i < 4; i++) {
      const lx = 16;
      const ly = 12 + i * 24;
      const on = Math.sin(t + i) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.fillStyle = `rgba(120, 200, 160, ${0.25 + on * 0.55})`;
      ctx.arc(lx + Math.sin(t + i) * 2, ly + Math.cos(t + i) * 1.5, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // pipes with slight shine
    ctx.strokeStyle = "#8ea7bd";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(264, 104);
    ctx.lineTo(360, 120 + Math.sin(t) * 6);
    ctx.lineTo(428, 98 + Math.cos(t) * 6);
    ctx.stroke();

    // right cluster of colorful gears (foreground)
    drawGear(ctx, 584, 118, 36, "#FFD5B8", t * 0.6);
    drawGear(ctx, 646, 148, 26, "#D6E9F8", -t * 0.9);
    drawGear(ctx, 606, 180, 18, "#E6D6FF", t * 0.4);

    // glass tube with subtle liquid gradient
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, 500, 198, 140, 200, 12, true, false);
    ctx.strokeStyle = "#cfe1ef";
    ctx.strokeRect(500, 198, 140, 200);
    // little flowing bubbles
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const bx = 520 + (i % 3) * 32 + Math.sin(t * 3 + i) * 8;
      const by = 240 + i * 18 + Math.cos(t * 1.4 + i) * 6;
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawGear(ctx, x, y, r, color, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // body
    const grad = ctx.createRadialGradient(-6, -6, r * 0.2, 0, 0, r + 6);
    grad.addColorStop(0, shade(color, 22));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, shade(color, -18));
    ctx.fillStyle = grad;
    ctx.strokeStyle = shade(color, -24);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // teeth
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const tx = Math.cos(angle) * (r + 6);
      const ty = Math.sin(angle) * (r + 6);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(angle);
      roundRect(ctx, -5, -5, 10, 10, 2, true, false);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawConveyor(ctx) {
    ctx.save();
    const beltY = HEIGHT - 120;
    // base platform with slight shadow
    ctx.fillStyle = "#dfeaf3";
    roundRect(ctx, 0, beltY, WIDTH, 80, 8, true, false);
    // moving stripes for conveyor illusion
    const t = performance.now() * 0.02;
    for (let i = -1; i < WIDTH / 36 + 3; i++) {
      const x = i * 36 + (t % 36);
      ctx.fillStyle = i % 2 === 0 ? "#cbd6e4" : "#e9f0f8";
      ctx.fillRect(x, beltY + 46, 18, 14);
    }
    // little machine pipes
    ctx.fillStyle = "#b6c7d8";
    ctx.fillRect(40, beltY - 10, 140, 12);
    ctx.fillRect(220, beltY - 16, 120, 18);
    ctx.restore();
  }

  function drawHUD(ctx) {
    ctx.save();
    // left info card with soft shadow
    ctx.shadowColor = softShadow;
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundRect(ctx, 12, 12, 280, 80, 12, true, true);
    ctx.shadowBlur = 0;

    ctx.fillStyle = textColor;
    ctx.font = "700 16px Verdana, Arial";
    ctx.fillText(`Level: ${state.level}`, 30, 36);
    ctx.fillText(`Score: ${state.score}`, 30, 58);

    ctx.font = "14px Verdana, Arial";
    ctx.fillText(`Problem: ${state.targetProblem || "-"}`, 160, 36);
    ctx.fillText(`Need: ${state.requiredCorrect}  Got: ${state.caughtCorrect}`, 160, 58);

    // time bar
    const totalTime = 30 + Math.max(0, 6 - state.level) * 5;
    const barX = 310;
    const barY = 20;
    const barW = 400;
    const barH = 18;
    ctx.fillStyle = "#eaf3fb";
    roundRect(ctx, barX, barY, barW, barH, 10, true, true);
    const pct = clamp(state.timeLeft / totalTime, 0, 1);
    // animated gradient for time
    const timeGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    timeGrad.addColorStop(0, "#A6E3A8");
    timeGrad.addColorStop(0.5, "#FFF3A6");
    timeGrad.addColorStop(1, "#F6B5B0");
    ctx.fillStyle = timeGrad;
    roundRect(ctx, barX, barY, barW * pct, barH, 10, true, false);

    ctx.fillStyle = textColor;
    ctx.font = "13px Verdana, Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Time: ${Math.ceil(state.timeLeft)}s`, barX + barW / 2, barY + barH - 4);

    // tiny control hint
    ctx.textAlign = "left";
    ctx.font = "12px Verdana, Arial";
    ctx.fillStyle = textColor;
    ctx.fillText(
      `Controls: ← → or A/D (or move mouse). Enter to start. M to toggle audio.`,
      18,
      HEIGHT - 10
    );

    // audio indicator
    ctx.textAlign = "center";
    ctx.beginPath();
    ctx.fillStyle =
      audioContext && ambientGain && ambientGain.gain.value > 0.03 ? "#7ACBF2" : "#C4C9CE";
    ctx.arc(WIDTH - 28, 36, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "11px Verdana, Arial";
    ctx.fillText("♪", WIDTH - 28, 40);

    ctx.restore();
  }

  function drawMenu(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(10,20,30,0.32)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundRect(ctx, WIDTH / 2 - 260, HEIGHT / 2 - 110, 520, 220, 14, true, true);
    ctx.fillStyle = textColor;
    ctx.font = "700 32px Verdana, Arial";
    ctx.textAlign = "center";
    ctx.fillText("Machine Math Catcher", WIDTH / 2, HEIGHT / 2 - 48);
    ctx.font = "16px Verdana, Arial";
    ctx.fillText("Catch gears that show the answer to the problem", WIDTH / 2, HEIGHT / 2 - 12);

    // gentle animated start button
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.04;
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2 + 48);
    ctx.fillStyle = "#5FB0D0";
    roundRect(ctx, -120 * pulse, -24 * pulse, 240 * pulse, 44 * pulse, 10 * pulse, true, false);
    ctx.fillStyle = "#fff";
    ctx.font = "700 16px Verdana, Arial";
    ctx.fillText("Press Enter or Click to Start", 0, 8);
    ctx.restore();

    ctx.font = "13px Verdana, Arial";
    ctx.fillStyle = "#556970";
    ctx.fillText("Use ← → or A/D (or mouse). Press M to mute. Press P to pause.", WIDTH / 2, HEIGHT / 2 + 96);
    ctx.restore();
  }

  function drawLevelComplete(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(10,20,30,0.32)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fff";
    roundRect(ctx, WIDTH / 2 - 240, HEIGHT / 2 - 90, 480, 160, 12, true, true);
    ctx.fillStyle = textColor;
    ctx.font = "700 28px Verdana, Arial";
    ctx.textAlign = "center";
    if (state.caughtCorrect >= state.requiredCorrect) {
      ctx.fillText("Level Complete!", WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = "16px Verdana, Arial";
      ctx.fillText(`Great job! Score: ${state.score}`, WIDTH / 2, HEIGHT / 2 + 8);
      ctx.fillText("Press Enter for next level", WIDTH / 2, HEIGHT / 2 + 40);
    } else {
      ctx.fillText("Level Over", WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = "16px Verdana, Arial";
      ctx.fillText(`You caught ${state.caughtCorrect} of ${state.requiredCorrect}`, WIDTH / 2, HEIGHT / 2 + 8);
      ctx.fillText("Press Enter to try again", WIDTH / 2, HEIGHT / 2 + 40);
    }
    ctx.restore();
  }

  function drawWin(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundRect(ctx, WIDTH / 2 - 260, HEIGHT / 2 - 120, 520, 200, 14, true, true);
    ctx.fillStyle = "#213540";
    ctx.font = "700 30px Verdana, Arial";
    ctx.textAlign = "center";
    ctx.fillText("You did it! Machine Master!", WIDTH / 2, HEIGHT / 2 - 20);
    ctx.font = "16px Verdana, Arial";
    ctx.fillText(`Final Score: ${state.score}`, WIDTH / 2, HEIGHT / 2 + 10);
    ctx.fillText("Press Enter to play again", WIDTH / 2, HEIGHT / 2 + 44);
    ctx.restore();
  }

  // Particles update/draw
  function updateAndDrawParticles(ctx) {
    ctx.save();
    for (let i = pickupParticles.length - 1; i >= 0; i--) {
      const p = pickupParticles[i];
      p.age += 1 / 60;
      if (p.age >= p.life) {
        pickupParticles.splice(i, 1);
        continue;
      }
      p.vy += 160 * (1 / 60); // gravity-ish
      p.x += p.vx * (1 / 60);
      p.y += p.vy * (1 / 60);
      const alpha = 1 - p.age / p.life;
      ctx.beginPath();
      ctx.fillStyle = hexToRGBA(p.color, 0.9 * alpha);
      ctx.arc(p.x, p.y, 3 + 1.5 * (1 - p.age / p.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function hexToRGBA(hex, a = 1) {
    try {
      const num = parseInt(hex.slice(1), 16);
      const r = num >> 16;
      const g = (num >> 8) & 0xff;
      const b = num & 0xff;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    } catch (e) {
      return `rgba(200,200,200,${a})`;
    }
  }

  // Start the animation loop
  lastTime = performance.now();
  requestAnimationFrame(loop);

  // Initialize menu text
  announce("Welcome to Machine Math Catcher. Press Enter to start. Use arrow keys or mouse to move. Press M to toggle audio.");

  // Expose state for debugging (non-invasive)
  window.machineMathState = state;
})();