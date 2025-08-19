console.log("Game script loaded");
const stage = document.getElementById("game-of-the-day-stage");
stage.innerHTML = "";
const canvas = document.createElement("canvas");
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);
const ctx = canvas.getContext("2d");
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(freq, dur, type = "triangle") {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = type;
    oscillator.frequency.value = freq;
    gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur / 1000);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + dur / 1000);
}

function loadBgMusic() {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "triangle";
    osc.frequency.value = 110;
    gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
    osc.start();
    return { osc, gain };
}

const bgMusic = loadBgMusic();
let bgMusicPhase = 0;

class Explorer {
    constructor() {
        this.x = 360;
        this.y = 240;
        this.radius = 24;
        this.color = "#56789a";
        this.speed = 3;
        this.expression = "";
        this.correctAnswer = null;
        this.hasQuestion = false;
        this.eyeOffset = 0;
        this.mouthOpen = 0;
    }
    draw() {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, this.radius * 1.05, this.radius * 1.2, Math.sin(Date.now() / 400) * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = "#fff";
        // Eyes
        const eyeY = this.y - 6;
        const eyeXLeft = this.x - 8 + this.eyeOffset;
        const eyeXRight = this.x + 8 + this.eyeOffset;
        ctx.beginPath();
        ctx.ellipse(eyeXLeft, eyeY, 7, 9, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeXRight, eyeY, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        // Irises
        ctx.fillStyle = "#2c3e50";
        ctx.beginPath();
        ctx.ellipse(eyeXLeft, eyeY, 4, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeXRight, eyeY, 4, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Pupils
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(eyeXLeft + this.eyeOffset / 2, eyeY, 2, 3, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeXRight + this.eyeOffset / 2, eyeY, 2, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Mouth
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 3;
        ctx.beginPath();
        const mouthY = this.y + 10;
        const mouthW = 20;
        const mouthH = 5 + Math.sin(this.mouthOpen) * 3;
        ctx.moveTo(this.x - mouthW / 2, mouthY);
        ctx.quadraticCurveTo(this.x, mouthY + mouthH, this.x + mouthW / 2, mouthY);
        ctx.stroke();
        // Text
        ctx.fillStyle = "#fafafa";
        ctx.font = "22px Comic Sans MS";
        ctx.textAlign = "center";
        ctx.fillText("Max", this.x, this.y + 42);
        ctx.restore();
        this.eyeOffset = Math.sin(Date.now() / 500) * 2;
        this.mouthOpen = (Math.sin(Date.now() / 300) + 1) / 2;
    }
    move(dx, dy) {
        this.x = Math.min(Math.max(this.radius, this.x + dx * this.speed), canvas.width - this.radius);
        this.y = Math.min(Math.max(this.radius, this.y + dy * this.speed), canvas.height - this.radius);
    }
    askQuestion() {
        const a = Math.floor(Math.random() * 10) + 1;
        const b = Math.floor(Math.random() * 10) + 1;
        this.expression = `${a} + ${b}`;
        this.correctAnswer = a + b;
        this.hasQuestion = true;
    }
    checkAnswer(ans) {
        if (ans === this.correctAnswer) {
            playSound(700, 300, "sine");
            return true;
        } else {
            playSound(250, 400, "square");
            return false;
        }
    }
}

class Creature {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 32;
        this.baseColor = "#f4a261";
        this.color = this.baseColor;
        this.answer = null;
        this.visible = true;
        this.wackyFeatures = [Math.random(), Math.random(), Math.random()];
        this.bounce = 0;
    }
    draw() {
        if (!this.visible) return;
        ctx.save();
        ctx.translate(this.x, this.y - Math.abs(Math.sin(this.bounce)) / 3);
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, this.radius * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-14, -10, 9, 0, Math.PI * 2);
        ctx.arc(14, -10, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(-14 + this.wackyFeatures[0] * 3, -10, 4, 0, Math.PI * 2);
        ctx.arc(14 + this.wackyFeatures[1] * 3, -10, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-20, 18 + this.wackyFeatures[2] * 6);
        ctx.quadraticCurveTo(0, 40, 20, 18 + this.wackyFeatures[2] * 6);
        ctx.stroke();
        ctx.fillStyle = "#0b4878";
        ctx.font = "24px Comic Sans MS";
        ctx.textAlign = "center";
        if (this.answer !== null) ctx.fillText(this.answer, 0, 10);
        ctx.restore();
        this.bounce += 0.04;
    }
    hitTest(px, py) {
        const dx = px - this.x;
        const dy = py - this.y;
        return dx * dx / (this.radius * this.radius) + dy * dy / (this.radius * 0.85 * this.radius * 0.85) <= 1;
    }
    hide() {
        this.visible = false;
    }
    show() {
        this.visible = true;
        this.color = this.baseColor;
    }
}

class QuestionBubble {
    constructor(explorer) {
        this.explorer = explorer;
        this.width = 260;
        this.height = 130;
        this.padding = 20;
        this.visible = false;
        this.blink = 0;
    }
    draw() {
        if (!this.visible) return;
        const x = this.explorer.x - this.width / 2;
        const y = this.explorer.y - this.explorer.radius - this.height - 14;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.22)";
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.strokeStyle = "#27566d";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 20, y + this.height);
        ctx.lineTo(x + 30, y + this.height + 15);
        ctx.lineTo(x + 50, y + this.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(x, y, this.width, this.height);
        ctx.strokeRect(x, y, this.width, this.height);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = "#164a6e";
        ctx.font = "28px Comic Sans MS";
        ctx.textAlign = "center";
        ctx.fillText("Solve: " + this.explorer.expression, x + this.width / 2, y + 54);
        ctx.font = "20px Comic Sans MS";
        ctx.fillText("Click the right creature", x + this.width / 2, y + 95);
        ctx.fillStyle = `rgba(22,74,110,${0.5 + Math.sin(this.blink) * 0.3})`;
        ctx.font = "14px Comic Sans MS";
        ctx.fillText("Press Space to get a new question anytime", x + this.width / 2, y + 120);
        ctx.restore();
        this.blink += 0.1;
    }
    show() {
        this.visible = true;
    }
    hide() {
        this.visible = false;
    }
}

const explorer = new Explorer();
const questionBubble = new QuestionBubble(explorer);
const creatures = [];
let correctCreature = null;
let keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

function setupCreatures(correctAnswer) {
    creatures.length = 0;
    const positions = [
        [160, 360],
        [360, 380],
        [560, 360]
    ];
    const answers = [];
    answers.push(correctAnswer);
    while (answers.length < 3) {
        const n = Math.floor(Math.random() * 20) + 2;
        if (!answers.includes(n)) answers.push(n);
    }
    answers.sort(() => Math.random() - 0.5);
    for (let i = 0; i < 3; i++) {
        const c = new Creature(positions[i][0], positions[i][1]);
        c.answer = answers[i];
        creatures.push(c);
        if (answers[i] === correctAnswer) correctCreature = c;
    }
}

function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#ade1f9");
    grad.addColorStop(1, "#4e8ebb");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(70,140,210,${0.08 + i * 0.018})`;
        ctx.beginPath();
        const wx = (Math.sin(i * 1.4 + Date.now() / 1600) + 1) / 2 * canvas.width;
        const wy = (Math.cos(i * 0.8 + Date.now() / 2100) + 1) / 2 * canvas.height;
        ctx.ellipse(wx, wy, 42, 22, i * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawWackyPlants() {
    for (let i = 0; i < 5; i++) {
        const baseX = 120 + i * 130 + Math.sin(Date.now() / 2500 + i) * 12;
        const baseY = 445;
        ctx.fillStyle = "#2eaa99";
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.bezierCurveTo(baseX - 15, baseY - 48, baseX + 15, baseY - 95, baseX, baseY - 140);
        ctx.lineTo(baseX + 12, baseY - 133);
        ctx.bezierCurveTo(baseX + 6, baseY - 92, baseX + 28, baseY - 82, baseX + 12, baseY - 45);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#1a4d48";
        ctx.lineWidth = 3;
        ctx.stroke();
        const wackyColor = ["#d8513d", "#efae56", "#e7ca71", "#f2bd56", "#d9513e"][i % 5];
        ctx.fillStyle = wackyColor;
        ctx.beginPath();
        ctx.arc(baseX + 12, baseY - 133, 14 + Math.sin(Date.now() / 350 + i) * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

function update() {
    bgMusic.gain.gain.setTargetAtTime(0.02 + 0.015 * Math.sin(bgMusicPhase), audioCtx.currentTime, 0.1);
    bgMusicPhase += 0.01;
    const oldX = explorer.x, oldY = explorer.y;
    if (keys.ArrowUp) explorer.move(0, -1);
    if (keys.ArrowDown) explorer.move(0, 1);
    if (keys.ArrowLeft) explorer.move(-1, 0);
    if (keys.ArrowRight) explorer.move(1, 0);
    if (oldX !== explorer.x || oldY !== explorer.y) draw();
}

function draw() {
    drawBackground();
    drawWackyPlants();
    creatures.forEach(c => c.draw());
    explorer.draw();
    if (explorer.hasQuestion) questionBubble.show();
    else questionBubble.hide();
    questionBubble.draw();
}

function newQuestion() {
    explorer.askQuestion();
    setupCreatures(explorer.correctAnswer);
    explorer.hasQuestion = true;
    questionBubble.visible = true;
}

canvas.addEventListener("click", e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (!explorer.hasQuestion) {
        return;
    }
    for (const c of creatures) {
        if (c.visible && c.hitTest(mx, my)) {
            if (explorer.checkAnswer(c.answer)) {
                explorer.hasQuestion = false;
                c.color = "#2a9d8f";
                c.show();
                creatures.forEach(c2 => { if (c2 !== c) c2.hide(); });
                setTimeout(() => {
                    creatures.forEach(c => c.show());
                    newQuestion();
                }, 1500);
            } else {
                c.color = "#d93131";
                playSound(300, 350, "square");
            }
        }
    }
});

window.addEventListener("keydown", e => {
    if (e.key in keys) keys[e.key] = true;
    if (e.key === " " && !explorer.hasQuestion) newQuestion();
});

window.addEventListener("keyup", e => {
    if (e.key in keys) keys[e.key] = false;
});

draw();
newQuestion();

function gameLoop() {
    update();
    requestAnimationFrame(gameLoop);
}
gameLoop();
