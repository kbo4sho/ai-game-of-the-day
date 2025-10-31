(function () {
  // Enhanced Drone Math Delivery - Canvas Game
  // Visual & audio improvements only. Renders into element with id "game-of-the-day-stage".
  // All graphics drawn on canvas. All sound generated via Web Audio API.

  // Configuration (unchanged mechanics)
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 12;
  const TARGET_SCORE = 10;
  const MAX_LIVES = 3;
  const OPTION_COUNT = 4;

  // DOM setup
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Missing container element with id 'game-of-the-day-stage'.");
    return;
  }
  container.innerHTML = "";
  container.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Drone Delivery Math Game");
  canvas.style.display = "block";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Unable to get 2D context.");
    return;
  }

  // Audio setup with robust error handling
  let audioContext = null;
  let masterGain = null;
  let ambientGain = null;
  let rotorGain = null;
  let bellGain = null;
  let audioEnabled = false;
  let audioAllowed = false;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
      masterGain = audioContext.createGain();
      ambientGain = audioContext.createGain();
      rotorGain = audioContext.createGain();
      bellGain = audioContext.createGain();

      // Master chain
      masterGain.gain.value = 0.9;
      ambientGain.gain.value = 0.06; // gentle background
      rotorGain.gain.value = 0.03; // rotor background hum
      bellGain.gain.value = 0.0; // bells only when triggered

      // Connect chain
      ambientGain.connect(masterGain);
      rotorGain.connect(masterGain);
      bellGain.connect(masterGain);
      masterGain.connect(audioContext.destination);

      audioAllowed = audioContext.state !== "suspended";
      audioEnabled = audioAllowed;
    } else {
      console.warn("Web Audio API not supported in this browser.");
    }
  } catch (e) {
    console.error("Error creating AudioContext:", e);
    audioContext = null;
  }

  function resumeAudioIfNeeded() {
    if (!audioContext) return;
    if (audioContext.state === "suspended") {
      audioContext.resume().then(() => {
        audioAllowed = true;
        audioEnabled = true;
      }).catch((err) => {
        console.warn("Audio resume failed:", err);
      });
    } else {
      audioAllowed = true;
      audioEnabled = true;
    }
  }

  // Ambient hum with slow LFO and gentle filter sweep
  let ambientNodes = { oscA: null, oscB: null, filter: null, lfo: null };
  function startAmbientHum() {
    if (!audioContext) return;
    try {
      stopAmbientHum(); // ensure we don't duplicate

      const filter = audioContext.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 800;
      filter.Q.value = 0.8;

      const oscA = audioContext.createOscillator();
      oscA.type = "sine";
      oscA.frequency.value = 80;
      const ga = audioContext.createGain();
      ga.gain.value = 0.02;
      oscA.connect(ga);
      ga.connect(filter);

      const oscB = audioContext.createOscillator();
      oscB.type = "sine";
      oscB.frequency.value = 120;
      const gb = audioContext.createGain();
      gb.gain.value = 0.018;
      oscB.connect(gb);
      gb.connect(filter);

      // LFO to gently wobble the filter cutoff
      const lfo = audioContext.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.08; // very slow
      const lfoGain = audioContext.createGain();
      lfoGain.gain.value = 220; // amount of sweep
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      filter.connect(ambientGain);

      oscA.start();
      oscB.start();
      lfo.start();

      ambientNodes = { oscA, oscB, filter, lfo, lfoGain, ga, gb };
      audioAllowed = audioContext.state !== "suspended";
      audioEnabled = audioAllowed;
    } catch (e) {
      console.error("Error starting ambient hum:", e);
      ambientNodes = { oscA: null, oscB: null, filter: null, lfo: null };
    }
  }

  function stopAmbientHum() {
    if (!audioContext) return;
    try {
      if (ambientNodes.oscA) {
        try { ambientNodes.oscA.stop(); } catch (e) {}
        try { ambientNodes.oscA.disconnect(); } catch (e) {}
      }
      if (ambientNodes.oscB) {
        try { ambientNodes.oscB.stop(); } catch (e) {}
        try { ambientNodes.oscB.disconnect(); } catch (e) {}
      }
      if (ambientNodes.lfo) {
        try { ambientNodes.lfo.stop(); } catch (e) {}
        try { ambientNodes.lfo.disconnect(); } catch (e) {}
      }
      if (ambientNodes.filter) {
        try { ambientNodes.filter.disconnect(); } catch (e) {}
      }
    } catch (e) {
      console.warn("Error stopping ambient hum:", e);
    }
    ambientNodes = { oscA: null, oscB: null, filter: null, lfo: null };
  }

  // Rotor hum: continuous subtle sound whose frequency follows rotorSpeed
  let rotorOsc = null;
  let rotorLfo = null;
  let rotorState = { speed: 0.6 }; // 0..1
  function startRotorHum() {
    if (!audioContext) return;
    try {
      stopRotorHum();
      rotorOsc = audioContext.createOscillator();
      rotorOsc.type = "sawtooth";
      rotorOsc.frequency.value = 90;
      const rotorFilter = audioContext.createBiquadFilter();
      rotorFilter.type = "lowpass";
      rotorFilter.frequency.value = 1200;
      rotorFilter.Q.value = 0.6;

      const rotorAmpLFO = audioContext.createOscillator();
      rotorAmpLFO.type = "sine";
      rotorAmpLFO.frequency.value = 3.2;
      const rotorAmpGain = audioContext.createGain();
      rotorAmpGain.gain.value = 0.006; // subtle tremble
      rotorAmpLFO.connect(rotorAmpGain);
      rotorAmpGain.connect(rotorGain.gain);

      rotorOsc.connect(rotorFilter);
      rotorFilter.connect(rotorGain);

      rotorOsc.start();
      rotorAmpLFO.start();

      rotorLfo = rotorAmpLFO;
    } catch (e) {
      console.warn("Error starting rotor hum:", e);
    }
  }

  function stopRotorHum() {
    if (!audioContext) return;
    try {
      if (rotorOsc) {
        try { rotorOsc.stop(); } catch (e) {}
        try { rotorOsc.disconnect(); } catch (e) {}
      }
      if (rotorLfo) {
        try { rotorLfo.stop(); } catch (e) {}
        try { rotorLfo.disconnect(); } catch (e) {}
      }
      rotorOsc = null;
      rotorLfo = null;
    } catch (e) {
      console.warn("Error stopping rotor hum:", e);
    }
  }

  // Occasional bell (pleasant feedback) - scheduled plinks
  function playBell(frequency = 880, time = 0, duration = 0.7, volume = 0.035) {
    if (!audioContext || !audioEnabled) return;
    try {
      const now = audioContext.currentTime + time;
      const o = audioContext.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(frequency, now);
      o.frequency.exponentialRampToValueAtTime(frequency * 0.25, now + duration * 0.9);

      const g = audioContext.createGain();
      g.gain.setValueAtTime(volume, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      const filter = audioContext.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 300;

      o.connect(g);
      g.connect(filter);
      filter.connect(bellGain);

      o.start(now);
      o.stop(now + duration + 0.05);
      // disconnect after stopping
      setTimeout(() => {
        try { o.disconnect(); } catch (e) {}
        try { g.disconnect(); } catch (e) {}
        try { filter.disconnect(); } catch (e) {}
      }, (duration + 0.12) * 1000);
    } catch (e) {
      console.warn("playBell failed:", e);
    }
  }

  // Play a short tone; returns a promise
  function playTone({ frequency = 440, type = "sine", duration = 0.2, volume = 0.12, detune = 0 } = {}) {
    if (!audioContext || !audioEnabled) return Promise.resolve();
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.max(800, frequency * 2.5);

      osc.type = type;
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
      return new Promise((res) => {
        setTimeout(() => {
          try { osc.disconnect(); } catch (e) {}
          try { filter.disconnect(); } catch (e) {}
          try { gain.disconnect(); } catch (e) {}
          res();
        }, (duration + 0.07) * 1000);
      });
    } catch (e) {
      console.warn("playTone failed:", e);
      return Promise.resolve();
    }
  }

  // Correct and incorrect sounds (improved timbre)
  async function playCorrectSound() {
    if (!audioContext || !audioEnabled) return;
    // gentle triad arpeggio with bell accent
    const seq = [
      { f: 660, d: 0.08 },
      { f: 880, d: 0.10 },
      { f: 990, d: 0.12 }
    ];
    for (const s of seq) {
      await playTone({ frequency: s.f, type: "triangle", duration: s.d, volume: 0.07 });
    }
    // little bell
    playBell(990, 0, 0.34, 0.03);
  }

  async function playIncorrectSound() {
    if (!audioContext || !audioEnabled) return;
    // soft buzzer + descending thud
    await playTone({ frequency: 220, type: "square", duration: 0.22, volume: 0.12 });
    await playTone({ frequency: 160, type: "sawtooth", duration: 0.16, volume: 0.09 });
  }

  // Utility: rounded rectangle
  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // Game state (mechanics preserved)
  let state = {
    score: 0,
    lives: MAX_LIVES,
    currentQuestion: null,
    options: [],
    correctIndex: 0,
    selectedOption: -1,
    wrongCount: 0,
    started: false,
    phase: "playing", // "playing", "won", "lost"
    droneX: 40,
    droneY: 110,
    lastAnswerTime: 0,
    hoverIndex: -1,
    ambientEnabled: true,
    lastInteraction: Date.now()
  };

  // Visual extras
  const clouds = [];
  const cloudCount = 4;
  const confetti = [];
  const maxConfetti = 80;

  // Rotor visual state
  let rotorAngle = 0;
  let rotorSpeed = 0.6; // 0.1..2.0 variation

  // Accessibility: instructions text
  const instructionsLines = [
    "Use mouse or keyboard to answer:",
    "Click an option or press 1-4 to choose, Enter to confirm.",
    "Press M to toggle sound. Press R or Enter on end screen to restart."
  ];

  // Question generator unchanged
  function makeQuestion() {
    const typeRoll = Math.random();
    let a, b, problemText, answer;
    if (typeRoll < 0.7) {
      if (Math.random() < 0.5) {
        a = Math.floor(Math.random() * 16) + 2;
        b = Math.floor(Math.random() * 9) + 1;
        answer = a + b;
        problemText = `${a} + ${b} = ?`;
      } else {
        a = Math.floor(Math.random() * 19) + 5;
        b = Math.floor(Math.random() * 5) + 1;
        if (b > a) [a, b] = [b, a];
        answer = a - b;
        problemText = `${a} − ${b} = ?`;
      }
    } else {
      a = Math.floor(Math.random() * 4) + 2;
      b = Math.floor(Math.random() * 5) + 2;
      answer = a * b;
      problemText = `${a} × ${b} = ?`;
    }
    const options = new Set();
    options.add(answer);
    while (options.size < OPTION_COUNT) {
      let delta = Math.max(1, Math.floor(Math.random() * 5));
      let candidate = answer + (Math.random() < 0.5 ? -delta : delta);
      if (Math.random() < 0.1) candidate = answer + (Math.floor(Math.random() * 10) - 5);
      if (candidate < 0) continue;
      options.add(candidate);
    }
    const optsArr = Array.from(options);
    for (let i = optsArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [optsArr[i], optsArr[j]] = [optsArr[j], optsArr[i]];
    }
    const correctIndex = optsArr.indexOf(answer);
    state.currentQuestion = problemText;
    state.options = optsArr;
    state.correctIndex = correctIndex;
    state.selectedOption = -1;
    state.hoverIndex = -1;
    state.lastAnswerTime = 0;
  }

  // Layout unchanged
  function layoutOptions() {
    const boxW = 280;
    const boxH = 64;
    const gapX = 20;
    const gapY = 18;
    const totalW = boxW * 2 + gapX;
    const startX = (WIDTH - totalW) / 2;
    const startY = 220;
    const rects = [];
    for (let i = 0; i < OPTION_COUNT; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = startX + col * (boxW + gapX);
      const y = startY + row * (boxH + gapY);
      rects.push({ x, y, w: boxW, h: boxH });
    }
    return rects;
  }

  // Input handling
  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    handlePointer(mx, my, true);
    resumeAudioIfNeeded();
    state.lastInteraction = Date.now();
  });
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    handlePointer(mx, my, false);
  });
  window.addEventListener("keydown", (e) => {
    if (!state.started) {
      state.started = true;
    }
    resumeAudioIfNeeded();
    state.lastInteraction = Date.now();
    if (state.phase === "won" || state.phase === "lost") {
      if (e.key === "r" || e.key === "R" || e.key === "Enter") {
        restartGame();
      }
      return;
    }
    if (e.key === "m" || e.key === "M") {
      toggleAudio();
      return;
    }
    if (["1", "2", "3", "4"].includes(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      selectOption(idx);
      return;
    }
    if (e.key === "ArrowRight") {
      moveSelection(1);
    } else if (e.key === "ArrowLeft") {
      moveSelection(-1);
    } else if (e.key === "ArrowUp") {
      moveSelection(-2);
    } else if (e.key === "ArrowDown") {
      moveSelection(2);
    } else if (e.key === "Enter" || e.key === " ") {
      if (state.selectedOption >= 0) {
        submitAnswer(state.selectedOption);
      }
    }
  });

  function toggleAudio() {
    if (!audioContext) return;
    audioEnabled = !audioEnabled;
    try {
      // adjust gain nodes so things animate but are silent when off
      ambientGain.gain.value = audioEnabled ? 0.06 : 0.0;
      rotorGain.gain.value = audioEnabled ? 0.03 : 0.0;
      bellGain.gain.value = audioEnabled ? 1.0 : 0.0;
      if (audioEnabled && audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
      }
    } catch (e) {
      console.warn("toggleAudio failed:", e);
    }
  }

  function handlePointer(mx, my, isClick) {
    if (state.phase === "won" || state.phase === "lost") {
      const btn = endScreenButtonRect();
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        if (isClick) restartGame();
      }
      return;
    }
    const rects = layoutOptions();
    let found = -1;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        found = i;
        break;
      }
    }
    state.hoverIndex = found;
    if (isClick && found >= 0) {
      selectOption(found);
      submitAnswer(found);
    }
  }

  function moveSelection(delta) {
    let idx = state.selectedOption;
    if (idx < 0) idx = 0;
    idx = (idx + delta + OPTION_COUNT) % OPTION_COUNT;
    state.selectedOption = idx;
  }

  function selectOption(idx) {
    if (state.phase !== "playing") return;
    state.selectedOption = idx;
  }

  // Submission and scoring preserved
  function submitAnswer(idx) {
    if (state.phase !== "playing") return;
    const now = Date.now();
    if (now - state.lastAnswerTime < 250) return;
    state.lastAnswerTime = now;

    if (idx === state.correctIndex) {
      state.score += 1;
      state.droneX = Math.min(WIDTH - 120, 40 + Math.floor((state.score / TARGET_SCORE) * (WIDTH - 180)));
      playCorrectSound().catch(() => {});
      // bell accent
      playBell(880 + Math.random() * 120, 0.02, 0.28, 0.02);
      animateSuccess();
      if (state.score >= TARGET_SCORE) {
        state.phase = "won";
        playVictorySequence();
        spawnConfetti();
      } else {
        setTimeout(makeQuestion, 700);
      }
    } else {
      state.lives -= 1;
      state.wrongCount += 1;
      playIncorrectSound().catch(() => {});
      animateCrash();
      if (state.lives <= 0) {
        state.phase = "lost";
      } else {
        setTimeout(makeQuestion, 700);
      }
    }
    state.selectedOption = -1;
  }

  // Victory sequence (slightly enhanced)
  async function playVictorySequence() {
    if (!audioContext || !audioEnabled) return;
    const notes = [880, 990, 1320, 1760];
    for (let i = 0; i < notes.length; i++) {
      await playTone({ frequency: notes[i], type: "triangle", duration: 0.16, volume: 0.09 });
    }
    for (let i = 0; i < 3; i++) {
      await playTone({ frequency: 660 + i * 80, type: "sine", duration: 0.12, volume: 0.07 });
    }
    // gentle bell shower
    playBell(990, 0.05, 0.5, 0.03);
    playBell(780, 0.12, 0.46, 0.028);
    playBell(660, 0.2, 0.42, 0.025);
  }

  // Animations
  let anims = {
    successPulse: { t: 0 },
    crashShake: { t: 0 }
  };

  function animateSuccess() {
    anims.successPulse.t = 1.0;
  }
  function animateCrash() {
    anims.crashShake.t = 1.0;
  }

  // Confetti for victory (visual only, keeps end condition)
  function spawnConfetti() {
    const colors = ["#ff6b6b", "#ffd166", "#8ad4ff", "#7bed9f", "#c594ff"];
    for (let i = 0; i < maxConfetti; i++) {
      confetti.push({
        x: WIDTH / 2 + (Math.random() - 0.5) * 200,
        y: HEIGHT / 2 - 20 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 160,
        vy: -60 + Math.random() * -20,
        rot: Math.random() * Math.PI * 2,
        vrota: (Math.random() - 0.5) * 6,
        size: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 2 + Math.random() * 2
      });
    }
  }

  // Restart game unchanged
  function restartGame() {
    state.score = 0;
    state.lives = MAX_LIVES;
    state.wrongCount = 0;
    state.phase = "playing";
    state.droneX = 40;
    state.started = true;
    confetti.length = 0;
    makeQuestion();
  }

  // End screen button rect
  function endScreenButtonRect() {
    ctx.font = "18px sans-serif";
    const text = "Restart (R or Enter)";
    const textW = ctx.measureText(text).width;
    const btnW = textW + 28;
    const btnH = 42;
    const x = (WIDTH - btnW) / 2;
    const y = HEIGHT / 2 + 60;
    return { x, y, w: btnW, h: btnH, text };
  }

  // Enhanced drawing
  function draw() {
    try {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // animated background gradient (soft, with tiny shifting)
      const t = performance.now() * 0.00012;
      const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, blend("#CFF1FF", "#BEE3F8", 0.3 + 0.02 * Math.sin(t)));
      g.addColorStop(0.5, blend("#E6F7FF", "#F0FCFF", 0.4 + 0.02 * Math.cos(t * 0.9)));
      g.addColorStop(1, "#FAFFFE");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // parallax clouds
      for (const c of clouds) {
        drawCloud(c);
      }

      // sun with soft rays
      drawSun(WIDTH - 72, 60, 34, t);

      // rolling hills & subtle ground texture
      drawHills();

      // UI panels with softened card style
      drawTopUI();

      // progress path and sign posts
      drawProgressPath();

      // Drone position influenced by bobbing and animations
      const pulse = anims.successPulse.t * 0.4;
      const shake = anims.crashShake.t * 5;
      const bob = Math.sin(performance.now() * 0.003 + state.score) * 3;
      const droneX = state.droneX + (Math.random() - 0.5) * shake;
      const droneY = state.droneY - pulse * 10 + bob;
      drawDrone(droneX, droneY);

      // target hub
      drawTarget(WIDTH - 100, state.droneY + 10);

      // question display
      drawQuestionBox();

      // options area
      drawOptions();

      // bottom instructions
      drawInstructions();

      // start overlay
      if (!state.started) drawStartOverlay();

      // confetti if present
      drawConfetti();

      // end screens
      if (state.phase === "won") drawEndScreen(true);
      else if (state.phase === "lost") drawEndScreen(false);
    } catch (e) {
      console.error("Draw error:", e);
    }
  }

  function blend(a, b, t) {
    // simple hex blend, t 0..1
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bl = Math.round(pa.b + (pb.b - pa.b) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function hexToRgb(hex) {
    const c = hex.replace("#", "");
    return {
      r: parseInt(c.substring(0, 2), 16),
      g: parseInt(c.substring(2, 4), 16),
      b: parseInt(c.substring(4, 6), 16)
    };
  }

  function drawCloud(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rotation);
    const w = c.w;
    const h = c.h;
    const gradient = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    gradient.addColorStop(0, c.color1);
    gradient.addColorStop(1, c.color2);
    ctx.fillStyle = gradient;
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    // puffs
    ctx.fillStyle = c.color1;
    ctx.beginPath();
    ctx.arc(-w / 4, -h / 4, h / 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w / 6, -h / 5, h / 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSun(cx, cy, r, t) {
    // subtle rotating rays
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
      ctx.lineTo(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 1.6);
      ctx.strokeStyle = `rgba(255, 222, 120, ${0.06 + 0.03 * Math.sin(t + i)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#FFF2B8";
    ctx.fill();
    ctx.restore();
  }

  function drawHills() {
    ctx.save();
    // layered hills
    ctx.fillStyle = "#d8f7e5";
    roundRect(ctx, -40, HEIGHT - 160, WIDTH + 80, 220, 120);
    ctx.fill();

    // small texture lines
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const y = HEIGHT - 68 - i * 8;
      ctx.moveTo(10, y + Math.sin(i + performance.now() * 0.002) * 6);
      ctx.quadraticCurveTo(WIDTH / 2, y + Math.cos(i) * 6, WIDTH - 10, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTopUI() {
    // Score card left
    ctx.font = "18px system-ui, sans-serif";
    const scoreText = `Delivered: ${state.score}/${TARGET_SCORE}`;
    const scoreTextW = ctx.measureText(scoreText).width;
    const scoreBgW = scoreTextW + 24;
    const scoreX = PADDING;
    const scoreY = PADDING;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, scoreX, scoreY, scoreBgW, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#114358";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText(scoreText, scoreX + 12, scoreY + 24);

    // Lives right
    const livesText = `Lives: ${state.lives}`;
    const livesTextW = ctx.measureText(livesText).width;
    const livesBgW = livesTextW + 24;
    const livesX = WIDTH - livesBgW - PADDING;
    const livesY = PADDING;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, livesX, livesY, livesBgW, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#7a1f2d";
    ctx.fillText(livesText, livesX + 12, livesY + 24);
    for (let i = 0; i < MAX_LIVES; i++) {
      const hx = livesX + livesBgW - 14 - i * 20;
      const hy = livesY + 10;
      drawHeart(hx - 8, hy + 6, 8, i < state.lives ? "#e74c3c" : "#f0dede");
    }

    // audio center
    ctx.font = "14px system-ui, sans-serif";
    const audioText = audioEnabled ? "Sound: On (M)" : "Sound: Off (M)";
    const audioW = ctx.measureText(audioText).width + 24;
    const audioX = (WIDTH - audioW) / 2;
    const audioY = PADDING + 40;
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    roundRect(ctx, audioX, audioY, audioW, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#1f3b4d";
    ctx.fillText(audioText, audioX + 12, audioY + 20);
  }

  function drawProgressPath() {
    const pathY = state.droneY + 42;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.moveTo(20, pathY);
    const seg = WIDTH - 140;
    for (let i = 0; i < 6; i++) {
      ctx.lineTo(20 + seg * ((i + 1) / 6), pathY + (i % 2 === 0 ? 4 : -4));
    }
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      const x = 80 + i * 130;
      ctx.fillStyle = "#d7eaf2";
      roundRect(ctx, x, pathY - 18, 36, 16, 6);
      ctx.fill();
      // small icon inside post
      ctx.fillStyle = "#6aa4c9";
      ctx.fillRect(x + 8, pathY - 14, 20, 8);
    }
  }

  function drawDrone(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    // drop shadow
    ctx.beginPath();
    ctx.ellipse(0, 48, 46, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,20,30,0.12)";
    ctx.fill();

    // body with subtle gradient
    const grad = ctx.createLinearGradient(-38, -10, 38, 24);
    grad.addColorStop(0, "#6fd2ff");
    grad.addColorStop(1, "#8ad4ff");
    ctx.fillStyle = grad;
    roundRect(ctx, -38, -10, 76, 34, 10);
    ctx.fill();

    // cockpit glass
    ctx.fillStyle = "rgba(235,255,255,0.95)";
    roundRect(ctx, -10, -6, 30, 22, 8);
    ctx.fill();

    // rotors drawn with rotation
    drawRotor(-26, -12, 18, rotorAngle * 1.1);
    drawRotor(26, -12, 18, -rotorAngle * 0.9);
    drawRotor(-26, 22, 18, -rotorAngle * 0.6);
    drawRotor(26, 22, 18, rotorAngle * 0.6);

    // legs
    ctx.strokeStyle = "#3b5b6e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-25, 24);
    ctx.lineTo(-15, 36);
    ctx.moveTo(25, 24);
    ctx.lineTo(15, 36);
    ctx.stroke();

    // package with subtle label
    ctx.fillStyle = "#ffd29f";
    roundRect(ctx, -12, 24, 28, 18, 6);
    ctx.fill();
    ctx.strokeStyle = "#d79b5f";
    ctx.lineWidth = 2;
    ctx.strokeRect(-12, 24, 28, 18);
    ctx.fillStyle = "#8a5a2f";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText("fragile", -6, 36);

    ctx.restore();
  }

  function drawRotor(x, y, r, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // blades - use composite alpha for motion blur effect
    ctx.fillStyle = "rgba(30,30,30,0.6)";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r / 6, i * Math.PI * 2 / 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // center
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#2b3b44";
    ctx.fill();
    ctx.restore();
  }

  function drawQuestionBox() {
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const qW = Math.max(180, ctx.measureText(state.currentQuestion || "").width + 48);
    const qX = PADDING + 8;
    const qY = 90;
    roundRect(ctx, qX, qY, qW, 56, 12);
    ctx.fill();
    ctx.fillStyle = "#0f2f44";
    ctx.font = "24px system-ui, sans-serif";
    ctx.fillText(state.currentQuestion || "Press any key or click to start", qX + 18, qY + 36);
  }

  function drawOptions() {
    const rects = layoutOptions();
    ctx.font = "20px system-ui, sans-serif";
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const isSelected = state.selectedOption === i;
      const isHover = state.hoverIndex === i;
      if (isSelected) {
        // subtle glow for selected
        ctx.fillStyle = "rgba(140,200,255,0.98)";
      } else if (isHover) {
        ctx.fillStyle = "rgba(255,255,255,0.96)";
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
      }
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fill();

      // label text
      ctx.fillStyle = "#16324a";
      const optText = `${i + 1}. ${state.options[i]}`;
      ctx.font = "20px system-ui, sans-serif";
      ctx.fillText(optText, r.x + 18, r.y + 38);

      // highlight last answer: correct/incorrect
      if (Date.now() - state.lastAnswerTime < 800) {
        if (i === state.correctIndex) {
          ctx.strokeStyle = "rgba(46,204,113,0.96)";
          ctx.lineWidth = 3;
          roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10);
          ctx.stroke();
        }
      }
    }
  }

  function drawInstructions() {
    ctx.font = "16px system-ui, sans-serif";
    const instrY = HEIGHT - 72;
    let instrMaxW = 0;
    for (const line of instructionsLines) {
      instrMaxW = Math.max(instrMaxW, ctx.measureText(line).width);
    }
    const instrBgW = instrMaxW + 36;
    const instrX = (WIDTH - instrBgW) / 2;
    const instrH = instructionsLines.length * 20 + 20;
    roundRect(ctx, instrX, instrY - 6, instrBgW, instrH, 12);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fill();
    ctx.fillStyle = "#214455";
    ctx.font = "16px system-ui, sans-serif";
    for (let i = 0; i < instructionsLines.length; i++) {
      ctx.fillText(instructionsLines[i], instrX + 18, instrY + 20 * i + 18);
    }
  }

  function drawStartOverlay() {
    ctx.fillStyle = "rgba(10,20,30,0.28)";
    roundRect(ctx, WIDTH / 2 - 180, HEIGHT / 2 - 54, 360, 108, 12);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px system-ui, sans-serif";
    const welcome = "Welcome! Click or press any key to begin and enable sound.";
    const welcomeW = ctx.measureText(welcome).width;
    ctx.fillText(welcome, WIDTH / 2 - welcomeW / 2, HEIGHT / 2 + 8);
  }

  function drawConfetti() {
    if (confetti.length === 0) return;
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      // update
      p.vy += 160 * 0.016; // gravity
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.rot += p.vrota * 0.016;
      p.life -= 0.016;
      // draw
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
      if (p.life <= 0 || p.y > HEIGHT + 40) confetti.splice(i, 1);
    }
  }

  function drawEndScreen(isWin) {
    ctx.save();
    ctx.fillStyle = "rgba(6, 20, 30, 0.45)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const cardW = 460;
    const cardH = 220;
    const cardX = (WIDTH - cardW) / 2;
    const cardY = (HEIGHT - cardH) / 2 - 20;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fill();

    ctx.fillStyle = isWin ? "#1b6b2e" : "#8a2432";
    ctx.font = "28px system-ui, sans-serif";
    const title = isWin ? "All Packages Delivered!" : "Uh-oh! The drone ran out of lives!";
    const titleW = ctx.measureText(title).width;
    ctx.fillText(title, cardX + (cardW - titleW) / 2, cardY + 48);

    ctx.font = "18px system-ui, sans-serif";
    ctx.fillStyle = "#2b4756";
    const msg = isWin ? "Great job! You helped the drone deliver all packages." : `Delivered ${state.score} package(s). Try again to beat the route!`;
    const msgW = ctx.measureText(msg).width;
    ctx.fillText(msg, cardX + (cardW - msgW) / 2, cardY + 88);

    const btn = endScreenButtonRect();
    const bx = btn.x;
    const by = btn.y;
    const bw = btn.w;
    const bh = btn.h;
    ctx.fillStyle = "#4aa3ff";
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "18px system-ui, sans-serif";
    const txt = btn.text;
    const txtW = ctx.measureText(txt).width;
    ctx.fillText(txt, bx + (bw - txtW) / 2, by + 26);

    ctx.fillStyle = "#2b4756";
    ctx.font = "14px system-ui, sans-serif";
    const hint = "Press R or Enter to restart. Or click the button.";
    const hintW = ctx.measureText(hint).width;
    ctx.fillText(hint, cardX + (cardW - hintW) / 2, cardY + cardH - 22);
    ctx.restore();
  }

  // Animations update
  function update(dt) {
    // update rotor speed visually based on animations and state
    if (anims.successPulse.t > 0) anims.successPulse.t = Math.max(0, anims.successPulse.t - dt * 2.4);
    if (anims.crashShake.t > 0) anims.crashShake.t = Math.max(0, anims.crashShake.t - dt * 2.6);

    // rotor speed slightly increases as score increases
    const targetSpeed = 0.6 + (state.score / TARGET_SCORE) * 1.0 + anims.successPulse.t * 0.6;
    rotorSpeed += (targetSpeed - rotorSpeed) * Math.min(1, dt * 3.6);
    rotorAngle += rotorSpeed * Math.PI * 2 * dt;

    // update rotor hum frequency mapping
    if (rotorOsc && audioEnabled) {
      try {
        rotorOsc.frequency.setValueAtTime(80 + rotorSpeed * 220, audioContext.currentTime);
      } catch (e) { /* ignore */ }
    }

    // clouds movement & wrap
    for (const c of clouds) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rotation += c.vr * dt;
      if (c.x - c.w / 2 > WIDTH + 60) c.x = -60 - c.w / 2;
      if (c.x + c.w / 2 < -60) c.x = WIDTH + 60 + c.w / 2;
    }

    // confetti gravity handled in drawConfetti update

    // subtle hover reset
    if (Date.now() - state.lastInteraction > 4000) {
      state.hoverIndex = -1;
    }
  }

  // Simple game loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      update(dt);
      draw();
    } catch (e) {
      console.error("Main loop error:", e);
    }
    requestAnimationFrame(loop);
  }

  // Input-resume to ensure audio nodes started only after user gesture (browsers requirement)
  canvas.addEventListener("click", resumeAudioIfNeeded, { once: true });
  window.addEventListener("keydown", resumeAudioIfNeeded, { once: true });

  // Initialize visuals and audio
  function initVisualsAndAudio() {
    // clouds
    clouds.length = 0;
    const palette = [
      ["#FFFFFF", "#EAF7FF"],
      ["#F8FFFF", "#E0F4FF"],
      ["#FFFFFF", "#F0FBFF"],
      ["#F6FFF9", "#E9F9FF"]
    ];
    for (let i = 0; i < cloudCount; i++) {
      const w = 60 + Math.random() * 100;
      const h = 28 + Math.random() * 34;
      const cidx = i % palette.length;
      clouds.push({
        x: Math.random() * WIDTH,
        y: 40 + Math.random() * 80,
        w,
        h,
        rotation: (Math.random() - 0.5) * 0.06,
        vx: 6 + Math.random() * 18,
        vy: (Math.random() - 0.5) * 2,
        vr: (Math.random() - 0.5) * 0.03,
        color1: palette[cidx][0],
        color2: palette[cidx][1]
      });
    }

    // audio nodes start if available
    if (audioContext) {
      startAmbientHum();
      startRotorHum();
    }
  }

  // Small helper: drawHeart reused for top-right
  function drawHeart(x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const topCurveHeight = size * 0.3;
    ctx.moveTo(x, y + topCurveHeight);
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
    ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 1.2, x, y + size);
    ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 1.2, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Start-up initialization
  function init() {
    makeQuestion();
    state.started = true;
    initVisualsAndAudio();
    loop(performance.now());
  }

  // Kick off
  init();

  // Ensure clean-up on page unload to avoid audio errors
  window.addEventListener("unload", () => {
    try {
      stopAmbientHum();
      stopRotorHum();
      if (audioContext && audioContext.close) {
        audioContext.close().catch(() => {});
      }
    } catch (e) {
      // ignore
    }
  });

  // Draw target (defined late to keep logical grouping)
  function drawTarget(x, y) {
    ctx.save();
    // simple hub with a landing pad
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    roundRect(ctx, -36, -8, 72, 40, 8);
    ctx.fill();
    ctx.fillStyle = "#f2f2f2";
    ctx.beginPath();
    ctx.arc(0, 12, 28, 0, Math.PI, true);
    ctx.fill();
    ctx.fillStyle = "#2b4756";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Hub", -10, 6);
    ctx.restore();
  }
})();