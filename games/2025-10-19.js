(function () {
  // Drone Math Adventure - Visual & Audio Enhancements
  // Renders inside element with id "game-of-the-day-stage".
  // All visuals drawn with canvas; all sounds generated via Web Audio API.
  // Game mechanics and math logic remain unchanged.

  // -------------------------
  // Constants and Setup
  // -------------------------
  const STAGE_ID = 'game-of-the-day-stage';
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 12;
  const TARGET_CORRECT = 10;
  const MAX_WRONG = 3;
  const MIN_BODY_FONT = 14;
  const IMPORTANT_FONT = 20;

  // Calming, friendly palette
  const COLORS = {
    bgTop: '#cfeefc',
    bgBottom: '#eaf6ff',
    panel: '#ffffffee',
    text: '#103c58',
    accent: '#ffb25c',
    good: '#2ecc71',
    bad: '#ff6b6b',
    pad: '#9ad3bc',
    padOutline: '#2b6f6f',
    shadow: '#00000033',
    drone: '#6c5ce7',
    audioIcon: '#333',
    hill: '#bfe6d9',
    sun: '#ffd56b',
    cloud: '#ffffffdd',
  };

  // -------------------------
  // DOM & Canvas
  // -------------------------
  const container = document.getElementById(STAGE_ID);
  if (!container) {
    console.error('Game container not found:', STAGE_ID);
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = WIDTH + 'px';
  container.style.height = HEIGHT + 'px';

  // Live region for screen readers
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('role', 'status');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  container.appendChild(liveRegion);

  // Canvas (exact size)
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Adventure. Answer math questions with the drone.'
  );
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  canvas.tabIndex = 0;
  canvas.style.cursor = 'pointer';

  // -------------------------
  // Audio: Web Audio API (enhanced ambient + tones)
  // -------------------------
  let audioContext = null;
  let audioEnabled = true;
  let ambientGain = null;
  let ambientOscA = null;
  let ambientOscB = null;
  let ambientLFO = null;
  let ambientScheduler = null;
  let ambientNotesIndex = 0;

  function initAudioContext() {
    if (audioContext) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported');
      audioContext = new AC();
    } catch (err) {
      console.warn('Audio context creation failed:', err);
      audioEnabled = false;
      audioContext = null;
      updateLiveRegion('Audio unavailable. The game will run without sound.');
      return;
    }

    try {
      // Ambient master gain
      ambientGain = audioContext.createGain();
      ambientGain.gain.value = 0.02; // gentle base volume
      ambientGain.connect(audioContext.destination);

      // Two gentle sine/cosine oscillators to create a warm pad
      ambientOscA = audioContext.createOscillator();
      ambientOscA.type = 'sine';
      ambientOscA.frequency.value = 110; // low root

      ambientOscB = audioContext.createOscillator();
      ambientOscB.type = 'triangle';
      ambientOscB.frequency.value = 176; // harmonic

      // Individual gains for timbre control
      const gA = audioContext.createGain();
      gA.gain.value = 0.012;
      const gB = audioContext.createGain();
      gB.gain.value = 0.01;

      ambientOscA.connect(gA);
      ambientOscB.connect(gB);

      // Mild lowpass filter for warmth
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;

      gA.connect(filter);
      gB.connect(filter);
      filter.connect(ambientGain);

      // LFO to slowly modulate amplitude for gentle breathing
      ambientLFO = audioContext.createOscillator();
      ambientLFO.type = 'sine';
      ambientLFO.frequency.value = 0.12; // slow
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 0.008;
      ambientLFO.connect(lfoGain);
      lfoGain.connect(gA.gain);
      lfoGain.connect(gB.gain);

      // Start nodes
      ambientOscA.start();
      ambientOscB.start();
      ambientLFO.start();

      // Light melodic motif scheduling (periodic change)
      const notes = [110, 130.81, 164.81, 196, 220, 164.81]; // gentle sequence
      ambientNotesIndex = 0;
      ambientScheduler = setInterval(() => {
        if (!audioContext) return;
        try {
          ambientOscA.frequency.setTargetAtTime(
            notes[ambientNotesIndex % notes.length],
            audioContext.currentTime,
            0.2
          );
          ambientOscB.frequency.setTargetAtTime(
            notes[(ambientNotesIndex + 2) % notes.length] * 1.6,
            audioContext.currentTime,
            0.2
          );
          ambientNotesIndex++;
        } catch (e) {
          // ignore scheduling errors
        }
      }, 800);
    } catch (err) {
      console.warn('Ambient audio setup failed:', err);
      // Try to gracefully disconnect partial nodes
      try {
        if (ambientOscA) ambientOscA.disconnect();
        if (ambientOscB) ambientOscB.disconnect();
        if (ambientLFO) ambientLFO.disconnect();
      } catch (e) {}
    }
  }

  function safeResumeAudio() {
    if (!audioContext || typeof audioContext.resume !== 'function') return;
    audioContext.resume().catch((err) => {
      console.warn('Audio resume failed:', err);
    });
  }

  // Play feedback tones: 'correct', 'wrong', 'select'
  function playTone(type = 'correct') {
    if (!audioEnabled) return;
    try {
      if (!audioContext) initAudioContext();
      if (!audioContext) return;
      safeResumeAudio();

      const now = audioContext.currentTime;

      if (type === 'select') {
        // small pluck
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 450;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.25);
        osc.onended = () => {
          try {
            osc.disconnect();
            filter.disconnect();
            gain.disconnect();
          } catch (e) {}
        };
        return;
      }

      if (type === 'correct') {
        // two-tone bright chiming arpeggio
        const o1 = audioContext.createOscillator();
        const o2 = audioContext.createOscillator();
        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.08, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        o1.type = 'sine';
        o2.type = 'triangle';
        o1.frequency.setValueAtTime(880, now);
        o2.frequency.setValueAtTime(1320, now + 0.06);
        o1.connect(g);
        o2.connect(g);
        g.connect(audioContext.destination);
        o1.start(now);
        o2.start(now + 0.06);
        o1.stop(now + 0.7);
        o2.stop(now + 0.7);
        o1.onended = () => {
          try {
            o1.disconnect();
            o2.disconnect();
            g.disconnect();
          } catch (e) {}
        };
        return;
      }

      if (type === 'wrong') {
        // soft, low thunk with small filtered noise
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.55);
        osc.onended = () => {
          try {
            osc.disconnect();
            filter.disconnect();
            gain.disconnect();
          } catch (e) {}
        };
        return;
      }
    } catch (err) {
      console.warn('playTone error:', err);
    }
  }

  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      try {
        if (!audioContext) initAudioContext();
        if (ambientGain) ambientGain.gain.value = 0.02;
        updateLiveRegion('Audio on');
      } catch (err) {
        audioEnabled = false;
        updateLiveRegion('Audio unavailable.');
      }
    } else {
      try {
        if (ambientGain) ambientGain.gain.value = 0;
        updateLiveRegion('Audio muted');
      } catch (err) {}
    }
  }

  // -------------------------
  // Game State
  // -------------------------
  const state = {
    running: true,
    correctCount: 0,
    wrongCount: 0,
    question: null,
    options: [],
    selectedIndex: 0,
    message: '',
    anim: {
      x: WIDTH / 2,
      y: 120,
      targetX: WIDTH / 2,
      targetY: 120,
      vx: 0,
      vy: 0,
      wobble: 0,
      rotor: 0,
      bob: 0,
    },
    phase: 'playing', // playing, win, lose
    lastInteractionTime: 0,
    hudSpacing: {},
    audioAvailable: true,
    announced: '',
    particles: [], // visual effects particles
    clouds: [], // moving clouds state
    time: 0,
  };

  // Initialize some clouds for parallax
  for (let i = 0; i < 6; i++) {
    state.clouds.push({
      x: Math.random() * WIDTH,
      y: 20 + Math.random() * 60,
      w: 60 + Math.random() * 90,
      h: 20 + Math.random() * 30,
      speed: 0.1 + Math.random() * 0.3,
      alpha: 0.3 + Math.random() * 0.5,
    });
  }

  // -------------------------
  // Math question generator (unchanged mechanics)
  // -------------------------
  function generateQuestion() {
    const types = ['add', 'sub', 'add', 'add', 'mul'];
    const t = types[Math.floor(Math.random() * types.length)];
    let a, b, answer, text;
    if (t === 'add') {
      a = randInt(1, 12);
      b = randInt(1, 12);
      answer = a + b;
      text = `${a} + ${b} = ?`;
    } else if (t === 'sub') {
      a = randInt(2, 20);
      b = randInt(1, a - 1);
      answer = a - b;
      text = `${a} - ${b} = ?`;
    } else {
      a = randInt(2, 6);
      b = randInt(2, 6);
      answer = a * b;
      text = `${a} × ${b} = ?`;
    }
    const options = new Set();
    options.add(answer);
    while (options.size < 4) {
      let delta = randInt(-4, 6);
      if (delta === 0) delta = randInt(1, 3);
      let val = answer + delta;
      if (val < 0) val = Math.abs(val) + 1;
      if (options.has(val)) continue;
      options.add(val);
    }
    const optionsArr = shuffle(Array.from(options));
    return { text, answer, options: optionsArr };
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // -------------------------
  // UI helpers
  // -------------------------
  function drawRoundedRect(x, y, w, h, r = 8, fill = true, stroke = false) {
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

  function drawTextPanel(text, x, y, options = {}) {
    const lines = Array.isArray(text) ? text : String(text).split('\n');
    const fontSize = options.fontSize || MIN_BODY_FONT;
    const font = `${fontSize}px sans-serif`;
    ctx.font = font;
    let maxWidth = 0;
    for (const line of lines) {
      const m = ctx.measureText(line);
      if (m.width > maxWidth) maxWidth = m.width;
    }
    const pad = options.padding || 8;
    const h = fontSize * lines.length + pad * 2 + (lines.length - 1) * 6;
    let w = maxWidth + pad * 2;
    // ensure a minimum width for visual balance
    w = Math.max(w, 160);
    let drawX = x;
    let drawY = y;
    if (options.center) {
      drawX = x - w / 2;
    } else if (options.right) {
      drawX = x - w;
    }
    if (options.bottom) {
      drawY = y - h;
    }
    ctx.fillStyle = options.bg || COLORS.panel;
    ctx.strokeStyle = options.border || 'transparent';
    ctx.lineWidth = options.borderWidth || 0;
    ctx.shadowColor = '#00000010';
    ctx.shadowBlur = 6;
    drawRoundedRect(drawX, drawY, w, h, 10, true, options.borderWidth > 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = options.color || COLORS.text;
    ctx.textBaseline = 'top';
    let ty = drawY + pad;
    ctx.textAlign = 'left';
    for (const line of lines) {
      ctx.fillText(line, drawX + pad, ty);
      ty += fontSize + 6;
    }
    return { x: drawX, y: drawY, w, h };
  }

  // -------------------------
  // Visual Elements: pads, drone, background, particles
  // -------------------------
  const padsY = 320;
  const padRadius = 44;
  const padSlots = 4;
  const padPositions = [];
  for (let i = 0; i < padSlots; i++) {
    const spacing = WIDTH / (padSlots + 1);
    padPositions.push({ x: spacing * (i + 1), y: padsY });
  }

  function drawScene() {
    state.time += 1;
    // Background gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle vignette for depth
    ctx.save();
    const vg = ctx.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      80,
      WIDTH / 2,
      HEIGHT / 2,
      700
    );
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();

    // sun and hills
    drawSunAndHills();

    // clouds (parallax)
    for (let c of state.clouds) {
      drawCloud(c);
      c.x += c.speed * 0.4; // slow drift
      if (c.x - c.w > WIDTH + 40) c.x = -c.w - 20;
    }

    // play field with gentle pattern
    ctx.fillStyle = '#e8fbff';
    ctx.fillRect(40, 70, WIDTH - 80, 210);
    // subtle grid lines
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.strokeStyle = '#000';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(50 + i * 80, 80);
      ctx.lineTo(50 + i * 80, 270);
      ctx.stroke();
    }
    ctx.restore();

    // pads
    for (let i = 0; i < padSlots; i++) {
      const isSelected = i === state.selectedIndex;
      drawPad(padPositions[i].x, padPositions[i].y, state.options[i], isSelected);
    }

    // particles (behind drone but above pads)
    drawParticles();

    // drone with rotor animation
    drawDrone(state.anim.x, state.anim.y, state.anim.wobble, state.anim.rotor);

    // UI panels
    ctx.textBaseline = 'top';
    ctx.font = `${IMPORTANT_FONT}px sans-serif`;
    const scoreText = `Stars: ${state.correctCount}/${TARGET_CORRECT}`;
    drawTextPanel(scoreText, PADDING, PADDING, {
      fontSize: IMPORTANT_FONT,
      padding: 10,
      bg: COLORS.panel,
      color: COLORS.text,
    });

    const livesText = `Lives: ${MAX_WRONG - state.wrongCount}`;
    drawTextPanel(livesText, WIDTH - PADDING, PADDING, {
      fontSize: IMPORTANT_FONT,
      padding: 10,
      bg: COLORS.panel,
      color: state.wrongCount >= MAX_WRONG ? COLORS.bad : COLORS.text,
      right: true,
    });

    // Audio icon and label
    drawAudioIcon();

    // Question panel
    ctx.font = `${IMPORTANT_FONT + 2}px sans-serif`;
    const qText = state.question ? state.question.text : '';
    drawTextPanel(qText, WIDTH / 2, 90, {
      fontSize: IMPORTANT_FONT + 2,
      padding: 12,
      bg: COLORS.panel,
      color: COLORS.text,
      center: true,
    });

    // Instructions bottom
    const instrLines = [
      'Select the correct answer pad.',
      'Keys: 1–4 to pick, ← → to move, Enter to confirm, M to mute, Space to restart after end.',
    ];
    drawTextPanel(instrLines, WIDTH / 2, HEIGHT - PADDING, {
      fontSize: MIN_BODY_FONT,
      padding: 10,
      bg: COLORS.panel,
      color: COLORS.text,
      center: true,
      bottom: true,
    });

    // feedback message
    if (state.message) {
      ctx.font = `${IMPORTANT_FONT}px sans-serif`;
      drawTextPanel(state.message, WIDTH / 2, padsY - 60, {
        fontSize: IMPORTANT_FONT,
        padding: 10,
        bg: COLORS.panel,
        color: COLORS.accent,
        center: true,
      });
    }

    // win/lose overlay (preserve logic)
    if (state.phase === 'win' || state.phase === 'lose') {
      drawEndScreen();
    }
  }

  function drawSunAndHills() {
    // sun
    ctx.save();
    ctx.beginPath();
    ctx.arc(620, 60, 36, 0, Math.PI * 2);
    const sg = ctx.createRadialGradient(620, 60, 4, 620, 60, 60);
    sg.addColorStop(0, COLORS.sun);
    sg.addColorStop(1, 'rgba(255,213,123,0.1)');
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.closePath();
    ctx.restore();

    // rolling hills
    ctx.save();
    ctx.fillStyle = COLORS.hill;
    ctx.beginPath();
    ctx.moveTo(0, 320);
    ctx.quadraticCurveTo(120, 260, 240, 320);
    ctx.quadraticCurveTo(360, 380, 480, 320);
    ctx.quadraticCurveTo(600, 260, 720, 320);
    ctx.lineTo(720, 480);
    ctx.lineTo(0, 480);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCloud(c) {
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = COLORS.cloud;
    // three overlapping ellipses
    ctx.beginPath();
    ctx.ellipse(c.x - c.w * 0.2, c.y, c.w * 0.28, c.h * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.w * 0.05, c.y - 4, c.w * 0.35, c.h * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + c.w * 0.45, c.y + 2, c.w * 0.22, c.h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // draw a pad with nicer lighting and subtle pulse when selected
  function drawPad(x, y, label, selected) {
    // shadow
    ctx.save();
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 6, y + 18, padRadius + 10, padRadius / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // pulse factor for selected
    const pulse = 1 + (selected ? Math.sin(state.time * 0.12) * 0.045 : 0);
    const radius = padRadius * pulse;

    // radial gradient for depth
    const grad = ctx.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.4,
      radius * 0.2,
      x,
      y,
      radius
    );
    grad.addColorStop(0, '#ffffffcc');
    grad.addColorStop(0.3, COLORS.pad);
    grad.addColorStop(1, '#86bfa9');
    ctx.fillStyle = grad;
    ctx.strokeStyle = COLORS.padOutline;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // soft aura when selected
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      const aura = ctx.createRadialGradient(x, y, radius, x, y, radius * 2.4);
      aura.addColorStop(0, COLORS.accent);
      aura.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // label
    const fontSize = 18;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = COLORS.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(String(label), x, y);

    // small index indicator
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#2b6f6f';
    ctx.fillText(
      String(padPositions.indexOf(padPositions.find((p) => p.x === x && p.y === y)) + 1),
      x - 28,
      y - 32
    );
  }

  function drawDrone(cx, cy, wobble = 0, rotor = 0) {
    ctx.save();
    // subtle bobbing motion
    const bob = Math.sin(state.time * 0.06) * 3;
    ctx.translate(cx, cy + bob);
    ctx.rotate(Math.sin(wobble) * 0.03);

    // soft shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(0 + 8, 28 + bob, 52, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body with gradient
    const bodyGrad = ctx.createLinearGradient(-48, -18, 48, 18);
    bodyGrad.addColorStop(0, '#7c6be9');
    bodyGrad.addColorStop(1, '#5a46d9');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#2b1a6f';
    ctx.lineWidth = 3;
    drawRoundedRect(-48, -18, 96, 36, 18, true, true);

    // rotor arms
    const arms = [-40, 40];
    arms.forEach((ax) => {
      ctx.beginPath();
      ctx.moveTo(ax, -12);
      ctx.lineTo(ax * 1.5, -44);
      ctx.strokeStyle = '#2b1a6f';
      ctx.lineWidth = 4;
      ctx.stroke();

      // rotor pivot
      ctx.beginPath();
      ctx.arc(ax * 1.5, -44, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();

      // blades rotation based on state.time and rotor
      ctx.save();
      ctx.translate(ax * 1.5, -44);
      ctx.rotate(state.time * 0.25 + (ax > 0 ? 0.4 : 0));
      ctx.fillStyle = 'rgba(30,30,30,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 4 + Math.abs(Math.sin(wobble) * 2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // cockpit window
    ctx.beginPath();
    ctx.fillStyle = '#bfe9ff';
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // small star representing collected star on the drone
    if (state.correctCount > 0) {
      ctx.save();
      ctx.fillStyle = COLORS.accent;
      drawStar(-36, 0, 5, 6, 3);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += Math.PI / spikes;
      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += Math.PI / spikes;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }

  // -------------------------
  // Particles for feedback
  // -------------------------
  function spawnParticles(x, y, color, amount = 18) {
    for (let i = 0; i < amount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.6;
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - Math.random() * 1.4,
        life: 0.6 + Math.random() * 0.6,
        age: 0,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function drawParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.age += 1 / 60;
      if (p.age >= p.life) {
        state.particles.splice(i, 1);
        continue;
      }
      // simple physics
      p.vy += 0.06; // gravity
      p.x += p.vx;
      p.y += p.vy;
      const alpha = Math.max(0, 1 - p.age / p.life);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.8 + alpha * 0.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // -------------------------
  // Movement & effects (do not alter game mechanics)
  // -------------------------
  function newQuestion() {
    state.question = generateQuestion();
    state.options = state.question.options;
    state.selectedIndex = 0;
    state.message = '';
    state.anim.targetX = WIDTH / 2;
    state.anim.targetY = 120;
    updateLiveRegion(`New question: ${state.question.text}`);
  }

  function selectIndex(index) {
    if (state.phase !== 'playing') return;
    state.selectedIndex = Math.max(0, Math.min(padSlots - 1, index));
    updateLiveRegion(
      `Selected option ${index + 1}: ${state.options[state.selectedIndex]}`
    );
    // audio cue + subtle visual nudge
    playTone('select');
    // small nudge of drone towards pad for responsiveness
    const target = padPositions[state.selectedIndex];
    state.anim.targetX = WIDTH / 2 * 0.9 + target.x * 0.1;
    state.anim.targetY = 120 - 6;
  }

  function confirmSelection() {
    if (state.phase !== 'playing') return;
    const chosen = state.options[state.selectedIndex];
    const correct = state.question.answer;
    state.lastInteractionTime = Date.now();
    if (chosen === correct) {
      state.correctCount++;
      state.message = 'Nice! Correct!';
      playTone('correct');
      const p = padPositions[state.selectedIndex];
      spawnParticles(p.x, p.y - padRadius - 6, COLORS.accent, 20);
      moveDroneToPad(state.selectedIndex, true);
      updateLiveRegion('Correct! Good job.');
    } else {
      state.wrongCount++;
      state.message = 'Oops! Try again!';
      playTone('wrong');
      wobbleDrone();
      spawnParticles(state.anim.x, state.anim.y, COLORS.bad, 10);
      updateLiveRegion('Incorrect answer.');
    }
    if (state.correctCount >= TARGET_CORRECT) {
      state.phase = 'win';
      state.message = '';
      updateLiveRegion('You win! Mission complete!');
      playTone('correct');
    } else if (state.wrongCount >= MAX_WRONG) {
      state.phase = 'lose';
      state.message = '';
      updateLiveRegion('Game over. Drone grounded.');
      playTone('wrong');
    } else {
      setTimeout(() => {
        if (state.phase === 'playing') newQuestion();
      }, 800);
    }
  }

  function moveDroneToPad(index, collect = false) {
    const target = padPositions[index];
    state.anim.targetX = target.x;
    state.anim.targetY = target.y - padRadius - 20;
    if (collect) {
      // small visual bounce after collection
      const endX = WIDTH / 2;
      const endY = 120;
      // schedule a smooth return
      setTimeout(() => {
        state.anim.targetX = endX;
        state.anim.targetY = endY;
      }, 420);
    }
  }

  function wobbleDrone() {
    state.anim.wobble = 8;
  }

  // -------------------------
  // Animation Loop
  // -------------------------
  let lastTime = performance.now();
  function update(deltaUnits) {
    // smoothing towards target
    const dtScale = deltaUnits;
    const ax = state.anim.targetX - state.anim.x;
    const ay = state.anim.targetY - state.anim.y;
    state.anim.vx = state.anim.vx * 0.82 + ax * 0.09;
    state.anim.vy = state.anim.vy * 0.82 + ay * 0.07;
    state.anim.x += state.anim.vx * dtScale * 0.06;
    state.anim.y += state.anim.vy * dtScale * 0.06;

    state.anim.wobble *= 0.9;
    if (Math.abs(state.anim.wobble) < 0.01) state.anim.wobble = 0;

    state.anim.rotor += 0.12 + Math.abs(state.anim.vx) * 0.02;

    // particles are updated in drawParticles (position updated there), but can also apply limits
    if (state.particles.length > 800) state.particles.splice(0, state.particles.length - 800);
  }

  function loop(now) {
    const dt = (now - lastTime) / 16.67 || 1;
    lastTime = now;
    update(dt);
    drawScene();
    requestAnimationFrame(loop);
  }

  // -------------------------
  // Input handling (keyboard & mouse)
  // -------------------------
  function onKeyDown(e) {
    if (!audioContext && audioEnabled) {
      try {
        initAudioContext();
        safeResumeAudio();
      } catch (err) {
        console.warn('Audio init on interaction failed', err);
      }
    }
    if (state.phase === 'playing') {
      if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key, 10) - 1;
        selectIndex(idx);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        selectIndex(state.selectedIndex - 1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        selectIndex(state.selectedIndex + 1);
        e.preventDefault();
      } else if (e.key === 'Enter' || e.key === ' ') {
        confirmSelection();
        e.preventDefault();
      }
    } else {
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        restartGame();
        e.preventDefault();
      }
    }
    if (e.key.toLowerCase() === 'm') {
      toggleAudio();
      e.preventDefault();
    }
  }

  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (state.phase !== 'playing') {
      restartGame();
      return;
    }

    for (let i = 0; i < padSlots; i++) {
      const p = padPositions[i];
      const dx = x - p.x;
      const dy = y - p.y;
      if (dx * dx + dy * dy <= (padRadius + 8) * (padRadius + 8)) {
        selectIndex(i);
        confirmSelection();
        return;
      }
    }

    if (x > WIDTH - 160 && x < WIDTH - 40 && y < 80) {
      toggleAudio();
      return;
    }
  }

  // -------------------------
  // Restart & Helpers
  // -------------------------
  function restartGame() {
    state.phase = 'playing';
    state.correctCount = 0;
    state.wrongCount = 0;
    state.message = '';
    state.selectedIndex = 0;
    state.anim.x = WIDTH / 2;
    state.anim.y = 120;
    state.anim.targetX = WIDTH / 2;
    state.anim.targetY = 120;
    state.particles = [];
    newQuestion();
    updateLiveRegion('Game restarted. Good luck!');
    if (audioEnabled) {
      try {
        initAudioContext();
        safeResumeAudio();
      } catch (err) {}
    }
  }

  function updateLiveRegion(text) {
    liveRegion.textContent = text;
    state.announced = text;
  }

  // -------------------------
  // UI: audio icon
  // -------------------------
  function drawAudioIcon() {
    const x = WIDTH - 120;
    const y = PADDING + 6;
    // icon box
    const tx = 'Sound';
    drawTextPanel(tx, x + 10, y, {
      fontSize: 14,
      padding: 8,
      bg: COLORS.panel,
      color: COLORS.audioIcon,
    });
    ctx.font = '12px sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(audioEnabled ? 'On (M)' : 'Muted (M)', x - 30, y + 34);
  }

  function drawEndScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(10,10,10,0.55)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();

    const title = state.phase === 'win' ? 'Mission Complete!' : 'Drone Grounded';
    const message =
      state.phase === 'win'
        ? `You delivered ${state.correctCount} stars! Great piloting!`
        : `Too many oops. You got ${state.correctCount} correct. Try again!`;

    ctx.font = `${28}px sans-serif`;
    drawTextPanel(title, WIDTH / 2, HEIGHT / 2 - 60, {
      fontSize: 28,
      padding: 14,
      bg: COLORS.panel,
      color: state.phase === 'win' ? COLORS.good : COLORS.bad,
      center: true,
    });

    ctx.font = `${16}px sans-serif`;
    drawTextPanel(message, WIDTH / 2, HEIGHT / 2 - 10, {
      fontSize: 16,
      padding: 12,
      bg: COLORS.panel,
      color: COLORS.text,
      center: true,
    });

    const restartMsg = ['Press Space or click to restart'];
    drawTextPanel(restartMsg, WIDTH / 2, HEIGHT / 2 + 50, {
      fontSize: 16,
      padding: 10,
      bg: COLORS.panel,
      color: COLORS.text,
      center: true,
    });
  }

  // -------------------------
  // Initialization
  // -------------------------
  function start() {
    ctx.textBaseline = 'top';
    ctx.font = `${MIN_BODY_FONT}px sans-serif`;
    newQuestion();

    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('click', onClick);
    container.addEventListener('click', () => {
      canvas.focus();
    });

    try {
      initAudioContext();
    } catch (err) {
      console.warn('Audio init error on start', err);
    }

    lastTime = performance.now();
    requestAnimationFrame(loop);

    setTimeout(() => {
      try {
        canvas.focus();
      } catch (e) {}
    }, 50);

    updateLiveRegion('Welcome to Drone Math Adventure! Use keys 1 to 4 to answer.');
  }

  function resumeAudioOnFirstGesture() {
    function resume() {
      if (audioEnabled && audioContext) {
        audioContext.resume().catch(() => {});
      }
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    }
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  // Start the game with error handling
  try {
    start();
    resumeAudioOnFirstGesture();
  } catch (err) {
    console.error('Game initialization error', err);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawTextPanel('An error occurred initializing the game.', WIDTH / 2, HEIGHT / 2, {
      fontSize: 18,
      padding: 12,
      bg: '#fff4f4',
      color: COLORS.bad,
      center: true,
    });
    updateLiveRegion('An error occurred initializing the game. Please try reloading the page.');
  }
})();