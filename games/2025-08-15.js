(function () {
  'use strict';

  // Game for ages 7-9: "Spark & the Electric Sum"
  // Renders into element with ID 'game-of-the-day-stage'
  // Canvas 720x480. All graphics drawn via canvas methods.
  // Audio via Web Audio API (oscillators only). Includes error handling and accessibility.

  // -------------------------
  // Utility functions
  // -------------------------
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // -------------------------
  // Setup stage and canvas
  // -------------------------
  const stage = document.getElementById('game-of-the-day-stage');
  if (!stage) {
    console.error('Element with ID "game-of-the-day-stage" not found. Creating one automatically.');
    const fallback = document.createElement('div');
    fallback.id = 'game-of-the-day-stage';
    document.body.appendChild(fallback);
  }
  // Clear stage content
  stage.innerHTML = '';
  stage.style.outline = 'none';

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.tabIndex = 0; // make focusable
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Spark and the Electric Sum: use arrow keys to move Spark, space to collect electrons, click to drag electrons. Toggle sound with S. Press Enter to submit collected charge. Instructions are shown on screen.'
  );
  canvas.style.display = 'block';
  canvas.style.margin = '0';
  stage.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // -------------------------
  // Audio setup with error handling
  // -------------------------
  let audioCtx = null;
  let audioAvailable = true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio API not supported');
    audioCtx = new AudioContext();
  } catch (e) {
    console.warn('Audio context could not be created:', e);
    audioAvailable = false;
  }

  // Background hum nodes
  let bgNodes = null;
  let audioOn = true; // user-controlled toggle

  function safeResumeAudio() {
    if (!audioAvailable || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('Audio resume failed', e);
      });
    }
  }

  // General-purpose playTone using oscillators
  function playTone({ freq = 440, duration = 0.3, type = 'sine', volume = 0.12, detune = 0, filterFreq = null }) {
    if (!audioAvailable || !audioOn || !audioCtx) return Promise.resolve();
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      let nodeChainOut = g;
      if (filterFreq) {
        const f = audioCtx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filterFreq;
        o.connect(f);
        f.connect(g);
      } else {
        o.connect(g);
      }
      g.gain.value = 0;
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      // quick attack, gentle release
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(volume, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      o.start(now);
      o.stop(now + duration + 0.02);
      return Promise.resolve();
    } catch (err) {
      console.warn('playTone failed', err);
      return Promise.resolve();
    }
  }

  // Improved background pad: two oscillators with slow LFO modulating a filter for a gentle ambient bed
  function startBackgroundHum() {
    if (!audioAvailable || !audioOn || !audioCtx) return;
    try {
      stopBackgroundHum(); // clear existing
      const master = audioCtx.createGain();
      master.gain.value = 0.02; // very low; gentle
      master.connect(audioCtx.destination);

      // pad oscillator 1 (sine)
      const pad1 = audioCtx.createOscillator();
      pad1.type = 'sine';
      pad1.frequency.value = 80; // low
      // pad oscillator 2 (triangle) detuned
      const pad2 = audioCtx.createOscillator();
      pad2.type = 'triangle';
      pad2.frequency.value = 110;

      // shared filter to warm the sound
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 0.8;

      // subtle amplitude LFO for movement
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.009;

      // connect chain
      pad1.connect(lp);
      pad2.connect(lp);
      lp.connect(master);

      lfo.connect(lfoGain);
      lfoGain.connect(master.gain); // modulate master gain slightly

      pad1.start();
      pad2.start();
      lfo.start();

      bgNodes = { pad1, pad2, lp, lfo, lfoGain, master };
    } catch (e) {
      console.warn('startBackgroundHum failed', e);
      bgNodes = null;
    }
  }

  function stopBackgroundHum() {
    try {
      if (!bgNodes) return;
      const nodes = bgNodes;
      nodes.pad1 && nodes.pad1.stop && nodes.pad1.stop();
      nodes.pad2 && nodes.pad2.stop && nodes.pad2.stop();
      nodes.lfo && nodes.lfo.stop && nodes.lfo.stop();
      // disconnect and null out
      for (const k in nodes) {
        if (nodes[k] && typeof nodes[k].disconnect === 'function') {
          try {
            nodes[k].disconnect();
          } catch (e) {
            // ignore
          }
        }
      }
      bgNodes = null;
    } catch (e) {
      // ignore
      console.warn('stopBackgroundHum error', e);
    }
  }

  // Pleasant pickup sound: dual-oscillator pluck with short pitch slide
  function playPickupPluck() {
    if (!audioAvailable || !audioOn || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o1 = audioCtx.createOscillator();
      const o2 = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();

      o1.type = 'triangle';
      o1.frequency.setValueAtTime(880, now);
      o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(660, now);

      // slight pitch slide down for pluck
      o1.frequency.exponentialRampToValueAtTime(740, now + 0.09);
      o2.frequency.exponentialRampToValueAtTime(520, now + 0.12);

      f.type = 'lowpass';
      f.frequency.value = 1200;

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      o1.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);

      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.18);
      o2.stop(now + 0.18);
    } catch (e) {
      console.warn('playPickupPluck failed', e);
    }
  }

  // Warm correct chord: three oscillators with small detune and filter envelope
  function playCorrectChord() {
    if (!audioAvailable || !audioOn || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      const master = audioCtx.createGain();
      master.gain.value = 0.001;
      master.connect(audioCtx.destination);

      // filter for warmth
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1200;
      f.Q.value = 0.7;
      f.connect(master);

      freqs.forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = freq * (1 + (i === 2 ? 0.005 : -0.003));
        const g = audioCtx.createGain();
        g.gain.value = 0.001;
        o.connect(g);
        g.connect(f);
        // staggered attack (arpeggio)
        const t = now + i * 0.05;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.start(t);
        o.stop(t + 0.6);
      });
      // also a subtle sparkle
      master.gain.linearRampToValueAtTime(0.02, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    } catch (e) {
      console.warn('playCorrectChord failed', e);
    }
  }

  // Soft wrong buzz: low thud + short high 'pop' filtered
  function playWrongBuzz() {
    if (!audioAvailable || !audioOn || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;

      // low thud
      const oLow = audioCtx.createOscillator();
      const gLow = audioCtx.createGain();
      const fLow = audioCtx.createBiquadFilter();
      oLow.type = 'sine';
      oLow.frequency.value = 100;
      fLow.type = 'lowpass';
      fLow.frequency.value = 240;
      oLow.connect(fLow);
      fLow.connect(gLow);
      gLow.gain.setValueAtTime(0.001, now);
      gLow.gain.linearRampToValueAtTime(0.12, now + 0.01);
      gLow.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      oLow.start(now);
      oLow.stop(now + 0.28);

      // small high pop
      const oHigh = audioCtx.createOscillator();
      const gHigh = audioCtx.createGain();
      const fHigh = audioCtx.createBiquadFilter();
      oHigh.type = 'square';
      oHigh.frequency.value = 900;
      fHigh.type = 'highpass';
      fHigh.frequency.value = 600;
      oHigh.connect(fHigh);
      fHigh.connect(gHigh);
      gHigh.gain.setValueAtTime(0.001, now + 0.02);
      gHigh.gain.linearRampToValueAtTime(0.06, now + 0.03);
      gHigh.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      oHigh.start(now + 0.02);
      oHigh.stop(now + 0.18);
    } catch (e) {
      console.warn('playWrongBuzz failed', e);
    }
  }

  // -------------------------
  // Game constants and state
  // -------------------------
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  const PANEL_X = 540;
  const PANEL_Y = 120;
  const PANEL_W = 150;
  const PANEL_H = 180;

  const BULB_X = PANEL_X + PANEL_W / 2;
  const BULB_Y = PANEL_Y + PANEL_H + 70;

  let lastTime = 0;
  let running = false;
  let showInstructions = true;
  let level = 1;
  let score = 0;
  let targetCharge = 8;
  let currentCharge = 0;
  let electrons = [];
  let messages = []; // temporary messages
  let glowTime = 0; // visual cue when sound plays
  let controlsActive = true;

  // Spark (player)
  const spark = {
    x: 140,
    y: HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: 32,
    color: '#FFD66B',
    speed: 240, // px per second
    blinkT: 0
  };

  // Background particles for subtle parallax
  const bgParticles = [];
  for (let i = 0; i < 24; i++) {
    bgParticles.push({
      x: rand(0, WIDTH),
      y: rand(0, HEIGHT),
      r: rand(2, 6),
      alpha: rand(0.04, 0.16),
      vx: rand(-6, 6),
      vy: rand(-3, 3),
      phase: rand(0, Math.PI * 2)
    });
  }

  // Spark trail
  const sparkTrail = [];

  // Input state
  const keys = {};
  let mouse = { x: 0, y: 0, down: false, dragElectron: null };

  // -------------------------
  // Game functions
  // -------------------------
  function resetLevel() {
    currentCharge = 0;
    electrons = [];
    messages = [];
    glowTime = 0;
    // targetCharge increases with level but remains reasonable for age 7-9
    targetCharge = Math.min(20, 5 + Math.floor(level * 1.7));
    // spawn electrons - ensure there are numbers such that sums can reach target
    const count = 6 + Math.min(4, level);
    for (let i = 0; i < count; i++) {
      const v = generateElectronValue(i);
      const e = {
        id: Math.random().toString(36).slice(2),
        x: rand(220, 480),
        y: rand(60, HEIGHT - 80),
        r: 22,
        vx: rand(-30, 30),
        vy: rand(-20, 20),
        value: v,
        grabbed: false,
        beingSent: false,
        sendT: 0,
        pulse: rand(0, Math.PI * 2)
      };
      electrons.push(e);
    }
    if (targetCharge <= 9 && !electrons.some(e => e.value === targetCharge)) {
      electrons.push({
        id: 'guarantee',
        x: rand(260, 400),
        y: rand(80, HEIGHT - 100),
        r: 22,
        vx: 0,
        vy: 0,
        value: targetCharge,
        grabbed: false,
        beingSent: false,
        sendT: 0,
        pulse: rand(0, Math.PI * 2)
      });
    }

    // Provide gentle audio cue
    if (audioAvailable && audioOn) {
      playTone({ freq: 300 + targetCharge * 8, duration: 0.18, type: 'sine', volume: 0.05, filterFreq: 1200 });
    }
  }

  function generateElectronValue(i) {
    // unchanged logic
    const base = Math.random();
    if (base < 0.5) return Math.floor(rand(1, 5)); // 1-4
    if (base < 0.85) return Math.floor(rand(4, 8)); // 4-7
    return Math.floor(rand(7, 10)); // 7-9
  }

  function addMessage(text, duration = 1600) {
    messages.push({ text, t: duration });
  }

  function collectNearestElectron() {
    let nearest = null;
    let nd = Infinity;
    for (const e of electrons) {
      if (e.beingSent) continue;
      const dx = e.x - spark.x;
      const dy = e.y - spark.y;
      const d = Math.hypot(dx, dy);
      if (d < nd) {
        nd = d;
        nearest = e;
      }
    }
    if (nearest && nd <= 90) {
      pickUpElectron(nearest);
    } else {
      addMessage('Too far! Move closer to collect electrons.');
      playWrongBuzz();
      glowTime = 0.18;
    }
  }

  function pickUpElectron(e) {
    if (e.grabbed || e.beingSent) return;
    e.grabbed = true;
    e.vx = e.vx * 0.3;
    e.vy = e.vy * 0.3;
    if (audioAvailable && audioOn) playPickupPluck();
    addMessage('Electron ' + e.value + ' collected!');
    glowTime = 0.14;
  }

  function submitCharge() {
    if (currentCharge === targetCharge) {
      addMessage('Perfect! Bulb lit! +1 level');
      score += 10 * level;
      level++;
      glowTime = 0.8;
      if (audioAvailable && audioOn) playCorrectChord();
      resetLevel();
    } else if (currentCharge < targetCharge) {
      addMessage('Not enough charge. Try adding more electrons.');
      if (audioAvailable && audioOn) {
        playTone({ freq: 260, duration: 0.18, type: 'sine', volume: 0.08 });
      }
      glowTime = 0.18;
    } else {
      addMessage('Oh no, you overloaded the bulb! It popped! -1 level');
      score = Math.max(0, score - 5);
      level = Math.max(1, level - 1);
      if (audioAvailable && audioOn) playWrongBuzz();
      resetLevel();
      glowTime = 0.5;
    }
  }

  function sendElectronToPanel(e) {
    e.beingSent = true;
    e.sendStart = { x: e.x, y: e.y };
    e.sendT = 0;
    if (audioAvailable && audioOn) {
      // quick whoosh
      playTone({ freq: 880 - e.value * 20, duration: 0.12, type: 'triangle', volume: 0.05, filterFreq: 1600 });
    }
  }

  // -------------------------
  // Drawing functions
  // -------------------------
  function drawBackground(time) {
    // animated gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    const t = (performance.now() / 8000) % 1;
    g.addColorStop(0, '#eaf9ff');
    g.addColorStop(0.5, lerpColor('#f0fff6', '#eaf9ff', Math.abs(Math.sin(performance.now() / 4000))));
    g.addColorStop(1, '#f7fff7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft wavy bands to suggest energy flows
    ctx.save();
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.04 + i * 0.01;
      ctx.fillStyle = i % 2 === 0 ? '#baf7ff' : '#bfffe4';
      ctx.beginPath();
      const y = 60 + i * 90 + Math.sin(performance.now() / 1200 + i) * 8;
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(WIDTH / 4, y - 20 + Math.cos(performance.now() / 1000 + i) * 8, WIDTH / 2, y);
      ctx.quadraticCurveTo((3 * WIDTH) / 4, y + 18 + Math.sin(performance.now() / 800 + i) * 8, WIDTH, y - 6);
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.lineTo(0, HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // subtle floating particles
    ctx.save();
    for (const p of bgParticles) {
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.phase += 0.02;
      if (p.x < -20) p.x = WIDTH + 20;
      if (p.x > WIDTH + 20) p.x = -20;
      if (p.y < -20) p.y = HEIGHT + 20;
      if (p.y > HEIGHT + 20) p.y = -20;
      ctx.beginPath();
      ctx.globalAlpha = p.alpha + Math.sin(p.phase) * 0.02;
      ctx.fillStyle = '#ffffff';
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // left decorative panel for character zone
    ctx.save();
    const leftGrad = ctx.createLinearGradient(0, 0, 140, 0);
    leftGrad.addColorStop(0, 'rgba(255,255,255,0.02)');
    leftGrad.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = leftGrad;
    roundRect(ctx, 12, 80, 220, HEIGHT - 150, 12);
    ctx.fill();
    ctx.restore();
  }

  // small helper to interpolate colors (expects hex like #RRGGBB)
  function lerpColor(a, b, t) {
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    const r = Math.round(lerp(pa.r, pb.r, t));
    const g = Math.round(lerp(pa.g, pb.g, t));
    const bl = Math.round(lerp(pa.b, pb.b, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return { r, g, b };
  }

  function drawPanel() {
    // Power panel on the right - refreshed look with glowing edges
    ctx.save();
    // panel background with subtle noise rectangle
    const panelGrad = ctx.createLinearGradient(PANEL_X, PANEL_Y, PANEL_X + PANEL_W, PANEL_Y + PANEL_H);
    panelGrad.addColorStop(0, '#213243');
    panelGrad.addColorStop(1, '#18262f');
    ctx.fillStyle = panelGrad;
    roundRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    ctx.fill();

    // inner bevel
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 2;
    roundRect(ctx, PANEL_X + 4, PANEL_Y + 4, PANEL_W - 8, PANEL_H - 8, 10);
    ctx.stroke();

    // label
    ctx.fillStyle = '#dffcf0';
    ctx.font = '700 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Power Panel', PANEL_X + PANEL_W / 2, PANEL_Y + 22);

    // target display (digital-style)
    ctx.fillStyle = '#06ffd9';
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.fillText('Need: ' + targetCharge, PANEL_X + PANEL_W / 2, PANEL_Y + 60);

    // current charge gauge background
    ctx.save();
    ctx.translate(PANEL_X + 18, PANEL_Y + 78);
    ctx.fillStyle = '#071011';
    roundRect(ctx, 0, 0, PANEL_W - 36, 26, 8);
    ctx.fill();

    const pct = clamp(currentCharge / Math.max(targetCharge, 1), 0, 1);
    // dynamic color gradient
    const gaugeGrad = ctx.createLinearGradient(0, 0, PANEL_W - 36, 0);
    gaugeGrad.addColorStop(0, '#00ff9e');
    gaugeGrad.addColorStop(0.6, '#7cffb8');
    gaugeGrad.addColorStop(1, '#cfff8f');
    ctx.fillStyle = gaugeGrad;
    roundRect(ctx, 0, 0, (PANEL_W - 36) * pct, 26, 8);
    ctx.fill();

    // dotted sparkles on gauge
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 6; i++) {
      const px = (PANEL_W - 36) * (i / 6);
      ctx.fillRect(px, 4, 2, 18);
    }
    ctx.restore();

    // gauge text
    ctx.fillStyle = '#e9fff6';
    ctx.font = '700 14px sans-serif';
    ctx.fillText('Charge: ' + currentCharge, PANEL_X + PANEL_W / 2, PANEL_Y + 102);

    ctx.restore();
  }

  function drawBulb() {
    // bulb character with friendly animation
    ctx.save();
    // base wires with animated shimmer
    ctx.strokeStyle = '#bfffe4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(BULB_X - 48, BULB_Y + 36);
    ctx.lineTo(BULB_X - 10, BULB_Y + 36);
    ctx.moveTo(BULB_X + 48, BULB_Y + 36);
    ctx.lineTo(BULB_X + 10, BULB_Y + 36);
    ctx.stroke();

    const lit = currentCharge >= targetCharge && currentCharge === targetCharge;
    const bulbGlow = glowTime > 0 ? Math.min(1, glowTime * 1.8) : (lit ? 1 : 0);

    // animated halo
    if (bulbGlow > 0) {
      ctx.beginPath();
      const rg = ctx.createRadialGradient(BULB_X, BULB_Y - 10, 8, BULB_X, BULB_Y - 10, 160);
      rg.addColorStop(0, `rgba(255,230,120,${0.85 * bulbGlow})`);
      rg.addColorStop(1, `rgba(255,230,120,0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(BULB_X - 160, BULB_Y - 160, 320, 320);
    }

    // bulb glass with internal subtle waves
    ctx.beginPath();
    const bulbOffset = Math.sin(performance.now() / 300) * 1.4;
    ctx.fillStyle = lit ? '#fff9d6' : '#ffffff';
    ctx.strokeStyle = '#c9dbe6';
    ctx.lineWidth = 2;
    ctx.ellipse(BULB_X, BULB_Y - 10 + bulbOffset, 36, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // internal shimmer lines
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff6b3';
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(BULB_X - 10 + i * 6, BULB_Y - 35);
      ctx.quadraticCurveTo(BULB_X + i * 12, BULB_Y - 6, BULB_X - 10 + i * 6, BULB_Y + 10);
      ctx.stroke();
    }
    ctx.restore();

    // friendly face that brightens when lit
    ctx.fillStyle = '#333';
    ctx.globalAlpha = lit ? 1 : 0.9;
    ctx.beginPath();
    ctx.arc(BULB_X - 9, BULB_Y - 18, 4, 0, Math.PI * 2); // left eye
    ctx.fill();
    ctx.beginPath();
    ctx.arc(BULB_X + 9, BULB_Y - 18, 4, 0, Math.PI * 2); // right eye
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#3b3b3b';
    ctx.lineWidth = 2;
    ctx.moveTo(BULB_X - 8, BULB_Y - 6);
    ctx.quadraticCurveTo(BULB_X, BULB_Y + (lit ? 6 : 2), BULB_X + 8, BULB_Y - 6);
    ctx.stroke();

    // base
    ctx.fillStyle = '#4f5566';
    roundRect(ctx, BULB_X - 20, BULB_Y + 18, 40, 24, 6);
    ctx.fill();

    // when bulb is overcharged show slight flicker ring
    if (currentCharge > targetCharge) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = 'rgba(255,120,120,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(BULB_X, BULB_Y - 8, 52 + Math.random() * 6, 66 + Math.random() * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawSpark(dt) {
    ctx.save();

    // add to trail
    sparkTrail.push({ x: spark.x, y: spark.y, t: 0.8 });
    if (sparkTrail.length > 18) sparkTrail.shift();
    // draw trail
    for (let i = 0; i < sparkTrail.length; i++) {
      const p = sparkTrail[i];
      p.t -= 0.02;
      ctx.beginPath();
      const alpha = p.t * (i / sparkTrail.length) * 0.6;
      ctx.fillStyle = `rgba(255,214,107,${clamp(alpha, 0, 0.6)})`;
      ctx.ellipse(p.x, p.y + 2, lerp(6, 20, i / sparkTrail.length), lerp(3, 8, i / sparkTrail.length), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.ellipse(spark.x, spark.y + 38, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // body - warm gradient
    const bodyGrad = ctx.createLinearGradient(spark.x - 32, spark.y - 40, spark.x + 32, spark.y + 20);
    bodyGrad.addColorStop(0, '#ffd66b');
    bodyGrad.addColorStop(1, '#ffb86b');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#d08f2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(spark.x, spark.y - 6, spark.radius, spark.radius + 6, Math.sin(performance.now() / 400) * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // eyes with blink animation
    spark.blinkT += dt ? dt : 0.016;
    const blink = Math.abs(Math.sin(spark.blinkT * 1.6)) < 0.06 ? 0.6 : 1;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(spark.x - 10, spark.y - 14, 5, 5 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(spark.x + 10, spark.y - 14, 5, 5 * blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // mouth (smile)
    ctx.beginPath();
    ctx.strokeStyle = '#3b3b3b';
    ctx.lineWidth = 2;
    ctx.arc(spark.x, spark.y - 2, 8, 0, Math.PI);
    ctx.stroke();

    // magnet prongs
    ctx.fillStyle = '#ff7b7b';
    ctx.fillRect(spark.x - 30, spark.y + 14, 12, 10);
    ctx.fillRect(spark.x + 18, spark.y + 14, 12, 10);
    ctx.strokeStyle = '#b24b4b';
    ctx.strokeRect(spark.x - 30, spark.y + 14, 12, 10);
    ctx.strokeRect(spark.x + 18, spark.y + 14, 12, 10);

    // range indicator when focused (soft)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.ellipse(spark.x, spark.y + 6, 90, 90, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawElectron(e) {
    ctx.save();

    // pulsing radius
    e.pulse = (e.pulse || 0) + 0.08;
    const pulseScale = 1 + Math.sin(e.pulse) * 0.04;

    // glow when high value or grabbed
    const glow = e.grabbed ? 0.6 : (e.value >= 7 ? 0.25 : 0.06);

    // body gradient
    const g = ctx.createRadialGradient(e.x - 6, e.y - 6, 4, e.x + 6, e.y + 6, e.r * 1.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.2, '#a0ffee');
    g.addColorStop(1, '#72d1ff');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * pulseScale, 0, Math.PI * 2);
    ctx.fill();

    // outer ring
    ctx.beginPath();
    ctx.strokeStyle = `rgba(45,148,182,${0.9})`;
    ctx.lineWidth = 2;
    ctx.arc(e.x, e.y, e.r * pulseScale, 0, Math.PI * 2);
    ctx.stroke();

    // soft glow
    if (glow > 0) {
      ctx.beginPath();
      const rg = ctx.createRadialGradient(e.x, e.y, e.r * 0.4, e.x, e.y, e.r * 3);
      rg.addColorStop(0, `rgba(160,255,238,${0.12 * glow})`);
      rg.addColorStop(1, `rgba(160,255,238,0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(e.x - e.r * 3, e.y - e.r * 3, e.r * 6, e.r * 6);
    }

    // number
    ctx.fillStyle = '#073042';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(e.value), e.x, e.y + 1);

    // small sparkle tail
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.moveTo(e.x - e.r + 2, e.y - e.r + 2);
    ctx.lineTo(e.x - e.r - 10, e.y - e.r - 10);
    ctx.stroke();

    // highlight when grabbed
    if (e.grabbed) {
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6;
      ctx.arc(e.x, e.y, e.r * 1.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawUI() {
    // top bar with modern chip look
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, 8, 8, WIDTH - 16, 48, 12);
    ctx.fill();

    ctx.fillStyle = '#073042';
    ctx.font = '700 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score, 20, 34);
    ctx.fillText('Level: ' + level, 140, 34);

    // instructions toggle text
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#01303a';
    ctx.fillText(showInstructions ? 'Press H to hide help' : 'Press H to show help', 220, 34);

    // sound icon
    const sx = WIDTH - 80;
    const sy = 18;
    ctx.save();
    ctx.translate(sx, sy);
    // speaker body
    ctx.fillStyle = audioOn ? '#ffdd57' : '#c4c4c4';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(12, 6);
    ctx.lineTo(22, 0);
    ctx.lineTo(22, 36);
    ctx.lineTo(12, 30);
    ctx.lineTo(0, 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6c4f18';
    ctx.stroke();

    // little waves if on
    if (audioOn) {
      ctx.strokeStyle = '#ffed9a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(28, 18, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(34, 18, 12, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = '#01303a';
    ctx.textAlign = 'center';
    ctx.font = '12px sans-serif';
    ctx.fillText(audioOn ? 'Sound On (S)' : 'Muted (S)', sx + 11, sy + 46);

    // instructions summary (if enabled)
    if (showInstructions) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      roundRect(ctx, 16, 66, 380, 120, 10);
      ctx.fillStyle = '#01303a';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      wrapText(
        ctx,
        'Goal: Collect electrons (numbers) to match the panel target charge exactly. Move Spark with arrow keys or mouse. Press SPACE to collect nearest electron, drag electrons with the mouse, press ENTER to submit your charge.',
        24,
        86,
        360,
        18
      );
      ctx.fillStyle = '#015a4a';
      ctx.font = '700 13px sans-serif';
      ctx.fillText('Controls: Arrows = move, Space = collect, Click/Drag = move electron, Enter = submit', 24, 160);
    }

    ctx.restore();
  }

  // Helper: rounded rect
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Helper: wrap text
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }

  // -------------------------
  // Game update loop
  // -------------------------
  function update(dt) {
    // update background particles drift
    for (const p of bgParticles) {
      p.x += p.vx * dt * 10;
      p.y += p.vy * dt * 10;
      p.phase += dt;
    }

    // update spark from keys
    let moveX = 0;
    let moveY = 0;
    if (keys['ArrowLeft']) moveX -= 1;
    if (keys['ArrowRight']) moveX += 1;
    if (keys['ArrowUp']) moveY -= 1;
    if (keys['ArrowDown']) moveY += 1;
    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY) || 1;
      spark.x += (moveX / len) * spark.speed * dt;
      spark.y += (moveY / len) * spark.speed * dt;
    }
    // mouse movement when dragging spark: if focused and mouse down but not dragging electron, spark follows
    if (mouse.down && !mouse.dragElectron) {
      // smooth follow
      spark.x += (mouse.x - spark.x) * 8 * dt;
      spark.y += (mouse.y - spark.y) * 8 * dt;
    }

    // clamp spark within left half to encourage movement
    spark.x = clamp(spark.x, 60, WIDTH - 220);
    spark.y = clamp(spark.y, 60, HEIGHT - 60);

    // update electrons
    for (const e of electrons) {
      if (e.beingSent) {
        // animate along curve to panel center
        e.sendT += dt * 1.6;
        const t = clamp(e.sendT, 0, 1);
        const sx = e.sendStart.x;
        const sy = e.sendStart.y;
        // simple quadratic curve to BULB position
        // keep deterministic-ish curvature for better visuals (avoid rand in path to keep consistent)
        const cx = (sx + BULB_X) / 2 + Math.sin(e.id.length + e.value) * 24;
        const cy = Math.min(sy, BULB_Y) - 60;
        // Quadratic Bezier interpolation
        e.x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * BULB_X;
        e.y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * BULB_Y;
        e.r = 20 * (1 - 0.2 * t);
        if (t >= 1) {
          // reached panel - add value
          currentCharge += e.value;
          // remove electron
          e.toRemove = true;
          if (audioAvailable && audioOn) {
            playTone({ freq: 520 + e.value * 16, duration: 0.14, type: 'sine', volume: 0.06 });
          }
        }
      } else if (e.grabbed) {
        // follow spark
        e.x += (spark.x + 18 - e.x) * 12 * dt;
        e.y += (spark.y - 8 - e.y) * 12 * dt;
        // if close to panel area, send to panel
        const dx = e.x - (PANEL_X + PANEL_W / 2);
        const dy = e.y - (PANEL_Y + PANEL_H / 2);
        if (Math.hypot(dx, dy) < 54) {
          sendElectronToPanel(e);
          e.grabbed = false;
        }
      } else if (mouse.dragElectron && mouse.dragElectron.id === e.id) {
        // follow mouse coordinates when manual dragging
        e.x = mouse.x;
        e.y = mouse.y;
      } else {
        // free movement with slight flow toward middle to keep it lively
        e.x += (e.vx + Math.sin(performance.now() / 1000 + e.value) * 6) * dt;
        e.y += e.vy * dt;
        // bounce
        if (e.x < 60 || e.x > PANEL_X - 30) e.vx *= -1;
        if (e.y < 80 || e.y > HEIGHT - 80) e.vy *= -1;
      }
    }
    // remove electrons marked for removal
    electrons = electrons.filter(e => !e.toRemove);

    // messages decay
    for (const m of messages) {
      m.t -= dt * 1000;
    }
    messages = messages.filter(m => m.t > 0);

    // glowTime decay
    if (glowTime > 0) glowTime = Math.max(0, glowTime - dt);

    // Occasionally spawn a wandering electron to keep things playful
    if (Math.random() < dt * 0.2 && electrons.length < 10) {
      electrons.push({
        id: Math.random().toString(36).slice(2),
        x: rand(220, 440),
        y: rand(60, HEIGHT - 80),
        r: 20,
        vx: rand(-20, 20),
        vy: rand(-20, 20),
        value: Math.floor(rand(1, 9)),
        grabbed: false,
        beingSent: false,
        sendT: 0,
        pulse: rand(0, Math.PI * 2)
      });
    }
  }

  function render(ts) {
    const dt = lastTime ? Math.min(0.05, (ts - lastTime) / 1000) : 0.016;
    drawBackground(ts);
    drawPanel();
    drawBulb();

    // connector wires from panel to bulb with subtle glow
    ctx.save();
    ctx.strokeStyle = 'rgba(93,240,200,0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(PANEL_X + PANEL_W / 2 - 10, PANEL_Y + PANEL_H);
    ctx.quadraticCurveTo(PANEL_X + PANEL_W / 2 + 30, PANEL_Y + PANEL_H + 80, BULB_X - 20, BULB_Y + 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(PANEL_X + PANEL_W / 2 + 10, PANEL_Y + PANEL_H);
    ctx.quadraticCurveTo(PANEL_X + PANEL_W / 2 - 40, PANEL_Y + PANEL_H + 80, BULB_X + 20, BULB_Y + 30);
    ctx.stroke();
    ctx.restore();

    // electrons under other elements
    for (const e of electrons) {
      drawElectron(e);
    }

    drawSpark(dt);

    // messages
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#05323a';
    let mmY = HEIGHT - 40;
    for (const m of messages) {
      ctx.globalAlpha = clamp(m.t / 1200, 0, 1);
      ctx.fillText(m.text, WIDTH / 2, mmY);
      mmY -= 22;
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // draw UI overlays
    drawUI();

    // bottom instructions: interactive hints
    ctx.save();
    ctx.fillStyle = 'rgba(1,48,52,0.06)';
    roundRect(ctx, 12, HEIGHT - 72, 420, 56, 8);
    ctx.fill();
    ctx.fillStyle = '#025b54';
    ctx.font = '700 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Tip: Match numbers exactly to light the bulb. Overcharging pops it!', 24, HEIGHT - 44);
    ctx.fillText('Click an electron to drag it or press SPACE near one.', 24, HEIGHT - 24);
    ctx.restore();

    // visual cue for audio events (when glowTime)
    if (glowTime > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(glowTime, 0, 1) * 0.8;
      ctx.fillStyle = '#fff6b3';
      ctx.beginPath();
      ctx.ellipse(BULB_X, BULB_Y - 10, 100 * glowTime, 140 * glowTime, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // show helpful overlay when paused or on instructions
    if (!running) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.46)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.font = '700 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Spark & the Electric Sum', WIDTH / 2, HEIGHT / 2 - 40);
      ctx.font = '18px sans-serif';
      ctx.fillText('Click to start! Use arrow keys, space, enter. S to toggle sound.', WIDTH / 2, HEIGHT / 2 + 4);
      ctx.restore();
    }
  }

  function gameLoop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = Math.min(0.05, (ts - lastTime) / 1000);
    lastTime = ts;
    if (running) update(dt);
    render(ts);
    requestAnimationFrame(gameLoop);
  }

  // -------------------------
  // Input handlers
  // -------------------------
  function onKeyDown(e) {
    // Accessibility: allow starting audio on first user gesture
    safeResumeAudio();
    keys[e.key] = true;

    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      collectNearestElectron();
    } else if (e.key === 'Enter') {
      submitCharge();
    } else if (e.key === 's' || e.key === 'S') {
      audioOn = !audioOn;
      if (!audioOn) stopBackgroundHum();
      else startBackgroundHum();
      glowTime = 0.5;
    } else if (e.key === 'h' || e.key === 'H') {
      showInstructions = !showInstructions;
    } else if (!running) {
      // start game on any other key
      startGame();
    }
  }

  function onKeyUp(e) {
    keys[e.key] = false;
  }

  function onMouseDown(e) {
    safeResumeAudio();
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.down = true;

    // check if clicked an electron
    for (let i = electrons.length - 1; i >= 0; i--) {
      const el = electrons[i];
      const d = Math.hypot(el.x - mouse.x, el.y - mouse.y);
      if (d <= el.r + 6) {
        mouse.dragElectron = el;
        el.grabbed = false;
        el.beingSent = false;
        return;
      }
    }

    // if clicked start overlay, start
    if (!running) {
      startGame();
    }
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    // for keyboard-less users, let spark follow pointer when not dragging electron and mouse pressed
    if (!mouse.down) {
      // no auto-follow to avoid annoyances
    }
  }

  function onMouseUp(e) {
    mouse.down = false;
    // release dragged electron
    if (mouse.dragElectron) {
      // if near panel center, send to panel
      const el = mouse.dragElectron;
      const dx = el.x - (PANEL_X + PANEL_W / 2);
      const dy = el.y - (PANEL_Y + PANEL_H / 2);
      if (Math.hypot(dx, dy) < 54) {
        sendElectronToPanel(el);
      } else {
        // drop where released
      }
      mouse.dragElectron = null;
    }
  }

  // click on canvas for toggles such as sound or instructions
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // detect click on sound icon area
    const sx = WIDTH - 80;
    const sy = 18;
    if (cx >= sx - 4 && cx <= sx + 40 && cy >= sy - 4 && cy <= sy + 64) {
      audioOn = !audioOn;
      if (!audioOn) stopBackgroundHum();
      else startBackgroundHum();
      return;
    }

    // toggle show instructions by clicking the instructions panel
    if (cx >= 16 && cx <= 396 && cy >= 66 && cy <= 186) {
      showInstructions = !showInstructions;
    }
  }

  // -------------------------
  // Game start/stop
  // -------------------------
  function startGame() {
    running = true;
    showInstructions = false;
    lastTime = 0;
    level = Math.max(1, level);
    score = Math.max(0, score);
    resetLevel();
    safeResumeAudio();
    if (audioAvailable && audioOn) startBackgroundHum();
    addMessage('Welcome Spark! Match the number to light the bulb.');
  }

  // initialize and attach events
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('click', onClick);

  // Prevent losing focus on click (for keyboard)
  canvas.addEventListener('blur', function () {
    // clear keys to avoid stuck controls
    for (const k in keys) keys[k] = false;
  });

  // Make sure the canvas is focused for keyboard controls
  canvas.addEventListener('mouseenter', function () {
    canvas.focus();
  });

  // Start rendering loop
  requestAnimationFrame(gameLoop);

  // Small accessibility feature: provide keyboard help if no pointer events or if tabbed
  canvas.addEventListener('focus', function () {
    // show instructions briefly when focused
    showInstructions = true;
    setTimeout(() => {
      showInstructions = false;
    }, 3500);
  });

  // Expose simple API on the canvas element for testing or accessibility tools
  canvas.gameState = {
    get score() {
      return score;
    },
    get level() {
      return level;
    },
    get targetCharge() {
      return targetCharge;
    },
    get currentCharge() {
      return currentCharge;
    }
  };

  // End of game code
})();