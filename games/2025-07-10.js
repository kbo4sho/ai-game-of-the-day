const container = document.getElementById('game-of-the-day-stage');
container.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
container.appendChild(canvas);
const ctx = canvas.getContext('2d');

class Vector2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }
  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }
  distance(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }
}

class Player {
  constructor(pos) {
    this.pos = pos;
    this.speed = 3;
    this.radius = 20;
    this.color = '#3a90e0';
    this.name = 'Adventurer';
    this.direction = 'down';
  }
  move(dir) {
    switch (dir) {
      case 'up':
        this.pos.y = Math.max(this.radius, this.pos.y - this.speed);
        this.direction = 'up';
        break;
      case 'down':
        this.pos.y = Math.min(canvas.height - this.radius, this.pos.y + this.speed);
        this.direction = 'down';
        break;
      case 'left':
        this.pos.x = Math.max(this.radius, this.pos.x - this.speed);
        this.direction = 'left';
        break;
      case 'right':
        this.pos.x = Math.min(canvas.width - this.radius, this.pos.x + this.speed);
        this.direction = 'right';
        break;
    }
  }
  draw(ctx) {
    // Body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, 2 * Math.PI);
    ctx.fill();
    // Face - simple eyes
    ctx.fillStyle = 'white';
    let eyeY = this.pos.y - 5;
    let offsetX = this.direction === 'left' ? -6 : this.direction === 'right' ? 6 : 0;
    ctx.beginPath();
    ctx.arc(this.pos.x - 7 + offsetX, eyeY, 4, 0, 2 * Math.PI);
    ctx.arc(this.pos.x + 7 + offsetX, eyeY, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(this.pos.x - 7 + offsetX, eyeY, 2, 0, 2 * Math.PI);
    ctx.arc(this.pos.x + 7 + offsetX, eyeY, 2, 0, 2 * Math.PI);
    ctx.fill();
    // Mouth - simple line
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.pos.x - 8, this.pos.y + 8);
    ctx.lineTo(this.pos.x + 8, this.pos.y + 8);
    ctx.stroke();
  }
}

class NPC {
  constructor(pos, question) {
    this.pos = pos;
    this.radius = 18;
    this.color = '#e07b3a';
    this.question = question; 
    this.solved = false;
    this.name = question.characterName;
  }
  draw(ctx) {
    // Body
    ctx.fillStyle = this.solved ? '#32a852' : this.color;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.radius, 0, 2 * Math.PI);
    ctx.fill();
    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(this.pos.x - 5, this.pos.y - 5, 4, 0, 2 * Math.PI);
    ctx.arc(this.pos.x + 5, this.pos.y - 5, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(this.pos.x - 5, this.pos.y - 5, 2, 0, 2 * Math.PI);
    ctx.arc(this.pos.x + 5, this.pos.y - 5, 2, 0, 2 * Math.PI);
    ctx.fill();
    // Mouth - smiling if solved else straight
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (this.solved) {
      ctx.arc(this.pos.x, this.pos.y + 3, 8, 0, Math.PI, false);
    } else {
      ctx.moveTo(this.pos.x - 7, this.pos.y + 8);
      ctx.lineTo(this.pos.x + 7, this.pos.y + 8);
    }
    ctx.stroke();
  }
}

class World {
  constructor() {
    this.width = 1440; // twice the canvas size width
    this.height = 960; // twice the canvas size height
    this.terrainColors = ['#adebad', '#7ed77e', '#5cb85c', '#4a9c4a'];
    this.tileSize = 90;
  }
  
