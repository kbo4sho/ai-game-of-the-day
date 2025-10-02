(function () {
  // Enhanced Math Machine Game (visuals & audio improved)
  // Renders inside element with ID 'game-of-the-day-stage'
  // All visuals drawn on canvas. Audio via Web Audio API oscillators.
  // Accessibility: keyboard controls, aria-live updates, visual cues, instructions.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const LEVEL_COUNT = 6; // number of puzzles to beat the game
  const CHOICES = 3;

  // Utility: clamp
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // Find container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with ID "game-of-the-day-stage" not found.');
    return;
  }

  // Configure container
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.width = WIDTH + 'px';
  container.style.height = HEIGHT + 'px';
  container.setAttribute('aria-hidden', 'false');

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Math Machine game area');
  canvas.tabIndex = 0; // allow keyboard focus
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Accessibility live region
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.overflow = 'hidden';
  container.appendChild(live);

  // Audio state
  let audioEnabled = true;
  let audioAvailable = true;
  let audioCtx = null;

  // Attempt to create AudioContext with error handling
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('Web Audio API not supported');
    audioCtx = new AudioCtx();
    // Some browsers require user gesture to resume
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {
        // handle later on user gesture
      });
    }
  } catch (err) {
    console.warn('Audio creation failed:', err);
    audioAvailable = false;
    audioEnabled = false;
  }

  // Ambient audio nodes container
  let ambientNodes = null;

  // Helper to safely stop and disconnect audio nodes
  function safeStop(node) {
    try {
      if (!node) return;
      if (typeof node.stop === 'function') node.stop();
      if (typeof node.disconnect === 'function') node.disconnect();
    } catch (e) {
      // ignore
    }
  }

  // Create low-level noise buffer for soft texture
  function createNoiseBuffer(durationSeconds = 2) {
    if (!audioCtx) return null;
    try {
      const sampleRate = audioCtx.sampleRate;
      const length = Math.floor(durationSeconds * sampleRate);
      const buffer = audioCtx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.25; // low amplitude
      }
      return buffer;
    } catch (e) {
      console.warn('createNoiseBuffer error', e);
      return null;
    }
  }

  // Start ambient soundscape with layered pads and subtle pulses
  function startAmbient() {
    if (!audioAvailable || !audioEnabled || !audioCtx) return;
    stopAmbient();
    try {
      const master = audioCtx.createGain();
      master.gain.value = 0.06;
      master.connect(audioCtx.destination);

      // slow evolving pad - two detuned oscillators
      const padA = audioCtx.createOscillator();
      padA.type = 'sine';
      padA.frequency.value = 80;

      const padB = audioCtx.createOscillator();
      padB.type = 'sine';
      padB.frequency.value = 82.5; // slight detune

      const padGain = audioCtx.createGain();
      padGain.gain.value = 0.0;
      padA.connect(padGain);
      padB.connect(padGain);

      // gentle moving filter for color
      const padFilter = audioCtx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 1200;
      padFilter.Q.value = 0.7;

      padGain.connect(padFilter);
      padFilter.connect(master);

      // LFO to modulate pad filter
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 400;
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      // subtle organic noise loop
      const noiseBuffer = createNoiseBuffer(3);
      let noiseSource = null;
      if (noiseBuffer) {
        noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 1200;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.value = 0.01;
        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(master);
        noiseSource.start();
      }

      // soft pulse / heartbeat to give gentle timing
      const pulseOsc = audioCtx.createOscillator();
      pulseOsc.type = 'sine';
      pulseOsc.frequency.value = 2.2; // sub-audio felt as pulse via gain envelope
      const pulseGain = audioCtx.createGain();
      pulseGain.gain.value = 0.0;
      pulseOsc.connect(pulseGain);
      pulseGain.connect(master);

      // shimmer: occasional bright sparkle (very low probability, short)
      function sparkleOnce() {
        if (!audioCtx) return;
        try {
          const now = audioCtx.currentTime;
          const s = audioCtx.createOscillator();
          s.type = 'triangle';
          s.frequency.value = 990 + Math.random() * 400;
          const sg = audioCtx.createGain();
          sg.gain.value = 0.0001;
          s.connect(sg);
          sg.connect(master);
          s.start(now);
          sg.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
          sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
          s.stop(now + 0.5);
        } catch (e) {
          console.warn('sparkleOnce error', e);
        }
      }

      // start nodes
      padA.start();
      padB.start();
      lfo.start();
      pulseOsc.start();

      // ramp in pad
      padGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      padGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 2.5);

      // slow pulse envelope automation
      const pulseEnvelope = () => {
        try {
          pulseGain.gain.cancelScheduledValues(audioCtx.currentTime);
          pulseGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
          pulseGain.gain.linearRampToValueAtTime(0.02, audioCtx.currentTime + 0.02);
          pulseGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);
        } catch (e) { /* ignore */ }
      };
      // periodic pulse
      const pulseInterval = setInterval(() => {
        if (!audioCtx) return;
        pulseEnvelope();
      }, 1200);

      // occasional sparkles
      const sparkleInterval = setInterval(() => {
        if (Math.random() < 0.28) sparkleOnce();
      }, 1500 + Math.random() * 1000);

      ambientNodes = {
        padA,
        padB,
        padGain,
        padFilter,
        lfo,
        lfoGain,
        noiseSource,
        pulseOsc,
        pulseGain,
        master,
        intervals: [pulseInterval, sparkleInterval]
      };
    } catch (err) {
      console.warn('startAmbient error:', err);
    }
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    try {
      // clear intervals
      if (ambientNodes.intervals) {
        ambientNodes.intervals.forEach(id => clearInterval(id));
      }
      // stop & disconnect nodes
      safeStop(ambientNodes.padA);
      safeStop(ambientNodes.padB);
      safeStop(ambientNodes.lfo);
      safeStop(ambientNodes.noiseSource);
      safeStop(ambientNodes.pulseOsc);
      if (ambientNodes.master && ambientNodes.master.disconnect) ambientNodes.master.disconnect();
    } catch (e) {
      // ignore
    }
    ambientNodes = null;
  }

  // Play a pleasant multi-harmonic chime for correct answers
  function playCorrect() {
    if (!audioAvailable || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const master = audioCtx.createGain();
      master.gain.value = 0.0001;
      master.connect(audioCtx.destination);

      // three partials for a warm bell
      const partials = [880, 1320, 1760]; // fundamental and overtones
      partials.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f * (1 + (i ? 0.01 * (Math.random() - 0.5) : 0));
        const g = audioCtx.createGain();
        g.gain.value = 0.0001;
        // little per-note filter for timbre
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3000 - i * 600;
        o.connect(filter);
        filter.connect(g);
        g.connect(master);
        const start = now + i * 0.06;
        o.start(start);
        g.gain.linearRampToValueAtTime(0.14 / (i + 1), start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
        o.stop(start + 1.0);
      });

      // master envelope
      master.gain.linearRampToValueAtTime(0.12, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      setTimeout(() => {
        try { master.disconnect(); } catch (e) {}
      }, 1400);
    } catch (e) {
      console.warn('playCorrect error', e);
    }
  }

  // Play a friendly buzzer for incorrect answers (short, not harsh)
  function playIncorrect() {
    if (!audioAvailable || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 320;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;
      o.connect(filter);
      filter.connect(g);
      g.connect(audioCtx.destination);
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      o.frequency.setValueAtTime(320, now);
      o.frequency.exponentialRampToValueAtTime(160, now + 0.28);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      o.stop(now + 0.45);
    } catch (e) {
      console.warn('playIncorrect error', e);
    }
  }

  // Click/tick sound for interactions
  function playClick() {
    if (!audioAvailable || !audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 740;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.stop(now + 0.18);
    } catch (e) {
      console.warn('playClick error', e);
    }
  }

  // Ensure audio resumes on user gesture if suspended
  function tryResumeAudio() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        if (audioEnabled) startAmbient();
      }).catch(() => {
        // ignore
      });
    }
  }

  // Game utilities for generating problems (unchanged logic)
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateProblem(levelIndex) {
    const maxSum = levelIndex < 2 ? 10 : levelIndex < 4 ? 15 : 20;
    const isAddition = Math.random() > 0.3;
    if (isAddition) {
      const a = randomInt(0, Math.min(12, maxSum));
      const b = randomInt(0, Math.min(maxSum - a, 12));
      return { type: 'add', a, b, answer: a + b };
    } else {
      const a = randomInt(0, Math.min(maxSum, 18));
      const b = randomInt(0, a);
      return { type: 'sub', a, b, answer: a - b };
    }
  }

  function makeChoices(correct, levelIndex) {
    const choices = new Set([correct]);
    while (choices.size < CHOICES) {
      const spread = Math.max(3, Math.floor(5 + levelIndex * 1.2));
      const candidate = correct + randomInt(-spread, spread);
      if (candidate >= 0 && candidate <= 30) choices.add(candidate);
    }
    const arr = Array.from(choices);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Game state
  const game = {
    levelIndex: 0,
    problems: [],
    currentProblem: null,
    choices: [],
    selectedChoiceIndex: 0,
    score: 0,
    completed: false,
    lastFeedback: '',
    audioMutedManually: false,
    paused: false
  };

  for (let i = 0; i < LEVEL_COUNT; i++) {
    game.problems.push(generateProblem(i));
  }

  function startLevel(index) {
    game.levelIndex = clamp(index, 0, LEVEL_COUNT - 1);
    game.currentProblem = game.problems[game.levelIndex];
    game.choices = makeChoices(game.currentProblem.answer, game.levelIndex);
    game.selectedChoiceIndex = 0;
    game.lastFeedback = `Level ${game.levelIndex + 1} of ${LEVEL_COUNT}: Solve the machine puzzle.`;
    announce(game.lastFeedback);
  }

  function announce(text) {
    live.textContent = text;
  }

  // Layout geometry
  const machineArea = { x: 40, y: 80, w: 420, h: 300 };
  const choicesArea = { x: 480, y: 120, w: 200, h: 260 };

  // Rounded rect helper
  function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = r || 8;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // Gear drawing (polished)
  function drawGear(ctx, cx, cy, radius, teeth, color, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle || 0);
    const inner = radius * 0.66;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const r = i % 2 === 0 ? radius : inner;
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(-radius, -radius, radius, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, shadeColor(color, -18));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = shadeColor(color, -40);
    ctx.lineWidth = 2;
    ctx.stroke();

    // center hub
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#e6f4fb';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // Utility to shade a hex-like CSS color (accepts rgb or hex; but our colors are hex-ish)
  function shadeColor(col, percent) {
    // very simple handling for #rrggbb
    try {
      if (col[0] === '#') {
        const num = parseInt(col.slice(1), 16);
        let r = (num >> 16) + percent;
        let g = ((num >> 8) & 0x00FF) + percent;
        let b = (num & 0x0000FF) + percent;
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        return `rgb(${r},${g},${b})`;
      }
    } catch (e) {
      // fallback
    }
    return col;
  }

  // Confetti celebration (slightly refined)
  let confettiParticles = [];
  function spawnConfetti() {
    confettiParticles = [];
    for (let i = 0; i < 80; i++) {
      confettiParticles.push({
        x: rand(120, WIDTH - 120),
        y: rand(-80, 0),
        vx: (Math.random() - 0.5) * 2.2,
        vy: Math.random() * 2 + 1.4,
        size: rand(6, 12),
        color: `hsl(${Math.floor(Math.random() * 360)}, 75%, 60%)`,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2
      });
    }
  }

  // Enhanced visuals state
  let lastTime = 0;
  let gearAngle = 0;
  let celebrationTime = 0;
  let backgroundParticles = []; // subtle floating shapes
  let eyeBlinkTimer = 0;
  let eyeOpen = 1; // 1 open, 0 closed
  let robotBob = 0;
  let glowPulse = 0;

  // initialize background particles
  (function initBackgroundParticles() {
    backgroundParticles = [];
    for (let i = 0; i < 14; i++) {
      backgroundParticles.push({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        r: 6 + Math.random() * 22,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        hue: 190 + Math.random() * 50,
        alpha: 0.04 + Math.random() * 0.08
      });
    }
  })();

  // draw loop
  function draw(time) {
    const dt = Math.min(0.04, (time - lastTime) / 1000 || 0);
    lastTime = time;

    // update animations
    gearAngle += dt * 0.8;
    eyeBlinkTimer -= dt;
    if (eyeBlinkTimer <= 0) {
      // schedule next blink
      eyeBlinkTimer = 2 + Math.random() * 4;
      // start a blink
      const blinkDuration = 0.14;
      const start = time / 1000;
      // animate eyeOpen using tween values over a small period
      const blinkStart = start;
      const blinkMid = start + blinkDuration / 2;
      const blinkEnd = start + blinkDuration;
      const blinkAnim = (t) => {
        const nowS = audioCtx ? audioCtx.currentTime : performance.now() / 1000;
        const progress = nowS - blinkStart;
        if (progress < 0) return;
        if (progress >= blinkEnd - blinkStart) {
          eyeOpen = 1;
          return;
        }
        if (progress < (blinkMid - blinkStart)) {
          // closing
          eyeOpen = 1 - (progress / ((blinkMid - blinkStart)));
        } else {
          // opening
          eyeOpen = (progress - (blinkMid - blinkStart)) / ((blinkEnd - blinkMid));
        }
        requestAnimationFrame(() => blinkAnim());
      };
      blinkAnim();
    }

    // bob for robot when correct or small idle bob
    robotBob = Math.sin(time / 420) * 2;

    // subtle glow pulse
    glowPulse += dt * 2;
    const glowVal = (Math.sin(glowPulse) + 1) / 2;

    // Background: soft vertical gradient
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#f6fbff');
    bg.addColorStop(0.6, '#e9f6fb');
    bg.addColorStop(1, '#e4f2f9');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // faint organic shapes for depth
    backgroundParticles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -50) p.x = WIDTH + 50;
      if (p.x > WIDTH + 50) p.x = -50;
      if (p.y < -50) p.y = HEIGHT + 50;
      if (p.y > HEIGHT + 50) p.y = -50;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue}, 60%, 85%, ${p.alpha})`;
      ctx.ellipse(p.x, p.y, p.r * 1.5, p.r, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // top banner and title
    ctx.fillStyle = 'rgba(20, 40, 60, 0.02)';
    ctx.fillRect(0, 0, WIDTH, 70);
    ctx.fillStyle = '#123';
    ctx.font = '700 20px system-ui, "Segoe UI", Roboto, Arial';
    ctx.fillText('Math Machines: Fix the Wacky Robot!', 18, 28);
    ctx.font = '12px system-ui, "Segoe UI", Roboto, Arial';
    ctx.fillStyle = '#235';
    ctx.fillText('Solve the math to fit parts into the machine. Use 1-3 keys or arrows + Enter. M to mute.', 18, 48);

    // machine panel with subtle shadow
    ctx.save();
    const panelGrad = ctx.createLinearGradient(machineArea.x, machineArea.y, machineArea.x, machineArea.y + machineArea.h);
    panelGrad.addColorStop(0, '#f7fcff');
    panelGrad.addColorStop(1, '#eef9fc');
    drawRoundedRect(ctx, machineArea.x - 6, machineArea.y - 6, machineArea.w + 12, machineArea.h + 12, 18);
    ctx.fillStyle = 'rgba(10,20,30,0.02)';
    ctx.fill();
    ctx.restore();

    // machine box
    ctx.save();
    drawRoundedRect(ctx, machineArea.x, machineArea.y, machineArea.w, machineArea.h, 16);
    ctx.fillStyle = panelGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(64,130,160,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // draw gears (animated)
    drawGear(ctx, machineArea.x + 80, machineArea.y + 82, 44, 12, '#bcddec', gearAngle * 0.9);
    drawGear(ctx, machineArea.x + 160, machineArea.y + 220, 36, 10, '#d9f0fa', -gearAngle * 1.6);
    drawGear(ctx, machineArea.x + 260, machineArea.y + 120, 26, 8, '#cfeaf5', gearAngle * 0.5);

    // Robot center (canvas-only drawing; animated eyes & subtle gloss)
    const robotX = machineArea.x + 230;
    const robotY = machineArea.y + 160 + robotBob;
    ctx.save();
    ctx.translate(robotX, robotY);

    // body with gradient and slight tilt
    ctx.save();
    ctx.rotate(Math.sin(time / 1200) * 0.02);
    const bodyGrad = ctx.createLinearGradient(-90, -70, 50, 70);
    const progress = game.score / LEVEL_COUNT;
    const baseColor = `rgb(${200 - progress * 40}, ${230 - progress * 60}, ${250 - progress * 80})`;
    bodyGrad.addColorStop(0, shadeColor('#cfeef9', -8));
    bodyGrad.addColorStop(1, baseColor);
    drawRoundedRect(ctx, -90, -70, 140, 120, 18);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(80,140,160,0.14)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // face plate
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-20, -30, 54, 36, 0, 0, Math.PI * 2);
    const faceGrad = ctx.createLinearGradient(-74, -66, 34, 4);
    faceGrad.addColorStop(0, '#ffffff');
    faceGrad.addColorStop(1, '#f1fbff');
    ctx.fillStyle = faceGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,80,90,0.08)';
    ctx.stroke();

    // animated eyes (blink)
    const eyeSize = 6 + progress * 3;
    const eyeShrink = (1 - Math.max(0, Math.min(1, 1 - eyeOpen))) * 1.0;
    // left eye
    ctx.save();
    ctx.translate(-36, -34);
    ctx.fillStyle = '#163';
    ctx.beginPath();
    ctx.ellipse(0, 0, eyeSize, eyeSize * (eyeOpen * 1.0), 0, 0, Math.PI * 2);
    ctx.fill();
    // tiny gleam
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(-1.5, -2, 1.6, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // right eye
    ctx.save();
    ctx.translate(-4, -34);
    ctx.fillStyle = '#163';
    ctx.beginPath();
    ctx.ellipse(0, 0, eyeSize, eyeSize * (eyeOpen * 1.0), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(-1.2, -2, 1.6, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // mouth (smile grows with progress)
    ctx.save();
    ctx.strokeStyle = '#134';
    ctx.lineWidth = 2;
    const smileProgress = progress;
    const mouthY = -12 + (1 - smileProgress) * 6;
    ctx.beginPath();
    ctx.arc(-20, mouthY, 16, 0, Math.PI * (0.5 + 0.5 * smileProgress), false);
    ctx.stroke();
    ctx.restore();

    // small lights / ports on the body
    ctx.fillStyle = '#e2fbff';
    ctx.beginPath();
    ctx.arc(40, -12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-78, -12, 5, 0, Math.PI * 2);
    ctx.fill();

    // clickable antenna with glow when completed
    ctx.fillStyle = '#d5f7ff';
    ctx.fillRect(-6, -92, 12, 28);
    ctx.beginPath();
    ctx.fillStyle = game.completed ? '#8ef0b2' : '#9de4ff';
    ctx.arc(0, -100, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Machine puzzle text (clear, high-contrast)
    ctx.fillStyle = '#133';
    ctx.font = '18px system-ui, "Segoe UI", Roboto, Arial';
    if (game.currentProblem) {
      const p = game.currentProblem;
      const eq = p.type === 'add' ? `${p.a} + ${p.b} = ?` : `${p.a} - ${p.b} = ?`;
      ctx.fillText('Machine Puzzle: ' + eq, machineArea.x + 16, machineArea.y + 40);
    } else {
      ctx.fillText('Loading puzzle...', machineArea.x + 16, machineArea.y + 40);
    }

    // Indicator for robot "health" or fill (progress bars)
    ctx.save();
    const miniX = machineArea.x + 12;
    const miniY = machineArea.y + machineArea.h - 28;
    for (let i = 0; i < LEVEL_COUNT; i++) {
      ctx.beginPath();
      ctx.fillStyle = i < game.score ? '#8ee6b7' : '#e9f5f8';
      ctx.fillRect(miniX + i * 22, miniY, 18, 10);
      ctx.strokeStyle = 'rgba(20,60,80,0.06)';
      ctx.strokeRect(miniX + i * 22, miniY, 18, 10);
    }
    ctx.restore();

    // Choices panel
    ctx.save();
    drawRoundedRect(ctx, choicesArea.x, choicesArea.y, choicesArea.w, choicesArea.h, 12);
    const cgrad = ctx.createLinearGradient(choicesArea.x, choicesArea.y, choicesArea.x, choicesArea.y + choicesArea.h);
    cgrad.addColorStop(0, '#ffffff');
    cgrad.addColorStop(1, '#f6fdff');
    ctx.fillStyle = cgrad;
    ctx.fill();
    ctx.strokeStyle = '#dff3f8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // header
    ctx.fillStyle = '#234';
    ctx.font = '16px system-ui, "Segoe UI", Roboto, Arial';
    ctx.fillText('Parts (choices):', choicesArea.x + 12, choicesArea.y + 28);

    // Draw each choice with gentle animation and focus glow
    const buttonH = 54;
    const gap = 16;
    for (let i = 0; i < CHOICES; i++) {
      const bx = choicesArea.x + 12;
      const by = choicesArea.y + 48 + i * (buttonH + gap);
      const bw = choicesArea.w - 24;
      const isSelected = game.selectedChoiceIndex === i;
      // pulsate selection slightly
      const selPulse = isSelected ? 1 + Math.sin(time / 180) * 0.01 : 1;
      const bh = buttonH * selPulse;
      // position adjust to vertically center when pulsating
      const byAdj = by - (bh - buttonH) / 2;

      // draw button background
      drawRoundedRect(ctx, bx, byAdj, bw, bh, 10);
      ctx.fillStyle = isSelected ? `rgba(123,210,240,${0.14 + 0.06 * glowVal})` : '#fbffff';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#7cc8db' : '#e0f4fb';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // subtle drop shadow for selected
      if (isSelected) {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#000';
        drawRoundedRect(ctx, bx + 2, byAdj + bh - 6, bw - 4, 6, 6);
        ctx.fill();
        ctx.restore();
      }

      // number text
      ctx.fillStyle = '#123';
      ctx.font = '22px system-ui, "Segoe UI", Roboto, Arial';
      const text = game.choices[i] !== undefined ? String(game.choices[i]) : '-';
      ctx.fillText(text, bx + 18, byAdj + bh / 2 + 8);

      // label 1/2/3 for keyboard
      ctx.fillStyle = '#5aa';
      ctx.font = '12px system-ui, "Segoe UI", Roboto, Arial';
      ctx.fillText(`(${i + 1})`, bx + bw - 34, byAdj + 18);

      // If the last feedback was a correct reveal, gently highlight correct answer
      if (game.lastFeedback && game.lastFeedback.includes('Correct') && game.choices[i] === game.currentProblem.answer) {
        ctx.save();
        ctx.globalAlpha = 0.12 + 0.06 * glowVal;
        ctx.fillStyle = '#bff0d6';
        drawRoundedRect(ctx, bx - 2, byAdj - 2, bw + 4, bh + 4, 12);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();

    // Bottom progress bar and controls area
    ctx.save();
    const barX = 18;
    const barY = HEIGHT - 56;
    const barW = WIDTH - 36;
    drawRoundedRect(ctx, barX, barY, barW, 44, 10);
    ctx.fillStyle = '#f6fbff';
    ctx.fill();
    ctx.strokeStyle = '#dff3f8';
    ctx.stroke();

    // filled progress with gradient
    const filledW = (game.score / LEVEL_COUNT) * (barW - 8);
    const filledGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    filledGrad.addColorStop(0, '#bfe8ff');
    filledGrad.addColorStop(1, '#8ee6b7');
    drawRoundedRect(ctx, barX + 4, barY + 6, Math.max(6, filledW), 32, 8);
    ctx.fillStyle = filledGrad;
    ctx.fill();

    // progress text
    ctx.fillStyle = '#123';
    ctx.font = '14px system-ui, "Segoe UI", Roboto, Arial';
    ctx.fillText(`Progress: ${game.score} / ${LEVEL_COUNT}`, barX + 12, barY + 28);

    // audio icon (drawn nicer)
    ctx.save();
    const audioX = WIDTH - 72;
    const audioY = 18;
    ctx.translate(audioX, audioY);
    // small rounded speaker
    ctx.fillStyle = audioEnabled ? '#2a9' : '#c0c7cb';
    ctx.beginPath();
    ctx.moveTo(8, 6);
    ctx.lineTo(18, 6);
    ctx.lineTo(26, 0);
    ctx.lineTo(26, 24);
    ctx.lineTo(18, 18);
    ctx.lineTo(8, 18);
    ctx.closePath();
    ctx.fill();
    // wave lines
    if (audioEnabled) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(28, 6);
      ctx.quadraticCurveTo(34, 12, 28, 18);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(2, 2);
      ctx.lineTo(32, 26);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();

    // Feedback text
    ctx.fillStyle = '#145';
    ctx.font = '14px system-ui, "Segoe UI", Roboto, Arial';
    if (game.lastFeedback) {
      ctx.fillText(game.lastFeedback, 18, HEIGHT - 76);
    }

    // Celebration overlay & confetti
    if (game.completed) {
      celebrationTime += dt;
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255, ${0.82})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();

      // animate confetti
      confettiParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02; // gravity
        p.rot += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      ctx.fillStyle = '#134';
      ctx.font = '28px system-ui, "Segoe UI", Roboto, Arial';
      ctx.fillText('Machine Fixed! Great Job!', WIDTH / 2 - 180, HEIGHT / 2 - 10);
      ctx.font = '16px system-ui, "Segoe UI", Roboto, Arial';
      ctx.fillText('Play again? Press R or click the glowing robot.', WIDTH / 2 - 170, HEIGHT / 2 + 20);
    }

    // Clean confetti off-screen
    confettiParticles = confettiParticles.filter(p => p.y < HEIGHT + 80);

    requestAnimationFrame(draw);
  }

  // Interaction handling
  canvas.addEventListener('click', (e) => {
    tryResumeAudio();
    playClick();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // if completed: click on robot area restarts
    if (game.completed) {
      const robotX = machineArea.x + 230;
      const robotY = machineArea.y + 160;
      const dx = x - robotX;
      const dy = y - robotY;
      if (dx > -120 && dx < 120 && dy > -120 && dy < 120) {
        restartGame();
        return;
      }
    }

    // check choices
    for (let i = 0; i < CHOICES; i++) {
      const bx = choicesArea.x + 12;
      const by = choicesArea.y + 48 + i * (54 + 16);
      const bw = choicesArea.w - 24;
      const bh = 54;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        game.selectedChoiceIndex = i;
        handleSubmitChoice();
        return;
      }
    }

    // check audio icon click area (approx)
    const audioX = WIDTH - 72;
    const audioY = 18;
    if (x >= audioX - 6 && x <= audioX + 38 && y >= audioY - 6 && y <= audioY + 30) {
      toggleAudio();
      return;
    }
  });

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    // prevent page scroll for arrow keys when focused inside game
    const allowedKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'm', 'M', 'r', 'R'];
    if (allowedKeys.includes(e.key)) e.preventDefault();

    tryResumeAudio();

    // Number keys 1-3 directly select
    if (/^[1-3]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < CHOICES && !game.completed) {
        game.selectedChoiceIndex = idx;
        playClick();
        handleSubmitChoice();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        if (!game.completed) {
          game.selectedChoiceIndex = (game.selectedChoiceIndex + CHOICES - 1) % CHOICES;
          playClick();
        }
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        if (!game.completed) {
          game.selectedChoiceIndex = (game.selectedChoiceIndex + 1) % CHOICES;
          playClick();
        }
        break;
      case 'Enter':
      case ' ':
        if (game.completed) {
          restartGame();
        } else {
          handleSubmitChoice();
        }
        break;
      case 'm':
      case 'M':
        toggleAudio();
        break;
      case 'r':
      case 'R':
        restartGame();
        break;
      default:
        break;
    }
  });

  // Toggle audio
  function toggleAudio() {
    game.audioMutedManually = !game.audioMutedManually;
    audioEnabled = !game.audioMutedManually && audioAvailable;
    if (audioEnabled) {
      tryResumeAudio();
      startAmbient();
      announce('Audio on');
    } else {
      stopAmbient();
      announce('Audio muted');
    }
    playClick();
  }

  // Submit currently selected choice (mechanics unchanged)
  function handleSubmitChoice() {
    if (!game.currentProblem || game.completed) return;
    const idx = game.selectedChoiceIndex;
    const chosen = game.choices[idx];
    if (chosen === undefined) return;
    if (chosen === game.currentProblem.answer) {
      playCorrect();
      game.score += 1;
      game.lastFeedback = `Correct! ${game.currentProblem.answer} fits perfectly.`;
      announce(game.lastFeedback);
      // advance after delay
      setTimeout(() => {
        if (game.score >= LEVEL_COUNT) {
          completeGame();
        } else {
          startLevel(game.levelIndex + 1);
        }
      }, 700);
    } else {
      playIncorrect();
      game.lastFeedback = `Not quite. ${chosen} doesn't fit. Try again.`;
      announce(game.lastFeedback);
      // small visual feedback (handled by draw loop)
    }
  }

  function completeGame() {
    game.completed = true;
    game.lastFeedback = 'Correct! Machine fixed.';
    announce('Machine fixed! You win!');
    spawnConfetti();
    playCorrect();
    stopAmbient();
    setTimeout(() => {
      if (!game.audioMutedManually) startAmbient();
    }, 2000);
  }

  function restartGame() {
    game.levelIndex = 0;
    game.score = 0;
    game.completed = false;
    game.lastFeedback = 'New game started. Fix all machines!';
    game.problems = [];
    for (let i = 0; i < LEVEL_COUNT; i++) game.problems.push(generateProblem(i));
    startLevel(0);
    announce('Game restarted. Use keys 1-3 or arrow keys and Enter to select a part.');
    playClick();
    tryResumeAudio();
    if (audioEnabled) startAmbient();
  }

  // Initialize game
  function init() {
    if (audioAvailable && audioEnabled) startAmbient();
    startLevel(0);
    requestAnimationFrame(draw);
    announce('Welcome to Math Machines. Press 1, 2, or 3 to choose a part. Press M to toggle audio.');
  }

  // Global error handling
  window.addEventListener('error', function (ev) {
    console.error('Unexpected error', ev.error || ev.message);
    announce('An unexpected error occurred in the game. Please reload the page.');
  });

  // Help via H key
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'h') {
      announce('Help: Solve the math shown using the numbered parts on the right. Use 1-3 or arrows + Enter. Press M to mute.');
    }
  });

  // Resume audio on first interaction
  function ensureUserGestureListener() {
    function resumeOnInteraction() {
      tryResumeAudio();
      if (audioEnabled) startAmbient();
      window.removeEventListener('pointerdown', resumeOnInteraction);
      window.removeEventListener('keydown', resumeOnInteraction);
    }
    window.addEventListener('pointerdown', resumeOnInteraction);
    window.addEventListener('keydown', resumeOnInteraction);
  }
  ensureUserGestureListener();

  // Start the game
  init();

})();