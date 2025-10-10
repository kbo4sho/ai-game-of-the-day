(function() {
  'use strict';
  
  // ======== Enhanced Math Explorer - Updated 2025-10-10 ========
  // Original: Math exploration adventure game for ages 7-9
  // Updates: Modern JS, Enhanced Audio, Better Accessibility, Improved Visuals
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
    'Math Explorer game. Click answer buttons to solve math problems, M to toggle audio, Escape to restart.'
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
  let stopBgCallback = null;
  
  function initAudio() {
    if (audioCtx || audioInitError) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        throw new Error('Web Audio API not supported');
      }
      audioCtx = new AudioContext();
      
      // Create adventure background ambience
      bgOsc = audioCtx.createOscillator();
      bgGain = audioCtx.createGain();
      bgLfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      // Main background tone
      bgOsc.type = 'triangle';
      bgOsc.frequency.value = 180;
      
      // LFO for gentle modulation
      bgLfo.type = 'sine';
      bgLfo.frequency.value = 0.1;
      lfoGain.gain.value = 0.008;
      
      // Filter for warmth
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      
      bgOsc.connect(filter);
      filter.connect(bgGain);
      bgGain.connect(audioCtx.destination);
      
      bgLfo.connect(lfoGain);
      lfoGain.connect(bgGain.gain);
      
      bgGain.gain.value = 0.015;
      
      bgOsc.start();
      bgLfo.start();
      
      // Create stop callback
      stopBgCallback = () => {
        try {
          if (bgOsc) bgOsc.stop();
          if (bgLfo) bgLfo.stop();
        } catch (e) {
          // Ignore stop errors
        }
      };
      
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
      filter.frequency.value = Math.max(1000, freq * 2);
      
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
    // Adventure success sound
    playTone({ freq: 880, type: 'triangle', duration: 0.12, volume: 0.12 });
    setTimeout(() => playTone({ freq: 1240, type: 'triangle', duration: 0.1, volume: 0.1 }), 100);
    setTimeout(() => playTone({ freq: 1040, type: 'triangle', duration: 0.15, volume: 0.14 }), 220);
  }
  
  function playWrongSound() {
    playTone({ freq: 260, type: 'sawtooth', duration: 0.4, volume: 0.15 });
  }
  
  // ======== Game State ========
  let lastTime = performance.now();
  let keys = {};
  let mouse = { x: 0, y: 0, clicked: false };
  let gameMessage = '';
  let messageTimer = 0;
  
  const explorer = {
    x: 360,
    y: 240,
    size: 48,
    color: '#3366CC',
    sparklePhase: 0,
    score: 0,
    mathQuestion: null,
    answerOptions: [],
    currentItem: null
  };
  
  const characters = [
    { id: 'lumpy', x: 130, y: 380, name: 'Lumpy the Traveler', color: '#E89336', bobPhase: 0 },
    { id: 'zara', x: 610, y: 110, name: 'Zara the Wise Owl', color: '#9E8BFF', bobPhase: Math.PI },
    { id: 'bumble', x: 170, y: 90, name: 'Bumble the Friendly Bee', color: '#F9BF6F', bobPhase: Math.PI / 2 }
  ];
  
  const itemsToFind = [
    { name: 'Wooden Log', value: 5 },
    { name: 'Shiny Pebble', value: 3 },
    { name: 'Fruit Basket', value: 7 },
    { name: 'Magic Leaf', value: 4 },
    { name: 'Lantern', value: 6 }
  ];
  
  // ======== Game Logic ========
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  function newMathQuestion() {
    const item = itemsToFind[randomInt(0, itemsToFind.length - 1)];
    const a = item.value;
    const b = randomInt(1, 9);
    const correct = a + b;
    const options = [correct];
    
    // Generate wrong options
    while (options.length < 4) {
      const option = randomInt(correct - 3, correct + 3);
      if (option > 0 && !options.includes(option)) {
        options.push(option);
      }
    }
    
    // Shuffle options
    options.sort(() => Math.random() - 0.5);
    
    explorer.mathQuestion = {
      text: `Lumpy asks: ${a} + ${b} = ?`,
      correct: correct
    };
    explorer.answerOptions = options;
    explorer.currentItem = item;
  }
  
  function checkAnswer(answer) {
    if (answer === explorer.mathQuestion.correct) {
      explorer.score++;
      playCorrectSound();
      gameMessage = 'Excellent! You found the treasure! 🎉';
      messageTimer = 2;
      newMathQuestion();
    } else {
      playWrongSound();
      gameMessage = `Not quite right. Try again!`;
      messageTimer = 2;
    }
  }
  
  function update(deltaTime) {
    // Update character animations
    characters.forEach(char => {
      char.bobPhase += deltaTime * 1.2;
    });
    
    // Update explorer sparkle effect
    explorer.sparklePhase += deltaTime * 2;
    if (explorer.sparklePhase > Math.PI * 2) {
      explorer.sparklePhase -= Math.PI * 2;
    }
    
    // Update message timer
    if (messageTimer > 0) {
      messageTimer -= deltaTime;
      if (messageTimer <= 0) {
        gameMessage = '';
      }
    }
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
    // Adventure gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, '#BCE6F7'); // Sky blue
    gradient.addColorStop(1, '#4D9A2A'); // Forest green
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Animated grass/wind effect
    const time = performance.now() / 1000;
    for (let i = 10; i < WIDTH; i += 40) {
      const alpha = 0.05 + 0.03 * Math.sin((i + time * 50) * 0.1);
      const width = 3 + 2 * Math.cos(i * 0.05 + time * 2);
      
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(i, HEIGHT);
      ctx.lineTo(i - 40, HEIGHT - 40);
      ctx.stroke();
    }
  }
  
  function drawExplorer() {
    ctx.save();
    ctx.translate(explorer.x, explorer.y);
    
    // Sparkle effect around explorer
    const sparkleRadius = Math.sin(explorer.sparklePhase) * 6 + 6;
    const sparkleWidth = Math.cos(explorer.sparklePhase) * 6 + 6;
    
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const x1 = Math.cos(angle) * sparkleWidth;
      const y1 = Math.sin(angle) * sparkleRadius;
      const x2 = Math.cos(angle) * sparkleWidth * 1.8;
      const y2 = Math.sin(angle) * sparkleRadius * 1.8;
      
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * (5 - i)})`;
      ctx.lineWidth = 2;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    
    // Explorer body with glow
    ctx.fillStyle = explorer.color;
    ctx.shadowColor = 'rgba(50, 70, 150, 0.5)';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, explorer.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-10, -6, 8, 0, Math.PI * 2);
    ctx.arc(12, -6, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(-11, -6, 4, 0, Math.PI * 2);
    ctx.arc(13, -6, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, explorer.size * 0.25);
    ctx.lineTo(19, explorer.size * 0.45);
    ctx.stroke();
    
    ctx.restore();
  }
  
  function drawCharacter(char) {
    ctx.save();
    ctx.translate(char.x, char.y);
    
    // Bobbing animation
    const bobOffset = Math.sin(char.bobPhase) * 3;
    ctx.translate(0, bobOffset);
    
    // Character body with shadow
    ctx.fillStyle = char.color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-12, -15, 14, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(12, -15, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(-12, -15, 7, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(12, -15, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Name label with background
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    const textWidth = ctx.measureText(char.name).width;
    
    // Label background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    roundRect(ctx, -textWidth/2 - 4, 40, textWidth + 8, 18, 4);
    ctx.fill();
    
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Label text
    ctx.fillStyle = '#333333';
    ctx.fillText(char.name, 0, 52);
    ctx.restore();
    
    ctx.restore();
  }
  
  function drawItem(x, y, name) {
    ctx.save();
    
    // Item with gentle rotation
    const rotation = Math.sin(performance.now() * 0.001) * 0.1;
    
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Item shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#A3D68A';
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Item text
    ctx.fillStyle = '#587B22';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 0, 3);
    
    ctx.restore();
  }
  
  function drawUI() {
    // Question area
    if (explorer.mathQuestion) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      roundRect(ctx, 10, 10, WIDTH - 20, 120, 12);
      ctx.fill();
      
      ctx.strokeStyle = '#4D9A2A';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Question text
      ctx.fillStyle = '#222222';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(explorer.mathQuestion.text, 24, 40);
      
      // Answer buttons
      const startX = 20;
      const startY = 60;
      const buttonWidth = 140;
      const buttonHeight = 52;
      const buttonSpacing = 160;
      
      explorer.answerOptions.forEach((option, i) => {
        const bx = startX + i * buttonSpacing;
        const by = startY;
        const isHovered = mouse.x > bx && mouse.x < bx + buttonWidth && 
                         mouse.y > by && mouse.y < by + buttonHeight;
        
        // Button background
        ctx.fillStyle = isHovered ? '#FFFF99' : '#FFFFCC';
        ctx.strokeStyle = '#C4A900';
        ctx.lineWidth = 3;
        roundRect(ctx, bx, by, buttonWidth, buttonHeight, 8);
        ctx.fill();
        ctx.stroke();
        
        // Button text
        ctx.fillStyle = '#222222';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(option, bx + buttonWidth/2, by + buttonHeight/2);
        
        // Hover effect
        if (isHovered) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          roundRect(ctx, bx, by, buttonWidth, buttonHeight, 8);
          ctx.fill();
        }
      });
      
      ctx.restore();
    }
    
    // Score display
    ctx.save();
    ctx.fillStyle = 'rgba(0, 68, 136, 0.9)';
    roundRect(ctx, WIDTH - 150, 10, 130, 40, 8);
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Score: ${explorer.score}`, WIDTH - 85, 35);
    
    // Audio indicator
    ctx.fillStyle = audioEnabled ? '#00FF00' : '#FF0000';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(audioEnabled ? '🔊' : '🔇', WIDTH - 20, 65);
    ctx.fillText('Press M', WIDTH - 20, 80);
    
    ctx.restore();
    
    // Instructions
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    roundRect(ctx, 10, HEIGHT - 50, WIDTH - 20, 30, 5);
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Click the correct answer to help the explorer find treasures!', WIDTH / 2, HEIGHT - 30);
    ctx.restore();
    
    // Game message
    if (gameMessage) {
      ctx.save();
      ctx.fillStyle = 'rgba(77, 154, 42, 0.9)';
      roundRect(ctx, WIDTH/2 - 150, HEIGHT/2 - 20, 300, 40, 10);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(gameMessage, WIDTH/2, HEIGHT/2 + 5);
      ctx.restore();
    }
  }
  
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
    drawBackground();
    
    characters.forEach(drawCharacter);
    drawExplorer();
    
    if (explorer.currentItem) {
      drawItem(600, 430, explorer.currentItem.name);
    }
    
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
  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  }
  
  function handleClick(e) {
    // Resume audio on first interaction
    if (!audioCtx && !audioInitError) {
      initAudio();
    }
    resumeAudioOnInteraction();
    
    mouse.clicked = true;
    
    // Check answer button clicks
    if (explorer.mathQuestion) {
      const startX = 20;
      const startY = 60;
      const buttonWidth = 140;
      const buttonHeight = 52;
      const buttonSpacing = 160;
      
      for (let i = 0; i < explorer.answerOptions.length; i++) {
        const bx = startX + i * buttonSpacing;
        const by = startY;
        
        if (mouse.x > bx && mouse.x < bx + buttonWidth && 
            mouse.y > by && mouse.y < by + buttonHeight) {
          checkAnswer(explorer.answerOptions[i]);
          break;
        }
      }
    }
    
    setTimeout(() => { mouse.clicked = false; }, 100);
  }
  
  function handleKeyDown(e) {
    // Resume audio on first interaction
    if (!audioCtx && !audioInitError) {
      initAudio();
    }
    resumeAudioOnInteraction();
    
    keys[e.key] = true;
    
    // Handle special keys
    if (e.key === 'm' || e.key === 'M') {
      setAudioEnabled(!audioEnabled);
      gameMessage = audioEnabled ? 'Audio enabled' : 'Audio disabled';
      messageTimer = 2;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      // Restart game
      explorer.score = 0;
      newMathQuestion();
      gameMessage = 'Game restarted!';
      messageTimer = 2;
      e.preventDefault();
    }
  }
  
  function handleKeyUp(e) {
    keys[e.key] = false;
  }
  
  // ======== Initialization ========
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('keydown', handleKeyDown);
  canvas.addEventListener('keyup', handleKeyUp);
  
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
      if (stopBgCallback) stopBgCallback();
      if (bgGain) bgGain.disconnect();
      if (audioCtx) audioCtx.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  });
  
  // Start the game
  newMathQuestion();
  gameMessage = 'Welcome Math Explorer! Click the correct answers to find treasures!';
  messageTimer = 4;
  requestAnimationFrame(gameLoop);
  
})();