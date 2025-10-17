(() => {
  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 10; // minimum padding between UI elements
  const TARGET_CORRECT = 10; // win condition: collect this many correct parcels
  const MAX_LIVES = 3; // lose condition: this many wrong collections ends the game
  const PARCEL_SPAWN_INTERVAL = 1000; // ms between parcel spawns (changes with difficulty)
  const PARCEL_SPEED_MIN = 0.6;
  const PARCEL_SPEED_MAX = 1.6;

  // Get container and create canvas
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.');
    return;
  }
  container.style.position = 'relative';
  container.style.width = `${WIDTH}px`;
  container.style.height = `${HEIGHT}px`;
  container.tabIndex = 0; // make focusable for keyboard events

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = 'block';
  canvas.style.outline = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Fonts and sizes
  const BODY_FONT =
    '16px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const IMPORTANT_FONT =
    '20px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const TITLE_FONT =
    '28px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const SMALL_FONT =
    '14px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';

  // Game state
  let state = 'menu'; // 'menu' | 'playing' | 'win' | 'gameover'
  let score = 0;
  let lives = MAX_LIVES;
  let targetQuestion = null; // {a,b,op,answer}
  let parcels = []; // falling items
  let lastSpawn = 0;
  let spawnInterval = PARCEL_SPAWN_INTERVAL;
  let keys = {};
  let lastTime = performance.now();
  let drone = {
    x: WIDTH / 2,
    y: HEIGHT - 70,
    width: 80,
    height: 36,
    speed: 240 // pixels per second
  };
  let audioEnabled = true;
  let audioContext = null;
  let backgroundNode = null;
  let masterGain = null;

  // Particles and visual effects
  let particles = []; // for sparkles
  let shockwaves = []; // for wrong pick waves
  let menuStartButtonRect = null;
  let audioAvailable = false;

  // UI animation timers
  let lastScoreChangeTime = 0;
  let lastLivesChangeTime = 0;

  // Error handling wrapper for audio creation
  function createAudioContextSafely() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported.');
      const ctx = new AC();
      audioAvailable = true;
      return ctx;
    } catch (err) {
      console.warn('AudioContext creation failed:', err);
      audioAvailable = false;
      return null;
    }
  }

  // Initialize Audio - create a gentle ambient pad and soft chime/arpeggio
  function initAudio() {
    if (audioContext) return;
    audioContext = createAudioContextSafely();
    if (!audioContext) return;
    try {
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.12; // gentle volume
      masterGain.connect(audioContext.destination);

      // Ambient pad: two detuned sine oscillators through a mellow filter
      const padOscA = audioContext.createOscillator();
      padOscA.type = 'sine';
      padOscA.frequency.value = 110; // A2-ish

      const padOscB = audioContext.createOscillator();
      padOscB.type = 'sine';
      padOscB.frequency.value = 116.87; // slightly detuned

      const padGain = audioContext.createGain();
      padGain.gain.value = 0.04;

      const padFilter = audioContext.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 600; // mellow
      padFilter.Q.value = 0.7;

      // slow LFO to move filter cutoff a bit
      const lfo = audioContext.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.06; // very slow
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 200; // cutoff modulation depth
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      padOscA.connect(padFilter);
      padOscB.connect(padFilter);
      padFilter.connect(padGain);
      padGain.connect(masterGain);

      padOscA.start();
      padOscB.start();
      lfo.start();

      // gentle rhythmic bell: quiet short notes every few seconds
      const bell = {
        intervalId: null,
        play: () => {
          if (!audioContext || !audioEnabled) return;
          try {
            const now = audioContext.currentTime;
            const o = audioContext.createOscillator();
            o.type = 'triangle';
            const g = audioContext.createGain();
            g.gain.value = 0.0001;
            o.frequency.setValueAtTime(880, now);
            o.frequency.exponentialRampToValueAtTime(660, now + 0.25);
            const env = audioContext.createGain();
            env.gain.setValueAtTime(0.0001, now);
            env.gain.linearRampToValueAtTime(0.06, now + 0.02);
            env.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
            o.connect(g);
            g.connect(env);
            env.connect(masterGain);
            o.start(now);
            o.stop(now + 1.2);
          } catch (err) {
            console.warn('Bell play error:', err);
          }
        },
        startInterval: () => {
          // random interval between 3 and 6 seconds
          if (bell.intervalId) return;
          const playLater = () => {
            bell.play();
            const next = 3 + Math.random() * 3;
            bell.intervalId = setTimeout(playLater, next * 1000);
          };
          bell.intervalId = setTimeout(playLater, 1000 + Math.random() * 2000);
        },
        stopInterval: () => {
          if (bell.intervalId) clearTimeout(bell.intervalId);
          bell.intervalId = null;
        }
      };

      bell.startInterval();

      backgroundNode = {
        padOscA,
        padOscB,
        padGain,
        padFilter,
        lfo,
        lfoGain,
        bell
      };
    } catch (err) {
      console.warn('Error initializing audio nodes:', err);
      audioAvailable = false;
    }
  }

  // Play feedback sound: 'correct' or 'wrong' or 'pick'
  function playSound(type = 'pick') {
    if (!audioContext || !audioAvailable || !audioEnabled) return;
    try {
      const now = audioContext.currentTime;
      if (type === 'correct') {
        // bright chime with bandpass
        const o = audioContext.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, now);
        o.frequency.exponentialRampToValueAtTime(660, now + 0.28);

        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.14, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

        const bp = audioContext.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        bp.Q.value = 1.2;

        o.connect(bp);
        bp.connect(g);
        g.connect(masterGain);

        o.start(now);
        o.stop(now + 1.2);
      } else if (type === 'wrong') {
        // low thud with gentle click: a quickly filtered noise burst + sine
        // noise
        const bufferSize = 2 * audioContext.sampleRate;
        const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioContext.sampleRate * 0.05));
        }
        const noise = audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        const nf = audioContext.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.value = 600;
        const ng = audioContext.createGain();
        ng.gain.value = 0.0001;
        ng.gain.linearRampToValueAtTime(0.12, now + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        noise.connect(nf);
        nf.connect(ng);
        ng.connect(masterGain);
        noise.start(now);
        noise.stop(now + 0.6);

        // low sine thud
        const o = audioContext.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.28);
        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.12, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        o.connect(g);
        g.connect(masterGain);
        o.start(now);
        o.stop(now + 0.6);
      } else {
        // pick / hover subtle tone
        const o = audioContext.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(700, now);
        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.04, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        o.connect(g);
        g.connect(masterGain);
        o.start(now);
        o.stop(now + 0.18);
      }
    } catch (err) {
      console.warn('Error creating sound:', err);
    }
  }

  // Utility: generate a simple addition or subtraction question suitable for ages 7-9
  function generateQuestion() {
    const op = Math.random() < 0.6 ? '+' : '-';
    let a, b, answer;
    if (op === '+') {
      a = Math.floor(Math.random() * 10) + 1; // 1-10
      b = Math.floor(Math.random() * 10) + 1;
      answer = a + b;
    } else {
      a = Math.floor(Math.random() * 15) + 1; // 1-15
      b = Math.floor(Math.random() * a) + 0; // ensure non-negative result
      answer = a - b;
    }
    return { a, b, op, answer };
  }

  // Parcel object creation
  function spawnParcel() {
    const q = targetQuestion;
    if (!q) return;
    // Probability that a spawned parcel equals the answer: ~35%
    const isCorrect = Math.random() < 0.35;
    let value;
    if (isCorrect) {
      value = q.answer;
    } else {
      // plausible distractors: near answer or random within 0-20
      const offset = Math.floor(Math.random() * 7) - 3; // -3..3
      value = Math.max(0, q.answer + offset);
      if (value === q.answer) {
        value = (value + 2) % 21;
      }
    }
    const x = Math.random() * (WIDTH - 40) + 20;
    const speed = PARCEL_SPEED_MIN + Math.random() * (PARCEL_SPEED_MAX - PARCEL_SPEED_MIN);
    const color = pastelColor();
    const shape = Math.random() < 0.5 ? 'box' : 'circle';
    const p = {
      x,
      y: -20,
      vy: 40 * speed,
      value,
      color,
      shape,
      r: 18,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 6 + Math.random() * 6,
      rotation: Math.random() * 0.3 - 0.15
    };
    parcels.push(p);
  }

  // Pastel color generator
  function pastelColor() {
    const hue = Math.floor(Math.random() * 360);
    const sat = 60 + Math.floor(Math.random() * 20);
    const light = 70 + Math.floor(Math.random() * 10);
    return `hsl(${hue}deg ${sat}% ${light}%)`;
  }

  // Draw helpers with measureText background rectangles ensuring no overlap
  function drawTextWithBackground(text, font, x, y, options = {}) {
    const padding = options.padding ?? 8;
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    // approximate text height from font size
    const fontNum = parseInt(font, 10) || 16;
    const textHeight = fontNum;
    let rectX = x;
    let rectY = y - textHeight;
    // If center option, center rect
    if (options.center) rectX = x - textWidth / 2 - padding;
    if (options.right) rectX = x - textWidth - padding * 2;
    const rectW = textWidth + padding * 2;
    const rectH = textHeight + padding * 1.6;
    ctx.fillStyle = options.bgColor ?? 'rgba(255,255,255,0.75)';
    ctx.strokeStyle = options.borderColor ?? 'rgba(0,0,0,0.06)';
    ctx.lineWidth = options.borderWidth ?? 1;
    roundRect(ctx, rectX, rectY, rectW, rectH, 8, true, true);
    ctx.fillStyle = options.color ?? '#111';
    ctx.font = font;
    ctx.textBaseline = 'top';
    if (options.center) ctx.fillText(text, x - textWidth / 2, rectY + padding * 0.6);
    else if (options.right) ctx.fillText(text, rectX + padding, rectY + padding * 0.6);
    else ctx.fillText(text, rectX + padding, rectY + padding * 0.6);
    return { rectX, rectY, rectW, rectH };
  }

  // Rounded rectangle utility
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof stroke === 'undefined') stroke = true;
    if (typeof r === 'undefined') r = 5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.save();
      ctx.fill();
      ctx.restore();
    }
    if (stroke) ctx.stroke();
  }

  // Draw scene background with calming gradient and gentle animations
  function drawBackground(t) {
    // gentle gradient sky
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, 'hsl(210deg 70% 98%)');
    grad.addColorStop(1, 'hsl(210deg 60% 90%)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // faint soft sun glow
    const sunX = WIDTH - 100;
    const sunY = 80;
    const sunRad = 70;
    const g2 = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, sunRad);
    g2.addColorStop(0, 'rgba(255,245,200,0.8)');
    g2.addColorStop(1, 'rgba(255,245,200,0.02)');
    ctx.fillStyle = g2;
    ctx.fillRect(sunX - sunRad, sunY - sunRad, sunRad * 2, sunRad * 2);

    // rolling hills
    ctx.save();
    ctx.translate(0, HEIGHT - 120);
    drawHills(t);
    ctx.restore();

    // drifting clouds with slight parallax
    for (let i = 0; i < 5; i++) {
      drawCloud(
        (t / 20 + i * 160) % (WIDTH + 200) - 100,
        40 + (i % 2) * 20 + (i * 7) % 30,
        1 + (i % 2) * 0.18,
        i
      );
    }

    // bottom landing pad shadow
    ctx.save();
    const padW = 260;
    const padX = WIDTH / 2 - padW / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(padX, HEIGHT - 110, padW, 16);
    ctx.restore();
  }

  function drawHills(t) {
    // gentle layered hills
    ctx.fillStyle = 'hsl(125deg 40% 90%)';
    roundRect(ctx, -20, 20, WIDTH + 40, 120, 20, true, false);
    ctx.beginPath();
    ctx.moveTo(0, 90);
    for (let x = 0; x <= WIDTH; x += 20) {
      ctx.lineTo(x, 90 + Math.sin((x + t / 30) / 40) * 8);
    }
    ctx.lineTo(WIDTH, 120);
    ctx.lineTo(0, 120);
    ctx.closePath();
    ctx.fillStyle = 'hsl(125deg 40% 85%)';
    ctx.fill();

    // simple landing pad marks
    const padW = 260;
    const padX = WIDTH / 2 - padW / 2;
    ctx.fillStyle = 'hsl(210deg 60% 92%)';
    roundRect(ctx, padX, 40, padW, 52, 12, true, false);
    // stripes
    ctx.fillStyle = 'hsl(210deg 50% 84%)';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(padX + 18 + i * 48, 40, 28, 52);
    }
  }

  function drawCloud(cx, cy, scale = 1, odd = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(220,220,255,0.32)';
    ctx.lineWidth = 1;
    const wobble = Math.sin((cx + cy) / 120 + odd) * 6;
    ctx.ellipse(-16 + wobble, 0, 28, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(6 + wobble, -4, 38, 24, 0, 0, Math.PI * 2);
    ctx.ellipse(30 + wobble, 0, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw drone with animated props and subtle bobbing
  function drawDrone(dt, t) {
    ctx.save();
    ctx.translate(drone.x, drone.y);
    const bob = Math.sin(t / 300) * 4;
    ctx.translate(0, bob);

    // shadow
    ctx.beginPath();
    ctx.ellipse(0, drone.height / 2 + 20, 44, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fill();

    // body with gradient
    const bodyW = drone.width;
    const bodyH = drone.height;
    const grad = ctx.createLinearGradient(-bodyW / 2, -bodyH / 2, bodyW / 2, bodyH / 2);
    grad.addColorStop(0, 'hsl(210deg 74% 92%)');
    grad.addColorStop(1, 'hsl(210deg 60% 78%)');
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(10,10,10,0.06)';
    roundRect(ctx, -bodyW / 2, -bodyH / 2, bodyW, bodyH, 12, true, true);

    // cockpit/glass
    ctx.beginPath();
    ctx.fillStyle = 'rgba(10,40,80,0.85)';
    ctx.ellipse(-6, 0, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // friendly decals
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DRONE', 12, 0);

    // arms and propellers
    const spin = (t / 80) % (Math.PI * 2);
    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      const armX = side * (bodyW / 2 - 8);
      const armY = -bodyH / 2 - 8;
      ctx.translate(armX, armY);

      // arm
      ctx.fillStyle = 'rgba(20,40,70,0.14)';
      roundRect(ctx, -6, -6, 12, 28, 6, true, false);

      // prop
      ctx.save();
      ctx.translate(0, -14);
      ctx.rotate(spin * (side * -1)); // opposite directions
      ctx.fillStyle = 'rgba(38,67,120,0.8)';
      for (let b = 0; b < 3; b++) {
        if (ctx.roundRect) {
          ctx.roundRect(-40, -4, 80, 8, 6);
        } else {
          ctx.fillRect(-40, -4, 80, 8);
        }
        ctx.rotate((Math.PI * 2) / 3);
      }
      ctx.restore();

      // rotor hub
      ctx.beginPath();
      ctx.fillStyle = 'rgba(18,36,68,0.95)';
      ctx.arc(0, -8, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // little magnet/cargo hook under the drone
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(10,20,40,0.18)';
    ctx.lineWidth = 2;
    ctx.moveTo(10, bodyH / 2 - 4);
    ctx.lineTo(10, bodyH / 2 + 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(60,90,150,0.9)';
    ctx.arc(10, bodyH / 2 + 16, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw parcels with gentle swaying and subtle highlights
  function drawParcels(t) {
    parcels.forEach(p => {
      ctx.save();
      // sway based on time and parcel phase
      const sway = Math.sin(performance.now() / 300 + p.swayPhase) * p.swayAmp;
      const rot = p.rotation + Math.sin(performance.now() / 350 + p.swayPhase) * 0.06;
      ctx.translate(p.x + sway, p.y);
      ctx.rotate(rot);
      // shadow
      ctx.beginPath();
      ctx.ellipse(0, p.r + 10, p.r + 6, p.r / 2 + 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fill();

      // parcel
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // highlight
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.arc(-p.r / 2.8, -p.r / 2.8, p.r / 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // box
        const s = p.r * 2;
        const corner = 8;
        ctx.fillStyle = p.color;
        roundRect(ctx, -p.r, -p.r, s, s, corner, true, true);
        // tape stripe
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(-4, -p.r, 8, s);
        // highlight
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.ellipse(-p.r / 2.6, -p.r / 2.8, p.r / 4, p.r / 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // number label
      ctx.fillStyle = '#082034';
      ctx.font = IMPORTANT_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.value), 0, 0);

      ctx.restore();
    });
  }

  // Particles drawing and update
  function drawParticles(dt) {
    // draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const part = particles[i];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += part.ay * dt;
      part.life -= dt;
      if (part.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      const alpha = Math.max(0, part.life / part.maxLife);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${part.color.r},${part.color.g},${part.color.b},${alpha})`;
      ctx.arc(part.x, part.y, part.radius * alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    // shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i];
      s.r += s.speed * dt;
      s.life -= dt;
      if (s.life <= 0) {
        shockwaves.splice(i, 1);
        continue;
      }
      const a = Math.max(0, s.life / s.maxLife);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${s.color.r},${s.color.g},${s.color.b},${0.9 * a})`;
      ctx.lineWidth = 3 * a;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function createSparkles(x, y, baseColor = { r: 120, g: 200, b: 120 }) {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 20;
      const life = 0.6 + Math.random() * 0.6;
      particles.push({
        x,
        y,
        vx,
        vy,
        ay: 140,
        life,
        maxLife: life,
        radius: 1 + Math.random() * 2.5,
        color: {
          r: baseColor.r + Math.floor(Math.random() * 40 - 20),
          g: baseColor.g + Math.floor(Math.random() * 40 - 20),
          b: baseColor.b + Math.floor(Math.random() * 40 - 20)
        }
      });
    }
  }

  function createShockwave(x, y, color = { r: 200, g: 80, b: 80 }) {
    shockwaves.push({
      x,
      y,
      r: 6,
      speed: 120 + Math.random() * 60,
      life: 0.6,
      maxLife: 0.6,
      color
    });
  }

  // Collision detection between drone rect and parcel circle/box
  function checkCollision(p) {
    // drone bounding box
    const dx = Math.abs(p.x - drone.x);
    const dy = Math.abs(p.y - drone.y);
    const halfW = drone.width / 2;
    const halfH = drone.height / 2;
    // approximate: if parcel circle intersects rect
    const closestX = Math.max(drone.x - halfW, Math.min(p.x, drone.x + halfW));
    const closestY = Math.max(drone.y - halfH, Math.min(p.y, drone.y + halfH));
    const distX = p.x - closestX;
    const distY = p.y - closestY;
    return distX * distX + distY * distY < (p.r + 4) * (p.r + 4);
  }

  // Start new game
  function startGame() {
    score = 0;
    lives = MAX_LIVES;
    parcels = [];
    spawnInterval = PARCEL_SPAWN_INTERVAL;
    lastSpawn = 0;
    targetQuestion = generateQuestion();
    state = 'playing';
    lastTime = performance.now();
    particles.length = 0;
    shockwaves.length = 0;
    // ensure audio context created on user interaction
    if (!audioContext && audioAvailable) {
      initAudio();
      // resume if suspended
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
    }
    lastScoreChangeTime = performance.now();
    lastLivesChangeTime = performance.now();
  }

  // End game with win or lose
  function endGame(outcome) {
    state = outcome === 'win' ? 'win' : 'gameover';
    // stop background audio gentle hum if present (fade)
    if (backgroundNode && audioContext) {
      try {
        // graceful fade out
        backgroundNode.padGain.gain.exponentialRampToValueAtTime(
          0.0001,
          audioContext.currentTime + 0.8
        );
        // stop bell loop
        if (backgroundNode.bell && backgroundNode.bell.stopInterval) backgroundNode.bell.stopInterval();
      } catch (err) {
        console.warn('Error fading background:', err);
      }
    }
  }

  // Restart game from end screens
  function restart() {
    // restart background if audio enabled
    if (audioAvailable && audioEnabled && audioContext == null) {
      initAudio();
    }
    // if audio context exists and was faded, restore
    if (backgroundNode && audioContext && masterGain && audioEnabled) {
      try {
        backgroundNode.padGain.gain.setValueAtTime(0.04, audioContext.currentTime + 0.05);
        if (backgroundNode.bell && backgroundNode.bell.startInterval) backgroundNode.bell.startInterval();
      } catch (err) {}
    }
    startGame();
  }

  // Main update loop
  function update(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000); // clamp dt to avoid huge jumps
    lastTime = now;
    // update based on state
    if (state === 'playing') {
      // move drone with keyboard
      let move = 0;
      if (keys.ArrowLeft || keys.a || keys.A) move -= 1;
      if (keys.ArrowRight || keys.d || keys.D) move += 1;
      if (move !== 0) drone.x += move * drone.speed * dt;
      // clamp
      drone.x = Math.max(drone.width / 2 + 6, Math.min(WIDTH - drone.width / 2 - 6, drone.x));

      // spawn parcels
      lastSpawn += dt * 1000;
      if (lastSpawn > spawnInterval) {
        spawnParcel();
        lastSpawn = 0;
        // gradual difficulty increase
        if (spawnInterval > 500) spawnInterval -= 6;
      }

      // update parcels
      for (let i = parcels.length - 1; i >= 0; i--) {
        const p = parcels[i];
        // apply slight horizontal sway movement to x for natural fall (but not changing p.x drastically)
        p.swayPhase += dt * 1.2;
        p.x += Math.sin(p.swayPhase * 1.3) * dt * 6;
        p.y += p.vy * dt;
        // check collision
        if (checkCollision(p)) {
          // handle pick up
          const correct = p.value === targetQuestion.answer;
          if (correct) {
            score++;
            lastScoreChangeTime = performance.now();
            playSound('correct');
            // sparkle effect
            createSparkles(p.x, p.y - 6, { r: 120, g: 190, b: 120 });
            // update target every few corrects for variety
            if (score % 3 === 0) {
              targetQuestion = generateQuestion();
            }
            // win?
            if (score >= TARGET_CORRECT) {
              endGame('win');
            }
          } else {
            lives--;
            lastLivesChangeTime = performance.now();
            playSound('wrong');
            // shockwave effect
            createShockwave(p.x, p.y, { r: 200, g: 80, b: 80 });
            // slightly change the target question to avoid repetition
            if (Math.random() < 0.5) targetQuestion = generateQuestion();
            if (lives <= 0) {
              endGame('lose');
            }
          }
          parcels.splice(i, 1);
          continue;
        }
        // remove if off bottom
        if (p.y - p.r > HEIGHT) {
          parcels.splice(i, 1);
        }
      }

      // update particle physics (simple)
      draw(now);
      // particles updated in drawParticles
      requestAnimationFrame(update);
    } else {
      // menu or end state still animates background & particles lightly
      draw(now);
      // continue animation if menu to keep subtle motion
      if (state === 'menu') requestAnimationFrame(update);
    }
  }

  // Drawing everything
  function draw(t) {
    // clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // background
    drawBackground(t);

    // parcels
    drawParcels(t);

    // drone
    drawDrone(0, t);

    // particles
    drawParticles((performance.now() - lastTime) / 1000 || 0.016);

    // UI: score top-left, lives top-right, target top-center, instructions bottom-center
    // Score with small pulse on change
    ctx.save();
    const scorePulse = Math.max(0, 1 - (performance.now() - lastScoreChangeTime) / 450);
    const scoreScale = 1 + scorePulse * 0.08;
    ctx.translate(PADDING + 12, PADDING + 18);
    ctx.scale(scoreScale, scoreScale);
    ctx.translate(-(PADDING + 12), -(PADDING + 18));
    drawTextWithBackground(
      `Score: ${score}`,
      IMPORTANT_FONT,
      PADDING,
      PADDING + 22,
      {
        bgColor: 'rgba(255,255,255,0.92)',
        color: '#0b3d91',
        padding: 12,
        borderColor: 'rgba(10,50,120,0.08)'
      }
    );
    ctx.restore();

    // Lives top-right with pulse
    ctx.save();
    const livesPulse = Math.max(0, 1 - (performance.now() - lastLivesChangeTime) / 450);
    const livesScale = 1 + livesPulse * 0.06;
    ctx.translate(WIDTH - PADDING - 12, PADDING + 18);
    ctx.scale(livesScale, livesScale);
    ctx.translate(-(WIDTH - PADDING - 12), -(PADDING + 18));
    const livesText = `Lives: ${lives}`;
    ctx.font = IMPORTANT_FONT;
    const rightX = WIDTH - PADDING;
    drawTextWithBackground(livesText, IMPORTANT_FONT, rightX, PADDING + 22, {
      right: true,
      bgColor: 'rgba(255,255,255,0.92)',
      color: '#a11',
      padding: 12,
      borderColor: 'rgba(160,30,40,0.08)'
    });
    ctx.restore();

    // Audio indicator near top-left below score
    ctx.save();
    const audioText = audioAvailable ? (audioEnabled ? 'Audio: On' : 'Audio: Off') : 'Audio: Unavailable';
    ctx.font = SMALL_FONT;
    drawTextWithBackground(audioText, SMALL_FONT, PADDING, PADDING + 64, {
      bgColor: 'rgba(255,255,255,0.88)',
      color: '#333',
      padding: 8
    });
    ctx.restore();

    // Target question top-center
    ctx.save();
    const qText =
      state === 'playing'
        ? `Deliver parcels that equal: ${targetQuestion.a} ${targetQuestion.op} ${targetQuestion.b} = ?`
        : '';
    if (qText) {
      ctx.font = TITLE_FONT;
      const centerX = WIDTH / 2;
      drawTextWithBackground(qText, TITLE_FONT, centerX, PADDING + 30, {
        center: true,
        bgColor: 'rgba(255,255,255,0.95)',
        color: '#053',
        padding: 12,
        borderColor: 'rgba(2,80,60,0.06)'
      });
    }
    ctx.restore();

    // bottom-center instructions (non overlapping)
    ctx.save();
    ctx.font = BODY_FONT;
    const instrLines = [];
    if (state === 'menu') {
      instrLines.push('Welcome! Help the drone collect the correct parcels.');
      instrLines.push('Use ← → or A/D to move. Click or press Enter to start (enables audio).');
    } else if (state === 'playing') {
      instrLines.push('Move the drone to collect parcels with the correct number.');
      instrLines.push(
        `Goal: Collect ${TARGET_CORRECT} correct parcels. Wrong parcels: lose a life. Lives: ${MAX_LIVES}`
      );
      instrLines.push('Controls: ← → (or A/D). Press M to toggle audio. Press R to restart anytime.');
    } else if (state === 'win') {
      instrLines.push('Victory! You delivered all parcels!');
      instrLines.push('Click Restart or press R to play again.');
    } else if (state === 'gameover') {
      instrLines.push('Game Over. The drone ran out of lives.');
      instrLines.push('Click Restart or press R to try again.');
    }
    // compute combined width of multi-line block using measureText longest line
    let maxWidth = 0;
    ctx.font = BODY_FONT;
    instrLines.forEach(line => {
      const w = ctx.measureText(line).width;
      if (w > maxWidth) maxWidth = w;
    });
    const blockW = Math.max(260, maxWidth + 24);
    const lineHeight = 20;
    const blockH = instrLines.length * lineHeight + 18;
    const bx = WIDTH / 2 - blockW / 2;
    const by = HEIGHT - blockH - 14;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    roundRect(ctx, bx, by, blockW, blockH, 8, true, true);
    ctx.fillStyle = '#112';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let ty = by + 9;
    ctx.font = BODY_FONT;
    instrLines.forEach(line => {
      ctx.fillText(line, WIDTH / 2, ty);
      ty += lineHeight;
    });
    ctx.restore();

    // If menu screen, show big instructions and start button area
    if (state === 'menu') {
      ctx.save();
      const title = 'Drone Math Delivery';
      ctx.font =
        '34px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      const centerX = WIDTH / 2;
      const centerY = HEIGHT / 2 - 30;
      drawTextWithBackground(
        title,
        '34px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
        centerX,
        centerY,
        {
          center: true,
          bgColor: 'rgba(255,255,255,0.96)',
          color: '#006',
          padding: 14,
          borderColor: 'rgba(0,80,140,0.06)'
        }
      );

      // start button
      const startText = 'Click or Press Enter to Start';
      ctx.font = IMPORTANT_FONT;
      const res = drawTextWithBackground(startText, IMPORTANT_FONT, centerX, centerY + 70, {
        center: true,
        bgColor: 'rgba(10,120,180,0.12)',
        color: '#005',
        padding: 14,
        borderColor: 'rgba(0,80,140,0.06)'
      });
      // store start button area for pointer detection
      menuStartButtonRect = { x: res.rectX, y: res.rectY, w: res.rectW, h: res.rectH };
      ctx.restore();
    }

    // End screens
    if (state === 'win' || state === 'gameover') {
      ctx.save();
      ctx.globalAlpha = 0.96;
      // overlay dim
      ctx.fillStyle = 'rgba(10, 10, 20, 0.06)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 1;

      const title = state === 'win' ? 'You Win!' : 'Game Over';
      const subtitle =
        state === 'win'
          ? `You collected ${score} correct parcels.`
          : `You collected ${score} correct parcels.`;

      ctx.font =
        '36px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
      drawTextWithBackground(
        title,
        '36px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
        WIDTH / 2,
        HEIGHT / 2 - 40,
        {
          center: true,
          bgColor: 'rgba(255,255,255,0.96)',
          color: state === 'win' ? '#0a7' : '#a00',
          padding: 16,
          borderColor: 'rgba(0,0,0,0.06)'
        }
      );
      ctx.font = IMPORTANT_FONT;
      drawTextWithBackground(subtitle, IMPORTANT_FONT, WIDTH / 2, HEIGHT / 2 + 10, {
        center: true,
        bgColor: 'rgba(255,255,255,0.96)',
        color: '#123',
        padding: 12
      });
      // restart button area
      ctx.font = IMPORTANT_FONT;
      const restartText = 'Restart (Click or press R)';
      const res = drawTextWithBackground(restartText, IMPORTANT_FONT, WIDTH / 2, HEIGHT / 2 + 70, {
        center: true,
        bgColor: 'rgba(255,255,255,0.96)',
        color: '#035',
        padding: 12
      });
      menuStartButtonRect = { x: res.rectX, y: res.rectY, w: res.rectW, h: res.rectH, isRestart: true };
      ctx.restore();
    }
  }

  // Pointer/click handling: to start or restart
  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // enable audio context upon user interaction
    if (!audioContext && audioAvailable) {
      try {
        initAudio();
        // resume context if suspended (necessary in some browsers)
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
      } catch (err) {
        console.warn('Error resuming audioContext on pointerdown:', err);
      }
    }
    if (state === 'menu') {
      // start if clicked on start button or anywhere
      if (!menuStartButtonRect || pointInRect(x, y, menuStartButtonRect)) {
        startGame();
        requestAnimationFrame(update);
      }
    } else if (state === 'playing') {
      // allow clicking to toggle audio indicator when clicking audio box near top-left
      // check approximate audio box area
      if (x < 180 && y < 110) {
        toggleAudio();
      }
    } else if (state === 'win' || state === 'gameover') {
      if (menuStartButtonRect && pointInRect(x, y, menuStartButtonRect)) {
        restart();
        requestAnimationFrame(update);
      }
    }
  });

  function pointInRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // Keyboard controls
  window.addEventListener('keydown', e => {
    if (!keys[e.key]) keys[e.key] = true;
    // start game with Enter from menu
    if (state === 'menu' && (e.key === 'Enter' || e.key === ' ')) {
      // initialize audio on keypress
      if (!audioContext && audioAvailable) {
        initAudio();
        if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      }
      startGame();
      requestAnimationFrame(update);
    }
    // restart with R
    if ((state === 'gameover' || state === 'win') && (e.key === 'r' || e.key === 'R')) {
      restart();
      requestAnimationFrame(update);
    }
    // toggle audio with M
    if (e.key === 'm' || e.key === 'M') {
      toggleAudio();
    }
  });

  window.addEventListener('keyup', e => {
    keys[e.key] = false;
  });

  // Toggle audio on/off
  function toggleAudio() {
    if (!audioAvailable) return;
    audioEnabled = !audioEnabled;
    if (!audioEnabled && masterGain) {
      try {
        masterGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      } catch (err) {}
    } else if (audioEnabled && masterGain) {
      try {
        masterGain.gain.setValueAtTime(0.12, audioContext.currentTime);
      } catch (err) {}
    }
    playSound('pick');
  }

  // Start with menu drawing and instructions
  function init() {
    // Try to detect audio API support
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioAvailable = true;
      } else {
        audioAvailable = false;
      }
    } catch (err) {
      audioAvailable = false;
    }
    // initial question for menu display
    targetQuestion = generateQuestion();
    // focus container for keyboard events
    container.focus();
    lastTime = performance.now();
    // initial draw and update loop
    requestAnimationFrame(update);
  }

  // Kick off
  init();

  // Error resilience for audio context visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audioContext && audioEnabled) {
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(err => console.warn('Resume audio failed:', err));
      }
    }
  });
})();