(function () {
  // Find the stage element and create canvas
  const stage = document.getElementById('game-of-the-day-stage');
  if (!stage) {
    console.error('Game stage element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear stage and create canvas with exact size
  stage.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.setAttribute('tabindex', '0'); // make focusable for keyboard
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Machine Math game. Use mouse or keys 1-5 to select gears, Enter to submit, Space to toggle audio.'
  );
  stage.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Utility functions
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => Date.now();

  // -------------------------
  // Audio: Web Audio API setup
  // -------------------------
  let audioSupported = true;
  let audioEnabled = false; // user must gesture to enable
  let audioContext = null;
  let masterGain = null;
  let bgGain = null;
  let bgOsc1 = null;
  let bgOsc2 = null;
  let bgLfo = null;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      audioSupported = false;
      console.warn('Web Audio API not present.');
    } else {
      audioContext = new AudioCtx();
      // master gain
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.0; // start muted until user enables
      masterGain.connect(audioContext.destination);

      // gentle background pad: two slow oscillators into a shared filter
      bgGain = audioContext.createGain();
      bgGain.gain.value = 0.0001;
      const padFilter = audioContext.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 600;
      padFilter.Q.value = 0.7;

      bgOsc1 = audioContext.createOscillator();
      bgOsc1.type = 'sine';
      bgOsc1.frequency.value = 110; // base
      bgOsc2 = audioContext.createOscillator();
      bgOsc2.type = 'triangle';
      bgOsc2.frequency.value = 132; // a gentle interval

      // slow LFO to add breathing effect to pad volume
      bgLfo = audioContext.createOscillator();
      bgLfo.type = 'sine';
      bgLfo.frequency.value = 0.08; // very slow
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 0.04; // depth of modulation
      bgLfo.connect(lfoGain);
      lfoGain.connect(bgGain.gain);

      // routing
      bgOsc1.connect(padFilter);
      bgOsc2.connect(padFilter);
      padFilter.connect(bgGain);
      bgGain.connect(masterGain);

      try {
        bgOsc1.start();
        bgOsc2.start();
        bgLfo.start();
      } catch (e) {
        // some browsers require start to be called after resume; try again later
        setTimeout(() => {
          try {
            if (bgOsc1 && bgOsc1.start) bgOsc1.start();
            if (bgOsc2 && bgOsc2.start) bgOsc2.start();
            if (bgLfo && bgLfo.start) bgLfo.start();
          } catch (err) {
            console.warn('Failed to start background oscillators:', err);
          }
        }, 120);
      }
    }
  } catch (err) {
    audioSupported = false;
    console.error('Audio context creation failed:', err);
  }

  // Enable audio on user gesture, with safe checks and graceful fallback
  function enableAudioOnGesture() {
    if (!audioSupported || audioEnabled) return Promise.resolve();
    if (!audioContext) return Promise.reject(new Error('No audio context'));
    return audioContext
      .resume()
      .then(() => {
        audioEnabled = true;
        // smooth ramp of pad
        try {
          const t = audioContext.currentTime;
          bgGain.gain.cancelScheduledValues(t);
          bgGain.gain.setValueAtTime(0.0001, t);
          bgGain.gain.linearRampToValueAtTime(0.06, t + 0.8);
          // master volume
          masterGain.gain.cancelScheduledValues(t);
          masterGain.gain.setValueAtTime(0.0, t);
          masterGain.gain.linearRampToValueAtTime(0.9, t + 1.0);
        } catch (e) {
          console.warn('Error ramping audio gains:', e);
          masterGain.gain.value = 0.9;
          bgGain.gain.value = 0.06;
        }
      })
      .catch((err) => {
        console.warn('AudioContext resume failed:', err);
      });
  }

  // Sound event generators
  function safePlay(fn) {
    if (!audioSupported || !audioContext || !audioEnabled) return;
    try {
      fn();
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  function playTone(freq, duration = 0.28, type = 'sine', volume = 0.08) {
    safePlay(() => {
      const t0 = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const g = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(600, freq * 2);
      // slightly detune for warmth
      osc.type = type;
      osc.frequency.value = freq + (Math.random() * 3 - 1.5);
      g.gain.value = volume;
      osc.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      // envelope
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.stop(t0 + duration + 0.05);
    });
  }

  function playClick() {
    safePlay(() => {
      const t0 = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const g = audioContext.createGain();
      osc.type = 'square';
      osc.frequency.value = 780;
      // short click with a highpass to remove low rumble
      const hp = audioContext.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 400;
      g.gain.value = 0.06;
      osc.connect(hp);
      hp.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      g.gain.setValueAtTime(0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      osc.stop(t0 + 0.09);
    });
  }

  function playChime() {
    safePlay(() => {
      const nowT = audioContext.currentTime;
      // three notes slightly arpeggiated
      playTone(440, 0.26, 'sine', 0.09);
      setTimeout(() => playTone(660, 0.36, 'triangle', 0.07), 70);
      setTimeout(() => playTone(880, 0.42, 'sine', 0.05), 160);
    });
  }

  function playBuzz() {
    safePlay(() => {
      const t0 = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const g = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 220;
      osc.type = 'sawtooth';
      osc.frequency.value = 220;
      g.gain.value = 0.14;
      osc.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      g.gain.setValueAtTime(0.14, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.stop(t0 + 0.29);
    });
  }

  function playSuccessBurst(x = 360, y = 280) {
    safePlay(() => {
      // layered small tones to feel like a gentle celebration
      playTone(520, 0.18, 'sine', 0.08);
      setTimeout(() => playTone(640, 0.22, 'triangle', 0.06), 60);
      setTimeout(() => playTone(760, 0.26, 'sine', 0.05), 140);
    });
  }

  // -------------------------
  // Game state (mechanics unchanged)
  // -------------------------
  const game = {
    round: 1,
    maxRounds: 6,
    target: 0,
    availableGears: [], // {value, x, y, radius, id, angle}
    selected: [],
    solvedCount: 0,
    level: 1,
    message: '',
    messageTimer: 0,
    soundOn: audioSupported && audioEnabled,
    running: true,
  };

  // Generate round logic as provided, but augment gear objects with angle & spinSpeed
  function generateRound(roundNum) {
    game.selected = [];
    game.message = '';
    game.messageTimer = 0;
    const difficulty = clamp(roundNum, 1, 6);
    const minTarget = 5 + Math.floor((difficulty - 1) * 1.5);
    const maxTarget = 10 + difficulty * 1;
    const target = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
    const numPieces = Math.random() < 0.6 ? 2 : 3;
    const pieces = [];
    let remaining = target;
    for (let i = 0; i < numPieces - 1; i++) {
      const maxPick = Math.max(1, remaining - (numPieces - i - 1));
      const pick = Math.floor(Math.random() * Math.min(9, maxPick)) + 1;
      pieces.push(pick);
      remaining -= pick;
    }
    pieces.push(remaining);
    const totalGears = 5;
    const gears = pieces.slice();
    while (gears.length < totalGears) {
      let val;
      do {
        val = Math.floor(Math.random() * 9) + 1;
      } while (gears.includes(val) && Math.random() > 0.6);
      gears.push(val);
    }
    // shuffle
    for (let i = gears.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gears[i], gears[j]] = [gears[j], gears[i]];
    }
    // place gears visually with angle & speed
    const gearObjs = [];
    const startX = 120;
    const startY = 250;
    const spacing = 110;
    for (let i = 0; i < gears.length; i++) {
      const gx = startX + i * spacing;
      const gy = startY + ((i % 2) * 14 - 7);
      gearObjs.push({
        value: gears[i],
        x: gx,
        y: gy,
        baseY: gy,
        radius: 36,
        id: 'g' + Date.now() + '_' + i,
        angle: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() * 0.002 + 0.0008) * (i % 2 ? -1 : 1), // gentle opposite spins
        bounce: Math.random() * 0.8 + 0.2,
        wobbleOffset: Math.random() * 10,
      });
    }

    game.target = target;
    game.availableGears = gearObjs;
    game.level = difficulty;
  }

  // Start first round
  generateRound(game.round);

  // Compute the sum of selected gears (mechanic unchanged)
  function currentSum() {
    return game.selected.reduce((s, id) => {
      const g = game.availableGears.find((gg) => gg.id === id);
      return s + (g ? g.value : 0);
    }, 0);
  }

  // Submission logic (preserve functionality), play improved sounds and trigger visuals
  function submitSelection() {
    if (!game.running) return;
    const sum = currentSum();
    if (sum === game.target) {
      game.solvedCount++;
      game.message = 'Nice! Machine hums happily!';
      game.messageTimer = now();
      playSuccessBurst();
      spawnConfetti(18, 360, 260);
      // next round or victory
      if (game.round >= game.maxRounds) {
        game.running = false;
        setTimeout(() => showVictory(), 700);
      } else {
        setTimeout(() => {
          game.round++;
          generateRound(game.round);
        }, 900);
      }
    } else {
      game.message = 'Not right yet! Check the sum.';
      game.messageTimer = now();
      playBuzz();
      // a subtle shake animation will be triggered by timestamp checks in draw
      shakeMachine(180);
    }
  }

  function showVictory() {
    game.message = 'You fixed all the machines! You win!';
    game.messageTimer = now();
    playChime();
    spawnConfetti(40, 360, 260);
  }

  // Input handling: selection toggles up to 3 items (logic preserved)
  function toggleGearSelection(id) {
    if (!game.running) return;
    const idx = game.selected.indexOf(id);
    if (idx >= 0) {
      game.selected.splice(idx, 1);
    } else {
      if (game.selected.length >= 3) {
        game.message = 'Too many gears! Try fewer pieces.';
        game.messageTimer = now();
        playBuzz();
        return;
      } else {
        game.selected.push(id);
      }
    }
    // click sound and slight visual nudge
    playClick();
  }

  function resetGame() {
    game.round = 1;
    game.solvedCount = 0;
    game.running = true;
    generateRound(game.round);
  }

  // -------------------------
  // Interaction: mouse & keyboard
  // -------------------------
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    // audio toggle area (top-right)
    if (mx > 640 && mx < 716 && my > 12 && my < 48) {
      if (!audioSupported) {
        game.message = 'Audio not supported in your browser.';
        game.messageTimer = now();
      } else {
        if (!audioEnabled) {
          enableAudioOnGesture().then(() => {
            audioEnabled = true;
            game.soundOn = true;
            game.message = 'Audio enabled.';
            game.messageTimer = now();
          });
        } else {
          game.soundOn = !game.soundOn;
          if (masterGain) {
            masterGain.gain.value = game.soundOn ? 0.9 : 0.0;
          }
          game.message = game.soundOn ? 'Sound on' : 'Sound off';
          game.messageTimer = now();
        }
      }
      return;
    }

    // submit button area
    if (mx > 540 && mx < 700 && my > 360 && my < 440) {
      submitSelection();
      return;
    }

    // restart when finished
    if (!game.running && mx > 300 && mx < 420 && my > 300 && my < 340) {
      resetGame();
      playTone(520, 0.12, 'sine', 0.08);
      return;
    }

    // gear clicks
    for (let g of game.availableGears) {
      const dx = mx - g.x;
      const dy = my - g.y;
      if (dx * dx + dy * dy <= g.radius * g.radius) {
        toggleGearSelection(g.id);
        return;
      }
    }
  });

  canvas.addEventListener('keydown', (e) => {
    // Space toggles audio (and enable if not enabled)
    if (e.code === 'Space') {
      e.preventDefault();
      if (!audioSupported) {
        game.message = 'Audio not supported.';
        game.messageTimer = now();
      } else {
        if (!audioEnabled) {
          enableAudioOnGesture().then(() => {
            audioEnabled = true;
            game.soundOn = true;
            game.message = 'Audio enabled.';
            game.messageTimer = now();
          });
        } else {
          game.soundOn = !game.soundOn;
          if (masterGain) masterGain.gain.value = game.soundOn ? 0.9 : 0.0;
          game.message = game.soundOn ? 'Sound on' : 'Sound off';
          game.messageTimer = now();
        }
      }
      return;
    }

    // numbers 1-5 select gears
    if (/Digit[1-5]/.test(e.code) || /Numpad[1-5]/.test(e.code)) {
      e.preventDefault();
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && game.availableGears[num - 1]) {
        toggleGearSelection(game.availableGears[num - 1].id);
      }
      return;
    }

    // Enter to submit
    if (e.code === 'Enter') {
      e.preventDefault();
      submitSelection();
      return;
    }

    // R to restart
    if (e.code === 'KeyR') {
      e.preventDefault();
      resetGame();
    }
  });

  // Pointer move: hover detection
  let pointer = { x: -1, y: -1, over: null };
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    pointer.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    pointer.over = null;
    for (let i = 0; i < game.availableGears.length; i++) {
      const g = game.availableGears[i];
      const dx = pointer.x - g.x;
      const dy = pointer.y - g.y;
      if (dx * dx + dy * dy <= g.radius * g.radius) {
        pointer.over = i;
        break;
      }
    }
  });
  canvas.addEventListener('mouseleave', () => {
    pointer.x = -1;
    pointer.y = -1;
    pointer.over = null;
  });

  // Ensure canvas gets focus
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (e) {}
  }, 200);

  // -------------------------
  // Visual helpers & animations
  // -------------------------
  // Rounded rect utility
  function roundedRectPath(x, y, w, h, r) {
    const path = new Path2D();
    const rr = Math.min(r, w / 2, h / 2);
    path.moveTo(x + rr, y);
    path.arcTo(x + w, y, x + w, y + h, rr);
    path.arcTo(x + w, y + h, x, y + h, rr);
    path.arcTo(x, y + h, x, y, rr);
    path.arcTo(x, y, x + w, y, rr);
    path.closePath();
    return path;
  }

  // Draw gear using only canvas primitives
  function drawGear(x, y, radius, teeth, angle, baseColor, rimColor, subtleShadow = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (subtleShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
    }
    // main rim
    ctx.beginPath();
    ctx.fillStyle = baseColor;
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 3;
    ctx.arc(0, 0, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // decorative spokes
    const spokeCount = 6;
    for (let s = 0; s < spokeCount; s++) {
      const a = (s / spokeCount) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.12, Math.sin(a) * radius * 0.12);
      ctx.lineTo(Math.cos(a) * radius * 0.44, Math.sin(a) * radius * 0.44);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // teeth: short thick strokes for visual charm
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const x1 = Math.cos(a) * radius * 0.68;
      const y1 = Math.sin(a) * radius * 0.68;
      const x2 = Math.cos(a) * radius * 0.98;
      const y2 = Math.sin(a) * radius * 0.98;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = rimColor;
      ctx.stroke();
    }

    // center bolt
    ctx.beginPath();
    ctx.fillStyle = '#2b3b3d';
    ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Machine shake timer
  let machineShakeUntil = 0;
  function shakeMachine(ms = 120) {
    machineShakeUntil = now() + ms;
  }

  // Confetti / celebration particles
  const particles = [];
  function spawnConfetti(count, centerX, centerY) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 180 + 60;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed * 0.01,
        vy: Math.sin(angle) * speed * 0.01 - Math.random() * 0.6,
        life: Math.random() * 900 + 600,
        born: now(),
        size: Math.random() * 6 + 4,
        color: ['#ffd27f', '#ff9aa2', '#9fe5d3', '#ffd3a3', '#b8d7ff'][Math.floor(Math.random() * 5)],
        rotation: Math.random() * Math.PI * 2,
        spin: Math.random() * 0.06 - 0.03,
      });
    }
  }

  // Clean up old particles
  function updateParticles(dt) {
    const t = now();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = t - p.born;
      if (age > p.life) {
        particles.splice(i, 1);
        continue;
      }
      // physics
      p.vy += 0.00098 * dt * 0.06; // gravity tiny
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.rotation += p.spin;
    }
  }

  // -------------------------
  // Drawing loop & visuals
  // -------------------------
  let lastFrame = now();
  function draw() {
    const tNow = now();
    const dt = tNow - lastFrame;
    lastFrame = tNow;

    // Update gear angles gently (visual only)
    for (let i = 0; i < game.availableGears.length; i++) {
      const g = game.availableGears[i];
      // while selected, speed up slightly
      const sel = game.selected.indexOf(g.id) >= 0;
      const speed = g.spinSpeed * (sel ? 4 : 1);
      g.angle = (g.angle || 0) + speed * dt;
      // subtle bobbing for selected ones
      if (sel) {
        g.y = g.baseY - 8 * Math.abs(Math.sin(tNow * 0.005 + g.wobbleOffset));
      } else {
        g.y = g.baseY + Math.sin(tNow * 0.002 + i) * 1.2;
      }
    }

    // Update particles
    updateParticles(dt);

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background: soft gradient with subtle geometric overlay for depth
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#f8fbff');
    bg.addColorStop(0.6, '#eef9fb');
    bg.addColorStop(1, '#e6f6f8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Very light gear silhouettes in background (repeating pattern)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#9fd6df';
    for (let i = 0; i < 8; i++) {
      const gx = (i % 4) * 180 + (Math.sin(tNow * 0.0003 + i) * 8);
      const gy = Math.floor(i / 4) * 120 + 40 + (Math.cos(tNow * 0.0004 + i) * 6);
      drawGear(gx, gy, 38, 10, (tNow * 0.0002 + i) % (Math.PI * 2), '#ffffff', '#cde8ea', false);
    }
    ctx.restore();

    // Wavy ground
    ctx.beginPath();
    ctx.moveTo(0, 360);
    for (let x = 0; x <= 720; x += 10) {
      ctx.lineTo(x, 360 + Math.sin(x * 0.02 + tNow * 0.001) * 10 + 4 * Math.sin(tNow * 0.002 + x * 0.01));
    }
    ctx.lineTo(720, 480);
    ctx.lineTo(0, 480);
    ctx.closePath();
    ctx.fillStyle = '#dff5f7';
    ctx.fill();

    // Title / header
    ctx.fillStyle = '#0f4b52';
    ctx.font = '24px "Comic Sans MS", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Machine Math — Fix the Wacky Machines!', 18, 34);

    // Top right audio control box
    ctx.save();
    const audioBox = roundedRectPath(640, 12, 74, 36, 8);
    ctx.fillStyle = audioSupported ? '#eaf8f3' : '#f2f2f2';
    ctx.fill(audioBox);
    ctx.strokeStyle = '#b6d7d3';
    ctx.lineWidth = 2;
    ctx.stroke(audioBox);

    // Speaker symbol
    ctx.fillStyle = '#05373a';
    ctx.beginPath();
    ctx.moveTo(654, 30);
    ctx.lineTo(666, 22);
    ctx.lineTo(666, 38);
    ctx.closePath();
    ctx.fill();

    // waves or muted cross
    ctx.strokeStyle = '#05373a';
    ctx.lineWidth = 2;
    if (audioSupported && audioEnabled && game.soundOn) {
      ctx.beginPath();
      ctx.arc(676, 30, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(686, 30, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(670, 20);
      ctx.lineTo(704, 40);
      ctx.moveTo(704, 20);
      ctx.lineTo(670, 40);
      ctx.stroke();
    }
    ctx.restore();

    // Machine body (a friendlier, vintage robot) with subtle shadow and glow
    const machineX = 120;
    const machineY = 120;
    ctx.save();
    // machine shadow
    ctx.fillStyle = 'rgba(8,26,28,0.06)';
    ctx.fillRect(machineX - 30, machineY + 60, 420, 160);

    // body
    const shakeOffset = now() < machineShakeUntil ? Math.sin(now() * 0.06) * 6 : 0;
    ctx.translate(machineX + shakeOffset, machineY);
    const bodyPath = roundedRectPath(0, 0, 360, 200, 24);
    ctx.fillStyle = '#fff4e9';
    ctx.fill(bodyPath);
    ctx.strokeStyle = '#cfa874';
    ctx.lineWidth = 4;
    ctx.stroke(bodyPath);

    // control screen with a subtle glow when selection is close to correct
    const sum = currentSum();
    const ratio = clamp(sum / Math.max(1, game.target), 0, 1);
    const glow = Math.min(0.12 + ratio * 0.18, 0.28);
    ctx.save();
    ctx.fillStyle = `rgba(225, 247, 255, ${0.95})`;
    ctx.fillRect(20, 20, 250, 110);
    ctx.strokeStyle = '#89b4c1';
    ctx.strokeRect(20, 20, 250, 110);
    // subtle flicker line
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(120,200,210,${glow})`;
    ctx.fillRect(20, 20 + Math.sin(now() * 0.002) * 6 + 80 * (1 - ratio), 250, 6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // playful dial
    ctx.beginPath();
    ctx.fillStyle = '#ffdcb2';
    ctx.arc(310, 60, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#caa368';
    ctx.stroke();

    ctx.restore();

    // Target display prominently inside machine screen
    ctx.fillStyle = '#082f34';
    ctx.font = '48px "Comic Sans MS", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Target: ' + game.target, 220, 92);

    // Instruction area
    ctx.fillStyle = '#04515a';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Choose up to 3 gears so their numbers add to the target.', 18, 70);
    ctx.fillText('Click a gear or press keys 1-5 to pick. Press Enter to run.', 18, 88);
    ctx.fillText('Rounds: ' + game.round + ' / ' + game.maxRounds + '   Solved: ' + game.solvedCount, 18, 106);

    // Draw the available gears (animated)
    for (let i = 0; i < game.availableGears.length; i++) {
      const g = game.availableGears[i];
      const selected = game.selected.indexOf(g.id) >= 0;
      const hover = pointer.over === i;
      // Colors for states
      const baseColor = selected ? '#fff3db' : '#ffffff';
      const rimColor = selected ? '#c77b00' : '#3e6a6f';
      // light glow when hovering
      if (hover) {
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = 'rgba(34,140,120,0.05)';
        ctx.arc(g.x, g.y, g.radius + 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // gently rotate gear drawing
      drawGear(g.x, g.y, g.radius + (hover ? 4 : 0), 12 + (i % 3), g.angle, baseColor, rimColor);

      // number label
      ctx.fillStyle = '#052425';
      ctx.font = selected ? 'bold 22px Arial' : 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(g.value, g.x, g.y + 6);

      // index label
      ctx.fillStyle = '#065257';
      ctx.font = '12px Arial';
      ctx.fillText(String(i + 1), g.x + g.radius - 10, g.y + g.radius - 6);
    }

    // Conveyor belt under gears
    ctx.fillStyle = '#cfeff2';
    ctx.fillRect(40, 302, 640, 36);
    ctx.strokeStyle = '#b1d6d9';
    ctx.strokeRect(40, 302, 640, 36);

    // Submit button (Run Machine)
    ctx.save();
    const runPath = roundedRectPath(540, 360, 160, 80, 14);
    ctx.fillStyle = '#86dbcf';
    ctx.fill(runPath);
    ctx.strokeStyle = '#28776e';
    ctx.lineWidth = 3;
    ctx.stroke(runPath);

    ctx.fillStyle = '#033c36';
    ctx.font = '22px "Comic Sans MS", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Run Machine', 620, 402);
    ctx.font = '14px Arial';
    ctx.fillText('Enter or Click', 620, 426);
    ctx.restore();

    // Current sum area and progress bar
    ctx.fillStyle = '#053b3f';
    ctx.font = '18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Current Sum: ' + currentSum(), 18, 160);

    // progress bar background
    ctx.fillStyle = '#e6fbf5';
    ctx.fillRect(18, 172, 300, 18);
    // gradient fill based on ratio
    const pr = ctx.createLinearGradient(18, 172, 318, 172);
    pr.addColorStop(0, '#a6e2c8');
    pr.addColorStop(1, '#28b383');
    ctx.fillStyle = pr;
    ctx.fillRect(18, 172, 300 * ratio, 18);
    ctx.strokeStyle = '#0b2b28';
    ctx.strokeRect(18, 172, 300, 18);

    // message box
    if (game.message && now() - game.messageTimer < 4200) {
      const mx = 360,
        myg = 20,
        mw = 340,
        mh = 72;
      ctx.save();
      const mp = roundedRectPath(mx, myg, mw, mh, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fill(mp);
      ctx.strokeStyle = '#7aa8ad';
      ctx.lineWidth = 2;
      ctx.stroke(mp);
      ctx.fillStyle = '#063b3d';
      ctx.font = '16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(game.message, mx + 16, myg + 34);
      ctx.restore();
    }

    // audio hint
    ctx.fillStyle = '#05444f';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    if (!audioSupported) {
      ctx.fillText('Audio: not supported', 380, 130);
    } else {
      ctx.fillText(
        'Audio: ' +
          (audioEnabled ? (game.soundOn ? 'on' : 'muted') : 'off (press Space or click speaker)'),
        380,
        130
      );
    }

    // Draw particles (confetti)
    for (let p of particles) {
      const age = now() - p.born;
      const lifeRatio = clamp(1 - age / p.life, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = lifeRatio;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    // Victory overlay when finished
    if (!game.running) {
      ctx.save();
      ctx.fillStyle = 'rgba(3,50,54,0.88)';
      ctx.fillRect(120, 220, 480, 170);
      ctx.fillStyle = '#fff';
      ctx.font = '28px "Comic Sans MS", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('All Machines Fixed!', 360, 270);
      ctx.font = '18px Arial';
      ctx.fillText('You helped the machines hum happily. Great job!', 360, 300);

      // Restart button
      const rp = roundedRectPath(300, 300, 120, 40, 10);
      ctx.fillStyle = '#ffd27f';
      ctx.fill(rp);
      ctx.fillStyle = '#052425';
      ctx.font = '16px Arial';
      ctx.fillText('Play Again', 360, 328);
      ctx.restore();
    }

    // Update ARIA label for screen reader context
    const sumNow = currentSum();
    canvas.setAttribute(
      'aria-label',
      `Machine Math. Round ${game.round} of ${game.maxRounds}. Target ${game.target}. Current sum ${sumNow}. Use keys 1 to ${game.availableGears.length} to pick gear, Enter to run machine. Audio ${
        audioSupported ? (audioEnabled ? (game.soundOn ? 'on' : 'muted') : 'off') : 'not supported'
      }.`
    );

    // Schedule next frame
    requestAnimationFrame(draw);
  }

  // Start loop
  draw();

  // -------------------------
  // Small tutorial and initial messages
  // -------------------------
  game.message = 'Welcome! Use keys 1-5 or click gears, press Enter to run. Fix all machines!';
  game.messageTimer = now();

  // Informative audio-state message
  if (!audioSupported) {
    game.message = 'Your browser does not support Web Audio. Sound disabled.';
    game.messageTimer = now();
  } else {
    if (audioContext && audioContext.state === 'suspended') {
      game.message = 'Press Space or click the speaker to enable sound.';
      game.messageTimer = now();
    } else {
      audioEnabled = audioContext ? audioContext.state === 'running' : false;
      game.soundOn = audioEnabled;
      if (audioEnabled && masterGain) masterGain.gain.value = 0.9;
    }
  }
})();