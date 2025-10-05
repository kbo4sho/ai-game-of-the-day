(() => {
  // MACHINE MATH GAME (Enhanced Visuals & Audio)
  // Renders inside element with ID 'game-of-the-day-stage'.
  // Game logic unchanged; only visuals and audio improved.
  // All graphics are canvas-drawn; all sounds via Web Audio API.

  // Utility helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

  // Find container
  const container = document.getElementById('game-of-the-day-stage');
  if (!container) {
    console.error('Game container with ID "game-of-the-day-stage" not found.');
    return;
  }

  // Clear container
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.userSelect = 'none';
  container.style.width = '720px';
  container.style.height = '480px';

  // Create ARIA live region for screen readers (offscreen)
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('role', 'status');
  liveRegion.style.position = 'absolute';
  liveRegion.style.left = '-9999px';
  liveRegion.style.width = '1px';
  liveRegion.style.height = '1px';
  liveRegion.style.overflow = 'hidden';
  container.appendChild(liveRegion);

  // Create canvas exactly 720x480
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.tabIndex = 0; // make focusable for keyboard
  canvas.style.outline = 'none';
  canvas.style.display = 'block';
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: false });

  // Global settings
  const GAME_WIDTH = 720;
  const GAME_HEIGHT = 480;

  // Color palette (soft, kid-friendly)
  const palette = {
    bgTop: '#dff6ff',
    bgBottom: '#eef8fb',
    panel: '#e6f7ff',
    accent: '#3d8fbf',
    warm: '#f2a56a',
    tile: '#ffffff',
    tileText: '#173043',
    gear: '#cfe8f6',
    wrong: '#ea8b8b',
    correct: '#7ad28f',
    text: '#123244',
    dim: '#87a0b3',
    shadow: 'rgba(12,28,36,0.12)'
  };

  // Enhanced Audio manager with ambient pad + gentle effects
  class AudioManager {
    constructor() {
      this.enabled = true;
      this.supported = true;
      this.ctx = null;
      this.master = null;
      this.padNodes = [];
      this.bgGain = null;
      this.initialized = false;
      this.bgPlaying = false;

      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('Web Audio API not supported');
        this.ctx = new AudioContext();

        // master gain
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.85;
        this.master.connect(this.ctx.destination);

        // subtle reverb-ish using convolver is not allowed since no external impulse
        // We'll create a pad from 2 oscillators + filter + slow LFO
        this.bgGain = this.ctx.createGain();
        this.bgGain.gain.value = 0; // start muted
        this.bgGain.connect(this.master);

        // pad oscillators
        const oscA = this.ctx.createOscillator();
        oscA.type = 'sine';
        oscA.frequency.value = 110;
        const oscB = this.ctx.createOscillator();
        oscB.type = 'triangle';
        oscB.frequency.value = 165;

        // lowpass filter for warmth
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 800;
        lp.Q.value = 0.7;

        // gentle LFO controlling gain tremolo
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08; // very slow
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.015;

        lfo.connect(lfoGain);
        lfoGain.connect(this.bgGain.gain);

        oscA.connect(lp);
        oscB.connect(lp);
        lp.connect(this.bgGain);

        oscA.start();
        oscB.start();
        lfo.start();

        this.padNodes = { oscA, oscB, lp, lfo, lfoGain };

        this.initialized = true;
      } catch (e) {
        console.warn('Audio initialization failed:', e);
        this.supported = false;
        this.enabled = false;
      }
    }

    async resumeIfNeeded() {
      if (!this.initialized || !this.ctx) return;
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (e) {
          console.warn('AudioContext resume failed', e);
        }
      }
    }

    toggleBackground(on) {
      if (!this.supported) return;
      this.bgPlaying = !!on;
      // fade smoothly
      if (!this.bgGain) return;
      const now = this.ctx.currentTime;
      this.bgGain.gain.cancelScheduledValues(now);
      if (this.bgPlaying) {
        this.bgGain.gain.setValueAtTime(this.bgGain.gain.value, now);
        this.bgGain.gain.linearRampToValueAtTime(0.03, now + 0.8);
      } else {
        this.bgGain.gain.setValueAtTime(this.bgGain.gain.value, now);
        this.bgGain.gain.linearRampToValueAtTime(0.0, now + 0.6);
      }
      this.resumeIfNeeded().catch(() => {});
    }

    // small helper to play a note with envelope
    playNote(freq = 440, duration = 0.25, type = 'sine', when = 0, volume = 0.06, filterFreq = 1200) {
      if (!this.supported) return;
      try {
        const t0 = this.ctx.currentTime + when;
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.0001;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);

        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        osc.start(t0);
        osc.stop(t0 + duration + 0.02);

        // cleanup
        osc.onended = () => {
          try {
            osc.disconnect();
            filter.disconnect();
            gain.disconnect();
          } catch (e) {}
        };
      } catch (e) {
        console.warn('playNote error', e);
      }
    }

    // small click for placing tile
    click() {
      if (!this.supported) return;
      this.resumeIfNeeded().catch(() => {});
      // short high click
      this.playNote(1100, 0.08, 'square', 0, 0.04, 2500);
    }

    // pleasant success melody (calm, not loud)
    beepCorrect() {
      if (!this.supported) return;
      this.resumeIfNeeded().catch(() => {});
      // three gentle tones ascending
      this.playNote(660, 0.12, 'sine', 0, 0.05, 1200);
      this.playNote(880, 0.12, 'sine', 0.12, 0.05, 1200);
      this.playNote(1100, 0.18, 'sine', 0.26, 0.06, 1400);
    }

    // soft error buzz
    beepWrong() {
      if (!this.supported) return;
      this.resumeIfNeeded().catch(() => {});
      this.playNote(220, 0.28, 'sawtooth', 0, 0.04, 600);
      this.playNote(160, 0.16, 'sine', 0.14, 0.03, 600);
    }

    // small celebratory chime cluster (for end of game)
    celebratory() {
      if (!this.supported) return;
      this.resumeIfNeeded().catch(() => {});
      const base = 520;
      const offsets = [0, 4, 7, 12];
      offsets.forEach((o, i) => {
        this.playNote(
          base * Math.pow(1.05946, o),
          0.14 + i * 0.02,
          'triangle',
          i * 0.06,
          0.045 + i * 0.005,
          1600
        );
      });
    }
  }

  const audio = new AudioManager();

  // Game logic (visuals & audio enhanced, math unchanged)
  class MachineMathGame {
    constructor(ctx, audio) {
      this.ctx = ctx;
      this.audio = audio;
      this.round = 0;
      this.maxRounds = 6;
      this.state = 'intro'; // intro, playing, celebrating, finished
      this.tiles = Array.from({ length: 10 }, (_, i) => i); // 0-9
      this.slotA = null;
      this.slotB = null;
      this.cursor = 0; // keyboard selection index among tiles
      this.message = 'Press Enter or Click a number tile to feed the machine';
      this.msgTimer = 0;
      this.animTime = 0;
      this.roundData = [];
      this.failedAttempts = 0;
      this.generateRounds();
      this.onAction = null; // optional callback
      this.focused = false;
      this.audioOn = !!(this.audio && this.audio.supported && this.audio.bgPlaying);
      this.audioAvailable = !!(this.audio && this.audio.supported);
      this.particles = []; // for confetti / celebration
      this.robotBlink = 0; // blink timer
      this.tileScales = new Array(this.tiles.length).fill(0); // hover animation scales
      this.initAccessibility();
      this.announce('Welcome to Machine Math! Press Enter to begin.');
    }

    generateRounds() {
      // Generate solvable rounds by picking two numbers and operation
      this.roundData = [];
      for (let i = 0; i < this.maxRounds; i++) {
        let op = '+';
        if (i < 3) op = '+';
        else if (i < 5) op = '-';
        else op = Math.random() < 0.5 ? '+' : '-';
        let a = randInt(0, 9);
        let b = randInt(0, 9);
        if (op === '-' && a < b) [a, b] = [b, a];
        const target = op === '+' ? a + b : a - b;
        this.roundData.push({ op, a, b, target });
      }
    }

    initAccessibility() {
      const instr = `Machine Math. Use Arrow keys to move selection. Press Enter to place a number. Press Backspace to clear a slot.
        Press A to toggle audio. Press R to restart. Click the speaker in top-right to toggle audio.`;
      liveRegion.textContent = instr;
    }

    start() {
      this.state = 'playing';
      this.round = 0;
      this.slotA = null;
      this.slotB = null;
      this.cursor = 0;
      this.failedAttempts = 0;
      this.audioOn = !!(this.audio && this.audio.supported && this.audio.bgPlaying);
      this.announce('Round 1. Solve the machine!');
    }

    currentRound() {
      return this.roundData[this.round];
    }

    placeTile(index) {
      const value = this.tiles[index];
      if (this.slotA === null) {
        this.slotA = { index, value };
      } else if (this.slotB === null) {
        this.slotB = { index, value };
      } else {
        this.slotB = { index, value };
      }
      this.msg('Placed ' + value);
      // audio click feedback (non-intrusive)
      try {
        if (this.audio && this.audio.supported) this.audio.click();
      } catch (e) {
        console.warn('Audio click failed', e);
      }
      // small pop animation for that tile
      this.tileScales[index] = 1.0;
      this.checkIfReady();
    }

    removeLastSlot() {
      if (this.slotB !== null) {
        this.msg('Removed ' + this.slotB.value);
        this.slotB = null;
      } else if (this.slotA !== null) {
        this.msg('Removed ' + this.slotA.value);
        this.slotA = null;
      } else {
        this.msg('No slots to clear');
      }
    }

    clearSlots() {
      this.slotA = null;
      this.slotB = null;
    }

    msg(text) {
      this.message = text;
      this.msgTimer = 180; // show for some frames
      liveRegion.textContent = text;
    }

    announce(text) {
      liveRegion.textContent = text;
    }

    checkIfReady() {
      if (this.slotA && this.slotB) {
        const round = this.currentRound();
        if (!round) return;
        const computed =
          round.op === '+' ? this.slotA.value + this.slotB.value : this.slotA.value - this.slotB.value;
        const target = round.target;
        if (computed === target) {
          // success
          try {
            if (this.audio && this.audio.supported) this.audio.beepCorrect();
          } catch (e) {}
          this.msg('Correct! Machine accepted the input.');
          // spawn gentle celebration particles and sound
          this.spawnCelebration();
          // keep original celebrate timing but add extra visuals/audio
          this.celebrate(() => {
            this.round++;
            if (this.round >= this.maxRounds) {
              this.state = 'finished';
              try {
                if (this.audio && this.audio.supported) this.audio.celebratory();
              } catch (e) {}
              this.announce('All rounds complete! Great job! Press R to play again.');
            } else {
              this.clearSlots();
              this.state = 'playing';
              this.msg(`Round ${this.round + 1}. Next machine ready.`);
              this.announce(`Round ${this.round + 1}.`);
            }
            if (this.onAction) this.onAction();
          });
        } else {
          // wrong
          try {
            if (this.audio && this.audio.supported) this.audio.beepWrong();
          } catch (e) {}
          this.failedAttempts++;
          this.msg('That did not match the target. Try again.');
          this.shake();
          this.slotB = null;
          if (this.failedAttempts >= 5) {
            this.revealHint();
            this.failedAttempts = 0;
          }
        }
      }
    }

    revealHint() {
      const round = this.currentRound();
      if (!round) return;
      this.slotA = { index: round.a, value: round.a };
      this.slotB = null;
      this.msg(`Hint: one slot filled with ${round.a}`);
      this.announce('Hint provided.');
    }

    celebrate(done) {
      // Visual celebration layered on top, keep timing similar
      this.state = 'celebrating';
      // spawn a few particles already (in addition to spawnCelebration)
      this.spawnCelebration(18);
      setTimeout(() => {
        this.state = 'playing';
        if (done) done();
      }, 1000);
    }

    shake() {
      this.animTime = 18;
    }

    toggleAudio() {
      if (!this.audioAvailable) {
        this.msg('Audio not available in this browser.');
        return;
      }
      this.audioOn = !this.audioOn;
      this.audio.toggleBackground(this.audioOn);
      this.msg(this.audioOn ? 'Audio on' : 'Audio off');
      this.announce(this.audioOn ? 'Audio enabled' : 'Audio disabled');
    }

    restart() {
      this.generateRounds();
      this.round = 0;
      this.clearSlots();
      this.state = 'playing';
      this.msg('Game restarted. Good luck!');
      this.announce('Game restarted.');
    }

    keyboardMove(dir) {
      this.cursor = (this.cursor + dir + this.tiles.length) % this.tiles.length;
      // gentle hover pulse
      this.tileScales[this.cursor] = 0.7;
    }

    handleKey(e) {
      if (this.state === 'intro' && (e.key === 'Enter' || e.key === ' ')) {
        this.start();
        return;
      }
      if (e.key === 'a' || e.key === 'A') {
        if (this.audioAvailable) this.audio.resumeIfNeeded().catch(() => {});
        this.toggleAudio();
      } else if (e.key === 'r' || e.key === 'R') {
        this.restart();
      } else if (e.key === 'ArrowLeft') {
        this.keyboardMove(-1);
      } else if (e.key === 'ArrowRight') {
        this.keyboardMove(1);
      } else if (e.key === 'Enter') {
        this.placeTile(this.cursor);
      } else if (e.key === 'Backspace') {
        this.removeLastSlot();
      } else if (e.key === ' ') {
        this.placeTile(this.cursor);
      }
    }

    handleMouseClick(x, y) {
      if (x >= GAME_WIDTH - 46 && x <= GAME_WIDTH - 10 && y >= 10 && y <= 46) {
        this.toggleAudio();
        return;
      }

      const tileY = GAME_HEIGHT - 120;
      if (y >= tileY && y <= GAME_HEIGHT - 20) {
        const tileCount = this.tiles.length;
        const spacing = 60;
        const startX = (GAME_WIDTH - (spacing * tileCount - 10)) / 2;
        for (let i = 0; i < tileCount; i++) {
          const cx = startX + i * spacing;
          const cy = tileY + 40;
          const r = 24;
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
            this.cursor = i;
            this.placeTile(i);
            return;
          }
        }
      }

      const slotABox = { x: 180, y: 170, w: 90, h: 90 };
      const slotBBox = { x: 360, y: 170, w: 90, h: 90 };
      if (
        x >= slotABox.x &&
        x <= slotABox.x + slotABox.w &&
        y >= slotABox.y &&
        y <= slotABox.y + slotABox.h
      ) {
        if (this.slotA) {
          this.msg(`Removed ${this.slotA.value}`);
          this.slotA = null;
          return;
        }
      }
      if (
        x >= slotBBox.x &&
        x <= slotBBox.x + slotBBox.w &&
        y >= slotBBox.y &&
        y <= slotBBox.y + slotBBox.h
      ) {
        if (this.slotB) {
          this.msg(`Removed ${this.slotB.value}`);
          this.slotB = null;
          return;
        }
      }
    }

    update() {
      if (this.msgTimer > 0) this.msgTimer--;
      if (this.animTime > 0) this.animTime--;
      // tile scale animations decay
      for (let i = 0; i < this.tileScales.length; i++) {
        if (this.tileScales[i] > 0) {
          this.tileScales[i] = Math.max(0, this.tileScales[i] - 0.05);
        }
      }

      // robot blink timer
      if (this.robotBlink <= 0 && Math.random() < 0.002) this.robotBlink = 20;
      if (this.robotBlink > 0) this.robotBlink--;

      // update particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.vy += 0.06;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        p.rotation += p.vr;
        if (p.y > GAME_HEIGHT + 20 || p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    draw() {
      const c = this.ctx;
      // clear with vertical gradient
      const g = c.createLinearGradient(0, 0, 0, GAME_HEIGHT);
      g.addColorStop(0, palette.bgTop);
      g.addColorStop(1, palette.bgBottom);
      c.fillStyle = g;
      c.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Soft floating shapes (background)
      this.drawBackgroundShapes(c);

      // friendly robot character left
      this.drawRobot(c);

      // machine body
      this.drawMachine(c);

      // slots
      this.drawSlots(c);

      // tiles row
      this.drawTiles(c);

      // top info
      this.drawTopInfo(c);

      // message bar
      this.drawMessage(c);

      // audio visual indicator (speaker)
      this.drawAudioIcon(c);

      // particles (celebration)
      this.drawParticles(c);

      // hints
      this.drawHints(c);
    }

    drawBackgroundShapes(c) {
      // soft hills
      c.save();
      c.globalAlpha = 0.9;
      c.fillStyle = '#e6fbff';
      c.beginPath();
      c.moveTo(0, 240);
      c.bezierCurveTo(120, 200, 220, 280, 360, 260);
      c.bezierCurveTo(480, 240, 600, 300, 720, 260);
      c.lineTo(720, 480);
      c.lineTo(0, 480);
      c.closePath();
      c.fill();

      // subtle orbs
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 110 + Math.sin(Date.now() / 800 + i) * 6;
        const y = 80 + (i % 2 ? 20 : -10);
        const r = 28 + (i % 3) * 4;
        c.beginPath();
        c.fillStyle = `rgba(70,140,180,${0.04 + (i % 3) * 0.02})`;
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    drawRobot(c) {
      // friendly robot left of machine
      const x = 70;
      const y = 230;
      // shadow
      c.fillStyle = palette.shadow;
      c.beginPath();
      c.ellipse(x, y + 58, 48, 14, 0, 0, Math.PI * 2);
      c.fill();

      // body with gradient
      const g = c.createLinearGradient(x - 48, y - 60, x + 48, y + 60);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#d9f6ff');
      c.fillStyle = g;
      c.strokeStyle = '#b9dfe8';
      c.lineWidth = 2;

      c.beginPath();
      c.roundRect = function (rx, ry, rw, rh, rr) {
        // helper
        this.moveTo(rx + rr, ry);
        this.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
        this.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
        this.arcTo(rx, ry + rh, rx, ry, rr);
        this.arcTo(rx, ry, rx + rw, ry, rr);
      };
      c.beginPath();
      c.roundRect(x - 46, y - 64, 92, 116, 12);
      c.fill();
      c.stroke();

      // face screen
      c.fillStyle = '#eafcff';
      c.fillRect(x - 30, y - 48, 60, 38);
      c.strokeStyle = '#cfe8f6';
      c.strokeRect(x - 30, y - 48, 60, 38);

      // eyes (blinking)
      c.fillStyle = '#123244';
      if (this.robotBlink > 12) {
        // open
        c.beginPath();
        c.arc(x - 12, y - 30, 6, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.arc(x + 12, y - 30, 6, 0, Math.PI * 2);
        c.fill();
      } else {
        // closed subtle line
        c.strokeStyle = '#123244';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x - 18, y - 30);
        c.lineTo(x - 6, y - 30);
        c.stroke();
        c.beginPath();
        c.moveTo(x + 6, y - 30);
        c.lineTo(x + 18, y - 30);
        c.stroke();
      }

      // smile
      c.strokeStyle = '#88b7c9';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y - 14, 10, 0, Math.PI);
      c.stroke();

      // antenna
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(x, y - 74, 6, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#cfe8f6';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y - 68);
      c.lineTo(x, y - 52);
      c.stroke();
    }

    drawMachine(c) {
      c.save();
      const shakeOffset = this.animTime > 0 ? Math.sin(this.animTime * 0.7) * 6 : 0;
      c.translate(shakeOffset, 0);

      const mX = 120;
      const mY = 120;
      const mW = 480;
      const mH = 200;

      // machine outer with subtle border and shadow
      c.fillStyle = '#f8feff';
      c.shadowColor = palette.shadow;
      c.shadowBlur = 18;
      c.fillRect(mX, mY, mW, mH);
      c.shadowBlur = 0;
      c.strokeStyle = '#cfe8f6';
      c.lineWidth = 3;
      c.strokeRect(mX, mY, mW, mH);

      // decorative top strip
      const stripG = c.createLinearGradient(mX, mY, mX, mY + 36);
      stripG.addColorStop(0, '#dff6ff');
      stripG.addColorStop(1, '#eafcff');
      c.fillStyle = stripG;
      c.fillRect(mX, mY, mW, 36);

      // control panel
      c.fillStyle = '#fff';
      c.strokeStyle = '#d3eef8';
      c.fillRect(mX + 20, mY + 16, 140, 56);
      c.strokeRect(mX + 20, mY + 16, 140, 56);
      // knob
      c.fillStyle = palette.accent;
      c.beginPath();
      c.arc(mX + 90, mY + 44, 14, 0, Math.PI * 2);
      c.fill();

      // target display
      const screenX = mX + mW - 150;
      const screenY = mY + 22;
      c.fillStyle = '#062033';
      c.fillRect(screenX, screenY, 132, 60);
      c.fillStyle = '#eaf6ff';
      c.font = '32px Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const round = this.currentRound() || { target: '--', op: '?' };
      c.fillText(`${round.target}`, screenX + 66, screenY + 30);

      // machine window with animated gears
      const winX = mX + 80;
      const winY = mY + 90;
      const winW = 320;
      const winH = 88;
      c.fillStyle = '#e9fbff';
      c.fillRect(winX, winY, winW, winH);
      c.strokeStyle = '#d9f0f8';
      c.strokeRect(winX, winY, winW, winH);

      // gears
      const time = Date.now() / 400;
      this.drawGear(c, winX + 60, winY + 44, 30, 12, time * 1.0, '#c3e2f4');
      this.drawGear(c, winX + 160, winY + 44, 22, 9, -time * 1.3, '#b8dff0');
      this.drawGear(c, winX + 260, winY + 44, 16, 8, time * 1.9, '#d7effc');

      c.restore();
    }

    drawGear(c, cx, cy, radius, teeth, angle, color) {
      c.save();
      c.translate(cx, cy);
      c.rotate(angle);
      c.fillStyle = color;
      c.beginPath();
      const inner = radius * 0.6;
      for (let i = 0; i < teeth; i++) {
        const a1 = (i / teeth) * Math.PI * 2;
        const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
        const a3 = ((i + 1) / teeth) * Math.PI * 2;
        c.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
        c.lineTo(Math.cos(a2) * (radius + 6), Math.sin(a2) * (radius + 6));
        c.lineTo(Math.cos(a3) * radius, Math.sin(a3) * radius);
      }
      c.closePath();
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(0, 0, inner, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    drawSlots(c) {
      c.font = '20px Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      const slotABox = { x: 180, y: 170, w: 90, h: 90 };
      const slotBBox = { x: 360, y: 170, w: 90, h: 90 };

      c.fillStyle = palette.text;
      c.fillText('Input A', slotABox.x + slotABox.w / 2, slotABox.y - 12);
      c.fillText('Input B', slotBBox.x + slotBBox.w / 2, slotBBox.y - 12);

      // slot backgrounds with soft bevel
      const drawSlotBox = (box) => {
        const grad = c.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#f1fbff');
        c.fillStyle = grad;
        c.strokeStyle = '#d3eef8';
        c.lineWidth = 2;
        c.fillRect(box.x, box.y, box.w, box.h);
        c.strokeRect(box.x, box.y, box.w, box.h);
      };
      drawSlotBox(slotABox);
      drawSlotBox(slotBBox);

      if (this.slotA) {
        this.drawTileOnSlot(c, slotABox.x + slotABox.w / 2, slotABox.y + slotABox.h / 2, this.slotA.value);
      } else {
        c.fillStyle = '#eef9ff';
        c.font = '18px Arial';
        c.fillText('choose', slotABox.x + slotABox.w / 2, slotABox.y + slotABox.h / 2);
      }

      if (this.slotB) {
        this.drawTileOnSlot(c, slotBBox.x + slotBBox.w / 2, slotBBox.y + slotBBox.h / 2, this.slotB.value);
      } else {
        c.fillStyle = '#eef9ff';
        c.font = '18px Arial';
        c.fillText('choose', slotBBox.x + slotBBox.w / 2, slotBBox.y + slotBBox.h / 2);
      }

      const op = (this.currentRound() && this.currentRound().op) || '?';
      c.fillStyle = palette.warm;
      c.beginPath();
      c.arc(300, 210, 26, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#123244';
      c.font = '22px Arial';
      c.fillText(op, 300, 210);
    }

    drawTileOnSlot(c, x, y, val) {
      c.fillStyle = palette.tile;
      c.strokeStyle = palette.dim;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y - 4, 30, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = palette.tileText;
      c.font = '26px Arial';
      c.fillText(val, x, y - 6);
      // subtle glow when filled
      c.save();
      c.globalAlpha = 0.08;
      c.fillStyle = palette.correct;
      c.beginPath();
      c.arc(x, y - 4, 40, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    drawTiles(c) {
      const tileCount = this.tiles.length;
      const spacing = 60;
      const startX = (GAME_WIDTH - (spacing * tileCount - 10)) / 2;
      const baseY = GAME_HEIGHT - 120;
      for (let i = 0; i < tileCount; i++) {
        const cx = startX + i * spacing;
        const cy = baseY + 40;
        const baseR = 24;
        // scale for animation
        const s = 1 + (this.cursor === i ? 0.06 : 0) + (this.tileScales[i] || 0) * 0.12;
        const r = baseR * s;

        // shadow
        c.fillStyle = palette.shadow;
        c.beginPath();
        c.ellipse(cx, cy + r + 4, r + 6, r / 2, 0, 0, Math.PI * 2);
        c.fill();

        // tile
        const grad = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#f3fbff');
        c.fillStyle = grad;
        c.strokeStyle = this.cursor === i ? palette.accent : '#d7eaef';
        c.lineWidth = this.cursor === i ? 3 : 2;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
        c.stroke();

        // number
        c.fillStyle = palette.tileText;
        c.font = `${18 + Math.round(6 * s)}px Arial`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(this.tiles[i], cx, cy - 4);
      }
    }

    drawTopInfo(c) {
      c.fillStyle = palette.text;
      c.font = '16px Arial';
      c.textAlign = 'left';
      c.fillText(`Round ${this.round + 1} / ${this.maxRounds}`, 20, 28);
      const round = this.currentRound();
      c.fillText(`Operation: ${round ? round.op : '-'}`, 20, 54);
      c.textAlign = 'right';
      c.fillText(`Target: ${round ? round.target : '--'}`, GAME_WIDTH - 20, 36);
    }

    drawMessage(c) {
      // bottom message bar with subtle gradient
      const y = GAME_HEIGHT - 64;
      const g = c.createLinearGradient(0, y, 0, y + 64);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#f6fbff');
      c.fillStyle = g;
      c.fillRect(0, y, GAME_WIDTH, 64);
      c.strokeStyle = '#d6e8f2';
      c.strokeRect(0, y, GAME_WIDTH, 64);
      c.fillStyle = palette.text;
      c.font = '16px Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.message || '', GAME_WIDTH / 2, GAME_HEIGHT - 32);
    }

    drawAudioIcon(c) {
      const x = GAME_WIDTH - 24;
      const y = 28;
      // box
      c.fillStyle = '#fff';
      c.strokeStyle = '#d6e8f2';
      c.fillRect(GAME_WIDTH - 58, 10, 48, 36);
      c.strokeRect(GAME_WIDTH - 58, 10, 48, 36);

      // speaker body
      c.fillStyle = this.audioOn ? palette.accent : '#9fb7c8';
      c.beginPath();
      c.moveTo(x - 10, y - 6);
      c.lineTo(x - 2, y - 6);
      c.lineTo(x + 6, y - 14);
      c.lineTo(x + 6, y + 14);
      c.lineTo(x - 2, y + 6);
      c.lineTo(x - 10, y + 6);
      c.closePath();
      c.fill();

      // waves
      if (this.audioOn) {
        c.strokeStyle = palette.accent;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x + 8, y - 2, 8, -0.8, 0.8);
        c.stroke();
      } else {
        c.strokeStyle = '#c1d7df';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x + 6, y - 10);
        c.lineTo(x + 14, y + 8);
        c.stroke();
      }
    }

    spawnCelebration(count = 28) {
      // Create gentle confetti-like particles
      for (let i = 0; i < count; i++) {
        const angle = rand(-Math.PI / 2 - 0.8, -Math.PI / 2 + 0.8);
        const speed = rand(1, 4);
        const x = rand(200, 520);
        const y = rand(140, 220);
        const size = rand(6, 12);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed * rand(0.6, 1.2),
          vy: Math.sin(angle) * speed * rand(0.6, 1.2),
          life: randInt(60, 120),
          size,
          color: ['#ffcc66', '#78d6a3', '#8fcff9', '#f7a07a'][randInt(0, 3)],
          rotation: rand(0, Math.PI * 2),
          vr: rand(-0.08, 0.08)
        });
      }
    }

    drawParticles(c) {
      for (const p of this.particles) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rotation);
        c.fillStyle = p.color;
        c.globalAlpha = clamp(p.life / 120, 0, 1);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        c.restore();
      }
    }

    drawHints(c) {
      c.fillStyle = '#3f5f6f';
      c.font = '12px Arial';
      c.textAlign = 'left';
      c.fillText('Keys: ← → to move, Enter to place, Backspace to remove, A audio, R restart', 12, GAME_HEIGHT - 8);
    }
  }

  // Instantiate game
  const game = new MachineMathGame(ctx, audio);

  // Focus canvas for keyboard
  canvas.addEventListener('focus', () => {
    game.focused = true;
  });
  canvas.addEventListener('blur', () => {
    game.focused = false;
  });

  // Pointer handling
  canvas.addEventListener('mousedown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
    try {
      if (audio && audio.supported) audio.resumeIfNeeded().catch(() => {});
    } catch (e) {
      console.warn('Audio resume on click failed', e);
    }
    game.handleMouseClick(x, y);
  });

  // Keyboard handling on canvas
  canvas.addEventListener('keydown', (ev) => {
    if (['ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'Backspace'].includes(ev.key)) {
      ev.preventDefault();
    }
    try {
      game.handleKey(ev);
    } catch (e) {
      console.error('Key handling error', e);
    }
  });

  // Forward keys globally when canvas focused (accessibility)
  window.addEventListener('keydown', (ev) => {
    if (document.activeElement !== canvas) return;
    if (['ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', ' ', 'a', 'A', 'r', 'R'].includes(ev.key)) {
      const event = new KeyboardEvent('keydown', ev);
      canvas.dispatchEvent(event);
    }
  });

  // Game loop
  function loop() {
    game.update();
    game.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Intro overlay (brief)
  let introFrames = 180;
  function introAnimate() {
    if (introFrames <= 0) return;
    const c = ctx;
    c.save();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    c.fillStyle = '#123244';
    c.font = '34px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('Machine Math', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
    c.font = '18px Arial';
    c.fillText('Feed numbers to the machine to reach the target number', GAME_WIDTH / 2, GAME_HEIGHT / 2);
    c.fillText('Use arrows + Enter, or click tiles. Press A to toggle audio.', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
    c.restore();
    introFrames--;
    if (introFrames > 0) requestAnimationFrame(introAnimate);
  }
  introAnimate();

  // Screen reader hint
  liveRegion.textContent =
    'Machine Math ready. Use arrow keys to move, Enter to place numbers, Backspace to remove. Press A to toggle audio, R to restart. Click the canvas and interact to enable audio.';

  // Expose simple API for testing (optional)
  window._machineMathGame = {
    restart: () => game.restart(),
    toggleAudio: () => game.toggleAudio(),
    audioAvailable: audio.supported
  };
})();