console.log("Game script loaded");

const stage = document.getElementById('game-of-the-day-stage');
stage.innerHTML = '';

const canvas = document.createElement('canvas');
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

// Audio management with proper initialization
let audioInitialized = false;
let bgMusic, correctSound, wrongSound;

function initAudio() {
    if (audioInitialized) return;
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create background music
        const bgOsc = audioContext.createOscillator();
        const bgGain = audioContext.createGain();
        bgOsc.connect(bgGain);
        bgGain.connect(audioContext.destination);
        bgOsc.type = 'sine';
        bgOsc.frequency.value = 220;
        bgGain.gain.value = 0.02;
        bgOsc.start();
        
        // Create correct sound
        const correctOsc = audioContext.createOscillator();
        const correctGain = audioContext.createGain();
        correctOsc.connect(correctGain);
        correctGain.connect(audioContext.destination);
        correctOsc.type = 'sine';
        correctOsc.frequency.value = 800;
        correctGain.gain.value = 0.1;
        
        // Create wrong sound
        const wrongOsc = audioContext.createOscillator();
        const wrongGain = audioContext.createGain();
        wrongOsc.connect(wrongGain);
        wrongGain.connect(audioContext.destination);
        wrongOsc.type = 'square';
        wrongOsc.frequency.value = 200;
        wrongGain.gain.value = 0.1;
        
        // Store audio objects
        bgMusic = { osc: bgOsc, gain: bgGain };
        correctSound = { osc: correctOsc, gain: correctGain };
        wrongSound = { osc: wrongOsc, gain: wrongGain };
        
        audioInitialized = true;
        console.log("Audio initialized successfully");
        
    } catch (error) {
        console.warn("Failed to initialize audio:", error);
    }
}

function playSound(correct) {
    if (!audioInitialized) return;
    
    try {
        const sound = correct ? correctSound : wrongSound;
        const audioContext = sound.osc.context;
        const tempOsc = audioContext.createOscillator();
        const tempGain = audioContext.createGain();
        
        tempOsc.connect(tempGain);
        tempGain.connect(audioContext.destination);
        
        tempOsc.type = sound.osc.type;
        tempOsc.frequency.value = sound.osc.frequency.value;
        tempGain.gain.setValueAtTime(sound.gain.gain.value, audioContext.currentTime);
        tempGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        
        tempOsc.start();
        tempOsc.stop(audioContext.currentTime + 0.3);
        
    } catch (error) {
        console.warn("Failed to play sound:", error);
    }
}

function playJumpSound() {
    if (!audioInitialized) return;
    
    try {
        const audioContext = correctSound.osc.context;
        const tempOsc = audioContext.createOscillator();
        const tempGain = audioContext.createGain();
        
        tempOsc.connect(tempGain);
        tempGain.connect(audioContext.destination);
        
        tempOsc.type = 'triangle';
        tempOsc.frequency.value = 400;
        tempGain.gain.setValueAtTime(0.1, audioContext.currentTime);
        tempGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        
        tempOsc.start();
        tempOsc.stop(audioContext.currentTime + 0.2);
        
    } catch (error) {
        console.warn("Failed to play jump sound:", error);
    }
}

const explorer = {
    x: 50,
    y: 400,
    width: 48,
    height: 64,
    color: '#ff704d',
    velX: 0,
    velY: 0,
    jumping: false,
    onGround: false,
    img: null,
    frame: 0,
    frameCount: 4,
    frameTimer: 0,
    frameInterval: 10
};

const friend = {
    x: 600,
    y: 400,
    width: 48,
    height: 64,
    color: '#4da6ff',
    img: null,
    frame: 0,
    frameCount: 4,
    frameTimer: 0,
    frameInterval: 20
};

const terrain = [];
let keys = [];
let gravity = 0.8;
let friction = 0.75;
let currentQuestion = null;
let questionAnswered = false;
const fontFamily = 'Comic Sans MS, cursive, sans-serif';
let messages = [];

