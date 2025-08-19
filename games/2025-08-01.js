console.log("Game script loaded");

const stage = document.getElementById("game-of-the-day-stage");
stage.innerHTML = "";

const canvas = document.createElement("canvas");
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);
const ctx = canvas.getContext("2d");

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgMusicGain, bgMusicOsc;

function createOsc(freq, type = "sine") {
    const osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    return osc;
}

function playTone(freq, duration) {
    const osc = createOsc(freq, "triangle");
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
    osc.stop(audioCtx.currentTime + duration / 1000);
}

function playCorrectSound() {
    const osc = createOsc(880, "triangle");
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.frequency.setTargetAtTime(1320, audioCtx.currentTime, 0.03);
    osc.stop(audioCtx.currentTime + 0.3);
}

function playWrongSound() {
    const osc = createOsc(180, "sawtooth");
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.frequency.setTargetAtTime(140, audioCtx.currentTime + 0.15, 0.02);
    osc.stop(audioCtx.currentTime + 0.3);
}

function playCollectSound() {
    const osc = createOsc(523, "triangle");
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.frequency.setTargetAtTime(700, audioCtx.currentTime, 0.04);
    osc.stop(audioCtx.currentTime + 0.2);
}

function playBgMusic() {
    if (bgMusicOsc) bgMusicOsc.stop();
    bgMusicOsc = audioCtx.createOscillator();
    bgMusicGain = audioCtx.createGain();
    bgMusicOsc.type = "triangle";
    bgMusicOsc.frequency.value = 110;
    bgMusicOsc.connect(bgMusicGain);
    bgMusicGain.connect(audioCtx.destination);
    bgMusicGain.gain.value = 0.025;
    bgMusicOsc.start();
}

function stopBgMusic() {
    if (bgMusicOsc) {
        bgMusicOsc.stop();
        bgMusicOsc = null;
    }
}

// Initialize audio after user interaction
let audioInitialized = false;
function initAudio() {
    if (audioInitialized) return;
    
    try {
        playBgMusic();
        audioInitialized = true;
        console.log("Audio initialized successfully");
    } catch (error) {
        console.warn("Failed to initialize audio:", error);
    }
}

// Image loading with error handling
const explorerImg = new Image();
const critterImg = new Image();
const treasureImg = new Image();

explorerImg.onload = () => console.log("Explorer image loaded");
explorerImg.onerror = () => console.warn("Failed to load explorer image, using fallback");
explorerImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNTgiIHZpZXdCb3g9IjAgMCA0OCA1OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiMzZjUxYjUiLz4KPGNpcmNsZSBjeD0iMTgiIGN5PSIyMCIgcj0iNCIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMzAiIGN5PSIyMCIgcj0iNCIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMjQiIGN5PSIzMCIgcj0iMyIgZmlsbD0iYmxhY2siLz4KPC9zdmc+';

critterImg.onload = () => console.log("Critter image loaded");
critterImg.onerror = () => console.warn("Failed to load critter image, using fallback");
critterImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNmZjY2NjYiLz4KPGNpcmNsZSBjeD0iMTUiIGN5PSIxOCIgcj0iMyIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMjUiIGN5PSIxOCIgcj0iMyIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMTUiIGN5PSIxOCIgcj0iMS41IiBmaWxsPSJibGFjayIvPgo8Y2lyY2xlIGN4PSIyNSIgY3k9IjE4IiByPSIxLjUiIGZpbGw9ImJsYWNrIi8+Cjwvc3ZnPg==';

treasureImg.onload = () => console.log("Treasure image loaded");
treasureImg.onerror = () => console.warn("Failed to load treasure image, using fallback");
treasureImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE2IDJMMjAgMTJIMTJMMTYgMloiIGZpbGw9ImdvbGQiLz4KPHBhdGggZD0iTTQgMTZMMTIgMTJIMjBMMjggMTZMMjAgMjBIMTJMNCAxNloiIGZpbGw9ImdvbGQiLz4KPC9zdmc+';

