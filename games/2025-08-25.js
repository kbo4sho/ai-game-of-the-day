(function() {
  // Enhanced Electricity-themed Math Game (visual & audio improvements)
  // Renders into the element with ID "game-of-the-day-stage".
  // Mechanics and math logic are unchanged from the original.
  // All visuals are canvas-drawn. Sounds use the Web Audio API.
  // Written with clear structure, comments and error handling.

  // --- Configuration ---
  const WIDTH = 720;
  const HEIGHT = 480;
  const CONTAINER_ID = "game-of-the-day-stage";
  const MAX_ROUNDS = 6;

  // --- Utility Functions ---
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function choose(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  // --- Setup DOM and Canvas ---
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error(`Container element with id "${CONTAINER_ID}" not found.`);
    return;
  }

  // Clear container and prepare for canvas
  container.innerHTML = "";
  container.style.position = "relative";
  container.setAttribute("role", "application");
  container.setAttribute(
    "aria-label",
    "Power Planet math game. Use mouse or keyboard controls."
  );
  container.tabIndex = 0;

  // Instruction / status area for accessibility (text, not visual)
  const infoBox = document.createElement("div");
  infoBox.style.fontFamily = "sans-serif";
  infoBox.style.fontSize = "13px";
  infoBox.style.color = "#0b0b0b";
  infoBox.style.margin = "6px 0";
  infoBox.setAttribute("aria-live", "polite");
  container.appendChild(infoBox);

  // Canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.style.display = "block";
  canvas.style.cursor = "pointer";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Electric playground game canvas");
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    infoBox.textContent =
      "Sorry — your browser does not support canvas required for this game.";
    return;
  }

  // --- Audio Setup (Web Audio API) ---
  let audioCtx = null;
  let audioAvailable = false;

  // Ambient audio nodes
  let ambient = {
    mainOsc: null,
    modOsc: null,
    noiseSource: null,
    masterGain: null,
    filter: null,
    noiseGain: null
  };
  let ambientRunning = false;

  function tryCreateAudioContext() {
    if (audioCtx) return;
    try {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      audioAvailable = true;
    } catch (e) {
      console.warn("AudioContext cannot be created:", e);
      audioAvailable = false;
      audioCtx = null;
    }
  }

  tryCreateAudioContext();

  // Because AudioContext often needs resume after user gesture, resume on first interaction
  function ensureAudioOnUserGesture() {
    if (!audioCtx) tryCreateAudioContext();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => {
        console.warn("AudioContext resume failed:", e);
      });
    }
  }

  // Create a gentle layered ambient hum with slow modulation and subtle filtered noise
  function startAmbient() {
    if (!audioAvailable || ambientRunning) return;
    try {
      // Master gain
      const g = audioCtx.createGain();
      g.gain.value = 0.03; // low-level ambient
      g.connect(audioCtx.destination);

      // Main low oscillator (sine) with slow detune movement via LFO
      const main = audioCtx.createOscillator();
      main.type = "sine";
      main.frequency.value = 110; // low base hum

      // Slow LFO to slightly modulate pitch
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.07; // very slow
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 6; // cents-ish effect via detune
      lfo.connect(lfoGain);
      lfoGain.connect(main.detune);

      // Lowpass filter to soften timbre
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.6;

      // Subtle filtered noise (soft breeze) to add texture
      const bufferSize = 2 * audioCtx.sampleRate;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.25;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 2000;
      noiseFilter.Q.value = 0.8;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.value = 0.0025;

      // Connect chain
      main.connect(filter);
      filter.connect(g);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(g);

      // start
      lfo.start();
      main.start();
      noise.start();

      // Save references
      ambient.mainOsc = main;
      ambient.modOsc = lfo;
      ambient.masterGain = g;
      ambient.filter = filter;
      ambient.noiseSource = noise;
      ambient.noiseGain = noiseGain;
      ambientRunning = true;
    } catch (err) {
      console.warn("startAmbient failed", err);
      audioAvailable = false;
      ambientRunning = false;
      try {
        stopAmbient();
      } catch (e) {}
    }
  }

  function stopAmbient() {
    try {
      if (!ambientRunning) return;
      if (ambient.modOsc) {
        try {
          ambient.modOsc.stop();
        } catch (e) {}
        ambient.modOsc.disconnect();
      }
      if (ambient.mainOsc) {
        try {
          ambient.mainOsc.stop();
        } catch (e) {}
        ambient.mainOsc.disconnect();
      }
      if (ambient.noiseSource) {
        try {
          ambient.noiseSource.stop();
        } catch (e) {}
        ambient.noiseSource.disconnect();
      }
      if (ambient.masterGain) ambient.masterGain.disconnect();
      if (ambient.filter) ambient.filter.disconnect();
      if (ambient.noiseGain) ambient.noiseGain.disconnect();
    } catch (e) {
      // ignore
    } finally {
      ambient.mainOsc = null;
      ambient.modOsc = null;
      ambient.noiseSource = null;
      ambient.masterGain = null;
      ambient.filter = null;
      ambient.noiseGain = null;
      ambientRunning = false;
    }
  }

  // Short click sound (for picking) - generated via oscillator with quick envelope
  function playClick({ freq = 850, duration = 0.06, type = "sine", volume = 0.06 } = {}) {
    if (!audioAvailable) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = volume;
      // gentle highpass to keep click bright
      const hp = audioCtx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 300;
      o.connect(hp);
      hp.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      console.warn("playClick error", e);
    }
  }

  // Upgrade existing tones with small improvements but keep same function names for logic compatibility
  function playTone({ freq = 440, duration = 0.2, type = "sine", volume = 0.08, detune = 0 } = {}) {
    if (!audioAvailable) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      g.gain.value = volume;
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.max(800, freq * 3);
      o.connect(filter);
      filter.connect(g);
      g.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(volume, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      console.warn("playTone error", e);
    }
  }

  // Add brief percussive success using small chord
  function playSuccessMelody() {
    if (!audioAvailable) return;
    const notes = [660, 880, 990];
    notes.forEach((n, i) => {
      setTimeout(
        () =>
          playTone({
            freq: n,
            duration: 0.12,
            type: "triangle",
            volume: 0.06
          }),
        i * 110
      );
    });
    // soft additional click for reward
    setTimeout(
      () =>
        playClick({
          freq: 1200,
          duration: 0.06,
          type: "square",
          volume: 0.03
        }),
      360
    );
  }

  function playErrorSound() {
    if (!audioAvailable) return;
    try {
      // buzzing, but short and not harsh
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      o.type = "square";
      o.frequency.value = 160;
      filter.type = "lowpass";
      filter.frequency.value = 900;
      g.gain.value = 0.12;
      o.connect(filter);
      filter.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      o.start(now);
      o.frequency.setValueAtTime(160, now);
      o.frequency.linearRampToValueAtTime(50, now + 0.16);
      o.stop(now + 0.32);
    } catch (e) {
      console.warn("playErrorSound error", e);
    }
  }

  // --- Game Data Structures ---
  const electrons = [];
  const devices = []; // bulbs that need a target sum
  let selectedDeviceIndex = 0;
  let round = 1;
  let score = 0;
  let lastActionMsg = "";
  let animations = [];
  let isPaused = false;
  let audioEnabled = true;

  // Characters (drawn in canvas)
  const characters = {
    DrVolt: { color: "#f2c94c", name: "Dr. Volt" },
    Sparky: { color: "#8bd3ff", name: "Sparky" },
    Bulby: { color: "#ffd1dc", name: "Bulby" }
  };

  // --- Create initial game state ---
  function resetGameState() {
    electrons.length = 0;
    devices.length = 0;
    selectedDeviceIndex = 0;
    round = 1;
    score = 0;
    animations.length = 0;
    spawnRound(round);
  }

  function spawnRound(r) {
    electrons.length = 0;
    devices.length = 0;
    animations.length = 0;

    // Create 3 target devices (bulbs) with target sums appropriate to round
    const targets = [];
    for (let i = 0; i < 3; i++) {
      const base = clamp(4 + r + i, 4, 14);
      targets.push(base + (Math.random() < 0.4 ? 1 : 0));
    }

    // make device positions
    const padding = 40;
    const areaWidth = WIDTH - padding * 2;
    for (let i = 0; i < 3; i++) {
      const x = padding + (i + 0.5) * (areaWidth / 3);
      const y = 110;
      const device = {
        x,
        y,
        target: targets[i],
        collected: [],
        active: true,
        id: `bulb-${r}-${i}`,
        pulsePhase: rand(0, Math.PI * 2)
      };
      devices.push(device);
    }

    // spawn electrons with random values 1-9; ensure combinations exist.
    const neededPool = [];
    devices.forEach((dev) => {
      let remaining = dev.target;
      const parts = Math.min(3, Math.max(1, Math.round(rand(1, 3))));
      for (let p = 0; p < parts - 1; p++) {
        const v = Math.max(1, Math.min(9, Math.round(rand(1, remaining - (parts - p - 1)))));
        neededPool.push(v);
        remaining -= v;
      }
      neededPool.push(Math.max(1, Math.min(9, remaining)));
    });
    for (let i = 0; i < 8; i++) {
      neededPool.push(Math.ceil(rand(1, 9)));
    }

    for (let i = 0; i < neededPool.length; i++) {
      const v = neededPool[i];
      // give electrons a small prevPositions array for trail
      const e = makeElectron(rand(80, WIDTH - 80), rand(200, HEIGHT - 80), v);
      e.prevPositions = [];
      electrons.push(e);
    }

    // Add decorative circuit nodes (sparks)
    for (let i = 0; i < 14; i++) {
      animations.push(makeFloatingSpark(rand(40, WIDTH - 40), rand(40, HEIGHT - 40)));
    }

    lastActionMsg = `Round ${r}: Help Bulby, Sparky and Dr. Volt reach their charge! Select a bulb, then tap electrons to add numbers until the bulb reaches its target.`;
    updateInfoBox();
  }

  function makeElectron(x, y, value) {
    return {
      x,
      y,
      baseY: y,
      vx: rand(-0.35, 0.35),
      vy: rand(-0.25, 0.25),
      r: 18,
      value,
      id: Math.random().toString(36).slice(2),
      collected: false,
      angle: rand(0, Math.PI * 2),
      bob: rand(0, Math.PI * 2),
      hue: 48 + Math.random() * 40 // warm tint
    };
  }

  function makeFloatingSpark(x, y) {
    return {
      type: "spark",
      x,
      y,
      r: rand(2.5, 6.5),
      phase: rand(0, Math.PI * 2),
      drift: rand(-0.02, 0.02)
    };
  }

  // --- Input Handling ---
  let mouse = { x: 0, y: 0, down: false };

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  canvas.addEventListener("mousedown", (e) => {
    mouse.down = true;
    ensureAudioOnUserGesture();
    if (!audioCtx) audioAvailable = false;
    // Also resume ambient
    if (audioEnabled && audioAvailable && !ambientRunning) startAmbient();
    handlePointerDown(mouse.x, mouse.y);
  });

  canvas.addEventListener("mouseup", (e) => {
    mouse.down = false;
  });

  canvas.addEventListener("click", (e) => {
    ensureAudioOnUserGesture();
  });

  // Touch support: map touch -> mouse
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      mouse.x = (touch.clientX - rect.left) * (canvas.width / rect.width);
      mouse.y = (touch.clientY - rect.top) * (canvas.height / rect.height);
      mouse.down = true;
      ensureAudioOnUserGesture();
      handlePointerDown(mouse.x, mouse.y);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      mouse.down = false;
    },
    { passive: false }
  );

  // Keyboard controls
  container.addEventListener("keydown", (e) => {
    ensureAudioOnUserGesture();
    if (e.key === "ArrowLeft") {
      selectedDeviceIndex = (selectedDeviceIndex - 1 + devices.length) % devices.length;
      lastActionMsg = `${devices[selectedDeviceIndex].id} selected.`;
      updateInfoBox();
      playTone({ freq: 300, duration: 0.06, volume: 0.03, type: "sine" });
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      selectedDeviceIndex = (selectedDeviceIndex + 1) % devices.length;
      lastActionMsg = `${devices[selectedDeviceIndex].id} selected.`;
      updateInfoBox();
      playTone({ freq: 360, duration: 0.06, volume: 0.03, type: "sine" });
      e.preventDefault();
    } else if (e.key === "Enter" || e.key === " ") {
      lastActionMsg = `Selected ${devices[selectedDeviceIndex].id}. Tap an electron to add it or press number keys 1-9.`;
      updateInfoBox();
      playTone({ freq: 480, duration: 0.06, volume: 0.04, type: "triangle" });
      e.preventDefault();
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "Undo") {
      undoLastElectron();
      e.preventDefault();
    } else if (e.key >= "1" && e.key <= "9") {
      const val = parseInt(e.key, 10);
      pickElectronByValue(val);
      e.preventDefault();
    } else if (e.key === "m" || e.key === "M") {
      toggleAudio();
      e.preventDefault();
    } else if (e.key === "p" || e.key === "P") {
      togglePause();
      e.preventDefault();
    }
  });

  // --- Interaction logic (unchanged behavior) ---
  function handlePointerDown(x, y) {
    // Check audio toggle area top-left
    if (x >= 12 && x <= 56 && y >= 12 && y <= 56) {
      toggleAudio();
      return;
    }

    // Check if clicked a device (bulb)
    for (let i = 0; i < devices.length; i++) {
      const d = devices[i];
      const dx = x - d.x;
      const dy = y - d.y;
      if (Math.sqrt(dx * dx + dy * dy) < 48) {
        selectedDeviceIndex = i;
        lastActionMsg = `Selected ${characters.Bulby.name} device ${i + 1}. Now add electrons to reach ${d.target}.`;
        updateInfoBox();
        playTone({ freq: 420, duration: 0.08, type: "triangle", volume: 0.05 });
        playClick({ freq: 900, duration: 0.04, type: "sine", volume: 0.04 });
        return;
      }
    }

    // Else check electrons
    for (let e of electrons) {
      if (e.collected) continue;
      const dx = x - e.x;
      const dy = y - e.y;
      if (Math.sqrt(dx * dx + dy * dy) < e.r + 6) {
        collectElectron(e);
        return;
      }
    }
  }

  function collectElectron(electron) {
    const dev = devices[selectedDeviceIndex];
    if (!dev || !dev.active) {
      lastActionMsg = "Select a device first by clicking on a bulb.";
      updateInfoBox();
      playErrorSound();
      return;
    }

    const currentSum = dev.collected.reduce((a, b) => a + b.value, 0);
    const newSum = currentSum + electron.value;

    if (newSum > dev.target) {
      lastActionMsg = `Oh no! Overload: ${currentSum} + ${electron.value} = ${newSum} (target ${dev.target}). Try a smaller electron.`;
      updateInfoBox();
      playErrorSound();
      animations.push(makeOverloadAnim(electron.x, electron.y));
      return;
    }

    // successful pick
    electron.collected = true;
    electron.collectedAt = { x: electron.x, y: electron.y };
    electron.collectTime = performance.now();
    dev.collected.push(electron);

    // attach animation and small spark particles
    animations.push(makeAttachAnim(electron, dev));
    animations.push(makeAttachParticles(electron.x, electron.y, dev.x, dev.y));

    lastActionMsg = `Added ${electron.value} to device (${currentSum} -> ${newSum}/${dev.target})`;
    updateInfoBox();
    playTone({ freq: 520 + electron.value * 15, duration: 0.12, type: "sine", volume: 0.06 });
    playClick({ freq: 1200 + electron.value * 12, duration: 0.04, type: "sine", volume: 0.03 });

    if (newSum === dev.target) {
      dev.active = false;
      score += 10;
      lastActionMsg = `Great! Device reached ${dev.target}. The bulb lights up!`;
      updateInfoBox();
      playSuccessMelody();
      animations.push(makeLightUpAnim(dev.x, dev.y));
      // small celebratory particle burst
      animations.push(makeCelebrationBurst(dev.x, dev.y));
      if (devices.every((d) => !d.active)) {
        setTimeout(() => {
          round++;
          if (round <= MAX_ROUNDS) {
            lastActionMsg = `Round complete! Get ready for round ${round}.`;
            updateInfoBox();
            spawnRound(round);
          } else {
            lastActionMsg = `You finished all rounds! Final score: ${score}. Press R to replay.`;
            updateInfoBox();
            const onR = (ev) => {
              if (ev.key === "r" || ev.key === "R") {
                resetGameState();
                container.removeEventListener("keydown", onR);
              }
            };
            container.addEventListener("keydown", onR);
          }
        }, 900);
      }
    }
  }

  function undoLastElectron() {
    const dev = devices[selectedDeviceIndex];
    if (!dev) return;
    const removed = dev.collected.pop();
    if (!removed) {
      lastActionMsg = "Nothing to undo for this device.";
      updateInfoBox();
      playErrorSound();
      return;
    }
    removed.collected = false;
    removed.collectTime = null;
    lastActionMsg = `Removed ${removed.value} from device.`;
    updateInfoBox();
    playTone({ freq: 240, duration: 0.08, type: "sine", volume: 0.04 });
  }

  function pickElectronByValue(val) {
    const candidates = electrons.filter((e) => !e.collected && e.value === val);
    if (candidates.length === 0) {
      lastActionMsg = `No available electron with value ${val}.`;
      updateInfoBox();
      playErrorSound();
      return;
    }
    const dev = devices[selectedDeviceIndex];
    const chosen = candidates.reduce((best, c) => {
      const d = Math.hypot(c.x - dev.x, c.y - dev.y);
      if (!best || d < best.d) return { c, d };
      return best;
    }, null).c;
    collectElectron(chosen);
  }

  // --- Animations / Visual effects ---
  function makeAttachAnim(electron, device) {
    const start = { x: electron.x, y: electron.y };
    const end = { x: device.x + rand(-18, 18), y: device.y + rand(24, 40) };
    const startTime = performance.now();
    const duration = 470;
    return {
      type: "attach",
      electron,
      start,
      end,
      startTime,
      duration
    };
  }

  function makeAttachParticles(sx, sy, dx, dy) {
    // small fast spark particles along path
    const list = [];
    const count = 8;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      list.push({
        type: "sparkTrail",
        x: sx,
        y: sy,
        vx: (dx - sx) * (0.9 * (t + rand(-0.02, 0.02))) / 100,
        vy: (dy - sy) * (0.9 * (t + rand(-0.02, 0.02))) / 100,
        life: 420 + Math.random() * 220,
        t: performance.now(),
        hue: 48 + Math.random() * 40
      });
    }
    return { type: "particleGroup", list };
  }

  function makeOverloadAnim(x, y) {
    return { type: "overload", x, y, t: performance.now(), life: 520 };
  }

  function makeLightUpAnim(x, y) {
    return { type: "light", x, y, t: performance.now(), life: 900 };
  }

  function makeFloatingSpark(x, y) {
    return {
      type: "spark",
      x,
      y,
      r: rand(2.5, 6.5),
      phase: rand(0, Math.PI * 2),
      drift: rand(-0.02, 0.02)
    };
  }

  function makeCelebrationBurst(x, y) {
    const burst = [];
    for (let i = 0; i < 18; i++) {
      const ang = rand(0, Math.PI * 2);
      const speed = rand(0.8, 3.2);
      burst.push({
        type: "celebrate",
        x,
        y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 1.2,
        t: performance.now(),
        life: 900 + Math.random() * 300,
        hue: 48 + Math.random() * 60
      });
    }
    return { type: "particleGroup2", list: burst };
  }

  // --- Drawing (enhanced visuals) ---
  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawCharacters();
    drawDevices();
    drawElectrons();
    drawAnimations();
    drawHUD();
    drawAudioIcon();
  }

  function drawBackground() {
    // soft radial vignette + gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#eaf8ff");
    g.addColorStop(0.5, "#f6fbff");
    g.addColorStop(1, "#fffefc");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle radial highlight near top-left (sun-like)
    const rg = ctx.createRadialGradient(120, 48, 10, 120, 48, 300);
    rg.addColorStop(0, "rgba(255,250,240,0.5)");
    rg.addColorStop(1, "rgba(255,250,240,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // animated circuit lines (parallax subtle motion)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#0a3550";
    ctx.lineWidth = 1;
    const t = performance.now() / 1600;
    for (let i = 0; i < 12; i++) {
      const y = (i / 12) * HEIGHT + Math.sin(t + i) * 8;
      ctx.beginPath();
      for (let x = 0; x < WIDTH; x += 20) {
        const jitter = Math.sin(x / 60 + t * 1.2 + i) * 6;
        if (x === 0) ctx.moveTo(x, y + jitter);
        else ctx.lineTo(x, y + jitter);
      }
      ctx.stroke();
    }
    ctx.restore();

    // small drifting nodes to suggest circuitry
    const now = performance.now();
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const cx = (i * 37) % WIDTH + Math.sin(now / 2400 + i) * 12;
      const cy = (i * 21) % HEIGHT + Math.cos(now / 2400 + i * 0.7) * 8;
      ctx.fillStyle = `rgba(255,245,200,${0.03 + (i % 5) * 0.02})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCharacters() {
    // Dr. Volt left bottom
    const dvx = 82;
    const dvy = HEIGHT - 80;
    drawBattery(dvx, dvy, characters.DrVolt.color, "Dr. Volt");

    // Sparky right bottom
    drawSpark(WIDTH - 120, HEIGHT - 85, characters.Sparky.color, "Sparky");

    // Bulby top center
    drawBulb(WIDTH / 2, 64, characters.Bulby.color, "Bulby");

    // subtle ground platform shadow
    ctx.save();
    const g = ctx.createLinearGradient(0, HEIGHT - 50, 0, HEIGHT);
    g.addColorStop(0, "rgba(6,12,20,0.05)");
    g.addColorStop(1, "rgba(6,12,20,0.02)");
    ctx.fillStyle = g;
    ctx.fillRect(0, HEIGHT - 40, WIDTH, 40);
    ctx.restore();
  }

  function drawBattery(x, y, color, label) {
    ctx.save();
    ctx.translate(x, y);

    // soft shadow
    ctx.fillStyle = "rgba(15,15,15,0.06)";
    ctx.beginPath();
    ctx.ellipse(0, 30, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // animated glossy body
    ctx.fillStyle = color;
    roundRect(ctx, -36, -28, 72, 56, 12);
    const grad = ctx.createLinearGradient(-36, -28, 36, 28);
    grad.addColorStop(0, shadeColor(color, -10));
    grad.addColorStop(0.6, color);
    grad.addColorStop(1, "#fff7c8");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#7a5a1a";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // terminal
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, -12, -40, 24, 8, 3);
    ctx.fill();

    // eyes and smile
    ctx.fillStyle = "#2b2b2b";
    ctx.beginPath();
    ctx.arc(-10, -6, 3.5, 0, Math.PI * 2);
    ctx.arc(10, -6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = 1;
    ctx.arc(0, 2, 9, 0, Math.PI);
    ctx.stroke();

    // label
    ctx.fillStyle = "#2c2c2c";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, 34);
    ctx.restore();
  }

  function drawSpark(x, y, color, label) {
    ctx.save();
    ctx.translate(x, y);

    // shadow
    ctx.fillStyle = "rgba(16,20,24,0.06)";
    ctx.beginPath();
    ctx.ellipse(0, 28, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // shape with gradient
    const grad = ctx.createRadialGradient(-6, -6, 4, 6, 6, 50);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(12, -4);
    ctx.lineTo(28, 0);
    ctx.lineTo(12, 6);
    ctx.lineTo(0, 28);
    ctx.lineTo(-12, 6);
    ctx.lineTo(-28, 0);
    ctx.lineTo(-12, -4);
    ctx.closePath();
    ctx.fill();

    // eyes
    ctx.fillStyle = "#122028";
    ctx.beginPath();
    ctx.arc(-8, -2, 3, 0, Math.PI * 2);
    ctx.arc(8, -2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#122028";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, 36);
    ctx.restore();
  }

  function drawBulb(x, y, color, label) {
    ctx.save();
    ctx.translate(x, y);

    // outer shine
    const g = ctx.createRadialGradient(0, 6, 4, 0, 6, 80);
    g.addColorStop(0, "rgba(255,255,210,0.65)");
    g.addColorStop(1, "rgba(255,255,210,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 6, 60, 64, 0, 0, Math.PI * 2);
    ctx.fill();

    // glass with glossy gradient
    const gradient = ctx.createRadialGradient(-6, -8, 4, 6, 6, 50);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.6, color);
    gradient.addColorStop(1, shadeColor(color, 18));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, 6, 30, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    // base
    ctx.fillStyle = "#bdbdbd";
    roundRect(ctx, -14, 32, 28, 14, 3);
    ctx.fill();

    // filament smile
    ctx.strokeStyle = "#6b4c00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, 6);
    ctx.quadraticCurveTo(0, 18, 10, 6);
    ctx.stroke();

    // label
    ctx.fillStyle = "#2c2c2c";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, -28);
    ctx.restore();
  }

  function drawDevices() {
    devices.forEach((d, idx) => {
      // pulsing when active/selected; subtle breathing
      d.pulsePhase += 0.02;
      const pulse = 1 + Math.sin(d.pulsePhase + idx) * 0.03;

      const lit = !d.active;
      ctx.save();
      ctx.translate(d.x, d.y);

      // glow when lit or when selected
      if (lit) {
        const g = ctx.createRadialGradient(0, 6, 4, 0, 6, 80);
        g.addColorStop(0, "rgba(255,238,160,0.9)");
        g.addColorStop(0.5, "rgba(255,220,120,0.5)");
        g.addColorStop(1, "rgba(255,220,120,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 6, 66 * pulse, 72 * pulse, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (selectedDeviceIndex === idx) {
        const g2 = ctx.createRadialGradient(0, 6, 4, 0, 6, 70);
        g2.addColorStop(0, "rgba(90,170,255,0.12)");
        g2.addColorStop(1, "rgba(90,170,255,0)");
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.ellipse(0, 6, 62 * pulse, 66 * pulse, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // glass body
      ctx.fillStyle = lit ? "#fff7d6" : "#ffffff";
      ctx.beginPath();
      ctx.ellipse(0, 6, 30, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#d7c2a6";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // base shadow
      ctx.fillStyle = "#9b9b9b";
      roundRect(ctx, -14, 32, 28, 14, 3);
      ctx.fill();

      // target label and current sum
      const current = d.collected.reduce((a, b) => a + b.value, 0);
      ctx.fillStyle = "#0e2a36";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Target: ${d.target}`, 0, -46);
      ctx.fillText(`${current} / ${d.target}`, 0, 60);

      // show selection highlight
      if (selectedDeviceIndex === idx) {
        ctx.strokeStyle = "rgba(38, 150, 255, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(
          0,
          6,
          40 + Math.sin(d.pulsePhase) * 2,
          44 + Math.cos(d.pulsePhase) * 2,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }

      // dynamic wire connection (curved and slightly animated)
      ctx.strokeStyle = "rgba(60,60,60,0.24)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      const startX = -300;
      const startY = HEIGHT - 80 - 20 + Math.sin(d.pulsePhase * 0.9) * 4;
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(
        d.x - 120,
        d.y + 60 + Math.sin(d.pulsePhase) * 3,
        d.x,
        d.y + 34
      );
      ctx.stroke();

      // collected tokens near device
      d.collected.forEach((e, i) => {
        const px = -28 + i * 18;
        const py = 44;
        ctx.beginPath();
        const innerGrad = ctx.createLinearGradient(px - 8, py - 8, px + 8, py + 8);
        innerGrad.addColorStop(0, "#fff8e5");
        innerGrad.addColorStop(1, "#fff2d0");
        ctx.fillStyle = innerGrad;
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2b2b2b";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(e.value), px, py + 4);
        // small highlight
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px - 4, py - 6, 3.8, 0, Math.PI * 2);
        ctx.stroke();
      });

      ctx.restore();
    });
  }

  function drawElectrons() {
    const now = performance.now();
    electrons.forEach((e) => {
      if (e.collected) {
        // skip drawing original pos; attach anim will draw during animations
        return;
      }

      // bobbing and slight horizontal drift with collision clamp
      e.bob += 0.02 + Math.sin(now / 6000 + e.angle) * 0.002;
      e.x += e.vx;
      e.y = e.baseY + Math.sin(e.bob) * 8;

      // Keep within bounds
      if (e.x < 30) e.x = 30;
      if (e.x > WIDTH - 30) e.x = WIDTH - 30;

      // store trail positions (capped)
      e.prevPositions.unshift({ x: e.x, y: e.y });
      if (e.prevPositions.length > 9) e.prevPositions.pop();

      drawElectron(e);
    });
  }

  function drawElectron(e) {
    ctx.save();

    // draw trailing arc from prevPositions for soft motion blur
    ctx.lineWidth = 2;
    for (let i = 0; i < e.prevPositions.length - 1; i++) {
      const p1 = e.prevPositions[i];
      const p2 = e.prevPositions[i + 1];
      const a = 1 - i / (e.prevPositions.length + 1);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,238,140,${0.12 * a})`;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // soft glow
    const glow = ctx.createRadialGradient(e.x, e.y - 4, 2, e.x, e.y, 30);
    glow.addColorStop(0, `rgba(255,246,200,0.95)`);
    glow.addColorStop(1, `rgba(255,220,120,0.02)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.r + 10, e.r + 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // core with subtle orbital shine
    ctx.beginPath();
    ctx.fillStyle = "#fffdf0";
    ctx.arc(e.x, e.y, e.r + 2, 0, Math.PI * 2);
    ctx.fill();

    // highlight ellipse
    ctx.beginPath();
    ctx.ellipse(e.x - 6, e.y - 6, 6, 3, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fill();

    // ring
    ctx.strokeStyle = "#f2b800";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 2, 0, Math.PI * 2);
    ctx.stroke();

    // number text
    ctx.fillStyle = "#2a2a2a";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(e.value), e.x, e.y + 5);

    ctx.restore();
  }

  function drawAnimations() {
    const now = performance.now();

    // flatten existing animations list to a working array (some groups hold lists)
    let newAnims = [];
    for (const a of animations) {
      if (a && a.type === "particleGroup" && a.list) {
        // groups: expand to individual particles for handling
        newAnims.push(a);
      } else {
        newAnims.push(a);
      }
    }
    animations = animations.filter(Boolean);

    // Process animations (attach, overload, light, spark, particle groups)
    const remaining = [];
    for (const a of animations) {
      if (!a) continue;
      if (a.type === "attach") {
        const t = (now - a.startTime) / a.duration;
        if (t >= 1) {
          // finished
          continue;
        }
        const ease = 1 - Math.pow(1 - t, 3);
        const x = a.start.x + (a.end.x - a.start.x) * ease;
        const y = a.start.y + (a.end.y - a.start.y) * ease;

        // moving electron
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.fillStyle = "#fffaf0";
        ctx.arc(x, y, 10 + (1 - t) * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a2a2a";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(a.electron.value), x, y + 4);
        ctx.restore();

        // spark along wire
        ctx.save();
        ctx.strokeStyle = `rgba(255,220,120,${1 - t})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.start.x, a.start.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();

        remaining.push(a);
      } else if (a.type === "overload") {
        const tt = (now - a.t) / a.life;
        if (tt > 1) continue;
        ctx.save();
        const alpha = 1 - tt;
        for (let i = 0; i < 9; i++) {
          ctx.strokeStyle = `rgba(255,80,60,${alpha})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          const ang = (i / 9) * Math.PI * 2 + tt * 6;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(
            a.x + Math.cos(ang) * 22 * (1 - tt),
            a.y + Math.sin(ang) * 22 * (1 - tt)
          );
          ctx.stroke();
        }
        ctx.restore();
        remaining.push(a);
      } else if (a.type === "light") {
        const life = a.life;
        const t = (now - a.t) / life;
        if (t > 1) continue;
        ctx.save();
        const rad = 40 + t * 80;
        const g = ctx.createRadialGradient(a.x, a.y, 8, a.x, a.y, rad);
        g.addColorStop(0, `rgba(255,240,160,${0.7 - t * 0.6})`);
        g.addColorStop(1, "rgba(255,240,160,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(a.x, a.y, rad, rad * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        remaining.push(a);
      } else if (a.type === "spark") {
        a.phase += 0.008 + a.drift * 0.3;
        const r = a.r + Math.sin(a.phase * 2) * 1.25;
        ctx.save();
        ctx.fillStyle = `rgba(255,255,190,0.62)`;
        ctx.beginPath();
        ctx.arc(a.x, a.y + Math.sin(a.phase) * 6, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        remaining.push(a);
      } else if (a.type === "particleGroup") {
        // contains .list of particles
        const live = [];
        for (const p of a.list) {
          const dt = now - p.t;
          if (dt > p.life) continue;
          const pct = 1 - dt / p.life;
          p.x += p.vx * (1 + (1 - pct) * 2);
          p.y += p.vy * (1 + (1 - pct) * 2);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `rgba(255,${220 - pct * 60},${80 + pct * 60},${0.7 * pct})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2 + pct * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          live.push(p);
        }
        if (live.length > 0) {
          a.list = live;
          remaining.push(a);
        }
      } else if (a.type === "particleGroup2") {
        const live = [];
        for (const p of a.list) {
          const dt = now - p.t;
          if (dt > p.life) continue;
          p.vy += 0.06; // gravity
          p.x += p.vx;
          p.y += p.vy;
          const pct = 1 - dt / p.life;
          ctx.save();
          ctx.globalAlpha = pct;
          ctx.fillStyle = `hsl(${p.hue}, 90%, ${50 - pct * 15}%)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5 + pct * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          live.push(p);
        }
        if (live.length > 0) {
          a.list = live;
          remaining.push(a);
        }
      } else if (a.type === "celebrate") {
        // legacy single celebrate particle
        const dt = now - a.t;
        if (dt > a.life) continue;
        a.vy += 0.04;
        a.x += a.vx;
        a.y += a.vy;
        const pct = 1 - dt / a.life;
        ctx.save();
        ctx.globalAlpha = pct;
        ctx.fillStyle = `hsl(${a.hue}, 85%, 60%)`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 2.5 + pct * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        remaining.push(a);
      } else if (a.type === "sparkTrail") {
        const dt = now - a.t;
        if (dt > a.life) continue;
        a.x += a.vx;
        a.y += a.vy;
        const pct = 1 - dt / a.life;
        ctx.save();
        ctx.fillStyle = `rgba(255,${210 - pct * 60},120,${0.6 * pct})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 1.6 + pct * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        remaining.push(a);
      } else {
        // unknown animation type - skip
      }
    }

    animations = remaining;

    // draw collected electrons anchored to devices (static)
    devices.forEach((d) => {
      d.collected.forEach((e, i) => {
        // skip if an attach animation in progress for this electron
        const inAnim = animations.some((a) => a.type === "attach" && a.electron === e);
        if (inAnim) return;
        ctx.save();
        ctx.translate(d.x, d.y);
        const px = -28 + i * 18;
        const py = 44;
        ctx.beginPath();
        const innerGrad = ctx.createLinearGradient(px - 8, py - 8, px + 8, py + 8);
        innerGrad.addColorStop(0, "#fff8e5");
        innerGrad.addColorStop(1, "#fff2d0");
        ctx.fillStyle = innerGrad;
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2d2d2d";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(e.value), px, py + 4);
        ctx.restore();
      });
    });
  }

  function drawHUD() {
    ctx.save();
    // translucent rounded panel
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    roundRect(ctx, 8, 8, WIDTH - 16, 52, 8);
    ctx.fill();

    // subtle border
    ctx.strokeStyle = "rgba(20,40,60,0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // title and info
    ctx.fillStyle = "#15202b";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Power Planet - Round ${round}`, 20, 30);
    ctx.font = "14px sans-serif";
    ctx.fillText(`Score: ${score}`, 20, 48);

    // last action message (center)
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#2c3a47";
    // Trim long messages to avoid overflow
    const msg = lastActionMsg.length > 160 ? lastActionMsg.slice(0, 157) + "..." : lastActionMsg;
    ctx.fillText(msg, WIDTH / 2, 34);

    // controls hint
    ctx.font = "12px sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = "#2d3b44";
    ctx.fillText("Click a bulb → Click electrons to add | Keys: ← → 1-9 Backspace M", WIDTH - 18, 44);

    ctx.restore();
  }

  function drawAudioIcon() {
    const x = 22;
    const y = 34;
    ctx.save();

    // small rounded square background
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(ctx, 12, 12, 44, 44, 8);
    ctx.fill();

    // speaker
    ctx.fillStyle = audioEnabled ? "#2a9bd6" : "#999999";
    ctx.beginPath();
    ctx.moveTo(16, 32);
    ctx.lineTo(28, 24);
    ctx.lineTo(28, 40);
    ctx.closePath();
    ctx.fill();

    // waves or muted X
    ctx.strokeStyle = audioEnabled ? "#2a9bd6" : "#d9534f";
    ctx.lineWidth = 2;
    if (audioEnabled) {
      ctx.beginPath();
      ctx.arc(36, 32, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(36, 32, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#d9534f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(34, 25);
      ctx.lineTo(44, 39);
      ctx.moveTo(44, 25);
      ctx.lineTo(34, 39);
      ctx.stroke();
    }

    ctx.font = "10px sans-serif";
    ctx.fillStyle = "#2d3b44";
    ctx.textAlign = "left";
    ctx.fillText("M to mute", 12, 58);

    ctx.restore();
  }

  // --- Helpers ---
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Utility to slightly shade a hex or CSS color (approximate)
  function shadeColor(hex, percent) {
    // hex may be #rrggbb or named colors not supported; try to use canvas to compute
    try {
      const tmp = document.createElement("canvas");
      const tctx = tmp.getContext("2d");
      tctx.fillStyle = hex;
      const computed = tctx.fillStyle; // normalized color like rgb(...)
      // parse rgb
      const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return hex;
      let r = parseInt(m[1], 10);
      let g = parseInt(m[2], 10);
      let b = parseInt(m[3], 10);
      r = clamp(Math.round(r + (percent / 100) * r), 0, 255);
      g = clamp(Math.round(g + (percent / 100) * g), 0, 255);
      b = clamp(Math.round(b + (percent / 100) * b), 0, 255);
      return `rgb(${r},${g},${b})`;
    } catch (e) {
      return hex;
    }
  }

  // --- Animation Loop ---
  let lastTime = 0;
  function loop(t) {
    if (isPaused) {
      draw();
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.36)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#fff";
      ctx.font = "34px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", WIDTH / 2, HEIGHT / 2);
      ctx.restore();
      requestAnimationFrame(loop);
      return;
    }
    try {
      draw();
    } catch (err) {
      console.error("Drawing error:", err);
    }
    lastTime = t;
    requestAnimationFrame(loop);
  }

  // --- Pause / Audio toggles ---
  function togglePause() {
    isPaused = !isPaused;
    lastActionMsg = isPaused ? "Game paused. Press P to resume." : "Game resumed!";
    updateInfoBox();
    playTone({ freq: 320, duration: 0.08, volume: 0.03 });
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      ensureAudioOnUserGesture();
      if (audioAvailable) startAmbient();
      lastActionMsg = "Audio on.";
      playTone({ freq: 600, duration: 0.08, volume: 0.05, type: "triangle" });
    } else {
      stopAmbient();
      lastActionMsg = "Audio muted. Press M or click speaker to unmute.";
      playErrorSound();
    }
    updateInfoBox();
  }

  // --- Info Box / Accessibility Text ---
  function updateInfoBox() {
    const dev = devices[selectedDeviceIndex];
    const devLabel = dev ? `Bulb ${selectedDeviceIndex + 1} target ${dev.target} current ${dev.collected.reduce((a, b) => a + b.value, 0)}` : "";
    infoBox.textContent = `Round ${round} | Score ${score} | ${devLabel} | ${lastActionMsg} Controls: Click a bulb, then click electrons. Keyboard: Left/Right to change bulb, 1-9 to pick, Backspace to undo, M to mute.`;
  }

  // --- Initialize and start ---
  resetGameState();

  // Ensure ambient audio not started until user interaction
  if (audioAvailable && audioEnabled) {
    stopAmbient();
  }

  requestAnimationFrame(loop);

  lastActionMsg = "Welcome to Power Planet! Click a bulb to select it, then click electrons to add numbers to reach the target. Try using keys 1-9 too. Press M to mute.";
  updateInfoBox();

  if (!audioAvailable) {
    lastActionMsg = "Audio is not available in this browser — sound will be disabled. Follow on-screen text instructions.";
    updateInfoBox();
  }

  // Help overlay
  container.addEventListener("keydown", (e) => {
    if (e.key === "?" || e.key === "h" || e.key === "H") {
      alert(
        "Power Planet Help:\n- Click a bulb (top) to select it.\n- Click electrons (floating circles) to add their value to the selected bulb.\n- Use keys 1-9 to pick electrons by number.\n- Use ← → to switch selected bulb. Backspace to undo the last pick for the selected bulb.\n- M to mute/unmute audio. P to pause.\n- Reach the target exactly to light each bulb. Enjoy!"
      );
    }
  });

  // Runtime error handling
  window.addEventListener("error", (ev) => {
    console.error("Runtime error in game:", ev.error || ev.message);
    lastActionMsg = "An unexpected error occurred. Please reload the page to try again.";
    updateInfoBox();
    stopAmbient();
  });
})();