let stage = document.getElementById('game-of-the-day-stage');
let canvas = document.createElement('canvas');
canvas.width = 480;
canvas.height = 320;
stage.innerHTML = '';
stage.appendChild(canvas);
let ctx = canvas.getContext('2d');

const TILE_SIZE = 32;
const MAP_W = 30;
const MAP_H = 20;

let keys = {};

window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

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

  // Update camera centered on player
  camera.x = player.x - 480/(2*TILE_SIZE);
  camera.y = player.y - 320/(2*TILE_SIZE);
  clampCamera();

  // Interaction key (E or Enter)
  if(keys['e'] || keys['enter']) {
    checkInteraction();
  }
}

function drawSky(){
  // Gradient morning sky
  let skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGradient.addColorStop(0, '#87CEEB');
  skyGradient.addColorStop(1, '#CDE8FF');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function gameLoop(timestamp=0){
  let dt = (timestamp - lastTime)/1000;
  lastTime = timestamp;
  if(dt > dtMax) dt = dtMax;

  update(dt);

  drawSky();

  // Draw map tiles inside viewport plus 1 tile for edges
  let startX = Math.floor(camera.x);
  let startY = Math.floor(camera.y);
  let endX = Math.ceil(camera.x + 480/TILE_SIZE);
  let endY = Math.ceil(camera.y + 320/TILE_SIZE);

  for(let y=startY; y<=endY; y++){
    for(let x=startX; x<=endX; x++){
      if(x>=0 && y>=0 && x<MAP_W && y<MAP_H){
        drawTile(x, y, map[y][x]);
      }
    }
  }

  // Draw NPCs visible in camera
  for(let npc of npcs){
    if(npc.x > camera.x-1 && npc.x < camera.x + 480/TILE_SIZE+1 && 
       npc.y > camera.y-1 && npc.y < camera.y + 320/TILE_SIZE+1){
      drawNPC(npc);
    }
  }

  drawPlayer();
  drawHUD();
  drawDialog();

  requestAnimationFrame(gameLoop);
}

gameLoop();