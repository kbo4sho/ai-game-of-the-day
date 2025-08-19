(() => {
  const WIDTH = 480;
  const HEIGHT = 320;
  const GRAVITY = 0.6;
  const JUMP_STRENGTH = -12;
  const FLOOR_Y = HEIGHT - 40;
  const PLAYER_SPEED = 3;

  const stage = document.getElementById('game-of-the-day-stage');
  stage.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Helper: Draw rounded rect
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // Colors
  const COLORS = {
    bg: '#87ceeb',
    floor: '#654321',
    player: '#ff4444',
    platform: '#339933',
    enemy: '#ffcc00',
    questionBoxBg: '#222288',
    questionBoxText: '#ffffff',
    mathText: '#ffffff',
    answerBox: '#4444aa',
    answerBoxCorrect: '#33cc33',
    answerBoxWrong: '#cc3333',
  };

  // Basic classes

  class Entity {
    constructor(x, y, w, h) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
    }
    get left() { return this.x; }
    get right() { return this.x + this.w; }
    get top() { return this.y; }
    get bottom() { return this.y + this.h; }
    intersects(other) {
      return !(this.right < other.left || this.left > other.right || this.bottom < other.top || this.top > other.bottom);
    }
  }

  class Player extends Entity {
    constructor(x, y) {
      super(x, y, 30, 40);
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.color = COLORS.player;
    }
    update(platforms) {
      this.vy += GRAVITY;
      this.x += this.vx;
      this.y += this.vy;

      // Collisions with platforms
      this.onGround = false;
      for (const p of platforms) {
        if (this.bottom > p.top && this.top < p.bottom && this.right > p.left && this.left < p.right) {
          if (this.vy > 0 && this.bottom - this.vy <= p.top) {
            // landed on top
            this.y = p.top - this.h;
            this.vy = 0;
            this.onGround = true;
          } else if (this.vy < 0 && this.top - this.vy >= p.bottom) {
            // hit head
            this.y = p.bottom;
            this.vy = 0;
          } else if (this.vx > 0 && this.right - this.vx <= p.left) {
            // hit left side of platform
            this.x = p.left - this.w;
            this.vx = 0;
          } else if (this.vx < 0 && this.left - this.vx >= p.right) {
            // hit right side of platform
            this.x = p.right;
            this.vx = 0;
          }
        }
      }

      // Constrain to screen horizontally
      if (this.x < 0) this.x = 0;
      if (this.x + this.w > WIDTH) this.x = WIDTH - this.w;

      // Floor collision
      if (this.y + this.h > FLOOR_Y) {
        this.y = FLOOR_Y - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    }
    draw(ctx) {
      // Simple retro style character: rectangle body + eyes
      ctx.fillStyle = this.color;
      roundedRect(ctx, this.x, this.y, this.w, this.h, 6);
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x + 7, this.y + 10, 6, 8);
      ctx.fillRect(this.x + this.w - 15, this.y + 10, 6, 8);
      ctx.fillStyle = '#000';
      ctx.fillRect(this.x + 9, this.y + 12, 2, 4);
      ctx.fillRect(this.x + this.w - 13, this.y + 12, 2, 4);
    }
  }

  class Platform extends Entity {
    constructor(x, y, w, h) {
      super(x, y, w, h);
      this.color = COLORS.platform;
    }
    draw(ctx) {
      ctx.fillStyle = this.color;
      roundedRect(ctx, this.x, this.y, this.w, this.h, 6);
      // Simple grass effect on top
      ctx.fillStyle = '#22aa22';
      ctx.fillRect(this.x, this.y, this.w, 6);
    }
  }

  class Enemy extends Entity {
    constructor(x, y, w, h, patrolDist = 80) {
      super(x, y, w, h);
      this.startX = x;
      this.patrolDist = patrolDist;
      this.speed = 1.2;
      this.dir = 1;
      this.color = COLORS.enemy;
    }
    update() {
      this.x += this.speed * this.dir;
      if (this.x > this.startX + this.patrolDist) this.dir = -1;
      else if (this.x < this.startX) this.dir = 1;
    }
    draw(ctx) {
      // Retro bug style shape with "antenna"
      ctx.fillStyle = this.color;
      roundedRect(ctx, this.x, this.y, this.w, this.h, 8);
      // Antenna
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x + 6, this.y);
      ctx.lineTo(this.x + 6, this.y - 10);
      ctx.moveTo(this.x + this.w - 6, this.y);
      ctx.lineTo(this.x + this.w - 6, this.y - 10);
      ctx.stroke();
      // Eyes
      ctx.fillStyle = '#000';
      ctx.fillRect(this.x + 5, this.y + 10, 5, 5);
      ctx.fillRect(this.x + this.w - 11, this.y + 10, 5, 5);
    }
  }

  class QuestionBox extends Entity {
    constructor(x, y, question, answers, correctIndex) {
      super(x, y, 40, 40);
      this.question = question;
      this.answers = answers;
      this.correctIndex = correctIndex;
      this.answered = false;
      this.showQuestion = false;
      this.color = COLORS.questionBoxBg;
      this.answerBoxes = [];
      this.active = false;
    }
    draw(ctx) {
      ctx.fillStyle = this.color;
      roundedRect(ctx, this.x, this.y, this.w, this.h, 8);
      // Draw question mark
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', this.x + this.w / 2, this.y + this.h / 2);

      if (this.showQuestion) {
        // Draw question box overlay
        const qbX = WIDTH / 2 - 140;
        const qbY = HEIGHT / 2 - 100;
        const qbW = 280;
        const qbH = 200;
        ctx.fillStyle = 'rgba(0,0,50,0.85)';
        roundedRect(ctx, qbX, qbY, qbW, qbH, 14);

        ctx.fillStyle = COLORS.mathText;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Solve:', qbX + qbW / 2, qbY + 16);
        ctx.font = 'bold 32px monospace';
        ctx.fillText(this.question, qbX + qbW / 2, qbY + 50);

        // Draw answers
        ctx.font = '24px monospace';
        this.answerBoxes = [];
        const boxW = 100;
        const boxH = 40;
        const firstX = qbX + 20;
        const baseY = qbY + 110;
        for (let i = 0; i < this.answers.length; i++) {
          const bx = firstX + (i % 2) * (boxW + 30);
          const by = baseY + Math.floor(i / 2) * (boxH + 20);
          const correct = this.answered && i === this.correctIndex;
          const wrong = this.answered && i === this.selectedIndex && i !== this.correctIndex;
          ctx.fillStyle = correct ? COLORS.answerBoxCorrect : wrong ? COLORS.answerBoxWrong : COLORS.answerBox;
          roundedRect(ctx, bx, by, boxW, boxH, 8);
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(this.answers[i], bx + boxW / 2, by + boxH / 2);
          this.answerBoxes.push({x: bx, y: by, w: boxW, h: boxH, index: i});
        }

        if(!this.answered) {
          ctx.fillStyle = '#ccc';
          ctx.font = '14px monospace';
          ctx.fillText('Click the correct answer!', qbX + qbW / 2, qbY + qbH - 24);
        } else {
          ctx.fillStyle = correct ? COLORS.answerBoxCorrect : COLORS.answerBoxWrong;
          ctx.font = '18px monospace';
          ctx.fillText(this.selectedIndex === this.correctIndex ? 'Correct! Keep going!' : 'Oops! Try again next time.', qbX + qbW / 2, qbY + qbH - 24);
        }
      }
    }
    tryAnswer(x, y) {
      if (!this.showQuestion || this.answered) return false;
      for (const box of this.answerBoxes) {
        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
          this.selectedIndex = box.index;
          this.answered = true;
          this.showQuestion = false;
          return box.index === this.correctIndex;
        }
      }
      return false;
    }
  }

  // Levels will have platforms, enemies, and question boxes

  // Generate random simple math question (addition or subtraction within 20)
  function generateMathQuestion() {
    const a = Math.floor(Math.random() * 16) + 1;
    const b = Math.floor(Math.random() * 16) + 1;
    const op = Math.random() < 0.5 ? '+' : '-';
    let question, answer;
    if (op === '+') {
      question = `${a} + ${b}`;
      answer = a + b;
    } else {
      // Ensure no negative answers
      const big = Math.max(a,b);
      const small = Math.min(a,b);
      question = `${big} - ${small}`;
      answer = big - small;
    }
    // 3 answer choices total, including correct one
    let wrongAnswers = new Set();
    while (wrongAnswers.size < 2) {
      let na = answer + (Math.floor(Math.random()*7)-3);
      if (na !== answer && na >= 0) wrongAnswers.add(na);
    }
    const answers = Array.from(wrongAnswers);
    // Insert correct in random position
    const correctIndex = Math.floor(Math.random()*3);
    answers.splice(correctIndex, 0, answer);
    return {question, answers, correctIndex};
  }

  // Game Controller
  class Game {
    constructor(ctx) {
      this.ctx = ctx;
      this.keys = {};
      this.score = 0;
      this.lives = 3;
      this.level = 1;
      this.state = 'running'; // 'running', 'question', 'gameover'
      this.player = new Player(50, FLOOR_Y - 40);
      this.platforms = [];
      this.enemies = [];
      this.questions = [];
      this.activeQuestion = null;
      this.messageTimer = 0;

      this.setupLevel();

      window.addEventListener('keydown', e => {
        this.keys[e.key.toLowerCase()] = true;
      });
      window.addEventListener('keyup', e => {
        this.keys[e.key.toLowerCase()] = false;
      });
      canvas.addEventListener('click', e => {
        this.handleClick(e.offsetX, e.offsetY);
      });
    }

    setupLevel() {
      this.platforms = [];
      this.enemies = [];
      this.questions = [];

      // Floor platform
      this.platforms.push(new Platform(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y));

      // Other platforms for the level (positions vary a bit by level)
      // Platforms placed so player can jump, enemies walk on them, question boxes on some platforms
      const basePlatforms = [
        {x: 80, y: FLOOR_Y - 90, w: 120, h: 20},
        {x: 250, y: FLOOR_Y - 140, w: 100, h: 20},
        {x: 380, y: FLOOR_Y - 80, w: 80, h: 20}
      ];

      for (let p of basePlatforms) {
        let plat = new Platform(p.x, p.y, p.w, p.h);
        this.platforms.push(plat);
      }

      // Add enemies on some platforms
      this.enemies.push(new Enemy(90, FLOOR_Y - 130, 30, 40, 60));
      this.enemies.push(new Enemy(260, FLOOR_Y - 180, 30, 40, 50));

      // Questions: place question boxes on platforms
      for (let pos of [
        {x: 120, y: FLOOR_Y - 130},
        {x: 290, y: FLOOR_Y - 180},
        {x: 410, y: FLOOR_Y - 120}
      ]) {
        const {question, answers, correctIndex} = generateMathQuestion();
        const qb = new QuestionBox(pos.x, pos.y, question, answers, correctIndex);
        this.questions.push(qb);
      }
    }

    update() {
      if (this.state === 'running') {
        this.handleInput();
        this.player.update(this.platforms);

        // Update enemies
        for (const enemy of this.enemies) {
          enemy.update();
        }

        // Check collisions with enemies
        for (const enemy of this.enemies) {
          if (this.player.intersects(enemy)) {
            // Reset player to start, lose a life
            this.lives--;
            this.messageTimer = 120;
            if (this.lives <= 0) {
              this.state = 'gameover';
            } else {
              this.player.x = 50;
              this.player.y = FLOOR_Y - this.player.h;
              this.player.vx = 0;
              this.player.vy = 0;
            }
            break;
          }
        }

        // Check collision with question boxes triggers question popup
        for (let qb of this.questions) {
          if (!qb.answered && this.player.intersects(qb)) {
            this.activeQuestion = qb;
            qb.showQuestion = true;
            this.state = 'question';
            this.player.vx = 0;
            this.player.vy = 0;
            break;
          }
        }

        // If player reaches right edge, level complete and restart with incremented level (new harder math)
        if (this.player.x + this.player.w >= WIDTH - 1) {
          this.level++;
          this.score += 10;
          this.messageTimer = 120;
          // Reset player, new level platforms/enemies/questions
          this.player.x = 50;
          this.player.y = FLOOR_Y - this.player.h;
          this.setupLevel();
          this.state = 'running';
        }

        if(this.messageTimer > 0) this.messageTimer--;
      }
    }

    draw() {
      // Clear background
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Draw background hills - retro pixel style
      for(let i=0; i<6; i++){
        const hillX = (i*80 + (Date.now()*0.04)%80);
        ctx.fillStyle = `hsl(120, 50%, ${30 + i*10}%)`;
        ctx.beginPath();
        ctx.moveTo(hillX - 60, FLOOR_Y);
        ctx.quadraticCurveTo(hillX, FLOOR_Y - 80, hillX + 60, FLOOR_Y);
        ctx.closePath();
        ctx.fill();
      }

      // Draw floor
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(0, FLOOR_Y, WIDTH, HEIGHT - FLOOR_Y);

      // Draw platforms
      for (const p of this.platforms) p.draw(ctx);
      // Draw enemies
      for (const e of this.enemies) e.draw(ctx);
      // Draw question boxes
      for (const qb of this.questions) qb.draw(ctx);
      // Draw player
      this.player.draw(ctx);

      // UI - score, lives, level
      ctx.fillStyle = '#000';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Score: ${this.score}`, 10, 26);
      ctx.fillText(`Lives: ${this.lives}`, 10, 54);
      ctx.fillText(`Level: ${this.level}`, 10, 82);

      // Message when hit enemy or level complete
      if(this.messageTimer > 0){
        ctx.textAlign = 'center';
        ctx.fillStyle = '#cc3333';
        ctx.font = 'bold 28px monospace';
        ctx.fillText(this.lives <= 0 ? 'Game Over!' : 'Watch out!', WIDTH/2, 140);
      }

      // Draw question overlay if active
      if(this.state === 'question' && this.activeQuestion){
        this.activeQuestion.draw(ctx);
      }

      if(this.state === 'gameover'){
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 42px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', WIDTH/2, HEIGHT/2 - 20);
        ctx.font = '20px monospace';
        ctx.fillText(`Final Score: ${this.score}`, WIDTH/2, HEIGHT/2 + 20);
        ctx.fillText('Reload page to play again', WIDTH/2, HEIGHT/2 + 60);
      }
    }

    handleInput() {
      if (this.keys['arrowleft'] || this.keys['a']) {
        this.player.vx = -PLAYER_SPEED;
      } else if (this.keys['arrowright'] || this.keys['d']) {
        this.player.vx = PLAYER_SPEED;
      } else {
        this.player.vx = 0;
      }
      if ((this.keys['arrowup'] || this.keys['w'] || this.keys[' ']) && this.player.onGround) {
        this.player.vy = JUMP_STRENGTH;
        this.player.onGround = false;
      }
    }

    handleClick(x, y) {
      if (this.state === 'question' && this.activeQuestion) {
        const correct = this.activeQuestion.tryAnswer(x, y);
        if (correct) {
          this.score += 5;
        } else {
          this.lives--;
          if (this.lives <= 0) {
            this.state = 'gameover';
            return;
          }
        }
        this.state = 'running';
        this.activeQuestion = null;
      }
    }
  }

  const game = new Game(ctx);

  function loop() {
    game.update();
    game.draw();
    requestAnimationFrame(loop);
  }

  loop();
})();