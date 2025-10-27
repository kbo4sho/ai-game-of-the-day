(function () {
  // Enhanced Drone Math Adventure - Visuals & Audio Upgrades
  // Renders inside element with ID "game-of-the-day-stage".
  // All visuals are canvas-drawn. Sounds generated with Web Audio API.

  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const PADDING = 10;
  const GOAL_SCORE = 10;
  const MAX_WRONG = 3;
  const BALLOON_COUNT = 4; // number of answer targets on screen
  const BALLOON_MIN_Y = 120;
  const BALLOON_MAX_Y = 360;

  // Container and Canvas setup
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error('Container element with ID "game-of-the-day-stage" not found.');
    return;
  }
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.display = "block";
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });

  // Audio: Web Audio API nodes & utilities
  let audioCtx = null;
  let audioEnabled = false;

  // Global audio nodes
  let masterGain = null;
  let ambientNodes = null; // container for ambient oscillators/filters/gains
  let engineNodes = null; // engine hum tied to drone speed
  let successVolume = 0.16;
  let failVolume = 0.18;

  async function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.9, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);

      // Ambient pad: two detuned oscillators through a bandpass and lowpass
      const ambGain = audioCtx.createGain();
      ambGain.gain.setValueAtTime(0.03, audioCtx.currentTime);
      const ambFilter = audioCtx.createBiquadFilter();
      ambFilter.type = "lowpass";
      ambFilter.frequency.setValueAtTime(1100, audioCtx.currentTime);

      const ambOsc1 = audioCtx.createOscillator();
      ambOsc1.type = "sine";
      ambOsc1.frequency.setValueAtTime(220, audioCtx.currentTime);
      const ambOsc2 = audioCtx.createOscillator();
      ambOsc2.type = "sine";
      ambOsc2.frequency.setValueAtTime(222.5, audioCtx.currentTime); // slight detune
      const ambGainNodes = audioCtx.createGain();
      ambGainNodes.gain.setValueAtTime(1, audioCtx.currentTime);

      // gentle LFO to modulate filter frequency for movement
      const ambLfo = audioCtx.createOscillator();
      ambLfo.type = "sine";
      ambLfo.frequency.setValueAtTime(0.06, audioCtx.currentTime);
      const ambLfoGain = audioCtx.createGain();
      ambLfoGain.gain.setValueAtTime(180, audioCtx.currentTime);

      // chain: oscillators -> ambFilter -> ambGain -> masterGain
      ambOsc1.connect(ambFilter);
      ambOsc2.connect(ambFilter);
      ambFilter.connect(ambGain);
      ambGain.connect(masterGain);

      ambLfo.connect(ambLfoGain);
      ambLfoGain.connect(ambFilter.frequency);

      ambOsc1.start();
      ambOsc2.start();
      ambLfo.start();

      // Engine hum: one oscillator filtered and controlled by engineGain
      const engOsc = audioCtx.createOscillator();
      engOsc.type = "triangle";
      engOsc.frequency.setValueAtTime(120, audioCtx.currentTime);
      const engFilter = audioCtx.createBiquadFilter();
      engFilter.type = "lowpass";
      engFilter.frequency.setValueAtTime(900, audioCtx.currentTime);
      const engGain = audioCtx.createGain();
      engGain.gain.setValueAtTime(0.0, audioCtx.currentTime); // start muted
      engOsc.connect(engFilter);
      engFilter.connect(engGain);
      engGain.connect(masterGain);
      engOsc.start();

      ambientNodes = {
        osc1: ambOsc1,
        osc2: ambOsc2,
        lfo: ambLfo,
        filter: ambFilter,
        gain: ambGain,
        gainNodes: ambGainNodes
      };

      engineNodes = {
        osc: engOsc,
        filter: engFilter,
        gain: engGain
      };

      audioEnabled = true;
    } catch (e) {
      console.warn("Audio unavailable:", e);
      audioCtx = null;
      audioEnabled = false;
    }
  }

  function safeStopOscillator(o) {
    try {
      o && o.stop && o.stop();
    } catch (e) {}
  }

  // Play small click/tap for interface
  function playClick() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.connect(g);
      g.connect(masterGain);
      o.start();
      o.stop(t0 + 0.18);
    } catch (e) {
      console.warn("Click sound failed:", e);
    }
  }

  // Success sound: gentle uplifting chord
  function playSuccess() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [660, 880, 1100];
      const nodes = [];
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = i === 2 ? "sine" : "triangle";
        o.frequency.setValueAtTime(f, now);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(successVolume / (i + 1.2), now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8 + i * 0.08);
        // mild highpass for clarity
        const hp = audioCtx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.setValueAtTime(200, now);
        o.connect(hp);
        hp.connect(g);
        g.connect(masterGain);
        o.start();
        o.stop(now + 0.92 + i * 0.08);
        nodes.push({ o, g, hp });
      });
    } catch (e) {
      console.warn("Success sound failed:", e);
    }
  }

  // Failure sound: short buzzer with lowpass
  function playFail() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(220, now);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(failVolume, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
      const f = audioCtx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(600, now);
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      o.start();
      o.stop(now + 0.5);
    } catch (e) {
      console.warn("Failure sound failed:", e);
    }
  }

  // Ambient stop with smooth fade
  function stopAmbientSmooth() {
    if (!audioEnabled || !audioCtx || !ambientNodes || !ambientNodes.gain) return;
    try {
      const now = audioCtx.currentTime;
      ambientNodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      // also fade engine
      if (engineNodes && engineNodes.gain) {
        engineNodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      }
      setTimeout(() => {
        try {
          safeStopOscillator(ambientNodes.osc1);
          safeStopOscillator(ambientNodes.osc2);
          safeStopOscillator(ambientNodes.lfo);
          ambientNodes = null;
          // stop engine oscillator as well
          safeStopOscillator(engineNodes && engineNodes.osc);
          engineNodes = null;
        } catch (e) {}
      }, 700);
    } catch (e) {
      console.warn("Ambient stop error", e);
    }
  }

  // Play a tone helper retained for compatibility but not primarily used
  function playTone(type, frequency, duration = 0.25, volume = 0.12) {
    // Keep backward compatibility; use simple tone
    if (!audioEnabled || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const f = audioCtx.createBiquadFilter();
      o.type = type;
      o.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      g.gain.setValueAtTime(volume, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      f.type = "lowpass";
      f.frequency.setValueAtTime(1200, audioCtx.currentTime);
      o.connect(f);
      f.connect(g);
      g.connect(masterGain);
      o.start();
      o.stop(audioCtx.currentTime + duration + 0.02);
    } catch (e) {
      console.warn("Sound playback failed:", e);
    }
  }

  // UI and Game State
  let state = "start"; // start, playing, win, lose
  let score = 0;
  let wrong = 0;
  let drone = null;
  let balloons = [];
  let currentQuestion = null;
  let keys = {};
  let mouse = { x: WIDTH / 2, y: HEIGHT / 2, down: false };
  let lastTime = 0;
  let animateAudioBars = 0;
  let shakeTimer = 0;

  // Fonts
  const bodyFont = "16px Inter, Arial";
  const importantFont = "20px Inter, Arial";
  const titleFont = "28px Inter, Arial";

  // Drone definition
  function resetDrone() {
    drone = {
      x: WIDTH / 2,
      y: HEIGHT - 140,
      vx: 0,
      vy: 0,
      speed: 220, // pixels per second
      radius: 28,
      propellerAngle: 0
    };
  }

  // Math question generation - keep unchanged logic
  function generateQuestion() {
    const r = Math.random();
    let a, b, op, answer;
    if (r < 0.55) {
      a = randInt(1, 15);
      b = randInt(1, 15);
      op = "+";
      answer = a + b;
    } else if (r < 0.9) {
      a = randInt(5, 20);
      b = randInt(1, Math.min(10, a));
      op = "-";
      answer = a - b;
    } else {
      a = randInt(2, 6);
      b = randInt(2, 6);
      op = "×";
      answer = a * b;
    }
    const choices = new Set();
    choices.add(answer);
    while (choices.size < BALLOON_COUNT) {
      let alt = answer + randInt(-5, 6);
      if (Math.abs(alt - answer) <= 0) alt = answer + randInt(1, 6);
      if (alt < 0) alt = Math.abs(alt) + 1;
      choices.add(alt);
    }
    const choiceArray = shuffle(Array.from(choices));
    const balloonPositions = generateBalloonPositions(choiceArray.length);
    balloons = choiceArray.map((val, i) => ({
      x: balloonPositions[i].x,
      y: balloonPositions[i].y,
      baseY: balloonPositions[i].y,
      vx: randFloat(-20, 20),
      vy: randFloat(-8, 8),
      value: val,
      correct: val === answer,
      wobble: randFloat(0, Math.PI * 2),
      color: pastelColor(i),
      bounce: randFloat(0.6, 1.2),
      floatPhase: randFloat(0, Math.PI * 2)
    }));
    currentQuestion = { a, b, op, answer };
  }

  function generateBalloonPositions(count) {
    const positions = [];
    const margin = 90;
    const usableWidth = WIDTH - 2 * margin;
    for (let i = 0; i < count; i++) {
      const x = margin + (i + 0.5) * (usableWidth / count) + randInt(-26, 26);
      const y = randInt(BALLOON_MIN_Y, BALLOON_MAX_Y);
      positions.push({ x, y });
    }
    return positions;
  }

  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function randFloat(a, b) {
    return Math.random() * (b - a) + a;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function pastelColor(i) {
    const hues = [210, 165, 320, 35, 260, 140];
    const h = hues[i % hues.length];
    return `hsl(${h} 75% 68%)`;
  }

  // Start/reset
  function resetGame() {
    score = 0;
    wrong = 0;
    shakeTimer = 0;
    resetDrone();
    generateQuestion();
    state = "playing";
  }

  // Collision detection remain unchanged
  function checkCollisions() {
    for (const b of balloons) {
      const dx = drone.x - b.x;
      const dy = drone.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const threshold = drone.radius + 28;
      if (dist < threshold) {
        if (b.handled) continue;
        b.handled = true;
        if (b.correct) {
          score += 1;
          // improved success sound
          playSuccess();
          animateAudioBars = Math.min(1, animateAudioBars + 0.5);
          spawnStarsAt(b.x, b.y);
          if (score >= GOAL_SCORE) {
            state = "win";
            stopAmbientSmooth();
          } else {
            setTimeout(() => {
              generateQuestion();
            }, 700);
          }
        } else {
          wrong += 1;
          playFail();
          shakeTimer = 400;
          animateAudioBars = Math.min(1, animateAudioBars + 0.9);
          if (wrong >= MAX_WRONG) {
            state = "lose";
            stopAmbientSmooth();
          } else {
            setTimeout(() => {
              generateQuestion();
            }, 800);
          }
        }
      }
    }
  }

  // Particles: stars and thrust particles
  let particles = [];
  function spawnStarsAt(x, y) {
    for (let i = 0; i < 14; i++) {
      particles.push({
        type: "star",
        x,
        y,
        vx: randFloat(-120, 120),
        vy: randFloat(-280, -90),
        life: randFloat(450, 1100),
        t: 0,
        size: randFloat(6, 12),
        hue: randInt(38, 60)
      });
    }
  }
  function spawnThrustAt(x, y, amount) {
    for (let i = 0; i < Math.min(10, Math.round(amount * 6)); i++) {
      particles.push({
        type: "thrust",
        x,
        y,
        vx: randFloat(-28, 28),
        vy: randFloat(10, 80),
        life: randFloat(220, 520),
        t: 0,
        size: randFloat(3, 6),
        hue: 200 + Math.round(Math.random() * 40)
      });
    }
  }

  // Input handlers
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (state === "start") {
        initAudio()
          .then(() => {
            playClick();
            resetGame();
          })
          .catch(() => {
            resetGame();
          });
      } else if (state === "win" || state === "lose") {
        restartGame();
      }
    } else if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      restartGame();
    } else if (e.key.toLowerCase() === "m") {
      // toggle audio context suspend/resume
      if (!audioCtx) return;
      if (audioEnabled) {
        try {
          audioCtx.suspend();
        } catch (e) {}
        audioEnabled = false;
      } else {
        try {
          audioCtx.resume();
        } catch (e) {}
        audioEnabled = true;
      }
    }
    keys[e.key] = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener("mousedown", (e) => {
    mouse.down = true;
    if (state === "start") {
      initAudio()
        .then(() => {
          playClick();
          resetGame();
        })
        .catch(() => resetGame());
    }
    if (state === "win" || state === "lose") {
      if (endButtonRect && pointInRect(mouse.x, mouse.y, endButtonRect)) {
        restartGame();
      }
    }
    if (state === "playing") {
      for (const b of balloons) {
        if (distance(mouse.x, mouse.y, b.x, b.y) < 36 && !b.handled) {
          // quick-fly to balloon
          drone.x = b.x;
          drone.y = b.y + 24;
          b.handled = false;
          checkCollisions();
        }
      }
    }
  });
  canvas.addEventListener("mouseup", () => {
    mouse.down = false;
  });
  canvas.addEventListener("mouseleave", () => {
    mouse.down = false;
  });

  // Utility
  function distance(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  // End button rect for clicks
  let endButtonRect = null;

  function restartGame() {
    try {
      if (audioEnabled && audioCtx && ambientNodes === null) {
        initAudio().catch(() => {});
      }
    } catch (e) {}
    score = 0;
    wrong = 0;
    shakeTimer = 0;
    resetDrone();
    generateQuestion();
    state = "playing";
  }

  // Update loop
  function update(dt) {
    if (state === "playing") {
      // Input mapping
      const kx = (keys["ArrowRight"] || keys["d"] || keys["D"]) ? 1 : (keys["ArrowLeft"] || keys["a"] || keys["A"]) ? -1 : 0;
      const ky = (keys["ArrowDown"] || keys["s"] || keys["S"]) ? 1 : (keys["ArrowUp"] || keys["w"] || keys["W"]) ? -1 : 0;
      // Mouse influence
      let targetX = drone.x;
      let targetY = drone.y;
      if (mouse.down) {
        targetX = mouse.x;
        targetY = mouse.y;
      } else {
        if (Math.abs(mouse.x - drone.x) < 150) targetX = drone.x + (mouse.x - drone.x) * 0.02;
        if (Math.abs(mouse.y - drone.y) < 150) targetY = drone.y + (mouse.y - drone.y) * 0.02;
      }

      const maxSpeed = drone.speed;
      if (kx !== 0 || ky !== 0) {
        drone.vx = kx * maxSpeed;
        drone.vy = ky * maxSpeed;
      } else {
        drone.vx += (targetX - drone.x) * 2.8 * dt;
        drone.vy += (targetY - drone.y) * 2.8 * dt;
        const max = maxSpeed * 0.92;
        drone.vx = Math.max(-max, Math.min(max, drone.vx));
        drone.vy = Math.max(-max, Math.min(max, drone.vy));
      }

      // Motion integration
      drone.x += drone.vx * dt;
      drone.y += drone.vy * dt;
      drone.x = Math.max(40, Math.min(WIDTH - 40, drone.x));
      drone.y = Math.max(70, Math.min(HEIGHT - 60, drone.y));
      drone.propellerAngle += (Math.abs(drone.vx) + Math.abs(drone.vy)) * 0.015 + 0.12;

      // spawn thrust particles when moving quickly
      const speedNow = Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy);
      const thrustPower = Math.max(0, (speedNow - 20) / maxSpeed);
      if (Math.random() < thrustPower * 0.8 && thrustPower > 0.06) {
        spawnThrustAt(drone.x, drone.y + 18, thrustPower);
      }

      // balloons float & bob
      for (const b of balloons) {
        b.floatPhase += dt * 0.9;
        b.wobble += dt * 2;
        // slow targeting motion for gentle realism
        b.x += Math.sin(b.floatPhase + (b.vx * 0.01)) * 8 * dt + b.vx * dt * 0.4;
        b.y = b.baseY + Math.sin(b.floatPhase) * (10 * b.bounce);
        if (b.x < 60) b.x = 60;
        if (b.x > WIDTH - 60) b.x = WIDTH - 60;
        if (Math.random() < 0.002) b.vx = randFloat(-40, 40);
      }

      // particles update
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += dt * 1000;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === "thrust") {
          p.vx *= 0.99;
          p.vy += 200 * dt;
        } else {
          p.vy += 300 * dt; // gravity
        }
        if (p.t >= p.life) particles.splice(i, 1);
      }

      checkCollisions();
    }

    // shake timer
    if (shakeTimer > 0) {
      shakeTimer = Math.max(0, shakeTimer - dt * 1000);
    }

    // audio bar visual decay
    animateAudioBars = Math.max(0, animateAudioBars - dt * 0.9);

    // engine hum linked to drone speed
    if (audioEnabled && audioCtx && engineNodes && engineNodes.gain) {
      const v = Math.sqrt((drone.vx || 0) ** 2 + (drone.vy || 0) ** 2);
      const norm = Math.min(1, v / (drone.speed * 0.9));
      // smooth ramp
      try {
        const now = audioCtx.currentTime;
        engineNodes.gain.gain.cancelScheduledValues(now);
        engineNodes.gain.gain.setValueAtTime(engineNodes.gain.gain.value, now);
        engineNodes.gain.gain.linearRampToValueAtTime(0.02 + norm * 0.07, now + 0.06);
        // modulate engine filter cutoff slightly with speed
        engineNodes.filter.frequency.setTargetAtTime(600 + norm * 900, now, 0.12);
      } catch (e) {
        // ignore scheduling issues
      }
    }
  }

  // Drawing helpers and visuals
  function draw() {
    ctx.save();
    // optional shake
    if (shakeTimer > 0) {
      const s = Math.sin(shakeTimer / 24) * 10;
      ctx.translate(s, Math.cos(shakeTimer / 30) * 4);
    }
    // background gradient sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    skyGrad.addColorStop(0, "#cfefff");
    skyGrad.addColorStop(0.35, "#eaf7ff");
    skyGrad.addColorStop(1, "#f3fff8");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // sun with soft glow
    drawSun(WIDTH - 120, 80, 44);

    // rolling hills (parallax)
    drawHills();

    // clouds parallax
    drawClouds();

    // ground strip with subtle texture
    drawGround();

    // UI top bars
    drawTopUI();

    // balloons (answer targets), draw behind drone slightly for depth when y?
    // sort by y to create depth (lower y drawn earlier)
    const entities = [...balloons];
    entities.sort((a, b) => a.y - b.y);
    for (const b of entities) {
      drawBalloon(b);
    }

    // draw drone (above balloons)
    drawDrone(drone);

    // particles (thrust and stars)
    drawParticles();

    // play hint instruction
    if (state === "playing" && currentQuestion) {
      drawInstruction("Fly to the balloon showing the correct answer", WIDTH / 2, HEIGHT - 24);
    }

    // overlays
    if (state === "start") drawStartScreen();
    else if (state === "win") drawEndScreen(true);
    else if (state === "lose") drawEndScreen(false);

    ctx.restore();
  }

  function drawSun(x, y, r) {
    const grad = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.4);
    grad.addColorStop(0, "rgba(255,235,140,0.95)");
    grad.addColorStop(0.5, "rgba(255,210,80,0.55)");
    grad.addColorStop(1, "rgba(255,210,80,0.08)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#fff7c9";
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHills() {
    // two layered hills
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#bfe6d3";
    ctx.moveTo(0, HEIGHT - 80);
    ctx.quadraticCurveTo(120, HEIGHT - 140, 320, HEIGHT - 90);
    ctx.quadraticCurveTo(460, HEIGHT - 40, WIDTH, HEIGHT - 86);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "#dff7e8";
    ctx.moveTo(0, HEIGHT - 60);
    ctx.quadraticCurveTo(160, HEIGHT - 120, 360, HEIGHT - 70);
    ctx.quadraticCurveTo(520, HEIGHT - 28, WIDTH, HEIGHT - 66);
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.lineTo(0, HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawClouds() {
    const clouds = [
      { x: 80, y: 60, s: 46, hue: 200, offset: 0.1 },
      { x: 240, y: 42, s: 62, hue: 184, offset: -0.05 },
      { x: 430, y: 72, s: 36, hue: 215, offset: 0.06 },
      { x: 600, y: 54, s: 48, hue: 198, offset: -0.02 }
    ];
    for (const c of clouds) {
      drawSoftCloud(c.x + Math.sin((Date.now() / 1200) + c.offset) * 8, c.y, c.s, c.hue);
    }
  }

  function drawSoftCloud(x, y, size, hue) {
    ctx.save();
    ctx.translate(x, y);
    // multiple overlapping circles
    for (let i = 0; i < 6; i++) {
      const alpha = 0.96 - i * 0.08;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${hue}, 70%, ${84 - i * 2}%, ${alpha})`;
      const rx = Math.cos(i * 1.3) * (size * 0.35);
      const ry = Math.sin(i * 0.7) * (size * 0.18);
      ctx.arc(rx, ry, size - i * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGround() {
    // simple ground with a darker top edge and subtle grass strokes
    ctx.fillStyle = "#d9f0e4";
    ctx.fillRect(0, HEIGHT - 60, WIDTH, 60);
    ctx.fillStyle = "#bfe8d6";
    ctx.fillRect(0, HEIGHT - 60, WIDTH, 12);

    // subtle texture
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#2b5b3a";
    for (let i = 20; i < WIDTH; i += 24) {
      ctx.fillRect(i, HEIGHT - 46 + ((i % 48) / 12), 6, 2);
    }
    ctx.restore();
  }

  function drawTopUI() {
    // Score box
    ctx.font = importantFont;
    ctx.textBaseline = "middle";
    const scoreText = `Score: ${score}/${GOAL_SCORE}`;
    const scoreW = ctx.measureText(scoreText).width;
    const scoreBoxW = scoreW + PADDING * 2;
    const scoreBoxH = 36;
    const scoreX = PADDING;
    const scoreY = PADDING;
    roundRect(ctx, scoreX, scoreY, scoreBoxW, scoreBoxH, 8, "rgba(255,255,255,0.94)", "rgba(0,0,0,0.06)");
    ctx.fillStyle = "#12313d";
    ctx.fillText(scoreText, scoreX + PADDING, scoreY + scoreBoxH / 2 + 1);

    // Audio bars next to score
    const speakerX = scoreX + scoreBoxW + 14;
    const speakerY = scoreY + scoreBoxH / 2;
    drawSpeakerIcon(speakerX, speakerY, 18, animateAudioBars);

    // Lives box
    const livesText = `Lives: ${Math.max(0, MAX_WRONG - wrong)}`;
    const livesW = ctx.measureText(livesText).width;
    const livesBoxW = livesW + PADDING * 2;
    const livesBoxH = 36;
    const livesX = WIDTH - livesBoxW - PADDING;
    const livesY = PADDING;
    roundRect(ctx, livesX, livesY, livesBoxW, livesBoxH, 8, "rgba(255,248,248,0.98)", "rgba(0,0,0,0.06)");
    ctx.fillStyle = "#4f2d2d";
    ctx.fillText(livesText, livesX + PADDING, livesY + livesBoxH / 2 + 1);

    // Question centered
    ctx.font = titleFont;
    const qText = currentQuestion ? `${currentQuestion.a} ${currentQuestion.op} ${currentQuestion.b} = ?` : "Ready?";
    const qW = ctx.measureText(qText).width;
    const qBoxW = qW + PADDING * 2 + 8;
    const qBoxH = 48;
    const qX = Math.round((WIDTH - qBoxW) / 2);
    const qY = PADDING;
    roundRect(ctx, qX, qY, qBoxW, qBoxH, 10, "rgba(255,255,255,0.96)", "rgba(0,0,0,0.06)");
    ctx.fillStyle = "#0f3b4a";
    ctx.fillText(qText, qX + PADDING + 4, qY + qBoxH / 2 + 2);
  }

  function drawSpeakerIcon(x, y, size, level) {
    ctx.save();
    ctx.translate(x, y);
    // body
    ctx.fillStyle = "#2a4b58";
    roundRectPath(ctx, -8, -8, 12, 16, 3);
    ctx.fill();
    // cone
    ctx.beginPath();
    ctx.moveTo(4, -8);
    ctx.lineTo(10, -4);
    ctx.lineTo(10, 4);
    ctx.lineTo(4, 8);
    ctx.closePath();
    ctx.fill();
    // animated bars
    const barCount = 3;
    for (let i = 0; i < barCount; i++) {
      const rnd = 0.5 + Math.random() * 0.5;
      const h = 6 + level * 16 * (i + 1) * rnd;
      ctx.fillStyle = `rgba(34,130,160,${0.4 + i * 0.18})`;
      ctx.fillRect(12 + i * 6, -h / 2, 4, h);
    }
    ctx.restore();
  }

  function drawBalloon(b) {
    ctx.save();
    const wob = Math.sin(b.wobble * 1.5) * 6;
    const bx = b.x;
    const by = b.y;
    // shadow under balloon
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.ellipse(bx + wob * 0.2, by + 34, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // balloon gradient
    const grad = ctx.createLinearGradient(bx - 20, by - 24, bx + 20, by + 20);
    grad.addColorStop(0, shadeColor(b.color, 8));
    grad.addColorStop(0.6, b.color);
    grad.addColorStop(1, shadeColor(b.color, -6));
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1.6;
    ctx.ellipse(bx + wob, by, 30, 36, Math.sin(b.wobble) * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // glossy highlight
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.ellipse(bx - 10 + wob, by - 12, 10, 14, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // cute face for correct balloon as subtle encouragement
    if (b.correct) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(32,64,72,0.9)";
      ctx.arc(bx - 6 + wob, by - 6, 2.8, 0, Math.PI * 2);
      ctx.arc(bx + 4 + wob, by - 6, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(32,64,72,0.9)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(bx - 1 + wob, by - 0, 5, 0, Math.PI);
      ctx.stroke();
    }

    // string curve
    ctx.beginPath();
    ctx.strokeStyle = "rgba(80,80,80,0.16)";
    ctx.lineWidth = 1.8;
    ctx.moveTo(bx + wob, by + 30);
    ctx.quadraticCurveTo(bx + wob + 8, by + 46, bx + wob - 6, by + 56);
    ctx.stroke();

    // label behind value
    ctx.font = bodyFont;
    ctx.textBaseline = "middle";
    const text = String(b.value);
    const tw = ctx.measureText(text).width;
    const bw = tw + 16;
    const bh = 28;
    const bxbox = bx - bw / 2 + wob;
    const bybox = by + 44;
    roundRect(ctx, bxbox, bybox, bw, bh, 8, "rgba(255,255,255,0.98)", "rgba(0,0,0,0.06)");
    ctx.fillStyle = "#153642";
    ctx.fillText(text, bxbox + 8, bybox + bh / 2 + 1);

    ctx.restore();
  }

  function drawDrone(d) {
    if (!d) return;
    ctx.save();
    ctx.translate(d.x, d.y);

    // soft shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.ellipse(0, 36, 44, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // body base
    ctx.beginPath();
    ctx.fillStyle = "#ffb86b";
    ctx.strokeStyle = "#b07533";
    ctx.lineWidth = 2;
    ctx.ellipse(0, 0, 52, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // window glass
    const grad = ctx.createLinearGradient(-24, -14, 8, 8);
    grad.addColorStop(0, "#e7fbff");
    grad.addColorStop(1, "#bfefff");
    ctx.beginPath();
    ctx.fillStyle = grad;
    ctx.ellipse(-6, -4, 20, 14, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.stroke();

    // legs
    ctx.beginPath();
    ctx.strokeStyle = "#6b4c35";
    ctx.lineWidth = 3;
    ctx.moveTo(-28, 18);
    ctx.lineTo(-16, 30);
    ctx.moveTo(28, 18);
    ctx.lineTo(16, 30);
    ctx.stroke();

    // propellers with motion blur illusion
    for (let i = -1; i <= 1; i += 2) {
      const px = i * 36;
      const py = -12;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(d.propellerAngle * (i * -1));
      // hub
      ctx.beginPath();
      ctx.fillStyle = "#5c5c5c";
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      // blades - draw multiple translucent blades to suggest blur
      for (let b = 0; b < 3; b++) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(90,90,90,${0.28 - b * 0.08})`;
        ctx.ellipse(0, -12 + b * 3, 6 + b, 24 + b * 8, 0.6 + b * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // friendly face
    ctx.beginPath();
    ctx.fillStyle = "#1f5968";
    ctx.arc(-12, -6, 3, 0, Math.PI * 2);
    ctx.arc(-4, -6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = "#1f5968";
    ctx.lineWidth = 1.4;
    ctx.arc(-8, -2, 4.5, 0, Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.08, 1 - p.t / p.life);
      if (p.type === "thrust") {
        // soft glowing circle
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
        g.addColorStop(0, `hsla(${p.hue},82%,60%,0.9)`);
        g.addColorStop(0.6, `hsla(${p.hue},82%,60%,0.25)`);
        g.addColorStop(1, `hsla(${p.hue},82%,60%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.max(0.12, 1 - p.t / p.life);
        ctx.fillStyle = `hsl(${p.hue} 95% 60%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // star
        ctx.fillStyle = `hsl(${p.hue} 78% 60%)`;
        drawStar(ctx, p.x, p.y, 5, p.size * 0.4, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  function drawInstruction(text, x, y) {
    ctx.font = bodyFont;
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    const bw = tw + PADDING * 2;
    const bh = 34;
    const bx = x - bw / 2;
    const by = y - bh / 2;
    roundRect(ctx, bx, by, bw, bh, 8, "rgba(255,255,255,0.95)", "rgba(0,0,0,0.05)");
    ctx.fillStyle = "#153642";
    ctx.fillText(text, bx + PADDING, by + bh / 2 + 1);
  }

  function drawStartScreen() {
    ctx.save();
    ctx.fillStyle = "rgba(6,28,46,0.46)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const title = "Drone Math Adventure!";
    const subtitle = "Help your drone pick the right answers.";
    const prompt = "Click or press Space to start (sound optional).";
    ctx.font = "34px Inter, Arial";
    ctx.fillStyle = "#fff";
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, (WIDTH - tw) / 2, HEIGHT / 2 - 56);
    ctx.font = importantFont;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    const tw2 = ctx.measureText(subtitle).width;
    ctx.fillText(subtitle, (WIDTH - tw2) / 2, HEIGHT / 2 - 18);
    ctx.font = bodyFont;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const tw3 = ctx.measureText(prompt).width;
    ctx.fillText(prompt, (WIDTH - tw3) / 2, HEIGHT / 2 + 18);
    // accessibility hint
    ctx.font = "14px Inter, Arial";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const hint = "Controls: Arrow keys / WASD or drag. M to mute/unmute. R to restart.";
    const hintW = ctx.measureText(hint).width;
    ctx.fillText(hint, (WIDTH - hintW) / 2, HEIGHT / 2 + 52);
    ctx.restore();
  }

  function drawEndScreen(won) {
    ctx.fillStyle = "rgba(6,28,46,0.42)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    const title = won ? "You Win! Well Done!" : "Game Over";
    const message = won ? `You collected ${score} correct answers.` : `You made ${wrong} wrong answers. Try again!`;
    ctx.font = titleFont;
    ctx.fillStyle = "#fff";
    const titleW = ctx.measureText(title).width;
    ctx.fillText(title, (WIDTH - titleW) / 2, HEIGHT / 2 - 40);
    ctx.font = importantFont;
    const msgW = ctx.measureText(message).width;
    ctx.fillText(message, (WIDTH - msgW) / 2, HEIGHT / 2 - 6);

    // Restart button
    const btnText = "Restart (R)";
    ctx.font = importantFont;
    const btnW = ctx.measureText(btnText).width + PADDING * 2;
    const btnH = 44;
    const bx = (WIDTH - btnW) / 2;
    const by = HEIGHT / 2 + 20;
    roundRect(ctx, bx, by, btnW, btnH, 10, "#ffffff", "rgba(0,0,0,0.12)");
    ctx.fillStyle = "#15384a";
    ctx.fillText(btnText, bx + PADDING, by + btnH / 2 + 2);
    endButtonRect = { x: bx, y: by, w: btnW, h: btnH };

    ctx.font = bodyFont;
    const extra = "Press Space or click Restart to play again.";
    const ew = ctx.measureText(extra).width;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(extra, (WIDTH - ew) / 2, by + btnH + 30);

    ctx.restore();
  }

  // Helper visual functions
  function roundRect(ctx, x, y, w, h, r, fillColor = "#fff", strokeStyle = null) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    }
    ctx.restore();
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStar(ctx, x, y, points, innerR, outerR) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = (i % 2 === 0) ? outerR : innerR;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawSpeakerIconRect(x, y, w, h) {
    ctx.save();
    roundRect(ctx, x, y, w, h, 6, "#fff", "rgba(0,0,0,0.08)");
    ctx.restore();
  }

  // small utility to shade HSL string or compute darker/lighter variants
  function shadeColor(hsl, percent) {
    // expected input hsl like "hsl(H S% L%)"
    try {
      const match = hsl.match(/hsl\((\d+)\s*(\d+)%\s*(\d+)%\)/);
      if (!match) return hsl;
      let h = +match[1];
      let s = +match[2];
      let l = +match[3];
      l = Math.max(8, Math.min(92, l + percent));
      return `hsl(${h} ${s}% ${l}%)`;
    } catch (e) {
      return hsl;
    }
  }

  // Main loop
  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = Math.min(35, ts - lastTime) / 1000;
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Start
  resetDrone();
  // initial draw loop
  requestAnimationFrame(loop);

  // Inform about audio availability if blocked
  setTimeout(() => {
    if (!audioEnabled && state === "start") {
      console.info("Audio is disabled or blocked. The game remains fully playable without sound.");
    }
  }, 900);

  // Preserve previously used names and behavior for compatibility with original logic
  // (Game math and completion logic unchanged)

})();