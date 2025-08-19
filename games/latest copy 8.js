const stage = document.getElementById("game-of-the-day-stage");
stage.innerHTML = "";
const canvas = document.createElement("canvas");
canvas.width = 720;
canvas.height = 480;
stage.appendChild(canvas);
const ctx = canvas.getContext("2d");

let score = 0;
let question = {};
let answerBox = { x: 300, y: 400, width: 120, height: 40 };
let input = "";

const seaCreatures = ["🐙", "🐠", "🦀", "🐳"];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateQuestion() {
  const a = getRandomInt(1, 20);
  const b = getRandomInt(1, 20);
  question = {
    text: `${a} + ${b}`,
    answer: a + b,
    creature: seaCreatures[getRandomInt(0, seaCreatures.length - 1)]
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#b3ecff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = "48px sans-serif";
  ctx.fillStyle = "#003366";
  ctx.fillText("Underwater Math", 220, 60);

  ctx.font = "36px sans-serif";
  ctx.fillText(question.creature + "  " + question.text + " = ?", 240, 200);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(answerBox.x, answerBox.y, answerBox.width, answerBox.height);
  ctx.strokeStyle = "#000";
  ctx.strokeRect(answerBox.x, answerBox.y, answerBox.width, answerBox.height);

  ctx.fillStyle = "#000";
  ctx.font = "28px sans-serif";
  ctx.fillText(input, answerBox.x + 10, answerBox.y + 30);

  ctx.font = "24px sans-serif";
  ctx.fillText("Score: " + score, 20, 30);
}

function checkAnswer() {
  if (parseInt(input) === question.answer) {
    score++;
    generateQuestion();
  }
  input = "";
  draw();
}

document.addEventListener("keydown", (e) => {
  if (e.key >= "0" && e.key <= "9") {
    input += e.key;
  } else if (e.key === "Backspace") {
    input = input.slice(0, -1);
  } else if (e.key === "Enter") {
    checkAnswer();
  }
  draw();
});

generateQuestion();
draw();