  draw(ctx, cam) {
    // Draw terrain tiles
    let startX = Math.floor(cam.x / this.tileSize);
    let endX = Math.floor((cam.x + canvas.width) / this.tileSize);
    let startY = Math.floor(cam.y / this.tileSize);
    let endY = Math.floor((cam.y + canvas.height) / this.tileSize);
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        let colorIdx = (x + y) % this.terrainColors.length;
        let px = x * this.tileSize - cam.x;
        let py = y * this.tileSize - cam.y;
        ctx.fillStyle = this.terrainColors[colorIdx];
        ctx.fillRect(px, py, this.tileSize, this.tileSize);
        if (Math.random() < 0.03) { // little flowers
          ctx.fillStyle = '#f4c2c2';
          ctx.beginPath();
          ctx.arc(px + Math.random() * this.tileSize, py + Math.random() * this.tileSize, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
  }
}

class MathQuestion {
  constructor(characterName, a, b, op) {
    this.characterName = characterName;
    this.a = a;
    this.b = b;
    this.op = op; // '+', '-', '*'
  }
  getAnswer() {
    switch(this.op) {
      case '+': return this.a + this.b;
      case '-': return this.a - this.b;
      case '*': return this.a * this.b;
    }
  }
  getQuestionText() {
    return `Hi! I'm ${this.characterName}. What is ${this.a} ${this.op} ${this.b}?`;
  }
}

class Game {
  constructor() {
    this.world = new World();
    this.player = new Player(new Vector2(this.world.width / 2, this.world.height / 2));
    this.cam = {x: this.player.pos.x - canvas.width / 2, y: this.player.pos.y - canvas.height / 2};
    this.npcs = [];
    this.input = {up:false, down:false, left:false, right:false};
    this.message = '';
    this.awaitingAnswer = false;
    this.currentNPC = null;
    this.answerInput = '';
    this.score = 0;
    
    this.generateNPCs();
    this.setupInput();
    requestAnimationFrame(()=>this.loop());
  }
  
  generateNPCs() {
    const names = ['Tessa', 'Bobo', 'Zinny', 'Mila', 'Kato'];
    const operators = ['+', '-', '*'];
    for (let i=0; i<5; i++) {
      let x = Math.random() * (this.world.width - 100) + 50;
      let y = Math.random() * (this.world.height - 100) + 50;
      let a = Math.floor(Math.random()*10) + 1;
      let b = Math.floor(Math.random()*10) + 1;
      let op = operators[Math.floor(Math.random() * operators.length)];
      // Small tweak for subtract to avoid negatives
      if (op === '-' && b > a) [a,b] = [b,a];
      let mq = new MathQuestion(names[i], a, b, op);
      this.npcs.push(new NPC(new Vector2(x,y), mq));
    }
  }
  
  setupInput() {
    window.addEventListener('keydown', e => {
      if (this.awaitingAnswer) {
        if (e.key >= '0' && e.key <= '9') {
          this.answerInput += e.key;
        } else if (e.key === 'Backspace') {
          this.answerInput = this.answerInput.slice(0, -1);
        } else if (e.key === 'Enter') {
          this.checkAnswer();
        }
      } else {
        switch(e.key) {
          case 'w':
          case 'ArrowUp':
            this.input.up = true;
            break;
          case 's':
          case 'ArrowDown':
            this.input.down = true;
            break;
          case 'a':
          case 'ArrowLeft':
            this.input.left = true;
            break;
          case 'd':
          case 'ArrowRight':
            this.input.right = true;
            break;
          case 'e':
            this.tryTalk();
            break;
        }
      }
    });

    window.addEventListener('keyup', e => {
      switch(e.key) {
        case 'w':
        case 'ArrowUp':
          this.input.up = false;
          break;
        case 's':
        case 'ArrowDown':
          this.input.down = false;
          break;
        case 'a':
        case 'ArrowLeft':
          this.input.left = false;
          break;
        case 'd':
        case 'ArrowRight':
          this.input.right = false;
          break;
      }
    });
  }
  
  tryTalk() {
    if (this.awaitingAnswer) return;
    for (let npc of this.npcs) {
      if (!npc.solved && npc.pos.distance(this.player.pos) < this.player.radius + npc.radius + 10) {
        this.awaitingAnswer = true;
        this.currentNPC = npc;
        this.answerInput = '';
        this.message = npc.question.getQuestionText() + " (Type your answer and press Enter)";
        return;
      }
    }
    this.message = 'No one to talk to nearby. Move near a character and press "E".';
  }
  
  checkAnswer() {
    let ans = parseInt(this.answerInput);
    if (isNaN(ans)) {
      this.message = 'Please enter a valid number!';
      return;
    }
    let correct = this.currentNPC.question.getAnswer();
    if (ans === correct) {
      this.message = `Correct! Thanks, ${this.currentNPC.question.characterName}! You earned 10 points! Explore more!`;
      this.currentNPC.solved = true;
      this.score += 10;
    } else {
      this.message = `Oops! That's not right. Try again or move away and come back.`;
    }
    this.awaitingAnswer = false;
    this.currentNPC = null;
    this.answerInput = '';
  }
  
  update() {
    if (!this.awaitingAnswer) {
      if (this.input.up) this.player.move('up');
      if (this.input.down) this.player.move('down');
      if (this.input.left) this.player.move('left');
      if (this.input.right) this.player.move('right');
    }
    this.cam.x = Math.min(Math.max(0, this.player.pos.x - canvas.width / 2), this.world.width - canvas.width);
    this.cam.y = Math.min(Math.max(0, this.player.pos.y - canvas.height / 2), this.world.height - canvas.height);
  }
  
  drawUI(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(5, 5, 250, 90);
    
    ctx.fillStyle = '#333';
    ctx.font = '18px Arial';
    ctx.fillText(`Score: ${this.score}`, 15, 30);
    
    ctx.font = '14px Arial';
    if (this.awaitingAnswer) {
      ctx.fillText(this.message, 15, 55, 230);
      ctx.fillStyle = '#222';
      ctx.fillRect(15, 65, 220, 30);
      ctx.fillStyle = '#0f0';
      ctx.font = '20px monospace';
      ctx.fillText(this.answerInput + '_', 20, 90);
    } else {
      ctx.fillStyle = '#000';
      const wrapText = (text, x, y, maxWidth, lineHeight) => {
        let words = text.split(' ');
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
      };
      wrapText(this.message ? this.message : 'Explore with WASD or arrow keys. Press E near a character to answer math!', 15, 55, 230, 18);
    }
  }
  
  loop() {
    this.update();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    this.world.draw(ctx, this.cam);
    
    for (let npc of this.npcs) {
      npc.draw(ctx);
    }
    this.player.draw(ctx);
    this.drawUI(ctx);
    
    requestAnimationFrame(() => this.loop());
  }
}

new Game();