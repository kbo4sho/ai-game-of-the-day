(function () {
  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const MAX_LEVELS = 8; // beatable
  const STAGE_ID = "game-of-the-day-stage";

  // Utility helpers
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      console.warn("Safe wrapper caught:", e);
      return null;
    }
  }

  // Find container
  const container = document.getElementById(STAGE_ID);
  if (!container) {
    console.error("Game container not found: #" + STAGE_ID);
    return;
  }
  container.innerHTML = ""; // clear
  container.style.position = "relative";
  container.setAttribute("role", "application");
  container.setAttribute("aria-label", "Wacky Machine Math Game");

  // Create offscreen live region for accessibility messages
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  liveRegion.style.width = "1px";
  liveRegion.style.height = "1px";
  container.appendChild(liveRegion);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("tabindex", "0"); // to capture keyboard
  canvas.style.outline = "none";
  canvas.style.display = "block";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Canvas 2D not supported.");
    liveRegion.textContent = "Your browser does not support the game canvas.";
    return;
  }

  // Audio setup with improved layered pad and error handling
  let audioAvailable = true;
  let audioCtx = null;
  let masterGain = null;
  let bgGain = null;
  let bgOsc1 = null;
  let bgOsc2 = null;
  let bgFilter = null;
  let bgLFO = null;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioCtx.destination);

    // Background layered pad with gentle movement
    bgGain = audioCtx.createGain();
    bgGain.gain.value = 0.015; // very gentle
    bgGain.connect(masterGain);

    // Two detuned oscillators for warmth
    bgOsc1 = audioCtx.createOscillator();
    bgOsc2 = audioCtx.createOscillator();
    bgOsc1.type = "sine";
    bgOsc2.type = "sine";
    bgOsc1.frequency.value = 110; // A2-ish
    bgOsc2.frequency.value = 112; // slight detune
    // shared filter to make pad soft
    bgFilter = audioCtx.createBiquadFilter();
    bgFilter.type = "lowpass";
    bgFilter.frequency.value = 380;
    bgFilter.Q.value = 0.7;

    // LFO modulating filter cutoff for movement
    bgLFO = audioCtx.createOscillator();
    bgLFO.type = "sine";
    bgLFO.frequency.value = 0.06; // slow
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 160;
    bgLFO.connect(lfoGain);
    lfoGain.connect(bgFilter.frequency);

    // gentle amplitude wobble
    const ampLFO = audioCtx.createOscillator();
    ampLFO.type = "sine";
    ampLFO.frequency.value = 0.12;
    const ampLFOGain = audioCtx.createGain();
    ampLFOGain.gain.value = 0.006;
    ampLFO.connect(ampLFOGain);
    ampLFOGain.connect(bgGain.gain);

    // connect chain
    bgOsc1.connect(bgFilter);
    bgOsc2.connect(bgFilter);
    bgFilter.connect(bgGain);

    // start them
    bgOsc1.start();
    bgOsc2.start();
    bgLFO.start();
    ampLFO.start();

    // Initially suspended until user interacts
    if (audioCtx.state === "suspended") {
      audioAvailable = true; // still available but suspended
    }
  } catch (e) {
    console.warn("Audio context not created:", e);
    audioAvailable = false;
    audioCtx = null;
    masterGain = null;
  }

  // Particle system for gentle visual feedback (selection / success)
  const particles = [];
  function spawnParticles(x, y, color = "#9ee6c7", count = 12, spread = 28) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * spread,
        vy: (Math.random() - 0.9) * spread * -0.4,
        life: 800 + Math.random() * 600,
        born: performance.now(),
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  function updateAndDrawParticles(now) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.born;
      if (age > p.life) {
        particles.splice(i, 1);
        continue;
      }
      const t = age / p.life;
      p.vy += 0.06; // gravity
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      const alpha = 1 - t;
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function hexToRgba(hex, a = 1) {
    // supports #rrggbb or #rgb
    let c = hex.replace("#", "");
    if (c.length === 3) {
      c = c.split("").map((ch) => ch + ch).join("");
    }
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  // Improved sounds using Web Audio API primitives
  function ensureAudioRunning() {
    if (!audioCtx) return Promise.resolve(false);
    if (audioCtx.state === "suspended") {
      return audioCtx.resume().then(() => true).catch(() => false);
    }
    return Promise.resolve(true);
  }

  function playClick() {
    if (!audioCtx) return;
    ensureAudioRunning().then((ok) => {
      if (!ok) return;
      try {
        const now = audioCtx.currentTime;
        // short tinny click with high-frequency bandpass
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const bp = audioCtx.createBiquadFilter();
        o.type = "triangle";
        o.frequency.value = 1500 + Math.random() * 600;
        bp.type = "bandpass";
        bp.frequency.value = 1500;
        bp.Q.value = 6;
        g.gain.value = 0.0001;
        o.connect(bp);
        bp.connect(g);
        g.connect(masterGain);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.03, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        o.start(now);
        o.stop(now + 0.1);
      } catch (e) {
        console.warn("playClick failed:", e);
      }
    });
  }

  function playBeep(time = 0, duration = 0.18, freq = 880, type = "sine", volume = 0.08) {
    if (!audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      const now = audioCtx.currentTime;
      o.start(now + time);
      g.gain.setValueAtTime(0.0001, now + time);
      g.gain.exponentialRampToValueAtTime(volume, now + time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);
      o.stop(now + time + duration + 0.02);
    } catch (e) {
      console.warn("playBeep failed:", e);
    }
  }

  function playCorrectTune() {
    ensureAudioRunning().then((ok) => {
      if (!ok) return;
      try {
        // arpeggiated third chord with light reverb-like tail via filter
        const now = audioCtx.currentTime;
        const freqs = [660, 880, 1100];
        freqs.forEach((f, i) => {
          playBeep(i * 0.11, 0.26, f, i === 1 ? "sine" : "triangle", 0.05 + i * 0.01);
        });
        // small particle flourish (visual)
        spawnParticles(WIDTH / 2 + 140, HEIGHT / 2 + 20, "#7ee787", 18, 36);
      } catch (e) {
        console.warn("playCorrectTune failed:", e);
      }
    });
  }

  function playWrongThud() {
    ensureAudioRunning().then((ok) => {
      if (!ok) return;
      try {
        const now = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const f = audioCtx.createBiquadFilter();
        const g = audioCtx.createGain();
        o.type = "sawtooth";
        o.frequency.value = 140;
        f.type = "lowpass";
        f.frequency.value = 240;
        f.Q.value = 1.2;
        g.gain.value = 0.0001;
        o.connect(f);
        f.connect(g);
        g.connect(masterGain);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        o.start(now);
        o.stop(now + 0.52);
        // small visual feedback
        spawnParticles(WIDTH / 2 + 140, HEIGHT / 2 + 20, "#ff8a8a", 8, 18);
      } catch (e) {
        console.warn("playWrongThud failed:", e);
      }
    });
  }

  // Gentle pickup chime for token selection
  function playSelectChime() {
    ensureAudioRunning().then((ok) => {
      if (!ok) return;
      try {
        const now = audioCtx.currentTime;
        const freqs = [920, 1100];
        freqs.forEach((f, i) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = i === 0 ? "triangle" : "sine";
          o.frequency.value = f;
          g.gain.value = 0.0001;
          o.connect(g);
          g.connect(masterGain);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.04, now + 0.008 + i * 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + i * 0.03);
          o.start(now);
          o.stop(now + 0.16 + i * 0.04);
        });
      } catch (e) {
        console.warn("playSelectChime failed:", e);
      }
    });
  }

  // Game state
  let level = 1;
  let score = 0;
  let tokens = []; // token objects
  let selectedIds = new Set();
  let target = 0;
  let attemptsLeft = 3;
  let rotatingCogAngle = 0;
  let tick = 0;
  let showAudioOn = true;

  // Visual theme colors (refined)
  const palette = {
    bg: "#f4fbfc",
    machine: "#e6f6f8",
    accent: "#7fc2c9",
    tokenFill: ["#ffd6a5", "#c8f7d8", "#d0c7ff", "#fff2a6", "#f8c6d8"],
    text: "#143034",
    wrong: "#ff8a8a",
    right: "#7ee787",
    subtle: "#cfeaf1",
    glow: "#e8fff6",
  };

  // Accessibility: update live region
  function aria(msg) {
    liveRegion.textContent = msg;
  }

  // Generate tokens that guarantee a solvable subset for the target
  function generateLevel(lv) {
    // target grows with level
    const minTarget = 5 + Math.floor((lv - 1) * 1.5);
    const maxTarget = 9 + lv * 2;
    target = randInt(minTarget, maxTarget);
    // choose number of tokens 3..6
    const n = clamp(4 + Math.floor(lv / 3), 3, 6);
    // create one guaranteed solution: pick k numbers between 1 and 9 whose sum = target, with k 2..3
    let solution = null;
    for (let attempts = 0; attempts < 200 && !solution; attempts++) {
      const k = randInt(2, Math.min(3, Math.max(2, Math.floor(target / 3))));
      // generate k numbers sum to target but each 1..9
      const parts = [];
      let sum = 0;
      for (let i = 0; i < k - 1; i++) {
        const rem = target - sum - (k - i - 1) * 1;
        const maxVal = Math.min(9, rem - (k - i - 2) * 1);
        const val = Math.max(1, randInt(1, Math.max(1, maxVal)));
        parts.push(val);
        sum += val;
      }
      const last = target - sum;
      if (last >= 1 && last <= 9) {
        parts.push(last);
        solution = parts;
      }
    }
    if (!solution) {
      // fallback: target as one token if <=9
      if (target <= 9) solution = [target];
      else solution = [Math.min(9, target - 1), Math.max(1, target - Math.min(9, target - 1))];
    }
    // Fill remaining tokens
    tokens = [];
    const usedColors = palette.tokenFill;
    let idx = 0;
    // Place solution tokens in random positions among tokens
    const positions = [];
    const margin = 40;
    const startX = 120;
    const gap = (WIDTH - 2 * startX) / (n - 1);
    for (let i = 0; i < n; i++) {
      positions.push({ x: startX + gap * i, y: HEIGHT - 110 });
    }
    shuffleArray(positions);
    // add solution numbers first
    for (let v of solution) {
      const pos = positions.pop();
      tokens.push(makeToken(v, pos.x, pos.y, usedColors[idx % usedColors.length]));
      idx++;
    }
    // fill with distractors
    while (tokens.length < n) {
      const v = randInt(1, 9);
      const pos = positions.pop();
      tokens.push(makeToken(v, pos.x, pos.y, usedColors[idx % usedColors.length]));
      idx++;
    }
    shuffleArray(tokens); // random order
    // reset selection etc.
    selectedIds = new Set();
    attemptsLeft = 3;
    aria(`Level ${level}. Target ${target}. Choose tokens that add up to ${target}.`);
  }

  function makeToken(value, x, y, color) {
    return {
      id: Math.random().toString(36).slice(2, 9),
      value,
      x,
      y,
      r: 28,
      color,
      used: false,
      wobble: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.02,
      baseX: x,
      baseY: y,
    };
  }

  function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  // Interaction state
  let drag = null;
  let pointerDown = false;
  let keyboardIndex = 0;

  // Input handlers (unchanged logic, but selection chime on toggle)
  canvas.addEventListener("mousedown", (e) => {
    const pos = getMouse(e);
    pointerDown = true;
    const t = findTokenAt(pos.x, pos.y);
    if (t) {
      drag = { token: t, offsetX: pos.x - t.x, offsetY: pos.y - t.y };
      playClick();
      keyboardIndex = tokens.findIndex((tk) => tk.id === t.id);
      canvas.focus();
    } else {
      const btn = hitButtonAt(pos.x, pos.y);
      if (btn === "submit") handleSubmit();
      if (btn === "clear") handleClear();
      if (btn === "audio") toggleAudio();
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const pos = getMouse(e);
    drag.token.x = pos.x - drag.offsetX;
    drag.token.y = pos.y - drag.offsetY;
  });

  canvas.addEventListener("mouseup", (e) => {
    pointerDown = false;
    if (drag) {
      const bowl = { x: WIDTH / 2 + 140, y: HEIGHT / 2 + 20, r: 90 };
      const t = drag.token;
      const dist = Math.hypot(t.x - bowl.x, t.y - bowl.y);
      if (dist < bowl.r + 20) {
        toggleTokenSelection(t.id);
      } else {
        snapTokenBack(t);
      }
    }
    drag = null;
  });

  // Touch support
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t0 = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const pos = { x: t0.clientX - rect.left, y: t0.clientY - rect.top };
    pointerDown = true;
    const tkn = findTokenAt(pos.x, pos.y);
    if (tkn) {
      drag = { token: tkn, offsetX: pos.x - tkn.x, offsetY: pos.y - tkn.y };
      playClick();
      keyboardIndex = tokens.findIndex((tk) => tk.id === tkn.id);
      canvas.focus();
    } else {
      const btn = hitButtonAt(pos.x, pos.y);
      if (btn === "submit") handleSubmit();
      if (btn === "clear") handleClear();
      if (btn === "audio") toggleAudio();
    }
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!drag) return;
    const t0 = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const pos = { x: t0.clientX - rect.left, y: t0.clientY - rect.top };
    drag.token.x = pos.x - drag.offsetX;
    drag.token.y = pos.y - drag.offsetY;
  });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    pointerDown = false;
    if (!drag) return;
    const bowl = { x: WIDTH / 2 + 140, y: HEIGHT / 2 + 20, r: 90 };
    const t = drag.token;
    const dist = Math.hypot(t.x - bowl.x, t.y - bowl.y);
    if (dist < bowl.r + 20) {
      toggleTokenSelection(t.id);
    } else {
      snapTokenBack(t);
    }
    drag = null;
  });

  function getMouse(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function findTokenAt(x, y) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const d = Math.hypot(x - t.x, y - t.y);
      if (d <= t.r + 6) return t;
    }
    return null;
  }

  function snapTokenBack(t) {
    const basePositions = computeTokenBasePositions(tokens.length);
    const index = tokens.findIndex((tk) => tk.id === t.id);
    const pos = basePositions[index];
    animateMove(t, pos.x, pos.y, 280);
  }

  function computeTokenBasePositions(n) {
    const startX = 120;
    const gap = (WIDTH - 2 * startX) / Math.max(1, n - 1);
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({ x: startX + gap * i, y: HEIGHT - 110 });
    }
    return arr;
  }

  // Selection logic
  function toggleTokenSelection(id) {
    const t = tokens.find((tk) => tk.id === id);
    if (!t) return;
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
      snapTokenBack(t);
      playClick();
      aria(`Removed ${t.value} from machine. Current sum ${currentSelectionSum()}.`);
      spawnParticles(t.x, t.y, "#ffd6a5", 6, 18);
      return;
    }
    if (selectedIds.size >= 4) {
      aria("You can use up to 4 tokens. Remove one before adding.");
      playWrongThud();
      return;
    }
    selectedIds.add(id);
    const bowlCenter = { x: WIDTH / 2 + 140, y: HEIGHT / 2 + 20 };
    const offset = { x: randInt(-40, 40), y: randInt(-20, 20) };
    animateMove(t, bowlCenter.x + offset.x, bowlCenter.y + offset.y, 380);
    playSelectChime();
    // subtle sparkle at bowl
    spawnParticles(bowlCenter.x + offset.x, bowlCenter.y + offset.y, "#fff2a6", 10, 30);
    aria(`Added ${t.value}. Current sum ${currentSelectionSum()}.`);
  }

  function animateMove(obj, tx, ty, duration = 300) {
    const start = { x: obj.x, y: obj.y, t: performance.now() };
    const end = { x: tx, y: ty };
    function step(now) {
      const p = Math.min(1, (now - start.t) / duration);
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      obj.x = start.x + (end.x - start.x) * ease;
      obj.y = start.y + (end.y - start.y) * ease;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function currentSelectionSum() {
    let s = 0;
    for (let id of selectedIds) {
      const t = tokens.find((tk) => tk.id === id);
      if (t) s += t.value;
    }
    return s;
  }

  function handleSubmit() {
    const s = currentSelectionSum();
    if (s === 0) {
      aria("No tokens selected. Choose tokens to make the target total.");
      playWrongThud();
      return;
    }
    if (s === target) {
      score += 10 + attemptsLeft * 2;
      playCorrectTune();
      aria(`Correct! You made ${target}. Level ${level} completed.`);
      for (let id of selectedIds) {
        const t = tokens.find((tk) => tk.id === id);
        if (t) t.used = true;
      }
      // small celebratory particles
      spawnParticles(WIDTH / 2 + 140, HEIGHT / 2 + 20, "#7ee787", 28, 48);
      selectedIds.clear();
      setTimeout(() => {
        level++;
        if (level > MAX_LEVELS) {
          showWin();
        } else {
          generateLevel(level);
        }
      }, 900);
    } else {
      attemptsLeft--;
      playWrongThud();
      aria(`Not quite. Your sum is ${s}. Attempts left: ${attemptsLeft}.`);
      if (attemptsLeft <= 0) {
        revealHint();
        setTimeout(() => {
          level++;
          if (level > MAX_LEVELS) showWin();
          else generateLevel(level);
        }, 1200);
      }
    }
  }

  function revealHint() {
    const vals = tokens.map((t) => t.value);
    const idxs = subsetSumIndices(vals, target);
    if (idxs) {
      for (let i of idxs) {
        selectedIds.add(tokens[i].id);
      }
      playCorrectTune();
      aria("Here's a helpful hint: some tokens are highlighted.");
      // hint particles
      idxs.forEach((i) => {
        const t = tokens[i];
        spawnParticles(t.x, t.y, "#d0c7ff", 10, 28);
        animateMove(t, WIDTH / 2 + 140 + randInt(-30, 30), HEIGHT / 2 + 20 + randInt(-20, 20), 380);
      });
    } else {
      aria("No hint found; moving to next round.");
    }
  }

  // subset sum solver returning indices
  function subsetSumIndices(arr, target) {
    const n = arr.length;
    for (let size = 1; size <= Math.min(4, n); size++) {
      const comb = [];
      if (search(0, 0)) {
        return comb;
      }
      function search(i, sum) {
        if (sum === target && comb.length === size) return true;
        if (sum > target) return false;
        if (i >= n) return false;
        comb.push(i);
        if (search(i + 1, sum + arr[i])) return true;
        comb.pop();
        return search(i + 1, sum);
      }
    }
    const best = [];
    function dfs(i, sum) {
      if (sum === target) return [];
      if (i >= n) return null;
      const withChoose = dfs(i + 1, sum + arr[i]);
      if (withChoose !== null) {
        return [i].concat(withChoose);
      }
      return dfs(i + 1, sum);
    }
    return dfs(0, 0);
  }

  function handleClear() {
    selectedIds.clear();
    tokens.forEach((t, i) => {
      if (!t.used) {
        const pos = computeTokenBasePositions(tokens.length)[i];
        animateMove(t, pos.x, pos.y, 300);
      }
    });
    aria("Selection cleared.");
    playClick();
  }

  function toggleAudio() {
    showAudioOn = !showAudioOn;
    if (audioCtx && showAudioOn) {
      ensureAudioRunning().then((ok) => {
        if (ok && bgGain) bgGain.gain.value = 0.015;
      });
    } else if (audioCtx) {
      if (bgGain) bgGain.gain.value = 0;
    }
    aria(showAudioOn ? "Audio enabled." : "Audio muted.");
  }

  function hitButtonAt(x, y) {
    const submit = { x: WIDTH - 140, y: HEIGHT - 120, w: 110, h: 44 };
    const clear = { x: WIDTH - 280, y: HEIGHT - 120, w: 110, h: 44 };
    const audioBtn = { x: WIDTH - 70, y: 20, r: 18 };
    if (x >= submit.x && x <= submit.x + submit.w && y >= submit.y && y <= submit.y + submit.h)
      return "submit";
    if (x >= clear.x && x <= clear.x + clear.w && y >= clear.y && y <= clear.y + clear.h)
      return "clear";
    if (Math.hypot(x - audioBtn.x, y - audioBtn.y) <= audioBtn.r) return "audio";
    return null;
  }

  // Keyboard controls
  canvas.addEventListener("keydown", (e) => {
    if (audioAvailable && audioCtx && audioCtx.state === "suspended") {
      ensureAudioRunning();
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
    }
    switch (e.key) {
      case "ArrowLeft":
        keyboardIndex = (keyboardIndex - 1 + tokens.length) % tokens.length;
        playClick();
        aria(`Selected token ${tokens[keyboardIndex].value}. Press Enter to toggle it.`);
        break;
      case "ArrowRight":
        keyboardIndex = (keyboardIndex + 1) % tokens.length;
        playClick();
        aria(`Selected token ${tokens[keyboardIndex].value}. Press Enter to toggle it.`);
        break;
      case "Enter":
      case " ":
        if (tokens[keyboardIndex]) {
          toggleTokenSelection(tokens[keyboardIndex].id);
        }
        break;
      case "Backspace":
      case "Delete":
        handleClear();
        break;
      case "s":
      case "S":
        handleSubmit();
        break;
      case "a":
      case "A":
        toggleAudio();
        break;
    }
  });

  // Draw helpers
  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // Main render loop
  let lastNow = performance.now();
  function render(now = performance.now()) {
    const dt = now - lastNow;
    lastNow = now;
    tick++;
    rotatingCogAngle += 0.008 * (1 + level * 0.05);

    // background subtle moving radial glow
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bgGrad.addColorStop(0, "#f8feff");
    bgGrad.addColorStop(1, "#eef9fb");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // gentle animated vignette
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#bce8e6";
    const shimmer = Math.sin(now / 1500) * 18;
    ctx.fillRect(shimmer, 0, WIDTH - shimmer * 2, HEIGHT);
    ctx.restore();

    // ground
    ctx.fillStyle = "#f1fbfa";
    ctx.fillRect(0, HEIGHT - 110, WIDTH, 110);
    // soft ground pattern
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#bfeee6";
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.ellipse((i * 120 + (tick * 0.6) % 120), HEIGHT - 60, 60, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Wacky machine body with gradient and small animated lights
    ctx.save();
    ctx.translate(WIDTH / 2 - 40, HEIGHT / 2 - 20);
    const bodyGrad = ctx.createLinearGradient(-180, -120, 240, 120);
    bodyGrad.addColorStop(0, "#ffffff");
    bodyGrad.addColorStop(1, "#e6f8fa");
    ctx.fillStyle = bodyGrad;
    drawRoundedRect(-180, -120, 420, 240, 24); // main body
    // machine screen
    const screenGrad = ctx.createLinearGradient(48, -82, 192, -38);
    screenGrad.addColorStop(0, "#dff7ff");
    screenGrad.addColorStop(1, "#cfeef7");
    ctx.fillStyle = screenGrad;
    ctx.fillRect(48, -82, 144, 44);
    // subtle pixel grid on screen
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#ffffff";
    for (let xx = 54; xx < 190; xx += 14) {
      for (let yy = -78; yy < -40; yy += 12) {
        ctx.fillRect(xx, yy + (Math.sin((tick * 0.05) + xx * 0.01) * 2), 6, 4);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Title
    ctx.fillStyle = palette.text;
    ctx.font = "22px system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
    ctx.textAlign = "left";
    ctx.fillText("Wacky Machine Mixer", 18, 36);

    // Draw rotating cogs (left and right) with soft shadows
    drawCog(88, 120, 48, rotatingCogAngle, "#eaf6f8", "#8ad0d8");
    drawCog(WIDTH - 140, 120, 30, -rotatingCogAngle * 1.4, "#f4eaff", "#b89ff0");

    // Draw gauge showing target with subtle glow
    drawGauge(WIDTH / 2 + 160, HEIGHT / 2 - 40, target);

    // Draw bowl where tokens go with gentle glassy look
    drawBowl(WIDTH / 2 + 140, HEIGHT / 2 + 20, 90);

    // Draw tokens
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      // gently bobbing and spinning for life
      t.wobble += 0.02;
      t.spin *= 0.98;
      if (!selectedIds.has(t.id) && !t.used && (!drag || drag.token.id !== t.id)) {
        const base = computeTokenBasePositions(tokens.length)[i];
        t.x += (base.x - t.x) * 0.08;
        t.y += (base.y - t.y) * 0.06;
        t.spin += Math.sin((i + tick * 0.02) + t.wobble) * 0.001;
      }
      drawToken(t, i === keyboardIndex);
    }

    // Draw submit and clear buttons
    drawButtons();

    // HUD: level, score, attempts
    ctx.fillStyle = palette.text;
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Level ${level} / ${MAX_LEVELS}`, 18, HEIGHT - 78);
    ctx.fillText(`Score ${score}`, 18, HEIGHT - 54);

    // Attempts with small heart icons
    ctx.fillStyle = "#ff8a8a";
    for (let i = 0; i < attemptsLeft; i++) {
      drawHeart(110 + i * 18, HEIGHT - 62, 8);
    }
    ctx.fillStyle = palette.text;
    ctx.fillText(`Attempts left: ${attemptsLeft}`, 18, HEIGHT - 30);

    // audio icon + pulse
    drawAudioIcon(WIDTH - 70, 20, showAudioOn);

    // subtle pipes / tubes with inner glow
    drawPipes();

    // particle updates
    updateAndDrawParticles(now);

    requestAnimationFrame(render);
  }

  function drawPipes() {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = "rgba(124,200,206,0.12)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(20, 80);
    ctx.bezierCurveTo(120, 20, 240, 40, WIDTH / 2 - 120, HEIGHT / 2 - 40);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(WIDTH - 20, 80);
    ctx.bezierCurveTo(WIDTH - 160, 20, WIDTH - 280, 80, WIDTH / 2 + 80, HEIGHT / 2 - 40);
    ctx.stroke();
    ctx.restore();
  }

  function drawAudioIcon(x, y, on) {
    ctx.save();
    // glowing backdrop
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#e8fff6" : "#f0f4f5";
    ctx.fill();
    ctx.strokeStyle = "#d7f0ea";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // speaker
    ctx.fillStyle = on ? "#136056" : "#6c6c6c";
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 6);
    ctx.lineTo(x - 2, y - 6);
    ctx.lineTo(x + 2, y - 10);
    ctx.lineTo(x + 2, y + 10);
    ctx.lineTo(x - 2, y + 6);
    ctx.lineTo(x - 6, y + 6);
    ctx.closePath();
    ctx.fill();
    // subtle wave animation when on
    if (on) {
      const phase = (performance.now() / 500) % Math.PI * 2;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(19,96,86,${0.14 - i * 0.03})`;
        ctx.lineWidth = 2;
        ctx.arc(x + 4, y, 6 + Math.sin(phase + i) * 3 + i * 4, -0.6, 0.6);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawButtons() {
    // clear
    const clear = { x: WIDTH - 280, y: HEIGHT - 120, w: 110, h: 44 };
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#d6f0ee";
    ctx.lineWidth = 2;
    drawRoundedRect(clear.x, clear.y, clear.w, clear.h, 8);
    ctx.fillStyle = palette.text;
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Clear", clear.x + clear.w / 2, clear.y + clear.h / 2 + 6);

    // submit
    const submit = { x: WIDTH - 140, y: HEIGHT - 120, w: 110, h: 44 };
    ctx.fillStyle = "#bff0e0";
    ctx.strokeStyle = "#8fdfbf";
    drawRoundedRect(submit.x, submit.y, submit.w, submit.h, 10);
    ctx.fillStyle = palette.text;
    ctx.fillText("Submit", submit.x + submit.w / 2, submit.y + submit.h / 2 + 6);
  }

  function drawBowl(cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    // shadow
    ctx.beginPath();
    ctx.ellipse(0, r - 12, r * 1.1, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(40,60,60,0.06)";
    ctx.fill();
    // glass bowl
    ctx.beginPath();
    ctx.moveTo(-r, -20);
    ctx.quadraticCurveTo(0, -r - 10, r, -20);
    ctx.lineTo(r, 40);
    ctx.quadraticCurveTo(0, r, -r, 40);
    ctx.closePath();
    const bowlGrad = ctx.createLinearGradient(-r, -r, r, r);
    bowlGrad.addColorStop(0, "#ffffff");
    bowlGrad.addColorStop(1, "#f0fbff");
    ctx.fillStyle = bowlGrad;
    ctx.fill();
    ctx.strokeStyle = "#cfe7f3";
    ctx.lineWidth = 2;
    ctx.stroke();
    // digital display
    ctx.fillStyle = "#f6ffff";
    ctx.fillRect(-54, -12, 108, 28);
    ctx.strokeStyle = "#d4eef3";
    ctx.strokeRect(-54, -12, 108, 28);
    ctx.fillStyle = palette.text;
    ctx.font = "18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${currentSelectionSum()} / ${target}`, 0, 8);
    // small machine light
    ctx.beginPath();
    ctx.arc(r - 22, -18, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff9e6";
    ctx.fill();
    ctx.strokeStyle = "#fde8a8";
    ctx.stroke();
    ctx.restore();
  }

  function drawGauge(x, y, value) {
    ctx.save();
    ctx.translate(x, y);
    // circular background ring
    ctx.beginPath();
    ctx.arc(0, 0, 64, Math.PI * 0.8, Math.PI * 2.2);
    ctx.strokeStyle = "#e8f6f8";
    ctx.lineWidth = 18;
    ctx.stroke();
    // needle
    const fraction = clamp(value / 30, 0, 1);
    const angle = Math.PI * 0.8 + Math.PI * 1.4 * fraction;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * 56, Math.sin(angle) * 56);
    ctx.strokeStyle = "#0f666d";
    ctx.lineWidth = 3;
    ctx.stroke();
    // center
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#0f666d";
    ctx.fill();
    // label
    ctx.fillStyle = palette.text;
    ctx.font = "18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Target", 0, -84);
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillText(value, 0, -56);
    ctx.restore();
  }

  function drawToken(t, highlighted = false) {
    ctx.save();
    // subtle drop shadow
    ctx.beginPath();
    ctx.ellipse(t.x + 6, t.y + 8, t.r * 0.9, t.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,40,40,0.08)";
    ctx.fill();

    // body with inner gradient
    const grad = ctx.createRadialGradient(t.x - t.r * 0.3, t.y - t.r * 0.4, 4, t.x, t.y, t.r);
    grad.addColorStop(0, "#ffffffc8");
    grad.addColorStop(0.2, t.color);
    grad.addColorStop(1, shadeColor(t.color, -12));
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // outline
    ctx.strokeStyle = highlighted ? "#2d6f68" : "#cfe8e9";
    ctx.lineWidth = highlighted ? 4 : 2;
    ctx.stroke();

    // small friendly face
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.arc(t.x - 8, t.y - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(t.x + 6, t.y - 4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(t.x - 7, t.y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(t.x + 5, t.y - 3, 2, 0, Math.PI * 2);
    ctx.fill();

    // value
    ctx.fillStyle = palette.text;
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t.value, t.x, t.y + 6);

    // used overlay
    if (t.used) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.text;
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("✓", t.x, t.y + 5);
    }

    // selection glow
    if (selectedIds.has(t.id)) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r + 10, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(126,231,135,0.9)";
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawCog(cx, cy, radius, angle, fill, stroke) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const teeth = 10;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const r1 = radius;
      const r2 = radius * 1.28;
      const x1 = Math.cos(a) * r1;
      const y1 = Math.sin(a) * r1;
      const x2 = Math.cos(a + Math.PI / teeth) * r2;
      const y2 = Math.sin(a + Math.PI / teeth) * r2;
      if (i === 0) ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
    // center
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#d2eef2";
    ctx.stroke();
    ctx.restore();
  }

  function drawSpark(cx, cy, hue, phase, spikes) {
    ctx.save();
    ctx.translate(cx, cy);
    for (let j = 0; j < spikes; j++) {
      ctx.beginPath();
      const a = (j / spikes) * Math.PI * 2;
      const r1 = 2 + (Math.sin((tick * 0.1) + j) + 1) * 10;
      const r2 = 2 + (Math.cos((tick * 0.12) + j) + 1) * 12;
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a + 0.02) * r2, Math.sin(a + 0.02) * r2);
      ctx.strokeStyle = `hsla(${(hue + j * 30) % 360},70%,60%,0.95)`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeart(x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - size, y - size, x - size * 1.4, y + size * 0.6, x, y + size);
    ctx.bezierCurveTo(x + size * 1.4, y + size * 0.6, x + size, y - size, x, y);
    ctx.closePath();
    ctx.fillStyle = "#ff8a8a";
    ctx.fill();
    ctx.restore();
  }

  function shadeColor(hex, percent) {
    // simple shade to darker or lighter
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
    const num = parseInt(c, 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00ff) + percent;
    let b = (num & 0x0000ff) + percent;
    r = clamp(r, 0, 255);
    g = clamp(g, 0, 255);
    b = clamp(b, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  // Win state drawing and handling (kept behavior, improved visuals)
  let winning = false;
  function showWin() {
    winning = true;
    aria(`Fantastic! You finished all ${MAX_LEVELS} levels with a score of ${score}.`);
    if (audioCtx) {
      playBeep(0, 0.18, 880, "sine", 0.06);
      playBeep(0.12, 0.18, 1100, "sine", 0.06);
      playBeep(0.24, 0.26, 1318, "sine", 0.06);
    }
    let t0 = performance.now();
    let done = false;
    function celebrate(now) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      // soft background burst
      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bg.addColorStop(0, "#f8fff9");
      bg.addColorStop(1, "#eefbff");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      // main message
      ctx.fillStyle = palette.text;
      ctx.font = "40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("BRAVO! Machine Master!", WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = "20px system-ui, sans-serif";
      ctx.fillText(`Score: ${score}`, WIDTH / 2, HEIGHT / 2 + 14);
      // floating confetti (calm)
      const elapsed = now - t0;
      for (let i = 0; i < 10; i++) {
        const cx = WIDTH / 2 + Math.cos(elapsed / 1000 + i) * 180;
        const cy = HEIGHT / 2 + Math.sin(elapsed / 800 + i * 0.3) * 90;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.sin(elapsed / 700 + i) * 0.6);
        ctx.fillStyle = ["#ffd6a5", "#c8f7d8", "#d0c7ff"][i % 3];
        ctx.fillRect(-6, -10, 12, 20);
        ctx.restore();
      }
      if (elapsed > 4200) {
        done = true;
      }
      if (!done) requestAnimationFrame(celebrate);
      else {
        level = 1;
        score = 0;
        winning = false;
        generateLevel(level);
      }
    }
    requestAnimationFrame(celebrate);
  }

  // Start screen (improved visuals)
  function showIntro() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, "#f0fff9");
    grad.addColorStop(1, "#f1fbff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = palette.text;
    ctx.font = "28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Wacky Machine Mixer", WIDTH / 2, 120);
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("Make the machine happy by choosing tokens that add up to the target number!", WIDTH / 2, 160);
    ctx.fillText("Use the mouse or keyboard (arrow keys to select, Enter to pick, S to submit).", WIDTH / 2, 190);
    ctx.fillText("You can use up to 4 tokens. Press A to toggle audio. Beat all levels to win!", WIDTH / 2, 220);

    ctx.fillStyle = "#bff0e0";
    drawRoundedRect(WIDTH / 2 - 80, 260, 160, 52, 10);
    ctx.fillStyle = palette.text;
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("Start Game", WIDTH / 2, 292);

    ctx.fillStyle = "#fff";
    drawRoundedRect(32, 320, 240, 120, 12);
    ctx.fillStyle = palette.text;
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Keyboard", 48, 344);
    ctx.fillText("← → : Select tokens", 48, 364);
    ctx.fillText("Enter or Space: Toggle token", 48, 384);
    ctx.fillText("S: Submit   Delete: Clear", 48, 404);

    canvas.addEventListener("click", startClickHandler);
    canvas.addEventListener("touchend", startClickHandler);
    aria("Welcome! Press Start to play. Use keyboard or mouse to interact.");
  }

  function startClickHandler(e) {
    let pos;
    if (e.changedTouches) {
      const t0 = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      pos = { x: t0.clientX - rect.left, y: t0.clientY - rect.top };
    } else {
      pos = getMouse(e);
    }
    if (pos.x >= WIDTH / 2 - 80 && pos.x <= WIDTH / 2 + 80 && pos.y >= 260 && pos.y <= 312) {
      canvas.removeEventListener("click", startClickHandler);
      canvas.removeEventListener("touchend", startClickHandler);
      if (audioCtx && audioCtx.state === "suspended") {
        ensureAudioRunning();
      }
      generateLevel(level);
      requestAnimationFrame(render);
    }
  }

  // Error and fallback messages for audio
  if (!audioAvailable) {
    aria("Audio is not available in this browser. The game will play without sound.");
    showAudioOn = false;
  } else {
    // ensure audio resumes on first user gesture
    const resumeOnInteract = () => {
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      canvas.removeEventListener("pointerdown", resumeOnInteract);
      canvas.removeEventListener("keydown", resumeOnInteract);
    };
    canvas.addEventListener("pointerdown", resumeOnInteract);
    canvas.addEventListener("keydown", resumeOnInteract);
  }

  // Initialize to intro
  showIntro();
})();