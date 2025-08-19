const gameContainer = document.getElementById('game-of-the-day-stage');
gameContainer.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
gameContainer.appendChild(canvas);
const ctx = canvas.getContext('2d');

class Vector {
  constructor(x, y) { this.x = x; this.y = y; }
  add(v) { return new Vector(this.x + v.x, this.y + v.y); }
  subtract(v) { return new Vector(this.x - v.x, this.y - v.y); }
  multiply(s) { return new Vector(this.x * s, this.y * s); }
  magnitude() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize() {
    const mag = this.magnitude();
    return mag === 0 ? new Vector(0, 0) : new Vector(this.x / mag, this.y / mag);
  }
}

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// Game world settings
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const VIEW_WIDTH = canvas.width;
const VIEW_HEIGHT = canvas.height;

// Player character
const player = {
  pos: new Vector(WORLD_WIDTH / 2, WORLD_HEIGHT / 2),
  speed: 3,
  size: 28,
  color: '#3b6',
  move() {
    let vel = new Vector(0,0);
    if (keys['w'] || keys['arrowup']) vel = vel.add(new Vector(0, -1));
    if (keys['s'] || keys['arrowdown']) vel = vel.add(new Vector(0, 1));
    if (keys['a'] || keys['arrowleft']) vel = vel.add(new Vector(-1, 0));
    if (keys['d'] || keys['arrowright']) vel = vel.add(new Vector(1, 0));
    vel = vel.normalize().multiply(this.speed);
    this.pos = this.pos.add(vel);
    // clamp to world
    this.pos.x = Math.min(WORLD_WIDTH, Math.max(0, this.pos.x));
    this.pos.y = Math.min(WORLD_HEIGHT, Math.max(0, this.pos.y));
  },
  draw(cx, cxWorldPos) {
    // cute explorer character with hat and backpack
    const screenX = this.pos.x - cxWorldPos.x;
    const screenY = this.pos.y - cxWorldPos.y;
    const size = this.size;
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.fillStyle = this.color;

    // body
    ctx.beginPath();
    ctx.ellipse(0, 5, size * 0.4, size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.beginPath();
    ctx.fillStyle = '#f5d6b4';
    ctx.ellipse(0, -size * 0.4, size * 0.32, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // hat
    ctx.beginPath();
    ctx.fillStyle = '#6a3d00';
    ctx.moveTo(-size * 0.35, -size * 0.65);
    ctx.lineTo(size * 0.35, -size * 0.65);
    ctx.lineTo(0, -size * 1.05);
    ctx.closePath();
    ctx.fill();

    // backpack
    ctx.fillStyle = '#996633';
    ctx.fillRect(-size * 0.25, 2, size * 0.5, size * 0.7);

    ctx.restore();
  }
};

// Math challenge NPC
class MathNPC {
  constructor(x, y, characterColor) {
    this.pos = new Vector(x, y);
    this.size = 32;
    this.color = characterColor;
    this.active = true;
    this.correctAnswer = null;
    this.question = null;
    this.questionAsked = false;
    this.awaitAnswer = false;
    this.answerEntered = '';
    this.feedback = '';
    this.type = ['+', '-', '*'][Math.floor(Math.random() * 3)];
  }

  generateQuestion() {
    let a = Math.floor(Math.random() * 10 + 1);
    let b = Math.floor(Math.random() * 10 + 1);
    if (this.type === '-') {
      if (a < b) [a, b] = [b, a]; // prevent negative results
      this.correctAnswer = a - b;
      this.question = `${a} - ${b} = ?`;
    } else if (this.type === '+') {
      this.correctAnswer = a + b;
      this.question = `${a} + ${b} = ?`;
    } else if (this.type === '*') {
      a = Math.floor(Math.random() * 6 + 1);
      b = Math.floor(Math.random() * 6 + 1);
      this.correctAnswer = a * b;
      this.question = `${a} × ${b} = ?`;
    }
    this.questionAsked = true;
    this.awaitAnswer = true;
    this.answerEntered = '';
    this.feedback = '';
  }

  draw(cxWorldPos) {
    if (!this.active) return;
    const sx = this.pos.x - cxWorldPos.x;
    const sy = this.pos.y - cxWorldPos.y;
    if (sx < -this.size || sx > VIEW_WIDTH + this.size ||
        sy < -this.size || sy > VIEW_HEIGHT + this.size) return;

    ctx.save();
    ctx.translate(sx, sy);

    // body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(0, 5, this.size * 0.45, this.size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.fillStyle = '#ffdca8';
    ctx.beginPath();
    ctx.ellipse(0, -this.size * 0.5, this.size * 0.35, this.size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(-this.size * 0.12, -this.size * 0.45, 4, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(this.size * 0.12, -this.size * 0.45, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // mouth
    ctx.strokeStyle = '#884400';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -this.size * 0.3);
    ctx.quadraticCurveTo(0, -this.size * 0.15, 8, -this.size * 0.3);
    ctx.stroke();

    ctx.restore();

    // If player close, show speech bubble & question or feedback
    const distToPlayer = this.pos.subtract(player.pos).magnitude();
    if (distToPlayer < 100) {
      if (!this.questionAsked) this.generateQuestion();

      // bubble position
      let bubbleX = sx + this.size;
      if (bubbleX + 200 > VIEW_WIDTH) bubbleX = sx - 210;
      let bubbleY = sy - this.size - 70;

      ctx.fillStyle = '#fffefa';
      ctx.strokeStyle = '#553311';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 9;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      
      ctx.beginPath();
      ctx.moveTo(bubbleX + 10, bubbleY);
      ctx.lineTo(bubbleX + 190, bubbleY);
      ctx.quadraticCurveTo(bubbleX + 200, bubbleY, bubbleX + 200, bubbleY + 10);
      ctx.lineTo(bubbleX + 200, bubbleY + 70);
      ctx.quadraticCurveTo(bubbleX + 200, bubbleY + 80, bubbleX + 190, bubbleY + 80);
      ctx.lineTo(bubbleX + 60, bubbleY + 80);
      ctx.lineTo(bubbleX + 50, bubbleY + 90);
      ctx.lineTo(bubbleX + 50, bubbleY + 80);
      ctx.lineTo(bubbleX + 10, bubbleY + 80);
      ctx.quadraticCurveTo(bubbleX, bubbleY + 80, bubbleX, bubbleY + 70);
      ctx.lineTo(bubbleX, bubbleY + 10);
      ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + 10, bubbleY);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';

      ctx.stroke();
      ctx.fillStyle = '#3b3a2f';
      ctx.font = '16px Courier New, monospace';

      if (this.awaitAnswer) {
        ctx.fillText(this.question, bubbleX + 15, bubbleY + 30);
        ctx.fillText('Your Answer:', bubbleX + 15, bubbleY + 55);
        ctx.fillStyle = '#222';
        ctx.fillRect(bubbleX + 15, bubbleY + 58, 170, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText(this.answerEntered || '_', bubbleX + 20, bubbleY + 74);
      } else {
        ctx.fillText(this.feedback, bubbleX + 15, bubbleY + 40);
        ctx.fillText("Walk away to continue", bubbleX + 15, bubbleY + 65);
      }
    }
  }

  interact() {
    if (!this.awaitAnswer) return;
    // Check answer (number only)
    let ansNum = parseInt(this.answerEntered);
    if (ansNum === this.correctAnswer) {
      this.feedback = "Correct! +5 XP";
      this.awaitAnswer = false;
      this.active = false;
      playerXP += 5;
      messages.push({text:'You earned 5 XP!', timer:120});
    } else if (!isNaN(ansNum)) {
      this.feedback = "Oops! Try again.";
      this.answerEntered = '';
    }
  }
}

// Multiple NPCs scattered around the world
const npcs = [];
const npcColors = ['#8A2BE2', '#DC143C', '#006400', '#FF8C00'];
for(let i = 0; i < 7; i++) {
  let nx = Math.random() * (WORLD_WIDTH - 200) + 100;
  let ny = Math.random() * (WORLD_HEIGHT - 200) + 100;
  npcs.push(new MathNPC(nx, ny, npcColors[i % npcColors.length]));
}

// Collectible items (shiny math symbols) that give hints
class Collectible {
  constructor(x, y, symbol) {
    this.pos = new Vector(x, y);
    this.symbol = symbol;
    this.size = 24;
    this.collected = false;
  }
  draw(cxWorldPos) {
    if (this.collected) return;
    const sx = this.pos.x - cxWorldPos.x;
    const sy = this.pos.y - cxWorldPos.y;
    if (sx < -this.size || sx > VIEW_WIDTH + this.size ||
        sy < -this.size || sy > VIEW_HEIGHT + this.size) return;
    ctx.save();
    ctx.translate(sx, sy);
    // glow ring
    ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffde59';
    ctx.beginPath();
    ctx.arc(0, 0, this.size * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // symbol
    ctx.fillStyle = '#8b7500';
    ctx.font = 'bold 28px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.symbol, 0, 0);

    ctx.restore();
  }
}
const collectibles = [
  new Collectible(500, 1300, '+'),
  new Collectible(1400, 600, '-'),
  new Collectible(1700, 1500, '×'),
];

// Simple particle effects on collection
const particles = [];
function createParticles(x, y, color) {
  for(let i = 0; i < 15; i++) {
    particles.push({
      pos: new Vector(x, y),
      vel: new Vector(Math.random()*2-1, Math.random()*-2 - 0.5),
      alpha: 1,
      size: 3 + Math.random()*3,
      color: color,
      life: 60
    })
  }
}

// Messages that appear on screen temporarily
const messages = [];
function drawMessages() {
  let baseY = VIEW_HEIGHT - 90;
  ctx.font = '20px Arial';
  ctx.fillStyle = "white";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  for(let i = 0; i < messages.length; i++) {
    let m = messages[i];
    ctx.strokeText(m.text, 20, baseY - i*26);
    ctx.fillText(m.text, 20, baseY - i*26);
    m.timer--;
  }
  // Remove expired messages
  for(let i = messages.length-1; i>=0; i--) {
    if (messages[i].timer <= 0) messages.splice(i,1);
  }
}

// Player experience and leveling
let playerXP = 0;
let playerLevel = 1;
function updateLevel() {
  const xpForNext = playerLevel * 10 + 10;
  if (playerXP >= xpForNext) {
    playerXP -= xpForNext;
    playerLevel++;
    messages.push({text: `Level Up! You are now level ${playerLevel}!`, timer: 240});
  }
}

// Camera logic to follow player but keep world bounds in view
function getCameraPosition() {
  let camX = player.pos.x - VIEW_WIDTH / 2;
  let camY = player.pos.y - VIEW_HEIGHT / 2;
  camX = Math.min(WORLD_WIDTH - VIEW_WIDTH, Math.max(0, camX));
  camY = Math.min(WORLD_HEIGHT - VIEW_HEIGHT, Math.max(0, camY));
  return new Vector(camX, camY);
}

// Background tiles for scenery
const tileSize = 64;
const tilesX = Math.ceil(WORLD_WIDTH / tileSize);
const tilesY = Math.ceil(WORLD_HEIGHT / tileSize);
function drawBackground(cxWorldPos) {
  for(let x=0; x<tilesX; x++) {
    for(let y=0; y<tilesY; y++) {
      const sx = x * tileSize - cxWorldPos.x;
      const sy = y * tileSize - cxWorldPos.y;
      if (sx + tileSize < 0 || sx > VIEW_WIDTH || sy + tileSize < 0 || sy > VIEW_HEIGHT) continue;

      // alternating tile pattern: grass & dirt patches
      if ((x+y) % 5 === 0) {
        ctx.fillStyle = '#a4d77d';
        ctx.fillRect(sx, sy, tileSize, tileSize);
        // small flowers randomly dotted
        if (Math.random() < 0.05) {
          ctx.fillStyle = '#ff527a';
          ctx.beginPath();
          ctx.ellipse(sx + tileSize/2, sy + tileSize/2, 6, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#7b5e00';
        ctx.fillRect(sx, sy, tileSize, tileSize);
        // some grass spikes
        ctx.fillStyle = '#4c7713';
        for(let i=0; i<3; i++) {
          const gx = sx + 10 + i*18;
          ctx.beginPath();
          ctx.moveTo(gx, sy + tileSize);
          ctx.lineTo(gx + 5, sy + tileSize - 18);
          ctx.lineTo(gx + 9, sy + tileSize);
          ctx.fill();
        }
      }
    }
  }
}

// UI Draw
function drawUI() {
  // XP bar
  const barX = 20;
  const barY = 10;
  const barWidth = 200;
  const barHeight = 24;
  const xpForNext = playerLevel * 10 + 10;
  const progress = Math.min(1, playerXP / xpForNext);

  ctx.fillStyle = '#222b';
  ctx.fillRect(barX-2, barY-2, barWidth + 4, barHeight + 4);
  ctx.fillStyle = '#667c1c';
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = '#aadb4c';
  ctx.fillRect(barX, barY, barWidth * progress, barHeight);

  // Level text
  ctx.fillStyle = '#eaf8a6';
  ctx.font = 'bold 18px Arial';
  ctx.strokeStyle = '#444a00';
  ctx.lineWidth = 2;
  const lvlText = `Level: ${playerLevel}`;
  ctx.strokeText(lvlText, barX + barWidth + 15, barY + 18);
  ctx.fillText(lvlText, barX + barWidth + 15, barY + 18);

  // Instruction
  ctx.font = '16px Arial';
  ctx.fillStyle = '#efe7e0cc';
  ctx.fillText('Use WASD or Arrow keys to move. Approach characters for math challenges.', 15, VIEW_HEIGHT - 15);
}

// Handle input for answering NPC questions
window.addEventListener('keypress', e => {
  for (const npc of npcs) {
    if (npc.awaitAnswer) {
      if (e.key >= '0' && e.key <= '9') {
        npc.answerEntered += e.key;
      } else if (e.key === 'Enter') {
        npc.interact();
      } else if (e.key === 'Backspace') {
        npc.answerEntered = npc.answerEntered.slice(0, -1);
      }
      break; // only allow one NPC input at a time
    }
  }
});

window.addEventListener('keydown', e => {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    for (const npc of npcs) {
      if (npc.awaitAnswer && npc.answerEntered.length > 0) {
        npc.answerEntered = npc.answerEntered.slice(0, -1);
        e.preventDefault();
        break;
      }
    }
  }
});

// Game loop
function update() {
  player.move();

  // Collect collectibles when close
  for (const c of collectibles) {
    if (!c.collected) {
      const d = player.pos.subtract(c.pos).magnitude();
      if (d < player.size) {
        c.collected = true;
        let hint = '';
        if (c.symbol === '+') hint = 'Hint: Addition combines numbers.';
        if (c.symbol === '-') hint = 'Hint: Subtraction finds the difference.';
        if (c.symbol === '×') hint = 'Hint: Multiplication is repeated addition.';
        messages.push({text: hint, timer: 180});
        createParticles(c.pos.x - cameraPos.x, c.pos.y - cameraPos.y, '#ffde59');
      }
    }
  }

  // Player near NPCs => activate prompt
  for (const npc of npcs) {
    const dist = npc.pos.subtract(player.pos).magnitude();
    if (dist > 130 && !npc.awaitAnswer && npc.feedback !== '') {
      // Reset question and allow new attempts when player walks away and back
      npc.questionAsked = false;
      npc.awaitAnswer = false;
      npc.answerEntered = '';
      npc.feedback = '';
    }
  }

  // Update level
  updateLevel();

  // Update particles
  for(let i=particles.length-1; i>=0; i--) {
    let p = particles[i];
    p.pos = p.pos.add(p.vel);
    p.vel = p.vel.multiply(0.95);
    p.life--;
    p.alpha = p.life / 60;
    if(p.life <= 0) particles.splice(i,1);
  }
}

function draw() {
  ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

  drawBackground(cameraPos);

  for (const c of collectibles) c.draw(cameraPos);

  for (const npc of npcs) npc.draw(cameraPos);

  player.draw(ctx, cameraPos);

  // Particles
  for(const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  drawUI();
  drawMessages();
}

// Main loop and variables
let cameraPos = getCameraPosition();

function gameLoop() {
  update();
  cameraPos = getCameraPosition();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();