(function () {
  // Machine Math: Canvas game for ages 7-9
  // Renders inside element with ID 'game-of-the-day-stage'
  // All graphics drawn on canvas. Sounds produced with Web Audio API oscillators.
  // Accessible: keyboard controls, ARIA live text, instructions on canvas, visual audio indicator.
  // Author: AI educational game designer (visual/audio improvements)

  // CONFIG
  const WIDTH = 720;
  const HEIGHT = 480;
  const STAGE_ID = "game-of-the-day-stage";
  const MAX_LEVEL = 5;
  const INITIAL_LIVES = 3;

  // UTILITIES
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  function choose(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Ensure stage exists
  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error("Game mount element not found: #" + STAGE_ID);
    return;
  }

  // Clear stage
  stage.innerHTML = "";
  stage.style.position = "relative";

  // Create ARIA live region (for screen readers)
  const ariaStatus = document.createElement("div");
  ariaStatus.setAttribute("role", "status");
  ariaStatus.setAttribute("aria-live", "polite");
  ariaStatus.style.position = "absolute";
  ariaStatus.style.left = "-9999px";
  ariaStatus.style.width = "1px";
  ariaStatus.style.height = "1px";
  ariaStatus.style.overflow = "hidden";
  stage.appendChild(ariaStatus);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("tabindex", "0"); // focusable
  canvas.style.outline = "none";
  stage.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  // VISUAL ANIMATION STATE
  const particles = []; // confetti / spark particles
  const ambientBubbles = []; // slow floating bubbles for background
  for (let i = 0; i < 8; i++) {
    ambientBubbles.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      r: 10 + Math.random() * 30,
      speed: 0.1 + Math.random() * 0.3,
      drift: (Math.random() - 0.5) * 0.2,
      alpha: 0.05 + Math.random() * 0.12
    });
  }

  // Setup audio manager (improved ambient pad, LFO, analyser and richer effects)
  class AudioManager {
    constructor() {
      this.enabled = false;
      this.ctx = null;
      this.masterGain = null;
      this.padGain = null;
      this.padOsc1 = null;
      this.padOsc2 = null;
      this.lfo = null;
      this.available = false;
      this.analyser = null;
      this.muted = false;
      this.init();
    }

    async init() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error("Web Audio API not supported");
        this.ctx = new AudioCtx();

        // Create master gain and analyser
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.12; // gentle overall level
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        // Connect chain: masterGain -> analyser -> destination
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Soft ambient pad: two detuned oscillators through a warm lowpass filter
        const warmFilter = this.ctx.createBiquadFilter();
        warmFilter.type = "lowpass";
        warmFilter.frequency.value = 900;
        warmFilter.Q.value = 0.8;

        this.padGain = this.ctx.createGain();
        this.padGain.gain.value = 0.045; // base pad volume
        this.padGain.connect(warmFilter);
        warmFilter.connect(this.masterGain);

        // Pad oscillators
        this.padOsc1 = this.ctx.createOscillator();
        this.padOsc1.type = "sine";
        this.padOsc1.frequency.value = 110; // low base

        this.padOsc2 = this.ctx.createOscillator();
        this.padOsc2.type = "sawtooth";
        this.padOsc2.frequency.value = 110 * 1.006; // slight detune

        // gentle LFO to modulate pad amplitude for breathing effect
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = "sine";
        this.lfo.frequency.value = 0.08; // very slow
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.03; // modulation depth
        this.lfo.connect(lfoGain);
        try {
          lfoGain.connect(this.padGain.gain);
        } catch (err) {
          // If connecting to AudioParam fails, ignore - not critical
        }

        // Start pad oscillators
        this.padOsc1.connect(this.padGain);
        this.padOsc2.connect(this.padGain);

        this.padOsc1.start();
        this.padOsc2.start();
        this.lfo.start();

        this.available = true;
        this.enabled = true;
      } catch (e) {
        console.warn("Audio initialization failed:", e);
        this.available = false;
        this.enabled = false;
      }
    }

    async resumeIfNeeded() {
      if (!this.ctx) return;
      try {
        if (this.ctx.state === "suspended") {
          await this.ctx.resume();
        }
      } catch (e) {
        console.warn("Audio resume failed:", e);
      }
    }

    setMuted(m) {
      this.muted = !!m;
      if (this.masterGain) {
        // Smooth transition when muting/unmuting
        const now = this.ctx.currentTime;
        try {
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
          this.masterGain.gain.linearRampToValueAtTime(this.muted ? 0.0 : 0.12, now + 0.15);
        } catch (e) {
          // fallback direct set
          this.masterGain.gain.value = this.muted ? 0 : 0.12;
        }
      }
    }

    // Correct chime: layered warm chord with slight echo
    playCorrect() {
      if (!this.available || this.muted) return;
      try {
        const now = this.ctx.currentTime;
        const base = 440; // A4
        const intervals = [0, 5 / 12, 9 / 12]; // major-ish triad: root, major third (~4), perfect fifth (~7) adjusted slightly
        const delay = this.ctx.createDelay();
        delay.delayTime.value = 0.08;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.12;
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(this.masterGain);

        const outGain = this.ctx.createGain();
        outGain.gain.value = 0.0;
        outGain.connect(delay);
        outGain.connect(this.masterGain);

        intervals.forEach((interval, i) => {
          const o = this.ctx.createOscillator();
          // warm detuned triangle
          o.type = "triangle";
          o.frequency.value = base * Math.pow(2, interval);
          o.detune.value = (i - 1) * 4; // slight detune for texture
          const g = this.ctx.createGain();
          g.gain.value = 0;
          o.connect(g);
          g.connect(outGain);
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(0.08, now + 0.01 + i * 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 + i * 0.02);
          o.start(now + i * 0.02);
          o.stop(now + 0.5 + i * 0.02);
        });
      } catch (e) {
        console.warn("playCorrect error:", e);
      }
    }

    // incorrect buzzer: falling sawtooth with a ripple filter
    playIncorrect() {
      if (!this.available || this.muted) return;
      try {
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(420, now);
        // downward slide
        o.frequency.exponentialRampToValueAtTime(120, now + 0.36);

        const filt = this.ctx.createBiquadFilter();
        filt.type = "bandpass";
        filt.frequency.value = 450;
        filt.Q.value = 6;

        const g = this.ctx.createGain();
        g.gain.value = 0.0001;
        o.connect(filt);
        filt.connect(g);
        g.connect(this.masterGain);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.16, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
        o.start(now);
        o.stop(now + 0.5);
      } catch (e) {
        console.warn("playIncorrect error:", e);
      }
    }

    // single click / place sound: soft bell + subtle resonant high
    playClick() {
      if (!this.available || this.muted) return;
      try {
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = 740;
        const g = this.ctx.createGain();
        g.gain.value = 0.0001;
        const filt = this.ctx.createBiquadFilter();
        filt.type = "highpass";
        filt.frequency.value = 500;
        o.connect(filt);
        filt.connect(g);
        g.connect(this.masterGain);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.06, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        o.start(now);
        o.stop(now + 0.2);
      } catch (e) {
        console.warn("playClick error:", e);
      }
    }

    dispose() {
      try {
        if (this.padOsc1) this.padOsc1.stop();
        if (this.padOsc2) this.padOsc2.stop();
        if (this.lfo) this.lfo.stop();
        if (this.ctx && this.ctx.close) this.ctx.close();
      } catch (e) {
        // ignore
      }
    }
  }

  const audio = new AudioManager();

  // GAME STATE
  let game = {
    level: 1,
    lives: INITIAL_LIVES,
    score: 0,
    target: 0,
    slots: 2,
    cogValues: [],
    selectedCogIndex: null,
    placed: [], // values or null per slot
    draggingIndex: null,
    statusMessage: "Welcome! Click or press Enter to begin.",
    hintUsed: false,
    levelComplete: false,
    finished: false,
    audioEnabled: audio.available,
    // visual flags
    lastCorrectVisualSpawn: 0
  };

  // Accessibility helper
  function announce(msg) {
    try {
      ariaStatus.textContent = msg;
    } catch (e) {
      // ignore
    }
  }

  // Generate solvable puzzle for a level
  function generateLevel(level) {
    const slots = clamp(2 + Math.floor((level - 1) / 2), 2, 3); // level 1-2:2, 3-4:3 maybe
    // Set target range based on level
    const minTarget = 5 + (level - 1) * 2;
    const maxTarget = 12 + (level - 1) * 4;
    // We'll choose a combination of 'slots' numbers to form target
    const chosen = [];
    for (let i = 0; i < slots; i++) {
      // pick components to create interesting combos
      chosen.push(randInt(1, Math.max(8, Math.floor(maxTarget / (slots + 1)))));
    }
    // Adjust to make target reachable
    let target = chosen.reduce((a, b) => a + b, 0);
    // Randomly nudge target into the desired range by adding another term if needed
    if (target < minTarget) {
      target += randInt(minTarget - target, Math.max(1, minTarget - target + 3));
    }
    if (target > maxTarget) {
      // reduce some elements
      while (target > maxTarget && chosen.length && Math.random() < 0.8) {
        const i = randInt(0, chosen.length - 1);
        const reduce = randInt(1, Math.floor(chosen[i] / 2) + 1);
        chosen[i] = Math.max(1, chosen[i] - reduce);
        target = chosen.reduce((a, b) => a + b, 0);
      }
      // if still big, set target to something smaller by trimming last
      if (target > maxTarget) {
        target = Math.min(maxTarget, Math.max(minTarget, target));
      }
    }
    // Now create distractor cogs and final cog list
    const totalCogs = 6;
    const cogs = [];
    // Place the chosen numbers among the cogs
    const chosenCopy = chosen.slice();
    while (chosenCopy.length < Math.min(totalCogs, chosen.length + 2)) {
      // sometimes add an extra useful cog
      chosenCopy.push(randInt(1, 9));
    }
    // Fill with left over distractors
    while (cogs.length < totalCogs) {
      if (chosenCopy.length > 0) {
        cogs.push(chosenCopy.pop());
      } else {
        // produce distractor number but avoid exactly making new valid combos accidentally
        cogs.push(randInt(1, Math.max(10, Math.floor(maxTarget / 2))));
      }
    }
    // Shuffle
    for (let i = cogs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cogs[i], cogs[j]] = [cogs[j], cogs[i]];
    }
    // Ensure solvable: check if there's a combination of 'slots' from cogs that sum to target
    function existsCombination(nums, k, targetSum) {
      function helper(i, k, sum) {
        if (k === 0) return sum === targetSum;
        if (i >= nums.length) return false;
        // choose
        if (helper(i + 1, k - 1, sum + nums[i])) return true;
        // skip
        return helper(i + 1, k, sum);
      }
      return helper(0, k, 0);
    }
    // If not solvable, forcibly build a solvable set by ensuring chosen slots included
    if (!existsCombination(cogs, slots, target)) {
      // replace first 'slots' elements with chosen numbers that sum to target
      const forced = [];
      // Try to find integer partition of target into 'slots' parts using numbers between 1-12
      if (slots === 2) {
        const a = randInt(1, target - 1);
        forced.push(a, target - a);
      } else {
        // 3 slots
        const a = randInt(1, Math.max(1, Math.floor(target / 3)));
        const b = randInt(1, Math.max(1, Math.floor((target - a) / 2)));
        const c = target - a - b;
        forced.push(a, b, c);
      }
      // Place forced into cogs
      for (let i = 0; i < forced.length && i < cogs.length; i++) {
        cogs[i] = Math.max(1, forced[i]);
      }
    }

    return {
      target: target,
      slots: slots,
      cogs: cogs
    };
  }

  // Initialize or reset level
  function startLevel(lvl) {
    const data = generateLevel(lvl);
    game.level = lvl;
    game.target = data.target;
    game.slots = data.slots;
    game.cogValues = data.cogs;
    game.selectedCogIndex = null;
    game.placed = new Array(game.slots).fill(null);
    game.draggingIndex = null;
    game.statusMessage = `Level ${lvl}: Make ${game.target} by placing ${game.slots} cog${game.slots > 1 ? "s" : ""}.`;
    game.hintUsed = false;
    game.levelComplete = false;
    game.finished = false;
    game._placedIndices = new Array(game.slots).fill(null);
    announce(game.statusMessage);
  }

  // Particle helpers (confetti)
  function spawnParticles(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 3.5,
        vy: -1.5 - Math.random() * 2.5,
        size: 4 + Math.random() * 8,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        color: choose(["#FFD66B", "#FFAB91", "#A6E3A1", "#BEE7FF", "#F6C1FF", "#FDE68A"]),
        life: 60 + Math.floor(Math.random() * 40)
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.08; // gravity
      p.vx *= 0.998;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      p.life -= 1;
      if (p.life <= 0 || p.y > HEIGHT + 40) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = clamp(p.life / 120, 0, 1);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
  }

  // Draw functions
  function draw() {
    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background - layered soft gradients and gentle bubbles
    drawBackground();

    // Floating ambient elements
    drawFloatingGearsAndRibbons();

    // Panel for machine
    drawMachinePanel();

    // Draw cogs area
    drawCogsArea();

    // Draw HUD: level, lives, score, audio indicator and analyser
    drawHUD();

    // Draw particles confetti if any
    drawParticles();

    // Draw instructions and status at bottom
    drawFooter();
  }

  function drawBackground() {
    // soft vertical gradient
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, "#F3FAFD");
    grad.addColorStop(0.6, "#FAF8F2");
    grad.addColorStop(1, "#FFF9F1");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ambient bubbles
    for (const b of ambientBubbles) {
      b.y -= b.speed;
      b.x += b.drift;
      if (b.y + b.r < -20) {
        b.y = HEIGHT + b.r;
        b.x = Math.random() * WIDTH;
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(200,230,255,${b.alpha})`;
      ctx.ellipse(b.x, b.y, b.r, b.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFloatingGearsAndRibbons() {
    // subtle decorative ribbons
    ctx.save();
    const t = Date.now() / 2000;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-40, 60 + i * 80 + Math.sin(t + i) * 10);
      ctx.bezierCurveTo(
        200 + Math.cos(t + i) * 30,
        20 + i * 70,
        520 - Math.cos(t + i) * 30,
        140 + i * 40,
        WIDTH + 40,
        40 + i * 90 + Math.cos(t + i) * 10
      );
      ctx.lineWidth = 12;
      ctx.strokeStyle = i % 2 === 0 ? "rgba(230,245,255,0.6)" : "rgba(255,245,225,0.5)";
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // small decorative gears - slower rotation
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * 120;
      const y = 40 + Math.sin(t * 0.6 + i) * 12;
      drawGear(x, y, 14 + (i % 2) * 4, (t + i) * 0.5, "rgba(220,235,244,0.9)", "rgba(200,220,235,0.9)", 0.7);
    }
    ctx.restore();
  }

  function drawGear(x, y, radius, rotation, fillStyle, strokeStyle, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.2;
    // gear teeth
    const teeth = 8;
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const x1 = Math.cos(angle) * radius;
      const y1 = Math.sin(angle) * radius;
      const x2 = Math.cos(angle) * (radius + 5);
      const y2 = Math.sin(angle) * (radius + 5);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // center circle
    ctx.beginPath();
    ctx.arc(0, 0, radius - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawMachinePanel() {
    // Machine centered left of center
    const panelX = 120;
    const panelY = 120;
    const panelW = 420;
    const panelH = 220;
    // outer machine body with soft drop shadow
    ctx.save();
    ctx.shadowColor = "rgba(50,50,50,0.08)";
    ctx.shadowBlur = 18;
    roundRect(ctx, panelX, panelY, panelW, panelH, 20);
    ctx.fillStyle = "#fffaf3";
    ctx.fill();
    ctx.shadowBlur = 0;

    // outer frame stroke
    ctx.strokeStyle = "#DCCBB3";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Friendly robot face on machine
    // Eyes with subtle tracking and blinking
    const eye1 = { x: panelX + 100, y: panelY + 60 };
    const eye2 = { x: panelX + 180, y: panelY + 60 };
    const t = Date.now() / 800;
    const blink = Math.abs(Math.sin(Date.now() / 1200)) > 0.95 ? 1 : 0; // occasional blink
    const pupilOffsetX = Math.sin(Date.now() / 1000) * 2;
    const pupilOffsetY = Math.cos(Date.now() / 1200) * 1;
    // eye whites
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(eye1.x, eye1.y, 22, 16 - blink * 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eye2.x, eye2.y, 22, 16 - blink * 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // pupils
    ctx.fillStyle = "#15303a";
    ctx.beginPath();
    ctx.arc(eye1.x + pupilOffsetX, eye1.y + pupilOffsetY, 6 + (Math.sin(t) + 1) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eye2.x + pupilOffsetX * 0.7, eye2.y + pupilOffsetY * 0.7, 6, 0, Math.PI * 2);
    ctx.fill();

    // smiling mouth with soft shadow
    ctx.save();
    ctx.strokeStyle = "#8B5E3C";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(panelX + 140, panelY + 110, 36, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // Target display (like glass screen) with soft glow
    const screenX = panelX + 250;
    const screenY = panelY + 24;
    ctx.save();
    // glass fill
    const glass = ctx.createLinearGradient(screenX, screenY, screenX + 120, screenY + 52);
    glass.addColorStop(0, "#0f2b3a");
    glass.addColorStop(1, "#1b475a");
    ctx.fillStyle = glass;
    roundRect(ctx, screenX, screenY, 120, 52, 8);
    ctx.fill();

    // inner glowing number
    ctx.fillStyle = "#CFF6FF";
    ctx.font = "600 22px 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Target", screenX + 60, screenY + 18);

    // pulsing target number
    const pulse = 1 + Math.sin(Date.now() / 240) * 0.03;
    ctx.font = `700 ${Math.floor(40 * pulse)}px sans-serif`;
    ctx.fillStyle = "#E6FFFB";
    ctx.fillText(game.target.toString(), screenX + 60, screenY + 38);
    ctx.restore();

    // Slots area (where player places cogs)
    const slotStartX = panelX + 50;
    const slotY = panelY + 150;
    const slotGap = 90;
    for (let i = 0; i < game.slots; i++) {
      const sx = slotStartX + i * slotGap;
      // slot background with slight inset
      ctx.save();
      roundRect(ctx, sx - 30, slotY - 30, 60, 60, 14);
      ctx.fillStyle = "#fbfbfb";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "#E8EFF3";
      ctx.stroke();
      ctx.restore();

      // If placed, draw cog value inside with subtle glow
      const v = game.placed[i];
      if (v !== null && v !== undefined) {
        drawBigCog(sx, slotY, 22, "#FFF3E6", "#FFCF9A");
        ctx.fillStyle = "#5B3A18";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(v.toString(), sx, slotY + 2);
      } else {
        // empty slot icon (soft plus)
        ctx.save();
        ctx.fillStyle = "#E6F6FD";
        ctx.beginPath();
        ctx.arc(sx, slotY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#9FCFEA";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText("+", sx, slotY + 1);
        ctx.restore();
      }
    }

    // Machine lever / button (CHECK) with hover shine effect
    const buttonX = panelX + 340;
    const buttonY = panelY + 150;
    ctx.save();
    // base
    roundRect(ctx, buttonX - 30, buttonY - 20, 60, 40, 10);
    ctx.fillStyle = "#FFD27A";
    ctx.fill();
    ctx.strokeStyle = "#D79B2F";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // sheen
    ctx.globalCompositeOperation = "lighter";
    const sheen = ctx.createLinearGradient(buttonX - 30, buttonY - 20, buttonX + 30, buttonY + 20);
    sheen.addColorStop(0, "rgba(255,255,255,0.3)");
    sheen.addColorStop(0.6, "rgba(255,255,255,0.06)");
    ctx.fillStyle = sheen;
    roundRect(ctx, buttonX - 30, buttonY - 20, 60, 40, 10);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#3B2B1C";
    ctx.font = "700 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CHECK", buttonX, buttonY);
    ctx.restore();

    // visual cue for audio enabled: small speaker icon with pulse
    const audioX = panelX + panelW - 28;
    const audioY = panelY + 14;
    ctx.save();
    const pulseAlpha = game.audioEnabled ? 0.85 + Math.sin(Date.now() / 500) * 0.08 : 0.5;
    ctx.fillStyle = game.audioEnabled ? `rgba(166,227,161,${pulseAlpha})` : "#E7A6A6";
    ctx.beginPath();
    ctx.arc(audioX, audioY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2D2D2D";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(game.audioEnabled ? "Audio On" : "Audio Off", panelX + panelW - 28, panelY + 10);
    ctx.restore();
  }

  function drawBigCog(x, y, radius, fillStyle, strokeStyle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Date.now() / 2000) % (Math.PI * 2));
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 2;
    const teeth = 10;
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const x1 = Math.cos(angle) * radius;
      const y1 = Math.sin(angle) * radius;
      const x2 = Math.cos(angle) * (radius + 6);
      const y2 = Math.sin(angle) * (radius + 6);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCogsArea() {
    const areaX = 40;
    const areaY = 320;
    const areaW = WIDTH - 80;
    const areaH = 130;
    // background with inset
    ctx.save();
    roundRect(ctx, areaX, areaY, areaW, areaH, 12);
    ctx.fillStyle = "#F7FDFF";
    ctx.fill();
    ctx.strokeStyle = "#E6F6FB";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // title
    ctx.fillStyle = "#1F4654";
    ctx.font = "600 18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Cogs (Pick and place onto the machine):", areaX + 12, areaY + 24);

    // Draw cog tokens
    const startX = areaX + 40;
    const startY = areaY + 68;
    const gap = 100;
    for (let i = 0; i < game.cogValues.length; i++) {
      const x = startX + i * gap;
      const y = startY;
      const v = game.cogValues[i];
      const isSelected = game.selectedCogIndex === i || game.draggingIndex === i;
      // If cog already used (placed into slot), draw it faded
      if (isCogUsed(i)) {
        ctx.globalAlpha = 0.18;
      } else {
        ctx.globalAlpha = 1;
      }
      // highlight border if selected
      drawCogToken(x, y, 32, v, isSelected);
      ctx.globalAlpha = 1;
      // draw keyboard hint (index)
      ctx.fillStyle = "#2D4A56";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText((i + 1).toString(), x + 28, y - 12);
    }

    // Accessibility text: keyboard guide
    ctx.fillStyle = "#2B4A5A";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      "Keyboard: ←/→ move, Enter pick/place, H hint, R reset, S toggle sound, Space check",
      areaX + 12,
      areaY + areaH - 10
    );
  }

  function drawCogToken(x, y, radius, value, selected) {
    // outer body
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 8;
    // subtle idle bobbing
    const bob = Math.sin(Date.now() / 600 + x * 0.01) * 3;
    ctx.translate(0, bob);
    ctx.fillStyle = selected ? "#FFF2E6" : "#FFFDF8";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = selected ? "#F2B07A" : "#E8D2B8";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();
    // little gear teeth rotating slower
    ctx.rotate((Date.now() / 1500 + x * 0.001) % (Math.PI * 2));
    for (let t = 0; t < 8; t++) {
      const a = (t / 8) * Math.PI * 2;
      const x1 = Math.cos(a) * radius;
      const y1 = Math.sin(a) * radius;
      const x2 = Math.cos(a) * (radius + 5);
      const y2 = Math.sin(a) * (radius + 5);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "#ECD8C0";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // number
    ctx.fillStyle = "#5A3B1C";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value.toString(), 0, 0);
    ctx.restore();
  }

  function drawHUD() {
    // Top right info
    ctx.fillStyle = "#1F3A43";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`Level: ${game.level} / ${MAX_LEVEL}`, WIDTH - 14, 22);
    ctx.fillText(`Lives: ${game.lives}`, WIDTH - 14, 42);
    ctx.fillText(`Score: ${game.score}`, WIDTH - 14, 62);

    // Visual life hearts with simple beat when low lives
    const heartX = WIDTH - 140;
    for (let i = 0; i < game.lives; i++) {
      const beat = game.lives <= 1 ? 1 + Math.sin(Date.now() / 200) * 0.08 : 1;
      drawHeart(heartX + i * 18, 46, 8 * beat, "#FF6B6B");
    }

    // Audio visualiser (waveform)
    if (audio && audio.analyser && audio.available) {
      try {
        const data = new Uint8Array(audio.analyser.fftSize);
        audio.analyser.getByteTimeDomainData(data);
        const vizX = 18;
        const vizY = 18;
        const vizW = 120;
        const vizH = 38;
        ctx.save();
        roundRect(ctx, vizX - 6, vizY - 12, vizW + 12, vizH + 18, 8);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();
        ctx.strokeStyle = "rgba(30,60,70,0.06)";
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(vizX, vizY + vizH / 2);
        for (let i = 0; i < vizW; i++) {
          const v = data[Math.floor((i / vizW) * data.length)] / 128.0;
          const y = vizY + (v - 1) * (vizH / 1.8) + vizH / 2;
          ctx.lineTo(vizX + i, y);
        }
        ctx.strokeStyle = "rgba(40,140,180,0.75)";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.restore();
      } catch (e) {
        // ignore analyser errors
      }
    }
  }

  function drawHeart(x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - size / 2, x - size, y - size / 2, x - size, y + size / 4);
    ctx.bezierCurveTo(x - size, y + size, x, y + size * 1.5, x, y + size * 2);
    ctx.bezierCurveTo(x, y + size * 1.5, x + size, y + size, x + size, y + size / 4);
    ctx.bezierCurveTo(x + size, y - size / 2, x, y - size / 2, x, y);
    ctx.fill();
    ctx.restore();
  }

  function drawFooter() {
    ctx.fillStyle = "#17333b";
    ctx.font = "600 15px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(game.statusMessage, 16, HEIGHT - 10);
  }

  // Utility: rounded rectangle
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Game logic helpers
  function isCogUsed(index) {
    // A cog is used if its value exists in placed as that particular reference; but there can be duplicates
    // We'll mark used by tracking placedIndices mapping to original index when placing
    return (game._placedIndices && game._placedIndices.includes(index));
  }

  // The placedIndices array stores which cog indices are in slots
  // We'll maintain game._placedIndices in tandem with game.placed
  function placeCogToSlot(cogIndex, slotIndex) {
    if (cogIndex === null || slotIndex === null) return false;
    if (isCogUsed(cogIndex)) return false;
    if (game.placed[slotIndex] !== null) return false;
    game.placed[slotIndex] = game.cogValues[cogIndex];
    game._placedIndices = game._placedIndices || [];
    game._placedIndices[slotIndex] = cogIndex;
    audio.playClick();
    announce(`Placed cog ${cogIndex + 1} with value ${game.cogValues[cogIndex]} into slot ${slotIndex + 1}`);
    return true;
  }

  function removeCogFromSlot(slotIndex) {
    if (slotIndex == null) return false;
    if (game.placed[slotIndex] === null) return false;
    // free index
    if (game._placedIndices) {
      const idx = game._placedIndices[slotIndex];
      game._placedIndices[slotIndex] = null;
    }
    game.placed[slotIndex] = null;
    audio.playClick();
    announce(`Removed from slot ${slotIndex + 1}`);
    return true;
  }

  function checkSolution() {
    // If any slot empty, notify
    for (let i = 0; i < game.slots; i++) {
      if (game.placed[i] === null) {
        game.statusMessage = "Place all cogs before checking.";
        announce(game.statusMessage);
        audio.playIncorrect();
        return false;
      }
    }
    const sum = game.placed.reduce((a, b) => a + b, 0);
    if (sum === game.target) {
      audio.playCorrect();
      game.statusMessage = `Nice! Level ${game.level} complete.`;
      game.score += 10 + (game.hintUsed ? 0 : 5);
      game.levelComplete = true;
      announce(game.statusMessage);
      // spawn cheerful particles at machine screen
      // find machine screen coordinates roughly:
      const panelX = 120;
      const panelY = 120;
      spawnParticles(panelX + 310, panelY + 50, 22);
      game.lastCorrectVisualSpawn = Date.now();

      // advance after short delay (mechanics unchanged)
      setTimeout(() => {
        if (game.level >= MAX_LEVEL) {
          game.finished = true;
          game.statusMessage = "You fixed all the machines! Great job!";
          announce(game.statusMessage);
        } else {
          startLevel(game.level + 1);
        }
        draw();
      }, 900);
      return true;
    } else {
      audio.playIncorrect();
      game.lives -= 1;
      if (game.lives <= 0) {
        // reset progress to level 1
        game.statusMessage = "Oh no! The machine stopped. Restarting level.";
        announce(game.statusMessage);
        setTimeout(() => {
          game.lives = INITIAL_LIVES;
          startLevel(1);
          draw();
        }, 1200);
      } else {
        game.statusMessage = `Not quite. The machine output ${sum}. Try again!`;
        // allow player to change placements - maybe clear placed slots or allow swap
        // we'll clear placed slots for simplicity
        game.placed = new Array(game.slots).fill(null);
        game._placedIndices = new Array(game.slots).fill(null);
        announce(game.statusMessage + ` Lives left: ${game.lives}`);
      }
      draw();
      return false;
    }
  }

  function giveHint() {
    // find a valid combination and reveal one slot
    game.hintUsed = true;
    const nums = game.cogValues.slice();
    // Try all combinations
    let found = null;
    function helper(start, k, sum, chosenIndices) {
      if (k === 0) {
        if (sum === game.target) {
          found = chosenIndices.slice();
          return true;
        }
        return false;
      }
      for (let i = start; i <= nums.length - k; i++) {
        if (helper(i + 1, k - 1, sum + nums[i], chosenIndices.concat(i))) return true;
      }
      return false;
    }
    helper(0, game.slots, 0, []);
    if (found && found.length > 0) {
      // place the first value into first empty slot
      let slotToFill = null;
      for (let s = 0; s < game.slots; s++) {
        if (game.placed[s] === null) {
          slotToFill = s;
          break;
        }
      }
      if (slotToFill === null) slotToFill = 0;
      placeCogToSlot(found[0], slotToFill);
      game.statusMessage = "Hint: one cog placed to help you get started.";
      announce(game.statusMessage);
      // subtle positive audio
      audio.playClick();
    } else {
      game.statusMessage = "Hmm, I couldn't find a hint. Try a different choice!";
      announce(game.statusMessage);
      audio.playIncorrect();
    }
  }

  // Input handling
  // Map keyboard to selection and actions
  let focusedCog = 0; // for keyboard navigation among cogs

  function handleKey(e) {
    if (game.finished) {
      if (e.key === "r" || e.key === "R") {
        startLevel(1);
      }
      return;
    }
    if (e.key === "ArrowRight") {
      focusedCog = (focusedCog + 1) % game.cogValues.length;
      game.selectedCogIndex = focusedCog;
      audio.playClick();
      announce(`Selected cog ${focusedCog + 1} value ${game.cogValues[focusedCog]}`);
      draw();
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      focusedCog = (focusedCog - 1 + game.cogValues.length) % game.cogValues.length;
      game.selectedCogIndex = focusedCog;
      audio.playClick();
      announce(`Selected cog ${focusedCog + 1} value ${game.cogValues[focusedCog]}`);
      draw();
      e.preventDefault();
    } else if (e.key === "Enter") {
      // pick or place depending on selection
      if (game.selectedCogIndex !== null) {
        // try to place to first empty slot
        let placed = false;
        for (let s = 0; s < game.slots; s++) {
          if (game.placed[s] === null) {
            placed = placeCogToSlot(game.selectedCogIndex, s);
            break;
          }
        }
        if (!placed) {
          // maybe remove last placed
          const usedPos = (game._placedIndices || []).indexOf(game.selectedCogIndex);
          if (usedPos >= 0) {
            removeCogFromSlot(usedPos);
          } else {
            game.statusMessage = "That cog is already used or no empty slot.";
            announce(game.statusMessage);
            audio.playIncorrect();
          }
        }
        draw();
      } else {
        // no cog selected -> nothing
        game.statusMessage = "Select a cog first with Left/Right.";
        announce(game.statusMessage);
        audio.playIncorrect();
      }
      e.preventDefault();
    } else if (e.key === "h" || e.key === "H") {
      giveHint();
      draw();
      e.preventDefault();
    } else if (e.key === "r" || e.key === "R") {
      startLevel(game.level);
      draw();
      audio.playClick();
      announce("Level reset.");
      e.preventDefault();
    } else if (e.key === "s" || e.key === "S") {
      // toggle audio
      game.audioEnabled = !game.audioEnabled;
      audio.setMuted(!game.audioEnabled);
      announce(game.audioEnabled ? "Audio enabled" : "Audio disabled");
      draw();
      e.preventDefault();
    } else if (e.key === " ") {
      // space attempts check
      checkSolution();
      draw();
      e.preventDefault();
    } else if (e.key === "Tab") {
      // move selection cycle
      focusedCog = (focusedCog + 1) % game.cogValues.length;
      game.selectedCogIndex = focusedCog;
      draw();
      e.preventDefault();
    }
  }

  // Mouse events: pick cog, drag to slot, click check button
  let mouse = {
    down: false,
    x: 0,
    y: 0
  };

  function getCogIndexAt(x, y) {
    const areaX = 40;
    const areaY = 320;
    const startX = areaX + 40;
    const startY = areaY + 68;
    const gap = 100;
    for (let i = 0; i < game.cogValues.length; i++) {
      const cx = startX + i * gap;
      const cy = startY;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= 32 * 32) return i;
    }
    return null;
  }

  function getSlotAt(x, y) {
    const panelX = 120;
    const panelY = 120;
    const slotStartX = panelX + 50;
    const slotY = panelY + 150;
    const slotGap = 90;
    for (let i = 0; i < game.slots; i++) {
      const sx = slotStartX + i * slotGap;
      const sy = slotY;
      const dx = x - sx;
      const dy = y - sy;
      if (dx * dx + dy * dy <= 40 * 40) return i;
    }
    return null;
  }

  function getCheckButtonAt(x, y) {
    const panelX = 120;
    const panelY = 120;
    const buttonX = panelX + 340;
    const buttonY = panelY + 150;
    if (Math.abs(x - buttonX) <= 40 && Math.abs(y - buttonY) <= 24) return true;
    return false;
  }

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouse.down = true;
    mouse.x = x;
    mouse.y = y;
    // resume audio if suspended
    audio.resumeIfNeeded();

    const cogIdx = getCogIndexAt(x, y);
    if (cogIdx !== null) {
      // if cog is used, remove it instead
      if (isCogUsed(cogIdx)) {
        // find slot
        const slot = (game._placedIndices || []).indexOf(cogIdx);
        if (slot >= 0) {
          removeCogFromSlot(slot);
        }
      } else {
        game.selectedCogIndex = cogIdx;
        game.draggingIndex = cogIdx;
        focusedCog = cogIdx;
        audio.playClick();
        announce(`Picked up cog ${cogIdx + 1}, value ${game.cogValues[cogIdx]}`);
      }
      draw();
      return;
    }
    // click machine check button?
    if (getCheckButtonAt(x, y)) {
      checkSolution();
      draw();
      return;
    }
    // click on slot to remove if present
    const slotIdx = getSlotAt(x, y);
    if (slotIdx !== null) {
      if (game.placed[slotIdx] !== null) {
        removeCogFromSlot(slotIdx);
        draw();
      } else {
        // if selected cog exists, place into this slot
        if (game.selectedCogIndex !== null && !isCogUsed(game.selectedCogIndex)) {
          placeCogToSlot(game.selectedCogIndex, slotIdx);
          draw();
        }
      }
      return;
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!mouse.down) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouse.x = x;
    mouse.y = y;
    // visual dragging handled in drawing: store draggingIndex
    draw();
  });

  canvas.addEventListener("mouseup", (e) => {
    mouse.down = false;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // If dragging a cog, attempt to drop to a slot
    if (game.draggingIndex !== null) {
      const slotIdx = getSlotAt(x, y);
      if (slotIdx !== null) {
        // attempt to place
        const success = placeCogToSlot(game.draggingIndex, slotIdx);
        if (!success) {
          game.statusMessage = "Can't place there.";
          announce(game.statusMessage);
        }
      } else {
        // dropped elsewhere, remain selected but not placed
        game.statusMessage = "Cog returned to its place.";
        announce(game.statusMessage);
      }
      game.draggingIndex = null;
      draw();
    }
  });

  // Click/tap to focus for keyboard controls
  canvas.addEventListener("click", (e) => {
    canvas.focus();
    // resume audio on user gesture
    audio.resumeIfNeeded();
  });

  // Touch support: map to mouse events
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    mouse.down = true;
    mouse.x = x;
    mouse.y = y;
    const cogIdx = getCogIndexAt(x, y);
    if (cogIdx !== null) {
      if (isCogUsed(cogIdx)) {
        const slot = (game._placedIndices || []).indexOf(cogIdx);
        if (slot >= 0) removeCogFromSlot(slot);
      } else {
        game.selectedCogIndex = cogIdx;
        game.draggingIndex = cogIdx;
        focusedCog = cogIdx;
      }
      draw();
      return;
    }
    if (getCheckButtonAt(x, y)) {
      checkSolution();
      draw();
      return;
    }
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!mouse.down) return;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouse.x = touch.clientX - rect.left;
    mouse.y = touch.clientY - rect.top;
    draw();
  });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    mouse.down = false;
    if (game.draggingIndex !== null) {
      // drop at last location
      const x = mouse.x;
      const y = mouse.y;
      const slotIdx = getSlotAt(x, y);
      if (slotIdx !== null) {
        placeCogToSlot(game.draggingIndex, slotIdx);
      }
      game.draggingIndex = null;
      draw();
    }
  });

  window.addEventListener("keydown", handleKey);

  // Main render loop for animations
  function frame() {
    // update visual animation state
    updateParticles();
    // draw dynamic dragging preview
    drawBaseSceneWithDrag();
    requestAnimationFrame(frame);
  }

  function drawBaseSceneWithDrag() {
    // draw everything
    draw();
    // overlay dragging cog
    if (game.draggingIndex !== null && mouse.x !== undefined) {
      const i = game.draggingIndex;
      // draw semi-transparent cog following cursor
      ctx.save();
      ctx.globalAlpha = 0.95;
      drawCogToken(mouse.x, mouse.y, 32, game.cogValues[i], true);
      ctx.restore();
    }
    // draw subtle HUD hints (if level complete recently spawn)
    if (game.levelComplete && Date.now() - game.lastCorrectVisualSpawn < 1200) {
      // small glow overlay
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#E8FFF6";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }
  }

  // Start the game
  function initGame() {
    startLevel(1);
    draw();
    announce("Game ready. Use mouse or keyboard to play. Press S to toggle sound.");
    // Kick off render loop
    requestAnimationFrame(frame);
  }

  // Initialize audio state from manager readiness after small delay (allow init)
  setTimeout(() => {
    if (!audio.available) {
      game.audioEnabled = false;
      game.statusMessage = "Audio is not available in this browser or was blocked. Use S to toggle sound.";
      announce(game.statusMessage);
      draw();
    } else {
      game.audioEnabled = true;
      audio.setMuted(!game.audioEnabled);
      announce("Audio is ready. Click canvas to enable sound if needed.");
    }
  }, 300);

  // Error handling for page unloading: dispose audio
  window.addEventListener("beforeunload", () => {
    try {
      audio.dispose();
    } catch (e) {}
  });

  // Kick off
  initGame();
})();