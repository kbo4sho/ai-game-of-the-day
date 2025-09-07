"use strict";

/*
  Enhanced Machine Math - Visuals & Audio improvements only.
  Renders into the element with id "game-of-the-day-stage".
  Canvas is exactly 720x480. All graphics drawn with canvas methods.
  Sounds synthesized via Web Audio API. No external resources.
*/

/* =========================
   Setup DOM and Canvas
   ========================= */
const container = document.getElementById('game-of-the-day-stage');
if (!container) {
  throw new Error('Container element #game-of-the-day-stage not found.');
}
container.innerHTML = '';

const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
canvas.setAttribute('role', 'application');
canvas.setAttribute(
  'aria-label',
  'Machine Math game. Use left and right arrows to pick a dial, up and down to change numbers, Enter to submit. Press H for hint, R to reset. Press M to toggle sound.'
);
canvas.tabIndex = 0;
canvas.style.outline = 'none';
container.appendChild(canvas);

const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) {
  throw new Error('Unable to get 2D drawing context.');
}

/* =========================
   Constants and Utilities
   ========================= */
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const COLORS = {
  backgroundA: '#eaf6fb',
  backgroundB: '#f6fbff',
  machine: '#dff3f6',
  panel: '#ffffff',
  accent: '#66a7b8',
  warm: '#ffd27f',
  mainText: '#102028',
  gear: '#cfe7ea',
  knob: '#6b5be7',
  hintBg: 'rgba(255,245,215,0.7)',
  success: '#3fb86f',
  danger: '#d65a5a',
  softShade: 'rgba(16,32,40,0.06)',
};

const NUM_DIALS = 4;
const DIAL_MIN = 0;
const DIAL_MAX = 9;
const TOTAL_LEVELS = 5;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const nowMs = () => performance.now();

/* =========================
   Audio Setup with Error Handling
   ========================= */

let audioCtx = null;
let masterGain = null;
let ambientNodes = [];
let noiseBuffer = null;
let audioEnabled = true;
let audioUnavailableReason = null;

function createAudioContextSafe() {
  if (audioCtx) return audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio API not supported.');
    audioCtx = new AC();
    return audioCtx;
  } catch (err) {
    console.warn('Audio context creation failed:', err);
    audioEnabled = false;
    audioUnavailableReason = err && err.message ? err.message : String(err);
    audioCtx = null;
    return null;
  }
}

// initialize ambient pad, LFOs, and noise buffer
function initAudio() {
  if (audioCtx) return;
  const ac = createAudioContextSafe();
  if (!ac) return;

  try {
    masterGain = ac.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(ac.destination);

    // Ambient pad: two detuned oscillators through gentle lowpass
    const ambientGain = ac.createGain();
    ambientGain.gain.value = 0.06;
    ambientGain.connect(masterGain);

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    filter.Q.value = 0.8;
    filter.connect(ambientGain);

    const osc1 = ac.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 110;
    const osc2 = ac.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 112.5;

    // gentle stereo detune using splitters (single channel but different phases)
    const oscGain = ac.createGain();
    oscGain.gain.value = 0.5;
    osc1.connect(oscGain);
    osc2.connect(oscGain);
    oscGain.connect(filter);

    // slow amplitude LFO
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(ambientGain.gain);

    osc1.start();
    osc2.start();
    lfo.start();

    ambientNodes.push({ osc1, osc2, lfo, ambientGain, filter });

    // noise buffer for clicks/snaps
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 1.0, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.5)); // decaying noise
    }

    audioEnabled = true;
  } catch (err) {
    console.warn('initAudio error:', err);
    audioEnabled = false;
    audioUnavailableReason = err && err.message ? err.message : String(err);
  }
}

async function ensureAudioRunning() {
  if (!audioEnabled) return false;
  if (!audioCtx) initAudio();
  if (!audioCtx) return false;
  try {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return true;
  } catch (err) {
    console.warn('Audio resume failed:', err);
    audioEnabled = false;
    audioUnavailableReason = err && err.message ? err.message : String(err);
    return false;
  }
}

