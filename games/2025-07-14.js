const container = document.getElementById('game-of-the-day-stage');
container.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
container.appendChild(canvas);
const ctx = canvas.getContext('2d');

const TILE_SIZE = 48;
const MAP_W = 15;
const MAP_H = 10;

// Simple tile map (0 = grass, 1 = water, 2 = mountain)
const map = [
  0,0,0,0,0,0,0,1,1,1,0,0,2,2,2,
  0,0,0,0,0,0,0,1,1,1,0,0,2,2,2,
  0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,
  0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,
  0,0,0,0,2,2,2,0,0,0,0,0,0,0,0,
  0,0,0,0,2,2,2,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
];

// Colors for tiles
const TILE_COLORS = {
  0: '#7ec850', // grass green
  1: '#3b83bd', // water blue
  2: '#865d3b', // mountain brown
};

// Character sprite (simple circle with face)
class Character {
  constructor(x, y, name, color) {
    this.x = x;
    this.y = y;
    this.name = name;
    this.color = color;
    this.radius = 18;
    this.questActive = false;
    this.quest = null;
    this.solved = false;
  }

  draw(ctx, offsetX, offsetY) {
    const px = this.x * TILE_SIZE + TILE_SIZE / 2 - offsetX;
    const py = this.y * TILE_SIZE + TILE_SIZE / 2 - offsetY;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(px, py + 18, this.radius * 0.9, this.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(px, py, this.radius, 0, Math.PI * 2);
    ctx.fill();
    // Face details
    ctx.fillStyle = '#fff';
    // eyes
    ctx.beginPath();
    ctx.arc(px - 6, py - 4, 4, 0, Math.PI * 2);
    ctx.arc(px + 6, py - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(px - 6, py - 4, 2, 0, Math.PI * 2);
    ctx.arc(px + 6, py - 4, 2, 0, Math.PI * 2);
    ctx.fill();
    // mouth
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (this.solved) {
      ctx.arc(px, py + 4, 8, 0, Math.PI, false); // smile
    } else {
      ctx.moveTo(px - 5, py + 6);
      ctx.lineTo(px + 5, py + 6);
    }
    ctx.stroke();

    // Name tag
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, px, py - this.radius - 10);

    // Quest symbol
    if (this.questActive && !this.solved) {
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.moveTo(px, py - this.radius - 25);
      ctx.lineTo(px + 7, py - this.radius - 5);
      ctx.lineTo(px - 7, py - this.radius - 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('?', px, py - this.radius - 10);
    }
  }
}

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 20;
    this.color = '#1e90ff';
    this.speed = 3;
  }

  move(dx, dy, isWalkable) {
    let nx = this.x + dx;
    let ny = this.y + dy;
    // Check boundaries and walkable tiles
    const tileX = Math.floor(nx / TILE_SIZE);
    const tileY = Math.floor(ny / TILE_SIZE);
    if (
      tileX >= 0 && tileX < MAP_W &&
      tileY >= 0 && tileY < MAP_H &&
      isWalkable(tileX, tileY)
    ) {
      this.x = nx;
      this.y = ny;
    }
  }

  draw(ctx, offsetX, offsetY) {
    const px = this.x - offsetX;
    const py = this.y - offsetY;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px, py + this.radius * 0.9, this.radius * 1.1, this.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(px, py, this.radius, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px - 7, py - 8, 5, 0, Math.PI * 2);
    ctx.arc(px + 7, py - 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(px - 7, py - 8, 2.5, 0, Math.PI * 2);
    ctx.arc(px + 7, py - 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Mouth
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 8, py + 3);
    ctx.lineTo(px + 8, py + 3);
    ctx.stroke();
  }
}

// Generate sample characters with quests
const characters = [
  new Character(3, 3, 'Mia', '#e91e63'),
  new Character(11, 5, 'Rex', '#009688'),
  new Character(7, 7, 'Luna', '#ff5722'),
];

// Utility for math quests generation
function generateMathQuest() {
  const ops = ['+', '-', '*'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, question, answer;

  if (op === '+') {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    question = `What is ${a} + ${b}?`;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 20) + 10;
    b = Math.floor(Math.random() * 10) + 1;
    question = `What is ${a} - ${b}?`;
    answer = a - b;
  } else { // multiply
    a = Math.floor(Math.random() * 10) + 1;
    b = Math.floor(Math.random() * 10) + 1;
    question = `What is ${a} × ${b}?`;
    answer = a * b;
  }
  return {question, answer};
}

// Set quests on characters
characters.forEach(ch => {
  ch.questActive = true;
  ch.quest = generateMathQuest();
});

// Player initial position in pixel coords (center of a tile)
const player = new Player(1.5 * TILE_SIZE, 1.5 * TILE_SIZE);

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Check if tile walkable
function isWalkable(x, y) {
  // Water and mountains are not walkable
  return map[y * MAP_W + x] === 0;
}

// Interaction prompt & dialog state
let dialogActive = false;
let dialogCharacter = null;
let dialogInput = '';
let showMessage = '';
let messageTimer = 0;

// Draw map with simple tiles
function drawMap(ctx, offsetX, offsetY) {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = map[y * MAP_W + x];
      ctx.fillStyle = TILE_COLORS[tile] || '#000';
      ctx.fillRect(x * TILE_SIZE - offsetX, y * TILE_SIZE - offsetY, TILE_SIZE, TILE_SIZE);

      // Add grass texture lines for grass
      if (tile === 0) {
        ctx.strokeStyle = '#558833';
        ctx.lineWidth = 1;
        for (let i = 4; i < TILE_SIZE; i += 8) {
          ctx.beginPath();
          ctx.moveTo(x * TILE_SIZE - offsetX + i, y * TILE_SIZE - offsetY);
          ctx.lineTo(x * TILE_SIZE - offsetX + i - 4, y * TILE_SIZE - offsetY + TILE_SIZE);
          ctx.stroke();
        }
      }

      // Water animation
      if (tile === 1) {
        const t = Date.now() * 0.002;
        ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(t + x + y)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x * TILE_SIZE - offsetX, y * TILE_SIZE - offsetY + TILE_SIZE/2);
        ctx.lineTo(x * TILE_SIZE - offsetX + TILE_SIZE, y * TILE_SIZE - offsetY + TILE_SIZE/2);
        ctx.stroke();
      }

