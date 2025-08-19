let stage = document.getElementById("game-of-the-day-stage");
stage.innerHTML = "";

let c = document.createElement("canvas");
c.width = 720;
c.height = 480;
stage.appendChild(c);

let ctx = c.getContext("2d");

// Game objects
let explorer = {
    x: 360,
    y: 400,
    r: 22,
    color: "#2a83d2",
    name: "Echo",
    eyeBlink: 0
};

let friends = [
    { x: 140, y: 300, r: 20, color: "#f57c00", name: "Ziggy" },
    { x: 580, y: 350, r: 20, color: "#52b359", name: "Luna" },
    { x: 330, y: 150, r: 20, color: "#e54b47", name: "Momo" }
];

let mathQuestions = [
    { text: "How many trees do you see?", correct: 5, options: [3, 5, 7] },
    { text: "How many rocks are here?", correct: 4, options: [2, 4, 6] },
    { text: "Count the butterflies flying!", correct: 6, options: [5, 6, 8] }
];

let currentQuestionIndex = 0;
let chosenAnswer = null;
let showMessage = "Explore with Echo! Solve the math to help friends!";

let wackyCloudPositions = [
    { x: 0, y: 40, s: 1.3 },
    { x: 130, y: 60, s: 1.1 },
    { x: 300, y: 65, s: 1.6 },
    { x: 480, y: 35, s: 1.2 },
    { x: 650, y: 55, s: 1.4 }
];

