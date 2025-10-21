(function () {
  // Configuration (do not change game mechanics constants)
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_GOAL = 10;
  const MAX_WRONG = 3;
  const DRONE_SPEED = 220;
  const CRATE_COUNT = 4;
  const CRATE_MIN = 1;
  const CRATE_MAX = 15;
  const UI_PADDING = 10;
  const SCORE_FONT = "18px Inter, system-ui, sans-serif";
  const BODY_FONT = "16px Inter, system-ui, sans-serif";
  const TITLE_FONT = "22px Inter, system-ui, sans-serif";

  // Get container and create canvas
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container element with ID 'game-of-the-day-stage' not found.");
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Drone Math Adventure. Use arrow keys or WASD to move. Press space or click crates to collect answers."
  );
  canvas.style.outline = "none";
  container.innerHTML = "";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Audio setup with robust error handling
  let audioCtx = null;
  let audioAllowed = false;
  let audioUnavailable = false;

  const createAudioContext = () => {
    if (audioCtx || audioUnavailable) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error("Web Audio API not supported");
      audioCtx = new Ctx();
      // resume if suspended (user gesture needed on some browsers)
      if (audioCtx.state === "suspended") {
        audioCtx
          .resume()
          .then(() => {
            audioAllowed = true;
          })
          .catch((e) => {
            console.warn("Audio context resume failed:", e);
            audioAllowed = false;
          });
      } else {
        audioAllowed = true;
      }
    } catch (e) {
      console.error("Audio context creation failed:", e);
      audioUnavailable = true;
      audioCtx = null;
      audioAllowed = false;
    }
  };

  const requireAudioGesture = () => {
    if (!audioCtx) createAudioContext();
  };

  // Sound helpers
  function safeTry(fn) {
    try {
      fn();
    } catch (e) {
      console.warn("Audio operation failed:", e);
    }
  }

  function playTone(frequency = 440, duration = 0.2, type = "sine", volume = 0.06, attack = 0.01) {
    if (!audioCtx || !audioAllowed) return;
    safeTry(() => {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const env = gain.gain;
      osc.type = type;
      osc.frequency.value = frequency;
      env.setValueAtTime(0.0001, now);
      env.linearRampToValueAtTime(volume, now + attack);
      env.exponentialRampToValueAtTime(0.0001, now + duration + 0.01);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    });
  }

  // Improved positive sound (gentle harmonic pickup)
  function playPositiveSound() {
    if (!audioCtx || !audioAllowed) return;
    safeTry(() => {
      const now = audioCtx.currentTime;
      // short arpeggio with two detuned oscillators
      const freqs = [440, 550, 660];
      freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = i === 2 ? "sine" : "triangle";
        osc.frequency.value = f;
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0.0001, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.06, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.28);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.32);
      });
    });
  }

  // Improved negative sound (short thud + soft buzz)
  function playNegativeSound() {
    if (!audioCtx || !audioAllowed) return;
    safeTry(() => {
      const now = audioCtx.currentTime;
      // thud (low sine)
      const thudO = audioCtx.createOscillator();
      const thudG = audioCtx.createGain();
      thudO.type = "sine";
      thudO.frequency.value = 120;
      thudG.gain.setValueAtTime(0.0001, now);
      thudG.gain.linearRampToValueAtTime(0.09, now + 0.01);
      thudG.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      thudO.connect(thudG).connect(audioCtx.destination);
      thudO.start(now);
      thudO.stop(now + 0.3);
      // brief buzz overlay
      const buzzO = audioCtx.createOscillator();
      const buzzG = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      buzzO.type = "square";
      buzzO.frequency.value = 180;
      filter.type = "lowpass";
      filter.frequency.value = 700;
      buzzG.gain.setValueAtTime(0.0001, now);
      buzzG.gain.linearRampToValueAtTime(0.055, now + 0.005);
      buzzG.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      buzzO.connect(filter).connect(buzzG).connect(audioCtx.destination);
      buzzO.start(now);
      buzzO.stop(now + 0.26);
    });
  }

  // Ambient background music/hum: gentle layered pad with slow LFO
  let humNodes = [];
  function startHum() {
    if (!audioCtx || !audioAllowed) return;
    if (humNodes.length) return; // already running
    safeTry(() => {
      const baseFreqs = [110, 165]; // low pad
      baseFreqs.forEach((f, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        osc.type = idx === 0 ? "sine" : "triangle";
        osc.frequency.value = f;
        filter.type = "lowpass";
        filter.frequency.value = 900;
        gain.gain.value = 0.008 * (idx + 1);
        // subtle detune
        osc.detune.value = idx === 1 ? 8 : -6;
        osc.connect(filter).connect(gain).connect(audioCtx.destination);
        osc.start();
        humNodes.push({ osc, gain, filter });
      });
      // soft LFO on overall gain
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 0.003;
      lfo.connect(lfoGain);
      // connect LFO to each gain.gain
      humNodes.forEach((n) => {
        lfoGain.connect(n.gain.gain);
      });
      lfo.start();
      humNodes.push({ lfo, lfoGain, isLFO: true });
    });
  }

  function stopHum() {
    if (!humNodes.length) return;
    safeTry(() => {
      humNodes.forEach((n) => {
        try {
          if (n.osc) {
            n.osc.stop();
            n.osc.disconnect();
          }
          if (n.lfo) {
            n.lfo.stop();
            n.lfo.disconnect();
          }
          if (n.gain) n.gain.disconnect();
          if (n.filter) n.filter.disconnect();
          if (n.lfoGain) n.lfoGain.disconnect();
        } catch (e) {
          // ignore
        }
      });
      humNodes = [];
    });
  }

  // Additional gentle hover tick sound, throttled per crate
  const hoverSoundTimestamps = new Map();
  function playHoverSound(id) {
    if (!audioCtx || !audioAllowed) return;
    const last = hoverSoundTimestamps.get(id) || 0;
    const now = performance.now();
    if (now - last < 350) return; // throttle
    hoverSoundTimestamps.set(id, now);
    safeTry(() => {
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 820;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.04, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    });
  }

  // Game state
  let lastTime = performance.now();
  let keys = {};
  let mouse = { x: 0, y: 0, clicked: false };
  let gameState = "intro"; // intro, playing, won, lost
  let score = 0;
  let wrongs = 0;
  let drone = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    r: 22,
    angle: 0,
    targetAngle: 0,
    color: "#6fb1ff"
  };
  let crates = [];
  let currentTarget = null;
  let hintText = "Move the drone to pick the crate with the correct answer!";
  let uiSoundEnabled = true;
  let audioStatusMsg = "Sound: unknown";
  let controlsText =
    "Controls: Arrow keys / WASD to move. Space or click a crate to collect. Press S to toggle sound. Enter to restart when game ends.";

  // Visual animation helpers
  let particles = []; // general particles for pick effects
  let confetti = []; // win confetti
  const clouds = []; // animated clouds
  let lastHoveredCrateId = null;

  // Utility functions
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Generate clouds with slight variety
  function initClouds() {
    clouds.length = 0;
    const defs = [
      { x: 80, y: 80, w: 64, h: 28, speed: 6 },
      { x: 220, y: 60, w: 54, h: 24, speed: 4 },
      { x: 520, y: 90, w: 74, h: 30, speed: 2 },
      { x: 620, y: 50, w: 48, h: 20, speed: 3 }
    ];
    for (const d of defs) {
      clouds.push({
        x: d.x,
        y: d.y,
        w: d.w,
        h: d.h,
        speed: d.speed,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.95 - Math.random() * 0.2
      });
    }
  }

  // Spawn crates, add animation phase to each crate
  function spawnCrates() {
    crates = [];
    const marginTop = 80;
    for (let i = 0; i < CRATE_COUNT; i++) {
      let tries = 0;
      while (tries < 200) {
        const w = 56;
        const h = 46;
        const x = randInt(UI_PADDING + 20, WIDTH - w - UI_PADDING - 20);
        const y = randInt(marginTop + 10, HEIGHT - h - 80);
        const num = randInt(CRATE_MIN, CRATE_MAX);
        const rect = {
          x,
          y,
          w,
          h,
          num,
          id: Math.random().toString(36).slice(2, 9),
          baseY: y,
          phase: Math.random() * Math.PI * 2,
          bobAmp: 3 + Math.random() * 3
        };
        let ok = true;
        for (const c of crates) {
          if (Math.abs(c.x - rect.x) < 70 && Math.abs(c.y - rect.y) < 60) {
            ok = false;
            break;
          }
        }
        if (ok && Math.abs(rect.x - drone.x) < 80 && Math.abs(rect.y - drone.y) < 80) ok = false;
        if (ok) {
          crates.push(rect);
          break;
        }
        tries++;
      }
    }
  }

  // Math question generation (unchanged logic)
  function generateQuestion() {
    const a = randInt(1, 9);
    const b = randInt(1, 9);
    if (Math.random() < 0.7) {
      currentTarget = { text: `${a} + ${b}`, value: a + b };
    } else {
      const a2 = Math.max(a, b);
      const b2 = Math.min(a, b);
      currentTarget = { text: `${a2} - ${b2}`, value: a2 - b2 };
    }
    const answerIndex = randInt(0, crates.length - 1);
    const used = new Set([crates[answerIndex].num]);
    crates[answerIndex].num = currentTarget.value;
    used.add(currentTarget.value);
    for (let i = 0; i < crates.length; i++) {
      if (i === answerIndex) continue;
      let tries = 0;
      while (tries < 200) {
        const n = randInt(CRATE_MIN, CRATE_MAX);
        if (!used.has(n)) {
          crates[i].num = n;
          used.add(n);
          break;
        }
        tries++;
      }
    }
  }

  // Particle spawner for pickups and wrong picks
  function spawnParticles(x, y, color = "#8ef4a3", count = 18, spread = 36) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 160;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0,
        ttl: 0.9 + Math.random() * 0.6,
        size: 2 + Math.random() * 4,
        color: color,
        drag: 0.98
      });
    }
  }

  // Confetti for win
  function spawnConfetti() {
    for (let i = 0; i < 48; i++) {
      confetti.push({
        x: Math.random() * WIDTH,
        y: -10 - Math.random() * 80,
        vx: Math.random() * 160 - 80,
        vy: 40 + Math.random() * 80,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 8,
        size: 6 + Math.random() * 8,
        color: ["#ff6b6b", "#ffd27f", "#8ef4a3", "#6fb1ff"][Math.floor(Math.random() * 4)],
        life: 0,
        ttl: 4 + Math.random() * 2
      });
    }
  }

  // Reset game (keeps mechanics)
  function resetGame() {
    score = 0;
    wrongs = 0;
    drone.x = WIDTH / 2;
    drone.y = HEIGHT - 100;
    drone.angle = 0;
    drone.targetAngle = 0;
    drone.color = "#6fb1ff";
    spawnCrates();
    generateQuestion();
    gameState = "playing";
    hintText = "Collect the crate with the answer to the math problem shown.";
    createAudioContext();
    if (audioCtx && audioAllowed) {
      startHum();
      audioStatusMsg = "Sound: on";
    } else if (audioUnavailable) {
      audioStatusMsg = "Sound: unavailable";
    } else {
      audioStatusMsg = "Sound: off (press S to enable)";
    }
    particles.length = 0;
    confetti.length = 0;
  }

  // Find nearest crate remains same
  function pickCrate(crate) {
    if (!crate) return;
    if (gameState !== "playing") return;
    if (crate.num === currentTarget.value) {
      score++;
      playPositiveSound();
      // celebration visuals
      drone.color = "#8ef4a3";
      spawnParticles(crate.x + crate.w / 2, crate.y + crate.h / 2, "#8ef4a3", 22);
      // light bounce animation on crate
      crate.bounce = 1.2;
      setTimeout(() => (drone.color = "#6fb1ff"), 220);
      if (score >= TARGET_GOAL) {
        gameState = "won";
        stopHum();
        spawnConfetti();
      } else {
        spawnCrates();
        generateQuestion();
      }
    } else {
      wrongs++;
      playNegativeSound();
      drone.color = "#ffb1b1";
      spawnParticles(crate.x + crate.w / 2, crate.y + crate.h / 2, "#ff7b7b", 12, 18);
      setTimeout(() => (drone.color = "#6fb1ff"), 300);
      if (wrongs >= MAX_WRONG) {
        gameState = "lost";
        stopHum();
      }
    }
  }

  function findNearestCrate(radius = 50) {
    let nearest = null;
    let minD = Infinity;
    for (const c of crates) {
      const center = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
      const d = distance(drone, center);
      if (d < minD) {
        minD = d;
        nearest = c;
      }
    }
    if (minD <= radius) return nearest;
    return null;
  }

  // Input handlers
  canvas.addEventListener("keydown", (e) => {
    requireAudioGesture();
    keys[e.key.toLowerCase()] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
    if (e.key === " " || e.key === "Spacebar") {
      if (gameState === "playing") {
        const c = findNearestCrate(60);
        if (c) pickCrate(c);
      } else if (gameState === "won" || gameState === "lost") {
        resetGame();
      }
    }
    if (e.key === "Enter" && (gameState === "won" || gameState === "lost")) {
      resetGame();
    }
    if (e.key.toLowerCase() === "s") {
      if (!audioCtx) {
        createAudioContext();
      }
      if (audioCtx && audioAllowed) {
        if (humNodes.length) {
          stopHum();
          audioStatusMsg = "Sound: off";
        } else {
          startHum();
          audioStatusMsg = "Sound: on";
        }
      } else if (!audioUnavailable) {
        if (audioCtx && audioCtx.state === "suspended") {
          audioCtx
            .resume()
            .then(() => {
              audioAllowed = true;
              startHum();
              audioStatusMsg = "Sound: on";
            })
            .catch((err) => {
              console.warn("Audio resume failed:", err);
              audioStatusMsg = "Sound: unavailable";
            });
        } else {
          audioStatusMsg = "Sound: unavailable";
        }
      }
    }
  });
  canvas.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Mouse / touch
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener("mousedown", (e) => {
    requireAudioGesture();
    mouse.clicked = true;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (gameState === "won" || gameState === "lost") {
      const bx = WIDTH / 2 - 90;
      const by = HEIGHT / 2 + 36;
      const bw = 180;
      const bh = 44;
      if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
        resetGame();
        return;
      }
    }
    for (const c of crates) {
      if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
        pickCrate(c);
        break;
      }
    }
  });
  canvas.addEventListener("mouseup", () => {
    mouse.clicked = false;
  });
  canvas.addEventListener(
    "touchstart",
    (e) => {
      requireAudioGesture();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      mouse.x = (t.clientX - rect.left) * (canvas.width / rect.width);
      mouse.y = (t.clientY - rect.top) * (canvas.height / rect.height);
      mouse.clicked = true;
      e.preventDefault();
      for (const c of crates) {
        if (mouse.x >= c.x && mouse.x <= c.x + c.w && mouse.y >= c.y && mouse.y <= c.y + c.h) {
          pickCrate(c);
          break;
        }
      }
    },
    { passive: false }
  );
  canvas.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouse.x = (t.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (t.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener("touchend", () => {
    mouse.clicked = false;
  });

  // Drawing helpers (rounded rect, wrapped text)
  function drawRoundedRect(x, y, w, h, r = 8, fillStyle = "#fff", strokeStyle = "#000", lineWidth = 1) {
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
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    }
  }

  function drawWrappedText(text, x, y, maxWidth, lineHeight, align = "center", font = BODY_FONT, bg = null) {
    ctx.font = font;
    const words = text.split(" ");
    let line = "";
    let lines = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + " ";
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());
    if (bg) {
      const textHeight = lines.length * lineHeight;
      const tw = maxWidth + 10;
      const th = textHeight + 10;
      const bx = x - tw / 2;
      const by = y - th / 2;
      drawRoundedRect(bx, by, tw, th, 10, bg.fill, bg.stroke, bg.lineWidth);
    }
    ctx.fillStyle = "#073b4c";
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
  }

  function computeUILayout() {
    ctx.font = SCORE_FONT;
    const scoreText = `Score: ${score}`;
    const scoreW = ctx.measureText(scoreText).width;
    const scoreX = UI_PADDING;
    const scoreY = UI_PADDING;

    ctx.font = SCORE_FONT;
    const targetText = currentTarget ? `Problem: ${currentTarget.text}` : "Problem:";
    const targetW = ctx.measureText(targetText).width;
    const targetXCenter = WIDTH / 2;
    const targetLeft = targetXCenter - targetW / 2;
    const targetY = UI_PADDING;

    ctx.font = SCORE_FONT;
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrongs)}`;
    const livesW = ctx.measureText(livesText).width;
    const livesX = WIDTH - UI_PADDING - livesW;
    const livesY = UI_PADDING;

    let centerY = targetY;
    const scoreRight = scoreX + scoreW;
    const livesLeft = livesX;
    if (targetLeft - scoreRight < 10 || livesLeft - (targetLeft + targetW) < 10) {
      centerY = targetY + 36;
    }
    return {
      score: { text: scoreText, x: scoreX, y: scoreY, w: scoreW },
      target: { text: targetText, x: targetXCenter, y: centerY, w: targetW },
      lives: { text: livesText, x: livesX, y: livesY, w: livesW }
    };
  }

  // Decorative background with animated clouds and gentle parallax
  function drawBackground(dt) {
    // sky gradient with subtle animated tint
    const time = performance.now() / 60000;
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    const skyShift = Math.sin(performance.now() / 5000) * 0.02;
    g.addColorStop(0, mix("#eaf6ff", "#fdf7e6", skyShift));
    g.addColorStop(0.6, "#f7fbfd");
    g.addColorStop(1, "#f1f7f6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun/glow
    const sunX = 110;
    const sunY = 90;
    const sunR = 56;
    const sunG = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, sunR);
    sunG.addColorStop(0, "rgba(255,230,130,0.95)");
    sunG.addColorStop(0.6, "rgba(255,230,130,0.25)");
    sunG.addColorStop(1, "rgba(255,230,130,0)");
    ctx.fillStyle = sunG;
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

    // rolling hills (subtle parallax)
    ctx.fillStyle = "#cfeedd";
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT * 0.65);
    ctx.quadraticCurveTo(
      WIDTH * 0.25,
      HEIGHT * 0.55 + Math.sin(performance.now() / 2100) * 6,
      WIDTH * 0.5,
      HEIGHT * 0.66
    );
    ctx.quadraticCurveTo(
      WIDTH * 0.75,
      HEIGHT * 0.77 + Math.cos(performance.now() / 2400) * 6,
      WIDTH,
      HEIGHT * 0.65
    );
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();

    // mountains with gradient
    const mg = ctx.createLinearGradient(0, HEIGHT * 0.5, 0, HEIGHT);
    mg.addColorStop(0, "#e6f6ff");
    mg.addColorStop(1, "#dff1ea");
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.moveTo(40, HEIGHT * 0.7);
    ctx.lineTo(140, HEIGHT * 0.44 - Math.sin(performance.now() / 5800) * 6);
    ctx.lineTo(240, HEIGHT * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(340, HEIGHT * 0.72);
    ctx.lineTo(460, HEIGHT * 0.42 - Math.cos(performance.now() / 7200) * 6);
    ctx.lineTo(560, HEIGHT * 0.72);
    ctx.closePath();
    ctx.fill();

    // animated clouds
    for (const cloud of clouds) {
      cloud.x += cloud.speed * (dt * 0.06);
      cloud.phase += dt * 0.004;
      if (cloud.x - cloud.w > WIDTH + 40) cloud.x = -80 - cloud.w;
      drawCloud(
        cloud.x + Math.sin(cloud.phase) * 6,
        cloud.y + Math.sin(cloud.phase * 1.5) * 4,
        cloud.w,
        cloud.h,
        `rgba(255,255,255,${cloud.alpha})`
      );
    }

    // friendly tower with glowing beacon
    drawTower(620, HEIGHT * 0.59, 36, 110, dt);
  }

  // Color mix helper
  function mix(a, b, t) {
    t = clamp((t + 1) / 2, 0, 1);
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const r = Math.round(ca.r + (cb.r - ca.r) * t);
    const g = Math.round(ca.g + (cb.g - ca.g) * t);
    const bl = Math.round(ca.b + (cb.b - ca.b) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16)
      };
    }
    return {
      r: parseInt(h.substr(0, 2), 16),
      g: parseInt(h.substr(2, 2), 16),
      b: parseInt(h.substr(4, 2), 16)
    };
  }

  function drawCloud(cx, cy, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.2, cy, w * 0.32, h * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.2, cy, w * 0.28, h * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy - h * 0.1, w * 0.3, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTower(x, y, w, h) {
    // tower with subtle pulsing beacon
    drawRoundedRect(x - w / 2, y - h, w, h, 6, "#ffd27f", "#d08a2f", 2);
    ctx.fillStyle = "#ffefc2";
    ctx.fillRect(x - 2, y - h - 18, 4, 18);
    // beacon glow
    ctx.save();
    const glowR = 22 + Math.sin(performance.now() / 430) * 3;
    const pg = ctx.createRadialGradient(x, y - h - 26, 6, x, y - h - 26, glowR);
    pg.addColorStop(0, "rgba(255,210,120,0.95)");
    pg.addColorStop(0.6, "rgba(255,210,120,0.12)");
    pg.addColorStop(1, "rgba(255,210,120,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y - h - 26, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#ffd27f";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y - h - 26, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - h - 26, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Drone drawing with engine glow and subtle trail
  function drawDrone(dt) {
    // smooth angle interpolation
    const s = Math.sin(performance.now() / 600);
    drone.angle += (drone.targetAngle - drone.angle) * 0.12;

    // engine glow / trail
    ctx.save();
    // trail shadow (subtle)
    const trailGradient = ctx.createRadialGradient(drone.x, drone.y + 10, 0, drone.x, drone.y + 10, 60);
    trailGradient.addColorStop(0, "rgba(107,177,255,0.12)");
    trailGradient.addColorStop(1, "rgba(107,177,255,0)");
    ctx.fillStyle = trailGradient;
    ctx.beginPath();
    ctx.ellipse(drone.x, drone.y + 22, 58, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(drone.x, drone.y);
    ctx.rotate(drone.angle);
    // dynamic propeller blur (animated)
    const propRot = performance.now() / 80;
    ctx.fillStyle = "rgba(240,249,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(-26, -8, 18, 6, propRot % Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(26, -8, 18, 6, (propRot + 1.4) % Math.PI, 0, Math.PI * 2);
    ctx.fill();

    // drone body
    drawRoundedRect(-22, -20, 44, 40, 10, drone.color, "#0b4b6a", 2);
    // cockpit glass
    ctx.fillStyle = "rgba(7,47,68,0.95)";
    ctx.beginPath();
    ctx.ellipse(6, 0, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // small friendly face (subtle)
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(-6, -2, 3, 2);
    ctx.fillRect(2, -2, 3, 2);

    // engine glow (below drone)
    const eg = ctx.createRadialGradient(0, 20, 0, 0, 20, 36);
    eg.addColorStop(0, "rgba(140,240,163,0.28)");
    eg.addColorStop(1, "rgba(140,240,163,0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.ellipse(0, 20, 32, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // friendly shadow
    ctx.fillStyle = "rgba(6,40,50,0.06)";
    ctx.beginPath();
    ctx.ellipse(drone.x, drone.y + 30, 44, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw crates with bobbing and glossy sticker
  function drawCrates(dt) {
    for (const c of crates) {
      // bobbing
      c.phase += dt * 4;
      const bob = Math.sin(c.phase) * c.bobAmp;
      const y = c.baseY + bob;
      c.y = y;
      // shadow
      const sh = ctx.createRadialGradient(c.x + c.w / 2, y + c.h + 8, 6, c.x + c.w / 2, y + c.h + 8, 40);
      sh.addColorStop(0, "rgba(6,40,50,0.08)");
      sh.addColorStop(1, "rgba(6,40,50,0)");
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(c.x + c.w / 2, y + c.h + 8, 36, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // crate box
      drawRoundedRect(c.x, y, c.w, c.h, 8, "#fff6e6", "#b98d4f", 2);
      // sticker
      const stickerX = c.x + 6;
      const stickerY = y + 8;
      drawRoundedRect(stickerX, stickerY, c.w - 12, c.h - 16, 6, "#ffeead", "#b98d4f", 1.2);
      // glossy shine
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.ellipse(
        stickerX + (c.w - 12) * 0.6,
        stickerY + 6,
        18,
        8,
        -0.6,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // number
      ctx.font = TITLE_FONT;
      ctx.fillStyle = "#073b4c";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(c.num), c.x + c.w / 2, stickerY + (c.h - 16) / 2);

      // bounce visual if recently correct
      if (c.bounce && c.bounce > 1) {
        c.bounce -= 0.08;
        ctx.strokeStyle = "#8ef4a3";
        ctx.lineWidth = 3;
        ctx.strokeRect(c.x - 6, y - 6, c.w + 12, c.h + 12);
      }

      // track hover for sound
      if (mouse.x >= c.x && mouse.x <= c.x + c.w && mouse.y >= y && mouse.y <= y + c.h) {
        if (lastHoveredCrateId !== c.id) {
          lastHoveredCrateId = c.id;
          playHoverSound(c.id);
        }
      } else if (lastHoveredCrateId === c.id) {
        lastHoveredCrateId = null;
      }
    }
  }

  // Draw UI with spacing and accessible layout
  function drawUI() {
    const layout = computeUILayout();
    // Score
    ctx.font = SCORE_FONT;
    const scorePad = 8;
    const scoreH = 30;
    drawRoundedRect(
      layout.score.x - scorePad,
      layout.score.y - 6,
      layout.score.w + scorePad * 2,
      scoreH,
      8,
      "rgba(255,255,255,0.9)",
      "#073b4c",
      1
    );
    ctx.fillStyle = "#073b4c";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = SCORE_FONT;
    ctx.fillText(layout.score.text, layout.score.x + 6, layout.score.y + scoreH / 2 - 6);

    // Target
    const targetW = Math.max(layout.target.w + 24, 180);
    const targetH = 36;
    drawRoundedRect(
      widthSafe(layout.target.x - targetW / 2),
      layout.target.y - 6,
      targetW,
      targetH,
      10,
      "#e8f7ff",
      "#0b5775",
      1.5
    );
    ctx.fillStyle = "#0b5775";
    ctx.font = TITLE_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const targetText = currentTarget ? `Solve: ${currentTarget.text}` : "Solve:";
    ctx.fillText(targetText, layout.target.x, layout.target.y + targetH / 2 - 6);

    // Lives
    const livesPad = 8;
    const livesH = 30;
    drawRoundedRect(
      layout.lives.x - livesPad,
      layout.lives.y - 6,
      layout.lives.w + livesPad * 2,
      livesH,
      8,
      "rgba(255,241,241,0.95)",
      "#6b0505",
      1
    );
    ctx.fillStyle = "#6b0505";
    ctx.font = SCORE_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(layout.lives.text, layout.lives.x + 6, layout.lives.y + livesH / 2 - 6);

    // Hearts
    const remaining = Math.max(0, MAX_WRONG - wrongs);
    const heartXStart = WIDTH - UI_PADDING - 6 - layout.lives.w - 8 - remaining * 18;
    for (let i = 0; i < remaining; i++) {
      drawHeart(heartXStart + i * 18, layout.lives.y + 12, 7, "#ff6b6b");
    }

    // Bottom instructions
    const instrY = HEIGHT - 68;
    drawWrappedText(
      controlsText,
      WIDTH / 2,
      instrY,
      WIDTH - 40,
      20,
      "center",
      BODY_FONT,
      { fill: "rgba(255,255,255,0.9)", stroke: "#073b4c", lineWidth: 1 }
    );

    // Audio badge
    ctx.font = "14px Inter, system-ui, sans-serif";
    const audText = audioUnavailable ? "Audio unavailable" : audioStatusMsg;
    const aw = ctx.measureText(audText).width + 12;
    drawRoundedRect(UI_PADDING, layout.score.y + 36, aw, 24, 8, "rgba(255,255,255,0.9)", "#073b4c", 1);
    ctx.fillStyle = "#073b4c";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(audText, UI_PADDING + 6, layout.score.y + 48 - 6);

    // Hint box
    ctx.font = BODY_FONT;
    ctx.textAlign = "left";
    ctx.fillStyle = "#073b4c";
    const hintBoxW = 300;
    drawRoundedRect(UI_PADDING, HEIGHT - 130, hintBoxW, 44, 8, "#e6faff", "#0b5775", 1);
    ctx.fillStyle = "#0b5775";
    ctx.fillText(hintText, UI_PADDING + 10, HEIGHT - 108);

    // Speaker icon
    drawSpeaker(
      UI_PADDING + aw + 12,
      layout.score.y + 44,
      audioUnavailable ? "#bdbdbd" : humNodes.length ? "#0b5775" : "#6b6b6b"
    );
  }

  function widthSafe(v) {
    return Math.max(8, Math.min(v, WIDTH - 8));
  }

  function drawHeart(x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - size / 2, x - size, y - size / 2, x - size, y + size / 3);
    ctx.bezierCurveTo(x - size, y + size, x, y + size * 1.4, x, y + size * 1.8);
    ctx.bezierCurveTo(x, y + size * 1.4, x + size, y + size, x + size, y + size / 3);
    ctx.bezierCurveTo(x + size, y - size / 2, x, y - size / 2, x, y);
    ctx.fill();
  }

  function drawSpeaker(x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 8, y - 10);
    ctx.lineTo(x + 8, y + 10);
    ctx.lineTo(x, y + 6);
    ctx.closePath();
    ctx.fill();
    if (!audioUnavailable && humNodes.length) {
      ctx.strokeStyle = "#0b5775";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x + 12, y - 2, 8, -0.6, 0.6);
      ctx.stroke();
    }
  }

  // End screens with confetti support
  function drawEndScreen(dt) {
    ctx.fillStyle = "rgba(2,15,22,0.5)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const panelW = 520;
    const panelH = 220;
    const px = (WIDTH - panelW) / 2;
    const py = (HEIGHT - panelH) / 2;
    drawRoundedRect(px, py, panelW, panelH, 12, "#ffffff", "#073b4c", 2);

    ctx.fillStyle = "#073b4c";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = TITLE_FONT;

    if (gameState === "won") {
      ctx.fillText("Victory! Drone Mission Accomplished", WIDTH / 2, py + 18);
      ctx.font = SCORE_FONT;
      ctx.fillText(`You answered ${score} correct problems!`, WIDTH / 2, py + 64);
    } else {
      ctx.fillText("Game Over", WIDTH / 2, py + 18);
      ctx.font = SCORE_FONT;
      ctx.fillText(`You answered ${score} correctly. Try again!`, WIDTH / 2, py + 64);
    }

    const bx = WIDTH / 2 - 90;
    const by = py + panelH - 80;
    const bw = 180;
    const bh = 44;
    drawRoundedRect(bx, by, bw, bh, 10, "#eaf6ff", "#0b5775", 2);
    ctx.fillStyle = "#0b5775";
    ctx.font = BODY_FONT;
    ctx.fillText("Restart Mission", WIDTH / 2, by + 12);

    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#0b5775";
    ctx.fillText("Click the button or press Enter to try again", WIDTH / 2, by + bh + 12);

    // render confetti
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 120 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.life += dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
      if (p.life > p.ttl || p.y > HEIGHT + 40) {
        confetti.splice(i, 1);
      }
    }
  }

  // Particles update & render
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += 120 * dt; // gravity pull down for realism
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      if (p.life > p.ttl) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const alpha = clamp(1 - p.life / p.ttl, 0, 1);
      ctx.fillStyle = hexWithAlpha(p.color, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function hexWithAlpha(hex, a) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  }

  // Game update function (movement, physics)
  function update(dt) {
    if (gameState !== "playing") {
      // still update particles and confetti for end screens
      updateParticles(dt);
      return;
    }
    // Movement
    let vx = 0;
    let vy = 0;
    if (keys["arrowleft"] || keys["a"]) vx -= 1;
    if (keys["arrowright"] || keys["d"]) vx += 1;
    if (keys["arrowup"] || keys["w"]) vy -= 1;
    if (keys["arrowdown"] || keys["s"]) vy += 1;
    if (vx !== 0 || vy !== 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      vx /= len;
      vy /= len;
      drone.x += vx * DRONE_SPEED * dt;
      drone.y += vy * DRONE_SPEED * dt;
      drone.targetAngle = Math.atan2(vy, vx) + Math.PI / 2;
    } else {
      drone.targetAngle = Math.sin(performance.now() / 600) * 0.06;
    }
    drone.x = clamp(drone.x, 30, WIDTH - 30);
    drone.y = clamp(drone.y, 40, HEIGHT - 40);

    // nudge overlapping crates away
    for (const c of crates) {
      if (Math.abs(c.x + c.w / 2 - drone.x) < 18 && Math.abs(c.y + c.h / 2 - drone.y) < 18) {
        c.x += randInt(-30, 30);
        c.y += randInt(-30, 30);
        c.x = clamp(c.x, UI_PADDING + 10, WIDTH - c.w - UI_PADDING - 10);
        c.y = clamp(c.y, 80, HEIGHT - c.h - 90);
      }
    }

    // update particles
    updateParticles(dt);

    // update confetti outside end screen handling
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += 120 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.life += dt;
      if (p.life > p.ttl || p.y > HEIGHT + 40) {
        confetti.splice(i, 1);
      }
    }
  }

  // Render function
  function render(dt) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawBackground(dt);

    // crates then drone ensures drone overlays crates slightly
    drawCrates(dt);

    // particles behind drone for pickup pop
    drawParticles();

    drawDrone(dt);

    drawUI();

    // crate hover highlight
    for (const c of crates) {
      const y = c.y;
      if (mouse.x >= c.x && mouse.x <= c.x + c.w && mouse.y >= y && mouse.y <= y + c.h) {
        ctx.strokeStyle = "#0b5775";
        ctx.lineWidth = 3;
        ctx.strokeRect(c.x - 4, y - 4, c.w + 8, c.h + 8);
      }
    }

    if (gameState === "won" || gameState === "lost") {
      drawEndScreen(dt);
    }
  }

  // Utility to animate main loop
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render(dt);
    requestAnimationFrame(loop);
  }

  // Utility to safely expose restart hint
  canvas.setAttribute("title", "Drone Math Adventure. Press Enter to restart when game ends.");

  // Initialize environment
  function init() {
    canvas.focus();
    initClouds();
    spawnCrates();
    generateQuestion();
    if (typeof window.AudioContext === "undefined" && typeof window.webkitAudioContext === "undefined") {
      audioUnavailable = true;
      audioStatusMsg = "Sound: unavailable";
    } else {
      audioStatusMsg = "Sound: off (press S to enable)";
    }
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  // Error-safe start
  try {
    init();
  } catch (e) {
    console.error("Game initialization failed:", e);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#000";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText("An error occurred initializing the game. Please try reloading the page.", 20, 40);
  }
})();