(function () {
  // Enhanced Electricity Math Game (visual & audio improvements)
  // Renders inside element with ID "game-of-the-day-stage"
  // Canvas must be exactly 720x480
  // All visuals drawn with canvas API, all audio with Web Audio API oscillators/filters
  // Accessibility: keyboard controls, aria labels, offscreen live region for screen readers

  // ==== Setup DOM and Canvas ====
  const STAGE_ID = 'game-of-the-day-stage';
  const STAGE = document.getElementById(STAGE_ID);
  if (!STAGE) {
    console.error('Game stage element not found:', STAGE_ID);
    return;
  }

  // Clear stage
  STAGE.innerHTML = '';
  STAGE.style.position = 'relative';

  // Create canvas with exact dimensions
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Spark Factory math game. Use keyboard or mouse to select number nodes to equal a target number. Press S to toggle sound.'
  );
  canvas.tabIndex = 0; // focusable
  STAGE.appendChild(canvas);

  // Offscreen live region for screen readers
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.style.position = 'absolute';
  live.style.left = '-10000px';
  live.style.width = '1px';
  live.style.height = '1px';
  live.style.overflow = 'hidden';
  STAGE.appendChild(live);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('2D context not available.');
    return;
  }

  // ==== Audio Setup with error handling ====
  let audioEnabled = true;
  let audioCtx = null;
  let ambientNodes = null; // object holding ambient oscillators/gain
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  } catch (e) {
    console.warn('Web Audio API not available or blocked:', e);
    audioEnabled = false;
  }

  function ensureAudioRunning() {
    if (!audioEnabled || !audioCtx) return Promise.resolve();
    if (audioCtx.state === 'suspended') {
      return audioCtx.resume().catch((e) => {
        console.warn('Could not resume audio context:', e);
      });
    }
    return Promise.resolve();
  }

  // Utility: create a gentle envelope and harmonic-rich tone
  function playTone({
    freq = 440,
    duration = 0.15,
    type = 'sine',
    gain = 0.12,
    attack = 0.01,
    release = 0.03,
    detune = 0,
    harmonic = 0.0,
    filterFreq = null,
  } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // Main oscillator
      const o = audioCtx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      o.detune.value = detune;
      // optional harmonic oscillator for richer sound
      let harmonicOsc = null;
      if (harmonic > 0) {
        harmonicOsc = audioCtx.createOscillator();
        harmonicOsc.type = 'sine';
        harmonicOsc.frequency.setValueAtTime(freq * (1 + harmonic), now);
      }
      // Filter for gentle shaping
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 1.0;
      filter.frequency.value = filterFreq || 1400;

      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

      // connect chain
      if (harmonicOsc) {
        harmonicOsc.connect(filter);
      }
      o.connect(filter);
      filter.connect(g);
      g.connect(audioCtx.destination);

      o.start(now);
      if (harmonicOsc) harmonicOsc.start(now);
      const stopTime = now + duration + release + 0.02;
      o.stop(stopTime);
      if (harmonicOsc) harmonicOsc.stop(stopTime);
    } catch (err) {
      console.warn('Error playing tone:', err);
      audioEnabled = false;
    }
  }

  // Improved ambient: two-layer hum with slow LFO movement and gentle noise-like shimmer
  function startAmbient() {
    if (!audioEnabled || !audioCtx || ambientNodes) return;
    try {
      const now = audioCtx.currentTime;
      const master = audioCtx.createGain();
      master.gain.value = 0.0;
      master.connect(audioCtx.destination);

      // Low rumble
      const o1 = audioCtx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 110;
      const g1 = audioCtx.createGain();
      g1.gain.value = 0.015;
      // Slight detuned companion for warmth
      const o1b = audioCtx.createOscillator();
      o1b.type = 'sine';
      o1b.frequency.value = 112;
      const g1b = audioCtx.createGain();
      g1b.gain.value = 0.009;

      // Bright gentle layer
      const o2 = audioCtx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 420;
      const g2 = audioCtx.createGain();
      g2.gain.value = 0.01;

      // Lowpass for cohesive sound
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
      filter.Q.value = 0.8;

      // LFO for movement
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 60;
      lfo.connect(lfoGain);

      // Connect nodes
      o1.connect(g1);
      o1b.connect(g1b);
      g1.connect(filter);
      g1b.connect(filter);
      o2.connect(g2);
      g2.connect(filter);
      filter.connect(master);

      // LFO modulates filter cutoff for slow breathing
      lfoGain.connect(filter.frequency);
      lfo.start(now);
      o1.start(now);
      o1b.start(now);
      o2.start(now);

      // ramp master up gently
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0.0, now);
      master.gain.linearRampToValueAtTime(0.035, now + 0.8);

      ambientNodes = { o1, o1b, o2, g1, g1b, g2, filter, lfo, lfoGain, master };
    } catch (err) {
      console.warn('Error starting ambient:', err);
      ambientNodes = null;
    }
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    try {
      const now = audioCtx.currentTime;
      // ramp down then stop
      ambientNodes.master.gain.cancelScheduledValues(now);
      ambientNodes.master.gain.setValueAtTime(ambientNodes.master.gain.value || 0.03, now);
      ambientNodes.master.gain.linearRampToValueAtTime(0.0, now + 0.4);
      setTimeout(() => {
        try {
          ambientNodes.o1.stop();
          ambientNodes.o1b.stop();
          ambientNodes.o2.stop();
          ambientNodes.lfo.stop();
        } catch (e) {
          // ignore already-stopped
        }
        ambientNodes = null;
      }, 600);
    } catch (err) {
      console.warn('Error stopping ambient:', err);
      ambientNodes = null;
    }
  }

  // Improved sound effects using richer envelopes and harmonics
  function playSelectSound() {
    ensureAudioRunning().then(() => {
      playTone({
        freq: 880,
        duration: 0.09,
        type: 'sawtooth',
        gain: 0.08,
        attack: 0.008,
        harmonic: 0.02,
        filterFreq: 1800,
      });
    });
  }
  function playDeselectSound() {
    ensureAudioRunning().then(() => {
      playTone({
        freq: 480,
        duration: 0.13,
        type: 'triangle',
        gain: 0.06,
        attack: 0.01,
        harmonic: 0.015,
        filterFreq: 1200,
      });
    });
  }
  function playCorrectSound() {
    ensureAudioRunning().then(() => {
      // gentle triad arpeggio
      const notes = [660, 880, 1320];
      notes.forEach((n, i) => {
        setTimeout(() => {
          playTone({
            freq: n,
            duration: 0.22,
            type: 'sine',
            gain: 0.14,
            attack: 0.004,
            harmonic: 0.04,
            filterFreq: 3200,
          });
        }, i * 120);
      });
    });
  }
  function playIncorrectSound() {
    ensureAudioRunning().then(() => {
      playTone({
        freq: 240,
        duration: 0.32,
        type: 'sawtooth',
        gain: 0.12,
        attack: 0.01,
        filterFreq: 800,
      });
      setTimeout(
        () =>
          playTone({
            freq: 160,
            duration: 0.2,
            type: 'sine',
            gain: 0.07,
            attack: 0.01,
            filterFreq: 600,
          }),
        150
      );
    });
  }

  // Toggle audio on/off
  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      ensureAudioRunning()
        .then(() => startAmbient())
        .catch(() => {});
    } else {
      stopAmbient();
    }
    announce(`Sound ${audioEnabled ? 'on' : 'off'}`);
  }

  // ==== Game Logic ====
  const state = {
    nodes: [], // {x,y,r,value,selected,id}
    target: 10,
    selections: [],
    maxSelect: 3,
    score: 0,
    round: 1,
    attemptsLeft: 3,
    highlightIndex: 0,
    message: 'Select numbers to equal the target',
    showHelp: false,
  };

  function announce(text) {
    if (!live) return;
    live.textContent = text;
  }

  // random int inclusive
  function ri(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Generates a solvable round (unchanged logic)
  function generateRound(roundNum = 1) {
    const minT = 6 + Math.min(roundNum - 1, 6);
    const maxT = 12 + Math.min(roundNum - 1, 8);
    const target = ri(minT, maxT);
    const terms = Math.random() < 0.4 ? 2 : 3;
    const parts = [];
    let remaining = target;
    for (let i = 0; i < terms - 1; i++) {
      const maxPart = Math.min(9, remaining - (terms - i - 1) * 1);
      const partMin = 1;
      const part = ri(partMin, Math.max(partMin, maxPart));
      parts.push(part);
      remaining -= part;
    }
    if (remaining < 1) {
      const a = ri(1, Math.min(9, target - 1));
      const b = target - a;
      parts.length = 0;
      parts.push(a, b);
    } else if (remaining > 9) {
      const a = ri(1, 9);
      const b = remaining - a;
      if (b <= 9 && b >= 1) {
        parts.push(a, b);
      } else {
        parts.push(ri(1, 9));
        parts.push(ri(1, 9));
      }
    } else {
      parts.push(remaining);
    }
    for (let i = parts.length - 1; i > 0; i--) {
      const j = ri(0, i);
      [parts[i], parts[j]] = [parts[j], parts[i]];
    }

    const nodes = [];
    const positions = [
      { x: 140, y: 160 },
      { x: 360, y: 100 },
      { x: 580, y: 160 },
      { x: 180, y: 320 },
      { x: 360, y: 260 },
      { x: 540, y: 320 },
    ];
    for (let i = 0; i < positions.length; i++) {
      let value;
      if (i < parts.length) {
        value = parts[i];
      } else {
        let candidate;
        let safety = 0;
        do {
          candidate = ri(1, 9);
          safety++;
        } while (safety < 20 && Math.random() < 0.3 && parts.includes(candidate));
        value = candidate;
      }
      nodes.push({
        id: i,
        x: positions[i].x,
        y: positions[i].y,
        r: 40,
        value,
        selected: false,
        disabled: false,
        pulse: Math.random() * 2,
      });
    }

    state.nodes = nodes;
    state.target = target;
    state.selections = [];
    state.highlightIndex = 0;
    state.round = roundNum;
    state.attemptsLeft = 3;
    state.message = 'Select numbers to equal the target';
  }

  // selection check logic unchanged
  function currentSum() {
    return state.selections.reduce((s, idx) => s + state.nodes[idx].value, 0);
  }
  function checkSelection() {
    const sum = currentSum();
    if (sum === state.target) {
      state.score += 1;
      state.message = 'Perfect! Gadget powered up!';
      announce(`Correct! Round ${state.round} complete. Score ${state.score}.`);
      playCorrectSound();
      // short visual celebration: mark nodes
      for (const idx of state.selections) {
        const n = state.nodes[idx];
        if (n) n._celebrate = 1.0;
      }
      setTimeout(() => {
        generateRound(state.round + 1);
      }, 900);
    } else if (sum > state.target || state.selections.length >= state.maxSelect) {
      state.attemptsLeft -= 1;
      if (state.attemptsLeft <= 0) {
        state.message = `Out of attempts. The correct sum was ${state.target}. Try again!`;
        announce(`Round ${state.round} failed. Score ${state.score}.`);
        playIncorrectSound();
        setTimeout(() => {
          generateRound(Math.max(1, state.round));
        }, 1200);
      } else {
        state.message = `Not quite. ${state.attemptsLeft} ${state.attemptsLeft === 1 ? 'attempt' : 'attempts'} left. Try another combo.`;
        announce(state.message);
        playIncorrectSound();
        for (const idx of state.selections) state.nodes[idx].selected = false;
        state.selections = [];
      }
    } else {
      state.message = 'Good partial total. Keep going!';
      playSelectSound();
    }
  }

  // selection/deselection logic unchanged
  function selectNode(idx) {
    if (!state.nodes[idx]) return;
    const node = state.nodes[idx];
    if (node.disabled) return;
    if (node.selected) {
      node.selected = false;
      const pos = state.selections.indexOf(idx);
      if (pos >= 0) state.selections.splice(pos, 1);
      playDeselectSound();
      state.message = 'Number removed.';
      announce('Number removed.');
      return;
    }
    if (state.selections.length >= state.maxSelect) {
      state.message = `You can only pick up to ${state.maxSelect} numbers.`;
      announce(state.message);
      return;
    }
    node.selected = true;
    state.selections.push(idx);
    checkSelection();
  }

  // keyboard highlight movement unchanged
  function moveHighlight(dx, dy) {
    const positions = state.nodes.map((n) => ({ x: n.x, y: n.y }));
    let current = state.highlightIndex || 0;
    const currPos = positions[current];
    let bestIdx = current;
    let bestScore = Infinity;
    for (let i = 0; i < positions.length; i++) {
      if (i === current) continue;
      const p = positions[i];
      const vx = p.x - currPos.x;
      const vy = p.y - currPos.y;
      if (dx !== 0 && Math.sign(vx) !== dx) continue;
      if (dy !== 0 && Math.sign(vy) !== dy) continue;
      const dist = Math.abs(vx) + Math.abs(vy);
      if (dist < bestScore) {
        bestScore = dist;
        bestIdx = i;
      }
    }
    if (bestIdx !== current) {
      state.highlightIndex = bestIdx;
      playSelectSound();
    }
  }

  // Helper to get node index from pointer coordinates
  function nodeIndexAt(x, y) {
    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i];
      const dx = x - n.x;
      const dy = y - n.y;
      if (dx * dx + dy * dy <= n.r * n.r) return i;
    }
    return -1;
  }

  // ==== Visual augmentation: particles, electrons, timing ====
  let timeStart = performance.now();
  const electrons = []; // moving particles along wires
  const sparks = []; // ephemeral spark particles

  // spawn an electron traveling from node to gadget center
  function emitElectron(fromX, fromY, toX, toY, speed = 0.008) {
    const life = 1.0;
    electrons.push({
      sx: fromX,
      sy: fromY,
      tx: toX,
      ty: toY,
      t: 0,
      speed,
      life,
      hue: 190 + Math.random() * 40,
    });
  }

  // spawn a small spark at (x,y)
  function spawnSpark(x, y, count = 6) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.6;
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * s * (0.6 + Math.random()),
        vy: Math.sin(a) * s * (0.6 + Math.random()),
        life: 0.5 + Math.random() * 0.6,
        age: 0,
        size: 2 + Math.random() * 3,
        hue: 40 + Math.random() * 30,
      });
    }
  }

  // periodically emit tiny electrons from nodes to gadget; avoid too many
  let lastEmit = 0;

  // ==== Drawing Helpers ====
  // Rounded rect polyfill if necessary
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // Background with soft radial vignette and subtle circuit texture
  function drawBackground(t) {
    // layered gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#eef9ff');
    g.addColorStop(0.6, '#f8fff7');
    g.addColorStop(1, '#f0fbff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // soft vignette
    ctx.save();
    const vg = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      10,
      canvas.width / 2,
      canvas.height / 2,
      520
    );
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(0.7, 'rgba(0,0,0,0.02)');
    vg.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // faint grid circuits (animated slight drift)
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#9fd9ff';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const yBase = 40 + i * 76;
      for (let x = 0; x <= canvas.width; x += 16) {
        const phase = t / 1200 + i * 0.7;
        const ny = yBase + Math.sin((x / canvas.width) * Math.PI * 4 + phase) * (6 + i * 0.5);
        if (x === 0) ctx.moveTo(x, ny);
        else ctx.lineTo(x, ny);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Friendly characters refined with subtle bobbing
  function drawCharacters(t) {
    // Captain Capacitor (left)
    ctx.save();
    const bob = Math.sin(t / 600) * 4;
    ctx.translate(0, bob);
    // body
    ctx.fillStyle = '#ffd88a';
    ctx.beginPath();
    ctx.ellipse(90, 360, 56, 80, 0, 0, Math.PI * 2);
    ctx.fill();
    // metallic top with gloss
    const topGrad = ctx.createLinearGradient(34, 278, 146, 322);
    topGrad.addColorStop(0, '#f7f7f7');
    topGrad.addColorStop(1, '#dcdcdc');
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.ellipse(90, 300, 56, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes with tiny shine
    ctx.fillStyle = '#2b3b3b';
    ctx.beginPath();
    ctx.arc(70, 350, 6, 0, Math.PI * 2);
    ctx.arc(110, 350, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(68, 348, 2.2, 0, Math.PI * 2);
    ctx.arc(108, 348, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.strokeStyle = '#2b3b3b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(90, 365, 18, 0, Math.PI);
    ctx.stroke();
    // label
    ctx.fillStyle = '#25414a';
    ctx.font = '12px sans-serif';
    ctx.fillText('Captain Capacitor', 40, 430);
    ctx.restore();

    // Gigi the Gizmo (right) with subtle rotation
    ctx.save();
    const jitter = Math.sin(t / 450) * 0.03;
    ctx.translate(620, 90);
    ctx.rotate(jitter);
    // main body
    const bodyGrad = ctx.createLinearGradient(-60, -90, 60, 60);
    bodyGrad.addColorStop(0, '#e8f4ff');
    bodyGrad.addColorStop(1, '#dfefff');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-60, 0);
    ctx.quadraticCurveTo(0, -90, 60, 0);
    ctx.quadraticCurveTo(0, 60, -60, 0);
    ctx.fill();
    // eye
    ctx.fillStyle = '#1f5569';
    ctx.beginPath();
    ctx.arc(0, -10, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-6, -16, 6, 0, Math.PI * 2);
    ctx.fill();
    // antenna spark (gentle glow)
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath();
    ctx.moveTo(0, -90);
    ctx.lineTo(8, -72);
    ctx.lineTo(-8, -72);
    ctx.fill();
    // label
    ctx.fillStyle = '#25414a';
    ctx.font = '12px sans-serif';
    ctx.fillText('Gigi the Gizmo', -40, 50);
    ctx.restore();
  }

  // Draw wires, nodes, and dynamic effects
  function drawNodes(t) {
    const gadgetCx = 360;
    const gadgetCy = 140 + 120;
    // draw wires first
    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i];
      ctx.save();
      // shade the wire color between blue and gold depending on selection
      const wireColor = n.selected ? 'rgba(255,200,80,0.95)' : 'rgba(110,190,240,0.7)';
      ctx.strokeStyle = wireColor;
      ctx.lineWidth = n.selected ? 4.5 : 2.2;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      const cx = gadgetCx;
      const cy = gadgetCy - 6 + (i % 2 === 0 ? -8 : 8);
      const controlX = (n.x + cx) / 2;
      const controlY = n.y - 36 + Math.sin((t + i * 200) / 800) * 14;
      ctx.quadraticCurveTo(controlX, controlY, cx, cy);
      ctx.stroke();
      ctx.restore();
    }

    // animate electrons along wires
    const now = performance.now();
    for (let i = electrons.length - 1; i >= 0; i--) {
      const e = electrons[i];
      e.t += e.speed * (16 / 1000) * (1 + Math.random() * 0.2);
      if (e.t >= e.life) {
        electrons.splice(i, 1);
        continue;
      }
      // eased position along quadratic curve
      const u = e.t / e.life;
      // simple ease-in-out
      const uu = u * u * (3 - 2 * u);
      const x = e.sx + (e.tx - e.sx) * uu;
      const y = e.sy + (e.ty - e.sy) * uu;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `hsla(${e.hue}, 90%, 60%, ${0.9 - u * 0.8})`;
      ctx.beginPath();
      ctx.arc(x, y, 3.0 * (1 - 0.4 * u), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // draw nodes (circles) with pulsing effect
    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i];
      const isHighlighted = i === state.highlightIndex;
      // pulse calculation
      const pulse = 1 + Math.sin(t / 320 + n.pulse) * 0.04 + (n.selected ? 0.12 : 0);
      // outer glow
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      const glowAlpha = n.selected ? 0.26 : isHighlighted ? 0.18 : 0.08;
      ctx.fillStyle = `rgba(255, 220, 120, ${glowAlpha})`;
      ctx.arc(n.x, n.y, n.r * 1.18 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // core circle with soft bevel
      ctx.save();
      // body gradient
      const grad = ctx.createLinearGradient(n.x - n.r, n.y - n.r, n.x + n.r, n.y + n.r);
      grad.addColorStop(0, n.selected ? '#fff6e8' : '#ffffff');
      grad.addColorStop(1, n.selected ? '#fff1d2' : '#f3fbff');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#216874';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // subtle inner highlight
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.ellipse(n.x - n.r * 0.28, n.y - n.r * 0.42, n.r * 0.36, n.r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // number
      ctx.fillStyle = '#184b57';
      ctx.font = `${Math.round(28 * (1 + (n.selected ? 0.06 : 0)))}px "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n.value), n.x, n.y - 3);

      // keyboard hint
      ctx.fillStyle = '#197388';
      ctx.font = '11px sans-serif';
      ctx.fillText(`Key ${i + 1}`, n.x, n.y + n.r - 8);

      // bolt icon when selected (more refined)
      if (n.selected) {
        ctx.beginPath();
        ctx.fillStyle = '#f6b431';
        ctx.moveTo(n.x - 8, n.y - 18);
        ctx.lineTo(n.x + 2, n.y - 8);
        ctx.lineTo(n.x - 2, n.y - 8);
        ctx.lineTo(n.x + 8, n.y + 8);
        ctx.lineTo(n.x - 2, n.y + 0);
        ctx.lineTo(n.x + 2, n.y + 0);
        ctx.closePath();
        ctx.fill();

        // emit a small electron occasionally from selected node
        if (Math.random() < 0.02)
          emitElectron(
            n.x,
            n.y,
            gadgetCx + (Math.random() * 20 - 10),
            gadgetCy + (Math.random() * 20 - 10),
            0.006 + Math.random() * 0.008
          );
      }

      // celebration shimmer when marked
      if (n._celebrate) {
        ctx.globalCompositeOperation = 'lighter';
        const alpha = Math.max(0, n._celebrate);
        ctx.fillStyle = `rgba(255,230,160,${alpha})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 18 * alpha, 0, Math.PI * 2);
        ctx.fill();
        n._celebrate -= 0.02;
        if (n._celebrate <= 0) delete n._celebrate;
      }

      ctx.restore();
    }

    // draw sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += 0.016;
      if (s.age >= s.life) {
        sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx;
      s.y += s.vy;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const a = 1 - s.age / s.life;
      ctx.fillStyle = `rgba(255,${190 + Math.round(Math.random() * 60)},60,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // central gadget with progress meter and subtle animation
  function drawGadget(t) {
    const cx = 360;
    const cy = 140 + 120;
    ctx.save();
    // gadget base with layered soft shadows
    ctx.beginPath();
    ctx.fillStyle = '#eefcff';
    ctx.roundRect(cx - 140, cy - 90, 280, 120, 14);
    ctx.fill();
    ctx.strokeStyle = '#1b5d6a';
    ctx.lineWidth = 3;
    ctx.stroke();

    // label and big target
    ctx.fillStyle = '#0e4752';
    ctx.font = '22px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Gadget Power Need', cx, cy - 44);

    ctx.font = '44px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#144c55';
    ctx.fillText(String(state.target), cx, cy + 6);

    // progress meter
    const sum = currentSum();
    const pct = Math.min(1, sum / state.target);
    // background bar
    ctx.fillStyle = '#d9f6ff';
    ctx.fillRect(cx - 100, cy + 24, 200, 16);
    // animated gradient fill
    const mg = ctx.createLinearGradient(cx - 100 + (t % 200), cy + 24, cx + 100 + (t % 200), cy + 24);
    mg.addColorStop(0, '#bfefff');
    mg.addColorStop(0.5, '#68d6ff');
    mg.addColorStop(1, '#bfefff');
    ctx.fillStyle = mg;
    ctx.fillRect(cx - 100, cy + 24, 200 * pct, 16);
    ctx.strokeStyle = '#13707f';
    ctx.strokeRect(cx - 100, cy + 24, 200, 16);

    // subtle sparks around gadget when nearly complete
    if (pct > 0.6) {
      for (let i = 0; i < Math.round((pct - 0.6) * 8); i++) {
        const ang = Math.random() * Math.PI * 2;
        const rx = cx + Math.cos(ang) * (90 + Math.random() * 16);
        const ry = cy + Math.sin(ang) * (10 + Math.random() * 10);
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,220,120,${0.12 + Math.random() * 0.12})`;
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // tiny spark burst when exactly matched
    if (sum === state.target) {
      spawnSpark(cx + (Math.random() * 20 - 10), cy + (Math.random() * 10 - 5), 6);
    }

    ctx.restore();
  }

  // UI: top info, message box, audio icon
  function drawUI() {
    ctx.save();
    // top-left stats
    ctx.fillStyle = '#0d4d58';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${state.score}`, 16, 24);
    ctx.fillText(`Round: ${state.round}`, 16, 44);
    ctx.fillText(`Attempts: ${state.attemptsLeft}`, 16, 64);

    // compact instructions line
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#0b6b7a';
    ctx.fillText(
      'Keys: 1-6 select nodes • arrows move • Enter select • Backspace undo • S toggle sound • R reset',
      150,
      22
    );

    // message box bottom
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(20, 420, 680, 44, 8);
    ctx.fill();
    ctx.strokeStyle = '#18606d';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#114b5f';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(state.message, 36, 447);

    // audio icon top-right
    ctx.save();
    ctx.translate(678, 8);
    // speaker
    ctx.fillStyle = audioEnabled ? '#ffd36b' : '#d0d0d0';
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(10, 6);
    ctx.lineTo(18, 0);
    ctx.lineTo(18, 24);
    ctx.lineTo(10, 18);
    ctx.lineTo(0, 18);
    ctx.closePath();
    ctx.fill();
    if (audioEnabled) {
      ctx.strokeStyle = '#fff1c8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(22, 12, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(22, 12, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#9b9b9b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(30, 26);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  // Main render loop
  function render() {
    const now = performance.now();
    const t = now - timeStart;
    // clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground(t);
    drawCharacters(t);
    drawNodes(t);
    drawGadget(t);
    drawUI();

    // highlight ring for focused node
    const hi = state.highlightIndex;
    if (typeof hi === 'number' && state.nodes[hi]) {
      const n = state.nodes[hi];
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,150,30,0.95)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.arc(n.x, n.y, n.r + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // periodically emit background electrons
    if (now - lastEmit > 250) {
      lastEmit = now;
      const idx = Math.floor(Math.random() * state.nodes.length);
      const n = state.nodes[idx];
      if (n)
        emitElectron(
          n.x,
          n.y,
          360 + (Math.random() * 20 - 10),
          260 + (Math.random() * 8 - 4),
          0.007 + Math.random() * 0.01
        );
    }

    requestAnimationFrame(render);
  }

  // ==== Input Handling ====
  canvas.addEventListener('click', (e) => {
    canvas.focus();
    if (audioEnabled && audioCtx && audioCtx.state === 'suspended') {
      ensureAudioRunning().then(() => startAmbient());
    }
  });

  // pointer coordinates helper
  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  canvas.addEventListener('mousemove', (e) => {
    const p = toCanvasCoords(e);
    const idx = nodeIndexAt(p.x, p.y);
    if (idx !== -1) {
      state.highlightIndex = idx;
    }
  });

  canvas.addEventListener('click', (e) => {
    const p = toCanvasCoords(e);
    const idx = nodeIndexAt(p.x, p.y);
    if (idx !== -1) {
      selectNode(idx);
      announce(`Selected ${state.nodes[idx].value}. Current sum ${currentSum()} of ${state.target}.`);
      // visual spark and soft click tone
      spawnSpark(p.x, p.y, 5);
      ensureAudioRunning().then(() => {
        playTone({
          freq: 920,
          duration: 0.07,
          type: 'square',
          gain: 0.08,
          attack: 0.006,
          harmonic: 0.02,
          filterFreq: 1800,
        });
      });
    } else {
      // clicking gadget area gives hint
      if (p.x > 220 && p.x < 500 && p.y > 180 && p.y < 320) {
        state.message = 'Click a number or press keys 1-6 to select nodes.';
        announce(state.message);
      }
    }
  });

  // Keyboard controls (unchanged behavior)
  canvas.addEventListener('keydown', (e) => {
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (arrows.includes(e.key)) e.preventDefault();

    if (e.key >= '1' && e.key <= '6') {
      const idx = parseInt(e.key, 10) - 1;
      selectNode(idx);
      announce(`Selected ${state.nodes[idx].value}. Current sum ${currentSum()} of ${state.target}.`);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      selectNode(state.highlightIndex);
      const n = state.nodes[state.highlightIndex];
      if (n) announce(`Selected ${n.value}. Current sum ${currentSum()} of ${state.target}.`);
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const last = state.selections.pop();
      if (typeof last !== 'undefined') {
        state.nodes[last].selected = false;
        state.message = 'Removed last selection.';
        announce(state.message);
        playDeselectSound();
      } else {
        state.message = 'No selections to undo.';
        announce(state.message);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      moveHighlight(-1, 0);
      return;
    }
    if (e.key === 'ArrowRight') {
      moveHighlight(1, 0);
      return;
    }
    if (e.key === 'ArrowUp') {
      moveHighlight(0, -1);
      return;
    }
    if (e.key === 'ArrowDown') {
      moveHighlight(0, 1);
      return;
    }
    if (e.key.toLowerCase() === 's') {
      toggleAudio();
      return;
    }
    if (e.key.toLowerCase() === 'r') {
      generateRound(1);
      state.score = 0;
      announce('Game reset.');
      return;
    }
    if (e.key.toLowerCase() === 'h') {
      state.showHelp = !state.showHelp;
      state.message = state.showHelp ? 'Help shown.' : 'Help hidden.';
      announce(state.message);
      return;
    }
  });

  // keyboard focus styles
  canvas.addEventListener('focus', () => {
    canvas.style.outline = '2px dashed rgba(30,120,130,0.5)';
  });
  canvas.addEventListener('blur', () => {
    canvas.style.outline = 'none';
  });

  // ==== Initialization & Start ====
  if (audioEnabled && audioCtx) {
    ensureAudioRunning()
      .then(() => {
        try {
          startAmbient();
        } catch (e) {
          // may be suspended; ignore
        }
      })
      .catch(() => {});
  }

  generateRound(1);
  render();

  announce('Welcome to Spark Factory. Match numbers to the gadget target. Use keys 1 to 6 or click nodes. Press S to toggle sound.');

  // Expose minimal API on stage (no global pollution)
  STAGE.game = {
    reset: () => {
      generateRound(1);
    },
    toggleAudio,
  };
})();