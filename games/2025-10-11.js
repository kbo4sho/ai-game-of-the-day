(function () {
  // Locate container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container #game-of-the-day-stage not found.');
    return;
  }

  // Clear and configure container
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.userSelect = 'none';
  container.style.fontFamily = 'sans-serif';

  // Accessible live region for screen readers
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  container.appendChild(liveRegion);

  // Create canvas exactly 720x480
  const canvas = document.createElement('canvas');
  const WIDTH = 720;
  const HEIGHT = 480;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.setAttribute('tabindex', '0'); // focusable for keyboard
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Handle high DPI displays
  function resizeForDPR() {
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = WIDTH + 'px';
    canvas.style.height = HEIGHT + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeForDPR();
  window.addEventListener('resize', resizeForDPR);

  // Audio setup with robust error handling
  let audioEnabled = true;
  let audioCtx = null;
  let masterGain = null;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio API not supported.');
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.10; // gentle overall volume
    masterGain.connect(audioCtx.destination);
  } catch (err) {
    console.warn('Audio disabled:', err && err.message ? err.message : err);
    audioEnabled = false;
    audioCtx = null;
  }

  // Safe resume for browsers that suspend audio
  function safeResumeAudio() {
    if (!audioCtx) return Promise.resolve();
    if (audioCtx.state === 'suspended') {
      return audioCtx.resume().catch((e) => {
        console.warn('Audio resume failed:', e);
      });
    }
    return Promise.resolve();
  }

  // Small utility to create short shaped envelopes and oscillators
  function playSynth({ freq = 440, dur = 0.18, type = 'sine', gain = 0.12, filter = null, detune = 0, pan = 0 } = {}) {
    if (!audioEnabled || !audioCtx) return Promise.resolve();
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      let nodeIn = osc;

      osc.type = type;
      osc.frequency.value = freq;
      if (detune) osc.detune.value = detune;

      g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(gain, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      if (filter) {
        const f = audioCtx.createBiquadFilter();
        f.type = filter.type || 'lowpass';
        f.frequency.value = filter.freq || 1200;
        f.Q.value = filter.q || 0.5;
        nodeIn.connect(f);
        nodeIn = f;
      }

      // stereo panner if available
      let finalNode = nodeIn;
      if (typeof audioCtx.createStereoPanner === 'function') {
        const p = audioCtx.createStereoPanner();
        p.pan.value = pan;
        nodeIn.connect(p);
        finalNode = p;
      }

      finalNode.connect(g);
      g.connect(masterGain);

      osc.start(now);
      osc.stop(now + dur + 0.02);

      return new Promise((res) => {
        setTimeout(res, (dur + 0.03) * 1000);
      });
    } catch (e) {
      console.warn('playSynth error', e);
      return Promise.resolve();
    }
  }

  // Specific sound presets
  function playClick() {
    // soft glassy click
    return playSynth({ freq: 1200, dur: 0.06, type: 'triangle', gain: 0.06, filter: { type: 'highpass', freq: 400 } });
  }
  function playPlace() {
    // warm pluck
    return playSynth({
      freq: 440,
      dur: 0.26,
      type: 'triangle',
      gain: 0.12,
      filter: { type: 'lowpass', freq: 1200 },
      detune: -6,
    }).then(() =>
      playSynth({
        freq: 660,
        dur: 0.22,
        type: 'sine',
        gain: 0.08,
        filter: { type: 'lowpass', freq: 1600 },
      })
    );
  }
  function playWrong() {
    // low muffled wobble
    return playSynth({ freq: 160, dur: 0.46, type: 'sawtooth', gain: 0.14, filter: { type: 'lowpass', freq: 800 } });
  }
  function playSuccess() {
    // gentle triad arpeggio
    return safeResumeAudio().then(() =>
      playSynth({ freq: 660, dur: 0.16, type: 'triangle', gain: 0.12 }).then(() =>
        playSynth({ freq: 880, dur: 0.18, type: 'triangle', gain: 0.12 }).then(() =>
          playSynth({ freq: 990, dur: 0.22, type: 'triangle', gain: 0.12 })
        )
      )
    );
  }

  // Gentle background pad/hum with low motion LFO
  let humNode = null;
  function startHum() {
    if (!audioEnabled || !audioCtx || humNode) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.value = 110;
      gain.gain.value = 0.045;
      lfo.type = 'sine';
      lfo.frequency.value = 0.12; // slow wobble
      lfoGain.gain.value = 6;

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      lfo.start();

      humNode = { osc, gain, lfo, lfoGain };
    } catch (e) {
      console.warn('startHum failed', e);
    }
  }
  function stopHum() {
    if (!humNode) return;
    try {
      humNode.osc.stop();
      humNode.lfo.stop();
    } catch (e) {
      // ignore
    }
    humNode = null;
  }

  function toggleAudio() {
    if (!audioCtx) {
      audioEnabled = false;
      announceAudioState();
      return;
    }
    if (!audioEnabled) {
      audioEnabled = true;
      safeResumeAudio().then(() => startHum());
    } else {
      audioEnabled = false;
      stopHum();
    }
    announceAudioState();
  }

  function announceAudioState() {
    liveRegion.textContent = audioEnabled ? 'Audio on' : 'Audio off';
  }

  // Game variables and layout (mechanics kept unchanged)
  const LEVEL_COUNT = 5;
  let currentLevel = 1;
  let targetNumber = 0;
  let parts = [];
  const placed = [];
  let selectedIndex = -1;
  let dragging = null;
  let animationTime = 0;
  let won = false;
  let showConfetti = 0;

  const MACHINE_X = 420;
  const MACHINE_Y = 80;
  const MACHINE_W = 260;
  const MACHINE_H = 320;
  const PART_RADIUS = 26;
  const PART_AREA = { x: 40, y: 80, w: 300, h: 320 };

  // Aesthetic color palette (soft, modern, non-stimulating)
  const palette = {
    bgTop: '#e8f4fb',
    bgBottom: '#f7fbf9',
    cloud: 'rgba(255,255,255,0.92)',
    machineBody: '#d9eef8',
    machineTrim: '#86b8d7',
    partA: '#ffd98e',
    partB: '#bfe8ff',
    accent: '#57b6a7',
    text: '#12333F',
    plate: '#ffffff',
    shadow: 'rgba(0,0,0,0.08)',
    steam: 'rgba(255,255,255,0.14)',
  };

  // Utility random int
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Setup level (math and logic unchanged)
  function setupLevel(level) {
    currentLevel = Math.min(Math.max(1, level), LEVEL_COUNT);
    won = false;
    showConfetti = 0;
    parts = [];
    placed.length = 0;
    selectedIndex = -1;
    dragging = null;

    const baseParts = 5 + currentLevel;
    const maxVal = 5 + currentLevel * 3;
    const subsetCount = Math.min(baseParts, 2 + Math.floor(currentLevel / 1.5));
    const chosen = [];
    for (let i = 0; i < subsetCount; i++) {
      chosen.push(randInt(1, Math.max(2, Math.floor(maxVal / 2))));
    }
    targetNumber = chosen.reduce((a, b) => a + b, 0);

    const totalParts = baseParts;
    const values = chosen.slice();
    while (values.length < totalParts) {
      let v = randInt(1, maxVal);
      if (v === targetNumber) v = Math.max(1, v - 1);
      values.push(v);
    }

    // Shuffle values
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }

    const cols = 3;
    const gapX = PART_AREA.w / cols;
    const gapY = 60;
    for (let i = 0; i < values.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PART_AREA.x + 30 + col * gapX + randInt(-10, 10);
      const y = PART_AREA.y + 40 + row * gapY + randInt(-6, 6);
      parts.push({
        id: 'p' + i + '-' + Date.now(),
        value: values[i],
        x,
        y,
        homeX: x,
        homeY: y,
        radius: PART_RADIUS,
        wobble: Math.random() * Math.PI * 2,
        color: i % 2 === 0 ? palette.partA : palette.partB,
      });
    }

    liveRegion.textContent = `Level ${currentLevel}. Target ${targetNumber}. Use arrow keys to select and Enter to place.`;
  }

  // Current placed sum (unchanged)
  function currentSum() {
    return placed.reduce((s, p) => s + p.value, 0);
  }

  // Place part into machine (unchanged math/logic, but enhanced audio/visual feedback)
  function placePart(part) {
    if (parts.indexOf(part) === -1) return;
    const index = placed.length;
    const stackX = MACHINE_X + MACHINE_W / 2;
    const stackY = MACHINE_Y + MACHINE_H - 36 - index * 46;
    parts = parts.filter((p) => p !== part);
    part.placedX = stackX + randInt(-6, 6);
    part.placedY = stackY + randInt(-6, 6);
    placed.push(part);
    selectedIndex = Math.min(selectedIndex, parts.length - 1);

    // audio feedback
    if (audioEnabled) {
      // place sound with small stereo spread
      safeResumeAudio().then(() => {
        playPlace();
      });
    }

    // small sparkle particle burst
    createPlaceParticles(part.placedX, part.placedY);

    liveRegion.textContent = `Placed ${part.value}. Current sum ${currentSum()} of ${targetNumber}.`;
    checkWinOrOver();
  }

  // Remove last placed (logic unchanged)
  function removeLastPlaced() {
    if (placed.length === 0) {
      liveRegion.textContent = 'No parts to remove.';
      return;
    }
    const part = placed.pop();
    part.x = part.homeX + randInt(-8, 8);
    part.y = part.homeY + randInt(-8, 8);
    parts.push(part);

    // audio cue
    if (audioEnabled) {
      safeResumeAudio().then(() => playClick());
    }

    liveRegion.textContent = `Removed ${part.value}. Current sum ${currentSum()} of ${targetNumber}.`;
  }

  // Check for win or over (unchanged)
  function checkWinOrOver() {
    const sum = currentSum();
    if (sum === targetNumber) {
      won = true;
      announceWin();
    } else if (sum > targetNumber) {
      if (audioEnabled) {
        safeResumeAudio().then(() => playWrong());
      }
      liveRegion.textContent = `Overfilled: ${sum} (target ${targetNumber}). Remove a part.`;
    }
  }

  async function announceWin() {
    liveRegion.textContent = `Great! You matched ${targetNumber}. Level ${currentLevel} complete.`;
    if (audioEnabled) await playSuccess();
    showConfetti = 60;
    setTimeout(() => {
      if (currentLevel < LEVEL_COUNT) {
        setupLevel(currentLevel + 1);
        if (audioEnabled) safeResumeAudio().then(() => playClick());
      } else {
        liveRegion.textContent = 'You finished all levels! Well done!';
        if (audioEnabled) safeResumeAudio().then(() => playSuccess());
        setTimeout(() => {
          setupLevel(1);
        }, 3600);
      }
    }, 1400);
  }

  // Particles for placing parts (subtle)
  const particles = [];
  function createPlaceParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 2.8,
        vy: -Math.random() * 2 - 0.4,
        life: 40 + Math.random() * 20,
        color: Math.random() > 0.5 ? palette.accent : '#fff3b0',
        size: 2 + Math.random() * 3,
        alpha: 1,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.life--;
      p.alpha = Math.max(0, p.life / 60);
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // Confetti celebration (kept but refined)
  const confettiPieces = [];
  function spawnConfetti() {
    for (let i = 0; i < 32; i++) {
      confettiPieces.push({
        x: MACHINE_X + Math.random() * MACHINE_W,
        y: MACHINE_Y + 8,
        vx: (Math.random() - 0.5) * 3.5,
        vy: Math.random() * 3 + 1,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.25,
        color: `hsl(${Math.random() * 360},70%,60%)`,
        size: 6 + Math.random() * 6,
      });
    }
  }

  function updateConfetti() {
    if (showConfetti > 0 && confettiPieces.length === 0) {
      spawnConfetti();
    }
    for (let i = confettiPieces.length - 1; i >= 0; i--) {
      const c = confettiPieces[i];
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.09;
      c.rot += c.vr;
      if (c.y > HEIGHT + 20) confettiPieces.splice(i, 1);
    }
    if (showConfetti > 0) showConfetti--;
  }

  // Drawing utilities
  function clear() {
    // soft vertical gradient background
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, palette.bgTop);
    g.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // Soft cloud layers for background parallax
  function drawClouds(t) {
    const time = t * 0.0007;
    ctx.save();
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < 3; i++) {
      const offset = (time * (i + 0.4) * 40) % (WIDTH + 200) - 100 - i * 40;
      drawCloud(ctx, offset, 40 + i * 18, 140 + i * 40, 40 + i * 12, 0.85 - i * 0.15);
    }
    ctx.restore();
  }

  function drawCloud(ctx, x, y, w, h, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.5, h * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.2, -4, w * 0.4, h * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.4, 4, w * 0.3, h * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.8, 0, w * 0.5, h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw decorative character (robot buddy) beside machine for charm
  function drawMascot(t) {
    const baseX = MACHINE_X - 70;
    const baseY = MACHINE_Y + MACHINE_H - 30;
    const bob = Math.sin(t * 0.006) * 4;
    // body
    roundRect(ctx, baseX - 18, baseY - 78 + bob, 48, 64, 10, palette.machineBody, palette.machineTrim, 2);
    // head
    roundRect(ctx, baseX - 6, baseY - 110 + bob, 32, 28, 8, palette.plate, palette.machineTrim, 1.5);
    // eye
    ctx.beginPath();
    ctx.arc(baseX + 10, baseY - 96 + bob, 4.8, 0, Math.PI * 2);
    ctx.fillStyle = '#12333F';
    ctx.fill();
    // smile
    ctx.beginPath();
    ctx.arc(baseX + 10, baseY - 90 + bob, 8, 0, Math.PI);
    ctx.strokeStyle = '#12333F';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // holding a small wrench (stylized)
    ctx.beginPath();
    ctx.moveTo(baseX + 28, baseY - 74 + bob);
    ctx.lineTo(baseX + 42, baseY - 68 + bob);
    ctx.strokeStyle = '#9BBBD8';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Draw the machine with improved visuals
  function drawMachine(t) {
    const time = t * 0.01;
    // main casing with soft shadow
    ctx.save();
    // panel shadow
    ctx.fillStyle = palette.shadow;
    roundRect(ctx, MACHINE_X + 6, MACHINE_Y + 8, MACHINE_W, MACHINE_H, 18, palette.shadow);
    // body
    roundRect(ctx, MACHINE_X, MACHINE_Y, MACHINE_W, MACHINE_H, 18, palette.machineBody, palette.machineTrim, 2);

    // glossy glass window
    const winX = MACHINE_X + 28;
    const winY = MACHINE_Y + 40;
    const winW = MACHINE_W - 56;
    const winH = MACHINE_H - 120;
    const glass = ctx.createLinearGradient(0, winY, 0, winY + winH);
    glass.addColorStop(0, 'rgba(255,255,255,0.32)');
    glass.addColorStop(1, 'rgba(255,255,255,0.06)');
    roundRect(ctx, winX, winY, winW, winH, 10, glass, 'rgba(255,255,255,0.08)', 1);

    // inner reflection
    ctx.beginPath();
    ctx.moveTo(winX + 6, winY + 8);
    ctx.quadraticCurveTo(winX + winW / 2, winY - 12 + Math.sin(time * 0.9) * 6, winX + winW - 6, winY + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();

    // funnel top
    ctx.beginPath();
    ctx.moveTo(MACHINE_X + MACHINE_W / 2 - 40, MACHINE_Y + 12);
    ctx.lineTo(MACHINE_X + MACHINE_W / 2 + 40, MACHINE_Y + 12);
    ctx.lineTo(MACHINE_X + MACHINE_W - 18, MACHINE_Y + 40);
    ctx.lineTo(MACHINE_X + 18, MACHINE_Y + 40);
    ctx.closePath();
    ctx.fillStyle = '#e8f7ff';
    ctx.fill();
    ctx.strokeStyle = palette.machineTrim;
    ctx.stroke();

    // control panel
    roundRect(ctx, MACHINE_X + 12, MACHINE_Y + MACHINE_H - 72, 80, 56, 10, '#fff7eb', '#e6c38a', 1.5);
    // glowing buttons
    drawButton(ctx, MACHINE_X + 28, MACHINE_Y + MACHINE_H - 56, 18, '#ff7b7b');
    drawButton(ctx, MACHINE_X + 54, MACHINE_Y + MACHINE_H - 56, 18, '#6be696');

    // gauge with smoother needle
    const sum = currentSum();
    const pct = Math.min(1, Math.max(0, sum / Math.max(targetNumber, 1)));
    const angle = Math.PI + pct * Math.PI;
    const gx = MACHINE_X + MACHINE_W - 56;
    const gy = MACHINE_Y + MACHINE_H - 36;
    ctx.beginPath();
    ctx.arc(gx, gy, 28, Math.PI, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#cfe8f3';
    ctx.stroke();
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(angle - Math.PI);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(-3, -2, 26, 4);
    ctx.restore();

    // moving piston
    const pistonY = MACHINE_Y + 20 + Math.sin(t * 0.005) * 6;
    ctx.fillStyle = '#fff0c8';
    ctx.fillRect(MACHINE_X + 12, pistonY, MACHINE_W - 24, 8);

    ctx.restore();

    // machine title with soft shadow
    ctx.save();
    ctx.fillStyle = 'rgba(18,51,63,0.12)';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Number Mixer 3000', MACHINE_X + 14, MACHINE_Y - 6);
    ctx.fillStyle = palette.text;
    ctx.fillText('Number Mixer 3000', MACHINE_X + 12, MACHINE_Y - 8);
    ctx.restore();
  }

  // Rounded rectangle helper
  function roundRect(ctx, x, y, w, h, r, fillStyle, strokeStyle, lineWidth = 1) {
    ctx.beginPath();
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  // Draw a more polished button
  function drawButton(ctx, x, y, r, color) {
    ctx.save();
    // shadow
    ctx.beginPath();
    ctx.arc(x + 1.2, y + 3.2, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();
    // button body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, '#dfefff');
    ctx.fillStyle = grad;
    ctx.fill();
    // highlight
    ctx.beginPath();
    ctx.arc(x - r / 3, y - r / 3, r / 2.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.restore();
  }

  // Draw parts and placed chips with nicer visuals and subtle animation
  function drawParts(t) {
    // parts area
    roundRect(ctx, PART_AREA.x - 12, PART_AREA.y - 12, PART_AREA.w + 24, PART_AREA.h + 24, 14, '#f7fbfd', 'rgba(140,188,208,0.08)', 1);
    ctx.fillStyle = palette.text;
    ctx.font = '14px sans-serif';
    ctx.fillText('Parts', PART_AREA.x + 8, PART_AREA.y - 2);

    // draw parts
    parts.forEach((p, i) => {
      p.wobble += 0.02 + i * 0.0003;
      const wob = Math.sin(p.wobble) * 2;
      if (!dragging || dragging.part !== p) {
        // gentle breathing
        p.x += Math.sin(p.wobble * 0.7) * 0.02;
        p.y += Math.cos(p.wobble * 0.6) * 0.02;
      }
      drawChip(ctx, p.x, p.y + wob, p.radius, p.color, p.value, i === selectedIndex);
    });

    // placed parts
    placed.forEach((p, i) => {
      const bounce = Math.sin(t * 0.015 + i) * 3;
      drawChip(ctx, p.placedX, p.placedY + bounce, p.radius, p.color, p.value, false);
    });
  }

  // Draw a chip/gear with soft shadows and bevel
  function drawChip(ctx, x, y, r, color, value, highlight) {
    ctx.save();
    ctx.translate(x, y);

    // drop shadow
    ctx.beginPath();
    ctx.arc(6, 8, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();

    // outer soft rim
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = shadeColor(color, -8);
    ctx.fill();

    // bevel center
    const grad = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    grad.addColorStop(0, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, shadeColor(color, -12));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // subtle rim stroke
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.stroke();

    // value text
    ctx.fillStyle = '#12333F';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 0, 0);

    // highlight ring for selected
    if (highlight) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(87,182,167,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }

  // Simple color shading helper
  function shadeColor(hex, percent) {
    // hex like #rrggbb or already color names - try fallback to canvas
    try {
      if (hex[0] !== '#') return hex;
      const num = parseInt(hex.slice(1), 16);
      const r = Math.min(255, Math.max(0, (num >> 16) + percent));
      const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
      const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
      return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    } catch (e) {
      return hex;
    }
  }

  // HUD drawing improved
  function drawHUD(t) {
    // top left target card with subtle pulse
    const pulse = 1 + Math.sin(t * 0.008) * 0.012;
    ctx.save();
    roundRect(ctx, 40, 12, 240, 52, 10, palette.plate, 'rgba(140,188,208,0.12)', 1.6);
    ctx.fillStyle = palette.text;
    ctx.font = '16px sans-serif';
    ctx.fillText('Target Number', 60, 32);
    ctx.font = `bold ${Math.round(28 * pulse)}px sans-serif`;
    ctx.fillStyle = '#2C3E50';
    ctx.fillText(String(targetNumber), 60, 56);
    ctx.restore();

    // current sum card
    ctx.save();
    roundRect(ctx, 320, 12, 220, 52, 10, palette.plate, 'rgba(140,188,208,0.08)', 1.6);
    ctx.fillStyle = palette.text;
    ctx.font = '14px sans-serif';
    ctx.fillText('Current Sum', 336, 30);
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = currentSum() === targetNumber ? '#27AE60' : '#2C3E50';
    ctx.fillText(String(currentSum()), 336, 54);
    ctx.restore();

    // instructions
    ctx.fillStyle = 'rgba(18,51,63,0.8)';
    ctx.font = '12px sans-serif';
    ctx.fillText('← / →: select • Enter: place • Backspace: remove • A: audio • R: reset', 40, HEIGHT - 18);

    // speaker icon (top-right)
    drawSpeakerIcon(ctx, WIDTH - 44, 16, audioEnabled);

    // level indicator
    ctx.fillStyle = palette.text;
    ctx.font = '14px sans-serif';
    ctx.fillText(`Level ${currentLevel}/${LEVEL_COUNT}`, WIDTH - 140, 28);
  }

  function drawSpeakerIcon(ctx, x, y, on) {
    ctx.save();
    ctx.translate(x, y);
    // background plate
    ctx.beginPath();
    ctx.rect(-8, -8, 48, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fill();

    // speaker body
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(10, 6);
    ctx.lineTo(18, 0);
    ctx.lineTo(18, 24);
    ctx.lineTo(10, 18);
    ctx.lineTo(0, 18);
    ctx.closePath();
    ctx.fillStyle = '#7FB3D5';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.stroke();

    if (!on) {
      // subtle muted slash
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(28, 26);
      ctx.strokeStyle = '#E74C3C';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // gentle waveform arc
      ctx.beginPath();
      ctx.arc(24, 10, 6, -0.6, 0.6);
      ctx.strokeStyle = '#6BE696';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Steam puffs for whimsy (subtle)
  function drawSteam(t) {
    for (let i = 0; i < 4; i++) {
      const s = (t * 0.0009 + i * 0.45) % 1;
      const alpha = 0.08 + Math.sin((s * Math.PI * 2)) * 0.04;
      ctx.beginPath();
      ctx.arc(MACHINE_X - 24 + i * 18, MACHINE_Y + s * MACHINE_H * 0.6, 12 + i * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }

  // Draw particles and confetti
  function drawParticles() {
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawConfetti() {
    confettiPieces.forEach((c) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
      ctx.restore();
    });
  }

  // Event handling (pointer & keyboard) - mechanics unchanged
  let pointerDown = false;

  function canvasToLocal(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    pointerDown = true;
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    const pt = canvasToLocal(ev);

    // speaker toggle region
    if (pt.x > WIDTH - 80 && pt.y < 64) {
      toggleAudio();
      return;
    }

    // pick a part (from topmost to bottom)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (distance(pt.x, pt.y, p.x, p.y) <= p.radius + 8) {
        dragging = { part: p, offsetX: pt.x - p.x, offsetY: pt.y - p.y };
        selectedIndex = parts.indexOf(p);
        if (audioEnabled) safeResumeAudio().then(() => playClick());
        return;
      }
    }

    // click on machine to remove last placed
    if (
      pt.x > MACHINE_X &&
      pt.x < MACHINE_X + MACHINE_W &&
      pt.y > MACHINE_Y &&
      pt.y < MACHINE_Y + MACHINE_H
    ) {
      removeLastPlaced();
      return;
    }
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!pointerDown || !dragging) return;
    const pt = canvasToLocal(ev);
    dragging.part.x = pt.x - dragging.offsetX;
    dragging.part.y = pt.y - dragging.offsetY;
  });

  canvas.addEventListener('pointerup', (ev) => {
    pointerDown = false;
    canvas.releasePointerCapture && canvas.releasePointerCapture(ev.pointerId);
    if (!dragging) return;
    const pt = canvasToLocal(ev);
    const part = dragging.part;
    // drop inside machine?
    if (
      pt.x > MACHINE_X + 12 &&
      pt.x < MACHINE_X + MACHINE_W - 12 &&
      pt.y > MACHINE_Y + 30 &&
      pt.y < MACHINE_Y + MACHINE_H - 20
    ) {
      placePart(part);
    } else {
      part.x = part.homeX + randInt(-6, 6);
      part.y = part.homeY + randInt(-6, 6);
      if (audioEnabled) safeResumeAudio().then(() => playClick());
    }
    dragging = null;
  });

  // distance util
  function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
  }

  // Keyboard controls (unchanged behavior)
  canvas.addEventListener('keydown', (ev) => {
    if (audioEnabled && audioCtx && audioCtx.state === 'suspended') safeResumeAudio().then(startHum);
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      if (parts.length > 0) {
        selectedIndex = selectedIndex <= 0 ? parts.length - 1 : selectedIndex - 1;
        liveRegion.textContent = `Selected ${parts[selectedIndex].value}. Press Enter to place.`;
        if (audioEnabled) safeResumeAudio().then(() => playClick());
      }
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      if (parts.length > 0) {
        selectedIndex = selectedIndex >= parts.length - 1 ? 0 : selectedIndex + 1;
        liveRegion.textContent = `Selected ${parts[selectedIndex].value}. Press Enter to place.`;
        if (audioEnabled) safeResumeAudio().then(() => playClick());
      }
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (selectedIndex >= 0 && parts[selectedIndex]) {
        placePart(parts[selectedIndex]);
      } else {
        liveRegion.textContent = 'No part selected. Use the arrow keys to select a part.';
      }
    } else if (ev.key === 'Backspace' || ev.key === 'Delete') {
      ev.preventDefault();
      removeLastPlaced();
    } else if (ev.key.toLowerCase() === 'a') {
      ev.preventDefault();
      toggleAudio();
    } else if (ev.key.toLowerCase() === 'r') {
      ev.preventDefault();
      setupLevel(currentLevel);
      if (audioEnabled) safeResumeAudio().then(() => playClick());
    } else if (ev.key === ' ') {
      ev.preventDefault();
      if (selectedIndex >= 0 && parts[selectedIndex]) {
        placePart(parts[selectedIndex]);
      } else {
        liveRegion.textContent = 'Select a part first with arrow keys.';
      }
    }
  });

  canvas.addEventListener('focus', () => {
    canvas.style.outline = '2px solid rgba(123,204,196,0.45)';
  });
  canvas.addEventListener('blur', () => {
    canvas.style.outline = 'none';
  });

  // Main animation loop
  let last = performance.now();
  function loop(now) {
    const dt = now - last;
    last = now;
    animationTime += dt;
    update(dt / 1000);
    render(animationTime);
    requestAnimationFrame(loop);
  }

  function update(seconds) {
    // parts ease back to home
    parts.forEach((p) => {
      if (!dragging || dragging.part !== p) {
        p.x += (p.homeX - p.x) * 0.06;
        p.y += (p.homeY - p.y) * 0.06;
      }
    });
    updateParticles();
    updateConfetti();
  }

  function render(t) {
    clear();
    drawClouds(t);
    drawSteam(t);
    drawMachine(t);
    drawMascot(t);
    drawParts(t);
    drawParticles();
    drawConfetti();
    drawHUD(t);

    // audio off overlay (subtle)
    if (!audioEnabled) {
      ctx.fillStyle = 'rgba(231,76,60,0.04)';
      ctx.fillRect(WIDTH - 88, 6, 84, 40);
      ctx.fillStyle = '#E74C3C';
      ctx.font = '12px sans-serif';
      ctx.fillText('Audio Off', WIDTH - 84, 34);
    }

    // highlight selected part
    if (selectedIndex >= 0 && parts[selectedIndex]) {
      const p = parts[selectedIndex];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 10, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(87,182,167,0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // win overlay
    if (won) {
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillRect(0, HEIGHT / 2 - 40, WIDTH, 80);
      ctx.fillStyle = '#2C3E50';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Great job! Preparing next level...', WIDTH / 2, HEIGHT / 2 + 8);
      ctx.textAlign = 'start';
    }
  }

  // Initialize UX and audio gestures
  setupLevel(1);
  if (audioEnabled) {
    liveRegion.textContent = 'Tap or press a key to enable audio.';
    const onFirstUse = () => {
      safeResumeAudio().then(() => {
        if (audioEnabled) startHum();
      });
      window.removeEventListener('pointerdown', onFirstUse);
      window.removeEventListener('keydown', onFirstUse);
    };
    window.addEventListener('pointerdown', onFirstUse);
    window.addEventListener('keydown', onFirstUse);
  } else {
    liveRegion.textContent = 'Audio is not available in this browser.';
  }

  // Start loop
  requestAnimationFrame(loop);

  // Expose small API for testing
  container._machineMathGame = {
    reset: () => setupLevel(1),
    nextLevel: () => setupLevel(currentLevel + 1),
  };

  // Global error handling to inform user
  window.addEventListener('error', (evt) => {
    liveRegion.textContent = 'An error occurred in the game. Try reloading the page.';
    console.error('Game error:', evt.error || evt.message);
  });
})();