console.log("Game script loaded");

const stage = document.getElementById("game-of-the-day-stage");
stage.innerHTML = "";

const W = 720, H = 480;
const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
stage.appendChild(canvas);
const ctx = canvas.getContext("2d");

// Audio management with proper initialization
let audioInitialized = false;
let audioCtx;

function initAudio() {
    if (audioInitialized) return;
    
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioInitialized = true;
        console.log("Audio initialized successfully");
    } catch (error) {
        console.warn("Failed to initialize audio:", error);
    }
}

function playFootstepSound() {
    if (!audioInitialized) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.value = 200;
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch (error) {
        console.warn("Failed to play footstep sound:", error);
    }
}

function playCorrectSound() {
    if (!audioInitialized) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } catch (error) {
        console.warn("Failed to play correct sound:", error);
    }
}

function playWrongSound() {
    if (!audioInitialized) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'square';
        osc.frequency.value = 200;
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } catch (error) {
        console.warn("Failed to play wrong sound:", error);
    }
}

const tileSize = 60;
const cols = 12;
const rows = 8;

const explorer = {
    x: 5,
    y: 4,
    width: 48,
    height: 48,
    speed: 4,
    dir: "down",
    frame: 0,
    frameTick: 0,
    bob: 0,
    bobDir: 1
};

const creatures = ["Flora", "Bloop", "Zuzu", "Glimmer", "Plop"];
const creatureColors = ["#ff6f91", "#ff9671", "#ffc75f", "#8ac6d1", "#6a2c70"];

let mathQuestion = null;
let answerPositions = [];
let foundAnswer = false;
let score = 0;
let walkSteps = 0;

const plants = [
    { x: 2, y: 2 },
    { x: 9, y: 1 },
    { x: 3, y: 6 },
    { x: 7, y: 5 },
    { x: 10, y: 7 }
];

const backgroundColors = ["#cff7e7", "#d1c4e9", "#ffe082", "#ffd180", "#e1bee7"];
let bgColorIndex = 0;

const starfishCharacter = {
    x: 30,
    y: 400,
    size: 60,
    color: "#ffb347",
    pulse: 0,
    pulseDir: 1
};

