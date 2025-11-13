(function () {
  // Enhanced Drone Math Game - Visual & Audio Improvements Only
  // Renders inside element with id 'game-of-the-day-stage'
  // All visuals drawn on canvas. Sounds generated with Web Audio API oscillators.
  // Author: Educational Game Designer AI (visual/audio improvements)

  // --- Setup container and canvas ---
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container #game-of-the-day-stage not found.');
    return;
  }
  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone math game. Use arrow keys to move the drone, space to scan a crate. Answer 10 questions to win. Three wrong answers and the game is over.'
  );
  container.appendChild(canvas);

  const live = document.createElement('div');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.setAttribute('aria-live', 'polite');
  container.appendChild(live);

  const ctx = canvas.getContext('2d');

  // --- Audio setup with improved layered ambient and effects ---
  let AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  let audioEnabled = true;
  try {
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    } else {
      audioEnabled = false;
    }
  } catch (e) {
    console.warn('AudioContext failed to initialize:', e);
    audioEnabled = false;
  }

  // Ambient music nodes
  let ambientNodes = [];
  let ambientMasterGain = null;

  function createAmbient() {
    if (!audioEnabled || !audioCtx) return;
    stopAmbient();
    try {
      ambientMasterGain = audioCtx.createGain();
      ambientMasterGain.gain.value = 0.02;
      ambientMasterGain.connect(audioCtx.destination);

      // gentle pad (two detuned saws with mild lowpass)
      const pad1 = audioCtx.createOscillator();
      pad1.type = 'sine';
      pad1.frequency.value = 110;
      const pad1Gain = audioCtx.createGain();
      pad1Gain.gain.value = 0.012;

      const pad2 = audioCtx.createOscillator();
      pad2.type = 'sine';
      pad2.frequency.value = 146.83; // D
      const pad2Gain = audioCtx.createGain();
      pad2Gain.gain.value = 0.008;

      // slow LFO to modulate amplitude slightly
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.006;

      lfo.connect(lfoGain);
      lfoGain.connect(pad1Gain.gain);
      lfoGain.connect(pad2Gain.gain);

      pad1.connect(pad1Gain);
      pad2.connect(pad2Gain);

      // subtle filter for warmth
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      pad1Gain.connect(lp);
      pad2Gain.connect(lp);
      lp.connect(ambientMasterGain);

      pad1.start();
      pad2.start();
      lfo.start();

      ambientNodes.push(pad1, pad2, lfo, pad1Gain, pad2Gain, lp);
    } catch (e) {
      console.warn('Ambient creation failed:', e);
    }
  }

  function stopAmbient() {
    try {
      if (ambientNodes && ambientNodes.length) {
        ambientNodes.forEach((n) => {
          try {
            if (n && typeof n.stop === 'function') n.stop();
            if (n && typeof n.disconnect === 'function') n.disconnect();
          } catch (e) {
            // ignore
          }
        });
      }
      ambientNodes = [];
      if (ambientMasterGain) {
        try {
          ambientMasterGain.disconnect();
        } catch (e) {}
        ambientMasterGain = null;
      }
    } catch (e) {
      // ignore
    }
  }

  function resumeAudioContext() {
    if (!audioEnabled || !audioCtx) return Promise.resolve();
    if (audioCtx.state === 'suspended') {
      return audioCtx.resume().catch((e) => {
        console.warn('AudioContext resume failed:', e);
      });
    }
    return Promise.resolve();
  }

  // Utility to create short percussive envelope on oscillator
  function playOscEnvelope({ type = 'sine', frequency = 440, duration = 0.4, gain = 0.06, detune = 0 }) {
    if (!audioEnabled || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = frequency;
      if (detune) o.detune.value = detune;
      g.gain.value = 0.0001;
      // quick attack, decay
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('playOscEnvelope error:', e);
    }
  }

  // Correct tone: bright triad with bell-like filter
  function playCorrectTone() {
    if (!audioEnabled || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      // three oscillators forming a pleasant chord
      const freqs = [880, 1100, 1320];
      const gains = [];
      const os = [];
      const master = audioCtx.createGain();
      master.gain.value = 0.001;
      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 200;
      master.connect(hp);
      hp.connect(audioCtx.destination);

      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.detune.value = (i - 1) * 6;
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        // envelope slightly staggered
        g.gain.exponentialRampToValueAtTime(0.06 - i * 0.01, now + 0.01 + i * 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
        o.connect(g);
        g.connect(master);
        o.start(now);
        o.stop(now + 0.7);
        os.push(o, g);
        gains.push(g);
      });

      // fade master up then down
      master.gain.setValueAtTime(0.001, now);
      master.gain.exponentialRampToValueAtTime(1.0, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      setTimeout(() => {
        try {
          master.disconnect();
        } catch (e) {}
      }, 900);
    } catch (e) {
      console.warn('playCorrectTone failed:', e);
    }
  }

  // Wrong tone: short low thud with wobble
  function playWrongTone() {
    if (!audioEnabled || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const lf = audioCtx.createOscillator();
      const lfGain = audioCtx.createGain();

      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, now);
      o.frequency.exponentialRampToValueAtTime(110, now + 0.28);
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

      // low-frequency wobble for character
      lf.type = 'sine';
      lf.frequency.value = 6;
      lfGain.gain.value = 8;
      lf.connect(lfGain);
      lfGain.connect(o.frequency);

      o.connect(g);
      g.connect(audioCtx.destination);

      o.start(now);
      o.stop(now + 0.6);
      lf.start(now);
      lf.stop(now + 0.6);
    } catch (e) {
      console.warn('playWrongTone failed:', e);
    }
  }

  // Pickup tone: quick pluck + little sparkle
  function playPickupTone() {
    if (!audioEnabled || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      // pluck-like oscillator
      const o = audioCtx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(660, now);
      o.frequency.exponentialRampToValueAtTime(990, now + 0.12);
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 6;
      o.connect(g);
      g.connect(bp);
      bp.connect(audioCtx.destination);
      o.start(now);
      o.stop(now + 0.25);

      // small sparkle (high pitch) layered
      const s = audioCtx.createOscillator();
      s.type = 'sine';
      s.frequency.value = 1760;
      const sg = audioCtx.createGain();
      sg.gain.value = 0.0001;
      sg.gain.exponentialRampToValueAtTime(0.03, now + 0.005);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      s.connect(sg);
      sg.connect(audioCtx.destination);
      s.start(now);
      s.stop(now + 0.14);
    } catch (e) {
      console.warn('playPickupTone failed:', e);
    }
  }

  // Click tone: short clean click
  function playClickTone() {
    playOscEnvelope({ type: 'square', frequency: 880, duration: 0.12, gain: 0.03 });
  }

  function safePlayEffect(type) {
    if (!audioEnabled || !audioCtx) return;
    resumeAudioContext().then(() => {
      try {
        if (type === 'correct') playCorrectTone();
        else if (type === 'wrong') playWrongTone();
        else if (type === 'pickup') playPickupTone();
        else if (type === 'click') playClickTone();
      } catch (e) {
        console.warn('Audio playback error:', e);
      }
    });
  }

  // --- Game configuration ---
  const CONFIG = {
    width: canvas.width,
    height: canvas.height,
    padding: 10,
    goalCorrect: 10,
    maxWrong: 3,
    minBodyFont: 16,
    importantFont: 22,
    crateY: 320,
    crateCount: 3
  };

  // --- Game state ---
  let state = {
    score: 0,
    wrong: 0,
    running: true,
    win: false,
    lose: false,
    question: null,
    crates: [],
    drone: {
      x: canvas.width / 2,
      y: 240,
      width: 64,
      height: 28,
      vx: 0,
      vy: 0,
      speed: 220,
      propRotation: 0
    },
    keys: {},
    mouse: { x: canvas.width / 2, y: canvas.height / 2 },
    audioOn: !!audioEnabled,
    lastTime: 0,
    flashTimer: 0,
    particles: [] // for visual feedback
  };

  // --- Utilities ---
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function generateQuestion() {
    const op = Math.random() < 0.55 ? '+' : '-';
    let a = randInt(2, 18);
    let b = randInt(1, 12);
    if (op === '-' && b > a) {
      const tmp = a;
      a = b;
      b = tmp;
    }
    const answer = op === '+' ? a + b : a - b;
    return { a, b, op, answer };
  }

  function spawnCratesForQuestion(q) {
    const crateValues = new Set();
    crateValues.add(q.answer);
    while (crateValues.size < CONFIG.crateCount) {
      const delta = randInt(1, 8);
      const sign = Math.random() < 0.5 ? -1 : 1;
      let candidate = q.answer + sign * delta;
      if (candidate < 0) candidate = Math.abs(candidate) + 1;
      crateValues.add(candidate);
    }
    const values = Array.from(crateValues);
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    const spacing = canvas.width / (CONFIG.crateCount + 1);
    const crates = values.map((val, i) => {
      return {
        value: val,
        x: spacing * (i + 1),
        y: CONFIG.crateY,
        w: 84,
        h: 56,
        picked: false,
        bob: Math.random() * 360,
        stickerHue: Math.floor(Math.random() * 360)
      };
    });
    return crates;
  }

  function newQuestion() {
    state.question = generateQuestion();
    state.crates = spawnCratesForQuestion(state.question);
    live.textContent = `New question: ${state.question.a} ${state.question.op} ${state.question.b}.`;
  }

  // --- Input handling ---
  function onKeyDown(e) {
    if (!state.running && (state.win || state.lose)) {
      if (e.key === 'r' || e.key === 'R') {
        restartGame();
      }
    }
    if (e.key === 'm' || e.key === 'M') {
      state.audioOn = !state.audioOn;
      if (state.audioOn) {
        audioEnabled = true;
        if (!audioCtx && AudioContextClass) {
          try {
            audioCtx = new AudioContextClass();
          } catch (err) {
            audioEnabled = false;
            console.warn('AudioContext creation failed on toggle:', err);
          }
        }
        createAmbient();
      } else {
        stopAmbient();
      }
      live.textContent = state.audioOn ? 'Audio enabled' : 'Audio disabled';
      e.preventDefault();
    }

    if (e.key === 'ArrowLeft') state.keys.left = true;
    else if (e.key === 'ArrowRight') state.keys.right = true;
    else if (e.key === 'ArrowUp') state.keys.up = true;
    else if (e.key === 'ArrowDown') state.keys.down = true;
    else if (e.key === ' ') {
      attemptScan();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      attemptScan();
    }
  }

  function onKeyUp(e) {
    if (e.key === 'ArrowLeft') state.keys.left = false;
    else if (e.key === 'ArrowRight') state.keys.right = false;
    else if (e.key === 'ArrowUp') state.keys.up = false;
    else if (e.key === 'ArrowDown') state.keys.down = false;
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    state.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  }

  function onClick(e) {
    if (!state.running && (state.win || state.lose)) {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (canvas.height / rect.height);
      const btnW = 180;
      const btnH = 44;
      const bx = canvas.width / 2 - btnW / 2;
      const by = canvas.height / 2 + 40;
      if (mx >= bx && mx <= bx + btnW && my >= by && my <= by + btnH) {
        restartGame();
        safePlayEffect('click');
        return;
      }
    }

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    for (const crate of state.crates) {
      if (
        mx >= crate.x - crate.w / 2 &&
        mx <= crate.x + crate.w / 2 &&
        my >= crate.y - crate.h / 2 &&
        my <= crate.y + crate.h / 2
      ) {
        state.drone.x = crate.x;
        state.drone.y = crate.y - 90;
        attemptScan(crate);
        safePlayEffect('click');
        break;
      }
    }
  }

  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // --- Game logic ---
  function attemptScan(targetCrate = null) {
    if (!state.running) return;
    const droneCenterX = state.drone.x;
    const droneCenterY = state.drone.y + state.drone.height / 2;
    let hit = null;

    if (targetCrate) {
      hit = targetCrate;
    } else {
      for (const crate of state.crates) {
        if (crate.picked) continue;
        if (
          droneCenterX >= crate.x - crate.w / 2 &&
          droneCenterX <= crate.x + crate.w / 2 &&
          droneCenterY >= crate.y - crate.h / 2 &&
          droneCenterY <= crate.y + crate.h / 2
        ) {
          hit = crate;
          break;
        }
      }
    }

    if (!hit) {
      state.flashTimer = 0.18;
      safePlayEffect('click');
      live.textContent = 'No crate in range. Move the drone over a crate and press Space.';
      // small negative particle
      spawnParticles(state.drone.x, state.drone.y + state.drone.height / 2, { color: '#FFB3B3', count: 6 });
      return;
    }

    if (hit.value === state.question.answer) {
      hit.picked = true;
      state.score += 1;
      state.flashTimer = 0.25;
      safePlayEffect('correct');
      safePlayEffect('pickup');
      live.textContent = `Correct! ${state.question.a} ${state.question.op} ${state.question.b} = ${state.question.answer}. Score ${state.score}/${CONFIG.goalCorrect}.`;
      spawnParticles(hit.x, hit.y, { color: '#C9FFD6', count: 18, spread: 36 });
      setTimeout(() => {
        if (state.score >= CONFIG.goalCorrect) {
          winGame();
        } else {
          newQuestion();
        }
      }, 450);
    } else {
      state.wrong += 1;
      state.flashTimer = 0.6;
      safePlayEffect('wrong');
      live.textContent = `Oops! That was ${hit.value}. Wrong answers: ${state.wrong}/${CONFIG.maxWrong}.`;
      if (state.wrong >= CONFIG.maxWrong) {
        loseGame();
      } else {
        state.drone.y = clamp(state.drone.y - 20, 60, canvas.height - 60);
        spawnParticles(hit.x, hit.y, { color: '#FFC6C6', count: 10, spread: 28 });
      }
    }
  }

  function winGame() {
    state.running = false;
    state.win = true;
    state.lose = false;
    stopAmbient();
    safePlayEffect('correct');
    live.textContent = `You won! Score ${state.score}/${CONFIG.goalCorrect}. Press R or click Restart to play again.`;
  }

  function loseGame() {
    state.running = false;
    state.win = false;
    state.lose = true;
    stopAmbient();
    safePlayEffect('wrong');
    live.textContent = `Game over. Wrong answers ${state.wrong}/${CONFIG.maxWrong}. Press R or click Restart to play again.`;
  }

  function restartGame() {
    state.score = 0;
    state.wrong = 0;
    state.running = true;
    state.win = false;
    state.lose = false;
    state.drone.x = canvas.width / 2;
    state.drone.y = 240;
    state.drone.vx = 0;
    state.drone.vy = 0;
    state.keys = {};
    state.flashTimer = 0;
    state.particles = [];
    if (state.audioOn && audioEnabled) {
      createAmbient();
    }
    newQuestion();
    live.textContent = 'Game restarted. Answer the questions to collect 10 correct crates.';
  }

  // --- Particle system for visual feedback ---
  function spawnParticles(x, y, opts = {}) {
    const color = opts.color || '#FFF';
    const count = opts.count || 12;
    const spread = opts.spread || 24;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 80;
      state.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0.9 + Math.random() * 0.6,
        color,
        size: 2 + Math.random() * 3
      });
    }
  }

  // --- Drawing helpers ---
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (r === undefined) r = 5;
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

  function drawTextBox(text, x, y, options = {}) {
    const fontSize = options.fontSize || CONFIG.minBodyFont;
    const font = `${fontSize}px sans-serif`;
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const padding = options.padding != null ? options.padding : CONFIG.padding;
    const boxW = textW + padding * 2;
    const boxH = fontSize + padding * 2;
    let ax = x;
    if (options.align === 'center') ax = x - boxW / 2;
    else if (options.align === 'right') ax = x - boxW;
    if (options.bg !== false) {
      ctx.fillStyle = options.bg || 'rgba(255,255,255,0.85)';
      roundRect(ctx, ax, y, boxW, boxH, 8, true, false);
    }
    ctx.fillStyle = options.fg || '#123';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, ax + padding, y + boxH / 2);
    return { x: ax, y: y, w: boxW, h: boxH };
  }

  // Enhanced crate drawing with wood grain and sticker
  function drawCrate(crate) {
    const x = crate.x;
    let y = crate.y;
    const w = crate.w;
    const h = crate.h;

    // bobbing for liveliness
    const bob = Math.sin(Date.now() / 600 + crate.bob) * 3;
    y += bob;

    ctx.save();
    if (crate.picked) {
      // upward float and fade
      const age = Math.min(1, Math.max(0, (Date.now() / 600) % 1000 / 1)); // just to change
      const up = 40 + (Date.now() / 8) % 40;
      ctx.globalAlpha = 0.95;
      ctx.translate(x, y - up);
      ctx.scale(0.78, 0.78);
    } else {
      ctx.translate(x, y);
    }

    // crate shadow
    ctx.fillStyle = 'rgba(10,10,10,0.12)';
    ctx.beginPath();
    ctx.ellipse(0, h / 2 + 14, w * 0.56, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // wood body
    ctx.fillStyle = '#D2A679';
    roundRect(ctx, -w / 2, -h / 2, w, h, 6, true, false);
    // wood grain lines
    ctx.strokeStyle = 'rgba(120,70,30,0.12)';
    ctx.lineWidth = 1;
    for (let i = -w / 2 + 8; i < w / 2 - 8; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i + Math.sin((i + Date.now() / 80) / 20) * 2, -h / 2 + 6);
      ctx.lineTo(i - Math.sin((i + Date.now() / 90) / 20) * 2, h / 2 - 6);
      ctx.stroke();
    }

    // metal band
    ctx.fillStyle = '#8B6A4F';
    roundRect(ctx, -w / 2, -h / 8, w, h / 4, 3, true, false);

    // sticker with value
    const hue = crate.stickerHue;
    ctx.fillStyle = `hsl(${hue} 80% 70%)`;
    roundRect(ctx, -30, -10, 60, 28, 6, true, false);
    // sticker shine
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-12, -5, 18, 8, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // value
    ctx.fillStyle = '#06283D';
    ctx.font = '18px sans-serif';
    ctx.textBaseline = 'middle';
    const label = String(crate.value);
    ctx.fillText(label, -ctx.measureText(label).width / 2, 3);

    ctx.restore();
  }

  // Enhanced drone drawing with propeller rotation and gentle shadow
  function drawDrone(dt) {
    const d = state.drone;
    const x = d.x;
    const y = d.y;
    const w = d.width;
    const h = d.height;

    // update prop rotation
    d.propRotation += (dt ? dt : 0.016) * 18;

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + h / 2 + 18, w * 0.9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.save();
    // body gradient
    const bodyGrad = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    bodyGrad.addColorStop(0, '#6FB8E6');
    bodyGrad.addColorStop(1, '#9EE0FF');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 12, true, false);

    // cockpit
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + 8, y - 2, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // friendly face (eyes)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + 8, y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#06283D';
    ctx.beginPath();
    ctx.arc(x + 9, y - 2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.strokeStyle = '#3b3b3b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + h / 2);
    ctx.lineTo(x - 16, y + h / 2 + 12);
    ctx.moveTo(x + 10, y + h / 2);
    ctx.lineTo(x + 16, y + h / 2 + 12);
    ctx.stroke();

    // propellers with rotation
    const propOffset = w / 2 + 6;
    const props = [
      { px: x - propOffset, py: y - h / 2 - 6 },
      { px: x + propOffset, py: y - h / 2 - 6 }
    ];
    props.forEach((p, idx) => {
      ctx.save();
      ctx.translate(p.px, p.py);
      ctx.rotate(((d.propRotation + idx * 120) * Math.PI) / 180);
      // blades
      ctx.fillStyle = 'rgba(30,30,30,0.16)';
      for (let b = 0; b < 3; b++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.ellipse(0, -8, 3.8, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // hub
      ctx.fillStyle = '#F5FFFB';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.restore();

    // scanner beam (subtle gradient)
    ctx.save();
    ctx.globalAlpha = 0.18;
    const beamGrad = ctx.createLinearGradient(x, y + h / 2, x, y + h / 2 + 160);
    beamGrad.addColorStop(0, 'rgba(154,230,180,0.28)');
    beamGrad.addColorStop(1, 'rgba(154,230,180,0.02)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(x - 24, y + h / 2);
    ctx.lineTo(x + 24, y + h / 2);
    ctx.lineTo(x + 80, y + h / 2 + 160);
    ctx.lineTo(x - 80, y + h / 2 + 160);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Draw background with subtle parallax hills and clouds
  function drawBackground(now) {
    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#EAF9FF');
    sky.addColorStop(0.6, '#F8FFF6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // sun
    const sx = 100 + Math.sin(now / 4000) * 20;
    const sy = 60 + Math.cos(now / 5000) * 6;
    const sunGrad = ctx.createRadialGradient(sx, sy, 8, sx, sy, 80);
    sunGrad.addColorStop(0, 'rgba(255,237,153,0.95)');
    sunGrad.addColorStop(1, 'rgba(255,237,153,0.06)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, 70, 0, Math.PI * 2);
    ctx.fill();

    // distant hills (parallax)
    const hills = [
      { offset: 0, height: 140, color: '#D0F0D6' },
      { offset: 40, height: 110, color: '#BEE8C8' },
      { offset: 80, height: 80, color: '#A6E0B6' }
    ];
    hills.forEach((h, i) => {
      ctx.fillStyle = h.color;
      ctx.beginPath();
      const amplitude = 24 + i * 8;
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= canvas.width; x++) {
        const y = canvas.height - h.height - Math.sin((x + now / (120 + i * 20)) / 80) * amplitude - h.offset;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();
    });

    // subtle foreground grid
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#0b3b29';
    for (let x = 0; x < canvas.width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x + (now / 100) % 28, canvas.height - 60);
      ctx.lineTo(x + (now / 100) % 28, canvas.height - 20);
      ctx.stroke();
    }
    ctx.restore();

    // ground strip
    ctx.fillStyle = '#F5FFF6';
    roundRect(ctx, 0, canvas.height - 72, canvas.width, 72, 0, true, false);
  }

  // --- Main update & render ---
  function update(dt) {
    if (!state.running) {
      state.drone.x += Math.sin(Date.now() / 800) * 0.2;
      state.drone.propRotation += dt * 6;
      // particles drift
      state.particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 40 * dt;
        p.life -= dt;
      });
      state.particles = state.particles.filter((p) => p.life > 0);
      return;
    }

    let targetVX = 0;
    if (state.keys.left) targetVX -= 1;
    if (state.keys.right) targetVX += 1;

    let targetVY = 0;
    if (state.keys.up) targetVY -= 1;
    if (state.keys.down) targetVY += 1;

    const accel = 10;
    state.drone.vx += (targetVX * state.drone.speed - state.drone.vx) * Math.min(1, accel * dt);
    state.drone.vy += (targetVY * state.drone.speed - state.drone.vy) * Math.min(1, accel * dt);

    // mouse attraction when canvas is focused
    if (canvas === document.activeElement) {
      const dx = state.mouse.x - state.drone.x;
      state.drone.vx += dx * 0.002;
      const dy = state.mouse.y - state.drone.y;
      state.drone.vy += dy * 0.001;
    }

    state.drone.x += state.drone.vx * dt;
    state.drone.y += state.drone.vy * dt;

    state.drone.x = clamp(state.drone.x, state.drone.width / 2 + 10, canvas.width - state.drone.width / 2 - 10);
    state.drone.y = clamp(state.drone.y, 60, CONFIG.crateY - 70);

    for (const crate of state.crates) {
      if (crate.picked) {
        crate.y -= 60 * dt;
        crate.w *= 0.995;
        crate.h *= 0.995;
      } else {
        crate.bob += dt * 2;
      }
    }

    // update particles
    state.particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.life -= dt;
    });
    state.particles = state.particles.filter((p) => p.life > 0);

    if (state.flashTimer > 0) state.flashTimer = Math.max(0, state.flashTimer - dt);
  }

  function draw() {
    const now = Date.now();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground(now);

    // small floating decorative shapes (soft)
    for (let i = 0; i < 5; i++) {
      const bx = (i * 191 + now / 60) % canvas.width;
      const by = 60 + (i % 3) * 20 + Math.sin(now / 900 + i) * 6;
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = ['#FFEFE6', '#E6FFF2', '#E8F4FF'][i % 3];
      ctx.beginPath();
      ctx.ellipse(bx, by, 26 - i * 2, 12 - i, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // UI Score top-left
    ctx.font = `${CONFIG.importantFont}px sans-serif`;
    const scoreText = `Score: ${state.score}/${CONFIG.goalCorrect}`;
    drawTextBox(scoreText, CONFIG.padding, CONFIG.padding, {
      align: 'left',
      fontSize: CONFIG.importantFont,
      padding: 12,
      bg: 'rgba(255,255,255,0.95)',
      fg: '#0A2749'
    });

    // Audio status top-center
    const audioText = state.audioOn ? 'Audio: On (M)' : 'Audio: Off (M)';
    ctx.font = '14px sans-serif';
    const audioMetrics = ctx.measureText(audioText);
    const audioBoxW = audioMetrics.width + 16 + 24;
    const audioX = canvas.width / 2 - audioBoxW / 2;
    const audioY = CONFIG.padding;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, audioX, audioY, audioBoxW, 36, 8, true, false);
    ctx.fillStyle = state.audioOn ? '#2E8B57' : '#B23A48';
    // draw small speaker icon
    ctx.beginPath();
    ctx.rect(audioX + 6, audioY + 8, 18, 20);
    ctx.fill();
    ctx.fillStyle = '#06283D';
    ctx.font = '14px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(audioText, audioX + 34, audioY + 18);

    // Lives top-right
    ctx.font = `${CONFIG.importantFont}px sans-serif`;
    const livesLeft = Math.max(0, CONFIG.maxWrong - state.wrong);
    const livesText = `Lives: ${livesLeft}`;
    const livesMetrics = ctx.measureText(livesText);
    const livesBoxW = livesMetrics.width + 24;
    const livesX = canvas.width - CONFIG.padding - livesBoxW;
    const livesY = CONFIG.padding;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, livesX, livesY, livesBoxW, 36, 8, true, false);
    ctx.fillStyle = '#06283D';
    ctx.fillText(livesText, livesX + 12, livesY + 22);

    // Question box
    ctx.font = `${20}px sans-serif`;
    const qText = state.question ? `Question: ${state.question.a} ${state.question.op} ${state.question.b} = ?` : 'Loading...';
    drawTextBox(qText, canvas.width / 2, 70, {
      align: 'center',
      fontSize: 20,
      padding: 12,
      bg: 'rgba(255,255,255,0.96)',
      fg: '#06283D'
    });

    // Draw crates
    for (const crate of state.crates) {
      drawCrate(crate);
    }

    // Draw drone
    drawDrone(1 / 60);

    // Draw particles
    state.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life / 1.2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Instructions bottom center wrapped
    const instr =
      'Controls: Arrow keys to move, Space or Enter to scan a crate. Click a crate to move over it. Reach 10 correct answers. Press M to toggle audio.';
    ctx.font = `${CONFIG.minBodyFont}px sans-serif`;
    const wrapWidth = 640;
    const words = instr.split(' ');
    let line = '';
    const lines = [];
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      const w = ctx.measureText(test).width;
      if (w > wrapWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const lineHeight = CONFIG.minBodyFont + 8;
    const boxH = lines.length * lineHeight + 20;
    const boxW = wrapWidth + 24;
    const bx = canvas.width / 2 - boxW / 2;
    const by = canvas.height - boxH - 16;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, bx, by, boxW, boxH, 10, true, false);
    ctx.fillStyle = '#06283D';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + 12, by + 10 + i * lineHeight);
    }

    // Flash overlay when wrong or no crate
    if (state.flashTimer > 0) {
      ctx.globalAlpha = Math.min(0.45, state.flashTimer * 2);
      const color = state.flashTimer > 0.4 ? 'rgba(255, 220, 220, 0.6)' : 'rgba(255,255,210,0.22)';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    // End screens
    if (!state.running && (state.win || state.lose)) {
      ctx.fillStyle = 'rgba(10,10,10,0.36)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const title = state.win ? 'Victory!' : 'Game Over';
      const msg = state.win ? `You collected ${state.score} correct crates!` : `You made ${state.wrong} wrong answers.`;

      ctx.font = '36px sans-serif';
      const titleW = ctx.measureText(title).width;
      ctx.font = '20px sans-serif';
      const msgW = ctx.measureText(msg).width;
      const boxW = Math.max(titleW, msgW) + 80;
      const boxH = 160;
      const bx2 = canvas.width / 2 - boxW / 2;
      const by2 = canvas.height / 2 - boxH / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      roundRect(ctx, bx2, by2, boxW, boxH, 12, true, false);
      ctx.fillStyle = '#06283D';
      ctx.font = '36px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(title, canvas.width / 2 - ctx.measureText(title).width / 2, by2 + 16);
      ctx.font = '20px sans-serif';
      ctx.fillText(msg, canvas.width / 2 - ctx.measureText(msg).width / 2, by2 + 64);

      const btnW = 180;
      const btnH = 44;
      const bxbtn = canvas.width / 2 - btnW / 2;
      const bybtn = by2 + boxH - 56;
      ctx.fillStyle = '#2E8B57';
      roundRect(ctx, bxbtn, bybtn, btnW, btnH, 8, true, false);
      ctx.fillStyle = '#fff';
      ctx.font = '20px sans-serif';
      ctx.fillText('Restart (R)', canvas.width / 2 - ctx.measureText('Restart (R)').width / 2, bybtn + 12);
    }
  }

  // --- Main loop ---
  function loop(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const dt = Math.min(0.05, (timestamp - state.lastTime) / 1000);
    state.lastTime = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // --- Start the game ---
  try {
    newQuestion();
    if (state.audioOn && audioEnabled && audioCtx) {
      // Wait for user gesture to start ambient, but attach a one-time handler to resume asap
      function resumeAudioOnGesture() {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            createAmbient();
          }).catch(() => {});
        } else {
          createAmbient();
        }
        window.removeEventListener('pointerdown', resumeAudioOnGesture);
        window.removeEventListener('keydown', resumeAudioOnGesture);
      }
      window.addEventListener('pointerdown', resumeAudioOnGesture);
      window.addEventListener('keydown', resumeAudioOnGesture);
    }
    requestAnimationFrame(loop);
  } catch (e) {
    console.error('Game start error:', e);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = '18px sans-serif';
    ctx.fillText('An error occurred starting the game. Please try reloading.', 20, 40);
  }

  // expose restart for debugging
  window.__droneMathRestart = restartGame;
})();