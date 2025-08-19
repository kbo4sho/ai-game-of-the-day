const stage = document.getElementById('game-of-the-day-stage');
stage.innerHTML = '';
const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

class Vector {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  add(v) { return new Vector(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vector(this.x - v.x, this.y - v.y); }
  mul(s) { return new Vector(this.x * s, this.y * s); }
}

class Character {
  constructor(name, x, y, color, shape) {
    this.name = name;
    this.pos = new Vector(x, y);
    this.color = color;
    this.radius = 18;
    this.speed = 2.5;
    this.shape = shape; // 'circle' or 'triangle'
    this.target = null;
  }
  draw(ctx, cam) {
    const p = this.pos.sub(cam);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = this.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    if (this.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      // eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-6, -5, 3, 0, 2 * Math.PI);
      ctx.arc(6, -5, 3, 0, 2 * Math.PI);
      ctx.fill();
      // smile
      ctx.beginPath();
      ctx.arc(0, 3, 8, 0, Math.PI);
      ctx.stroke();
    } else if (this.shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(this.radius, this.radius);
      ctx.lineTo(-this.radius, this.radius);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-6, -3, 3, 0, 2 * Math.PI);
      ctx.arc(6, -3, 3, 0, 2 * Math.PI);
      ctx.fill();
      // mouth
      ctx.beginPath();
      ctx.moveTo(-5, 5);
      ctx.lineTo(5,5);
      ctx.stroke();
    }
    ctx.restore();
  }
  moveTowards(targetPos) {
    const dir = targetPos.sub(this.pos);
    const dist = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    if (dist < this.speed) {
      this.pos = targetPos;
      return true;
    }
    const vel = new Vector(dir.x / dist * this.speed, dir.y / dist * this.speed);
    this.pos = this.pos.add(vel);
    return false;
  }
}

class NPC extends Character {
  constructor(name, x, y, color, shape, question, answer) {
    super(name, x, y, color, shape);
    this.question = question;
    this.answer = answer;
  }
  draw(ctx, cam) {
    super.draw(ctx, cam);
    // Draw question mark above
    const p = this.pos.sub(cam);
    ctx.fillStyle = 'yellow';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('?', p.x, p.y - 30);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeText('?', p.x, p.y - 30);
  }
}

