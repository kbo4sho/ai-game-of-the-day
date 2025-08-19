const gameWidth = 720;
const gameHeight = 480;
const tileSize = 48;
const rows = Math.floor(gameHeight / tileSize);
const cols = Math.floor(gameWidth / tileSize);

const stage = document.getElementById('game-of-the-day-stage');
stage.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.width = gameWidth;
canvas.height = gameHeight;
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

class Character {
  constructor(x, y, color, name) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = tileSize * 0.8;
    this.name = name;
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    // head
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, -this.size * 0.3, this.size * 0.25, 0, 2 * Math.PI);
    ctx.fill();

    // body
    ctx.fillRect(-this.size * 0.2, -this.size * 0.3, this.size * 0.4, this.size * 0.6);

    // eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(-this.size * 0.1, -this.size * 0.35, this.size * 0.07, 0, 2 * Math.PI);
    ctx.arc(this.size * 0.1, -this.size * 0.35, this.size * 0.07, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(-this.size * 0.1, -this.size * 0.35, this.size * 0.03, 0, 2 * Math.PI);
    ctx.arc(this.size * 0.1, -this.size * 0.35, this.size * 0.03, 0, 2 * Math.PI);
    ctx.fill();

    // mouth
    ctx.beginPath();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.moveTo(-this.size * 0.12, -this.size * 0.2);
    ctx.quadraticCurveTo(0, -this.size * 0.1, this.size * 0.12, -this.size * 0.2);
    ctx.stroke();

    // name
    ctx.fillStyle = 'white';
    ctx.font = '14px Comic Sans MS';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, 0, this.size * 0.5);

    ctx.restore();
  }
}

class Explorer extends Character {
  constructor(x, y) {
    super(x, y, '#1565C0', 'You');
    this.speed = 3;
  }
  update(keys) {
    if (keys['ArrowUp'] || keys['w']) this.y -= this.speed;
    if (keys['ArrowDown'] || keys['s']) this.y += this.speed;
    if (keys['ArrowLeft'] || keys['a']) this.x -= this.speed;
    if (keys['ArrowRight'] || keys['d']) this.x += this.speed;
    // Clamp inside map
    this.x = Math.min(gameWidth - this.size / 2, Math.max(this.size / 2, this.x));
    this.y = Math.min(gameHeight - this.size / 2, Math.max(this.size / 2, this.y));
  }
}

class MathNPC extends Character {
  constructor(x, y, question, answer) {
    super(x, y, '#D84315', 'NPC');
    this.question = question;
    this.answer = answer;
    this.solved = false;
  }
  interact(player) {
    if (this.solved) return 'Already solved!';
    // simple prompt for answer
    let playerAnswer = prompt(this.question + ' ?');
    if (playerAnswer === null) return 'Cancelled.';
    if (parseInt(playerAnswer.trim()) === this.answer) {
      this.solved = true;
      return 'Correct! Well done!';
    } else {
      return 'Oops, try again next time.';
    }
  }
  draw() {
    super.draw();
    if (!this.solved) {
      // draw a math bubble above NPC
      ctx.save();
      ctx.fillStyle = 'yellow';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.font = '18px Comic Sans MS';
      ctx.textAlign = 'center';
      let bubbleX = this.x;
      let bubbleY = this.y - this.size * 0.7;
      let text = '?';
      let metrics = ctx.measureText(text);
      let pad = 10;
      let width = metrics.width + pad * 2;
      let height = 30;
      ctx.beginPath();
      // rounded rect
      ctx.moveTo(bubbleX - width/2 + 8, bubbleY - height/2);
      ctx.lineTo(bubbleX + width/2 - 8, bubbleY - height/2);
      ctx.quadraticCurveTo(bubbleX + width/2, bubbleY - height/2, bubbleX + width/2, bubbleY - height/2 + 8);
      ctx.lineTo(bubbleX + width/2, bubbleY + height/2 - 8);
      ctx.quadraticCurveTo(bubbleX + width/2, bubbleY + height/2, bubbleX + width/2 - 8, bubbleY + height/2);
      ctx.lineTo(bubbleX - width/2 + 8, bubbleY + height/2);
      ctx.quadraticCurveTo(bubbleX - width/2, bubbleY + height/2, bubbleX - width/2, bubbleY + height/2 - 8);
      ctx.lineTo(bubbleX - width/2, bubbleY - height/2 + 8);
      ctx.quadraticCurveTo(bubbleX - width/2, bubbleY - height/2, bubbleX - width/2 + 8, bubbleY - height/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'black';
      ctx.fillText(text, bubbleX, bubbleY + 6);
      ctx.restore();
    }
  }
}

class TreasureChest {
  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.size = tileSize * 0.6;
    this.value = value;
    this.opened = false;
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.opened ? '#FFD700' : '#6D4C41';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    // base rectangle
    ctx.fillRect(-this.size/2, -this.size/4, this.size, this.size * 0.6);
    ctx.strokeRect(-this.size/2, -this.size/4, this.size, this.size * 0.6);
    // lid
    ctx.beginPath();
    ctx.moveTo(-this.size/2, -this.size/4);
    ctx.lineTo(0, -this.size/2);
    ctx.lineTo(this.size/2, -this.size/4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!this.opened) {
      // lock detail
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  interact(player) {
    if (this.opened) return 'You already got this treasure.';
    let guess = prompt(`Solve to open the chest!\nWhat is ${this.value.a} + ${this.value.b} ?`);
    if (guess === null) return 'Maybe later.';
    if (parseInt(guess.trim()) === (this.value.a + this.value.b)) {
      this.opened = true;
      treasuresFound++;
      return `You found ${this.value.reward} gold coins!`;
    } else {
      return 'Wrong answer, the chest remains locked.';
    }
  }
}
class World {
  constructor() {
    this.backgroundColor = '#87ceeb'; // sky blue
    this.groundColor = '#4caf50'; // grass green
    this.waterColor = '#2196f3'; // water blue
    // map outline for water tiles
    this.waterTiles = new Set();
    // Spawn water patterns (rivers/lakes)
    for (let r = 8; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((c + r) % 13 === 0 || (c * r) % 7 === 0) {
          this.waterTiles.add(r + '-' + c);
        }
      }
    }
  }
  drawTile(x, y, r, c) {
    if (this.waterTiles.has(r + '-' + c)) {
      ctx.fillStyle = this.waterColor;
      ctx.fillRect(x, y, tileSize, tileSize);
      // subtle waves
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      for(let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + (i + 0.5)*tileSize/3, y + tileSize/2, tileSize/8, 0, Math.PI);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = this.groundColor;
      ctx.fillRect(x, y, tileSize, tileSize);
      // draw grass blips randomly
      if(Math.random() < 0.1) {
        ctx.fillStyle = '#388E3C';
        let gx = x + Math.random()*tileSize;
        let gy = y + Math.random()*tileSize;
        ctx.beginPath();
        ctx.ellipse(gx, gy, 3, 6, Math.random()*Math.PI, 0, 2*Math.PI);
        ctx.fill();
      }
    }
  }
  draw() {
    // sky background
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, gameWidth, gameHeight);
    // tiles
    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        this.drawTile(c * tileSize, r * tileSize, r, c);
      }
    }
    // horizon line
    ctx.strokeStyle = '#2E7D32';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, gameHeight - tileSize * 2);
    ctx.lineTo(gameWidth, gameHeight - tileSize * 2);
    ctx.stroke();
  }
}

