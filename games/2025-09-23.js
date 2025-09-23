(function () {
  // Enhanced Machine Math Game visuals & audio (only visuals/audio changed)
  // Renders into the existing element with ID 'game-of-the-day-stage'
  // Canvas-only graphics and Web Audio API for sounds (no external resources)

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const ROUNDS = 8; // Beat after completing ROUNDS targets

  // Get container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container element with ID "game-of-the-day-stage" not found.');
    return;
  }

  // Create canvas and stage wrapper
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = `${WIDTH}px`;
  wrapper.style.height = `${HEIGHT}px`;
  wrapper.style.userSelect = 'none';
  wrapper.style.touchAction = 'manipulation';
  container.innerHTML = '';
  container.appendChild(wrapper);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = 'block';
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Machine Math Game canvas');
  canvas.tabIndex = 0; // focusable
  wrapper.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  // Accessibility live region
  const liveRegion = document.createElement('div');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  liveRegion.setAttribute('aria-live', 'assertive');
  wrapper.appendChild(liveRegion);

  // Audio
  let audioCtx = null;
  let bgGain = null;
  let bgOscA = null;
  let bgOscB = null;
  let bgLFO = null;
  let audioAvailable = false;
  let audioMuted = false;

  // Particle system for subtle visual feedback
  const particles = [];

  // Gentle ambient visuals variables
  let conveyorOffset = 0;

  async function createAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API not supported');
      audioCtx = new AC();

      // Master background gain
      bgGain = audioCtx.createGain();
      bgGain.gain.value = 0.03;
      bgGain.connect(audioCtx.destination);

      // Two detuned sine oscillators to create a soft pad
      bgOscA = audioCtx.createOscillator();
      bgOscB = audioCtx.createOscillator();
      bgOscA.type = 'sine';
      bgOscB.type = 'sine';
      bgOscA.frequency.value = 110;
      bgOscB.frequency.value = 110 * 1.008; // slight detune

      // Lowpass filter for smoothing
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 800;
      lowpass.Q.value = 0.8;

      // subtle slow amplitude tremolo via LFO
      bgLFO = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      bgLFO.type = 'sine';
      bgLFO.frequency.value = 0.12; // calm breathing
      lfoGain.gain.value = 0.012;
      bgLFO.connect(lfoGain);
      lfoGain.connect(bgGain.gain);

      bgOscA.connect(lowpass);
      bgOscB.connect(lowpass);
      lowpass.connect(bgGain);

      bgOscA.start();
      bgOscB.start();
      bgLFO.start();

      audioAvailable = true;
    } catch (err) {
      console.warn('Audio unavailable:', err);
      audioAvailable = false;
      audioCtx = null;
    }
  }

  async function ensureAudioRunning() {
    if (!audioAvailable || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext:', e);
      }
    }
  }

  // Sound effects: place/correct/incorrect with safe envelopes and error handling
  function playCorrect() {
    if (!audioAvailable || audioMuted) return;
    try {
      const t = audioCtx.currentTime;
      // gentle chime: two detuned bells through bandpass
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 8;

      osc1.type = 'triangle';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(880, t);
      osc2.frequency.setValueAtTime(660, t);
      osc2.detune.value = 6;

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);

      osc1.connect(bp);
      osc2.connect(bp);
      bp.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.9);
      osc2.stop(t + 0.9);
    } catch (e) {
      console.warn('playCorrect error', e);
    }
  }

  function playIncorrect() {
    if (!audioAvailable || audioMuted) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(t);
      osc.stop(t + 0.32);
    } catch (e) {
      console.warn('playIncorrect error', e);
    }
  }

  function playPlace() {
    if (!audioAvailable || audioMuted) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(720, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(t);
      osc.stop(t + 0.16);
    } catch (e) {
      console.warn('playPlace error', e);
    }
  }

  // Gentle success flourish on round complete (small arpeggio)
  function playCelebrate() {
    if (!audioAvailable || audioMuted) return;
    try {
      const now = audioCtx.currentTime;
      const notes = [440, 550, 660];
      const dur = 0.16;
      notes.forEach((n, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 200;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n, now + i * dur * 0.8);
        gain.gain.setValueAtTime(0.0001, now + i * dur * 0.8);
        gain.gain.linearRampToValueAtTime(0.06, now + i * dur * 0.8 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * dur * 0.8 + dur + 0.05);

        osc.connect(hp);
        hp.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now + i * dur * 0.8);
        osc.stop(now + i * dur * 0.8 + dur + 0.05);
      });
    } catch (e) {
      console.warn('playCelebrate error', e);
    }
  }

  // Game state (unchanged mechanics)
  const game = {
    round: 0,
    score: 0,
    target: 0,
    gears: [],
    selectedGearId: null,
    slots: [null, null],
    dragging: false,
    dragOffset: { x: 0, y: 0 },
    finished: false,
    muted: false,
    message:
      'Click a gear to pick it, then place in Slot A or B. Use arrow keys and Enter for keyboard play.',
    focusIndex: 0,
    activeElement: 'gear',
    roundsToWin: ROUNDS,
  };

  function announce(text) {
    liveRegion.textContent = '';
    setTimeout(() => (liveRegion.textContent = text), 50);
  }

  // Initialize
  function initGame() {
    createAudio().catch((e) => console.warn('createAudio:', e));
    resetRounds();
    attachEvents();
    draw();
    announce('Machine Math ready. Press Space to start. ' + game.message);
  }

  function resetRounds() {
    game.round = 0;
    game.score = 0;
    game.finished = false;
    startNewRound();
  }

  // Spawn gears - mechanics preserved
  function spawnGears() {
    const gears = [];
    const minTarget = 3;
    const maxTarget = 15;
    game.target = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;

    const a = Math.floor(Math.random() * Math.min(9, game.target - 1)) + 1;
    const b = game.target - a;
    const values = [a, b];

    while (values.length < 8) {
      const v = Math.floor(Math.random() * 12) + 1;
      values.push(v);
    }

    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }

    const startX = 110;
    const gap = 70;
    const y = 380;
    for (let i = 0; i < values.length; i++) {
      gears.push({
        id: `g${Date.now()}_${i}`,
        x: startX + i * gap,
        y,
        r: 24,
        value: values[i],
        picked: false,
        restingX: startX + i * gap,
        restingY: y,
        glide: 0, // for subtle bob
      });
    }
    return gears;
  }

  function startNewRound() {
    if (game.round >= game.roundsToWin) {
      game.finished = true;
      announce('You have completed all rounds! Press Space to play again.');
      return;
    }

    game.round += 1;
    game.gears = spawnGears();
    game.selectedGearId = null;
    game.slots = [null, null];
    game.dragging = false;
    game.focusIndex = 0;
    game.activeElement = 'gear';
    game.finished = false;
    announce(
      `Round ${game.round} of ${game.roundsToWin}. Target number ${game.target}. Pick two gears that add up to ${game.target}.`
    );
  }

  // Drawing helpers - improved visuals
  function clearBG() {
    // Soft vertical gradient sky-to-metal
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#EAF6FF');
    g.addColorStop(0.4, '#F7FBFF');
    g.addColorStop(1, '#E6F1F9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawBackgroundDecor() {
    // Subtle gear silhouettes in background (canvas-only)
    const t = Date.now() / 4000;
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#1B3B52';
    drawSilhouetteGear(80, 120, 48, t);
    drawSilhouetteGear(620, 90, 64, -t);
    drawSilhouetteGear(520, 250, 56, t * 0.7);
    ctx.restore();

    // Decorative soft grid lines to suggest machinery
    ctx.save();
    ctx.strokeStyle = 'rgba(30,60,80,0.05)';
    ctx.lineWidth = 1;
    for (let x = 40; x < WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + (conveyorOffset * 0.05 % 40), 0);
      ctx.lineTo(x + (conveyorOffset * 0.05 % 40), HEIGHT);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSilhouetteGear(x, y, r, phase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(phase % (Math.PI * 2));
    const teeth = Math.max(8, Math.round(r / 3));
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const tx = Math.cos(angle) * (r + 10);
      const ty = Math.sin(angle) * (r + 10);
      ctx.beginPath();
      ctx.ellipse(tx, ty, 7, 10, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMachine() {
    // Machine body with gradient and character-friendly face
    ctx.save();
    // Main rounded panel
    const panelX = 60;
    const panelY = 30;
    const panelW = 600;
    const panelH = 300;
    const panelR = 22;
    const grad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    grad.addColorStop(0, '#CFEAF7'); // light
    grad.addColorStop(1, '#B6DBF0'); // darker
    roundRect(ctx, panelX, panelY, panelW, panelH, panelR);
    ctx.fillStyle = grad;
    ctx.fill();

    // Soft inner window
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    roundRect(ctx, panelX + 20, panelY + 20, panelW - 40, panelH - 40, 14);
    ctx.fill();

    // Friendly face on the machine (character)
    const faceX = panelX + panelW - 120;
    const faceY = panelY + 60;
    ctx.save();
    // face plate
    ctx.fillStyle = '#F8FEFF';
    roundRect(ctx, faceX - 32, faceY - 20, 64, 56, 10);
    ctx.fill();
    // eyes
    ctx.fillStyle = '#213B48';
    ctx.beginPath();
    ctx.arc(faceX - 12, faceY + 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(faceX + 12, faceY + 2, 5, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.strokeStyle = '#235A6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(faceX, faceY + 10, 12, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // Rounded control panel
    ctx.fillStyle = '#2E6B8A';
    roundRect(ctx, 300, 48, 200, 86, 12);
    ctx.fill();

    // Slots window (opening)
    ctx.fillStyle = '#EAF6FF';
    roundRect(ctx, 110, 120, 400, 140, 10);
    ctx.fill();

    // Decorative convey tube
    ctx.strokeStyle = '#A2C6D9';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(480, 80);
    ctx.bezierCurveTo(510, 100, 540, 50, 560, 40);
    ctx.stroke();

    ctx.restore();

    // Target display (enhanced)
    ctx.save();
    ctx.fillStyle = '#183E4F';
    roundRect(ctx, 520, 60, 160, 76, 12);
    ctx.fill();

    ctx.fillStyle = '#A6E1FF';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TARGET', 600, 80);

    ctx.font = '40px serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(String(game.target), 600, 112);
    ctx.restore();

    // Slots A and B drawn with glowing ring if focused
    drawSlot('A', 200, 190, 86, 86, game.slots[0]);
    drawSlot('B', 350, 190, 86, 86, game.slots[1]);
  }

  function drawSlot(letter, x, y, w, h, gearId) {
    ctx.save();
    // Slight pulsating glow if focused
    const focused = game.activeElement === 'slot' && game.focusIndex === (letter === 'A' ? 0 : 1);
    const glowAlpha = focused ? 0.18 + Math.sin(Date.now() / 400) * 0.02 : 0.06;
    ctx.shadowColor = `rgba(60,140,160,${glowAlpha})`;
    ctx.shadowBlur = focused ? 18 : 6;

    // outer plate
    ctx.fillStyle = '#D6EEFA';
    roundRect(ctx, x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12, 12);
    ctx.fill();

    // inner slot
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 10);
    ctx.fill();

    // small label on top-left of slot
    ctx.fillStyle = '#2E4C56';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(letter, x - w / 2 + 12, y - h / 2 + 20);

    // if empty, show soft dashed gear outline
    if (!gearId) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      drawGear(x + 10, y, 18, '-', true, 0.02);
      ctx.restore();
    } else {
      const gear = game.gears.find((g) => g.id === gearId);
      if (gear) {
        drawGear(x + 10, y, gear.r, gear.value, true, 0.06);
      }
    }
    ctx.restore();
  }

  // Draw conveyor belt
  function drawConveyor() {
    ctx.save();
    // belt shadow
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#243642';
    roundRect(ctx, 60, 340, 600, 100, 14);
    ctx.fill();

    // belt texture lines moving subtly
    ctx.restore();
    ctx.save();
    ctx.clip(); // clip to canvas
    ctx.translate(-(conveyorOffset % 40), 0);
    for (let i = 0; i < 20; i++) {
      const stripeX = 60 + i * 40 + (conveyorOffset * 0.2 % 40);
      const stripeY = 360;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
      ctx.fillRect(stripeX, 356, 20, 88);
    }
    ctx.restore();

    // bolts
    ctx.fillStyle = '#7FA3B8';
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(90 + i * 48, 380, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw a gear - improved visuals while keeping shape
  function drawGear(x, y, r, value, flat = false, wobble = 0) {
    ctx.save();
    ctx.translate(x, y);

    // small dynamic wobble based on time/position
    const wobRot = wobble ? Math.sin(Date.now() / 350 + x * 0.02) * wobble : 0;
    ctx.rotate(wobRot);

    // Teeth
    const teeth = Math.max(8, Math.round(r / 4 + 6));
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const tx = Math.cos(angle) * (r + 8);
      const ty = Math.sin(angle) * (r + 8);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(angle);
      // tooth shading
      const toothGrad = ctx.createLinearGradient(-6, -8, 6, 8);
      toothGrad.addColorStop(0, '#CFF0FF');
      toothGrad.addColorStop(1, '#8FCDF0');
      ctx.fillStyle = toothGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Main circle with gradient
    const mainGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    mainGrad.addColorStop(0, '#FFFFFF');
    mainGrad.addColorStop(1, '#7EC6FF');
    ctx.beginPath();
    ctx.fillStyle = mainGrad;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner hub
    ctx.beginPath();
    ctx.fillStyle = '#E9F8FF';
    ctx.arc(0, 0, r - 8, 0, Math.PI * 2);
    ctx.fill();

    // subtle center hole
    ctx.beginPath();
    ctx.fillStyle = '#A6D6EA';
    ctx.arc(0, 0, Math.max(3, r * 0.22), 0, Math.PI * 2);
    ctx.fill();

    // Number
    ctx.fillStyle = '#12343F';
    ctx.font = `${r}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 0, 0);

    // outline if selected
    if (game.selectedGearId) {
      // handled externally for highlight rings; keep lightweight here
    }
    ctx.restore();
  }

  // HUD
  function drawHUD() {
    // Top bar background with semi-transparent blur
    ctx.save();
    ctx.fillStyle = 'rgba(250, 250, 255, 0.92)';
    ctx.fillRect(0, 0, WIDTH, 32);

    // Round and score with subtle animated counter highlight
    ctx.fillStyle = '#114047';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Round: ${Math.min(game.round, game.roundsToWin)} / ${game.roundsToWin}`, 12, 20);

    // Score with small confetti indicator when score increases (light)
    ctx.fillStyle = '#114047';
    ctx.fillText(`Score: ${game.score}`, 140, 20);

    // Instructions centered
    ctx.textAlign = 'center';
    ctx.fillStyle = '#174F58';
    ctx.font = '13px sans-serif';
    ctx.fillText(
      'Pick two gears that add up to the target. Click/Drag or use keyboard. Press M to mute/unmute.',
      WIDTH / 2,
      20
    );

    // Audio icon and state
    drawAudioIcon(WIDTH - 64, 4, audioMuted);

    ctx.restore();
  }

  function drawAudioIcon(x, y, muted) {
    ctx.save();
    ctx.translate(x, y);
    // speaker base
    ctx.fillStyle = muted ? '#D9534F' : '#4CAF50';
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(8, 8);
    ctx.lineTo(14, 2);
    ctx.lineTo(14, 22);
    ctx.lineTo(8, 16);
    ctx.lineTo(0, 16);
    ctx.closePath();
    ctx.fill();

    // wave or cross
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 2;
    if (muted) {
      ctx.beginPath();
      ctx.moveTo(-2, 2);
      ctx.lineTo(18, 26);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(20, 12, 6, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGears() {
    // Conveyor element movement for illusion
    conveyorOffset += 0.8;
    for (const g of game.gears) {
      // If placed in slot, skip (slots draw them)
      if (game.slots.includes(g.id)) continue;
      // bobbing motion for life
      g.glide += 0.02;
      const bob = Math.sin(g.glide + (g.x % 100) * 0.02) * 2;
      // subtle conveyor shift based on index
      const indexOffset = (g.restingX - 110) / 70;
      const drift = Math.sin(Date.now() / 2000 + indexOffset) * 0.6;
      const drawX = g.x + drift;
      const drawY = g.y + bob;
      drawGear(drawX, drawY, g.r, g.value, false, 0.04);

      // selection highlight
      if (game.selectedGearId === g.id) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,215,90,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(drawX, drawY, g.r + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // keyboard focus ring
      if (game.activeElement === 'gear') {
        const idx = game.gears.indexOf(g);
        if (idx === game.focusIndex) {
          ctx.save();
          ctx.strokeStyle = 'rgba(142,229,161,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(drawX, drawY, g.r + 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // Particle helpers for subtle bursts (non-intrusive)
  function spawnParticles(x, y, color = '#7EE8FF', count = 12) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.6) * 3 - 1,
        life: 0.9 + Math.random() * 0.4,
        age: 0,
        size: 2 + Math.random() * 2,
        color,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // slight gravity
      if (p.age >= p.life) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const alpha = 1 - p.age / p.life;
      ctx.fillStyle = hexToRGBA(p.color, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Utility to convert hex-like color to rgba
  function hexToRGBA(hex, a) {
    // Accept common hex or already rgb string
    // We'll parse simple hex patterns like #RRGGBB
    if (hex.startsWith('#') && hex.length === 7) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    // fallback
    return hex;
  }

  // Render everything
  let lastFrame = performance.now();
  function draw(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    clearBG();
    drawBackgroundDecor();
    drawMachine();
    drawConveyor();
    drawGears();
    drawHUD();

    // Slot labels
    ctx.fillStyle = '#264653';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Slot A', 150, 170);
    ctx.fillText('Slot B', 300, 170);

    // messages bottom-left
    ctx.fillStyle = '#235A6B';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(game.message, 12, HEIGHT - 12);

    // particles
    updateParticles(dt);
    drawParticles();

    // subtle overlay on finish
    if (game.finished) {
      ctx.save();
      ctx.fillStyle = 'rgba(10, 20, 30, 0.6)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#FFF';
      ctx.font = '34px serif';
      ctx.textAlign = 'center';
      if (game.score >= game.roundsToWin) {
        ctx.fillText('Machine Master! You win!', WIDTH / 2, HEIGHT / 2 - 20);
        ctx.font = '20px sans-serif';
        ctx.fillText('Press Space to play again.', WIDTH / 2, HEIGHT / 2 + 20);
      } else {
        ctx.fillText('All rounds complete', WIDTH / 2, HEIGHT / 2 - 20);
        ctx.font = '20px sans-serif';
        ctx.fillText('Press Space to play again.', WIDTH / 2, HEIGHT / 2 + 20);
      }
      ctx.restore();
    }

    requestAnimationFrame(draw);
  }

  // Geometry helpers (unchanged)
  function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = r || 5;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // Input handling (mechanics preserved)
  function attachEvents() {
    canvas.addEventListener('click', async (e) => {
      canvas.focus();
      await ensureAudioRunning();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // audio icon click region
      if (mx >= WIDTH - 80 && mx <= WIDTH - 40 && my >= 0 && my <= 28) {
        toggleMute();
        return;
      }
      if (game.finished) {
        resetRounds();
        startNewRound();
        return;
      }
      // gears click
      for (const g of game.gears) {
        if (game.slots.includes(g.id)) continue;
        const dx = mx - g.x;
        const dy = my - g.y;
        if (Math.hypot(dx, dy) <= g.r + 8) {
          pickGear(g.id);
          game.dragging = true;
          game.dragOffset.x = dx;
          game.dragOffset.y = dy;
          return;
        }
      }
      // slots click
      const slotACenter = { x: 210, y: 190, r: 40 };
      const slotBCenter = { x: 360, y: 190, r: 40 };
      if (pointInsideCircle(mx, my, slotACenter.x, slotACenter.y, slotACenter.r)) {
        placeSelectedInSlot(0);
      } else if (pointInsideCircle(mx, my, slotBCenter.x, slotBCenter.y, slotBCenter.r)) {
        placeSelectedInSlot(1);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!game.dragging || !game.selectedGearId) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const g = game.gears.find((x) => x.id === game.selectedGearId);
      if (g) {
        g.x = mx - game.dragOffset.x;
        g.y = my - game.dragOffset.y;
      }
    });

    canvas.addEventListener('mouseup', () => {
      if (!game.dragging) return;
      game.dragging = false;
      const g = game.gears.find((x) => x.id === game.selectedGearId);
      if (!g) return;
      const mx = g.x;
      const my = g.y;
      const slotACenter = { x: 210, y: 190, r: 40 };
      const slotBCenter = { x: 360, y: 190, r: 40 };
      if (pointInsideCircle(mx, my, slotACenter.x, slotACenter.y, slotACenter.r)) {
        placeSelectedInSlot(0);
      } else if (pointInsideCircle(mx, my, slotBCenter.x, slotBCenter.y, slotBCenter.r)) {
        placeSelectedInSlot(1);
      } else {
        if (g.restingX && g.restingY) {
          g.x = g.restingX;
          g.y = g.restingY;
        }
      }
    });

    canvas.addEventListener('keydown', async (e) => {
      await ensureAudioRunning();
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (game.finished) {
          resetRounds();
          startNewRound();
          return;
        }
        announce(`Round ${game.round} target ${game.target}. Pick two gears that sum to ${game.target}.`);
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        toggleMute();
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        handleArrowKey(e.key);
        return;
      }
      if (e.key === 'Enter') {
        handleEnterKey();
        return;
      }
      if (e.key === 'Escape') {
        cancelSelection();
        return;
      }
      if (/^[1-8]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (game.gears[idx]) {
          pickGear(game.gears[idx].id);
        }
      }
    });

    // Touch support minimal
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      for (const g of game.gears) {
        if (game.slots.includes(g.id)) continue;
        const dx = mx - g.x;
        const dy = my - g.y;
        if (Math.hypot(dx, dy) <= g.r + 8) {
          pickGear(g.id);
          game.dragging = true;
          game.dragOffset.x = dx;
          game.dragOffset.y = dy;
          return;
        }
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!game.dragging || !game.selectedGearId) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      const g = game.gears.find((x) => x.id === game.selectedGearId);
      if (g) {
        g.x = mx - game.dragOffset.x;
        g.y = my - game.dragOffset.y;
      }
    });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!game.dragging) return;
      game.dragging = false;
      const g = game.gears.find((x) => x.id === game.selectedGearId);
      if (!g) return;
      const mx = g.x;
      const my = g.y;
      const slotACenter = { x: 210, y: 190, r: 40 };
      const slotBCenter = { x: 360, y: 190, r: 40 };
      if (pointInsideCircle(mx, my, slotACenter.x, slotACenter.y, slotACenter.r)) {
        placeSelectedInSlot(0);
      } else if (pointInsideCircle(mx, my, slotBCenter.x, slotBCenter.y, slotBCenter.r)) {
        placeSelectedInSlot(1);
      } else {
        if (g.restingX && g.restingY) {
          g.x = g.restingX;
          g.y = g.restingY;
        }
      }
    });

    canvas.addEventListener('focus', () => {
      // nothing needed; keyboard focus used in draw loop
    });
  }

  // Input helpers (unchanged)
  function handleArrowKey(key) {
    if (game.activeElement === 'gear') {
      const count = game.gears.length;
      if (key === 'ArrowLeft') {
        game.focusIndex = Math.max(0, game.focusIndex - 1);
      } else if (key === 'ArrowRight') {
        game.focusIndex = Math.min(count - 1, game.focusIndex + 1);
      } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        game.activeElement = 'slot';
        game.focusIndex = 0;
      }
    } else if (game.activeElement === 'slot') {
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        game.focusIndex = game.focusIndex === 0 ? 1 : 0;
      } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        game.activeElement = 'gear';
        game.focusIndex = 0;
      }
    }
    // Announce
    if (game.activeElement === 'gear') {
      const g = game.gears[game.focusIndex];
      if (g) announce(`Focused gear ${game.focusIndex + 1}, value ${g.value}`);
    } else {
      announce(`Focused slot ${game.focusIndex === 0 ? 'A' : 'B'}`);
    }
  }

  function handleEnterKey() {
    if (game.activeElement === 'gear') {
      const g = game.gears[game.focusIndex];
      if (g && !game.slots.includes(g.id)) {
        pickGear(g.id);
      } else {
        announce('No gear to pick here.');
      }
    } else {
      placeSelectedInSlot(game.focusIndex);
    }
  }

  function pointInsideCircle(px, py, cx, cy, r) {
    return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
  }

  function pickGear(gearId) {
    if (game.selectedGearId === gearId) {
      game.selectedGearId = null;
      announce('Gear deselected');
      return;
    }
    const gear = game.gears.find((g) => g.id === gearId);
    if (!gear) return;
    game.selectedGearId = gearId;
    const idx = game.gears.indexOf(gear);
    if (idx >= 0) {
      game.gears.splice(idx, 1);
      game.gears.push(gear);
    }
    announce(`Picked gear with value ${gear.value}. Place it in Slot A or B.`);
    playPlace();
  }

  function placeSelectedInSlot(slotIndex) {
    if (!game.selectedGearId) {
      announce('No gear selected to place.');
      return;
    }
    if (game.slots[slotIndex]) {
      announce(`Slot ${slotIndex === 0 ? 'A' : 'B'} already occupied. Remove gear first.`);
      return;
    }
    const gear = game.gears.find((g) => g.id === game.selectedGearId);
    if (!gear) return;
    game.slots[slotIndex] = gear.id;
    const slotCenter = slotIndex === 0 ? { x: 210, y: 190 } : { x: 360, y: 190 };
    gear.x = slotCenter.x + 10;
    gear.y = slotCenter.y;
    game.selectedGearId = null;
    playPlace();
    announce(`Placed gear with value ${gear.value} into Slot ${slotIndex === 0 ? 'A' : 'B'}.`);

    if (game.slots[0] && game.slots[1]) {
      setTimeout(evaluateSlots, 250);
    }
  }

  function cancelSelection() {
    if (game.selectedGearId) {
      const g = game.gears.find((x) => x.id === game.selectedGearId);
      if (g && g.restingX && g.restingY) {
        g.x = g.restingX;
        g.y = g.restingY;
      }
      game.selectedGearId = null;
      game.dragging = false;
      announce('Selection cancelled.');
    }
  }

  function evaluateSlots() {
    const gidA = game.slots[0];
    const gidB = game.slots[1];
    const gearA = game.gears.find((g) => g.id === gidA);
    const gearB = game.gears.find((g) => g.id === gidB);
    if (!gearA || !gearB) {
      announce('Error: missing gear in slot.');
      return;
    }
    const sum = gearA.value + gearB.value;
    if (sum === game.target) {
      playCorrect();
      // visual: spawn small particles at slot center
      spawnParticles(210, 190, '#A6FFEF', 14);
      spawnParticles(360, 190, '#A6FFEF', 14);
      game.score += 1;
      game.message = `Nice! ${gearA.value} + ${gearB.value} = ${game.target}.`;
      announce(`Correct! ${gearA.value} + ${gearB.value} equals ${game.target}.`);
      // celebrate flourish
      playCelebrate();
      setTimeout(() => {
        game.gears = game.gears.filter((g) => ![gidA, gidB].includes(g.id));
        game.slots = [null, null];
        if (game.round >= game.roundsToWin) {
          game.finished = true;
          announce(`You finished all ${game.roundsToWin} rounds. Score ${game.score}. Press Space to play again.`);
        } else {
          startNewRound();
        }
      }, 800);
    } else {
      playIncorrect();
      game.message = `Oops: ${gearA.value} + ${gearB.value} = ${sum}, not ${game.target}. Try again.`;
      announce(`Incorrect. ${gearA.value} plus ${gearB.value} makes ${sum}. Remove a gear or try different ones.`);
      setTimeout(() => {
        for (const sid of [gidA, gidB]) {
          const gg = game.gears.find((x) => x.id === sid);
          if (gg) {
            gg.x = gg.restingX || gg.x;
            gg.y = gg.restingY || gg.y;
          }
        }
        game.slots = [null, null];
      }, 600);
    }
  }

  function toggleMute() {
    audioMuted = !audioMuted;
    if (bgGain) bgGain.gain.value = audioMuted ? 0 : 0.03;
    game.message = audioMuted ? 'Sound muted' : 'Sound on';
    announce(game.message);
  }

  // Expose minimal controls for debugging
  window.__MachineMathGame = {
    restart: () => {
      resetRounds();
      startNewRound();
    },
    mute: () => {
      audioMuted = true;
      if (bgGain) bgGain.gain.value = 0;
    },
    unmute: () => {
      audioMuted = false;
      if (bgGain) bgGain.gain.value = 0.03;
    },
  };

  // Start
  initGame();
})();