const canvas = document.createElement('canvas');
canvas.width = 480;
canvas.height = 320;
document.getElementById('game-of-the-day-stage').appendChild(canvas);
const ctx = canvas.getContext('2d');

const GRAVITY = 0.6;
const FRICTION = 0.8;
const PLAYER_SPEED = 3;
const JUMP_POWER = 12;
const TILE_SIZE = 32;

let keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

const colors = {
  sky: '#87ceeb',
  ground: '#654321',
  platform: '#49311c',
  player: '#ffcc00',
  npc: '#00ccff',
  enemy: '#cc2200',
  questionBox: '#ffee00',
  text: '#222222',
};

class Rectangle {
  constructor(x,y,w,h){
    this.x=x; this.y=y; this.w=w; this.h=h;
  }
  intersects(other){
    return !(
      this.x + this.w <= other.x || this.x >= other.x + other.w ||
      this.y + this.h <= other.y || this.y >= other.y + other.h
    );
  }
}

class Platform {
  constructor(x,y,w,h){
    this.rect = new Rectangle(x,y,w,h);
  }
  draw(ctx){
    ctx.fillStyle = colors.platform;
    ctx.fillRect(this.rect.x,this.rect.y,this.rect.w,this.rect.h);
    // add subtle highlights
    ctx.strokeStyle = "#7f5b2a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.rect.x, this.rect.y + this.rect.h*0.3);
    ctx.lineTo(this.rect.x + this.rect.w, this.rect.y + this.rect.h*0.3);
    ctx.stroke();
  }
}

class QuestionBox {
  constructor(x,y,question){
    this.rect = new Rectangle(x,y,TILE_SIZE,TILE_SIZE);
    this.question = question;
    this.answered = false;
  }
  draw(ctx){
    ctx.fillStyle = this.answered ? '#8f8f8f' : colors.questionBox;
    ctx.fillRect(this.rect.x,this.rect.y,this.rect.w,this.rect.h);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 20px Minecraftia, monospace, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', this.rect.x + this.rect.w/2, this.rect.y + this.rect.h/2);
  }
}

class Character {
  constructor(x,y,color){
    this.pos = {x:x,y:y};
    this.vel = {x:0,y:0};
    this.w = 28;
    this.h = 32;
    this.color = color;
    this.onGround = false;
  }
  get rect(){
    return new Rectangle(this.pos.x,this.pos.y,this.w,this.h);
  }
  draw(ctx){
    ctx.fillStyle = this.color;
    // body
    ctx.fillRect(this.pos.x,this.pos.y,this.w,this.h);
    // eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.pos.x+6,this.pos.y+8,6,6);
    ctx.fillRect(this.pos.x+16,this.pos.y+8,6,6);
    ctx.fillStyle = '#000';
    ctx.fillRect(this.pos.x+8,this.pos.y+10,2,2);
    ctx.fillRect(this.pos.x+18,this.pos.y+10,2,2);
    // smile
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.pos.x+this.w/2, this.pos.y+this.h-10, 8, Math.PI*0.1, Math.PI*0.9);
    ctx.stroke();
  }
}

class NPC extends Character {
  constructor(x,y,dialogue,color='#00ccff'){
    super(x,y,color);
    this.dialogue = dialogue;
    this.dialogueActive = false;
  }
  draw(ctx){
    super.draw(ctx);
    // draw a little hat - pixel art style
    ctx.fillStyle = '#0077aa';
    ctx.fillRect(this.pos.x+8,this.pos.y-6, 12, 6);
    ctx.fillRect(this.pos.x+6,this.pos.y-2, 16, 2);
  }
}

class Enemy extends Character {
  constructor(x,y, range=100, speed=1.5, color=colors.enemy){
    super(x,y,color);
    this.range = range;
    this.speed = speed;
    this.baseX = x;
    this.dir = 1;
  }
  update(){
    this.pos.x += this.speed * this.dir;
    if(this.pos.x > this.baseX + this.range) this.dir = -1;
    if(this.pos.x < this.baseX) this.dir = 1;
  }
  draw(ctx){
    super.draw(ctx);
    // add spikes head pixel style
    ctx.fillStyle = '#cc0000';
    ctx.beginPath();
    ctx.moveTo(this.pos.x,this.pos.y);
    ctx.lineTo(this.pos.x+this.w/2,this.pos.y-16);
    ctx.lineTo(this.pos.x+this.w,this.pos.y);
    ctx.closePath();
    ctx.fill();
  }
}

