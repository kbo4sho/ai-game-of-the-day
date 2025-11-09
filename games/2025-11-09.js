(function () {
  // Ensure stage element exists
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    console.error("Missing container element with id 'game-of-the-day-stage'.");
    return;
  }

  // Clear stage and create canvas
  stage.innerHTML = "";
  stage.style.position = stage.style.position || "relative";

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = "720px";
  canvas.style.height = "480px";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Drone Math Quest game canvas");
  stage.appendChild(canvas);

  // Create an offscreen accessible status region for screen readers
  const a11yStatus = document.createElement("div");
  a11yStatus.setAttribute("role", "status");
  a11yStatus.setAttribute("aria-live", "polite");
  // visually hide but keep in DOM
  Object.assign(a11yStatus.style, {
    position: "absolute",
    left: "-9999px",
    width: "1px",
    height: "1px",
    overflow: "hidden",
  });
  stage.appendChild(a11yStatus);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("2D context not available.");
    return;
  }

  // Audio setup with error handling
  let audioCtx = null;
  let audioEnabled = false;
  let bgMasterGain = null;
  let bgNodes = []; // for reference to stop later
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
      // not auto-enabled; must resume on user gesture
      audioEnabled = audioCtx.state === "running";
    } else {
      console.warn("Web Audio API not supported in this browser.");
      audioCtx = null;
    }
  } catch (err) {
    console.warn("Error creating AudioContext:", err);
    audioCtx = null;
  }

  // Safely resume audio on user gesture and start background if desired
  async function ensureAudioRunning() {
    if (!audioCtx) return false;
    try {
      if (audioCtx.state !== "running") {
        await audioCtx.resume();
      }
      audioEnabled = true;
      startBackgroundAmbience();
      return true;
    } catch (err) {
      console.warn("Audio context resume failed:", err);
      audioEnabled = false;
      return false;
    }
  }

  // Stop and clear background ambience nodes
  function stopBackgroundAmbience() {
    try {
      for (const n of bgNodes) {
        try {
          if (n.osc && n.osc.stop) n.osc.stop(0);
        } catch (e) {}
        try {
          if (n.node && n.node.disconnect) n.node.disconnect();
        } catch (e) {}
      }
    } catch (err) {
      // ignore
    }
    bgNodes = [];
    if (bgMasterGain) {
      try {
        bgMasterGain.disconnect();
      } catch (e) {}
      bgMasterGain = null;
    }
  }

  // Create gentle layered background ambience: low pad + airy shimmer + slow LFO
  function startBackgroundAmbience() {
    if (!audioCtx || !audioEnabled) return;
    try {
      stopBackgroundAmbience();

      bgMasterGain = audioCtx.createGain();
      bgMasterGain.gain.value = 0.02; // gentle overall volume
      bgMasterGain.connect(audioCtx.destination);

      // Low pad oscillator (sine) - very low frequency to create warmth
      const pad = audioCtx.createOscillator();
      pad.type = "sine";
      pad.frequency.value = 80;
      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.6;
      // gentle amplitude envelope
      padGain.gain.setValueAtTime(0, audioCtx.currentTime);
      padGain.gain.linearRampToValueAtTime(0.6, audioCtx.currentTime + 2);
      pad.connect(padGain).connect(bgMasterGain);

      // Shimmer oscillator (triangle) modulated by slow LFO for movement
      const shimmer = audioCtx.createOscillator();
      shimmer.type = "triangle";
      shimmer.frequency.value = 420;
      const shimmerGain = audioCtx.createGain();
      shimmerGain.gain.value = 0.03;
      shimmer.connect(shimmerGain).connect(bgMasterGain);

      // LFO modulating pad detune for subtle motion
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.08; // very slow
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 6; // cents
      lfo.connect(lfoGain);
      // connect lfo to detune parameter (in cents) if available
      if (pad.detune) {
        lfoGain.connect(pad.detune);
      } else if (pad.frequency) {
        // fallback: modulate frequency slightly
        const lfoToFreq = audioCtx.createGain();
        lfoToFreq.gain.value = 0.5;
        lfo.connect(lfoToFreq);
        lfoToFreq.connect(pad.frequency);
      }

      // Slight filter to mellow shimmer
      const shimmerFilter = audioCtx.createBiquadFilter();
      shimmerFilter.type = "lowpass";
      shimmerFilter.frequency.value = 2800;
      shimmerGain.connect(shimmerFilter).connect(bgMasterGain);

      // Start nodes
      pad.start();
      shimmer.start();
      lfo.start();

      bgNodes.push({ osc: pad, node: padGain });
      bgNodes.push({ osc: shimmer, node: shimmerGain });
      bgNodes.push({ osc: lfo, node: lfoGain });
    } catch (err) {
      console.warn("Error starting background ambience:", err);
    }
  }

  // Play short envelope beep with safe oscillator creation
  function playBeep({ pitch = 800, duration = 0.12, type = "sine", volume = 0.06 }) {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = type;
      osc.frequency.value = pitch;

      filter.type = "lowpass";
      filter.frequency.value = 6000;

      gain.gain.value = 0.0001;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      // Quick envelope
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (err) {
      console.warn("playBeep error:", err);
    }
  }

  // Selection tick sound
  function playSelectSound() {
    playBeep({ pitch: 1200, duration: 0.06, type: "triangle", volume: 0.03 });
  }

  function playCorrectSound() {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      // Arpeggio of three tones
      const freqs = [880, 1100, 1320];
      freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filt = audioCtx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 5000 - i * 800;
        osc.type = i === 0 ? "triangle" : "sine";
        osc.frequency.value = f;
        gain.gain.value = 0.0001;
        osc.connect(filt).connect(gain).connect(audioCtx.destination);
        const start = now + i * 0.06;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.08 - i * 0.02, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.start(start);
        osc.stop(start + 0.22);
      });
      // small bell shimmer
      setTimeout(() => playBeep({ pitch: 2400, duration: 0.12, type: "sine", volume: 0.02 }), 160);
    } catch (err) {
      console.warn("playCorrectSound error:", err);
    }
  }

  function playWrongSound() {
    if (!audioCtx || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      // low thud
      const thud = audioCtx.createOscillator();
      const thudGain = audioCtx.createGain();
      const thudFilter = audioCtx.createBiquadFilter();
      thud.type = "sine";
      thud.frequency.value = 160;
      thudFilter.type = "lowpass";
      thudFilter.frequency.value = 500;
      thud.connect(thudFilter).connect(thudGain).connect(audioCtx.destination);
      thudGain.gain.setValueAtTime(0.0001, now);
      thudGain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      thud.start(now);
      thud.stop(now + 0.3);

      // short buzzy noise via high-frequency oscillator and filter
      setTimeout(() => {
        const buzz = audioCtx.createOscillator();
        buzz.type = "square";
        buzz.frequency.value = 420;
        const buzzGain = audioCtx.createGain();
        buzzGain.gain.value = 0.0001;
        const buzzFilter = audioCtx.createBiquadFilter();
        buzzFilter.type = "bandpass";
        buzzFilter.frequency.value = 800;
        buzz.connect(buzzFilter).connect(buzzGain).connect(audioCtx.destination);
        const t = audioCtx.currentTime;
        buzzGain.gain.setValueAtTime(0.0001, t);
        buzzGain.gain.exponentialRampToValueAtTime(0.04, t + 0.01);
        buzzGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        buzz.start(t);
        buzz.stop(t + 0.14);
      }, 60);
    } catch (err) {
      console.warn("playWrongSound error:", err);
    }
  }

  // Game constants and state (kept intact)
  const WIDTH = 720;
  const HEIGHT = 480;
  const UI_PADDING = 10;
  const SCORE_GOAL = 10;
  const ALLOWED_WRONG = 3;
  const FONT_BODY = "16px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
  const FONT_IMPORTANT = "20px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";

  let score = 0;
  let wrongCount = 0;
  let currentQuestion = null;
  let choices = [];
  let selectedIndex = 0;
  let hoverIndex = -1;
  let gameState = "intro"; // intro, playing, victory, gameover
  let drone = {
    x: WIDTH / 2,
    y: 150,
    w: 120,
    h: 50,
    bobPhase: 0,
    targetX: WIDTH / 2,
    wobble: 0,
  };
  let stars = []; // animated collected stars
  let confetti = []; // victory confetti particles
  let lastTime = performance.now();
  let overlayAlpha = 1.0; // for smooth overlay transitions

  // UI elements detection (buttons)
  const restartButton = {
    x: WIDTH / 2 - 90,
    y: HEIGHT / 2 + 60,
    w: 180,
    h: 44,
  };
  const soundButton = {
    x: WIDTH - 10 - 36,
    y: 10,
    w: 36,
    h: 36,
  };

  // Keep existing question generation (unchanged logic)
  function generateQuestion() {
    const ops = ["+"];
    if (Math.random() < 0.4) ops.push("-");
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, answer;
    if (op === "+") {
      a = Math.floor(Math.random() * 12) + 1;
      b = Math.floor(Math.random() * 9) + 0;
      answer = a + b;
    } else {
      a = Math.floor(Math.random() * 12) + 5;
      b = Math.floor(Math.random() * 5);
      answer = a - b;
    }
    const optionSet = new Set();
    optionSet.add(answer);
    while (optionSet.size < 4) {
      const delta = Math.floor(Math.random() * 7) - 3;
      let candidate = answer + delta;
      if (candidate < 0) candidate = Math.abs(candidate + 2);
      if (optionSet.has(candidate)) {
        candidate = answer + (Math.floor(Math.random() * 7) + 2);
      }
      optionSet.add(candidate);
    }
    const optionList = Array.from(optionSet);
    for (let i = optionList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optionList[i], optionList[j]] = [optionList[j], optionList[i]];
    }

    currentQuestion = {
      a,
      b,
      op,
      answer,
      text: `${a} ${op} ${b} = ?`,
    };
    choices = optionList;
    selectedIndex = 0;
    hoverIndex = -1;
    a11yStatus.textContent = `New question: ${currentQuestion.text}. Options: ${choices.join(", ")}. Press 1 to 4 to choose.`;
  }

  // UI helpers: draw rounded rect with optional stroke
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
      ctx.strokeStyle = strokeStyle.color || strokeStyle;
      ctx.lineWidth = strokeStyle.width || 1;
      ctx.stroke();
    }
  }

  // Draw a stylized drone with subtle animation enhancements
  function drawDrone(dt) {
    drone.bobPhase += dt * 0.004;
    const bob = Math.sin(drone.bobPhase * 2) * 6;
    drone.wobble = Math.sin(drone.bobPhase * 4) * 4;

    drone.x += (drone.targetX - drone.x) * 0.03;

    const cx = drone.x;
    const cy = drone.y + bob;

    ctx.save();

    // shadow beneath drone
    ctx.beginPath();
    ctx.ellipse(cx, cy + drone.h / 2 + 26, 56, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(16,20,24,0.14)";
    ctx.fill();

    // drone body: layered gradient
    const bodyGrad = ctx.createLinearGradient(cx - 60, cy - 20, cx + 60, cy + 20);
    bodyGrad.addColorStop(0, "#7FC7D9");
    bodyGrad.addColorStop(0.6, "#5DA8C0");
    bodyGrad.addColorStop(1, "#4E8398");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, drone.w / 2, drone.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // canopy/glass
    ctx.beginPath();
    ctx.ellipse(cx - 14, cy - 6, 42, 24, -0.18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fill();

    // side panels
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(cx - drone.w / 2 + 6, cy - 6, 28, 12);
    ctx.fillRect(cx + drone.w / 2 - 34, cy - 6, 28, 12);

    // propellers with blurred blades (soft arcs)
    const props = [
      [-drone.w / 2 + 12, -drone.h / 2 - 10],
      [drone.w / 2 - 12, -drone.h / 2 - 10],
      [-drone.w / 2 + 12, drone.h / 2 + 8],
      [drone.w / 2 - 12, drone.h / 2 + 8],
    ];
    for (let i = 0; i < props.length; i++) {
      const [px, py] = props[i];
      ctx.save();
      ctx.translate(cx + px, cy + py);
      ctx.rotate(drone.bobPhase * (i % 2 ? -6 : 6));
      // soft blade shapes using arcs
      ctx.fillStyle = "rgba(16,20,24,0.12)";
      for (let b = 0; b < 3; b++) {
        ctx.beginPath();
        ctx.ellipse((b - 1) * 8, -6, 28, 6, b * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // hub
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#2B3440";
      ctx.fill();
      ctx.restore();
    }

    // package (crate) under drone with a math glyph
    ctx.save();
    ctx.translate(cx, cy + 24);
    // crate body
    drawRoundedRect(cx - 22, cy + 22, 44, 28, 6, "#C97B5A"); // fallback (not ideal)
    ctx.fillStyle = "#D07457";
    ctx.fillRect(-22, 22, 44, 28);
    // label
    ctx.fillStyle = "#2B3440";
    ctx.font = "bold 18px sans-serif";
    const symbol = "?";
    const w = ctx.measureText(symbol).width;
    ctx.fillText(symbol, -w / 2, 22 + 18);
    ctx.restore();

    // speech bubble with question (subtle rounded rectangle and drop shadow)
    const bubbleText = currentQuestion ? currentQuestion.text : "Click to start";
    ctx.font = FONT_IMPORTANT;
    const metrics = ctx.measureText(bubbleText);
    const bw = Math.min(260, metrics.width + 26);
    const bh = 40;
    const bx = cx - bw / 2;
    const by = cy - drone.h / 2 - bh - 14;

    // slight drop shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(12,16,20,0.08)";
    ctx.roundedRect = ctx.roundedRect || function (x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    ctx.roundedRect(bx + 3, by + 3, bw, bh, 10);
    ctx.fill();

    drawRoundedRect(bx, by, bw, bh, 10, "rgba(255,255,255,0.96)");
    // small pointer triangle
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.moveTo(cx - 8, by + bh);
    ctx.lineTo(cx + 8, by + bh);
    ctx.lineTo(cx, by + bh + 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#2B3440";
    ctx.font = FONT_IMPORTANT;
    ctx.fillText(bubbleText, bx + 12, by + 26);

    ctx.restore();
  }

  // Draw choices as colorful power-cells with animations
  function drawChoices(now) {
    const bottomY = HEIGHT - 100;
    const cellRadius = 36;
    const spacing = 18;
    const totalWidth = choices.length * (cellRadius * 2) + (choices.length - 1) * spacing;
    let startX = (WIDTH - totalWidth) / 2 + cellRadius;

    ctx.font = "16px Inter, sans-serif";
    for (let i = 0; i < choices.length; i++) {
      const x = startX + i * (2 * cellRadius + spacing);
      const y = bottomY;
      const isSelected = selectedIndex === i;
      const isHover = hoverIndex === i;

      // subtle floating for each cell
      const floatOffset = Math.sin(lastTime / 300 + i) * 4;

      // background ring shadow
      ctx.beginPath();
      ctx.arc(x, y + floatOffset, cellRadius + 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(8,10,12,0.03)";
      ctx.fill();

      // cell gradient
      const g = ctx.createLinearGradient(x - cellRadius, y - cellRadius, x + cellRadius, y + cellRadius);
      const baseColors = ["#FFF1C0", "#CDE7FF", "#E7F7E6", "#FDE6F0"];
      const c1 = baseColors[i % baseColors.length];
      const c2 = shadeColor(c1, -18);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);

      // scale effect if selected
      const scale = isSelected ? 1.08 : isHover ? 1.03 : 1.0;
      ctx.save();
      ctx.translate(x, y + floatOffset);
      ctx.scale(scale, scale);

      // main circular cell
      ctx.beginPath();
      ctx.arc(0, 0, cellRadius, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      // inner glossy highlight
      ctx.beginPath();
      ctx.ellipse(-10, -12, cellRadius * 0.6, cellRadius * 0.34, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fill();

      // border
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.strokeStyle = isSelected ? "rgba(136,192,208,0.95)" : "rgba(44,58,74,0.12)";
      ctx.stroke();

      // number label top-left
      ctx.fillStyle = "#4C566A";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText(`${i + 1}`, -cellRadius + 8, -cellRadius + 12);

      // choice text centered
      ctx.fillStyle = "#2B3440";
      ctx.font = "18px Inter, sans-serif";
      const text = String(choices[i]);
      const tw = ctx.measureText(text).width;
      ctx.fillText(text, -tw / 2, 6);

      // small glow when selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(0, 0, cellRadius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(136,192,208,0.14)";
        ctx.lineWidth = 8;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // Utility: shade a hex-like color string slightly (very simple)
  function shadeColor(color, percent) {
    try {
      // Accept #RRGGBB or simple names from baseColors; we can map baseColors to hex in code if needed
      // We'll implement a robust parser for hex; if parsing fails, return original color.
      if (color[0] === "#") {
        let R = parseInt(color.substring(1, 3), 16);
        let G = parseInt(color.substring(3, 5), 16);
        let B = parseInt(color.substring(5, 7), 16);
        R = parseInt((R * (100 + percent)) / 100);
        G = parseInt((G * (100 + percent)) / 100);
        B = parseInt((B * (100 + percent)) / 100);
        R = Math.min(255, R);
        G = Math.min(255, G);
        B = Math.min(255, B);
        const RR = R.toString(16).padStart(2, "0");
        const GG = G.toString(16).padStart(2, "0");
        const BB = B.toString(16).padStart(2, "0");
        return "#" + RR + GG + BB;
      }
      // fallback for named colors or gradients: return slightly transparent white/black overlay
      if (percent < 0) return color;
      return color;
    } catch (e) {
      return color;
    }
  }

  // Draw top UI (score, goal, lives) with clear padding and star icon
  function drawTopUI() {
    ctx.font = FONT_IMPORTANT;
    // Score left
    const scoreText = `Score: ${score}/${SCORE_GOAL}`;
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreW = scoreMetrics.width + 56;
    const scoreH = 36;
    const scoreX = UI_PADDING;
    const scoreY = UI_PADDING;
    drawRoundedRect(scoreX, scoreY, scoreW, scoreH, 8, "rgba(255,255,255,0.95)");
    // star icon
    ctx.save();
    ctx.translate(scoreX + 16, scoreY + 18);
    drawStar(ctx, 0, 0, 6, 12, "#EBCB8B");
    ctx.restore();
    ctx.fillStyle = "#2B3440";
    ctx.fillText(scoreText, scoreX + 36, scoreY + 24);

    // Lives top-right
    ctx.font = FONT_IMPORTANT;
    const livesText = `x ${ALLOWED_WRONG - wrongCount}`;
    const livesMetrics = ctx.measureText(livesText);
    const livesW = livesMetrics.width + 56;
    const livesH = 36;
    const livesX = WIDTH - UI_PADDING - livesW - soundButton.w - 12;
    const livesY = UI_PADDING;
    drawRoundedRect(livesX, livesY, livesW, livesH, 8, "rgba(255,255,255,0.95)");
    // heart icon
    ctx.save();
    ctx.translate(livesX + 18, livesY + 18);
    drawHeart(ctx, 0, 0, 8, "#D87B7B");
    ctx.restore();
    ctx.fillStyle = "#2B3440";
    ctx.fillText(livesText, livesX + 36, livesY + 24);

    // Goal center top
    ctx.font = "18px Inter, sans-serif";
    const goalText = `Collect ${SCORE_GOAL} stars to win`;
    const goalMetrics = ctx.measureText(goalText);
    const goalW = goalMetrics.width + 20;
    const goalH = 32;
    const goalX = (WIDTH - goalW) / 2;
    const goalY = UI_PADDING + 2;
    drawRoundedRect(goalX, goalY, goalW, goalH, 8, "rgba(255,255,255,0.95)");
    ctx.fillStyle = "#2B3440";
    ctx.fillText(goalText, goalX + 10, goalY + 22);

    // Sound button top-right (refined)
    ctx.save();
    const sb = soundButton;
    drawRoundedRect(sb.x, sb.y, sb.w, sb.h, 8, "rgba(255,255,255,0.95)");
    ctx.translate(sb.x + sb.w / 2, sb.y + sb.h / 2);
    // speaker
    ctx.fillStyle = audioEnabled ? "#7FC7D9" : "#D08770";
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.lineTo(-3, -6);
    ctx.lineTo(6, -12);
    ctx.lineTo(6, 12);
    ctx.lineTo(-3, 6);
    ctx.lineTo(-9, 6);
    ctx.closePath();
    ctx.fill();
    if (audioEnabled) {
      ctx.strokeStyle = "#7FC7D9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(11, -1, 6, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(13, -1, 10, -0.9, 0.9);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#D08770";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, -8);
      ctx.lineTo(14, -2);
      ctx.moveTo(8, -2);
      ctx.lineTo(14, -8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Simple draw star used in UI
  function drawStar(ctxLocal, x, y, innerR, outerR, color) {
    ctxLocal.save();
    ctxLocal.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? outerR : innerR;
      const a = (k * Math.PI) / 5;
      ctxLocal.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctxLocal.closePath();
    ctxLocal.fillStyle = color;
    ctxLocal.fill();
    ctxLocal.restore();
  }

  // Simple heart shape
  function drawHeart(ctxLocal, x, y, size, color) {
    ctxLocal.save();
    ctxLocal.beginPath();
    ctxLocal.moveTo(x, y + size / 2);
    ctxLocal.bezierCurveTo(x, y, x - size, y, x - size, y + size / 2);
    ctxLocal.bezierCurveTo(x - size, y + size, x, y + size * 1.25, x, y + size * 1.5);
    ctxLocal.bezierCurveTo(x, y + size * 1.25, x + size, y + size, x + size, y + size / 2);
    ctxLocal.bezierCurveTo(x + size, y, x, y, x, y + size / 2);
    ctxLocal.fillStyle = color;
    ctxLocal.fill();
    ctxLocal.restore();
  }

  // Draw bottom instructions box with good spacing
  function drawInstructions() {
    ctx.font = FONT_BODY;
    const lines = [
      "How to play: Solve the math shown on the drone. Choose the correct power-cell.",
      "Keyboard: 1-4 to pick, ←/→ to change, Enter to confirm, R to restart, M to toggle audio.",
      "Goal: Get 10 correct answers. Lose after 3 wrong answers.",
      audioCtx ? "Click to enable audio if sound is off." : "Audio unavailable in this browser.",
    ];
    const padding = 12;
    let maxW = 0;
    ctx.font = FONT_BODY;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxW) maxW = w;
    }
    const boxW = maxW + padding * 2;
    const boxH = lines.length * 20 + padding * 2;
    const boxX = (WIDTH - boxW) / 2;
    const boxY = HEIGHT - boxH - 10;
    drawRoundedRect(boxX, boxY, boxW, boxH, 10, "rgba(255,255,255,0.9)");
    ctx.fillStyle = "#455164";
    ctx.font = FONT_BODY;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], boxX + padding, boxY + padding + 16 + i * 20);
    }
  }

  // Update and draw collected stars that fly to the score area
  function updateAndDrawStars(dt) {
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      // spring toward target
      const ax = (s.tx - s.x) * 0.006 * dt;
      const ay = (s.ty - s.y) * 0.006 * dt + 0.0005 * dt;
      s.vx += ax;
      s.vy += ay;
      s.x += s.vx * dt * 0.001;
      s.y += s.vy * dt * 0.001;
      s.angle += 0.05 * dt * 0.001;
      // draw star with subtle glow
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.shadowColor = "rgba(235,203,139,0.35)";
      ctx.shadowBlur = 8;
      drawStar(ctx, 0, 0, 4, 10, s.color);
      ctx.shadowBlur = 0;
      ctx.restore();
      if (Math.hypot(s.x - s.tx, s.y - s.ty) < 8) {
        stars.splice(i, 1);
      }
    }
  }

  // Handle correct event (keeps mechanics)
  function handleCorrect(xy) {
    score++;
    a11yStatus.textContent = `Correct! Score ${score} of ${SCORE_GOAL}.`;
    const scorePosX = UI_PADDING + 40;
    const scorePosY = UI_PADDING + 18;
    const s = {
      x: xy ? xy.x : drone.x,
      y: xy ? xy.y : drone.y + 40,
      tx: scorePosX,
      ty: scorePosY,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -Math.random() * 0.6 - 0.4,
      angle: Math.random() * Math.PI,
      color: "#EBCB8B",
    };
    stars.push(s);
    try {
      playCorrectSound();
    } catch (err) {
      console.warn("Error playing correct sound:", err);
    }

    // drone bounce and slight reposition
    drone.targetX = Math.random() * (WIDTH - 200) + 100;

    // success confetti spawn when final star achieved
    if (score >= SCORE_GOAL) {
      gameState = "victory";
      stopBackgroundAmbience();
      spawnConfetti();
      a11yStatus.textContent = `Victory! You collected ${score} stars. Press R to restart.`;
    } else {
      setTimeout(() => {
        generateQuestion();
      }, 700);
    }
  }

  // Handle wrong event (keeps mechanics)
  function handleWrong() {
    wrongCount++;
    a11yStatus.textContent = `Oops! Wrong answer. ${ALLOWED_WRONG - wrongCount} lives remaining.`;
    try {
      playWrongSound();
    } catch (err) {
      console.warn("Error playing wrong sound:", err);
    }
    drone.wobble += 12;

    if (wrongCount >= ALLOWED_WRONG) {
      gameState = "gameover";
      stopBackgroundAmbience();
      a11yStatus.textContent = `Game over. You made ${wrongCount} wrong answers. Press R to restart.`;
    } else {
      setTimeout(() => {
        generateQuestion();
      }, 700);
    }
  }

  // Validate and process a chosen index (unchanged logic)
  function chooseIndex(i, clickPos) {
    if (gameState !== "playing") return;
    if (i < 0 || i >= choices.length) return;
    if (!currentQuestion) return;
    const chosen = choices[i];
    // slight feedback for selection
    playSelectSound();
    if (chosen === currentQuestion.answer) {
      handleCorrect(clickPos || { x: drone.x, y: drone.y });
    } else {
      handleWrong();
    }
  }

  // Draw overlay (intro, victory, gameover) with soft card and subtle animations
  let overlayFade = 1.0;
  function drawOverlay(now) {
    // darken background slightly for focus
    ctx.save();
    ctx.fillStyle = `rgba(12,16,20,0.48)`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "28px Inter, sans-serif";
    ctx.textAlign = "center";

    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2 - 60;

    if (gameState === "intro") {
      ctx.fillText("Drone Math Quest", centerX, centerY);
      ctx.font = "18px Inter, sans-serif";
      ctx.fillText("Help the friendly drone collect power stars by solving math!", centerX, centerY + 34);
      ctx.fillText("Click or press any key to begin (and enable sound if desired).", centerX, centerY + 60);
      // start button
      drawRoundedRect(restartButton.x, restartButton.y, restartButton.w, restartButton.h, 10, "#7FC7D9");
      ctx.fillStyle = "#12202A";
      ctx.font = "18px Inter, sans-serif";
      ctx.fillText("Start Game", WIDTH / 2, restartButton.y + 28);
    } else if (gameState === "victory") {
      ctx.fillText("Victory!", centerX, centerY);
      ctx.font = "18px Inter, sans-serif";
      ctx.fillText(`You collected ${score} stars! Great job flying with the drone.`, centerX, centerY + 34);
      ctx.fillText(`Wrong answers: ${wrongCount}`, centerX, centerY + 64);
      drawRoundedRect(restartButton.x, restartButton.y, restartButton.w, restartButton.h, 10, "#A3BE8C");
      ctx.fillStyle = "#12202A";
      ctx.fillText("Play Again (R)", WIDTH / 2, restartButton.y + 28);
    } else if (gameState === "gameover") {
      ctx.fillText("Game Over", centerX, centerY);
      ctx.font = "18px Inter, sans-serif";
      ctx.fillText(`You made ${wrongCount} wrong answers. Try again to beat ${SCORE_GOAL} stars.`, centerX, centerY + 34);
      drawRoundedRect(restartButton.x, restartButton.y, restartButton.w, restartButton.h, 10, "#D08770");
      ctx.fillStyle = "#12202A";
      ctx.fillText("Restart (R)", WIDTH / 2, restartButton.y + 28);
    }

    ctx.restore();
    ctx.textAlign = "left";
  }

  // Confetti particle spawn (visual only)
  function spawnConfetti() {
    confetti = [];
    for (let i = 0; i < 60; i++) {
      confetti.push({
        x: Math.random() * WIDTH,
        y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 2,
        vy: 1 + Math.random() * 2,
        size: 6 + Math.random() * 8,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.12,
        color: ["#EBCB8B", "#A3BE8C", "#B48EAD", "#88C0D0", "#D08770"][Math.floor(Math.random() * 5)],
      });
    }
  }

  function updateAndDrawConfetti(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 0.03 * dt * 0.001;
      p.x += p.vx * dt * 0.6;
      p.y += p.vy * dt * 0.6;
      p.angle += p.spin * dt * 0.001;
      // draw rectangle rotated
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
      if (p.y > HEIGHT + 40) confetti.splice(i, 1);
    }
  }

  // Background: layered sky, sun, distant hills, and parallax clouds
  let cloudPhases = [0, 4000, 9000, 16000];
  function drawBackground(now) {
    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#EAF7FB");
    sky.addColorStop(0.6, "#F7FBFF");
    sky.addColorStop(1, "#FFFFFF");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun with radial glow
    const sunX = 80;
    const sunY = 80;
    const rg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 120);
    rg.addColorStop(0, "rgba(255,230,160,0.95)");
    rg.addColorStop(0.6, "rgba(255,230,160,0.25)");
    rg.addColorStop(1, "rgba(255,230,160,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(sunX - 120, sunY - 120, 240, 240);

    // distant rolling hills
    drawHills();

    // clouds (parallax)
    drawClouds(now);
  }

  function drawHills() {
    // rear hill
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    ctx.quadraticCurveTo(160, HEIGHT - 120, 360, HEIGHT - 80);
    ctx.quadraticCurveTo(540, HEIGHT - 40, WIDTH, HEIGHT - 90);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fillStyle = "#E6F3F6";
    ctx.fill();

    // front hill
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    ctx.quadraticCurveTo(120, HEIGHT - 60, 300, HEIGHT - 40);
    ctx.quadraticCurveTo(460, HEIGHT - 20, WIDTH, HEIGHT - 50);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fillStyle = "#F6FBFD";
    ctx.fill();
  }

  function drawClouds(now) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < cloudPhases.length; i++) {
      const cp = cloudPhases[i];
      const x = ((now + cp) * 0.02) % (WIDTH + 250) - 120;
      const y = 40 + i * 36;
      drawCloud(x, y, 86 + i * 6, 0.92 - i * 0.12);
    }
    ctx.restore();
  }

  function drawCloud(cx, cy, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.56, size * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + size * 0.5, cy + 6, size * 0.38, size * 0.28, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - size * 0.5, cy + 6, size * 0.38, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Landing pad visuals (kept but stylized)
  function drawLandingPad() {
    const padX = WIDTH / 2 - 120;
    const padY = HEIGHT - 170;
    // base slab
    drawRoundedRect(padX, padY, 240, 16, 8, "#EDEFF2");
    // stripes
    ctx.fillStyle = "#D8DEE9";
    ctx.fillRect(padX + 18, padY - 6, 204, 6);
    // subtle marking
    ctx.fillStyle = "#C7D2DB";
    ctx.font = "14px Inter, sans-serif";
    ctx.fillText("SAFE LANDING", padX + 66, padY + 12);
  }

  // Pointer utilities
  function getCanvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  // Input handling (click)
  canvas.addEventListener("click", async (evt) => {
    const pos = getCanvasPos(evt);

    // If audio not enabled, user gesture enables audio
    if (audioCtx && !audioEnabled) {
      const ok = await ensureAudioRunning();
      if (ok) {
        a11yStatus.textContent = "Audio enabled.";
      } else {
        a11yStatus.textContent = "Audio could not be enabled.";
      }
    }

    // If overlay intro and click inside start button, begin
    if (gameState === "intro") {
      if (pointInRect(pos, restartButton)) {
        startGame();
      } else {
        startGame();
      }
      return;
    }

    // Overlay restart handling
    if (gameState === "victory" || gameState === "gameover") {
      if (pointInRect(pos, restartButton)) {
        restartGame();
      }
      return;
    }

    // Sound button click
    if (pointInRect(pos, soundButton)) {
      if (!audioEnabled) {
        const ok = await ensureAudioRunning();
        if (!ok) {
          a11yStatus.textContent = "Audio not available.";
        }
      } else {
        audioEnabled = false;
        stopBackgroundAmbience();
        a11yStatus.textContent = "Audio muted.";
      }
      return;
    }

    // Choices click detection (same geometry as draw)
    const bottomY = HEIGHT - 100;
    const cellRadius = 36;
    const spacing = 18;
    const totalWidth = choices.length * (cellRadius * 2) + (choices.length - 1) * spacing;
    let startX = (WIDTH - totalWidth) / 2 + cellRadius;
    for (let i = 0; i < choices.length; i++) {
      const x = startX + i * (2 * cellRadius + spacing);
      const y = bottomY;
      if (Math.hypot(pos.x - x, pos.y - y) <= cellRadius + 10) {
        selectedIndex = i;
        chooseIndex(i, pos);
        return;
      }
    }
  });

  // Track hover index for mousemove
  canvas.addEventListener("mousemove", (evt) => {
    const pos = getCanvasPos(evt);
    const bottomY = HEIGHT - 100;
    const cellRadius = 36;
    const spacing = 18;
    const totalWidth = choices.length * (cellRadius * 2) + (choices.length - 1) * spacing;
    let startX = (WIDTH - totalWidth) / 2 + cellRadius;
    let found = -1;
    for (let i = 0; i < choices.length; i++) {
      const x = startX + i * (2 * cellRadius + spacing);
      const y = bottomY;
      if (Math.hypot(pos.x - x, pos.y - y) <= cellRadius + 8) {
        found = i;
        break;
      }
    }
    if (found !== hoverIndex) {
      hoverIndex = found;
      if (found >= 0) {
        playSelectSound();
      }
    }
  });

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // Keyboard controls
  window.addEventListener("keydown", async (evt) => {
    if (evt.repeat) return;
    const key = evt.key.toLowerCase();
    if (gameState === "intro") {
      if (key) startGame();
      return;
    }
    if (key === "m") {
      if (!audioEnabled) {
        const ok = await ensureAudioRunning();
        if (!ok) a11yStatus.textContent = "Audio not available.";
      } else {
        audioEnabled = false;
        stopBackgroundAmbience();
        a11yStatus.textContent = "Audio muted.";
      }
      return;
    }
    if (key === "r") {
      restartGame();
      return;
    }
    if (gameState !== "playing") return;

    if (["1", "2", "3", "4"].includes(key)) {
      const idx = parseInt(key, 10) - 1;
      selectedIndex = idx;
      chooseIndex(idx);
      return;
    }
    if (key === "arrowleft") {
      selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
      a11yStatus.textContent = `Selected option ${selectedIndex + 1}.`;
      playSelectSound();
      return;
    }
    if (key === "arrowright") {
      selectedIndex = (selectedIndex + 1) % choices.length;
      a11yStatus.textContent = `Selected option ${selectedIndex + 1}.`;
      playSelectSound();
      return;
    }
    if (key === "enter") {
      chooseIndex(selectedIndex);
      return;
    }
  });

  // Restart game (visual reset)
  function restartGame() {
    score = 0;
    wrongCount = 0;
    stars = [];
    confetti = [];
    currentQuestion = null;
    choices = [];
    selectedIndex = 0;
    hoverIndex = -1;
    gameState = "intro";
    overlayAlpha = 1.0;
    a11yStatus.textContent = "Game reset. Press any key or click to start.";
  }

  // Start game
  function startGame() {
    if (gameState === "playing") return;
    score = 0;
    wrongCount = 0;
    stars = [];
    confetti = [];
    currentQuestion = null;
    choices = [];
    selectedIndex = 0;
    hoverIndex = -1;
    gameState = "playing";
    lastTime = performance.now();
    drone.targetX = WIDTH / 2;
    generateQuestion();
    if (audioCtx && !audioEnabled) {
      ensureAudioRunning().then((ok) => {
        if (!ok) {
          a11yStatus.textContent = "Audio not enabled. Press M to enable audio.";
        }
      });
    } else if (audioEnabled) {
      startBackgroundAmbience();
    }
    a11yStatus.textContent = "Game started. Solve the first question.";
  }

  // Main render loop
  function render(now) {
    const dt = now - lastTime;
    lastTime = now;

    // Clear canvas
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw background layers
    drawBackground(now);

    // Draw drone and other midground items
    drawDrone(dt);

    // Choices
    drawChoices(now);

    // Update stars and confetti
    updateAndDrawStars(dt);
    if (gameState === "victory") {
      updateAndDrawConfetti(dt);
    }

    // Top UI overlays
    drawTopUI();

    // Instructions at bottom
    drawInstructions();

    // Landing pad for depth
    drawLandingPad();

    // Overlay screens
    if (gameState !== "playing") {
      drawOverlay(now);
    }

    // Continue loop
    requestAnimationFrame(render);
  }

  // Kick off
  lastTime = performance.now();
  requestAnimationFrame(render);

  // Initialize intro message
  a11yStatus.textContent = "Welcome to Drone Math Quest. Press any key or click to start.";

  // Expose some functions to console for debugging (non-essential)
  window._droneMathQuest = {
    restart: restartGame,
    start: startGame,
    getState: () => ({ score, wrongCount, gameState }),
  };
})();