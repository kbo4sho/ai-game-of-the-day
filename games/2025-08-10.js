(function () {
  // Enhanced Electricity Math Game (visuals & audio improvements only)
  // Renders inside element with ID 'game-of-the-day-stage'
  // Canvas-only graphics and Web Audio API synthesized sounds
  // Game mechanics and math logic preserved.

  // === Container & Canvas Setup ===
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container element with ID "game-of-the-day-stage" not found.');
    return;
  }
  container.style.position = 'relative';
  container.style.width = '720px';
  container.style.height = '480px';
  container.setAttribute('role', 'application');

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.outline = 'none';
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute(
    'aria-label',
    'Spark City math game. Use arrow keys to move the spark. Press M to mute. Press Enter or Space to start or interact.'
  );
  container.appendChild(canvas);

  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '0';
  live.style.top = '0';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.overflow = 'hidden';
  live.style.clip = 'rect(1px, 1px, 1px, 1px)';
  live.style.whiteSpace = 'nowrap';
  live.style.clipPath = 'inset(50%)';
  container.appendChild(live);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('2D canvas context not available.');
    return;
  }

  // === Audio Setup & Utilities ===
  let audioCtx = null;
  let masterGain = null;
  let ambientGain = null;
  let ambientOscs = [];
  let audioAllowed = false;
  let audioEnabled = true;
  let noiseBuffer = null;

  // Create a simple noise buffer for percussive elements
  function makeNoiseBuffer() {
    if (!audioCtx) return null;
    try {
      const length = audioCtx.sampleRate * 1;
      const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length); // decaying noise
      }
      return buffer;
    } catch (e) {
      console.warn('makeNoiseBuffer failed', e);
      return null;
    }
  }

  function initAudio() {
    if (audioCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.7;
      masterGain.connect(audioCtx.destination);

      // ambient chord (layered sine/triangle) with slow filter movement
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0.06; // gentle
      ambientGain.connect(masterGain);

      const notes = [110, 138.59, 164.81]; // gentle chord (A2, C#3, E3-ish)
      ambientOscs = notes.map((n, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = n;
        const g = audioCtx.createGain();
        g.gain.value = 0.6;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800 + i * 100;
        o.connect(g);
        g.connect(filter);
        filter.connect(ambientGain);
        o.start();
        return { osc: o, gain: g, filter };
      });

      // small LFO to modulate ambient amplitude gently
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06;
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(ambientGain.gain);
      lfo.start();

      // noise buffer for effects
      noiseBuffer = makeNoiseBuffer();

      audioAllowed = true;
    } catch (e) {
      console.warn('AudioContext creation failed or blocked by browser:', e);
      audioCtx = null;
      audioAllowed = false;
    }
  }

  function resumeAudioOnGesture() {
    if (!audioCtx) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => console.warn('resume failed', e));
    }
  }

  // Helper to play an oscillator tone with envelope and optional filter sweep
  function playTone({
    freq = 440,
    duration = 0.2,
    type = 'sine',
    gain = 0.12,
    detune = 0,
    filter = null,
    attack = 0.01,
    release = 0.08
  }) {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      g.gain.value = 0.0001;
      o.connect(g);
      let nodeOut = g;
      if (filter) {
        const f = audioCtx.createBiquadFilter();
        f.type = filter.type || 'lowpass';
        f.frequency.value = filter.start || 1200;
        g.connect(f);
        f.connect(masterGain);
        nodeOut = f;
        // schedule filter sweep if provided
        const now = audioCtx.currentTime;
        if (filter.end) {
          f.frequency.setValueAtTime(filter.start, now);
          f.frequency.exponentialRampToValueAtTime(Math.max(60, filter.end), now + duration);
        }
      } else {
        g.connect(masterGain);
      }
      const now = audioCtx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
      o.start(now);
      o.stop(now + duration + release + 0.05);
    } catch (e) {
      console.warn('playTone error:', e);
    }
  }

  // A plucky sound when collecting orbs: oscillator + short filtered noise transient
  function playPluck(value) {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    try {
      const base = 240 + value * 30;
      // primary pluck
      playTone({
        freq: base,
        duration: 0.16,
        type: 'triangle',
        gain: 0.14,
        attack: 0.002,
        release: 0.06,
        filter: { start: 1800, end: 600 }
      });
      // subtle higher harmonic
      setTimeout(
        () =>
          playTone({
            freq: base * 1.48,
            duration: 0.12,
            type: 'sine',
            gain: 0.06,
            attack: 0.002,
            release: 0.04
          }),
        40
      );
      // noise transient for tactile feel
      if (noiseBuffer) {
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer;
        const ng = audioCtx.createGain();
        ng.gain.value = 0.0001;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 800;
        src.connect(filter);
        filter.connect(ng);
        ng.connect(masterGain);
        const now = audioCtx.currentTime;
        ng.gain.linearRampToValueAtTime(0.06, now + 0.002);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        src.start(now);
        src.stop(now + 0.14);
      }
    } catch (e) {
      console.warn('playPluck error:', e);
    }
  }

  // Success melody: gentle arpeggio with subtle delay effect (simulated)
  function playSuccessMelody() {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    try {
      const seq = [660, 880, 990];
      seq.forEach((f, i) => {
        setTimeout(
          () =>
            playTone({
              freq: f,
              duration: 0.16,
              type: 'sine',
              gain: 0.13,
              attack: 0.006,
              release: 0.08,
              filter: { start: 2400, end: 800 }
            }),
          i * 160
        );
      });
      // add a soft sparkle (tiny noise bursts)
      setTimeout(() => {
        if (!noiseBuffer) return;
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer;
        const ng = audioCtx.createGain();
        ng.gain.value = 0.0001;
        src.connect(ng);
        ng.connect(masterGain);
        const now = audioCtx.currentTime;
        ng.gain.linearRampToValueAtTime(0.06, now + 0.002);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        src.start(now);
        src.stop(now + 0.14);
      }, 240);
    } catch (e) {
      console.warn('playSuccessMelody error:', e);
    }
  }

  // Buzzer with a pitch descend and filtered noise to avoid harshness
  function playBuzzer() {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // sawtooth oscillator with descending pitch
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(240, now);
      o.frequency.exponentialRampToValueAtTime(80, now + 0.36);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      // gentle lowpass to soften
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(1000, now);
      f.frequency.exponentialRampToValueAtTime(400, now + 0.36);
      o.connect(g);
      g.connect(f);
      f.connect(masterGain);
      o.start(now);
      o.stop(now + 0.38);

      // a soft noise "thud" for feedback (short)
      if (noiseBuffer) {
        setTimeout(() => {
          const src = audioCtx.createBufferSource();
          src.buffer = noiseBuffer;
          const ng = audioCtx.createGain();
          ng.gain.value = 0.0001;
          const filter = audioCtx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 800;
          src.connect(filter);
          filter.connect(ng);
          ng.connect(masterGain);
          const t = audioCtx.currentTime;
          ng.gain.linearRampToValueAtTime(0.07, t + 0.003);
          ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
          src.start(t);
          src.stop(t + 0.16);
        }, 10);
      }
    } catch (e) {
      console.warn('playBuzzer error:', e);
    }
  }

  // Small click for UI interactions
  function playClick() {
    if (!audioAllowed || !audioEnabled || !audioCtx) return;
    try {
      playTone({
        freq: 1200,
        duration: 0.06,
        type: 'square',
        gain: 0.06,
        attack: 0.001,
        release: 0.02
      });
    } catch (e) {
      console.warn('playClick error:', e);
    }
  }

  // === Game Variables & Mechanics (unchanged logic) ===
  const W = canvas.width;
  const H = canvas.height;

  let state = 'start'; // start, playing, levelComplete, success, gameover
  let level = 1;
  let score = 0;
  let lives = 3;

  const player = {
    x: 90,
    y: H / 2,
    r: 16,
    vx: 0,
    vy: 0,
    speed: 140,
    collected: [],
    color: '#FFD166',
    pulse: 0 // for visual animation
  };

  let bulbs = [];
  let orbs = [];
  let particles = []; // for visual effects

  let lastTs = null;
  let running = true;

  const keys = {};

  // A calmer, kid-friendly palette
  const palette = {
    skyTop: '#E8F8FF',
    skyBottom: '#F3FEFF',
    park: '#E8FFF5',
    wire: '#6B7CFA',
    sparkGlow: '#FFF3C2',
    text: '#023047',
    accent: '#FF7B7B',
    soft: '#F8FBFF'
  };

  const characters = {
    wattson: { name: 'Wattson', role: 'Lightning Squirrel', desc: 'A zippy squirrel who loves counting charges!' },
    ampy: { name: 'Ampy', role: 'Friendly Bulb', desc: 'A gentle bulb who lights up when you give the right charge.' },
    gearhead: { name: 'Gearhead', role: 'Helper Robot', desc: 'Keeps the city circuits tidy and gives hints.' }
  };

  function announce(text) {
    live.textContent = text;
  }

  // === Utilities ===
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const distance = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // === Level & Game Actions (logic preserved) ===
  function newLevel(lv = 1) {
    level = lv;
    player.x = 90;
    player.y = H / 2;
    player.collected = [];
    // bulbs generation preserved
    bulbs = [];
    const bulbCount = Math.min(4, 2 + Math.floor(level / 2));
    const rightX = W - 120;
    const spacing = H / (bulbCount + 1);
    for (let i = 0; i < bulbCount; i++) {
      const minTarget = 3;
      const maxTarget = Math.min(20, 6 + level * 2);
      const target = randInt(minTarget, maxTarget);
      bulbs.push({
        x: rightX,
        y: spacing * (i + 1),
        r: 36,
        target,
        lit: false,
        tries: 0,
        glowPhase: Math.random() * Math.PI * 2
      });
    }

    // orbs generation preserved
    const orbCount = Math.max(6, 6 + level);
    orbs = [];
    for (let i = 0; i < orbCount; i++) {
      const val = randInt(1, Math.min(9, 3 + Math.floor(level)));
      const px = rand(160, W - 240);
      const py = rand(60, H - 60);
      orbs.push({
        x: px,
        y: py,
        r: 14,
        value: val,
        collected: false,
        floatPhase: rand(0, Math.PI * 2)
      });
    }

    // small particle burst for level start
    particles.push({
      x: player.x,
      y: player.y,
      life: 0.6,
      size: 2.5,
      vx: 30,
      vy: -10,
      color: '#FFF3C2',
      spread: 140
    });

    announce(
      `Level ${level} started. Bulbs need: ${bulbs
        .map((b) => b.target)
        .join(', ')}. Use arrow keys to move the spark and add numbers to match the bulbs.`
    );
    playClick();
  }

  function collectOrb(orb) {
    orb.collected = true;
    player.collected.push(orb.value);
    playPluck(orb.value);
    // create a little trail particle to indicate collection
    for (let i = 0; i < 6; i++) {
      const ang = Math.PI * 2 * Math.random();
      const sp = rand(30, 80);
      particles.push({
        x: orb.x,
        y: orb.y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.45 + Math.random() * 0.25,
        size: 2 + Math.random() * 2,
        color: '#FFF7D6'
      });
    }
    announce(`You collected ${orb.value}. Current charge is ${player.collected.reduce((a, b) => a + b, 0)}.`);
  }

  function deliverToBulb(bulb) {
    const current = player.collected.reduce((a, b) => a + b, 0);
    bulb.tries++;
    if (current === bulb.target) {
      bulb.lit = true;
      score += Math.max(10, bulb.target * 2);
      playSuccessMelody();
      announce(`${characters.ampy.name} lit up! You matched ${current}. Score ${score}.`);
      player.collected = [];
      // soft particle spark
      for (let i = 0; i < 18; i++) {
        const ang = Math.PI * 2 * Math.random();
        particles.push({
          x: bulb.x,
          y: bulb.y - 8,
          vx: Math.cos(ang) * rand(20, 90),
          vy: Math.sin(ang) * rand(10, 80),
          life: 0.8 + Math.random() * 0.6,
          size: 2 + Math.random() * 3,
          color: '#FFF7C2'
        });
      }
      if (bulbs.every((b) => b.lit)) {
        state = 'levelComplete';
        announce(`Level complete! Score ${score}. Press Enter to go to next level.`);
      }
    } else {
      playBuzzer();
      lives -= 1;
      announce(
        `Oh no! ${characters.gearhead.name} says try again. Delivered ${current} but needed ${bulb.target}. Lives left ${lives}.`
      );
      if (player.collected.length > 0) {
        const droppedValue = player.collected.pop();
        orbs.push({
          x: player.x + rand(-40, 40),
          y: player.y + rand(-20, 20),
          r: 14,
          value: droppedValue,
          collected: false,
          floatPhase: 0
        });
        playPluck(droppedValue);
      }
      if (lives <= 0) {
        state = 'gameover';
        announce('Game over. Press Enter to restart.');
      }
    }
  }

  // === Input Handling (preserved) ===
  window.addEventListener(
    'keydown',
    (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      keys[e.key] = true;
      resumeAudioOnGesture();

      if (state === 'start' && (e.key === 'Enter' || e.key === ' ')) {
        state = 'playing';
        newLevel(1);
        lastTs = performance.now();
        announce('Game started. Move the spark to collect numbers and match the bulbs.');
        playClick();
      } else if (
        (state === 'levelComplete' || state === 'gameover' || state === 'success') &&
        (e.key === 'Enter' || e.key === ' ')
      ) {
        if (state === 'levelComplete') {
          newLevel(level + 1);
          state = 'playing';
          lastTs = performance.now();
        } else {
          level = 1;
          score = 0;
          lives = 3;
          newLevel(1);
          state = 'playing';
          lastTs = performance.now();
        }
        playClick();
      } else if (e.key.toLowerCase() === 'm') {
        audioEnabled = !audioEnabled;
        announce(audioEnabled ? 'Audio enabled.' : 'Audio muted.');
      }
    },
    { passive: false }
  );

  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  canvas.addEventListener('click', (e) => {
    canvas.focus();
    resumeAudioOnGesture();
    if (state === 'start') {
      state = 'playing';
      newLevel(1);
      lastTs = performance.now();
      announce('Game started. Move the spark to collect numbers and match the bulbs.');
      playClick();
    } else if (state === 'levelComplete') {
      newLevel(level + 1);
      state = 'playing';
      lastTs = performance.now();
      playClick();
    } else if (state === 'gameover') {
      level = 1;
      score = 0;
      lives = 3;
      newLevel(1);
      state = 'playing';
      lastTs = performance.now();
      playClick();
    } else {
      // clicking while playing can emit a small click for affordance
      playClick();
    }
  });

  // Touch handling (preserved)
  let touchStart = null;
  canvas.addEventListener(
    'touchstart',
    (e) => {
      resumeAudioOnGesture();
      touchStart = e.touches[0];
    },
    { passive: true }
  );
  canvas.addEventListener(
    'touchend',
    (e) => {
      touchStart = null;
    },
    { passive: true }
  );
  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (!touchStart) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.clientX;
      const dy = t.clientY - touchStart.clientY;
      keys['ArrowRight'] = dx > 10;
      keys['ArrowLeft'] = dx < -10;
      keys['ArrowDown'] = dy > 10;
      keys['ArrowUp'] = dy < -10;
    },
    { passive: true }
  );

  // === Visual Helpers & Particles ===
  function drawRoundedRect(x, y, w, h, r, fillStyle, strokeStyle) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    }
  }

  // Soft background with floating clouds and subtle grid
  const clouds = Array.from({ length: 6 }, (_, i) => ({
    x: rand(40, W - 40),
    y: rand(20, 140),
    scale: rand(0.6, 1.6),
    speed: rand(6, 18),
    phase: Math.random() * Math.PI * 2
  }));

  function drawBackground(ts) {
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, palette.skyTop);
    g.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // subtle energy grid (soft)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#7BDFF6';
    ctx.lineWidth = 1;
    for (let y = 40; y < H; y += 28) {
      ctx.beginPath();
      ctx.moveTo(20, y + Math.sin((ts + y) / 120) * 4);
      ctx.lineTo(W - 20, y - Math.cos((ts + y) / 120) * 4);
      ctx.stroke();
    }
    ctx.restore();

    // moving stylized clouds
    clouds.forEach((c) => {
      c.x += c.speed * 0.02;
      if (c.x - 120 > W) c.x = -120;
      const cx = c.x + Math.sin(ts / 1000 + c.phase) * 6;
      const cy = c.y + Math.cos(ts / 1200 + c.phase) * 4;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#FFFFFF';
      const s = 28 * c.scale;
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.5, cy, s * 0.9, s * 0.6, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.2, cy - 6, s * 0.8, s * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.6, cy + 6, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // left skyline silhouette
    ctx.save();
    ctx.fillStyle = 'rgba(5, 48, 80, 0.06)';
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, H - 80);
    ctx.lineTo(80, H - 120);
    ctx.lineTo(140, H - 60);
    ctx.lineTo(220, H - 100);
    ctx.lineTo(300, H - 40);
    ctx.lineTo(W, H - 120);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // draw a subtle trail behind spark, and sprite with pulsing
  function drawSpark(p, ts) {
    p.pulse = 0.5 + 0.5 * Math.sin(ts / 220);
    // trail particles alive near player
    for (let i = 0; i < 4; i++) {
      const t = {
        x: p.x - (i * 6 + 4),
        y: p.y + Math.sin(ts / 300 + i) * 2,
        r: p.r * 0.8 - i * 2
      };
      const glow = ctx.createRadialGradient(t.x, t.y, 1, t.x, t.y, t.r + 18);
      glow.addColorStop(0, 'rgba(255,245,200,0.35)');
      glow.addColorStop(1, 'rgba(255,210,90,0.02)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r + 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // main spark body with subtle lightning streak
    const glow2 = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r + 28);
    glow2.addColorStop(0, 'rgba(255,255,200,0.95)');
    glow2.addColorStop(0.6, 'rgba(255,220,110,0.22)');
    glow2.addColorStop(1, 'rgba(255,210,80,0.02)');
    ctx.fillStyle = glow2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 26, 0, Math.PI * 2);
    ctx.fill();

    // bright core
    ctx.beginPath();
    ctx.fillStyle = p.color;
    ctx.arc(p.x, p.y, p.r + Math.max(0, p.pulse * 2), 0, Math.PI * 2);
    ctx.fill();

    // lightning streaks (subtle)
    ctx.strokeStyle = 'rgba(255,235,150,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y - 2);
    ctx.lineTo(p.x + 4, p.y + 10);
    ctx.moveTo(p.x + 8, p.y - 6);
    ctx.lineTo(p.x - 4, p.y + 12);
    ctx.stroke();

    // face
    ctx.fillStyle = '#1F2937';
    ctx.beginPath();
    ctx.ellipse(p.x - 6, p.y - 4, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x + 6, p.y - 4, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOrb(orb, ts) {
    const fp = 6 * Math.sin(ts / 600 + orb.floatPhase);
    // glossy orb
    const grad = ctx.createLinearGradient(orb.x - orb.r, orb.y - orb.r + fp, orb.x + orb.r, orb.y + orb.r + fp);
    grad.addColorStop(0, '#FFF9D9');
    grad.addColorStop(0.6, '#FFE6A1');
    grad.addColorStop(1, '#FFD27A');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y + fp, orb.r, 0, Math.PI * 2);
    ctx.fill();

    // inner shine
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(orb.x - orb.r * 0.3, orb.y - orb.r * 0.4 + fp, orb.r * 0.5, orb.r * 0.35, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // rim
    ctx.strokeStyle = 'rgba(200,120,10,0.9)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // shadow below
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(orb.x, orb.y + fp + orb.r + 6, orb.r * 1.1, orb.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // number
    ctx.fillStyle = '#17202A';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(orb.value), orb.x, orb.y + fp);
  }

  function drawBulb(b, ts) {
    ctx.save();
    // animated connector 'current' flow (moving dashes)
    ctx.strokeStyle = '#6B7CFA';
    ctx.lineWidth = 5;
    ctx.beginPath();
    const offset = Math.sin(ts / 300 + b.target) * 6;
    ctx.moveTo(b.x - 84, b.y + offset);
    ctx.quadraticCurveTo(b.x - 48, b.y - 28, b.x - 22, b.y - 8);
    ctx.stroke();

    // glass bulb with animated glow if lit
    const g = ctx.createRadialGradient(b.x, b.y - 8, 4, b.x, b.y - 8, b.r + 26);
    if (b.lit) {
      const pulse = 0.8 + 0.2 * Math.sin(ts / 200 + b.glowPhase);
      g.addColorStop(0, `rgba(255,255,200,${0.95 * pulse})`);
      g.addColorStop(0.5, `rgba(255,230,110,${0.5 * pulse})`);
      g.addColorStop(1, `rgba(255,230,110,${0.06 * pulse})`);
    } else {
      g.addColorStop(0, 'rgba(235,245,255,0.95)');
      g.addColorStop(1, 'rgba(220,235,255,0.04)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - 8, b.r, b.r + 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // filament / socket
    ctx.fillStyle = '#B6C2E6';
    ctx.fillRect(b.x - 12, b.y + b.r - 6, 24, 12);
    ctx.strokeStyle = '#6C7390';
    ctx.strokeRect(b.x - 12, b.y + b.r - 6, 24, 12);

    // target number
    ctx.fillStyle = '#0B2743';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.target), b.x, b.y - 8);

    if (b.lit) {
      ctx.fillStyle = '#FFEAB8';
      ctx.font = '12px sans-serif';
      ctx.fillText('Lit!', b.x, b.y + b.r + 18);
    } else {
      ctx.fillStyle = '#0B2743';
      ctx.font = '12px sans-serif';
      ctx.fillText(`Tries: ${b.tries}`, b.x, b.y + b.r + 18);
    }
    ctx.restore();
  }

  function drawCharacters(ts) {
    // Wattson (left bottom) with gentle bob
    const wx = 48;
    const wy = H - 60 + Math.sin(ts / 400) * 2;
    ctx.save();
    // tail
    ctx.beginPath();
    ctx.fillStyle = '#F7C59F';
    ctx.ellipse(wx - 24, wy - 4, 24, 12, -0.6, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.fillStyle = '#FFD7A6';
    ctx.arc(wx, wy, 18, 0, Math.PI * 2);
    ctx.fill();
    // face dots
    ctx.fillStyle = '#2E2E2E';
    ctx.beginPath();
    ctx.ellipse(wx - 4, wy - 4, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(wx + 6, wy - 4, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2E2E2E';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${characters.wattson.name} the ${characters.wattson.role}`, wx + 36, wy - 6);
    ctx.restore();

    // Ampy (top-left) with small glow
    const ax = 80;
    const ay = 60 + Math.cos(ts / 700) * 2;
    ctx.save();
    const glow = ctx.createRadialGradient(ax, ay, 2, ax, ay, 40);
    glow.addColorStop(0, 'rgba(255,255,200,0.9)');
    glow.addColorStop(1, 'rgba(255,230,160,0.02)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ax, ay, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(ax - 6, ay + 6, 12, 8);
    ctx.fillStyle = '#2E2E2E';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${characters.ampy.name}`, ax + 44, ay - 4);
    ctx.restore();

    // Gearhead (bottom-right)
    const rx = W - 48;
    const ry = H - 60 + Math.sin(ts / 600) * 2;
    ctx.save();
    ctx.fillStyle = '#C7D3FF';
    drawRoundedRect(rx - 18, ry - 22, 36, 36, 6, '#C7D3FF', '#9AAED9');
    ctx.fillStyle = '#2E2E2E';
    ctx.fillRect(rx - 10, ry - 10, 6, 6);
    ctx.fillRect(rx + 4, ry - 10, 6, 6);
    ctx.fillStyle = '#2E2E2E';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${characters.gearhead.name}`, rx - 42, ry + 10);
    ctx.restore();
  }

  // particles update & draw
  function updateAndDrawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      // movement
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt + 10 * dt * (p.size || 1);
      // draw
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / 1.2);
      ctx.fillStyle = p.color || '#FFF9D9';
      ctx.beginPath();
      const s = (p.size || 2) * Math.max(0.6, p.life * 2);
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // === Update & Render (game loop) ===
  function update(dt) {
    if (state !== 'playing') return;

    // movement input
    let dirX = 0;
    let dirY = 0;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) dirX -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dirX += 1;
    if (keys['ArrowUp'] || keys['w'] || keys['W']) dirY -= 1;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) dirY += 1;

    if (dirX !== 0 || dirY !== 0) {
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      dirX /= len;
      dirY /= len;
    }

    player.vx = dirX * player.speed;
    player.vy = dirY * player.speed;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.x = clamp(player.x, 40, W - 140);
    player.y = clamp(player.y, 40, H - 40);

    // orb collisions (preserved)
    orbs.forEach((orb) => {
      if (orb.collected) return;
      const dx = player.x - orb.x;
      const dy = player.y - orb.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < player.r + orb.r - 2) {
        collectOrb(orb);
      }
    });

    // bulb collisions
    bulbs.forEach((b) => {
      const dx = player.x - b.x;
      const dy = player.y - (b.y - 8);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < player.r + b.r - 6 && !b.lit) {
        deliverToBulb(b);
      }
    });

    // float phases
    orbs.forEach((o) => {
      o.floatPhase += dt * 2;
    });

    // cleanup collected orbs (visual)
    orbs = orbs.filter((o) => !o.collected || o.collected === false);

    // particles drift
    particles.forEach((p) => {
      // minor decay applied in draw routine
    });
  }

  function render(ts = performance.now()) {
    try {
      // background / sky
      drawBackground(ts);

      // soft play panel
      drawRoundedRect(16, 16, W - 32, H - 32, 12, palette.park, '#DDEBFF');

      // top title area
      ctx.fillStyle = palette.text;
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Spark City — Help Wattson deliver exact energy!', 24, 40);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#345';
      ctx.fillText('Collect number charges and bring the exact total to each bulb to light it.', 24, 60);

      // characters
      drawCharacters(ts);

      // bulbs
      bulbs.forEach((b) => drawBulb(b, ts));

      // orbs
      orbs.forEach((o) => {
        if (!o.collected) drawOrb(o, ts);
      });

      // decorative zigzag resistor
      ctx.save();
      ctx.strokeStyle = '#C390FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const startX = 140;
      const startY = H - 40;
      ctx.moveTo(startX, startY);
      for (let i = 0; i < 8; i++) {
        const x = startX + i * 22;
        const y = startY + (i % 2 === 0 ? -12 : 12);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // draw collected badges above player
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#123';
      ctx.fillText('Charge:', player.x - 26, player.y + 40);
      let offset = 0;
      player.collected.forEach((v) => {
        ctx.fillStyle = '#FFF1B6';
        ctx.beginPath();
        ctx.arc(player.x + offset - 12, player.y + 40, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#EAB308';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#2E2E2E';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(v), player.x + offset - 12, player.y + 40);
        offset += 28;
      });

      // spark
      drawSpark(player, ts);

      // HUD - right side compact card
      ctx.save();
      const cardW = 180;
      const cardX = W - cardW - 20;
      const cardY = 28;
      drawRoundedRect(cardX, cardY, cardW, 90, 8, 'rgba(255,255,255,0.9)', 'rgba(200,210,230,0.6)');
      ctx.fillStyle = '#083344';
      ctx.textAlign = 'left';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`Level ${level}`, cardX + 12, cardY + 22);
      ctx.font = '13px sans-serif';
      ctx.fillText(`Score ${score}`, cardX + 12, cardY + 44);
      // lives hearts
      ctx.fillStyle = '#FF6B6B';
      for (let i = 0; i < lives; i++) {
        const hx = cardX + 12 + i * 20;
        const hy = cardY + 62;
        drawHeart(hx, hy, 8);
      }
      ctx.restore();

      // audio icon
      ctx.save();
      ctx.translate(W - 48, 120);
      ctx.fillStyle = audioEnabled && audioAllowed ? '#FFD4A3' : '#CCC';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(audioEnabled ? '🔊' : '🔈', 0, 0);
      ctx.restore();

      // bottom instructions
      ctx.fillStyle = '#0B2545';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        'Controls: Arrow keys or WASD to move. Touch drag on mobile. Press M to mute/unmute. Collect numbers and touch a bulb to deliver.',
        24,
        H - 18
      );

      // overlay states (start / levelComplete / gameover)
      if (state === 'start') {
        ctx.fillStyle = 'rgba(8, 20, 40, 0.6)';
        ctx.fillRect(80, 100, W - 160, 240);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Spark City', W / 2, 160);
        ctx.font = '16px sans-serif';
        ctx.fillText('Wattson needs help delivering exact charges to the bulbs!', W / 2, 200);
        ctx.font = '14px sans-serif';
        ctx.fillText('Collect numbers (1–9) and bring the exact total to light each bulb.', W / 2, 232);
        // start button
        drawRoundedRect(W / 2 - 74, 260, 148, 42, 10, '#FFD166', '#F0A500');
        ctx.fillStyle = '#123';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('Start Game', W / 2, 286);
      } else if (state === 'levelComplete') {
        ctx.fillStyle = 'rgba(10, 80, 60, 0.65)';
        ctx.fillRect(120, 120, W - 240, H - 240);
        ctx.fillStyle = '#E6FFFA';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Great job! Level complete!', W / 2, H / 2 - 12);
        ctx.font = '16px sans-serif';
        ctx.fillText('Press Enter to continue to the next exciting circuit!', W / 2, H / 2 + 18);
      } else if (state === 'gameover') {
        ctx.fillStyle = 'rgba(80, 10, 10, 0.6)';
        ctx.fillRect(120, 120, W - 240, H - 240);
        ctx.fillStyle = '#FFF2F2';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Oh no — the city is out of spark!', W / 2, H / 2 - 8);
        ctx.font = '16px sans-serif';
        ctx.fillText('Press Enter to try again.', W / 2, H / 2 + 20);
      }

      // bottom left hint line
      ctx.fillStyle = '#0B2545';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Bulb targets: ${bulbs.map((b) => b.target).join(', ')}`, 24, 92);

      // draw and update particles last (so they appear above)
      updateAndDrawParticles(1 / 60);
    } catch (e) {
      console.error('Render error', e);
    }
  }

  // small heart drawing helper for lives
  function drawHeart(x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - size, x - size, y - size, x - size, y);
    ctx.bezierCurveTo(x - size, y + size, x, y + size * 1.4, x, y + size * 1.8);
    ctx.bezierCurveTo(x, y + size * 1.4, x + size, y + size, x + size, y);
    ctx.bezierCurveTo(x + size, y - size, x, y - size, x, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // === Main Loop ===
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.06, (ts - lastTs) / 1000);
    lastTs = ts;

    try {
      update(dt);
      render(ts);
    } catch (e) {
      console.error('Error during game update/render:', e);
      announce('An error occurred. Please reload the page to try again.');
      running = false;
    }

    if (running) requestAnimationFrame(loop);
  }

  // === Initialization ===
  function start() {
    try {
      initAudio();
    } catch (e) {
      console.warn('Audio init failed', e);
    }
    render();
    announce(
      'Welcome to Spark City! Press Enter or click to start. Use arrow keys to move. Press M to mute or unmute audio.'
    );
    lastTs = null;
    requestAnimationFrame(loop);
  }

  setTimeout(start, 250);

  // Expose minimal debug API
  window.sparkCity = {
    restart: () => {
      level = 1;
      score = 0;
      lives = 3;
      state = 'start';
      player.collected = [];
      orbs = [];
      bulbs = [];
      particles = [];
      lastTs = null;
      announce('Game reset. Press Enter to start.');
    },
    mute: (v) => {
      audioEnabled = !(v === false);
    }
  };

  window.addEventListener('unhandledrejection', (ev) => {
    console.warn('Unhandled promise rejection:', ev.reason);
  });
})();