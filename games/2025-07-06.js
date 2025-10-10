(function() {
  'use strict';
  
  // ======== Enhanced Exploration Adventure - Updated 2025-10-10 ========
  // Original: Open World Exploration Game for ages 7-9
  // Updates: Modern JS, Web Audio API, Enhanced Accessibility, Better Visuals, Correct Dimensions
  // Renders into element with ID 'game-of-the-day-stage'
  // Canvas exactly 720x480. All graphics via canvas. All audio via Web Audio API.
  
  // ======== Constants & Setup ========
  const STAGE_ID = 'game-of-the-day-stage';
  const WIDTH = 720;
  const HEIGHT = 480;
  
  const container = document.getElementById(STAGE_ID);
  if (!container) {
    throw new Error(`Container element with ID "${STAGE_ID}" not found.`);
  }
  
  // Prepare container and canvas
  container.innerHTML = '';
  container.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.width = WIDTH + 'px';
  canvas.style.height = HEIGHT + 'px';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Exploration Adventure game. Use arrow keys or WASD to move, Space to interact, M to toggle audio, Escape to restart.'
  );
  container.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  
  // ======== Audio: Web Audio API Setup ========
  let audioCtx = null;
  let audioEnabled = true;
  let audioInitError = false;
  
  // Background audio nodes
  let bgGain = null;
  let bgOsc = null;
  
  function initAudio() {
    if (audioCtx || audioInitError) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        throw new Error('Web Audio API not supported');
      }
      audioCtx = new AudioContext();
      
      // Create gentle nature background
      bgOsc = audioCtx.createOscillator();
      bgGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      bgOsc.type = 'sine';
      bgOsc.frequency.value = 80; // Very low nature hum
      bgGain.gain.value = 0.015; // Very gentle
      
      bgOsc.connect(filter);
      filter.connect(bgGain);
      bgGain.connect(audioCtx.destination);
      bgOsc.start();
      
    } catch (e) {
      console.warn('Audio initialization failed:', e);
      audioInitError = true;
      audioEnabled = false;
      audioCtx = null;
    }
  }
  
  function resumeAudioOnInteraction() {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => {
        console.warn('Audio resume failed:', e);
        audioEnabled = false;
      });
    }
  }
  
  function setAudioEnabled(enabled) {
    audioEnabled = enabled && !audioInitError;
    if (bgGain) {
      bgGain.gain.value = audioEnabled ? 0.015 : 0;
    }
  }
  
  function playTone({ freq = 440, type = 'sine', duration = 0.15, volume = 0.1, detune = 0 } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(600, freq * 2);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration - 0.02);
      
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }
  
  function playStepSound() {
    playTone({ freq: 200 + Math.random() * 100, type: 'triangle', duration: 0.1, volume: 0.03 });
  }
  
  function playCorrectSound() {
    playTone({ freq: 523, type: 'sine', duration: 0.2, volume: 0.1 });
    setTimeout(() => playTone({ freq: 659, type: 'sine', duration: 0.2, volume: 0.1 }), 100);
    setTimeout(() => playTone({ freq: 784, type: 'sine', duration: 0.3, volume: 0.1 }), 200);
  }
  
  function playWrongSound() {
    playTone({ freq: 220, type: 'sawtooth', duration: 0.3, volume: 0.08 });
  }
  
  // ======== Game Constants ========
  const TILE_SIZE = 24; // Adjusted for 720x480
  const MAP_W = 30;
  const MAP_H = 20;
  
  let keys = {};
  let lastTime = performance.now();
  let gameMessage = '';
  let messageTimer = 0;

// Simple Perlin noise for terrain generation
class Perlin {
  constructor() {
    this.grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0], 
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1], 
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];
    this.p = [];
    for(let i=0; i<256; i++) this.p[i] = Math.floor(Math.random()*256);
    this.perm = [];
    for(let i=0; i<512; i++) this.perm[i] = this.p[i & 255];
  }

  dot(g, x, y) {
    return g[0]*x + g[1]*y;
  }

  mix(a, b, t) { return (1.0 - t)*a + t*b; }

  fade(t) { return t*t*t*(t*(t*6 - 15) + 10); }

  noise(x, y) {
    let X = Math.floor(x) & 255;
    let Y = Math.floor(y) & 255;
    let xf = x - Math.floor(x);
    let yf = y - Math.floor(y);
    let topRight = this.perm[this.perm[X+1]+Y+1];
    let topLeft  = this.perm[this.perm[X]+Y+1];
    let bottomRight = this.perm[this.perm[X+1]+Y];
    let bottomLeft = this.perm[this.perm[X]+Y];
    let gradTopRight = this.grad3[topRight % 12];
    let gradTopLeft = this.grad3[topLeft % 12];
    let gradBottomRight = this.grad3[bottomRight % 12];
    let gradBottomLeft = this.grad3[bottomLeft % 12];
    let dotTopRight = this.dot(gradTopRight, xf-1, yf-1);
    let dotTopLeft = this.dot(gradTopLeft, xf, yf-1);
    let dotBottomRight = this.dot(gradBottomRight, xf-1, yf);
    let dotBottomLeft = this.dot(gradBottomLeft, xf, yf);
    let u = this.fade(xf);
    let v = this.fade(yf);
    let lerpTop = this.mix(dotTopLeft, dotTopRight, u);
    let lerpBottom = this.mix(dotBottomLeft, dotBottomRight, u);
    return this.mix(lerpBottom, lerpTop, v);
  }
}

