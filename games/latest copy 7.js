(() => {
  const GAME_WIDTH = 720;
  const GAME_HEIGHT = 480;

  const container = document.getElementById('game-of-the-day-stage');
  container.innerHTML = '';
  container.style.position = 'relative';

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  canvas.style.background = '#87ceeb'; // sky blue
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Game State
  const TILE_SIZE = 48;
  const TILES_X = GAME_WIDTH / TILE_SIZE;
  const TILES_Y = GAME_HEIGHT / TILE_SIZE;

  // Terrain/floor colors by tile type
  const terrainColors = [
    '#228B22', // grass
    '#32CD32', // light grass
    '#8B4513', // dirt patch
    '#3CB371', // meadow
  ];

  // Generate a simple tiled terrain with some variation
  let terrainMap = [];
  for (let y = 0; y < TILES_Y; y++) {
    let row = [];
    for (let x = 0; x < TILES_X; x++) {
      // Random terrain index weighted to mostly grass
      let t = Math.random();
      if (t < 0.4) row.push(0);
      else if (t < 0.75) row.push(1);
      else if (t < 0.9) row.push(3);
      else row.push(2);
    }
    terrainMap.push(row);
  }

  // Player
  const player = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    size: 36,
    speed: 3.2,
    color: '#ff4500',
    facing: 'down',
    vx: 0,
    vy: 0,
  };

  // Characters with fun looks and math questions
  class Character {
    constructor(x, y, color, name, question, answer) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.name = name;
      this.question = question;
      this.answer = answer;
      this.size = 38;
      this.state = 'idle'; // idle or talking
      this.speechTime = 0;
    }

    draw(ctx) {
      // Body
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.size/2, this.size/2.5, 0, 0, 2*Math.PI);
      ctx.fill();

      // Eyes - little white circles with black pupils
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.ellipse(this.x-8, this.y-6, 7, 9, 0, 0, 2 * Math.PI);
      ctx.ellipse(this.x+8, this.y-6, 7, 9, 0, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = 'black';
      ctx.beginPath();
      ctx.ellipse(this.x - 8, this.y - 6, 3, 5, 0, 0, 2 * Math.PI);
      ctx.ellipse(this.x + 8, this.y - 6, 3, 5, 0, 0, 2 * Math.PI);
      ctx.fill();

      // Smile
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y + 5, 12, 0, Math.PI, false);
      ctx.stroke();

      // Name tag
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 14px Verdana';
      ctx.textAlign = 'center';
      ctx.fillRect(this.x - 38, this.y - this.size, 76, 20);
      ctx.fillStyle = '#222';
      ctx.fillText(this.name, this.x, this.y - this.size + 15);

      // Speech bubble if talking
      if (this.state === 'talking') {
        const msg = this.question;
        const padding = 6;
        ctx.font = '16px Arial';
        const textWidth = ctx.measureText(msg).width;

        let bx = this.x - textWidth/2 - padding;
        let by = this.y - this.size - 50;
        let bw = textWidth + padding * 2;
        let bh = 30;

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 8);
        ctx.fill();
        ctx.stroke();

        // pointer triangle
        ctx.beginPath();
        ctx.moveTo(this.x - 12, by + bh);
        ctx.lineTo(this.x + 12, by + bh);
        ctx.lineTo(this.x, by + bh + 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.fillText(msg, this.x, by + 22);
      }
    }
  }

  // Helper: CanvasRenderingContext2D roundRect polyfill
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') {
        r = {tl: r, tr: r, br: r, bl: r};
      } else {
        let defaultRadius = {tl:0, tr:0, br:0, bl:0};
        for (let side in defaultRadius) {
          r[side] = r[side] || defaultRadius[side];
        }
      }
      this.beginPath();
      this.moveTo(x + r.tl, y);
      this.lineTo(x + w - r.tr, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
      this.lineTo(x + w, y + h - r.br);
      this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
      this.lineTo(x + r.bl, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
      this.lineTo(x, y + r.tl);
      this.quadraticCurveTo(x, y, x + r.tl, y);
      this.closePath();
      return this;
    }
  }

  // Fun characters placed around who ask math questions
  const characters = [
    new Character(120, 420, '#6A5ACD', 'Mira', '5 + 3 = ?', 8),
    new Character(580, 400, '#FF69B4', 'Toby', '9 - 4 = ?', 5),
    new Character(320, 60, '#20B2AA', 'Zaz', '2 x 6 = ?', 12),
    new Character(660, 130, '#FFD700', 'Lila', '8 ÷ 2 = ?', 4),
  ];

  // Input
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  // Game variables
  let message = '';
  let messageTimer = 0;
  const MESSAGE_DURATION = 3000; // ms

  let currentInteraction = null;

  // Player interacts with character if close and presses 'E'
  function tryInteract() {
    if (currentInteraction) return; // already interacting

    for (const c of characters) {
      const dx = c.x - player.x;
      const dy = c.y - player.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 60) {
        currentInteraction = c;
        c.state = 'talking';
        openQuestionPrompt(c);
        break;
      }
    }
  }

  // Prompt user with question & basic input for answer
  function openQuestionPrompt(character) {
    let ans = prompt(`${character.name} asks:\n${character.question}`, '');

    if (ans === null) {
      // Cancelled
      character.state = 'idle';
      currentInteraction = null;
      return;
    }

    ans = ans.trim();

    if (ans === '') {
      message = "You didn't answer!";
      messageTimer = MESSAGE_DURATION;
      character.state = 'idle';
      currentInteraction = null;
      return;
    }

    // Try parsing as a number
    const numAns = Number(ans);

    if (numAns === character.answer) {
      message = `Correct! Well done, ${character.name} says hi! :)`;
      messageTimer = MESSAGE_DURATION;
      // The character does a small happy animation (color blink)
      happyBlink(character);
    } else {
      message = `Oops! The answer was ${character.answer}. Try again!`;
      messageTimer = MESSAGE_DURATION;
    }
    character.state = 'idle';
    currentInteraction = null;
  }

  // Happy blinking (color animation for correct answer)
  function happyBlink(character) {
    let blinkCount = 6;
    let blinkTimer = 0;
    let blinkInterval = 150;
    const originalColor = character.color;
    let blinkOn = false;

    function blinkStep(deltaTime) {
      blinkTimer += deltaTime;
      if (blinkTimer >= blinkInterval) {
        blinkTimer = 0;
        blinkOn = !blinkOn;
        character.color = blinkOn ? '#00FF00' : originalColor;
        blinkCount--;
        if (blinkCount <= 0) {
          character.color = originalColor;
          clearInterval(intervalId);
        }
      }
    }
    let lastTime = performance.now();
    const intervalId = setInterval(() => {
      let now = performance.now();
      blinkStep(now - lastTime);
      lastTime = now;
    }, 16);
  }

  // Render terrain with simple shapes and trees
  function drawTerrain() {
    for (let y = 0; y < TILES_Y; y++) {
      for (let x = 0; x < TILES_X; x++) {
        const tile = terrainMap[y][x];
        ctx.fillStyle = terrainColors[tile];

        // base rectangle (ground)
        ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);

        // Draw simple details based on terrain type
        if (tile === 2) {
          // dirt patch with some spots
          ctx.fillStyle = '#65432188';
          for (let i=0; i<3; i++) {
            ctx.beginPath();
            const cx = x*TILE_SIZE + Math.random()*TILE_SIZE*0.8 + TILE_SIZE*0.1;
            const cy = y*TILE_SIZE + Math.random()*TILE_SIZE*0.8 + TILE_SIZE*0.1;
            ctx.ellipse(cx, cy, 5, 3, Math.random()*Math.PI, 0, 2*Math.PI);
            ctx.fill();
          }
        } else if (tile === 0 || tile === 1 || tile === 3) {
          // Draw some simple "grass blades"
          ctx.strokeStyle = '#2e8b57';
          ctx.lineWidth = 1;
          let blades = 3 + Math.floor(Math.random() * 3);
          for (let i=0; i<blades; i++) {
            const bx = x*TILE_SIZE + 10 + i*10;
            const by = y*TILE_SIZE + TILE_SIZE - 5;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx, by - 15 + Math.random()*10);
            ctx.stroke();
          }
        }
      }
    }
  }

  // Draw simple sun in the sky
  function drawSun() {
    const sunX = 680;
    const sunY = 60;
    ctx.save();
    const rad = 40;
    let gradient = ctx.createRadialGradient(sunX, sunY, rad/3, sunX, sunY, rad);
    gradient.addColorStop(0, '#fffacd');
    gradient.addColorStop(1, '#ff8c00');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, rad, 0, 2*Math.PI);
    ctx.fill();

    ctx.restore();
  }

  // Draw player as a unique character (small fox-like figure)
  function drawPlayer() {
    const p = player;

    ctx.save();
    ctx.translate(p.x, p.y);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, p.size/2 + 4, p.size*0.6, p.size*0.25, 0, 0, 2*Math.PI);
    ctx.fill();

    // body
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size/2, p.size/2, 0, 0, 2*Math.PI);
    ctx.fill();

    // face mask white patch
    ctx.fillStyle = '#fff8dc';
    ctx.beginPath();
    ctx.ellipse(0, -5, p.size/3, p.size/4, 0, 0, 2*Math.PI);
    ctx.fill();

    // eyes
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.ellipse(-8, -8, 4, 6, 0, 0, 2*Math.PI);
    ctx.ellipse(8, -8, 4, 6, 0, 0, 2*Math.PI);
    ctx.fill();

    // nose
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(0, 1, 4, 0, 2*Math.PI);
    ctx.fill();

    // ears
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(-12, -22);
    ctx.lineTo(-7, -40);
    ctx.lineTo(-2, -25);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(12, -22);
    ctx.lineTo(7, -40);
    ctx.lineTo(2, -25);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Draw message at bottom
  function drawMessage() {
    if (!message || messageTimer <= 0) return;
    const padding = 10;
    ctx.font = '20px Verdana';
    ctx.textAlign = 'center';

    let textWidth = ctx.measureText(message).width;
    let boxWidth = textWidth + padding*2;
    let boxHeight = 36;

    let bx = GAME_WIDTH/2 - boxWidth/2;
    let by = GAME_HEIGHT - boxHeight - 16;

    // background box
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.roundRect(bx, by, boxWidth, boxHeight, 10);
    ctx.fill();

    // text
    ctx.fillStyle = '#fff';
    ctx.fillText(message, GAME_WIDTH/2, by + boxHeight*0.7);
  }

  // Main game loop
  let lastTime = performance.now();
  function gameLoop(now) {
    const dt = now - lastTime;
    lastTime = now;

    // move player by keys
    player.vx = 0;
    player.vy = 0;
    if (keys['arrowup'] || keys['w']) {
      player.vy = -player.speed;
      player.facing = 'up';
    }
    else if (keys['arrowdown'] || keys['s']) {
      player.vy = player.speed;
      player.facing = 'down';
    }
    if (keys['arrowleft'] || keys['a']) {
      player.vx = -player.speed;
      player.facing = 'left';
    }
    else if (keys['arrowright'] || keys['d']) {
      player.vx = player.speed;
      player.facing = 'right';
    }

    // normalize diagonal speed
    if (player.vx !== 0 && player.vy !== 0) {
      player.vx /= Math.sqrt(2);
      player.vy /= Math.sqrt(2);
    }

    player.x += player.vx;
    player.y += player.vy;

    // clamp position in bounds
    player.x = Math.min(Math.max(player.size/2, player.x), GAME_WIDTH - player.size/2);
    player.y = Math.min(Math.max(player.size/2, player.y), GAME_HEIGHT - player.size/2);

    // interaction
    if ((keys['e'] || keys[' ']) && !currentInteraction) {
      tryInteract();
      keys['e'] = false;
      keys[' '] = false;
    }

    // draw everything
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    drawTerrain();
    drawSun();

    // Draw all characters
    for (const c of characters) {
      c.draw(ctx);
    }

    drawPlayer();
    drawMessage();

    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer < 0) {
        message = '';
        messageTimer = 0;
      }
    }

    requestAnimationFrame(gameLoop);
  }

  // Start the loop
  requestAnimationFrame(gameLoop);

  // Instruction message inside container (will hide after 5 sec)
  const instruction = document.createElement('div');
  instruction.style.position = 'absolute';
  instruction.style.bottom = '10px';
  instruction.style.left = '50%';
  instruction.style.transform = 'translateX(-50%)';
  instruction.style.padding = '8px 16px';
  instruction.style.backgroundColor = 'rgba(255,255,255,0.9)';
  instruction.style.borderRadius = '12px';
  instruction.style.fontFamily = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
  instruction.style.fontSize = '14px';
  instruction.style.color = '#222';
  instruction.style.userSelect = 'none';
  instruction.style.pointerEvents = 'none';
  instruction.textContent = 'Use WASD or arrow keys to move. Press E or Space near characters to answer math questions!';
  container.appendChild(instruction);
  setTimeout(() => {
    if (instruction.parentNode) instruction.parentNode.removeChild(instruction);
  }, 5000);
})();
