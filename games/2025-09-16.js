(function () {
  // Enhanced Machine Math Game (visuals & audio upgraded)
  // Renders into #game-of-the-day-stage as a 720x480 canvas
  // Game mechanics remain unchanged. Only visuals/audio improved.
  'use strict';

  // Utility helpers
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }
  function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Locate container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear container and create canvas (exact size required)
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.setAttribute('tabindex', '0'); // allow keyboard focus
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Machine Math Game. Press Enter to start or click to interact. Use arrow keys to move parts, space to place. Press M to toggle sound.'
  );
  canvas.style.outline = 'none';
  // Make sure canvas CSS matches size exactly
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Accessibility: visually show focus ring when canvas focused
  let hasFocus = false;
  canvas.addEventListener('focus', () => {
    hasFocus = true;
    draw();
  });
  canvas.addEventListener('blur', () => {
    hasFocus = false;
    draw();
  });

  // Audio setup with error handling (Web Audio API only)
  let audioContext = null;
  let audioAllowed = false;
  let audioErr = null;
  let masterGain = null;
  let bgGain = null;
  let bgOsc1 = null;
  let bgOsc2 = null;
  let bgFilter = null;
  let isMuted = false;
  let placeClickEnabled = true;
  let activeNodes = new Set();

  function createAudioContext() {
    if (audioContext) return audioContext;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioContext = new AC();
      // Master gain
      masterGain = audioContext.createGain();
      masterGain.gain.value = isMuted ? 0 : 0.7;
      masterGain.connect(audioContext.destination);

      // Background ambient: two gentle oscillators through a lowpass
      bgGain = audioContext.createGain();
      bgGain.gain.value = 0.03;
      bgFilter = audioContext.createBiquadFilter();
      bgFilter.type = 'lowpass';
      bgFilter.frequency.value = 700;
      bgFilter.Q.value = 0.6;

      // Two slow oscillators with slight detune for warm pad
      bgOsc1 = audioContext.createOscillator();
      bgOsc1.type = 'sine';
      bgOsc1.frequency.value = 120;

      bgOsc2 = audioContext.createOscillator();
      bgOsc2.type = 'triangle';
      bgOsc2.frequency.value = 168;

      // subtle stereo movement via panner node for one oscillator
      let panner = null;
      try {
        panner = audioContext.createStereoPanner();
      } catch (e) {
        panner = null;
      }

      bgOsc1.connect(bgFilter);
      bgOsc2.connect(bgFilter);
      bgFilter.connect(bgGain);
      if (panner) {
        bgGain.connect(panner);
        panner.connect(masterGain);
      } else {
        bgGain.connect(masterGain);
      }
      bgOsc1.start();
      bgOsc2.start();

      // LFO to modulate filter frequency gently
      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();
      lfo.frequency.value = 0.07; // very slow
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(bgFilter.frequency);
      lfo.start();

      // small movement on panner if available
      if (panner) {
        const panLfo = audioContext.createOscillator();
        const panGain = audioContext.createGain();
        panLfo.frequency.value = 0.05;
        panGain.gain.value = 0.6;
        panLfo.connect(panGain);
        panGain.connect(panner.pan);
        panLfo.start();
      }

      audioAllowed = true;
      audioErr = null;
      isMuted = false;
      return audioContext;
    } catch (e) {
      console.warn('Audio context creation failed:', e);
      audioErr = e;
      audioAllowed = false;
      return null;
    }
  }

  function resumeAudioIfNeeded() {
    if (!audioContext) return createAudioContext();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((e) => {
        console.warn('Audio resume failed:', e);
      });
    }
  }

  function setMuted(m) {
    isMuted = !!m;
    if (masterGain)
      masterGain.gain.setTargetAtTime(
        isMuted ? 0 : 0.7,
        audioContext ? audioContext.currentTime : 0,
        0.02
      );
    draw(); // update speaker icon
  }

  // Helper to safely create, connect and stop nodes; tracks to shut down if needed
  function safeConnect(node, dest) {
    try {
      node.connect(dest);
      activeNodes.add(node);
    } catch (e) {
      /* ignore */
    }
  }

  function safeDisconnect(node) {
    try {
      node.disconnect();
      activeNodes.delete(node);
    } catch (e) {
      /* ignore */
    }
  }

  // Mild "place" click sound to reinforce placement
  function playPlaceSound() {
    if (!audioAllowed || !audioContext || isMuted || !placeClickEnabled) return;
    try {
      const t = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'square';
      osc.frequency.value = 760;
      gain.gain.value = 0;
      safeConnect(osc, gain);
      safeConnect(gain, masterGain);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.2);
      // cleanup
      setTimeout(() => {
        safeDisconnect(gain);
        safeDisconnect(osc);
      }, 400);
    } catch (e) {
      console.warn('playPlaceSound error', e);
    }
  }

  // Success chord (pleasant arpeggio)
  function playCorrectSound() {
    if (!audioAllowed || !audioContext || isMuted) return;
    try {
      const t0 = audioContext.currentTime;
      const base = 440;
      const semis = [0, 4, 7]; // major triad
      semis.forEach((s, i) => {
        const osc = audioContext.createOscillator();
        const g = audioContext.createGain();
        const filt = audioContext.createBiquadFilter();
        osc.type = i === 1 ? 'triangle' : 'sine';
        osc.frequency.value = base * Math.pow(2, s / 12);
        filt.type = 'lowpass';
        filt.frequency.value = 1100;
        g.gain.value = 0;
        safeConnect(osc, filt);
        safeConnect(filt, g);
        safeConnect(g, masterGain);
        const start = t0 + i * 0.06;
        const dur = 0.7;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.start(start);
        osc.stop(start + dur + 0.05);
        setTimeout(() => {
          safeDisconnect(g);
          safeDisconnect(filt);
          safeDisconnect(osc);
        }, (dur + 0.2) * 1000 + 100);
      });
      // small percussive click for confirmation
      setTimeout(playPlaceSound, 80);
    } catch (e) {
      console.warn('playCorrectSound error', e);
    }
  }

  // Wrong / gentle negative feedback
  function playWrongSound() {
    if (!audioAllowed || !audioContext || isMuted) return;
    try {
      const t = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const g = audioContext.createGain();
      const f = audioContext.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = 120;
      f.type = 'bandpass';
      f.frequency.value = 300;
      f.Q.value = 1.2;
      safeConnect(osc, f);
      safeConnect(f, g);
      safeConnect(g, masterGain);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.5);
      setTimeout(() => {
        safeDisconnect(g);
        safeDisconnect(f);
        safeDisconnect(osc);
      }, 800);
    } catch (e) {
      console.warn('playWrongSound error', e);
    }
  }

  // Visual theme elements
  const bgBlobs = Array.from({ length: 14 }, (_, i) => ({
    x: rand(60, canvas.width - 60),
    y: rand(40, canvas.height - 40),
    rx: rand(36, 82),
    ry: rand(16, 36),
    phase: rand(0, Math.PI * 2),
    hue: 190 + rand(-20, 20),
    speed: rand(0.003, 0.01),
    offset: rand(0, 1000)
  }));

  // Particle effects for success
  const particles = [];

  // Game state (unchanged logic)
  let rngSeed = Date.now();
  const state = {
    level: 0,
    maxLevels: 6,
    parts: [],
    slots: [],
    target: 0,
    selectedPartIndex: -1,
    dragging: false,
    dragOffset: { x: 0, y: 0 },
    score: 0,
    message: 'Press Enter or Click to start',
    started: false,
    completed: false,
    animTime: 0,
    lastTick: performance.now(),
    showFocusHint: true,
    machineRun: 0 // used for machine run animation
  };

  // Generate level data: unchanged
  function generateLevel(n) {
    const slotCount = clamp(2 + Math.floor(n / 2), 2, 4);
    const maxValue = 5 + n * 2;
    const targetParts = [];
    for (let i = 0; i < slotCount; i++) {
      targetParts.push(Math.floor(rand(1, maxValue + 1)));
    }
    const target = targetParts.reduce((a, b) => a + b, 0);
    const parts = [];
    targetParts.forEach((v) =>
      parts.push({ val: v, x: 560 + Math.random() * 120, y: 120 + Math.random() * 260 })
    );
    for (let i = 0; i < Math.max(2, slotCount); i++) {
      parts.push({ val: Math.floor(rand(1, maxValue + 1)), x: 560 + Math.random() * 120, y: 120 + Math.random() * 260 });
    }
    for (let i = parts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }
    parts.forEach((p, idx) => {
      p.x = 520 + (idx % 3) * 60 + rand(-8, 8);
      p.y = 150 + Math.floor(idx / 3) * 70 + rand(-6, 6);
      p.wob = rand(0, Math.PI * 2);
      p.id = Math.random().toString(36).slice(2);
      p.placed = false;
      p.selected = false;
      p.scale = 1;
      p.targetScale = 1;
      p.vy = 0;
    });

    const slots = [];
    const centerX = 320;
    const centerY = 230;
    const gap = 72;
    const startX = centerX - (slotCount - 1) * gap / 2;
    for (let i = 0; i < slotCount; i++) {
      slots.push({
        x: startX + i * gap,
        y: centerY + 6 + (i % 2 === 0 ? -8 : 8),
        r: 28,
        placedPart: null,
        glow: 0
      });
    }
    return { parts, slots, target };
  }

  function startGame() {
    state.level = 0;
    state.score = 0;
    state.started = true;
    state.completed = false;
    state.message = 'Assemble the machine! Reach the target number.';
    nextLevel();
    resumeAudioIfNeeded();
  }

  function nextLevel() {
    if (state.level >= state.maxLevels) {
      state.completed = true;
      state.message = 'Fantastic! You fixed all the machines!';
      playCorrectSound();
      spawnCongratParticles();
      return;
    }
    const data = generateLevel(state.level);
    state.parts = data.parts;
    state.slots = data.slots;
    state.target = data.target;
    state.selectedPartIndex = -1;
    state.dragging = false;
    state.message = `Level ${state.level + 1}: Make ${state.target}`;
    state.animTime = 0;
  }

  // Hit test for parts (unchanged)
  function partAt(x, y) {
    for (let i = state.parts.length - 1; i >= 0; i--) {
      const p = state.parts[i];
      if (p.placed) continue;
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < 24) return i;
    }
    return -1;
  }

  function slotAt(x, y) {
    for (let i = 0; i < state.slots.length; i++) {
      const s = state.slots[i];
      const dx = x - s.x;
      const dy = y - s.y;
      if (Math.sqrt(dx * dx + dy * dy) < s.r + 6) return i;
    }
    return -1;
  }

  // Place part; keep logic same, add audio & gentle animation
  function tryPlacePart(partIndex, slotIndex) {
    const p = state.parts[partIndex];
    const s = state.slots[slotIndex];
    if (s.placedPart) {
      state.message = 'That slot is occupied. Try a different slot.';
      playWrongSound();
      return false;
    }
    p.placed = true;
    p.selected = false;
    s.placedPart = p;
    // Snap position with tiny bounce
    p.x = s.x;
    p.y = s.y;
    p.targetScale = 1.08;
    // Soft glow on slot
    s.glow = 1.0;
    playPlaceSound();
    checkLevelComplete();
    draw();
    return true;
  }

  function removeFromSlot(slotIndex) {
    const s = state.slots[slotIndex];
    if (!s.placedPart) return;
    const p = s.placedPart;
    s.placedPart = null;
    p.placed = false;
    // Return it to the pool area
    p.x = 520 + rand(0, 140);
    p.y = 150 + rand(0, 260);
    p.targetScale = 1;
    draw();
  }

  function checkLevelComplete() {
    const allFilled = state.slots.every((s) => s.placedPart !== null);
    if (!allFilled) return;
    const sum = state.slots.reduce((acc, s) => acc + (s.placedPart ? s.placedPart.val : 0), 0);
    if (sum === state.target) {
      state.message = 'Perfect! Machine fixed!';
      state.score += 10 + state.level * 2;
      playCorrectSound();
      spawnSuccessParticlesAt(state.slots.map((s) => ({ x: s.x, y: s.y })));
      // animate machine run
      state.machineRun = 1.6;
      setTimeout(() => {
        state.level++;
        nextLevel();
      }, 1200);
    } else {
      state.message = `Oops! That adds to ${sum}. Try again.`;
      playWrongSound();
      // unplace a random slot to give second chance
      const placedSlots = state.slots.map((s, i) => (s.placedPart ? i : null)).filter((i) => i !== null);
      if (placedSlots.length > 0) {
        const idx = choice(placedSlots);
        setTimeout(() => removeFromSlot(idx), 600);
      }
    }
  }

  // Input handling (mostly unchanged; ensure audio created on user gesture)
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (!state.started) {
      state.started = true;
      startGame();
      return;
    }
    // Check clicking on speaker toggler
    if (mx > 16 && mx < 56 && my > 16 && my < 56) {
      if (!audioAllowed) {
        createAudioContext();
        resumeAudioIfNeeded();
      } else {
        setMuted(!isMuted);
      }
      draw();
      return;
    }
    // click on part
    const idx = partAt(mx, my);
    if (idx >= 0) {
      const p = state.parts[idx];
      if (p.placed) {
        const slotIndex = state.slots.findIndex((s) => s.placedPart && s.placedPart.id === p.id);
        if (slotIndex >= 0) {
          removeFromSlot(slotIndex);
        }
        return;
      }
      state.selectedPartIndex = idx;
      state.dragging = true;
      state.dragOffset.x = mx - p.x;
      state.dragOffset.y = my - p.y;
      p.selected = true;
      createAudioContext();
      resumeAudioIfNeeded();
      draw();
      return;
    }
    const slotIdx = slotAt(mx, my);
    if (slotIdx >= 0) {
      if (state.slots[slotIdx].placedPart) {
        removeFromSlot(slotIdx);
      } else {
        state.message = 'Drop a number here.';
        draw();
      }
      return;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!state.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (state.selectedPartIndex >= 0) {
      const slotIdx = slotAt(mx, my);
      if (slotIdx >= 0) {
        tryPlacePart(state.selectedPartIndex, slotIdx);
      } else {
        const p = state.parts[state.selectedPartIndex];
        p.selected = false;
        p.x = 520 + rand(0, 140);
        p.y = 150 + rand(0, 260);
        state.message = 'Try placing numbers in the slots to reach the target.';
        draw();
      }
    }
    state.dragging = false;
    state.selectedPartIndex = -1;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!state.dragging || state.selectedPartIndex < 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const p = state.parts[state.selectedPartIndex];
    p.x = mx - state.dragOffset.x;
    p.y = my - state.dragOffset.y;
    draw();
  });

  // Keyboard controls (unchanged behavior)
  canvas.addEventListener('keydown', (e) => {
    if (!state.started) {
      if (e.key === 'Enter' || e.key === ' ') {
        startGame();
        e.preventDefault();
      }
      return;
    }
    if (e.key.toLowerCase() === 'm') {
      if (!audioAllowed) {
        createAudioContext();
        resumeAudioIfNeeded();
      } else {
        setMuted(!isMuted);
      }
      e.preventDefault();
      return;
    }
    if (e.key.toLowerCase() === 'h') {
      state.message = 'Use arrows to pick parts, Enter to drop into nearest slot, Space to pick/place, M toggles sound.';
      draw();
      e.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < state.parts.length) {
        const p = state.parts[idx];
        if (!p.placed) {
          state.selectedPartIndex = idx;
          p.selected = true;
          state.dragging = false;
          state.message = `Selected part ${p.val}. Use arrow keys to move; Enter to place into nearest slot.`;
          draw();
        }
      }
      e.preventDefault();
      return;
    }
    if (state.selectedPartIndex >= 0) {
      const p = state.parts[state.selectedPartIndex];
      let moved = false;
      if (e.key === 'ArrowLeft') {
        p.x -= 12;
        moved = true;
      }
      if (e.key === 'ArrowRight') {
        p.x += 12;
        moved = true;
      }
      if (e.key === 'ArrowUp') {
        p.y -= 10;
        moved = true;
      }
      if (e.key === 'ArrowDown') {
        p.y += 10;
        moved = true;
      }
      if (moved) {
        p.x = clamp(p.x, 480, canvas.width - 40);
        p.y = clamp(p.y, 80, canvas.height - 40);
        draw();
        e.preventDefault();
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        const nearest = state.slots.reduce(
          (best, s, i) => {
            const d = Math.hypot(p.x - s.x, p.y - s.y);
            if (d < best.dist) return { dist: d, idx: i };
            return best;
          },
          { dist: 9999, idx: -1 }
        );
        if (nearest.idx >= 0 && nearest.dist < 80) {
          tryPlacePart(state.selectedPartIndex, nearest.idx);
        } else {
          p.selected = false;
          p.x = 520 + rand(0, 140);
          p.y = 150 + rand(0, 260);
          state.selectedPartIndex = -1;
          draw();
        }
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        p.selected = false;
        state.selectedPartIndex = -1;
        draw();
        e.preventDefault();
        return;
      }
    } else {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        cycleSelect(-1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        cycleSelect(1);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        const idx = nearestPartTo(320, 240);
        if (idx >= 0) {
          state.selectedPartIndex = idx;
          state.parts[idx].selected = true;
          state.message = `Selected part ${state.parts[idx].val}.`;
          draw();
        }
        e.preventDefault();
      }
    }
  });

  function cycleSelect(dir) {
    let start = state.selectedPartIndex;
    if (start < 0) start = -1;
    let i = start;
    for (let k = 0; k < state.parts.length; k++) {
      i = (i + dir + state.parts.length) % state.parts.length;
      const p = state.parts[i];
      if (!p.placed) {
        if (state.selectedPartIndex >= 0) state.parts[state.selectedPartIndex].selected = false;
        state.selectedPartIndex = i;
        p.selected = true;
        state.message = `Selected part ${p.val}. Use arrows & Enter to place.`;
        draw();
        return;
      }
    }
  }

  function nearestPartTo(x, y) {
    let best = { dist: 9999, idx: -1 };
    for (let i = 0; i < state.parts.length; i++) {
      const p = state.parts[i];
      if (p.placed) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best.dist) {
        best = { dist: d, idx: i };
      }
    }
    return best.idx;
  }

  // Drawing improvements
  function drawBackground(ts) {
    // soft blue-green gradient with subtle radial vignette
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#f7fbfc');
    g.addColorStop(1, '#e6f4f6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // decorative soft blobs (parallax)
    ctx.save();
    for (let i = 0; i < bgBlobs.length; i++) {
      const b = bgBlobs[i];
      const swayX = Math.sin(ts * b.speed + b.phase) * 12;
      const swayY = Math.cos(ts * (b.speed * 0.7) + b.phase) * 6;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${b.hue}, 60%, 70%, 0.14)`;
      ctx.ellipse(
        b.x + swayX,
        b.y + swayY,
        b.rx,
        b.ry,
        Math.sin(ts * 0.001 + b.phase) * 0.6,
        0,
        Math.PI * 2
      );
      ctx.fill();
      // highlight
      ctx.beginPath();
      ctx.fillStyle = `hsla(${b.hue + 10}, 70%, 85%, 0.07)`;
      ctx.ellipse(b.x + swayX - 8, b.y + swayY - 8, b.rx * 0.6, b.ry * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // subtle gear grid - semi-transparent
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#184447';
    for (let gx = 40; gx < canvas.width; gx += 120) {
      for (let gy = 40; gy < canvas.height; gy += 120) {
        drawGear(ctx, gx, gy, 18, 8, ts * 0.0006 + (gx + gy) * 0.001);
      }
    }
    ctx.restore();
  }

  // Draw machine with character features & subtle animation
  function drawMachine(ts) {
    const mx = 320,
      my = 220;
    ctx.save();

    // Main chassis with soft shadow
    ctx.shadowColor = 'rgba(30,60,70,0.12)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#dff3f5';
    ctx.strokeStyle = '#98c1c6';
    ctx.lineWidth = 4;
    roundRect(ctx, mx - 180, my - 110, 360, 220, 20, true, true);

    // Inner panel
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, mx - 152, my - 86, 304, 120, 14, true, false);

    // Display area
    ctx.fillStyle = '#eef9fb';
    roundRect(ctx, mx - 72, my - 86, 144, 44, 12, true, true);
    ctx.fillStyle = '#0d3b43';
    ctx.font = '18px "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TARGET', mx, my - 60);

    ctx.font = '34px "Comic Sans MS", "Arial", sans-serif';
    ctx.fillStyle = '#07363a';
    ctx.fillText(String(state.target), mx, my - 26);

    // Robot face on left
    ctx.save();
    ctx.translate(mx - 120, my + 10);
    // head box
    ctx.fillStyle = '#bfe6ea';
    roundRect(ctx, -68, -44, 96, 88, 12, true, true);
    // eyes (blinking)
    const blink = Math.max(0, Math.sin(ts * 0.006 + state.animTime * 2) * 1.2);
    ctx.fillStyle = '#07363a';
    ctx.beginPath();
    ctx.ellipse(-32, -6, 10, 8 - Math.abs(blink), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, -6, 10, 8 - Math.abs(blink * 0.7), 0, 0, Math.PI * 2);
    ctx.fill();
    // mouth
    ctx.fillStyle = '#13535a';
    ctx.fillRect(-26, 22, 48, 6);
    // antenna
    ctx.beginPath();
    ctx.moveTo(30, -46);
    ctx.lineTo(40, -74);
    ctx.strokeStyle = '#8aaeb2';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = '#ffd966';
    ctx.arc(40, -74, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Slot connectors and rings
    state.slots.forEach((s, i) => {
      // tube from machine center to slot
      ctx.beginPath();
      ctx.strokeStyle = `rgba(12,36,40,${0.08 + s.glow * 0.12})`;
      ctx.lineWidth = 12;
      const fromX = mx - 20;
      const fromY = my - 6;
      const cpX = (fromX + s.x) / 2 + (i % 2 === 0 ? -26 : 26);
      const cpY = fromY - 30 + (i % 2 ? 16 : -16);
      ctx.moveTo(fromX, fromY);
      ctx.quadraticCurveTo(cpX, cpY, s.x, s.y - 14);
      ctx.stroke();

      // slot plate
      ctx.beginPath();
      ctx.fillStyle = '#f8ffff';
      ctx.strokeStyle = '#7aa1a6';
      ctx.lineWidth = 3;
      ctx.arc(s.x, s.y, s.r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // inner face
      ctx.beginPath();
      ctx.fillStyle = 'rgba(6,20,24,0.04)';
      ctx.arc(s.x, s.y, s.r - 8, 0, Math.PI * 2);
      ctx.fill();

      // glow reduce over time
      s.glow = Math.max(0, s.glow - 0.03);

      // placed number or hint
      if (s.placedPart) {
        ctx.fillStyle = '#0b3b43';
        ctx.font = '20px "Arial", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(s.placedPart.val), s.x, s.y + 6);
      } else {
        ctx.fillStyle = 'rgba(8,32,36,0.06)';
        ctx.font = '16px "Arial", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', s.x, s.y + 6);
      }

      // subtle animated ring when machine is running
      if (state.machineRun > 0) {
        ctx.save();
        ctx.beginPath();
        const t = (1 - state.machineRun) * 1.5;
        ctx.strokeStyle = `rgba(90,170,180,${0.18 * state.machineRun})`;
        ctx.lineWidth = 4;
        ctx.arc(s.x, s.y, s.r + 12 + t * 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });

    // decorative knobs
    ctx.fillStyle = '#a7d0dc';
    ctx.beginPath();
    ctx.arc(mx + 140, my + 72, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#cfe3ea';
    ctx.arc(mx + 140, my + 72, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw parts as animated friendly cogs
  function drawParts(ts) {
    // Pool area background
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#fbffff';
    roundRect(ctx, 480, 100, 224, 300, 14, true, false);

    ctx.fillStyle = '#0b3b47';
    ctx.font = '16px "Arial", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Parts Rack', 492, 122);
    ctx.restore();

    // Draw each part
    for (let i = 0; i < state.parts.length; i++) {
      const p = state.parts[i];
      // wobble and physics
      p.wob += 0.02;
      const wob = Math.sin(p.wob) * 2;
      // smooth scale lerp
      p.scale += (p.targetScale - p.scale) * 0.14;
      // if not placed, a tiny gravity for realistic placement
      if (!p.placed && !p.selected) {
        p.vy += 0.12;
        p.y += p.vy * 0.6;
        if (p.y > 400) {
          p.y = 400;
          p.vy *= -0.3;
        }
      }
      const x = p.x;
      const y = p.y + wob;

      // draw cog body
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(ts / 1000 + p.wob) * 0.07);
      const radius = 22 * p.scale;
      // subtle shadow
      ctx.shadowColor = 'rgba(20,50,60,0.15)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      // teeth
      for (let t = 0; t < 8; t++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 / 8) * t);
        ctx.fillStyle = p.selected ? '#fff2d9' : '#fff7ee';
        ctx.fillRect(radius - 6, -6, 10, 12);
        ctx.restore();
      }
      // inner disc
      ctx.beginPath();
      ctx.fillStyle = p.selected ? '#ffd99e' : '#fff5e6';
      ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b68f63';
      ctx.lineWidth = 2;
      ctx.stroke();
      // number
      ctx.fillStyle = '#12484a';
      ctx.font = `${18 * p.scale}px "Comic Sans MS", "Arial", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(p.val), 0, 6);
      ctx.restore();

      // index label
      ctx.fillStyle = 'rgba(18,60,64,0.12)';
      ctx.font = '12px "Arial", sans-serif';
      ctx.fillText(String(i + 1), x + 18, y + 18);
    }
  }

  // UI rendering improvements
  function drawUI(ts) {
    // Top left info panel
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, 12, 12, 260, 72, 10, true, true);
    ctx.fillStyle = '#0b3b47';
    ctx.font = '18px "Arial", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level: ${Math.min(state.level + 1, state.maxLevels)}/${state.maxLevels}`, 28, 36);
    ctx.font = '14px "Arial", sans-serif';
    ctx.fillText(state.message, 28, 56);
    ctx.restore();

    // Speaker icon with small animated meters
    ctx.save();
    const sx = 20,
      sy = 20;
    ctx.fillStyle = 'rgba(255,255,255,0.0)';
    ctx.fillRect(sx - 4, sy - 4, 40, 40);
    // speaker silhouette
    ctx.beginPath();
    ctx.moveTo(sx + 6, sy + 12);
    ctx.lineTo(sx + 18, sy + 8);
    ctx.lineTo(sx + 18, sy + 28);
    ctx.lineTo(sx + 6, sy + 24);
    ctx.closePath();
    ctx.fillStyle = '#0b3b47';
    ctx.fill();
    if (audioAllowed && !isMuted) {
      ctx.save();
      // animated bars
      for (let i = 0; i < 3; i++) {
        const h = 6 + Math.abs(Math.sin(ts / 200 + i * 0.9)) * 10;
        ctx.fillStyle = `rgba(94,180,180,${0.9 - i * 0.18})`;
        ctx.fillRect(sx + 22 + i * 6, sy + 18 - h / 2, 4, h);
      }
      ctx.restore();
    } else {
      // muted cross
      ctx.strokeStyle = '#dd5b5b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx + 22, sy + 6);
      ctx.lineTo(sx + 34, sy + 18);
      ctx.moveTo(sx + 34, sy + 6);
      ctx.lineTo(sx + 22, sy + 18);
      ctx.stroke();
    }
    ctx.restore();

    // Controls box bottom left
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    roundRect(ctx, 12, 380, 260, 88, 10, true, true);
    ctx.fillStyle = '#0b3b47';
    ctx.font = '13px "Arial", sans-serif';
    ctx.fillText('Controls:', 28, 398);
    ctx.fillText('- Click or press Enter to select a part', 28, 416);
    ctx.fillText('- Arrow keys move selected part', 28, 434);
    ctx.fillText('- Press Enter/Space near a slot to place it', 28, 452);
    ctx.restore();

    // Focus ring subtle
    if (hasFocus) {
      ctx.save();
      ctx.strokeStyle = 'rgba(6,40,48,0.12)';
      ctx.lineWidth = 4;
      roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 18, false, true);
      ctx.restore();
    }
  }

  function drawFooter(ts) {
    ctx.save();
    ctx.fillStyle = '#0b3b47';
    ctx.font = '16px "Arial", sans-serif';
    ctx.textAlign = 'center';
    if (!state.started) {
      ctx.fillText('Wacky Machine Workshop — Click or press Enter to start', canvas.width / 2, canvas.height - 12);
    } else if (state.completed) {
      ctx.fillText('You fixed the machines! Great job!', canvas.width / 2, canvas.height - 12);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(`Score: ${state.score}`, canvas.width - 24, canvas.height - 12);
    }
    ctx.restore();
  }

  // utility to draw a gear-shaped faint background element
  function drawGear(ctx, x, y, radius, teeth, twist) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(twist);
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const r1 = radius;
      const r2 = radius + 8;
      const ax = Math.cos(a) * r1;
      const ay = Math.sin(a) * r1;
      ctx.lineTo(ax, ay);
      const bx = Math.cos(a + Math.PI / teeth) * r2;
      const by = Math.sin(a + Math.PI / teeth) * r2;
      ctx.lineTo(bx, by);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Rounded rectangle helper
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === 'undefined') r = 5;
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

  // Particles for feedback
  function spawnSuccessParticlesAt(positions) {
    positions.forEach((pos) => {
      for (let i = 0; i < 12; i++) {
        particles.push({
          x: pos.x + rand(-8, 8),
          y: pos.y + rand(-8, 8),
          vx: rand(-1.6, 1.6),
          vy: rand(-3.2, -0.8),
          life: 1,
          size: rand(2, 4),
          col: `hsl(${rand(160, 190)}, 60%, ${rand(45, 65)}%)`
        });
      }
    });
  }

  function spawnCongratParticles() {
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: 320 + rand(-140, 140),
        y: 200 + rand(-80, 80),
        vx: rand(-2.6, 2.6),
        vy: rand(-4.4, -0.4),
        life: 1,
        size: rand(3, 6),
        col: `hsl(${rand(160, 200)}, 70%, ${rand(45, 70)}%)`
      });
    }
  }

  // Draw particles
  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.life -= 0.02;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Main draw loop
  function draw(ts = 0) {
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(ts);
    drawMachine(ts);
    drawParts(ts);
    drawUI(ts);
    drawFooter(ts);

    // slot ghost highlight when dragging
    if (state.selectedPartIndex >= 0) {
      const p = state.parts[state.selectedPartIndex];
      const nearest = state.slots.reduce(
        (best, s, i) => {
          const d = Math.hypot(p.x - s.x, p.y - s.y);
          if (d < best.dist) return { dist: d, idx: i, s: s };
          return best;
        },
        { dist: 9999, idx: -1 }
      );
      if (nearest.idx !== -1 && nearest.dist < 80) {
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = 'rgba(92,176,180,0.12)';
        ctx.arc(nearest.s.x, nearest.s.y, nearest.s.r + 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Draw particles
    drawParticles(1 / 60);

    // Machine run decay
    if (state.machineRun > 0) {
      state.machineRun = Math.max(0, state.machineRun - 0.02);
    }

    // Audio availability overlay messages (respectful and unobtrusive)
    if (!audioAllowed && audioErr) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      roundRect(ctx, 160, 200, 400, 80, 10, true, true);
      ctx.fillStyle = '#d23f3f';
      ctx.font = '16px "Arial", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Audio is unavailable in this browser.', canvas.width / 2, 228);
      ctx.fillStyle = '#0b3b47';
      ctx.fillText('Sound will remain off. You can still play the game.', canvas.width / 2, 254);
      ctx.restore();
    } else if (!audioAllowed) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      roundRect(ctx, 160, 200, 400, 80, 10, true, true);
      ctx.fillStyle = '#0b3b47';
      ctx.font = '16px "Arial", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap or press M to enable sound for gentle chimes.', canvas.width / 2, 228);
      ctx.fillText('Sounds are generated on your device — no downloads.', canvas.width / 2, 254);
      ctx.restore();
    }
  }

  // Animation loop
  function tick(now) {
    const dt = (now - state.lastTick) / 1000;
    state.lastTick = now;
    state.animTime += dt;
    // gentle updates for parts scale targets
    state.parts.forEach((p) => {
      // shrink back to normal after placement bounce
      p.targetScale += (1 - p.targetScale) * 0.08;
    });
    draw(now);
    requestAnimationFrame(tick);
  }

  // Kick things off
  draw();
  requestAnimationFrame(tick);

  // Expose readiness
  container.dataset.gameReady = 'true';

  // Ensure canvas is focusable and initially focused
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (e) {}
  }, 200);

  // Console info for testers
  console.info(
    'Machine Math Game ready. Controls: Click parts to pick & drag, arrows to move, Enter/Space to place, M to toggle sound.'
  );

  // Clean up audio nodes on window unload to avoid leaks
  window.addEventListener('pagehide', () => {
    try {
      activeNodes.forEach((node) => {
        try {
          node.disconnect();
        } catch (e) {}
      });
      if (bgOsc1) try {
        bgOsc1.stop();
      } catch (e) {}
      if (bgOsc2) try {
        bgOsc2.stop();
      } catch (e) {}
      if (audioContext && typeof audioContext.close === 'function') {
        audioContext.close().catch(() => {});
      }
    } catch (e) {
      /* ignore */
    }
  });

  // Error handling
  window.addEventListener('error', (ev) => {
    console.error('Unexpected error in Machine Math Game:', ev.error || ev.message);
    state.message = 'An unexpected error occurred. Please reload the page.';
    draw();
  });
})();