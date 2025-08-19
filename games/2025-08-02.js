const stage = document.getElementById("game-of-the-day-stage");
stage.innerHTML = "";

const canvas = document.createElement("canvas");
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);

const ctx = canvas.getContext("2d");
const toRadians = deg => deg * Math.PI / 180;

let keysPressed = {};

document.addEventListener("keydown", e => {
    keysPressed[e.key] = true;
});

document.addEventListener("keyup", e => {
    keysPressed[e.key] = false;
});

// Audio setup
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgMusicOsc = null;
let bgGain = null;

function startBackgroundMusic() {
    if (bgMusicOsc) return;
    bgMusicOsc = audioCtx.createOscillator();
    bgGain = audioCtx.createGain();
    bgMusicOsc.connect(bgGain);
    bgGain.connect(audioCtx.destination);
    bgMusicOsc.type = "sine";
    bgMusicOsc.frequency.value = 220;
    bgGain.gain.setValueAtTime(0.02, audioCtx.currentTime);
    bgMusicOsc.start();
}

function stopBackgroundMusic() {
    if (bgMusicOsc) {
        bgMusicOsc.stop();
        bgMusicOsc.disconnect();
        bgGain.disconnect();
        bgMusicOsc = null;
        bgGain = null;
    }
}

startBackgroundMusic();

function playSound(freq, duration, volume = 0.1) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + duration / 1000);
    osc.onended = () => {
        gain.disconnect();
        osc.disconnect();
    };
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
}

function playCorrect() {
    playSound(880, 150, 0.15);
}

function playIncorrect() {
    playSound(180, 350, 0.12);
}

function playStep() {
    playSound(440, 70, 0.07);
}

// Background colors
const backgrounds = [
    ["#1a374d", "#406882", "#6998ab"],
    ["#2c3e50", "#4ca1af", "#a4d4e0"],
    ["#223843", "#336b87", "#6a9fb5"]
];

let bgColors = backgrounds[Math.floor(Math.random() * backgrounds.length)];

