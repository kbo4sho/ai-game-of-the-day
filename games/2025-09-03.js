(function () {
  // Machine Math - Playable educational game for ages 7-9
  // Visual and audio polish applied: improved background, animations, character, gentle audio pad,
  // improved sound effects generated with Web Audio API. All visuals use canvas drawing methods.
  // Game mechanics and math logic are unchanged.

  // ---- Config ----
  const WIDTH = 720;
  const HEIGHT = 480;
  const STAGE_ID = 'game-of-the-day-stage';
  const MAX_LEVELS = 6;
  const GENTLE_BG_VOLUME = 0.035;
  const CORRECT_VOLUME = 0.18;
  const INCORRECT_VOLUME = 0.18;

  // ---- Utility ----
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const nowSec = () => performance.now() / 1000;

  // ---- Stage and Accessibility ----
  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error(`Element with id "${STAGE_ID}" not found. Game cannot start.`);
    return;
  }
  stage.style.position = 'relative';
  stage.style.width = WIDTH + 'px';
  stage.style.height = HEIGHT + 'px';
  stage.setAttribute('tabindex', '0');

  // Create ARIA friendly offscreen instructions for screen readers
  const srInstructions = document.createElement('div');
  srInstructions.setAttribute('aria-live', 'polite');
  srInstructions.style.position = 'absolute';
  srInstructions.style.left = '-9999px';
  srInstructions.style.top = 'auto';
  srInstructions.style.width = '1px';
  srInstructions.style.height = '1px';
  srInstructions.style.overflow = 'hidden';
  srInstructions.textContent =
    'Machine Math game loaded. Use arrow keys to move, Enter to pick or place parts. Press H for a hint. Press M to toggle sound.';
  stage.appendChild(srInstructions);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Machine Math game canvas');
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Speaker button (DOM) for accessibility
  const speakerBtn = document.createElement('button');
  speakerBtn.style.position = 'absolute';
  speakerBtn.style.right = '10px';
  speakerBtn.style.top = '10px';
  speakerBtn.style.padding = '6px 8px';
  speakerBtn.style.borderRadius = '6px';
  speakerBtn.style.border = '1px solid rgba(0,0,0,0.15)';
  speakerBtn.style.background = 'rgba(255,255,255,0.95)';
  speakerBtn.style.cursor = 'pointer';
  speakerBtn.setAttribute('aria-pressed', 'true');
  speakerBtn.textContent = 'Sound: On';
  stage.appendChild(speakerBtn);

  // Hidden live region for gameplay announcements
  const srAnnounce = document.createElement('div');
  srAnnounce.setAttribute('aria-live', 'polite');
  srAnnounce.style.position = 'absolute';
  srAnnounce.style.left = '-9999px';
  stage.appendChild(srAnnounce);

  // ---- Audio Setup ----
  let audioEnabled = true;
  let audioContext = null;
  let audioReady = false;
  let audioAllowedByUser = false;

  // Background audio nodes collection for controlled cleanup
  let bgNodes = {
    oscillators: [],
    gains: [],
    filters: [],
    lfos: []
  };

  // Helper to safely disconnect and stop nodes
  function safeStopAndDisconnect(node) {
    if (!node) return;
    try {
      if (typeof node.stop === 'function') node.stop();
    } catch (e) {}
    try {
      node.disconnect();
    } catch (e) {}
  }

  // Initialize audio context and background pad on user gesture
  function initAudioOnUserGesture() {
    if (audioReady || !audioEnabled) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        console.warn('Web Audio API not supported in this browser.');
        audioEnabled = false;
        speakerBtn.textContent = 'Sound: Off';
        speakerBtn.setAttribute('aria-pressed', 'false');
        srAnnounce.textContent = 'Audio unavailable.';
        return;
      }
      audioContext = new AC();

      // Create a warm ambient pad using layered oscillators and gentle LFOs
      const masterGain = audioContext.createGain();
      masterGain.gain.value = GENTLE_BG_VOLUME;
      masterGain.connect(audioContext.destination);

      // Layer 1: low sine pad
      const osc1 = audioContext.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 110;
      const g1 = audioContext.createGain();
      g1.gain.value = 0.9;
      const f1 = audioContext.createBiquadFilter();
      f1.type = 'lowpass';
      f1.frequency.value = 600;
      osc1.connect(f1);
      f1.connect(g1);
      g1.connect(masterGain);

      // Layer 2: subtle triangle for color
      const osc2 = audioContext.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 220;
      const g2 = audioContext.createGain();
      g2.gain.value = 0.45;
      const f2 = audioContext.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = 900;
      osc2.connect(f2);
      f2.connect(g2);
      g2.connect(masterGain);

      // Slow LFO to modulate filter cutoff for motion
      const lfo = audioContext.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12;
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 240; // cents or Hz depending on param connected
      lfo.connect(lfoGain);
      // Apply LFO to f1.frequency and a small detune to osc2
      lfoGain.connect(f1.frequency);
      lfoGain.connect(osc2.detune);

      // Start nodes
      const startAt = audioContext.currentTime + 0.02;
      try {
        osc1.start(startAt);
        osc2.start(startAt);
        lfo.start(startAt);
      } catch (e) {
        // ignore if already started
      }

      // store nodes to allow proper cleanup
      bgNodes.oscillators.push(osc1, osc2);
      bgNodes.gains.push(g1, g2, masterGain);
      bgNodes.filters.push(f1, f2);
      bgNodes.lfos.push(lfo, lfoGain);

      audioReady = true;
      audioAllowedByUser = true;
      srAnnounce.textContent = 'Audio enabled.';
    } catch (e) {
      console.warn('Audio initialization failed:', e);
      audioEnabled = false;
      speakerBtn.textContent = 'Sound: Off';
      speakerBtn.setAttribute('aria-pressed', 'false');
      srAnnounce.textContent = 'Audio unavailable.';
    }
  }

  function stopBackground() {
    try {
      bgNodes.oscillators.forEach(safeStopAndDisconnect);
      bgNodes.gains.forEach(n => {
        try {
          n.disconnect();
        } catch (e) {}
      });
      bgNodes.filters.forEach(n => {
        try {
          n.disconnect();
        } catch (e) {}
      });
      bgNodes.lfos.forEach(safeStopAndDisconnect);
    } finally {
      bgNodes = { oscillators: [], gains: [], filters: [], lfos: [] };
    }
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      speakerBtn.textContent = 'Sound: On';
      speakerBtn.setAttribute('aria-pressed', 'true');
      srAnnounce.textContent = 'Sound will start on next interaction.';
    } else {
      speakerBtn.textContent = 'Sound: Off';
      speakerBtn.setAttribute('aria-pressed', 'false');
      stopBackground();
      audioReady = false;
      audioAllowedByUser = false;
    }
  }

  speakerBtn.addEventListener('click', () => {
    toggleAudio();
    canvas.focus();
  });

  // Play a short tone - returns Promise that resolves when done
  function playTone({ freq = 440, dur = 0.18, type = 'sine', volume = 0.12, when = 0, detune = 0, harmonic = 0 }) {
    if (!audioEnabled) return Promise.resolve();
    if (!audioContext) return Promise.resolve();
    return new Promise(resolve => {
      try {
        const now = audioContext.currentTime + when;
        // primary oscillator
        const osc = audioContext.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune;

        // optional second harmonic for warmth
        const osc2 = audioContext.createOscillator();
        osc2.type = type;
        osc2.frequency.value = freq * (1 + harmonic);
        osc2.detune.value = detune * 0.5;

        const gain = audioContext.createGain();
        gain.gain.value = 0.0001;

        // small filter for character
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = Math.max(800, freq * 6);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.start(now);
        osc.stop(now + dur + 0.02);
        osc2.start(now);
        osc2.stop(now + dur + 0.02);

        osc.onended = () => {
          try {
            gain.disconnect();
          } catch (e) {}
          try {
            filter.disconnect();
          } catch (e) {}
          try {
            osc.disconnect();
          } catch (e) {}
          try {
            osc2.disconnect();
          } catch (e) {}
          resolve();
        };
      } catch (e) {
        console.warn('playTone error', e);
        resolve();
      }
    });
  }

  function playCorrectMelody() {
    if (!audioEnabled || !audioContext) return;
    // friendly ascending melody with gentle harmony
    const base = 440;
    const steps = [0, 3, 7, 12]; // intervals in semitones
    steps.forEach((st, i) => {
      const freq = base * Math.pow(2, st / 12);
      playTone({
        freq,
        dur: 0.18,
        when: i * 0.12,
        type: 'sine',
        volume: CORRECT_VOLUME,
        harmonic: 0.01
      });
      // add light bell overlay
      playTone({
        freq: freq * 2,
        dur: 0.12,
        when: i * 0.12 + 0.04,
        type: 'triangle',
        volume: CORRECT_VOLUME * 0.45,
        harmonic: 0.02
      });
    });
  }

  function playIncorrectBuzz() {
    if (!audioEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      // harsher buzzer with a filter sweep
      const osc = audioContext.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 220;

      const gain = audioContext.createGain();
      gain.gain.value = 0.0001;

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(INCORRECT_VOLUME, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);

      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(500, now + 0.27);

      osc.start(now);
      osc.stop(now + 0.28);

      osc.onended = () => {
        try {
          gain.disconnect();
        } catch (e) {}
        try {
          filter.disconnect();
        } catch (e) {}
        try {
          osc.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn('playIncorrectBuzz error', e);
    }
  }

  // Throttle move sound to avoid rapid repeats
  let lastMoveSoundAt = 0;
  function playMoveSound() {
    const t = nowSec();
    if (t - lastMoveSoundAt < 0.22) return;
    lastMoveSoundAt = t;
    playTone({ freq: 320, dur: 0.08, type: 'sine', volume: 0.035, harmonic: 0.02 });
  }

  // ---- Game State ----
  let running = true;
  let lastTime = 0;
  let parts = [];
  let selector = { x: WIDTH / 2, y: HEIGHT - 90, width: 52, height: 28, holding: null };
  let placedParts = [];
  let level = 1;
  let target = 5;
  let attemptsLeft = 3;
  let levelCompleted = false;
  let confetti = [];
  let showHint = false;

  // Extra visual particles when picking a part
  let pickParticles = [];

  // Generate level targets (unchanged mechanics)
  function computeTargets() {
    const arr = [];
    for (let i = 0; i < MAX_LEVELS; i++) {
      arr.push(5 + i + Math.floor(i / 2) * 2);
    }
    return arr;
  }
  const targetsList = computeTargets();

  // ---- Parts/Conveyor ----
  function createPart(x, value) {
    return {
      x,
      y: 110 + Math.sin(x * 0.02) * 6,
      r: 22,
      value,
      picked: false,
      wobble: Math.random() * Math.PI * 2
    };
  }

  function populateConveyor(levelNum) {
    parts = [];
    const count = 9;
    const startX = -60;
    for (let i = 0; i < count; i++) {
      const x = startX + i * 90;
      const maxVal = clamp(6 + levelNum + 2, 6, 12);
      const value = Math.floor(rand(1, Math.min(9, maxVal) + 1));
      parts.push(createPart(x, value));
    }
  }

  // ---- Game Flow ----
  function startLevel(lvl) {
    level = lvl;
    target = targetsList[clamp(level - 1, 0, targetsList.length - 1)];
    attemptsLeft = 3;
    placedParts = [];
    levelCompleted = false;
    confetti = [];
    populateConveyor(level);
    srAnnounce.textContent = `Level ${level}. Make ${target} using parts from the conveyor. Use arrow keys to move and press Enter to pick or place.`;
  }

  // ---- Interaction ----
  const keys = {};
  function handleKeyDown(e) {
    if (!audioAllowedByUser && audioEnabled) {
      initAudioOnUserGesture();
    }
    keys[e.key] = true;
    if (e.key === 'm' || e.key === 'M') {
      toggleAudio();
      e.preventDefault();
    }
    if (e.key === 'h' || e.key === 'H') {
      requestHint();
      e.preventDefault();
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (!selector.holding) {
        pickPartAtSelector();
      } else {
        placeIntoMachine();
      }
      e.preventDefault();
    }
    if (
      (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') ||
      (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D')
    ) {
      e.preventDefault();
    }
  }
  function handleKeyUp(e) {
    keys[e.key] = false;
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // Mouse/touch interactions
  canvas.addEventListener('click', ev => {
    if (!audioAllowedByUser && audioEnabled) {
      initAudioOnUserGesture();
    }
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    canvas.focus();

    const part = parts.find(p => {
      const dx = mx - p.x;
      const dy = my - p.y;
      return Math.hypot(dx, dy) <= p.r + 6;
    });
    if (part) {
      selector.x = clamp(part.x, 40, WIDTH - 40);
      pickPartAtSelector();
      return;
    }

    if (mx > WIDTH - 240 && my > 60 && my < HEIGHT - 120) {
      if (selector.holding) placeIntoMachine();
      return;
    }

    selector.x = clamp(mx, 40, WIDTH - 40);
  });

  // Pick part near selector (visual + audio enhanced)
  function pickPartAtSelector() {
    if (selector.holding) return;
    let nearest = null;
    let nearestDist = 9999;
    for (const p of parts) {
      if (p.picked) continue;
      const d = Math.abs(p.x - selector.x) + Math.abs(p.y - selector.y);
      if (d < nearestDist && d < 80) {
        nearest = p;
        nearestDist = d;
      }
    }
    if (nearest) {
      nearest.picked = true;
      selector.holding = nearest;
      // Visual sparkle
      createPickSparkle(nearest.x, nearest.y);
      // small pleasant pick tone
      playTone({ freq: 700, dur: 0.08, type: 'sine', volume: 0.08, harmonic: 0.02 });
      srAnnounce.textContent = `Picked a part: ${nearest.value}. Current held: ${nearest.value}.`;
    } else {
      // gentle denied sound
      playTone({ freq: 240, dur: 0.08, type: 'sine', volume: 0.06 });
      srAnnounce.textContent = 'No part nearby to pick. Move closer to the conveyor.';
    }
  }

  function placeIntoMachine() {
    if (!selector.holding) return;
    const value = selector.holding.value;
    placedParts.push(value);
    selector.holding = null;
    srAnnounce.textContent = `Placed ${value}. Current total: ${placedParts.reduce((a, b) => a + b, 0)} of ${target}.`;
    const sum = placedParts.reduce((a, b) => a + b, 0);
    if (sum === target) {
      levelCompleted = true;
      playCorrectMelody();
      createConfettiBurst();
      srAnnounce.textContent = `Correct! Level ${level} complete.`;
      setTimeout(() => {
        if (level < MAX_LEVELS) startLevel(level + 1);
        else finishGame();
      }, 1200);
    } else if (sum > target) {
      attemptsLeft -= 1;
      playIncorrectBuzz();
      flashError();
      srAnnounce.textContent = `Oops! That's too many. You have ${attemptsLeft} attempts left. Current total: ${sum} of ${target}.`;
      if (attemptsLeft <= 0) {
        setTimeout(() => {
          srAnnounce.textContent = `Let's try that level again.`;
          startLevel(level);
        }, 900);
      } else {
        const removed = placedParts.pop();
        const newPart = createPart(selector.x, removed);
        newPart.picked = false;
        parts.push(newPart);
      }
    } else {
      // small ding
      playTone({ freq: 520, dur: 0.08, type: 'triangle', volume: 0.06 });
    }
  }

  // Hint system unchanged, but a softer hint tone
  function requestHint() {
    showHint = true;
    const remaining = target - placedParts.reduce((a, b) => a + b, 0);
    const candidates = parts.filter(p => !p.picked && p.value <= remaining);
    if (candidates.length === 0) {
      srAnnounce.textContent = 'No helpful parts available. Try picking a small number or reset the level.';
      playTone({ freq: 220, dur: 0.12, type: 'sine', volume: 0.06 });
      return;
    }
    const chosen = pick(candidates);
    selector.x = clamp(chosen.x, 40, WIDTH - 40);
    srAnnounce.textContent = `Hint: Try the part with value ${chosen.value} near the conveyor.`;
    playTone({ freq: 660, dur: 0.12, type: 'sine', volume: 0.08 });
  }

  function finishGame() {
    srAnnounce.textContent = 'Fantastic! You finished all the machine levels. Well done!';
    for (let i = 0; i < 40; i++) createConfettiBurst();
    playCorrectMelody();
    setTimeout(() => {
      startLevel(1);
    }, 4000);
  }

  // ---- Visual helpers & polish ----

  // Animated background parameters
  let cloudOffset = 0;
  let beltOffset = 0;
  let timeStart = performance.now();

  function drawBackground() {
    // Soft vertical gradient sky with subtle radial vignette
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#E8F6FF');
    g.addColorStop(0.6, '#F6FBFF');
    g.addColorStop(1, '#FCFDFD');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // faint large gears in the background for depth
    ctx.save();
    ctx.globalAlpha = 0.06;
    drawBigGear(100, 90, 80, '#5AA7D6', 10);
    drawBigGear(340, 60, 60, '#7FC0E0', 9);
    drawBigGear(540, 140, 100, '#A8DAEC', 12);
    ctx.restore();

    // clouds parallax
    cloudOffset = (cloudOffset + 0.02) % WIDTH;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    drawCloud(cloudOffset + 20, 46, 44, 1.0);
    drawCloud((cloudOffset * 0.7 + 140) % WIDTH, 62, 32, 0.96);
    drawCloud((cloudOffset * 1.25 + 300) % WIDTH, 36, 54, 0.98);

    // subtle ground shadow gradient
    const g2 = ctx.createLinearGradient(0, 240, 0, HEIGHT);
    g2.addColorStop(0, 'rgba(0,0,0,0.02)');
    g2.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 240, WIDTH, HEIGHT - 240);
  }

  function drawCloud(cx, cy, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.fillStyle = '#FFFFFF';
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.arc(cx + size * 0.9, cy + 6, size * 0.8, 0, Math.PI * 2);
    ctx.arc(cx - size * 0.9, cy + 4, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBigGear(cx, cy, radius, color, teeth = 10) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const r1 = radius - 6;
      const r2 = radius + 10;
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a + 0.03) * r2, Math.sin(a + 0.03) * r2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  function drawConveyor() {
    // Conveyor base with shadow
    ctx.save();
    ctx.translate(0, 0);
    // conveyor platform
    ctx.fillStyle = '#E9F3FB';
    roundRect(ctx, 0, 80, WIDTH - 220, 140, 12);
    ctx.fill();

    // belt pattern with animated offset
    beltOffset = (beltOffset - 1.2 + 160) % 160;
    ctx.fillStyle = '#C7D9EE';
    for (let i = -1; i < 12; i++) {
      const x = i * 80 + beltOffset;
      ctx.fillRect(x, 146, 44, 12);
    }

    // guide rail
    ctx.fillStyle = '#D0E6F6';
    ctx.fillRect(0, 80, 6, 140);
    ctx.fillRect(WIDTH - 220 - 6, 80, 6, 140);

    // left machine arm decorative
    drawWackyMachineArm(60, 120, 1.0);

    // receiving machine on the right
    drawReceivingMachine(WIDTH - 200, 40);

    ctx.restore();
  }

  function drawWackyMachineArm(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // articulated arm with shadow and small motion
    ctx.shadowColor = 'rgba(30,60,80,0.08)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#DDEFF6';
    roundRect(ctx, -16, 8, 72, 20, 8);
    ctx.fill();

    // arm segments
    ctx.fillStyle = '#9FC8D6';
    roundRect(ctx, 6, -8, 12, 48, 8);
    ctx.fill();

    // claw
    ctx.beginPath();
    ctx.fillStyle = '#5FA9C2';
    ctx.arc(36, 18, 12, 0, Math.PI * 2);
    ctx.fill();

    // friendly sticker/eye
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(6, 26, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#334';
    ctx.beginPath();
    ctx.arc(6, 28, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawReceivingMachine(x, y) {
    ctx.save();
    ctx.translate(x, y);

    // body
    ctx.fillStyle = '#FFF3E0';
    roundRect(ctx, 0, 0, 200, 240, 14);
    ctx.fill();

    // display banner with soft glass
    ctx.fillStyle = '#F8DDB9';
    roundRect(ctx, 12, 18, 176, 84, 10);
    ctx.fill();

    // screen glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gx = ctx.createLinearGradient(20, 18, 180, 18);
    gx.addColorStop(0, 'rgba(255,255,255,0.4)');
    gx.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = gx;
    roundRect(ctx, 12, 18, 176, 12, 8);
    ctx.fill();
    ctx.restore();

    // eyes that blink gently
    drawRobotEyes(52, 66, 12);
    drawRobotEyes(148, 66, 12);

    // slot where parts go
    ctx.fillStyle = '#EDD7B6';
    roundRect(ctx, 18, 120, 164, 36, 10);
    ctx.fill();

    // soft glowing target label
    ctx.save();
    ctx.fillStyle = '#0C4C66';
    ctx.font = '22px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Target: ${target}`, 100, 32);
    ctx.restore();

    // show placed parts as gears inside slot
    for (let i = 0; i < placedParts.length; i++) {
      const vx = 32 + i * 38;
      drawGear(22 + vx, 138, 14, '#F9E1BD', '#D89E4A', placedParts[i]);
    }

    // small friendly robot mascot on the machine
    drawMascot(14, 170);

    ctx.restore();
  }

  function drawRobotEyes(cx, cy, r) {
    const t = performance.now() / 1000;
    // blink factor: occasional blink
    const blink = Math.sin(t * 0.9 + cx) > 0.98 ? 1 : 0;
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2C3A45';
    if (blink) {
      // draw a thin line to simulate closed eye
      ctx.fillRect(cx - r, cy - 2, r * 2, 4);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy + 2, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMascot(x, y) {
    ctx.save();
    ctx.translate(x, y);
    // body
    ctx.fillStyle = '#FFE9C8';
    roundRect(ctx, 0, 0, 48, 44, 8);
    ctx.fill();

    // face
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 6, 6, 36, 24, 6);
    ctx.fill();
    // smile
    ctx.strokeStyle = '#2D3A45';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(24, 22, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // eye sparkle
    ctx.fillStyle = '#2D3A45';
    ctx.beginPath();
    ctx.arc(14, 18, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(33, 18, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParts() {
    for (const p of parts) {
      // move along belt
      p.x += 0.6 + Math.sin(Date.now() * 0.001 + p.wobble) * 0.12;
      p.wobble += 0.008;
      if (p.x > WIDTH - 240) p.x = -40;
      p.y = 120 + Math.sin(p.x * 0.02 + p.wobble) * 7;

      if (selector.holding === p) {
        p.x = selector.x;
        p.y = selector.y - 26;
      }

      ctx.save();
      // shadow
      ctx.fillStyle = 'rgba(40,40,40,0.08)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 26, 26, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // glowing highlight if near selector
      const near = Math.abs(p.x - selector.x) < 48 && Math.abs(p.y - selector.y) < 48 && !p.picked;
      if (near) {
        ctx.shadowColor = 'rgba(120,200,255,0.45)';
        ctx.shadowBlur = 14;
      } else {
        ctx.shadowBlur = 0;
      }

      drawGear(p.x, p.y, p.r, '#EAF5FF', '#6EA5D8', p.value, p.picked);

      ctx.restore();
    }
  }

  function drawGear(cx, cy, radius, fillColor, strokeColor, label, dimmed = false) {
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.lineWidth = 2;
    const teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const r1 = radius - 2;
      const r2 = radius + 6;
      const x1 = cx + Math.cos(a) * r1;
      const y1 = cy + Math.sin(a) * r1;
      const x2 = cx + Math.cos(a + 0.06) * r2;
      const y2 = cy + Math.sin(a + 0.06) * r2;
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // center circle
    ctx.beginPath();
    ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.48)' : '#fff';
    ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
    ctx.fill();

    // number
    ctx.fillStyle = '#2E3A45';
    ctx.font = 'bold 14px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(label), cx, cy);
    ctx.restore();
  }

  function drawSelector() {
    ctx.save();
    ctx.translate(selector.x, selector.y);

    // shadow and plate
    ctx.shadowColor = 'rgba(20,40,60,0.08)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFF8EA';
    roundRect(ctx, -selector.width / 2, -selector.height / 2, selector.width, selector.height, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // handle
    ctx.fillStyle = '#98C0D0';
    roundRect(ctx, -12, -selector.height / 2 - 12, 24, 12, 6);
    ctx.fill();

    // held preview
    if (selector.holding) {
      drawGear(0, -36, 18, '#FFF2D9', '#DE9C4F', selector.holding.value);
    }

    // label
    ctx.fillStyle = '#2E3A45';
    ctx.font = '12px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Grabber', 0, 16);
    ctx.restore();

    // speaker mini-icon (canvas drawn for visual)
    ctx.save();
    ctx.translate(WIDTH - 80, 20);
    ctx.fillStyle = audioEnabled ? '#3CA1B6' : '#9AA1A8';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(audioEnabled ? '♫' : '✕', 0, 0);
    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    ctx.fillStyle = '#2C3A45';
    ctx.font = '18px "Arial", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${level}/${MAX_LEVELS}`, 12, 30);
    ctx.font = '14px "Arial", sans-serif';
    ctx.fillText(`Attempts: ${attemptsLeft}`, 12, 52);

    ctx.fillStyle = '#2C3A45';
    ctx.font = '12px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Move with ← → or A/D. Pick/place with Enter or Space. Press H for a hint. M toggles sound.',
      WIDTH / 2,
      HEIGHT - 10
    );

    // target badge
    ctx.save();
    ctx.fillStyle = '#FFEDD6';
    roundRect(ctx, WIDTH - 265, 12, 120, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#083B4C';
    ctx.font = '20px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${target}`, WIDTH - 205, 36);
    ctx.restore();

    ctx.restore();
  }

  // Confetti for celebration (unchanged behavior but color palette refined)
  function createConfettiBurst() {
    for (let i = 0; i < 12; i++) {
      confetti.push({
        x: WIDTH - 100 + rand(-40, 40),
        y: 80 + rand(0, 40),
        vx: rand(-2.3, 2.3),
        vy: rand(-6.5, -2.0),
        size: rand(4, 8),
        color: pick(['#FFB86B', '#FF7FA7', '#8BD36C', '#7FC8FF', '#FFD86B']),
        life: rand(1.6, 2.6)
      });
    }
    playTone({ freq: 880, dur: 0.12, volume: 0.14 });
  }

  function updateConfetti(dt) {
    for (const c of confetti) {
      c.vy += 9.8 * dt;
      c.x += c.vx;
      c.y += c.vy;
      c.life -= dt;
    }
    confetti = confetti.filter(c => c.life > 0);
  }

  function drawConfetti() {
    for (const c of confetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((c.x + c.y) * 0.03);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 1.6);
      ctx.restore();
    }
  }

  // Pick sparkle particles
  function createPickSparkle(x, y) {
    for (let i = 0; i < 8; i++) {
      pickParticles.push({
        x,
        y,
        vx: rand(-2.2, 2.2),
        vy: rand(-4.2, -1.2),
        size: rand(2, 5),
        color: pick(['#FFF2B2', '#CFF0FF', '#FFD6E0']),
        life: rand(0.45, 0.9)
      });
    }
  }

  function updatePickParticles(dt) {
    for (const p of pickParticles) {
      p.vy += 12 * dt;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
    }
    pickParticles = pickParticles.filter(p => p.life > 0);
  }

  function drawPickParticles() {
    for (const p of pickParticles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.restore();
    }
  }

  // Flashing border on error
  let flashTimer = 0;
  function flashError() {
    flashTimer = 0.5;
  }

  // ---- Helpers for drawing rounded rects ----
  function roundRect(ctx, x, y, w, h, r) {
    const radius = r || 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // ---- Main Loop ----
  function update(dt) {
    // Input handling: move selector and play quiet step sound occasionally
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
      selector.x -= 220 * dt;
      playMoveSound();
    } else if (keys['ArrowRight'] || keys['d'] || keys['D']) {
      selector.x += 220 * dt;
      playMoveSound();
    }
    selector.x = clamp(selector.x, 40, WIDTH - 40);

    updateConfetti(dt);
    updatePickParticles(dt);

    if (flashTimer > 0) flashTimer -= dt;
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawBackground();
    drawConveyor();
    drawParts();
    drawSelector();
    drawHUD();
    drawPickParticles();
    drawConfetti();

    if (flashTimer > 0) {
      const alpha = Math.sin(flashTimer * 20) * 0.14 + 0.12;
      ctx.fillStyle = `rgba(255,90,80,${alpha})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    if (showHint) {
      ctx.save();
      ctx.strokeStyle = '#FF7FA7';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(selector.x - 50, selector.y - 70, 100, 80);
      ctx.restore();
      setTimeout(() => (showHint = false), 1000);
    }
  }

  function loop(t) {
    if (!running) return;
    if (!lastTime) lastTime = t;
    const dt = Math.min(0.05, (t - lastTime) / 1000);
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---- Initialize ----
  function init() {
    if (!ctx) {
      console.error('Canvas rendering context not available.');
      stage.appendChild(document.createTextNode('Unable to start the game: canvas not supported.'));
      return;
    }

    canvas.setAttribute('tabindex', '0');
    canvas.focus();

    startLevel(1);

    requestAnimationFrame(loop);
  }

  // Start audio on first gesture to satisfy browser policies
  function firstUserGestureHandler() {
    if (!audioAllowedByUser && audioEnabled) {
      initAudioOnUserGesture();
    }
    window.removeEventListener('mousedown', firstUserGestureHandler);
    window.removeEventListener('touchstart', firstUserGestureHandler);
    window.removeEventListener('keydown', firstUserGestureHandler);
  }
  window.addEventListener('mousedown', firstUserGestureHandler);
  window.addEventListener('touchstart', firstUserGestureHandler);
  window.addEventListener('keydown', firstUserGestureHandler);

  // Ensure stage focuses canvas on click
  stage.addEventListener('click', () => canvas.focus());

  // Prevent accidental text selection during play
  stage.addEventListener('selectstart', e => e.preventDefault());

  // Start everything with try/catch
  try {
    init();
  } catch (err) {
    console.error('Game initialization error:', err);
    srAnnounce.textContent =
      'An error occurred while starting the game. Please try reloading the page.';
  }

  // Expose a small API for testing/debugging (non-essential)
  window._machineMathGame = {
    startLevel,
    toggleAudio,
    get state() {
      return { level, target, attemptsLeft, placedParts, partsCount: parts.length };
    }
  };
})();