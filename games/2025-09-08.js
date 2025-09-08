(function () {
  'use strict';

  // ------- Configuration -------
  const WIDTH = 720;
  const HEIGHT = 480;
  const LEVELS = 5;
  const TILE_COUNT = 9;
  const MACHINE_COUNT = 3;

  // A refined palette for calm focus
  const PALETTE = {
    bgTop: '#EAF6F5',
    bgBottom: '#DCEFEA',
    panel: '#FFFFFF',
    softPanel: '#F6FBFA',
    accent: '#6FAF86',
    accentDark: '#4B8A66',
    text: '#143028',
    tileFace: '#FFFDF8',
    tileEdge: '#D9CFC3',
    shadow: 'rgba(12,20,16,0.12)',
    machineShell: '#F0FAF7',
    machineTrim: '#CFE6DB',
    robot: '#D7EFE6'
  };

  // ------- DOM Setup -------
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.');
    return;
  }
  // Clear and prepare container
  container.innerHTML = '';
  container.style.userSelect = 'none';
  container.style.position = 'relative';
  container.style.width = WIDTH + 'px';
  container.style.height = HEIGHT + 'px';

  // Create canvas (game area exactly WIDTH x HEIGHT)
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Machine Math game. Solve simple addition and subtraction to fix the machines.'
  );
  canvas.style.display = 'block';
  canvas.style.background = PALETTE.bgTop;
  canvas.style.cursor = 'pointer';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  // Create hidden live region for screen reader messages
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-10000px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  container.appendChild(liveRegion);

  // ------- Audio Setup -------
  let audioAllowed = true;
  let audioContext = null;
  let masterGain = null;
  let ambientNodes = [];
  let audioEnabled = true;

  // Create a gentle ambient pad using oscillators, filtered noise and LFO
  function safeCreateAudioContext() {
    if (!audioAllowed) return null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        console.warn('Web Audio API not supported in this browser.');
        audioAllowed = false;
        return null;
      }
      const ac = new AC();

      // Master
      masterGain = ac.createGain();
      masterGain.gain.value = 0.12; // gentle by default
      masterGain.connect(ac.destination);

      // Ambient pad: two detuned sine oscillators through a gentle lowpass
      const pad1 = ac.createOscillator();
      pad1.type = 'sine';
      pad1.frequency.value = 110;
      const pad2 = ac.createOscillator();
      pad2.type = 'sine';
      pad2.frequency.value = 138;
      // Slight detune
      pad2.detune.value = 6;

      const padGain = ac.createGain();
      padGain.gain.value = 0.035;

      const padFilter = ac.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 900;
      padFilter.Q.value = 0.6;

      pad1.connect(padGain);
      pad2.connect(padGain);
      padGain.connect(padFilter);
      padFilter.connect(masterGain);

      // Gentle moving filter via LFO
      const lfo = ac.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 300;
      lfo.connect(lfoGain);
      lfoGain.connect(padFilter.frequency);

      // Soft textured noise (very subtle)
      const bufferSize = 2 * ac.sampleRate;
      const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.2;
      }
      const noiseSource = ac.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;
      const noiseFilter = ac.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 1100;
      const noiseGain = ac.createGain();
      noiseGain.gain.value = 0.004;
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);

      // Start nodes
      try {
        pad1.start();
        pad2.start();
        lfo.start();
        noiseSource.start();
      } catch (e) {
        // Some browsers require user gesture to start; acceptable
      }

      ambientNodes = [
        pad1,
        pad2,
        padGain,
        padFilter,
        lfo,
        lfoGain,
        noiseSource,
        noiseFilter,
        noiseGain
      ];

      return ac;
    } catch (e) {
      console.error('Error creating AudioContext:', e);
      audioAllowed = false;
      return null;
    }
  }

  // Ensure audio context exists after a user gesture
  function ensureAudioContext() {
    if (audioContext) return;
    audioContext = safeCreateAudioContext();
    if (!audioContext) audioEnabled = false;
  }

  function stopAmbient() {
    if (!audioContext || !ambientNodes.length) return;
    try {
      // Stop oscillators (safe)
      ambientNodes.forEach((n) => {
        try {
          if (typeof n.stop === 'function') n.stop();
          if (typeof n.disconnect === 'function') n.disconnect();
        } catch (e) {
          /* ignore */
        }
      });
    } catch (e) {
      console.warn('Error stopping ambient nodes', e);
    } finally {
      ambientNodes = [];
    }
  }

  function toggleAudio() {
    if (!audioAllowed) {
      announce('Audio not available on this device.');
      audioEnabled = false;
      return;
    }
    if (!audioContext) ensureAudioContext();
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      if (masterGain) masterGain.gain.setTargetAtTime(0.12, audioContext.currentTime, 0.02);
      announce('Audio on');
    } else {
      if (masterGain) masterGain.gain.setTargetAtTime(0.0, audioContext.currentTime, 0.02);
      announce('Audio off');
    }
  }

  // Play a soft "pick" sound when user selects a tile
  function playPickSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const ac = audioContext;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.value = 660;
      const now = ac.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      const filter = ac.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 600;
      o.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      o.start();
      o.stop(now + 0.22);
    } catch (e) {
      console.error('playPickSound error', e);
    }
  }

  // Play a soft place sound (confirming placement attempt)
  function playPlaceSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const ac = audioContext;
      const now = ac.currentTime;
      // quick percussive click using noise burst
      const b = ac.createBuffer(1, ac.sampleRate * 0.02, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.02));
      const s = ac.createBufferSource();
      s.buffer = b;
      const g = ac.createGain();
      g.gain.value = 0.08;
      const hf = ac.createBiquadFilter();
      hf.type = 'highpass';
      hf.frequency.value = 800;
      s.connect(hf);
      hf.connect(g);
      g.connect(masterGain);
      s.start(now);
      s.stop(now + 0.03);
    } catch (e) {
      console.error('playPlaceSound error', e);
    }
  }

  // Replace correct/incorrect sounds with richer but soft variants
  function playCorrectSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const ac = audioContext;
      const now = ac.currentTime;
      // arpeggiated chime (three tones)
      const freqs = [440, 660, 880];
      freqs.forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const t = now + i * 0.06;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08 * (1 - i * 0.12), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        const flt = ac.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 1200 - i * 200;
        o.connect(flt);
        flt.connect(g);
        g.connect(masterGain);
        o.start(t);
        o.stop(t + 0.7);
      });
    } catch (e) {
      console.error('playCorrectSound error', e);
    }
  }

  function playIncorrectSound() {
    if (!audioEnabled || !audioContext) return;
    try {
      const ac = audioContext;
      const now = ac.currentTime;
      // soft "thud" with low sine + short noise
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = 140;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      const nBuf = ac.createBuffer(1, ac.sampleRate * 0.06, ac.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.06));
      const ns = ac.createBufferSource();
      ns.buffer = nBuf;
      const ng = ac.createGain();
      ng.gain.value = 0.07;
      const nf = ac.createBiquadFilter();
      nf.type = 'lowpass';
      nf.frequency.value = 1800;
      o.connect(g);
      ns.connect(nf);
      nf.connect(ng);
      g.connect(masterGain);
      ng.connect(masterGain);
      o.start(now);
      ns.start(now);
      o.stop(now + 0.28);
      ns.stop(now + 0.06);
    } catch (e) {
      console.error('playIncorrectSound error', e);
    }
  }

  // ------- Utility -------
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function announce(text) {
    liveRegion.textContent = text;
    console.log('ANNOUNCE:', text);
  }

  // ------- Game State -------
  let level = 1;
  let machines = [];
  let tiles = [];
  let selectedTiles = []; // indices of selected tiles
  let solvedCount = 0;
  let focusIndex = 0; // keyboard focus among interactive elements (tiles then machines then controls)
  let focusList = []; // computed each frame
  let confettiParticles = [];
  let lastTick = performance.now();
  let animations = []; // generic animations
  let bgWaves = []; // for background moving shapes

  // ------- Layout -------
  const machineArea = { x: 40, y: 60, w: WIDTH - 80, h: 220 };
  const conveyorArea = { x: 20, y: 320, w: WIDTH - 40, h: 140 };

  // Prepare subtle background wave shapes
  function initBackgroundWaves() {
    bgWaves = [];
    for (let i = 0; i < 4; i++) {
      bgWaves.push({
        amplitude: 8 + i * 6,
        speed: 0.0008 + i * 0.0006,
        phase: Math.random() * Math.PI * 2,
        y: 40 + i * 28,
        color: i % 2 === 0 ? 'rgba(113,161,131,0.07)' : 'rgba(83,129,100,0.06)'
      });
    }
  }

  // ------- Create Level Data -------
  function buildLevel(lvl) {
    // ensure audio context exists lazily
    machines = [];
    tiles = [];
    solvedCount = 0;
    selectedTiles = [];
    confettiParticles = [];
    animations = [];

    // pick operations: early levels only addition, later include subtraction
    const ops = [];
    for (let i = 0; i < MACHINE_COUNT; i++) {
      if (lvl <= 2) ops.push('+');
      else if (lvl === 3) ops.push(Math.random() < 0.5 ? '+' : '-');
      else ops.push(Math.random() < 0.6 ? '+' : '-');
    }

    // For each machine, pick a valid pair (a,b) consistent with op and reasonable ranges
    const pairs = [];
    for (let i = 0; i < MACHINE_COUNT; i++) {
      let a, b;
      const op = ops[i];
      if (op === '+') {
        const maxSum = lvl < 3 ? 10 : 20;
        const target = randInt(Math.max(2, lvl * 3 - 1), Math.min(maxSum, lvl * 5 + 5));
        const minVal = 1;
        const maxVal = lvl < 4 ? 9 : 12;
        let attempts = 0;
        while (attempts < 200) {
          a = randInt(minVal, Math.min(maxVal, target - 1));
          b = target - a;
          if (b >= minVal && b <= maxVal) break;
          attempts++;
        }
        pairs.push({ op, a, b, target });
      } else {
        const maxA = lvl < 4 ? 15 : 19;
        const bMax = Math.min(9, maxA - 1);
        let attempts = 0;
        while (attempts < 200) {
          b = randInt(1, bMax);
          const aMin = b + 1;
          a = randInt(aMin, Math.min(maxA, b + (lvl * 4)));
          const target = a - b;
          if (target >= 1 && target <= (lvl < 3 ? 10 : 15)) {
            pairs.push({ op, a, b, target });
            break;
          }
          attempts++;
        }
      }
    }

    // Build the machines positions
    const gap = machineArea.w / MACHINE_COUNT;
    for (let i = 0; i < MACHINE_COUNT; i++) {
      const mX = machineArea.x + i * gap + gap / 8;
      const mY = machineArea.y;
      const mW = gap - gap / 4;
      const mH = machineArea.h;
      const pair = pairs[i];
      machines.push({
        x: mX,
        y: mY,
        w: mW,
        h: mH,
        op: pair.op,
        target: pair.target,
        required: [pair.a, pair.b],
        placed: [], // tile indices
        solved: false,
        rotate: 0 // for gear animation
      });
    }

    // Build tiles: ensure tiles include required numbers for each machine, plus random numbers
    const needed = [];
    for (const p of pairs) {
      needed.push(p.a);
      needed.push(p.b);
    }
    const pool = needed.slice();
    while (pool.length < TILE_COUNT) {
      const maxVal = level < 4 ? 12 : 15;
      pool.push(randInt(1, Math.min(12, maxVal)));
    }
    shuffle(pool);

    // create tile objects positioned on conveyor
    const tileWidth = 80;
    const tileHeight = 64;
    const spacing = (conveyorArea.w - TILE_COUNT * tileWidth) / (TILE_COUNT + 1);
    for (let i = 0; i < TILE_COUNT; i++) {
      const x = conveyorArea.x + spacing + i * (tileWidth + spacing);
      const y = conveyorArea.y + (conveyorArea.h - tileHeight) / 2;
      tiles.push({
        id: i,
        value: pool[i],
        x,
        y,
        w: tileWidth,
        h: tileHeight,
        taken: false,
        grabbed: false,
        original: { x, y },
        bobPhase: Math.random() * Math.PI * 2
      });
    }

    announce(
      `Level ${lvl}. Fix all machines. Use math to make each machine's result equal to the number shown.`
    );
    focusIndex = 0;
  }

  // ------- Input Handling -------
  let mouse = { x: 0, y: 0, down: false };
  canvas.tabIndex = 0; // make focusable
  canvas.style.outline = 'none';

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  canvas.addEventListener('mousedown', (e) => {
    ensureAudioContext(); // permit audio after user interaction
    mouse.down = true;
    // pick tile if clicked
    const t = hitTestTile(mouse.x, mouse.y);
    if (t && !t.taken) {
      t.grabbed = true;
      t.offsetX = mouse.x - t.x;
      t.offsetY = mouse.y - t.y;
      // select by pointer: add to selectedTiles but enforce up to 2 selections
      if (!selectedTiles.includes(t.id)) {
        if (selectedTiles.length < 2) selectedTiles.push(t.id);
        else {
          selectedTiles.shift();
          selectedTiles.push(t.id);
        }
        playPickSound();
      }
    } else {
      // if click on a machine and have selected tiles, attempt place
      const mIndex = hitTestMachine(mouse.x, mouse.y);
      if (mIndex !== -1) {
        playPlaceSound();
        attemptPlaceOnMachine(mIndex);
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    mouse.down = false;
    // drop grabbed tiles
    for (const t of tiles) {
      if (t.grabbed) {
        t.grabbed = false;
        const mIndex = hitTestMachine(mouse.x, mouse.y);
        if (mIndex !== -1) {
          // ensure t.id in selectedTiles
          if (!selectedTiles.includes(t.id)) {
            if (selectedTiles.length < 2) selectedTiles.push(t.id);
            else {
              selectedTiles.shift();
              selectedTiles.push(t.id);
            }
          }
          playPlaceSound();
          attemptPlaceOnMachine(mIndex);
        } else {
          // return to original if not placed
          t.x = t.original.x;
          t.y = t.original.y;
          t.taken = false;
        }
      }
    }
  });

  // Keyboard Controls
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleAudio();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      buildLevel(level);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      computeFocusList();
      focusIndex = (focusIndex + (e.shiftKey ? -1 : 1) + focusList.length) % focusList.length;
      announceFocus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateFocused();
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      computeFocusList();
      const dir = e.key;
      if (focusList.length === 0) return;
      const current = focusList[focusIndex];
      let bestIndex = focusIndex;
      let bestScore = Infinity;
      for (let i = 0; i < focusList.length; i++) {
        if (i === focusIndex) continue;
        const a = current.rect;
        const b = focusList[i].rect;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        let score = Math.hypot(dx, dy);
        if (dir === 'ArrowLeft' && dx >= 0) score += 1000;
        if (dir === 'ArrowRight' && dx <= 0) score += 1000;
        if (dir === 'ArrowUp' && dy >= 0) score += 1000;
        if (dir === 'ArrowDown' && dy <= 0) score += 1000;
        if (score < bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      focusIndex = bestIndex;
      announceFocus();
    }
  });

  function computeFocusList() {
    focusList = [];
    for (const t of tiles) {
      focusList.push({
        kind: 'tile',
        id: t.id,
        rect: { cx: t.x + t.w / 2, cy: t.y + t.h / 2 }
      });
    }
    machines.forEach((m, idx) => {
      focusList.push({
        kind: 'machine',
        id: idx,
        rect: { cx: m.x + m.w / 2, cy: m.y + m.h / 2 }
      });
    });
    focusList.push({
      kind: 'audio',
      id: 0,
      rect: { cx: WIDTH - 60, cy: 28 }
    });
  }

  function announceFocus() {
    if (!focusList.length) return;
    const f = focusList[focusIndex];
    if (f.kind === 'tile') {
      const t = tiles.find((x) => x.id === f.id);
      announce(`Tile ${t.value}. Press Enter to select.`);
    } else if (f.kind === 'machine') {
      const m = machines[f.id];
      announce(`Machine ${f.id + 1}. Operation ${m.op} target ${m.target}. Press Enter to place selected tiles.`);
    } else if (f.kind === 'audio') {
      announce(`Audio control. Press Enter to toggle audio.`);
    }
  }

  function activateFocused() {
    if (!focusList.length) computeFocusList();
    const f = focusList[focusIndex];
    if (!f) return;
    if (f.kind === 'tile') {
      const tileId = f.id;
      const idx = selectedTiles.indexOf(tileId);
      if (idx === -1) {
        if (selectedTiles.length < 2) selectedTiles.push(tileId);
        else {
          selectedTiles.shift();
          selectedTiles.push(tileId);
        }
        playPickSound();
      } else {
        selectedTiles.splice(idx, 1);
      }
      const t = tiles.find((x) => x.id === tileId);
      announce(`Tile ${t.value} ${selectedTiles.includes(tileId) ? 'selected' : 'deselected'}.`);
    } else if (f.kind === 'machine') {
      playPlaceSound();
      attemptPlaceOnMachine(f.id);
    } else if (f.kind === 'audio') {
      toggleAudio();
    }
  }

  // ------- Hit Testing -------
  function hitTestTile(x, y) {
    for (let i = tiles.length - 1; i >= 0; i--) {
      const t = tiles[i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        return t;
      }
    }
    return null;
  }

  function hitTestMachine(x, y) {
    for (let i = 0; i < machines.length; i++) {
      const m = machines[i];
      if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return i;
    }
    return -1;
  }

  // ------- Game Logic -------
  // DO NOT CHANGE MATH OR MECHANICS HERE
  function attemptPlaceOnMachine(mIndex) {
    const m = machines[mIndex];
    if (m.solved) {
      announce('This machine is already fixed.');
      return;
    }
    if (selectedTiles.length < 2) {
      announce('Select two tiles to place in the machine.');
      playIncorrectSound();
      return;
    }
    const t1 = tiles.find((t) => t.id === selectedTiles[0]);
    const t2 = tiles.find((t) => t.id === selectedTiles[1]);
    if (!t1 || !t2) {
      announce('Selected tiles not available.');
      selectedTiles = [];
      playIncorrectSound();
      return;
    }
    const a = t1.value;
    const b = t2.value;
    let result = 0;
    if (m.op === '+') result = a + b;
    else result = a - b;
    if (result === m.target) {
      // success
      m.solved = true;
      m.placed = [t1.id, t2.id];
      t1.taken = true;
      t2.taken = true;
      selectedTiles = [];
      solvedCount++;
      announce('Great! Machine fixed.');
      playCorrectSound();
      spawnConfetti(m.x + m.w / 2, m.y + m.h / 2);
      animations.push({ type: 'gear-spin', machineIndex: mIndex, time: performance.now(), duration: 1200 });
      if (solvedCount >= machines.length) {
        announce(`All machines fixed! Level ${level} complete.`);
        setTimeout(() => {
          level++;
          if (level > LEVELS) {
            announce('You completed all levels. Well done!');
            setTimeout(() => {
              level = 1;
              buildLevel(level);
            }, 3000);
          } else {
            buildLevel(level);
          }
        }, 1000);
      }
    } else {
      announce('That did not fix the machine. Try different tiles.');
      playIncorrectSound();
      animations.push({ type: 'shake', machineIndex: mIndex, time: performance.now(), duration: 600 });
      t1.x = t1.original.x;
      t1.y = t1.original.y;
      t2.x = t2.original.x;
      t2.y = t2.original.y;
      selectedTiles = [];
    }
  }

  // ------- Visual Effects -------
  function spawnConfetti(cx, cy) {
    for (let i = 0; i < 16; i++) {
      confettiParticles.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 3 - 1,
        r: randInt(3, 7),
        color: ['#FFB6B9', '#FAE3D9', '#BBDED6', '#8AC6D1', '#FDE2E4'][Math.floor(Math.random() * 5)],
        ang: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
        life: 0,
        ttl: randInt(900, 1600)
      });
    }
  }

  // ------- Drawing helpers -------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawGear(ctx, radius, fill, stroke) {
    ctx.save();
    ctx.beginPath();
    const teeth = 12;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const r = i % 2 === 0 ? radius : radius * 0.78;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#C9D9CF';
    ctx.stroke();
    ctx.restore();
  }

  function drawRobotArm(ctx, x, y, tilt = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt * 0.02);
    // base
    ctx.fillStyle = PALETTE.robot;
    roundRect(ctx, -6, 18, 68, 40, 8);
    ctx.fill();
    ctx.strokeStyle = '#BFD6CF';
    ctx.stroke();
    // arm
    ctx.fillStyle = '#CDEDE0';
    roundRect(ctx, 10, -8, 18, 54, 6);
    ctx.fill();
    // claw
    ctx.beginPath();
    ctx.moveTo(58, 10);
    ctx.lineTo(76, -8);
    ctx.lineTo(86, 4);
    ctx.lineTo(68, 22);
    ctx.closePath();
    ctx.fillStyle = PALETTE.accent;
    ctx.fill();
    ctx.restore();
  }

  function drawTile(t, floating = false) {
    ctx.save();
    // subtle bobbing for tiles on conveyor
    const bob = Math.sin((performance.now() + t.bobPhase * 700) / 800) * 3;
    const tx = t.x;
    const ty = floating ? t.y : t.y + bob;
    // shadow
    ctx.fillStyle = PALETTE.shadow;
    roundRect(ctx, tx + 6, ty + 8, t.w, t.h, 10);
    ctx.fill();
    // tile face
    ctx.fillStyle = t.taken ? '#F3F6F4' : PALETTE.tileFace;
    roundRect(ctx, tx, ty, t.w, t.h, 10);
    ctx.fill();
    // edge stroke
    ctx.strokeStyle = PALETTE.tileEdge;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // number
    ctx.fillStyle = PALETTE.text;
    ctx.font = '22px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(t.value), tx + t.w / 2, ty + t.h / 2 + 8);
    ctx.restore();
  }

  // ------- Drawing -------
  function draw() {
    const now = performance.now();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    grad.addColorStop(0, PALETTE.bgTop);
    grad.addColorStop(1, PALETTE.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Moving gentle waves/shapes for depth
    for (const w of bgWaves) {
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      const t = now * w.speed + w.phase;
      ctx.moveTo(-50, w.y);
      for (let x = -50; x <= WIDTH + 50; x += 20) {
        const y = w.y + Math.sin((x * 0.01) + t) * w.amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(WIDTH + 50, HEIGHT);
      ctx.lineTo(-50, HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Top header
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, 12, 8, WIDTH - 24, 52, 10);
    ctx.fill();
    ctx.strokeStyle = '#E6F1EE';
    ctx.stroke();

    // Title and header text
    ctx.fillStyle = PALETTE.text;
    ctx.font = '22px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Machine Math', 28, 36);
    ctx.font = '12px "Segoe UI", Arial';
    ctx.fillStyle = '#3B5C50';
    ctx.fillText(`Level ${level} — Fix ${machines.length} machines`, 28, 52);

    // Audio control pill
    ctx.save();
    ctx.fillStyle = audioEnabled ? PALETTE.accent : '#B9CBBF';
    roundRect(ctx, WIDTH - 160, 14, 132, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText(audioEnabled ? 'Audio: On (M)' : 'Audio: Off (M)', WIDTH - 94, 34);
    ctx.restore();

    // Instruction area
    ctx.fillStyle = PALETTE.softPanel;
    roundRect(ctx, 18, 62, WIDTH - 36, 36, 8);
    ctx.fill();
    ctx.fillStyle = '#2F4F4F';
    ctx.font = '13px "Segoe UI", Arial';
    ctx.textAlign = 'left';
    ctx.fillText(
      'Select two tiles (click or keyboard) and place them into a machine. Match the machine\'s target number. R to restart.',
      26,
      86
    );

    // Draw machines
    machines.forEach((m, idx) => {
      let dx = 0;
      let dy = 0;
      let spin = 0;
      for (const a of animations) {
        if (a.machineIndex !== idx) continue;
        const t = performance.now() - a.time;
        if (t > a.duration) continue;
        if (a.type === 'shake') {
          const intensity = Math.sin((t / a.duration) * Math.PI * 6) * 6 * (1 - t / a.duration);
          dx += intensity;
        } else if (a.type === 'gear-spin') {
          spin += (t / a.duration) * Math.PI * 6;
        }
      }

      ctx.save();
      ctx.translate(m.x + dx, m.y + dy);

      // machine body
      roundRect(ctx, 0, 0, m.w, m.h, 16);
      ctx.fillStyle = PALETTE.machineShell;
      ctx.fill();
      ctx.strokeStyle = PALETTE.machineTrim;
      ctx.lineWidth = 2;
      ctx.stroke();

      // friendly face/character on machine
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(36, 36, 18, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2B3A30';
      const eyeOffsetX = Math.sin((now / 700) + idx) * 2;
      ctx.beginPath();
      ctx.arc(32 + eyeOffsetX, 36, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(44 + eyeOffsetX, 36, 4.2, 0, Math.PI * 2);
      ctx.fill();

      // display panel for operation + target
      roundRect(ctx, m.w - 144, 14, 108, 48, 10);
      ctx.fillStyle = '#F8FFFB';
      ctx.fill();
      ctx.strokeStyle = '#D6EAE0';
      ctx.stroke();
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 22px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${m.op} ${m.target}`, m.w - 144 + 54, 46);
      ctx.textAlign = 'left';

      // slots and gears
      const slotX = 48;
      const slotY = 90;
      for (let i = 0; i < 2; i++) {
        const gx = slotX + i * 120;
        const gy = slotY;
        ctx.save();
        ctx.translate(gx + 24, gy + 24);
        ctx.rotate((m.rotate + spin / 8) + (idx * 0.15) + i * 0.3);
        drawGear(
          ctx,
          24,
          i === 0 ? '#F7EAE1' : '#EEF6FF',
          i === 0 ? '#D6C5B6' : '#C7D7E8'
        );
        ctx.restore();

        // tile slot
        roundRect(ctx, gx + 10, gy + 50, 88, 46, 9);
        ctx.fillStyle = '#FFF';
        ctx.fill();
        ctx.strokeStyle = '#E1EEEA';
        ctx.stroke();

        const placedId = m.placed[i];
        if (placedId !== undefined) {
          const tile = tiles.find((t) => t.id === placedId);
          ctx.fillStyle = PALETTE.text;
          ctx.font = '20px "Segoe UI", Arial';
          ctx.textAlign = 'center';
          ctx.fillText(tile.value, gx + 54, gy + 82);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = '#9FB3A8';
          ctx.font = '14px "Segoe UI", Arial';
          ctx.fillText('place tile', gx + 28, gy + 82);
        }
      }

      // solved badge
      if (m.solved) {
        ctx.fillStyle = 'rgba(111,175,134,0.14)';
        roundRect(ctx, 8, 8, m.w - 16, m.h - 16, 12);
        ctx.fill();
        ctx.fillStyle = PALETTE.accentDark;
        ctx.font = 'bold 16px "Segoe UI", Arial';
        ctx.fillText('FIXED', m.w - 84, m.h - 18);
      }

      ctx.restore();
      m.rotate += 0.008 + (m.solved ? 0.18 : 0.01);
    });

    // Conveyor
    roundRect(ctx, conveyorArea.x, conveyorArea.y, conveyorArea.w, conveyorArea.h, 14);
    ctx.fillStyle = '#F6FFFC';
    ctx.fill();
    ctx.strokeStyle = '#DBEEE6';
    ctx.stroke();

    // Patterned belt (subtle)
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#0E2E22';
    const beltOffset = Math.floor((now / 50) % 24);
    for (let x = conveyorArea.x - 24 + beltOffset; x < conveyorArea.x + conveyorArea.w; x += 24) {
      ctx.fillRect(x, conveyorArea.y + conveyorArea.h - 16, 12, 8);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // playful robot arm on left
    ctx.save();
    const armTilt = Math.sin(now / 900) * 6;
    ctx.translate(conveyorArea.x + 12, conveyorArea.y - 28);
    drawRobotArm(ctx, 0, 0, armTilt);
    ctx.restore();

    // Draw tiles (non-grabbed first)
    for (const t of tiles) {
      if (t.grabbed) continue;
      drawTile(t, false);
    }
    // Draw grabbed tiles on top
    for (const t of tiles) {
      if (!t.grabbed) continue;
      // tile follows mouse smoothly
      t.x += (mouse.x - t.offsetX - t.x) * 0.28;
      t.y += (mouse.y - t.offsetY - t.y) * 0.28;
      drawTile(t, true);
    }

    // selection highlight
    for (const tid of selectedTiles) {
      const t = tiles.find((x) => x.id === tid);
      if (!t) continue;
      ctx.save();
      const glowAlpha = 0.18;
      ctx.strokeStyle = `rgba(111,175,134,${glowAlpha})`;
      ctx.lineWidth = 4;
      roundRect(ctx, t.x - 6, t.y - 6, t.w + 12, t.h + 12, 12);
      ctx.stroke();
      ctx.restore();
    }

    // confetti
    confettiParticles = confettiParticles.filter((p) => p.life < p.ttl);
    for (const p of confettiParticles) {
      const dt = now - lastTick;
      p.life += dt;
      p.vy += 0.04;
      p.x += p.vx;
      p.y += p.vy;
      p.ang += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
    }

    // Footer text
    ctx.fillStyle = '#2B4B3E';
    ctx.font = '12px "Segoe UI", Arial';
    ctx.fillText('Keyboard: Tab to move, Enter to select/place, M to toggle audio, R to restart.', 18, HEIGHT - 14);

    lastTick = now;
  }

  // ------- Animation Loop -------
  function gameLoop() {
    // clean up finished animations
    const now = performance.now();
    animations = animations.filter((a) => (now - a.time) < a.duration + 300);
    draw();
    requestAnimationFrame(gameLoop);
  }

  // ------- Initialization -------
  function init() {
    try {
      audioContext = null; // delay audio until gesture
      initBackgroundWaves();
      buildLevel(level);
      computeFocusList();
      gameLoop();
    } catch (e) {
      console.error('Initialization error', e);
      announce('An error occurred while starting the game.');
    }
  }

  // Start audio on first gesture (for autoplay policy)
  function resumeOnUserGesture() {
    if (!audioContext && audioAllowed) {
      try {
        ensureAudioContext();
        // if audio is disabled, reduce gain
        if (!audioEnabled && masterGain) masterGain.gain.value = 0.0;
      } catch (e) {
        console.warn('Audio resume failed', e);
        audioEnabled = false;
      }
    }
    window.removeEventListener('pointerdown', resumeOnUserGesture);
    window.removeEventListener('keydown', resumeOnUserGesture);
  }
  window.addEventListener('pointerdown', resumeOnUserGesture);
  window.addEventListener('keydown', resumeOnUserGesture);

  // Wire in a small safety: when selecting via keyboard, play pick sound
  const originalActivateFocused = activateFocused;
  // Not replacing function; instead wrap selection call points already call playPickSound where appropriate

  // Kick off
  init();
})();