(function() {
  'use strict';
  
  // ======== Math Explorer - Working Version ========
  // Adventure quiz game for ages 7-9
  
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
  
  function playTone(freq, duration = 0.15) {
    if (!audioEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = 'triangle';
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Ignore audio errors
    }
  }
  
  function playCorrectSound() {
    playTone(880);
    setTimeout(() => playTone(1240), 100);
    setTimeout(() => playTone(1040), 220);
  }
  
  function playWrongSound() {
    playTone(260, 0.4);
  }
  
  // Game state
  const explorer = {
    x: 360,
    y: 240,
    size: 48,
    color: '#3366CC',
    score: 0,
    mathQuestion: null,
    answerOptions: [],
    currentItem: null
  };
  
  const characters = [
    { id: 'lumpy', x: 130, y: 380, name: 'Lumpy the Traveler', color: '#E89336' },
    { id: 'zara', x: 610, y: 110, name: 'Zara the Wise Owl', color: '#9E8BFF' },
    { id: 'bumble', x: 170, y: 90, name: 'Bumble the Friendly Bee', color: '#F9BF6F' }
  ];
  
  const itemsToFind = [
    { name: 'Wooden Log', value: 5 },
    { name: 'Shiny Pebble', value: 3 },
    { name: 'Fruit Basket', value: 7 },
    { name: 'Magic Leaf', value: 4 },
    { name: 'Lantern', value: 6 }
  ];
  
  let mouse = { x: 0, y: 0 };
  let message = '';
  let messageTimer = 0;
  
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
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    
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
      message = 'Excellent! You found the treasure! 🎉';
      messageTimer = 2000;
      newMathQuestion();
    } else {
      playWrongSound();
      message = 'Not quite right. Try again!';
      messageTimer = 2000;
    }
  }
  
  // Event handlers
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  
  canvas.addEventListener('click', (e) => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
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
  });
  
  function update() {
    // Update message timer
    if (messageTimer > 0) {
      messageTimer -= 16;
      if (messageTimer <= 0) {
        message = '';
      }
    }
  }
  
  function drawBackground() {
    // Adventure gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, 480);
    gradient.addColorStop(0, '#BCE6F7');
    gradient.addColorStop(1, '#4D9A2A');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 720, 480);
    
    // Animated grass effect
    const time = Date.now() / 1000;
    for (let i = 10; i < 720; i += 40) {
      const alpha = 0.05 + 0.03 * Math.sin((i + time * 50) * 0.1);
      const width = 3 + 2 * Math.cos(i * 0.05 + time * 2);
      
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(i, 480);
      ctx.lineTo(i - 40, 440);
      ctx.stroke();
    }
  }
  
  function drawExplorer() {
    ctx.save();
    ctx.translate(explorer.x, explorer.y);
    
    // Explorer body
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
    
    // Character body
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
    
    // Name
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(char.name, 0, 52);
    
    ctx.restore();
  }
  
  function drawItem(x, y, name) {
    ctx.save();
    
    const rotation = Math.sin(Date.now() * 0.001) * 0.1;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    
    // Item
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#A3D68A';
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Text
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
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(10, 10, 700, 120);
      ctx.strokeStyle = '#4D9A2A';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, 700, 120);
      
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
        
        // Button
        ctx.fillStyle = isHovered ? '#FFFF99' : '#FFFFCC';
        ctx.strokeStyle = '#C4A900';
        ctx.lineWidth = 3;
        ctx.fillRect(bx, by, buttonWidth, buttonHeight);
        ctx.strokeRect(bx, by, buttonWidth, buttonHeight);
        
        // Button text
        ctx.fillStyle = '#222222';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(option, bx + buttonWidth/2, by + buttonHeight/2);
      });
    }
    
    // Score
    ctx.fillStyle = 'rgba(0, 68, 136, 0.9)';
    ctx.fillRect(570, 10, 130, 40);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Score: ${explorer.score}`, 635, 35);
    
    // Instructions
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 430, 700, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Click the correct answer to help the explorer find treasures!', 360, 450);
    
    // Message
    if (message) {
      ctx.fillStyle = 'rgba(77, 154, 42, 0.9)';
      ctx.fillRect(210, 220, 300, 40);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(message, 360, 245);
    }
  }
  
  function draw() {
    drawBackground();
    
    characters.forEach(drawCharacter);
    drawExplorer();
    
    if (explorer.currentItem) {
      drawItem(600, 430, explorer.currentItem.name);
    }
    
    drawUI();
  }
  
  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }
  
  // Initialize
  initAudio();
  newMathQuestion();
  canvas.focus();
  message = 'Welcome Math Explorer! Click the correct answers to find treasures!';
  messageTimer = 4000;
  gameLoop();
  
})();