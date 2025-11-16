(function () {
  // Drone Math Game (visual & audio enhancements)
  // Renders inside element with id "game-of-the-day-stage"
  // All visuals drawn on canvas. Sounds via Web Audio API.
  // Game mechanics unchanged.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const TARGET_CORRECT = 10;
  const MAX_WRONG = 3;
  const DRONE_SPEED = 180; // pixels per second
  const ANSWER_RADIUS = 36;
  const MIN_UI_PADDING = 10;

  // Locate container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.');
    return;
  }

  // Accessibility live region
  let liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  container.appendChild(liveRegion);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';
  container.style.position = 'relative';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Fonts
  const SMALL_FONT = '16px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const BODY_FONT = '18px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const TITLE_FONT = '28px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';

  // Game state
  let gameState = 'start';
  let correctCount = 0;
  let wrongCount = 0;
  let currentQuestion = null;
  let answers = [];
  let drone = null;
  let lastTime = performance.now();
  let keys = {};
  let audioAllowed = false;
  let audioEnabled = true;
  let audio = null;
  let ambientGain = null;
  let sounds = {};
  let questionId = 0;

  // Enhanced visuals state
  let bgOffset = 0;
  const cloudPositions = Array.from({ length: 6 }).map((_, i) => ({
    x: Math.random() * WIDTH,
    y: 30 + Math.random() * 60,
    scale: 0.6 + Math.random() * 0.9,
    speed: 10 + Math.random() * 20,
  }));
  const particles = []; // for collect/impact and exhaust
  let hoverAnswer = null;
  let overlayButton = null;

  // Utility: measure text width
  function measureTextWidth(text, font) {
    ctx.save();
    ctx.font = font;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  }

  // Audio initialization with better ambient layering and error handling
  function initAudio() {
    if (audio) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio API not supported.');
      audio = new AudioCtx();

      // master gain
      const masterGain = audio.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audio.destination);

      // ambient: two detuned sine layers + gentle bell LFO
      ambientGain = audio.createGain();
      ambientGain.gain.value = 0.025; // quiet ambient
      ambientGain.connect(masterGain);

      // base hum
      const hum1 = audio.createOscillator();
      hum1.type = 'sine';
      hum1.frequency.value = 60;
      const hum1Gain = audio.createGain();
      hum1Gain.gain.value = 0.012;
      hum1.connect(hum1Gain);
      hum1Gain.connect(ambientGain);
      hum1.start();

      const hum2 = audio.createOscillator();
      hum2.type = 'sine';
      hum2.frequency.value = 72; // slightly detuned
      const hum2Gain = audio.createGain();
      hum2Gain.gain.value = 0.009;
      hum2.connect(hum2Gain);
      hum2Gain.connect(ambientGain);
      hum2.start();

      // slow lowpass movement to make ambient feel alive
      const ambientFilter = audio.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 1200;
      ambientFilter.Q.value = 0.6;
      ambientGain.disconnect();
      ambientGain.connect(ambientFilter);
      ambientFilter.connect(masterGain);

      // gentle LFO affecting filter cutoff
      const lfo = audio.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07; // slow
      const lfoGain = audio.createGain();
      lfoGain.gain.value = 600;
      lfo.connect(lfoGain);
      lfoGain.connect(ambientFilter.frequency);
      lfo.start();

      // soft bell layer (scheduled repeating tiny motif)
      let bellInterval = null;
      function startBellLoop() {
        if (!audio) return;
        // schedule a soft motif every 6 seconds with random variation
        bellInterval = setInterval(() => {
          if (!audioEnabled) return;
          const now = audio.currentTime;
          const base = 880 + (Math.random() - 0.5) * 40;
          for (let i = 0; i < 3; i++) {
            const o = audio.createOscillator();
            const g = audio.createGain();
            const f = base * Math.pow(1.03, i * 3);
            o.type = 'triangle';
            o.frequency.value = f;
            o.connect(g);
            const filt = audio.createBiquadFilter();
            filt.type = 'bandpass';
            filt.frequency.value = f * 1.5;
            g.connect(filt);
            filt.connect(masterGain);
            g.gain.setValueAtTime(0.0001, now + i * 0.03);
            g.gain.linearRampToValueAtTime(0.06, now + i * 0.05);
            g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.8);
            o.start(now + i * 0.03);
            o.stop(now + i * 0.85);
          }
        }, 6000 + Math.random() * 2000);
      }
      startBellLoop();

      // sounds: correct (bright arpeggio), incorrect (quick descending), collect (tiny ping)
      sounds.correct = function () {
        if (!audioEnabled || !audio) return;
        const now = audio.currentTime;
        const freqs = [880, 1100, 1320];
        freqs.forEach((f, i) => {
          const o = audio.createOscillator();
          const g = audio.createGain();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.connect(g);
          g.connect(masterGain);
          const t = now + i * 0.03;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.14, t + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          o.start(t);
          o.stop(t + 0.5);
        });
      };

      sounds.incorrect = function () {
        if (!audioEnabled || !audio) return;
        const now = audio.currentTime;
        // quick descending sawtooth with filter
        const o = audio.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(700, now);
        o.frequency.exponentialRampToValueAtTime(120, now + 0.45);
        const g = audio.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.18, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        const filt = audio.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 1200;
        o.connect(filt);
        filt.connect(g);
        g.connect(masterGain);
        o.start(now);
        o.stop(now + 0.5);
      };

      sounds.collect = function () {
        if (!audioEnabled || !audio) return;
        const now = audio.currentTime;
        // tiny bell-like ping (two partials)
        const partials = [1400, 2000];
        partials.forEach((f, i) => {
          const o = audio.createOscillator();
          const g = audio.createGain();
          o.type = 'square';
          o.frequency.value = f;
          o.connect(g);
          g.connect(masterGain);
          const t = now + i * 0.01;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.09, t + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
          o.start(t);
          o.stop(t + 0.22);
        });
      };

      // Mark audio as allowed and alive
      audioAllowed = true;
      // Keep references so they don't get GC'd if needed
      audio._humNodes = { hum1, hum2, lfo, bellInterval };
    } catch (e) {
      console.warn('Audio initialization failed:', e);
      audioAllowed = false;
      audio = null;
      sounds = {};
      ambientGain = null;
    }
  }

  // Toggle audio
  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (!audio) return;
    try {
      if (ambientGain) {
        ambientGain.gain.setValueAtTime(audioEnabled ? 0.025 : 0, audio.currentTime);
      }
      if (audioEnabled && sounds.collect) sounds.collect();
    } catch (err) {
      console.warn('Audio toggle error', err);
    }
  }

  // Accessibility announce
  function announce(text) {
    try {
      liveRegion.textContent = text;
    } catch (e) {
      console.warn('Failed to update live region', e);
    }
  }

  // Question logic (unchanged)
  function generateQuestion() {
    const kind = Math.random();
    if (kind < 0.45) {
      const a = Math.floor(Math.random() * 12) + 1;
      const b = Math.floor(Math.random() * 12) + 1;
      const answer = a + b;
      return { text: `${a} + ${b} = ?`, correct: answer };
    } else if (kind < 0.9) {
      const a = Math.floor(Math.random() * 15) + 5;
      const b = Math.floor(Math.random() * (a - 2)) + 1;
      const answer = a - b;
      return { text: `${a} - ${b} = ?`, correct: answer };
    } else {
      const a = Math.floor(Math.random() * 10) + 1;
      const b = a + Math.floor(Math.random() * 10) + 1;
      const answer = b - a;
      return { text: `${a} + ? = ${b}`, correct: answer };
    }
  }

  // Answers generation (unchanged)
  function generateAnswers(correct) {
    const set = new Set([correct]);
    while (set.size < 4) {
      const delta = Math.floor(Math.random() * 7) - 3;
      let val = correct + delta;
      if (Math.random() < 0.2) val = correct + (Math.random() < 0.5 ? 5 : -5);
      if (val < 0) val = Math.abs(val) + 1;
      set.add(val);
    }
    const arr = Array.from(set);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Place bubbles (unchanged)
  function placeAnswerBubbles(values) {
    const positions = [];
    const attemptsLimit = 200;
    for (let val of values) {
      let tries = 0;
      let placed = false;
      while (!placed && tries < attemptsLimit) {
        tries++;
        const x = Math.floor(Math.random() * (WIDTH - ANSWER_RADIUS * 2)) + ANSWER_RADIUS;
        const y = Math.floor(Math.random() * (HEIGHT * 0.6 - ANSWER_RADIUS * 2)) + ANSWER_RADIUS + 60;
        let ok = true;
        for (let p of positions) {
          const dx = p.x - x;
          const dy = p.y - y;
          if (Math.sqrt(dx * dx + dy * dy) < ANSWER_RADIUS * 2 + 10) {
            ok = false;
            break;
          }
        }
        if (y < 70) ok = false;
        if (ok) {
          positions.push({ x, y, val });
          placed = true;
        }
      }
      if (!placed) {
        positions.push({
          x: ANSWER_RADIUS + (positions.length * ANSWER_RADIUS * 3) % (WIDTH - ANSWER_RADIUS * 2),
          y: 120 + Math.floor(positions.length / 3) * ANSWER_RADIUS * 3,
          val,
        });
      }
    }
    return positions.map((p, i) => ({ ...p, label: i + 1 }));
  }

  // Initialize or reset game (minor visual changes: drone color & particle clear)
  function startNewGame() {
    correctCount = 0;
    wrongCount = 0;
    questionId = 0;
    drone = {
      x: WIDTH / 2,
      y: HEIGHT - 110,
      vx: 0,
      vy: 0,
      w: 56,
      h: 28,
      colorHue: 190 + Math.floor(Math.random() * 120),
      trail: [],
      shake: 0,
    };
    particles.length = 0;
    gameState = 'playing';
    spawnQuestion();
    announce(
      'Game started. Answer math questions by flying the drone to the correct bubble or press number keys 1 to 4.'
    );
    if (!audio && audioAllowed === false) {
      initAudio();
    }
    if (audio && ambientGain) {
      try {
        ambientGain.gain.setValueAtTime(audioEnabled ? 0.025 : 0, audio.currentTime);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function spawnQuestion() {
    questionId++;
    currentQuestion = generateQuestion();
    answers = placeAnswerBubbles(generateAnswers(currentQuestion.correct));
    announce(
      `Question ${questionId}: ${currentQuestion.text}. Answers: ${answers
        .map(a => a.val)
        .join(', ')}. Use arrow keys to fly or press number 1 to 4 to answer.`
    );
  }

  // Collision detection
  function droneHitsAnswer(answer) {
    const nearestX = Math.max(answer.x - ANSWER_RADIUS, Math.min(drone.x, answer.x + ANSWER_RADIUS));
    const nearestY = Math.max(answer.y - ANSWER_RADIUS, Math.min(drone.y, answer.y + ANSWER_RADIUS));
    const dx = drone.x - nearestX;
    const dy = drone.y - nearestY;
    return dx * dx + dy * dy <= (drone.w / 2 + ANSWER_RADIUS) * (drone.w / 2 + ANSWER_RADIUS);
  }

  // On select
  function selectAnswerByIndex(index) {
    if (gameState !== 'playing') return;
    const answer = answers[index];
    if (!answer) return;
    handleAnswerSelected(answer);
  }

  function handleAnswerSelected(answer) {
    if (gameState !== 'playing') return;
    if (answer.val === currentQuestion.correct) {
      correctCount++;
      if (sounds && sounds.correct) sounds.correct();
      if (sounds && sounds.collect) sounds.collect();
      // visual collect particles
      spawnCollectParticles(answer.x, answer.y, '#8ef', '#fff');
      announce(
        `Correct! ${currentQuestion.text} Answer ${answer.val}. Correct count: ${correctCount} of ${TARGET_CORRECT}.`
      );
      answer.collected = true;
      setTimeout(() => {
        if (correctCount >= TARGET_CORRECT) {
          gameState = 'win';
          announce('Victory! You answered ten questions correctly. Press R or click Restart to play again.');
        } else {
          spawnQuestion();
        }
      }, 300);
    } else {
      wrongCount++;
      if (sounds && sounds.incorrect) sounds.incorrect();
      drone.shake = 16;
      spawnCollectParticles(drone.x, drone.y, '#f88', '#ffb');
      announce(
        `Oops! That's ${answer.val}. The correct answer was ${currentQuestion.correct}. Wrong answers: ${wrongCount} of ${MAX_WRONG}.`
      );
      if (wrongCount >= MAX_WRONG) {
        gameState = 'gameover';
        announce('Game over. You had three wrong answers. Press R or click Restart to try again.');
      } else {
        setTimeout(spawnQuestion, 800);
      }
    }
  }

  // UI draw
  function drawUI() {
    ctx.save();

    // Score top-left
    ctx.font = BODY_FONT;
    const scoreText = `Correct: ${correctCount}/${TARGET_CORRECT}`;
    const scoreW = ctx.measureText(scoreText).width;
    const scorePadding = MIN_UI_PADDING;
    const scoreBoxWidth = scoreW + scorePadding * 2;
    const scoreBoxHeight = 30;
    const scoreX = MIN_UI_PADDING;
    const scoreY = MIN_UI_PADDING;
    // semi-glass with soft shadow
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    roundRect(ctx, scoreX, scoreY, scoreBoxWidth, scoreBoxHeight, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.stroke();
    ctx.fillStyle = '#083';
    ctx.textBaseline = 'middle';
    ctx.font = BODY_FONT;
    ctx.fillText(scoreText, scoreX + scorePadding, scoreY + scoreBoxHeight / 2);

    // Audio indicator top-center
    const audioText = audio ? (audioEnabled ? 'Audio: ON (M)' : 'Audio: OFF (M)') : 'Audio: unavailable';
    ctx.font = SMALL_FONT;
    const audioW = ctx.measureText(audioText).width;
    const audioBoxWidth = audioW + scorePadding * 2;
    const audioBoxHeight = 26;
    const audioX = (WIDTH - audioBoxWidth) / 2;
    const audioY = MIN_UI_PADDING;
    ctx.fillStyle = 'rgba(240,240,255,0.95)';
    roundRect(ctx, audioX, audioY, audioBoxWidth, audioBoxHeight, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,20,30,0.08)';
    ctx.stroke();
    ctx.fillStyle = '#062';
    ctx.textBaseline = 'middle';
    ctx.font = SMALL_FONT;
    ctx.fillText(audioText, audioX + scorePadding, audioY + audioBoxHeight / 2);

    // Lives top-right
    const livesText = `Wrong: ${wrongCount}/${MAX_WRONG}`;
    ctx.font = BODY_FONT;
    const livesW = ctx.measureText(livesText).width;
    const livesBoxWidth = livesW + scorePadding * 2;
    const livesBoxHeight = 30;
    const livesX = WIDTH - livesBoxWidth - MIN_UI_PADDING;
    const livesY = MIN_UI_PADDING;
    ctx.fillStyle = 'rgba(255,240,240,0.94)';
    roundRect(ctx, livesX, livesY, livesBoxWidth, livesBoxHeight, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,10,10,0.08)';
    ctx.stroke();
    ctx.fillStyle = '#730';
    ctx.textBaseline = 'middle';
    ctx.font = BODY_FONT;
    ctx.fillText(livesText, livesX + scorePadding, livesY + livesBoxHeight / 2);

    ctx.restore();
  }

  // Simple rounded rect helper
  function roundRect(ctx, x, y, w, h, r) {
    const radius = r || 6;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // Draw instructions box
  function drawInstructions(lines) {
    ctx.save();
    ctx.font = SMALL_FONT;
    const padding = 10;
    const lineHeight = 20;
    let maxW = 0;
    for (let line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxW) maxW = w;
    }
    const boxW = maxW + padding * 2;
    const boxH = lines.length * lineHeight + padding * 2;
    const boxX = (WIDTH - boxW) / 2;
    const boxY = HEIGHT - boxH - MIN_UI_PADDING;
    ctx.fillStyle = 'rgba(20,28,40,0.06)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,10,0.05)';
    ctx.stroke();
    ctx.fillStyle = '#032';
    ctx.textBaseline = 'top';
    ctx.font = SMALL_FONT;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], boxX + padding, boxY + padding + i * lineHeight);
    }
    ctx.restore();
  }

  // Draw answer bubbles with pulsing and hover highlight
  function drawAnswers(now) {
    ctx.save();
    const t = now / 1000;
    for (let a of answers) {
      const isHover = hoverAnswer === a;
      const pulse = 1 + Math.sin(t * 2 + a.label) * 0.04;
      const r = ANSWER_RADIUS * pulse * (a.collected ? 0.85 : 1);
      // shadow glow
      const grd = ctx.createRadialGradient(a.x - 8, a.y - 12, r * 0.1, a.x, a.y, r * 1.6);
      if (a.collected) {
        grd.addColorStop(0, 'rgba(200,200,210,0.12)');
        grd.addColorStop(1, 'rgba(200,200,210,0)');
      } else {
        grd.addColorStop(0, `rgba(255,255,255,0.5)`);
        grd.addColorStop(1, 'rgba(0,40,60,0)');
      }
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // main circle
      const hue = 190 + a.label * 40;
      ctx.beginPath();
      const baseColor = a.collected ? `hsl(${hue} 40% 80%)` : `hsl(${hue} 70% 60%)`;
      ctx.fillStyle = baseColor;
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();

      // inner glossy highlight
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.ellipse(a.x - r * 0.35, a.y - r * 0.45, r * 0.6, r * 0.32, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // outline and hover ring
      ctx.lineWidth = isHover ? 4 : 2;
      ctx.strokeStyle = isHover ? 'rgba(255,255,200,0.95)' : 'rgba(6,12,18,0.5)';
      ctx.stroke();

      // label badge (top-left of bubble)
      ctx.beginPath();
      const badgeR = 14;
      const bx = a.x - r + 12;
      const by = a.y - r + 12;
      ctx.fillStyle = 'rgba(10,10,20,0.9)';
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.label.toString(), bx, by);

      // value text centered
      ctx.font = '20px bold system-ui';
      ctx.fillStyle = '#012';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.val.toString(), a.x, a.y + 2);
    }
    ctx.restore();
  }

  // Draw drone with glow, rotors and exhaust trail particles
  function drawDrone(dt, now) {
    ctx.save();

    // Update trail (push recent position)
    drone.trail.unshift({ x: drone.x, y: drone.y, life: 0.4 });
    if (drone.trail.length > 18) drone.trail.pop();

    // draw exhaust trail particles behind drone (smaller for idle)
    const moving = Math.hypot(drone.vx, drone.vy) > 8;
    if (moving) {
      spawnExhaust(drone.x - 4 + (Math.random() - 0.5) * 8, drone.y + 8 + Math.random() * 10);
    }

    // render particles trail
    for (let p of drone.trail) {
      const alpha = Math.max(0, 0.5 - p.life);
      ctx.beginPath();
      ctx.fillStyle = `rgba(100,170,220,${alpha})`;
      ctx.ellipse(p.x - 6, p.y + 10, 12 * (1 - p.life), 6 * (1 - p.life), 0, 0, Math.PI * 2);
      ctx.fill();
      p.life += dt * 0.4;
    }

    // shaking
    const shake = drone.shake || 0;
    if (drone.shake) drone.shake = Math.max(0, drone.shake - 18 * dt);
    const shakeX = (Math.random() - 0.5) * shake;
    const shakeY = (Math.random() - 0.5) * shake;

    ctx.translate(shakeX, shakeY);

    // glow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(100,200,240,0.08)';
    ctx.ellipse(drone.x, drone.y + 8, 84, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.save();
    ctx.translate(drone.x, drone.y);
    const angle = Math.atan2(drone.vy, Math.max(1e-4, drone.vx + 0.0001)) * 0.06;
    ctx.rotate(angle);
    // body main
    ctx.beginPath();
    ctx.fillStyle = `hsl(${drone.colorHue} 68% 48%)`;
    ctx.strokeStyle = 'rgba(6,10,14,0.9)';
    ctx.lineWidth = 2;
    ctx.ellipse(0, 0, drone.w / 2, drone.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // window
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.ellipse(-8, -2, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(5,12,20,0.12)';
    ctx.ellipse(-8, -2, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // antenna
    ctx.strokeStyle = 'rgba(12,12,18,0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(drone.w / 4 - 2, -drone.h / 2 - 2);
    ctx.lineTo(drone.w / 4 + 8, -drone.h / 2 - 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = '#ff6b6b';
    ctx.arc(drone.w / 4 + 8, -drone.h / 2 - 18, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Rotors with motion blur
    const rotorCount = 3;
    for (let i = 0; i < rotorCount; i++) {
      const a = (i / rotorCount) * Math.PI * 2 + now / 160;
      const rx = drone.x + Math.cos(a) * 26;
      const ry = drone.y + Math.sin(a) * 6 - 14;
      // rotor blur ring
      ctx.beginPath();
      ctx.fillStyle = 'rgba(20,30,40,0.18)';
      ctx.ellipse(rx, ry, 28, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // center hub
      ctx.beginPath();
      ctx.fillStyle = 'rgba(12,12,16,0.9)';
      ctx.arc(rx, ry, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw question box
  function drawQuestion() {
    ctx.save();
    ctx.font = TITLE_FONT;
    const text = currentQuestion ? currentQuestion.text : 'Get ready!';
    const textW = ctx.measureText(text).width;
    const boxW = Math.min(WIDTH - 120, textW + MIN_UI_PADDING * 2);
    const boxH = 44;
    const boxX = (WIDTH - boxW) / 2;
    const boxY = 46;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(2,44,64,0.08)';
    ctx.stroke();
    ctx.fillStyle = '#013';
    ctx.textBaseline = 'middle';
    ctx.font = TITLE_FONT;
    ctx.fillText(text, boxX + MIN_UI_PADDING, boxY + boxH / 2);
    ctx.restore();
  }

  // Draw overlays (start, win, gameover)
  function drawOverlay() {
    ctx.save();
    if (gameState === 'start') {
      // soft scenic start
      ctx.fillStyle = 'rgba(240,250,255,0.98)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const title = 'Drone Math Adventure';
      ctx.font = '34px system-ui, -apple-system';
      ctx.fillStyle = '#054';
      const tw = ctx.measureText(title).width;
      ctx.fillText(title, (WIDTH - tw) / 2, 110);

      const lines = [
        'Welcome, pilot! Help the friendly drone collect the correct math bubbles.',
        `Goal: Answer ${TARGET_CORRECT} questions correctly.`,
        `You can make ${MAX_WRONG} mistakes before the game ends.`,
        'Controls: Arrow keys to fly, numbers 1-4 to pick an answer.',
        'Press Enter or click to start. Press M to toggle audio.',
      ];
      drawInstructions(lines);
    } else if (gameState === 'win' || gameState === 'gameover') {
      ctx.fillStyle = 'rgba(6,10,20,0.45)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const boxW = WIDTH * 0.78;
      const boxH = 220;
      const boxX = (WIDTH - boxW) / 2;
      const boxY = (HEIGHT - boxH) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      roundRect(ctx, boxX, boxY, boxW, boxH, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(6,10,20,0.08)';
      ctx.stroke();

      ctx.font = '28px system-ui';
      ctx.fillStyle = '#022';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const title = gameState === 'win' ? 'You Win! 🎉' : 'Game Over';
      ctx.fillText(title, WIDTH / 2, boxY + 20);

      ctx.font = '18px system-ui';
      ctx.fillStyle = '#111';
      ctx.textBaseline = 'top';
      if (gameState === 'win') {
        ctx.fillText(`Great flying! You answered ${correctCount} questions correctly.`, WIDTH / 2, boxY + 72);
      } else {
        ctx.fillText(`You answered ${correctCount} correct and made ${wrongCount} mistakes.`, WIDTH / 2, boxY + 72);
      }

      ctx.font = '16px system-ui';
      ctx.fillText('Press R to Restart or click the Restart button below.', WIDTH / 2, boxY + 110);

      // restart button
      const btnW = 160;
      const btnH = 44;
      const btnX = WIDTH / 2 - btnW / 2;
      const btnY = boxY + boxH - 70;
      ctx.fillStyle = '#2ec4b6';
      roundRect(ctx, btnX, btnY, btnW, btnH, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,80,64,0.12)';
      ctx.stroke();
      ctx.fillStyle = '#002b2a';
      ctx.font = '18px system-ui';
      ctx.textBaseline = 'middle';
      ctx.fillText('Restart (R)', WIDTH / 2, btnY + btnH / 2);

      overlayButton = { x: btnX, y: btnY, w: btnW, h: btnH };
    }
    ctx.restore();
  }

  // Particle spawn functions
  function spawnCollectParticles(x, y, colorA, colorB) {
    for (let i = 0; i < 16; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        life: 0,
        ttl: 0.6 + Math.random() * 0.6,
        size: 4 + Math.random() * 6,
        colorA,
        colorB,
      });
    }
  }

  function spawnExhaust(x, y) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: 20 + Math.random() * 30,
      life: 0,
      ttl: 0.5 + Math.random() * 0.3,
      size: 6 + Math.random() * 8,
      colorA: 'rgba(180,220,255,0.18)',
      colorB: 'rgba(60,100,140,0.06)',
    });
  }

  function updateAndDrawParticles(dt) {
    ctx.save();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const lifeRatio = 1 - p.life / p.ttl;
      // soft radial
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
      g.addColorStop(0, p.colorA);
      g.addColorStop(1, p.colorB);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Main render
  function render(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // background gradient and parallax hills
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#e6f8ff');
    sky.addColorStop(0.6, '#f6fbff');
    sky.addColorStop(1, '#ffffff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun
    const sunX = 80 + (Math.sin(now / 5000) + 1) * 40;
    const sunY = 80;
    const sunG = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 100);
    sunG.addColorStop(0, 'rgba(255,245,200,0.95)');
    sunG.addColorStop(1, 'rgba(255,245,200,0.0)');
    ctx.fillStyle = sunG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // moving mountains / hills (parallax)
    bgOffset += dt * 12;
    drawHills(now);

    // gentle clouds
    for (let c of cloudPositions) {
      c.x += (c.speed + Math.sin(now / 2000) * 4) * dt;
      if (c.x > WIDTH + 120) c.x = -120;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale);
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 54, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(36, 0, 44, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(-34, 0, 30, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // playground ground base
    ctx.save();
    ctx.fillStyle = '#f7fff9';
    ctx.fillRect(0, HEIGHT - 66, WIDTH, 66);
    ctx.restore();

    // if overlay start, draw overlay alone for clarity
    if (gameState === 'start') {
      drawOverlay();
      requestAnimationFrame(render);
      return;
    }

    // Update physics if playing
    if (gameState === 'playing') {
      const acc = { x: 0, y: 0 };
      if (keys['ArrowLeft']) acc.x -= 1;
      if (keys['ArrowRight']) acc.x += 1;
      if (keys['ArrowUp']) acc.y -= 1;
      if (keys['ArrowDown']) acc.y += 1;

      if (acc.x !== 0 || acc.y !== 0) {
        const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y);
        acc.x /= mag;
        acc.y /= mag;
        drone.vx = acc.x * DRONE_SPEED;
        drone.vy = acc.y * DRONE_SPEED;
      } else {
        drone.vx *= 0.9;
        drone.vy *= 0.9;
      }

      drone.x += drone.vx * dt;
      drone.y += drone.vy * dt;

      drone.x = Math.max(16, Math.min(WIDTH - 16, drone.x));
      drone.y = Math.max(70, Math.min(HEIGHT - 40, drone.y));

      // collision
      for (let i = 0; i < answers.length; i++) {
        const a = answers[i];
        if (!a.collected && droneHitsAnswer(a)) {
          handleAnswerSelected(a);
          break;
        }
      }
    }

    // Draw answers, drone, question, UI, particles
    drawAnswers(now);
    drawDrone(dt, now);
    drawQuestion();
    drawUI();

    // draw particles on top of drone and bubbles
    updateAndDrawParticles(dt);

    // bottom instructions during play
    if (gameState === 'playing') {
      drawInstructions([
        'Fly to the bubble with the correct answer, or press 1-4.',
        'Goal: answer 10 correctly. Three wrong answers = game over.',
        'Press M to toggle audio. Press R to restart anytime.',
      ]);
    }

    // overlay win/gameover on top
    if (gameState === 'win' || gameState === 'gameover') {
      drawOverlay();
    }

    requestAnimationFrame(render);
  }

  // Draw layered hills with parallax
  function drawHills(now) {
    // far hills
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#bfe6d4';
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 66);
    for (let x = 0; x <= WIDTH; x += 20) {
      const y = HEIGHT - 66 - 24 - Math.sin(x / 80 + now / 800) * 26;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();

    // mid hills
    ctx.fillStyle = '#8fd1b1';
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 66);
    for (let x = 0; x <= WIDTH; x += 20) {
      const y = HEIGHT - 66 - 14 - Math.sin(x / 60 + now / 400) * 18;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();

    // foreground small ridge
    ctx.fillStyle = '#64b786';
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT - 66);
    for (let x = 0; x <= WIDTH; x += 20) {
      const y = HEIGHT - 66 - 6 - Math.sin(x / 40 + now / 200) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Input handling
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') return;
    e.preventDefault();
    keys[e.key] = true;

    if (
      !audio &&
      (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow') || /^[1-4]$/.test(e.key))
    ) {
      initAudio();
      if (audio && ambientGain) ambientGain.gain.setValueAtTime(audioEnabled ? 0.025 : 0, audio.currentTime);
    }

    if (gameState === 'start' && (e.key === 'Enter' || e.key === ' ')) {
      startNewGame();
    } else if (gameState === 'playing') {
      if (/^[1-4]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        selectAnswerByIndex(idx);
      } else if (e.key === 'm' || e.key === 'M') {
        toggleAudio();
      } else if (e.key === 'r' || e.key === 'R') {
        startNewGame();
      }
    } else if (gameState === 'win' || gameState === 'gameover') {
      if (e.key === 'r' || e.key === 'R') {
        startNewGame();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleAudio();
      }
    }
  });

  canvas.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    initAudio();
    if (audio && ambientGain) ambientGain.gain.setValueAtTime(audioEnabled ? 0.025 : 0, audio.currentTime);

    if (gameState === 'start') {
      startNewGame();
      return;
    } else if (gameState === 'playing') {
      for (let i = 0; i < answers.length; i++) {
        const a = answers[i];
        const dx = x - a.x;
        const dy = y - a.y;
        if (dx * dx + dy * dy <= ANSWER_RADIUS * ANSWER_RADIUS) {
          handleAnswerSelected(a);
          return;
        }
      }
      const dx = x - drone.x;
      const dy = y - drone.y;
      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > 5) {
        drone.vx = (dx / mag) * DRONE_SPEED * 0.8;
        drone.vy = (dy / mag) * DRONE_SPEED * 0.8;
      }
    } else if (gameState === 'win' || gameState === 'gameover') {
      if (overlayButton) {
        if (
          x >= overlayButton.x &&
          x <= overlayButton.x + overlayButton.w &&
          y >= overlayButton.y &&
          y <= overlayButton.y + overlayButton.h
        ) {
          startNewGame();
          return;
        }
      }
      startNewGame();
    }
  });

  // pointer move for hover effect
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    hoverAnswer = null;
    if (gameState === 'playing') {
      for (let a of answers) {
        const dx = x - a.x;
        const dy = y - a.y;
        if (dx * dx + dy * dy <= ANSWER_RADIUS * ANSWER_RADIUS) {
          hoverAnswer = a;
          break;
        }
      }
    }
  });

  canvas.addEventListener('blur', () => {
    keys = {};
  });
  canvas.addEventListener('focus', () => {
    announce('Canvas focused. Use arrow keys to fly. Press Enter to start.');
  });

  // Start rendering loop
  lastTime = performance.now();
  requestAnimationFrame(render);

  gameState = 'start';
  announce(
    'Press Enter to start Drone Math Adventure. Use arrow keys to fly, 1-4 to answer, M to toggle audio, R to restart.'
  );

  // global error handling
  window.addEventListener('error', (ev) => {
    console.error('Unexpected error in game:', ev.message);
    announce('An error occurred in the game. Please reload the page.');
  });
})();