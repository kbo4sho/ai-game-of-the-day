const gameContainer = document.getElementById('game-of-the-day-stage');
gameContainer.innerHTML = '';
gameContainer.style.width = '720px';
gameContainer.style.height = '480px';
gameContainer.style.position = 'relative';

const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', 'Math adventure game with a friendly explorer collecting shapes in an open world');
gameContainer.appendChild(canvas);
const ctx = canvas.getContext('2d');

const gameWidth = canvas.width;
const gameHeight = canvas.height;

const explorer = {
  x: gameWidth / 2,
  y: gameHeight / 2,
  radius: 20,
  color: '#3a8baf',
  speed: 4
};

const shapes = ['circle', 'square', 'triangle'];
const shapeColors = ['#f08a5d', '#b83b5e', '#6a2c70'];
const shapeSize = 30;

let collectibleShapes = [];

const characters = {
  explorer: {
    name: 'Ellie the Explorer',
    description: 'A curious adventurer who loves discovering math treasures.'
  },
  guide: {
    name: 'Wobbly the Wise Wombat',
    description: 'Your funny, wacky guide who helps with questions and clues.'
  }
};

let audioCtx;
try {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
} catch (e) {
  audioCtx = null;
  console.warn('Web Audio API not supported or failed to initialize.');
}

// Sound helpers with smoother envelope
function playTone(freq, duration = 200, type = 'sine', volume = 0.15) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration / 1000 + 0.05);
  } catch (e) {
    // fail silently
  }
}

function playCorrectSound() {
  playTone(700, 350, 'triangle', 0.18);
}

function playWrongSound() {
  playTone(250, 350, 'square', 0.18);
}

function playBackgroundTone() {
  if (!audioCtx) return null;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.025, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();

    // Gentle LFO on frequency for motion effect
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.setValueAtTime(0.13, audioCtx.currentTime);
    lfoGain.gain.setValueAtTime(4, audioCtx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();

    return { osc, gain, lfo, lfoGain };
  } catch {
    return null;
  }
}

let bgWaves = [
  { y: 430, amplitude: 10, frequency: 0.015, phase: 0 },
  { y: 450, amplitude: 12, frequency: 0.02, phase: 1 },
  { y: 470, amplitude: 8, frequency: 0.017, phase: 0.5 }
];

const keysPressed = {};

let collected = [];
let question = null;
let showQuestion = false;
let message = '';
let messageTimeout = null;

const instructions = `Use arrow keys or WASD to move Ellie the Explorer.
Collect colorful shapes by moving over them.
After you collect shapes, answer the quiz by typing the number and pressing Enter.
Press H for help anytime.`;

const font = '20px Comic Sans MS, cursive, sans-serif';

