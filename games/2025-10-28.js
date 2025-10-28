(function () {
  // Drone Math Adventure — Enhanced visuals & audio only
  // Renders inside element with id "game-of-the-day-stage"
  // All graphics drawn on canvas, sounds via Web Audio API
  // Game mechanics and math logic preserved

  // Config
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL_CORRECT = 10;
  const MAX_WRONG = 3;
  const PADDING = 12;

  // Get container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container with id 'game-of-the-day-stage' not found.");
    return;
  }
  // Clear and set up container
  container.innerHTML = "";
  container.style.position = "relative";
  container.style.width = WIDTH + "px";
  container.style.height = HEIGHT + "px";
  container.tabIndex = 0;

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.style.outline = "none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Accessibility: ARIA live region (visually hidden)
  const live = document.createElement("div");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  Object.assign(live.style, {
    position: "absolute",
    left: "8px",
    top: "8px",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(1px, 1px, 1px, 1px)",
    whiteSpace: "nowrap"
  });
  container.appendChild(live);

  // Game state (mechanics unchanged)
  let score = 0;
  let wrong = 0;
  let question = null;
  let selectedIndex = 0;
  let answeredCount = 0;
  let stage = "playing"; // playing, won, lost
  let hoverIndex = -1;
  let audioEnabled = true;
  let audioAvailable = true;
  let lastActionMessage = "";

  // Drone position + motion smoothing
  const drone = {
    x: WIDTH / 2,
    y: HEIGHT - 120,
    targetX: WIDTH / 2,
    targetY: HEIGHT - 120,
    speed: 6,
    bobOffset: 0
  };

  // Answer bubble positions
  const answerPositions = [
    { x: WIDTH / 2 - 180, y: HEIGHT / 2 - 10 },
    { x: WIDTH / 2 + 180, y: HEIGHT / 2 - 10 },
    { x: WIDTH / 2 - 90, y: HEIGHT / 2 + 120 },
    { x: WIDTH / 2 + 90, y: HEIGHT / 2 + 120 }
  ];

  // Colors (calming palette)
  const palette = {
    bgTop: "#e9fbff",
    bgBottom: "#f6fbff",
    panel: "#ffffff",
    soft: "#dff3f6",
    accent: "#62b6cb",
    accent2: "#8ecae6",
    correct: "#9be7a8",
    wrong: "#ffb4a2",
    text: "#073b4c",
    drone: "#ffd166",
    prop: "#a7c5bd",
    star: "#ffe066",
    shadow: "rgba(7,59,76,0.08)"
  };

  // Fonts
  const fonts = {
    important: "20px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    body: "16px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    small: "14px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
    title: "22px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
  };

  // Particles for subtle feedback (non-intrusive)
  const particles = [];

  // Web Audio setup with robust error handling
  let audioCtx = null;
  let masterGain = null;
  let ambientNodes = [];
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error("Web Audio API not supported");
    audioCtx = new AudioCtx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.55; // master volume for all generated sounds
    masterGain.connect(audioCtx.destination);

    // Gentle ambient pad: two detuned oscillators with low-pass filter and very low volume
    const padGain = audioCtx.createGain();
    padGain.gain.value = 0.0065; // extremely subtle
    const padFilter = audioCtx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 800;
    padFilter.Q.value = 0.7;
    padFilter.connect(padGain);
    padGain.connect(masterGain);

    function createPadOsc(freq, detune = 0, type = "sine") {
      const osc = audioCtx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const oscGain = audioCtx.createGain();
      oscGain.gain.value = 0.8;
      osc.connect(oscGain);
      oscGain.connect(padFilter);
      try {
        osc.start(0);
      } catch (e) {
        // ignore if already started
      }
      ambientNodes.push({ osc, gain: oscGain });
    }

    // Chordal pad: three tones low volume
    createPadOsc(110, -3, "sine"); // A2-ish
    createPadOsc(138.59, 0, "sine"); // C#3-ish
    createPadOsc(165, 3, "sine"); // E3-ish
  } catch (e) {
    console.warn("Audio unavailable:", e);
    audioAvailable = false;
    audioEnabled = false;
  }

  function tryResumeAudio() {
    if (!audioAvailable || !audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch((e) => {
        console.warn("Audio resume failed:", e);
      });
    }
  }

  // Generic short tone with envelope
  function playBeep(freq = 880, type = "sine", duration = 0.12, volume = 0.12) {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.connect(g);
      g.connect(masterGain);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(volume, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      console.warn("playBeep error", e);
    }
  }

  // Layered correct sound: quick pleasant chime
  function playCorrectSound() {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      playToneAt(660, 0.08, now, "sine", 0.08);
      playToneAt(880, 0.09, now + 0.08, "sine", 0.07);
      playToneAt(1100, 0.12, now + 0.17, "triangle", 0.06);
      // small sparkle particles
      spawnParticles(drone.targetX, drone.targetY, 18, palette.correct);
    } catch (e) {
      console.warn("correct sound error", e);
    }
  }

  // Wrong sound: soft short buzz (non-jarring)
  function playWrongSound() {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const now = audioCtx.currentTime;
      playToneAt(260, 0.16, now, "sawtooth", 0.08);
      playToneAt(200, 0.12, now + 0.06, "sine", 0.06);
      spawnParticles(drone.targetX, drone.targetY, 12, palette.wrong);
    } catch (e) {
      console.warn("wrong sound error", e);
    }
  }

  // Movement and hover sounds (subtle)
  function playMoveSound() {
    if (!audioAvailable || !audioEnabled) return;
    playBeep(480, "triangle", 0.07, 0.045);
  }
  function playHoverSound() {
    if (!audioAvailable || !audioEnabled) return;
    playBeep(720, "sine", 0.04, 0.02);
  }

  // Low-level tone helper
  function playToneAt(freq, dur = 0.1, when = 0, type = "sine", vol = 0.08) {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.start(when);
      o.stop(when + dur + 0.02);
    } catch (e) {
      console.warn("playToneAt error", e);
    }
  }

  // Particle system utilities
  function spawnParticles(x, y, count, colorStr) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 2.4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        life: 0,
        ttl: 60 + Math.floor(Math.random() * 40),
        size: 2 + Math.random() * 4,
        color: colorStr || palette.star
      });
    }
  }

  // Game logic preserved (question generation)
  function generateQuestion() {
    const type = Math.random();
    let a, b, text, correct;
    if (type < 0.45) {
      // addition
      a = randInt(1, 20);
      b = randInt(1, Math.min(20, 20 - a));
      correct = a + b;
      text = `${a} + ${b} = ?`;
    } else if (type < 0.85) {
      // subtraction
      a = randInt(2, 20);
      b = randInt(1, a - 1);
      correct = a - b;
      text = `${a} - ${b} = ?`;
    } else {
      // multiplication small
      a = randInt(2, 7);
      b = randInt(2, 5);
      correct = a * b;
      text = `${a} × ${b} = ?`;
    }

    // Generate 3 distractors
    const choices = new Set([correct]);
    while (choices.size < 4) {
      let delta = randInt(-5, 5);
      if (delta === 0) delta = 1;
      let val = correct + delta;
      if (val < 0) val = correct + Math.abs(delta) + 1;
      choices.add(val);
    }
    const arr = shuffle(Array.from(choices));
    return { text, correct, choices: arr };
  }

  // Utility functions
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Initialize first question
  function nextQuestion() {
    question = generateQuestion();
    selectedIndex = 0;
    hoverIndex = -1;
    announce(`New question: ${question.text}. Use arrow keys or click an answer. Press Enter to choose.`);
  }

  function announce(text) {
    lastActionMessage = text;
    tryResumeAudio();
    live.textContent = text;
  }

  // Drawing helpers
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    return ctx;
  }

  function drawTextWithPanel(text, x, y, font, textColor, bgColor, padding = 10, align = "left") {
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width);
    const h = parseInt(font, 10) || 16;
    let rectX = x;
    if (align === "center") rectX = x - (w / 2) - padding;
    if (align === "right") rectX = x - (w + padding * 2);
    const rectY = y - h - padding / 2;
    ctx.fillStyle = bgColor;
    roundRect(ctx, rectX, rectY, w + padding * 2, h + padding, 8).fill();
    ctx.fillStyle = textColor;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(text, align === "center" ? x : (rectX + padding), rectY + (padding / 4));
    return { x: rectX, y: rectY, w: w + padding * 2, h: h + padding };
  }

  // Background rendering with parallax clouds and subtle animated stars
  const cloudOffsets = Array.from({ length: 5 }).map((_, i) => ({
    x: Math.random() * WIDTH,
    y: 30 + i * 50 + Math.random() * 20,
    scale: 0.7 + Math.random() * 0.6,
    speed: 0.15 + Math.random() * 0.2
  }));

  function drawBackground(time) {
    // vertical gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, palette.bgTop);
    g.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle sun glow
    const sunX = 80;
    const sunY = 70;
    const radial = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 160);
    radial.addColorStop(0, "rgba(255,238,180,0.25)");
    radial.addColorStop(1, "rgba(255,238,180,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // parallax clouds, gently moving
    cloudOffsets.forEach((c, i) => {
      c.x += c.speed * (i % 2 === 0 ? 1 : 0.6);
      if (c.x > WIDTH + 120) c.x = -120;
      ctx.save();
      ctx.globalAlpha = 0.9 - i * 0.1;
      ctx.fillStyle = `rgba(255,255,255,0.95)`;
      ctx.beginPath();
      const cx = c.x;
      const cy = c.y + Math.sin((time / 1000) + i) * 6;
      ctx.ellipse(cx, cy, 64 * c.scale, 28 * c.scale, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 36 * c.scale, cy - 12 * c.scale, 44 * c.scale, 20 * c.scale, -0.2, 0, Math.PI * 2);
      ctx.ellipse(cx - 40 * c.scale, cy - 6 * c.scale, 36 * c.scale, 18 * c.scale, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // distant hills
    ctx.fillStyle = palette.soft;
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 150);
    ctx.quadraticCurveTo(90, HEIGHT - 230, 180, HEIGHT - 150);
    ctx.quadraticCurveTo(310, HEIGHT - 80, 360, HEIGHT - 150);
    ctx.quadraticCurveTo(460, HEIGHT - 260, 540, HEIGHT - 150);
    ctx.quadraticCurveTo(620, HEIGHT - 90, WIDTH, HEIGHT - 140);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();

    // subtle floating geometric decorations
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.globalAlpha = 0.08 + (i % 2) * 0.04;
      ctx.fillStyle = palette.accent2;
      const rx = (i * 137 + ((time / 50) % 200)) % WIDTH;
      const ry = 120 + (i % 3) * 40;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 28, 12, Math.sin(i + time / 2300), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw drone with gentle bob and rotor blur
  function drawDrone(x, y, time) {
    // shadow
    ctx.fillStyle = "rgba(7,59,76,0.06)";
    ctx.beginPath();
    ctx.ellipse(x, y + 28, 52, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // bob
    const bob = Math.sin(time / 350) * 4;
    const by = bob;

    // body
    ctx.fillStyle = palette.drone;
    roundRect(ctx, x - 46, y - 20 + by, 92, 40, 14).fill();

    // panel highlight
    const grad = ctx.createLinearGradient(x - 46, y - 20 + by, x + 46, y + 20 + by);
    grad.addColorStop(0, "rgba(255,255,255,0.4)");
    grad.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.fillStyle = grad;
    roundRect(ctx, x - 46, y - 20 + by, 92, 40, 14).fill();

    // cockpit window
    ctx.fillStyle = palette.panel;
    roundRect(ctx, x - 22, y - 16 + by, 44, 32, 9).fill();

    // antenna
    ctx.strokeStyle = "rgba(7,59,76,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 18, y - 6 + by);
    ctx.lineTo(x + 30, y - 30 + by);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 30, y - 30 + by, 3, 0, Math.PI * 2);
    ctx.fillStyle = palette.accent;
    ctx.fill();

    // propellers: blurred arcs to suggest motion
    const props = [
      { dx: -52, dy: -26 },
      { dx: 52, dy: -26 },
      { dx: -52, dy: 26 },
      { dx: 52, dy: 26 }
    ];
    props.forEach((p, i) => {
      const t = performance.now() / 80;
      const rot = t + (i * Math.PI) / 2;
      ctx.save();
      ctx.translate(x + p.dx, y + p.dy + by);
      ctx.rotate(rot);
      const gradP = ctx.createLinearGradient(-18, 0, 18, 0);
      gradP.addColorStop(0, "rgba(167,197,189,0.9)");
      gradP.addColorStop(1, "rgba(167,197,189,0.25)");
      ctx.fillStyle = gradP;
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // cute sticker text
    ctx.font = "12px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(7,59,76,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DRØN", x, y + 6 + by);
  }

  // Answer bubble drawing (with subtle depth)
  function drawAnswerBubble(idx, text, isSelected, isHover, time) {
    const pos = answerPositions[idx];
    ctx.font = fonts.body;
    const m = ctx.measureText(String(text));
    const w = Math.max(60, m.width + 24);
    const h = 44;
    const radius = Math.max(36, Math.ceil(Math.max(w, h) / 2));
    // background
    ctx.save();
    const pulse = isSelected ? 0.98 + Math.sin(time / 320) * 0.02 : 1;
    ctx.translate(pos.x, pos.y);
    ctx.scale(pulse, pulse);
    ctx.translate(-pos.x, -pos.y);

    ctx.beginPath();
    ctx.fillStyle = isSelected ? "rgba(255,247,230,1)" : "rgba(255,255,255,0.98)";
    ctx.strokeStyle = isHover ? palette.accent : "rgba(10,80,90,0.08)";
    ctx.lineWidth = isSelected ? 3 : 2;
    roundRect(ctx, pos.x - radius, pos.y - radius, radius * 2, radius * 2, 18).fill();
    roundRect(ctx, pos.x - radius, pos.y - radius, radius * 2, radius * 2, 18).stroke();

    // small emblem
    ctx.fillStyle = palette.star;
    ctx.beginPath();
    ctx.moveTo(pos.x - radius + 14, pos.y - 6);
    ctx.lineTo(pos.x - radius + 20, pos.y - 14);
    ctx.lineTo(pos.x - radius + 26, pos.y - 6);
    ctx.lineTo(pos.x - radius + 18, pos.y - 2);
    ctx.closePath();
    ctx.fill();

    // numeric text
    ctx.fillStyle = palette.text;
    ctx.font = fonts.important;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text), pos.x, pos.y);
    ctx.restore();
    return { x: pos.x - radius, y: pos.y - radius, w: radius * 2, h: radius * 2 };
  }

  // UI Draw ensuring spacing and alignment
  function drawUI(time) {
    // top-left score
    const scoreText = `Correct: ${score}/${GOAL_CORRECT}`;
    drawTextWithPanel(scoreText, PADDING + 8, PADDING + 28, fonts.title, palette.text, palette.panel, 12, "left");

    // top-right lives
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrong)}`;
    drawTextWithPanel(livesText, WIDTH - (PADDING + 8), PADDING + 28, fonts.title, palette.text, palette.panel, 12, "right");

    // Audio label small panel beneath lives
    ctx.font = fonts.small;
    ctx.textAlign = "right";
    const audioLabel = audioAvailable ? (audioEnabled ? "Audio: On (M)" : "Audio: Off (M)") : "Audio: Unavailable";
    const audioW = ctx.measureText(audioLabel).width + 28;
    const audioX = WIDTH - (PADDING + 8);
    ctx.fillStyle = palette.panel;
    roundRect(ctx, audioX - audioW, PADDING + 48, audioW, 28, 8).fill();
    ctx.fillStyle = palette.text;
    ctx.textBaseline = "middle";
    ctx.fillText(audioLabel, audioX - 12, PADDING + 62);

    // Question top-center panel
    ctx.font = fonts.title;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const qText = question ? question.text : "Loading...";
    const qMetrics = ctx.measureText(qText);
    const qW = qMetrics.width;
    const qX = WIDTH / 2;
    const qY = 56;
    ctx.fillStyle = palette.panel;
    roundRect(ctx, qX - qW / 2 - 18, qY - 8, qW + 36, 44, 10).fill();
    ctx.fillStyle = palette.text;
    ctx.fillText(qText, qX, qY);

    // Instructions bottom-center
    const instr = "Arrows: move • Enter: pick • Click bubbles • M: audio • R: restart";
    ctx.font = fonts.small;
    ctx.textAlign = "center";
    const im = ctx.measureText(instr);
    const ipW = im.width;
    const ipX = WIDTH / 2 - ipW / 2 - 12;
    const ipY = HEIGHT - 56;
    ctx.fillStyle = palette.panel;
    roundRect(ctx, ipX, ipY, ipW + 24, 36, 8).fill();
    ctx.fillStyle = palette.text;
    ctx.fillText(instr, WIDTH / 2, ipY + 7);

    // Last action message (above instructions) with padding
    if (lastActionMessage) {
      ctx.font = fonts.small;
      ctx.textAlign = "center";
      const am = ctx.measureText(lastActionMessage);
      const amW = Math.min(560, am.width);
      const amX = WIDTH / 2 - amW / 2 - 12;
      const amY = HEIGHT - 100;
      ctx.fillStyle = palette.panel;
      roundRect(ctx, amX, amY, amW + 24, 32, 8).fill();
      ctx.fillStyle = palette.text;
      ctx.fillText(lastActionMessage, WIDTH / 2, amY + 6);
    }
  }

  // Render loop
  function render(time) {
    time = time || performance.now();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background
    drawBackground(time);

    // Answer panel background (contrasting card)
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, WIDTH / 2 - 320, HEIGHT / 2 - 140, 640, 260, 14).fill();

    // Draw choices
    let bubbleRects = [];
    if (question) {
      for (let i = 0; i < 4; i++) {
        const isSelected = i === selectedIndex;
        const isHover = i === hoverIndex;
        bubbleRects.push(drawAnswerBubble(i, question.choices[i], isSelected, isHover, time));
      }
    }

    // Drone movement smoothing and bob
    const dx = drone.targetX - drone.x;
    const dy = drone.targetY - drone.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      drone.x += (dx / dist) * Math.min(drone.speed, dist);
      drone.y += (dy / dist) * Math.min(drone.speed, dist);
    } else {
      drone.x = drone.targetX;
      drone.y = drone.targetY;
    }

    // Draw drone (with time for animation)
    drawDrone(drone.x, drone.y, time);

    // Particles update & draw
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.04; // gravity subtle
      p.x += p.vx;
      p.y += p.vy;
      p.life++;
      const alpha = Math.max(0, 1 - p.life / p.ttl);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * (1 - p.life / p.ttl)), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (p.life >= p.ttl) particles.splice(i, 1);
    }

    // UI
    drawUI(time);

    // Progress bar center-bottom
    const progressW = 300;
    const progressX = WIDTH / 2 - progressW / 2;
    const progressY = HEIGHT - 140;
    ctx.fillStyle = "#eaf6f9";
    roundRect(ctx, progressX, progressY, progressW, 18, 10).fill();
    const pct = Math.min(1, score / GOAL_CORRECT);
    ctx.fillStyle = palette.accent;
    roundRect(ctx, progressX, progressY, Math.max(6, progressW * pct), 18, 10).fill();

    // Draw small drone shadow trail when moving
    if (dist > 8) {
      ctx.save();
      ctx.fillStyle = "rgba(7,59,76,0.04)";
      ctx.beginPath();
      ctx.ellipse(drone.x, drone.y + 36, 36, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Victory or Game Over overlays
    if (stage === "won") {
      drawEndScreen(true);
    } else if (stage === "lost") {
      drawEndScreen(false);
    }
  }

  // End screen draw (preserve win/loss logic & messaging)
  let endButtonRect = null;
  function drawEndScreen(won) {
    // translucent overlay
    ctx.fillStyle = "rgba(7,59,76,0.28)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // panel
    const panelW = 520;
    const panelH = 260;
    const px = WIDTH / 2 - panelW / 2;
    const py = HEIGHT / 2 - panelH / 2;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, px, py, panelW, panelH, 18).fill();

    // celebratory/debrief icon (subtle)
    ctx.save();
    ctx.translate(WIDTH / 2, py + 50);
    if (won) {
      // gentle trophy-like icon
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.ellipse(-28, -6, 22, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.star;
      ctx.beginPath();
      ctx.moveTo(18, -12);
      ctx.lineTo(28, -28);
      ctx.lineTo(38, -12);
      ctx.lineTo(28, -6);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = palette.wrong;
      ctx.beginPath();
      ctx.rect(-32, -18, 48, 36);
      ctx.fill();
    }
    ctx.restore();

    // Text
    ctx.fillStyle = palette.text;
    ctx.font = fonts.title;
    ctx.textAlign = "center";
    ctx.fillText(won ? "Victory! Drone Mission Complete" : "Game Over — Drone Landed", WIDTH / 2, py + 26);

    ctx.font = fonts.important;
    ctx.fillText(won ? `You answered ${score} correct!` : `You answered ${score} correct and had ${wrong} wrong.`, WIDTH / 2, py + 70);

    ctx.font = fonts.body;
    ctx.fillText(won ? "Great flying! Press R or click Restart to fly again." : "Try again! Press R or click Restart to retry.", WIDTH / 2, py + 108);

    // Restart button
    const btnW = 160;
    const btnH = 44;
    const bx = WIDTH / 2 - btnW / 2;
    const by = py + panelH - 76;
    ctx.fillStyle = palette.accent;
    roundRect(ctx, bx, by, btnW, btnH, 10).fill();
    ctx.fillStyle = "#072a2a";
    ctx.font = fonts.important;
    ctx.fillText("Restart (R)", WIDTH / 2, by + 12);

    // record rect for click detection
    endButtonRect = { x: bx, y: by, w: btnW, h: btnH };
  }

  // Interaction handlers
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const prevHover = hoverIndex;
    hoverIndex = -1;
    for (let i = 0; i < answerPositions.length; i++) {
      const p = answerPositions[i];
      const dx = mx - p.x;
      const dy = my - p.y;
      if (Math.hypot(dx, dy) <= 48) {
        hoverIndex = i;
        break;
      }
    }
    if (hoverIndex >= 0) {
      canvas.style.cursor = "pointer";
      if (prevHover !== hoverIndex) {
        playHoverSound();
      }
    } else {
      canvas.style.cursor = "default";
    }
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // If end screen showing, check restart button
    if (stage === "won" || stage === "lost") {
      if (
        endButtonRect &&
        mx >= endButtonRect.x &&
        mx <= endButtonRect.x + endButtonRect.w &&
        my >= endButtonRect.y &&
        my <= endButtonRect.y + endButtonRect.h
      ) {
        restartGame();
        return;
      }
    }

    // clicking an answer bubble
    for (let i = 0; i < answerPositions.length; i++) {
      const p = answerPositions[i];
      if (Math.hypot(mx - p.x, my - p.y) <= 48) {
        selectIndex(i);
        confirmSelection();
        return;
      }
    }
  });

  function selectIndex(i) {
    selectedIndex = i;
    const pos = answerPositions[i];
    drone.targetX = pos.x;
    drone.targetY = pos.y - 90;
    playMoveSound();
  }

  // Keyboard controls unchanged semantically
  window.addEventListener("keydown", (e) => {
    // require container to be focused to interact
    const key = e.key;
    if (stage === "playing") {
      if (key === "ArrowLeft" || key === "ArrowUp") {
        selectedIndex = (selectedIndex + 3) % 4;
        selectIndex(selectedIndex);
        e.preventDefault();
      } else if (key === "ArrowRight" || key === "ArrowDown") {
        selectedIndex = (selectedIndex + 1) % 4;
        selectIndex(selectedIndex);
        e.preventDefault();
      } else if (key === "Enter" || key === " ") {
        confirmSelection();
        e.preventDefault();
      } else if (key.toLowerCase() === "m") {
        audioEnabled = !audioEnabled;
        if (audioEnabled) tryResumeAudio();
        announce(`Audio ${audioEnabled ? "enabled" : "muted"}.`);
      } else if (key.toLowerCase() === "r") {
        restartGame();
      }
    } else {
      if (key.toLowerCase() === "r" || key === "Enter") restartGame();
      if (key.toLowerCase() === "m") {
        audioEnabled = !audioEnabled;
        announce(`Audio ${audioEnabled ? "enabled" : "muted"}.`);
      }
    }
  });

  function confirmSelection() {
    if (!question || stage !== "playing") return;
    const chosen = question.choices[selectedIndex];
    answeredCount++;
    drone.targetX = answerPositions[selectedIndex].x;
    drone.targetY = answerPositions[selectedIndex].y - 90;

    if (chosen === question.correct) {
      score++;
      playCorrectSound();
      announce(`Correct! ${question.correct}. ${score} out of ${GOAL_CORRECT}.`);
    } else {
      wrong++;
      playWrongSound();
      announce(
        `Oops! ${chosen} is not correct. The right answer was ${question.correct}. Lives left: ${Math.max(
          0,
          MAX_WRONG - wrong
        )}.`
      );
    }

    // Delay before next question to show feedback
    if (score >= GOAL_CORRECT) {
      setTimeout(() => {
        stage = "won";
        announce("Victory! You completed the mission. Press R to play again.");
      }, 600);
    } else if (wrong >= MAX_WRONG) {
      setTimeout(() => {
        stage = "lost";
        announce("Game Over. Press R to try again.");
      }, 600);
    } else {
      setTimeout(() => {
        nextQuestion();
      }, 700);
    }
  }

  function restartGame() {
    score = 0;
    wrong = 0;
    answeredCount = 0;
    stage = "playing";
    selectedIndex = 0;
    drone.x = WIDTH / 2;
    drone.y = HEIGHT - 120;
    drone.targetX = drone.x;
    drone.targetY = drone.y;
    particles.length = 0;
    announce("Game restarted. Good luck!");
    nextQuestion();
  }

  // Initialize
  try {
    nextQuestion();
  } catch (e) {
    console.error("Question generation failed", e);
    announce("Error initializing the game. Try reloading the page.");
    stage = "lost";
  }

  // Animation loop
  function loop(ts) {
    render(ts);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Ensure container focus
  container.addEventListener("click", () => {
    container.focus();
    tryResumeAudio();
  });

  // Expose debug helpers
  window.__droneMathGame = {
    restart: restartGame,
    getState: () => ({ score, wrong, stage, question }),
    toggleAudio: () => {
      audioEnabled = !audioEnabled;
    }
  };

  // Audio context state handling
  if (audioAvailable && audioCtx) {
    audioCtx.onstatechange = () => {
      if (audioCtx.state === "suspended") {
        audioEnabled = false;
        announce("Audio suspended by browser. Press any key to enable sounds.");
      } else {
        audioEnabled = true;
      }
    };
  }

  // Initial instructions
  announce(
    "Welcome to Drone Math Adventure! Answer 10 questions correctly. You can make 3 mistakes. Click to focus. Use arrows and Enter or click answers. Press M to toggle audio. Good luck!"
  );
})();