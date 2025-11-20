(function () {
  // Drone Math Adventure - Visual & Audio Enhancements Only
  // Renders inside #game-of-the-day-stage
  "use strict";

  // Configuration (game mechanics unchanged)
  const WIDTH = 720;
  const HEIGHT = 480;
  const REQUIRED_CORRECT = 10;
  const MAX_WRONG = 3;
  const UI_PADDING = 10;
  const BODY_FONT = "16px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
  const IMPORTANT_FONT = "20px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
  const TITLE_FONT = "28px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
  const OPTION_FONT = "22px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";

  // Utility helpers
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Get container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container #game-of-the-day-stage not found.");
    return;
  }

  // Clear container and ensure size
  container.innerHTML = "";
  container.style.width = WIDTH + "px";
  container.style.height = HEIGHT + "px";
  container.style.position = "relative";

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "Drone Math Adventure game area. Use mouse or keyboard to play.");
  canvas.style.outline = "none";
  canvas.style.display = "block";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Accessibility: focus canvas to receive keyboard events
  canvas.tabIndex = 0;
  canvas.focus();

  // Audio setup with robust error handling
  let audioEnabled = true;
  let audioCtx = null;
  let masterGain = null;
  let ambientGain = null;
  let ambientNodes = [];
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio API not supported.");
    audioCtx = new AC();
    // Create master gain with gentle default volume
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);

    // Ambient pad: layered gentle oscillators with lowpass for warm pad
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0.06;
    ambientGain.connect(masterGain);

    // Two slow sine oscillators detuned for a pad
    const padOsc1 = audioCtx.createOscillator();
    padOsc1.type = "sine";
    padOsc1.frequency.value = 110;
    const padOsc2 = audioCtx.createOscillator();
    padOsc2.type = "sine";
    padOsc2.frequency.value = 138.5; // detune a bit

    const padFilter = audioCtx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 700;

    // gentle tremolo via gain node LFO
    const tremGain = audioCtx.createGain();
    tremGain.gain.value = 0.5;
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.08; // slow
    lfoGain.gain.value = 0.08; // low depth
    lfo.connect(lfoGain);
    lfoGain.connect(tremGain.gain);

    // Connect chain
    padOsc1.connect(padFilter);
    padOsc2.connect(padFilter);
    padFilter.connect(tremGain);
    tremGain.connect(ambientGain);

    padOsc1.start();
    padOsc2.start();
    lfo.start();

    ambientNodes.push(padOsc1, padOsc2, lfo, padFilter, tremGain);
  } catch (e) {
    console.warn("Audio unavailable:", e);
    audioEnabled = false;
    audioCtx = null;
  }

  function resumeAudioIfNeeded() {
    if (!audioEnabled || !audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => console.warn("Audio resume failed:", e));
    }
  }

  // Small helper to create transient noise burst
  function playNoiseBurst({ duration = 0.12, volume = 0.08, color = "white" } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const sampleRate = audioCtx.sampleRate;
      const bufferSize = Math.floor(sampleRate * duration);
      const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // white noise shaped by exponential decay
        data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * (i / bufferSize));
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      const gain = audioCtx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(masterGain);
      src.start();
      src.onended = () => {
        try {
          src.disconnect();
          gain.disconnect();
        } catch (e) {
          /* ignore */
        }
      };
    } catch (e) {
      console.warn("playNoiseBurst error:", e);
    }
  }

  // Gentle beep helper with envelope
  function playBeep({ freq = 440, duration = 0.14, type = "sine", volume = 0.09, pan = 0 } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      // Envelope
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      if (panner) {
        panner.pan.value = pan;
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(masterGain);
      } else {
        osc.connect(gain);
        gain.connect(masterGain);
      }
      osc.start(now);
      osc.stop(now + duration + 0.02);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
          if (panner) panner.disconnect();
        } catch (e) {
          /* ignore */
        }
      };
    } catch (e) {
      console.warn("playBeep error:", e);
    }
  }

  // Improved sound effects: pleasant, soft, not overstimulating
  function playCorrectSound() {
    if (!audioEnabled || !audioCtx) return;
    resumeAudioIfNeeded();
    try {
      const now = audioCtx.currentTime;
      // gentle chord: three sine oscillators slightly detuned
      const freqs = [520, 656, 780].map((f, i) => f * (1 + (i - 1) * 0.002));
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0;
      gain.connect(masterGain);
      freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = i === 2 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(f, now);
        const g2 = audioCtx.createGain();
        g2.gain.value = 0.6;
        osc.connect(g2);
        g2.connect(gain);
        osc.start(now);
        osc.stop(now + 0.26);
        osc.onended = () => {
          try {
            osc.disconnect();
            g2.disconnect();
          } catch (e) {
            /* ignore */
          }
        };
      });
      // Envelope
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      // small upward noise sparkle
      setTimeout(() => playNoiseBurst({ duration: 0.06, volume: 0.03 }), 40);
    } catch (e) {
      console.warn("playCorrectSound error:", e);
    }
  }

  function playIncorrectSound() {
    if (!audioEnabled || !audioCtx) return;
    resumeAudioIfNeeded();
    try {
      const now = audioCtx.currentTime;
      // low thud: short detuned square
      playBeep({ freq: 120, duration: 0.18, type: "square", volume: 0.08, pan: -0.2 });
      // soft click
      setTimeout(() => {
        playBeep({ freq: 640, duration: 0.08, type: "sine", volume: 0.05, pan: 0.3 });
      }, 100);
      // small dull noise
      setTimeout(() => playNoiseBurst({ duration: 0.12, volume: 0.03 }), 0);
    } catch (e) {
      console.warn("playIncorrectSound error:", e);
    }
  }

  // Game state (mechanics intact)
  let state = "start"; // start, playing, win, gameover
  let score = 0;
  let wrongCount = 0;
  let question = null;
  let options = [];
  let selectedOption = -1; // index 0-3 for keyboard selection
  let hoverOption = -1;
  let questionStartTime = 0;
  let droneX = WIDTH / 2;
  let droneY = HEIGHT / 2 - 40;
  let lastTime = performance.now();

  // Visual-only state
  const particles = []; // for drone trail and confetti
  const confetti = [];
  let confettiTime = 0;

  // Layout positions
  const scoreBox = { x: UI_PADDING, y: UI_PADDING, w: 0, h: 40 };
  const livesBox = { x: 0, y: UI_PADDING, w: 0, h: 40 };
  const questionBox = { x: 0, y: 70, w: WIDTH, h: 60 };
  const optionsArea = { x: 60, y: 150, w: WIDTH - 120, h: 260 };
  const instructionsBox = { x: 0, y: HEIGHT - 80, w: WIDTH, h: 70 };
  const optionBoxes = [];

  // Generate math question (unchanged)
  function generateQuestion() {
    const type = Math.random() < 0.6 ? "add" : "sub";
    let a, b, correct;
    if (type === "add") {
      a = randInt(1, 12);
      b = randInt(1, 12);
      correct = a + b;
    } else {
      a = randInt(2, 18);
      b = randInt(1, a - 1);
      correct = a - b;
    }
    const distractors = new Set();
    while (distractors.size < 3) {
      const delta = pick([-3, -2, -1, 1, 2, 3, 4]);
      const val = correct + delta;
      if (val >= 0 && val <= 30 && val !== correct) distractors.add(val);
    }
    const opts = [...distractors, correct];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    question = { a, b, type, correct };
    options = opts;
    selectedOption = -1;
    hoverOption = -1;
    questionStartTime = performance.now();
  }

  // Drawing helpers
  function safeFillText(text, x, y, font, color = "#000", align = "left", baseline = "middle") {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(text, x, y);
  }

  function drawRoundedRect(x, y, w, h, r = 8, fillStyle = "#fff", strokeStyle = null) {
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

  // Drone drawing with subtle glow and particle trail (visual only)
  function drawDrone(t) {
    const bob = Math.sin(t / 350) * 6;
    const x = droneX;
    const y = droneY + bob;
    // trail particle spawn
    if (state === "playing" && Math.random() < 0.12) {
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + 26,
        vx: (Math.random() - 0.5) * 0.3,
        vy: 0.5 + Math.random() * 0.4,
        life: 0.6 + Math.random() * 0.6,
        size: 2 + Math.random() * 3,
        hue: 190 + Math.random() * 20
      });
    }

    // shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y + 42, 46, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(9, 30, 63, 0.10)";
    ctx.fill();

    ctx.translate(x, y);
    // subtle outer glow
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 80);
    g.addColorStop(0, "rgba(112,193,179,0.08)");
    g.addColorStop(1, "rgba(112,193,179,0)");
    ctx.fillStyle = g;
    ctx.fill();

    // body
    drawRoundedRect(-48, -20, 96, 44, 16, "#EAFBFF", "rgba(6, 82, 115, 0.12)");
    // window with glossy shine
    ctx.beginPath();
    ctx.ellipse(0, -2, 28, 18, 0, 0, Math.PI * 2);
    const winG = ctx.createLinearGradient(-10, -10, 10, 10);
    winG.addColorStop(0, "#BEEBFF");
    winG.addColorStop(0.6, "#D9F6FF");
    winG.addColorStop(1, "#FFFFFF");
    ctx.fillStyle = winG;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.stroke();

    // propeller arms with subtle rotation
    const armAngle = Math.sin(t / 160) * 0.14;
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * 56, -8);
      ctx.rotate(armAngle * i);
      // arm
      ctx.fillStyle = "#DDF7F4";
      ctx.fillRect(-4, -4, 40, 8);
      // rotating blade - animated as blurred ellipse
      ctx.beginPath();
      ctx.ellipse(26, 0, 16, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(15, 47, 64, 0.07)";
      ctx.fill();
      ctx.restore();
    }

    // antenna with warm bulb
    ctx.beginPath();
    ctx.moveTo(22, -22);
    ctx.quadraticCurveTo(32, -34, 12, -44);
    ctx.strokeStyle = "rgba(9,30,63,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, -44, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#FFD48A";
    ctx.fill();
    ctx.restore();
  }

  // Draw calming sky background with parallax clouds and soft sun
  function drawBackground(t) {
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#F7FEFF");
    g.addColorStop(0.6, "#E6FBFF");
    g.addColorStop(1, "#EAF9F6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft sun
    ctx.beginPath();
    ctx.arc(WIDTH - 100, 80, 48, 0, Math.PI * 2);
    const sg = ctx.createRadialGradient(WIDTH - 100, 80, 4, WIDTH - 100, 80, 60);
    sg.addColorStop(0, "rgba(255, 250, 240, 0.9)");
    sg.addColorStop(1, "rgba(255, 250, 240, 0.0)");
    ctx.fillStyle = sg;
    ctx.fill();

    // rolling hills with subtle movement
    ctx.fillStyle = "#E8FBF1";
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    ctx.quadraticCurveTo(WIDTH * 0.2, HEIGHT - 120 + Math.sin(t / 1100) * 6, WIDTH * 0.5, HEIGHT - 68);
    ctx.quadraticCurveTo(WIDTH * 0.75, HEIGHT - 36 + Math.cos(t / 950) * 6, WIDTH, HEIGHT - 86);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fill();

    // moving clouds (parallax)
    for (let i = 0; i < 6; i++) {
      const speed = 0.03 + (i % 3) * 0.01;
      const cx = (i * 160 + (t * speed)) % (WIDTH + 200) - 100;
      const cy = 50 + (i % 3) * 26 + Math.sin((t / 700) + i) * 6;
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.ellipse(cx, cy, 38, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 28, cy + 8, 26, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 30, cy + 6, 30, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw UI layout ensuring no overlapping using measureText
  function drawUI(t) {
    ctx.save();
    // Score box top-left
    ctx.font = IMPORTANT_FONT;
    const scoreText = `Score: ${score}/${REQUIRED_CORRECT}`;
    const scoreW = ctx.measureText(scoreText).width + UI_PADDING * 3;
    scoreBox.w = clamp(scoreW, 90, 220);
    scoreBox.h = 44;
    drawRoundedRect(scoreBox.x, scoreBox.y, scoreBox.w, scoreBox.h, 10, "rgba(255,255,255,0.95)", "rgba(6,82,115,0.12)");
    safeFillText(scoreText, scoreBox.x + 14, scoreBox.y + scoreBox.h / 2, IMPORTANT_FONT, "#06425B");

    // Lives top-right with icon hearts
    ctx.font = IMPORTANT_FONT;
    const livesText = `Lives: ${MAX_WRONG - wrongCount}`;
    const livesW = ctx.measureText(livesText).width + UI_PADDING * 3 + 28;
    livesBox.w = clamp(livesW, 100, 220);
    livesBox.h = 44;
    livesBox.x = WIDTH - livesBox.w - UI_PADDING;
    drawRoundedRect(livesBox.x, livesBox.y, livesBox.w, livesBox.h, 10, "rgba(255,255,255,0.98)", "rgba(196, 61, 61, 0.12)");
    safeFillText(livesText, livesBox.x + 14, livesBox.y + livesBox.h / 2, IMPORTANT_FONT, "#831E1E");
    // hearts
    const hearts = MAX_WRONG - wrongCount;
    for (let i = 0; i < MAX_WRONG; i++) {
      const hx = livesBox.x + livesBox.w - 16 - i * 18;
      const hy = livesBox.y + livesBox.h / 2;
      ctx.beginPath();
      const filled = i < hearts;
      const heartColor = filled ? "#FF6B6B" : "#FFECEC";
      ctx.moveTo(hx, hy);
      ctx.fillStyle = heartColor;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.arc(hx - 4, hy - 4, 6, 0, Math.PI * 2);
      ctx.arc(hx + 4, hy - 4, 6, 0, Math.PI * 2);
      ctx.moveTo(hx - 8, hy);
      ctx.quadraticCurveTo(hx, hy + 10, hx + 8, hy);
      ctx.closePath();
      ctx.fill();
    }

    // Progress bar under top area
    const progX = scoreBox.x + scoreBox.w + UI_PADDING;
    const progW = livesBox.x - progX - UI_PADDING;
    if (progW > 60) {
      const progY = scoreBox.y + (scoreBox.h - 18) / 2;
      drawRoundedRect(progX, progY, progW, 18, 10, "rgba(255,255,255,0.8)", "rgba(11,94,111,0.08)");
      const fraction = score / REQUIRED_CORRECT;
      drawRoundedRect(progX + 2, progY + 2, Math.max(6, (progW - 4) * fraction), 14, 8, "#70C1B3", null);
      safeFillText(`Progress`, progX + 8, progY + 9, BODY_FONT, "#063D35", "left", "middle");
    }

    // Question in center top
    ctx.font = TITLE_FONT;
    const qText = question ? (question.type === "add" ? `${question.a} + ${question.b} = ?` : `${question.a} - ${question.b} = ?`) : "Ready?";
    const qW = ctx.measureText(qText).width;
    const qBoxW = qW + 40;
    questionBox.x = (WIDTH - qBoxW) / 2;
    questionBox.w = qBoxW;
    questionBox.h = 60;
    // Slight tilted card
    ctx.save();
    drawRoundedRect(questionBox.x, questionBox.y, questionBox.w, questionBox.h, 12, "rgba(255,255,255,0.96)", "rgba(4,77,92,0.12)");
    safeFillText(qText, questionBox.x + questionBox.w / 2, questionBox.y + questionBox.h / 2, TITLE_FONT, "#053649", "center");
    ctx.restore();

    // Options background
    drawRoundedRect(optionsArea.x - 12, optionsArea.y - 12, optionsArea.w + 24, optionsArea.h + 24, 16, "rgba(255,255,255,0.96)", "rgba(28,128,116,0.06)");

    // Draw options as landing pads in grid 2x2 with subtle lighting and pulsing
    optionBoxes.length = 0;
    const rows = 2;
    const cols = 2;
    const padW = (optionsArea.w - (cols - 1) * 20) / cols;
    const padH = (optionsArea.h - (rows - 1) * 20) / rows;
    ctx.font = OPTION_FONT;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const ox = optionsArea.x + c * (padW + 20);
        const oy = optionsArea.y + r * (padH + 20);
        const bx = ox;
        const by = oy;
        const bw = padW;
        const bh = padH;
        // selection glow/pulse
        const pulse = Math.sin(performance.now() / 300 + idx) * 0.5 + 0.5;
        let fillColor = "#F7FFF9";
        let strokeColor = "rgba(7,80,60,0.12)";
        if (idx === hoverOption) {
          fillColor = `rgba(255,248,230,${0.98 - 0.12 * pulse})`;
          strokeColor = `rgba(233,168,0,${0.9})`;
        } else if (idx === selectedOption) {
          fillColor = "#EAF6FF";
          strokeColor = "rgba(4,80,120,0.18)";
        }
        drawRoundedRect(bx, by, bw, bh, 14, fillColor, strokeColor);

        // landing lights: three small LEDs at bottom
        const ledBaseX = bx + bw / 2 - 18;
        for (let li = 0; li < 3; li++) {
          const lx = ledBaseX + li * 18;
          const ly = by + bh - 18;
          const active = idx === hoverOption || idx === selectedOption;
          const ledHue = active ? 170 : 190;
          ctx.beginPath();
          ctx.arc(lx, ly, 4, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${ledHue}, ${active ? "72%" : "30%"}, ${active ? "55%" : "70%"})`;
          ctx.fill();
          // slight glow for active
          if (active) {
            ctx.beginPath();
            ctx.arc(lx, ly, 8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(112,193,179,${0.08 + pulse * 0.04})`;
            ctx.fill();
          }
        }

        // Labeling option with number for keyboard (1-4)
        const label = `${idx + 1}. ${options[idx] !== undefined ? options[idx] : ""}`;
        let fontToUse = OPTION_FONT;
        ctx.font = fontToUse;
        let textWidth = ctx.measureText(label).width;
        if (textWidth > bw - 24) {
          fontToUse = "18px Inter, sans-serif";
          ctx.font = fontToUse;
          textWidth = ctx.measureText(label).width;
        }

        // Number badge
        const badgeW = 36;
        const badgeX = bx + 14;
        const badgeY = by + 12;
        drawRoundedRect(badgeX, badgeY, badgeW, 30, 8, "#0F6B63", "rgba(6,82,115,0.12)");
        safeFillText(`${idx + 1}`, badgeX + badgeW / 2, badgeY + 15, "18px Inter, sans-serif", "#FFF", "center", "middle");

        // Option text
        safeFillText(label, badgeX + badgeW + 12, by + bh / 2, fontToUse, "#073B4C", "left");

        // subtle pad decoration circle
        ctx.beginPath();
        ctx.arc(bx + bw - 24, by + 28, 14, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(7,80,96,0.03)";
        ctx.fill();

        optionBoxes.push({ x: bx, y: by, w: bw, h: bh });
      }
    }

    // Audio indicator bottom-left
    const audioText = audioEnabled ? "Audio: ON (M)" : "Audio: OFF (M)";
    ctx.font = BODY_FONT;
    const atW = ctx.measureText(audioText).width + 20;
    const aBoxX = UI_PADDING;
    const aBoxY = HEIGHT - 120;
    drawRoundedRect(aBoxX, aBoxY, atW, 36, 10, "rgba(255,255,255,0.95)", "rgba(6,6,6,0.06)");
    safeFillText(audioText, aBoxX + 12, aBoxY + 18, BODY_FONT, "#333");

    // Instructions bottom-center
    ctx.font = BODY_FONT;
    const instrLines = [
      "Controls: Click an option or press 1-4. Use ← → to shift selection, Enter or Space to confirm.",
      "Goal: Answer 10 questions correctly. You can make 3 mistakes. Press R to restart."
    ];
    const instrPadding = 12;
    let maxW = 0;
    instrLines.forEach(line => {
      const w = ctx.measureText(line).width;
      if (w > maxW) maxW = w;
    });
    const instrW = maxW + instrPadding * 2;
    instructionsBox.w = instrW;
    instructionsBox.x = (WIDTH - instrW) / 2;
    drawRoundedRect(instructionsBox.x, instructionsBox.y, instructionsBox.w, instructionsBox.h, 12, "rgba(255,255,255,0.95)", "rgba(3,60,80,0.06)");
    ctx.fillStyle = "#063A44";
    for (let i = 0; i < instrLines.length; i++) {
      safeFillText(instrLines[i], instructionsBox.x + instructionsBox.w / 2, instructionsBox.y + 14 + i * 20, BODY_FONT, "#0B4A52", "center", "top");
    }

    ctx.restore();
  }

  // Overlays
  function drawStartScreen() {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawRoundedRect(72, 72, WIDTH - 144, HEIGHT - 144, 14, "rgba(255,255,255,0.98)", "rgba(8,68,88,0.08)");
    safeFillText("Drone Math Adventure!", WIDTH / 2, 120, TITLE_FONT, "#073B4C", "center");
    ctx.font = IMPORTANT_FONT;
    const desc = "Fly your friendly drone to pick the correct answers to math puzzles.";
    safeFillText(desc, WIDTH / 2, 162, BODY_FONT, "#0B5E6F", "center");
    // start button with subtle pulse
    const btnW = 220;
    const btnH = 48;
    const bx = WIDTH / 2 - btnW / 2;
    const by = HEIGHT / 2 - 28;
    const pulse = Math.sin(performance.now() / 450) * 0.06 + 1;
    drawRoundedRect(bx, by, btnW, btnH, 12, "#70C1B3", "rgba(13,100,86,0.12)");
    ctx.save();
    ctx.globalAlpha = 0.95;
    safeFillText("Start Game (Enter)", bx + btnW / 2, by + btnH / 2, IMPORTANT_FONT, "#052B2A", "center");
    ctx.restore();
    ctx.font = BODY_FONT;
    safeFillText("Hint: Use 1-4 keys for quick answers. Press M to toggle audio.", WIDTH / 2, by + btnH + 36, BODY_FONT, "#083D77", "center");
  }

  function drawWinScreen() {
    // soft bright overlay
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    safeFillText("You did it!", WIDTH / 2, 110, TITLE_FONT, "#0B5E6F", "center");
    safeFillText(`Correct answers: ${score}`, WIDTH / 2, 150, IMPORTANT_FONT, "#0B5E6F", "center");
    // confetti animations
    confetti.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    // victory drone bigger
    ctx.save();
    ctx.translate(WIDTH / 2, 250);
    drawDrone(performance.now());
    ctx.restore();
    // Play again button
    const btnW = 200;
    const btnH = 46;
    const bx = WIDTH / 2 - btnW / 2;
    const by = HEIGHT - 120;
    drawRoundedRect(bx, by, btnW, btnH, 10, "#FDE68A", "#D97706");
    safeFillText("Play Again (R)", bx + btnW / 2, by + btnH / 2, IMPORTANT_FONT, "#5B3E02", "center");
  }

  function drawGameOverScreen() {
    ctx.fillStyle = "rgba(8,12,20,0.62)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawRoundedRect(80, 80, WIDTH - 160, HEIGHT - 160, 14, "#FFF5F5", "#8B0000");
    safeFillText("Game Over", WIDTH / 2, 120, TITLE_FONT, "#8B0000", "center");
    safeFillText(`You answered ${score} correctly.`, WIDTH / 2, 160, IMPORTANT_FONT, "#641E16", "center");
    // broken drone with smoke particles
    ctx.save();
    ctx.translate(WIDTH / 2, 260);
    ctx.rotate(-0.04);
    drawRoundedRect(-60, -20, 120, 40, 10, "#FFECEC", "#C53030");
    ctx.beginPath();
    ctx.arc(10, -2, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFBF0";
    ctx.fill();
    ctx.strokeStyle = "#C53030";
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(18, 2);
    ctx.moveTo(6, -12);
    ctx.lineTo(6, 8);
    ctx.stroke();
    ctx.restore();

    // smoke puffs
    for (let i = 0; i < 6; i++) {
      const sx = WIDTH / 2 + Math.sin(i) * 12 + (i - 3) * 6;
      const sy = 220 - i * 6;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 22 - i * 2, 12 - i * 1.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(80, 80, 80, ${0.08 + i * 0.03})`;
      ctx.fill();
    }

    // Restart button
    const btnW = 200;
    const btnH = 46;
    const bx = WIDTH / 2 - btnW / 2;
    const by = HEIGHT - 120;
    drawRoundedRect(bx, by, btnW, btnH, 10, "#FFB4B4", "#9B1C1C");
    safeFillText("Try Again (R)", bx + btnW / 2, by + btnH / 2, IMPORTANT_FONT, "#6E0F0F", "center");
  }

  // Click/interaction handlers
  function getOptionIndexAt(x, y) {
    for (let i = 0; i < optionBoxes.length; i++) {
      const b = optionBoxes[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
    }
    return -1;
  }

  function handleClick(x, y) {
    if (state === "start") {
      const bx = WIDTH / 2 - 110;
      const by = HEIGHT / 2 - 28;
      const bw = 220;
      const bh = 48;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        startGame();
      }
    } else if (state === "playing") {
      const idx = getOptionIndexAt(x, y);
      if (idx >= 0) {
        selectedOption = idx;
        confirmSelection();
        return;
      }
      const aBoxX = UI_PADDING;
      const aBoxY = HEIGHT - 120;
      const aBoxW = ctx.measureText(audioEnabled ? "Audio: ON (M)" : "Audio: OFF (M)").width + 20;
      const aBoxH = 36;
      if (x >= aBoxX && x <= aBoxX + aBoxW && y >= aBoxY && y <= aBoxY + aBoxH) {
        toggleAudio();
        return;
      }
    } else if (state === "win" || state === "gameover") {
      const bx = WIDTH / 2 - 100;
      const by = HEIGHT - 120;
      const bw = 200;
      const bh = 46;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        restartGame();
      }
    }
  }

  // Confirm selection (unchanged logic)
  function confirmSelection() {
    if (state !== "playing") return;
    if (selectedOption < 0 || selectedOption >= options.length) return;
    const chosen = options[selectedOption];
    if (chosen === question.correct) {
      score++;
      playCorrectSound();
      // visual: small pop and confetti spawn
      spawnConfetti();
      droneY -= 10;
      if (score >= REQUIRED_CORRECT) {
        state = "win";
        confettiTime = performance.now();
      } else {
        setTimeout(() => {
          generateQuestion();
        }, 600);
      }
    } else {
      wrongCount++;
      playIncorrectSound();
      //shake
      droneX += (Math.random() - 0.5) * 16;
      if (wrongCount >= MAX_WRONG) {
        state = "gameover";
      } else {
        setTimeout(() => {
          generateQuestion();
        }, 600);
      }
    }
  }

  // Keyboard handling
  canvas.addEventListener("keydown", (e) => {
    resumeAudioIfNeeded();
    if (e.key === "r" || e.key === "R") {
      restartGame();
      e.preventDefault();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      toggleAudio();
      e.preventDefault();
      return;
    }
    if (state === "start") {
      if (e.key === "Enter" || e.key === " ") {
        startGame();
        e.preventDefault();
      }
      return;
    }
    if (state === "playing") {
      if (e.key >= "1" && e.key <= "4") {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < options.length) {
          selectedOption = idx;
          confirmSelection();
        }
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (selectedOption === -1) selectedOption = 0;
        else selectedOption = (selectedOption + options.length - 1) % options.length;
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (selectedOption === -1) selectedOption = 0;
        else selectedOption = (selectedOption + 1) % options.length;
        e.preventDefault();
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        if (selectedOption >= 0) confirmSelection();
        e.preventDefault();
        return;
      }
    }
    if (state === "win" || state === "gameover") {
      if (e.key === "r" || e.key === "R" || e.key === "Enter") {
        restartGame();
        e.preventDefault();
      }
    }
  });

  // Mouse events
  canvas.addEventListener("mousedown", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
    handleClick(x, y);
  });

  canvas.addEventListener("mousemove", (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
    const idx = getOptionIndexAt(x, y);
    if (idx !== hoverOption) {
      hoverOption = idx;
    }
  });

  // Toggle audio safely
  function toggleAudio() {
    if (!audioCtx) {
      audioEnabled = false;
      return;
    }
    audioEnabled = !audioEnabled;
    if (!audioEnabled) {
      try {
        masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
      } catch (e) {
        /* ignore */
      }
    } else {
      try {
        masterGain.gain.setValueAtTime(0.6, audioCtx.currentTime);
        resumeAudioIfNeeded();
      } catch (e) {
        /* ignore */
      }
    }
  }

  // Start and restart functions (game logic unchanged)
  function startGame() {
    score = 0;
    wrongCount = 0;
    state = "playing";
    generateQuestion();
    droneX = WIDTH / 2;
    droneY = HEIGHT / 2 - 40;
    lastTime = performance.now();
    resumeAudioIfNeeded();
  }

  function restartGame() {
    if (audioCtx && audioCtx.state === "suspended") resumeAudioIfNeeded();
    score = 0;
    wrongCount = 0;
    selectedOption = -1;
    hoverOption = -1;
    state = "start";
    particles.length = 0;
    confetti.length = 0;
  }

  // Confetti spawn
  function spawnConfetti() {
    for (let i = 0; i < 12; i++) {
      confetti.push({
        x: droneX + (Math.random() - 0.5) * 40,
        y: droneY,
        vx: (Math.random() - 0.5) * 3,
        vy: -2 - Math.random() * 2,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.2,
        size: 6 + Math.random() * 6,
        color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 55%)`,
        life: 1.6 + Math.random() * 1.2
      });
    }
  }

  // Particle update
  function updateParticles(dt) {
    // dt in ms
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.life -= dt / 1000;
      p.size *= 0.995;
      if (p.life <= 0 || p.size < 0.6) {
        particles.splice(i, 1);
      }
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.rot += p.vrot;
      p.life -= 0.016;
      if (p.life <= 0 || p.y > HEIGHT + 40) confetti.splice(i, 1);
    }
  }

  // Main loop
  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;

    // Update visuals: drone drifting towards hovered option
    if (state === "playing") {
      if (hoverOption >= 0 && optionBoxes[hoverOption]) {
        const b = optionBoxes[hoverOption];
        const targetX = b.x + b.w / 2;
        const targetY = b.y - 24;
        droneX += (targetX - droneX) * 0.06;
        droneY += (targetY - droneY) * 0.04;
      } else {
        droneX += (WIDTH / 2 - droneX) * 0.02;
        droneY += ((HEIGHT / 2 - 40) - droneY) * 0.02;
      }
    } else {
      droneX += (WIDTH / 2 - droneX) * 0.05;
      droneY += ((HEIGHT / 2 - 40) - droneY) * 0.05;
    }

    updateParticles(dt);

    // Draw frame
    drawBackground(now);
    drawUI(now);

    // draw particles behind drone (trail)
    ctx.save();
    particles.forEach(p => {
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 70%, 60%, ${clamp(p.life, 0, 1)})`;
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // draw drone on top
    drawDrone(now);

    // draw confetti over everything if any
    confetti.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    // State overlays
    if (state === "start") {
      drawStartScreen();
    } else if (state === "win") {
      drawWinScreen();
    } else if (state === "gameover") {
      drawGameOverScreen();
    }

    // Visual cues for audio state: subtle border
    ctx.save();
    if (!audioEnabled) {
      ctx.strokeStyle = "#FF6B6B";
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, WIDTH - 12, HEIGHT - 12);
      ctx.font = BODY_FONT;
      safeFillText("Audio disabled", WIDTH - 110, HEIGHT - 18, BODY_FONT, "#FF6B6B");
    }
    ctx.restore();

    requestAnimationFrame(loop);
  }

  // Start initial state
  restartGame();
  requestAnimationFrame(loop);

  // Expose small debug API (non-essential)
  window.__droneMathGame = {
    restartGame,
    startGame,
    toggleAudio,
    getState: () => ({ state, score, wrongCount })
  };
})();