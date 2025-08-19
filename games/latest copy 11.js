(function () {
  // Ensure the stage exists
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    console.error("Game stage element with id 'game-of-the-day-stage' not found.");
    return;
  }

  // Prepare stage container and accessibility
  stage.innerHTML = "";
  stage.style.position = "relative";
  stage.setAttribute("role", "application");
  stage.setAttribute(
    "aria-label",
    "Open-World Math Explorer game. Use arrow keys or WASD to move. Press Enter to interact."
  );

  // Screen-reader live region (visually hidden)
  const srLive = document.createElement("div");
  srLive.setAttribute("aria-live", "polite");
  Object.assign(srLive.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(1px, 1px, 1px, 1px)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    border: "0",
  });
  stage.appendChild(srLive);

  // Create canvas sized exactly 720x480 and accessible
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.display = "block";
  canvas.style.width = "720px";
  canvas.style.height = "480px";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "A colorful open-world map. Use arrow keys or WASD to move. Press Enter to interact with characters and solve math puzzles."
  );
  stage.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  // Audio setup with robust error handling
  let audioEnabled = true;
  let audioContext = null;
  let masterGain = null;
  let ambientNodes = [];
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error("Web Audio API not available in this browser.");
    audioContext = new AudioCtx();

    // Create master gain
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(audioContext.destination);

    // Gentle ambient pad: two detuned oscillators + lowpass + subtle LFO
    const createAmbient = () => {
      const oscA = audioContext.createOscillator();
      const oscB = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();

      oscA.type = "sine";
      oscB.type = "sine";
      // detuned by a small interval for richness
      oscA.frequency.value = 220;
      oscB.frequency.value = 220 * 1.012; // slight detune
      gain.gain.value = 0.02; // very low ambient level

      filter.type = "lowpass";
      filter.frequency.value = 700;
      filter.Q.value = 4;

      // LFO to modulate filter frequency slowly
      lfo.type = "sine";
      lfo.frequency.value = 0.06;
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      oscA.start();
      oscB.start();
      lfo.start();

      return { oscA, oscB, gain, filter, lfo, lfoGain };
    };

    // Create two ambient layers for depth
    ambientNodes.push(createAmbient());
    // second layer lower frequency
    ambientNodes.push(
      (() => {
        const node = createAmbient();
        node.oscA.frequency.value = 110;
        node.oscB.frequency.value = 110 * 1.015;
        node.gain.gain.value = 0.01;
        node.filter.frequency.value = 500;
        return node;
      })()
    );
  } catch (err) {
    console.warn("Audio initialization failed:", err);
    audioEnabled = false;
    audioContext = null;
    srLive.textContent = "Audio is disabled in this browser.";
  }

  // Ensure audio context resumes on user gesture (autoplay policies)
  const ensureAudioContext = async () => {
    if (!audioContext) return;
    try {
      if (audioContext.state === "suspended") await audioContext.resume();
    } catch (err) {
      console.warn("AudioContext resume failed:", err);
    }
  };

  // Utility: create a short tone or envelope-managed oscillator (safe)
  const playTone = (freq = 440, duration = 300, type = "sine", volume = 0.12, attack = 0.01, release = 0.08) => {
    if (!audioEnabled || !audioContext || !masterGain) return;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      osc.type = type;
      osc.frequency.value = freq;

      filter.type = "lowpass";
      filter.frequency.value = Math.max(500, freq * 2);
      filter.Q.value = 1.0;

      const now = audioContext.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + attack);
      gain.gain.linearRampToValueAtTime(volume * 0.6, now + (duration / 1000) * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (duration / 1000) + release);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + (duration / 1000) + release + 0.02);
    } catch (err) {
      console.warn("Error while playing tone:", err);
    }
  };

  // Play correct chime: gentle arpeggio
  const playCorrect = async () => {
    await ensureAudioContext();
    if (!audioEnabled) return;
    try {
      const now = audioContext.currentTime;
      const intervals = [0, 4, 7]; // major triad
      intervals.forEach((i, idx) => {
        const base = 660;
        const freq = base * Math.pow(2, i / 12);
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = idx === 1 ? "triangle" : "sine";
        osc.frequency.value = freq;
        gain.gain.value = 0.0001;
        gain.gain.linearRampToValueAtTime(0.12 / (idx + 1), now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4 + idx * 0.06);
        const filter = audioContext.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 2000;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        osc.start(now + idx * 0.06);
        osc.stop(now + 0.5 + idx * 0.06);
      });
    } catch (err) {
      console.warn("Error playing correct chime:", err);
    }
  };

  // Play incorrect buzz: short low thud with noise
  const playIncorrect = async () => {
    await ensureAudioContext();
    if (!audioEnabled) return;
    try {
      // Low detuned saw for "thud"
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.value = 150;
      filter.type = "lowpass";
      filter.frequency.value = 600;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.28);

      // small noisy click using bufferSource (procedural)
      const bufferSize = audioContext.sampleRate * 0.04;
      const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.02));
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      const nGain = audioContext.createGain();
      nGain.gain.value = 0.05;
      source.connect(nGain);
      nGain.connect(masterGain);
      source.start(now);
    } catch (err) {
      console.warn("Error playing incorrect sound:", err);
    }
  };

  // Visual design constants (enhanced palette)
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;
  const MAP_W = 2000;
  const MAP_H = 1200;

  const colors = {
    skyTop: "#9EE7FF",
    skyMiddle: "#CFF7FF",
    skyBottom: "#F3FFF6",
    sun: "#FFF3B0",
    ground: "#E8F7E9",
    path: "#F8E9C9",
    text: "#123137",
    accent: "#FFB86B",
    plant: "#7CCF9E",
    rock: "#BFBFBF",
    cloud: "rgba(255,255,255,0.9)",
    hudBG: "rgba(255,255,255,0.85)",
  };

  // Game state and entities (do not change logic)
  const player = {
    x: MAP_W / 2,
    y: MAP_H / 2,
    r: 18,
    color: "#FF9AA2",
    speed: 180,
    facing: 0,
    name: "Mossy the Map-Mole",
  };

  let camera = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };

  const npcTemplates = [
    { name: "Zip the Zephyr-bird", color: "#FFD3B6", prompt: "Add these to restore a wind rune:", type: "add" },
    { name: "Pebble Puff", color: "#BFD7EA", prompt: "How many rocks to balance the bridge?", type: "sub" },
    { name: "Luma Lantern", color: "#FFF0A3", prompt: "Combine glowstones:", type: "add" },
    { name: "Quill the Map-fox", color: "#D6C6FF", prompt: "Share the berries equally:", type: "sub" },
  ];

  function generatePuzzle(type = "add", base = 12) {
    if (type === "add") {
      const a = Math.floor(Math.random() * Math.min(15, base));
      const b = Math.floor(Math.random() * Math.min(15, base));
      return { type: "add", a, b, answer: a + b, text: `${a} + ${b} = ?` };
    } else {
      const a = Math.floor(Math.random() * Math.min(20, base)) + 5;
      const b = Math.floor(Math.random() * Math.min(a, base));
      return { type: "sub", a, b, answer: a - b, text: `${a} - ${b} = ?` };
    }
  }

  function randomQuirk() {
    const quirks = ["hums softly", "wears a tiny hat", "floats slightly", "scribbles maps", "blinks colorful eyes", "leaves sparkles"];
    return quirks[Math.floor(Math.random() * quirks.length)];
  }

  const npcs = npcTemplates.map((tpl, i) => {
    const pos = { x: 240 + i * 450, y: 240 + ((i % 3) * 260) };
    const difficulty = 10 + i * 5;
    const puzzle = generatePuzzle(tpl.type, difficulty);
    return {
      id: "npc-" + i,
      x: pos.x,
      y: pos.y,
      r: 28,
      color: tpl.color,
      name: tpl.name,
      prompt: tpl.prompt,
      puzzle,
      solved: false,
      quirk: randomQuirk(),
      bob: Math.random() * Math.PI * 2,
      rot: Math.random() * 0.3 - 0.15,
    };
  });

  // Environment features: islands + clouds for parallax
  const islands = [];
  for (let i = 0; i < 20; i++) {
    islands.push({
      x: Math.random() * MAP_W,
      y: Math.random() * MAP_H,
      w: 80 + Math.random() * 200,
      h: 40 + Math.random() * 80,
      hue: 120 + Math.random() * 60,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  const clouds = [];
  for (let i = 0; i < 12; i++) {
    clouds.push({
      x: Math.random() * MAP_W,
      y: Math.random() * MAP_H * 0.4,
      scale: 0.6 + Math.random() * 1.2,
      speed: 10 + Math.random() * 30,
      offset: Math.random() * 1000,
    });
  }

  // Particles for visual feedback (sparkles)
  const particles = [];

  const gameState = {
    collected: 0,
    timeStart: Date.now(),
    puzzlesSolved: 0,
    totalPuzzles: npcs.length,
    mode: "explore",
    activeNpc: null,
    inputBuffer: "",
    messages: [],
    audioOn: audioEnabled,
  };

  // Keyboard/mouse input trackers
  const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, a: false, s: false, d: false };
  let mouse = { x: 0, y: 0, down: false };

  // Utility: clamp
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Spawn sparkle particles at world coordinates (wx, wy)
  const spawnParticles = (wx, wy, color = "#FFF9C4", count = 18) => {
    const screen = worldToScreen(wx, wy);
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      particles.push({
        x: screen.x,
        y: screen.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 2 + Math.random() * 4,
        color,
        life: 0.9 + Math.random() * 0.8,
        born: now / 1000,
      });
    }
  };

  // Update/render loop
  let lastTime = performance.now();
  const gameLoop = (now) => {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(gameLoop);
  };

  // Update world state
  const update = (dt) => {
    // Update islands wobble
    islands.forEach((island) => (island.wobble += dt * 0.6));

    // Update clouds (parallax independent of camera)
    clouds.forEach((c) => {
      c.x += c.speed * dt;
      if (c.x > MAP_W + 200) c.x = -200 - Math.random() * 400;
    });

    // Update particles
    const now = Date.now() / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.born;
      if (age > p.life) {
        particles.splice(i, 1);
        continue;
      }
      // simple physics + drag
      p.vy += 120 * dt; // gravity
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size *= 0.995;
    }

    // Update NPCs bobbing
    npcs.forEach((npc) => {
      npc.bob += dt * 2.0;
      npc.rot = Math.sin(npc.bob) * 0.12;
    });

    if (gameState.mode === "explore") {
      // Movement
      let moveX = 0;
      let moveY = 0;
      if (keys.ArrowUp || keys.w) moveY -= 1;
      if (keys.ArrowDown || keys.s) moveY += 1;
      if (keys.ArrowLeft || keys.a) moveX -= 1;
      if (keys.ArrowRight || keys.d) moveX += 1;

      const len = Math.hypot(moveX, moveY);
      if (len > 0) {
        moveX /= len;
        moveY /= len;
        player.x += moveX * player.speed * dt;
        player.y += moveY * player.speed * dt;
        player.facing = Math.atan2(moveY, moveX);
        player.x = clamp(player.x, 20, MAP_W - 20);
        player.y = clamp(player.y, 20, MAP_H - 20);
        // subtle footstep sound on movement thresholds (not too frequent)
        if (audioContext && gameState.audioOn) {
          // Play low click every ~220ms of movement — use distance accumulator
          if (!player._stepAccum) player._stepAccum = 0;
          player._stepAccum += Math.hypot(moveX * player.speed * dt, moveY * player.speed * dt);
          if (player._stepAccum > 60) {
            playTone(220 + Math.random() * 40, 90, "sine", 0.02, 0.005, 0.02);
            player._stepAccum = 0;
          }
        }
      }

      // Camera follows
      camera.x = clamp(player.x - camera.w / 2, 0, MAP_W - camera.w);
      camera.y = clamp(player.y - camera.h / 2, 0, MAP_H - camera.h);

      // Check proximity to NPCs
      npcs.forEach((npc) => {
        const dx = npc.x - player.x;
        const dy = npc.y - player.y;
        const dist = Math.hypot(dx, dy);
        npc.near = dist < 70;
      });
    }

    // Messages fade
    gameState.messages = gameState.messages.filter((m) => {
      m.time -= dt;
      return m.time > 0;
    });
  };

  // Convert world coords to screen
  function worldToScreen(wx, wy) {
    return { x: Math.round(wx - camera.x), y: Math.round(wy - camera.y) };
  }

  // Drawing: background with parallax layers, sun, and soft clouds
  function drawBackground() {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, colors.skyTop);
    g.addColorStop(0.45, colors.skyMiddle);
    g.addColorStop(1, colors.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Soft sun (parallax slightly)
    const sunX = ((MAP_W - camera.x) / MAP_W) * (VIEW_W * 0.6) + 100;
    ctx.save();
    const sunRad = 56;
    const radial = ctx.createRadialGradient(sunX, 80, 10, sunX, 80, sunRad);
    radial.addColorStop(0, "rgba(255, 243, 176, 0.95)");
    radial.addColorStop(1, "rgba(255, 243, 176, 0.05)");
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(sunX, 80, sunRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Distant clouds parallax - drawn relative to camera for depth
    clouds.forEach((c, idx) => {
      const px = ((c.x - camera.x) * (0.6 + idx * 0.01)) % (MAP_W + 400);
      const py = c.y - camera.y * 0.25 + Math.sin((Date.now() / 1000) + c.offset) * 6;
      const sx = px - camera.x * 0.1;
      drawCloud(sx, py, c.scale);
    });

    // Distant islands (soft)
    islands.forEach((island) => {
      const screen = worldToScreen(island.x, island.y);
      const sway = Math.sin(island.wobble) * 8;
      const w = island.w;
      const h = island.h;
      ctx.save();
      ctx.translate(screen.x + sway * 0.5, screen.y + Math.cos(island.wobble) * 4);
      // Layered soft shapes to emulate floating garden islands
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.6, h * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${island.hue}, 50%, 88%)`;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-w * 0.15, -h * 0.1, w * 0.25, h * 0.2, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${island.hue}, 60%, 80%)`;
      ctx.fill();
      ctx.restore();
    });
  }

  // Draw cloud at screen coords with puffs
  function drawCloud(x, y, scale = 1) {
    const px = x % (VIEW_W + 400);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = colors.cloud;
    const puffOffsets = [-40, -10, 20, 50];
    puffOffsets.forEach((off, i) => {
      ctx.beginPath();
      ctx.ellipse(px + off * scale, y + (i % 2 ? 6 : -4), 28 * scale, 18 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Draw terrain, path and foliage (subtle)
  function drawTerrain() {
    // Ground fill with subtle texture
    ctx.save();
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Scatter subtle plant clusters
    const density = 24;
    for (let i = 0; i < density; i++) {
      // pick some world positions scattered, draw only if on screen
      const wx = (i * 337) % MAP_W;
      const wy = (i * 271 + 120) % MAP_H;
      const s = worldToScreen(wx, wy);
      if (s.x < -40 || s.x > VIEW_W + 40 || s.y < -40 || s.y > VIEW_H + 40) continue;
      drawPlantCluster(s.x, s.y, 6 + (i % 4));
    }
    ctx.restore();

    // Winding path with slightly shaded edges
    ctx.save();
    ctx.strokeStyle = colors.path;
    ctx.lineWidth = 36;
    ctx.lineCap = "round";
    ctx.beginPath();
    const points = [
      [100, MAP_H - 200],
      [400, MAP_H - 500],
      [900, MAP_H - 300],
      [1300, MAP_H - 700],
      [1700, MAP_H - 320],
    ];
    const first = worldToScreen(points[0][0], points[0][1]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const p = worldToScreen(points[i][0], points[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // soft inner shadow for depth
    ctx.globalCompositeOperation = "multiply";
    ctx.strokeStyle = "rgba(220,200,170,0.25)";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();
  }

  // Plant cluster drawing (simple blades)
  function drawPlantCluster(x, y, count = 6) {
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      const len = 8 + Math.random() * 16;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(48,120,80,${0.6 + Math.random() * 0.3})`;
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(angle) * (len * 0.35), -len * 0.5, Math.cos(angle) * len, -len * 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw NPC with improved visuals: shadow, subtle animation, soft aura if unsolved
  function drawNPC(npc) {
    const screen = worldToScreen(npc.x, npc.y);
    ctx.save();

    // Soft ground ring
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + npc.r * 0.9, npc.r * 1.6, npc.r * 0.75, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,20,20,0.08)";
    ctx.fill();

    // Aura for unsolved NPCs
    if (!npc.solved) {
      ctx.save();
      const t = Date.now() / 1000;
      const pulse = 0.75 + Math.sin(t * 2 + npc.bob) * 0.15;
      const grad = ctx.createRadialGradient(screen.x, screen.y - 6, 4, screen.x, screen.y - 6, npc.r * 2.5 * pulse);
      grad.addColorStop(0, "rgba(255,230,180,0.12)");
      grad.addColorStop(1, "rgba(255,230,180,0.0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y - 6, npc.r * 2.5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Body with slight rotation and bob
    ctx.save();
    ctx.translate(screen.x, screen.y + Math.sin(npc.bob) * 3);
    ctx.rotate(npc.rot);
    ctx.beginPath();
    ctx.fillStyle = npc.color;
    ctx.arc(0, 0, npc.r, 0, Math.PI * 2);
    ctx.fill();

    // Subtle pattern (cheek)
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.ellipse(-6, -4, 6, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.beginPath();
    ctx.fillStyle = "#222";
    ctx.arc(-6, -6, 3, 0, Math.PI * 2);
    ctx.arc(6, -6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Tiny hat or lantern as a simple silhouette
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.rect(-10, -npc.r - 10, 20, 6);
    ctx.fill();
    ctx.restore();

    // Name and quirk lines
    ctx.font = "13px sans-serif";
    ctx.fillStyle = npc.near ? "#0B3" : "#333";
    ctx.textAlign = "center";
    ctx.fillText(npc.name, screen.x, screen.y + npc.r + 18);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#666";
    ctx.fillText(npc.quirk, screen.x, screen.y + npc.r + 30);

    // If near & unsolved: subtle pulsing outline cue
    if (npc.near && !npc.solved) {
      ctx.save();
      const t = Date.now() / 600;
      ctx.strokeStyle = "rgba(255,200,120,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, npc.r + 12 + Math.sin(t) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // Draw player with slightly richer details
  function drawPlayer() {
    const screen = worldToScreen(player.x, player.y);
    ctx.save();

    // Shadow
    ctx.beginPath();
    ctx.ellipse(screen.x + 6, screen.y + 18, player.r * 1.6, player.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,20,20,0.16)";
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.fillStyle = player.color;
    ctx.arc(screen.x, screen.y, player.r, 0, Math.PI * 2);
    ctx.fill();

    // Backpack - rounder and shaded
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#9ED2C6";
    ctx.ellipse(screen.x - player.r - 2, screen.y, 8, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Map in hand with slight flutter effect
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "#FFF9CC";
    ctx.rect(screen.x + 8, screen.y + 2, 14, 10);
    ctx.fill();
    ctx.restore();

    // Face
    ctx.beginPath();
    ctx.fillStyle = "#222";
    ctx.arc(screen.x - 6, screen.y - 4, 3, 0, Math.PI * 2);
    ctx.arc(screen.x + 0, screen.y - 4, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // HUD with cleaner visuals and clickable speaker icon
  function drawHUD() {
    ctx.save();
    // Top rounded panel
    const padX = 10,
      padY = 10,
      padW = 700,
      padH = 64;
    roundRect(ctx, padX, padY, padW, padH, 12, true, true);
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    ctx.fill();

    // Left column: title and details
    ctx.font = "20px 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = colors.text;
    ctx.textAlign = "left";
    ctx.fillText("Open-World Math Explorer", padX + 16, padY + 28);

    ctx.font = "13px sans-serif";
    ctx.fillStyle = "#444";
    ctx.fillText(`${player.name} • Treasures: ${gameState.collected}`, padX + 16, padY + 48);

    // Audio/speaker icon (interactive area)
    const speakerX = padX + padW - 60;
    const speakerY = padY + padH / 2;
    ctx.save();
    ctx.translate(speakerX, speakerY);
    // speaker silhouette
    ctx.beginPath();
    ctx.fillStyle = gameState.audioOn ? "#123" : "#999";
    ctx.moveTo(-12, -10);
    ctx.lineTo(-4, -10);
    ctx.lineTo(4, -16);
    ctx.lineTo(4, 16);
    ctx.lineTo(-4, 10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();

    // waves or muted cross
    if (gameState.audioOn) {
      ctx.beginPath();
      ctx.strokeStyle = "#123";
      ctx.lineWidth = 2;
      ctx.arc(18, 0, 8, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(18, 0, 12, -0.6, 0.6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.strokeStyle = "#E44";
      ctx.lineWidth = 3;
      ctx.moveTo(12, -8);
      ctx.lineTo(20, 8);
      ctx.moveTo(20, -8);
      ctx.lineTo(12, 8);
      ctx.stroke();
    }
    ctx.restore();

    // Right: instructions
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#666";
    ctx.textAlign = "right";
    ctx.fillText("Move: Arrow keys or WASD • Interact: Enter • Toggle sound: M or click speaker", padX + padW - 12, padY + 48);

    ctx.restore();

    // Active messages
    gameState.messages.forEach((m, i) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, m.time / 3));
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#123";
      ctx.fillText(m.text, 24, 110 + i * 22);
      ctx.restore();
    });

    // Nearby NPC hint
    const nearbyNpc = npcs.find((n) => n.near && !n.solved);
    if (nearbyNpc && gameState.mode === "explore") {
      ctx.save();
      const boxW = 440,
        boxH = 72;
      const bx = (VIEW_W - boxW) / 2;
      const by = VIEW_H - boxH - 12;
      ctx.fillStyle = colors.hudBG;
      roundRect(ctx, bx, by, boxW, boxH, 12, true, true);
      ctx.fillStyle = "#333";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${nearbyNpc.name}: ${nearbyNpc.prompt}`, VIEW_W / 2, by + 32);
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#666";
      ctx.fillText("Press Enter to talk and solve a puzzle", VIEW_W / 2, by + 52);
      ctx.restore();
    }
  }

  // Puzzle modal UI (visual polish) - modal covers whole canvas
  function drawPuzzleUI(npc) {
    ctx.save();
    // dim
    ctx.fillStyle = "rgba(12,12,18,0.45)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Panel
    const w = 640,
      h = 220;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    ctx.fillStyle = "#FFF";
    roundRect(ctx, x, y, w, h, 14, true, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#EDEDED";
    roundRect(ctx, x, y, w, h, 14, false, true);

    // Portrait circle with soft border
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 68, y + 70, 44, 0, Math.PI * 2);
    ctx.fillStyle = npc.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.stroke();
    ctx.restore();

    // Text content
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#123";
    ctx.textAlign = "left";
    ctx.fillText(`${npc.name} says:`, x + 124, y + 54);

    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#444";
    ctx.fillText(npc.prompt, x + 124, y + 78);

    // Equation text
    ctx.font = "28px monospace";
    ctx.fillStyle = "#0B6";
    ctx.fillText(npc.puzzle.text, x + 124, y + 124);

    // Input box
    const inputX = x + 124,
      inputY = y + 138,
      inputW = 140,
      inputH = 36;
    ctx.fillStyle = "#F5F7FA";
    roundRect(ctx, inputX, inputY, inputW, inputH, 6, true, false);
    ctx.strokeStyle = "#D6DCE9";
    roundRect(ctx, inputX, inputY, inputW, inputH, 6, false, true);

    // Input buffer text
    ctx.font = "22px monospace";
    ctx.fillStyle = "#123";
    ctx.textAlign = "left";
    ctx.fillText(gameState.inputBuffer || "_", inputX + 12, inputY + 25);

    // Buttons
    const btnW = 120,
      btnH = 36;
    const submitX = x + w - btnW - 24,
      submitY = y + h - btnH - 24;
    ctx.fillStyle = "#8EE28A";
    roundRect(ctx, submitX, submitY, btnW, btnH, 8, true, true);
    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#06320D";
    ctx.textAlign = "center";
    ctx.fillText("Submit", submitX + btnW / 2, submitY + 23);

    const giveX = submitX - btnW - 12;
    ctx.fillStyle = "#FFDDD2";
    roundRect(ctx, giveX, submitY, btnW, btnH, 8, true, true);
    ctx.fillStyle = "#7A2E1B";
    ctx.fillText("Give Up", giveX + btnW / 2, submitY + 23);

    // Hint text
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#666";
    ctx.textAlign = "left";
    ctx.fillText("Type numbers and press Enter. Backspace clears a digit. Esc to close.", x + 124, y + h - 28);

    ctx.restore();
  }

  // Utility: round rect
  function roundRect(ctx, x, y, width, height, radius = 6, fill = true, stroke = true) {
    if (typeof radius === "number") radius = { tl: radius, tr: radius, br: radius, bl: radius };
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Render everything
  function render() {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    drawBackground();
    drawTerrain();

    // Draw NPCs (depth by y)
    const drawables = [...npcs].sort((a, b) => a.y - b.y);
    drawables.forEach((npc) => drawNPC(npc));

    drawPlayer();

    // Particles (draw above player and NPCs)
    drawParticles();

    drawHUD();

    if (gameState.mode === "puzzle" && gameState.activeNpc) drawPuzzleUI(gameState.activeNpc);

    // Initial help text
    if (Date.now() - gameState.timeStart < 5000) {
      ctx.save();
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "rgba(20,20,20,0.8)";
      ctx.textAlign = "center";
      ctx.fillText("Explore the wacky map and talk to characters to solve math puzzles!", VIEW_W / 2, VIEW_H - 12);
      ctx.restore();
    }
  }

  // Draw transient particles
  function drawParticles() {
    const now = Date.now() / 1000;
    particles.forEach((p) => {
      const age = now - p.born;
      const t = Math.max(0, Math.min(1, age / p.life));
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      const s = p.size * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
      // tiny shine
      ctx.globalAlpha = (1 - t) * 0.6;
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.arc(p.x - s * 0.25, p.y - s * 0.25, Math.max(0.6, s * 0.35), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // Interaction handlers (do not change game logic)
  function tryInteract() {
    const npc = npcs.find((n) => n.near && !n.solved);
    if (npc) {
      openPuzzle(npc);
      return;
    }
    pushMessage("No one nearby to talk to. Explore to find friendly characters!");
  }

  async function openPuzzle(npc) {
    gameState.mode = "puzzle";
    gameState.activeNpc = npc;
    gameState.inputBuffer = "";
    srLive.textContent = `${npc.name} offers a puzzle: ${npc.puzzle.text}. Type your answer.`;
    await ensureAudioContext();
    if (gameState.audioOn) playTone(520, 120, "sine", 0.05);
  }

  function closePuzzle() {
    gameState.mode = "explore";
    gameState.activeNpc = null;
    gameState.inputBuffer = "";
    srLive.textContent = "Returned to exploration mode.";
  }

  function submitAnswer() {
    if (!gameState.activeNpc) return;
    const npc = gameState.activeNpc;
    const val = parseInt(gameState.inputBuffer, 10);
    if (Number.isNaN(val)) {
      pushMessage("Please type a number before submitting.");
      if (gameState.audioOn) playIncorrect();
      return;
    }
    if (val === npc.puzzle.answer) {
      // Correct - preserve game logic, add visual/audio reward
      npc.solved = true;
      gameState.puzzlesSolved++;
      gameState.collected += 1;
      pushMessage(`Correct! You helped ${npc.name} and collected a glowstone.`);
      if (gameState.audioOn) playCorrect();
      srLive.textContent = `Correct! ${npc.name} is grateful. You have ${gameState.collected} glowstones.`;
      spawnParticles(npc.x, npc.y - npc.r * 0.5, "#FFF3B0", 28);
      // close after a short delay
      setTimeout(() => closePuzzle(), 700);
    } else {
      pushMessage("Not quite — try again! Or press Give Up.");
      if (gameState.audioOn) playIncorrect();
      srLive.textContent = `Answer ${val} is incorrect for ${npc.name}'s puzzle. Try again.`;
    }
  }

  // Message utility
  function pushMessage(text, duration = 3) {
    gameState.messages.push({ text, time: duration });
  }

  // Keyboard events
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      keys[e.key] = true;
      e.preventDefault();
    } else if (["w", "a", "s", "d"].includes(e.key)) {
      keys[e.key] = true;
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (gameState.mode === "puzzle") {
        submitAnswer();
      } else {
        tryInteract();
      }
      e.preventDefault();
    } else if (e.key === "Escape") {
      if (gameState.mode === "puzzle") closePuzzle();
    } else if (e.key === "Backspace") {
      if (gameState.mode === "puzzle") {
        gameState.inputBuffer = gameState.inputBuffer.slice(0, -1);
        e.preventDefault();
      }
    } else if (e.key.toLowerCase() === "m") {
      // Toggle audio
      gameState.audioOn = !gameState.audioOn;
      if (!gameState.audioOn) {
        if (masterGain) masterGain.gain.value = 0;
        srLive.textContent = "Audio turned off.";
      } else {
        if (masterGain) masterGain.gain.value = 0.7;
        ensureAudioContext().then(() => {
          srLive.textContent = "Audio turned on.";
          if (gameState.audioOn) playTone(660, 120, "sine", 0.05);
        });
      }
    } else if (gameState.mode === "puzzle") {
      if (/^[0-9]$/.test(e.key)) {
        if (gameState.inputBuffer.length < 3) gameState.inputBuffer += e.key;
      } else if (e.key === "-" || e.key === "_") {
        if (gameState.inputBuffer[0] !== "-") gameState.inputBuffer = "-" + gameState.inputBuffer;
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      keys[e.key] = false;
      e.preventDefault();
    } else if (["w", "a", "s", "d"].includes(e.key)) {
      keys[e.key] = false;
      e.preventDefault();
    }
  });

  // Mouse move to update pointer for HUD interactions
  canvas.addEventListener("mousemove", (ev) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
  });

  // Click handling: puzzle UI buttons, speaker click, quick move on NPC portrait
  canvas.addEventListener("mousedown", (ev) => {
    mouse.down = true;
    // Detect click on speaker icon area (top panel)
    const padX = 10,
      padY = 10,
      padW = 700,
      padH = 64;
    const speakerRegion = { x: padX + padW - 80, y: padY + 8, w: 72, h: 48 };
    if (mouse.x >= speakerRegion.x && mouse.x <= speakerRegion.x + speakerRegion.w && mouse.y >= speakerRegion.y && mouse.y <= speakerRegion.y + speakerRegion.h) {
      // Toggle audio
      gameState.audioOn = !gameState.audioOn;
      if (!gameState.audioOn) {
        if (masterGain) masterGain.gain.value = 0;
        srLive.textContent = "Audio turned off.";
      } else {
        if (masterGain) masterGain.gain.value = 0.7;
        ensureAudioContext().then(() => {
          srLive.textContent = "Audio turned on.";
          if (gameState.audioOn) playTone(660, 120, "sine", 0.05);
        });
      }
      return;
    }

    if (gameState.mode === "puzzle" && gameState.activeNpc) {
      const npc = gameState.activeNpc;
      const w = 640,
        h = 220;
      const x = (VIEW_W - w) / 2,
        y = (VIEW_H - h) / 2;
      const submitX = x + w - 120 - 24,
        submitY = y + h - 36 - 24;
      const giveX = submitX - 120 - 12;
      if (mouse.x >= submitX && mouse.x <= submitX + 120 && mouse.y >= submitY && mouse.y <= submitY + 36) {
        submitAnswer();
      } else if (mouse.x >= giveX && mouse.x <= giveX + 120 && mouse.y >= submitY && mouse.y <= submitY + 36) {
        pushMessage(`You gave up on ${npc.name}'s puzzle. Maybe try later.`);
        closePuzzle();
      } else {
        const inputX = x + 124,
          inputY = y + 138,
          inputW = 140,
          inputH = 36;
        if (mouse.x >= inputX && mouse.x <= inputX + inputW && mouse.y >= inputY && mouse.y <= inputY + inputH) {
          pushMessage("Type your answer on your keyboard and press Enter to submit.");
        }
      }
    } else {
      // Exploration mode: click near NPC portrait to move closer
      const clickedNpc = npcs.find((n) => {
        const s = worldToScreen(n.x, n.y);
        return Math.hypot(mouse.x - s.x, mouse.y - s.y) < n.r + 8;
      });
      if (clickedNpc) {
        player.x = clickedNpc.x + 60;
        player.y = clickedNpc.y + 60;
        pushMessage(`Moved near ${clickedNpc.name}. Press Enter to interact.`);
      }
    }
  });

  canvas.addEventListener("mouseup", () => {
    mouse.down = false;
  });

  // Accept numeric input for puzzle
  window.addEventListener("keypress", (e) => {
    if (gameState.mode !== "puzzle") return;
    if (e.key >= "0" && e.key <= "9") {
      if (gameState.inputBuffer.length < 3) gameState.inputBuffer += e.key;
    } else if (e.key === "Enter") {
      submitAnswer();
    }
  });

  // Start-up messages and interactions
  pushMessage("Welcome explorer! Use arrow keys or WASD to roam.", 4);
  srLive.textContent = "Welcome to Open-World Math Explorer. Use arrow keys or WASD to move. Press Enter to interact with characters to solve puzzles.";

  // Start the loop
  requestAnimationFrame(gameLoop);

  // Expose minimal debug API
  stage.gameAPI = { getState: () => ({ player, npcs, gameState }) };

  // Ensure first user click resumes audio on mobile/autoplay policies
  canvas.addEventListener("click", () => ensureAudioContext());

  // Periodic check for completion to nudge player
  setInterval(() => {
    if (gameState.puzzlesSolved === gameState.totalPuzzles && gameState.totalPuzzles > 0) {
      pushMessage("You solved all puzzles! Great exploring!", 4);
      srLive.textContent = "Congratulations! You solved all puzzles and collected all glowstones.";
    }
  }, 5000);

  // Global error handling
  window.addEventListener("error", (ev) => {
    console.error("Game error:", ev.error);
    pushMessage("An unexpected error occurred. Try reloading the page.", 6);
    srLive.textContent = "An unexpected error occurred in the game.";
  });
})();