class Game {
  constructor(ctx){
    this.ctx = ctx;
    this.width = ctx.canvas.width;
    this.height = ctx.canvas.height;
    this.platforms = [];
    this.questionBoxes = [];
    this.npcs = [];
    this.enemies = [];
    this.player = new Character(50, 200, colors.player);
    this.score = 0;
    this.lives = 3;
    this.state = 'playing'; //'playing', 'dialogue', 'gameover', 'quiz'
    this.currentDialogue = null;
    this.currentQuestion = null;
    this.messageCountdown = 0;

    this.questions = [
      {
        q: 'Which material is needed to craft TNT?',
        choices: ['Sand & Gunpowder','Dirt & Flint','Stone & Redstone','Wood & Coal'],
        answer:0,
        fact:'TNT is crafted from Sand and Gunpowder.'
      },
      {
        q: 'What mob explodes near the player?',
        choices: ['Zombie','Creeper','Skeleton','Spider'],
        answer:1,
        fact:'Creepers sneak close and then explode!'
      },
      {
        q: 'Which block is unbreakable in survival mode?',
        choices: ['Obsidian','Bedrock','End Stone','Netherrack'],
        answer:1,
        fact:'Bedrock can\'t be broken in survival mode.'
      },
      {
        q: 'Which mob drops leather?',
        choices: ['Cow','Chicken','Sheep','Zombie'],
        answer:0,
        fact:'Cows drop leather when defeated.'
      },
      {
        q: 'Which is NOT a Nether dimension block?',
        choices: ['Quartz Ore','Glowstone','Ice','Nether Bricks'],
        answer:2,
        fact:'Ice does not naturally appear in the Nether.'
      }
    ];

    this.init();
  }

  init(){
    // Create ground platforms
    this.platforms.push(new Platform(0, 288, 480, 32)); 
    // Floating platforms
    this.platforms.push(new Platform(96, 240, 96, 16));
    this.platforms.push(new Platform(288, 192, 96, 16));
    this.platforms.push(new Platform(176, 136, 64, 16));
    this.platforms.push(new Platform(400, 112, 64, 16));
    // Question boxes on platforms
    this.questionBoxes.push(new QuestionBox(120, 208, this.questions[0]));
    this.questionBoxes.push(new QuestionBox(320, 160, this.questions[1]));
    this.questionBoxes.push(new QuestionBox(190, 104, this.questions[2]));
    this.questionBoxes.push(new QuestionBox(410, 80, this.questions[3]));
    // NPCs near question boxes
    this.npcs.push(new NPC(140, 176, "Hi! Press E to answer Minecraft trivia!"));
    this.npcs.push(new NPC(340, 128, "Try answering a question! Press E!"));
    // Enemy patrols on ground and floating platform
    this.enemies.push(new Enemy(50, 256, 120, 1.2));
    this.enemies.push(new Enemy(300, 176, 80, 1));

    this.player.pos.x = 10; 
    this.player.pos.y = 256; 
    this.player.vel.x = 0;
    this.player.vel.y = 0;

    this.lives = 3;
    this.score = 0;
  }

  collideRectWithPlatforms(rect){
    for(let plat of this.platforms){
      if(rect.intersects(plat.rect)) return plat.rect;
    }
    return null;
  }

