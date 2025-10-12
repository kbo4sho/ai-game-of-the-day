(function () {
  // Enhanced Machine Math Game
  // Visual and audio improvements only. Game mechanics unchanged.
  // Renders in element with id "game-of-the-day-stage"

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL_CORRECT = 10;
  const MAX_WRONG = 3;
  const UI_PADDING = 12;
  const BG_BASE = "#eaf6ff";
  const MACHINE_COLOR = "#dff3fb";
  const GEAR_COLOR = "#8fb3d2";
  const TEXT_COLOR = "#12303a";
  const ACCENT = "#ff9f1c";
  const BAD_ACCENT = "#ff6b6b";
  const SHADOW = "rgba(16,28,38,0.12)";

  // State
  let container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error('Element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Canvas setup
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.style.display = "block";
  canvas.style.background = BG_BASE;
  canvas.setAttribute("tabindex", "0");
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Machine Math game. Solve addition and subtraction to fix the machine. Press Enter to start."
  );
  container.innerHTML = "";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Canvas 2D context not available.");
    return;
  }

  // Audio
  let audioCtx = null;
  let audioAvailable = false;
  let bgMasterGain = null;
  let bgNodes = []; // for background oscillators
  let isMuted = false;

  // Game state
  let gameState = "menu"; // menu, playing, win, lose
  let correctCount = 0;
  let wrongCount = 0;
  let question = null;
  let choices = [];
  let selectedIndex = -1;
  let buttons = [];
  let keyboardSelection = 0;
  let lastInteractionTime = 0;
  let lastAnswerResult = null; // "correct" | "incorrect" | null
  let lastAnswerTime = 0;
  let endButtonRect = null;
  let prevGameState = null;

  // Decorative particles for subtle motion
  const particles = [];
  for (let i = 0; i < 18; i++) {
    particles.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      r: 6 + Math.random() * 18,
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.02,
      alpha: 0.06 + Math.random() * 0.06,
    });
  }

  // Utility functions
  function safeMeasureText(text, font) {
    ctx.save();
    if (font) ctx.font = font;
    const metrics = ctx.measureText(String(text));
    ctx.restore();
    return metrics;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function isPointInRect(px, py, rect) {
    if (!rect) return false;
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === "undefined") r = 6;
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

  function wrapTextToLines(text, maxWidth, font) {
    ctx.save();
    ctx.font = font;
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (const w of words) {
      const test = current ? current + " " + w : w;
      const m = ctx.measureText(test).width;
      if (m > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    ctx.restore();
    return lines;
  }

  // Audio initialization - create layered ambient hum using oscillators and gentle LFOs
  function initAudio() {
    if (audioCtx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        audioAvailable = false;
        console.warn("Web Audio API not supported.");
        return;
      }
      audioCtx = new Ctx();
      audioAvailable = true;
      // Master gain
      bgMasterGain = audioCtx.createGain();
      bgMasterGain.gain.value = isMuted ? 0 : 0.035;
      bgMasterGain.connect(audioCtx.destination);

      // Create 3 background oscillators at different octaves with LFOs for motion
      const baseFreqs = [80, 132, 208];
      bgNodes = baseFreqs.map((freq, idx) => {
        const osc = audioCtx.createOscillator();
        osc.type = idx === 1 ? "sine" : "triangle";
        osc.frequency.value = freq;
        const filter = audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 600;
        // gentle LFO to modulate gain for breathing
        const lfo = audioCtx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.08 + idx * 0.03;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 0.02 + idx * 0.01;
        lfo.connect(lfoGain);
        // connect
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.015 + idx * 0.01;
        lfoGain.connect(gainNode.gain);
        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(bgMasterGain);
        try {
          osc.start();
          lfo.start();
        } catch (e) {
          // older browsers may throw if started twice; ignore
        }
        return { osc, lfo, lfoGain, gainNode, filter };
      });

      // gentle subtle metallic clicks via periodic impulse (implemented with oscillator burst on interval)
      // We'll not schedule persistent intervals here; play on demand.

      isMuted = false;
    } catch (err) {
      console.error("Audio initialization failed:", err);
      audioAvailable = false;
      audioCtx = null;
    }
  }

  function resumeAudioIfNeeded() {
    if (!audioAvailable || !audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => {
        console.warn("Audio resume failed:", e);
      });
    }
  }

  function toggleMute() {
    if (!audioAvailable) {
      initAudio();
    }
    if (!audioAvailable) return;
    isMuted = !isMuted;
    if (bgMasterGain) {
      bgMasterGain.gain.value = isMuted ? 0 : 0.035;
    }
  }

  // Sound effects - generated with Web Audio API oscillators/pulse envelopes
  function safeStop(node) {
    try {
      if (node && typeof node.stop === "function") node.stop();
    } catch (e) {
      // ignore
    }
  }

  function playCorrectSound() {
    if (!audioAvailable || !audioCtx) return;
    resumeAudioIfNeeded();
    try {
      const t = audioCtx.currentTime;
      // small ascending arpeggio of 3 notes
      const freqs = [880, 1100, 1320];
      freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = i === 1 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(f, t + i * 0.05);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.14, t + i * 0.05 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + 0.45);
        const hp = audioCtx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 400;
        osc.connect(hp);
        hp.connect(g);
        g.connect(audioCtx.destination);
        osc.start(t + i * 0.05);
        safeStop(osc);
        try {
          osc.stop(t + i * 0.05 + 0.5);
        } catch (e) {}
      });
    } catch (err) {
      console.warn("Error playing correct sound:", err);
    }
  }

  function playIncorrectSound() {
    if (!audioAvailable || !audioCtx) return;
    resumeAudioIfNeeded();
    try {
      const t = audioCtx.currentTime;
      // low square thud with quick decay
      const osc = audioCtx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(160, t);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      osc.connect(lp);
      lp.connect(g);
      g.connect(audioCtx.destination);
      osc.start(t);
      safeStop(osc);
      try {
        osc.stop(t + 0.6);
      } catch (e) {}
      // add a short metallic click above
      const click = audioCtx.createOscillator();
      click.type = "triangle";
      click.frequency.setValueAtTime(1400, t);
      const cg = audioCtx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.08, t + 0.005);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      click.connect(cg);
      cg.connect(audioCtx.destination);
      click.start(t);
      safeStop(click);
      try {
        click.stop(t + 0.12);
      } catch (e) {}
    } catch (err) {
      console.warn("Error playing incorrect sound:", err);
    }
  }

  function playWinSound() {
    if (!audioAvailable || !audioCtx) return;
    resumeAudioIfNeeded();
    try {
      const t = audioCtx.currentTime;
      const chord = [440, 550, 660]; // pleasant major-ish cluster
      chord.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? "sine" : "sawtooth";
        o.frequency.setValueAtTime(f, t + i * 0.04);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.04);
        g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.04 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.04 + 1.2);
        const lp = audioCtx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1200;
        o.connect(lp);
        lp.connect(g);
        g.connect(audioCtx.destination);
        o.start(t + i * 0.04);
        safeStop(o);
        try {
          o.stop(t + i * 0.04 + 1.25);
        } catch (e) {}
      });
    } catch (err) {
      console.warn("Error playing win sound:", err);
    }
  }

  function playLoseSound() {
    if (!audioAvailable || !audioCtx) return;
    resumeAudioIfNeeded();
    try {
      const t = audioCtx.currentTime;
      // low descending tone
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.7);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      o.connect(lp);
      lp.connect(g);
      g.connect(audioCtx.destination);
      o.start(t);
      safeStop(o);
      try {
        o.stop(t + 1.25);
      } catch (e) {}
      // subtle metallic chime after
      setTimeout(() => {
        if (!audioAvailable || !audioCtx) return;
        const t2 = audioCtx.currentTime;
        const c = audioCtx.createOscillator();
        c.type = "triangle";
        c.frequency.setValueAtTime(720, t2);
        const cg = audioCtx.createGain();
        cg.gain.setValueAtTime(0.0001, t2);
        cg.gain.exponentialRampToValueAtTime(0.06, t2 + 0.02);
        cg.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.6);
        c.connect(cg);
        cg.connect(audioCtx.destination);
        c.start(t2);
        safeStop(c);
        try {
          c.stop(t2 + 0.65);
        } catch (e) {}
      }, 420);
    } catch (err) {
      console.warn("Error playing lose sound:", err);
    }
  }

  // Game logic (unchanged)
  function generateQuestion() {
    const operation = Math.random() < 0.6 ? "+" : "-";
    let a;
    let b;
    if (operation === "+") {
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * 20) + 0;
    } else {
      a = Math.floor(Math.random() * 20) + 5;
      b = Math.floor(Math.random() * 10) + 0;
      if (b > a) [a, b] = [b, a];
    }
    const correct = operation === "+" ? a + b : a - b;
    const distractors = new Set();
    while (distractors.size < 3) {
      let delta = Math.floor(Math.random() * 7) - 3;
      let candidate = correct + delta;
      if (candidate !== correct && candidate >= 0 && candidate <= 40) {
        distractors.add(candidate);
      }
    }
    choices = shuffleArray([correct, ...Array.from(distractors)]);
    question = {
      text: `${a} ${operation} ${b} = ?`,
      answer: correct,
    };
    selectedIndex = -1;
    keyboardSelection = 0;
    buildButtonsForChoices();
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildButtonsForChoices() {
    buttons = [];
    const cols = 2;
    const rows = 2;
    const btnWidth = 300;
    const btnHeight = 64;
    const startX = (WIDTH - (btnWidth * cols + UI_PADDING * (cols - 1))) / 2;
    const startY = HEIGHT / 2 + 10;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (btnWidth + UI_PADDING);
        const y = startY + r * (btnHeight + UI_PADDING);
        buttons.push({
          x,
          y,
          w: btnWidth,
          h: btnHeight,
          text: String(choices[idx]),
          index: idx,
        });
        idx++;
      }
    }
  }

  function handleAnswer(index) {
    if (gameState !== "playing" || index < 0 || index >= choices.length) return;
    lastInteractionTime = performance.now();
    const chosen = choices[index];
    if (chosen === question.answer) {
      correctCount++;
      lastAnswerResult = "correct";
      lastAnswerTime = performance.now();
      playCorrectSound();
    } else {
      wrongCount++;
      lastAnswerResult = "incorrect";
      lastAnswerTime = performance.now();
      playIncorrectSound();
    }
    if (correctCount >= GOAL_CORRECT) {
      gameState = "win";
    } else if (wrongCount >= MAX_WRONG) {
      gameState = "lose";
    } else {
      generateQuestion();
    }
  }

  function startGame() {
    correctCount = 0;
    wrongCount = 0;
    gameState = "playing";
    generateQuestion();
    resumeAudioIfNeeded();
  }

  function restartGame() {
    startGame();
  }

  // Drawing functions - all canvas
  function clear() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
  }

  function drawBackground(t) {
    // soft two-tone gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#f6fcff");
    g.addColorStop(1, "#eaf6ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle vignette
    const vg = ctx.createRadialGradient(WIDTH * 0.7, HEIGHT * 0.2, 80, WIDTH / 2, HEIGHT / 2, 700);
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(1, "rgba(12,30,40,0.03)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // drifting soft blobs (particles)
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      // gentle wrap
      if (p.x < -p.r) p.x = WIDTH + p.r;
      if (p.x > WIDTH + p.r) p.x = -p.r;
      if (p.y < -p.r) p.y = HEIGHT + p.r;
      if (p.y > HEIGHT + p.r) p.y = -p.r;
      const radGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      radGrad.addColorStop(0, `rgba(220,245,255,${p.alpha * 1.0})`);
      radGrad.addColorStop(1, `rgba(220,245,255,0)`);
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawMachineAndRobot(t) {
    // machine casing
    ctx.save();
    ctx.shadowColor = SHADOW;
    ctx.shadowBlur = 18;
    ctx.fillStyle = MACHINE_COLOR;
    roundRect(ctx, 40, 60, WIDTH - 80, HEIGHT - 160, 20, true, false);
    ctx.restore();

    // front panel with glass sheen
    ctx.save();
    const panelX = 60,
      panelY = 80,
      panelW = WIDTH - 120,
      panelH = HEIGHT - 200;
    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panelGrad.addColorStop(0, "rgba(255,255,255,0.42)");
    panelGrad.addColorStop(0.2, "rgba(255,255,255,0.08)");
    panelGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = panelGrad;
    roundRect(ctx, panelX, panelY, panelW, panelH, 14, true, false);
    ctx.restore();

    // stylized gears - improved rendering with subtle highlights
    function drawGear(cx, cy, r, teeth, rotation, color) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      // teeth
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const angle = (i / teeth) * Math.PI * 2;
        const outer = r * 1.15;
        const inner = r * 0.72;
        const a1 = angle;
        const a2 = angle + (Math.PI * 2) / (teeth * 2);
        const x1 = Math.cos(a1) * outer;
        const y1 = Math.sin(a1) * outer;
        const x2 = Math.cos(a2) * inner;
        const y2 = Math.sin(a2) * inner;
        if (i === 0) ctx.moveTo(x1, y1);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // center
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#eaf7fb";
      ctx.fill();
      // highlight
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.ellipse(-r * 0.25, -r * 0.25, r * 0.25, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const now = t || performance.now();
    drawGear(150, 160, 44, 12, now / 1200, "#bfe0ee");
    drawGear(320, 240, 60, 16, -now / 1700, "#9fc2d8");
    drawGear(540, 170, 36, 10, now / 900, "#b7dbe6");

    // pipes, bolts, and indicator lights
    ctx.save();
    ctx.fillStyle = "#cfeaf6";
    roundRect(ctx, 80, 220, 560, 18, 8, true, false);
    roundRect(ctx, 120, 260, 420, 14, 7, true, false);
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.fillStyle = "#9fb0bd";
      ctx.arc(100 + i * 70, 220 + 9, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // indicator lights that pulse with progress
    for (let i = 0; i < 5; i++) {
      const px = 100 + i * 120;
      const py = 120;
      const lit = i < Math.floor((correctCount / GOAL_CORRECT) * 5);
      const pulse = 0.4 + Math.sin(now / 600 + i) * 0.15;
      ctx.beginPath();
      const grad = ctx.createRadialGradient(px - 6, py - 6, 0, px, py, 14);
      grad.addColorStop(0, lit ? `rgba(255,255,255,${0.9 * pulse})` : "rgba(255,255,255,0.4)");
      grad.addColorStop(1, lit ? "rgba(255,160,40,0.9)" : "rgba(190,210,220,0.6)");
      ctx.fillStyle = grad;
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Wacky robot character - responsive eyes and subtle idle bob
    const robotX = 88;
    const robotY = HEIGHT - 120;
    const bob = Math.sin(now / 600) * 4;
    ctx.save();
    ctx.translate(robotX, robotY + bob);
    // body
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#c8e6f2";
    roundRect(ctx, -8, -64, 120, 96, 14, true, true);
    // screen
    ctx.fillStyle = "#def7ff";
    roundRect(ctx, 8, -54, 60, 44, 8, true, false);
    // eyes: two LEDs that react
    const eyeLx = 34;
    const eyeLy = -34;
    const eyeR = 8;
    // determine eye color based on lastAnswerResult (temporary flash)
    const since = performance.now() - lastAnswerTime || 99999;
    let eyeColor = "#2b6cff";
    if (lastAnswerResult === "correct" && since < 900) eyeColor = "#2fb56b";
    if (lastAnswerResult === "incorrect" && since < 900) eyeColor = "#ff6b6b";
    // blink animation
    const blink = (Math.sin(now / 400) + 1) * 0.5;
    const isBlink = Math.floor(now / 2500) % 4 === 0 && blink > 0.9;
    ctx.beginPath();
    ctx.fillStyle = "#0c2b33";
    ctx.ellipse(eyeLx, eyeLy, 6, isBlink ? 1 : 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eyeLx + 20, eyeLy, 6, isBlink ? 1 : 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // pupil glow
    ctx.beginPath();
    ctx.fillStyle = eyeColor;
    ctx.arc(eyeLx, eyeLy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeLx + 20, eyeLy, 3, 0, Math.PI * 2);
    ctx.fill();
    // antenna
    ctx.strokeStyle = "#c8e6f2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(100, -58);
    ctx.lineTo(110, -88);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = eyeColor;
    ctx.arc(110, -88, 6, 0, Math.PI * 2);
    ctx.fill();
    // happy smile if winning soon
    ctx.restore();
  }

  function drawUI() {
    // Top-left: score
    ctx.save();
    ctx.font = "18px Inter, system-ui, sans-serif";
    ctx.fillStyle = TEXT_COLOR;
    const scoreText = `Fixed: ${correctCount}/${GOAL_CORRECT}`;
    const scoreMetrics = safeMeasureText(scoreText, ctx.font);
    const scoreX = UI_PADDING;
    const scoreY = 28;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, scoreX, scoreY - 18, Math.ceil(scoreMetrics.width) + 22, 26, 8, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(scoreText, scoreX + 12, scoreY);
    ctx.restore();

    // Top-right: faults
    ctx.save();
    ctx.font = "18px Inter, system-ui, sans-serif";
    const livesText = `Faults: ${wrongCount}/${MAX_WRONG}`;
    const livesMetrics = safeMeasureText(livesText, ctx.font);
    const livesW = Math.ceil(livesMetrics.width) + 22;
    const livesX = WIDTH - livesW - UI_PADDING;
    const livesY = 28;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, livesX, livesY - 18, livesW, 26, 8, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(livesText, livesX + 12, livesY);
    ctx.restore();

    // Audio toggle icon (non-overlapping)
    const audioSize = 22;
    const iconX = livesX - audioSize - 10;
    const iconY = 12;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, iconX - 8, iconY - 8, audioSize + 16, audioSize + 16, 8, true, false);
    // speaker
    ctx.beginPath();
    ctx.fillStyle = TEXT_COLOR;
    ctx.rect(iconX, iconY + 6, 8, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(iconX + 8, iconY + 6);
    ctx.lineTo(iconX + 18, iconY + 2);
    ctx.lineTo(iconX + 18, iconY + 26);
    ctx.closePath();
    ctx.fill();
    if (isMuted || !audioAvailable) {
      ctx.strokeStyle = BAD_ACCENT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(iconX + 2, iconY + 2);
      ctx.lineTo(iconX + audioSize + 10, iconY + audioSize + 4);
      ctx.stroke();
    } else {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(iconX + 20, iconY + 13, 6, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();

    // Instructions bottom-center
    ctx.save();
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.fillStyle = TEXT_COLOR;
    const instructions =
      "Answer 10 questions to fix the machine. 3 mistakes and it stops. Click or press 1-4 to choose. Press M to toggle sound.";
    const maxWidth = WIDTH - 48;
    const lines = wrapTextToLines(instructions, maxWidth, ctx.font);
    const lineHeight = 18;
    const totalHeight = lines.length * lineHeight;
    const startY = HEIGHT - UI_PADDING - totalHeight;
    const widest = Math.max(...lines.map((ln) => safeMeasureText(ln, ctx.font).width));
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, (WIDTH - widest) / 2 - 14, startY - 12, widest + 28, totalHeight + 18, 10, true, false);
    ctx.fillStyle = TEXT_COLOR;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], (WIDTH - widest) / 2, startY + i * lineHeight + 12);
    }
    ctx.restore();
  }

  function drawQuestionArea() {
    if (!question) return;
    ctx.save();
    ctx.font = "26px Inter, system-ui, sans-serif";
    ctx.fillStyle = TEXT_COLOR;
    const qText = question.text;
    const metrics = safeMeasureText(qText, ctx.font);
    const boxW = Math.ceil(metrics.width) + 48;
    const boxH = 64;
    const x = (WIDTH - boxW) / 2;
    const y = HEIGHT / 2 - 120;
    // frosted glass panel
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundRect(ctx, x, y, boxW, boxH, 12, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(qText, x + 24, y + 40);
    // hint
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#3b5a66";
    ctx.fillText("Solve to power the machine!", x + 24, y + 58);
    ctx.restore();
  }

  function drawChoiceButtons() {
    ctx.save();
    ctx.font = "20px Inter, system-ui, sans-serif";
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      // subtle shadow
      ctx.save();
      ctx.shadowColor = "rgba(10,20,30,0.08)";
      ctx.shadowBlur = 10;
      // button fill changes slightly if highlighted
      const isActive = i === selectedIndex || i === keyboardSelection;
      ctx.fillStyle = isActive ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.96)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 12, true, false);
      ctx.restore();

      // border
      ctx.lineWidth = isActive ? 4 : 2;
      ctx.strokeStyle = isActive ? ACCENT : "#dfeff6";
      roundRect(ctx, b.x, b.y, b.w, b.h, 12, false, true);

      // gentle floating for selected button
      const floatOffset = isActive ? Math.sin(performance.now() / 300) * 4 : 0;
      ctx.fillStyle = TEXT_COLOR;
      const text = `${i + 1}. ${b.text}`;
      const metrics = safeMeasureText(text, ctx.font);
      ctx.fillText(text, b.x + (b.w - metrics.width) / 2, b.y + b.h / 2 + 8 + floatOffset);
    }
    ctx.restore();
  }

  function drawEndScreen() {
    ctx.save();
    ctx.fillStyle = "rgba(6,12,18,0.48)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // panel
    ctx.font = "32px Inter, system-ui, sans-serif";
    const title = gameState === "win" ? "Victory!" : "Machine Failed";
    const message =
      gameState === "win"
        ? "You powered up the machine! Great engineering!"
        : "Too many faults. The machine stopped working.";
    const titleMetrics = safeMeasureText(title, ctx.font);
    const titleX = (WIDTH - titleMetrics.width) / 2;
    const titleY = HEIGHT / 2 - 40;
    ctx.fillStyle = ACCENT;
    roundRect(ctx, titleX - 18, titleY - 36, titleMetrics.width + 36, 60, 10, true, false);
    ctx.fillStyle = "white";
    ctx.fillText(title, titleX, titleY);
    ctx.font = "17px Inter, system-ui, sans-serif";
    const msgMetrics = safeMeasureText(message, ctx.font);
    const msgX = (WIDTH - msgMetrics.width) / 2;
    const msgY = HEIGHT / 2;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    roundRect(ctx, msgX - 18, msgY - 30, msgMetrics.width + 36, 48, 10, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(message, msgX, msgY);
    // Restart button
    const btnText = "Restart";
    ctx.font = "20px Inter, system-ui, sans-serif";
    const btnMetrics = safeMeasureText(btnText, ctx.font);
    const btnW = btnMetrics.width + 44;
    const btnH = 46;
    const btnX = (WIDTH - btnW) / 2;
    const btnY = HEIGHT / 2 + 60;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, btnX, btnY, btnW, btnH, 10, true, false);
    ctx.fillStyle = "#12303a";
    ctx.fillText(btnText, btnX + (btnW - btnMetrics.width) / 2, btnY + 30);
    ctx.font = "13px Inter, system-ui, sans-serif";
    const instr = "Press Enter or click Restart to play again.";
    const instrMetrics = safeMeasureText(instr, ctx.font);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(instr, (WIDTH - instrMetrics.width) / 2, btnY + btnH + 26);
    ctx.restore();
    endButtonRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  }

  function drawMainMenu() {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    const title = "Machine Math";
    ctx.font = "42px Inter, system-ui, sans-serif";
    const metrics = safeMeasureText(title, ctx.font);
    const x = (WIDTH - metrics.width) / 2;
    const y = HEIGHT / 2 - 48;
    roundRect(ctx, x - 24, y - 56, metrics.width + 48, 92, 14, true, false);
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(title, x, y);
    ctx.font = "16px Inter, system-ui, sans-serif";
    const text =
      "Help the friendly machine by answering 10 math questions. 3 mistakes and the machine stops.";
    const lines = wrapTextToLines(text, 520, ctx.font);
    const lineHeight = 20;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], (WIDTH - safeMeasureText(lines[i], ctx.font).width) / 2, y + 36 + i * lineHeight);
    }
    // Start button
    ctx.font = "20px Inter, system-ui, sans-serif";
    const btnText = "Start";
    const btnMetrics = safeMeasureText(btnText, ctx.font);
    const btnW = btnMetrics.width + 48;
    const btnH = 48;
    const btnX = (WIDTH - btnW) / 2;
    const btnY = y + 120;
    ctx.fillStyle = ACCENT;
    roundRect(ctx, btnX, btnY, btnW, btnH, 12, true, false);
    ctx.fillStyle = "white";
    ctx.fillText(btnText, btnX + (btnW - btnMetrics.width) / 2, btnY + 32);
    ctx.restore();
    endButtonRect = { x: btnX, y: btnY, w: btnW, h: btnH };
  }

  function draw(timestamp) {
    clear();
    drawBackground(timestamp);
    drawMachineAndRobot(timestamp);
    drawUI();

    if (gameState === "menu") {
      drawMainMenu();
    } else if (gameState === "playing") {
      drawQuestionArea();
      drawChoiceButtons();
    } else if (gameState === "win" || gameState === "lose") {
      drawQuestionArea();
      drawChoiceButtons();
      drawEndScreen();
    }
  }

  // Input handling - mouse/touch/keyboard
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    lastInteractionTime = performance.now();

    if (!audioCtx) initAudio();

    // compute audio icon area
    ctx.font = "18px Inter, system-ui, sans-serif";
    const livesText = `Faults: ${wrongCount}/${MAX_WRONG}`;
    const livesMetrics = safeMeasureText(livesText, ctx.font);
    const livesW = Math.ceil(livesMetrics.width) + 22;
    const livesX = WIDTH - livesW - UI_PADDING;
    const iconX = livesX - 22 - 10;
    const iconY = 12;
    if (mx >= iconX - 8 && mx <= iconX + 28 && my >= iconY - 8 && my <= iconY + 28) {
      if (audioAvailable) {
        toggleMute();
      } else {
        initAudio();
      }
      return;
    }

    if (gameState === "menu") {
      if (isPointInRect(mx, my, endButtonRect)) {
        startGame();
      }
    } else if (gameState === "playing") {
      for (const b of buttons) {
        if (isPointInRect(mx, my, b)) {
          handleAnswer(b.index);
          return;
        }
      }
    } else if (gameState === "win" || gameState === "lose") {
      if (isPointInRect(mx, my, endButtonRect)) {
        restartGame();
      }
    }
  });

  canvas.addEventListener("touchstart", (e) => {
    try {
      canvas.focus();
    } catch (err) {}
    if (!audioCtx) initAudio();
  });

  canvas.addEventListener("mousedown", () => {
    try {
      canvas.focus();
    } catch (e) {}
  });

  // Keyboard controls
  canvas.addEventListener("keydown", (e) => {
    lastInteractionTime = performance.now();
    if (!audioCtx) initAudio();
    const key = e.key;
    if (gameState === "menu") {
      if (key === "Enter" || key === " ") {
        startGame();
        e.preventDefault();
      }
    } else if (gameState === "playing") {
      if (["1", "2", "3", "4"].includes(key)) {
        const idx = parseInt(key, 10) - 1;
        handleAnswer(idx);
        e.preventDefault();
      } else if (key === "ArrowLeft" || key === "ArrowUp") {
        keyboardSelection = (keyboardSelection - 1 + buttons.length) % buttons.length;
        e.preventDefault();
      } else if (key === "ArrowRight" || key === "ArrowDown") {
        keyboardSelection = (keyboardSelection + 1) % buttons.length;
        e.preventDefault();
      } else if (key === "Enter") {
        handleAnswer(keyboardSelection);
        e.preventDefault();
      }
    } else if (gameState === "win" || gameState === "lose") {
      if (key === "Enter" || key === " ") {
        restartGame();
        e.preventDefault();
      }
    }
    if (key.toLowerCase() === "m") {
      if (!audioAvailable) initAudio();
      toggleMute();
      e.preventDefault();
    }
  });

  // Global keydown to keep focus on canvas for accessibility
  document.addEventListener("keydown", (e) => {
    if (document.activeElement !== canvas) {
      try {
        canvas.focus();
      } catch (err) {}
    }
  });

  // Visual selection highlight sync
  function updateSelectionHighlight() {
    if (gameState === "playing") {
      selectedIndex = keyboardSelection;
    } else {
      selectedIndex = -1;
    }
  }

  // Animation loop with state transition sound triggers
  function loop(ts) {
    updateSelectionHighlight();
    draw(ts);

    // trigger win/lose sounds when state changes
    if (prevGameState !== gameState) {
      if (gameState === "win") {
        playWinSound();
      } else if (gameState === "lose") {
        playLoseSound();
      }
      prevGameState = gameState;
    }
    requestAnimationFrame(loop);
  }

  // Initialize
  gameState = "menu";
  generateQuestion();
  prevGameState = gameState;
  // ensure canvas focus
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (e) {}
  }, 100);

  // Expose controls for debugging or manual audio start
  window.__machineMath = {
    restart: restartGame,
    startAudio: initAudio,
  };

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    try {
      if (audioCtx) {
        bgNodes.forEach((n) => {
          safeStop(n.osc);
          safeStop(n.lfo);
        });
        if (audioCtx.close) audioCtx.close();
      }
    } catch (e) {}
  });

  // Start loop
  requestAnimationFrame(loop);
})();