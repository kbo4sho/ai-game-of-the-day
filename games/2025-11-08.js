(function () {
  // Enhanced Drone Math Harvest - Visuals & Audio Upgrade
  // Renders inside element with id "game-of-the-day-stage"
  // Only visuals and audio changed. Game mechanics preserved.

  // -----------------------
  // Basic setup and safety
  // -----------------------
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear container and create canvas (exact game area)
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Drone Math Harvest. Use arrow keys to fly the drone. Collect the balloon with the correct answer. Press number keys 1-4 to choose answers.'
  );
  canvas.tabIndex = 0;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Fonts and UI
  const TITLE_FONT = 'bold 22px Verdana, sans-serif';
  const UI_FONT = 'bold 20px Verdana, sans-serif';
  const BODY_FONT = '16px Verdana, sans-serif';
  const SMALL_FONT = '14px Verdana, sans-serif';
  const UI_PADDING = 12;

  // -----------------------
  // Audio setup with safe handling
  // -----------------------
  let audioEnabled = true;
  let audioContext = null;
  let masterGain = null;
  let ambientNodes = [];
  let engineNode = null;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      audioEnabled = false;
      console.warn('Web Audio API not supported.');
    } else {
      audioContext = new AudioContext();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.07;
      masterGain.connect(audioContext.destination);

      // Create subtle layered ambient pads
      const createAmbient = (freq, type, vol) => {
        const o = audioContext.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const g = audioContext.createGain();
        g.gain.value = 0;
        o.connect(g);
        g.connect(masterGain);
        o.start();
        // gentle fade in
        const now = audioContext.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(vol, now + 1.0);
        return { o, g };
      };

      ambientNodes.push(createAmbient(120, 'sine', 0.0025));
      ambientNodes.push(createAmbient(260, 'triangle', 0.0012));
      ambientNodes.push(createAmbient(70, 'sine', 0.0018));

      // Lowpass to keep ambient warm
      const lp = audioContext.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      masterGain.disconnect();
      masterGain.connect(lp);
      lp.connect(audioContext.destination);
      masterGain.connect(lp); // safe extra connect

      // Engine hum (created but quiet until drone moves)
      const engine = audioContext.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 90;
      const engineGain = audioContext.createGain();
      engineGain.gain.value = 0.0002;
      engine.connect(engineGain);
      engineGain.connect(masterGain);
      engine.start();
      engineNode = { o: engine, g: engineGain };
    }
  } catch (err) {
    console.error('Audio context error:', err);
    audioEnabled = false;
  }

  // Helper to play an oscillator-based tone
  function playTone({ freq = 440, duration = 0.18, type = 'sine', volume = 0.12, detune = 0 }) {
    if (!audioEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      if (detune) o.detune.value = detune;
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      o.connect(g);
      g.connect(masterGain);
      o.start(now);
      g.gain.exponentialRampToValueAtTime(volume, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      o.stop(now + duration + 0.02);
    } catch (err) {
      console.warn('playTone error:', err);
    }
  }

  // Higher-fidelity correct sound (sparkle arpeggio + pleasant filter)
  function playCorrectSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const freqs = [420, 520, 660];
      freqs.forEach((f, i) => {
        const o = audioContext.createOscillator();
        o.type = i === freqs.length - 1 ? 'sine' : 'triangle';
        o.frequency.value = f;
        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now + i * 0.06);
        o.connect(g);
        // small band-pass for sparkle
        const bp = audioContext.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f * 1.1;
        bp.Q.value = 6;
        g.connect(bp);
        bp.connect(masterGain);
        o.start(now + i * 0.06);
        g.gain.exponentialRampToValueAtTime(0.12, now + i * 0.06 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.18);
        o.stop(now + i * 0.06 + 0.22);
      });
    } catch (err) {
      console.warn('playCorrectSound error:', err);
    }
  }

  // Incorrect: soft thud + low wobble
  function playIncorrectSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      // low thud
      const o1 = audioContext.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 180;
      const g1 = audioContext.createGain();
      g1.gain.setValueAtTime(0.0001, now);
      o1.connect(g1);
      g1.connect(masterGain);
      o1.start(now);
      g1.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
      g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      o1.stop(now + 0.34);

      // short noise wobble (subtle)
      const bufferSize = 2 * audioContext.sampleRate;
      const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.2;
      const noise = audioContext.createBufferSource();
      noise.buffer = noiseBuffer;
      const nf = audioContext.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 900;
      const ng = audioContext.createGain();
      ng.gain.value = 0.0001;
      noise.connect(nf);
      nf.connect(ng);
      ng.connect(masterGain);
      noise.start(now + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      noise.stop(now + 0.22);
    } catch (err) {
      console.warn('playIncorrectSound error:', err);
    }
  }

  // Balloon pop: short noise burst + tiny pitch click
  function playPopSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      // click
      const o = audioContext.createOscillator();
      o.type = 'square';
      o.frequency.value = 880;
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      o.connect(g);
      g.connect(masterGain);
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.06, now + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      o.stop(now + 0.08);

      // noise burst
      const bufferSize = Math.floor(audioContext.sampleRate * 0.09);
      const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.6;
      }
      const noise = audioContext.createBufferSource();
      noise.buffer = noiseBuffer;
      const nf = audioContext.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 1200;
      const ng = audioContext.createGain();
      ng.gain.value = 0.0001;
      noise.connect(nf);
      nf.connect(ng);
      ng.connect(masterGain);
      noise.start(now);
      ng.gain.exponentialRampToValueAtTime(0.08, now + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      noise.stop(now + 0.09);
    } catch (err) {
      console.warn('playPopSound error:', err);
    }
  }

  // UI click
  function playClick() {
    playTone({ freq: 980, duration: 0.05, type: 'sine', volume: 0.045 });
  }

  // Ensure engine node volume changes with drone speed
  function setEngineVolume(v) {
    if (!engineNode || !audioContext || !audioEnabled) return;
    try {
      const now = audioContext.currentTime;
      const target = clamp(v, 0.00015, 0.012);
      engineNode.g.gain.cancelScheduledValues(now);
      engineNode.g.gain.setValueAtTime(engineNode.g.gain.value || 0.0001, now);
      engineNode.g.gain.exponentialRampToValueAtTime(target, now + 0.12);
    } catch (err) {
      // fail silently
    }
  }

  // -----------------------
  // Game variables & state
  // -----------------------
  let keys = {};
  let mouse = { x: 0, y: 0, down: false };
  let gameState = 'menu';
  let score = 0;
  let wrong = 0;
  const MAX_SCORE = 10;
  const MAX_WRONG = 3;
  let roundQuestion = null;
  let balloons = [];
  let drone = null;
  let lastFrameTime = performance.now();
  let audioToggleRect = null;
  let showAudioMutedFlash = false;

  // Visual enhancement: particles (confetti and pops)
  const particles = [];

  // -----------------------
  // Utility helpers
  // -----------------------
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function updateAriaLabel() {
    const label = `Drone Math Harvest. Score ${score}. Wrong ${wrong}. ${gameState === 'playing' ? `Question: ${roundQuestion && roundQuestion.text ? roundQuestion.text : ''}` : gameState}. Use arrow keys to fly the drone or press keys 1 to 4 to choose answers.`;
    canvas.setAttribute('aria-label', label);
  }

  // -----------------------
  // Game logic kept intact
  // -----------------------
  function createQuestion() {
    const op = Math.random() < 0.6 ? '+' : '-';
    let a, b;
    if (op === '+') {
      a = randInt(1, 12);
      b = randInt(1, 12);
    } else {
      a = randInt(5, 15);
      b = randInt(1, a - 1);
    }
    const answer = op === '+' ? a + b : a - b;
    const text = `${a} ${op} ${b} = ?`;
    return { a, b, op, answer, text };
  }

  function spawnBalloonsForQuestion(q) {
    balloons = [];
    const correctIndex = randInt(0, 3);
    const answers = new Set([q.answer]);
    for (let i = 0; i < 4; i++) {
      let val;
      if (i === correctIndex) val = q.answer;
      else {
        do {
          const delta = randInt(-6, 6);
          val = q.answer + delta;
        } while (val < 0 || answers.has(val));
        answers.add(val);
      }
      const marginX = 80;
      const marginY = 90;
      const x = marginX + i * ((canvas.width - marginX * 2) / 4) + randInt(-18, 18);
      const y = randInt(120, 300) + (i % 2 === 0 ? -20 : 20);
      const radius = 34;
      const color = `hsl(${randInt(160, 320)} ${randInt(45, 75)}% ${randInt(46, 68)}%)`;
      const vy = randInt(-8, 8) / 100 + (i % 2 === 0 ? -0.12 : -0.04);
      balloons.push({
        x,
        y,
        vy,
        radius,
        value: val,
        color,
        id: i + 1,
        floatingOffset: Math.random() * Math.PI * 2,
        popped: false,
        popTimer: 0
      });
    }
  }

  function resetDrone() {
    drone = {
      x: canvas.width / 2,
      y: canvas.height - 80,
      vx: 0,
      vy: 0,
      speed: 2.6,
      radius: 22,
      tilt: 0
    };
  }

  function startGame() {
    score = 0;
    wrong = 0;
    gameState = 'playing';
    roundQuestion = createQuestion();
    spawnBalloonsForQuestion(roundQuestion);
    resetDrone();
    updateAriaLabel();
    playClick();
  }

  function endGame(victory) {
    gameState = victory ? 'victory' : 'gameover';
    updateAriaLabel();
    playClick();
  }

  function checkCollisions() {
    for (let i = 0; i < balloons.length; i++) {
      const b = balloons[i];
      if (b.popped) continue;
      const dx = b.x - drone.x;
      const dy = b.y - drone.y;
      const distSq = dx * dx + dy * dy;
      const minDist = b.radius + drone.radius;
      if (distSq <= minDist * minDist) {
        handleBalloonCollected(b);
        return;
      }
    }
  }

  function spawnPopParticles(x, y, color, count = 12, strong = false) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(0.6, strong ? 3.2 : 1.6);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(0.5, 1.5),
        life: rand(600, 1200),
        size: rand(2, 6),
        color,
        created: performance.now()
      });
    }
  }

  function handleBalloonCollected(b) {
    if (!b || b.popped) return;
    const isCorrect = b.value === roundQuestion.answer;
    // Visual & audio responses
    b.popped = true;
    b.popTimer = performance.now();
    spawnPopParticles(b.x, b.y, b.color, isCorrect ? 18 : 9, isCorrect);
    playPopSound();
    if (isCorrect) {
      score += 1;
      playCorrectSound();
      // additional confetti burst
      spawnPopParticles(b.x, b.y - 10, '#ffd24d', 14, true);
    } else {
      wrong += 1;
      playIncorrectSound();
    }

    // Remove balloon immediately from play area to keep mechanics intact
    balloons = balloons.filter(bb => bb !== b);

    // preserve existing flow: next question or end after short delay
    setTimeout(() => {
      if (score >= MAX_SCORE) {
        endGame(true);
        return;
      }
      if (wrong >= MAX_WRONG) {
        endGame(false);
        return;
      }
      roundQuestion = createQuestion();
      spawnBalloonsForQuestion(roundQuestion);
      updateAriaLabel();
    }, 220);
  }

  // Keyboard selection fallback
  function selectAnswerByIndex(index) {
    const b = balloons[index];
    if (b) handleBalloonCollected(b);
  }

  // -----------------------
  // Input handling
  // -----------------------
  canvas.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    if (gameState === 'playing') {
      if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key, 10) - 1;
        selectAnswerByIndex(idx);
      } else if (e.key === 'Enter') {
        if (balloons.length > 0) {
          let closest = balloons[0];
          let bestDist = Infinity;
          for (const b of balloons) {
            const d = (b.x - drone.x) ** 2 + (b.y - drone.y) ** 2;
            if (d < bestDist) {
              bestDist = d;
              closest = b;
            }
          }
          handleBalloonCollected(closest);
        }
      } else if (e.key === 'm') {
        toggleAudio();
      }
    } else {
      if (e.key === 'Enter' || e.key === ' ') {
        startGame();
      }
    }
  });
  canvas.addEventListener('keyup', e => {
    delete keys[e.key];
  });

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  });

  canvas.addEventListener('mousedown', () => {
    mouse.down = true;
    if (audioToggleRect && pointInRect(mouse.x, mouse.y, audioToggleRect)) {
      toggleAudio();
      return;
    }
    if (gameState === 'gameover' || gameState === 'victory') {
      const btn = getEndScreenButtonRect();
      if (pointInRect(mouse.x, mouse.y, btn)) {
        startGame();
        return;
      }
    }
    if (gameState === 'playing') {
      for (let i = 0; i < balloons.length; i++) {
        const b = balloons[i];
        const dx = mouse.x - b.x;
        const dy = mouse.y - b.y;
        if (dx * dx + dy * dy <= b.radius * b.radius) {
          handleBalloonCollected(b);
          return;
        }
      }
    }
  });
  canvas.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  function pointInRect(px, py, rect) {
    if (!rect) return false;
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  function toggleAudio() {
    if (!audioContext) {
      audioEnabled = false;
      showAudioMutedFlash = true;
      setTimeout(() => (showAudioMutedFlash = false), 600);
      return;
    }
    if (audioContext.state === 'suspended') {
      audioContext
        .resume()
        .then(() => {
          audioEnabled = true;
          showAudioMutedFlash = true;
          setTimeout(() => (showAudioMutedFlash = false), 400);
        })
        .catch(() => {
          audioEnabled = false;
        });
    } else {
      audioContext
        .suspend()
        .then(() => {
          audioEnabled = false;
          showAudioMutedFlash = true;
          setTimeout(() => (showAudioMutedFlash = false), 400);
        })
        .catch(() => {
          audioEnabled = false;
        });
    }
    playClick();
  }

  // -----------------------
  // Drawing utilities & visuals
  // -----------------------
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

  // Parallax background with layered hills, animated sun rays and slow particles
  const bgParticles = [];
  for (let i = 0; i < 14; i++) {
    bgParticles.push({
      x: rand(0, canvas.width),
      y: rand(40, 160),
      size: rand(1, 2.6),
      speed: rand(0.02, 0.08),
      hue: rand(190, 230)
    });
  }

  function drawBackground(t) {
    // Soft vertical gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#e9fbff');
    g.addColorStop(0.5, '#dff6ff');
    g.addColorStop(1, '#e8f7ef');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // sun with rotating subtle rays
    const sunX = 90;
    const sunY = 72;
    const sunR = 38;
    ctx.save();
    ctx.translate(sunX, sunY);
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < 8; i++) {
      ctx.rotate((Math.PI * 2) / 8);
      ctx.fillStyle = `rgba(255, 241, 160, ${0.06 + i * 0.01})`;
      ctx.beginPath();
      ctx.ellipse(sunR + 8, 0, 32, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff7c8';
    ctx.beginPath();
    ctx.arc(0, 0, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    // floating dust-like soft particles (parallax)
    for (const p of bgParticles) {
      p.x += p.speed * Math.cos(t / 9000 + p.size) * 0.8;
      p.y += p.speed * Math.sin(t / 6000 + p.size) * 0.4;
      if (p.x < -20) p.x = canvas.width + 20;
      if (p.x > canvas.width + 20) p.x = -20;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, 0.12)`;
      ctx.ellipse(p.x, p.y, p.size * 4, p.size * 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // layered rolling hills with richer colors
    ctx.fillStyle = '#c7ebd3';
    ctx.beginPath();
    ctx.moveTo(0, 330);
    ctx.quadraticCurveTo(140, 300, 260, 340);
    ctx.quadraticCurveTo(380, 380, 520, 338);
    ctx.quadraticCurveTo(640, 300, 720, 332);
    ctx.lineTo(720, 480);
    ctx.lineTo(0, 480);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#b6e6c1';
    ctx.beginPath();
    ctx.moveTo(0, 350);
    ctx.quadraticCurveTo(120, 320, 240, 352);
    ctx.quadraticCurveTo(360, 384, 480, 346);
    ctx.quadraticCurveTo(600, 308, 720, 350);
    ctx.lineTo(720, 480);
    ctx.lineTo(0, 480);
    ctx.closePath();
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // stylized cloud drawing
  function drawCloud(cx, cy, s, tOffset = 0) {
    ctx.save();
    ctx.translate(cx + Math.sin(tOffset) * 10, cy + Math.cos(tOffset) * 4);
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.ellipse(-s * 0.6, 0, s * 0.6, s * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -s * 0.12, s * 0.8, s * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.6, 0, s * 0.6, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // draw drone with soft lighting and dynamic prop glow
  function drawDrone(dr, time) {
    const x = dr.x;
    const y = dr.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dr.tilt * 0.018);
    // subtle shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(10,20,30,0.14)';
    ctx.ellipse(0, 36, dr.radius * 1.6, dr.radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // body base
    ctx.beginPath();
    const bodyGrad = ctx.createLinearGradient(-28, -30, 28, 12);
    bodyGrad.addColorStop(0, '#58b4ef');
    bodyGrad.addColorStop(1, '#1d78c9');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#083e6d';
    ctx.lineWidth = 1.6;
    ctx.moveTo(-34, -6);
    ctx.quadraticCurveTo(0, -46, 34, -6);
    ctx.quadraticCurveTo(2, 12, -34, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // cockpit window with rim
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.ellipse(-4, -6, 12, 9, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#bfeeff';
    ctx.ellipse(-4, -6, 9, 6, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.stroke();

    // side wing decals
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.moveTo(-20, -6);
    ctx.quadraticCurveTo(0, 0, 20, -6);
    ctx.lineTo(18, -2);
    ctx.quadraticCurveTo(0, 2, -18, -2);
    ctx.closePath();
    ctx.fill();

    // propellers with soft glow
    for (let side = -1; side <= 1; side += 2) {
      const px = side * 28;
      const py = -14;
      const angle = (time / 80) * (side === -1 ? 1 : -1);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      // glow
      ctx.beginPath();
      ctx.fillStyle = 'rgba(180,230,255,0.12)';
      ctx.ellipse(0, 0, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // blades
      ctx.fillStyle = 'rgba(10,10,10,0.22)';
      ctx.fillRect(-22, -3, 44, 6);
      ctx.restore();
    }

    // small antenna
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1.2;
    ctx.moveTo(16, -28);
    ctx.lineTo(18, -38);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = '#ffd350';
    ctx.arc(18, -40, 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // draw balloons with enhanced lighting and soft shadows
  function drawBalloons(balloonsArr, time) {
    for (const b of balloonsArr) {
      if (b.popped) continue;
      const floaty = Math.sin((time / 640) + b.floatingOffset) * 5;
      const bx = b.x;
      const by = b.y + floaty;
      // string with subtle curve
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(20,20,20,0.08)';
      ctx.lineWidth = 2;
      ctx.moveTo(bx, by + b.radius - 2);
      ctx.quadraticCurveTo(bx + 10, by + b.radius + 18, bx + 4, by + b.radius + 30);
      ctx.stroke();

      // balloon body: gradient
      ctx.beginPath();
      const grad = ctx.createLinearGradient(bx - b.radius, by - b.radius, bx + b.radius, by + b.radius);
      grad.addColorStop(0, shadeColor(b.color, 12));
      grad.addColorStop(1, shadeColor(b.color, -8));
      ctx.fillStyle = grad;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.ellipse(bx, by, b.radius, b.radius * 1.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // little glossy highlight
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.ellipse(bx - b.radius * 0.26, by - b.radius * 0.36, b.radius * 0.28, b.radius * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      // value label
      ctx.font = 'bold 18px Verdana, sans-serif';
      ctx.fillStyle = '#07324b';
      const text = String(b.value);
      const metrics = ctx.measureText(text);
      ctx.fillText(text, bx - metrics.width / 2, by + 6);

      // index small
      ctx.font = SMALL_FONT;
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      const idxText = `(${b.id})`;
      const idxW = ctx.measureText(idxText).width;
      ctx.fillText(idxText, bx - idxW / 2, by + b.radius * 1.5 + 8);
    }
  }

  // small helper to darken or lighten an hsl color string approximation
  function shadeColor(hslString, percent) {
    // expect input like "hsl(H S% L%)"
    try {
      const m = hslString.match(/hsl\((\d+)\s+([\d.]+)%\s+([\d.]+)%\)/);
      if (!m) return hslString;
      const h = parseInt(m[1], 10);
      const s = parseFloat(m[2]);
      let l = parseFloat(m[3]);
      l = clamp(l + percent / 10, 20, 85);
      return `hsl(${h} ${s}% ${l}%)`;
    } catch {
      return hslString;
    }
  }

  function drawUI() {
    // Score box top-left with soft shadow
    ctx.font = UI_FONT;
    ctx.textBaseline = 'top';
    const scoreText = `Score: ${score}/${MAX_SCORE}`;
    const scW = ctx.measureText(scoreText).width;
    const scRect = { x: UI_PADDING, y: UI_PADDING, w: scW + 20, h: 38 };
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 8;
    drawRoundedRect(scRect.x, scRect.y, scRect.w, scRect.h, 10, 'rgba(255,255,255,0.96)', 'rgba(0,0,0,0.06)');
    ctx.restore();
    ctx.fillStyle = '#083e6d';
    ctx.fillText(scoreText, scRect.x + 10, scRect.y + 6);

    // Lives top-right
    ctx.font = UI_FONT;
    const livesText = `Lives left: ${Math.max(0, MAX_WRONG - wrong)}`;
    const lvW = ctx.measureText(livesText).width;
    const lvRect = { x: canvas.width - lvW - UI_PADDING - 48, y: UI_PADDING, w: lvW + 20, h: 38 };
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 8;
    drawRoundedRect(lvRect.x, lvRect.y, lvRect.w, lvRect.h, 10, 'rgba(255,255,255,0.96)', 'rgba(0,0,0,0.06)');
    ctx.restore();
    ctx.fillStyle = '#083e6d';
    ctx.fillText(livesText, lvRect.x + 10, lvRect.y + 6);

    // Audio toggle near top-right
    const audSize = 34;
    const audX = lvRect.x - audSize - 10;
    const audY = UI_PADDING + (38 - audSize) / 2;
    audioToggleRect = { x: audX, y: audY, w: audSize, h: audSize };
    drawRoundedRect(audX, audY, audSize, audSize, 8, audioEnabled ? 'rgba(220,255,220,0.96)' : 'rgba(255,220,220,0.96)', 'rgba(0,0,0,0.06)');
    ctx.font = 'bold 14px Verdana, sans-serif';
    ctx.fillStyle = audioEnabled ? '#04621a' : '#7b0000';
    const spText = audioEnabled ? 'ON' : 'OFF';
    const spW = ctx.measureText(spText).width;
    ctx.fillText(spText, audX + (audSize - spW) / 2, audY + 8);

    // small audio hint
    if (!audioEnabled || showAudioMutedFlash) {
      ctx.font = SMALL_FONT;
      ctx.fillStyle = showAudioMutedFlash ? '#ff7a00' : '#8b0000';
      const hint = audioEnabled ? 'Audio on' : 'Audio off (press M)';
      const w = ctx.measureText(hint).width;
      const hx = canvas.width - w - UI_PADDING - 6;
      const hy = UI_PADDING + 38 + 8;
      drawRoundedRect(hx - 6, hy - 4, w + 12, 26, 8, 'rgba(255,255,255,0.96)', 'rgba(0,0,0,0.06)');
      ctx.fillText(hint, hx, hy);
    }
  }

  function drawInstructions() {
    ctx.font = BODY_FONT;
    ctx.textBaseline = 'top';
    const lines = [
      'Fly the friendly drone to the balloon that shows the correct answer.',
      'Use arrow keys or W/A/S/D to move. Press 1-4 to pick an answer, or click a balloon.',
      `Goal: collect ${MAX_SCORE} correct balloons. Lose after ${MAX_WRONG} wrong ones.`,
      'Press M to toggle audio. Press Enter to start / restart.'
    ];
    let maxW = 0;
    for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const rectW = maxW + 20;
    const rectH = lines.length * 22 + 18;
    const rectX = (canvas.width - rectW) / 2;
    const rectY = canvas.height - rectH - UI_PADDING;
    drawRoundedRect(rectX, rectY, rectW, rectH, 12, 'rgba(255,255,255,0.98)', 'rgba(0,0,0,0.04)');
    ctx.fillStyle = '#083e6d';
    let y = rectY + 8;
    for (const l of lines) {
      ctx.fillText(l, rectX + 10, y);
      y += 22;
    }
  }

  function getEndScreenButtonRect() {
    const w = 240;
    const h = 50;
    return { x: (canvas.width - w) / 2, y: canvas.height - 120, w, h };
  }

  function drawEndScreen() {
    ctx.fillStyle = 'rgba(10, 22, 28, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const title = gameState === 'victory' ? 'Mission Complete!' : 'Game Over';
    const subtitle = gameState === 'victory' ? `You collected ${score} correct balloons!` : `You made ${wrong} wrong picks. Score: ${score}`;

    ctx.font = TITLE_FONT;
    ctx.textBaseline = 'top';
    const tW = ctx.measureText(title).width;
    const titleX = (canvas.width - tW) / 2;
    const titleY = 120;
    drawRoundedRect(titleX - 18, titleY - 14, tW + 36, 56, 14, 'rgba(255,255,255,0.98)', 'rgba(0,0,0,0.06)');
    ctx.fillStyle = '#05314b';
    ctx.fillText(title, titleX, titleY);

    ctx.font = BODY_FONT;
    const subW = ctx.measureText(subtitle).width;
    const subX = (canvas.width - subW) / 2;
    const subY = titleY + 62;
    drawRoundedRect(subX - 14, subY - 8, subW + 28, 44, 10, 'rgba(255,255,255,0.98)', 'rgba(0,0,0,0.04)');
    ctx.fillStyle = '#07324b';
    ctx.fillText(subtitle, subX, subY);

    const btn = getEndScreenButtonRect();
    drawRoundedRect(btn.x, btn.y, btn.w, btn.h, 12, 'rgba(255,255,255,0.98)', 'rgba(0,0,0,0.06)');
    ctx.font = UI_FONT;
    ctx.fillStyle = '#0b67a6';
    const btText = 'Play Again (Enter)';
    const btW = ctx.measureText(btText).width;
    ctx.fillText(btText, btn.x + (btn.w - btW) / 2, btn.y + 10);
  }

  function drawQuestionPanel() {
    ctx.font = 'bold 20px Verdana, sans-serif';
    const qText = roundQuestion ? roundQuestion.text : '';
    const qW = ctx.measureText(qText).width;
    const boxW = qW + 48;
    const boxH = 48;
    const boxX = (canvas.width - boxW) / 2;
    const boxY = 18 + 38;
    drawRoundedRect(boxX, boxY, boxW, boxH, 12, 'rgba(255,255,255,0.98)', 'rgba(0,0,0,0.04)');
    ctx.fillStyle = '#07324b';
    ctx.fillText(qText, boxX + 22, boxY + 12);
    ctx.font = SMALL_FONT;
    const hint = 'Press 1-4 or fly to the correct balloon';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const hintW = ctx.measureText(hint).width;
    ctx.fillText(hint, (canvas.width - hintW) / 2, boxY + boxH + 6);
  }

  // -----------------------
  // Particle updates & drawing
  // -----------------------
  function updateParticles(dt) {
    const now = performance.now();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.created;
      if (age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      // simple physics, gentle gravity and drag
      p.vy += 0.025 * (dt / 16.67);
      p.vx *= 0.995;
      p.vy *= 0.998;
      p.x += p.vx * (dt / 16.67);
      p.y += p.vy * (dt / 16.67);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const age = (performance.now() - p.created) / p.life;
      const alpha = 1 - age;
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha * 0.95;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // -----------------------
  // Game update & render loop
  // -----------------------
  function update(dt, t) {
    if (gameState !== 'playing') return;

    // Controls
    const moveLeft = keys.ArrowLeft || keys.a || keys.A;
    const moveRight = keys.ArrowRight || keys.d || keys.D;
    const moveUp = keys.ArrowUp || keys.w || keys.W;
    const moveDown = keys.ArrowDown || keys.s || keys.S;

    const acc = 0.12;
    if (moveLeft) drone.vx -= acc;
    if (moveRight) drone.vx += acc;
    if (moveUp) drone.vy -= acc;
    if (moveDown) drone.vy += acc;

    drone.vx *= 0.96;
    drone.vy *= 0.96;
    drone.vx = clamp(drone.vx, -drone.speed, drone.speed);
    drone.vy = clamp(drone.vy, -drone.speed, drone.speed);

    drone.x += drone.vx * dt;
    drone.y += drone.vy * dt;

    drone.x = clamp(drone.x, 30, canvas.width - 30);
    drone.y = clamp(drone.y, 80, canvas.height - 40);

    drone.tilt = drone.vx * 14;

    // engine sound volume based on speed magnitude
    const speedMag = Math.min(1, Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy) / drone.speed);
    setEngineVolume(0.0005 + speedMag * 0.011);

    // Balloons floating and small drift
    for (const b of balloons) {
      b.floatingOffset += dt * 0.001;
      b.y += b.vy * dt;
      b.x += Math.sin((t + b.x) / 4200) * 0.32;
      if (b.x < 40) b.x = 40;
      if (b.x > canvas.width - 40) b.x = canvas.width - 40;
      if (b.y < 90) b.y = 90;
      if (b.y > canvas.height - 120) b.y = canvas.height - 120;
    }

    // update particles
    updateParticles(dt);

    // collisions
    checkCollisions();
  }

  function render(t) {
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background
    drawBackground(t);
    // some clouds parallax
    drawCloud(160 + Math.sin(t / 4000) * 30, 70, 40, t / 280);
    drawCloud(360 + Math.cos(t / 5000) * 40, 50, 48, t / 220);
    drawCloud(560 + Math.sin(t / 4200) * 28, 88, 36, t / 260);

    // balloons
    drawBalloons(balloons, t);
    // drone
    if (drone) drawDrone(drone, t);

    // particles above drone & balloons
    drawParticles();

    // UI and question
    drawUI();
    if (gameState === 'playing') drawQuestionPanel();
    drawInstructions();

    // End screen overlay
    if (gameState === 'gameover' || gameState === 'victory') drawEndScreen();
    // Menu overlay
    if (gameState === 'menu') drawMenuOverlay(t);
  }

  // Slightly improved menu overlay
  function drawMenuOverlay(t) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    drawRoundedRect(72, 72, canvas.width - 144, canvas.height - 144, 14, 'rgba(255,255,255,0.98)', 'rgba(0,0,0,0.04)');
    ctx.restore();

    ctx.font = 'bold 28px Verdana, sans-serif';
    ctx.fillStyle = '#0a3c57';
    const title = 'Drone Math Harvest';
    const w = ctx.measureText(title).width;
    ctx.fillText(title, (canvas.width - w) / 2, 110);

    ctx.font = '18px Verdana, sans-serif';
    ctx.fillStyle = '#07324b';
    const lines = [
      'Help the friendly drone collect the balloon with the correct answer.',
      'Use arrow keys or W/A/S/D to move. Press 1-4 to choose answers.',
      `Goal: collect ${MAX_SCORE} correct balloons. Lose after ${MAX_WRONG} wrong picks.`,
      'Click anywhere or press Enter to start.'
    ];
    let y = 170;
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      ctx.fillText(line, (canvas.width - lw) / 2, y);
      y += 28;
    }

    ctx.font = '16px Verdana, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const hint = 'Tip: keyboard selection (1-4) is a helpful accessible option!';
    const hw = ctx.measureText(hint).width;
    ctx.fillText(hint, (canvas.width - hw) / 2, y + 16);
  }

  function loop(now) {
    const dt = Math.min(50, now - lastFrameTime);
    update(dt / 16.67, now);
    render(now);
    lastFrameTime = now;
    requestAnimationFrame(loop);
  }

  // -----------------------
  // Initialization
  // -----------------------
  function init() {
    canvas.focus();
    gameState = 'menu';
    score = 0;
    wrong = 0;
    roundQuestion = createQuestion();
    spawnBalloonsForQuestion(roundQuestion);
    resetDrone();
    requestAnimationFrame(loop);
    render(performance.now());
  }

  // Start on click in menu
  canvas.addEventListener('click', () => {
    if (gameState === 'menu') startGame();
  });

  // Error safe init
  try {
    init();
  } catch (err) {
    console.error('Game initialization error:', err);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = TITLE_FONT;
    ctx.fillStyle = '#000';
    ctx.fillText('An error occurred starting the game.', 20, 40);
  }

  // Keep aria label updated
  setInterval(updateAriaLabel, 1200);

  // small helper clamp exposed internally
  function clampVal(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // Keep functions accessible in this scope
  window.__droneMathHarvestDebug = {
    canvas,
    ctx,
    getParticles: () => particles.slice(),
    setAudioEnabled: enabled => {
      if (!audioContext) return;
      if (enabled) audioContext.resume().then(() => { audioEnabled = true; }).catch(() => {});
      else audioContext.suspend().then(() => { audioEnabled = false; }).catch(() => {});
    }
  };
})();