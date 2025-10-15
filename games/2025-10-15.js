(function () {
  // Drone Math Catcher - Enhanced Visuals & Audio (Canvas + Web Audio)
  // Only visuals and audio were improved. Game mechanics and math logic remain unchanged.
  // All graphics drawn on canvas. Sounds generated with Web Audio API oscillators/filters.
  // Clean, readable modern JavaScript with error handling.

  // Ensure host container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Create canvas with exact dimensions required
  const WIDTH = 720;
  const HEIGHT = 480;
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = 'block';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Catcher. Use left and right arrows to move. Press R to restart.'
  );
  canvas.tabIndex = 0;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // UI layout constants and padding
  const PADDING = 12;
  const TOP_UI_Y = PADDING;
  const SCORE_X = PADDING;
  const LIVES_X = WIDTH - PADDING;
  const INSTRUCTIONS_Y = HEIGHT - 72;
  const MIN_BODY_FONT = 14;
  const BIG_FONT = 24;

  // Game parameters (kept same)
  const TARGET_SCORE = 10;
  const MAX_LIVES = 3;
  const PACKAGE_SPEED_MIN = 0.4;
  const PACKAGE_SPEED_MAX = 1.2;
  const DRONE_SPEED = 4;
  const PACKAGE_RADIUS = 28;
  const DRONE_WIDTH = 80;
  const DRONE_HEIGHT = 32;

  // Game state
  let score = 0;
  let lives = MAX_LIVES;
  let level = 1;
  let gameState = 'running'; // running, won, lost, paused
  let packages = [];
  let currentProblem = null;
  let keys = {};
  let animationFrameId = null;
  let lastTime = performance.now();

  // small visuals state
  let glowPulse = 0;
  let lastScoreGlow = 0;
  let lastLivesGlow = 0;
  // particles for collect effects
  let particles = [];

  // Accessibility messages
  function updateAriaMessage(msg) {
    canvas.setAttribute('aria-label', msg);
  }

  // Audio setup with error handling
  let audioCtx = null;
  let audioAllowed = true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  } catch (e) {
    console.warn('Web Audio API not available or blocked:', e);
    audioAllowed = false;
    audioCtx = null;
  }

  function tryResumeAudio() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('AudioContext resume failed:', e);
      });
    }
  }

  // Background ambient ambientizer
  let ambient = {
    nodes: [],
    scheduler: null,
    running: false,
  };

  function safeConnect(source, dest) {
    try {
      source.connect(dest);
    } catch (e) {
      // ignore connection issues
    }
  }

  // Start a subtle ambient background: soft pad + occasional twinkle
  function startBackgroundHum() {
    if (!audioAllowed || !audioCtx || ambient.running) return;
    try {
      // Soft pad: two oscillators with slow amplitude LFO
      const padGain = audioCtx.createGain();
      padGain.gain.setValueAtTime(0.01, audioCtx.currentTime);
      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(800, audioCtx.currentTime);

      const oscA = audioCtx.createOscillator();
      oscA.type = 'sine';
      oscA.frequency.setValueAtTime(92, audioCtx.currentTime);
      safeConnect(oscA, padFilter);

      const oscB = audioCtx.createOscillator();
      oscB.type = 'sine';
      safeConnect(oscB, padFilter);
      oscB.frequency.setValueAtTime(110, audioCtx.currentTime);

      safeConnect(padFilter, padGain);
      safeConnect(padGain, audioCtx.destination);

      // slow LFO on padGain
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.08, audioCtx.currentTime);
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.setValueAtTime(0.006, audioCtx.currentTime);
      safeConnect(lfo, lfoGain);
      safeConnect(lfoGain, padGain.gain);

      oscA.start();
      oscB.start();
      lfo.start();

      ambient.nodes.push(oscA, oscB, padFilter, padGain, lfo, lfoGain);
      ambient.running = true;

      // occasional twinkle chime scheduled by interval (very subtle)
      ambient.scheduler = setInterval(() => {
        if (!audioCtx || audioCtx.state === 'suspended') return;
        const now = audioCtx.currentTime;
        try {
          const tw = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          tw.type = 'triangle';
          tw.frequency.setValueAtTime(880 + Math.random() * 400, now);
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(0.03, now + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
          safeConnect(tw, g);
          safeConnect(g, audioCtx.destination);
          tw.start(now);
          tw.stop(now + 0.65);
          // cleanup after stop
          setTimeout(() => {
            try {
              tw.disconnect();
              g.disconnect();
            } catch (e) {}
          }, 800);
        } catch (e) {
          console.warn('twinkle failed', e);
        }
      }, 4500 + Math.random() * 3000);
    } catch (e) {
      console.warn('Could not start background hum', e);
      stopBackgroundHum();
    }
  }

  function stopBackgroundHum() {
    if (!ambient.running) return;
    try {
      ambient.nodes.forEach((n) => {
        try {
          if (n.stop) n.stop();
          n.disconnect && n.disconnect();
        } catch (e) {
          /* ignore */
        }
      });
      ambient.nodes = [];
      if (ambient.scheduler) {
        clearInterval(ambient.scheduler);
        ambient.scheduler = null;
      }
    } catch (e) {
      // ignore
    } finally {
      ambient.running = false;
    }
  }

  // Sound effects: spawn, success, fail (use oscillators/filters)
  function playSpawnSound() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(540, now);
      o.frequency.exponentialRampToValueAtTime(720, now + 0.08);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.02, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      safeConnect(o, g);
      safeConnect(g, audioCtx.destination);
      o.start(now);
      o.stop(now + 0.26);
    } catch (e) {
      console.warn('spawn sound error', e);
    }
  }

  function playSuccessSound() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // small arpeggio of three partials
      const freqs = [660, 880, 990];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.setValueAtTime(f, now + i * 0.04);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, now + i * 0.04);
        g.gain.linearRampToValueAtTime(0.06 - i * 0.015, now + i * 0.04 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.38);
        safeConnect(o, g);
        safeConnect(g, audioCtx.destination);
        o.start(now + i * 0.04);
        o.stop(now + i * 0.04 + 0.42);
      });
    } catch (e) {
      console.warn('success sound error', e);
    }
  }

  function playFailSound() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // low thud + quick noise burst
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140, now);
      o.frequency.exponentialRampToValueAtTime(60, now + 0.14);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(1200, now);
      safeConnect(o, filt);
      safeConnect(filt, g);
      safeConnect(g, audioCtx.destination);
      o.start(now);
      o.stop(now + 0.34);

      // subtle noise for failure
      const bufferSize = 2 * audioCtx.sampleRate;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.4;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      const ng = audioCtx.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.linearRampToValueAtTime(0.02, now + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      const nf = audioCtx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.setValueAtTime(900, now);
      safeConnect(noise, nf);
      safeConnect(nf, ng);
      safeConnect(ng, audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.22);
    } catch (e) {
      console.warn('fail sound error', e);
    }
  }

  // Small "whoosh" when packages collected or miss
  function playWhoosh(up = true) {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(up ? 480 : 280, now);
      o.frequency.exponentialRampToValueAtTime(up ? 820 : 80, now + 0.18);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      safeConnect(o, g);
      safeConnect(g, audioCtx.destination);
      o.start(now);
      o.stop(now + 0.28);
    } catch (e) {
      console.warn('whoosh error', e);
    }
  }

  // Particle system for nice visual feedback on correct collect
  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 2.8;
      this.vy = -1 - Math.random() * 2.6;
      this.life = 0.9 + Math.random() * 0.6;
      this.size = 3 + Math.random() * 4;
      this.color = color;
      this.age = 0;
    }

    update(dt) {
      this.age += dt;
      this.x += this.vx * dt * 0.06;
      this.y += this.vy * dt * 0.06;
      this.vy += 0.06 * dt * 0.0012; // gravity
    }

    draw(ctx) {
      ctx.save();
      const alpha = Math.max(0, 1 - this.age / this.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (0.6 + 0.4 * alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    isDead() {
      return this.age >= this.life;
    }
  }

  // Game objects

  const drone = {
    x: WIDTH / 2,
    y: HEIGHT - 80,
    vx: 0,
    width: DRONE_WIDTH,
    height: DRONE_HEIGHT,
    color: '#3DA9FC',
    propAngle: 0,
    draw(ctx, t) {
      // drone body with subtle gloss and propeller animation
      ctx.save();
      // shadow underneath
      const shadowGrad = ctx.createRadialGradient(this.x, this.y + 28, 5, this.x, this.y + 28, 60);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 28, 46, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // main body
      ctx.translate(this.x, this.y);
      // body gradient
      const bodyGrad = ctx.createLinearGradient(-this.width / 2, 0, this.width / 2, 0);
      bodyGrad.addColorStop(0, '#1976D2');
      bodyGrad.addColorStop(0.5, '#3DA9FC');
      bodyGrad.addColorStop(1, '#6AC7FF');
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#083057';
      ctx.lineWidth = 2;
      // fuselage
      ctx.beginPath();
      ctx.ellipse(0, 0, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // cockpit highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(-12, -4, this.width * 0.22, this.height * 0.42, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // legs
      ctx.strokeStyle = '#0B2540';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-26, 14);
      ctx.lineTo(-26, 26);
      ctx.moveTo(26, 14);
      ctx.lineTo(26, 26);
      ctx.stroke();

      // propeller arms
      ctx.strokeStyle = '#0B2540';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-this.width / 2 + 10, -this.height / 2 - 8);
      ctx.lineTo(-this.width / 2 + 10 - 18, -this.height / 2 - 16);
      ctx.moveTo(this.width / 2 - 10, -this.height / 2 - 8);
      ctx.lineTo(this.width / 2 - 10 + 18, -this.height / 2 - 16);
      ctx.stroke();

      // propellers (animated)
      const propR = 18;
      const pa = this.propAngle;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      // left prop
      ctx.save();
      ctx.translate(-this.width / 2 + 10 - 18, -this.height / 2 - 16);
      ctx.rotate(pa);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, propR * 0.28, propR * 0.4, propR * 0.12, (i * Math.PI) / 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate((Math.PI * 2) / 3);
      }
      ctx.restore();

      // right prop
      ctx.save();
      ctx.translate(this.width / 2 - 10 + 18, -this.height / 2 - 16);
      ctx.rotate(-pa * 0.9);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, propR * 0.28, propR * 0.4, propR * 0.12, (i * Math.PI) / 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate((Math.PI * 2) / 3);
      }
      ctx.restore();

      ctx.restore();

      // thin hitbox outline for accessibility
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
      ctx.restore();
    },

    update() {
      if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
        this.vx = -DRONE_SPEED;
      } else if (keys['ArrowRight'] || keys['d'] || keys['D']) {
        this.vx = DRONE_SPEED;
      } else {
        this.vx = 0;
      }
      this.x += this.vx;
      if (this.x < this.width / 2) this.x = this.width / 2;
      if (this.x > WIDTH - this.width / 2) this.x = WIDTH - this.width / 2;
      // propeller rotation speed scales with horizontal speed a bit
      this.propAngle += 0.18 + Math.abs(this.vx) * 0.06;
      // keep angle in range
      if (this.propAngle > Math.PI * 100) this.propAngle = this.propAngle % (Math.PI * 2);
    },
  };

  // Package item class (keeps original physics/math)
  class PackageItem {
    constructor(x, y, value, speed, color) {
      this.x = x;
      this.y = y;
      this.value = value;
      this.speed = speed;
      this.color = color;
      this.radius = PACKAGE_RADIUS;
      this.collected = false;
      this.rotation = Math.random() * Math.PI * 2;
      this.bob = Math.random() * Math.PI * 2;
    }

    update(dt) {
      this.y += this.speed * dt;
      this.x += Math.sin(this.y / 40) * 0.22;
      // gentle rotation/bob
      this.rotation += 0.01 * dt;
      this.bob += 0.02 * dt;
    }

    draw(ctx) {
      ctx.save();
      // subtle drop shadow
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.ellipse(this.x + 6, this.y + this.radius + 8, this.radius * 0.68, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // package body with slight 3D effect
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.sin(this.bob) * 0.05 + Math.cos(this.rotation) * 0.02);
      const bodyGrad = ctx.createLinearGradient(-this.radius, -this.radius, this.radius, this.radius);
      bodyGrad.addColorStop(0, this.color);
      bodyGrad.addColorStop(1, shadeColor(this.color, -12));
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();

      // tape strap (slightly reflective)
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(-this.radius * 0.7, -8, this.radius * 1.4, 14);
      ctx.restore();

      // stitched border
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius - 1, 0, Math.PI * 2);
      ctx.stroke();

      // number badge
      ctx.fillStyle = '#072A40';
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.value), 0, 0);
      ctx.restore();
    }

    isOffscreen() {
      return this.y - this.radius > HEIGHT;
    }

    collidesWithDrone(drone) {
      const dx = this.x - drone.x;
      const dy = this.y - drone.y;
      const closestX = Math.max(drone.x - drone.width / 2, Math.min(this.x, drone.x + drone.width / 2));
      const closestY = Math.max(drone.y - drone.height / 2, Math.min(this.y, drone.y + drone.height / 2));
      const distX = this.x - closestX;
      const distY = this.y - closestY;
      return distX * distX + distY * distY < this.radius * this.radius;
    }
  }

  // Utility: shade color (hex) by percent (-100..100)
  function shadeColor(hex, percent) {
    try {
      const h = hex.replace('#', '');
      const num = parseInt(h, 16);
      let r = (num >> 16) + percent;
      let g = ((num >> 8) & 0x00ff) + percent;
      let b = (num & 0x0000ff) + percent;
      r = Math.max(Math.min(255, r), 0);
      g = Math.max(Math.min(255, g), 0);
      b = Math.max(Math.min(255, b), 0);
      return `rgb(${r},${g},${b})`;
    } catch (e) {
      return hex;
    }
  }

  // drawTextBox helper remains but refined to ensure spacing
  function drawTextBox(ctx, text, x, y, options = {}) {
    const font = options.font || `${MIN_BODY_FONT}px sans-serif`;
    const padding = options.padding || 8;
    const align = options.align || 'left';
    const baseline = options.baseline || 'top';
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    const lines = String(text).split('\n');
    let maxWidth = 0;
    for (const line of lines) {
      const m = ctx.measureText(line).width;
      if (m > maxWidth) maxWidth = m;
    }
    let boxX = x;
    if (align === 'center') boxX = x - maxWidth / 2 - padding;
    else if (align === 'right') boxX = x - maxWidth - padding * 2;
    let boxY = y;
    if (baseline === 'middle') boxY = y - (lines.length * parseInt(font, 10)) / 2 - padding;
    else if (baseline === 'bottom') boxY = y - lines.length * parseInt(font, 10) - padding * 2;
    const boxW = maxWidth + padding * 2;
    const lineHeight = parseInt(font, 10) + 6;
    const boxH = lines.length * lineHeight + padding * 2 - 6;

    // Slight translucent blur background for readability
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 8, true, false);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    roundRect(ctx, boxX, boxY, boxW, boxH, 8, false, true);

    ctx.fillStyle = '#072A40';
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    let textX = x;
    if (align === 'center') textX = x;
    else if (align === 'left') textX = boxX + padding;
    else if (align === 'right') textX = boxX + boxW - padding;
    let textY = boxY + padding;
    for (const line of lines) {
      ctx.fillText(line, textX, textY);
      textY += lineHeight;
    }
    ctx.restore();
    return { x: boxX, y: boxY, w: boxW, h: boxH };
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
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

  // Math problem generation (kept unchanged)
  function generateProblem() {
    const type = Math.random() < 0.6 ? 'add' : 'sub';
    let a, b, answer;
    if (type === 'add') {
      a = Math.floor(Math.random() * 10) + 1;
      b = Math.floor(Math.random() * Math.min(10, 11 - a)) + 1;
      answer = a + b;
    } else {
      a = Math.floor(Math.random() * 12) + 2;
      b = Math.floor(Math.random() * (a - 1)) + 1;
      answer = a - b;
    }
    const text = type === 'add' ? `${a} + ${b}` : `${a} - ${b}`;
    return { text, answer, a, b, type };
  }

  // Spawn packages (kept logic but added spawn sound)
  function spawnPackagesForProblem(problem) {
    packages = [];
    const correctValue = problem.answer;
    const distractors = new Set();
    while (distractors.size < 2) {
      let delta = Math.floor(Math.random() * 5) - 2;
      if (delta === 0) delta = 3;
      const val = correctValue + delta;
      if (val < 0 || val === correctValue) continue;
      distractors.add(val);
    }
    const values = [correctValue, ...Array.from(distractors)];
    // shuffle
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    const xPositions = [WIDTH * 0.22, WIDTH * 0.5, WIDTH * 0.78];
    for (let i = 0; i < values.length; i++) {
      const x = xPositions[i] + (Math.random() * 36 - 18);
      const y = -20 - Math.random() * 80;
      const speed = PACKAGE_SPEED_MIN + Math.random() * (PACKAGE_SPEED_MAX - PACKAGE_SPEED_MIN) + level * 0.06;
      const color = ['#FFD166', '#06D6A0', '#FF6B6B'][i % 3];
      packages.push(new PackageItem(x, y, values[i], speed, color));
    }
    // gentle spawn sound and slight whoosh
    playSpawnSound();
    playWhoosh(true);
  }

  // New round (unchanged)
  function newRound() {
    currentProblem = generateProblem();
    spawnPackagesForProblem(currentProblem);
    updateAriaMessage(`New problem: ${currentProblem.text}. Move the drone to catch the correct package.`);
  }

  // Restart game (unchanged except visual/audio resets)
  function restartGame() {
    score = 0;
    lives = MAX_LIVES;
    level = 1;
    gameState = 'running';
    drone.x = WIDTH / 2;
    packages = [];
    particles = [];
    glowPulse = 0;
    lastScoreGlow = 0;
    lastLivesGlow = 0;
    newRound();
    tryResumeAudio();
    startBackgroundHum();
  }

  // Handle collection results (mechanics unchanged, added visuals/sounds)
  function handleCollection(pkg) {
    if (!pkg) return;
    // spawn small particle burst at package position
    const colors = ['#FFD166', '#06D6A0', '#FF6B6B', '#6AC7FF', '#FFC77D'];
    for (let i = 0; i < 18; i++) {
      particles.push(
        new Particle(
          pkg.x + (Math.random() - 0.5) * 10,
          pkg.y + (Math.random() - 0.5) * 6,
          colors[Math.floor(Math.random() * colors.length)]
        )
      );
    }
    if (pkg.value === currentProblem.answer) {
      score += 1;
      lastScoreGlow = performance.now();
      playSuccessSound();
      playWhoosh(true);
      updateAriaMessage(`Correct! You collected ${pkg.value}. Score ${score} of ${TARGET_SCORE}.`);
      if (score >= TARGET_SCORE) {
        gameState = 'won';
        stopBackgroundHum();
      } else {
        level = 1 + Math.floor(score / 3);
        newRound();
      }
    } else {
      lives -= 1;
      lastLivesGlow = performance.now();
      playFailSound();
      playWhoosh(false);
      updateAriaMessage(`Oops! ${pkg.value} was wrong. Lives left ${lives}.`);
      if (lives <= 0) {
        gameState = 'lost';
        stopBackgroundHum();
      } else {
        spawnPackagesForProblem(currentProblem);
      }
    }
  }

  // Input handling
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === 'r' || e.key === 'R') {
      restartGame();
    }
    if (e.key === 'p' || e.key === 'P') {
      gameState = gameState === 'running' ? 'paused' : 'running';
      if (gameState === 'running') {
        tryResumeAudio();
        startBackgroundHum();
      } else {
        stopBackgroundHum();
      }
    }
    tryResumeAudio();
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  // Mouse click handling for restart button
  canvas.addEventListener('click', (e) => {
    canvas.focus();
    tryResumeAudio();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (gameState === 'won' || gameState === 'lost') {
      const btnW = 220;
      const btnH = 50;
      const btnX = WIDTH / 2 - btnW / 2;
      const btnY = HEIGHT / 2 + 40;
      if (mx >= btnX && mx <= btnX + btnW && my >= btnY && my <= btnY + btnH) {
        restartGame();
      }
    }
  });

  // Main update (keeps gameplay logic intact)
  function update(dt) {
    if (gameState !== 'running') return;
    drone.update();
    const factor = dt * 0.06;
    for (let i = packages.length - 1; i >= 0; i--) {
      const pkg = packages[i];
      pkg.update(factor);
      if (pkg.collidesWithDrone(drone)) {
        const collected = pkg;
        packages.splice(i, 1);
        handleCollection(collected);
      } else if (pkg.isOffscreen()) {
        if (pkg.value === currentProblem.answer) {
          lives -= 1;
          lastLivesGlow = performance.now();
          playFailSound();
          playWhoosh(false);
          updateAriaMessage(`You missed the correct package. Lives left ${lives}.`);
          if (lives <= 0) {
            gameState = 'lost';
            stopBackgroundHum();
            return;
          }
          spawnPackagesForProblem(currentProblem);
          return;
        } else {
          packages.splice(i, 1);
          if (packages.length === 0) {
            spawnPackagesForProblem(currentProblem);
          }
        }
      }
    }

    // update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update(dt);
      if (particles[i].isDead()) particles.splice(i, 1);
    }

    // subtle glow pulse for UI
    glowPulse += dt * 0.004;
  }

  // Drawing loop (enhanced visuals)
  function draw() {
    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background gradient + soft parallax hills
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#EAF6FF');
    bg.addColorStop(1, '#F6FBFF');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // parallax hills
    ctx.save();
    ctx.translate(0, 30);
    drawHillLayer(ctx, 0.2, '#DCEFFF', 120, 0.18);
    drawHillLayer(ctx, 0.4, '#C9E9FF', 80, 0.12);
    drawHillLayer(ctx, 0.8, '#BEE7FF', 50, 0.06);
    ctx.restore();

    // subtle grid lines for depth (very faint)
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#073B4C';
    ctx.lineWidth = 1;
    for (let y = 120; y < HEIGHT; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    // floating soft clouds (animated)
    ctx.save();
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < 3; i++) {
      const cx = (i * 260 + (Date.now() * 0.02) % 260) % (WIDTH + 120) - 60;
      const cy = 48 + i * 14 + Math.sin(Date.now() / 1400 + i) * 6;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 68, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 28, cy - 8, 42, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - 36, cy - 6, 36, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Top UI: Score box on left with glow when updated
    const scoreText = `Score: ${score}/${TARGET_SCORE}`;
    ctx.font = `bold ${BIG_FONT}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const scoreBox = drawTextBox(ctx, scoreText, SCORE_X + 2, TOP_UI_Y + 2, {
      font: `bold ${BIG_FONT}px sans-serif`,
      padding: 10,
      align: 'left',
      baseline: 'top',
    });
    // glow effect when recently changed
    const nowMs = performance.now();
    if (nowMs - lastScoreGlow < 900) {
      const a = 1 - (nowMs - lastScoreGlow) / 900;
      ctx.save();
      ctx.globalAlpha = 0.12 * a;
      ctx.fillStyle = '#06D6A0';
      roundRect(ctx, scoreBox.x - 6, scoreBox.y - 6, scoreBox.w + 12, scoreBox.h + 12, 10, true, false);
      ctx.restore();
    }

    // Lives box on right with similar glow
    const livesText = `Lives: ${lives}`;
    ctx.font = `bold ${BIG_FONT}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const livesBox = drawTextBox(ctx, livesText, LIVES_X - 2, TOP_UI_Y + 2, {
      font: `bold ${BIG_FONT}px sans-serif`,
      padding: 10,
      align: 'right',
      baseline: 'top',
    });
    if (nowMs - lastLivesGlow < 900) {
      const a = 1 - (nowMs - lastLivesGlow) / 900;
      ctx.save();
      ctx.globalAlpha = 0.12 * a;
      ctx.fillStyle = '#FF6B6B';
      roundRect(ctx, livesBox.x - 6, livesBox.y - 6, livesBox.w + 12, livesBox.h + 12, 10, true, false);
      ctx.restore();
    }

    // Problem text center top
    const problemText = currentProblem ? `Solve: ${currentProblem.text}` : 'Loading...';
    ctx.font = `bold 20px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    drawTextBox(ctx, problemText, WIDTH / 2, TOP_UI_Y + 2, {
      font: `bold 20px sans-serif`,
      padding: 10,
      align: 'center',
      baseline: 'top',
    });

    // Draw drone
    drone.draw(ctx);

    // Draw packages
    for (const pkg of packages) pkg.draw(ctx);

    // Draw particles on top
    for (const p of particles) p.draw(ctx);

    // Instructions box bottom center
    const instructions = 'Use ← → or A D to move. Catch the correct number.\nPress R to restart, P to pause.';
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    drawTextBox(ctx, instructions, WIDTH / 2, INSTRUCTIONS_Y, {
      font: `${MIN_BODY_FONT}px sans-serif`,
      padding: 10,
      align: 'center',
      baseline: 'top',
    });

    // Audio status
    ctx.save();
    const audioLabel = audioAllowed && audioCtx ? 'Audio: On (press any key to enable)' : 'Audio: Off';
    ctx.font = `13px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    drawTextBox(ctx, audioLabel, PADDING, INSTRUCTIONS_Y - 50, {
      font: `13px sans-serif`,
      padding: 8,
      align: 'left',
      baseline: 'top',
    });
    ctx.restore();

    // Paused overlay
    if (gameState === 'paused') {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 10, 17, 0.44)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      drawTextBox(ctx, 'Paused', WIDTH / 2, HEIGHT / 2 - 38, {
        font: 'bold 36px sans-serif',
        padding: 14,
        align: 'center',
        baseline: 'middle',
      });
      ctx.restore();
    }

    // End screens (maintain clear win/loss conditions and UI spacing)
    if (gameState === 'won') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.fillRect(56, 76, WIDTH - 112, HEIGHT - 152);
      ctx.strokeStyle = '#0B2540';
      ctx.lineWidth = 3;
      ctx.strokeRect(56, 76, WIDTH - 112, HEIGHT - 152);

      drawTextBox(
        ctx,
        `Victory!\nYou helped the drone collect ${TARGET_SCORE} correct packages!`,
        WIDTH / 2,
        HEIGHT / 2 - 40,
        {
          font: 'bold 28px sans-serif',
          padding: 16,
          align: 'center',
          baseline: 'middle',
        }
      );

      // Play again button
      const btnW = 220;
      const btnH = 50;
      const btnX = WIDTH / 2 - btnW / 2;
      const btnY = HEIGHT / 2 + 40;
      ctx.fillStyle = '#06D6A0';
      roundRect(ctx, btnX, btnY, btnW, btnH, 10, true, false);
      ctx.strokeStyle = '#054A3C';
      ctx.lineWidth = 2;
      roundRect(ctx, btnX, btnY, btnW, btnH, 10, false, true);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#053A2B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Play Again (Click R)', WIDTH / 2, btnY + btnH / 2);
      ctx.restore();
    } else if (gameState === 'lost') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.fillRect(56, 76, WIDTH - 112, HEIGHT - 152);
      ctx.strokeStyle = '#6B0F1A';
      ctx.lineWidth = 3;
      ctx.strokeRect(56, 76, WIDTH - 112, HEIGHT - 152);

      drawTextBox(
        ctx,
        `Game Over\nYou ran out of lives. Score: ${score}`,
        WIDTH / 2,
        HEIGHT / 2 - 30,
        {
          font: 'bold 26px sans-serif',
          padding: 16,
          align: 'center',
          baseline: 'middle',
        }
      );

      const btnW = 220;
      const btnH = 50;
      const btnX = WIDTH / 2 - btnW / 2;
      const btnY = HEIGHT / 2 + 60;
      ctx.fillStyle = '#FF6B6B';
      roundRect(ctx, btnX, btnY, btnW, btnH, 10, true, false);
      ctx.strokeStyle = '#5B1010';
      ctx.lineWidth = 2;
      roundRect(ctx, btnX, btnY, btnW, btnH, 10, false, true);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#381313';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Try Again (Click R)', WIDTH / 2, btnY + btnH / 2);
      ctx.restore();
    }
  }

  // Helper: draw layered hills for background
  function drawHillLayer(ctx, speedFactor, color, amplitude, yOffsetFactor) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const seed = Date.now() * 0.00012 * speedFactor;
    ctx.moveTo(0, HEIGHT);
    for (let x = 0; x <= WIDTH; x += 24) {
      const y =
        120 +
        Math.sin(x * 0.012 + seed) * amplitude * (yOffsetFactor + 0.4) +
        Math.cos(seed * 0.3 + x * 0.006) * (amplitude * 0.12);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Game loop
  function gameLoop(ts) {
    const dt = ts - lastTime;
    lastTime = ts;
    update(dt);
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  // Start game
  function start() {
    tryResumeAudio();
    startBackgroundHum();
    restartGame();
    lastTime = performance.now();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  // Pause/resume on blur/focus with audio handling
  window.addEventListener('blur', () => {
    if (gameState === 'running') {
      gameState = 'paused';
      stopBackgroundHum();
    }
  });

  window.addEventListener('focus', () => {
    if (gameState === 'paused') {
      gameState = 'running';
      tryResumeAudio();
      startBackgroundHum();
    }
  });

  // Initial instructions
  console.log('Drone Math Catcher loaded. Focus the canvas and use arrow keys to play. Press R to restart.');
  updateAriaMessage('Drone Math Catcher loaded. Press arrow keys to move. Press R to restart.');

  // Kick off
  start();
})();