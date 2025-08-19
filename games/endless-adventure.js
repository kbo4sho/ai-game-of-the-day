const gameWidth = 720;
const gameHeight = 480;
const tileSize = 48;
const rows = Math.floor(gameHeight / tileSize);
const cols = Math.floor(gameWidth / tileSize);

window.addEventListener('DOMContentLoaded', function() {
  const container = document.getElementById('endless-adventure-stage');
  if (!container) {
    console.error('Missing #endless-adventure-stage');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = gameWidth;
  canvas.height = gameHeight;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  class Character {
    constructor(x, y, color, name) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.size = tileSize * 0.8;
      this.name = name;
      this.armAngle = 0; // For arm animation
      this.lastX = x;
      this.lastY = y;
      this.eyeDirectionX = 0; // Eye direction (-1 to 1)
      this.eyeDirectionY = 0; // Eye direction (-1 to 1)
    }
    updateArmAnimation() {
      // Arms wiggle continuously for visual appeal
      this.armAngle += 0.2;
      this.lastX = this.x;
      this.lastY = this.y;
    }

    updateEyeDirection(keys) {
      // Update eye direction based on movement keys
      this.eyeDirectionX = 0;
      this.eyeDirectionY = 0;
      
      if (keys['ArrowLeft'] || keys['a']) this.eyeDirectionX = -1;
      if (keys['ArrowRight'] || keys['d']) this.eyeDirectionX = 1;
      if (keys['ArrowUp'] || keys['w']) this.eyeDirectionY = -1;
      if (keys['ArrowDown'] || keys['s']) this.eyeDirectionY = 1;
    }

    draw() {
      this.updateArmAnimation();
      ctx.save();
      ctx.translate(this.x, this.y);
      
      // head
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, -this.size * 0.3, this.size * 0.25, 0, 2 * Math.PI);
      ctx.fill();

      // body
      ctx.fillRect(-this.size * 0.2, -this.size * 0.3, this.size * 0.4, this.size * 0.6);
      
      // Draw arms
      ctx.fillStyle = this.color;
      // Left arm
      ctx.save();
      ctx.translate(-this.size * 0.25, -this.size * 0.1);
      ctx.rotate(Math.sin(this.armAngle) * 0.3);
      ctx.fillRect(-this.size * 0.04, 0, this.size * 0.08, this.size * 0.25);
      ctx.restore();
      
      // Right arm
      ctx.save();
      ctx.translate(this.size * 0.25, -this.size * 0.1);
      ctx.rotate(-Math.sin(this.armAngle) * 0.3);
      ctx.fillRect(-this.size * 0.04, 0, this.size * 0.08, this.size * 0.25);
      ctx.restore();

      // eyes
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(-this.size * 0.1, -this.size * 0.35, this.size * 0.07, 0, 2 * Math.PI);
      ctx.arc(this.size * 0.1, -this.size * 0.35, this.size * 0.07, 0, 2 * Math.PI);
      ctx.fill();
      
      // pupils with direction
      ctx.fillStyle = 'black';
      const pupilOffset = this.size * 0.02; // How far pupils can move
      // Left eye pupil
      ctx.beginPath();
      ctx.arc(-this.size * 0.1 + (this.eyeDirectionX * pupilOffset), 
              -this.size * 0.35 + (this.eyeDirectionY * pupilOffset), 
              this.size * 0.03, 0, 2 * Math.PI);
      ctx.fill();
      // Right eye pupil
      ctx.beginPath();
      ctx.arc(this.size * 0.1 + (this.eyeDirectionX * pupilOffset), 
              -this.size * 0.35 + (this.eyeDirectionY * pupilOffset), 
              this.size * 0.03, 0, 2 * Math.PI);
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
      super(x, y, '#FF9800', 'You');
      this.speed = 3;
      this.armor = 0; // Armor level
    }
    update(keys) {
      if (keys['ArrowUp'] || keys['w']) this.y -= this.speed;
      if (keys['ArrowDown'] || keys['s']) this.y += this.speed;
      if (keys['ArrowLeft'] || keys['a']) this.x -= this.speed;
      if (keys['ArrowRight'] || keys['d']) this.x += this.speed;
      // Clamp inside map
      this.x = Math.min(gameWidth - this.size / 2, Math.max(this.size / 2, this.x));
      this.y = Math.min(gameHeight - this.size / 2, Math.max(this.size / 2, this.y));
      
      // Update eye direction based on movement
      this.updateEyeDirection(keys);
    }
  }

  class MathNPC extends Character {
    constructor(x, y, question, answer) {
      super(x, y, '#D84315', 'NPC');
      this.question = question;
      this.answer = answer;
      this.solved = false;
      this.spikeAngle = 0; // For spike animation
    }
    interact(player) {
      if (this.solved) return 'Already solved!';
      // simple prompt for answer
      let playerAnswer = prompt(this.question + ' ?');
      if (playerAnswer === null) return 'Cancelled.';
      if (parseInt(playerAnswer.trim()) === this.answer) {
        this.solved = true;
        spawnConfetti(this.x, this.y - this.size * 0.5);
        if (player instanceof Explorer) player.armor++;
        return 'Correct! Well done!';
      } else {
        return 'Oops, try again next time.';
      }
    }
    updateSpikeAnimation() {
      // Update spike animation based on microphone input
      this.spikeAngle += microphoneLevel * 0.3;
    }

    draw() {
      this.updateSpikeAnimation();
      super.draw();
      if (!this.solved) {
        // draw a math bubble above NPC with spikes and scaling
        ctx.save();
        const [sx, sy] = worldToScreen(this.x, this.y);
        
        // Apply scaling based on microphone input to the bubble
        const scaleFactor = 1 + microphoneLevel * 0.5;
        ctx.translate(sx, sy - this.size * 0.7);
        ctx.scale(scaleFactor, scaleFactor);
        
        ctx.fillStyle = 'yellow';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.font = '18px Comic Sans MS';
        ctx.textAlign = 'center';
        let bubbleX = 0;
        let bubbleY = 0;
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
        
        // Draw spikes around the bubble based on microphone input
        if (microphoneLevel > 0.1) {
          ctx.fillStyle = 'yellow';
          const spikeCount = Math.floor(3 + microphoneLevel * 6); // More spikes with higher mic level
          const spikeLength = 8 + microphoneLevel * 15; // Longer spikes with higher mic level
          
          for (let i = 0; i < spikeCount; i++) {
            const angle = (i / spikeCount) * Math.PI * 2 + this.spikeAngle;
            const spikeX = Math.cos(angle) * (width/2 + 5);
            const spikeY = Math.sin(angle) * (height/2 + 5);
            
            ctx.save();
            ctx.translate(spikeX, spikeY);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -spikeLength);
            ctx.lineTo(-spikeLength * 0.3, -spikeLength * 0.7);
            ctx.lineTo(spikeLength * 0.3, -spikeLength * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
        
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
    }
    drawTile(screenX, screenY, worldR, worldC) {
      // Use deterministic function for water/ground
      if ((worldC + worldR) % 13 === 0 || (worldC * worldR) % 7 === 0 || deterministicRandom(worldC, worldR) < 0.13) {
        ctx.fillStyle = this.waterColor;
        ctx.fillRect(screenX, screenY, tileSize, tileSize);
        
        // Dynamic waves based on microphone input
        const waveIntensity = microphoneLevel * 2; // Scale microphone level for wave effect
        const waveCount = Math.max(1, Math.floor(3 + waveIntensity * 5)); // More waves with higher mic level
        const waveOpacity = 0.2 + waveIntensity * 0.4; // More opaque waves with higher mic level
        const waveSize = tileSize/8 + waveIntensity * tileSize/6; // Larger waves with higher mic level
        
        ctx.strokeStyle = `rgba(255,255,255,${waveOpacity})`;
        ctx.lineWidth = 1 + waveIntensity * 2; // Thicker lines with higher mic level
        
        for(let i = 0; i < waveCount; i++) {
          ctx.beginPath();
          const waveX = screenX + (i + 0.5) * tileSize / waveCount;
          const waveY = screenY + tileSize/2 + Math.sin(Date.now() * 0.001 + i + worldR + worldC) * waveIntensity * 5;
          ctx.arc(waveX, waveY, waveSize, 0, Math.PI);
          ctx.stroke();
        }
      } else {
        // --- Enhanced Terrain color variation ---
        // Stronger green variation
        let baseGreen = 76;
        let greenVar = Math.floor(deterministicRandom(worldC, worldR) * 80 - 40); // -40 to +40
        let color = `rgb(${40 + greenVar},${baseGreen + greenVar},${40 + greenVar})`;
        ctx.fillStyle = color;
        ctx.fillRect(screenX, screenY, tileSize, tileSize);

        // --- Stronger Dynamic shadow based on time of day ---
        const now = new Date();
        const hour = now.getHours() + now.getMinutes()/60;
        const sunAngle = ((hour / 24) * 2 * Math.PI) - Math.PI/2;
        const shadowDX = Math.cos(sunAngle) * tileSize * 0.22;
        const shadowDY = Math.sin(sunAngle) * tileSize * 0.22;
        ctx.save();
        ctx.globalAlpha = 0.32 + 0.18 * Math.abs(Math.sin(sunAngle));
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.ellipse(screenX + tileSize/2 + shadowDX, screenY + tileSize/2 + shadowDY, tileSize*0.44, tileSize*0.22, sunAngle, 0, 2*Math.PI);
        ctx.fill();
        ctx.restore();

        // --- More visible Dirt/rock/patch features ---
        // Dirt patch
        if (deterministicRandom(worldC * 3, worldR * 7) < 0.13) {
          ctx.save();
          ctx.globalAlpha = 0.38 + 0.22 * deterministicRandom(worldC * 5, worldR * 6);
          ctx.fillStyle = '#a67c52';
          ctx.beginPath();
          ctx.ellipse(
            screenX + tileSize * (0.2 + 0.6 * deterministicRandom(worldC * 2, worldR * 2)),
            screenY + tileSize * (0.2 + 0.6 * deterministicRandom(worldC * 4, worldR * 4)),
            tileSize * (0.22 + 0.18 * deterministicRandom(worldC * 8, worldR * 8)),
            tileSize * (0.13 + 0.12 * deterministicRandom(worldC * 9, worldR * 9)),
            deterministicRandom(worldC * 11, worldR * 11) * Math.PI,
            0, 2 * Math.PI
          );
          ctx.fill();
          ctx.restore();
        }
        // Rock
        if (deterministicRandom(worldC * 13, worldR * 17) < 0.11) {
          ctx.save();
          ctx.globalAlpha = 0.38 + 0.22 * deterministicRandom(worldC * 15, worldR * 15);
          ctx.fillStyle = '#888';
          ctx.beginPath();
          ctx.ellipse(
            screenX + tileSize * (0.15 + 0.7 * deterministicRandom(worldC * 12, worldR * 12)),
            screenY + tileSize * (0.15 + 0.7 * deterministicRandom(worldC * 14, worldR * 14)),
            tileSize * (0.13 + 0.12 * deterministicRandom(worldC * 16, worldR * 16)),
            tileSize * (0.09 + 0.10 * deterministicRandom(worldC * 18, worldR * 18)),
            deterministicRandom(worldC * 19, worldR * 19) * Math.PI,
            0, 2 * Math.PI
          );
          ctx.fill();
          ctx.restore();
        }
        // Grass blips (existing)
        if (deterministicRandom(worldC * 2, worldR * 2) < 0.18) {
          ctx.fillStyle = '#388E3C';
          let gx = screenX + (deterministicRandom(worldC, worldR) * tileSize);
          let gy = screenY + (deterministicRandom(worldC + 1, worldR + 1) * tileSize);
          ctx.beginPath();
          ctx.ellipse(gx, gy, 4, 8, deterministicRandom(worldC, worldR) * Math.PI, 0, 2*Math.PI);
          ctx.fill();
        }
        // Optional: debug tile outline
        // ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        // ctx.strokeRect(screenX, screenY, tileSize, tileSize);
      }
    }
    draw() {
      // sky background
      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(0, 0, gameWidth, gameHeight);
      // Draw enough tiles to fill the screen, centered on camera
      const startCol = Math.floor((cameraX - gameWidth/2) / tileSize) - 1;
      const endCol = Math.floor((cameraX + gameWidth/2) / tileSize) + 1;
      const startRow = Math.floor((cameraY - gameHeight/2) / tileSize) - 1;
      const endRow = Math.floor((cameraY + gameHeight/2) / tileSize) + 1;
      for(let r = startRow; r <= endRow; r++){
        for(let c = startCol; c <= endCol; c++){
          const screenX = (c * tileSize) - (cameraX - gameWidth/2);
          const screenY = (r * tileSize) - (cameraY - gameHeight/2);
          this.drawTile(screenX, screenY, r, c);
          // Draw generated NPC if present and not solved
          if (isGeneratedNPC(r, c) && !solvedGeneratedNPCs.has(r + ',' + c)) {
            drawGeneratedNPC(r, c);
          }
        }
      }
      // horizon line (optional, can remove for endless)
      // ctx.strokeStyle = '#2E7D32';
      // ctx.lineWidth = 4;
      // ctx.beginPath();
      // ctx.moveTo(0, gameHeight - tileSize * 2);
      // ctx.lineTo(gameWidth, gameHeight - tileSize * 2);
      // ctx.stroke();
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

  // --- MICROPHONE SYSTEM ---
  let audioContext;
  let analyser;
  let microphone;
  let microphoneLevel = 0;

  async function setupMicrophone() {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create audio context and analyser
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      microphone = audioContext.createMediaStreamSource(stream);
      
      // Connect microphone to analyser
      microphone.connect(analyser);
      
      // Configure analyser
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Function to update microphone level
      function updateMicrophoneLevel() {
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume level
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        microphoneLevel = sum / bufferLength / 255; // Normalize to 0-1
        
        // Microphone level is now only used for wave effects
        // No need to update character microphone levels
        
        requestAnimationFrame(updateMicrophoneLevel);
      }
      
      updateMicrophoneLevel();
      console.log('Microphone setup successful!');
      
    } catch (error) {
      console.log('Microphone access denied or not available:', error);
      // Fallback: use a small constant value for wave effects
      microphoneLevel = 0.1;
    }
  }

  // --- EFFECT SYSTEM ---
  const effects = [];

  function spawnConfetti(x, y) {
    for (let i = 0; i < 18; i++) {
      const angle = (Math.PI * 2 * i) / 18;
      const speed = 2 + Math.random() * 2;
      effects.push({
        type: 'confetti',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: `hsl(${Math.floor(Math.random()*360)},90%,60%)`,
        life: 30 + Math.random() * 10,
        age: 0
      });
    }
  }

  function updateAndDrawEffects() {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.type === 'confetti') {
        // Update
        e.x += e.vx;
        e.y += e.vy;
        e.vy += 0.2; // gravity
        e.age++;
        // Draw
        ctx.save();
        const [sx, sy] = worldToScreen(e.x, e.y);
        ctx.globalAlpha = 1 - e.age / e.life;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
        if (e.age > e.life) effects.splice(i, 1);
      }
    }
  }

  let keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Camera system: cameraX, cameraY are the world coordinates at the center of the screen
  let cameraX = explorer.x;
  let cameraY = explorer.y;

  // Update camera to follow explorer
  function updateCamera() {
    cameraX = explorer.x;
    cameraY = explorer.y;
  }

  // --- MODIFIED WORLD TILE GENERATION ---
  function deterministicRandom(x, y) {
    // Simple deterministic pseudo-random based on coordinates
    return Math.abs(Math.sin(x * 73856093 + y * 19349663)) % 1;
  }

  // --- TILE TYPE DETECTION ---
  function isWaterTile(worldR, worldC) {
    // Same logic as in World.drawTile to determine if a tile is water
    return (worldC + worldR) % 13 === 0 || (worldC * worldR) % 7 === 0 || deterministicRandom(worldC, worldR) < 0.13;
  }

  function isCharacterOnLand(character) {
    // Convert character position to tile coordinates
    const worldC = Math.floor(character.x / tileSize);
    const worldR = Math.floor(character.y / tileSize);
    // Check if the tile at character's position is NOT water (i.e., is land)
    return !isWaterTile(worldR, worldC);
  }

  // --- GENERATED NPC SYSTEM ---
  const solvedGeneratedNPCs = new Set();

  function isGeneratedNPC(r, c) {
    // Place a generated NPC if deterministicRandom at this tile is in a certain range, and not at a fixed NPC location
    for (const npc of npcs) {
      if (Math.abs(npc.x / tileSize - c) < 0.5 && Math.abs(npc.y / tileSize - r) < 0.5) return false;
    }
    return deterministicRandom(r, c) > 0.3426 && deterministicRandom(r + 100, c - 100) < 0.5;
  }

  function getGeneratedNPCQuestion(r, c) {
    // Generate a simple math question based on coordinates
    const a = 2 + Math.floor(deterministicRandom(r, c) * 10);
    const b = 2 + Math.floor(deterministicRandom(c, r) * 10);
    const op = deterministicRandom(r + c, c - r) > 0.5 ? '+' : '-';
    let question, answer;
    if (op === '+') {
      question = `What is ${a} + ${b}`;
      answer = a + b;
    } else {
      question = `What is ${a + b} - ${a}`;
      answer = b;
    }
    return { question, answer };
  }

  function drawGeneratedNPC(r, c) {
    const [sx, sy] = worldToScreen(c * tileSize + tileSize/2, r * tileSize + tileSize/2);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.globalAlpha = 0.95;
    // Microphone-driven scaling
    const scaleFactor = 1 + microphoneLevel * 0.5;
    ctx.scale(scaleFactor, scaleFactor);
    // Draw yellow box
    ctx.fillStyle = 'yellow';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-tileSize * 0.22, -tileSize * 0.22, tileSize * 0.44, tileSize * 0.44);
    ctx.fill();
    ctx.stroke();
    // Draw spikes around the box based on microphone input
    if (microphoneLevel > 0.1) {
      ctx.fillStyle = 'yellow';
      const spikeCount = Math.floor(3 + microphoneLevel * 6);
      const spikeLength = 8 + microphoneLevel * 15;
      for (let i = 0; i < spikeCount; i++) {
        const angle = (i / spikeCount) * Math.PI * 2 + Date.now() * 0.002;
        const spikeX = Math.cos(angle) * (tileSize * 0.28);
        const spikeY = Math.sin(angle) * (tileSize * 0.28);
        ctx.save();
        ctx.translate(spikeX, spikeY);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -spikeLength);
        ctx.lineTo(-spikeLength * 0.3, -spikeLength * 0.7);
        ctx.lineTo(spikeLength * 0.3, -spikeLength * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // Draw question mark
    ctx.fillStyle = 'black';
    ctx.font = `${Math.floor(tileSize * 0.32)}px Comic Sans MS`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 0);
    ctx.restore();
  }

  // Update click detection to use world coordinates
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    // Convert screen click to world coordinates
    const worldClickX = cameraX - gameWidth/2 + clickX;
    const worldClickY = cameraY - gameHeight/2 + clickY;
    // Detect if near NPC or chest (within 50px)
    let msg = '';
    // Check fixed NPCs
    for (const npc of npcs) {
      if (!npc.solved && distance(worldClickX, worldClickY, npc.x, npc.y) < 50) {
        msg = npc.interact(explorer);
        alert(msg);
        return;
      }
    }
    // Check generated NPCs
    const r = Math.floor((worldClickY) / tileSize);
    const c = Math.floor((worldClickX) / tileSize);
    if (isGeneratedNPC(r, c) && !solvedGeneratedNPCs.has(r + ',' + c)) {
      const { question, answer } = getGeneratedNPCQuestion(r, c);
      let playerAnswer = prompt(question + ' ?');
      if (playerAnswer === null) return;
      if (parseInt(playerAnswer.trim()) === answer) {
        solvedGeneratedNPCs.add(r + ',' + c);
        spawnConfetti(c * tileSize + tileSize/2, r * tileSize + tileSize/2 - tileSize * 0.5);
        alert('Correct! Well done!');
        explorer.armor++; // Increment armor when a problem is solved
      } else {
        alert('Oops, try again next time.');
      }
      return;
    }
    // Check chests
    for (const chest of chests) {
      if (!chest.opened && distance(worldClickX, worldClickY, chest.x, chest.y) < 50) {
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
    
    // Show microphone status
    ctx.fillStyle = microphoneLevel > 0.1 ? '#4CAF50' : '#FF5722';
    ctx.textAlign = 'left';
    ctx.font = '14px Comic Sans MS';
    ctx.fillText(`Mic: ${microphoneLevel > 0.1 ? 'Active' : 'Inactive'}`, 10, gameHeight - 25);
    
    ctx.restore();
  }

  // Update all draw calls for NPCs, chests, effects, and explorer to use camera offset
  // Helper to convert world to screen
  function worldToScreen(wx, wy) {
    return [wx - cameraX + gameWidth/2, wy - cameraY + gameHeight/2];
  }

  // Modify draw methods for Character, MathNPC, TreasureChest
  Character.prototype.draw = function() {
    this.updateArmAnimation();
    ctx.save();
    const [sx, sy] = worldToScreen(this.x, this.y);
    ctx.translate(sx, sy);

    // --- Draw armor for Explorer (player) ---
    if (this instanceof Explorer && this.armor > 0) {
      // 1: helmet, 2: shoulder pads, 3: chest plate, 4+: boots
      if (this.armor >= 1) {
        // Helmet
        ctx.save();
        ctx.fillStyle = '#b0bec5';
        ctx.beginPath();
        ctx.arc(0, -this.size * 0.38, this.size * 0.18, Math.PI, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
      if (this.armor >= 2) {
        // Shoulder pads
        ctx.save();
        ctx.fillStyle = '#90a4ae';
        ctx.beginPath();
        ctx.ellipse(-this.size * 0.18, -this.size * 0.18, this.size * 0.09, this.size * 0.06, 0, 0, 2 * Math.PI);
        ctx.ellipse(this.size * 0.18, -this.size * 0.18, this.size * 0.09, this.size * 0.06, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
      if (this.armor >= 3) {
        // Chest plate
        ctx.save();
        ctx.fillStyle = '#78909c';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size * 0.18, this.size * 0.13, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
      if (this.armor >= 4) {
        // Boots
        ctx.save();
        ctx.fillStyle = '#607d8b';
        ctx.fillRect(-this.size * 0.12, this.size * 0.55, this.size * 0.08, this.size * 0.18);
        ctx.fillRect(this.size * 0.04, this.size * 0.55, this.size * 0.08, this.size * 0.18);
        ctx.restore();
      }
    }

    // --- Draw the rest of the character (body, face, etc.) ---
    // head
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, -this.size * 0.3, this.size * 0.25, 0, 2 * Math.PI);
    ctx.fill();
    // body
    ctx.fillRect(-this.size * 0.2, -this.size * 0.3, this.size * 0.4, this.size * 0.6);
    // arms
    ctx.fillStyle = this.color;
    // Left arm
    ctx.save();
    ctx.translate(-this.size * 0.25, -this.size * 0.1);
    ctx.rotate(Math.sin(this.armAngle) * 0.3);
    ctx.fillRect(-this.size * 0.04, 0, this.size * 0.08, this.size * 0.25);
    ctx.restore();
    // Right arm
    ctx.save();
    ctx.translate(this.size * 0.25, -this.size * 0.1);
    ctx.rotate(-Math.sin(this.armAngle) * 0.3);
    ctx.fillRect(-this.size * 0.04, 0, this.size * 0.08, this.size * 0.25);
    ctx.restore();
    // legs if on land
    if (isCharacterOnLand(this)) {
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.size * 0.12, this.size * 0.3, this.size * 0.06, this.size * 0.3);
      ctx.fillRect(this.size * 0.06, this.size * 0.3, this.size * 0.06, this.size * 0.3);
    }
    // eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(-this.size * 0.1, -this.size * 0.35, this.size * 0.07, 0, 2 * Math.PI);
    ctx.arc(this.size * 0.1, -this.size * 0.35, this.size * 0.07, 0, 2 * Math.PI);
    ctx.fill();
    // pupils
    ctx.fillStyle = 'black';
    const pupilOffset = this.size * 0.02;
    ctx.beginPath();
    ctx.arc(-this.size * 0.1 + (this.eyeDirectionX * pupilOffset), -this.size * 0.35 + (this.eyeDirectionY * pupilOffset), this.size * 0.03, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.size * 0.1 + (this.eyeDirectionX * pupilOffset), -this.size * 0.35 + (this.eyeDirectionY * pupilOffset), this.size * 0.03, 0, 2 * Math.PI);
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
  };

  TreasureChest.prototype.draw = function() {
    ctx.save();
    const [sx, sy] = worldToScreen(this.x, this.y);
    ctx.translate(sx, sy);
    ctx.fillStyle = this.opened ? '#FFD700' : '#6D4C41';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.fillRect(-this.size/2, -this.size/4, this.size, this.size * 0.6);
    ctx.strokeRect(-this.size/2, -this.size/4, this.size, this.size * 0.6);
    ctx.beginPath();
    ctx.moveTo(-this.size/2, -this.size/4);
    ctx.lineTo(0, -this.size/2);
    ctx.lineTo(this.size/2, -this.size/4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!this.opened) {
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(0, 0, this.size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };

  MathNPC.prototype.draw = function() {
    Character.prototype.draw.call(this);
    if (!this.solved) {
      ctx.save();
      const [sx, sy] = worldToScreen(this.x, this.y);
      ctx.font = '18px Comic Sans MS';
      ctx.textAlign = 'center';
      let bubbleX = sx;
      let bubbleY = sy - this.size * 0.7;
      let text = '?';
      let metrics = ctx.measureText(text);
      let pad = 10;
      let width = metrics.width + pad * 2;
      let height = 30;
      ctx.fillStyle = 'yellow';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.beginPath();
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
  };

  // Update explorer movement to move in world coordinates
  Explorer.prototype.update = function(keys) {
    if (keys['ArrowUp'] || keys['w']) this.y -= this.speed;
    if (keys['ArrowDown'] || keys['s']) this.y += this.speed;
    if (keys['ArrowLeft'] || keys['a']) this.x -= this.speed;
    if (keys['ArrowRight'] || keys['d']) this.x += this.speed;
    
    // Update eye direction based on movement
    this.updateEyeDirection(keys);
  };

  // Update drawExplorerAura to use camera
  function drawExplorerAura(x, y) {
    const [sx, sy] = worldToScreen(x, y);
    const grad = ctx.createRadialGradient(sx, sy - explorer.size * 0.3, explorer.size * 0.3, sx, sy - explorer.size * 0.3, explorer.size);
    grad.addColorStop(0, 'rgba(21, 101, 192, 0.5)');
    grad.addColorStop(1, 'rgba(21, 101, 192, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(sx, sy - explorer.size * 0.3, explorer.size, explorer.size * 0.75, 0, 0, 2*Math.PI);
    ctx.fill();
  }

  function gameLoop() {
    // Update
    explorer.update(keys);
    updateCamera();
    // Draw
    world.draw();
    for (const chest of chests) chest.draw();
    for (const npc of npcs) npc.draw();
    updateAndDrawEffects();
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

  // Initialize game
  async function initGame() {
    // Setup microphone first
    await setupMicrophone();
    
    // Start the game loop
    gameLoop();
  }

  // Start the game
  initGame();
});
