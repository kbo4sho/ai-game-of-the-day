"use strict";

(async function () {
  // Enhanced Electricity Math Game - Visuals & Audio Upgrade
  // Renders into existing element with id "game-of-the-day-stage"
  // Keeps original game mechanics; updates only visuals and sound.
  const WIDTH = 720;
  const HEIGHT = 480;
  const CANVAS_ID = "game-of-the-day-canvas";

  // Theme colors (soft, kid-friendly)
  const THEME = {
    bgTop: "#eaf8ff",
    bgBottom: "#e6fbf5",
    accent: "#7ad7d1",
    wire: "#62bfb9",
    bulbCore: "#fff7d6",
    bulbGlow: "#ffd86b",
    panel: "#ffffffaa",
    infoPanel: "#ffffffcc",
    robotBody: "#cbeeff",
    orbFill: "#ffd36b",
    text: "#0b3b3b",
    speakerOn: "#2e8b57",
    speakerOff: "#9aa5a6",
    spark: "#fff27f",
    softGrid: "#dff8f6"
  };

  // Get stage element
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    console.error("Missing container: #game-of-the-day-stage");
    return;
  }

  // Clear children and create canvas exactly WIDTH x HEIGHT
  stage.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.id = CANVAS_ID;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "Electricity math game. Aim and shoot number-orbs to match bulbs' target numbers. Use arrow keys to aim and space to shoot. Press M to toggle sound."
  );
  canvas.title =
    "Electricity Math Game: Aim with mouse or arrow keys. Space to zap. M toggles sound. Press R to restart.";
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false });

  // Safe performance.now wrapper
  const nowPerf = () => performance.now();

  // Utility functions
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // Audio Manager using Web Audio API (oscillators + filters only)
  const audioManager = {
    ctx: null,
    masterGain: null,
    ambientNodes: [],
    enabled: false,
    creating: false,

    async init() {
      if (this.ctx || this.creating) return;
      this.creating = true;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error("Web Audio API not supported");

        this.ctx = new AudioCtx();

        // Create master gain for toggling
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.6; // default audible but gentle
        this.masterGain.connect(this.ctx.destination);

        // Ambient pad: two low oscillators mixed, filtered, subtle LFO
        const oscA = this.ctx.createOscillator();
        const oscB = this.ctx.createOscillator();
        oscA.type = "sine";
        oscB.type = "triangle";
        oscA.frequency.value = 110; // low A2-ish
        oscB.frequency.value = 132; // harmonic
        const mixGain = this.ctx.createGain();
        mixGain.gain.value = 0.02; // very subtle
        oscA.connect(mixGain);
        oscB.connect(mixGain);

        // gentle lowpass filter to soften timbre
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 600;
        mixGain.connect(lp);

        // Slow LFO to modulate filter cutoff for breathing effect
        const lfo = this.ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.08; // very slow
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(lp.frequency);

        // Connect to master
        lp.connect(this.masterGain);

        oscA.start();
        oscB.start();
        lfo.start();

        this.ambientNodes.push({ osc: oscA }, { osc: oscB }, { osc: lfo }, { node: lp, nodeName: "ambientFilter" });

        this.enabled = true;
      } catch (err) {
        console.warn("Audio init failed:", err);
        this.ctx = null;
        this.enabled = false;
      } finally {
        this.creating = false;
      }
    },

    // Ensure context resumed on user gesture
    async ensureActive() {
      try {
        if (!this.ctx) await this.init();
        if (!this.ctx) return false;
        if (this.ctx.state === "suspended") {
          await this.ctx.resume();
        }
        return true;
      } catch (err) {
        console.warn("Audio context resume failed:", err);
        return false;
      }
    },

    // Play a single tone with envelope through a simple filter; options tuned gentle
    playTone({ freq = 440, type = "sine", duration = 0.25, volume = 0.08, detune = 0, attack = 0.008 } = {}) {
      if (!this.ctx || !this.enabled) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        filter.type = "lowpass";
        filter.frequency.value = Math.max(800, freq * 2.5);
        filter.Q.value = 0.6;

        gain.gain.value = 0.0001;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        // attack -> sustain -> release
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + attack);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + duration);
        osc.start(now);
        osc.stop(now + duration + 0.05);
      } catch (err) {
        console.warn("playTone error:", err);
      }
    },

    // Correct: pleasant triad arpeggio, gentle
    playCorrect() {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const base = 660;
      const intervals = [0, 4, 7];
      intervals.forEach((i, idx) => {
        setTimeout(() => {
          this.playTone({
            freq: base * Math.pow(2, i / 12),
            type: idx === 1 ? "triangle" : "sine",
            duration: 0.26,
            volume: 0.09 - idx * 0.015
          });
        }, idx * 80);
      });
    },

    // Incorrect: muted buzz with quick decay
    playIncorrect() {
      if (!this.enabled || !this.ctx) return;
      // create two slightly detuned saws for buzzy feel, quickly filtered
      try {
        const now = this.ctx.currentTime;
        const o1 = this.ctx.createOscillator();
        const o2 = this.ctx.createOscillator();
        o1.type = "sawtooth";
        o2.type = "sawtooth";
        o1.frequency.value = 180;
        o2.frequency.value = 160;
        o2.detune.value = 18;
        const filt = this.ctx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = 900;
        const g = this.ctx.createGain();
        g.gain.value = 0.0001;

        o1.connect(filt);
        o2.connect(filt);
        filt.connect(g);
        g.connect(this.masterGain);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.12, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        o1.start(now);
        o2.start(now);
        o1.stop(now + 0.26);
        o2.stop(now + 0.26);
      } catch (err) {
        console.warn("playIncorrect error:", err);
      }
    },

    // Shoot: short click
    playShoot() {
      if (!this.enabled || !this.ctx) return;
      this.playTone({ freq: 520, type: "square", duration: 0.12, volume: 0.07 });
    },

    // Toggle audio on/off (mute via master gain)
    async toggle() {
      if (!this.ctx) {
        await this.init();
        if (!this.ctx) return;
      }
      this.enabled = !this.enabled;
      if (!this.masterGain) return;
      this.masterGain.gain.setValueAtTime(this.enabled ? 0.6 : 0.0, this.ctx.currentTime);
    }
  };

  // Game state (keep math/logic intact)
  const state = {
    bulbs: [],
    orbs: [],
    spareOrbs: [],
    score: 0,
    lives: 3,
    round: 1,
    message: "Welcome! Make each bulb reach its number by zapping it with number-orbs.",
    lastActionTime: Date.now(),
    aimAngle: -Math.PI / 2,
    power: 10,
    mousePos: { x: WIDTH / 2, y: HEIGHT / 2 },
    isMouseAiming: false,
    paused: false,
    speakerVisible: true,
    particles: [] // decorative ambient particles
  };

  // Initialize bulbs and spare orbs (match original logic)
  function setupRound(round = 1) {
    state.bulbs = [];
    state.orbs = [];
    state.spareOrbs = [];
    state.message = "Round " + round + ": Light all bulbs by matching sums!";
    state.round = round;
    state.lives = Math.max(1, 4 - Math.floor((round - 1) / 2));
    state.score = 0;
    const base = 6 + round;
    for (let i = 0; i < 3; i++) {
      const target = randInt(base + i, base + 6 + i);
      state.bulbs.push({
        x: 140 + i * 220,
        y: 110,
        radius: 42,
        target,
        current: 0,
        lit: false,
        charOffset: randInt(-8, 8),
        sparkTimer: 0,
        glowPulse: Math.random() * Math.PI * 2
      });
    }
    refillSpareOrbs();
  }

  function refillSpareOrbs() {
    state.spareOrbs = [];
    for (let i = 0; i < 3; i++) {
      const t = state.bulbs[randInt(0, state.bulbs.length - 1)].target;
      const suggestion = clamp(randInt(1, Math.max(3, Math.floor(t / 2))), 1, 9);
      state.spareOrbs.push({
        value: suggestion,
        x: WIDTH / 2 - 60 + i * 60,
        y: HEIGHT - 68,
        radius: 16
      });
    }
  }

  // Orb factory
  function createOrb(value, x, y, vx, vy) {
    return {
      value,
      x,
      y,
      vx,
      vy,
      radius: 14,
      alive: true,
      trail: []
    };
  }

  // Input handling - mouse and keyboard (preserve behaviors)
  let lastShotTime = 0;
  const SHOT_COOLDOWN = 250;

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    state.mousePos.x = mx;
    state.mousePos.y = my;
    state.isMouseAiming = true;
    const gx = WIDTH / 2;
    const gy = HEIGHT - 40;
    const dx = mx - gx;
    const dy = my - gy;
    state.aimAngle = Math.atan2(dy, dx);
  });

  canvas.addEventListener("mouseleave", () => {
    state.isMouseAiming = false;
  });

  canvas.addEventListener("click", async (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // speaker area
    if (mx >= WIDTH - 60 && mx <= WIDTH - 20 && my >= 20 && my <= 60) {
      await audioManager.ensureActive();
      audioManager.toggle();
      state.message = audioManager.enabled ? "Audio ON" : "Audio OFF";
      return;
    }
    await audioManager.ensureActive();
    shootFromGenerator();
    canvas.focus();
  });

  const keyState = {};
  window.addEventListener("keydown", async (e) => {
    if (keyState[e.code]) return;
    keyState[e.code] = true;
    if (!audioManager.ctx) await audioManager.ensureActive();
    if (e.code === "KeyM") {
      audioManager.toggle();
      state.message = audioManager.enabled ? "Audio ON" : "Audio OFF";
      e.preventDefault();
    } else if (e.code === "Space") {
      shootFromGenerator();
      e.preventDefault();
    } else if (e.code === "KeyR") {
      setupRound(1);
      e.preventDefault();
    } else if (e.code === "KeyP") {
      state.paused = !state.paused;
      state.message = state.paused ? "Paused" : "Resumed";
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    keyState[e.code] = false;
  });

  // Shooting logic (keep same mechanics)
  function shootFromGenerator() {
    if (state.paused) return;
    const now = Date.now();
    if (now - lastShotTime < SHOT_COOLDOWN) return;
    lastShotTime = now;
    if (state.spareOrbs.length === 0) {
      state.message = "No orbs left! Refilling...";
      refillSpareOrbs();
      return;
    }
    const orbInfo = state.spareOrbs.shift();
    const gx = WIDTH / 2;
    const gy = HEIGHT - 40;
    const angle = state.aimAngle;
    const speed = 3 + state.power * 0.6;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const orb = createOrb(orbInfo.value, gx + Math.cos(angle) * 28, gy + Math.sin(angle) * 28, vx, vy);
    state.orbs.push(orb);
    audioManager.playShoot();
    state.message = `Zapped a ${orb.value}! Aim for a bulb to reach its number.`;
  }

  // Update loop: physics and collisions (preserve math)
  function update(dt) {
    if (state.paused) return;

    // keyboard aim
    if (keyState["ArrowLeft"]) state.aimAngle -= 0.03;
    if (keyState["ArrowRight"]) state.aimAngle += 0.03;
    if (keyState["ArrowUp"]) state.power = clamp(state.power + 0.06, 6, 16);
    if (keyState["ArrowDown"]) state.power = clamp(state.power - 0.06, 6, 16);

    // update orbs
    for (const orb of state.orbs) {
      if (!orb.alive) continue;
      orb.vy += 0.06;
      orb.x += orb.vx;
      orb.y += orb.vy;
      orb.trail.push({ x: orb.x, y: orb.y });
      if (orb.trail.length > 12) orb.trail.shift();
      if (orb.x < -40 || orb.x > WIDTH + 40 || orb.y > HEIGHT + 60) {
        orb.alive = false;
      }
      for (const bulb of state.bulbs) {
        if (bulb.lit) continue;
        const dx = orb.x - bulb.x;
        const dy = orb.y - bulb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < orb.radius + bulb.radius - 6) {
          bulb.current += orb.value;
          orb.alive = false;

          if (bulb.current === bulb.target) {
            bulb.lit = true;
            state.score += bulb.target;
            audioManager.playCorrect();
            state.message = `Great! Bulb reached ${bulb.target}!`;
            bulb.sparkTimer = 20;
          } else if (bulb.current > bulb.target) {
            state.lives -= 1;
            audioManager.playIncorrect();
            state.message = `Overload! Bulb needed ${bulb.target} but got ${bulb.current}. It reset. Lives: ${state.lives}`;
            bulb.current = 0;
            bulb.sparkTimer = 12;
          } else {
            audioManager.playShoot();
            state.message = `Bulb got ${bulb.current} / ${bulb.target}. Keep going!`;
            bulb.sparkTimer = 8;
          }
          break;
        }
      }
    }

    // cleanup
    state.orbs = state.orbs.filter((o) => o.alive);

    // round complete
    if (state.bulbs.every((b) => b.lit)) {
      state.round += 1;
      state.message = `Round complete! Starting round ${state.round}...`;
      setTimeout(() => setupRound(state.round), 900);
    }

    // game over
    if (state.lives <= 0) {
      state.paused = true;
      state.message = "Game over! Press R to restart.";
    }

    // ambient particles update
    updateParticles(dt);

    // bulbs glow pulse update
    for (const b of state.bulbs) {
      b.glowPulse += 0.04;
    }
  }

  // Ambient decorative particles (slow, non-distracting)
  function spawnParticle() {
    state.particles.push({
      x: randInt(20, WIDTH - 20),
      y: randInt(20, HEIGHT - 120),
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.02 - Math.random() * 0.04,
      life: 200 + Math.random() * 400,
      radius: 1 + Math.random() * 2,
      hueOffset: Math.random() * 40
    });
  }

  function updateParticles(dt) {
    if (Math.random() < 0.08) spawnParticle();
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.life -= dt * 0.6;
      if (p.life <= 0 || p.x < -20 || p.x > WIDTH + 20) state.particles.splice(i, 1);
    }
  }

  // Drawing helpers and effects
  function drawBackground() {
    // soft vertical gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, THEME.bgTop);
    g.addColorStop(1, THEME.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // gentle animated circuit dots/grid
    ctx.fillStyle = THEME.softGrid;
    const t = nowPerf() / 1200;
    for (let x = 20; x < WIDTH; x += 40) {
      for (let y = 20; y < HEIGHT; y += 40) {
        const offset = Math.sin((x + y) * 0.02 + t) * 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(x + offset, y + Math.cos((x - y) * 0.015 + t) * 2, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // subtle vignette
    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 100, WIDTH / 2, HEIGHT / 2, Math.max(WIDTH, HEIGHT));
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.03)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawBulbs() {
    for (const bulb of state.bulbs) {
      // wire with subtle sag
      ctx.beginPath();
      ctx.strokeStyle = THEME.wire;
      ctx.lineWidth = 6;
      const sag = Math.sin(nowPerf() / 400 + bulb.x * 0.01) * 4;
      ctx.moveTo(bulb.x - 6, bulb.y + bulb.radius + 8);
      ctx.quadraticCurveTo(bulb.x, bulb.y + bulb.radius + 30 + sag, bulb.x + 6, bulb.y + bulb.radius + 8);
      ctx.stroke();

      // glass with gradient
      const g = ctx.createRadialGradient(bulb.x - 12, bulb.y - 6, 4, bulb.x, bulb.y, bulb.radius * 1.4);
      g.addColorStop(0, THEME.bulbCore);
      g.addColorStop(1, bulb.lit ? THEME.bulbGlow : "#f4e7b8");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(bulb.x, bulb.y, bulb.radius, bulb.radius * 1.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // subtle glow when lit (pulses)
      if (bulb.lit) {
        const pulse = 0.8 + Math.sin(bulb.glowPulse) * 0.35;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,210,110,${0.12 * pulse})`;
        ctx.arc(bulb.x, bulb.y, bulb.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // filament / indicator showing progress
      ctx.beginPath();
      const ratio = clamp(bulb.current / bulb.target, 0, 1);
      ctx.strokeStyle = "#a55b00";
      ctx.lineWidth = 3;
      ctx.moveTo(bulb.x - 12, bulb.y + 4);
      ctx.lineTo(bulb.x + 12 * ratio, bulb.y - 6 * ratio + 2);
      ctx.stroke();

      // Numbers
      ctx.fillStyle = THEME.text;
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Need: ${bulb.target}`, bulb.x, bulb.y - bulb.radius - 8);
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(`${bulb.current}`, bulb.x, bulb.y + 6);

      // playful character at the base (wire-fox improved)
      drawWireFox(bulb.x - 24, bulb.y + bulb.radius + 22, bulb.charOffset, bulb.lit);

      // sparks if present
      if (bulb.sparkTimer && bulb.sparkTimer > 0) {
        drawSparks(bulb.x, bulb.y + 6, bulb.sparkTimer);
        bulb.sparkTimer -= 1;
      }
    }
  }

  function drawWireFox(x, y, offset, happy) {
    ctx.save();
    ctx.translate(x, y);
    // subtle bob
    const bob = Math.sin(nowPerf() / 400 + offset) * 2;
    ctx.translate(0, bob);
    // body shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.ellipse(0, 16, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.fillStyle = "#ffc8a2";
    ctx.ellipse(0, 6, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.fillStyle = "#ffd9b1";
    ctx.arc(0, -6, 12, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = happy ? "#062a2a" : "#332";
    ctx.beginPath();
    ctx.arc(-4, -8, 2.2, 0, Math.PI * 2);
    ctx.arc(4, -8, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.beginPath();
    ctx.strokeStyle = "#8fe7e3";
    ctx.lineWidth = 1.2;
    ctx.moveTo(-6, -2);
    ctx.quadraticCurveTo(0, 2 + (happy ? 1 : 0), 6, -2);
    ctx.stroke();
    // little wire tail
    ctx.strokeStyle = "#d18b4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 8);
    ctx.quadraticCurveTo(20, 12, 26, 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawSparks(cx, cy, t) {
    const count = Math.floor(5 + Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (t * 2.2);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.fillStyle = THEME.spark;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, 3 - t / 8), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGenerator() {
    const gx = WIDTH / 2;
    const gy = HEIGHT - 40;

    // control panel with soft shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = THEME.panel;
    roundRect(ctx, gx - 150, gy - 36, 300, 72, 12);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Volty robot with animated antenna glow
    drawVolty(gx - 170, gy - 6, nowPerf());

    // emitter core
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cfeeea";
    ctx.lineWidth = 3;
    ctx.arc(gx, gy, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // emitter subtle glow
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,220,110,0.07)`;
    ctx.arc(gx, gy, 48 + Math.sin(nowPerf() / 350) * 2, 0, Math.PI * 2);
    ctx.fill();

    // aim line (soft)
    ctx.beginPath();
    ctx.strokeStyle = THEME.wire;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.moveTo(gx, gy);
    const aimX = gx + Math.cos(state.aimAngle) * 90;
    const aimY = gy + Math.sin(state.aimAngle) * 90;
    // dashed feel
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -nowPerf() / 60;
    ctx.lineTo(aimX, aimY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // spare orbs with bobbing
    for (let i = 0; i < state.spareOrbs.length; i++) {
      const sp = state.spareOrbs[i];
      const bob = Math.sin(nowPerf() / 300 + i) * 4;
      // soft shadow
      ctx.beginPath();
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.ellipse(sp.x + 2, sp.y + bob + 6, sp.radius + 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // orb layers
      ctx.beginPath();
      ctx.fillStyle = "#fff0f0";
      ctx.arc(sp.x, sp.y + bob, sp.radius + 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = "#ff8b8b";
      ctx.arc(sp.x, sp.y + bob, sp.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText(sp.value, sp.x, sp.y + 5 + bob);
    }

    // power meter
    ctx.fillStyle = "#e9fff8";
    ctx.fillRect(gx + 94, gy - 24, 34, 48);
    ctx.fillStyle = "#2e8b57";
    const height = clamp(((state.power - 6) / (16 - 6)) * 36, 2, 36);
    ctx.fillRect(gx + 100, gy + 14 - height, 20, height);
    ctx.strokeStyle = "#cfeeea";
    ctx.strokeRect(gx + 94, gy - 24, 34, 48);

    // helpful controls text
    ctx.fillStyle = THEME.text;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Arrow keys to aim, Space to zap, M toggle sound", 12, HEIGHT - 12);
    ctx.fillText("Press R to restart, P to pause", 12, HEIGHT - 28);
  }

  function drawVolty(x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    // body with soft rounding
    ctx.fillStyle = THEME.robotBody;
    roundRect(ctx, -28, -28, 42, 36, 6);
    ctx.fill();

    // screen
    ctx.fillStyle = "#05292a";
    roundRect(ctx, -24, -22, 32, 24, 4);
    ctx.fill();

    // small smiling pixel
    ctx.fillStyle = "#8fe7e3";
    ctx.fillRect(-8, -8, 12, 4);

    // antenna with pulsing orb
    ctx.beginPath();
    ctx.strokeStyle = THEME.accent || THEME.wire;
    ctx.lineWidth = 3;
    ctx.moveTo(12, -32);
    ctx.lineTo(18, -44);
    ctx.stroke();
    ctx.beginPath();
    const pulse = 0.5 + Math.abs(Math.sin(t / 300)) * 0.5;
    ctx.fillStyle = `rgba(255, 237, 153, ${0.7 * pulse})`;
    ctx.arc(18, -44, 4 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawOrbs() {
    // trails (soft blurred strokes)
    for (const orb of state.orbs) {
      if (!orb.alive) continue;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(255,230,120,1)";
      for (let i = orb.trail.length - 1; i >= 0; i--) {
        const p = orb.trail[i];
        const s = 4 * (i / orb.trail.length);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, s, s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // orbs themselves
    for (const orb of state.orbs) {
      if (!orb.alive) continue;
      ctx.beginPath();
      const g = ctx.createLinearGradient(orb.x - 8, orb.y - 8, orb.x + 8, orb.y + 8);
      g.addColorStop(0, "#fff7d6");
      g.addColorStop(1, THEME.orbFill);
      ctx.fillStyle = g;
      ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
      ctx.fill();

      // subtle highlight
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.ellipse(orb.x - 5, orb.y - 6, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // value
      ctx.fillStyle = "#2d2d2d";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText(orb.value, orb.x, orb.y + 5);
    }
  }

  function drawUI() {
    // top-left info
    ctx.fillStyle = THEME.infoPanel;
    roundRect(ctx, 12, 12, 280, 72, 10);
    ctx.fill();
    ctx.strokeStyle = "#bfecec";
    ctx.stroke();

    ctx.fillStyle = THEME.text;
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${state.score}`, 28, 36);
    ctx.fillText(`Round: ${state.round}`, 28, 56);
    ctx.fillText(`Lives: ${state.lives}`, 160, 56);

    // message box
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    roundRect(ctx, 310, 12, 398, 72, 10);
    ctx.fill();
    ctx.strokeStyle = "#bfecec";
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    wrapText(ctx, state.message || "", 326, 34, 370, 18);

    // speaker icon
    ctx.save();
    ctx.translate(WIDTH - 44, 36);
    ctx.fillStyle = audioManager.enabled ? THEME.speakerOn : THEME.speakerOff;
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(-4, -8);
    ctx.lineTo(4, -16);
    ctx.lineTo(4, 16);
    ctx.lineTo(-4, 8);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    if (audioManager.enabled) {
      ctx.beginPath();
      ctx.strokeStyle = THEME.speakerOn;
      ctx.lineWidth = 2;
      ctx.arc(6, 0, 6, -0.5, 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(6, 0, 10, -0.5, 0.5);
      ctx.stroke();
    } else {
      ctx.strokeStyle = THEME.speakerOff;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -8);
      ctx.lineTo(8, 8);
      ctx.moveTo(8, -8);
      ctx.lineTo(-8, 8);
      ctx.stroke();
    }
    ctx.restore();

    // Accessibility block
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    roundRect(ctx, 12, HEIGHT - 110, 260, 88, 8);
    ctx.fill();
    ctx.strokeStyle = "#cfeeea";
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.font = "12px sans-serif";
    wrapText(
      ctx,
      "Instructions: Aim with mouse or arrow keys. Press Space to zap the number-orb into a bulb. Make each bulb's number match the target. Press M to toggle sound.",
      24,
      HEIGHT - 90,
      232,
      16
    );
  }

  function roundRect(ctxRef, x, y, w, h, r) {
    ctxRef.beginPath();
    ctxRef.moveTo(x + r, y);
    ctxRef.arcTo(x + w, y, x + w, y + h, r);
    ctxRef.arcTo(x + w, y + h, x, y + h, r);
    ctxRef.arcTo(x, y + h, x, y, r);
    ctxRef.arcTo(x, y, x + w, y, r);
    ctxRef.closePath();
  }

  function wrapText(ctxRef, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let curY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctxRef.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctxRef.fillText(line, x, curY);
        line = words[n] + " ";
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctxRef.fillText(line, x, curY);
  }

  function drawSparky(x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    const bob = Math.sin(t / 320) * 3;
    ctx.translate(0, bob);
    // glowing body
    ctx.beginPath();
    ctx.fillStyle = "#fff7a8";
    ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // wings
    ctx.beginPath();
    ctx.fillStyle = "rgba(232,246,255,0.95)";
    ctx.ellipse(-6, -6, 6, 4, -0.5, 0, Math.PI * 2);
    ctx.ellipse(6, -6, 6, 4, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // antenna
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-3, -6);
    ctx.lineTo(-8, -12);
    ctx.moveTo(3, -6);
    ctx.lineTo(8, -12);
    ctx.stroke();
    ctx.restore();
  }

  // Render loop
  function render(ts) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();

    // decorative ambient particles
    ctx.save();
    for (const p of state.particles) {
      ctx.beginPath();
      ctx.fillStyle = `hsla(${200 + p.hueOffset}, 80%, 60%, ${clamp(p.life / 600, 0, 0.9)})`;
      ctx.arc(p.x, p.y, p.radius + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    drawBulbs();
    drawOrbs();
    drawGenerator();
    drawUI();

    // decorative friend
    drawSparky(WIDTH - 80, 80, ts);

    // focus ring
    if (document.activeElement === canvas) {
      ctx.strokeStyle = "#9dd6d6";
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);
    }
  }

  // Main animation loop with delta time
  let lastTime = performance.now();
  function loop(ts) {
    const dt = ts - lastTime;
    lastTime = ts;
    update(dt);
    render(ts);
    requestAnimationFrame(loop);
  }

  // Initialization & error handling
  try {
    setupRound(1);
    requestAnimationFrame(loop);
  } catch (err) {
    console.error("Game initialization error:", err);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#ffdddd";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#600";
    ctx.font = "18px sans-serif";
    ctx.fillText("An error occurred loading the game. Try reloading the page.", 24, 40);
  }

  // Provide console tips
  console.info(
    "Electricity Math Game ready. Controls: Arrow keys to aim, Space to shoot, M to toggle sound, R restart, P pause. Click speaker icon to toggle sound."
  );

  // Expose for debugging if needed
  window._electricMathGame = { state, audioManager, setupRound };
})();