(function () {
  // Enhanced Machine Math Workshop - Visual & Audio improvements
  // Renders inside element with id "game-of-the-day-stage"
  // Canvas size: 720 x 480
  // All visuals with canvas API, all audio with Web Audio API
  // Mechanics and math logic preserved from original

  // Constants
  const WIDTH = 720;
  const HEIGHT = 480;
  const STAGE_ID = "game-of-the-day-stage";
  const MAX_LEVELS = 6;
  const GEAR_COUNT = 7; // gears shown per level
  const FONT = "16px system-ui, -apple-system, 'Segoe UI', Roboto";
  const LARGE_FONT = "20px system-ui, -apple-system, 'Segoe UI', Roboto";

  // Stage and DOM setup
  const stageElem = document.getElementById(STAGE_ID);
  if (!stageElem) {
    console.error(`Element with id "${STAGE_ID}" not found. Game cannot start.`);
    return;
  }

  // Create a live region for screen reader feedback and instructions
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  liveRegion.style.width = "1px";
  liveRegion.style.height = "1px";
  liveRegion.style.overflow = "hidden";
  stageElem.appendChild(liveRegion);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Machine Math Workshop. Use arrow keys to pick gears and press Enter to add them to the machine. Press P to process."
  );
  canvas.tabIndex = 0; // focusable for keyboard
  stageElem.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: false });

  // Scale for crisp text on high DPI
  function setPixelRatio() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = WIDTH + "px";
    canvas.style.height = HEIGHT + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setPixelRatio();
  window.addEventListener("resize", setPixelRatio);

  // Audio setup - enhanced ambient pad, noise, and gentle per-gear sounds
  let audioCtx = null;
  let masterGain = null;
  let bgGain = null;
  let pad1 = null;
  let pad2 = null;
  let noiseSource = null;
  let audioEnabled = true;
  let audioInitError = null;

  function initAudio(onUserGesture = false) {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();

      // Master gain
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.7; // moderate volume
      masterGain.connect(audioCtx.destination);

      // Slight compressor/limiter for gentle saturation (try/catch if not supported)
      try {
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 3;
        masterGain.disconnect();
        masterGain.connect(comp);
        comp.connect(audioCtx.destination);
      } catch (e) {
        // ignore if not supported
      }

      // Ambient pad - two detuned sine oscillators for warmth
      pad1 = audioCtx.createOscillator();
      pad2 = audioCtx.createOscillator();
      pad1.type = "sine";
      pad2.type = "sine";
      pad1.frequency.value = 110; // base
      pad2.frequency.value = 110 * 1.005; // slight detune
      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = "lowpass";
      padFilter.frequency.value = 900;
      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.03; // subtle
      pad1.connect(padFilter);
      pad2.connect(padFilter);
      padFilter.connect(padGain);
      padGain.connect(masterGain);
      pad1.start();
      pad2.start();

      // Gentle noise texture for mechanical ambience
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.5;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.value = 1200;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.value = 0.004; // very subtle
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);
      noise.start();

      // store references
      bgGain = padGain;
      noiseSource = noise;

      updateLiveRegion("Audio initialized.");
    } catch (e) {
      audioInitError = e;
      console.error("Audio initialization error:", e);
      updateLiveRegion("Audio unavailable in this browser.");
      audioEnabled = false;
    }
  }

  // Play a short tone with a gentle envelope and optional filter
  function playTone(freq = 440, duration = 0.14, type = "sine", volume = 0.12) {
    if (audioInitError || !audioEnabled) return;
    try {
      if (!audioCtx) initAudio();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const fl = audioCtx.createBiquadFilter();
      o.type = type;
      o.frequency.value = freq;
      fl.type = "highpass";
      fl.frequency.value = 80;
      g.gain.value = 0.0001;
      o.connect(fl);
      fl.connect(g);
      g.connect(masterGain);
      const t = audioCtx.currentTime;
      // quick attack, smooth decay
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(volume, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      o.start(t);
      o.stop(t + duration + 0.04);
    } catch (e) {
      console.error("playTone error:", e);
    }
  }

  // Positive chime sequence - warmer, layered
  function playPositive() {
    if (audioInitError || !audioEnabled) return;
    try {
      if (!audioCtx) initAudio();
      const now = audioCtx.currentTime;
      const notes = [660, 880, 990];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const fl = audioCtx.createBiquadFilter();
        o.type = i === 0 ? "triangle" : "sine";
        o.frequency.value = f;
        fl.type = "lowpass";
        fl.frequency.value = 2000 - i * 300;
        g.gain.value = 0.0001;
        o.connect(fl);
        fl.connect(g);
        g.connect(masterGain);
        const start = now + i * 0.07;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(0.12, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
        o.start(start);
        o.stop(start + 0.44);
      });
      updateLiveRegion("Correct! Target reached.");
    } catch (e) {
      console.error("playPositive error:", e);
    }
  }

  // Negative thud - low sine + small noise pop
  function playNegative() {
    if (audioInitError || !audioEnabled) return;
    try {
      if (!audioCtx) initAudio();
      const now = audioCtx.currentTime;
      // low thud
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = 90;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.22, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      o.start(now);
      o.stop(now + 0.4);

      // small click overlay
      const clickOsc = audioCtx.createOscillator();
      const clickGain = audioCtx.createGain();
      clickOsc.type = "square";
      clickOsc.frequency.value = 1200;
      clickOsc.connect(clickGain);
      clickGain.connect(masterGain);
      clickGain.gain.setValueAtTime(0.0001, now);
      clickGain.gain.linearRampToValueAtTime(0.06, now + 0.005);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      clickOsc.start(now);
      clickOsc.stop(now + 0.14);

      updateLiveRegion("That went over the target. Try again.");
    } catch (e) {
      console.error("playNegative error:", e);
    }
  }

  // Gentle click tailored to gear picks
  function playClick() {
    playTone(880 + Math.random() * 120 - 60, 0.05, "triangle", 0.06);
  }

  // Toggle audio on/off with error handling
  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (!audioCtx) {
      // will initialize on next gesture if enabling
      updateLiveRegion(audioEnabled ? "Audio enabled. Tap to start sounds." : "Audio disabled.");
      return;
    }
    try {
      if (audioEnabled) {
        masterGain.gain.setTargetAtTime(0.7, audioCtx.currentTime, 0.05);
        if (bgGain) bgGain.gain.setTargetAtTime(0.03, audioCtx.currentTime, 0.05);
        updateLiveRegion("Audio on.");
      } else {
        masterGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.05);
        updateLiveRegion("Audio off.");
      }
    } catch (e) {
      console.error("toggleAudio error:", e);
    }
  }

  // Game state (unchanged logic)
  let levels = [];
  let currentLevelIndex = 0;
  let gears = []; // gear objects for current level
  let selectedIDs = []; // ids of gears currently placed in machine slot
  let takenIDs = new Set(); // gears that have been moved into slot
  let processing = false;
  let focusIndex = 0; // keyboard focus for gear selection or control
  let attempts = 0;
  let showHint = false;
  let animationTime = 0;

  // Layout locations
  const conveyorY = HEIGHT - 110;
  const conveyorLeft = 24;
  const conveyorRight = WIDTH - 240;
  const machineX = WIDTH - 200;
  const machineY = 60;

  // Create levels algorithmically to ensure solvable puzzle
  function generateLevels(num) {
    const arr = [];
    for (let i = 0; i < num; i++) {
      const difficulty = 1 + i;
      const targetMin = 6 + difficulty * 3;
      const targetMax = 12 + difficulty * 4;
      const target = randInt(targetMin, targetMax);
      let subset = [];
      let remaining = target;
      let k = randInt(2, Math.min(5, Math.max(2, Math.floor(target / 2))));
      for (let s = 0; s < k - 1; s++) {
        const maxVal = Math.min(9, remaining - (k - s - 1) * 1);
        const val = randInt(1, Math.max(1, maxVal));
        subset.push(val);
        remaining -= val;
      }
      subset.push(Math.max(1, remaining));
      let fixed = [];
      subset.forEach((v) => {
        if (v <= 9) fixed.push(v);
        else {
          let r = v;
          while (r > 9) {
            fixed.push(9);
            r -= 9;
          }
          if (r > 0) fixed.push(r);
        }
      });
      const gearVals = fixed.slice();
      while (gearVals.length < GEAR_COUNT - 1) {
        gearVals.push(randInt(1, 9));
      }
      gearVals.push(randInt(1, 9));
      shuffleArray(gearVals);
      arr.push({ target: target, gearValues: gearVals });
    }
    return arr;
  }

  // Utility helpers
  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  // Initialize first levels
  levels = generateLevels(MAX_LEVELS);

  // Create gear objects for a level
  function setupLevel(index) {
    gears = [];
    selectedIDs = [];
    takenIDs = new Set();
    attempts = 0;
    processing = false;
    focusIndex = 0;
    showHint = false;
    const data = levels[index];
    const values = data.gearValues.slice();
    const spacing = (conveyorRight - conveyorLeft) / values.length;
    for (let i = 0; i < values.length; i++) {
      const x = conveyorLeft + spacing * i + spacing / 2;
      const y = conveyorY + randInt(-6, 6);
      const id = `L${index}G${i}`;
      gears.push({
        id,
        value: values[i],
        x,
        y,
        radius: 30 + (i % 2 ? 2 : 0),
        angle: 0,
        wobble: Math.random() * Math.PI * 2,
        taken: false,
        visible: true,
        colorSeed: Math.random(),
      });
    }
    updateLiveRegion(
      `Level ${index + 1}. Build total ${data.target} using the gears below. Use arrow keys to pick and Enter to move a gear to the machine.`
    );
  }

  // Start first level
  setupLevel(currentLevelIndex);

  // Ambient visual particles for background (subtle)
  const ambientParticles = [];
  for (let i = 0; i < 28; i++) {
    ambientParticles.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT * 0.6,
      r: 1 + Math.random() * 3,
      alpha: 0.05 + Math.random() * 0.15,
      vy: 0.02 + Math.random() * 0.18,
    });
  }

  // Drawing helpers (enhanced visuals)
  function clearCanvas() {
    // layered background: soft radial light + subtle texture
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#f1fbff");
    sky.addColorStop(0.5, "#e8f6fb");
    sky.addColorStop(1, "#eefaf2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft overhead glow (radial)
    const rg = ctx.createRadialGradient(WIDTH * 0.15, HEIGHT * 0.12, 30, WIDTH * 0.15, HEIGHT * 0.12, 380);
    rg.addColorStop(0, "rgba(255,255,230,0.25)");
    rg.addColorStop(1, "rgba(255,255,230,0.02)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle mechanical grid pattern
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#cfe9f2";
    for (let x = 0; x < WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + (animationTime % 40), 0);
      ctx.lineTo(x + (animationTime % 40), HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + (animationTime % 40));
      ctx.lineTo(WIDTH, y + (animationTime % 40));
      ctx.stroke();
    }
    ctx.restore();

    // ambient floating particles
    ambientParticles.forEach((p) => {
      p.y += p.vy;
      if (p.y > HEIGHT) {
        p.y = -10;
        p.x = Math.random() * WIDTH;
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(220,250,255,${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawTitle() {
    ctx.save();
    ctx.font = "700 24px system-ui, -apple-system, 'Segoe UI', Roboto";
    // small icon: friendly wrench
    ctx.fillStyle = "#08323f";
    ctx.beginPath();
    ctx.moveTo(18, 14);
    ctx.arc(34, 22, 12, -0.8, 0.6);
    ctx.fill();
    ctx.fillStyle = "#afe8ff";
    ctx.fillRect(28, 8, 6, 24);
    ctx.fillStyle = "#244";
    ctx.fillText("Machine Math Workshop", 58, 34);
    ctx.restore();
  }

  function drawInstructions() {
    ctx.save();
    ctx.font = FONT;
    ctx.fillStyle = "#233";
    ctx.globalAlpha = 0.96;
    const instructions = [
      "Pick gears and put them into the machine so their sum equals the target number.",
      "Keyboard: Left/Right to move, Enter/Space to pick/unpick, P to process, R to reset, S to toggle sound.",
      "Click a gear to pick it, click a gear in the slot to return it.",
    ];
    for (let i = 0; i < instructions.length; i++) {
      ctx.fillText(instructions[i], 20, 62 + i * 18);
    }
    ctx.restore();
  }

  function drawRobotMechanic() {
    // Friendly robot character on left for charm
    const rx = 12;
    const ry = conveyorY - 140;
    ctx.save();
    ctx.translate(rx, ry);
    // body
    ctx.fillStyle = "#f6f8fb";
    roundRect(ctx, 10, 30, 120, 98, 12, true, false);
    ctx.fillStyle = "#d8eaf0";
    roundRect(ctx, 10, 30, 120, 18, 8, true, false);
    // head
    ctx.fillStyle = "#fff";
    roundRect(ctx, 28, 4, 84, 48, 12, true, false);
    // eye
    ctx.fillStyle = "#163";
    ctx.beginPath();
    ctx.arc(68, 28, 10, 0, Math.PI * 2);
    ctx.fill();
    // little smile
    ctx.strokeStyle = "#082";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(68, 38, 7, 0, Math.PI);
    ctx.stroke();
    // wrench in hand (stylized)
    ctx.fillStyle = "#9fc";
    ctx.beginPath();
    ctx.moveTo(12, 86);
    ctx.lineTo(0, 106);
    ctx.lineTo(16, 110);
    ctx.lineTo(30, 90);
    ctx.closePath();
    ctx.fill();
    // badge
    ctx.fillStyle = "#ffdf85";
    roundRect(ctx, 18, 50, 28, 16, 6, true, false);
    ctx.fillStyle = "#284";
    ctx.font = "bold 10px system-ui, -apple-system, 'Segoe UI', Roboto";
    ctx.fillText("BOT", 24, 62);
    ctx.restore();
  }

  // Utility: rounded rect
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
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

  function drawMachineOutline() {
    ctx.save();
    // main machine with nicer rounded shapes and metallic gradient
    const mx = machineX;
    const my = machineY;
    const mw = 180;
    const mh = 320;
    const g = ctx.createLinearGradient(mx, my, mx + mw, my + mh);
    g.addColorStop(0, "#f8fbfc");
    g.addColorStop(0.5, "#e7f3f7");
    g.addColorStop(1, "#dbeef2");
    ctx.fillStyle = g;
    roundRect(ctx, mx, my, mw, mh, 14, true, false);

    // rivets
    ctx.fillStyle = "#c7e6ee";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(mx + 10 + i * 34, my + 12, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // front panel shadow
    ctx.fillStyle = "rgba(10,20,24,0.02)";
    roundRect(ctx, mx + 12, my + 12, mw - 24, mh - 24, 10, true, false);
    ctx.restore();
  }

  function drawMachineDisplay(target, currentSum, processingAnim) {
    ctx.save();
    const sx = machineX + 16;
    const sy = machineY + 18;
    const sw = 148;
    const sh = 58;

    // display glass with subtle reflection
    const glass = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    glass.addColorStop(0, processingAnim ? "#e8fff0" : "#071a1e");
    glass.addColorStop(1, processingAnim ? "#d6f7ff" : "#052427");
    ctx.fillStyle = glass;
    roundRect(ctx, sx, sy, sw, sh, 8, true, false);

    // display text with subtle shadow
    ctx.font = "600 18px system-ui, -apple-system, 'Segoe UI', Roboto";
    ctx.fillStyle = processingAnim ? "#073" : "#9ff4ff";
    ctx.shadowColor = "rgba(0,0,0,0.12)";
    ctx.shadowBlur = 4;
    ctx.fillText(`Target: ${target}`, sx + 12, sy + 27);

    ctx.font = "700 20px system-ui, -apple-system, 'Segoe UI', Roboto";
    ctx.fillStyle = processingAnim ? "#073" : "#bffcff";
    ctx.fillText(`Sum: ${currentSum}`, sx + 12, sy + 52);
    ctx.restore();
  }

  // Conveyor belt animation pattern
  function drawConveyor() {
    ctx.save();
    const left = conveyorLeft - 10;
    const width = conveyorRight - conveyorLeft + 20;
    const y = conveyorY - 12;
    // base
    ctx.fillStyle = "#e7f3f8";
    roundRect(ctx, left, y, width, 70, 8, true, false);
    // moving stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, y, width, 70);
    ctx.clip();
    const stripeW = 28;
    const offset = (animationTime * 0.8) % stripeW;
    for (let sx = left - stripeW; sx < left + width + stripeW; sx += stripeW) {
      ctx.fillStyle = sx % (stripeW * 2) ? "rgba(18,55,66,0.02)" : "rgba(18,55,66,0.03)";
      ctx.fillRect(sx + offset, y, stripeW, 70);
    }
    ctx.restore();

    // subtle bolts
    ctx.fillStyle = "#cfe";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(left + 20 + i * 100, y + 58, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGears() {
    // draw conveyor behind gears first
    drawConveyor();
    // draw each gear with shading and rotating teeth
    gears.forEach((g, i) => {
      if (!g.visible) return;
      // subtle rotation speed varies by index
      g.angle += 0.004 + (i % 3) * 0.0016;
      // small bobbing
      const bob = Math.sin((animationTime + g.wobble) / 18) * 2;
      drawGear(g.x, g.y + bob, g.radius, g.value, g.angle, g.taken, i === focusIndex && !g.taken, g.colorSeed);
    });
  }

  // Enhanced gear drawing with gradient, teeth and highlight
  function drawGear(x, y, r, label, angle = 0, taken = false, focused = false, seed = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // drop shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(20,30,30,0.12)";
    ctx.ellipse(6, r + 8, r + 6, r + 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // gear teeth - draw as radial rectangles with subtle rounding
    const teeth = 12;
    for (let t = 0; t < teeth; t++) {
      const theta = (t / teeth) * Math.PI * 2;
      const tx = Math.cos(theta) * (r + 6);
      const ty = Math.sin(theta) * (r + 6);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(theta);
      ctx.fillStyle = `rgba(210,220,225,${0.9 - seed * 0.4})`;
      roundRect(ctx, -4, -3, 8, 6, 2, true, false);
      ctx.restore();
    }

    // main body with radial gradient
    const grad = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    grad.addColorStop(0, taken ? "#e9f6ff" : "#fffef6");
    grad.addColorStop(1, taken ? "#dbeef8" : "#f3f4ef");
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // subtle perimeter stroke
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#cfc9be";
    ctx.stroke();

    // inner hub
    ctx.beginPath();
    ctx.fillStyle = taken ? "#deefff" : "#eef8ff";
    ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#b7cbd4";
    ctx.stroke();

    // central rivet
    ctx.beginPath();
    ctx.fillStyle = "#173";
    ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // numeric label
    ctx.fillStyle = "#0b2b2b";
    ctx.font = "700 18px system-ui, -apple-system, 'Segoe UI', Roboto";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(label), 0, 0);

    // focus glow ring
    if (focused) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "rgba(255,210,110,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 8 + Math.sin(animationTime / 14) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // soft particle highlight
      for (let p = 0; p < 6; p++) {
        const ang = (p / 6) * Math.PI * 2 + animationTime / 90;
        const px = Math.cos(ang) * (r + 14 + Math.sin(animationTime / 40 + p));
        const py = Math.sin(ang) * (r + 14 + Math.cos(animationTime / 40 + p));
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,215,110,${0.12 + (p % 2) * 0.06})`;
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawSlotGears() {
    // Display selected gears in machine slot area with small floating animation
    const sx = machineX + 28;
    const sy = machineY + 106;
    const slotW = 124;
    const slotPadding = 12;
    const slotCols = 3;
    const cellW = (slotW - slotPadding * 2) / slotCols;
    const cellH = 44;
    for (let i = 0; i < selectedIDs.length; i++) {
      const id = selectedIDs[i];
      const gear = gears.find((g) => g.id === id);
      if (!gear) continue;
      const col = i % slotCols;
      const row = Math.floor(i / slotCols);
      const gx = sx + slotPadding + col * cellW + cellW / 2;
      const gy = sy + slotPadding + row * (cellH + 6) + cellH / 2;
      const float = Math.sin((animationTime + i * 12) / 26) * 2;
      drawGear(
        gx,
        gy + float,
        20,
        gear.value,
        gear.angle + 0.18 * Math.sin(animationTime / 120 + i),
        true,
        false,
        gear.colorSeed
      );
    }
  }

  function drawControls() {
    ctx.save();
    ctx.font = "700 14px system-ui, -apple-system, 'Segoe UI', Roboto";

    // Process button (rounded)
    const bx = machineX + 36;
    const by = machineY + 284;
    drawButton(bx, by, 110, 28, "#76d1d8", "#48aeb4", "PROCESS (P)");

    // Reset
    const rx = machineX + 36;
    const ry = machineY + 320;
    drawButton(rx, ry, 110, 26, "#ffd7c9", "#f0a98f", "RESET (R)", "#5a2313");

    // Sound indicator
    const sxIcon = machineX + 36;
    const syIcon = machineY + 354;
    drawButton(
      sxIcon,
      syIcon,
      110,
      26,
      audioEnabled ? "#e2ffeb" : "#ffeaea",
      audioEnabled ? "#bfe6c9" : "#f4b6b6",
      audioEnabled ? "SOUND ON (S)" : "SOUND OFF (S)",
      audioEnabled ? "#063" : "#630"
    );

    // small visual audio pulse
    if (audioEnabled && audioCtx) {
      ctx.globalAlpha = 0.92;
      const px = sxIcon + 92;
      const py = syIcon + 13;
      const pulse = 4 + 2 * Math.sin(animationTime / 90);
      ctx.fillStyle = "rgba(20,180,140,0.12)";
      ctx.beginPath();
      ctx.arc(px, py, pulse + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#07ad78";
      ctx.beginPath();
      ctx.arc(px, py, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawButton(x, y, w, h, bg, stroke, label, labelColor = "#052") {
    ctx.save();
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, 8, true, false);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = labelColor;
    ctx.font = "700 14px system-ui, -apple-system, 'Segoe UI', Roboto";
    ctx.fillText(label, x + 8, y + h - 8);
    ctx.restore();
  }

  function drawLevelIndicator() {
    ctx.save();
    ctx.font = "14px system-ui, -apple-system, 'Segoe UI', Roboto";
    ctx.fillStyle = "#234";
    ctx.fillText(`Level ${currentLevelIndex + 1} of ${MAX_LEVELS}`, WIDTH - 178, 34);

    // small progress bar
    const pbx = WIDTH - 190;
    const pby = 40;
    const pbw = 160;
    const pbh = 8;
    ctx.fillStyle = "#e6f5f7";
    roundRect(ctx, pbx, pby, pbw, pbh, 4, true, false);
    ctx.fillStyle = "#5bd0cf";
    const progress = (currentLevelIndex + 1) / MAX_LEVELS;
    roundRect(ctx, pbx, pby, pbw * progress, pbh, 4, true, false);
    ctx.restore();
  }

  function drawHint() {
    if (!showHint) return;
    const data = levels[currentLevelIndex];
    const hintText = `Hint: Try using these numbers: ${getHintSubset(data).join(", ")}`;
    ctx.save();
    ctx.font = "14px system-ui, -apple-system, 'Segoe UI', Roboto";
    ctx.fillStyle = "rgba(6,12,18,0.8)";
    roundRect(ctx, 20, HEIGHT - 48, 560, 36, 8, true, false);
    ctx.fillStyle = "#fff";
    ctx.fillText(hintText, 28, HEIGHT - 24);
    ctx.restore();
  }

  // Helper for particle/confetti visuals in success (reused)
  function spawnConfetti(x, y, count) {
    const conf = [];
    for (let i = 0; i < count; i++) {
      conf.push({
        x: x + (Math.random() - 0.5) * 80,
        y: y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 5,
        vy: -Math.random() * 6 - 1,
        color: ["#ff7b7b", "#ffd47b", "#7be28a", "#7bd9ff"][i % 4],
        size: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
      });
    }
    return conf;
  }

  // Compute current sum of selected gears
  function currentSum() {
    return selectedIDs.reduce((s, id) => {
      const g = gears.find((gr) => gr.id === id);
      return s + (g ? g.value : 0);
    }, 0);
  }

  // Get hint subset (unchanged)
  function getHintSubset(levelData) {
    const arr = levelData.gearValues;
    const target = levelData.target;
    const n = arr.length;
    const dp = Array.from({ length: target + 1 }, () => -1);
    dp[0] = -2;
    const parent = Array(target + 1).fill(-1);
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      for (let s = target; s >= v; s--) {
        if (dp[s - v] !== -1 && dp[s] === -1) {
          dp[s] = i;
          parent[s] = s - v;
        }
      }
    }
    if (dp[target] === -1) {
      return [Math.min(...arr)];
    }
    let s = target;
    const chosen = [];
    while (s > 0 && dp[s] !== -1) {
      chosen.push(arr[dp[s]]);
      s = parent[s];
    }
    return chosen;
  }

  // Drawing main frame
  function render() {
    animationTime++;
    clearCanvas();
    drawTitle();
    drawRobotMechanic();
    drawInstructions();
    drawMachineOutline();
    const data = levels[currentLevelIndex];
    drawMachineDisplay(data.target, currentSum(), processing);
    drawGears();
    drawSlotGears();
    drawControls();
    drawLevelIndicator();
    drawHint();

    // small footer tip
    ctx.save();
    ctx.font = "12px system-ui, -apple-system, 'Segoe UI', Roboto";
    ctx.fillStyle = "#234";
    ctx.fillText("Tip: You can remove a gear from the slot by clicking it.", 20, HEIGHT - 8);
    ctx.restore();

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // Interaction handlers (unchanged logic, only audio calls may be different)
  function pickGearById(id) {
    const gear = gears.find((g) => g.id === id);
    if (!gear || gear.taken) return;
    playClick();
    // small melodic pitch based on value
    if (!audioInitError && audioEnabled) {
      const pitch = 420 + gear.value * 40 + Math.random() * 18 - 9;
      playTone(pitch, 0.12, "triangle", 0.06);
    }
    gear.taken = true;
    takenIDs.add(id);
    selectedIDs.push(id);
    updateLiveRegion(`Picked gear ${gear.value} and placed in machine.`);
  }

  function unpickGearById(id) {
    const idx = selectedIDs.indexOf(id);
    if (idx === -1) return;
    const gear = gears.find((g) => g.id === id);
    selectedIDs.splice(idx, 1);
    if (gear) gear.taken = false;
    takenIDs.delete(id);
    playClick();
    updateLiveRegion(`Returned gear ${gear.value} to the conveyor.`);
  }

  // Click position to id mapping (unchanged logic)
  function gearAtPos(px, py) {
    for (let i = gears.length - 1; i >= 0; i--) {
      const g = gears[i];
      if (!g.visible) continue;
      const dx = px - g.x;
      const dy = py - g.y;
      if (dx * dx + dy * dy <= (g.radius + 6) * (g.radius + 6)) return g.id;
    }
    // check slot area for selected gears
    const sx = machineX + 28;
    const sy = machineY + 106;
    const slotW = 124;
    const slotPadding = 12;
    const slotCols = 3;
    for (let i = 0; i < selectedIDs.length; i++) {
      const id = selectedIDs[i];
      const gear = gears.find((g) => g.id === id);
      const col = i % slotCols;
      const row = Math.floor(i / slotCols);
      const gx =
        sx + slotPadding + col * ((slotW - slotPadding * 2) / slotCols) + (slotW - slotPadding * 2) / (slotCols * 2);
      const gy = sy + slotPadding + row * (44 + 6) + 22;
      const dx = px - gx;
      const dy = py - gy;
      if (dx * dx + dy * dy <= 20 * 20) return id;
    }
    // buttons
    const bx = machineX + 36;
    const by = machineY + 284;
    if (px >= bx && px <= bx + 110 && py >= by && py <= by + 28) return "BTN_PROCESS";
    const rx = machineX + 36;
    const ry = machineY + 320;
    if (px >= rx && px <= rx + 110 && py >= ry && py <= ry + 26) return "BTN_RESET";
    const sxIcon = machineX + 36;
    const syIcon = machineY + 354;
    if (px >= sxIcon && px <= sxIcon + 110 && py >= syIcon && py <= syIcon + 26) return "BTN_SOUND";
    return null;
  }

  canvas.addEventListener("mousedown", (ev) => {
    // initialize audio on first user gesture
    if (!audioCtx && audioEnabled) {
      try {
        initAudio(true);
        if (audioCtx && audioCtx.state === "suspended") {
          audioCtx.resume().catch((e) => console.warn("Audio resume failed", e));
        }
      } catch (e) {
        console.warn("Audio init on mousedown failed", e);
      }
    }

    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const hit = gearAtPos(px, py);
    if (!hit) {
      return;
    }
    if (hit === "BTN_PROCESS") {
      processMachine();
      return;
    }
    if (hit === "BTN_RESET") {
      resetLevel();
      return;
    }
    if (hit === "BTN_SOUND") {
      toggleAudio();
      return;
    }
    // If clicked a selected slot gear, return it
    if (selectedIDs.includes(hit)) {
      unpickGearById(hit);
      return;
    }
    // pick gear if on conveyor
    pickGearById(hit);
  });

  // Keyboard controls
  canvas.addEventListener("keydown", (ev) => {
    // initialize audio on first gesture
    if (!audioCtx && audioEnabled) {
      try {
        initAudio(true);
        if (audioCtx && audioCtx.state === "suspended") {
          audioCtx.resume().catch((e) => console.warn("Audio resume failed", e));
        }
      } catch (e) {
        console.warn("Audio init on keydown failed", e);
      }
    }

    const code = ev.key;
    if (code === "ArrowRight") {
      let i = focusIndex;
      for (let c = 0; c < gears.length; c++) {
        i = (i + 1) % gears.length;
        if (!gears[i].taken) {
          focusIndex = i;
          break;
        }
      }
      ev.preventDefault();
      playTone(660, 0.05, "sine", 0.04);
    } else if (code === "ArrowLeft") {
      let i = focusIndex;
      for (let c = 0; c < gears.length; c++) {
        i = (i - 1 + gears.length) % gears.length;
        if (!gears[i].taken) {
          focusIndex = i;
          break;
        }
      }
      ev.preventDefault();
      playTone(550, 0.05, "sine", 0.04);
    } else if (code === " " || code === "Enter") {
      const g = gears[focusIndex];
      if (g) {
        if (selectedIDs.includes(g.id)) {
          unpickGearById(g.id);
        } else {
          pickGearById(g.id);
        }
      }
      ev.preventDefault();
    } else if (code.toLowerCase() === "p") {
      processMachine();
      ev.preventDefault();
    } else if (code.toLowerCase() === "r") {
      resetLevel();
      ev.preventDefault();
    } else if (code.toLowerCase() === "s") {
      toggleAudio();
      ev.preventDefault();
    } else if (code.toLowerCase() === "h") {
      showHint = !showHint;
      updateLiveRegion(showHint ? "Hint shown." : "Hint hidden.");
      ev.preventDefault();
    }
  });

  function processMachine() {
    if (processing) return;
    attempts++;
    const sum = currentSum();
    const target = levels[currentLevelIndex].target;
    processing = true;
    playTone(420, 0.06, "sine", 0.06);
    updateLiveRegion(`Processing... Current sum is ${sum}.`);
    setTimeout(() => {
      if (sum === target) {
        playPositive();
        processing = false;
        // success animation: confetti and gear sparkle
        const conf = spawnConfetti(machineX + 80, machineY + 120, 32);
        animateSuccess(conf, () => {
          currentLevelIndex++;
          if (currentLevelIndex >= MAX_LEVELS) {
            announceVictory();
          } else {
            setupLevel(currentLevelIndex);
            playTone(720, 0.12, "sine", 0.08);
          }
        });
      } else if (sum > target) {
        playNegative();
        processing = false;
        updateLiveRegion("Sum is over the target. Try removing a gear.");
      } else {
        playTone(520, 0.08, "triangle", 0.06);
        processing = false;
        updateLiveRegion("Not enough yet. Pick more gears.");
      }
    }, 700);
  }

  // Enhanced success animation drawing confetti and clearing selected gears
  function animateSuccess(confetti, callback) {
    let t = 0;
    const steps = 70;
    const anim = () => {
      t++;
      // overlay a soft light
      ctx.save();
      ctx.globalAlpha = 0.06 + 0.2 * Math.sin(t / 8);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();

      // draw confetti
      ctx.save();
      confetti.forEach((c) => {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.16;
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.rect(c.x, c.y, c.size, c.size);
        ctx.fill();
      });
      ctx.restore();

      if (t < steps) {
        requestAnimationFrame(anim);
      } else {
        // clear selection and hide chosen gears
        selectedIDs.forEach((id) => {
          const gear = gears.find((g) => g.id === id);
          if (gear) gear.visible = false;
        });
        selectedIDs = [];
        updateLiveRegion("Great job! Moving to the next level.");
        callback();
      }
    };
    anim();
  }

  function resetLevel() {
    selectedIDs.forEach((id) => {
      const g = gears.find((gg) => gg.id === id);
      if (g) g.taken = false;
      takenIDs.delete(id);
    });
    selectedIDs = [];
    attempts = 0;
    playClick();
    updateLiveRegion("Level has been reset.");
  }

  function announceVictory() {
    updateLiveRegion("Congratulations! You completed all levels. You win!");
    playPositive();
    // big celebration confetti
    const confetti = spawnConfetti(WIDTH / 2, HEIGHT / 2 - 40, 120);
    let t = 0;
    const anim = () => {
      t++;
      clearCanvas();
      drawTitle();
      ctx.save();
      ctx.font = "28px system-ui, -apple-system, 'Segoe UI', Roboto";
      ctx.fillStyle = "#163";
      ctx.fillText("You Fixed the Machine! You Win!", 100, 220);
      ctx.restore();
      confetti.forEach((c) => {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.06;
        ctx.save();
        ctx.fillStyle = c.color;
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
        ctx.restore();
      });
      if (t < 160) {
        requestAnimationFrame(anim);
      } else {
        updateLiveRegion("Game complete. Press R to play again.");
      }
    };
    anim();
  }

  // Update live region for screen readers
  let lastLive = "";
  function updateLiveRegion(msg) {
    lastLive = msg;
    liveRegion.textContent = msg;
  }

  // Provide error handling for audio creation on user gesture
  document.addEventListener("click", function onFirstClick() {
    if (!audioCtx && audioEnabled) {
      try {
        initAudio(true);
        if (audioCtx && audioCtx.state === "suspended") {
          audioCtx.resume().catch((e) => console.warn("Audio resume failed", e));
        }
      } catch (e) {
        console.warn("Error initializing audio on click:", e);
      }
    }
    document.removeEventListener("click", onFirstClick);
  });

  // Key restart handling (unchanged logic)
  document.addEventListener("keydown", (ev) => {
    if (ev.key.toLowerCase() === "r") {
      if (currentLevelIndex >= MAX_LEVELS - 1) {
        levels = generateLevels(MAX_LEVELS);
        currentLevelIndex = 0;
        setupLevel(currentLevelIndex);
        updateLiveRegion("Game restarted. New levels are ready.");
      }
    }
  });

  // Utility: in case of audio resume errors
  function safeResumeAudio() {
    if (audioCtx) {
      audioCtx.resume().catch((e) => {
        console.warn("Audio resume failed:", e);
      });
    }
  }

  // On first focus by keyboard, announce
  canvas.addEventListener("focus", () => {
    updateLiveRegion("Game focused. Use the keyboard or click to interact.");
  });

  // Expose a minimal console command safe for debugging (unchanged)
  window._machineMath = {
    reset: () => {
      currentLevelIndex = 0;
      levels = generateLevels(MAX_LEVELS);
      setupLevel(0);
    },
  };
})();