(function () {
  // Machine Math — Game of the Day (Visual & Audio enhancements)
  // Note: Game mechanics and math logic are unchanged. Only visuals and audio enhanced.
  // All graphics are drawn on canvas. All sounds generated via Web Audio API.
  // Accessible: keyboard controls, aria-label, visible instructions, audio toggle.

  // Utility helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  // Find container element
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container #game-of-the-day-stage not found.');
    return;
  }
  // Clear container
  container.innerHTML = '';

  // Create canvas and set accessibility attributes
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.display = 'block';
  canvas.setAttribute(
    'role',
    'application'
  );
  canvas.setAttribute(
    'aria-label',
    'Machine Math game. Use arrow keys to change number. Press space or enter to submit. Press M to toggle sound.'
  );
  canvas.tabIndex = 0; // focusable for keyboard
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Game area size requirement: 720 x 480 exactly
  canvas.style.width = '720px';
  canvas.style.height = '480px';

  // Fonts
  const mainFont =
    '600 18px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const largeFont =
    '700 26px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';
  const smallFont =
    '14px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial';

  // Audio setup with robust error handling
  let audioAllowed = true;
  let audioContext = null;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio API not available or blocked:', e);
    audioContext = null;
    audioAllowed = false;
  }

  // Audio nodes (background layered pad)
  let bgNodes = []; // will hold oscillators/gains/filters
  let bgMasterGain = null;
  let bgLFO = null;
  let uiClickGain = null;

  async function ensureAudio() {
    if (!audioContext) return false;
    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      return true;
    } catch (e) {
      console.warn('Unable to resume AudioContext:', e);
      return false;
    }
  }

  // Start layered ambient background hum/pad
  function startBackgroundHum() {
    if (!audioContext || !audioAllowed) return;
    try {
      stopBackgroundHum();

      bgMasterGain = audioContext.createGain();
      bgMasterGain.gain.value = 0.0001;
      bgMasterGain.connect(audioContext.destination);

      // Smooth fade-in
      const now = audioContext.currentTime;
      bgMasterGain.gain.cancelScheduledValues(now);
      bgMasterGain.gain.setValueAtTime(0.0001, now);
      bgMasterGain.gain.linearRampToValueAtTime(0.06, now + 1.2);

      // Low warm oscillator (pad)
      const baseOsc = audioContext.createOscillator();
      baseOsc.type = 'sine';
      baseOsc.frequency.value = 110;
      const baseGain = audioContext.createGain();
      baseGain.gain.value = 0.5;
      baseOsc.connect(baseGain);

      // Slight detuned companion for warmth
      const detuneOsc = audioContext.createOscillator();
      detuneOsc.type = 'sawtooth';
      detuneOsc.frequency.value = 110 * 1.01;
      const detuneGain = audioContext.createGain();
      detuneGain.gain.value = 0.12;
      detuneOsc.connect(detuneGain);

      // Gentle high shimmer
      const shimmerOsc = audioContext.createOscillator();
      shimmerOsc.type = 'triangle';
      shimmerOsc.frequency.value = 440;
      const shimmerGain = audioContext.createGain();
      shimmerGain.gain.value = 0.005;
      shimmerOsc.connect(shimmerGain);

      // A mild lowpass filter to keep it soft
      const lp = audioContext.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 0.6;

      // LFO to modulate master amplitude slightly for breathing effect
      bgLFO = audioContext.createOscillator();
      bgLFO.type = 'sine';
      bgLFO.frequency.value = 0.12;
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 0.03; // amplitude modulation depth

      bgLFO.connect(lfoGain);
      lfoGain.connect(bgMasterGain.gain);

      // Connect oscillators
      baseGain.connect(lp);
      detuneGain.connect(lp);
      shimmerGain.connect(lp);
      lp.connect(bgMasterGain);

      // Start nodes
      baseOsc.start();
      detuneOsc.start();
      shimmerOsc.start();
      bgLFO.start();

      // Keep references for stopping
      bgNodes = [
        { osc: baseOsc, gain: baseGain },
        { osc: detuneOsc, gain: detuneGain },
        { osc: shimmerOsc, gain: shimmerGain },
        { lfo: bgLFO, lfoGain: lfoGain, filter: lp }
      ];
    } catch (e) {
      console.warn('Error starting background hum:', e);
      try {
        stopBackgroundHum();
      } catch (err) {}
    }
  }

  function stopBackgroundHum() {
    try {
      if (!audioContext) return;
      const now = audioContext.currentTime;
      if (bgMasterGain) {
        // fade out gracefully
        bgMasterGain.gain.cancelScheduledValues(now);
        bgMasterGain.gain.setValueAtTime(bgMasterGain.gain.value || 0.0001, now);
        bgMasterGain.gain.linearRampToValueAtTime(0.0001, now + 0.6);
      }
      // stop oscillators after fade
      setTimeout(() => {
        try {
          bgNodes.forEach((n) => {
            if (n.osc) {
              try {
                n.osc.stop();
              } catch (e) {}
              try {
                n.osc.disconnect();
              } catch (e) {}
            }
            if (n.lfo) {
              try {
                n.lfo.stop();
              } catch (e) {}
              try {
                n.lfo.disconnect();
              } catch (e) {}
            }
            if (n.gain) {
              try {
                n.gain.disconnect();
              } catch (e) {}
            }
            if (n.filter) {
              try {
                n.filter.disconnect();
              } catch (e) {}
            }
          });
        } catch (e) {
          console.warn('Error stopping background nodes:', e);
        }
        bgNodes = [];
        if (bgMasterGain) {
          try {
            bgMasterGain.disconnect();
          } catch (e) {}
          bgMasterGain = null;
        }
      }, 700);
    } catch (e) {
      console.warn('Error stopping background hum:', e);
    }
  }

  // UI click sound (short soft click)
  function playClick() {
    if (!audioContext || !gameState.audioOn) return;
    try {
      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      o.type = 'square';
      o.frequency.value = 1200;
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      const hf = audioContext.createBiquadFilter();
      hf.type = 'highpass';
      hf.frequency.value = 800;

      o.connect(g);
      g.connect(hf);
      hf.connect(audioContext.destination);

      o.start(now);
      o.stop(now + 0.14);
      setTimeout(() => {
        try {
          g.disconnect();
          hf.disconnect();
        } catch (e) {}
      }, 300);
    } catch (e) {
      console.warn('Error playing click:', e);
    }
  }

  // Correct sound: small warm bell + soft mechanical twinkle
  function playCorrect() {
    if (!audioContext || !gameState.audioOn) return;
    try {
      const now = audioContext.currentTime;
      // Bell partials
      const freqs = [660, 880, 1320];
      const master = audioContext.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2600;
      master.connect(filter);
      filter.connect(audioContext.destination);

      freqs.forEach((f, i) => {
        const o = audioContext.createOscillator();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const g = audioContext.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.08 / (i + 0.8), now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9 + i * 0.1);
        o.connect(g);
        g.connect(master);
        o.start(now + i * 0.02);
        o.stop(now + 1.02 + i * 0.08);
      });

      // gentle mechanical twinkle (short noise burst through bandpass)
      const noiseBuffer = audioContext.createBuffer(
        1,
        audioContext.sampleRate * 0.12,
        audioContext.sampleRate
      );
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
      const nb = audioContext.createBufferSource();
      nb.buffer = noiseBuffer;
      const nbGain = audioContext.createGain();
      nbGain.gain.setValueAtTime(0.0001, now);
      nbGain.gain.exponentialRampToValueAtTime(0.06, now + 0.005);
      nbGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      const bp = audioContext.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 1.2;
      nb.connect(nbGain);
      nbGain.connect(bp);
      bp.connect(audioContext.destination);
      nb.start(now);
      nb.stop(now + 0.12);

      // cleanup
      setTimeout(() => {
        try {
          master.disconnect();
          filter.disconnect();
        } catch (e) {}
      }, 1400);
    } catch (e) {
      console.warn('Error playing correct sound:', e);
    }
  }

  // Incorrect sound: soft muted buzz with quick decay
  function playIncorrect() {
    if (!audioContext || !gameState.audioOn) return;
    try {
      const now = audioContext.currentTime;
      const o = audioContext.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 220;
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

      const filt = audioContext.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(900, now);
      filt.Q.value = 0.7;

      // slight pitch slide for "oops"
      o.frequency.setValueAtTime(260, now);
      o.frequency.exponentialRampToValueAtTime(200, now + 0.28);

      o.connect(g);
      g.connect(filt);
      filt.connect(audioContext.destination);
      o.start(now);
      o.stop(now + 0.34);

      setTimeout(() => {
        try {
          g.disconnect();
          filt.disconnect();
        } catch (e) {}
      }, 500);
    } catch (e) {
      console.warn('Error playing incorrect sound:', e);
    }
  }

  // Visual and UI elements
  let gameState = {
    round: 0,
    totalRounds: 6,
    score: 0,
    target: 0,
    current: 0,
    needed: 0, // positive => add, negative => remove
    playerChoice: 0,
    message: 'Welcome! Press Space or Enter to start the first round.',
    busy: false, // prevents input during animations
    audioOn: audioAllowed,
    lastFeedback: null, // 'correct' or 'incorrect' for visuals
    lastActionTime: 0
  };

  // Buttons / interactive hit areas
  const ui = {
    plus: { x: 520, y: 360, w: 44, h: 44 },
    minus: { x: 460, y: 360, w: 44, h: 44 },
    submit: { x: 580, y: 360, w: 100, h: 44 },
    next: { x: 580, y: 420, w: 100, h: 36 },
    audioToggle: { x: 680, y: 10, w: 30, h: 30 }
  };

  // Keyboard handling
  const keys = {};

  function initNewRound() {
    gameState.round += 1;
    gameState.busy = false;
    gameState.lastFeedback = null;
    gameState.lastActionTime = Date.now();
    // Generate challenge that practices addition or subtraction
    // For variety: allow both add and remove rounds
    const isAdd = Math.random() > 0.25; // usually add but sometimes remove
    if (isAdd) {
      gameState.target = randInt(6, 15);
      gameState.current = randInt(0, Math.max(0, gameState.target - 1));
    } else {
      // Make a remove round: current > target
      gameState.target = randInt(2, 10);
      gameState.current = randInt(gameState.target + 1, gameState.target + 6);
    }
    gameState.needed = gameState.target - gameState.current;
    // Player choice default: 0 for add, but for remove rounds maybe start at 0 as well
    gameState.playerChoice =
      Math.abs(gameState.needed) > 0 ? Math.abs(gameState.needed) : 1;
    gameState.message = `Round ${gameState.round} of ${gameState.totalRounds}. Help the machine!`;
    // create celebratory particles container cleared
    particles.length = 0;
  }

  // Start the game
  function startGame() {
    gameState.round = 0;
    gameState.score = 0;
    gameState.message = 'Get ready! Press Space or Enter to begin.';
  }

  startGame();

  // Visual: rotating gears use global rotation offset
  let gearRotation = 0;

  // Particle system for feedback (sparks)
  const particles = [];

  // Draw helper: draw a wacky gear (now supports rotation and subtle shading)
  function drawGear(
    ctx,
    cx,
    cy,
    radius,
    teeth = 8,
    color = '#e2b04a',
    stroke = '#8b5a12',
    rotation = 0,
    shine = 0
  ) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    // shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.ellipse(6, radius * 0.82, radius * 0.98, radius * 0.36, Math.PI / 8, 0, Math.PI * 2);
    ctx.fill();

    // gear body
    const inner = radius * 0.6;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const angle = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? radius : inner;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(-radius, -radius, radius, radius);
    grad.addColorStop(0, lighten(color, 0.08));
    grad.addColorStop(1, darken(color, 0.06));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    // center
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#cbb88a';
    ctx.stroke();

    // small highlight if requested
    if (shine > 0) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${0.18 * shine})`;
      ctx.ellipse(
        -radius * 0.35,
        -radius * 0.35,
        radius * 0.28,
        radius * 0.14,
        -Math.PI / 6,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  // Helpers to adjust colors
  function lighten(hex, amt) {
    const c = parseColor(hex);
    c.r = clamp(c.r + Math.round(255 * amt), 0, 255);
    c.g = clamp(c.g + Math.round(255 * amt), 0, 255);
    c.b = clamp(c.b + Math.round(255 * amt), 0, 255);
    return `rgb(${c.r},${c.g},${c.b})`;
  }
  function darken(hex, amt) {
    const c = parseColor(hex);
    c.r = clamp(c.r - Math.round(255 * amt), 0, 255);
    c.g = clamp(c.g - Math.round(255 * amt), 0, 255);
    c.b = clamp(c.b - Math.round(255 * amt), 0, 255);
    return `rgb(${c.r},${c.g},${c.b})`;
  }
  function parseColor(hex) {
    // Accept either #rgb or #rrggbb or rgb() but our inputs are hex-like; fallback to gray
    try {
      if (hex.startsWith('#')) {
        if (hex.length === 4) {
          return {
            r: parseInt(hex[1] + hex[1], 16),
            g: parseInt(hex[2] + hex[2], 16),
            b: parseInt(hex[3] + hex[3], 16)
          };
        } else if (hex.length === 7) {
          return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
          };
        }
      } else if (hex.startsWith('rgb')) {
        const nums = hex.match(/\d+/g).map(Number);
        return { r: nums[0], g: nums[1], b: nums[2] };
      }
    } catch (e) {}
    return { r: 200, g: 200, b: 200 };
  }

  // Draw the wacky mechanic characters with more life (subtle bobbing and eye blink)
  function drawCharacters(ctx, t) {
    const now = t / 1000;
    // Gizmo (mechanic) left
    ctx.save();
    const gizmoX = 60;
    const gizmoY = 120 + Math.sin(now * 1.1) * 3;
    ctx.translate(gizmoX, gizmoY);
    // body shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.ellipse(0, 38, 36, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // body with soft gradient
    const bodyGrad = ctx.createLinearGradient(-36, -20, 36, 60);
    bodyGrad.addColorStop(0, '#7fb0de');
    bodyGrad.addColorStop(1, '#68a0c8');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, -36, -20, 72, 80, 10, true, false);

    // head
    ctx.beginPath();
    const headGrad = ctx.createRadialGradient(0, -40, 6, 0, -40, 40);
    headGrad.addColorStop(0, '#fff5e6');
    headGrad.addColorStop(1, '#ffd89b');
    ctx.fillStyle = headGrad;
    ctx.arc(0, -40, 28, 0, Math.PI * 2);
    ctx.fill();

    // goggles with subtle shine and blinking
    const blink = (Math.sin(now * 3.2) + 1) / 2; // 0..1
    const eyeClose = blink > 0.92 ? 0.8 : 0; // occasional blink
    ctx.fillStyle = '#333';
    ctx.fillRect(-22, -44, 18, 12 * (1 - eyeClose));
    ctx.fillRect(4, -44, 18, 12 * (1 - eyeClose));
    ctx.fillStyle = '#fff';
    ctx.fillRect(-18, -42, 8, 8 * (1 - eyeClose));
    ctx.fillRect(8, -42, 8, 8 * (1 - eyeClose));

    // smile
    ctx.beginPath();
    ctx.strokeStyle = '#b24b4b';
    ctx.lineWidth = 2;
    ctx.arc(0, -34, 10, 0, Math.PI);
    ctx.stroke();

    // hat with subtle tilt
    ctx.save();
    ctx.translate(0, -68);
    ctx.rotate(Math.sin(now * 1.6) * 0.06);
    ctx.fillStyle = '#d95a9b';
    roundRect(ctx, -30, -6, 60, 14, 4, true, false);
    ctx.restore();

    ctx.restore();

    // Bolt the robot on right with soft oscillation
    ctx.save();
    const botX = 620;
    const botY = 130 + Math.cos(now * 0.9) * 3;
    ctx.translate(botX, botY);

    // head shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.ellipse(0, 54, 36, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // head with subtle metallic gradient
    const headG = ctx.createLinearGradient(-30, -60, 30, 60);
    headG.addColorStop(0, '#e9f2f4');
    headG.addColorStop(1, '#dfe7ea');
    ctx.fillStyle = headG;
    ctx.beginPath();
    ctx.arc(0, -30, 30, 0, Math.PI * 2);
    ctx.fill();

    // eye with gentle pupil tracking toward machine (approx)
    const eyeOffset = Math.sin(now * 2.3) * 2;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-10 + eyeOffset, -30 + Math.sin(now * 1.5) * 1.2, 6, 0, Math.PI * 2);
    ctx.fill();

    // torso
    ctx.fillStyle = '#b6d8c9';
    roundRect(ctx, -22, -6, 44, 56, 8, true, false);

    // antenna
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.lineTo(0, -70);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -74, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166';
    ctx.fill();

    ctx.restore();
  }

  // Draw machine and gears (show current count)
  function drawMachine(ctx, x, y, w, h, t) {
    const now = t / 1000;
    // Machine body with card-like soft shadow and subtle pattern
    ctx.save();
    // body shadow
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, x + 6, y + 6, w, h, 10, true, false);

    // machine body
    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, '#eaf7f1');
    bg.addColorStop(1, '#cfe6d6');
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, 12, true, true);
    ctx.strokeStyle = '#a7d0c6';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12, false, true);

    // pipes and cute details
    ctx.fillStyle = '#8fbfbe';
    roundRect(ctx, x - 26, y + 12, 22, h - 24, 6, true, false);
    roundRect(ctx, x + w + 4, y + 12, 22, h - 24, 6, true, false);

    // window with subtle inner bevel and animated gloss
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 18, y + 18, w - 36, h - 36);
    ctx.clip();
    const winG = ctx.createLinearGradient(x + 18, y + 18, x + w - 18, y + h - 18);
    winG.addColorStop(0, 'rgba(255,255,255,0.42)');
    winG.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = winG;
    ctx.fillRect(x + 18, y + 18, w - 36, h - 36);

    // subtle gloss sweep
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(
      x + (w - 36) * ((Math.sin(now * 1.2) + 1) / 2) + 18,
      y + 18,
      60,
      100,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Draw gear slots inside window based on current count
    const cols = 6;
    const rows = 2;
    const slotW = (w - 60) / cols;
    const slotH = (h - 60) / rows;
    let count = gameState.current;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = x + 18 + 30 + c * slotW + slotW / 2;
        const cy = y + 18 + 30 + r * slotH + slotH / 2;
        // Slot background with slightly inset panel
        ctx.beginPath();
        ctx.fillStyle = '#f7fbfb';
        ctx.fillRect(cx - 18, cy - 18, 36, 36);
        ctx.strokeStyle = '#e1e9e6';
        ctx.strokeRect(cx - 18, cy - 18, 36, 36);
        if (idx < gameState.current) {
          // draw small gear with rotation based on index and time
          const rot =
            gearRotation * (1 + (idx % 3) * 0.12) * (idx % 2 === 0 ? 1 : -1);
          drawGear(ctx, cx, cy, 14, 8, '#e2b04a', '#8b5a12', rot, 0.5);
        } else {
          // faint placeholder hint
          ctx.save();
          ctx.globalAlpha = 0.12;
          drawGear(ctx, cx, cy, 14, 8, '#cfd8d2', '#aab1a9', 0, 0);
          ctx.restore();
        }
        idx++;
      }
    }
    ctx.restore();

    // Shows numerical current/target with modern label
    ctx.save();
    ctx.font = largeFont;
    ctx.fillStyle = '#1f3b3a';
    ctx.textAlign = 'left';
    ctx.fillText(`Machine: ${gameState.current} / ${gameState.target} gears`, x + 12, y + h + 28);
    // small progress bar
    const pbX = x + 12;
    const pbY = y + h + 34;
    const pbW = 240;
    const pbH = 8;
    ctx.fillStyle = '#e9f3f1';
    roundRect(ctx, pbX, pbY, pbW, pbH, 6, true, false);
    const progress = clamp(gameState.current / Math.max(1, gameState.target), 0, 1);
    const progressColor = gameState.current >= gameState.target ? '#7ef0a6' : '#ffd166';
    ctx.fillStyle = progressColor;
    roundRect(ctx, pbX + 1, pbY + 1, (pbW - 2) * progress, pbH - 2, 6, true, false);
    ctx.restore();
  }

  // Draw UI controls: plus, minus, submit, audio icon, messages
  function drawUI(ctx, t) {
    const now = t / 1000;
    // Panel background with translucent card and subtle drop shadow
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 12;
    roundRect(ctx, 420, 300, 280, 150, 12, true, false);
    ctx.shadowBlur = 0;

    // Title and instructions with friendly accent bar
    ctx.fillStyle = '#68a0ff';
    roundRect(ctx, 420, 300, 8, 40, 4, true, false);
    ctx.font = mainFont;
    ctx.fillStyle = '#183737';
    ctx.textAlign = 'left';
    ctx.fillText("Gizmo's Gear Picker", 440, 330);

    // Operation text depending on add or remove
    const needed = gameState.needed;
    let task = '';
    if (needed > 0) {
      task = `Add ${needed} gears to reach ${gameState.target}.`;
    } else if (needed < 0) {
      task = `Remove ${Math.abs(needed)} gears to reach ${gameState.target}.`;
    } else {
      task = `Machine already has ${gameState.target} gears. Submit 0 to keep it steady.`;
    }
    ctx.font = smallFont;
    ctx.fillStyle = '#2e2f2f';
    ctx.fillText(task, 440, 352);

    // Draw minus and plus buttons with soft shadow and subtle animation when hovered/active
    drawButton(ctx, ui.minus.x, ui.minus.y, ui.minus.w, ui.minus.h, '−', '#ff7178', now);
    drawButton(ctx, ui.plus.x, ui.plus.y, ui.plus.w, ui.plus.h, '+', '#7adf8a', now);

    // Player choice display as circular dial
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(510, 378, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ddeee7';
    ctx.stroke();
    ctx.font = '700 24px sans-serif';
    ctx.fillStyle = '#183737';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(gameState.playerChoice), 510, 378);
    ctx.restore();

    // Submit button
    drawButton(ctx, ui.submit.x, ui.submit.y, ui.submit.w, ui.submit.h, 'Insert', '#68a0ff', now);

    // Next button (appears after feedback)
    if (gameState.lastFeedback) {
      drawButton(ctx, ui.next.x, ui.next.y, ui.next.w, ui.next.h, 'Next', '#ffd166', now + 0.5);
    }

    // Audio toggle icon with gentle pulsing when on
    drawAudioIcon(ctx, ui.audioToggle.x, ui.audioToggle.y, ui.audioToggle.w, ui.audioToggle.h, gameState.audioOn, now);

    // Message box (subtle icon + text)
    ctx.font = smallFont;
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.fillText(gameState.message, 440, 448);
    ctx.restore();
  }

  function drawAudioIcon(ctx, x, y, w, h, on, t) {
    ctx.save();
    ctx.translate(x, y);
    const pulse = on ? 0.06 + Math.sin(t * 3) * 0.02 : 0;
    ctx.fillStyle = on ? `rgba(126,240,166,${0.95 + pulse})` : '#e8e8e8';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // speaker body
    ctx.moveTo(4, 6);
    ctx.lineTo(10, 6);
    ctx.lineTo(16, 2);
    ctx.lineTo(16, 28);
    ctx.lineTo(10, 24);
    ctx.lineTo(4, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (on) {
      // draw smooth waves
      ctx.beginPath();
      ctx.strokeStyle = '#086c4c';
      ctx.lineWidth = 2;
      ctx.arc(20, 16, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(24, 16, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(20, 8);
      ctx.lineTo(28, 24);
      ctx.strokeStyle = '#b84b4b';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Round rect helper
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function drawButton(ctx, x, y, w, h, text, color, animPhase = 0) {
    ctx.save();
    // subtle animated lift
    const lift = Math.sin(animPhase * 2) * 1.5;
    ctx.translate(0, lift);
    // button shape with gradient
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, lighten(color, 0.06));
    g.addColorStop(1, darken(color, 0.06));
    ctx.fillStyle = g;
    ctx.strokeStyle = '#2e3940';
    ctx.lineWidth = 1.6;
    roundRect(ctx, x, y, w, h, 8, true, true);
    // label
    ctx.fillStyle = '#062726';
    ctx.font = '700 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
  }

  // Visual feedback overlay for correct/incorrect with particles
  function drawFeedback(ctx, t) {
    if (!gameState.lastFeedback) return;
    const elapsed = Date.now() - gameState.lastActionTime;
    if (elapsed > 1800) {
      // clear feedback after time and particles
      gameState.lastFeedback = null;
      particles.length = 0;
      return;
    }
    ctx.save();
    if (gameState.lastFeedback === 'correct') {
      // soft green glow
      ctx.fillStyle = `rgba(120,220,140,${0.22 * (1 - elapsed / 1800)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // spawn particles occasionally during early phase
      if (particles.length < 40 && Math.random() < 0.14) {
        spawnParticles(6, 360, 220);
      }
      // draw gear sparkles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.life -= 1;
        ctx.save();
        ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
        drawGear(ctx, p.x, p.y, p.size, 6, p.color, '#b07a16', p.rotation, 0.8);
        ctx.restore();
        if (p.life <= 0) particles.splice(i, 1);
      }
    } else {
      // red tint for incorrect
      ctx.fillStyle = `rgba(220,100,100,${0.20 * (1 - elapsed / 1800)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // small cross wobble in center
      ctx.save();
      const dx = Math.sin(elapsed / 80) * 8;
      drawWobbleCross(ctx, canvas.width / 2 + dx, canvas.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  function spawnParticles(count, x, y) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2 - 1,
        life: 50 + Math.floor(Math.random() * 40),
        maxLife: 50 + Math.floor(Math.random() * 40),
        size: 6 + Math.random() * 6,
        rotation: Math.random() * Math.PI * 2,
        color: ['#fff3b0', '#ffd166', '#7ef0a6'][Math.floor(Math.random() * 3)]
      });
    }
  }

  function drawWobbleCross(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 12);
    ctx.lineTo(cx + 12, cy + 12);
    ctx.moveTo(cx + 12, cy - 12);
    ctx.lineTo(cx - 12, cy + 12);
    ctx.stroke();
    ctx.restore();
  }

  // Main draw loop
  let lastDraw = performance.now();
  function draw(t) {
    const dt = (t - lastDraw) / 1000;
    lastDraw = t;
    gearRotation += dt * 0.9;

    // Clear background with layered sky + subtle grid pattern
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#f7fcff');
    g.addColorStop(1, '#e9f3f1');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // decorative soft beams (not overwhelming)
    ctx.save();
    ctx.globalAlpha = 0.06;
    for (let i = -1; i < 3; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#dff6f1' : '#eef8fa';
      ctx.beginPath();
      ctx.ellipse(
        150 + i * 240 + Math.sin(t / 2300 + i) * 12,
        80,
        220,
        120,
        Math.PI / 8,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();

    // subtle floating gears in background with rotation
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 90;
      const y = 60 + Math.sin(t / 1000 + i) * 8;
      const rot =
        gearRotation * (0.5 + (i % 3) * 0.3) * (i % 2 ? 1 : -1);
      drawGear(ctx, x, y, 14, 8, '#c7d6f5', '#7b89b1', rot, 0.2);
    }

    // Draw characters and machine
    drawCharacters(ctx, t);
    drawMachine(ctx, 120, 120, 280, 200, t);

    // floating small helper elements
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = '600 12px sans-serif';
    ctx.fillStyle = '#2a3b3a';
    ctx.fillText('Gears are cute — help Gizmo fix the machine!', 10, 24);
    ctx.restore();

    // UI area
    drawUI(ctx, t);

    // Feedback overlay if needed
    drawFeedback(ctx, t);

    // Focus hint and controls text
    ctx.save();
    ctx.font = smallFont;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.fillText(
      'Keyboard: ↑/→ increase, ↓/← decrease, Enter/Space submit, M toggle sound',
      10,
      470
    );
    ctx.restore();

    requestAnimationFrame(draw);
  }

  // Input handling: mouse clicks
  canvas.addEventListener('mousedown', async (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Ensure audio resume on first interaction if blocked
    if (audioContext && audioContext.state === 'suspended') {
      await ensureAudio();
    }

    // Audio toggle
    if (hitTest(mx, my, ui.audioToggle)) {
      toggleAudio();
      playClick();
      return;
    }

    // ignore input if busy animating
    if (gameState.busy) return;

    if (hitTest(mx, my, ui.plus)) {
      changePlayerChoice(1);
      playClick();
      return;
    }
    if (hitTest(mx, my, ui.minus)) {
      changePlayerChoice(-1);
      playClick();
      return;
    }
    if (hitTest(mx, my, ui.submit)) {
      submitChoice();
      playClick();
      return;
    }
    if (gameState.lastFeedback && hitTest(mx, my, ui.next)) {
      playClick();
      if (gameState.round >= gameState.totalRounds) {
        // End of game, reset
        gameState.message = `Game complete! Score: ${gameState.score}/${gameState.totalRounds}. Press Space to play again.`;
        gameState.lastFeedback = null;
      } else {
        initNewRound();
      }
      return;
    }

    // Click on machine area to give focus to canvas for keyboard control
    canvas.focus();
  });

  function hitTest(mx, my, rect) {
    return mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
  }

  // Keyboard input handling
  canvas.addEventListener('keydown', async (e) => {
    // resume audio on first user gesture if suspended
    if (audioContext && audioContext.state === 'suspended') {
      await ensureAudio();
    }

    if (gameState.busy) {
      // allow toggling audio even when busy
      if (e.key.toLowerCase() === 'm') {
        toggleAudio();
        playClick();
      }
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      changePlayerChoice(1);
      e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      changePlayerChoice(-1);
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ') {
      submitChoice();
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'm') {
      toggleAudio();
      e.preventDefault();
    } else if (e.key.toLowerCase() === 'n') {
      if (gameState.lastFeedback) {
        if (gameState.round >= gameState.totalRounds) {
          gameState.message = `Game complete! Score: ${gameState.score}/${gameState.totalRounds}. Press Space to play again.`;
          gameState.lastFeedback = null;
        } else {
          initNewRound();
        }
      }
    } else if (e.key.toLowerCase() === 's') {
      // Start game shortcut
      if (gameState.round === 0) {
        initNewRound();
      }
    }
  });

  function changePlayerChoice(delta) {
    gameState.playerChoice = clamp(gameState.playerChoice + delta, 0, 12);
    gameState.message = `You chose ${gameState.playerChoice}. Press Enter or Insert to try it.`;
  }

  // Submission and checking (mechanics unchanged)
  function submitChoice() {
    if (gameState.round === 0) {
      // start first round
      initNewRound();
      return;
    }
    if (gameState.busy) return;
    const player = gameState.playerChoice;
    // Determine expected value
    const expected = Math.abs(gameState.needed);
    gameState.busy = true;
    if (player === expected) {
      // Correct — animate adding or removing gears
      gameState.message = 'Nice! Gizmo fixed the machine!';
      gameState.score += 1;
      gameState.lastFeedback = 'correct';
      gameState.lastActionTime = Date.now();
      if (gameState.audioOn) playCorrect();
      // animate changing current to target
      const steps = 12;
      const start = gameState.current;
      const delta = gameState.target - gameState.current;
      let i = 0;
      const anim = setInterval(() => {
        i++;
        gameState.current = Math.round((start + (delta * i) / steps));
        if (i >= steps) {
          clearInterval(anim);
          gameState.current = gameState.target;
          gameState.busy = false;
          // show next button or finish
          if (gameState.round >= gameState.totalRounds) {
            gameState.message = `Great work! Final score ${gameState.score}/${gameState.totalRounds}. Press Space to play again.`;
          } else {
            gameState.message = 'Press Next to continue.';
          }
        }
      }, 60);
    } else {
      // Incorrect
      gameState.message = `Oops. Try again or press Next for another machine.`;
      gameState.lastFeedback = 'incorrect';
      gameState.lastActionTime = Date.now();
      if (gameState.audioOn) playIncorrect();
      // small shake animation to indicate wrong
      const start = gameState.current;
      const t0 = Date.now();
      const dur = 600;
      let animId = setInterval(() => {
        const t = Date.now() - t0;
        if (t > dur) {
          clearInterval(animId);
          gameState.busy = false;
        }
      }, 50);
      // allow attempt again — do not change current
      gameState.busy = false;
    }
  }

  function toggleAudio() {
    gameState.audioOn = !gameState.audioOn;
    if (gameState.audioOn) {
      // Attempt to start audio if possible
      ensureAudio().then((ok) => {
        if (!ok) {
          gameState.audioOn = false;
          gameState.message = 'Audio unavailable in this browser. Muted.';
        } else {
          startBackgroundHum();
          gameState.message = 'Audio enabled.';
        }
      });
    } else {
      stopBackgroundHum();
      gameState.message = 'Audio muted (press M to enable).';
    }
  }

  // Start background hum if audio initially allowed
  if (audioContext && gameState.audioOn) {
    // Some browsers require resume on gesture; we still try
    ensureAudio().then((ok) => {
      if (ok) startBackgroundHum();
      else gameState.audioOn = false;
    });
  }

  // Space key to restart on final screen
  window.addEventListener('keydown', (e) => {
    if (
      (e.code === 'Space' || e.key === ' ') &&
      gameState.round >= gameState.totalRounds &&
      !gameState.lastFeedback
    ) {
      startGame();
      canvas.focus();
    }
  });

  // Provide initial message drawn
  requestAnimationFrame(draw);

  // Safety: in case audio fails later, ensure errors are caught
  window.addEventListener('unhandledrejection', function (evt) {
    console.warn('Unhandled promise rejection in game:', evt.reason);
  });

  // Expose some functions for debugging on canvas dataset (not necessary but safe)
  canvas.dataset.gameVersion = 'machine-math-1.1-enhanced';
})();