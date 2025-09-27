(() => {
  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const MAX_LEVELS = 5;
  const CONTAINER_ID = "game-of-the-day-stage";

  // Utility helpers
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Find container
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error("Game container not found: #" + CONTAINER_ID);
    return;
  }

  // Clear container and set up accessible instructions node
  container.innerHTML = "";
  container.style.position = "relative";
  container.setAttribute(
    "aria-label",
    "Machine Math game. A child-friendly math puzzle with machines and number tiles."
  );
  const textInstructions = document.createElement("div");
  textInstructions.style.position = "absolute";
  textInstructions.style.left = "8px";
  textInstructions.style.top = "8px";
  textInstructions.style.maxWidth = "440px";
  textInstructions.style.background = "rgba(255,255,255,0.0)";
  textInstructions.style.color = "#000";
  textInstructions.style.fontFamily = "sans-serif";
  textInstructions.style.fontSize = "12px";
  textInstructions.style.lineHeight = "1.2";
  textInstructions.setAttribute("role", "region");
  textInstructions.setAttribute("aria-live", "polite");
  textInstructions.innerText =
    "Machine Math: Help power the silly machines! Use mouse or keyboard. Arrow keys to move, Enter or Space to pick a tile, Backspace to remove, P to press the power button. Match the tiles to the target sum shown on the machine. Complete all machines to win!";
  container.appendChild(textInstructions);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.border = "2px solid #223";
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";
  canvas.style.background = "#F6FBFF";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Game canvas for Machine Math");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Audio setup with error handling
  let audioCtx = null;
  let bgGain = null;
  let bgOsc = null;
  let bgOsc2 = null;
  let masterGain = null;
  let clickGain = null;
  let ambientTicker = null;
  let playingBackground = false;
  let ambientIntervalHandle = null;

  function initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("Web Audio API not supported in this browser.");
      audioCtx = new AudioContext();

      // Master gain
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioCtx.destination);

      // Background pad: two detuned oscillators through lowpass and slow tremolo
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.045;

      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 720;
      filter.Q.value = 0.8;

      // Create two oscillators for warm pad
      bgOsc = audioCtx.createOscillator();
      bgOsc.type = "sine";
      bgOsc.frequency.value = 110; // base hum

      bgOsc2 = audioCtx.createOscillator();
      bgOsc2.type = "sine";
      bgOsc2.frequency.value = 110 * 1.012; // slight detune

      // Gentle moving bandpass for character
      const band = audioCtx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 240;
      band.Q.value = 0.8;

      // LFO for amplitude wobble
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.08;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(bgGain.gain);

      // connect pad
      bgOsc.connect(bgGain);
      bgOsc2.connect(bgGain);
      bgGain.connect(filter);
      filter.connect(band);
      band.connect(masterGain);

      // click gain for short sounds
      clickGain = audioCtx.createGain();
      clickGain.gain.value = 0.9;
      clickGain.connect(masterGain);

      // Start oscillators only on user gesture; create but don't start louder things yet
      try {
        bgOsc.start();
        bgOsc2.start();
        lfo.start();
      } catch (e) {
        // Some browsers forbid starting before resume; we'll resume on user gesture
      }
      playingBackground = true;

      // Ambient occasional chime/tick: schedule a soft chime every few seconds
      if (ambientIntervalHandle) {
        clearInterval(ambientIntervalHandle);
        ambientIntervalHandle = null;
      }
      ambientIntervalHandle = setInterval(() => {
        // only play when audio is allowed
        if (!audioCtx || audioCtx.state === "suspended") return;
        // Make a soft bell at random intervals slightly varied
        const base = 520 + Math.random() * 40;
        playTone({
          frequency: base,
          type: "sine",
          duration: 0.28,
          volume: 0.06,
          attack: 0.02,
          release: 0.12,
          filterFreq: 2400,
        });
        setTimeout(() => {
          playTone({
            frequency: base * 1.5,
            type: "triangle",
            duration: 0.18,
            volume: 0.05,
            attack: 0.01,
            release: 0.08,
            filterFreq: 2600,
          });
        }, 160 + Math.random() * 260);
      }, 3500 + Math.random() * 800);
    } catch (err) {
      console.error("Audio init error:", err);
      audioCtx = null;
    }
  }

  // Call initAudio but be prepared to resume on user gesture
  initAudio();

  function resumeAudio() {
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => console.warn("Audio resume failed:", e));
    }
  }

  function playTone({
    frequency = 440,
    type = "sine",
    duration = 0.15,
    volume = 0.12,
    attack = 0.01,
    release = 0.06,
    filterFreq = 4000,
  } = {}) {
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filt = audioCtx.createBiquadFilter();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);

      filt.type = "lowpass";
      filt.frequency.setValueAtTime(filterFreq, now);

      // Envelope
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + attack);
      g.gain.linearRampToValueAtTime(0.0001, now + duration - release);

      // Connect graph
      osc.connect(filt);
      filt.connect(g);
      g.connect(clickGain);

      // Start/stop
      osc.start(now);
      osc.stop(now + duration + 0.02);

      // cleanup: disconnect after stop
      osc.onended = () => {
        try {
          osc.disconnect();
          filt.disconnect();
          g.disconnect();
        } catch (err) {
          // ignore disconnect errors
        }
      };
    } catch (err) {
      console.warn("playTone error:", err);
    }
  }

  function playCorrect() {
    resumeAudio();
    // pleasant rising triad gliss with soft bell
    playTone({ frequency: 660, type: "sine", duration: 0.14, volume: 0.12, filterFreq: 1200 });
    setTimeout(
      () =>
        playTone({
          frequency: 880,
          type: "triangle",
          duration: 0.12,
          volume: 0.11,
          filterFreq: 1600,
        }),
      80
    );
    setTimeout(
      () =>
        playTone({
          frequency: 990,
          type: "sine",
          duration: 0.16,
          volume: 0.10,
          filterFreq: 2200,
        }),
      160
    );
    // soft sparkle scatter
    setTimeout(
      () => playTone({ frequency: 1320, type: "sine", duration: 0.06, volume: 0.05, filterFreq: 3200 }),
      260
    );
  }

  function playIncorrect() {
    resumeAudio();
    // low buzz with quick decay and soft thud
    playTone({ frequency: 130, type: "square", duration: 0.20, volume: 0.14, filterFreq: 900 });
    setTimeout(() => playTone({ frequency: 80, type: "sine", duration: 0.22, volume: 0.06, filterFreq: 600 }), 60);
  }

  function playClick() {
    resumeAudio();
    // brighter quick click
    playTone({
      frequency: 480,
      type: "sine",
      duration: 0.07,
      volume: 0.12,
      attack: 0.005,
      release: 0.03,
      filterFreq: 2600,
    });
  }

  // Game state
  let level = 1;
  let target = 0;
  let tiles = []; // array of numbers
  let selectedIndices = new Set();
  let attempts = 0;
  let score = 0;
  let message = "Welcome! Press Space or click a tile to select. Press P to power the machine.";
  let mouse = { x: 0, y: 0, down: false };
  let focusedTile = 0; // for keyboard navigation
  let powerButton = { x: WIDTH - 140, y: HEIGHT - 110, w: 110, h: 70 };

  // Generate level: target sum and tiles
  function generateLevel(l) {
    // Difficulty scales: start with small sums, increase targets and number of tiles
    const tileCount = clamp(4 + Math.floor(l / 2), 4, 9);
    // target between 6 and 20 + l*3
    target = randInt(6 + l * 1, 10 + l * 3);
    // Create tiles that include at least one valid combination
    tiles = [];
    // ensure at least 2-3 tiles sum to target
    const comboSize = clamp(2 + (l % 3), 2, 4);
    let combo = [];
    // build combo numbers
    let remaining = target;
    for (let i = 0; i < comboSize - 1; i++) {
      const maxPart = Math.max(1, Math.floor(remaining / (comboSize - i)));
      const part = randInt(1, maxPart);
      combo.push(part);
      remaining -= part;
    }
    combo.push(remaining);
    // Fill tiles with combo and other randoms
    combo.forEach((n) => tiles.push(n));
    while (tiles.length < tileCount) {
      tiles.push(randInt(1, Math.max(6, target - 1)));
    }
    // Shuffle tiles
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    selectedIndices.clear();
    attempts = 0;
    focusedTile = 0;
    message = `Level ${l}: Make the machine target ${target}.`;
  }

  // Start game
  function startGame() {
    level = 1;
    score = 0;
    generateLevel(level);
    running = true;
  }

  // Game interactions
  function toggleSelectIndex(idx) {
    if (idx < 0 || idx >= tiles.length) return;
    if (selectedIndices.has(idx)) {
      selectedIndices.delete(idx);
      playClick();
    } else {
      selectedIndices.add(idx);
      playClick();
    }
    attempts++;
  }

  function submitPower() {
    // sum selected
    const sum = Array.from(selectedIndices).reduce((acc, i) => acc + tiles[i], 0);
    if (sum === target) {
      // success animation and advance
      score += 10 + Math.max(0, 5 - attempts);
      playCorrect();
      message = "Perfect! Machine powered up! Moving to next machine...";
      // small celebration animation trigger
      triggerFireworks();
      setTimeout(() => {
        level++;
        if (level > MAX_LEVELS) {
          message = `You powered all machines! Score: ${score}. Press R to play again.`;
          running = false;
        } else {
          generateLevel(level);
        }
      }, 1100);
    } else {
      // incorrect
      playIncorrect();
      message = `Hmm! Selected sum is ${sum}. Try again!`;
      // subtle shake or visual cue
      shakeStart = performance.now();
      // do not remove selections automatically to encourage retry
    }
  }

  // Visual state for wacky calming machines
  // Extra decorative particles
  const bgParticles = [];
  for (let i = 0; i < 28; i++) {
    bgParticles.push({
      x: Math.random() * WIDTH,
      y: Math.random() * (HEIGHT - 120),
      r: 8 + Math.random() * 14,
      speed: 0.02 + Math.random() * 0.06,
      hue: 190 + Math.random() * 60,
      alpha: 0.06 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function drawBackground() {
    // Soft layered gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#E8F8FF");
    g.addColorStop(0.6, "#F3FAFF");
    g.addColorStop(1, "#F9FDFF");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle grid for learning aesthetic
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = "#4b6b8a";
    ctx.lineWidth = 1;
    const gridSize = 36;
    for (let x = 0; x < WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x + (time / 200 % gridSize), 0);
      ctx.lineTo(x + (time / 200 % gridSize), HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y + (time / 300 % gridSize));
      ctx.lineTo(WIDTH, y + (time / 300 % gridSize));
      ctx.stroke();
    }
    ctx.restore();

    // floating soft particles / bubbles
    for (let p of bgParticles) {
      p.phase += 0.002 + p.speed * 0.002;
      p.x += Math.sin(p.phase) * 0.2;
      p.y += p.speed * 3;
      if (p.y > HEIGHT + p.r) {
        p.y = -p.r;
        p.x = Math.random() * WIDTH;
      }
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 70%, 80%, ${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // gentle clouds (parallax)
    ctx.save();
    ctx.globalAlpha = 0.85;
    const cloudColor = "#FFFFFF";
    const cx = (time / 800) % (WIDTH + 300) - 150;
    drawCloud(ctx, cx - 120, 40, 90, cloudColor);
    drawCloud(ctx, cx + 60, 70, 60, cloudColor);
    drawCloud(ctx, cx + 220, 30, 70, cloudColor);
    ctx.restore();

    // subtle horizon line
    ctx.beginPath();
    ctx.fillStyle = "rgba(180,230,255,0.28)";
    ctx.fillRect(0, HEIGHT - 130, WIDTH, 130);
  }

  function drawCloud(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.9, size * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(x + size * 0.6, y + 6, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(x - size * 0.6, y + 6, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMachine() {
    // Machine body - whimsical robot-like machine with face and moving eyes
    const mx = WIDTH / 2;
    const my = 120;

    // Main body
    ctx.save();
    ctx.translate(mx, my);
    // base shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(34,40,60,0.06)";
    ctx.ellipse(0, 150, 160, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // body panel
    ctx.fillStyle = "#fff8f3";
    ctx.strokeStyle = "#7a5b6f";
    ctx.lineWidth = 2;
    roundRect(ctx, -220, -30, 440, 180, 22, true, true);

    // front screen with subtle glow
    const screenX = -160;
    const screenY = -4;
    ctx.save();
    const screenGrad = ctx.createLinearGradient(screenX, screenY, screenX + 260, screenY + 90);
    screenGrad.addColorStop(0, "#0f2b44");
    screenGrad.addColorStop(1, "#07202e");
    ctx.fillStyle = screenGrad;
    roundRect(ctx, screenX, screenY, 260, 90, 14, true, false);
    // soft grid lines on screen
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#99d6ff";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(screenX + 8, screenY + 10 + i * 14);
      ctx.lineTo(screenX + 252, screenY + 10 + i * 14);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // inside screen: little animated graphs to show "thinking"
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "#9fe5ff";
    ctx.lineWidth = 3;
    let graphY = screenY + 60;
    ctx.moveTo(screenX + 12, graphY);
    for (let i = 0; i < 12; i++) {
      const gx = screenX + 12 + i * 18;
      const gy = graphY - 14 * Math.abs(Math.sin(time / 600 + i * 0.5 + level * 0.2));
      ctx.lineTo(gx, gy);
    }
    ctx.stroke();
    ctx.restore();

    // Target display
    ctx.fillStyle = "#D7F7FF";
    roundRect(ctx, 40, 6, 120, 70, 12, true, true);
    ctx.fillStyle = "#004b66";
    ctx.font = "20px Comic Sans MS, Arial";
    ctx.textAlign = "center";
    ctx.fillText("TARGET", 100, 26);
    ctx.font = "44px Comic Sans MS, Arial";
    ctx.fillStyle = "#003a4d";
    ctx.fillText(`${target}`, 100, 58);

    // pipes and knobs with subtle animation
    for (let i = 0; i < 3; i++) {
      const px = -180 + i * 140;
      ctx.fillStyle = "#cfefff";
      roundRect(ctx, px, 60, 80, 28, 10, true, true);
      // knob that breathes
      ctx.beginPath();
      const knobY = 74 + Math.sin(time / 500 + i) * 2;
      ctx.fillStyle = "#FFDFA8";
      ctx.arc(px + 12, knobY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b07b4d";
      ctx.stroke();
    }

    // robot face / socket with friendly eyes and mouth
    ctx.beginPath();
    ctx.fillStyle = "#FFDDE8";
    ctx.ellipse(180, 52, 46, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b36b88";
    ctx.stroke();

    // Eyes that follow mouse a bit
    const eyeBaseX = 170;
    const eyeBaseY = 40;
    const pupilOffsetX = clamp((mouse.x - (mx + 180)) / 40, -6, 6);
    const pupilOffsetY = clamp((mouse.y - (my + 40)) / 40, -4, 4);

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(eyeBaseX, eyeBaseY, 9, 0, Math.PI * 2);
    ctx.arc(eyeBaseX + 20, eyeBaseY + 2, 8.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(eyeBaseX + pupilOffsetX * 0.8, eyeBaseY + pupilOffsetY * 0.6, 3.5, 0, Math.PI * 2);
    ctx.arc(
      eyeBaseX + 20 + pupilOffsetX * 0.8,
      eyeBaseY + 2 + pupilOffsetY * 0.6,
      3.2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // small smiling mouth with tiny LED effect
    ctx.beginPath();
    ctx.strokeStyle = "#a0426a";
    ctx.lineWidth = 2;
    ctx.arc(180, 72, 10, 0, Math.PI, false);
    ctx.stroke();

    // power button (draw as separate interactive area)
    // glow when hover or focused
    const isPowerHover =
      mouse.x >= powerButton.x &&
      mouse.x <= powerButton.x + powerButton.w &&
      mouse.y >= powerButton.y &&
      mouse.y <= powerButton.y + powerButton.h;
    const glow = focusedTile === -1 || isPowerHover;
    if (glow) {
      ctx.save();
      ctx.shadowColor = "rgba(255, 210, 120, 0.9)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = "#2b5235";
      roundRect(ctx, powerButton.x, powerButton.y, powerButton.w, powerButton.h, 12, true, true);
      ctx.restore();
    } else {
      ctx.fillStyle = "#2b5235";
      roundRect(ctx, powerButton.x, powerButton.y, powerButton.w, powerButton.h, 12, true, true);
    }
    ctx.fillStyle = "#BFF0AD";
    ctx.font = "22px Comic Sans MS, Arial";
    ctx.textAlign = "center";
    ctx.fillText("POWER", powerButton.x + powerButton.w / 2, powerButton.y + 42);

    // small animated wire from machine to power button
    ctx.beginPath();
    ctx.strokeStyle = "#c1e5c4";
    ctx.lineWidth = 3;
    ctx.moveTo(120, 110);
    ctx.quadraticCurveTo(260, 170 + Math.sin(time / 220) * 6, powerButton.x + 12, powerButton.y + 10);
    ctx.stroke();

    ctx.restore();
  }

  // draw tiles (number tiles)
  function drawTiles() {
    const areaX = 36;
    const areaY = 260;
    const tileW = 84;
    const tileH = 64;
    const gap = 12;
    for (let i = 0; i < tiles.length; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = areaX + col * (tileW + gap);
      const y = areaY + row * (tileH + gap);

      const isSelected = selectedIndices.has(i);
      const isFocused = focusedTile === i;
      const hovered = hitTest(mouse.x, mouse.y).type === "tile" && hitTest(mouse.x, mouse.y).index === i;

      // slight scale and lift when hovered or selected
      const wobble = Math.sin((i * 1234 + time / 120) / 20) * 0.02;
      const hoverScale = hovered ? 1.04 : isSelected ? 1.06 : 1.0;
      const lift = isSelected ? -6 : hovered ? -4 : 0;

      ctx.save();
      ctx.translate(x + tileW / 2, y + tileH / 2 + lift);
      ctx.scale(hoverScale, hoverScale);
      ctx.rotate(wobble);
      ctx.translate(-(x + tileW / 2), -(y + tileH / 2 + lift));

      // shadow
      ctx.beginPath();
      ctx.fillStyle = "rgba(16,20,30,0.08)";
      ctx.ellipse(x + tileW / 2 + 6, y + tileH + 8, tileW * 0.48, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // tile background
      const baseFill = isSelected ? "#FFF7D6" : "#FFFFFF";
      const accent = isSelected ? "#FFEBA8" : "#E8F6FF";
      const borderColor = isFocused ? "#FFB26B" : "#6b6b6b";
      ctx.fillStyle = baseFill;
      roundRect(ctx, x, y, tileW, tileH, 12, true, false);

      // inner accent panel
      const innerG = ctx.createLinearGradient(x, y, x + tileW, y + tileH);
      innerG.addColorStop(0, accent);
      innerG.addColorStop(1, "#ffffff");
      ctx.fillStyle = innerG;
      roundRect(ctx, x + 6, y + 6, tileW - 12, tileH - 12, 10, true, false);

      // border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isFocused ? 3 : 2;
      roundRect(ctx, x, y, tileW, tileH, 12, false, true);

      // subtle glint for tiles
      ctx.save();
      ctx.globalAlpha = hovered ? 0.16 : 0.08;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 6);
      ctx.quadraticCurveTo(x + tileW / 2, y - 2, x + tileW - 6, y + 8);
      ctx.lineTo(x + tileW - 6, y + 6);
      ctx.fill();
      ctx.restore();

      // number
      ctx.fillStyle = "#223";
      ctx.font = "28px Comic Sans MS, Arial";
      ctx.textAlign = "center";
      ctx.fillText(`${tiles[i]}`, x + tileW / 2, y + tileH / 2 + 10);

      ctx.restore();
    }
  }

  // draw HUD
  function drawHUD() {
    // Title with friendly badge
    ctx.fillStyle = "#223";
    ctx.font = "24px Comic Sans MS, Arial";
    ctx.textAlign = "left";
    ctx.fillText("Machine Math", 18, 32);

    // Score and level card
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    roundRect(ctx, WIDTH - 198, 6, 186, 60, 10, true, true);
    ctx.fillStyle = "#224";
    ctx.font = "16px Arial";
    ctx.fillText(`Level: ${level} / ${MAX_LEVELS}`, WIDTH - 180, 28);
    ctx.fillText(`Score: ${score}`, WIDTH - 180, 48);
    ctx.restore();

    // message box
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundRect(ctx, 12, HEIGHT - 76, 460, 64, 10, true, true);
    ctx.fillStyle = "#253";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    wrapText(ctx, message, 24, HEIGHT - 52, 440, 18);
  }

  // Show current selected sum
  function drawSelectedSummary() {
    const sum = Array.from(selectedIndices).reduce((acc, i) => acc + tiles[i], 0);
    ctx.fillStyle = "#002b2b";
    ctx.font = "20px Comic Sans MS, Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Selected sum: ${sum}`, 20, HEIGHT - 100);

    // speaker icon (interactive-looking)
    ctx.save();
    const sx = WIDTH - 34;
    const sy = 20;
    ctx.fillStyle = audioCtx ? "#3a7" : "#ccc";
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy - 6);
    ctx.lineTo(sx - 4, sy - 6);
    ctx.lineTo(sx + 4, sy - 12);
    ctx.lineTo(sx + 4, sy + 12);
    ctx.lineTo(sx - 4, sy + 6);
    ctx.lineTo(sx - 12, sy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#224";
    ctx.stroke();
    if (!audioCtx) {
      ctx.strokeStyle = "#900";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 10, sy - 10);
      ctx.lineTo(sx + 10, sy + 10);
      ctx.moveTo(sx + 10, sy - 10);
      ctx.lineTo(sx - 10, sy + 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Helpers for canvas shapes and text wrapping
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === "undefined") r = 5;
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

  function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let testLine;
    for (let n = 0; n < words.length; n++) {
      testLine = line + words[n] + " ";
      const metrics = context.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
  }

  // Mouse and keyboard handling
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  canvas.addEventListener("mousedown", (e) => {
    mouse.down = true;
    resumeAudio();
    // check tile clicked or power pressed
    const clicked = hitTest(mouse.x, mouse.y);
    if (clicked.type === "tile") {
      toggleSelectIndex(clicked.index);
      focusedTile = clicked.index;
    } else if (clicked.type === "power") {
      focusedTile = -1;
      submitPower();
    } else {
      playClick();
    }
  });

  canvas.addEventListener("mouseup", () => {
    mouse.down = false;
  });

  // keyboard interactions
  window.addEventListener("keydown", (e) => {
    // Allow keyboard only when game running or after game ends
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      startGame();
      return;
    }
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      submitPower();
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      // select focused tile or if focus is power, submit
      if (focusedTile === -1) {
        submitPower();
      } else {
        toggleSelectIndex(focusedTile);
      }
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      // remove last selected
      const arr = Array.from(selectedIndices);
      if (arr.length) {
        const last = arr[arr.length - 1];
        selectedIndices.delete(last);
        playClick();
      } else {
        message = "No tiles selected.";
      }
      return;
    }
    // arrow navigation
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      moveFocus(e.key);
      return;
    }
    // number keys quick select
    if (/^[0-9]$/.test(e.key)) {
      // choose a tile with this number that is not selected yet
      const num = parseInt(e.key, 10);
      let found = -1;
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] === num && !selectedIndices.has(i)) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        focusedTile = found;
        toggleSelectIndex(found);
      } else {
        message = `No unselected tile with number ${num}.`;
        playIncorrect();
      }
    }
  });

  function moveFocus(key) {
    if (focusedTile === -1) {
      // from power, go to last tile
      focusedTile = tiles.length - 1;
      return;
    }
    if (tiles.length === 0) return;
    const cols = 5;
    const col = focusedTile % cols;
    const row = Math.floor(focusedTile / cols);
    let newIndex = focusedTile;
    if (key === "ArrowLeft") {
      if (col > 0) newIndex = focusedTile - 1;
    } else if (key === "ArrowRight") {
      if (col < cols - 1 && focusedTile + 1 < tiles.length) newIndex = focusedTile + 1;
      else newIndex = -1; // move to power
    } else if (key === "ArrowUp") {
      if (row > 0) newIndex = focusedTile - cols;
    } else if (key === "ArrowDown") {
      if (row < Math.ceil(tiles.length / cols) - 1 && focusedTile + cols < tiles.length)
        newIndex = focusedTile + cols;
      else newIndex = -1; // to power
    }
    if (newIndex === -1) focusedTile = -1;
    else focusedTile = clamp(newIndex, 0, tiles.length - 1);
    playClick();
  }

  // Hit testing for mouse events
  function hitTest(mxPos, myPos) {
    // tiles
    const areaX = 36;
    const areaY = 260;
    const tileW = 84;
    const tileH = 64;
    const gap = 12;
    for (let i = 0; i < tiles.length; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = areaX + col * (tileW + gap);
      const y = areaY + row * (tileH + gap);
      if (mxPos >= x && mxPos <= x + tileW && myPos >= y && myPos <= y + tileH) {
        return { type: "tile", index: i };
      }
    }
    // power button
    if (
      mxPos >= powerButton.x &&
      mxPos <= powerButton.x + powerButton.w &&
      myPos >= powerButton.y &&
      myPos <= powerButton.y + powerButton.h
    ) {
      return { type: "power" };
    }
    return { type: "none" };
  }

  // Small fireworks for celebration
  let sparks = [];
  let fireworksActive = false;
  function triggerFireworks() {
    fireworksActive = true;
    sparks = [];
    const centerX = WIDTH / 2;
    const centerY = 140;
    for (let s = 0; s < 36; s++) {
      const angle = (Math.PI * 2 * s) / 36;
      const speed = 0.6 + Math.random() * 2.2;
      sparks.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        life: 0.6 + Math.random() * 0.6,
        age: 0,
        color: `hsl(${Math.floor(Math.random() * 360)}, 75%, 60%)`,
      });
    }
    setTimeout(() => {
      fireworksActive = false;
    }, 900);
  }

  function updateSparks(dt) {
    for (let s of sparks) {
      s.age += dt;
      s.x += s.vx * dt * 140;
      s.y += s.vy * dt * 140;
      s.vy += 0.6 * dt * 80; // gravity
    }
    sparks = sparks.filter((p) => p.age < p.life);
  }

  function drawSparks() {
    for (let s of sparks) {
      const alpha = 1 - s.age / s.life;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4 + 3 * (1 - alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Small shake effect
  let shakeStart = 0;

  // Main loop
  let lastTime = performance.now();
  let time = 0;
  let running = true;

  function gameLoop(now) {
    const dt = Math.min(0.06, (now - lastTime) / 1000);
    time += (now - lastTime) || 16;
    lastTime = now;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Apply shake when wrong submit
    let dx = 0;
    let dy = 0;
    if (shakeStart > 0) {
      const t = (performance.now() - shakeStart) / 300;
      if (t < 1) {
        dx = Math.sin(t * 24) * 4 * (1 - t);
        dy = Math.cos(t * 18) * 3 * (1 - t);
      } else {
        shakeStart = 0;
      }
    }
    ctx.save();
    ctx.translate(dx, dy);

    drawBackground();
    drawMachine();
    drawTiles();
    drawHUD();
    drawSelectedSummary();

    if (fireworksActive) {
      updateSparks(dt);
      drawSparks();
    }

    // If game ended, show overlay
    if (!running && level > MAX_LEVELS) {
      ctx.fillStyle = "rgba(10, 10, 20, 0.6)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#FFF";
      ctx.font = "32px Comic Sans MS, Arial";
      ctx.textAlign = "center";
      ctx.fillText("All Machines Powered!", WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = "20px Arial";
      ctx.fillText(`Your Score: ${score}`, WIDTH / 2, HEIGHT / 2 + 20);
      ctx.font = "16px Arial";
      ctx.fillText("Press R to play again.", WIDTH / 2, HEIGHT / 2 + 56);
    }

    ctx.restore();

    requestAnimationFrame(gameLoop);
  }

  // Start
  generateLevel(level);
  requestAnimationFrame(gameLoop);

  // Start audio on first user gesture; also show accessible control
  function setupFirstGesture() {
    const clickHandler = () => {
      resumeAudio();
      // ensure oscillators started
      try {
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      } catch (e) {
        // ignore
      }
      canvas.removeEventListener("click", clickHandler);
    };
    canvas.addEventListener("click", clickHandler);
  }
  setupFirstGesture();

  // Initialize a few UI hints and ensure accessible text updates on state change
  const srStatus = document.createElement("div");
  srStatus.style.position = "absolute";
  srStatus.style.left = "8px";
  srStatus.style.top = "380px";
  srStatus.style.width = "1px";
  srStatus.style.height = "1px";
  srStatus.style.overflow = "hidden";
  srStatus.style.clip = "rect(1px, 1px, 1px, 1px)";
  srStatus.setAttribute("aria-live", "polite");
  container.appendChild(srStatus);

  // Periodically update srStatus to reflect game state for screen readers
  setInterval(() => {
    const sum = Array.from(selectedIndices).reduce((acc, i) => acc + tiles[i], 0);
    srStatus.innerText = `Level ${level}. Target ${target}. Selected sum ${sum}. ${message}`;
  }, 900);

  // Expose some debug functions in case of console usage (non-essential)
  window.machineMath = {
    restart: startGame,
    playTestSound: () => {
      playClick();
    },
  };

  // Good practice: handle page visibility to suspend audio if tab is hidden
  document.addEventListener("visibilitychange", () => {
    if (!audioCtx) return;
    if (document.hidden) {
      if (audioCtx.state === "running") audioCtx.suspend().catch(() => {});
    } else {
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    }
  });

  // On load, provide short greeting
  message = "Ready! Use tiles to match the target and press Power. You can use keyboard or mouse.";
})();