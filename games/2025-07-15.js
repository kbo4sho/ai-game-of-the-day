(function() {
  'use strict';
  
  // ======== Math Adventure - Working Version ========
  // Open World Exploration Math Game for ages 7-9
  
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Container not found');
    return;
  }
  
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.style.display = 'block';
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  
  // Audio setup with error handling
  let audioCtx = null;
  let audioEnabled = true;
  
  function initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    } catch (e) {
      audioEnabled = false;
    }
  }
  
  function playTone(freq, duration = 0.2) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Ignore audio errors
    }
  }
  
  // Game state
  const player = { x: 360, y: 240, size: 20, speed: 3 };
  let coins = 0;
  let keys = {};
  let currentNPC = null;
  let showQuestion = false;
  let questionInput = '';
  let message = '';
  let messageTimer = 0;
  
  const npcs = [
    {
      name: 'Spark the Fairy',
      x: 100, y: 100, size: 15,
      type: 'add',
      color: '#ff99cc',
      active: true,
      question: '',
      answer: 0
    },
    {
      name: 'Grumble the Troll', 
      x: 600, y: 150, size: 15,
      type: 'sub',
      color: '#cccccc',
      active: true,
      question: '',
      answer: 0
    },
    {
      name: 'Twinkle the Sprite',
      x: 350, y: 380, size: 15,
      type: 'pattern',
      color: '#66ccff',
      active: true,
      question: '',
      answer: 0
    }
  ];
  
  // Generate questions
  function generateQuestion(npc) {
    if (npc.type === 'add') {
      const a = Math.floor(Math.random() * 11) + 5;
      const b = Math.floor(Math.random() * 11) + 5;
      npc.question = `What is ${a} + ${b}?`;
      npc.answer = a + b;
    } else if (npc.type === 'sub') {
      const a = Math.floor(Math.random() * 11) + 10;
      const b = Math.floor(Math.random() * 9) + 1;
      npc.question = `What is ${a} - ${b}?`;
      npc.answer = a - b;
    } else if (npc.type === 'pattern') {
      const start = Math.floor(Math.random() * 5) + 1;
      const step = Math.floor(Math.random() * 4) + 2;
      const second = start + step;
      const fourth = start + 3 * step;
      const blank = start + 2 * step;
      npc.question = `Fill the blank: ${start}, ${second}, __, ${fourth}`;
      npc.answer = blank;
    }
  }
  
  // Initialize questions
  npcs.forEach(generateQuestion);
  
  // Input handling
  document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    if (showQuestion) {
      if (e.key === 'Enter') {
        submitAnswer();
      } else if (e.key === 'Escape') {
        showQuestion = false;
        currentNPC = null;
        questionInput = '';
      } else if (e.key === 'Backspace') {
        questionInput = questionInput.slice(0, -1);
      } else if (/^[0-9]$/.test(e.key)) {
        questionInput += e.key;
      }
      e.preventDefault();
    }
  });
  
  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });
  
  canvas.addEventListener('click', () => {
    canvas.focus();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  });
  
  function submitAnswer() {
    if (!currentNPC || questionInput === '') return;
    
    const playerAnswer = parseInt(questionInput);
    if (playerAnswer === currentNPC.answer) {
      playTone(523);
      setTimeout(() => playTone(659), 100);
      coins++;
      currentNPC.active = false;
      message = 'Correct! You earned a coin!';
      messageTimer = 2000;
    } else {
      playTone(220);
      message = `Wrong! The answer was ${currentNPC.answer}`;
      messageTimer = 2000;
    }
    
    showQuestion = false;
    currentNPC = null;
    questionInput = '';
  }
  
  function update() {
    // Player movement
    if (keys['ArrowUp']) player.y -= player.speed;
    if (keys['ArrowDown']) player.y += player.speed;
    if (keys['ArrowLeft']) player.x -= player.speed;
    if (keys['ArrowRight']) player.x += player.speed;
    
    // Boundary checking
    player.x = Math.max(player.size, Math.min(720 - player.size, player.x));
    player.y = Math.max(player.size, Math.min(480 - player.size, player.y));
    
    // Check NPC collisions
    if (!showQuestion) {
      npcs.forEach(npc => {
        if (!npc.active) return;
        
        const dx = player.x - npc.x;
        const dy = player.y - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < player.size + npc.size) {
          currentNPC = npc;
          showQuestion = true;
          questionInput = '';
        }
      });
    }
    
    // Update message timer
    if (messageTimer > 0) {
      messageTimer -= 16;
      if (messageTimer <= 0) {
        message = '';
      }
    }
  }
  
  function draw() {
    // Clear canvas
    ctx.fillStyle = '#88cc88';
    ctx.fillRect(0, 0, 720, 480);
    
    // Ground
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 400, 720, 80);
    
    // NPCs
    npcs.forEach(npc => {
      if (!npc.active) return;
      
      ctx.fillStyle = npc.color;
      ctx.beginPath();
      ctx.arc(npc.x, npc.y, npc.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(npc.name, npc.x, npc.y - npc.size - 5);
    });
    
    // Player
    ctx.fillStyle = '#0000ff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
    ctx.fill();
    
    // UI
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Coins: ${coins}`, 60, 425);
    
    ctx.fillStyle = '#000000';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Use arrow keys to explore and solve math puzzles!', 360, 425);
    
    // Question dialog
    if (showQuestion && currentNPC) {
      // Background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(160, 180, 400, 120);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(160, 180, 400, 120);
      
      // Question text
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(currentNPC.name, 360, 210);
      ctx.fillText(currentNPC.question, 360, 235);
      
      // Input field
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(310, 250, 100, 25);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(310, 250, 100, 25);
      
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.fillText(questionInput + '|', 360, 267);
      
      ctx.font = '12px Arial';
      ctx.fillText('Type answer and press Enter', 360, 290);
    }
    
    // Message
    if (message) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(160, 50, 400, 40);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(message, 360, 75);
    }
  }
  
  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }
  
  // Initialize
  initAudio();
  canvas.focus();
  gameLoop();
  
})();