  updatePlayer(){
    // Horizontal movement
    if(keys['a'] || keys['arrowleft']){
      this.player.vel.x = Math.max(this.player.vel.x - 0.5, -PLAYER_SPEED);
    } else if(keys['d'] || keys['arrowright']){
      this.player.vel.x = Math.min(this.player.vel.x + 0.5, PLAYER_SPEED);
    } else {
      this.player.vel.x *= FRICTION;
      if(Math.abs(this.player.vel.x) < 0.1) this.player.vel.x = 0;
    }

    // Jumping
    if((keys['w'] || keys['arrowup'] || keys[' ']) && this.player.onGround){
      this.player.vel.y = -JUMP_POWER;
      this.player.onGround = false;
    }

    // Gravity
    this.player.vel.y += GRAVITY;

    // Apply velocity
    this.player.pos.x += this.player.vel.x;
    this.player.pos.y += this.player.vel.y;

    // Boundary checks
    if(this.player.pos.x < 0) this.player.pos.x = 0;
    if(this.player.pos.x + this.player.w > this.width) this.player.pos.x = this.width - this.player.w;
    if(this.player.pos.y + this.player.h > this.height) {
      this.player.pos.y = this.height - this.player.h;
      this.player.vel.y = 0;
      this.player.onGround = true;
    }

    // Platform collision Y (vertical)
    let playerRect = this.player.rect;
    this.player.onGround = false;
    for(let plat of this.platforms){
      if(playerRect.intersects(plat.rect)){
        // Coming from above?
        if(this.player.vel.y > 0 && this.player.pos.y + this.player.h - this.player.vel.y <= plat.rect.y){
          this.player.pos.y = plat.rect.y - this.player.h;
          this.player.vel.y = 0;
          this.player.onGround = true;
          playerRect = this.player.rect;
        }
        // Hitting platform from below
        else if(this.player.vel.y < 0 && this.player.pos.y >= plat.rect.y + plat.rect.h - this.player.vel.y){
          this.player.pos.y = plat.rect.y + plat.rect.h;
          this.player.vel.y = 0;
          playerRect = this.player.rect;
        }
        // Side collision
        else {
          if(this.player.vel.x > 0){
            this.player.pos.x = plat.rect.x - this.player.w;
          } else if(this.player.vel.x < 0) {
            this.player.pos.x = plat.rect.x + plat.rect.w;
          }
          this.player.vel.x = 0;
          playerRect = this.player.rect;
        }
      }
    }
  }

  checkQuestionBoxInteraction(){
    for(let qb of this.questionBoxes){
      if(qb.answered) continue;
      if(this.player.rect.intersects(qb.rect)){
        if(keys['e']){
          this.state = 'quiz';
          this.currentQuestion = qb;
          qb.answered = true;
          keys['e'] = false;
          return;
        }
      }
    }
  }

  checkNPCInteraction(){
    for(let npc of this.npcs){
      if(this.player.rect.intersects(npc.rect)){
        if(keys['e'] && !npc.dialogueActive){
          this.state = 'dialogue';
          this.currentDialogue = npc.dialogue;
          npc.dialogueActive = true;
          keys['e'] = false;
        }
      } else {
        npc.dialogueActive = false;
      }
    }
  }

  checkEnemyCollision(){
    for(let enemy of this.enemies){
      if(this.player.rect.intersects(enemy.rect)){
        this.lives--;
        this.messageCountdown = 180;
        this.player.pos.x = 10;
        this.player.pos.y = 256;
        this.player.vel.x = 0;
        this.player.vel.y = 0;
        if(this.lives <= 0){
          this.state = 'gameover';
        }
      }
    }
  }

  updateEnemies(){
    for(let enemy of this.enemies){
      enemy.update();
    }
  }

  gameLoop(){
    this.update();

    this.draw();

    requestAnimationFrame(() => this.gameLoop());
  }

  update(){
    if(this.state === 'playing'){
      this.updatePlayer();
      this.updateEnemies();
      this.checkQuestionBoxInteraction();
      this.checkNPCInteraction();
      this.checkEnemyCollision();
    } else if(this.state === 'dialogue'){
      if(keys['e']){
        this.state = 'playing';
        this.currentDialogue = null;
        keys['e'] = false;
      }
    } else if(this.state === 'quiz'){
      // nothing auto
    } else if(this.state === 'gameover') {
      if(keys['r']){
        this.state = 'playing';
        this.init();
        keys['r'] = false;
      }
    }
    if(this.messageCountdown > 0) this.messageCountdown--;
  }

  draw(){
    // Background
    this.ctx.fillStyle = colors.sky;
    this.ctx.fillRect(0,0,this.width,this.height);

    // Draw platforms and ground
    for(let plat of this.platforms){
      plat.draw(this.ctx);
    }

    // Draw question boxes
    for(let qb of this.questionBoxes){
      qb.draw(this.ctx);
    }

    // Draw NPCs
    for(let npc of this.npcs){
      npc.draw(this.ctx);
    }

    // Draw enemies
    for(let enemy of this.enemies){
      enemy.draw(this.ctx);
    }

    // Draw player
    this.player.draw(this.ctx);

    // HUD - Lives and Score
    this.ctx.fillStyle = colors.text;
    this.ctx.font = '16px Minecraftia, monospace, Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Lives: ' + this.lives, 10, 20);
    this.ctx.fillText('Score: ' + this.score, 380, 20);