let perlin = new Perlin();

function generateMap() {
  let map = [];
  for(let y=0; y<MAP_H; y++) {
    let row = [];
    for(let x=0; x<MAP_W; x++) {
      // Noise based height
      let n = perlin.noise(x/10, y/10);
      if (n < -0.3) row.push('water');
      else if (n < 0) row.push('sand');
      else if (n < 0.5) row.push('grass');
      else row.push('forest');
    }
    map.push(row);
  }
  return map;
}

let map = generateMap();

// Player object
let player = {
  x: 15 + 0.5,
  y: 10 + 0.5,
  speed: 2.5,
  size: TILE_SIZE*0.5,
  color: '#0077FF',
  name: 'Explorer',
  hp: 10,
  maxHp: 10,
  hasHat: true
};

// Friendly NPCs scattered in world
let npcs = [
  {x:8.7, y:7.2, color:'#FF7043', name:'Lila', dialog:"The forest is full of secrets!"},
  {x:23.1, y:12.5, color:'#FFAA00', name:'Bryn', dialog:"Watch out for the water!"},
  {x:14.5, y:17.6, color:'#A64CFF', name:'Mira', dialog:"I love exploring with you!"},
];

// Camera holding viewport info
let camera = {
  x: player.x - 480/(2*TILE_SIZE),
  y: player.y - 320/(2*TILE_SIZE)
};

function clampCamera() {
  if(camera.x < 0) camera.x = 0;
  if(camera.y < 0) camera.y = 0;
  if(camera.x > MAP_W - 480/TILE_SIZE) camera.x = MAP_W - 480/TILE_SIZE;
  if(camera.y > MAP_H - 320/TILE_SIZE) camera.y = MAP_H - 320/TILE_SIZE;
}