// utility to create tone with filter and envelope
function playTone(freq = 440, durationMs = 240, options = {}) {
  return new Promise((resolve) => {
    if (!audioEnabled || !audioCtx) {
      resolve();
      return;
    }
    try {
      const ac = audioCtx;
      const now = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();

      osc.type = options.type || 'sine';
      osc.frequency.value = freq * (options.detuneFactor || 1);

      filter.type = options.filter || 'lowpass';
      filter.frequency.value = options.filterFreq || 1800;
      filter.Q.value = options.filterQ || 0.7;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(options.peak || 0.12, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000 + 0.02);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.03);
      osc.onended = () => {
        resolve();
      };
    } catch (err) {
      console.warn('playTone error', err);
      resolve();
    }
  });
}

// short percussive click using noise burst and highpass
function playClick(vol = 0.09) {
  if (!audioEnabled || !audioCtx) return;
  try {
    const ac = audioCtx;
    const now = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    const gain = ac.createGain();
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(masterGain);
    src.start(now);
    src.stop(now + 0.12);
  } catch (err) {
    console.warn('playClick error', err);
  }
}

// success arpeggio with shimmering bells
async function successTune() {
  if (!audioEnabled || !audioCtx) return;
  try {
    // triad ascending with two voices
    const freqs = [440, 550, 660, 880];
    for (let i = 0; i < freqs.length; i++) {
      playTone(freqs[i], 220, { type: 'sine', peak: 0.12, filterFreq: 2400 });
      playTone(freqs[i] * 2, 180, { type: 'triangle', peak: 0.06, filterFreq: 3000 });
      await new Promise((r) => setTimeout(r, 110));
    }
    // soft shimmer
    playTone(1320, 600, { type: 'sine', peak: 0.02, filterFreq: 1600 });
  } catch (err) {
    console.warn('successTune error', err);
  }
}

// failure descending wobble buzz
async function failureTune() {
  if (!audioEnabled || !audioCtx) return;
  try {
    const freqs = [240, 200, 160];
    for (let i = 0; i < freqs.length; i++) {
      playTone(freqs[i], 220, { type: 'square', peak: 0.12, filterFreq: 1200 });
      await new Promise((r) => setTimeout(r, 160));
    }
  } catch (err) {
    console.warn('failureTune error', err);
  }
}

// hint tone
function hintTone() {
  if (!audioEnabled || !audioCtx) return;
  playTone(660, 160, { type: 'sine', peak: 0.08, filterFreq: 2200 });
  setTimeout(() => playTone(720, 160, { type: 'sine', peak: 0.06, filterFreq: 2200 }), 120);
}

/* =========================
   Game State and Logic (unchanged mechanics)
   ========================= */

const game = {
  level: 1,
  totalLevels: TOTAL_LEVELS,
  dials: new Array(NUM_DIALS).fill(0),
  selectedDial: 0,
  target: 0,
  hintUsed: false,
  moves: 0,
  correctCount: 0,
  running: true,
  machineSpin: 0,
  lastFeedback: null,
  feedbackTimer: 0,
  soundOn: true,
  lastSuggestion: null,
  visualParticles: [],
  shakeTimer: 0,
  glowPulse: 0,
};

// target generation unchanged
function generateTargetForLevel(level) {
  const min = Math.max(3, Math.floor((level - 1) * 3) + 3);
  const max = Math.min(DIAL_MAX * NUM_DIALS, min + 6 + level * 2);
  return randInt(min, max);
}

function resetDials() {
  for (let i = 0; i < NUM_DIALS; i++) game.dials[i] = randInt(0, 4);
  game.selectedDial = 0;
  game.moves = 0;
  game.hintUsed = false;
  game.lastFeedback = null;
  game.lastSuggestion = null;
  game.visualParticles = [];
}

