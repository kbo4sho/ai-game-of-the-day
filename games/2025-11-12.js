(function () {
  // Enhanced Drone Math Game (visuals & audio improvements)
  // Renders inside element with ID 'game-of-the-day-stage'.
  // Canvas: 720x480. All visuals drawn with canvas methods.
  // Sounds generated using Web Audio API (no external files).
  // Game mechanics unchanged.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const GOAL = 10;
  const MAX_WRONG = 3;
  const TOP_PADDING = 12;
  const UI_TEXT_MIN = 14;
  const UI_IMPORTANT = 20;
  const FONT_FAMILY = 'Arial, sans-serif';

  // Container and canvas setup
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error("Game container with ID 'game-of-the-day-stage' not found.");
    return;
  }
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone math game: move the drone to the bubble with the correct answer. Arrow keys or WASD move. Press M to mute. Press Enter to restart.'
  );
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // AUDIO SETUP WITH ERROR HANDLING
  let audioContext = null;
  let audioAllowed = true;
  let masterGain = null;
  let ambientNodes = []; // holds ambient sources so we can stop/resume
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.12; // slightly higher overall; will scale per-source
    masterGain.connect(audioContext.destination);

    // Gentle layered ambient: low pad + soft bell pluck (sparse)
    // Low pad (slow detuned saws through mellow filter)
    (function createAmbientPad() {
      const oscA = audioContext.createOscillator();
      const oscB = audioContext.createOscillator();
      const detune = 8;
      oscA.type = 'sawtooth';
      oscB.type = 'sawtooth';
      oscA.frequency.value = 110;
      oscB.frequency.value = 110 * Math.pow(2, detune / 1200);
      const padGain = audioContext.createGain();
      padGain.gain.value = 0.03;
      const padFilter = audioContext.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 600;
      const padLP = audioContext.createBiquadFilter();
      padLP.type = 'lowpass';
      padLP.frequency.value = 900;
      oscA.connect(padFilter);
      oscB.connect(padFilter);
      padFilter.connect(padLP);
      padLP.connect(padGain);
      padGain.connect(masterGain);
      try {
        oscA.start();
        oscB.start();
      } catch (err) {
        // ignore if already started
      }
      ambientNodes.push({ oscA, oscB, padGain });
    })();

    // Sparse melodic marimba-like taps (very low volume) using periodic scheduling
    (function createSparsePlucks() {
      const pluckGain = audioContext.createGain();
      pluckGain.gain.value = 0.02;
      pluckGain.connect(masterGain);
      // schedule occasional plucks driven by a timer; we'll store the timer id to clear if needed
      const intervalId = setInterval(() => {
        if (!audioContext) return;
        try {
          const now = audioContext.currentTime;
          const osc = audioContext.createOscillator();
          const g = audioContext.createGain();
          const filter = audioContext.createBiquadFilter();
          osc.type = 'triangle';
          const notes = [440, 523.25, 659.25, 392]; // A4, C5, E5, G4
          const note = notes[Math.floor(Math.random() * notes.length)] * (Math.random() < 0.4 ? 0.5 : 1);
          osc.frequency.value = note;
          filter.type = 'highpass';
          filter.frequency.value = 300;
          g.gain.value = 0.0001;
          g.gain.exponentialRampToValueAtTime(0.07 + Math.random() * 0.04, now + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6 + Math.random() * 0.4);
          osc.connect(filter);
          filter.connect(g);
          g.connect(pluckGain);
          osc.start(now);
          osc.stop(now + 1.2);
        } catch (err) {
          console.warn('Pluck scheduling error', err);
        }
      }, 1600 + Math.random() * 1600);
      ambientNodes.push({ intervalId, pluckGain });
    })();
  } catch (err) {
    console.warn('Audio context could not be created or is blocked. Game will run without sound.', err);
    audioContext = null;
    audioAllowed = false;
  }

  // Play short tones with envelope for correct/wrong/click
  function playTone({ type = 'click', duration = 0.25, freq = 440, volume = 0.14 } = {}) {
    if (!audioContext || !masterGain) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      // default mapping
      if (type === 'correct') {
        // pleasant rising triad
        const freqs = [freq || 660, (freq || 660) * 1.25, (freq || 660) * 1.5];
        const nodes = freqs.map((f) => {
          const o = audioContext.createOscillator();
          const g = audioContext.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.value = 0.0001;
          o.connect(g);
          g.connect(filter);
          o.start(now);
          o.stop(now + duration + 0.05);
          // envelope
          g.gain.exponentialRampToValueAtTime(volume * 0.65, now + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
          return { o, g };
        });
        filter.type = 'lowpass';
        filter.frequency.value = 1400;
        filter.connect(masterGain);
        filter.gain = gain;
        // for correct we don't need to return nodes; they'll stop automatically
      } else if (type === 'wrong') {
        // soft thud + descending pitch
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq || 260, now);
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        gain.gain.value = 0.0001;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.frequency.exponentialRampToValueAtTime((freq || 260) * 0.6, now + duration);
        osc.start(now);
        osc.stop(now + duration + 0.05);
      } else {
        // click / UI feedback
        osc.type = 'triangle';
        osc.frequency.value = freq || 900;
        filter.type = 'highpass';
        filter.frequency.value = 400;
        gain.gain.value = 0.0001;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        gain.gain.exponentialRampToValueAtTime(volume * 0.8, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.06, duration));
        osc.start(now);
        osc.stop(now + duration + 0.05);
      }
    } catch (err) {
      console.warn('Error playing tone:', err);
    }
  }

  // Game state (mechanics unchanged)
  let state = {
    score: 0,
    wrong: 0,
    goal: GOAL,
    lives: MAX_WRONG,
    running: true,
    currentQuestion: null,
    choices: [],
    drone: {
      x: WIDTH / 2,
      y: HEIGHT / 2 + 30,
      vx: 0,
      vy: 0,
      speed: 2.4,
      radius: 18,
      rotorPhase: 0
    },
    keys: {},
    hoverIndex: -1,
    muted: !audioAllowed,
    showMessage: '',
    lastActionTime: 0,
    floating: [],
    particles: [], // visual particles for hits/misses
    gameOverReason: null
  };

  // Utilities
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Question generator (unchanged logic)
  function generateQuestion() {
    const ops = ['+', '-', '*'];
    let op = Math.random() < 0.75 ? (Math.random() < 0.5 ? '+' : '-') : '*';
    if (Math.random() < 0.05) op = '*';
    let a, b;
    if (op === '+') {
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * 20) + 1;
    } else if (op === '-') {
      a = Math.floor(Math.random() * 20) + 5;
      b = Math.floor(Math.random() * (a - 1)) + 1;
    } else {
      a = Math.floor(Math.random() * 6) + 1;
      b = Math.floor(Math.random() * 6) + 1;
    }
    const correct = op === '+' ? a + b : op === '-' ? a - b : a * b;
    const choices = new Set([correct]);
    while (choices.size < 3) {
      const variance = Math.max(1, Math.floor(Math.random() * 6));
      const sign = Math.random() < 0.5 ? -1 : 1;
      let candidate = correct + sign * variance;
      if (candidate < 0) candidate = Math.abs(candidate) + 1;
      choices.add(candidate);
    }
    const arr = Array.from(choices);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return { a, b, op, correct, choices: arr };
  }

  // Decorative floating shapes
  function initFloating() {
    state.floating = [];
    for (let i = 0; i < 10; i++) {
      state.floating.push({
        x: Math.random() * WIDTH,
        y: Math.random() * (HEIGHT * 0.6),
        radius: 14 + Math.random() * 46,
        dx: (Math.random() - 0.5) * 0.2,
        dy: (Math.random() - 0.5) * 0.08,
        hue: 180 + Math.random() * 80,
        alpha: 0.04 + Math.random() * 0.09,
        wobble: Math.random() * Math.PI * 2
      });
    }
  }

  // Layout choices (unchanged, but keep style)
  function layoutChoices(choices) {
    const regionTop = 130;
    const regionBottom = HEIGHT - 70;
    const regionLeft = 40;
    const regionRight = WIDTH - 40;
    const positions = [];
    for (const val of choices) {
      let attempts = 0;
      let placed = false;
      while (!placed && attempts < 200) {
        attempts++;
        const r = 36 + Math.random() * 12;
        const x = regionLeft + r + Math.random() * (regionRight - regionLeft - 2 * r);
        const y = regionTop + r + Math.random() * (regionBottom - regionTop - 2 * r);
        let ok = true;
        for (const p of positions) {
          const dx = p.x - x;
          const dy = p.y - y;
          if (Math.hypot(dx, dy) < p.r + r + 12) {
            ok = false;
            break;
          }
        }
        if (ok) {
          if (y < regionTop + 40) ok = false;
        }
        const dx2 = state.drone.x - x;
        const dy2 = state.drone.y - y;
        if (Math.hypot(dx2, dy2) < r + 60) ok = false;
        if (ok) {
          positions.push({ value: val, x, y, r });
          placed = true;
        }
      }
      if (!placed) {
        const r = 40;
        const x = regionLeft + r + Math.random() * (regionRight - regionLeft - 2 * r);
        const y = regionTop + r + choices.indexOf(val) * (r * 2.1);
        positions.push({ value: val, x, y, r });
      }
    }
    return positions;
  }

  // Start round & restart (preserve logic)
  function startRound() {
    state.currentQuestion = generateQuestion();
    state.choices = layoutChoices(state.currentQuestion.choices);
    state.lastActionTime = performance.now();
    state.showMessage = 'Steer the drone to the correct bubble!';
    state.particles = state.particles || [];
  }

  function restartGame() {
    state.score = 0;
    state.wrong = 0;
    state.lives = MAX_WRONG;
    state.running = true;
    state.gameOverReason = null;
    state.drone.x = WIDTH / 2;
    state.drone.y = HEIGHT / 2 + 30;
    state.drone.vx = 0;
    state.drone.vy = 0;
    state.showMessage = 'Ready? Use arrows or WASD to move.';
    startRound();
  }

  initFloating();
  startRound();

  // Input handling (preserve keys and behaviors)
  window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;

    // Mute toggle
    if (e.key.toLowerCase() === 'm') {
      state.muted = !state.muted;
      if (!state.muted && audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch((err) => console.warn('Audio resume failed:', err));
      }
      if (!state.muted) playTone({ type: 'click' });
    }

    // number keys
    if (['1', '2', '3'].includes(e.key) && state.running) {
      const idx = parseInt(e.key, 10) - 1;
      if (state.choices[idx]) {
        handleChoiceSelection(state.choices[idx]);
      }
    }

    // Enter to restart
    if (!state.running && e.key === 'Enter') {
      restartGame();
      if (!state.muted) playTone({ type: 'click' });
    }

    // space small boost
    if (e.key === ' ' && state.running) {
      state.drone.vy -= 0.6;
      if (!state.muted) playTone({ type: 'click', freq: 800, duration: 0.08, volume: 0.06 });
    }
  });

  window.addEventListener('keyup', (e) => {
    state.keys[e.key.toLowerCase()] = false;
  });

  // Pointer interactions
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (state.running) {
      for (const choice of state.choices) {
        const dx = x - choice.x;
        const dy = y - choice.y;
        if (Math.hypot(dx, dy) <= choice.r + 6) {
          handleChoiceSelection(choice);
          return;
        }
      }
    } else {
      const btn = getRestartButtonRect();
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
        restartGame();
        if (!state.muted) playTone({ type: 'click' });
      }
    }
  });

  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    state.drone.x = clamp(x, 20, WIDTH - 20);
    state.drone.y = clamp(y, 20, HEIGHT - 20);
  });

  // Handle choice selection (keep mechanics unchanged but add audiovisual feedback)
  function handleChoiceSelection(choice) {
    if (!state.running) return;
    const isCorrect = choice.value === state.currentQuestion.correct;
    if (isCorrect) {
      state.score += 1;
      state.showMessage = 'Great! Correct!';
      // particles burst gentle
      spawnParticles(choice.x, choice.y, { color: 'rgba(92,200,150,0.95)', count: 18, size: 2.5, life: 800 });
      if (!state.muted) playTone({ type: 'correct', freq: 660, duration: 0.32, volume: 0.18 });
    } else {
      state.wrong += 1;
      state.lives = Math.max(0, MAX_WRONG - state.wrong);
      state.showMessage = 'Oops — try again!';
      spawnParticles(choice.x, choice.y, { color: 'rgba(255,110,110,0.96)', count: 12, size: 3.5, life: 900 });
      if (!state.muted) playTone({ type: 'wrong', freq: 220, duration: 0.38, volume: 0.18 });
    }

    state.drone.x = choice.x - (choice.x - state.drone.x) * 0.2;
    state.drone.y = choice.y - (choice.y - state.drone.y) * 0.2;
    state.drone.vx *= 0.4;
    state.drone.vy *= 0.4;
    state.lastActionTime = performance.now();

    setTimeout(() => {
      if (state.score >= state.goal) {
        endGame('win');
        return;
      }
      if (state.lives <= 0) {
        endGame('lose');
        return;
      }
      startRound();
    }, 700);
  }

  function endGame(reason) {
    state.running = false;
    state.gameOverReason = reason;
    state.showMessage = reason === 'win' ? "You did it! Drone team wins!" : "Oh no — drone ran out of safety!";
    if (!state.muted) playTone({ type: reason === 'win' ? 'correct' : 'wrong', duration: 0.6, volume: 0.22 });
  }

  // Utility drawing helpers
  function roundRect(ctx, x, y, w, h, r = 8, fillColor = '#fff') {
    ctx.save();
    ctx.beginPath();
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.restore();
  }

  function drawTextWithBg(text, x, y, options = {}) {
    const {
      fontSize = UI_TEXT_MIN,
      fontWeight = 'normal',
      align = 'left',
      baseline = 'top',
      padding = 8,
      bgColor = 'rgba(255,255,255,0.75)',
      textColor = '#0b2d3a',
      radius = 8
    } = options;
    ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    let bx = x;
    if (align === 'center') bx = x - textWidth / 2 - padding;
    else if (align === 'right') bx = x - textWidth - padding * 2;
    const bw = textWidth + padding * 2;
    const bh = fontSize + padding;
    const by = y - (baseline === 'top' ? 0 : fontSize / 2);
    roundRect(ctx, bx, by, bw, bh, radius, bgColor);
    ctx.fillStyle = textColor;
    if (align === 'center') ctx.fillText(text, x, y);
    else if (align === 'left') ctx.fillText(text, x + padding, y);
    else if (align === 'right') ctx.fillText(text, x - padding, y);
    return { x: bx, y: by, w: bw, h: bh };
  }

  // PARTICLES for feedback
  function spawnParticles(x, y, { color = 'rgba(255,255,255,1)', count = 12, size = 3, life = 700 } = {}) {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 2.4;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 0.5,
        size: size * (0.6 + Math.random() * 1.2),
        color,
        life,
        born: now,
        wobble: Math.random() * Math.PI * 2
      });
    }
  }

  // Visual layers
  function drawBackground(dt, t) {
    // sky gradient with subtle radial sun
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, '#e8fbff');
    grad.addColorStop(0.6, '#f4fbf5');
    grad.addColorStop(1, '#f9fbff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun
    const sunX = 90 + Math.sin(t * 0.0006) * 12;
    const sunY = 60 + Math.cos(t * 0.0009) * 6;
    const sunRad = 48;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, sunRad);
    sunGrad.addColorStop(0, 'rgba(255,245,200,0.95)');
    sunGrad.addColorStop(0.7, 'rgba(255,245,200,0.25)');
    sunGrad.addColorStop(1, 'rgba(255,245,200,0.04)');
    ctx.beginPath();
    ctx.fillStyle = sunGrad;
    ctx.arc(sunX, sunY, sunRad, 0, Math.PI * 2);
    ctx.fill();

    // soft clouds (drawn with ellipses)
    for (let i = 0; i < state.floating.length; i++) {
      const f = state.floating[i];
      f.x += f.dx * dt * 0.05;
      f.y += Math.sin((t + i * 100) * 0.0003) * 0.02 + f.dy * dt * 0.02;
      f.wobble += 0.01 * (i % 3 + 1);
      if (f.x < -80) f.x = WIDTH + 80;
      if (f.x > WIDTH + 80) f.x = -80;
      if (f.y < -80) f.y = HEIGHT + 80;
      if (f.y > HEIGHT + 80) f.y = -80;

      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = `hsla(${f.hue},60%,75%,${f.alpha})`;
      ctx.ellipse(f.x + Math.sin(f.wobble) * 6, f.y + Math.cos(f.wobble) * 4, f.radius * 1.8, f.radius, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // gentle ground shapes for depth
    ctx.beginPath();
    ctx.fillStyle = 'rgba(210, 255, 235, 0.6)';
    ctx.ellipse(WIDTH * 0.22, HEIGHT + 24, 380, 120, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(235, 249, 255, 0.5)';
    ctx.ellipse(WIDTH * 0.75, HEIGHT + 10, 320, 90, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Drone drawing with enhanced visuals & subtle bobbing
  function drawDrone(dt, t) {
    const d = state.drone;
    d.rotorPhase += 0.16 + Math.hypot(d.vx, d.vy) * 0.03;
    // slight bobbing
    const bob = Math.sin(t * 0.002 + (d.x + d.y) * 0.001) * 2;

    ctx.save();
    ctx.translate(d.x, d.y + bob);

    // soft shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.ellipse(0, d.radius + 20, d.radius * 1.8, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // drone base with layered gradients
    const bodyW = d.radius * 2;
    const bodyH = d.radius * 1.2;
    // body background
    ctx.beginPath();
    ctx.fillStyle = '#dff6ff';
    ctx.roundRect ? ctx.roundRect(-d.radius - 2, -d.radius * 0.6 - 2, bodyW + 4, bodyH + 4, 10) : null;
    roundRect(ctx, -d.radius - 2, -d.radius * 0.6 - 2, bodyW + 4, bodyH + 4, 10, '#e8fbff');
    // body main
    roundRect(ctx, -d.radius, -d.radius * 0.6, bodyW, bodyH, 10, '#80d0e8');
    // accent stripe
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-d.radius + 6, -d.radius * 0.6 + 6, bodyW - 12, 10);

    // cockpit glass (shiny)
    ctx.beginPath();
    const grad = ctx.createLinearGradient(-d.radius * 0.2, -d.radius, d.radius * 0.8, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(120,200,220,0.9)');
    ctx.fillStyle = grad;
    ctx.ellipse(d.radius * 0.12, -6, d.radius * 0.4, d.radius * 0.24, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // rotors with motion blur effect
    const rotorW = d.radius * 1.9;
    const rotorH = 6;
    const rp = Math.sin(d.rotorPhase) * 6;
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * (d.radius + 10), -8);
      ctx.rotate(rp * 0.02);
      // soft blurred ring
      ctx.beginPath();
      ctx.fillStyle = 'rgba(20,50,70,0.08)';
      ctx.ellipse(0, 2.6, rotorW * 0.42, rotorH * 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(34,110,130,0.95)';
      ctx.ellipse(0, 0, rotorW * 0.4, rotorH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // decorative stickers
    ctx.beginPath();
    ctx.fillStyle = '#0b4f63';
    ctx.arc(-d.radius + 6, -4, 3, 0, Math.PI * 2);
    ctx.arc(d.radius - 8, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // friendly face
    ctx.beginPath();
    ctx.fillStyle = '#06323a';
    ctx.arc(-6, -2, 2.2, 0, Math.PI * 2);
    ctx.arc(8, -2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw bubbles with subtle gloss and ripple
  function drawChoices(t) {
    state.hoverIndex = -1;
    for (let i = 0; i < state.choices.length; i++) {
      const ch = state.choices[i];
      // detect proximity to drone
      const dx = state.drone.x - ch.x;
      const dy = state.drone.y - ch.y;
      const dist = Math.hypot(dx, dy);
      const isNear = dist < ch.r + state.drone.radius + 1;
      const scale = isNear ? 1.06 : 1.0;
      const r = ch.r * scale;

      // glossy bubble base with gradient and thin outline
      const g = ctx.createLinearGradient(ch.x - r, ch.y - r, ch.x + r, ch.y + r);
      g.addColorStop(0, 'rgba(255,255,255,0.92)');
      g.addColorStop(0.5, `rgba(${220 - i * 10}, ${245 - i * 8}, ${255 - i * 20}, 0.95)`);
      g.addColorStop(1, 'rgba(230,255,250,0.85)');
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.ellipse(ch.x, ch.y, r, r * 0.94, 0, 0, Math.PI * 2);
      ctx.fill();

      // highlight crescent
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.ellipse(ch.x - r * 0.3, ch.y - r * 0.4, r * 0.6, r * 0.35, -0.6, 0, Math.PI * 2);
      ctx.fill();

      // subtle inner rim
      ctx.beginPath();
      ctx.lineWidth = isNear ? 3.5 : 2.2;
      ctx.strokeStyle = isNear ? '#ffd86b' : 'rgba(0,0,0,0.06)';
      ctx.ellipse(ch.x, ch.y, r + 4, r * 0.94 + 4, 0, 0, Math.PI * 2);
      ctx.stroke();

      // ripple animation hint
      const ripple = Math.abs(Math.sin(t * 0.002 + i)) * 0.6;
      ctx.beginPath();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + ripple * 0.06})`;
      ctx.ellipse(ch.x, ch.y, r * 0.8 + ripple * 4, r * 0.74 + ripple * 3.6, 0, 0, Math.PI * 2);
      ctx.stroke();

      // number text inside bubble
      ctx.font = `bold 22px ${FONT_FAMILY}`;
      ctx.fillStyle = '#05323a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = String(ch.value);
      let fontSize = 22;
      let metrics = ctx.measureText(text);
      while (metrics.width > r * 1.6 && fontSize > 14) {
        fontSize -= 1;
        ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`;
        metrics = ctx.measureText(text);
      }
      ctx.fillText(text, ch.x, ch.y);

      if (isNear) state.hoverIndex = i;
    }
  }

  // Top UI and instructions
  function drawTopUI() {
    // Score
    const scoreText = `Score: ${state.score}/${state.goal}`;
    drawTextWithBg(scoreText, 12, TOP_PADDING, {
      fontSize: UI_IMPORTANT,
      fontWeight: 'bold',
      align: 'left',
      baseline: 'top',
      padding: 10,
      bgColor: 'rgba(255,255,255,0.95)',
      textColor: '#06323a',
      radius: 10
    });

    // Lives right
    const livesText = `Lives: ${state.lives}`;
    ctx.save();
    ctx.font = `bold ${UI_IMPORTANT}px ${FONT_FAMILY}`;
    drawTextWithBg(livesText, WIDTH - 12, TOP_PADDING, {
      fontSize: UI_IMPORTANT,
      fontWeight: 'bold',
      align: 'right',
      baseline: 'top',
      padding: 10,
      bgColor: 'rgba(255,255,255,0.95)',
      textColor: '#7b1120',
      radius: 10
    });
    ctx.restore();

    // Goal center
    const goalText = `Get ${state.goal} correct answers to win`;
    drawTextWithBg(goalText, WIDTH / 2, TOP_PADDING, {
      fontSize: UI_TEXT_MIN + 6,
      fontWeight: '600',
      align: 'center',
      baseline: 'top',
      padding: 10,
      bgColor: 'rgba(255,255,255,0.94)',
      textColor: '#083a41',
      radius: 10
    });

    // Audio icon (top-right cluster)
    const iconSize = 18;
    const iconX = WIDTH - 12 - iconSize - 12;
    const iconY = TOP_PADDING + 34;
    roundRect(ctx, iconX - 6, iconY - 6, iconSize + 12, iconSize + 12, 6, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = state.muted ? '#bfbfbf' : '#00707f';
    ctx.fillRect(iconX, iconY + 2, iconSize - 8, iconSize - 4);
    ctx.beginPath();
    ctx.moveTo(iconX + iconSize - 8, iconY + 3);
    ctx.lineTo(iconX + iconSize + 2, iconY + iconSize / 2 + 1);
    ctx.lineTo(iconX + iconSize - 8, iconY + iconSize - 3);
    ctx.closePath();
    ctx.fill();

    if (state.muted) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(iconX + 2, iconY + 2);
      ctx.lineTo(iconX + iconSize + 6, iconY + iconSize - 2);
      ctx.moveTo(iconX + iconSize + 6, iconY + 2);
      ctx.lineTo(iconX + 2, iconY + iconSize - 2);
      ctx.stroke();
    }

    // Bottom instruction area
    const instr = "Move: Arrows or WASD  •  Select: fly into bubble or press 1-3  •  M: mute/unmute";
    drawTextWithBg(instr, WIDTH / 2, HEIGHT - 38, {
      fontSize: UI_TEXT_MIN,
      fontWeight: 'normal',
      align: 'center',
      baseline: 'top',
      padding: 10,
      bgColor: 'rgba(255,255,255,0.94)',
      textColor: '#073b44',
      radius: 10
    });
  }

  function drawQuestionArea() {
    if (!state.currentQuestion) return;
    const q = state.currentQuestion;
    const text = `${q.a} ${q.op} ${q.b} = ?`;
    const y = 78;
    drawTextWithBg(text, WIDTH / 2, y, {
      fontSize: 26,
      fontWeight: 'bold',
      align: 'center',
      baseline: 'top',
      padding: 12,
      bgColor: 'rgba(255,255,255,0.96)',
      textColor: '#022f34',
      radius: 12
    });
  }

  function drawMessage() {
    if (!state.showMessage) return;
    const elapsed = performance.now() - state.lastActionTime;
    const alpha = elapsed < 1800 ? 1 : Math.max(0, 1 - (elapsed - 1800) / 800);
    if (alpha <= 0) {
      state.showMessage = '';
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    drawTextWithBg(state.showMessage, WIDTH / 2, 110, {
      fontSize: 16,
      fontWeight: '600',
      align: 'center',
      baseline: 'top',
      padding: 8,
      bgColor: 'rgba(255,255,255,0.94)',
      textColor: '#073b4a',
      radius: 10
    });
    ctx.restore();
  }

  function getRestartButtonRect() {
    const w = 260;
    const h = 46;
    const x = WIDTH / 2 - w / 2;
    const y = HEIGHT / 2 + 60;
    return { x, y, w, h };
  }

  function drawEndScreen() {
    ctx.fillStyle = 'rgba(6,8,10,0.78)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (state.gameOverReason === 'win') {
      drawTextWithBg('VICTORY!', WIDTH / 2, HEIGHT / 2 - 48, {
        fontSize: 36,
        fontWeight: 'bold',
        align: 'center',
        baseline: 'top',
        padding: 14,
        bgColor: '#eafff2',
        textColor: '#0a7a3d',
        radius: 14
      });
      const details = `You guided the drone crew and answered ${state.score} questions!`;
      drawTextWithBg(details, WIDTH / 2, HEIGHT / 2 - 2, {
        fontSize: 18,
        fontWeight: '600',
        align: 'center',
        baseline: 'top',
        padding: 12,
        bgColor: 'rgba(255,255,255,0.96)',
        textColor: '#073b4a',
        radius: 10
      });
    } else {
      drawTextWithBg('GAME OVER', WIDTH / 2, HEIGHT / 2 - 48, {
        fontSize: 34,
        fontWeight: 'bold',
        align: 'center',
        baseline: 'top',
        padding: 14,
        bgColor: '#ffefef',
        textColor: '#7a0b0b',
        radius: 14
      });
      const details = `You answered ${state.score} correctly. Try again to reach ${state.goal}!`;
      drawTextWithBg(details, WIDTH / 2, HEIGHT / 2 - 2, {
        fontSize: 18,
        fontWeight: '600',
        align: 'center',
        baseline: 'top',
        padding: 12,
        bgColor: 'rgba(255,255,255,0.96)',
        textColor: '#073b4a',
        radius: 10
      });
    }

    const btn = getRestartButtonRect();
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, '#fffcf0');
    ctx.fillStyle = '#094b5f';
    ctx.font = `bold 18px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Restart (Enter or Click)', btn.x + btn.w / 2, btn.y + btn.h / 2);
  }

  // Draw and update particles
  function updateAndDrawParticles(now) {
    const alive = [];
    for (const p of state.particles) {
      const age = now - p.born;
      if (age >= p.life) continue;
      p.vy += 0.018; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.wobble += 0.12;
      const lifeRatio = 1 - age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, lifeRatio));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(
        p.x + Math.sin(p.wobble) * 0.6,
        p.y + Math.cos(p.wobble) * 0.3,
        p.size * lifeRatio,
        p.size * lifeRatio * 0.8,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
      alive.push(p);
    }
    state.particles = alive;
  }

  // Main loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(60, now - lastTime);
    lastTime = now;

    // Update floating positions and ambient visuals
    drawBackground(dt, now);

    // Update movements if running
    if (state.running) {
      const speed = state.drone.speed;
      const k = state.keys;
      let ax = 0;
      let ay = 0;
      if (k['arrowleft'] || k['a']) ax -= 1;
      if (k['arrowright'] || k['d']) ax += 1;
      if (k['arrowup'] || k['w']) ay -= 1;
      if (k['arrowdown'] || k['s']) ay += 1;
      if (ax !== 0 && ay !== 0) {
        ax *= 0.7071;
        ay *= 0.7071;
      }
      state.drone.vx += ax * 0.18 * speed;
      state.drone.vy += ay * 0.18 * speed;
      state.drone.vx *= 0.96;
      state.drone.vy *= 0.96;
      const spd = Math.hypot(state.drone.vx, state.drone.vy);
      const max = state.drone.speed;
      if (spd > max) {
        state.drone.vx = (state.drone.vx / spd) * max;
        state.drone.vy = (state.drone.vy / spd) * max;
      }
      state.drone.x += state.drone.vx;
      state.drone.y += state.drone.vy;
      const margin = 22;
      state.drone.x = clamp(state.drone.x, margin, WIDTH - margin);
      state.drone.y = clamp(state.drone.y, 100, HEIGHT - 90);

      // Collisions with bubbles
      for (const choice of state.choices) {
        const dx = state.drone.x - choice.x;
        const dy = state.drone.y - choice.y;
        if (Math.hypot(dx, dy) <= state.drone.radius + choice.r - 4) {
          handleChoiceSelection(choice);
          break;
        }
      }
    }

    // Draw UI & objects
    drawTopUI();
    drawQuestionArea();
    drawChoices(now);
    drawDrone(dt, now);
    drawMessage();
    updateAndDrawParticles(now);

    if (!state.running) drawEndScreen();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // Accessibility: update aria label with status
  function updateAria() {
    const status = state.running
      ? `Score ${state.score} out of ${state.goal}. Lives ${state.lives}.`
      : state.gameOverReason === 'win'
      ? 'Victory!'
      : 'Game over.';
    const question = state.currentQuestion ? `Question: ${state.currentQuestion.a} ${state.currentQuestion.op} ${state.currentQuestion.b}.` : '';
    container.setAttribute(
      'aria-label',
      `Drone math game. ${status} ${question} Move with arrow keys or WASD. Press M to mute. Press Enter to restart.`
    );
  }
  setInterval(updateAria, 1000);

  // Resume audio on first user gesture if needed
  function resumeAudioOnGesture() {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        console.warn('Audio context resume failed:', err);
      });
    }
    window.removeEventListener('pointerdown', resumeAudioOnGesture);
    window.removeEventListener('keydown', resumeAudioOnGesture);
  }
  window.addEventListener('pointerdown', resumeAudioOnGesture);
  window.addEventListener('keydown', resumeAudioOnGesture);

  // Error handling: show friendly message inside canvas
  window.addEventListener('error', (evt) => {
    console.error('Unexpected error in game:', evt.error);
    ctx.save();
    roundRect(ctx, 60, HEIGHT / 2 - 60, WIDTH - 120, 120, 12, '#fff7ed');
    ctx.fillStyle = '#3b1e00';
    ctx.font = `bold 18px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('An unexpected error occurred. Please reload to try again.', WIDTH / 2, HEIGHT / 2);
    ctx.restore();
  });

  // Prevent accidental loss of control when focus changes
  canvas.setAttribute('tabindex', '0');
  canvas.addEventListener('blur', () => {
    state.keys = {};
  });
})();