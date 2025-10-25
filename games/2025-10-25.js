(function () {
  // Enhanced Drone Math Collector - Visual & Audio Improvements Only
  // Renders into element with id "game-of-the-day-stage"
  // Uses only canvas drawing and Web Audio API (no external resources).
  'use strict';

  // Configuration (unchanged game mechanics)
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL_CORRECT = 10;
  const MAX_WRONG = 3;
  const PACKAGE_COUNT = 4;
  const HEADER_HEIGHT = 64;
  const FOOTER_HEIGHT = 100;
  const UI_PADDING = 12;
  const DRONE_RADIUS = 20;
  const PACKAGE_RADIUS = 28;
  const BG_COLOR = '#E8F6FF';
  const FONT_BASE = '16px "Segoe UI", Roboto, Arial, sans-serif';
  const FONT_LARGE = '22px "Segoe UI", Roboto, Arial, sans-serif';
  const FONT_BIGGER = '28px "Segoe UI", Roboto, Arial, sans-serif';

  // Container and canvas
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container with ID "game-of-the-day-stage" not found.');
    return;
  }
  container.setAttribute('role', 'application');
  container.setAttribute(
    'aria-label',
    'Drone Math Collector. Move the drone to collect packages with correct answers. Use arrow keys or number keys 1 to 4. Press R to restart.'
  );

  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('2D canvas context not available.');
    return;
  }

  // Audio setup with robust handling
  let AudioContextCtor = window.AudioContext || window.webkitAudioContext || null;
  let audioCtx = null;
  let audioAvailable = false;
  let audioStateText = 'Audio: OFF (press Space to enable)';
  let bgMasterGain = null;
  let bgOsc1 = null;
  let bgOsc2 = null;
  let bgFilter = null;
  let bgLfo = null;

  // Initialize audio: more layered ambient with LFO for movement
  function initAudio() {
    if (!AudioContextCtor) {
      audioAvailable = false;
      audioStateText = 'Audio not supported by browser.';
      return;
    }
    try {
      if (!audioCtx) audioCtx = new AudioContextCtor();

      // Master gain
      bgMasterGain = audioCtx.createGain();
      bgMasterGain.gain.value = 0.025; // safe low volume
      bgMasterGain.connect(audioCtx.destination);

      // Two detuned oscillators for a warm pad
      bgOsc1 = audioCtx.createOscillator();
      bgOsc1.type = 'sine';
      bgOsc1.frequency.value = 110;
      bgOsc2 = audioCtx.createOscillator();
      bgOsc2.type = 'sine';
      bgOsc2.frequency.value = 112.3; // slight detune

      // Filter to soften
      bgFilter = audioCtx.createBiquadFilter();
      bgFilter.type = 'lowpass';
      bgFilter.frequency.value = 650;

      // Gentle LFO to modulate filter frequency for motion
      bgLfo = audioCtx.createOscillator();
      bgLfo.type = 'sine';
      bgLfo.frequency.value = 0.08;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 260; // amount of frequency modulation

      bgOsc1.connect(bgFilter);
      bgOsc2.connect(bgFilter);
      bgFilter.connect(bgMasterGain);

      bgLfo.connect(lfoGain);
      lfoGain.connect(bgFilter.frequency);

      bgOsc1.start();
      bgOsc2.start();
      bgLfo.start();

      audioAvailable = true;
      audioStateText = 'Audio: ON (press Space to mute)';
    } catch (e) {
      console.error('AudioContext creation failed:', e);
      audioAvailable = false;
      audioStateText = 'Audio unavailable.';
    }
  }

  // Toggle audio safely (user gesture)
  function toggleAudio() {
    if (!AudioContextCtor) {
      audioAvailable = false;
      audioStateText = 'Audio not supported.';
      return;
    }
    if (!audioCtx) {
      try {
        initAudio();
      } catch (e) {
        audioAvailable = false;
        audioStateText = 'Audio unavailable.';
      }
    } else {
      if (audioCtx.state === 'suspended') {
        audioCtx
          .resume()
          .then(() => {
            audioAvailable = true;
            audioStateText = 'Audio: ON (press Space to mute)';
          })
          .catch((err) => {
            console.warn('Audio resume failed:', err);
            audioAvailable = false;
            audioStateText = 'Audio unavailable.';
          });
      } else if (audioCtx.state === 'running' && bgMasterGain) {
        // toggle mute
        if (bgMasterGain.gain.value > 0.001) {
          bgMasterGain.gain.value = 0;
          audioStateText = 'Audio: OFF (press Space to enable)';
        } else {
          bgMasterGain.gain.value = 0.025;
          audioStateText = 'Audio: ON (press Space to mute)';
        }
      }
    }
  }

  // Play richer sound effects for correct/incorrect using oscillator + filter envelopes
  function playBeep(type = 'correct') {
    if (!audioAvailable || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      if (type === 'correct') {
        osc.type = 'triangle';
        osc.frequency.value = 880;
        filter.type = 'highpass';
        filter.frequency.value = 350;
        gain.gain.value = 0.0001;
        // envelope
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        // pitch fall
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.4);
      } else if (type === 'incorrect') {
        osc.type = 'sawtooth';
        osc.frequency.value = 320;
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        gain.gain.value = 0.0001;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.34);
      } else {
        // click
        osc.type = 'square';
        osc.frequency.value = 1200;
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        gain.gain.value = 0.0001;
        gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      }

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.6);
    } catch (e) {
      console.warn('playBeep failed', e);
      audioAvailable = false;
    }
  }

  // Small click sound for UI
  function playClick() {
    playBeep('click');
  }

  // Utilities
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }
  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }
  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Game state (unchanged logic)
  let running = true;
  let correctCount = 0;
  let wrongCount = 0;
  let question = null;
  let packages = [];
  let drone = {
    x: WIDTH / 2,
    y: HEADER_HEIGHT + (HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT) / 2,
    vx: 0,
    vy: 0,
    speed: 180
  };
  let lastTime = performance.now();
  let keys = {};
  let hoverIndex = -1;
  let showEndScreen = false;
  let endState = null;

  // Simple particle system for gentle feedback (visual only)
  const particles = [];

  function spawnParticles(x, y, color, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(30, 150);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(10, 60),
        life: rand(0.6, 1.1),
        age: 0,
        size: rand(2, 5),
        color: color,
        wobble: rand(0, Math.PI * 2)
      });
    }
    // keep particle count bounded
    if (particles.length > 400) particles.splice(0, particles.length - 400);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      // gravity and air drag
      p.vy += 240 * dt; // gravity
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.wobble += dt * 8;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const t = p.age / p.life;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      const s = p.size * (1 + Math.sin(p.wobble) * 0.25);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Problem generation - keep as original logic
  function generateProblem() {
    const types = ['add', 'sub', 'mixed'];
    const t = types[randInt(0, types.length - 1)];
    let a, b, text, ans;
    if (t === 'add') {
      a = randInt(1, 15);
      b = randInt(1, Math.max(3, 16 - a));
      ans = a + b;
      text = `${a} + ${b} = ?`;
    } else if (t === 'sub') {
      a = randInt(2, 20);
      b = randInt(1, a - 1);
      ans = a - b;
      text = `${a} - ${b} = ?`;
    } else {
      if (Math.random() < 0.6) {
        a = randInt(2, 9);
        b = randInt(2, 4);
        ans = a * b;
        text = `${a} × ${b} = ?`;
      } else {
        a = randInt(1, 12);
        b = randInt(1, 12);
        ans = a + b;
        text = `${a} + ${b} = ?`;
      }
    }
    return { text, answer: ans };
  }

  function spawnPackages(correctAnswer) {
    packages = [];
    const attemptsMax = 1000;
    let attempts = 0;
    while (packages.length < PACKAGE_COUNT && attempts < attemptsMax) {
      attempts++;
      const x = randInt(PACKAGE_RADIUS + UI_PADDING, WIDTH - PACKAGE_RADIUS - UI_PADDING);
      const y = randInt(
        HEADER_HEIGHT + PACKAGE_RADIUS + UI_PADDING,
        HEIGHT - FOOTER_HEIGHT - PACKAGE_RADIUS - UI_PADDING
      );
      const pos = { x, y };
      let ok = true;
      if (distance(pos, drone) < DRONE_RADIUS + PACKAGE_RADIUS + 30) ok = false;
      for (const p of packages) {
        if (distance(pos, p) < PACKAGE_RADIUS * 2 + 12) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      packages.push({
        x,
        y,
        value: null,
        isCorrect: false,
        angle: rand(0, Math.PI * 2),
        ox: x,
        oy: y
      });
    }
    const correctIndex = randInt(0, packages.length - 1);
    for (let i = 0; i < packages.length; i++) {
      if (i === correctIndex) {
        packages[i].value = correctAnswer;
        packages[i].isCorrect = true;
      } else {
        let val = correctAnswer;
        let tries = 0;
        while ((val === correctAnswer || val < 0) && tries < 50) {
          tries++;
          const delta = randInt(-6, 6);
          val = correctAnswer + delta;
          if (Math.random() < 0.2) {
            val = correctAnswer + randInt(2, 7) * (Math.random() < 0.5 ? 1 : -1);
          }
        }
        if (val === correctAnswer) val = correctAnswer + 5;
        packages[i].value = val;
        packages[i].isCorrect = false;
      }
    }
  }

  function startNewQuestion() {
    question = generateProblem();
    spawnPackages(question.answer);
  }

  // Reset / start game
  function resetGame() {
    correctCount = 0;
    wrongCount = 0;
    drone.x = WIDTH / 2;
    drone.y = HEADER_HEIGHT + (HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT) / 2;
    drone.vx = 0;
    drone.vy = 0;
    keys = {};
    showEndScreen = false;
    endState = null;
    startNewQuestion();
    lastTime = performance.now();
    // Ensure audio running gently
    if (audioAvailable && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  // Collision detection unchanged
  function collides(aX, aY, aR, bX, bY, bR) {
    return (aX - bX) * (aX - bX) + (aY - bY) * (aY - bY) <= (aR + bR) * (aR + bR);
  }

  // On package collect: spawn particles and improved sounds
  function collectPackage(index) {
    if (showEndScreen || !packages[index]) return;
    const pkg = packages[index];
    if (!pkg) return;
    if (pkg.isCorrect) {
      correctCount++;
      playBeep('correct');
      spawnParticles(pkg.x, pkg.y, 'rgba(160,230,120,0.92)', 22);
      drone.x = clamp(drone.x - 6, DRONE_RADIUS + UI_PADDING, WIDTH - DRONE_RADIUS - UI_PADDING);
      if (correctCount >= GOAL_CORRECT) {
        showEnd('win');
        return;
      }
    } else {
      wrongCount++;
      playBeep('incorrect');
      spawnParticles(pkg.x, pkg.y, 'rgba(255,150,90,0.96)', 18);
      drone.y = clamp(drone.y + 18, HEADER_HEIGHT + DRONE_RADIUS, HEIGHT - FOOTER_HEIGHT - DRONE_RADIUS);
      if (wrongCount >= MAX_WRONG) {
        showEnd('lose');
        return;
      }
    }
    // create a small floating sparkle on drone to indicate pickup
    spawnParticles(drone.x, drone.y - DRONE_RADIUS, 'rgba(255,255,255,0.9)', 6);
    // next question
    startNewQuestion();
  }

  function showEnd(state) {
    showEndScreen = true;
    endState = state;
    if (bgMasterGain) {
      bgMasterGain.gain.value = 0.005;
    }
    if (state === 'win') {
      playBeep('correct');
      setTimeout(() => playBeep('correct'), 120);
    } else {
      playBeep('incorrect');
    }
  }

  // Input handling (unchanged behavior)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      resetGame();
      e.preventDefault();
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      toggleAudio();
      e.preventDefault();
      return;
    }
    if (!showEndScreen) {
      if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < packages.length) {
          collectPackage(idx);
        }
      }
    } else {
      if (e.key === 'Enter') {
        resetGame();
      }
    }
    const movement = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'];
    if (movement.includes(e.key)) {
      keys[e.key] = true;
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    const movement = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'];
    if (movement.includes(e.key)) {
      keys[e.key] = false;
      e.preventDefault();
    }
  });

  // Pointer interactions improved (same functional behavior)
  canvas.addEventListener('pointermove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    hoverIndex = -1;
    for (let i = 0; i < packages.length; i++) {
      const p = packages[i];
      if (collides(mx, my, 0, p.x, p.y, PACKAGE_RADIUS)) {
        hoverIndex = i;
        break;
      }
    }
  });

  canvas.addEventListener('pointerdown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;

    if (showEndScreen) {
      const btn = getRestartButtonRect();
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        resetGame();
        playClick();
        return;
      }
    }

    const audioBox = { x: UI_PADDING, y: HEIGHT - FOOTER_HEIGHT + 10, w: 170, h: 28 };
    if (mx >= audioBox.x && mx <= audioBox.x + audioBox.w && my >= audioBox.y && my <= audioBox.y + audioBox.h) {
      toggleAudio();
      playClick();
      return;
    }

    for (let i = 0; i < packages.length; i++) {
      const p = packages[i];
      if (collides(mx, my, 0, p.x, p.y, PACKAGE_RADIUS)) {
        collectPackage(i);
        playClick();
        return;
      }
    }
  });

  // Drawing helpers & improvements
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof stroke === 'undefined') stroke = true;
    if (typeof r === 'undefined') r = 6;
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

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let offsetY = 0;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y + offsetY);
        line = words[n] + ' ';
        offsetY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y + offsetY);
  }

  // Background: gradient sky, sun, rolling hills, subtle parallax
  function drawBackground(dt) {
    // sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    skyGrad.addColorStop(0, '#dff6ff');
    skyGrad.addColorStop(0.5, '#e8fbff');
    skyGrad.addColorStop(1, '#f5fbff');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle grain / vignette bottom
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#d0eaf6';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();

    // animated sun (upper-right)
    const t = performance.now() * 0.00015;
    const sunX = WIDTH - 80 + Math.cos(t * 1.4) * 6;
    const sunY = 72 + Math.sin(t * 1.1) * 6;
    const sunRadius = 30;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, sunRadius * 2);
    sunGrad.addColorStop(0, '#fff6d6');
    sunGrad.addColorStop(0.4, '#fff1b8');
    sunGrad.addColorStop(1, 'rgba(255,214,90,0.06)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // rolling hills - 3 layers parallax
    const baseY = HEIGHT - FOOTER_HEIGHT + 12;
    for (let layer = 0; layer < 3; layer++) {
      const offset = t * (30 + layer * 20) * (layer % 2 ? 1 : -1);
      const amplitude = 18 + layer * 12;
      const layerY = baseY + layer * 24;
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT);
      for (let x = 0; x <= WIDTH; x += 12) {
        const y = layerY + Math.sin(x * 0.008 + offset * 0.02) * amplitude;
        if (x === 0) ctx.lineTo(0, y);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.closePath();
      if (layer === 0) ctx.fillStyle = 'rgba(18,130,110,0.06)';
      if (layer === 1) ctx.fillStyle = 'rgba(24,160,140,0.04)';
      if (layer === 2) ctx.fillStyle = 'rgba(12,100,80,0.03)';
      ctx.fill();
    }

    // gentle floating clouds (soft white shapes)
    for (let i = 0; i < 4; i++) {
      const cx = (i * 220 + t * 120) % (WIDTH + 180) - 90;
      const cy = 36 + (i % 2) * 10 + Math.sin(t * 0.9 + i) * 8;
      drawCloud(cx, cy, 38, `rgba(255,255,255,0.85)`);
    }
  }

  function drawCloud(cx, cy, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx - size * 0.6, cy, size * 0.6, 0, Math.PI * 2);
    ctx.arc(cx, cy - size * 0.3, size * 0.8, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.6, cy, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Header: score and lives with polished look
  function drawHeader() {
    // Score box
    ctx.font = FONT_BASE;
    const scoreText = `Correct: ${correctCount}/${GOAL_CORRECT}`;
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreW = scoreMetrics.width + UI_PADDING * 2;
    const scoreH = 36;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, UI_PADDING, UI_PADDING, scoreW, scoreH, 8, true, true);
    ctx.fillStyle = '#023a4a';
    ctx.font = FONT_LARGE;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(scoreText, UI_PADDING + 8, UI_PADDING + scoreH / 2);

    // Lives
    const lives = MAX_WRONG - wrongCount;
    const livesText = `Lives: ${lives}`;
    ctx.font = FONT_LARGE;
    const livesW = ctx.measureText(livesText).width + UI_PADDING * 2;
    const lx = WIDTH - livesW - UI_PADDING;
    const ly = UI_PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, lx, ly, livesW, scoreH, 8, true, true);
    ctx.fillStyle = '#7a1f2a';
    ctx.fillText(livesText, lx + 8, ly + scoreH / 2);

    // Audio status in footer area (visual)
    ctx.font = FONT_BASE;
    let audioText = audioStateText;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const abx = UI_PADDING;
    const aby = HEIGHT - FOOTER_HEIGHT + 10;
    const abW = 360;
    const abH = 28;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, abx, aby, abW, abH, 6, true, true);
    ctx.fillStyle = '#193b45';
    ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(audioText, abx + 8, aby + abH / 2);
  }

  // Drone drawing: more character, gentle glow and rotating props
  function drawDrone(dt) {
    const now = performance.now() * 0.002;
    // body shadow
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.ellipse(drone.x, drone.y + DRONE_RADIUS + 8, DRONE_RADIUS * 1.25, DRONE_RADIUS * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // glow
    ctx.beginPath();
    const grad = ctx.createRadialGradient(drone.x, drone.y, DRONE_RADIUS * 0.2, drone.x, drone.y, DRONE_RADIUS * 2.2);
    grad.addColorStop(0, 'rgba(180,230,255,0.06)');
    grad.addColorStop(1, 'rgba(180,230,255,0)');
    ctx.fillStyle = grad;
    ctx.arc(drone.x, drone.y, DRONE_RADIUS * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#005a78';
    ctx.lineWidth = 3;
    ctx.arc(drone.x, drone.y, DRONE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // accents and panel lines
    ctx.beginPath();
    ctx.fillStyle = '#e9f8ff';
    ctx.ellipse(drone.x - 4, drone.y, DRONE_RADIUS * 0.9, DRONE_RADIUS * 0.5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // small screen
    ctx.beginPath();
    ctx.fillStyle = '#002f3b';
    ctx.roundRect = ctx.roundRect || function (x, y, w, h, r) {
      // fallback simple
      const r2 = r || 4;
      ctx.beginPath();
      ctx.moveTo(x + r2, y);
      ctx.arcTo(x + w, y, x + w, y + h, r2);
      ctx.arcTo(x + w, y + h, x, y + h, r2);
      ctx.arcTo(x, y + h, x, y, r2);
      ctx.arcTo(x, y, x + w, y, r2);
      ctx.closePath();
    };
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#004d5a';
    ctx.beginPath();
    ctx.rect(drone.x - 10, drone.y - 6, 20, 12);
    ctx.fill();
    ctx.restore();

    // face detail
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(drone.x - 6, drone.y - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(drone.x + 2, drone.y + 2, 8, 6);

    // propellers (blurred motion)
    for (let i = -1; i <= 1; i += 2) {
      const px = drone.x + i * (DRONE_RADIUS + 12);
      const py = drone.y - DRONE_RADIUS + 2;
      const r = 14;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(now * (i * -4.5));
      // blades as translucent strokes
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(20,30,40,0.12)';
      roundRect(ctx, -r, -4, r * 2, 8, 6, true, false);
      // central hub
      ctx.beginPath();
      ctx.fillStyle = '#002b36';
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  // Packages: richer crate art with tape, sticker and subtle shine
  function drawPackages(dt) {
    const t = performance.now() * 0.0012;
    for (let i = 0; i < packages.length; i++) {
      const p = packages[i];
      p.angle += (i + 1) * 0.001 * dt;
      const bob = Math.sin(t * (1 + i * 0.2) + i) * 6;
      const px = p.ox + Math.cos(p.angle * 0.7) * 6;
      const py = p.oy + bob;
      p.x = px;
      p.y = py;

      // shadow
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.ellipse(px, py + PACKAGE_RADIUS + 8, PACKAGE_RADIUS * 1.05, PACKAGE_RADIUS * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      // crate base
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.sin(p.angle) * 0.04);

      // crate main body
      ctx.fillStyle = p.isCorrect ? '#fffbef' : '#fff';
      ctx.strokeStyle = '#874d2c';
      ctx.lineWidth = 3;
      roundRect(ctx, -PACKAGE_RADIUS, -PACKAGE_RADIUS, PACKAGE_RADIUS * 2, PACKAGE_RADIUS * 2, 8, true, true);

      // tape
      ctx.fillStyle = 'rgba(200,150,60,0.86)';
      ctx.beginPath();
      ctx.moveTo(-PACKAGE_RADIUS, -6);
      ctx.lineTo(PACKAGE_RADIUS, -6);
      ctx.lineTo(PACKAGE_RADIUS, 6);
      ctx.lineTo(-PACKAGE_RADIUS, 6);
      ctx.closePath();
      ctx.fill();

      // sticker circle
      ctx.beginPath();
      ctx.fillStyle = p.isCorrect ? '#64d20a' : '#ffd166';
      ctx.arc(0, -10, 12, 0, Math.PI * 2);
      ctx.fill();

      // small shine on sticker
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.arc(-4, -14, 3, 0, Math.PI * 2);
      ctx.fill();

      // number text
      ctx.fillStyle = '#022a33';
      ctx.font = '20px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.value), 0, 6);

      ctx.restore();

      // hover ring
      if (hoverIndex === i) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(10,110,140,0.6)';
        ctx.lineWidth = 3;
        ctx.arc(p.x, p.y, PACKAGE_RADIUS + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // index label for keyboard access
      ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(String(i + 1), p.x + PACKAGE_RADIUS - 10, p.y - PACKAGE_RADIUS + 14);
    }
  }

  // Footer: question and instructions with clear spacing
  function drawQuestionAndInstructions() {
    ctx.font = FONT_BIGGER;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    const qText = question ? question.text : '';
    const metrics = ctx.measureText(qText);
    const boxW = Math.max(metrics.width + UI_PADDING * 4, 360);
    const bx = (WIDTH - boxW) / 2;
    const by = HEIGHT - FOOTER_HEIGHT + 10;
    const bh = 64;
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, bx, by, boxW, bh, 10, true, true);

    // Question text centered
    ctx.fillStyle = '#003844';
    ctx.font = FONT_BIGGER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(qText, WIDTH / 2, by + bh / 2 - 6);

    // Instructions below
    ctx.font = FONT_BASE;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    const instr = 'Move: Arrow Keys or WASD • Collect correct package • Quick keys: 1-4 • R to restart';
    const instrY = by + bh + 22;
    ctx.fillText(instr, WIDTH / 2, instrY);

    ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.46)';
    ctx.fillText('Touch or click a package to collect it. Press Space to toggle audio.', WIDTH / 2, instrY + 18);
  }

  // End screen: maintain win/lose content but prettier
  function drawEndScreen() {
    if (!showEndScreen) return;
    ctx.fillStyle = 'rgba(6,18,28,0.65)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const panelW = 520;
    const panelH = 260;
    const px = (WIDTH - panelW) / 2;
    const py = (HEIGHT - panelH) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, px, py, panelW, panelH, 12, true, true);

    ctx.font = FONT_BIGGER;
    ctx.fillStyle = '#012433';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const title = endState === 'win' ? 'Victory! Drone Delivered!' : 'Game Over — Try Again';
    ctx.fillText(title, WIDTH / 2, py + 22);

    ctx.font = FONT_BASE;
    ctx.fillStyle = '#004a5a';
    const sub =
      endState === 'win'
        ? `You collected ${correctCount} correct packages!`
        : `You made ${wrongCount} mistakes. You collected ${correctCount} correct packages.`;
    wrapText(ctx, sub, WIDTH / 2, py + 72, panelW - 60, 20);

    const btn = getRestartButtonRect();
    ctx.fillStyle = '#e8fbff';
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8, true, true);
    ctx.fillStyle = '#004466';
    ctx.font = FONT_LARGE;
    ctx.fillText('Restart (R)', btn.x + btn.w / 2, btn.y + 10);

    ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#303030';
    ctx.fillText('Tip: use 1-4 keys to quickly collect matching packages.', WIDTH / 2, btn.y + btn.h + 12);
  }

  function getRestartButtonRect() {
    const btnW = 180;
    const btnH = 48;
    const bx = (WIDTH - btnW) / 2;
    const by = HEIGHT / 2 + 30;
    return { x: bx, y: by, w: btnW, h: btnH };
  }

  // Update loop - keep game mechanics identical
  function update(dt) {
    if (showEndScreen) {
      // slight floating drone while paused
      drone.x = drone.x + Math.sin(performance.now() * 0.001) * 0.02;
      updateParticles(dt);
      return;
    }
    // Movement
    let moveX = 0,
      moveY = 0;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) moveX -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) moveX += 1;
    if (keys['ArrowUp'] || keys['w'] || keys['W']) moveY -= 1;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) moveY += 1;

    const len = Math.hypot(moveX, moveY) || 1;
    drone.vx = (moveX / len) * drone.speed;
    drone.vy = (moveY / len) * drone.speed;

    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;

    drone.x = clamp(drone.x, DRONE_RADIUS + UI_PADDING, WIDTH - DRONE_RADIUS - UI_PADDING);
    drone.y = clamp(drone.y, HEADER_HEIGHT + DRONE_RADIUS, HEIGHT - FOOTER_HEIGHT - DRONE_RADIUS);

    // Check collision with packages
    for (let i = 0; i < packages.length; i++) {
      const p = packages[i];
      if (collides(drone.x, drone.y, DRONE_RADIUS - 6, p.x, p.y, PACKAGE_RADIUS - 6)) {
        collectPackage(i);
        break;
      }
    }

    // particles update
    updateParticles(dt);
  }

  // Render loop
  function render(now) {
    const tNow = performance.now();
    const dtMs = tNow - lastTime;
    const dt = Math.min(dtMs / 1000, 0.05);
    lastTime = tNow;

    update(dt);

    // clear & draw
    drawBackground(dtMs);
    drawHeader();
    drawPackages(dtMs);
    drawParticles();
    drawDrone(dtMs);
    drawQuestionAndInstructions();

    if (showEndScreen) drawEndScreen();

    if (running) requestAnimationFrame(render);
  }

  // Start audio safely
  try {
    initAudio();
  } catch (e) {
    console.warn('Audio initialization failed:', e);
  }

  // Start game
  resetGame();
  requestAnimationFrame(render);

  // Expose stop for debugging
  container.stopGame = function () {
    running = false;
  };

  // Accessibility focus handling
  canvas.setAttribute('tabindex', '0');
  canvas.addEventListener('focus', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  });

  // Global error handling
  window.addEventListener('error', (e) => {
    console.error('Runtime error in Drone Math Collector:', e.error || e.message);
  });
})();