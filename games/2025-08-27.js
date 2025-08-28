(function () {
  // Machine Match - Visual & Audio enhancement version
  // NOTE: Only visuals and audio are changed. Game mechanics and math logic remain intact.
  const STAGE_ID = 'game-of-the-day-stage';
  const WIDTH = 720;
  const HEIGHT = 480;
  const SLOT_COUNT = 3;
  const TOTAL_LEVELS = 5;

  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error('Game stage element not found:', STAGE_ID);
    return;
  }

  // Clear stage and create canvas
  stage.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Machine Match math game. Use mouse or keyboard to play.');
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  stage.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Unable to get 2D context');
    return;
  }

  // ------------------------------
  // Audio setup with improved ambient layering & error handling
  // ------------------------------
  let audioCtx = null;
  let audioAllowed = false;
  let backgroundGain = null;
  let backgroundNodes = []; // store background objects for later control
  let masterGain = null;

  // For visual confetti triggering from audio events
  let confettiParticles = [];

  function safeCreateAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        console.warn('Web Audio API not supported in this browser.');
        return null;
      }
      audioCtx = new AC();
      // master gain
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioCtx.destination);
      return audioCtx;
    } catch (e) {
      console.warn('Error creating AudioContext:', e);
      audioCtx = null;
      return null;
    }
  }

  // Build an ambient background using layered oscillators and moving filters
  function initAudioOnGesture() {
    if (audioAllowed) return;
    const ac = safeCreateAudioContext();
    if (!ac) return;
    try {
      // Ambient layer 1 - slow sine pad
      const osc1 = ac.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 110; // low pad
      const g1 = ac.createGain();
      g1.gain.value = 0.0; // start muted

      const filt1 = ac.createBiquadFilter();
      filt1.type = 'lowpass';
      filt1.frequency.value = 800;

      osc1.connect(filt1);
      filt1.connect(g1);
      g1.connect(masterGain);
      osc1.start();

      // Ambient layer 2 - subtle detuned triangle for shimmer
      const osc2 = ac.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 132;
      const g2 = ac.createGain();
      g2.gain.value = 0.0;

      const filt2 = ac.createBiquadFilter();
      filt2.type = 'lowpass';
      filt2.frequency.value = 1200;
      filt2.Q.value = 0.7;

      osc2.connect(filt2);
      filt2.connect(g2);
      g2.connect(masterGain);
      osc2.start();

      // LFO to slowly modulate the filters for motion
      const lfo = ac.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 400;
      lfo.connect(lfoGain);
      lfoGain.connect(filt1.frequency);
      lfoGain.connect(filt2.frequency);
      lfo.start();

      // gentle pulse (optional) - low volume pulse
      const pulseOsc = ac.createOscillator();
      pulseOsc.type = 'sine';
      pulseOsc.frequency.value = 60;
      const pulseGain = ac.createGain();
      pulseGain.gain.value = 0.0;
      pulseOsc.connect(pulseGain);
      pulseGain.connect(masterGain);
      pulseOsc.start();

      backgroundNodes = [
        { osc: osc1, gain: g1 },
        { osc: osc2, gain: g2 },
        { osc: lfo, gain: lfoGain },
        { osc: pulseOsc, gain: pulseGain }
      ];

      backgroundGain = g1; // main control reference (g1/g2 will be ramped together)
      audioAllowed = true;
    } catch (e) {
      console.warn('Error initializing audio:', e);
      audioAllowed = false;
    }
  }

  // Toggle ambient background on/off
  let backgroundOn = false;
  function setBackgroundOn(on) {
    const ac = audioCtx;
    backgroundOn = !!on;
    if (!ac || !backgroundNodes.length) return;
    try {
      const now = ac.currentTime;
      // fade in/out each background gain
      backgroundNodes.forEach((n, i) => {
        try {
          if (!n.gain) return;
          n.gain.gain.cancelScheduledValues(now);
          if (backgroundOn) {
            // Slightly staggered fade for each layer to sound natural
            const delay = i * 0.12;
            n.gain.gain.setValueAtTime(0.0, now + delay);
            n.gain.gain.linearRampToValueAtTime(
              i === 2 ? 0.03 : (i === 1 ? 0.045 : 0.06),
              now + delay + 1.2
            );
          } else {
            n.gain.gain.setValueAtTime(n.gain.gain.value, now);
            n.gain.gain.linearRampToValueAtTime(0.0, now + 0.6);
          }
        } catch (e) {
          // continue even if one node errors
        }
      });
    } catch (e) {
      console.warn('Error toggling background:', e);
    }
  }

  // Utility to play a short synth note with envelope
  function playSynth({
    frequency = 440,
    duration = 0.25,
    type = 'sine',
    volume = 0.06,
    attack = 0.008,
    release = 0.12,
    detune = 0
  }) {
    const ac = audioCtx;
    if (!ac || !audioAllowed) return;
    try {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const filt = ac.createBiquadFilter();
      o.type = type;
      o.frequency.value = frequency;
      if (detune) o.detune.value = detune;
      filt.type = 'lowpass';
      filt.frequency.value = Math.max(600, frequency * 2);
      filt.Q.value = 0.7;
      o.connect(filt);
      filt.connect(g);
      g.connect(masterGain);
      const now = ac.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(volume, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
      o.start(now);
      o.stop(now + duration + release + 0.05);
    } catch (e) {
      console.warn('Error in playSynth:', e);
    }
  }

  // Click variations - tiny percussive click
  function playClick() {
    const ac = audioCtx;
    if (!ac || !audioAllowed) return;
    try {
      const now = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      const filt = ac.createBiquadFilter();
      o.type = 'square';
      o.frequency.value = 760 + Math.random() * 120;
      filt.type = 'highpass';
      filt.frequency.value = 600;
      o.connect(filt);
      filt.connect(g);
      g.connect(masterGain);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      o.start(now);
      o.stop(now + 0.12);
    } catch (e) {
      console.warn('Error in playClick:', e);
    }
  }

  // Improved correct tone: gentle chord + quick arpeggio, also spawn confetti
  function playCorrectTone() {
    const ac = audioCtx;
    if (!ac || !audioAllowed) {
      // still spawn small visual without audio
      spawnConfetti();
      return;
    }
    try {
      // chord base frequencies
      const base = 440;
      playSynth({ frequency: base, duration: 0.8, type: 'sine', volume: 0.06, attack: 0.02, release: 0.3 });
      playSynth({ frequency: base * 1.5, duration: 0.6, type: 'triangle', volume: 0.035, attack: 0.02, release: 0.25, detune: -8 });
      playSynth({ frequency: base * 2, duration: 0.5, type: 'sine', volume: 0.03, attack: 0.01, release: 0.2, detune: 5 });

      // arpeggio
      setTimeout(
        () => playSynth({ frequency: base * 1.25, duration: 0.18, type: 'sine', volume: 0.045, attack: 0.005, release: 0.08 }),
        120
      );
      setTimeout(
        () => playSynth({ frequency: base * 1.6, duration: 0.16, type: 'triangle', volume: 0.035, attack: 0.005, release: 0.07 }),
        260
      );
      setTimeout(
        () => playSynth({ frequency: base * 2.1, duration: 0.14, type: 'sine', volume: 0.03, attack: 0.005, release: 0.06 }),
        380
      );

      // small bell
      setTimeout(
        () => playSynth({ frequency: 1200, duration: 0.18, type: 'sine', volume: 0.02, attack: 0.002, release: 0.12 }),
        180
      );

      // spawn visual confetti to celebrate
      spawnConfetti();
    } catch (e) {
      console.warn('Error playing correct tone:', e);
      spawnConfetti();
    }
  }

  // Improved incorrect tone - soft descending wobble
  function playIncorrectTone() {
    const ac = audioCtx;
    if (!ac || !audioAllowed) return;
    try {
      playSynth({ frequency: 320, duration: 0.26, type: 'sawtooth', volume: 0.06, attack: 0.01, release: 0.12 });
      setTimeout(
        () => playSynth({ frequency: 260, duration: 0.22, type: 'sawtooth', volume: 0.045, attack: 0.01, release: 0.1 }),
        110
      );
      // a tiny sympathetic murmur
      setTimeout(
        () => playSynth({ frequency: 180, duration: 0.18, type: 'triangle', volume: 0.03, attack: 0.01, release: 0.08 }),
        190
      );
    } catch (e) {
      console.warn('Error playing incorrect tone:', e);
    }
  }

  // ------------------------------
  // Game state & logic (unchanged mechanics)
  // ------------------------------
  let level = 1;
  let targetSum = 0;
  let parts = [];
  let slots = new Array(SLOT_COUNT).fill(null);
  let conveyorOffset = 0;
  let selectedPartIndex = 0;
  let dragging = null;
  let animationId = null;
  let message = 'Welcome! Press SPACE or click parts to place them in the machine.';
  let successFlash = 0;
  let attemptsThisLevel = 0;
  let finished = false;

  // Calming palette (refined)
  const palette = {
    bg1: '#eaf8f7',
    bg2: '#f6fff9',
    panel: '#ffffff',
    accent: '#5fb7b2',
    accent2: '#ffbb6b',
    gear: '#c7e9e6',
    text: '#0f3f3a',
    part: '#fff0d9',
    wrong: '#ff9b9b',
    slotBg: '#f6f8f8',
    orbA: '#c8f0ec',
    orbB: '#dff7f5'
  };

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generatePartsForLevel(lv) {
    const count = 6;
    let maxValue = 8 + lv * 2;
    maxValue = Math.min(maxValue, 12);
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        value: randInt(1, maxValue),
        wobble: Math.random() * Math.PI * 2,
        rot: (Math.random() - 0.5) * 0.12,
        id: Math.random().toString(36).slice(2)
      });
    }
    return arr;
  }

  function computeTargetForLevel(lv) {
    const base = SLOT_COUNT * 2 + (lv - 1) * 3;
    return Math.max(base, SLOT_COUNT * 3);
  }

  function startLevel(lv) {
    level = lv;
    finished = false;
    attemptsThisLevel = 0;
    targetSum = computeTargetForLevel(level);
    parts = generatePartsForLevel(level);
    const combo = [];
    let remaining = targetSum;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const remainingSlots = SLOT_COUNT - i;
      const maxForSlot = Math.max(1, Math.min(12, Math.floor((remaining / remainingSlots) * 1.3)));
      const minForSlot = Math.max(1, Math.floor((remaining / remainingSlots) * 0.6));
      const val = i === SLOT_COUNT - 1 ? remaining : randInt(minForSlot, maxForSlot);
      combo.push(val);
      remaining -= val;
    }
    for (let i = 0; i < combo.length; i++) {
      parts[i].value = combo[i];
    }
    for (let i = parts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }
    slots = new Array(SLOT_COUNT).fill(null);
    conveyorOffset = 0;
    selectedPartIndex = 0;
    message = 'Place ' + SLOT_COUNT + ' parts whose numbers add up to ' + targetSum + '. Use mouse or keyboard.';
  }

  function checkSlots() {
    const filled = slots.every(s => s !== null);
    if (!filled) {
      message = `Fill all ${SLOT_COUNT} slots, then press Check (Enter) or it will auto-check.`;
      return false;
    }
    const sum = slots.reduce((acc, s) => acc + s.value, 0);
    attemptsThisLevel++;
    if (sum === targetSum) {
      successFlash = 40;
      playCorrectTone();
      message = 'Nice! The machine hums happily. Press Next to continue.';
      return true;
    } else {
      playIncorrectTone();
      message = `That totals ${sum}. Try again to reach ${targetSum}.`;
      return false;
    }
  }

  function placePartToSlot(partIndex) {
    if (finished) return;
    if (!parts[partIndex]) return;
    const nextSlot = slots.findIndex(s => s === null);
    if (nextSlot === -1) {
      message = 'All slots are full. Press Enter to check or remove a part.';
      playClick();
      return;
    }
    slots[nextSlot] = { ...parts[partIndex] };
    parts.splice(partIndex, 1);
    if (selectedPartIndex >= parts.length) selectedPartIndex = Math.max(0, parts.length - 1);
    playClick();
    message = 'Placed a part. Press Enter to check or continue placing.';
    if (slots.every(s => s !== null)) {
      const ok = checkSlots();
      if (ok) {
        setTimeout(() => {
          if (level >= TOTAL_LEVELS) {
            finished = true;
            message = 'You repaired all machines! You WIN! Press R to play again.';
          } else {
            startLevel(level + 1);
          }
        }, 900);
      } else {
        setTimeout(() => {
          const returned = slots
            .map(s => s && { value: s.value, wobble: Math.random() * Math.PI * 2, id: Math.random().toString(36).slice(2) })
            .filter(Boolean);
          parts = parts.concat(returned);
          slots = new Array(SLOT_COUNT).fill(null);
        }, 700);
      }
    }
  }

  function removeSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= slots.length || !slots[slotIndex]) {
      message = 'That slot is empty.';
      return;
    }
    parts.push({
      value: slots[slotIndex].value,
      wobble: Math.random() * Math.PI * 2,
      id: Math.random().toString(36).slice(2)
    });
    slots[slotIndex] = null;
    playClick();
    message = 'Removed a part from the machine.';
  }

  function restartGame() {
    level = 1;
    startLevel(1);
    finished = false;
    playClick();
  }

  // ------------------------------
  // Input handling (mouse, touch, keyboard) - unchanged mechanics
  // ------------------------------
  function toCanvasCoord(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  function hitTestPart(x, y) {
    const conveyorY = 360;
    const spacing = 92;
    const startX = 100;
    for (let i = 0; i < parts.length; i++) {
      const px = startX + i * spacing - (conveyorOffset % (spacing * Math.max(1, parts.length)));
      const py = conveyorY + Math.sin(parts[i].wobble + Date.now() / 800) * 8;
      const dx = x - px;
      const dy = y - py;
      if (Math.sqrt(dx * dx + dy * dy) < 36) {
        return i;
      }
    }
    return -1;
  }

  function hitTestSlot(x, y) {
    const slotY = 200;
    const slotWidth = 84;
    const slotSpacing = 112;
    const startX = (WIDTH - ((SLOT_COUNT - 1) * slotSpacing + slotWidth)) / 2;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const sx = startX + i * slotSpacing;
      const sy = slotY;
      if (x >= sx && x <= sx + slotWidth && y >= sy && y <= sy + 68) {
        return i;
      }
    }
    return -1;
  }

  canvas.addEventListener('mousedown', (ev) => {
    canvas.focus();
    initAudioOnGesture();
    const pos = toCanvasCoord(ev.clientX, ev.clientY);
    const pi = hitTestPart(pos.x, pos.y);
    if (pi >= 0) {
      const conveyorY = 360;
      const spacing = 92;
      const startX = 100;
      const px = startX + pi * spacing - (conveyorOffset % (spacing * Math.max(1, parts.length)));
      const py = conveyorY + Math.sin(parts[pi].wobble + Date.now() / 800) * 8;
      dragging = {
        partIndex: pi,
        offsetX: pos.x - px,
        offsetY: pos.y - py
      };
      selectedPartIndex = pi;
      playClick();
    } else {
      handleUIClick(pos.x, pos.y);
    }
  });

  canvas.addEventListener('mousemove', (ev) => {
    if (!dragging) return;
    const pos = toCanvasCoord(ev.clientX, ev.clientY);
    dragging.dragPos = { x: pos.x - dragging.offsetX, y: pos.y - dragging.offsetY };
    // highlight nearest part when not dragging
    const hoverIndex = hitTestPart(pos.x, pos.y);
    if (hoverIndex >= 0 && hoverIndex !== selectedPartIndex) {
      selectedPartIndex = hoverIndex;
    }
  });

  window.addEventListener('mouseup', (ev) => {
    if (!dragging) return;
    const pos = toCanvasCoord(ev.clientX, ev.clientY);
    const slotIndex = hitTestSlot(pos.x, pos.y);
    const originalIndex = dragging.partIndex;
    const draggedId = parts[originalIndex] ? parts[originalIndex].id : null;
    const actualIndex = parts.findIndex(p => p.id === draggedId);
    if (slotIndex >= 0 && actualIndex >= 0) {
      slots[slotIndex] = { ...parts[actualIndex] };
      parts.splice(actualIndex, 1);
      selectedPartIndex = Math.max(0, Math.min(parts.length - 1, actualIndex));
      playClick();
      message = 'Placed a part into slot ' + (slotIndex + 1) + '.';
      if (slots.every(s => s !== null)) {
        const ok = checkSlots();
        if (ok) {
          setTimeout(() => {
            if (level >= TOTAL_LEVELS) {
              finished = true;
              message = 'You repaired all machines! You WIN! Press R to play again.';
            } else {
              startLevel(level + 1);
            }
          }, 900);
        } else {
          setTimeout(() => {
            const returned = slots
              .map(s => s && { value: s.value, wobble: Math.random() * Math.PI * 2, id: Math.random().toString(36).slice(2) })
              .filter(Boolean);
            parts = parts.concat(returned);
            slots = new Array(SLOT_COUNT).fill(null);
          }, 700);
        }
      }
    } else {
      message = 'Dropped the part. Click or press SPACE on a part to place it into the next slot.';
    }
    dragging = null;
  });

  // Touch support
  canvas.addEventListener(
    'touchstart',
    (ev) => {
      ev.preventDefault();
      canvas.focus();
      initAudioOnGesture();
      const touch = ev.changedTouches[0];
      const pos = toCanvasCoord(touch.clientX, touch.clientY);
      const pi = hitTestPart(pos.x, pos.y);
      if (pi >= 0) {
        dragging = {
          partIndex: pi,
          offsetX: 0,
          offsetY: 0
        };
        selectedPartIndex = pi;
        playClick();
      } else {
        handleUIClick(pos.x, pos.y);
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (ev) => {
      ev.preventDefault();
      if (!dragging) return;
      const touch = ev.changedTouches[0];
      const pos = toCanvasCoord(touch.clientX, touch.clientY);
      dragging.dragPos = { x: pos.x - dragging.offsetX, y: pos.y - dragging.offsetY };
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchend',
    (ev) => {
      ev.preventDefault();
      if (!dragging) return;
      const touch = ev.changedTouches[0];
      const pos = toCanvasCoord(touch.clientX, touch.clientY);
      const slotIndex = hitTestSlot(pos.x, pos.y);
      const originalIndex = dragging.partIndex;
      const draggedId = parts[originalIndex] ? parts[originalIndex].id : null;
      const actualIndex = parts.findIndex(p => p.id === draggedId);
      if (slotIndex >= 0 && actualIndex >= 0) {
        slots[slotIndex] = { ...parts[actualIndex] };
        parts.splice(actualIndex, 1);
        playClick();
        message = 'Placed a part into slot ' + (slotIndex + 1) + '.';
        if (slots.every(s => s !== null)) {
          const ok = checkSlots();
          if (ok) {
            setTimeout(() => {
              if (level >= TOTAL_LEVELS) {
                finished = true;
                message = 'You repaired all machines! You WIN! Press R to play again.';
              } else {
                startLevel(level + 1);
              }
            }, 900);
          } else {
            setTimeout(() => {
              const returned = slots
                .map(s => s && { value: s.value, wobble: Math.random() * Math.PI * 2, id: Math.random().toString(36).slice(2) })
                .filter(Boolean);
              parts = parts.concat(returned);
              slots = new Array(SLOT_COUNT).fill(null);
            }, 700);
          }
        }
      } else {
        message = 'Dropped the part.';
      }
      dragging = null;
    },
    { passive: false }
  );

  // Keyboard controls
  canvas.addEventListener('keydown', (ev) => {
    initAudioOnGesture();
    if (ev.key === 'ArrowRight') {
      selectedPartIndex = Math.min(parts.length - 1, selectedPartIndex + 1);
      playClick();
      ev.preventDefault();
    } else if (ev.key === 'ArrowLeft') {
      selectedPartIndex = Math.max(0, selectedPartIndex - 1);
      playClick();
      ev.preventDefault();
    } else if (ev.key === ' ' || ev.key === 'Enter') {
      if (ev.key === 'Enter' && slots.every(s => s !== null)) {
        const ok = checkSlots();
        if (ok) {
          setTimeout(() => {
            if (level >= TOTAL_LEVELS) {
              finished = true;
              message = 'You repaired all machines! You WIN! Press R to play again.';
            } else {
              startLevel(level + 1);
            }
          }, 900);
        } else {
          setTimeout(() => {
            const returned = slots
              .map(s => s && { value: s.value, wobble: Math.random() * Math.PI * 2, id: Math.random().toString(36).slice(2) })
              .filter(Boolean);
            parts = parts.concat(returned);
            slots = new Array(SLOT_COUNT).fill(null);
          }, 700);
        }
      } else {
        if (parts[selectedPartIndex]) {
          placePartToSlot(selectedPartIndex);
        } else {
          message = 'No part selected.';
        }
      }
      ev.preventDefault();
    } else if (ev.key === 'Backspace' || ev.key === 'Delete') {
      const lastFilled = slots.map((s, i) => (s ? i : -1)).filter(i => i >= 0).pop();
      if (lastFilled !== undefined && lastFilled >= 0) {
        removeSlot(lastFilled);
      } else {
        message = 'No parts to remove.';
      }
      ev.preventDefault();
    } else if (ev.key.toLowerCase() === 'r') {
      restartGame();
      ev.preventDefault();
    } else if (ev.key.toLowerCase() === 'm') {
      setBackgroundOn(!backgroundOn);
      playClick();
      ev.preventDefault();
    } else if (ev.key === 'Tab') {
      selectedPartIndex = (selectedPartIndex + 1) % Math.max(1, parts.length);
      ev.preventDefault();
    }
  });

  function handleUIClick(x, y) {
    const audioBox = { x: WIDTH - 72, y: 12, w: 60, h: 28 };
    if (x >= audioBox.x && x <= audioBox.x + audioBox.w && y >= audioBox.y && y <= audioBox.y + audioBox.h) {
      initAudioOnGesture();
      if (!audioCtx) {
        message = 'Audio unavailable in this browser.';
        return;
      }
      if (!audioAllowed) {
        audioAllowed = true;
      }
      setBackgroundOn(!backgroundOn);
      playClick();
      return;
    }
    const actionBox = { x: WIDTH - 140, y: HEIGHT - 62, w: 120, h: 44 };
    if (x >= actionBox.x && x <= actionBox.x + actionBox.w && y >= actionBox.y && y <= actionBox.y + actionBox.h) {
      if (finished) {
        restartGame();
      } else {
        if (slots.every(s => s !== null) && slots.reduce((a, b) => a + b.value, 0) === targetSum) {
          if (level >= TOTAL_LEVELS) {
            finished = true;
            message = 'You repaired all machines! You WIN! Press R to play again.';
          } else {
            startLevel(level + 1);
          }
        } else {
          const ok = checkSlots();
          if (ok) {
            if (level >= TOTAL_LEVELS) {
              finished = true;
              message = 'You repaired all machines! You WIN! Press R to play again.';
            } else {
              startLevel(level + 1);
            }
          } else {
            setTimeout(() => {
              const returned = slots
                .map(s => s && { value: s.value, wobble: Math.random() * Math.PI * 2, id: Math.random().toString(36).slice(2) })
                .filter(Boolean);
              parts = parts.concat(returned);
              slots = new Array(SLOT_COUNT).fill(null);
            }, 700);
          }
        }
      }
      playClick();
      return;
    }
    const slotIndex = hitTestSlot(x, y);
    if (slotIndex >= 0 && slots[slotIndex]) {
      removeSlot(slotIndex);
      return;
    }
  }

  // ------------------------------
  // Rendering functions (visual overhaul)
  // ------------------------------
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

  // Soft animated background with subtle orbs
  const orbs = [];
  for (let i = 0; i < 10; i++) {
    orbs.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      r: 30 + Math.random() * 60,
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.03,
      col: Math.random() > 0.5 ? palette.orbA : palette.orbB,
      phase: Math.random() * Math.PI * 2
    });
  }

  // Gear base rotation
  function currentGearAngle() {
    return (Date.now() / 2000) % (Math.PI * 2);
  }

  function drawScene() {
    // gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, palette.bg1);
    grad.addColorStop(1, palette.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // floating orbs
    ctx.save();
    ctx.globalAlpha = 0.14;
    orbs.forEach(o => {
      o.x += o.vx;
      o.y += o.vy;
      o.phase += 0.002;
      // wrap
      if (o.x < -o.r) o.x = WIDTH + o.r;
      if (o.x > WIDTH + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = HEIGHT + o.r;
      if (o.y > HEIGHT + o.r) o.y = -o.r;
      const scale = 0.9 + Math.sin(o.phase) * 0.08;
      ctx.fillStyle = o.col;
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.r * scale, o.r * 0.7 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // top panel
    ctx.fillStyle = palette.panel;
    drawRoundedRect(12, 12, WIDTH - 24, 68, 12);

    // title with subtle shadow
    ctx.font = '22px system-ui, Arial';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#082d2a';
    ctx.fillText('Machine Match • Fix the Wacky Machine', 28, 40);
    ctx.font = '13px system-ui, Arial';
    ctx.fillStyle = '#36514f';
    ctx.fillText('Place parts so their numbers add to the target. Use mouse/touch or keyboard.', 28, 58);

    // audio toggle button with speaker icon
    const audioBox = { x: WIDTH - 72, y: 12, w: 60, h: 28 };
    ctx.fillStyle = audioAllowed ? (backgroundOn ? '#a6efe9' : '#ebfbfa') : '#f0f6f5';
    ctx.strokeStyle = '#d7efec';
    ctx.lineWidth = 1;
    drawRoundedRect(audioBox.x, audioBox.y, audioBox.w, audioBox.h, 8);
    // speaker icon
    const sx = audioBox.x + 8;
    const sy = audioBox.y + 8;
    ctx.fillStyle = '#0a2f2b';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 8, sy);
    ctx.lineTo(sx + 14, sy - 6);
    ctx.lineTo(sx + 14, sy + 20);
    ctx.lineTo(sx + 8, sy + 14);
    ctx.lineTo(sx, sy + 14);
    ctx.closePath();
    ctx.fill();
    // speaker waves
    if (backgroundOn) {
      ctx.beginPath();
      ctx.arc(sx + 18, sy + 6, 8, -0.6, 0.6);
      ctx.strokeStyle = '#0a2f2b';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.font = '12px system-ui, Arial';
    ctx.fillStyle = '#0a2f2b';
    ctx.fillText(backgroundOn ? 'Sound: ON' : 'Sound: Off', audioBox.x + 30, audioBox.y + 17);

    // main machine panel
    const panelX = 24;
    const panelY = 96;
    const panelW = WIDTH - 48;
    const panelH = 280;
    ctx.fillStyle = palette.panel;
    drawRoundedRect(panelX, panelY, panelW, panelH, 14);

    // machine drawing
    drawMachine(panelX + 16, panelY + 20, panelW - 32, panelH - 40);

    // slots and conveyor
    drawSlots();
    drawConveyor();

    // action box
    drawActionBox();

    // info text
    ctx.font = '16px system-ui, Arial';
    ctx.fillStyle = palette.text;
    ctx.fillText('Level ' + level + ' / ' + TOTAL_LEVELS + '   Target: ' + targetSum, 28, HEIGHT - 36);
    ctx.font = '13px system-ui, Arial';
    ctx.fillStyle = '#2f5a56';
    ctx.fillText(message, 28, HEIGHT - 18);

    // success flash overlay
    if (successFlash > 0) {
      ctx.fillStyle = 'rgba(115, 210, 175,' + (Math.min(1, (successFlash / 40) * 0.6)) + ')';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      successFlash--;
    }

    // confetti draw/update
    updateAndDrawConfetti();

    // footer help
    ctx.font = '11px system-ui, Arial';
    ctx.fillStyle = '#3a6a66';
    ctx.fillText('Keys: ← → select part • Space/Enter place • Delete remove • M toggle sound • R restart', 24, HEIGHT - 6);

    // audio availability note
    ctx.font = '11px system-ui, Arial';
    ctx.fillStyle = '#2b5a56';
    ctx.fillText('Audio: ' + (audioCtx ? 'Available' : 'Unavailable until you click'), WIDTH - 220, 30);
  }

  function drawMachine(x, y, w, h) {
    ctx.save();
    ctx.translate(x, y);
    // machine interior gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f7fffd');
    g.addColorStop(1, '#eafff8');
    ctx.fillStyle = g;
    drawRoundedRect(0, 0, w, h, 12);

    // left big rotating gear
    const gearAngle = currentGearAngle();
    drawGear(72, 90, 60, 14, palette.gear, '#d7f6f2', gearAngle);

    // small gear upper-right rotates opposite
    drawGear(w - 96, 60, 30, 8, palette.accent2, '#ffe5c9', -gearAngle * 1.6);

    // machine screen
    ctx.fillStyle = '#0a403d';
    drawRoundedRect(150, 22, w - 320, 84, 10);
    ctx.fillStyle = '#c9f2ef';
    ctx.font = '18px system-ui, Arial';
    ctx.fillText('Machine Monitor', 170, 46);
    ctx.font = '26px system-ui, Arial';
    ctx.fillStyle = '#053735';
    ctx.fillText('Target: ' + targetSum, 170, 76);

    // pipes with subtle highlights
    ctx.strokeStyle = '#cfe8e4';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(68, 150);
    ctx.lineTo(68, 200);
    ctx.lineTo(220, 200);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w - 60, 120);
    ctx.quadraticCurveTo(w - 180, 180, w - 220, 230);
    ctx.stroke();

    // friendly face on big gear
    ctx.fillStyle = '#043735';
    ctx.beginPath();
    ctx.arc(72, 90, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(92, 90, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#043735';
    ctx.arc(82, 100, 10, 0, Math.PI, false);
    ctx.stroke();

    ctx.restore();
  }

  function drawGear(cx, cy, radius, teeth, color, innerColor, rotation = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation || 0);
    // teeth
    ctx.fillStyle = color;
    ctx.beginPath();
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const r = radius + (i % Math.max(2, Math.floor(steps / teeth)) === 0 ? Math.max(6, radius * 0.12) : 0);
      const x = Math.cos(theta) * r;
      const y = Math.sin(theta) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // inner hub
    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // subtle highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -radius * 0.1, radius * 0.6, -0.6, 0.6);
    ctx.stroke();
    ctx.restore();
  }

  function drawSlots() {
    const slotY = 200;
    const slotWidth = 84;
    const slotHeight = 68;
    const slotSpacing = 112;
    const startX = (WIDTH - ((SLOT_COUNT - 1) * slotSpacing + slotWidth)) / 2;
    ctx.font = '14px system-ui, Arial';
    ctx.fillStyle = '#1f5a56';
    ctx.fillText('Machine Input Slots', startX, slotY - 22);

    for (let i = 0; i < SLOT_COUNT; i++) {
      const sx = startX + i * slotSpacing;
      // pulsing background when empty to guide
      if (slots[i]) {
        ctx.fillStyle = palette.accent;
      } else {
        const pulse = 0.85 + Math.sin(Date.now() / 900 + i) * 0.07;
        ctx.fillStyle = shadeColor(palette.slotBg, -6 * pulse);
      }
      drawRoundedRect(sx, slotY, slotWidth, slotHeight, 10);
      ctx.fillStyle = '#073736';
      ctx.font = '14px system-ui, Arial';
      ctx.fillText('Slot ' + (i + 1), sx + 10, slotY + 20);
      if (slots[i]) {
        ctx.fillStyle = '#042f2d';
        ctx.font = '28px system-ui, Arial';
        ctx.fillText(slots[i].value, sx + slotWidth / 2 - 8, slotY + slotHeight / 2 + 10);
        ctx.font = '11px system-ui, Arial';
        ctx.fillStyle = '#0f3f3a';
        ctx.fillText('Click to remove', sx + 8, slotY + slotHeight - 8);
      } else {
        ctx.font = '12px system-ui, Arial';
        ctx.fillStyle = '#2b6b68';
        ctx.fillText('Empty', sx + 10, slotY + 40);
      }
    }
  }

  // small color shading helper
  function shadeColor(hex, percent) {
    try {
      const c = hex.replace('#', '');
      const num = parseInt(c, 16);
      const r = Math.min(255, Math.max(0, (num >> 16) + percent));
      const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
      const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
      return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    } catch (e) {
      return hex;
    }
  }

  function drawConveyor() {
    const convY = 360;
    ctx.fillStyle = '#e6f6f4';
    drawRoundedRect(40, convY - 36, WIDTH - 80, 80, 18);

    // moving dots texture
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#9ad4cf';
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(80 + i * 60 + (conveyorOffset / 6) % 60, convY, 24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const spacing = 92;
    const startX = 100;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.wobble += 0.006; // gentle motion
      const px = startX + i * spacing - (conveyorOffset % (spacing * Math.max(1, parts.length)));
      const py = convY + Math.sin(p.wobble + Date.now() / 1000) * 8;
      const isSelected = i === selectedPartIndex;
      if (dragging && dragging.partIndex === i) {
        continue;
      }
      drawPart(px, py, p, isSelected, false);
    }

    if (dragging && dragging.dragPos) {
      const originalIndex = dragging.partIndex;
      const draggedId = parts[originalIndex] ? parts[originalIndex].id : null;
      const actualIndex = parts.findIndex(p => p.id === draggedId);
      if (actualIndex >= 0) {
        const p = parts[actualIndex];
        drawPart(dragging.dragPos.x, dragging.dragPos.y, p, true, true);
      }
    }

    ctx.fillStyle = '#2a5a57';
    ctx.font = '13px system-ui, Arial';
    ctx.fillText('Conveyor: Click or drag a part to the machine slots.', 44, convY - 44);
  }

  function drawPart(x, y, part, highlighted = false, translucent = false) {
    ctx.save();
    ctx.translate(x, y);
    const wob = Math.sin(part.wobble + Date.now() / 700) * 0.6;
    const rot = part.rot * (highlighted ? 2 : 1) + wob * 0.02;
    ctx.rotate(rot);
    // shadow
    ctx.fillStyle = 'rgba(20, 30, 28, 0.08)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 40, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = translucent ? 0.92 : 1.0;
    ctx.fillStyle = palette.part;
    drawRoundedRect(-36, -22, 72, 52, 12);

    // bolts
    ctx.fillStyle = '#d4b382';
    ctx.beginPath();
    ctx.arc(-16, -4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(16, -4, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#052f2d';
    ctx.font = highlighted ? '26px system-ui, Arial' : '22px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(part.value, 0, 6);

    // subtle decorative stroke
    ctx.strokeStyle = 'rgba(4,95,90,0.06)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-30, 14);
    ctx.quadraticCurveTo(0, 26, 30, 14);
    ctx.stroke();

    if (highlighted) {
      // glow
      ctx.strokeStyle = 'rgba(95,183,178,0.24)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.rect(-38, -24, 76, 56);
      ctx.stroke();
      // small halo
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.ellipse(0, 6, 52, 28, 0, 0, Math.PI * 2);
      ctx.fillStyle = palette.accent;
      ctx.fill();
    }

    ctx.restore();
  }

  function drawActionBox() {
    const boxW = 120;
    const boxH = 44;
    const boxX = WIDTH - 140;
    const boxY = HEIGHT - 62;
    ctx.fillStyle = palette.accent;
    drawRoundedRect(boxX, boxY, boxW, boxH, 10);
    ctx.fillStyle = '#042d2a';
    ctx.font = '16px system-ui, Arial';
    ctx.fillText(finished ? 'Restart' : 'Check/Next', boxX + 12, boxY + (boxH / 2) + 6);
  }

  // ------------------------------
  // Confetti particle system (visual only, subtle)
  // ------------------------------
  function spawnConfetti() {
    for (let i = 0; i < 28; i++) {
      confettiParticles.push({
        x: WIDTH / 2 + (Math.random() - 0.5) * 200,
        y: 120 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 4,
        vy: -2 - Math.random() * 2,
        size: 6 + Math.random() * 8,
        life: 80 + Math.floor(Math.random() * 40),
        rot: Math.random() * Math.PI * 2,
        vrota: (Math.random() - 0.5) * 0.2,
        color: ['#ffb86b', '#5fb7b2', '#ffd28a', '#a5f0e2'][Math.floor(Math.random() * 4)]
      });
    }
  }

  function updateAndDrawConfetti() {
    if (!confettiParticles.length) return;
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.rot += p.vrota;
      p.life--;
      // draw
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
      if (p.life <= 0 || p.y > HEIGHT + 30) {
        confettiParticles.splice(i, 1);
      }
    }
  }

  // ------------------------------
  // Animation loop
  // ------------------------------
  function step() {
    conveyorOffset += 0.6 + Math.sin(Date.now() / 1200) * 0.35;
    drawScene();
    animationId = requestAnimationFrame(step);
  }

  // ------------------------------
  // Boot sequence
  // ------------------------------
  safeCreateAudioContext();
  startLevel(1);
  step();

  // Stop background gently on blur
  window.addEventListener('blur', () => {
    if (audioCtx && backgroundNodes.length) {
      try {
        backgroundNodes.forEach((n) => {
          if (n.gain) {
            n.gain.gain.cancelScheduledValues(audioCtx.currentTime);
            n.gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
          }
        });
      } catch (e) {}
    }
  });

  window.addEventListener('beforeunload', () => {
    if (audioCtx) {
      try {
        audioCtx.close();
      } catch (e) {}
    }
  });
})();