(function () {
  // Find container element
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear container and create canvas
  container.innerHTML = '';
  container.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Machine Mix-Up math game. Use arrow keys to move, space to load a number, Enter to run the machine.'
  );
  canvas.setAttribute('tabindex', '0'); // focusable for keyboard
  container.appendChild(canvas);

  // Create hidden accessible instructions for screen readers
  const srInstructions = document.createElement('div');
  srInstructions.style.position = 'absolute';
  srInstructions.style.left = '-10000px';
  srInstructions.style.top = 'auto';
  srInstructions.style.width = '1px';
  srInstructions.style.height = '1px';
  srInstructions.style.overflow = 'hidden';
  srInstructions.setAttribute('aria-hidden', 'false');
  srInstructions.id = 'machine-mixup-instructions';
  srInstructions.innerText =
    'Machine Mix-Up. Collect three number tiles from the conveyor by moving the selector with left and right arrows and pressing space to load each into the machine. ' +
    'Press Enter to run the machine. Try to make the result match the target number. Press Backspace to remove the last loaded tile. Press R to reset, M to toggle sound.';
  container.appendChild(srInstructions);

  const ctx = canvas.getContext('2d', { alpha: false });

  // Game constants
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const CONVEYOR_Y = 330;
  const TILE_WIDTH = 72;
  const TILE_HEIGHT = 64;
  const NUM_TILES = 8; // number of tiles on conveyor
  const SLOTS = 3;
  // New refined palette
  const BG_TOP = '#E8F7F6';
  const BG_BOTTOM = '#F8FBFF';
  const MACHINE_COLOR = '#4B8F8F';
  const ACCENT_COLOR = '#FFB86B';
  const TEXT_COLOR = '#14333A';
  const SHADOW_COLOR = 'rgba(17, 28, 31, 0.14)';

  // Game state
  let gameState = {
    tiles: [], // {value, x, y, sx (speed), id}
    selectorIndex: 0,
    slots: [null, null, null],
    currentSlotIndex: 0,
    target: 0,
    ops: [], // two ops for machine: ['+', '-', '×']
    message: 'Load three tiles then press Enter to run the machine.',
    level: 1,
    attempts: 0,
    solvedLevels: 0,
    playing: true,
    audioEnabled: false,
    soundMuted: false,
    lastRunResult: null,
  };

  // Audio setup
  let audioContext = null;
  let masterGain = null;
  let bgOsc = null;
  let bgGain = null;
  let bgFilter = null;
  let lfo = null;
  let lfoGain = null;
  let ambientPulse = null;

  // Particle/confetti for success (calming, small)
  let particles = [];
  let lastSolvedCount = gameState.solvedLevels;

  // Helper: Create Audio Context with error handling and gentle ambient sound
  function createAudioContext() {
    if (audioContext) return audioContext;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx();

      // master gain to control overall volume; start muted
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.0;
      masterGain.connect(audioContext.destination);

      // Ambient pad: two detuned triangle oscillators through a lowpass filter
      try {
        bgFilter = audioContext.createBiquadFilter();
        bgFilter.type = 'lowpass';
        bgFilter.frequency.value = 900;
        bgFilter.Q.value = 0.9;
        bgFilter.connect(masterGain);

        bgGain = audioContext.createGain();
        bgGain.gain.value = 0.02; // very gentle
        bgGain.connect(bgFilter);

        bgOsc = audioContext.createOscillator();
        bgOsc.type = 'triangle';
        bgOsc.frequency.value = 110;
        const bgOsc2 = audioContext.createOscillator();
        bgOsc2.type = 'triangle';
        bgOsc2.frequency.value = 110 * 1.005; // slight detune

        // small gain nodes per oscillator
        const g1 = audioContext.createGain();
        g1.gain.value = 0.6;
        const g2 = audioContext.createGain();
        g2.gain.value = 0.5;

        bgOsc.connect(g1);
        bgOsc2.connect(g2);
        g1.connect(bgGain);
        g2.connect(bgGain);

        bgOsc.start();
        bgOsc2.start();

        // LFO to modulate filter cutoff slowly for a breathing effect
        lfo = audioContext.createOscillator();
        lfo.frequency.value = 0.06; // slow
        lfoGain = audioContext.createGain();
        lfoGain.gain.value = 200; // modulation depth
        lfo.connect(lfoGain);
        lfoGain.connect(bgFilter.frequency);
        lfo.start();

        // Ambient pulse to create a subtle heartbeat at low frequency (very low volume)
        ambientPulse = audioContext.createOscillator();
        ambientPulse.type = 'sine';
        ambientPulse.frequency.value = 0.5;
        const pulseGain = audioContext.createGain();
        pulseGain.gain.value = 0.002;
        ambientPulse.connect(pulseGain);
        pulseGain.connect(masterGain);
        ambientPulse.start();
      } catch (e) {
        console.warn('Ambient audio setup partial failure:', e);
      }

      gameState.audioEnabled = true;
      // Keep masterGain at 0; toggling via setSoundMuted will open it
      return audioContext;
    } catch (e) {
      console.warn('AudioContext creation failed or is disallowed by browser:', e);
      audioContext = null;
      gameState.audioEnabled = false;
      return null;
    }
  }

  // Toggle sound on/off
  function setSoundMuted(mute) {
    gameState.soundMuted = !!mute;
    if (!audioContext && !mute) {
      createAudioContext();
    }
    if (masterGain) {
      // chosen overall comfortable level when unmuted
      masterGain.gain.value = gameState.soundMuted ? 0.0 : 0.55;
    }
  }

  // Utility: play a short sound with oscillator (safe with try-catch)
  function playTone({
    freq = 440,
    type = 'sine',
    duration = 0.18,
    gain = 0.08,
    attack = 0.004,
    release = 0.06,
    filterFreq = null,
  } = {}) {
    if (!audioContext || gameState.soundMuted) return;
    try {
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      o.type = type;
      o.frequency.value = freq;

      let nodeOut = g;
      if (filterFreq) {
        const f = audioContext.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filterFreq;
        o.connect(f);
        f.connect(g);
      } else {
        o.connect(g);
      }
      g.connect(masterGain);

      const now = audioContext.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + attack);
      g.gain.linearRampToValueAtTime(0.0001, now + duration - release);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (err) {
      console.warn('playTone failed:', err);
    }
  }

  // Specialized sounds using playTone and small patterns
  function soundPick() {
    if (gameState.soundMuted) return;
    playTone({
      freq: 720,
      type: 'triangle',
      duration: 0.10,
      gain: 0.07,
      attack: 0.006,
      release: 0.04,
      filterFreq: 1200,
    });
    setTimeout(() => playTone({ freq: 880, type: 'sine', duration: 0.09, gain: 0.05, attack: 0.004, release: 0.03 }), 80);
  }

  function soundIncorrect() {
    if (gameState.soundMuted) return;
    playTone({
      freq: 160,
      type: 'sawtooth',
      duration: 0.26,
      gain: 0.12,
      attack: 0.01,
      release: 0.05,
      filterFreq: 600,
    });
    setTimeout(() => playTone({ freq: 120, type: 'sine', duration: 0.18, gain: 0.06, attack: 0.01, release: 0.04 }), 120);
  }

  function soundCorrect() {
    if (gameState.soundMuted) return;
    // gentle major arpeggio with three tones
    playTone({
      freq: 420,
      type: 'sine',
      duration: 0.16,
      gain: 0.10,
      attack: 0.005,
      release: 0.06,
      filterFreq: 1600,
    });
    setTimeout(
      () =>
        playTone({
          freq: 560,
          type: 'sine',
          duration: 0.14,
          gain: 0.09,
          attack: 0.005,
          release: 0.05,
          filterFreq: 1600,
        }),
      140
    );
    setTimeout(
      () =>
        playTone({
          freq: 700,
          type: 'sine',
          duration: 0.18,
          gain: 0.08,
          attack: 0.005,
          release: 0.06,
          filterFreq: 1800,
        }),
      280
    );
  }

  function soundRun() {
    if (gameState.soundMuted) return;
    // short whoosh + click
    playTone({ freq: 220, type: 'sine', duration: 0.18, gain: 0.06, attack: 0.02, release: 0.06, filterFreq: 700 });
    setTimeout(
      () => playTone({ freq: 1200, type: 'triangle', duration: 0.06, gain: 0.06, attack: 0.002, release: 0.02, filterFreq: 2000 }),
      130
    );
  }

  // Game generation: create tiles and target such that level is solvable
  function generateLevel(level = 1) {
    function randInt(a, b) {
      return Math.floor(Math.random() * (b - a + 1)) + a;
    }
    let a, b, c, ops, result;
    const opsSet = ['+', '-', '×'];
    let attempts = 0;
    do {
      a = randInt(1, Math.min(9, 4 + level));
      b = randInt(1, Math.min(9, 4 + level));
      c = randInt(1, Math.min(9, 4 + level));
      ops = [opsSet[randInt(0, 2)], opsSet[randInt(0, 2)]];
      try {
        result = applyOps(a, b, c, ops);
      } catch (e) {
        result = NaN;
      }
      attempts++;
      if (attempts > 500) {
        a = 2;
        b = 3;
        c = 4;
        ops = ['+', '+'];
        result = 9;
        break;
      }
    } while (!Number.isFinite(result) || result < 0 || result > 99);

    const tiles = [];
    const values = [a, b, c];
    for (let v of values) {
      tiles.push({ value: v, id: 'core-' + Math.random().toString(36).slice(2) });
    }
    while (tiles.length < NUM_TILES) {
      tiles.push({ value: randInt(1, 9), id: 'decoy-' + Math.random().toString(36).slice(2) });
    }
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    const startX = 40;
    const spacing = (WIDTH - 80 - TILE_WIDTH) / Math.max(1, NUM_TILES - 1);
    tiles.forEach((t, i) => {
      t.x = startX + i * spacing;
      t.y = CONVEYOR_Y;
      t.sx = 0.2 + Math.random() * 0.6;
      t.bounce = 0; // visual bounce state
      t.waveOffset = Math.random() * Math.PI * 2;
    });
    gameState.tiles = tiles;
    gameState.selectorIndex = 0;
    gameState.slots = [null, null, null];
    gameState.currentSlotIndex = 0;
    gameState.ops = ops;
    gameState.target = result;
    gameState.message = 'Level ' + level + ': Make the machine result equal ' + result + '.';
    gameState.lastRunResult = null;
    gameState.attempts = 0;
  }

  // Apply operations left-to-right
  function applyOps(a, b, c, ops) {
    function apply(x, op, y) {
      if (op === '+') return x + y;
      if (op === '-') return x - y;
      if (op === '×') return x * y;
      return x + y;
    }
    const r1 = apply(a, ops[0], b);
    const r2 = apply(r1, ops[1], c);
    return r2;
  }

  // Place selected tile into next slot
  function loadSelectedTile() {
    if (gameState.currentSlotIndex >= SLOTS) {
      gameState.message = 'All slots are filled. Press Enter to run the machine or Backspace to remove a tile.';
      return;
    }
    const tile = gameState.tiles[gameState.selectorIndex];
    if (!tile) {
      gameState.message = 'No tile selected.';
      return;
    }
    // Copy tile into slot and animate a bounce
    gameState.slots[gameState.currentSlotIndex] = { value: tile.value, id: tile.id };
    tile.bounce = 1.0; // start bounce animation
    gameState.currentSlotIndex++;
    gameState.message = 'Loaded ' + tile.value + ' into slot ' + gameState.currentSlotIndex + '.';
    soundPick();
  }

  // Remove last loaded slot
  function removeLastSlot() {
    if (gameState.currentSlotIndex <= 0) {
      gameState.message = 'No tiles to remove.';
      return;
    }
    gameState.currentSlotIndex--;
    const removed = gameState.slots[gameState.currentSlotIndex];
    gameState.slots[gameState.currentSlotIndex] = null;
    gameState.message = 'Removed ' + (removed ? removed.value : 'tile') + ' from slot ' + (gameState.currentSlotIndex + 1) + '.';
  }

  // Run machine: compute result from slots and compare to target
  function runMachine() {
    if (gameState.slots.some(s => s === null)) {
      gameState.message = 'Fill all slots first.';
      soundIncorrect();
      return;
    }
    const vals = gameState.slots.map(s => s.value);
    const result = applyOps(vals[0], vals[1], vals[2], gameState.ops);
    gameState.lastRunResult = result;
    gameState.attempts++;
    soundRun();
    if (result === gameState.target) {
      // success
      gameState.message = 'Success! The machine produced ' + result + '. Press R to play next level.';
      soundCorrect();
      gameState.solvedLevels++;
      gameState.playing = false;
      // spawn subtle particles for celebration
      spawnCelebration();
    } else {
      // incorrect
      gameState.message = 'Oops! Machine result was ' + result + '. Try again or press R to reset the level.';
      soundIncorrect();
    }
  }

  // Reset current level
  function resetLevel() {
    generateLevel(gameState.level);
    gameState.playing = true;
    particles = [];
  }

  // Advance to next level (beatability)
  function nextLevel() {
    gameState.level++;
    generateLevel(gameState.level);
    gameState.playing = true;
    particles = [];
  }

  // Keyboard controls handling
  function handleKeyDown(e) {
    if (e.key && !gameState.audioEnabled && !gameState.soundMuted) {
      tryResumeAudio();
    }
    switch (e.key) {
      case 'ArrowLeft':
        gameState.selectorIndex = (gameState.selectorIndex - 1 + gameState.tiles.length) % gameState.tiles.length;
        e.preventDefault();
        break;
      case 'ArrowRight':
        gameState.selectorIndex = (gameState.selectorIndex + 1) % gameState.tiles.length;
        e.preventDefault();
        break;
      case ' ':
        loadSelectedTile();
        e.preventDefault();
        break;
      case 'Enter':
        runMachine();
        e.preventDefault();
        break;
      case 'Backspace':
        removeLastSlot();
        e.preventDefault();
        break;
      case 'r':
      case 'R':
        if (!gameState.playing) {
          nextLevel();
        } else {
          resetLevel();
        }
        e.preventDefault();
        break;
      case 'm':
      case 'M':
        setSoundMuted(!gameState.soundMuted);
        e.preventDefault();
        break;
      default:
        break;
    }
  }

  // Mouse controls: clicking canvas focuses and optionally picks tile
  canvas.addEventListener('click', (ev) => {
    tryResumeAudio();
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    // If click on a tile region, move selector there and load
    for (let i = 0; i < gameState.tiles.length; i++) {
      const t = gameState.tiles[i];
      if (x >= t.x && x <= t.x + TILE_WIDTH && y >= t.y && y <= t.y + TILE_HEIGHT) {
        gameState.selectorIndex = i;
        loadSelectedTile();
        return;
      }
    }
    // If click on run area, run machine
    const runBox = { x: 520, y: 160, w: 160, h: 120 };
    if (x >= runBox.x && x <= runBox.x + runBox.w && y >= runBox.y && y <= runBox.y + runBox.h) {
      runMachine();
      return;
    }
    canvas.focus();
  });

  // Try to resume/create audio context on user gesture
  function tryResumeAudio() {
    if (!audioContext) {
      createAudioContext();
    }
    if (audioContext) {
      if (typeof audioContext.resume === 'function') {
        audioContext
          .resume()
          .then(() => {
            setSoundMuted(gameState.soundMuted);
          })
          .catch((e) => {
            console.warn('AudioContext resume failed:', e);
          });
      } else {
        setSoundMuted(gameState.soundMuted);
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('keydown', handleKeyDown);

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

  // Particle utilities
  function spawnCelebration() {
    // spawn limited number of gentle confetti pieces
    const count = 22;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: 560 + Math.random() * 160 - 80,
        y: 150 + Math.random() * 80 - 40,
        vx: (Math.random() - 0.5) * 1.6,
        vy: Math.random() * -1 - 0.6,
        life: 1 + Math.random() * 1.0,
        size: 6 + Math.random() * 6,
        hue: 160 + Math.random() * 60,
        type: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }
  }

  // Render loop
  let lastTime = performance.now();
  let conveyorOffset = 0;
  function render(time) {
    const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
    lastTime = time;

    // Update tile drifting motion and bounce
    conveyorOffset += dt * 60 * 0.5; // visual belt movement
    for (let i = 0; i < gameState.tiles.length; i++) {
      const t = gameState.tiles[i];
      // gentle horizontal drift and small wavy bob
      t.x += Math.sin(time / 1000 + t.waveOffset + i) * 0.07 * t.sx;
      t.y = CONVEYOR_Y + Math.sin(time / 800 + t.waveOffset) * 3;
      // keep tiles within bounds
      if (t.x < 20) t.x = 20 + i * 2;
      if (t.x > WIDTH - TILE_WIDTH - 20) t.x = WIDTH - TILE_WIDTH - 20 - i * 2;
      // bounce animation decay when loaded
      if (t.bounce && t.bounce > 0) {
        t.bounce -= dt * 2.6;
        if (t.bounce < 0) t.bounce = 0;
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.04; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * 0.9;
      if (p.life <= 0 || p.y > HEIGHT + 20) {
        particles.splice(i, 1);
      }
    }

    // Clear background with calming gradient and subtle grid
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, BG_TOP);
    g.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Subtle animated background grid lines
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#8FB7B5';
    ctx.lineWidth = 1;
    for (let x = -200 + Math.sin(time / 2000) * 80; x < WIDTH + 200; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 60, HEIGHT);
      ctx.stroke();
    }
    ctx.restore();

    // Soft decorative blobs
    drawSoftWackyShapes(time);

    // Draw machine with subtle animated fan and glow
    drawMachine(time);

    // Draw conveyor belt and tiles (with moved belt treads)
    drawConveyor(time);

    // Draw selector arrow and label
    drawSelector();

    // Draw slots with polished visuals
    drawSlots(time);

    // Draw target panel and running area
    drawTargetPanel(time);

    // Draw HUD (messages, controls, speaker)
    drawHUD();

    requestAnimationFrame(render);
  }

  // Decorative soft shapes to make visuals calming & wacky
  function drawSoftWackyShapes(time = 0) {
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#78B3B1';
    ctx.beginPath();
    ctx.ellipse(80 + Math.sin(time / 2000) * 6, 70 + Math.cos(time / 2100) * 4, 72, 42, 0.32, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#CDEEEF';
    ctx.beginPath();
    ctx.ellipse(620 + Math.cos(time / 1600) * 8, 110 + Math.sin(time / 1700) * 6, 96, 54, -0.54, 0, Math.PI * 2);
    ctx.fill();

    // faint rounded shapes near machine area
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#FFDDAA';
    ctx.beginPath();
    ctx.ellipse(540, 240, 140, 60, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawMachine(time = 0) {
    ctx.save();
    // soft outer glow
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(560, 200, 160, 110, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main machine box with subtle vertical gradient
    const mg = ctx.createLinearGradient(440, 110, 700, 310);
    mg.addColorStop(0, '#4B8F8F');
    mg.addColorStop(1, '#357E7E');
    ctx.fillStyle = mg;
    drawRoundedRect(ctx, 440, 110, 260, 200, 18);

    // face plate with soft bevel
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(560, 180, 28, 0, Math.PI * 2);
    ctx.fill();

    // machine eye pupil that subtly follows time
    ctx.fillStyle = '#0E2A2E';
    const pupilOffset = Math.sin(time / 600) * 4;
    ctx.beginPath();
    ctx.arc(560 + pupilOffset, 180 + Math.cos(time / 800) * 1.8, 8, 0, Math.PI * 2);
    ctx.fill();

    // gentle glow light indicating audio on/off
    const blinkAlpha = gameState.audioEnabled && !gameState.soundMuted ? 1.0 : 0.25;
    ctx.fillStyle = `rgba(255, 200, 120, ${blinkAlpha})`;
    ctx.beginPath();
    ctx.arc(640, 135, 12, 0, Math.PI * 2);
    ctx.fill();

    // flowing pipe stroke
    ctx.strokeStyle = '#2C6464';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(300, 220);
    ctx.quadraticCurveTo(380, 140, 520, 180);
    ctx.stroke();

    // small rotating cog decoration (animated)
    const cogX = 640;
    const cogY = 260;
    const cogR = 18;
    const cogTeeth = 8;
    ctx.save();
    ctx.translate(cogX, cogY);
    ctx.rotate(time / 900);
    for (let i = 0; i < cogTeeth; i++) {
      ctx.fillStyle = i % 2 ? '#A7D7D6' : '#8FC0BF';
      ctx.beginPath();
      const a = (i / cogTeeth) * Math.PI * 2;
      const x1 = Math.cos(a) * (cogR + 2);
      const y1 = Math.sin(a) * (cogR + 2);
      ctx.rect(x1 - 3, y1 - 3, 6, 6);
      ctx.fill();
    }
    // cog center
    ctx.fillStyle = '#E6F8F7';
    ctx.beginPath();
    ctx.arc(0, 0, cogR - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawConveyor(time = 0) {
    ctx.save();
    // Conveyor base with shadow
    ctx.fillStyle = '#EAF6F6';
    drawRoundedRect(ctx, 20, CONVEYOR_Y - 18, WIDTH - 40, TILE_HEIGHT + 40, 14);

    // moving treads pattern
    ctx.save();
    ctx.clip();
    const patternOffset = Math.floor(conveyorOffset * 8) % 60;
    for (let i = -60 + patternOffset; i < WIDTH + 60; i += 30) {
      ctx.fillStyle = '#D2F0EF';
      ctx.fillRect(i, CONVEYOR_Y + TILE_HEIGHT + 8, 24, 6);
    }
    ctx.restore();

    // Draw tiles with soft shadows and subtle tilt when bouncing
    for (let i = 0; i < gameState.tiles.length; i++) {
      const t = gameState.tiles[i];
      drawTile(t.x, t.y, t.value, i === gameState.selectorIndex, t.id, t.bounce);
    }

    ctx.restore();
  }

  function drawTile(x, y, value, selected = false, id = '', bounce = 0) {
    ctx.save();
    // base shadow
    ctx.fillStyle = SHADOW_COLOR;
    drawRoundedRect(ctx, x + 6, y + 10, TILE_WIDTH, TILE_HEIGHT, 10);

    // subtle background gradient on tile
    const tg = ctx.createLinearGradient(x, y, x, y + TILE_HEIGHT);
    tg.addColorStop(0, '#FFFFFF');
    tg.addColorStop(1, '#F3FEFC');
    ctx.fillStyle = tg;
    drawRoundedRect(ctx, x, y, TILE_WIDTH, TILE_HEIGHT, 10);

    // soft accent band
    ctx.fillStyle = '#F5FFFE';
    ctx.fillRect(x + 6, y + 36, TILE_WIDTH - 12, 6);

    // bounce (scale) when loaded
    const scale = 1 + bounce * 0.08;
    ctx.translate(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
    ctx.scale(scale, scale);
    ctx.rotate(Math.sin(bounce * Math.PI * 2) * 0.03);

    // Number
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 28px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 0, -6);

    // pop a tiny badge if tile is from core set (id includes core-)
    if (id && id.startsWith('core-')) {
      ctx.fillStyle = '#FFF5E6';
      ctx.beginPath();
      ctx.ellipse(TILE_WIDTH / -2 + 12, TILE_HEIGHT / -2 + 8, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset matrix for further drawing (we used translate/scale)
    // draw selection outline
    if (selected) {
      ctx.strokeStyle = ACCENT_COLOR;
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 2, y - 2, TILE_WIDTH + 4, TILE_HEIGHT + 4);
    }

    ctx.restore();
  }

  function drawSelector() {
    const t = gameState.tiles[gameState.selectorIndex];
    if (!t) return;
    ctx.save();
    const sx = t.x + TILE_WIDTH / 2;
    const sy = t.y + TILE_HEIGHT + 22;
    // soft animated arrow
    ctx.fillStyle = ACCENT_COLOR;
    ctx.beginPath();
    ctx.moveTo(sx - 12, sy - 10 + Math.cos(performance.now() / 260) * 2);
    ctx.lineTo(sx + 12, sy - 10 + Math.cos(performance.now() / 260) * 2);
    ctx.lineTo(sx, sy + 6 + Math.sin(performance.now() / 180) * 2);
    ctx.closePath();
    ctx.fill();

    // Selected value label
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '12px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Selected: ' + t.value, sx, sy + 30);
    ctx.restore();
  }

  function drawSlots(time = 0) {
    ctx.save();
    const baseX = 260;
    const baseY = 160;
    const slotW = 72;
    const slotH = 52;
    for (let i = 0; i < SLOTS; i++) {
      const x = baseX - i * (slotW + 18);
      const y = baseY;
      // slot background with subtle inner shadow
      ctx.fillStyle = '#F7FFFE';
      drawRoundedRect(ctx, x, y, slotW, slotH, 8);
      ctx.strokeStyle = '#D9F3F2';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, slotH - 1);

      // Draw loaded value
      const s = gameState.slots[i];
      if (s) {
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = 'bold 20px "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s.value), x + slotW / 2, y + slotH / 2);
      } else {
        ctx.fillStyle = '#7FAFAE';
        ctx.font = '12px "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Slot ' + (i + 1), x + slotW / 2, y + slotH / 2);
      }

      // Visual cue for current slot
      if (i === gameState.currentSlotIndex && gameState.playing) {
        ctx.strokeStyle = ACCENT_COLOR;
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 2, y - 2, slotW + 4, slotH + 4);
      }

      // Pipe arrow to machine
      ctx.strokeStyle = '#2C6363';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x + slotW + 6, y + slotH / 2);
      ctx.quadraticCurveTo(x + slotW + 40, y + slotH / 2, 420, 200);
      ctx.stroke();

      // Operation icon between slots
      if (i < SLOTS - 1) {
        const op = gameState.ops[i];
        // pill background
        ctx.fillStyle = '#FFFFFF';
        drawRoundedRect(ctx, x - 24, y + slotH + 10, 48, 28, 8);
        ctx.strokeStyle = '#E6F6F5';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x - 24 + 0.5, y + slotH + 10 + 0.5, 48 - 1, 28 - 1);

        ctx.fillStyle = TEXT_COLOR;
        ctx.font = 'bold 18px "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(op, x, y + slotH + 24);
      }
    }
    ctx.restore();
  }

  function drawTargetPanel(time = 0) {
    ctx.save();
    // target display
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(ctx, 520, 60, 160, 76, 12);
    ctx.strokeStyle = '#E6F6F5';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(520 + 0.5, 60 + 0.5, 160 - 1, 76 - 1);

    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '18px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Target', 600, 78);

    // target number with accent pill
    ctx.fillStyle = ACCENT_COLOR;
    drawRoundedRect(ctx, 548, 92, 104, 38, 10);
    ctx.fillStyle = '#072425';
    ctx.font = 'bold 28px "Segoe UI", Roboto, sans-serif';
    ctx.fillText(String(gameState.target), 600, 118);

    // Run button area
    ctx.fillStyle = '#EFFFF7';
    drawRoundedRect(ctx, 520, 160, 160, 120, 12);
    ctx.fillStyle = '#67C7B3';
    ctx.font = 'bold 18px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RUN MACHINE', 600, 200);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '13px "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Press Enter', 600, 226);

    // Last result display
    if (gameState.lastRunResult !== null) {
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(ctx, 520, 290, 160, 60, 10);
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '14px "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Last result: ' + String(gameState.lastRunResult), 600, 320);
    }

    // subtle progress indicator (levels solved)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Solved: ' + gameState.solvedLevels, 600, 360);

    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    // Message
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '14px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(gameState.message, 24, 30);

    // Level & attempts
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '13px "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Level: ' + gameState.level + '   Attempts: ' + gameState.attempts, 24, 52);

    // Controls reminder
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '12px "Segoe UI", Roboto, sans-serif';
    ctx.fillText('← → Move   Space Load   Backspace Remove   Enter Run   R Reset/Next   M Toggle sound', 24, HEIGHT - 16);

    // Audio visual indicator (speaker)
    const speakerX = WIDTH - 42;
    const speakerY = 26;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#DAF3F0';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, speakerX - 26, speakerY - 18, 52, 36, 8);
    ctx.fillStyle = gameState.soundMuted ? '#FDEAEA' : '#E6FFF8';
    ctx.beginPath();
    ctx.moveTo(speakerX - 12, speakerY + 2);
    ctx.lineTo(speakerX - 12, speakerY - 10);
    ctx.lineTo(speakerX - 2, speakerY - 4);
    ctx.lineTo(speakerX + 10, speakerY - 12);
    ctx.lineTo(speakerX + 10, speakerY + 12);
    ctx.lineTo(speakerX - 2, speakerY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // sound wave indicator when unmuted
    if (!gameState.soundMuted && gameState.audioEnabled) {
      ctx.strokeStyle = '#5BC6B7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(speakerX + 14, speakerY - 6);
      ctx.quadraticCurveTo(speakerX + 20, speakerY, speakerX + 14, speakerY + 6);
      ctx.stroke();
    } else if (gameState.soundMuted) {
      ctx.strokeStyle = '#C44';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(speakerX - 20, speakerY - 12);
      ctx.lineTo(speakerX + 20, speakerY + 12);
      ctx.stroke();
    }

    // Title centered
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '16px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Machine Mix-Up', WIDTH / 2, 30);

    // Draw particles (celebration) in HUD area
    drawParticles();

    ctx.restore();
  }

  function drawParticles() {
    if (!particles.length) return;
    ctx.save();
    for (let p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.type === 'rect') {
        ctx.fillStyle = `hsl(${p.hue}, 65%, 55%)`;
        ctx.fillRect(p.x, p.y, p.size * 0.9, p.size * 0.6);
      } else {
        ctx.fillStyle = `hsl(${p.hue}, 65%, 60%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Initialize
  function init() {
    try {
      canvas.focus();
    } catch (e) {
      // ignore
    }
    // Default audio muted until user interacts
    gameState.soundMuted = true;
    generateLevel(gameState.level);
    requestAnimationFrame(render);
  }

  init();

  // Expose a small debug API on container for testing (non-intrusive)
  container.__machineMixup = {
    reset: resetLevel,
    next: nextLevel,
    toggleSound: () => setSoundMuted(!gameState.soundMuted),
    getState: () => JSON.parse(JSON.stringify(gameState)),
  };

  // Provide basic accessibility: announce messages via ARIA live region
  let liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-10000px';
  liveRegion.style.top = 'auto';
  container.appendChild(liveRegion);

  // Update live region when messages change
  let lastAnnounced = '';
  setInterval(() => {
    if (gameState.message && gameState.message !== lastAnnounced) {
      liveRegion.textContent = gameState.message;
      lastAnnounced = gameState.message;
    }
  }, 300);

  // Graceful cleanup on unload
  window.addEventListener('beforeunload', () => {
    try {
      if (audioContext && typeof audioContext.close === 'function') {
        audioContext.close();
      }
    } catch (e) {
      // ignore
    }
  });
})();