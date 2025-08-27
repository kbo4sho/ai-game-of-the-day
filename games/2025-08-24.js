(function() {
  // Electricity Math Game (visual & audio polish)
  // Renders into element with ID "game-of-the-day-stage"
  // Canvas size: 720x480
  // All graphics are canvas-drawn. All audio generated with Web Audio API.

  // ------ Setup and safety checks ------
  const STAGE_ID = 'game-of-the-day-stage';
  const WIDTH = 720;
  const HEIGHT = 480;

  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error(`Element with id "${STAGE_ID}" not found.`);
    return;
  }

  stage.innerHTML = '';
  stage.style.position = 'relative';
  stage.style.userSelect = 'none';

  // Create canvas strictly sized 720x480
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Electric Math Game. Use arrow keys to select a bulb and Space or Enter to connect electricity.');
  canvas.style.display = 'block';
  canvas.style.width = `${WIDTH}px`;
  canvas.style.height = `${HEIGHT}px`;
  canvas.style.touchAction = 'manipulation';
  stage.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Create an ARIA live region for accessibility updates
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.overflow = 'hidden';
  stage.appendChild(live);

  // Robust AudioContext creation with error handling
  let audioCtx = null;
  let audioAllowed = true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    } else {
      audioAllowed = false;
      console.warn('Web Audio API not supported in this browser.');
    }
  } catch (e) {
    audioAllowed = false;
    console.warn('Failed to create AudioContext:', e);
  }

  // Audio state storage
  const audioState = {
    enabled: audioAllowed,
    resumed: false,
    bgNodes: null // will hold background oscillator nodes and gain
  };

  // Utility safe creators
  function safeCreateGain() {
    if (!audioCtx) return null;
    try {
      return audioCtx.createGain();
    } catch (e) {
      console.warn('Failed to create GainNode:', e);
      return null;
    }
  }

  function safeCreateOscillator() {
    if (!audioCtx) return null;
    try {
      return audioCtx.createOscillator();
    } catch (e) {
      console.warn('Failed to create OscillatorNode:', e);
      return null;
    }
  }

  function safeCreateFilter() {
    if (!audioCtx) return null;
    try {
      return audioCtx.createBiquadFilter();
    } catch (e) {
      console.warn('Failed to create BiquadFilterNode:', e);
      return null;
    }
  }

  function safeCreatePanner() {
    if (!audioCtx) return null;
    try {
      return audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
    } catch (e) {
      return null;
    }
  }

  // Attempt to resume audio context on first interaction (gesture)
  async function tryResumeAudio() {
    if (!audioCtx || audioState.resumed || !audioState.enabled) return;
    try {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioState.resumed = true;
      startBackgroundHum();
    } catch (e) {
      console.warn('Audio resume failed:', e);
    }
  }

  // ------- Background ambient hum (layered pad with gentle LFO) -------
  function stopBackgroundHum() {
    if (!audioCtx || !audioState.bgNodes) return;
    try {
      const { masterGain, oscA, oscB, lfo } = audioState.bgNodes;
      if (lfo) {
        try { lfo.disconnect(); } catch (e) {}
      }
      if (oscA) {
        try { oscA.stop(); } catch (e) {}
        try { oscA.disconnect(); } catch (e) {}
      }
      if (oscB) {
        try { oscB.stop(); } catch (e) {}
        try { oscB.disconnect(); } catch (e) {}
      }
      if (masterGain) {
        try { masterGain.disconnect(); } catch (e) {}
      }
    } catch (e) {
      console.warn('Error stopping background hum:', e);
    } finally {
      audioState.bgNodes = null;
    }
  }

  function startBackgroundHum() {
    if (!audioCtx || !audioState.enabled) return;
    stopBackgroundHum();
    try {
      const masterGain = safeCreateGain();
      if (!masterGain) return;
      masterGain.gain.value = 0.02; // very subtle
      masterGain.connect(audioCtx.destination);

      // Two detuned oscillators for a warm pad
      const oscA = safeCreateOscillator();
      const oscB = safeCreateOscillator();
      if (!oscA || !oscB) {
        masterGain.disconnect();
        return;
      }
      oscA.type = 'sine';
      oscB.type = 'sine';
      oscA.frequency.value = 110; // base
      oscB.frequency.value = 110 * 1.005; // slight detune

      // Gentle low-pass filter for mellowness
      const filter = safeCreateFilter();
      if (filter) {
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.6;
        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(masterGain);
      } else {
        oscA.connect(masterGain);
        oscB.connect(masterGain);
      }

      // LFO to modulate amplitude for breathing effect
      let lfo = null;
      try {
        lfo = safeCreateOscillator();
        const lfoGain = safeCreateGain();
        if (lfo && lfoGain) {
          lfo.type = 'sine';
          lfo.frequency.value = 0.14; // slow
          lfoGain.gain.value = 0.01; // small amplitude modulation
          lfo.connect(lfoGain);
          lfoGain.connect(masterGain.gain);
          lfo.start();
        }
      } catch (e) {
        // ignore if LFO fails
      }

      oscA.start();
      oscB.start();

      audioState.bgNodes = { masterGain, oscA, oscB, filter, lfo };
    } catch (e) {
      console.warn('Failed to start background hum:', e);
    }
  }

  // ------- Feedback sounds (correct / incorrect) -------
  function playCorrectSound() {
    if (!audioCtx || !audioState.enabled) return;
    tryResumeAudio();
    try {
      const now = audioCtx.currentTime;
      const master = safeCreateGain();
      if (!master) return;
      master.gain.value = 0.0001;
      master.connect(audioCtx.destination);

      // gentle gliss-like arpeggio using triangle waves
      const notes = [880, 1100, 1320];
      notes.forEach((freq, i) => {
        const osc = safeCreateOscillator();
        const g = safeCreateGain();
        const p = safeCreatePanner();
        if (!osc || !g) return;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq * 0.85, now + i * 0.07);
        osc.frequency.exponentialRampToValueAtTime(freq, now + i * 0.07 + 0.12);
        g.gain.setValueAtTime(0.0001, now + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.08, now + i * 0.07 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.42);

        if (p) {
          p.pan.value = (i - 1) * 0.6;
          osc.connect(p);
          p.connect(g);
        } else {
          osc.connect(g);
        }
        g.connect(master);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.45);
        // cleanup scheduled via timeout
        setTimeout(() => {
          try { osc.disconnect(); } catch (e) {}
          try { g.disconnect(); } catch (e) {}
          if (p) try { p.disconnect(); } catch (e) {}
        }, 700);
      });

      // small master envelope
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(1.0, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      setTimeout(() => {
        try { master.disconnect(); } catch (e) {}
      }, 1000);
    } catch (e) {
      console.warn('Correct sound failed:', e);
    }
  }

  function playIncorrectSound() {
    if (!audioCtx || !audioState.enabled) return;
    tryResumeAudio();
    try {
      const now = audioCtx.currentTime;
      const osc = safeCreateOscillator();
      const g = safeCreateGain();
      const filter = safeCreateFilter();
      if (!osc || !g) return;
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now);
      if (filter) {
        filter.type = 'bandpass';
        filter.frequency.value = 400;
        filter.Q.value = 6;
        osc.connect(filter);
        filter.connect(g);
      } else {
        osc.connect(g);
      }
      g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.5);
      setTimeout(() => {
        try { osc.disconnect(); } catch (e) {}
        if (filter) try { filter.disconnect(); } catch (e) {}
        try { g.disconnect(); } catch (e) {}
      }, 700);
    } catch (e) {
      console.warn('Incorrect sound failed:', e);
    }
  }

  // Toggle audio on/off
  function toggleAudio() {
    audioState.enabled = !audioState.enabled;
    if (audioState.enabled) {
      tryResumeAudio();
      startBackgroundHum();
    } else {
      stopBackgroundHum();
    }
  }

  // ------- Game Logic (unchanged mechanics) -------
  const GAME = {
    level: 1,
    score: 0,
    lives: 3,
    round: 0,
    playing: true,
    selectedIndex: 0,
    options: [],
    correctIndex: 0,
    a: 0,
    b: 0,
    animParticles: [],
    ui: {},
    // visual timing helpers
    lastCorrectTime: 0,
    recentIncorrect: 0
  };

  // Characters definition (visual only)
  const CHARACTERS = [
    { name: 'Sparky', color: '#FFD34D' },
    { name: 'Bulby', color: '#FCE8A8' },
    { name: 'Dr. Ohm', color: '#B4E4FF' }
  ];

  // Reset and round generators (logic preserved)
  function resetGame() {
    GAME.level = 1;
    GAME.score = 0;
    GAME.lives = 3;
    GAME.round = 0;
    GAME.playing = true;
    GAME.selectedIndex = 0;
    GAME.animParticles = [];
    nextRound();
    live.textContent = 'Game started. Use left and right arrow keys to choose a bulb, Space or Enter to connect.';
  }

  function nextRound() {
    GAME.round++;
    const maxAddend = Math.min(10 + Math.floor(GAME.level * 2), 20);
    const a = Math.floor(Math.random() * (Math.min(6 + GAME.level, maxAddend)));
    const b = Math.floor(Math.random() * (Math.min(6 + GAME.level, maxAddend)));
    GAME.a = a;
    GAME.b = b;
    const sum = a + b;
    const options = new Set();
    options.add(sum);
    while (options.size < 3) {
      let delta = Math.floor(Math.random() * 5) - 2;
      if (Math.random() < 0.2) delta += (Math.random() < 0.5 ? -4 : 4);
      let val = sum + delta;
      if (val < 0) val = Math.abs(val) + 1;
      options.add(val);
    }
    const arr = Array.from(options);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    GAME.options = arr;
    GAME.correctIndex = arr.indexOf(sum);
    GAME.selectedIndex = 0;
    if (GAME.round % 5 === 0) GAME.level++;
    announceRound();
  }

  function announceRound() {
    live.textContent = `Round ${GAME.round}. ${GAME.a} plus ${GAME.b} equals ?. Options are ${GAME.options.join(', ')}. Selected ${GAME.options[GAME.selectedIndex]}.`;
  }

  // Visual positions of bulbs (kept)
  const bulbs = [
    { x: WIDTH * 0.2, y: HEIGHT * 0.65 },
    { x: WIDTH * 0.5, y: HEIGHT * 0.6 },
    { x: WIDTH * 0.8, y: HEIGHT * 0.65 }
  ];

  // Animation state
  let lastTime = performance.now();

  function loop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  // Particles update
  function update(dt) {
    GAME.animParticles.forEach(p => {
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.size *= (1 - dt * 0.9);
    });
    GAME.animParticles = GAME.animParticles.filter(p => p.life > 0 && p.size > 0.5);
  }

  // Enhanced drawing functions

  // Clear with animated background: soft radial gradient and drifting orbs
  function clear(now = 0) {
    // subtle moving radial gradient
    const t = now / 1000 || 0;
    const grd = ctx.createLinearGradient(0, Math.sin(t * 0.07) * 50, 0, HEIGHT + Math.cos(t * 0.05) * 30);
    grd.addColorStop(0, '#E9F9FF');
    grd.addColorStop(0.6, '#F7FFF8');
    grd.addColorStop(1, '#FEFFF8');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // animated faint circuit lines with moving phase
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#AEEFE0';
    ctx.lineWidth = 2;
    const phase = Math.sin(t * 0.8) * 12;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const y = 60 + i * 60 + Math.sin(t * 0.6 + i) * 8;
      for (let x = -20; x < WIDTH + 20; x += 30) {
        ctx.lineTo(x, y + Math.sin((x + i * 40 + phase) / 60) * 6);
      }
      ctx.stroke();
    }
    ctx.restore();

    // drifting soft orbs for depth
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const ox = (i * 133 + (t * (10 + i * 5))) % (WIDTH + 160) - 80;
      const oy = 40 + (i * 40) % (HEIGHT - 120) + Math.sin(t * (0.3 + i * 0.02)) * 12;
      const r = 50 + (i % 3) * 10;
      const oGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
      oGrad.addColorStop(0, `rgba(255,255,255,${0.06 + (i % 2) * 0.02})`);
      oGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = oGrad;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Characters: more lively, subtle bobbing and shadow
  function drawCharacters(now = 0) {
    const t = now / 600;
    // Sparky - left lightning companion
    ctx.save();
    ctx.translate(90, 140 + Math.sin(t) * 3);
    ctx.rotate(Math.sin(Date.now() / 450) * 0.03);
    // shadow
    ctx.beginPath();
    ctx.ellipse(0, 46, 36, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,40,40,0.06)';
    ctx.fill();
    // body (sharp bolt)
    ctx.fillStyle = '#FFD34D';
    ctx.beginPath();
    ctx.moveTo(-12, -36);
    ctx.lineTo(6, -36);
    ctx.lineTo(-2, -10);
    ctx.lineTo(18, -10);
    ctx.lineTo(-8, 40);
    ctx.lineTo(2, 6);
    ctx.lineTo(-18, 6);
    ctx.closePath();
    ctx.fill();
    // eyes with twinkle
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-4, -14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -12, 3, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(-6, -16, 1.4, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.beginPath();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.6;
    ctx.arc(1, -2, 7, 0.2, 3.0);
    ctx.stroke();
    ctx.restore();

    // Dr. Ohm - right robot helper
    ctx.save();
    ctx.translate(WIDTH - 130, 120 + Math.cos(t * 0.8) * 2);
    // shadow
    ctx.beginPath();
    ctx.ellipse(0, 46, 36, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,20,40,0.06)';
    ctx.fill();
    // body
    ctx.fillStyle = '#B4E4FF';
    roundRect(ctx, -28, -36, 56, 62, 6);
    ctx.fill();
    // eyes with subtle glow
    ctx.fillStyle = '#333';
    roundRect(ctx, -22, -22, 14, 8, 2);
    roundRect(ctx, 8, -22, 14, 8, 2);
    ctx.fillStyle = '#333';
    roundRect(ctx, -8, 2, 16, 6, 2);
    // antenna
    ctx.beginPath();
    ctx.moveTo(18, -36);
    ctx.lineTo(26, -52 + Math.sin(t * 0.5) * 2);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(26, -52 + Math.sin(t * 0.5) * 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFCC66';
    ctx.fill();
    ctx.restore();

    // small helper tooltip near middle
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, WIDTH * 0.5 - 120, 12, 240, 36, 8);
    ctx.fillStyle = '#2E2E2E';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Helpers: Sparky and Dr. Ohm cheer when you light the right bulb!', WIDTH * 0.5, 34);
    ctx.restore();
  }

  // Draw power hub with pulsing glow and tiny animated sparks
  function drawHub(now = 0) {
    const hubX = WIDTH * 0.5;
    const hubY = HEIGHT * 0.25;
    const t = now / 500;
    // pulsing radial glow
    const pulse = 0.8 + 0.2 * Math.sin(t * 1.5);
    const grd = ctx.createRadialGradient(hubX, hubY, 8, hubX, hubY, 120);
    grd.addColorStop(0, `rgba(255,243,160,${0.95 * pulse})`);
    grd.addColorStop(0.5, `rgba(255,208,90,${0.6 * pulse})`);
    grd.addColorStop(1, 'rgba(255,210,80,0.0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(hubX, hubY, 96, 0, Math.PI * 2);
    ctx.fill();

    // hub body
    ctx.save();
    ctx.beginPath();
    ctx.arc(hubX, hubY, 52, 0, Math.PI * 2);
    const innerGrad = ctx.createLinearGradient(hubX - 40, hubY - 40, hubX + 40, hubY + 40);
    innerGrad.addColorStop(0, '#FFF9D9');
    innerGrad.addColorStop(1, '#FFD27A');
    ctx.fillStyle = innerGrad;
    ctx.fill();
    // center spark icon
    drawSpark(ctx, hubX, hubY, 14, '#FFEE88');
    ctx.restore();

    // label and equation
    ctx.save();
    ctx.fillStyle = '#333';
    ctx.font = '600 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Power Hub', hubX, hubY - 78);
    ctx.font = '28px sans-serif';
    ctx.fillText(`${GAME.a} + ${GAME.b} = ?`, hubX, hubY + 8);
    ctx.restore();
  }

  // Bulbs with glass shine, dynamic filament and selection glow
  function drawBulbs(now = 0) {
    bulbs.forEach((b, idx) => {
      const isSelected = (idx === GAME.selectedIndex);
      const isCorrect = (idx === GAME.correctIndex);
      const t = now / 400;
      // dynamic cable from hub to bulb with wave animation
      const hubX = WIDTH * 0.5;
      const hubY = HEIGHT * 0.25;
      ctx.save();
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      const wave = Math.sin((Date.now() + idx * 120) / 250) * 6;
      const ctrlX = (hubX + b.x) / 2 + wave * (idx - 1);
      const ctrlY = hubY + 80 + (idx - 1) * 6 + Math.cos(now / 700 + idx) * 4;
      // color changes when cable is "energized" (selected)
      const cableGrad = ctx.createLinearGradient(hubX, hubY, b.x, b.y);
      if (isSelected) {
        cableGrad.addColorStop(0, '#FFF1A8');
        cableGrad.addColorStop(1, '#FFD34D');
        ctx.shadowColor = '#FFD34D';
        ctx.shadowBlur = 14;
      } else {
        cableGrad.addColorStop(0, '#B6B6B6');
        cableGrad.addColorStop(1, '#9E9E9E');
        ctx.shadowBlur = 0;
      }
      ctx.strokeStyle = cableGrad;
      ctx.beginPath();
      ctx.moveTo(hubX, hubY + 36);
      ctx.quadraticCurveTo(ctrlX, ctrlY, b.x - 12, b.y - 40);
      ctx.stroke();
      ctx.restore();

      // bulb body
      ctx.save();
      ctx.translate(b.x, b.y);
      const lit = isCorrect && (GAME.lastCorrectTime && (Date.now() - GAME.lastCorrectTime) < 1400);
      const recentErr = isSelected && GAME.recentIncorrect && (Date.now() - GAME.recentIncorrect) < 900;

      // glass gradient (reflections)
      const glassGrad = ctx.createRadialGradient(-6, -12, 4, 6, 8, 60);
      if (lit) {
        glassGrad.addColorStop(0, '#FFFBE8');
        glassGrad.addColorStop(0.6, '#FFF3C8');
        glassGrad.addColorStop(1, '#F1F7F2');
      } else {
        glassGrad.addColorStop(0, '#FFFFFF');
        glassGrad.addColorStop(1, '#EDF7EF');
      }
      ctx.fillStyle = glassGrad;
      // main glass ellipse with slight tilt
      ctx.beginPath();
      ctx.ellipse(0, -6, 36, 48, Math.sin(now / 2300) * 0.02, 0, Math.PI * 2);
      ctx.fill();

      // inner glow when lit
      if (lit) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g2 = ctx.createRadialGradient(0, -8, 0, 0, -8, 34);
        g2.addColorStop(0, 'rgba(255,245,180,0.9)');
        g2.addColorStop(0.5, 'rgba(255,220,100,0.2)');
        g2.addColorStop(1, 'rgba(255,220,100,0.0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.ellipse(0, -8, 34, 46, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (recentErr) {
        // brief reddish flash for incorrect
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = 'rgba(255,150,120,0.12)';
        ctx.beginPath();
        ctx.ellipse(0, -6, 36, 48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // filament - gentle flicker when lit; else dull
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = lit ? '#B37200' : '#C0A080';
      ctx.beginPath();
      const flick = (Math.random() - 0.5) * (lit ? 1.2 : 0.2);
      ctx.moveTo(-12, -4 + flick);
      ctx.quadraticCurveTo(0, -12 + flick, 12, -4 + flick);
      ctx.stroke();
      ctx.restore();

      // screw base
      ctx.fillStyle = '#8E8E8E';
      roundRect(ctx, -16, 30, 32, 10, 4);
      ctx.fillStyle = '#6E6E6E';
      roundRect(ctx, -14, 24, 28, 6, 3);
      ctx.fill();

      // cute face
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(-8, -10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, -10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.4;
      if (isSelected) {
        ctx.arc(0, -2, 8, 0.12, 3.02);
      } else {
        ctx.moveTo(-6, -2);
        ctx.lineTo(6, -2);
      }
      ctx.stroke();

      // answer label below bulb
      ctx.fillStyle = '#222';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(GAME.options[idx], 0, 58);

      // selection halo
      if (isSelected) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = isCorrect ? 'rgba(180,210,80,0.95)' : 'rgba(255,220,120,0.75)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(0, -6, 52, 66, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    });
  }

  // UI drawing: rounded scoreboard, small audio indicator
  function drawUI(now = 0) {
    // scoreboard card with subtle shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'white';
    roundRect(ctx, 12, 8, 260, 44, 10);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#333';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${GAME.score}`, 24, 30);
    ctx.font = '14px sans-serif';
    ctx.fillText(`Level: ${GAME.level}`, 24, 46);

    // Lives as stylized battery icons inside card
    for (let i = 0; i < 3; i++) {
      const x = 120 + i * 28;
      const y = 18;
      ctx.save();
      ctx.strokeStyle = '#AAA';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, 24, 12, 3);
      ctx.stroke();
      ctx.fillStyle = (i < GAME.lives) ? '#66BB6A' : '#EEE';
      roundRect(ctx, x + 1.5, y + 1.5, 21, 9, 2);
      ctx.fill();
      if (i < GAME.lives) {
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.moveTo(x + 12, y + 3);
        ctx.lineTo(x + 8, y + 10);
        ctx.lineTo(x + 13, y + 10);
        ctx.lineTo(x + 10, y + 13);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // audio icon top-right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#333';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Round: ${GAME.round}`, WIDTH - 140, 30);

    ctx.save();
    const sx = WIDTH - 40, sy = 20;
    ctx.translate(sx, sy);
    ctx.fillStyle = audioState.enabled ? '#FFCC66' : '#DDD';
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.2;
    // speaker box
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(-2, -8);
    ctx.lineTo(6, -14);
    ctx.lineTo(6, 14);
    ctx.lineTo(-2, 8);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (audioState.enabled) {
      ctx.strokeStyle = '#FFCC66';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(12, 0, 8, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();

    // Instructions area bottom - card with transparency
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    roundRect(ctx, 12, HEIGHT - 78, WIDTH - 24, 66, 10);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Choose the bulb with the correct answer. Use ← → to select. Press Space/Enter to connect. Click a bulb to select. Press M to toggle sound.', 20, HEIGHT - 46);
    ctx.restore();
  }

  // Draw ongoing particles (sparkles and glow)
  function drawParticles() {
    GAME.animParticles.forEach(p => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(2, p.size * 4));
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // Overlay for game-over
  function drawOverlay() {
    if (!GAME.playing) {
      ctx.save();
      ctx.fillStyle = 'rgba(12,18,28,0.6)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over', WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = '22px sans-serif';
      ctx.fillText(`Score: ${GAME.score}`, WIDTH / 2, HEIGHT / 2 + 18);
      ctx.font = '16px sans-serif';
      ctx.fillText('Press R to play again', WIDTH / 2, HEIGHT / 2 + 48);
      ctx.restore();
    }
  }

  // Main draw combining all
  function draw(now = performance.now()) {
    clear(now);
    drawCharacters(now);
    drawHub(now);
    drawBulbs(now);
    drawUI(now);
    drawParticles();
    drawFooter(now);
    drawOverlay();
  }

  function drawFooter(now = 0) {
    ctx.save();
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Theme: Electricity - Learn addition by lighting bulbs!', WIDTH - 10, HEIGHT - 8);
    ctx.restore();
  }

  // ------ Interaction handlers (mechanics preserved) ------

  // click detection for bulbs (preserve behavior)
  function handleClick(e) {
    tryResumeAudio();

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      const dx = x - b.x;
      const dy = y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) < 60) {
        GAME.selectedIndex = i;
        announceRound();
        handleConfirm();
        return;
      }
    }

    // toggle audio if speaker tapped
    const sx = WIDTH - 40, sy = 16;
    if (x > sx - 20 && x < sx + 30 && y > sy - 20 && y < sy + 20) {
      toggleAudio();
      live.textContent = audioState.enabled ? 'Sound on' : 'Sound off';
    }
  }

  function handleKeyDown(e) {
    tryResumeAudio();

    if (!GAME.playing) {
      if (e.key === 'r' || e.key === 'R') {
        resetGame();
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      GAME.selectedIndex = (GAME.selectedIndex + bulbs.length - 1) % bulbs.length;
      announceRound();
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      GAME.selectedIndex = (GAME.selectedIndex + 1) % bulbs.length;
      announceRound();
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      handleConfirm();
      e.preventDefault();
    } else if (e.key === 'm' || e.key === 'M') {
      toggleAudio();
      live.textContent = audioState.enabled ? 'Sound on' : 'Sound off';
      e.preventDefault();
    }
  }

  function handleConfirm() {
    if (!GAME.playing) return;
    const chosen = GAME.selectedIndex;
    const correct = GAME.correctIndex;
    if (chosen === correct) {
      GAME.score += 10;
      GAME.lastCorrectTime = Date.now();
      playCorrectSound();
      const b = bulbs[chosen];
      for (let i = 0; i < 18; i++) {
        GAME.animParticles.push({
          x: b.x + (Math.random() - 0.5) * 30,
          y: b.y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 60,
          vy: (Math.random() - 1.5) * 60,
          ax: 0,
          ay: 80,
          life: 1.0,
          maxLife: 1.0,
          size: 4 + Math.random() * 4,
          color: `hsl(${Math.random() * 60 + 40}, 80%, ${60 + Math.random() * 10}%)`
        });
      }
      setTimeout(nextRound, 700);
      live.textContent = `Correct! ${GAME.a} + ${GAME.b} = ${GAME.options[chosen]}. Score ${GAME.score}.`;
    } else {
      GAME.lives -= 1;
      GAME.recentIncorrect = Date.now();
      playIncorrectSound();
      const b = bulbs[chosen];
      for (let i = 0; i < 16; i++) {
        GAME.animParticles.push({
          x: b.x + (Math.random() - 0.5) * 30,
          y: b.y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 100,
          vy: (Math.random() - 1) * 60,
          ax: 0,
          ay: 200,
          life: 0.8 + Math.random() * 0.6,
          maxLife: 1.0,
          size: 3 + Math.random() * 3,
          color: `hsl(${Math.random() * 40 + 10}, 90%, ${40 + Math.random() * 20}%)`
        });
      }
      live.textContent = `Oops! ${GAME.options[chosen]} is not ${GAME.a} + ${GAME.b}. Lives: ${GAME.lives}.`;
      if (GAME.lives <= 0) {
        GAME.playing = false;
        stopBackgroundHum();
        live.textContent = `Game over. Final score ${GAME.score}. Press R to play again.`;
      } else {
        setTimeout(() => {
          GAME.selectedIndex = GAME.correctIndex;
          setTimeout(() => {
            GAME.selectedIndex = 0;
            announceRound();
          }, 700);
        }, 300);
      }
    }
  }

  // Event listeners
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('touchstart', function(e) {
    if (e.touches && e.touches.length > 0) {
      const t = e.touches[0];
      handleClick({ clientX: t.clientX, clientY: t.clientY });
    }
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', handleKeyDown);

  // Resume audio upon any user gesture on the canvas
  function userGestureHandler() {
    if (audioCtx && audioCtx.state === 'suspended') {
      tryResumeAudio();
    }
    canvas.removeEventListener('pointerdown', userGestureHandler);
    canvas.removeEventListener('mousedown', userGestureHandler);
    canvas.removeEventListener('touchstart', userGestureHandler);
  }
  canvas.addEventListener('pointerdown', userGestureHandler);
  canvas.addEventListener('mousedown', userGestureHandler);
  canvas.addEventListener('touchstart', userGestureHandler);

  // Initialize game and start loop
  resetGame();
  if (audioState.enabled) {
    try {
      startBackgroundHum();
    } catch (e) {
      console.warn('Background hum start error:', e);
    }
  }
  requestAnimationFrame(loop);

  // Expose a minimal API for possible external controls (non-essential)
  window.__ElectricMathGame = {
    reset: resetGame,
    toggleAudio: toggleAudio,
    getState: () => ({ score: GAME.score, lives: GAME.lives, level: GAME.level, round: GAME.round })
  };

  // Utilities: rounded rectangle, spark, and roundRect helper
  function roundRect(ctx, x, y, w, h, r) {
    if (r < 0) r = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSpark(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((Date.now() % 3600) / 2000);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.25, -size * 0.25);
    ctx.lineTo(size, 0);
    ctx.lineTo(size * 0.25, size * 0.25);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.25, size * 0.25);
    ctx.lineTo(-size, 0);
    ctx.lineTo(-size * 0.25, -size * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Error handling demonstration: watch for context errors
  window.addEventListener('unhandledrejection', function(e) {
    console.warn('Unhandled promise rejection:', e.reason);
  });
})();