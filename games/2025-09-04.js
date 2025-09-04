(function () {
  // Enhanced Machine Math — Visual & Audio polish only
  // Renders into element with id "game-of-the-day-stage"
  // All visuals use canvas drawing. All sounds via Web Audio API oscillators and filters.
  // Game mechanics (math, rounds, scoring) are unchanged.

  // ---- Config ----
  const WIDTH = 720;
  const HEIGHT = 480;
  const TOTAL_ROUNDS = 8;
  const MAX_TRIES_PER_ROUND = 4;

  // Calming palette with playful accents
  const COLORS = {
    bgTop: '#EAF6FA',
    bgBottom: '#E0F1EE',
    machine: '#DFF0EC',
    accent: '#5F88A2',
    bolt: '#F2B134',
    text: '#16324F',
    panel: '#9FD6C0',
    shadow: 'rgba(0,0,0,0.14)',
    wrong: '#FF6B6B',
    correct: '#39A96B',
    glass: 'rgba(255,255,255,0.6)'
  };

  // Utility
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Container & canvas
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element #game-of-the-day-stage not found.');
    return;
  }
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.userSelect = 'none';

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Machine Math game canvas');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  // ARIA live region for screen readers
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.overflow = 'hidden';
  container.appendChild(live);

  // --- Audio Setup (Web Audio API) ---
  let audioCtx = null;
  let audioAllowed = false;
  let ambientGain = null;
  let ambientNodes = [];
  let analyser = null;

  const safeAudioInit = () => {
    if (audioCtx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported.');
      audioCtx = new AC();
      // Create ambient pad (two oscillators + filtered noise)
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0;
      ambientGain.connect(audioCtx.destination);

      // LFO to modulate filter cutoff or frequency for gentle motion
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 40;

      // Two detuned oscillators
      const oscA = audioCtx.createOscillator();
      const oscB = audioCtx.createOscillator();
      oscA.type = 'sine';
      oscB.type = 'sine';
      oscA.frequency.value = 88;
      oscB.frequency.value = 96;

      const oscAGain = audioCtx.createGain();
      const oscBGain = audioCtx.createGain();
      oscAGain.gain.value = 0.02;
      oscBGain.gain.value = 0.02;

      // gentle lowpass for warmth
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 700;
      lowpass.Q.value = 0.8;

      // create soft noise for texture
      const bufferSize = audioCtx.sampleRate * 1;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.value = 0.004;

      // connect graph
      oscA.connect(oscAGain);
      oscB.connect(oscBGain);
      oscAGain.connect(lowpass);
      oscBGain.connect(lowpass);
      noise.connect(noiseGain);
      noiseGain.connect(lowpass);
      lowpass.connect(ambientGain);

      // LFO connection to detune oscillators slightly
      lfo.connect(lfoGain);
      lfoGain.connect(oscA.frequency);
      lfoGain.connect(oscB.frequency);

      // Analyser for visualizer
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      lowpass.connect(analyser);
      analyser.connect(ambientGain);

      // Start sources but keep ambientGain muted until user enables
      try {
        oscA.start();
        oscB.start();
        lfo.start();
        noise.start();
      } catch (e) {
        // Some browsers require start after resume; that's handled in tryEnableAudio
      }
      ambientNodes = [oscA, oscB, noise, lfo, oscAGain, oscBGain, noiseGain, lowpass, lfoGain];
      return true;
    } catch (err) {
      console.error('Audio init failed:', err);
      audioCtx = null;
      return false;
    }
  };

  const tryEnableAudio = async () => {
    if (!safeAudioInit()) return false;
    try {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      // ramp ambient up gently
      if (ambientGain) {
        ambientGain.gain.cancelScheduledValues(audioCtx.currentTime);
        ambientGain.gain.setValueAtTime(ambientGain.gain.value, audioCtx.currentTime);
        ambientGain.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 0.9);
      }
      audioAllowed = true;
      announceForA11y('Sound enabled.');
      return true;
    } catch (err) {
      console.warn('Could not enable audio:', err);
      return false;
    }
  };

  const toggleAudio = () => {
    if (!audioCtx || !audioAllowed) {
      tryEnableAudio();
      return;
    }
    if (ambientGain) {
      const current = ambientGain.gain.value;
      const target = current > 0.02 ? 0 : 0.06;
      try {
        ambientGain.gain.cancelScheduledValues(audioCtx.currentTime);
        ambientGain.gain.setValueAtTime(current, audioCtx.currentTime);
        ambientGain.gain.linearRampToValueAtTime(target, audioCtx.currentTime + 0.6);
        audioAllowed = target > 0.02;
        announceForA11y(audioAllowed ? 'Sound enabled.' : 'Sound muted.');
      } catch (e) {
        ambientGain.gain.value = target;
        audioAllowed = target > 0.02;
      }
    }
  };

  // Sounds: adjust tick, success chime, wrong buzz, hint ping
  const playAdjust = () => {
    if (!audioCtx || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = 660;
      g.gain.value = 0.001;
      o.connect(g);
      g.connect(audioCtx.destination);
      g.gain.exponentialRampToValueAtTime(0.02, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      o.start(now);
      o.stop(now + 0.14);
      setTimeout(() => {
        g.disconnect();
      }, 300);
    } catch (e) {
      console.warn('playAdjust error', e);
    }
  };

  const playSuccess = () => {
    if (!audioCtx || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [660, 880, 1100];
      const master = audioCtx.createGain();
      master.gain.value = 0.001;
      master.connect(audioCtx.destination);
      master.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        g.gain.value = 0.001;
        o.connect(g);
        g.connect(master);
        const start = now + i * 0.06;
        o.start(start);
        g.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
        o.stop(start + 0.32);
      });
      master.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      setTimeout(() => master.disconnect(), 1100);
    } catch (e) {
      console.warn('playSuccess error', e);
    }
  };

  const playWrong = () => {
    if (!audioCtx || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const f = audioCtx.createBiquadFilter();
      const g = audioCtx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 220;
      f.type = 'lowpass';
      f.frequency.value = 700;
      g.gain.value = 0.001;
      o.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      o.frequency.exponentialRampToValueAtTime(80, now + 0.2);
      o.start(now);
      o.stop(now + 0.28);
      setTimeout(() => {
        g.disconnect();
        f.disconnect();
      }, 500);
    } catch (e) {
      console.warn('playWrong error', e);
    }
  };

  const playHintPing = () => {
    if (!audioCtx || !audioAllowed) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.value = 360;
      g.gain.value = 0.001;
      o.connect(g);
      g.connect(audioCtx.destination);
      g.gain.exponentialRampToValueAtTime(0.03, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      o.start(now);
      o.stop(now + 0.32);
      setTimeout(() => g.disconnect(), 400);
    } catch (e) {
      console.warn('playHintPing error', e);
    }
  };

  // Accessibility helper
  function announceForA11y(text) {
    if (!live) return;
    live.textContent = '';
    setTimeout(() => (live.textContent = text), 50);
  }

  // --- Game Logic (preserved) ---
  class Round {
    constructor(index) {
      this.index = index;
      const problem = Round.generateProblem(index);
      this.a = problem.a;
      this.b = problem.b;
      this.op = problem.op; // '+' or '-'
      this.answer = problem.a + (this.op === '+' ? problem.b : -problem.b);
      this.maxTries = MAX_TRIES_PER_ROUND;
    }

    static generateProblem(index) {
      const difficulty = 1 + Math.floor(index / 3);
      const max = 5 + difficulty * 3;
      const a = Math.floor(Math.random() * (max - 1)) + 1;
      const op = Math.random() < 0.6 || index < 2 ? '+' : '-';
      let b = Math.floor(Math.random() * Math.min(9, max)) + 1;
      if (op === '-' && b > a) {
        b = Math.floor(Math.random() * a) + 1;
      }
      return { a, b, op };
    }
  }

  class Game {
    constructor() {
      this.roundIndex = 0;
      this.round = new Round(0);
      this.currentInput = 0;
      this.score = 0;
      this.triesUsed = 0;
      this.isAnimating = false;
      this.finish = false;
      this.speakerVisible = true;
      this.audioAllowed = audioAllowed;
      this.lastOutcome = null;
      this.animationTimer = 0;
      this.gearAngle = 0;
      this.goalBoltCount = Math.abs(this.round.answer);
      this.boltsEjected = 0;
      this.hintsUsed = 0;
      this.maxHints = 2;
      this.flashTimer = 0;
      this.puffTimer = 0;
      this.updateRoundText();
    }

    updateRoundText() {
      announceForA11y(
        `Round ${this.roundIndex + 1}. Problem: ${this.round.a} ${this.round.op} ${this.round.b}. Use left and right arrows to change your answer. Press Enter to submit.`
      );
    }

    nextRound() {
      this.roundIndex++;
      if (this.roundIndex >= TOTAL_ROUNDS) {
        this.finish = true;
        announceForA11y('All rounds complete. Well done!');
        return;
      }
      this.round = new Round(this.roundIndex);
      this.currentInput = 0;
      this.triesUsed = 0;
      this.lastOutcome = null;
      this.goalBoltCount = Math.abs(this.round.answer);
      this.boltsEjected = 0;
      this.hintsUsed = 0;
      this.flashTimer = 0;
      this.isAnimating = false;
      this.animationTimer = 0;
      this.updateRoundText();
    }

    submitAnswer() {
      if (this.isAnimating || this.finish) return;
      this.triesUsed++;
      const correct = this.currentInput === this.round.answer;
      if (correct) {
        this.score++;
        this.lastOutcome = 'correct';
        this.isAnimating = true;
        this.animationTimer = 0;
        playSuccess();
        announceForA11y('Correct! Great job!');
      } else {
        playWrong();
        this.lastOutcome = 'wrong';
        this.flashTimer = 18;
        if (this.triesUsed >= this.round.maxTries) {
          announceForA11y(
            `That's not right. The correct answer was ${this.round.answer}. Moving to next round.`
          );
          this.isAnimating = true;
          this.animationTimer = 0;
          setTimeout(() => {
            this.nextRound();
          }, 1200);
        } else {
          announceForA11y('Try again.');
        }
      }
    }

    useHint() {
      if (this.hintsUsed >= this.maxHints || this.isAnimating) return;
      this.hintsUsed++;
      let hintText = '';
      if (this.round.op === '+') {
        hintText = `Hint: ${this.round.a} plus ${this.round.b} equals ${this.round.a + this.round.b}.`;
      } else {
        hintText = `Hint: ${this.round.a} minus ${this.round.b} equals ${this.round.a - this.round.b}.`;
      }
      announceForA11y(hintText);
      playHintPing();
    }
  }

  const game = new Game();

  // --- Input handling ---
  const adjustInput = delta => {
    if (game.isAnimating || game.finish) return;
    const min = -20;
    const max = 20;
    game.currentInput = clamp(game.currentInput + delta, min, max);
    announceForA11y(`Answer now ${game.currentInput}`);
    if (audioAllowed) playAdjust();
  };

  // Pointer handling
  canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    handlePointer(x, y);
    if (!audioAllowed) {
      tryEnableAudio();
    }
  });

  const handlePointer = (x, y) => {
    // Regions: left adjust panel, center machine, right controls, top-right speaker
    if (x < 160 && y > 220 && y < 420) {
      if (y < 320) adjustInput(1);
      else adjustInput(-1);
      return;
    }
    if (x > 520 && x < 700 && y > 320 && y < 372) {
      game.submitAnswer();
      return;
    }
    if (x > 520 && x < 700 && y > 185 && y < 230) {
      game.useHint();
      return;
    }
    if (x > 660 && y < 48) {
      toggleAudio();
      return;
    }
    if (x > 200 && x < 520 && y > 150 && y < 330) {
      if (x < (200 + 520) / 2) adjustInput(-1);
      else adjustInput(1);
      return;
    }
  };

  // Keyboard
  window.addEventListener('keydown', e => {
    if (e.altKey || e.metaKey) return;
    if (game.finish && e.key === 'Enter') {
      restartGame();
      return;
    }
    switch (e.key) {
      case 'ArrowLeft':
        adjustInput(-1);
        e.preventDefault();
        break;
      case 'ArrowRight':
        adjustInput(1);
        e.preventDefault();
        break;
      case 'Enter':
        game.submitAnswer();
        e.preventDefault();
        break;
      case 'h':
      case 'H':
        game.useHint();
        e.preventDefault();
        break;
      case 'm':
      case 'M':
        toggleAudio();
        e.preventDefault();
        break;
      default:
        if (/^[0-9]$/.test(e.key)) {
          game.currentInput = Number(e.key);
          announceForA11y(`Answer set to ${game.currentInput}`);
        } else if (e.key === '-') {
          game.currentInput = -Math.abs(game.currentInput || 0);
          announceForA11y(`Answer set to ${game.currentInput}`);
        }
    }
    if (!audioAllowed) {
      tryEnableAudio();
    }
  });

  const restartGame = () => {
    Object.assign(game, new Game());
  };

  // --- Drawing utilities ---
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawGear(ctx, cx, cy, radius, teeth, angle, color, innerRadius = null) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    const spikes = teeth * 2;
    const r0 = innerRadius || radius * 0.6;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const r = i % 2 === 0 ? radius : r0;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // center hole
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Visual elements ---
  function drawBackground() {
    // vertical gradient
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // subtle hex-grid or gears in background (soft)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#2B4B56';
    for (let i = -1; i < 10; i++) {
      const bx = i * 80 + (Date.now() / 700) % 80;
      const by = 40 + ((i * 30) % 200);
      drawGear(
        ctx,
        bx,
        by,
        22,
        8,
        (Date.now() / 2000 + i) % Math.PI,
        '#123'
      );
    }
    ctx.restore();
  }

  function drawTopPanel() {
    ctx.fillStyle = COLORS.panel;
    roundRect(ctx, 12, 12, WIDTH - 24, 72, 14);
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText('Machine Math: Fix the Friendly Machines!', 32, 42);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#234';
    ctx.fillText('Solve the problem and feed the machine bolts. Be gentle with sounds.', 32, 62);

    // speaker icon
    drawSpeakerIcon(660, 34);
  }

  function drawSpeakerIcon(x, y) {
    ctx.save();
    ctx.translate(x, y);
    // small card shadow
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, -26, -18, 52, 36, 6);
    // speaker
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = COLORS.shadow;
    ctx.lineWidth = 1;
    roundRect(ctx, -22, -14, 44, 28, 6);
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.moveTo(-18, 6);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-8, -6);
    ctx.closePath();
    ctx.fill();
    // waves
    ctx.strokeStyle = audioAllowed ? COLORS.bolt : '#BCC';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(6, 0, 8 + i * 6, -0.36, 0.36);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLeftControls() {
    ctx.fillStyle = COLORS.machine;
    roundRect(ctx, 16, 220, 144, 198, 12);
    ctx.fillStyle = '#123';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText('Adjust', 36, 252);

    // big +/- area background
    ctx.fillStyle = '#F7FFFF';
    roundRect(ctx, 28, 280, 120, 60, 10);

    // two large buttons
    ctx.fillStyle = COLORS.accent;
    roundRect(ctx, 32, 292, 52, 44, 8);
    roundRect(ctx, 84, 292, 52, 44, 8);
    ctx.fillStyle = '#fff';
    ctx.font = '28px monospace';
    ctx.fillText('+', 46, 324);
    ctx.fillText('-', 96, 324);

    // guide text
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#234';
    ctx.fillText('Top area adds, bottom subtracts', 26, 366);
  }

  function drawRightPanel() {
    ctx.fillStyle = COLORS.machine;
    roundRect(ctx, 520, 120, 184, 280, 12);
    ctx.fillStyle = '#123';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('Controls', 548, 150);

    // Hint button
    const hintX = 538;
    const hintY = 185;
    const hintW = 150;
    const hintH = 42;
    ctx.fillStyle = '#F0F9F8';
    roundRect(ctx, hintX, hintY, hintW, hintH, 8);
    ctx.fillStyle = COLORS.accent;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Hint (H)', 572, 212);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#345';
    ctx.fillText(`Hints: ${game.hintsUsed}/${game.maxHints}`, 548, 235);

    // Submit button
    const subX = 538;
    const subY = 320;
    const subW = 150;
    const subH = 42;
    ctx.fillStyle = game.isAnimating ? '#E6EEF0' : '#FFF';
    roundRect(ctx, subX, subY, subW, subH, 8);
    ctx.fillStyle = game.isAnimating ? '#9AB' : COLORS.bolt;
    roundRect(ctx, subX + 30, subY + 8, 90, 26, 6);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#123';
    ctx.fillText('Submit (Enter)', 568, 347);

    // Score and round
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText(`Round ${game.roundIndex + 1}/${TOTAL_ROUNDS}`, 548, 270);
    ctx.fillText(`Score: ${game.score}`, 548, 292);
  }

  function drawMachineBody(now) {
    // chassis
    ctx.fillStyle = COLORS.machine;
    roundRect(ctx, 180, 120, 340, 300, 18);

    // top glass window
    ctx.fillStyle = COLORS.glass;
    roundRect(ctx, 200, 150, 300, 140, 12);

    // soft inner glow
    ctx.save();
    const glow = ctx.createRadialGradient(350, 210, 10, 350, 210, 180);
    glow.addColorStop(0, 'rgba(255,255,255,0.18)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    roundRect(ctx, 200, 150, 300, 140, 12);
    ctx.restore();

    // problem text
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 34px monospace';
    const problemText = `${game.round.a} ${game.round.op} ${game.round.b} = ?`;
    const measure = ctx.measureText(problemText);
    ctx.fillText(problemText, 200 + (300 - measure.width) / 2, 190);

    // input display
    ctx.fillStyle = '#EAF9F4';
    roundRect(ctx, 260, 200, 180, 70, 10);
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 36px monospace';
    const inputStr = String(game.currentInput);
    const txtw = ctx.measureText(inputStr).width;
    ctx.fillText(inputStr, 260 + (180 - txtw) / 2, 245);

    // tries info
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#2B4B56';
    ctx.fillText(`Tries: ${game.triesUsed}/${game.round.maxTries}`, 260, 275);

    // friendly robot face inside machine
    drawRobotFace(350, 260, now);

    // gears
    game.gearAngle += 0.018 + (game.lastOutcome === 'correct' ? 0.08 : 0);
    drawGear(ctx, 240, 320, 36, 10, game.gearAngle, '#BCD6D9');
    drawGear(ctx, 380, 310, 28, 8, -game.gearAngle * 1.3, '#AFCFD6');

    // conveyor belt with bolts
    const boltCount = clamp(Math.abs(game.round.answer), 0, 12);
    drawConveyor(230, 360, 260, 48, boltCount);

    // animation for correct
    if (game.lastOutcome === 'correct') {
      if (game.animationTimer < 60) {
        // ejection rings
        for (let i = 0; i < 10; i++) {
          const t = game.animationTimer / 60 + i / 10;
          const alpha = Math.max(0, 1 - t);
          ctx.beginPath();
          ctx.fillStyle = `rgba(242,177,52,${0.9 * alpha})`;
          const rx = 360 + Math.cos((i / 10) * Math.PI * 2) * (50 * t);
          const ry = 300 + Math.sin((i / 10) * Math.PI * 2) * (28 * t);
          ctx.arc(rx, ry, 6 + 8 * t, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        game.boltsEjected = boltCount;
        setTimeout(() => {
          game.isAnimating = false;
          game.lastOutcome = null;
          game.nextRound();
        }, 300);
      }
    }
  }

  function drawRobotFace(cx, cy, now) {
    ctx.save();
    ctx.translate(cx, cy);
    // head
    ctx.fillStyle = '#fff';
    roundRect(ctx, -58, -38, 116, 76, 12);
    // mouth panel
    ctx.fillStyle = '#E0F5F1';
    roundRect(ctx, -30, 10, 60, 14, 6);
    // eyes (blink animation)
    const blink = Math.abs(Math.sin(now / 800 + game.puffTimer * 0.1));
    ctx.fillStyle = '#123';
    ctx.beginPath();
    ctx.arc(-22, -6, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-20, -8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#123';
    ctx.beginPath();
    ctx.arc(22, -6, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(20, -8, 3, 0, Math.PI * 2);
    ctx.fill();
    // cheeks / lights
    ctx.fillStyle = 'rgba(242,177,52,0.12)';
    ctx.beginPath();
    ctx.arc(-36, 10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(36, 10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawConveyor(x, y, w, h, boltCount) {
    ctx.fillStyle = '#E3EEF1';
    roundRect(ctx, x, y, w, h, 12);

    // belt pattern
    ctx.fillStyle = '#D6E9EA';
    const parts = 10;
    for (let i = 0; i < parts; i++) {
      ctx.fillRect(
        x + i * (w / parts) + (Date.now() / 300) % (w / parts),
        y + h / 2 - 3,
        w / 20,
        6
      );
    }

    // bolts
    const c = boltCount;
    const spacing = c > 0 ? w / c : w;
    for (let i = 0; i < c; i++) {
      const cx = x + spacing * (i + 0.5);
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.fillStyle = COLORS.bolt;
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.arc(cx - 4, cy - 4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = COLORS.shadow;
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAudioVisualizer() {
    const visX = 612;
    const visY = 20;
    ctx.save();
    ctx.translate(visX, visY);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    roundRect(ctx, -8, -6, 40, 16, 6);
    if (analyser && audioAllowed) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      try {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const bars = 4;
        for (let i = 0; i < bars; i++) {
          const h = 2 + (avg / 255) * 18 * (0.6 + i * 0.2);
          ctx.fillStyle = COLORS.accent;
          roundRect(ctx, i * 8, 8 - h, 5, h, 1.5);
        }
      } catch (e) {
        // analyser may not be ready, draw idle bars
        for (let i = 0; i < 4; i++) {
          const h = 6 + Math.abs(Math.sin(Date.now() / 400 + i)) * 8;
          ctx.fillStyle = '#BCC';
          roundRect(ctx, i * 8, 8 - h, 5, h, 1.5);
        }
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const h = 6 + Math.abs(Math.sin(Date.now() / 400 + i)) * 8;
        ctx.fillStyle = '#CCC';
        roundRect(ctx, i * 8, 8 - h, 5, h, 1.5);
      }
    }
    ctx.restore();
  }

  function drawFooterInstructions() {
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#2B4B56';
    ctx.fillText('Keys: ← → adjust  Enter submit  H hint  M mute', 22, HEIGHT - 14);
  }

  // --- Render loop ---
  let lastTs = performance.now();
  function render(ts) {
    const now = ts || performance.now();
    const dt = Math.max(0, now - lastTs);
    lastTs = now;

    // background & subtle animations
    drawBackground();
    drawTopPanel();
    drawLeftControls();
    drawRightPanel();
    drawMachineBody(now);

    // small audio visualizer and footer
    drawAudioVisualizer();
    drawFooterInstructions();

    // flash overlay for wrong answers
    if (game.flashTimer > 0) {
      const t = game.flashTimer / 18;
      ctx.fillStyle = `rgba(255,100,100,${0.12 * t})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      game.flashTimer = Math.max(0, game.flashTimer - 1);
    }

    // End screen overlay
    if (game.finish) {
      ctx.fillStyle = 'rgba(10,10,10,0.45)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.fillText('Machine Master!', 240, 210);
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`You scored ${game.score} out of ${TOTAL_ROUNDS}`, 240, 245);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Press Enter to play again', 270, 285);
      requestAnimationFrame(render);
      return;
    }

    // puff timer for robot eyes twitch effect
    game.puffTimer = (game.puffTimer + dt / 1000) % 1000;

    requestAnimationFrame(render);
  }

  // Kick off render loop
  requestAnimationFrame(render);

  // Initial announcements
  announceForA11y(
    'Welcome to Machine Math. Use left and right arrow keys to change your answer, Enter to submit, H for hint, M to toggle sound.'
  );

  // Periodic checks for audio readiness and helpful hint if audio not enabled
  setInterval(() => {
    if (!audioCtx && audioAllowed) safeAudioInit();
    // draw a small hint on canvas if audio not enabled
    if (!audioCtx) {
      ctx.save();
      ctx.fillStyle = 'rgba(20,20,20,0.06)';
      ctx.fillRect(12, HEIGHT - 68, 340, 48);
      ctx.fillStyle = '#123';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('Audio not enabled. Click the speaker icon or press M to enable sounds.', 24, HEIGHT - 42);
      ctx.restore();
    }
  }, 1200);

  // Ensure audio init on first interaction attempts to start oscillators
  canvas.addEventListener('pointerup', () => {
    if (!audioCtx && audioAllowed) safeAudioInit();
  });

  // log
  console.log('Machine Math (enhanced visuals & audio) initialized. Controls: Arrow keys, Enter, H, M.');
})();