      // Mountain texture
      if (tile === 2) {
        ctx.fillStyle = '#6D4C41';
        ctx.beginPath();
        ctx.moveTo(x * TILE_SIZE - offsetX + TILE_SIZE/2, y * TILE_SIZE - offsetY + 5);
        ctx.lineTo(x * TILE_SIZE - offsetX + 5, y * TILE_SIZE - offsetY + TILE_SIZE - 5);
        ctx.lineTo(x * TILE_SIZE - offsetX + TILE_SIZE - 5, y * TILE_SIZE - offsetY + TILE_SIZE - 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

// Show message on top
function drawMessage(ctx) {
  if (!showMessage) return;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(60, 440, 600, 35);
  ctx.fillStyle = '#fff';
  ctx.font = '18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(showMessage, 360, 470);
}

// Draw dialog box
function drawDialog(ctx, question, input) {
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(120, 140, 480, 180);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 3;
  ctx.strokeRect(120, 140, 480, 180);

  ctx.fillStyle = '#00afff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Math Quest', 360, 180);

  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.textAlign = 'left';
  wrapText(ctx, question, 150, 230, 420, 28);

  ctx.fillStyle = '#fff';
  ctx.font = '26px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(input + (Date.now() % 1000 < 500 ? '|' : ''), 360, 310);

  ctx.font = '16px Arial';
  ctx.fillStyle = '#ccc';
  ctx.textAlign = 'center';
  ctx.fillText('Enter your answer and press Enter', 360, 360);
}

// Utility: wrapText
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    let testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, curY);
      line = words[n] + ' ';
      curY += lineHeight;
    }
    else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, curY);
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// Game loop & logic
function gameLoop() {
  // Move player
  if (!dialogActive) {
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= player.speed;
    if (keys['s'] || keys['arrowdown']) dy += player.speed;
    if (keys['a'] || keys['arrowleft']) dx -= player.speed;
    if (keys['d'] || keys['arrowright']) dx += player.speed;

    // Normalize diagonal speed
    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    player.move(dx, dy, isWalkable);
  }

  // Calculate camera offset (centered on player)
  let offsetX = player.x - canvas.width / 2;
  let offsetY = player.y - canvas.height / 2;
  // Clamp offset to map bounds
  offsetX = Math.max(0, Math.min(offsetX, MAP_W * TILE_SIZE - canvas.width));
  offsetY = Math.max(0, Math.min(offsetY, MAP_H * TILE_SIZE - canvas.height));

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw map
  drawMap(ctx, offsetX, offsetY);

  // Draw characters
  characters.forEach(ch => ch.draw(ctx, offsetX, offsetY));

  // Draw player
  player.draw(ctx, offsetX, offsetY);

  // Interaction detection
  if (!dialogActive) {
    let nearChar = null;
    for (const ch of characters) {
      const cx = ch.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = ch.y * TILE_SIZE + TILE_SIZE / 2;
      if (distance(player.x, player.y, cx, cy) < TILE_SIZE) {
        nearChar = ch;
        break;
      }
    }

    if (nearChar) {
      showMessage = `Press [E] to talk to ${nearChar.name}`;
      if (keys['e']) {
        dialogActive = true;
        dialogCharacter = nearChar;
        dialogInput = '';
        keys['e'] = false;
      }
    } else {
      showMessage = '';
    }
  }

  // Handle dialog input
  if (dialogActive) {
    drawDialog(ctx, dialogCharacter.quest.question, dialogInput);

    // Process key inputs for numbers/backspace/enter
    // Only allow digits and backspace, enter
    // Use keydown listener
  }

  // Show message timeout (3 sec)
  if (messageTimer > 0) {
    messageTimer--;
    if (messageTimer === 0) {
      showMessage = '';
    }
  }

  requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (e) => {
  if (dialogActive) {
    if (e.key === 'Enter') {
      if (dialogCharacter) {
        // Check answer
        const parsed = parseInt(dialogInput.trim());
        if (!isNaN(parsed)) {
          if (parsed === dialogCharacter.quest.answer) {
            dialogCharacter.solved = true;
            dialogCharacter.questActive = false;
            showMessage = `Correct! Well done, ${dialogCharacter.name} is happy!`;
            messageTimer = 180; // ~3 seconds at 60fps
          } else {
            showMessage = `Wrong answer, try again!`;
            messageTimer = 180;
          }
          dialogActive = false;
          dialogCharacter = null;
          dialogInput = '';
        }
      }
    } else if (e.key === 'Backspace') {
      dialogInput = dialogInput.slice(0, -1);
      e.preventDefault();
    } else if (/^\d$/.test(e.key)) {
      if (dialogInput.length < 6) dialogInput += e.key;
      e.preventDefault();
    }
  }
});

// Start game
gameLoop();