// Draw tiles with simple colors and textures
function drawTile(x, y, type) {
  let px = (x - camera.x) * TILE_SIZE;
  let py = (y - camera.y) * TILE_SIZE;

  ctx.save();

  if(type === 'water') {
    // blue water with wave effect
    let blue = '#1565C0';
    ctx.fillStyle = blue;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    for(let i=0; i<3; i++) {
      let waveY = py + (Date.now()*0.005 + i*15) % TILE_SIZE;
      ctx.beginPath();
      ctx.arc(px + i*TILE_SIZE/2 + 10, waveY, 5, 0, Math.PI*2);
      ctx.fill();
    }
  }
  else if(type === 'sand') {
    // sandy yellow with small dots
    ctx.fillStyle = '#F3E1A9';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#D2BA6B';
    for(let i=0; i<3; i++) {
      let sx = px + (i*TILE_SIZE/3) + 4;
      let sy = py + (i*7) % TILE_SIZE + 8;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI*2);
      ctx.fill();
    }
  }
  else if(type === 'grass') {
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#388E3C';
    for(let i=0; i<4; i++) {
      let gx = px + (i*8) + 6;
      let gy = py + 20;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx+4, gy-10);
      ctx.lineTo(gx+8, gy);
      ctx.stroke();
    }
  }
  else if(type === 'forest') {
    ctx.fillStyle = '#2E7D32';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Draw stylized trees with trunks and leaves circles
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(px + TILE_SIZE/2 - 3, py + TILE_SIZE - 15, 6, 15);

    ctx.fillStyle = '#1B5E20';
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE/2, py + TILE_SIZE - 30, 15, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = '#388E3C';
    ctx.beginPath();
    ctx.arc(px + TILE_SIZE/2, py + TILE_SIZE - 40, 12, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer() {
  let px = (player.x - camera.x) * TILE_SIZE;
  let py = (player.y - camera.y) * TILE_SIZE;
  ctx.save();
  ctx.translate(px, py);

  // Body
  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, player.size*0.6, player.size*0.9, 0, 0, Math.PI*2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#FFD9B3';
  ctx.beginPath();
  ctx.arc(0, -player.size*0.8, player.size*0.5, 0, Math.PI*2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(-player.size*0.15, -player.size*0.85, player.size*0.1, 0, Math.PI*2);
  ctx.arc(player.size*0.15, -player.size*0.85, player.size*0.1, 0, Math.PI*2);
  ctx.fill();

  if(player.hasHat){
    // Simple explorer hat
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.moveTo(-player.size*0.6, -player.size*0.8);
    ctx.quadraticCurveTo(0, -player.size*1.3, player.size*0.6, -player.size*0.8);
    ctx.quadraticCurveTo(player.size*0.5, -player.size*0.7, -player.size*0.5, -player.size*0.7);
    ctx.fill();
    ctx.strokeStyle = '#5A2D0C';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

function drawNPC(npc){
  let px = (npc.x - camera.x) * TILE_SIZE;
  let py = (npc.y - camera.y) * TILE_SIZE;
  ctx.save();
  ctx.translate(px, py);

  // Body circle
  ctx.fillStyle = npc.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 16, 0, 0, Math.PI*2);
  ctx.fill();

  // Head circle
  ctx.fillStyle = '#FFD9B3';
  ctx.beginPath();
  ctx.arc(0, -12, 10, 0, Math.PI*2);
  ctx.fill();

  // Simple eyes
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(-4, -13, 2, 0, Math.PI*2);
  ctx.arc(4, -13, 2, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// Draw HUD (player info)
function drawHUD() {
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(8, 8, 130, 40);
  ctx.fillStyle = '#FFF';
  ctx.font = '14px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(player.name, 12, 10);

  // HP bar
  ctx.fillStyle = '#FF5252';
  let hpWidth = 100 * (player.hp / player.maxHp);
  ctx.fillRect(12, 30, hpWidth, 10);
  ctx.strokeStyle = '#FFF';
  ctx.strokeRect(12, 30, 100, 10);
}

let lastTime = 0;
let dtSum = 0;
let dtMax = 1/30;

let dialogVisible = false;
let dialogText = '';
let dialogNpcName = '';

function openDialog(npc){
  dialogText = npc.dialog;
  dialogNpcName = npc.name;
  dialogVisible = true;
}
function closeDialog(){
  dialogVisible = false;
  dialogText = '';
  dialogNpcName = '';
}

// Check interaction with NPCs
function checkInteraction(){
  for(let npc of npcs){
    let dx = npc.x - player.x;
    let dy = npc.y - player.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    if(dist < 1.1){
      openDialog(npc);
      break;
    }
  }
}

function drawDialog() {
  if(!dialogVisible) return;
  let w = 370, h = 70;
  let px = (canvas.width - w)/2;
  let py = canvas.height - h - 20;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(px, py, w, h);

  // Border
  ctx.strokeStyle = '#FFF';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, w, h);

  // NPC name
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 16px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(dialogNpcName, px + 10, py + 8);

  // Dialog text wrapping
  ctx.fillStyle = '#FFF';
  ctx.font = '14px sans-serif';
  let text = dialogText;
  let maxW = w - 20;
  let lineHeight = 18;
  let words = text.split(' ');
  let line = '';
  let y = py + 30;
  for(let n=0; n<words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = ctx.measureText(testLine);
    if(metrics.width > maxW && n > 0) {
      ctx.fillText(line.trim(), px + 10, y);
      line = words[n] + ' ';
      y += lineHeight;
    }
    else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), px + 10, y);
}

function update(dt) {
  if(dialogVisible) {
    // If dialog open, player can't move but can close dialog
    if(keys[' ']) {
      closeDialog();
    }
    return;
  }

  let moved = false;
  let moveX = 0;
  let moveY = 0;

  if(keys['w'] || keys['arrowup']) { moveY -= 1; moved = true; }
  if(keys['s'] || keys['arrowdown']) { moveY += 1; moved = true; }
  if(keys['a'] || keys['arrowleft']) { moveX -= 1; moved = true; }
  if(keys['d'] || keys['arrowright']) { moveX += 1; moved = true; }

  if(moved){
    let length = Math.sqrt(moveX*moveX + moveY*moveY);
    moveX /= length;
    moveY /= length;
    let newX = player.x + moveX * player.speed * dt;
    let newY = player.y + moveY * player.speed * dt;

    // Collision with water tiles (can't enter water)
    let tileX = Math.floor(newX);
    let tileY = Math.floor(newY);
    if(tileX >=0 && tileX < MAP_W && tileY >=0 && tileY < MAP_H){
      if(map[tileY][tileX] !== 'water'){
        player.x = newX;
        player.y = newY;
      }
    }
  }

  // Update camera centered on player (adjusted for 720x480)
  camera.x = player.x - WIDTH/(2*TILE_SIZE);
  camera.y = player.y - HEIGHT/(2*TILE_SIZE);
  clampCamera();

  // Interaction key (E or Enter or Space)
  if(keys['e'] || keys['enter'] || keys[' ']) {
    checkInteraction();
  }
  
  // Update message timer
  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) {
      gameMessage = '';
    }
  }
}

function drawSky(){
  // Enhanced gradient sky
  const skyGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  skyGradient.addColorStop(0, '#87CEEB');
  skyGradient.addColorStop(0.6, '#B8E6FF');
  skyGradient.addColorStop(1, '#E0F6FF');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  
  // Add some clouds
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#FFFFFF';
  
  // Simple cloud shapes
  ctx.beginPath();
  ctx.arc(150, 80, 25, 0, Math.PI * 2);
  ctx.arc(180, 75, 30, 0, Math.PI * 2);
  ctx.arc(210, 80, 25, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(450, 60, 20, 0, Math.PI * 2);
  ctx.arc(475, 55, 25, 0, Math.PI * 2);
  ctx.arc(500, 60, 20, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function gameLoop(timestamp = 0) {
  const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  try {
    update(dt);

    drawSky();

    // Draw map tiles inside viewport (adjusted for 720x480)
    const startX = Math.floor(camera.x);
    const startY = Math.floor(camera.y);
    const endX = Math.ceil(camera.x + WIDTH/TILE_SIZE);
    const endY = Math.ceil(camera.y + HEIGHT/TILE_SIZE);

    for(let y = startY; y <= endY; y++) {
      for(let x = startX; x <= endX; x++) {
        if(x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) {
          drawTile(x, y, map[y][x]);
        }
      }
    }

    // Draw NPCs visible in camera
    for(const npc of npcs) {
      if(npc.x > camera.x - 1 && npc.x < camera.x + WIDTH/TILE_SIZE + 1 && 
         npc.y > camera.y - 1 && npc.y < camera.y + HEIGHT/TILE_SIZE + 1) {
        drawNPC(npc);
      }
    }

    drawPlayer();
    drawHUD();
    drawDialog();
    
    // Draw game message if any
    if (gameMessage) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(WIDTH/2 - 150, 50, 300, 30);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(gameMessage, WIDTH/2, 70);
      ctx.restore();
    }
    
  } catch (error) {
    console.error('Game loop error:', error);
  }

  requestAnimationFrame(gameLoop);
}

// ======== Event Handlers ========
function handleKeyDown(e) {
  // Resume audio on first interaction
  if (!audioCtx && !audioInitError) {
    initAudio();
  }
  resumeAudioOnInteraction();
  
  keys[e.key.toLowerCase()] = true;
  
  // Handle special keys
  if (e.key === 'Escape') {
    if (dialogVisible) {
      closeDialog();
    }
    e.preventDefault();
  } else if (e.key === 'm' || e.key === 'M') {
    setAudioEnabled(!audioEnabled);
    gameMessage = audioEnabled ? 'Audio enabled' : 'Audio disabled';
    messageTimer = 2;
    e.preventDefault();
  }
}

function handleKeyUp(e) {
  keys[e.key.toLowerCase()] = false;
}

function handleClick() {
  canvas.focus();
  if (!audioCtx && !audioInitError) {
    initAudio();
  }
  resumeAudioOnInteraction();
}

// ======== Initialization ========
canvas.addEventListener('keydown', handleKeyDown);
canvas.addEventListener('keyup', handleKeyUp);
canvas.addEventListener('click', handleClick);

// Make canvas focusable
canvas.focus();

// Initialize audio on first user interaction
['click', 'keydown', 'touchstart'].forEach(eventType => {
  document.addEventListener(eventType, () => {
    if (!audioCtx && !audioInitError) {
      initAudio();
    }
    resumeAudioOnInteraction();
  }, { once: true });
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  try {
    if (bgOsc) bgOsc.disconnect();
    if (bgGain) bgGain.disconnect();
    if (audioCtx) audioCtx.close();
  } catch (e) {
    // Ignore cleanup errors
  }
});

// Initialize game
gameMessage = 'Welcome to the Exploration Adventure! Use WASD or arrow keys to move, Space/E to interact!';
messageTimer = 5;

// Start the game loop
requestAnimationFrame(gameLoop);

})(); // End of IIFE