    // Messages
    if(this.messageCountdown > 0){
      this.ctx.fillStyle = 'rgba(255,50,50,0.8)';
      this.ctx.font = '20px Minecraftia, monospace, Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('You were hit! Be careful!', this.width/2, 50);
    }

    if(this.state === 'dialogue'){
      this.drawDialogue(this.currentDialogue);
    } 
    if(this.state === 'quiz'){
      this.drawQuiz();
    }
    if(this.state === 'gameover'){
      this.drawGameOver();
    }
  }

  drawDialogue(text){
    const w = 460;
    const h = 70;
    const x = (this.width - w)/2;
    const y = this.height - h - 10;
    this.ctx.fillStyle = 'rgba(0,0,0,0.8)';
    this.ctx.fillRect(x,y,w,h);
    this.ctx.strokeStyle = '#ffee00';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x,y,w,h);
    this.ctx.fillStyle = '#ffee00';
    this.ctx.font = '18px Minecraftia, monospace, Arial';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text, x + 10, y + 10);
    this.ctx.font = '14px Minecraftia, monospace, Arial';
    this.ctx.fillText('(Press E to close)', x + 10, y + 40);
  }

  drawQuiz(){
    const q = this.currentQuestion.question;
    const w = 460;
    const h = 200;
    const x = (this.width - w)/2;
    const y = (this.height - h)/2;
    this.ctx.fillStyle = 'rgba(0,0,0,0.9)';
    this.ctx.fillRect(x,y,w,h);
    this.ctx.strokeStyle = '#ffee00';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(x,y,w,h);

    this.ctx.fillStyle = '#ffee00';
    this.ctx.font = '20px Minecraftia, monospace, Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Minecraft Trivia', x+w/2, y+30);

    this.ctx.fillStyle = '#fff';
    this.ctx.font = '16px Minecraftia, monospace, Arial';
    this.ctx.textAlign = 'left';

    const qText = this.currentQuestion.question.q;
    this.ctx.fillText(qText, x+20, y+70);

    // Draw choices with number keys 1-4
    const choices = this.currentQuestion.question.choices;
    for(let i=0; i<choices.length; i++){
      this.ctx.fillStyle = '#ccc';
      this.ctx.fillRect(x+20, y+100 + 30*i, w-40, 24);
      this.ctx.fillStyle = '#000';
      this.ctx.fillText(`${i+1}. ${choices[i]}`, x+30, y+120 + 30*i);
    }
    
    this.ctx.fillStyle = '#ffee00';
    this.ctx.font = '14px Minecraftia, monospace, Arial';
    this.ctx.fillText('Press 1-4 to answer, or E to skip', x+w/2, y+h-25);

    // Listen for answer keys for quiz here
    for(let i=0; i<choices.length; i++){
      if(keys[(i+1).toString()]){
        keys[(i+1).toString()] = false;
        if(i === this.currentQuestion.question.answer){
          this.score += 10;
          this.showFact(this.currentQuestion.question.fact, true);
        } else {
          this.showFact('Oops! The correct answer was: ' + choices[this.currentQuestion.question.answer], false);
        }
        this.state = 'playing';
        this.currentQuestion = null;
      }
    }
    // skip quiz
    if(keys['e']){
      keys['e'] = false;
      this.state = 'playing';
      this.currentQuestion = null;
    }
  }

  showFact(text, positive){
    this.factText = text;
    this.messageCountdown = 240;
    this.ctx.clearRect(0,0,this.width,this.height);
    // show overlay
    this.ctx.fillStyle = positive ? 'rgba(50,255,50,0.9)' : 'rgba(255,100,100,0.9)';
    this.ctx.fillRect(20, 100, this.width-40, 80);
    this.ctx.fillStyle = '#222';
    this.ctx.font = '18px Minecraftia, monospace, Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, this.width/2, 140);
  }

  drawGameOver(){
    this.ctx.fillStyle = 'rgba(0,0,0,0.9)';
    this.ctx.fillRect(0,0,this.width,this.height);
    this.ctx.fillStyle = '#ff5555';
    this.ctx.font = '42px Minecraftia, monospace, Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('GAME OVER', this.width/2, this.height/2 - 20);
    this.ctx.font = '18px Minecraftia, monospace, Arial';
    this.ctx.fillText(`Final Score: ${this.score}`, this.width/2, this.height/2 + 20);
    this.ctx.fillText('Press R to Restart', this.width/2, this.height/2 + 60);
  }
}

const game = new Game(ctx);
game.gameLoop();