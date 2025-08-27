(function() {
  // Enhanced Electricity Math Game (visual & audio improvements only)
  // Renders into element with id "game-of-the-day-stage"
  // Canvas is exactly 720x480. All visuals drawn via canvas.
  // Sounds generated using Web Audio API (oscillators, filters, noise).
  // Game mechanics and math logic preserved from original.

  // -----------------------
  // Setup DOM and Canvas
  // -----------------------
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container element with id "game-of-the-day-stage" not found.');
    return;
  }

  container.innerHTML = '';
  container.style.position = 'relative';
  container.setAttribute('role', 'application');
  container.setAttribute('aria-label', 'Electricity math game for children. Use number keys 1-3 to choose answers.');

  // Create canvas sized exactly 720x480
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Interactive canvas showing the electricity game.');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });

  // Hidden live region for screen readers
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.overflow = 'hidden';
  container.appendChild(live);

  function announce(text) {
    try {
      live.textContent = text;
    } catch (e) {
      // ignore
    }
  }

  // -----------------------
  // Audio setup & helpers (improved background & effects)
  // -----------------------
  let audioEnabled = false;
  let audioContext = null;
  let bgNodes = null; // holds background nodes for control
  let audioInitAttempted = false;

  function createAudioContextSafe() {
    if (audioContext) return audioContext;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported in this browser.');
      audioContext = new AC();
      audioEnabled = true;
      return audioContext;
    } catch (err) {
      console.warn('Audio context creation failed:', err);
      audioContext = null;
      audioEnabled = false;
      return null;
    }
  }

  function ensureAudioOnUserGesture() {
    if (audioContext && audioContext.state !== 'suspended') return true;
    try {
      if (!audioContext) createAudioContextSafe();
      if (!audioContext) return false;
      if (audioContext.state === 'suspended') {
        // resume on gesture
        audioContext.resume().catch((err) => {
          console.warn('Audio resume failed:', err);
        });
      }
      audioEnabled = true;
      return true;
    } catch (e) {
      console.warn('Could not enable audio on gesture:', e);
      audioEnabled = false;
      return false;
    }
  }

  // Utility to create gentle noise buffer for percussive sfx
  function makeNoiseBuffer(durationSec = 0.2) {
    if (!audioContext) return null;
    try {
      const sr = audioContext.sampleRate;
      const len = Math.floor(durationSec * sr);
      const buf = audioContext.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        // pink-ish noise shaping (not exact), gentle profile
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.95));
      }
      return buf;
    } catch (e) {
      console.warn('makeNoiseBuffer error:', e);
      return null;
    }
  }

  // Play a single tone using oscillator with envelope and optional filter
  function playTone(frequency = 440, duration = 0.25, type = 'sine', volume = 0.06, filterQ = 6, filterFreq = null) {
    if (!audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;

      const gain = audioContext.createGain();
      gain.gain.value = 0.0001;

      let out = gain;
      if (filterFreq) {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        filter.Q.value = filterQ;
        osc.connect(filter);
        filter.connect(gain);
        out = gain;
      } else {
        osc.connect(gain);
      }

      const master = audioContext.createGain();
      master.gain.value = volume;
      gain.connect(master);
      master.connect(audioContext.destination);

      // envelope
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(1.0, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.start(now);
      osc.stop(now + duration + 0.05);

      // cleanup
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
          master.disconnect();
          if (filterFreq) {
            // filter is inside chain; let GC handle if disconnected
          }
        } catch (e) {
          // ignore
        }
      };
    } catch (e) {
      console.warn('Error in playTone:', e);
    }
  }

  // Play soft click (for selection) and distinct correct/incorrect cues
  function playClick() {
    if (!ensureAudioOnUserGesture()) return;
    // short high click using a bandpass-ish effect
    playTone(1200, 0.06, 'triangle', 0.02, 2, 2000);
  }

  function playCorrectSound() {
    if (!ensureAudioOnUserGesture()) return;
    try {
      // small 3-note arpeggio with warm timbres
      playTone(880, 0.12, 'sine', 0.045, 4, 800);
      setTimeout(() => playTone(1100, 0.14, 'triangle', 0.045, 4, 1000), 110);
      setTimeout(() => playTone(1320, 0.18, 'sine', 0.05, 4, 1200), 240);

      // gentle sparkling noise burst for shimmer
      const buf = makeNoiseBuffer(0.12);
      if (buf && audioContext) {
        const src = audioContext.createBufferSource();
        src.buffer = buf;
        const hp = audioContext.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1200;
        const g = audioContext.createGain();
        g.gain.value = 0.02;
        src.connect(hp);
        hp.connect(g);
        g.connect(audioContext.destination);
        src.start();
        src.stop(audioContext.currentTime + 0.12);
        src.onended = () => {
          try {
            src.disconnect();
            hp.disconnect();
            g.disconnect();
          } catch (e) {}
        };
      }
    } catch (e) {
      console.warn('playCorrectSound error:', e);
    }
  }

  function playIncorrectSound() {
    if (!ensureAudioOnUserGesture()) return;
    try {
      // low buzzy thud then short noisy fizz
      playTone(160, 0.22, 'sawtooth', 0.06, 3, 400);
      setTimeout(() => {
        const buf = makeNoiseBuffer(0.16);
        if (buf && audioContext) {
          const s = audioContext.createBufferSource();
          s.buffer = buf;
          const lp = audioContext.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1200;
          const g = audioContext.createGain();
          g.gain.value = 0.035;
          s.connect(lp);
          lp.connect(g);
          g.connect(audioContext.destination);
          s.start();
          s.stop(audioContext.currentTime + 0.16);
          s.onended = () => {
            try {
              s.disconnect();
              lp.disconnect();
              g.disconnect();
            } catch (e) {}
          };
        }
      }, 120);
    } catch (e) {
      console.warn('playIncorrectSound error:', e);
    }
  }

  // Start a calming background ambient pad with soft rhythmic pulse
  function startBackgroundMusic() {
    if (!ensureAudioOnUserGesture()) return;
    if (!audioContext) return;
    if (bgNodes) return; // already running
    try {
      const master = audioContext.createGain();
      master.gain.value = 0.03;
      master.connect(audioContext.destination);

      // slow pad oscillator with detune layers
      const oscA = audioContext.createOscillator();
      const oscB = audioContext.createOscillator();
      const padFilter = audioContext.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 900;

      oscA.type = 'sine';
      oscA.frequency.value = 110;
      oscA.detune.value = -6;

      oscB.type = 'sine';
      oscB.frequency.value = 220;
      oscB.detune.value = 8;

      const padGain = audioContext.createGain();
      padGain.gain.value = 0.8;

      oscA.connect(padFilter);
      oscB.connect(padFilter);
      padFilter.connect(padGain);
      padGain.connect(master);

      // slow LFO to modulate pad filter for breath
      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 250;
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      // soft percussive pulse (subtle)
      const pulseGain = audioContext.createGain();
      pulseGain.gain.value = 0.0;
      const pulseOsc = audioContext.createOscillator();
      pulseOsc.type = 'sine';
      pulseOsc.frequency.value = 60; // low thump
      pulseOsc.connect(pulseGain);
      pulseGain.connect(master);

      // heartbeat scheduler (light)
      let pulseTimer = null;
      function schedulePulse() {
        const now = audioContext.currentTime;
        const g = audioContext.createGain();
        g.gain.value = 0.0;
        pulseOsc.connect(g);
        g.connect(master);
        // envelope
        g.gain.setValueAtTime(0.0, now);
        g.gain.linearRampToValueAtTime(0.05, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        // cleanup
        setTimeout(() => {
          try {
            pulseOsc.disconnect(g);
            g.disconnect();
          } catch (e) {}
        }, 400);
      }
      function startPulseLoop() {
        if (pulseTimer) return;
        pulseTimer = setInterval(() => schedulePulse(), 1200 + Math.random() * 800);
      }
      function stopPulseLoop() {
        if (!pulseTimer) return;
        clearInterval(pulseTimer);
        pulseTimer = null;
      }

      // start nodes
      oscA.start();
      oscB.start();
      lfo.start();
      pulseOsc.start();

      startPulseLoop();

      bgNodes = {
        master,
        oscA,
        oscB,
        padFilter,
        padGain,
        lfo,
        lfoGain,
        pulseOsc,
        pulseGain,
        stopPulseLoop
      };
    } catch (e) {
      console.warn('startBackgroundMusic error:', e);
      bgNodes = null;
    }
  }

  function stopBackgroundMusic() {
    if (!bgNodes || !audioContext) return;
    try {
      bgNodes.stopPulseLoop && bgNodes.stopPulseLoop();
      [bgNodes.oscA, bgNodes.oscB, bgNodes.lfo, bgNodes.pulseOsc].forEach((n) => {
        try {
          n && n.stop && n.stop();
        } catch (e) {}
      });
      try {
        bgNodes.master.disconnect();
      } catch (e) {}
    } catch (e) {
      console.warn('stopBackgroundMusic error:', e);
    } finally {
      bgNodes = null;
    }
  }

  // -----------------------
  // Game Variables & State (unchanged mechanics)
  // -----------------------
  const GAME_W = canvas.width;
  const GAME_H = canvas.height;

  let running = true;
  let lastTime = performance.now();

  const characters = { drVolt: { x: 120, y: 120 }, sparky: { x: 600, y: 120 } };

  let score = 0;
  let lives = 3;
  let round = 0;
  let currentQuestion = null;
  let choices = [];
  let chosenIndex = -1;
  let feedbackTimer = 0;
  let feedbackState = null; // 'correct'|'incorrect'|null
  let roundsToLevelUp = 5;
  let difficulty = 1;

  const sparks = [];
  const floatingElectrons = [];

  const highContrast = false;

  for (let i = 0; i < 14; i++) {
    floatingElectrons.push({
      x: Math.random() * GAME_W,
      y: Math.random() * GAME_H,
      r: 3 + Math.random() * 6,
      vx: -0.25 + Math.random() * 0.5,
      vy: -0.15 + Math.random() * 0.3,
      hue: 180 + Math.random() * 80,
      phase: Math.random() * Math.PI * 2,
      ox: 0
    });
  }

  // -----------------------
  // Math Question Generator (preserved)
  // -----------------------
  function newQuestion() {
    round++;
    if ((round - 1) % roundsToLevelUp === 0 && round > 1) {
      difficulty++;
    }
    const add = Math.random() < 0.6;
    let a, b, correct;
    if (difficulty === 1) {
      a = Math.floor(Math.random() * 10) + 1;
      b = Math.floor(Math.random() * 10) + 1;
    } else if (difficulty === 2) {
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * 20) + 1;
    } else {
      a = Math.floor(Math.random() * 40) + 1;
      b = Math.floor(Math.random() * 40) + 1;
    }

    if (add) {
      correct = a + b;
      currentQuestion = { left: a, right: b, op: '+', correct };
    } else {
      if (a < b) [a, b] = [b, a];
      correct = a - b;
      currentQuestion = { left: a, right: b, op: '-', correct };
    }

    const distractors = new Set();
    while (distractors.size < 2) {
      let delta = Math.floor(Math.random() * Math.max(3, Math.ceil(correct * 0.3 + 1))) + 1;
      if (Math.random() < 0.5) delta = -delta;
      const val = Math.max(0, correct + delta);
      if (val !== correct) distractors.add(val);
    }
    choices = [currentQuestion.correct, ...Array.from(distractors)];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    chosenIndex = -1;
    feedbackState = null;
    feedbackTimer = 0;
    announce(`New question: ${currentQuestion.left} ${currentQuestion.op} ${currentQuestion.right}. Choose 1, 2, or 3.`);
  }

  // -----------------------
  // Interaction Handling (preserved logic)
  // -----------------------
  function handleChoice(index) {
    if (!currentQuestion) return;
    if (feedbackState) return;
    chosenIndex = index;
    const value = choices[index];

    // play small click feedback
    playClick();

    if (value === currentQuestion.correct) {
      score += 10 * difficulty;
      playCorrectSound();
      feedbackState = 'correct';
      feedbackTimer = 0;
      // animated spark from battery to bulb
      sparks.push({
        type: 'travel',
        x: 120,
        y: 220,
        tx: 540,
        ty: 220 + index * 90,
        t: 0,
        color: 'rgba(255,230,120,1)'
      });
      announce('Correct! The lamp lights up.');
      for (let i = 0; i < 7; i++) {
        sparks.push({
          type: 'particle',
          x: 540 + (Math.random() - 0.5) * 6,
          y: 220 + index * 90 + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3 - 0.8,
          life: 0.5 + Math.random() * 0.6,
          color: 'rgba(255,235,150,0.95)'
        });
      }
      setTimeout(() => {
        newQuestion();
      }, 1000);
    } else {
      lives = Math.max(0, lives - 1);
      playIncorrectSound();
      feedbackState = 'incorrect';
      feedbackTimer = 0;
      announce('Oops, that was not right. Try the next one.');
      for (let i = 0; i < 6; i++) {
        sparks.push({
          type: 'particle',
          x: 540 + (Math.random() - 0.5) * 6,
          y: 220 + index * 90 + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 2.2,
          vy: (Math.random() - 0.5) * 2.2,
          life: 0.45 + Math.random() * 0.5,
          color: 'rgba(220,90,90,0.95)'
        });
      }
      if (lives <= 0) {
        setTimeout(() => {
          endGame();
        }, 700);
      } else {
        setTimeout(() => {
          newQuestion();
        }, 900);
      }
    }
  }

  // Mouse / touch handling
  canvas.addEventListener('click', function(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
    if (x >= 650 && x <= 692 && y >= 10 && y <= 52) {
      audioEnabled = !audioEnabled;
      if (audioEnabled) {
        ensureAudioOnUserGesture();
        startBackgroundMusic();
        announce('Sound enabled');
      } else {
        stopBackgroundMusic();
        announce('Sound muted');
      }
      return;
    }

    for (let i = 0; i < 3; i++) {
      const bx = 540;
      const by = 220 + i * 90;
      const br = 40;
      if ((x - bx) * (x - bx) + (y - by) * (y - by) <= br * br) {
        handleChoice(i);
        return;
      }
    }

    if (!audioContext) {
      ensureAudioOnUserGesture();
      if (audioEnabled) {
        startBackgroundMusic();
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === '1' || e.key === 'q' || e.key === 'Q') {
      handleChoice(0);
      e.preventDefault();
    } else if (e.key === '2' || e.key === 'w' || e.key === 'W') {
      handleChoice(1);
      e.preventDefault();
    } else if (e.key === '3' || e.key === 'e' || e.key === 'E') {
      handleChoice(2);
      e.preventDefault();
    } else if (e.key === 'm' || e.key === 'M') {
      audioEnabled = !audioEnabled;
      if (audioEnabled) {
        ensureAudioOnUserGesture();
        startBackgroundMusic();
        announce('Sound enabled');
      } else {
        stopBackgroundMusic();
        announce('Sound muted');
      }
    } else if (e.key === 'Enter') {
      if (!currentQuestion) {
        startGame();
      }
    }
  });

  // -----------------------
  // Drawing Functions (visual upgrades)
  // -----------------------
  function drawBackground(now) {
    // sky gradient with soft radial glow (sun)
    const sky = ctx.createLinearGradient(0, 0, 0, GAME_H);
    sky.addColorStop(0, '#e8f7ff');
    sky.addColorStop(0.6, '#f6fbff');
    sky.addColorStop(1, '#fdfefe');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // subtle sun/glow
    const sunX = 580, sunY = 80;
    const rg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 160);
    rg.addColorStop(0, 'rgba(255,240,180,0.35)');
    rg.addColorStop(1, 'rgba(255,240,180,0.03)');
    ctx.fillStyle = rg;
    ctx.fillRect(sunX - 160, sunY - 160, 320, 320);

    // layered gentle hills (more texture)
    drawWavyHills();

    // ambient floating electrons with gentle shimmer (parallax)
    for (const e of floatingElectrons) {
      e.phase += 0.015;
      const ox = Math.sin(e.phase) * 6;
      e.ox = (e.ox * 0.9) + (ox * 0.1);
      ctx.beginPath();
      const glow = ctx.createRadialGradient(e.x + e.ox, e.y, 0, e.x + e.ox, e.y, e.r * 6);
      glow.addColorStop(0, `hsla(${e.hue},85%,60%,0.26)`);
      glow.addColorStop(0.6, `hsla(${e.hue},70%,60%,0.09)`);
      glow.addColorStop(1, `hsla(${e.hue},70%,60%,0)`);
      ctx.fillStyle = glow;
      ctx.arc(e.x + e.ox, e.y, e.r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      // small core
      ctx.beginPath();
      ctx.fillStyle = `hsla(${e.hue},80%,62%,0.95)`;
      ctx.arc(e.x + e.ox, e.y, Math.max(1.5, e.r * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWavyHills() {
    ctx.save();
    ctx.globalAlpha = 0.95;

    ctx.fillStyle = '#e6f8f0';
    ctx.beginPath();
    ctx.moveTo(0, 360);
    ctx.bezierCurveTo(140, 320, 260, 380, 420, 360);
    ctx.bezierCurveTo(500, 340, 620, 380, 720, 360);
    ctx.lineTo(720, 480);
    ctx.lineTo(0, 480);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff9ee';
    ctx.beginPath();
    ctx.moveTo(0, 400);
    ctx.quadraticCurveTo(160, 360, 360, 400);
    ctx.quadraticCurveTo(540, 440, 720, 400);
    ctx.lineTo(720, 480);
    ctx.lineTo(0, 480);
    ctx.closePath();
    ctx.globalAlpha = 0.9;
    ctx.fill();

    ctx.restore();
  }

  let charBobbles = { dr: 0, sp: 0 };

  function drawCharacters(now) {
    // Dr. Volt (animated battery with subtle chrome)
    const x = characters.drVolt.x;
    const y = characters.drVolt.y;
    charBobbles.dr += 0.02;
    const bob = Math.sin(charBobbles.dr) * 3;
    ctx.save();
    ctx.translate(x, y + bob);
    // battery body with soft gradient
    const bodyGrad = ctx.createLinearGradient(-50, -30, 50, 80);
    bodyGrad.addColorStop(0, '#fff1b8');
    bodyGrad.addColorStop(1, '#ffd27a');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#b68a00';
    ctx.lineWidth = 2.5;
    roundRect(ctx, -50, -30, 100, 120, 12, true, true);

    // top terminal bit
    ctx.fillStyle = '#ffecb3';
    ctx.fillRect(-14, -40, 28, 10);

    // face: friendly eyes
    ctx.fillStyle = '#2c2c2c';
    ctx.beginPath();
    ctx.arc(-16, 4, 6, 0, Math.PI * 2);
    ctx.arc(16, 4, 6, 0, Math.PI * 2);
    ctx.fill();

    // smile filament
    ctx.strokeStyle = '#5a3d00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, 24);
    ctx.quadraticCurveTo(0, 36, 20, 24);
    ctx.stroke();

    // goggles with soft shine
    ctx.fillStyle = 'rgba(94,200,255,0.14)';
    ctx.fillRect(-36, -2, 72, 18);
    ctx.strokeStyle = 'rgba(94,200,255,0.65)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-36, -2, 72, 18);

    // subtle shadow underneath character
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(0, 80, 42, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Sparky (lamp) with pulsing glow
    const sx = characters.sparky.x;
    const sy = characters.sparky.y;
    charBobbles.sp += 0.018;
    const bob2 = Math.sin(charBobbles.sp) * 2;
    ctx.save();
    ctx.translate(sx, sy + bob2);

    // bulb glow when any lamp lit: shimmer if any correct feedback currently target matches
    let anyLit = false;
    if (feedbackState === 'correct' && chosenIndex >= 0) {
      anyLit = true;
    }

    // bulb glass
    const bulbGrad = ctx.createRadialGradient(0, 18, 6, 0, 18, 50);
    bulbGrad.addColorStop(0, anyLit ? 'rgba(255,250,210,0.95)' : '#fff6e6');
    bulbGrad.addColorStop(1, anyLit ? 'rgba(255,240,160,0.45)' : '#fff');
    ctx.beginPath();
    ctx.ellipse(0, 20, 36, 44, 0, 0, Math.PI * 2);
    ctx.fillStyle = bulbGrad;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = anyLit ? '#f2ca46' : '#e0e5ea';
    ctx.stroke();

    // filament smile
    ctx.strokeStyle = '#b87300';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-10, 12);
    ctx.quadraticCurveTo(0, 24, 10, 12);
    ctx.stroke();

    // base
    ctx.fillStyle = '#b7c9d9';
    ctx.fillRect(-20, 60, 40, 18);

    // soft glow
    if (anyLit) {
      const glow = ctx.createRadialGradient(0, 20, 36, 0, 20, 120);
      glow.addColorStop(0, 'rgba(255,240,140,0.55)');
      glow.addColorStop(1, 'rgba(255,240,140,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, 20, 120, 44, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // small name labels with subtle shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('Dr. Volt', 70 + 1, 70 + 1);
    ctx.fillText('Sparky', 560 + 1, 70 + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText('Dr. Volt', 70, 70);
    ctx.fillText('Sparky', 560, 70);
    ctx.restore();
  }

  function drawMachineAndChoices(now) {
    // left battery / power plant with slight sheen
    const bx = 120, by = 220;
    ctx.save();
    // battery plate with gradient
    const plateGrad = ctx.createLinearGradient(bx - 60, by - 30, bx + 60, by + 30);
    plateGrad.addColorStop(0, '#ffffff');
    plateGrad.addColorStop(1, '#ffe9b3');
    ctx.fillStyle = plateGrad;
    ctx.strokeStyle = '#cfa23a';
    ctx.lineWidth = 2;
    roundRect(ctx, bx - 60, by - 30, 120, 60, 10, true, true);

    ctx.fillStyle = '#333';
    ctx.font = '18px Arial';
    ctx.fillText('Power Plant', bx - 52, by + 6);

    // small lightning icon with soft inner glow
    ctx.save();
    ctx.translate(bx + 36, by - 10);
    ctx.fillStyle = '#ffd24d';
    ctx.beginPath();
    ctx.moveTo(8, -8);
    ctx.lineTo(-6, 6);
    ctx.lineTo(2, 6);
    ctx.lineTo(-14, 32);
    ctx.lineTo(0, 6);
    ctx.lineTo(-8, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // wires with gradients and small traveling electrons
    for (let i = 0; i < 3; i++) {
      const y = 220 + i * 90;
      drawCurvyWire(180, 220, 480, y, i, now);
    }

    // bulbs on right
    for (let i = 0; i < 3; i++) {
      const cx = 540, cy = 220 + i * 90;
      drawBulb(cx, cy, 40, choices[i], i, now);
    }

    // question panel with soft rounded drop and subtle motion
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, 240, 30, 240, 90, 12, true, true);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1a2a39';
    ctx.font = '22px "Segoe UI", Arial';
    if (currentQuestion) {
      ctx.fillText(`Q: ${currentQuestion.left} ${currentQuestion.op} ${currentQuestion.right} = ?`, 260, 62);
      ctx.font = '16px Arial';
      ctx.fillStyle = '#2b2b2b';
      ctx.fillText('Pick the right lamp: 1, 2, or 3', 260, 88);
    } else {
      ctx.fillText('Press Enter to start', 270, 62);
      ctx.font = '14px Arial';
      ctx.fillStyle = '#2b2b2b';
      ctx.fillText('Help Dr. Volt light the lamps by solving sums!', 260, 90);
    }
    ctx.restore();
  }

  function drawBulb(x, y, r, label, index, now) {
    ctx.save();
    // Determine litness based on current correct/selected state
    let lit = false;
    if (feedbackState === 'correct' && chosenIndex === index) lit = true;
    // During correct feedback we show bright glow over that bulb
    // Outer glass with soft gradient
    const glassGrad = ctx.createRadialGradient(x, y + 6, r * 0.2, x, y + 6, r * 2.8);
    if (lit) {
      glassGrad.addColorStop(0, '#fffef3');
      glassGrad.addColorStop(0.5, '#fff7c8');
      glassGrad.addColorStop(1, 'rgba(255,230,140,0.12)');
    } else {
      glassGrad.addColorStop(0, '#ffffff');
      glassGrad.addColorStop(1, '#f3f7fb');
    }
    ctx.beginPath();
    ctx.ellipse(x, y, r, r + 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = glassGrad;
    ctx.fill();

    // subtle inner reflection
    ctx.beginPath();
    ctx.ellipse(x - r * 0.4, y - r * 0.4, r * 0.5, (r + 8) * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();

    // border and rim
    ctx.lineWidth = 3;
    ctx.strokeStyle = lit ? '#f2ca46' : '#cdd6de';
    ctx.stroke();

    // chosen wrong indicator ring
    if (feedbackState === 'incorrect' && chosenIndex === index) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(215,80,80,0.95)';
      ctx.lineWidth = 5;
      ctx.ellipse(x, y, r + 6, r + 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // filaments
    ctx.strokeStyle = '#b36b00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 4);
    ctx.quadraticCurveTo(x, y - 8, x + 8, y + 4);
    ctx.stroke();

    // base
    ctx.fillStyle = '#aebec9';
    ctx.fillRect(x - 22, y + r + 6, 44, 16);

    // label inside bulb
    ctx.fillStyle = '#2a2a2a';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(label), x, y + 6);

    // index number
    ctx.font = '12px Arial';
    ctx.fillStyle = '#6b6b6b';
    ctx.fillText(String(index + 1), x + r + 18, y + 4);

    // gentle pulse glow for lit bulbs (animated)
    if (lit) {
      const t = (now || performance.now()) / 1000;
      const pulse = 0.45 + Math.sin(t * 4 + index) * 0.12;
      const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.6);
      glow.addColorStop(0, `rgba(255,245,190,${0.35 * pulse})`);
      glow.addColorStop(1, `rgba(255,230,120,${0.02 * pulse})`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 3.6, r * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCurvyWire(sx, sy, tx, ty, i, now) {
    ctx.save();

    // wire gradient
    const hue = 190 + i * 24;
    const grad = ctx.createLinearGradient(sx, sy, tx, ty);
    grad.addColorStop(0, `hsl(${hue},65%,40%)`);
    grad.addColorStop(0.5, `hsl(${hue - 20},85%,55%)`);
    grad.addColorStop(1, `hsl(${hue + 10},65%,40%)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const mx = (sx + tx) / 2 + (i - 1) * 36;
    const my = (sy + ty) / 2 + (i - 1) * 6;
    ctx.quadraticCurveTo(mx, my, tx - 40, ty);
    ctx.stroke();

    // electrons traveling along wire
    const t = ((performance.now() / 800) + i * 0.28) % 1;
    const pos = pointOnQuadratic(sx, sy, mx, my, tx - 40, ty, t);
    ctx.beginPath();
    ctx.fillStyle = `hsl(${hue + 10},85%,58%)`;
    ctx.shadowColor = `rgba(255,255,200,0.55)`;
    ctx.shadowBlur = 8;
    ctx.arc(pos.x, pos.y, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  function drawHUD(now) {
    ctx.save();
    // top-left panel for score & lives with translucency and iconography
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    roundRect(ctx, 10, 10, 220, 72, 12, true, true);
    ctx.fillStyle = '#213844';
    ctx.font = '18px "Segoe UI", Arial';
    ctx.fillText(`Score: ${score}`, 26, 36);
    ctx.fillText(`Lives: ${lives}`, 26, 62);

    // tiny heart/life icons
    for (let i = 0; i < Math.max(0, lives); i++) {
      const hx = 110 + i * 18;
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.moveTo(hx, 46);
      ctx.bezierCurveTo(hx - 6, 36, hx - 18, 44, hx, 58);
      ctx.bezierCurveTo(hx + 18, 44, hx + 6, 36, hx, 46);
      ctx.fill();
    }

    // speaker toggle top-right
    ctx.fillStyle = audioEnabled ? '#ffd24d' : '#e2e2e2';
    ctx.strokeStyle = '#333';
    roundRect(ctx, 650, 10, 42, 42, 10, true, true);

    // speaker glyph
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.moveTo(660, 22);
    ctx.lineTo(670, 22);
    ctx.lineTo(682, 14);
    ctx.lineTo(682, 42);
    ctx.lineTo(670, 34);
    ctx.lineTo(660, 34);
    ctx.closePath();
    ctx.fill();

    if (audioEnabled) {
      ctx.beginPath();
      ctx.strokeStyle = '#fff4b3';
      ctx.lineWidth = 2;
      ctx.arc(692, 30, 8, -0.85, 0.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 2.2;
      ctx.moveTo(682, 22);
      ctx.lineTo(698, 38);
      ctx.stroke();
    }
    ctx.restore();

    // bottom instruction footer
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, 0, GAME_H - 52, GAME_W, 52, 0, true, false);
    ctx.fillStyle = '#23424a';
    ctx.font = '15px Arial';
    ctx.fillText('Use keys 1-3 or click a lamp. Press M to mute/unmute. Press Enter to start.', 18, GAME_H - 22);
    ctx.restore();
  }

  // Helpers: rounded rect similar to original
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof stroke === 'undefined') stroke = true;
    if (typeof r === 'undefined') r = 6;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(60,70,80,0.12)';
      ctx.stroke();
    }
  }

  function pointOnQuadratic(x0, y0, cx, cy, x1, y1, t) {
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    return { x, y };
  }

  // -----------------------
  // Spark/Particle Animation (refined visuals)
  // -----------------------
  function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      if (s.type === 'travel') {
        s.t += dt * 0.9;
        if (s.t >= 1) sparks.splice(i, 1);
      } else if (s.type === 'particle') {
        s.life -= dt;
        s.x += (s.vx || 0) * 40 * dt;
        s.y += (s.vy || 0) * 40 * dt;
        if (s.life <= 0) sparks.splice(i, 1);
      } else {
        sparks.splice(i, 1);
      }
    }
  }

  function drawSparks(now) {
    for (const s of sparks) {
      if (s.type === 'travel') {
        const eased = easeOutExpo(Math.min(1, s.t));
        const px = s.x + (s.tx - s.x) * eased;
        const py = s.y + (s.ty - s.y) * eased;
        ctx.beginPath();
        ctx.fillStyle = s.color || 'rgba(255,220,120,1)';
        ctx.shadowColor = 'rgba(255,230,120,0.7)';
        ctx.shadowBlur = 8;
        ctx.arc(px, py, 5 + Math.sin(eased * Math.PI) * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // trailing glow
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,240,180,0.18)';
        ctx.arc(px - 10, py - 4, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.type === 'particle') {
        const alpha = Math.max(0, s.life / 1.0);
        ctx.beginPath();
        ctx.fillStyle = s.color.replace(/[\d\.]+\)$/,'') ? s.color : `rgba(255,235,150,${alpha})`;
        // try to insert alpha if rgba
        let col = s.color;
        if (col.startsWith('rgba')) {
          col = col.replace(/rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/, `rgba($1,$2,$3,${alpha})`);
        } else if (col.startsWith('rgb(')) {
          col = col.replace(/rgb\(([^,]+),([^,]+),([^)]+)\)/, `rgba($1,$2,$3,${alpha})`);
        }
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 6 * alpha;
        ctx.arc(s.x, s.y, 3 + (1 - alpha) * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  // -----------------------
  // Game Flow (preserved)
  // -----------------------
  function startGame() {
    score = 0;
    lives = 3;
    round = 0;
    difficulty = 1;
    sparks.length = 0;
    newQuestion();
    announce('Game started. Solve the questions to light up the lamps!');
  }

  function endGame() {
    currentQuestion = null;
    choices = [];
    feedbackState = null;
    announce(`Game over. Your final score is ${score}. Press Enter to play again.`);
  }

  // -----------------------
  // Update / Draw Loop
  // -----------------------
  function update(dt) {
    // ambient electrons drift
    for (const e of floatingElectrons) {
      e.x += e.vx * dt * 40;
      e.y += e.vy * dt * 40;
      if (e.x < -20) e.x = GAME_W + 20;
      if (e.x > GAME_W + 20) e.x = -20;
      if (e.y < 40) e.y = GAME_H - 20;
      if (e.y > GAME_H - 20) e.y = 40;
    }

    updateSparks(dt);

    if (feedbackState) {
      feedbackTimer += dt;
      if (feedbackTimer > 1.2) {
        feedbackState = null;
        feedbackTimer = 0;
      }
    }
  }

  function draw(now) {
    ctx.clearRect(0, 0, GAME_W, GAME_H);
    drawBackground(now);

    drawMachineAndChoices(now);
    drawSparks(now);
    drawCharacters(now);
    drawHUD(now);

    if (lives <= 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(8,10,16,0.6)';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      ctx.fillStyle = '#fff';
      ctx.font = '32px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Oh no! The lights went out!', GAME_W / 2, GAME_H / 2 - 20);
      ctx.font = '20px Arial';
      ctx.fillText(`Score: ${score}`, GAME_W / 2, GAME_H / 2 + 20);
      ctx.font = '16px Arial';
      ctx.fillText('Press Enter to try again.', GAME_W / 2, GAME_H / 2 + 52);
      ctx.restore();
    }

    if (!audioContext) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      roundRect(ctx, 200, 380, 320, 70, 12, true, true);
      ctx.fillStyle = '#29404a';
      ctx.font = '15px Arial';
      ctx.fillText('Sound is disabled by the browser. Click or press any key to enable sound.', 210, 412);
      ctx.font = '14px Arial';
      ctx.fillText('You can mute/unmute with M.', 210, 430);
      ctx.restore();
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.04, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  // -----------------------
  // Init Audio attempt (graceful)
  // -----------------------
  try {
    createAudioContextSafe();
    if (audioContext) {
      audioEnabled = true;
      startBackgroundMusic();
    } else {
      audioEnabled = false;
    }
  } catch (e) {
    console.warn('Initial audio setup failed:', e);
  }

  // Start main loop
  requestAnimationFrame(loop);

  // Initial instructions
  announce('Welcome! Press Enter to start the Electricity Math Game. Use number keys 1-3 or click lamps to answer.');

  // Allow restarting via Enter
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (lives <= 0 || !currentQuestion) {
        startGame();
      }
    }
  });

  // Expose small API on container for debugging (non-essential)
  container._electricGame = {
    start: startGame,
    stop: () => (running = false),
    setAudioEnabled: function(on) {
      audioEnabled = !!on;
      if (audioEnabled) {
        ensureAudioOnUserGesture();
        startBackgroundMusic();
      } else {
        stopBackgroundMusic();
      }
    }
  };

  // handle unhandled audio rejections gracefully
  window.addEventListener('unhandledrejection', (ev) => {
    console.warn('Unhandled rejection: ', ev.reason);
  });
})();