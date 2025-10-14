(function () {
  // Drone Math Adventure - Visual & Audio Enhancements Only
  // Rendered into #game-of-the-day-stage
  // All visuals drawn with Canvas. All audio generated with Web Audio API.
  // Game mechanics and math logic remain unchanged.

  // Configuration constants
  const CANVAS_WIDTH = 720;
  const CANVAS_HEIGHT = 480;
  const GOAL_SCORE = 10;
  const MAX_LIVES = 3;
  const QUESTION_FONT = "22px Arial";
  const BODY_FONT = "16px Arial";
  const IMPORTANT_FONT = "26px Arial";
  const UI_PADDING = 10; // minimum spacing between UI elements (pixels)
  const OPTION_FONT = "20px Arial";
  const AUDIO_ENABLED_DEFAULT = true;

  // Access the stage element and create canvas
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    console.error("No element with id 'game-of-the-day-stage' found.");
    return;
  }
  // Clear stage and create canvas
  stage.innerHTML = "";
  stage.style.position = "relative";
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Drone Math Adventure: solve addition and subtraction questions. Use number keys 1 to 4 to answer. Press M to toggle sound. Press R to restart."
  );
  canvas.setAttribute("tabindex", "0"); // allow keyboard focus
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Audio setup with proper error handling
  let audioCtx = null;
  let audioAllowed = AUDIO_ENABLED_DEFAULT;
  let masterGain = null;
  let ambient = null; // object with nodes
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      throw new Error("Web Audio API not supported");
    }
    audioCtx = new AudioContext();
    // master gain for global control
    masterGain = audioCtx.createGain();
    masterGain.gain.value = audioAllowed ? 0.9 : 0;
    masterGain.connect(audioCtx.destination);

    // Prepare ambient pad (not started until user gesture/resume)
    ambient = {
      gain: audioCtx.createGain(),
      filter: audioCtx.createBiquadFilter(),
      osc1: audioCtx.createOscillator(),
      osc2: audioCtx.createOscillator(),
      lfo: audioCtx.createOscillator(),
      lfoGain: audioCtx.createGain(),
      started: false
    };
    ambient.gain.gain.value = 0.035; // overall pad volume
    ambient.filter.type = "lowpass";
    ambient.filter.frequency.value = 800; // mellow
    ambient.filter.Q.value = 0.7;

    // Two oscillators make a gentle pad
    ambient.osc1.type = "sine";
    ambient.osc1.frequency.value = 110; // A2-ish
    ambient.osc2.type = "triangle";
    ambient.osc2.frequency.value = 165; // P5-ish

    // LFO to modulate filter frequency for slow movement
    ambient.lfo.type = "sine";
    ambient.lfo.frequency.value = 0.12;
    ambient.lfoGain.gain.value = 120;
    // Connect ambient: osc -> filter -> gain -> master
    try {
      ambient.osc1.connect(ambient.filter);
      ambient.osc2.connect(ambient.filter);
      ambient.filter.connect(ambient.gain);
      ambient.gain.connect(masterGain);
      ambient.lfo.connect(ambient.lfoGain);
      ambient.lfoGain.connect(ambient.filter.frequency);
    } catch (err) {
      console.warn("Audio node connection failed:", err);
    }
    // But do not start oscillators yet. We'll start them on first user gesture or resume.
  } catch (err) {
    console.warn("Audio disabled or failed to initialize:", err);
    audioCtx = null;
    audioAllowed = false;
  }

  // Utility for short sound effects (correct/incorrect)
  function playBeep(type = "correct") {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const out = audioCtx.createGain();
      out.connect(masterGain);
      // gentle envelope
      out.gain.setValueAtTime(0.0001, now);
      out.gain.linearRampToValueAtTime(1.0, now + 0.01);

      if (type === "correct") {
        // Pleasant harmonic chime (two detuned oscillators)
        const o1 = audioCtx.createOscillator();
        const o2 = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 2200;
        o1.type = "sine";
        o2.type = "triangle";
        o1.frequency.setValueAtTime(880, now);
        o2.frequency.setValueAtTime(1320, now); // perfect fifth
        const g1 = audioCtx.createGain();
        g1.gain.value = 0.0001;
        const g2 = audioCtx.createGain();
        g2.gain.value = 0.0001;
        o1.connect(g1);
        o2.connect(g2);
        g1.connect(filter);
        g2.connect(filter);
        filter.connect(out);

        // short envelope
        g1.gain.setValueAtTime(0.0001, now);
        g2.gain.setValueAtTime(0.0001, now);
        g1.gain.exponentialRampToValueAtTime(0.25, now + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
        g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

        // release master
        out.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

        o1.start(now);
        o2.start(now);
        o1.stop(now + 0.7);
        o2.stop(now + 0.7);
      } else {
        // incorrect: soft low thud with brief noise burst
        const o = audioCtx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(160, now);
        const filt = audioCtx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 480;
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(filt);
        filt.connect(out);

        // envelope
        g.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        out.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        o.start(now);
        o.stop(now + 0.45);

        // small high "negative ping"
        const ping = audioCtx.createOscillator();
        ping.type = "square";
        ping.frequency.setValueAtTime(320, now + 0.05);
        const pg = audioCtx.createGain();
        pg.gain.value = 0.0001;
        ping.connect(pg);
        pg.connect(out);
        pg.gain.exponentialRampToValueAtTime(0.06, now + 0.06);
        pg.gain.exponentialRampToValueAtTime(0.00001, now + 0.22);
        ping.start(now + 0.05);
        ping.stop(now + 0.25);
      }
    } catch (err) {
      console.warn("Failed to play beep:", err);
    }
  }

  // Optional gentle click for selection (not on hover to avoid overstimulation)
  function playSelect() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(660, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      o.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + 0.18);
    } catch (err) {
      console.warn("Failed to play select sound:", err);
    }
  }

  // Ensure audio context resumes on first user gesture if suspended and start ambient
  async function ensureAudioRunning() {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
    } catch (err) {
      console.warn("Audio resume failed:", err);
    }
    // start ambient oscillators on first gesture
    try {
      if (ambient && !ambient.started) {
        ambient.osc1.start();
        ambient.osc2.start();
        ambient.lfo.start();
        ambient.started = true;
      }
      // set master gain depending on audioAllowed
      if (masterGain) masterGain.gain.value = audioAllowed ? 0.9 : 0;
    } catch (err) {
      console.warn("Failed to start ambient oscillators:", err);
    }
  }

  // Game state
  let score = 0;
  let lives = MAX_LIVES;
  let question = null;
  let options = [];
  let selectedOptionIndex = -1;
  let questionCount = 0;
  let gameState = "playing"; // playing, victory, gameover
  let lastTime = performance.now();
  let hoverIndex = -1;
  let animationTime = 0;
  let particles = [];
  let drones = []; // for option visuals

  // Accessibility: update canvas aria-label with current state
  function updateAriaLabel() {
    let label = `Drone Math Adventure. Score ${score}. Lives ${lives}. `;
    if (gameState === "playing") {
      label += `Question: ${question ? question.text : ""} `;
      label += `Options: `;
      options.forEach((opt, i) => {
        label += `${i + 1}: ${opt}. `;
      });
      label += "Press number keys 1 to 4 to answer.";
    } else if (gameState === "victory") {
      label += "You won! Press R to restart.";
    } else if (gameState === "gameover") {
      label += "Game over. Press R to restart.";
    }
    canvas.setAttribute("aria-label", label);
  }

  // Question generator: simple addition/subtraction within 20 (unchanged)
  function generateQuestion() {
    const a = Math.floor(Math.random() * 18) + 1; // 1..18
    const b = Math.floor(Math.random() * 9) + 1; // 1..9
    const add = Math.random() > 0.5;
    const answer = add ? a + b : a - b;
    const text = add ? `${a} + ${b} = ?` : `${a} - ${b} = ?`;
    // create 3 distractors within +/- 5 but unique and >= -20 and <= 40
    const set = new Set([answer]);
    while (set.size < 4) {
      let delta = Math.floor(Math.random() * 11) - 5; // -5..5
      if (delta === 0) delta = Math.random() > 0.5 ? 1 : -1;
      let v = answer + delta;
      if (v < -20) v = answer + Math.abs(delta) + 1;
      set.add(v);
    }
    const arr = Array.from(set);
    // shuffle options
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // calculate which index is correct
    const correctIndex = arr.indexOf(answer);
    return {
      text,
      answer,
      options: arr,
      correctIndex
    };
  }

  // Setup new question and visual drones for options
  function nextQuestion() {
    question = generateQuestion();
    options = question.options.slice();
    selectedOptionIndex = -1;
    hoverIndex = -1;
    questionCount++;
    // create drones for each option with positions (unchanged)
    drones = [];
    const positions = [
      { x: 180, y: 210 },
      { x: 540, y: 210 },
      { x: 180, y: 340 },
      { x: 540, y: 340 }
    ];
    for (let i = 0; i < 4; i++) {
      const p = positions[i];
      drones.push({
        x: p.x,
        y: p.y,
        targetY: p.y,
        angle: Math.random() * Math.PI * 2,
        wobble: Math.random() * 0.6 + 0.6,
        label: String(options[i]),
        shakeTime: 0,
        delivering: false,
        deliveryTarget: null,
        rotSpeed: Math.random() * 0.6 + 1.2
      });
    }
    updateAriaLabel();
  }

  // Initialize new game
  function restartGame() {
    score = 0;
    lives = MAX_LIVES;
    questionCount = 0;
    gameState = "playing";
    nextQuestion();
    particles = [];
    animationTime = 0;
    selectedOptionIndex = -1;
    hoverIndex = -1;
    updateAriaLabel();
  }

  // Start the game initially
  restartGame();

  // Mouse and keyboard events
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    hoverIndex = -1;
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      // option bounding box
      const w = 220;
      const h = 80;
      if (
        mx >= d.x - w / 2 &&
        mx <= d.x + w / 2 &&
        my >= d.y - h / 2 &&
        my <= d.y + h / 2
      ) {
        hoverIndex = i;
        canvas.style.cursor = "pointer";
        return;
      }
    }
    canvas.style.cursor = "default";
  });

  canvas.addEventListener("click", async (e) => {
    await ensureAudioRunning();
    if (gameState !== "playing") {
      // check restart button click
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // restart button center
      const btnW = 180;
      const btnH = 48;
      const btnX = CANVAS_WIDTH / 2 - btnW / 2;
      const btnY = CANVAS_HEIGHT / 2 + 60;
      if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
        restartGame();
      }
      return;
    }
    // playing: check option click
    if (hoverIndex >= 0) {
      playSelect();
      chooseOption(hoverIndex);
    }
  });

  // keyboard controls: 1-4 to choose, M to toggle audio, R to restart
  canvas.addEventListener("keydown", async (e) => {
    await ensureAudioRunning();
    if (e.key >= "1" && e.key <= "4") {
      const idx = parseInt(e.key, 10) - 1;
      if (gameState === "playing") {
        playSelect();
        chooseOption(idx);
      }
    } else if (e.key.toLowerCase() === "m") {
      toggleAudio();
    } else if (e.key.toLowerCase() === "r") {
      restartGame();
    } else if (e.key === "ArrowLeft") {
      // optional: navigate hover for accessibility
      if (gameState === "playing") {
        hoverIndex = hoverIndex <= 0 ? drones.length - 1 : hoverIndex - 1;
      }
    } else if (e.key === "ArrowRight") {
      if (gameState === "playing") {
        hoverIndex = (hoverIndex + 1) % drones.length;
      }
    } else if (e.key === "Enter") {
      if (gameState === "playing" && hoverIndex >= 0) {
        playSelect();
        chooseOption(hoverIndex);
      } else if (gameState !== "playing") {
        restartGame();
      }
    }
    updateAriaLabel();
  });

  // make sure canvas is focusable and focused so keyboard works
  canvas.addEventListener("focus", () => {
    canvas.style.outline = "2px solid rgba(0,0,0,0.1)";
  });
  canvas.addEventListener("blur", () => {
    canvas.style.outline = "none";
  });
  // Autofocus to allow keyboard immediately if possible
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (err) {}
  }, 100);

  // Choose an option index (player action)
  function chooseOption(idx) {
    if (gameState !== "playing") return;
    selectedOptionIndex = idx;
    // Visual: make chosen drone bounce upward slightly
    const d = drones[idx];
    d.targetY = d.y - 30;
    d.rotSpeed *= 1.6; // spin up propellers briefly
    // Check correctness
    if (idx === question.correctIndex) {
      score++;
      playBeep("correct");
      spawnParticles(d.x, d.y, "#FFD700"); // golden stars
      // Move drone off-screen to "deliver" package
      d.delivering = true;
      d.deliveryTarget = { x: CANVAS_WIDTH - 60, y: 60 };
    } else {
      lives--;
      playBeep("incorrect");
      spawnParticles(d.x, d.y, "#FF6B6B");
      // shake the drone
      d.shakeTime = 0.4;
    }
    // Check win/lose conditions after small timeout so player sees effect
    setTimeout(() => {
      if (score >= GOAL_SCORE) {
        gameState = "victory";
      } else if (lives <= 0) {
        gameState = "gameover";
      } else {
        nextQuestion();
      }
      updateAriaLabel();
    }, 500);
  }

  // Particle effect for feedback
  function spawnParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 220,
        vy: (Math.random() - 0.85) * -220,
        life: Math.random() * 0.8 + 0.4,
        ttl: Math.random() * 0.8 + 0.4,
        color,
        size: Math.random() * 4 + 2,
        rot: Math.random() * Math.PI * 2,
        type: Math.random() > 0.6 ? "star" : "circle"
      });
    }
  }

  // Toggle audio on/off
  function toggleAudio() {
    if (!audioCtx) return;
    audioAllowed = !audioAllowed;
    try {
      if (masterGain) masterGain.gain.value = audioAllowed ? 0.9 : 0;
    } catch (err) {
      console.warn("Failed to toggle ambient:", err);
    }
    updateAriaLabel();
  }

  // Draw helper functions with measured backgrounds to avoid overlapping text
  function drawTextWithBackground(text, x, y, font, padding = 8, align = "left", bgColor = "rgba(255,255,255,0.6)", textColor = "#000") {
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    // compute height from font numeric part
    const fontSize = parseInt((font.match(/\d+/) || [14])[0], 10);
    const height = fontSize;
    let drawX = x;
    if (align === "center") drawX = x - width / 2;
    if (align === "right") drawX = x - width;
    const rectX = drawX - padding;
    const rectY = y - height + -2 - padding / 2;
    const rectW = width + padding * 2;
    const rectH = height + padding;
    // background with subtle blur by drawing a semi-transparent rounded rect
    ctx.fillStyle = bgColor;
    roundRect(ctx, rectX, rectY, rectW, rectH, 8);
    ctx.fill();
    // subtle inner shadow line
    ctx.strokeStyle = "rgba(0,0,0,0.04)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // text
    ctx.fillStyle = textColor;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
    return { x: rectX, y: rectY, w: rectW, h: rectH };
  }

  // Rounded rectangle utility
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Main render loop
  function render(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    animationTime += dt;

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 500 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 6;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Update drones
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      // gentle bobbing
      d.angle += dt * 2 * d.wobble;
      const bob = Math.sin(animationTime * 2 + i * 0.6) * 6;
      // shake effect
      if (d.shakeTime && d.shakeTime > 0) {
        d.shakeTime -= dt;
      }
      if (d.delivering) {
        // move toward delivery target
        const tx = d.deliveryTarget.x;
        const ty = d.deliveryTarget.y;
        d.x += (tx - d.x) * Math.min(1, dt * 2.5);
        d.y += (ty - d.y) * Math.min(1, dt * 2.5);
      } else {
        // return to base targetY
        d.y += (d.targetY - d.y) * Math.min(1, dt * 4);
      }
      d.renderY = d.y + bob;
    }

    // Clear canvas and draw layered background with gentle gradient and parallax
    const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    skyGrad.addColorStop(0, "#FFF9EC");
    skyGrad.addColorStop(0.3, "#E6F7FF");
    skyGrad.addColorStop(1, "#CFEFFA");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Sun with subtle glow
    const sunX = 80 + Math.cos(animationTime * 0.3) * 10;
    const sunY = 60 + Math.sin(animationTime * 0.2) * 6;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 70);
    sunGrad.addColorStop(0, "rgba(255,220,80,1)");
    sunGrad.addColorStop(1, "rgba(255,220,80,0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
    ctx.fill();

    // City silhouette (parallax)
    drawCitySilhouette(animationTime);

    // Soft moving clouds (improved)
    drawWackyCloud(
      140 + Math.sin(animationTime * 0.7) * 16,
      80 + Math.sin(animationTime * 0.5) * 6,
      110,
      46,
      "#FFFFFF",
      "#F2FBFF",
      0.98
    );
    drawWackyCloud(
      520 + Math.cos(animationTime * 0.9) * 22,
      58 + Math.cos(animationTime * 0.6) * 8,
      140,
      62,
      "#FFFFFF",
      "#F8FDFF",
      0.98
    );
    drawWackyCloud(340, 52 + Math.sin(animationTime * 1.1) * 6, 70, 36, "#FFFFFF", "#F4FEFF", 0.95);

    // Ground subtle gradient
    const groundY = 410;
    const gGrad = ctx.createLinearGradient(0, groundY, 0, CANVAS_HEIGHT);
    gGrad.addColorStop(0, "#E8F4F9");
    gGrad.addColorStop(1, "#DCEFF4");
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, groundY, CANVAS_WIDTH, CANVAS_HEIGHT - groundY);

    // Draw question box at top center (larger and friendlier)
    ctx.textBaseline = "alphabetic";
    ctx.font = "28px Inter, Arial";
    ctx.fillStyle = "#06243B";
    ctx.textAlign = "center";
    const questionBox = drawTextWithBackground(
      question.text,
      CANVAS_WIDTH / 2,
      68,
      "28px Arial",
      14,
      "center",
      "rgba(255,255,255,0.92)",
      "#07365A"
    );

    // Draw score top-left and lives top-right using measureText to avoid overlapping
    ctx.font = BODY_FONT;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const scoreText = `Score: ${score}/${GOAL_SCORE}`;
    const scoreBox = drawTextWithBackground(scoreText, UI_PADDING + 2, UI_PADDING + 20, BODY_FONT, 8, "left", "rgba(255,255,255,0.9)", "#0B4B6F");

    ctx.textAlign = "right";
    const livesText = `Lives: ${lives}`;
    // Place lives at top-right with padding
    const livesX = CANVAS_WIDTH - UI_PADDING - 2;
    const livesBox = drawTextWithBackground(livesText, livesX, UI_PADDING + 20, BODY_FONT, 8, "right", "rgba(255,255,255,0.9)", "#7A0000");

    // Draw audio state icon (top-left near score) - use small text but nicer styling
    ctx.font = "14px Arial";
    const audioText = audioAllowed ? "Sound: On (M)" : "Sound: Off (M)";
    ctx.textAlign = "left";
    drawTextWithBackground(audioText, UI_PADDING + 2, scoreBox.y + scoreBox.h + 22, "14px Arial", 6, "left", "rgba(255,255,255,0.85)", "#064A4A");

    // Draw instructions bottom-center
    ctx.font = BODY_FONT;
    ctx.textAlign = "center";
    const instructions = "Choose the correct answer. Use keys 1-4 or click a drone. Press R to restart.";
    drawTextWithBackground(instructions, CANVAS_WIDTH / 2, CANVAS_HEIGHT - UI_PADDING - 10, BODY_FONT, 10, "center", "rgba(255,255,255,0.92)", "#07365A");

    // Draw option drones with labels and option numbers (enhanced visuals)
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      const x = d.x;
      const y = d.renderY;
      // Option bounding box dims
      const boxW = 220;
      const boxH = 80;
      const isHover = hoverIndex === i;
      const isSelected = selectedOptionIndex === i;
      ctx.save();
      ctx.translate(x, y);
      // subtle floating shadow under drone
      const shadowAlpha = 0.12 + Math.abs(Math.sin(animationTime + i)) * 0.04;
      ctx.fillStyle = `rgba(0,18,25,${shadowAlpha})`;
      roundRect(ctx, -boxW / 2 + 12, boxH / 2 - 10, boxW - 24, 10, 8);
      ctx.fill();
      // crate / package plate under drone
      ctx.fillStyle = isSelected ? "#FFF7E6" : isHover ? "#F9FEFF" : "#FFFFFF";
      roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 14);
      ctx.fill();
      ctx.strokeStyle = "#D0D6DE";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Drone body (rounded rectangle with cargo)
      ctx.save();
      ctx.translate(0, -12);
      // drone belly
      ctx.fillStyle = "#F0FBFF";
      roundRect(ctx, -40, -16, 80, 36, 10);
      ctx.fill();
      ctx.strokeStyle = "#BBDCEC";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // cargo box below
      ctx.fillStyle = "#F7E9C7";
      roundRect(ctx, -38, 2, 76, 34, 6);
      ctx.fill();
      ctx.strokeStyle = "#E0CFA0";
      ctx.stroke();

      // drone eyes (friendly face)
      ctx.fillStyle = "#18394A";
      ctx.beginPath();
      ctx.arc(-14, -4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(14, -4, 4, 0, Math.PI * 2);
      ctx.fill();
      // smile
      ctx.strokeStyle = "#18394A";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 2, 8, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      // propellers above (animated)
      ctx.save();
      ctx.translate(0, -26);
      // left rotor
      ctx.save();
      ctx.translate(-42, 6);
      ctx.rotate(animationTime * 20 * d.rotSpeed);
      drawPropeller(ctx, 0, 0, isHover ? 6 : 5, isSelected ? "#FFB84D" : "#3A3A3A");
      ctx.restore();
      // right rotor
      ctx.save();
      ctx.translate(42, 6);
      ctx.rotate(-animationTime * 20 * d.rotSpeed);
      drawPropeller(ctx, 0, 0, isHover ? 6 : 5, isSelected ? "#FFB84D" : "#3A3A3A");
      ctx.restore();
      ctx.restore();

      ctx.restore();

      // draw option number and label
      ctx.font = "18px Arial";
      ctx.fillStyle = "#00334d";
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}.`, -boxW / 2 + 12, 12);
      ctx.font = OPTION_FONT;
      ctx.fillStyle = "#002b36";
      ctx.textAlign = "center";
      ctx.fillText(d.label, 0, 14);

      // decorative antenna curve
      ctx.strokeStyle = "rgba(11, 84, 115, 0.06)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(boxW / 2 - 20, -boxH / 2 + 6);
      ctx.quadraticCurveTo(boxW / 2 - 10, -boxH / 2 - 12, boxW / 2 - 36, -boxH / 2 - 8);
      ctx.stroke();

      // if wrong recently, add red wash
      if (d.shakeTime && d.shakeTime > 0) {
        ctx.fillStyle = `rgba(255,72,72,${Math.min(0.18, d.shakeTime * 0.4)})`;
        roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 12);
        ctx.fill();
      }

      ctx.restore();
    }

    // Draw floating stars indicating progress top-center under question
    for (let i = 0; i < GOAL_SCORE; i++) {
      const starX = CANVAS_WIDTH / 2 - (GOAL_SCORE - 1) * 18 + i * 36;
      const starY = questionBox.y + questionBox.h + 40 + Math.sin(animationTime * 2 + i) * 2;
      drawStar(ctx, starX, starY, 5, 9, 4, i < score ? "#FFD24D" : "rgba(255,255,255,0.45)");
    }

    // Draw particles
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / p.ttl);
      if (p.type === "star") {
        drawTinyStar(ctx, p.x, p.y, p.size, p.color, p.rot);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // If game ended, draw overlay screens (maintain win/loss)
    if (gameState === "victory") {
      drawOverlay(
        "Victory!",
        `You delivered ${score} drone packages! Fantastic work delivering the right answers.`,
        "🎉"
      );
      drawRestartButton();
    } else if (gameState === "gameover") {
      drawOverlay(
        "Game Over",
        `You ran out of lives after ${questionCount} questions. Try again to practice your math!`,
        "💥"
      );
      drawRestartButton();
    }

    requestAnimationFrame(render);
  }

  // Draw overlay for victory/game over
  function drawOverlay(title, subtitle, emoji) {
    // translucent background
    ctx.fillStyle = "rgba(2,12,22,0.56)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    // central box
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    const boxW = 560;
    const boxH = 220;
    const bx = CANVAS_WIDTH / 2 - boxW / 2;
    const by = CANVAS_HEIGHT / 2 - boxH / 2 - 20;
    roundRect(ctx, bx, by, boxW, boxH, 16);
    ctx.fill();

    // Title and subtitle
    ctx.textAlign = "center";
    ctx.fillStyle = "#04395E";
    ctx.font = "36px Arial";
    ctx.fillText(`${emoji} ${title}`, CANVAS_WIDTH / 2, by + 64);

    ctx.font = "18px Arial";
    ctx.fillStyle = "#074b6a";
    wrapText(ctx, subtitle, CANVAS_WIDTH / 2, by + 108, boxW - 80, 22);

    // hint
    ctx.font = "16px Arial";
    ctx.fillStyle = "#0b3d91";
    ctx.fillText("Press R or click Restart to play again.", CANVAS_WIDTH / 2, by + boxH - 24);
  }

  // Draw restart button
  function drawRestartButton() {
    const btnW = 180;
    const btnH = 48;
    const btnX = CANVAS_WIDTH / 2 - btnW / 2;
    const btnY = CANVAS_HEIGHT / 2 + 60;
    // subtle gradient
    const g = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    g.addColorStop(0, "#00C49A");
    g.addColorStop(1, "#00A896");
    ctx.fillStyle = g;
    roundRect(ctx, btnX, btnY, btnW, btnH, 12);
    ctx.fill();
    // label
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Restart (R)", CANVAS_WIDTH / 2, btnY + 32);
    // subtle drop shadow
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    roundRect(ctx, btnX, btnY, btnW, btnH, 12);
    ctx.stroke();
  }

  // Draw star helper
  function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius, color) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.stroke();
  }

  // draw tiny rotating star for particles
  function drawTinyStar(ctx, cx, cy, size, color, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    for (let i = 0; i < 5; i++) {
      ctx.rotate(Math.PI / 5);
      ctx.lineTo(0, -size * 0.5);
      ctx.rotate(Math.PI / 5);
      ctx.lineTo(0, -size);
    }
    ctx.fill();
    ctx.restore();
  }

  // Draw a wacky cloud using Bezier curves
  function drawWackyCloud(cx, cy, w, h, color1, color2, alpha = 1) {
    const grad = ctx.createRadialGradient(cx - w * 0.1, cy - h * 0.4, 8, cx, cy, w);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
    // add small lumps
    ctx.ellipse(cx - w * 0.4, cy - h * 0.2, w * 0.55, h * 0.55, -0.2, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.35, cy - h * 0.25, w * 0.45, h * 0.45, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Wrap text in canvas
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let currentY = y;
    ctx.textAlign = "center";
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + " ";
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  }

  // Draw propeller blades helper
  function drawPropeller(ctx, x, y, bladeLen = 5, color = "#333") {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, -bladeLen * 3, bladeLen, bladeLen * 2.6, (i * 2 * Math.PI) / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate((2 * Math.PI) / 3);
    }
    // hub
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(0, 0, bladeLen * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw city silhouette for background
  function drawCitySilhouette(t) {
    // far buildings
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#A8D8E6";
    const baseY = 330;
    for (let i = 0; i < 12; i++) {
      const bw = 40 + (i % 3) * 12;
      const bx = (i * 68 + Math.sin(t * 0.2 + i) * 6) % (CANVAS_WIDTH + 120) - 60;
      const bh = 40 + ((i * 37) % 140);
      roundRect(ctx, bx, baseY - bh, bw, bh, 6);
      ctx.fill();
    }
    ctx.restore();

    // near buildings
    ctx.save();
    ctx.fillStyle = "#7FB6C9";
    ctx.globalAlpha = 0.85;
    const base2 = 365;
    for (let i = 0; i < 8; i++) {
      const bw = 56 + (i % 2) * 34;
      const bx = (i * 96 + Math.cos(t * 0.15 + i) * 4) % (CANVAS_WIDTH + 180) - 90;
      const bh = 30 + ((i * 53) % 100);
      roundRect(ctx, bx, base2 - bh, bw, bh, 8);
      ctx.fill();
    }
    ctx.restore();
  }

  // Start animation loop
  requestAnimationFrame(render);

  // Ensure canvas does not overflow stage and is exact size
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  canvas.style.display = "block";

  // Provide visual cue for audio toggle when clicking stage background
  // Also handle first click to resume audio context and start ambient
  stage.addEventListener(
    "click",
    async () => {
      await ensureAudioRunning();
    },
    { once: true }
  );

  // Expose some debug methods for console if needed
  window._droneMathGame = {
    restart: restartGame,
    toggleAudio: toggleAudio,
    getState: () => ({ score, lives, questionCount, gameState })
  };
})();