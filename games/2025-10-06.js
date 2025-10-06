(() => {
  // Machine Math - Enhanced visuals & audio (no gameplay changes)
  // Renders into the element with ID "game-of-the-day-stage"
  // All visuals drawn on canvas. Sounds via Web Audio API oscillators/filters.
  // Accessible: keyboard controls, aria-live text updates, audio visual cue.
  // No external assets. Modern, readable JS with comments and error handling.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const ROUNDS = 6;
  const MAX_PIECES = 6;

  // Color palette (calming, playful)
  const COLORS = {
    bgTop: "#EAF6F5",
    bgBottom: "#DFF0EE",
    machine: "#9FD5CF",
    accent: "#F6C28B",
    gear: "#C9E3E0",
    text: "#173939",
    pieceFace: "#FFFDF2",
    pieceEdge: "#CDE6E2",
    pieceStroke: "#2E4D4C",
    slot: "#F0F8F6",
    correctGlow: "rgba(184,247,212,0.9)",
    wrongGlow: "rgba(247,192,192,0.85)",
    confetti: ["#F6C28B", "#F7E9A1", "#A7D3D1", "#C9E3E0", "#D6B8F6"],
    softShadow: "rgba(22,57,55,0.12)",
  };

  // Container
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    console.error("Container with ID 'game-of-the-day-stage' not found.");
    return;
  }

  // Setup stage attributes (accessibility)
  stage.innerHTML = "";
  stage.setAttribute("role", "application");
  stage.setAttribute("aria-label", "Machine Math: a math puzzle game for kids.");
  stage.style.touchAction = "none";
  stage.style.position = "relative";

  // aria-live region for screen reader updates
  const ariaLive = document.createElement("div");
  ariaLive.setAttribute("aria-live", "polite");
  ariaLive.style.position = "absolute";
  ariaLive.style.left = "-9999px";
  ariaLive.style.width = "1px";
  ariaLive.style.height = "1px";
  ariaLive.style.overflow = "hidden";
  stage.appendChild(ariaLive);

  // Canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Interactive machine math canvas.");
  canvas.tabIndex = 0;
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";
  stage.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("2D canvas context not available.");
    return;
  }

  // Audio variables
  let audioContext = null;
  let audioAvailable = false;
  let audioOn = true;
  let bgGain = null;
  let bgNodes = [];
  let placeGain = null;

  // Initialize audio with careful error handling
  async function initAudio() {
    if (audioContext) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio API not available.");
      audioContext = new AC();

      // Master gain and global safety
      const master = audioContext.createGain();
      master.gain.value = 1.0;
      master.connect(audioContext.destination);

      // Background ambient pad: two oscillators, gentle LFO to detune, a smooth lowpass
      bgGain = audioContext.createGain();
      bgGain.gain.value = audioOn ? 0.035 : 0.00001; // gentle background level
      const bgFilter = audioContext.createBiquadFilter();
      bgFilter.type = "lowpass";
      bgFilter.frequency.value = 900;

      const oscA = audioContext.createOscillator();
      oscA.type = "sine";
      oscA.frequency.value = 110;
      const oscB = audioContext.createOscillator();
      oscB.type = "sine";
      oscB.frequency.value = 138.59; // rough fifth above
      // Subtle LFO for detune
      const lfo = audioContext.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.08;
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 2.5; // cents-ish detune expressed in Hz
      lfo.connect(lfoGain);

      // Connect LFO to detune param where supported
      try {
        lfoGain.connect(oscA.detune);
        lfoGain.connect(oscB.detune);
      } catch (e) {
        // Fallback: modulate frequency slowly
        const modA = audioContext.createGain();
        modA.gain.value = 0.5;
        lfo.connect(modA);
        // schedule small random periodic changes
      }

      // Put background chain together
      oscA.connect(bgFilter);
      oscB.connect(bgFilter);
      bgFilter.connect(bgGain);
      bgGain.connect(master);

      // Start oscillators, resume context if suspended (need user gesture)
      try {
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        oscA.start();
        oscB.start();
        lfo.start();
      } catch (e) {
        console.warn("Could not start background audio immediately:", e);
      }

      bgNodes = [oscA, oscB, lfo, bgFilter];

      // Sound for piece placement => short subtle click/pluck
      placeGain = audioContext.createGain();
      placeGain.gain.value = 0.08;
      placeGain.connect(master);

      audioAvailable = true;
      announce("Audio enabled.");
      setAudioVisual(true);
    } catch (err) {
      console.warn("Audio initialization failed:", err);
      audioAvailable = false;
      audioContext = null;
      setAudioVisual(false);
      announce("Audio not available. The game still works with visual cues.");
    }
  }

  // Toggle audio on/off
  function setAudioVisual(state) {
    audioOn = !!state && audioAvailable;
    if (bgGain) {
      // smooth ramp
      try {
        const now = audioContext.currentTime;
        bgGain.gain.cancelScheduledValues(now);
        bgGain.gain.setValueAtTime(bgGain.gain.value, now);
        bgGain.gain.linearRampToValueAtTime(audioOn ? 0.035 : 0.00001, now + 0.15);
      } catch (e) {
        bgGain.gain.value = audioOn ? 0.035 : 0.00001;
      }
    }
  }

  // Play friendly, bright correct sound
  function playCorrect() {
    if (!audioOn || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const master = audioContext.createGain();
      master.gain.value = 0.001;
      master.gain.setValueAtTime(0.001, now);
      master.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      master.connect(audioContext.destination);

      // Bell-like tones using FM-ish pairing
      const carrierFreqs = [440, 660, 880];
      carrierFreqs.forEach((f, i) => {
        const osc = audioContext.createOscillator();
        osc.type = i === 0 ? "sine" : "triangle";
        const gain = audioContext.createGain();
        gain.gain.value = 0.0;
        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.12 / (i + 1), now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0 + Math.random() * 0.4);

        // slight glide up
        osc.frequency.setValueAtTime(f * (1 - 0.01 * i), now);
        osc.frequency.exponentialRampToValueAtTime(f * (1 + 0.02 * i), now + 0.12 + i * 0.02);

        const filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 2400 - i * 400;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);

        osc.start(now);
        osc.stop(now + 1.3 + Math.random() * 0.3);
      });
    } catch (e) {
      console.warn("playCorrect error:", e);
    }
  }

  // Play gentle incorrect sound
  function playIncorrect() {
    if (!audioOn || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      osc.type = "sawtooth";
      const gain = audioContext.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      const filter = audioContext.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 420;
      filter.Q.value = 0.6;

      osc.connect(filter).connect(gain).connect(audioContext.destination);
      osc.start(now);
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.22);
      osc.stop(now + 0.5);
    } catch (e) {
      console.warn("playIncorrect error:", e);
    }
  }

  // Play placement / tap sound
  function playPlace() {
    if (!audioOn || !audioContext || !placeGain) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      osc.type = "square";
      osc.frequency.value = 420 + Math.random() * 80;
      const g = audioContext.createGain();
      g.gain.value = 0.0001;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      const filt = audioContext.createBiquadFilter();
      filt.type = "highpass";
      filt.frequency.value = 320;

      osc.connect(filt).connect(g).connect(placeGain);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch (e) {
      console.warn("playPlace error:", e);
    }
  }

  // Utility: announce to aria live
  function announce(text) {
    ariaLive.textContent = text;
  }

  // Game state
  const state = {
    round: 0,
    roundsTotal: ROUNDS,
    puzzles: [],
    selectedPieceIndex: 0,
    chosenSlot: 0,
    placed: [],
    pieces: [],
    draggingPiece: null,
    solvedRounds: 0,
    feedback: null,
    confetti: [],
    finished: false,
    awaitingAudioGesture: true,
    subtleParticles: [],
  };

  // Random helpers
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  function distance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Generate puzzles (mechanics unchanged)
  function generatePuzzles() {
    const puzzles = [];
    for (let i = 0; i < ROUNDS; i++) {
      const op = i % 3 === 2 ? "-" : "+";
      if (op === "+") {
        const slotCount = i < 3 ? 2 : 3;
        const values = [];
        for (let s = 0; s < slotCount; s++) values.push(randInt(1, 9));
        const target = values.reduce((a, b) => a + b, 0);
        puzzles.push({ op, slots: slotCount, solution: values, target });
      } else {
        const a = randInt(5, 12);
        const b = randInt(1, Math.min(8, a - 1));
        const target = a - b;
        puzzles.push({ op, slots: 2, solution: [a, b], target });
      }
    }
    return puzzles;
  }

  // Start a round: layout pieces, etc. (retain original logic)
  function startRound() {
    const idx = state.round;
    if (idx >= state.roundsTotal) {
      state.finished = true;
      announce("All machines fixed! Great job!");
      startConfetti();
      return;
    }
    const p = state.puzzles[idx];
    state.placed = new Array(p.slots).fill(null);
    state.selectedPieceIndex = 0;
    state.chosenSlot = 0;
    state.feedback = null;

    const pieces = [];
    p.solution.slice().forEach(v => pieces.push(v));
    while (pieces.length < MAX_PIECES) {
      let cand;
      if (p.op === "-") cand = randInt(1, Math.max(9, Math.max(...p.solution)));
      else cand = randInt(1, 9);
      if (pieces.filter(x => x === cand).length > 2) continue;
      pieces.push(cand);
    }
    shuffleArray(pieces);

    // Layout pieces with gentle curve and slight rotation for variety
    const centerX = 360;
    const centerY = 378;
    const radius = 210;
    const angleStart = Math.PI * 0.18;
    const angleEnd = Math.PI * 0.82;
    const pieceObjs = [];
    const r = 28;
    for (let i = 0; i < pieces.length; i++) {
      const t = i / (pieces.length - 1 || 1);
      const angle = angleStart + t * (angleEnd - angleStart);
      const x = centerX - Math.cos(angle) * radius + (Math.random() - 0.5) * 6;
      const y = centerY - Math.sin(angle) * (radius * 0.58) + (Math.random() - 0.5) * 6;
      pieceObjs.push({
        id: "p" + i,
        value: pieces[i],
        x,
        y,
        r,
        homeX: x,
        homeY: y,
        dragging: false,
        placedInSlot: -1,
        vx: 0,
        vy: 0,
        angle: (Math.random() - 0.5) * 0.2,
      });
    }

    state.pieces = pieceObjs;
    state.draggingPiece = null;
    announce(`Round ${idx + 1}. Machine asks for ${p.op} to make ${p.target}.`);
  }

  // Input handlers
  function generateControls() {
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("click", onCanvasClick, { passive: true });

    canvas.addEventListener("keydown", (e) => {
      if (state.awaitingAudioGesture) {
        initAudio().catch(() => {});
        state.awaitingAudioGesture = false;
      }
      const key = e.key;
      if (state.finished) {
        if (key === "Enter") restartGame();
        if (key.toLowerCase() === "m") toggleAudio();
        return;
      }

      if (key === "ArrowLeft") {
        e.preventDefault();
        state.selectedPieceIndex = (state.selectedPieceIndex - 1 + state.pieces.length) % state.pieces.length;
      } else if (key === "ArrowRight") {
        e.preventDefault();
        state.selectedPieceIndex = (state.selectedPieceIndex + 1) % state.pieces.length;
      } else if (key === "ArrowUp") {
        e.preventDefault();
        state.chosenSlot = (state.chosenSlot - 1 + state.placed.length) % state.placed.length;
      } else if (key === "ArrowDown") {
        e.preventDefault();
        state.chosenSlot = (state.chosenSlot + 1) % state.placed.length;
      } else if (key === "Enter" || key === " ") {
        e.preventDefault();
        const piece = state.pieces[state.selectedPieceIndex];
        if (!piece) return;
        if (piece.placedInSlot >= 0) {
          const oldSlot = piece.placedInSlot;
          piece.placedInSlot = -1;
          state.placed[oldSlot] = null;
          announce(`Removed piece ${piece.value} from slot ${oldSlot + 1}.`);
        } else {
          const slot = state.chosenSlot;
          const otherIdx = state.pieces.findIndex(pp => pp.placedInSlot === slot);
          if (otherIdx >= 0) state.pieces[otherIdx].placedInSlot = -1;
          piece.placedInSlot = slot;
          state.placed[slot] = piece.value;
          announce(`Placed piece ${piece.value} into slot ${slot + 1}.`);
          try { playPlace(); } catch (e) {}
        }
      } else if (key === "Backspace" || key === "Delete") {
        e.preventDefault();
        const slot = state.chosenSlot;
        const idx = state.pieces.findIndex(pp => pp.placedInSlot === slot);
        if (idx >= 0) {
          const val = state.pieces[idx].value;
          state.pieces[idx].placedInSlot = -1;
          state.placed[slot] = null;
          announce(`Removed piece ${val} from slot ${slot + 1}.`);
        }
      } else if (key.toLowerCase() === "m") {
        toggleAudio();
      } else if (key === "s") {
        attemptSolve();
      }
    });

    canvas.addEventListener("focus", () => {
      if (state.awaitingAudioGesture) {
        initAudio().catch(() => {});
        state.awaitingAudioGesture = false;
      }
    });

    canvas.addEventListener("pointerdown", async () => {
      if (state.awaitingAudioGesture) {
        try { await initAudio(); } catch (e) { /* ignore */ }
        state.awaitingAudioGesture = false;
      }
    }, { once: true });
  }

  // Pointer events
  function onPointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // audio icon region
    if (x > WIDTH - 64 && y < 44) {
      toggleAudio();
      return;
    }

    // check pieces
    for (let i = 0; i < state.pieces.length; i++) {
      const p = state.pieces[i];
      if (distance(p.x, p.y, x, y) <= p.r + 8) {
        p.dragging = true;
        state.draggingPiece = p;
        p.offsetX = x - p.x;
        p.offsetY = y - p.y;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
    }

    // submit button region
    if (x > 560 && x < 700 && y > 380 && y < 440) {
      attemptSolve();
      return;
    }
  }

  function onPointerMove(e) {
    if (!state.draggingPiece) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const p = state.draggingPiece;
    p.x = x - p.offsetX;
    p.y = y - p.offsetY;
    p.vx = (Math.random() - 0.5) * 0.3;
    p.vy = (Math.random() - 0.5) * 0.3;
  }

  function onPointerUp(e) {
    if (!state.draggingPiece) return;
    const p = state.draggingPiece;
    p.dragging = false;
    const slotIdx = slotIndexAtPoint(p.x, p.y);
    if (slotIdx >= 0) {
      const other = state.pieces.find(pp => pp.placedInSlot === slotIdx);
      if (other) other.placedInSlot = -1;
      p.placedInSlot = slotIdx;
      state.placed[slotIdx] = p.value;
      announce(`Placed piece ${p.value} into slot ${slotIdx + 1}.`);
      try { playPlace(); } catch (e) {}
      // settle the piece into slot visually
      const sp = getSlotPositions()[slotIdx];
      p.homeX = sp.x;
      p.homeY = sp.y + 4;
      p.x = sp.x;
      p.y = sp.y + 4;
      p.angle = 0;
    } else {
      // animate back to home
      if (p.placedInSlot >= 0) {
        state.placed[p.placedInSlot] = null;
        p.placedInSlot = -1;
      }
      p.homeX = p.homeX || p.x;
      p.homeY = p.homeY || p.y;
      // smooth return
      p.vx = (p.homeX - p.x) * 0.12;
      p.vy = (p.homeY - p.y) * 0.12;
    }
    state.draggingPiece = null;
  }

  function onCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (let i = 0; i < state.pieces.length; i++) {
      const p = state.pieces[i];
      if (distance(p.x, p.y, x, y) <= p.r + 8) {
        state.selectedPieceIndex = i;
        const slot = state.chosenSlot;
        const otherIdx = state.pieces.findIndex(pp => pp.placedInSlot === slot);
        if (p.placedInSlot >= 0) {
          state.placed[p.placedInSlot] = null;
          p.placedInSlot = -1;
          announce(`Removed piece ${p.value}.`);
        } else {
          if (otherIdx >= 0) state.pieces[otherIdx].placedInSlot = -1;
          p.placedInSlot = slot;
          state.placed[slot] = p.value;
          announce(`Placed piece ${p.value} in slot ${slot + 1}.`);
          try { playPlace(); } catch (e) {}
        }
        return;
      }
    }
    if (x > 560 && x < 700 && y > 380 && y < 440) {
      attemptSolve();
      return;
    }
    const sl = slotIndexAtPoint(x, y);
    if (sl >= 0) {
      state.chosenSlot = sl;
      announce(`Selected slot ${sl + 1}.`);
    }
  }

  // Slot hit detection
  function getSlotPositions() {
    const baseX = 360;
    const baseY = 210;
    const spacing = 110;
    const p = state.puzzles[state.round];
    const slots = [];
    const total = p.slots;
    const startX = baseX - (total - 1) * spacing / 2;
    for (let i = 0; i < total; i++) {
      slots.push({ x: startX + i * spacing, y: baseY + 10, w: 84, h: 84 });
    }
    return slots;
  }
  function slotIndexAtPoint(x, y) {
    const slotPositions = getSlotPositions();
    for (let i = 0; i < slotPositions.length; i++) {
      const sp = slotPositions[i];
      if (x >= sp.x - sp.w / 2 && x <= sp.x + sp.w / 2 && y >= sp.y - sp.h / 2 && y <= sp.y + sp.h / 2) {
        return i;
      }
    }
    return -1;
  }

  // Attempt solve (logic unchanged)
  function attemptSolve() {
    if (state.finished) return;
    const puzzle = state.puzzles[state.round];
    if (state.placed.some(v => v === null)) {
      announce("Fill all slots before submitting.");
      state.feedback = { type: "wrong", t: performance.now() };
      playIncorrect();
      return;
    }
    const values = state.placed.slice();
    let result;
    if (puzzle.op === "+") {
      result = values.reduce((a, b) => a + b, 0);
    } else {
      result = values.reduce((a, b) => a - b);
    }
    if (result === puzzle.target) {
      state.feedback = { type: "correct", t: performance.now() };
      playCorrect();
      announce("Correct! Machine is fixed.");
      state.solvedRounds++;
      // small celebration light & confetti
      setTimeout(() => {
        state.round++;
        if (state.round >= state.roundsTotal) {
          state.finished = true;
          announce("All machines fixed! You win!");
          startConfetti();
        } else {
          startRound();
        }
      }, 1000);
    } else {
      state.feedback = { type: "wrong", t: performance.now() };
      playIncorrect();
      announce(`Not quite. Try again. Your result was ${result}.`);
    }
  }

  function toggleAudio() {
    if (!audioAvailable) {
      announce("Audio not available on this device.");
      return;
    }
    audioOn = !audioOn;
    setAudioVisual(audioOn);
    announce(audioOn ? "Audio on." : "Audio muted.");
  }

  // Confetti animation for win
  function startConfetti() {
    state.confetti = [];
    for (let i = 0; i < 80; i++) {
      state.confetti.push({
        x: randInt(40, WIDTH - 40),
        y: randInt(-300, -20),
        vx: (Math.random() - 0.5) * 2.2,
        vy: 1.5 + Math.random() * 2.2,
        size: randInt(6, 14),
        color: COLORS.confetti[Math.floor(Math.random() * COLORS.confetti.length)],
        rot: Math.random() * Math.PI * 2,
        angVel: (Math.random() - 0.5) * 0.12,
        shape: Math.random() > 0.5 ? "rect" : "ellipse",
      });
    }
  }

  // Restart game
  function restartGame() {
    state.puzzles = generatePuzzles();
    state.round = 0;
    state.solvedRounds = 0;
    state.finished = false;
    startRound();
    announce("Game restarted. Fix the machines!");
  }

  // Draw helpers
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

  // Gear drawing with smoother animation
  function drawGear(cx, cy, outerR, teeth, innerR, color, timeOffset = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    const t = Date.now() / 1200 + timeOffset;
    ctx.rotate(Math.sin(t) * 0.6 * 0.02);
    ctx.fillStyle = color;
    // outer toothed shape (stylized)
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const rOut = outerR + (i % 2 === 0 ? 6 : 0);
      const x1 = Math.cos(a) * rOut;
      const y1 = Math.sin(a) * rOut;
      if (i === 0) ctx.moveTo(x1, y1);
      ctx.lineTo(x1, y1);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.95;
    ctx.fill();
    // center plate
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.fill();
    // small hole
    ctx.fillStyle = "#E8F6F5";
    ctx.beginPath();
    ctx.arc(0, 0, innerR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Nice glossy piece draw with drop shadow and subtle highlight
  function drawPiece(p, isSelected) {
    ctx.save();
    // drop shadow
    ctx.fillStyle = COLORS.softShadow;
    ctx.beginPath();
    ctx.ellipse(p.x + 3, p.y + 6, p.r * 1.05, p.r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // piece base with slight gradient
    const grad = ctx.createLinearGradient(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
    grad.addColorStop(0, COLORS.pieceFace);
    grad.addColorStop(1, COLORS.pieceEdge);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    // rim
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.pieceStroke;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r - 1, 0, Math.PI * 2);
    ctx.stroke();

    // highlight
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.ellipse(p.x - p.r * 0.35, p.y - p.r * 0.45, p.r * 0.5, p.r * 0.28, p.angle, 0, Math.PI * 2);
    ctx.fill();

    // number
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(p.value), p.x, p.y + 6);

    // selection accent
    if (isSelected) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(127, 215, 198, 0.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // placed badge
    if (p.placedInSlot >= 0) {
      ctx.fillStyle = "#7FD7C6";
      ctx.beginPath();
      ctx.arc(p.x + p.r - 8, p.y - p.r + 8, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Rendering & animation loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // Update physics & subtle particles
  function update(dt) {
    // piece easing back to home
    state.pieces.forEach(p => {
      if (!p.dragging) {
        // gentle spring to homeX/homeY
        const dx = p.homeX - p.x;
        const dy = p.homeY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const spring = 8;
        const damping = 0.82;
        p.vx = (p.vx + dx * spring * dt) * damping;
        p.vy = (p.vy + dy * spring * dt) * damping;
        p.x += p.vx;
        p.y += p.vy;
        // angle gently to 0 when settling
        p.angle *= 0.92;
        // tiny jitter if hovering
        if (p.dragging) {
          p.angle = (Math.random() - 0.5) * 0.12;
        }
      } else {
        // while dragging, subtle rotate follow pointer
        p.angle = Math.sin(Date.now() / 120 + p.x * 0.01) * 0.05;
      }
    });

    // subtle background particles (calming)
    if (state.subtleParticles.length === 0) {
      for (let i = 0; i < 14; i++) {
        state.subtleParticles.push({
          x: Math.random() * WIDTH,
          y: Math.random() * HEIGHT,
          r: 8 + Math.random() * 18,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          alpha: 0.06 + Math.random() * 0.06,
        });
      }
    }
    state.subtleParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -50) p.x = WIDTH + 50;
      if (p.x > WIDTH + 50) p.x = -50;
      if (p.y < -50) p.y = HEIGHT + 50;
      if (p.y > HEIGHT + 50) p.y = -50;
    });

    // confetti physics
    if (state.confetti.length) {
      state.confetti.forEach(c => {
        c.x += c.vx;
        c.y += c.vy;
        c.rot += c.angVel;
        c.vy += 0.02; // gravity-ish
        if (c.y > HEIGHT + 30) {
          c.y = randInt(-220, -30);
          c.x = randInt(40, WIDTH - 40);
          c.vy = 1.5 + Math.random() * 2;
        }
      });
    }

    // feedback fade-out
    if (state.feedback) {
      const age = (performance.now() - state.feedback.t) / 1000;
      if (age > 1.2) state.feedback = null;
    }
  }

  function render() {
    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Gradient background
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Subtle soft blobs
    state.subtleParticles.forEach(sp => {
      ctx.save();
      ctx.globalAlpha = sp.alpha;
      ctx.fillStyle = "#CDEDE8";
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Machine body with slight inner glow
    const machineX = 160;
    const machineY = 120;
    ctx.save();
    // outer shadow
    ctx.fillStyle = "#E6F6F4";
    drawRoundedRect(ctx, machineX - 6, machineY - 6, 392, 232, 22);
    // machine panel
    ctx.fillStyle = COLORS.machine;
    drawRoundedRect(ctx, machineX, machineY, 380, 220, 20);

    // faceplate gradient
    const plateGrad = ctx.createLinearGradient(machineX + 20, machineY + 20, machineX + 300, machineY + 80);
    plateGrad.addColorStop(0, "#FFFFFF");
    plateGrad.addColorStop(1, "#EFEFEF");
    ctx.fillStyle = plateGrad;
    drawRoundedRect(ctx, machineX + 12, machineY + 12, 356, 72, 12);

    // small shining strip
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    drawRoundedRect(ctx, machineX + 26, machineY + 26, 140, 42, 10);

    // accent dial / vent texture
    ctx.fillStyle = COLORS.accent;
    drawRoundedRect(ctx, machineX + 20, machineY + 110, 320, 38, 8);
    ctx.restore();

    // Gears
    drawGear(110, 96, 36, 12, 12, COLORS.gear, 0.2);
    drawGear(602, 78, 22, 10, 9, COLORS.gear, 0.8);
    drawGear(612, 260, 30, 11, 10, COLORS.gear, 1.4);

    // Machine display text
    const puzzle = state.puzzles[state.round];
    ctx.fillStyle = COLORS.text;
    ctx.font = "22px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Machine Goal:", machineX + 24, machineY + 44);
    ctx.font = "bold 36px Inter, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${puzzle.op}   →   ${puzzle.target}`, machineX + 160, machineY + 56);

    // conveyor / slot region
    ctx.save();
    ctx.fillStyle = "#E9F8F6";
    drawRoundedRect(ctx, machineX + 40, machineY + 110, 300, 92, 14);
    ctx.strokeStyle = "rgba(46,77,76,0.05)";
    ctx.stroke();
    ctx.restore();

    // Slots
    const slots = getSlotPositions();
    for (let i = 0; i < slots.length; i++) {
      const sp = slots[i];
      ctx.save();

      // subtle animated glow for chosen slot
      if (state.chosenSlot === i) {
        const t = (Date.now() / 600) % 2;
        const alpha = 0.12 + 0.06 * Math.sin(t * Math.PI * 2);
        ctx.shadowColor = "rgba(127,215,198,0.65)";
        ctx.shadowBlur = 14;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = COLORS.slot;
      }

      // slot plate
      drawRoundedRect(ctx, sp.x - sp.w / 2, sp.y - sp.h / 2, sp.w, sp.h, 10);

      // inner area
      ctx.fillStyle = "#FFFFFF";
      ctx.globalAlpha = 0.5;
      ctx.fillRect(sp.x - sp.w / 2 + 8, sp.y - sp.h / 2 + 8, sp.w - 16, sp.h - 16);
      ctx.globalAlpha = 1;

      // if placed show a crisp card
      const placedValue = state.placed[i];
      if (placedValue !== null && placedValue !== undefined) {
        ctx.fillStyle = "#FFFDF9";
        drawRoundedRect(ctx, sp.x - sp.w / 2 + 6, sp.y - sp.h / 2 + 6, sp.w - 12, sp.h - 12, 8);
        ctx.strokeStyle = "#CDE6E2";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = COLORS.text;
        ctx.font = "bold 28px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(placedValue), sp.x, sp.y + 10);
      } else {
        // placeholder label
        ctx.fillStyle = "rgba(93,125,125,0.18)";
        ctx.font = "13px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("drop", sp.x, sp.y + 5);
      }

      ctx.restore();
    }

    // Pieces (draw with layering: placed ones slightly elevated)
    // Sort so dragging piece draws on top
    const piecesRenderOrder = state.pieces.slice().sort((a, b) => {
      if (a === state.draggingPiece) return 1;
      if (b === state.draggingPiece) return -1;
      return a.placedInSlot - b.placedInSlot;
    });

    piecesRenderOrder.forEach((p) => {
      drawPiece(p, state.pieces.indexOf(p) === state.selectedPieceIndex);
    });

    // Submit button
    ctx.save();
    // button base
    ctx.fillStyle = "#FFFFFF";
    drawRoundedRect(ctx, 560, 380, 140, 60, 12);
    // soft gradient
    const btnGrad = ctx.createLinearGradient(560, 380, 700, 440);
    btnGrad.addColorStop(0, "#FFFFFF");
    btnGrad.addColorStop(1, "#F3F5F4");
    ctx.fillStyle = btnGrad;
    drawRoundedRect(ctx, 560, 380, 140, 60, 12);

    // outline
    ctx.strokeStyle = "#8FBEB6";
    ctx.lineWidth = 2;
    ctx.stroke();

    // label
    ctx.fillStyle = "#1F4744";
    ctx.font = "bold 20px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Fix Machine", 630, 418);

    // subtle wrench icon next to label (simple)
    ctx.beginPath();
    ctx.strokeStyle = "#2E4D4C";
    ctx.lineWidth = 2;
    ctx.moveTo(590, 404);
    ctx.lineTo(606, 392);
    ctx.moveTo(596, 404);
    ctx.lineTo(612, 392);
    ctx.stroke();
    ctx.restore();

    // HUD text (round & score)
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Round ${state.round + 1} / ${state.roundsTotal}`, 20, 28);
    ctx.fillText(`Fixed: ${state.solvedRounds}`, 20, 52);

    // Small instruction
    ctx.font = "13px Inter, sans-serif";
    ctx.fillStyle = "#235755";
    ctx.fillText("Drag pieces or use arrows + Enter. Press S to submit. Press M to toggle audio.", 20, HEIGHT - 18);

    // Audio icon (top-right)
    drawAudioIcon(WIDTH - 56, 12, audioOn);

    // Feedback overlay
    if (state.feedback) {
      const age = (performance.now() - state.feedback.t) / 1000;
      if (age < 0.9) {
        ctx.save();
        ctx.globalAlpha = 0.92 - age;
        ctx.fillStyle = state.feedback.type === "correct" ? COLORS.correctGlow : COLORS.wrongGlow;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
      }
    }

    // Confetti
    if (state.finished) {
      ctx.save();
      state.confetti.forEach(c => {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        if (c.shape === "rect") {
          ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 0, c.size, c.size * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      // victory text
      ctx.fillStyle = "#123C3A";
      ctx.font = "bold 42px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Machines Fixed! Well done!", WIDTH / 2, 120);
      ctx.font = "18px Inter, sans-serif";
      ctx.fillText("Press Enter to play again. Press M to toggle audio.", WIDTH / 2, 160);
      ctx.restore();
    }

    // Small accessibility cue showing selected piece & slot
    ctx.save();
    ctx.fillStyle = "#234B49";
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "left";
    const sel = state.pieces[state.selectedPieceIndex];
    ctx.fillText(`Selected piece: ${sel ? sel.value : "-"} — Slot: ${state.chosenSlot + 1}`, 20, HEIGHT - 40);
    ctx.restore();
  }

  function drawAudioIcon(x, y, on) {
    ctx.save();
    ctx.translate(x, y);
    // background pill
    ctx.fillStyle = on ? "#7FD7C6" : "#D7EDEC";
    ctx.strokeStyle = "#2E4D4C";
    ctx.lineWidth = 1.2;
    drawRoundedRect(ctx, -18, -12, 36, 24, 6);
    // speaker
    ctx.fillStyle = "#123C3A";
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(-2, -6);
    ctx.lineTo(2, -10);
    ctx.lineTo(8, -10);
    ctx.lineTo(8, 10);
    ctx.lineTo(2, 10);
    ctx.lineTo(-2, 6);
    ctx.lineTo(-8, 6);
    ctx.closePath();
    ctx.fill();
    // waves or cross
    if (audioAvailable) {
      ctx.strokeStyle = on ? "#07322F" : "#7AA9A3";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(14, 0, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(14, 0, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#E06A6A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, -8);
      ctx.lineTo(18, 0);
      ctx.moveTo(18, -8);
      ctx.lineTo(10, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Start audio on first pointer gesture (comply with browsers)
  canvas.addEventListener("pointerdown", async () => {
    if (state.awaitingAudioGesture) {
      try {
        await initAudio();
      } catch (e) {
        console.warn(e);
      }
      state.awaitingAudioGesture = false;
    }
  }, { once: true });

  // Initialization
  function init() {
    state.puzzles = generatePuzzles();
    state.round = 0;
    state.solvedRounds = 0;
    state.finished = false;
    state.confetti = [];
    state.subtleParticles = [];
    generateControls();
    startRound();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  // Kick off
  init();

})();