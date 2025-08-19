(function () {
  "use strict";

  // Constants
  const WIDTH = 720;
  const HEIGHT = 480;
  const WORLD_W = 1440;
  const WORLD_H = 960;
  const TARGET_STARS = 5;
  const PLAYER_SPEED = 2.5;
  const PLAYER_RADIUS = 14;
  const INTERACT_DIST = 34;
  const BG_COLOR = "#0b2540";
  const ISLAND_COLOR = "#133c55";
  const TEXT_COLOR = "#ffffff";

  // DOM setup
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    console.error("game-of-the-day-stage element not found.");
    return;
  }

  // Clear stage and set ARIA attributes
  stage.innerHTML = "";
  stage.setAttribute("role", "application");
  stage.setAttribute("aria-label", "Open world math exploration game for ages 7 to 9. Use arrow keys to move. Press Enter near a character to solve a friendly math riddle.");

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = "block";
  canvas.style.outline = "none";
  canvas.tabIndex = 0;
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // ARIA live region for announcements (hidden)
  const live = document.createElement("div");
  live.setAttribute("aria-live", "polite");
  live.style.position = "absolute";
  live.style.left = "-9999px";
  live.style.top = "-9999px";
  stage.appendChild(live);

  // Utility
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const dist2 = (x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    return dx * dx + dy * dy;
  };

  // Audio system
  const Audio = {
    ctx: null,
    master: null,
    ambient: { noise: null, noiseGain: null, drone: null, droneGain: null, lfo: null, lfoGain: null },
    sfxGain: null,
    enabled: true,
    supported: true,
    started: false,
    lastPluckTime: 0
  };

  function initAudio() {
    if (Audio.ctx || !Audio.enabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        Audio.supported = false;
        return;
      }
      Audio.ctx = new Ctx();
      Audio.master = Audio.ctx.createGain();
      Audio.master.gain.value = 0.55;

      // Separate SFX gain for easy balancing
      Audio.sfxGain = Audio.ctx.createGain();
      Audio.sfxGain.gain.value = 0.9;
      Audio.sfxGain.connect(Audio.master);

      Audio.master.connect(Audio.ctx.destination);
      Audio.started = true;
      startAmbient();
    } catch (e) {
      console.warn("Audio init failed:", e);
      Audio.supported = false;
      Audio.enabled = false;
    }
  }

  function ensureAudioUnlocked() {
    if (!Audio.enabled || !Audio.supported) return;
    if (!Audio.ctx) {
      initAudio();
    }
    if (Audio.ctx && Audio.ctx.state === "suspended") {
      Audio.ctx.resume().catch(() => {});
    }
  }

  function startAmbient() {
    if (!Audio.ctx) return;
    stopAmbient();

    // Gentle ocean-like noise with lowpass, shaped to ebb and flow
    const bufferSize = 2 * Audio.ctx.sampleRate;
    const noiseBuffer = Audio.ctx.createBuffer(1, bufferSize, Audio.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.4;
    }
    const noise = Audio.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const noiseFilter = Audio.ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 900;
    noiseFilter.Q.value = 0.6;

    const noiseGain = Audio.ctx.createGain();
    noiseGain.gain.value = 0.04;

    const swellLFO = Audio.ctx.createOscillator();
    swellLFO.type = "sine";
    swellLFO.frequency.value = 0.06;

    const swellGain = Audio.ctx.createGain();
    swellGain.gain.value = 200;

    swellLFO.connect(swellGain);
    swellGain.connect(noiseFilter.frequency);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(Audio.master);

    // Soft warm drone with slow tremolo
    const drone = Audio.ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 176; // soft D3

    const droneGain = Audio.ctx.createGain();
    droneGain.gain.value = 0.018;

    const lfo = Audio.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.12;

    const lfoGain = Audio.ctx.createGain();
    lfoGain.gain.value = 0.015;

    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);

    drone.connect(droneGain);
    droneGain.connect(Audio.master);

    try {
      noise.start();
      swellLFO.start();
      drone.start();
      lfo.start();
    } catch (e) {
      // Some browsers may throw if already started; ignore.
    }

    // Light occasional mallet plucks to add warmth (very sparse)
    Audio.lastPluckTime = Audio.ctx.currentTime;

    Audio.ambient.noise = noise;
    Audio.ambient.noiseGain = noiseGain;
    Audio.ambient.drone = drone;
    Audio.ambient.droneGain = droneGain;
    Audio.ambient.lfo = lfo;
    Audio.ambient.lfoGain = lfoGain;
  }

  function stopAmbient() {
    const a = Audio.ambient;
    try {
      if (a.noise) a.noise.stop();
      if (a.drone) a.drone.stop();
    } catch (e) {}
    Audio.ambient = { noise: null, noiseGain: null, drone: null, droneGain: null, lfo: null, lfoGain: null };
  }

  function setMuted(muted) {
    Audio.enabled = !muted;
    if (!Audio.supported) return;
    try {
      if (Audio.enabled) {
        initAudio();
        if (Audio.master) Audio.master.gain.value = 0.55;
      } else {
        if (Audio.master) Audio.master.gain.value = 0.0;
      }
    } catch (e) {}
  }

  function toggleMuted() {
    setMuted(Audio.enabled);
  }

  function playTone(freq, duration = 0.2, type = "sine", volume = 0.15, destination = null, attack = 0.01) {
    if (!Audio.enabled || !Audio.ctx) return;
    try {
      const t = Audio.ctx.currentTime;
      const osc = Audio.ctx.createOscillator();
      const gain = Audio.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(duration, 0.05));
      osc.connect(gain);
      (destination || Audio.sfxGain || Audio.master) && gain.connect(destination || Audio.sfxGain || Audio.master);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    } catch (e) {}
  }

  function playCorrect() {
    if (!Audio.enabled || !Audio.ctx) return;
    const base = 523.25; // C5
    [base, base * 1.25, base * 1.5].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.18, "sine", 0.2), i * 120);
    });
    visualFeedback.queue.push({ type: "correct", t: performance.now() });
    announce("Correct! Gate opens and a Star Seed appears.");
  }

  function playWrong() {
    if (!Audio.enabled || !Audio.ctx) return;
    const base = 392.0; // G4
    [base * 1.25, base, base * 0.75].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.12, "triangle", 0.16), i * 90);
    });
    // soft thud
    try {
      const o = Audio.ctx.createOscillator();
      const g = Audio.ctx.createGain();
      const f = Audio.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 300;
      o.type = "square";
      o.frequency.value = 90;
      const t = Audio.ctx.currentTime;
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(f);
      f.connect(g);
      g.connect(Audio.sfxGain || Audio.master);
      o.start(t);
      o.stop(t + 0.2);
    } catch (e) {}
    visualFeedback.queue.push({ type: "wrong", t: performance.now() });
    announce("Try again. That's not quite right.");
  }

  function playPickup() {
    if (!Audio.enabled || !Audio.ctx) return;
    const base = 659.25; // E5
    [0, 80, 160, 240].forEach((delay, i) => {
      setTimeout(() => playTone(base * (1 + i * 0.12), 0.12, "sine", 0.22), delay);
    });
    visualFeedback.queue.push({ type: "pickup", t: performance.now() });
    announce("Star Seed collected!");
  }

  function playSelect() {
    playTone(880, 0.08, "sine", 0.12);
  }

  function playGateOpen() {
    if (!Audio.enabled || !Audio.ctx) return;
    try {
      const t = Audio.ctx.currentTime;
      // whoosh using filtered noise
      const bufferSize = 0.5 * Audio.ctx.sampleRate;
      const noiseBuffer = Audio.ctx.createBuffer(1, bufferSize, Audio.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const src = Audio.ctx.createBufferSource();
      src.buffer = noiseBuffer;

      const filter = Audio.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(2000, t + 0.35);
      filter.Q.value = 1.5;

      const g = Audio.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

      src.connect(filter);
      filter.connect(g);
      g.connect(Audio.sfxGain || Audio.master);
      src.start(t);
      src.stop(t + 0.5);
    } catch (e) {}
  }

  function playFootstep() {
    // very soft click thump
    if (!Audio.enabled || !Audio.ctx) return;
    try {
      const t = Audio.ctx.currentTime;
      const osc = Audio.ctx.createOscillator();
      const gain = Audio.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain);
      gain.connect(Audio.sfxGain || Audio.master);
      osc.start(t);
      osc.stop(t + 0.12);
    } catch (e) {}
  }

  function playWin() {
    if (!Audio.enabled || !Audio.ctx) return;
    const base = 523.25; // C5
    const tones = [base, base * 1.25, base * 1.5, base * 2];
    tones.forEach((f, i) => {
      setTimeout(() => {
        playTone(f, 0.3, "sine", 0.18);
        setTimeout(() => playTone(f / 2, 0.2, "triangle", 0.08), 80);
      }, i * 180);
    });
  }

  // Visual feedback badges queue
  const visualFeedback = {
    queue: [],
    draw(ctx) {
      const now = performance.now();
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const fx = this.queue[i];
        const age = (now - fx.t) / 1000;
        if (age > 1.0) {
          this.queue.splice(i, 1);
          continue;
        }
        const alpha = 1 - age;
        ctx.save();
        ctx.globalAlpha = alpha;
        let text = "";
        let color = "";
        if (fx.type === "correct") {
          text = "✓";
          color = "#42e66c";
        } else if (fx.type === "wrong") {
          text = "✗";
          color = "#ff6b6b";
        } else if (fx.type === "pickup") {
          text = "★";
          color = "#ffd166";
        }
        ctx.fillStyle = color;
        ctx.font = "48px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, WIDTH - 40, 40 + age * -20);
        ctx.restore();
      }
    }
  };

  // Particles (visual only)
  const particles = [];
  function spawnBurst(x, y, color, count = 18, speed = 1.5, size = 3, life = 0.7) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.5 + Math.random()) * speed;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color
      });
    }
  }
  function spawnGateWave(x, y, w, h) {
    // Decorative sparkles along the gate rectangle
    const count = 14;
    for (let i = 0; i < count; i++) {
      const px = x + Math.random() * w;
      const py = y + Math.random() * h;
      particles.push({
        x: px,
        y: py,
        vx: 0,
        vy: -0.6 - Math.random() * 0.6,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 2 + Math.random() * 2,
        color: "#bde0fe"
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // slight gravity
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(p.life / p.maxLife, 0);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Game state
  const keys = {};
  let mouse = { x: 0, y: 0, down: false };
  let gameState = "title"; // title, playing, puzzle, win, help
  let lastTime = 0;

  const camera = { x: 0, y: 0 };

  const player = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    r: PLAYER_RADIUS,
    speed: PLAYER_SPEED,
    color: "#ffd166",
    hatAngle: 0
  };

  let obstacles = []; // array of {x,y,w,h, color, openableId?}
  let interactables = []; // array of NPC/Gate/Sprout
  let stars = []; // array of star collectibles
  let starsCollected = 0;

  // Movement audio support
  let stepDistAcc = 0;
  let lastPos = { x: player.x, y: player.y };
  const STEP_DISTANCE = 18;

  // Puzzles
  let activePuzzle = null; // { ownerId, character, prompt, choices, correctIndex, tip, solved }
  let activeChoiceIndex = 0;

  function announce(text) {
    live.textContent = text;
  }

  // World creation
  function createWorld() {
    obstacles = [];
    interactables = [];
    stars = [];
    starsCollected = 0;

    // Large island boundaries walls (keep within world edges)
    // Perimeter walls
    obstacles.push({ x: 0, y: 0, w: WORLD_W, h: 40, color: "#0e2a45" });
    obstacles.push({ x: 0, y: WORLD_H - 40, w: WORLD_W, h: 40, color: "#0e2a45" });
    obstacles.push({ x: 0, y: 0, w: 40, h: WORLD_H, color: "#0e2a45" });
    obstacles.push({ x: WORLD_W - 40, y: 0, w: 40, h: WORLD_H, color: "#0e2a45" });

    // Some fun winding walls (forest patches)
    const forestColor = "#0f4c5c";
    const rockColor = "#1b3b5a";
    // central lake
    obstacles.push({ x: WORLD_W / 2 - 220, y: WORLD_H / 2 - 150, w: 440, h: 40, color: forestColor });
    obstacles.push({ x: WORLD_W / 2 - 220, y: WORLD_H / 2 + 110, w: 440, h: 40, color: forestColor });
    obstacles.push({ x: WORLD_W / 2 - 220, y: WORLD_H / 2 - 150, w: 40, h: 300, color: forestColor });
    obstacles.push({ x: WORLD_W / 2 + 180, y: WORLD_H / 2 - 150, w: 40, h: 300, color: forestColor });

    // West maze
    obstacles.push({ x: 160, y: 160, w: 300, h: 30, color: rockColor });
    obstacles.push({ x: 160, y: 160, w: 30, h: 280, color: rockColor });
    obstacles.push({ x: 160, y: 410, w: 240, h: 30, color: rockColor });
    obstacles.push({ x: 400, y: 190, w: 30, h: 250, color: rockColor });

    // East cliffs
    obstacles.push({ x: WORLD_W - 490, y: 160, w: 300, h: 30, color: rockColor });
    obstacles.push({ x: WORLD_W - 220, y: 160, w: 30, h: 280, color: rockColor });
    obstacles.push({ x: WORLD_W - 460, y: 410, w: 270, h: 30, color: rockColor });

    // South grove
    obstacles.push({ x: WORLD_W / 2 - 330, y: WORLD_H - 260, w: 660, h: 30, color: forestColor });
    obstacles.push({ x: WORLD_W / 2 - 330, y: WORLD_H - 260, w: 30, h: 180, color: forestColor });
    obstacles.push({ x: WORLD_W / 2 + 300, y: WORLD_H - 260, w: 30, h: 180, color: forestColor });
    obstacles.push({ x: WORLD_W / 2 - 300, y: WORLD_H - 110, w: 330, h: 30, color: forestColor });

    // Gates (openable obstacles)
    // Gate North - Moss the Turtle (missing addend)
    const gateNorth = { x: WORLD_W / 2 - 30, y: 40, w: 60, h: 30, color: "#2b2d42", openableId: "gateNorth", open: false };
    obstacles.push(gateNorth);
    interactables.push({
      id: "moss",
      type: "gate",
      name: "Moss the Turtle",
      description: "Bridge to the Lagoon",
      character: "moss",
      x: WORLD_W / 2,
      y: 100,
      gateId: "gateNorth",
      puzzle: createPuzzle("missing"),
      solved: false
    });

    // Gate West - Rumble the Rock (addition)
    const gateWest = { x: 190, y: 290, w: 30, h: 60, color: "#2b2d42", openableId: "gateWest", open: false };
    obstacles.push(gateWest);
    interactables.push({
      id: "rumble",
      type: "gate",
      name: "Rumble the Rock",
      description: "Craggy Pass",
      character: "rumble",
      x: 240,
      y: 320,
      gateId: "gateWest",
      puzzle: createPuzzle("sum"),
      solved: false
    });

    // Gate East - Comet the Fox (subtraction)
    const gateEast = { x: WORLD_W - 220, y: 290, w: 30, h: 60, color: "#2b2d42", openableId: "gateEast", open: false };
    obstacles.push(gateEast);
    interactables.push({
      id: "comet",
      type: "gate",
      name: "Comet the Fox",
      description: "Sunbeam Path",
      character: "comet",
      x: WORLD_W - 260,
      y: 320,
      gateId: "gateEast",
      puzzle: createPuzzle("diff"),
      solved: false
    });

    // Gate South - Luma the Jelly (sum)
    const gateSouth = { x: WORLD_W / 2 - 30, y: WORLD_H - 110, w: 60, h: 30, color: "#2b2d42", openableId: "gateSouth", open: false };
    obstacles.push(gateSouth);
    interactables.push({
      id: "luma",
      type: "gate",
      name: "Luma the Jelly",
      description: "Glow Grove",
      character: "luma",
      x: WORLD_W / 2,
      y: WORLD_H - 160,
      gateId: "gateSouth",
      puzzle: createPuzzle("sum"),
      solved: false
    });

    // Blip the Jelly Sprout
    interactables.push({
      id: "blip",
      type: "npc",
      name: "Blip the Jelly",
      description: "Jelly Sprout Riddle",
      character: "blip",
      x: WORLD_W / 2 + 40,
      y: WORLD_H / 2 - 200,
      puzzle: createPuzzle("missing"),
      solved: false
    });

    // Star spawn points
    starSpawns = {
      gateNorth: { x: WORLD_W / 2, y: 70 },
      gateWest: { x: 170, y: 320 },
      gateEast: { x: WORLD_W - 170, y: 320 },
      gateSouth: { x: WORLD_W / 2, y: WORLD_H - 85 },
      blip: { x: WORLD_W / 2 + 110, y: WORLD_H / 2 - 230 }
    };
  }

  let starSpawns = {};

  function createPuzzle(type) {
    // Returns a fresh puzzle object with prompt, choices, tip
    // Types: "sum", "diff", "missing"
    if (type === "sum") {
      // a + b = ?
      const a = randInt(4, 12);
      const b = randInt(3, 9);
      const answer = a + b;
      const choices = generateChoices(answer, 3, 0, 30);
      return {
        type,
        prompt: `Add to help: ${a} + ${b} = ?`,
        tip: "Tip: Try making a ten. For example: (a + b) = (a + toTen) + (rest).",
        choices: choices.map(x => String(x)),
        correctIndex: choices.indexOf(answer)
      };
    } else if (type === "diff") {
      // a - b = ?
      const a = randInt(10, 20);
      const b = randInt(1, Math.min(9, a - 1));
      const answer = a - b;
      const choices = generateChoices(answer, 3, 0, 20);
      return {
        type,
        prompt: `Subtract to help: ${a} − ${b} = ?`,
        tip: "Tip: Count back by ones or jump to the nearest ten.",
        choices: choices.map(x => String(x)),
        correctIndex: choices.indexOf(answer)
      };
    } else {
      // missing addend: a + ? = s
      const a = randInt(4, 12);
      const s = randInt(a + 4, Math.min(20, a + 10));
      const answer = s - a;
      const choices = generateChoices(answer, 3, 0, 15);
      return {
        type,
        prompt: `Find the missing number: ${a} + ? = ${s}`,
        tip: "Tip: How much do we add to reach the total?",
        choices: choices.map(x => String(x)),
        correctIndex: choices.indexOf(answer)
      };
    }
  }

  function generateChoices(correct, count, min, max) {
    const set = new Set();
    set.add(correct);
    while (set.size < count) {
      let delta = randInt(-3, 3);
      if (delta === 0) delta = randInt(1, 3);
      let candidate = correct + delta;
      candidate = clamp(candidate, min, max);
      set.add(candidate);
    }
    // shuffle
    const arr = Array.from(set);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Drawing helpers
  function drawWorld() {
    drawWater();
    drawIsland();

    // Decorative bubbles
    drawBubbles();

    // Obstacles with improved style
    for (const o of obstacles) {
      drawObstacle(o);
      if (o.openableId && !o.open) {
        drawGateDecoration(o);
      }
    }

    // Stars
    for (const s of stars) {
      if (s.taken) continue;
      drawStar(s.x, s.y, s.r, s.phase);
    }

    // Particles (behind characters a bit)
    drawParticles();

    // Interactables characters
    for (const it of interactables) {
      drawCharacter(it);
    }

    // Player
    drawPlayer();

    // Vignette for cozy look
    drawVignette();
  }

  function drawWater() {
    // Parallax water gradients
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, "#082032");
    g.addColorStop(1, "#0b2540");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Gentle moving wave bands
    const t = performance.now() * 0.001;
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "#0d3a5a" : "#0c314d";
      const y = ((t * 18 + i * 80) % (WORLD_H + 160)) - 100;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += 20) {
        const yy = y + Math.sin((x * 0.01) + i) * (6 + i);
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.lineTo(WORLD_W, y + 40);
      ctx.lineTo(0, y + 40);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Subtle sparkles
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 40; i++) {
      const x = (i * 123.45 + t * 33) % WORLD_W;
      const y = (i * 67.89 + t * 21) % WORLD_H;
      ctx.fillStyle = i % 2 ? "#0f3a5a" : "#0d3250";
      ctx.fillRect(x, y, 80, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawIsland() {
    // Irregular rounded island shape
    const pad = 60;
    const left = pad, right = WORLD_W - pad, top = pad, bottom = WORLD_H - pad;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const rx = (right - left) / 2;
    const ry = (bottom - top) / 2;

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const wobble = 1 + Math.sin(a * 3 + performance.now() * 0.0005) * 0.04;
      const x = cx + Math.cos(a) * rx * 0.96 * wobble;
      const y = cy + Math.sin(a) * ry * 0.9 * wobble;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Land gradient
    const grad = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.2, cx, cy, Math.max(rx, ry));
    grad.addColorStop(0, "#205070");
    grad.addColorStop(1, ISLAND_COLOR);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Soft shoreline highlight
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 6;
    ctx.stroke();

    // Speckled grass dots
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#a7c957";
    for (let i = 0; i < 120; i++) {
      const ax = left + Math.random() * (right - left);
      const ay = top + Math.random() * (bottom - top);
      ctx.beginPath();
      ctx.arc(ax, ay, 3 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawBubbles() {
    const t = performance.now() * 0.001;
    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 20; i++) {
      const x = (i * 201.3 + (t * 20)) % WORLD_W;
      const y = WORLD_H - ((i * 80.7 + (t * 30)) % WORLD_H);
      ctx.beginPath();
      ctx.fillStyle = i % 2 ? "#bde0fe" : "#a2d2ff";
      ctx.arc(x, y, 4 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawObstacle(o) {
    ctx.save();
    // Add beveled style for obstacles
    const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
    grad.addColorStop(0, lighten(o.color || "#173953", 0.12));
    grad.addColorStop(1, darken(o.color || "#173953", 0.12));
    ctx.fillStyle = grad;
    ctx.fillRect(o.x, o.y, o.w, o.h);

    // Edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);

    // If gate opened, faint shimmer to show it used to be here
    if (o.openableId && o.open) {
      const t = performance.now() * 0.001;
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = "#bde0fe";
      const y = o.y + (Math.sin(t * 3) * 0.5 + 0.5) * o.h;
      ctx.fillRect(o.x, y, o.w, 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawGateDecoration(o) {
    // Stone arch above gate with glow
    const t = performance.now() * 0.001;
    ctx.save();
    const pulse = (Math.sin(t * 2) * 0.5 + 0.5) * 0.3 + 0.4;
    ctx.fillStyle = "#3b3d5b";
    roundRect(ctx, o.x - 6, o.y - 12, o.w + 12, 12, 3, true, false);
    ctx.fillStyle = `rgba(141,153,174,${0.6 + pulse * 0.4})`;
    for (let i = 0; i < 3; i++) {
      roundRect(ctx, o.x + 8 + i * 14, o.y - 10, 8, 6, 2, true, false);
    }
    // Rune glow
    ctx.globalAlpha = 0.4 + pulse * 0.3;
    ctx.fillStyle = "#80ffdb";
    ctx.fillRect(o.x + o.w / 2 - 2, o.y + 2, 4, o.h - 4);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawStar(x, y, r, phase) {
    const t = performance.now() * 0.001 + (phase || 0);
    const scale = 1 + Math.sin(t * 3) * 0.1;

    // Glow
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.5;
    const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.2);
    glow.addColorStop(0, "rgba(255,230,109,0.8)");
    glow.addColorStop(1, "rgba(255,230,109,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.scale(scale, scale);
    ctx.beginPath();
    const spikes = 5;
    const outer = r;
    const inner = r * 0.5;
    let rot = Math.PI / 2 * 3;
    let cx = 0, cy = 0;
    ctx.moveTo(0, -outer);
    for (let i = 0; i < spikes; i++) {
      cx = Math.cos(rot) * outer;
      cy = Math.sin(rot) * outer;
      ctx.lineTo(cx, cy);
      rot += Math.PI / spikes;
      cx = Math.cos(rot) * inner;
      cy = Math.sin(rot) * inner;
      ctx.lineTo(cx, cy);
      rot += Math.PI / spikes;
    }
    ctx.lineTo(0, -outer);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, "#ffe66d");
    g.addColorStop(1, "#f4a261");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  function drawCharacter(it) {
    const t = performance.now() * 0.001;
    const bob = Math.sin(t * 2 + it.x * 0.01) * 3;

    ctx.save();
    ctx.translate(it.x, it.y + bob);

    // Interaction ring highlight
    if (nearInteractable(it)) {
      ctx.strokeStyle = "rgba(255,230,109,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Drop shadow
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, 14, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw character based on type
    if (it.character === "moss") {
      // Turtle: shell, head, flippers
      ctx.fillStyle = "#2a9d8f";
      roundRect(ctx, -18, -12, 36, 24, 12, true, false);
      ctx.fillStyle = "#1f6f66";
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          ctx.fillRect(i * 8 - 4, j * 6 - 3, 8, 6);
        }
      }
      ctx.fillStyle = "#2a9d8f";
      roundRect(ctx, 16, -6, 10, 12, 6, true, false); // head
      ctx.fillStyle = "#e9c46a";
      roundRect(ctx, -22, -2, 10, 6, 3, true, false); // tail
    } else if (it.character === "comet") {
      // Fox: body with tail
      ctx.fillStyle = "#e76f51";
      roundRect(ctx, -14, -10, 28, 20, 10, true, false);
      ctx.fillStyle = "#f4a261";
      roundRect(ctx, -6, -4, 12, 8, 4, true, false); // belly
      ctx.fillStyle = "#e76f51";
      ctx.beginPath(); // tail
      ctx.moveTo(12, 0);
      ctx.quadraticCurveTo(28, -6, 22, 10);
      ctx.quadraticCurveTo(18, 8, 12, 0);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(-4, -6, 8, 4); // muzzle
    } else if (it.character === "rumble") {
      // Rock spirit
      ctx.fillStyle = "#6c757d";
      roundRect(ctx, -16, -12, 32, 24, 8, true, false);
      ctx.fillStyle = "#343a40";
      ctx.fillRect(-12, -4, 24, 3);
      ctx.fillStyle = "#adb5bd";
      ctx.fillRect(-8, 4, 16, 3);
    } else if (it.character === "luma") {
      // Jelly
      const jellyGrad = ctx.createLinearGradient(0, -16, 0, 16);
      jellyGrad.addColorStop(0, "#c77dff");
      jellyGrad.addColorStop(1, "#9d4edd");
      ctx.fillStyle = jellyGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 16, Math.PI, 0);
      ctx.lineTo(16, 8);
      ctx.quadraticCurveTo(8, 14, 0, 12);
      ctx.quadraticCurveTo(-8, 14, -16, 8);
      ctx.closePath();
      ctx.fill();
      // glow
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ffd6ff";
      ctx.beginPath();
      ctx.arc(0, -6, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (it.character === "blip") {
      // Baby jelly sprout
      ctx.fillStyle = "#00b4d8";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#caf0f8";
      ctx.fillRect(-8, 4, 16, 4);
      // antenna
      ctx.strokeStyle = "#90e0ef";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(4, -18, 8, -16);
      ctx.stroke();
      ctx.fillStyle = "#90e0ef";
      ctx.beginPath();
      ctx.arc(8, -16, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // default sign
      ctx.fillStyle = "#ced4da";
      roundRect(ctx, -10, -20, 20, 40, 4, true, false);
    }

    // Eyes to bring characters to life
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-4, -3, 2, 0, Math.PI * 2);
    ctx.arc(4, -3, 2, 0, Math.PI * 2);
    ctx.fill();

    // Name tag
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(it.name, 0, -28);

    ctx.restore();
  }

  function drawPlayer() {
    const t = performance.now() * 0.001;
    const bob = Math.sin(t * 6) * 1.5;

    ctx.save();
    ctx.translate(player.x, player.y + bob);

    // soft shadow
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, 12, player.r * 0.9, player.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body
    ctx.beginPath();
    const bodyGrad = ctx.createRadialGradient(0, -6, 4, 0, 0, player.r);
    bodyGrad.addColorStop(0, "#ffe9a6");
    bodyGrad.addColorStop(1, player.color);
    ctx.fillStyle = bodyGrad;
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    ctx.fill();

    // hat
    ctx.save();
    player.hatAngle += 0.02;
    ctx.rotate(Math.sin(player.hatAngle) * 0.1);
    ctx.fillStyle = "#2b2d42";
    roundRect(ctx, -player.r * 0.7, -player.r - 6, player.r * 1.4, 6, 3, true, false);
    ctx.fillStyle = "#8d99ae";
    roundRect(ctx, -player.r * 0.3, -player.r - 14, player.r * 0.6, 8, 3, true, false);
    ctx.restore();

    // eyes
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-4, -3, 2, 0, Math.PI * 2);
    ctx.arc(4, -3, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawVignette() {
    ctx.save();
    const grad = ctx.createRadialGradient(camera.x + WIDTH / 2, camera.y + HEIGHT / 2, 120, camera.x + WIDTH / 2, camera.y + HEIGHT / 2, 360);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = grad;
    ctx.fillRect(camera.x, camera.y, WIDTH, HEIGHT);
    ctx.restore();
  }

  // Camera
  function updateCamera() {
    camera.x = clamp(player.x - WIDTH / 2, 0, WORLD_W - WIDTH);
    camera.y = clamp(player.y - HEIGHT / 2, 0, WORLD_H - HEIGHT);
    ctx.setTransform(1, 0, 0, 1, -camera.x, -camera.y);
  }

  // Collision
  function resolveCollisions(px, py, r) {
    let x = px, y = py;
    for (const o of obstacles) {
      if (o.openableId && o.open) continue;
      const closestX = clamp(x, o.x, o.x + o.w);
      const closestY = clamp(y, o.y, o.y + o.h);
      const dx = x - closestX;
      const dy = y - closestY;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.0001;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = r - d;
        x += nx * overlap;
        y += ny * overlap;
      }
    }
    return { x, y };
  }

  function nearInteractable(it) {
    return dist2(player.x, player.y, it.x, it.y) <= (INTERACT_DIST * INTERACT_DIST);
  }

  // Puzzle UI
  function openPuzzleFor(interactable) {
    activePuzzle = {
      ownerId: interactable.id,
      gateId: interactable.gateId || null,
      character: interactable.name,
      prompt: interactable.puzzle.prompt,
      tip: interactable.puzzle.tip,
      choices: interactable.puzzle.choices.slice(),
      correctIndex: interactable.puzzle.correctIndex,
      solved: false
    };
    activeChoiceIndex = 0;
    gameState = "puzzle";
  }

  function answerPuzzle(choiceIndex) {
    const correct = choiceIndex === activePuzzle.correctIndex;
    if (correct) {
      activePuzzle.solved = true;
      // Mark interactable solved, open gates, spawn star
      const it = interactables.find(i => i.id === activePuzzle.ownerId);
      if (it) it.solved = true;
      if (activePuzzle.gateId) {
        const gate = obstacles.find(o => o.openableId === activePuzzle.gateId);
        if (gate) {
          gate.open = true;
          playGateOpen();
          spawnGateWave(gate.x, gate.y, gate.w, gate.h);
        }
      }
      // Spawn star at designated spot if exists
      const spawnKey = activePuzzle.gateId || activePuzzle.ownerId;
      const spawn = starSpawns[spawnKey];
      if (spawn) {
        stars.push({ x: spawn.x, y: spawn.y, r: 12, phase: Math.random() * 10, taken: false });
        spawnBurst(spawn.x, spawn.y, "#ffd166", 24, 1.6, 3.5, 0.9);
      }
      playCorrect();
    } else {
      playWrong();
    }
    // Refresh puzzle for repeat if wrong
    if (!correct) {
      const it = interactables.find(i => i.id === activePuzzle.ownerId);
      if (it) {
        it.puzzle = createPuzzle(it.puzzle.type);
        activePuzzle.prompt = it.puzzle.prompt;
        activePuzzle.tip = it.puzzle.tip;
        activePuzzle.choices = it.puzzle.choices.slice();
        activePuzzle.correctIndex = it.puzzle.correctIndex;
      }
    } else {
      // Close puzzle on success
      setTimeout(() => {
        activePuzzle = null;
        gameState = "playing";
      }, 600);
    }
  }

  // UI overlays
  function drawTitle() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Animated ocean background
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#14213d");
    g.addColorStop(1, "#1b4965");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Soft moving waves
    ctx.save();
    ctx.globalAlpha = 0.2;
    const t = performance.now() * 0.001;
    ctx.fillStyle = "#2c7da0";
    for (let i = 0; i < 3; i++) {
      const y = 200 + Math.sin(t * 1.5 + i) * 20 + i * 14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= WIDTH; x += 16) {
        const yy = y + Math.sin(x * 0.02 + i) * 6;
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(WIDTH, y + 20);
      ctx.lineTo(0, y + 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = "#ffe66d";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Jelly Isles: Open Math Explorer", WIDTH / 2, 80);

    ctx.fillStyle = "#e0fbfc";
    ctx.font = "16px sans-serif";
    ctx.fillText("A playful open-world about addition and subtraction (ages 7-9)", WIDTH / 2, 112);

    // Characters preview
    const cx = WIDTH / 2;
    const cy = 200;
    ctx.save();
    ctx.translate(0, 0);
    const names = [
      { char: "moss", name: "Moss" },
      { char: "comet", name: "Comet" },
      { char: "rumble", name: "Rumble" },
      { char: "luma", name: "Luma" },
      { char: "blip", name: "Blip" }
    ];
    names.forEach((n, i) => {
      const angle = (i / names.length) * Math.PI * 2;
      const x = Math.cos(angle) * 120;
      const y = Math.sin(angle) * 60;
      drawCharacter({ x: cx + x, y: cy + y, name: n.name, character: n.char });
    });
    ctx.restore();

    // Instructions
    ctx.fillStyle = "#e0fbfc";
    ctx.textAlign = "left";
    const lines = [
      "How to play:",
      "• Explore the island with Arrow Keys or WASD.",
      "• Walk up to friendly creatures. Press Enter to talk.",
      "• Solve their math riddle to open gates and spawn Star Seeds.",
      "• Collect 5 Star Seeds to win!",
      "Controls: Enter = Interact/Confirm, 1-3 = Answer, M = Mute, H = Help",
      "Accessibility: All puzzles are keyboard accessible. Visual cues show feedback.",
      "Press Enter to begin."
    ];
    ctx.font = "14px sans-serif";
    let y = 280;
    for (const line of lines) {
      ctx.fillText(line, 60, y);
      y += 20;
    }

    // Speaker indicator
    drawSpeakerIcon(WIDTH - 40, 40, Audio.enabled);
  }

  function drawHelpOverlay() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#ffffff";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Help & Tips", WIDTH / 2, 60);
    ctx.font = "14px sans-serif";
    const text = [
      "• Move with Arrow Keys or WASD",
      "• Press Enter to talk and confirm answers",
      "• Use 1, 2, or 3 to choose an answer",
      "• Press M to mute/unmute sounds",
      "• Press H to close this help",
      "Math Tips:",
      "• Making 10 helps addition: 8 + 6 = 8 + 2 + 4 = 10 + 4",
      "• For subtraction, hop back on a number line: 14 − 5 = 14 → 10 (−4) → 9 (−1) = 9"
    ];
    let y = 100;
    for (const l of text) {
      ctx.fillText(l, WIDTH / 2, y);
      y += 22;
    }
    ctx.restore();
  }

  function drawPuzzleOverlay() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.92;
    // Soft gradient overlay
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#152a44");
    g.addColorStop(1, "#1d3557");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;

    // Character badge card
    roundRect(ctx, 36, 36, 88, 88, 10, true, false);
    ctx.fillStyle = "#e63946";
    roundRect(ctx, 40, 40, 80, 80, 10, true, false);
    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(activePuzzle.character, 80, 98);

    // Title and prompt
    ctx.fillStyle = "#a8dadc";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Riddle:", 140, 60);
    ctx.fillStyle = "#f1faee";
    ctx.font = "22px sans-serif";
    wrapText(ctx, activePuzzle.prompt, 140, 90, WIDTH - 180, 26);

    // Choices with rounded boxes
    const baseY = 200;
    const boxes = [];
    for (let i = 0; i < activePuzzle.choices.length; i++) {
      const x = 140;
      const y = baseY + i * 64;
      const w = WIDTH - 280;
      const h = 48;
      boxes.push({ x, y, w, h });

      const selected = i === activeChoiceIndex;
      ctx.fillStyle = selected ? "#2a9d8f" : "#457b9d";
      roundRect(ctx, x, y, w, h, 10, true, false);
      ctx.strokeStyle = selected ? "#1c7c6f" : "#1d3557";
      ctx.lineWidth = 3;
      roundRect(ctx, x, y, w, h, 10, false, true);

      // label
      ctx.fillStyle = "#f1faee";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}. ${activePuzzle.choices[i]}`, x + 12, y + 30);
    }

    // Tip
    ctx.fillStyle = "#a8dadc";
    ctx.font = "14px sans-serif";
    wrapText(ctx, activePuzzle.tip, 140, baseY + activePuzzle.choices.length * 64 + 30, WIDTH - 180, 20);

    // Instruction
    ctx.fillStyle = "#f1faee";
    ctx.textAlign = "center";
    ctx.fillText("Press 1, 2, or 3 to answer. Enter confirms. Esc to cancel.", WIDTH / 2, HEIGHT - 24);

    // Speaker
    drawSpeakerIcon(WIDTH - 40, 40, Audio.enabled);

    puzzleBoxes = boxes;
    ctx.restore();
  }

  let puzzleBoxes = [];

  function drawHUD() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // HUD bar with gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 40);
    grad.addColorStop(0, "rgba(0,0,0,0.45)");
    grad.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, 40);

    // Stars collected
    for (let i = 0; i < TARGET_STARS; i++) {
      const x = 12 + i * 22;
      const y = 20;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.6, 0.6);
      ctx.globalAlpha = i < starsCollected ? 1 : 0.4;
      drawStar(0, 0, 12, i * 0.3);
      ctx.restore();
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Stars: ${starsCollected}/${TARGET_STARS}`, 12 + TARGET_STARS * 22 + 8, 26);

    // Instructions snippet
    ctx.textAlign = "center";
    ctx.fillText("Move: Arrows/WASD • Enter: Talk • H: Help • M: Mute", WIDTH / 2, 26);

    drawSpeakerIcon(WIDTH - 24, 20, Audio.enabled);
  }

  function drawSpeakerIcon(x, y, on) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = on ? "#80ed99" : "#adb5bd";
    ctx.beginPath();
    ctx.moveTo(-12, -6);
    ctx.lineTo(-6, -6);
    ctx.lineTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-12, 6);
    ctx.closePath();
    ctx.fill();
    if (on) {
      ctx.strokeStyle = "#80ed99";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(2, 0, 6, -0.8, 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(4, 0, 10, -0.8, 0.8);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#ff6b6b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, -12);
      ctx.lineTo(14, 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = context.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
  }

  function roundRect(context, x, y, w, h, r, fill, stroke) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
    if (fill) context.fill();
    if (stroke) context.stroke();
  }

  function lighten(hex, amt) {
    const c = parseInt(hex.replace("#", ""), 16);
    const r = clamp(((c >> 16) & 255) + Math.floor(255 * amt), 0, 255);
    const g = clamp(((c >> 8) & 255) + Math.floor(255 * amt), 0, 255);
    const b = clamp((c & 255) + Math.floor(255 * amt), 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  function darken(hex, amt) {
    return lighten(hex, -amt);
  }

  // Update
  function update(dt) {
    if (gameState !== "playing") return;

    let dx = 0, dy = 0;
    if (keys["ArrowLeft"] || keys["a"]) dx -= 1;
    if (keys["ArrowRight"] || keys["d"]) dx += 1;
    if (keys["ArrowUp"] || keys["w"]) dy -= 1;
    if (keys["ArrowDown"] || keys["s"]) dy += 1;

    const length = Math.hypot(dx, dy) || 1;
    dx = (dx / length) * player.speed;
    dy = (dy / length) * player.speed;

    let nx = player.x + dx;
    let ny = player.y + dy;

    // Collide with world obstacles
    const pos = resolveCollisions(nx, ny, player.r);
    player.x = pos.x;
    player.y = pos.y;

    // Footsteps (audio only)
    const moved = Math.hypot(player.x - lastPos.x, player.y - lastPos.y);
    stepDistAcc += moved;
    if (stepDistAcc > STEP_DISTANCE && moved > 0.01) {
      playFootstep();
      stepDistAcc = 0;
    }
    lastPos.x = player.x;
    lastPos.y = player.y;

    // Collect stars
    for (const s of stars) {
      if (s.taken) continue;
      const d2s = dist2(player.x, player.y, s.x, s.y);
      if (d2s <= (player.r + s.r) * (player.r + s.r)) {
        s.taken = true;
        starsCollected += 1;
        spawnBurst(s.x, s.y, "#ffd166", 26, 2.2, 3.5, 0.8);
        playPickup();
        if (starsCollected >= TARGET_STARS) {
          setTimeout(() => {
            gameState = "win";
            playWin();
            announce("You collected all Star Seeds! Well done, Explorer!");
          }, 400);
        }
      }
    }
  }

  // Main loop
  function loop(ts) {
    const dt = (ts - lastTime) / 1000 || 0;
    lastTime = ts;

    // Ambient small plucks occasionally (very low volume)
    try {
      if (Audio.ctx && Audio.enabled) {
        const now = Audio.ctx.currentTime;
        if (now - Audio.lastPluckTime > 10 + Math.random() * 6) {
          Audio.lastPluckTime = now;
          playTone(392, 0.12, "sine", 0.05); // gentle G4
        }
      }
    } catch (e) {}

    if (gameState === "title") {
      drawTitle();
    } else if (gameState === "playing") {
      update(dt);
      updateCamera();
      drawWorld();
      drawHUD();
      visualFeedback.draw(ctx);
    } else if (gameState === "puzzle") {
      drawPuzzleOverlay();
      visualFeedback.draw(ctx);
    } else if (gameState === "win") {
      drawWin();
    } else if (gameState === "help") {
      drawHelpOverlay();
    }

    // Update particles regardless of state to finish effects
    updateParticles(dt);

    requestAnimationFrame(loop);
  }

  function drawWin() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#14213d";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Confetti
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = ["#ffd166", "#06d6a0", "#ef476f", "#118ab2"][i % 4];
      const x = (i * 91) % WIDTH;
      const y = (i * 53 + performance.now() * 0.1) % HEIGHT;
      ctx.fillRect(x, y, 6, 12);
    }
    ctx.fillStyle = "#ffe66d";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("You did it, Star Explorer!", WIDTH / 2, 140);
    ctx.fillStyle = "#e0fbfc";
    ctx.font = "18px sans-serif";
    ctx.fillText("All 5 Star Seeds collected.", WIDTH / 2, 180);
    ctx.font = "14px sans-serif";
    ctx.fillText("Press R to play again. Press H for tips. Press M to mute/unmute.", WIDTH / 2, 220);
    drawSpeakerIcon(WIDTH - 40, 40, Audio.enabled);
  }

  // Event handlers
  canvas.addEventListener("keydown", (e) => {
    keys[e.key] = true;

    if (e.key === "Enter") {
      ensureAudioUnlocked();
    }

    if (gameState === "title" && e.key === "Enter") {
      gameState = "playing";
      announce("Game started. Explore the island and find friendly characters.");
      return;
    }

    if (e.key === "m" || e.key === "M") {
      toggleMuted();
    }
    if (e.key === "h" || e.key === "H") {
      if (gameState === "playing") {
        gameState = "help";
      } else if (gameState === "help") {
        gameState = "playing";
      } else if (gameState === "win") {
        gameState = "help";
      }
    }

    if (gameState === "playing" && e.key === "Enter") {
      const it = interactables.find(i => nearInteractable(i));
      if (it) {
        openPuzzleFor(it);
      }
    }

    if (gameState === "puzzle") {
      if (e.key === "Escape") {
        activePuzzle = null;
        gameState = "playing";
      }
      if (e.key === "ArrowUp" || e.key === "w") {
        activeChoiceIndex = (activeChoiceIndex - 1 + 3) % 3;
        playSelect();
      }
      if (e.key === "ArrowDown" || e.key === "s") {
        activeChoiceIndex = (activeChoiceIndex + 1) % 3;
        playSelect();
      }
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        const idx = parseInt(e.key, 10) - 1;
        answerPuzzle(idx);
      }
      if (e.key === "Enter") {
        answerPuzzle(activeChoiceIndex);
      }
    } else if (gameState === "win") {
      if (e.key === "r" || e.key === "R") {
        restart();
      }
    }

    e.preventDefault();
  });

  canvas.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener("mousedown", (e) => {
    mouse.down = true;
    ensureAudioUnlocked();

    if (gameState === "title") {
      gameState = "playing";
      announce("Game started. Explore the island and find friendly characters.");
    } else if (gameState === "puzzle") {
      // Check clicks on choices
      const mx = mouse.x;
      const my = mouse.y;
      for (let i = 0; i < puzzleBoxes.length; i++) {
        const b = puzzleBoxes[i];
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          activeChoiceIndex = i;
          playSelect();
          answerPuzzle(i);
        }
      }
    } else if (gameState === "win") {
      restart();
    }
  });

  canvas.addEventListener("mouseup", () => {
    mouse.down = false;
  });

  // Focus canvas to receive keyboard input
  canvas.addEventListener("click", () => {
    canvas.focus();
  });

  // Restart
  function restart() {
    player.x = WORLD_W / 2;
    player.y = WORLD_H / 2;
    createWorld();
    particles.length = 0;
    stepDistAcc = 0;
    lastPos.x = player.x;
    lastPos.y = player.y;
    gameState = "playing";
    announce("New game started.");
  }

  // Initialize
  function init() {
    createWorld();
    lastTime = performance.now();
    requestAnimationFrame(loop);
    announce("Welcome to Jelly Isles. Press Enter to begin.");
  }

  // Start
  init();

  // Improved interaction tooltip
  const _drawWorld = drawWorld;
  drawWorld = function () {
    _drawWorld();
    // Show interaction tooltip if near
    const it = interactables.find(i => nearInteractable(i));
    if (it && gameState === "playing") {
      ctx.save();
      const w = 200, h = 26;
      const x = player.x - w / 2;
      const y = player.y - 64;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(ctx, x, y, w, h, 8, true, false);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Press Enter to talk to ${it.name}`, player.x, y + 17);
      ctx.restore();
    }
  };

  // Attach onbeforeunload to stop audio gracefully
  window.addEventListener("beforeunload", () => {
    stopAmbient();
    try {
      if (Audio.ctx) Audio.ctx.close();
    } catch (e) {}
  });

})();
})();