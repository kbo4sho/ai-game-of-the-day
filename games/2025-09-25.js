(function () {
  // Enhanced Machine Math — Visual & Audio polish only
  // Renders inside element with id "game-of-the-day-stage"
  // All visuals drawn with canvas. Sounds made with Web Audio API oscillators.
  // Keyboard: ← → move, Space pick/drop, Enter submit, M mute, R reset level
  // Accessible live text updates added for screen readers.

  // Constants
  const WIDTH = 720;
  const HEIGHT = 480;
  const STAGE_ID = "game-of-the-day-stage";
  const MAX_LEVEL = 6;
  const NUM_BUBBLES = 5;
  const SLOT_COUNT = 3;

  // Colors and styling (softer, friendlier palette)
  const COLORS = {
    bgTop: "#EAF6FF",
    bgBottom: "#F6FBFF",
    machine: "#DFF1F9",
    accent: "#7FD3FF",
    gear: "#C9EAF6",
    text: "#13303A",
    bubbleOuter: "#FFEDD5",
    bubbleInner: "#FFF6EA",
    bubbleText: "#2E3A35",
    robotBody: "#E6F8E9",
    slotEmpty: "#F3F6F7",
    slotFilled: "#FFF0F3",
    good: "#29B573",
    bad: "#E05252",
    speakerOn: "#13303A",
    speakerOff: "#9AA6AA",
    softShadow: "rgba(18,34,40,0.08)",
    glow: "rgba(127,176,201,0.18)"
  };

  // Helper utilities
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function safeAudioContext() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      return new Ctx();
    } catch (e) {
      return null;
    }
  }

  // Get stage element
  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error("Game stage element not found:", STAGE_ID);
    return;
  }

  // Create an offscreen live region for screen readers inside the stage element
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("role", "status");
  // Visually hide but keep accessible
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  liveRegion.style.top = "auto";
  stage.appendChild(liveRegion);

  // Create canvas exactly 720x480
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Machine Math game. Move robot with left and right arrow keys, pick up numbers with space, submit with Enter. Press M to mute sound."
  );
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Game state
  let state = {
    level: 1,
    target: 0,
    bubbles: [], // {x,y,val,visible}
    slots: new Array(SLOT_COUNT).fill(null), // each holds a number or null
    robot: { x: WIDTH / 2, y: HEIGHT - 70, speed: 6, holding: null, blinkTimer: 0 },
    score: 0,
    message: "Welcome! Press Space to pick up a number.",
    messageTimer: 0,
    audioEnabled: false,
    audioAvailable: true,
    muted: false,
    bgAmbient: null, // ambient nodes
    soundContext: null,
    awaitingUserGesture: true,
    levelSolved: false,
    particles: [] // for visual feedback (bubbles, confetti)
  };

  // Audio utilities and sounds (improved)
  function initAudio() {
    if (state.soundContext) return;
    try {
      const ctxAudio = safeAudioContext();
      if (!ctxAudio) {
        state.audioAvailable = false;
        console.warn("Web Audio API not available.");
        liveAnnounce("Audio is not available in your browser.");
        return;
      }
      state.soundContext = ctxAudio;

      // Create a gentle ambient pad: two oscillators through a lowpass with slow gain LFO
      try {
        const ac = ctxAudio;

        const master = ac.createGain();
        master.gain.value = 0.0008; // very gentle by default
        master.connect(ac.destination);

        const osc1 = ac.createOscillator();
        osc1.type = "sine";
        osc1.frequency.value = 110;

        const osc2 = ac.createOscillator();
        osc2.type = "triangle";
        osc2.frequency.value = 220;

        const combGain = ac.createGain();
        combGain.gain.value = 0.5;

        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1200;

        // subtle amplitude LFO for breathe effect
        const lfo = ac.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.12; // slow breathe

        const lfoGain = ac.createGain();
        lfoGain.gain.value = 0.0006; // small modulation depth

        osc1.connect(combGain);
        osc2.connect(combGain);
        combGain.connect(filter);
        filter.connect(master);

        lfo.connect(lfoGain);
        lfoGain.connect(master.gain);

        osc1.start();
        osc2.start();
        lfo.start();

        state.bgAmbient = {
          master,
          osc1,
          osc2,
          filter,
          lfo,
          lfoGain,
          combGain
        };
        state.audioAvailable = true;
        // Respect mute state: if muted, keep nodes running but gain near zero
        if (state.muted) {
          master.gain.value = 0.00001;
        }
      } catch (err) {
        console.warn("Ambient audio setup failed:", err);
      }
    } catch (err) {
      state.audioAvailable = false;
      console.warn("Failed to initialize audio:", err);
      liveAnnounce("Audio initialization failed.");
    }
  }

  function resumeAudioOnUserGesture() {
    if (!state.soundContext) return;
    const ctx = state.soundContext;
    if (ctx.state === "suspended") {
      ctx.resume()
        .then(() => {
          state.awaitingUserGesture = false;
          state.audioEnabled = !state.muted;
          // if muted keep ambient quiet
          if (state.bgAmbient) {
            try {
              state.bgAmbient.master.gain.value = state.muted ? 0.00001 : 0.0008;
            } catch (e) {}
          }
        })
        .catch((err) => {
          console.warn("Audio resume failed:", err);
        });
    } else {
      // ensure ambient gain reflects mute
      if (state.bgAmbient) {
        try {
          state.bgAmbient.master.gain.value = state.muted ? 0.00001 : 0.0008;
        } catch (e) {}
      }
    }
  }

  function stopAllSounds() {
    if (!state.soundContext) return;
    try {
      const ac = state.soundContext;
      if (state.bgAmbient) {
        try {
          ["osc1", "osc2", "lfo"].forEach((k) => {
            if (state.bgAmbient[k] && state.bgAmbient[k].stop) {
              try {
                state.bgAmbient[k].stop();
              } catch (e) {}
              try {
                state.bgAmbient[k].disconnect();
              } catch (e) {}
            }
          });
          ["combGain", "filter", "master", "lfoGain"].forEach((k) => {
            try {
              if (state.bgAmbient[k]) state.bgAmbient[k].disconnect();
            } catch (e) {}
          });
        } catch (e) {
          console.warn("Error stopping ambient:", e);
        }
      }
    } catch (e) {
      console.warn("Error stopping sounds:", e);
    }
    state.bgAmbient = null;
    // Close context if possible
    if (state.soundContext && state.soundContext.close) {
      state.soundContext.close().catch(() => {});
    }
    state.soundContext = null;
  }

  // Play a short synthesized voice-like pluck (used for pick/drop)
  function playPluck(freq = 440, type = "sine", volume = 0.06, duration = 0.12) {
    if (!state.audioAvailable || state.muted) return;
    if (!state.soundContext) return;
    try {
      const ac = state.soundContext;
      const now = ac.currentTime;
      const master = ac.createGain();
      master.gain.value = volume;
      const env = ac.createGain();
      env.gain.value = 0.0001;
      env.connect(master);
      master.connect(ac.destination);

      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;

      const filter = ac.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 160;

      osc.connect(filter);
      filter.connect(env);

      // envelope
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(1.0, now + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.start(now);
      osc.stop(now + duration + 0.02);

      // cleanup
      setTimeout(() => {
        try {
          env.disconnect();
        } catch (e) {}
        try {
          master.disconnect();
        } catch (e) {}
      }, (duration + 0.2) * 1000);
    } catch (err) {
      console.warn("playPluck error:", err);
    }
  }

  // melodic positive feedback
  function playCorrect() {
    if (!state.audioAvailable || state.muted) return;
    if (!state.soundContext) return;
    try {
      const ac = state.soundContext;
      const now = ac.currentTime;
      const master = ac.createGain();
      master.gain.value = 0.06;
      master.connect(ac.destination);

      const freqs = [440, 550, 660, 880];
      freqs.forEach((f, i) => {
        const osc = ac.createOscillator();
        osc.type = i % 2 === 0 ? "sine" : "triangle";
        osc.frequency.value = f;
        const g = ac.createGain();
        g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(1.0, now + 0.02 + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22 + i * 0.05);
        osc.connect(g).connect(master);
        osc.start(now + i * 0.05);
        osc.stop(now + 0.26 + i * 0.05);
      });

      setTimeout(() => {
        try {
          master.disconnect();
        } catch (e) {}
      }, 1000);
    } catch (err) {
      console.warn("playCorrect error:", err);
    }
  }

  // softer incorrect sound (polite nudge)
  function playIncorrect() {
    if (!state.audioAvailable || state.muted) return;
    if (!state.soundContext) return;
    try {
      const ac = state.soundContext;
      const now = ac.currentTime;
      const master = ac.createGain();
      master.gain.value = 0.05;
      master.connect(ac.destination);

      const osc = ac.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 160;
      const filt = ac.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(900, now);
      osc.connect(filt).connect(master);

      const g = ac.createGain();
      g.gain.value = 0.0001;
      filt.connect(g);
      g.connect(master);

      g.gain.exponentialRampToValueAtTime(1.0, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      osc.start(now);
      osc.stop(now + 0.3);

      setTimeout(() => {
        try {
          master.disconnect();
        } catch (e) {}
      }, 600);
    } catch (err) {
      console.warn("playIncorrect error:", err);
    }
  }

  function playPick() {
    playPluck(660, "sine", 0.045, 0.09);
  }

  function playDrop() {
    playPluck(330, "triangle", 0.045, 0.1);
  }

  // Accessibility live announcements
  function liveAnnounce(text) {
    if (!liveRegion) return;
    liveRegion.textContent = "";
    // Short timeout to ensure SR reads new text
    setTimeout(() => (liveRegion.textContent = text), 50);
  }

  // Level generation ensuring solvability (unchanged)
  function generateLevel(level) {
    const bubbles = [];
    const subsetSize = Math.min(1 + (level % 3), SLOT_COUNT); // 1 to 3
    const baseNumbers = [];
    for (let i = 0; i < subsetSize; i++) {
      baseNumbers.push(randInt(1 + level, 4 + level + 4));
    }
    const target = baseNumbers.reduce((a, b) => a + b, 0);

    while (baseNumbers.length < NUM_BUBBLES) {
      const candidate = randInt(1, Math.max(6, 6 + level));
      baseNumbers.push(candidate);
    }

    for (let i = 0; i < NUM_BUBBLES; i++) {
      const val = baseNumbers[i];
      const x = 120 + (i % 3) * 90 + randInt(-6, 6);
      const y = 110 + Math.floor(i / 3) * 80 + randInt(-6, 6);
      bubbles.push({
        x,
        y,
        val,
        visible: true,
        id: i,
        floatOffset: Math.random() * Math.PI * 2,
        pulse: Math.random() * 0.6 + 0.6
      });
    }

    return { target, bubbles };
  }

  // Initialize or reset the level
  function startLevel(levelNumber) {
    const lvl = clamp(levelNumber, 1, MAX_LEVEL);
    state.level = lvl;
    state.slots = new Array(SLOT_COUNT).fill(null);
    state.robot.holding = null;
    state.levelSolved = false;
    state.particles = [];
    const lvlData = generateLevel(lvl);
    state.target = lvlData.target;
    state.bubbles = lvlData.bubbles;
    state.message = `Level ${lvl} — Make the machine equal ${state.target}.`;
    state.messageTimer = 300; // frames
    liveAnnounce(
      `Level ${lvl}. Target number ${state.target}. Use arrows to move robot and space to pick up numbers.`
    );
  }

  // Check if subset of slots sums to target (unchanged)
  function checkSolution() {
    const sum = state.slots.reduce((acc, s) => acc + (s === null ? 0 : s), 0);
    if (sum === state.target) {
      state.score += 10 * state.level;
      state.levelSolved = true;
      state.message = "Correct! Machine is happy.";
      state.messageTimer = 240;
      // particle celebration
      spawnParticles(WIDTH - 200, HEIGHT / 2, 16, "good");
      playCorrect();
      liveAnnounce(`Correct! You solved level ${state.level}.`);
      setTimeout(() => {
        if (state.level < MAX_LEVEL) {
          startLevel(state.level + 1);
        } else {
          state.message = "You finished all levels! Great job!";
          liveAnnounce("Congratulations! You finished all levels!");
        }
      }, 1400);
    } else {
      state.message = `Not quite. Current sum ${sum}, target ${state.target}. Try again.`;
      state.messageTimer = 240;
      playIncorrect();
      spawnParticles(WIDTH - 200, HEIGHT / 2, 8, "bad");
      liveAnnounce(`Try again. Current sum ${sum}, target ${state.target}.`);
      state.slots.forEach((s, idx) => {
        if (s !== null) {
          const bubble = state.bubbles.find((b) => b.val === s && !b.visible);
          if (bubble) {
            bubble.visible = true;
          } else {
            state.bubbles.push({
              x: 120 + (idx * 60) % 240,
              y: 240,
              val: s,
              visible: true,
              id: Date.now() + idx,
              floatOffset: 0,
              pulse: 1
            });
          }
        }
      });
      state.slots = new Array(SLOT_COUNT).fill(null);
      state.robot.holding = null;
    }
  }

  // Robot picks up the nearest visible bubble within range (unchanged)
  function robotPickOrDrop() {
    const r = state.robot;
    if (r.holding === null) {
      let nearest = null;
      let nearestDist = 9999;
      for (const b of state.bubbles) {
        if (!b.visible) continue;
        const dx = b.x - r.x;
        const dy = b.y - r.y;
        const d = Math.hypot(dx, dy);
        if (d < nearestDist && d < 60) {
          nearestDist = d;
          nearest = b;
        }
      }
      if (nearest) {
        r.holding = { val: nearest.val, id: nearest.id };
        nearest.visible = false;
        state.message = `Picked up ${r.holding.val}.`;
        state.messageTimer = 140;
        playPick();
        liveAnnounce(`Picked up ${r.holding.val}.`);
      } else {
        state.message = "No number close enough to pick. Move closer.";
        state.messageTimer = 120;
      }
    } else {
      const machineX = WIDTH - 220;
      const machineY = HEIGHT / 2;
      const dx = r.x - machineX;
      const dy = r.y - machineY;
      const d = Math.hypot(dx, dy);
      if (d < 120) {
        let placed = false;
        for (let i = 0; i < SLOT_COUNT; i++) {
          if (state.slots[i] === null) {
            state.slots[i] = r.holding.val;
            r.holding = null;
            state.message = "Dropped into machine.";
            state.messageTimer = 120;
            playDrop();
            liveAnnounce("Dropped number into machine.");
            placed = true;
            break;
          }
        }
        if (!placed) {
          state.message = "All machine slots are full. Press Enter to check or remove a number.";
          state.messageTimer = 160;
        }
      } else {
        const droppedBack = {
          x: r.x + randInt(-20, 20),
          y: r.y + randInt(-20, 20),
          val: r.holding.val,
          visible: true,
          id: Date.now()
        };
        state.bubbles.push(droppedBack);
        r.holding = null;
        playDrop();
        state.message = "Dropped the number back.";
        state.messageTimer = 120;
      }
    }
  }

  // Remove a filled slot (unchanged)
  function robotPickupFromSlot() {
    const r = state.robot;
    const machineX = WIDTH - 220;
    const machineY = HEIGHT / 2;
    const dx = r.x - machineX;
    const dy = r.y - machineY;
    const d = Math.hypot(dx, dy);
    if (d < 120 && r.holding === null) {
      for (let i = SLOT_COUNT - 1; i >= 0; i--) {
        if (state.slots[i] !== null) {
          r.holding = { val: state.slots[i], fromSlot: i };
          state.slots[i] = null;
          playPick();
          state.message = `Picked up ${r.holding.val} from slot ${i + 1}.`;
          state.messageTimer = 140;
          liveAnnounce(`Picked up ${r.holding.val} from slot ${i + 1}.`);
          return true;
        }
      }
      state.message = "No numbers in machine to pick up.";
      state.messageTimer = 120;
      return false;
    }
    return false;
  }

  // Keyboard and mouse controls (unchanged)
  const keys = {};
  window.addEventListener("keydown", (e) => {
    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === " " ||
      e.key === "Enter" ||
      e.key === "m" ||
      e.key === "M" ||
      e.key === "r" ||
      e.key === "R"
    ) {
      e.preventDefault();
    }
    keys[e.key] = true;

    if (state.awaitingUserGesture) {
      initAudio();
      resumeAudioOnUserGesture();
      state.awaitingUserGesture = false;
    }

    if (e.key === "m" || e.key === "M") {
      state.muted = !state.muted;
      if (state.bgAmbient && state.bgAmbient.master) {
        try {
          state.bgAmbient.master.gain.value = state.muted ? 0.00001 : 0.0008;
        } catch (e) {}
      }
      liveAnnounce(state.muted ? "Audio muted." : "Audio unmuted.");
    }
    if (e.key === "r" || e.key === "R") {
      startLevel(state.level);
      liveAnnounce(`Level ${state.level} restarted.`);
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
  });

  // Allow clicking/tapping to pick/drop
  canvas.addEventListener("click", (ev) => {
    if (state.awaitingUserGesture) {
      initAudio();
      resumeAudioOnUserGesture();
      state.awaitingUserGesture = false;
      liveAnnounce("Audio enabled.");
    }
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    if (cx < 46 && cy < 46) {
      state.muted = !state.muted;
      if (state.bgAmbient && state.bgAmbient.master) {
        try {
          state.bgAmbient.master.gain.value = state.muted ? 0.00001 : 0.0008;
        } catch (e) {}
      }
      liveAnnounce(state.muted ? "Audio muted." : "Audio unmuted.");
      return;
    }
    const r = state.robot;
    const dx = cx - r.x;
    const dy = cy - r.y;
    if (Math.hypot(dx, dy) < 80) {
      if (state.robot.holding !== null) {
        robotPickOrDrop();
      } else {
        const machineX = WIDTH - 220;
        const machineY = HEIGHT / 2;
        const d2 = Math.hypot(cx - machineX, cy - machineY);
        if (d2 < 120) {
          robotPickupFromSlot();
        } else {
          robotPickOrDrop();
        }
      }
      return;
    }
    let picked = false;
    for (const b of state.bubbles) {
      if (b.visible) {
        const dbx = cx - b.x;
        const dby = cy - b.y;
        if (Math.hypot(dbx, dby) < 28) {
          state.robot.x = clamp(b.x, 40, WIDTH - 40);
          state.robot.y = clamp(b.y + 40, HEIGHT - 120, HEIGHT - 40);
          if (!state.robot.holding) {
            state.robot.holding = { val: b.val, id: b.id };
            b.visible = false;
            state.message = `Picked up ${b.val}.`;
            state.messageTimer = 120;
            playPick();
            // gentle spark particle
            spawnParticles(b.x, b.y, 6, "neutral");
            liveAnnounce(`Picked up ${b.val}.`);
          }
          picked = true;
          break;
        }
      }
    }
    if (!picked) {
      const machineX = WIDTH - 220;
      const machineY = HEIGHT / 2;
      if (Math.hypot(cx - machineX, cy - machineY) < 140) {
        robotPickupFromSlot();
      }
    }
  });

  // Particle system (visual feedback)
  function spawnParticles(x, y, count = 8, kind = "neutral") {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 0.6;
      const life = Math.random() * 40 + 40;
      const color = kind === "good" ? COLORS.good : kind === "bad" ? COLORS.bad : "#FFCC66";
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life,
        maxLife: life,
        color,
        radius: Math.random() * 3 + 2
      });
    }
  }

  // Main update loop (adds particle and animation updates)
  function update() {
    // Movement
    if (keys["ArrowLeft"]) {
      state.robot.x -= state.robot.speed;
      if (state.robot.x < 40) state.robot.x = 40;
    }
    if (keys["ArrowRight"]) {
      state.robot.x += state.robot.speed;
      if (state.robot.x > WIDTH - 40) state.robot.x = WIDTH - 40;
    }

    // Pick/drop with space
    if (keys[" "]) {
      if (!state._spaceHeld) {
        const machineX = WIDTH - 220;
        const machineY = HEIGHT / 2;
        const d = Math.hypot(state.robot.x - machineX, state.robot.y - machineY);
        if (d < 120 && state.robot.holding === null) {
          robotPickupFromSlot();
        } else {
          robotPickOrDrop();
        }
        state._spaceHeld = true;
      }
    } else {
      state._spaceHeld = false;
    }

    // Submit with Enter
    if (keys["Enter"]) {
      if (!state._enterHeld) {
        checkSolution();
        state._enterHeld = true;
      }
    } else {
      state._enterHeld = false;
    }

    // Update bubble floatiness and gentle pulse
    const now = Date.now();
    for (const b of state.bubbles) {
      if (!b.visible) continue;
      b.floatOffset += 0.002;
      b.y += Math.sin(now / 600 + b.floatOffset) * 0.16;
      b.x += Math.cos(now / 900 + b.floatOffset * 0.7) * 0.06;
      b.pulse = 0.95 + 0.06 * Math.sin(now / 220 + b.floatOffset);
    }

    // robot blink timer and bob
    if (!state.robot.blinkTimer || state.robot.blinkTimer <= 0) {
      if (Math.random() < 0.008) state.robot.blinkTimer = 8 + Math.floor(Math.random() * 8);
    } else {
      state.robot.blinkTimer--;
    }

    // particle updates
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.vy += 0.06; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.radius *= 0.995;
      if (p.life <= 0 || p.radius < 0.3) {
        state.particles.splice(i, 1);
      }
    }

    // message timer decay
    if (state.messageTimer > 0) {
      state.messageTimer--;
      if (state.messageTimer === 0) {
        state.message = "";
      }
    }
  }

  // Drawing functions (enhanced visuals)
  function drawBackground() {
    // gentle vertical gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // soft, subtle cloud shapes for depth (canvas-only)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#ffffff";
    drawCloud(120, 60, 80);
    drawCloud(300, 90, 60);
    drawCloud(460, 50, 72);
    ctx.restore();

    // ground
    ctx.save();
    ctx.fillStyle = "#F1FAFC";
    ctx.fillRect(0, HEIGHT - 78, WIDTH, 78);

    // faint grid texture for subtle machine environment
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = "#21495A";
    for (let x = 0; x < WIDTH; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, HEIGHT - 78);
      ctx.lineTo(x + 8, HEIGHT);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // decorative gears (soft, animated)
    drawGear(170, 78, 36, 10, COLORS.gear, 0.06);
    drawGear(240, 58, 26, 8, COLORS.gear, -0.04);
  }

  function drawCloud(cx, cy, size) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.9, size * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - size * 0.6, cy + 4, size * 0.55, size * 0.38, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + size * 0.5, cy + 3, size * 0.5, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGear(cx, cy, radius, teeth, color, rotateOffset) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((Date.now() / 900) * rotateOffset);
    ctx.fillStyle = color;
    for (let i = 0; i < teeth; i++) {
      ctx.beginPath();
      const a1 = (i / teeth) * Math.PI * 2;
      const a2 = a1 + (Math.PI * 2 / teeth) * 0.6;
      ctx.moveTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
      ctx.lineTo(Math.cos(a1) * (radius + 8), Math.sin(a1) * (radius + 8));
      ctx.lineTo(Math.cos(a2) * radius, Math.sin(a2) * radius);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = "#fff";
    ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBubbles() {
    for (const b of state.bubbles) {
      if (!b.visible) continue;
      ctx.save();
      const pulse = b.pulse || 1;
      const r = 28 * pulse;
      // soft shadow
      ctx.beginPath();
      ctx.fillStyle = COLORS.softShadow;
      ctx.ellipse(b.x + 6, b.y + 10, r * 0.8, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // outer glow
      ctx.beginPath();
      const grad = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.5, r * 0.1, b.x, b.y, r);
      grad.addColorStop(0, COLORS.bubbleInner);
      grad.addColorStop(0.7, COLORS.bubbleOuter);
      grad.addColorStop(1, "rgba(255,220,160,0.6)");
      ctx.fillStyle = grad;
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();

      // glass highlight
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.ellipse(b.x - r * 0.35, b.y - r * 0.35, r * 0.46, r * 0.28, -0.7, 0, Math.PI * 2);
      ctx.fill();

      // slight inner shadow
      ctx.beginPath();
      ctx.fillStyle = "rgba(0,0,0,0.05)";
      ctx.ellipse(b.x + r * 0.12, b.y + r * 0.28, r * 0.5, r * 0.3, 0.5, 0, Math.PI * 2);
      ctx.fill();

      // number
      ctx.fillStyle = COLORS.bubbleText;
      ctx.font = "bold 18px rounded, 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(b.val), b.x, b.y + 1);
      ctx.restore();
    }
  }

  function drawMachine() {
    const mx = WIDTH - 320;
    const my = HEIGHT / 2 - 40;
    ctx.save();
    // soft base shadow
    ctx.beginPath();
    ctx.fillStyle = COLORS.softShadow;
    ctx.ellipse(mx + 150, my + 220, 180, 36, 0, 0, Math.PI * 2);
    ctx.fill();

    // Machine body with subtle gradient
    const mg = ctx.createLinearGradient(mx, my, mx + 300, my + 260);
    mg.addColorStop(0, "#E6F9FF");
    mg.addColorStop(1, COLORS.machine);
    ctx.fillStyle = mg;
    roundRect(ctx, mx, my, 300, 260, 18, true, false);

    // control panel
    ctx.fillStyle = "#D9F0F9";
    roundRect(ctx, mx + 20, my + 18, 260, 60, 10, true, false);

    // display target with glowing effect
    ctx.save();
    ctx.fillStyle = COLORS.accent;
    roundRect(ctx, mx + 40, my + 28, 200, 36, 8, true, false);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = COLORS.glow;
    roundRect(ctx, mx + 40, my + 28, 200, 36, 8, true, false);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TARGET: " + state.target, mx + 140, my + 52);
    ctx.restore();

    // slots with subtle animated glow if filled
    const slotStartX = mx + 42;
    const slotY = my + 110;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const sx = slotStartX + i * 90;
      const filled = state.slots[i] !== null;
      // gentle inner gradient
      const sg = ctx.createLinearGradient(sx, slotY, sx, slotY + 70);
      sg.addColorStop(0, filled ? "#fff6f8" : COLORS.slotEmpty);
      sg.addColorStop(1, filled ? COLORS.slotFilled : "#f7fbfc");
      ctx.fillStyle = sg;
      roundRect(ctx, sx, slotY, 70, 70, 10, true, true);

      if (filled) {
        // glowing halo
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = COLORS.good;
        ctx.beginPath();
        ctx.ellipse(sx + 35, slotY + 35, 36, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = COLORS.bubbleText;
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(state.slots[i]), sx + 35, slotY + 35);
      } else {
        ctx.fillStyle = "#9FB3BB";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("slot " + (i + 1), sx + 35, slotY + 60);
      }
    }

    // machine display mouth / emoticon circle
    ctx.beginPath();
    ctx.fillStyle = state.levelSolved ? COLORS.good : "#8fb7c6";
    ctx.ellipse(mx + 180, my + 200, 36, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.levelSolved ? "Happy!" : "Machine", mx + 180, my + 200);

    // small animated lights
    for (let i = 0; i < 4; i++) {
      const lx = mx + 230 + i * 12;
      const ly =
        my +
        40 +
        (i % 2 ? Math.sin(Date.now() / 300 + i) * 3 : Math.cos(Date.now() / 350 + i) * 3);
      ctx.beginPath();
      ctx.fillStyle = i % 2 ? "#ffd36b" : "#a6ffb8";
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

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

  function drawRobot() {
    const r = state.robot;
    ctx.save();
    ctx.translate(r.x, r.y);

    // cast shadow
    ctx.beginPath();
    ctx.fillStyle = COLORS.softShadow;
    ctx.ellipse(0, 46, 46, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // lower body (roundish)
    ctx.fillStyle = COLORS.robotBody;
    roundRect(ctx, -28, -18, 56, 46, 12, true, false);

    // torso panel
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, -20, -8, 40, 28, 6, true, false);

    // head plate
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, -22, -48, 44, 30, 6, true, false);
    // eye (with blinking)
    ctx.fillStyle = "#13303A";
    if (r.blinkTimer && r.blinkTimer > 0) {
      // blinking - draw line
      ctx.fillRect(-6, -36, 12, 3);
    } else {
      ctx.beginPath();
      ctx.arc(0, -35, 6, 0, Math.PI * 2);
      ctx.fill();
      // small light in eye
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.arc(-2, -37, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // arms with slight motion
    ctx.strokeStyle = "#CDEBD8";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-22, -4);
    ctx.lineTo(-44, 12 + Math.sin(Date.now() / 250) * 2);
    ctx.moveTo(22, -4);
    ctx.lineTo(46, 18 + Math.cos(Date.now() / 260) * 3);
    ctx.stroke();

    // wheel/base
    ctx.fillStyle = "#D8EEF2";
    ctx.beginPath();
    ctx.arc(0, 44, 22, 0, Math.PI * 2);
    ctx.fill();

    // holding number bubble (if any)
    if (r.holding) {
      ctx.save();
      ctx.translate(36, -8);
      const pr = 20;
      ctx.beginPath();
      const grad = ctx.createRadialGradient(-6, -6, 2, 0, 0, pr);
      grad.addColorStop(0, COLORS.bubbleInner);
      grad.addColorStop(1, COLORS.bubbleOuter);
      ctx.fillStyle = grad;
      ctx.arc(0, 0, pr, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS.bubbleText;
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(r.holding.val), 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawHUD() {
    // Top-left speaker icon
    ctx.save();
    ctx.translate(12, 12);
    ctx.beginPath();
    ctx.fillStyle = state.muted ? COLORS.speakerOff : COLORS.speakerOn;
    ctx.fillRect(0, 10, 8, 12);
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(20, 6);
    ctx.lineTo(20, 26);
    ctx.lineTo(10, 22);
    ctx.closePath();
    ctx.fill();

    if (!state.muted) {
      ctx.beginPath();
      ctx.strokeStyle = COLORS.speakerOn;
      ctx.lineWidth = 2;
      ctx.arc(26, 16, 8, -0.9, 0.9);
      ctx.stroke();
    } else {
      ctx.strokeStyle = COLORS.speakerOff;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, 6);
      ctx.lineTo(34, 26);
      ctx.moveTo(34, 6);
      ctx.lineTo(6, 26);
      ctx.stroke();
    }
    ctx.restore();

    // Level and score
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Level ${state.level}`, 12, 60);
    ctx.fillText(`Score ${state.score}`, 12, 82);

    // Instructions
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#29586a";
    ctx.fillText(
      "← → to move  •  Space to pick/drop  •  Enter to check  •  M to mute  •  R restart",
      120,
      28
    );

    // Message box with soft backing
    if (state.message) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(255,255,255,0.84)";
      roundRect(ctx, WIDTH / 2 - 200, 18, 400, 36, 8, true, false);
      ctx.fillStyle = COLORS.text;
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.message, WIDTH / 2, 42);
      ctx.restore();
    }

    // draw particles overlay small
    for (const p of state.particles) {
      ctx.save();
      const lifeFrac = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, lifeFrac * 1.1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, p.radius), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawBubbles();
    drawMachine();
    drawRobot();
    drawHUD();
  }

  // Main loop
  function loop() {
    try {
      update();
      draw();
      requestAnimationFrame(loop);
    } catch (err) {
      console.error("Game loop error:", err);
    }
  }

  // Initial start
  startLevel(1);
  initAudio(); // attempt silent init; will be resumed on gesture
  loop();

  // Expose a safe reset method on the canvas element for debug or accessibility
  canvas.resetGame = function () {
    stopAllSounds();
    state = {
      level: 1,
      target: 0,
      bubbles: [],
      slots: new Array(SLOT_COUNT).fill(null),
      robot: { x: WIDTH / 2, y: HEIGHT - 70, speed: 6, holding: null, blinkTimer: 0 },
      score: 0,
      message: "Resetting game.",
      messageTimer: 120,
      audioEnabled: false,
      audioAvailable: true,
      muted: false,
      bgAmbient: null,
      soundContext: null,
      awaitingUserGesture: true,
      levelSolved: false,
      particles: []
    };
    startLevel(1);
    initAudio();
  };

  // Provide error handling for audio context creation attempts after user gesture
  window.addEventListener("click", () => {
    if (!state.soundContext && !state.audioAvailable) {
      try {
        initAudio();
        resumeAudioOnUserGesture();
      } catch (err) {
        console.warn("Audio gesture init error:", err);
      }
    } else {
      // ensure ambient respects mute
      if (state.bgAmbient && state.bgAmbient.master) {
        try {
          state.bgAmbient.master.gain.value = state.muted ? 0.00001 : 0.0008;
        } catch (e) {}
      }
    }
  });

  // Graceful unload: stop audio
  window.addEventListener("beforeunload", () => {
    try {
      stopAllSounds();
    } catch (e) {}
  });
})();