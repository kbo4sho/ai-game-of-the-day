(function () {
  // Drone Math Dash - Visual & Audio Enhancements Only
  // The game mechanics and math logic are preserved.
  // This file improves visuals (colors, subtle animations, particles) and audio (WebAudio pad, better SFX).
  // All drawing uses canvas API and all sounds are generated via Web Audio API.
  // Canvas is exactly 720x480 and rendered inside element with id 'game-of-the-day-stage'.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_SCORE = 10;
  const MAX_LIVES = 3;
  const MIN_BODY_TEXT = 14;
  const IMPORTANT_TEXT = 20;

  // Find container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Create hidden live region for screen readers (accessible text alternatives)
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('role', 'status');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.top = 'auto';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  container.appendChild(liveRegion);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // allow keyboard focus
  canvas.style.outline = 'none';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Dash. Use arrow keys to fly the drone. Collect the correct numbers.'
  );
  container.style.position = 'relative';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('2D context not available.');
    return;
  }

  // Audio setup with error handling
  let audioCtx = null;
  let audioEnabled = true;
  let backgroundGain = null;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
      // Start suspended; resume on user gesture
      audioCtx.suspend().catch(() => {});
      backgroundGain = audioCtx.createGain();
      backgroundGain.gain.value = 0.03; // gentle background
      backgroundGain.connect(audioCtx.destination);
    } else {
      audioEnabled = false;
    }
  } catch (e) {
    console.warn('Web Audio API not available or failed to initialize:', e);
    audioEnabled = false;
    audioCtx = null;
  }

  // Background pad elements
  let bgPad = {
    oscA: null,
    oscB: null,
    lfo: null,
    filter: null,
    panner: null,
    gain: null,
    active: false
  };

  // Safe oscillator create helper
  function safeCreateOsc(type = 'sine') {
    if (!audioCtx) return null;
    try {
      const o = audioCtx.createOscillator();
      o.type = type;
      return o;
    } catch (e) {
      console.warn('Failed create oscillator:', e);
      return null;
    }
  }

  // Start gentle ambient background sound (two-osc pad + slow filter)
  function startBackgroundSound() {
    if (!audioEnabled || !audioCtx || bgPad.active) return;
    try {
      // create nodes
      const oscA = safeCreateOsc('sine');
      const oscB = safeCreateOsc('sawtooth');
      if (!oscA || !oscB) return;

      const g = audioCtx.createGain();
      g.gain.value = 0.0001;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;

      const panner = (audioCtx.createStereoPanner && audioCtx.createStereoPanner()) || null;
      if (panner) panner.pan.value = -0.15;

      // slow LFO for filter and gain
      const lfo = safeCreateOsc('sine');
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 180; // modulates filter frequency

      // connect nodes
      oscA.frequency.value = 160;
      oscB.frequency.value = 220;
      oscB.detune.value = 12;
      oscA.connect(g);
      oscB.connect(g);
      g.connect(filter);
      if (panner) {
        filter.connect(panner);
        panner.connect(backgroundGain);
      } else {
        filter.connect(backgroundGain);
      }

      // lfo -> filter frequency & slow amplitude tremolo
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // gentle gain envelope fade-in
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.035, audioCtx.currentTime + 2);

      // start
      oscA.start();
      oscB.start();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05;
      lfo.start();

      // store
      bgPad = {
        oscA,
        oscB,
        lfo,
        lfoGain,
        filter,
        panner,
        gain: g,
        active: true
      };
    } catch (e) {
      console.warn('startBackgroundSound failed:', e);
      bgPad.active = false;
    }
  }

  function stopBackgroundSound() {
    if (!bgPad.active) return;
    try {
      // fade out then stop
      const now = audioCtx.currentTime;
      if (bgPad.gain) {
        bgPad.gain.gain.cancelScheduledValues(now);
        bgPad.gain.gain.setValueAtTime(bgPad.gain.gain.value || 0.03, now);
        bgPad.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      }
      if (bgPad.oscA) {
        bgPad.oscA.stop(now + 0.6);
        bgPad.oscA.disconnect();
      }
      if (bgPad.oscB) {
        bgPad.oscB.stop(now + 0.6);
        bgPad.oscB.disconnect();
      }
      if (bgPad.lfo) {
        bgPad.lfo.stop(now + 0.6);
        bgPad.lfo.disconnect();
      }
      if (bgPad.lfoGain) bgPad.lfoGain.disconnect();
      if (bgPad.filter) bgPad.filter.disconnect();
      if (bgPad.panner) bgPad.panner.disconnect();
    } catch (e) {
      console.warn('stopBackgroundSound failed:', e);
    }
    bgPad = { active: false };
  }

  // Rich SFX helpers using WebAudio
  function playSfx(options = {}) {
    // options: freq, type, duration, volume, attack, release, filterFreq, pan
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = safeCreateOsc(options.type || 'sine');
      if (!o) return;
      const g = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type = options.filterType || 'lowpass';
      filter.frequency.value = options.filterFreq || 1200;

      const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
      if (panner && typeof options.pan === 'number') panner.pan.value = options.pan;

      // Connect chain: osc -> filter -> gain -> (panner) -> destination
      o.connect(filter);
      filter.connect(g);
      if (panner) {
        g.connect(panner);
        panner.connect(audioCtx.destination);
      } else {
        g.connect(audioCtx.destination);
      }

      // basic envelope
      const attack = options.attack || 0.01;
      const release = options.release || Math.max(0.05, (options.duration || 0.12) - 0.02);
      const sustain = options.sustain || 0.0001;
      const maxGain = options.volume || 0.08;

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(maxGain, now + attack);
      g.gain.exponentialRampToValueAtTime(sustain, now + (options.duration || 0.12));
      g.gain.exponentialRampToValueAtTime(0.0001, now + (options.duration || 0.12) + release);

      if (options.freq) {
        o.frequency.setValueAtTime(options.freq, now);
      } else if (options.freqStart && options.freqEnd) {
        o.frequency.setValueAtTime(options.freqStart, now);
        o.frequency.exponentialRampToValueAtTime(options.freqEnd, now + (options.duration || 0.12));
      }

      o.start(now);
      o.stop(now + (options.duration || 0.12) + release + 0.02);
    } catch (err) {
      console.warn('playSfx error', err);
    }
  }

  // Simple melody helper for victory
  function playMelody(seq = []) {
    if (!audioEnabled || !audioCtx) return;
    let t = audioCtx.currentTime + 0.03;
    seq.forEach((note) => {
      playSfx({
        type: note.type || 'triangle',
        freq: note.freq,
        duration: note.dur,
        volume: note.vol || 0.06,
        attack: 0.005,
        release: 0.06,
        filterFreq: note.filter || 1200,
        pan: note.pan || 0
      });
      t += (note.dur || 0.12) * 0.9;
    });
  }

  // Old compatibility playTone preserved but improved envelopes and optional spatial panning
  function playTone(type = 'sine', freq = 440, duration = 0.12, volume = 0.08, pan = 0) {
    playSfx({
      type,
      freq,
      duration,
      volume,
      pan,
      attack: 0.008,
      release: 0.04,
      filterFreq: 6000
    });
  }

  // Particles for visual feedback
  const particles = []; // {x,y,vx,vy,size,life,color}

  function spawnParticles(x, y, color = '#fff', count = 18, spread = 36) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 2.4;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        size: 2 + Math.random() * 4,
        life: 50 + Math.random() * 30,
        maxLife: 80 + Math.random() * 20,
        color: color,
        alpha: 1 - Math.random() * 0.2
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt * 0.12;
      p.vy += 0.04; // gravity
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.alpha = Math.max(0, p.life / p.maxLife);
      p.size *= 0.995;
      if (p.life <= 0 || p.size < 0.3) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  // Game State
  let score = 0;
  let lives = MAX_LIVES;
  let gameState = 'playing'; // 'playing', 'victory', 'gameover', 'intro'
  let drone = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: 26,
    angle: 0
  };

  // Packages (answer options)
  let packages = []; // {x,y,w,h,value,id}
  let currentQuestion = null;
  let keysDown = {};
  let lastTime = performance.now();

  // UI Layout positions for no overlap
  const padding = 12; // at least 10px required
  const scorePos = { x: padding, y: padding }; // top-left
  const livesPos = { x: WIDTH - padding, y: padding }; // top-right anchor
  const instructionsPos = { x: WIDTH / 2, y: HEIGHT - padding }; // bottom-center

  // Draw helpers
  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
    ctx.fill();
  }

  // Ensure text fits; draw background rectangle using measureText
  function drawTextBox(text, x, y, options = {}) {
    // options: align ('left','center','right'), font, textColor, bgColor, padding, lineHeight, maxWidth
    const font = options.font || `${MIN_BODY_TEXT}px sans-serif`;
    const textColor = options.textColor || '#111';
    const bgColor = options.bgColor || 'rgba(255,255,255,0.7)';
    const pad = options.padding || 10;
    const align = options.align || 'left';
    const lineHeight = options.lineHeight || MIN_BODY_TEXT * 1.3;
    ctx.font = font;
    const lines = String(text).split('\n');
    let maxW = 0;
    for (let line of lines) {
      const m = ctx.measureText(line).width;
      if (m > maxW) maxW = m;
    }
    const boxW = maxW + pad * 2;
    const boxH = lines.length * lineHeight + pad * 2;
    let bx = x;
    if (align === 'center') bx = x - boxW / 2;
    if (align === 'right') bx = x - boxW;
    const by = y - boxH;
    // background
    ctx.fillStyle = bgColor;
    drawRoundedRect(bx, by, boxW, boxH, 8);
    // subtle inner border
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // text
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    let ty = by + pad;
    ctx.font = font;
    for (let line of lines) {
      ctx.fillText(line, bx + pad, ty);
      ty += lineHeight;
    }
    return { x: bx, y: by, w: boxW, h: boxH };
  }

  // Generate math question appropriate for ages 7-9: addition/subtraction within 20
  function generateQuestion() {
    const max = 20;
    const op = Math.random() < 0.6 ? '+' : '-';
    let a = Math.floor(Math.random() * (max + 1));
    let b = Math.floor(Math.random() * (max + 1));
    if (op === '-') {
      if (a < b) [a, b] = [b, a];
    }
    const correct = op === '+' ? a + b : a - b;
    let options = new Set();
    options.add(correct);
    while (options.size < 4) {
      // generate distractors close to correct
      let delta = Math.floor(Math.random() * 7) - 3; // -3..3
      let val = correct + delta;
      if (val < 0) val = Math.abs(val) + 1;
      options.add(val);
    }
    const arr = Array.from(options);
    // shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // create package positions avoiding UI areas (top 60px and bottom 60px)
    packages = [];
    const paddingSide = 40;
    const topLimit = 80;
    const bottomLimit = HEIGHT - 120;
    const boxW = 92;
    const boxH = 60;
    for (let i = 0; i < arr.length; i++) {
      let tries = 0;
      let px, py;
      do {
        px = paddingSide + Math.random() * (WIDTH - paddingSide * 2 - boxW);
        py = topLimit + Math.random() * (bottomLimit - topLimit - boxH);
        tries++;
      } while (overlapsUI(px, py, boxW, boxH) && tries < 30);
      packages.push({
        id: i,
        x: px,
        y: py,
        baseY: py,
        w: boxW,
        h: boxH,
        value: arr[i],
        bobPhase: Math.random() * Math.PI * 2
      });
    }
    currentQuestion = {
      a,
      b,
      op,
      correct
    };
    updateLiveRegion();
  }

  // Check if a rectangle overlaps reserved UI areas
  function overlapsUI(x, y, w, h) {
    // Avoid top-left score and top-right lives areas and bottom instructions
    // reserve top area 60px and bottom area 70px central
    if (y < 90) return true;
    if (y + h > HEIGHT - 110) return true;
    // avoid center top-right lives area: rightmost 200px at top
    if (y < 80 && x + w > WIDTH - 160) return true;
    return false;
  }

  // Start or reset game
  function resetGame() {
    score = 0;
    lives = MAX_LIVES;
    drone.x = WIDTH / 2;
    drone.y = HEIGHT / 2;
    drone.vx = 0;
    drone.vy = 0;
    gameState = 'playing';
    generateQuestion();
    // Ensure audio context resumed on first reset if enabled
    if (audioCtx) {
      audioCtx
        .resume()
        .then(() => {
          if (audioEnabled) startBackgroundSound();
        })
        .catch(() => {});
    }
    lastTime = performance.now();
    updateLiveRegion();
  }

  // Update live region textual info
  function updateLiveRegion() {
    if (!currentQuestion) return;
    const q = currentQuestion;
    const text = `Question: ${q.a} ${q.op} ${q.b} equals ?. Score ${score}. Lives ${lives}.`;
    liveRegion.textContent = text;
    // Also update canvas aria-label
    canvas.setAttribute(
      'aria-label',
      `Question: ${q.a} ${q.op} ${q.b}. Score ${score}. Lives ${lives}. Use arrow keys to fly. Press number keys 1 to 4 to choose packages.`
    );
  }

  // Input handlers
  canvas.addEventListener('keydown', (e) => {
    if (gameState === 'victory' || gameState === 'gameover') {
      if (e.key === 'Enter' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetGame();
      }
      return;
    }
    keysDown[e.key] = true;
    // Number keys 1-4 to select package
    if (e.key >= '1' && e.key <= '4') {
      const idx = parseInt(e.key, 10) - 1;
      if (packages[idx]) {
        handlePackageSelection(packages[idx]);
      }
    }
    // Toggle audio with 'm'
    if (e.key === 'm' || e.key === 'M') {
      toggleAudio();
    }
  });

  canvas.addEventListener('keyup', (e) => {
    delete keysDown[e.key];
  });

  // Mouse/touch interaction
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // if click on audio icon area (we will draw small icon at center-top)
    const audioIconBounds = getAudioIconBounds();
    if (pointInRect(mx, my, audioIconBounds)) {
      toggleAudio();
      return;
    }

    // if game over/victory restart button click
    if (gameState === 'victory' || gameState === 'gameover') {
      const restartBounds = getRestartButtonBounds();
      if (pointInRect(mx, my, restartBounds)) {
        resetGame();
        return;
      }
    }

    // Otherwise check if clicking on a package
    for (const p of packages) {
      if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
        handlePackageSelection(p);
        return;
      }
    }

    // Clicking elsewhere moves drone toward that point (small nudge)
    const dx = mx - drone.x;
    const dy = my - drone.y;
    const mag = Math.hypot(dx, dy) || 1;
    drone.vx += (dx / mag) * 0.8;
    drone.vy += (dy / mag) * 0.8;

    // Ensure audioContext resumed on user gesture if suspended
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx
        .resume()
        .then(() => {
          if (audioEnabled) startBackgroundSound();
        })
        .catch(() => {});
    }
  });

  // Touch support: translate touch to click
  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const mx = t.clientX - rect.left;
        const my = t.clientY - rect.top;
        // emulate click
        const evt = new MouseEvent('click', {
          clientX: t.clientX,
          clientY: t.clientY,
          bubbles: true,
          cancelable: true
        });
        canvas.dispatchEvent(evt);
      }
      e.preventDefault();
    },
    { passive: false }
  );

  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // Visual & audio feedback in selection
  function handlePackageSelection(p) {
    if (gameState !== 'playing') return;
    if (!currentQuestion) return;
    // collision check: if drone near package enforce physical collision only
    // But allow selection by click/keyboard regardless of distance
    if (p.value === currentQuestion.correct) {
      score++;
      // rich correct sound
      playSfx({
        type: 'sine',
        freq: 880,
        duration: 0.14,
        volume: 0.12,
        attack: 0.004,
        release: 0.06,
        filterFreq: 2000,
        pan: (p.x - WIDTH / 2) / WIDTH
      });
      setTimeout(
        () =>
          playSfx({
            type: 'triangle',
            freq: 1100,
            duration: 0.08,
            volume: 0.06,
            attack: 0.003,
            release: 0.04,
            filterFreq: 2500
          }),
        60
      );
      // visual burst
      spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#6df5b4', 26);
      // small glow on drone when correct
      drone._flash = { color: '#6df5b4', life: 22 };

      if (score >= TARGET_SCORE) {
        gameState = 'victory';
        stopBackgroundSound();
        // celebratory melody
        playMelody([
          { freq: 880, dur: 0.12, vol: 0.08 },
          { freq: 1100, dur: 0.12, vol: 0.08 },
          { freq: 1320, dur: 0.18, vol: 0.10 }
        ]);
        updateLiveRegion();
        return;
      }
      generateQuestion();
    } else {
      lives--;
      // wrong buzzer with low filter and short rattle
      playSfx({
        type: 'sawtooth',
        freq: 200,
        duration: 0.22,
        volume: 0.12,
        attack: 0.005,
        release: 0.08,
        filterFreq: 600
      });
      playSfx({
        type: 'square',
        freq: 160,
        duration: 0.12,
        volume: 0.06,
        attack: 0.003,
        release: 0.04,
        filterFreq: 700,
        pan: 0.2
      });
      // red particle burst
      spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#ff8a8a', 18);
      drone._flash = { color: '#ff8a8a', life: 26 };
      if (lives <= 0) {
        gameState = 'gameover';
        stopBackgroundSound();
        // low defeat tone
        playSfx({
          type: 'sine',
          freq: 110,
          duration: 0.6,
          volume: 0.08,
          attack: 0.01,
          release: 0.2,
          filterFreq: 500
        });
        updateLiveRegion();
        return;
      }
      // Slight penalty: reposition wrong package off-screen and animate it away
      p.x = Math.random() * (WIDTH - p.w);
      p.y = HEIGHT - 120;
      p.baseY = p.y;
    }
    updateLiveRegion();
  }

  // Audio toggle and visual cue
  let audioIconState = { x: WIDTH / 2 - 16, y: 8, w: 32, h: 32 };
  function getAudioIconBounds() {
    return audioIconState;
  }
  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (!audioEnabled) {
      stopBackgroundSound();
      if (audioCtx) audioCtx.suspend().catch(() => {});
    } else {
      if (audioCtx) {
        audioCtx
          .resume()
          .then(() => {
            startBackgroundSound();
          })
          .catch(() => {});
      }
    }
  }

  // Restart button bounds on end screens
  function getRestartButtonBounds() {
    // center rectangle
    const w = 220,
      h = 50;
    const x = WIDTH / 2 - w / 2;
    const y = HEIGHT / 2 + 40;
    return { x, y, w, h };
  }

  // Game update loop
  function update(dt) {
    // dt is roughly milliseconds; keep movement similar to original
    if (gameState === 'playing') {
      // Movement controls
      const accel = 0.15;
      if (keysDown['ArrowLeft'] || keysDown['a'] || keysDown['A']) drone.vx -= accel;
      if (keysDown['ArrowRight'] || keysDown['d'] || keysDown['D']) drone.vx += accel;
      if (keysDown['ArrowUp'] || keysDown['w'] || keysDown['W']) drone.vy -= accel;
      if (keysDown['ArrowDown'] || keysDown['s'] || keysDown['S']) drone.vy += accel;

      // Gentle drag
      drone.vx *= 0.95;
      drone.vy *= 0.95;

      drone.x += drone.vx * dt * 0.06;
      drone.y += drone.vy * dt * 0.06;

      // keep in bounds
      drone.x = Math.max(drone.radius, Math.min(WIDTH - drone.radius, drone.x));
      drone.y = Math.max(drone.radius + 30, Math.min(HEIGHT - drone.radius - 60, drone.y));

      // rotate propellers
      drone.angle += 0.15 + Math.hypot(drone.vx, drone.vy) * 0.02;

      // collisions with packages: automatic pickup if drone overlaps package
      for (const p of packages) {
        const pxCenter = p.x + p.w / 2;
        const pyCenter = p.y + p.h / 2;
        const dist = Math.hypot(pxCenter - drone.x, pyCenter - drone.y);
        if (dist < drone.radius + Math.max(p.w, p.h) * 0.45) {
          handlePackageSelection(p);
        }
      }
    }

    // Update particles regardless of game state for effect
    updateParticles(dt);

    // update package bobbing animation
    for (const p of packages) {
      p.bobPhase += dt * 0.008;
      p.y = p.baseY + Math.sin(p.bobPhase) * 6;
    }

    // drone flash fade
    if (drone._flash) {
      drone._flash.life -= dt * 0.06;
      if (drone._flash.life <= 0) drone._flash = null;
    }
  }

  // Draw background with calming sky, animated clouds, gentle parallax and soft ground
  function drawBackground(now = Date.now()) {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#cfeffd');
    g.addColorStop(0.45, '#eafaff');
    g.addColorStop(1, '#f7fffb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Distant star-like soft speckles (subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 8; i++) {
      const sx = (i * 97 + (now / 600) % 50) % WIDTH;
      const sy = 20 + (i % 3) * 18;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 2.6, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Animated clouds (parallax)
    for (let i = 0; i < 6; i++) {
      const speed = 0.02 + (i % 3) * 0.01;
      const cx = (now / 10) * speed + i * 140;
      drawCloud((cx % (WIDTH + 200)) - 100, 50 + (i % 2) * 28, 80 + (i % 3) * 22, 28);
    }

    // Soft rolling hills
    ctx.fillStyle = '#daf7e8';
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 120);
    ctx.quadraticCurveTo(WIDTH * 0.2, HEIGHT - 60, WIDTH * 0.5, HEIGHT - 100);
    ctx.quadraticCurveTo(WIDTH * 0.75, HEIGHT - 140, WIDTH, HEIGHT - 100);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Toward foreground: landing pad with subtle texture
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT - 80);
    ctx.fillStyle = '#f8f4e6';
    ctx.beginPath();
    ctx.ellipse(0, 10, WIDTH * 0.38, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Small decorative floor marks
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let i = 0; i < 12; i++) {
      const x = (i * 64 + (now / 300) % 40) % WIDTH;
      const y = HEIGHT - 70 + Math.sin(now / 600 + i) * 6;
      ctx.beginPath();
      ctx.ellipse(x, y, 34, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCloud(x, y, w, h) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(x - w * 0.35, y, w * 0.46, h, 0, 0, Math.PI * 2);
    ctx.ellipse(x, y - h * 0.18, w * 0.58, h * 1.04, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.4, y + h * 0.06, w * 0.42, h * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
    // thin soft shadow under cloud
    ctx.fillStyle = 'rgba(0,0,0,0.02)';
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.7, w * 0.5, h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw the drone (enhanced with soft glow and rotor trails)
  function drawDrone() {
    const d = drone;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + d.radius * 0.9, d.radius * 1.2, d.radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // subtle glow when flash present
    if (drone._flash) {
      ctx.beginPath();
      ctx.fillStyle = `${drone._flash.color}`;
      ctx.globalAlpha = Math.max(0.08, (drone._flash.life / 30) * 0.4);
      ctx.arc(d.x, d.y, d.radius + 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // slight motion trail for rotors
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(Math.sin(d.angle / 6) * 0.05);

    // Landing platform / skid soft shadow
    ctx.fillStyle = '#f3e2c4';
    ctx.beginPath();
    ctx.ellipse(0, 10, 36, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // main hull
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.quadraticCurveTo(0, -36, 28, 0);
    ctx.quadraticCurveTo(0, 30, -28, 0);
    ctx.closePath();
    ctx.fill();

    // face/window with glossy highlight
    ctx.fillStyle = '#4cc9f0';
    ctx.beginPath();
    ctx.ellipse(2, -2, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-2, -8, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // little smile
    ctx.strokeStyle = '#036';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.quadraticCurveTo(2, 10, 12, 4);
    ctx.stroke();

    // rotor arms and spinning blades with motion blur arcs
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * 34, -18);
      ctx.rotate(d.angle * (1 + i * 0.12));
      // rotor blur arcs
      ctx.fillStyle = 'rgba(50,50,50,0.12)';
      ctx.beginPath();
      ctx.ellipse(0, -4, 32, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // blades (three subtle)
      ctx.fillStyle = 'rgba(50,50,50,0.6)';
      for (let b = 0; b < 3; b++) {
        ctx.beginPath();
        ctx.ellipse(0, -12 - b * 8, 8, 24, Math.PI * 0.08 * b, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // landing gear
    ctx.strokeStyle = '#7a4f3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, 26);
    ctx.lineTo(-10, 40);
    ctx.moveTo(18, 26);
    ctx.lineTo(10, 40);
    ctx.stroke();

    ctx.restore();
  }

  // Draw packages with parachutes and numbers with slight shine
  function drawPackages(now = Date.now()) {
    for (let i = 0; i < packages.length; i++) {
      const p = packages[i];
      // parachute (with soft gradient)
      const parachuteX = p.x + p.w / 2;
      const parachuteY = p.y;
      const parachuteW = 36;
      ctx.beginPath();
      const grad = ctx.createLinearGradient(
        parachuteX - parachuteW,
        parachuteY - 20,
        parachuteX + parachuteW,
        parachuteY + 10
      );
      grad.addColorStop(0, '#ffb4d6');
      grad.addColorStop(1, '#ffd6e8');
      ctx.fillStyle = grad;
      ctx.moveTo(parachuteX - 20, parachuteY);
      ctx.quadraticCurveTo(
        parachuteX,
        parachuteY - 28 + (i % 2) * 6,
        parachuteX + 20,
        parachuteY
      );
      ctx.lineTo(parachuteX + 28, parachuteY + 8);
      ctx.quadraticCurveTo(parachuteX, parachuteY - 6, parachuteX - 28, parachuteY + 8);
      ctx.closePath();
      ctx.fill();

      // ropes
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x + 8, p.y + 6);
      ctx.lineTo(p.x + 8, p.y + p.h * 0.45);
      ctx.moveTo(p.x + p.w - 8, p.y + 6);
      ctx.lineTo(p.x + p.w - 8, p.y + p.h * 0.45);
      ctx.stroke();

      // box base with slight gradient and border
      ctx.fillStyle = '#fffef0';
      ctx.strokeStyle = '#e0cda6';
      ctx.lineWidth = 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      drawRoundedRect(p.x, p.y + p.h * 0.2, p.w, p.h * 0.8, 8);
      ctx.restore();
      ctx.stroke();

      // number text with subtle shadow
      ctx.fillStyle = '#333';
      ctx.font = `${IMPORTANT_TEXT}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(p.value.toString(), p.x + p.w / 2, p.y + p.h * 0.6);
      // small index hint
      ctx.font = `${MIN_BODY_TEXT}px sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.textBaseline = 'top';
      ctx.fillText((i + 1).toString(), p.x + p.w - 18, p.y + p.h * 0.05);

      // subtle floating highlight
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(p.x + 16, p.y + p.h * 0.35, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw UI elements: score top-left, lives top-right, instructions bottom-center
  function drawUI() {
    // Score
    ctx.font = `${MIN_BODY_TEXT}px sans-serif`;
    const scoreText = `Score: ${score}/${TARGET_SCORE}`;
    const scoreBox = drawTextBox(scoreText, scorePos.x, scorePos.y + 28, {
      align: 'left',
      font: `${MIN_BODY_TEXT}px sans-serif`,
      textColor: '#023',
      bgColor: 'rgba(255,255,255,0.92)',
      padding: 10,
      lineHeight: MIN_BODY_TEXT * 1.4
    });

    // Lives (top-right)
    ctx.font = `${MIN_BODY_TEXT}px sans-serif`;
    const livesText = `Lives: ${lives}`;
    const livesBox = drawTextBox(livesText, livesPos.x, livesPos.y + 28, {
      align: 'right',
      font: `${MIN_BODY_TEXT}px sans-serif`,
      textColor: '#800',
      bgColor: 'rgba(255,255,255,0.92)',
      padding: 10,
      lineHeight: MIN_BODY_TEXT * 1.4
    });

    // Audio icon center-top with visual cue for muted/unmuted and subtle pulse when muted
    const icon = getAudioIconBounds();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    drawRoundedRect(icon.x, icon.y, icon.w, icon.h, 8);
    ctx.fillStyle = '#333';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // use emoji-like glyphs for clarity; fallback to simple text if fonts vary
    ctx.fillText(audioEnabled ? '🔊' : '🔈', icon.x + icon.w / 2, icon.y + icon.h / 2);
    if (!audioEnabled) {
      // faint red ring when muted
      ctx.strokeStyle = 'rgba(255,80,80,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Instructions bottom-center; ensure it doesn't overlap packages or other UI
    ctx.font = `${MIN_BODY_TEXT}px sans-serif`;
    const instrLines = [
      `Fly with arrows or WASD. Click or press 1-4 to collect an answer.`,
      `Goal: collect ${TARGET_SCORE} correct packages. Wrong answers: ${MAX_LIVES} lives total.`,
      `Press M to toggle sound. Click the speaker to toggle sound.`
    ];
    const instrText = instrLines.join('\n');
    drawTextBox(instrText, instructionsPos.x, instructionsPos.y, {
      align: 'center',
      font: `${MIN_BODY_TEXT}px sans-serif`,
      textColor: '#063',
      bgColor: 'rgba(255,255,255,0.92)',
      padding: 12,
      lineHeight: MIN_BODY_TEXT * 1.5
    });

    // Current question center-top (below audio icon)
    if (currentQuestion) {
      const qText = `Q: ${currentQuestion.a} ${currentQuestion.op} ${currentQuestion.b} = ?`;
      drawTextBox(qText, WIDTH / 2, 80, {
        align: 'center',
        font: `${IMPORTANT_TEXT}px sans-serif`,
        textColor: '#012',
        bgColor: 'rgba(255,255,255,0.96)',
        padding: 12,
        lineHeight: IMPORTANT_TEXT * 1.4
      });
    }

    // Draw small legend for number keys left-aligned under score
    const legend = `Use keys 1-4 to pick packages`;
    drawTextBox(legend, scoreBox.x, scoreBox.y + scoreBox.h + 10 + 28, {
      align: 'left',
      font: `${MIN_BODY_TEXT}px sans-serif`,
      textColor: '#333',
      bgColor: 'rgba(255,255,255,0.86)',
      padding: 8,
      lineHeight: MIN_BODY_TEXT * 1.3
    });
  }

  // End screens: Victory or Game Over
  function drawEndScreen() {
    // overlay soft vignetting
    ctx.fillStyle = 'rgba(6,10,14,0.42)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // central card
    const title = gameState === 'victory' ? 'You did it! Drone Master!' : 'Game Over';
    const subtitle =
      gameState === 'victory'
        ? `You collected ${TARGET_SCORE} correct packages!`
        : `You ran out of lives. Score: ${score}`;

    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    const cardW = WIDTH * 0.72;
    const cardH = 220;
    const cardX = WIDTH / 2 - cardW / 2;
    const cardY = HEIGHT / 2 - cardH / 2 - 10;
    drawRoundedRect(cardX, cardY, cardW, cardH, 12);

    // Title
    ctx.fillStyle = '#083';
    ctx.font = `${IMPORTANT_TEXT + 4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(title, WIDTH / 2, cardY + 20);

    // Subtitle
    ctx.fillStyle = '#034';
    ctx.font = `${MIN_BODY_TEXT + 4}px sans-serif`;
    ctx.fillText(subtitle, WIDTH / 2, cardY + 20 + 44);

    // Restart button
    const rb = getRestartButtonBounds();
    ctx.fillStyle = '#ffdd57';
    drawRoundedRect(rb.x, rb.y, rb.w, rb.h, 10);
    ctx.fillStyle = '#333';
    ctx.font = `${MIN_BODY_TEXT + 4}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('Restart (Enter / R)', rb.x + rb.w / 2, rb.y + rb.h / 2);
    // small hint
    ctx.font = `${MIN_BODY_TEXT - 2}px sans-serif`;
    ctx.fillText('or click the button', rb.x + rb.w / 2, rb.y + rb.h / 2 + 26);
  }

  // Main render loop
  function render(now) {
    const dt = Math.min(60, now - lastTime);
    lastTime = now;
    update(dt);

    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw world
    drawBackground(now);
    drawPackages(now);
    drawDrone();

    // Draw particles on top of world but under UI
    drawParticles();

    // Draw UI elements
    drawUI();

    // If paused or ended, draw overlay
    if (gameState === 'victory' || gameState === 'gameover') {
      drawEndScreen();
    }

    requestAnimationFrame(render);
  }

  // Start
  resetGame();
  requestAnimationFrame(render);

  // Small periodic visual cue: audio icon subtle pulse when audio disabled
  setInterval(() => {
    // visual handled per frame; nothing extra required here.
  }, 1000);

  // Focus handling
  canvas.addEventListener('focus', () => {
    // No CSS outline; highlight via a tiny animated ring in drawUI if needed in future
  });

  // Ensure proper handling of resize (canvas fixed size, but container layout may change)
  window.addEventListener('resize', () => {
    // fixed canvas; nothing to do
  });

  // Provide a friendly debug control via global for reviewers (not required by game)
  window._droneMathDash = {
    reset: resetGame,
    toggleAudio: toggleAudio
  };
})();