function startLevel(level = 1) {
  game.level = level;
  game.target = generateTargetForLevel(level);
  resetDials();
  game.running = true;
  // gentle machine idle pulse
  game.glowPulse = 1.0;
}

startLevel(1);

/* =========================
   Input Handling
   ========================= */

function handleKey(e) {
  const key = e.key;
  if (
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Spacebar'].includes(key) ||
    /^[0-9a-zA-Z]$/.test(key)
  ) {
    e.preventDefault();
  }

  if (key === 'ArrowLeft') {
    game.selectedDial = (game.selectedDial - 1 + NUM_DIALS) % NUM_DIALS;
    if (audioEnabled) playClick(0.07);
  } else if (key === 'ArrowRight') {
    game.selectedDial = (game.selectedDial + 1) % NUM_DIALS;
    if (audioEnabled) playClick(0.07);
  } else if (key === 'ArrowUp') {
    const before = game.dials[game.selectedDial];
    game.dials[game.selectedDial] = clamp(game.dials[game.selectedDial] + 1, DIAL_MIN, DIAL_MAX);
    if (game.dials[game.selectedDial] !== before) {
      game.moves++;
      if (audioEnabled) playClick(0.08);
    }
  } else if (key === 'ArrowDown') {
    const before = game.dials[game.selectedDial];
    game.dials[game.selectedDial] = clamp(game.dials[game.selectedDial] - 1, DIAL_MIN, DIAL_MAX);
    if (game.dials[game.selectedDial] !== before) {
      game.moves++;
      if (audioEnabled) playClick(0.08);
    }
  } else if (key === 'Enter') {
    submitAttempt();
  } else if (key.toLowerCase() === 'h') {
    provideHint();
  } else if (key.toLowerCase() === 'r') {
    resetDials();
    if (audioEnabled) playClick(0.06);
  } else if (key.toLowerCase() === 'm') {
    toggleSound();
  } else if (/^[0-9]$/.test(key)) {
    const num = parseInt(key, 10);
    if (!isNaN(num)) {
      game.dials[game.selectedDial] = clamp(num, DIAL_MIN, DIAL_MAX);
      game.moves++;
      if (audioEnabled) playClick(0.07);
    }
  }
}

canvas.addEventListener('keydown', (e) => {
  ensureAudioRunning().catch(() => {});
  handleKey(e);
});

canvas.addEventListener('click', (e) => {
  canvas.focus();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const soundBox = { x: WIDTH - 54, y: 8, w: 46, h: 46 };
  if (x >= soundBox.x && x <= soundBox.x + soundBox.w && y >= soundBox.y && y <= soundBox.y + soundBox.h) {
    toggleSound();
    return;
  }

  const dialsArea = { x: 80, y: 170, w: WIDTH - 160, h: 220 };
  if (x >= dialsArea.x && x <= dialsArea.x + dialsArea.w && y >= dialsArea.y && y <= dialsArea.y + dialsArea.h) {
    const cellW = dialsArea.w / NUM_DIALS;
    let idx = Math.floor((x - dialsArea.x) / cellW);
    idx = clamp(idx, 0, NUM_DIALS - 1);
    if (game.selectedDial === idx) {
      const before = game.dials[idx];
      game.dials[idx] = clamp(game.dials[idx] + 1, DIAL_MIN, DIAL_MAX);
      if (game.dials[idx] !== before) {
        game.moves++;
        if (audioEnabled) playClick(0.08);
      }
    } else {
      game.selectedDial = idx;
      if (audioEnabled) playClick(0.07);
    }
  }
});

