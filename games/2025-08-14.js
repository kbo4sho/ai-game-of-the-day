(function () {
  // Enhanced visuals & audio for "Charge the Robot" math game
  // Renders into the element with ID "game-of-the-day-stage"
  // All visuals are canvas-drawn; audio generated with Web Audio API.
  // Only visuals and audio changed — game mechanics remain intact.

  // Configuration (fixed game area)
  const WIDTH = 720;
  const HEIGHT = 480;
  const MAX_MODULES = 6;

  // Get container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with id "game-of-the-day-stage" not found.');
    return;
  }

  container.setAttribute('role', 'application');
  container.setAttribute(
    'aria-label',
    'Charge the Robot: an addition game. Use keyboard arrows to select or drag modules. Press Enter to place. Press space to toggle sound.'
  );
  container.tabIndex = 0;

  // Create canvas sized exactly as required
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.setAttribute('aria-hidden', 'false');
  container.innerHTML = '';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Accessibility live region
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.overflow = 'hidden';
  container.appendChild(live);

  // Audio system
  let audioCtx = null;
  let masterGain = null;
  let audioEnabled = false;
  let audioAvailable = true;
  let ambientNodes = [];
  let audioInitializedOnce = false;

  function announce(text) {
    live.textContent = text;
  }

  // Initialize audio context and gentle ambient sound
  function initAudio() {
    if (audioInitializedOnce) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported.');
      audioCtx = new AC();
      // Master gain
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.12;
      masterGain.connect(audioCtx.destination);

      // Ambient pad: two detuned sawtooth oscillators through a mild lowpass and slow tremolo
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      filter.Q.value = 0.6;
      filter.connect(masterGain);

      // Tremolo LFO
      const tremGain = audioCtx.createGain();
      tremGain.gain.value = 0.25;
      tremGain.connect(filter);

      const baseGain = audioCtx.createGain();
      baseGain.gain.value = 1;
      baseGain.connect(tremGain);

      const oscA = audioCtx.createOscillator();
      const oscB = audioCtx.createOscillator();
      oscA.type = 'sawtooth';
      oscB.type = 'sawtooth';
      const now = audioCtx.currentTime;
      oscA.frequency.setValueAtTime(55, now);
      oscB.frequency.setValueAtTime(55 * 1.005, now); // slight detune
      const oscAGain = audioCtx.createGain();
      const oscBGain = audioCtx.createGain();
      oscAGain.gain.value = 0.5;
      oscBGain.gain.value = 0.45;
      oscA.connect(oscAGain);
      oscB.connect(oscBGain);
      oscAGain.connect(baseGain);
      oscBGain.connect(baseGain);

      // Low-frequency oscillator for tremolo
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.75;
      lfo.connect(lfoGain);
      lfoGain.connect(oscAGain.gain);
      lfoGain.connect(oscBGain.gain);

      oscA.start();
      oscB.start();
      lfo.start();

      ambientNodes = [oscA, oscB, lfo, filter, baseGain, oscAGain, oscBGain];

      audioEnabled = true;
      audioInitializedOnce = true;
    } catch (err) {
      console.warn('Audio initialization failed:', err);
      audioAvailable = false;
      audioEnabled = false;
    }
  }

  // Create a short noise burst used for soft "absorb" sound
  function playNoiseBurst(duration = 0.12, volume = 0.08, when = 0) {
    if (!audioAvailable || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime + when;
      // create noise buffer
      const bufferSize = audioCtx.sampleRate * duration;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize); // fade out
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(volume, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 900;

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);
      noise.start(now);
      noise.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('playNoiseBurst error:', e);
    }
  }

  // General tone with filter envelope
  function safePlayTone(freq, duration = 0.28, type = 'sine', volume = 0.8, when = 0) {
    if (!audioAvailable || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime + when;
      const o = audioCtx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);

      const g = audioCtx.createGain();
      // fast attack, gentle decay
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // filter for color
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(Math.max(400, freq * 2.5), now);

      o.connect(f);
      f.connect(g);
      g.connect(masterGain);

      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('Failed to play tone:', e);
    }
  }

  // Refined SFX wrappers
  function playCorrect() {
    if (!audioAvailable || !audioEnabled) return;
    // small arpeggio with soft bells
    safePlayTone(880, 0.12, 'sine', 0.7);
    safePlayTone(1100, 0.12, 'sine', 0.5, 0.03);
    safePlayTone(660, 0.12, 'sine', 0.45, 0.06);
    playNoiseBurst(0.12, 0.03, 0.02);
  }

  function playWrong() {
    if (!audioAvailable || !audioEnabled) return;
    // low wobble + muted thud
    safePlayTone(180, 0.25, 'sawtooth', 0.35);
    safePlayTone(140, 0.20, 'sine', 0.24, 0.03);
    playNoiseBurst(0.18, 0.035, 0.01);
  }

  function playTap() {
    if (!audioAvailable || !audioEnabled) return;
    // quick click with a tiny high harmonic
    safePlayTone(760, 0.06, 'square', 0.4);
    safePlayTone(1200, 0.06, 'sine', 0.18, 0.01);
  }

  // Utility helpers
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Game state (mechanics preserved)
  let target = 12;
  let modules = [];
  let usedModules = [];
  let sum = 0;
  let selectedIndex = 0;
  let dragging = null;
  let robotLit = false;
  let feedbackMessage = '';
  let feedbackTimer = 0;
  let showConfetti = [];
  let soundToggleVisible = true;
  let perfNow = 0;

  // Visual-enhancement specific state: electron particles for wires
  // This will be added per module during generation.

  // Characters
  const characters = {
    professor: { x: 120, y: 120 },
    sparky: { x: 120, y: 300 },
    robot: { x: 540, y: 240 }
  };

  // Announce helper
  function announceText(t) {
    live.textContent = t;
  }

  // Challenge generation (logic unchanged aside from adding visual properties)
  function newChallenge() {
    robotLit = false;
    sum = 0;
    usedModules = [];
    feedbackMessage = 'Click or drag energy orbs into the robot to match its required charge.';
    feedbackTimer = 200;
    generateTargetAndModules();
    selectedIndex = 0;
    showConfetti = [];
    announceText(`New challenge. Target ${target}.`);
  }

  // Generate target and modules; keep core math identical.
  function generateTargetAndModules() {
    target = randInt(6, 18);
    const piecesCount = randInt(2, 4);
    let remaining = target;
    const pieces = [];
    for (let i = 0; i < piecesCount; i++) {
      const remainingSlots = piecesCount - i;
      let maxForSlot = Math.min(9, remaining - (remainingSlots - 1));
      let val = randInt(1, Math.max(1, maxForSlot));
      if (i === piecesCount - 1) val = remaining;
      pieces.push(val);
      remaining -= val;
    }
    const extras = MAX_MODULES - pieces.length;
    const modulesList = pieces.slice();
    for (let i = 0; i < extras; i++) {
      modulesList.push(randInt(1, 9));
    }
    shuffle(modulesList);

    // place modules on left side and attach a few visual properties (electrons)
    modules = modulesList.map((val, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 220 - col * 120 + randInt(-10, 10);
      const y = 120 + row * 90 + randInt(-12, 12);
      // electron particles travel along the curve to the robot inlet
      const electronCount = randInt(1, 3);
      const electrons = [];
      for (let e = 0; e < electronCount; e++) {
        electrons.push({
          t: Math.random(),
          speed: 0.0006 + Math.random() * 0.0012,
          size: 2 + Math.random() * 2,
          offset: Math.random() * Math.PI * 2,
          color: ['#fff9c4', '#ffd166', '#a5f3fc'][randInt(0, 2)]
        });
      }
      return {
        value: val,
        x,
        y,
        r: 34,
        used: false,
        jitter: Math.random() * Math.PI * 2,
        id: 'm' + i,
        electrons
      };
    });
  }

  // Check near robot inlet (unchanged)
  function isNearRobot(mx, my) {
    const rx = characters.robot.x - 70;
    const ry = characters.robot.y;
    const dist = Math.hypot(mx - rx, my - ry);
    return dist < 60;
  }

  // Place module into robot (preserve logic, add audio & subtle visuals)
  function acceptModule(index) {
    if (modules[index].used) return;
    modules[index].used = true;
    usedModules.push(index);
    sum += modules[index].value;
    announceText(`Placed ${modules[index].value}. Sum is ${sum}. Target ${target}.`);
    // nicer absorb sound
    playTap();
    playNoiseBurst(0.08, 0.03, 0);

    if (sum === target) {
      robotLit = true;
      playCorrect();
      feedbackMessage = 'Perfect! Robot fully charged!';
      feedbackTimer = 280;
      spawnConfetti();
      announceText('Perfect! Robot fully charged. Press N for next challenge.');
    } else if (sum > target) {
      playWrong();
      feedbackMessage = 'Oh no! Overcharged! Try again.';
      feedbackTimer = 280;
      announceText('Overcharged. Reset to try again.');
    } else {
      feedbackMessage = 'Nice! Keep going.';
      feedbackTimer = 160;
    }
  }

  function spawnConfetti() {
    showConfetti = [];
    for (let i = 0; i < 22; i++) {
      showConfetti.push({
        x: characters.robot.x + randInt(-40, 40),
        y: characters.robot.y - 40 + randInt(-10, 10),
        vx: randInt(-60, 60) / 90,
        vy: randInt(-220, -80) / 90,
        color: ['#ffd166', '#06d6a0', '#ef476f', '#118ab2'][randInt(0, 3)],
        life: randInt(60, 160),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.2
      });
    }
  }

  function resetChallenge() {
    modules.forEach(m => (m.used = false));
    usedModules = [];
    sum = 0;
    robotLit = false;
    feedbackMessage = 'Reset. Try adding modules to reach the target exactly.';
    feedbackTimer = 160;
    announceText('Reset. Target ' + target + '.');
  }

  // Input handlers (preserve behavior)
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    handlePointerDown(mx, my);
  });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    const mx = t.clientX - rect.left;
    const my = t.clientY - rect.top;
    handlePointerDown(mx, my);
  }, { passive: false });

  function handlePointerDown(mx, my) {
    // audio toggle area (top-right)
    if (mx > WIDTH - 64 && my < 64) {
      if (!audioCtx) {
        initAudio();
      }
      if (audioAvailable) audioEnabled = !audioEnabled;
      announceText(`Audio ${audioEnabled ? 'on' : 'off'}.`);
      playTap();
      return;
    }

    // modules
    for (let i = modules.length - 1; i >= 0; i--) {
      const m = modules[i];
      if (m.used) continue;
      const d = Math.hypot(mx - m.x, my - m.y);
      if (d < m.r + 6) {
        dragging = { index: i, offsetX: mx - m.x, offsetY: my - m.y };
        selectedIndex = i;
        playTap();
        return;
      }
    }

    // robot inlet click
    if (isNearRobot(mx, my)) {
      const idx = selectedIndex;
      if (modules[idx] && !modules[idx].used) {
        acceptModule(idx);
      }
      return;
    }

    // reset button
    if (mx > 20 && mx < 120 && my > HEIGHT - 60 && my < HEIGHT - 20) {
      resetChallenge();
      playTap();
    }
  }

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const m = modules[dragging.index];
    m.x = mx - dragging.offsetX;
    m.y = my - dragging.offsetY;
  });

  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const index = dragging.index;
    dragging = null;
    if (isNearRobot(mx, my)) {
      acceptModule(index);
    } else {
      const baseX = 220 + (index % 2 === 0 ? 0 : -120);
      const baseY = 120 + Math.floor(index / 2) * 90;
      modules[index].x = baseX + randInt(-8, 8);
      modules[index].y = baseY + randInt(-10, 10);
    }
  });

  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    const mx = t.clientX - rect.left;
    const my = t.clientY - rect.top;
    const m = modules[dragging.index];
    m.x = mx - dragging.offsetX;
    m.y = my - dragging.offsetY;
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    if (!dragging) return;
    const m = modules[dragging.index];
    const mx = m.x, my = m.y;
    const idx = dragging.index;
    dragging = null;
    if (isNearRobot(mx, my)) {
      acceptModule(idx);
    } else {
      const baseX = 220 + (idx % 2 === 0 ? 0 : -120);
      const baseY = 120 + Math.floor(idx / 2) * 90;
      modules[idx].x = baseX + randInt(-8, 8);
      modules[idx].y = baseY + randInt(-10, 10);
    }
  });

  // Keyboard controls (preserve)
  container.addEventListener('keydown', (e) => {
    if (!audioCtx && (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 's')) {
      try {
        initAudio();
      } catch (err) {
        // ignore
      }
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + modules.length) % modules.length;
      playTap();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % modules.length;
      playTap();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 2 + modules.length) % modules.length;
      playTap();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 2) % modules.length;
      playTap();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (modules[selectedIndex] && !modules[selectedIndex].used) {
        acceptModule(selectedIndex);
      }
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      resetChallenge();
    } else if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      newChallenge();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (!audioCtx) initAudio();
      if (audioAvailable) audioEnabled = !audioEnabled;
      announceText(`Audio ${audioEnabled ? 'on' : 'off'}.`);
      playTap();
    } else if (e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (usedModules.length > 0) {
        const idx = usedModules.pop();
        modules[idx].used = false;
        sum -= modules[idx].value;
        robotLit = false;
        feedbackMessage = 'Removed a module.';
        feedbackTimer = 120;
        announceText(`Removed ${modules[idx].value}. Sum is ${sum}.`);
        playTap();
      }
    }
  });

  // Enhanced drawing utilities and visuals

  // Time tracking
  let lastTime = 0;

  function drawBackground(now) {
    // layered sky gradient with subtle grid
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#e9f7ff');
    g.addColorStop(0.5, '#f0fbff');
    g.addColorStop(1, '#eaf7f9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle radial vignette
    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 100, WIDTH / 2, HEIGHT / 2, 800);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(6,10,12,0.03)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft horizontal band behind robot to focus attention
    ctx.save();
    const bandG = ctx.createLinearGradient(0, HEIGHT / 2 - 120, 0, HEIGHT / 2 + 120);
    bandG.addColorStop(0, 'rgba(255,255,255,0)');
    bandG.addColorStop(0.4, 'rgba(250,250,255,0.35)');
    bandG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bandG;
    ctx.fillRect(0, HEIGHT / 2 - 140, WIDTH, 280);
    ctx.restore();

    // ground plate
    ctx.fillStyle = '#f6fcff';
    ctx.fillRect(0, HEIGHT - 80, WIDTH, 80);

    // subtle decorative nodes (do not overwhelm)
    for (let i = 0; i < 8; i++) {
      const ox = 40 + i * 90 + Math.sin(now / 1000 + i) * 6;
      const oy = HEIGHT - 40 + Math.cos(now / 850 + i) * 6;
      const radius = 18;
      ctx.beginPath();
      ctx.fillStyle = `rgba(17,138,178,${0.03 + (i % 2) * 0.02})`;
      ctx.arc(ox, oy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawProfessor(x, y) {
    // a friendly scientist with a glowing coil
    ctx.save();
    ctx.translate(x, y);
    // shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.ellipse(0, 56, 48, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(0, 6, 44, 36, 0, 0, Math.PI * 2);
    ctx.fill();

    // eyes / glasses reflection
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-18, -6, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(18, -6, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-18, -6, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(18, -6, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // coil whiskers (glowing)
    ctx.strokeStyle = '#ff9f1c';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(255,159,28,0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(-36, -2);
    ctx.quadraticCurveTo(-58, -10, -76, -10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(36, -2);
    ctx.quadraticCurveTo(58, -10, 76, -10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // lab coat
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.rect(-30, 22, 60, 34);
    ctx.fill();

    // small stylized spark in hand
    ctx.beginPath();
    ctx.fillStyle = '#fff1a8';
    ctx.arc(28, 34, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSparky(x, y) {
    // battery buddy with mild gloss
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.fillStyle = '#06d6a0';
    roundRect(ctx, -24, -36, 48, 72, 8, true, false);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -22, -8, 44, 26, 6, true, false);
    // terminal
    ctx.fillStyle = '#ffef99';
    ctx.fillRect(-8, -44, 16, 8);
    // face
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(0, -6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRobot(x, y, now) {
    ctx.save();
    ctx.translate(x, y);

    // soft shadow below robot
    ctx.beginPath();
    ctx.fillStyle = 'rgba(7,16,24,0.12)';
    ctx.ellipse(0, 88, 86, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // body with subtle metallic gradient
    const bodyG = ctx.createLinearGradient(-60, -80, 60, 60);
    bodyG.addColorStop(0, robotLit ? '#fff7cc' : '#f8fafc');
    bodyG.addColorStop(1, robotLit ? '#fff1b8' : '#eef2f7');
    ctx.fillStyle = bodyG;
    ctx.strokeStyle = '#65748b';
    ctx.lineWidth = 2;
    roundRect(ctx, -64, -84, 128, 148, 10, true, true);

    // eye glows
    const eyeG = ctx.createRadialGradient(-24, -34, 2, -24, -34, 18);
    eyeG.addColorStop(0, robotLit ? '#fffd' : '#cbe0f6');
    eyeG.addColorStop(1, robotLit ? '#333' : '#6f89a8');
    ctx.fillStyle = eyeG;
    ctx.beginPath();
    ctx.arc(-24, -34, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(24, -34, 12, 0, Math.PI * 2);
    ctx.fill();

    // mouth LED
    ctx.fillStyle = robotLit ? '#ef476f' : '#6b7280';
    roundRect(ctx, -22, 6, 44, 8, 3, true, false);

    // inlet (left) with inner glow
    ctx.beginPath();
    ctx.fillStyle = '#dbeafe';
    ctx.ellipse(-74, 12, 24, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!robotLit) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(17,138,178,0.08)';
      ctx.lineWidth = 4;
      ctx.ellipse(-74, 12, 30, 40, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(6,214,160,0.14)';
      ctx.ellipse(-74, 12, 36, 46, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // battery indicator strip
    ctx.fillStyle = '#fff';
    roundRect(ctx, -30, 64, 60, 12, 3, true, false);
    const fillW = Math.min(60, Math.max(0, (sum / target) * 60));
    ctx.fillStyle = robotLit ? '#06d6a0' : '#ffb6c1';
    roundRect(ctx, -30, 64, fillW, 12, 3, true, false);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(-30, 64, 60, 12);

    // tiny blinking LED when near correct proportion
    if (sum > 0 && sum < target) {
      const p = sum / target;
      ctx.beginPath();
      ctx.fillStyle = `rgba(6,214,160,${0.4 * p + 0.1})`;
      ctx.arc(36, 66, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawModule(m, i, highlight = false, now = 0) {
    ctx.save();
    ctx.translate(m.x, m.y);

    // shadow underneath module
    ctx.beginPath();
    ctx.fillStyle = 'rgba(6,10,12,0.08)';
    ctx.ellipse(6, m.r + 12, m.r * 0.9, m.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // glow ring
    if (!m.used) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(96,165,250,${0.05 + (highlight ? 0.12 : 0.02)})`;
      ctx.arc(0, 0, m.r + 12 + (highlight ? 4 : 0), 0, Math.PI * 2);
      ctx.fill();
    }

    // orb gradient (radial)
    const rg = ctx.createRadialGradient(-m.r * 0.3, -m.r * 0.3, 4, 0, 0, m.r);
    if (m.used) {
      rg.addColorStop(0, '#f1f5f9');
      rg.addColorStop(1, '#cbd5e1');
    } else {
      rg.addColorStop(0, '#b6f0ff');
      rg.addColorStop(0.4, '#06d6a0');
      rg.addColorStop(1, '#118ab2');
    }
    ctx.beginPath();
    ctx.fillStyle = rg;
    ctx.arc(0, 0, m.r, 0, Math.PI * 2);
    ctx.fill();

    // inner glossy highlight
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.ellipse(-m.r * 0.35, -m.r * 0.6, m.r * 0.6, m.r * 0.38, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // metal ring
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.arc(0, 0, m.r - 2, 0, Math.PI * 2);
    ctx.stroke();

    // number
    ctx.fillStyle = m.used ? '#6b7280' : '#031024';
    ctx.font = 'bold 20px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.value, 0, 0);

    // small conductive bolt icon
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-8, 8);
    ctx.lineTo(0, -3);
    ctx.lineTo(8, 8);
    ctx.stroke();

    ctx.restore();
  }

  // Helper: rounded rectangle
  function roundRect(c, x, y, w, h, r, fill, stroke) {
    if (r < 0) r = 0;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    if (fill) c.fill();
    if (stroke) c.stroke();
  }

  // Draw electrons traveling on the quadratic curve between module and robot inlet
  function drawElectronsForModule(m, idx, now) {
    const startX = m.x;
    const startY = m.y;
    const endX = characters.robot.x - 70;
    const endY = characters.robot.y;
    // control point
    const cx = (startX + endX) / 2 - 30;
    const cy = startY - 30;
    m.electrons.forEach((e) => {
      if (m.used) return; // don't draw electrons once used
      e.t += e.speed * (now.delta);
      if (e.t > 1) e.t = 0;
      // get point on quadratic bezier
      const t = e.t;
      const xt = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cx + t * t * endX;
      const yt = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cy + t * t * endY;
      ctx.beginPath();
      ctx.fillStyle = e.color;
      ctx.globalAlpha = 0.95;
      ctx.arc(xt, yt, e.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });
  }

  // Main render loop
  function draw(now) {
    // now is high-resolution timestamp in ms
    if (!lastTime) lastTime = now;
    const dt = now - lastTime;
    lastTime = now;
    const delta = Math.min(32, dt); // clamp for stability
    const frame = { dt, delta: delta / 16.67 }; // normalized delta similar to ~60fps

    perfNow = now;

    // Background/base
    drawBackground(now);

    // Characters & robot
    drawProfessor(characters.professor.x, characters.professor.y);
    drawSparky(characters.sparky.x, characters.sparky.y);
    drawRobot(characters.robot.x, characters.robot.y, now);

    // Wires and moving electrons
    modules.forEach((m, i) => {
      if (m.used) return;
      const startX = m.x;
      const startY = m.y;
      const endX = characters.robot.x - 70;
      const endY = characters.robot.y;
      ctx.beginPath();
      // glow for selected wire
      const isSelected = i === selectedIndex;
      ctx.strokeStyle = `rgba(17,138,178,${0.06 + (isSelected ? 0.22 : 0.06)})`;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo((startX + endX) / 2 - 30, startY - 30, endX, endY);
      ctx.stroke();

      // slender inner wire
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + (isSelected ? 0.12 : 0.03)})`;
      ctx.lineWidth = 2;
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo((startX + endX) / 2 - 30, startY - 30, endX, endY);
      ctx.stroke();

      // electrons
      drawElectronsForModule(m, i, { dt, delta: frame.delta, now });
    });

    // Draw modules with subtle bobbing (preserve m.y motion but gentle)
    modules.forEach((m, i) => {
      // bobbing
      m.y += Math.sin(now / 1000 + m.jitter) * 0.0006 * dt;
      const highlight = i === selectedIndex && !dragging;
      drawModule(m, i, highlight, now);
    });

    // selection halo when keyboard selecting
    if (!dragging && modules[selectedIndex]) {
      const m = modules[selectedIndex];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // UI: Target
    ctx.fillStyle = '#083344';
    ctx.font = '20px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Target Charge:', 20, 36);

    // target bubble with soft shine
    ctx.save();
    const bubbleX = 140, bubbleY = 26, bubbleR = 28;
    ctx.beginPath();
    const tg = ctx.createRadialGradient(bubbleX - 6, bubbleY - 8, 4, bubbleX, bubbleY, bubbleR);
    tg.addColorStop(0, '#fff8de');
    tg.addColorStop(0.4, '#ffd166');
    tg.addColorStop(1, '#ffb84d');
    ctx.fillStyle = tg;
    ctx.arc(bubbleX, bubbleY, bubbleR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 22px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(target, bubbleX, bubbleY + 4);
    ctx.restore();

    // sum info
    ctx.font = '18px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#023047';
    ctx.fillText(`Current Sum: ${sum}`, 20, 66);

    // instructions (muted color)
    ctx.font = '14px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#065f46';
    ctx.fillText('Drag or select orbs and drop them in the robot inlet. Exact match wins.', 20, HEIGHT - 80);

    // Reset button
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 20, HEIGHT - 60, 100, 36, 6, true, false);
    ctx.strokeStyle = '#0ea5a4';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, HEIGHT - 60, 100, 36);
    ctx.fillStyle = '#0ea5a4';
    ctx.font = 'bold 16px "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Reset (R)', 28, HEIGHT - 34);

    // next tip
    ctx.font = '13px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText('Next (N) starts a new target.', 140, HEIGHT - 34);

    // Feedback banner
    if (feedbackTimer > 0) {
      const alpha = Math.min(1, feedbackTimer / 160);
      ctx.fillStyle = `rgba(255,255,255,${0.72 * alpha})`;
      roundRect(ctx, WIDTH / 2 - 220, 16, 440, 36, 8, true, false);
      ctx.strokeStyle = `rgba(0,0,0,${0.08 * alpha})`;
      ctx.strokeRect(WIDTH / 2 - 220, 16, 440, 36);
      ctx.fillStyle = '#023047';
      ctx.font = 'bold 16px "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(feedbackMessage, WIDTH / 2, 40);
      feedbackTimer -= dt;
      if (feedbackTimer < 0) feedbackTimer = 0;
    }

    // Draw used modules icons
    ctx.font = '14px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#0b3d91';
    ctx.textAlign = 'left';
    ctx.fillText('Used Orbs:', 320, 36);
    let ux = 320;
    let uy = 48;
    usedModules.forEach((idx, k) => {
      const val = modules[idx].value;
      ctx.beginPath();
      ctx.fillStyle = '#94a3b8';
      ctx.arc(ux + k * 34, uy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(val, ux + k * 34, uy + 1);
    });

    // Audio toggle (top-right)
    ctx.save();
    roundRect(ctx, WIDTH - 72, 8, 56, 56, 12, true, false);
    ctx.strokeStyle = '#0ea5a4';
    ctx.strokeRect(WIDTH - 72, 8, 56, 56);
    ctx.fillStyle = audioAvailable ? (audioEnabled ? '#0ea5a4' : '#b91c1c') : '#a1a1aa';
    ctx.font = '20px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const iconX = WIDTH - 44;
    const iconY = 36;
    ctx.fillText(audioAvailable ? (audioEnabled ? '🔊' : '🔇') : '✖', iconX, iconY);
    ctx.restore();

    // Controls tip
    ctx.font = '12px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#073b4c';
    ctx.textAlign = 'right';
    ctx.fillText('Select: arrows • Place: Enter • Undo: D', WIDTH - 20, HEIGHT - 16);

    // Confetti
    if (showConfetti.length > 0) {
      for (let i = showConfetti.length - 1; i >= 0; i--) {
        const c = showConfetti[i];
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-3, -4, 6, 8);
        ctx.restore();
        c.vy += 0.06;
        c.x += c.vx * frame.delta;
        c.y += c.vy * frame.delta;
        c.rot += c.vr * frame.delta;
        c.life -= 1;
        if (c.life <= 0 || c.y > HEIGHT + 20) {
          showConfetti.splice(i, 1);
        }
      }
    }

    // Overlay shading on used modules (soft)
    modules.forEach((m) => {
      if (m.used) {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.arc(m.x, m.y, m.r + 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Advance electrons based on dt
    modules.forEach((m) => {
      // move electron progress using dt scaled value
      m.electrons.forEach((e) => {
        // increment already handled in drawElectronsForModule via e.t update,
        // but we'll ensure it's bounded
        if (e.t > 1) e.t = e.t % 1;
        if (e.t < 0) e.t = 0;
      });
    });

    requestAnimationFrame(draw);
  }

  // Start game
  newChallenge();
  lastTime = performance.now();
  requestAnimationFrame(draw);

  // Unlock audio on first user gesture (with error handling)
  function handleFirstGesture() {
    if (!audioCtx) {
      try {
        initAudio();
      } catch (err) {
        console.warn('Audio unlock failed:', err);
      }
    }
    container.removeEventListener('pointerdown', handleFirstGesture);
    container.removeEventListener('keydown', handleFirstGesture);
  }
  container.addEventListener('pointerdown', handleFirstGesture);
  container.addEventListener('keydown', handleFirstGesture);

  if (!('AudioContext' in window) && !('webkitAudioContext' in window)) {
    audioAvailable = false;
    announceText('Audio is not available in this browser. The game will still work without sound.');
  }

  // Layout niceties
  container.style.position = 'relative';
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  container.focus();

  // Minimal debug exposure
  container.__gameDebug = {
    newChallenge,
    resetChallenge,
    getState: () => ({ target, sum, modules: modules.map(m => ({ value: m.value, used: m.used })), robotLit })
  };

  announceText(`Game ready. Target ${target}. Use arrows to select, Enter to place, Space to toggle audio.`);

})();