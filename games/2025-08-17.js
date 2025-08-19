(function () {
  // Enhanced Electricity Math Game (visuals & audio improved)
  // All changes confined to visuals (canvas drawing) and audio (Web Audio API).
  // Core game mechanics, math, and interaction logic remain unchanged.

  // Find stage element
  const stage = document.getElementById('game-of-the-day-stage');
  if (!stage) {
    console.error('Element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear stage and create canvas (fixed size 720x480)
  stage.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Electric Math Lab. Drag numbered charge-orbs into device sockets to match target numbers. ' +
      'Use mouse or touch to drag. Use number keys 1-9 to pick an orb and Enter to place into a selected socket. ' +
      'Press M to mute/unmute sound. Correct matches light up devices.'
  );
  stage.appendChild(canvas);

  // Setup 2D context
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;

  // Hidden aria status for screen readers
  const ariaStatus = document.createElement('div');
  ariaStatus.setAttribute('aria-live', 'polite');
  ariaStatus.style.position = 'absolute';
  ariaStatus.style.left = '-9999px';
  ariaStatus.style.width = '1px';
  ariaStatus.style.height = '1px';
  ariaStatus.style.overflow = 'hidden';
  ariaStatus.id = 'electric-math-aria';
  stage.appendChild(ariaStatus);

  const WIDTH = 720;
  const HEIGHT = 480;

  // Audio setup with robust error handling
  let audioCtx = null;
  let masterGain = null;
  let ambientNodes = [];
  let audioEnabled = true;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.56;
    masterGain.connect(audioCtx.destination);

    // Build a subtle ambient pad using two detuned oscillators and a low-pass filter.
    const padGain = audioCtx.createGain();
    padGain.gain.value = 0.04; // very low
    const padFilter = audioCtx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 800;
    const oscA = audioCtx.createOscillator();
    const oscB = audioCtx.createOscillator();
    oscA.type = 'sine';
    oscB.type = 'sine';
    oscA.frequency.value = 110; // A2-ish warm tone
    oscB.frequency.value = 138; // slightly detuned
    // Slight detune/modulation via periodicGain LFO
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 20;
    const filterFreqParam = padFilter.frequency;
    lfo.connect(lfoGain);
    lfoGain.connect(filterFreqParam);

    oscA.connect(padFilter);
    oscB.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(masterGain);

    oscA.start();
    oscB.start();
    lfo.start();

    ambientNodes = [oscA, oscB, lfo, padGain, padFilter];
  } catch (err) {
    console.warn('Could not initialize Web Audio API. Sounds disabled.', err);
    audioEnabled = false;
    audioCtx = null;
    masterGain = null;
    ambientNodes = [];
  }

  // Safe audio resume for browsers requiring user gesture
  function resumeAudio() {
    if (!audioCtx) return Promise.resolve();
    if (audioCtx.state === 'suspended') {
      return audioCtx.resume().catch((err) => {
        console.warn('Audio resume failed:', err);
        audioEnabled = false;
      });
    }
    return Promise.resolve();
  }

  // Utility: create a short envelope node and play an oscillator with parameters
  function playTone({
    type = 'sine',
    freq = 440,
    duration = 0.5,
    volume = 0.12,
    attack = 0.01,
    release = 0.2,
    detune = 0
  } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      osc.type = type;
      osc.frequency.value = freq;
      if (detune) osc.detune.value = detune;
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(800, freq * 4);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + Math.max(0.001, attack));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + release + 0.05);
      // clean up nodes after stop
      setTimeout(() => {
        try {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch (e) {
          // ignore
        }
      }, (duration + release + 0.2) * 1000);
    } catch (e) {
      console.warn('playTone error:', e);
    }
  }

  // Improved sound effects
  function playSuccess() {
    if (!audioEnabled || !audioCtx) return;
    // A pleasant two-tone arpeggio
    playTone({ type: 'sine', freq: 880, duration: 0.28, volume: 0.12, attack: 0.01, release: 0.16 });
    setTimeout(() => {
      playTone({
        type: 'triangle',
        freq: 1320,
        duration: 0.36,
        volume: 0.08,
        attack: 0.01,
        release: 0.22,
        detune: -10
      });
    }, 120);
  }

  function playBuzzer() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const biq = audioCtx.createBiquadFilter();
      osc.type = 'square';
      osc.frequency.value = 160;
      biq.type = 'lowpass';
      biq.frequency.value = 700;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.connect(biq);
      biq.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.warn('playBuzzer error:', e);
    }
  }

  function playPickup() {
    // small percussive click
    playTone({ type: 'square', freq: 540, duration: 0.09, volume: 0.06, attack: 0.001, release: 0.06 });
  }

  function playPlace() {
    // gentle pluck
    playTone({ type: 'triangle', freq: 440, duration: 0.16, volume: 0.08, attack: 0.005, release: 0.12 });
  }

  // Toggle audio
  function toggleAudio() {
    if (!audioCtx) {
      audioEnabled = false;
      return;
    }
    audioEnabled = !audioEnabled;
    if (!audioEnabled) {
      masterGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
    } else {
      masterGain.gain.exponentialRampToValueAtTime(0.56, audioCtx.currentTime + 0.2);
      resumeAudio();
    }
  }

  // Game state (unchanged mechanics)
  let level = 1;
  const maxLevels = 6;
  let score = 0;
  let roundSolved = false;
  let timeSinceSolve = 0;

  const orbBank = [];
  const devices = [];
  let draggingOrb = null;
  let dragOffset = { x: 0, y: 0 };
  let selectedOrbIndex = 0;
  let selectedDeviceIndex = 0;
  let carryOrb = null;

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function initRound() {
    roundSolved = false;
    timeSinceSolve = 0;
    orbBank.length = 0;
    devices.length = 0;

    const orbCount = Math.min(9, 4 + level);
    const deviceCount = Math.min(4, 1 + Math.floor(level / 2));
    const maxTarget = 6 + level * 2;

    const targets = [];
    for (let i = 0; i < deviceCount; i++) {
      const target = randInt(4, Math.min(12 + level, maxTarget));
      const sockets = Math.min(3, 1 + Math.floor(level / 3));
      targets.push({ target, sockets });
    }

    const created = [];
    targets.forEach((t) => {
      let remain = t.target;
      const parts = [];
      for (let s = 0; s < t.sockets - 1; s++) {
        const part = randInt(1, Math.max(1, Math.floor(remain / 2)));
        parts.push(part);
        remain -= part;
      }
      parts.push(remain);
      parts.forEach((p) => created.push(Math.max(1, Math.min(9, p))));
    });

    while (created.length < orbCount) {
      created.push(randInt(1, 9));
    }

    for (let i = created.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [created[i], created[j]] = [created[j], created[i]];
    }

    const baseX = 20;
    const baseY = 80;
    const spacingY = 60;
    const timeNow = Date.now();
    created.forEach((num, i) => {
      orbBank.push({
        id: `o${i}_${timeNow}`,
        value: num,
        x: baseX,
        y: baseY + i * spacingY,
        radius: 22,
        placed: false,
        floatOffset: Math.random() * Math.PI * 2
      });
    });

    const devBaseX = 400;
    const devBaseY = 80;
    const devSpacingX = 300 / Math.max(1, deviceCount);
    for (let i = 0; i < deviceCount; i++) {
      const d = {
        id: 'd' + i,
        x: devBaseX + i * devSpacingX,
        y: devBaseY + i * 80,
        width: 240,
        height: 120,
        target: targets[i].target,
        sockets: targets[i].sockets,
        socketOrbs: new Array(targets[i].sockets).fill(null),
        lit: false,
        wobble: 0
      };
      devices.push(d);
    }

    selectedOrbIndex = 0;
    selectedDeviceIndex = 0;
    carryOrb = null;
    updateAria('New round started. Level ' + level + '. Place orbs to match device targets.');
  }

  function checkDevices() {
    let allGood = true;
    devices.forEach((dev) => {
      const sum = dev.socketOrbs.reduce((acc, o) => acc + (o ? o.value : 0), 0);
      if (sum === dev.target) {
        if (!dev.lit) {
          dev.lit = true;
          sparkAnimation(dev);
          playSuccess();
          updateAria(`Device target ${dev.target} solved!`);
          score += 10;
        }
      } else {
        if (dev.lit) {
          dev.lit = false;
        }
        allGood = false;
      }
    });
    if (allGood && devices.length > 0) {
      roundSolved = true;
      timeSinceSolve = 0;
      updateAria('All devices powered! Level completed.');
    }
  }

  // Sparks for visual feedback
  const sparks = [];

  function sparkAnimation(dev) {
    for (let i = 0; i < 14; i++) {
      sparks.push({
        x: dev.x + dev.width * (Math.random() * 0.8 + 0.1),
        y: dev.y + dev.height * (Math.random() * 0.65 + 0.15),
        vx: Math.random() * 3 - 1.5,
        vy: Math.random() * -3 - 1.5,
        life: 50 + Math.random() * 30,
        color: `rgba(255, ${180 + Math.floor(Math.random() * 60)}, 90, 1)`,
        size: 2 + Math.random() * 3
      });
    }
  }

  // Background parameters for subtle motion
  const cloudState = [
    { x: 120, y: 40, vx: 0.02, scale: 1, baseColor: '#ffffff', rim: '#dbefff', smile: true },
    { x: 540, y: 60, vx: -0.01, scale: 1.12, baseColor: '#fff7f2', rim: '#ffe8d6', smile: true }
  ];
  let gradientShift = 0;

  // Drawing helpers (visual overhaul)
  function drawBackground() {
    // animated vertical gradient
    gradientShift = (gradientShift + 0.0015) % 1;
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, mixColors('#f4fbff', '#fff8f0', gradientShift));
    g.addColorStop(0.5, mixColors('#eaf9f0', '#f6f7ff', gradientShift));
    g.addColorStop(1, mixColors('#e6f3ff', '#f4f7ec', gradientShift));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft vignette for focus
    const vg = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.35, 200, WIDTH * 0.5, HEIGHT * 0.35, 600);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // gentle floating clouds
    cloudState.forEach((c) => {
      c.x += c.vx;
      if (c.x > WIDTH + 80) c.x = -80;
      if (c.x < -80) c.x = WIDTH + 80;
      drawCloud(c.x, c.y, 60 * c.scale, 28 * c.scale, c.baseColor, c.rim, c.smile);
    });

    // lab table with subtle texture
    ctx.fillStyle = '#fbfbfe';
    ctx.fillRect(0, 360, WIDTH, 120);
    ctx.strokeStyle = 'rgba(155,150,255,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 360, WIDTH, 120);

    // title & HUD
    ctx.fillStyle = '#0b3d91';
    ctx.font = '20px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText("Sparky's Electric Math Lab", 20, 28);
    ctx.font = '14px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#1b3b6b';
    ctx.fillText(`Level ${level}   Score: ${score}`, 20, 50);
  }

  function mixColors(a, b, t) {
    // simple hex to rgb mix helper
    function hexToRgb(h) {
      const r = parseInt(h.slice(1, 3), 16);
      const g = parseInt(h.slice(3, 5), 16);
      const bl = parseInt(h.slice(5, 7), 16);
      return [r, g, bl];
    }
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const R = Math.round(A[0] * (1 - t) + B[0] * t);
    const G = Math.round(A[1] * (1 - t) + B[1] * t);
    const Bv = Math.round(A[2] * (1 - t) + B[2] * t);
    return `rgb(${R},${G},${Bv})`;
  }

  function drawCloud(cx, cy, rx, ry, color, edgeColor, smile) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(-rx * 0.45, 0, rx * 0.6, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(rx * 0.18, -ry * 0.18, rx * 0.78, ry * 0.95, 0, 0, Math.PI * 2);
    ctx.ellipse(rx * 0.66, ry * 0.08, rx * 0.58, ry * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (smile) {
      ctx.fillStyle = 'rgba(26, 26, 26, 0.9)';
      ctx.beginPath();
      ctx.arc(-rx * 0.1, -2, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rx * 0.35, -3, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(26,26,26,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(rx * 0.1, 4, 8, 0, Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw an orb with soft glow and subtle shadow
  function drawOrb(o, highlight = false) {
    ctx.save();
    const time = Date.now() / 450;
    const bob = Math.sin(time + (o.floatOffset || 0)) * 2;
    ctx.translate(o.x, o.y + bob);

    // shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(14,20,30,0.08)';
    ctx.ellipse(6, o.radius + 8, o.radius * 0.9, o.radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // glow
    const glow = ctx.createRadialGradient(0, 0, o.radius * 0.2, 0, 0, o.radius * 1.8);
    glow.addColorStop(0, 'rgba(255,245,160,0.9)');
    glow.addColorStop(0.5, 'rgba(255,232,110,0.55)');
    glow.addColorStop(1, 'rgba(255,200,50,0.06)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, o.radius * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // main body with subtle radial gradient
    const grd = ctx.createRadialGradient(-6, -6, 6, 6, 6, o.radius);
    grd.addColorStop(0, highlight ? '#fffdf0' : '#fffef6');
    grd.addColorStop(0.6, '#fff2a9');
    grd.addColorStop(1, '#f1b62e');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, o.radius, 0, Math.PI * 2);
    ctx.fill();

    // glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-6, -7, o.radius * 0.5, o.radius * 0.35, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // inner ring
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.2;
    ctx.arc(0, 0, o.radius - 4, 0, Math.PI * 2);
    ctx.stroke();

    // value text
    ctx.fillStyle = '#112827';
    ctx.font = 'bold 16px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.value, 0, 0);

    // subtle pulsing ring when highlighted
    if (highlight) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(40,120,220,${0.25 + Math.sin(Date.now() / 200) * 0.05})`;
      ctx.lineWidth = 4;
      ctx.arc(0, 0, o.radius + 7 + Math.sin(Date.now() / 180) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw device with improved styling and energetic glow when lit
  function drawDevice(dev) {
    ctx.save();
    // slight wobble animation
    const wobble = Math.sin(Date.now() / 160 + dev.x) * dev.wobble * 0.2;

    const x = dev.x;
    const y = dev.y + wobble;
    // outer panel with soft shadow
    ctx.save();
    ctx.shadowColor = 'rgba(20,30,60,0.06)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = dev.lit ? 'rgba(255,250,220,0.98)' : '#fbfcff';
    roundRect(ctx, x, y, dev.width, dev.height, 12);
    ctx.fill();
    ctx.restore();

    // frame stroke
    ctx.strokeStyle = dev.lit ? 'rgba(255,200,50,0.6)' : '#dce8ff';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, dev.width, dev.height, 12);
    ctx.stroke();

    // gentle inner gradient for panel
    const pg = ctx.createLinearGradient(x, y, x, y + dev.height);
    pg.addColorStop(0, dev.lit ? 'rgba(255,245,205,0.8)' : 'rgba(255,255,255,0.8)');
    pg.addColorStop(1, 'rgba(240,248,255,0.6)');
    ctx.fillStyle = pg;
    roundRect(ctx, x + 2, y + 2, dev.width - 4, dev.height - 4, 10);
    ctx.fill();

    // draw little Sparky face
    drawSparky(x + 18, y + 18, dev.lit);

    // target label
    ctx.fillStyle = '#0b355f';
    ctx.font = '16px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Target: ' + dev.target, x + 60, y + 28);

    // sockets area
    const spacing = (dev.width - 40) / Math.max(1, dev.sockets);
    for (let i = 0; i < dev.sockets; i++) {
      const sx = x + 20 + i * spacing + spacing / 2;
      const sy = y + dev.height - 34;

      // socket ring with depth
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = '#f0f4ff';
      ctx.strokeStyle = '#bac8ff';
      ctx.lineWidth = 2;
      ctx.arc(sx, sy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // subtle inset
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(10,20,40,0.04)';
      ctx.lineWidth = 1;
      ctx.arc(sx, sy, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const placed = dev.socketOrbs[i];
      if (placed) {
        // draw smaller orb inside (maintain consistent style)
        ctx.save();
        ctx.translate(sx, sy);
        const innerGrd = ctx.createRadialGradient(-3, -3, 4, 3, 3, 14);
        innerGrd.addColorStop(0, '#fffef8');
        innerGrd.addColorStop(1, '#ffd24a');
        ctx.fillStyle = innerGrd;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220,150,30,0.9)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = '#102826';
        ctx.font = 'bold 14px "Segoe UI", Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(placed.value, 0, 0);
        ctx.restore();
      } else {
        // empty socket minor hint
        ctx.save();
        ctx.fillStyle = '#9fb2ff';
        ctx.fillRect(sx - 1, sy - 8, 2, 16);
        ctx.fillRect(sx - 8, sy - 1, 16, 2);
        ctx.restore();
      }

      // selection ring if focused (keyboard)
      if (selectedDeviceIndex === devices.indexOf(dev) && selectedOrbIndex === -1) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(25,120,200,0.18)';
        ctx.lineWidth = 3;
        ctx.arc(sx, sy, 26 + Math.sin(Date.now() / 260) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // draw wire from battery to device with animated energy pulse
    drawWire(180, y + dev.height / 2, x + 10, y + dev.height / 2, dev.lit);

    // device glow when lit
    if (dev.lit) {
      const glow = ctx.createRadialGradient(
        x + dev.width / 2,
        y + dev.height / 2,
        0,
        x + dev.width / 2,
        y + dev.height / 2,
        220
      );
      glow.addColorStop(0, 'rgba(255,215,80,0.12)');
      glow.addColorStop(1, 'rgba(255,200,60,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 30, y - 30, dev.width + 60, dev.height + 60);
    }

    ctx.restore();
  }

  function drawSparky(cx, cy, lit) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.fillStyle = lit ? '#fff8c6' : '#ffffff';
    ctx.strokeStyle = 'rgba(20,20,20,0.08)';
    ctx.lineWidth = 1.4;
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // eyes
    ctx.fillStyle = '#0e2940';
    ctx.beginPath();
    ctx.arc(-5, -3, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(2, -3, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // smile
    ctx.beginPath();
    ctx.strokeStyle = '#2d2d2d';
    ctx.lineWidth = 1;
    ctx.arc(-1, 2, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // filament hint when lit
    if (lit) {
      ctx.strokeStyle = '#ffbb20';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-3, -2);
      ctx.lineTo(0, -6);
      ctx.lineTo(3, -2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWire(x1, y1, x2, y2, energized) {
    ctx.save();
    // animated zigzag path
    const dx = x2 - x1;
    const dy = y2 - y1;
    const steps = 7;
    const t0 = Date.now() / 600;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t + Math.sin((t + t0) * Math.PI * 4) * 6;
      const py = y1 + dy * t + Math.cos((t + t0) * Math.PI * 2) * 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = energized ? 'rgba(255,200,80,1)' : 'rgba(150,165,210,0.95)';
    ctx.stroke();

    // moving spark along wire if energized
    if (energized) {
      const trailT = (Math.sin(Date.now() / 260) + 1) / 2;
      // approximate position along path
      const tx = x1 + dx * trailT;
      const ty = y1 + dy * trailT + Math.cos((trailT + t0) * Math.PI * 4) * 2;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,230,120,0.95)';
      ctx.arc(tx, ty, 4 + Math.sin(Date.now() / 120) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Rounded rectangle utility
  function roundRect(ctxRef, x, y, w, h, r) {
    const ctx2 = ctxRef;
    ctx2.beginPath();
    ctx2.moveTo(x + r, y);
    ctx2.arcTo(x + w, y, x + w, y + h, r);
    ctx2.arcTo(x + w, y + h, x, y + h, r);
    ctx2.arcTo(x, y + h, x, y, r);
    ctx2.arcTo(x, y, x + w, y, r);
    ctx2.closePath();
  }

  // UI rendering (orb bank, battery, devices, HUD)
  function drawUI() {
    // Orb bank label
    ctx.fillStyle = '#0a3366';
    ctx.font = '16px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText('Charge Orbs', 20, 60);

    // draw orbs not placed (bank)
    orbBank.forEach((o, idx) => {
      if (!o.placed && o !== draggingOrb && o !== carryOrb) {
        const highlight = selectedOrbIndex === idx && carryOrb === null;
        drawOrb(o, highlight);
        if (highlight) {
          // small dashed highlight
          ctx.save();
          ctx.strokeStyle = 'rgba(10,120,200,0.14)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(
            o.x,
            o.y + Math.sin(Date.now() / 500 + (o.floatOffset || 0)) * 2,
            o.radius + 8,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          ctx.restore();
        }
      }
    });

    // battery character
    drawBattery(180, 200);

    // devices
    devices.forEach((d) => drawDevice(d));

    // dragging orb drawn last
    if (draggingOrb) {
      drawOrb(draggingOrb, true);
    }
    if (carryOrb) {
      // keyboard carry orb drawn at top center
      const px = 360;
      const py = 40;
      ctx.save();
      ctx.translate(px, py);
      // floating box
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.strokeStyle = 'rgba(30,60,120,0.06)';
      roundRect(ctx, -34, -24, 68, 48, 10);
      ctx.fill();
      ctx.stroke();
      // orb
      drawOrb({ x: 0, y: 0, radius: 22, value: carryOrb.value, floatOffset: 0 }, true);
      ctx.restore();
    }

    // speaker icon and minified control
    drawSpeakerIcon(WIDTH - 44, 12, audioEnabled);

    // instructions (compact)
    ctx.fillStyle = '#233e60';
    ctx.font = '12px "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText(
      'Drag or keyboard: 1-9 pick, Arrow keys navigate, Enter place, Delete remove, M mute.',
      20,
      HEIGHT - 12
    );
  }

  function drawBattery(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    // body
    ctx.fillStyle = '#fbfbff';
    roundRect(ctx, -60, -40, 120, 80, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,170,240,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // terminal
    ctx.fillStyle = '#e9ecff';
    ctx.fillRect(64, -12, 16, 24);

    // face
    ctx.fillStyle = '#1c2d4f';
    ctx.beginPath();
    ctx.arc(-30, -8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-10, -8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#15324f';
    ctx.beginPath();
    ctx.arc(-20, 2, 10, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // bolt logo
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    ctx.moveTo(10, -20);
    ctx.lineTo(2, 0);
    ctx.lineTo(16, 0);
    ctx.lineTo(4, 20);
    ctx.lineTo(18, -2);
    ctx.lineTo(6, -2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawSpeakerIcon(x, y, on) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = on ? '#ffcf33' : '#cccccc';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(12, -6);
    ctx.lineTo(12, 26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (on) {
      ctx.beginPath();
      ctx.arc(22, 6, 10, -0.65, 0.65);
      ctx.strokeStyle = 'rgba(255,150,0,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(30, 6, 14, -0.65, 0.65);
      ctx.strokeStyle = 'rgba(255,200,80,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#7a7a7a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, -6);
      ctx.lineTo(34, 18);
      ctx.moveTo(34, -6);
      ctx.lineTo(22, 18);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pointer helpers
  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX =
      e.clientX !== undefined ? e.clientX : e.touches && e.touches[0] && e.touches[0].clientX;
    const clientY =
      e.clientY !== undefined ? e.clientY : e.touches && e.touches[0] && e.touches[0].clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function onPointerDown(e) {
    e.preventDefault();
    resumeAudio(); // attempt to resume audio on user gesture
    const pos = getMousePos(e);
    // check orb bank
    for (let i = 0; i < orbBank.length; i++) {
      const o = orbBank[i];
      if (!o.placed) {
        const dx = pos.x - o.x;
        const dy = pos.y - o.y;
        if (dx * dx + dy * dy <= o.radius * o.radius) {
          draggingOrb = o;
          dragOffset.x = pos.x - o.x;
          dragOffset.y = pos.y - o.y;
          selectedOrbIndex = i;
          selectedDeviceIndex = -1;
          carryOrb = null;
          playPickup();
          return;
        }
      }
    }
    // check device sockets for pick-up or selection
    for (let di = 0; di < devices.length; di++) {
      const d = devices[di];
      const spacing = (d.width - 40) / Math.max(1, d.sockets);
      for (let si = 0; si < d.sockets; si++) {
        const sx = d.x + 20 + si * spacing + spacing / 2;
        const sy = d.y + d.height - 34;
        const dx = pos.x - sx;
        const dy = pos.y - sy;
        if (dx * dx + dy * dy <= 20 * 20) {
          if (d.socketOrbs[si]) {
            const orb = d.socketOrbs[si];
            d.socketOrbs[si] = null;
            orb.placed = false;
            orb.x = pos.x;
            orb.y = pos.y;
            draggingOrb = orb;
            dragOffset.x = 0;
            dragOffset.y = 0;
            selectedDeviceIndex = di;
            selectedOrbIndex = orbBank.indexOf(orb);
            playPickup();
            updateAria('Picked up orb ' + orb.value + ' from device socket.');
            return;
          } else {
            selectedDeviceIndex = di;
            selectedOrbIndex = -1;
            carryOrb = null;
            updateAria('Selected device ' + (di + 1) + '. Use number keys to pick up an orb.');
            return;
          }
        }
      }
    }
  }

  function onPointerMove(e) {
    if (!draggingOrb) return;
    e.preventDefault();
    const pos = getMousePos(e);
    draggingOrb.x = pos.x - dragOffset.x;
    draggingOrb.y = pos.y - dragOffset.y;
  }

  function onPointerUp(e) {
    if (!draggingOrb) return;
    e.preventDefault();
    const pos = getMousePos(e);
    let placed = false;
    for (let di = 0; di < devices.length; di++) {
      const d = devices[di];
      const spacing = (d.width - 40) / Math.max(1, d.sockets);
      for (let si = 0; si < d.sockets; si++) {
        const sx = d.x + 20 + si * spacing + spacing / 2;
        const sy = d.y + d.height - 34;
        const dx = pos.x - sx;
        const dy = pos.y - sy;
        if (dx * dx + dy * dy <= 22 * 22) {
          if (!d.socketOrbs[si]) {
            d.socketOrbs[si] = draggingOrb;
            draggingOrb.placed = true;
            draggingOrb.x = sx;
            draggingOrb.y = sy;
            placed = true;
            updateAria('Placed orb ' + draggingOrb.value + ' into device target ' + d.target + '.');
            break;
          } else {
            playBuzzer();
          }
        }
      }
      if (placed) break;
    }

    if (!placed) {
      const idx = orbBank.indexOf(draggingOrb);
      if (idx >= 0) {
        draggingOrb.x = 20;
        draggingOrb.y = 80 + idx * 60;
      }
    } else {
      playPlace();
    }
    draggingOrb = null;
    checkDevices();
  }

  // Keyboard controls (unchanged functionality)
  let deviceFocusIndex = 0;

  function onKeyDown(e) {
    if (e.key === 'm' || e.key === 'M') {
      toggleAudio();
      updateAria('Audio ' + (audioEnabled ? 'enabled' : 'muted') + '.');
      e.preventDefault();
      return;
    }

    if (/^[1-9]$/.test(e.key)) {
      const numKey = parseInt(e.key, 10);
      let foundIndex = -1;
      for (let i = 0; i < orbBank.length; i++) {
        const o = orbBank[i];
        if (!o.placed && o.value === numKey) {
          foundIndex = i;
          break;
        }
      }
      if (foundIndex >= 0) {
        carryOrb = { ...orbBank[foundIndex] };
        selectedOrbIndex = foundIndex;
        selectedDeviceIndex = deviceFocusIndex;
        updateAria(
          'Picked up orb ' + carryOrb.value + ' with keyboard. Select a device socket and press Enter to place.'
        );
        playPickup();
      } else {
        updateAria('No available orb with value ' + numKey + '.');
        playBuzzer();
      }
      e.preventDefault();
      return;
    }

    if (e.key === 'Tab') {
      if (selectedOrbIndex === -1) {
        selectedOrbIndex = 0;
        selectedDeviceIndex = -1;
      } else {
        selectedDeviceIndex = 0;
        selectedOrbIndex = -1;
      }
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowRight') {
      deviceFocusIndex = devices.length ? (deviceFocusIndex + 1) % devices.length : 0;
      selectedDeviceIndex = deviceFocusIndex;
      selectedOrbIndex = -1;
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft') {
      deviceFocusIndex = devices.length ? (deviceFocusIndex - 1 + devices.length) % devices.length : 0;
      selectedDeviceIndex = deviceFocusIndex;
      selectedOrbIndex = -1;
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowUp') {
      selectedOrbIndex = (selectedOrbIndex - 1 + orbBank.length) % orbBank.length;
      selectedDeviceIndex = -1;
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      selectedOrbIndex = (selectedOrbIndex + 1) % orbBank.length;
      selectedDeviceIndex = -1;
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      if (carryOrb && selectedDeviceIndex >= 0) {
        const dev = devices[selectedDeviceIndex];
        let placed = false;
        for (let si = 0; si < dev.sockets; si++) {
          if (!dev.socketOrbs[si]) {
            const origIdx = orbBank.findIndex((o) => !o.placed && o.value === carryOrb.value);
            if (origIdx >= 0) {
              const orig = orbBank[origIdx];
              orig.placed = true;
              dev.socketOrbs[si] = orig;
              const spacing = (dev.width - 40) / Math.max(1, dev.sockets);
              const sx = dev.x + 20 + si * spacing + spacing / 2;
              const sy = dev.y + dev.height - 34;
              orig.x = sx;
              orig.y = sy;
              placed = true;
              updateAria('Placed orb ' + orig.value + ' into device target ' + dev.target + ' via keyboard.');
              playPlace();
            } else {
              playBuzzer();
            }
            break;
          }
        }
        if (!placed) {
          updateAria('No available socket on selected device.');
          playBuzzer();
        }
        carryOrb = null;
        checkDevices();
      } else if (selectedOrbIndex >= 0 && selectedDeviceIndex >= 0) {
        const orig = orbBank[selectedOrbIndex];
        if (!orig.placed) {
          const dev = devices[selectedDeviceIndex];
          let placed = false;
          for (let si = 0; si < dev.sockets; si++) {
            if (!dev.socketOrbs[si]) {
              dev.socketOrbs[si] = orig;
              orig.placed = true;
              const spacing = (dev.width - 40) / Math.max(1, dev.sockets);
              const sx = dev.x + 20 + si * spacing + spacing / 2;
              const sy = dev.y + dev.height - 34;
              orig.x = sx;
              orig.y = sy;
              placed = true;
              updateAria('Placed orb ' + orig.value + ' into device target ' + dev.target + ' via keyboard.');
              playPlace();
              break;
            }
          }
          if (!placed) {
            playBuzzer();
            updateAria('No available socket on selected device.');
          }
          checkDevices();
        }
      }
      e.preventDefault();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedDeviceIndex >= 0) {
        const dev = devices[selectedDeviceIndex];
        for (let si = dev.sockets - 1; si >= 0; si--) {
          if (dev.socketOrbs[si]) {
            const orb = dev.socketOrbs[si];
            dev.socketOrbs[si] = null;
            orb.placed = false;
            const idx = orbBank.indexOf(orb);
            if (idx >= 0) {
              orb.x = 20;
              orb.y = 80 + idx * 60;
            }
            updateAria('Removed orb ' + orb.value + ' from device.');
            playBuzzer();
            checkDevices();
            break;
          }
        }
      }
      e.preventDefault();
      return;
    }
  }

  function updateAria(text) {
    ariaStatus.textContent = text;
  }

  // Game loop & update/render logic
  let lastTS = performance.now();

  function loop(ts) {
    const dt = Math.min(50, ts - lastTS);
    lastTS = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // sparks physics
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.12;
      s.life -= 1;
      if (s.life <= 0) sparks.splice(i, 1);
    }

    // device wobble
    devices.forEach((d) => {
      if (d.lit) {
        d.wobble = Math.min(8, d.wobble + 0.4);
      } else {
        d.wobble = Math.max(0, d.wobble - 0.6);
      }
    });

    // next level handling
    if (roundSolved) {
      timeSinceSolve += dt;
      if (timeSinceSolve > 1400) {
        level++;
        if (level > maxLevels) {
          updateAria('Congratulations! You completed all levels. Starting over.');
          level = 1;
          score = 0;
        } else {
          updateAria('Advancing to level ' + level + '.');
        }
        initRound();
      }
    }

    // orb bobbing animation
    orbBank.forEach((o, idx) => {
      if (!o.placed && o !== draggingOrb) {
        o.x = 20 + Math.sin(Date.now() / 500 + (o.floatOffset || 0)) * 2;
        o.y = 80 + idx * 60;
      }
    });
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawUI();

    // draw sparks over content
    sparks.forEach((s) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life / 60));
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // Placement helper
  function findOrbById(id) {
    return orbBank.find((o) => o.id === id);
  }

  // Event listeners (mouse, touch, keyboard)
  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  canvas.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('touchend', onPointerUp);
  canvas.addEventListener('keydown', onKeyDown);

  // Click speaker icon toggle
  canvas.addEventListener('click', function (e) {
    const pos = getMousePos(e);
    if (pos.x >= WIDTH - 60 && pos.x <= WIDTH && pos.y >= 0 && pos.y <= 44) {
      toggleAudio();
      updateAria('Audio ' + (audioEnabled ? 'enabled' : 'muted') + '.');
    }
  });

  // Initialize and start
  initRound();
  requestAnimationFrame(loop);

  // Expose safe debug helpers
  try {
    window.electricMathGame = {
      reset: function () {
        level = 1;
        score = 0;
        initRound();
      },
      toggleAudio: toggleAudio
    };
  } catch (e) {
    // ignore
  }

  // Attempt to resume audio on first user gesture
  function resumeAudioOnInteraction() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx
        .resume()
        .then(() => {
          audioEnabled = true;
          masterGain.gain.value = 0.56;
        })
        .catch((err) => {
          console.warn('Could not resume audio context:', err);
          audioEnabled = false;
        });
    }
  }
  const resumeHandler = function () {
    resumeAudioOnInteraction();
    window.removeEventListener('mousedown', resumeHandler);
    window.removeEventListener('touchstart', resumeHandler);
    window.removeEventListener('keydown', resumeHandler);
  };
  window.addEventListener('mousedown', resumeHandler);
  window.addEventListener('touchstart', resumeHandler);
  window.addEventListener('keydown', resumeHandler);
})();