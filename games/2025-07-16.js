(function() {
  'use strict';
  
  // ======== Fantasy Quest - Working Version ========
  // Fantasy exploration math game for ages 7-9
  
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
  
  // Audio setup
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
  
  function playTone(freq, duration = 0.3) {
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
  
  function playMagicalSound() {
    playTone(659);
    setTimeout(() => playTone(880), 100);
    setTimeout(() => playTone(1047), 200);
  }
  
  // Game state
  const player = { x: 50, y: 50, size: 24, speed: 2 };
  let score = 0;
  let keys = {};
  let currentNPC = null;
  let showQuestion = false;
  let questionInput = '';
  let message = '';
  let messageTimer = 0;
  
  const npcs = [
    {
      name: 'Mystic Wizard',
      x: 150, y: 100, size: 35,
      type: 'add',
      color: '#8A2BE2',
      answered: false,
      question: '',
      answer: 0
    },
    {
      name: 'Helper Robot',
      x: 400, y: 200, size: 35,
      type: 'sub',
      color: '#708090',
      answered: false,
      question: '',
      answer: 0
    },
    {
      name: 'Friendly Dragon',
      x: 600, y: 350, size: 35,
      type: 'pattern',
      color: '#228B22',
      answered: false,
      question: '',
      answer: 0
    }
  ];
  
  // Generate questions
  function generateQuestion(npc) {
    if (npc.type === 'add') {
      const a = Math.floor(Math.random() * 10) + 3;
      const b = Math.floor(Math.random() * 10) + 3;
      npc.question = `${a} + ${b} = ?`;
      npc.answer = a + b;
    } else if (npc.type === 'sub') {
      const a = Math.floor(Math.random() * 15) + 10;
      const b = Math.floor(Math.random() * 8) + 2;
      npc.question = `${a} - ${b} = ?`;
      npc.answer = a - b;
    } else if (npc.type === 'pattern') {
      const start = Math.floor(Math.random() * 4) + 2;
      const step = Math.floor(Math.random() * 3) + 2;
      const seq = [start, start + step, start + 2 * step, start + 3 * step];
      npc.question = `${seq[0]}, ${seq[1]}, ${seq[2]}, ?`;
      npc.answer = seq[3];
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
      playMagicalSound();
      score++;
      currentNPC.answered = true;
      message = 'Magical! You got it right! ✨';
      messageTimer = 2000;
      
      // Check if all answered
      if (npcs.every(npc => npc.answered)) {
        setTimeout(() => {
          message = 'Quest Complete! You helped all the magical beings! 🎉';
          messageTimer = 3000;
          // Reset for replay
          setTimeout(() => {
            npcs.forEach(npc => {
              npc.answered = false;
              generateQuestion(npc);
            });
          }, 3000);
        }, 1500);
      }
    } else {
      playTone(200);
      message = `Not quite right. The answer was ${currentNPC.answer}. Try again!`;
      messageTimer = 2000;
    }
    
    showQuestion = false;
    currentNPC = null;
    questionInput = '';
  }
  
  function update() {
    // Player movement
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) player.x += player.speed;
    if (keys['ArrowUp'] || keys['w'] || keys['W']) player.y -= player.speed;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) player.y += player.speed;
    
    // Boundary checking
    player.x = Math.max(player.size/2, Math.min(720 - player.size/2, player.x));
    player.y = Math.max(player.size/2, Math.min(480 - player.size/2, player.y));
    
    // Check NPC collisions
    if (!showQuestion) {
      npcs.forEach(npc => {
        if (npc.answered) return;
        
        const dx = player.x - npc.x;
        const dy = player.y - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < (player.size/2 + npc.size/2) + 15) {
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
    // Background gradient
    const gradient = ctx.createRadialGradient(360, 240, 0, 360, 240, 400);
    gradient.addColorStop(0, '#E6E6FA');
    gradient.addColorStop(0.5, '#DDA0DD');
    gradient.addColorStop(1, '#9370DB');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 720, 480);
    
    // NPCs
    npcs.forEach(npc => {
      if (npc.answered) return;
      
      // Character body
      ctx.fillStyle = npc.color;
      ctx.beginPath();
      ctx.arc(npc.x, npc.y, npc.size/2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Eyes
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(npc.x - 6, npc.y - 4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(npc.x + 6, npc.y - 4, 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Name
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(npc.name, npc.x, npc.y - npc.size/2 - 10);
    });
    
    // Player
    ctx.fillStyle = '#87CEEB';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.size/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2F4F4F';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Player eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(player.x - 5, player.y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x + 5, player.y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // UI
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(10, 10, 180, 50);
    ctx.strokeStyle = '#663399';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 180, 50);
    
    ctx.fillStyle = '#663399';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 20, 32);
    
    // Instructions
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 420, 700, 25);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Use arrow keys or WASD to explore. Walk near magical beings to answer their questions!', 360, 437);
    
    // Question dialog
    if (showQuestion && currentNPC) {
      // Background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(180, 170, 360, 140);
      ctx.strokeStyle = '#663399';
      ctx.lineWidth = 3;
      ctx.strokeRect(180, 170, 360, 140);
      
      // Question text
      ctx.fillStyle = '#663399';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(currentNPC.name, 360, 200);
      
      ctx.font = '14px sans-serif';
      ctx.fillText(currentNPC.question, 360, 225);
      
      // Input field
      ctx.fillStyle = '#F5F5F5';
      ctx.fillRect(300, 240, 120, 25);
      ctx.strokeStyle = '#663399';
      ctx.lineWidth = 2;
      ctx.strokeRect(300, 240, 120, 25);
      
      ctx.fillStyle = '#663399';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(questionInput + '|', 360, 257);
      
      ctx.font = '10px sans-serif';
      ctx.fillText('Type answer and press Enter', 360, 280);
      ctx.fillText('Press Escape to cancel', 360, 295);
    }
    
    // Message
    if (message) {
      ctx.fillStyle = 'rgba(102, 51, 153, 0.9)';
      ctx.fillRect(180, 80, 360, 35);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(message, 360, 102);
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
  message = 'Welcome to Fantasy Quest! Explore and help the magical beings with their math problems!';
  messageTimer = 4000;
  gameLoop();
  
})();