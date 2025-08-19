(function () {
  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const CANVAS_ID = 'game-of-the-day-canvas';
  const CONTAINER_ID = 'game-of-the-day-stage';
  const TILE_W = 80;
  const TILE_H = 56;
  const TILE_GAP = 14;

  // Game state
  let canvas, ctx, container;
  let audioCtx = null;
  let audioAllowed = true;
  let audioReady = false;
  let backgroundGain = null;
  let ambientNodes = null;
  let audioError = null;

  let tiles = []; // Array of number tiles
  let bulbs = []; // Bulb targets
  let heldTile = null; // tile id being dragged or keyboard-held
  let pointer = { x: 0, y: 0, isDown: false };
  let focus = { type: 'tile', index: 0 }; // keyboard focus: type 'tile' or 'bulb'
  let confettiParticles = [];
  let allLit = false;
  let showCelebration = 0;

  // Visual theme characters
  const characters = [
    { name: 'Sparky', color: '#ffcc33', mouth: 1 },
    { name: 'Glim', color: '#66ccff', mouth: 0 },
    { name: 'Boltina', color: '#ff99cc', mouth: 2 },
  ];

  // Animation time helper
  let lastTime = performance.now();

  // Initialize
  init();

  // -------------------------
  // Initialization functions
  // -------------------------
  function init() {
    try {
      container = document.getElementById(CONTAINER_ID);
    } catch (e) {
      container = null;
    }
    if (!container) {
      console.error(
        `Container element with id "${CONTAINER_ID}" not found. Creating fallback container appended to body.`
      );
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      document.body.appendChild(container);
    }

    // Clear container and create canvas
    container.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute(
      'aria-label',
      'Spark Workshop math game. Use mouse or keyboard to drag number tiles to bulbs to match target energy. Press A to toggle audio. Press R to reset.'
    );
    canvas.style.outline = 'none';
    container.appendChild(canvas);

    ctx = canvas.getContext('2d');

    // Event listeners
    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onTouchDown, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchUp, { passive: false });
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('focus', () => draw());

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (isPointInSpeaker(cx, cy)) {
        toggleAudio();
      }
      // On first user gesture, try to resume audio context if suspended
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch((err) => {
          console.warn('Audio resume failed:', err);
        });
      }
    });

    // Initialize audio context (try, but may be suspended/blocked until user gesture)
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioReady = true;
      setupAmbient(); // create ambient sound nodes gently
    } catch (err) {
      audioError = err;
      audioReady = false;
      audioAllowed = false;
      console.warn('Audio not available:', err);
    }

    // Start new puzzle
    resetGame();

    // Kick off animation loop
    requestAnimationFrame(loop);
  }

  // -------------------------
  // Game setup and reset
  // -------------------------
  function resetGame() {
    // Prepare three bulbs (left to right)
    bulbs = [];
    const bulbXs = [140, 360, 580];
    for (let i = 0; i < 3; i++) {
      bulbs.push({
        id: i,
        x: bulbXs[i],
        y: 130,
        r: 64,
        target: 0,
        sum: 0,
        lit: false,
        glow: 0,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    // Generate targets and tiles in a solvable way
    let requiredTiles = [];
    for (let i = 0; i < 3; i++) {
      const target = randInt(5, 12);
      bulbs[i].target = target;
      bulbs[i].sum = 0;
      bulbs[i].lit = false;

      const parts = randInt(1, 3);
      let partsArr = [];
      let remaining = target;
      for (let p = parts; p > 1; p--) {
        const part = randInt(1, Math.max(1, remaining - (p - 1)));
        partsArr.push(part);
        remaining -= part;
      }
      partsArr.push(remaining);
      shuffleArray(partsArr);
      partsArr.forEach((v) => {
        requiredTiles.push({ value: v, bulbId: i });
      });
    }

    tiles = [];
    const totalNeeded = Math.max(6, requiredTiles.length);
    requiredTiles.forEach((rt, idx) => {
      tiles.push({
        id: idx,
        value: rt.value,
        homeIndex: idx,
        assignedBulb: rt.bulbId,
        x: 120 + (idx % 6) * (TILE_W + TILE_GAP),
        y: 340 + Math.floor(idx / 6) * (TILE_H + 10),
        baseY: 340 + Math.floor(idx / 6) * (TILE_H + 10),
        w: TILE_W,
        h: TILE_H,
        picked: false,
        hover: false,
        floatPhase: Math.random() * Math.PI * 2,
      });
    });

    let idxCounter = requiredTiles.length;
    while (tiles.length < totalNeeded) {
      tiles.push({
        id: idxCounter,
        value: randInt(1, 9),
        homeIndex: idxCounter,
        assignedBulb: null,
        x: 120 + (idxCounter % 6) * (TILE_W + TILE_GAP),
        y: 340 + Math.floor(idxCounter / 6) * (TILE_H + 10),
        baseY: 340 + Math.floor(idxCounter / 6) * (TILE_H + 10),
        w: TILE_W,
        h: TILE_H,
        picked: false,
        hover: false,
        floatPhase: Math.random() * Math.PI * 2,
      });
      idxCounter++;
    }

    shuffleArray(tiles);
    const startX = (WIDTH - (tiles.length * TILE_W + (tiles.length - 1) * TILE_GAP)) / 2;
    tiles.forEach((t, i) => {
      t.x = startX + i * (TILE_W + TILE_GAP);
      t.y = HEIGHT - TILE_H - 30;
      t.baseY = t.y;
    });

    heldTile = null;
    focus = { type: 'tile', index: Math.max(0, Math.min(tiles.length - 1, focus.index || 0)) };
    confettiParticles = [];
    allLit = false;
    showCelebration = 0;
    draw();
  }

  // -------------------------
  // Main loop and drawing
  // -------------------------
  function loop(timestamp) {
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // Update bulb glow animation
    const now = performance.now() / 1000;
    bulbs.forEach((b) => {
      b.pulse += dt * 2.0;
      const pulseMod = 0.6 + 0.4 * Math.sin(b.pulse);
      if (b.lit) {
        b.glow = Math.min(1, b.glow + 0.03 * pulseMod);
      } else {
        b.glow = Math.max(0, b.glow - 0.035);
      }
    });

    // Update tile floating animations and hover detection
    tiles.forEach((t) => {
      t.floatPhase += dt * 2.0;
      const floatY = Math.sin(t.floatPhase) * 4;
      t.y = t.picked ? t.y : t.baseY + floatY;
      // hover if pointer near and not dragging
      if (!pointer.isDown && heldTile === null) {
        const dx = pointer.x - (t.x + t.w / 2);
        const dy = pointer.y - (t.y + t.h / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        t.hover = dist < 60;
      } else {
        t.hover = false;
      }
    });

    // Update confetti
    if (showCelebration > 0) {
      showCelebration -= 1;
    }
    confettiParticles.forEach((p) => {
      p.vy += 0.15;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 1;
    });
    confettiParticles = confettiParticles.filter((p) => p.life > 0);

    // Check if all bulbs lit
    if (!allLit && bulbs.every((b) => b.lit)) {
      allLit = true;
      doCelebration();
    }
  }

  function draw() {
    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Animated background gradient with faint energy beams
    drawBackground();

    // Plant silhouette and subtle particles
    drawPowerPlant();

    // Draw bulbs and characters
    drawBulbs();

    // Draw battery centerpiece with character
    drawBattery();

    // Draw tiles on top
    drawTiles();

    // Draw UI overlays
    drawUI();

    // Draw confetti if any
    drawConfetti();

    // Audio unavailable text
    if (!audioReady) {
      drawAudioUnavailable();
    }
  }

  // -------------------------
  // Drawing subroutines - visuals improved
  // -------------------------
  function drawBackground() {
    // moving radial light
    ctx.save();
    const t = performance.now() / 1000;
    const bgGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    const baseTop = `hsl(${200 + 10 * Math.sin(t / 8)}, 70%, 6%)`;
    const baseMid = `hsl(${200 + 12 * Math.sin(t / 6)}, 55%, 10%)`;
    const baseBottom = `hsl(${195 + 8 * Math.cos(t / 7)}, 60%, 8%)`;
    bgGrad.addColorStop(0, baseTop);
    bgGrad.addColorStop(0.5, baseMid);
    bgGrad.addColorStop(1, baseBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft moving glow behind center
    const radial = ctx.createRadialGradient(
      WIDTH / 2 + Math.sin(t / 3) * 40,
      80 + Math.cos(t / 2) * 10,
      80,
      WIDTH / 2,
      80,
      380
    );
    radial.addColorStop(0, 'rgba(255,220,140,0.04)');
    radial.addColorStop(0.4, 'rgba(160,230,255,0.02)');
    radial.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle starry dots (sparse)
    for (let i = 0; i < 12; i++) {
      const sx = (i * 73 + t * 14) % WIDTH;
      const sy = 30 + ((i * 37) % 80);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,220,${0.02 + 0.02 * Math.sin(t + i)})`;
      ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPowerPlant() {
    // ground platform with nicer shading
    roundRect(ctx, 40, 220, WIDTH - 80, 200, 12, '#071722');
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(60, 250, WIDTH - 120, 140);

    // Silhouette shapes of machinery with soft glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = 80 + i * 110;
      const y = 280 + ((i % 2) * 12);
      const glow = ctx.createLinearGradient(x - 30, y - 40, x + 30, y + 40);
      glow.addColorStop(0, 'rgba(150,220,255,0.08)');
      glow.addColorStop(1, 'rgba(120,120,255,0.02)');
      ctx.fillStyle = glow;
      drawBolt(x, y, '#88ddff', 2.2);
    }
    ctx.restore();

    // subtle ambient floating orbs near machinery
    for (let j = 0; j < 3; j++) {
      const ox = 130 + j * 220 + Math.sin(performance.now() / 1200 + j) * 10;
      const oy = 260 + Math.cos(performance.now() / 900 + j) * 6;
      const r = 22 + j * 6;
      ctx.beginPath();
      ctx.fillStyle = `rgba(140,220,255,${0.02 + j * 0.01})`;
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBulbs() {
    ctx.save();
    // draw bulbs with brighter glass and soft outer bloom
    bulbs.forEach((b, i) => {
      // base shadow
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.ellipse(b.x, b.y + b.r + 12, b.r * 0.95, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // dynamic bloom behind bulb
      if (b.lit) {
        const bloom = ctx.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r * 2.4);
        bloom.addColorStop(0, `rgba(255,230,130,${0.18 * b.glow})`);
        bloom.addColorStop(0.6, `rgba(255,200,80,${0.06 * b.glow})`);
        bloom.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // bulb glass gradient
      const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.5, 8, b.x, b.y, b.r * 1.1);
      if (b.lit) {
        g.addColorStop(0, `rgba(255,255,180,${0.95 * b.glow})`);
        g.addColorStop(0.5, `rgba(255,230,140,${0.45 * b.glow})`);
        g.addColorStop(1, 'rgba(180,200,220,0.03)');
      } else {
        g.addColorStop(0, 'rgba(220,240,255,0.06)');
        g.addColorStop(1, 'rgba(150,180,200,0.02)');
      }
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();

      // filament (wavy), brighter if lit
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(i * 0.3 - 0.4);
      ctx.lineWidth = 3 + 2 * b.glow;
      ctx.strokeStyle = b.lit ? `rgba(255,235,140,${0.6 + 0.4 * b.glow})` : '#c9d6df';
      ctx.beginPath();
      ctx.moveTo(-12, 8);
      ctx.quadraticCurveTo(0, -18, 16, 8);
      ctx.stroke();
      ctx.restore();

      // reflection sheen
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.ellipse(b.x - b.r * 0.45, b.y - b.r * 0.45, b.r * 0.35, b.r * 0.55, -0.6, 0, Math.PI * 2);
      ctx.fill();

      // rim
      ctx.beginPath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();

      // base (metal part)
      roundRect(ctx, b.x - 34, b.y + b.r - 10, 68, 28, 6, '#8a8a8a');
      roundRect(ctx, b.x - 24, b.y + b.r + 18, 48, 10, 3, '#5a5a5a');

      // target and sum text with soft shadow
      ctx.font = '18px "Comic Sans MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(`Need: ${b.target}`, b.x, b.y - b.r - 18);
      ctx.shadowBlur = 0;

      // meter
      const meterW = 126;
      const meterH = 12;
      const mx = b.x - meterW / 2;
      const my = b.y + b.r + 40;
      roundRect(ctx, mx, my, meterW, meterH, 8, 'rgba(0,0,0,0.28)');
      const ratio = Math.min(1, b.sum / b.target);
      const fillColor = b.lit ? '#ffe88f' : `hsl(${200 - ratio * 80}, 70%, ${50 + ratio * 10}%)`;
      roundRect(ctx, mx + 2, my + 2, (meterW - 4) * ratio, meterH - 4, 6, fillColor);

      // sum number
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Sum: ${b.sum}`, b.x, my + meterH + 16);

      // keyboard focus outline
      if (focus.type === 'bulb' && focus.index === i && canvas === document.activeElement) {
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff1b0';
        ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawTiles() {
    // Draw tiles with drop shadows, gradients, hover/pick animations
    tiles.forEach((t, i) => {
      const isHeld = heldTile === t.id || t.picked;
      const hover = t.hover && !isHeld;
      const px = isHeld ? pointer.x - t.w / 2 : t.x;
      const py = isHeld ? pointer.y - t.h / 2 : t.y;

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const shadowOffsetY = isHeld ? 18 : 8;
      const shadowW = t.w + (isHeld ? 10 : 6);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      roundRect(ctx, px + 6, py + shadowOffsetY, shadowW, t.h, 14, 'rgba(0,0,0,0.12)');
      ctx.restore();

      // tile background gradient
      const grad = ctx.createLinearGradient(px, py, px + t.w, py + t.h);
      if (isHeld) {
        grad.addColorStop(0, '#fff7e6');
        grad.addColorStop(1, '#ffe3a6');
      } else {
        grad.addColorStop(0, hover ? '#fefefe' : '#ffffff');
        grad.addColorStop(1, hover ? '#ffeecf' : '#fbfbfb');
      }
      roundRect(ctx, px, py, t.w, t.h, 12, grad);

      // border
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = hover ? '#66eeff' : '#3d3d3d';
      ctx.strokeRect(px + 0.5, py + 0.5, t.w - 1, t.h - 1);

      // subtle icon (mini bolt) on tile
      ctx.save();
      ctx.translate(px + 12, py + 12);
      ctx.scale(0.6, 0.6);
      drawBolt(0, 0, '#ffd77a', 1.4);
      ctx.restore();

      // number text with slight shadow
      ctx.font = '28px "Comic Sans MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#222';
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 4;
      ctx.fillText(String(t.value), px + t.w / 2, py + t.h / 2 + 10);
      ctx.shadowBlur = 0;

      // Focus ring for keyboard focus
      const tileIndex = tiles.indexOf(t);
      if (focus.type === 'tile' && focus.index === tileIndex && canvas === document.activeElement) {
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#86f3ff';
        roundRect(ctx, px - 8, py - 8, t.w + 16, t.h + 16, 18, 'transparent');
        ctx.stroke();
      }
    });

    // If dragging with mouse, draw held tile on top for crispness
    if (pointer.isDown && heldTile !== null) {
      const t = findTileById(heldTile);
      if (t) {
        ctx.save();
        ctx.globalAlpha = 0.98;
        const px = pointer.x - t.w / 2;
        const py = pointer.y - t.h / 2;
        const grad = ctx.createLinearGradient(px, py, px + t.w, py + t.h);
        grad.addColorStop(0, '#fff7e6');
        grad.addColorStop(1, '#ffe3a6');
        roundRect(ctx, px, py, t.w, t.h, 12, grad);
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = '#3b3b3b';
        ctx.strokeRect(px + 0.5, py + 0.5, t.w - 1, t.h - 1);
        ctx.font = '28px "Comic Sans MS", sans-serif';
        ctx.fillStyle = '#222';
        ctx.textAlign = 'center';
        ctx.fillText(String(t.value), px + t.w / 2, py + t.h / 2 + 10);
        ctx.restore();
      }
    }
  }

  function drawBattery() {
    const bx = WIDTH / 2;
    const by = 240;
    // battery outer shell
    roundRect(ctx, bx - 84, by - 36, 168, 88, 16, '#1f2b2f');
    roundRect(ctx, bx - 74, by - 30, 148, 76, 12, '#2d4850');

    // energy bar top
    const energyLevel = bulbs.reduce((acc, b) => acc + b.sum / b.target, 0) / (bulbs.length || 1);
    const topW = 86;
    const fillW = Math.max(8, topW * energyLevel);
    roundRect(ctx, bx - 42, by - 52, topW, 18, 8, '#f7d98f');
    roundRect(ctx, bx - 42 + 4, by - 50, fillW - 8, 14, 6, '#fff5d1');

    // friendly face
    const char = characters[0];
    ctx.beginPath();
    ctx.fillStyle = char.color;
    ctx.arc(bx, by + 6, 28, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(bx - 10, by + 2, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx + 10, by + 2, 4.2, 0, Math.PI * 2);
    ctx.fill();

    // happy mouth changes slightly by energy
    ctx.beginPath();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    const smileOffset = -6 + energyLevel * 12;
    ctx.arc(bx, by + smileOffset, 10, 0, Math.PI, false);
    ctx.stroke();

    // Circuit wires between battery and bulbs with animated shimmer
    bulbs.forEach((b, i) => {
      const sx = bx;
      const sy = by - 18;
      const ex = b.x;
      const ey = b.y + b.r + 14;

      ctx.beginPath();
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      const grad = ctx.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, '#ffdca0');
      grad.addColorStop(1, '#9be7ff');
      ctx.strokeStyle = grad;
      const midx = (sx + ex) / 2 + Math.sin(performance.now() / 400 + i) * 8;
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(midx, (sy + ey) / 2 + 10, ex, ey);
      ctx.stroke();

      // traveling spark
      if (b.lit) {
        const t = (performance.now() / 350) % 1;
        const pt = quadraticPoint(sx, sy, midx, (sy + ey) / 2 + 10, ex, ey, t);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,235,120,0.96)';
        ctx.arc(pt.x, pt.y, 7 + Math.sin(performance.now() / 120) * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,235,120,0.18)';
        ctx.arc(pt.x, pt.y, 18, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // label
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Battery: Feed the bulbs with number tiles!', bx, by + 66);
  }

  function drawUI() {
    // Title
    ctx.font = '26px "Comic Sans MS", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('Spark Workshop — Match each bulb to its needed energy', 18, 36);

    // Instructions box with translucent backdrop
    ctx.save();
    roundRect(ctx, 12, 44, 540, 86, 10, 'rgba(255,255,255,0.03)');
    ctx.restore();

    const instructions = [
      'Drag number tiles to bulbs to make the bulb reach its target number.',
      'Keyboard: Tab to switch focus, Arrow keys to move, Enter/Space to pick/drop.',
      'A toggles audio. R resets the puzzle.',
    ];
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#dbeeff';
    let y = 64;
    instructions.forEach((line) => {
      ctx.fillText(line, 24, y);
      y += 18;
    });

    // Draw audio speaker icon with on/off
    drawSpeakerIcon(WIDTH - 60, 36, audioReady && audioAllowed);

    // Held tile hint
    if (heldTile !== null && !pointer.isDown) {
      const t = findTileById(heldTile);
      if (t) {
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(`Holding tile ${t.value} — move focus to a bulb and press Enter to drop`, 18, HEIGHT - 16);
      }
    }
  }

  function drawConfetti() {
    confettiParticles.forEach((p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    if (allLit) {
      ctx.font = '36px "Comic Sans MS", sans-serif';
      ctx.fillStyle = '#ffd27f';
      ctx.textAlign = 'center';
      ctx.fillText('All bulbs glowing! Great job!', WIDTH / 2, 220);

      // celebratory waves
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,160,${0.12 + 0.06 * i})`;
        ctx.lineWidth = 8 - i * 2;
        ctx.arc(WIDTH / 2, 230, 90 + i * 26 + Math.sin(performance.now() / 400) * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawAudioUnavailable() {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#ffcccc';
    ctx.textAlign = 'right';
    const msg = 'Audio unavailable';
    ctx.fillText(msg, WIDTH - 18, HEIGHT - 14);
  }

  // -------------------------
  // Interaction Handlers
  // -------------------------
  function onPointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.isDown = true;
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;

    // Check tiles first
    const t = tileAt(pointer.x, pointer.y);
    if (t) {
      heldTile = t.id;
      t.picked = true;
      playClick();
      // resume audio context on first interaction if suspended
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch((err) => {
          console.warn('Audio resume failed:', err);
        });
      }
      return;
    }

    // Check if clicked a bulb to drop (if holding via keyboard)
    const b = bulbAt(pointer.x, pointer.y);
    if (b && heldTile !== null) {
      dropTileOnBulb(heldTile, b.id);
      playDrop();
      return;
    }
  }

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
  }

  function onPointerUp(e) {
    if (!pointer.isDown) return;
    pointer.isDown = false;
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;

    if (heldTile !== null) {
      const b = bulbAt(pointer.x, pointer.y);
      if (b) {
        dropTileOnBulb(heldTile, b.id);
      } else {
        const t = findTileById(heldTile);
        if (t) {
          t.picked = false;
        }
      }
      heldTile = null;
    }
  }

  function onTouchDown(e) {
    e.preventDefault();
    if (e.touches && e.touches.length) {
      const rect = canvas.getBoundingClientRect();
      pointer.isDown = true;
      pointer.x = e.touches[0].clientX - rect.left;
      pointer.y = e.touches[0].clientY - rect.top;

      const t = tileAt(pointer.x, pointer.y);
      if (t) {
        heldTile = t.id;
        t.picked = true;
        playClick();
      }

      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch((err) => {
          console.warn('Audio resume failed:', err);
        });
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches && e.touches.length) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.touches[0].clientX - rect.left;
      pointer.y = e.touches[0].clientY - rect.top;
    }
  }

  function onTouchUp(e) {
    e.preventDefault();
    if (!pointer.isDown) return;
    pointer.isDown = false;
    if (heldTile !== null) {
      const b = bulbAt(pointer.x, pointer.y);
      if (b) {
        dropTileOnBulb(heldTile, b.id);
      } else {
        const t = findTileById(heldTile);
        if (t) t.picked = false;
      }
      heldTile = null;
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (focus.type === 'tile') {
        focus.type = 'bulb';
        focus.index = 0;
      } else {
        focus.type = 'tile';
        focus.index = 0;
      }
      draw();
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'Left') {
      e.preventDefault();
      if (focus.type === 'tile') {
        focus.index = (focus.index - 1 + tiles.length) % tiles.length;
      } else {
        focus.index = (focus.index - 1 + bulbs.length) % bulbs.length;
      }
      draw();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'Right') {
      e.preventDefault();
      if (focus.type === 'tile') {
        focus.index = (focus.index + 1) % tiles.length;
      } else {
        focus.index = (focus.index + 1) % bulbs.length;
      }
      draw();
      return;
    }

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (heldTile === null && focus.type === 'tile') {
        const t = tiles[focus.index];
        heldTile = t.id;
        t.picked = true;
        playClick();
      } else if (heldTile !== null && focus.type === 'bulb') {
        const b = bulbs[focus.index];
        dropTileOnBulb(heldTile, b.id);
        heldTile = null;
      } else if (heldTile !== null && focus.type === 'tile') {
        const t = findTileById(heldTile);
        if (t) {
          t.picked = false;
        }
        heldTile = null;
      }
      draw();
      return;
    }

    if (e.key.toLowerCase() === 'a') {
      e.preventDefault();
      toggleAudio();
      return;
    }

    if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      resetGame();
      return;
    }
  }

  // -------------------------
  // Game logic (unchanged math)
  // -------------------------
  function dropTileOnBulb(tileId, bulbId) {
    const tile = findTileById(tileId);
    const bulb = bulbs.find((b) => b.id === bulbId);
    if (!tile || !bulb) return;

    const newSum = bulb.sum + tile.value;
    if (newSum > bulb.target) {
      playWrong();
      tile.picked = false;
      bulb.glow = Math.min(1, bulb.glow + 0.6);
      // small shake visual: nudge tile position temporarily
      tile.baseY += 6;
      setTimeout(() => {
        tile.baseY -= 6;
      }, 180);
      return;
    } else {
      bulb.sum = newSum;
      tile.picked = false;
      const idx = tiles.findIndex((t) => t.id === tile.id);
      if (idx >= 0) {
        tiles.splice(idx, 1);
        if (focus.type === 'tile') {
          focus.index = Math.max(0, Math.min(tiles.length - 1, focus.index));
        }
      }
      playCorrect();
      if (bulb.sum === bulb.target) {
        bulb.lit = true;
        spawnFriendlySpark(bulb.x, bulb.y);
      }
    }
  }

  function spawnFriendlySpark(x, y) {
    for (let i = 0; i < 12; i++) {
      confettiParticles.push({
        x: x + randInt(-8, 8),
        y: y + randInt(-8, 8),
        vx: randFloat(-2, 2),
        vy: randFloat(-3, -1),
        size: randInt(4, 9),
        rot: 0,
        vr: randFloat(-0.2, 0.2),
        life: randInt(30, 70),
        color: randChoice(['#ffdf7a', '#ffd7a8', '#ffd1ff', '#b3f0ff']),
      });
    }
    // soft chime for single bulb completion
    playChime(x % 800 + 300);
  }

  function doCelebration() {
    for (let i = 0; i < 80; i++) {
      confettiParticles.push({
        x: randFloat(80, WIDTH - 80),
        y: randFloat(-20, 40),
        vx: randFloat(-2.5, 2.5),
        vy: randFloat(0.5, 3.0),
        size: randInt(6, 12),
        rot: randFloat(0, Math.PI),
        vr: randFloat(-0.1, 0.1),
        life: randInt(100, 240),
        color: randChoice(['#ffdf7a', '#ffd7a8', '#ffd1ff', '#b3f0ff', '#a8f4b3', '#ffd0d0']),
      });
    }
    showCelebration = 200;
    playVictory();
  }

  // -------------------------
  // Audio functions (Web Audio API) - improved ambient plus better effects
  // -------------------------
  function setupAmbient() {
    if (!audioReady) return;
    try {
      // Clean up any previous ambient nodes
      if (ambientNodes) {
        try {
          ambientNodes.osc1.stop();
        } catch (e) {}
        ambientNodes = null;
      }

      const now = audioCtx.currentTime;

      // Master ambient gain
      backgroundGain = audioCtx.createGain();
      backgroundGain.gain.value = audioAllowed ? 0.0025 : 0;
      backgroundGain.connect(audioCtx.destination);

      // Low drifting pad (two detuned oscillators)
      const osc1 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 68;
      const osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 72;

      // gentle lowpass filter modulated by LFO
      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 500;

      // LFO to gently move filter cutoff
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.09; // very slow
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 240; // modulation depth

      // connect
      osc1.connect(padFilter);
      osc2.connect(padFilter);
      padFilter.connect(backgroundGain);

      // LFO to filter.frequency
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      // Start nodes
      osc1.start(now);
      osc2.start(now);
      lfo.start(now);

      // Keep references
      ambientNodes = { osc1, osc2, lfo, lfoGain, padFilter };

      // A very light "air" oscillator for higher sparkle
      const airOsc = audioCtx.createOscillator();
      airOsc.type = 'triangle';
      airOsc.frequency.value = 340;
      const airGain = audioCtx.createGain();
      airGain.gain.value = 0.0009;
      const airFilter = audioCtx.createBiquadFilter();
      airFilter.type = 'highpass';
      airFilter.frequency.value = 240;
      airOsc.connect(airFilter);
      airFilter.connect(airGain);
      airGain.connect(audioCtx.destination);
      airOsc.start(now);

      ambientNodes.airOsc = airOsc;
      ambientNodes.airGain = airGain;
      ambientNodes.airFilter = airFilter;
    } catch (err) {
      console.warn('Error setting up ambient:', err);
      audioReady = false;
      audioError = err;
    }
  }

  function toggleAudio() {
    if (!audioReady) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioReady = true;
        setupAmbient();
      } catch (err) {
        audioError = err;
        audioReady = false;
        alert('Audio cannot be enabled on this device or browser.');
        return;
      }
    }
    audioAllowed = !audioAllowed;
    if (backgroundGain) {
      // smooth ramp
      try {
        const now = audioCtx.currentTime;
        backgroundGain.gain.cancelScheduledValues(now);
        backgroundGain.gain.setTargetAtTime(audioAllowed ? 0.0025 : 0.0, now, 0.05);
      } catch (e) {
        backgroundGain.gain.value = audioAllowed ? 0.0025 : 0;
      }
    }
    if (audioAllowed) {
      playClick();
    } else {
      // gentle mute click
      playTone(220, 'sine', 0.06, 0.02);
    }
  }

  // general tone helper with simple ADSR and filter
  function playTone(freq, type = 'sine', dur = 0.18, volume = 0.08, options = {}) {
    if (!audioReady || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;

      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type = options.filterType || 'lowpass';
      filter.frequency.value = options.filterFreq || Math.max(800, freq * 3);

      // gentle ADSR
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      // optional shimmer via stereo-ish delay (single channel)
      const nodeChainEnd = audioCtx.createGain();
      nodeChainEnd.gain.value = 1;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(nodeChainEnd);

      // subtle delay (short feedback) for warmth
      if (options.useDelay) {
        const delay = audioCtx.createDelay();
        delay.delayTime.value = 0.09;
        const feedback = audioCtx.createGain();
        feedback.gain.value = 0.12;
        nodeChainEnd.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(audioCtx.destination);
        nodeChainEnd.connect(audioCtx.destination);
      } else {
        nodeChainEnd.connect(audioCtx.destination);
      }

      osc.start(now);
      osc.stop(now + dur + 0.06);
    } catch (err) {
      console.warn('playTone error', err);
    }
  }

  function playClick() {
    playTone(880, 'square', 0.08, 0.05, { filterFreq: 2200 });
  }

  function playCorrect() {
    // two-step pleasant harp-ish hit
    playTone(880, 'sine', 0.14, 0.06, { filterFreq: 3200, useDelay: true });
    setTimeout(() => playTone(1120, 'sine', 0.12, 0.05, { filterFreq: 3600 }), 120);
  }

  function playWrong() {
    // low descending thud with short noise flourish
    playTone(220, 'sawtooth', 0.18, 0.06, { filterFreq: 800 });
    setTimeout(() => playTone(160, 'sine', 0.12, 0.03, { filterFreq: 600 }), 80);
  }

  function playDrop() {
    playTone(520, 'sine', 0.12, 0.04, { filterFreq: 1800 });
  }

  function playVictory() {
    if (!audioReady || !audioAllowed) return;
    const seq = [560, 700, 880, 1040];
    seq.forEach((f, i) => {
      setTimeout(() => {
        playTone(f, 'sine', 0.16, 0.06, { useDelay: true });
      }, i * 220);
    });
  }

  function playChime(seedFreq = 440) {
    // single bright chime for small celebrations
    playTone(seedFreq, 'triangle', 0.18, 0.05, { filterFreq: 3000, useDelay: true });
    setTimeout(() => playTone(seedFreq * 1.25, 'sine', 0.12, 0.04, { filterFreq: 3200 }), 120);
  }

  // -------------------------
  // Utility helpers
  // -------------------------
  function tileAt(x, y) {
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        return t;
      }
    }
    return null;
  }

  function bulbAt(x, y) {
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return b;
    }
    return null;
  }

  function findTileById(id) {
    return tiles.find((t) => t.id === id) || null;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function randFloat(min, max) {
    return Math.random() * (max - min) + min;
  }
  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  // Rounded rectangle helper
  function roundRect(ctx, x, y, w, h, r, fillStyle) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fillStyle && fillStyle !== 'transparent') {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
  }

  // Quadratic bezier point helper for spark motion
  function quadraticPoint(x0, y0, cx, cy, x1, y1, t) {
    const xa = x0 + (cx - x0) * t;
    const ya = y0 + (cy - y0) * t;
    const xb = cx + (x1 - cx) * t;
    const yb = cy + (y1 - cy) * t;
    return { x: xa + (xb - xa) * t, y: ya + (yb - ya) * t };
  }

  // Draw bolt doodle
  function drawBolt(x, y, color, scale = 1) {
    ctx.beginPath();
    ctx.moveTo(x - 6 * scale, y - 12 * scale);
    ctx.lineTo(x + 2 * scale, y - 2 * scale);
    ctx.lineTo(x - 2 * scale, y - 2 * scale);
    ctx.lineTo(x + 6 * scale, y + 12 * scale);
    ctx.lineTo(x - 2 * scale, y + 2 * scale);
    ctx.lineTo(x + 2 * scale, y + 2 * scale);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.stroke();
  }

  // Speaker icon
  function drawSpeakerIcon(cx, cy, on) {
    const size = 20;
    ctx.save();
    ctx.translate(cx, cy);
    roundRect(ctx, -size, -12, 18, 24, 6, '#21333a');
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.moveTo(-size + 6, -6);
    ctx.lineTo(-size + 18, -16);
    ctx.lineTo(-size + 18, 16);
    ctx.closePath();
    ctx.fill();

    if (on) {
      ctx.beginPath();
      ctx.strokeStyle = '#9fffbf';
      ctx.lineWidth = 2;
      ctx.arc(-size + 20, 0, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = '#66eeb0';
      ctx.lineWidth = 2;
      ctx.arc(-size + 20, 0, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.strokeStyle = '#ff9f9f';
      ctx.lineWidth = 3;
      ctx.moveTo(6, -8);
      ctx.lineTo(14, 8);
      ctx.moveTo(14, -8);
      ctx.lineTo(6, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function isPointInSpeaker(x, y) {
    const sx = WIDTH - 60;
    const sy = 36;
    return x >= sx - 28 && x <= sx + 28 && y >= sy - 20 && y <= sy + 20;
  }

  // Canvas polyfill for roundRect stroke if missing
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      roundRect(this, x, y, w, h, r, 'transparent');
    };
  }
})();