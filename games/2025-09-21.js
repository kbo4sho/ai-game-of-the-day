(function () {
  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const MAX_LEVEL = 6;
  const SLOT_BASE = 2; // starting number of slots (numbers needed)
  const CONTAINER_ID = "game-of-the-day-stage";
  // Refined palette for a calm, playful look
  const COLORS = {
    bgTop: "#EAF8F5",
    bgBottom: "#F7FEFD",
    machineBody: "#2B8F86",
    machinePanel: "#E6F7F5",
    accent: "#FFD97A",
    gearMain: "#FFEFD6",
    gearRim: "#CDEEEA",
    dial: "#07585A",
    text: "#053236",
    correct: "#2EC4B6",
    incorrect: "#FF6B6B",
    slot: "#FFFFFF",
    focus: "#FFF0C7",
    muted: "#9AA9A7",
    shadow: "rgba(6, 30, 30, 0.08)",
  };

  // Helper: safe DOM retrieval
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error(`Container element with id "${CONTAINER_ID}" not found.`);
    return;
  }

  // ARIA live region for screen readers
  const ariaLive = document.createElement("div");
  ariaLive.setAttribute("aria-live", "polite");
  ariaLive.setAttribute("role", "status");
  ariaLive.style.position = "absolute";
  ariaLive.style.left = "-9999px";
  ariaLive.style.width = "1px";
  ariaLive.style.height = "1px";
  ariaLive.style.overflow = "hidden";
  container.appendChild(ariaLive);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // allow keyboard focus
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.style.outline = "none";
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Machines Math Game. Use arrow keys to move, space to pick, M to mute."
  );
  container.style.position = "relative";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  // Crisp rendering for high DPI displays
  (function adjustForHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    if (dpr !== 1) {
      canvas.width = WIDTH * dpr;
      canvas.height = HEIGHT * dpr;
      canvas.style.width = WIDTH + "px";
      canvas.style.height = HEIGHT + "px";
      ctx.scale(dpr, dpr);
    }
  })();

  // Audio: Web Audio API with richer ambient and shaped envelopes
  let audioCtx = null;
  let bgGain = null;
  let ambientNodes = [];
  let audioAllowed = false;
  let muted = false;

  // Create audio context and ambient sound on first user gesture
  function createAudioContextOnUserGesture() {
    if (audioCtx || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Master gain for mute control
      const master = audioCtx.createGain();
      master.gain.value = 1;
      master.connect(audioCtx.destination);

      // Ambient stereo-ish drone with two oscillators and a slowly moving lowpass
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.03;
      bgGain.connect(master);

      const osc1 = audioCtx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 70;

      const osc2 = audioCtx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.value = 110;

      const mix = audioCtx.createGain();
      mix.gain.value = 1.0;
      osc1.connect(mix);
      osc2.connect(mix);

      // Lowpass for gentle warmth
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.Q.value = 0.8;

      // LFO to modulate filter cutoff for a breathing effect
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.08; // slow
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 300;

      lfo.connect(lfoGain);
      lfoGain.connect(lp.frequency);

      mix.connect(lp);
      lp.connect(bgGain);

      osc1.start();
      osc2.start();
      lfo.start();

      ambientNodes.push(osc1, osc2, lfo, mix, lp);

      // Keep reference for safe shutdown
      audioAllowed = true;
      updateAudioMuteState();
    } catch (e) {
      console.error("Failed to create AudioContext or nodes:", e);
      audioAllowed = false;
      audioCtx = null;
    }
  }

  // update mute state
  function updateAudioMuteState() {
    try {
      if (!audioCtx) return;
      if (bgGain) bgGain.gain.value = muted ? 0 : 0.03;
    } catch (e) {
      console.error("Error updating mute state:", e);
    }
  }

  // Utility: play a shaped tone with envelope
  function playShapedTone({
    freq = 440,
    duration = 0.2,
    type = "sine",
    volume = 0.15,
    attack = 0.002,
    release = 0.08,
    detune = 0,
  }) {
    if (!audioAllowed || muted || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      if (detune) o.detune.value = detune;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + attack);
      g.gain.exponentialRampToValueAtTime(
        0.0001,
        audioCtx.currentTime + duration + release
      );
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + duration + release + 0.02);
    } catch (e) {
      console.error("playShapedTone error:", e);
    }
  }

  function playClick() {
    // bright, quick click with subtle high harmonic
    playShapedTone({
      freq: 720,
      duration: 0.06,
      type: "triangle",
      volume: 0.08,
      attack: 0.002,
      release: 0.04,
    });
    setTimeout(
      () =>
        playShapedTone({
          freq: 1200,
          duration: 0.06,
          type: "sine",
          volume: 0.04,
          attack: 0.002,
          release: 0.04,
        }),
      30
    );
  }

  function playIncorrect() {
    // low buzzy thump + small descending double
    playShapedTone({
      freq: 180,
      duration: 0.2,
      type: "sawtooth",
      volume: 0.18,
      attack: 0.005,
      release: 0.1,
    });
    setTimeout(
      () =>
        playShapedTone({
          freq: 140,
          duration: 0.14,
          type: "sawtooth",
          volume: 0.1,
          attack: 0.002,
          release: 0.06,
        }),
      160
    );
  }

  function playCorrect() {
    if (!audioAllowed || muted || !audioCtx) return;
    try {
      // bright arpeggio with three voices
      const now = audioCtx.currentTime;
      const freqs = [880, 1100, 1320];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? "triangle" : "sine";
        o.frequency.value = f;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, now + i * 0.02);
        g.gain.linearRampToValueAtTime(0.18 / (i + 1), now + i * 0.02 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38 + i * 0.02);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.02);
        o.stop(now + 0.42 + i * 0.02);
      });
      // shimmering upper harmonic
      setTimeout(
        () =>
          playShapedTone({
            freq: 2200,
            duration: 0.18,
            type: "sine",
            volume: 0.06,
            attack: 0.01,
            release: 0.06,
          }),
        80
      );
    } catch (e) {
      console.error("playCorrect error:", e);
    }
  }

  // Game state (kept intact from original)
  let level = 1;
  let gears = []; // {value, x,y,r, picked}
  let slots = []; // {x,y,w,h, value (null if empty)}
  let requiredSlots = SLOT_BASE; // number of numbers to place
  const CONTAINER_WIDTH = WIDTH;
  const CONTAINER_HEIGHT = HEIGHT;
  let target = 0;
  let selectedGearIndex = null; // index in gears currently "holding" (picked up)
  let focusIndex = 0; // for keyboard: focus among interactable items (gears then slots)
  let attemptsLeft = 3;
  let solvedCount = 0;
  let playing = true;
  let message = "Click a gear and put it in the machine to match the target!";
  let showCelebration = false;

  // Animations & visual effects state
  const gearRotations = new Map(); // gearId -> rotation speed & phase
  let timeStart = performance.now();
  let shakeTimer = 0;
  let confettiParticles = []; // celebratory animated particles
  let subtleParticles = generateSubtleParticles(28);

  // Accessibility announcement helper
  function announce(text) {
    ariaLive.textContent = text;
  }

  // Generate a level ensuring solvable combination (preserve logic)
  function generateLevel(lv) {
    requiredSlots = Math.min(4, SLOT_BASE + Math.floor((lv - 1) / 2)); // increases occasionally
    attemptsLeft = 3;
    selectedGearIndex = null;
    focusIndex = 0;
    showCelebration = false;
    confettiParticles = [];
    // Create some base numbers
    const poolSize = Math.min(7, requiredSlots + 3);
    let base = [];
    for (let i = 0; i < poolSize; i++) {
      base.push(Math.floor(Math.random() * Math.min(10 + lv * 2, 20)) + 1);
    }
    // To ensure solvable, pick requiredSlots numbers to sum as the target
    const chosenIndices = [];
    while (chosenIndices.length < requiredSlots) {
      const idx = Math.floor(Math.random() * base.length);
      if (!chosenIndices.includes(idx)) chosenIndices.push(idx);
    }
    target = chosenIndices.reduce((s, idx) => s + base[idx], 0);

    // Add or replace with small variations for difficulty as levels rise
    if (lv >= 3) {
      // ensure at least one small number
      base.push(1 + Math.floor(Math.random() * Math.min(8, lv + 2)));
    }
    // Shuffle base
    base = shuffleArray(base);

    // Build gears from base
    gears = [];
    const trayX = 80;
    const trayY = 340;
    const spacing = 80;
    for (let i = 0; i < base.length; i++) {
      const gx = trayX + (i % 7) * spacing;
      const gy = trayY + Math.floor(i / 7) * 70;
      gears.push({
        value: base[i],
        x: gx,
        y: gy,
        r: 28,
        picked: false,
        id: i,
      });
      // initialize rotation speeds
      gearRotations.set(i, {
        speed: (Math.random() * 0.6 + 0.2) * (Math.random() > 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Create slots (machine inputs)
    slots = [];
    const slotW = 74;
    const slotH = 54;
    const machineCenterX = 440;
    const machineTopY = 160;
    const slotGap = 12;
    const totalW = requiredSlots * slotW + (requiredSlots - 1) * slotGap;
    const startX = machineCenterX - totalW / 2;
    for (let i = 0; i < requiredSlots; i++) {
      slots.push({
        x: startX + i * (slotW + slotGap),
        y: machineTopY + 68,
        w: slotW,
        h: slotH,
        value: null,
      });
    }

    message = `Level ${lv}: Put ${requiredSlots} numbers into the machine to make ${target}.`;
    announce(message);
  }

  // Input handling
  let lastMousePos = { x: WIDTH / 2, y: HEIGHT / 2 };

  canvas.addEventListener("mousedown", (e) => {
    canvas.focus();
    createAudioContextOnUserGesture(); // enable audio on first interaction
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastMousePos = { x, y };
    handleClick(x, y);
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    lastMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  });

  // Keyboard controls (unchanged game controls)
  canvas.addEventListener("keydown", (e) => {
    const totalInteractables = gears.length + slots.length;
    if (!playing) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        restartGame();
      }
      return;
    }
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      muted = !muted;
      updateAudioMuteState();
      announce(muted ? "Muted" : "Sound on");
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusIndex = (focusIndex + 1) % (gears.length + slots.length);
      playClick();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusIndex =
        (focusIndex - 1 + gears.length + slots.length) % (gears.length + slots.length);
      playClick();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (focusIndex < gears.length) {
        focusIndex = gears.length + Math.min(0, slots.length - 1);
      } else {
        focusIndex = 0;
      }
      playClick();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (focusIndex < gears.length) {
        const gIdx = focusIndex;
        pickGearByIndex(gIdx);
      } else {
        const sIdx = focusIndex - gears.length;
        placeToSlot(sIdx);
      }
    } else if (/^\d$/.test(e.key)) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= gears.length) {
        pickGearByIndex(num - 1);
      }
    }
  });

  // Click handling logic (preserve behavior)
  function handleClick(x, y) {
    // Check gears first
    for (let i = 0; i < gears.length; i++) {
      const g = gears[i];
      if (pointInCircle(x, y, g.x, g.y, g.r + 6)) {
        pickGearByIndex(i);
        return;
      }
    }
    // Check slots
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (pointInRect(x, y, s.x, s.y, s.w, s.h)) {
        placeToSlot(i);
        return;
      }
    }
    // Click elsewhere: if holding a gear, drop it back to tray
    if (selectedGearIndex !== null) {
      gears[selectedGearIndex].picked = false;
      selectedGearIndex = null;
      playClick();
      announce("Returned gear to tray.");
    }
  }

  // Helpers
  function pointInCircle(px, py, cx, cy, r) {
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  }
  function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  function pickGearByIndex(index) {
    if (index < 0 || index >= gears.length) return;
    createAudioContextOnUserGesture();
    const gear = gears[index];
    if (gear.picked) {
      gear.picked = false;
      selectedGearIndex = null;
      playClick();
      announce(`Returned ${gear.value} to tray.`);
    } else {
      if (isGearInSlot(index)) {
        removeGearFromSlots(index);
        gear.picked = true;
        selectedGearIndex = index;
        playClick();
        announce(`Picked ${gear.value} from machine.`);
      } else {
        gear.picked = true;
        selectedGearIndex = index;
        playClick();
        announce(`Picked ${gear.value}. Click a slot to place it in the machine.`);
      }
    }
  }

  function isGearInSlot(gearIndex) {
    return slots.some((s) => s.value === gearIndex);
  }

  function removeGearFromSlots(gearIndex) {
    for (const s of slots) {
      if (s.value === gearIndex) {
        s.value = null;
        return true;
      }
    }
    return false;
  }

  function placeToSlot(slotIdx) {
    createAudioContextOnUserGesture();
    if (slotIdx < 0 || slotIdx >= slots.length) return;
    const slot = slots[slotIdx];
    if (selectedGearIndex === null) {
      if (slot.value !== null) {
        const gIdx = slot.value;
        slot.value = null;
        gears[gIdx].picked = true;
        selectedGearIndex = gIdx;
        playClick();
        announce(`Lifted ${gears[gIdx].value} from slot ${slotIdx + 1}.`);
      } else {
        playClick();
      }
      return;
    } else {
      if (slot.value !== null) {
        const existing = slot.value;
        // swap
        slots[slotIdx].value = selectedGearIndex;
        gears[selectedGearIndex].picked = false;
        gears[existing].picked = true;
        selectedGearIndex = existing;
        playClick();
        announce(
          `Swapped ${gears[existing].value} with ${gears[slots[slotIdx].value].value}.`
        );
      } else {
        slots[slotIdx].value = selectedGearIndex;
        gears[selectedGearIndex].picked = false;
        const placedVal = gears[selectedGearIndex].value;
        selectedGearIndex = null;
        playClick();
        announce(`Placed ${placedVal} into slot ${slotIdx + 1}.`);
      }
    }
    checkMachine();
  }

  function checkMachine() {
    if (slots.some((s) => s.value === null)) {
      return;
    }
    const sum = slots.reduce((s, sl) => s + gears[sl.value].value, 0);
    if (sum === target) {
      playCorrect();
      message = "Perfect! The machine whirs happily — you solved it!";
      announce(`Correct! You solved level ${level}.`);
      solvedCount++;
      showCelebration = true;
      startConfetti();
      // little machine glow
      shakeTimer = 500;
      setTimeout(() => {
        if (level >= MAX_LEVEL) {
          playing = false;
          message = `Amazing! You completed all levels! Press Enter to play again.`;
          announce("All levels completed. Congratulations!");
        } else {
          level++;
          generateLevel(level);
        }
        requestRender();
      }, 900);
    } else {
      playIncorrect();
      attemptsLeft--;
      const hint = generateHint(sum, target);
      message = `Almost — machine output ${sum}. ${hint} Attempts left: ${attemptsLeft}`;
      announce(
        `Incorrect. Machine output ${sum}.` +
          (attemptsLeft > 0 ? ` ${attemptsLeft} attempts left.` : " No attempts left.")
      );
      // shake machine slightly
      shakeTimer = 420;
      if (attemptsLeft <= 0) {
        message = `Oh no — out of attempts. The machine resets. The target was ${target}.`;
        announce(`Out of attempts. The target was ${target}.`);
        setTimeout(() => {
          if (level > 1) {
            level = Math.max(1, level - 1); // gentle rollback
          }
          generateLevel(level);
        }, 1200);
      } else {
        const filledSlots = slots
          .map((s, i) => (s.value !== null ? i : -1))
          .filter((i) => i !== -1);
        if (filledSlots.length > 0) {
          const idxToClear = filledSlots[Math.floor(Math.random() * filledSlots.length)];
          const gearIdx = slots[idxToClear].value;
          slots[idxToClear].value = null;
          gears[gearIdx].picked = false;
          announce(`One number was ejected from slot ${idxToClear + 1}.`);
        }
      }
    }
  }

  function generateHint(sum, targetVal) {
    const diff = Math.abs(sum - targetVal);
    if (diff === 0) return "Perfect!";
    if (diff <= 2) return "You're very close — try a slightly different number.";
    if (diff <= 5) return "A different small number might help.";
    return "Try changing a larger number to get closer.";
  }

  // Render loop and advanced visuals
  let lastTick = 0;

  function requestRender() {
    draw();
  }

  function draw() {
    try {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const now = performance.now();
      const elapsed = (now - timeStart) / 1000;
      drawBackground(elapsed);
      drawMachine(elapsed);
      drawSlots(elapsed);
      drawGears(elapsed);
      drawRobot(elapsed);
      drawHUD(elapsed);
      drawInstructions();
      drawSubtleParticles(elapsed);
      if (showCelebration) updateAndDrawConfetti(elapsed);
    } catch (e) {
      console.error("Draw error:", e);
    }
  }

  function drawBackground(t) {
    // animated gentle gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    const jitter = Math.sin(t * 0.35) * 0.02;
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // large soft organic shapes to give depth
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#E7FFF9";
    ctx.beginPath();
    ctx.ellipse(
      140 + Math.sin(t * 0.6) * 6,
      100 + Math.cos(t * 0.5) * 6,
      160,
      90,
      Math.PI * 0.12,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.fillStyle = "#F2FFF9";
    ctx.beginPath();
    ctx.ellipse(
      540 + Math.cos(t * 0.4) * 8,
      80 + Math.sin(t * 0.3) * 6,
      180,
      120,
      -Math.PI * 0.08,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  function drawMachine(t) {
    // machine base with slight bob and shake effect
    const machineX = 360;
    const machineY =
      120 + Math.sin(t * 0.7) * 2 + (shakeTimer > 0 ? Math.sin(t * 60) * (shakeTimer / 420) * 4 : 0);
    ctx.save();

    // shadow
    ctx.fillStyle = COLORS.shadow;
    roundedRect(ctx, machineX - 220, machineY - 10 + 18, 440, 160, 22);
    ctx.fill();

    // outer body
    roundedRect(ctx, machineX - 220, machineY - 30, 440, 160, 22);
    ctx.fillStyle = COLORS.machineBody;
    ctx.fill();

    // front panel
    roundedRect(ctx, machineX - 200, machineY - 12, 400, 120, 16);
    ctx.fillStyle = COLORS.machinePanel;
    ctx.fill();

    // control dial
    ctx.save();
    ctx.translate(machineX + 180, machineY + 18);
    // dial background
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fillStyle = "#F7FFF5";
    ctx.fill();
    // dial knob with rotation synced to time
    const dialAngle = Math.sin(t * 0.8) * 0.12 + (shakeTimer > 0 ? (Math.random() - 0.5) * 0.3 : 0);
    ctx.save();
    ctx.rotate(dialAngle);
    roundedRect(ctx, -8, -28, 16, 18, 4);
    ctx.fillStyle = COLORS.dial;
    ctx.fill();
    ctx.restore();

    // dial markings
    ctx.strokeStyle = "#D9EFEF";
    ctx.lineWidth = 2;
    for (let a = -0.7; a <= 0.7; a += 0.35) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 32, Math.sin(a) * 32);
      ctx.lineTo(Math.cos(a) * 38, Math.sin(a) * 38);
      ctx.stroke();
    }
    ctx.restore();

    // display window for target
    roundedRect(ctx, machineX + 80, machineY - 6, 220, 92, 12);
    // glow when solved
    const glowAlpha = showCelebration ? 0.5 + Math.sin(t * 18) * 0.15 : 0.05;
    const displayGrad = ctx.createLinearGradient(
      machineX + 80,
      machineY - 6,
      machineX + 300,
      machineY + 86
    );
    displayGrad.addColorStop(0, `rgba(255,255,255,${0.6 + glowAlpha})`);
    displayGrad.addColorStop(1, `rgba(245,255,250,${0.1})`);
    ctx.fillStyle = displayGrad;
    roundedRect(ctx, machineX + 80, machineY - 6, 220, 92, 12);
    ctx.fill();

    // target text
    ctx.fillStyle = COLORS.text;
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TARGET", machineX + 190, machineY + 10);
    ctx.font = "40px 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = COLORS.machineBody;
    ctx.fillText(String(target), machineX + 190, machineY + 48);

    ctx.restore();
  }

  function drawSlots(t) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      // depth shadow
      ctx.save();
      ctx.fillStyle = "rgba(12,36,35,0.06)";
      roundedRect(ctx, s.x + 2, s.y + 6, s.w, s.h, 10);
      ctx.fill();
      ctx.restore();

      // slot plate
      ctx.fillStyle = COLORS.slot;
      roundedRect(ctx, s.x, s.y, s.w, s.h, 10);
      ctx.fill();
      ctx.strokeStyle = "#E6F4F2";
      ctx.lineWidth = 1;
      ctx.stroke();

      // label
      ctx.fillStyle = "#7AABAA";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`slot ${i + 1}`, s.x + 6, s.y - 6);

      if (s.value !== null) {
        const g = gears[s.value];
        // draw gear inside slot slightly inset
        drawGear(s.x + s.w / 2, s.y + s.h / 2, 26, g.value, true, s.value === selectedGearIndex, t);
      } else {
        // empty placeholder with subtle pattern
        ctx.save();
        ctx.fillStyle = "#F3FBFA";
        roundedRect(ctx, s.x + 6, s.y + 10, s.w - 12, s.h - 20, 6);
        ctx.fill();
        ctx.fillStyle = "#BACFCF";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("—", s.x + s.w / 2, s.y + s.h / 2 + 6);
        ctx.restore();
      }
    }
  }

  function drawGears(t) {
    // tray label
    ctx.fillStyle = "#2C6D67";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Gear Tray", 60, 320);

    for (let i = 0; i < gears.length; i++) {
      const g = gears[i];
      let drawX = g.x;
      let drawY = g.y;
      if (g.picked && selectedGearIndex === i) {
        drawX = lastMousePos.x;
        drawY = lastMousePos.y;
      }
      drawGear(drawX, drawY, g.r, g.value, false, focusIndex === i, t, i);
      // index text
      ctx.fillStyle = "#134B49";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), drawX, drawY + 44);
    }
  }

  function drawHUD(t) {
    // level text
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Level ${level} of ${MAX_LEVEL}`, 16, 24);

    // lives icons
    for (let i = 0; i < 3; i++) {
      const x = 16 + i * 28;
      drawHeart(x, 36, 10, i < attemptsLeft ? COLORS.correct : "#F0F4F4");
    }

    // mute state box
    roundedRect(ctx, WIDTH - 110, 16, 92, 36, 10);
    ctx.fillStyle = muted ? "#F0F4F4" : COLORS.machineBody;
    ctx.fill();
    ctx.fillStyle = muted ? COLORS.muted : "#FFF";
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(muted ? "Muted (M)" : "Sound (M)", WIDTH - 60, 38);

    // solved counter with subtle badge
    ctx.save();
    roundedRect(ctx, WIDTH - 130, 62, 100, 28, 8);
    ctx.fillStyle = "#F7FFF7";
    ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Solved: ${solvedCount}`, WIDTH - 80, 82);
    ctx.restore();

    // message area bottom
    ctx.save();
    roundedRect(ctx, 18, HEIGHT - 92, WIDTH - 36, 66, 12);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#E9F6F4";
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    wrapText(ctx, message, 34, HEIGHT - 58, WIDTH - 68, 18);
    ctx.restore();
  }

  function drawInstructions() {
    ctx.fillStyle = "#07585A";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      "Controls: Click or use keyboard. Arrows to move, Space/Enter to pick/place, M to mute.",
      18,
      HEIGHT - 12
    );
  }

  // Character: friendly robot near the machine, drawn with canvas only
  function drawRobot(t) {
    const rx = 300;
    const ry = 200;
    ctx.save();
    // robot body
    roundedRect(ctx, rx - 60, ry + 30, 120, 120, 14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#D8EFEC";
    ctx.stroke();

    // head
    roundedRect(ctx, rx - 42, ry - 20, 84, 64, 10);
    ctx.fillStyle = "#EAF8F6";
    ctx.fill();
    ctx.strokeStyle = "#CDEEEA";
    ctx.stroke();

    // eyes with blinking animation
    const blink = Math.abs(Math.sin(t * 2.5 + rx % 10)) > 0.9 ? 1 : 0; // occasional blink
    ctx.fillStyle = "#063737";
    ctx.beginPath();
    if (blink) {
      ctx.rect(rx - 20, ry + 8, 14, 4);
      ctx.rect(rx + 6, ry + 8, 14, 4);
    } else {
      ctx.arc(rx - 13, ry + 8, 8, 0, Math.PI * 2);
      ctx.arc(rx + 13, ry + 8, 8, 0, Math.PI * 2);
    }
    ctx.fill();

    // mouth (smile)
    ctx.beginPath();
    ctx.strokeStyle = "#066";
    ctx.lineWidth = 2;
    ctx.arc(rx, ry + 20, 14, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();

    // antenna
    ctx.beginPath();
    ctx.moveTo(rx, ry - 16);
    ctx.lineTo(rx, ry - 28);
    ctx.strokeStyle = "#CDEEEA";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rx, ry - 32, 6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();

    // friendly arm waving slightly
    ctx.save();
    const armAngle = Math.sin(t * 2.3) * 0.22;
    ctx.translate(rx + 62, ry + 50);
    ctx.rotate(armAngle);
    roundedRect(ctx, 0, -6, 40, 12, 6);
    ctx.fillStyle = "#E6F7F5";
    ctx.fill();
    ctx.strokeStyle = "#CDEEEA";
    ctx.restore();

    ctx.restore();
  }

  // Draw decorated gear with rotation and shading
  function drawGear(cx, cy, radius, number, inSlot = false, focused = false, t = 0, gearId = 0) {
    ctx.save();

    // rotation based on time & gear-specific speed
    const rotInfo = gearRotations.get(gearId) || { speed: 0.4, phase: 0 };
    const rot = rotInfo.phase + t * rotInfo.speed;
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // create radial gradient rim -> center
    const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.4);
    grad.addColorStop(0, inSlot ? "#FFFFFF" : COLORS.gearMain);
    grad.addColorStop(0.7, COLORS.gearRim);
    grad.addColorStop(1, "#D3F3EE");

    // teeth
    const teeth = 12;
    for (let i = 0; i < teeth; i++) {
      const ang = (i / teeth) * Math.PI * 2;
      const x = Math.cos(ang) * (radius + 6);
      const y = Math.sin(ang) * (radius + 6);
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 10, ang, 0, Math.PI * 2);
      ctx.fillStyle = "#E6F7F2";
      ctx.fill();
      ctx.strokeStyle = "#D2EEE8";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // center disc
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // subtle inner shine
    ctx.beginPath();
    ctx.arc(-radius * 0.25, -radius * 0.25, radius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fill();

    // edge highlight
    ctx.beginPath();
    ctx.arc(0, 0, radius + 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // number label
    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.max(14, Math.floor(radius * 0.6))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(String(number), 0, 6);

    // focus ring if keyboard focused
    if (focused) {
      ctx.beginPath();
      ctx.arc(0, 0, radius + 14, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.focus;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  // Tiny helpers
  function drawTinyGear(x, y, r, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHeart(cx, cy, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const x = cx;
    const y = cy;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - size / 2, x - size, y - size / 2, x - size, y + size / 4);
    ctx.bezierCurveTo(x - size, y + size, x, y + size * 1.3, x, y + size * 1.6);
    ctx.bezierCurveTo(x, y + size * 1.3, x + size, y + size, x + size, y + size / 4);
    ctx.bezierCurveTo(x + size, y - size / 2, x, y - size / 2, x, y);
    ctx.fill();
    ctx.restore();
  }

  // Confetti system: spawn and animate
  function startConfetti() {
    confettiParticles = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: 430 + Math.random() * 220 - 60,
        y: 100 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -2 - Math.random() * 1.8,
        r: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        color: Math.random() > 0.5 ? COLORS.accent : COLORS.correct,
        life: 1600 + Math.random() * 900,
        born: performance.now(),
      });
    }
    // small celebratory chime
    playShapedTone({
      freq: 580,
      duration: 0.28,
      type: "sine",
      volume: 0.11,
      attack: 0.01,
      release: 0.08,
    });
  }

  function updateAndDrawConfetti(t) {
    const now = performance.now();
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];
      const age = now - p.born;
      if (age > p.life) {
        confettiParticles.splice(i, 1);
        continue;
      }
      // physics
      p.vy += 0.06; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      // draw as small rectangles rotating
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.7);
      ctx.restore();
    }
  }

  // subtle ambient particles in background for depth
  function generateSubtleParticles(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        r: 6 + Math.random() * 14,
        a: 0.03 + Math.random() * 0.07,
        vx: (Math.random() - 0.5) * 0.02,
        vy: (Math.random() - 0.5) * 0.02,
      });
    }
    return arr;
  }

  function drawSubtleParticles(t) {
    ctx.save();
    subtleParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -p.r) p.x = WIDTH + p.r;
      if (p.x > WIDTH + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = HEIGHT + p.r;
      if (p.y > HEIGHT + p.r) p.y = -p.r;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(255,255,255,${p.a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Utilities
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
  }

  // Game control
  function restartGame() {
    level = 1;
    solvedCount = 0;
    playing = true;
    generateLevel(level);
    announce("New game started. " + message);
    requestRender();
  }

  // Utility: shuffle array (added but referenced)
  function shuffleArray(arr) {
    // Fisher-Yates
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  // Initialize
  generateLevel(level);
  draw();

  // Click mute area on canvas
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x >= WIDTH - 110 && x <= WIDTH - 18 && y >= 16 && y <= 52) {
      muted = !muted;
      createAudioContextOnUserGesture();
      updateAudioMuteState();
      announce(muted ? "Muted" : "Sound on");
      draw();
    }
  });

  // Safe audio gesture binding
  canvas.addEventListener("pointerdown", () => {
    try {
      createAudioContextOnUserGesture();
    } catch (e) {
      console.error("Audio gesture error:", e);
    }
  });

  // Animation loop
  let animFrame = null;
  function animate(t) {
    lastTick = t;
    // decrease shake timer
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - 16);
    draw();
    animFrame = requestAnimationFrame(animate);
  }
  animFrame = requestAnimationFrame(animate);

  // Clean-up on unload
  window.addEventListener("beforeunload", () => {
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch (e) {
        // ignore
      }
    }
    if (animFrame) cancelAnimationFrame(animFrame);
  });

  // Export minor console help
  console.info(
    "Machines Math Game (visual/audio enhanced) initialized. Click canvas to interact. Press M to mute."
  );
})();