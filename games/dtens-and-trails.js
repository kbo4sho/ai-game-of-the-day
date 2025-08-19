// Tens and Trails – a simple arcade where you collect numbers that sum to 10
(function() {
  const width = 720, height = 480;
  const stage = document.getElementById('tens-and-trails-stage') || document.body;
  const canvas = document.createElement('canvas');
  canvas.id = 'game';
  canvas.width = width; canvas.height = height;
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const player = { x: width/2, y: height/2, r: 16, speed: 3 };
  const keys = new Set();
  const pickups = []; // {x,y,value,collected}
  let targetSum = 10;
  let currentSum = 0;
  let score = 0;
  let gameOver = false;

  function spawnPickup() {
    const value = Math.floor(Math.random()*9)+1; // 1..9
    pickups.push({
      x: 40 + Math.random()*(width-80),
      y: 40 + Math.random()*(height-80),
      value,
      collected:false
    });
  }
  for (let i=0;i<6;i++) spawnPickup();

  window.addEventListener('keydown', (e)=>keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e)=>keys.delete(e.key.toLowerCase()));

  function update() {
    if (gameOver) return;
    if (keys.has('arrowup')||keys.has('w')) player.y -= player.speed;
    if (keys.has('arrowdown')||keys.has('s')) player.y += player.speed;
    if (keys.has('arrowleft')||keys.has('a')) player.x -= player.speed;
    if (keys.has('arrowright')||keys.has('d')) player.x += player.speed;
    player.x = Math.max(player.r, Math.min(width-player.r, player.x));
    player.y = Math.max(player.r, Math.min(height-player.r, player.y));

    // collect
    for (const p of pickups) {
      if (!p.collected && dist(player.x, player.y, p.x, p.y) < player.r + 18) {
        p.collected = true;
        currentSum += p.value;
        if (currentSum === targetSum) {
          score += 10;
          currentSum = 0;
        } else if (currentSum > targetSum) {
          gameOver = true;
          setTimeout(()=>alert('Busted! You went over 10. Score: '+score), 10);
        }
      }
    }

    // respawn missing pickups
    while (pickups.filter(p=>!p.collected).length < 6) spawnPickup();
  }

  function drawBackground() {
    // stylized trail stripes (2:3 poster vibe)
    const g = ctx.createLinearGradient(0,0,0,height);
    g.addColorStop(0,'#0a0a1f');
    g.addColorStop(1,'#13233d');
    ctx.fillStyle = g; ctx.fillRect(0,0,width,height);
    ctx.globalAlpha = 0.07; ctx.fillStyle = '#00F5FF';
    for (let i=0;i<20;i++) {
      const y = (i/20)*height;
      ctx.fillRect(0,y, width, 2);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawBackground();
    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0,0,width,40);
    ctx.fillStyle = '#fff';
    ctx.font = '18px Inter, sans-serif';
    ctx.fillText('Make: 10', 12, 26);
    ctx.fillText('Current: '+currentSum, 110, 26);
    ctx.fillText('Score: '+score, width-120, 26);

    // pickups
    for (const p of pickups) if (!p.collected) {
      ctx.fillStyle = '#FFB300';
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p.value), p.x, p.y+1);
    }

    // player
    ctx.fillStyle = '#6C63FF';
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#00F5FF'; ctx.lineWidth = 3; ctx.stroke();
  }

  function loop() {
    update();
    draw();
    if (!gameOver) requestAnimationFrame(loop);
  }
  function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2,y1-y2); }
  loop();
})();


