(function () {
  'use strict';

  // --- Setup DOM and Canvas ---
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container element with id "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Electricity math game. Drag numbered charges to lamps to match a target. Use mouse or keyboard. Press space to pick up or drop a charge. Click enable sound to play audio.'
  );
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Game area size
  const GAME_W = 720;
  const GAME_H = 480;

  // Accessibility and state messages
  let accessibilityMessage = 'Welcome! Use mouse or keyboard. Press space to pick up/drop charges.';

  // --- Audio Setup with error handling ---
  let audioCtx = null;
  let masterGain = null;
  let backgroundGain = null;
  let soundEnabled = false;
  let bgOsc1 = null;
  let bgOsc2 = null;
  let bgFilter = null;
  let bgLfo = null;
  let noiseBuffer = null;

  function createNoiseBuffer() {
    if (!audioCtx) return null;
    try {
      const len = audioCtx.sampleRate * 1.0;
      const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
      return buffer;
    } catch (err) {
      console.warn('Noise buffer creation failed', err);
      return null;
    }
  }

  // Safe AudioContext creation; call on user gesture
  function tryCreateAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio API not supported');
      audioCtx = new AudioCtx();

      // Master gain
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioCtx.destination);

      // Background group
      backgroundGain = audioCtx.createGain();
      backgroundGain.gain.value = 0.06;
      backgroundGain.connect(masterGain);

      // Two slightly detuned oscillators for warm hum
      bgOsc1 = audioCtx.createOscillator();
      bgOsc2 = audioCtx.createOscillator();
      bgOsc1.type = 'sine';
      bgOsc2.type = 'sine';
      bgOsc1.frequency.value = 50;
      bgOsc2.frequency.value = 52.5;

      // gentle lowpass filter to make background soft
      bgFilter = audioCtx.createBiquadFilter();
      bgFilter.type = 'lowpass';
      bgFilter.frequency.value = 700;

      // subtle LFO modulating filter frequency for breathing effect
      bgLfo = audioCtx.createOscillator();
      const bgLfoGain = audioCtx.createGain();
      bgLfo.type = 'sine';
      bgLfo.frequency.value = 0.12;
      bgLfoGain.gain.value = 220;
      bgLfo.connect(bgLfoGain);
      bgLfoGain.connect(bgFilter.frequency);

      // connect background oscillators -> filter -> backgroundGain
      bgOsc1.connect(bgFilter);
      bgOsc2.connect(bgFilter);
      bgFilter.connect(backgroundGain);

      // Start nodes
      bgOsc1.start();
      bgOsc2.start();
      bgLfo.start();

      // Pre-generate a noise buffer for short percussive sounds
      noiseBuffer = createNoiseBuffer();

      soundEnabled = true;
      return audioCtx;
    } catch (err) {
      console.warn('Audio initialization failed:', err);
      audioCtx = null;
      soundEnabled = false;
      return null;
    }
  }

  // Envelope helper for simple tones
  function playTone({ type = 'sine', frequency = 440, duration = 0.18, volume = 0.12, detune = 0 }) {
    if (!audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = frequency;
      o.detune.value = detune;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      const now = audioCtx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.start(now);
      o.stop(now + duration + 0.05);
    } catch (err) {
      console.warn('playTone error', err);
    }
  }

  // Play a short noise burst combined with a chirp for clicks / pickup
  function playClick() {
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // chirp oscillator
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(720, now);
      o.frequency.exponentialRampToValueAtTime(1080, now + 0.09);
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.start(now);
      o.stop(now + 0.14);

      // small filtered noise
      if (noiseBuffer) {
        const nb = audioCtx.createBufferSource();
        nb.buffer = noiseBuffer;
        const ng = audioCtx.createGain();
        const nf = audioCtx.createBiquadFilter();
        nf.type = 'highpass';
        nf.frequency.value = 800;
        ng.gain.value = 0.08;
        nb.connect(nf);
        nf.connect(ng);
        ng.connect(masterGain);
        nb.start(now);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        nb.stop(now + 0.13);
      }
    } catch (err) {
      console.warn('playClick error', err);
    }
  }

  // Pleasant ascending chime for correct completion
  function playCorrect() {
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // layered bells
      const freqs = [420, 540, 720];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = i === 2 ? 'sine' : 'triangle';
        o.frequency.setValueAtTime(f, now);
        o.frequency.exponentialRampToValueAtTime(f * 1.4, now + 0.28);
        g.gain.value = 0.0001;
        o.connect(g);
        // light lowpass for warmth
        const filt = audioCtx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 1600 - i * 300;
        g.connect(filt);
        filt.connect(masterGain);
        g.gain.exponentialRampToValueAtTime(0.22 / (i + 1), now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        o.start(now + i * 0.02);
        o.stop(now + 0.85 + i * 0.02);
      });
    } catch (err) {
      console.warn('playCorrect error', err);
    }
  }

  // Warm, short buzzer for incorrect
  function playIncorrect() {
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(260, now);
      o.frequency.exponentialRampToValueAtTime(90, now + 0.3);
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(masterGain);
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      o.start(now);
      o.stop(now + 0.5);

      // a small noisy pop
      if (noiseBuffer) {
        const nb = audioCtx.createBufferSource();
        nb.buffer = noiseBuffer;
        const ng = audioCtx.createGain();
        const nf = audioCtx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = 1200;
        ng.gain.value = 0.08;
        nb.connect(nf);
        nf.connect(ng);
        ng.connect(masterGain);
        nb.start(now + 0.02);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        nb.stop(now + 0.4);
      }
    } catch (err) {
      console.warn('playIncorrect error', err);
    }
  }

  // --- Game Data & Characters ---
  const characters = {
    spark: { name: 'Spark', desc: 'A tiny zig-zag lightning buddy who giggles when lamps light.' },
    watt: { name: 'Professor Watt', desc: 'A wise glowing bulb owl who asks for exact power.' },
    gigi: { name: 'Gigi the Gizmo', desc: 'A wacky robot helper who hands you charges.' },
  };

  function generateLampTargets() {
    const list = [5, 7, 9, 6, 10];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  let lampTargets = generateLampTargets();

  function generateCharges(count = 8) {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push(1 + Math.floor(Math.random() * 9));
    }
    return arr;
  }
  let charges = generateCharges(9);

  const chargeObjects = [];
  const QUEUE_START_X = 40;
  const QUEUE_START_Y = 360;
  function layoutCharges() {
    chargeObjects.length = 0;
    for (let i = 0; i < charges.length; i++) {
      const num = charges[i];
      const x = QUEUE_START_X + i * 70;
      const y = QUEUE_START_Y;
      chargeObjects.push({
        id: 'c' + i,
        num,
        x,
        y,
        w: 56,
        h: 56,
        held: false,
        homeX: x,
        homeY: y,
      });
    }
  }
  layoutCharges();

  const lamps = [];
  function layoutLamps() {
    lamps.length = 0;
    const startX = 80;
    const startY = 80;
    const gapX = 120;
    for (let i = 0; i < lampTargets.length; i++) {
      const x = startX + i * gapX;
      const y = startY;
      lamps.push({
        id: 'L' + i,
        x,
        y,
        w: 96,
        h: 140,
        target: lampTargets[i],
        current: 0,
        filled: false,
        sockets: [
          { dx: -20, dy: 60, occupied: null },
          { dx: 0, dy: 60, occupied: null },
          { dx: 20, dy: 60, occupied: null },
        ],
      });
    }
  }
  layoutLamps();

  let heldCharge = null;
  let pointer = { x: GAME_W / 2, y: GAME_H / 2, isDown: false };
  let score = 0;
  let mistakes = 0;
  let level = 1;
  let lastSparkTime = 0;
  let lastFilledLamp = null;

  let selectedIndex = 0;
  function clampSelected() {
    if (chargeObjects.length === 0) {
      selectedIndex = -1;
      return;
    }
    selectedIndex = Math.max(0, Math.min(chargeObjects.length - 1, selectedIndex));
  }
  clampSelected();

  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // Drag & Drop logic unchanged but we set lastFilledLamp when completed (cosmetic)
  function pickUpCharge(chg) {
    if (!chg) return;
    heldCharge = chg;
    chg.held = true;
    const idx = chargeObjects.indexOf(chg);
    if (idx >= 0) {
      chargeObjects.splice(idx, 1);
      chargeObjects.push(chg);
    }
    accessibilityMessage = `Picked up charge ${chg.num}. Use pointer or arrow keys to move, press space to drop.`;
    if (!audioCtx) tryCreateAudioContext();
    if (soundEnabled) playClick();
  }

  function dropChargeAt(x, y) {
    if (!heldCharge) return;
    const chg = heldCharge;
    let placed = false;
    for (const lamp of lamps) {
      for (let si = 0; si < lamp.sockets.length; si++) {
        const s = lamp.sockets[si];
        const sx = lamp.x + lamp.w / 2 + s.dx;
        const sy = lamp.y + s.dy;
        const dx = x - sx;
        const dy = y - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 34 && !s.occupied && !lamp.filled) {
          s.occupied = chg;
          chg.x = sx - chg.w / 2;
          chg.y = sy - chg.h / 2;
          chg.homeX = chg.x;
          chg.homeY = chg.y;
          chg.placedOn = lamp.id;
          lamp.current += chg.num;
          placed = true;
          accessibilityMessage = `${characters.watt.name} says: added ${chg.num} charge to lamp needing ${lamp.target}. Current total ${lamp.current}.`;
          if (soundEnabled) playClick();
          checkLamp(lamp);
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      chg.x = chg.homeX;
      chg.y = chg.homeY;
      chg.held = false;
      chg.placedOn = null;
      accessibilityMessage = 'Charge returned to the queue.';
      if (soundEnabled) playClick();
    } else {
      chg.held = false;
    }
    heldCharge = null;
  }

  function checkLamp(lamp) {
    if (lamp.current === lamp.target) {
      lamp.filled = true;
      score += 10;
      accessibilityMessage = `${characters.spark.name} giggles! Lamp completed! You earned 10 points.`;
      lastSparkTime = performance.now();
      lastFilledLamp = lamp;
      if (soundEnabled) playCorrect();
    } else if (lamp.current > lamp.target) {
      mistakes += 1;
      accessibilityMessage = `${characters.gigi.name} buzzes! Too much power. Charges will be returned.`;
      if (soundEnabled) playIncorrect();
      for (let si = 0; si < lamp.sockets.length; si++) {
        const s = lamp.sockets[si];
        if (s.occupied) {
          const ch = s.occupied;
          ch.x = ch.homeX;
          ch.y = ch.homeY;
          ch.held = false;
          ch.placedOn = null;
          s.occupied = null;
        }
      }
      lamp.current = 0;
      lamp.filled = false;
    } else {
      if (soundEnabled) playClick();
    }
  }

  function resetLevel() {
    lampTargets = generateLampTargets();
    lampTargets.length = 5;
    for (let i = 0; i < lampTargets.length; i++) lampTargets[i] = lampTargets[i] || 5;
    lamps.forEach((l, idx) => {
      l.target = lampTargets[idx];
      l.current = 0;
      l.filled = false;
      for (const s of l.sockets) s.occupied = null;
    });
    charges = generateCharges(9);
    layoutCharges();
    score = 0;
    mistakes = 0;
    accessibilityMessage = "New challenge! Place charges to match each lamp's target power.";
  }

  // --- Input Handling ---
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    pointer.isDown = true;
    pointer.x = px;
    pointer.y = py;

    if (!audioCtx) {
      tryCreateAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      if (soundEnabled) accessibilityMessage = 'Sound enabled. Good luck!';
      else accessibilityMessage = 'Sound not available. Continue playing silently.';
    }

    for (let i = chargeObjects.length - 1; i >= 0; i--) {
      const ch = chargeObjects[i];
      if (pointInRect(px, py, ch)) {
        pickUpCharge(ch);
        ch.x = px - ch.w / 2;
        ch.y = py - ch.h / 2;
        return;
      }
    }

    for (const lamp of lamps) {
      for (const s of lamp.sockets) {
        if (s.occupied) {
          const sx = lamp.x + lamp.w / 2 + s.dx;
          const sy = lamp.y + s.dy;
          const rect = { x: sx - 28, y: sy - 28, w: 56, h: 56 };
          if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
            const ch = s.occupied;
            s.occupied = null;
            lamp.current -= ch.num;
            ch.held = true;
            heldCharge = ch;
            ch.x = px - ch.w / 2;
            ch.y = py - ch.h / 2;
            accessibilityMessage = `Picked up charge ${ch.num} from lamp.`;
            if (!audioCtx) tryCreateAudioContext();
            if (soundEnabled) playClick();
            return;
          }
        }
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    pointer.x = px;
    pointer.y = py;
    if (heldCharge) {
      heldCharge.x = px - heldCharge.w / 2;
      heldCharge.y = py - heldCharge.h / 2;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    pointer.isDown = false;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (heldCharge) {
      dropChargeAt(px, py);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    pointer.isDown = false;
  });

  canvas.addEventListener('keydown', (e) => {
    const key = e.key;
    const gridMove = 8;
    if (key === 'ArrowLeft') {
      if (heldCharge) {
        heldCharge.x -= gridMove;
      } else {
        selectedIndex = Math.max(0, selectedIndex - 1);
        accessibilityMessage = `Selected charge ${chargeObjects[selectedIndex] ? chargeObjects[selectedIndex].num : ''}.`;
      }
      e.preventDefault();
    } else if (key === 'ArrowRight') {
      if (heldCharge) {
        heldCharge.x += gridMove;
      } else {
        selectedIndex = Math.min(chargeObjects.length - 1, selectedIndex + 1);
        accessibilityMessage = `Selected charge ${chargeObjects[selectedIndex] ? chargeObjects[selectedIndex].num : ''}.`;
      }
      e.preventDefault();
    } else if (key === 'ArrowUp') {
      if (heldCharge) heldCharge.y -= gridMove;
      else accessibilityMessage = 'Tip: Press space to pick up the selected charge.';
      e.preventDefault();
    } else if (key === 'ArrowDown') {
      if (heldCharge) heldCharge.y += gridMove;
      e.preventDefault();
    } else if (key === ' ' || key === 'Spacebar') {
      e.preventDefault();
      if (!heldCharge && selectedIndex >= 0 && chargeObjects[selectedIndex]) {
        pickUpCharge(chargeObjects[selectedIndex]);
      } else if (heldCharge) {
        const dropX = heldCharge.x + heldCharge.w / 2;
        const dropY = heldCharge.y + heldCharge.h / 2;
        dropChargeAt(dropX, dropY);
      }
    } else if (key.toLowerCase() === 'r') {
      resetLevel();
      if (!audioCtx) tryCreateAudioContext();
      if (soundEnabled) playTone({ frequency: 330, duration: 0.12, volume: 0.06 });
    } else if (key.toLowerCase() === 's') {
      if (!audioCtx) {
        tryCreateAudioContext();
      }
      if (audioCtx) {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            soundEnabled = true;
            accessibilityMessage = 'Sound turned on.';
            if (soundEnabled) playClick();
          }).catch(() => {});
        } else {
          audioCtx.suspend().then(() => {
            soundEnabled = false;
            accessibilityMessage = 'Sound turned off.';
          }).catch(() => {});
        }
      } else {
        accessibilityMessage = 'Sound unavailable on this device/browser.';
      }
    }
  });

  canvas.addEventListener('focus', () => {
    accessibilityMessage = 'Use arrows and space to pick up and place charges. Press R to reset, S to toggle sound.';
  });

  // --- Visual enhancements ---
  // Soft floating orbs in background
  const bgOrbs = [];
  for (let i = 0; i < 10; i++) {
    bgOrbs.push({
      x: Math.random() * GAME_W,
      y: Math.random() * GAME_H,
      r: 20 + Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.02,
      hue: 190 + Math.random() * 60,
      alpha: 0.05 + Math.random() * 0.06,
    });
  }

  // Particle bursts when lamp is completed
  const particles = [];

  function spawnLampParticles(lamp) {
    const cx = lamp.x + lamp.w / 2;
    const cy = lamp.y + 54;
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.8;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.2,
        life: 1000 + Math.random() * 600,
        born: performance.now(),
        size: 2 + Math.random() * 4,
        hue: 45 + Math.random() * 40,
      });
    }
  }

  // draw background with subtle animated elements
  function drawBackground(now) {
    // vertical soft gradient
    const g = ctx.createLinearGradient(0, 0, 0, GAME_H);
    g.addColorStop(0, '#F3FBFF');
    g.addColorStop(1, '#F8FAFF');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // vignette
    const vg = ctx.createRadialGradient(GAME_W / 2, GAME_H / 2, 80, GAME_W / 2, GAME_H / 2, 520);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(30,60,90,0.02)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // moving orbs
    ctx.save();
    for (let i = 0; i < bgOrbs.length; i++) {
      const o = bgOrbs[i];
      o.x += o.vx + Math.sin(now / 1400 + i) * 0.06;
      o.y += o.vy + Math.cos(now / 1000 + i) * 0.03;
      if (o.x < -60) o.x = GAME_W + 60;
      if (o.x > GAME_W + 60) o.x = -60;
      if (o.y < -60) o.y = GAME_H + 60;
      if (o.y > GAME_H + 60) o.y = -60;
      const orbGrad = ctx.createRadialGradient(o.x - o.r * 0.2, o.y - o.r * 0.2, 10, o.x, o.y, o.r);
      orbGrad.addColorStop(0, `hsla(${o.hue}, 80%, 80%, ${o.alpha})`);
      orbGrad.addColorStop(1, `hsla(${o.hue}, 70%, 60%, 0)`);
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // gentle current lines
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#9FE8FF';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const startY = 60 + i * 80;
      ctx.moveTo(10, startY + Math.sin(now / 1400 + i) * 10);
      for (let x = 10; x < GAME_W - 10; x += 40) {
        ctx.lineTo(x, startY + Math.sin(now / 700 + x / 120 + i) * 14);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Character art refined with subtle animation
  function drawCharacters(now) {
    // Spark - stylized lightning friend
    const sx = 42;
    const sy = 414 + Math.sin(now / 400) * 2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = '#FFD24D';
    ctx.strokeStyle = '#FFB400';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, -2);
    ctx.lineTo(12, 10);
    ctx.lineTo(-2, 2);
    ctx.lineTo(8, 16);
    ctx.lineTo(-10, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-2, -6, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -8, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.font = '12px sans-serif';
    ctx.fillText(characters.spark.name, -22, 26);
    ctx.restore();

    // Watt - bulb owl
    const wx = 120;
    const wy = 402 + Math.sin(now / 500) * 1.2;
    ctx.save();
    ctx.translate(wx, wy);
    // glow when helpful
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,230,120,0.12)';
    ctx.ellipse(0, -6, 28, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    // bulb
    ctx.fillStyle = '#FFF7D6';
    ctx.strokeStyle = '#D6B800';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -6, 18, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-6, -14, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -14, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-6, -14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -14, 3, 0, Math.PI * 2);
    ctx.fill();
    // beak
    ctx.fillStyle = '#FFB400';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, -2);
    ctx.lineTo(5, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.font = '12px sans-serif';
    ctx.fillText(characters.watt.name, -34, 28);
    ctx.restore();

    // Gigi - small robot helper
    const gx = 200;
    const gy = 410 + Math.cos(now / 520) * 1.1;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.fillStyle = '#E9F6FF';
    ctx.strokeStyle = '#92C8FF';
    ctx.lineWidth = 2;
    roundRect(ctx, -16, -24, 32, 28, 6, true, true);
    ctx.fillStyle = '#333';
    ctx.fillRect(-6, -18, 12, 8);
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(0, -34);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -36, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#FFB6C1';
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.font = '12px sans-serif';
    ctx.fillText(characters.gigi.name, -22, 16);
    ctx.restore();
  }

  function drawLamps(now) {
    for (const lamp of lamps) {
      ctx.save();
      // lamp container with soft shadow
      ctx.shadowColor = 'rgba(80,130,200,0.08)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = lamp.filled ? '#FFF9E6' : '#FFFFFF';
      ctx.strokeStyle = '#A7D1FF';
      ctx.lineWidth = 2;
      roundRect(ctx, lamp.x, lamp.y, lamp.w, lamp.h, 12, true, true);
      ctx.shadowBlur = 0;

      // glass dome
      ctx.fillStyle = '#EAF8FF';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.ellipse(lamp.x + lamp.w / 2, lamp.y + 36, 36, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // soft glow when filled
      if (lamp.filled) {
        const t = (Math.sin(now / 230) + 1) / 2;
        const glowAlpha = 0.18 + t * 0.12;
        ctx.fillStyle = `rgba(255,230,120,${glowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(lamp.x + lamp.w / 2, lamp.y + 56, 52, 30, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // target and current
      ctx.fillStyle = '#2E3B4E';
      ctx.font = '16px sans-serif';
      ctx.fillText(`Target: ${lamp.target}`, lamp.x + 12, lamp.y + 22);
      ctx.font = '18px sans-serif';
      ctx.fillStyle = lamp.filled ? '#D86B00' : '#2E3B4E';
      ctx.fillText(`Power: ${lamp.current}`, lamp.x + 12, lamp.y + 46);

      // sockets area
      for (let si = 0; si < lamp.sockets.length; si++) {
        const s = lamp.sockets[si];
        const sx = lamp.x + lamp.w / 2 + s.dx;
        const sy = lamp.y + s.dy;
        // base plate
        ctx.fillStyle = '#F6FBFF';
        ctx.strokeStyle = '#CFEFFF';
        ctx.lineWidth = 1.6;
        roundRect(ctx, sx - 28, sy - 28, 56, 56, 12, true, true);
        // if occupied draw charge
        if (s.occupied) {
          const ch = s.occupied;
          drawCharge(ch, sx - ch.w / 2, sy - ch.h / 2);
        } else {
          // gentle socket highlight
          ctx.fillStyle = '#EAF7FF';
          ctx.beginPath();
          ctx.arc(sx, sy, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  // Draw charge with softer style
  function drawCharge(ch, drawX = null, drawY = null) {
    const x = drawX !== null ? drawX : ch.x;
    const y = drawY !== null ? drawY : ch.y;
    ctx.save();
    if (ch.held) {
      ctx.shadowColor = 'rgba(255,210,100,0.9)';
      ctx.shadowBlur = 20;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 6;
    }
    ctx.fillStyle = '#FFF7EC';
    ctx.strokeStyle = '#FFB84D';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, ch.w, ch.h, 10, true, true);
    // small lightning glyph
    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.moveTo(x + ch.w / 2 - 6, y + 12);
    ctx.lineTo(x + ch.w / 2 + 4, y + ch.h / 2 - 4);
    ctx.lineTo(x + ch.w / 2 - 2, y + ch.h / 2 - 6);
    ctx.lineTo(x + ch.w / 2 + 8, y + ch.h - 10);
    ctx.lineTo(x + ch.w / 2 - 6, y + ch.h / 2 + 6);
    ctx.lineTo(x + ch.w / 2 - 2, y + ch.h / 2 + 4);
    ctx.closePath();
    ctx.fill();
    // number label
    ctx.fillStyle = '#2E3B4E';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch.num.toString(), x + ch.w / 2, y + ch.h / 2);
    ctx.restore();
  }

  function drawQueue(now) {
    ctx.save();
    ctx.fillStyle = '#2E3B4E';
    ctx.font = '16px sans-serif';
    ctx.fillText('Charge Queue', QUEUE_START_X, QUEUE_START_Y - 24);
    for (let i = 0; i < chargeObjects.length; i++) {
      const ch = chargeObjects[i];
      if (selectedIndex === i && !ch.held) {
        ctx.save();
        ctx.strokeStyle = '#66C2FF';
        ctx.lineWidth = 3;
        roundRect(ctx, ch.x - 6, ch.y - 6, ch.w + 12, ch.h + 12, 12, false, true);
        ctx.restore();
      }
      if (!ch.placedOn) drawCharge(ch);
      else drawCharge({ ...ch, x: ch.x, y: ch.y, w: ch.w, h: ch.h, held: false });
    }
    ctx.restore();
  }

  function drawHUD(now) {
    ctx.save();
    // rounded top bar
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.strokeStyle = '#E2F0FF';
    ctx.lineWidth = 1;
    roundRect(ctx, 520, 8, 188, 96, 10, true, true);
    ctx.fillStyle = '#2E3B4E';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Score: ${score}`, 540, 30);
    ctx.fillText(`Mistakes: ${mistakes}`, 540, 52);
    ctx.fillText(`Level: ${level}`, 540, 74);

    // audio indicator
    ctx.fillStyle = soundEnabled ? '#2E8B57' : '#B22222';
    ctx.beginPath();
    ctx.arc(665, 40, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.font = '12px sans-serif';
    ctx.fillText(soundEnabled ? 'ON' : 'OFF', 657, 44);
    ctx.restore();
  }

  function drawInstructions(now) {
    ctx.save();
    ctx.fillStyle = '#2E3B4E';
    ctx.font = '14px sans-serif';
    const lines = [
      'Instructions: Drag or keyboard-select a charge and place it into a lamp socket to match the Target power.',
      'If the lamp reaches exactly the target, it lights up! Too much power returns charges and resets that lamp.',
      'Keyboard: ← → select, Space to pick/place, R reset, S toggle sound.',
      'Characters: Spark (lightning), Professor Watt (bulb owl), Gigi the Gizmo (robot).',
    ];
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 20, 140 + i * 18);
    }
    // status box
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#DFF2FF';
    ctx.lineWidth = 1;
    roundRect(ctx, 20, 220, 680, 60, 8, true, true);
    ctx.fillStyle = '#2E3B4E';
    ctx.font = '13px sans-serif';
    ctx.fillText('Status: ' + accessibilityMessage, 28, 248);
    ctx.restore();
  }

  function updateParticles(now, dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.born;
      if (age > p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      p.vy += 0.02 * (dt / 16);
    }
  }

  function drawParticles(now) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const age = now - p.born;
      const lifeFrac = 1 - age / p.life;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue},90%,60%,${0.12 * lifeFrac})`;
      ctx.arc(p.x, p.y, p.size * lifeFrac, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSparkEffects(now) {
    // spawn particles once when lamp completed
    if (lastFilledLamp && now - lastSparkTime < 120) {
      spawnLampParticles(lastFilledLamp);
    }
    updateParticles(now, 16);
    drawParticles(now);
  }

  // utility: rounded rect
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof r === 'undefined') r = 5;
    if (typeof stroke === 'undefined') stroke = true;
    if (typeof fill === 'undefined') fill = true;
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

  // --- Game loop ---
  function update(delta) {
    if (!heldCharge) {
      for (let i = 0; i < chargeObjects.length; i++) {
        const ch = chargeObjects[i];
        if (!ch.placedOn) {
          ch.y = ch.homeY + Math.sin(performance.now() / 420 + i) * 3;
        }
      }
    }
  }

  let lastTime = performance.now();
  function loop(now) {
    const delta = now - lastTime;
    lastTime = now;
    update(delta);

    ctx.clearRect(0, 0, GAME_W, GAME_H);
    drawBackground(now);
    drawCharacters(now);
    drawLamps(now);
    drawQueue(now);
    drawHUD(now);
    drawInstructions(now);
    drawSparkEffects(now);

    if (selectedIndex >= 0 && chargeObjects[selectedIndex] && !chargeObjects[selectedIndex].held) {
      const ch = chargeObjects[selectedIndex];
      ctx.save();
      ctx.strokeStyle = '#7FD1FF';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      roundRect(ctx, ch.x - 6, ch.y - 6, ch.w + 12, ch.h + 12, 12, false, true);
      ctx.restore();
    }

    // audio box visual
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#D0E8FF';
    ctx.lineWidth = 1;
    roundRect(ctx, 520, 110, 180, 36, 8, true, true);
    ctx.fillStyle = '#444';
    ctx.font = '14px sans-serif';
    ctx.fillText(soundEnabled ? 'Sound: ON (press S to toggle)' : 'Sound: OFF - click here to enable', 535, 132);
    ctx.restore();

    // pointer
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#66C2FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  // Click audio box for enabling/toggling audio
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px >= 520 && px <= 700 && py >= 110 && py <= 146) {
      if (!audioCtx) {
        tryCreateAudioContext();
      }
      if (audioCtx) {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            soundEnabled = true;
            accessibilityMessage = 'Sound enabled.';
            playClick();
          }).catch(() => {
            accessibilityMessage = 'Unable to enable sound due to browser restrictions.';
          });
        } else {
          soundEnabled = !soundEnabled;
          accessibilityMessage = soundEnabled ? 'Sound enabled.' : 'Sound disabled.';
          if (soundEnabled) playClick();
        }
      } else {
        accessibilityMessage = 'Sound unavailable on this device/browser.';
      }
    }
  });

  // expose minimal API
  container.gameApi = {
    reset: resetLevel,
    enableSound: () => {
      tryCreateAudioContext();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      soundEnabled = !!audioCtx;
    },
  };

  accessibilityMessage = "Welcome to Spark City! Place the numbered charges into lamp sockets to match each lamp's target power.";

  window.addEventListener('unhandledrejection', (ev) => {
    console.warn('Unhandled rejection in game:', ev.reason);
  });
})();