class Game {
  constructor() {
    this.width = canvas.width;
    this.height = canvas.height;
    this.worldWidth = 2000;
    this.worldHeight = 1500;
    this.player = new Character('Player', this.worldWidth/2, this.worldHeight/2, '#2a9d8f', 'circle');
    this.cam = new Vector(this.player.pos.x - this.width/2, this.player.pos.y - this.height/2);
    this.npcs = [];
    this.keys = {};
    this.message = '';
    this.messageTimer = 0;
    this.initNPCs();
    this.bgTiles = this.generateTiles();
    this.collectibles = this.generateCollectibles();
    this.collected = 0;
    this.promptingNPC = null;
    this.questionAnswered = false;
    this.shakeTimer = 0;
    this.flashTimer = 0;

    this.initInput();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  generateTiles() {
    // Generate a tiled terrain pattern with soft hills and grass patches
    let tiles = [];
    const tileSize = 64;
    for(let y=0; y < this.worldHeight; y += tileSize) {
      for(let x=0; x < this.worldWidth; x += tileSize) {
        let type = 'grass';
        // Simple noise-like "hills"
        const hill = Math.sin(x*0.005)*Math.cos(y*0.005*1.5)*20;
        if (hill > 15) type = 'hill';
        if (hill < -15) type = 'water';
        tiles.push({x,y,type});
      }
    }
    return tiles;
  }
  generateCollectibles() {
    // Collectibles are "stars" scattered around
    let stars = [];
    for(let i=0; i<20; i++) {
      const x = 100 + Math.random()*(this.worldWidth-200);
      const y = 100 + Math.random()*(this.worldHeight-200);
      stars.push({pos: new Vector(x,y), collected:false});
    }
    return stars;
  }
  initNPCs() {
    // Place NPCs with math questions scattered across world
    this.npcs.push(new NPC('Milo', 400, 600, '#e76f51', 'triangle', '5 + 7 = ?', 12));
    this.npcs.push(new NPC('Luna', 1600, 300, '#f4a261', 'circle', '9 - 4 = ?', 5));
    this.npcs.push(new NPC('Rex', 1200, 1200, '#264653', 'triangle', '6 * 3 = ?', 18));
    this.npcs.push(new NPC('Zara', 700, 1000, '#e9c46a', 'circle', '15 / 3 = ?', 5));
    this.npcs.push(new NPC('Ivy', 1800, 1100, '#ff8c00', 'circle', '11 + 9 = ?', 20));
  }
  initInput() {
    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'Enter' && this.promptingNPC && !this.questionAnswered) {
        this.handleAnswerPrompt();
      }
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }
  handleAnswerPrompt() {
    let answer = prompt(this.promptingNPC.question + " (Type your answer)");
    if (answer === null) {
      this.showMessage("Question skipped.");
      this.promptingNPC = null;
      this.questionAnswered = false;
      return;
    }
    const ansNum = parseInt(answer.trim());
    if (!isNaN(ansNum)) {
      if (ansNum === this.promptingNPC.answer) {
        this.showMessage("Correct! +" + 5 + " stars!");
        this.collected += 5;
        this.questionAnswered = true;
        this.promptingNPC = null;
        this.shakeTimer = 20;
        this.flashTimer = 15;
      } else {
        this.showMessage("Wrong! Try again later.");
        this.promptingNPC = null;
        this.questionAnswered = false;
      }
    } else {
      this.showMessage("Invalid answer.");
    }
  }
  showMessage(msg) {
    this.message = msg;
    this.messageTimer = 180; // 3 seconds at 60fps approx
  }
  update() {
    // Player movement WASD or arrows
    let move = new Vector(0,0);
    if (this.keys['w'] || this.keys['arrowup']) move.y -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) move.y += 1;
    if (this.keys['a'] || this.keys['arrowleft']) move.x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) move.x += 1;
    if (move.x !== 0 || move.y !== 0) {
      const len = Math.sqrt(move.x*move.x + move.y*move.y);
      const vel = new Vector(move.x/len * this.player.speed, move.y/len * this.player.speed);
      const newPos = this.player.pos.add(vel);
      // Boundary clamp
      this.player.pos.x = Math.min(this.worldWidth-20, Math.max(20, newPos.x));
      this.player.pos.y = Math.min(this.worldHeight-20, Math.max(20, newPos.y));
    }

    // Update camera centering player with screen clamp
    this.cam.x = this.player.pos.x - this.width / 2;
    this.cam.y = this.player.pos.y - this.height / 2;
    this.cam.x = Math.min(this.worldWidth - this.width, Math.max(0, this.cam.x));
    this.cam.y = Math.min(this.worldHeight - this.height, Math.max(0, this.cam.y));

    // Check proximity for NPC interaction
    this.promptingNPC = null;
    this.questionAnswered = false;
    for(let npc of this.npcs) {
      const dist = Math.hypot(npc.pos.x - this.player.pos.x, npc.pos.y - this.player.pos.y);
      if (dist < 50) {
        this.promptingNPC = npc;
        break;
      }
    }

    // Collect collectibles (stars)
    for(let star of this.collectibles) {
      if (!star.collected) {
        const dist = Math.hypot(star.pos.x - this.player.pos.x, star.pos.y - this.player.pos.y);
        if (dist < 20) {
          star.collected = true;
          this.collected++;
          this.showMessage("Star collected! Total: " + this.collected);
        }
      }
    }

    // Timers
    if (this.messageTimer > 0) this.messageTimer--;
    if (this.shakeTimer > 0) this.shakeTimer--;
    if (this.flashTimer > 0) this.flashTimer--;
  }
  drawBackground() {
    // Simple sky and distant hills gradient
    // Sky
    const skyGradient = ctx.createLinearGradient(0, 0, 0, this.height);
    skyGradient.addColorStop(0, '#76c7f9');
    skyGradient.addColorStop(1, '#a0dff7');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw terrain tiles
    const tileSize = 64;
    for(let tile of this.bgTiles) {
      if (tile.x + tileSize < this.cam.x) continue;
      if (tile.x > this.cam.x + this.width) continue;
      if (tile.y + tileSize < this.cam.y) continue;
      if (tile.y > this.cam.y + this.height) continue;

      const px = tile.x - this.cam.x;
      const py = tile.y - this.cam.y;
      if (tile.type === 'grass') {
        ctx.fillStyle = '#4caf50';
        ctx.strokeStyle = '#357a38';
        ctx.lineWidth = 1;
        ctx.fillRect(px, py, tileSize, tileSize);
        ctx.strokeRect(px, py, tileSize, tileSize);
        // Draw some grass blades with random offsets
        for(let i=0; i<5; i++){
          const gx = px + Math.random()*tileSize;
          const gy = py + Math.random()*tileSize;
          ctx.strokeStyle = '#2e7d32';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx+1, gy-6);
          ctx.stroke();
        }
      } else if (tile.type === 'hill') {
        const hillGradient = ctx.createRadialGradient(px+tileSize/2, py+tileSize/2, 5, px+tileSize/2, py+tileSize/2, tileSize/2);
        hillGradient.addColorStop(0, '#9ccc65');
        hillGradient.addColorStop(1, '#558b2f');
        ctx.fillStyle = hillGradient;
        ctx.fillRect(px, py, tileSize, tileSize);
        // Draw hill shapes
        ctx.fillStyle = 'rgba(80, 120, 40, 0.7)';
        ctx.beginPath();
        ctx.ellipse(px+tileSize/2, py+tileSize/2+8, tileSize/2, tileSize/3, 0, 0, 2*Math.PI);
        ctx.fill();
      } else if (tile.type === 'water') {
        const waterGradient = ctx.createLinearGradient(px, py, px+tileSize, py+tileSize);
        waterGradient.addColorStop(0, '#4fc3f7');
        waterGradient.addColorStop(1, '#0288d1');
        ctx.fillStyle = waterGradient;
        ctx.fillRect(px, py, tileSize, tileSize);
        // Small wave patterns
        ctx.strokeStyle = '#81d4fa';
        ctx.lineWidth = 1;
        for(let i=0; i<=tileSize; i+=8) {
          ctx.beginPath();
          ctx.moveTo(px + i, py + tileSize);
          ctx.quadraticCurveTo(px + i+4, py + tileSize-6, px + i + 8, py + tileSize);
          ctx.stroke();
        }
      }
    }
  }
  drawCollectibles() {
    // Draw stars not collected
    for(let star of this.collectibles) {
      if (star.collected) continue;
      const p = star.pos.sub(this.cam);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'gold';
      ctx.strokeStyle = '#b38600';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for(let i=0; i<5; i++) {
        const angle = i * (2 * Math.PI / 5) - Math.PI/2;
        const radiusInner = 6;
        const radiusOuter = 14;
        const xOuter = Math.cos(angle) * radiusOuter;
        const yOuter = Math.sin(angle) * radiusOuter;
        const xInner = Math.cos(angle + Math.PI/5) * radiusInner;
        const yInner = Math.sin(angle + Math.PI/5) * radiusInner;
        if (i === 0) {
          ctx.moveTo(xOuter, yOuter);
        } else {
          ctx.lineTo(xOuter, yOuter);
        }
        ctx.lineTo(xInner, yInner);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  drawUI() {
    // Draw UI panel bottom left with points collected
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(10, this.height - 50, 180, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Stars collected: ' + this.collected, 20, this.height - 20);

    if(this.promptingNPC && !this.questionAnswered) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(10, 10, this.width - 20, 80);
      ctx.fillStyle = '#222';
      ctx.font = '22px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`Talk to ${this.promptingNPC.name}:`, 20, 40);
      ctx.font = '18px Arial';
      ctx.fillText(this.promptingNPC.question, 20, 70);
      ctx.font = '14px Arial';
      ctx.fillStyle = '#555';
      ctx.fillText('Press Enter to answer the question', 20, 94);
    }

    if(this.messageTimer > 0 && this.message) {
      ctx.textAlign = 'center';
      const shadowColor = this.flashTimer > 0 ? '#ffd700' : '#000';
      ctx.fillStyle = '#fff';
      ctx.font = '24px Arial';
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = 10;
      ctx.fillText(this.message, this.width/2, this.height - 80);
      ctx.shadowBlur = 0;
    }
  }
  drawShake(cb) {
    if (this.shakeTimer > 0) {
      const magnitude = 6;
      const dx = (Math.random() - 0.5) * magnitude;
      const dy = (Math.random() - 0.5) * magnitude;
      ctx.save();
      ctx.translate(dx, dy);
      cb();
      ctx.restore();
    } else {
      cb();
    }
  }
  loop() {
    this.update();

    ctx.clearRect(0, 0, this.width, this.height);

    this.drawShake(() => {
      this.drawBackground();
      // Draw collectibles stars below characters
      this.drawCollectibles();
      // Draw NPCs
      for(let npc of this.npcs) npc.draw(ctx, this.cam);
      // Draw player on top
      this.player.draw(ctx, this.cam);
    });

    this.drawUI();

    requestAnimationFrame(this.loop);
  }
}

new Game();