const stage = document.getElementById('game-of-the-day-stage');
stage.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

class Character {
  constructor(x, y, color, name) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.name = name;
    this.width = 40;
    this.height = 60;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText(this.name, this.x + 5, this.y - 5);
  }
  intersects(obj) {
    return !(this.x > obj.x + obj.width ||
      this.x + this.width < obj.x ||
      this.y > obj.y + obj.height ||
      this.y + this.height < obj.y);
  }
}

class PuzzleSpot {
  constructor(x, y, question, answer) {
    this.x = x;
    this.y = y;
    this.width = 50;
    this.height = 50;
    this.question = question;
    this.answer = answer;
    this.solved = false;
  }
  draw() {
    ctx.fillStyle = this.solved ? '#6ab04c' : '#f39c12';
    ctx.fillRect(this.x, this.y, this.width, this.height);
    if (!this.solved) {
      ctx.fillStyle = 'black';
      ctx.font = '20px Arial';
      ctx.fillText('?', this.x + 18, this.y + 33);
    } else {
      ctx.fillStyle = 'white';
      ctx.font = '20px Arial';
      ctx.fillText('✔', this.x + 17, this.y + 33);
    }
  }
}

class Game {
  constructor() {
    this.player = new Character(340, 210, '#2980b9', 'Explorer Eli');
    this.npc = new Character(600, 350, '#d35400', 'Mysterious Owl');
    this.puzzleSpots = [
      new PuzzleSpot(150, 120, '5 + 7', 12),
      new PuzzleSpot(400, 100, '9 - 3', 6),
      new PuzzleSpot(250, 350, '4 + 6', 10),
      new PuzzleSpot(520, 200, '10 - 4', 6)
    ];
    this.message = 'Explore and find puzzles! Use arrow keys to move.';
    this.inPuzzle = false;
    this.currentPuzzle = null;
    this.inputAnswer = '';
    this.completedPuzzles = 0;
    this.maxPuzzles = this.puzzleSpots.length;
    this.keys = {};
    this.init();
  }
  init() {
    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;
      if (this.inPuzzle) {
        if ((e.key >= '0' && e.key <= '9') || e.key === '-') {
          if(this.inputAnswer.length < 3) this.inputAnswer += e.key;
        }
        if (e.key === 'Backspace') {
          this.inputAnswer = this.inputAnswer.slice(0, -1);
          e.preventDefault();
        }
        if (e.key === 'Enter') {
          this.checkAnswer();
          e.preventDefault();
        }
      }
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key] = false;
    });
    this.loop();
  }
  checkAnswer() {
    if (!this.currentPuzzle) return;
    if (parseInt(this.inputAnswer) === this.currentPuzzle.answer) {
      this.currentPuzzle.solved = true;
      this.completedPuzzles++;
      this.message = 'Correct! Well done! Keep exploring.';
      this.inPuzzle = false;
      this.currentPuzzle = null;
      this.inputAnswer = '';
    } else {
      this.message = 'Oops! Try again!';
      this.inputAnswer = '';
    }
  }
  update() {
    if (this.inPuzzle) return;
    if (this.keys['ArrowUp']) this.player.y = Math.max(0, this.player.y - 4);
    if (this.keys['ArrowDown']) this.player.y = Math.min(canvas.height - this.player.height, this.player.y + 4);
    if (this.keys['ArrowLeft']) this.player.x = Math.max(0, this.player.x - 4);
    if (this.keys['ArrowRight']) this.player.x = Math.min(canvas.width - this.player.width, this.player.x + 4);

    for (let spot of this.puzzleSpots) {
      if (!spot.solved && this.player.intersects(spot)) {
        this.inPuzzle = true;
        this.currentPuzzle = spot;
        this.message = `Puzzle: What is ${spot.question}? Type and press Enter.`;
        this.inputAnswer = '';
        break;
      }
    }
    if(this.completedPuzzles === this.maxPuzzles){
      this.message = 'Hooray! You solved all puzzles! Exploration complete!';
    }
  }
  drawBackground(){
    // Grass ground
    ctx.fillStyle = '#6ab04c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Path
    ctx.fillStyle = '#dff9fb';
    ctx.fillRect(50, 100, 620, 50);
    ctx.fillRect(300, 100, 50, 300);
    ctx.fillRect(350, 350, 200, 50);
    ctx.fillRect(550, 150, 50, 250);
    // Trees - simple circles
    for(let i=0;i<6;i++){
      ctx.fillStyle = '#27ae60';
      let tx = i*120+60;
      let ty = 60;
      ctx.beginPath();
      ctx.arc(tx, ty, 25, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = '#145214';
      ctx.fillRect(tx-5, ty, 10, 20);
    }
  }
  draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawBackground();
    for (let spot of this.puzzleSpots) {
      spot.draw();
    }
    this.player.draw();
    this.npc.draw();
    // HUD message box bottom
    ctx.fillStyle = '#34495e';
    ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
    ctx.fillStyle = 'white';
    ctx.font = '18px Arial';
    this.drawMultilineText(this.message, 15, canvas.height - 55, canvas.width - 20, 22);
    if (this.inPuzzle) {
      ctx.fillStyle = 'white';
      ctx.font = '28px Arial';
      ctx.fillText(this.inputAnswer + '_', 15, canvas.height - 10);
    } else {
      ctx.font = '16px Arial';
      ctx.fillText('Use arrow keys to move. Find and solve math puzzles!', 15, canvas.height - 15);
    }
    // Show progress
    ctx.fillStyle = '#ecf0f1';
    ctx.font = '20px Arial';
    ctx.fillText(`Puzzles solved: ${this.completedPuzzles} / ${this.maxPuzzles}`, canvas.width - 190, 30);
  }
  drawMultilineText(text, x, y, maxWidth, lineHeight) {
    let words = text.split(' ');
    let line = '';
    for(let n = 0; n < words.length; n++) {
      let testLine = line + words[n] + ' ';
      let metrics = ctx.measureText(testLine);
      let testWidth = metrics.width;
      if(testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      }
      else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }
  loop() {
    this.update();
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }
}

new Game();