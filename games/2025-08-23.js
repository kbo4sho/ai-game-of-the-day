(function () {
  // Enhanced Electricity Math Game - Visual & Audio Improvements Only
  // Renders inside element with ID "game-of-the-day-stage"
  // Canvas-only visuals and Web Audio API sounds
  // Accessible with keyboard, has ARIA status, and error handling for audio

  // Config
  const WIDTH = 720;
  const HEIGHT = 480;
  const CONTAINER_ID = "game-of-the-day-stage";
  const MAX_ORBS = 7;
  const ROBOT_SPEED = 160; // pixels per second
  const ORB_RADIUS = 20;
  const ROBOT_RADIUS = 24;
  const BG_COLOR = "#edf6fb";
  const ORB_COLORS = ["#FFD166", "#06D6A0", "#118AB2", "#EF476F", "#06B6D4", "#7C4DFF"];
  const FONT = "16px Georgia";
  const TITLE_FONT = "26px Georgia";
  const SMALL_FONT = "14px Georgia";

  // State
  let container;
  let canvas;
  let ctx;
  let lastTime = 0;
  let rafId;
  let keys = {};
  let gameState = "title"; // title, playing, success
  let robot = {
    x: WIDTH / 2,
    y: HEIGHT - 80,
    r: ROBOT_RADIUS,
    vx: 0,
    vy: 0,
    bob: 0
  };
  let orbs = [];
  let collected = []; // orb indices
  let target = 0;
  let statusMessage = "";
  let level = 1;
  let audioAvailable = false;
  let audioEnabled = true;
  let audioCtx = null;
  let humGainNode = null;
  let ambientNodes = []; // additional ambient nodes
  let speakerIconHover = false;
  let sparks = []; // visual particle sparks
  let accessibleStatusEl;
  let gridOffset = 0;
  let softParticles = []; // background floating particles
  let shakeScreen = 0;

  // Utility helpers
  function randRange(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function safeCall(fn) {
    try {
      fn();
    } catch (e) {
      console.warn("SafeCall error:", e);
    }
  }

  // Audio helpers with proper error handling
  function initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("Web Audio API not supported");
      audioCtx = new AudioContext();
      audioAvailable = true;
      // gentle ambient pad + hum using layered oscillators and filters
      try {
        // master gain for ambient
        const masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.015; // gentle overall volume
        masterGain.connect(audioCtx.destination);
        humGainNode = masterGain;

        // create two detuned oscillators for a soft pad
        const oscA = audioCtx.createOscillator();
        const oscB = audioCtx.createOscillator();
        const gainA = audioCtx.createGain();
        const gainB = audioCtx.createGain();
        const lp = audioCtx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 800;
        lp.Q.value = 0.7;

        oscA.type = "sine";
        oscB.type = "sine";
        oscA.frequency.value = 55; // low pad
        oscB.frequency.value = 57; // slight detune for warmth
        gainA.gain.value = 0.6;
        gainB.gain.value = 0.4;

        // slight tremolo LFO for movement
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.value = 0.15;
        lfoGain.gain.value = 0.004;

        // connect chain
        oscA.connect(gainA);
        oscB.connect(gainB);
        gainA.connect(lp);
        gainB.connect(lp);
        lp.connect(masterGain);

        // LFO modulates master gain
        lfo.connect(lfoGain);
        lfoGain.connect(masterGain.gain);

        oscA.start();
        oscB.start();
        lfo.start();

        ambientNodes = [oscA, oscB, lfo, gainA, gainB, lp, masterGain];

        // keep muted until user allows audio via toggle or gesture
        setHumOn(audioEnabled);
      } catch (err) {
        console.warn("Ambient init error:", err);
      }
    } catch (err) {
      console.warn("Audio init failed:", err);
      audioAvailable = false;
      audioCtx = null;
    }
  }

  function resumeAudioContextIfNeeded() {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => {
        console.warn("Audio resume failed:", e);
      });
    }
  }

  function setHumOn(on) {
    if (!audioAvailable || !humGainNode) return;
    try {
      const target = on ? 0.015 : 0.0;
      humGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      humGainNode.gain.setTargetAtTime(target, audioCtx.currentTime + 0.01, 0.2);
    } catch (err) {
      console.warn("setHumOn error:", err);
    }
  }

  // Create a short beep using oscillator with simple ADSR
  function playBeep(freq = 440, time = 0.12, type = "sine", volume = 0.08) {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filt = audioCtx.createBiquadFilter();
      filt.type = "highpass";
      filt.frequency.value = 220;
      o.type = type;
      o.frequency.value = freq * (0.98 + Math.random() * 0.04);
      g.gain.value = 0.0001;
      o.connect(filt);
      filt.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      // ADSR-ish
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + time);
      o.start(now);
      o.stop(now + time + 0.02);
      // cleanup on ended
      setTimeout(() => {
        try {
          o.disconnect();
          g.disconnect();
          filt.disconnect();
        } catch (e) {}
      }, (time + 0.05) * 1000);
    } catch (err) {
      console.warn("playBeep error", err);
    }
  }

  // Collect 'zap' sound - bright, short
  function playZap(freq = 720, time = 0.18, volume = 0.09) {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const band = audioCtx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = freq;
      band.Q.value = 8;

      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sawtooth";
      o.frequency.value = freq;
      g.gain.value = 0.0001;

      o.connect(band);
      band.connect(g);
      g.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + time);

      o.start(now);
      o.stop(now + time + 0.02);
    } catch (err) {
      console.warn("playZap error", err);
    }
  }

  // Chime for success (harmonic cluster)
  function playChime() {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const base = 660;
      const freqs = [base, base * 1.25, base * 1.5];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const filt = audioCtx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 1200;
        o.type = i === 1 ? "triangle" : "sine";
        o.frequency.value = f;
        g.gain.value = 0.0001;
        o.connect(filt);
        filt.connect(g);
        g.connect(audioCtx.destination);
        const t = now + i * 0.06;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9 + i * 0.2);
        o.start(t);
        o.stop(t + 1.2 + i * 0.2);
      });
    } catch (err) {
      console.warn("playChime error", err);
    }
  }

  // Buzz for error (softer)
  function playBuzz() {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filt = audioCtx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 900;
      o.type = "square";
      o.frequency.value = 140 + Math.random() * 40;
      g.gain.value = 0.0001;
      o.connect(filt);
      filt.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      o.start(now);
      o.stop(now + 0.3);
    } catch (err) {
      console.warn("playBuzz error", err);
    }
  }

  // announce for screen readers
  function announce(text) {
    if (accessibleStatusEl) {
      accessibleStatusEl.textContent = text;
    }
  }

  // DOM & Canvas Setup
  function initDOM() {
    container = document.getElementById(CONTAINER_ID);
    if (!container) {
      console.error("Container element with ID", CONTAINER_ID, "not found.");
      return;
    }
    // Clear container
    container.innerHTML = "";
    container.style.position = "relative";
    container.style.width = WIDTH + "px";
    container.style.height = HEIGHT + "px";
    container.style.userSelect = "none";

    // Create canvas
    canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.setAttribute("aria-label", "Electric Sparks Math Game");
    canvas.style.outline = "none";
    canvas.tabIndex = 0; // make focusable
    container.appendChild(canvas);
    // alpha true for soft glows
    ctx = canvas.getContext("2d", { alpha: true });

    // Accessible live region (offscreen)
    accessibleStatusEl = document.createElement("div");
    accessibleStatusEl.setAttribute("role", "status");
    accessibleStatusEl.setAttribute("aria-live", "polite");
    accessibleStatusEl.style.position = "absolute";
    accessibleStatusEl.style.left = "-9999px";
    accessibleStatusEl.style.width = "1px";
    accessibleStatusEl.style.height = "1px";
    container.appendChild(accessibleStatusEl);
  }

  // Level generation guaranteeing solvable target (subset sum)
  function generateLevel() {
    orbs = [];
    collected = [];
    // Create orb values
    for (let i = 0; i < MAX_ORBS; i++) {
      const v = randRange(1, 9);
      const x = randRange(60, WIDTH - 60);
      const y = randRange(120, HEIGHT - 160);
      const color = ORB_COLORS[i % ORB_COLORS.length];
      orbs.push({
        x,
        y,
        origX: x,
        origY: y,
        yOffset: 0,
        value: v,
        color,
        r: ORB_RADIUS,
        collected: false,
        phase: Math.random() * Math.PI * 2
      });
    }
    // pick random subset to be target
    const indices = [];
    for (let i = 0; i < orbs.length; i++) indices.push(i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const subsetCount = randRange(2, 4);
    const subset = indices.slice(0, subsetCount);
    target = subset.reduce((s, idx) => s + orbs[idx].value, 0);
    // Slightly move orbs if overlap
    for (let i = 0; i < orbs.length; i++) {
      for (let j = i + 1; j < orbs.length; j++) {
        const a = orbs[i];
        const b = orbs[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < a.r + b.r + 6) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x) || Math.random() * Math.PI * 2;
          b.x += Math.cos(angle) * (a.r + b.r + 8 - d);
          b.y += Math.sin(angle) * (a.r + b.r + 8 - d);
          b.x = clamp(b.x, 60, WIDTH - 60);
          b.y = clamp(b.y, 120, HEIGHT - 160);
        }
      }
    }

    // rebuild soft background particles
    softParticles = [];
    for (let i = 0; i < 18; i++) {
      softParticles.push({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        r: 6 + Math.random() * 14,
        alpha: 0.02 + Math.random() * 0.06,
        vy: 2 + Math.random() * 6,
        hue: 190 + Math.random() * 60
      });
    }

    statusMessage = `Level ${level}: Power the house with ${target} energy. Collect orbs that add to ${target}. Use arrows or WASD to move. Press Backspace to undo last orb. Press M to toggle sound.`;
    announce(statusMessage);
    robot.x = WIDTH / 2;
    robot.y = HEIGHT - 80;
    sparks = [];
    shakeScreen = 0;
  }

  // Input handling
  function setupInput() {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      keys[e.key.toLowerCase()] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Backspace"].includes(e.key)) {
        e.preventDefault();
      }
      resumeAudioContextIfNeeded();

      if (e.key === "m" || e.key === "M") {
        audioEnabled = !audioEnabled;
        setHumOn(audioEnabled);
        announce("Sound " + (audioEnabled ? "on" : "off"));
      }

      if (gameState === "title" && (e.key === "Enter" || e.key === " ")) {
        startGame();
      } else if (gameState === "success") {
        if (e.key === "Enter" || e.key === " ") {
          level++;
          generateLevel();
          gameState = "playing";
        }
      } else if (gameState === "playing") {
        if (e.key === "Backspace" || e.key === "Delete") {
          undoLastOrb();
        } else if (e.key === "r" || e.key === "R") {
          level = 1;
          startGame();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener("click", (e) => {
      canvas.focus();
      resumeAudioContextIfNeeded();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (mx > WIDTH - 60 && my < 40) {
        audioEnabled = !audioEnabled;
        setHumOn(audioEnabled);
        announce("Sound " + (audioEnabled ? "on" : "off"));
      } else if (gameState === "title") {
        startGame();
      } else if (gameState === "success") {
        level++;
        generateLevel();
        gameState = "playing";
      }
    });

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      speakerIconHover = mx > WIDTH - 60 && my < 40;
    });

    canvas.addEventListener("touchstart", (e) => {
      resumeAudioContextIfNeeded();
      if (e.touches.length > 0) {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = t.clientX - rect.left;
        const my = t.clientY - rect.top;
        if (mx > WIDTH - 60 && my < 40) {
          audioEnabled = !audioEnabled;
          setHumOn(audioEnabled);
          announce("Sound " + (audioEnabled ? "on" : "off"));
        } else {
          robot.x = clamp(mx, robot.r, WIDTH - robot.r);
          robot.y = clamp(my, robot.r, HEIGHT - robot.r);
        }
      }
    });
  }

  // Undo last collected orb
  function undoLastOrb() {
    if (collected.length === 0) {
      statusMessage = "No orbs to undo.";
      announce(statusMessage);
      playBuzz();
      return;
    }
    const lastIndex = collected.pop();
    const orb = orbs[lastIndex];
    orb.collected = false;
    orb.x = orb.origX;
    orb.y = orb.origY;
    statusMessage = `Removed orb ${orb.value}. Current total: ${getCollectedSum()}.`;
    announce(statusMessage);
    playBeep(240, 0.12, "sine", 0.06);
  }

  function getCollectedSum() {
    return collected.reduce((s, idx) => s + orbs[idx].value, 0);
  }

  // Collect orb when robot touches
  function tryCollectOrb(idx) {
    const orb = orbs[idx];
    if (orb.collected) return;
    orb.collected = true;
    collected.push(idx);
    // audio zap and sparkle
    playZap(420 + orb.value * 30, 0.16, 0.08);
    // create sparks
    for (let i = 0; i < 10; i++) {
      sparks.push({
        x: orb.x,
        y: orb.y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.8) * 120,
        life: 0.4 + Math.random() * 0.8,
        color: orb.color,
        size: 2 + Math.random() * 3
      });
    }
    // small particle burst for soft background
    for (let i = 0; i < 6; i++) {
      softParticles.push({
        x: orb.x,
        y: orb.y,
        r: 6 + Math.random() * 10,
        alpha: 0.06,
        vy: -10 - Math.random() * 20,
        hue: 200 + Math.random() * 80
      });
    }

    const sum = getCollectedSum();
    statusMessage = `Picked ${orb.value}. Current total: ${sum}.`;
    announce(statusMessage);
    // Check win or over
    if (sum === target) {
      playChime();
      gameState = "success";
      statusMessage = `Great! You powered the house with exactly ${target} energy! Press Enter to continue.`;
      announce(statusMessage);
    } else if (sum > target) {
      playBuzz();
      statusMessage = `Too much energy! You have ${sum}, target is ${target}. Undo the last orb with Backspace.`;
      announce(statusMessage);
      shakeScreen = 8;
    }
  }

  // Draw helpers - enhanced visuals
  function clearScreen() {
    // soft gradient background with subtle vignette
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, "#eaf6fb");
    grad.addColorStop(0.6, "#e6f2f7");
    grad.addColorStop(1, "#dff0f6");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle vignette
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    const vg = ctx.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      80,
      WIDTH / 2,
      HEIGHT / 2,
      Math.max(WIDTH, HEIGHT)
    );
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(1, "rgba(6,50,60,0.03)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  function drawSoftParticles(delta) {
    for (let i = softParticles.length - 1; i >= 0; i--) {
      const p = softParticles[i];
      p.y += p.vy ? p.vy * delta : (0.5 + Math.sin(Date.now() / 2000 + i) * 0.5) * delta * 20;
      p.x += Math.sin(Date.now() / 2000 + i) * 0.02 * delta * 100;
      p.alpha *= 0.999;
      if (p.y < -40 || p.y > HEIGHT + 40 || p.alpha < 0.005) {
        softParticles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue || 200}, 80%, 60%, ${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // gently add particles occasionally
    if (Math.random() < 0.02) {
      softParticles.push({
        x: Math.random() * WIDTH,
        y: HEIGHT + 20,
        r: 8 + Math.random() * 18,
        alpha: 0.02 + Math.random() * 0.06,
        vy: -10 - Math.random() * 20,
        hue: 190 + Math.random() * 60
      });
    }
  }

  function drawCircuitGrid(delta) {
    gridOffset += delta * 12;
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#073b4c";
    ctx.lineWidth = 1;
    // diagonal circuit lines
    const spacing = 40;
    for (let x = -WIDTH; x < WIDTH * 2; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + (gridOffset % spacing), 0);
      ctx.lineTo(x + (gridOffset % spacing) - HEIGHT, HEIGHT);
      ctx.stroke();
    }
    // faint horizontal connectors
    for (let y = 80; y < HEIGHT; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(Date.now() / 1000 + y) * 3);
      ctx.lineTo(WIDTH, y + Math.cos(Date.now() / 1000 + y) * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeader() {
    // Title bar with soft rounded panel
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    roundRect(ctx, 12, 10, WIDTH - 24, 60, 10);
    ctx.fill();

    ctx.fillStyle = "#073b4c";
    ctx.font = TITLE_FONT;
    ctx.textAlign = "left";
    ctx.fillText("Sparky Circuit: Add the Energy!", 28, 40);

    // Speaker icon (refined)
    const sx = WIDTH - 46;
    const sy = 18;
    ctx.save();
    ctx.translate(sx, sy);
    // icon background
    ctx.beginPath();
    ctx.fillStyle = speakerIconHover ? "rgba(255,209,102,0.18)" : "rgba(255,255,255,0.0)";
    ctx.fillRect(-6, -12, 48, 32);

    // sleek speaker body
    ctx.fillStyle = audioAvailable ? (audioEnabled ? "#06D6A0" : "#EF476F") : "#999";
    roundRect(ctx, 0, -6, 12, 24, 3);
    ctx.fill();

    // speaker cone
    ctx.beginPath();
    ctx.moveTo(12, -6);
    ctx.lineTo(26, -14);
    ctx.lineTo(26, 14);
    ctx.lineTo(12, 6);
    ctx.closePath();
    ctx.fill();

    // sound waves if enabled
    if (audioAvailable && audioEnabled) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(30, 0, 8 + Math.sin(Date.now() / 200) * 1.5, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();

    // small controls hint
    ctx.font = SMALL_FONT;
    ctx.fillStyle = "#073b4c";
    ctx.textAlign = "left";
    ctx.fillText("Use arrows/WASD to move • Backspace to undo • M toggles sound", 28, 62);
    ctx.restore();
  }

  function drawHouse() {
    const hx = 80;
    const hy = 130;
    const hw = 120;
    const hh = 100;

    // soft halo behind the house
    const halo = ctx.createRadialGradient(
      hx + hw / 2,
      hy + hh / 2 - 20,
      10,
      hx + hw / 2,
      hy + hh / 2 - 20,
      140
    );
    halo.addColorStop(0, "rgba(255,220,120,0.45)");
    halo.addColorStop(1, "rgba(255,220,120,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(hx - 60, hy - 80, hw + 140, hh + 160);

    // house body with soft border
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, hx, hy, hw, hh, 8);
    ctx.fillStyle = "#fff7e6";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#f1c27d";
    ctx.stroke();

    // roof - shaded gradient
    const roofGrad = ctx.createLinearGradient(hx, hy - 40, hx + hw, hy);
    roofGrad.addColorStop(0, "#ef476f");
    roofGrad.addColorStop(1, "#d04264");
    ctx.fillStyle = roofGrad;
    ctx.beginPath();
    ctx.moveTo(hx - 12, hy);
    ctx.lineTo(hx + hw / 2, hy - 48);
    ctx.lineTo(hx + hw + 12, hy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.stroke();

    // door with little glow if enough orbs
    ctx.beginPath();
    roundRect(ctx, hx + hw / 2 - 14, hy + hh - 42, 28, 42, 6);
    ctx.fillStyle = "#6e3eff";
    ctx.fill();

    // windows
    ctx.fillStyle = "#fff";
    roundRect(ctx, hx + 18, hy + 20, 22, 18, 3);
    roundRect(ctx, hx + hw - 40, hy + 20, 22, 18, 3);
    ctx.fillStyle = "#073b4c";
    ctx.fillRect(hx + 22, hy + 24, 6, 6);
    ctx.fillRect(hx + hw - 36, hy + 24, 6, 6);

    // smiling mouth - happier when powered exactly
    const sum = getCollectedSum();
    ctx.beginPath();
    ctx.strokeStyle = sum === target && sum > 0 ? "#06D6A0" : "#073b4c";
    ctx.lineWidth = 3;
    ctx.arc(hx + hw / 2, hy + hh / 2 + 12, 22, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // power bolt indicator (animated) above chimney
    const boltX = hx + hw + 6;
    const boltY = hy + 10;
    ctx.beginPath();
    ctx.moveTo(boltX, boltY);
    ctx.lineTo(boltX - 8, boltY + 22 + Math.sin(Date.now() / 280) * 4);
    ctx.lineTo(boltX + 4, boltY + 22);
    ctx.lineTo(boltX - 2, boltY + 40);
    ctx.lineTo(boltX + 14, boltY + 18);
    ctx.closePath();
    ctx.fillStyle = sum === target && sum > 0 ? "#06D6A0" : "#ffd166";
    ctx.fill();
    ctx.restore();

    // labels
    ctx.font = FONT;
    ctx.fillStyle = "#073b4c";
    ctx.textAlign = "left";
    ctx.fillText("House needs:", hx, hy + hh + 30);
    ctx.font = "22px Georgia";
    ctx.fillStyle = "#ef476f";
    ctx.fillText(target + " energy", hx + 110, hy + hh + 30);
  }

  // Draw robot character 'Volt' - friendlier with limbs and glow
  function drawRobot(delta) {
    robot.bob = Math.sin(Date.now() / 300) * 2;
    // shadow
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.ellipse(robot.x, robot.y + robot.r + 18, robot.r + 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // body with gradient
    const g = ctx.createLinearGradient(
      robot.x - robot.r,
      robot.y - robot.r,
      robot.x + robot.r,
      robot.y + robot.r
    );
    g.addColorStop(0, "#06B6D4");
    g.addColorStop(1, "#0ea5b5");
    ctx.beginPath();
    ctx.fillStyle = g;
    ctx.arc(robot.x, robot.y + Math.sin(Date.now() / 240) * 1.5, robot.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(3,59,76,0.18)";
    ctx.stroke();

    // face plate
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, robot.x - 14, robot.y - 10, 28, 12, 4);
    ctx.fill();

    // eyes as glowing LEDs
    ctx.beginPath();
    ctx.fillStyle = "#073b4c";
    ctx.fillRect(robot.x - 8, robot.y - 8, 5, 6);
    ctx.fillRect(robot.x + 3, robot.y - 8, 5, 6);
    ctx.beginPath();
    ctx.fillStyle = "#ffd166";
    ctx.arc(
      robot.x - 5,
      robot.y - 6,
      1.6 + Math.abs(Math.sin(Date.now() / 160)) * 0.8,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#ffd166";
    ctx.arc(
      robot.x + 6,
      robot.y - 6,
      1.6 + Math.abs(Math.cos(Date.now() / 160)) * 0.8,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // smile
    ctx.beginPath();
    ctx.strokeStyle = "#073b4c";
    ctx.lineWidth = 2;
    ctx.arc(robot.x, robot.y + 4, 8, 0, Math.PI, false);
    ctx.stroke();

    // antenna with soft glow
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,209,102,0.9)";
    ctx.lineWidth = 3;
    ctx.moveTo(robot.x + 12, robot.y - robot.r + 6);
    ctx.lineTo(robot.x + 18, robot.y - robot.r - 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,209,102,0.95)";
    ctx.arc(robot.x + 18, robot.y - robot.r - 18, 5, 0, Math.PI * 2);
    ctx.fill();

    // subtle electric aura
    ctx.beginPath();
    ctx.fillStyle = "rgba(6,214,160,0.04)";
    ctx.arc(
      robot.x,
      robot.y,
      robot.r + 18 + Math.sin(Date.now() / 250) * 2,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
  }

  // Draw orbs (collected ones fade/float near top right)
  function drawOrbs(delta) {
    // animate y offset for orbs
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      if (!o.collected) {
        o.yOffset = Math.sin(Date.now() / 700 + o.phase) * 6;
        // subtle horizontal bob
        o.x += Math.sin(Date.now() / 1500 + o.phase) * 0.02;
      } else {
        // animate collected orb to the top-right HUD region
        const idxInCollected = collected.indexOf(i);
        const vxTarget = WIDTH - 200 + idxInCollected * 36;
        const vyTarget = 92;
        // approach target location
        o.x += (vxTarget - o.x) * 6 * delta;
        o.y += (vyTarget - o.y) * 6 * delta;
      }
    }

    // draw orbs with glow and electric rings
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      const ox = o.x;
      const oy = o.y + o.yOffset;
      ctx.save();
      // outer glow
      ctx.beginPath();
      ctx.fillStyle = o.color;
      ctx.globalAlpha = 0.12;
      ctx.arc(ox, oy, o.r + 12 + Math.sin(Date.now() / 400 + i) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // main orb
      const grad = ctx.createRadialGradient(ox - 6, oy - 6, 2, ox, oy, o.r + 8);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.25, "rgba(255,255,255,0.7)");
      grad.addColorStop(1, o.color);
      ctx.beginPath();
      ctx.fillStyle = grad;
      ctx.arc(ox, oy, o.r, 0, Math.PI * 2);
      ctx.fill();
      // rim
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(7,59,76,0.7)";
      ctx.stroke();
      // number
      ctx.fillStyle = "#073b4c";
      ctx.font = "bold 18px Georgia";
      ctx.textAlign = "center";
      ctx.fillText(String(o.value), ox, oy + 6);

      // electric halo - thin rings
      if (!o.collected) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(6,214,160,0.12)";
        ctx.lineWidth = 6;
        ctx.arc(ox, oy, o.r + 18, 0, Math.PI * 2);
        ctx.stroke();
        // small spark arcs
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 2;
        ctx.arc(
          ox + Math.sin(Date.now() / 220 + i) * 3,
          oy + Math.cos(Date.now() / 220 + i) * 3,
          o.r + 10,
          0.1,
          1.9
        );
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Draw HUD showing collected sum and collected orbs icons
  function drawHUD(delta) {
    // HUD panel
    ctx.save();
    const hx = WIDTH - 260;
    ctx.globalAlpha = 0.88;
    roundRect(ctx, hx - 8, 64, 244, 68, 8);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.globalAlpha = 1;

    // text
    ctx.textAlign = "left";
    ctx.font = "18px Georgia";
    ctx.fillStyle = "#073b4c";
    ctx.fillText("Collected total: " + getCollectedSum(), WIDTH - 252, 84);

    // small slot for each collected orb
    for (let i = 0; i < collected.length; i++) {
      const idx = collected[i];
      const ox = WIDTH - 200 + i * 36;
      const oy = 92;
      ctx.beginPath();
      ctx.fillStyle = orbs[idx].color;
      ctx.strokeStyle = "#073b4c";
      ctx.lineWidth = 1.5;
      ctx.arc(ox, oy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#073b4c";
      ctx.font = "bold 14px Georgia";
      ctx.textAlign = "center";
      ctx.fillText(String(orbs[idx].value), ox, oy + 5);
    }
    ctx.restore();
  }

  // Draw recycle bin
  function drawBin() {
    const bx = WIDTH - 80;
    const by = HEIGHT - 72;
    ctx.save();
    // soft shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.ellipse(bx, by + 10, 46, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // bin box with gradient
    const g = ctx.createLinearGradient(bx - 30, by - 20, bx + 30, by + 40);
    g.addColorStop(0, "#dfe6f2");
    g.addColorStop(1, "#b8bedd");
    roundRect(ctx, bx - 28, by - 10, 56, 48, 6);
    ctx.fillStyle = g;
    ctx.fill();

    // lid
    ctx.fillStyle = "#9aa0b4";
    roundRect(ctx, bx - 34, by - 24, 68, 12, 6);
    ctx.fill();

    // label
    ctx.fillStyle = "#073b4c";
    ctx.font = "12px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("Recycle", bx, by + 44);
    ctx.font = "12px Georgia";
    ctx.fillText("Backspace to undo", bx, by + 58);
    ctx.restore();
  }

  // Sparks particles
  function updateSparks(delta) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= delta;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * delta;
      s.y += s.vy * delta;
      s.vy += 140 * delta; // gravity-ish stronger
      s.vx *= 0.99;
    }
  }

  function drawSparks() {
    for (const s of sparks) {
      ctx.beginPath();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = Math.max(0.12, s.life);
      ctx.arc(s.x, s.y, s.size || 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // utility: rounded rectangle
  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  // Main update/draw loop
  function gameLoop(ts) {
    if (!lastTime) lastTime = ts;
    const delta = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;

    // Update
    if (gameState === "playing") {
      // movement
      let moveX = 0;
      let moveY = 0;
      if (keys["arrowleft"] || keys["a"]) moveX -= 1;
      if (keys["arrowright"] || keys["d"]) moveX += 1;
      if (keys["arrowup"] || keys["w"]) moveY -= 1;
      if (keys["arrowdown"] || keys["s"]) moveY += 1;
      const len = Math.hypot(moveX, moveY) || 1;
      robot.x += (moveX / len) * ROBOT_SPEED * delta;
      robot.y += (moveY / len) * ROBOT_SPEED * delta;
      robot.x = clamp(robot.x, robot.r, WIDTH - robot.r);
      robot.y = clamp(robot.y, robot.r, HEIGHT - robot.r);

      // Check collisions with orbs
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        if (!o.collected) {
          if (dist(robot.x, robot.y, o.x, o.y + o.yOffset) < robot.r + o.r - 4) {
            tryCollectOrb(i);
          }
        }
      }

      updateSparks(delta);
      // decay screen shake
      if (shakeScreen > 0) shakeScreen = Math.max(0, shakeScreen - 0.6 * delta * 60);
    }

    // Draw
    clearScreen();
    drawSoftParticles(delta);
    drawCircuitGrid(delta);

    // optional screen shake
    ctx.save();
    if (shakeScreen > 0) {
      const sx = (Math.random() - 0.5) * shakeScreen;
      const sy = (Math.random() - 0.5) * shakeScreen;
      ctx.translate(sx, sy);
    }

    drawHeader();
    drawHouse();
    drawOrbs(delta);
    drawBin();
    drawRobot(delta);
    drawSparks();
    drawHUD(delta);

    // bottom instructions / status message
    ctx.fillStyle = "rgba(7,59,76,0.9)";
    ctx.font = FONT;
    ctx.textAlign = "left";
    const clipped = statusMessage.length > 110 ? statusMessage.slice(0, 107) + "..." : statusMessage;
    ctx.fillText(clipped, 18, HEIGHT - 18);

    ctx.restore();

    // Title / success overlays (kept simple and calm)
    if (gameState === "title") {
      ctx.save();
      ctx.fillStyle = "rgba(3,59,76,0.6)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#fff";
      ctx.font = "38px Georgia";
      ctx.textAlign = "center";
      ctx.fillText("Spark & Volt", WIDTH / 2, HEIGHT / 2 - 40);
      ctx.font = "18px Georgia";
      ctx.fillText("Help Volt collect orbs that add up to power the house!", WIDTH / 2, HEIGHT / 2 - 6);
      ctx.fillStyle = "#ffd166";
      roundRect(ctx, WIDTH / 2 - 92, HEIGHT / 2 + 18, 184, 44, 8);
      ctx.fill();
      ctx.fillStyle = "#073b4c";
      ctx.font = "20px Georgia";
      ctx.fillText("Start Game", WIDTH / 2, HEIGHT / 2 + 44);
      ctx.font = "14px Georgia";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText("Press Enter or click to begin", WIDTH / 2, HEIGHT / 2 + 74);
      ctx.restore();
    } else if (gameState === "success") {
      ctx.save();
      ctx.fillStyle = "rgba(6,214,160,0.08)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#073b4c";
      ctx.font = "28px Georgia";
      ctx.textAlign = "center";
      ctx.fillText("Great job!", WIDTH / 2, HEIGHT / 2 - 16);
      ctx.font = "18px Georgia";
      ctx.fillText(`You powered the house with ${target} energy!`, WIDTH / 2, HEIGHT / 2 + 12);
      ctx.fillStyle = "#ffd166";
      roundRect(ctx, WIDTH / 2 - 120, HEIGHT / 2 + 28, 240, 42, 8);
      ctx.fill();
      ctx.fillStyle = "#073b4c";
      ctx.font = "20px Georgia";
      ctx.fillText("Next Level", WIDTH / 2, HEIGHT / 2 + 58);
      ctx.font = "14px Georgia";
      ctx.fillStyle = "#073b4c";
      ctx.fillText("Press Enter or click to play the next level", WIDTH / 2, HEIGHT / 2 + 88);
      ctx.restore();
    }

    rafId = requestAnimationFrame(gameLoop);
  }

  function startGame() {
    if (!audioCtx) initAudio();
    resumeAudioContextIfNeeded();
    level = 1;
    generateLevel();
    gameState = "playing";
    announce(statusMessage);
  }

  // Initialize and start
  function init() {
    initDOM();
    initAudio();
    setupInput();
    statusMessage =
      "Press Enter or click to start. Help Volt (the friendly robot) collect energy orbs to power the house.";
    announce(statusMessage);
    gameState = "title";
    lastTime = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(gameLoop);
  }

  // Start with error handling
  try {
    init();
  } catch (err) {
    console.error("Game initialization error:", err);
    if (container) {
      container.innerHTML = "";
      const message = document.createElement("div");
      message.style.width = WIDTH + "px";
      message.style.height = HEIGHT + "px";
      message.style.display = "flex";
      message.style.alignItems = "center";
      message.style.justifyContent = "center";
      message.style.background = "#fff3cd";
      message.style.color = "#856404";
      message.textContent =
        "An error occurred while loading the game. Please try refreshing the page.";
      container.appendChild(message);
    }
  }
})();