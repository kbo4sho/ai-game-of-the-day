(function () {
  // Config
  const WIDTH = 720;
  const HEIGHT = 480;
  const CONTAINER_ID = 'game-of-the-day-stage';
  const MAX_LEVELS = 5; // game beatable in 5 levels
  const PALETTE_SIZE = 6; // number of parts presented each level
  const SLOT_COUNT_BASE = 3; // base number of slots, increases with level
  const COLOR_BG = '#EAF6F4'; // calmer background
  const COLOR_ACCENT = '#385B63';
  const COLOR_GEAR = '#9ECFC6';
  const COLOR_PART = '#FFEEE0';
  const COLOR_TEXT = '#15323A';
  const FONT = '16px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const AUDIO_ICON_SIZE = 28;

  // State and elements
  let container, canvas, ctx;
  let audioCtx = null;
  let audioAllowed = true; // will be toggled if audio context creation fails or user mutes
  let masterGain = null;
  let ambientNodes = []; // ambient audio nodes to manage
  let level = 1;
  let score = 0;
  let parts = []; // palette parts
  let slots = []; // machine slots
  let target = 0;
  let currentSum = 0;
  let selectedPaletteIndex = 0;
  let focusedSlotIndex = 0;
  let dragging = null; // {type:'palette'|'slot', index, offsetX, offsetY}
  let mouse = { x: 0, y: 0, down: false };
  let finished = false;
  let lastUpdateTime = 0;
  let animationOffset = 0;
  let ariaLive; // hidden element for screen reader updates
  let showAudioDisabledMessage = false;
  let particles = []; // visual particles for success
  let robotBlink = 0; // robot eye blink timer
  let hoverSlotIndex = -1;

  // Utility: safe text drawing for accessibility / high contrast
  function drawText(ctx, text, x, y, size = 16, color = COLOR_TEXT, align = 'left') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Initialize the game
  function init() {
    try {
      container = document.getElementById(CONTAINER_ID);
      if (!container) {
        console.error('Game container not found:', CONTAINER_ID);
        return;
      }

      // Clear container
      container.innerHTML = '';
      container.style.position = 'relative';
      container.style.width = WIDTH + 'px';
      container.style.height = HEIGHT + 'px';
      container.setAttribute('role', 'application');
      container.setAttribute('aria-label', 'Machine Math game area');

      // Create canvas
      canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      canvas.style.width = WIDTH + 'px';
      canvas.style.height = HEIGHT + 'px';
      canvas.setAttribute('tabindex', '0'); // enable keyboard focus
      container.appendChild(canvas);
      ctx = canvas.getContext('2d', { alpha: false });

      // Create offscreen/invisible live region for screen readers
      ariaLive = document.createElement('div');
      ariaLive.setAttribute('aria-live', 'polite');
      ariaLive.setAttribute('aria-atomic', 'true');
      // visually hide but remain accessible
      Object.assign(ariaLive.style, {
        position: 'absolute',
        left: '0px',
        top: (HEIGHT + 2) + 'px',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        clip: 'rect(1px, 1px, 1px, 1px)',
        whiteSpace: 'nowrap'
      });
      container.appendChild(ariaLive);

      // Setup audio
      try {
        setupAudio();
      } catch (err) {
        console.warn('Audio initialization failed:', err);
        audioAllowed = false;
        showAudioDisabledMessage = true;
      }

      // Event listeners
      canvas.addEventListener('mousedown', onMouseDown);
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mouseup', onMouseUp);
      canvas.addEventListener('mouseleave', onMouseUp);
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd);
      canvas.addEventListener('keydown', onKeyDown);
      canvas.addEventListener('focus', () => {
        // Provide instructions when focused
        announce('Canvas focused. Use number keys to pick parts, arrow keys to move slots, Enter to place, M to mute.');
      });
      canvas.addEventListener('mousemove', onCanvasHover);

      // Start
      resetGame();
      lastUpdateTime = performance.now();
      requestAnimationFrame(loop);
    } catch (err) {
      console.error('Initialization error:', err);
    }
  }

  // Create ambient audio using Web Audio API - low, gentle pads and breathy filter
  function setupAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio API not supported');
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.14; // gentle background + effects
    masterGain.connect(audioCtx.destination);

    // Clear previous ambient nodes
    ambientNodes.forEach(n => {
      try {
        if (n.osc) n.osc.stop();
      } catch (e) {}
    });
    ambientNodes = [];

    // Two pad oscillators detuned for a warm background
    try {
      const pad1 = audioCtx.createOscillator();
      pad1.type = 'sine';
      pad1.frequency.value = 110;
      const pad1Gain = audioCtx.createGain();
      pad1Gain.gain.value = 0.01;
      const pad1Filter = audioCtx.createBiquadFilter();
      pad1Filter.type = 'lowpass';
      pad1Filter.frequency.value = 800;
      pad1.connect(pad1Filter);
      pad1Filter.connect(pad1Gain);
      pad1Gain.connect(masterGain);
      pad1.start();
      ambientNodes.push({ osc: pad1, gain: pad1Gain, filter: pad1Filter });

      const pad2 = audioCtx.createOscillator();
      pad2.type = 'triangle';
      pad2.frequency.value = 138.5; // a fifth above ~110
      const pad2Gain = audioCtx.createGain();
      pad2Gain.gain.value = 0.008;
      const pad2Filter = audioCtx.createBiquadFilter();
      pad2Filter.type = 'lowpass';
      pad2Filter.frequency.value = 900;
      pad2.connect(pad2Filter);
      pad2Filter.connect(pad2Gain);
      pad2Gain.connect(masterGain);
      pad2.start();
      ambientNodes.push({ osc: pad2, gain: pad2Gain, filter: pad2Filter });

      // A slow LFO to modulate pad filter cutoff for gentle movement
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 250; // amount to modulate cutoff
      lfo.connect(lfoGain);
      ambientNodes.forEach(n => {
        if (n.filter && n.filter.frequency) {
          lfoGain.connect(n.filter.frequency);
        }
      });
      lfo.start();
      ambientNodes.push({ osc: lfo, gain: lfoGain });
    } catch (err) {
      // On any failure, ensure audioAllowed is set to false and resources cleaned
      console.warn('Ambient audio setup failed:', err);
      try {
        audioCtx.close();
      } catch (e) {}
      audioCtx = null;
      audioAllowed = false;
      showAudioDisabledMessage = true;
      throw err;
    }
  }

  // Reset game state for new playthrough
  function resetGame() {
    level = 1;
    score = 0;
    finished = false;
    particles.length = 0;
    prepareLevel();
  }

  // Prepare parts and slots making sure level is solvable
  function prepareLevel() {
    // Determine slot count and target complexity
    const slotCount = SLOT_COUNT_BASE + Math.floor((level - 1) / 1); // increase occasionally
    const partCount = PALETTE_SIZE;
    const minValue = 1 + Math.floor((level - 1) * 0.5);
    const maxValue = 6 + level; // increase max
    // Create a guaranteed solution: pick random numbers that sum to target
    const solutionParts = [];
    // We ensure the solution uses between 2 and slotCount parts
    const solutionLen = Math.min(slotCount, 2 + (level % slotCount));
    // Choose target by summing random ints
    let chosenTarget = 0;
    for (let i = 0; i < solutionLen; i++) {
      const v = randInt(minValue, Math.max(minValue + 1, maxValue));
      solutionParts.push(v);
      chosenTarget += v;
    }
    // Now create palette parts: include solution parts plus decoys
    const palette = [];
    // Add solution parts as separate items
    for (let v of solutionParts) {
      palette.push({ value: v, id: uniqueId() });
    }
    // Add decoys ensuring not to accidentally provide extra solution combinations that break challenge
    while (palette.length < partCount) {
      let v = randInt(minValue, maxValue);
      // avoid exact duplication too often: allow duplicates but ensure not too many
      if (palette.filter(p => p.value === v).length < 3) {
        palette.push({ value: v, id: uniqueId() });
      } else {
        // pick different
        v = randInt(minValue, maxValue);
        palette.push({ value: v, id: uniqueId() });
      }
    }
    // Shuffle palette
    shuffleArray(palette);
    // Create parts with positions in palette area (left side)
    parts = palette.map((p, i) => {
      return {
        id: p.id,
        value: p.value,
        x: 24,
        y: 120 + i * 60,
        w: 92,
        h: 44,
        placed: false
      };
    });
    // Create slots on machine area (right side)
    slots = [];
    const slotStartX = 380;
    const slotStartY = 140;
    const slotGap = 74;
    for (let i = 0; i < slotCount; i++) {
      slots.push({
        index: i,
        x: slotStartX + (i % 3) * 110,
        y: slotStartY + Math.floor(i / 3) * slotGap,
        w: 96,
        h: 56,
        part: null // will hold part id
      });
    }
    target = chosenTarget;
    currentSum = 0;
    selectedPaletteIndex = 0;
    focusedSlotIndex = 0;
    announce(`Level ${level}. Make the machine show ${target} by placing parts. Use numbers keys to pick parts and Enter to place.`);
  }

  // Unique ID generator
  function uniqueId() {
    return Math.random().toString(36).slice(2, 9);
  }

  // Random integer inclusive
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Shuffle array
  function shuffleArray(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  // Main loop and render
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastUpdateTime) / 1000);
    lastUpdateTime = ts;
    animationOffset += dt * 30;
    // robot blink timer
    robotBlink += dt;
    if (robotBlink > 3 + Math.random() * 3) robotBlink = 0;
    updateParticles(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Draw entire scene
  function draw() {
    // Clear background
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Gentle parallax layered shapes
    drawBackgroundShapes();

    // Draw left palette of parts
    drawPalette();

    // Draw main machine area with slots, robot, and gears
    drawMachine();

    // Draw header and instructions (on top of left background)
    drawHeader();

    // Draw footer: level, score, target and sum
    drawFooter();

    // Draw audio icon
    drawAudioIcon();

    // Draw dragging part on top if any
    drawDraggingPart();

    // Draw particles (celebration)
    drawParticles();

    // Draw accessibility cues (outline if audio disabled)
    if (showAudioDisabledMessage) {
      ctx.fillStyle = 'rgba(255, 250, 240, 0.95)';
      roundRect(ctx, 12, HEIGHT - 74, 420, 52, 10);
      ctx.fill();
      ctx.strokeStyle = '#B35A4A';
      ctx.lineWidth = 1;
      ctx.stroke();
      drawText(ctx, 'Audio is unavailable. Use M to toggle sound if your browser allows it.', 28, HEIGHT - 46, 14, '#5B3A36');
    }
  }

  // Draw decorative background shapes - gentle moving waves and cog silhouettes
  function drawBackgroundShapes() {
    ctx.save();
    const t = animationOffset;
    // subtle diagonal stripe
    for (let i = -2; i < 6; i++) {
      ctx.globalAlpha = 0.04 + 0.02 * Math.sin((t * 0.3) + i);
      ctx.fillStyle = '#9FD7CE';
      roundRect(ctx, 60 + i * 140, 30 + Math.sin(i + t * 0.2) * 6, 120, 380, 60);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // faint mechanical silhouettes right side
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#223E3D';
    drawGearSilhouette(540, 70, 64, t * 0.02);
    drawGearSilhouette(630, 160, 48, -t * 0.03);
    drawGearSilhouette(460, 220, 36, t * 0.025);
    ctx.restore();

    ctx.restore();
  }

  function drawGearSilhouette(cx, cy, r, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    for (let i = 0; i < 10; i++) {
      ctx.rotate((Math.PI * 2) / 10);
      ctx.fillRect(r - 8, -5, 12, 10);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r - 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw title and small instructions (overlay)
  function drawHeader() {
    drawText(ctx, 'Machine Math', 24, 40, 28, COLOR_ACCENT);
    drawText(ctx, 'Place number parts into slots to make the machine display the target.', 24, 64, 13, '#356868');
    drawText(ctx, 'Controls: Number keys pick parts, Enter places, click/drag allowed. M toggles sound.', 24, 82, 12, '#356868');
  }

  function drawFooter() {
    // Panel with level, score, target and sum
    ctx.save();
    ctx.fillStyle = '#FFFFFFEE';
    roundRect(ctx, 12, HEIGHT - 86, WIDTH - 24, 68, 12);
    ctx.fill();

    // Drop shadow for panel
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Level and score
    drawText(ctx, `Level: ${level} / ${MAX_LEVELS}`, 28, HEIGHT - 50, 16, COLOR_TEXT);
    drawText(ctx, `Score: ${score}`, 160, HEIGHT - 50, 16, COLOR_TEXT);

    // Target and sum in machine style
    ctx.fillStyle = '#F2FCFB';
    roundRect(ctx, 320, HEIGHT - 80, 380, 56, 10);
    ctx.fill();

    drawText(ctx, `Target: ${target}`, 340, HEIGHT - 50, 18, '#123234');
    drawText(ctx, `Current sum: ${currentSum}`, 540, HEIGHT - 50, 18, '#123234');

    ctx.restore();
  }

  // Draw palette list of parts
  function drawPalette() {
    drawText(ctx, 'Parts', 24, 108, 18, '#1F4E4D');

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      // Skip drawing the dragging visual here (we draw it on top)
      if (dragging && dragging.type === 'palette' && dragging.index === i) continue;

      // If part is placed, draw faded
      ctx.save();
      const isSelected = i === selectedPaletteIndex && !dragging;
      ctx.globalAlpha = p.placed ? 0.36 : 1.0;
      // palette background with subtle gradient
      const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
      grad.addColorStop(0, isSelected ? '#FFF8F0' : COLOR_PART);
      grad.addColorStop(1, isSelected ? '#FFF1E8' : '#FFDDBF');
      ctx.fillStyle = grad;
      roundRect(ctx, p.x, p.y, p.w, p.h, 10);
      ctx.fill();

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      roundRect(ctx, p.x + 2, p.y + p.h - 6, p.w - 6, 6, 6);
      ctx.fill();

      // number circle
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(p.x + 44, p.y + p.h / 2, 18, 0, Math.PI * 2);
      ctx.fill();

      // gear doodle behind number
      drawSmallGear(p.x + 44, p.y + p.h / 2, 8, '#E7F2F0', animationOffset * 0.2 + i);

      // number text
      drawText(ctx, `${p.value}`, p.x + 44, p.y + p.h / 2 + 6, 18, '#2C2C2C', 'center');

      // keyboard hint
      drawText(ctx, `${i + 1}`, p.x + p.w - 18, p.y + p.h - 6, 12, '#6D6D6D', 'center');

      ctx.restore();
    }
  }

  // Draw small decorative gear
  function drawSmallGear(cx, cy, r, color, rotation = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation * 0.1);
    ctx.fillStyle = color;
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(r * 0.8, -r * 0.2, r * 0.5, r * 0.4);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#AAB9B7';
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw main machine area with slots
  function drawMachine() {
    // machine body with subtle shadow
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 340, 110, 360, 220, 18);
    ctx.fill();

    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#F6FFFE';
    roundRect(ctx, 344, 114, 352, 212, 16);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    // wacky display showing target (big gear)
    drawGearDisplay(480, 180, 70, target, '#9FD7CE');

    // robot character on the left of machine
    drawRobot(374, 230);

    // slots
    hoverSlotIndex = -1;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      ctx.save();

      // determine hover or focus
      const isFocused = i === focusedSlotIndex;
      const isHover = hitTest(mouse.x, mouse.y, s.x, s.y, s.w, s.h);
      if (isHover) hoverSlotIndex = i;

      // slot background with pulsing rim if empty
      const pulse = 0.08 * Math.sin(animationOffset * 0.12 + i) + 0.12;
      ctx.fillStyle = '#F4FAF9';
      roundRect(ctx, s.x, s.y, s.w, s.h, 12);
      ctx.fill();

      // rim glow
      if (!s.part && (isFocused || isHover)) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = isFocused ? 0.35 : 0.18;
        const glowRadius = isFocused ? 18 + 8 * pulse : 12 + 6 * pulse;
        const grad = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, 4, s.x + s.w / 2, s.y + s.h / 2, glowRadius);
        grad.addColorStop(0, '#C7F0EA');
        grad.addColorStop(1, 'rgba(199,240,234,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x + s.w / 2, s.y + s.h / 2, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // focus highlight outline
      if (isFocused) {
        ctx.strokeStyle = '#6CC7BF';
        ctx.lineWidth = 2;
        roundRect(ctx, s.x - 2, s.y - 2, s.w + 4, s.h + 4, 12);
        ctx.stroke();
      }

      // if there's a placed part, draw it inside slot
      if (s.part) {
        const part = parts.find(p => p.id === s.part);
        if (part) {
          ctx.fillStyle = '#FFF8F2';
          roundRect(ctx, s.x + 10, s.y + 6, s.w - 20, s.h - 12, 8);
          ctx.fill();
          drawText(ctx, `${part.value}`, s.x + s.w / 2, s.y + s.h / 2 + 6, 18, '#333333', 'center');
          // little connector drawing
          ctx.strokeStyle = '#D2EAE7';
          ctx.beginPath();
          ctx.moveTo(s.x + s.w / 2, s.y - 8);
          ctx.lineTo(s.x + s.w / 2, s.y + s.h + 4);
          ctx.stroke();

          // gentle sparkle when placed
          ctx.save();
          ctx.globalAlpha = 0.12 + 0.08 * Math.sin(animationOffset * 0.8 + i);
          ctx.fillStyle = '#CFF7EE';
          ctx.beginPath();
          ctx.ellipse(s.x + s.w / 2 + 18, s.y + 8, 6, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else {
        // placeholder text with friendly hint
        drawText(ctx, 'slot', s.x + 12, s.y + s.h / 2 + 6, 12, '#A9BFBF');
      }

      ctx.restore();
    }

    // pipes and connectors
    drawPipe(420, 240, 540, 320);
    ctx.restore();
  }

  // Gear display for the target
  function drawGearDisplay(cx, cy, r, number, color) {
    // big gear with rotating teeth and subtle shine
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(animationOffset * 0.04);
    // multi-ring gear
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      ctx.beginPath();
      ctx.fillStyle = i % 2 ? '#DFF6F3' : color;
      ctx.rect(r - 10, -5, 14, 10);
      ctx.fill();
    }
    // inner circle
    const grad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(1, '#BEEFEA');
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.arc(0, 0, r - 18, 0, Math.PI * 2);
    ctx.fill();

    // machine numeric display (digital-ish)
    ctx.fillStyle = COLOR_ACCENT;
    drawText(ctx, `${number}`, 0, 8, 28, COLOR_ACCENT, 'center');

    // tiny LEDs around display
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + animationOffset * 0.02;
      const lx = Math.cos(ang) * (r + 6);
      const ly = Math.sin(ang) * (r + 6);
      ctx.beginPath();
      ctx.fillStyle = `rgba(80,170,155,${0.4 + 0.4 * Math.sin(animationOffset * 0.6 + i)})`;
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw a pipe between points with decoration
  function drawPipe(x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = '#D7EDE9';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const mx = (x1 + x2) / 2;
    ctx.quadraticCurveTo(mx, y1 + 40, x2, y2);
    ctx.stroke();

    // small bolts along pipe
    ctx.fillStyle = '#E8F6F2';
    for (let t = 0; t < 1; t += 0.18) {
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t + Math.sin(animationOffset * 0.4 + t * 10) * 6;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Drawing audio icon and state
  function drawAudioIcon() {
    const x = WIDTH - AUDIO_ICON_SIZE - 18;
    const y = 12;
    ctx.save();
    ctx.fillStyle = audioAllowed ? '#4DA79B' : '#C3A097';
    roundRect(ctx, x - 6, y - 6, AUDIO_ICON_SIZE + 12, AUDIO_ICON_SIZE + 12, 10);
    ctx.fill();
    // speaker icon
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 10);
    ctx.lineTo(x + 16, y + 6);
    ctx.lineTo(x + 16, y + 22);
    ctx.closePath();
    ctx.fill();
    // waves or muted cross
    if (audioAllowed) {
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 18, y + 14, 8, -0.7, 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 18, y + 14, 12, -0.65, 0.65);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 8);
      ctx.lineTo(x + 24, y + 20);
      ctx.moveTo(x + 24, y + 8);
      ctx.lineTo(x + 12, y + 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Rectangle helper
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draw a friendly robot made of simple shapes
  function drawRobot(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);

    // body
    ctx.fillStyle = '#E6F8F4';
    roundRect(ctx, -38, -46, 76, 72, 10);
    ctx.fill();

    // chest panel
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, -30, -30, 60, 42, 8);
    ctx.fill();
    ctx.strokeStyle = '#D7EBE8';
    ctx.lineWidth = 1;
    ctx.stroke();

    // eyes - blink based on robotBlink timer
    const blink = Math.max(0, 1 - Math.abs(robotBlink % 1 - 0.5) * 4); // quick blink
    ctx.fillStyle = '#2D3B3B';
    ctx.beginPath();
    ctx.ellipse(-12, -12, 6, 6 * (1 - blink * 0.85), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, -12, 6, 6 * (1 - blink * 0.85), 0, 0, Math.PI * 2);
    ctx.fill();

    // mouth
    ctx.fillStyle = '#67B1AB';
    roundRect(ctx, -10, -2, 20, 6, 4);
    ctx.fill();

    // antenna
    ctx.strokeStyle = '#BFE7E1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(0, -60);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = '#FFD38A';
    ctx.arc(0, -66, 6, 0, Math.PI * 2);
    ctx.fill();

    // arms
    ctx.strokeStyle = '#D1F0EA';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-38, -8);
    ctx.lineTo(-66, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(38, -8);
    ctx.lineTo(66, 6);
    ctx.stroke();

    // little friendly badge with target number hint
    ctx.fillStyle = '#F6AE8A';
    ctx.beginPath();
    ctx.arc(-24, 14, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Mouse and touch handling
  function onMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    mouse.down = true;
    mouse.x = x;
    mouse.y = y;
    // check palette parts hit
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.placed && hitTest(x, y, p.x, p.y, p.w, p.h)) {
        dragging = { type: 'palette', index: i, offsetX: x - p.x, offsetY: y - p.y };
        selectedPaletteIndex = i;
        // visual immediate pick
        playPlaceSound();
        return;
      }
    }
    // check placed parts to remove (click a slot)
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (hitTest(x, y, s.x, s.y, s.w, s.h) && s.part) {
        // remove
        const part = parts.find(p => p.id === s.part);
        if (part) {
          part.placed = false;
          // return to palette location
          const idx = parts.findIndex(p => p.id === part.id);
          parts[idx].x = 24;
          parts[idx].y = 120 + idx * 60;
        }
        s.part = null;
        updateSum();
        playIncorrectSound(); // gentle error / undo sound
        announce(`Removed part. Current sum ${currentSum}.`);
        return;
      }
    }
    // check audio icon click
    const ax = WIDTH - AUDIO_ICON_SIZE - 18;
    const ay = 12;
    if (hitTest(x, y, ax - 6, ay - 6, AUDIO_ICON_SIZE + 12, AUDIO_ICON_SIZE + 12)) {
      toggleAudio();
      return;
    }
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    mouse.x = x;
    mouse.y = y;
    if (dragging) {
      // move part with mouse
      const p = parts[dragging.index];
      p.x = x - dragging.offsetX;
      p.y = y - dragging.offsetY;
    }
  }

  function onMouseUp(e) {
    mouse.down = false;
    if (dragging) {
      placeDraggingPart(dragging);
      dragging = null;
    }
  }

  function onCanvasHover(e) {
    // used to compute hoverSlotIndex for glow visual
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    mouse.x = x;
    mouse.y = y;
  }

  // Touch wrappers
  function onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = (t.clientX - rect.left) * (canvas.width / rect.width);
      const y = (t.clientY - rect.top) * (canvas.height / rect.height);
      mouse.down = true;
      mouse.x = x;
      mouse.y = y;
      // emulate mousedown
      onMouseDown({ clientX: t.clientX, clientY: t.clientY });
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = (t.clientX - rect.left) * (canvas.width / rect.width);
      const y = (t.clientY - rect.top) * (canvas.height / rect.height);
      // emulate mousemove
      onMouseMove({ clientX: t.clientX, clientY: t.clientY });
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    mouse.down = false;
    if (dragging) {
      placeDraggingPart(dragging);
      dragging = null;
    }
  }

  // Place a dragged part into nearest slot if valid
  function placeDraggingPart(dragInfo) {
    const p = parts[dragInfo.index];
    // check collision with any slot
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (hitTest(mouse.x, mouse.y, s.x, s.y, s.w, s.h)) {
        if (s.part) {
          // slot occupied: reject
          playIncorrectSound();
          announce(`That slot already has a part. Try another slot.`);
          // return part to original palette position
          resetPartPosition(dragInfo.index);
          return;
        } else {
          // place part
          p.placed = true;
          s.part = p.id;
          // snap part into slot
          p.x = s.x + 10;
          p.y = s.y + 6;
          updateSum();
          playPlaceSound();
          announce(`Placed ${p.value}. Current sum ${currentSum}.`);
          checkForLevelComplete();
          return;
        }
      }
    }
    // if no slot, return to palette position
    resetPartPosition(dragInfo.index);
    playIncorrectSound();
  }

  function resetPartPosition(index) {
    parts[index].x = 24;
    parts[index].y = 120 + index * 60;
  }

  function hitTest(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  // Keyboard handling
  function onKeyDown(e) {
    // ensure the canvas is focused
    // Number keys: choose part 1..n
    if (e.key >= '1' && e.key <= String(parts.length)) {
      const idx = parseInt(e.key, 10) - 1;
      if (parts[idx] && !parts[idx].placed) {
        selectedPaletteIndex = idx;
        announce(`Selected part ${parts[idx].value}. Use Enter to place in the focused slot.`);
        playPlaceSound();
      } else {
        announce('Part already used or not available.');
        playIncorrectSound();
      }
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
        focusedSlotIndex = (focusedSlotIndex + 1) % slots.length;
        announce(`Focused slot ${focusedSlotIndex + 1}.`);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        focusedSlotIndex = (focusedSlotIndex - 1 + slots.length) % slots.length;
        announce(`Focused slot ${focusedSlotIndex + 1}.`);
        e.preventDefault();
        break;
      case 'ArrowDown':
        // move focus roughly to next slot
        focusedSlotIndex = Math.min(slots.length - 1, focusedSlotIndex + 1);
        announce(`Focused slot ${focusedSlotIndex + 1}.`);
        e.preventDefault();
        break;
      case 'ArrowUp':
        focusedSlotIndex = Math.max(0, focusedSlotIndex - 1);
        announce(`Focused slot ${focusedSlotIndex + 1}.`);
        e.preventDefault();
        break;
      case 'Enter':
        // try to place selected palette item into focused slot
        const p = parts[selectedPaletteIndex];
        if (!p) {
          announce('No part selected.');
          playIncorrectSound();
        } else if (p.placed) {
          announce('Selected part is already placed. Pick another part.');
          playIncorrectSound();
        } else {
          const s = slots[focusedSlotIndex];
          if (s.part) {
            announce('Focused slot is already occupied.');
            playIncorrectSound();
          } else {
            // place
            p.placed = true;
            s.part = p.id;
            p.x = s.x + 10;
            p.y = s.y + 6;
            updateSum();
            playPlaceSound();
            announce(`Placed ${p.value}. Current sum ${currentSum}.`);
            checkForLevelComplete();
          }
        }
        e.preventDefault();
        break;
      case 'Backspace':
      case 'Delete':
        // remove from focused slot if any
        const s = slots[focusedSlotIndex];
        if (s.part) {
          const part = parts.find(p => p.id === s.part);
          if (part) {
            part.placed = false;
            part.x = 24;
            part.y = 120 + parts.findIndex(pp => pp.id === part.id) * 60;
          }
          s.part = null;
          updateSum();
          announce(`Removed part from slot ${focusedSlotIndex + 1}. Current sum ${currentSum}.`);
          playIncorrectSound();
        } else {
          announce('No part in the focused slot to remove.');
        }
        e.preventDefault();
        break;
      case 'm':
      case 'M':
        toggleAudio();
        e.preventDefault();
        break;
      case 'h':
      case 'H':
        announce('Help: choose parts using number keys and place them using Enter. Remove with Delete. You can also click and drag parts.');
        e.preventDefault();
        break;
      default:
        break;
    }
  }

  function toggleAudio() {
    if (!audioCtx) {
      // try to create audio context again (some browsers require user gesture)
      try {
        setupAudio();
        audioAllowed = true;
      } catch (err) {
        audioAllowed = false;
        showAudioDisabledMessage = true;
        announce('Audio is not available in this browser.');
        return;
      }
    } else {
      audioAllowed = !audioAllowed;
      if (!audioAllowed) {
        // mute
        if (masterGain) masterGain.gain.value = 0;
      } else {
        if (masterGain) masterGain.gain.value = 0.14;
      }
    }
    announce(audioAllowed ? 'Audio on' : 'Audio muted');
  }

  // Update current sum based on placed parts
  function updateSum() {
    let sum = 0;
    for (let s of slots) {
      if (s.part) {
        const p = parts.find(pp => pp.id === s.part);
        if (p) sum += p.value;
      }
    }
    currentSum = sum;
  }

  // Check if the level is complete or impossible
  function checkForLevelComplete() {
    if (currentSum === target) {
      // success
      score += 10 * level;
      spawnParticles(480, 180);
      playCorrectSequence();
      announce(`Great! Level ${level} complete. Score ${score}.`);
      // proceed to next after short delay
      setTimeout(() => {
        level++;
        if (level > MAX_LEVELS) {
          finished = true;
          announce(`You fixed all the machines! Final score ${score}. Press R to play again.`);
          // Offer restart via keypress - attach temporary handler
          window.addEventListener('keydown', onRestartKey);
        } else {
          prepareLevel();
        }
      }, 900);
    } else if (currentSum > target) {
      // too much
      playIncorrectSound();
      announce(`Oops! The machine is overloaded. Current sum ${currentSum}. Try removing or placing smaller parts.`);
    } else {
      // still less than target - encourage
      playPlaceSound();
    }
  }

  // Restart handler for final screen
  function onRestartKey(e) {
    if (e.key.toLowerCase() === 'r') {
      window.removeEventListener('keydown', onRestartKey);
      resetGame();
    }
  }

  // Accessibility: announce text to screen readers
  function announce(text) {
    if (!ariaLive) return;
    ariaLive.textContent = text;
    // also console log for debugging
    console.log('ANNOUNCE:', text);
  }

  // Audio: play short tone for placing parts (enhanced timbre)
  function playPlaceSound() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const carrier = audioCtx.createOscillator();
      carrier.type = 'triangle';
      carrier.frequency.value = 420 + Math.random() * 90;

      const mod = audioCtx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = 8 + Math.random() * 4;

      const modGain = audioCtx.createGain();
      modGain.gain.value = 10 + Math.random() * 20;

      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001;

      mod.connect(modGain);
      modGain.connect(carrier.frequency);

      carrier.connect(gain);
      gain.connect(masterGain);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      mod.start(now);
      carrier.start(now);
      carrier.stop(now + 0.24);
      mod.stop(now + 0.24);
    } catch (err) {
      console.warn('Place sound failed', err);
    }
  }

  // Correct sequence: small airy chime arpeggio
  function playCorrectSequence() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const base = 420;
      let t = audioCtx.currentTime;
      [0, 4, 7].forEach((step, i) => {
        const o = audioCtx.createOscillator();
        const fm = audioCtx.createOscillator();
        o.type = 'sine';
        o.frequency.value = base * Math.pow(2, step / 12);
        fm.type = 'sine';
        fm.frequency.value = 6 + i * 2;
        const fmGain = audioCtx.createGain();
        fmGain.gain.value = 6 + i * 3;
        fm.connect(fmGain);
        fmGain.connect(o.frequency);

        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(masterGain);
        const start = t + i * 0.12;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(0.09, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
        o.start(start);
        fm.start(start);
        o.stop(start + 0.16);
        fm.stop(start + 0.16);
      });
    } catch (err) {
      console.warn('Correct sound failed', err);
    }
  }

  // Incorrect short buzzer with a small downward swoop
  function playIncorrectSound() {
    if (!audioAllowed || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const f = audioCtx.createBiquadFilter();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = 300;
      f.type = 'lowpass';
      f.frequency.value = 1200;
      g.gain.value = 0.0001;
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      o.start(now);
      o.frequency.exponentialRampToValueAtTime(100, now + 0.2);
      o.stop(now + 0.32);
    } catch (err) {
      console.warn('Incorrect sound failed', err);
    }
  }

  // small beep reused (safe wrapper)
  function playBeep(freq = 440, duration = 0.12) {
    if (!audioAllowed || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      const now = audioCtx.currentTime;
      g.gain.linearRampToValueAtTime(0.06, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.start(now);
      o.stop(now + duration + 0.02);
    } catch (err) {
      console.warn('Beep failed', err);
    }
  }

  // small happy sound - short stacked beeps
  function playPlaceHappy() {
    if (!audioAllowed || !audioCtx) return;
    playBeep(520, 0.08);
    setTimeout(() => playBeep(620, 0.1), 100);
  }

  // Draw the dragging part on top so it appears above machine and UI
  function drawDraggingPart() {
    if (!dragging || dragging.type !== 'palette') return;
    const p = parts[dragging.index];
    ctx.save();
    ctx.globalAlpha = 0.98;
    const grad = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    grad.addColorStop(0, '#FFF9F2');
    grad.addColorStop(1, '#FFEBCC');
    ctx.fillStyle = grad;
    roundRect(ctx, p.x, p.y, p.w, p.h, 10);
    ctx.fill();

    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(p.x + 44, p.y + p.h / 2, 18, 0, Math.PI * 2);
    ctx.fill();

    drawText(ctx, `${p.value}`, p.x + 44, p.y + p.h / 2 + 6, 18, '#2C2C2C', 'center');
    ctx.restore();
  }

  // Particle system for celebration
  function spawnParticles(x, y) {
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 220,
        vy: (Math.random() - 1.5) * 320,
        life: 1.0,
        size: 3 + Math.random() * 6,
        color: randomConfettiColor()
      });
    }
    // play a brighter success chime
    playPlaceHappy();
  }

  function randomConfettiColor() {
    const cols = ['#FFB6A3', '#FFF2A8', '#C6F5E7', '#A6E4FF', '#E6D0FF', '#BDE8C6'];
    return cols[Math.floor(Math.random() * cols.length)];
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 360 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.9;
      p.size *= 0.996;
      if (p.life <= 0 || p.y > HEIGHT + 20) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.7, p.life * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Window load safe init
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();