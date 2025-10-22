(function () {
  // Improved Visuals & Audio for Educational Drone Math Game
  // All drawing done on a canvas sized exactly 720x480 inside #game-of-the-day-stage
  // Uses Web Audio API generated sounds only (no external files)
  // Notes: only visuals/audio were improved; game mechanics and math logic retained.

  // --- Configuration ---
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_CORRECT = 10;
  const MAX_LIVES = 3;
  const PADDING = 12;

  // --- Utility functions ---
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // --- Setup canvas in container ---
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element #game-of-the-day-stage not found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = WIDTH + 'px';
  container.style.height = HEIGHT + 'px';
  container.style.outline = 'none';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone math game. Use arrow keys to move, space to select, 1-4 to choose a pad, R to restart, M to mute.'
  );
  canvas.tabIndex = 0;
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // --- Audio Setup with robust error handling ---
  let audioEnabled = true;
  let audioCtx = null;
  let masterGain = null;
  let bgGain = null;
  let bgPatternInterval = null;
  let bgNodes = []; // to track pattern nodes for cleanup
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      audioEnabled = false;
      console.warn('Web Audio API not supported in this browser.');
    } else {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioCtx.destination);

      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.06;
      bgGain.connect(masterGain);

      // gentle ambient pad composed of two oscillators with slow detune and filter
      const padOsc1 = audioCtx.createOscillator();
      padOsc1.type = 'sine';
      padOsc1.frequency.value = 110; // low
      const padOsc2 = audioCtx.createOscillator();
      padOsc2.type = 'sine';
      padOsc2.frequency.value = 132; // a fifth above for warmth

      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.02;

      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 600;

      padOsc1.connect(padFilter);
      padOsc2.connect(padFilter);
      padFilter.connect(padGain);
      padGain.connect(bgGain);

      // gentle detune LFO for movement
      try {
        const lfo = audioCtx.createOscillator();
        lfo.frequency.value = 0.06;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 3; // detune cents-ish
        lfo.connect(lfoGain);
        lfoGain.connect(padOsc2.detune || padOsc2.frequency); // may be supported
        lfo.start();
      } catch (e) {
        // ignore if detune automation not supported
      }

      padOsc1.start();
      padOsc2.start();

      // gentle background chord arpeggio pattern (scheduled via interval)
      const pentatonic = [262, 330, 392, 523, 660]; // C major-ish palette
      const scheduleBackgroundPattern = () => {
        // clean up previous pattern nodes
        bgNodes.forEach(n => {
          try {
            if (n.osc) n.osc.stop();
            if (n.gain) n.gain.disconnect();
            if (n.pan) n.pan.disconnect();
          } catch (e) {}
        });
        bgNodes = [];
        const start = audioCtx.currentTime + 0.01;
        const pattern = [0, 2, 4, 2]; // relative indices
        pattern.forEach((step, i) => {
          const t = start + i * 0.55;
          const freq = pentatonic[step % pentatonic.length];
          // create a short pluck
          try {
            const osc = audioCtx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const g = audioCtx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
            const pan = audioCtx.createStereoPanner();
            pan.pan.value = i % 2 === 0 ? -0.3 : 0.3;
            osc.connect(g);
            g.connect(pan);
            pan.connect(bgGain);
            osc.start(t);
            osc.stop(t + 1.0);
            bgNodes.push({ osc, gain: g, pan });
          } catch (err) {
            console.warn('Background pattern node creation failed:', err);
          }
        });
      };

      // schedule repeating pattern, but with safe guard
      scheduleBackgroundPattern();
      bgPatternInterval = setInterval(() => {
        if (!audioEnabled || !audioCtx) return;
        scheduleBackgroundPattern();
      }, 3000);
    }
  } catch (e) {
    audioEnabled = false;
    console.warn('Audio context creation failed:', e);
  }

  function safeResumeAudio() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
      audioCtx.resume().catch(e => {
        console.warn('Audio resume failed:', e);
      });
    }
  }

  // --- Sound effect helpers (WebAudio only) ---
  function playTone({ freq = 440, duration = 0.35, type = 'sine', gain = 0.12, pan = 0 } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      const panNode = audioCtx.createStereoPanner();
      panNode.pan.value = pan;

      osc.connect(g);
      g.connect(panNode);
      panNode.connect(masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('playTone error:', e);
    }
  }

  function playCorrectSound() {
    // a short happy triad with soft percussive click
    if (!audioEnabled || !audioCtx) return;
    try {
      const root = 660;
      playTone({ freq: root, duration: 0.22, type: 'sine', gain: 0.18, pan: -0.2 });
      setTimeout(
        () =>
          playTone({
            freq: Math.round(root * 1.25),
            duration: 0.26,
            type: 'triangle',
            gain: 0.14,
            pan: 0.2
          }),
        70
      );
      // gentle chime
      setTimeout(
        () =>
          playTone({
            freq: Math.round(root * 2),
            duration: 0.6,
            type: 'sine',
            gain: 0.08,
            pan: 0
          }),
        140
      );
    } catch (e) {
      console.warn('Error playing correct sound:', e);
    }
  }

  function playIncorrectSound() {
    // a brief descending minor-fall with soft thud
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      playTone({ freq: 330, duration: 0.32, type: 'sawtooth', gain: 0.12, pan: 0.1 });
      setTimeout(() => playTone({ freq: 220, duration: 0.36, type: 'sawtooth', gain: 0.12, pan: -0.1 }), 100);
      // soft thud using short noise-ish oscillator via low-pass
      const o = audioCtx.createOscillator();
      o.type = 'square';
      o.frequency.value = 60;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + 0.45);
    } catch (e) {
      console.warn('Error playing incorrect sound:', e);
    }
  }

  function playSelectSound() {
    if (!audioEnabled || !audioCtx) return;
    try {
      playTone({ freq: 420, duration: 0.12, type: 'triangle', gain: 0.06, pan: 0 });
    } catch (e) {
      console.warn('Select sound error:', e);
    }
  }

  // --- Game State (mechanics preserved) ---
  let score = 0;
  let lives = MAX_LIVES;
  let roundActive = true;
  let currentProblem = null;
  let choices = [];
  let drone = {
    x: WIDTH / 2,
    y: 120,
    vx: 0,
    width: 64,
    height: 36,
    descending: false,
    targetPadIndex: null,
    descendProgress: 0,
    propAngle: 0
  };
  let pads = [];
  let messageTimer = 0;
  let messageText = '';
  let paused = false;
  let gameOverState = null;
  let highlightAudio = audioEnabled;
  let lastAnswerCorrect = null;

  // visual-only states
  let timeElapsed = 0;
  let cloudsOffset = 0;
  let hoveredPadIndex = -1;
  let particles = []; // simple visual feedback particles

  // prepare pads
  function layoutPads() {
    pads = [];
    const padCount = 4;
    const padY = HEIGHT - 120;
    const padW = 130;
    const padH = 64;
    const gap = (WIDTH - padCount * padW) / (padCount + 1);
    for (let i = 0; i < padCount; i++) {
      const x = gap + i * (padW + gap);
      pads.push({ x, y: padY, w: padW, h: padH, value: 0, idx: i, glow: 0 });
    }
  }
  layoutPads();

  // --- Problem generation retained as-is ---
  function generateProblem() {
    const op = Math.random() < 0.6 ? '+' : '-';
    let a, b;
    if (op === '+') {
      a = randInt(1, 12);
      b = randInt(1, 10);
      if (a + b > 20) {
        a = Math.max(1, 20 - b);
      }
    } else {
      a = randInt(5, 20);
      b = randInt(1, Math.min(9, a - 1));
    }
    const question = `${a} ${op} ${b}`;
    const answer = op === '+' ? a + b : a - b;
    currentProblem = { a, b, op, question, answer };
    const set = new Set();
    set.add(answer);
    while (set.size < 4) {
      let delta = randInt(-5, 5);
      if (delta === 0) delta = randInt(1, 3);
      let candidate = answer + delta;
      if (candidate < 0) candidate = Math.abs(candidate) + 1;
      if (candidate > 30) candidate = 30 - (candidate % 5);
      set.add(candidate);
    }
    choices = shuffle(Array.from(set));
    for (let i = 0; i < pads.length; i++) {
      pads[i].value = choices[i];
      pads[i].glow = 0;
    }
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- Input Handling (preserve controls) ---
  const keys = {};
  canvas.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    safeResumeAudio();
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
    }
    if (e.key.toLowerCase() === 'r') {
      restartGame();
    } else if (e.key.toLowerCase() === 'm') {
      toggleMute();
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      const idx = parseInt(e.key) - 1;
      attemptSelectPad(idx);
      playSelectSound();
    }
  });
  canvas.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  // Mouse interactions enhanced for visuals
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let found = -1;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
        found = i;
        break;
      }
    }
    hoveredPadIndex = found;
  });

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (gameOverState) {
      const btn = getRestartButtonBounds();
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        restartGame();
      }
      return;
    }

    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
        attemptSelectPad(i);
        playSelectSound();
        return;
      }
    }
    const audioRect = getAudioIconBounds();
    if (mx >= audioRect.x && mx <= audioRect.x + audioRect.w && my >= audioRect.y && my <= audioRect.y + audioRect.h) {
      toggleMute();
    }
  });

  function attemptSelectPad(index) {
    if (gameOverState || !roundActive) return;
    if (index < 0 || index >= pads.length) return;
    drone.descending = true;
    drone.targetPadIndex = index;
    drone.descendProgress = 0;
    safeResumeAudio();
  }

  function getAudioIconBounds() {
    const w = 36;
    const h = 28;
    return { x: WIDTH - w - PADDING, y: PADDING + 30, w, h };
  }

  function toggleMute() {
    if (!audioCtx) {
      audioEnabled = false;
      highlightAudio = false;
      return;
    }
    audioEnabled = !audioEnabled;
    highlightAudio = audioEnabled;
    try {
      // affect gain nodes to mute/unmute gracefully
      if (masterGain) masterGain.gain.value = audioEnabled ? 0.9 : 0.0;
    } catch (e) {
      console.warn('Toggle mute error:', e);
    }
  }

  // --- Game Logic for selection (preserved) ---
  function processSelection(padIndex) {
    const selectedValue = pads[padIndex].value;
    const correct = selectedValue === currentProblem.answer;
    lastAnswerCorrect = correct;
    if (correct) {
      score += 1;
      messageText = 'Nice! Package delivered!';
      messageTimer = 90;
      playCorrectSound();
      spawnParticles(drone.x, drone.y + 8, 12, true);
      // glow pad
      pads[padIndex].glow = 1.0;
    } else {
      lives -= 1;
      messageText = 'Oops! Wrong building!';
      messageTimer = 90;
      playIncorrectSound();
      spawnParticles(drone.x, drone.y + 8, 10, false);
      pads[padIndex].glow = 1.0;
    }
    roundActive = false;
    setTimeout(() => {
      if (score >= TARGET_CORRECT) {
        gameOverState = 'win';
      } else if (lives <= 0) {
        gameOverState = 'loss';
      } else {
        generateProblem();
        roundActive = true;
      }
      drone.descending = false;
      drone.targetPadIndex = null;
      drone.descendProgress = 0;
      drone.x = WIDTH / 2;
      drone.y = 120;
    }, 700);
  }

  // --- Restart ---
  function restartGame() {
    score = 0;
    lives = MAX_LIVES;
    roundActive = true;
    gameOverState = null;
    messageText = '';
    messageTimer = 0;
    lastAnswerCorrect = null;
    generateProblem();
    drone.x = WIDTH / 2;
    drone.y = 120;
    drone.descending = false;
    drone.targetPadIndex = null;
    drone.descendProgress = 0;
    safeResumeAudio();
  }

  // --- Visual helpers & drawing utilities ---
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (r < 0) r = 0;
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

  function roundRectFillStroke(x, y, w, h, r, fillColor, strokeColor) {
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor || '#999';
    ctx.lineWidth = 1.6;
    roundRect(ctx, x, y, w, h, r, true, true);
  }

  function drawBackground() {
    // Soft gradient sky with subtle radial warm glow
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#eaf8ff');
    g.addColorStop(0.6, '#f7fbff');
    g.addColorStop(1, '#f4fbf9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // moving clouds (parallax)
    cloudsOffset = (cloudsOffset + 0.2) % WIDTH;
    for (let i = 0; i < 6; i++) {
      const baseX = (i * 180 + cloudsOffset * (0.4 + (i % 3) * 0.15)) % (WIDTH + 200) - 100;
      const cy = 40 + (i % 3) * 14;
      const scale = 0.8 + (i % 3) * 0.25;
      ctx.globalAlpha = 0.28;
      drawCloud(baseX, cy, 36 * scale, '#ffffff');
      ctx.globalAlpha = 1;
    }

    // ground gradient and silhouette
    const groundG = ctx.createLinearGradient(0, HEIGHT - 120, 0, HEIGHT);
    groundG.addColorStop(0, '#e7f8f0');
    groundG.addColorStop(1, '#dff0ea');
    ctx.fillStyle = groundG;
    ctx.fillRect(0, HEIGHT - 120, WIDTH, 120);

    // buildings / pads backdrop (soft stylized shapes)
    const buildingColors = ['#d6eeff', '#eafee9', '#fff7dd'];
    for (let i = 0; i < 9; i++) {
      const bw = 50 + (i % 3) * 18;
      const bh = 50 + ((i * 7) % 60);
      const bx = i * 76 - (i % 2) * 8;
      const by = HEIGHT - 120 - bh;
      ctx.fillStyle = buildingColors[i % buildingColors.length];
      roundRect(ctx, bx, by, bw, bh, 6, true, false);
      ctx.strokeStyle = '#d5d5d5';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 6, by + 6, bw - 12, bh - 12);
    }
  }

  function drawCloud(x, y, r, color) {
    ctx.fillStyle = color;
    arcFill(x, y, r);
    arcFill(x + r * 0.75, y - r * 0.18, r * 0.8);
    arcFill(x - r * 0.75, y - r * 0.18, r * 0.8);
    ctx.fillRect(x - r, y, r * 2, r * 0.8);
  }

  function arcFill(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Drone drawing with nicer styling and propeller animation ---
  function drawDrone(now) {
    // bobbing when idle
    const bob = Math.sin(timeElapsed * 0.004) * 6;
    const d = drone;
    if (!d.descending) {
      d.y = 120 + bob;
    }
    // prop rotation
    d.propAngle += 0.45 + Math.abs(d.vx) * 0.1;
    // shadow scale by altitude (lower y -> smaller shadow)
    const minY = 120;
    const maxY = HEIGHT - 140;
    const t = clamp((d.y - minY) / (maxY - minY), 0, 1);
    const shadowScale = 0.6 + 0.6 * t;

    // shadow
    ctx.save();
    ctx.translate(d.x, d.y + d.height / 2 + 8);
    ctx.scale(1.2 * shadowScale, 0.6 * shadowScale);
    ctx.fillStyle = 'rgba(30,30,30,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, d.width * 0.6, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // drone body
    ctx.save();
    ctx.translate(d.x, d.y);
    // subtle body gradient
    const bodyGrad = ctx.createLinearGradient(-d.width / 2, -d.height / 2, d.width / 2, d.height / 2);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(1, '#e6f8ff');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#4e7788';
    ctx.lineWidth = 2.2;
    roundRect(ctx, -d.width / 2, -d.height / 2, d.width, d.height, 10, true, true);

    // cockpit
    ctx.fillStyle = '#bfefff';
    roundRect(ctx, -d.width / 2 + 10, -d.height / 2 + 6, d.width - 20, d.height / 2 - 6, 6, true, false);

    // friendly eyes / face decal
    ctx.fillStyle = '#ffdca8';
    ctx.beginPath();
    ctx.ellipse(-d.width / 4, -d.height / 6, 6, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(d.width / 4, -d.height / 6, 6, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // package dangling point when descending
    if (d.descending) {
      ctx.strokeStyle = '#bdbdbd';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(0, d.height / 2);
      ctx.lineTo(0, d.height / 2 + 18 + d.descendProgress * 10);
      ctx.stroke();
      ctx.fillStyle = lastAnswerCorrect ? '#d7ffd7' : '#ffdede';
      roundRect(ctx, -10, d.height / 2 + 18, 20, 16, 4, true, true);
    } else {
      // little cargo box attached but tucked away
      ctx.fillStyle = '#efe0b2';
      roundRect(ctx, -8, d.height / 2 + 6, 16, 10, 3, true, true);
    }

    // propellers: four, animated
    for (let i = 0; i < 4; i++) {
      const px = (i - 1.5) * (d.width / 2.2);
      const py = -d.height / 2 - 6;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(d.propAngle + i * 0.9);
      ctx.fillStyle = 'rgba(80,120,140,0.9)';
      // prop blades as rounded rectangles using paths
      for (let b = 0; b < 3; b++) {
        ctx.globalAlpha = 0.85 - b * 0.22;
        ctx.beginPath();
        ctx.ellipse((b - 1) * 6, 0, 18 - b * 5, 5 - b * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // --- Pads drawing with subtle animations ---
  function drawPads(now) {
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      // calculate hover or recent glow
      const hovered = i === hoveredPadIndex;
      const targeted = drone.targetPadIndex === i && drone.descending;
      // glow decay
      p.glow = Math.max(0, p.glow - 0.02);
      const glowAlpha = p.glow * 0.9 + (hovered ? 0.4 : 0) + (targeted ? 0.35 : 0);
      // pad shadow
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(p.x + 6, p.y + 10, p.w - 2, p.h - 6);

      // body with gentle gradient
      const padGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
      padGrad.addColorStop(0, hovered ? '#fffdf0' : '#ffffff');
      padGrad.addColorStop(1, '#f6fbff');
      ctx.fillStyle = padGrad;
      ctx.strokeStyle = '#c1d7e6';
      ctx.lineWidth = 1.8;
      roundRect(ctx, p.x, p.y, p.w, p.h, 14, true, true);

      // rooftop accent
      ctx.fillStyle = '#eaf6ff';
      roundRect(ctx, p.x + 10, p.y - 18, p.w - 20, 16, 6, true, true);

      // glowing halo behind pad when highlighted
      if (glowAlpha > 0.02) {
        ctx.save();
        ctx.globalAlpha = clamp(glowAlpha, 0, 0.9);
        ctx.fillStyle = lastAnswerCorrect ? '#dfffe0' : '#ffecec';
        roundRect(ctx, p.x - 6, p.y - 6, p.w + 12, p.h + 12, 18, true, false);
        ctx.restore();
      }

      // value box
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = '#0f3b47';
      const text = String(p.value);
      const metrics = ctx.measureText(text);
      const tx = p.x + (p.w - metrics.width) / 2;
      const ty = p.y + p.h / 2 + 10;

      // soft plate behind number
      const tbw = metrics.width + 20;
      const tbh = 40;
      const tbx = tx - 10;
      const tby = ty - 28;
      roundRectFillStroke(tbx, tby, tbw, tbh, 10, '#ffffff', '#d7e9f2');
      ctx.fillStyle = '#0f3b47';
      ctx.fillText(text, tx, ty);

      // small pad index label
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#5e6c73';
      ctx.fillText(`(${i + 1})`, p.x + 8, p.y + p.h - 12);
    }
  }

  // --- Instructions & UI with spacing preserved ---
  function drawTopUI() {
    // Score
    ctx.font = 'bold 20px sans-serif';
    const scoreText = `Score: ${score}`;
    const scoreW = ctx.measureText(scoreText).width + 16;
    const scoreH = 30;
    const scoreX = PADDING;
    const scoreY = PADDING;
    roundRectFillStroke(scoreX, scoreY, scoreW, scoreH, 8, '#ffffffcc', '#bfe6ff');
    ctx.fillStyle = '#0d4b57';
    ctx.fillText(scoreText, scoreX + 8, scoreY + 20);

    // Progress
    ctx.font = 'bold 22px sans-serif';
    const progressText = `Delivery ${score + 1} of ${TARGET_CORRECT}`;
    const progW = ctx.measureText(progressText).width + 20;
    const progX = (WIDTH - progW) / 2;
    const progY = PADDING;
    roundRectFillStroke(progX, progY, progW, scoreH, 8, '#ffffffcc', '#dff2e6');
    ctx.fillStyle = '#0b5245';
    ctx.fillText(progressText, progX + 10, progY + 20);

    // Lives
    ctx.font = 'bold 20px sans-serif';
    const livesText = `Mistakes: ${MAX_LIVES - lives}/${MAX_LIVES}`;
    const livesW = ctx.measureText(livesText).width + 16;
    const livesX = WIDTH - livesW - PADDING;
    const livesY = PADDING;
    roundRectFillStroke(livesX, livesY, livesW, scoreH, 8, '#fff0f0cc', '#ffd6d6');
    ctx.fillStyle = '#6b0b0b';
    ctx.fillText(livesText, livesX + 8, livesY + 20);

    // Audio icon
    const audioRect = getAudioIconBounds();
    roundRectFillStroke(audioRect.x - 2, audioRect.y - 2, audioRect.w + 4, audioRect.h + 4, 6, '#ffffffcc', '#d0d0d0');
    ctx.fillStyle = highlightAudio ? '#0b6b6b' : '#888';
    ctx.beginPath();
    ctx.moveTo(audioRect.x + 6, audioRect.y + 8);
    ctx.lineTo(audioRect.x + 16, audioRect.y + 8);
    ctx.lineTo(audioRect.x + 24, audioRect.y + 4);
    ctx.lineTo(audioRect.x + 24, audioRect.y + audioRect.h - 4);
    ctx.lineTo(audioRect.x + 16, audioRect.y + audioRect.h - 8);
    ctx.lineTo(audioRect.x + 6, audioRect.y + audioRect.h - 8);
    ctx.closePath();
    ctx.fill();
    if (highlightAudio) {
      ctx.beginPath();
      ctx.strokeStyle = '#0b6b6b';
      ctx.lineWidth = 2;
      ctx.arc(audioRect.x + 26, audioRect.y + audioRect.h / 2 - 2, 8, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#aa0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(audioRect.x + 26, audioRect.y + 6);
      ctx.lineTo(audioRect.x + 34, audioRect.y + audioRect.h - 6);
      ctx.stroke();
    }
  }

  function drawProblemBox() {
    if (!currentProblem) return;
    ctx.font = 'bold 26px sans-serif';
    const q = 'Solve: ' + currentProblem.question;
    const metrics = ctx.measureText(q);
    const boxW = metrics.width + 28;
    const boxH = 44;
    const bx = (WIDTH - boxW) / 2;
    const by = 70;
    roundRectFillStroke(bx, by, boxW, boxH, 10, '#ffffffee', '#cfeefb');
    ctx.fillStyle = '#083a45';
    ctx.fillText(q, bx + 14, by + 30);
  }

  function drawInstructions() {
    const lines = [
      'Controls: ← / → or A/D to move drone  •  Space to drop  •  1-4 to choose a pad',
      'Goal: Deliver ' + TARGET_CORRECT + ' packages. 3 wrong deliveries = game over.',
      'Click a pad or press its number. Press M to mute/unmute audio. Press R to restart.'
    ];
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#08303b';
    let maxW = 0;
    for (const l of lines) {
      const m = ctx.measureText(l).width;
      if (m > maxW) maxW = m;
    }
    const boxW = maxW + 20;
    const boxH = lines.length * 22 + 14;
    const bx = (WIDTH - boxW) / 2;
    const by = HEIGHT - boxH - PADDING;
    roundRectFillStroke(bx, by, boxW, boxH, 8, '#ffffffcc', '#cdeeff');
    ctx.fillStyle = '#03313a';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + 10, by + 20 + i * 22);
    }
  }

  function drawMessage() {
    if (!messageText || messageTimer <= 0) return;
    ctx.font = '18px sans-serif';
    const text = messageText;
    const metrics = ctx.measureText(text);
    const w = metrics.width + 24;
    const h = 36;
    const x = (WIDTH - w) / 2;
    const y = 120;
    roundRectFillStroke(x, y, w, h, 10, lastAnswerCorrect ? '#e9fff0' : '#fff0f0', '#c7c7c7');
    ctx.fillStyle = lastAnswerCorrect ? '#0a6b18' : '#a60404';
    ctx.fillText(text, x + 12, y + 23);
  }

  function getRestartButtonBounds() {
    const bw = 160;
    const bh = 44;
    const bx = (WIDTH - bw) / 2;
    const by = HEIGHT / 2 + 80;
    return { x: bx, y: by, w: bw, h: bh };
  }

  function drawEndScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#fff';
    let title = gameOverState === 'win' ? 'Victory!' : 'Game Over';
    const titleMetrics = ctx.measureText(title);
    const titleW = titleMetrics.width + 40;
    const titleH = 60;
    const tx = (WIDTH - titleW) / 2;
    const ty = HEIGHT / 2 - 80;
    roundRectFillStroke(tx, ty, titleW, titleH, 12, '#2b7a7a', '#0b3940');
    ctx.fillStyle = '#fff';
    ctx.fillText(title, tx + 20, ty + 40);

    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#ffffff';
    const msg =
      gameOverState === 'win'
        ? `Your drone delivered ${score} packages! You're a master pilot.`
        : `You made ${MAX_LIVES - lives} mistakes. Try again!`;
    const metrics = ctx.measureText(msg);
    const mw = metrics.width;
    ctx.fillText(msg, (WIDTH - mw) / 2, HEIGHT / 2 - 20);

    const btn = getRestartButtonBounds();
    roundRectFillStroke(btn.x, btn.y, btn.w, btn.h, 10, '#ffffff', '#2f8a5e');
    ctx.fillStyle = '#083a2b';
    ctx.font = 'bold 20px sans-serif';
    const btnText = 'Restart (R)';
    const bm = ctx.measureText(btnText).width;
    ctx.fillText(btnText, btn.x + (btn.w - bm) / 2, btn.y + 28);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#f0f0f0';
    const hint = 'Press R to restart or click the button';
    const hm = ctx.measureText(hint).width;
    ctx.fillText(hint, (WIDTH - hm) / 2, btn.y + btn.h + 26);
  }

  // --- Simple particle system for celebratory feedback (visual only) ---
  function spawnParticles(x, y, count, positive) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x + randInt(-8, 8),
        y: y + randInt(4, 18),
        vx: (Math.random() - 0.5) * 2.4,
        vy: -Math.random() * (positive ? 2.8 : 1.6) - 1,
        life: 60 + randInt(-10, 40),
        size: 2 + Math.random() * 3,
        color: positive ? `rgba(50,180,60,${0.9})` : `rgba(220,60,60,${0.9})`,
        gravity: 0.08
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 100);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.size * (p.life / 80)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- Main update & draw loop (mechanics preserved) ---
  function update() {
    if (gameOverState) {
      // allow some visual motion but not gameplay updates
      drone.propAngle += 0.8;
      timeElapsed += 16;
      updateParticles();
      return;
    }

    // keyboard drone movement when not descending
    if (!drone.descending) {
      let move = 0;
      if (keys['arrowleft'] || keys['a']) move = -1;
      if (keys['arrowright'] || keys['d']) move = 1;
      drone.vx = move * 3.2;
      drone.x += drone.vx;
      drone.x = clamp(drone.x, 40, WIDTH - 40);

      if (keys[' '] || keys['spacebar']) {
        let nearest = 0;
        let minDist = Infinity;
        for (let i = 0; i < pads.length; i++) {
          const center = pads[i].x + pads[i].w / 2;
          const dist = Math.abs(center - drone.x);
          if (dist < minDist) {
            minDist = dist;
            nearest = i;
          }
        }
        attemptSelectPad(nearest);
        keys[' '] = false;
        keys['spacebar'] = false;
      }
    } else {
      const targetPad = pads[drone.targetPadIndex];
      if (!targetPad) {
        drone.descending = false;
        return;
      }
      const targetX = targetPad.x + targetPad.w / 2;
      const dx = targetX - drone.x;
      drone.x += dx * 0.18;
      drone.descendProgress += 0.08;
      drone.y = 120 + (targetPad.y - 120) * Math.min(1, drone.descendProgress);
      if (
        drone.descendProgress >= 0.98 ||
        Math.abs(targetPad.x + targetPad.w / 2 - drone.x) < 2
      ) {
        // final selection: call existing logic
        processSelection(drone.targetPadIndex);
      }
    }

    if (messageTimer > 0) messageTimer--;
    timeElapsed += 16;
    updateParticles();
    drone.propAngle += 0.6;
    // decay hoveredPadIndex if mouse not over canvas (handled by mousemove)
    // pad glow decays inside drawPads
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawTopUI();
    drawPads();
    drawDrone();
    drawParticles();
    drawMessage();
    drawInstructions();
    drawProblemBox();
    if (gameOverState) drawEndScreen();
  }

  // preserve original draw order but call newer functions
  function drawDrone() {
    drawDroneVisual();
  } // placeholder to avoid hoisting confusion

  // define actual drone draw (wrapped to avoid name clash)
  function drawDroneVisual() {
    // forward to the earlier defined drawDrone(now) style function
    // We call drawDroneBody here by reading current drone state
    // To prevent duplication we call the previously defined implementation by name conflict resolution
    // Reimplement inline to ensure consistent closure use
    // bobbing when idle
    const bob = Math.sin(timeElapsed * 0.004) * 6;
    const d = drone;
    if (!d.descending) {
      d.y = 120 + bob;
    }
    d.propAngle += 0.45 + Math.abs(d.vx) * 0.1;
    const minY = 120;
    const maxY = HEIGHT - 140;
    const t = clamp((d.y - minY) / (maxY - minY), 0, 1);
    const shadowScale = 0.6 + 0.6 * t;

    // shadow
    ctx.save();
    ctx.translate(d.x, d.y + d.height / 2 + 10);
    ctx.scale(1.2 * shadowScale, 0.6 * shadowScale);
    ctx.fillStyle = 'rgba(30,30,30,0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 0, d.width * 0.6, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // drone body
    ctx.save();
    ctx.translate(d.x, d.y);
    const bodyGrad = ctx.createLinearGradient(-d.width / 2, -d.height / 2, d.width / 2, d.height / 2);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(1, '#e6f8ff');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#4e7788';
    ctx.lineWidth = 2.2;
    roundRect(ctx, -d.width / 2, -d.height / 2, d.width, d.height, 10, true, true);

    // cockpit
    ctx.fillStyle = '#bfefff';
    roundRect(ctx, -d.width / 2 + 10, -d.height / 2 + 6, d.width - 20, d.height / 2 - 6, 6, true, false);

    // eyes
    ctx.fillStyle = '#ffdca8';
    ctx.beginPath();
    ctx.ellipse(-d.width / 4, -d.height / 6, 6, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(d.width / 4, -d.height / 6, 6, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // cargo
    if (d.descending) {
      ctx.strokeStyle = '#bdbdbd';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(0, d.height / 2);
      ctx.lineTo(0, d.height / 2 + 18 + d.descendProgress * 10);
      ctx.stroke();
      ctx.fillStyle = lastAnswerCorrect ? '#d7ffd7' : '#ffdede';
      roundRect(ctx, -10, d.height / 2 + 18, 20, 16, 4, true, true);
    } else {
      ctx.fillStyle = '#efe0b2';
      roundRect(ctx, -8, d.height / 2 + 6, 16, 10, 3, true, true);
    }

    // propellers
    for (let i = 0; i < 4; i++) {
      const px = (i - 1.5) * (d.width / 2.2);
      const py = -d.height / 2 - 6;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(d.propAngle + i * 0.9);
      ctx.fillStyle = 'rgba(80,120,140,0.95)';
      for (let b = 0; b < 3; b++) {
        ctx.globalAlpha = 0.85 - b * 0.22;
        ctx.beginPath();
        ctx.ellipse((b - 1) * 6, 0, 18 - b * 5, 5 - b * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ensure correct pad & drone drawing functions are invoked
  function drawPads() {
    drawPadsVisual();
  }
  function drawPadsVisual() {
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const hovered = i === hoveredPadIndex;
      const targeted = drone.targetPadIndex === i && drone.descending;
      p.glow = Math.max(0, p.glow - 0.02);
      const glowAlpha = p.glow * 0.9 + (hovered ? 0.4 : 0) + (targeted ? 0.35 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(p.x + 6, p.y + 10, p.w - 2, p.h - 6);

      const padGrad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
      padGrad.addColorStop(0, hovered ? '#fffdf0' : '#ffffff');
      padGrad.addColorStop(1, '#f6fbff');
      ctx.fillStyle = padGrad;
      ctx.strokeStyle = '#c1d7e6';
      ctx.lineWidth = 1.8;
      roundRect(ctx, p.x, p.y, p.w, p.h, 14, true, true);

      ctx.fillStyle = '#eaf6ff';
      roundRect(ctx, p.x + 10, p.y - 18, p.w - 20, 16, 6, true, true);

      if (glowAlpha > 0.02) {
        ctx.save();
        ctx.globalAlpha = clamp(glowAlpha, 0, 0.9);
        ctx.fillStyle = lastAnswerCorrect ? '#dfffe0' : '#ffecec';
        roundRect(ctx, p.x - 6, p.y - 6, p.w + 12, p.h + 12, 18, true, false);
        ctx.restore();
      }

      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = '#0f3b47';
      const text = String(p.value);
      const metrics = ctx.measureText(text);
      const tx = p.x + (p.w - metrics.width) / 2;
      const ty = p.y + p.h / 2 + 10;
      const tbw = metrics.width + 20;
      const tbh = 40;
      const tbx = tx - 10;
      const tby = ty - 28;
      roundRectFillStroke(tbx, tby, tbw, tbh, 10, '#ffffff', '#d7e9f2');
      ctx.fillStyle = '#0f3b47';
      ctx.fillText(text, tx, ty);

      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#5e6c73';
      ctx.fillText(`(${i + 1})`, p.x + 8, p.y + p.h - 12);
    }
  }

  // --- Loop setup and start ---
  generateProblem();
  let last = performance.now();
  function loop(ts) {
    const dt = ts - last;
    last = ts;
    update();
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // focus canvas for keyboard control
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (e) {}
  }, 100);

  // show small hint if audio is unavailable
  if (!audioEnabled) {
    setTimeout(() => {
      ctx.font = '14px sans-serif';
      const msg = 'Audio unavailable. Press M to toggle (if supported).';
      const mW = ctx.measureText(msg).width;
      ctx.fillStyle = '#5a5a5a';
      ctx.fillText(msg, WIDTH - mW - PADDING, HEIGHT - PADDING - 10);
    }, 500);
  }

  // expose some helpers for debugging
  window.__droneMathGame = {
    restart: restartGame,
    mute: toggleMute
  };

  // cleanup on page unload: stop intervals and audio nodes
  window.addEventListener('unload', () => {
    try {
      if (bgPatternInterval) clearInterval(bgPatternInterval);
      if (audioCtx && typeof audioCtx.close === 'function') audioCtx.close();
    } catch (e) {}
  });

  // end IIFE
})();