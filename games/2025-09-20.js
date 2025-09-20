(() => {
  // Configuration
  const WIDTH = 720;
  const HEIGHT = 480;
  const ROUNDS = 5;
  const DIAL_MIN = 0;
  const DIAL_MAX = 12; // kid-friendly range
  const FONT = "16px 'Segoe UI', Roboto, Arial, sans-serif";

  // Find container
  const container = document.getElementById("game-of-the-day-stage");
  if (!container) {
    console.error("Game container with ID 'game-of-the-day-stage' not found.");
    return;
  }

  // Clear container and create canvas
  container.innerHTML = "";
  container.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "Machine Math: interactive math game with dials and gears"
  );
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  container.appendChild(canvas);

  // Accessible live region (visually hidden but inside container)
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  liveRegion.style.width = "1px";
  liveRegion.style.height = "1px";
  container.appendChild(liveRegion);

  const ctx = canvas.getContext("2d");

  // Utility
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const nowMs = () => performance.now();

  // Audio Manager with enhanced sounds and error handling
  class AudioManager {
    constructor() {
      this.enabled = true;
      this.ctx = null;
      this.master = null;
      this.bgGain = null;
      this.bgOsc = null;
      this.lfo = null;
      this.muted = false;
      this.initialized = false;
      this.noiseBuffer = null;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error("Web Audio API not supported");
        this.ctx = new AudioCtx();
      } catch (e) {
        console.warn("Audio initialization failed:", e);
        this.enabled = false;
        this.ctx = null;
      }
    }

    async ensureInitialized() {
      if (!this.enabled || !this.ctx) return false;
      if (this.initialized) return true;
      try {
        // Resume if suspended
        if (this.ctx.state === "suspended") {
          try {
            await this.ctx.resume();
          } catch (e) {
            console.warn("AudioContext resume failed:", e);
          }
        }

        // Master gain
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.85; // overall volume multiplier
        this.master.connect(this.ctx.destination);

        // Gentle background pad using two oscillators for warmth
        this.bgGain = this.ctx.createGain();
        this.bgGain.gain.value = 0.018;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1200;

        this.bgOsc = this.ctx.createOscillator();
        this.bgOsc.type = "sine";
        this.bgOsc.frequency.value = 55;

        const bgOsc2 = this.ctx.createOscillator();
        bgOsc2.type = "sine";
        bgOsc2.frequency.value = 110;
        const bg2Gain = this.ctx.createGain();
        bg2Gain.gain.value = 0.007;

        // subtle LFO to modulate filter cutoff slightly
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = "sine";
        this.lfo.frequency.value = 0.07;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 250;
        this.lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        this.bgOsc.connect(filter);
        bgOsc2.connect(bg2Gain);
        bg2Gain.connect(filter);
        filter.connect(this.bgGain);
        this.bgGain.connect(this.master);

        this.bgOsc.start();
        bgOsc2.start();
        this.lfo.start();

        // Create noise buffer for percussive/negative feedback
        this.noiseBuffer = this.ctx.createBuffer(
          1,
          this.ctx.sampleRate * 1.5,
          this.ctx.sampleRate
        );
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }

        this.initialized = true;
        return true;
      } catch (e) {
        console.warn("Audio background setup failed:", e);
        this.enabled = false;
        return false;
      }
    }

    _createVoice({
      type = "sine",
      freq = 440,
      detune = 0,
      attack = 0.01,
      decay = 0.06,
      sustain = 0.001,
      release = 0.02,
      gain = 0.12,
      duration = 0.18,
      pan = 0
    }) {
      if (!this.enabled || !this.ctx) return null;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const g = this.ctx.createGain();
        const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + attack);
        g.gain.linearRampToValueAtTime(gain * sustain, now + attack + decay);
        g.gain.linearRampToValueAtTime(
          0.0001,
          now + attack + decay + duration + release
        );
        if (p) p.pan.value = pan;
        if (p) {
          osc.connect(g);
          g.connect(p);
          p.connect(this.master);
        } else {
          osc.connect(g);
          g.connect(this.master);
        }
        osc.start(now);
        osc.stop(now + attack + decay + duration + release + 0.05);
        return { osc, g, p };
      } catch (e) {
        console.warn("createVoice failed:", e);
        return null;
      }
    }

    async playTone({
      type = "sine",
      freq = 440,
      duration = 0.25,
      volume = 0.15,
      attack = 0.01,
      release = 0.1,
      detune = 0
    }) {
      if (!this.enabled || !this.ctx) return;
      try {
        if (this.ctx.state === "suspended") {
          try {
            await this.ctx.resume();
          } catch (e) {}
        }
        this._createVoice({
          type,
          freq,
          detune,
          attack,
          decay: 0.04,
          sustain: 0.5,
          release,
          gain: volume,
          duration
        });
      } catch (e) {
        console.warn("playTone error", e);
      }
    }

    _playNoise({ duration = 0.2, volume = 0.12, filterFreq = 1200 }) {
      if (!this.enabled || !this.ctx || !this.noiseBuffer) return;
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;
        const g = this.ctx.createGain();
        const f = this.ctx.createBiquadFilter();
        f.type = "highpass";
        f.frequency.value = 200;
        const now = this.ctx.currentTime;
        g.gain.setValueAtTime(volume, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        f.frequency.setValueAtTime(filterFreq, now);
        source.connect(f);
        f.connect(g);
        g.connect(this.master);
        source.start(now);
        source.stop(now + duration + 0.02);
      } catch (e) {
        console.warn("playNoise error", e);
      }
    }

    // Correct melody: layered pleasant chime with light sparkle
    async playCorrect() {
      if (!this.enabled) return;
      await this.ensureInitialized();
      try {
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        // layered voices for each note
        notes.forEach((freq, i) => {
          setTimeout(() => {
            this._createVoice({
              type: "triangle",
              freq: freq,
              attack: 0.01,
              decay: 0.06,
              sustain: 0.6,
              release: 0.3,
              gain: 0.09,
              duration: 0.18,
              pan: (i - 1) * 0.5
            });
            // light harmonic click
            this._createVoice({
              type: "sine",
              freq: freq * 2,
              attack: 0.002,
              decay: 0.02,
              sustain: 0.2,
              release: 0.05,
              gain: 0.03,
              duration: 0.08,
              pan: (i - 1) * 0.3
            });
          }, i * 160);
        });
        // small sparkling noise
        setTimeout(
          () => this._playNoise({ duration: 0.12, volume: 0.02, filterFreq: 3000 }),
          350
        );
      } catch (e) {
        console.warn("playCorrect error", e);
      }
    }

    // Wrong: short buzzy descending noise with thud
    async playWrong() {
      if (!this.enabled) return;
      await this.ensureInitialized();
      try {
        this._createVoice({
          type: "sawtooth",
          freq: 220,
          attack: 0.005,
          decay: 0.06,
          sustain: 0.2,
          release: 0.12,
          gain: 0.10,
          duration: 0.14
        });
        setTimeout(
          () =>
            this._createVoice({
              type: "sawtooth",
              freq: 170,
              attack: 0.005,
              decay: 0.06,
              sustain: 0.2,
              release: 0.1,
              gain: 0.07,
              duration: 0.12
            }),
          110
        );
        // thud using filtered noise
        setTimeout(
          () => this._playNoise({ duration: 0.14, volume: 0.06, filterFreq: 300 }),
          90
        );
      } catch (e) {
        console.warn("playWrong error", e);
      }
    }

    async playClick() {
      if (!this.enabled) return;
      await this.ensureInitialized();
      try {
        this._createVoice({
          type: "square",
          freq: 880,
          attack: 0.002,
          decay: 0.02,
          sustain: 0.25,
          release: 0.04,
          gain: 0.055,
          duration: 0.06
        });
      } catch (e) {
        console.warn("playClick error", e);
      }
    }

    async toggleMute() {
      if (!this.enabled || !this.ctx) return;
      if (!this.initialized) await this.ensureInitialized();
      if (!this.master) return;
      try {
        if (!this.muted) {
          this.master.gain.setValueAtTime(0.0001, this.ctx.currentTime);
          this.muted = true;
        } else {
          this.master.gain.setValueAtTime(0.85, this.ctx.currentTime);
          this.muted = false;
        }
      } catch (e) {
        console.warn("toggleMute error", e);
      }
    }
  }

  const audio = new AudioManager();

  // Basic particle system for gentle celebratory confetti and subtle steam
  class Particle {
    constructor(x, y, vx, vy, life, color, size, type = "confetti") {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.life = life;
      this.maxLife = life;
      this.color = color;
      this.size = size;
      this.type = type;
      this.angle = Math.random() * Math.PI * 2;
      this.spin = (Math.random() - 0.5) * 0.2;
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.vy += (this.type === "steam" ? -0.02 : 0.04) * dt * 60;
      this.angle += this.spin;
    }

    draw(ctx) {
      const t = Math.max(0, this.life / this.maxLife);
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.2);
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      if (this.type === "confetti") {
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
      } else {
        // steam - soft circle
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size * 2);
        g.addColorStop(0, this.color);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, this.size * (1 + (1 - t) * 1.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    alive() {
      return this.life > 0;
    }
  }

  // Game model
  class Game {
    constructor(ctx, width, height, audio) {
      this.ctx = ctx;
      this.width = width;
      this.height = height;
      this.audio = audio;

      this.round = 0;
      this.score = 0;
      this.attempts = 0;
      this.maxAttempts = 3;
      this.state = "intro"; // intro, playing, success, finished
      this.dials = [0, 0];
      this.selectedDial = 0;
      this.operation = "+"; // "+", "-", "×"
      this.target = 0;
      this.solution = [0, 0]; // correct values
      this.timeStart = 0;
      this.hintsUsed = 0;
      this.roundsTotal = ROUNDS;
      this.gearAngle = 0;
      this.animTime = 0;
      this.audioAvailable = !!(this.audio && this.audio.enabled);

      // particle system
      this.particles = [];

      // glow pulse for selected dial
      this.selectPulse = 0;

      // bind events
      this.keysDown = {};
      this.lastInputTime = nowMs();

      // pre-generate rounds
      this.roundSpecs = [];
      this.generateRounds();

      // start rendering
      this.loop = this.loop.bind(this);
      this._lastTs = performance.now();
      requestAnimationFrame(this.loop);
    }

    generateRounds() {
      this.roundSpecs = [];
      for (let i = 0; i < this.roundsTotal; i++) {
        const ops = ["+", "-", "×"];
        const op = ops[randInt(0, ops.length - 1)];
        let a, b;
        if (op === "+") {
          a = randInt(0, 12);
          b = randInt(0, 12);
        } else if (op === "-") {
          a = randInt(0, 12);
          b = randInt(0, a); // ensure non-negative
        } else if (op === "×") {
          // keep multiplication small
          a = randInt(0, 6);
          b = randInt(0, 6);
        }
        const target = this.computeOp(a, b, op);
        this.roundSpecs.push({ op, a, b, target });
      }
    }

    startRound(index) {
      this.round = index;
      const spec = this.roundSpecs[index];
      this.operation = spec.op;
      this.target = spec.target;
      this.solution = [spec.a, spec.b];
      // choose random starting dial values different from solution to encourage play
      this.dials = [randInt(DIAL_MIN, DIAL_MAX), randInt(DIAL_MIN, DIAL_MAX)];
      if (
        this.dials[0] === this.solution[0] &&
        this.dials[1] === this.solution[1]
      ) {
        // nudge one
        this.dials[1] = clamp(this.dials[1] + 1, DIAL_MIN, DIAL_MAX);
      }
      this.selectedDial = 0;
      this.attempts = 0;
      this.hintsUsed = 0;
      this.timeStart = performance.now();
      this.state = "playing";
      liveRegion.textContent = `Round ${index + 1} started. Target is ${this.target}. Operation ${this.operation}. Use arrow keys or click dials to adjust. Press Enter to submit.`;
      try {
        this.audio.playClick();
      } catch (e) {}
    }

    computeOp(a, b, op) {
      if (op === "+") return a + b;
      if (op === "-") return a - b;
      return a * b;
    }

    selectDial(idx) {
      if (this.state !== "playing") return;
      this.selectedDial = idx;
      liveRegion.textContent = `Selected dial ${idx + 1}. Value ${this.dials[idx]}. Use up/down keys to change.`;
      try {
        this.audio.playClick();
      } catch (e) {}
      // small selection pulse
      this.selectPulse = 1.2;
    }

    changeSelected(delta) {
      if (this.state !== "playing") return;
      this.dials[this.selectedDial] = clamp(
        this.dials[this.selectedDial] + delta,
        DIAL_MIN,
        DIAL_MAX
      );
      liveRegion.textContent = `Dial ${this.selectedDial + 1} is now ${this.dials[this.selectedDial]}.`;
      try {
        this.audio.playClick();
      } catch (e) {}
      // micro particle puff to show change
      this._emitSteam(
        this.selectedDial === 0 ? 200 : 360,
        240 + (this.selectedDial === 0 ? 40 : 40)
      );
    }

    submitAttempt() {
      if (this.state !== "playing") return;
      this.attempts++;
      const result = this.computeOp(this.dials[0], this.dials[1], this.operation);
      if (result === this.target) {
        // correct
        this.score++;
        this.state = "success";
        liveRegion.textContent = `Correct! Round ${this.round + 1} solved.`;
        try {
          this.audio.playCorrect();
        } catch (e) {}
        // emit confetti
        this._emitConfetti(280, 220);
        // proceed after short delay
        setTimeout(() => {
          if (this.round + 1 < this.roundsTotal) {
            this.startRound(this.round + 1);
          } else {
            this.state = "finished";
            liveRegion.textContent = `All rounds complete! Score ${this.score} out of ${this.roundsTotal}. Press Enter to play again.`;
          }
        }, 900);
      } else {
        // wrong
        try {
          this.audio.playWrong();
        } catch (e) {}
        liveRegion.textContent = `Not quite. You made ${result}. Try again. Attempts left ${this.maxAttempts - this.attempts}.`;
        // small wobble on gears
        this.gearAngle += 0.2;
        // reveal subtle hint flash near target to help kids
        this._flashTarget();
        if (this.attempts >= this.maxAttempts) {
          // reveal solution and advance
          this.state = "success";
          liveRegion.textContent = `No attempts left. The solution was ${this.solution[0]} ${this.operation} ${this.solution[1]} = ${this.target}.`;
          setTimeout(() => {
            if (this.round + 1 < this.roundsTotal) {
              this.startRound(this.round + 1);
            } else {
              this.state = "finished";
              liveRegion.textContent = `Finished. Score ${this.score} out of ${this.roundsTotal}. Press Enter to play again.`;
            }
          }, 1200);
        }
      }
    }

    useHint() {
      if (this.state !== "playing") return;
      // reveal one dial to correct value
      const which = Math.random() < 0.5 ? 0 : 1;
      this.dials[which] = this.solution[which];
      this.hintsUsed++;
      liveRegion.textContent = `Hint used: dial ${which + 1} set to ${this.dials[which]}.`;
      try {
        this.audio.playClick();
      } catch (e) {}
      this._emitSteam(which === 0 ? 200 : 360, 230);
    }

    restart() {
      this.score = 0;
      this.round = 0;
      this.generateRounds();
      this.startRound(0);
    }

    // Input handlers
    handleKeyDown(e) {
      if (this.state === "intro" && (e.key === "Enter" || e.key === " ")) {
        // try to initialize audio on user gesture
        this.audio
          .ensureInitialized()
          .then(() => {})
          .catch(() => {});
        this.startRound(0);
        return e.preventDefault();
      }
      if (this.state === "finished" && (e.key === "Enter" || e.key === " ")) {
        this.restart();
        return e.preventDefault();
      }
      if (e.key === "Tab") {
        // cycle selection
        e.preventDefault();
        this.selectedDial = (this.selectedDial + 1) % this.dials.length;
        liveRegion.textContent = `Selected dial ${this.selectedDial + 1}. Value ${this.dials[this.selectedDial]}.`;
        try {
          this.audio.playClick();
        } catch (err) {}
        return;
      }
      if (this.state !== "playing") return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(
          e.key
        )
      ) {
        e.preventDefault();
      }
      switch (e.key) {
        case "ArrowUp":
          this.changeSelected(+1);
          break;
        case "ArrowDown":
          this.changeSelected(-1);
          break;
        case "ArrowLeft":
          this.selectedDial = (this.selectedDial + this.dials.length - 1) % this.dials.length;
          liveRegion.textContent = `Selected dial ${this.selectedDial + 1}. Value ${this.dials[this.selectedDial]}.`;
          try {
            this.audio.playClick();
          } catch (err) {}
          break;
        case "ArrowRight":
          this.selectedDial = (this.selectedDial + 1) % this.dials.length;
          liveRegion.textContent = `Selected dial ${this.selectedDial + 1}. Value ${this.dials[this.selectedDial]}.`;
          try {
            this.audio.playClick();
          } catch (err) {}
          break;
        case "Enter":
        case " ":
          this.submitAttempt();
          break;
        case "h":
        case "H":
          this.useHint();
          break;
        case "m":
        case "M":
          this.audio.toggleMute();
          liveRegion.textContent = `Sound ${this.audio.muted ? "muted" : "unmuted"}.`;
          break;
        default:
          break;
      }
    }

    // Mouse interactions: click on dial or buttons
    handleMouseDown(x, y) {
      // detect dial circles
      // left dial center at (200, 280), right dial at (360, 280)
      const left = { x: 200, y: 280, r: 46 };
      const right = { x: 360, y: 280, r: 46 };
      if (this.pointInCircle(x, y, left)) {
        this.selectDial(0);
        return;
      }
      if (this.pointInCircle(x, y, right)) {
        this.selectDial(1);
        return;
      }
      // submit button area
      if (x >= 520 && x <= 660 && y >= 240 && y <= 300) {
        this.submitAttempt();
        return;
      }
      // hint button
      if (x >= 520 && x <= 660 && y >= 310 && y <= 360) {
        this.useHint();
        return;
      }
      // speaker icon area top-right
      if (x >= 660 && x <= 700 && y >= 10 && y <= 50) {
        this.audio.toggleMute();
        liveRegion.textContent = `Sound ${this.audio.muted ? "muted" : "unmuted"}.`;
        return;
      }
      // click dial arrows (small)
      // up arrow for left dial
      if (x >= 170 && x <= 230 && y >= 220 && y <= 250) {
        this.selectedDial = 0;
        this.changeSelected(+1);
        return;
      }
      if (x >= 330 && x <= 390 && y >= 220 && y <= 250) {
        this.selectedDial = 1;
        this.changeSelected(+1);
        return;
      }
      if (x >= 170 && x <= 230 && y >= 330 && y <= 360) {
        this.selectedDial = 0;
        this.changeSelected(-1);
        return;
      }
      if (x >= 330 && x <= 390 && y >= 330 && y <= 360) {
        this.selectedDial = 1;
        this.changeSelected(-1);
        return;
      }
    }

    pointInCircle(px, py, circle) {
      const dx = px - circle.x;
      const dy = py - circle.y;
      return dx * dx + dy * dy <= circle.r * circle.r;
    }

    // Particle helpers
    _emitConfetti(x, y) {
      const colors = [
        "#ffadad",
        "#ffd6a5",
        "#caffbf",
        "#9bf6ff",
        "#bdb2ff",
        "#fdffb6"
      ];
      for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 1.5;
        const size = 6 + Math.random() * 8;
        const life = 0.9 + Math.random() * 0.8;
        this.particles.push(
          new Particle(
            x + (Math.random() - 0.5) * 30,
            y + (Math.random() - 0.5) * 20,
            vx,
            vy,
            life,
            colors[randInt(0, colors.length - 1)],
            size,
            "confetti"
          )
        );
      }
    }

    _emitSteam(x, y) {
      for (let i = 0; i < 3; i++) {
        const vx = (Math.random() - 0.5) * 0.2;
        const vy = -0.6 - Math.random() * 0.5;
        const size = 12 + Math.random() * 10;
        const life = 0.6 + Math.random() * 0.6;
        this.particles.push(
          new Particle(
            x + (Math.random() - 0.5) * 12,
            y + (Math.random() - 0.5) * 6,
            vx,
            vy,
            life,
            "rgba(255,255,255,0.6)",
            size,
            "steam"
          )
        );
      }
    }

    _flashTarget() {
      // create a short-lived particle flash near target box
      const x = 565;
      const y = 165;
      for (let i = 0; i < 8; i++) {
        const vx = (Math.random() - 0.5) * 0.6;
        const vy = (Math.random() - 0.5) * 0.6;
        const size = 6 + Math.random() * 6;
        const life = 0.5 + Math.random() * 0.4;
        this.particles.push(
          new Particle(
            x + (Math.random() - 0.5) * 30,
            y + (Math.random() - 0.5) * 30,
            vx,
            vy,
            life,
            "#fff7cc",
            size,
            "confetti"
          )
        );
      }
    }

    // Drawing helpers
    drawBackground() {
      // animated gradient sky with subtle shapes
      const g = this.ctx.createLinearGradient(0, 0, 0, this.height);
      const t = Math.sin(this.animTime * 0.4) * 0.02;
      g.addColorStop(0, mix("#eaf6ff", "#f7f6ff", t));
      g.addColorStop(1, mix("#f4fbf6", "#fef9f3", -t));
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, this.width, this.height);

      // Soft rounded machine shadows and floating blobs
      for (let i = 0; i < 5; i++) {
        const alpha = 0.06 + 0.02 * (i % 3);
        this.ctx.fillStyle = `rgba(100,140,180,${alpha})`;
        const rx = (i * 150 + this.animTime * 30) % this.width;
        const ry = 40 + (i % 2) * 40 + Math.sin(this.animTime * (0.4 + i * 0.02)) * 6;
        this.ctx.beginPath();
        this.ctx.ellipse(rx, ry, 36 + (i % 3) * 8, 24 + (i % 2) * 4, 0, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    drawMachineFrame() {
      // subtle outer vignette shadow
      this.ctx.save();
      const vg = this.ctx.createLinearGradient(0, 80, 0, 420);
      vg.addColorStop(0, "rgba(0,0,0,0.05)");
      vg.addColorStop(1, "rgba(0,0,0,0.03)");
      this.ctx.fillStyle = vg;
      roundRect(this.ctx, 56, 116, 608, 308, 14);
      this.ctx.fill();
      this.ctx.restore();

      // base plate with soft bevel
      this.ctx.save();
      const plateGrad = this.ctx.createLinearGradient(60, 120, 60, 420);
      plateGrad.addColorStop(0, "#eef6f9");
      plateGrad.addColorStop(1, "#dfeef0");
      this.ctx.fillStyle = plateGrad;
      roundRect(this.ctx, 60, 120, 600, 300, 12);
      this.ctx.fill();

      // inner panel
      this.ctx.fillStyle = "#ffffff";
      roundRect(this.ctx, 80, 140, 560, 260, 12);
      this.ctx.fill();

      // decorative ribs
      this.ctx.strokeStyle = "rgba(40,60,70,0.06)";
      this.ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        this.ctx.beginPath();
        this.ctx.moveTo(120 + i * 100, 150);
        this.ctx.lineTo(120 + i * 100, 380);
        this.ctx.stroke();
      }
      // Pipes (shine)
      this.ctx.strokeStyle = "#c7d8dc";
      this.ctx.lineWidth = 10;
      this.ctx.lineCap = "round";
      this.ctx.beginPath();
      this.ctx.moveTo(80, 240);
      this.ctx.lineTo(140, 240);
      this.ctx.lineTo(140, 200);
      this.ctx.lineTo(200, 200);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(420, 200);
      this.ctx.lineTo(500, 200);
      this.ctx.lineTo(500, 240);
      this.ctx.lineTo(660, 240);
      this.ctx.stroke();

      // pipe subtle steam puffs
      if (Math.random() < 0.02) {
        this._emitSteam(140, 188);
      }
      this.ctx.restore();
    }

    drawGears() {
      // left gear near left pipe
      this.drawGear(160, 180, 36, 12, "#ffd166", this.gearAngle);
      // center gear
      this.drawGear(300, 160, 48, 14, "#ff7b6b", -this.gearAngle * 0.8);
      // right gear small
      this.drawGear(500, 180, 30, 10, "#66c2a5", this.gearAngle * 1.2);
      // animate gear rotation speed slightly based on time
      this.gearAngle += 0.002 + 0.0015 * Math.sin(this.animTime * 1.5);
    }

    drawGear(cx, cy, radius, teeth, color, angle) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      // subtle shadow
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      // gear body with gradient
      const g = ctx.createLinearGradient(-radius, -radius, radius, radius);
      g.addColorStop(0, shadeColor(color, -20));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";

      // teeth
      ctx.fillStyle = shadeColor(color, -16);
      for (let i = 0; i < teeth; i++) {
        ctx.save();
        ctx.rotate((i / teeth) * Math.PI * 2);
        ctx.beginPath();
        // rounded teeth
        const tx = radius - 6;
        ctx.moveTo(tx, -5);
        ctx.quadraticCurveTo(tx + 8, 0, tx, 5);
        ctx.lineTo(tx - 2, 5);
        ctx.quadraticCurveTo(tx + 4, 0, tx - 2, -5);
        ctx.fill();
        ctx.restore();
      }
      // center bolt with highlight
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(6, radius * 0.18), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(
        -Math.max(6, radius * 0.18) * 0.4,
        -Math.max(6, radius * 0.18) * 0.4,
        Math.max(3, radius * 0.08),
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    drawDials() {
      // positions
      const left = { x: 200, y: 280 };
      const right = { x: 360, y: 280 };
      [left, right].forEach((pos, idx) => {
        // outer ring with glossy highlight
        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        const sel = idx === this.selectedDial && this.state === "playing";
        // pulse for selection
        if (sel) {
          this.selectPulse = Math.max(0, this.selectPulse - 0.06);
        } else {
          this.selectPulse = Math.max(0, this.selectPulse - 0.02);
        }
        const pulse = 1 + 0.04 * Math.sin(this.animTime * 6 + idx);
        // shadow
        this.ctx.shadowColor = "rgba(0,0,0,0.12)";
        this.ctx.shadowBlur = 10;
        this.ctx.shadowOffsetY = 4;

        // ring gradient
        const ringGrad = this.ctx.createLinearGradient(-46, -46, 46, 46);
        ringGrad.addColorStop(0, sel ? "#fffdf4" : "#ffffff");
        ringGrad.addColorStop(1, sel ? "#f8fbff" : "#f3f7fa");
        this.ctx.fillStyle = ringGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 46 * pulse, 0, Math.PI * 2);
        this.ctx.fill();

        // inner circle with soft bevel
        const innerGrad = this.ctx.createRadialGradient(-12, -12, 6, 0, 0, 46);
        innerGrad.addColorStop(0, "#ffffff");
        innerGrad.addColorStop(1, "#e3eef1");
        this.ctx.fillStyle = innerGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 36, 0, Math.PI * 2);
        this.ctx.fill();

        // numeral
        this.ctx.shadowColor = "transparent";
        this.ctx.fillStyle = "#12323a";
        this.ctx.font = "bold 24px monospace";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(String(this.dials[idx]), 0, 0);

        // small rim highlight
        this.ctx.beginPath();
        this.ctx.arc(-12, -12, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(255,255,255,0.6)";
        this.ctx.fill();

        // knob detail
        this.ctx.fillStyle = "#a7b8c3";
        this.ctx.beginPath();
        this.ctx.arc(18, -18, 7, 0, Math.PI * 2);
        this.ctx.fill();

        // up/down arrows (soft)
        this.ctx.fillStyle = "#6b7d89";
        this.ctx.beginPath();
        this.ctx.moveTo(-30, -40);
        this.ctx.lineTo(-10, -52);
        this.ctx.lineTo(-10, -28);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.moveTo(-30, 40);
        this.ctx.lineTo(-10, 52);
        this.ctx.lineTo(-10, 28);
        this.ctx.closePath();
        this.ctx.fill();

        // highlight border if selected
        if (sel && this.state === "playing") {
          this.ctx.beginPath();
          this.ctx.lineWidth = 3;
          this.ctx.strokeStyle = `rgba(59,130,246,${0.6 + this.selectPulse * 0.25})`;
          this.ctx.arc(0, 0, 52 + this.selectPulse * 3, 0, Math.PI * 2);
          this.ctx.stroke();
        }

        this.ctx.restore();
      });
    }

    drawControls() {
      // Operation display with little animated label
      this.ctx.fillStyle = "#1f3a3c";
      this.ctx.font = "bold 36px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText(this.operation, 280, 140);

      // Target window with subtle glow
      roundRect(this.ctx, 470, 120, 190, 80, 10);
      const tGrad = this.ctx.createLinearGradient(470, 120, 660, 200);
      tGrad.addColorStop(0, "#ffffff");
      tGrad.addColorStop(1, "#ecf8ff");
      this.ctx.fillStyle = tGrad;
      roundRect(this.ctx, 472, 122, 186, 76, 8);
      this.ctx.fill();

      // target label
      this.ctx.fillStyle = "#2b4950";
      this.ctx.font = "bold 22px monospace";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Target", 565, 145);
      this.ctx.font = "bold 36px monospace";
      this.ctx.fillStyle = "#0b2b2e";
      this.ctx.fillText(String(this.target), 565, 180);

      // Submit button with pressed effect
      roundRect(this.ctx, 520, 240, 140, 60, 10);
      const submitGrad = this.ctx.createLinearGradient(520, 240, 660, 300);
      submitGrad.addColorStop(0, "#9fd6ff");
      submitGrad.addColorStop(1, "#6fb0ff");
      this.ctx.fillStyle = submitGrad;
      roundRect(this.ctx, 522, 242, 136, 56, 8);
      this.ctx.fillStyle = "#042a4a";
      this.ctx.font = "bold 18px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Engage Machine", 590, 272);

      // Hint button
      roundRect(this.ctx, 520, 310, 140, 46, 8);
      const hintGrad = this.ctx.createLinearGradient(520, 310, 660, 356);
      hintGrad.addColorStop(0, "#fff8e6");
      hintGrad.addColorStop(1, "#fff1c8");
      this.ctx.fillStyle = hintGrad;
      roundRect(this.ctx, 522, 312, 136, 42, 6);
      this.ctx.fillStyle = "#5d4321";
      this.ctx.font = "bold 16px sans-serif";
      this.ctx.fillText("Hint (H)", 590, 336);

      // Speaker icon with clearer visuals
      this.ctx.save();
      this.ctx.translate(680, 30);
      this.ctx.fillStyle = this.audio.muted ? "#9a9a9a" : "#17606f";
      this.ctx.beginPath();
      this.ctx.moveTo(-18, -8);
      this.ctx.lineTo(-6, -8);
      this.ctx.lineTo(6, -16);
      this.ctx.lineTo(6, 16);
      this.ctx.lineTo(-6, 8);
      this.ctx.lineTo(-18, 8);
      this.ctx.closePath();
      this.ctx.fill();
      // sound waves
      this.ctx.strokeStyle = this.audio.muted ? "#b6b6b6" : "#17606f";
      this.ctx.lineWidth = 2.4;
      this.ctx.beginPath();
      this.ctx.arc(12, 0, 8, -0.6, 0.6);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.arc(18, 0, 12, -0.6, 0.6);
      this.ctx.stroke();
      this.ctx.restore();

      // Instructions (concise)
      this.ctx.fillStyle = "#123240";
      this.ctx.font = "13px sans-serif";
      this.ctx.textAlign = "left";
      this.ctx.fillText(
        "Tab: switch dials  •  Arrows: adjust  •  Enter: submit  •  H: hint  •  M: mute",
        20,
        30
      );

      // Round & Score badges
      this._drawBadge(20, 46, `Round ${Math.min(this.round + 1, this.roundsTotal)} / ${this.roundsTotal}`, "#f8f9fb");
      this._drawBadge(20, 74, `Score: ${this.score}`, "#e8fff4");
      this._drawBadge(20, 102, `Attempts: ${this.attempts} / ${this.maxAttempts}`, "#fff7f0");
    }

    _drawBadge(x, y, text, bg) {
      this.ctx.fillStyle = bg;
      roundRect(this.ctx, x, y - 14, 210, 28, 8);
      this.ctx.fillStyle = "#123240";
      this.ctx.font = "bold 14px sans-serif";
      this.ctx.textAlign = "left";
      this.ctx.fillText(text, x + 10, y + 6);
    }

    drawRobotFriend() {
      // small friendly robot with soft bobbing
      const x = 80,
        y = 200 + Math.sin(this.animTime * 1.6) * 4;
      // body
      this.ctx.save();
      const bodyGrad = this.ctx.createLinearGradient(x - 20, y - 50, x + 60, y + 30);
      bodyGrad.addColorStop(0, "#ffffff");
      bodyGrad.addColorStop(1, "#e6f7fb");
      this.ctx.fillStyle = bodyGrad;
      roundRect(this.ctx, x - 20, y - 50, 80, 80, 8);
      this.ctx.fill();
      this.ctx.fillStyle = "#d6f0f2";
      roundRect(this.ctx, x - 18, y - 48, 76, 76, 6);
      // eyes with playful blink
      this.ctx.fillStyle = "#123";
      const blink = Math.abs(Math.sin(this.animTime * 2.2)) > 0.9 ? 0.35 : 1;
      this.ctx.globalAlpha = blink;
      this.ctx.beginPath();
      this.ctx.arc(x + 2, y - 10, 6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.arc(x + 32, y - 10, 6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
      // mouth - animated smile
      this.ctx.strokeStyle = "#163a45";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      const smile = Math.sin(this.animTime * 1.4) * 1.6;
      this.ctx.arc(x + 17, y + 6 + smile * 0.4, 12, 0.25 * Math.PI, 0.75 * Math.PI);
      this.ctx.stroke();
      // antenna
      this.ctx.strokeStyle = "#7b9ea0";
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(x + 17, y - 50);
      this.ctx.lineTo(x + 17, y - 70 + Math.sin(this.animTime * 3) * 2);
      this.ctx.stroke();
      this.ctx.fillStyle = "#ff6f61";
      this.ctx.beginPath();
      this.ctx.arc(x + 17, y - 74 + Math.sin(this.animTime * 3) * 2, 6, 0, Math.PI * 2);
      this.ctx.fill();

      // small LED that indicates audio state
      this.ctx.fillStyle = this.audio.muted ? "#bdbdbd" : "#8ef16a";
      this.ctx.beginPath();
      this.ctx.arc(x + 62, y - 42, 5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }

    drawAccessibilityInfo() {
      // Visual cues for audio (small text)
      this.ctx.fillStyle = "#2c3e50";
      this.ctx.font = "12px sans-serif";
      this.ctx.textAlign = "right";
      const audioState = this.audio.muted ? "Muted (M to unmute)" : "Sound on (M to mute)";
      this.ctx.fillText(audioState, this.width - 18, this.height - 12);

      // If audio not available, show warning
      if (!this.audio.enabled) {
        this.ctx.fillStyle = "#8b1e1e";
        this.ctx.font = "bold 14px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText(
          "Audio not available in this browser. Visual feedback enabled.",
          this.width / 2,
          this.height - 12
        );
      }
    }

    loop(ts) {
      const dt = Math.min(0.05, (ts - this._lastTs) / 1000);
      this._lastTs = ts;
      this.animTime = ts / 1000;

      // update particles
      for (let p of this.particles) p.update(dt);
      this.particles = this.particles.filter(p => p.alive());

      // Draw everything
      this.drawBackground();
      this.drawMachineFrame();
      this.drawGears();
      this.drawDials();
      this.drawControls();
      this.drawRobotFriend();
      this.drawAccessibilityInfo();

      // Draw particles
      for (let p of this.particles) p.draw(this.ctx);

      // Draw state-dependent overlays
      if (this.state === "intro") {
        this.ctx.fillStyle = "rgba(8,16,22,0.7)";
        this.ctx.fillRect(60, 120, 600, 260);

        this.ctx.fillStyle = "#fff";
        this.ctx.font = "26px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Welcome to Machine Math!", this.width / 2, 200);
        this.ctx.font = "16px sans-serif";
        this.ctx.fillText(
          "Adjust the dials to make the machine output match the target number.",
          this.width / 2,
          232
        );
        this.ctx.fillText(
          "Operations: +, -, ×. Use keyboard or click. Press Enter to begin.",
          this.width / 2,
          260
        );
      } else if (this.state === "playing") {
        // highlight selected dial visually (soft glow)
        const selPos = this.selectedDial === 0 ? { x: 200, y: 280 } : { x: 360, y: 280 };
        this.ctx.save();
        const rad = this.selectedDial === 0 ? 56 : 56;
        const glow = this.ctx.createRadialGradient(selPos.x, selPos.y, rad * 0.4, selPos.x, selPos.y, rad * 1.2);
        glow.addColorStop(0, "rgba(59,130,246,0.14)");
        glow.addColorStop(1, "rgba(59,130,246,0)");
        this.ctx.fillStyle = glow;
        this.ctx.beginPath();
        this.ctx.arc(selPos.x, selPos.y, rad * 1.2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      } else if (this.state === "success") {
        // quick celebratory overlay (soft)
        this.ctx.fillStyle = "rgba(255,255,255,0.85)";
        this.ctx.fillRect(120, 160, 480, 160);
        this.ctx.fillStyle = "#1a6b4f";
        this.ctx.font = "22px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Nice work!", this.width / 2, 210);
        this.ctx.font = "18px sans-serif";
        this.ctx.fillText(
          `The answer was ${this.solution[0]} ${this.operation} ${this.solution[1]} = ${this.target}`,
          this.width / 2,
          245
        );
      } else if (this.state === "finished") {
        this.ctx.fillStyle = "rgba(10, 20, 30, 0.88)";
        this.ctx.fillRect(80, 120, 560, 240);
        this.ctx.fillStyle = "#fff";
        this.ctx.font = "bold 28px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText("All Machines Complete!", this.width / 2, 190);
        this.ctx.font = "20px sans-serif";
        this.ctx.fillText(`Final Score: ${this.score} / ${this.roundsTotal}`, this.width / 2, 230);
        this.ctx.font = "16px sans-serif";
        this.ctx.fillText("Press Enter to play again. Thanks for playing!", this.width / 2, 270);
      }

      // small floating feedback (current dial values)
      this.ctx.fillStyle = "#0b2b2b";
      this.ctx.font = "bold 18px monospace";
      this.ctx.textAlign = "center";
      this.ctx.fillText(`${this.dials[0]}   ${this.operation}   ${this.dials[1]} = ?`, 280, 340);

      requestAnimationFrame(this.loop);
    }
  }

  // helpers
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function shadeColor(hex, percent) {
    const c = hex.charAt(0) === "#" ? hex.substring(1) : hex;
    const num = parseInt(c, 16);
    let r = ((num >> 16) & 0xff) + percent;
    let g = ((num >> 8) & 0xff) + percent;
    let b = (num & 0xff) + percent;
    r = Math.max(Math.min(255, Math.round(r)), 0);
    g = Math.max(Math.min(255, Math.round(g)), 0);
    b = Math.max(Math.min(255, Math.round(b)), 0);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function mix(a, b, t) {
    // mix two hex colors by t in [-1,1], negative t flips direction
    t = Math.max(-1, Math.min(1, t));
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const tt = (t + 1) / 2;
    const r = Math.round(ca.r + (cb.r - ca.r) * tt);
    const g = Math.round(ca.g + (cb.g - ca.g) * tt);
    const bl = Math.round(ca.b + (cb.b - ca.b) * tt);
    return rgbToHex(r, g, bl);
  }

  function hexToRgb(hex) {
    const h = hex.charAt(0) === "#" ? hex.substring(1) : hex;
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
  }

  // Instantiate game
  const game = new Game(ctx, WIDTH, HEIGHT, audio);

  // Event listeners
  window.addEventListener("keydown", e => {
    game.handleKeyDown(e);
  });

  canvas.addEventListener("mousedown", e => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (canvas.height / rect.height));
    // attempt to initialize audio on user gesture
    if (audio && audio.enabled) {
      audio.ensureInitialized().catch(() => {});
    }
    game.handleMouseDown(x, y);
  });

  // Touch support for mobile
  canvas.addEventListener(
    "touchstart",
    ev => {
      ev.preventDefault();
      const t = ev.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = Math.round((t.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.round((t.clientY - rect.top) * (canvas.height / rect.height));
      if (audio && audio.enabled) {
        audio.ensureInitialized().catch(() => {});
      }
      game.handleMouseDown(x, y);
    },
    { passive: false }
  );

  // Start with intro live message
  liveRegion.textContent =
    "Welcome to Machine Math! Press Enter to begin. Use Tab to switch dials, arrow keys to change values, Enter to submit, H for hint, M to mute.";

  // Handle focus for keyboard accessibility
  canvas.setAttribute("tabindex", "0");
  canvas.style.outline = "none";
  canvas.addEventListener("focus", () => {
    liveRegion.textContent = "Canvas focused. " + liveRegion.textContent;
  });

  // Try to resume audio on first user gesture globally (best effort)
  const resumeAudioOnGesture = () => {
    if (audio && audio.enabled) {
      audio.ensureInitialized().catch(() => {});
      window.removeEventListener("pointerdown", resumeAudioOnGesture);
      window.removeEventListener("keydown", resumeAudioOnGesture);
    }
  };
  window.addEventListener("pointerdown", resumeAudioOnGesture);
  window.addEventListener("keydown", resumeAudioOnGesture);

  // Provide initial visual tidy-up
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
})();