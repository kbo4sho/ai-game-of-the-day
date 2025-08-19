console.log("Game script loaded");

(function() {
    const stage = document.getElementById("game-of-the-day-stage");
    stage.innerHTML = "";
    
    const w = 720, h = 480;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    stage.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    
    // Audio management with proper initialization
    let audioInitialized = false;
    let audioCtx;
    const sounds = { correct: null, wrong: null, bgm: null, chime: null };
    
    function initAudio() {
        if (audioInitialized) return;
        
        try {
            audioCtx = new AudioContext();
            
            function createOsc(freq, dur, type, volume = 0.1) {
                return new Promise(r => {
                    const osc = audioCtx.createOscillator();
                    const gainNode = audioCtx.createGain();
                    osc.frequency.value = freq;
                    osc.type = type;
                    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
                    osc.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                    osc.start();
                    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur / 1000);
                    setTimeout(() => {
                        osc.stop();
                        r();
                    }, dur);
                });
            }
            
            sounds.correct = function() {
                createOsc(1046.5, 200, "triangle", 0.12);
            };
            
            sounds.wrong = function() {
                createOsc(164.81, 300, "sawtooth", 0.06);
            };
            
            sounds.chime = function() {
                createOsc(1318.51, 300, "sine", 0.09);
            };
            
            // Create background music with Web Audio API instead of external file
            const bgOsc = audioCtx.createOscillator();
            const bgGain = audioCtx.createGain();
            bgOsc.type = "sine";
            bgOsc.frequency.value = 220;
            bgGain.gain.value = 0.02;
            bgOsc.connect(bgGain);
            bgGain.connect(audioCtx.destination);
            bgOsc.start();
            
            sounds.bgm = { osc: bgOsc, gain: bgGain };
            
            audioInitialized = true;
            console.log("Audio initialized successfully");
            
        } catch (error) {
            console.warn("Failed to initialize audio:", error);
        }
    }
    
    class Explorer {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.w = 48;
            this.h = 60;
            this.color = "#ffbb22";
            this.eyeBlink = 0;
            this.dir = 1;
            this.speed = 3.5;
            this.treasureCount = 0;
            this.frame = 0;
        }
        
        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            if (this.dir < 0) ctx.scale(-1, 1);
            
            this.frame = (Date.now() / 120) % 4 | 0;
            
            const bodyGrad = ctx.createRadialGradient(0, 10, 10, 0, 10, 25);
            bodyGrad.addColorStop(0, "#ffe066");
            bodyGrad.addColorStop(1, "#cc9900");
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.ellipse(0, 10, 22, 26, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = "#6b4e16";
            ctx.beginPath();
            ctx.moveTo(-8, -20);
            ctx.lineTo(8, -20);
            ctx.lineTo(14, -8);
            ctx.lineTo(-14, -8);
            ctx.closePath();
            ctx.fill();
            
            // hat with subtle texture
            ctx.fillStyle = "#fffacd";
            ctx.beginPath();
            ctx.ellipse(5, -27, 11, 16, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            
            // feather
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.ellipse(-8, -7, 6, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // eye socket
            ctx.fillStyle = "white";
            ctx.beginPath();
            ctx.ellipse(-8, -7 - (this.eyeBlink > 0 ? 5 : 0), 4, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // eye pupil
            if (this.eyeBlink > 0) this.eyeBlink--;
            
            ctx.restore();
        }
        
        update(keys) {
            if (keys["ArrowLeft"]) {
                this.x -= this.speed;
                this.dir = -1;
            }
            if (keys["ArrowRight"]) {
                this.x += this.speed;
                this.dir = 1;
            }
            if (keys["ArrowUp"]) {
                this.y -= this.speed;
            }
            if (keys["ArrowDown"]) {
                this.y += this.speed;
            }
            
            this.x = Math.max(28, Math.min(w - 28, this.x));
            this.y = Math.max(35, Math.min(h - 35, this.y));
        }
        
        blink() {
            if (Math.random() < 0.008) this.eyeBlink = 7;
        }
        
        intersects(obj) {
            return !(this.x + this.w / 2 < obj.x - obj.size || 
                    this.x - this.w / 2 > obj.x + obj.size || 
                    this.y + this.h / 2 < obj.y - obj.size || 
                    this.y - this.h / 2 > obj.y + obj.size);
        }
        
        playCollected() {
            if (audioInitialized) sounds.correct();
        }
        
        playMissed() {
            if (audioInitialized) sounds.wrong();
        }
    }
    
    class Creature {
        constructor(x, y, type) {
            this.x = x;
            this.y = y;
            this.size = 22;
            this.type = type;
            this.collected = false;
            this.wackyOffset = Math.random() * Math.PI * 2;
            this.animPhase = 0;
        }
        
        draw() {
            if (this.collected) return;
            
            ctx.save();
            ctx.translate(this.x, this.y);
            
            let baseColors = { treasure: "#f5db3f", puzzle: "#43d932", trap: "#d64133" };
            let c = baseColors[this.type] || "#d37ab1";
            let glowColor = { 
                treasure: "rgba(245,219,63,0.4)", 
                puzzle: "rgba(67,217,50,0.35)", 
                trap: "rgba(214,65,51,0.3)" 
            }[this.type] || "rgba(211,122,177,0.3)";
            
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 15;
            
            let wiggleX = Math.sin(this.wackyOffset + Date.now() * 0.004) * 3;
            let wiggleY = Math.cos(this.wackyOffset + Date.now() * 0.003) * 2;
            ctx.translate(wiggleX, wiggleY);
            
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.ellipse(0, 0, 22, 18, Math.sin(this.wackyOffset + Date.now() * 0.002) * 0.15, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-12, 0);
            ctx.lineTo(12, 0);
            ctx.moveTo(0, -12);
            ctx.lineTo(0, 12);
            ctx.stroke();
            
            ctx.restore();
        }
        
        update() {
            this.wackyOffset += 0.045;
        }
        
        interact() {
            if (this.type === "trap") {
                if (audioInitialized) sounds.wrong();
                return "trap";
            } else {
                if (audioInitialized) sounds.correct();
                return "good";
            }
        }
    }
    
    class World {
        constructor() {
            this.creatures = [];
            this.createCreatures();
        }
        
        createCreatures() {
            for (let i = 0; i < 6; i++) {
                this.creatures.push(new Creature(Math.random() * (w - 100) + 50, Math.random() * (h - 140) + 100, "treasure"));
            }
            
            for (let i = 0; i < 4; i++) {
                this.creatures.push(new Creature(Math.random() * (w - 100) + 50, Math.random() * (h - 140) + 100, "puzzle"));
            }
            
            for (let i = 0; i < 3; i++) {
                this.creatures.push(new Creature(Math.random() * (w - 100) + 50, Math.random() * (h - 140) + 100, "trap"));
            }
        }
        
        draw() {
            this.creatures.forEach(c => c.draw());
        }
        
        update() {
            this.creatures.forEach(c => c.update());
        }
        
        checkCollision(x, y) {
            return this.creatures.find(c => !c.collected && Math.abs(c.x - x) < c.size && Math.abs(c.y - y) < c.size);
        }
        
        removeCreature(c) {
            c.collected = true;
        }
    }
    
    class Puzzle {
        constructor(text, answer) {
            this.text = text;
            this.answer = answer;
            this.finished = false;
        }
        
        draw() {
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.shadowColor = "rgba(0,100,0,0.3)";
            ctx.shadowBlur = 15;
            ctx.fillRect(110, 160, 500, 180);
            ctx.shadowBlur = 0;
            
            ctx.fillStyle = "#014d00";
            ctx.font = "26px Comic Sans MS";
            ctx.textAlign = "center";
            ctx.fillText("Solve the puzzle to get your treasure!", w / 2, 200);
            
            ctx.fillStyle = "#003300";
            ctx.font = "38px Comic Sans MS";
            ctx.fillText(this.text, w / 2, 260);
        }
        
        checkAnswer(input) {
            if (parseInt(input) === this.answer) {
                this.finished = true;
                if (audioInitialized) sounds.chime();
                return true;
            } else {
                if (audioInitialized) sounds.wrong();
                return false;
            }
        }
    }
    
    let keys = {};
    
    window.addEventListener("keydown", e => {
        // Initialize audio on first key press
        if (!audioInitialized) {
            initAudio();
        }
        
        keys[e.key] = true;
    });
    
    window.addEventListener("keyup", e => {
        keys[e.key] = false;
    });
    
    const explorer = new Explorer(w / 2, h / 2);
    const world = new World();
    let puzzle = null;
    let inputActive = false;
    let currentInput = "";
    let message = "Explore the open world! Find treasures and solve puzzles!";
    
    function drawMessage() {
        ctx.fillStyle = "#013300";
        ctx.font = "19px Comic Sans MS";
        ctx.textAlign = "left";
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 1;
        ctx.fillText(message, 12, 32);
        ctx.shadowBlur = 0;
    }
    
    function drawInputBox() {
        ctx.fillStyle = "white";
        ctx.shadowColor = "rgba(0,150,0,0.3)";
        ctx.shadowBlur = 8;
        ctx.fillRect(160, 312, 400, 50);
        ctx.strokeStyle = "#2a7d2a";
        ctx.lineWidth = 3;
        ctx.shadowBlur = 0;
        ctx.strokeRect(160, 312, 400, 50);
        
        ctx.fillStyle = "#003300";
        ctx.font = "34px Comic Sans MS";
        ctx.textAlign = "center";
        ctx.fillText(currentInput, w / 2, 348);
    }
    
    function drawBackground() {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, "#7ec8f7");
        bgGrad.addColorStop(1, "#487f3a");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
        
        for (let i = 0; i < 22; i++) {
            let tx = (i * 35 + Date.now() * 0.025) % w;
            let ty = 375 + 8 * Math.sin(i * 0.47 + Date.now() * 0.0036);
            
            const ellipseGrad = ctx.createRadialGradient(tx, ty, 10, tx, ty, 70);
            ellipseGrad.addColorStop(0, "rgba(90,156,60,0.5)");
            ellipseGrad.addColorStop(1, "rgba(35,85,12,0.1)");
            ctx.fillStyle = ellipseGrad;
            ctx.beginPath();
            ctx.ellipse(tx, ty, 75, 22, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    function drawWackyCloud(x, y, scale) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = "#f5faff";
        ctx.shadowColor = "rgba(250,255,255,0.6)";
        ctx.shadowBlur = 12;
        
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.ellipse((i - 2) * 30 + Math.sin(Date.now() * 0.0014 + i) * 10, Math.cos(Date.now() * 0.0024 + i) * 7, 22 * scale, 18 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    function drawWackySun(x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = "#ffea70";
        ctx.shadowColor = "rgba(255,205,30,0.8)";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.ellipse(0, 0, 48, 48, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffca33";
        for (let i = 0; i < 12; i++) {
            ctx.rotate(Math.PI / 6);
            ctx.fillRect(44, 6, 14, 6);
        }
        
        ctx.restore();
    }
    
    function drawHUD() {
        ctx.fillStyle = "#024400";
        ctx.font = "20px Comic Sans MS";
        ctx.textAlign = "left";
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 2;
        ctx.fillText("Treasures collected: " + explorer.treasureCount, 12, h - 22);
        ctx.shadowBlur = 0;
    }
    
    function resetPuzzle() {
        puzzle = null;
        inputActive = false;
        currentInput = "";
        message = "Explore the world for treasures and puzzles!";
    }
    
    window.addEventListener("keydown", e => {
        if (inputActive) {
            if (e.key >= "0" && e.key <= "9") {
                if (currentInput.length < 3) currentInput += e.key;
            } else if (e.key === "Backspace") {
                currentInput = currentInput.slice(0, -1);
            } else if (e.key === "Enter") {
                if (puzzle.checkAnswer(currentInput)) {
                    message = "Correct! You earned a treasure!";
                    explorer.treasureCount++;
                    resetPuzzle();
                } else {
                    message = "Oops, try again!";
                    currentInput = "";
                }
            } else if (e.key === "Escape") {
                resetPuzzle();
            }
        }
    });
    
    function startPuzzle() {
        const a1 = Math.floor(Math.random() * 9) + 1;
        const a2 = Math.floor(Math.random() * 9) + 1;
        const op = "+";
        puzzle = new Puzzle(`What is ${a1} + ${a2}?`, a1 + a2);
        inputActive = true;
        currentInput = "";
        message = "Solve the puzzle! Type answer and press Enter.";
    }
    
    function drawParticles() {
        const time = Date.now();
        for (let i = 0; i < 20; i++) {
            const x = (i * 35 + (time * 0.02)) % w;
            const y = 420 + 6 * Math.sin(i * 0.6 + time * 0.003);
            ctx.fillStyle = `rgba(255,255,255,${0.1 + 0.4 * Math.sin(i * 0.5 + time * 0.01)})`;
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    function gameLoop() {
        ctx.clearRect(0, 0, w, h);
        
        drawBackground();
        drawWackySun(660, 90);
        drawWackyCloud(200, 100, 1);
        drawWackyCloud(440, 65, 0.82);
        drawParticles();
        
        world.draw();
        explorer.draw();
        drawHUD();
        drawMessage();
        
        if (inputActive) {
            puzzle.draw();
            drawInputBox();
        } else {
            explorer.update(keys);
            explorer.blink();
            
            let collide = world.checkCollision(explorer.x, explorer.y);
            if (collide) {
                if (collide.type === "trap") {
                    message = "Oh no! That's a trap! Be careful!";
                    if (audioInitialized) sounds.wrong();
                    world.removeCreature(collide);
                } else if (collide.type === "treasure") {
                    message = "You found a treasure! Great job!";
                    explorer.treasureCount++;
                    world.removeCreature(collide);
                    if (audioInitialized) sounds.correct();
                } else if (collide.type === "puzzle") {
                    message = "A friendly explorer gives you a math puzzle!";
                    startPuzzle();
                    world.removeCreature(collide);
                }
            }
        }
        
        requestAnimationFrame(gameLoop);
    }
    
    // Initialize audio and start game
    initAudio();
    gameLoop();
})();