const groundColor = "#f1f8e9";
const skyColor = "#81d4fa";
const hillsColor = "#4caf50";
const pathColor = "#caa66a";
const crittersColors = ["#ef5350", "#ab47bc", "#42a5f5", "#26a69a", "#ffca28"];
const fonts = "Comic Sans MS, cursive, sans-serif";

const starCount = 80;
const stars = [];
for (let i = 0; i < starCount; i++) {
    stars.push({
        x: Math.random() * 720,
        y: Math.random() * 350,
        radius: Math.random() * 1.3 + 0.4,
        alpha: Math.random() * 0.7 + 0.3,
        delta: (Math.random() * 0.02 + 0.005)
    });
}

const explorer = {
    x: 360,
    y: 400,
    width: 48,
    height: 58,
    speed: 4,
    dirX: 0,
    dirY: 0
};

let critters = [];
let treasures = [];
let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let showAnswerFeedback = 0;
let answerCorrect = null;

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function createCritters() {
    critters = [];
    for (let i = 0; i < 6; i++) {
        const cx = randomInt(50, 670);
        const cy = randomInt(150, 380);
        const num1 = randomInt(1, 9);
        const num2 = randomInt(1, 9);
        const correctAnswer = num1 + num2;
        critters.push({
            x: cx,
            y: cy,
            width: 40,
            height: 40,
            color: crittersColors[i % crittersColors.length],
            num1,
            num2,
            correctAnswer,
            answered: false,
            angle: Math.random() * Math.PI * 2,
            angleSpeed: 0.006 + Math.random() * 0.006
        });
    }
}

function createTreasures() {
    treasures = [];
    for (let i = 0; i < 6; i++) {
        const cx = randomInt(50, 670);
        const cy = randomInt(150, 380);
        treasures.push({
            x: cx,
            y: cy,
            width: 32,
            height: 32,
            found: false,
            rotate: 0,
            rotateSpeed: 0.008 + Math.random() * 0.012
        });
    }
}

function createQuestions() {
    questions = [];
    for (let i = 0; i < critters.length; i++) {
        const c = critters[i];
        questions.push({
            text: `What is ${c.num1} + ${c.num2}?`,
            answer: c.correctAnswer,
            critterIndex: i
        });
    }
}

function drawBackground() {
    ctx.fillStyle = skyColor;
    ctx.fillRect(0, 0, 720, 480);
    
    ctx.fillStyle = "#001022";
    ctx.fillRect(0, 0, 720, 150);
    
    for (let s of stars) {
        s.alpha += s.delta;
        if (s.alpha > 1 || s.alpha < 0.3) s.delta *= -1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, s.alpha * Math.PI * 2, 0);
        ctx.fillStyle = `rgba(255,255,255,${s.alpha.toFixed(2)})`;
        ctx.shadowBlur = 5;
        ctx.shadowColor = "white";
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    ctx.shadowColor = "";
    ctx.fillStyle = hillsColor;
    ctx.beginPath();
    ctx.moveTo(0, 480);
    for (let x = 0; x <= 720; x += 48) {
        ctx.lineTo(x, 430 + 20 * Math.sin(x * 0.05) + 5 * Math.cos(x * 0.02));
    }
    ctx.lineTo(720, 480);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, 430, 720, 50);
    
    ctx.fillStyle = pathColor;
    const pathGradient = ctx.createLinearGradient(100, 480, 600, 330);
    pathGradient.addColorStop(0, "#dbb77a");
    pathGradient.addColorStop(1, "#a67c45");
    ctx.fillStyle = pathGradient;
    ctx.beginPath();
    ctx.moveTo(100, 480);
    ctx.lineTo(200, 330);
    ctx.lineTo(520, 360);
    ctx.lineTo(600, 480);
    ctx.closePath();
    ctx.fill();
}

