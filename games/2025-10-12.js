(function () {
  // Machine Math — enhanced visuals & audio
  // Renders inside #game-of-the-day-stage and uses canvas + WebAudio API
  // Only canvas drawing, no external files. Keyboard accessible.

  // CONFIG
  const WIDTH = 720;
  const HEIGHT = 480;
  const ROUNDS_TO_WIN = 3;
  const MAX_GEARS = 4;
  const SLOT_COUNT = 3;

  // Get container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container element #game-of-the-day-stage not found.");
    return;
  }
  // Clear container and prepare
  container.innerHTML = "";
  container.style.position = "relative";

  // Create canvas (exact game area)
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.tabIndex = 0; // focusable for keyboard
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Machine Math: drag or use keyboard to place gears to sum to the target number. Press Tab to cycle gears, Enter to pick/place, Space to restart."
  );
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Audio setup with robust error handling
  let audioContext = null;
  let masterGain = null;
  let ambienceNodes = []; // to hold background oscillators/noise
  let bgGain = null;
  let audioAvailable = false;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioContext = new AudioContext();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.55; // comfortable level
      masterGain.connect(audioContext.destination);
      audioAvailable = true;
    } else {
      console.warn("Web Audio API not supported in this browser.");
    }
  } catch (e) {
    console.warn("AudioContext creation failed:", e);
    audioAvailable = false;
  }

  // Ensure audio started on gesture
  async function ensureAudioStarted() {
    if (!audioAvailable || !audioContext) return false;
    try {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      return true;
    } catch (e) {
      console.warn("AudioContext resume failed:", e);
      return false;
    }
  }

  // Start a gentle ambient hum (multiple oscillators + subtle filtered noise)
  let ambienceActive = false;
  function startBackgroundHum() {
    if (!audioAvailable || ambienceActive) return;
    try {
      stopBackgroundHum(); // ensure clean
      ambienceActive = true;
      bgGain = audioContext.createGain();
      bgGain.gain.value = 0.06;
      bgGain.connect(masterGain);

      // Warm low drone
      const oscA = audioContext.createOscillator();
      oscA.type = "sine";
      oscA.frequency.value = 64;
      const lfoA = audioContext.createOscillator();
      lfoA.frequency.value = 0.08;
      const lfoAGain = audioContext.createGain();
      lfoAGain.gain.value = 10;
      lfoA.connect(lfoAGain);
      lfoAGain.connect(oscA.frequency);

      // Gentle harmonic
      const oscB = audioContext.createOscillator();
      oscB.type = "triangle";
      oscB.frequency.value = 110;
      const lfoB = audioContext.createOscillator();
      lfoB.frequency.value = 0.12;
      const lfoBGain = audioContext.createGain();
      lfoBGain.gain.value = 6;
      lfoB.connect(lfoBGain);
      lfoBGain.connect(oscB.frequency);

      // Soft filtered noise for texture
      const bufferSize = 2 * audioContext.sampleRate;
      const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.2;
      const noiseSource = audioContext.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;
      const noiseFilter = audioContext.createBiquadFilter();
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.value = 900;
      const noiseGain = audioContext.createGain();
      noiseGain.gain.value = 0.01;

      // Connect
      oscA.connect(bgGain);
      oscB.connect(bgGain);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(bgGain);

      // Start things
      const now = audioContext.currentTime;
      oscA.start(now);
      oscB.start(now);
      lfoA.start(now);
      lfoB.start(now);
      noiseSource.start(now);

      // store nodes for stopping later
      ambienceNodes = [oscA, oscB, lfoA, lfoB, noiseSource, noiseFilter, noiseGain, bgGain];
    } catch (e) {
      console.warn("Failed to start background ambience:", e);
    }
  }

  function stopBackgroundHum() {
    try {
      if (!ambienceNodes || ambienceNodes.length === 0) {
        ambienceNodes = [];
        ambienceActive = false;
        if (bgGain) {
          try {
            bgGain.disconnect();
          } catch (e) {}
          bgGain = null;
        }
        return;
      }
      // Stop oscillators and sources safely
      ambienceNodes.forEach((n) => {
        try {
          if (n && typeof n.stop === "function") {
            n.stop(0);
          }
          if (n && typeof n.disconnect === "function") {
            n.disconnect();
          }
        } catch (e) {}
      });
    } catch (e) {
      // ignore
    } finally {
      ambienceNodes = [];
      ambienceActive = false;
      if (bgGain) {
        try {
          bgGain.disconnect();
        } catch (e) {}
        bgGain = null;
      }
    }
  }

  // Small helper: create a tone with ADSR envelope and optional filter
  function playTone({
    freq = 440,
    duration = 0.12,
    type = "sine",
    gain = 0.15,
    when = 0,
    detune = 0,
    filterFreq = 8000
  } = {}) {
    if (!audioAvailable) return;
    try {
      const ctx = audioContext;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterFreq;

      osc.type = type;
      osc.frequency.value = freq;
      if (detune) osc.detune.value = detune;

      g.gain.value = 0.0001;

      osc.connect(filter);
      filter.connect(g);
      g.connect(masterGain);

      const now = ctx.currentTime + when;
      // ADSR-like: quick attack, sustain, release
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      g.gain.setValueAtTime(gain * 0.9, now + duration * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.start(now);
      osc.stop(now + duration + 0.05);
      // disconnect after stop
      setTimeout(() => {
        try {
          osc.disconnect();
          filter.disconnect();
          g.disconnect();
        } catch (e) {}
      }, (duration + when + 0.1) * 1000);
    } catch (e) {
      console.warn("playTone error:", e);
    }
  }

  // Noise burst for "incorrect"
  function playNoisePulse({ duration = 0.18, gain = 0.12, when = 0 } = {}) {
    if (!audioAvailable) return;
    try {
      const ctx = audioContext;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(f);
      f.connect(g);
      g.connect(masterGain);

      const now = ctx.currentTime + when;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      src.start(now);
      src.stop(now + duration + 0.02);
      setTimeout(() => {
        try {
          src.disconnect();
          f.disconnect();
          g.disconnect();
        } catch (e) {}
      }, (duration + when + 0.1) * 1000);
    } catch (e) {
      console.warn("playNoisePulse error:", e);
    }
  }

  // Distinct feedback sounds (richer)
  function playPickSound() {
    if (!audioAvailable) return;
    playTone({ freq: 880, duration: 0.07, type: "triangle", gain: 0.06, filterFreq: 2400 });
    playTone({ freq: 1320, duration: 0.07, type: "sine", gain: 0.04, when: 0.02, filterFreq: 3000 });
  }
  function playPlaceSound() {
    if (!audioAvailable) return;
    playTone({ freq: 660, duration: 0.12, type: "sine", gain: 0.09, filterFreq: 3200 });
    playTone({ freq: 990, duration: 0.12, type: "sine", gain: 0.06, when: 0.06, filterFreq: 3200 });
  }
  function playCorrectSound() {
    if (!audioAvailable) return;
    // small warm triad with rising feel
    playTone({ freq: 520, duration: 0.12, type: "sine", gain: 0.12, filterFreq: 3500 });
    playTone({ freq: 660, duration: 0.12, type: "sine", gain: 0.11, when: 0.09, filterFreq: 4200 });
    playTone({ freq: 880, duration: 0.16, type: "triangle", gain: 0.10, when: 0.18, filterFreq: 4800 });
  }
  function playIncorrectSound() {
    if (!audioAvailable) return;
    playNoisePulse({ duration: 0.22, gain: 0.09 });
    playTone({ freq: 220, duration: 0.2, type: "sawtooth", gain: 0.08, filterFreq: 1200 });
  }

  // Data structures & state (unchanged logic)
  let round = 1;
  let wins = 0;
  let targetNumber = 0;
  let gears = [];
  let slots = [];
  let dragging = null;
  let dragOffset = { x: 0, y: 0 };
  let selectedGearIndex = 0;
  let notification = "";
  let notificationTimer = 0;
  let roundSolved = false;
  let gameOver = false;

  // Decorative particle for subtle celebration (kept visually gentle)
  const particles = [];
  function spawnParticles(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -Math.random() * 2.2 - 0.6,
        life: 60 + Math.floor(Math.random() * 40),
        size: 2 + Math.random() * 3,
        hue: 35 + Math.random() * 40
      });
    }
  }

  // Setup slots
  function setupSlots() {
    slots = [];
    const startX = 160;
    const gap = 120;
    const y = 260;
    for (let i = 0; i < SLOT_COUNT; i++) {
      slots.push({
        x: startX + i * gap,
        y: y,
        r: 34,
        gearIndex: -1
      });
    }
  }

  // Utility: shuffle
  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Start round (do not alter core math)
  function startRound() {
    roundSolved = false;
    notification = "";
    notificationTimer = 0;

    const a = Math.floor(Math.random() * 8) + 1;
    const b = Math.floor(Math.random() * 8) + 1;
    let c = Math.max(1, Math.min(9, Math.floor((a + b) / 2 + Math.random() * 8)));
    let sum = a + b + c;
    if (sum < 6 || sum > 20) {
      sum = Math.floor(6 + Math.random() * 15);
      c = sum - a - b;
      if (c < 1) c = 1 + Math.floor(Math.random() * 6);
      if (c > 9) c = 9;
    }
    const values = [a, b, c];
    targetNumber = values.reduce((s, v) => s + v, 0);
    let decoy = Math.floor(Math.random() * 9) + 1;
    if (values.includes(decoy)) {
      decoy = (decoy % 9) + 1;
    }
    values.push(decoy);
    shuffleArr(values);

    gears = [];
    const startX = 60;
    const baseY = 360;
    const gapX = 120;
    for (let i = 0; i < MAX_GEARS; i++) {
      const gx = startX + i * gapX;
      const gy = baseY + (i % 2 === 0 ? -6 : 6);
      const val = values[i];
      gears.push({
        value: val,
        x: gx,
        y: gy,
        r: 28,
        original: { x: gx, y: gy },
        placed: false,
        slotIndex: -1,
        wobble: Math.random() * Math.PI * 2,
        spin: Math.random() * Math.PI * 2,
        colorHue: 180 + Math.floor(Math.random() * 60)
      });
    }

    setupSlots();
    selectedGearIndex = 0;
    roundSolved = false;
  }

  function resetGame() {
    round = 1;
    wins = 0;
    gameOver = false;
    startRound();
  }

  // Hit detection
  function gearAtPoint(x, y) {
    for (let i = gears.length - 1; i >= 0; i--) {
      const g = gears[i];
      const dx = x - g.x;
      const dy = y - g.y;
      if (Math.sqrt(dx * dx + dy * dy) <= g.r + 6) {
        return i;
      }
    }
    return -1;
  }

  function slotAtPoint(x, y) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const dx = x - s.x;
      const dy = y - s.y;
      if (Math.sqrt(dx * dx + dy * dy) <= s.r + 6) {
        return i;
      }
    }
    return -1;
  }

  // Place gear
  function placeGearInSlot(gearIndex, slotIndex) {
    const gear = gears[gearIndex];
    const slot = slots[slotIndex];
    if (!gear || !slot) return false;
    if (slot.gearIndex !== -1) return false;
    gear.x = slot.x;
    gear.y = slot.y;
    gear.placed = true;
    gear.slotIndex = slotIndex;
    slot.gearIndex = gearIndex;
    // modest pop animation via spawn of particles
    spawnParticles(gear.x, gear.y, 6);
    playPlaceSound();
    checkSolution();
    return true;
  }

  function removeGearFromSlot(slotIndex) {
    const slot = slots[slotIndex];
    if (!slot) return;
    const gi = slot.gearIndex;
    if (gi === -1) return;
    const gear = gears[gi];
    slot.gearIndex = -1;
    gear.placed = false;
    gear.slotIndex = -1;
    // smooth return
    gear.x = gear.original.x;
    gear.y = gear.original.y;
  }

  // Check solution (mechanics intact)
  function checkSolution() {
    for (let s of slots) {
      if (s.gearIndex === -1) return;
    }
    const sum = slots.reduce((acc, s) => acc + gears[s.gearIndex].value, 0);
    if (sum === targetNumber) {
      wins++;
      roundSolved = true;
      notification = "Perfect! Machine fixed.";
      notificationTimer = 160;
      // soft celebration
      spawnParticles(WIDTH / 2, 180, 28);
      playCorrectSound();
      // little pop and wobble
      for (let s of slots) {
        const g = gears[s.gearIndex];
        g.wobble = 0;
        g.spin += 0.6;
      }
      setTimeout(() => {
        round++;
        if (wins >= ROUNDS_TO_WIN) {
          gameOver = true;
          notification = "You win! All machines humming!";
          notificationTimer = 9999;
        } else {
          startRound();
        }
      }, 900);
    } else {
      notification = "Not quite — try again!";
      notificationTimer = 140;
      playIncorrectSound();
      // show a brief hint by shaking slots then unsnap
      setTimeout(() => {
        for (let s = 0; s < slots.length; s++) {
          if (slots[s].gearIndex !== -1) {
            const gi = slots[s].gearIndex;
            gears[gi].x = gears[gi].original.x;
            gears[gi].y = gears[gi].original.y;
            gears[gi].placed = false;
            gears[gi].slotIndex = -1;
            slots[s].gearIndex = -1;
          }
        }
      }, 700);
    }
  }

  // Input handlers (mouse/touch/keyboard)
  canvas.addEventListener("mousedown", async (e) => {
    try {
      await ensureAudioStarted();
      if (audioAvailable) startBackgroundHum();
    } catch (ex) {}
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const gi = gearAtPoint(mx, my);
    if (gi !== -1) {
      dragging = gi;
      const g = gears[gi];
      dragOffset.x = mx - g.x;
      dragOffset.y = my - g.y;
      if (g.placed) {
        const sidx = g.slotIndex;
        if (sidx !== -1) {
          slots[sidx].gearIndex = -1;
        }
        g.placed = false;
        g.slotIndex = -1;
      }
      selectedGearIndex = gi;
      playPickSound();
    } else {
      // speaker toggle region
      const speakerRect = { x: WIDTH - 72, y: 14, w: 56, h: 34 };
      if (
        e.clientX - rect.left >= speakerRect.x &&
        e.clientX - rect.left <= speakerRect.x + speakerRect.w &&
        e.clientY - rect.top >= speakerRect.y &&
        e.clientY - rect.top <= speakerRect.y + speakerRect.h
      ) {
        toggleSound();
      }
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (dragging === null) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const g = gears[dragging];
    // gentle boundary clamp so gears don't go off canvas
    g.x = Math.max(18, Math.min(WIDTH - 18, mx - dragOffset.x));
    g.y = Math.max(18, Math.min(HEIGHT - 18, my - dragOffset.y));
    g.spin += (mx - g.x) * 0.0006;
  });

  canvas.addEventListener("mouseup", (e) => {
    if (dragging === null) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const sidx = slotAtPoint(mx, my);
    if (sidx !== -1) {
      const placed = placeGearInSlot(dragging, sidx);
      if (!placed) {
        const g = gears[dragging];
        g.x = g.original.x;
        g.y = g.original.y;
      }
    } else {
      const g = gears[dragging];
      g.x = g.original.x;
      g.y = g.original.y;
    }
    dragging = null;
  });

  // Touch support mapped to mouse events
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const fakeEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });
    canvas.dispatchEvent(fakeEvent);
  });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const fakeEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });
    canvas.dispatchEvent(fakeEvent);
  });
  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const fakeEvent = new MouseEvent("mouseup", {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: true,
      cancelable: true
    });
    canvas.dispatchEvent(fakeEvent);
  });

  // Keyboard
  canvas.addEventListener("keydown", async (e) => {
    const key = e.key;
    try {
      await ensureAudioStarted();
      if (audioAvailable) startBackgroundHum();
    } catch (ex) {}

    if (gameOver) {
      if (key === " " || key === "Enter") {
        resetGame();
      }
      return;
    }

    if (key === "Tab") {
      e.preventDefault();
      selectedGearIndex = (selectedGearIndex + 1) % gears.length;
      playPickSound();
      return;
    }

    const selectedGear = gears[selectedGearIndex];
    if (!selectedGear) return;

    if (key === "Enter" || key === " ") {
      if (!selectedGear.placed) {
        const emptySlot = slots.findIndex((s) => s.gearIndex === -1);
        if (emptySlot !== -1) {
          placeGearInSlot(selectedGearIndex, emptySlot);
        } else {
          const s0 = slots[0];
          const oldGearIndex = s0.gearIndex;
          if (oldGearIndex !== -1) {
            gears[oldGearIndex].x = gears[oldGearIndex].original.x;
            gears[oldGearIndex].placed = false;
            gears[oldGearIndex].slotIndex = -1;
          }
          placeGearInSlot(selectedGearIndex, 0);
        }
      } else {
        const sidx = selectedGear.slotIndex;
        if (sidx !== -1) {
          removeGearFromSlot(sidx);
        }
      }
      return;
    }

    if (key === "ArrowRight") {
      selectedGearIndex = (selectedGearIndex + 1) % gears.length;
      playPickSound();
      return;
    }
    if (key === "ArrowLeft") {
      selectedGearIndex = (selectedGearIndex - 1 + gears.length) % gears.length;
      playPickSound();
      return;
    }

    if (/^[1-3]$/.test(key)) {
      const slotNumber = parseInt(key, 10) - 1;
      if (!selectedGear.placed) {
        if (slots[slotNumber].gearIndex === -1) {
          placeGearInSlot(selectedGearIndex, slotNumber);
        } else {
          const previousGearIndex = slots[slotNumber].gearIndex;
          removeGearFromSlot(slotNumber);
          placeGearInSlot(selectedGearIndex, slotNumber);
          if (previousGearIndex !== -1) {
            gears[previousGearIndex].x = gears[previousGearIndex].original.x;
          }
        }
      } else {
        if (selectedGear.slotIndex === slotNumber) {
          removeGearFromSlot(slotNumber);
        } else {
          if (slots[slotNumber].gearIndex === -1) {
            const oldSlot = selectedGear.slotIndex;
            if (oldSlot !== -1) {
              slots[oldSlot].gearIndex = -1;
            }
            placeGearInSlot(selectedGearIndex, slotNumber);
          }
        }
      }
      return;
    }

    if (key === "Backspace" || key === "Delete") {
      if (selectedGear.placed) {
        const sidx = selectedGear.slotIndex;
        if (sidx !== -1) removeGearFromSlot(sidx);
      } else {
        selectedGear.x = selectedGear.original.x;
        selectedGear.y = selectedGear.original.y;
        selectedGear.placed = false;
        selectedGear.slotIndex = -1;
      }
      return;
    }

    if (key.toLowerCase() === "h") {
      notification = "Tip: Place three gears so their numbers add to the target. Use Tab to cycle.";
      notificationTimer = 180;
      return;
    }

    if (key.toLowerCase() === "s") {
      toggleSound();
      return;
    }
  });

  // Sound toggle
  let soundEnabled = true;
  function toggleSound() {
    soundEnabled = !soundEnabled;
    if (!soundEnabled) {
      stopBackgroundHum();
    } else {
      ensureAudioStarted().then(() => {
        if (audioAvailable) startBackgroundHum();
      });
    }
    notification = soundEnabled ? "Sound on" : "Sound off";
    notificationTimer = 80;
  }

  // Drawing helpers & improved visuals
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

  // Draw a stylized gear using canvas only
  function drawGear(ctx, x, y, radius, teeth, color, rotation = 0, glossy = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    // outer rim
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // teeth as rectangles along rim (subtle)
    ctx.fillStyle = shadeColor(color, -8);
    for (let i = 0; i < teeth; i++) {
      const ang = (i / teeth) * Math.PI * 2;
      const tx = Math.cos(ang) * (radius - 3);
      const ty = Math.sin(ang) * (radius - 3);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang);
      ctx.fillRect(-2, -radius * 0.12, 4, radius * 0.24);
      ctx.restore();
    }

    // inner disc
    ctx.fillStyle = shadeColor(color, -18);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // glossy highlight
    if (glossy) {
      const g = ctx.createRadialGradient(
        -radius * 0.28,
        -radius * 0.28,
        radius * 0.02,
        -radius * 0.12,
        -radius * 0.12,
        radius * 0.9
      );
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(0.7, "rgba(255,255,255,0.06)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // center hole
    ctx.fillStyle = "#1b2b33";
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Simple color shading utility
  function shadeColor(hexOrHsl, percent) {
    // Accept color as hex or hsl string; for simplicity handle hex and hsl-ish
    if (typeof hexOrHsl === "string" && hexOrHsl[0] === "#") {
      const hex = hexOrHsl.replace("#", "");
      const num = parseInt(hex, 16);
      let r = (num >> 16) + Math.round((percent / 100) * 255);
      let g = ((num >> 8) & 0x00ff) + Math.round((percent / 100) * 255);
      let b = (num & 0x0000ff) + Math.round((percent / 100) * 255);
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      return `rgb(${r},${g},${b})`;
    }
    // If passed an HSL-like hue number, convert to a pleasant pastel HSL string
    if (typeof hexOrHsl === "number") {
      const h = Math.round(hexOrHsl);
      const l = 62 + percent / 2;
      return `hsl(${h} 65% ${Math.max(28, Math.min(80, l))}%)`;
    }
    // fallback
    return hexOrHsl;
  }

  // Draw subtle background with clouds and soft spotlight
  function drawBackground(frame) {
    // sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, "#f9fcff");
    grad.addColorStop(1, "#eaf6fb");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft radial spotlight behind machine center
    const rg = ctx.createRadialGradient(WIDTH / 2, 160, 20, WIDTH / 2, 160, 420);
    rg.addColorStop(0, "rgba(255,255,255,0.7)");
    rg.addColorStop(0.6, "rgba(230,245,255,0.35)");
    rg.addColorStop(1, "rgba(230,245,255,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // very subtle parallax clouds
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const cloudBaseY = 50;
    for (let i = 0; i < 4; i++) {
      const cx = ((frame * 0.3 + i * 180) % (WIDTH + 200)) - 100;
      const cy = cloudBaseY + Math.sin((i + frame * 0.005) * 0.8) * 8;
      drawCloud(cx, cy, 80 + (i % 2) * 16, 28);
    }
  }

  function drawCloud(cx, cy, w, h) {
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.3, cy, h * 0.8, h * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy - 6, h * 1.2, h * 0.9, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.3, cy, h * 0.9, h * 0.7, 0, 0, Math.PI * 2);
    ctx.rect(cx - w * 0.6, cy, w * 1.2, h * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  // Machine body & friendly robot
  function drawMachineBackground() {
    // central machine body
    ctx.fillStyle = "#d6eef8";
    drawRoundedRect(ctx, 120, 120, 480, 180, 16);

    // decorative stripes
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? "#eaf7fc" : "#cfeaf4";
      ctx.fillRect(140 + i * 44, 140, 28, 10);
    }

    // pipes with subtle metallic gradient
    const pipeGrad = ctx.createLinearGradient(90, 160, 140, 210);
    pipeGrad.addColorStop(0, "#b7dbe6");
    pipeGrad.addColorStop(1, "#eaf7fb");
    ctx.fillStyle = pipeGrad;
    drawRoundedRect(ctx, 90, 170, 40, 60, 8);
    drawRoundedRect(ctx, 560, 170, 40, 60, 8);

    // friendly robot character on left
    drawFriendlyRobot(140, 210);
    // label
    ctx.fillStyle = "#0f3142";
    ctx.font = "14px system-ui, Arial";
    ctx.fillText("Friendly Factory Machine", 320, 140);
  }

  function drawFriendlyRobot(x, y) {
    // body
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#d1f0ef";
    drawRoundedRect(ctx, -36, -48, 72, 72, 10);
    // face panel
    ctx.fillStyle = "#0e3640";
    drawRoundedRect(ctx, -22, -30, 44, 28, 6);
    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-10, -18, 5, 0, Math.PI * 2);
    ctx.arc(10, -18, 5, 0, Math.PI * 2);
    ctx.fill();
    // pupils
    ctx.fillStyle = "#0b2630";
    ctx.beginPath();
    ctx.arc(-10, -18, 2, 0, Math.PI * 2);
    ctx.arc(10, -18, 2, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -8, 8, 0.1, Math.PI - 0.1);
    ctx.stroke();
    ctx.restore();
  }

  // Animated machine gears
  function drawMachineGears(frame) {
    const cx = 360;
    const cy = 200;
    const gearPositions = [
      { x: cx - 80, y: cy - 10, r: 18, speed: 0.02, hue: 28 },
      { x: cx - 10, y: cy + 20, r: 12, speed: -0.03, hue: 160 },
      { x: cx + 60, y: cy - 6, r: 22, speed: 0.015, hue: 48 }
    ];
    for (let i = 0; i < gearPositions.length; i++) {
      const p = gearPositions[i];
      const rot = frame * p.speed;
      drawGear(ctx, p.x, p.y, p.r, 8 + i, `hsl(${p.hue} 65% 62%)`, rot);
    }
  }

  // Draw speaker icon
  function drawSpeakerIcon() {
    const x = WIDTH - 72;
    const y = 14;
    ctx.fillStyle = soundEnabled ? "#1f6b85" : "#6f8792";
    drawRoundedRect(ctx, x, y, 56, 34, 8);
    ctx.save();
    ctx.translate(x + 14, y + 17);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(0, -8);
    ctx.lineTo(8, -2);
    ctx.lineTo(8, 2);
    ctx.lineTo(0, 8);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    if (soundEnabled) {
      ctx.beginPath();
      ctx.arc(10, 0, 8, -0.62, 0.62);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(10, 0, 12, -0.62, 0.62);
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.lineTo(14, 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Main draw loop
  let frame = 0;
  function draw() {
    frame++;

    // background
    drawBackground(frame);

    // top header panel
    ctx.fillStyle = "#e8f6fb";
    drawRoundedRect(ctx, 16, 12, WIDTH - 32, 88, 12);

    // Title
    ctx.fillStyle = "#0f3746";
    ctx.font = "600 22px system-ui, Arial";
    ctx.textAlign = "left";
    ctx.fillText("Machine Math — Fix the Friendly Factory", 36, 42);

    // Round and instructions
    ctx.font = "13px system-ui, Arial";
    ctx.fillStyle = "#0f4960";
    ctx.fillText(`Round ${round} of ${ROUNDS_TO_WIN}`, 36, 66);
    ctx.fillStyle = "#1a5f77";
    ctx.font = "12px system-ui, Arial";
    ctx.fillText("Drag gears into the slots so their numbers add to the target.", 36, 86);

    // Target panel with subtle depth
    ctx.save();
    const tx = WIDTH - 220;
    const ty = 24;
    ctx.fillStyle = "white";
    drawRoundedRect(ctx, tx, ty, 180, 72, 10);
    ctx.fillStyle = "#0f3b51";
    ctx.font = "13px system-ui, Arial";
    ctx.fillText("Target", tx + 16, ty + 22);
    ctx.font = "700 36px system-ui, Arial";
    ctx.fillStyle = "#082a3a";
    ctx.textAlign = "center";
    ctx.fillText(String(targetNumber), tx + 90, ty + 64);
    ctx.restore();
    ctx.textAlign = "left";

    // Draw machine & decorations
    drawMachineBackground();

    // Draw slots with soft shadows and subtle glow if empty
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      // outer panel
      ctx.save();
      ctx.shadowColor = "rgba(14,38,48,0.12)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#e9f8ff";
      drawRoundedRect(ctx, s.x - 46, s.y - 46, 92, 92, 12);
      ctx.restore();

      // slot inner ring
      ctx.fillStyle = "#f1fbff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r + 6, 0, Math.PI * 2);
      ctx.fill();

      // if empty, soft glow
      if (s.gearIndex === -1) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + 12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(30,110,140,0.03)";
        ctx.fill();
      }

      // slot label
      ctx.fillStyle = "#1b4d64";
      ctx.font = "600 13px system-ui, Arial";
      ctx.fillText(`Slot ${i + 1}`, s.x - 24, s.y + 52);
    }

    // Conveyor belt
    ctx.save();
    // belt base
    ctx.fillStyle = "#213843";
    drawRoundedRect(ctx, 18, 320, 420, 120, 18);
    // moving dots for subtle motion
    for (let i = 0; i < 12; i++) {
      const bx = 36 + ((i * 40 + frame * 0.6) % 460) - 20;
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(bx, 348, 28, 6);
    }
    ctx.restore();

    // Draw draggable gears
    for (let i = 0; i < gears.length; i++) {
      const g = gears[i];
      g.wobble += 0.04;
      g.spin += 0.02 + (g.placed ? 0.02 : 0);
      const rot = g.spin + Math.sin(g.wobble) * 0.02;
      const hue = g.colorHue || 200;
      const color = `hsl(${hue} 65% 62%)`;
      // selected highlight
      if (i === selectedGearIndex) {
        ctx.save();
        ctx.shadowColor = "rgba(30,120,160,0.28)";
        ctx.shadowBlur = 18;
      }
      drawGear(ctx, g.x, g.y, g.r, 10, color, rot, true);
      ctx.fillStyle = "#052b36";
      ctx.font = "700 16px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.fillText(String(g.value), g.x, g.y + 6);
      if (i === selectedGearIndex) ctx.restore();
    }

    // Small animated gears inside machine
    drawMachineGears(frame);

    // Particles update & draw (gentle)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life--;
      const alpha = Math.max(0, p.life / 80);
      ctx.fillStyle = `hsla(${p.hue} 80% 56% / ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (alpha * 0.9 + 0.1), 0, Math.PI * 2);
      ctx.fill();
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Notification
    if (notificationTimer > 0) {
      notificationTimer--;
      ctx.globalAlpha = Math.min(1, notificationTimer / 80);
      ctx.fillStyle = "#fff7d6";
      drawRoundedRect(ctx, WIDTH / 2 - 180, 12 + 88, 360, 36, 10);
      ctx.fillStyle = "#243b4a";
      ctx.font = "600 15px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.fillText(notification, WIDTH / 2, 140);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }

    // Speaker
    drawSpeakerIcon();

    // If game over overlay
    if (gameOver) {
      ctx.fillStyle = "rgba(4,20,28,0.6)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#fffdf6";
      ctx.font = "700 28px system-ui, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Hooray! You fixed all the machines!", WIDTH / 2, HEIGHT / 2 - 12);
      ctx.font = "16px system-ui, Arial";
      ctx.fillText("Press Space or Enter to play again.", WIDTH / 2, HEIGHT / 2 + 24);
      ctx.textAlign = "left";
    }

    requestAnimationFrame(draw);
  }

  // Start game
  resetGame();
  requestAnimationFrame(draw);

  // Resume ambience on user gesture (robust)
  function resumeAudioOnGesture() {
    if (!audioAvailable || !audioContext) return;
    const resume = async () => {
      try {
        await audioContext.resume();
        if (soundEnabled) startBackgroundHum();
      } catch (e) {
        // ignore
      } finally {
        window.removeEventListener("click", resume);
        window.removeEventListener("keydown", resume);
      }
    };
    window.addEventListener("click", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }
  resumeAudioOnGesture();

  // Hidden help for screen readers
  const srHelp = document.createElement("div");
  srHelp.style.position = "absolute";
  srHelp.style.left = "-9999px";
  srHelp.style.width = "1px";
  srHelp.style.height = "1px";
  srHelp.style.overflow = "hidden";
  srHelp.setAttribute("aria-hidden", "false");
  srHelp.innerText =
    "Machine Math: Place three gears so the sum equals the target number. Use mouse or touch to drag. Use Tab to cycle gears, Enter to place/remove. Press S to toggle sound. Press H for a tip.";
  container.appendChild(srHelp);

  // Expose small API
  window._machineMath = {
    restart: resetGame,
    toggleSound: toggleSound,
    isSoundEnabled: () => soundEnabled,
    currentTarget: () => targetNumber
  };
})();