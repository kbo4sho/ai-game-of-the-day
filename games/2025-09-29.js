(function () {
  // Machine Math Game for ages 7-9
  // Renders inside element with ID "game-of-the-day-stage"
  // Canvas-based graphics and Web Audio API sounds (no external resources)
  "use strict";

  // --- Configuration ---
  const WIDTH = 720;
  const HEIGHT = 480;
  const STAGE_ID = "game-of-the-day-stage";
  const MAX_LEVELS = 5;

  // Levels: each has number of dials and target sum (constructed to be solvable)
  const LEVELS = [
    { dials: 2, target: 7 }, // e.g., 2 dials, sum 7
    { dials: 2, target: 11 },
    { dials: 3, target: 12 },
    { dials: 3, target: 18 },
    { dials: 4, target: 20 }
  ].slice(0, MAX_LEVELS);

  // --- DOM Setup ---
  const root = document.getElementById(STAGE_ID);
  if (!root) {
    console.error(`Element with ID "${STAGE_ID}" not found.`);
    return;
  }
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Machine Math Game canvas");
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.tabIndex = 0;
  root.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false });

  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  liveRegion.style.width = "1px";
  liveRegion.style.height = "1px";
  liveRegion.style.overflow = "hidden";
  root.appendChild(liveRegion);

  const controls = document.createElement("div");
  controls.style.position = "relative";
  controls.style.width = WIDTH + "px";
  controls.style.marginTop = "6px";
  controls.style.fontFamily = "sans-serif";
  controls.style.fontSize = "14px";

  const startButton = document.createElement("button");
  startButton.textContent = "Start Game";
  startButton.style.marginRight = "8px";
  startButton.setAttribute("aria-label", "Start the game");
  controls.appendChild(startButton);

  const audioButton = document.createElement("button");
  audioButton.textContent = "Audio: On";
  audioButton.setAttribute("aria-pressed", "true");
  audioButton.style.marginRight = "8px";
  audioButton.setAttribute("aria-label", "Toggle audio on or off");
  controls.appendChild(audioButton);

  const hintButton = document.createElement("button");
  hintButton.textContent = "Hint";
  hintButton.setAttribute("aria-label", "Show a hint");
  controls.appendChild(hintButton);

  root.appendChild(controls);

  const instructions = document.createElement("div");
  instructions.style.width = WIDTH + "px";
  instructions.style.marginTop = "8px";
  instructions.style.fontFamily = "sans-serif";
  instructions.style.fontSize = "13px";
  instructions.innerHTML =
    "Use mouse or keyboard. Left/Right to pick a dial, Up/Down to change values. Enter to submit. Space toggles audio. H shows a hint.";
  root.appendChild(instructions);

  // --- Audio Setup ---
  let audioAllowed = true;
  let audioCtx = null;
  let masterGain = null;
  let bgGain = null;
  let bgNodes = { oscA: null, oscB: null, filter: null, lfo: null, lfoGain: null };
  let audioError = false;

  function initAudio() {
    if (!audioAllowed) return;
    if (audioCtx) return;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio API not supported");

      audioCtx = new AC();

      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.7; // overall knob (kept modest)
      masterGain.connect(audioCtx.destination);

      // Background pad: two detuned oscillators through a gentle lowpass filter
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.035; // calm underlying pad volume
      bgGain.connect(masterGain);

      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.7;
      filter.connect(bgGain);

      const oscA = audioCtx.createOscillator();
      oscA.type = "sine";
      oscA.frequency.value = 110;
      const oscAGain = audioCtx.createGain();
      oscAGain.gain.value = 0.6;
      oscA.connect(oscAGain);
      oscAGain.connect(filter);

      const oscB = audioCtx.createOscillator();
      oscB.type = "sine";
      oscB.frequency.value = 138; // detuned interval
      const oscBGain = audioCtx.createGain();
      oscBGain.gain.value = 0.45;
      oscB.connect(oscBGain);
      oscBGain.connect(filter);

      // Slow LFO to modulate filter cutoff for a breathing effect
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.12;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 120; // modulation depth
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // gentle stereo-like effect using slight detune
      oscB.detune.value = -8;

      oscA.start();
      oscB.start();
      lfo.start();

      bgNodes = {
        oscA,
        oscB,
        filter,
        lfo,
        lfoGain
      };

      // warm tiny click on init
      playTone({ freq: 880, type: "triangle", duration: 0.05, vol: 0.04 });
    } catch (err) {
      console.warn("Audio initialization failed:", err);
      audioError = true;
      audioAllowed = false;
      audioCtx = null;
      masterGain = null;
      bgGain = null;
      bgNodes = { oscA: null, oscB: null, filter: null, lfo: null, lfoGain: null };
      liveRegion.textContent = "Audio is not available on this device.";
    }
  }

  function safeCreateAudioContextOnGesture() {
    try {
      if (!audioCtx && audioAllowed) {
        initAudio();
      } else if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch((err) => {
          console.warn("Audio resume failed:", err);
        });
      }
    } catch (err) {
      console.warn("Audio gesture handling error:", err);
    }
  }

  // Play a short tone using oscillator with optional filter envelope
  function playTone({ freq = 440, type = "sine", duration = 0.18, vol = 0.08, release = 0.04, filterFreq = 12000 } = {}) {
    if (!audioAllowed || !audioCtx || audioError) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      o.type = type;
      o.frequency.value = freq;
      f.type = "lowpass";
      f.frequency.value = filterFreq;
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);

      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol, now + 0.008);
      g.gain.linearRampToValueAtTime(0.0001, now + duration + release);
      o.start(now);
      o.stop(now + duration + release + 0.02);
    } catch (err) {
      console.warn("playTone error:", err);
    }
  }

  // Success chime: gentle harmonic cluster with descending sparkle
  function playSuccess() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [660, 880, 990].map((f) => f * (Math.random() > 0.5 ? 1 : 0.997)); // slight humanization
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const filt = audioCtx.createBiquadFilter();
        o.type = i === 1 ? "sine" : "triangle";
        o.frequency.value = f;
        filt.type = "lowpass";
        filt.frequency.value = 2000 - i * 400;
        o.connect(filt);
        filt.connect(g);
        g.connect(masterGain);
        const t = now + i * 0.08;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.14 - i * 0.03, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42 + i * 0.08);
        o.start(t);
        o.stop(t + 0.5 + i * 0.08);
      });

      // small bright sprinkle
      setTimeout(() => {
        playTone({ freq: 1320, type: "sine", duration: 0.08, vol: 0.045, filterFreq: 5000 });
      }, 260);
    } catch (err) {
      console.warn("playSuccess error:", err);
    }
  }

  // Error tone: soft negative wobble (less harsh)
  function playError() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      o.type = "sawtooth";
      o.frequency.value = 160;
      f.type = "bandpass";
      f.frequency.value = 180;
      f.Q.value = 6;
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);

      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.006);
      g.gain.linearRampToValueAtTime(0.0001, now + 0.36);
      o.start(now);
      o.stop(now + 0.38);

      // light click after
      setTimeout(() => {
        playTone({ freq: 880, type: "square", duration: 0.045, vol: 0.03 });
      }, 260);
    } catch (err) {
      console.warn("playError error:", err);
    }
  }

  // Click / UI sound: soft muted click
  function playClick() {
    playTone({ freq: 1000 + Math.random() * 120, type: "square", duration: 0.04, vol: 0.04, filterFreq: 4000 });
  }

  // --- Game State ---
  let state = {
    running: false,
    levelIndex: 0,
    dials: [],
    selectedDial: 0,
    attempts: 0,
    solvedLevels: 0,
    showHint: false,
    animT: 0,
    shakeAmount: 0,
    particles: [] // visual particles for small feedback/confetti
  };

  function startLevel(index) {
    state.levelIndex = index;
    const level = LEVELS[index];
    state.dials = new Array(level.dials).fill(0).map(() => Math.floor(Math.random() * 10));
    if (level.target > level.dials * 9 || level.target < 0) {
      level.target = Math.min(level.dials * 9, Math.max(1, Math.floor((level.dials * 9) / 2)));
    }
    state.selectedDial = 0;
    state.attempts = 0;
    state.showHint = false;
    state.animT = 0;
    state.shakeAmount = 0;
    state.particles.length = 0;
    liveRegion.textContent = `Level ${index + 1}. Set the dials to add up to ${level.target}.`;
  }

  function startGame() {
    state.running = true;
    state.levelIndex = 0;
    state.solvedLevels = 0;
    startLevel(0);
    safeCreateAudioContextOnGesture();
  }

  function nextLevel() {
    state.solvedLevels++;
    if (state.levelIndex + 1 < LEVELS.length) {
      startLevel(state.levelIndex + 1);
    } else {
      state.running = false;
      liveRegion.textContent = "All machines fixed! Great job!";
    }
  }

  function getHint() {
    const level = LEVELS[state.levelIndex];
    const curSum = state.dials.reduce((a, b) => a + b, 0);
    const remaining = level.target - curSum;
    if (Math.abs(remaining) <= 9) {
      const needed = state.dials[state.selectedDial] + remaining;
      if (needed >= 0 && needed <= 9) {
        return `Try setting dial ${state.selectedDial + 1} to ${needed}`;
      }
    }
    return `Try changing a dial by ${remaining > 0 ? "+" : ""}${remaining}`;
  }

  // spawn small particles for visual feedback
  function spawnParticles(x, y, colorish = "#FFD27F", count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * (i / count) + (Math.random() - 0.5) * 0.6;
      const speed = 60 + Math.random() * 80;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0.9 + Math.random() * 0.8,
        maxLife: 0.9 + Math.random() * 0.8,
        color: i % 3 === 0 ? "#FFB37A" : i % 3 === 1 ? "#FFD27F" : "#FFF2B2",
        size: 3 + Math.random() * 4
      });
    }
  }

  function spawnConfetti(centerX, centerY) {
    // more colorful but gentle confetti
    const colors = ["#FFB47A", "#88D2E6", "#FFD27F", "#BCE3C8", "#F6D0FF"];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI - Math.PI / 2;
      const speed = 70 + Math.random() * 220;
      state.particles.push({
        x: centerX + (Math.random() - 0.5) * 60,
        y: centerY + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 1.0 + Math.random() * 0.6,
        maxLife: 1.0 + Math.random() * 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
        shape: Math.random() > 0.5 ? "rect" : "circle",
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 5
      });
    }
  }

  function submitAttempt() {
    const level = LEVELS[state.levelIndex];
    const sum = state.dials.reduce((a, b) => a + b, 0);
    state.attempts++;
    if (sum === level.target) {
      playSuccess();
      state.shakeAmount = 12;
      setTimeout(() => {
        state.shakeAmount = 0;
      }, 320);
      liveRegion.textContent = `Correct! You fixed machine ${state.levelIndex + 1}.`;
      // spawn confetti near the machine center
      spawnConfetti(WIDTH / 2, HEIGHT / 2 - 10);
      setTimeout(nextLevel, 800);
    } else {
      playError();
      state.shakeAmount = 8;
      setTimeout(() => {
        state.shakeAmount = 0;
      }, 420);
      // little particle puff near selected dial to show feedback
      const drect = computeDialCenter(state.selectedDial);
      spawnParticles(drect.x, drect.y, "#E7F7FF", 8);
      liveRegion.textContent = `Not yet. The sum is ${sum}. Try again.`;
    }
  }

  // --- Input Handling ---
  function computeDialCenter(i) {
    const level = LEVELS[state.levelIndex];
    const count = level.dials;
    const dialSize = 64;
    const spacing = 18;
    const totalW = count * dialSize + (count - 1) * spacing;
    const startX = WIDTH / 2 - totalW / 2;
    const yTop = HEIGHT / 2 - 24;
    const dx = startX + i * (dialSize + spacing);
    const dy = yTop;
    return { x: dx + dialSize / 2, y: dy + dialSize / 2 };
  }

  function getDialHit(x, y) {
    const level = LEVELS[state.levelIndex];
    if (!level) return -1;
    const count = level.dials;
    const dialSize = 64;
    const spacing = 18;
    const totalW = count * dialSize + (count - 1) * spacing;
    const startX = WIDTH / 2 - totalW / 2;
    const yTop = HEIGHT / 2 - 24;
    for (let i = 0; i < count; i++) {
      const dx = startX + i * (dialSize + spacing);
      const dy = yTop;
      if (x >= dx && x <= dx + dialSize && y >= dy && y <= dy + dialSize) return i;
    }
    return -1;
  }

  canvas.addEventListener("mousedown", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (!state.running) {
      safeCreateAudioContextOnGesture();
    }
    const dialIdx = getDialHit(x, y);
    if (dialIdx >= 0) {
      state.selectedDial = dialIdx;
      if (ev.button === 0) {
        state.dials[dialIdx] = (state.dials[dialIdx] + 1) % 10;
        const center = computeDialCenter(dialIdx);
        spawnParticles(center.x, center.y, "#DFF7FF", 6);
      } else if (ev.button === 2) {
        state.dials[dialIdx] = (state.dials[dialIdx] + 9) % 10;
        const center = computeDialCenter(dialIdx);
        spawnParticles(center.x, center.y, "#FFE8C7", 6);
      }
      playClick();
    } else {
      const submitRect = getSubmitRect();
      if (
        x >= submitRect.x &&
        x <= submitRect.x + submitRect.w &&
        y >= submitRect.y &&
        y <= submitRect.y + submitRect.h
      ) {
        submitAttempt();
      }
    }
  });

  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
  });

  canvas.addEventListener("keydown", (ev) => {
    if (!state.running && ev.key === "Enter") {
      startButton.focus();
      startButton.click();
      return;
    }
    if (!state.running) {
      return;
    }
    const level = LEVELS[state.levelIndex];
    if (!level) return;
    if (ev.key === "ArrowLeft") {
      state.selectedDial = (state.selectedDial - 1 + level.dials) % level.dials;
      playClick();
      ev.preventDefault();
    } else if (ev.key === "ArrowRight") {
      state.selectedDial = (state.selectedDial + 1) % level.dials;
      playClick();
      ev.preventDefault();
    } else if (ev.key === "ArrowUp") {
      state.dials[state.selectedDial] = (state.dials[state.selectedDial] + 1) % 10;
      const center = computeDialCenter(state.selectedDial);
      spawnParticles(center.x, center.y, "#DFF7FF", 6);
      playClick();
      ev.preventDefault();
    } else if (ev.key === "ArrowDown") {
      state.dials[state.selectedDial] = (state.dials[state.selectedDial] + 9) % 10;
      const center = computeDialCenter(state.selectedDial);
      spawnParticles(center.x, center.y, "#FFE8C7", 6);
      playClick();
      ev.preventDefault();
    } else if (ev.key === "Enter") {
      submitAttempt();
      ev.preventDefault();
    } else if (ev.key === " " || ev.key === "Spacebar") {
      toggleAudio();
      ev.preventDefault();
    } else if (ev.key === "h" || ev.key === "H") {
      state.showHint = !state.showHint;
      liveRegion.textContent = state.showHint ? getHint() : "Hint hidden";
      playClick();
      ev.preventDefault();
    } else if (/^[0-9]$/.test(ev.key)) {
      const v = parseInt(ev.key, 10);
      state.dials[state.selectedDial] = v;
      const center = computeDialCenter(state.selectedDial);
      spawnParticles(center.x, center.y, "#E7F7FF", 6);
      playClick();
      ev.preventDefault();
    }
  });

  startButton.addEventListener("click", () => {
    safeCreateAudioContextOnGesture();
    if (!state.running) {
      startGame();
      startButton.textContent = "Restart";
      startButton.setAttribute("aria-label", "Restart the game");
      canvas.focus();
    } else {
      startGame();
      canvas.focus();
    }
    playClick();
  });

  audioButton.addEventListener("click", () => {
    toggleAudio();
  });

  hintButton.addEventListener("click", () => {
    if (!state.running) return;
    state.showHint = !state.showHint;
    liveRegion.textContent = state.showHint ? getHint() : "Hint hidden";
    playClick();
  });

  function toggleAudio() {
    audioAllowed = !audioAllowed;
    if (audioAllowed) {
      audioButton.textContent = "Audio: On";
      audioButton.setAttribute("aria-pressed", "true");
      safeCreateAudioContextOnGesture();
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
    } else {
      audioButton.textContent = "Audio: Off";
      audioButton.setAttribute("aria-pressed", "false");
      if (audioCtx) {
        try {
          audioCtx.suspend();
        } catch (err) {
          console.warn("Error suspending audio context:", err);
        }
      }
    }
  }

  // --- Drawing Utilities ---
  function clear() {
    // Soft multi-stop background
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#F6FBFD");
    g.addColorStop(0.6, "#EEF8FB");
    g.addColorStop(1, "#F6FCFE");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawBackgroundDecor(t) {
    ctx.save();
    // gentle curved panels
    ctx.globalAlpha = 1;
    // subtle grid / circuitry lines
    ctx.strokeStyle = "rgba(80,150,170,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const y = 40 + i * 72 + Math.sin(t * 0.001 + i) * 6;
      ctx.moveTo(20, y);
      ctx.quadraticCurveTo(WIDTH / 2, y + Math.sin(t * 0.0006 + i) * 10, WIDTH - 20, y);
      ctx.stroke();
    }

    // soft floating panels / rounded shapes
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#AEE6F4";
    drawBlob(90, 120, 110, t * 0.0007);
    ctx.fillStyle = "#DDEFFC";
    drawBlob(610, 100, 80, -t * 0.0009);
    ctx.fillStyle = "#FCE5D8";
    drawBlob(520, 360, 120, t * 0.0005);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawBlob(cx, cy, r, phase) {
    ctx.beginPath();
    const points = 12;
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const rr = r * (0.85 + 0.12 * Math.sin(a * 3 + phase));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawGears(x, y, radius, teeth, rotation, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = color || "#C8E7F2";
    ctx.strokeStyle = "rgba(36,90,105,0.55)";
    ctx.lineWidth = 1.5;
    // toothed rim
    const innerR = radius * 0.78;
    const outerR = radius * 1.06;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
      ctx.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
      ctx.lineTo(
        Math.cos((i + 1) / teeth * Math.PI * 2) * innerR,
        Math.sin((i + 1) / teeth * Math.PI * 2) * innerR
      );
      ctx.fill();
    }
    // center plate
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-radius * 0.2, -radius * 0.2, radius * 0.08, 0, 0, radius * 0.9);
    grad.addColorStop(0, "#FFFFFF");
    grad.addColorStop(1, color || "#C8E7F2");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.arc(0, 0, Math.max(6, radius * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDials(t) {
    const level = LEVELS[state.levelIndex];
    if (!level) return;
    const count = level.dials;
    const dialSize = 64;
    const spacing = 18;
    const totalW = count * dialSize + (count - 1) * spacing;
    const startX = WIDTH / 2 - totalW / 2;
    const yTop = HEIGHT / 2 - 24;

    ctx.save();
    if (state.shakeAmount) {
      const s = state.shakeAmount;
      const dx = (Math.random() - 0.5) * s;
      const dy = (Math.random() - 0.5) * s;
      ctx.translate(dx, dy);
    }

    // machine panel with soft shadow and inner glow
    const panelX = startX - 36;
    const panelY = yTop - 48;
    const panelW = totalW + 72;
    const panelH = 200;
    // subtle shadow
    ctx.fillStyle = "rgba(20, 60, 70, 0.03)";
    roundRect(ctx, panelX + 4, panelY + 8, panelW, panelH, 20);
    ctx.fill();
    // panel
    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panelGrad.addColorStop(0, "#FFFFFF");
    panelGrad.addColorStop(1, "#E9F9FF");
    ctx.fillStyle = panelGrad;
    roundRect(ctx, panelX, panelY, panelW, panelH, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,90,110,0.08)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // dials
    for (let i = 0; i < count; i++) {
      const dx = startX + i * (dialSize + spacing);
      const dy = yTop;
      // base plate
      ctx.save();
      // slight 3D drop
      const shadowGrad = ctx.createLinearGradient(dx, dy, dx, dy + dialSize);
      shadowGrad.addColorStop(0, "rgba(10,50,60,0.03)");
      shadowGrad.addColorStop(1, "rgba(10,50,60,0.0)");
      ctx.fillStyle = shadowGrad;
      roundRect(ctx, dx + 2, dy + 3, dialSize, dialSize, 12);
      ctx.fill();

      // glass knob
      const knobGrad = ctx.createLinearGradient(dx, dy, dx + dialSize, dy + dialSize);
      knobGrad.addColorStop(0, "#FFFFFF");
      knobGrad.addColorStop(0.5, "#F7FEFF");
      knobGrad.addColorStop(1, "#E6F7FA");
      ctx.fillStyle = knobGrad;
      roundRect(ctx, dx, dy, dialSize, dialSize, 12);
      ctx.fill();

      // inset border
      ctx.strokeStyle = i === state.selectedDial ? "#FFB347" : "rgba(20,90,110,0.12)";
      ctx.lineWidth = i === state.selectedDial ? 3 : 1.5;
      ctx.stroke();

      // rotating tiny gear icon
      drawGears(dx + dialSize - 22, dy + 22, 12, 8, (t * 0.002 + i * 0.4) % (Math.PI * 2), "#DFF7FF");

      // numeric display with subtle shadow
      ctx.fillStyle = "#0E3B45";
      ctx.font = "bolder 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(8,25,30,0.12)";
      ctx.shadowBlur = 6;
      ctx.fillText(state.dials[i].toString(), dx + dialSize / 2, dy + dialSize / 2 - 6);
      ctx.shadowBlur = 0;

      // up/down hints (soft)
      ctx.fillStyle = "rgba(28,120,140,0.08)";
      ctx.beginPath();
      ctx.moveTo(dx + dialSize / 2, dy - 4);
      ctx.lineTo(dx + dialSize / 2 - 8, dy + 8);
      ctx.lineTo(dx + dialSize / 2 + 8, dy + 8);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(dx + dialSize / 2, dy + dialSize + 4);
      ctx.lineTo(dx + dialSize / 2 - 8, dy + dialSize - 8);
      ctx.lineTo(dx + dialSize / 2 + 8, dy + dialSize - 8);
      ctx.closePath();
      ctx.fill();

      if (i === state.selectedDial) {
        // highlight halo
        ctx.strokeStyle = "rgba(255,179,71,0.18)";
        ctx.lineWidth = 6;
        ctx.strokeRect(dx - 6, dy - 6, dialSize + 12, dialSize + 12);
      }

      ctx.restore();
    }

    // submit button area (big friendly)
    const submitRect = getSubmitRect();
    ctx.save();
    // base
    const sGrad = ctx.createLinearGradient(submitRect.x, submitRect.y, submitRect.x, submitRect.y + submitRect.h);
    sGrad.addColorStop(0, "#FFF7F0");
    sGrad.addColorStop(1, "#FFE6C9");
    ctx.fillStyle = sGrad;
    roundRect(ctx, submitRect.x - 12, submitRect.y - 6, submitRect.w + 24, submitRect.h + 12, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,140,100,0.15)";
    ctx.stroke();

    // knob
    ctx.fillStyle = "#FFB37A";
    ctx.beginPath();
    ctx.ellipse(
      submitRect.x + submitRect.w / 2,
      submitRect.y + submitRect.h / 2,
      submitRect.w / 2 - 8,
      submitRect.h / 2 - 8,
      Math.sin(t * 0.006) * 0.03,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.strokeStyle = "rgba(220,130,60,0.45)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "#2B4B57";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Submit", submitRect.x + submitRect.w / 2, submitRect.y + submitRect.h / 2);
    ctx.restore();

    ctx.restore();
  }

  function getSubmitRect() {
    const level = LEVELS[state.levelIndex];
    const count = level ? level.dials : 2;
    const dialSize = 64;
    const spacing = 18;
    const totalW = count * dialSize + (count - 1) * spacing;
    const x = WIDTH / 2 - 64;
    const y = HEIGHT / 2 + 72;
    return { x: x, y: y, w: 128, h: 36 };
  }

  function drawTarget(t) {
    const level = LEVELS[state.levelIndex];
    if (!level) {
      ctx.fillStyle = "#333";
      ctx.font = "20px sans-serif";
      ctx.fillText("Press Start to play", WIDTH / 2 - 80, HEIGHT / 2);
      return;
    }
    ctx.save();
    const tx = WIDTH / 2;
    const ty = HEIGHT / 2 - 120;

    // screen panel
    ctx.fillStyle = "#022D35";
    roundRect(ctx, tx - 168, ty - 34, 336, 60, 14);
    ctx.fill();

    // soft neon glow
    ctx.shadowBlur = 14;
    ctx.shadowColor = "rgba(3,150,170,0.12)";
    ctx.fillStyle = "#07B0C6";
    ctx.font = "700 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`GOAL: ${level.target}`, tx, ty - 6);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#BCEFF6";
    ctx.font = "12px sans-serif";
    ctx.fillText("Make the dials add up to the Goal", tx, ty + 18);
    ctx.restore();
  }

  function drawMeter() {
    ctx.save();
    ctx.fillStyle = "#07414B";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const level = LEVELS[state.levelIndex];
    if (state.running && level) {
      ctx.fillText(`Level ${state.levelIndex + 1} of ${LEVELS.length}`, 12, 8);
      ctx.fillText(`Attempts: ${state.attempts}`, 12, 28);
    } else {
      ctx.fillText(`Machine Workshop`, 12, 8);
      ctx.fillText(`Click Start to begin`, 12, 28);
    }
    ctx.restore();
  }

  function drawAudioIndicator() {
    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#07414B";
    ctx.font = "13px sans-serif";
    ctx.fillText(`Audio: ${audioAllowed && !audioError ? "On" : "Off"}`, WIDTH - 12, 8);
    const x = WIDTH - 82;
    const y = 10;
    ctx.strokeStyle = "#07414B";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 8);
    ctx.lineTo(x + 8, y + 8);
    ctx.lineTo(x + 12, y + 4);
    ctx.lineTo(x + 12, y + 12);
    ctx.closePath();
    ctx.stroke();
    if (audioAllowed && !audioError) {
      ctx.beginPath();
      ctx.arc(x + 16, y + 8, 6, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHintBox() {
    if (!state.showHint || !state.running) return;
    ctx.save();
    const w = 380;
    const h = 60;
    const x = WIDTH - w - 16;
    const y = HEIGHT - h - 16;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(12,80,95,0.06)";
    ctx.stroke();
    ctx.fillStyle = "#094B54";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Hint: " + getHint(), x + 16, y + h / 2);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // --- Particles update/draw ---
  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      const gravity = 140;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) {
        p.rot += p.rotSpeed * dt;
      }
    }
  }

  function drawParticles() {
    ctx.save();
    for (const p of state.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * Math.max(0.6, alpha), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // --- Game Loop ---
  let lastTime = performance.now();

  function updateAndDraw(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp for stability
    lastTime = now;
    clear();
    state.animT += dt * 1000;

    drawBackgroundDecor(state.animT);

    if (!state.running) {
      drawIdleScene(state.animT);
    } else {
      drawTarget(state.animT);
      drawDials(state.animT);
      drawHintBox();
    }

    // update and draw particles
    updateParticles(dt);
    drawParticles();

    drawMeter();
    drawAudioIndicator();
    drawBolts(state.animT);

    requestAnimationFrame(updateAndDraw);
  }

  function drawIdleScene(t) {
    ctx.save();
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;

    // large soft machine body
    ctx.fillStyle = "#EAF9FB";
    roundRect(ctx, cx - 210, cy - 100, 420, 200, 24);
    ctx.fill();
    ctx.strokeStyle = "#C7F0F7";
    ctx.stroke();

    // central animated gear
    drawGears(cx, cy - 10, 72, 12, (t * 0.0008) % (Math.PI * 2), "#D9F3F8");

    ctx.fillStyle = "#063D45";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Machine Math", cx, cy + 110);
    ctx.fillStyle = "#075B6E";
    ctx.font = "14px sans-serif";
    ctx.fillText("Fix machines by setting dials to match the goal.", cx, cy + 136);
    ctx.restore();
  }

  function drawBolts(t) {
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const x = 24 + ((i * 97) % 440);
      const y = ((t * 0.02 + i * 73) % (HEIGHT + 120)) - 120;
      ctx.fillStyle = i % 2 === 0 ? "#FFD27F" : "#FAF2D2";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8, y + 18);
      ctx.lineTo(x + 2, y + 18);
      ctx.lineTo(x + 12, y + 36);
      ctx.lineTo(x - 4, y + 24);
      ctx.lineTo(x + 4, y + 24);
      ctx.closePath();
      ctx.globalAlpha = 0.95 - i * 0.08;
      ctx.fill();
    }
    ctx.restore();
  }

  // Start animation loop
  requestAnimationFrame(updateAndDraw);

  canvas.addEventListener("focus", () => {
    if (!state.running) {
      liveRegion.textContent = "Press Start to begin the Machine Math game.";
    } else {
      liveRegion.textContent = `Level ${state.levelIndex + 1}. Goal ${LEVELS[state.levelIndex].target}. Use arrow keys to change dials.`;
    }
  });

  startButton.addEventListener("keyup", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      canvas.focus();
    }
  });

  liveRegion.textContent = "Welcome to Machine Math. Click Start to begin. Use keyboard or mouse.";

  window.addEventListener("unhandledrejection", (e) => {
    console.warn("Unhandled promise rejection:", e.reason);
  });

  function attachOneTimeAudioInit() {
    const handler = () => {
      safeCreateAudioContextOnGesture();
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", handler);
    };
    document.addEventListener("pointerdown", handler, { passive: true });
    document.addEventListener("keydown", handler, { passive: true });
  }
  attachOneTimeAudioInit();

  window.addEventListener("blur", () => {
    if (audioCtx && audioCtx.state === "running") {
      try {
        audioCtx.suspend();
      } catch (err) {}
    }
  });
  window.addEventListener("focus", () => {
    if (audioAllowed && audioCtx && audioCtx.state === "suspended") {
      try {
        audioCtx.resume();
      } catch (err) {}
    }
  });

  // Public API for testing / accessibility
  canvas.gameAPI = {
    startGame,
    toggleAudio,
    submitAttempt,
    getState: () => JSON.parse(JSON.stringify(state)),
    levels: LEVELS
  };

  console.log("Machine Math Game initialized inside #" + STAGE_ID);
})();