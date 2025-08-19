console.log("Magical Math Forest game loaded");

const stage = document.getElementById('game-of-the-day-stage');
stage.innerHTML = '';

const w = 720;
const h = 480;
const canvas = document.createElement('canvas');
canvas.width = w;
canvas.height = h;
stage.appendChild(canvas);
const ctx = canvas.getContext('2d');

// Game state
let gameStarted = false;

// World configuration
const worldMap = {
    cols: 8,
    rows: 5,
    tileSize: 90
};

// Game objects
const explorer = {
    x: 0,
    y: 4,
    size: 60,
    color: '#FF6F61'
};

const creatures = [
    { name: 'Blinko', color: '#6A5ACD' },
    { name: 'Squizzle', color: '#FFB347' },
    { name: 'Fluffo', color: '#77DD77' },
    { name: 'Zappy', color: '#FF6961' },
    { name: 'Glimo', color: '#AEC6CF' }
];

const mathZone = {
    x: 3,
    y: 2,
    task: null,
    answered: false
};

// Game state variables
let keys = {};
let questionText = '';
let userAnswer = '';
let exploring = true;
let score = 0;
let messageTimeout = 0;

const greetings = [
    'Hi explorer!',
    'Ready to find Blinko?',
    'Let\'s solve puzzles to befriend creatures!',
    'Math can unlock secrets here!'
];

let greetingTimer = 0;
let greetingIndex = 0;
let explorerPulse = 0;
let pulseDirection = 1;

// Background particles (simplified)
const bgParticles = [];
for (let i = 0; i < 20; i++) {
    bgParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        rad: Math.random() * 2 + 1,
        speed: Math.random() * 0.3 + 0.1,
        alpha: Math.random() * 0.6 + 0.2
    });
}

