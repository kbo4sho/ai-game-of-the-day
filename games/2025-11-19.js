(function () {
  // Enhanced Educational Math Drone Game (visuals + audio improvements only)
  // Renders inside element with id "game-of-the-day-stage"
  // Canvas size: 720x480. All visuals via Canvas API. Sounds via Web Audio API.
  // Game mechanics and math logic preserved.
  // Author: AI assistant (visual/audio improvements)

  // Config
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 10;
  const GOAL_CORRECT = 10;
  const MAX_LIVES = 3;
  const FONT_BODY = '16px "Segoe UI", Roboto, Arial, sans-serif';
  const FONT_LARGE = '22px "Segoe UI", Roboto, Arial, sans-serif';
  const FONT_TITLE = '28px "Segoe UI", Roboto, Arial, sans-serif';

  // Get container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with id "game-of-the-day-stage" not found.');
    return;
  }

  // Clear container and set attributes
  container.innerHTML = '';
  container.style.position = 'relative';
  container.setAttribute('aria-label', 'Drone math game');
  container.setAttribute('role', 'application');

  // Accessible live region for screen readers (offscreen)
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.top = 'auto';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  container.appendChild(liveRegion);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = 'block';
  canvas.style.background = 'transparent';
  canvas.tabIndex = 0;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Canvas 2D context not available.');
    return;
  }

  // Game state (mechanics preserved)
  let score = 0;
  let lives = MAX_LIVES;
  let currentQuestion = null;
  let selectedOptionIndex = 0;
  let gameState = 'intro'; // intro, playing, victory, gameover, waiting
  let audioAllowed = false;
  let audioError = null;

  // Audio variables (improved ambient + effects)
  let audioCtx = null;
  let masterGain = null;
  let ambientGain = null;
  let ambientNodes = []; // hold oscillators + filter for cleanup
  let soundEnabled = true;
  let lastUserGesture = false;

  // Layout
  const topBarHeight = 60;
  const bottomBarHeight = 70;
  const centerArea = {
    x: PADDING,
    y: topBarHeight + PADDING,
    width: WIDTH - 2 * PADDING,
    height: HEIGHT - topBarHeight - bottomBarHeight - 2 * PADDING
  };

  let optionButtons = [];
  let starParticles = [];
  let confettiParticles = [];

  // Animated elements
  const clouds = [
    { x: 50, y: 40, scale: 1.0, speed: 0.12 },
    { x: 300, y: 22, scale: 1.25, speed: 0.08 },
    { x: 600, y: 60, scale: 0.95, speed: 0.1 }
  ];
  const birds = [
    { x: -40, y: 90, speed: 0.9, wobble: 0 },
    { x: -240, y: 130, speed: 0.6, wobble: 0.8 }
  ];
  let rotorAngle = 0;

  // Timing
  let lastTime = performance.now();

  // Helper random
  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Audio initialization with better ambient pad and gentle motion
  function initAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        audioError = 'Web Audio API not supported';
        console.warn(audioError);
        audioAllowed = false;
        return;
      }
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioCtx.destination);

      // Ambient pad: two detuned oscillators -> lowpass filter -> slow tremolo
      const padOscA = audioCtx.createOscillator();
      const padOscB = audioCtx.createOscillator();
      padOscA.type = 'sine';
      padOscB.type = 'sine';
      padOscA.frequency.value = 110; // low A
      padOscB.frequency.value = 116; // slight detune
      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.02; // gentle
      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 800;
      // tremolo LFO
      const trem = audioCtx.createOscillator();
      const tremGain = audioCtx.createGain();
      trem.type = 'sine';
      trem.frequency.value = 0.15;
      tremGain.gain.value = 0.005; // small modulation depth
      trem.connect(tremGain);
      tremGain.connect(padGain.gain);

      padOscA.connect(padFilter);
      padOscB.connect(padFilter);
      padFilter.connect(padGain);
      padGain.connect(masterGain);

      padOscA.start();
      padOscB.start();
      trem.start();

      ambientNodes.push(padOscA, padOscB, trem, padGain, padFilter);

      // Subtle environmental hum (low sine)
      const hum = audioCtx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 60;
      const humGain = audioCtx.createGain();
      humGain.gain.value = 0.01;
      hum.connect(humGain);
      humGain.connect(masterGain);
      hum.start();
      ambientNodes.push(hum, humGain);

      audioAllowed = true;
      audioError = null;
    } catch (e) {
      audioAllowed = false;
      audioError = 'Audio context error: ' + (e && e.message ? e.message : String(e));
      console.warn(audioError);
    }
  }

  // Subtle collect chime (pleasant harmonic)
  function playCollectChime() {
    if (!audioAllowed || !audioCtx || !soundEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [880, 1100, 1320]; // pleasant partials
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(masterGain);
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const flt = audioCtx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 1400 + i * 200;
        o.connect(flt);
        flt.connect(gainNode);
        o.start(now + i * 0.02);
        o.stop(now + 0.5 + i * 0.02);
      });

      // small sparkle noise burst
      const bufferSize = audioCtx.sampleRate * 0.12;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize / 6));
      }
      const nb = audioCtx.createBufferSource();
      nb.buffer = noiseBuffer;
      const nf = audioCtx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 900;
      const ng = audioCtx.createGain();
      ng.gain.value = 0.0001;
      ng.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      nb.connect(nf);
      nf.connect(ng);
      ng.connect(masterGain);
      nb.start(now);
      nb.stop(now + 0.14);
    } catch (e) {
      console.warn('playCollectChime error', e);
    }
  }

  // Soft incorrect tone (gentle dissonant wobble)
  function playIncorrectTone() {
    if (!audioAllowed || !audioCtx || !soundEnabled) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = 220;
      f.type = 'highpass';
      f.frequency.value = 300;
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      o.start(now);
      o.stop(now + 0.45);
    } catch (e) {
      console.warn('playIncorrectTone error', e);
    }
  }

  // Backwards-compatible playFeedback wrapper (keeps original calls)
  function playFeedback(type = 'correct') {
    if (type === 'correct') {
      playCollectChime();
    } else {
      playIncorrectTone();
    }
  }

  // Announce to screen reader
  function announce(text) {
    liveRegion.textContent = '';
    setTimeout(() => {
      liveRegion.textContent = text;
    }, 50);
  }

  // Generate question logic preserved
  function generateQuestion() {
    const types = ['add', 'sub', 'mul'];
    const t = types[Math.floor(Math.random() * types.length)];
    let a, b, answer;
    if (t === 'add') {
      a = rand(1, 20);
      b = rand(1, 20);
      answer = a + b;
      return formatQuestion(`${a} + ${b} = ?`, answer);
    } else if (t === 'sub') {
      a = rand(5, 25);
      b = rand(1, a);
      answer = a - b;
      return formatQuestion(`${a} - ${b} = ?`, answer);
    } else {
      a = rand(2, 7);
      b = rand(2, 7);
      answer = a * b;
      return formatQuestion(`${a} × ${b} = ?`, answer);
    }
  }

  function formatQuestion(text, answer) {
    const options = [];
    options.push(answer);
    while (options.length < 4) {
      let delta = rand(-6, 6);
      if (delta === 0) delta = 1;
      let val = answer + delta;
      if (val < 0) val = Math.abs(val) + 1;
      if (!options.includes(val)) options.push(val);
    }
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return { text, answer, options };
  }

  // Start / restart game
  function startGame() {
    score = 0;
    lives = MAX_LIVES;
    selectedOptionIndex = 0;
    gameState = 'playing';
    nextQuestion();
    announce(
      'Game started. Press number keys 1 to 4 to answer. Collect ' +
        GOAL_CORRECT +
        ' correct answers to win.'
    );
  }

  function restartGame() {
    if (!lastUserGesture) {
      canvas.focus();
    }
    startGame();
  }

  function nextQuestion() {
    currentQuestion = generateQuestion();
    selectedOptionIndex = 0;
    announce('New question: ' + currentQuestion.text + ' Options: ' + currentQuestion.options.join(', '));
  }

  // Visual particle spawners (stars + confetti)
  function spawnStars(count, sx, sy, golden = true) {
    for (let i = 0; i < count; i++) {
      starParticles.push({
        x: sx + rand(-30, 30),
        y: sy + rand(-20, 20),
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 2 - 1.5,
        life: 1 + Math.random() * 0.8,
        golden: golden,
        size: 6 + Math.random() * 6
      });
    }
  }

  function spawnConfetti(count, sx, sy) {
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: sx + rand(-20, 20),
        y: sy + rand(-10, 10),
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 2 + 0.5,
        life: 1 + Math.random() * 1.2,
        size: 6 + Math.random() * 8,
        color: ['#ffadad', '#ffd6a5', '#caffbf', '#9bf6ff'][rand(0, 3)],
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 6
      });
    }
  }

  // choose option (mechanics preserved)
  function chooseOption(index) {
    if (gameState !== 'playing') return;
    if (!currentQuestion) return;
    const chosen = currentQuestion.options[index];
    if (chosen === currentQuestion.answer) {
      score++;
      spawnStars(6, WIDTH / 2, centerArea.y + 60);
      spawnConfetti(8, WIDTH / 2, centerArea.y + 60);
      playFeedback('correct');
      announce('Correct! Score ' + score + '.');
      if (score >= GOAL_CORRECT) {
        gameState = 'victory';
        announce(
          'Victory! You collected ' +
            GOAL_CORRECT +
            ' correct answers. Press R to restart or click restart button.'
        );
        return;
      }
      setTimeout(nextQuestion, 650);
    } else {
      lives--;
      playFeedback('incorrect');
      spawnStars(10, WIDTH - 80, 40, false);
      announce('Oops, that was wrong. Lives left: ' + lives + '.');
      if (lives <= 0) {
        gameState = 'gameover';
        announce('Game over. You ran out of lives. Press R to restart or click restart button.');
        return;
      }
      setTimeout(nextQuestion, 650);
    }
  }

  // Drawing helpers
  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawCloud(cx, cy, w, h) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.6, h * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - w * 0.42, cy + 6, w * 0.48, h * 0.48, -0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.42, cy + 6, w * 0.44, h * 0.44, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // drone drawing with rotor animation and gentle shadow
  function drawDrone(x, y, scale, color, label) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // soft shadow
    ctx.save();
    ctx.fillStyle = 'rgba(30,30,40,0.09)';
    ctx.beginPath();
    ctx.ellipse(0, 28, 42, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body with subtle gradient
    const bodyW = 72;
    const bodyH = 40;
    const lg = ctx.createLinearGradient(-36, -18, 36, 22);
    lg.addColorStop(0, color);
    lg.addColorStop(1, '#ffffff');
    ctx.fillStyle = lg;
    drawRoundedRect(-36, -18, bodyW, bodyH, 10);

    // dome (glass)
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.arc(0, -6, 14, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,30,50,0.08)';
    ctx.stroke();

    // propellers (rotor blades) - two blades rotated by rotorAngle
    ctx.save();
    ctx.translate(0, -26);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(rotorAngle + (i * Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.fillStyle = 'rgba(30,30,30,0.28)';
      ctx.ellipse(0, -14, 22, 6, Math.PI / 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // feet / legs
    ctx.fillStyle = '#bdbdbd';
    ctx.fillRect(-28, 14, 6, 6);
    ctx.fillRect(22, 14, 6, 6);

    // eyes on dome for friendliness
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath();
    ctx.arc(-5, -8, 2.8, 0, Math.PI * 2);
    ctx.arc(6, -8, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // label
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#0b3d91';
    ctx.fillText(label || '', -12, 10);

    ctx.restore();
  }

  // life icon (rounded tech-heart)
  function drawLifeIcon(x, y, fill) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 3);
    ctx.bezierCurveTo(x + 6, y - 2, x - 4, y - 2, x - 4, y + 4);
    ctx.bezierCurveTo(x - 4, y + 9, x + 6, y + 12, x + 6, y + 14);
    ctx.bezierCurveTo(x + 6, y + 12, x + 16, y + 9, x + 16, y + 4);
    ctx.bezierCurveTo(x + 16, y - 2, x + 6, y - 2, x + 6, y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawStar(cx, cy, innerR, outerR, points) {
    ctx.beginPath();
    const step = Math.PI / points;
    for (let i = 0; i < 2 * points; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = i * step - Math.PI / 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Hit detection
  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  // Rendering loop (improved visuals)
  let restartButtonRect = null;
  function render(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Update animations
    rotorAngle += dt * 8; // rotor speed
    clouds.forEach((c) => {
      c.x += c.speed;
      if (c.x - 200 > WIDTH) c.x = -200;
    });
    birds.forEach((b) => {
      b.x += b.speed;
      b.wobble += dt * 2;
      if (b.x > WIDTH + 40) b.x = -80;
    });

    // update star particles
    for (let i = starParticles.length - 1; i >= 0; i--) {
      const p = starParticles[i];
      p.vy += 0.06;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt * 0.8;
      if (p.life <= 0) starParticles.splice(i, 1);
    }

    // confetti
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i];
      p.vy += 0.06;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed * dt;
      p.life -= dt * 0.6;
      if (p.life <= 0) confettiParticles.splice(i, 1);
    }

    // Clear canvas
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Soft background gradient (calming)
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#eaf6ff');
    sky.addColorStop(0.6, '#f6fff4');
    sky.addColorStop(1, '#f2f7ee');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Sun
    const sunX = WIDTH * 0.12;
    const sunY = 70;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 120);
    sunGrad.addColorStop(0, 'rgba(255,235,160,0.9)');
    sunGrad.addColorStop(1, 'rgba(255,235,160,0.05)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 80, 0, Math.PI * 2);
    ctx.fill();

    // Distant hills (silhouette) - gentle shapes
    ctx.save();
    ctx.fillStyle = '#cdeacc';
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 80);
    ctx.quadraticCurveTo(WIDTH * 0.2, HEIGHT - 140, WIDTH * 0.45, HEIGHT - 70);
    ctx.quadraticCurveTo(WIDTH * 0.7, HEIGHT - 20, WIDTH, HEIGHT - 110);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Clouds (soft)
    clouds.forEach((c, i) => {
      ctx.save();
      ctx.globalAlpha = 0.92 - i * 0.15;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      drawCloud(c.x, c.y, 110 * c.scale, 48 * c.scale);
      ctx.restore();
    });

    // Birds silhouette (simple arcs)
    birds.forEach((b) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(40,40,40,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const wob = Math.sin(b.wobble) * 6;
      ctx.moveTo(b.x, b.y);
      ctx.quadraticCurveTo(b.x + 10, b.y - 8 + wob, b.x + 22, b.y);
      ctx.moveTo(b.x + 22, b.y);
      ctx.quadraticCurveTo(b.x + 32, b.y - 6 - wob, b.x + 44, b.y);
      ctx.stroke();
      ctx.restore();
    });

    // Decorative soft grid (low opacity) for subtle depth
    ctx.save();
    ctx.globalAlpha = 0.03;
    ctx.strokeStyle = '#0b3d91';
    ctx.lineWidth = 1;
    for (let gx = 40; gx < WIDTH; gx += 80) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, HEIGHT);
      ctx.stroke();
    }
    ctx.restore();

    // Drones (friendly) - left and right
    drawDrone(120, 170 + Math.sin(lastTime / 600) * 6, 1.05, '#8ecae6', 'DR-A');
    drawDrone(580, 210 + Math.sin(lastTime / 700) * 6, 1.05, '#ffd6a5', 'DR-B');

    // Top bar UI (score, lives, audio indicator)
    ctx.font = FONT_LARGE;
    ctx.textBaseline = 'top';

    // Score box
    const scoreText = 'Score: ' + score + ' / ' + GOAL_CORRECT;
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreW = Math.ceil(scoreMetrics.width) + 18;
    const scoreH = 40;
    const scoreX = PADDING;
    const scoreY = PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    drawRoundedRect(scoreX, scoreY, scoreW, scoreH, 10);
    ctx.fillStyle = '#0b3d91';
    ctx.fillText(scoreText, scoreX + 10, scoreY + 8);

    // Lives box
    ctx.font = FONT_LARGE;
    const livesX = WIDTH - PADDING - 140;
    const livesY = PADDING;
    const livesW = 140;
    const livesH = 40;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    drawRoundedRect(livesX, livesY, livesW, livesH, 10);
    ctx.fillStyle = '#15325a';
    ctx.fillText('Lives:', livesX + 12, livesY + 8);
    const livesMetrics = ctx.measureText('Lives:');
    const iconStartX = livesX + 12 + livesMetrics.width + 8;
    for (let i = 0; i < MAX_LIVES; i++) {
      const lx = iconStartX + i * 28;
      drawLifeIcon(lx, livesY + 6, i < lives ? '#ff7b7b' : '#e0e0e0');
    }

    // Audio status (compact)
    ctx.font = FONT_BODY;
    const audioLabel = soundEnabled ? 'Sound: on (M)' : 'Sound: off (M)';
    const audioMetrics = ctx.measureText(audioLabel);
    const audioW = Math.ceil(audioMetrics.width) + 20;
    const audioH = 28;
    const audioX = WIDTH - PADDING - audioW - 8;
    const audioY = livesY + livesH + 8;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    drawRoundedRect(audioX, audioY, audioW, audioH, 8);
    ctx.fillStyle = '#1b3b6f';
    ctx.fillText(audioLabel, audioX + 10, audioY + 4);

    // Center area: question box and options
    ctx.font = FONT_TITLE;
    ctx.textBaseline = 'top';
    const qBoxX = centerArea.x + 12;
    const qBoxY = centerArea.y + 6;
    const qBoxW = centerArea.width - 24;
    const qBoxH = 120;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    drawRoundedRect(qBoxX, qBoxY, qBoxW, qBoxH, 14);

    if (gameState === 'intro' || gameState === 'waiting') {
      ctx.fillStyle = '#0b3d91';
      ctx.font = '34px "Segoe UI", Roboto, Arial, sans-serif';
      const title = 'Drone Math Mission';
      const tm = ctx.measureText(title);
      ctx.fillText(title, qBoxX + (qBoxW - tm.width) / 2, qBoxY + 12);

      ctx.font = FONT_BODY;
      const lines = [
        'Help the friendly drones collect correct numbers!',
        'Answer 10 questions correctly to win. You have 3 lives.',
        'Use 1-4 or click options. Press M to toggle sound.',
        'Click or press any key to begin.'
      ];
      ctx.fillStyle = '#123a6a';
      let ly = qBoxY + 64;
      lines.forEach((line) => {
        ctx.fillText(line, qBoxX + 18, ly);
        ly += 22;
      });
    } else {
      ctx.fillStyle = '#0b3d91';
      ctx.font = FONT_TITLE;
      const questionText = currentQuestion ? currentQuestion.text : '';
      const mq = ctx.measureText(questionText);
      ctx.fillText(questionText, qBoxX + (qBoxW - mq.width) / 2, qBoxY + 14);

      // Options as cards with subtle hover/pulse for selected
      ctx.font = FONT_BODY;
      optionButtons = [];
      const optW = (qBoxW - 36) / 2;
      const optH = 48;
      const optStartX = qBoxX + 12;
      const optStartY = qBoxY + 64;
      for (let i = 0; i < 4; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = optStartX + col * (optW + 12);
        const y = optStartY + row * (optH + 12);

        // selection pulse
        const selected = i === selectedOptionIndex;
        if (selected) {
          const pulse = 0.04 + 0.02 * Math.sin(lastTime / 150);
          ctx.fillStyle = `rgba(150, 205, 150, ${0.85 + pulse})`;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.94)';
        }
        drawRoundedRect(x, y, optW, optH, 10);

        // subtle icon (small badge)
        ctx.fillStyle = selected ? '#0b3d91' : '#2c3e50';
        ctx.font = '14px sans-serif';
        const badge = (i + 1) + '';
        ctx.fillText(badge, x + 12, y + 14);

        // option text
        ctx.fillStyle = '#0b3d91';
        const optText = currentQuestion ? String(currentQuestion.options[i]) : '';
        ctx.fillText(optText, x + 36, y + 14);

        optionButtons.push({ x, y, w: optW, h: optH, index: i });
      }
    }

    // Bottom instructions area
    ctx.font = FONT_BODY;
    ctx.textBaseline = 'top';
    const instText = 'Controls: 1-4 to choose, ←/→ to change, Enter to confirm, M to mute, R to restart';
    const instMetrics = ctx.measureText(instText);
    const instW = Math.ceil(instMetrics.width) + 24;
    const instH = 28;
    const instX = (WIDTH - instW) / 2;
    const instY = HEIGHT - bottomBarHeight + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    drawRoundedRect(instX, instY, instW, instH, 8);
    ctx.fillStyle = '#173b6a';
    ctx.fillText(instText, instX + 12, instY + 4);

    // Draw star particles and confetti on top
    starParticles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.golden ? '#ffd166' : '#a0e7e5';
      drawStar(p.x, p.y, p.size / 2, p.size, 5);
      ctx.restore();
    });
    confettiParticles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    // Victory / Game over overlay (preserve logic)
    if (gameState === 'victory' || gameState === 'gameover') {
      ctx.save();
      ctx.fillStyle = 'rgba(10, 10, 30, 0.6)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.font = FONT_TITLE;
      ctx.fillStyle = '#fff';
      const message = gameState === 'victory' ? 'Victory! Drones Celebrating!' : 'Game Over';
      const mm = ctx.measureText(message);
      ctx.fillText(message, (WIDTH - mm.width) / 2, HEIGHT / 2 - 72);

      ctx.font = FONT_LARGE;
      const sub =
        gameState === 'victory'
          ? 'You answered ' + score + ' correctly!'
          : 'You answered ' + score + ' correctly.';
      const sm = ctx.measureText(sub);
      ctx.fillText(sub, (WIDTH - sm.width) / 2, HEIGHT / 2 - 28);

      // restart button
      ctx.font = FONT_LARGE;
      const btnLabel = 'Restart (R)';
      const bm = ctx.measureText(btnLabel);
      const bw = bm.width + 26;
      const bh = 46;
      const bx = (WIDTH - bw) / 2;
      const by = HEIGHT / 2 + 26;
      ctx.fillStyle = '#ffffff';
      drawRoundedRect(bx, by, bw, bh, 12);
      ctx.fillStyle = '#0b3d91';
      ctx.fillText(btnLabel, bx + 14, by + 10);
      restartButtonRect = { x: bx, y: by, w: bw, h: bh };

      ctx.restore();
    } else {
      restartButtonRect = null;
    }

    // Small audio hint
    ctx.font = '14px sans-serif';
    const hint = audioError ? 'Audio not available' : audioAllowed ? 'Audio ready' : 'Click or press any key to enable audio';
    const mh = ctx.measureText(hint);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    drawRoundedRect(10, HEIGHT - 38, mh.width + 18, 28, 8);
    ctx.fillStyle = '#123a6a';
    ctx.fillText(hint, 18, HEIGHT - 36);

    requestAnimationFrame(render);
  }

  // Input handling (preserve behavior)
  canvas.addEventListener('click', function (e) {
    lastUserGesture = true;
    ensureAudioInited();
    canvas.focus();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (gameState === 'intro' || gameState === 'waiting') {
      startGame();
      return;
    }

    if (gameState === 'victory' || gameState === 'gameover') {
      if (restartButtonRect && pointInRect(x, y, restartButtonRect)) {
        restartGame();
      }
      return;
    }

    // options
    for (const b of optionButtons) {
      if (pointInRect(x, y, b)) {
        selectedOptionIndex = b.index;
        chooseOption(b.index);
        return;
      }
    }

    // audio toggle area (top right)
    if (x > WIDTH - 220 && y < 120) {
      soundEnabled = !soundEnabled;
      announce('Sound ' + (soundEnabled ? 'on' : 'off'));
      return;
    }
  });

  // Keyboard controls (preserve behavior)
  canvas.addEventListener('keydown', function (e) {
    lastUserGesture = true;
    ensureAudioInited();
    if (e.key >= '1' && e.key <= '4') {
      if (gameState === 'playing') {
        const idx = parseInt(e.key, 10) - 1;
        selectedOptionIndex = idx;
        chooseOption(idx);
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (gameState === 'playing') {
        selectedOptionIndex = (selectedOptionIndex + 3) % 4;
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (gameState === 'playing') {
        selectedOptionIndex = (selectedOptionIndex + 1) % 4;
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      if (gameState === 'playing') {
        chooseOption(selectedOptionIndex);
      } else if (gameState === 'victory' || gameState === 'gameover') {
        restartGame();
      } else if (gameState === 'intro' || gameState === 'waiting') {
        startGame();
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      soundEnabled = !soundEnabled;
      announce('Sound ' + (soundEnabled ? 'on' : 'off'));
      e.preventDefault();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      restartGame();
      e.preventDefault();
      return;
    }
    if (gameState === 'intro' && !lastUserGesture) {
      lastUserGesture = true;
      ensureAudioInited();
      startGame();
    }
  });

  // Ensure audio resume/init on user gesture
  function ensureAudioInited() {
    try {
      if (!audioCtx) initAudio();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch((e) => {
          audioAllowed = false;
          audioError = 'Audio resume error: ' + (e && e.message ? e.message : String(e));
          console.warn(audioError);
        });
      }
    } catch (e) {
      audioAllowed = false;
      audioError = 'Audio init error: ' + (e && e.message ? e.message : String(e));
      console.warn(audioError);
    }
  }

  // Accessibility helpers
  canvas.addEventListener('focus', () => {
    // no-op but keeps keyboard accessible
  });
  container.addEventListener('keydown', function (e) {
    canvas.dispatchEvent(new KeyboardEvent('keydown', e));
  });

  // Pointerdown to trigger audio from first-touch devices
  container.addEventListener(
    'pointerdown',
    function () {
      lastUserGesture = true;
      ensureAudioInited();
    },
    { passive: true }
  );

  // Unhandled rejections
  window.addEventListener('unhandledrejection', function (ev) {
    console.warn('Unhandled promise rejection in game', ev.reason);
  });

  // Start rendering
  requestAnimationFrame(render);

  // Start in intro
  gameState = 'intro';
  announce('Welcome to Drone Math Mission. Click or press any key to begin.');
})();