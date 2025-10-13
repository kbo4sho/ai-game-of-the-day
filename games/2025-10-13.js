(function () {
  // Enhanced Drone Math Collector - Visuals & Audio improvements only
  // Renders inside element with ID game-of-the-day-stage
  // Mechanics and math logic preserved exactly from original code.

  // CONFIG
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_SCORE = 10; // win condition
  const MAX_WRONG = 3; // lives
  const STARTING_BALLOONS = 5;
  const MIN_NUMBER = 1;
  const MAX_NUMBER = 20;
  const BODY_FONT = "16px system-ui, sans-serif";
  const TITLE_FONT = "22px system-ui, sans-serif";
  const IMPORTANT_FONT = "28px system-ui, sans-serif";
  const PADDING = 10; // min 10px padding
  const BOTTOM_INSTRUCTIONS_HEIGHT = 80; // reserved bottom area for instructions

  // Get container and create canvas
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container #game-of-the-day-stage not found.");
    return;
  }
  container.style.position = "relative";
  container.style.width = WIDTH + "px";
  container.style.height = HEIGHT + "px";
  container.style.userSelect = "none";

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // make keyboard focusable
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Drone Math Collector game. Use arrow keys to move, space to pick up balloons. Press R to restart."
  );
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: false });

  // Audio setup with proper error handling
  let audioEnabled = true;
  let audioContext = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio API not supported");
    audioContext = new AC();

    // unlock audio on interaction for browsers that require it
    const unlock = () => {
      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  } catch (e) {
    console.warn("Audio context creation failed:", e);
    audioEnabled = false;
    audioContext = null;
  }

  // Ambient background sound manager (gentle pad & subtle movement)
  let ambientNodes = null;
  function startAmbient() {
    if (!audioContext || !audioEnabled) return;
    try {
      stopAmbient(); // ensure single instance
      const now = audioContext.currentTime;
      const master = audioContext.createGain();
      master.gain.value = 0.0001;
      master.connect(audioContext.destination);

      // Two detuned oscillators for a warm pad
      const oscA = audioContext.createOscillator();
      const oscB = audioContext.createOscillator();
      oscA.type = "sine";
      oscB.type = "sine";
      oscA.frequency.value = 220;
      oscB.frequency.value = 222; // slight detune
      const filt = audioContext.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 900;
      filt.Q.value = 0.8;

      // LFO to gently modulate filter cutoff for movement
      const lfo = audioContext.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.07; // very slow
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 220;

      // Envelope fade in
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(0.035, now + 1.8);

      // Connections
      oscA.connect(filt);
      oscB.connect(filt);
      filt.connect(master);
      lfo.connect(lfoGain);
      lfoGain.connect(filt.frequency);

      // start
      oscA.start(now);
      oscB.start(now);
      lfo.start(now);

      ambientNodes = { oscA, oscB, lfo, lfoGain, filt, master };
    } catch (e) {
      console.warn("startAmbient error:", e);
    }
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    try {
      const now = audioContext.currentTime;
      // gentle fade out then stop
      ambientNodes.master.gain.cancelScheduledValues(now);
      ambientNodes.master.gain.setValueAtTime(ambientNodes.master.gain.value || 0.03, now);
      ambientNodes.master.gain.linearRampToValueAtTime(0.0001, now + 0.8);

      const stopLater = () => {
        try {
          ambientNodes.oscA.stop();
          ambientNodes.oscB.stop();
          ambientNodes.lfo.stop();
        } catch (e) {}
        try {
          ambientNodes.oscA.disconnect();
          ambientNodes.oscB.disconnect();
          ambientNodes.lfo.disconnect();
          ambientNodes.lfoGain.disconnect();
          ambientNodes.filt.disconnect();
          ambientNodes.master.disconnect();
        } catch (e) {}
        ambientNodes = null;
      };
      // schedule a cleanup
      setTimeout(stopLater, 1000);
    } catch (e) {
      console.warn("stopAmbient error:", e);
      ambientNodes = null;
    }
  }

  // Sound generators (oscillator-based) with clearer timbres
  function playTone({
    type = "sine",
    freq = 440,
    duration = 0.25,
    volume = 0.06,
    attack = 0.01,
    decay = 0.05,
    detune = 0
  }) {
    if (!audioEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.max(800, freq * 2.5);

      osc.type = type;
      osc.frequency.value = freq;
      if (detune) osc.detune.value = detune;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + attack);
      gain.gain.linearRampToValueAtTime(0.0001, now + duration - decay);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
      osc.onended = () => {
        try {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn("Error playing tone:", e);
    }
  }

  function playCorrectSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      // gentle bell made of two partials
      playTone({ type: "sine", freq: 880, duration: 0.2, volume: 0.05, attack: 0.005, decay: 0.06 });
      setTimeout(
        () =>
          playTone({
            type: "triangle",
            freq: 1180,
            duration: 0.18,
            volume: 0.04,
            attack: 0.004,
            decay: 0.06,
            detune: -6
          }),
        90
      );
      // a small high sparkle
      setTimeout(() => playTone({ type: "sine", freq: 1600, duration: 0.09, volume: 0.02, attack: 0.002, decay: 0.02 }), 170);
    } catch (e) {
      console.warn("playCorrectSound error:", e);
    }
  }

  function playWrongSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      // Short, soft dissonant thud using two detuned saws through a bandpass
      const o1 = audioContext.createOscillator();
      const o2 = audioContext.createOscillator();
      o1.type = "sawtooth";
      o2.type = "sawtooth";
      o1.frequency.value = 220;
      o2.frequency.value = 260;

      const bp = audioContext.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 400;
      bp.Q.value = 1.4;

      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      o1.connect(bp);
      o2.connect(bp);
      bp.connect(g);
      g.connect(audioContext.destination);

      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.22);
      o2.stop(now + 0.22);

      o1.onended = () => {
        try {
          o1.disconnect();
          o2.disconnect();
          bp.disconnect();
          g.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn("playWrongSound error:", e);
    }
  }

  // Game state
  let score = 0;
  let wrongs = 0;
  let balloons = [];
  let player = null;
  let targetQuestion = null;
  let elapsed = 0;
  let lastTime = 0;
  let running = false; // whether gameplay is active
  let gameState = "start"; // "start", "playing", "won", "lost"
  let backgroundOffset = 0;
  let showAudioStatusFlash = 0;

  // Small decorative particles for correct feedback (visual only)
  const particles = [];

  // Input state
  const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false };

  // Utility functions
  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Create player drone
  function resetPlayer() {
    player = {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      r: 18,
      speed: 180, // px per second
      color: "#50A7FF",
      shadowColor: "rgba(6,22,30,0.14)",
      wobble: 0,
      rot: 0
    };
  }

  // Create a new math question and set of balloons (mechanics preserved)
  function spawnQuestion() {
    // Choose addition or subtraction with simple numbers
    const type = Math.random() < 0.6 ? "+" : "-";
    let a, b, answer;
    if (type === "+") {
      a = rand(1, 12);
      b = rand(1, 12);
      answer = a + b;
    } else {
      a = rand(5, 18);
      b = rand(1, 6);
      answer = a - b;
    }
    targetQuestion = { a, b, type, answer };

    // Spawn balloons with numbers, including the correct one
    balloons = [];
    const count = STARTING_BALLOONS;
    const correctIndex = rand(0, count - 1);
    for (let i = 0; i < count; i++) {
      let value;
      if (i === correctIndex) {
        value = answer;
      } else {
        // ensure wrong values not equal answer
        let v;
        do {
          v = rand(MIN_NUMBER, MAX_NUMBER);
        } while (v === answer);
        value = v;
      }
      // positions along top area (not overlapping bottom instructions)
      const spawnX = rand(40, WIDTH - 40);
      const spawnY = rand(60, HEIGHT - BOTTOM_INSTRUCTIONS_HEIGHT - 60);
      const vx = (Math.random() - 0.5) * (20 + score * 2); // slightly faster as score increases
      const vy = (Math.random() - 0.5) * 20;
      balloons.push({
        x: spawnX,
        y: spawnY,
        r: 20,
        vx,
        vy,
        value,
        wobble: Math.random() * Math.PI * 2,
        color: pastelColor(i),
        shine: Math.random() * 0.6 + 0.2
      });
    }
  }

  // Pastel palette generator for calming colors
  function pastelColor(index) {
    const hues = [200, 180, 220, 260, 140, 30, 20, 340];
    const h = hues[index % hues.length] + (index * 10 % 40);
    return `hsl(${h} 70% 72%)`;
  }

  // Draw calming background with layered parallax (improved)
  function drawBackground(dt) {
    backgroundOffset += dt * 24; // scroll speed
    // sky gradient with subtle radial vignette
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#DFF6FF");
    g.addColorStop(0.6, "#F9FEFF");
    g.addColorStop(1, "#FDFFFF");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // far hills - soft shapes
    drawHills(backgroundOffset);

    // floating translucent shapes for depth
    drawFloatingShapes(dt);

    // subtle vignette edges
    const vignette = ctx.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      10,
      WIDTH / 2,
      HEIGHT / 2,
      Math.max(WIDTH, HEIGHT)
    );
    vignette.addColorStop(0, "rgba(255,255,255,0)");
    vignette.addColorStop(0.8, "rgba(10,24,40,0.02)");
    vignette.addColorStop(1, "rgba(6,16,32,0.06)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawHills(offset) {
    ctx.save();
    ctx.translate(-((offset / 2) % 150), 0);
    // three layered hills
    for (let layer = 0; layer < 3; layer++) {
      const baseY = HEIGHT - (60 + layer * 12);
      ctx.beginPath();
      ctx.moveTo(-200 + layer * 30, baseY);
      for (let x = -200; x < WIDTH + 200; x += 80) {
        const y =
          baseY -
          Math.sin((x + offset * (0.2 + layer * 0.08)) * 0.01) * (18 + layer * 6) -
          layer * 8;
        ctx.quadraticCurveTo(x + 40, y - 12, x + 80, baseY);
      }
      ctx.lineTo(WIDTH + 200, HEIGHT);
      ctx.lineTo(-200, HEIGHT);
      ctx.closePath();
      const alpha = 0.06 + layer * 0.03;
      ctx.fillStyle = `rgba(8,28,44,${alpha})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFloatingShapes(dt) {
    // subtle circles that drift
    ctx.save();
    for (let i = 0; i < 8; i++) {
      const ox =
        (i * 97 + backgroundOffset * (0.3 + (i % 3) * 0.05)) % (WIDTH + 200) - 100;
      const oy = 40 + (i * 37) % (HEIGHT / 2);
      const r = 20 + (i % 4) * 8;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 2) * 0.02})`;
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw UI elements with spacing and non-overlap using measureText
  function drawUI() {
    // Top-left: Score
    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = "#073146";
    const scoreText = `Score: ${score}/${TARGET_SCORE}`;
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreW = scoreMetrics.width;
    const scoreH = 28;
    const scoreX = PADDING;
    const scoreY = PADDING;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundRectFill(scoreX - 8, scoreY - 8, scoreW + 16, scoreH + 16, 10, "rgba(255,255,255,0.9)");
    ctx.fillStyle = "#053746";
    ctx.fillText(scoreText, scoreX, scoreY + scoreH - 6);

    // Top-center: Audio toggle (visual indicator)
    ctx.font = BODY_FONT;
    const audioText = audioEnabled ? "Audio: On" : "Audio: Off";
    const audioMetrics = ctx.measureText(audioText);
    const audioW = audioMetrics.width;
    const audioX = (WIDTH - audioW) / 2;
    const audioY = PADDING;
    roundRectFill(audioX - 8, audioY - 8, audioW + 16, 28 + 16 - 8, 10, "rgba(255,255,255,0.86)");
    ctx.fillStyle = audioEnabled ? "#0B5A67" : "#6A5C5C";
    ctx.fillText(audioText, audioX, audioY + 20);

    // audio flash indicator
    if (!audioEnabled && showAudioStatusFlash > 0) {
      ctx.fillStyle = "rgba(255,80,80,0.9)";
      ctx.beginPath();
      ctx.arc(
        audioX + audioW + 18,
        audioY + 14,
        6 + Math.sin(showAudioStatusFlash * 10) * 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Top-right: Lives/wrongs
    ctx.font = IMPORTANT_FONT;
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrongs)}`;
    const livesMetrics = ctx.measureText(livesText);
    const livesW = livesMetrics.width;
    const livesX = WIDTH - livesW - PADDING;
    const livesY = PADDING;
    roundRectFill(livesX - 8, livesY - 8, livesW + 16, 28 + 16 - 8, 10, "rgba(255,255,255,0.9)");
    ctx.fillStyle = "#7A102B";
    ctx.fillText(livesText, livesX, livesY + 20);

    // Bottom-center: Instructions (multi-line)
    ctx.font = BODY_FONT;
    const lines = [];
    if (gameState === "playing") {
      lines.push(`Question: ${targetQuestion.a} ${targetQuestion.type} ${targetQuestion.b} = ?`);
      lines.push("Fly your drone with arrow keys or drag. Collect the correct numbered balloon. Space picks up too.");
    } else if (gameState === "start") {
      lines.push("Welcome! Help your friendly drone collect the correct numbers.");
      lines.push("Collect 10 correct balloons to win. 3 wrong picks and it's game over.");
      lines.push("Press Space or Enter to begin.");
    } else if (gameState === "won") {
      lines.push("You Win! The drone fleet celebrates!");
      lines.push("Press R or click Restart to play again.");
    } else if (gameState === "lost") {
      lines.push("Game Over. The drone needs practice.");
      lines.push("Press R or click Restart to try again.");
    }
    // measure max width
    let maxW = 0;
    for (const l of lines) {
      const m = ctx.measureText(l).width;
      if (m > maxW) maxW = m;
    }
    const boxW = Math.min(WIDTH - 40, maxW + 24);
    const boxH = lines.length * 20 + 20;
    const boxX = (WIDTH - boxW) / 2;
    const boxY = HEIGHT - boxH - PADDING;
    roundRectFill(boxX, boxY, boxW, boxH, 12, "rgba(255,255,255,0.92)");
    ctx.fillStyle = "#0A3A55";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], boxX + 12, boxY + 20 + i * 20);
    }

    // If game over or win, draw restart button just above instructions
    if (gameState === "won" || gameState === "lost") {
      const btnText = "Restart";
      ctx.font = "18px system-ui, sans-serif";
      const bW = ctx.measureText(btnText).width + 36;
      const bH = 40;
      const bX = (WIDTH - bW) / 2;
      const bY = boxY - bH - 12;
      // button gradient
      const grad = ctx.createLinearGradient(bX, bY, bX + bW, bY + bH);
      grad.addColorStop(0, "#FFFFFF");
      grad.addColorStop(1, "#DDF5FF");
      roundRectFill(bX, bY, bW, bH, 10, grad);
      ctx.fillStyle = "#053146";
      ctx.fillText(btnText, bX + 18, bY + 26);
      // store button bounds for click detection
      canvas.restartButton = { x: bX, y: bY, w: bW, h: bH };
    } else {
      canvas.restartButton = null;
    }
  }

  function roundRectFill(x, y, w, h, r, fillStyle) {
    ctx.beginPath();
    const r0 = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
    ctx.moveTo(x + r0, y);
    ctx.arcTo(x + w, y, x + w, y + h, r0);
    ctx.arcTo(x + w, y + h, x, y + h, r0);
    ctx.arcTo(x, y + h, x, y, r0);
    ctx.arcTo(x, y, x + w, y, r0);
    ctx.closePath();
    if (fillStyle) ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  // Draw player drone with refined visuals
  function drawPlayer(dt) {
    if (!player) return;
    player.wobble += dt * 8;
    player.rot += dt * 8;
    // shadow
    ctx.fillStyle = player.shadowColor;
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + player.r + 11, player.r * 1.25, player.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // body core
    ctx.save();
    // subtle tilt with wobble
    ctx.translate(player.x, player.y);
    ctx.rotate(Math.sin(player.wobble) * 0.03);
    ctx.beginPath();
    // main hull
    ctx.fillStyle = player.color;
    ctx.ellipse(0, 0, player.r * 1.25, player.r, 0, 0, Math.PI * 2);
    ctx.fill();

    // cockpit glass
    ctx.beginPath();
    ctx.ellipse(-3, -4, player.r * 0.6, player.r * 0.45, 0, 0, Math.PI * 2);
    const gp = ctx.createLinearGradient(-player.r, -player.r, player.r, player.r);
    gp.addColorStop(0, "rgba(255,255,255,0.6)");
    gp.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = gp;
    ctx.fill();

    // small lights
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.fillStyle = i === 0 ? "#FFE28A" : "rgba(255,255,255,0.8)";
      ctx.arc(i * 6, 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // rotor arms
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * (player.r + 4), -player.r * 0.85);
      ctx.rotate(Math.sin(player.wobble * 3 + i) * 0.5 + (player.rot % Math.PI) * 2);
      ctx.fillStyle = "rgba(20,30,36,0.72)";
      // blade
      ctx.beginPath();
      ctx.roundRect(-10, -3.5, 24, 7, 3);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // face details (on body)
    ctx.fillStyle = "#052A3B";
    ctx.beginPath();
    ctx.arc(player.x - 7, player.y - 2, 2.2, 0, Math.PI * 2);
    ctx.arc(player.x + 7, player.y - 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#052A3B";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(player.x, player.y + 5, 4.6, 0, Math.PI);
    ctx.stroke();
  }

  // Draw balloons (numbers) with richer visuals
  function drawBalloons(dt) {
    ctx.font = "18px system-ui, sans-serif";
    balloons.forEach((b) => {
      // movement
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.wobble += dt * 3;
      // gentle bobbing
      const bob = Math.sin(b.wobble * 1.2) * 2.4;

      // bounce from edges
      if (b.x < b.r + 6) {
        b.x = b.r + 6;
        b.vx *= -1;
      } else if (b.x > WIDTH - b.r - 6) {
        b.x = WIDTH - b.r - 6;
        b.vx *= -1;
      }
      if (b.y < b.r + 50) {
        b.y = b.r + 50;
        b.vy *= -1;
      } else if (b.y > HEIGHT - BOTTOM_INSTRUCTIONS_HEIGHT - b.r - 6) {
        b.y = HEIGHT - BOTTOM_INSTRUCTIONS_HEIGHT - b.r - 6;
        b.vy *= -1;
      }

      // string
      ctx.strokeStyle = "rgba(60,80,90,0.16)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.r - 2);
      ctx.quadraticCurveTo(b.x + 6, b.y + b.r + 22 + bob, b.x, b.y + b.r + 38 + bob);
      ctx.stroke();

      // balloon body with radial highlight
      const grad = ctx.createRadialGradient(
        b.x - b.r * 0.2,
        b.y - b.r * 0.4,
        2,
        b.x,
        b.y,
        b.r * 1.4
      );
      grad.addColorStop(0, lighten(b.color, 0.18));
      grad.addColorStop(1, b.color);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + bob, b.r, b.r * 1.06, Math.sin(b.wobble) * 0.18, 0, Math.PI * 2);
      ctx.fill();

      // small glossy highlight
      ctx.fillStyle = `rgba(255,255,255,${0.45 * b.shine})`;
      ctx.beginPath();
      ctx.ellipse(
        b.x - b.r * 0.35,
        b.y - b.r * 0.5 + bob,
        b.r * 0.22,
        b.r * 0.14,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // number text background for readability (subtle)
      const text = String(b.value);
      const metrics = ctx.measureText(text);
      const textW = metrics.width;
      const textH = 18;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      roundRectFill(
        b.x - textW / 2 - 8,
        b.y - textH / 2 - 6 + bob,
        textW + 16,
        textH + 10,
        8,
        "rgba(255,255,255,0.72)"
      );

      // number
      ctx.fillStyle = "#053241";
      ctx.fillText(text, b.x - textW / 2, b.y + 6 + bob);
    });
  }

  function lighten(hsl, amount) {
    // accepts "hsl(h s% l%)" returns slightly lighter variation
    try {
      // quick parse
      const m = hsl.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
      if (!m) return hsl;
      const h = Number(m[1]),
        s = Number(m[2]),
        l = Math.min(100, Number(m[3]) + Math.round(amount * 100));
      return `hsl(${h} ${s}% ${l}%)`;
    } catch (e) {
      return hsl;
    }
  }

  // Update player position based on keys (mechanics preserved)
  function updatePlayer(dt) {
    if (!player) return;
    let dx = 0,
      dy = 0;
    if (keys.ArrowLeft) dx -= 1;
    if (keys.ArrowRight) dx += 1;
    if (keys.ArrowUp) dy -= 1;
    if (keys.ArrowDown) dy += 1;
    // Normalize
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
      player.x += dx * player.speed * dt;
      player.y += dy * player.speed * dt;
      player.x = clamp(player.x, player.r + 8, WIDTH - player.r - 8);
      player.y = clamp(player.y, player.r + 50, HEIGHT - BOTTOM_INSTRUCTIONS_HEIGHT - player.r - 8);
    }
  }

  // Collision detection for collecting balloons (mechanics preserved)
  function checkCollisions() {
    if (!player) return;
    for (let i = balloons.length - 1; i >= 0; i--) {
      const b = balloons[i];
      const dx = player.x - b.x;
      const dy = player.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < player.r + b.r - 6) {
        // auto-pickup upon touch
        collectBalloon(i);
      }
    }
  }

  function collectBalloon(index) {
    const b = balloons[index];
    if (!b) return;
    const correct = b.value === targetQuestion.answer;
    // pop animation: remove balloon
    balloons.splice(index, 1);
    // visual particle burst
    spawnParticles(b.x, b.y, correct ? "#9BE7B9" : "#FFB3B3", correct);
    if (correct) {
      score += 1;
      playCorrectSound();
      showAudioStatusFlash = 5;
      if (score >= TARGET_SCORE) {
        endGame(true);
        return;
      } else {
        // spawn next question after small delay
        setTimeout(spawnQuestion, 500);
      }
    } else {
      wrongs += 1;
      playWrongSound();
      showAudioStatusFlash = 5;
      if (wrongs >= MAX_WRONG) {
        endGame(false);
        return;
      } else {
        setTimeout(spawnQuestion, 500);
      }
    }
  }

  function spawnParticles(x, y, color, positive) {
    // gentle soft particles for feedback
    for (let i = 0; i < (positive ? 18 : 10); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 40 + (positive ? 20 : 10);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0.9 + Math.random() * 0.6,
        age: 0,
        size: 2 + Math.random() * 3,
        color
      });
    }
  }

  function updateAndDrawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += 40 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = 1 - p.age / p.life;
      ctx.fillStyle = `rgba(20,30,30,${0.06 * alpha})`;
      // subtle blur by drawing a faint circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + alpha * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.55 + alpha * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function endGame(won) {
    running = false;
    gameState = won ? "won" : "lost";
    // Start a short celebratory or somber tone and manage ambient
    if (audioEnabled && audioContext) {
      if (won) {
        // bright chord
        playTone({ type: "sine", freq: 660, duration: 0.6, volume: 0.07, attack: 0.02, decay: 0.12 });
        setTimeout(
          () =>
            playTone({ type: "triangle", freq: 880, duration: 0.48, volume: 0.045, attack: 0.02, decay: 0.08 }),
          120
        );
      } else {
        playWrongSound();
      }
      // ambient continues but fade slightly on game end
      if (audioEnabled) {
        // gentle reduction in ambient
        stopAmbient();
        // restart ambient later for menu screens if audio on
        setTimeout(() => {
          if (audioEnabled) startAmbient();
        }, 900);
      }
    }
    // show accessibility hint via canvas title
    canvas.setAttribute("aria-label", won ? "You won! Press R to restart." : "Game over. Press R to restart.");
  }

  // Start a new game
  function startGame() {
    score = 0;
    wrongs = 0;
    resetPlayer();
    spawnQuestion();
    gameState = "playing";
    running = true;
    lastTime = performance.now();
    // ensure ambient running
    if (audioEnabled) startAmbient();
    requestAnimationFrame(loop);
  }

  // Main loop
  function loop(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    elapsed += dt;

    // Update showAudioStatusFlash timer
    if (showAudioStatusFlash > 0) showAudioStatusFlash -= dt;

    // Update positions & draw
    drawBackground(dt);
    updatePlayer(dt);
    drawBalloons(dt);
    drawPlayer(dt);
    updateAndDrawParticles(dt);

    // UI AFTER drawing game elements to ensure readability
    drawUI();

    if (running) {
      checkCollisions();
      requestAnimationFrame(loop);
    }
  }

  // Input handlers
  canvas.addEventListener("keydown", (e) => {
    if (e.key in keys) {
      keys[e.key] = true;
      e.preventDefault();
    } else if (e.key === " " || e.key === "Spacebar") {
      // space can also be used to start game or pick up near balloons
      e.preventDefault();
      if (gameState === "start") {
        startGame();
      } else if (gameState === "playing") {
        // pick-up: check for nearest balloon within small radius
        let nearest = -1;
        let minDist = Infinity;
        for (let i = 0; i < balloons.length; i++) {
          const b = balloons[i];
          const dx = player.x - b.x;
          const dy = player.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            nearest = i;
          }
        }
        if (nearest !== -1 && minDist < player.r + balloons[nearest].r + 8) {
          collectBalloon(nearest);
        }
      } else if (gameState === "won" || gameState === "lost") {
        restartGame();
      }
    } else if (e.key === "Enter") {
      if (gameState === "start") startGame();
    } else if (e.key === "r" || e.key === "R") {
      restartGame();
    } else if (e.key.toLowerCase() === "m") {
      // toggle audio with M
      toggleAudio();
    }
  });

  canvas.addEventListener("keyup", (e) => {
    if (e.key in keys) {
      keys[e.key] = false;
      e.preventDefault();
    }
  });

  // Focus canvas to receive keyboard
  canvas.addEventListener("focus", () => {
    // nothing needed, but keep accessibility cue visible
  });

  // Pointer controls for moving (also support clicking restart)
  let pointerActive = false;
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Check restart button
    if (canvas.restartButton) {
      const b = canvas.restartButton;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        restartGame();
        return;
      }
    }
    // Check audio toggle area (top-center)
    ctx.font = BODY_FONT;
    const audioText = audioEnabled ? "Audio: On" : "Audio: Off";
    const audioW = ctx.measureText(audioText).width;
    const audioX = (WIDTH - audioW) / 2;
    const audioY = PADDING;
    if (y >= audioY - 8 && y <= audioY + 28 && x >= audioX - 8 && x <= audioX + audioW + 8) {
      toggleAudio();
      return;
    }
    // Move player toward pointer while pointer active
    pointerActive = true;
    movePlayerTo(x, y);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointerActive) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    movePlayerTo(x, y);
  });

  canvas.addEventListener("pointerup", () => {
    pointerActive = false;
  });

  canvas.addEventListener("click", (e) => {
    // If clicking on a balloon near player, treat as pickup
    if (gameState !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // find clicked balloon
    for (let i = 0; i < balloons.length; i++) {
      const b = balloons[i];
      const dx = x - b.x;
      const dy = y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) <= b.r + 6) {
        // if player close enough, collect; otherwise move player toward it
        const pdx = player.x - b.x;
        const pdy = player.y - b.y;
        if (Math.sqrt(pdx * pdx + pdy * pdy) < 120) {
          collectBalloon(i);
        } else {
          // move player toward clicked balloon immediately
          movePlayerTo(b.x, b.y);
        }
        break;
      }
    }
  });

  function movePlayerTo(x, y) {
    if (!player) return;
    // teleport a bit towards pointer for touch accessibility: smooth small move
    const dx = x - player.x;
    const dy = y - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const step = Math.min(60, len);
    player.x += (dx / len) * step;
    player.y += (dy / len) * step;
    player.x = clamp(player.x, player.r + 8, WIDTH - player.r - 8);
    player.y = clamp(player.y, player.r + 50, HEIGHT - BOTTOM_INSTRUCTIONS_HEIGHT - player.r - 8);
  }

  // Toggle audio on/off with handling for ambient
  function toggleAudio() {
    if (!audioContext) {
      audioEnabled = false;
      showAudioStatusFlash = 5;
      return;
    }
    audioEnabled = !audioEnabled;
    showAudioStatusFlash = 5;
    canvas.setAttribute("aria-label", audioEnabled ? "Audio enabled" : "Audio disabled");
    try {
      if (audioEnabled) {
        // resume context and start ambient
        audioContext
          .resume()
          .then(() => {
            startAmbient();
          })
          .catch(() => {
            startAmbient();
          });
      } else {
        stopAmbient();
      }
    } catch (e) {
      console.warn("toggleAudio error:", e);
    }
  }

  // Restart game (reset state)
  function restartGame() {
    score = 0;
    wrongs = 0;
    resetPlayer();
    spawnQuestion();
    gameState = "playing";
    running = true;
    lastTime = performance.now();
    // restart ambient if audio on
    if (audioEnabled) startAmbient();
    requestAnimationFrame(loop);
  }

  // Initial draw for start screen (improved visuals)
  function initialDraw() {
    // background
    drawBackground(0.016);
    // big friendly drone floating center-left
    resetPlayer();
    player.x = WIDTH / 3;
    player.y = HEIGHT / 2 - 20;
    drawPlayer(0.016);
    // a couple of decorative balloons (non-interactive)
    balloons = [
      { x: WIDTH * 0.62, y: HEIGHT * 0.33, r: 22, vx: 0, vy: 0, value: 7, wobble: 0, color: pastelColor(1), shine: 0.6 },
      { x: WIDTH * 0.75, y: HEIGHT * 0.45, r: 22, vx: 0, vy: 0, value: 3, wobble: 0, color: pastelColor(2), shine: 0.6 }
    ];
    drawBalloons(0.016);

    // Title and instructions
    ctx.font = IMPORTANT_FONT;
    ctx.fillStyle = "#073146";
    const title = "Drone Math Collector";
    const titleW = ctx.measureText(title).width;
    ctx.fillText(title, (WIDTH - titleW) / 2, 80);

    // Description box bottom
    ctx.font = BODY_FONT;
    const lines = [
      "Welcome! Help your friendly drone collect the correct numbers to solve math questions.",
      `Collect ${TARGET_SCORE} correct balloons to win. ${MAX_WRONG} wrong picks and it's game over.`,
      "Use arrow keys to fly, or tap/click. Press Space to start.",
      "Press M to toggle audio."
    ];
    let maxW = 0;
    for (const l of lines) {
      const m = ctx.measureText(l).width;
      if (m > maxW) maxW = m;
    }
    const w = Math.min(WIDTH - 40, maxW + 24);
    const h = lines.length * 20 + 20;
    const x = (WIDTH - w) / 2;
    const y = HEIGHT - h - PADDING;
    roundRectFill(x, y, w, h, 12, "rgba(255,255,255,0.92)");
    ctx.fillStyle = "#073146";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + 12, y + 18 + i * 20);
    }

    // Draw UI elements on top
    drawUI();
  }

  // Kick off initial screen
  initialDraw();

  // Set focus to canvas for keyboard
  canvas.focus();

  // Accessibility: inform if audio unavailable
  if (!audioContext) {
    canvas.setAttribute("aria-label", "Audio unavailable in this browser. Use M to toggle (disabled).");
  } else {
    // Start ambient for the start screen if audio enabled
    if (audioEnabled) {
      startAmbient();
    }
  }

  // Protect against page unload without stopping audio etc.
  window.addEventListener("blur", () => {
    // nothing heavy to do; stop ambient to be polite
    try {
      if (audioContext && audioEnabled) stopAmbient();
    } catch (e) {}
  });

  // Provide a lightweight polyfill for ctx.roundRect if not present
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const ctx = this;
      const r0 = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
      ctx.beginPath();
      ctx.moveTo(x + r0, y);
      ctx.arcTo(x + w, y, x + w, y + h, r0);
      ctx.arcTo(x + w, y + h, x, y + h, r0);
      ctx.arcTo(x, y + h, x, y, r0);
      ctx.arcTo(x, y, x + w, y, r0);
      ctx.closePath();
    };
  }
})();