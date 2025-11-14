(function () {
  // Drone Math Rescue - Visual & Audio Enhancements
  // Renders inside element with ID "game-of-the-day-stage"
  // Canvas: 720x480
  // All graphics via canvas APIs. Audio via Web Audio API (no external files).
  // Game mechanics unchanged.

  // Constants and configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 12;
  const GOAL = 10;
  const MAX_WRONG = 3;
  const DRONE_Y = 260;
  const DRONE_COUNT = 3;
  const DRONE_X_SPACING = WIDTH / (DRONE_COUNT + 1);
  const QUESTION_FONT = "26px Verdana, Arial";
  const INFO_FONT = "18px Verdana, Arial";
  const BODY_FONT = "16px Verdana, Arial";
  const BUTTON_FONT = "20px Verdana, Arial";
  const BATTERY_ICON_RADIUS = 10;

  // Stage and canvas setup
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    throw new Error('Missing container element with id "game-of-the-day-stage".');
  }
  stage.style.position = "relative";
  stage.style.width = `${WIDTH}px`;
  stage.style.height = `${HEIGHT}px`;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Drone Math Rescue game. Use number keys 1-3 or click to answer."
  );
  canvas.style.display = "block";
  canvas.style.outline = "none";
  canvas.tabIndex = 0; // keyboard focusable
  stage.appendChild(canvas);

  // Accessible offscreen status
  const srStatus = document.createElement("div");
  srStatus.setAttribute("role", "status");
  srStatus.setAttribute("aria-live", "polite");
  srStatus.style.position = "absolute";
  srStatus.style.left = "-9999px";
  srStatus.style.width = "1px";
  srStatus.style.height = "1px";
  stage.appendChild(srStatus);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context not available");
  }

  // Audio setup with robust error handling
  let audioCtx = null;
  let audioAvailable = false;
  let ambientNodes = null; // container for ambient audio nodes
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      audioAvailable = true;
    } else {
      audioAvailable = false;
    }
  } catch (err) {
    console.warn("AudioContext creation failed:", err);
    audioAvailable = false;
  }

  function resumeAudioOnGesture() {
    if (!audioAvailable || !audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => console.warn("Audio resume failed:", e));
    }
  }

  // Ambient background: gentle pad with slow filter LFO and stereo movement
  function startBackgroundHum() {
    if (!audioAvailable || !audioCtx) return;
    stopBackgroundHum();
    try {
      const gain = audioCtx.createGain();
      gain.gain.value = 0.03; // gentle base level

      // Create two detuned oscillators to form a soft pad
      const oscA = audioCtx.createOscillator();
      const oscB = audioCtx.createOscillator();
      oscA.type = "sine";
      oscB.type = "sine";
      oscA.frequency.value = 110;
      oscB.frequency.value = 110 * 1.01; // slight detune

      // Low-pass filter to soften
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 400;
      lp.Q.value = 0.8;

      // Slow LFO to modulate filter cutoff
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.06; // very slow wobble
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(lp.frequency);

      // Slight stereo movement using panner nodes
      const panner = audioCtx.createStereoPanner();
      const panLFO = audioCtx.createOscillator();
      const panGain = audioCtx.createGain();
      panLFO.type = "sine";
      panLFO.frequency.value = 0.04;
      panGain.gain.value = 0.5;
      panLFO.connect(panGain);
      panGain.connect(panner.pan);

      // Connect chain: oscillators -> filter -> gain -> panner -> dest
      oscA.connect(lp);
      oscB.connect(lp);
      lp.connect(gain);
      gain.connect(panner);
      panner.connect(audioCtx.destination);

      // Smoothly ramp up gain
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      try {
        gain.gain.exponentialRampToValueAtTime(
          0.03,
          audioCtx.currentTime + 1.2
        );
      } catch (e) {
        // some contexts disallow exponential ramp from zero; fallback
        gain.gain.linearRampToValueAtTime(0.03, audioCtx.currentTime + 1.2);
      }

      // Start nodes
      oscA.start();
      oscB.start();
      lfo.start();
      panLFO.start();

      ambientNodes = {
        oscA,
        oscB,
        lp,
        gain,
        lfo,
        lfoGain,
        panner,
        panLFO,
        panGain,
      };
    } catch (e) {
      console.warn("startBackgroundHum failed:", e);
      ambientNodes = null;
    }
  }

  function stopBackgroundHum() {
    try {
      if (!ambientNodes) return;
      const nodes = ambientNodes;
      // Ramp down gently before stopping
      if (nodes.gain) {
        try {
          nodes.gain.gain.exponentialRampToValueAtTime(
            0.0001,
            audioCtx.currentTime + 0.6
          );
        } catch (e) {
          nodes.gain.gain.linearRampToValueAtTime(
            0.0001,
            audioCtx.currentTime + 0.6
          );
        }
      }
      // Stop oscillators after the ramp
      setTimeout(() => {
        try {
          nodes.oscA && nodes.oscA.stop();
        } catch (e) {}
        try {
          nodes.oscB && nodes.oscB.stop();
        } catch (e) {}
        try {
          nodes.lfo && nodes.lfo.stop();
        } catch (e) {}
        try {
          nodes.panLFO && nodes.panLFO.stop();
        } catch (e) {}
      }, 700);
      ambientNodes = null;
    } catch (e) {
      console.warn("stopBackgroundHum error:", e);
      ambientNodes = null;
    }
  }

  // Sound effects: enhanced correct (pleasant arpeggio + pickup), wrong (buzz + thud)
  function playCorrect() {
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // arpeggio
      const freqs = [440, 660, 880];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        o.type = i === 2 ? "triangle" : "sine";
        o.frequency.value = f;
        filter.type = "lowpass";
        filter.frequency.value = 1200;
        g.gain.value = 0.001;
        // envelope
        g.gain.setValueAtTime(0.0001, now + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.08, now + 0.05 + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 + i * 0.05);
        o.connect(filter);
        filter.connect(g);
        g.connect(audioCtx.destination);
        o.start(now + i * 0.05);
        o.stop(now + 0.5 + i * 0.05);
      });

      // small whoosh pickup using filtered noise
      const bufferSize = 2 * audioCtx.sampleRate;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const nb = audioCtx.createBufferSource();
      nb.buffer = noiseBuffer;
      const nf = audioCtx.createBiquadFilter();
      nf.type = "highpass";
      nf.frequency.value = 600;
      const ng = audioCtx.createGain();
      ng.gain.value = 0.0001;
      ng.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      nb.connect(nf);
      nf.connect(ng);
      ng.connect(audioCtx.destination);
      nb.start(now);
      nb.stop(now + 0.4);
    } catch (e) {
      console.warn("playCorrect failed:", e);
    }
  }

  function playWrong() {
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // low buzz with filter sweep
      const o = audioCtx.createOscillator();
      const f = audioCtx.createBiquadFilter();
      const g = audioCtx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(160, now);
      f.type = "lowpass";
      f.frequency.setValueAtTime(800, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      // downward sweep to make it feel corrective
      f.frequency.exponentialRampToValueAtTime(200, now + 0.45);
      o.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      o.start(now);
      o.stop(now + 0.45);

      // low thud (sub)
      const thud = audioCtx.createOscillator();
      const tg = audioCtx.createGain();
      thud.type = "sine";
      thud.frequency.setValueAtTime(80, now);
      tg.gain.setValueAtTime(0.0001, now);
      tg.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      thud.connect(tg);
      tg.connect(audioCtx.destination);
      thud.start(now);
      thud.stop(now + 0.4);
    } catch (e) {
      console.warn("playWrong failed:", e);
    }
  }

  // Utility helpers
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Math question generation (unchanged)
  function generateQuestion() {
    const typeRoll = Math.random();
    if (typeRoll < 0.5) {
      const a = randomInt(1, 15);
      const b = randomInt(1, Math.max(3, 20 - a));
      return { text: `${a} + ${b} = ?`, answer: a + b };
    } else if (typeRoll < 0.85) {
      const a = randomInt(5, 20);
      const b = randomInt(1, Math.min(10, a - 1));
      return { text: `${a} - ${b} = ?`, answer: a - b };
    } else {
      const a = randomInt(2, 6);
      const b = randomInt(2, 5);
      return { text: `${a} × ${b} = ?`, answer: a * b };
    }
  }

  // Game state variables
  let correctCount = 0;
  let wrongCount = 0;
  let currentQuestion = null;
  let options = [];
  let selectedIndex = 0;
  let animating = [];
  let gameState = "playing"; // playing, won, lost, menu
  let soundOn = audioAvailable;
  let lastActionTime = 0;

  // Visual animation state
  const drones = (function positions() {
    const arr = [];
    for (let i = 1; i <= DRONE_COUNT; i++) {
      arr.push({ x: DRONE_X_SPACING * i, y: DRONE_Y });
    }
    return arr;
  })();
  const propAngles = new Array(DRONE_COUNT).fill(0);
  let hoveredIndex = -1;
  let cloudSeed = Math.random() * 1000;

  // Question flow
  function nextQuestion() {
    currentQuestion = generateQuestion();
    const correct = currentQuestion.answer;
    const wrongs = new Set();
    while (wrongs.size < 2) {
      const delta = randomInt(1, Math.max(2, Math.floor(correct / 2) + 2));
      const direction = Math.random() < 0.5 ? -1 : 1;
      let val = correct + direction * delta;
      if (val < 0) val = Math.abs(val) + 1;
      if (val === correct) continue;
      wrongs.add(val);
    }
    const arr = Array.from(wrongs);
    arr.push(correct);
    // shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    options = arr;
    selectedIndex = 0;
    announceToSR(`New question: ${currentQuestion.text}`);
  }

  // Accessibility announcer
  function announceToSR(text) {
    try {
      srStatus.innerText = text;
    } catch (e) {}
  }

  // Rounded rectangle
  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === "number") {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
      const def = { tl: 0, tr: 0, br: 0, bl: 0 };
      for (const k in def) radius[k] = radius[k] || 0;
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Draw text with subtle translucent background for readability
  function drawTextWithBackground(
    text,
    x,
    y,
    align = "left",
    font = BODY_FONT,
    textColor = "#022",
    bgColor = "rgba(255,255,255,0.7)",
    padding = 8
  ) {
    ctx.font = font;
    ctx.textBaseline = "top";
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = parseInt(font, 10) || 16;
    let drawX = x;
    if (align === "center") {
      drawX = x - textWidth / 2;
    } else if (align === "right") {
      drawX = x - textWidth;
    }
    const rectX = drawX - padding / 2;
    const rectY = y - 4;
    const rectW = textWidth + padding;
    const rectH = textHeight + padding / 2;
    ctx.fillStyle = bgColor;
    roundRect(ctx, rectX, rectY, rectW, rectH, 8, true, false);
    ctx.fillStyle = textColor;
    ctx.fillText(text, drawX, rectY + padding / 4);
  }

  // DRAWING: background with layers, clouds, sun, subtle grid
  function drawBackground(time) {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#f2fbff");
    g.addColorStop(0.5, "#e8fef6");
    g.addColorStop(1, "#f7fff7");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Faint diagonal grid for educational vibe (very subtle)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#9ed9c7";
    ctx.lineWidth = 1;
    const gridGap = 48;
    for (let x = -WIDTH; x < WIDTH * 2; x += gridGap) {
      ctx.beginPath();
      ctx.moveTo(x + (time * 0.02 % gridGap), 0);
      ctx.lineTo(x + (time * 0.02 % gridGap) + WIDTH, HEIGHT);
      ctx.stroke();
    }
    ctx.restore();

    // Soft distant hills
    ctx.fillStyle = "#dff6ea";
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT * 0.78);
    ctx.bezierCurveTo(
      WIDTH * 0.2,
      HEIGHT * 0.62,
      WIDTH * 0.4,
      HEIGHT * 0.82,
      WIDTH * 0.6,
      HEIGHT * 0.72
    );
    ctx.bezierCurveTo(
      WIDTH * 0.75,
      HEIGHT * 0.67,
      WIDTH * 0.9,
      HEIGHT * 0.76,
      WIDTH,
      HEIGHT * 0.71
    );
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Sun / light source
    const sunX = 80;
    const sunY = 70;
    const sunRadius = 36;
    const sunG = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, sunRadius);
    sunG.addColorStop(0, "rgba(255, 229, 153, 0.95)");
    sunG.addColorStop(1, "rgba(255, 229, 153, 0.2)");
    ctx.fillStyle = sunG;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Animated floating clouds
    const cloudCount = 4;
    for (let i = 0; i < cloudCount; i++) {
      const speed = 0.03 + i * 0.01;
      const cx = ((time * speed + i * 120 + cloudSeed) % (WIDTH + 220)) - 110;
      const cy = 60 + (i % 2) * 26 + Math.sin((time / 1000) + i) * 6;
      drawCloud(cx, cy, 38 + (i % 3) * 8, `rgba(255,255,255,0.95)`);
    }

    // Zone sign with rounded badge
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.95;
    roundRect(ctx, 12, HEIGHT * 0.6 + 8, 200, 44, 10, true, true);
    ctx.fillStyle = "#045";
    ctx.font = "14px Verdana, Arial";
    ctx.textBaseline = "middle";
    ctx.fillText("Drone Rescue Zone", 22, HEIGHT * 0.6 + 30);
    ctx.restore();
  }

  function drawCloud(x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
    ctx.arc(x + size * 0.55, y - size * 0.12, size * 0.7, 0, Math.PI * 2);
    ctx.arc(x + size * 1.0, y + size * 0.08, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.35, y + size * 0.28, size * 0.53, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  // DRONE drawing with animated propellers and subtle glow
  function drawDrone(x, y, label, isSelected, index, hover = false, dt = 16) {
    // bobbing
    const bob = Math.sin((performance.now() + index * 200) / 800) * 2 + (isSelected ? -6 : 0);
    // shadow
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, y + 36 + Math.abs(bob) * 0.3, 58, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body gradient
    const bodyW = 104;
    const bodyH = 48;
    const bx = x - bodyW / 2;
    const by = y - 20 + bob;
    const bodyGrad = ctx.createLinearGradient(bx, by, bx, by + bodyH);
    bodyGrad.addColorStop(0, isSelected ? "#fff7e6" : "#fffdf9");
    bodyGrad.addColorStop(1, isSelected ? "#ffd98a" : "#ffeec6");
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, bx, by, bodyW, bodyH, 12, true, false);

    // dome
    const domeGrad = ctx.createLinearGradient(x - 32, y - 22, x + 32, y + 8);
    domeGrad.addColorStop(0, isSelected ? "#c7f3ff" : "#e6fbff");
    domeGrad.addColorStop(1, isSelected ? "#7ed7ff" : "#bfefff");
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.ellipse(x, y - 6 + bob, 36, 24, 0, Math.PI, 0);
    ctx.fill();

    // propellers rotate: update angles
    propAngles[index] += (isSelected ? 0.5 : 0.18) * (dt / 16);
    // draw two props with rotation
    for (let side = -1; side <= 1; side += 2) {
      const px = x + side * 40;
      const py = y - 18 + bob;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(propAngles[index] * (side === -1 ? 1 : -1));
      // blades
      ctx.fillStyle = hover ? "#e6f7ff" : "#f0f0f0";
      for (let b = 0; b < 3; b++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.ellipse(18, 0, 6, 20, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // spinner hub
      ctx.fillStyle = "#c9c9c9";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // subtle motion blur circle
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(px, py, 26, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // sticker / face
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - 18, y - 6 + bob, 9, 0, Math.PI * 2);
    ctx.fill();
    // eye
    ctx.fillStyle = "#022";
    ctx.beginPath();
    ctx.arc(x - 20, y - 6 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // label on body
    ctx.fillStyle = "#022";
    ctx.font = "bold 18px Verdana, Arial";
    ctx.textBaseline = "middle";
    const labelText = String(label);
    const m = ctx.measureText(labelText);
    ctx.fillText(labelText, x - m.width / 2, y + 22 + bob - 8);

    // battery icon / indicator if selected
    if (isSelected || hover) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#ffb703";
      roundRect(ctx, x + 34, y - 34 + bob, 10, 14, 3, true, false);
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 34 + 2, y - 34 + bob + 2, 2, 10);
      ctx.restore();
      // glow
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ffd26a";
      ctx.beginPath();
      ctx.arc(x, y - 10 + bob, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // small index badge
    ctx.font = "14px Verdana, Arial";
    ctx.fillStyle = "#044";
    ctx.fillText(String(index + 1), x - 6, y - 36 + bob);
  }

  // UI drawing (score, lives, audio indicator, instructions)
  function drawUI() {
    // score top-left
    const scoreText = `Batteries: ${correctCount} / ${GOAL}`;
    ctx.font = INFO_FONT;
    drawTextWithBackground(
      scoreText,
      PADDING,
      PADDING + 6,
      "left",
      INFO_FONT,
      "#023",
      "rgba(255,255,255,0.92)",
      10
    );

    // lives top-right
    const livesText = `Wrong: ${wrongCount} / ${MAX_WRONG}`;
    ctx.font = INFO_FONT;
    drawTextWithBackground(
      livesText,
      WIDTH - PADDING,
      PADDING + 6,
      "right",
      INFO_FONT,
      "#023",
      "rgba(255,255,255,0.92)",
      10
    );

    // audio indicator center-top
    const audioText = soundOn ? "Sound: ON (press M)" : "Sound: OFF (press M)";
    ctx.font = "14px Verdana, Arial";
    drawTextWithBackground(
      audioText,
      WIDTH / 2,
      PADDING + 6,
      "center",
      "14px Verdana, Arial",
      "#044",
      "rgba(255,255,255,0.92)",
      8
    );

    // question area
    if (gameState === "playing") {
      const questionText = currentQuestion ? currentQuestion.text : "";
      ctx.font = QUESTION_FONT;
      drawTextWithBackground(
        questionText,
        WIDTH / 2,
        120,
        "center",
        QUESTION_FONT,
        "#022",
        "rgba(255,255,255,0.95)",
        12
      );
    }

    // bottom instructions
    const instructions = [
      "Click a drone or press 1-3 to answer. ← → to change selection, Enter to confirm.",
      "Goal: collect 10 batteries. 3 wrong = game over.",
    ];
    ctx.font = BODY_FONT;
    const lineHeight = 20;
    const baseY = HEIGHT - PADDING - instructions.length * lineHeight - 6;
    for (let i = 0; i < instructions.length; i++) {
      drawTextWithBackground(
        instructions[i],
        WIDTH / 2,
        baseY + i * lineHeight,
        "center",
        BODY_FONT,
        "#043",
        "rgba(255,255,255,0.96)",
        12
      );
    }
  }

  // End screens (win/loss) - keep messaging and restart UI intact
  function drawEndScreen(title, subtitle, bgColor) {
    ctx.fillStyle = bgColor;
    roundRect(ctx, WIDTH * 0.1, HEIGHT * 0.2, WIDTH * 0.8, HEIGHT * 0.55, 14, true, false);

    ctx.fillStyle = "#023";
    ctx.font = "28px Verdana, Arial";
    const titleY = HEIGHT * 0.32;
    drawTextWithBackground(
      title,
      WIDTH / 2,
      titleY,
      "center",
      "28px Verdana, Arial",
      "#023",
      "rgba(255,255,255,0)",
      12
    );

    ctx.font = "20px Verdana, Arial";
    const subY = HEIGHT * 0.4;
    drawTextWithBackground(
      subtitle,
      WIDTH / 2,
      subY,
      "center",
      "20px Verdana, Arial",
      "#033",
      "rgba(255,255,255,0)",
      12
    );

    ctx.font = BODY_FONT;
    drawTextWithBackground(
      `Batteries: ${correctCount} / ${GOAL}`,
      WIDTH / 2,
      HEIGHT * 0.48,
      "center",
      BODY_FONT,
      "#023",
      "rgba(255,255,255,0)",
      12
    );
    drawTextWithBackground(
      `Wrong answers: ${wrongCount} / ${MAX_WRONG}`,
      WIDTH / 2,
      HEIGHT * 0.52,
      "center",
      BODY_FONT,
      "#023",
      "rgba(255,255,255,0)",
      12
    );

    // Restart button
    const btnW = 220;
    const btnH = 48;
    const btnX = WIDTH / 2 - btnW / 2;
    const btnY = HEIGHT * 0.62;
    ctx.fillStyle = "#6fcf97";
    roundRect(ctx, btnX, btnY, btnW, btnH, 10, true, false);
    ctx.fillStyle = "#022";
    ctx.font = BUTTON_FONT;
    ctx.textBaseline = "middle";
    const btnText = "Restart (R or Enter)";
    const bw = ctx.measureText(btnText).width;
    ctx.fillText(btnText, WIDTH / 2 - bw / 2, btnY + btnH / 2 - 2);

    ctx.font = "14px Verdana, Arial";
    drawTextWithBackground(
      "Press R or click the button to play again. Press M to toggle sound.",
      WIDTH / 2,
      btnY + btnH + 36,
      "center",
      "14px Verdana, Arial",
      "#033",
      "rgba(255,255,255,0)",
      10
    );
  }

  // Animation & rendering loop
  let lastTime = performance.now();
  function gameLoop(time) {
    const dt = Math.max(0, time - lastTime);
    lastTime = time;

    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background
    drawBackground(time);

    // UI
    drawUI();

    // Drones
    for (let i = 0; i < DRONE_COUNT; i++) {
      const pos = drones[i];
      const label = options[i] !== undefined ? options[i] : "";
      const isSel = selectedIndex === i && gameState === "playing";
      const hover = hoveredIndex === i;
      drawDrone(pos.x, pos.y, label, isSel, i, hover, dt);
    }

    // Animating particles (collect floaters / sparkles / shakes)
    const now = performance.now();
    animating = animating.filter((a) => {
      const t = (now - a.start) / a.duration;
      if (t >= 1) {
        if (a.type === "spark") {
          // occasionally play gentle pickup tone at end
          if (soundOn) {
            try {
              const o = audioCtx.createOscillator();
              const g = audioCtx.createGain();
              o.type = "sine";
              o.frequency.value = 880;
              g.gain.value = 0.0001;
              g.gain.exponentialRampToValueAtTime(0.04, audioCtx.currentTime + 0.01);
              g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
              o.connect(g);
              g.connect(audioCtx.destination);
              o.start();
              o.stop(audioCtx.currentTime + 0.3);
            } catch (e) {
              // ignore audio errors
            }
          }
        }
        return false;
      }

      // Draw based on type
      if (a.type === "float") {
        const alpha = 1 - t;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffb703";
        ctx.beginPath();
        ctx.arc(a.x, a.y - t * 110, 10 + t * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (a.type === "spark") {
        const alpha = 1 - t;
        const size = 2 + 6 * (1 - Math.abs(0.5 - t));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(255, 235, 120, ${0.6 + 0.4 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(a.x + Math.sin(t * Math.PI * 8) * 14, a.y - t * 60, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (a.type === "shake") {
        // small marker to draw a quick red flash near drone
        const alpha = 1 - t;
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = "rgba(255, 80, 80, 0.9)";
        ctx.beginPath();
        ctx.arc(a.x + Math.sin(t * 40) * 8, a.y - t * 10, 14 + t * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      return true;
    });

    // Overlays
    if (gameState === "won") {
      drawEndScreen("Victory! Drones saved the batteries!", "You collected all batteries!", "#d6f6e0");
    } else if (gameState === "lost") {
      drawEndScreen("Game Over", "Too many wrong answers. Try again!", "#ffe6e6");
    }

    if (gameState !== "menu") {
      requestAnimationFrame(gameLoop);
    }
  }

  // Input handling
  function onCanvasClick(e) {
    resumeAudioOnGesture();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (gameState === "won" || gameState === "lost") {
      const btnW = 220;
      const btnH = 48;
      const btnX = WIDTH / 2 - btnW / 2;
      const btnY = HEIGHT * 0.62;
      if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
        restartGame();
      }
      return;
    }

    if (gameState !== "playing") return;

    for (let i = 0; i < DRONE_COUNT; i++) {
      const d = drones[i];
      const dx = mx - d.x;
      const dy = my - d.y;
      if (dx * dx + dy * dy <= 56 * 56) {
        handleAnswer(i);
        break;
      }
    }
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let found = -1;
    for (let i = 0; i < DRONE_COUNT; i++) {
      const d = drones[i];
      const dx = mx - d.x;
      const dy = my - d.y;
      if (dx * dx + dy * dy <= 56 * 56) {
        found = i;
        break;
      }
    }
    hoveredIndex = found;
  }

  function handleAnswer(i) {
    if (gameState !== "playing") return;
    selectedIndex = i;
    const chosen = options[i];
    if (chosen === currentQuestion.answer) {
      correctCount++;
      // push float animation and spark
      animating.push({
        start: performance.now(),
        duration: 900,
        x: drones[i].x,
        y: drones[i].y - 10,
        type: "float",
      });
      animating.push({
        start: performance.now(),
        duration: 700,
        x: drones[i].x,
        y: drones[i].y - 18,
        type: "spark",
      });
      if (soundOn) playCorrect();
      announceToSR(
        `Correct! ${currentQuestion.text} = ${chosen}. Batteries collected ${correctCount} of ${GOAL}.`
      );
      if (correctCount >= GOAL) {
        gameState = "won";
        announceToSR("You won! Press R to play again.");
        stopBackgroundHum();
      } else {
        nextQuestion();
      }
    } else {
      wrongCount++;
      // push shake animation
      animating.push({
        start: performance.now(),
        duration: 600,
        x: drones[i].x,
        y: drones[i].y,
        type: "shake",
      });
      if (soundOn) playWrong();
      announceToSR(`Oops! ${chosen} is not correct. Wrong count ${wrongCount} of ${MAX_WRONG}.`);
      if (wrongCount >= MAX_WRONG) {
        gameState = "lost";
        announceToSR("Game over. Too many wrong answers. Press R to try again.");
        stopBackgroundHum();
      } else {
        setTimeout(() => nextQuestion(), 600);
      }
    }
    lastActionTime = performance.now();
  }

  function onKeyDown(e) {
    resumeAudioOnGesture();
    if (gameState === "won" || gameState === "lost") {
      if (e.key === "r" || e.key === "R" || e.key === "Enter") restartGame();
      if (e.key === "m" || e.key === "M") toggleSound();
      return;
    }
    if (gameState !== "playing") return;

    if (e.key === "ArrowRight") {
      selectedIndex = (selectedIndex + 1) % DRONE_COUNT;
      announceToSR(`Selected option ${selectedIndex + 1}: ${options[selectedIndex]}`);
    } else if (e.key === "ArrowLeft") {
      selectedIndex = (selectedIndex - 1 + DRONE_COUNT) % DRONE_COUNT;
      announceToSR(`Selected option ${selectedIndex + 1}: ${options[selectedIndex]}`);
    } else if (e.key === "1" || e.key === "2" || e.key === "3") {
      const idx = parseInt(e.key, 10) - 1;
      handleAnswer(idx);
    } else if (e.key === "Enter") {
      handleAnswer(selectedIndex);
    } else if (e.key === "m" || e.key === "M") {
      toggleSound();
    }
  }

  function toggleSound() {
    soundOn = !soundOn;
    announceToSR(soundOn ? "Sound on" : "Sound off");
    if (soundOn) {
      if (!audioAvailable) {
        announceToSR("Audio not available in this browser.");
      } else {
        startBackgroundHum();
      }
    } else {
      stopBackgroundHum();
    }
  }

  function restartGame() {
    correctCount = 0;
    wrongCount = 0;
    gameState = "playing";
    nextQuestion();
    if (soundOn && audioAvailable) startBackgroundHum();
    announceToSR("Game restarted. Good luck!");
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  // Input listeners
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("focus", () => announceToSR("Canvas focused. Use number keys or click to answer."));

  // Ensure user gesture resumes audio on mobile
  stage.addEventListener("pointerdown", () => resumeAudioOnGesture(), { once: true });

  // Initialization
  function init() {
    try {
      nextQuestion();
      if (soundOn && audioAvailable) startBackgroundHum();
      lastTime = performance.now();
      requestAnimationFrame(gameLoop);
      announceToSR("Welcome to Drone Math Rescue! Answer questions to collect batteries.");
    } catch (e) {
      console.error("Initialization failed:", e);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawTextWithBackground(
        "An error occurred while loading the game.",
        WIDTH / 2,
        HEIGHT / 2 - 20,
        "center",
        "18px Verdana, Arial",
        "#900",
        "rgba(255,255,255,0.9)",
        12
      );
      drawTextWithBackground(
        "Please reload the page.",
        WIDTH / 2,
        HEIGHT / 2 + 16,
        "center",
        "16px Verdana, Arial",
        "#900",
        "rgba(255,255,255,0.9)",
        12
      );
      announceToSR("Game could not be loaded. Please reload the page.");
    }
  }

  init();
})();