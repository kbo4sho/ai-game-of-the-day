(function () {
  // Spark Squad: Electricity Math Game (Visual & Audio enhancement)
  // NOTE: Game mechanics and math logic unchanged. This script improves visuals, animations, and Web Audio-based sounds.
  const STAGE_ID = 'game-of-the-day-stage';
  const WIDTH = 720;
  const HEIGHT = 480;

  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error(`Game requires an element with id="${STAGE_ID}" to render into.`);
    return;
  }

  // Clear and prepare stage
  stage.innerHTML = '';
  stage.style.position = 'relative';
  stage.style.width = WIDTH + 'px';
  stage.style.height = HEIGHT + 'px';
  stage.style.userSelect = 'none';

  // Create canvas (exact game area)
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0; // focusable
  canvas.style.outline = 'none';
  canvas.setAttribute(
    'aria-label',
    'Spark Squad math game: use arrow keys or WASD to move the spark, press Space or Enter to use a number node, press M to mute audio. Instructions appear on screen.'
  );
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // ARIA live region
  const ariaLive = document.createElement('div');
  ariaLive.setAttribute('aria-live', 'polite');
  ariaLive.style.position = 'absolute';
  ariaLive.style.left = '-9999px';
  ariaLive.style.width = '1px';
  ariaLive.style.height = '1px';
  ariaLive.style.overflow = 'hidden';
  stage.appendChild(ariaLive);

  // ---------- Audio: Web Audio API (synthesized, safe init and error handling) ----------
  let audioEnabled = true;
  let audioCtx = null;
  let masterGain = null;
  let bgNodes = null; // container for background oscillators/gains
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    // start soft so we can ramp up
    masterGain.gain.value = 0.0001;
    masterGain.connect(audioCtx.destination);

    // Background ambient pad: two oscillators with slow LFO, a lowpass filter and light chorus
    bgNodes = (function createBackground() {
      const container = {};
      // Low drone
      container.osc1 = audioCtx.createOscillator();
      container.g1 = audioCtx.createGain();
      container.osc1.type = 'sine';
      container.osc1.frequency.value = 72; // ~C2
      container.g1.gain.value = 0.02;

      // Higher soft tone
      container.osc2 = audioCtx.createOscillator();
      container.g2 = audioCtx.createGain();
      container.osc2.type = 'triangle';
      container.osc2.frequency.value = 220; // A3-ish
      container.g2.gain.value = 0.01;

      // Lowpass filter to tame brightness
      container.filter = audioCtx.createBiquadFilter();
      container.filter.type = 'lowpass';
      container.filter.frequency.value = 700;

      // Slow LFO to modulate filter freq
      container.lfo = audioCtx.createOscillator();
      container.lfoGain = audioCtx.createGain();
      container.lfo.type = 'sine';
      container.lfo.frequency.value = 0.08; // slow
      container.lfoGain.gain.value = 120; // modulation depth

      // Subtle stereo detune using two delay nodes with tiny differences
      container.delay1 = audioCtx.createDelay();
      container.delay2 = audioCtx.createDelay();
      container.delay1.delayTime.value = 0.005;
      container.delay2.delayTime.value = 0.009;

      // Routing
      try {
        container.osc1.connect(container.g1);
        container.osc2.connect(container.g2);
        container.g1.connect(container.filter);
        container.g2.connect(container.filter);
        container.filter.connect(container.delay1);
        container.filter.connect(container.delay2);
        container.delay1.connect(masterGain);
        container.delay2.connect(masterGain);

        // lfo modulates filter frequency
        container.lfo.connect(container.lfoGain);
        container.lfoGain.connect(container.filter.frequency);

        // start nodes
        container.osc1.start();
        container.osc2.start();
        container.lfo.start();
      } catch (err) {
        console.warn('Background audio node routing failed', err);
      }

      return container;
    })();

    // Smoothly ramp master gain in
    setTimeout(() => {
      try {
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 1.2);
      } catch (e) {
        // ignore ramp failure
      }
    }, 200);
  } catch (err) {
    audioEnabled = false;
    console.warn('Web Audio API unavailable or denied. Game will run silently.', err);
  }

  // Utility: ensure AudioContext resumes on gesture
  function resumeAudioIfNeeded() {
    if (!audioEnabled || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('AudioContext resume failed:', e);
      });
    }
  }

  // Smooth gain setter for master (used for mute/unmute)
  function setMasterGain(value, time = 0.12) {
    if (!audioEnabled || !audioCtx || !masterGain) return;
    try {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(value, now + time);
    } catch (e) {
      console.warn('setMasterGain failed:', e);
      masterGain.gain.value = value;
    }
  }

  // Sound utilities: synthesized tones with envelope and filter
  function playTone(freq, duration = 0.22, type = 'sine', when = 0, volume = 0.08) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      osc.type = type;
      osc.frequency.value = Math.max(40, freq);
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(400, freq * 2.2);
      gain.gain.value = 0.0001;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      const now = audioCtx.currentTime + when;
      // attack
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
      // release
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.start(now);
      osc.stop(now + duration + 0.05);

      // cleanup after stop
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
          filter.disconnect();
        } catch (e) { /* ignore */ }
      };
    } catch (e) {
      console.warn('playTone failed', e);
    }
  }

  function playClick() {
    playTone(880, 0.08, 'triangle', 0, 0.06);
  }

  function playSoftPing() {
    playTone(740, 0.18, 'sine', 0, 0.05);
    playTone(1100, 0.12, 'sine', 0.03, 0.03);
  }

  function playChime() {
    // layered chord
    playTone(740, 0.14, 'sine', 0, 0.06);
    playTone(1046, 0.22, 'triangle', 0.02, 0.06);
    playTone(523, 0.28, 'sine', 0.04, 0.06);
    // subtle shimmer
    setTimeout(() => playTone(1568, 0.12, 'sine', 0, 0.02), 60);
  }

  function playBuzzer() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = 220;
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      g.gain.value = 0.0001;
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      // envelope & pitch slide
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
      o.start(t);
      o.stop(t + 0.24);
      o.onended = () => {
        try {
          o.disconnect();
          g.disconnect();
          f.disconnect();
        } catch (e) { /* ignore */ }
      };
    } catch (e) {
      console.warn('playBuzzer failed', e);
    }
  }

  // ---------- Game State (unchanged mechanics) ----------
  const characters = {
    battery: {
      name: 'Volt',
      color: '#FFD166',
      eyeColor: '#333'
    },
    helper: {
      name: 'Ohma',
      color: '#BDE0FE'
    }
  };

  let level = 1;
  const maxLevels = 5;

  let nodes = [];
  let battery = {
    x: 90,
    y: 100,
    radius: 48,
    charge: 0
  };

  let device = {
    x: WIDTH - 130,
    y: 100,
    radius: 52,
    target: 0
  };

  const spark = {
    x: 360,
    y: 320,
    r: 12,
    vx: 0,
    vy: 0,
    speed: 2.6
  };

  let usedNodes = new Set();
  let message =
    'Welcome to Spark Squad! Move the spark to number nodes and press Space/Enter to change the battery charge. When matching the device, go to it and press Enter!';
  let msgTimer = 0;
  let showHelp = true;
  let muted = false;

  const keys = {};
  let audioIndicatorPulse = 0;

  // Visual particle / trail systems (purely visual)
  const trail = []; // recent positions for spark tail
  const particles = []; // small sparks and bursts

  function announce(text) {
    ariaLive.textContent = text;
  }

  // ---------- Utility functions ----------
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function generateLevel(lv) {
    nodes = [];
    usedNodes.clear();
    battery.charge = randInt(0, 6);
    device.target = Math.min(20, Math.max(1, battery.charge + randInt(-3, 8)));
    device.target = Math.max(0, device.target);

    const nodeCount = Math.min(7, 3 + Math.floor(lv / 1.5));
    const available = [];
    for (let i = 0; i < nodeCount; i++) {
      let tries = 0;
      while (tries < 60) {
        const x = randInt(160, WIDTH - 160);
        const y = randInt(140, HEIGHT - 60);
        const r = 26;
        const distToBattery = Math.hypot(x - battery.x, y - battery.y);
        const distToDevice = Math.hypot(x - device.x, y - device.y);
        let ok = distToBattery > 110 && distToDevice > 100;
        for (const n of available) {
          if (Math.hypot(x - n.x, y - n.y) < 72) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const magnitude = Math.min(9, 3 + Math.floor(lv / 2));
          let val;
          if (Math.random() < 0.7) {
            val = randInt(1, magnitude);
          } else {
            val = -randInt(1, Math.max(1, Math.min(6, Math.floor(magnitude / 1.5))));
          }
          available.push({ x, y, r, val, createdAt: performance.now() });
          break;
        }
        tries++;
      }
    }

    if (lv >= 3 && Math.random() < 0.6) {
      const x = randInt(220, WIDTH - 220);
      const y = randInt(180, HEIGHT - 80);
      available.push({ x, y, r: 30, val: 'x2', createdAt: performance.now() });
    }

    nodes = available;
    spark.x = WIDTH / 2;
    spark.y = HEIGHT - 80;
    spark.vx = 0;
    spark.vy = 0;

    announce(`Level ${lv}. Battery ${battery.charge}. Device target ${device.target}.`);
    message = `Level ${lv}: Guide the spark to nodes, press Space/Enter to apply. Battery ${battery.charge}. Target ${device.target}.`;
    msgTimer = 300;
  }

  // ---------- Input handling (unchanged behavior) ----------
  canvas.addEventListener('keydown', (e) => {
    resumeAudioIfNeeded();
    keys[e.key.toLowerCase()] = true;

    if (e.key.toLowerCase() === 'm') {
      muted = !muted;
      setMasterGain(muted ? 0.0001 : 0.12, 0.18);
      announce(muted ? 'Audio muted' : 'Audio unmuted');
    }

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleUseNodeOrDevice();
    }

    if (e.key.toLowerCase() === 'h') {
      showHelp = !showHelp;
      announce(showHelp ? 'Help shown' : 'Help hidden');
    }
  });

  canvas.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    resumeAudioIfNeeded();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    spark.x = mx;
    spark.y = my;

    const targetNode = nodes.findIndex((n, i) => {
      const d = Math.hypot(mx - n.x, my - n.y);
      return d <= n.r + spark.r + 4 && !usedNodes.has(i);
    });
    if (targetNode >= 0) {
      applyNode(targetNode);
    } else {
      const dDevice = Math.hypot(mx - device.x, my - device.y);
      if (dDevice <= device.radius + spark.r + 4) {
        submitToDevice();
      }
    }
  });

  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      resumeAudioIfNeeded();
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0];
      const mx = t.clientX - rect.left;
      const my = t.clientY - rect.top;
      spark.x = mx;
      spark.y = my;
    },
    { passive: false }
  );

  // ---------- Visual effect helpers ----------
  function spawnParticles(x, y, color = '#FFD166', count = 12, spread = 2.6, life = 600) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * spread + 0.6;
      particles.push({
        x: x + Math.cos(angle) * 4,
        y: y + Math.sin(angle) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 0.6,
        life: life + Math.random() * 180,
        born: performance.now(),
        color,
        size: Math.random() * 2.2 + 1
      });
    }
  }

  // ---------- Interaction logic unchanged, plus visual/audio fx ----------
  function handleUseNodeOrDevice() {
    for (let i = 0; i < nodes.length; i++) {
      if (usedNodes.has(i)) continue;
      const n = nodes[i];
      if (Math.hypot(spark.x - n.x, spark.y - n.y) <= n.r + spark.r + 4) {
        applyNode(i);
        return;
      }
    }
    if (Math.hypot(spark.x - device.x, spark.y - device.y) <= device.radius + spark.r + 4) {
      submitToDevice();
      return;
    }
    message = 'Move closer to a node or the device, then press Space or Enter.';
    msgTimer = 120;
    playTone(220, 0.08, 'sawtooth', 0, 0.06);
  }

  function applyNode(i) {
    const n = nodes[i];
    if (usedNodes.has(i)) return;
    if (typeof n.val === 'number') {
      const prev = battery.charge;
      battery.charge = Math.max(0, Math.min(99, battery.charge + n.val));
      usedNodes.add(i);
      msgTimer = 180;
      message = `${characters.battery.name} changed from ${prev} by ${n.val} → ${battery.charge}.`;
      announce(message);
      playTone(n.val > 0 ? 660 : 280, 0.12, n.val > 0 ? 'triangle' : 'sine', 0, 0.07);
      spawnParticles(n.x, n.y, n.val > 0 ? '#9EE493' : '#8EC3FF', 10, 2.6);
    } else if (n.val === 'x2') {
      const prev = battery.charge;
      battery.charge = Math.max(0, Math.min(99, battery.charge * 2));
      usedNodes.add(i);
      msgTimer = 200;
      message = `${characters.battery.name}'s charge doubled: ${prev} → ${battery.charge}.`;
      announce(message);
      playTone(880, 0.16, 'sine', 0, 0.08);
      playTone(440, 0.12, 'sine', 0.06, 0.06);
      spawnParticles(n.x, n.y, '#FFD166', 18, 3.6, 900);
    } else {
      usedNodes.add(i);
      message = 'Hmm, this node flickered but nothing happened.';
      msgTimer = 140;
      playTone(300, 0.12, 'sine', 0, 0.05);
      spawnParticles(n.x, n.y, '#C0C0C0', 8, 1.8);
    }
  }

  function submitToDevice() {
    if (battery.charge === device.target) {
      message = `Success! ${characters.battery.name} powered the device!`;
      announce(message);
      playChime();
      msgTimer = 240;
      // celebration burst
      spawnParticles(device.x, device.y - 6, '#9EE493', 30, 4.6, 1200);
      level = Math.min(maxLevels, level + 1);
      setTimeout(() => {
        generateLevel(level);
      }, 900);
    } else {
      const diff = battery.charge - device.target;
      message = `Not quite. Battery ${battery.charge} vs target ${device.target}. Try ${Math.abs(diff)} ${diff > 0 ? 'less' : 'more'}.`;
      announce(message);
      msgTimer = 260;
      playBuzzer();
      spark.vx = (Math.random() - 0.5) * 6;
      spark.vy = -Math.random() * 3 - 1;
      // gentle negative feedback particles
      spawnParticles(device.x, device.y - 6, '#F08A5D', 16, 2.6, 700);
    }
  }

  // ---------- Drawing enhancements ----------
  // helper: rounded rectangle
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground(time) {
    // gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#EAF7FF');
    g.addColorStop(0.6, '#F9FFF6');
    g.addColorStop(1, '#FFFDF8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft, subtle energy grid (faint)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#2B8A8A';
    ctx.lineWidth = 1;
    const spacing = 44;
    for (let x = 0; x < WIDTH + spacing; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin((time + x) * 0.0006) * 6, 80);
      ctx.lineTo(x - 40, HEIGHT);
      ctx.stroke();
    }
    ctx.restore();

    // floating wave shapes (parallax subtle motion)
    ctx.save();
    const t = time * 0.00035;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const offset = Math.sin(t + i) * 16;
      ctx.fillStyle = i % 2 ? 'rgba(180,220,255,0.06)' : 'rgba(255,220,120,0.04)';
      ctx.ellipse(120 + i * 160 + offset, 60 + i * 6, 84 - i * 8, 26 + i * 4, Math.sin(t + i) * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBattery(x, y, r, charge, time) {
    ctx.save();
    const bob = Math.sin(time * 0.002 + x) * 4;
    ctx.translate(x, y + bob);

    // shiny rounded body
    roundRect(ctx, -r + 8, -r + 6, r * 2 - 16, r * 2 - 12, 12);
    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, '#FFD166');
    grad.addColorStop(1, '#FFC44D');
    ctx.fillStyle = grad;
    ctx.fill();

    // subtle outline
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // top terminals polished
    ctx.fillStyle = '#F4D27A';
    ctx.fillRect(-r + 20, -r - 6, r - 36, 8);
    ctx.fillRect(r - 20 - (r - 36), -r - 6, r - 36, 8);

    // eyes with soft blink animation
    const blink = (Math.sin(time * 0.004 + x) + 1) * 0.5;
    const eyeH = 4 - Math.floor(blink * 3 * Math.random() * 0.5);
    ctx.fillStyle = characters.battery.eyeColor;
    ctx.beginPath();
    ctx.ellipse(-12, -4, 5, Math.max(1.8, eyeH), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, -4, 5, Math.max(1.8, eyeH), 0, 0, Math.PI * 2);
    ctx.fill();

    // mouth
    ctx.strokeStyle = '#6B6B6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 6, 8, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    // charge display with soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${charge}C`, 2, 14);
    ctx.fillStyle = '#2B3A67';
    ctx.fillText(`${charge}C`, 0, 12);

    ctx.restore();

    // name tag
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, x - 48, y + r - 6, 96, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#2B3A67';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(characters.battery.name, x, y + r + 10);
  }

  function drawDevice(x, y, r, target, time) {
    ctx.save();
    const bob = Math.cos(time * 0.002 + x * 0.01) * 3;
    ctx.translate(x, y + bob);

    // body with radial sheen
    const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.4, r * 0.2, 0, 0, r);
    grad.addColorStop(0, '#DFF7E9');
    grad.addColorStop(1, '#C0F2D8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // subtle inner ring
    ctx.beginPath();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.arc(0, 0, r - 8, 0, Math.PI * 2);
    ctx.stroke();

    // bolt icon (slightly animated)
    ctx.save();
    ctx.translate(0, Math.sin(time * 0.006) * 2);
    ctx.fillStyle = '#3A86FF';
    ctx.beginPath();
    ctx.moveTo(-6, -18);
    ctx.lineTo(6, -18);
    ctx.lineTo(0, 6);
    ctx.lineTo(8, 6);
    ctx.lineTo(-2, 18);
    ctx.lineTo(0, 2);
    ctx.lineTo(-8, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // target text
    ctx.fillStyle = '#073B4C';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${target}C`, 0, 42);

    ctx.restore();

    ctx.fillStyle = '#333';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Gizmo', x, y + r + 12);
  }

  function drawNode(n, used, time) {
    ctx.save();
    // pulsating glow based on node age and current time
    const age = (time - (n.createdAt || 0)) * 0.001;
    const pulse = Math.abs(Math.sin(time * 0.002 + age)) * (used ? 0.2 : 0.9);
    ctx.translate(n.x, n.y);

    // outer aura
    const aura = ctx.createRadialGradient(0, 0, n.r * 0.2, 0, 0, n.r + 18 + pulse * 6);
    aura.addColorStop(0, used ? 'rgba(160,170,200,0.08)' : 'rgba(120,170,255,0.14)');
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, n.r + 18 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();

    // main orb
    ctx.beginPath();
    ctx.fillStyle = used ? '#F1F4FB' : '#FFFFFF';
    ctx.strokeStyle = used ? '#B4C0E0' : '#6997E0';
    ctx.lineWidth = 3;
    ctx.arc(0, 0, n.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // number or operator with softer typography
    ctx.fillStyle = used ? '#7B8FB8' : '#12324A';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (typeof n.val === 'number') {
      const prefix = n.val > 0 ? '+' : '';
      ctx.fillText(`${prefix}${n.val}`, 0, 6);
    } else {
      ctx.fillText(`${n.val}`, 0, 6);
    }

    // tiny sparkle accent
    ctx.fillStyle = 'rgba(255,210,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(-n.r / 2.6, -n.r / 2.8, 6, 3, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    // subtle ring animated if not used
    if (!used) {
      ctx.strokeStyle = `rgba(99,160,255,${0.1 + Math.abs(Math.sin(time * 0.004)) * 0.06})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, n.r + 8 + Math.sin(time * 0.006) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSpark(time) {
    // record trail
    trail.unshift({ x: spark.x, y: spark.y, t: time });
    if (trail.length > 26) trail.pop();

    // trail rendering
    ctx.save();
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const life = 1 - i / trail.length;
      const size = 1 + life * 6;
      const alpha = 0.13 * life;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
      grd.addColorStop(0, `rgba(255,236,179,${alpha})`);
      grd.addColorStop(1, `rgba(255,236,179,0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // core spark
    const coreGrad = ctx.createRadialGradient(spark.x, spark.y, 0, spark.x, spark.y, 28);
    coreGrad.addColorStop(0, 'rgba(255,246,204,0.98)');
    coreGrad.addColorStop(1, 'rgba(255,246,204,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = '#FFD166';
    ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2);
    ctx.fill();

    // subtle tail flick line
    ctx.strokeStyle = 'rgba(255,200,80,0.68)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(spark.x - 6, spark.y + 10);
    ctx.lineTo(spark.x + 12, spark.y + 20);
    ctx.stroke();

    ctx.restore();
  }

  function drawTopBar(time) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    roundRect(ctx, 0, 0, WIDTH, 64, 0);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, WIDTH, 64);

    ctx.fillStyle = '#073B4C';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Spark Squad - Level ${level}`, 14, 28);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#16697A';
    ctx.fillText('Theme: Electricity • Math: Addition/Subtraction', 14, 46);

    // audio icon with soft pulse
    ctx.save();
    const ax = WIDTH - 60;
    const ay = 22;
    ctx.translate(ax, ay);
    ctx.fillStyle = muted ? '#bbb' : '#2B8A8A';
    ctx.strokeStyle = '#1C3B3B';
    ctx.lineWidth = 1;
    // speaker shape
    ctx.beginPath();
    ctx.moveTo(-12, -8);
    ctx.lineTo(-4, -8);
    ctx.lineTo(4, -14);
    ctx.lineTo(4, 14);
    ctx.lineTo(-4, 8);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();

    if (!muted) {
      ctx.beginPath();
      ctx.strokeStyle = '#54B4B4';
      ctx.lineWidth = 2;
      const radius = 8 + Math.sin(audioIndicatorPulse) * 1.6;
      ctx.arc(8, 0, radius, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#E07A5F';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(12, -10);
      ctx.lineTo(-2, 12);
      ctx.moveTo(-2, -10);
      ctx.lineTo(12, 12);
      ctx.stroke();
    }

    ctx.restore();

    ctx.fillStyle = '#3A3A3A';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Arrows/WASD to move, Space/Enter to use node, M mute, H help', WIDTH - 14, 46);
  }

  function drawMessagePanel(time) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    roundRect(ctx, 10, HEIGHT - 100, WIDTH - 20, 90, 10);
    ctx.fill();

    ctx.fillStyle = '#233044';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    const wrapText = (text, x, y, maxW, lineH) => {
      const words = text.split(' ');
      let line = '';
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxW && n > 0) {
          ctx.fillText(line, x, y);
          line = words[n] + ' ';
          y += lineH;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, y);
    };
    wrapText(message, 28, HEIGHT - 70, WIDTH - 80, 18);

    // keyboard hint block
    ctx.fillStyle = '#2B8A8A';
    roundRect(ctx, WIDTH - 146, HEIGHT - 86, 120, 58, 8);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Interact: Space / Enter', WIDTH - 86, HEIGHT - 50);
    ctx.fillText('Mute: M  Help: H', WIDTH - 86, HEIGHT - 34);
  }

  // ---------- Update & render loop ----------
  let lastTime = performance.now();

  function update(now) {
    const dt = Math.min(50, now - lastTime) / 16.666;
    lastTime = now;

    // Input movement
    let dx = 0;
    let dy = 0;
    if (keys['arrowleft'] || keys['a']) dx -= 1;
    if (keys['arrowright'] || keys['d']) dx += 1;
    if (keys['arrowup'] || keys['w']) dy -= 1;
    if (keys['arrowdown'] || keys['s']) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
      spark.vx += dx * spark.speed * 0.22 * dt;
      spark.vy += dy * spark.speed * 0.22 * dt;
    } else {
      spark.vx *= 0.91;
      spark.vy *= 0.91;
    }

    spark.vx = Math.max(-6, Math.min(6, spark.vx));
    spark.vy = Math.max(-6, Math.min(6, spark.vy));

    spark.x += spark.vx;
    spark.y += spark.vy;

    spark.x = Math.max(16, Math.min(WIDTH - 16, spark.x));
    spark.y = Math.max(80, Math.min(HEIGHT - 16, spark.y));

    // particles update
    const nowMs = performance.now();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const lifeProgress = (nowMs - p.born) / p.life;
      if (lifeProgress >= 1) {
        particles.splice(i, 1);
        continue;
      }
      // movement with gravity and drag
      p.vx *= 0.985;
      p.vy += 0.08; // light gravity
      p.x += p.vx;
      p.y += p.vy;
      p.alpha = 1 - lifeProgress;
    }

    // audio indicator pulse
    audioIndicatorPulse += 0.08;

    if (msgTimer > 0) msgTimer--;

    render(nowMs);

    requestAnimationFrame(update);
  }

  function render(timeNow) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground(timeNow);
    drawTopBar(timeNow);

    // battery and device
    drawBattery(battery.x, battery.y, battery.radius, battery.charge, timeNow);
    drawDevice(device.x, device.y, device.radius, device.target, timeNow);

    // draw path ghost to nearest node
    let nearest = null;
    let minD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (usedNodes.has(i)) continue;
      const n = nodes[i];
      const d = Math.hypot(spark.x - n.x, spark.y - n.y);
      if (d < minD) {
        minD = d;
        nearest = n;
      }
    }
    // nodes under path drawn before spark to give depth
    nodes.forEach((n, i) => {
      drawNode(n, usedNodes.has(i), timeNow);
    });

    if (nearest && minD < 220) {
      ctx.save();
      ctx.strokeStyle = 'rgba(58,134,255,0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.quadraticCurveTo((spark.x + nearest.x) / 2, (spark.y + nearest.y) / 2 - 40, nearest.x, nearest.y);
      ctx.stroke();
      ctx.restore();
    }

    // draw particles
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // spark appears on top
    drawSpark(timeNow);

    drawMessagePanel(timeNow);

    // help overlay
    if (showHelp || msgTimer > 0) {
      if (showHelp) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(ctx, 180, 74, 360, 110, 12);
        ctx.fill();
        ctx.fillStyle = '#1a3b3b';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('How to Play', WIDTH / 2, 100);
        ctx.font = '12px sans-serif';
        ctx.fillText('1) Move the spark with Arrow keys or WASD.', WIDTH / 2, 122);
        ctx.fillText('2) Press Space or Enter when touching a number node to change the battery charge.', WIDTH / 2, 142);
        ctx.fillText('3) When battery charge equals device target, go to the device and press Enter to finish the level.', WIDTH / 2, 162);
      }
    }
  }

  // ---------- Initialization ----------
  function init() {
    canvas.focus();
    generateLevel(level);
    lastTime = performance.now();
    requestAnimationFrame(update);
    announce('Spark Squad started. ' + message);
  }

  // Ensure audio resume on first user gesture (browsers often require it)
  function initOnFirstGesture() {
    resumeAudioIfNeeded();
    canvas.removeEventListener('pointerdown', initOnFirstGesture);
    canvas.removeEventListener('mousedown', initOnFirstGesture);
    canvas.removeEventListener('touchstart', initOnFirstGesture);
    // gentle click to indicate audio is ready
    try {
      if (!muted && audioEnabled && audioCtx) {
        playClick();
      }
    } catch (e) { /* ignore */ }
  }

  canvas.addEventListener('pointerdown', initOnFirstGesture);
  canvas.addEventListener('mousedown', initOnFirstGesture);
  canvas.addEventListener('touchstart', initOnFirstGesture);

  // focus and click hooks
  canvas.addEventListener('click', () => {
    canvas.focus();
  });

  canvas.addEventListener('focus', () => {
    announce('Canvas focused. Use arrow keys or WASD to move the spark. Press Space or Enter to interact with nodes or the device. Press H to toggle help.');
  });

  // Kick off game with error handling
  try {
    init();
  } catch (e) {
    console.error('Game initialization failed', e);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#000';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('An error occurred while starting the game. Please try reloading the page.', WIDTH / 2, HEIGHT / 2);
    announce('Game failed to start. Please reload the page.');
  }
})();