function loadImages() {
    explorer.img = new Image();
    explorer.img.onload = () => console.log("Explorer image loaded");
    explorer.img.onerror = () => console.warn("Failed to load explorer image, using fallback");
    explorer.img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA0OCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNmZjcwNGQiLz4KPGNpcmNsZSBjeD0iMTgiIGN5PSIyMCIgcj0iNCIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMzAiIGN5PSIyMCIgcj0iNCIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMjQiIGN5PSIzMCIgcj0iMyIgZmlsbD0iYmxhY2siLz4KPC9zdmc+';
    
    friend.img = new Image();
    friend.img.onload = () => console.log("Friend image loaded");
    friend.img.onerror = () => console.warn("Failed to load friend image, using fallback");
    friend.img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA0OCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiM0ZGE2ZmYiLz4KPGNpcmNsZSBjeD0iMTgiIGN5PSIyMCIgcj0iNCIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMzAiIGN5PSIyMCIgcj0iNCIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMjQiIGN5PSIzMCIgcj0iMyIgZmlsbD0iYmxhY2siLz4KPC9zdmc+';
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createTerrain() {
    terrain.push({ x: 0, y: 460, width: 720, height: 20, color: '#6a4a3c' });
    terrain.push({ x: 200, y: 380, width: 100, height: 20, color: '#b4a57a' });
    terrain.push({ x: 360, y: 320, width: 120, height: 20, color: '#7897ab' });
    terrain.push({ x: 540, y: 380, width: 100, height: 20, color: '#e7b89c' });
}

function drawRect(r) {
    ctx.fillStyle = r.color;
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 8;
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
}

function drawExplorer() {
    if (explorer.img.complete && explorer.img.naturalWidth > 0) {
        explorer.frameTimer++;
        if (explorer.frameTimer >= explorer.frameInterval) {
            explorer.frame++;
            explorer.frameTimer = 0;
            if (explorer.frame >= explorer.frameCount) explorer.frame = 0;
        }
        ctx.drawImage(explorer.img, explorer.frame * 48, 0, 48, 64, explorer.x, explorer.y, explorer.width, explorer.height);
    } else {
        // Fallback drawing
        ctx.fillStyle = explorer.color;
        ctx.fillRect(explorer.x, explorer.y, explorer.width, explorer.height);
        
        // Draw simple face
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(explorer.x + 8, explorer.y + 8, 4, 0, Math.PI * 2);
        ctx.arc(explorer.x + 40, explorer.y + 8, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(explorer.x + 8, explorer.y + 8, 2, 0, Math.PI * 2);
        ctx.arc(explorer.x + 40, explorer.y + 8, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawFriend() {
    if (friend.img.complete && friend.img.naturalWidth > 0) {
        friend.frameTimer++;
        if (friend.frameTimer >= friend.frameInterval) {
            friend.frame++;
            friend.frameTimer = 0;
            if (friend.frame >= friend.frameCount) friend.frame = 0;
        }
        ctx.drawImage(friend.img, friend.frame * 48, 0, 48, 64, friend.x, friend.y, friend.width, friend.height);
    } else {
        // Fallback drawing
        ctx.fillStyle = friend.color;
        ctx.fillRect(friend.x, friend.y, friend.width, friend.height);
        
        // Draw simple face
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(friend.x + 8, friend.y + 8, 4, 0, Math.PI * 2);
        ctx.arc(friend.x + 40, friend.y + 8, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(friend.x + 8, friend.y + 8, 2, 0, Math.PI * 2);
        ctx.arc(friend.x + 40, friend.y + 8, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawMessage(text, x, y, color = '#333') {
    ctx.fillStyle = color;
    ctx.font = '22px ' + fontFamily;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
}

function drawQuestion() {
    if (!currentQuestion) return;
    
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 10;
    ctx.fillRect(140, 10, 440, 90);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#5B5B5B';
    ctx.lineWidth = 2;
    ctx.strokeRect(140, 10, 440, 90);
    
    ctx.fillStyle = '#222';
    ctx.font = '22px ' + fontFamily;
    ctx.fillText('Solve to help Explorer collect the treasure:', 180, 48);
    ctx.font = '30px ' + fontFamily;
    ctx.fillStyle = '#2a3745';
    ctx.fillText(currentQuestion.text, 320, 83);
}

function drawTreasures() {
    for (let t of treasures) {
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(t.x, t.y, 8, t.x, t.y, 16);
        gradient.addColorStop(0, t.color);
        gradient.addColorStop(1, '#222');
        ctx.fillStyle = gradient;
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 6;
        ctx.arc(t.x, t.y, 16, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px ' + fontFamily;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.symbol, t.x, t.y);
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

function updateExplorer() {
    explorer.velY += gravity;
    explorer.x += explorer.velX;
    explorer.y += explorer.velY;
    explorer.velX *= friction;
    
    if (explorer.x < 0) explorer.x = 0;
    if (explorer.x + explorer.width > canvas.width) explorer.x = canvas.width - explorer.width;
    
    explorer.onGround = false;
    for (let plat of terrain) {
        if (explorer.x + explorer.width > plat.x && explorer.x < plat.x + plat.width) {
            if (explorer.y + explorer.height >= plat.y && explorer.y + explorer.height <= plat.y + explorer.velY + gravity) {
                explorer.y = plat.y - explorer.height;
                explorer.velY = 0;
                explorer.jumping = false;
                explorer.onGround = true;
            }
        }
    }
    
    if (explorer.y + explorer.height > canvas.height) {
        explorer.y = canvas.height - explorer.height;
        explorer.velY = 0;
        explorer.jumping = false;
        explorer.onGround = true;
    }
}

function checkCollision(a, b) {
    return a.x < a.x + b.width && a.x + a.width > b.x && a.y < a.y + b.height && a.y + a.height > b.y;
}

function rectCircleColliding(rect, circle) {
    var distX = Math.abs(circle.x - (rect.x + rect.width / 2));
    var distY = Math.abs(circle.y - (rect.y + rect.height / 2));
    if (distX > rect.width / 2 + circle.radius) {
        return false;
    }
    if (distY > rect.height / 2 + circle.radius) {
        return false;
    }
    if (distX <= rect.width / 2) {
        return true;
    }
    if (distY <= rect.height / 2) {
        return true;
    }
    var dx = distX - rect.width / 2;
    var dy = distY - rect.height / 2;
    return (dx * dx + dy * dy <= circle.radius * circle.radius);
}

let treasures = [];

function generateTreasures() {
    treasures = [];
    let symbols = ['+', '-', '×', '÷'];
    let colors = ['#ffd166', '#06d6a0', '#ef476f', '#118ab2'];
    for (let i = 0; i < 4; i++) {
        treasures.push({
            x: 250 + 150 * i,
            y: 340,
            radius: 16,
            symbol: symbols[i],
            color: colors[i],
            collected: false
        });
    }
}

function resetQuestion() {
    let a = randomInt(1, 10);
    let b = randomInt(1, 10);
    let opIndex = randomInt(0, 3);
    let op, symbol, result;
    
    if (opIndex === 0) {
        op = (x, y) => x + y;
        symbol = '+';
        result = a + b;
    } else if (opIndex === 1) {
        op = (x, y) => x - y;
        symbol = '-';
        result = a - b;
    } else if (opIndex === 2) {
        op = (x, y) => x * y;
        symbol = '×';
        result = a * b;
    } else {
        a = a * b;
        op = (x, y) => x / y;
        symbol = '÷';
        result = b;
    }
    
    currentQuestion = {
        a, b, symbol, result,
        text: `${a} ${symbol} ${b} = ?`,
        op,
        answered: false
    };
    
    treasures.forEach(t => t.collected = false);
    questionAnswered = false;
}

function handleInput() {
    if (keys['ArrowRight']) {
        explorer.velX += 0.7;
        if (explorer.velX > 5) explorer.velX = 5;
    }
    if (keys['ArrowLeft']) {
        explorer.velX -= 0.7;
        if (explorer.velX < -5) explorer.velX = -5;
    }
    if (keys['ArrowUp'] || keys[' ']) {
        if (!explorer.jumping && explorer.onGround) {
            explorer.velY = -15;
            explorer.jumping = true;
            explorer.onGround = false;
            playJumpSound();
        }
    }
}

function checkTreasureCollection() {
    for (let t of treasures) {
        if (!t.collected) {
            let distX = explorer.x + explorer.width / 2 - t.x;
            let distY = explorer.y + explorer.height / 2 - t.y;
            let dist = Math.sqrt(distX * distX + distY * distY);
            if (dist < 32) {
                t.collected = true;
                if (!questionAnswered) {
                    currentQuestion.selected = t.symbol;
                    messages.push({ text: `You chose ${t.symbol} to solve!`, time: 0, color: '#176932' });
                    playSound(true);
                    checkAnswer(t.symbol);
                }
            }
        }
    }
}

function checkAnswer(symbol) {
    if (symbol === currentQuestion.symbol) {
        questionAnswered = true;
        messages.push({ text: 'Correct! The treasure is yours!', time: 0, color: '#0a802a' });
        playSound(true);
        setTimeout(() => {
            resetQuestion();
        }, 3000);
    } else {
        messages.push({ text: 'Oops! Try again by walking to the right treasure.', time: 0, color: '#b03030' });
        playSound(false);
    }
}

function drawMessages() {
    for (let i = messages.length - 1; i >= 0; i--) {
        let m = messages[i];
        ctx.globalAlpha = 1 - Math.min(m.time / 300, 1);
        drawMessage(m.text, 15, 430 - 30 * i, m.color || '#222');
        m.time += 1;
        if (m.time > 300) messages.splice(i, 1);
    }
    ctx.globalAlpha = 1;
}

function drawBackground() {
    let skyGradient = ctx.createLinearGradient(0, 0, 0, 300);
    skyGradient.addColorStop(0, '#89c4f4');
    skyGradient.addColorStop(1, '#ddeefd');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#457b9d';
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 9;
    ctx.fillRect(0, 460, canvas.width, 20);
    ctx.shadowBlur = 0;
    
    ctx.beginPath();
    ctx.fillStyle = '#f4a261';
    ctx.ellipse(100, 110, 42, 62, Math.PI / 6, 0, 2 * Math.PI);
    ctx.shadowColor = 'rgba(252, 145, 54, 0.22)';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.beginPath();
    ctx.fillStyle = '#ffba08';
    ctx.ellipse(680, 80, 32, 48, -Math.PI / 4, 0, 2 * Math.PI);
    ctx.shadowColor = 'rgba(255, 189, 8, 0.36)';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.shadowColor = '';
    ctx.fillStyle = '#ffffff55';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(100 + Math.cos(performance.now() / 2000 + i * 1.1) * 15, 110 + Math.sin(performance.now() / 1400 + i * 1.5) * 10, 2.7, 0, 2 * Math.PI);
        ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(680 + Math.cos(performance.now() / 1500 + i * 1.3) * 12, 80 + Math.sin(performance.now() / 1800 + i * 1.8) * 15, 2, 0, 2 * Math.PI);
        ctx.fill();
    }
}

// Event listeners
window.addEventListener('keydown', e => {
    // Initialize audio on first key press
    if (!audioInitialized) {
        initAudio();
    }
    
    keys[e.key] = true;
});

window.addEventListener('keyup', e => {
    keys[e.key] = false;
});

// Initialize game
loadImages();
createTerrain();
generateTreasures();
resetQuestion();

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawRect(terrain[0]);
    for (let i = 1; i < terrain.length; i++) {
        drawRect(terrain[i]);
    }
    drawTreasures();
    drawExplorer();
    drawFriend();
    drawQuestion();
    drawMessages();
    handleInput();
    updateExplorer();
    checkTreasureCollection();
    requestAnimationFrame(gameLoop);
}

gameLoop();