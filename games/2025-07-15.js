(function() {
  'use strict';
  
  // ======== Enhanced Math Adventure - Updated 2025-10-10 ========
  // Original: Open World Exploration Math Game for ages 7-9
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
    'Math Adventure game. Use arrow keys to move, Space to interact with characters, M to toggle audio, Escape to restart.'
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
      
      // Create gentle background hum
      bgOsc = audioCtx.createOscillator();
      bgGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      bgOsc.type = 'sine';
      bgOsc.frequency.value = 110; // Low gentle tone
      bgGain.gain.value = 0.02; // Very gentle
      
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
      bgGain.gain.value = audioEnabled ? 0.02 : 0;
    }
  }
  
  function playTone({ freq = 440, type = 'sine', duration = 0.15, volume = 0.12, detune = 0 } = {}) {
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
  
  function playCorrectSound() {
    // Pleasant arpeggio
    playTone({ freq: 523, type: 'sine', duration: 0.2, volume: 0.1 });
    setTimeout(() => playTone({ freq: 659, type: 'sine', duration: 0.2, volume: 0.1 }), 100);
    setTimeout(() => playTone({ freq: 784, type: 'sine', duration: 0.3, volume: 0.1 }), 200);
  }
  
  function playWrongSound() {
    playTone({ freq: 220, type: 'sawtooth', duration: 0.3, volume: 0.08 });
  }
  
  function playWalkSound() {
    playTone({ freq: 400 + Math.random() * 200, type: 'triangle', duration: 0.1, volume: 0.05 });
  }
  
  // ======== Game State ========
  let lastTime = performance.now();
  let keys = {};
  let gameMessage = '';
  let messageTimer = 0;
  let currentQuestion = null;
  let questionInput = '';
  let showingQuestion = false;
  
  const player = { 
    x: 360, 
    y: 240, 
    size: 20, 
    speed: 120, // pixels per second
    walkTimer: 0
  };
  
  let coins = 0;
  let totalQuestions = 0;
  let correctAnswers = 0;
  
  const npcDefinitions = [
    { name: 'Spark the Fairy', type: 'add', x: 100, y: 100, color: '#ff99cc' },
    { name: 'Grumble the Troll', type: 'sub', x: 600, y: 150, color: '#cccccc' },
    { name: 'Twinkle the Sprite', type: 'pattern', x: 350, y: 380, color: '#66ccff' }
  ];
  
  const npcs = npcDefinitions.map(def => {
    const npc = { 
      ...def, 
      size: 25, 
      active: true, 
      recentlyAsked: false,
      bobPhase: Math.random() * Math.PI * 2
    };
    generateQuestion(npc);
    return npc;
  });
  
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
  
  // ======== Game Logic ========
  function update(deltaTime) {
    // Player movement with delta time
    let moving = false;
    if (keys['ArrowUp'] || keys['w'] || keys['W']) {
      player.y -= player.speed * deltaTime;
      moving = true;
    }
    if (keys['ArrowDown'] || keys['s'] || keys['S']) {
      player.y += player.speed * deltaTime;
      moving = true;
    }
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
      player.x -= player.speed * deltaTime;
      moving = true;
    }
    if (keys['ArrowRight'] || keys['d'] || keys['D']) {
      player.x += player.speed * deltaTime;
      moving = true;
    }
    
    // Boundary checking
    player.x = Math.max(player.size, Math.min(WIDTH - player.size, player.x));
    player.y = Math.max(player.size, Math.min(HEIGHT - player.size, player.y));
    
    // Walking sound effect
    if (moving) {
      player.walkTimer += deltaTime;
      if (player.walkTimer > 0.3) {
        playWalkSound();
        player.walkTimer = 0;
      }
    }
    
    // Update NPCs
    npcs.forEach(npc => {
      if (npc.active) {
        npc.bobPhase += deltaTime * 2;
        
        const dx = player.x - npc.x;
        const dy = player.y - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < player.size + npc.size + 10) {
          if (!npc.recentlyAsked && !showingQuestion) {
            showQuestion(npc);
          }
        } else {
          npc.recentlyAsked = false;
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
    npc.recentlyAsked = true;
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
      correctAnswers++;
      coins++;
      currentQuestion.active = false;
      gameMessage = 'Correct! You earned a coin! 🎉';
      playCorrectSound();
      
      // Generate new question for this NPC
      setTimeout(() => {
        currentQuestion.active = true;
        generateQuestion(currentQuestion);
      }, 3000);
    } else {
      gameMessage = `Not quite right. The answer was ${currentQuestion.answer}. Try again later!`;
      playWrongSound();
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
    // Enhanced gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue
    gradient.addColorStop(0.7, '#98FB98'); // Pale green
    gradient.addColorStop(1, '#90EE90'); // Light green
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Ground area with better styling
    const groundGradient = ctx.createLinearGradient(0, 380, 0, HEIGHT);
    groundGradient.addColorStop(0, '#8B7355');
    groundGradient.addColorStop(1, '#654321');
    
    ctx.fillStyle = groundGradient;
    roundRect(ctx, 0, 380, WIDTH, HEIGHT - 380, 0);
    ctx.fill();
    
    // Add some decorative elements
    ctx.save();
    ctx.globalAlpha = 0.3;
    
    // Clouds
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(150, 80, 30, 0, Math.PI * 2);
    ctx.arc(180, 75, 35, 0, Math.PI * 2);
    ctx.arc(210, 80, 30, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(450, 60, 25, 0, Math.PI * 2);
    ctx.arc(475, 55, 30, 0, Math.PI * 2);
    ctx.arc(500, 60, 25, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
  
  function drawNPC(npc) {
    if (!npc.active) return;
    
    ctx.save();
    
    // Bobbing animation
    const bobOffset = Math.sin(npc.bobPhase) * 3;
    
    // Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(npc.x, npc.y + npc.size + 5, npc.size * 0.8, npc.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    
    // Character body with gradient
    const gradient = ctx.createRadialGradient(
      npc.x - 5, npc.y - 5 + bobOffset, 5,
      npc.x, npc.y + bobOffset, npc.size
    );
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(1, npc.color);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(npc.x, npc.y + bobOffset, npc.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Character outline
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Simple face
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(npc.x - 8, npc.y - 5 + bobOffset, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(npc.x + 8, npc.y - 5 + bobOffset, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile
    ctx.beginPath();
    ctx.arc(npc.x, npc.y + 5 + bobOffset, 8, 0, Math.PI);
    ctx.stroke();
    
    // Name label with background
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    const textWidth = ctx.measureText(npc.name).width;
    
    // Label background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    roundRect(ctx, npc.x - textWidth/2 - 5, npc.y - npc.size - 25, textWidth + 10, 20, 5);
    ctx.fill();
    
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Label text
    ctx.fillStyle = '#333333';
    ctx.fillText(npc.name, npc.x, npc.y - npc.size - 10);
    ctx.restore();
    
    ctx.restore();
  }
  
  function drawPlayer() {
    ctx.save();
    
    // Shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + player.size + 3, player.size * 0.8, player.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    
    // Player body with gradient
    const gradient = ctx.createRadialGradient(
      player.x - 5, player.y - 5, 5,
      player.x, player.y, player.size
    );
    gradient.addColorStop(0, '#4169E1');
    gradient.addColorStop(1, '#0000CD');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Player outline
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Simple face
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(player.x - 6, player.y - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x + 6, player.y - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y + 4, 6, 0, Math.PI);
    ctx.stroke();
    
    ctx.restore();
  }
  
  function drawUI() {
    // Stats panel
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    roundRect(ctx, 10, 10, 200, 80, 10);
    ctx.fill();
    
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Coins: ${coins}`, 20, 35);
    
    if (totalQuestions > 0) {
      const accuracy = Math.round((correctAnswers / totalQuestions) * 100);
      ctx.fillText(`Accuracy: ${accuracy}%`, 20, 55);
    }
    
    ctx.font = '12px sans-serif';
    ctx.fillText(`Questions: ${correctAnswers}/${totalQuestions}`, 20, 75);
    
    // Audio indicator
    ctx.fillStyle = audioEnabled ? '#00FF00' : '#FF0000';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(audioEnabled ? '🔊 ON' : '🔇 OFF', WIDTH - 20, 30);
    ctx.fillText('(Press M)', WIDTH - 20, 45);
    
    ctx.restore();
    
    // Instructions
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    roundRect(ctx, 10, HEIGHT - 80, WIDTH - 20, 25, 5);
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Use arrow keys or WASD to explore. Walk into characters to answer math questions!', WIDTH / 2, HEIGHT - 60);
    ctx.restore();
    
    // Question interface
    if (showingQuestion && currentQuestion) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      roundRect(ctx, WIDTH/2 - 200, HEIGHT/2 - 80, 400, 160, 15);
      ctx.fill();
      
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(currentQuestion.name, WIDTH/2, HEIGHT/2 - 50);
      
      ctx.font = '16px sans-serif';
      ctx.fillText(currentQuestion.question, WIDTH/2, HEIGHT/2 - 20);
      
      // Input field
      ctx.fillStyle = '#F0F0F0';
      roundRect(ctx, WIDTH/2 - 80, HEIGHT/2, 160, 30, 5);
      ctx.fill();
      
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(questionInput + '|', WIDTH/2, HEIGHT/2 + 20);
      
      ctx.font = '12px sans-serif';
      ctx.fillText('Type your answer and press Enter', WIDTH/2, HEIGHT/2 + 50);
      ctx.fillText('Press Escape to cancel', WIDTH/2, HEIGHT/2 + 65);
      
      ctx.restore();
    }
    
    // Game message
    if (gameMessage && !showingQuestion) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      roundRect(ctx, WIDTH/2 - 200, 100, 400, 40, 10);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(gameMessage, WIDTH/2, 125);
      ctx.restore();
    }
  }
  
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
    drawBackground();
    
    npcs.forEach(drawNPC);
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
      if (bgGain) bgGain.disconnect();
      if (audioCtx) audioCtx.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  
  // Start the game
  gameMessage = 'Welcome to Math Adventure! Walk around and meet the characters to solve math problems!';
  messageTimer = 5;
  requestAnimationFrame(gameLoop);
  
})();