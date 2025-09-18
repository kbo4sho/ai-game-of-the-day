(function () {
  // Wacky Machine Math Game (Visuals & Audio Enhanced)
  // Renders into existing element with id "game-of-the-day-stage".
  // All visuals are canvas-drawn. Sounds use Web Audio API oscillators/filters.
  // Written with accessibility in mind (keyboard controls and aria-live updates).

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const CONTAINER_ID = 'game-of-the-day-stage';
  const LEVEL_COUNT = 8;

  // Utility helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const safeText = s => String(s == null ? '' : s);

  // Find container
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error(`Game container with id "${CONTAINER_ID}" not found.`);
    return;
  }

  // Clear container and set accessible label
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.userSelect = 'none';

  // Create a hidden accessible live region for screen readers
  const ariaLive = document.createElement('div');
  ariaLive.setAttribute('role', 'status');
  ariaLive.setAttribute('aria-live', 'polite');
  ariaLive.style.position = 'absolute';
  ariaLive.style.left = '0';
  ariaLive.style.top = '0';
  ariaLive.style.width = '1px';
  ariaLive.style.height = '1px';
  ariaLive.style.overflow = 'hidden';
  ariaLive.style.clip = 'rect(1px, 1px, 1px, 1px)';
  ariaLive.style.whiteSpace = 'nowrap';
  container.appendChild(ariaLive);

  // Create canvas (exact game area)
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // make it focusable for keyboard events
  canvas.setAttribute('aria-label', 'Wacky Machines math game. Use arrow keys to play. Press M to toggle sound.');
  canvas.style.outline = 'none';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  // Game state
  let running = true;
  let frame = 0;
  let selectedKnob = 0; // 0,1,2
  let level = 0;
  let attempts = 0;
  let solvedCount = 0;
  let showHint = false;
  let audioAllowed = false;
  let audioOk = false;
  let audioEnabled = true;
  let audioContext = null; // will be created on first user gesture
  let masterGain = null;
  let bgNodes = null; // background audio nodes
  let lastAudioError = null;
  let spinner = 0;

  // Visual animation state
  const knobAngles = [0, 0, 0]; // current displayed rotation for knobs (radians)
  const knobTargetAngles = [0, 0, 0]; // target rotation for smoothing
  const knobWobble = [0, 0, 0]; // small wobble
  let winParticles = []; // particles for win animation
  let winTimer = 0;

  // Puzzle data: each level has three knobs values and a target sum
  const puzzles = [];

  // Generate puzzles (simple addition tasks)
  function generatePuzzles() {
    puzzles.length = 0;
    for (let i = 0; i < LEVEL_COUNT; i++) {
      // Levels start easy and grow slightly
      const min = 0;
      const maxBase = 5 + Math.floor(i * 1.5); // 5,6.5,8...
      const max = clamp(maxBase + randInt(0, 4), 6, 12);
      const a = randInt(min, max);
      const b = randInt(min, max);
      const c = randInt(min, max);
      const target = a + b + c + randInt(-3, 3);
      // Ensure target is reasonable and positive
      puzzles.push({
        knobs: [a, b, c].map(v => clamp(v, 0, 12)),
        target: clamp(target, 0, 30)
      });
    }
  }

  generatePuzzles();

  // Copy initial values for current play
  let current = {
    knobs: [0, 0, 0],
    target: 0
  };

  function startLevel(index = 0) {
    level = clamp(index, 0, puzzles.length - 1);
    attempts = 0;
    showHint = false;
    selectedKnob = 0;
    const p = puzzles[level];
    current.knobs = p.knobs.slice(); // start with the puzzle's values as default
    current.target = p.target;
    // reset visual rotations to correspond to values
    for (let i = 0; i < 3; i++) {
      knobTargetAngles[i] = (current.knobs[i] % 10) * 0.12;
      knobAngles[i] = knobTargetAngles[i];
      knobWobble[i] = 0;
    }
    updateAria(
      `Level ${level + 1}. The target is ${current.target}. Use left/right to pick a knob and up/down to change its number, then press Enter to submit.`
    );
  }

  startLevel(0);

  // Accessibility update
  function updateAria(text) {
    ariaLive.textContent = text;
  }

  // Input handling
  canvas.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const key = e.key;
    if (key === 'ArrowLeft') {
      selectedKnob = (selectedKnob + 3 - 1) % 3;
      e.preventDefault();
      playClick();
      updateAria(`Knob ${selectedKnob + 1} selected, value ${current.knobs[selectedKnob]}.`);
    } else if (key === 'ArrowRight') {
      selectedKnob = (selectedKnob + 1) % 3;
      e.preventDefault();
      playClick();
      updateAria(`Knob ${selectedKnob + 1} selected, value ${current.knobs[selectedKnob]}.`);
    } else if (key === 'ArrowUp') {
      changeKnob(selectedKnob, 1);
      e.preventDefault();
    } else if (key === 'ArrowDown') {
      changeKnob(selectedKnob, -1);
      e.preventDefault();
    } else if (key === 'Enter' || key === ' ') {
      submitAttempt();
      e.preventDefault();
    } else if (key.toLowerCase() === 'm') {
      toggleAudio();
      e.preventDefault();
    } else if (key.toLowerCase() === 'r') {
      startLevel(0);
      solvedCount = 0;
      updateAria('Game reset. Starting at level 1.');
      e.preventDefault();
    } else if (key.toLowerCase() === 'h') {
      showHint = !showHint;
      updateAria(showHint ? 'Hint shown.' : 'Hint hidden.');
      e.preventDefault();
    }
  });

  // Mouse handling
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    // Click detection for knobs and submit/mute buttons
    const clicked = handleClick(x, y);
    if (clicked) {
      // allow audio to start on first user gesture
      ensureAudioResume();
    }
  });

  // Wheel to adjust knob
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dy = Math.sign(e.deltaY);
    changeKnob(selectedKnob, -dy);
    ensureAudioResume();
  }, { passive: false });

  // Touch support: simple tap to select/submit
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0];
      const x = (t.clientX - rect.left) * (canvas.width / rect.width);
      const y = (t.clientY - rect.top) * (canvas.height / rect.height);
      handleClick(x, y);
      ensureAudioResume();
    }
  });

  // Change knob value
  function changeKnob(idx, delta) {
    const old = current.knobs[idx];
    current.knobs[idx] = clamp(current.knobs[idx] + delta, 0, 20);
    attempts++;
    // Visual rotation target nudged by change magnitude
    const change = current.knobs[idx] - old;
    knobTargetAngles[idx] += change * 0.14;
    knobWobble[idx] = Math.min(1.2, Math.abs(change) * 0.8 + 0.2);
    playClick();
    updateAria(`Knob ${idx + 1} is now ${current.knobs[idx]}.`);
  }

  // Submit attempt
  function submitAttempt() {
    attempts++;
    const sum = current.knobs.reduce((a, b) => a + b, 0);
    if (sum === current.target) {
      solvedCount++;
      triggerWinEffect();
      playCorrect();
      updateAria(`Good job! You fixed the machine. Level ${level + 1} complete.`);
      // Move to next after short delay
      setTimeout(() => {
        if (level + 1 < puzzles.length) {
          startLevel(level + 1);
        } else {
          winGame();
        }
      }, 900);
    } else {
      playIncorrect();
      updateAria(`Not quite. The total is ${sum}. Try again.`);
    }
  }

  function winGame() {
    updateAria(`All machines fixed! You completed all ${puzzles.length} levels. Press R to play again.`);
    // show confetti-like wacky gears animation and reset option
    // reset after a beat
    setTimeout(() => {
      startLevel(0);
      solvedCount = 0;
    }, 3000);
  }

  // Trigger win particle burst
  function triggerWinEffect() {
    winParticles = [];
    winTimer = 80;
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2 - 20;
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.6 + Math.random() * 2.4;
      const life = 40 + Math.floor(Math.random() * 40);
      winParticles.push({
        x: cx + (Math.random() - 0.5) * 60,
        y: cy + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        size: 6 + Math.random() * 10,
        life,
        age: 0,
        hue: 180 + Math.floor(Math.random() * 80)
      });
    }
  }

  // Click handling: determine which part was clicked
  function handleClick(x, y) {
    // Knobs area positions
    const knobPositions = [
      { x: 180, y: 260 },
      { x: 360, y: 240 },
      { x: 540, y: 260 }
    ];
    for (let i = 0; i < knobPositions.length; i++) {
      const k = knobPositions[i];
      const dx = x - k.x;
      const dy = y - k.y;
      if (Math.hypot(dx, dy) < 60) {
        selectedKnob = i;
        playClick();
        updateAria(`Knob ${i + 1} selected, value ${current.knobs[i]}.`);
        return true;
      }
    }
    // Submit button
    if (x >= 600 && x <= 690 && y >= 380 && y <= 440) {
      submitAttempt();
      return true;
    }
    // Mute toggle (top-right tiny speaker)
    if (x >= 680 && x <= 708 && y >= 8 && y <= 36) {
      toggleAudio();
      return true;
    }
    // Hint bubble (top-left)
    if (x >= 8 && x <= 88 && y >= 8 && y <= 48) {
      showHint = !showHint;
      updateAria(showHint ? 'Hint shown.' : 'Hint hidden.');
      return true;
    }
    return false;
  }

  // Audio: Web Audio API setup and functions
  function initAudio() {
    if (audioContext) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        lastAudioError = new Error('Web Audio API not supported in this browser.');
        audioOk = false;
        console.warn(lastAudioError.message);
        return;
      }
      audioContext = new AC();

      // master gain (global)
      masterGain = audioContext.createGain();
      masterGain.gain.value = audioEnabled ? 0.42 : 0.0; // subdued background
      masterGain.connect(audioContext.destination);

      // Ambient gentle pad: two detuned oscillators through mellow filter
      const padGain = audioContext.createGain();
      padGain.gain.value = 0.08;
      const padFilter = audioContext.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 900;
      padFilter.Q.value = 0.6;

      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.value = 110;
      osc2.frequency.value = 112.5; // slight detune
      osc1.detune.value = -6;
      osc2.detune.value = 6;

      osc1.connect(padGain);
      osc2.connect(padGain);
      padGain.connect(padFilter);
      padFilter.connect(masterGain);

      // gentle LFO modulating filter for life
      const lfo = audioContext.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.04;
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 380;
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      // Motor hum for conveyor: subtle repeating thump via gated oscillator
      const motorOsc = audioContext.createOscillator();
      motorOsc.type = 'sawtooth';
      motorOsc.frequency.value = 52;
      const motorGain = audioContext.createGain();
      motorGain.gain.value = 0.012;
      motorOsc.connect(motorGain);
      motorGain.connect(masterGain);

      // Start nodes
      try {
        osc1.start();
        osc2.start();
        lfo.start();
        motorOsc.start();
      } catch (err) {
        // Some browsers may prevent auto-start until resumed; that's fine.
      }

      bgNodes = {
        pad: { osc1, osc2, padGain, padFilter },
        lfo,
        motor: { motorOsc, motorGain }
      };

      audioOk = true;
      lastAudioError = null;
    } catch (err) {
      lastAudioError = err;
      audioOk = false;
      console.error('Audio initialization failed:', err);
    }
  }

  // Ensure audio is resumed on user gesture according to browser policies
  function ensureAudioResume() {
    audioAllowed = true;
    if (!audioContext) {
      try {
        initAudio();
      } catch (e) {
        // error handled in initAudio
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        console.warn('Audio resume failed:', err);
      }).then(() => {
        // smooth fade in
        try {
          if (masterGain) {
            masterGain.gain.cancelScheduledValues(audioContext.currentTime);
            masterGain.gain.setTargetAtTime(audioEnabled ? 0.42 : 0.0, audioContext.currentTime, 0.05);
          }
        } catch (e) { /* ignore */ }
      });
    }
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (masterGain && audioContext) {
      try {
        masterGain.gain.setTargetAtTime(audioEnabled ? 0.42 : 0.0, audioContext.currentTime, 0.02);
      } catch (e) { /* ignore */ }
    }
    updateAria(audioEnabled ? 'Sound on.' : 'Sound muted.');
    playClick();
  }

  // Play short click sound for UI interactions using quick descending oscillator sweep
  function playClick() {
    if (!audioEnabled) return;
    try {
      if (!audioContext) initAudio();
      if (!audioOk) return;
      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      const f = audioContext.createBiquadFilter();
      o.type = 'square';
      o.frequency.value = 1500;
      f.type = 'highpass';
      f.frequency.value = 600;
      g.gain.value = 0.0001;
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      // sweep down quickly
      o.frequency.setValueAtTime(1800, now);
      o.frequency.exponentialRampToValueAtTime(650, now + 0.08);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.start(now);
      o.stop(now + 0.14);
    } catch (err) {
      console.warn('playClick error', err);
    }
  }

  // Play success melody: gentle arpeggio with warm filters
  function playCorrect() {
    if (!audioEnabled) return;
    try {
      if (!audioContext) initAudio();
      if (!audioOk) return;
      const now = audioContext.currentTime;
      const base = 440; // A4 as reference
      const freqs = [base * 2, base * 2.5, base * 3];
      freqs.forEach((freq, i) => {
        const o = audioContext.createOscillator();
        const g = audioContext.createGain();
        const f = audioContext.createBiquadFilter();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = freq;
        f.type = 'lowpass';
        f.frequency.value = 1200;
        g.gain.value = 0.0001;
        o.connect(f);
        f.connect(g);
        g.connect(masterGain);
        const start = now + i * 0.12;
        const end = start + 0.24;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        o.start(start);
        o.stop(end + 0.02);
      });
      // a little brighter chime tail
      const o2 = audioContext.createOscillator();
      const g2 = audioContext.createGain();
      o2.type = 'sine';
      o2.frequency.value = base * 4.5;
      o2.connect(g2);
      g2.connect(masterGain);
      g2.gain.setValueAtTime(0.0001, now + 0.36);
      g2.gain.exponentialRampToValueAtTime(0.06, now + 0.38);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      o2.start(now + 0.36);
      o2.stop(now + 0.92);
    } catch (err) {
      console.warn('playCorrect error', err);
    }
  }

  // Play incorrect buzzer: softer, descending triad
  function playIncorrect() {
    if (!audioEnabled) return;
    try {
      if (!audioContext) initAudio();
      if (!audioOk) return;
      const now = audioContext.currentTime;
      const base = 280;
      for (let i = 0; i < 3; i++) {
        const o = audioContext.createOscillator();
        const g = audioContext.createGain();
        const f = audioContext.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = base - i * 40;
        f.type = 'lowpass';
        f.frequency.value = 1200;
        g.gain.value = 0.0001;
        o.connect(f);
        f.connect(g);
        g.connect(masterGain);
        const start = now + i * 0.06;
        const end = start + 0.16;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        o.start(start);
        o.stop(end + 0.02);
      }
    } catch (err) {
      console.warn('playIncorrect error', err);
    }
  }

  // Fallback if audio cannot be initialized
  if (!audioContext) {
    try {
      initAudio();
    } catch (e) { /* handled above */ }
  }

  // Drawing helpers
  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // Colors and palette (calming, wacky)
  const palette = {
    bg: '#F5FBFF',
    panel: '#E6F4FA',
    accent: '#6BB1C9',
    knob: '#F6E2B8',
    knob2: '#D7EDE8',
    text: '#14323A',
    highlight: '#FFB84D',
    wrong: '#FF6B6B',
    correct: '#61D69C',
    gentle: '#C3E7F6',
    shadow: 'rgba(8,20,24,0.12)'
  };

  // Drawing the full scene each frame
  function draw() {
    frame++;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background gradient (soft sky + subtle radial center)
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, palette.bg);
    g.addColorStop(1, '#ECF7FF');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Gentle floating cloud shapes (soft parallax)
    drawSoftClouds();

    // Soft floating gears in background (wacky, faint)
    drawGearsBackground();

    // Large machine body with subtle metallic sheen
    drawMachineBody();

    // Wacky antenna and expressive eyes
    drawAntenna();
    drawGooglyEyes();

    // Display panel with target (pulsing)
    drawDisplay();

    // Knobs (with rotations and wobble)
    drawKnobs();

    // Conveyor belt and output (animated)
    drawConveyor();

    // Buttons: submit and hint and mute
    drawControls();

    // Instruction text
    drawInstructions();

    // Tiny debug / audio status
    drawAudioIndicator();

    // Possibly draw hint bubble
    if (showHint) drawHint();

    // Win particles
    updateAndDrawWinParticles();

    // Update knob animations smoothing
    updateKnobAnimations();
  }

  // Background soft cloud shapes
  function drawSoftClouds() {
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const sx = (i * 137 + frame * (0.12 + (i % 2) * 0.03)) % (WIDTH + 180) - 90;
      const sy = 36 + (i % 3) * 18 + Math.sin((frame + i * 20) * 0.03) * 8;
      const w = 220 + (i % 3) * 40;
      const h = 48 + (i % 2) * 16;
      const alpha = 0.07 + (i % 3) * 0.02;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, w * 0.6, h * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + 40, sy + 6, w * 0.5, h * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Background gears animation (subtle)
  function drawGearsBackground() {
    const baseY = 410;
    for (let i = 0; i < 6; i++) {
      const x = 40 + i * 120 + Math.sin((frame + i * 7) * 0.02) * 6;
      const y = baseY + Math.cos((frame + i * 13) * 0.01) * 4;
      const r = 26 + (i % 2 ? 6 : 0);
      drawGear(x, y, r, (frame * 0.6 + i * 6) * (i % 2 ? -0.018 : 0.018), 0.1);
    }
  }

  function drawGear(cx, cy, radius, rotation, alpha = 0.06) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    // Soft gear shadow
    ctx.beginPath();
    ctx.fillStyle = `rgba(12,30,40,${alpha})`;
    ctx.arc(6, 6, radius + 6, 0, Math.PI * 2);
    ctx.fill();
    // Gear body
    ctx.fillStyle = palette.gentle;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    // Teeth (as small rectangles)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = Math.cos(a) * (radius + 8);
      const y = Math.sin(a) * (radius + 8);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(230,240,245,0.9)';
      ctx.fillRect(-4, -6, 8, 12);
      ctx.restore();
    }
    // center hole
    ctx.fillStyle = '#F7FEFF';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMachineBody() {
    ctx.save();
    // Outer panel
    const x = 80,
      y = 60,
      w = 560,
      h = 300,
      r = 18;
    // subtle metallic gradient
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#F3FBFF');
    grad.addColorStop(0.6, '#E6F5FA');
    grad.addColorStop(1, '#DFF3FA');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, x, y, w, h, r);

    // subtle inner inset
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    drawRoundedRect(ctx, x + 12, y + 12, w - 24, h - 24, r - 6);

    // soft drop shadow under body
    ctx.fillStyle = palette.shadow;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 12, w * 0.36, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawAntenna() {
    ctx.save();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(600, 90);
    ctx.lineTo(648, 34 + Math.sin(frame * 0.06) * 6);
    ctx.stroke();
    // top bulb glow
    const bulbX = 648;
    const bulbY = 34 + Math.sin(frame * 0.06) * 6;
    const pulse = 0.6 + Math.abs(Math.sin(frame * 0.1)) * 0.4;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,184,77,${0.9 * pulse})`;
    ctx.arc(bulbX, bulbY, 12 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#FFD692';
    ctx.arc(bulbX, bulbY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGooglyEyes() {
    // two eyes on machine - expressive and following output
    const left = { x: 240, y: 120 };
    const right = { x: 320, y: 118 };
    // compute a lookAt offset based on output closeness
    const sum = current.knobs.reduce((a, b) => a + b, 0);
    const diff = clamp((current.target - sum) / 10, -1, 1);
    drawEye(left.x, left.y, 26, 0.6 + Math.sin(frame * 0.06) * 0.6 + diff * 0.6);
    drawEye(right.x, right.y, 26, 0.4 + Math.cos(frame * 0.05) * 0.6 + diff * 0.6);
  }

  function drawEye(x, y, r, offset) {
    ctx.save();
    // white
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    // iris ring with soft gradient
    const ig = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    ig.addColorStop(0, '#76BAC9');
    ig.addColorStop(1, '#2E6A7A');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(x + offset * 6, y + offset * 1.6, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x + offset * 6 - 3, y - 4, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    // small pupil shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.arc(x + offset * 6, y + 3, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDisplay() {
    // machine numeric display for target with subtle glow when nearing target
    ctx.save();
    const displayX = 230,
      displayY = 100,
      displayW = 260,
      displayH = 60;
    // pulse based on closeness
    const sum = current.knobs.reduce((a, b) => a + b, 0);
    const closeness = 1 - clamp(Math.abs(current.target - sum) / Math.max(1, current.target + 3), 0, 1);
    const pulse = 0.92 + Math.sin(frame * 0.12) * 0.02 + closeness * 0.06;

    // dark bezel
    ctx.fillStyle = '#0B2B36';
    drawRoundedRect(ctx, displayX, displayY, displayW, displayH, 8);

    // inner glass with subtle shine
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = palette.accent;
    ctx.fillRect(displayX + 10, displayY + 10, displayW - 20, displayH - 20);
    ctx.restore();

    // digital text
    ctx.fillStyle = '#052A30';
    ctx.font = '700 30px "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`TARGET: ${current.target}`, displayX + displayW / 2, displayY + 37);

    // small indicator light showing status (green if perfect)
    const isGood = sum === current.target;
    ctx.fillStyle = isGood ? palette.correct : '#F4F7F8';
    ctx.beginPath();
    ctx.arc(displayX + displayW - 18, displayY + 18, 8, 0, Math.PI * 2);
    ctx.fill();
    if (isGood) {
      ctx.fillStyle = 'rgba(95,222,150,0.12)';
      ctx.beginPath();
      ctx.arc(displayX + displayW - 18, displayY + 18, 16 + Math.sin(frame * 0.15) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawKnobs() {
    const positions = [
      { x: 180, y: 260 },
      { x: 360, y: 240 },
      { x: 540, y: 260 }
    ];
    for (let i = 0; i < 3; i++) {
      const p = positions[i];
      drawSingleKnob(p.x, p.y, current.knobs[i], i === selectedKnob, knobAngles[i], knobWobble[i]);
    }
  }

  function drawSingleKnob(x, y, value, selected, angle, wobble) {
    ctx.save();

    // base shadow
    ctx.fillStyle = palette.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 18, 72, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    // base plate
    ctx.fillStyle = selected ? '#FFF9F0' : '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 72, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    // knob circle with subtle radial gradient
    const kg = ctx.createRadialGradient(x - 12, y - 8, 6, x, y, 60);
    kg.addColorStop(0, '#FFF7EB');
    kg.addColorStop(1, '#F3DFAE');
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(x, y, 50, 0, Math.PI * 2);
    ctx.fill();

    // slight inner shadow
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.beginPath();
    ctx.arc(x, y + 6, 46, 0, Math.PI * 2);
    ctx.fill();

    // knob pointer which rotates according to angle
    ctx.save();
    ctx.translate(x, y);
    // wobble based on recent change
    const wob = Math.sin(frame * 0.25) * wobble * 2;
    ctx.rotate(angle + wob);
    // pointer shape
    ctx.fillStyle = '#8EAEC0';
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(8, -20);
    ctx.lineTo(-8, -20);
    ctx.closePath();
    ctx.fill();
    // small screw at center
    ctx.fillStyle = '#C9DDE6';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // number label with shadow
    ctx.fillStyle = '#0E3440';
    ctx.font = '700 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(value), x, y + 12);

    // highlight ring if selected
    if (selected) {
      ctx.strokeStyle = palette.highlight;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, 58, 0, Math.PI * 2);
      ctx.stroke();
      // soft aura
      ctx.fillStyle = 'rgba(255,184,77,0.08)';
      ctx.beginPath();
      ctx.arc(x, y, 72, 0, Math.PI * 2);
      ctx.fill();
    }

    // small +/- marks
    ctx.fillStyle = '#658FA1';
    ctx.font = '13px sans-serif';
    ctx.fillText('+', x + 38, y - 8);
    ctx.fillText('−', x - 38, y - 8);

    ctx.restore();
  }

  function drawConveyor() {
    ctx.save();
    // belt track
    const bx = 120,
      by = 330,
      bw = 480,
      bh = 34;
    // belt base
    ctx.fillStyle = '#EAF8FF';
    ctx.fillRect(bx, by, bw, bh);

    // moving patterned lines for movement illusion
    ctx.strokeStyle = '#D8EEF6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const x = bx + ((frame * 1.6 + i * 36) % bw);
      ctx.moveTo(x, by + 4);
      ctx.lineTo(x + 16, by + bh - 4);
    }
    ctx.stroke();

    // output window with color indicating correctness
    const sum = current.knobs.reduce((a, b) => a + b, 0);
    ctx.fillStyle = sum === current.target ? palette.correct : '#E8EEF1';
    drawRoundedRect(ctx, 300, by, 120, bh, 6);

    ctx.fillStyle = palette.text;
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`OUTPUT: ${sum}`, 360, by + 23);

    // moving screws/wacky items on conveyor (animated bobbing)
    for (let i = 0; i < 8; i++) {
      const x = bx + ((frame * 1.2 + i * 40) % bw);
      const bob = Math.sin((frame + i * 7) * 0.06) * 4;
      ctx.fillStyle = i % 2 ? '#D7EFEE' : '#D8EFF9';
      ctx.beginPath();
      // simple gear-like circles
      ctx.arc(x, by + bh / 2 + bob, 8 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
      // center hole
      ctx.fillStyle = 'rgba(20,45,55,0.08)';
      ctx.beginPath();
      ctx.arc(x, by + bh / 2 + bob, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawControls() {
    ctx.save();
    // Submit button with subtle press shadow
    const sbx = 600,
      sby = 380,
      sbw = 90,
      sbh = 56;
    ctx.fillStyle = '#FFE7C0';
    drawRoundedRect(ctx, sbx, sby, sbw, sbh, 10);
    // inner label
    ctx.fillStyle = palette.text;
    ctx.font = '700 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIX IT!', sbx + sbw / 2, sby + 36);

    // Hint bubble (top-left)
    ctx.fillStyle = showHint ? palette.highlight : palette.panel;
    drawRoundedRect(ctx, 8, 8, 80, 40, 8);
    ctx.fillStyle = palette.text;
    ctx.font = '600 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Hint', 20, 34);
    // small hint icon
    ctx.beginPath();
    ctx.fillStyle = '#FFF';
    ctx.arc(66, 20, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14323A';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('?', 62, 26);

    // Mute icon top-right (drawn as small speaker)
    ctx.fillStyle = palette.panel;
    drawRoundedRect(ctx, 680, 8, 28, 28, 6);
    ctx.fillStyle = '#14323A';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(audioEnabled ? '🔊' : '🔈', 694, 26);
    ctx.restore();
  }

  function drawInstructions() {
    ctx.save();
    ctx.fillStyle = '#0E3942';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Pick a knob (←→), change value (↑↓), press Enter to submit. Press M to toggle sound. H for hint.', 20, 460);
    ctx.restore();
  }

  function drawAudioIndicator() {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    if (!audioOk) {
      ctx.fillStyle = palette.wrong;
      ctx.fillText('Audio unavailable', 520, 32);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(512, 12, 196, 26);
    } else {
      ctx.fillStyle = audioEnabled ? palette.correct : palette.wrong;
      ctx.fillText(audioEnabled ? 'Sound on' : 'Muted', 540, 32);
    }
    ctx.restore();
  }

  function drawHint() {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = palette.panel;
    drawRoundedRect(ctx, 80, 360, 440, 100, 12);
    ctx.fillStyle = palette.text;
    ctx.font = '600 15px sans-serif';
    ctx.textAlign = 'left';
    const sum = current.knobs.reduce((a, b) => a + b, 0);
    const diff = current.target - sum;
    let hintText = '';
    if (Math.abs(diff) <= 2) {
      hintText = `You're close! Change one knob by ${diff >= 0 ? '+' + diff : diff}.`;
    } else {
      hintText = `Try to reach ${current.target} by adjusting the knobs — small changes add up.`;
    }
    ctx.fillText(hintText, 96, 398);
    ctx.restore();
  }

  // Update and draw win particles
  function updateAndDrawWinParticles() {
    if (!winParticles || winParticles.length === 0) return;
    ctx.save();
    for (let i = winParticles.length - 1; i >= 0; i--) {
      const p = winParticles[i];
      p.age++;
      p.vy += 0.08; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      const lifeRatio = 1 - p.age / p.life;
      if (lifeRatio <= 0) {
        winParticles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // draw a small gear-like shape as colored particle
      ctx.fillStyle = `hsl(${p.hue}, 70%, ${50 + lifeRatio * 10}%)`;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * lifeRatio * 0.9, 0, Math.PI * 2);
      ctx.fill();
      // teeth
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let t = 0; t < 6; t++) {
        const a = (t / 6) * Math.PI * 2;
        const tx = Math.cos(a) * (p.size * 0.9);
        const ty = Math.sin(a) * (p.size * 0.9);
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1.6, p.size * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // Smoothly update knob angles towards targets and decay wobble
  function updateKnobAnimations() {
    for (let i = 0; i < 3; i++) {
      const t = knobTargetAngles[i];
      // simple easing
      knobAngles[i] += (t - knobAngles[i]) * 0.12;
      // wobble decay
      knobWobble[i] *= 0.92;
      // gently decay target to avoid runaway
      knobTargetAngles[i] *= 0.9995;
    }
  }

  // Main animation loop
  function loop() {
    if (!running) return;
    draw();
    frame++;
    requestAnimationFrame(loop);
  }

  // Start loop
  loop();

  // Initialize audio on first user gesture for browsers requiring interaction
  function initAutoAudioOnGesture() {
    const resumeHandler = () => {
      ensureAudioResume();
      // Try to fade-in background
      if (audioContext && masterGain) {
        try {
          masterGain.gain.setTargetAtTime(audioEnabled ? 0.42 : 0.0, audioContext.currentTime, 0.02);
        } catch (e) { /* ignore */ }
      }
      window.removeEventListener('mousedown', resumeHandler);
      window.removeEventListener('keydown', resumeHandler);
      window.removeEventListener('touchstart', resumeHandler);
    };
    window.addEventListener('mousedown', resumeHandler, { once: true });
    window.addEventListener('keydown', resumeHandler, { once: true });
    window.addEventListener('touchstart', resumeHandler, { once: true });
  }

  initAutoAudioOnGesture();

  // Expose some debug in container (non-intrusive) for errors
  const statusBox = document.createElement('div');
  statusBox.style.position = 'absolute';
  statusBox.style.right = '6px';
  statusBox.style.bottom = '6px';
  statusBox.style.background = 'rgba(255,255,255,0.6)';
  statusBox.style.borderRadius = '6px';
  statusBox.style.padding = '6px 8px';
  statusBox.style.fontSize = '11px';
  statusBox.style.color = '#234';
  statusBox.style.pointerEvents = 'none';
  statusBox.textContent = 'Wacky Machines';
  container.appendChild(statusBox);

  // Periodically update status text and handle audio errors
  setInterval(() => {
    let s = `Level ${level + 1}/${puzzles.length}`;
    if (!audioOk && lastAudioError) {
      s += ' • Audio error';
    }
    statusBox.textContent = s;
  }, 1100);

  // Ensure focus for keyboard controls
  canvas.addEventListener('focus', () => {
    canvas.style.boxShadow = '0 0 0 4px rgba(120,180,200,0.12)';
  });
  canvas.addEventListener('blur', () => {
    canvas.style.boxShadow = 'none';
  });
  // Auto-focus the canvas for convenience
  setTimeout(() => {
    try { canvas.focus(); } catch (e) { /* ignore */ }
  }, 300);

  // Clean up on unload
  window.addEventListener('unload', () => {
    running = false;
    try {
      if (audioContext) {
        audioContext.close();
      }
    } catch (e) { /* ignore */ }
  });

  // Expose some helpful messages to ariaLive at start
  updateAria(
    'Welcome to Wacky Machines. Use left and right arrows to select a knob, up and down to change its number, and Enter to submit. Press M to toggle sound.'
  );

})();