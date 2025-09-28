(function () {
  // Machine Math - Enhanced Visuals & Audio (only visuals/audio updated)
  'use strict';

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const MAX_LEVEL = 5;

  // Utility helpers
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Find container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container element with ID "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = WIDTH + 'px';
  container.style.height = HEIGHT + 'px';
  container.style.outline = 'none';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Machine Math game. Use mouse or keyboard to place gears to make the target number.'
  );
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Live region
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'assertive');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  container.appendChild(liveRegion);

  // Audio setup with robust error handling and richer background
  let audioCtx = null;
  let audioEnabled = false;
  let bgGain = null;
  let bgOsc1 = null;
  let bgOsc2 = null;
  let bgLfo = null;
  let masterGain = null;

  function initAudio() {
    if (audioCtx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported');
      audioCtx = new AC();

      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioCtx.destination);

      // Gentle layered background: two slow drones with lowpass
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.0;
      bgGain.connect(masterGain);

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      lp.Q.value = 0.7;
      lp.connect(bgGain);

      bgOsc1 = audioCtx.createOscillator();
      bgOsc1.type = 'sine';
      bgOsc1.frequency.value = 78.0; // low drone

      bgOsc2 = audioCtx.createOscillator();
      bgOsc2.type = 'triangle';
      bgOsc2.frequency.value = 132.0; // higher harmonic

      // slow LFO to gently pulse the background gain
      bgLfo = audioCtx.createOscillator();
      bgLfo.type = 'sine';
      bgLfo.frequency.value = 0.18;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.035; // modest modulation
      bgLfo.connect(lfoGain);
      lfoGain.connect(bgGain.gain);

      const bgMerger = audioCtx.createGain();
      bgMerger.gain.value = 0.5;
      bgOsc1.connect(bgMerger);
      bgOsc2.connect(bgMerger);
      bgMerger.connect(lp);

      bgOsc1.start();
      bgOsc2.start();
      bgLfo.start();

      audioEnabled = true;
      return true;
    } catch (e) {
      console.warn('Audio unavailable:', e);
      audioEnabled = false;
      audioCtx = null;
      return false;
    }
  }

  function resumeAudioOnGesture() {
    if (!initAudio()) return false;
    if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
      audioCtx
        .resume()
        .then(() => {
          startBackgroundHum();
        })
        .catch((err) => {
          console.warn('Audio resume error', err);
        });
    } else {
      startBackgroundHum();
    }
    return true;
  }

  function startBackgroundHum() {
    if (!audioEnabled || !audioCtx || !bgGain) return;
    try {
      const now = audioCtx.currentTime;
      // ramp to gentle volume
      bgGain.gain.cancelScheduledValues(now);
      bgGain.gain.setValueAtTime(bgGain.gain.value, now);
      bgGain.gain.linearRampToValueAtTime(0.07, now + 1.2);
    } catch (e) {
      console.warn('startBackgroundHum error', e);
    }
  }

  function stopBackgroundHum() {
    if (!audioEnabled || !audioCtx || !bgGain) return;
    try {
      const now = audioCtx.currentTime;
      bgGain.gain.cancelScheduledValues(now);
      bgGain.gain.setValueAtTime(bgGain.gain.value, now);
      bgGain.gain.linearRampToValueAtTime(0.0, now + 0.9);
    } catch (e) {
      console.warn('stopBackgroundHum error', e);
    }
  }

  // Sound utilities: create short percussive envelope
  function playTone({
    frequency = 440,
    duration = 0.2,
    type = 'sine',
    volume = 0.12,
    attack = 0.005,
    release = 0.05,
    detune = 0,
    filterFreq = 1200
  } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      osc.type = type;
      osc.frequency.value = frequency;
      if (detune) osc.detune.value = detune;
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + release + 0.02);
    } catch (e) {
      console.warn('playTone error', e);
    }
  }

  // Click: bright but brief
  function playClickSound() {
    if (!audioEnabled) return;
    playTone({ frequency: 1100, type: 'square', duration: 0.06, volume: 0.06, filterFreq: 3000 });
    // slight upper harmonic
    setTimeout(
      () =>
        playTone({ frequency: 1600, type: 'sine', duration: 0.05, volume: 0.035, filterFreq: 2600 }),
      28
    );
  }

  // Incorrect: low soft thud with subtle noise
  function playIncorrectSound() {
    if (!audioEnabled) return;
    playTone({ frequency: 90, type: 'sawtooth', duration: 0.28, volume: 0.12, filterFreq: 600 });
  }

  // Correct: warm chord + gentle bell cascade
  function playCorrectSound() {
    if (!audioEnabled) return;
    // chord
    playTone({ frequency: 392, type: 'sine', duration: 0.36, volume: 0.06, filterFreq: 1200 });
    playTone({
      frequency: 524,
      type: 'sine',
      duration: 0.36,
      volume: 0.05,
      filterFreq: 1200,
      detune: 12
    });
    playTone({
      frequency: 660,
      type: 'triangle',
      duration: 0.36,
      volume: 0.045,
      filterFreq: 1200,
      detune: -8
    });
    // bell cascade
    setTimeout(
      () => playTone({ frequency: 880, type: 'sine', duration: 0.12, volume: 0.06, filterFreq: 3000 }),
      160
    );
    setTimeout(
      () => playTone({ frequency: 1100, type: 'sine', duration: 0.12, volume: 0.055, filterFreq: 3200 }),
      260
    );
    // light click to end
    setTimeout(() => playClickSound(), 420);
  }

  // Game state & levels
  let levelIndex = 0;
  const levels = [
    { target: 7, slots: 2, cogs: [2, 5, 3, 1] },
    { target: 10, slots: 2, cogs: [4, 6, 3, 2] },
    { target: 12, slots: 3, cogs: [5, 4, 3, 2, 1] },
    { target: 15, slots: 3, cogs: [7, 5, 3, 2] },
    { target: 9, slots: 2, cogs: [1, 8, 4, 2] }
  ];

  // Cogs / Slots classes (mechanics preserved)
  class Cog {
    constructor(id, value, x, y) {
      this.id = id;
      this.value = value;
      this.x = x;
      this.y = y;
      this.radius = 34;
      this.rotation = Math.random() * Math.PI * 2;
      this.isDragging = false;
      this.placedSlot = null;
      this.offset = { x: 0, y: 0 };
      this.hover = false;
      this.vx = 0;
      this.vy = 0;
      this.shake = 0;
    }
  }

  class Slot {
    constructor(id, x, y) {
      this.id = id;
      this.x = x;
      this.y = y;
      this.radius = 40;
      this.filledBy = null;
    }
  }

  let cogs = [];
  let slots = [];
  let selectedCog = null;
  let hoveredCog = null;
  let isPointerDown = false;
  let pointerPos = { x: 0, y: 0 };
  let message =
    'Click or press S to enable sound. Drag gears into machine slots to reach the target. Use keyboard: Tab to select, arrows to move, Enter to pick/place, Space to test.';
  updateLiveRegion(message);

  // Particles for gentle feedback (visual only)
  const particles = [];
  function emitParticles(x, y, count = 12, palette = ['#FFD27A', '#9EE8FF', '#FFC8DD']) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 80;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0,
        ttl: 1.2 + Math.random() * 0.8,
        size: 4 + Math.random() * 6,
        color: palette[Math.floor(Math.random() * palette.length)],
        rotate: Math.random() * Math.PI * 2,
        drot: (Math.random() - 0.5) * 6
      });
    }
  }

  // Initialize level
  function setupLevel(index) {
    levelIndex = clamp(index, 0, levels.length - 1);
    const level = levels[levelIndex];
    cogs = [];
    slots = [];
    selectedCog = null;
    hoveredCog = null;
    // Place slots on machine area (right side)
    const slotAreaX = WIDTH * 0.68;
    const slotYStart = HEIGHT * 0.34;
    const slotSpacing = 92;
    for (let i = 0; i < level.slots; i++) {
      const sx = slotAreaX;
      const sy = slotYStart + i * slotSpacing;
      slots.push(new Slot(i, sx, sy));
    }
    // Shuffle cog positions on left
    const startX = WIDTH * 0.16;
    const startY = HEIGHT * 0.22;
    const gapX = 120;
    const gapY = 120;
    for (let i = 0; i < level.cogs.length; i++) {
      const v = level.cogs[i];
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = startX + col * gapX + (Math.random() * 18 - 9);
      const y = startY + row * gapY + (Math.random() * 14 - 7);
      cogs.push(new Cog('c' + i, v, x, y));
    }
    message = `Level ${levelIndex + 1} - Make ${level.target}. Place ${level.slots} gears into slots.`;
    updateLiveRegion(message);
    render();
  }

  // Check win (mechanics preserved)
  function checkSolution() {
    const level = levels[levelIndex];
    let sum = 0;
    for (const s of slots) {
      if (!s.filledBy) {
        return false;
      }
      sum += s.filledBy.value;
    }
    if (sum === level.target) {
      playCorrectSound();
      // gentle particles around slots
      for (const s of slots) {
        emitParticles(s.x, s.y - 6, 16, ['#FFD27A', '#9EE8FF', '#C8FFC8']);
      }
      message = `Nice! You made ${level.target}.`;
      updateLiveRegion(message);
      setTimeout(() => {
        levelIndex++;
        if (levelIndex >= levels.length) {
          message = 'You fixed all the wacky machines! Great job!';
          updateLiveRegion(message);
          renderVictory();
        } else {
          setupLevel(levelIndex);
        }
      }, 900);
      return true;
    } else {
      playIncorrectSound();
      // small shake of placed cogs
      for (const s of slots) {
        if (s.filledBy) {
          s.filledBy.shake = 6;
        }
      }
      // soft particle puff at machine center
      emitParticles(WIDTH * 0.56, HEIGHT * 0.48, 8, ['#FFD6D6', '#FFF3C8']);
      message = `That makes ${sum}. Try again to make ${level.target}.`;
      updateLiveRegion(message);
      return false;
    }
  }

  // Place/remove logic (preserve)
  function tryPlaceCogInSlot(cog, slot) {
    if (!cog || !slot) return false;
    if (slot.filledBy && slot.filledBy !== cog) {
      return false;
    }
    for (const s of slots) {
      if (s.filledBy === cog) s.filledBy = null;
    }
    cog.x = slot.x;
    cog.y = slot.y;
    cog.placedSlot = slot;
    slot.filledBy = cog;
    playClickSound();
    return true;
  }

  function removeCogFromSlot(cog) {
    if (!cog) return;
    if (cog.placedSlot) {
      cog.placedSlot.filledBy = null;
      cog.placedSlot = null;
    }
  }

  // Pointer input
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  function pointerDown(e) {
    try {
      resumeAudioOnGesture();
    } catch (err) {
      console.warn('Audio resume on gesture error', err);
    }
    e.preventDefault();
    isPointerDown = true;
    const p = getPointerPos(e);
    pointerPos = p;
    let hit = null;
    for (let i = cogs.length - 1; i >= 0; i--) {
      const c = cogs[i];
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (Math.hypot(dx, dy) <= c.radius + 6) {
        hit = c;
        break;
      }
    }
    if (hit) {
      const idx = cogs.indexOf(hit);
      if (idx >= 0) {
        cogs.splice(idx, 1);
        cogs.push(hit);
      }
      selectedCog = hit;
      hit.isDragging = true;
      hit.offset.x = p.x - hit.x;
      hit.offset.y = p.y - hit.y;
      removeCogFromSlot(hit);
      playClickSound();
      updateLiveRegion(
        `Picked up gear ${hit.value}. Use mouse or arrow keys to move it, press Enter to place in a slot.`
      );
    } else {
      for (const s of slots) {
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        if (Math.hypot(dx, dy) <= s.radius + 6) {
          if (s.filledBy) {
            selectedCog = s.filledBy;
            removeCogFromSlot(selectedCog);
            selectedCog.isDragging = true;
            selectedCog.offset.x = 0;
            selectedCog.offset.y = 0;
            playClickSound();
            updateLiveRegion(`Removed gear ${selectedCog.value} from slot.`);
            break;
          }
        }
      }
    }
    render();
  }

  function pointerMove(e) {
    if (!isPointerDown) {
      const p = getPointerPos(e);
      let hover = null;
      for (let i = cogs.length - 1; i >= 0; i--) {
        const c = cogs[i];
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        if (Math.hypot(dx, dy) <= c.radius + 6) {
          hover = c;
          break;
        }
      }
      hoveredCog = hover;
      render();
      return;
    }
    const p = getPointerPos(e);
    pointerPos = p;
    if (selectedCog && selectedCog.isDragging) {
      selectedCog.x = p.x - selectedCog.offset.x;
      selectedCog.y = p.y - selectedCog.offset.y;
      render();
    }
  }

  function pointerUp(e) {
    isPointerDown = false;
    const p = getPointerPos(e);
    if (selectedCog && selectedCog.isDragging) {
      let placed = false;
      for (const s of slots) {
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        if (Math.hypot(dx, dy) <= s.radius + 16) {
          if (!s.filledBy || s.filledBy === selectedCog) {
            tryPlaceCogInSlot(selectedCog, s);
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        selectedCog.isDragging = false;
        selectedCog.placedSlot = null;
      } else {
        selectedCog.isDragging = false;
      }
      playClickSound();
    }
    selectedCog = null;
    render();
  }

  // Keyboard
  function keyDown(e) {
    if (e.key === 's' || e.key === 'S') {
      const ok = resumeAudioOnGesture();
      if (ok) {
        message = 'Sound enabled.';
        updateLiveRegion(message);
      } else {
        message = 'Sound unavailable in this browser.';
        updateLiveRegion(message);
      }
      render();
      e.preventDefault();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (cogs.length === 0) return;
      const idx = selectedCog ? cogs.indexOf(selectedCog) : -1;
      const next = (idx + 1) % cogs.length;
      selectedCog = cogs[next];
      const sc = cogs.splice(next, 1)[0];
      cogs.push(sc);
      sc.isDragging = false;
      message = `Selected gear ${sc.value}. Use arrow keys to move. Enter to pick/place.`;
      updateLiveRegion(message);
      render();
      return;
    }
    if (!selectedCog) return;
    let moved = false;
    if (e.key === 'ArrowLeft') {
      selectedCog.x -= 8;
      moved = true;
    } else if (e.key === 'ArrowRight') {
      selectedCog.x += 8;
      moved = true;
    } else if (e.key === 'ArrowUp') {
      selectedCog.y -= 8;
      moved = true;
    } else if (e.key === 'ArrowDown') {
      selectedCog.y += 8;
      moved = true;
    } else if (e.key === 'Enter') {
      let placed = false;
      for (const s of slots) {
        const dx = selectedCog.x - s.x;
        const dy = selectedCog.y - s.y;
        if (Math.hypot(dx, dy) <= s.radius + 12) {
          tryPlaceCogInSlot(selectedCog, s);
          placed = true;
          break;
        }
      }
      if (!placed) {
        removeCogFromSlot(selectedCog);
      }
      playClickSound();
      message = `Gear ${selectedCog.value} placed/adjusted.`;
      updateLiveRegion(message);
      render();
    } else if (e.key === ' ') {
      e.preventDefault();
      checkSolution();
      render();
    } else if (e.key === 'r' || e.key === 'R') {
      setupLevel(levelIndex);
      message = 'Level reset.';
      updateLiveRegion(message);
    }
    if (moved) {
      selectedCog.x = clamp(selectedCog.x, 20, WIDTH - 20);
      selectedCog.y = clamp(selectedCog.y, 20, HEIGHT - 20);
      render();
    }
  }

  // Drawing helpers and enhanced visuals
  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // Background with soft clouds and subtle parallax
  let cloudSeed = 0.5;
  function drawBackground(elapsed) {
    // vertical gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#F7FBFF');
    g.addColorStop(0.6, '#E7F9FF');
    g.addColorStop(1, '#EAFBF7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft grid behind machine (subtle)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#8FB9D9';
    ctx.lineWidth = 1;
    for (let x = 40; x < WIDTH; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 30; y < HEIGHT; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();

    // clouds - procedural soft shapes
    ctx.save();
    ctx.globalAlpha = 0.85;
    const cloudCount = 4;
    for (let i = 0; i < cloudCount; i++) {
      const cx = (i * 200 + (elapsed * 0.02) % 200) % (WIDTH + 200) - 100;
      const cy = 50 + i * 26 + Math.sin(elapsed * 0.001 + i) * 8;
      drawCloud(cx, cy, 140 + i * 8, 40 + i * 6);
    }
    ctx.restore();
  }

  function drawCloud(cx, cy, w, h) {
    ctx.beginPath();
    ctx.fillStyle = '#FFFFFF';
    ctx.ellipse(cx - w * 0.3, cy, h * 0.8, h * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy - h * 0.12, h * 1.1, h * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.28, cy, h * 0.9, h * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Robot helper character drawn from canvas primitives
  const robot = {
    x: 340,
    y: 250,
    eyeOffset: 0,
    bob: 0
  };

  function drawRobot(t) {
    // bobbing
    robot.bob = Math.sin(t / 900) * 4;
    robot.eyeOffset = Math.sin(t / 450) * 2;

    const x = robot.x;
    const y = robot.y + robot.bob;

    // body shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(20,35,50,0.08)';
    ctx.ellipse(x, y + 66, 80, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#E9F6FF';
    drawRoundedRect(-64, -44, 128, 110, 12);
    ctx.fillStyle = '#CFEFFF';
    drawRoundedRect(-56, -36, 112, 90, 10);
    // chest plate
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(-32, -8, 64, 46, 8);
    ctx.fillStyle = '#DFF7FF';
    ctx.fillRect(-30, -4, 60, 12);
    // eyes
    ctx.fillStyle = '#2E4A5A';
    ctx.beginPath();
    ctx.ellipse(-18 + robot.eyeOffset, -18, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(18 + robot.eyeOffset, -18, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // pupils
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-16 + robot.eyeOffset, -20, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(20 + robot.eyeOffset, -20, 3, 0, Math.PI * 2);
    ctx.fill();

    // antenna
    ctx.beginPath();
    ctx.strokeStyle = '#BFE9FF';
    ctx.lineWidth = 3;
    ctx.moveTo(24, -44);
    ctx.lineTo(36, -64);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = '#FFDB66';
    ctx.arc(36, -64, 6, 0, Math.PI * 2);
    ctx.fill();

    // smile
    ctx.beginPath();
    ctx.strokeStyle = '#72A4B8';
    ctx.lineWidth = 2;
    ctx.arc(0, -6, 14, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  // Draw machine panel and decorative elements
  function drawMachinePanel() {
    // Control box
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(420, 36, 272, 160, 12);
    ctx.fillStyle = '#E6F8FF';
    drawRoundedRect(428, 44, 256, 144, 10);

    // meters
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(560, 98, 28, Math.PI * 0.9, Math.PI * 0.1, false);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#E2F3FF';
    ctx.stroke();

    // small decorative screws
    for (let i = 0; i < 6; i++) {
      drawBolt(444 + i * 40, 168, 5, '#DFF0FF', '#A9C7D9');
    }
    ctx.restore();
  }

  function drawBolt(cx, cy, radius, fill, stroke) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const rx = cx + Math.cos(angle) * radius;
      const ry = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF';
    ctx.fill();
  }

  // Draw slots with nicer styling
  function drawSlots() {
    for (const s of slots) {
      // glow
      ctx.save();
      const grad = ctx.createRadialGradient(s.x, s.y, s.radius * 0.2, s.x, s.y, s.radius + 22);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.6, 'rgba(255,240,210,0.45)');
      grad.addColorStop(1, 'rgba(200,230,255,0.06)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // slot base
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 8, 0, Math.PI * 2);
      ctx.fillStyle = '#F4FBFF';
      ctx.fill();

      // slot lip
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#CDEFFF';
      ctx.stroke();

      // small marker
      ctx.fillStyle = '#A7D1FF';
      ctx.font = '13px Verdana, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('slot', s.x, s.y - s.radius - 10);

      if (s.filledBy) {
        // little latch graphic
        ctx.beginPath();
        ctx.fillStyle = '#E8FBFF';
        ctx.roundRect
          ? ctx.roundRect(s.x - 26, s.y + s.radius - 6, 52, 10, 4)
          : drawRoundedRect(s.x - 26, s.y + s.radius - 6, 52, 10, 4);
        ctx.fill();
      }
    }
  }

  // draw cog with more polished look
  function drawCog(cog, t) {
    const cx = cog.x;
    const cy = cog.y;
    const r = cog.radius;

    // shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy + 8 + Math.abs(Math.sin(t / 800)) * 2, r * 1.05, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,30,40,0.08)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cog.rotation);

    // gear teeth - layered coloring
    const teeth = 12;
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const tx = Math.cos(angle);
      const ty = Math.sin(angle);
      ctx.beginPath();
      const toothOuter = r + 8;
      ctx.moveTo(tx * (r + 2), ty * (r + 2));
      ctx.lineTo(tx * toothOuter, ty * toothOuter);
      ctx.lineTo(Math.cos(angle + 0.08) * (r + 2), Math.sin(angle + 0.08) * (r + 2));
      ctx.closePath();
      ctx.fillStyle = '#FFF1DF';
      ctx.fill();
    }

    // main circle with subtle gradient
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r);
    grad.addColorStop(0, '#FFFDF6');
    grad.addColorStop(1, '#FFE8B8');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#E7C98A';
    ctx.stroke();

    // center cylinder
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF6E0';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#EAD9B0';
    ctx.stroke();

    // number
    ctx.fillStyle = '#5B3F17';
    ctx.font = 'bold 22px Verdana, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(cog.value), 0, 0);

    // small metallic highlights
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.36, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    // focus/hover ring
    if (cog === selectedCog) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#64B9FF';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (cog.hover || cog.shake > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#BEEBFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  // message box and UI
  function drawUIPanel() {
    // top-left target panel
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(28, 16, 340, 92, 12);
    ctx.fillStyle = '#FFF8F1';
    drawRoundedRect(34, 22, 328, 80, 10);

    ctx.fillStyle = '#2E5362';
    ctx.font = '18px Verdana, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Machine Math Lab', 56, 44);

    ctx.font = '30px Verdana, Arial';
    ctx.fillStyle = '#2E4A5A';
    ctx.fillText('Target: ' + levels[levelIndex].target, 56, 84);

    // sound indicator toggles
    ctx.fillStyle = '#FFFFFF';
    drawRoundedRect(560, 16, 140, 36, 8);
    ctx.fillStyle = audioEnabled ? '#E7FFF0' : '#FFF1F1';
    drawRoundedRect(564, 20, 132, 30, 6);
    ctx.fillStyle = audioEnabled ? '#0B6B28' : '#9F2B2B';
    ctx.font = '13px Verdana, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(audioEnabled ? 'Sound: ON (S)' : 'Sound: OFF (S)', 640, 42);

    // controls hint
    ctx.fillStyle = '#61707A';
    ctx.font = '12px Verdana, Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Drag or keyboard. Space to test. R to reset.', 56, 104);

    ctx.restore();
  }

  // text wrapping
  function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line.trim(), x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    context.fillText(line.trim(), x, y);
  }

  // Victory rendering with animated confetti gears
  let victoryParticles = [];
  function renderVictory() {
    // stop background hum softly
    stopBackgroundHum();

    // prepare victory particle burst
    victoryParticles = [];
    for (let i = 0; i < 32; i++) {
      const px = WIDTH / 2 + (Math.random() - 0.5) * 160;
      const py = HEIGHT / 2 + (Math.random() - 0.5) * 80;
      victoryParticles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.9) * 160 - 40,
        size: 6 + Math.random() * 10,
        color: ['#FFD27A', '#C8F2FF', '#FFC8DD'][Math.floor(Math.random() * 3)],
        life: 0,
        ttl: 2.6,
        rot: Math.random() * Math.PI * 2,
        drot: (Math.random() - 0.5) * 6
      });
    }

    // animate victory screen for a bit
    let start = performance.now();
    function victoryAnim(now) {
      const elapsed = (now - start) / 1000;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      grad.addColorStop(0, '#FFF7E9');
      grad.addColorStop(1, '#E9FFF3');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = '#225E6A';
      ctx.font = 'bold 36px Verdana, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('You fixed all the machines!', WIDTH / 2, HEIGHT / 2 - 30);
      ctx.font = '20px Verdana, Arial';
      ctx.fillText('Thanks for playing — Great job!', WIDTH / 2, HEIGHT / 2 + 8);

      // draw and update particles
      for (let i = victoryParticles.length - 1; i >= 0; i--) {
        const p = victoryParticles[i];
        p.life += 1 / 60;
        p.x += p.vx * (1 / 60);
        p.y += p.vy * (1 / 60);
        p.vy += 160 * (1 / 60); // gravity
        p.rot += p.drot * (1 / 60);

        // draw small gear shape
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          ctx.lineTo(Math.cos(ang) * (p.size + 2), Math.sin(ang) * (p.size + 2));
          ctx.lineTo(Math.cos(ang + 0.12) * p.size, Math.sin(ang + 0.12) * p.size);
        }
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2, p.size * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = '#FFF';
        ctx.fill();
        ctx.restore();

        if (p.life > p.ttl || p.y > HEIGHT + 40) {
          victoryParticles.splice(i, 1);
        }
      }

      if (victoryParticles.length > 0) {
        requestAnimationFrame(victoryAnim);
      } else {
        // final static victory screen
        ctx.fillStyle = '#225E6A';
        ctx.font = 'bold 36px Verdana, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('You fixed all the machines!', WIDTH / 2, HEIGHT / 2 - 30);
        ctx.font = '20px Verdana, Arial';
        ctx.fillText('Thanks for playing — Great job!', WIDTH / 2, HEIGHT / 2 + 8);
      }
    }
    requestAnimationFrame(victoryAnim);
    updateLiveRegion('Victory! You fixed all the machines. Refresh to play again.');
  }

  // Animation loop
  let lastTime = performance.now();
  function animate(t) {
    const dt = (t - lastTime) / 1000;
    lastTime = t;

    // background
    drawBackground(t);

    // robot & machine panel
    drawRobot(t);
    drawMachinePanel();

    // update cogs rotation and small physics
    for (const c of cogs) {
      c.rotation += dt * 0.6 * (c.value % 3 + 1) * 0.02 + Math.sin(t / 700 + c.value) * 0.0006;
      // bobbing effect when not dragging or placed
      if (!c.isDragging && !c.placedSlot) {
        c.y += Math.sin(t / 800 + c.value) * 0.018;
      }
      // apply simple shake if set
      if (c.shake && c.shake > 0) {
        c.x += (Math.random() - 0.5) * c.shake;
        c.y += (Math.random() - 0.5) * c.shake;
        c.shake *= 0.88;
        if (c.shake < 0.1) c.shake = 0;
      }
    }

    // draw slots and cogs
    drawSlots();
    for (const c of cogs) c.hover = c === hoveredCog;
    for (const c of cogs) drawCog(c, t);

    // draw UI message box bottom
    ctx.fillStyle = '#F6FAFF';
    drawRoundedRect(24, 354, 672, 108, 10);
    ctx.fillStyle = '#ECF8FF';
    drawRoundedRect(30, 360, 660, 96, 8);
    ctx.fillStyle = '#344B57';
    ctx.font = '14px Verdana, Arial';
    ctx.textAlign = 'left';
    wrapText(ctx, message, 48, 396, 604, 18);

    // audio state indicator
    ctx.save();
    ctx.fillStyle = audioEnabled ? '#59D087' : '#FF9A9A';
    ctx.beginPath();
    ctx.arc(680, 424, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // update and draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt; // gravity
      p.vx *= 0.995;
      p.size *= 0.998;
      p.rot += p.drot * dt;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      // small rectangle or particle
      ctx.rect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.fill();
      ctx.restore();

      if (p.life > p.ttl || p.y > HEIGHT + 40) {
        particles.splice(i, 1);
      }
    }

    requestAnimationFrame(animate);
  }

  // Event listeners
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', pointerUp, { passive: false });

  canvas.addEventListener('mousemove', (e) => {
    const p = getPointerPos(e);
    let hover = null;
    for (let i = cogs.length - 1; i >= 0; i--) {
      const c = cogs[i];
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (Math.hypot(dx, dy) <= c.radius + 6) {
        hover = c;
        break;
      }
    }
    hoveredCog = hover;
    render(); // immediate visual feedback
  });

  canvas.addEventListener('keydown', keyDown, false);
  container.addEventListener('keydown', keyDown, false);

  canvas.addEventListener('click', () => {
    try {
      resumeAudioOnGesture();
    } catch (e) {
      console.warn('Audio resume click error', e);
    }
  });

  // Rendering wrapper for initial render calls (keeps behavior)
  function render() {
    // Rendering is handled inside animate loop for consistent visuals.
    // But trigger a single frame render to reflect immediate changes.
    const now = performance.now();
    // Clear with background draw, then call animate-like rendering logic once
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    drawBackground(now);
    drawRobot(now);
    drawMachinePanel();

    for (const c of cogs) {
      c.rotation += dt * 0.6 * (c.value % 3 + 1) * 0.02;
    }

    drawSlots();
    for (const c of cogs) c.hover = c === hoveredCog;
    for (const c of cogs) drawCog(c, now);

    ctx.fillStyle = '#F6FAFF';
    drawRoundedRect(24, 354, 672, 108, 10);
    ctx.fillStyle = '#ECF8FF';
    drawRoundedRect(30, 360, 660, 96, 8);
    ctx.fillStyle = '#344B57';
    ctx.font = '14px Verdana, Arial';
    ctx.textAlign = 'left';
    wrapText(ctx, message, 48, 396, 604, 18);

    ctx.save();
    ctx.fillStyle = audioEnabled ? '#59D087' : '#FF9A9A';
    ctx.beginPath();
    ctx.arc(680, 424, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // draw particles snapshot
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotate || 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.rect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.fill();
      ctx.restore();
    }
  }

  // Polyfill for rounded rect in older contexts
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // Accessibility
  function updateLiveRegion(text) {
    if (!liveRegion) return;
    liveRegion.textContent = text;
  }

  // Setup and start
  setupLevel(0);
  lastTime = performance.now();
  requestAnimationFrame(animate);

  // audio init attempt; if unavailable show message
  if (!initAudio()) {
    message =
      'Audio unavailable. The game will still work without sound. Click to attempt enabling sound.';
    updateLiveRegion(message);
    render();
  }
})();