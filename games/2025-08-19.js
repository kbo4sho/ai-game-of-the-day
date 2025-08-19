(function () {
  // Enhanced Electricity Math Game (visuals & audio only)
  // Render entirely inside element with ID 'game-of-the-day-stage'
  // Canvas-only graphics and Web Audio API for sound (no external resources)

  // --- Configuration ---
  const WIDTH = 720;
  const HEIGHT = 480;
  const BATTERY_COUNT = 6;
  const TARGET_MIN = 5;
  const TARGET_MAX = 12;
  const CHAR_COLORS = { sparky: '#FFB86B', amp: '#FFF39A', bolt: '#A0E7E5' };
  const TEXT_COLOR = '#E6F0FF';
  const MAX_VOLUME = 0.9;

  // --- Container and Canvas Setup ---
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container element with id "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = '';
  container.style.fontFamily = 'Inter, system-ui, sans-serif';
  container.style.userSelect = 'none';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // focusable for keyboard
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Power-Up Math: connect batteries to charge the bulb. Keyboard controls available.'
  );
  canvas.style.outline = 'none';
  canvas.style.display = 'block';
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  container.appendChild(canvas);

  // Hidden live region for screen reader updates
  const srLive = document.createElement('div');
  srLive.setAttribute('aria-live', 'polite');
  srLive.style.position = 'absolute';
  srLive.style.left = '-9999px';
  container.appendChild(srLive);

  const ctx = canvas.getContext('2d');

  // --- Audio Setup and Utilities ---
  let audioCtx = null;
  let masterGain = null;
  let backgroundGain = null;
  let ambientNodes = [];
  let pulseGain = null;
  let audioEnabled = true;
  let audioAvailable = true;

  // Safe initialization of audio context with error handling
  function initAudioIfNeeded() {
    if (audioCtx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('AudioContext not supported');
      audioCtx = new AudioCtx();

      // Master gain keeps overall level safe
      masterGain = audioCtx.createGain();
      masterGain.gain.value = MAX_VOLUME * 0.85; // slightly reduced
      masterGain.connect(audioCtx.destination);

      // Background / ambient group
      backgroundGain = audioCtx.createGain();
      backgroundGain.gain.value = 0.04; // gentle hum baseline
      backgroundGain.connect(masterGain);

      // Additional slow pulsing for warmth
      pulseGain = audioCtx.createGain();
      pulseGain.gain.value = 0.0;
      pulseGain.connect(backgroundGain);

      // Ambient layered oscillators with gentle detune and filters
      const baseFrequencies = [60, 84]; // deep pad frequencies
      ambientNodes = baseFrequencies
        .map((freq, i) => {
          try {
            const osc = audioCtx.createOscillator();
            osc.type = i === 0 ? 'sine' : 'triangle';
            osc.frequency.value = freq;
            osc.detune.value = i === 1 ? 10 : -8;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 600;
            filter.Q.value = 0.7;
            const g = audioCtx.createGain();
            g.gain.value = 0.06;
            osc.connect(filter);
            filter.connect(g);
            g.connect(backgroundGain);
            osc.start();
            return { osc, filter, g };
          } catch (err) {
            console.warn('Ambient node creation failed:', err);
            return null;
          }
        })
        .filter(Boolean);

      // gentle rhythmic pulse oscillator (very low volume)
      try {
        const pulseOsc = audioCtx.createOscillator();
        pulseOsc.type = 'sine';
        pulseOsc.frequency.value = 2.2; // slow pulse
        const pulseFilter = audioCtx.createBiquadFilter();
        pulseFilter.type = 'lowpass';
        pulseFilter.frequency.value = 8;
        pulseOsc.connect(pulseFilter);
        pulseFilter.connect(pulseGain);
        pulseOsc.start();
        ambientNodes.push({ osc: pulseOsc, filter: pulseFilter, g: pulseGain });
      } catch (err) {
        console.warn('Pulse node failed:', err);
      }

      updateAudioGain();
    } catch (err) {
      console.warn('AudioContext unavailable or failed to initialize:', err);
      audioAvailable = false;
      audioCtx = null;
    }
  }

  // Adjust master gain based on audioEnabled flag
  function updateAudioGain() {
    if (!masterGain) return;
    masterGain.gain.value = audioEnabled ? MAX_VOLUME * 0.85 : 0.0;
  }

  // Best-effort resume audio on user gesture
  function safeResumeAudio() {
    if (!audioCtx) return;
    if (typeof audioCtx.resume === 'function') {
      audioCtx.resume().catch((e) => {
        console.warn('Audio resume failed:', e);
      });
    }
  }

  // Utility: create a short noise burst (for tactile selection)
  function playNoise(duration = 0.06, volume = 0.06) {
    if (!audioAvailable) return;
    try {
      initAudioIfNeeded();
      safeResumeAudio();
      const bufferSize = audioCtx.sampleRate * duration;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
      }
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      const g = audioCtx.createGain();
      g.gain.value = volume;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 900;
      source.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      source.start();
      source.stop(audioCtx.currentTime + duration + 0.01);
    } catch (err) {
      console.warn('playNoise error:', err);
    }
  }

  // Play a short musical tone with envelope and optional filter
  function playTone(frequency, type = 'sine', duration = 0.16, gain = 0.08, attack = 0.01, release = 0.05, filterFreq = 1200) {
    if (!audioAvailable) return;
    try {
      initAudioIfNeeded();
      safeResumeAudio();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      osc.type = type;
      osc.frequency.value = frequency;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration - release);
      osc.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (err) {
      console.warn('playTone error:', err);
    }
  }

  // Click / selection sound: short metallic click + tiny noise burst
  function playClick() {
    if (!audioAvailable) return;
    try {
      initAudioIfNeeded();
      safeResumeAudio();
      playTone(900, 'square', 0.08, 0.06, 0.005, 0.02, 2200);
      setTimeout(() => playNoise(0.035, 0.022), 8);
    } catch (err) {
      console.warn('playClick error:', err);
    }
  }

  // Correct sound: soft pleasant chord arpeggio
  function playCorrect() {
    if (!audioAvailable) return;
    try {
      initAudioIfNeeded();
      safeResumeAudio();
      const now = audioCtx.currentTime;
      const notes = [440, 550, 660]; // pleasant chord (A, C#5, E5)
      notes.forEach((n, i) => {
        const delay = i * 0.08;
        playTone(n, i === 0 ? 'triangle' : 'sine', 0.26, 0.07 + i * 0.02, 0.01, 0.08, 1400);
        // add a sweet bell overtone
        setTimeout(() => playTone(n * 2, 'sine', 0.14, 0.03, 0.005, 0.05, 2400), delay * 1000 + 40);
      });
      // subtle sparkle noise
      setTimeout(() => playNoise(0.08, 0.03), 160);
    } catch (err) {
      console.warn('playCorrect error:', err);
    }
  }

  // Wrong sound: gentle descending wobble (not harsh)
  function playWrong() {
    if (!audioAvailable) return;
    try {
      initAudioIfNeeded();
      safeResumeAudio();
      // descending tones
      const now = audioCtx.currentTime;
      const seq = [320, 260, 200];
      seq.forEach((f, i) => {
        setTimeout(() => playTone(f, 'sawtooth', 0.18, 0.07, 0.005, 0.04, 900), i * 110);
      });
      // low sub rumble for emphasis
      setTimeout(() => {
        try {
          const sub = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          sub.type = 'sine';
          sub.frequency.value = 80;
          g.gain.value = 0.03;
          const fl = audioCtx.createBiquadFilter();
          fl.type = 'lowpass';
          fl.frequency.value = 200;
          sub.connect(fl);
          fl.connect(g);
          g.connect(masterGain);
          sub.start();
          sub.stop(audioCtx.currentTime + 0.36);
        } catch (err) {
          console.warn('playWrong sub error:', err);
        }
      }, 60);
    } catch (err) {
      console.warn('playWrong error:', err);
    }
  }

  // --- Game State (unchanged logic) ---
  let batteries = []; // {x,y,r,value,selected,index}
  let targetNumber = 0;
  let selectedSum = 0;
  let score = 0;
  let round = 0;
  let message = 'Click batteries or use arrow keys and Enter. Press C to check.';
  let shakeTimer = 0;
  let sparkles = [];
  let keyIndex = 0; // keyboard highlight index
  let muteIconPulse = 0;

  // --- Utility functions ---
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Create a battery values list that guarantees at least one subset sums to target
  function generateValuesForTarget(target) {
    const subsetCount = randInt(1, Math.min(3, BATTERY_COUNT));
    let remain = target;
    const subset = [];
    for (let i = 0; i < subsetCount; i++) {
      const maxAllow = Math.min(6, remain - (subsetCount - i - 1) * 1);
      const val = randInt(1, Math.max(1, maxAllow));
      subset.push(val);
      remain -= val;
    }
    if (remain > 0) {
      subset[subset.length - 1] += remain;
    }
    const values = subset.slice();
    while (values.length < BATTERY_COUNT) {
      values.push(randInt(1, 6));
    }
    shuffle(values);
    return values;
  }

  // Generate a round (target and battery positions)
  function newRound() {
    round += 1;
    targetNumber = randInt(TARGET_MIN, TARGET_MAX);
    const values = generateValuesForTarget(targetNumber);
    batteries = [];
    const padding = 30;
    const areaLeft = 140; // left area reserved for character
    const gridCols = 3;
    const gridRows = 2;
    const cellW = (WIDTH - areaLeft - padding * 2) / gridCols;
    const cellH = (HEIGHT - padding * 2) / gridRows;
    let i = 0;
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const x = areaLeft + padding + c * cellW + cellW / 2;
        const y = padding + r * cellH + cellH / 2 + (r === 1 ? 8 : 0);
        const b = {
          x,
          y,
          r: 26,
          value: values[i],
          selected: false,
          index: i,
          id: i,
          wobble: Math.random() * 2000,
        };
        batteries.push(b);
        i++;
      }
    }
    selectedSum = 0;
    keyIndex = 0;
    message = 'Power up the bulb to reach ' + targetNumber + '. Select batteries to add.';
    srLive.textContent = `Round ${round}. Target ${targetNumber}. ${message}`;
  }

  // Validate if subset equals target (used when checking)
  function checkSelection() {
    if (selectedSum === targetNumber) {
      score += 1;
      message = 'Perfect! Amp is charged!';
      playCorrect();
      spawnSparkles(batteries.filter((b) => b.selected));
      setTimeout(() => {
        newRound();
      }, 1100);
    } else {
      message = `Not quite. Sum is ${selectedSum}. Try again.`;
      playWrong();
      shakeTimer = 20;
    }
    srLive.textContent = message;
  }

  function toggleBatterySelection(index) {
    const b = batteries[index];
    if (!b) return;
    b.selected = !b.selected;
    recalcSum();
    // small visual spark on selection
    if (b.selected) {
      spawnSparkles([b]);
    }
    playClick();
    srLive.textContent = `Battery ${index + 1} is now ${b.selected ? 'selected' : 'deselected'}. Sum is ${selectedSum}.`;
  }

  function recalcSum() {
    selectedSum = batteries.reduce((s, b) => s + (b.selected ? b.value : 0), 0);
  }

  // Sparkle effect on correct or selection
  function spawnSparkles(targetBatteries) {
    for (let i = 0; i < 12; i++) {
      const b = targetBatteries[i % targetBatteries.length] || batteries[0];
      sparkles.push({
        x: b.x + randInt(-10, 10),
        y: b.y + randInt(-10, 10),
        vx: (Math.random() - 0.5) * 2.6,
        vy: -Math.random() * 2.8 - 0.6,
        life: randInt(36, 78),
        color: i % 3 === 0 ? '#FFF7A1' : '#FFDABD',
        size: randInt(2, 5),
      });
    }
  }

  // --- Drawing Functions (enhanced visuals) ---
  function drawBackground(time) {
    // base gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#071025');
    g.addColorStop(1, '#0f1a29');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft vignette
    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 40, WIDTH / 2, HEIGHT / 2, Math.max(WIDTH, HEIGHT) * 0.9);
    vignette.addColorStop(0, 'rgba(255,255,255,0.00)');
    vignette.addColorStop(1, 'rgba(2,6,12,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // gentle animated orbs as glowing energy pockets
    const orbColors = ['rgba(160,231,229,0.06)', 'rgba(255,184,107,0.04)', 'rgba(160,231,229,0.04)'];
    for (let i = 0; i < 4; i++) {
      const cx = 60 + i * 160 + Math.sin((time + i * 700) / 1200) * 18;
      const cy = 60 + Math.cos((time + i * 900) / 1000) * 10;
      const rx = 120 + (i % 2 === 0 ? 8 : -8);
      const ry = 40 + (i % 3 === 0 ? 12 : 0);
      ctx.beginPath();
      ctx.fillStyle = orbColors[i % orbColors.length];
      ctx.ellipse(cx, cy, rx, ry, Math.sin(i) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // dotted grid lines for subtle tech feel
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 40) {
      ctx.beginPath();
      const offset = (time / 600) % 40;
      ctx.moveTo(x + offset, 0);
      ctx.lineTo(x + offset, HEIGHT);
      ctx.stroke();
    }
  }

  function drawCharacters(time) {
    // Left character (Sparky) refined with small eye blink and subtle bob
    const sparkyX = 80;
    const sparkyY = 220 + Math.sin(time / 800) * 4;
    ctx.save();
    // body gradient
    const bodyGrad = ctx.createLinearGradient(sparkyX - 40, sparkyY - 50, sparkyX + 40, sparkyY + 30);
    bodyGrad.addColorStop(0, '#FFCF98');
    bodyGrad.addColorStop(1, '#FFB86B');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(sparkyX, sparkyY, 52, 66, 0.08, 0, Math.PI * 2);
    ctx.fill();

    // tail with subtle movement
    ctx.fillStyle = '#FF7A59';
    ctx.beginPath();
    ctx.ellipse(sparkyX - 56 + Math.sin(time / 400) * 2, sparkyY - 6, 26, 44, -0.64, 0, Math.PI * 2);
    ctx.fill();

    // helmet with sheen
    ctx.fillStyle = '#C6E4FF';
    ctx.beginPath();
    ctx.roundRect(sparkyX - 34, sparkyY - 56, 68, 18, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(sparkyX - 26, sparkyY - 54, 22, 8);

    // eyes (blink)
    ctx.fillStyle = '#111';
    const blink = (Math.sin(time / 420 + sparkyX) + 1) > 1.8 ? 0.2 : 1; // rare blink
    ctx.beginPath();
    ctx.ellipse(sparkyX + 14, sparkyY - 12, 6, 6 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(sparkyX - 6, sparkyY - 8, 5, 5 * blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // small wrench icon on chest (drawn)
    ctx.strokeStyle = 'rgba(10,18,32,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sparkyX - 6, sparkyY + 10);
    ctx.lineTo(sparkyX + 8, sparkyY - 6);
    ctx.stroke();
    ctx.restore();

    // Amp (the bulb) top-right with responsive glow
    const ampX = WIDTH - 170;
    const ampY = 110;
    ctx.save();
    // bulb brightness based on selectedSum
    const bulbLight = Math.min(1, Math.max(0.08, selectedSum / Math.max(targetNumber, 1)));
    const bulbRadiusX = 36 + bulbLight * 10;
    const bulbRadiusY = 48 + bulbLight * 12;

    // glowing halo
    const halo = ctx.createRadialGradient(ampX, ampY, 6, ampX, ampY, 120);
    halo.addColorStop(0, `rgba(255,245,160,${0.12 + bulbLight * 0.28})`);
    halo.addColorStop(1, 'rgba(255,245,160,0.00)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(ampX, ampY, 120 * bulbLight + 30, 90 * bulbLight + 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // bulb body with subtle glass sheen
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,246,180,${0.95})`;
    ctx.ellipse(ampX, ampY, bulbRadiusX, bulbRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(ampX - 10, ampY - 14, bulbRadiusX * 0.4, bulbRadiusY * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // filament animated
    ctx.strokeStyle = `rgba(255,160,80,${0.7 + bulbLight * 0.3})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ampX - 10, ampY + Math.sin(time / 150) * 2);
    ctx.quadraticCurveTo(ampX, ampY + 8 + bulbLight * 2, ampX + 10, ampY + Math.sin(time / 150) * 2);
    ctx.stroke();

    // base metal
    ctx.fillStyle = '#8F979E';
    ctx.beginPath();
    ctx.roundRect(ampX - 22, ampY + 46, 44, 12, 4);
    ctx.fill();

    // face eyes
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(ampX - 12, ampY - 6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ampX + 8, ampY - 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bolt cloud bottom-right as friendly observer
    const boltX = WIDTH - 90;
    const boltY = HEIGHT - 70;
    ctx.save();
    ctx.fillStyle = CHAR_COLORS.bolt;
    ctx.beginPath();
    ctx.ellipse(boltX, boltY, 64, 34, 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#B4FFF7';
    ctx.beginPath();
    ctx.ellipse(boltX - 28, boltY - 10, 30, 18, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#1A2230';
    ctx.fillRect(boltX - 12, boltY - 10, 8, 6);
    ctx.restore();
  }

  function drawBattery(b, time) {
    // drop shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.ellipse(b.x + 6, b.y + 18, b.r + 10, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // slight floating animation
    const bob = Math.sin((time + b.wobble) / 600) * 3;
    ctx.save();
    ctx.translate(b.x, b.y + bob);

    // battery body with gradient
    const bodyW = b.r * 1.9;
    const bodyH = b.r * 1.1;
    const bodyGrad = ctx.createLinearGradient(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2);
    if (b.selected) {
      bodyGrad.addColorStop(0, '#FFF2C8');
      bodyGrad.addColorStop(1, '#FFD86B');
    } else {
      bodyGrad.addColorStop(0, '#DFF4FF');
      bodyGrad.addColorStop(1, '#CFE9FF');
    }
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 8);
    ctx.fill();

    // small glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-bodyW * 0.15, -bodyH * 0.2, bodyW * 0.3, bodyH * 0.5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // top terminal
    ctx.fillStyle = '#B0C6FF';
    ctx.fillRect(-12, -bodyH / 2 - 10, 24, 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.strokeRect(-12, -bodyH / 2 - 10, 24, 10);

    // number text
    ctx.fillStyle = '#07203E';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.value), 0, 0);

    // little connector dot if selected
    if (b.selected) {
      ctx.fillStyle = '#FFE39C';
      ctx.beginPath();
      ctx.arc(bodyW / 2 - 6, -bodyH / 2 + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,18,32,0.12)';
      ctx.stroke();
    }

    ctx.restore();

    // keyboard highlight ring
    if (b.index === keyIndex) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      const pulse = 1 + Math.sin(time / 200 + b.index) * 0.06;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + Math.sin((time + b.wobble) / 600) * 3, (b.r + 10) * pulse, (b.r + 12) * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // selected bolt mark
    if (b.selected) {
      ctx.save();
      ctx.strokeStyle = '#FFDA6B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x + 8, b.y - 8);
      ctx.lineTo(b.x - 6, b.y + 2);
      ctx.lineTo(b.x + 6, b.y + 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawConnections(time) {
    const bulbX = WIDTH - 170;
    const bulbY = 110;
    batteries.forEach((b) => {
      if (!b.selected) return;
      ctx.save();
      // glowing wire path
      ctx.strokeStyle = 'rgba(255,248,160,0.88)';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255,240,160,0.12)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const startX = b.x;
      const startY = b.y + 18;
      ctx.moveTo(startX, startY);
      // jittering midpoints
      const midX = (startX + bulbX) / 2 + Math.sin((time + b.index * 420) / 220) * 10;
      const midY = (startY + bulbY) / 2 + Math.cos((time + b.index * 520) / 240) * 6;
      ctx.quadraticCurveTo(midX, midY, bulbX - 10, bulbY + 30);
      ctx.stroke();

      // inner bright line
      ctx.strokeStyle = 'rgba(255,250,200,0.98)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(midX * 0.98, midY, bulbX - 10, bulbY + 30);
      ctx.stroke();

      // little animated sparks along wire occasionally
      const tseed = Math.floor((time / 300 + b.index) % 4);
      if (Math.random() < 0.02) {
        const sparkX = startX + (midX - startX) * Math.random() * 0.9;
        const sparkY = startY + (midY - startY) * Math.random() * 0.9;
        sparkles.push({
          x: sparkX + randInt(-4, 4),
          y: sparkY + randInt(-4, 4),
          vx: (Math.random() - 0.5) * 1.4,
          vy: -Math.random() * 1.6 - 0.4,
          life: 20,
          color: '#FFF7A8',
          size: 2 + Math.random() * 2,
        });
      }

      ctx.restore();
    });
  }

  function drawHUD(time) {
    // top translucent bar
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, WIDTH, 56);

    // target
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Target: ${targetNumber}`, 18, 34);

    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#A9C2E6';
    ctx.fillText(`Sum: ${selectedSum}`, 150, 34);
    ctx.fillText(`Score: ${score}`, 250, 34);
    ctx.fillText(`Round: ${round}`, 340, 34);

    // instruction panel bottom-left
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = 'rgba(6,12,22,0.36)';
    ctx.roundRect(12, HEIGHT - 56, 340, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#DCEEFF';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(message, 22, HEIGHT - 30);
    ctx.restore();

    // audio icon (visual cue)
    const iconX = WIDTH - 48;
    const iconY = 18;
    ctx.save();
    // background capsule
    ctx.beginPath();
    ctx.fillStyle = audioAvailable ? (audioEnabled ? '#9EE6A1' : '#FFD6A5') : '#666';
    ctx.roundRect(iconX - 18, iconY - 12, 36, 24, 7);
    ctx.fill();

    // speaker glyph
    ctx.fillStyle = '#08121A';
    ctx.beginPath();
    ctx.moveTo(iconX - 9, iconY + 6);
    ctx.lineTo(iconX - 4, iconY + 6);
    ctx.lineTo(iconX + 2, iconY + 12);
    ctx.lineTo(iconX + 2, iconY - 12);
    ctx.lineTo(iconX - 4, iconY - 6);
    ctx.lineTo(iconX - 9, iconY - 6);
    ctx.closePath();
    ctx.fill();

    // sound waves or mute slash
    if (audioAvailable && audioEnabled) {
      ctx.strokeStyle = '#08121A';
      ctx.lineWidth = 2;
      const waveR = 7 + Math.sin(muteIconPulse) * 1.6;
      ctx.beginPath();
      ctx.arc(iconX + 6, iconY - 2, waveR, -0.7, 0.7);
      ctx.stroke();
    } else if (audioAvailable && !audioEnabled) {
      ctx.strokeStyle = '#08121A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(iconX + 10, iconY - 10);
      ctx.lineTo(iconX - 8, iconY + 11);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#333';
      ctx.font = '10px sans-serif';
      ctx.fillText('NoAudio', iconX - 16, iconY + 4);
    }
    ctx.restore();

    // hint line bottom-right
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#E8F4FF';
    ctx.textAlign = 'right';
    ctx.fillText('Keys: Arrows/Enter select, C=Check, M=Mute, R=Reset', WIDTH - 10, HEIGHT - 10);
  }

  function drawSparkles(time) {
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      ctx.globalAlpha = Math.max(0, s.life / 80);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.08;
      s.life -= 1;
      if (s.life <= 0) sparkles.splice(i, 1);
    }
  }

  // --- Main Render Loop ---
  let lastTime = Date.now();
  function render() {
    const time = Date.now();
    const dt = time - lastTime;
    lastTime = time;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (shakeTimer > 0) {
      const shakeX = Math.sin(shakeTimer * 3) * 6;
      ctx.save();
      ctx.translate(shakeX, 0);
    }

    drawBackground(time);
    drawCharacters(time);
    drawConnections(time);
    batteries.forEach((b) => drawBattery(b, time));
    drawSparkles(time);

    if (shakeTimer > 0) {
      ctx.restore();
      shakeTimer--;
    }

    drawHUD(time);

    muteIconPulse += 0.12;
    requestAnimationFrame(render);
  }

  // --- Input Handling (unchanged mechanics) ---
  function getBatteryAt(x, y) {
    for (const b of batteries) {
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= (b.r + 8) * (b.r + 8)) return b;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    try {
      initAudioIfNeeded();
      safeResumeAudio();
    } catch (e) {
      // ignore
    }
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    // audio icon area
    const iconX = WIDTH - 48;
    const iconY = 18;
    if (x >= iconX - 18 && x <= iconX + 18 && y >= iconY - 12 && y <= iconY + 12) {
      if (audioAvailable) {
        audioEnabled = !audioEnabled;
        updateAudioGain();
        playClick();
        message = audioEnabled ? 'Audio on' : 'Audio off';
        srLive.textContent = message;
      } else {
        message = 'Audio not available on this device.';
        srLive.textContent = message;
      }
      return;
    }

    const b = getBatteryAt(x, y);
    if (b) {
      toggleBatterySelection(b.index);
    } else {
      playClick();
    }
  });

  // keyboard controls
  canvas.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
      keyIndex = (keyIndex + 1) % batteries.length;
      playClick();
      recalcSum();
      ev.preventDefault();
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
      keyIndex = (keyIndex - 1 + batteries.length) % batteries.length;
      playClick();
      recalcSum();
      ev.preventDefault();
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      toggleBatterySelection(keyIndex);
      ev.preventDefault();
    } else if (ev.key.toLowerCase() === 'c') {
      checkSelection();
      ev.preventDefault();
    } else if (ev.key.toLowerCase() === 'r') {
      newRound();
      playClick();
      ev.preventDefault();
    } else if (ev.key.toLowerCase() === 'm') {
      if (audioAvailable) {
        audioEnabled = !audioEnabled;
        updateAudioGain();
        playClick();
        message = audioEnabled ? 'Audio on' : 'Audio off';
        srLive.textContent = message;
      }
      ev.preventDefault();
    }
  });

  // focus visual for accessibility
  canvas.addEventListener('focus', () => {
    canvas.style.boxShadow = '0 0 8px rgba(100,180,255,0.18)';
  });
  canvas.addEventListener('blur', () => {
    canvas.style.boxShadow = 'none';
  });

  // --- Start Overlay & Initial Loop ---
  let waitingForInteraction = true;

  function drawStartOverlay() {
    ctx.fillStyle = 'rgba(4,6,12,0.82)';
    ctx.fillRect(40, 70, WIDTH - 80, HEIGHT - 140);

    ctx.fillStyle = '#FFF';
    ctx.font = '700 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Power-Up Math!', WIDTH / 2, HEIGHT / 2 - 48);

    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#DCEEFF';
    ctx.fillText('Help Sparky connect batteries to charge Amp the Bulb.', WIDTH / 2, HEIGHT / 2 - 18);

    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#F0F6FF';
    ctx.fillText('Select batteries so their numbers add up to the target number shown.', WIDTH / 2, HEIGHT / 2 + 8);

    // start button drawn with soft glow
    const btnX = WIDTH / 2 - 80;
    const btnY = HEIGHT / 2 + 34;
    ctx.fillStyle = '#E7F6FF';
    ctx.roundRect(btnX, btnY, 160, 42, 9);
    ctx.fill();
    ctx.fillStyle = '#0B1220';
    ctx.font = '700 16px sans-serif';
    ctx.fillText('Click to Start', WIDTH / 2, btnY + 27);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#CDE6FF';
    ctx.fillText('Keyboard: Arrows+Enter, C=Check, M=Mute, R=Reset', WIDTH / 2, btnY + 70);
  }

  function onFirstInteraction() {
    if (!waitingForInteraction) return;
    try {
      initAudioIfNeeded();
      safeResumeAudio();
    } catch (e) {
      // no-op
    }
    waitingForInteraction = false;
    playTone(520, 'sine', 0.12, 0.06);
    canvas.removeEventListener('pointerdown', onFirstInteraction);
    canvas.removeEventListener('keydown', onFirstInteraction);
    newRound();
    requestAnimationFrame(render);
  }

  canvas.addEventListener('pointerdown', onFirstInteraction);
  canvas.addEventListener('keydown', onFirstInteraction);

  if (!window.AudioContext && !window.webkitAudioContext) {
    audioAvailable = false;
    message = 'Audio not supported in this browser. Use keyboard or mouse to play.';
    srLive.textContent = message;
  }

  // Canvas roundRect polyfill
  if (typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
      else {
        var defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
        for (var side in defaultRadius) {
          r[side] = r[side] || defaultRadius[side];
        }
      }
      this.beginPath();
      this.moveTo(x + r.tl, y);
      this.lineTo(x + w - r.tr, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
      this.lineTo(x + w, y + h - r.br);
      this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
      this.lineTo(x + r.bl, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
      this.lineTo(x, y + r.tl);
      this.quadraticCurveTo(x, y, x + r.tl, y);
      this.closePath();
    };
  }

  // Initial draw while waiting for interaction
  function initialDrawLoop() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground(Date.now());
    drawCharacters(Date.now());
    batteries.forEach((b) => drawBattery(b, Date.now()));
    drawHUD(Date.now());
    drawStartOverlay();
    if (waitingForInteraction) {
      requestAnimationFrame(initialDrawLoop);
    }
  }
  initialDrawLoop();

  // Ensure keyboard focus
  setTimeout(() => {
    try {
      canvas.focus();
    } catch (e) {}
  }, 300);

  // Expose safe debug hooks
  window.powerUpMath = {
    newRound,
    toggleAudio: () => {
      if (!audioAvailable) return;
      audioEnabled = !audioEnabled;
      updateAudioGain();
    },
  };
})();