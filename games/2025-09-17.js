(function () {
  // Machines Math Game - Enhanced Visuals & Audio
  // Renders into element with ID "game-of-the-day-stage".
  // Only visuals and audio are modified; game mechanics remain unchanged.

  // --- Setup container and canvas ---
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with ID "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = '720px';
  container.style.height = '480px';
  container.setAttribute('role', 'application');
  container.setAttribute('aria-label', 'Machines Math Game. Press Enter to begin.');

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.setAttribute('aria-hidden', 'false');
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Live region for accessibility
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '0';
  liveRegion.style.top = '0';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  liveRegion.style.clip = 'rect(1px, 1px, 1px, 1px)';
  container.appendChild(liveRegion);

  // Instructions box
  const instructionsBox = document.createElement('div');
  instructionsBox.style.position = 'absolute';
  instructionsBox.style.left = '8px';
  instructionsBox.style.top = '8px';
  instructionsBox.style.padding = '6px 8px';
  instructionsBox.style.background = 'rgba(255,255,255,0.88)';
  instructionsBox.style.borderRadius = '8px';
  instructionsBox.style.fontFamily = 'sans-serif';
  instructionsBox.style.fontSize = '12px';
  instructionsBox.style.color = '#222';
  instructionsBox.style.maxWidth = '340px';
  instructionsBox.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
  instructionsBox.innerHTML =
    '<strong>Machines Math</strong><br>Use ← → or A/D to move. Press Space or Enter to pick a tile. Click tiles to pick. Press M to mute/unmute audio. Press Enter to start.';
  container.appendChild(instructionsBox);

  // --- Constants & State ---
  const GAME_WIDTH = 720;
  const GAME_HEIGHT = 480;

  let running = true;
  let lastTime = 0;
  let frame = 0;

  const levels = [
    { target: 8, tiles: 4, maxNum: 9 },
    { target: 12, tiles: 4, maxNum: 12 },
    { target: 15, tiles: 5, maxNum: 15 },
    { target: 18, tiles: 5, maxNum: 20 },
    { target: 21, tiles: 6, maxNum: 20 }
  ];
  let currentLevelIndex = -1;
  let tiles = []; // {value,x,y,w,h,picked,hover,anim}
  let selectorIndex = 0;
  let picks = [];
  let attempts = 0;
  let maxAttemptsBeforeHint = 2;
  let showOverlay = true;
  let gameMessage = 'Press Enter to Start!';
  let victory = false;

  // Visual elements: floating gears and particles
  const floatingGears = [];
  for (let i = 0; i < 9; i++) {
    floatingGears.push({
      x: Math.random() * GAME_WIDTH,
      y: Math.random() * GAME_HEIGHT,
      r: 10 + Math.random() * 36,
      speed: 0.06 + Math.random() * 0.22,
      angle: Math.random() * Math.PI * 2,
      dir: Math.random() > 0.5 ? 1 : -1,
      hue: 190 + Math.random() * 60,
      alpha: 0.08 + Math.random() * 0.12
    });
  }

  const particles = []; // success particles

  // --- Audio setup using Web Audio API ---
  let audioEnabled = true;
  let audioContext = null;
  let masterGain = null;
  let ambientGain = null;
  let ambientOsc1 = null;
  let ambientOsc2 = null;
  let ambientLFO = null;
  let audioAvailable = false;
  let lastHoverSound = 0;

  function createAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Audio API not supported');
      audioContext = new AudioCtx();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.12;
      masterGain.connect(audioContext.destination);

      // Ambient pad: two oscillators slightly detuned with slow lowpass movement
      ambientGain = audioContext.createGain();
      ambientGain.gain.value = 0.25;
      const padFilter = audioContext.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 600;
      padFilter.Q.value = 0.8;

      ambientOsc1 = audioContext.createOscillator();
      ambientOsc1.type = 'sine';
      ambientOsc1.frequency.value = 110; // base
      ambientOsc2 = audioContext.createOscillator();
      ambientOsc2.type = 'sawtooth';
      ambientOsc2.frequency.value = 110.7; // slight detune

      // LFO to modulate pad filter frequency
      ambientLFO = audioContext.createOscillator();
      ambientLFO.type = 'sine';
      ambientLFO.frequency.value = 0.07;
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 300;

      ambientOsc1.connect(padFilter);
      ambientOsc2.connect(padFilter);
      padFilter.connect(ambientGain);
      ambientGain.connect(masterGain);

      ambientLFO.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      ambientOsc1.start();
      ambientOsc2.start();
      ambientLFO.start();

      audioAvailable = true;
      audioEnabled = true;
    } catch (err) {
      console.warn('Audio init failed:', err);
      audioAvailable = false;
      audioEnabled = false;
    }
  }

  createAudioContext();

  // Resume audio on user gesture if suspended
  function tryResumeAudio() {
    if (!audioContext) return;
    if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
      audioContext.resume().catch((e) => console.warn('Audio resume error', e));
    }
  }
  function ensureAudioOnUserGesture() {
    function gesture() {
      tryResumeAudio();
      window.removeEventListener('keydown', gesture);
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('touchstart', gesture);
    }
    window.addEventListener('keydown', gesture);
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('touchstart', gesture);
  }
  ensureAudioOnUserGesture();

  // Utility to play a short envelope tone
  function playTone({
    freq = 440,
    type = 'sine',
    duration = 0.18,
    volume = 0.12,
    attack = 0.008,
    release = 0.06,
    detune = 0
  }) {
    if (!audioAvailable || !audioEnabled) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(800, freq * 2);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (detune) osc.detune.value = detune;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + attack);
      gain.gain.linearRampToValueAtTime(0.0001, now + duration - release);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
      // cleanup on stop
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
          filter.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn('playTone error', e);
    }
  }

  // Specialized event sounds
  function playHover() {
    const now = Date.now();
    if (now - lastHoverSound < 220) return; // rate limit
    lastHoverSound = now;
    playTone({ freq: 520, type: 'triangle', duration: 0.08, volume: 0.03, attack: 0.002, release: 0.02 });
  }

  function playPick(value) {
    // pitch based on value but gentle
    const freq = 420 + value * 6;
    playTone({ freq, type: 'sine', duration: 0.12, volume: 0.11, attack: 0.006, release: 0.04 });
  }

  function playSuccess() {
    // small arpeggio and soft rising sweep
    playTone({ freq: 660, type: 'sine', duration: 0.18, volume: 0.12 });
    setTimeout(() => playTone({ freq: 880, type: 'triangle', duration: 0.14, volume: 0.09 }), 80);
    setTimeout(() => playTone({ freq: 1100, type: 'sine', duration: 0.12, volume: 0.06 }), 160);
    // soft sweep
    if (audioAvailable && audioEnabled) {
      try {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const filt = audioContext.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = 600;
        filt.Q.value = 8;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.5);
        osc.connect(filt);
        filt.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.55);
      } catch (e) {
        console.warn('success sweep error', e);
      }
    }
    announce('Correct! Machine powered up.');
  }

  function playFail() {
    playTone({ freq: 180, type: 'square', duration: 0.26, volume: 0.10, attack: 0.006, release: 0.04 });
    setTimeout(() => playTone({ freq: 120, type: 'square', duration: 0.16, volume: 0.07 }), 90);
    announce('Not quite. Try again.');
  }

  // --- Utility functions ---
  function announce(text) {
    try {
      liveRegion.textContent = text;
    } catch (e) {}
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // --- Level generation (unchanged logic) ---
  function generateLevel(index) {
    const def = levels[index];
    const count = def.tiles;
    const maxNum = def.maxNum;
    const target = def.target;
    const optionCount = count;

    const options = [];
    let a = randInt(1, Math.min(maxNum, target - 1));
    let b = target - a;
    if (b < 1) {
      a = 1;
      b = target - a;
    }
    options.push(a, b);

    while (options.length < optionCount) {
      let n = randInt(1, maxNum);
      if (options.includes(n) && Math.random() > 0.5) continue;
      options.push(n);
    }

    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    tiles = [];
    const beltLeft = 60;
    const beltRight = GAME_WIDTH - 60;
    const beltTop = 320;
    const availableWidth = beltRight - beltLeft;
    const tileWidth = Math.min(110, Math.floor(availableWidth / optionCount) - 10);
    for (let i = 0; i < options.length; i++) {
      const w = tileWidth;
      const h = 64;
      const spacing = (availableWidth - optionCount * w) / (optionCount - 1 || 1);
      const x = beltLeft + i * (w + spacing);
      const y = beltTop + 18 + Math.sin(i * 0.8) * 4;
      tiles.push({
        value: options[i],
        x,
        y,
        baseY: y,
        w,
        h,
        picked: false,
        hover: false,
        anim: { scale: 1, shake: 0, bounce: 0 }
      });
    }
    selectorIndex = 0;
    picks = [];
    attempts = 0;
    victory = false;
    gameMessage = `Make ${target} by selecting two tiles that add to it.`;
    announce(gameMessage);
    return { target };
  }

  let currentLevel = null;
  function startNextLevel() {
    currentLevelIndex++;
    if (currentLevelIndex >= levels.length) {
      victory = true;
      showOverlay = true;
      gameMessage = 'You fixed all the machines! Great job!';
      announce(gameMessage);
      return;
    }
    currentLevel = generateLevel(currentLevelIndex);
    showOverlay = false;
  }

  // --- Drawing helpers (canvas-only graphics) ---
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function roundedRectStroke(ctx, x, y, w, h, r) {
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }

  // Gear drawing: improved with inner teeth shading
  function drawGearPath(cx, cy, r, teeth = 10, innerRatio = 0.52) {
    ctx.beginPath();
    const outer = r;
    const inner = r * innerRatio;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
      const ax = Math.cos(a) * outer;
      const ay = Math.sin(a) * outer;
      const bx = Math.cos(a2) * inner;
      const by = Math.sin(a2) * inner;
      ctx.lineTo(cx + ax, cy + ay);
      ctx.lineTo(cx + bx, cy + by);
    }
    ctx.closePath();
  }

  // --- Particle system for success ---
  function spawnParticles(x, y, count = 24) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 2.6;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.0,
        life: 60 + Math.random() * 40,
        size: 2 + Math.random() * 3,
        hue: 150 + Math.random() * 80,
        alpha: 1
      });
    }
  }

  // --- Drawing functions ---
  function drawBackground(dt) {
    // gentle cyan-to-cream gradient
    const g = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    g.addColorStop(0, '#E9F9FF');
    g.addColorStop(1, '#FEFFF8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // subtle vignette
    ctx.save();
    const vignette = ctx.createRadialGradient(GAME_WIDTH / 2, GAME_HEIGHT / 2, 80, GAME_WIDTH / 2, GAME_HEIGHT / 2, 420);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.restore();

    // animated floating gears (soft pastel tones)
    floatingGears.forEach((gItem, idx) => {
      gItem.y -= gItem.speed * dt * 0.06;
      gItem.angle += 0.0015 * gItem.dir * dt * 0.02;
      if (gItem.y + gItem.r < -40) {
        gItem.y = GAME_HEIGHT + 40;
        gItem.x = Math.random() * GAME_WIDTH;
      }
      ctx.save();
      ctx.translate(gItem.x, gItem.y);
      ctx.rotate(gItem.angle);
      ctx.globalAlpha = gItem.alpha;
      const hue = gItem.hue;
      // gear body
      ctx.fillStyle = `hsl(${hue}, 60%, 80%)`;
      drawGearPath(0, 0, gItem.r, Math.floor(6 + (gItem.r / 6)), 0.54);
      ctx.fill();
      // inner ring with subtle shadow
      ctx.fillStyle = `hsl(${hue}, 40%, 92%)`;
      ctx.beginPath();
      ctx.arc(0, 0, gItem.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // bottom conveyor soft reflection stripes
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    for (let i = -2; i < GAME_WIDTH / 90 + 3; i++) {
      ctx.beginPath();
      ctx.ellipse(40 + i * 90 - (frame % 220) / 3, GAME_HEIGHT - 34, 90, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMachineArea() {
    const mx = GAME_WIDTH / 2;
    const my = 150;
    const mw = 480;
    const mh = 210;

    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, mx - mw / 2 + 10, my - mh / 2 + 12, mw, mh, 18);
    ctx.fill();

    // machine body gradient with soft gloss
    const bodyGrad = ctx.createLinearGradient(mx - mw / 2, my - mh / 2, mx + mw / 2, my + mh / 2);
    bodyGrad.addColorStop(0, '#FFFDF6');
    bodyGrad.addColorStop(0.6, '#EDF8FF');
    bodyGrad.addColorStop(1, '#F7FFFF');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, mx - mw / 2, my - mh / 2, mw, mh, 18);
    ctx.fill();

    // inner panel
    ctx.fillStyle = '#E6F6FB';
    roundRect(ctx, mx - mw / 2 + 14, my - mh / 2 + 16, mw - 28, mh - 32, 12);
    ctx.fill();

    // target display
    ctx.fillStyle = '#123';
    ctx.font = '700 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Target: ${currentLevel ? currentLevel.target : '-'}`, mx, my - mh / 2 + 44);

    // two slots
    const slotW = 120;
    const slotH = 74;
    const leftSlotX = mx - 110 - slotW / 2;
    const rightSlotX = mx + 110 - slotW / 2;
    const slotY = my - 8;

    // slot base
    ctx.fillStyle = '#FFF';
    roundRect(ctx, leftSlotX, slotY, slotW, slotH, 12);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    roundRect(ctx, rightSlotX, slotY, slotW, slotH, 12);
    ctx.fill();

    // subtle inset
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    roundRect(ctx, leftSlotX + 6, slotY + slotH - 12, slotW - 12, 8, 6);
    ctx.fill();
    roundRect(ctx, rightSlotX + 6, slotY + slotH - 12, slotW - 12, 8, 6);
    ctx.fill();
    ctx.restore();

    // numbers in slots or hint text
    ctx.textAlign = 'center';
    if (picks.length > 0) {
      ctx.fillStyle = '#153';
      ctx.font = '700 36px sans-serif';
      const val = tiles[picks[0]] ? tiles[picks[0]].value : '';
      ctx.fillText(val, leftSlotX + slotW / 2, slotY + slotH / 2 + 6);
    } else {
      ctx.fillStyle = '#9CA8AD';
      ctx.font = '600 16px sans-serif';
      ctx.fillText('Add first tile', leftSlotX + slotW / 2, slotY + slotH / 2 + 6);
    }
    if (picks.length > 1) {
      ctx.fillStyle = '#153';
      ctx.font = '700 36px sans-serif';
      const val = tiles[picks[1]] ? tiles[picks[1]].value : '';
      ctx.fillText(val, rightSlotX + slotW / 2, slotY + slotH / 2 + 6);
    } else {
      ctx.fillStyle = '#9CA8AD';
      ctx.font = '600 16px sans-serif';
      ctx.fillText('Add second tile', rightSlotX + slotW / 2, slotY + slotH / 2 + 6);
    }

    // power meter with animated glow when near target
    const meterX = mx + mw / 2 - 52;
    const meterY = my - mh / 2 + 20;
    const meterW = 34;
    const meterH = 120;
    ctx.fillStyle = '#F4F8F9';
    roundRect(ctx, meterX, meterY, meterW, meterH, 8);
    ctx.fill();

    let powerRatio = 0;
    if (picks.length === 2) {
      const sum = tiles[picks[0]].value + tiles[picks[1]].value;
      powerRatio = Math.max(0, Math.min(1, sum / (currentLevel.target * 1.2)));
    } else {
      powerRatio = 0.08;
    }
    const filledH = meterH * powerRatio;
    const fillY = meterY + meterH - filledH;
    // glow if close to 1
    if (powerRatio >= 0.95) {
      ctx.save();
      ctx.shadowColor = 'rgba(160,255,180,0.55)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#9FF0A2';
      roundRect(ctx, meterX + 4, fillY + 4, meterW - 8, filledH - 8, 6);
      ctx.fill();
      ctx.restore();
    } else {
      // gradient fill
      const mg = ctx.createLinearGradient(meterX, meterY + meterH, meterX, meterY);
      mg.addColorStop(0, '#F0F0F0');
      mg.addColorStop(1, '#AEE6A3');
      ctx.fillStyle = mg;
      roundRect(ctx, meterX + 4, fillY + 4, meterW - 8, Math.max(8, filledH - 8), 6);
      ctx.fill();
    }

    ctx.fillStyle = '#234';
    ctx.font = '600 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Power', meterX + meterW / 2, meterY + meterH + 18);

    ctx.restore();
  }

  function drawTiles() {
    // conveyor
    const beltX = 40;
    const beltY = 332;
    const beltW = GAME_WIDTH - 80;
    const beltH = 96;
    ctx.save();
    ctx.fillStyle = '#E7F5F9';
    roundRect(ctx, beltX, beltY, beltW, beltH, 14);
    ctx.fill();

    // moving stripes
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 7; i++) {
      const sx = beltX + ((frame * 0.9 + i * 92) % beltW) - 40;
      ctx.fillRect(sx, beltY + 10, 48, beltH - 20);
    }
    ctx.restore();

    // draw tiles with animation
    tiles.forEach((tile, i) => {
      // update tile animation
      // gentle bounce when picked or hovered
      if (tile.hover && tile.anim.scale < 1.06) tile.anim.scale += 0.03;
      else tile.anim.scale += (1 - tile.anim.scale) * 0.12;
      tile.anim.bounce *= 0.86;
      if (tile.anim.shake > 0.02) tile.anim.shake *= 0.8;
      else tile.anim.shake = 0;

      // compute display coords with scale and shake
      const cx = tile.x + tile.w / 2;
      const cy = tile.baseY + tile.h / 2 + (Math.sin((frame + i * 40) * 0.04) * 2);
      const scale = tile.anim.scale;
      const dispW = tile.w * scale;
      const dispH = tile.h * scale;
      const x = cx - dispW / 2 + (tile.anim.shake ? (Math.sin(frame * 0.6 + i) * tile.anim.shake) : 0);
      const y = cy - dispH / 2;
      // shadow
      ctx.save();
      ctx.globalAlpha = 0.12;
      roundRect(ctx, x + 6, y + 8, dispW, dispH, 12);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();

      // tile body color palette
      ctx.save();
      const hue = 190 + (i * 30) % 120;
      const light = tile.picked ? 96 : 72;
      ctx.fillStyle = `hsl(${hue}, 62%, ${light}%)`;
      roundRect(ctx, x, y, dispW, dispH, 12);
      ctx.fill();

      // highlight when hovered/selected
      const isSelected = selectorIndex === i;
      if (isSelected || tile.hover) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,220,140,0.12)';
        roundRect(ctx, x - 2, y - 2, dispW + 4, dispH + 4, 14);
        ctx.fill();
        ctx.restore();
      }

      // border
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      roundedRectStroke(ctx, x, y, dispW, dispH, 12);

      // number
      ctx.fillStyle = tile.picked ? '#8A96A0' : '#0B2A2D';
      ctx.font = tile.picked ? '600 22px sans-serif' : '700 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tile.value, x + dispW / 2, y + dispH / 2);

      // small machine emblem
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(x + 18, y + 18 + Math.sin((frame + i * 30) * 0.05) * 1.5, 9 + Math.sin((frame + i * 40) * 0.03) * 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    ctx.restore();
  }

  function drawSelector() {
    const tile = tiles[selectorIndex];
    if (!tile) return;
    // wrench pointer
    const x = tile.x + tile.w / 2;
    const y = tile.baseY - 26;
    ctx.save();
    // shaft
    ctx.strokeStyle = '#2E3B40';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 42, y + 22 + Math.sin(frame * 0.06) * 1.6);
    ctx.lineTo(x, y);
    ctx.stroke();

    // head
    ctx.fillStyle = '#4A5A60';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Grab', x, y + 4);

    // keyboard focus ring
    ctx.strokeStyle = 'rgba(72, 156, 255, 0.95)';
    ctx.lineWidth = 3;
    roundedRectStroke(ctx, tile.x - 6, tile.baseY - 6, tile.w + 12, tile.h + 12, 14);

    ctx.restore();
  }

  function drawHUD() {
    // top right info box
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, GAME_WIDTH - 206, 12, 194, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#24353B';
    ctx.font = '600 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${Math.min(currentLevelIndex + 1, levels.length)}/${levels.length}`, GAME_WIDTH - 190, 32);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6A7A80';
    ctx.fillText(`Attempts: ${attempts}`, GAME_WIDTH - 16, 32);

    // audio icon
    const sx = GAME_WIDTH - 58;
    const sy = 18;
    ctx.fillStyle = audioEnabled ? '#38A169' : '#E05B5B';
    // speaker base
    roundRect(ctx, sx, sy, 14, 12, 2);
    ctx.fill();
    // cone
    ctx.beginPath();
    ctx.moveTo(sx + 14, sy);
    ctx.lineTo(sx + 22, sy + 6);
    ctx.lineTo(sx + 14, sy + 12);
    ctx.closePath();
    ctx.fill();
    if (!audioEnabled) {
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy + 2);
      ctx.lineTo(sx + 30, sy + 12);
      ctx.stroke();
    }
    ctx.restore();

    // bottom message panel
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, 12, GAME_HEIGHT - 68, 380, 56, 10);
    ctx.fill();
    ctx.fillStyle = '#21343B';
    ctx.font = '600 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(gameMessage, 24, GAME_HEIGHT - 38);
    ctx.restore();
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06; // gravity
      p.life -= 1;
      p.alpha = Math.max(0, p.life / 120);
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.alpha * 0.95;
      ctx.fillStyle = `hsl(${p.hue}, 70%, 60%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawOverlay() {
    if (!showOverlay) return;
    ctx.save();
    ctx.fillStyle = 'rgba(12,22,28,0.6)';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // panel
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, GAME_WIDTH / 2 - 270, GAME_HEIGHT / 2 - 94, 540, 188, 14);
    ctx.fill();

    ctx.fillStyle = '#1F3A44';
    ctx.font = '700 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(victory ? 'Machine Master!' : 'Machines Math', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 44);

    ctx.font = '600 16px sans-serif';
    ctx.fillStyle = '#2B3A42';
    ctx.fillText(gameMessage, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 12);

    ctx.font = '600 13px sans-serif';
    ctx.fillStyle = '#445A62';
    ctx.fillText('Controls: ← → / A D to move, Space or Enter to pick, Click to pick tiles, M to mute', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 18);

    // start button
    ctx.fillStyle = '#78D4BF';
    roundRect(ctx, GAME_WIDTH / 2 - 86, GAME_HEIGHT / 2 + 36, 172, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#053A35';
    ctx.font = '700 16px sans-serif';
    ctx.fillText(victory ? 'Play Again' : 'Start', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 62);

    ctx.restore();
  }

  // --- Game interactions & logic (preserved) ---
  function pickTile(index) {
    if (!tiles[index] || tiles[index].picked) return;
    tiles[index].picked = true;
    picks.push(index);
    // visual bounce
    tiles[index].anim.bounce = 1.4;
    // play pick sound
    playPick(tiles[index].value);
    announce(`Picked ${tiles[index].value}`);

    if (picks.length === 2) {
      attempts++;
      const val1 = tiles[picks[0]].value;
      const val2 = tiles[picks[1]].value;
      const sum = val1 + val2;
      if (sum === currentLevel.target) {
        // correct
        playSuccess();
        // spawn particles near machine
        const mx = GAME_WIDTH / 2;
        const my = 150;
        spawnParticles(mx, my + 10, 36);
        setTimeout(() => {
          if (currentLevelIndex + 1 >= levels.length) {
            victory = true;
            showOverlay = true;
            gameMessage = 'You fixed all the machines! Great job!';
            announce(gameMessage);
          } else {
            gameMessage = 'Great! Machine repaired. Next machine incoming...';
            announce(gameMessage);
            setTimeout(() => {
              startNextLevel();
            }, 900);
          }
        }, 220);
      } else {
        // incorrect
        playFail();
        gameMessage = `Oops! ${val1} + ${val2} = ${sum}. Try again.`;
        announce(gameMessage);
        // shake animation
        tiles[picks[0]].anim.shake = 3.4;
        tiles[picks[1]].anim.shake = 3.4;
        setTimeout(() => {
          // put tiles back
          picks.forEach((pi) => {
            if (tiles[pi]) tiles[pi].picked = false;
          });
          picks = [];
          if (attempts >= maxAttemptsBeforeHint) {
            const hint = findHint(currentLevel.target, tiles.map((t) => t.value));
            if (hint) {
              gameMessage = `Hint: Try ${hint[0]} and ${hint[1]}.`;
              announce(gameMessage);
            } else {
              gameMessage = 'No matching pair among the tiles. Try different combination.';
              announce(gameMessage);
            }
          }
        }, 700);
      }
    }
  }

  function findHint(target, values) {
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        if (values[i] + values[j] === target) return [values[i], values[j]];
      }
    }
    return null;
  }

  function resetGame() {
    currentLevelIndex = -1;
    victory = false;
    startNextLevel();
  }

  // --- Input handling ---
  window.addEventListener('keydown', (e) => {
    if (!running) return;
    const key = e.key;
    if (showOverlay) {
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        if (victory) {
          resetGame();
        } else {
          startNextLevel();
        }
        tryResumeAudio();
        return;
      }
    }
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      selectorIndex = Math.max(0, selectorIndex - 1);
      announce(`Selected tile ${selectorIndex + 1}`);
    } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      selectorIndex = Math.min(tiles.length - 1, selectorIndex + 1);
      announce(`Selected tile ${selectorIndex + 1}`);
    } else if (key === ' ' || key === 'Enter') {
      e.preventDefault();
      pickTile(selectorIndex);
    } else if (/^[1-9]$/.test(key)) {
      const idx = parseInt(key, 10) - 1;
      if (tiles[idx]) {
        selectorIndex = idx;
        pickTile(idx);
      }
    } else if (key === 'm' || key === 'M') {
      audioEnabled = !audioEnabled;
      announce(audioEnabled ? 'Audio on' : 'Audio muted');
    } else if (key === 'Escape') {
      showOverlay = true;
      gameMessage = 'Paused. Press Enter to continue.';
      announce(gameMessage);
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    tiles.forEach((t, i) => {
      const over = mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h;
      if (over && !t.hover) {
        playHover();
      }
      t.hover = over;
      if (over) selectorIndex = i;
    });
  });
  canvas.addEventListener('mouseleave', () => {
    tiles.forEach((t) => (t.hover = false));
  });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (showOverlay) {
      const bx = GAME_WIDTH / 2 - 86;
      const by = GAME_HEIGHT / 2 + 36;
      const bw = 172;
      const bh = 40;
      if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
        if (victory) resetGame();
        else startNextLevel();
        tryResumeAudio();
      }
      return;
    }
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) {
        selectorIndex = i;
        pickTile(i);
        break;
      }
    }
    // audio icon click area
    const sx = GAME_WIDTH - 58;
    const sy = 18;
    if (mx >= sx - 6 && mx <= sx + 36 && my >= sy - 6 && my <= sy + 20) {
      audioEnabled = !audioEnabled;
      announce(audioEnabled ? 'Audio on' : 'Audio muted');
    }
  });

  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        canvas.dispatchEvent(new MouseEvent('click', { clientX: t.clientX, clientY: t.clientY }));
      }
      e.preventDefault();
    },
    { passive: false }
  );

  // --- Main loop ---
  function render(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    frame++;

    try {
      // clear and draw
      drawBackground(dt);
      if (!currentLevel) {
        // welcome placeholder
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        roundRect(ctx, GAME_WIDTH / 2 - 240, 72, 480, 220, 16);
        ctx.fill();
        ctx.fillStyle = '#152B30';
        ctx.font = '700 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Welcome to the Machine Lab', GAME_WIDTH / 2, 140);
        ctx.font = '600 16px sans-serif';
        ctx.fillStyle = '#3A555B';
        ctx.fillText('Solve puzzles to power the machines. Press Enter to begin.', GAME_WIDTH / 2, 180);
        ctx.restore();
      } else {
        drawMachineArea();
        drawTiles();
        drawSelector();
      }
      drawParticles();
      drawHUD();
      drawOverlay();
    } catch (err) {
      console.error('Render error', err);
      ctx.save();
      ctx.fillStyle = '#FDECEC';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = '#C62828';
      ctx.font = '700 16px sans-serif';
      ctx.fillText('Rendering error. Please reload the page.', 20, 60);
      ctx.restore();
      running = false;
    }

    if (running) requestAnimationFrame(render);
  }

  // Start
  showOverlay = true;
  gameMessage = 'Press Enter to Start!';
  requestAnimationFrame(render);

  // Accessibility & focus
  canvas.tabIndex = 0;
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('focus', () => announce('Canvas focused. Use arrow keys to play.'));
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (e) {}
  }, 500);

  // Initialize first level safely
  resetGame();

  if (!audioAvailable) {
    announce('Audio unavailable. Game will play without sound.');
  }
})();