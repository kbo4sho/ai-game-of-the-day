(function () {
  // Machine Math — Visual & Audio Enhancements
  // Note: Only visuals and audio have been enhanced. Core game mechanics and math logic are unchanged.

  const STAGE_ID = 'game-of-the-day-stage';
  const WIDTH = 720;
  const HEIGHT = 480;

  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error('Game stage element with ID "' + STAGE_ID + '" not found.');
    return;
  }

  // Clear existing content and setup stage
  stage.innerHTML = '';
  stage.style.position = 'relative';
  stage.style.width = WIDTH + 'px';
  stage.style.height = HEIGHT + 'px';
  stage.style.userSelect = 'none';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Machine Math game. Use left and right arrows to pick a gear, press Enter to place it. Press M to toggle sound, R to restart.'
  );
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  canvas.style.display = 'block';
  canvas.style.background = 'transparent';
  stage.appendChild(canvas);

  // Offscreen live region
  const a11y = document.createElement('div');
  a11y.setAttribute('role', 'status');
  a11y.setAttribute('aria-live', 'polite');
  a11y.style.position = 'absolute';
  a11y.style.left = '-10000px';
  a11y.style.width = '1px';
  a11y.style.height = '1px';
  a11y.style.overflow = 'hidden';
  stage.appendChild(a11y);

  // Controls for accessibility
  const controls = document.createElement('div');
  controls.style.position = 'absolute';
  controls.style.right = '8px';
  controls.style.top = '8px';
  controls.style.fontSize = '12px';
  controls.style.fontFamily = 'sans-serif';
  controls.style.color = '#333';
  stage.appendChild(controls);

  const soundIndicator = document.createElement('button');
  soundIndicator.textContent = 'Sound: On';
  soundIndicator.setAttribute('aria-pressed', 'true');
  soundIndicator.style.padding = '6px 8px';
  soundIndicator.style.marginBottom = '4px';
  soundIndicator.style.cursor = 'pointer';
  controls.appendChild(soundIndicator);

  const restartButton = document.createElement('button');
  restartButton.textContent = 'Restart (R)';
  restartButton.style.display = 'block';
  restartButton.style.padding = '6px 8px';
  restartButton.style.cursor = 'pointer';
  controls.appendChild(restartButton);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get 2D context on canvas.');
    a11y.textContent = 'Error: Canvas not available.';
    return;
  }

  // Helper
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // -------------------------
  // Audio setup (Web Audio API)
  // -------------------------
  let audioEnabled = true;
  let audioContext = null;
  let masterGain = null;
  let ambient = null; // ambient source container
  let clickEnabled = true;

  function tryCreateAudioContext() {
    if (audioContext) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported.');
      audioContext = new AC();

      // create master gain
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioContext.destination);

      // Build a gentle ambient pad using two detuned oscillators and a slow LFO on filter
      const ambGain = audioContext.createGain();
      ambGain.gain.value = 0.025; // subtle
      ambGain.connect(masterGain);

      const oscA = audioContext.createOscillator();
      oscA.type = 'sine';
      oscA.frequency.value = 120; // low pad
      const oscB = audioContext.createOscillator();
      oscB.type = 'sine';
      oscB.frequency.value = 150; // detuned

      // slight stereo-ish effect using gain nodes panned by tiny delays
      const splitter = audioContext.createChannelSplitter(2);
      const merger = audioContext.createChannelMerger(2);

      // Use filter for warmth
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;

      // LFO for filter movement
      const lfo = audioContext.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // small amplitude LFO for volume breathing
      const ampLFO = audioContext.createOscillator();
      ampLFO.frequency.value = 0.08;
      const ampLFOGain = audioContext.createGain();
      ampLFOGain.gain.value = 0.005;
      ampLFO.connect(ampLFOGain);
      ampLFOGain.connect(ambGain.gain);

      // connect oscillators -> filter -> gain
      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(ambGain);

      // start
      oscA.start();
      oscB.start();
      lfo.start();
      ampLFO.start();

      ambient = { oscA, oscB, filter, lfo, lfoGain, ambGain, ampLFO, ampLFOGain };
    } catch (err) {
      console.warn('Audio init failed', err);
      audioEnabled = false;
      audioContext = null;
      a11y.textContent = 'Audio unavailable. Continuing without sound.';
      soundIndicator.textContent = 'Sound: Off';
      soundIndicator.setAttribute('aria-pressed', 'false');
    }
  }

  function startBackground() {
    if (!audioEnabled) return;
    try {
      tryCreateAudioContext();
      if (!audioContext || !ambient) return;
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
      // nothing else to do - ambient is running on create
    } catch (e) {
      console.warn('startBackground error', e);
    }
  }

  // Utility: small noise buffer generator
  function createNoiseBuffer(duration = 0.2) {
    if (!audioContext) return null;
    const sr = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, Math.floor(sr * duration), sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.5);
    }
    return buffer;
  }

  // Sound effects
  function playTone({
    type = 'sine',
    freq = 440,
    duration = 0.2,
    attack = 0.01,
    release = 0.06,
    gain = 0.12,
    detune = 0
  } = {}) {
    if (!audioEnabled) return;
    try {
      tryCreateAudioContext();
      if (!audioContext) return;
      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + attack);
      g.gain.linearRampToValueAtTime(0.0001, now + duration - release);
      g.gain.linearRampToValueAtTime(0, now + duration + 0.001);
      o.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('playTone error', e);
    }
  }

  function playClick() {
    if (!audioEnabled) return;
    try {
      tryCreateAudioContext();
      if (!audioContext) return;
      const now = audioContext.currentTime;
      // short blip with tiny noise burst for tactile feel
      const o = audioContext.createOscillator();
      o.type = 'square';
      o.frequency.value = 1200;
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.001);
      g.gain.linearRampToValueAtTime(0.0001, now + 0.06);
      o.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + 0.07);

      // short noise click
      const nb = createNoiseBuffer(0.06);
      if (nb) {
        const src = audioContext.createBufferSource();
        src.buffer = nb;
        const ng = audioContext.createGain();
        ng.gain.value = 0.02;
        src.connect(ng);
        ng.connect(masterGain);
        src.start(now);
      }
    } catch (err) {
      console.warn('playClick error', err);
    }
  }

  function playCorrect() {
    if (!audioEnabled) return;
    try {
      tryCreateAudioContext();
      if (!audioContext) return;
      const now = audioContext.currentTime;
      // pleasant 3-note arpeggio with soft triangle waves and a gentle filter
      const notes = [660, 880, 990];
      notes.forEach((f, i) => {
        const o = audioContext.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now + i * 0.08);
        g.gain.linearRampToValueAtTime(0.09, now + i * 0.08 + 0.01);
        g.gain.linearRampToValueAtTime(0.0001, now + i * 0.08 + 0.24);
        o.connect(g);
        g.connect(masterGain);
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.28);
      });

      // sprinkle tiny chime harmonics
      setTimeout(() => {
        playTone({
          type: 'sine',
          freq: 1320,
          duration: 0.18,
          attack: 0.005,
          release: 0.06,
          gain: 0.05
        });
      }, 220);
    } catch (e) {
      console.warn('playCorrect error', e);
    }
  }

  function playIncorrect() {
    if (!audioEnabled) return;
    try {
      tryCreateAudioContext();
      if (!audioContext) return;
      const now = audioContext.currentTime;
      // low damped thud
      const o = audioContext.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(120, now);
      o.frequency.exponentialRampToValueAtTime(40, now + 0.18);

      const f = audioContext.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;

      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + 0.42);

      // quick noise 'sizzle' to accent
      const nb = createNoiseBuffer(0.12);
      if (nb) {
        const src = audioContext.createBufferSource();
        src.buffer = nb;
        const ng = audioContext.createGain();
        ng.gain.value = 0.03;
        src.connect(ng);
        ng.connect(masterGain);
        src.start(now + 0.02);
      }
    } catch (err) {
      console.warn('playIncorrect error', err);
    }
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    soundIndicator.textContent = 'Sound: ' + (audioEnabled ? 'On' : 'Off');
    soundIndicator.setAttribute('aria-pressed', audioEnabled ? 'true' : 'false');
    if (audioEnabled) {
      tryCreateAudioContext();
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
      // slowly restore ambient
      if (ambient && ambient.ambGain) {
        ambient.ambGain.gain.cancelScheduledValues(audioContext.currentTime);
        ambient.ambGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        ambient.ambGain.gain.linearRampToValueAtTime(0.025, audioContext.currentTime + 0.6);
      }
    } else {
      if (ambient && ambient.ambGain) {
        ambient.ambGain.gain.cancelScheduledValues(audioContext.currentTime);
        ambient.ambGain.gain.setValueAtTime(ambient.ambGain.gain.value, audioContext.currentTime);
        ambient.ambGain.gain.linearRampToValueAtTime(0.0, audioContext.currentTime + 0.4);
      }
    }
    a11y.textContent = audioEnabled ? 'Sound enabled.' : 'Sound disabled.';
  }

  soundIndicator.addEventListener('click', () => {
    toggleAudio();
    playClick();
    canvas.focus();
  });

  restartButton.addEventListener('click', () => {
    playClick();
    resetGame();
    canvas.focus();
  });

  // -------------------------
  // Game logic (unchanged mechanics)
  // -------------------------
  let animationFrameId = null;
  let lastTime = 0;

  const MAX_LIVES = 3;

  const state = {
    levelIndex: 0,
    lives: MAX_LIVES,
    score: 0,
    gears: [],
    selectedIndex: 0,
    phase: 'intro',
    machineBase: 0,
    machineTarget: 0,
    awaiting: false,
    timeSincePhaseStart: 0,
    showAudioCue: false,
    placing: null,
    lastClickGear: null,
    lastClickTime: 0,
    // visual helpers
    particles: [],
    shake: 0
  };

  const LEVEL_COUNT = 8;
  const levels = [];
  (function generateLevels() {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      let base = randInt(1, Math.min(9, 2 + i));
      let diff = randInt(1, Math.min(9, 3 + Math.floor(i / 2)));
      let target = base + diff;
      const needsSubtract = Math.random() < 0.15 && base > 1;
      if (needsSubtract) {
        const reduce = randInt(1, Math.min(base - 1, 4));
        target = base - reduce;
      }
      levels.push({ base, target });
    }
  })();

  function prepareLevel(index) {
    const level = levels[index];
    state.machineBase = level.base;
    state.machineTarget = level.target;
    state.phase = 'play';
    state.awaiting = false;
    state.timeSincePhaseStart = 0;
    state.selectedIndex = 0;
    const diff = state.machineTarget - state.machineBase;
    const correct = diff;
    const options = new Set();
    options.add(correct);
    while (options.size < 3) {
      let pick;
      if (Math.random() < 0.6) {
        pick = correct + randInt(-3, 3);
      } else {
        pick = randInt(-4, 9);
      }
      if (pick === correct) continue;
      if (pick === 0 && correct !== 0) continue;
      options.add(pick);
    }
    const arr = Array.from(options);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    state.gears = arr.map((value, i) => {
      return {
        id: i,
        value,
        x: WIDTH + i * 160 + randInt(0, 60),
        y: 320 + (i % 2) * -18 + randInt(-6, 6),
        radius: 36 + randInt(-4, 8),
        speed: 40 + randInt(-10, 30) + i * 8,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() * 0.5 + 0.2) * (i % 2 === 0 ? 1 : -1)
      };
    });
    announce(
      `Level ${index + 1}. Machine shows ${state.machineBase} aiming for ${state.machineTarget}. Choose the gear that makes ${state.machineBase} become ${state.machineTarget}.`
    );
  }

  function resetGame() {
    state.levelIndex = 0;
    state.lives = MAX_LIVES;
    state.score = 0;
    state.phase = 'intro';
    state.timeSincePhaseStart = 0;
    prepareLevel(0);
    startBackground();
    draw();
    a11y.textContent = 'Game restarted. Press Enter to begin.';
  }

  prepareLevel(0);
  startBackground();

  // -------------------------
  // Interaction
  // -------------------------
  canvas.addEventListener('keydown', (e) => {
    const key = e.key;
    if (state.phase === 'intro') {
      if (key === 'Enter' || key === ' ') {
        state.phase = 'play';
        a11y.textContent = 'Game started. Use left and right to move, Enter to choose a gear.';
        e.preventDefault();
        playClick();
        return;
      }
    }

    if (key === 'ArrowLeft') {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      playClick();
      e.preventDefault();
    } else if (key === 'ArrowRight') {
      state.selectedIndex = Math.min(state.gears.length - 1, state.selectedIndex + 1);
      playClick();
      e.preventDefault();
    } else if (key === 'Enter' || key === ' ') {
      attemptPlaceGear(state.selectedIndex);
      e.preventDefault();
    } else if (key.toLowerCase() === 'm') {
      toggleAudio();
      playClick();
    } else if (key.toLowerCase() === 'r') {
      resetGame();
      playClick();
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (let i = 0; i < state.gears.length; i++) {
      const g = state.gears[i];
      const dx = mx - g.x;
      const dy = my - g.y;
      if (dx * dx + dy * dy <= g.radius * g.radius) {
        state.selectedIndex = i;
        playClick();
        const now = performance.now();
        if (state.lastClickGear === i && now - state.lastClickTime < 400) {
          attemptPlaceGear(i);
        }
        state.lastClickGear = i;
        state.lastClickTime = now;
        break;
      }
    }
    canvas.focus();
  });

  function attemptPlaceGear(index) {
    if (state.phase !== 'play') return;
    const gear = state.gears[index];
    if (!gear) return;
    state.phase = 'placing';
    state.awaiting = true;
    state.timeSincePhaseStart = 0;
    state.placing = {
      gearIndex: index,
      startX: gear.x,
      startY: gear.y,
      progress: 0
    };
    playClick();
    a11y.textContent = `You picked gear ${gear.value}. Placing...`;
  }

  function evaluatePlacement(gearValue) {
    const required = state.machineTarget - state.machineBase;
    if (gearValue === required) {
      state.score += 10;
      state.phase = 'correct';
      state.timeSincePhaseStart = 0;
      a11y.textContent = `Great! That was correct. Machine now reaches ${state.machineTarget}.`;
      playCorrect();
      spawnConfetti();
      // proceed
      setTimeout(() => {
        state.levelIndex++;
        if (state.levelIndex >= LEVEL_COUNT) {
          state.phase = 'win';
          a11y.textContent = `Congratulations! You fixed all machines. Score ${state.score}. Press R to play again.`;
        } else {
          prepareLevel(state.levelIndex);
        }
      }, 900);
    } else {
      state.lives--;
      state.phase = 'incorrect';
      state.timeSincePhaseStart = 0;
      a11y.textContent = `Oops. That gear did not work. ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} remaining.`;
      playIncorrect();
      // screen shake
      state.shake = 12;
      setTimeout(() => {
        if (state.lives <= 0) {
          state.phase = 'gameover';
          a11y.textContent = `Game over. Score ${state.score}. Press R to try again.`;
        } else {
          prepareLevel(state.levelIndex);
        }
      }, 900);
    }
  }

  // -------------------------
  // Visual enhancements
  // -------------------------
  // particle/confetti system
  function spawnConfetti() {
    const count = 36;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 160;
      const life = 1200 + Math.random() * 800;
      state.particles.push({
        x: 410,
        y: 290,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        size: 6 + Math.random() * 8,
        color: ['#FFB86B', '#7AE7C7', '#FFD3E0', '#A7D2FF', '#FFD08A'][Math.floor(Math.random() * 5)],
        life,
        age: 0,
        rot: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 0.3
      });
    }
  }

  // Drawing helpers
  function clear() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
  }

  function drawBackground(t) {
    // sky gradient with gentle warmth
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#f4fbff');
    g.addColorStop(0.5, '#eaf6ff');
    g.addColorStop(1, '#fbfbfd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft distant hills (parallax)
    const hillColors = ['#e3f3ff', '#d5ecff', '#cbe6ff'];
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      const yBase = 120 + layer * 40;
      const amplitude = 18 + layer * 8;
      ctx.moveTo(0, HEIGHT);
      for (let x = 0; x <= WIDTH; x += 40) {
        const nx = x / WIDTH;
        const y = yBase + Math.sin(nx * Math.PI * (2 + layer) + t / 1200 * (1 + layer)) * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.closePath();
      ctx.fillStyle = hillColors[layer];
      ctx.globalAlpha = 0.9 - layer * 0.15;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // soft floating orbs
    for (let i = 0; i < 6; i++) {
      const bx = (i * 173 + t * 0.03 * (i + 1)) % (WIDTH + 200) - 80;
      const by = 50 + ((i * 97) % 140) + 8 * Math.sin(t / 800 + i);
      ctx.beginPath();
      ctx.fillStyle = ['rgba(255,240,230,0.08)', 'rgba(230,255,250,0.08)', 'rgba(240,245,255,0.08)'][i % 3];
      ctx.arc(bx, by, 36 + (i % 3) * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // friendly sun/spotlight
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,250,220,0.06)';
    ctx.arc(620, 60, 100, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawConveyor(t) {
    // stylized conveyor with soft shadow and subtle gloss
    ctx.save();
    roundRect(ctx, 50, 260, 620, 110, 20);
    ctx.fillStyle = '#e9f4fb';
    ctx.fill();

    // glossy band
    ctx.beginPath();
    ctx.rect(60, 270, 600, 90);
    ctx.clip();
    const move = (t / 18) % 80;
    for (let i = -1; i < 20; i++) {
      const stripeX = 60 + i * 80 + move;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(154,190,210,0.12)' : 'rgba(154,190,210,0.06)';
      ctx.fillRect(stripeX, 270, 40, 90);
    }
    ctx.restore();

    // bolts and shadow
    for (let i = 0; i < 8; i++) {
      const x = 70 + i * 86;
      drawBolt(x, 282);
      drawBolt(x, 342);
    }
    // subtle conveyor shadow
    ctx.fillStyle = 'rgba(10,20,30,0.04)';
    ctx.fillRect(60, 360, 600, 6);
  }

  function drawBolt(x, y) {
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,40,60,0.12)';
    ctx.stroke();
  }

  function drawMachine(t) {
    // main body
    ctx.save();
    // panel shadow
    ctx.fillStyle = '#dff1ff';
    roundRect(ctx, 120, 60, 420, 180, 20);
    ctx.fill();

    // inner panel with subtle inset
    ctx.beginPath();
    roundRect(ctx, 132, 74, 396, 156, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // screen area showing values
    ctx.fillStyle = '#123';
    ctx.font = '20px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Base: ${state.machineBase}`, 144, 112);
    ctx.fillText(`Target: ${state.machineTarget}`, 144, 142);

    // animated friendly eyes (robot)
    const eyeX = 470;
    const eyeY = 160;
    const pupilOffset = Math.sin(t / 600) * 4;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f2b3a';
    ctx.beginPath();
    ctx.arc(eyeX - 8 + pupilOffset, eyeY - 4, 8, 0, Math.PI * 2);
    ctx.arc(eyeX + 12 + pupilOffset, eyeY - 4, 8, 0, Math.PI * 2);
    ctx.fill();

    // smile
    ctx.strokeStyle = '#123';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(458, 175);
    ctx.quadraticCurveTo(470, 186 + Math.sin(t / 400) * 2, 482, 175);
    ctx.stroke();

    ctx.restore();

    // placement slot with gentle inner glow
    ctx.save();
    roundRect(ctx, 330, 250, 160, 76, 12);
    ctx.fillStyle = '#f7fbff';
    ctx.fill();
    // inner border
    ctx.strokeStyle = '#d6eaf7';
    ctx.lineWidth = 2;
    ctx.stroke();

    // label
    ctx.fillStyle = '#4b6b7d';
    ctx.font = '16px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Place Gear Here', 410, 290);

    // small target indicator
    ctx.beginPath();
    ctx.fillStyle = '#e6f9f1';
    ctx.arc(410, 270, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c6e8de';
    ctx.stroke();

    ctx.restore();
  }

  function drawGears(t, dt) {
    for (let i = 0; i < state.gears.length; i++) {
      const g = state.gears[i];

      // motion updates
      if (state.phase === 'play') {
        g.x -= g.speed * (dt / 1000);
        g.rotation += g.rotSpeed * (dt / 1000);
        if (g.x < -80) {
          g.x = WIDTH + randInt(40, 160);
          g.y = 300 + randInt(-20, 20);
        }
      } else if (state.phase === 'placing') {
        // non-placed gears still drift slightly
        if (!(state.placing && state.placing.gearIndex === g.id)) {
          g.x -= g.speed * 0.3 * (dt / 1000);
          g.rotation += g.rotSpeed * 0.6 * (dt / 1000);
          if (g.x < -80) g.x = WIDTH + randInt(40, 160);
        }
      }

      // if placing for this gear, draw in placing function
      if (state.phase === 'placing' && state.placing && state.placing.gearIndex === i) {
        continue;
      }

      // draw gear with depth, shadow and subtle texture
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rotation);

      // drop shadow
      ctx.beginPath();
      ctx.ellipse(6, g.radius + 20, g.radius * 0.9, g.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,20,30,0.09)';
      ctx.fill();

      // teeth
      const teeth = 10;
      for (let j = 0; j < teeth; j++) {
        const angle = (j / teeth) * Math.PI * 2;
        const tx = Math.cos(angle) * (g.radius + 8);
        const ty = Math.sin(angle) * (g.radius + 8);
        ctx.beginPath();
        ctx.fillStyle = '#fff';
        ctx.arc(tx, ty, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // gear body with soft gradient
      const grad = ctx.createRadialGradient(-g.radius * 0.3, -g.radius * 0.3, g.radius * 0.2, 0, 0, g.radius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#e6f4ff');
      ctx.beginPath();
      ctx.fillStyle = grad;
      ctx.arc(0, 0, g.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#bcd6e4';
      ctx.lineWidth = 3;
      ctx.stroke();

      // small center nut
      ctx.beginPath();
      ctx.fillStyle = '#d0e6f3';
      ctx.arc(0, 0, g.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(50,80,100,0.15)';
      ctx.stroke();

      // value text
      ctx.fillStyle = '#123';
      ctx.font = '20px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(g.value), 0, 6);

      // highlight if selected
      if (i === state.selectedIndex) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,165,60,0.45)';
        ctx.lineWidth = 6;
        ctx.arc(0, 0, g.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function drawPlacing(t, dt) {
    if (!state.placing) return;
    const p = state.placing;
    const g = state.gears[p.gearIndex];
    p.progress += dt / 450; // ~450ms travel
    if (p.progress > 1) p.progress = 1;
    const e = easeOutCubic(p.progress);
    const targetX = 410;
    const targetY = 290;
    const x = p.startX + (targetX - p.startX) * e;
    const y = p.startY + (targetY - p.startY) * e;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((t / 800) * 1.3 + p.progress * 1.2);
    const s = 1 + 0.12 * (1 - Math.abs(0.5 - p.progress) * 2);
    ctx.scale(s, s);

    const gr = g.radius;
    // teeth
    for (let j = 0; j < 9; j++) {
      const angle = (j / 9) * Math.PI * 2;
      const tx = Math.cos(angle) * (gr + 6);
      const ty = Math.sin(angle) * (gr + 6);
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.arc(tx, ty, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // body
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.arc(0, 0, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b4cfe0';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#123';
    ctx.font = '20px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(g.value), 0, 6);

    ctx.restore();

    if (p.progress >= 1 && state.awaiting) {
      state.awaiting = false;
      setTimeout(() => {
        evaluatePlacement(g.value);
      }, 150);
    }
  }

  function drawHUD(t) {
    // Lives
    ctx.fillStyle = '#123';
    ctx.font = '16px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Lives:', 16, 26);
    for (let i = 0; i < MAX_LIVES; i++) {
      const x = 80 + i * 22;
      const y = 14;
      heart(ctx, x, y, 12, i < state.lives ? '#ff7b86' : '#f1c7cc');
    }

    // Score center
    ctx.fillStyle = '#123';
    ctx.font = '16px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Score: ' + state.score, WIDTH / 2, 26);

    // Level right
    ctx.textAlign = 'right';
    ctx.fillText(`Level ${state.levelIndex + 1}/${LEVEL_COUNT}`, WIDTH - 12, 26);

    // Sound cue circle
    ctx.beginPath();
    ctx.arc(WIDTH - 30, HEIGHT - 30, 10, 0, Math.PI * 2);
    ctx.fillStyle = audioEnabled ? '#1b9e7a' : '#c8c8c8';
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '11px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText(audioEnabled ? 'On' : 'Off', WIDTH - 30, HEIGHT - 26);

    // short instructions bottom-left
    ctx.fillStyle = '#234';
    ctx.font = '12px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Arrows: move  Enter: place  M: sound  R: restart', 12, HEIGHT - 12);
  }

  function drawOverlay(t) {
    ctx.save();
    if (state.phase === 'intro') {
      ctx.fillStyle = 'rgba(18,30,45,0.06)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#123';
      ctx.font = '32px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Machine Math', WIDTH / 2, HEIGHT / 2 - 40);
      ctx.font = '16px "Segoe UI", Arial';
      ctx.fillText('Get the machine to the target by placing the right gear.', WIDTH / 2, HEIGHT / 2);
      ctx.fillText('Press Enter to start.', WIDTH / 2, HEIGHT / 2 + 28);
    } else if (state.phase === 'correct') {
      // soft celebratory glow
      ctx.fillStyle = 'rgba(255,245,235,0.05)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else if (state.phase === 'incorrect') {
      const alpha = 0.12;
      ctx.fillStyle = `rgba(220,80,80,${alpha})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    } else if (state.phase === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.font = '28px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over', WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = '16px "Segoe UI", Arial';
      ctx.fillText(`Score: ${state.score}`, WIDTH / 2, HEIGHT / 2 + 6);
      ctx.fillText('Press R to restart', WIDTH / 2, HEIGHT / 2 + 34);
    } else if (state.phase === 'win') {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#123';
      ctx.font = '26px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('You fixed all the machines!', WIDTH / 2, HEIGHT / 2 - 10);
      ctx.font = '16px "Segoe UI", Arial';
      ctx.fillText(`Final Score: ${state.score}`, WIDTH / 2, HEIGHT / 2 + 20);
      ctx.fillText('Press R to play again', WIDTH / 2, HEIGHT / 2 + 46);
    }
    ctx.restore();
  }

  function drawParticles(dt) {
    if (!state.particles.length) return;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        state.particles.splice(i, 1);
        continue;
      }
      // physics
      p.vy += 300 * (dt / 1000); // gravity
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      p.rot += p.rotSpeed;
      const lifeRatio = 1 - p.age / p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, lifeRatio);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
  }

  // -------------------------
  // Main loop
  // -------------------------
  function loop(timestamp) {
    const dt = lastTime ? timestamp - lastTime : 16;
    lastTime = timestamp;
    state.timeSincePhaseStart += dt;

    // shake decay
    if (state.shake > 0) {
      state.shake = Math.max(0, state.shake - dt * 0.05);
    }

    // update placing progress already done in drawPlacing
    draw(timestamp, dt);

    animationFrameId = requestAnimationFrame(loop);
  }

  function draw(t = performance.now(), dt = 16) {
    clear();

    // apply global shake transform if present
    ctx.save();
    if (state.shake > 0) {
      const sx = (Math.random() - 0.5) * state.shake;
      const sy = (Math.random() - 0.5) * state.shake;
      ctx.translate(sx, sy);
    }

    drawBackground(t);
    drawConveyor(t);
    drawMachine(t);
    drawGears(t, dt);
    drawPlacing(t, dt);
    drawHUD(t);
    drawOverlay(t);
    drawParticles(dt);

    ctx.restore();
  }

  // Start animation
  animationFrameId = requestAnimationFrame(loop);

  // -------------------------
  // Utility helpers
  // -------------------------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function heart(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.bezierCurveTo(-12, -2, -12, -10, 0, -10);
    ctx.bezierCurveTo(12, -10, 12, -2, 0, 10);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // -------------------------
  // Accessibility announcements
  // -------------------------
  function announce(text) {
    a11y.textContent = text;
    console.log('Announce:', text);
  }

  // -------------------------
  // Cleanup
  // -------------------------
  window.addEventListener('unload', () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (audioContext) {
      try {
        audioContext.close();
      } catch (e) {}
    }
  });

  a11y.textContent = 'Welcome to Machine Math. Press Enter to begin, or use the controls.';
  setTimeout(() => {
    canvas.focus();
  }, 200);

  // Ensure audio starts on user gesture
  function handleFirstInteraction() {
    if (audioEnabled) {
      try {
        tryCreateAudioContext();
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }
      } catch (e) {}
    }
    window.removeEventListener('pointerdown', handleFirstInteraction);
    window.removeEventListener('keydown', handleFirstInteraction);
  }
  window.addEventListener('pointerdown', handleFirstInteraction);
  window.addEventListener('keydown', handleFirstInteraction);
})();