function drawStarfish() {
    starfishCharacter.pulse += 0.03 * starfishCharacter.pulseDir;
    if (starfishCharacter.pulse > 0.4 || starfishCharacter.pulse < 0) {
        starfishCharacter.pulseDir *= -1;
    }
    
    const pulseSize = starfishCharacter.size * (1 + starfishCharacter.pulse * 0.1);
    
    ctx.fillStyle = starfishCharacter.color;
    ctx.shadowColor = "rgba(255,179,71,0.7)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    
    for (let i = 0; i < 5; i++) {
        const angle = Math.PI * 2 * i / 5 - Math.PI / 2;
        const x = starfishCharacter.x + Math.cos(angle) * pulseSize;
        const y = starfishCharacter.y + Math.sin(angle) * pulseSize;
        ctx.lineTo(x, y);
    }
    
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(starfishCharacter.x, starfishCharacter.y, pulseSize / 3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#6a2c70";
    ctx.beginPath();
    ctx.arc(starfishCharacter.x - 15, starfishCharacter.y - 5, 7, 0, Math.PI * 2);
    ctx.arc(starfishCharacter.x + 15, starfishCharacter.y - 5, 7, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(starfishCharacter.x - 15, starfishCharacter.y - 9, 3.5, 0, Math.PI * 2);
    ctx.arc(starfishCharacter.x + 15, starfishCharacter.y - 9, 3.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawPlant(x, y, color) {
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(46,125,50,0.4)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.ellipse(x + tileSize / 2, y + tileSize / 2, tileSize / 3, tileSize / 2.5, Math.PI / 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = "#2e7d32";
    ctx.beginPath();
    ctx.moveTo(x + tileSize / 2, y + tileSize / 2);
    ctx.lineTo(x + tileSize / 2, y + tileSize / 3);
    ctx.lineTo(x + tileSize / 2 + 12, y + tileSize / 3 + 6);
    ctx.fill();
}

function drawExplorer() {
    explorer.bob += 0.15 * explorer.bobDir;
    if (explorer.bob > 4 || explorer.bob < 0) {
        explorer.bobDir *= -1;
    }
    
    ctx.save();
    ctx.translate(explorer.x * tileSize + tileSize / 2, explorer.y * tileSize + tileSize / 2 - explorer.bob);
    
    ctx.fillStyle = "#fdd835";
    ctx.shadowColor = "rgba(253,216,53,0.75)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.strokeStyle = "#f9a825";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = "#6a1b9a";
    ctx.beginPath();
    ctx.moveTo(-12, 7);
    ctx.lineTo(12, 7);
    ctx.lineTo(12, 17);
    ctx.lineTo(-12, 17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = "#4527a0";
    ctx.beginPath();
    ctx.arc(-8, -2, 7, 0, Math.PI * 2);
    ctx.arc(8, -2, 7, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-8, -6, 3.5, 0, Math.PI * 2);
    ctx.arc(8, -6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function drawAnswerGem(x, y, text, highlight) {
    const baseX = x + tileSize / 2;
    const baseY = y + tileSize / 2;
    const glowSize = highlight ? 24 : 14;
    
    ctx.shadowColor = highlight ? "rgba(66,165,245,0.8)" : "rgba(144,202,249,0.5)";
    ctx.shadowBlur = glowSize;
    ctx.fillStyle = highlight ? "#42a5f5" : "#90caf9";
    
    ctx.beginPath();
    ctx.moveTo(baseX, baseY - tileSize / 2 * 0.85);
    ctx.lineTo(x + tileSize * 0.85, y + tileSize / 3);
    ctx.lineTo(x + tileSize * 0.6, y + tileSize);
    ctx.lineTo(x + tileSize * 0.4, y + tileSize);
    ctx.lineTo(x + tileSize * 0.15, y + tileSize / 3);
    ctx.closePath();
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = highlight ? "#fff" : "#000";
    ctx.font = "bold 26px Comic Sans MS";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, baseX, baseY);
}

function newMathQuestion() {
    const a = 1 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * 9);
    mathQuestion = { a, b, result: a + b };
    answerPositions = [];
    
    let answers = [mathQuestion.result];
    while (answers.length < 3) {
        let fake = 1 + Math.floor(Math.random() * 18);
        if (!answers.includes(fake)) {
            answers.push(fake);
        }
    }
    
    answers = answers.sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < 3; i++) {
        answerPositions.push({
            x: 1 + i * 4,
            y: 2,
            answer: answers[i]
        });
    }
    
    foundAnswer = false;
}

function drawBackground() {
    let grads = [];
    for (let i = 0; i < backgroundColors.length; i++) {
        const grd = ctx.createLinearGradient(0, 0, W, H);
        grd.addColorStop(0, backgroundColors[(bgColorIndex + i) % backgroundColors.length]);
        grd.addColorStop(1, backgroundColors[(bgColorIndex + i + 1) % backgroundColors.length]);
        grads.push(grd);
    }
    
    ctx.fillStyle = grads[0];
    ctx.fillRect(0, 0, W, H);
    
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            if ((i + j) % 2 === 0) {
                ctx.fillStyle = grads[1];
                ctx.fillRect(i * tileSize, j * tileSize, tileSize, tileSize);
            }
        }
    }
    
    for (let i = 0; i < plants.length; i++) {
        drawPlant(plants[i].x * tileSize, plants[i].y * tileSize, "#4caf50");
    }
    
    for (let i = 0; i < answerPositions.length; i++) {
        drawAnswerGem(
            answerPositions[i].x * tileSize,
            answerPositions[i].y * tileSize,
            answerPositions[i].answer,
            foundAnswer && mathQuestion.result === answerPositions[i].answer
        );
    }
    
    drawStarfish();
}

function drawUI() {
    ctx.fillStyle = "#1b5e20";
    ctx.font = "28px Comic Sans MS";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(27,94,32,0.7)";
    ctx.shadowBlur = 3;
    ctx.fillText(`Find the sum for Starfish!`, 14, 35);
    ctx.fillText(`${mathQuestion.a} + ${mathQuestion.b} = ?`, 14, 70);
    ctx.textAlign = "right";
    ctx.fillText(`Score: ${score}`, W - 15, 35);
    ctx.shadowBlur = 0;
}

let keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

document.addEventListener("keydown", e => {
    // Initialize audio on first key press
    if (!audioInitialized) {
        initAudio();
    }
    
    if (keys[e.key] !== undefined) {
        keys[e.key] = true;
        e.preventDefault();
    }
});

document.addEventListener("keyup", e => {
    if (keys[e.key] !== undefined) {
        keys[e.key] = false;
        e.preventDefault();
    }
});

function moveExplorer() {
    let moved = false;
    
    if (keys.ArrowUp && explorer.y > 0) {
        explorer.y -= 1;
        moved = true;
        explorer.dir = "up";
    } else if (keys.ArrowDown && explorer.y < rows - 1) {
        explorer.y += 1;
        moved = true;
        explorer.dir = "down";
    } else if (keys.ArrowLeft && explorer.x > 0) {
        explorer.x -= 1;
        moved = true;
        explorer.dir = "left";
    } else if (keys.ArrowRight && explorer.x < cols - 1) {
        explorer.x += 1;
        moved = true;
        explorer.dir = "right";
    }
    
    if (moved) {
        walkSteps++;
        playFootstepSound();
        
        if (walkSteps % 5 === 0) {
            bgColorIndex = (bgColorIndex + 1) % backgroundColors.length;
        }
        
        checkAnswerCollision();
    }
}

function checkAnswerCollision() {
    for (let i = 0; i < answerPositions.length; i++) {
        if (answerPositions[i].x === explorer.x && answerPositions[i].y === explorer.y) {
            if (answerPositions[i].answer === mathQuestion.result && !foundAnswer) {
                playCorrectSound();
                score++;
                foundAnswer = true;
                setTimeout(newMathQuestion, 2000);
            } else if (!foundAnswer) {
                playWrongSound();
            }
        }
    }
}

function gameLoop(time = 0) {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawExplorer();
    drawUI();
    moveExplorer();
    requestAnimationFrame(gameLoop);
}

// Initialize game
newMathQuestion();
gameLoop();