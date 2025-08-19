(function () {
  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const CONTAINER_ID = 'game-of-the-day-stage';

  // Utility: safe query and canvas setup
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error(`Container element with id "${CONTAINER_ID}" not found.`);
    return;
  }
  container.innerHTML = '';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // focusable for keyboard
  canvas.style.outline = 'none';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Sparky the Squirrel needs help powering houses! ' +
      'Use mouse or keyboard to pick battery cards (numbers) and drop them onto bulbs to match target sums. ' +
      'Arrow keys to select, Enter to pick/place, Space to toggle sound. ' +
      'Solve all bulbs to finish the level.'
  );
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Accessibility: hidden live region
  let liveRegion = null;
  try {
    const live = document.createElement('div');
    live.setAttribute('aria-live', 'polite');
    live.style.position = 'absolute';
    live.style.left = '-9999px';
    live.style.width = '1px';
    live.style.height = '1px';
    live.style.overflow = 'hidden';
    container.appendChild(live);
    liveRegion = live;
  } catch (e) {
    liveRegion = null;
  }

  // Audio setup with error handling
  let audioEnabled = true;
  let audioCtx = null;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      audioEnabled = false;
      throw new Error('Web Audio API not supported in this browser.');
    }
    audioCtx = new AudioContext();
  } catch (err) {
    console.warn('Audio context could not be created:', err);
    audioEnabled = false;
    audioCtx = null;
  }

  let audioSuspended = audioEnabled && audioCtx && audioCtx.state === 'suspended';

  // Master gain
  let masterGain = null;
  if (audioEnabled && audioCtx) {
    try {
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.12; // gentle global volume
      masterGain.connect(audioCtx.destination);
    } catch (e) {
      console.warn('Master gain creation failed:', e);
      audioEnabled = false;
      masterGain = null;
    }
  }

  // Ambient pad (multiple oscillators with slow filter movement)
  let ambientNodes = [];
  let ambientStarted = false;
  function startBackgroundHum() {
    if (!audioEnabled || !audioCtx || !masterGain || ambientStarted) return;
    try {
      // create a lush, very quiet pad using 3 detuned oscillators
      const baseFreq = 110; // low gentle
      const detunes = [-6, 0, 7];
      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.02;
      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 600;
      // LFO to move filter slowly
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08; // very slow
      lfoGain.gain.value = 220; // range
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);
      // Create oscillators
      const oscs = detunes.map((d) => {
        const o = audioCtx.createOscillator();
        o.type = 'sine';
        o.frequency.value = baseFreq * Math.pow(2, d / 12);
        o.detune.value = (Math.random() - 0.5) * 10;
        o.connect(padFilter);
        return o;
      });
      padFilter.connect(padGain);
      padGain.connect(masterGain);

      // Start all
      const now = audioCtx.currentTime;
      lfo.start(now);
      oscs.forEach((o) => o.start(now));
      ambientNodes = { oscs, lfo, lfoGain, padFilter, padGain };
      ambientStarted = true;
    } catch (e) {
      console.warn('startBackgroundHum error:', e);
    }
  }

  function stopBackgroundHum() {
    if (!ambientStarted || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      if (ambientNodes.lfo) ambientNodes.lfo.stop(now + 0.02);
      ambientNodes.oscs.forEach((o) => o.stop(now + 0.02));
      ambientNodes = [];
      ambientStarted = false;
    } catch (e) {
      console.warn('stopBackgroundHum error:', e);
    }
  }

  // Sound helpers: careful envelopes and error handling
  function safeTry(fn) {
    try {
      fn();
    } catch (e) {
      console.warn('Audio function error:', e);
    }
  }

  function playBeep(freq = 880, duration = 0.14, type = 'sine') {
    if (!audioEnabled || !audioCtx || !masterGain) return Promise.resolve();
    return new Promise((resolve) => {
      safeTry(() => {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        osc.type = type;
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = Math.max(600, freq * 1.5);
        gain.gain.value = 0.0001;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.start(now);
        osc.stop(now + duration + 0.02);
        osc.onended = () => resolve();
      });
    });
  }

  function playChime() {
    if (!audioEnabled || !audioCtx || !masterGain) return;
    safeTry(() => {
      // Simple three-note arpeggio with gentle bells (triangle + slight highpass)
      const now = audioCtx.currentTime;
      const notes = [880, 660, 990];
      notes.forEach((n, i) => {
        const t = now + i * 0.12;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 500;
        osc.type = 'triangle';
        osc.frequency.value = n;
        gain.gain.value = 0.0001;
        osc.connect(hp);
        hp.connect(gain);
        gain.connect(masterGain);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        osc.start(t);
        osc.stop(t + 0.38);
      });
    });
  }

  function playBuzz() {
    if (!audioEnabled || !audioCtx || !masterGain) return;
    safeTry(() => {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      osc.type = 'square';
      osc.frequency.value = 140;
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      gain.gain.value = 0.0001;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    });
  }

  function playSpark() {
    if (!audioEnabled || !audioCtx || !masterGain) return;
    safeTry(() => {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1600, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);
      filter.type = 'highpass';
      filter.frequency.value = 700;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.1);
    });
  }

  // Visual particle system for sparks and soft dust
  const particles = [];
  function spawnParticle(x, y, opts = {}) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * (opts.spread || 3),
      vy:
        (Math.random() - 0.5) * (opts.spreadY || 1.5) -
        (opts.upward ? Math.random() * 1.5 : 0),
      life: opts.life || 40,
      size: opts.size || 2 + Math.random() * 3,
      color: opts.color || 'rgba(255,200,80,1)',
      age: 0,
      fade: opts.fade || 1
    });
  }

  // Game objects and logic (kept intact, only visuals/audio augmented)
  const state = {
    level: 1,
    score: 0,
    bulbs: [],
    batteries: [],
    selectedBatteryIndex: 0,
    holdingBattery: null,
    draggingBatteryId: null,
    mouse: { x: 0, y: 0, down: false },
    hintVisible: true,
    soundOn: !!audioEnabled,
    message: '',
    messageTimer: 0,
    roundActive: true
  };

  // Layout constants
  const leftArea = { x: 20, y: 90, w: 220, h: 360 };
  const rightArea = { x: 260, y: 60, w: 440, h: 400 };

  // Characters positions for animation
  const characters = {
    sparky: { x: 130, y: 420, scale: 0.98, bob: 0 },
    volt: { x: 600, y: 420, scale: 1.02, bob: 0 }
  };

  // Helper
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Initialize level (kept logic same)
  function initLevel(level = 1) {
    state.level = level;
    state.score = 0;
    state.bulbs = [];
    state.batteries = [];
    state.selectedBatteryIndex = 0;
    state.holdingBattery = null;
    state.draggingBatteryId = null;
    state.message = '';
    state.messageTimer = 0;
    state.roundActive = true;

    const bulbCount = Math.min(4, 2 + Math.floor((level - 1) / 2));
    const targets = [];
    for (let i = 0; i < bulbCount; i++) targets.push(randInt(5, 15));

    for (let i = 0; i < bulbCount; i++) {
      const bx = rightArea.x + 80 + (i % 2) * 220;
      const by = rightArea.y + 80 + Math.floor(i / 2) * 140;
      state.bulbs.push({
        x: bx,
        y: by,
        target: targets[i],
        connectedBatteries: [],
        lit: false,
        glow: 0
      });
    }

    let batteryValues = [];
    for (let t of targets) {
      const parts = randInt(1, 3);
      let remaining = t;
      for (let p = parts; p >= 1; p--) {
        let val;
        if (p === 1) val = remaining;
        else {
          const maxVal = Math.min(9, remaining - (p - 1));
          val = randInt(1, Math.max(1, maxVal));
        }
        batteryValues.push(val);
        remaining -= val;
      }
    }
    const targetBatteryCount = Math.max(6, batteryValues.length + 2);
    while (batteryValues.length < targetBatteryCount) batteryValues.push(randInt(1, 9));
    for (let i = batteryValues.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [batteryValues[i], batteryValues[j]] = [batteryValues[j], batteryValues[i]];
    }

    const cols = 2;
    const rows = Math.ceil(batteryValues.length / cols);
    const spacingX = leftArea.w / cols;
    const spacingY = Math.min(80, leftArea.h / rows);
    for (let i = 0; i < batteryValues.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = leftArea.x + spacingX * col + spacingX * 0.5;
      const by = leftArea.y + spacingY * row + spacingY * 0.5;
      state.batteries.push({
        id: 'b' + i,
        x: bx,
        y: by,
        baseX: bx,
        baseY: by,
        value: batteryValues[i],
        placedOn: null,
        pickedOffset: { x: 0, y: 0 },
        wobble: Math.random() * Math.PI * 2,
        glow: 0
      });
    }

    announce(`Level ${level}. Help Sparky light ${state.bulbs.length} houses!`);
  }

  function announce(text) {
    if (liveRegion) {
      liveRegion.textContent = text;
      setTimeout(() => {
        liveRegion.textContent = '';
      }, 1600);
    }
    state.message = text;
    state.messageTimer = 160;
  }

  // Visual helpers
  function clearScreen(frame) {
    // animated sky gradient with soft sun glow
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#eaf7ff');
    g.addColorStop(0.6, '#fbfbff');
    g.addColorStop(1, '#fffef6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle diagonal grid for lab feel
    ctx.save();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#2b8cff';
    const spacing = 28;
    for (let x = -HEIGHT; x < WIDTH + HEIGHT; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + HEIGHT, HEIGHT);
      ctx.stroke();
    }
    ctx.restore();

    // soft spotlight on work area
    const rad = ctx.createRadialGradient(360, 170, 60, 360, 170, 420);
    rad.addColorStop(0, 'rgba(255,255,255,0.45)');
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawHeader() {
    ctx.save();
    // header bar
    const hg = ctx.createLinearGradient(0, 0, 0, 40);
    hg.addColorStop(0, '#ffffff');
    hg.addColorStop(1, '#f0f6ff');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, WIDTH, 48);

    ctx.fillStyle = '#1f3559';
    ctx.font = '18px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${state.score}`, 12, 26);
    ctx.fillText(`Level: ${state.level}`, 128, 26);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f2b5a';
    ctx.font = '16px "Segoe UI", Arial';
    ctx.fillText(
      'Electricity Math Lab — Connect batteries to match bulb sums',
      WIDTH / 2,
      26
    );
    ctx.restore();
  }

  function drawSoundIcon() {
    ctx.save();
    const x = WIDTH - 36;
    const y = 22;
    // soft circle background
    ctx.beginPath();
    ctx.fillStyle = state.soundOn ? 'rgba(255,221,87,0.95)' : 'rgba(200,200,200,0.9)';
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#345';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.soundOn ? '♪' : '•', x, y);
    ctx.restore();
  }

  // Draw batteries with improved visuals and subtle animation
  function drawBatteries(frame) {
    for (let i = 0; i < state.batteries.length; i++) {
      const b = state.batteries[i];
      const isHeld = state.holdingBattery === b.id || state.draggingBatteryId === b.id;
      const x = b.drawX !== undefined ? b.drawX : b.x;
      const y = b.drawY !== undefined ? b.drawY : b.y;
      // shadow
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(20,20,20,0.08)';
      roundRect(ctx, x - 42, y - 34 + 4, 84, 68, 12, true, false);

      // card with subtle gradient
      const cg = ctx.createLinearGradient(x - 36, y - 28, x + 36, y + 28);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(1, '#f8fbff');
      ctx.fillStyle = cg;
      ctx.strokeStyle = '#dcdfe8';
      ctx.lineWidth = 1;
      roundRect(ctx, x - 36, y - 28, 72, 56, 12, true, true);

      // battery visual bar
      const barX = x - 22;
      const barY = y - 12;
      ctx.fillStyle = '#f7f3e8';
      roundRect(ctx, barX - 2, barY - 2, 44, 26, 6, true, false);
      const fillPct = Math.min(1, b.value / 9);
      const grad = ctx.createLinearGradient(barX, barY, barX + 44, barY + 26);
      grad.addColorStop(0, '#ffd08a');
      grad.addColorStop(1, '#ffb342');
      ctx.fillStyle = grad;
      roundRect(ctx, barX, barY, 44 * fillPct, 26, 6, true, false);
      // cap
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 22, y - 10, 8, 20);
      // number circle for clarity
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.arc(x - 6, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ddd';
      ctx.stroke();
      ctx.fillStyle = '#333';
      ctx.font = '18px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.value, x - 6, y);

      // if keyboard focused, draw soft blue glow
      if (i === state.selectedBatteryIndex && !isHeld) {
        ctx.shadowColor = 'rgba(43,140,255,0.25)';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = 'rgba(43,140,255,0.65)';
        ctx.lineWidth = 3;
        roundRect(ctx, x - 40, y - 32, 80, 64, 14, false, true);
        ctx.shadowBlur = 0;
      }

      // show slight scale if held
      if (isHeld) {
        ctx.globalAlpha = 0.98;
      }

      ctx.restore();

      // subtle floating glow for batteries that are part of a correct bulb (placed)
      if (b.placedOn !== null) {
        const bulb = state.bulbs[b.placedOn];
        if (bulb && bulb.lit) {
          spawnParticle(x, y, {
            life: 50,
            size: 2 + Math.random() * 3,
            color: 'rgba(255,220,100,0.95)',
            upward: true,
            spread: 1.8
          });
        }
      }
    }
  }

  // Draw bulbs with improved visuals
  function drawBulbs(frame) {
    for (let i = 0; i < state.bulbs.length; i++) {
      const bulb = state.bulbs[i];
      const x = bulb.x;
      const y = bulb.y;
      ctx.save();

      // house base shadow
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e6eefc';
      ctx.lineWidth = 2;
      roundRect(ctx, x - 62, y + 32, 124, 72, 12, true, true);

      // roof with soft gradient
      const roofGrad = ctx.createLinearGradient(x - 70, y - 10, x + 70, y + 40);
      roofGrad.addColorStop(0, '#ffdbe6');
      roofGrad.addColorStop(1, '#ffd1dc');
      ctx.fillStyle = roofGrad;
      ctx.beginPath();
      ctx.moveTo(x - 72, y + 32);
      ctx.lineTo(x, y - 12);
      ctx.lineTo(x + 72, y + 32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glow handling
      if (bulb.lit) bulb.glow = Math.min(1, bulb.glow + 0.05);
      else bulb.glow = Math.max(0, bulb.glow - 0.04);
      const glow = bulb.glow;

      // halo
      if (glow > 0) {
        const halo = ctx.createRadialGradient(x, y - 12, 8, x, y - 12, 110);
        halo.addColorStop(0, `rgba(255,240,160,${0.45 * glow})`);
        halo.addColorStop(1, 'rgba(255,240,160,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y - 12, 110, 0, Math.PI * 2);
        ctx.fill();
      }

      // bulb body with subtle gradient and rim
      const bulbGrad = ctx.createLinearGradient(x, y - 46, x, y + 18);
      bulbGrad.addColorStop(0, bulb.lit ? '#fffef0' : '#ffffff');
      bulbGrad.addColorStop(1, bulb.lit ? '#fff6c8' : '#fff9f0');
      ctx.fillStyle = bulbGrad;
      ctx.beginPath();
      ctx.arc(x, y - 12, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#bdbdbd';
      ctx.lineWidth = 1;
      ctx.stroke();

      // filament/coils with glow if lit
      ctx.beginPath();
      ctx.strokeStyle = bulb.lit ? '#ffb300' : '#bcbcbc';
      ctx.lineWidth = 2;
      ctx.moveTo(x - 12, y - 6);
      ctx.quadraticCurveTo(x, y + 6, x + 12, y - 6);
      ctx.stroke();

      // socket
      ctx.fillStyle = '#d6d6d6';
      ctx.fillRect(x - 20, y + 24, 40, 18);
      ctx.strokeStyle = '#b8b8b8';
      ctx.strokeRect(x - 20, y + 24, 40, 18);

      // target text with soft background
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      roundRect(ctx, x - 46, y + 56, 92, 28, 8, true, false);
      ctx.fillStyle = '#30384a';
      ctx.font = '16px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Need ${bulb.target}`, x, y + 74);

      // connected batteries icons around bulb
      const count = bulb.connectedBatteries.length;
      for (let j = 0; j < count; j++) {
        const bid = bulb.connectedBatteries[j];
        const battery = state.batteries.find((bb) => bb.id === bid);
        if (!battery) continue;
        const angle = -Math.PI / 2 + (j - (count - 1) / 2) * 0.55;
        const rx = x + Math.cos(angle) * 70;
        const ry = y + Math.sin(angle) * 70;
        ctx.save();
        // small card
        ctx.fillStyle = '#fffef8';
        roundRect(ctx, rx - 22, ry - 16, 44, 32, 8, true, true);
        ctx.fillStyle = '#333';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(battery.value, rx, ry);
        ctx.restore();
      }

      // pulsating accept ring if cursor near or sum near
      const sum = bulb.connectedBatteries.reduce((s, bid) => {
        const b = state.batteries.find((bb) => bb.id === bid);
        return s + (b ? b.value : 0);
      }, 0);
      const near = sum > 0 && sum < bulb.target;
      const exceed = sum > bulb.target;
      ctx.beginPath();
      ctx.lineWidth = 3;
      if (bulb.lit) {
        ctx.strokeStyle = `rgba(255,183,77,${0.9})`;
      } else if (exceed) {
        ctx.strokeStyle = 'rgba(220,80,80,0.9)';
      } else if (near) {
        ctx.strokeStyle = 'rgba(66,135,245,0.9)';
      } else {
        ctx.strokeStyle = '#b0c4ff';
      }
      ctx.arc(
        x,
        y - 12,
        54 + (near ? Math.sin(Date.now() / 300) * 2 : 0),
        0,
        Math.PI * 2
      );
      ctx.stroke();

      // small smiling face if lit
      if (bulb.lit) {
        ctx.fillStyle = '#2f2f2f';
        ctx.beginPath();
        ctx.arc(x - 10, y - 18, 3, 0, Math.PI * 2);
        ctx.arc(x + 10, y - 18, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = '#2f2f2f';
        ctx.lineWidth = 2;
        ctx.arc(x, y - 10, 8, 0, Math.PI);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // Draw connectors with gentle gradients and animation
  function drawConnectors(frame) {
    ctx.save();
    ctx.lineWidth = 6;
    for (let b of state.batteries) {
      if (b.placedOn !== null) {
        const bulb = state.bulbs[b.placedOn];
        if (!bulb) continue;
        const sx = b.drawX !== undefined ? b.drawX : b.x;
        const sy = b.drawY !== undefined ? b.drawY : b.y;
        const tx = bulb.x;
        const ty = bulb.y - 12;
        const grad = ctx.createLinearGradient(sx, sy, tx, ty);
        grad.addColorStop(0, '#ffa94d');
        grad.addColorStop(1, '#ffd66b');
        ctx.strokeStyle = grad;
        // subtle glowing pulse when bulb nearly correct or lit
        const sum = bulb.connectedBatteries.reduce((s, bid) => {
          const bb = state.batteries.find((zzz) => zzz.id === bid);
          return s + (bb ? bb.value : 0);
        }, 0);
        const pulse = bulb.lit
          ? 0.9
          : sum > 0 && sum <= bulb.target
          ? 0.45 + 0.05 * Math.sin(Date.now() / 180)
          : 0.6;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + tx) / 2, sy - 40, tx, ty);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }
    // dragging guide line
    if (state.holdingBattery) {
      const bat = state.batteries.find((bb) => bb.id === state.holdingBattery);
      if (bat) {
        const sx = state.mouse.x + bat.pickedOffset.x;
        const sy = state.mouse.y + bat.pickedOffset.y;
        ctx.strokeStyle = 'rgba(120,120,120,0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(state.mouse.x, state.mouse.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Draw characters with subtle animation
  function drawCharacters(frame) {
    // bobbing
    characters.sparky.bob = Math.sin(frame / 18) * 2;
    characters.volt.bob = Math.cos(frame / 22) * 1.5;

    // Sparky
    ctx.save();
    const s = characters.sparky;
    ctx.translate(s.x, s.y + s.bob);
    ctx.scale(s.scale, s.scale);
    // shadow
    ctx.fillStyle = 'rgba(20,20,20,0.08)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 32, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // suit
    ctx.fillStyle = '#b36b2f';
    ctx.beginPath();
    ctx.ellipse(0, -6, 30, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // helmet
    ctx.fillStyle = '#2b8cff';
    ctx.beginPath();
    ctx.arc(0, -34, 18, Math.PI, 0, false);
    ctx.fill();
    // goggles
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-6, -30, 6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(10, -30, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(-6, -30, 2.8, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(10, -30, 2.8, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // tool
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(16, -8);
    ctx.lineTo(36, -16);
    ctx.stroke();
    ctx.restore();

    // Volt
    ctx.save();
    const v = characters.volt;
    ctx.translate(v.x, v.y + v.bob);
    ctx.scale(v.scale, v.scale);
    // shadow
    ctx.fillStyle = 'rgba(20,20,20,0.06)';
    ctx.beginPath();
    ctx.ellipse(0, 36, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // bulb body
    ctx.fillStyle = '#fff9c4';
    ctx.beginPath();
    ctx.arc(0, -12, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f6bb00';
    ctx.lineWidth = 2;
    ctx.stroke();
    // face
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-9, -18, 3, 0, Math.PI * 2);
    ctx.arc(9, -18, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.arc(0, -10, 8, 0, Math.PI);
    ctx.stroke();
    // tiny spark when sound on (animated pulse)
    if (state.soundOn) {
      const pulse = 1 + Math.sin(Date.now() / 140) * 0.08;
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.moveTo(22 * pulse, -38);
      ctx.lineTo(30 * pulse, -26);
      ctx.lineTo(22 * pulse, -28);
      ctx.lineTo(32 * pulse, -16);
      ctx.lineTo(18 * pulse, -26);
      ctx.fill();
    }
    ctx.restore();
  }

  // UI hints and messages (improved)
  function drawUI() {
    ctx.save();
    // instruction card
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    roundRect(ctx, 260, 8, 440, 56, 10, true, true);
    ctx.fillStyle = '#114b8c';
    ctx.font = '14px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Pick batteries (numbers) and drop onto bulbs to make target sums.', 276, 28);
    ctx.fillText('Arrows to select, Enter to pick/place, Space toggles sound.', 276, 48);

    // message overlay
    if (state.messageTimer > 0 && state.message) {
      ctx.fillStyle = 'rgba(32,48,80,0.78)';
      roundRect(ctx, WIDTH / 2 - 210, 56, 420, 36, 8, true, true);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '15px "Segoe UI", Arial';
      ctx.fillText(state.message, WIDTH / 2, 80);
    }

    // progress
    const litCount = state.bulbs.filter((b) => b.lit).length;
    ctx.fillStyle = '#28334a';
    ctx.textAlign = 'left';
    ctx.font = '13px "Segoe UI", Arial';
    ctx.fillText(`Houses lit: ${litCount} / ${state.bulbs.length}`, 12, 48);

    // sound icon
    drawSoundIcon();
    ctx.restore();
  }

  // Utility rounded rectangle
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

  // Point in battery card bounds
  function pointInBattery(x, y, bat) {
    const bx = bat.drawX !== undefined ? bat.drawX : bat.x;
    const by = bat.drawY !== undefined ? bat.drawY : bat.y;
    return x >= bx - 36 && x <= bx + 36 && y >= by - 28 && y <= by + 28;
  }

  // Point in bulb area
  function pointInBulb(x, y, bulb) {
    const dx = x - bulb.x;
    const dy = y - (bulb.y - 12);
    return Math.sqrt(dx * dx + dy * dy) <= 54;
  }

  // Place battery on bulb (logic kept same); add visual particles on success
  function placeBatteryOn(batteryId, bulbIndex) {
    const bat = state.batteries.find((b) => b.id === batteryId);
    if (!bat) return;
    if (bulbIndex === null) {
      if (bat.placedOn !== null) {
        const prevBulb = state.bulbs[bat.placedOn];
        prevBulb.connectedBatteries = prevBulb.connectedBatteries.filter((id) => id !== bat.id);
      }
      bat.placedOn = null;
      return;
    }
    const bulb = state.bulbs[bulbIndex];
    if (!bulb) return;
    if (bat.placedOn !== null) {
      const prev = state.bulbs[bat.placedOn];
      if (prev) prev.connectedBatteries = prev.connectedBatteries.filter((id) => id !== bat.id);
    }
    bat.placedOn = bulbIndex;
    bulb.connectedBatteries.push(bat.id);
    // visual sparks
    for (let i = 0; i < 8; i++) {
      spawnParticle(bulb.x + (Math.random() - 0.5) * 24, bulb.y - 8 + (Math.random() - 0.5) * 12, {
        life: 36 + Math.floor(Math.random() * 30),
        size: 1 + Math.random() * 3,
        color: 'rgba(255,210,120,1)',
        upward: true,
        spread: 3
      });
    }
    if (state.soundOn) playSpark();
    checkBulb(bulbIndex);
  }

  // Check bulb logic unchanged but with small announce additions
  function checkBulb(idx) {
    const bulb = state.bulbs[idx];
    const sum = bulb.connectedBatteries.reduce((s, bid) => {
      const b = state.batteries.find((bb) => bb.id === bid);
      return s + (b ? b.value : 0);
    }, 0);
    if (sum === bulb.target) {
      if (!bulb.lit) {
        bulb.lit = true;
        playChime();
        state.score += 10;
        announce(`Great! You lit a house!`);
        bulb.glow = 1;
        // little celebratory particles
        for (let i = 0; i < 18; i++) {
          spawnParticle(
            bulb.x + (Math.random() - 0.5) * 48,
            bulb.y - 12 + (Math.random() - 0.5) * 18,
            {
              life: 60 + Math.floor(Math.random() * 40),
              size: 2 + Math.random() * 3,
              color: `rgba(${200 + Math.floor(Math.random() * 55)},${150 + Math.floor(
                Math.random() * 100
              )},60,1)`,
              upward: true,
              spread: 4
            }
          );
        }
      }
    } else {
      if (bulb.lit) bulb.lit = false;
      if (sum > bulb.target) {
        if (state.soundOn) playBuzz();
        state.score = Math.max(0, state.score - 2);
      }
    }
    if (state.bulbs.every((b) => b.lit)) {
      state.roundActive = false;
      announce('All houses glowing! Next round starting...');
      setTimeout(() => {
        initLevel(state.level + 1);
      }, 1600);
    }
  }

  // Pickup battery (same), with small spark sound
  function pickUpBattery(batteryId) {
    const bat = state.batteries.find((b) => b.id === batteryId);
    if (!bat) return;
    if (bat.placedOn !== null) {
      const bulb = state.bulbs[bat.placedOn];
      if (bulb) {
        bulb.connectedBatteries = bulb.connectedBatteries.filter((id) => id !== batteryId);
        checkBulb(bat.placedOn);
      }
      bat.placedOn = null;
    }
    state.holdingBattery = batteryId;
    bat.pickedOffset.x = bat.x - state.mouse.x;
    bat.pickedOffset.y = bat.y - state.mouse.y;
    if (state.soundOn) playBeep(1000, 0.06, 'sine');
  }

  // Drop held battery (unchanged logic), with small visual adjustment
  function dropHeldBattery() {
    if (!state.holdingBattery) return;
    const bat = state.batteries.find((b) => b.id === state.holdingBattery);
    if (!bat) {
      state.holdingBattery = null;
      return;
    }
    let targetIndex = null;
    for (let i = 0; i < state.bulbs.length; i++) {
      if (pointInBulb(state.mouse.x, state.mouse.y, state.bulbs[i])) {
        targetIndex = i;
        break;
      }
    }
    if (targetIndex !== null) {
      placeBatteryOn(bat.id, targetIndex);
      const bulb = state.bulbs[targetIndex];
      const assignmentCount = bulb.connectedBatteries.length - 1;
      const angle = -Math.PI / 2 + (assignmentCount - ( (bulb.connectedBatteries.length - 1) / 2 )) * 0.5;
      const rx = bulb.x + Math.cos(angle) * 70;
      const ry = bulb.y + Math.sin(angle) * 70;
      // animate to anchored spot over frames by setting base temporarily
      bat.x = rx;
      bat.y = ry;
    } else {
      bat.x = bat.baseX;
      bat.y = bat.baseY;
      if (state.soundOn) playBeep(340, 0.08, 'square');
    }
    state.holdingBattery = null;
    if (state.soundOn) playBeep(620, 0.05, 'sine');
  }

  // Input handling with resumeAudioOnInteraction
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = e.clientX - rect.left;
    state.mouse.y = e.clientY - rect.top;
    state.mouse.down = true;
    resumeAudioOnInteraction();

    // sound icon toggle
    if (distance(state.mouse.x, state.mouse.y, WIDTH - 36, 22) <= 18) {
      toggleSound();
      return;
    }

    // pick battery
    for (let i = 0; i < state.batteries.length; i++) {
      const b = state.batteries[i];
      if (pointInBattery(state.mouse.x, state.mouse.y, b)) {
        pickUpBattery(b.id);
        state.draggingBatteryId = b.id;
        state.selectedBatteryIndex = i;
        return;
      }
    }
    // pick from bulbs
    for (let i = 0; i < state.bulbs.length; i++) {
      const bulb = state.bulbs[i];
      for (let j = 0; j < bulb.connectedBatteries.length; j++) {
        const bid = bulb.connectedBatteries[j];
        const b = state.batteries.find((bb) => bb.id === bid);
        if (!b) continue;
        const angle = -Math.PI / 2 + (j - (bulb.connectedBatteries.length - 1) / 2) * 0.55;
        const rx = bulb.x + Math.cos(angle) * 70;
        const ry = bulb.y + Math.sin(angle) * 70;
        if (distance(state.mouse.x, state.mouse.y, rx, ry) <= 20) {
          pickUpBattery(b.id);
          state.draggingBatteryId = b.id;
          return;
        }
      }
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouse.x = e.clientX - rect.left;
    state.mouse.y = e.clientY - rect.top;
    if (state.holdingBattery) {
      const bat = state.batteries.find((b) => b.id === state.holdingBattery);
      if (bat) {
        bat.drawX = state.mouse.x + bat.pickedOffset.x;
        bat.drawY = state.mouse.y + bat.pickedOffset.y;
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    state.mouse.down = false;
    if (state.draggingBatteryId) {
      dropHeldBattery();
      state.draggingBatteryId = null;
    }
  });

  canvas.addEventListener('mouseleave', (e) => {
    state.mouse.down = false;
    if (state.holdingBattery) dropHeldBattery();
  });

  canvas.addEventListener('keydown', (e) => {
    resumeAudioOnInteraction();
    if (e.code === 'Space') {
      e.preventDefault();
      toggleSound();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.selectedBatteryIndex = Math.min(state.batteries.length - 1, state.selectedBatteryIndex + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.selectedBatteryIndex = Math.max(0, state.selectedBatteryIndex - 1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      state.selectedBatteryIndex = Math.max(0, state.selectedBatteryIndex - 1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      state.selectedBatteryIndex = Math.min(state.batteries.length - 1, state.selectedBatteryIndex + 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = state.batteries[state.selectedBatteryIndex];
      if (!selected) return;
      if (!state.holdingBattery) {
        pickUpBattery(selected.id);
      } else {
        let nearest = null;
        let dist = Infinity;
        for (let i = 0; i < state.bulbs.length; i++) {
          const b = state.bulbs[i];
          const d = distance(selected.x, selected.y, b.x, b.y - 12);
          if (d < dist) {
            dist = d;
            nearest = i;
          }
        }
        if (nearest !== null) {
          placeBatteryOn(state.holdingBattery, nearest);
          const bulb = state.bulbs[nearest];
          const assignmentCount = bulb.connectedBatteries.length - 1;
          const angle = -Math.PI / 2 + (assignmentCount - ( (bulb.connectedBatteries.length - 1) / 2 )) * 0.5;
          const rx = bulb.x + Math.cos(angle) * 70;
          const ry = bulb.y + Math.sin(angle) * 70;
          const bat = state.batteries.find((bb) => bb.id === state.holdingBattery);
          if (bat) {
            bat.x = rx;
            bat.y = ry;
          }
          state.holdingBattery = null;
        } else {
          const bat = state.batteries.find((b) => b.id === state.holdingBattery);
          if (bat) {
            bat.x = bat.baseX;
            bat.y = bat.baseY;
          }
          state.holdingBattery = null;
        }
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (state.holdingBattery) {
        const bat = state.batteries.find((b) => b.id === state.holdingBattery);
        if (bat) {
          bat.x = bat.baseX;
          bat.y = bat.baseY;
        }
        state.holdingBattery = null;
      }
      return;
    }
  });

  function toggleSound() {
    state.soundOn = !state.soundOn;
    if (state.soundOn) {
      if (audioEnabled && audioCtx && audioCtx.state === 'suspended') {
        resumeAudioOnInteraction();
      }
      announce('Sound on');
    } else {
      announce('Sound off');
    }
  }

  function resumeAudioOnInteraction() {
    if (!audioEnabled || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx
        .resume()
        .then(() => {
          startBackgroundHum();
          announce('Audio ready');
        })
        .catch((e) => {
          console.warn('Audio resume failed:', e);
        });
    } else {
      startBackgroundHum();
    }
  }

  function distance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Animation loop
  let frame = 0;
  function tick() {
    frame++;
    // battery bob/wobble
    for (let b of state.batteries) {
      b.wobble += 0.02;
      if (!state.holdingBattery || state.holdingBattery !== b.id) {
        b.x = b.baseX + Math.sin(b.wobble) * 2.4;
        b.y = b.baseY + Math.cos(b.wobble * 0.92) * 1.8;
      } else {
        // held: provide smooth follow with slight easing handled by draw positions
      }
    }

    // update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity small
      p.vx *= 0.996;
      p.vy *= 0.996;
      if (p.age >= p.life) particles.splice(i, 1);
    }

    // message timer
    if (state.messageTimer > 0) state.messageTimer--;

    // update character positions (bob handled in draw)
    characters.sparky.bob = Math.sin(frame / 18) * 2;
    characters.volt.bob = Math.cos(frame / 22) * 1.6;

    // draw
    clearScreen(frame);
    drawHeader();
    drawBatteries(frame);
    drawConnectors(frame);
    drawBulbs(frame);
    drawCharacters(frame);
    // draw particles
    drawParticles();
    drawUI();

    // hint overlay
    if (state.hintVisible) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      roundRect(ctx, 60, HEIGHT - 64, 600, 46, 10, true, true);
      ctx.fillStyle = '#333';
      ctx.font = '13px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Tip: Try combining two or three batteries! Press Space to toggle sound.',
        WIDTH / 2,
        HEIGHT - 36
      );
      ctx.restore();
    }

    requestAnimationFrame(tick);
  }

  function drawParticles() {
    for (const p of particles) {
      const t = p.age / p.life;
      const alpha = Math.max(0, 1 - t) * p.fade;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color.replace(/[\d\.]+\)$/,'') ? p.color : `rgba(255,210,120,${alpha})`;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Start the game
  initLevel(1);
  tick();

  // Audio hint to user
  if (audioEnabled) {
    function showAudioHintOnce() {
      if (audioCtx && audioCtx.state === 'suspended') {
        announce('Tap the game or press any key to enable sound and start the lab!');
      }
      window.removeEventListener('pointerdown', showAudioHintOnce);
      window.removeEventListener('keydown', showAudioHintOnce);
    }
    window.addEventListener('pointerdown', showAudioHintOnce);
    window.addEventListener('keydown', showAudioHintOnce);
  } else {
    announce('Audio not available. Visual cues guide you.');
  }

  // Global safety
  window.addEventListener('unhandledrejection', (e) => {
    console.warn('Unhandled promise rejection in game:', e.reason);
  });

  // Debug helper
  try {
    Object.defineProperty(window, '__electricGameDebug', {
      value: {
        restart: () => initLevel(1),
        currentState: () => JSON.parse(JSON.stringify(state))
      },
      writable: false
    });
  } catch (e) {
    // ignore
  }
})();