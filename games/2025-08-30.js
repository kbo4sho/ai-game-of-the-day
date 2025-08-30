(function () {
  // Machine Math - Canvas Game (Visual & Audio Enhancements)
  // Renders inside element with id "game-of-the-day-stage"
  // Uses Canvas and Web Audio API only (no external assets)

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const STAGE_ID = "game-of-the-day-stage";

  // Helpers
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  // Get stage element
  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error("Game stage element not found:", STAGE_ID);
    return;
  }
  stage.innerHTML = ""; // clear
  stage.style.width = WIDTH + "px";
  stage.style.height = HEIGHT + "px";
  stage.style.position = "relative";
  stage.style.userSelect = "none";

  // Create accessible live region for screen readers
  const live = document.createElement("div");
  live.setAttribute("aria-live", "polite");
  live.style.position = "absolute";
  live.style.left = "-9999px";
  live.style.width = "1px";
  live.style.height = "1px";
  live.style.overflow = "hidden";
  stage.appendChild(live);

  // Canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Math machine game canvas");
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false });

  // Audio setup variables
  let audioCtx = null;
  let audioAllowed = false;
  let bgOsc1 = null;
  let bgOsc2 = null;
  let bgFilter = null;
  let bgGain = null;
  let masterGain = null;
  let lfo = null;

  // Safety wrapper for audio node creation
  function safeCreate(func, ...args) {
    try {
      return func(...args);
    } catch (err) {
      console.warn("Audio node creation failed:", err && err.message);
      return null;
    }
  }

  // Audio creation with error handling
  async function initAudio() {
    if (audioCtx) return true;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("AudioContext not supported:", e && e.message);
      audioCtx = null;
      audioAllowed = false;
      return false;
    }

    try {
      masterGain = safeCreate(() => audioCtx.createGain());
      if (!masterGain) throw new Error("masterGain failed");
      masterGain.gain.value = 0.85;
      masterGain.connect(audioCtx.destination);

      // Background pad: two oscillators detuned, lowpass filter and slow LFO
      bgOsc1 = safeCreate(() => audioCtx.createOscillator());
      bgOsc2 = safeCreate(() => audioCtx.createOscillator());
      bgFilter = safeCreate(() => audioCtx.createBiquadFilter());
      bgGain = safeCreate(() => audioCtx.createGain());
      lfo = safeCreate(() => audioCtx.createOscillator());
      const lfoGain = safeCreate(() => audioCtx.createGain());

      if (!bgOsc1 || !bgOsc2 || !bgFilter || !bgGain || !lfo || !lfoGain) {
        throw new Error("Failed to create some audio nodes");
      }

      bgOsc1.type = "sine";
      bgOsc2.type = "sine";
      bgOsc1.frequency.value = 55;
      bgOsc2.frequency.value = 66; // detuned interval
      bgOsc2.detune.value = 12;
      bgFilter.type = "lowpass";
      bgFilter.frequency.value = 800;
      bgFilter.Q.value = 0.8;

      bgGain.gain.value = 0.03; // subtle pad
      bgOsc1.connect(bgFilter);
      bgOsc2.connect(bgFilter);
      bgFilter.connect(bgGain);
      bgGain.connect(masterGain);

      // LFO modulates filter cutoff for gentle movement
      lfo.type = "sine";
      lfo.frequency.value = 0.15;
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(bgFilter.frequency);

      // start nodes
      bgOsc1.start();
      bgOsc2.start();
      lfo.start();

      audioAllowed = true;
      // On some browsers AudioContext starts suspended until user gesture - keep track
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch (e) {
          /* ignore */
        }
      }
      return true;
    } catch (e) {
      console.warn("Audio initialization failed:", e && e.message);
      if (audioCtx) {
        try {
          audioCtx.close();
        } catch (er) {
          /* ignore */
        }
      }
      audioCtx = null;
      audioAllowed = false;
      return false;
    }
  }

  // Sound utilities (all created with web audio oscillators and filters)
  function playPlace() {
    if (!audioCtx || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = "triangle";
      osc.frequency.value = 660;
      filter.type = "highpass";
      filter.frequency.value = 400;
      gain.gain.value = 0.0001;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn("playPlace error:", e && e.message);
    }
  }

  function playSelectOp() {
    if (!audioCtx || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = 440;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(masterGain);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {
      console.warn("playSelectOp error:", e && e.message);
    }
  }

  function playSuccess() {
    if (!audioCtx || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [660, 880, 1100];
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(masterGain);
      freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = i === 1 ? "sine" : "triangle";
        osc.frequency.value = f;
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        osc.connect(g);
        g.connect(gain);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.08 / (i + 1), now + 0.02 + i * 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55 + i * 0.06);
        osc.start(now);
        osc.stop(now + 0.6 + i * 0.06);
      });
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1, now + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, now + 0.65);
    } catch (e) {
      console.warn("playSuccess error:", e && e.message);
    }
  }

  function playFail() {
    if (!audioCtx || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = "sawtooth";
      osc.frequency.value = 220;
      filter.type = "bandpass";
      filter.frequency.value = 240;
      filter.Q.value = 6;

      gain.gain.value = 0.0001;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {
      console.warn("playFail error:", e && e.message);
    }
  }

  // Backwards compatible beep function used elsewhere - route to success/fail for richer sound
  function playBeep(success = true) {
    if (success) playSuccess();
    else playFail();
  }

  // Game state
  let running = false;
  let level = 1;
  let score = 0;
  let roundIndex = 0;
  let attempts = 0;
  let maxAttempts = 3;

  // Interactive elements: chips, operator gears, slots, buttons
  const chips = []; // {id,num,x,y,radius,held,selected,originalX,originalY,bobPhase}
  const operators = []; // {id,op,x,y,r}
  const slots = {
    A: { x: 360 - 110, y: 220, r: 36, content: null },
    B: { x: 360 + 110, y: 220, r: 36, content: null },
    operator: { x: 360, y: 160, r: 36, content: null },
  };
  const runButton = { x: 360, y: 360, w: 120, h: 44, hot: false };
  const resetButton = { x: 590, y: 18, w: 110, h: 30 };

  let targetNumber = null;
  let solution = null; // {a,b,op}

  // Dragging state
  let dragging = null;
  let dragOffset = { x: 0, y: 0 };

  // Keyboard focus
  let focus = { area: "start", index: 0 }; // areas: start, chips, ops, run, reset

  // Animation state
  let operatorAngles = {};
  let globalTimeStart = performance.now();
  let conveyorOffset = 0;

  // Steam particles for run animation (visual only)
  const steamParticles = [];

  // Accessibility announcements
  function announce(text) {
    if (!live) return;
    live.textContent = text;
  }

  // Utility to generate round ensuring it's solvable
  function generateRound() {
    attempts = 0;
    const opSets = level === 1 ? ["+", "-"] : level === 2 ? ["+", "-", "×"] : ["+", "-", "×"];
    const maxNum = level === 1 ? 10 : level === 2 ? 12 : 20;

    // Choose two solution numbers and operator, compute target
    let a = randInt(1, maxNum);
    let b = randInt(1, maxNum);
    let op = pick(opSets);
    // Ensure subtraction non-negative for age appropriateness
    if (op === "-" && a < b) [a, b] = [b, a];
    const compute = (x, y, o) => (o === "+" ? x + y : o === "-" ? x - y : x * y);
    const t = compute(a, b, op);

    targetNumber = t;
    solution = { a, b, op };
    // Create chip set including correct numbers and distractors
    chips.length = 0;
    const chipNums = new Set([a, b]);
    while (chipNums.size < 8) {
      chipNums.add(randInt(1, maxNum));
    }
    const arr = Array.from(chipNums);
    // Shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Place chips on left side in rows
    const startX = 60;
    const startY = 100;
    const gapX = 80;
    const gapY = 70;
    arr.forEach((n, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const id = i;
      chips.push({
        id,
        num: n,
        x: startX + col * gapX + randInt(-6, 6),
        y: startY + row * gapY + randInt(-6, 6),
        r: 28,
        held: false,
        originalX: startX + col * gapX,
        originalY: startY + row * gapY,
        bobPhase: Math.random() * Math.PI * 2,
      });
    });

    // Operators: place up to 3 operators drawn from opSets (ensure variety)
    operators.length = 0;
    const uniqueOps = Array.from(new Set(opSets));
    const opsToShow = uniqueOps.length >= 3 ? uniqueOps.slice(0, 3) : uniqueOps.concat(uniqueOps).slice(0, 3);
    const opsPos = [{ x: 360 - 120, y: 40 }, { x: 360, y: 40 }, { x: 360 + 120, y: 40 }];
    for (let i = 0; i < opsToShow.length; i++) {
      operators.push({
        id: i,
        op: opsToShow[i],
        x: opsPos[i].x,
        y: opsPos[i].y,
        r: 30,
      });
      operatorAngles[i] = (operatorAngles[i] || 0) + (i % 2 ? 0.1 : -0.05);
    }

    // Clear slots
    slots.A.content = null;
    slots.B.content = null;
    slots.operator.content = null;

    roundIndex++;
    announce(
      `Round ${roundIndex}. Target number is ${targetNumber}. Choose two numbers and an operator to make ${targetNumber}.`
    );
  }

  // Drawing functions
  function drawBackground(time) {
    // Subtle radial gradient sky with soft midground shapes
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#f8fbfc");
    g.addColorStop(0.4, "#eaf5f7");
    g.addColorStop(1, "#e1f0f3");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // floating soft shapes (parallax)
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#7ad0d9";
    const t = (time || performance.now()) * 0.00012;
    for (let i = 0; i < 6; i++) {
      const sx = (i * 120 + Math.sin(t + i) * 40) % WIDTH;
      const sy = 50 + (i % 3) * 40 + Math.cos(t * 0.9 + i) * 10;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 90, 40, Math.sin(t + i) * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCalmPatterns(time) {
    // Edge gear outlines for depth
    ctx.save();
    ctx.globalAlpha = 0.12;
    const center = { x: 110, y: 420 };
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const r = 28 + i * 18;
      ctx.strokeStyle = `hsl(${200 + i * 30},60%,60%)`;
      ctx.lineWidth = 6 - i;
      ctx.setLineDash([6, 8]);
      ctx.arc(center.x + i * 40, center.y - i * 20, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawMachine(time) {
    ctx.save();

    // Slight shadow
    ctx.fillStyle = "#e9f6f8";
    ctx.fillRect(190, 110, 340, 280);
    ctx.strokeStyle = "#9fc2c9";
    ctx.lineWidth = 2;
    ctx.strokeRect(190, 110, 340, 280);

    // Conveyor belt with moving stripes
    ctx.fillStyle = "#c7e8ec";
    ctx.fillRect(220, 300, 280, 44);
    ctx.strokeStyle = "#9fb7bf";
    ctx.strokeRect(220, 300, 280, 44);

    // moving stripes
    ctx.save();
    const t = (time || performance.now()) * 0.002;
    conveyorOffset = (conveyorOffset + 0.8) % 40;
    ctx.translate(220 + conveyorOffset, 300);
    for (let s = -40; s < 320; s += 40) {
      ctx.fillStyle = "rgba(20,60,70,0.06)";
      ctx.fillRect(s, 0, 20, 44);
    }
    ctx.restore();

    // Two slots with soft inner shadows
    Object.keys(slots).forEach((k) => {
      const s = slots[k];
      // outer
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#7aa2ab";
      ctx.lineWidth = 3;
      ctx.arc(s.x, s.y, s.r + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // inner
      const grad = ctx.createRadialGradient(s.x - 8, s.y - 8, 4, s.x, s.y, s.r + 3);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#e9f7f8");
      ctx.beginPath();
      ctx.fillStyle = grad;
      ctx.arc(s.x, s.y, s.r - 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Pipes
    ctx.strokeStyle = "#84b9bf";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(slots.A.x + 36, slots.A.y + 6);
    ctx.lineTo(320, 260);
    ctx.lineTo(360, 260);
    ctx.lineTo(400, 260);
    ctx.lineTo(slots.B.x - 36, slots.B.y + 6);
    ctx.stroke();

    // target window with soft glow pulsing
    const now = performance.now();
    const pulse = 0.5 + Math.sin(now * 0.003) * 0.5;
    const glow = ctx.createLinearGradient(300, 30, 500, 110);
    glow.addColorStop(0, `rgba(12,80,90,${0.03 + 0.02 * pulse})`);
    glow.addColorStop(1, `rgba(200,250,250,0.01)`);
    ctx.fillStyle = glow;
    ctx.fillRect(300, 30, 200, 80);

    ctx.fillStyle = "#073b45";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TARGET", 400, 58);
    ctx.save();
    // inner target badge
    const tgX = 400, tgY = 92;
    const tgR = 22;
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(tgX, tgY - 6, tgR + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#064b57";
    ctx.font = "36px sans-serif";
    ctx.fillText(String(targetNumber !== null ? targetNumber : "--"), tgX, tgY + 2);
    ctx.restore();

    ctx.restore();
  }

  function drawChips(time) {
    const now = time || performance.now();
    chips.forEach((c, i) => {
      ctx.save();
      // bobbing effect
      const bob = Math.sin(now * 0.003 + c.bobPhase) * 4;
      const x = c.x;
      const y = c.y + bob;

      // shadow
      ctx.beginPath();
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.ellipse(x + 6, y + c.r * 0.6 + 8, c.r * 0.6, c.r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      // playful shape: circle with slight gradient
      const g = ctx.createRadialGradient(x - 8, y - 8, 4, x, y, c.r + 6);
      g.addColorStop(0, "#fff9e6");
      g.addColorStop(1, "#f3e8c2");
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.strokeStyle = "#d2b86b";
      ctx.lineWidth = 2;
      ctx.arc(x, y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // subtle glossy highlight
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.ellipse(x - 10, y - 10, c.r * 0.55, c.r * 0.28, 0.6, 0, Math.PI * 2);
      ctx.fill();

      // eyes that blink slowly
      const blink = (Math.sin(now * 0.002 + i) + 1) * 0.5;
      const eyeH = 3 - Math.floor(blink * 2.0);
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.arc(x - 8, y - 6, Math.max(1, eyeH), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 6, y - 6, Math.max(1, eyeH), 0, Math.PI * 2);
      ctx.fill();

      // number text
      ctx.fillStyle = "#1b4b50";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(c.num), x, y + 8);

      // focus ring
      if (focus.area === "chips" && focus.index === i) {
        ctx.strokeStyle = "#2ba6b4";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, c.r + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // if held, draw lift
      if (c.held) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(43,166,180,0.25)";
        ctx.lineWidth = 2;
        ctx.moveTo(x, y + c.r + 6);
        ctx.lineTo(x, y + c.r + 20);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  function drawOperators(time) {
    const now = time || performance.now();
    operators.forEach((opObj, i) => {
      ctx.save();

      // gear base with rotating teeth
      const ang = operatorAngles[opObj.id] || 0;
      operatorAngles[opObj.id] = (ang + 0.01 + (i % 2 === 0 ? 0.005 : -0.004)) % (Math.PI * 2);
      ctx.translate(opObj.x, opObj.y);
      ctx.rotate(operatorAngles[opObj.id]);

      // gear circle
      ctx.beginPath();
      ctx.fillStyle = "#fff7f3";
      ctx.strokeStyle = "#d59a7b";
      ctx.lineWidth = 2;
      ctx.arc(0, 0, opObj.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // little teeth (rotated)
      ctx.fillStyle = "#ffd7c4";
      for (let t = 0; t < 8; t++) {
        const toothAng = (t / 8) * Math.PI * 2;
        const tx = Math.cos(toothAng) * (opObj.r + 8);
        const ty = Math.sin(toothAng) * (opObj.r + 8);
        ctx.beginPath();
        ctx.rect(tx - 3, ty - 3, 6, 6);
        ctx.fill();
      }

      // symbol in center (draw without rotation for readability)
      ctx.rotate(-operatorAngles[opObj.id] * 0.5);
      ctx.fillStyle = "#7a3b2f";
      ctx.font = "22px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(opObj.op, 0, 8);

      // focus ring
      if (focus.area === "ops" && focus.index === i) {
        ctx.strokeStyle = "#2ba6b4";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, opObj.r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  function drawSlotsContent() {
    // Draw placed numbers or operator symbol inside slots
    ["A", "B"].forEach((k) => {
      const s = slots[k];
      ctx.save();
      if (s.content !== null) {
        ctx.fillStyle = "#1b4b50";
        ctx.font = "22px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(s.content), s.x, s.y + 8);
      } else {
        ctx.fillStyle = "#9fb7bf";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(k === "A" ? "Slot A" : "Slot B", s.x, s.y + 6);
      }
      ctx.restore();
    });
    const so = slots.operator;
    ctx.save();
    if (so.content !== null) {
      ctx.fillStyle = "#7a3b2f";
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(so.content), so.x, so.y + 10);
    } else {
      ctx.fillStyle = "#7aa2ab";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Operator", so.x, so.y + 6);
    }
    ctx.restore();
  }

  function drawButtons() {
    // Run button
    ctx.save();
    ctx.fillStyle = runButton.hot ? "#56bfc7" : "#a8e1e5";
    ctx.strokeStyle = "#4aa1a9";
    ctx.lineWidth = 2;
    roundRect(
      ctx,
      runButton.x - runButton.w / 2,
      runButton.y - runButton.h / 2,
      runButton.w,
      runButton.h,
      8,
      true,
      true
    );
    ctx.fillStyle = "#05343a";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RUN", runButton.x, runButton.y + 6);

    // Reset button
    ctx.fillStyle = "#ffdede";
    ctx.strokeStyle = "#e59b9b";
    ctx.lineWidth = 2;
    roundRect(ctx, resetButton.x, resetButton.y, resetButton.w, resetButton.h, 6, true, true);
    ctx.fillStyle = "#7a2a2a";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Reset", resetButton.x + resetButton.w / 2, resetButton.y + 20);

    // Audio icon indicator top-left
    ctx.fillStyle = audioAllowed ? "#2ba6b4" : "#c3c3c3";
    ctx.beginPath();
    ctx.arc(42, 22, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(audioAllowed ? "♪" : "×", 42, 26);

    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    ctx.fillStyle = "#064b57";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Level: ${level}`, 18, 28);
    ctx.fillText(`Score: ${score}`, 18, 48);
    ctx.fillText(`Attempts left: ${maxAttempts - attempts}`, 18, 68);

    ctx.fillStyle = "#2b4f56";
    ctx.textAlign = "center";
    ctx.font = "14px sans-serif";
    ctx.fillText("Drag or use keyboard to place numbers and operator", WIDTH / 2, HEIGHT - 10);
    ctx.restore();
  }

  function roundRect(ctx2, x, y, w, h, r, fill, stroke) {
    if (typeof r === "number") {
      r = { tl: r, tr: r, br: r, bl: r };
    } else {
      r = Object.assign({ tl: 0, tr: 0, br: 0, bl: 0 }, r);
    }
    ctx2.beginPath();
    ctx2.moveTo(x + r.tl, y);
    ctx2.lineTo(x + w - r.tr, y);
    ctx2.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    ctx2.lineTo(x + w, y + h - r.br);
    ctx2.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    ctx2.lineTo(x + r.bl, y + h);
    ctx2.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    ctx2.lineTo(x, y + r.tl);
    ctx2.quadraticCurveTo(x, y, x + r.tl, y);
    ctx2.closePath();
    if (fill) ctx2.fill();
    if (stroke) ctx2.stroke();
  }

  // Main render
  function render(time) {
    // time in ms
    drawBackground(time);
    drawCalmPatterns(time);
    drawMachine(time);
    drawOperators(time);
    drawChips(time);
    drawSlotsContent();
    drawButtons();
    drawHUD();
  }

  // Hit testing
  function pointInCircle(px, py, cx, cy, r) {
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  }

  // Mouse and touch events
  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    handlePointerDown(x, y);
  });
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    handlePointerMove(x, y);
  });
  canvas.addEventListener("mouseup", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    handlePointerUp(x, y);
  });
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      handlePointerDown(x, y);
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      handlePointerMove(x, y);
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      if (!t) {
        handlePointerUp(0, 0);
        return;
      }
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      handlePointerUp(x, y);
    },
    { passive: false }
  );

  // Pointer handlers
  function handlePointerDown(x, y) {
    // If start not running, treat as start button press
    if (!running) {
      startGame();
      return;
    }
    // Check chips (topmost first)
    for (let i = chips.length - 1; i >= 0; i--) {
      const c = chips[i];
      if (pointInCircle(x, y, c.x, c.y, c.r)) {
        dragging = c;
        c.held = true;
        dragOffset.x = x - c.x;
        dragOffset.y = y - c.y;
        focus = { area: "chips", index: i };
        return;
      }
    }
    // Check operators
    for (let i = 0; i < operators.length; i++) {
      const op = operators[i];
      if (pointInCircle(x, y, op.x, op.y, op.r)) {
        // place operator into operator slot
        slots.operator.content = op.op;
        focus = { area: "ops", index: i };
        announce(`Operator ${op.op} selected`);
        playSelectOp();
        return;
      }
    }
    // Check run button
    if (
      x >= runButton.x - runButton.w / 2 &&
      x <= runButton.x + runButton.w / 2 &&
      y >= runButton.y - runButton.h / 2 &&
      y <= runButton.y + runButton.h / 2
    ) {
      runButton.hot = true;
      runMachine();
      return;
    }
    // Reset button
    if (
      x >= resetButton.x &&
      x <= resetButton.x + resetButton.w &&
      y >= resetButton.y &&
      y <= resetButton.y + resetButton.h
    ) {
      resetRound();
      return;
    }
  }

  function handlePointerMove(x, y) {
    if (dragging) {
      dragging.x = x - dragOffset.x;
      dragging.y = y - dragOffset.y;
    }
  }

  function handlePointerUp(x, y) {
    if (dragging) {
      // Check if over slot A or B
      if (pointInCircle(x, y, slots.A.x, slots.A.y, slots.A.r + 12)) {
        slots.A.content = dragging.num;
        announce(`Placed ${dragging.num} into Slot A`);
        playPlace();
        // return chip to original position (or hide)
        removeChip(dragging.id);
      } else if (pointInCircle(x, y, slots.B.x, slots.B.y, slots.B.r + 12)) {
        slots.B.content = dragging.num;
        announce(`Placed ${dragging.num} into Slot B`);
        playPlace();
        removeChip(dragging.id);
      } else {
        // return to original position
        dragging.x = dragging.originalX;
        dragging.y = dragging.originalY;
        dragging.held = false;
      }
      dragging.held = false;
      dragging = null;
    }
    runButton.hot = false;
  }

  function removeChip(id) {
    // remove chip from chips array by id (and keep others)
    const idx = chips.findIndex((c) => c.id === id);
    if (idx >= 0) chips.splice(idx, 1);
  }

  // Run the machine: animate and check answer
  let animating = false;
  async function runMachine() {
    if (animating) return;
    // Need two slots and operator
    if (slots.A.content === null || slots.B.content === null || slots.operator.content === null) {
      announce("Please place two numbers and choose an operator before running.");
      playBeep(false);
      return;
    }
    animating = true;
    attempts++;
    announce("Running machine...");
    // Simple animation: spin and conveyor
    const duration = 1000;
    const from = performance.now();

    // Prepare steam particles
    steamParticles.length = 0;
    for (let i = 0; i < 6; i++) {
      steamParticles.push({
        x: 360 + randInt(-10, 10),
        y: 120 + randInt(-6, 6),
        vx: (Math.random() - 0.5) * 0.4,
        vy: -1 - Math.random() * 0.6,
        life: 600 + Math.random() * 600,
        size: 12 + Math.random() * 12,
        start: performance.now() + i * 20,
      });
    }

    function animFrame(now) {
      const t = clamp((now - from) / duration, 0, 1);
      // update conveyor offset
      conveyorOffset = (conveyorOffset + 1.2) % 40;
      render(now);

      // overlay running effects: steam particles
      ctx.save();
      steamParticles.forEach((p) => {
        const age = now - p.start;
        if (age < 0) return;
        const lifeRatio = age / p.life;
        if (lifeRatio > 1) return;
        const cx = p.x + p.vx * age * 0.04;
        const cy = p.y + p.vy * age * 0.06 - lifeRatio * 20;
        ctx.globalAlpha = 0.35 * (1 - lifeRatio);
        ctx.beginPath();
        ctx.fillStyle = "#ffffff";
        ctx.ellipse(
          cx,
          cy,
          p.size * (0.6 + lifeRatio * 0.6),
          p.size * 0.5 * (0.6 + lifeRatio * 0.6),
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
      ctx.restore();

      if (t < 1) {
        requestAnimationFrame(animFrame);
      } else {
        animating = false;
        evaluateAnswer();
      }
    }
    requestAnimationFrame(animFrame);

    // Play running sound (short whoosh + hum)
    if (audioCtx && audioAllowed) {
      try {
        const now = audioCtx.currentTime;
        // whoosh
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.8);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.95);
      } catch (e) {
        console.warn("Run sound error:", e && e.message);
      }
    }
  }

  function evaluateAnswer() {
    const a = Number(slots.A.content);
    const b = Number(slots.B.content);
    const op = slots.operator.content;
    const compute = (x, y, o) => (o === "+" ? x + y : o === "-" ? x - y : x * y);
    const result = compute(a, b, op);
    if (result === targetNumber) {
      score++;
      announce(`Correct! ${a} ${op} ${b} = ${result}. Well done!`);
      playSuccess();
      // reward animation and next round
      setTimeout(() => {
        level = Math.min(3, 1 + Math.floor(score / 3)); // level up every 3 points
        generateRound();
      }, 800);
    } else {
      playFail();
      if (attempts >= maxAttempts) {
        // reveal solution and reset round
        announce(
          `Oops, no more attempts. The correct solution was ${solution.a} ${solution.op} ${solution.b} = ${targetNumber}.`
        );
        // show solution in slots
        slots.A.content = solution.a;
        slots.B.content = solution.b;
        slots.operator.content = solution.op;
        // prepare next round after pause
        setTimeout(() => {
          generateRound();
        }, 1600);
      } else {
        announce(
          `Not quite. ${a} ${op} ${b} = ${result}. Try again. Attempts left: ${maxAttempts - attempts}.`
        );
      }
    }
  }

  // Reset round: return all chips and clear slots
  function resetRound() {
    // Recreate chips at original positions and clear slots
    chips.length = 0;
    generateRound();
    announce("Round reset.");
  }

  // Keyboard controls
  window.addEventListener("keydown", (e) => {
    if (!running) {
      if (e.key === "Enter" || e.key === " ") {
        startGame();
        e.preventDefault();
      }
      return;
    }
    const area = focus.area;
    if (e.key === "Tab") {
      e.preventDefault();
      // cycle focus: chips -> ops -> run -> reset -> chips ...
      const order = ["chips", "ops", "run", "reset"];
      let idx = order.indexOf(area);
      idx = (idx + 1) % order.length;
      setFocusArea(order[idx], 0);
      return;
    }
    if (area === "chips") {
      if (e.key === "ArrowRight") {
        focus.index = (focus.index + 1) % Math.max(1, chips.length);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        focus.index = (focus.index - 1 + Math.max(1, chips.length)) % Math.max(1, chips.length);
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        // select chip to place: if slot A empty place in A else in B
        const c = chips[focus.index];
        if (!c) return;
        if (slots.A.content === null) {
          slots.A.content = c.num;
          announce(`Placed ${c.num} into Slot A`);
          removeChip(c.id);
          playPlace();
        } else if (slots.B.content === null) {
          slots.B.content = c.num;
          announce(`Placed ${c.num} into Slot B`);
          removeChip(c.id);
          playPlace();
        } else {
          announce("Both slots are full. Use Reset to try different chips or remove a placed number.");
        }
        e.preventDefault();
      }
    } else if (area === "ops") {
      if (e.key === "ArrowRight") {
        focus.index = (focus.index + 1) % Math.max(1, operators.length);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        focus.index = (focus.index - 1 + Math.max(1, operators.length)) % Math.max(1, operators.length);
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        const op = operators[focus.index];
        if (op) {
          slots.operator.content = op.op;
          announce(`Operator ${op.op} selected`);
          playSelectOp();
        }
        e.preventDefault();
      }
    } else if (area === "run") {
      if (e.key === "Enter" || e.key === " ") {
        runMachine();
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        setFocusArea("ops", 0);
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        setFocusArea("reset", 0);
        e.preventDefault();
      }
    } else if (area === "reset") {
      if (e.key === "Enter" || e.key === " ") {
        resetRound();
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        setFocusArea("run", 0);
        e.preventDefault();
      }
    }
  });

  function setFocusArea(areaName, idx) {
    focus.area = areaName;
    focus.index = idx || 0;
    announce(`Focus on ${areaName}`);
  }

  // Start screen and start game
  function drawStartScreen() {
    drawBackground();
    ctx.save();
    ctx.fillStyle = "#073642";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Machine Math", WIDTH / 2, 80);
    ctx.font = "16px sans-serif";
    ctx.fillText("Build a friendly machine to make the target number!", WIDTH / 2, 110);

    // Start button
    ctx.fillStyle = "#a8e1e5";
    ctx.strokeStyle = "#4aa1a9";
    roundRect(ctx, WIDTH / 2 - 90, HEIGHT / 2 - 26, 180, 52, 12, true, true);
    ctx.fillStyle = "#05343a";
    ctx.font = "20px sans-serif";
    ctx.fillText("Click or press Enter to Start", WIDTH / 2, HEIGHT / 2 + 8);

    // Small instructions
    ctx.fillStyle = "#2b4f56";
    ctx.font = "14px sans-serif";
    ctx.fillText(
      "Drag a number into Slot A and B, choose an operator, then press RUN.",
      WIDTH / 2,
      HEIGHT / 2 + 80
    );
    ctx.fillText(
      "You can also use the keyboard: Tab to cycle focus, arrows to move, Enter to pick.",
      WIDTH / 2,
      HEIGHT / 2 + 100
    );
    ctx.restore();
  }

  async function startGame() {
    // try to init audio on user gesture
    const ok = await initAudio();
    if (!ok) {
      announce("Audio unavailable. The game will play silently.");
    } else {
      announce("Audio enabled.");
    }
    running = true;
    score = 0;
    level = 1;
    roundIndex = 0;
    generateRound();
    setFocusArea("chips", 0);
    // Start animation
    cancelAnimationFrame(startRenderId);
    animate();
  }

  // Animation loop
  let raf = null;
  function animate(time) {
    render(time);
    raf = requestAnimationFrame(animate);
  }

  // Initial draw: start screen
  drawStartScreen();

  // Initialize by rendering start screen repeatedly so it's animated slightly
  let startRenderId = requestAnimationFrame(function loop(t) {
    drawStartScreen();
    startRenderId = requestAnimationFrame(loop);
  });

  // Safety: ensure audio is handled on page visibility change
  document.addEventListener("visibilitychange", () => {
    if (!audioCtx) return;
    if (document.hidden && audioCtx.state === "running") {
      audioCtx.suspend().catch(() => {});
    } else if (audioCtx && audioAllowed && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  });

  // Error handling for context resume
  window.addEventListener("unhandledrejection", (e) => {
    console.warn("Unhandled rejection:", e && e.reason);
  });

  // Expose restart via double-click for quick testing (accessible)
  canvas.addEventListener("dblclick", () => {
    if (running) {
      resetRound();
    }
  });

  // Ensure the canvas is focusable for keyboard
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  canvas.addEventListener("focus", () => {
    // show focus hint
    announce("Canvas focused. Use Tab to cycle focus, arrow keys and Enter to control.");
  });

  // Provide instructions in live region at load
  announce(
    "Welcome to Machine Math. Click the canvas or press Enter to start the game. Use drag-and-drop or keyboard to place numbers and operator then press Run."
  );
})();