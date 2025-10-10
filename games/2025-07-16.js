(function() {
  'use strict';
  
  // ======== Enhanced Fantasy Quest - Updated 2025-10-10 ========
  // Original: Fantasy exploration math game for ages 7-9
  // Updates: Modern JS, Web Audio API, Enhanced Accessibility, Better Visuals
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
    'Fantasy Quest math game. Use arrow keys to move, Space to interact with characters, M to toggle audio, Escape to restart.'
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
  let bgLfo = null;
  
  function initAudio() {
    if (audioCtx || audioInitError) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        throw new Error('Web Audio API not supported');
      }
      audioCtx = new AudioContext();
      
      // Create mystical background ambience
      bgOsc = audioCtx.createOscillator();
      bgGain = audioCtx.createGain();
      bgLfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      // Main background tone
      bgOsc.type = 'sine';
      bgOsc.frequency.value = 130;
      
      // LFO for gentle modulation
      bgLfo.type = 'sine';
      bgLfo.frequency.value = 0.3;
      lfoGain.gain.value = 0.01;
      
      // Filter for warmth
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      
      bgOsc.connect(filter);
      filter.connect(bgGain);
      bgGain.connect(audioCtx.destination);
      
      bgLfo.connect(lfoGain);
      lfoGain.connect(bgGain.gain);
      
      bgGain.gain.value = 0.03;
      
      bgOsc.start();
      bgLfo.start();
      
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
      bgGain.gain.value = audioEnabled ? 0.03 : 0;
    }
  }
  
  function playTone({ freq = 440, type = 'sine', duration = 0.2, volume = 0.15, detune = 0 } = {}) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(800, freq * 1.5);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration - 0.05);
      
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }
  
  function playMagicalSound() {
    // Magical sparkle sound
    playTone({ freq: 659, type: 'triangle', duration: 0.3, volume: 0.12 });
    setTimeout(() => playTone({ freq: 880, type: 'sine', duration: 0.25, volume: 0.1 }), 100);
    setTimeout(() => playTone({ freq: 1047, type: 'triangle', duration: 0.2, volume: 0.08 }), 200);
  }
  
  function playErrorSound() {
    playTone({ freq: 200, type: 'sawtooth', duration: 0.4, volume: 0.1 });
  }
  
  function playFootstepSound() {
    playTone({ 
      freq: 150 + Math.random() * 100, 
      type: 'triangle', 
      duration: 0.08, 
      volume: 0.04 
    });
  }
  
  // ======== Game State ========
  let lastTime = performance.now();
  let keys = {};
  let gameMessage = '';
  let messageTimer = 0;
  let currentQuestion = null;
  let questionInput = '';
  let showingQuestion = false;
  let questionsAnswered = 0;
  let totalQuestions = 0;
  
  const player = { 
    x: 50, 
    y: 50, 
    size: 24, 
    speed: 150, // pixels per second
    walkTimer: 0,
    animPhase: 0
  };
  
  let score = 0;
  
  const npcDefinitions = [
    {
      name: 'Mystic Wizard',
      x: 150, y: 100, size: 35,
      type: 'add',
      color: '#8A2BE2',
      answered: false,
      bobPhase: 0
    },
    {
      name: 'Helper Robot',
      x: 400, y: 200, size: 35,
      type: 'sub', 
      color: '#708090',
      answered: false,
      bobPhase: Math.PI
    },
    {
      name: 'Friendly Dragon',
      x: 600, y: 350, size: 35,
      type: 'pattern',
      color: '#228B22',
      answered: false,
      bobPhase: Math.PI / 2
    }
  ];
  
  // Generate questions for NPCs
  npcDefinitions.forEach(npc => {
    generateQuestion(npc);
  });
  
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
  
  // ======== Game Logic ========
  function update(deltaTime) {
    // Player movement with delta time
    let moving = false;
    const moveSpeed = player.speed * deltaTime;
    
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
      player.x -= moveSpeed;
      moving = true;
    }
    if (keys['ArrowRight'] || keys['d'] || keys['D']) {
      player.x += moveSpeed;
      moving = true;
    }
    if (keys['ArrowUp'] || keys['w'] || keys['W']) {
      player.y -= moveSpeed;
      moving = true;
    }
    if (keys['ArrowDown'] || keys['s'] || keys['S']) {
      player.y += moveSpeed;
      moving = true;
    }
    
    // Boundary checking
    player.x = Math.max(player.size/2, Math.min(WIDTH - player.size/2, player.x));
    player.y = Math.max(player.size/2, Math.min(HEIGHT - player.size/2, player.y));
    
    // Walking animation and sound
    if (moving) {
      player.animPhase += deltaTime * 8;
      player.walkTimer += deltaTime;
      if (player.walkTimer > 0.4) {
        playFootstepSound();
        player.walkTimer = 0;
      }
    }
    
    // Update NPCs
    npcDefinitions.forEach(npc => {
      if (!npc.answered) {
        npc.bobPhase += deltaTime * 1.5;
        
        const dx = player.x - npc.x;
        const dy = player.y - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < (player.size/2 + npc.size/2) + 15 && !showingQuestion) {
          showQuestion(npc);
        }
      }
    });
    
    // Update message timer
    if (messageTimer > 0) {
      messageTimer -= deltaTime;
      if (messageTimer <= 0) {
        gameMessage = '';
      }
    }
  }
  
  function showQuestion(npc) {
    currentQuestion = npc;
    questionInput = '';
    showingQuestion = true;
    gameMessage = `${npc.name}: ${npc.question}`;
    messageTimer = 30; // 30 seconds to answer
  }
  
  function submitAnswer() {
    if (!currentQuestion || questionInput === '') return;
    
    totalQuestions++;
    const playerAnswer = parseInt(questionInput);
    
    if (playerAnswer === currentQuestion.answer) {
      questionsAnswered++;
      score++;
      currentQuestion.answered = true;
      gameMessage = 'Magical! You got it right! ✨';
      playMagicalSound();
      
      // Check if all questions answered
      if (npcDefinitions.every(npc => npc.answered)) {
        setTimeout(() => {
          gameMessage = 'Quest Complete! You helped all the magical beings! 🎉';
          messageTimer = 5;
          // Reset for replay
          setTimeout(() => {
            npcDefinitions.forEach(npc => {
              npc.answered = false;
              generateQuestion(npc);
            });
          }, 3000);
        }, 1500);
      }
    } else {
      gameMessage = `Not quite right. The answer was ${currentQuestion.answer}. Try again!`;
      playErrorSound();
    }
    
    messageTimer = 3;
    showingQuestion = false;
    currentQuestion = null;
    questionInput = '';
  }
  
  // ======== Enhanced Drawing Functions ========
  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
  
  function drawBackground() {
    // Mystical gradient background
    const gradient = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, 0, WIDTH/2, HEIGHT/2, WIDTH);
    gradient.addColorStop(0, '#E6E6FA'); // Lavender
    gradient.addColorStop(0.5, '#DDA0DD'); // Plum
    gradient.addColorStop(1, '#9370DB'); // Medium Purple
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Add mystical sparkles
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#FFFFFF';
    
    const time = performance.now() / 1000;
    for (let i = 0; i < 20; i++) {
      const x = (i * 37) % WIDTH;
      const y = (i * 73) % HEIGHT;
      const phase = time + i;
      const alpha = (Math.sin(phase) + 1) / 2;
      
      ctx.globalAlpha = alpha * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, 2 + Math.sin(phase * 2), 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  function drawNPC(npc) {
    if (npc.answered) return;
    
    ctx.save();
    
    // Bobbing animation
    const bobOffset = Math.sin(npc.bobPhase) * 4;
    
    // Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(npc.x, npc.y + npc.size/2 + 8, npc.size * 0.6, npc.size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    
    // Character glow
    ctx.save();
    ctx.globalAlpha = 0.3;
    const glowGradient = ctx.createRadialGradient(npc.x, npc.y + bobOffset, 0, npc.x, npc.y + bobOffset, npc.size + 10);
    glowGradient.addColorStop(0, npc.color);
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(npc.x, npc.y + bobOffset, npc.size + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Character body with gradient
    const gradient = ctx.createRadialGradient(
      npc.x - 8, npc.y - 8 + bobOffset, 8,
      npc.x, npc.y + bobOffset, npc.size/2
    );
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(0.3, npc.color);
    gradient.addColorStop(1, '#000000');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(npc.x, npc.y + bobOffset, npc.size/2, 0, Math.PI * 2);
    ctx.fill();
    
    // Character details based on type
    ctx.fillStyle = '#FFFFFF';
    if (npc.name.includes('Wizard')) {
      // Wizard hat
      ctx.beginPath();
      ctx.moveTo(npc.x, npc.y - npc.size/2 + bobOffset);
      ctx.lineTo(npc.x - 8, npc.y - npc.size + bobOffset);
      ctx.lineTo(npc.x + 8, npc.y - npc.size + bobOffset);
      ctx.closePath();
      ctx.fill();
      
      // Star on hat
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(npc.x, npc.y - npc.size + 5 + bobOffset, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (npc.name.includes('Robot')) {
      // Robot antenna
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(npc.x, npc.y - npc.size/2 + bobOffset);
      ctx.lineTo(npc.x, npc.y - npc.size/2 - 8 + bobOffset);
      ctx.stroke();
      
      // Antenna light
      ctx.fillStyle = '#00FF00';
      ctx.beginPath();
      ctx.arc(npc.x, npc.y - npc.size/2 - 8 + bobOffset, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (npc.name.includes('Dragon')) {
      // Dragon wings
      ctx.fillStyle = npc.color;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(npc.x - npc.size/3, npc.y + bobOffset, 8, 15, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(npc.x + npc.size/3, npc.y + bobOffset, 8, 15, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    // Eyes
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(npc.x - 6, npc.y - 4 + bobOffset, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(npc.x + 6, npc.y - 4 + bobOffset, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(npc.x, npc.y + 4 + bobOffset, 6, 0, Math.PI);
    ctx.stroke();
    
    // Name label with background
    ctx.save();
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const textWidth = ctx.measureText(npc.name).width;
    
    // Label background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    roundRect(ctx, npc.x - textWidth/2 - 4, npc.y - npc.size/2 - 25 + bobOffset, textWidth + 8, 16, 4);
    ctx.fill();
    
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Label text
    ctx.fillStyle = '#333333';
    ctx.fillText(npc.name, npc.x, npc.y - npc.size/2 - 12 + bobOffset);
    ctx.restore();
    
    ctx.restore();
  }
  
  function drawPlayer() {
    ctx.save();
    
    // Walking animation
    const walkBob = Math.sin(player.animPhase) * 2;
    
    // Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + player.size/2 + 5, player.size * 0.6, player.size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    
    // Player body with gradient
    const gradient = ctx.createRadialGradient(
      player.x - 5, player.y - 5 + walkBob, 5,
      player.x, player.y + walkBob, player.size/2
    );
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#4682B4');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(player.x, player.y + walkBob, player.size/2, 0, Math.PI * 2);
    ctx.fill();
    
    // Player outline
    ctx.strokeStyle = '#2F4F4F';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Simple face
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(player.x - 5, player.y - 3 + walkBob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x + 5, player.y - 3 + walkBob, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y + 3 + walkBob, 4, 0, Math.PI);
    ctx.stroke();
    
    ctx.restore();
  }
  
  function drawUI() {
    // Stats panel
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    roundRect(ctx, 10, 10, 180, 70, 8);
    ctx.fill();
    
    ctx.strokeStyle = '#663399';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#663399';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 20, 32);
    
    if (totalQuestions > 0) {
      const accuracy = Math.round((questionsAnswered / totalQuestions) * 100);
      ctx.fillText(`Accuracy: ${accuracy}%`, 20, 52);
    }
    
    // Audio indicator
    ctx.fillStyle = audioEnabled ? '#00FF00' : '#FF0000';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(audioEnabled ? '🔊' : '🔇', WIDTH - 20, 25);
    ctx.fillText('Press M', WIDTH - 20, 40);
    
    ctx.restore();
    
    // Instructions
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    roundRect(ctx, 10, HEIGHT - 60, WIDTH - 20, 20, 5);
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Use arrow keys or WASD to explore. Walk near magical beings to answer their questions!', WIDTH / 2, HEIGHT - 45);
    ctx.restore();
    
    // Question interface
    if (showingQuestion && currentQuestion) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      roundRect(ctx, WIDTH/2 - 180, HEIGHT/2 - 70, 360, 140, 12);
      ctx.fill();
      
      ctx.strokeStyle = '#663399';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      ctx.fillStyle = '#663399';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(currentQuestion.name, WIDTH/2, HEIGHT/2 - 40);
      
      ctx.font = '14px sans-serif';
      ctx.fillText(currentQuestion.question, WIDTH/2, HEIGHT/2 - 15);
      
      // Input field
      ctx.fillStyle = '#F5F5F5';
      roundRect(ctx, WIDTH/2 - 60, HEIGHT/2 + 5, 120, 25, 4);
      ctx.fill();
      
      ctx.strokeStyle = '#663399';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#663399';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(questionInput + '|', WIDTH/2, HEIGHT/2 + 22);
      
      ctx.font = '10px sans-serif';
      ctx.fillText('Type answer and press Enter', WIDTH/2, HEIGHT/2 + 45);
      ctx.fillText('Press Escape to cancel', WIDTH/2, HEIGHT/2 + 58);
      
      ctx.restore();
    }
    
    // Game message
    if (gameMessage && !showingQuestion) {
      ctx.save();
      ctx.fillStyle = 'rgba(102, 51, 153, 0.9)';
      roundRect(ctx, WIDTH/2 - 180, 80, 360, 35, 8);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(gameMessage, WIDTH/2, 102);
      ctx.restore();
    }
  }
  
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
    drawBackground();
    
    npcDefinitions.forEach(drawNPC);
    drawPlayer();
    
    drawUI();
  }
  
  // ======== Game Loop ========
  function gameLoop(currentTime) {
    const deltaTime = Math.min(0.05, (currentTime - lastTime) / 1000);
    lastTime = currentTime;
    
    try {
      update(deltaTime);
      render();
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
    
    keys[e.key] = true;
    
    // Handle special keys
    if (e.key === 'Escape') {
      if (showingQuestion) {
        showingQuestion = false;
        currentQuestion = null;
        questionInput = '';
        gameMessage = 'Question cancelled.';
        messageTimer = 2;
      }
      e.preventDefault();
    } else if (e.key === 'm' || e.key === 'M') {
      setAudioEnabled(!audioEnabled);
      gameMessage = audioEnabled ? 'Audio enabled' : 'Audio disabled';
      messageTimer = 2;
      e.preventDefault();
    } else if (showingQuestion) {
      // Handle question input
      if (e.key === 'Enter') {
        submitAnswer();
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        questionInput = questionInput.slice(0, -1);
        e.preventDefault();
      } else if (/^[0-9]$/.test(e.key)) {
        if (questionInput.length < 3) {
          questionInput += e.key;
        }
        e.preventDefault();
      }
    }
  }
  
  function handleKeyUp(e) {
    keys[e.key] = false;
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
      if (bgLfo) bgLfo.disconnect();
      if (bgGain) bgGain.disconnect();
      if (audioCtx) audioCtx.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  
  // Start the game
  gameMessage = 'Welcome to Fantasy Quest! Explore and help the magical beings with their math problems!';
  messageTimer = 4;
  requestAnimationFrame(gameLoop);
  
})();