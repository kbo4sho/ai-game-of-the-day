(() => {
  "use strict";

  const WIDTH = 720;
  const HEIGHT = 480;

  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Container with ID 'game-of-the-day-stage' not found.");
    return;
  }
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.error("Web Audio API is not supported in this browser");
  }

  // Improved SoundManager with subtle layered background music and gentle feedback sounds
  const SoundManager = (() => {
    if (!audioCtx)
      return {
        playCorrect: () => {},
        playIncorrect: () => {},
        startBackground: () => {},
        stopBackground: () => {},
      };

    // Play short tone with envelope and filter for texture
    const playTone = (freq, duration = 300, wave = "sine", volume = 0.15) => {
      try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = wave;
        osc.frequency.value = freq;

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(freq * 1.2, audioCtx.currentTime);

        gain.gain.setValueAtTime(volume, audioCtx.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();

        const now = audioCtx.currentTime;
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000);

        osc.stop(now + duration / 1000);

        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
          filter.disconnect();
        };
      } catch (e) {
        console.warn("Audio play error:", e);
      }
    };

    // Layered ambient background music using oscillators modulated
    let bgNodes = [];
    let bgGainNode;

    const startBackground = () => {
      if (bgNodes.length > 0) return; // already started
      try {
        bgGainNode = audioCtx.createGain();
        bgGainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        bgGainNode.connect(audioCtx.destination);

        // Create slow evolving sine waves with LFO modulating filter freq
        const createLayer = (freqBase, detune, wave, delay) => {
          const osc = audioCtx.createOscillator();
          const lfo = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          const filter = audioCtx.createBiquadFilter();

          osc.type = wave;
          osc.frequency.value = freqBase;
          osc.detune.value = detune;

          lfo.type = "sine";
          lfo.frequency.value = 0.1 + Math.random() * 0.05; // very slow mod
          gain.gain.value = 15 + Math.random() * 10; // filter modulation amount

          filter.type = "lowpass";
          filter.frequency.value = 200;
          filter.Q.value = 2;

          lfo.connect(gain);
          gain.connect(filter.frequency);

          osc.connect(filter);
          filter.connect(bgGainNode);

          lfo.start(audioCtx.currentTime + delay);
          osc.start(audioCtx.currentTime + delay);

          return { osc, lfo, gain, filter };
        };

        bgNodes.push(createLayer(220, 0, "triangle", 0));
        bgNodes.push(createLayer(110, 0, "sine", 0.3));
        bgNodes.push(createLayer(330, 0, "sine", 0.6));
      } catch (e) {
        console.warn("Background audio error:", e);
      }
    };

    const stopBackground = () => {
      try {
        bgNodes.forEach(n => {
          n.osc.stop();
          n.lfo.stop();
          n.osc.disconnect();
          n.lfo.disconnect();
          n.gain.disconnect();
          n.filter.disconnect();
        });
        bgNodes = [];
        if (bgGainNode) {
          bgGainNode.disconnect();
          bgGainNode = null;
        }
      } catch (e) {
        console.warn("Background audio stop error:", e);
      }
    };

    return {
      playCorrect: () => playTone(587.33, 300, "triangle", 0.3), // D5 triangle smooth positive
      playIncorrect: () => playTone(130.81, 350, "square", 0.3), // C3 low square wave negative
      startBackground,
      stopBackground,
    };
  })();

  class Character {
    constructor(name, color, x, y) {
      this.name = name;
      this.color = color;
      this.x = x;
      this.y = y;
      this.radius = 22;
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      // Bounce scale for subtle breathing effect
      const scale = 1 + 0.03 * Math.sin(Date.now() / 400);
      ctx.scale(scale, 1);
      // Body elliptical with gentle vertical bob
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(0, 3 * Math.sin(Date.now() / 350), this.radius, this.radius * 1.3, 0, 0, 2 * Math.PI);
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 3;
      ctx.fill();
      ctx.shadowColor = "transparent";

      // Eyes with glossy highlight
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-8, -5, 8, 10, 0, 0, 2 * Math.PI);
      ctx.ellipse(8, -5, 8, 10, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Pupils with smooth tracking effect
      ctx.fillStyle = "#000";
      const time = Date.now() / 400;
      const pupilOffsetX = Math.sin(time) * 3;
      const pupilOffsetY = Math.cos(time) * 2;
      ctx.beginPath();
      ctx.ellipse(-8 + pupilOffsetX, -5 + pupilOffsetY, 4, 6, 0, 0, 2 * Math.PI);
      ctx.ellipse(8 + pupilOffsetX, -5 + pupilOffsetY, 4, 6, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Smile - double arc with inner blush circle
      ctx.strokeStyle = "#241a00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 12, 12, 0, Math.PI, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 10, 8, 0, Math.PI, false);
      ctx.stroke();

      // Subtle rosy blush circles
      ctx.fillStyle = "rgba(255, 110, 110, 0.5)";
      ctx.beginPath();
      ctx.ellipse(-16, 4, 8, 6, 0, 0, 2 * Math.PI);
      ctx.ellipse(16, 4, 8, 6, 0, 0, 2 * Math.PI);
      ctx.fill();

      ctx.restore();
    }
  }

  class Critter {
    constructor(name, color, x, y) {
      this.name = name;
      this.color = color;
      this.x = x;
      this.y = y;
      this.size = 18;
      this.wigglePhase = Math.random() * Math.PI * 2;
      this.blinkTimer = 0;
      this.blinkDuration = 200;
      this.blinking = false;
    }
    update(deltaTime) {
      this.wigglePhase += deltaTime * 0.009;
      this.y += Math.sin(this.wigglePhase) * 0.14;

      // Simple blinking logic, random intervals
      this.blinkTimer -= deltaTime;
      if (this.blinkTimer <= 0) {
        this.blinking = true;
        this.blinkTimer = 1500 + Math.random() * 4000;
      }
      if (this.blinking) {
        this.blinkDuration -= deltaTime;
        if (this.blinkDuration <= 0) {
          this.blinking = false;
          this.blinkDuration = 200;
        }
      }
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Draw star body with subtle scale wiggle
      const scale = 1 + 0.05 * Math.sin(Date.now() / 400 + this.wigglePhase);
      ctx.scale(scale, scale);
      ctx.fillStyle = this.color;
      const points = 5;
      const outerRadius = this.size;
      const innerRadius = this.size * 0.42;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (Math.PI / points) * i - Math.PI / 2;
        ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
      }
      ctx.closePath();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;
      ctx.fill();
      ctx.shadowColor = "transparent";

      // Wacky expressive eyes that blink
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-6, -3, 6, 8, 0, 0, 2 * Math.PI);
      ctx.ellipse(6, -3, 6, 8, 0, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = this.blinking ? this.color : "#000";
      const pupilXOffset = Math.sin(Date.now() / 300 + this.wigglePhase) * 1.8;
      const pupilYOffset = Math.cos(Date.now() / 300 + this.wigglePhase) * 1.2;
      ctx.beginPath();
      ctx.ellipse(-6 + pupilXOffset, -3 + pupilYOffset, 3, 5, 0, 0, 2 * Math.PI);
      ctx.ellipse(6 + pupilXOffset, -3 + pupilYOffset, 3, 5, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Tiny mouth as subtle gloss line
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-3, 6);
      ctx.quadraticCurveTo(0, 9, 3, 6);
      ctx.stroke();

      ctx.restore();
    }
  }

  class Treasure {
    constructor(x, y, a, b) {
      this.x = x;
      this.y = y;
      this.width = 54;
      this.height = 42;
      this.a = a;
      this.b = b;
      this.opened = false;
      this.shimmerPhase = 0;
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Animate shimmer for unopened chests
      this.shimmerPhase += 0.03;
      const shimmer = this.opened ? 0 : 0.4 + 0.6 * Math.sin(this.shimmerPhase);

      // Body base with gradient for wood texture
      const woodGrad = ctx.createLinearGradient(0, 0, 0, this.height);
      woodGrad.addColorStop(0, this.opened ? "#fff1a8" : "#9e6f40");
      woodGrad.addColorStop(1, this.opened ? "#fff7bd" : "#6b4522");
      ctx.fillStyle = woodGrad;
      ctx.shadowColor = "rgba(0,0,0,0.22)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = "#4c2a07";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, this.width, this.height);

      // Lid with curved edges and highlight
      const lidHeight = this.height / 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(this.width / 2, -lidHeight * 1.2, this.width, 0);
      ctx.lineTo(this.width, lidHeight);
      ctx.quadraticCurveTo(this.width / 2, lidHeight * 1.6, 0, lidHeight);
      ctx.closePath();
      // Lid gradient + shimmer highlight
      const lidGrad = ctx.createLinearGradient(0, -lidHeight, 0, lidHeight);
      lidGrad.addColorStop(0, this.opened ? "#fffde6" : "#734e22");
      lidGrad.addColorStop(shimmer, this.opened ? "#fff7c1" : "#9e6732");
      lidGrad.addColorStop(1, this.opened ? "#fff9cc" : "#6c4523");
      ctx.fillStyle = lidGrad;
      ctx.fill();
      ctx.stroke();

      // Highlight shine on lid front edge
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(5, lidHeight * 0.2);
      ctx.bezierCurveTo(this.width / 2, -lidHeight * 0.5, this.width - 5, lidHeight * 0.25, this.width - 5, lidHeight * 0.25);
      ctx.stroke();

      if (!this.opened) {
        // Problem text with glow shadow for clarity and fun
        ctx.fillStyle = "#fff";
        ctx.font = "bold 19px Comic Sans MS, cursive, sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(255,255,255,0.7)";
        ctx.shadowBlur = 8;
        ctx.fillText(`${this.a} + ${this.b} = ?`, this.width / 2, this.height + 24);
        ctx.shadowColor = "transparent";
      } else {
        // Opened sign with bright checkmark and number
        ctx.fillStyle = "#665100";
        ctx.font = "bold 26px Comic Sans MS, cursive, sans-serif";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(255, 255, 130, 0.9)";
        ctx.shadowBlur = 6;
        ctx.fillText(`✔️ ${this.a + this.b}`, this.width / 2, this.height / 2 + 9);
        ctx.shadowColor = "transparent";
      }

      // Slight shadow below treasure for depth
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.filter = "blur(4px)";
      ctx.beginPath();
      ctx.ellipse(this.width / 2, this.height + 8, this.width / 2.6, 6, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.filter = "none";

      ctx.restore();
    }
    containsPoint(px, py) {
      return (
        px >= this.x &&
        px <= this.x + this.width &&
        py >= this.y &&
        py <= this.y + this.height
      );
    }
  }

  function drawBackground(ctx) {
    // Gentle sky gradient with soft light clouds
    const skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    skyGrad.addColorStop(0, "#b6daf0");
    skyGrad.addColorStop(0.7, "#85b9ee");
    skyGrad.addColorStop(1, "#62a0d8");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Light clouds (elliptical soft shapes)
    const time = Date.now() / 3000;
    function drawCloud(x, y, scale, alpha) {
      ctx.save();
      ctx.translate(x + 20 * Math.sin(time + x), y);
      ctx.scale(scale, scale);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 36, 24, 0, 0, 2 * Math.PI);
      ctx.ellipse(25, -6, 32, 26, 0, 0, 2 * Math.PI);
      ctx.ellipse(50, 0, 35, 28, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
    drawCloud(160, 90, 1.2, 0.85);
    drawCloud(480, 70, 1, 0.7);
    drawCloud(680, 110, 0.7, 0.9);
    drawCloud(320, 130, 0.9, 0.5);

    // Rolling hills with smooth color pastel layers and gentle curves
    const hillColors = ["#a1d3a1", "#82b87f", "#649666"];
    const hillBaseY = HEIGHT - 110;

    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = hillColors[i % hillColors.length];
      ctx.beginPath();
      ctx.moveTo(i * 180 - 90, HEIGHT);
      for (let x = i * 180 - 90; x <= (i + 1) * 180 + 90; x++) {
        const y = hillBaseY + 50 * Math.sin((x / 180 + i + time / 3) * Math.PI) * 0.55;
        ctx.lineTo(x, y);
      }
      ctx.lineTo((i + 1) * 180 + 90, HEIGHT);
      ctx.closePath();
      ctx.shadowColor = "rgba(0,0,0,0.05)";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowColor = "transparent";
    }

    // Quirky trees with layered leaf blobs and wood texture
    function drawWackyTree(x, y, scale) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      // Trunk textured with vertical grain lines
      ctx.fillStyle = "#7a4a1e";
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.lineTo(10, 68);
      ctx.lineTo(-10, 68);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#552f0e";
      ctx.lineWidth = 1.5;
      for (let lineX = -8; lineX <= 8; lineX += 3) {
        ctx.beginPath();
        ctx.moveTo(lineX, 2);
        ctx.lineTo(lineX, 66);
        ctx.stroke();
      }

      // Leaves with layered pastel blobs, subtle pulsing scale
      const leafColors = ["#a9e6a9", "#7ecc76", "#60b864"];
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = leafColors[i % leafColors.length];
        ctx.beginPath();
        const angle = (i * Math.PI / 2.75) + (Math.sin(Date.now() / 1500 + i) * 0.13);
        const lx = 23 * Math.cos(angle);
        const ly = -28 + 20 * Math.sin(angle);
        const pulse = 1 + 0.07 * Math.sin(Date.now() / 400 + i * 5);
        ctx.ellipse(lx, ly, 28 * pulse, 38 * pulse, angle * 0.95, 0, 2 * Math.PI);
        ctx.shadowColor = "rgba(0,0,0,0.04)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowColor = "transparent";
      }

      ctx.restore();
    }

    drawWackyTree(90, HEIGHT - 165, 1.3);
    drawWackyTree(200, HEIGHT - 142, 1.05);
    drawWackyTree(470, HEIGHT - 170, 1.45);
    drawWackyTree(610, HEIGHT - 155, 1.1);
  }

  let lastTimestamp = 0;
  let keysPressed = {};
  let treasures = [];
  let critters = [];
  let player;
  let currentTreasure = null;
  let mathAnswerInput = "";
  let showingInstructions = true;
  let feedbackMessage = "";
  let feedbackTimer = 0;
  let bgMusicStarted = false;

  const uiTextColor = "#222";
  const uiBackgroundColor = "rgba(255,255,255,0.9)";

  function init() {
    // Player with warmer orange and subtle color shadow
    player = new Character("Explorer Ella", "#e57c2e", WIDTH / 8, HEIGHT - 160);

    critters = [
      new Critter("Ziggy", "#c94b4b", 350, HEIGHT - 118),
      new Critter("Bloop", "#4098e0", 590, HEIGHT - 128),
      new Critter("Mimi", "#f07ec4", 500, HEIGHT - 108),
    ];

    treasures = [
      new Treasure(250, HEIGHT - 140, 3, 6),
      new Treasure(420, HEIGHT - 130, 5, 4),
      new Treasure(600, HEIGHT - 140, 7, 2),
    ];

    currentTreasure = null;
    mathAnswerInput = "";
    feedbackMessage = "";
    feedbackTimer = 0;
    showingInstructions = true;
  }

  function drawInstructions(ctx) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = uiBackgroundColor;
    ctx.fillRect(40, 50, WIDTH - 80, HEIGHT - 100);
    ctx.shadowColor = "transparent";

    ctx.fillStyle = uiTextColor;
    ctx.font = "26px Comic Sans MS, cursive, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Welcome Explorer!", WIDTH / 2, 110);

    ctx.font = "19px Comic Sans MS, cursive, sans-serif";
    ctx.fillText("Help Explorer Ella collect treasures on the island.", WIDTH / 2, 150);
    ctx.fillText("Solve addition problems to unlock each treasure chest.", WIDTH / 2, 180);
    ctx.fillText("Use arrow keys or WASD to move.", WIDTH / 2, 210);
    ctx.fillText("Press Enter to answer when near a treasure.", WIDTH / 2, 240);
    ctx.fillText("Type your answer, then press Enter to submit.", WIDTH / 2, 270);
    ctx.fillText("Press Escape to close this help.", WIDTH / 2, 300);

    // Keyboard keys icon stylized with circles and letters
    const keys = ["↑", "W", "↓", "S", "←", "A", "→", "D", "Enter", "Escape"];
    const keyXStart = WIDTH / 2 - 160;
    const keyY = 340;
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = "#666";

    keys.forEach((key, idx) => {
      const x = keyXStart + idx * 40;
      ctx.beginPath();
      ctx.fillStyle = "#def0d9";
      ctx.shadowColor = "rgba(0,0,0,0.06)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.roundRect
        ? ctx.roundRect(x - 16, keyY - 23, 32, 32, 6)
        : (() => {
            ctx.moveTo(x - 10, keyY - 20);
            ctx.lineTo(x + 10, keyY - 20);
            ctx.lineTo(x + 10, keyY + 10);
            ctx.lineTo(x - 10, keyY + 10);
            ctx.closePath();
          })();
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#376b34";
      ctx.fillText(key, x - (key.length > 1 ? 14 : 9), keyY + 6);
    });

    ctx.restore();
  }

  function drawFeedback(ctx) {
    if (!feedbackMessage) return;
    ctx.save();
    ctx.fillStyle = uiBackgroundColor;
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    const boxWidth = 380;
    const boxHeight = 72;
    const x = WIDTH / 2 - boxWidth / 2;
    const y = HEIGHT / 2 - boxHeight / 2;

    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 14;
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.fillStyle = "#223311";
    ctx.font = "bold 24px Comic Sans MS, cursive, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(feedbackMessage, WIDTH / 2, y + boxHeight / 2 + 10);
    ctx.restore();
  }

  // Rounded rectangle polyfill for older browsers
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

  function draw(deltaTime) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawBackground(ctx);

    treasures.forEach(t => t.draw(ctx));
    critters.forEach(c => c.draw(ctx));
    player.draw(ctx);

    ctx.save();
    ctx.fillStyle = "#d8eed8";
    ctx.shadowColor = "rgba(0,0,0,0.1)";
    ctx.shadowOffsetY = -1;
    ctx.shadowBlur = 7;
    ctx.fillRect(0, HEIGHT - 60, WIDTH, 60);
    ctx.shadowColor = "transparent";

    ctx.fillStyle = "#2a4b23";
    ctx.font = "bold 22px Comic Sans MS, cursive, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Explorer Ella", 16, HEIGHT - 28);

    if (currentTreasure) {
      ctx.textAlign = "center";
      const boxX = WIDTH / 2 - 115;
      const boxY = HEIGHT - 58;
      const boxW = 230;
      const boxH = 48;

      // Draw input box with subtle drop shadow and inset style
      ctx.fillStyle = "#fffef2";
      ctx.shadowColor = "rgba(0,0,0,0.09)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#2a4b23";
      ctx.lineWidth = 3;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.fillStyle = "#1a1a1a";
      ctx.font = "19px Comic Sans MS, cursive, sans-serif";
      ctx.fillText(`What is ${currentTreasure.a} + ${currentTreasure.b}?`, WIDTH / 2, boxY + 26);

      ctx.font = "bold 28px monospace";
      ctx.fillText(mathAnswerInput || "_", WIDTH / 2, boxY + 45);

      ctx.font = "14px Comic Sans MS, cursive, sans-serif";
      ctx.fillStyle = "#446633";
      ctx.fillText("Type answer, press Enter to submit, Esc to cancel", WIDTH / 2, boxY + boxH + 18);
    } else {
      ctx.font = "17px Comic Sans MS, cursive, sans-serif";
      ctx.fillStyle = "#2a4b23";
      ctx.textAlign = "center";
      ctx.fillText("Move near a treasure and press Enter to solve the addition problem!", WIDTH / 2, HEIGHT - 30);
      ctx.textAlign = "right";
      ctx.fillText("Press H for help", WIDTH - 14, HEIGHT - 30);
    }

    ctx.restore();

    drawFeedback(ctx);

    // Audio visual cue: stylized subtle speaker icon with wave lines
    ctx.save();
    ctx.translate(WIDTH - 34, 28);
    ctx.fillStyle = "#2a4b23";

    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.lineTo(8, 4);
    ctx.lineTo(14, 8);
    ctx.lineTo(14, -8);
    ctx.lineTo(8, -4);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#4b704b";
    ctx.beginPath();
    ctx.arc(20, 0, 7, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(20, 0, 11, -Math.PI / 5, Math.PI / 5);
    ctx.stroke();

    ctx.restore();

    if (showingInstructions) {
      drawInstructions(ctx);
    }
  }

  canvas.addEventListener("keydown", (e) => {
    e.preventDefault();
    const key = e.key.toLowerCase();
    if (showingInstructions) {
      if (key === "escape" || key === "enter") {
        showingInstructions = false;
      }
      return;
    }

    if (currentTreasure) {
      if (key === "escape") {
        currentTreasure = null;
        mathAnswerInput = "";
        feedbackMessage = "Answer cancelled";
        feedbackTimer = Date.now();
      } else if (key === "enter") {
        if (mathAnswerInput.length === 0) {
          feedbackMessage = "Please type an answer before submitting.";
          feedbackTimer = Date.now();
        } else {
          const playerAnswer = parseInt(mathAnswerInput);
          if (playerAnswer === currentTreasure.a + currentTreasure.b) {
            currentTreasure.opened = true;
            feedbackMessage = "Correct! Treasure unlocked!";
            SoundManager.playCorrect();
            currentTreasure = null;
            mathAnswerInput = "";
          } else {
            feedbackMessage = "Oops! Try again.";
            SoundManager.playIncorrect();
            mathAnswerInput = "";
          }
          feedbackTimer = Date.now();
        }
      } else if (/^[0-9]$/.test(key)) {
        if (mathAnswerInput.length < 3) {
          mathAnswerInput += key;
        }
      } else if (key === "backspace") {
        mathAnswerInput = mathAnswerInput.slice(0, -1);
      }
      return;
    }

    if (key === "arrowleft" || key === "a") keysPressed.left = true;
    if (key === "arrowright" || key === "d") keysPressed.right = true;
    if (key === "arrowup" || key === "w") keysPressed.up = true;
    if (key === "arrowdown" || key === "s") keysPressed.down = true;

    if (key === "enter") {
      let found = false;
      treasures.forEach(t => {
        if (!t.opened) {
          const distX = player.x - (t.x + t.width / 2);
          const distY = player.y - (t.y + t.height / 2);
          const dist = Math.sqrt(distX * distX + distY * distY);
          if (dist < 60) {
            currentTreasure = t;
            mathAnswerInput = "";
            feedbackMessage = "";
            found = true;
          }
        }
      });
      if (!found) {
        feedbackMessage = "No treasure nearby to open.";
        feedbackTimer = Date.now();
      }
    }

    if (key === "h") {
      showingInstructions = true;
    }
  });

  canvas.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (key === "arrowleft" || key === "a") keysPressed.left = false;
    if (key === "arrowright" || key === "d") keysPressed.right = false;
    if (key === "arrowup" || key === "w") keysPressed.up = false;
    if (key === "arrowdown" || key === "s") keysPressed.down = false;
  });

  canvas.addEventListener("click", () => {
    canvas.focus();
  });

  function update(deltaTime) {
    if (showingInstructions) {
      if (!bgMusicStarted) {
        SoundManager.startBackground();
        bgMusicStarted = true;
      }
      return;
    }
    if (!bgMusicStarted) {
      SoundManager.startBackground();
      bgMusicStarted = true;
    }

    critters.forEach(c => c.update(deltaTime));

    if (!currentTreasure) {
      let speed = 130;
      let dx = 0, dy = 0;
      if (keysPressed.left) dx -= 1;
      if (keysPressed.right) dx += 1;
      if (keysPressed.up) dy -= 1;
      if (keysPressed.down) dy += 1;

      if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx * dx + dy * dy);
        dx /= length;
        dy /= length;
      }

      player.x += dx * speed * (deltaTime / 1000);
      player.y += dy * speed * (deltaTime / 1000);

      player.x = Math.min(Math.max(player.radius, player.x), WIDTH - player.radius);
      player.y = Math.min(Math.max(player.radius + 25, player.y), HEIGHT - player.radius - 55);
    }

    if (feedbackMessage) {
      if (Date.now() - feedbackTimer > 3200) {
        feedbackMessage = "";
      }
    }
  }

  function gameLoop(timestamp = 0) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    update(deltaTime);
    draw(deltaTime);

    window.requestAnimationFrame(gameLoop);
  }

  init();
  gameLoop();

  if (container) {
    container.setAttribute("role", "application");
    container.setAttribute("aria-label", "Math exploration game: Move Explorer Ella using arrow keys or WASD. Approach treasure chests and press Enter to solve addition problems.");
  }
})();