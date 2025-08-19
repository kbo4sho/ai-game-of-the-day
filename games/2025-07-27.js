const stage = document.getElementById("game-of-the-day-stage");
stage.innerHTML = "";

const canvas = document.createElement("canvas");
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);

const ctx = canvas.getContext("2d");
const bw = 720, bh = 480;

const colors = {
    background: "#a3d9ff",
    ground: "#4f7a3a",
    tree: "#2c5115",
    leaves: "#3ab54a",
    river: "#2a76b9",
    character: "#f48c3b",
    text: "#242424",
    cloud: "#f0f4f8",
    mountain1: "#7f6a57",
    mountain2: "#664f3d",
    mountainHighlight: "#d6c4aa",
    questionBoxBg: "#f9f9f9",
    questionBoxBorder: "#333333"
};

// Game state
let score = 0;
let currentQuestion = 0;
let gameStarted = false;
let characterX = 100;
let characterY = 350;
let characterSpeed = 3;
let jumping = false;
let jumpVelocity = 0;
const gravity = 0.8;
const groundY = 350;

// Math questions
const questions = [
    { question: "What is 7 + 8?", answer: 15, options: [12, 15, 17, 20] },
    { question: "What is 12 - 5?", answer: 7, options: [5, 7, 8, 10] },
    { question: "What is 4 × 6?", answer: 24, options: [20, 24, 28, 30] },
    { question: "What is 18 ÷ 3?", answer: 6, options: [4, 6, 8, 9] },
    { question: "What is 9 + 11?", answer: 20, options: [18, 20, 22, 25] }
];

// Obstacles
let obstacles = [];
let obstacleSpeed = 2;

// Input handling
let keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' && !jumping) {
        jumping = true;
        jumpVelocity = -15;
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// Game functions
function drawBackground() {
    // Sky
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, bw, bh);
    
    // Mountains
    ctx.fillStyle = colors.mountain1;
    ctx.beginPath();
    ctx.moveTo(0, 300);
    ctx.lineTo(200, 200);
    ctx.lineTo(400, 250);
    ctx.lineTo(600, 180);
    ctx.lineTo(720, 220);
    ctx.lineTo(720, 300);
    ctx.closePath();
    ctx.fill();
    
    // Mountain highlights
    ctx.fillStyle = colors.mountainHighlight;
    ctx.beginPath();
    ctx.moveTo(50, 280);
    ctx.lineTo(150, 220);
    ctx.lineTo(200, 200);
    ctx.lineTo(200, 300);
    ctx.closePath();
    ctx.fill();
    
    // Ground
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, 350, bw, 130);
    
    // River
    ctx.fillStyle = colors.river;
    ctx.fillRect(0, 380, bw, 30);
}

function drawCharacter() {
    ctx.fillStyle = colors.character;
    ctx.fillRect(characterX, characterY, 30, 40);
    
    // Eyes
    ctx.fillStyle = colors.text;
    ctx.fillRect(characterX + 8, characterY + 8, 4, 4);
    ctx.fillRect(characterX + 18, characterY + 8, 4, 4);
}

function drawObstacles() {
    ctx.fillStyle = colors.tree;
    obstacles.forEach(obstacle => {
        ctx.fillRect(obstacle.x, obstacle.y, 20, 40);
    });
}

function drawUI() {
    ctx.fillStyle = colors.text;
    ctx.font = "24px Arial";
    ctx.fillText(`Score: ${score}`, 20, 40);
    
    if (!gameStarted) {
        ctx.fillStyle = colors.questionBoxBg;
        ctx.fillRect(200, 150, 320, 180);
        ctx.strokeStyle = colors.questionBoxBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(200, 150, 320, 180);
        
        ctx.fillStyle = colors.text;
        ctx.font = "20px Arial";
        ctx.fillText("Math Adventure!", 280, 180);
        ctx.font = "16px Arial";
        ctx.fillText("Press SPACE to jump", 250, 220);
        ctx.fillText("Answer math questions", 240, 250);
        ctx.fillText("to earn points!", 260, 280);
        ctx.fillText("Press any key to start", 240, 320);
    }
}

function updateCharacter() {
    // Horizontal movement
    if (keys['ArrowLeft'] || keys['KeyA']) {
        characterX -= characterSpeed;
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
        characterX += characterSpeed;
    }
    
    // Keep character in bounds
    characterX = Math.max(0, Math.min(bw - 30, characterX));
    
    // Jumping physics
    if (jumping) {
        characterY += jumpVelocity;
        jumpVelocity += gravity;
        
        if (characterY >= groundY) {
            characterY = groundY;
            jumping = false;
            jumpVelocity = 0;
        }
    }
}

function updateObstacles() {
    // Move obstacles
    obstacles.forEach(obstacle => {
        obstacle.x -= obstacleSpeed;
    });
    
    // Remove off-screen obstacles
    obstacles = obstacles.filter(obstacle => obstacle.x > -20);
    
    // Add new obstacles
    if (Math.random() < 0.02) {
        obstacles.push({
            x: bw,
            y: groundY - 40
        });
    }
}

function checkCollisions() {
    obstacles.forEach(obstacle => {
        if (characterX < obstacle.x + 20 &&
            characterX + 30 > obstacle.x &&
            characterY < obstacle.y + 40 &&
            characterY + 40 > obstacle.y) {
            // Collision detected
            score = Math.max(0, score - 10);
            obstacles = obstacles.filter(o => o !== obstacle);
        }
    });
}

function gameLoop() {
    // Clear canvas
    ctx.clearRect(0, 0, bw, bh);
    
    // Draw everything
    drawBackground();
    drawObstacles();
    drawCharacter();
    drawUI();
    
    if (gameStarted) {
        updateCharacter();
        updateObstacles();
        checkCollisions();
        
        // Increase score over time
        score += 0.1;
    }
    
    requestAnimationFrame(gameLoop);
}

// Start the game
gameLoop();

// Start game on any key press
document.addEventListener('keydown', () => {
    if (!gameStarted) {
        gameStarted = true;
    }
});