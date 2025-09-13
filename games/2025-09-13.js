(function () {
  // Enhanced Machine Math - visuals and audio improvements only
  // Renders inside element with id 'game-of-the-day-stage'
  // All visuals drawn on canvas. Sounds created with Web Audio API.
  // Game mechanics and math logic unchanged.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const MAX_LEVEL = 5;
  const CONTAINER_ID = 'game-of-the-day-stage';

  // Grab container
  const container = document.getElementById(CONTAINER_ID);
  if (!container) {
    console.error('Game container not found:', CONTAINER_ID);
    return;
  }

  // Make container accessible
  container.setAttribute('role', 'application');
  container.setAttribute(
    'aria-label',
    'Machine Math game. Choose gears to add up to the target number. Use mouse or keyboard. Press space or click to start audio.'
  );
  container.style.position = container.style.position || 'relative';
  container.style.outline = 'none';
  container.tabIndex = 0; // enable keyboard focus

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Game area: a colorful machine and moving gears.');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Create an offscreen live region for screen readers
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.overflow = 'hidden';
  container.appendChild(live);

  // DPR scaling for crisp canvas
  const DPR = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(WIDTH * DPR);
  canvas.height = Math.round(HEIGHT * DPR);
  ctx.scale(DPR, DPR);

  // Audio setup with error handling
  let audioCtx = null;
  let audioEnabled = false;
  let ambientNodes = null;
  let dragHumNodes = null; // hum when dragging a cog
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      audioEnabled = false;
    } else {
      console.warn('Web Audio API not available.');
      audioCtx = null;
      audioEnabled = false;
    }
  } catch (e) {
    console.error('AudioContext creation failed:', e);
    audioCtx = null;
    audioEnabled = false;
  }

  // Utility: safe connect
  function safeConnect(a, b) {
    try {
      if (a && b && typeof a.connect === 'function') a.connect(b);
    } catch (e) {
      console.error('Audio connect error', e);
    }
  }

  // Utility: create a short metallic click using FM-ish approach
  function playClick() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const carrier = audioCtx.createOscillator();
      const mod = audioCtx.createOscillator();
      const modGain = audioCtx.createGain();
      const env = audioCtx.createGain();
      carrier.type = 'triangle';
      carrier.frequency.value = 900;
      mod.type = 'square';
      mod.frequency.value = 1200;
      modGain.gain.value = 20;
      env.gain.value = 0.0001;
      safeConnect(mod, modGain);
      safeConnect(modGain, carrier.frequency);
      safeConnect(carrier, env);
      safeConnect(env, audioCtx.destination);
      // Envelope
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      carrier.start(now);
      mod.start(now);
      carrier.stop(now + 0.2);
      mod.stop(now + 0.2);
    } catch (e) {
      console.error('playClick error', e);
    }
  }

  // Improved correct chime: bright bell with slight chorus
  function playCorrect() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [880, 1100, 1320]; // chord
      const master = audioCtx.createGain();
      master.gain.value = 0.0;
      safeConnect(master, audioCtx.destination);

      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0, now);
      master.gain.linearRampToValueAtTime(0.07, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

      freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const bp = audioCtx.createBiquadFilter();
        osc.type = i === 0 ? 'sine' : 'triangle';
        // slight detune
        osc.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
        // bandpass for bell tone
        bp.type = 'bandpass';
        bp.frequency.value = f * 1.05;
        bp.Q.value = 8;
        gain.gain.value = 0.0001;
        safeConnect(osc, bp);
        safeConnect(bp, gain);
        safeConnect(gain, master);
        // individual envelopes
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02 + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7 + i * 0.12);
        osc.start(now);
        osc.stop(now + 1.0 + i * 0.2);
      });
    } catch (e) {
      console.error('playCorrect error', e);
    }
  }

  // Improved wrong buzzer: soft mechanical thud with filter sweep
  function playWrong() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      o.type = 'square';
      o.frequency.value = 220;
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
      g.gain.value = 0.0001;
      safeConnect(o, filter);
      safeConnect(filter, g);
      safeConnect(g, audioCtx.destination);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      // sweep downwards for disappointment
      o.frequency.setValueAtTime(420, now);
      o.frequency.exponentialRampToValueAtTime(60, now + 0.58);
      o.start(now);
      o.stop(now + 0.62);
    } catch (e) {
      console.error('playWrong error', e);
    }
  }

  // Play a soft "place" bell when a cog is placed (subtle)
  function playPlace() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      o.type = 'sine';
      o.frequency.value = 520;
      f.type = 'highpass';
      f.frequency.value = 200;
      g.gain.value = 0.0001;
      safeConnect(o, f);
      safeConnect(f, g);
      safeConnect(g, audioCtx.destination);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      o.start(now);
      o.stop(now + 0.3);
    } catch (e) {
      console.error('playPlace error', e);
    }
  }

  // Start ambient background sound (gentle machine hum + slow harmonic pads)
  function startAmbient() {
    if (!audioCtx || !audioEnabled) return;
    stopAmbient();
    try {
      const master = audioCtx.createGain();
      master.gain.value = 0.02; // gentle
      safeConnect(master, audioCtx.destination);

      // two slow detuned pads for warmth
      const pad1 = audioCtx.createOscillator();
      pad1.type = 'sine';
      pad1.frequency.value = 110;
      const pad2 = audioCtx.createOscillator();
      pad2.type = 'sine';
      pad2.frequency.value = 138.5;

      const p1g = audioCtx.createGain();
      const p2g = audioCtx.createGain();
      p1g.gain.value = 0.5;
      p2g.gain.value = 0.45;

      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 700;

      safeConnect(pad1, p1g);
      safeConnect(pad2, p2g);
      safeConnect(p1g, padFilter);
      safeConnect(p2g, padFilter);
      safeConnect(padFilter, master);

      pad1.start();
      pad2.start();

      // subtle mechanical clicks loop (very sparse)
      const clickTimer = {
        id: null
      };
      function scheduleSparseClicks() {
        const delay = 3 + Math.random() * 5;
        clickTimer.id = setTimeout(() => {
          // gentle metallic click in the background
          if (audioEnabled) {
            try {
              const now = audioCtx.currentTime;
              const o = audioCtx.createOscillator();
              const g = audioCtx.createGain();
              o.type = 'triangle';
              o.frequency.value = 600 + Math.random() * 200;
              g.gain.value = 0.0001;
              safeConnect(o, g);
              safeConnect(g, master);
              g.gain.setValueAtTime(0.0001, now);
              g.gain.exponentialRampToValueAtTime(0.012, now + 0.01);
              g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
              o.start(now);
              o.stop(now + 0.3);
            } catch (err) {
              console.error(err);
            }
          }
          scheduleSparseClicks();
        }, delay * 1000);
      }
      scheduleSparseClicks();

      // slow LFO on master gain for breathing
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.008;
      safeConnect(lfo, lfoGain);
      safeConnect(lfoGain, master.gain);
      lfo.start();

      ambientNodes = { pad1, pad2, p1g, p2g, padFilter, lfo, lfoGain, master, clickTimer };
    } catch (e) {
      console.error('startAmbient error', e);
    }
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    try {
      if (ambientNodes.clickTimer && ambientNodes.clickTimer.id) {
        clearTimeout(ambientNodes.clickTimer.id);
      }
      ['pad1', 'pad2', 'lfo'].forEach((k) => {
        if (ambientNodes[k] && typeof ambientNodes[k].stop === 'function') {
          try {
            ambientNodes[k].stop();
          } catch (e) {}
        }
      });
      // disconnect master
      if (ambientNodes.master) {
        try {
          ambientNodes.master.disconnect();
        } catch (e) {}
      }
    } catch (e) {
      console.error('stopAmbient error', e);
    } finally {
      ambientNodes = null;
    }
  }

  // Drag hum: subtle continuous sound while a cog is grabbed
  function startDragHum() {
    if (!audioCtx || !audioEnabled) return;
    if (dragHumNodes) return;
    try {
      const master = audioCtx.createGain();
      master.gain.value = 0.0;
      safeConnect(master, audioCtx.destination);

      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 160;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;

      safeConnect(osc, filter);
      safeConnect(filter, master);

      // gentle fade in
      const now = audioCtx.currentTime;
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.02, now + 0.08);

      osc.start();
      dragHumNodes = { osc, filter, master };
    } catch (e) {
      console.error('startDragHum error', e);
    }
  }

  function stopDragHum() {
    if (!dragHumNodes) return;
    try {
      const now = audioCtx.currentTime;
      if (dragHumNodes.master) {
        try {
          dragHumNodes.master.gain.cancelScheduledValues(now);
          dragHumNodes.master.gain.setValueAtTime(dragHumNodes.master.gain.value || 0.02, now);
          dragHumNodes.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        } catch (e) {}
      }
      if (dragHumNodes.osc && typeof dragHumNodes.osc.stop === 'function') {
        try {
          dragHumNodes.osc.stop(now + 0.15);
        } catch (e) {}
      }
    } catch (e) {
      console.error('stopDragHum error', e);
    } finally {
      dragHumNodes = null;
    }
  }

  // Fade audio context on user gesture
  function enableAudioOnGesture() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        audioEnabled = true;
        startAmbient();
        liveUpdate('Audio enabled. Gentle background sounds started.');
      }).catch((e) => {
        console.warn('Audio resume failed:', e);
        audioEnabled = false;
        liveUpdate('Audio could not be started. You can still play without sound.');
      });
    } else {
      audioEnabled = true;
      startAmbient();
      liveUpdate('Audio started.');
    }
  }

  // Live region update helper
  function liveUpdate(msg) {
    try {
      live.textContent = msg;
    } catch (e) {
      console.warn('liveUpdate failed', e);
    }
  }

  // Game state
  let level = 1;
  let score = 0;
  let state = 'start'; // start, playing, levelComplete, won
  let waitingForStart = true;
  let cogs = []; // moving cogs on conveyor
  let placedCogs = [];
  let selectedCog = null;
  let hoverCog = null;
  let conveyorY = 120;
  let machineX = 460;
  let machineY = 140;
  let target = 0;

  // Visual particles for celebrations and minor feedback
  const particles = [];

  // Cog factory
  function createCog(value, x, y, radius = 30) {
    return {
      id: Math.random().toString(36).slice(2, 9),
      value,
      x,
      y,
      radius,
      baseX: x,
      baseY: y,
      speed: 0.4 + Math.random() * 0.8,
      dir: Math.random() > 0.5 ? 1 : -1,
      rotation: Math.random() * Math.PI * 2,
      grabbed: false,
      placed: false,
      wobble: Math.random() * 0.5,
      hue: 28 + Math.floor(Math.random() * 40) // warm hue base
    };
  }

  // Level generation unchanged except visuals unaffected
  function generateLevel(lv) {
    cogs = [];
    placedCogs = [];
    selectedCog = null;
    hoverCog = null;

    const subsetCount = Math.random() > 0.5 ? 2 : 3;
    const subset = [];
    let running = 0;
    for (let i = 0; i < subsetCount; i++) {
      const maxVal = Math.max(1, 6 - subsetCount + lv);
      let val = 1 + Math.floor(Math.random() * Math.min(9, maxVal + 3));
      if (i === subsetCount - 1 && running + val < 4) val = 4;
      subset.push(val);
      running += val;
    }
    target = running;

    const totalCogs = 5;
    const extrasCount = totalCogs - subset.length;
    const extras = [];
    for (let i = 0; i < extrasCount; i++) {
      let val = 1 + Math.floor(Math.random() * 9);
      extras.push(val);
    }

    const allValues = shuffleArray([...subset, ...extras]);

    const startX = 80;
    const spacing = 110;
    for (let i = 0; i < allValues.length; i++) {
      const x = startX + i * spacing;
      const y = conveyorY;
      cogs.push(createCog(allValues[i], x, y));
    }

    state = 'playing';
    waitingForStart = false;
    liveUpdate(`Level ${lv}. Target ${target}. Pick cogs that add to ${target}.`);
  }

  // Utility shuffle
  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Collision detection unchanged
  function pointInCog(px, py, cog) {
    const dx = px - cog.x;
    const dy = py - cog.y;
    return dx * dx + dy * dy <= cog.radius * cog.radius;
  }

  // Particles functions
  function spawnConfetti(x, y, count = 18) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const life = 800 + Math.random() * 800;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: 4 + Math.random() * 6,
        hue: 20 + Math.floor(Math.random() * 140),
        t0: performance.now(),
        life,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.1
      });
    }
  }

  function spawnSpark(x, y) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 2,
      vy: -Math.random() * 2,
      size: 2 + Math.random() * 3,
      hue: 48,
      t0: performance.now(),
      life: 400 + Math.random() * 300,
      rotation: 0,
      vr: 0.03
    });
  }

  function updateParticles() {
    const now = performance.now();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.t0;
      if (age > p.life) {
        particles.splice(i, 1);
        continue;
      }
      const dt = Math.min(16, age / 16);
      p.vy += 0.06; // gravity
      p.vx *= 0.997;
      p.vy *= 0.999;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vr;
    }
  }

  // Main draw loop
  function draw() {
    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Soft background
    drawBackground();

    // Decorative foreground glow
    drawConveyor();

    // Draw machine and robot face
    drawMachine();

    // Draw placed cogs are drawn inside drawMachine area, but update is done in update()

    // Draw HUD
    drawHUD();

    // Draw particles above other elements
    renderParticles();

    // Overlay messages depending on state
    if (state === 'start') {
      drawStartOverlay();
    } else if (state === 'levelComplete') {
      drawLevelCompleteOverlay();
    } else if (state === 'won') {
      drawWonOverlay();
    }
  }

  function drawBackground() {
    // layered gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#f0fbff');
    g.addColorStop(0.5, '#e9f7f7');
    g.addColorStop(1, '#f7fbf2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle vignette
    const vg = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 100, WIDTH / 2, HEIGHT / 2, 700);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(8,20,30,0.04)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // floating soft shapes (geometric clouds)
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 6; i++) {
      const cx = (i * 140 + Date.now() / 80 * (0.2 + (i % 3) * 0.05)) % (WIDTH + 200) - 100;
      const cy = 30 + (i % 3) * 18 + Math.sin(Date.now() / 1400 + i) * 6;
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#fffaf0';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 120 - (i % 3) * 18, 36 + (i % 2) * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawConveyor() {
    // conveyor shadow
    ctx.save();
    ctx.fillStyle = '#d9dee6';
    roundRect(ctx, 40, conveyorY - 44, 380, 128, 18);
    ctx.fill();

    // conveyor body with glossy top
    // darker base
    ctx.fillStyle = '#bfc9d6';
    roundRect(ctx, 44, conveyorY - 36, 372, 112, 14);
    ctx.fill();

    // glossy stripe
    const gloss = ctx.createLinearGradient(44, conveyorY - 36, 44, conveyorY + 76);
    gloss.addColorStop(0, 'rgba(255,255,255,0.45)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    gloss.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = gloss;
    roundRect(ctx, 44, conveyorY - 36, 372, 28, 12);
    ctx.fill();

    // moving stripes for conveyor motion (subtle)
    const stripeW = 38;
    const offset = (Date.now() / 70) % (stripeW * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 44 - offset; x < 416; x += stripeW * 2) {
      ctx.save();
      ctx.translate(x, conveyorY - 12);
      ctx.rotate(-0.08);
      ctx.fillRect(0, 0, stripeW, 80);
      ctx.restore();
    }

    // small guide rails
    ctx.fillStyle = '#e6eaf0';
    roundRect(ctx, 40, conveyorY - 52, 380, 8, 6);
    ctx.fill();
    roundRect(ctx, 40, conveyorY + 76, 380, 8, 6);
    ctx.fill();

    ctx.restore();

    // draw cogs
    cogs.forEach((cog) => {
      // animate movement for unreleased cogs along small horizontal swing
      if (!cog.grabbed && !cog.placed) {
        const sway = Math.sin(Date.now() / 1000 * cog.speed * cog.dir + cog.wobble * 2) * 6;
        cog.x = cog.baseX + sway;
        cog.rotation += 0.012 * cog.dir * cog.speed;
      } else if (cog.placed) {
        cog.rotation += 0.02;
      } else if (cog.grabbed) {
        cog.rotation += 0.08;
      }

      drawCog(cog, cog === selectedCog ? 0.08 : (cog === hoverCog ? 0.06 : 0.0));
    });
  }

  function drawMachine() {
    ctx.save();
    ctx.translate(machineX, machineY);

    // machine shell with layered panels
    // main body
    const bodyGrad = ctx.createLinearGradient(0, 0, 0, 260);
    bodyGrad.addColorStop(0, '#e8f5ff');
    bodyGrad.addColorStop(1, '#cfe7ff');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, 0, 0, 260, 260, 18);
    ctx.fill();

    // inner panel
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 18, 14, 224, 100, 10);
    ctx.fill();

    // machine display area
    ctx.fillStyle = '#07263d';
    ctx.font = '20px "Segoe UI", Arial';
    ctx.fillText('Target', 32, 44);
    ctx.font = '48px "Segoe UI", Arial';
    ctx.fillStyle = '#d1495b';
    ctx.fillText(String(target), 32, 88);

    // robot face on the right for personality
    ctx.save();
    ctx.translate(160, 32);
    // head box
    ctx.fillStyle = '#f3fbff';
    roundRect(ctx, -12, -12, 84, 64, 10);
    ctx.fill();
    // eyes
    const t = Date.now() / 400;
    ctx.fillStyle = '#07263d';
    ctx.beginPath();
    ctx.ellipse(6, 8 + Math.sin(t) * 1.5, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(42, 8 + Math.cos(t) * 1.3, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // mouth
    ctx.fillStyle = '#8fcbe8';
    roundRect(ctx, 8, 32, 36, 8, 4);
    ctx.fill();
    ctx.restore();

    // slots area
    ctx.fillStyle = '#f2f6f9';
    roundRect(ctx, 18, 130, 224, 90, 8);
    ctx.fill();

    // draw placed cogs in slots (arranged)
    const slotCount = 5;
    const slotSpacing = 36;
    const startX = 30;
    const startY = 152;
    placedCogs.forEach((cog, idx) => {
      const px = startX + (idx % slotCount) * slotSpacing;
      const py = startY + Math.floor(idx / slotCount) * 32;
      drawMiniCog(px, py, 14, cog.value);
    });

    // machine mouth/slot where you drop cogs (glowing when hovering)
    const mouthX = 196;
    const mouthY = 86;
    ctx.fillStyle = '#03263d';
    roundRect(ctx, mouthX, mouthY, 44, 120, 8);
    ctx.fill();

    // subtle glow when sum equals target (handled elsewhere), draw indicator ring
    const sumSoFar = placedCogs.reduce((s, c) => s + c.value, 0);
    if (sumSoFar > 0) {
      const ringHue = sumSoFar === target ? 150 : 210;
      ctx.strokeStyle = `hsla(${ringHue}, 70%, 55%, ${0.6})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(220, 86, 20, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }

    ctx.restore();

    // machine arm decorative
    ctx.save();
    ctx.translate(machineX - 24, machineY + 82);
    ctx.rotate(Math.sin(Date.now() / 1100) * 0.05);
    ctx.fillStyle = '#ffd179';
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // sum display
    ctx.fillStyle = '#07263d';
    ctx.font = '20px "Segoe UI", Arial';
    ctx.fillText(`Sum: ${sumSoFar}`, machineX + 28, machineY + 240);
  }

  function drawMiniCog(x, y, r, val) {
    ctx.save();
    ctx.translate(x, y);
    // tiny shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.6, r + 6, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // teeth
    ctx.fillStyle = '#fffaf2';
    for (let t = 0; t < 8; t++) {
      const a = t / 8 * Math.PI * 2;
      const tx = Math.cos(a) * (r + 6);
      const ty = Math.sin(a) * (r + 6);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(a);
      const toothGrad = ctx.createLinearGradient(-3, -2, 3, 2);
      toothGrad.addColorStop(0, '#ffffff');
      toothGrad.addColorStop(1, '#e2d6c3');
      ctx.fillStyle = toothGrad;
      roundRect(ctx, -5, -4, 10, 8, 2);
      ctx.fill();
      ctx.restore();
    }

    // body with gradient
    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, '#ffd379');
    grad.addColorStop(1, '#ffb84d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.4, r * 0.45, r * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // center
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r / 2, 0, Math.PI * 2);
    ctx.fill();

    // number
    ctx.fillStyle = '#052233';
    ctx.font = '12px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(val), 0, 0);
    ctx.restore();
  }

  function drawCog(cog, overlayAlpha = 0) {
    ctx.save();
    ctx.translate(cog.x, cog.y);
    ctx.rotate(cog.rotation);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(6, cog.radius * 0.7, cog.radius * 1.05, cog.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // create radial gradient body
    const bodyGrad = ctx.createRadialGradient(-cog.radius * 0.3, -cog.radius * 0.3, 4, 0, 0, cog.radius);
    bodyGrad.addColorStop(0, `hsl(${cog.hue}, 95%, 72%)`);
    bodyGrad.addColorStop(0.6, `hsl(${cog.hue - 10}, 85%, 60%)`);
    bodyGrad.addColorStop(1, '#c9903a');

    // teeth with subtle metal shading
    const teeth = 12;
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * Math.PI * 2;
      const tx = Math.cos(a) * (cog.radius + 8);
      const ty = Math.sin(a) * (cog.radius + 8);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(a);
      const toothGrad = ctx.createLinearGradient(-3, -2, 3, 2);
      toothGrad.addColorStop(0, '#ffffff');
      toothGrad.addColorStop(1, '#e2d6c3');
      ctx.fillStyle = toothGrad;
      roundRect(ctx, -5, -4, 10, 8, 2);
      ctx.fill();
      ctx.restore();
    }

    // main body
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, cog.radius, 0, Math.PI * 2);
    ctx.fill();

    // central plate
    ctx.fillStyle = '#fffaf7';
    ctx.beginPath();
    ctx.arc(0, 0, cog.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // subtle overlay when hover or selected
    if (overlayAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${overlayAlpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, cog.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // numeric label with subtle shadow
    ctx.fillStyle = '#052233';
    ctx.font = `${Math.floor(cog.radius * 0.7)}px "Segoe UI", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(cog.value), 0, 0);

    // strokes if grabbed or hover
    if (cog.grabbed) {
      ctx.strokeStyle = 'rgba(255,120,120,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, cog.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      // small sparks
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const rx = Math.cos(a) * (cog.radius + 10);
        const ry = Math.sin(a) * (cog.radius + 10);
        ctx.fillStyle = 'rgba(255,180,120,0.6)';
        ctx.beginPath();
        ctx.arc(rx, ry, 2 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (cog === hoverCog) {
      ctx.strokeStyle = 'rgba(120,255,190,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, cog.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function renderParticles() {
    updateParticles();
    particles.forEach((p) => {
      const age = performance.now() - p.t0;
      const lifeRatio = 1 - age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, lifeRatio));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      if (p.size > 3) {
        ctx.fillStyle = `hsl(${p.hue}, 80%, 55%)`;
        roundRect(ctx, -p.size / 2, -p.size / 2, p.size, p.size, 1);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawHUD() {
    // HUD background
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    roundRect(ctx, 8, 6, 220, 36, 8);
    ctx.fill();

    // Level and score
    ctx.fillStyle = '#07263d';
    ctx.font = '18px "Segoe UI", Arial';
    ctx.fillText(`Level ${level}`, 16, 26);
    ctx.fillText(`Score ${score}`, 128, 26);

    // Instructions compact (bottom)
    ctx.fillStyle = 'rgba(7,38,61,0.9)';
    ctx.font = '13px "Segoe UI", Arial';
    ctx.fillText('Pick cogs and drop into machine to match the target number.', 16, HEIGHT - 34);
    ctx.fillText('Keyboard: Tab/Arrows to select, Space to grab/drop, 1-9 to pick.', 16, HEIGHT - 14);

    // Audio icon (drawn as speaker)
    drawAudioIcon(WIDTH - 54, 26, audioEnabled);
    ctx.restore();
  }

  function drawAudioIcon(x, y, on) {
    ctx.save();
    ctx.translate(x, y);
    // circle background
    ctx.fillStyle = on ? '#9fe6a9' : '#ffd1d1';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // speaker body
    ctx.fillStyle = '#07263d';
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(-2, -6);
    ctx.lineTo(4, -10);
    ctx.lineTo(4, 10);
    ctx.lineTo(-2, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();

    if (on) {
      ctx.strokeStyle = '#07263d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(7, 0, 6, -Math.PI / 6, Math.PI / 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(7, 0, 9, -Math.PI / 6, Math.PI / 6);
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // muted slash
      ctx.strokeStyle = '#07263d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-8, -8);
      ctx.lineTo(12, 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStartOverlay() {
    ctx.fillStyle = 'rgba(4, 28, 52, 0.42)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#fff';
    ctx.font = '34px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Machine Math', WIDTH / 2, 120);
    ctx.font = '16px "Segoe UI", Arial';
    ctx.fillText('Assemble cogs to match the target number.', WIDTH / 2, 150);
    ctx.fillText('Click or press Space to start. Use mouse or keyboard.', WIDTH / 2, 175);

    // friendly robot center
    ctx.save();
    ctx.translate(WIDTH / 2 - 80, 220);
    // body
    ctx.fillStyle = '#f7f2e8';
    roundRect(ctx, 0, 0, 180, 160, 14);
    ctx.fill();
    // screen
    ctx.fillStyle = '#07263d';
    roundRect(ctx, 20, 20, 140, 60, 8);
    ctx.fill();
    // smiling face
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(40, 50, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(100, 50, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8fcbe8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(70, 72, 20, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    // start button
    ctx.fillStyle = '#ffd479';
    roundRect(ctx, 40, 96, 100, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#07263d';
    ctx.font = '20px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Start', 90, 122);
    ctx.restore();
  }

  function drawLevelCompleteOverlay() {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, 140, 92, 440, 296, 14);
    ctx.fill();
    ctx.strokeStyle = '#07263d';
    ctx.lineWidth = 2;
    ctx.strokeRect(140, 92, 440, 296);
    ctx.fillStyle = '#07263d';
    ctx.font = '24px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Nice! Level ${level} complete`, WIDTH / 2, 160);
    ctx.font = '16px "Segoe UI", Arial';
    ctx.fillText('Press Space or Click to continue.', WIDTH / 2, 200);

    // small celebratory sparkles
    for (let i = 0; i < 12; i++) {
      const sx = 220 + i * 26;
      ctx.fillStyle = `hsl(${60 + i * 8}, 80%, 55%)`;
      ctx.beginPath();
      ctx.arc(sx, 240 + Math.sin((i + Date.now() / 500) / 2) * 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWonOverlay() {
    ctx.fillStyle = 'rgba(6, 60, 20, 0.9)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#e6ffe9';
    ctx.font = '32px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('All Machines Fixed!', WIDTH / 2, 220);
    ctx.font = '16px "Segoe UI", Arial';
    ctx.fillText('Great work — you solved all the machine puzzles!', WIDTH / 2, 260);
    ctx.fillText('Refresh to play again.', WIDTH / 2, 294);
  }

  // Utility rounded rect (kept)
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Interaction handling
  let mouse = { x: 0, y: 0, down: false };

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    if (!selectedCog) {
      hoverCog = null;
      for (let i = 0; i < cogs.length; i++) {
        const cog = cogs[i];
        if (!cog.placed && pointInCog(mouse.x, mouse.y, cog)) {
          hoverCog = cog;
          break;
        }
      }
    } else if (selectedCog && selectedCog.grabbed) {
      selectedCog.x = mouse.x;
      selectedCog.y = mouse.y;
      // occasionally spawn tiny sparks while dragging
      if (Math.random() < 0.02) spawnSpark(mouse.x, mouse.y);
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.down = true;

    if (state === 'start' || waitingForStart) {
      enableAudioOnGesture();
      waitingForStart = false;
      if (state === 'start') {
        generateLevel(level);
        playClick();
        return;
      }
    }

    if (state === 'levelComplete') {
      playClick();
      nextLevel();
      return;
    } else if (state === 'won') {
      resetGame();
      playClick();
      return;
    }

    for (let i = cogs.length - 1; i >= 0; i--) {
      const cog = cogs[i];
      if (!cog.placed && pointInCog(mouse.x, mouse.y, cog)) {
        selectCog(cog);
        // immediate grab with mouse down
        grabSelected();
        // small audio cue
        playClick();
        // start drag hum
        startDragHum();
        return;
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    mouse.down = false;
    if (selectedCog && selectedCog.grabbed) {
      const inMachine = isOverMachineSlot(selectedCog.x, selectedCog.y);
      if (inMachine) {
        placeCog(selectedCog);
        // sound for placing
        playPlace();
      } else {
        playClick();
        selectedCog.grabbed = false;
        selectedCog = null;
      }
    }
    // stop drag hum on mouse up
    stopDragHum();
  });

  // Keyboard controls (unchanged logic)
  container.addEventListener('keydown', (e) => {
    if (waitingForStart && (e.key === ' ' || e.key === 'Enter')) {
      enableAudioOnGesture();
      waitingForStart = false;
      if (state === 'start') {
        generateLevel(level);
        playClick();
      }
      e.preventDefault();
      return;
    }
    if (state === 'start') return;

    if (state === 'levelComplete' && (e.key === ' ' || e.key === 'Enter')) {
      nextLevel();
      e.preventDefault();
      return;
    } else if (state === 'won' && (e.key === ' ' || e.key === 'Enter')) {
      resetGame();
      e.preventDefault();
      return;
    }

    const availableCogs = cogs.filter((c) => !c.placed);
    if (e.key === 'ArrowRight' || e.key === 'Tab') {
      if (availableCogs.length) {
        let idx = availableCogs.indexOf(selectedCog);
        idx = idx === -1 ? 0 : (idx + 1) % availableCogs.length;
        selectCog(availableCogs[idx]);
      }
      e.preventDefault();
      return;
    } else if (e.key === 'ArrowLeft') {
      if (availableCogs.length) {
        let idx = availableCogs.indexOf(selectedCog);
        idx = idx === -1 ? availableCogs.length - 1 : (idx - 1 + availableCogs.length) % availableCogs.length;
        selectCog(availableCogs[idx]);
      }
      e.preventDefault();
      return;
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (!selectedCog && availableCogs.length) {
        selectCog(availableCogs[0]);
      } else if (selectedCog && !selectedCog.grabbed) {
        grabSelected();
        // start drag hum for keyboard grab
        startDragHum();
      } else if (selectedCog && selectedCog.grabbed) {
        const dropX = machineX + 190;
        const dropY = machineY + 150;
        selectedCog.x = dropX;
        selectedCog.y = dropY;
        placeCog(selectedCog);
        playPlace();
        stopDragHum();
      }
      playClick();
      e.preventDefault();
      return;
    } else if (/^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      const av = availableCogs;
      if (idx >= 0 && idx < av.length) {
        selectCog(av[idx]);
      }
      e.preventDefault();
      return;
    } else if (e.key.toLowerCase() === 'm') {
      if (audioCtx) {
        if (audioEnabled) {
          stopAmbient();
          audioEnabled = false;
          liveUpdate('Audio muted.');
        } else {
          enableAudioOnGesture();
        }
      } else {
        liveUpdate('Audio not available on this device.');
      }
    }
  });

  function selectCog(cog) {
    if (selectedCog && selectedCog !== cog) {
      selectedCog.grabbed = false;
    }
    selectedCog = cog;
    const idx = cogs.indexOf(cog);
    if (idx >= 0) {
      cogs.splice(idx, 1);
      cogs.push(cog);
    }
    liveUpdate(`Selected cog ${cog.value}. Press Space to grab or drag to machine.`);
  }

  function grabSelected() {
    if (!selectedCog) return;
    selectedCog.grabbed = true;
  }

  function isOverMachineSlot(x, y) {
    return x >= machineX + 20 && x <= machineX + 220 && y >= machineY + 130 && y <= machineY + 220;
  }

  // placeCog is mostly unchanged but we add visual/audio cues (only visuals/audio)
  function placeCog(cog) {
    cog.grabbed = false;
    cog.placed = true;
    placedCogs.push(cog);
    selectedCog = null;
    playClick();
    const sum = placedCogs.reduce((s, c) => s + c.value, 0);
    if (sum === target) {
      playCorrect();
      score += 10 * level;
      // celebratory visuals
      spawnConfetti(machineX + 120, machineY + 50, 30);
      // small sparks
      spawnSpark(machineX + 120, machineY + 60);
      state = 'levelComplete';
      liveUpdate(`Perfect! You matched ${target}. Level complete.`);
      // stop ambient briefly to highlight success (fade)
      if (ambientNodes && ambientNodes.master) {
        try {
          ambientNodes.master.gain.setValueAtTime(ambientNodes.master.gain.value || 0.02, audioCtx.currentTime);
          ambientNodes.master.gain.exponentialRampToValueAtTime(0.002, audioCtx.currentTime + 0.4);
        } catch (e) {}
      }
    } else if (sum > target) {
      playWrong();
      liveUpdate(`Oh no! Sum ${sum} is more than ${target}. Remove a cog and try again.`);
      setTimeout(() => {
        const rejected = placedCogs.pop();
        if (rejected) {
          rejected.placed = false;
          rejected.x = rejected.baseX;
          rejected.y = rejected.baseY;
          // rejection particle
          spawnSpark(rejected.x, rejected.y);
        }
      }, 600);
    } else {
      playClick();
      liveUpdate(`Good. Current sum ${sum}. Keep going to reach ${target}.`);
    }
    // always stop drag hum on place
    stopDragHum();
  }

  function nextLevel() {
    if (level >= MAX_LEVEL) {
      state = 'won';
      liveUpdate('You have fixed all the machines. Fantastic!');
      stopAmbient();
      return;
    }
    level++;
    generateLevel(level);
  }

  function resetGame() {
    level = 1;
    score = 0;
    state = 'start';
    waitingForStart = true;
    cogs = [];
    placedCogs = [];
    selectedCog = null;
    hoverCog = null;
    liveUpdate('Game reset. Press Space or click to begin.');
    startAmbient();
  }

  // Animation loop
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  function update() {
    // hover detection subtle
    if (!selectedCog) {
      hoverCog = null;
      for (let i = 0; i < cogs.length; i++) {
        const cog = cogs[i];
        if (!cog.placed && pointInCog(mouse.x, mouse.y, cog)) {
          hoverCog = cog;
          break;
        }
      }
    }

    // placed cogs settle into slots
    placedCogs.forEach((c, i) => {
      const targetX = machineX + 30 + (i % 5) * 36;
      const targetY = machineY + 152 + Math.floor(i / 5) * 32;
      // smooth snap
      c.x += (targetX - c.x) * 0.2;
      c.y += (targetY - c.y) * 0.15;
      c.rotation += 0.01;
    });

    // manage drag hum: if a cog is grabbed start hum, otherwise stop
    if (selectedCog && selectedCog.grabbed) {
      startDragHum();
    } else {
      // don't stop too aggressively in case keyboard toggles quickly
      if (dragHumNodes && !mouse.down) stopDragHum();
    }
  }

  // Start the loop
  draw();
  loop();

  liveUpdate('Welcome to Machine Math. Press Space or click to start. Press M to toggle audio. Use keyboard or mouse.');

  if (!audioCtx) {
    liveUpdate('Audio not available. You can still play the game without sound.');
  }

  // Cleanup on unload: stop audio nodes
  window.addEventListener('unload', () => {
    try {
      stopAmbient();
      stopDragHum();
      if (audioCtx && typeof audioCtx.close === 'function') audioCtx.close();
    } catch (e) {
      // ignore
    }
  });

  // Visibility change handling for ambient dynamics
  document.addEventListener('visibilitychange', () => {
    try {
      if (!audioCtx || !ambientNodes) return;
      if (document.hidden) {
        if (ambientNodes.master) ambientNodes.master.gain.setValueAtTime(0.001, audioCtx.currentTime);
      } else {
        if (ambientNodes.master) ambientNodes.master.gain.setValueAtTime(0.02, audioCtx.currentTime);
      }
    } catch (e) {
      console.error('visibilitychange audio error', e);
    }
  });

  // Global error handling
  window.addEventListener('error', (ev) => {
    console.error('Unexpected error in Machine Math', ev.error || ev.message || ev);
    liveUpdate('An unexpected error occurred. Try refreshing the page.');
  });
})();