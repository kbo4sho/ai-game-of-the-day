const stageElement = document.getElementById('game-of-the-day-stage');
stageElement.innerHTML = ''; // Clear anything inside

const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
stageElement.appendChild(canvas);

const ctx = canvas.getContext('2d');

//--------------------------
// Assets (colors, shapes)
//--------------------------

const TILE_SIZE = 48;
const MAP_COLS = 15; // 720/48 = 15
const MAP_ROWS = 10; // 480/48 = 10

// Terrain types
const TERRAIN = {
  GRASS: 'grass',
  WATER: 'water',
  TREE: 'tree',
  ROAD: 'road'
};

// Colors for terrain
const TERRAIN_COLORS = {
  grass: '#6caf37',
  water: '#3680c9',
  tree: '#15561e',
  road: '#a58f7a'
};

// Player
const PLAYER_SIZE = 36;

// NPCs
const NPC_SIZE = 32;

// Math Question area height
const MATH_AREA_HEIGHT = 120;
const GAME_AREA_HEIGHT = canvas.height - MATH_AREA_HEIGHT;

//--------------------------
// Game State
//--------------------------

let keysDown = {};
let questionsAsked = 0;
let questionsCorrect = 0;

class Player {
  constructor() {
    this.x = TILE_SIZE * 2 + (TILE_SIZE - PLAYER_SIZE) / 2;
    this.y = TILE_SIZE * 2 + (TILE_SIZE - PLAYER_SIZE) / 2;
    this.speed = 3.5;
    this.color = '#f5d742';
    this.width = PLAYER_SIZE;
    this.height = PLAYER_SIZE;
    this.vx = 0;
    this.vy = 0;
  }

  update() {
    this.vx = 0; this.vy = 0;
    if (keysDown['ArrowUp'] || keysDown['w']) this.vy = -this.speed;
    if (keysDown['ArrowDown'] || keysDown['s']) this.vy = this.speed;
    if (keysDown['ArrowLeft'] || keysDown['a']) this.vx = -this.speed;
    if (keysDown['ArrowRight'] || keysDown['d']) this.vx = this.speed;

    let newX = this.x + this.vx;
    let newY = this.y + this.vy;

    // Map boundaries and collision with impassable terrain
    if (!isBlocked(newX, this.y)) this.x = newX;
    if (!isBlocked(this.x, newY)) this.y = newY;
  }

  draw() {
    // Draw player as a cool explorer with a hat and backpack

    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;

    // Body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 6, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#775533';
    ctx.fillRect(centerX - 8, centerY + 18, 6, 10);
    ctx.fillRect(centerX + 4, centerY + 18, 6, 10);

    // Backpack
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(centerX - 16, centerY - 4, 10, 24);

    // Head
    ctx.fillStyle = '#f7d3b7';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 12, 11, 0, Math.PI * 2);
    ctx.fill();

    // Hat brim
    ctx.fillStyle = '#404040';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - 22, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hat top
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - 30, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(centerX - 4, centerY - 14, 2.5, 0, Math.PI * 2);
    ctx.arc(centerX + 4, centerY - 14, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  getCurrentTile() {
    return {
      col: Math.floor((this.x + this.width / 2) / TILE_SIZE),
      row: Math.floor((this.y + this.height / 2) / TILE_SIZE)
    };
  }
}

class NPC {
  constructor(col, row, name, riddle) {
    this.col = col;
    this.row = row;
    this.x = col * TILE_SIZE + (TILE_SIZE - NPC_SIZE)/2;
    this.y = row * TILE_SIZE + (TILE_SIZE - NPC_SIZE)/2;
    this.name = name;
    this.width = NPC_SIZE;
    this.height = NPC_SIZE;
    this.riddle = riddle;  // {question, answer}
    this.color = '#d94747'; // default red-ish
    this.passed = false;
  }

