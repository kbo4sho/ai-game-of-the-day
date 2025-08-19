(() => {
  const stage = document.getElementById("game-of-the-day-stage");
  if (!stage) {
    console.error("Element with ID 'game-of-the-day-stage' not found.");
    return;
  }
  const CANVAS_WIDTH = 720;
  const CANVAS_HEIGHT = 480;

  // Clear stage, create canvas
  stage.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.tabIndex = 0; // make focusable for keyboard controls
  canvas.setAttribute("aria-label", "Open world math exploration game");
  stage.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  // Enhanced Audio setup and helper functions with error handling
  let audioCtx;
  try {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  } catch (e) {
    console.warn("Web Audio API not supported or failed: ", e);
    audioCtx = null;
  }

  /** Play a tone using Web Audio API */
  function playTone(freq, duration, type = "sine") {
    if (!audioCtx) return;
    try {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = type;
      oscillator.frequency.value = freq;
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        audioCtx.currentTime + duration
      );
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn("Audio playback error", e);
    }
  }

  /** Plays a joyful, clean correct answer sound */
  function playCorrectSound() {
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const freqs = [440, 660, 880, 990];
      freqs.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + 0.15 * i);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.15 * i + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 * i + 0.12);
        osc.start(now + 0.15 * i);
        osc.stop(now + 0.15 * i + 0.12);
      });
    } catch (e) {
      console.warn("Correct sound playback error", e);
    }
  }

  /** Plays a soft, short incorrect buzz */
  function playIncorrectSound() {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "square";
      osc.frequency.value = 140;
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn("Incorrect sound playback error", e);
    }
  }

  /** Plays a soft, evolving background ambient tone resembling island breeze + gentle wind chime */
  function playBackgroundAmbience() {
    if (!audioCtx) return null;
    try {
      const gainMaster = audioCtx.createGain();
      gainMaster.gain.setValueAtTime(0.03, audioCtx.currentTime);
      gainMaster.connect(audioCtx.destination);

      // Base slow sine oscillator (wind)
      const baseOsc = audioCtx.createOscillator();
      baseOsc.type = "sine";
      baseOsc.frequency.value = 150;
      const baseGain = audioCtx.createGain();
      baseGain.gain.setValueAtTime(0.015, audioCtx.currentTime);
      baseOsc.connect(baseGain).connect(gainMaster);
      baseOsc.start();

      // Second oscillator for gentle shimmering
      const shimmerOsc = audioCtx.createOscillator();
      shimmerOsc.type = "triangle";
      shimmerOsc.frequency.value = 440;
      const shimmerGain = audioCtx.createGain();
      shimmerGain.gain.setValueAtTime(0.006, audioCtx.currentTime);
      shimmerOsc.connect(shimmerGain).connect(gainMaster);
      shimmerOsc.start();

      // Modulate shimmer gain slowly for gentle sparkle effect
      let shimmerDirection = 1;
      let shimmerVal = 0.006;
      const shimmerInterval = setInterval(() => {
        if (!audioCtx) return;
        shimmerVal += shimmerDirection * 0.0003;
        if (shimmerVal > 0.01) shimmerDirection = -1;
        if (shimmerVal < 0.004) shimmerDirection = 1;
        shimmerGain.gain.setTargetAtTime(shimmerVal, audioCtx.currentTime, 0.2);
      }, 150);

      // Frequency oscillation for baseOsc for soft wind effect
      let freqVal = 140;
      let freqDir = 1;
      const freqInterval = setInterval(() => {
        if (!audioCtx) return;
        freqVal += freqDir * 0.3;
        if (freqVal > 160) freqDir = -1;
        if (freqVal < 140) freqDir = 1;
        baseOsc.frequency.setTargetAtTime(freqVal, audioCtx.currentTime, 0.4);
      }, 300);

      return {
        stop() {
          clearInterval(shimmerInterval);
          clearInterval(freqInterval);
          baseOsc.stop();
          shimmerOsc.stop();
        }
      };
    } catch (e) {
      console.warn("Background ambience error", e);
      return null;
    }
  }

  // Game variables/constants
  const TILE_SIZE = 48;
  const ROWS = 10;
  const COLS = 15;

  // Player variables - bright coral orange body with subtle glowing aura ring
  const player = {
    x: 1,
    y: 1,
    color: "#FF7F50",
    radius: 18,
    speed: 1
  };

  const fruitTypes = [
    { name: "Mystic Mango", color: "#FFC941" }, // richer golden yellow
    { name: "Rainbow Berry", color: "#B04FFF" }, // brighter electric purple
    { name: "Bubble Banana", color: "#FFF36B" }, // light bright yellow
    { name: "Tickle Tomato", color: "#FF7050" } // soft red-orange
  ];

  const islandMap = [];
  for (let r = 0; r < ROWS; r++) {
    islandMap[r] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        islandMap[r][c] = 1; // border trees
      } else {
        islandMap[r][c] = 0; // grass
      }
    }
  }

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Add trees inside island (15 trees)
  let treeCount = 0;
  while (treeCount < 15) {
    const r = getRandomInt(2, ROWS - 3);
    const c = getRandomInt(2, COLS - 3);
    if (islandMap[r][c] === 0 && (r !== player.y || c !== player.x)) {
      islandMap[r][c] = 1;
      treeCount++;
    }
  }

  // Add fruits (8) with addition problems and whimsical positions
  const fruits = [];
  while (fruits.length < 8) {
    let r = getRandomInt(1, ROWS - 2);
    let c = getRandomInt(1, COLS - 2);
    if (
      islandMap[r][c] === 0 &&
      !(r === player.y && c === player.x) &&
      !fruits.some(f => f.x === c && f.y === r)
    ) {
      let addend1 = getRandomInt(5, 20);
      let addend2 = getRandomInt(1, 9);
      fruits.push({
        x: c,
        y: r,
        type: fruitTypes[getRandomInt(0, fruitTypes.length - 1)],
        question: `${addend1} + ${addend2}`,
        answer: addend1 + addend2,
        collected: false
      });
      islandMap[r][c] = 2;
    }
  }

  // Game state tracking
  let inputAnswer = "";
  let currentFruit = null;
  let message =
    "Explore the island! Use arrow keys to move. Collect magic fruit by solving addition.";
  let showMessageTimer = 0;
  const SHOW_MESSAGE_DURATION = 4000;
  const collectedCount = { count: 0 };

  // Keyboard input handling
  const keys = {};
  canvas.addEventListener("keydown", e => {
    e.preventDefault();
    keys[e.key] = true;
    if (e.key === "Enter" || e.key === "NumpadEnter") {
      if (currentFruit) {
        checkAnswer();
      }
    }
    if (e.key === "Backspace") {
      if (currentFruit) {
        inputAnswer = inputAnswer.slice(0, -1);
      }
    }
    if (currentFruit && /^[0-9]$/.test(e.key)) {
      inputAnswer += e.key;
      if (inputAnswer.length > 3) inputAnswer = inputAnswer.slice(0, 3);
    }
  });
  canvas.addEventListener("keyup", e => {
    e.preventDefault();
    keys[e.key] = false;
  });

  function canMoveTo(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    if (islandMap[y][x] === 1) return false;
    return true;
  }

  function getFruitAt(x, y) {
    return fruits.find(f => f.x === x && f.y === y && !f.collected) || null;
  }

  function checkForFruitCollection() {
    if (currentFruit) return;
    const f = getFruitAt(player.x, player.y);
    if (f) {
      currentFruit = f;
      inputAnswer = "";
      message = `Solve: ${f.question} = ? (type answer and press Enter)`;
      playTone(720, 0.15, "square"); // higher-pitched chime for question
      showMessageTimer = SHOW_MESSAGE_DURATION;
    }
  }

  function checkAnswer() {
    if (!currentFruit) return;
    const submitted = Number(inputAnswer);
    if (isNaN(submitted)) {
      message = "Please enter a number.";
      playIncorrectSound();
      showMessageTimer = SHOW_MESSAGE_DURATION;
      inputAnswer = "";
      return;
    }
    if (submitted === currentFruit.answer) {
      currentFruit.collected = true;
      collectedCount.count++;
      message = `Correct! You collected the ${currentFruit.type.name}! Total fruits: ${collectedCount.count}/8`;
      playCorrectSound();
      currentFruit = null;
      inputAnswer = "";
      showMessageTimer = SHOW_MESSAGE_DURATION;
      if (collectedCount.count === fruits.length) {
        message = "Wow! You collected all the magic fruit! You are the island hero!";
      }
    } else {
      message = "Oops, try again!";
      playIncorrectSound();
      showMessageTimer = SHOW_MESSAGE_DURATION;
      inputAnswer = "";
    }
  }

  // Drawing helpers - refined visual style with calmer palettes, subtle animations

  // Grass tile with smooth curved blades and layered green colors
  function drawGrassTile(x, y) {
    const time = Date.now() / 500;
    // Base color gradient green (soft and layered)
    const gradient = ctx.createLinearGradient(x, y, x, y + TILE_SIZE);
    gradient.addColorStop(0, "#B5DC6B");
    gradient.addColorStop(1, "#6E9E3C");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Gentle waving grass blades (curved strokes)
    ctx.strokeStyle = "#7CBA3C";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const baseX = x + 8 + i * 12;
      const baseY = y + TILE_SIZE - 8;
      const sway = Math.sin(time + i) * 4;

      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(
        baseX + sway / 2,
        baseY - 14,
        baseX + sway,
        baseY - 25
      );
      ctx.stroke();
    }

    // Add subtle small bright dots to simulate fireflies or magic dust
    for (let i = 0; i < 3; i++) {
      const dotX = x + 8 + i * 14 + Math.sin(time * 3 + i) * 2;
      const dotY = y + 8 + Math.cos(time * 3 + i) * 2;
      const opacity = 0.3 + 0.7 * (Math.sin(time * 5 + i) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,180,${opacity.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Tree tile with soft shadow, layered leaves, and round trunk highlight
  function drawTreeTile(x, y) {
    // Draw trunk with shading
    const trunkX = x + TILE_SIZE / 2 - 6;
    const trunkY = y + TILE_SIZE - 28;
    ctx.fillStyle = "#5A3330"; // deep wood brown
    ctx.shadowColor = "#402818";
    ctx.shadowBlur = 5;
    ctx.fillRect(trunkX, trunkY, 12, 28);

    // Trunk highlight ellipse
    ctx.shadowBlur = 0;
    const shadingGradient = ctx.createLinearGradient(trunkX, trunkY, trunkX + 12, trunkY);
    shadingGradient.addColorStop(0, "#7B4E43");
    shadingGradient.addColorStop(1, "#5A3330");
    ctx.fillStyle = shadingGradient;
    ctx.beginPath();
    ctx.ellipse(trunkX + 6, trunkY + 20, 3, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Leaves layered circles with soft shimmer
    const baseX = x + TILE_SIZE / 2;
    const baseY = y + 20;
    const time = Date.now() / 600;

    const leavesColors = ["#3D8B69", "#36A175", "#309668"];
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 / 5) * i + Math.sin(time + i) * 0.1;
      const radius = 24 + Math.sin(time + i * 2) * 2;
      ctx.fillStyle = leavesColors[i % leavesColors.length];
      ctx.shadowColor = "rgba(70,125,90, 0.4)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(
        baseX + Math.cos(angle) * radius,
        baseY + Math.sin(angle) * radius * 0.7,
        22,
        18,
        angle,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // Magic fruit with whimsical shining stripes/dots animated over base shape
  function drawFruit(x, y, color) {
    const centerX = x + TILE_SIZE / 2;
    const centerY = y + TILE_SIZE / 2;
    const time = Date.now() / 400;

    // Draw base elliptical shape with subtle radial gradient
    const fruitGradient = ctx.createRadialGradient(centerX, centerY, 7, centerX, centerY, 18);
    fruitGradient.addColorStop(0, "#FFFFFFA8");
    fruitGradient.addColorStop(0.3, color);
    fruitGradient.addColorStop(1, shadeColor(color, -35));
    ctx.fillStyle = fruitGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 16, 22, Math.sin(time) * 0.13, 0, Math.PI * 2);
    ctx.fill();

    // White animated stripes/drips
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    for (let i = 0; i < 3; i++) {
      const offsetX = Math.sin(time * 1.3 + i * 2) * 5;
      const offsetY = Math.cos(time * 1.1 + i * 2) * 3;
      ctx.beginPath();
      ctx.moveTo(centerX - 4 + offsetX, centerY - 10 + offsetY);
      ctx.bezierCurveTo(
        centerX - 3 + offsetX,
        centerY - 12 + offsetY,
        centerX + 4 + offsetX,
        centerY - 8 + offsetY,
        centerX + 1 + offsetX,
        centerY + 8 + offsetY
      );
      ctx.lineTo(centerX - 4 + offsetX, centerY + 6 + offsetY);
      ctx.closePath();
      ctx.fill();
    }

    // Soft white highlight on top
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - 6, 10, 12, 0, 0, Math.PI);
    ctx.stroke();
  }

  // Utility to shade color by percent (-100 to 100)
  function shadeColor(color, percent) {
    const f = parseInt(color.slice(1), 16),
      t = percent < 0 ? 0 : 255,
      p = Math.abs(percent) / 100;
    const R = (f >> 16) & 0xff,
      G = (f >> 8) & 0xff,
      B = f & 0xff;
    const newR = Math.round((t - R) * p + R);
    const newG = Math.round((t - G) * p + G);
    const newB = Math.round((t - B) * p + B);
    return `rgb(${newR},${newG},${newB})`;
  }

  // Draw player "Zappy" with bright color, subtle glowing aura, and sparkly tail with smooth animation
  function drawPlayer() {
    const px = player.x * TILE_SIZE + TILE_SIZE / 2;
    const py = player.y * TILE_SIZE + TILE_SIZE / 2;
    const time = Date.now() / 400;

    // Glowing aura circle
    const auraGradient = ctx.createRadialGradient(px, py, player.radius * 0.8, px, py, player.radius * 1.8);
    auraGradient.addColorStop(0, "rgba(255,127,80,0.35)");
    auraGradient.addColorStop(1, "rgba(255,127,80,0)");
    ctx.fillStyle = auraGradient;
    ctx.beginPath();
    ctx.arc(px, py, player.radius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Body circle with subtle spectrum animated light overlay
    const bodyGradient = ctx.createRadialGradient(px, py, player.radius * 0.4, px, py, player.radius);
    bodyGradient.addColorStop(0, player.color);
    const lightColor = `hsl(${(time * 70) % 360}, 90%, 65%)`;
    bodyGradient.addColorStop(1, lightColor);
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(px, py, player.radius, 0, Math.PI * 2);
    ctx.fill();

    // Eyes large, with glowing white inner glow
    ctx.fillStyle = "#FEFEFA";
    ctx.shadowColor = "#FFFFFFBB";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(px - 8, py - 5, 7, 0, Math.PI * 2);
    ctx.arc(px + 8, py - 5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(px - 8, py - 5, 4, 0, Math.PI * 2);
    ctx.arc(px + 8, py - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // Beak with subtle gradient for 3D effect
    const beakGradient = ctx.createLinearGradient(px, py + 6, px + 16, py + 14);
    beakGradient.addColorStop(0, "#FFF176");
    beakGradient.addColorStop(1, "#FFC107");
    ctx.fillStyle = beakGradient;
    ctx.beginPath();
    ctx.moveTo(px, py + 6);
    ctx.lineTo(px + 16, py + 4);
    ctx.lineTo(px, py + 14);
    ctx.closePath();
    ctx.fill();

    // Tail - 3 crackling feathers with smooth motion & subtle flickering lightning bolt animations
    const tailStartX = px - 22;
    const tailStartY = py + 10;
    for (let i = 0; i < 3; i++) {
      const baseX = tailStartX - i * 11;
      const baseY = tailStartY + Math.sin(time + i) * 3;

      // Feather shaft with glow
      ctx.strokeStyle = `rgba(255, 236, 153, ${0.4 + 0.3 * Math.sin(time * 5 + i * 10)})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ffffbb";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX - 20, baseY + 10);
      ctx.stroke();

      // Lightning bolt: flickers occasionally but with scaled glow
      if (Math.random() < 0.03) {
        ctx.strokeStyle = `rgba(255, 255, 0, ${0.6 + 0.4 * Math.random()})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = "#fffda0";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(baseX - 10, baseY + 2);
        ctx.lineTo(baseX - 15, baseY + 10);
        ctx.lineTo(baseX - 5, baseY + 7);
        ctx.lineTo(baseX - 12, baseY + 18);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowBlur = 0;
      }
    }
  }

  // Draw math question input box with translucent frosted background and smooth border glow
  function drawInputBox() {
    if (!currentFruit) return;
    const boxWidth = 300;
    const boxHeight = 90;
    const x = (CANVAS_WIDTH - boxWidth) / 2;
    const y = CANVAS_HEIGHT - boxHeight - 30;

    // Frosted glass style background with rounded rectangle
    ctx.fillStyle = "rgba(20, 80, 180, 0.65)";
    ctx.shadowColor = "rgba(50, 150, 255, 0.7)";
    ctx.shadowBlur = 8;
    roundRect(ctx, x, y, boxWidth, boxHeight, 15, true, false);
    ctx.shadowBlur = 0;

    // White glowing border
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(180, 220, 255, 0.9)";
    roundRect(ctx, x, y, boxWidth, boxHeight, 15, false, true);

    // Prompt text
    ctx.fillStyle = "white";
    ctx.font = "24px Comic Sans MS, cursive, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Solve: ${currentFruit.question}`, x + boxWidth / 2, y + 38);

    // Input text with blinking cursor, bright pastel color
    ctx.font = "32px Arial, sans-serif";
    const cursor = (Math.floor(Date.now() / 500) % 2 === 0) ? "|" : " ";
    const displayText = inputAnswer + cursor;
    ctx.fillStyle = "rgba(255, 255, 230, 0.9)";
    ctx.fillText(displayText, x + boxWidth / 2, y + 70);
  }

  // Rounded rectangle helper function
  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof stroke === "undefined") stroke = true;
    if (typeof radius === "undefined") radius = 5;
    if (typeof radius === "number") {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
      const defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
      for (let side in defaultRadius) {
        radius[side] = radius[side] || defaultRadius[side];
      }
    }
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

  // Draw collected fruit count and messages in stylish HUD
  function drawHUD() {
    ctx.textAlign = "left";

    // Background overlay for HUD text
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillRect(8, 8, 280, 40);

    // Collected count text
    ctx.fillStyle = "#2A3E4B";
    ctx.font = "22px Arial, sans-serif";
    ctx.fillText(`Magic fruits collected: ${collectedCount.count} / ${fruits.length}`, 18, 36);

    // Message centered at bottom but offset
    if (message) {
      ctx.textAlign = "center";
      // Soft shadow for readability
      ctx.shadowColor = "rgba(255,255,255,0.7)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "#104A8B";
      ctx.font = "20px Comic Sans MS, cursive";
      ctx.fillText(message, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 16);
      ctx.shadowBlur = 0;
    }
  }

  // Draw entire island with layered visual style
  function draw() {
    // Clear - gradient sky from soft blue to light turquoise
    const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    skyGradient.addColorStop(0, "#9FD3E5");
    skyGradient.addColorStop(1, "#83C3C9");
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw island beach sand - textured with wavy patterns
    ctx.fillStyle = "#F5E7AC";
    ctx.beginPath();
    ctx.moveTo(0, TILE_SIZE);
    for (let x = 0; x <= CANVAS_WIDTH; x += 24) {
      ctx.quadraticCurveTo(
        x + 8,
        TILE_SIZE - 8 + Math.sin(Date.now() / 600 + x / 24) * 6,
        x + 24,
        TILE_SIZE
      );
    }
    ctx.lineTo(CANVAS_WIDTH, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT - TILE_SIZE);
    for (let x = 0; x <= CANVAS_WIDTH; x += 24) {
      ctx.quadraticCurveTo(
        x + 8,
        CANVAS_HEIGHT - TILE_SIZE + 8 + Math.sin(Date.now() / 600 + x / 24 + 1.5) * 6,
        x + 24,
        CANVAS_HEIGHT - TILE_SIZE
      );
    }
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineTo(0, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Left and right beach stripes with subtle noise/dots
    const sandyColor = "#FBE7A1";
    ctx.fillStyle = sandyColor;
    ctx.fillRect(0, 0, TILE_SIZE, CANVAS_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - TILE_SIZE, 0, TILE_SIZE, CANVAS_HEIGHT);

    // Noise dots on beach for soft texture
    for (let i = 0; i < 60; i++) {
      const randXLeft = Math.random() * TILE_SIZE;
      const randY = Math.random() * CANVAS_HEIGHT;
      ctx.fillStyle = `rgba(255, 255, 210, ${Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(randXLeft, randY, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();

      const randXRight = CANVAS_WIDTH - TILE_SIZE + Math.random() * TILE_SIZE;
      ctx.beginPath();
      ctx.arc(randXRight, randY, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw terrain tiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tileX = c * TILE_SIZE;
        const tileY = r * TILE_SIZE;

        if (islandMap[r][c] === 0) {
          drawGrassTile(tileX, tileY);
        } else if (islandMap[r][c] === 1) {
          drawTreeTile(tileX, tileY);
        } else if (islandMap[r][c] === 2) {
          drawGrassTile(tileX, tileY);
          // Draw fruit if not collected
          const fruit = getFruitAt(c, r);
          if (fruit) {
            drawFruit(tileX, tileY, fruit.type.color);
          }
        }
      }
    }

    drawPlayer();
    drawInputBox();
    drawHUD();
    drawAudioIcon();
  }

  // Draw audio icon in top right with modern clean style
  function drawAudioIcon() {
    const size = 32;
    const margin = 14;
    const x = CANVAS_WIDTH - size - margin;
    const y = margin + size / 2;

    // Speaker shape with round edges
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#556677";
    ctx.fillStyle = "#8BBEFF";
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 12);
    ctx.lineTo(x - 2, y + 12);
    ctx.quadraticCurveTo(x + 9, y + 2, x - 2, y - 8);
    ctx.lineTo(x - 12, y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (audioCtx && audioCtx.state === "running") {
      // Draw animated sound waves with subtle glow and color cycling
      const waveColors = ["#3A9D23", "#30B733", "#2CCC2E"];
      waveColors.forEach((col, i) => {
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(
          x + 12 + i * 5,
          y,
          6 + i * 3,
          -Math.PI / 4,
          Math.PI / 4
        );
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    } else {
      // Muted icon: red cross
      ctx.strokeStyle = "rgba(255, 80, 80, 0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 14);
      ctx.lineTo(x + 14, y + 14);
      ctx.moveTo(x + 14, y - 14);
      ctx.lineTo(x - 16, y + 14);
      ctx.stroke();
      ctx.lineWidth = 3;
    }
  }

  // Game loop and update logic
  let lastTime = 0;
  function update(delta) {
    let moved = false;
    if (!currentFruit) {
      if (keys["ArrowUp"] && canMoveTo(player.x, player.y - 1)) {
        player.y -= player.speed;
        moved = true;
        keys["ArrowUp"] = false;
      }
      if (keys["ArrowDown"] && canMoveTo(player.x, player.y + 1)) {
        player.y += player.speed;
        moved = true;
        keys["ArrowDown"] = false;
      }
      if (keys["ArrowLeft"] && canMoveTo(player.x - 1, player.y)) {
        player.x -= player.speed;
        moved = true;
        keys["ArrowLeft"] = false;
      }
      if (keys["ArrowRight"] && canMoveTo(player.x + 1, player.y)) {
        player.x += player.speed;
        moved = true;
        keys["ArrowRight"] = false;
      }
    }
    if (moved) {
      message = "Keep exploring and collecting magic fruit!";
      showMessageTimer = SHOW_MESSAGE_DURATION;
      checkForFruitCollection();
    }
    if (showMessageTimer > 0) {
      showMessageTimer -= delta;
      if (showMessageTimer <= 0) {
        message = "";
      }
    }
  }

  function loop(time = 0) {
    const delta = time - lastTime;
    lastTime = time;

    update(delta);
    draw();

    requestAnimationFrame(loop);
  }

  canvas.focus();

  const bgAmbience = playBackgroundAmbience();

  // Resume audio context on user interaction as required by browsers
  function resumeAudioContext() {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }
  window.addEventListener("keydown", resumeAudioContext);
  window.addEventListener("mousedown", resumeAudioContext);
  window.addEventListener("touchstart", resumeAudioContext);

  loop();
})();