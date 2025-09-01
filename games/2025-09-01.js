(function () {
  // Enhanced Machine Math — Visual & Audio polish only
  // Renders into the element with id "game-of-the-day-stage"
  // All visuals drawn with canvas; all sounds generated with Web Audio API oscillators/filters.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const container = document.getElementById('game-of-the-day-stage');

  if (!container) {
    console.error('Game container element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear any existing content inside the container
  container.innerHTML = '';

  // Offscreen but accessible instructions element for screen readers
  const srInstructions = document.createElement('div');
  srInstructions.setAttribute('role', 'status');
  srInstructions.setAttribute('aria-live', 'polite');
  srInstructions.style.position = 'absolute';
  srInstructions.style.left = '-9999px';
  srInstructions.style.width = '1px';
  srInstructions.style.height = '1px';
  srInstructions.style.overflow = 'hidden';
  srInstructions.textContent =
    'Machine Math game loaded. Use mouse or keyboard. Arrow keys to navigate, Enter to place, Backspace to remove, M to toggle sound.';
  container.appendChild(srInstructions);

  // Create canvas (exact size required)
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Machine Math game canvas. Visual math puzzles to power a machine.'
  );
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Visible instructions (non-intrusive)
  const visibleInstructions = document.createElement('div');
  visibleInstructions.style.fontFamily = 'Arial, sans-serif';
  visibleInstructions.style.fontSize = '13px';
  visibleInstructions.style.color = '#234';
  visibleInstructions.style.marginTop = '8px';
  visibleInstructions.textContent =
    'Instructions: Solve the machine puzzles by placing the correct numbered gears into the slots. Use mouse drag or keyboard. Left/Right to pick a gear, Up/Down to pick a slot, Enter to place, Backspace to remove, M to mute.';
  container.appendChild(visibleInstructions);

  // Audio setup
  let audioCtx = null;
  let audioAllowed = false;
  let ambientGain = null;
  let masterGain = null;
  let ambientNodes = [];
  let gearSpinGain = null;
  let gearSpinOsc = null;
  let soundOn = false;

  function initAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        throw new Error('Web Audio API not supported.');
      }
      audioCtx = new Ctx();
      // Master gain controls overall level; keep modest to avoid startling volumes
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(audioCtx.destination);

      // Gentle ambient pad using two detuned oscillators + lowpass filter
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0.02; // subtle
      ambientGain.connect(masterGain);

      // Ambient oscillator 1
      const a1 = audioCtx.createOscillator();
      a1.type = 'sine';
      a1.frequency.value = 110;
      // Ambient oscillator 2 (detuned)
      const a2 = audioCtx.createOscillator();
      a2.type = 'triangle';
      a2.frequency.value = 112;

      const ambientFilter = audioCtx.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 700;
      ambientFilter.Q.value = 0.9;

      a1.connect(ambientFilter);
      a2.connect(ambientFilter);
      ambientFilter.connect(ambientGain);

      // Slow LFO to modulate filter cutoff for breathing effect
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 220; // amount to move cutoff
      lfo.connect(lfoGain);
      lfoGain.connect(ambientFilter.frequency);

      // Start nodes safely
      try {
        a1.start();
        a2.start();
        lfo.start();
      } catch (e) {
        // Some browsers may throw if already started; ignore but log
        console.warn('Ambient start warning:', e);
      }

      ambientNodes = [a1, a2, ambientFilter, lfo, lfoGain];
      audioAllowed = true;
      soundOn = true;
    } catch (e) {
      console.warn('Audio initialization failed:', e);
      audioCtx = null;
      audioAllowed = false;
      soundOn = false;
    }
  }

  // Try to initialize audio immediately; many browsers require user gesture to resume
  initAudio();

  function tryResumeAudio() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx
        .resume()
        .then(() => {
          audioAllowed = true;
        })
        .catch((e) => {
          console.warn('Audio resume failed:', e);
          audioAllowed = false;
        });
    }
  }

  // Play short click (soft)
  function playClick() {
    if (!soundOn || !audioCtx) return;
    tryResumeAudio();
    try {
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'square';
      o.frequency.value = 720;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.connect(masterGain);
      o.connect(g);
      g.gain.linearRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.start(t);
      o.stop(t + 0.16);
    } catch (e) {
      console.warn('playClick error:', e);
    }
  }

  // Play incorrect (soft thud)
  function playIncorrect() {
    if (!soundOn || !audioCtx) return;
    tryResumeAudio();
    try {
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 160;
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 900;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.connect(masterGain);
      o.connect(filt);
      filt.connect(g);
      g.gain.linearRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.start(t);
      o.stop(t + 0.5);
    } catch (e) {
      console.warn('playIncorrect error:', e);
    }
  }

  // Play correct (soft bell sequence)
  function playCorrect() {
    if (!soundOn || !audioCtx) return;
    tryResumeAudio();
    try {
      const t = audioCtx.currentTime;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.connect(masterGain);
      // envelope
      g.gain.linearRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);

      // three small harmonics
      const notes = [660, 880, 1100];
      notes.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = freq;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000 - i * 400;
        o.connect(filter);
        filter.connect(g);
        o.start(t + i * 0.03);
        o.stop(t + 0.7 + i * 0.03);
      });
    } catch (e) {
      console.warn('playCorrect error:', e);
    }
  }

  // Gear spin sound: start on drag, subtle hum; stop smoothly
  function startGearSpin() {
    if (!soundOn || !audioCtx) return;
    if (gearSpinOsc) return; // already playing
    tryResumeAudio();
    try {
      gearSpinOsc = audioCtx.createOscillator();
      gearSpinOsc.type = 'sine';
      gearSpinOsc.frequency.value = 220;
      const spinFilter = audioCtx.createBiquadFilter();
      spinFilter.type = 'bandpass';
      spinFilter.frequency.value = 600;
      spinFilter.Q.value = 1.2;
      gearSpinGain = audioCtx.createGain();
      gearSpinGain.gain.value = 0.0001;
      gearSpinOsc.connect(spinFilter);
      spinFilter.connect(gearSpinGain);
      gearSpinGain.connect(masterGain);
      gearSpinOsc.start();
      // ramp to comfortable level
      gearSpinGain.gain.linearRampToValueAtTime(0.03, audioCtx.currentTime + 0.06);
    } catch (e) {
      console.warn('startGearSpin error:', e);
      gearSpinOsc = null;
      gearSpinGain = null;
    }
  }

  function stopGearSpin() {
    if (!audioCtx || !gearSpinOsc || !gearSpinGain) return;
    try {
      const t = audioCtx.currentTime;
      gearSpinGain.gain.cancelScheduledValues(t);
      gearSpinGain.gain.setValueAtTime(gearSpinGain.gain.value, t);
      gearSpinGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      gearSpinOsc.stop(t + 0.22);
      // clear refs after a short delay to avoid exceptions if restarted quickly
      setTimeout(() => {
        gearSpinOsc = null;
        gearSpinGain = null;
      }, 300);
    } catch (e) {
      console.warn('stopGearSpin error:', e);
      gearSpinOsc = null;
      gearSpinGain = null;
    }
  }

  // Sound toggle
  function toggleSound() {
    soundOn = !soundOn;
    if (!audioCtx && soundOn) initAudio();
    if (ambientGain) ambientGain.gain.value = soundOn ? 0.02 : 0;
    if (masterGain) masterGain.gain.value = soundOn ? 0.85 : 0;
    srInstructions.textContent = soundOn ? 'Sound turned on.' : 'Sound muted.';
    playClick();
  }

  // Colors and visuals refined
  const colors = {
    bg: '#E7F0F6',
    machineBody: '#d9eef9',
    slot: '#f7fbff',
    gear: '#f1a7a0',
    gearAlt: '#f7df99',
    text: '#13324a',
    highlight: '#8fe3c6',
    shadow: 'rgba(0,0,0,0.08)',
    ok: '#2a9d8f',
    bad: '#e76f51',
    speaker: '#234',
    robotMain: '#7fb3d5',
    robotFace: '#fff',
    glass: '#cdebf9'
  };

  // Game state (mechanics unchanged)
  let levelIndex = 0;
  const MAX_LEVELS = 5;
  let levels = [];
  let running = true;
  let lastTime = 0;

  // Create particle systems for positive feedback (sparks) and confetti on victory
  let sparkParticles = [];
  let confettiParticles = [];
  let victory = false;

  // Generate levels (unchanged logic)
  function generateLevels() {
    const ops = [
      { type: 'add', range: [2, 10] },
      { type: 'sub', range: [1, 9] },
      { type: 'add', range: [5, 15] },
      { type: 'mul', range: [2, 6] },
      { type: 'mul', range: [2, 8] }
    ];
    levels = ops.slice(0, MAX_LEVELS).map((opDef, i) => {
      const slots = [];
      for (let s = 0; s < 3; s++) {
        let a, b, answer;
        if (opDef.type === 'add') {
          a = randInt(opDef.range[0], opDef.range[1]);
          b = randInt(0, opDef.range[1]);
          answer = a + b;
        } else if (opDef.type === 'sub') {
          a = randInt(opDef.range[0], opDef.range[1]);
          b = randInt(0, a);
          answer = a - b;
        } else if (opDef.type === 'mul') {
          a = randInt(opDef.range[0], opDef.range[1]);
          b = randInt(1, 5);
          answer = a * b;
        }
        const label = `${a} ${opSymbol(opDef.type)} ${b}`;
        slots.push({ label, answer, placed: null });
      }

      const correctAnswers = slots.map((s) => s.answer);
      const candidates = [...correctAnswers];
      while (candidates.length < 6) {
        const base = correctAnswers[randInt(0, correctAnswers.length - 1)];
        let distractor = base + (Math.random() < 0.5 ? -1 : 1) * randInt(1, 4);
        if (distractor < 0) distractor = base + randInt(2, 4);
        if (!candidates.includes(distractor)) candidates.push(distractor);
      }
      shuffleArray(candidates);

      return {
        type: opDef.type,
        slots,
        candidates
      };
    });
  }

  function opSymbol(type) {
    if (type === 'add') return '+';
    if (type === 'sub') return '−';
    if (type === 'mul') return '×';
    return '?';
  }

  // Utility
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  generateLevels();

  // UI positions
  const slotPositions = [
    { x: 180, y: 150 },
    { x: 360, y: 120 },
    { x: 540, y: 150 }
  ];

  const conveyorY = 360;
  const conveyorStartX = 80;
  const conveyorGap = 100;

  // Gear objects
  let gears = []; // {value, x, y, radius, placedSlotIndex, homeX, homeY, dragging, wobble, rotation, rotationSpeed}
  let selection = { gearIndex: 0, slotIndex: 0 };

  function loadLevel(index) {
    const lvl = levels[index];
    gears = [];
    const startX = conveyorStartX;
    lvl.candidates.forEach((val, i) => {
      const x = startX + i * conveyorGap;
      const y = conveyorY;
      gears.push({
        value: val,
        x,
        y,
        homeX: x,
        homeY: y,
        radius: 38,
        placedSlotIndex: null,
        dragging: false,
        wobble: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02
      });
    });
    lvl.slots.forEach((s) => {
      s.placed = null;
    });

    selection.gearIndex = 0;
    selection.slotIndex = 0;
    srInstructions.textContent = `Level ${index + 1} loaded. Solve three puzzles on the machine.`;
  }

  loadLevel(0);

  // Pointer handling
  let pointerDown = false;
  let dragGear = null;
  let dragOffset = { x: 0, y: 0 };

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return {
        x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
        y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height)
      };
    } else {
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
      };
    }
  }

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchend', onPointerUp);

  function onPointerDown(e) {
    e.preventDefault();
    tryResumeAudio();
    pointerDown = true;
    const pos = getPointerPos(e);
    for (let i = gears.length - 1; i >= 0; i--) {
      const g = gears[i];
      const dx = pos.x - g.x;
      const dy = pos.y - g.y;
      if (Math.sqrt(dx * dx + dy * dy) <= g.radius + 6) {
        dragGear = g;
        g.dragging = true;
        dragOffset.x = dx;
        dragOffset.y = dy;
        selection.gearIndex = i;
        playClick();
        // start spin sound while dragging
        startGearSpin();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return;
      }
    }
    const lvl = levels[levelIndex];
    for (let si = 0; si < lvl.slots.length; si++) {
      const posSlot = slotPositions[si];
      const sx = posSlot.x;
      const sy = posSlot.y;
      if (Math.abs(pos.x - sx) < 60 && Math.abs(pos.y - sy) < 60) {
        placeGearInSlot(selection.gearIndex, si);
        return;
      }
    }
  }

  function onPointerMove(e) {
    if (!pointerDown) return;
    const pos = getPointerPos(e);
    if (dragGear) {
      dragGear.x = pos.x - dragOffset.x;
      dragGear.y = pos.y - dragOffset.y;
      // while dragging, make rotation faster to feel interactive
      dragGear.rotation += 0.18;
    }
  }

  function onPointerUp(e) {
    if (!pointerDown) return;
    pointerDown = false;
    if (dragGear) {
      const gear = dragGear;
      dragGear.dragging = false;
      // stop gear spin audio
      stopGearSpin();
      let nearest = null;
      let nearestDist = Infinity;
      levels[levelIndex].slots.forEach((slot, si) => {
        const sp = slotPositions[si];
        const dx = gear.x - sp.x;
        const dy = gear.y - sp.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = si;
        }
      });
      if (nearest !== null && nearestDist < 80) {
        placeGearInSlot(gears.indexOf(gear), nearest);
      } else {
        animateReturn(gear);
      }
      dragGear = null;
    }
  }

  function animateReturn(gear) {
    const sx = gear.x;
    const sy = gear.y;
    const dx = gear.homeX - sx;
    const dy = gear.homeY - sy;
    const duration = 300;
    const start = performance.now();
    function step(ts) {
      const t = Math.min(1, (ts - start) / duration);
      const ease = easeOutCubic(t);
      gear.x = sx + dx * ease;
      gear.y = sy + dy * ease;
      gear.rotation += 0.04 * (1 - t);
      if (t < 1) requestAnimationFrame(step);
      else {
        gear.x = gear.homeX;
        gear.y = gear.homeY;
      }
    }
    requestAnimationFrame(step);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Place gear logic unchanged, but add visual/audio effects on correct/incorrect
  function placeGearInSlot(gearIndex, slotIndex) {
    if (gearIndex < 0 || gearIndex >= gears.length) return;
    const gear = gears[gearIndex];
    const lvl = levels[levelIndex];
    const slot = lvl.slots[slotIndex];

    if (slot.placed) {
      if (slot.placed === gear) {
        slot.placed.placedSlotIndex = null;
        slot.placed = null;
        playClick();
        return;
      } else {
        const existing = slot.placed;
        existing.placedSlotIndex = null;
        animateReturn(existing);
        slot.placed = null;
      }
    }

    if (gear.value === slot.answer) {
      gear.placedSlotIndex = slotIndex;
      // snap with short easing
      snapGearToSlot(gear, slotIndex);
      slot.placed = gear;
      playCorrect();
      srInstructions.textContent = `Correct! ${slot.label} = ${slot.answer}.`;
      // emit spark particles from the slot
      spawnSparks(slotPositions[slotIndex].x, slotPositions[slotIndex].y, colors.ok);
      checkLevelComplete();
    } else {
      playIncorrect();
      srInstructions.textContent = `Try again. ${gear.value} does not match ${slot.label}.`;
      // visual shake then return
      const startX = gear.x;
      const startY = gear.y;
      const duration = 420;
      const start = performance.now();
      function step(ts) {
        const t = (ts - start) / duration;
        if (t >= 1) {
          animateReturn(gear);
          return;
        }
        const shake = Math.sin(t * Math.PI * 8) * (1 - t) * 12;
        gear.x = startX + shake;
        gear.y = startY;
        gear.rotation += 0.12 * (1 - t);
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
  }

  function snapGearToSlot(gear, slotIndex) {
    const target = slotPositions[slotIndex];
    const sx = gear.x;
    const sy = gear.y;
    const dx = target.x - sx;
    const dy = target.y - sy;
    const duration = 260;
    const start = performance.now();
    const startRot = gear.rotation;
    function step(ts) {
      const t = Math.min(1, (ts - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      gear.x = sx + dx * ease;
      gear.y = sy + dy * ease;
      gear.rotation = startRot + (Math.PI * 0.25) * ease;
      if (t < 1) requestAnimationFrame(step);
      else {
        gear.x = target.x;
        gear.y = target.y;
      }
    }
    requestAnimationFrame(step);
  }

  function checkLevelComplete() {
    const lvl = levels[levelIndex];
    const allPlaced = lvl.slots.every((s) => s.placed !== null);
    if (allPlaced) {
      srInstructions.textContent = `Level ${levelIndex + 1} complete!`;
      playCorrect();
      setTimeout(() => {
        if (levelIndex < MAX_LEVELS - 1) {
          levelIndex++;
          loadLevel(levelIndex);
        } else {
          showVictory();
        }
      }, 900);
    }
  }

  // Visual spark particles for correct placement
  function spawnSparks(x, y, color) {
    for (let i = 0; i < 12; i++) {
      sparkParticles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 3 - 1,
        life: randInt(400, 900),
        size: randInt(2, 6),
        color,
        born: performance.now()
      });
    }
  }

  // Victory celebration (confetti) — unchanged behavior but softer colors/animation
  function showVictory() {
    victory = true;
    srInstructions.textContent = 'You fixed all the machines! Great job!';
    for (let i = 0; i < 80; i++) {
      confettiParticles.push({
        x: randInt(80, WIDTH - 80),
        y: randInt(-140, -10),
        vx: (Math.random() - 0.5) * 2,
        vy: randInt(1, 4),
        size: randInt(6, 12),
        color: [colors.highlight, colors.gear, colors.gearAlt, colors.ok][randInt(0, 3)],
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2
      });
    }
    if (soundOn && audioCtx) {
      tryResumeAudio();
      const t = audioCtx.currentTime;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.connect(masterGain);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      const freqs = [440, 660, 880, 1100];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.connect(g);
        o.start(t + i * 0.04);
        o.stop(t + 1.2);
      });
    }
  }

  // Keyboard controls (unchanged mechanics)
  window.addEventListener('keydown', (e) => {
    tryResumeAudio();
    if (!running) return;
    const lvl = levels[levelIndex];
    const gearCount = gears.length;
    switch (e.key) {
      case 'ArrowLeft':
        selection.gearIndex = (selection.gearIndex - 1 + gearCount) % gearCount;
        playClick();
        e.preventDefault();
        break;
      case 'ArrowRight':
        selection.gearIndex = (selection.gearIndex + 1) % gearCount;
        playClick();
        e.preventDefault();
        break;
      case 'ArrowUp':
        selection.slotIndex = (selection.slotIndex - 1 + lvl.slots.length) % lvl.slots.length;
        playClick();
        e.preventDefault();
        break;
      case 'ArrowDown':
        selection.slotIndex = (selection.slotIndex + 1) % lvl.slots.length;
        playClick();
        e.preventDefault();
        break;
      case 'Enter':
      case ' ':
        placeGearInSlot(selection.gearIndex, selection.slotIndex);
        e.preventDefault();
        break;
      case 'Backspace':
      case 'Delete':
        const s = lvl.slots[selection.slotIndex];
        if (s.placed) {
          s.placed.placedSlotIndex = null;
          s.placed = null;
          playClick();
        } else {
          playIncorrect();
        }
        e.preventDefault();
        break;
      case 'm':
      case 'M':
        toggleSound();
        e.preventDefault();
        break;
      default:
        if (/^\d$/.test(e.key)) {
          const num = parseInt(e.key, 10);
          const gearIdx = gears.findIndex((g) => g.value === num && !g.placedSlotIndex);
          if (gearIdx >= 0) {
            placeGearInSlot(gearIdx, selection.slotIndex);
          } else {
            playIncorrect();
          }
        }
        break;
    }
  });

  // Drawing functions — heavily enhanced visuals but all canvas-based
  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawBackground();
    drawMachineBody();
    drawRobot(72, 300, 0.9);
    drawSlotsAndGears();
    drawConveyorAndGears();
    drawUI();

    // update and draw spark particles
    updateAndDrawSparks();

    if (victory) updateAndDrawConfetti();
  }

  function drawBackground() {
    // subtle vertical gradient with focal radial highlight
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#F7FCFF');
    g.addColorStop(1, colors.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // radial vignette to focus on center area
    const rg = ctx.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2 - 40,
      40,
      WIDTH / 2,
      HEIGHT / 2,
      700
    );
    rg.addColorStop(0, 'rgba(255,255,255,0.05)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Soft decorative cogs with gentle rotation
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 6; i++) {
      const baseX = 80 + i * 110;
      const x = baseX + Math.sin(performance.now() * 0.0006 + i) * 8;
      const y = 60 + (i % 3) * 30;
      drawGearShape(
        ctx,
        x,
        y,
        26,
        8,
        '#d5eaf6',
        '#cfeaf8',
        0.9,
        Math.sin(performance.now() * 0.001 + i) * 0.6
      );
    }
    ctx.restore();
  }

  function drawMachineBody() {
    // Main machine compartment with subtle inner gradient and soft shadow
    const x = 60,
      y = 80,
      w = WIDTH - 120,
      h = 200,
      r = 18;
    ctx.save();
    // outer shadow
    ctx.fillStyle = colors.shadow;
    roundRect(ctx, x + 6, y + 12, w, h, r);
    ctx.fill();

    // body gradient
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#e6f6ff');
    g.addColorStop(1, colors.machineBody);
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // inner panel lines
    ctx.strokeStyle = '#c6eaf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 80);
    ctx.lineTo(x + w - 20, y + 80);
    ctx.stroke();

    // pipes
    ctx.strokeStyle = '#bfe0f2';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(90, 160);
    ctx.lineTo(160, 160);
    ctx.lineTo(160, 220);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(WIDTH - 90, 160);
    ctx.lineTo(WIDTH - 160, 160);
    ctx.lineTo(WIDTH - 160, 220);
    ctx.stroke();

    // title with softer styling
    ctx.fillStyle = colors.text;
    ctx.font = '700 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('WHIMSY MACHINE WORKS', WIDTH / 2, 110);
    ctx.restore();
  }

  // Friendly robot mascot drawn with simple shapes
  function drawRobot(cx, cy, scale = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // bobbing animation
    const bob = Math.sin(performance.now() * 0.002) * 6;
    ctx.translate(0, bob);

    // body base
    ctx.fillStyle = colors.robotMain;
    roundRect(ctx, -50, -70, 100, 110, 12);
    ctx.fill();

    // chest window
    ctx.fillStyle = colors.glass;
    roundRect(ctx, -30, -40, 60, 40, 8);
    ctx.fill();

    // eye / face panel
    ctx.fillStyle = colors.robotFace;
    ctx.beginPath();
    ctx.arc(0, -44, 18, 0, Math.PI * 2);
    ctx.fill();

    // friendly eyes
    ctx.fillStyle = '#234';
    ctx.beginPath();
    ctx.arc(-6, -48, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -48, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // antenna
    ctx.strokeStyle = '#9ecbe3';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(22, -78);
    ctx.lineTo(36, -98);
    ctx.stroke();
    ctx.fillStyle = '#ffd86b';
    ctx.beginPath();
    ctx.arc(36, -98, 6, 0, Math.PI * 2);
    ctx.fill();

    // left arm (wrench stylized)
    ctx.strokeStyle = '#a3cbe0';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-50, -10);
    ctx.lineTo(-88, 6);
    ctx.stroke();
    ctx.fillStyle = '#a3cbe0';
    ctx.beginPath();
    ctx.arc(-92, 6, 8, 0, Math.PI * 2);
    ctx.fill();

    // right arm holding a tiny gear (animated rotation)
    const rot = Math.sin(performance.now() * 0.003) * 0.8;
    ctx.save();
    ctx.translate(48, -6);
    ctx.rotate(rot);
    drawGearShape(
      ctx,
      0,
      10,
      14,
      8,
      colors.gearAlt,
      '#f1d9a0',
      1,
      Math.sin(performance.now() * 0.004)
    );
    ctx.restore();

    ctx.restore();
  }

  function drawSlotsAndGears() {
    const lvl = levels[levelIndex];
    ctx.textAlign = 'center';
    // draw slots
    lvl.slots.forEach((slot, si) => {
      const pos = slotPositions[si];
      ctx.save();
      // subtle selection glow
      if (selection.slotIndex === si) {
        ctx.shadowColor = colors.highlight;
        ctx.shadowBlur = 18;
      } else {
        ctx.shadowColor = 'transparent';
      }
      ctx.fillStyle = colors.slot;
      roundRect(ctx, pos.x - 56, pos.y - 56, 112, 112, 16);
      ctx.fill();

      // slot label
      ctx.fillStyle = colors.text;
      ctx.font = '14px Arial';
      ctx.fillText(slot.label, pos.x, pos.y - 70);

      // placed gear or placeholder
      if (slot.placed) {
        drawGearWithNumber(ctx, slot.placed.x, slot.placed.y, slot.placed.radius, slot.placed.value, true);
      } else {
        ctx.globalAlpha = 0.18;
        drawGearShape(
          ctx,
          pos.x,
          pos.y,
          46,
          10,
          '#ffffff',
          '#e6f5ff',
          1,
          Math.sin(performance.now() * 0.002 + si)
        );
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    });

    // small hint text
    ctx.font = '13px Arial';
    ctx.fillStyle = '#0f3345';
    ctx.fillText('Solve to power the machine', WIDTH / 2, 170);
  }

  function drawConveyorAndGears() {
    // conveyor base with subtle texture
    ctx.save();
    ctx.fillStyle = '#e6f3fb';
    roundRect(ctx, 40, conveyorY - 56, WIDTH - 80, 140, 18);
    ctx.fill();

    // dashed moving line
    ctx.strokeStyle = '#c7e2f4';
    ctx.lineWidth = 6;
    ctx.beginPath();
    const offset = (performance.now() * 0.02) % 40;
    for (let x = 60 - offset; x < WIDTH - 60; x += 40) {
      ctx.moveTo(x, conveyorY + 40);
      ctx.lineTo(x + 20, conveyorY + 40);
    }
    ctx.stroke();

    // draw gears
    gears.forEach((g, i) => {
      if (!g.dragging && g.placedSlotIndex === null) {
        g.wobble += 0.02;
        g.y = g.homeY + Math.sin(g.wobble) * 4;
        // gentle idle rotation
        g.rotation += g.rotationSpeed * 1.5;
      } else if (g.dragging) {
        // faster rotation when dragging
        g.rotation += 0.18;
      } else if (g.placedSlotIndex !== null) {
        // slow settling rotation for placed gears
        g.rotation += 0.03;
      }
      const isSelected = selection.gearIndex === i;
      drawGearWithNumber(ctx, g.x, g.y, g.radius, g.value, isSelected, g.rotation);
    });
    ctx.restore();
  }

  function drawGearWithNumber(ctx, x, y, r, value, highlight = false, rotation = 0) {
    // outer gear with rotation
    drawGearShape(
      ctx,
      x,
      y,
      r,
      10,
      highlight ? colors.highlight : colors.gear,
      highlight ? '#fff7f2' : '#fff8f7',
      1,
      rotation
    );
    // add glassy center
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5 - 2, 0, Math.PI * 2);
    const cg = ctx.createLinearGradient(x - r * 0.5, y - r * 0.5, x + r * 0.5, y + r * 0.5);
    cg.addColorStop(0, 'rgba(255,255,255,0.9)');
    cg.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.restore();

    // number
    ctx.fillStyle = colors.text;
    ctx.font = '700 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x, y);

    // subtle shadow underneath
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - r, y + r + 6, r * 2, 4);
    ctx.globalAlpha = 1;
  }

  // Draw gear shape accepts optional rotation (new param)
  function drawGearShape(ctx, x, y, radius, teeth, fill, stroke, alpha = 1, rotation = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation || 0);
    ctx.beginPath();
    const toothAngle = (Math.PI * 2) / (teeth * 2);
    for (let i = 0; i < teeth * 2; i++) {
      const angle = i * toothAngle;
      const r = i % 2 === 0 ? radius : radius * 0.78;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.stroke();

    // center hole
    ctx.beginPath();
    ctx.fillStyle = stroke;
    ctx.arc(0, 0, radius * 0.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawUI() {
    // Level indicator
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${levelIndex + 1} / ${MAX_LEVELS}`, 24, 30);

    // Sound icon
    const sx = WIDTH - 60;
    const sy = 24;
    ctx.save();
    ctx.fillStyle = colors.speaker;
    if (!soundOn) ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy - 8);
    ctx.lineTo(sx - 12, sy + 8);
    ctx.lineTo(sx, sy + 8);
    ctx.lineTo(sx + 12, sy + 14);
    ctx.lineTo(sx + 12, sy - 14);
    ctx.lineTo(sx, sy - 8);
    ctx.closePath();
    ctx.fill();

    if (soundOn) {
      ctx.strokeStyle = colors.speaker;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + 18, sy, 8, -0.5, 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx + 22, sy, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#f55';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx + 28, sy - 12);
      ctx.lineTo(sx + 12, sy + 8);
      ctx.moveTo(sx + 12, sy - 12);
      ctx.lineTo(sx + 28, sy + 8);
      ctx.stroke();
    }
    ctx.restore();

    // control hint
    ctx.font = '12px Arial';
    ctx.fillStyle = '#0f3345';
    ctx.textAlign = 'right';
    ctx.fillText(
      'Keys: ←→ gears  ↑↓ slots  Enter place  Backspace remove  M mute',
      WIDTH - 20,
      HEIGHT - 12
    );
  }

  // Spark particle update & draw
  function updateAndDrawSparks() {
    const now = performance.now();
    for (let i = sparkParticles.length - 1; i >= 0; i--) {
      const p = sparkParticles[i];
      const age = now - p.born;
      const t = age / p.life;
      if (t >= 1) {
        sparkParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Confetti update/draw
  function updateAndDrawConfetti() {
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.rot += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
      if (p.y > HEIGHT + 80) confettiParticles.splice(i, 1);
    }
  }

  // Main loop
  function loop(ts) {
    const dt = ts - lastTime;
    lastTime = ts;
    draw();
    if (running) requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // Rounded rect utility
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Error handling
  window.addEventListener('error', (ev) => {
    console.error('Game error:', ev.error || ev.message);
    srInstructions.textContent = 'An unexpected error occurred in the game. Please reload.';
  });

  // Public API on container
  container.gameAPI = {
    restart: function () {
      levelIndex = 0;
      victory = false;
      confettiParticles = [];
      sparkParticles = [];
      generateLevels();
      loadLevel(0);
      srInstructions.textContent = 'Game restarted.';
    },
    toggleSound
  };

  // Screen reader initial message
  setTimeout(() => {
    srInstructions.textContent =
      'Welcome to Machine Math! Click or press keys to begin. Solve the math puzzles to fix the machines.';
  }, 600);

  // Ensure first-click resumes audio for gesture-required browsers
  canvas.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx
        .resume()
        .then(() => {
          audioAllowed = true;
          soundOn = true;
          if (ambientGain) ambientGain.gain.value = 0.02;
          srInstructions.textContent = 'Audio enabled.';
        })
        .catch(() => {
          audioAllowed = false;
          srInstructions.textContent = 'Audio is not available.';
        });
    } else if (!audioCtx && soundOn) {
      initAudio();
    }
  });

  // Accessibility: focus handling
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  canvas.addEventListener('focus', () => {
    srInstructions.textContent = 'Canvas focused. Use keyboard to play.';
  });
  canvas.addEventListener('blur', () => {
    srInstructions.textContent = 'Canvas lost focus. Click to regain control.';
  });
})();