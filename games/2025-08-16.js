(() => {
  // Ensure container exists
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Prepare container
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = '720px';
  container.style.height = '480px';
  container.style.outline = 'none';
  container.style.userSelect = 'none';

  // Screen-reader live region
  const sr = document.createElement('div');
  sr.setAttribute('aria-live', 'polite');
  sr.setAttribute('role', 'status');
  sr.style.position = 'absolute';
  sr.style.left = '-10000px';
  sr.style.top = 'auto';
  sr.style.width = '1px';
  sr.style.height = '1px';
  sr.style.overflow = 'hidden';
  container.appendChild(sr);

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.setAttribute('tabindex', '0');
  canvas.style.display = 'block';
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.style.cursor = 'crosshair';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Constants
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const GRID_COLS = 5;
  const GRID_ROWS = 3;
  const NODE_RADIUS = 28;
  const MARGIN_X = 80;
  const MARGIN_Y = 140;
  const SPACING_X = (WIDTH - 2 * MARGIN_X) / (GRID_COLS - 1);
  const SPACING_Y = 90;
  const MAX_ROUNDS = 8;

  // Game state
  let nodes = [];
  let spark = { col: 2, row: 1, x: 0, y: 0 };
  let selected = [];
  let targetSum = 10;
  let score = 0;
  let round = 1;
  let message = 'Welcome to Spark Circuit! Use arrows to move. Press Space to pick.';
  let showHelp = true;
  let audioEnabled = true;
  let audioCtx = null;
  let audioAllowed = true;
  let bgOsc = null;
  let bgGain = null;
  let lastMoveSoundTime = 0;
  let animTick = 0;
  let locked = false;

  // decorative particle sparks for celebration
  const particles = [];

  // Accessibility announce
  function announce(text) {
    try {
      sr.textContent = text;
    } catch (e) {
      console.warn('Announce failed', e);
    }
  }

  // Audio initialization with robust error handling
  function initAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        audioAllowed = false;
        console.warn('Web Audio API not available.');
        return;
      }
      audioCtx = new AudioContext();

      // ambient pad with gentle LFO
      const gain = audioCtx.createGain();
      gain.gain.value = 0.005; // very gentle
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 110; // base pad tone

      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15; // slow wobble
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 12; // modulate frequency range

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      try {
        osc.start();
        lfo.start();
      } catch (e) {
        // Some browsers require user gesture; handle later
      }

      bgOsc = osc;
      bgGain = gain;
    } catch (e) {
      audioAllowed = false;
      console.warn('Audio initialization failed:', e);
    }
  }

  // Ensure audio is resumed on first user gesture
  function tryUnlockAudio() {
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => console.warn('Audio resume failed:', e));
    }
  }

  // Sound utilities: simple wrappers using oscillators, with error handling
  function safeCreateOsc(opts = {}) {
    if (!audioAllowed || !audioEnabled || !audioCtx) return null;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.value = opts.freq || 440;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      if (opts.filter) {
        const filter = audioCtx.createBiquadFilter();
        filter.type = opts.filter.type || 'lowpass';
        filter.frequency.value = opts.filter.frequency || 1200;
        gain.connect(filter);
        filter.connect(audioCtx.destination);
      } else {
        gain.connect(audioCtx.destination);
      }
      return { osc, gain };
    } catch (e) {
      console.warn('Oscillator creation failed:', e);
      return null;
    }
  }

  function playMoveSound() {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    if (performance.now() - lastMoveSoundTime < 70) return;
    lastMoveSoundTime = performance.now();
    try {
      const o = safeCreateOsc({ type: 'square', freq: 900 });
      if (!o) return;
      const { osc, gain } = o;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {
      console.warn('playMoveSound error', e);
    }
  }

  function playSelectSound() {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o1 = safeCreateOsc({ type: 'sine', freq: 1100 });
      const o2 = safeCreateOsc({ type: 'sine', freq: 700 });
      if (!o1 || !o2) return;
      o1.gain.gain.setValueAtTime(0.0001, now);
      o2.gain.gain.setValueAtTime(0.0001, now);
      o1.gain.gain.exponentialRampToValueAtTime(0.02, now + 0.01);
      o2.gain.gain.exponentialRampToValueAtTime(0.016, now + 0.01);
      o1.osc.start(now);
      o2.osc.start(now + 0.02);
      o1.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o2.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o1.osc.stop(now + 0.14);
      o2.osc.stop(now + 0.14);
    } catch (e) {
      console.warn('playSelectSound error', e);
    }
  }

  function playErrorSound() {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = safeCreateOsc({ type: 'sawtooth', freq: 150 });
      if (!o) return;
      const { osc, gain } = o;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      gain.connect(filter);
      filter.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {
      console.warn('playErrorSound error', e);
    }
  }

  function playWinChord() {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [440, 550, 660];
      freqs.forEach((f, i) => {
        const o = safeCreateOsc({ type: 'triangle', freq: f });
        if (!o) return;
        const t0 = now + i * 0.06;
        o.gain.gain.setValueAtTime(0.0001, t0);
        o.gain.gain.exponentialRampToValueAtTime(0.05, t0 + 0.02);
        o.gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
        o.osc.start(t0);
        o.osc.stop(t0 + 0.46);
      });
    } catch (e) {
      console.warn('playWinChord error', e);
    }
  }

  // Simple spark particle for visual celebration
  function spawnParticles(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        life: 60 + Math.floor(Math.random() * 60),
        size: 3 + Math.random() * 3,
        hue: 45 + Math.random() * 45
      });
    }
  }

  // Utility helpers
  function nodeIndex(col, row) {
    return row * GRID_COLS + col;
  }

  function createNodes() {
    nodes = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const x = MARGIN_X + c * SPACING_X;
        const y = MARGIN_Y + r * SPACING_Y + Math.sin((c + r) * 0.8) * 6;
        nodes.push({
          col: c,
          row: r,
          x,
          y,
          value: 0,
          lit: false,
          used: false,
          pulse: Math.random() * Math.PI * 2
        });
      }
    }
  }

  // Keep existing game math/logic unchanged
  function generateRound() {
    locked = false;
    targetSum = Math.floor(Math.random() * 14) + 5;
    createNodes();

    const idxA = Math.floor(Math.random() * nodes.length);
    let idxB = idxA;
    while (idxB === idxA) idxB = Math.floor(Math.random() * nodes.length);
    const valA = Math.floor(Math.random() * Math.min(9, targetSum - 1)) + 1;
    const valB = targetSum - valA;
    nodes[idxA].value = valA;
    nodes[idxB].value = valB;

    for (let i = 0; i < nodes.length; i++) {
      if (i === idxA || i === idxB) continue;
      let v = Math.floor(Math.random() * 12) + 1;
      v = Math.max(1, Math.min(12, v));
      nodes[i].value = v;
      nodes[i].lit = false;
      nodes[i].used = false;
    }

    spark.col = 2;
    spark.row = 1;
    const idx = nodeIndex(spark.col, spark.row);
    spark.x = nodes[idx].x;
    spark.y = nodes[idx].y;
    selected = [];
    message = `Round ${round}: Help Spark find two numbers that add to ${targetSum}.`;
    announce(message);
  }

  function moveSpark(dx, dy) {
    if (locked) return;
    const newCol = Math.max(0, Math.min(GRID_COLS - 1, spark.col + dx));
    const newRow = Math.max(0, Math.min(GRID_ROWS - 1, spark.row + dy));
    if (newCol === spark.col && newRow === spark.row) return;
    spark.col = newCol;
    spark.row = newRow;
    playMoveSound();
  }

  function selectCurrentNode() {
    if (locked) return;
    const idx = nodeIndex(spark.col, spark.row);
    if (selected.length === 1 && selected[0] === idx) {
      selected = [];
      message = 'Selection cleared.';
      announce(message);
      return;
    }
    if (selected.length === 2) return;
    if (nodes[idx].used) {
      message = 'This node already used. Try another.';
      announce(message);
      playErrorSound();
      return;
    }
    selected.push(idx);
    playSelectSound();
    message = `Picked ${nodes[idx].value}.`;
    announce(message);
    if (selected.length === 2) {
      evaluateSelection();
    }
  }

  function evaluateSelection() {
    locked = true;
    const a = nodes[selected[0]].value;
    const b = nodes[selected[1]].value;
    if (a + b === targetSum) {
      nodes[selected[0]].lit = true;
      nodes[selected[1]].lit = true;
      nodes[selected[0]].used = true;
      nodes[selected[1]].used = true;
      score += 10;
      playWinChord();
      message = `Great! ${a} + ${b} = ${targetSum}. Bulb lit! Score: ${score}`;
      announce(message);
      // visual celebration centered between the two nodes
      const nA = nodes[selected[0]];
      const nB = nodes[selected[1]];
      const cx = (nA.x + nB.x) / 2;
      const cy = (nA.y + nB.y) / 2;
      spawnParticles(cx, cy, 26);
      setTimeout(() => {
        round++;
        if (round > MAX_ROUNDS) {
          message = `Amazing! You finished with ${score} points. Play again? Press R.`;
          announce(message);
          locked = false;
        } else {
          generateRound();
        }
      }, 900);
    } else {
      playErrorSound();
      message = `Oops! ${a} + ${b} = ${a + b} not ${targetSum}. Try again.`;
      announce(message);
      const bad = [...selected];
      bad.forEach(i => (nodes[i].lit = true));
      setTimeout(() => {
        bad.forEach(i => (nodes[i].lit = false));
        selected = [];
        locked = false;
      }, 700);
    }
  }

  // Pointer interactions
  canvas.addEventListener('pointerdown', (ev) => {
    tryUnlockAudio();
    const rect = canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * (canvas.width / rect.width);
    const py = (ev.clientY - rect.top) * (canvas.height / rect.height);

    // speaker area
    if (px > WIDTH - 64 && px < WIDTH - 12 && py > 12 && py < 48) {
      audioEnabled = !audioEnabled;
      message = audioEnabled ? 'Audio on.' : 'Audio off.';
      announce(message);
      if (audioEnabled && audioAllowed) tryUnlockAudio();
      return;
    }

    // help toggle bottom-left
    if (px < 160 && py > HEIGHT - 64) {
      showHelp = !showHelp;
      message = showHelp ? 'Help shown.' : 'Help hidden.';
      announce(message);
      return;
    }

    // node click detection
    let clickedIndex = -1;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dx = px - n.x;
      const dy = py - n.y;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS * 1.4) {
        clickedIndex = i;
        break;
      }
    }

    if (clickedIndex >= 0) {
      spark.col = nodes[clickedIndex].col;
      spark.row = nodes[clickedIndex].row;
      selectCurrentNode();
    } else {
      // move to nearest grid pos
      let nearestCol = 0;
      let nearestRow = 0;
      let minDist = Infinity;
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const n = nodes[nodeIndex(c, r)];
          const d = (px - n.x) ** 2 + (py - n.y) ** 2;
          if (d < minDist) {
            minDist = d;
            nearestCol = c;
            nearestRow = r;
          }
        }
      }
      spark.col = nearestCol;
      spark.row = nearestRow;
      playMoveSound();
    }
  });

  // Keyboard controls (only when canvas focused)
  window.addEventListener('keydown', (e) => {
    if (!document.activeElement || document.activeElement !== canvas) {
      return;
    }
    tryUnlockAudio();
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveSpark(-1, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveSpark(1, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSpark(0, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSpark(0, 1);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      selectCurrentNode();
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      round = 1;
      score = 0;
      generateRound();
    } else if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      audioEnabled = !audioEnabled;
      message = audioEnabled ? 'Audio on.' : 'Audio off.';
      announce(message);
      if (audioEnabled && audioAllowed) tryUnlockAudio();
    } else if (e.key.toLowerCase() === 'h') {
      e.preventDefault();
      showHelp = !showHelp;
      message = showHelp ? 'Help shown.' : 'Help hidden.';
      announce(message);
    }
  });

  // Drawing helpers - all graphics use canvas primitives
  function drawBackground() {
    // multi-layer gradient for depth
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#071622');
    g.addColorStop(0.5, '#082f2b');
    g.addColorStop(1, '#062a1e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // faint grid of circuit lines for subtle texture
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#9fe7ff';
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin((animTick + x) * 0.004) * 2, 0);
      ctx.lineTo(x + Math.sin((animTick + x) * 0.004) * 2, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.cos((animTick + y) * 0.004) * 2);
      ctx.lineTo(WIDTH, y + Math.cos((animTick + y) * 0.004) * 2);
      ctx.stroke();
    }
    ctx.restore();

    // soft vignette
    const vg = ctx.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      100,
      WIDTH / 2,
      HEIGHT / 2,
      450
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawBulb() {
    const bulbX = WIDTH / 2;
    const bulbY = 64;

    // outer glow
    const glowIntensity =
      (nodes.some(n => n.lit) ? 0.85 : 0.15) + Math.sin(animTick * 0.12) * 0.05;
    const outer = ctx.createRadialGradient(bulbX, bulbY, 10, bulbX, bulbY, 120);
    outer.addColorStop(0, `rgba(255,235,170,${0.55 * glowIntensity})`);
    outer.addColorStop(1, `rgba(255,210,120,${0.02 * glowIntensity})`);
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.ellipse(bulbX, bulbY, 78, 56, 0, 0, Math.PI * 2);
    ctx.fill();

    // glass
    ctx.beginPath();
    const glass = ctx.createRadialGradient(bulbX - 10, bulbY - 14, 10, bulbX, bulbY, 80);
    glass.addColorStop(0, 'rgba(255,255,255,0.9)');
    glass.addColorStop(0.2, 'rgba(255,255,230,0.65)');
    glass.addColorStop(1, 'rgba(255,240,200,0.08)');
    ctx.fillStyle = glass;
    ctx.ellipse(bulbX, bulbY, 64, 46, 0, 0, Math.PI * 2);
    ctx.fill();

    // filament animated waves
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(80,40,0,0.9)';
    ctx.lineWidth = 3;
    const p1 = { x: bulbX - 20, y: bulbY + 2 };
    const p2 = { x: bulbX - 6, y: bulbY - 6 + Math.sin(animTick * 0.22) * 4 };
    const p3 = { x: bulbX + 8, y: bulbY + 4 };
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(p2.x, p2.y, p3.x, p3.y);
    ctx.stroke();

    // metal base
    const baseY = bulbY + 36;
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(bulbX - 30, baseY, 60, 18);
    ctx.fillStyle = '#4b4b4b';
    ctx.fillRect(bulbX - 18, baseY + 18, 36, 6);

    // headline
    ctx.fillStyle = '#fff';
    ctx.font = '600 20px Inter, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Target: ${targetSum}`, bulbX, bulbY - 64);

    // bulb rays when lit
    if (nodes.some(n => n.lit)) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,230,140,${0.06 + 0.04 * Math.random()})`;
        ctx.lineWidth = 2 + Math.random() * 2;
        const angle = (i / 10) * Math.PI * 2 + animTick * 0.01;
        const sx = bulbX + Math.cos(angle) * 34;
        const sy = bulbY + Math.sin(angle) * 22;
        const ex = bulbX + Math.cos(angle) * (80 + Math.random() * 30);
        const ey = bulbY + Math.sin(angle) * (50 + Math.random() * 20);
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.restore();
    }

    // friendly helper character drawn with primitives
    drawHelper(bulbX + 122, bulbY - 8, nodes.some(n => n.lit));
  }

  function drawHelper(x, y, excited) {
    // little helper character: soft shape, simple face
    const scale = excited ? 1.06 + Math.sin(animTick * 0.08) * 0.02 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // body
    ctx.beginPath();
    ctx.fillStyle = '#fff4b8';
    ctx.ellipse(0, 0, 18, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // eye left
    ctx.beginPath();
    ctx.fillStyle = '#2b2b2b';
    ctx.arc(-4, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // eye right
    ctx.beginPath();
    ctx.arc(4, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.beginPath();
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 1.4;
    ctx.arc(0, 1, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // wing
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,200,120,0.85)';
    ctx.moveTo(-10, 2);
    ctx.quadraticCurveTo(-18, 0, -10, -6);
    ctx.fill();
    ctx.restore();
  }

  function drawWires() {
    ctx.lineCap = 'round';
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      // right neighbor
      if (n.col < GRID_COLS - 1) {
        const n2 = nodes[nodeIndex(n.col + 1, n.row)];
        drawWireSegment(n, n2);
      }
      // bottom neighbor
      if (n.row < GRID_ROWS - 1) {
        const n2 = nodes[nodeIndex(n.col, n.row + 1)];
        drawWireSegment(n, n2);
      }
      // diagonal
      if (n.col < GRID_COLS - 1 && n.row < GRID_ROWS - 1) {
        const n2 = nodes[nodeIndex(n.col + 1, n.row + 1)];
        drawWireSegment(n, n2, true);
      }
    }
  }

  function drawWireSegment(a, b, diagonal = false) {
    const lit = a.lit || b.lit;
    const baseColor = lit ? 'rgba(255,220,130,0.94)' : 'rgba(160,210,230,0.15)';
    const midX = (a.x + b.x) / 2 + Math.sin((a.x + b.x + animTick) * 0.009) * 6;
    const midY = (a.y + b.y) / 2 + Math.cos((a.y + b.y + animTick) * 0.01) * 6;
    ctx.beginPath();
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 4;
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(midX, midY, b.x, b.y);
    ctx.stroke();

    // highlight
    ctx.beginPath();
    ctx.strokeStyle = lit ? 'rgba(255,255,208,0.6)' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1.2;
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(midX, midY, b.x, b.y);
    ctx.stroke();
  }

  function drawNodes() {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];

      // drop shadow
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.arc(n.x + 5, n.y + 8, NODE_RADIUS + 8, 0, Math.PI * 2);
      ctx.fill();

      // base ring
      ctx.beginPath();
      const isUsed = n.used;
      const baseHue = isUsed ? '#5e5e5e' : '#0d5a6a';
      ctx.fillStyle = baseHue;
      ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // pulsing inner sheen when available
      if (!isUsed) {
        const pulse = 0.08 + 0.06 * Math.sin(animTick * 0.08 + n.pulse);
        const grad = ctx.createRadialGradient(
          n.x - 8,
          n.y - 8,
          6,
          n.x,
          n.y,
          NODE_RADIUS + 20
        );
        grad.addColorStop(0, `rgba(255,255,220,${0.55 + pulse})`);
        grad.addColorStop(1, `rgba(255,180,80,0.02)`);
        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(n.x, n.y, NODE_RADIUS - 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // rim
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      // number
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 20px Inter, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n.value), n.x, n.y - (n.used ? 1 : 0));

      // selected outline
      const idx = i;
      if (selected.includes(idx)) {
        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255,245,190,0.98)';
        ctx.arc(n.x, n.y, NODE_RADIUS + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // tiny node spark indicator (subtle)
      if (!n.used) {
        ctx.beginPath();
        const littleX = n.x + Math.cos((i + animTick) * 0.12) * 5;
        const littleY = n.y + Math.sin((i + animTick) * 0.11) * 3;
        ctx.fillStyle = 'rgba(255,240,200,0.9)';
        ctx.arc(littleX, littleY, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // if lit show extra glow
      if (n.lit) {
        ctx.beginPath();
        const g = ctx.createRadialGradient(n.x, n.y, NODE_RADIUS * 0.2, n.x, n.y, NODE_RADIUS + 40);
        g.addColorStop(0, 'rgba(255,250,200,0.95)');
        g.addColorStop(1, 'rgba(255,200,80,0.06)');
        ctx.fillStyle = g;
        ctx.arc(n.x, n.y, NODE_RADIUS + 20, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawSpark() {
    const target = nodes[nodeIndex(spark.col, spark.row)];
    if (!target) return;
    // easing for smooth motion
    spark.x += (target.x - spark.x) * 0.36;
    spark.y += (target.y - spark.y) * 0.36;

    // trail
    for (let t = 0; t < 3; t++) {
      ctx.beginPath();
      const r = 16 - t * 4;
      const a = 0.12 - t * 0.03;
      ctx.fillStyle = `rgba(255,245,180,${a})`;
      ctx.arc(spark.x - t * 2, spark.y - t * 1, r + Math.sin(animTick * 0.08) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // main spark
    ctx.beginPath();
    ctx.fillStyle = '#fff8c8';
    ctx.arc(spark.x, spark.y, 10, 0, Math.PI * 2);
    ctx.fill();

    // face
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(spark.x - 3, spark.y - 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(spark.x + 4, spark.y - 2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1.6;
    ctx.arc(spark.x + 0, spark.y + 2, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // tiny flicker on top
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.arc(spark.x - 5, spark.y - 6, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // gravity
      p.life--;
      const alpha = Math.max(0, p.life / 120);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,${200 + Math.floor(p.hue)},${80},${alpha})`;
      ctx.arc(p.x, p.y, p.size * Math.max(0.2, alpha), 0, Math.PI * 2);
      ctx.fill();
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawUI() {
    // score card top-left
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(12, 12, 200, 54);
    ctx.fillStyle = '#fff';
    ctx.font = '600 16px Inter, Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 22, 36);
    ctx.font = '13px Inter, Arial';
    ctx.fillText(`Round: ${round}/${MAX_ROUNDS}`, 22, 52);

    // speaker icon top-right
    const spX = WIDTH - 48;
    const spY = 28;
    ctx.beginPath();
    ctx.fillStyle = audioEnabled ? '#ffd56b' : '#606060';
    ctx.fillRect(spX - 18, spY - 12, 14, 24);
    ctx.beginPath();
    ctx.moveTo(spX - 4, spY - 14);
    ctx.lineTo(spX + 10, spY - 6);
    ctx.lineTo(spX + 10, spY + 6);
    ctx.lineTo(spX - 4, spY + 14);
    ctx.closePath();
    ctx.fill();

    if (audioEnabled) {
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.8;
      ctx.arc(spX + 10, spY, 10, -0.5, 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(spX + 10, spY, 6, -0.5, 0.5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.moveTo(spX + 6, spY - 9);
      ctx.lineTo(spX + 14, spY + 9);
      ctx.stroke();
    }

    ctx.fillStyle = '#fff';
    ctx.font = '12px Inter, Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Press M to mute', WIDTH - 22, 50);

    // bottom-left help box
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(12, HEIGHT - 72, 260, 60);
    ctx.fillStyle = '#fff';
    ctx.font = '12px Inter, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('H: Help  |  R: Restart', 22, HEIGHT - 48);
    ctx.fillText('Arrows: Move  Space/Enter: Pick', 22, HEIGHT - 30);

    // message banner
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(WIDTH / 2 - 310, HEIGHT - 80, 620, 60);
    ctx.fillStyle = '#fff';
    ctx.font = '600 15px Inter, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(message, WIDTH / 2, HEIGHT - 48);

    // selection hint
    ctx.fillStyle = '#fff';
    ctx.font = '14px Inter, Arial';
    ctx.textAlign = 'center';
    if (selected.length > 0) {
      const a = nodes[selected[0]].value;
      ctx.fillText(
        `Picked: ${a}${selected.length === 2 ? '' : '  (pick another)'}`,
        WIDTH / 2,
        HEIGHT - 26
      );
    } else {
      ctx.fillText('No selection yet', WIDTH / 2, HEIGHT - 26);
    }

    // subtle title
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.font = '700 36px Inter, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Spark Circuit', 18, 110);

    // help overlay when toggled
    if (showHelp) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = 'rgba(6,10,12,0.82)';
      ctx.fillRect(WIDTH / 2 - 200, HEIGHT / 2 - 100, 400, 200);
      ctx.fillStyle = '#fff';
      ctx.font = '600 18px Inter, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('How to play', WIDTH / 2, HEIGHT / 2 - 58);
      ctx.font = '14px Inter, Arial';
      ctx.fillText(
        'Move Spark to a number and pick two that add to the target.',
        WIDTH / 2,
        HEIGHT / 2 - 28
      );
      ctx.fillText('Press Space or Enter to pick. Click nodes too.', WIDTH / 2, HEIGHT / 2);
      ctx.fillText('Toggle audio: M   Toggle help: H   Restart: R', WIDTH / 2, HEIGHT / 2 + 32);
      ctx.restore();
    }
  }

  // Main render loop
  function render() {
    animTick++;
    drawBackground();
    drawBulb();
    drawWires();
    drawNodes();
    drawSpark();
    drawParticles();
    drawUI();

    requestAnimationFrame(render);
  }

  // Initialization and event hookups
  function startGame() {
    initAudio();
    if (!audioAllowed) {
      audioEnabled = false;
      message = 'Audio not available. Using visual feedback.';
      announce(message);
    }
    createNodes();
    const idx = nodeIndex(spark.col, spark.row);
    spark.x = nodes[idx].x;
    spark.y = nodes[idx].y;
    generateRound();
    render();

    const helpText = `Spark Circuit: Move Spark (arrow keys) to nodes and press Space to pick two numbers that add to the target.
    Click nodes or use keyboard. Toggle audio with M. Toggle help with H. Restart with R.`;
    announce(helpText);
  }

  // focus behavior
  canvas.addEventListener('click', () => {
    canvas.focus();
  });
  canvas.addEventListener('focus', () => {
    canvas.style.outline = '3px solid rgba(255,255,180,0.16)';
  });
  canvas.addEventListener('blur', () => {
    canvas.style.outline = 'none';
  });

  // Ensure audio unlocked on first user gesture
  function userGestureInit() {
    tryUnlockAudio();
    window.removeEventListener('pointerdown', userGestureInit);
    window.removeEventListener('keydown', userGestureInit);
  }
  window.addEventListener('pointerdown', userGestureInit, { passive: true });
  window.addEventListener('keydown', userGestureInit);

  // start
  startGame();

  // small debug accessor (non-essential)
  container.debug = {
    getState: () => ({ score, round, targetSum, nodes, selected })
  };
})();