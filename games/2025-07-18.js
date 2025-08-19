const stage = document.getElementById('game-of-the-day-stage');
stage.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

class Character {
  constructor(name, x, y, color, size = 40) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = size;
    this.speed = 3;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, this.x, this.y + this.size/2 + 15);
  }
  move(dx, dy) {
    this.x += dx * this.speed;
    this.y += dy * this.speed;
    // Keep inside bounds
    this.x = Math.min(Math.max(this.size/2, this.x), canvas.width - this.size/2);
    this.y = Math.min(Math.max(this.size/2, this.y), canvas.height - this.size/2);
  }
  intersects(obj) {
    let dist = Math.hypot(this.x - obj.x, this.y - obj.y);
    return dist < (this.size/2 + obj.size/2);
  }
}

class MathChallenge {
  constructor(x, y, question, answer) {
    this.x = x;
    this.y = y;
    this.size = 50;
    this.question = question; // string
    this.answer = answer; // number
    this.visited = false;
    this.color = '#ffba08';
  }
  draw() {
    ctx.fillStyle = this.visited ? '#6ab04c' : this.color;
    ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    ctx.fillStyle = 'black';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('?', this.x, this.y);
    if(this.visited){
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('✔', this.x, this.y + 20);
    }
  }
}

class FriendlyAnimal {
  constructor(name, x, y, size=40) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.size = size;
    this.color = '#f28ab2';
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.size/1.5, this.size/3, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.font = '14px comic-sans';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, this.x, this.y + this.size/2 + 15);
  }
  interact() {
    alert(this.name + ' the animal says: "Keep exploring and solving math challenges!"');
  }
}

let player = new Character('Eva', 360, 240, '#4a90e2');

const animals = [
  new FriendlyAnimal('Benny', 100, 100),
  new FriendlyAnimal('Mira', 620, 150),
  new FriendlyAnimal('Tiko', 300, 400),
];

const challenges = [];

// Generate math challenges scattered in the world: addition, subtraction, pattern
function generateChallenges() {
  let questions = [
    {question:'5 + 3', answer:8},
    {question:'10 - 4', answer:6},
    {question:'7 + 2', answer:9},
    {question:'12 - 7', answer:5},
    {question:'3 + 6', answer:9},
    {question:'9 - 1', answer:8},
    {question:'2 + 8', answer:10},
    {question:'15 - 5', answer:10},
    {question:'1, 2, 3, ?', answer:4},
    {question:'2, 4, 6, ?', answer:8},
    {question:'10, 8, 6, ?', answer:4},
  ];

  questions.forEach((q, i) => {
    let x = 100 + (i % 4) * 150 + (Math.random() * 40 - 20);
    let y = 120 + Math.floor(i/4) * 120 + (Math.random() * 40 - 20);
    challenges.push(new MathChallenge(x, y, q.question, q.answer));
  });
}

generateChallenges();

let keysDown = {};
let inputActive = false;
let inputAnswer = '';

function drawBackground() {
  ctx.fillStyle = '#d0f0f7';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  // Simple grass and path
  ctx.fillStyle = '#7cc04c';
  ctx.fillRect(0, 360, canvas.width, 120);
  ctx.fillStyle = '#d9c176';
  ctx.fillRect(280, 0, 160, 480);
}

function drawUI() {
  ctx.fillStyle = '#333';
  ctx.font = '18px Verdana';
  ctx.textAlign = 'left';
  ctx.fillText('Use arrow keys to explore. Find math challenges and answer!', 8, 24);
  ctx.fillText('Challenges solved: ' + challenges.filter(ch => ch.visited).length + '/' + challenges.length, 8, 48);
}

function gameLoop() {
  // Movement controls
  if(!inputActive){
    let dx = 0, dy = 0;
    if(keysDown['ArrowLeft']) dx = -1;
    if(keysDown['ArrowRight']) dx = 1;
    if(keysDown['ArrowUp']) dy = -1;
    if(keysDown['ArrowDown']) dy = 1;
    player.move(dx, dy);
  }

  drawBackground();

  // Draw animals
  animals.forEach(a => a.draw());

  // Draw challenges
  challenges.forEach(ch => ch.draw());

  // Draw player
  player.draw();

  // Check collisions
  if(!inputActive){
    challenges.forEach(ch => {
      if(!ch.visited && player.intersects(ch)){
        inputActive = true;
        inputAnswer = '';
        currentChallenge = ch;
      }
    });
    animals.forEach(a => {
      if(player.intersects(a)){
        a.interact();
      }
    });
  }

  if(inputActive){
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(80, 150, 560, 180);
    ctx.fillStyle = 'white';
    ctx.font = '22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Solve this:', canvas.width/2, 190);
    ctx.font = 'bold 40px Arial';
    ctx.fillText(currentChallenge.question, canvas.width/2, 250);
    ctx.font = '32px Courier New';
    ctx.fillText(inputAnswer || '_', canvas.width/2, 320);
    ctx.font = '16px Arial';
    ctx.fillText('Type your answer and press Enter to submit', canvas.width/2, 360);
  }

  requestAnimationFrame(gameLoop);
}

// Keyboard handling
window.addEventListener('keydown', e => {
  if(inputActive){
    if(e.key >= '0' && e.key <= '9'){
      if(inputAnswer.length < 3) inputAnswer += e.key;
    } else if(e.key === 'Backspace'){
      inputAnswer = inputAnswer.slice(0, -1);
    } else if(e.key === 'Enter'){
      if(inputAnswer.length === 0) return;
      if(Number(inputAnswer) === currentChallenge.answer){
        alert('Great job! That is correct!');
        currentChallenge.visited = true;
      } else {
        alert('Oops, try again!');
      }
      inputActive = false;
      inputAnswer = '';
    } else if(e.key === 'Escape'){
      inputActive = false;
      inputAnswer = '';
    }
    e.preventDefault();
  } else {
    keysDown[e.key] = true;
  }
});
window.addEventListener('keyup', e => {
  keysDown[e.key] = false;
});

let currentChallenge = null;

gameLoop();