// Game Variables
const explorer = new Explorer(gameWidth/2, gameHeight/2);
const npcs = [
  new MathNPC(tileSize*3 + tileSize/2, tileSize*4 + tileSize/2, 'What is 4 + 3', 7),
  new MathNPC(tileSize*10 + tileSize/2, tileSize*7 + tileSize/2, 'What is 5 * 2', 10),
  new MathNPC(tileSize*15 + tileSize/2, tileSize*3 + tileSize/2, 'What is 9 - 6', 3)
];
const chests = [
  new TreasureChest(tileSize*5 + tileSize/2, tileSize*10 + tileSize/2, {a:6,b:2, reward:50}),
  new TreasureChest(tileSize*12 + tileSize/2, tileSize*8 + tileSize/2, {a:7,b:5, reward:70}),
  new TreasureChest(tileSize*18 + tileSize/2, tileSize*11 + tileSize/2, {a:3,b:9, reward:60})
];
let treasuresFound = 0;
const maxTreasures = chests.length;
const world = new World();

let keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  // Detect if near NPC or chest (within 50px)
  let msg = '';
  for (const npc of npcs) {
    if (!npc.solved && distance(clickX, clickY, npc.x, npc.y) < 50) {
      msg = npc.interact(explorer);
      alert(msg);
      return;
    }
  }
  for (const chest of chests) {
    if (!chest.opened && distance(clickX, clickY, chest.x, chest.y) < 50) {
      msg = chest.interact(explorer);
      alert(msg);
      return;
    }
  }
});

function distance(x1,y1,x2,y2){
  return Math.sqrt((x1-x2)**2 + (y1-y2)**2);
}

// Draw UI Elements
function drawUI() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, gameHeight - 40, gameWidth, 40);

  ctx.fillStyle = '#FFF';
  ctx.font = '20px Comic Sans MS';
  ctx.textAlign = 'left';
  ctx.fillText(`Gold coins found: ${treasuresFound} / ${maxTreasures}`, 10, gameHeight - 12);

  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'right';
  ctx.fillText('Use arrow keys or WASD to move. Click NPCs or chests to interact.', gameWidth - 10, gameHeight - 12);
  ctx.restore();
}

// Draw player’s aura effect to stand out
function drawExplorerAura(x, y) {
  const grad = ctx.createRadialGradient(x, y - explorer.size * 0.3, explorer.size * 0.3, x, y - explorer.size * 0.3, explorer.size);
  grad.addColorStop(0, 'rgba(21, 101, 192, 0.5)');
  grad.addColorStop(1, 'rgba(21, 101, 192, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y - explorer.size * 0.3, explorer.size, explorer.size * 0.75, 0, 0, 2*Math.PI);
  ctx.fill();
}

function gameLoop() {
  // Update
  explorer.update(keys);

  // Draw
  world.draw();

  for (const chest of chests) chest.draw();
  for (const npc of npcs) npc.draw();

  drawExplorerAura(explorer.x, explorer.y);
  explorer.draw();

  drawUI();

  // Victory message if all treasures found
  if (treasuresFound === maxTreasures) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, gameWidth, gameHeight);
    ctx.fillStyle = '#FFD700';
    ctx.font = '48px Comic Sans MS';
    ctx.textAlign = 'center';
    ctx.fillText('Congratulations!', gameWidth/2, gameHeight/2 - 20);
    ctx.font = '26px Comic Sans MS';
    ctx.fillText('You found all treasures and mastered math!', gameWidth/2, gameHeight/2 + 20);
    ctx.restore();
  } else {
    requestAnimationFrame(gameLoop);
  }
}

// Start the game loop
gameLoop();