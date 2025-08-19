const stage = document.getElementById('game-of-the-day-stage');
stage.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

class Vector2 {
  constructor(x, y) {
    this.x = x; this.y = y;
  }
  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }
  subtract(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }
  scale(s) {
    return new Vector2(this.x * s, this.y * s);
  }
}

class Player {
  constructor(x, y) {
    this.pos = new Vector2(x, y);
    this.size = 32;
    this.speed = 2.5;
    this.color = '#4a90e2';
    this.score = 0;
    this.answer = null; // current input answer for math quizzes
    this.activeQuiz = null;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(this.pos.x, this.pos.y - this.size/2);
    ctx.lineTo(this.pos.x - this.size/2, this.pos.y + this.size/2);
    ctx.lineTo(this.pos.x + this.size/2, this.pos.y + this.size/2);
    ctx.closePath();
    ctx.fill();
  }
  move(dir) {
    const movement = new Vector2(0,0);
    if(dir.up) movement.y -= this.speed;
    if(dir.down) movement.y += this.speed;
    if(dir.left) movement.x -= this.speed;
    if(dir.right) movement.x += this.speed;
    this.pos = this.pos.add(movement);

    // Clamp to world bounds
    this.pos.x = Math.min(Math.max(this.pos.x, 0), world.width);
    this.pos.y = Math.min(Math.max(this.pos.y, 0), world.height);
  }
}

class NPC {
  constructor(x, y, name, color, mathProblem, correctAnswer) {
    this.pos = new Vector2(x, y);
    this.size = 28;
    this.name = name;
    this.color = color;
    this.mathProblem = mathProblem;
    this.correctAnswer = correctAnswer;
    this.talkedTo = false;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(this.pos.x, this.pos.y, this.size/2, this.size*0.75/2, 0, 0, 2 * Math.PI);
    ctx.fill();
    // eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(this.pos.x - 6, this.pos.y - 4, 5, 7, 0, 0, 2 * Math.PI);
    ctx.ellipse(this.pos.x + 6, this.pos.y - 4, 5, 7, 0, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.ellipse(this.pos.x - 6, this.pos.y - 4, 2, 3, 0, 0, 2 * Math.PI);
    ctx.ellipse(this.pos.x + 6, this.pos.y - 4, 2, 3, 0, 0, 2 * Math.PI);
    ctx.fill();

    // smile
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y + 6, 10, 0, Math.PI, false);
    ctx.stroke();

    // name text above NPC
    ctx.fillStyle = '#222';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, this.pos.x, this.pos.y - this.size);
  }
}

class World {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tilesize = 48;
    this.cols = Math.floor(width / this.tilesize);
    this.rows = Math.floor(height / this.tilesize);
    this.colors = ['#a2d149', '#96c93d', '#7ebe2a', '#90d890', '#5ea55f'];
  }
  draw(camera) {
    for(let r=0; r<this.rows; r++) {
      for(let c=0; c<this.cols; c++) {
        let x = c*this.tilesize - camera.x;
        let y = r*this.tilesize - camera.y;
        if(x + this.tilesize < 0 || y + this.tilesize < 0 || x > canvas.width || y > canvas.height) continue;
        // pattern grass with some variation
        let color = this.colors[(r+c) % this.colors.length];
        ctx.fillStyle = color;
        ctx.fillRect(x, y, this.tilesize, this.tilesize);
        // simple flower or rock decoration:
        if(Math.random() < 0.03) {
          ctx.fillStyle = '#e54b4b';
          ctx.beginPath();
          ctx.ellipse(x + this.tilesize/2, y + this.tilesize/2, 5, 10, 0, 0, Math.PI*2);
          ctx.fill();
          ctx.fillStyle = '#3b4a3a';
          ctx.fillRect(x + this.tilesize/2 - 1, y + this.tilesize/2 + 5, 3, 6);
        }
      }
    }
  }
}

class Camera {
  constructor(width, height, world) {
    this.width = width;
    this.height = height;
    this.world = world;
    this.x = 0;
    this.y = 0;
  }
  update(target) {
    // center camera around target, clamp in world bounds
    this.x = target.pos.x - this.width/2;
    this.y = target.pos.y - this.height/2;
    this.x = Math.min(Math.max(this.x, 0), this.world.width - this.width);
    this.y = Math.min(Math.max(this.y, 0), this.world.height - this.height);
  }
}

class UI {
  constructor() {
    this.font = '16px Verdana';
  }
  drawScore(score) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, 10, 140, 30);
    ctx.fillStyle = '#fff';
    ctx.font = this.font;
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score, 20, 32);
  }
  drawInputBox(text) {
    // bottom input box
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
    ctx.fillStyle = '#fff';
    ctx.font = '20px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height - 25);
  }
  drawMessage(text) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    let w = ctx.measureText(text).width + 20;
    let h = 40;
    ctx.fillRect(canvas.width/2 - w/2, 60, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = '18px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, 90);
  }
}

function generateMathProblem() {
  // Basic addition, subtraction, multiplication for ages 6-10
  let ops = ['+', '-', 'x'];
  let op = ops[Math.floor(Math.random() * ops.length)];
  let a, b;
  switch(op){
    case '+':
      a = Math.floor(Math.random()*50)+1;
      b = Math.floor(Math.random()*50)+1;
      return {question: `${a} + ${b} = ?`, answer: a+b};
    case '-':
      a = Math.floor(Math.random()*50)+20;
      b = Math.floor(Math.random()*a);
      return {question: `${a} - ${b} = ?`, answer: a-b};
    case 'x':
      a = Math.floor(Math.random()*10)+1;
      b = Math.floor(Math.random()*10)+1;
      return {question: `${a} x ${b} = ?`, answer: a*b};
  }
}