function drawCloud(cx, cy, size) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 32 * size, 22 * size, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 28 * size, cy + 12 * size, 26 * size, 19 * size, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 30 * size, cy + 10 * size, 24 * size, 17 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawExplorer() {
    ctx.save();
    ctx.fillStyle = explorer.color;
    ctx.shadowColor = "rgba(0,0,0,0.15)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(explorer.x, explorer.y, explorer.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(explorer.x - 7, explorer.y - 5, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(explorer.x - 7, explorer.y - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Wings
    ctx.fillStyle = "#aadeff";
    ctx.beginPath();
    ctx.ellipse(explorer.x + 6, explorer.y - 4, 10, 14, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Body
    ctx.fillStyle = "#d9f1ff";
    ctx.beginPath();
    ctx.ellipse(explorer.x, explorer.y + 16, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile
    ctx.fillStyle = "#1b4f72";
    ctx.beginPath();
    ctx.arc(explorer.x, explorer.y, explorer.r - 8, 
        -Math.PI / 4 + Math.sin(explorer.eyeBlink) * 0.2, 
        -Math.PI / 4 + Math.sin(explorer.eyeBlink) * 0.2 + 1.2);
    ctx.lineTo(explorer.x - 3, explorer.y + 3);
    ctx.fill();
    
    ctx.restore();
    explorer.eyeBlink += 0.05;
}

function drawFriend(f) {
    ctx.save();
    ctx.fillStyle = f.color;
    ctx.shadowColor = "rgba(0,0,0,0.1)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(f.x - 6, f.y - 5, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(f.x - 6, f.y - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Wings
    ctx.fillStyle = "#eee";
    ctx.beginPath();
    ctx.ellipse(f.x + 5, f.y - 5, 9, 12, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Body
    ctx.fillStyle = "#fff7b3";
    ctx.beginPath();
    ctx.arc(f.x, f.y + 14, 14, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function drawButterflies() {
    for (let i = 0; i < 6; i++) {
        let bx = 50 + i * 110 + Math.sin((Date.now() / 800) + i) * 18;
        let by = 230 + Math.cos((Date.now() / 1000) + i) * 12;
        
        ctx.fillStyle = "#f7a638";
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 6, by - 12);
        ctx.lineTo(bx + 14, by - 6);
        ctx.lineTo(bx + 10, by + 7);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = "#4a2f06";
        ctx.beginPath();
        ctx.arc(bx + 3, by - 6, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawTrees() {
    for (let i = 0; i < 5; i++) {
        let tx = 50 + i * 125;
        
        // Trunk
        ctx.fillStyle = "#4e342e";
        ctx.fillRect(tx, 345, 20, 48);
        
        // Leaves
        ctx.fillStyle = "#2e7d32";
        ctx.beginPath();
        ctx.moveTo(tx - 25, 345);
        ctx.lineTo(tx + 10, 300);
        ctx.lineTo(tx + 45, 345);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(tx - 20, 320);
        ctx.lineTo(tx + 10, 275);
        ctx.lineTo(tx + 40, 320);
        ctx.closePath();
        ctx.fill();
    }
}

function drawRocks() {
    let rocksX = [500, 530, 560, 590];
    rocksX.forEach(x => {
        ctx.fillStyle = "#999999";
        ctx.beginPath();
        ctx.ellipse(x, 425, 18, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = "#666666";
        ctx.beginPath();
        ctx.arc(x - 5, 420, 9, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawAnswerButtons() {
    let q = mathQuestions[currentQuestionIndex];
    let startX = 110;
    let y = 440;
    
    ctx.font = "22px Comic Sans MS";
    ctx.textBaseline = "middle";
    
    for (let i = 0; i < q.options.length; i++) {
        let opt = q.options[i];
        ctx.fillStyle = (chosenAnswer === opt) ? "#ffbd45" : "#78b5e0";
        ctx.strokeStyle = "#003153";
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.roundRect(startX + i * 170, y, 140, 44, 10);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = "#00243d";
        ctx.fillText(opt, startX + i * 170 + 70, y + 22);
    }
    
    function isInsideButton(mx, my, i) {
        return mx >= startX + i * 170 && 
               mx <= startX + i * 170 + 140 && 
               my >= y && 
               my <= y + 44;
    }
    
    return isInsideButton;
}

function drawUI() {
    // Background gradient
    let gradient = ctx.createLinearGradient(0, 0, 0, 480);
    gradient.addColorStop(0, "#b3e5fc");
    gradient.addColorStop(1, "#81d4fa");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 720, 480);
    
    // Animated clouds
    wackyCloudPositions.forEach(cPos => {
        drawCloud(cPos.x + (Date.now() / 600 * cPos.s) % 800 - 120, cPos.y, cPos.s);
    });
    
    // Draw scene elements
    drawTrees();
    drawRocks();
    drawButterflies();
    drawExplorer();
    friends.forEach(drawFriend);
    
    // Question text
    ctx.fillStyle = "#023e3e";
    ctx.font = "28px Comic Sans MS";
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 3;
    ctx.fillText(mathQuestions[currentQuestionIndex].text, 35, 98);
    ctx.shadowBlur = 0;
    
    // Answer buttons
    drawAnswerButtons();
    
    // Message
    ctx.fillStyle = "#204a4a";
    ctx.font = "20px Comic Sans MS";
    ctx.fillText(showMessage, 30, 140);
}

let isAnswered = false;

// Add roundRect method to canvas context
c.roundRect = function(x, y, w, h, r) {
    this.beginPath();
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
};

// Click event handler
c.addEventListener("click", e => {
    if (isAnswered) return;
    
    let rect = c.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    
    let isBtn = drawAnswerButtons();
    
    for (let i = 0; i < mathQuestions[currentQuestionIndex].options.length; i++) {
        if (isBtn(mx, my, i)) {
            chosenAnswer = mathQuestions[currentQuestionIndex].options[i];
            
            if (chosenAnswer === mathQuestions[currentQuestionIndex].correct) {
                showMessage = `Yay! Echo helped ${friends[currentQuestionIndex].name}!`;
                friends[currentQuestionIndex].color = "#21bf73";
            } else {
                showMessage = "Oops, try again! Listen carefully to the question.";
            }
            
            isAnswered = true;
            
            setTimeout(() => {
                if (chosenAnswer === mathQuestions[currentQuestionIndex].correct) {
                    currentQuestionIndex++;
                    chosenAnswer = null;
                    showMessage = "Explore with Echo! Solve the math to help friends!";
                    isAnswered = false;
                    
                    if (currentQuestionIndex >= mathQuestions.length) {
                        showMessage = "Great Explorer! You helped all friends! 🎉";
                    }
                } else {
                    chosenAnswer = null;
                    isAnswered = false;
                }
            }, 2000);
        }
    }
});

function animate() {
    ctx.clearRect(0, 0, 720, 480);
    drawUI();
    requestAnimationFrame(animate);
}

animate();  