function drawExplorer() {
    ctx.save();
    const centerX = explorer.x + explorer.width / 2;
    const centerY = explorer.y + explorer.height / 2;
    ctx.translate(centerX, centerY);
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    
    if (explorerImg.complete && explorerImg.naturalWidth > 0) {
        ctx.drawImage(explorerImg, -explorer.width / 2, -explorer.height / 2, explorer.width, explorer.height);
    } else {
        // Fallback drawing
        ctx.fillStyle = "#3f51b5";
        ctx.fillRect(-explorer.width / 2, -explorer.height / 2, explorer.width, explorer.height);
        
        // Draw simple face
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(-8, -8, 4, 0, Math.PI * 2);
        ctx.arc(8, -8, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(-8, -8, 2, 0, Math.PI * 2);
        ctx.arc(8, -8, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

function drawCritters() {
    for (const c of critters) {
        if (!c.answered) {
            c.angle += c.angleSpeed;
            ctx.save();
            ctx.translate(c.x + c.width / 2, c.y + c.height / 2);
            ctx.rotate(Math.sin(c.angle) * 0.15);
            ctx.shadowColor = "rgba(0,0,0,0.15)";
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 2;
            ctx.fillStyle = c.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, 18, 14, Math.sin(Date.now() / 350) * 0.1, 0, 2 * Math.PI);
            ctx.fill();
            
            if (critterImg.complete && critterImg.naturalWidth > 0) {
                ctx.drawImage(critterImg, -c.width / 2, -c.height / 2, c.width, c.height);
            } else {
                // Fallback drawing
                ctx.fillStyle = c.color;
                ctx.beginPath();
                ctx.arc(0, 0, 16, 0, Math.PI * 2);
                ctx.fill();
                
                // Draw simple face
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(-6, -4, 3, 0, Math.PI * 2);
                ctx.arc(6, -4, 3, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.arc(-6, -4, 1.5, 0, Math.PI * 2);
                ctx.arc(6, -4, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = "#fff";
            ctx.font = "bold 17px " + fonts;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${c.num1}+${c.num2}?`, 0, 4);
            ctx.restore();
        }
    }
}

function drawTreasures() {
    for (const t of treasures) {
        if (!t.found) {
            t.rotate += t.rotateSpeed;
            ctx.save();
            ctx.translate(t.x + t.width / 2, t.y + t.height / 2);
            ctx.rotate(t.rotate);
            
            if (treasureImg.complete && treasureImg.naturalWidth > 0) {
                ctx.shadowColor = "rgba(255,215,0,0.7)";
                ctx.shadowBlur = 14;
                ctx.drawImage(treasureImg, -t.width / 2, -t.height / 2, t.width, t.height);
            } else {
                // Fallback drawing
                ctx.fillStyle = "gold";
                ctx.shadowColor = "rgba(255,215,0,0.6)";
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(0, -t.height / 2);
                ctx.lineTo(t.width / 2, 0);
                ctx.lineTo(0, t.height / 2);
                ctx.lineTo(-t.width / 2, 0);
                ctx.closePath();
                ctx.fill();
            }
            
            ctx.restore();
            ctx.shadowBlur = 0;
        }
    }
}

function drawUI() {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.roundRect(5, 5, 310, 85, 12);
    ctx.fill();
    
    ctx.fillStyle = "black";
    ctx.font = "22px " + fonts;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    
    if (currentQuestionIndex < questions.length) {
        ctx.fillText("Help Explorer solve addition:", 16, 12);
        ctx.font = "bold 24px " + fonts;
        ctx.fillText(questions[currentQuestionIndex].text, 16, 42);
    } else {
        ctx.font = "bold 26px " + fonts;
        ctx.fillText("All challenges completed!", 16, 32);
    }
    
    ctx.font = "bold 26px " + fonts;
    ctx.textAlign = "right";
    ctx.fillText("Score: " + score, 710, 30);
}

function drawFeedback() {
    if (showAnswerFeedback > 0) {
        ctx.globalAlpha = showAnswerFeedback / 60;
        ctx.shadowColor = "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = answerCorrect ? "#43a047" : "#e53935";
        ctx.beginPath();
        ctx.arc(explorer.x + explorer.width / 2, explorer.y - 14, 30, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "white";
        ctx.font = "bold 30px " + fonts;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(answerCorrect ? "+1" : "-1", explorer.x + explorer.width / 2, explorer.y - 14);
        ctx.globalAlpha = 1;
    }
}

function updateExplorer() {
    explorer.x += explorer.dirX * explorer.speed;
    explorer.y += explorer.dirY * explorer.speed;
    
    if (explorer.x < 0) explorer.x = 0;
    if (explorer.x > 720 - explorer.width) explorer.x = 720 - explorer.width;
    if (explorer.y < 150) explorer.y = 150;
    if (explorer.y > 430 - explorer.height) explorer.y = 430 - explorer.height;
}

function checkCollisions() {
    if (currentQuestionIndex >= questions.length) return;
    
    const currentCritter = critters[questions[currentQuestionIndex].critterIndex];
    if (currentCritter && !currentCritter.answered) {
        const dx = (explorer.x + explorer.width / 2) - (currentCritter.x + currentCritter.width / 2);
        const dy = (explorer.y + explorer.height / 2) - (currentCritter.y + currentCritter.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 50) {
            askQuestion(currentCritter);
        }
    }
    
    for (const t of treasures) {
        if (!t.found) {
            const dx = (explorer.x + explorer.width / 2) - (t.x + t.width / 2);
            const dy = (explorer.y + explorer.height / 2) - (t.y + t.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 42) {
                t.found = true;
                score++;
                playCollectSound();
            }
        }
    }
}

function askQuestion(critter) {
    stopBgMusic();
    const userAnswer = prompt(`Explorer meets a friendly critter!\nSolve: ${critter.num1} + ${critter.num2} = ?`);
    if (userAnswer === null) return playBgMusic();
    
    const parsedAnswer = parseInt(userAnswer.trim());
    const correct = parsedAnswer === critter.correctAnswer;
    
    if (correct) {
        score++;
        playCorrectSound();
    } else {
        playWrongSound();
    }
    
    critter.answered = true;
    answerCorrect = correct;
    showAnswerFeedback = 60;
    currentQuestionIndex++;
    playBgMusic();
}

// Add roundRect function for UI
ctx.roundRect = function(x, y, w, h, r) {
    if (typeof r === "undefined") r = 5;
    else if (typeof r === "number") {
        r = { tl: r, tr: r, bl: r, br: r };
    } else {
        var defaultR = { tl: 0, tr: 0, bl: 0, br: 0 };
        for (var side in defaultR) {
            r[side] = r[side] || defaultR[side];
        }
    }
    this.beginPath();
    this.moveTo(x + r.tl, y);
    this.lineTo(x + w - r.tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    this.lineTo(x + w, y + h - r.br);
    this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    this.lineTo(x + r.bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    this.lineTo(x, y + r.tl);
    this.quadraticCurveTo(x, y, x + r.tl, y);
    this.closePath();
    return this;
};

// Initialize game
createCritters();
createTreasures();
createQuestions();

// Event listeners
window.addEventListener("keydown", e => {
    if (e.repeat) return;
    
    // Initialize audio on first key press
    if (!audioInitialized) {
        initAudio();
    }
    
    if (audioCtx.state === "suspended") audioCtx.resume();
    
    switch (e.key) {
        case "ArrowLeft":
            explorer.dirX = -1;
            break;
        case "ArrowRight":
            explorer.dirX = 1;
            break;
        case "ArrowUp":
            explorer.dirY = -1;
            break;
        case "ArrowDown":
            explorer.dirY = 1;
            break;
    }
});

window.addEventListener("keyup", e => {
    if (e.key === "ArrowLeft" && explorer.dirX === -1) explorer.dirX = 0;
    if (e.key === "ArrowRight" && explorer.dirX === 1) explorer.dirX = 0;
    if (e.key === "ArrowUp" && explorer.dirY === -1) explorer.dirY = 0;
    if (e.key === "ArrowDown" && explorer.dirY === 1) explorer.dirY = 0;
});

function gameLoop() {
    ctx.clearRect(0, 0, 720, 480);
    drawBackground();
    drawTreasures();
    drawCritters();
    drawExplorer();
    drawUI();
    drawFeedback();
    updateExplorer();
    checkCollisions();
    if (showAnswerFeedback > 0) showAnswerFeedback--;
    requestAnimationFrame(gameLoop);
}

gameLoop();