  draw() {
    // NPC is a friendly explorer animal - a red fox with a scarf

    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;

    // Body
    ctx.fillStyle = this.passed ? "#99cc66" : this.color; // turns green-ish if passed
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 6, 14, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail - fluffy on the right bottom side
    ctx.fillStyle = '#cc4422';
    ctx.beginPath();
    ctx.moveTo(centerX + 12, centerY + 10);
    ctx.lineTo(centerX + 28, centerY + 24);
    ctx.lineTo(centerX + 14, centerY + 26);
    ctx.closePath();
    ctx.fill();

    // Head - triangular fox head
    ctx.fillStyle = '#d94747';
    ctx.beginPath();
    ctx.moveTo(centerX - 12, centerY - 8);
    ctx.lineTo(centerX + 12, centerY - 8);
    ctx.lineTo(centerX, centerY - 28);
    ctx.closePath();
    ctx.fill();

    // Ears
    ctx.fillStyle = '#6b1a1a';
    ctx.beginPath();
    ctx.moveTo(centerX - 9, centerY - 26);
    ctx.lineTo(centerX - 4, centerY - 30);
    ctx.lineTo(centerX - 7, centerY - 20);
    ctx.closePath();
    ctx.moveTo(centerX + 9, centerY - 26);
    ctx.lineTo(centerX + 4, centerY - 30);
    ctx.lineTo(centerX + 7, centerY - 20);
    ctx.closePath();
    ctx.fill();

    // Scarf
    ctx.fillStyle = '#992222';
    ctx.fillRect(centerX - 10, centerY - 5, 20, 8);
    ctx.beginPath();
    ctx.moveTo(centerX + 6, centerY + 3);
    ctx.lineTo(centerX + 14, centerY + 10);
    ctx.lineTo(centerX + 4, centerY + 8);
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(centerX - 5, centerY - 14, 3, 0, Math.PI * 2);
    ctx.arc(centerX + 5, centerY - 14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(centerX - 5, centerY - 14, 1.2, 0, Math.PI * 2);
    ctx.arc(centerX + 5, centerY - 14, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Name tag
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '14px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, centerX, this.y - 6);
  }

  isNear(px, py) {
    const distX = (this.x + this.width/2) - px;
    const distY = (this.y + this.height/2) - py;
    return Math.sqrt(distX*distX + distY*distY) < 50;
  }
}

//--------------------------
// Map Generation & Terrain
//--------------------------

// Simple map generation: mostly grass, some water ponds, some trees, and roads forming a path

// Let's create a 15x10 tile map with:
// - Grass as base
// - Roads forming a plus sign + shape crossing the map center
// - Some trees scattered near edges
// - Some water ponds near corners

let map = [];

function generateMap() {
  for(let r=0; r<MAP_ROWS; r++) {
    let row = [];
    for(let c=0; c<MAP_COLS; c++) {
      let tile = TERRAIN.GRASS;

      // Add water ponds near corners
      if ((r < 3 && c < 3) || (r > MAP_ROWS-4 && c > MAP_COLS-4) || (r < 3 && c > MAP_COLS-4) || (r > MAP_ROWS-4 && c < 3)) {
        if (Math.random() < 0.25) tile = TERRAIN.WATER;
      }

      // Trees near edges
      if ((r === 0 || r === MAP_ROWS-1 || c === 0 || c === MAP_COLS-1) && Math.random() < 0.5) tile = TERRAIN.TREE;

      // Roads vertical center column and horizontal center row (a cross)
      if (c === Math.floor(MAP_COLS/2) || r === Math.floor(MAP_ROWS/2)) {
        if (tile !== TERRAIN.WATER) tile = TERRAIN.ROAD;
      }

      row.push(tile);
    }
    map.push(row);
  }
}
generateMap();

// Blocked tiles: water, trees
function isBlocked(x, y) {
  if (x < 0 || y < 0 || x > canvas.width - PLAYER_SIZE || y > GAME_AREA_HEIGHT - PLAYER_SIZE) return true;

  const col = Math.floor((x + PLAYER_SIZE/2) / TILE_SIZE);
  const row = Math.floor((y + PLAYER_SIZE/2) / TILE_SIZE);

  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return true;

  const terrain = map[row][col];
  return terrain === TERRAIN.WATER || terrain === TERRAIN.TREE;
}

//--------------------------
// Math Question System
//--------------------------

const questionsPool = [
  {question: "5 + 7 = ?", answer: "12"},
  {question: "9 - 4 = ?", answer: "5"},
  {question: "3 × 6 = ?", answer: "18"},
  {question: "12 ÷ 4 = ?", answer: "3"},
  {question: "7 + 8 = ?", answer: "15"},
  {question: "14 - 9 = ?", answer: "5"},
  {question: "5 × 5 = ?", answer: "25"},
  {question: "20 ÷ 5 = ?", answer: "4"},
  {question: "6 + 13 = ?", answer: "19"},
  {question: "15 - 7 = ?", answer: "8"},
];

let currentQuestion = null;
let awaitingAnswer = false;
let inputAnswer = '';
let activeNPC = null;

//--------------------------
// NPCs & Positions
//--------------------------

const npcList = [
  new NPC(7, 1, "Fiona", {question: "4 + 5 = ?", answer: "9"}),
  new NPC(13, 4, "Toby", {question: "8 - 3 = ?", answer: "5"}),
  new NPC(7, 7, "Luna", {question: "6 × 2 = ?", answer: "12"}),
  new NPC(1, 4, "Rex", {question: "20 ÷ 4 = ?", answer: "5"}),
  new NPC(11, 1, "Mika", {question: "7 + 6 = ?", answer: "13"})
];

//--------------------------
// Input Handling
//--------------------------

window.addEventListener('keydown', function(e) {
  if (awaitingAnswer) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      inputAnswer = inputAnswer.slice(0, -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitAnswer();
    }
    else if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      if (inputAnswer.length < 4) inputAnswer += e.key;
    }
    return;
  }

  keysDown[e.key] = true;

  if (e.key === ' ') {
    e.preventDefault();
    interactNPC();
  }
});
window.addEventListener('keyup', function(e) {
  keysDown[e.key] = false;
});

function interactNPC() {
  if (awaitingAnswer) return;

  const playerTile = player.getCurrentTile();
  const px = player.x + player.width/2;
  const py = player.y + player.height/2;

  for (let npc of npcList) {
    if (!npc.passed && npc.isNear(px, py)) {
      currentQuestion = npc.riddle;
      activeNPC = npc;
      awaitingAnswer = true;
      inputAnswer = '';
      break;
    }
  }
}

function submitAnswer() {
  if (!awaitingAnswer) return;

  questionsAsked++;

  if (inputAnswer === currentQuestion.answer) {
    questionsCorrect++;
    activeNPC.passed = true;
    showMessage(`Correct! You solved ${activeNPC.name}'s riddle.`);
  } else {
    showMessage(`Oops! The correct answer is ${currentQuestion.answer}. Try next one.`);
  }

  currentQuestion = null;
  activeNPC = null;
  awaitingAnswer = false;
  inputAnswer = '';
}

//--------------------------
// Messages (transient notification)
//--------------------------

let message = '';
let messageTimer = 0;
function showMessage(txt) {
  message = txt;
  messageTimer = 180; // 3 seconds at 60fps
}

//--------------------------
// Draw functions
//--------------------------

function drawMap() {
  for(let r=0; r<MAP_ROWS; r++) {
    for(let c=0; c<MAP_COLS; c++) {
      const terrain = map[r][c];
      ctx.fillStyle = TERRAIN_COLORS[terrain];
      ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Draw simple tree trunk for trees
      if (terrain === TERRAIN.TREE) {
        ctx.fillStyle = "#4a2c0f";
        ctx.fillRect(c*TILE_SIZE + TILE_SIZE/2 - 4, r*TILE_SIZE + TILE_SIZE - 14, 8, 14);

        // tree leaves top - a green triangle
        ctx.fillStyle = "#2a661a";
        ctx.beginPath();
        ctx.moveTo(c*TILE_SIZE + TILE_SIZE/2, r*TILE_SIZE + 6);
        ctx.lineTo(c*TILE_SIZE + TILE_SIZE/2 - 20, r*TILE_SIZE + TILE_SIZE/2);
        ctx.lineTo(c*TILE_SIZE + TILE_SIZE/2 + 20, r*TILE_SIZE + TILE_SIZE/2);
        ctx.closePath();
        ctx.fill();
      }

      // Simple water waves for water
      if (terrain === TERRAIN.WATER) {
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        for(let i=0; i<4; i++) {
          ctx.beginPath();
          ctx.arc(c*TILE_SIZE + 10 + i*10, r*TILE_SIZE + 30, 6, 0, Math.PI, false);
          ctx.stroke();
        }
      }

      // Roads have dashed lines
      if (terrain === TERRAIN.ROAD) {
        ctx.fillStyle = TERRAIN_COLORS.road;
        ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);

        // Center lines vertical/horizontal
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);

        if (r === Math.floor(MAP_ROWS/2)) {
          // horizontal line across tile middle
          ctx.beginPath();
          ctx.moveTo(c*TILE_SIZE, r*TILE_SIZE + TILE_SIZE/2);
          ctx.lineTo(c*TILE_SIZE + TILE_SIZE, r*TILE_SIZE + TILE_SIZE/2);
          ctx.stroke();
        }

        if (c === Math.floor(MAP_COLS/2)) {
          // vertical line across tile middle
          ctx.beginPath();
          ctx.moveTo(c*TILE_SIZE + TILE_SIZE/2, r*TILE_SIZE);
          ctx.lineTo(c*TILE_SIZE + TILE_SIZE/2, r*TILE_SIZE + TILE_SIZE);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  }
}

function drawMathQuestionArea() {
  ctx.fillStyle = '#1b2850';
  ctx.fillRect(0, GAME_AREA_HEIGHT, canvas.width, MATH_AREA_HEIGHT);

  ctx.fillStyle = '#fff';
  ctx.font = "bold 22px Verdana";
  ctx.textAlign = 'left';
  ctx.fillText(`Riddles solved: ${questionsCorrect} / ${questionsAsked}`, 12, GAME_AREA_HEIGHT + 28);

  if (awaitingAnswer && currentQuestion) {
    ctx.fillText(`Solve: ${currentQuestion.question}`, 12, GAME_AREA_HEIGHT + 68);
    ctx.fillText(`Your answer: ${inputAnswer}_`, 12, GAME_AREA_HEIGHT + 108);
    ctx.fillText(`(Type answer and press Enter)`, 12, GAME_AREA_HEIGHT + 138 > canvas.height ? canvas.height - 6 : GAME_AREA_HEIGHT + 138);
  } else {
    ctx.fillText(`Approach a friendly explorer animal and press SPACE to solve a math riddle!`, 12, GAME_AREA_HEIGHT + 68);
  }

  if (messageTimer > 0) {
    ctx.fillStyle = '#aaffaa';
    ctx.font = "bold 20px Verdana";
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width/2, GAME_AREA_HEIGHT + 100);
  }
}

function draw() {
  // Clear entire canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw map area
  drawMap();

  // Draw NPCs
  npcList.forEach(npc => npc.draw());

  // Draw player
  player.draw();

  // Draw math question area
  drawMathQuestionArea();
}

//--------------------------
// Game Loop
//--------------------------

const player = new Player();

function update() {
  player.update();

  if (messageTimer > 0) {
    messageTimer--;
    if (messageTimer === 0) {
      message = '';
    }
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();