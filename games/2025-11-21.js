(function () {
  // Enhanced Drone Math Game visuals and audio
  // Renders into element with id 'game-of-the-day-stage'.
  // All graphics via canvas. Sounds via Web Audio API oscillators.
  // Game mechanics and math logic are unchanged.

  // Config
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 12; // >=10 px padding
  const TARGET_SCORE = 10; // goal to win
  const MAX_WRONG = 3; // lives before game over
  const FONT_BODY = "16px Inter, system-ui, sans-serif"; // >=14px
  const FONT_IMPORTANT = "22px Inter, system-ui, sans-serif"; // >=18px
  const CHOICE_FONT = "18px Inter, system-ui, sans-serif";
  const FRAME_RATE_MS = 1000 / 60;

  // Find container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    throw new Error("Container element with id 'game-of-the-day-stage' not found.");
  }
  container.innerHTML = ""; // clear
  container.style.position = "relative";
  container.setAttribute("role", "application");
  container.setAttribute(
    "aria-label",
    "Drone math game. Answer simple math questions to collect stars. Use number keys 1-4 to choose answers."
  );
  container.tabIndex = 0;

  // Create live region for screen readers
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  liveRegion.style.top = "auto";
  liveRegion.style.width = "1px";
  liveRegion.style.height = "1px";
  liveRegion.style.overflow = "hidden";
  container.appendChild(liveRegion);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = "block";
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.style.background = "#e9f6ff"; // calming sky-blue
  canvas.style.border = "1px solid #333";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D context not available.");
  }

  // Audio setup with robust error handling
  let audioCtx = null;
  let bgGain = null;
  let bgOscA = null;
  let bgOscB = null;
  let bgLfo = null;
  let audioEnabled = false;

  function tryCreateAudioContext() {
    if (audioCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        console.warn("Web Audio API not supported in this browser.");
        return;
      }
      audioCtx = new AC();

      // create gentle ambient pad: two detuned triangle oscillators through lowpass and slow LFO to gain
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.0; // start muted
      bgGain.connect(audioCtx.destination);

      const masterFilter = audioCtx.createBiquadFilter();
      masterFilter.type = "lowpass";
      masterFilter.frequency.value = 900;
      masterFilter.Q.value = 0.8;
      masterFilter.connect(bgGain);

      bgOscA = audioCtx.createOscillator();
      bgOscA.type = "triangle";
      bgOscA.frequency.value = 110; // base
      bgOscB = audioCtx.createOscillator();
      bgOscB.type = "sine";
      bgOscB.frequency.value = 138; // detuned interval for warmth

      const oscGainA = audioCtx.createGain();
      const oscGainB = audioCtx.createGain();
      oscGainA.gain.value = 0.016;
      oscGainB.gain.value = 0.012;

      bgOscA.connect(oscGainA);
      bgOscB.connect(oscGainB);
      oscGainA.connect(masterFilter);
      oscGainB.connect(masterFilter);

      // gentle LFO to modulate filter frequency for movement
      bgLfo = audioCtx.createOscillator();
      bgLfo.type = "sine";
      bgLfo.frequency.value = 0.07; // very slow
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 300;
      bgLfo.connect(lfoGain);
      lfoGain.connect(masterFilter.frequency);

      bgOscA.start();
      bgOscB.start();
      bgLfo.start();

      // Keep background muted until toggled on by user gesture
      bgGain.gain.setValueAtTime(0, audioCtx.currentTime);
    } catch (e) {
      console.warn("Audio context failed to initialize:", e);
      audioCtx = null;
    }
  }

  // Call on user gesture
  function resumeAudioIfNeeded() {
    tryCreateAudioContext();
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => console.warn("Audio resume failed:", e));
    }
    // Set audio enabled true when user interacts (but keep it off if toggled off)
    // We do not automatically enable sound unless previously toggled on
  }

  // Play short sound effect (correct/wrong) using WebAudio
  function playBeep({ type = "correct" } = {}) {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      if (type === "correct") {
        // bright pluck + small bell
        const osc = audioCtx.createOscillator();
        osc.type = "triangle";
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 300;
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.18);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.5);

        // tiny bell overlay
        const bell = audioCtx.createOscillator();
        bell.type = "sine";
        bell.frequency.setValueAtTime(1500, now);
        bell.frequency.exponentialRampToValueAtTime(700, now + 0.3);
        const bellGain = audioCtx.createGain();
        bellGain.gain.setValueAtTime(0.0001, now);
        bellGain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        bell.connect(bellGain);
        bellGain.connect(audioCtx.destination);
        bell.start(now);
        bell.stop(now + 0.5);
      } else {
        // soft "thud" and noise-ish drop
        const osc = audioCtx.createOscillator();
        osc.type = "square";
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.28);
        const hp = audioCtx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 120;
        osc.connect(hp);
        hp.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch (e) {
      console.warn("playBeep failed:", e);
    }
  }

  function setBackgroundSound(on) {
    tryCreateAudioContext();
    if (!audioCtx || !bgGain) {
      audioEnabled = false;
      return;
    }
    audioEnabled = !!on;
    if (on) {
      // fade in gently
      bgGain.gain.cancelScheduledValues(audioCtx.currentTime);
      bgGain.gain.setValueAtTime(bgGain.gain.value, audioCtx.currentTime);
      bgGain.gain.linearRampToValueAtTime(0.02, audioCtx.currentTime + 0.8);
      audioCtx.resume().catch(() => {});
    } else {
      // fade out
      bgGain.gain.cancelScheduledValues(audioCtx.currentTime);
      bgGain.gain.setValueAtTime(bgGain.gain.value, audioCtx.currentTime);
      bgGain.gain.linearRampToValueAtTime(0.0, audioCtx.currentTime + 0.5);
    }
  }

  // Game state
  let score = 0;
  let wrong = 0;
  let question = null;
  let choices = [];
  let selectedChoice = 0;
  let gameState = "playing"; // playing, won, lost
  let drone = {
    x: WIDTH / 2,
    y: 150,
    targetX: WIDTH / 2,
    targetY: 150,
    vx: 0,
    vy: 0,
    w: 88,
    h: 44,
    bobOffset: 0,
    bobDir: 1,
  };
  let flyAnim = null;
  let lastTick = performance.now();

  // Particle systems
  const clouds = [];
  const particles = []; // generic particle for stars and sparks
  // Initialize some clouds for parallax
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * WIDTH,
      y: 40 + Math.random() * 80,
      w: 80 + Math.random() * 160,
      h: 30 + Math.random() * 40,
      speed: 0.1 + Math.random() * 0.25,
      alpha: 0.45 + Math.random() * 0.35,
    });
  }

  // Accessibility announcement
  function announce(text) {
    liveRegion.textContent = text;
  }

  // Utilities
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Generate a simple math question appropriate for 7-9 (unchanged math logic)
  function generateQuestion() {
    const opRoll = Math.random();
    let a, b, op, answer;
    if (opRoll < 0.55) {
      a = randInt(1, 20);
      b = randInt(1, 20);
      op = "+";
      answer = a + b;
    } else if (opRoll < 0.9) {
      a = randInt(1, 20);
      b = randInt(1, a);
      op = "-";
      answer = a - b;
    } else {
      a = randInt(2, 8);
      b = randInt(2, 8);
      op = "×";
      answer = a * b;
    }
    return { a, b, op, answer };
  }

  function generateChoices(correct) {
    const set = new Set();
    set.add(correct);
    while (set.size < 4) {
      const offset = randInt(-6, 8);
      let cand = correct + offset;
      if (Math.random() < 0.1) cand = correct + (Math.random() < 0.5 ? 10 : -10);
      if (cand < 0) cand = Math.abs(cand) + 1;
      set.add(cand);
    }
    const arr = Array.from(set);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function nextQuestion() {
    question = generateQuestion();
    choices = generateChoices(question.answer);
    selectedChoice = 0;
    announce(`New question: ${question.a} ${question.op} ${question.b}. Press 1 to 4 to choose.`);
  }

  // Initialize
  function resetGame() {
    score = 0;
    wrong = 0;
    gameState = "playing";
    drone.x = WIDTH / 2;
    drone.y = 150;
    drone.targetX = WIDTH / 2;
    drone.targetY = 150;
    setBackgroundSound(true);
    nextQuestion();
    announce(`Game started. Answer ${TARGET_SCORE} questions correctly. You have ${MAX_WRONG} lives.`);
  }

  // Drawing helpers
  function drawTextBox(x, y, text, font, textColor = "#072", bgColor = "rgba(255,255,255,0.88)") {
    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const textH = parseInt(font, 10) || 16;
    const pad = 9;
    const boxW = textW + pad * 2;
    const boxH = textH + pad * 2;
    // rounded rect
    const r = 8;
    ctx.fillStyle = bgColor;
    roundRect(ctx, x, y, boxW, boxH, r, true, false);
    ctx.fillStyle = textColor;
    ctx.textBaseline = "top";
    ctx.fillText(text, x + pad, y + pad);
    ctx.restore();
    return { x, y, w: boxW, h: boxH };
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    const radius = r || 5;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Improved drone drawing with smoother shapes and subtle lights
  function drawDrone(x, y, w, h, label = "") {
    ctx.save();

    // soft drop shadow
    ctx.beginPath();
    ctx.ellipse(x, y + h * 1.1, w * 0.7, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,12,18,0.08)";
    ctx.fill();

    ctx.translate(x, y);
    // body main
    const gradientBody = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    gradientBody.addColorStop(0, "#2c4b7a");
    gradientBody.addColorStop(1, "#123154");
    ctx.fillStyle = gradientBody;
    ctx.strokeStyle = "rgba(8,12,22,0.6)";
    ctx.lineWidth = 2;
    roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.35, true, false);

    // top canopy
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.12, w * 0.45, h * 0.42, -0.12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(159,215,255,0.9)";
    ctx.fill();
    // highlight stripe
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(-w * 0.45, -h * 0.28, w * 0.9, 6);

    // lights (soft)
    ctx.beginPath();
    ctx.fillStyle = "#64f5a2";
    ctx.arc(-w * 0.26, -h * 0.05, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#ffd26b";
    ctx.arc(w * 0.26, -h * 0.05, 4, 0, Math.PI * 2);
    ctx.fill();

    // prop rotors - subtle rotating blur
    const t = performance.now() / 1000;
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate((w / 2 + 6) * i, -h * 0.6);
      ctx.rotate(Math.sin(t * 6 + i) * 0.6);
      const pr = ctx.createLinearGradient(-12, -3, 12, 3);
      pr.addColorStop(0, "rgba(255,255,255,0.08)");
      pr.addColorStop(1, "rgba(255,255,255,0.02)");
      ctx.fillStyle = pr;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // cargo hook
    ctx.strokeStyle = "rgba(10,12,18,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, h / 2 - 6);
    ctx.lineTo(8, h / 2 + 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8, h / 2 + 26, 7, 0, Math.PI);
    ctx.stroke();

    // small mouth (friendly)
    ctx.fillStyle = "rgba(6,10,20,0.85)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.12, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // label
    if (label) {
      ctx.font = "12px Inter, sans-serif";
      ctx.fillStyle = "#eef7ff";
      const m = ctx.measureText(label);
      ctx.fillText(label, -m.width / 2, h * 0.7);
    }

    ctx.restore();
  }

  // Draw package (improved look)
  function drawPackage(x, y, w, h, text, index, isSelected, isCorrectHint = false) {
    ctx.save();

    // drop shadow
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.6, w * 0.46, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,10,12,0.06)";
    ctx.fill();

    // box with soft edge
    const corner = 10;
    ctx.fillStyle = isSelected ? "#fff7ea" : "#fffaf4";
    ctx.strokeStyle = "#8b5e3c";
    ctx.lineWidth = 2;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, corner, true, true);

    // decorative stripe (tape)
    ctx.fillStyle = "#cc8a2a";
    roundRect(ctx, x - 10, y - h / 2 + 6, 20, h - 12, 4, true, false);

    // soft shadow under tape
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(x - w / 2 + 6, y + h / 2 - 10, w - 12, 4);

    // text
    ctx.font = CHOICE_FONT;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#2b2b2b";
    const textWidth = ctx.measureText(text).width;
    const maxTextW = w - 24;
    let displayText = text;
    if (textWidth > maxTextW) {
      while (ctx.measureText(displayText + "...").width > maxTextW && displayText.length > 0) {
        displayText = displayText.slice(0, -1);
      }
      displayText = displayText + "...";
    }
    ctx.fillText(displayText, x - ctx.measureText(displayText).width / 2, y);

    // small index badge
    ctx.beginPath();
    ctx.fillStyle = isSelected ? "#ffd166" : "#e8e3df";
    ctx.arc(x - w / 2 + 14, y - h / 2 + 14, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "12px Inter, sans-serif";
    ctx.fillStyle = "#412b1b";
    ctx.fillText(String(index + 1), x - w / 2 + 10, y - h / 2 + 7);

    // correct hint outline at end of game
    if (isCorrectHint) {
      ctx.strokeStyle = "rgba(56,181,74,0.95)";
      ctx.lineWidth = 3;
      roundRect(ctx, x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 8, false, true);
    }

    ctx.restore();
  }

  // Positions for UI elements ensuring no overlap
  function drawUI() {
    // Score top-left
    ctx.font = FONT_IMPORTANT;
    const scoreText = `Score: ${score}/${TARGET_SCORE}`;
    drawTextBox(PADDING, PADDING, scoreText, FONT_IMPORTANT, "#053", "rgba(255,255,255,0.95)");

    // Lives top-right
    ctx.font = FONT_IMPORTANT;
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrong)}`;
    const livesMetrics = ctx.measureText(livesText);
    const livesW = livesMetrics.width + 8 * 2;
    const livesX = WIDTH - PADDING - livesW;
    drawTextBox(livesX, PADDING, livesText, FONT_IMPORTANT, "#690018", "rgba(255,255,255,0.95)");

    // Audio toggle indicator
    ctx.font = "14px Inter, sans-serif";
    const audioText = `Sound: ${audioEnabled ? "On (S)" : "Off (S)"}`;
    const audioW = ctx.measureText(audioText).width + 8 * 2;
    const audioX = livesX - 10 - audioW;
    drawTextBox(audioX, PADDING, audioText, "14px Inter, sans-serif", "#053642", "rgba(255,255,255,0.95)");

    // Question area centered under top bar
    ctx.font = FONT_IMPORTANT;
    const qText = `${question.a} ${question.op} ${question.b} = ?`;
    ctx.font = FONT_IMPORTANT;
    const qMetrics = ctx.measureText(qText);
    const qW = qMetrics.width + 16;
    const qX = (WIDTH - qW) / 2;
    const qY = PADDING + 8;
    drawTextBox(qX, qY + 40, qText, FONT_IMPORTANT, "#05324a", "rgba(255,255,255,0.97)");

    // Instructions bottom-center with proper wrapping and padding
    const instrText = "Choose the correct package (1-4 or click). Press S to toggle sound. Press R to restart.";
    ctx.font = FONT_BODY;
    const instrMaxW = WIDTH - PADDING * 2 - 10;
    const instrX = PADDING + 5;
    const instrY = HEIGHT - PADDING - 56;
    // background
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundRect(ctx, instrX - 6, instrY - 8, instrMaxW + 12, 52, 8, true, false);
    ctx.fillStyle = "#03334a";
    ctx.textBaseline = "top";
    const words = instrText.split(" ");
    let line = "";
    let lineY = instrY + 6;
    const lineHeight = 18;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > instrMaxW) {
        ctx.fillText(line, instrX, lineY);
        line = w;
        lineY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, instrX, lineY);
  }

  function drawScene() {
    // clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // sky gradient and sun
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#e9f6ff");
    sky.addColorStop(1, "#fbfeff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun
    const sunX = WIDTH - 110;
    const sunY = 80;
    const sunRad = 36;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, sunRad * 2);
    sunGrad.addColorStop(0, "rgba(255,230,140,0.9)");
    sunGrad.addColorStop(1, "rgba(255,230,140,0.02)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRad * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // gentle parallax clouds
    for (const c of clouds) {
      ctx.save();
      ctx.globalAlpha = c.alpha;
      const g = ctx.createLinearGradient(c.x - c.w, c.y - c.h, c.x + c.w, c.y + c.h);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#f0f8ff");
      ctx.fillStyle = g;
      ctx.beginPath();
      // custom cloud shape
      ctx.ellipse(c.x, c.y, c.w * 0.7, c.h, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - c.w * 0.5, c.y + 6, c.w * 0.45, c.h * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.45, c.y + 6, c.w * 0.45, c.h * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // distant soft ground / hill
    ctx.save();
    ctx.fillStyle = "#e6f7ef";
    ctx.beginPath();
    ctx.ellipse(140, HEIGHT - 30, 220, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(540, HEIGHT - 44, 300, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // draw drone with gentle bobbing
    const droneY = drone.y + Math.sin(drone.bobOffset * 1.6) * 6;
    drawDrone(drone.x, droneY, drone.w, drone.h);

    // packages (choices)
    const baseY = 320;
    const packageW = 140;
    const packageH = 60;
    const margin = 20;
    const totalW = choices.length * packageW + (choices.length - 1) * margin;
    const startX = (WIDTH - totalW) / 2 + packageW / 2;
    for (let i = 0; i < choices.length; i++) {
      const x = startX + i * (packageW + margin);
      const y = baseY + (i % 2 === 0 ? 8 : -8);
      const isSelected = i === selectedChoice;
      const isCorrectHint = gameState !== "playing" && choices[i] === question.answer;
      drawPackage(x, y, packageW, packageH, String(choices[i]), i, isSelected, isCorrectHint);
    }

    // draw UI
    drawUI();

    // draw progress: stars collected
    const starStartX = PADDING + 6;
    const starY = PADDING + 66;
    for (let i = 0; i < TARGET_SCORE; i++) {
      const sX = starStartX + i * 18;
      ctx.save();
      // animate newly acquired: slight pulse if less than score
      const acquired = i < score;
      ctx.beginPath();
      ctx.fillStyle = acquired ? "#ffd200" : "#fff6cc";
      ctx.arc(sX, starY, acquired ? 7 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8b6b00";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // draw particles (stars and sparkles)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save();
      ctx.globalAlpha = p.alpha;
      if (p.type === "star") {
        // draw small star
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        starShape(ctx, 0, 0, p.size, 5);
      } else {
        // circular sparkle
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // update particle
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06 * p.gravity;
      p.alpha -= 0.012;
      p.rot += p.spin;
      if (p.alpha <= 0.02) {
        particles.splice(i, 1);
      }
    }
  }

  function starShape(ctx, x, y, r, points) {
    const outer = r;
    const inner = r * 0.5;
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / points;
    ctx.beginPath();
    ctx.moveTo(x, y - outer);
    for (let i = 0; i < points; i++) {
      ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
  }

  function update(dt) {
    // gentle bob
    drone.bobOffset += dt * 0.0012;

    // smooth movement towards target
    const dx = drone.targetX - drone.x;
    const dy = drone.targetY - drone.y;
    drone.vx = dx * 0.09;
    drone.vy = dy * 0.09;
    drone.x += drone.vx;
    drone.y += drone.vy;

    // move clouds
    for (const c of clouds) {
      c.x += c.speed;
      if (c.x - c.w > WIDTH + 30) {
        c.x = -c.w - 20;
        c.y = 40 + Math.random() * 80;
        c.w = 80 + Math.random() * 160;
        c.h = 30 + Math.random() * 40;
        c.speed = 0.08 + Math.random() * 0.3;
      }
    }
  }

  // Try to pick current selected choice (by index)
  function pickChoice(index) {
    if (gameState !== "playing") return;
    if (!question) return;
    index = clamp(index, 0, choices.length - 1);
    selectedChoice = index;
    // move drone above package
    const baseY = 320;
    const packageW = 140;
    const margin = 20;
    const totalW = choices.length * packageW + (choices.length - 1) * margin;
    const startX = (WIDTH - totalW) / 2 + packageW / 2;
    const targetX = startX + index * (packageW + margin);
    drone.targetX = targetX;
    drone.targetY = 220;
  }

  function submitChoice(index) {
    if (gameState !== "playing") return;
    pickChoice(index);
    // small delay to let drone move visually then evaluate
    setTimeout(() => {
      const chosen = choices[index];
      if (chosen === question.answer) {
        score += 1;
        playBeep({ type: "correct" });
        announce(
          `Correct! ${question.a} ${question.op} ${question.b} equals ${question.answer}. Score ${score} of ${TARGET_SCORE}.`
        );
        // star burst
        spawnStarBurst(index);
        rewardAnimation(index);
      } else {
        wrong += 1;
        playBeep({ type: "wrong" });
        announce(
          `Oops. ${question.a} ${question.op} ${question.b} is ${question.answer}. Lives left ${Math.max(
            0,
            MAX_WRONG - wrong
          )}.`
        );
        wrongAnimation();
        spawnSmoke(index);
        if (wrong >= MAX_WRONG) {
          gameState = "lost";
          announce(`Game over. You answered ${score} correctly. Press R to restart.`);
          setBackgroundSound(false);
        } else {
          nextQuestion();
        }
      }
      if (score >= TARGET_SCORE) {
        gameState = "won";
        announce(`Victory! You collected ${score} stars. Press R to play again.`);
        setBackgroundSound(false);
      }
    }, 260);
  }

  // Reward animation: drone descends then spirals up (unchanged mechanics but visual polish)
  function rewardAnimation(index) {
    const baseY = 320;
    const packageW = 140;
    const margin = 20;
    const totalW = choices.length * packageW + (choices.length - 1) * margin;
    const startX = (WIDTH - totalW) / 2 + packageW / 2;
    const px = startX + index * (packageW + margin);
    const py = baseY;
    let t = 0;
    const dur = 900;
    const startX0 = drone.x;
    const startY0 = drone.y;
    const start = performance.now();
    function anim() {
      const now = performance.now();
      t = now - start;
      const p = Math.min(1, t / dur);
      if (p < 0.38) {
        drone.x = startX0 + (px - startX0) * (p / 0.38);
        drone.y = startY0 + (py - 28 - startY0) * (p / 0.38);
      } else {
        const pp = (p - 0.38) / 0.62;
        // spiral ascent
        drone.x = px + Math.sin(pp * Math.PI * 4) * 26 * (1 - pp);
        drone.y = py - 80 * pp - 30 * pp * pp;
      }
      if (p < 1) {
        flyAnim = requestAnimationFrame(anim);
      } else {
        cancelAnimationFrame(flyAnim);
        flyAnim = null;
        nextQuestion();
      }
    }
    anim();
  }

  function wrongAnimation() {
    const startX0 = drone.x;
    const startY0 = drone.y;
    let t0 = performance.now();
    const dur = 420;
    function anim() {
      const t = performance.now() - t0;
      const p = Math.min(1, t / dur);
      drone.x = startX0 + Math.sin(p * Math.PI * 8) * 12 * (1 - p);
      drone.y = startY0 + Math.sin(p * Math.PI * 4) * 5 * (1 - p);
      if (p < 1) {
        requestAnimationFrame(anim);
      } else {
        drone.targetX = WIDTH / 2;
        drone.targetY = 150;
      }
    }
    anim();
  }

  // Spawn star particles when correct
  function spawnStarBurst(index) {
    const baseY = 320;
    const packageW = 140;
    const margin = 20;
    const totalW = choices.length * packageW + (choices.length - 1) * margin;
    const startX = (WIDTH - totalW) / 2 + packageW / 2;
    const px = startX + index * (packageW + margin);
    const py = baseY - 10;
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6 - 1.2,
        alpha: 0.95,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.2,
        size: 4 + Math.random() * 4,
        color: "#ffd54a",
        type: "star",
        gravity: 0.4,
      });
    }
  }

  // Spawn smoke when wrong
  function spawnSmoke(index) {
    const baseY = 320;
    const packageW = 140;
    const margin = 20;
    const totalW = choices.length * packageW + (choices.length - 1) * margin;
    const startX = (WIDTH - totalW) / 2 + packageW / 2;
    const px = startX + index * (packageW + margin);
    const py = baseY - 6;
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: px + (Math.random() - 0.5) * 18,
        y: py + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -0.4 - Math.random() * 0.6,
        alpha: 0.6 + Math.random() * 0.25,
        rot: 0,
        spin: 0,
        size: 8 + Math.random() * 8,
        color: "rgba(60,60,60,0.22)",
        type: "smoke",
        gravity: 0.06,
      });
    }
  }

  // Handle mouse clicks mapped to canvas coordinates
  canvas.addEventListener("click", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    // If game over or won, check restart button area
    if (gameState !== "playing") {
      const btnW = 260;
      const btnH = 54;
      const btnX = (WIDTH - btnW) / 2;
      const btnY = (HEIGHT - btnH) / 2 + 80;
      if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
        resetGame();
        return;
      }
    }
    // Determine if clicked on a package
    const baseY = 320;
    const packageW = 140;
    const packageH = 60;
    const margin = 20;
    const totalW = choices.length * packageW + (choices.length - 1) * margin;
    const startX = (WIDTH - totalW) / 2 + packageW / 2;
    for (let i = 0; i < choices.length; i++) {
      const x = startX + i * (packageW + margin);
      const y = baseY + (i % 2 === 0 ? 8 : -8);
      if (
        mx >= x - packageW / 2 &&
        mx <= x + packageW / 2 &&
        my >= y - packageH / 2 &&
        my <= y + packageH / 2
      ) {
        resumeAudioIfNeeded();
        // if audio has been resumed and sound preferred, keep audioEnabled as is; a click is a user gesture
        submitChoice(i);
        return;
      }
    }
  });

  // Keyboard controls
  window.addEventListener("keydown", (ev) => {
    resumeAudioIfNeeded();
    if (ev.key >= "1" && ev.key <= "4") {
      const idx = parseInt(ev.key, 10) - 1;
      if (gameState === "playing") {
        submitChoice(idx);
      }
      ev.preventDefault();
      return;
    }
    if (ev.key === "ArrowLeft") {
      if (gameState === "playing") {
        selectedChoice = (selectedChoice - 1 + choices.length) % choices.length;
      }
      ev.preventDefault();
      return;
    }
    if (ev.key === "ArrowRight") {
      if (gameState === "playing") {
        selectedChoice = (selectedChoice + 1) % choices.length;
      }
      ev.preventDefault();
      return;
    }
    if (ev.key === "Enter") {
      if (gameState === "playing") {
        submitChoice(selectedChoice);
      }
      ev.preventDefault();
      return;
    }
    if (ev.key === "s" || ev.key === "S") {
      // toggle sound
      setBackgroundSound(!audioEnabled);
      announce(`Sound ${audioEnabled ? "on" : "off"}.`);
      ev.preventDefault();
      return;
    }
    if (ev.key === "r" || ev.key === "R") {
      resetGame();
      ev.preventDefault();
      return;
    }
  });

  // Main loop
  function tick(now) {
    const dt = now - lastTick;
    lastTick = now;
    if (gameState === "playing") {
      update(dt);
    }
    drawScene();

    // If game ended, overlay victory or game over screen (unchanged logic)
    if (gameState === "won" || gameState === "lost") {
      ctx.fillStyle = "rgba(6,10,20,0.56)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.font = "34px Inter, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      const title = gameState === "won" ? "You did it! Drone victory!" : "Game Over";
      const m = ctx.measureText(title);
      ctx.fillText(title, (WIDTH - m.width) / 2, HEIGHT / 2 - 44);

      ctx.font = "20px Inter, sans-serif";
      const msg = gameState === "won" ? `You collected ${score} stars!` : `You collected ${score} stars. Try again!`;
      const mm = ctx.measureText(msg);
      ctx.fillText(msg, (WIDTH - mm.width) / 2, HEIGHT / 2 - 10);

      // restart button
      const btnW = 260;
      const btnH = 54;
      const btnX = (WIDTH - btnW) / 2;
      const btnY = (HEIGHT - btnH) / 2 + 80;
      // button with gradient
      const g = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
      g.addColorStop(0, "#fff1b8");
      g.addColorStop(1, "#ffd85b");
      ctx.fillStyle = g;
      roundRect(ctx, btnX, btnY, btnW, btnH, 12, true, true);
      ctx.font = "20px Inter, sans-serif";
      ctx.fillStyle = "#2b2b2b";
      const btnText = "Restart (R)";
      const bm = ctx.measureText(btnText);
      ctx.fillText(btnText, btnX + (btnW - bm.width) / 2, btnY + btnH / 2 - 12);
    }

    requestAnimationFrame(tick);
  }

  // Start
  tryCreateAudioContext();
  resetGame();
  lastTick = performance.now();
  requestAnimationFrame(tick);

  // Visibility change handling for audio context with error handling
  document.addEventListener("visibilitychange", () => {
    if (!audioCtx) return;
    try {
      if (document.hidden) {
        audioCtx.suspend && audioCtx.suspend();
      } else {
        if (audioEnabled) audioCtx.resume && audioCtx.resume();
      }
    } catch (e) {
      console.warn("visibility audio handling error:", e);
    }
  });

  // Update aria label periodically
  function updateAria() {
    try {
      if (question && gameState === "playing") {
        container.setAttribute(
          "aria-label",
          `Drone math game. Question: ${question.a} ${question.op} ${question.b}. Choices: ${choices
            .map((c, i) => `${i + 1}: ${c}`)
            .join(", ")}. Score ${score}. Lives left ${Math.max(0, MAX_WRONG - wrong)}.`
        );
      } else {
        container.setAttribute(
          "aria-label",
          `Drone math game. ${gameState}. Score ${score}. Lives left ${Math.max(0, MAX_WRONG - wrong)}.`
        );
      }
    } catch (e) {
      // Nothing critical; avoid breaking the app
      console.warn("updateAria error:", e);
    }
  }
  setInterval(updateAria, 1200);

  // Ensure keyboard focus for accessibility
  container.addEventListener("click", () => {
    container.focus();
    resumeAudioIfNeeded();
  });

  // Safety: if audio unavailable, inform via announce
  if (!window.AudioContext && !window.webkitAudioContext) {
    announce("Audio not supported. Visual cues provided.");
  }
})();