function provideHint() {
  if (game.hintUsed) return;
  game.hintUsed = true;
  const avg = Math.round(game.target / NUM_DIALS);
  let suggestion = new Array(NUM_DIALS).fill(avg);
  let sum = suggestion.reduce((a, b) => a + b, 0);
  let i = 0;
  while (sum < game.target) {
    suggestion[i % NUM_DIALS] = clamp(suggestion[i % NUM_DIALS] + 1, DIAL_MIN, DIAL_MAX);
    sum = suggestion.reduce((a, b) => a + b, 0);
    i++;
  }
  while (sum > game.target) {
    suggestion[i % NUM_DIALS] = clamp(suggestion[i % NUM_DIALS] - 1, DIAL_MIN, DIAL_MAX);
    sum = suggestion.reduce((a, b) => a + b, 0);
    i++;
  }
  game.selectedDial = 0;
  game.lastSuggestion = suggestion;
  if (audioEnabled) hintTone();
}

/* =========================
   Submit and Progression (mechanics unchanged)
   ========================= */

function spawnConfetti() {
  const count = 26;
  for (let i = 0; i < count; i++) {
    game.visualParticles.push({
      x: WIDTH / 2 + (Math.random() * 200 - 100),
      y: HEIGHT / 2 - 30 + (Math.random() * 40 - 20),
      vx: (Math.random() * 2 - 1) * 2,
      vy: -Math.random() * 2 - 1.5,
      size: 6 + Math.random() * 8,
      color: ['#ffd27f', '#6b5be7', '#66a7b8', '#ff8fa3'][Math.floor(Math.random() * 4)],
      life: 1200 + Math.random() * 800,
      born: nowMs(),
      rot: Math.random() * Math.PI * 2,
      drot: (Math.random() * 2 - 1) * 0.06,
    });
  }
}

function submitAttempt() {
  const sum = game.dials.reduce((a, b) => a + b, 0);
  if (sum === game.target) {
    game.correctCount++;
    game.lastFeedback = 'correct';
    game.feedbackTimer = nowMs();
    game.machineSpin = 1.0;
    spawnConfetti();
    if (audioEnabled) successTune();
    setTimeout(() => {
      if (game.level < game.totalLevels) {
        startLevel(game.level + 1);
      } else {
        game.running = false;
      }
    }, 900);
  } else {
    game.lastFeedback = 'incorrect';
    game.feedbackTimer = nowMs();
    game.shakeTimer = 600;
    if (audioEnabled) failureTune();
    // encourage change visually: subtle shake
  }
}

/* =========================
   Toggle Sound
   ========================= */

function toggleSound() {
  if (!audioEnabled && !audioUnavailableReason) {
    try {
      initAudio();
      if (audioEnabled) ensureAudioRunning();
    } catch (err) {
      audioUnavailableReason = err && err.message ? err.message : String(err);
    }
  }
  if (!audioEnabled && audioUnavailableReason) {
    game.lastFeedback = 'audionot';
    game.feedbackTimer = nowMs();
    return;
  }
  if (!audioCtx) initAudio();
  if (!audioCtx) {
    audioUnavailableReason = 'Unable to create audio context.';
    game.lastFeedback = 'audionot';
    game.feedbackTimer = nowMs();
    return;
  }

  if (audioCtx.state === 'suspended') {
    ensureAudioRunning();
    game.soundOn = true;
  } else {
    if (masterGain) {
      try {
        if (game.soundOn) {
          masterGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.02);
          game.soundOn = false;
        } else {
          masterGain.gain.setTargetAtTime(0.85, audioCtx.currentTime, 0.02);
          game.soundOn = true;
        }
      } catch (err) {
        console.warn('Mute toggle failed', err);
      }
    }
  }
  if (game.soundOn && audioEnabled) playClick(0.08);
}

/* =========================
   Drawing Helpers & Visual Enhancements
   ========================= */

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

// subtle animated background with floating shapes
let bgShapes = Array.from({ length: 12 }, (_, i) => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  r: 18 + Math.random() * 40,
  alpha: 0.05 + Math.random() * 0.12,
  vx: (Math.random() * 2 - 1) * 0.03,
  vy: (Math.random() * 2 - 1) * 0.03,
  hue: 190 + Math.random() * 40,
}));