function drawBackground() {
    // Main background
    ctx.fillStyle = '#14232f';
    ctx.fillRect(0, 0, w, h);
    
    // Animated particles
    for (let p of bgParticles) {
        p.y -= p.speed;
        p.alpha += 0.005 * p.speed;
        p.alpha = Math.min(1, Math.max(0.2, p.alpha));
        
        if (p.y < 0) {
            p.x = Math.random() * w;
            p.y = h;
            p.speed = Math.random() * 0.3 + 0.1;
        }
        
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(p.x, p.y, p.rad / 4, p.x, p.y, p.rad);
        gradient.addColorStop(0, 'rgba(255,255,255,' + p.alpha + ')');
        gradient.addColorStop(1, 'rgba(20,35,47,0)');
        ctx.fillStyle = gradient;
        ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Ground gradient
    const grd = ctx.createLinearGradient(0, h - 40, 0, h);
    grd.addColorStop(0, '#14472b');
    grd.addColorStop(1, '#0c2a1b');
    ctx.fillStyle = grd;
    ctx.fillRect(0, worldMap.rows * worldMap.tileSize - 40, w, 40);
    
    // Title
    ctx.fillStyle = '#aad3a6';
    ctx.font = '28px Comic Sans MS';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 5;
    ctx.fillText('Magical Math Forest', 10, h - 15);
    ctx.shadowBlur = 0;
}

function drawExplorer() {
    explorerPulse += pulseDirection * 0.05;
    if (explorerPulse > 0.3 || explorerPulse < -0.3) {
        pulseDirection *= -1;
    }
    
    const px = explorer.x * worldMap.tileSize + worldMap.tileSize / 2;
    const py = explorer.y * worldMap.tileSize + worldMap.tileSize / 2;
    
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(1 + explorerPulse, 1 + explorerPulse);
    
    // Explorer body
    ctx.beginPath();
    const gradient = ctx.createRadialGradient(0, 0, explorer.size / 4, 0, 0, explorer.size / 2);
    gradient.addColorStop(0, explorer.color);
    gradient.addColorStop(1, '#9e3831');
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(255,111,97,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.arc(0, 0, explorer.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Explorer face
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👦', 0, 5);
    
    ctx.restore();
}

function drawCreature(creature, x, y) {
    ctx.save();
    ctx.translate(x + worldMap.tileSize / 2, y + worldMap.tileSize / 2);
    
    // Creature body with animation
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = creature.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 40, Math.sin(Date.now() / 1000 + x) * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Creature eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-15, -10, 8, 0, Math.PI * 2);
    ctx.arc(15, -10, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-15, -10, 4, 0, Math.PI * 2);
    ctx.arc(15, -10, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Creature name
    ctx.fillStyle = '#222';
    ctx.font = '22px Comic Sans MS';
    ctx.textAlign = 'center';
    ctx.fillText(creature.name, 0, 45);
    
    ctx.restore();
}

function drawMathZone() {
    const x = mathZone.x * worldMap.tileSize;
    const y = mathZone.y * worldMap.tileSize;
    const pulse = Math.sin(Date.now() / 500) * 0.5 + 0.5;
    const color = `rgba(255,255,150,${0.3 + pulse * 0.3})`;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(255,255,102,0.25)';
    ctx.fillRect(x, y, worldMap.tileSize, worldMap.tileSize);
    ctx.strokeRect(x + 3, y + 3, worldMap.tileSize - 6, worldMap.tileSize - 6);
    ctx.shadowBlur = 0;
}

function drawUI() {
    // Top UI bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, w, 50);
    
    // Score
    ctx.fillStyle = '#DFDCE3';
    ctx.font = '26px Comic Sans MS';
    ctx.textBaseline = 'middle';
    ctx.fillText('Score: ' + score, 10, 27);
    
    // Greeting message
    if (exploring) {
        ctx.fillStyle = 'rgba(223,222,226,0.85)';
        ctx.font = 'italic 26px Comic Sans MS';
        ctx.fillText(greetings[greetingIndex], w / 2 - ctx.measureText(greetings[greetingIndex]).width / 2, 27);
    }
    
    // Math question dialog
    if (!exploring && mathZone.task) {
        ctx.fillStyle = '#2B1B3F';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 15;
        ctx.fillRect(100, 100, 520, 280);
        ctx.shadowBlur = 0;
        
        ctx.strokeStyle = '#8B65A6';
        ctx.lineWidth = 5;
        ctx.strokeRect(100, 100, 520, 280);
        
        ctx.fillStyle = '#EEDFCC';
        ctx.font = '28px Comic Sans MS';
        ctx.textAlign = 'left';
        ctx.fillText("Help Blinko by solving:", 120, 150);
        
        ctx.font = '56px Comic Sans MS';
        ctx.fillStyle = '#A687C0';
        ctx.fillText(mathZone.task.question, 120, 220);
        
        ctx.font = '40px Comic Sans MS';
        ctx.fillStyle = '#BFD7EA';
        ctx.fillText("Your answer: " + userAnswer, 120, 280);
        
        ctx.font = '20px Comic Sans MS';
        ctx.fillStyle = '#BFD7EA';
        ctx.fillText("(Type number and press Enter)", 120, 320);
        ctx.textAlign = 'start';
    }
}

function chooseTask() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    mathZone.task = {
        a: a,
        b: b,
        question: `${a} + ${b} = ?`,
        answer: (a + b).toString()
    };
    mathZone.answered = false;
    userAnswer = '';
}

function checkAnswer() {
    if (userAnswer === mathZone.task.answer) {
        score += 1;
        mathZone.answered = true;
        setTimeout(() => {
            exploring = true;
            mathZone.task = null;
            greetingIndex = 0;
        }, 1500);
    } else {
        userAnswer = '';
    }
}

function update() {
    if (exploring) {
        // Handle movement
        if (keys['ArrowLeft'] && explorer.x > 0) {
            explorer.x -= 1;
            greetingIndex = 0;
        }
        if (keys['ArrowRight'] && explorer.x < worldMap.cols - 1) {
            explorer.x += 1;
            greetingIndex = 0;
        }
        if (keys['ArrowUp'] && explorer.y > 0) {
            explorer.y -= 1;
            greetingIndex = 0;
        }
        if (keys['ArrowDown'] && explorer.y < worldMap.rows - 1) {
            explorer.y += 1;
            greetingIndex = 0;
        }
        
        // Check if explorer entered math zone
        if (explorer.x === mathZone.x && explorer.y === mathZone.y) {
            exploring = false;
            chooseTask();
        }
    }
    
    // Update greeting rotation
    if (greetingTimer++ > 180) {
        greetingTimer = 0;
        greetingIndex = (greetingIndex + 1) % greetings.length;
    }
    
    draw();
    requestAnimationFrame(update);
}

function draw() {
    drawBackground();
    drawMathZone();
    
    // Draw creatures
    for (let i = 0; i < creatures.length; i++) {
        const cx = (i + 1) * worldMap.tileSize;
        const cy = 0;
        drawCreature(creatures[i], cx, cy);
    }
    
    drawExplorer();
    drawUI();
}

// Event listeners
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    
    if (!exploring && mathZone.task) {
        if (e.key >= '0' && e.key <= '9') {
            if (userAnswer.length < 3) {
                userAnswer += e.key;
            }
        } else if (e.key === 'Backspace') {
            userAnswer = userAnswer.slice(0, -1);
        } else if (e.key === 'Enter') {
            checkAnswer();
        }
    }
});

window.addEventListener('keyup', e => {
    keys[e.key] = false;
});

// Initialize and start the game
console.log("Starting Magical Math Forest game...");
update();