// Background with soft vertical gradient sky and stylized light clouds and softly animated waves
function drawBackground(time) {
  // Sky gradient: dawn pastel blues to light peach
  const skyGradient = ctx.createLinearGradient(0, 0, 0, gameHeight);
  skyGradient.addColorStop(0, '#a2d5f2');
  skyGradient.addColorStop(0.5, '#d9f0f7');
  skyGradient.addColorStop(1, '#f9d5bb');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, gameWidth, gameHeight);

  // Soft floating clouds (white transparent ellipses) slowly moving left
  const cloudCount = 6;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (let i = 0; i < cloudCount; i++) {
    const baseX = ((time * 0.02 + i * 130) % (gameWidth + 150)) - 150;
    const baseY = 60 + (i % 2) * 25;
    ctx.beginPath();
    ctx.ellipse(baseX, baseY, 60, 25, 0, 0, Math.PI * 2);
    ctx.ellipse(baseX + 40, baseY + 10, 50, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(baseX + 90, baseY + 5, 35, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Gentle ocean waves - layered with slight vertical gradient and smooth curves
  bgWaves.forEach(wave => {
    const waveGradient = ctx.createLinearGradient(0, wave.y - wave.amplitude - 10, 0, wave.y + wave.amplitude + 20);
    waveGradient.addColorStop(0, 'rgba(58, 139, 175, 0.15)');
    waveGradient.addColorStop(1, 'rgba(58, 139, 175, 0)');
    ctx.fillStyle = waveGradient;
    ctx.beginPath();
    ctx.moveTo(0, gameHeight);
    for (let x = 0; x <= gameWidth; x += 5) {
      const y = wave.y + wave.amplitude * Math.sin(wave.frequency * x + wave.phase + time * 0.0024);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(gameWidth, gameHeight);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = `rgba(60, 120, 150, 0.4)`;
    ctx.lineWidth = 2;
    for (let x = 0; x <= gameWidth; x += 10) {
      const y = wave.y + wave.amplitude * Math.sin(wave.frequency * x + wave.phase + time * 0.002);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  // Ground with low hill shapes - calming earth tones
  ctx.fillStyle = '#5e8d4a';
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, gameHeight);
  const hillPoints = [
    { x: 0, y: gameHeight - 90 },
    { x: 120, y: gameHeight - 130 },
    { x: 250, y: gameHeight - 80 },
    { x: 400, y: gameHeight - 150 },
    { x: 540, y: gameHeight - 90 },
    { x: 680, y: gameHeight - 140 },
    { x: gameWidth, y: gameHeight - 110 },
    { x: gameWidth, y: gameHeight }
  ];
  hillPoints.forEach((p, i) => {
    if (i === 0) ctx.lineTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

// Draw Ellie with subtle bobbing animation and textured shading for depth
function drawExplorer(x, y, time) {
  const bobOffset = 3 * Math.sin(time * 0.004);
  const posX = x;
  const posY = y + bobOffset;

  // Body gradient circle for subtle depth
  const bodyGradient = ctx.createRadialGradient(posX - explorer.radius / 3, posY - explorer.radius / 3, explorer.radius / 3, posX, posY, explorer.radius);
  bodyGradient.addColorStop(0, '#4facf7');
  bodyGradient.addColorStop(1, '#1269a9');
  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.arc(posX, posY, explorer.radius, 0, Math.PI * 2);
  ctx.fill();

  // Eyes with subtle blinking animation
  ctx.fillStyle = 'white';
  const eyeOpen = (Math.sin(time * 0.01) > 0.3);
  const eyeHeight = eyeOpen ? 9 : 3;
  ctx.beginPath();
  ctx.ellipse(posX - 7, posY - 5, 6, eyeHeight, 0, 0, Math.PI * 2);
  ctx.ellipse(posX + 7, posY - 5, 6, eyeHeight, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#30475e';
  const pupilYOffset = eyeOpen ? -2 : 0;
  ctx.beginPath();
  ctx.arc(posX - 7, posY + pupilYOffset, 3, 0, Math.PI * 2);
  ctx.arc(posX + 7, posY + pupilYOffset, 3, 0, Math.PI * 2);
  ctx.fill();

  // Wacky explorer hat (green crooked triangle) with subtle color shading
  const hatGradient = ctx.createLinearGradient(posX, posY - 50, posX, posY - 25);
  hatGradient.addColorStop(0, '#3d9b35');
  hatGradient.addColorStop(1, '#2e6b29');
  ctx.fillStyle = hatGradient;
  ctx.beginPath();
  ctx.moveTo(posX - 20, posY - 25);
  ctx.lineTo(posX + 20, posY - 25);
  ctx.lineTo(posX, posY - 50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#245117';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Backpack (orange oval) with light gradient and subtle shadow
  const bpGradient = ctx.createRadialGradient(posX, posY + 15, 5, posX, posY + 15, 20);
  bpGradient.addColorStop(0, '#f7b733');
  bpGradient.addColorStop(1, '#c46300');
  ctx.fillStyle = bpGradient;
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.ellipse(posX, posY + 15, 18, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Smile with smooth line
  ctx.strokeStyle = '#1f2e44';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(posX, posY + 5, 10, 0, Math.PI, false);
  ctx.stroke();
}

// Draw shapes with subtle wobble animation, soft shadows, and refined stroke
function drawShape(shape, time) {
  ctx.save();
  ctx.translate(shape.x, shape.y);
  // Wobble rotation small angle for gentle life
  const wobbleAngle = 0.04 * Math.sin(time * 0.006 + shape.x * 0.01);
  ctx.rotate(wobbleAngle);

  // Soft shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = shape.color;
  ctx.strokeStyle = '#2b2d42';
  ctx.lineWidth = 3;

  switch (shape.type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, shapeSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'square':
      ctx.beginPath();
      ctx.rect(-shapeSize / 2, -shapeSize / 2, shapeSize, shapeSize);
      ctx.fill();
      ctx.stroke();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, -shapeSize / 2);
      ctx.lineTo(shapeSize / 2, shapeSize / 2);
      ctx.lineTo(-shapeSize / 2, shapeSize / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
  }

  // Number inside shape with mild drop shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Comic Sans MS';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(shape.value, 0, 2);

  ctx.restore();
}

// Draw Wobbly the Wise Wombat with subtle animation and soft shading
function drawGuide(text, time) {
  const baseX = 640;
  const baseY = 80 + 3 * Math.sin(time * 0.003);

  // Body (brown oval with gradient and shadow)
  const bodyGradient = ctx.createRadialGradient(baseX, baseY + 40, 10, baseX, baseY + 40, 40);
  bodyGradient.addColorStop(0, '#a1887f');
  bodyGradient.addColorStop(1, '#8d6e63');
  ctx.fillStyle = bodyGradient;
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(baseX, baseY + 40, 30, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Head (lighter brown circle with subtle shading)
  ctx.fillStyle = '#b7a394';
  ctx.beginPath();
  ctx.arc(baseX, baseY, 25, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (white ovals with subtle blink)
  ctx.fillStyle = 'white';
  const eyeHeight = (Math.sin(time * 0.02) > 0.3) ? 9 : 3;
  ctx.beginPath();
  ctx.ellipse(baseX - 8, baseY - 5, 6, eyeHeight, 0, 0, Math.PI * 2);
  ctx.ellipse(baseX + 8, baseY - 5, 6, eyeHeight, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = '#4e342e';
  ctx.beginPath();
  ctx.arc(baseX - 8, baseY - 2, 3, 0, Math.PI * 2);
  ctx.arc(baseX + 8, baseY - 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (smile)
  ctx.strokeStyle = '#4e342e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(baseX, baseY + 10, 12, 0, Math.PI, false);
  ctx.stroke();

  // Speech bubble with soft shadow and subtle pastel color background
  const bubbleX = baseX - 210;
  const bubbleY = baseY - 70;
  const bubbleWidth = 200;
  const bubbleHeight = 70;
  const radius = 15;

  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 6;

  ctx.fillStyle = '#fff9f6';
  ctx.strokeStyle = '#4e342e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bubbleX + radius, bubbleY);
  ctx.lineTo(bubbleX + bubbleWidth - radius, bubbleY);
  ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + radius);
  ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - radius);
  ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - radius, bubbleY + bubbleHeight);
  ctx.lineTo(bubbleX + 70, bubbleY + bubbleHeight);
  ctx.lineTo(bubbleX + 60, bubbleY + bubbleHeight + 15);
  ctx.lineTo(bubbleX + 60, bubbleY + bubbleHeight);
  ctx.lineTo(bubbleX + radius, bubbleY + bubbleHeight);
  ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - radius);
  ctx.lineTo(bubbleX, bubbleY + radius);
  ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Text inside bubble with word wrap in warm color
  ctx.fillStyle = '#3a2e2a';
  ctx.font = '16px Comic Sans MS';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  wrapText(ctx, text, bubbleX + 15, bubbleY + 15, bubbleWidth - 30, 22);
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      context.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  context.fillText(line, x, y);
}

function spawnShapes() {
  collectibleShapes = [];
  const padding = shapeSize + 10;
  for (let i = 0; i < 7; i++) {
    const typeIndex = Math.floor(Math.random() * shapes.length);
    const type = shapes[typeIndex];
    let value;
    switch (type) {
      case 'circle':
        value = 1;
        break;
      case 'square':
        value = 2;
        break;
      case 'triangle':
        value = 3;
        break;
    }
    const x = Math.random() * (gameWidth - 2 * padding) + padding;
    const y = Math.random() * (gameHeight - 2 * padding - 80) + 80 + 10; // keep 10px safe margin top-bottom.
    collectibleShapes.push({ x, y, type, color: shapeColors[typeIndex], value, collected: false });
  }
}

function update() {
  if (keysPressed.ArrowUp || keysPressed.KeyW) {
    explorer.y -= explorer.speed;
    if (explorer.y - explorer.radius < 0) explorer.y = explorer.radius;
  }
  if (keysPressed.ArrowDown || keysPressed.KeyS) {
    explorer.y += explorer.speed;
    if (explorer.y + explorer.radius > gameHeight) explorer.y = gameHeight - explorer.radius;
  }
  if (keysPressed.ArrowLeft || keysPressed.KeyA) {
    explorer.x -= explorer.speed;
    if (explorer.x - explorer.radius < 0) explorer.x = explorer.radius;
  }
  if (keysPressed.ArrowRight || keysPressed.KeyD) {
    explorer.x += explorer.speed;
    if (explorer.x + explorer.radius > gameWidth) explorer.x = gameWidth - explorer.radius;
  }

  collectibleShapes.forEach(shape => {
    if (!shape.collected) {
      const dx = explorer.x - shape.x;
      const dy = explorer.y - shape.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < explorer.radius + shapeSize / 2 - 5) {
        shape.collected = true;
        collected.push(shape.value);
        playCorrectSound();
      }
    }
  });

  if (!showQuestion && collected.length >= 3) {
    createQuestion();
    showQuestion = true;
    message = 'Type the answer and press Enter';
  }
}

function createQuestion() {
  const sum = collected.reduce((acc, v) => acc + v, 0);
  question = {
    text: `Ellie collected shapes worth these numbers: ${collected.join(', ')}. What is the total?`,
    correctAnswer: sum
  };
}

function drawCollectedShapes(time) {
  // Background bar with subtle blur and soft border glow effect
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#34515cdd';
  ctx.fillRect(0, 0, gameWidth, 60);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#406a75cc';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(0, 0, gameWidth, 60);
  ctx.restore();

  // Title text with subtle light gradient
  const textGradient = ctx.createLinearGradient(0, 10, 0, 40);
  textGradient.addColorStop(0, '#d9f0f7');
  textGradient.addColorStop(1, '#9dbecd');
  ctx.fillStyle = textGradient;
  ctx.font = '22px Comic Sans MS';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Collected shapes:', 14, 8);

  collected.forEach((val, i) => {
    const baseX = 150 + i * 42;
    const baseY = 32 + (2 * Math.sin(time * 0.015 + i));
    // Outer halo circle
    const haloGradient = ctx.createRadialGradient(baseX, baseY, 16, baseX, baseY, 24);
    haloGradient.addColorStop(0, 'rgba(255,255,255,0.5)');
    haloGradient.addColorStop(1, 'rgba(15,81,50,0)');
    ctx.fillStyle = haloGradient;
    ctx.beginPath();
    ctx.arc(baseX, baseY, 26, 0, Math.PI * 2);
    ctx.fill();

    // Shape circle background
    ctx.fillStyle = '#d1e7dd';
    ctx.strokeStyle = '#0f5132';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(baseX, baseY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f5132';
    ctx.font = 'bold 18px Comic Sans MS';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(val, baseX, baseY);
  });
}

let userInput = '';

function drawInputBox() {
  if (!showQuestion) return;

  const boxX = 100;
  const boxY = 420;
  const boxW = 520;
  const boxH = 50;

  // Background with subtle inner shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.shadowBlur = 0;

  // Border with gradient
  const borderGradient = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
  borderGradient.addColorStop(0, '#30475e');
  borderGradient.addColorStop(1, '#43677d');
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.restore();

  ctx.fillStyle = '#30475e';
  ctx.font = '26px Comic Sans MS';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Your answer: ' + userInput, boxX + 15, boxY + boxH / 2);
  canvas.setAttribute('aria-live', 'polite');
}

function drawMessage() {
  if (!message) return;

  ctx.save();

  // Backdrop with blurred shadow
  ctx.shadowColor = 'rgba(48, 71, 94, 0.8)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.strokeStyle = '#30475e';
  ctx.lineWidth = 4;

  const w = 440;
  const h = 100;
  const x = (gameWidth - w) / 2;
  const y = gameHeight / 2 - h / 2;

  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(x, y, w, h, 20)
    : roundedRect(ctx, x, y, w, h, 20);
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;

  ctx.fillStyle = '#30475e';
  ctx.font = '24px Comic Sans MS';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, x + w / 2, y + h / 2);

  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Polyfill for ctx.roundRect for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    x,
    y,
    width,
    height,
    radius
  ) {
    if (typeof radius === 'number') {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
      let defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
      for (let side in defaultRadius) {
        radius[side] = radius[side] || 0;
      }
    }
    this.beginPath();
    this.moveTo(x + radius.tl, y);
    this.lineTo(x + width - radius.tr, y);
    this.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    this.lineTo(x + width, y + height - radius.br);
    this.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    this.lineTo(x + radius.bl, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    this.lineTo(x, y + radius.tl);
    this.quadraticCurveTo(x, y, x + radius.tl, y);
    this.closePath();
  };
}

let startTime = null;
let bgTone = playBackgroundTone();

function gameLoop(timestamp) {
  if (!startTime) startTime = timestamp;
  const elapsed = timestamp - startTime;

  update();
  drawBackground(elapsed);

  drawCollectedShapes(elapsed);
  collectibleShapes.forEach(shape => {
    if (!shape.collected) drawShape(shape, elapsed);
  });

  drawExplorer(explorer.x, explorer.y, elapsed);
  if (showQuestion) {
    drawInputBox();
    drawMessage();
  }

  drawGuide(
    showQuestion
      ? question.text
      : `Hello, I'm Wobbly! Find shapes and collect their numbers. Then answer the math puzzle!`,
    elapsed
  );

  requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.code;
  keysPressed[k] = true;

  if (showQuestion) {
    if (k === 'Enter') {
      if (/^\d+$/.test(userInput)) {
        const userAnswer = parseInt(userInput);
        if (userAnswer === question.correctAnswer) {
          message = 'Correct! Well done!';
          playCorrectSound();
          resetGameAfterDelay();
        } else {
          message = 'Oops, try again!';
          playWrongSound();
        }
      } else {
        message = 'Please enter a number!';
        playWrongSound();
      }
      userInput = '';
      e.preventDefault();
    } else if (k === 'Backspace') {
      e.preventDefault();
      userInput = userInput.slice(0, -1);
    } else if (/Digit[0-9]/.test(k) || /^[0-9]$/.test(e.key)) {
      if (userInput.length < 3) {
        userInput += e.key;
      }
      e.preventDefault();
    }
  } else {
    if (k === 'KeyH') {
      message = instructions;
      if (messageTimeout) clearTimeout(messageTimeout);
      messageTimeout = setTimeout(() => (message = ''), 10000);
    }
  }
});

window.addEventListener('keyup', e => {
  keysPressed[e.code] = false;
});

function resetGameAfterDelay() {
  setTimeout(() => {
    collected = [];
    userInput = '';
    showQuestion = false;
    message = '';
    spawnShapes();
  }, 4000);
}

spawnShapes();
message = instructions;
messageTimeout = setTimeout(() => (message = ''), 10000);
requestAnimationFrame(gameLoop);