function updateBackgroundShapes(delta) {
  for (const s of bgShapes) {
    s.x += s.vx * delta * 0.06;
    s.y += s.vy * delta * 0.06;
    if (s.x < -s.r) s.x = WIDTH + s.r;
    if (s.x > WIDTH + s.r) s.x = -s.r;
    if (s.y < -s.r) s.y = HEIGHT + s.r;
    if (s.y > HEIGHT + s.r) s.y = -s.r;
  }
}

function drawBackground() {
  // gradient
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, COLORS.backgroundA);
  g.addColorStop(1, COLORS.backgroundB);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // floating soft shapes
  for (const s of bgShapes) {
    ctx.beginPath();
    ctx.fillStyle = `hsla(${s.hue},60%,70%,${s.alpha})`;
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // subtle grid
  ctx.strokeStyle = COLORS.softShade;
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const yy = 40 + i * 48;
    ctx.beginPath();
    ctx.moveTo(40, yy);
    ctx.lineTo(WIDTH - 40, yy);
    ctx.stroke();
  }
}

// friendly robot head on top of machine
function drawRobot(cx, cy, t) {
  // head base
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t / 700) * 0.02);
  ctx.fillStyle = '#fff';
  roundedRect(ctx, -60, -48, 120, 72, 12);

  // visor
  const visorGrad = ctx.createLinearGradient(-40, -10, 40, 10);
  visorGrad.addColorStop(0, '#e7f7fb');
  visorGrad.addColorStop(1, '#cfe9ef');
  ctx.fillStyle = visorGrad;
  roundedRect(ctx, -44, -28, 88, 36, 10);

  // eyes
  const eyeOffset = 18 + Math.sin(t / 400) * 2;
  ctx.fillStyle = '#18313a';
  ctx.beginPath();
  ctx.arc(-20, -10, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(20, -10, 6, 0, Math.PI * 2);
  ctx.fill();

  // mouth subtle smile
  ctx.beginPath();
  ctx.strokeStyle = '#18313a';
  ctx.lineWidth = 2;
  ctx.arc(0, 4 + Math.sin(t / 300), 16, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();

  // antenna
  ctx.beginPath();
  ctx.strokeStyle = '#d4e9ee';
  ctx.lineWidth = 3;
  ctx.moveTo(44, -42);
  ctx.lineTo(56, -60);
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = '#ffd27f';
  ctx.arc(58, -62, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Draw machine body and panels
function drawMachineBody() {
  // soft shadow
  ctx.save();
  ctx.fillStyle = 'rgba(10,20,24,0.06)';
  roundedRect(ctx, 56, 126, WIDTH - 112, 260, 22);
  ctx.restore();

  // machine main rectangle with gradient
  const g = ctx.createLinearGradient(60, 120, 60, 380);
  g.addColorStop(0, COLORS.machine);
  g.addColorStop(1, COLORS.panel);
  ctx.fillStyle = g;
  roundedRect(ctx, 60, 120, WIDTH - 120, 260, 18);

  // panels
  const panelW = (WIDTH - 160) / 4;
  for (let i = 0; i < 4; i++) {
    const x = 80 + i * panelW;
    const y = 170;
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, x + 6, y + 6, panelW - 12, 160, 12);

    // inner soft shadow
    ctx.fillStyle = 'rgba(10,20,24,0.02)';
    roundedRect(ctx, x + 6, y + 120, panelW - 12, 40, 10);
  }

  // robot head centered above
  drawRobot(WIDTH / 2, 92, nowMs());
}

// draw dials with smoother visuals
function drawDials(t) {
  const areaX = 80;
  const areaY = 170;
  const areaW = WIDTH - 160;
  const cellW = areaW / NUM_DIALS;
  for (let i = 0; i < NUM_DIALS; i++) {
    const x = areaX + i * cellW + 6;
    const y = areaY + 14;
    const w = cellW - 12;
    const h = 160;

    // shadow panel inset
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h, 12);
    ctx.clip();

    // animated gradient for panel
    const pg = ctx.createLinearGradient(x, y, x + w, y + h);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(1, 'rgba(230,250,255,0.9)');
    ctx.fillStyle = pg;
    ctx.fillRect(x, y, w, h);

    // subtle inner glow for selected
    if (game.selectedDial === i) {
      ctx.fillStyle = 'rgba(255,210,127,0.06)';
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    }
    ctx.restore();

    // dial plate center
    const dialCx = x + w / 2;
    const dialCy = y + 56;
    const dialR = 36;

    // outer ring with soft shadow
    ctx.beginPath();
    ctx.arc(dialCx, dialCy, dialR + 12, 0, Math.PI * 2);
    ctx.fillStyle = '#e6f6fb';
    ctx.fill();

    // rotating teeth simplified
    const angleBase = (nowMs() / 700) * (0.6 + game.machineSpin * 4) + i * 0.7;
    for (let tIdx = 0; tIdx < 10; tIdx++) {
      const a = (tIdx / 10) * Math.PI * 2 + angleBase;
      ctx.beginPath();
      ctx.fillStyle = tIdx % 2 ? '#dff3f6' : '#cfeff3';
      const rx = dialCx + Math.cos(a) * (dialR + 10);
      const ry = dialCy + Math.sin(a) * (dialR + 10);
      ctx.ellipse(rx, ry, 8, 4, a, 0, Math.PI * 2);
      ctx.fill();
    }

    // central knob (animated tilt for current value)
    const tilt = ((game.dials[i] - 4.5) / 9) * Math.PI * 0.08;
    ctx.save();
    ctx.translate(dialCx, dialCy);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.arc(0, 0, dialR - 8, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.knob;
    ctx.fill();

    // highlight
    const hg = ctx.createLinearGradient(-dialR, -dialR, dialR, dialR);
    hg.addColorStop(0, 'rgba(255,255,255,0.22)');
    hg.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = hg;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(-8, -10, dialR - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // numeric text
    ctx.fillStyle = '#fff';
    ctx.font = '26px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(game.dials[i]), 0, 0);

    ctx.restore();

    // selection halo
    if (game.selectedDial === i) {
      const pulse = 0.8 + 0.2 * Math.sin(nowMs() / 240);
      ctx.beginPath();
      ctx.arc(dialCx, dialCy, dialR + 16 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,210,127,0.35)';
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // label
    ctx.fillStyle = COLORS.mainText;
    ctx.font = '13px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Dial ${i + 1}`, x + w / 2, y + 122);
  }
}

// gears and feet with personality
function drawGearsAndFeet(t) {
  const leftCx = 110;
  const leftCy = 360;
  const rightCx = WIDTH - 110;
  const rightCy = 360;
  const time = nowMs() / 700;
  const leftSpin = time * (0.8 + game.machineSpin * 3);
  const rightSpin = -time * (0.6 + game.machineSpin * 2);

  function gear(cx, cy, r, teeth, spin, faceColor) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      ctx.beginPath();
      ctx.fillStyle = i % 2 ? '#dbeff1' : '#d1e7ea';
      const rx = Math.cos(a) * (r + 6);
      const ry = Math.sin(a) * (r + 6);
      ctx.ellipse(rx, ry, 8, 6, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = faceColor;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // friendly face
    ctx.fillStyle = '#163036';
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.18, r * 0.12, 0, Math.PI * 2);
    ctx.arc(r * 0.06, -r * 0.18, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#163036';
    ctx.lineWidth = 2;
    ctx.arc(0, r * 0.05, r * 0.42, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  gear(leftCx, leftCy, 28, 10, leftSpin, '#bfe5e9');
  gear(rightCx, rightCy, 36, 12, rightSpin, '#aee0e5');

  // feet / base
  ctx.fillStyle = '#e3f6fa';
  ctx.beginPath();
  roundedRect(ctx, 120, 380, WIDTH - 240, 46, 10);
}

/* =========================
   Particles and Animations
   ========================= */

function updateAndDrawParticles(dt) {
  const now = nowMs();
  const gravity = 0.0025 * dt;
  for (let i = game.visualParticles.length - 1; i >= 0; i--) {
    const p = game.visualParticles[i];
    const lifeProg = (now - p.born) / p.life;
    if (lifeProg >= 1) {
      game.visualParticles.splice(i, 1);
      continue;
    }
    p.vy += gravity;
    p.x += p.vx * dt * 0.05;
    p.y += p.vy * dt * 0.05;
    p.rot += p.drot;
    // draw
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 1 - lifeProg;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/* =========================
   UI Text and Feedback
   ========================= */

function drawTextAndUI() {
  ctx.fillStyle = COLORS.mainText;
  ctx.font = '18px system-ui, Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Controls: ← → select, ↑ ↓ change, Enter submit, H hint, R reset, M sound', 72, 420);

  ctx.font = '14px system-ui, Arial';
  ctx.fillText(`Moves: ${game.moves}`, 72, 440);
  ctx.textAlign = 'right';
  ctx.fillText(`Score: ${game.correctCount}`, WIDTH - 72, 440);

  // target panel
  ctx.fillStyle = COLORS.warm;
  roundedRect(ctx, WIDTH - 210, 62, 130, 48, 10);
  ctx.fillStyle = COLORS.mainText;
  ctx.font = '18px system-ui, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Target: ${game.target}`, WIDTH - 145, 86);

  // feedback messages
  const elapsed = nowMs() - game.feedbackTimer;
  if (game.lastFeedback === 'correct' && elapsed < 1500) {
    ctx.fillStyle = 'rgba(63,184,111,0.12)';
    roundedRect(ctx, WIDTH / 2 - 180, 300, 360, 64, 12);
    ctx.fillStyle = COLORS.success;
    ctx.font = '22px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Nice! Machine fixed!', WIDTH / 2, 335);
  } else if (game.lastFeedback === 'incorrect' && elapsed < 1200) {
    ctx.fillStyle = 'rgba(214,90,90,0.1)';
    roundedRect(ctx, WIDTH / 2 - 180, 300, 360, 64, 12);
    ctx.fillStyle = COLORS.danger;
    ctx.font = '18px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Oops! Try adjusting the dials a bit.', WIDTH / 2, 335);
  } else if (game.lastFeedback === 'audionot' && elapsed < 1800) {
    ctx.fillStyle = 'rgba(255,200,100,0.12)';
    roundedRect(ctx, WIDTH / 2 - 180, 300, 360, 64, 12);
    ctx.fillStyle = '#6a4f01';
    ctx.font = '16px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Audio unavailable: ' + (audioUnavailableReason || 'blocked'), WIDTH / 2, 335);
  }

  // hint suggestion
  if (game.hintUsed && game.lastSuggestion) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '13px system-ui, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Hint: ' + game.lastSuggestion.join(' + ') + ` = ${game.target}`, WIDTH / 2, 465);
  }
}

// sound icon
function drawSoundIcon() {
  const x = WIDTH - 54;
  const y = 8;
  ctx.fillStyle = '#f0fbfd';
  roundedRect(ctx, x, y, 46, 46, 8);

  ctx.save();
  ctx.translate(x + 22, y + 24);
  ctx.fillStyle = game.soundOn ? '#21484f' : '#9b9b9b';
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.lineTo(-2, -8);
  ctx.lineTo(6, -16);
  ctx.lineTo(6, 16);
  ctx.lineTo(-2, 8);
  ctx.lineTo(-10, 8);
  ctx.closePath();
  ctx.fill();

  if (!game.soundOn) {
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(12, -12);
    ctx.lineTo(20, 14);
    ctx.stroke();
  } else if (!audioEnabled && audioUnavailableReason) {
    ctx.fillStyle = '#ffb86b';
    ctx.beginPath();
    ctx.arc(14, -12, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(33,72,79,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(6, -2, 7, -0.6, 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

/* =========================
   Main Render Loop
   ========================= */

let lastFrame = nowMs();

function update(delta) {
  // animations
  if (game.machineSpin > 0) game.machineSpin = Math.max(0, game.machineSpin - delta * 0.0025);
  if (game.glowPulse > 0) game.glowPulse = Math.max(0, game.glowPulse - delta * 0.0008);

  // shake timer decrement
  if (game.shakeTimer > 0) game.shakeTimer = Math.max(0, game.shakeTimer - delta);

  updateBackgroundShapes(delta);
}

function render() {
  const now = nowMs();
  const delta = now - lastFrame;
  lastFrame = now;

  try {
    update(delta);

    // clear
    drawBackground();

    // draw machine
    drawMachineBody();

    // dials
    drawDials(now);

    // gears and feet
    drawGearsAndFeet(now);

    // confetti / particles
    updateAndDrawParticles(delta);

    // UI
    drawTextAndUI();

    // sound icon
    drawSoundIcon();

    // victory overlay
    if (!game.running) {
      ctx.fillStyle = 'rgba(10,20,24,0.9)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '34px system-ui, Arial';
      ctx.fillText('All Machines Fixed!', WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = '18px system-ui, Arial';
      ctx.fillText(`You fixed ${game.correctCount} machines with ${game.moves} moves.`, WIDTH / 2, HEIGHT / 2 + 14);
      ctx.font = '15px system-ui, Arial';
      ctx.fillText('Press R to restart the game.', WIDTH / 2, HEIGHT / 2 + 46);
    }
  } catch (err) {
    console.error('Render error', err);
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);

/* =========================
   Accessibility & Focus
   ========================= */

canvas.addEventListener('focus', () => {
  canvas.style.boxShadow = '0 0 0 4px rgba(102,167,184,0.18)';
});
canvas.addEventListener('blur', () => {
  canvas.style.boxShadow = 'none';
});

// global key for reset/restart
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') {
    if (!game.running) {
      game.level = 1;
      game.correctCount = 0;
      startLevel(1);
      game.running = true;
      game.moves = 0;
      game.lastSuggestion = null;
      game.hintUsed = false;
      if (audioEnabled) playClick(0.08);
    } else {
      resetDials();
      if (audioEnabled) playClick(0.06);
    }
  }
});

/* =========================
   Initialize Audio & Focus
   ========================= */

try {
  initAudio();
} catch (err) {
  console.warn('initAudio threw', err);
  audioEnabled = false;
  audioUnavailableReason = err && err.message ? err.message : String(err);
}

const srHelp = `Welcome to Machine Math. Objective: match the target number by adjusting four dials. 
Use arrow keys: left and right to pick a dial, up and down to change its number. Press Enter to submit. 
Press H for a hint. Press M to toggle sound. Press R to reset or restart.`;
canvas.setAttribute('aria-description', srHelp);

// initial focus for keyboard users
setTimeout(() => {
  try {
    canvas.focus();
  } catch (e) {
    // ignore
  }
}, 500);

/* =========================
   Safety: Runtime error overlay
   ========================= */
window.addEventListener('error', (ev) => {
  console.error('Runtime error in Machine Math:', ev.error || ev.message || ev);
  ctx.fillStyle = 'rgba(255,255,255,0.98)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#c33';
  ctx.font = '18px system-ui, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Oops — something went wrong.', WIDTH / 2, HEIGHT / 2 - 10);
  ctx.fillStyle = '#333';
  ctx.font = '14px system-ui, Arial';
  ctx.fillText('Try reloading the page. If sound is not working, it may be blocked by the browser.', WIDTH / 2, HEIGHT / 2 + 16);
});