(function () {
  // Math Machines — Canvas Game (Enhanced Visuals & Audio)
  // Renders into element with ID "game-of-the-day-stage"
  // All assets drawn with canvas; all sounds are generated with Web Audio API oscillators.
  // Accessible: keyboard controls, on-screen instructions, hidden aria-live text updates.

  // ---------------------------
  // Setup and Constants
  // ---------------------------
  const STAGE_ID = 'game-of-the-day-stage';
  const WIDTH = 720;
  const HEIGHT = 480;

  // Ensure target container exists
  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error(`Missing container element with id=${STAGE_ID}`);
    return;
  }
  // Clean stage
  stage.innerHTML = '';
  stage.style.position = 'relative';
  stage.setAttribute('tabindex', '0'); // allow focus

  // Create a canvas sized EXACTLY 720x480
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Math Machines game canvas');
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Accessibility: hidden aria-live region for announcements
  const aria = document.createElement('div');
  aria.setAttribute('aria-live', 'polite');
  aria.style.position = 'absolute';
  aria.style.left = '-9999px';
  aria.style.width = '1px';
  aria.style.height = '1px';
  aria.style.overflow = 'hidden';
  stage.appendChild(aria);

  // Create simple on-canvas button area for audio toggle (drawn in canvas, but clickable via overlay for keyboard)
  const overlayControls = document.createElement('div');
  overlayControls.style.position = 'absolute';
  overlayControls.style.left = '0';
  overlayControls.style.top = '0';
  overlayControls.style.width = WIDTH + 'px';
  overlayControls.style.height = HEIGHT + 'px';
  overlayControls.style.pointerEvents = 'none'; // we'll use canvas click handling; maintain keyboard focus via stage
  stage.appendChild(overlayControls);

  // Game variables
  let running = false;
  let paused = false;
  let lastTime = 0;
  let animationFrame = null;

  // Audio setup
  let audioCtx = null;
  let audioAllowed = false;
  let backgroundGain = null;
  let backgroundOsc = null;
  let masterGain = null;
  let ambientLfo = null;
  let ambientFilter = null;
  let pulseClockInterval = null;

  function tryCreateAudioContext() {
    if (audioCtx) return audioCtx;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();

      // master gain with safe default
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.7;
      masterGain.connect(audioCtx.destination);

      // ambient pad: two detuned oscillators through a lowpass and slow LFO controlling gain
      backgroundGain = audioCtx.createGain();
      backgroundGain.gain.value = 0.06;
      backgroundGain.connect(masterGain);

      ambientFilter = audioCtx.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 720;
      ambientFilter.Q.value = 0.7;
      ambientFilter.connect(backgroundGain);

      // two detuned oscillators for a gentle pad
      const o1 = audioCtx.createOscillator();
      const o2 = audioCtx.createOscillator();
      o1.type = 'sine';
      o2.type = 'sine';
      o1.frequency.value = 110; // low A
      o2.frequency.value = 138.59; // slightly detuned
      const padGain1 = audioCtx.createGain();
      const padGain2 = audioCtx.createGain();
      padGain1.gain.value = 0.025;
      padGain2.gain.value = 0.018;
      o1.connect(padGain1);
      o2.connect(padGain2);
      padGain1.connect(ambientFilter);
      padGain2.connect(ambientFilter);
      try {
        o1.start();
        o2.start();
      } catch (e) {
        // Some browsers require user gesture to start audio; we'll handle resume on user interaction
      }

      // a slow LFO to modulate filter frequency for gentle movement
      try {
        ambientLfo = audioCtx.createOscillator();
        ambientLfo.type = 'sine';
        ambientLfo.frequency.value = 0.08; // very slow
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 220; // mod depth
        ambientLfo.connect(lfoGain);
        lfoGain.connect(ambientFilter.frequency);
        ambientLfo.start();
      } catch (e) {
        // some environments might not allow LFO start
      }

      // gentle mechanical pulse synchronized with the spawn rate (visual cue)
      try {
        backgroundOsc = audioCtx.createOscillator();
        backgroundOsc.type = 'sine';
        backgroundOsc.frequency.value = 58;
        const bgGain = audioCtx.createGain();
        bgGain.gain.value = 0.002;
        backgroundOsc.connect(bgGain);
        bgGain.connect(masterGain);
        backgroundOsc.start();
      } catch (e) {
        // continue without this element
      }

      audioAllowed = true;
      return audioCtx;
    } catch (err) {
      console.warn('AudioContext creation failed:', err);
      audioCtx = null;
      audioAllowed = false;
      return null;
    }
  }

  // Call on first user gesture
  function ensureAudioResume() {
    if (!audioCtx) tryCreateAudioContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('AudioContext resume failed', e);
      });
    }
  }

  // Sound utilities: generate short oscillator-based sounds with envelope, optional filter
  function safeCreateOscillator(opts = {}) {
    try {
      const o = audioCtx.createOscillator();
      if (opts.type) o.type = opts.type;
      if (opts.freq) o.frequency.value = opts.freq;
      return o;
    } catch (e) {
      console.warn('Oscillator creation failed', e);
      return null;
    }
  }
  function playTone({ freq = 440, duration = 0.18, type = 'sine', attack = 0.01, decay = 0.12, volume = 0.12, filterFreq = null }) {
    if (!audioAllowed || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = safeCreateOscillator({ type, freq });
      if (!o) return;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(volume, now + Math.max(0.001, attack));
      g.gain.linearRampToValueAtTime(0.0001, now + duration + Math.max(0.001, decay));

      let nodeOut = g;
      if (filterFreq) {
        const f = audioCtx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filterFreq;
        o.connect(f);
        f.connect(g);
      } else {
        o.connect(g);
      }
      g.connect(masterGain);
      o.start(now);
      o.stop(now + duration + decay + 0.02);

      // Visual cue: flash small speaker meter
      lastAudioPulse = { at: performance.now(), strength: volume };
    } catch (e) {
      console.warn('Could not play tone', e);
    }
  }

  // Specific game sounds (improved timbres and gentle stacks)
  const soundCorrect = () => {
    playTone({ freq: 880, duration: 0.18, type: 'triangle', attack: 0.006, decay: 0.14, volume: 0.18, filterFreq: 1200 });
    setTimeout(() => playTone({ freq: 1180, duration: 0.14, type: 'sine', attack: 0.004, decay: 0.12, volume: 0.12 }), 70);
  };
  const soundIncorrect = () => {
    // soft negative thump with quick filter sweep
    playTone({ freq: 180, duration: 0.22, type: 'sawtooth', attack: 0.002, decay: 0.16, volume: 0.16, filterFreq: 600 });
  };
  const soundPickup = () => {
    playTone({ freq: 640, duration: 0.13, type: 'square', attack: 0.002, decay: 0.08, volume: 0.12, filterFreq: 1200 });
  };
  const soundPlace = () => {
    // small pleasant pluck
    playTone({ freq: 520, duration: 0.10, type: 'sine', attack: 0.002, decay: 0.07, volume: 0.12 });
    setTimeout(() => playTone({ freq: 780, duration: 0.08, type: 'triangle', attack: 0.002, decay: 0.06, volume: 0.08 }), 70);
  };
  const soundWin = () => {
    playTone({ freq: 740, duration: 0.09, type: 'sine', attack: 0.001, decay: 0.06, volume: 0.14, filterFreq: 2000 });
    setTimeout(() => playTone({ freq: 960, duration: 0.10, type: 'triangle', attack: 0.002, decay: 0.07, volume: 0.14 }), 90);
    setTimeout(() => playTone({ freq: 1180, duration: 0.12, type: 'sine', attack: 0.002, decay: 0.08, volume: 0.12 }), 210);
  };

  // visual audio pulse
  let lastAudioPulse = { at: 0, strength: 0 };

  // ---------------------------
  // Game Objects
  // ---------------------------

  // Utility random
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // Machines — top row
  class Machine {
    constructor(x, y, target) {
      this.x = x;
      this.y = y;
      this.target = target;
      this.current = 0;
      this.width = 180;
      this.height = 90;
      this.active = true;
      this.recent = 0; // for animation pulses
      this.shimmer = Math.random() * Math.PI * 2;
    }
    canAccept(value) {
      return this.current + value <= this.target;
    }
    accept(value) {
      if (!this.canAccept(value)) return false;
      this.current += value;
      this.recent = 1.0;
      return true;
    }
    resetForLevel(target) {
      this.target = target;
      this.current = 0;
      this.active = true;
    }
  }

  // Gear objects — values that flow from right to left on conveyor
  class Gear {
    constructor(value, x, y, speed) {
      this.value = value;
      this.x = x;
      this.y = y;
      this.radius = 22;
      this.speed = speed;
      this.picked = false;
      this.rotation = Math.random() * Math.PI * 2;
      this.spinSpeed = (Math.random() * 2 + 1) * (speed / 80) * 0.8;
      this.bobPhase = Math.random() * Math.PI * 2;
    }
    update(dt) {
      if (!this.picked) {
        this.x -= this.speed * dt;
        this.rotation += this.spinSpeed * dt;
        // slight bob for depth
        this.bobPhase += dt * 2;
        this.y += Math.sin(this.bobPhase) * 0.4;
      } else {
        // when picked, spin slightly faster
        this.rotation += this.spinSpeed * 2 * dt;
      }
    }
  }

  // Player robotic arm
  class PlayerArm {
    constructor() {
      this.x = WIDTH / 2;
      this.y = HEIGHT - 70;
      this.width = 84;
      this.height = 48;
      this.holding = null; // Gear object reference
      this.speed = 320; // px per second
      this.moveLeft = false;
      this.moveRight = false;
      this.wiggle = 0;
    }
    update(dt) {
      if (this.moveLeft) this.x -= this.speed * dt;
      if (this.moveRight) this.x += this.speed * dt;
      this.x = Math.max(40, Math.min(WIDTH - 40, this.x));
      if (this.holding) {
        // keep held gear relative to arm
        this.holding.x = this.x;
        this.holding.y = this.y - 30;
      }
      // small subtle idle motion
      this.wiggle += dt;
    }
    pickClosestGear(gears) {
      if (this.holding) return false;
      let closest = null;
      let minDist = 9999;
      for (const g of gears) {
        if (g.picked) continue;
        const dx = g.x - this.x;
        const dy = g.y - (this.y - 30);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist && d < 48) {
          minDist = d;
          closest = g;
        }
      }
      if (closest) {
        closest.picked = true;
        this.holding = closest;
        soundPickup();
        announce(`Picked gear ${closest.value}`);
        return true;
      } else {
        // small negative sound
        soundIncorrect();
        announce('No gear nearby to pick');
        return false;
      }
    }
    placeIntoMachine(machines) {
      if (!this.holding) {
        soundIncorrect();
        announce('Not holding a gear to place');
        return false;
      }
      for (const m of machines) {
        if (!m.active) continue;
        // check horizontal overlap
        if (Math.abs(this.x - m.x) < m.width / 2 + 20) {
          const val = this.holding.value;
          if (m.canAccept(val)) {
            m.accept(val);
            // remove held gear
            const placed = this.holding;
            this.holding = null;
            placed.picked = true;
            soundPlace();
            announce(`Placed ${val} into machine (now ${m.current} of ${m.target})`);
            if (m.current === m.target) {
              m.active = false;
              soundCorrect();
              announce(`Machine completed!`);
              // small particle burst
              spawnParticles(m.x, m.y + 6, '#8ff0d6');
            }
            return true;
          } else {
            // cannot accept — incorrect
            soundIncorrect();
            announce(`That would go over the target of ${m.target}`);
            return false;
          }
        }
      }
      // not over any machine
      // drop gear back onto conveyor (just release)
      this.holding.picked = false;
      this.holding = null;
      soundIncorrect();
      announce('Not close enough to a machine to place');
      return false;
    }
    dropHeldToConveyor() {
      if (this.holding) {
        this.holding.picked = false;
        // place slightly below arm
        this.holding.x = this.x;
        this.holding.y = this.y + 18;
        this.holding = null;
        soundPlace();
        announce('Dropped gear back on belt');
      }
    }
  }

  // ---------------------------
  // Level and Game Logic
  // ---------------------------
  const gameState = {
    level: 0,
    maxLevels: 6,
    machines: [],
    gears: [],
    player: new PlayerArm(),
    spawnTimer: 0,
    spawnInterval: 1.2, // seconds
    conveyorY: HEIGHT - 140,
    timeLeft: 45,
    levelTime: 45,
    score: 0,
    audioOn: true,
    message: 'Press Enter or Click to Start',
    lastAnnouncement: '',
    awaitingUserGesture: true,
    particles: [],
    confetti: [],
    backgroundOffset: 0,
  };

  // Setup initial machines (three machines across top)
  function initMachinesForLevel(level) {
    gameState.machines = [];
    const count = 3;
    const margin = 40;
    const spacing = (WIDTH - margin * 2) / count;
    for (let i = 0; i < count; i++) {
      const x = margin + spacing * i + spacing / 2;
      const y = 110;
      // target grows with level: base 6 to 10
      const base = 6 + level;
      const target = randInt(base, base + 4);
      const m = new Machine(x, y, target);
      gameState.machines.push(m);
    }
  }

  function startLevel(level) {
    gameState.level = level;
    gameState.gears = [];
    gameState.spawnTimer = 0;
    gameState.spawnInterval = Math.max(0.9, 1.4 - level * 0.12);
    gameState.levelTime = Math.max(25, 45 - level * 3);
    gameState.timeLeft = gameState.levelTime;
    gameState.player = new PlayerArm();
    initMachinesForLevel(level);
    gameState.score = 0;
    gameState.message = `Level ${level + 1} — Fill all machines to their targets! Use ← → to move, Space to pick/place, Up to place into a machine.`;
    announce(gameState.message);
    running = true;
    paused = false;
    ensureAudioResume();
  }

  function allMachinesComplete() {
    return gameState.machines.every((m) => m.current === m.target);
  }

  // Spawn gears flowing on conveyor
  function spawnGear() {
    // gear value 1-5
    const value = randInt(1, 5);
    const x = WIDTH + 30;
    const y = gameState.conveyorY + randInt(-6, 16);
    // speed depends on level
    const speed = randInt(40 + gameState.level * 6, 90 + gameState.level * 8);
    const g = new Gear(value, x, y, speed);
    gameState.gears.push(g);
    // tiny click on spawn (subtle)
    playTone({ freq: 420, duration: 0.06, type: 'sine', attack: 0.001, decay: 0.06, volume: 0.02, filterFreq: 1200 });
  }

  // ---------------------------
  // Input Handling
  // ---------------------------
  // Keyboard controls:
  // Left/Right arrows: move arm, Space: pick/place, Up: place into machine if holding, Down: drop gear to conveyor
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'Left') {
      keys.left = true;
      gameState.player.moveLeft = true;
    } else if (e.key === 'ArrowRight' || e.key === 'Right') {
      keys.right = true;
      gameState.player.moveRight = true;
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      // space: pick if not holding else try place into machine
      if (!running) {
        // start game on Enter/Space
        if (audioCtx === null) tryCreateAudioContext();
        startLevel(0);
        return;
      }
      if (!gameState.player.holding) {
        gameState.player.pickClosestGear(gameState.gears);
      } else {
        // try to place into nearby machine
        gameState.player.placeIntoMachine(gameState.machines);
      }
    } else if (e.key === 'ArrowUp' || e.key === 'Up') {
      // explicit place into machine
      if (running) {
        gameState.player.placeIntoMachine(gameState.machines);
      }
    } else if (e.key === 'ArrowDown' || e.key === 'Down') {
      // drop to conveyor
      if (running) {
        gameState.player.dropHeldToConveyor();
      }
    } else if (e.key === 'p' || e.key === 'P') {
      // toggle pause
      if (running) {
        paused = !paused;
        announce(paused ? 'Paused' : 'Resumed');
      }
    } else if (e.key === 'm' || e.key === 'M') {
      // toggle audio mute
      gameState.audioOn = !gameState.audioOn;
      if (masterGain) masterGain.gain.value = gameState.audioOn ? 0.7 : 0.0;
      announce(gameState.audioOn ? 'Audio on' : 'Audio off');
    } else if ((e.key === 'Enter' || e.key === 'Return') && !running) {
      if (audioCtx === null) tryCreateAudioContext();
      startLevel(0);
    } else if ((e.key === 'r' || e.key === 'R') && !running) {
      // restart
      startLevel(0);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'Left') {
      keys.left = false;
      gameState.player.moveLeft = false;
    } else if (e.key === 'ArrowRight' || e.key === 'Right') {
      keys.right = false;
      gameState.player.moveRight = false;
    }
  });

  // Mouse/touch: move arm horizontally by mouse; click on gear to pick/place etc.
  function getCanvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (evt.touches && evt.touches[0]) {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    } else {
      clientX = evt.clientX;
      clientY = evt.clientY;
    }
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  canvas.addEventListener('mousemove', (e) => {
    const pos = getCanvasPos(e);
    gameState.player.x = Math.max(40, Math.min(WIDTH - 40, pos.x));
    // resume audio on first mouse
    ensureAudioResume();
  });
  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      const pos = getCanvasPos(e);
      gameState.player.x = Math.max(40, Math.min(WIDTH - 40, pos.x));
      ensureAudioResume();
    },
    { passive: false }
  );

  canvas.addEventListener('click', (e) => {
    // On click: if not running, start. If running: pick/place depending on proximity.
    ensureAudioResume();
    if (!running) {
      startLevel(0);
      return;
    }
    const pos = getCanvasPos(e);
    // if click near a gear, pick that gear if possible
    const dxToPlayer = Math.abs(pos.x - gameState.player.x);
    const dyToPlayer = Math.abs(pos.y - (gameState.player.y - 30));
    // If click is near player -> pick/place
    if (dxToPlayer < 80 && dyToPlayer < 80) {
      if (!gameState.player.holding) {
        gameState.player.pickClosestGear(gameState.gears);
      } else {
        gameState.player.placeIntoMachine(gameState.machines);
      }
    } else {
      // click near machine to place from player
      for (const m of gameState.machines) {
        if (Math.abs(pos.x - m.x) < m.width / 2 && Math.abs(pos.y - m.y) < m.height / 2) {
          // move player beneath and place
          gameState.player.x = m.x;
          if (gameState.player.holding) {
            gameState.player.placeIntoMachine(gameState.machines);
          }
          return;
        }
      }
      // else click somewhere: maybe pick gear under click directly
      let picked = false;
      for (const g of gameState.gears) {
        const d = Math.hypot(g.x - pos.x, g.y - pos.y);
        if (d < 30 && !g.picked && !gameState.player.holding) {
          // move arm to gear and pick
          gameState.player.x = g.x;
          gameState.player.pickClosestGear(gameState.gears);
          picked = true;
          break;
        }
      }
      if (!picked && gameState.player.holding) {
        // click background -> drop to conveyor near click
        gameState.player.dropHeldToConveyor();
      }
    }
  });

  // ---------------------------
  // Announcements for Accessibility
  // ---------------------------
  function announce(text) {
    aria.textContent = text;
    gameState.lastAnnouncement = text;
  }

  // ---------------------------
  // Particles (visual feedback only)
  // ---------------------------
  function spawnParticles(x, y, color = '#fff') {
    for (let i = 0; i < 8; i++) {
      gameState.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.6) * 120,
        life: 0.7 + Math.random() * 0.6,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  function updateParticles(dt) {
    const arr = gameState.particles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) {
        arr.splice(i, 1);
        continue;
      }
      p.vy += 160 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ---------------------------
  // Update Loop
  // ---------------------------
  function update(dt) {
    if (!running || paused) return;
    // spawn gears
    gameState.spawnTimer -= dt;
    if (gameState.spawnTimer <= 0) {
      spawnGear();
      gameState.spawnTimer = gameState.spawnInterval + (Math.random() * 0.6 - 0.3);
    }

    // update gears
    for (const g of gameState.gears) {
      if (!g.picked) {
        g.update(dt);
      } else {
        // if picked and the player releases somewhere off-screen, just keep it with player handled elsewhere
        g.update(dt);
      }
    }
    // remove off-screen gears
    gameState.gears = gameState.gears.filter((g) => g.x > -60 && !(g.picked && g === null));

    // update player
    gameState.player.update(dt);

    // update particles
    updateParticles(dt);

    // time countdown
    gameState.timeLeft -= dt;
    if (gameState.timeLeft <= 0) {
      // time up -> level failed
      running = false;
      announce("Time's up! Press Enter to try again.");
      soundIncorrect();
      gameState.message = "Time's up! Press Enter to try again.";
      return;
    }

    // check machine completions
    if (allMachinesComplete()) {
      // win this level; proceed to next or finish
      soundWin();
      gameState.score += 100;
      const nextLevel = gameState.level + 1;
      if (nextLevel >= gameState.maxLevels) {
        // game beaten
        running = false;
        announce('You finished all machines — great job! Press Enter to play again.');
        gameState.message = `You beat the game! Score: ${gameState.score}. Press Enter to play again.`;
        // celebratory confetti
        for (let i = 0; i < 60; i++) {
          gameState.confetti.push({
            x: Math.random() * WIDTH,
            y: -10 - Math.random() * 80,
            vx: (Math.random() - 0.5) * 160,
            vy: 40 + Math.random() * 80,
            ang: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 12,
            color: ['#ffbf8a', '#8ff0d6', '#ffd08a', '#bce0ff'][Math.floor(Math.random() * 4)],
            life: 4 + Math.random() * 2,
          });
        }
      } else {
        // proceed to next level after small delay — clear gears and setup next
        running = false; // pause until player hits Enter
        gameState.message = `Level ${gameState.level + 1} complete! Press Enter to continue.`;
        announce(gameState.message);
      }
    }

    // animate machine pulses
    for (const m of gameState.machines) {
      if (m.recent > 0) m.recent = Math.max(0, m.recent - dt * 1.5);
      m.shimmer += dt * 1.2;
    }

    // update confetti
    for (let i = gameState.confetti.length - 1; i >= 0; i--) {
      const c = gameState.confetti[i];
      c.vy += 80 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.ang += c.spin * dt;
      c.life -= dt;
      if (c.life <= 0 || c.y > HEIGHT + 40) gameState.confetti.splice(i, 1);
    }
  }

  // ---------------------------
  // Drawing
  // ---------------------------
  function draw() {
    // animated background: vertical gradient with slow shift
    const t = performance.now() / 1000;
    const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    const topColor = lerpColor('#eaf7ff', '#f6f9ff', (Math.sin(t * 0.12) + 1) * 0.5 * 0.5 + 0.2);
    const midColor = lerpColor('#f0fff6', '#f8fbff', (Math.cos(t * 0.09) + 1) * 0.5 * 0.5 + 0.2);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.6, midColor);
    grad.addColorStop(1, '#fffefb');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // parallax soft shapes (large rounded blobs) for depth
    drawBlobs();

    // Draw machines
    for (const m of gameState.machines) {
      drawMachine(m);
    }

    // Conveyor belt
    drawConveyor();

    // Draw gears (ordered by y for slight depth)
    const gearsSorted = gameState.gears.slice().sort((a, b) => (a.y - b.y) || (b.x - a.x));
    for (const g of gearsSorted) {
      drawGear(g);
    }

    // Draw player arm
    drawPlayer(gameState.player);

    // Particles
    drawParticles();

    // Confetti celebration
    drawConfetti();

    // HUD: level, time, score
    drawHUD();

    // Draw message area with subtle card
    ctx.fillStyle = 'rgba(20,20,30,0.06)';
    roundRect(ctx, 18, HEIGHT - 40, WIDTH - 36, 30, 6);
    ctx.fill();
    ctx.fillStyle = '#18304e';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(gameState.message, 26, HEIGHT - 18);

    // audio visual meter pulse
    drawAudioMeter();
  }

  function drawBlobs() {
    ctx.save();
    ctx.globalAlpha = 0.9;
    const now = performance.now();
    ctx.fillStyle = '#f6feff';
    ctx.beginPath();
    const bx = 90 + Math.sin(now / 1800) * 12;
    ctx.ellipse(bx, 90, 110, 40, Math.sin(now / 4000), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    const bx2 = 600 + Math.cos(now / 2200) * 8;
    ctx.ellipse(bx2, 60, 84, 32, Math.cos(now / 5000), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMachine(m) {
    // machine body with soft drop shadow and glowing completion
    ctx.save();
    const pulse = 1 + m.recent * 0.06;
    ctx.translate(m.x, m.y + Math.sin(m.shimmer * 0.6) * 1.4);
    ctx.scale(pulse, pulse);

    // shadow
    ctx.fillStyle = 'rgba(18,36,56,0.06)';
    roundRect(ctx, -m.width / 2 + 4, -m.height / 2 + 10, m.width, m.height, 12);
    ctx.fill();

    // body with subtle gradient
    const bodyGrad = ctx.createLinearGradient(-m.width / 2, -m.height / 2, m.width / 2, m.height / 2);
    bodyGrad.addColorStop(0, '#f4fbff');
    bodyGrad.addColorStop(1, m.active ? '#e8f6ff' : '#e9fff4');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, -m.width / 2, -m.height / 2, m.width, m.height, 12);
    ctx.fill();

    // panel lines
    ctx.strokeStyle = 'rgba(20,40,64,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-m.width / 2 + 12, 0);
    ctx.lineTo(m.width / 2 - 12, 0);
    ctx.stroke();

    // display current / target inside a metallic gauge
    ctx.fillStyle = '#17364f';
    ctx.font = '14px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Machine', 0, -10);
    ctx.font = '20px monospace';
    ctx.fillText(`${m.current} / ${m.target}`, 0, 22);

    // status window with soft glow that intensifies when active
    const winX = m.width / 2 - 44;
    const winY = -m.height / 2 + 12;
    const winW = 52;
    const winH = 30;
    // glow
    if (!m.active) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#bff9df';
      roundRect(ctx, winX - 8, winY - 8, winW + 16, winH + 16, 12);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.12 + Math.sin(performance.now() / 350 + m.shimmer) * 0.04;
      ctx.fillStyle = '#fff8e6';
      roundRect(ctx, winX - 4, winY - 4, winW + 8, winH + 8, 10);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = m.active ? '#fff7df' : '#eafff2';
    roundRect(ctx, winX, winY, winW, winH, 8);
    ctx.fill();

    // little face icon inside window
    ctx.fillStyle = '#233b4f';
    const eyeY = winY + winH / 2 - 2;
    ctx.beginPath();
    ctx.arc(winX + 14, eyeY, m.active ? 2.8 : 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(winX + 28, eyeY, m.active ? 2.8 : 3.4, 0, Math.PI * 2);
    ctx.fill();

    // tiny smile or neutral
    ctx.beginPath();
    ctx.strokeStyle = '#233b4f';
    ctx.lineWidth = 1.6;
    if (m.active) {
      ctx.arc(winX + 21, eyeY + 6, 6, Math.PI * 1.05, Math.PI * 1.95);
    } else {
      ctx.moveTo(winX + 15, eyeY + 6);
      ctx.lineTo(winX + 27, eyeY + 6);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawConveyor() {
    const y = gameState.conveyorY;
    // base belt with soft highlight
    ctx.save();
    ctx.fillStyle = '#dcefff';
    roundRect(ctx, 0, y - 18, WIDTH, 52, 6);
    ctx.fill();

    // moving seam stripes (animated)
    ctx.save();
    const offset = (performance.now() / 22) % 48;
    for (let i = -48 + offset; i < WIDTH + 48; i += 48) {
      ctx.fillStyle = 'rgba(24,56,92,0.06)';
      roundRect(ctx, i, y - 18, 28, 52, 4);
      ctx.fill();
    }
    ctx.restore();

    // glossy highlight
    const gloss = ctx.createLinearGradient(0, y - 18, 0, y + 34);
    gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
    gloss.addColorStop(0.6, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = gloss;
    roundRect(ctx, 0, y - 18, WIDTH, 24, 6);
    ctx.fill();

    // decorative end-pipes
    ctx.fillStyle = '#bbdfff';
    roundRect(ctx, 14, y + 26, 110, 22, 8);
    roundRect(ctx, WIDTH - 124, y + 26, 110, 22, 8);
    ctx.fill();

    ctx.restore();
  }

  function drawGear(g) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rotation);

    // gear shadow
    ctx.fillStyle = 'rgba(10,20,30,0.08)';
    ctx.beginPath();
    ctx.ellipse(6, 12, g.radius + 6, g.radius / 2 + 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // gear body with subtle metallic gradient
    const grad = ctx.createLinearGradient(-g.radius, -g.radius, g.radius, g.radius);
    grad.addColorStop(0, '#ffd9f7');
    grad.addColorStop(1, '#ffd8c8');
    ctx.fillStyle = g.picked ? '#fff8ee' : grad;
    ctx.beginPath();
    ctx.arc(0, 0, g.radius, 0, Math.PI * 2);
    ctx.fill();

    // teeth - draw rotated rectangles mapped around circle
    ctx.fillStyle = '#ffb4ff';
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const tx = Math.cos(ang) * (g.radius + 9);
      const ty = Math.sin(ang) * (g.radius + 9);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang);
      roundRect(ctx, -5, -3, 10, 6, 2);
      ctx.fill();
      ctx.restore();
    }

    // inner ring
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // central screw - small metallic circle
    ctx.fillStyle = '#e0e8ef';
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // number value with drop shadow
    ctx.fillStyle = 'rgba(24,48,78,0.14)';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(g.value.toString(), 1.6, 7.2);

    ctx.fillStyle = '#17364f';
    ctx.fillText(g.value.toString(), 0, 6);

    ctx.restore();
  }

  function drawPlayer(p) {
    ctx.save();
    // arms with soft shadow
    ctx.translate(p.x, p.y);
    const idle = Math.sin(performance.now() / 450 + p.wiggle) * 2;

    // mechanical base
    ctx.save();
    ctx.translate(0, idle * 0.6);
    // base platform
    ctx.fillStyle = '#e6f4ff';
    roundRect(ctx, -p.width / 2 - 6, -p.height / 2 + 6, p.width + 12, p.height + 14, 12);
    ctx.fill();

    // body with gradient
    const g = ctx.createLinearGradient(-p.width / 2, -p.height / 2, p.width / 2, p.height / 2);
    g.addColorStop(0, '#dfefff');
    g.addColorStop(1, '#cfe8ff');
    ctx.fillStyle = g;
    roundRect(ctx, -p.width / 2, -p.height / 2, p.width, p.height, 10);
    ctx.fill();

    // claw hold area
    ctx.fillStyle = '#a7d6ff';
    ctx.beginPath();
    ctx.moveTo(-12, -p.height / 2);
    ctx.lineTo(0, -p.height / 2 - 18);
    ctx.lineTo(12, -p.height / 2);
    ctx.closePath();
    ctx.fill();

    // label
    ctx.fillStyle = '#17364f';
    ctx.font = '14px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ROBO-ARM', 0, 8);
    ctx.restore();

    // if holding a gear, draw a subtle halo under it
    if (p.holding) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#fff0c8';
      ctx.beginPath();
      ctx.ellipse(0, -6, 28, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawHUD() {
    // top-left: level and time
    ctx.fillStyle = '#24445e';
    ctx.font = '16px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level: ${gameState.level + 1}/${gameState.maxLevels}`, 18, 22);

    // time bar
    const timeX = 160;
    const timeY = 12;
    const timeW = 200;
    const timeH = 18;
    ctx.fillStyle = '#cfe8ff';
    roundRect(ctx, timeX, timeY, timeW, timeH, 10);
    ctx.fill();
    const pct = Math.max(0, gameState.timeLeft / gameState.levelTime);
    // gradient from green to orange
    const tg = ctx.createLinearGradient(timeX, 0, timeX + timeW, 0);
    tg.addColorStop(0, '#8bf59f');
    tg.addColorStop(1, '#ffd08a');
    ctx.fillStyle = tg;
    roundRect(ctx, timeX + 2, timeY + 2, (timeW - 4) * pct, timeH - 4, 8);
    ctx.fill();
    ctx.fillStyle = '#083248';
    ctx.font = '12px monospace';
    ctx.fillText(`Time: ${Math.ceil(gameState.timeLeft)}s`, timeX + timeW + 8, timeY + 13);

    // Score top-right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#18304e';
    ctx.fillText(`Score: ${gameState.score}`, WIDTH - 18, 22);
  }

  function drawAudioMeter() {
    const meterX = WIDTH - 54;
    const meterY = HEIGHT - 46;
    // background speaker box
    ctx.fillStyle = '#e9f7ff';
    roundRect(ctx, meterX - 8, meterY - 8, 44, 36, 8);
    ctx.fill();
    // simple speaker shape
    ctx.fillStyle = '#18304e';
    roundRect(ctx, meterX - 12, meterY + 0, 10, 20, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(meterX - 2, meterY + 6);
    ctx.lineTo(meterX + 10, meterY - 6);
    ctx.lineTo(meterX + 10, meterY + 26);
    ctx.closePath();
    ctx.fill();

    // arc waves based on lastAudioPulse
    const since = performance.now() - lastAudioPulse.at;
    const strength = lastAudioPulse.strength ? Math.min(1, lastAudioPulse.strength / 0.18) : 0;
    ctx.strokeStyle = `rgba(24,48,78,${0.5 * strength})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(meterX + 12, meterY + 8, 10 + since * 0.02, 0.6, 2.2);
    ctx.stroke();
  }

  // small utility: rounded rectangle
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------------------
  // Particles & Confetti Drawing
  // ---------------------------
  function drawParticles() {
    ctx.save();
    for (const p of gameState.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 1.2));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawConfetti() {
    for (const c of gameState.confetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.ang);
      ctx.globalAlpha = Math.max(0, Math.min(1, c.life / 3));
      ctx.fillStyle = c.color;
      ctx.fillRect(-4, -6, 8, 12);
      ctx.restore();
    }
  }

  // ---------------------------
  // Start Screen (improved visuals)
  // ---------------------------
  function drawStartScreen() {
    // initial welcome
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    // background with subtle pattern
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, '#eef9ff');
    g.addColorStop(1, '#f8fff6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // title
    ctx.fillStyle = '#17364f';
    ctx.font = '40px "Comic Sans MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Math Machines!', WIDTH / 2, 96);

    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillStyle = '#133244';
    ctx.fillText('Help the friendly machines by placing the right-number gears into them.', WIDTH / 2, 132);
    ctx.fillText('Use ← → to move, Space to pick/place, Up to place into a machine.', WIDTH / 2, 152);
    ctx.fillText('Press Enter or click to start. Press M to toggle sound. Press P to pause.', WIDTH / 2, 172);

    // playful central machine
    const m = new Machine(WIDTH / 2, 260, 10);
    drawMachine(m);

    // sample gears underneath with gentle rotation
    const g1 = new Gear(3, WIDTH / 2 - 80, 360, 0);
    const g2 = new Gear(5, WIDTH / 2, 352, 0);
    const g3 = new Gear(2, WIDTH / 2 + 80, 360, 0);
    drawGear(g1);
    drawGear(g2);
    drawGear(g3);

    ctx.fillStyle = '#18304e';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillText('Finish all levels to win. Each machine must be filled exactly to its target!', WIDTH / 2, 420);

    // audio instructions
    ctx.fillStyle = '#0e2b45';
    ctx.font = '13px monospace';
    ctx.fillText('Audio: press M to mute/unmute. Click to resume audio if disabled.', WIDTH / 2, 450);
  }

  // ---------------------------
  // Utilities
  // ---------------------------
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  // simple hex color blend (supports '#rrggbb' only)
  function lerpColor(a, b, t) {
    try {
      const pa = hexToRgb(a);
      const pb = hexToRgb(b);
      const r = Math.round(lerp(pa.r, pb.r, t));
      const g = Math.round(lerp(pa.g, pb.g, t));
      const bl = Math.round(lerp(pa.b, pb.b, t));
      return `rgb(${r},${g},${bl})`;
    } catch (e) {
      return a;
    }
  }
  function hexToRgb(hex) {
    if (hex.charAt(0) === '#') hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  // ---------------------------
  // Game Loop
  // ---------------------------
  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(0.040, (timestamp - lastTime) / 1000); // clamp dt ~40ms
    lastTime = timestamp;

    if (running && !paused) update(dt);

    draw();

    animationFrame = requestAnimationFrame(loop);
  }

  // Start drawing static start screen first
  drawStartScreen();
  animationFrame = requestAnimationFrame(loop);

  // Resume audio on any user interaction in stage
  stage.addEventListener('pointerdown', () => {
    ensureAudioResume();
  });

  // Start on click within canvas area (already handled), but also support on-screen keyboard focus to start game
  stage.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !running) {
      ensureAudioResume();
      startLevel(0);
    }
  });

  // Hook into Enter to progress to next level after completion
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !running) {
      // if game ended because of level completion we can move to next
      if (gameState.level + 1 < gameState.maxLevels && gameState.message && gameState.message.startsWith('Level')) {
        // proceed to next
        startLevel(gameState.level + 1);
      } else if (gameState.message && gameState.message.startsWith('You beat')) {
        // restart new playthrough
        startLevel(0);
      } else if (gameState.message && gameState.message.startsWith("Time's up")) {
        // restart
        startLevel(0);
      }
    }
  });

  // Error handling for audio resume attempts
  window.addEventListener('unhandledrejection', (ev) => {
    console.warn('Unhandled promise rejection', ev.reason);
  });

  // Make sure canvas is keyboard focusable for accessibility
  canvas.setAttribute('tabindex', '0');
  canvas.addEventListener('focus', () => {
    announce('Canvas focused. Use arrow keys and space to play.');
  });

  // Small periodic autosave of last game state to aria for screen reader
  setInterval(() => {
    if (!running) return;
    const nextMachine = gameState.machines.find((m) => m.current < m.target);
    if (nextMachine) {
      aria.textContent = `Time ${Math.ceil(gameState.timeLeft)}s. Next machine needs ${nextMachine.target - nextMachine.current}.`;
    } else {
      aria.textContent = `All machines complete.`;
    }
  }, 4500);

  // Clean up on window unload
  window.addEventListener('beforeunload', () => {
    if (audioCtx && audioCtx.close) {
      try {
        audioCtx.close();
      } catch (_) {}
    }
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });
})();