let world = new World(1500, 1000);
let player = new Player(100, 100);
let camera = new Camera(canvas.width, canvas.height, world);
let ui = new UI();

let npcs = [
  new NPC(300, 400, 'Zara', '#f4a261', ...Object.values(generateMathProblem())),
  new NPC(600, 700, 'Milo', '#e76f51', ...Object.values(generateMathProblem())),
  new NPC(900, 150, 'Tina', '#2a9d8f', ...Object.values(generateMathProblem())),
  new NPC(1300, 600, 'Rex', '#264653', ...Object.values(generateMathProblem())),
  new NPC(500, 900, 'Luna', '#e9c46a', ...Object.values(generateMathProblem()))
];

const keysDown = {};
window.addEventListener('keydown', evt => {
  if(gameState.awaitingAnswer && isDigit(evt.key)) {
    // Append digit for answer input (limit 3 digits)
    if(gameState.playerAnswer.length < 3) {
      gameState.playerAnswer += evt.key;
    }
    if(evt.key === 'Backspace') {
      gameState.playerAnswer = gameState.playerAnswer.slice(0, -1);
    }
  }
  if(!gameState.awaitingAnswer){
    keysDown[evt.key.toLowerCase()] = true;
  }
  if(gameState.awaitingAnswer && evt.key === 'Backspace') {
    gameState.playerAnswer = gameState.playerAnswer.slice(0, -1);
  }
  if(gameState.awaitingAnswer && evt.key === 'Enter') {
    gameState.checkAnswer();
  }
});
window.addEventListener('keyup', evt => {
  keysDown[evt.key.toLowerCase()] = false;
});

function isDigit(str) {
  return /^\d$/.test(str);
}

function dist(a, b) {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const gameState = {
  awaitingAnswer: false,
  currentNPC: null,
  playerAnswer: '',
  messageTimer: 0,
  messageText: '',
  checkAnswer() {
    if(!this.currentNPC) return;
    if(this.playerAnswer === '') return;
    let numAnswer = parseInt(this.playerAnswer);
    if(numAnswer === this.currentNPC.correctAnswer) {
      this.messageText = `Correct! Well done, ${this.currentNPC.name}!`;
      this.messageTimer = 200;
      player.score += 10;
      this.currentNPC.talkedTo = true;
      // generate new math problem for next time
      let {question, answer} = generateMathProblem();
      this.currentNPC.mathProblem = question;
      this.currentNPC.correctAnswer = answer;
    } else {
      this.messageText = `Oops! The answer was ${this.currentNPC.correctAnswer}. Try next time!`;
      this.messageTimer = 200;
    }
    this.awaitingAnswer = false;
    this.currentNPC = null;
    this.playerAnswer = '';
  }
};

function drawGameplayHUD() {
  ui.drawScore(player.score);
  if(gameState.awaitingAnswer && gameState.currentNPC) {
    ui.drawInputBox(`${gameState.currentNPC.name} asks: ${gameState.currentNPC.mathProblem}  Your answer: ${gameState.playerAnswer}_`);
  } else if(gameState.messageTimer > 0) {
    ui.drawMessage(gameState.messageText);
  }
}

function gameLoop() {
  handleInput();
  camera.update(player);
  // clear screen
  ctx.fillStyle = '#70c1b3';  // sky blue background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  world.draw(camera);

  // Draw NPCs in camera view
  npcs.forEach(npc => {
    if(dist(npc.pos, player.pos) < 200 + npc.size) {
      npc.drawAt = npc.pos.subtract(new Vector2(camera.x, camera.y));
      npc.draw();
    }
  });

  // Draw player on screen (centered relative to camera)
  player.draw();

  drawGameplayHUD();

  if(gameState.messageTimer > 0) {
    gameState.messageTimer--;
  }

  requestAnimationFrame(gameLoop);
}

function handleInput() {
  if(gameState.awaitingAnswer) return; // do not move when answering
  player.move({
    up: keysDown['w'] || keysDown['arrowup'],
    down: keysDown['s'] || keysDown['arrowdown'],
    left: keysDown['a'] || keysDown['arrowleft'],
    right: keysDown['d'] || keysDown['arrowright'],
  });

  // Check interaction with NPCs (E key)
  if(keysDown['e']) {
    let nearNPC = npcs.find(npc => dist(npc.pos, player.pos) < 50 && !npc.talkedTo);
    if(nearNPC && !gameState.awaitingAnswer) {
      gameState.awaitingAnswer = true;
      gameState.currentNPC = nearNPC;
      gameState.playerAnswer = '';
      keysDown['e'] = false; // prevent repeated triggers
    }
  }
}

// Intro animation & helper text
function drawIntroOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.font = '28px Verdana';
  ctx.textAlign = 'center';
  ctx.fillText('Open World Math Adventure', canvas.width/2, canvas.height/3);
  ctx.font = '18px Verdana';
  ctx.fillText('Move: WASD or Arrow Keys', canvas.width/2, canvas.height/3 + 40);
  ctx.fillText('Interact: E', canvas.width/2, canvas.height/3 + 70);
  ctx.fillText('Answer math questions to gain points!', canvas.width/2, canvas.height/3 + 100);
  ctx.fillText('Press any key to start...', canvas.width/2, canvas.height/3 + 140);
}

let started = false;
function waitForStart(e) {
  started = true;
  window.removeEventListener('keydown', waitForStart);
  gameLoop();
}
window.addEventListener('keydown', waitForStart);

function preStartLoop() {
  ctx.fillStyle = '#70c1b3';  // sky blue background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  world.draw(new Camera(canvas.width, canvas.height, world)); // draw world from top-left
  drawIntroOverlay();
  if(!started) requestAnimationFrame(preStartLoop);
}
preStartLoop();