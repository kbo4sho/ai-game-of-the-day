(() => {
  // Machine Math — enhanced visuals & audio
  // Renders inside element with ID "game-of-the-day-stage".
  // All visuals drawn on canvas. Sounds generated with Web Audio API.

  // Config
  const WIDTH = 720;
  const HEIGHT = 480;
  const STAGE_ID = "game-of-the-day-stage";
  const MAX_LEVEL = 6;
  const LIVES = 3;

  // Grab stage element
  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error(`Missing container element with id "${STAGE_ID}"`);
    return;
  }
  stage.innerHTML = "";

  // Accessible live region for screen readers
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("role", "status");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  liveRegion.style.width = "1px";
  liveRegion.style.height = "1px";
  stage.appendChild(liveRegion);

  // Canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  canvas.style.display = "block";
  canvas.setAttribute(
    "aria-label",
    "Machine Math. Use arrow keys to pick parts and Enter to feed the machine."
  );
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  canvas.focus();

  // Audio setup
  let audioCtx = null;
  let masterGain = null;
  let bgGainNode = null;
  let bgHumOsc = null;
  let audioEnabled = true;
  let isAudioAllowed = false;

  // Safe creation of AudioContext with feature detection and error handling
  function createAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("No AudioContext available");
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioCtx.destination);

      // gentle master lowpass to keep sound warm
      const masterFilter = audioCtx.createBiquadFilter();
      masterFilter.type = "lowpass";
      masterFilter.frequency.value = 16000;
      masterGain.disconnect();
      masterGain.connect(masterFilter);
      masterFilter.connect(audioCtx.destination);

      bgGainNode = audioCtx.createGain();
      bgGainNode.gain.value = 0.02;
      bgGainNode.connect(masterGain);
    } catch (err) {
      audioCtx = null;
      console.warn("Web Audio not available:", err);
      liveAnnounce("Audio is not available in this browser.");
    }
    return audioCtx;
  }

  // Resume audio on user gesture
  async function tryResumeAudio() {
    try {
      createAudioContext();
      if (!audioCtx) return;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      isAudioAllowed = true;
      if (audioEnabled) startBackgroundHum();
      liveAnnounce("Audio enabled.");
    } catch (e) {
      console.warn("Audio resume failed", e);
      liveAnnounce("Unable to enable audio.");
    }
  }

  // Helper: create a short envelope-controlled oscillator
  function playTone({
    freq = 440,
    type = "sine",
    attack = 0.01,
    decay = 0.12,
    sustain = 0.001,
    gain = 0.03,
    detune = 0,
    filterFreq = null,
    pan = null,
  } = {}) {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;

      // optional filter for color
      let outNode = g;
      if (filterFreq) {
        const f = audioCtx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = filterFreq;
        o.connect(f);
        f.connect(g);
      } else {
        o.connect(g);
      }

      // optional stereo panner
      if (pan && audioCtx.createStereoPanner) {
        const p = audioCtx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        p.connect(masterGain);
      } else {
        g.connect(masterGain);
      }

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + attack);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), now + attack + decay);

      o.start(now);
      o.stop(now + attack + decay + 0.05);
    } catch (err) {
      console.warn("playTone error", err);
    }
  }

  // Click: bright, short pluck with slight detune for charm
  function playClick() {
    if (!audioCtx || !audioEnabled) return;
    try {
      playTone({
        freq: 880,
        type: "sine",
        attack: 0.005,
        decay: 0.12,
        gain: 0.02,
        detune: 10,
        filterFreq: 4000,
      });
      // subtle low companion
      playTone({
        freq: 220,
        type: "triangle",
        attack: 0.005,
        decay: 0.16,
        gain: 0.006,
        detune: -6,
        filterFreq: 1200,
        pan: -0.2,
      });
    } catch (e) {
      console.warn("playClick error", e);
    }
  }

  // Wrong: brief downward sweep with warm noise-ish feel
  function playWrong() {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();

      o.type = "sawtooth";
      o.frequency.setValueAtTime(360, now);
      o.frequency.exponentialRampToValueAtTime(160, now + 0.36);

      f.type = "lowpass";
      f.frequency.value = 1200;

      o.connect(f);
      f.connect(g);
      g.connect(masterGain);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

      o.start(now);
      o.stop(now + 0.62);
    } catch (err) {
      console.warn("playWrong error", err);
    }
  }

  // Success: gentle arpeggio with three tones and soft bell filter
  function playSuccess() {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [660, 880, 1100];
      freqs.forEach((f, i) => {
        const delay = i * 0.06;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        o.type = i === 1 ? "triangle" : "sine";
        o.frequency.value = f;
        filter.type = "highshelf";
        filter.frequency.value = 1200;
        filter.gain.value = 3;
        o.connect(filter);
        filter.connect(g);
        g.connect(masterGain);
        g.gain.setValueAtTime(0.0001, now + delay);
        g.gain.exponentialRampToValueAtTime(0.04, now + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.7);
        o.start(now + delay);
        o.stop(now + delay + 0.72);
      });
    } catch (err) {
      console.warn("playSuccess error", err);
    }
  }

  // Background hum: two slow oscillators with drifting filter + LFO for movement
  function startBackgroundHum() {
    if (!audioCtx || !audioEnabled) return;
    if (bgHumOsc) return; // already running
    try {
      const o1 = audioCtx.createOscillator();
      const o2 = audioCtx.createOscillator();
      const g1 = audioCtx.createGain();
      const g2 = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();

      o1.type = "sine";
      o1.frequency.value = 50 + Math.random() * 6; // low gentle
      o2.type = "sine";
      o2.frequency.value = 79 + Math.random() * 8;
      g1.gain.value = 0.01;
      g2.gain.value = 0.008;

      filter.type = "lowpass";
      filter.frequency.value = 1200;
      filter.Q.value = 0.8;

      // LFO to drift filter frequency slowly
      lfo.type = "sine";
      lfo.frequency.value = 0.06 + Math.random() * 0.03;
      lfoGain.gain.value = 300;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      o1.connect(filter);
      o2.connect(filter);
      filter.connect(bgGainNode);

      try {
        o1.start();
        o2.start();
        lfo.start();
      } catch (e) {
        // ignore if already started
      }

      bgHumOsc = { o1, o2, lfo, filter, g1, g2 };
    } catch (err) {
      console.warn("startBackgroundHum error", err);
    }
  }

  function stopBackgroundHum() {
    if (!bgHumOsc) return;
    try {
      try {
        bgHumOsc.o1.stop();
      } catch (e) {}
      try {
        bgHumOsc.o2.stop();
      } catch (e) {}
      try {
        bgHumOsc.lfo.stop();
      } catch (e) {}
      try {
        bgHumOsc.o1.disconnect();
      } catch (e) {}
      try {
        bgHumOsc.o2.disconnect();
      } catch (e) {}
      try {
        bgHumOsc.lfo.disconnect();
      } catch (e) {}
      try {
        bgHumOsc.filter.disconnect();
      } catch (e) {}
      bgHumOsc = null;
    } catch (err) {
      console.warn("stopBackgroundHum error", err);
    }
  }

  // Utility: announce to screen reader
  function liveAnnounce(text) {
    liveRegion.innerText = text;
  }

  // Game state
  const state = {
    level: 1,
    lives: LIVES,
    target: 10,
    currentSum: 0,
    parts: [],
    selectorIndex: 0,
    animParticles: [],
    gameOver: false,
    levelComplete: false,
    paused: false,
    ticks: 0,
    audioOn: true,
  };

  // Create levels (kept logic intact) — we add original pos tracking for nicer animations
  function generateLevel(level) {
    state.currentSum = 0;
    state.level = level;
    state.gameOver = false;
    state.levelComplete = false;
    state.ticks = 0;

    const base = 5 + level * 2;
    const target = base + Math.floor(Math.random() * 6);
    state.target = Math.max(5, Math.min(20, target));

    const comboLen = Math.random() < 0.5 ? 2 : 3;
    const combo = [];
    let rem = state.target;
    for (let i = comboLen - 1; i >= 0; i--) {
      const maxVal = Math.max(1, rem - i);
      const val = Math.floor(Math.random() * Math.min(6 + level, maxVal)) + 1;
      combo.push(val);
      rem -= val;
    }
    if (rem > 0) combo[0] += rem;

    const parts = [];
    let idCounter = 0;
    for (const v of combo) {
      parts.push({ value: v, id: idCounter++, picked: false });
    }
    while (parts.length < 5) {
      const v = Math.floor(Math.random() * (6 + level)) + 1;
      parts.push({ value: v, id: idCounter++, picked: false });
    }
    for (let i = parts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }
    const startY = HEIGHT - 120;
    const spacing = 120;
    const startX = WIDTH / 2 - (parts.length - 1) * spacing / 2;
    parts.forEach((p, i) => {
      p.x = startX + i * spacing;
      p.y = startY + Math.sin(i) * 6;
      p.origX = p.x;
      p.origY = p.y;
      p.offset = 0;
      p.faceOffset = Math.random() * Math.PI * 2;
      p.pickAnimProgress = 0; // used for graceful pick animation
    });

    state.parts = parts;
    state.selectorIndex = 0;
    liveAnnounce(`Level ${state.level}. Target ${state.target}. You have ${state.lives} lives.`);
  }

  // Palette updated for calm, friendly tones
  const palette = {
    skyTop: "#E8F8FF",
    skyBottom: "#F5FBF8",
    machine: "#7FD3D9",
    accent: "#FFCFBD",
    metal: "#E6EEF2",
    bolt: "#FFD27F",
    text: "#10202A",
    cloud: "#FFFFFF",
    shadow: "rgba(16,32,42,0.14)",
    conveyor: "#5B5E60",
    partBody: "#FFE9B8",
  };

  // Rounded rect helper
  function drawRoundedRect(x, y, w, h, r, fillStyle, strokeStyle) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    }
  }

  // Render loop
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, palette.skyTop);
    g.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Subtle decorative backdrop shapes (soft nodes)
    drawSoftOrbs();

    // Hills
    ctx.fillStyle = "#E8F7EE";
    ctx.beginPath();
    ctx.ellipse(140, 420, 180, 70, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(540, 440, 200, 90, 0, 0, Math.PI * 2);
    ctx.fill();

    // Playful clouds
    drawCloud(100, 70, 110, 56, 0.95);
    drawCloud(480, 60, 150, 66, 0.85);
    drawCloud(320, 120, 140, 58, 0.9);

    // Conveyor and machine
    drawConveyor();
    drawMachine();

    // Parts
    for (let i = 0; i < state.parts.length; i++) {
      drawPart(state.parts[i], i === state.selectorIndex);
    }

    // Display and HUD
    drawDisplay();
    drawHUD();

    // Audio icon
    drawAudioIcon(650, 20);

    // Instructions
    ctx.fillStyle = palette.text;
    ctx.font = "13px Inter, Arial";
    ctx.fillText(
      "← → Move • Enter / Space Feed • 1-5 pick • M mute • R restart",
      14,
      HEIGHT - 12
    );

    // Particles
    renderParticles();

    // Overlays
    if (state.paused) {
      ctx.fillStyle = "rgba(12,18,22,0.55)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#FFF";
      ctx.font = "28px Inter, Arial";
      ctx.fillText("Paused", WIDTH / 2 - 44, HEIGHT / 2 - 10);
    }

    if (state.levelComplete) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      drawRoundedRect(WIDTH / 2 - 184, HEIGHT / 2 - 96, 368, 192, 16, "rgba(255,255,255,0.98)");
      ctx.fillStyle = "#113";
      ctx.font = "26px Inter, Arial";
      ctx.fillText(`Level ${state.level} Complete!`, WIDTH / 2 - 120, HEIGHT / 2 - 10);
      ctx.font = "18px Inter, Arial";
      ctx.fillText("Press Enter to continue", WIDTH / 2 - 100, HEIGHT / 2 + 26);
    }

    if (state.gameOver) {
      ctx.fillStyle = "rgba(2,6,10,0.6)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#FFF";
      ctx.font = "30px Inter, Arial";
      ctx.fillText("Game Over", WIDTH / 2 - 84, HEIGHT / 2 - 10);
      ctx.font = "16px Inter, Arial";
      ctx.fillText("Press R to try again.", WIDTH / 2 - 70, HEIGHT / 2 + 26);
    }
  }

  // Soft decorative orbs in background for depth (subtle)
  function drawSoftOrbs() {
    const p = [
      { x: 560, y: 80, r: 42, a: 0.06, c: "#CFF7FF" },
      { x: 220, y: 48, r: 36, a: 0.06, c: "#EFEFFF" },
      { x: 400, y: 150, r: 28, a: 0.05, c: "#E7FFF4" },
    ];
    p.forEach((o) => {
      ctx.save();
      ctx.globalAlpha = o.a;
      const rg = ctx.createRadialGradient(o.x, o.y, 5, o.x, o.y, o.r);
      rg.addColorStop(0, o.c);
      rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawCloud(x, y, w, h, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.cloud;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.3, y - 10, w * 0.3, h * 0.35, 0, 0, Math.PI * 2);
    ctx.ellipse(x - w * 0.35, y - 8, w * 0.28, h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw machine with friendly face; eyes track selected part x position
  function drawMachine() {
    // Body gradient
    const bx = 120,
      by = 80,
      bw = 480,
      bh = 220;
    const bodyG = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    bodyG.addColorStop(0, "#9CE1E8");
    bodyG.addColorStop(1, "#77C9D0");
    drawRoundedRect(bx, by, bw, bh, 18, bodyG);

    // Front panel
    drawRoundedRect(160, 140, 400, 120, 12, palette.metal);
    // Gears that rotate
    drawGear(230, 200, 40, 8, "#E6A6FF", 0.03 * state.ticks);
    drawGear(370, 175, 56, 10, "#BFD8FF", -0.02 * state.ticks);
    drawGear(500, 205, 30, 6, "#FFD7A6", 0.05 * state.ticks);

    // Robot face on left of panel
    const faceX = 260;
    const faceY = 170;
    ctx.save();
    ctx.translate(faceX, faceY);
    // body plate
    drawRoundedRect(-58, -42, 116, 84, 12, "#F3FBFD");
    // eyes that follow selector
    const sel = state.parts[state.selectorIndex];
    let gazeX = 0;
    if (sel) {
      // map part x to relative -12..12
      gazeX = Math.max(-12, Math.min(12, ((sel.origX - WIDTH / 2) / (WIDTH / 2)) * 24));
    }
    // left eye
    ctx.fillStyle = "#21323A";
    ctx.beginPath();
    ctx.ellipse(-18 + gazeX * 0.2, -6, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-14 + gazeX * 0.25, -8, 3.2, 0, Math.PI * 2);
    ctx.fill();
    // right eye
    ctx.fillStyle = "#21323A";
    ctx.beginPath();
    ctx.ellipse(18 + gazeX * 0.2, -6, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(22 + gazeX * 0.25, -8, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // smiling mouth
    ctx.strokeStyle = "#1B2430";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, 12);
    ctx.quadraticCurveTo(0, 22, 22, 12);
    ctx.stroke();

    ctx.restore();

    // pipe and nozzle
    ctx.fillStyle = "#8FB3A8";
    ctx.fillRect(520, 170, 92, 18);
    ctx.beginPath();
    ctx.moveTo(612, 170);
    ctx.lineTo(640, 150);
    ctx.lineTo(640, 188);
    ctx.closePath();
    ctx.fill();

    // gentle steam puffs animated
    for (let i = 0; i < 3; i++) {
      const a = Math.sin((state.ticks / 60) + i * 0.6) * 4;
      ctx.globalAlpha = 0.45 + i * -0.08;
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.ellipse(
        540 + i * 18,
        90 - ((state.ticks + i * 12) % 60) * 0.4 - a,
        18 + i * 2,
        10 + i * 3,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawGear(cx, cy, r, teeth, color, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation || 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const angle = (i / (teeth * 2)) * Math.PI * 2;
      const rad = i % 2 === 0 ? r : r * 0.74;
      ctx.lineTo(Math.cos(angle) * rad, Math.sin(angle) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawConveyor() {
    const beltY = HEIGHT - 140;
    // belt base with gradient
    const beltG = ctx.createLinearGradient(0, beltY - 24, 0, beltY + 24);
    beltG.addColorStop(0, "#6e7374");
    beltG.addColorStop(1, "#57595b");
    drawRoundedRect(40, beltY - 24, WIDTH - 80, 48, 12, beltG);
    // moving stripes (animated)
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    const offset = (state.ticks % 60) - 60;
    for (let i = -2; i < 20; i++) {
      ctx.save();
      ctx.translate(60 + i * 40 + offset * 0.6, beltY);
      ctx.rotate(-0.25);
      ctx.fillRect(-8, -10, 18, 20);
      ctx.restore();
    }
    // receiving tray
    drawRoundedRect(560, beltY - 64, 120, 64, 10, "#DFEEF6");
    // subtle highlight
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(562, beltY - 62, 116, 60);
  }

  // Draw individual part with expressions, glowing aura, and pick animation
  function drawPart(part, isSelected) {
    // wobble & bob
    part.offset += 0.03;
    const bob = Math.sin(part.offset + part.faceOffset) * 6;
    const baseX = part.origX;
    const baseY = part.origY + bob;

    // If picked, animate toward machine nozzle
    const nozzleX = 626;
    const nozzleY = 170;
    let displayX = baseX;
    let displayY = baseY;
    if (part.picked) {
      // initialize progress if needed
      if (typeof part.pickAnimProgress !== "number") part.pickAnimProgress = 0;
      // advance progress smoothly
      part.pickAnimProgress = Math.min(1, (part.pickAnimProgress || 0) + 0.045);
      const t = easeOutCubic(part.pickAnimProgress);
      displayX = lerp(baseX, nozzleX, t);
      displayY = lerp(baseY, nozzleY - 6, t) - (1 - t) * 6;
    } else {
      // slowly return progress when unpicked
      part.pickAnimProgress = Math.max(0, (part.pickAnimProgress || 0) - 0.02);
    }

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.beginPath();
    ctx.ellipse(
      displayX,
      displayY + 36,
      36 * (1 - (part.pickAnimProgress || 0) * 0.6),
      12,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Glow aura if selected
    if (isSelected && !part.picked) {
      const glowG = ctx.createRadialGradient(displayX, displayY, 6, displayX, displayY, 60);
      glowG.addColorStop(0, "rgba(59,130,246,0.18)");
      glowG.addColorStop(1, "rgba(59,130,246,0)");
      ctx.fillStyle = glowG;
      ctx.beginPath();
      ctx.arc(displayX, displayY, 60, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body
    drawRoundedRect(displayX - 36, displayY - 28, 72, 56, 12, palette.partBody);

    // expressive eyes that blink slightly and look around
    ctx.fillStyle = "#3b3b3b";
    const eyeOffset = Math.sin(state.ticks / 30 + part.faceOffset) * 2;
    ctx.beginPath();
    ctx.arc(displayX - 12 + eyeOffset * 0.6, displayY - 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(displayX + 12 + eyeOffset * 0.6, displayY - 6, 4, 0, Math.PI * 2);
    ctx.fill();

    // mouth smiles or worried if picked incorrectly
    ctx.strokeStyle = "#3b3b3b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (part.picked) {
      ctx.moveTo(displayX - 6, displayY + 6);
      ctx.quadraticCurveTo(displayX, displayY + 12, displayX + 6, displayY + 6);
    } else {
      ctx.moveTo(displayX - 8, displayY + 6);
      ctx.quadraticCurveTo(displayX, displayY + 10, displayX + 8, displayY + 6);
    }
    ctx.stroke();
    ctx.lineWidth = 1;

    // value label
    ctx.fillStyle = palette.text;
    ctx.font = "20px Inter, Arial";
    ctx.fillText(String(part.value), displayX - 6, displayY + 6);

    // selection ring
    if (isSelected && !part.picked) {
      ctx.strokeStyle = "#3B82F6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(displayX, displayY, 48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // If pick just happened, produce a one-off particle burst (already handled elsewhere)
    if (part.picked && part.pickAnimProgress < 0.2) {
      createParticles(displayX, displayY - 10, 6, palette.accent);
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Particle system
  function createParticles(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      state.animParticles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 2.2,
        vy: -Math.random() * 2.6 - 0.6,
        life: 28 + Math.random() * 20,
        color,
        r: 2 + Math.random() * 3,
      });
    }
  }

  function renderParticles() {
    for (let i = state.animParticles.length - 1; i >= 0; i--) {
      const p = state.animParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life--;
      if (p.life <= 0) {
        state.animParticles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life / 60);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawDisplay() {
    const sx = 210;
    const sy = 110;
    const sw = 300;
    const sh = 80;
    drawRoundedRect(sx, sy, sw, sh, 8, "#071A2B");

    // TARGET
    ctx.fillStyle = "#A6F0C3";
    ctx.font = "26px Inter, Arial";
    ctx.fillText("TARGET:", sx + 18, sy + 30);
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 34px Inter, Arial";
    ctx.fillText(String(state.target), sx + 150, sy + 30);

    // SUM
    ctx.fillStyle = "#FFD9A6";
    ctx.font = "22px Inter, Arial";
    ctx.fillText("SUM:", sx + 18, sy + 64);
    ctx.fillStyle = "#FFF";
    ctx.font = "24px Inter, Arial";
    ctx.fillText(String(state.currentSum), sx + 150, sy + 64);

    // Progress meter with soft glow
    const meterX = sx + sw + 12;
    const meterY = sy + 12;
    const meterW = 26;
    const meterH = sh - 24;
    const pct = Math.min(1, state.currentSum / Math.max(1, state.target));
    // background
    ctx.fillStyle = "#092726";
    drawRoundedRect(meterX - 2, meterY - 2, meterW + 4, meterH + 4, 6, "rgba(0,0,0,0.18)");
    // fill
    const fg = ctx.createLinearGradient(meterX, meterY, meterX, meterY + meterH);
    fg.addColorStop(0, "#81F0C5");
    fg.addColorStop(1, "#2B8F74");
    ctx.fillStyle = fg;
    ctx.fillRect(meterX, meterY + meterH * (1 - pct), meterW, meterH * pct);
    // frame
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(meterX, meterY, meterW, meterH);
  }

  function drawHUD() {
    // Hearts
    const heartX = 18;
    const heartY = 18;
    for (let i = 0; i < LIVES; i++) {
      drawHeart(heartX + i * 28, heartY, i < state.lives ? "#FF6B6B" : "#F0CFCF");
    }
    ctx.fillStyle = palette.text;
    ctx.font = "18px Inter, Arial";
    ctx.fillText(`Level ${state.level} / ${MAX_LEVEL}`, 110, 32);
  }

  function drawHeart(x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.bezierCurveTo(x, y - 6, x + 18, y - 6, x + 18, y + 4);
    ctx.bezierCurveTo(x + 18, y + 22, x + 9, y + 28, x, y + 36);
    ctx.bezierCurveTo(x - 9, y + 28, x - 18, y + 22, x - 18, y + 4);
    ctx.bezierCurveTo(x - 18, y - 6, x - 9, y - 6, x, y + 4);
    ctx.fill();
  }

  function drawAudioIcon(x, y) {
    ctx.save();
    ctx.translate(x, y);
    // speaker
    ctx.fillStyle = audioEnabled ? "#2b2b2b" : "#B7BEC6";
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(0, -8);
    ctx.lineTo(10, -8);
    ctx.lineTo(18, -16);
    ctx.lineTo(18, 16);
    ctx.lineTo(10, 8);
    ctx.closePath();
    ctx.fill();

    // animated bars when audio enabled
    if (audioEnabled) {
      const barCount = 3;
      for (let i = 0; i < barCount; i++) {
        const h = 6 + Math.abs(Math.sin(state.ticks / 40 + i * 0.9)) * 12;
        const alpha = 0.5 + Math.abs(Math.sin(state.ticks / 24 + i)) * 0.5;
        ctx.fillStyle = `rgba(59,130,246,${alpha})`;
        ctx.fillRect(22 + i * 8, -h / 2, 6, h);
      }
    } else {
      ctx.strokeStyle = "#FAFAFA";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, -14);
      ctx.lineTo(38, 4);
      ctx.moveTo(22, 4);
      ctx.lineTo(38, -14);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.restore();
  }

  // Input handling
  function onKeyDown(e) {
    tryResumeAudio();
    if (state.gameOver) {
      if (e.key === "r" || e.key === "R") {
        restartGame();
      }
      return;
    }
    if (state.levelComplete) {
      if (e.key === "Enter" || e.key === " ") {
        nextLevel();
      }
      return;
    }
    if (e.key === "m" || e.key === "M") {
      toggleAudio();
      return;
    }
    if (e.key === "p" || e.key === "P") {
      state.paused = !state.paused;
      liveAnnounce(state.paused ? "Game paused" : "Game resumed");
      return;
    }
    if (state.paused) return;

    if (e.key === "ArrowLeft") {
      state.selectorIndex = Math.max(0, state.selectorIndex - 1);
      playClick();
    } else if (e.key === "ArrowRight") {
      state.selectorIndex = Math.min(state.parts.length - 1, state.selectorIndex + 1);
      playClick();
    } else if (e.key === "Enter" || e.key === " ") {
      pickPart(state.selectorIndex);
    } else if (/^[1-5]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < state.parts.length) {
        state.selectorIndex = idx;
        pickPart(idx);
      }
    } else if (e.key === "r" || e.key === "R") {
      restartGame();
    }
  }

  // Mouse/touch handling
  function onMouseDown(e) {
    tryResumeAudio();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // audio icon hit
    if (mx >= 650 && my <= 40) {
      toggleAudio();
      return;
    }
    // pick nearest part
    let nearestIdx = -1;
    let nearestDist = 1e9;
    for (let i = 0; i < state.parts.length; i++) {
      const p = state.parts[i];
      const dx = mx - p.origX;
      const dy = my - p.origY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist && d < 60) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    if (nearestIdx >= 0) {
      state.selectorIndex = nearestIdx;
      pickPart(nearestIdx);
    }
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      liveAnnounce("Audio on. Press M to mute.");
      tryResumeAudio();
      playClick();
    } else {
      liveAnnounce("Audio muted. Press M to unmute.");
      stopBackgroundHum();
    }
  }

  // Pick logic unchanged, only small added sound & particle variations
  function pickPart(index) {
    if (state.paused || state.levelComplete || state.gameOver) return;
    const part = state.parts[index];
    if (!part || part.picked) {
      playWrong();
      return;
    }
    // visual pick begin
    part.picked = true;
    part.pickAnimProgress = part.pickAnimProgress || 0;
    // play a soft whoosh and pluck
    playClick();
    // subtle whoosh: descending filtered tone
    if (audioCtx && audioEnabled) {
      try {
        const now = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const f = audioCtx.createBiquadFilter();
        o.type = "sine";
        o.frequency.value = 900;
        o.frequency.exponentialRampToValueAtTime(320, now + 0.18);
        f.type = "lowpass";
        f.frequency.value = 2200;
        o.connect(f);
        f.connect(g);
        g.connect(masterGain);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.03, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        o.start(now);
        o.stop(now + 0.22);
      } catch (err) {
        console.warn("whoosh error", err);
      }
    }

    // Update sum and particles
    state.currentSum += part.value;
    createParticles(part.origX, part.origY - 10, 10, palette.accent);

    // Check match logic (unchanged)
    if (state.currentSum === state.target) {
      playSuccess();
      state.levelComplete = true;
      liveAnnounce(`Great! You matched the target ${state.target}. Press Enter to continue.`);
      createParticles(WIDTH / 2, HEIGHT / 2 - 40, 40, "#A6F0C3");
    } else if (state.currentSum > state.target) {
      playWrong();
      state.lives--;
      liveAnnounce(`Too much! You exceeded ${state.target}. Lives left: ${state.lives}.`);
      createParticles(WIDTH / 2, HEIGHT / 2, 50, "#FFB6C1");
      if (state.lives <= 0) {
        state.gameOver = true;
        liveAnnounce("Game over. Press R to try again.");
      } else {
        // Reset picks visually after a moment
        setTimeout(() => {
          state.parts.forEach((p) => {
            p.picked = false;
            p.pickAnimProgress = 0;
          });
          state.currentSum = 0;
        }, 700);
      }
    } else {
      liveAnnounce(`Added ${part.value}. Current sum ${state.currentSum}.`);
    }
  }

  function nextLevel() {
    if (state.level >= MAX_LEVEL) {
      liveAnnounce("You finished all levels! Well done!");
      state.gameOver = true;
      return;
    }
    state.level++;
    generateLevel(state.level);
  }

  function restartGame() {
    state.level = 1;
    state.lives = LIVES;
    state.gameOver = false;
    state.levelComplete = false;
    state.currentSum = 0;
    generateLevel(1);
  }

  // Animation loop
  function tick() {
    state.ticks++;
    // conveyor subtle movement influence on parts
    for (let i = 0; i < state.parts.length; i++) {
      const p = state.parts[i];
      // keep origX stable but add tiny floating motion for charm
      p.x = p.origX + Math.sin((state.ticks + i * 12) / 80) * 4;
    }
    render();
    requestAnimationFrame(tick);
  }

  // Event bindings
  canvas.addEventListener("keydown", onKeyDown);
  window.addEventListener("keydown", (e) => {
    if (document.activeElement !== canvas) {
      tryResumeAudio();
    }
    onKeyDown(e);
  });
  canvas.addEventListener("mousedown", (e) => onMouseDown(e));
  canvas.addEventListener(
    "touchstart",
    (e) => {
      tryResumeAudio();
      const touch = e.touches[0];
      if (touch) {
        onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
      }
      e.preventDefault();
    },
    { passive: false }
  );

  // Initialize
  generateLevel(1);

  // Setup audio start on first gesture
  canvas.addEventListener("pointerdown", tryResumeAudio, { once: true });
  window.addEventListener("keydown", tryResumeAudio, { once: true });

  // Create audio context (may remain suspended until gesture)
  createAudioContext();

  liveAnnounce(
    "Welcome to Machine Math. Use arrow keys to select parts and Enter to feed the machine. Press M to mute. Click or press any key to enable sound."
  );

  tick();

  // For debugging
  window.__machineMathState = state;
})();