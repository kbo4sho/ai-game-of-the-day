(function () {
  // Enhanced Drone Math Adventure (visuals & audio improvements only)
  // All visuals drawn on canvas inside element #game-of-the-day-stage.
  // No external resources. Web Audio API used for all sounds.

  // ---------- Setup and Safety ----------
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Missing container element with ID "game-of-the-day-stage".');
    return;
  }

  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Adventure. Press number keys or arrow keys and Enter to answer. Press R to restart.'
  );
  canvas.setAttribute('tabindex', '0');
  canvas.style.outline = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Canvas 2D context not available.');
    return;
  }
  ctx.imageSmoothingEnabled = true;

  // ---------- Audio Setup (Web Audio API) ----------
  let audioEnabled = true;
  let audioContext = null;
  let masterGain = null;
  let ambientNodes = null; // holds ambient oscillators and lfo
  let noiseBuffer = null;

  function tryCreateAudioContext() {
    if (audioContext) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        audioEnabled = false;
        console.warn('Web Audio API not supported.');
        return;
      }
      audioContext = new AC();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioContext.destination);

      // Create a gentle ambient pad: two oscillators through a gentle filter with LFO on filter freq
      try {
        const o1 = audioContext.createOscillator();
        const o2 = audioContext.createOscillator();
        const filter = audioContext.createBiquadFilter();
        const lfo = audioContext.createOscillator();
        const lfoGain = audioContext.createGain();
        const ambGain = audioContext.createGain();

        o1.type = 'sine';
        o1.frequency.value = 80;
        o2.type = 'triangle';
        o2.frequency.value = 120;
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        lfo.type = 'sine';
        lfo.frequency.value = 0.08; // slow sweep
        lfoGain.gain.value = 240; // modulation depth
        ambGain.gain.value = 0.0045; // low level ambient

        // Connect ambient chain
        o1.connect(filter);
        o2.connect(filter);
        filter.connect(ambGain);
        ambGain.connect(masterGain);

        // LFO modulates filter frequency
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        o1.start();
        o2.start();
        lfo.start();

        ambientNodes = { o1, o2, filter, lfo, lfoGain, ambGain };
      } catch (err) {
        console.warn('Ambient nodes failed to initialize:', err);
      }

      // Create noise buffer for "incorrect" effect
      try {
        const sampleRate = audioContext.sampleRate;
        const buffer = audioContext.createBuffer(1, sampleRate * 1.0, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
        noiseBuffer = buffer;
      } catch (err) {
        console.warn('Noise buffer creation failed:', err);
        noiseBuffer = null;
      }
    } catch (err) {
      audioEnabled = false;
      console.warn('Failed to create AudioContext:', err);
    }
  }

  // Play simple sounds using oscillators / noise
  function playSound(type) {
    if (!audioEnabled) return;
    try {
      if (!audioContext) tryCreateAudioContext();
      if (!audioContext) return;
      const now = audioContext.currentTime;

      if (type === 'correct') {
        // Pleasant chime: three notes with gentle filter envelope
        const freqs = [660, 880, 1100];
        freqs.forEach((f, i) => {
          const o = audioContext.createOscillator();
          const g = audioContext.createGain();
          const filter = audioContext.createBiquadFilter();
          o.type = i === 1 ? 'triangle' : 'sine';
          o.frequency.value = f;
          filter.type = 'lowpass';
          filter.frequency.value = 1800;
          g.gain.value = 0.0001;
          o.connect(filter);
          filter.connect(g);
          g.connect(masterGain);
          const start = now + i * 0.03;
          const dur = 0.52;
          o.start(start);
          g.gain.setValueAtTime(0.0001, start);
          g.gain.exponentialRampToValueAtTime(0.06, start + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
          filter.frequency.setValueAtTime(800, start);
          filter.frequency.exponentialRampToValueAtTime(2600, start + 0.12);
          filter.frequency.exponentialRampToValueAtTime(500, start + dur);
          o.stop(start + dur + 0.02);
        });
      } else if (type === 'incorrect') {
        // Short noise burst through bandpass for a "buzz" but controlled
        if (noiseBuffer) {
          const src = audioContext.createBufferSource();
          src.buffer = noiseBuffer;
          const g = audioContext.createGain();
          const bp = audioContext.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 300;
          bp.Q.value = 0.9;
          g.gain.value = 0.0001;
          src.connect(bp);
          bp.connect(g);
          g.connect(masterGain);
          const start = now;
          src.start(start);
          g.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
          src.stop(start + 0.32);
        } else {
          // fallback sawtooth falling pitch
          const o = audioContext.createOscillator();
          const g = audioContext.createGain();
          o.type = 'sawtooth';
          o.frequency.value = 240;
          g.gain.value = 0.0001;
          o.connect(g);
          g.connect(masterGain);
          const start = now;
          o.start(start);
          g.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
          o.frequency.exponentialRampToValueAtTime(60, start + 0.28);
          o.stop(start + 0.32);
        }
      } else if (type === 'click') {
        // Quick high click with brief pitch modulation
        const o = audioContext.createOscillator();
        const g = audioContext.createGain();
        const f = audioContext.createBiquadFilter();
        o.type = 'square';
        o.frequency.value = 1600;
        f.type = 'highpass';
        f.frequency.value = 900;
        g.gain.value = 0.0001;
        o.connect(f);
        f.connect(g);
        g.connect(masterGain);
        const start = now;
        o.start(start);
        g.gain.exponentialRampToValueAtTime(0.014, start + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
        o.stop(start + 0.13);
      }
    } catch (e) {
      console.warn('Audio play failed:', e);
      audioEnabled = false;
    }
  }

  // ---------- Game Variables (unchanged mechanics) ----------
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const UI_PADDING = 10;
  const GOAL = 10;
  const MAX_WRONG = 3;

  let score = 0;
  let wrongCount = 0;
  let gameState = 'playing'; // 'playing', 'victory', 'gameover', 'title'
  let soundVisualTimer = 0;
  let lastInteractionTime = 0;

  let question = null;
  let selectedChoice = 0;
  let anims = [];

  const drone = {
    x: 100,
    y: 200,
    targetX: 100,
    targetY: 200,
    speed: 220,
    propellerAngle: 0,
    size: 40,
  };

  let battery = null;
  const clouds = createClouds();
  const mountains = createMountains();
  const particles = []; // drone trail particles

  const ui = {
    scorePos: { x: 18, y: 24 },
    livesPos: { x: WIDTH - 18, y: 24 },
    centerTopPos: { x: WIDTH / 2, y: 24 },
    choicesArea: { y: 350, height: 110 },
    instructionPos: { x: WIDTH / 2, y: HEIGHT - 20 },
  };

  // ---------- Utilities ----------
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // ---------- Question Generation (unchanged logic) ----------
  function generateQuestion() {
    const type = Math.random() < 0.6 ? 'add' : 'sub';
    let a, b;
    if (type === 'add') {
      a = randInt(1, 12);
      b = randInt(1, 12);
    } else {
      a = randInt(5, 18);
      b = randInt(1, Math.min(8, a - 1));
    }
    const text = type === 'add' ? `${a} + ${b} = ?` : `${a} - ${b} = ?`;
    const answer = type === 'add' ? a + b : a - b;
    const choices = [];
    const correctIndex = randInt(0, 2);
    for (let i = 0; i < 3; i++) {
      if (i === correctIndex) {
        choices.push(answer);
      } else {
        let candidate;
        let tries = 0;
        do {
          const delta = randInt(-3, 3);
          candidate = answer + delta;
          tries++;
        } while ((candidate === answer || candidate < 0) && tries < 10);
        if (candidate === answer || candidate < 0) candidate = answer + (i === 0 ? 2 : -2);
        choices.push(candidate);
      }
    }
    return { text, choices, answerIndex: correctIndex };
  }

  // ---------- Background Elements ----------
  function createClouds() {
    const arr = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * WIDTH,
        y: Math.random() * 120 + 10,
        w: 80 + Math.random() * 180,
        h: 30 + Math.random() * 36,
        speed: 6 + Math.random() * 26,
        puff: Math.random() * 8 + 6,
        alpha: 0.6 + Math.random() * 0.35,
      });
    }
    return arr;
  }

  function createMountains() {
    // simple parallax mountain shapes
    const arr = [];
    for (let layer = 0; layer < 3; layer++) {
      const list = [];
      const count = 4 + layer * 2;
      for (let i = 0; i < count; i++) {
        list.push({
          x: (i / count) * (WIDTH + 200) - 100 + Math.random() * 120,
          baseY: HEIGHT - 90 - layer * 18,
          peak: 60 + layer * 30 + Math.random() * 40,
          width: 160 + Math.random() * 120,
          speed: 2 + layer,
          colorShift: layer * 12,
        });
      }
      arr.push(list);
    }
    return arr;
  }

  // ---------- Input Handling ----------
  canvas.addEventListener('keydown', (e) => {
    lastInteractionTime = Date.now();
    if (!audioContext && audioEnabled) tryCreateAudioContext();
    if (gameState === 'title') {
      if (e.key.toLowerCase() === 's' || e.key === 'Enter') {
        e.preventDefault();
        startGame();
        return;
      }
    }
    if (gameState === 'victory' || gameState === 'gameover') {
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        restartGame();
        playSound('click');
      }
      return;
    }
    if (gameState !== 'playing') return;

    if (e.key === 'ArrowLeft') {
      selectedChoice = (selectedChoice + 3 - 1) % 3;
      playSound('click');
    } else if (e.key === 'ArrowRight') {
      selectedChoice = (selectedChoice + 1) % 3;
      playSound('click');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitAnswer(selectedChoice);
    } else if (e.key >= '1' && e.key <= '3') {
      const idx = parseInt(e.key, 10) - 1;
      selectedChoice = idx;
      submitAnswer(idx);
    } else if (e.key.toLowerCase() === 'm') {
      audioEnabled = !audioEnabled;
      if (!audioEnabled && ambientNodes && ambientNodes.ambGain) {
        try {
          ambientNodes.ambGain.gain.setValueAtTime(0, audioContext.currentTime);
        } catch (e) {}
      }
      playSound('click');
    }
  });

  canvas.addEventListener('click', (e) => {
    lastInteractionTime = Date.now();
    if (!audioContext && audioEnabled) tryCreateAudioContext();
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);
    const my = (e.clientY - r.top) * (canvas.height / r.height);
    if (gameState === 'title') {
      startGame();
      playSound('click');
      return;
    }
    if (gameState === 'victory' || gameState === 'gameover') {
      if (isPointInRect(mx, my, restartButtonRect)) {
        restartGame();
        playSound('click');
      }
      return;
    }
    if (gameState !== 'playing') return;
    for (let i = 0; i < 3; i++) {
      const rect = getChoiceRect(i);
      if (isPointInRect(mx, my, rect)) {
        selectedChoice = i;
        submitAnswer(i);
        return;
      }
    }
  });

  function isPointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  // ---------- Game Logic ----------
  function startGame() {
    score = 0;
    wrongCount = 0;
    gameState = 'playing';
    selectedChoice = 0;
    question = generateQuestion();
    battery = null;
    drone.x = 100;
    drone.y = 200;
    drone.targetX = drone.x;
    drone.targetY = drone.y;
    anims.length = 0;
    particles.length = 0;
  }

  function restartGame() {
    gameState = 'playing';
    lastInteractionTime = Date.now();
    startGame();
  }

  function submitAnswer(idx) {
    if (gameState !== 'playing' || !question) return;
    const correct = idx === question.answerIndex;
    if (correct) {
      score += 1;
      playSound('correct');
      soundVisualTimer = 0.6;
      battery = {
        x: clamp(randInt(160, WIDTH - 120), 120, WIDTH - 120),
        y: clamp(randInt(100, 300), 80, 320),
        active: true,
        progress: 0,
      };
      drone.targetX = battery.x;
      drone.targetY = battery.y - 40;
      anims.push(createTwinkle(battery.x, battery.y));
    } else {
      wrongCount += 1;
      playSound('incorrect');
      soundVisualTimer = 0.4;
      anims.push(createExplosion(drone.x, drone.y));
      drone.targetX = clamp(drone.x - 60, 60, WIDTH - 60);
      drone.targetY = clamp(drone.y + 20, 80, HEIGHT - 120);
    }
    selectedChoice = 0;
    question = null;
    if (wrongCount >= MAX_WRONG) {
      setTimeout(() => {
        gameState = 'gameover';
      }, 700);
    }
  }

  // ---------- Animations Helpers ----------
  function createExplosion(x, y) {
    return { type: 'explosion', x, y, t: 0, duration: 0.7 };
  }
  function createTwinkle(x, y) {
    return { type: 'twinkle', x, y, t: 0, duration: 0.9 };
  }

  // ---------- Rendering Helpers ----------
  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawSkyGradient() {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#aee6ff');
    g.addColorStop(0.45, '#dff7ff');
    g.addColorStop(1, '#fffdf6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawSun() {
    const cx = WIDTH - 110;
    const cy = 80;
    const r = 46;
    // subtle glow
    ctx.save();
    const grad = ctx.createRadialGradient(cx, cy, 6, cx, cy, r * 2.2);
    grad.addColorStop(0, 'rgba(255,235,140,0.95)');
    grad.addColorStop(0.6, 'rgba(255,200,60,0.6)');
    grad.addColorStop(1, 'rgba(255,200,60,0.06)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
    ctx.fill();
    // core
    ctx.fillStyle = '#FFD66B';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMountains(dt) {
    // parallax rendering
    for (let layer = 0; layer < mountains.length; layer++) {
      const list = mountains[layer];
      ctx.save();
      const baseAlpha = 0.22 + layer * 0.15;
      ctx.fillStyle = `rgba(${30 + layer * 20}, ${80 + layer * 25}, ${80 + layer * 20}, ${baseAlpha})`;
      for (const m of list) {
        m.x -= (m.speed * dt) / 18;
        if (m.x + m.width < -120) m.x = WIDTH + 60;
        // draw triangle-ish mountain
        ctx.beginPath();
        const topX = m.x + m.width / 2;
        const topY = m.baseY - m.peak;
        ctx.moveTo(topX, topY);
        ctx.lineTo(m.x + m.width, m.baseY);
        ctx.lineTo(m.x, m.baseY);
        ctx.closePath();
        ctx.fill();
        // highlight ridge
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(topX + 14, topY + 20);
        ctx.lineTo(topX - 6, topY + 22);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,255,255,${0.06 + layer * 0.03})`;
        ctx.fill();
        ctx.fillStyle = `rgba(${30 + layer * 20}, ${80 + layer * 25}, ${80 + layer * 20}, ${baseAlpha})`;
      }
      ctx.restore();
    }
  }

  function drawClouds(dt) {
    ctx.save();
    for (const c of clouds) {
      c.x += (c.speed * dt) / 20;
      if (c.x - c.w > WIDTH + 50) c.x = -c.w - 60;
      // layered puffs deterministic by using sin for smoothness (avoid random per frame)
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = '#FFFFFF';
      const puffCount = Math.max(3, Math.floor(c.puff));
      for (let i = 0; i < puffCount; i++) {
        const px = c.x + (i / (puffCount - 1 || 1)) * c.w;
        const py = c.y + Math.sin((i + Date.now() / 600) / puffCount) * 4;
        ctx.beginPath();
        ctx.ellipse(px, py, c.h * (0.6 + (i / puffCount) * 0.3), c.h * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function spawnParticle(x, y) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.7 - Math.random() * 0.6,
      life: 0.8 + Math.random() * 0.6,
      t: 0,
      size: 2 + Math.random() * 3,
      color: `rgba(255, ${200 + Math.floor(Math.random() * 40)}, 80,`,
    });
    if (particles.length > 80) particles.shift();
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      const alpha = 1 - p.t / p.life;
      ctx.fillStyle = `${p.color}${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + alpha * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDrone(dt) {
    // rotate propellers
    drone.propellerAngle += dt * 12;
    // smooth easing toward target
    const dx = drone.targetX - drone.x;
    const dy = drone.targetY - drone.y;
    drone.x += dx * clamp(dt * 4.5, 0, 1);
    drone.y += dy * clamp(dt * 4.5, 0, 1);

    // create subtle engine particles
    if (Math.random() < 0.7) spawnParticle(drone.x - 6, drone.y + 8);

    ctx.save();
    ctx.translate(drone.x, drone.y);
    // drop shadow
    ctx.fillStyle = 'rgba(10,20,10,0.12)';
    ctx.beginPath();
    ctx.ellipse(2, drone.size * 0.7 + 6, drone.size * 0.9, drone.size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // drone hull with soft gradient
    const hullGrad = ctx.createLinearGradient(-drone.size, -drone.size, drone.size, drone.size);
    hullGrad.addColorStop(0, '#FFECB2');
    hullGrad.addColorStop(1, '#FFD36B');
    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = '#5B4210';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, drone.size * 1.22, drone.size * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // cockpit glass
    const glassGrad = ctx.createLinearGradient(-12, -10, 12, 10);
    glassGrad.addColorStop(0, '#CCF4FF');
    glassGrad.addColorStop(1, '#7FD6FF');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(-6, -4, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // little emblem
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.9;
    ctx.font = '10px sans-serif';
    ctx.fillText('DP', -4, 6);
    ctx.globalAlpha = 1;

    // legs
    ctx.strokeStyle = '#5B4210';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, drone.size * 0.34);
    ctx.lineTo(-26, drone.size * 0.94);
    ctx.moveTo(18, drone.size * 0.34);
    ctx.lineTo(26, drone.size * 0.94);
    ctx.stroke();

    // propellers
    ctx.save();
    ctx.rotate(drone.propellerAngle);
    for (let i = -1; i <= 1; i += 2) {
      ctx.save();
      ctx.translate(i * 26, -18);
      ctx.fillStyle = 'rgba(90,90,110,0.8)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.restore();
  }

  function drawBattery(bat, dt) {
    if (!bat) return;
    ctx.save();
    const pulse = 0.08 * Math.sin(Date.now() / 240) + 0.92;
    ctx.translate(bat.x, bat.y);
    // glow
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
    glow.addColorStop(0, `rgba(255,230,80,${0.45 * pulse})`);
    glow.addColorStop(1, 'rgba(255,230,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();

    // battery body
    ctx.fillStyle = '#FFD74B';
    ctx.strokeStyle = '#8B6A00';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, -18, -12, 36, 24, 6);
    ctx.fillStyle = '#FFF9E0';
    ctx.fillRect(-6, -8, 12, 16);
    // cap
    ctx.fillStyle = '#D3A800';
    ctx.fillRect(16, -6, 6, 12);
    // little icon '+' sign
    ctx.fillStyle = '#8B6A00';
    ctx.font = '12px sans-serif';
    ctx.fillText('+', 0 - ctx.measureText('+').width / 2, 5);

    ctx.restore();
  }

  // Choice layout
  function getChoiceRect(i) {
    const area = ui.choicesArea;
    const y = area.y + 14;
    const heights = 52;
    const gap = 18;
    const totalGap = gap * 2;
    const available = WIDTH - UI_PADDING * 2 - totalGap;
    const colW = Math.floor(available / 3);
    const x = UI_PADDING + i * (colW + gap);
    return { x, y, w: colW, h: heights };
  }

  // ---------- Main Loop ----------
  let lastTime = performance.now();
  let restartButtonRect = { x: 0, y: 0, w: 0, h: 0 };

  function update(now) {
    const dtMs = Math.min(now - lastTime, 40);
    const dt = dtMs / 1000;
    lastTime = now;

    if (soundVisualTimer > 0) soundVisualTimer = Math.max(0, soundVisualTimer - dt);

    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      if (a.t >= a.duration) anims.splice(i, 1);
    }

    if (battery && battery.active) {
      const dx = battery.x - drone.x;
      const dy = battery.y - 40 - drone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 8) {
        battery.active = false;
        anims.push({ type: 'collect', x: battery.x, y: battery.y, t: 0, duration: 0.8 });
        setTimeout(() => {
          if (score >= GOAL) {
            gameState = 'victory';
          } else if (wrongCount >= MAX_WRONG) {
            gameState = 'gameover';
          } else {
            question = generateQuestion();
          }
          battery = null;
        }, 600);
      }
    }

    // draw
    drawFrame(dt);

    requestAnimationFrame(update);
  }

  // ---------- Drawing Frame ----------
  function drawFrame(dt) {
    // background layers
    drawSkyGradient();
    drawSun();
    drawMountains(dt);
    drawClouds(dt);

    // ground
    ctx.fillStyle = '#E9FFF4';
    ctx.fillRect(0, HEIGHT - 90, WIDTH, 90);
    // textured stripes
    ctx.fillStyle = 'rgba(0,0,0,0.02)';
    for (let i = 0; i < WIDTH; i += 20) {
      ctx.fillRect(i, HEIGHT - 88 + (i % 40 === 0 ? 4 : 0), 10, 1);
    }

    // anims behind drone
    for (const a of anims) {
      if (a.type === 'explosion') drawExplosion(a);
    }

    // battery behind drone
    drawBattery(battery, dt);

    // drone and particles
    drawDrone(dt);
    drawParticles(dt);

    // anims above drone
    for (const a of anims) {
      if (a.type === 'twinkle' || a.type === 'collect') drawTwinkle(a);
    }

    // top UI
    drawTopUI();

    // choices
    drawChoicesArea();

    // instructions
    drawInstructions();

    // sound indicator
    if (soundVisualTimer > 0 || !audioEnabled) drawSoundIcon();

    // title / end overlays
    if (gameState === 'title') drawTitleScreen();
    if (gameState === 'victory') drawVictoryScreen();
    if (gameState === 'gameover') drawGameOverScreen();
  }

  // ---------- UI Drawing ----------
  function drawTopUI() {
    ctx.font = 'bold 20px sans-serif';
    const pad = 12;

    // Score
    const scoreText = `Batteries: ${score} / ${GOAL}`;
    const sw = ctx.measureText(scoreText).width;
    const sx = ui.scorePos.x;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    drawRoundedRect(ctx, sx - pad / 2, 6, sw + pad * 1.2, 36, 10);
    ctx.fillStyle = '#02394D';
    ctx.fillText(scoreText, sx + 6, ui.scorePos.y + 2);

    // Lives
    const livesText = `Errors: ${wrongCount} / ${MAX_WRONG}`;
    const lw = ctx.measureText(livesText).width;
    const rx = ui.livesPos.x;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    drawRoundedRect(ctx, rx - lw - 18, 6, lw + 14, 36, 10);
    ctx.fillStyle = '#6B0D0D';
    ctx.fillText(livesText, rx - lw - 4, ui.livesPos.y + 2);

    // center hint
    ctx.font = '18px sans-serif';
    const hintText = `Guide the drone: collect ${GOAL} batteries by answering.`;
    const hw = ctx.measureText(hintText).width;
    const hx = ui.centerTopPos.x - hw / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    drawRoundedRect(ctx, hx - 10, 6, hw + 20, 36, 10);
    ctx.fillStyle = '#003244';
    ctx.fillText(hintText, hx + 6, ui.centerTopPos.y + 2);
  }

  function drawChoicesArea() {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    drawRoundedRect(ctx, UI_PADDING - 6, ui.choicesArea.y + 2, WIDTH - (UI_PADDING - 6) * 2, ui.choicesArea.height, 14);

    // question
    ctx.font = '22px sans-serif';
    const qText = question ? question.text : '...';
    const qw = ctx.measureText(qText).width;
    const qx = WIDTH / 2 - qw / 2;
    const qy = ui.choicesArea.y - 24;
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    drawRoundedRect(ctx, qx - 12, qy - 8, qw + 24, 40, 10);
    ctx.fillStyle = '#002233';
    ctx.fillText(qText, qx, qy + 24);

    // three choice cards
    for (let i = 0; i < 3; i++) {
      const rect = getChoiceRect(i);
      ctx.font = '20px sans-serif';
      const text = question ? String(question.choices[i]) : '—';
      const label = `${i + 1}. ${text}`;
      const tw = ctx.measureText(label).width;
      const padding = 12;
      const w = Math.max(rect.w, tw + padding * 2);
      const rx = rect.x + (rect.w - w) / 2;
      const ry = rect.y;
      const rh = rect.h;
      const isSelected = i === selectedChoice && gameState === 'playing';

      // base card with soft shadow
      ctx.save();
      ctx.shadowColor = 'rgba(12,60,90,0.12)';
      ctx.shadowBlur = isSelected ? 18 : 8;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = isSelected ? '#2B6FE8' : '#FFFFFF';
      drawRoundedRect(ctx, rx, ry, w, rh, 12);
      ctx.restore();

      // outline
      ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath();
      ctx.rect(rx + 1, ry + 1, w - 2, rh - 2);
      ctx.stroke();

      // text
      ctx.fillStyle = isSelected ? '#FFFFFF' : '#003344';
      ctx.font = isSelected ? 'bold 20px sans-serif' : '20px sans-serif';
      const twreal = ctx.measureText(label).width;
      const tx = rx + (w - twreal) / 2;
      const ty = ry + rh / 2 + 7;
      ctx.fillText(label, tx, ty);

      // subtle badge on left
      ctx.beginPath();
      ctx.fillStyle = isSelected ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.04)';
      ctx.arc(rx + 18, ry + rh / 2, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // accessibility text
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#003344';
    ctx.fillText('← → to choose • Enter to confirm • 1-3 to pick • M toggle sound', UI_PADDING + 6, ui.choicesArea.y + ui.choicesArea.height - 8);
  }

  function drawInstructions() {
    ctx.save();
    ctx.font = '16px sans-serif';
    const instr = gameState === 'playing' ? 'Answer to guide the drone. Avoid mistakes!' : '';
    const w = ctx.measureText(instr).width;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    drawRoundedRect(ctx, ui.instructionPos.x - w / 2 - 12, ui.instructionPos.y - 22, w + 24, 36, 10);
    ctx.fillStyle = '#002244';
    ctx.fillText(instr, ui.instructionPos.x - w / 2, ui.instructionPos.y - 6);
    ctx.restore();
  }

  function drawSoundIcon() {
    const x = ui.scorePos.x + 6;
    const y = ui.scorePos.y + 42;
    ctx.save();
    ctx.globalAlpha = 0.95;
    // background pill
    ctx.fillStyle = audioEnabled ? '#2B6FE8' : '#777';
    drawRoundedRect(ctx, x - 6, y - 18, 120, 30, 10);

    // speaker glyph
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 2);
    ctx.lineTo(x + 18, y + 8);
    ctx.lineTo(x + 18, y - 12);
    ctx.closePath();
    ctx.fill();

    // label
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.fillText(audioEnabled ? 'Sound: On (M)' : 'Sound: Off (M)', x + 44, y + 4);

    // animated arc when sound recently played
    if (soundVisualTimer > 0 && audioEnabled) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const r = 12 + (1 - soundVisualTimer / 0.6) * 18;
      ctx.arc(x + 28, y - 2, r, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Anim Drawings ----------
  function drawExplosion(a) {
    const p = a.t / a.duration;
    if (p > 1) return;
    const alpha = 1 - p;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + p * 6;
      const r = 6 + p * 40;
      ctx.fillStyle = `rgba(255, ${120 + i * 8}, 60, ${0.9 - p * 0.9})`;
      ctx.beginPath();
      ctx.ellipse(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, 8 * (1 - p * 0.8), 6 * (1 - p * 0.8), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTwinkle(a) {
    const p = a.t / a.duration;
    if (p > 1) return;
    const size = 6 + Math.sin(p * Math.PI) * 18;
    ctx.save();
    ctx.globalAlpha = 0.9 * (1 - p);
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const rot = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + Math.cos(rot) * size, a.y + Math.sin(rot) * size);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Title and End Screens (keeps game completion logic) ----------
  function drawTitleScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const title = 'Drone Math Adventure';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#003344';
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, WIDTH / 2 - tw / 2, HEIGHT / 2 - 40);

    ctx.font = '18px sans-serif';
    const desc = 'Help your friendly drone collect batteries by answering math problems!';
    const dw = ctx.measureText(desc).width;
    ctx.fillStyle = '#002233';
    ctx.fillText(desc, WIDTH / 2 - dw / 2, HEIGHT / 2 - 8);

    ctx.font = '16px sans-serif';
    const hint = 'Press S or Enter to Start. Use 1-3, arrow keys, or click choices. R to restart after game over.';
    const hw = ctx.measureText(hint).width;
    ctx.fillText(hint, WIDTH / 2 - hw / 2, HEIGHT / 2 + 18);
    ctx.restore();
  }

  function drawVictoryScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(2, 20, 40, 0.56)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const title = 'Victory! Batteries Collected.';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#FFF9E6';
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, WIDTH / 2 - tw / 2, HEIGHT / 2 - 40);

    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#FFF';
    const msg = `You collected ${score} batteries and guided the drone safely!`;
    const mw = ctx.measureText(msg).width;
    ctx.fillText(msg, WIDTH / 2 - mw / 2, HEIGHT / 2 - 4);

    const btnText = 'Restart (R)';
    ctx.font = '18px sans-serif';
    const bw = ctx.measureText(btnText).width;
    const btnW = bw + 30;
    const btnH = 44;
    const bx = WIDTH / 2 - btnW / 2;
    const by = HEIGHT / 2 + 20;
    restartButtonRect = { x: bx, y: by, w: btnW, h: btnH };
    ctx.fillStyle = '#2B6FE8';
    drawRoundedRect(ctx, bx, by, btnW, btnH, 10);
    ctx.fillStyle = '#FFF';
    ctx.fillText(btnText, bx + (btnW - bw) / 2, by + 28);

    ctx.restore();
  }

  function drawGameOverScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(60, 0, 0, 0.6)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#FFDDD6';
    const title = 'Game Over';
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, WIDTH / 2 - tw / 2, HEIGHT / 2 - 40);

    ctx.font = '20px sans-serif';
    const msg = `You made ${wrongCount} mistakes. You collected ${score} batteries.`;
    const mw = ctx.measureText(msg).width;
    ctx.fillText(msg, WIDTH / 2 - mw / 2, HEIGHT / 2 - 4);

    const btnText = 'Try Again (R)';
    ctx.font = '18px sans-serif';
    const bw = ctx.measureText(btnText).width;
    const btnW = bw + 30;
    const btnH = 44;
    const bx = WIDTH / 2 - btnW / 2;
    const by = HEIGHT / 2 + 20;
    restartButtonRect = { x: bx, y: by, w: btnW, h: btnH };
    ctx.fillStyle = '#F2584B';
    drawRoundedRect(ctx, bx, by, btnW, btnH, 10);
    ctx.fillStyle = '#FFF';
    ctx.fillText(btnText, bx + (btnW - bw) / 2, by + 28);

    ctx.restore();
  }

  // ---------- Init and Start ----------
  function init() {
    gameState = 'title';
    question = null;
    selectedChoice = 0;
    lastTime = performance.now();
    requestAnimationFrame(update);
  }

  // First interaction to initialize audio
  let firstInteractionSet = false;
  function onFirstInteraction() {
    if (firstInteractionSet) return;
    firstInteractionSet = true;
    tryCreateAudioContext();
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
  }

  ['click', 'keydown', 'touchstart'].forEach((ev) => {
    canvas.addEventListener(ev, onFirstInteraction, { once: true, passive: true });
    window.addEventListener(ev, onFirstInteraction, { once: true, passive: true });
  });

  try {
    ctx.font = '16px sans-serif';
  } catch (e) {
    console.warn('Font setting failed:', e);
  }

  init();
})();