function drawBackground() {
    let grd = ctx.createLinearGradient(0, 0, 0, 480);
    grd.addColorStop(0, bgColors[0]);
    grd.addColorStop(0.5, bgColors[1]);
    grd.addColorStop(1, bgColors[2]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 720, 480);
    
    // Animated clouds
    for (let i = 0; i < 20; i++) {
        let x = (i * 72 + (performance.now() * 0.02 * 0.5)) % 720;
        let y = 400 + 10 * Math.sin((performance.now() * 0.002 + i) * 3);
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${0.1 + 0.1 * Math.sin(i * 2 + performance.now() * 0.003)})`;
        ctx.ellipse(x, y, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Character {
    constructor(name, x, y, color) {
        this.name = name;
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = 50;
        this.speed = 3;
        this.dir = 0;
        this.moving = false;
        this.footstepTimer = 0;
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.dir + Math.sin(performance.now() * 0.005) * 0.1);
        
        let gradient = ctx.createRadialGradient(0, 0, this.size / 4, 0, 0, this.size / 1.5);
        gradient.addColorStop(0, this.color);
        gradient.addColorStop(1, "#222");
        ctx.fillStyle = gradient;
        
        ctx.beginPath();
        ctx.moveTo(0, -this.size * 0.6);
        ctx.lineTo(this.size * 0.6, this.size * 0.6);
        ctx.lineTo(0, this.size * 0.3);
        ctx.lineTo(-this.size * 0.6, this.size * 0.6);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(0, -this.size * 0.3, this.size * 0.25, this.size * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = "#444";
        ctx.beginPath();
        ctx.ellipse(0, -this.size * 0.3, this.size * 0.12, this.size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    move(dx, dy) {
        this.x += dx;
        this.y += dy;
        this.x = Math.max(30, Math.min(690, this.x));
        this.y = Math.max(30, Math.min(450, this.y));
    }
    
    updateDir(dx, dy) {
        if (dx !== 0 || dy !== 0) this.dir = Math.atan2(dy, dx);
    }
    
    moveAndPlay(dx, dy) {
        if (dx !== 0 || dy !== 0) {
            if (!this.moving) {
                playStep();
            }
            this.moving = true;
        } else {
            this.moving = false;
        }
        this.move(dx, dy);
        this.updateDir(dx, dy);
    }
}

class FriendlyAlien {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 44;
        this.color = "#ff80ab";
        this.antennae = [12, -12];
        this.antennaePhase = 0;
        this.solved = false;
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        ctx.shadowColor = "rgba(255,128,171,0.6)";
        ctx.shadowBlur = 12;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 26, 36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(-12, -6, 8, 14, 0, 0, Math.PI * 2);
        ctx.ellipse(12, -6, 8, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.ellipse(-12, -6, 4, 7, 0, 0, Math.PI * 2);
        ctx.ellipse(12, -6, 4, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Antennae
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4;
        this.antennae.forEach((x, i) => {
            ctx.beginPath();
            let sway = Math.sin(this.antennaePhase + i) * 6;
            ctx.moveTo(0, -24);
            ctx.quadraticCurveTo(x * sway * 0.05, -52, (x + sway) * 1.1, -40 + sway * 2);
            ctx.stroke();
        });
        
        ctx.restore();
    }
    
    updateAntennae(delta) {
        this.antennaePhase += delta * 7;
    }
    
    containsPoint(px, py) {
        return Math.hypot(px - this.x, py - this.y) < this.size;
    }
    
    getQuestion() {
        if (this.solved) return null;
        let a = Math.ceil(Math.random() * 10);
        let b = Math.ceil(Math.random() * 10);
        return { q: `${a}+${b}`, a: a + b };
    }
}

class FloatingNumber {
    constructor(x, y, val) {
        this.x = x;
        this.y = y;
        this.val = val;
        this.alpha = 1;
        this.size = 30;
        this.life = 60;
    }
    
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = "#ff3366";
        ctx.font = `bold ${this.size}px Comic Sans MS, cursive`;
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(255,51,102,0.7)";
        ctx.shadowBlur = 6;
        ctx.fillText(this.val, this.x, this.y);
        ctx.restore();
    }
    
    update() {
        this.y -= 0.8;
        this.alpha -= 0.025;
        this.life--;
        return this.life <= 0;
    }
}

class Game {
    constructor() {
        this.player = new Character("Explorer", 360, 240, "#ff884d");
        this.aliens = [];
        
        for (let i = 0; i < 8; i++) {
            let ax = 60 + Math.random() * 600;
            let ay = 80 + Math.random() * 340;
            this.aliens.push(new FriendlyAlien(ax, ay));
        }
        
        this.currentAlien = null;
        this.currentQuestion = null;
        this.awaitingAnswer = false;
        this.inputAnswer = "";
        this.floatingNumbers = [];
        this.message = "Find the friendly aliens and solve their math questions!";
        this.messageTimer = 0;
        this.correctCount = 0;
        this.maxCorrect = 8;
        this.backgroundOffset = 0;
        
        this.bgWackyElements = [];
        for (let i = 0; i < 15; i++) {
            this.bgWackyElements.push({
                x: Math.random() * 720,
                y: Math.random() * 480,
                radius: 6 + Math.random() * 9,
                phase: Math.random() * Math.PI * 2,
                color: `hsl(${130 + Math.random() * 60}, 80%, 75%)`
            });
        }
        
        this.loop = this.loop.bind(this);
        this.lastTime = 0;
        
        canvas.addEventListener("click", e => this.onClick(e));
        window.requestAnimationFrame(this.loop);
    }
    
    showMessage(txt, dur = 180) {
        this.message = txt;
        this.messageTimer = dur;
    }
    
    onClick(e) {
        if (!this.awaitingAnswer) return;
        
        const bx = canvas.getBoundingClientRect().left;
        const by = canvas.getBoundingClientRect().top;
        const mx = e.clientX - bx;
        const my = e.clientY - by;
        
        let clickedNum = null;
        for (let i = 1; i <= 20; i++) {
            let cx = 100 + ((i - 1) % 5) * 120;
            let cy = 350 + Math.floor((i - 1) / 5) * 50;
            if (mx > cx - 27 && mx < cx + 27 && my > cy - 27 && my < cy + 27) {
                clickedNum = i;
                break;
            }
        }
        
        if (clickedNum !== null) {
            this.inputAnswer = clickedNum;
            this.checkAnswer();
        }
    }
    
    checkAnswer() {
        if (!this.currentAlien || !this.currentQuestion) return;
        
        let correct = this.inputAnswer === this.currentQuestion.a;
        
        if (correct) {
            playCorrect();
            this.currentAlien.solved = true;
            this.correctCount++;
            this.showMessage("Correct! Well done! Keep exploring!");
            this.floatingNumbers.push(new FloatingNumber(this.currentAlien.x, this.currentAlien.y, -this.inputAnswer));
            this.currentAlien = null;
            this.currentQuestion = null;
            this.awaitingAnswer = false;
            
            if (this.correctCount >= this.maxCorrect) {
                this.showMessage("You helped all the aliens! Great math explorer!");
                stopBackgroundMusic();
            } else {
                setTimeout(() => this.showMessage("Find more aliens to help!"), 2000);
            }
        } else {
            playIncorrect();
            this.showMessage("Oops! Try again!");
            this.inputAnswer = "";
        }
    }
    
    detectAlienCollision() {
        for (let alien of this.aliens) {
            if (alien.solved) continue;
            let dist = Math.hypot(this.player.x - alien.x, this.player.y - alien.y);
            if (dist < 60) return alien;
        }
        return null;
    }
    
    drawPlayer() {
        this.player.draw();
    }
    
    drawAliens() {
        for (let alien of this.aliens) {
            if (!alien.solved) alien.draw();
        }
    }
    
    drawQuestion() {
        if (!this.currentAlien || !this.currentQuestion) return;
        
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.shadowColor = "rgba(0,0,0,0.15)";
        ctx.shadowBlur = 8;
        ctx.fillRect(140, 195, 440, 160);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = "#104040";
        ctx.font = "22px Comic Sans MS, cursive";
        ctx.textAlign = "center";
        ctx.fillText("Alien's Question:", 360, 230);
        
        ctx.font = "38px Comic Sans MS, cursive";
        ctx.fillText(this.currentQuestion.q + " = ?", 360, 285);
        
        ctx.font = "20px Comic Sans MS, cursive";
        ctx.fillText("Tap the answer number below!", 360, 320);
        
        // Draw number buttons
        for (let i = 1; i <= 20; i++) {
            let cx = 100 + ((i - 1) % 5) * 120;
            let cy = 350 + Math.floor((i - 1) / 5) * 50;
            
            ctx.fillStyle = "#3a849e";
            ctx.shadowColor = "rgba(0,0,0,0.2)";
            ctx.shadowBlur = 7;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 28, 28, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = "white";
            ctx.font = "22px Comic Sans MS, cursive";
            ctx.fillText(i, cx, cy + 8);
        }
        ctx.shadowBlur = 0;
        
        if (this.inputAnswer !== "") {
            ctx.fillStyle = "rgba(20,80,80,0.85)";
            ctx.font = "30px Comic Sans MS, cursive";
            ctx.fillText(`You selected: ${this.inputAnswer}`, 360, 350);
        }
    }
    
    drawMessage() {
        if (this.messageTimer > 0) {
            ctx.fillStyle = "rgba(0, 64, 65, 0.75)";
            ctx.shadowColor = "rgba(0,0,0,0.2)";
            ctx.shadowBlur = 8;
            ctx.fillRect(10, 10, 700, 40);
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = "#aff3f3";
            ctx.font = "21px Comic Sans MS, cursive";
            ctx.textAlign = "left";
            ctx.fillText(this.message, 20, 40);
            this.messageTimer--;
        }
    }
    
    drawWackyBackground(deltaT) {
        this.backgroundOffset += deltaT * 22;
        
        ctx.fillStyle = "#58a6d4";
        ctx.fillRect(0, 470, 720, 12);
        
        for (let el of this.bgWackyElements) {
            el.phase = (el.phase || 0) + deltaT * 6;
            let dy = 6 * Math.sin(el.phase);
            
            ctx.fillStyle = el.color;
            ctx.beginPath();
            ctx.ellipse(el.x, el.y + dy, el.radius, el.radius * 0.85, 0, 0, Math.PI * 2);
            ctx.shadowColor = el.color;
            ctx.shadowBlur = 7;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    
    update(dt) {
        let dx = 0;
        let dy = 0;
        
        if (keysPressed["ArrowUp"]) dy -= this.player.speed;
        if (keysPressed["ArrowDown"]) dy += this.player.speed;
        if (keysPressed["ArrowLeft"]) dx -= this.player.speed;
        if (keysPressed["ArrowRight"]) dx += this.player.speed;
        
        this.player.moveAndPlay(dx, dy);
        
        if (!this.awaitingAnswer) {
            let c = this.detectAlienCollision();
            if (c) {
                this.currentAlien = c;
                this.currentQuestion = c.getQuestion();
                this.awaitingAnswer = true;
                this.inputAnswer = "";
                this.showMessage("Tap the correct answer to help the alien!");
                playStep();
            }
        }
        
        this.aliens.forEach(a => a.updateAntennae(dt));
        this.floatingNumbers = this.floatingNumbers.filter(f => !f.update());
    }
    
    loop(ts = 0) {
        if (!this.lastTime) this.lastTime = ts;
        const dt = (ts - this.lastTime) / 1000;
        this.lastTime = ts;
        
        drawBackground();
        this.drawWackyBackground(dt);
        this.drawAliens();
        this.drawPlayer();
        this.drawMessage();
        
        if (this.awaitingAnswer) this.drawQuestion();
        
        this.update(dt);
        
        if (this.correctCount >= this.maxCorrect) {
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.shadowColor = "rgba(0,0,0,0.18)";
            ctx.shadowBlur = 8;
            ctx.fillRect(130, 195, 460, 90);
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = "#1f605b";
            ctx.font = "40px Comic Sans MS, cursive";
            ctx.textAlign = "center";
            ctx.fillText("All aliens helped! You rock!", 360, 250);
        }
        
        requestAnimationFrame(this.loop);
    }
}

new Game();