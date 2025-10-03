(function () {
  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const ROUNDS = 6;
  const MAX_TRIES_BEFORE_HINT = 3;

  // Find container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container element with ID 'game-of-the-day-stage' not found.");
    return;
  }

  // Clear container and set styles
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.width = WIDTH + "px";
  container.style.height = HEIGHT + "px";
  container.style.userSelect = "none";
  container.style.outline = "none";
  container.style.background = "#fff";

  // Accessible live region for screen readers (off-screen)
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("role", "status");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  container.appendChild(liveRegion);

  // Create canvas sized exactly to game area
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // make focusable
  canvas.style.display = "block";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false });

  // Focus the canvas for keyboard events
  canvas.focus();

  // Audio setup with error handling
  let audioEnabled = true;
  let audioContext = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio API not supported");
    audioContext = new AC();
    // Some browsers suspend audio until user interaction
    if (audioContext.state === "suspended") {
      audioEnabled = false;
    }
  } catch (e) {
    console.warn("Audio unavailable:", e && e.message ? e.message : e);
    audioEnabled = false;
    audioContext = null;
  }

  // Audio nodes global references
  let masterGain = null;
  let padGain = null;
  let padOsc1 = null;
  let padOsc2 = null;
  let padFilter = null;
  let pulseGain = null;
  let delayNode = null;
  let noiseBufferSource = null;

  // Initialize audio nodes: ambient pad, soft pulse, small delay for warmth
  function initAudioNodes() {
    if (!audioContext) return;
    try {
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.8;
      masterGain.connect(audioContext.destination);

      // Warm delay to give sounds a pleasant tail (light feedback)
      delayNode = audioContext.createDelay();
      delayNode.delayTime.value = 0.12;
      const feedback = audioContext.createGain();
      feedback.gain.value = 0.14;
      delayNode.connect(feedback);
      feedback.connect(delayNode);
      const delayBlend = audioContext.createGain();
      delayBlend.gain.value = 0.12;
      delayNode.connect(delayBlend);
      delayBlend.connect(masterGain);

      // Ambient pad: two detuned oscillators through a mellow filter
      padGain = audioContext.createGain();
      padGain.gain.value = 0.06;
      padGain.connect(masterGain);

      padFilter = audioContext.createBiquadFilter();
      padFilter.type = "lowpass";
      padFilter.frequency.value = 900;
      padFilter.Q.value = 0.7;
      padFilter.connect(padGain);

      padOsc1 = audioContext.createOscillator();
      padOsc1.type = "sine";
      padOsc1.frequency.value = 110;
      padOsc1.connect(padFilter);

      padOsc2 = audioContext.createOscillator();
      padOsc2.type = "sine";
      padOsc2.frequency.value = 110 * 1.005; // slightly detuned

      // small LFO-driven amplitude modulation to keep pad moving
      const padLFO = audioContext.createOscillator();
      padLFO.type = "sine";
      padLFO.frequency.value = 0.07;
      const padLfoGain = audioContext.createGain();
      padLfoGain.gain.value = 0.03;
      padLFO.connect(padLfoGain);
      padLfoGain.connect(padGain.gain);

      padOsc2.connect(padFilter);

      // gentle rhythmic pulse (very soft) for subtle engagement
      pulseGain = audioContext.createGain();
      pulseGain.gain.value = 0.0; // usually silent until triggered
      pulseGain.connect(masterGain);

      // create a tiny noise layer (a short buffer of gentle noise looped) for texture
      try {
        const bufferSize = audioContext.sampleRate * 1;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.002; // very low amplitude
        }
        noiseBufferSource = audioContext.createBufferSource();
        noiseBufferSource.buffer = buffer;
        noiseBufferSource.loop = true;
        const noiseFilter = audioContext.createBiquadFilter();
        noiseFilter.type = "lowpass";
        noiseFilter.frequency.value = 1400;
        const noiseGain = audioContext.createGain();
        noiseGain.gain.value = 0.01;
        noiseBufferSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noiseBufferSource.start();
      } catch (err) {
        // not critical
        console.warn("Noise layer unavailable:", err);
      }

      // Start oscillators
      padOsc1.start();
      padOsc2.start();
      padLFO.start();

      // Slight mod of filter cut for liveliness
      try {
        const lfo2 = audioContext.createOscillator();
        lfo2.type = "sine";
        lfo2.frequency.value = 0.06;
        const lfo2Gain = audioContext.createGain();
        lfo2Gain.gain.value = 150; // modulation depth for frequency
        lfo2.connect(lfo2Gain);
        lfo2Gain.connect(padFilter.frequency);
        lfo2.start();
      } catch (err) {
        // ignore extra LFO errors
      }
    } catch (err) {
      console.warn("Error initializing audio nodes:", err);
    }
  }

  // Helper to play a tone with envelope, connected optionally to masterGain
  function playTone({ freq = 440, duration = 0.18, type = "sine", volume = 0.12, attack = 0.01, detune = 0 } = {}) {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      osc.type = type;
      osc.frequency.value = freq;
      if (detune) osc.detune.value = detune;

      filter.type = "lowpass";
      filter.frequency.value = Math.max(600, freq * 2);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      // connect through delay for warmth
      gain.connect(masterGain || audioContext.destination);
      if (delayNode) {
        gain.connect(delayNode);
      }

      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (err) {
      console.warn("playTone error:", err);
    }
  }

  // Soft click used for selection - quick, non-jarring
  function playClick() {
    if (!audioContext) return;
    try {
      // short high click with a soft bandpass
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1200;

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      const bp = audioContext.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;

      osc.connect(bp);
      bp.connect(gain);
      gain.connect(masterGain || audioContext.destination);
      if (delayNode) gain.connect(delayNode);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (err) {
      console.warn("playClick error:", err);
    }
  }

  // Correct sound: gentle arpeggio chord with two oscillators per note
  function playCorrectSound() {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const base = 440;
      const semis = [0, 4, 7]; // major triad
      semis.forEach((s, idx) => {
        const t = now + idx * 0.11;
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();

        osc1.type = "sine";
        osc2.type = "triangle";

        const freq = base * Math.pow(2, s / 12);
        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 1.002 + 1; // slight detune for warmth

        filter.type = "lowpass";
        filter.frequency.value = 2400;

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain || audioContext.destination);
        if (delayNode) gain.connect(delayNode);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.38);
        osc2.stop(t + 0.38);
      });
    } catch (err) {
      console.warn("playCorrectSound error:", err);
    }
  }

  // Incorrect sound: low soft buzz + descending chirp
  function playIncorrectSound() {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      // low thud
      playTone({ freq: 160, duration: 0.18, type: "sawtooth", volume: 0.09, attack: 0.004 });
      // short descending chirp
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.28);

      filter.type = "lowpass";
      filter.frequency.value = 1200;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain || audioContext.destination);
      if (delayNode) gain.connect(delayNode);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (err) {
      console.warn("playIncorrectSound error:", err);
    }
  }

  // Utility random
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Game state
  const state = {
    round: 0,
    score: 0,
    roundsCompleted: 0,
    current: null,
    selectedIndex: 0,
    triesThisRound: 0,
    started: false,
    audioOn: audioEnabled && audioContext && audioContext.state === "running",
    lastMessage: null,
    particles: [], // visual particles for celebrations/hints
  };

  // Generate puzzle (unchanged mechanics)
  function makePuzzle() {
    const base = randInt(1, 12);
    const add = randInt(2, 9);
    const target = base + add;
    const correct = add;
    const options = new Set([correct]);
    while (options.size < 4) {
      let candidate = correct + randInt(-4, 4);
      if (candidate < 1) candidate = Math.abs(candidate) + 1;
      if (candidate === correct) continue;
      options.add(candidate);
    }
    const arr = Array.from(options);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const idx = arr.indexOf(correct);
    return { base, target, options: arr, correctIndex: idx };
  }

  function startNewRound() {
    state.current = makePuzzle();
    state.selectedIndex = 0;
    state.triesThisRound = 0;
    state.round++;
    state.started = true;
    state.lastMessage = null;
    updateLive(
      `Round ${state.round} of ${ROUNDS}. Choose the gear to make ${state.current.base} + ? = ${state.current.target}. Use arrows and Enter, or click.`
    );
  }

  // Draw background with soft hills, sun and friendly robot character
  let startTime = performance.now();
  function drawBackground(t) {
    const time = (t - startTime) / 1000;

    // gentle vertical gradient for sky
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#f4fbff");
    g.addColorStop(0.5, "#f8f4ff");
    g.addColorStop(1, "#fffaf0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft sun/glow
    const sunX = WIDTH - 110;
    const sunY = 80;
    const sunR = 44;
    const sunRad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 120);
    sunRad.addColorStop(0, "rgba(255,220,110,0.9)");
    sunRad.addColorStop(0.4, "rgba(255,230,150,0.35)");
    sunRad.addColorStop(1, "rgba(255,240,200,0.06)");
    ctx.fillStyle = sunRad;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);

    // rolling hills (layered)
    drawHills(time);

    // soft floating specks to add depth (low opacity)
    drawSpecks(time);
  }

  function drawHills(time) {
    // multiple hill layers with parallax
    const hillColors = ["#eafaf3", "#f6f3ff", "#fff7ea"];
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      const baseY = HEIGHT - 40 - layer * 18;
      ctx.moveTo(0, HEIGHT);
      ctx.lineTo(0, baseY);
      const waveCount = 6 + layer;
      for (let i = 0; i <= waveCount; i++) {
        const px = (i / waveCount) * WIDTH;
        const py = baseY - Math.sin(time * 0.4 + i * 0.8 + layer) * (22 - layer * 6);
        ctx.quadraticCurveTo(px + 20, py, px + WIDTH / waveCount, baseY);
      }
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.closePath();
      ctx.fillStyle = hillColors[layer];
      ctx.fill();
    }

    // a subtle ground texture line
    ctx.beginPath();
    ctx.moveTo(20, HEIGHT - 70);
    for (let i = 20; i < WIDTH - 20; i += 16) {
      ctx.lineTo(i, HEIGHT - 70 + Math.sin(i * 0.03 + time) * 4);
    }
    ctx.strokeStyle = "rgba(60,80,100,0.06)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function drawSpecks(time) {
    ctx.save();
    const speckCount = 18;
    for (let i = 0; i < speckCount; i++) {
      const x = (i * 93 + time * 12 * (i % 2 ? 1 : -1)) % WIDTH;
      const y = 60 + (i * 37) % 120 + Math.sin(time * 0.6 + i) * 8;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${0.06 + (i % 3) * 0.02})`;
      ctx.arc(x, y, 1.6 + (i % 3) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw a gear with teeth, number in center (kept but visually enhanced)
  function drawGear(x, y, radius, teeth, color, number, highlight = false, wobble = 0, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wobble * 0.12); // increase subtle rotation
    ctx.scale(scale, scale);

    // gear teeth path - smoother approach
    const innerR = radius * 0.7;
    const outerR = radius;
    ctx.beginPath();
    const toothRatio = 0.45;
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const next = ((i + 0.5) / teeth) * Math.PI * 2;
      const mid = angle + (next - angle) * toothRatio;
      const xm = Math.cos(mid) * outerR;
      const ym = Math.sin(mid) * outerR;
      const xi = Math.cos(angle) * innerR;
      const yi = Math.sin(angle) * innerR;
      if (i === 0) ctx.moveTo(xi, yi);
      ctx.lineTo(xm, ym);
      ctx.lineTo(Math.cos(next) * innerR, Math.sin(next) * innerR);
    }
    ctx.closePath();

    // gradient fill for volume
    const grad = ctx.createLinearGradient(-outerR, -outerR, outerR, outerR);
    grad.addColorStop(0, vibrant(color, -10));
    grad.addColorStop(1, vibrant(color, 8));
    ctx.fillStyle = grad;
    ctx.shadowColor = "rgba(0,0,0,0.16)";
    ctx.shadowBlur = highlight ? 18 : 8;
    ctx.fill();

    // center circle
    ctx.beginPath();
    ctx.arc(0, 0, innerR * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "#fffefc";
    ctx.shadowBlur = 0;
    ctx.fill();

    // number text
    ctx.fillStyle = "#1e2a2f";
    ctx.font = `bold ${Math.max(16, radius * 0.5)}px "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), 0, 0);

    // highlight ring
    if (highlight) {
      ctx.beginPath();
      ctx.arc(0, 0, outerR + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(50,140,255,0.34)";
      ctx.lineWidth = 6;
      ctx.stroke();

      // soft glow
      ctx.beginPath();
      ctx.arc(0, 0, outerR + 18, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(50,140,255,0.09)";
      ctx.lineWidth = 10;
      ctx.stroke();
    }

    ctx.restore();
  }

  // small utility to slightly alter color for gradients
  function vibrant(hex, adjust = 0) {
    // hex like #ffd7b5, convert to rgb and adjust brightness
    const c = hex.replace("#", "");
    const num = parseInt(c, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    const factor = 1 + adjust / 100;
    r = Math.min(255, Math.max(0, Math.round(r * factor)));
    g = Math.min(255, Math.max(0, Math.round(g * factor)));
    b = Math.min(255, Math.max(0, Math.round(b * factor)));
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Draw machine visualization and friendly robot character
  function drawMachine(puzzle, t) {
    const time = (t - startTime) / 1000;
    const machineX = 180;
    const machineY = HEIGHT / 2;

    // translucent machine plate
    ctx.save();
    ctx.fillStyle = "rgba(20,30,45,0.04)";
    roundRect(ctx, machineX - 180, machineY - 150, 360, 300, 14);
    ctx.fill();
    ctx.restore();

    // robot character to the left of machine - friendly assistant
    drawRobot(machineX - 190, machineY + 20, time);

    // Base gear (left)
    const baseX = machineX - 50;
    const baseY = machineY;
    drawGear(baseX, baseY, 66, 12, "#b2d8f7", puzzle.base, false, Math.sin(time) * 0.02);

    // Missing gear slot (right) - ring with animated dashed gap indicating slot
    const slotX = machineX + 70;
    const slotY = machineY;
    ctx.save();
    ctx.beginPath();
    ctx.arc(slotX, slotY, 66, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(120,120,120,0.12)";
    ctx.setLineDash([10, 12]);
    ctx.lineDashOffset = -(time * 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // piping and connectors with soft shadow
    ctx.save();
    ctx.strokeStyle = "rgba(80,100,120,0.12)";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(baseX + 66, baseY + 10);
    ctx.quadraticCurveTo(machineX + 10, machineY + 40, slotX - 52, slotY + 40);
    ctx.stroke();
    ctx.restore();

    // small plaque with instruction
    ctx.save();
    ctx.fillStyle = "#ffffffcc";
    roundRect(ctx, machineX - 80, machineY - 126, 160, 34, 8);
    ctx.fill();
    ctx.fillStyle = "#1f2a2b";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Make ${puzzle.base} + ? = ${puzzle.target}`, machineX, machineY - 102);
    ctx.restore();
  }

  // draw a simple friendly robot using canvas primitives
  function drawRobot(x, y, time) {
    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(time * 1.2) * 4;

    // body shadow
    ctx.beginPath();
    ctx.ellipse(0, 84, 52, 18, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fill();

    // body
    ctx.beginPath();
    roundRect(ctx, -36, -8 + bob, 72, 92, 12);
    ctx.fillStyle = "#eef8ff";
    ctx.fill();
    ctx.strokeStyle = "rgba(60,80,100,0.06)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // head
    roundRect(ctx, -24, -58 + bob, 48, 40, 8);
    ctx.fillStyle = "#dff6ff";
    ctx.fill();
    ctx.stroke();

    // eyes
    ctx.beginPath();
    ctx.fillStyle = "#1c2a2e";
    ctx.ellipse(-8, -38 + bob, 4, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -38 + bob, 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // smile
    ctx.beginPath();
    ctx.strokeStyle = "rgba(28,42,46,0.7)";
    ctx.lineWidth = 1.6;
    ctx.arc(0, -30 + bob, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // arm: holding a small wrench (visual flourish)
    ctx.save();
    ctx.translate(-38, -2 + bob);
    ctx.rotate(-0.25 + Math.sin(time) * 0.06);
    ctx.fillStyle = "#f6e2b3";
    roundRect(ctx, -6, -4, 36, 10, 6);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // Draw candidate gears row with selection highlight and subtle hint indicators
  function drawCandidates(options, selectedIndex, t, triesThisRound) {
    const startX = 80;
    const startY = HEIGHT - 120;
    const gap = 150;
    options.forEach((n, i) => {
      const x = startX + i * gap;
      const y = startY;
      const wobble = Math.sin((t - startTime) / 300 + i) * 0.02;
      const colorPalette = ["#ffd7b5", "#cbe7c4", "#e8d7ff", "#cfe7ff"];
      const color = colorPalette[i % colorPalette.length];
      const highlight = i === selectedIndex;
      drawGear(x, y, 48, 10, color, n, highlight, wobble);

      // label beneath
      ctx.fillStyle = "#2b2b2b";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("gear", x, y + 70);

      // subtle pulsing hint if needed
      if (triesThisRound >= MAX_TRIES_BEFORE_HINT && i === state.current.correctIndex) {
        ctx.beginPath();
        const r = 10 + Math.abs(Math.sin((t - startTime) / 450)) * 5;
        ctx.arc(x, y - 40, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(80,170,120,0.12)";
        ctx.fill();
      }
    });
  }

  // Draw top UI: score, rounds, audio indicator and instructions
  function drawUI(t) {
    // top translucent bar
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(0, 0, WIDTH, 48);
    ctx.fillStyle = "#25343a";
    ctx.font = "15px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Round ${Math.min(state.round, ROUNDS)} / ${ROUNDS}`, 12, 30);

    ctx.textAlign = "center";
    ctx.fillText(`Score: ${state.score}`, WIDTH / 2, 30);

    ctx.textAlign = "right";
    const audioLabel = state.audioOn ? "audio on" : "audio off";
    ctx.fillStyle = "#2b2b2b";
    ctx.fillText(`${audioLabel} (A)`, WIDTH - 12, 30);

    // small instruction line
    ctx.fillStyle = "#334";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("← → to choose, Enter to place. Click a gear to choose. H for help.", 12, 46);
  }

  // Render loop
  function render(t) {
    // draw background layers and wavy hills
    drawBackground(t);

    if (!state.started) {
      // welcome overlay with gentle card
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      roundRect(ctx, 60, 60, WIDTH - 120, HEIGHT - 120, 14);
      ctx.fill();

      ctx.fillStyle = "#10232a";
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Machine Math!", WIDTH / 2, 136);

      ctx.font = "16px sans-serif";
      ctx.fillStyle = "#254247";
      ctx.fillText("Welcome engineer! Fix the friendly machine by choosing the correct gear.", WIDTH / 2, 178);
      ctx.fillText("Solve simple addition: base + ? = target. Beat all rounds to win!", WIDTH / 2, 204);

      // start button
      ctx.beginPath();
      ctx.fillStyle = "#77c8ff";
      roundRect(ctx, WIDTH / 2 - 88, HEIGHT / 2 - 22, 176, 44, 12);
      ctx.fill();

      ctx.fillStyle = "#052b3a";
      ctx.font = "18px sans-serif";
      ctx.fillText("Press Enter or Click to Start", WIDTH / 2, HEIGHT / 2 + 6);

      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#334";
      ctx.fillText("Toggle audio with 'A'. Press H for help.", WIDTH / 2, HEIGHT / 2 + 46);
    } else if (state.round > ROUNDS) {
      // victory overlay
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      roundRect(ctx, 40, 60, WIDTH - 80, HEIGHT - 120, 14);
      ctx.fill();

      ctx.fillStyle = "#123035";
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("All fixed! The machine hums happily!", WIDTH / 2, 150);
      ctx.font = "18px sans-serif";
      ctx.fillText(`You scored ${state.score} / ${ROUNDS}`, WIDTH / 2, 200);

      // celebratory floating mini-gears
      for (let i = 0; i < 10; i++) {
        const x = 80 + ((t / 60 + i * 61) % (WIDTH - 160));
        const y = 260 + Math.sin(t / 220 + i) * 40;
        drawGear(
          x,
          y,
          18 + (i % 3) * 3,
          8 + (i % 3),
          ["#ffd7b5", "#cbe7c4", "#e8d7ff"][i % 3],
          i + 1,
          false,
          Math.sin(t / 200 + i) * 0.06,
          0.95
        );
      }

      ctx.font = "14px sans-serif";
      ctx.fillText("Press R to play again.", WIDTH / 2, 360);
    } else {
      // active round visuals
      drawMachine(state.current, t);
      drawCandidates(state.current.options, state.selectedIndex, t, state.triesThisRound);
      drawUI(t);

      // message rectangle for lastMessage
      if (state.lastMessage) {
        ctx.fillStyle = "rgba(255,255,255,0.96)";
        roundRect(ctx, WIDTH / 2 - 220, 30, 440, 34, 8);
        ctx.fill();
        ctx.fillStyle = "#1e1e1e";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(state.lastMessage, WIDTH / 2, 54);
      }
    }

    // particles update/draw
    updateAndDrawParticles();

    // loop
    requestAnimationFrame(render);
  }

  // update and draw particles (sparks/confetti)
  function updateAndDrawParticles() {
    const now = performance.now();
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      // physics
      p.vy += 0.18 * p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      // fade
      const alpha = Math.max(0, p.life / p.maxLife);
      // draw
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // particle shape: tiny rectangle / gear-like dot
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
      if (p.life <= 0 || p.y > HEIGHT + 60) {
        state.particles.splice(i, 1);
      }
    }
  }

  // spawn celebratory particles at x,y
  function spawnParticles(x, y, color = "#ffd7b5", count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      state.particles.push({
        x: x + (Math.random() * 12 - 6),
        y: y + (Math.random() * 12 - 6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        life: 40 + Math.floor(Math.random() * 40),
        maxLife: 40 + Math.floor(Math.random() * 40),
        size: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        color,
        gravity: 1 + Math.random() * 0.4,
      });
    }
  }

  // helper: update aria-live text
  function updateLive(text) {
    liveRegion.textContent = text;
  }

  // Attempt selection (keeps mechanics intact, but adds visuals/audio)
  function attemptSelection(index) {
    state.selectedIndex = index;
    if (audioContext && state.audioOn) playClick();
    const puzzle = state.current;
    if (!puzzle) return;
    if (index === puzzle.correctIndex) {
      // create gentle visual celebration at gear position
      const startX = 80;
      const gap = 150;
      const startY = HEIGHT - 120;
      const gx = startX + index * gap;
      const gy = startY;
      spawnParticles(gx, gy, "#cbe7c4", 18);
      spawnParticles(gx, gy, "#ffd7b5", 12);

      state.score += Math.max(1, 3 - state.triesThisRound);
      state.roundsCompleted++;
      state.lastMessage = "Nice! That gear fits!";
      updateLive(`Correct! ${puzzle.base} + ${puzzle.options[index]} = ${puzzle.target}.`);
      if (audioContext && state.audioOn) playCorrectSound();

      // preserve original flow for next round or finish
      setTimeout(() => {
        if (state.round >= ROUNDS) {
          state.round++;
          updateLive("You've fixed all parts of the machine. Hooray!");
          if (audioContext && state.audioOn) {
            // small celebratory motif
            const notes = [523.25, 659.25, 784, 1046.5];
            notes.forEach((f, i) =>
              setTimeout(
                () => playTone({ freq: f, duration: 0.14, type: "sine", volume: 0.12 }),
                i * 140
              )
            );
          }
        } else {
          startNewRound();
        }
      }, 700);
    } else {
      state.triesThisRound++;
      state.lastMessage = "Oops — try another gear.";
      updateLive(
        `Not quite. ${puzzle.base} plus ${puzzle.options[index]} equals ${puzzle.base + puzzle.options[index]}. Try again.`
      );
      if (audioContext && state.audioOn) playIncorrectSound();
      if (state.triesThisRound >= MAX_TRIES_BEFORE_HINT) {
        updateLive(`Hint: the correct gear is highlighted.`);
      }
    }
  }

  // Reset game state (mechanics preserved)
  function resetGame() {
    state.round = 0;
    state.score = 0;
    state.roundsCompleted = 0;
    state.current = null;
    state.selectedIndex = 0;
    state.triesThisRound = 0;
    state.started = false;
    state.lastMessage = null;
    state.particles.length = 0;
    state.audioOn = audioEnabled && audioContext && audioContext.state === "running";
  }

  // Mouse handling
  canvas.addEventListener("click", (e) => {
    ensureAudioStarted();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (!state.started) {
      // start game if start button clicked
      if (
        mx > WIDTH / 2 - 88 &&
        mx < WIDTH / 2 + 88 &&
        my > HEIGHT / 2 - 22 &&
        my < HEIGHT / 2 + 22
      ) {
        startNewRound();
      }
      return;
    }

    if (state.round > ROUNDS) {
      // reset on click (friendly behavior)
      resetGame();
      return;
    }

    // candidate detection
    const startX = 80;
    const gap = 150;
    const startY = HEIGHT - 120;
    for (let i = 0; i < state.current.options.length; i++) {
      const x = startX + i * gap;
      const y = startY;
      const dx = mx - x;
      const dy = my - y;
      if (dx * dx + dy * dy <= (48 + 12) * (48 + 12)) {
        attemptSelection(i);
        return;
      }
    }
  });

  // Keyboard controls
  canvas.addEventListener("keydown", (e) => {
    const key = e.key;
    if (!state.started) {
      if (key === "Enter" || key === " " || key === "Spacebar") {
        ensureAudioStarted();
        startNewRound();
        e.preventDefault();
      }
      if (key.toLowerCase() === "a") {
        toggleAudio();
      }
      if (key.toLowerCase() === "h") {
        showHelp();
      }
      return;
    }

    if (state.round > ROUNDS) {
      if (key.toLowerCase() === "r") {
        ensureAudioStarted();
        resetGame();
        startNewRound();
      }
      return;
    }

    if (key === "ArrowLeft") {
      state.selectedIndex = (state.selectedIndex - 1 + state.current.options.length) % state.current.options.length;
      if (audioContext && state.audioOn) playClick();
      updateLive(`Selected gear ${state.current.options[state.selectedIndex]}`);
      e.preventDefault();
    } else if (key === "ArrowRight") {
      state.selectedIndex = (state.selectedIndex + 1) % state.current.options.length;
      if (audioContext && state.audioOn) playClick();
      updateLive(`Selected gear ${state.current.options[state.selectedIndex]}`);
      e.preventDefault();
    } else if (key === "Enter") {
      attemptSelection(state.selectedIndex);
      e.preventDefault();
    } else if (key.toLowerCase() === "a") {
      toggleAudio();
    } else if (key.toLowerCase() === "h") {
      showHelp();
    }
  });

  // Toggle audio on/off with graceful ramp
  function toggleAudio() {
    if (!audioContext) {
      updateLive("Audio not available on this device.");
      return;
    }
    if (!state.audioOn) {
      ensureAudioStarted(true);
    } else {
      try {
        if (padGain) padGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.02);
        if (masterGain) masterGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.02);
      } catch (e) {
        console.warn("Error toggling audio:", e);
      }
      state.audioOn = false;
      updateLive("Audio muted");
    }
  }

  // Ensure audio context started and nodes initialized (first user gesture)
  function ensureAudioStarted(forceOn = false) {
    if (!audioContext) return;
    if (audioContext.state === "suspended") {
      audioContext
        .resume()
        .then(() => {
          audioEnabled = true;
          state.audioOn = true;
          initAudioNodes();
          updateLive("Audio enabled");
        })
        .catch((err) => {
          console.warn("Audio resume error:", err);
          updateLive("Audio could not be started.");
        });
    } else {
      if (!masterGain) {
        initAudioNodes();
      }
      if (forceOn) {
        try {
          masterGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
          masterGain.gain.linearRampToValueAtTime(0.8, audioContext.currentTime + 0.12);
          if (padGain) padGain.gain.setValueAtTime(0.06, audioContext.currentTime + 0.12);
          state.audioOn = true;
          audioEnabled = true;
        } catch (err) {
          console.warn("Error ramping audio:", err);
        }
      }
    }
  }

  // Help overlay (visual and aria)
  function showHelp() {
    updateLive(
      "Help: Choose the gear that completes the equation. Use left and right arrows to move and Enter to choose. Press A to toggle audio."
    );
    state.lastMessage = "Hint: Choose the gear so base + gear = target.";
    setTimeout(() => {
      state.lastMessage = null;
    }, 3000);
  }

  // Small polyfill for roundRect if not available
  function roundRect(context, x, y, w, h, r) {
    if (context.roundRect) {
      context.roundRect(x, y, w, h, r);
      return;
    }
    const minr = Math.min(w, h) * 0.2;
    r = Math.min(r, minr);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  // Safety: global error handler
  window.addEventListener("error", (ev) => {
    console.error("Game error:", ev.error || ev.message);
    updateLive("An unexpected error occurred. Please try reloading the page.");
  });

  // Keep focus on canvas when container clicked
  container.addEventListener("click", () => {
    canvas.focus();
  });

  // Initialization
  resetGame();
  requestAnimationFrame(render);
  updateLive("Ready. Focus is on the game canvas. Press Enter or click to start. Press A to toggle audio. H for help.");

  // friendly tip after load
  setTimeout(() => {
    updateLive("Tip: Use keyboard or click. Press H for help, A to toggle audio.");
  }, 2000);
})();