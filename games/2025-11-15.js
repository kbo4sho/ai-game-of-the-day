(function () {
  // Enhanced Drone Math Game - Visuals & Audio Improvements Only
  // Renders entirely inside #game-of-the-day-stage
  // All visuals via canvas, all sounds via Web Audio API oscillators/filters
  // Goal and mechanics preserved: Answer 10 questions correctly to win, 3 wrong -> Game Over

  // Ensure container exists
  const container = document.getElementById('game-of-the-day-stage')
  if (!container) {
    console.error('Container element with id "game-of-the-day-stage" not found.')
    return
  }

  // Clear container and create canvas with exact game area
  container.innerHTML = ''
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 480
  canvas.style.width = '720px'
  canvas.style.height = '480px'
  canvas.setAttribute('role', 'application')
  canvas.setAttribute('aria-label', 'Drone Math Game: answer questions to collect stars')
  canvas.tabIndex = 0 // focusable for keyboard
  container.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  // Constants for UI layout - ensure padding and non-overlapping
  const WIDTH = canvas.width
  const HEIGHT = canvas.height
  const PADDING = 12 // >=10px
  const SCORE_X = PADDING
  const SCORE_Y = PADDING
  const LIVES_X = WIDTH - PADDING
  const LIVES_Y = PADDING
  const INSTRUCTIONS_Y = HEIGHT - 68 // bottom-center instructions
  const BODY_FONT = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial'
  const TITLE_FONT = '22px "Segoe UI", Roboto, Arial'
  const IMPORTANT_FONT = '20px "Segoe UI", Roboto, Arial'

  // Game settings (kept unchanged)
  const TARGET_CORRECT = 10
  const MAX_WRONG = 3
  const OPTION_COUNT = 3

  // ---------------- Audio Manager ----------------
  class AudioManager {
    constructor() {
      this.enabled = true
      this.context = null
      this.masterGain = null
      this.bgNodes = []
      this._initError = null
      this._initAttempted = false
    }

    async init() {
      if (this._initAttempted) return
      this._initAttempted = true
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) throw new Error('Web Audio API not supported.')
        this.context = new Ctx()
        // Master gain for overall volume control
        this.masterGain = this.context.createGain()
        this.masterGain.gain.value = 0.08
        this.masterGain.connect(this.context.destination)

        // Create a gentle ambient pad: two detuned oscillators through lowpass
        const padGain = this.context.createGain()
        padGain.gain.value = 0.0 // start silent, ramp up slightly
        const padFilter = this.context.createBiquadFilter()
        padFilter.type = 'lowpass'
        padFilter.frequency.value = 900
        padFilter.Q.value = 0.6
        padGain.connect(padFilter)
        padFilter.connect(this.masterGain)

        const oscA = this.context.createOscillator()
        oscA.type = 'sine'
        oscA.frequency.value = 220
        const oscB = this.context.createOscillator()
        oscB.type = 'sine'
        oscB.frequency.value = 227 // slight detune for warmth

        const padLfo = this.context.createOscillator()
        padLfo.type = 'sine'
        padLfo.frequency.value = 0.07
        const lfoGain = this.context.createGain()
        lfoGain.gain.value = 0.03
        padLfo.connect(lfoGain)
        lfoGain.connect(padGain.gain)

        oscA.connect(padGain)
        oscB.connect(padGain)

        // Fade in gently
        const now = this.context.currentTime
        padGain.gain.cancelScheduledValues(now)
        padGain.gain.setValueAtTime(0.0001, now)
        padGain.gain.exponentialRampToValueAtTime(0.035, now + 1.2)

        oscA.start(now)
        oscB.start(now)
        padLfo.start(now)

        this.bgNodes.push({ oscA, oscB, padLfo, padGain, padFilter })

        // Low-rate "air current" subtle noise using oscillator and bandpass
        const windOsc = this.context.createOscillator()
        windOsc.type = 'triangle'
        windOsc.frequency.value = 0.5
        const windGain = this.context.createGain()
        windGain.gain.value = 0.01
        windOsc.connect(windGain)
        windGain.connect(this.masterGain)
        windOsc.start(now)
        this.bgNodes.push({ windOsc, windGain })
      } catch (e) {
        console.warn('Audio initialization failed:', e)
        this._initError = e
        this.context = null
      }
    }

    isAvailable() {
      return !!this.context && !this._initError
    }

    toggle() {
      this.enabled = !this.enabled
      // Visual-only toggle - reduce master gain when disabled
      if (this.masterGain && this.context) {
        try {
          const now = this.context.currentTime
          this.masterGain.gain.cancelScheduledValues(now)
          const target = this.enabled ? 0.08 : 0.0001
          this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
          this.masterGain.gain.exponentialRampToValueAtTime(target, now + 0.2)
        } catch (e) {
          console.warn('Audio toggle error', e)
        }
      }
    }

    // Play a short pleasant chord / sparkle for correct answer
    playCorrect() {
      if (!this.enabled || !this.context) return
      try {
        const ctx = this.context
        const now = ctx.currentTime
        const out = this.masterGain

        // create three quick oscillators for a major chord
        const freqs = [880, 1100, 1320]
        freqs.forEach((f, idx) => {
          const osc = ctx.createOscillator()
          osc.type = idx === 0 ? 'triangle' : 'sine'
          osc.frequency.value = f
          const g = ctx.createGain()
          g.gain.value = 0.0001
          const filt = ctx.createBiquadFilter()
          filt.type = 'highpass'
          filt.frequency.value = 350
          osc.connect(filt)
          filt.connect(g)
          g.connect(out)

          g.gain.setValueAtTime(0.0001, now)
          g.gain.exponentialRampToValueAtTime(0.16 / (idx + 1.2), now + 0.02 + idx * 0.01)
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 + idx * 0.02)

          osc.start(now)
          osc.stop(now + 0.5 + idx * 0.02)
        })

        // little sparkle noise: short bandpassed noise via oscillator modulation
        const mod = ctx.createOscillator()
        mod.type = 'sine'
        mod.frequency.value = 2400
        const mg = ctx.createGain()
        mg.gain.value = 0.0
        mod.connect(mg)
        mg.connect(out)
        mod.start(now)
        mg.gain.setValueAtTime(0.0001, now)
        mg.gain.linearRampToValueAtTime(0.04, now + 0.01)
        mg.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
        mod.stop(now + 0.2)
      } catch (e) {
        console.warn('playCorrect error', e)
      }
    }

    // Soft buzz for incorrect answer (short low rumble)
    playIncorrect() {
      if (!this.enabled || !this.context) return
      try {
        const ctx = this.context
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = 160
        const g = ctx.createGain()
        g.gain.value = 0.0001
        const filt = ctx.createBiquadFilter()
        filt.type = 'lowpass'
        filt.frequency.value = 700
        osc.connect(filt)
        filt.connect(g)
        g.connect(this.masterGain)

        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(0.14, now + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.36)

        osc.start(now)
        osc.stop(now + 0.4)
      } catch (e) {
        console.warn('playIncorrect error', e)
      }
    }

    // Click/selection sound (small)
    playClick(pan = 0) {
      if (!this.enabled || !this.context) return
      try {
        const ctx = this.context
        const now = ctx.currentTime
        // use panner for subtle spatialization
        const panner = ctx.createStereoPanner()
        panner.pan.value = pan
        const osc = ctx.createOscillator()
        osc.type = 'square'
        osc.frequency.value = 720
        const g = ctx.createGain()
        g.gain.value = 0.0001
        osc.connect(g)
        g.connect(panner)
        panner.connect(this.masterGain)

        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)

        osc.start(now)
        osc.stop(now + 0.14)
      } catch (e) {
        console.warn('playClick error', e)
      }
    }

    // Victory flourish
    playVictory() {
      if (!this.enabled || !this.context) return
      try {
        const ctx = this.context
        const now = ctx.currentTime
        // mellow rising arpeggio
        const base = 520
        const notes = [base, base * 1.25, base * 1.5, base * 2]
        notes.forEach((n, i) => {
          const osc = ctx.createOscillator()
          osc.type = 'sine'
          osc.frequency.value = n
          const g = ctx.createGain()
          g.gain.value = 0.0001
          osc.connect(g)
          g.connect(this.masterGain)
          const start = now + i * 0.08
          g.gain.setValueAtTime(0.0001, start)
          g.gain.exponentialRampToValueAtTime(0.14 / (1 + i * 0.2), start + 0.04)
          g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5 + i * 0.03)
          osc.start(start)
          osc.stop(start + 0.6)
        })
      } catch (e) {
        console.warn('playVictory error', e)
      }
    }

    // Game over low thud
    playGameOver() {
      if (!this.enabled || !this.context) return
      try {
        const ctx = this.context
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = 110
        const g = ctx.createGain()
        g.gain.value = 0.0001
        const filt = ctx.createBiquadFilter()
        filt.type = 'lowpass'
        filt.frequency.value = 600
        osc.connect(filt)
        filt.connect(g)
        g.connect(this.masterGain)

        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(0.2, now + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)

        osc.start(now)
        osc.stop(now + 0.9)
      } catch (e) {
        console.warn('playGameOver error', e)
      }
    }
  }

  const audio = new AudioManager()

  // ---------------- Question Generator (unchanged) ----------------
  class QuestionGenerator {
    static generate(difficultyLevel = 1) {
      const types = ['add', 'sub', 'mul']
      const type = types[Math.floor(Math.random() * types.length)]
      let a, b, answer
      if (type === 'add') {
        const max = 10 + Math.min(10, difficultyLevel * 2)
        a = QuestionGenerator.randInt(1, max)
        b = QuestionGenerator.randInt(1, max)
        answer = a + b
      } else if (type === 'sub') {
        const max = 15 + Math.min(10, difficultyLevel * 2)
        a = QuestionGenerator.randInt(1, max)
        b = QuestionGenerator.randInt(1, Math.min(a, Math.max(1, Math.floor(max / 2))))
        answer = a - b
      } else {
        // mul
        a = QuestionGenerator.randInt(2, 6)
        b = QuestionGenerator.randInt(2, 6)
        answer = a * b
      }
      const options = new Set()
      options.add(answer)
      while (options.size < OPTION_COUNT) {
        let delta = QuestionGenerator.randInt(1, Math.max(2, Math.floor(answer * 0.4) + 2))
        if (Math.random() < 0.5) delta = -delta
        const opt = Math.max(0, answer + delta)
        options.add(opt)
      }
      const optionArray = Array.from(options)
      for (let i = optionArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[optionArray[i], optionArray[j]] = [optionArray[j], optionArray[i]]
      }
      const text = type === 'add' ? `${a} + ${b}` : type === 'sub' ? `${a} - ${b}` : `${a} × ${b}`
      return { text, answer, options: optionArray }
    }

    static randInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min
    }
  }

  // ---------------- Game State ----------------
  const GameState = {
    running: true,
    score: 0,
    wrong: 0,
    target: TARGET_CORRECT,
    maxWrong: MAX_WRONG,
    question: null,
    difficulty: 1,
    selectedIndex: 0,
    droneX: WIDTH / 2,
    droneY: HEIGHT / 2 - 20,
    droneTargetX: WIDTH / 2,
    droneTargetY: HEIGHT / 2 - 20,
    animationTime: 0,
    state: 'playing', // 'playing', 'victory', 'gameover', 'title'
    wobble: 0,
    particles: [],
    toasts: [],
  }

  let optionAreas = [] // hit testing areas

  // ARIA live region
  let ariaLive = document.createElement('div')
  ariaLive.style.position = 'absolute'
  ariaLive.style.left = '-9999px'
  ariaLive.setAttribute('aria-live', 'polite')
  container.appendChild(ariaLive)

  // Initialize first question
  function nextQuestion() {
    GameState.question = QuestionGenerator.generate(GameState.difficulty)
    GameState.selectedIndex = 0
    if (GameState.score > 0 && GameState.score % 3 === 0) {
      GameState.difficulty = Math.min(8, GameState.difficulty + 1)
    }
    GameState.droneTargetX = WIDTH / 2
    GameState.droneTargetY = HEIGHT / 2 - 30
  }
  nextQuestion()

  // ---------------- Input Handling ----------------
  canvas.addEventListener('keydown', (e) => {
    // Initialize audio on user interaction if needed
    if (!audio.context) {
      audio
        .init()
        .then(() => {
          try {
            if (audio.context && audio.context.state === 'suspended') audio.context.resume()
          } catch (err) {
            console.warn('Audio resume error', err)
          }
        })
        .catch(() => {})
    }
    if (GameState.state === 'playing') {
      handleGameplayKey(e)
    } else if (['victory', 'gameover', 'title'].includes(GameState.state)) {
      if (e.key.toLowerCase() === 'r') restartGame()
    }
    if (e.key === 'm' || e.key === 'M') {
      audio.toggle()
      audio.playClick()
    }
  })

  function handleGameplayKey(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
      const prevIndex = GameState.selectedIndex
      if (e.key === 'ArrowLeft') {
        GameState.selectedIndex = (GameState.selectedIndex - 1 + OPTION_COUNT) % OPTION_COUNT
      } else if (e.key === 'ArrowRight') {
        GameState.selectedIndex = (GameState.selectedIndex + 1) % OPTION_COUNT
      } else if (e.key === 'ArrowUp') {
        GameState.selectedIndex = 0
      } else if (e.key === 'ArrowDown') {
        GameState.selectedIndex = OPTION_COUNT - 1
      }
      // subtle pan based on position change
      const pan = (GameState.selectedIndex - (OPTION_COUNT - 1) / 2) / ((OPTION_COUNT - 1) || 1)
      audio.playClick(pan * 0.6)
      // move drone target to selected option center if available
      const area = optionAreas[GameState.selectedIndex]
      if (area) {
        GameState.droneTargetX = area.x + area.w / 2
        GameState.droneTargetY = area.y - 34
      }
      ariaLive.textContent = `Selected option ${GameState.selectedIndex + 1}`
      // small visual toast
      if (prevIndex !== GameState.selectedIndex) {
        pushToast(`Selected ${GameState.selectedIndex + 1}`, 0.9)
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      audio.playClick()
      attemptAnswer(GameState.selectedIndex)
    } else if (/^[1-9]$/.test(e.key)) {
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= OPTION_COUNT) {
        attemptAnswer(n - 1)
      }
    }
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)

    if (GameState.state === 'playing') {
      for (let i = 0; i < optionAreas.length; i++) {
        const a = optionAreas[i]
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
          GameState.selectedIndex = i
          // pan based on x
          const pan = ((a.x + a.w / 2) - WIDTH / 2) / (WIDTH / 2)
          audio.playClick(pan)
          attemptAnswer(i)
          return
        }
      }
      const audRect = getAudioIconRect()
      if (x >= audRect.x && x <= audRect.x + audRect.w && y >= audRect.y && y <= audRect.y + audRect.h) {
        audio.toggle()
        audio.playClick()
        return
      }
    } else {
      restartGame()
    }
  })

  // Attempt answer function preserved but extended visuals & audio triggers
  function attemptAnswer(index) {
    audio.playClick()
    const chosen = GameState.question.options[index]
    if (chosen === GameState.question.answer) {
      GameState.score += 1
      audio.playCorrect()
      ariaLive.textContent = `Correct! Score ${GameState.score} of ${GameState.target}`
      const area = optionAreas[index]
      if (area) {
        GameState.droneTargetX = area.x + area.w / 2
        GameState.droneTargetY = area.y - 34
        // spawn celebratory particles at option center
        spawnParticles(area.x + area.w / 2, area.y + 18, 'collect')
      }
      // small toast
      pushToast('Nice! +1 star', 1.0)

      if (GameState.score >= GameState.target) {
        GameState.state = 'victory'
        ariaLive.textContent = `Victory! You collected ${GameState.score} stars. Press R to restart.`
        audio.playVictory()
        // bigger particle burst
        spawnParticles(WIDTH / 2, HEIGHT / 2 - 30, 'victory')
      } else {
        setTimeout(() => {
          nextQuestion()
        }, 520)
      }
    } else {
      GameState.wrong += 1
      audio.playIncorrect()
      ariaLive.textContent = `Oops! That's not right. Wrong ${GameState.wrong} of ${GameState.maxWrong}`
      GameState.animationTime = 0.24
      // spawn a small "sad" puff
      const a = optionAreas[index] || { x: WIDTH / 2, y: HEIGHT / 2, w: 40, h: 30 }
      spawnParticles(a.x + a.w / 2, a.y + a.h / 2, 'wrong')

      pushToast('Try again', 0.9)

      if (GameState.wrong >= GameState.maxWrong) {
        GameState.state = 'gameover'
        ariaLive.textContent = `Game over. You answered ${GameState.score} correctly. Press R to try again.`
        audio.playGameOver()
        spawnParticles(WIDTH / 2, HEIGHT / 2 - 30, 'gameover')
      }
    }
  }

  function restartGame() {
    GameState.score = 0
    GameState.wrong = 0
    GameState.difficulty = 1
    GameState.state = 'playing'
    nextQuestion()
    GameState.selectedIndex = 0
    GameState.particles = []
    GameState.toasts = []
    ariaLive.textContent = 'Game restarted'
    audio.init().catch(() => {})
  }

  function getAudioIconRect() {
    const w = 28
    const h = 20
    return { x: LIVES_X - w - 46, y: LIVES_Y, w, h }
  }

  // ---------------- Visual Utilities ----------------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  function clear() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    // layered background: soft sky gradient + subtle radial light
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT)
    g.addColorStop(0, '#eaf6ff')
    g.addColorStop(0.6, '#f6fbff')
    g.addColorStop(1, '#ffffff')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    // subtle radial glow near top-left to create depth
    const rg = ctx.createRadialGradient(120, 80, 10, 120, 80, 220)
    rg.addColorStop(0, 'rgba(255, 255, 240, 0.12)')
    rg.addColorStop(1, 'rgba(255, 255, 240, 0)')
    ctx.fillStyle = rg
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }

  // Draw soft cloud shapes with parallax movement
  function drawCloud(x, y, scale = 1, offset = 0, alpha = 1) {
    ctx.save()
    ctx.translate(x + offset, y)
    ctx.scale(scale, scale)
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(-32, 0, 22, 0, Math.PI * 2)
    ctx.arc(-6, -8, 28, 0, Math.PI * 2)
    ctx.arc(28, -2, 22, 0, Math.PI * 2)
    ctx.rect(-56, 0, 112, 24)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // Draw a friendly drone with glow and thruster
  function drawDrone(x, y, wobble = 0, selected = false) {
    ctx.save()
    ctx.translate(x, y)
    // subtle shadow
    ctx.fillStyle = 'rgba(5, 15, 30, 0.12)'
    ctx.beginPath()
    ctx.ellipse(0, 38, 36, 12, 0, 0, Math.PI * 2)
    ctx.fill()

    // body with gradient
    const bodyGrad = ctx.createLinearGradient(-28, -18, 28, 18)
    bodyGrad.addColorStop(0, '#81d4fa')
    bodyGrad.addColorStop(1, '#4fc3f7')
    ctx.fillStyle = bodyGrad
    ctx.save()
    ctx.rotate(Math.sin(wobble) * 0.06)
    roundRect(ctx, -32, -20, 64, 32, 8)
    ctx.fill()

    // glossy window
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    roundRect(ctx, -12, -10, 24, 18, 6)
    ctx.fill()
    ctx.fillStyle = 'rgba(3,169,244,0.22)'
    roundRect(ctx, -12, -10, 24, 18, 6)
    ctx.fill()

    // thruster glow
    ctx.fillStyle = selected ? 'rgba(255, 183, 77, 0.9)' : 'rgba(255, 230, 180, 0.55)'
    ctx.beginPath()
    ctx.ellipse(0, 28 + Math.sin(wobble * 8) * 2, 12, 6 + Math.abs(Math.sin(wobble * 6)) * 3, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    // props with gentle rotation
    for (let i = -1; i <= 1; i += 2) {
      ctx.save()
      ctx.translate(x + i * 36, y - 6)
      ctx.rotate(Math.cos(wobble * 6 + i) * 0.9)
      ctx.fillStyle = selected ? '#ffd180' : '#4fc3f7'
      ctx.beginPath()
      ctx.ellipse(0, 0, 14, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // antenna
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = '#01579b'
    ctx.fillRect(-2, -34, 4, 8)
    ctx.beginPath()
    ctx.fillStyle = '#ffd54f'
    ctx.arc(0, -36, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.restore()
  }

  // ---------------- Particle System ----------------
  function spawnParticles(x, y, type = 'collect') {
    const colors = {
      collect: ['#ffd54f', '#fff176', '#ffe082', '#ffecb3'],
      victory: ['#ffd54f', '#ffab40', '#ffd180', '#fff59d'],
      wrong: ['#ef9a9a', '#ef5350', '#ffccbc'],
      gameover: ['#ff8a80', '#ef9a9a', '#ffcccb'],
    }
    const palette = colors[type] || colors.collect
    const count = type === 'victory' ? 36 : type === 'gameover' ? 30 : type === 'wrong' ? 10 : 20
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = Math.random() * 90 + (type === 'victory' ? 50 : 20)
      const vx = Math.cos(angle) * speed * (Math.random() * 0.6 + 0.4) / 60
      const vy = Math.sin(angle) * speed * (Math.random() * 0.6 + 0.4) / 60 - (type === 'wrong' ? 0.2 : 0.5)
      GameState.particles.push({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        life: Math.random() * 0.8 + (type === 'victory' ? 1.2 : 0.9),
        size: Math.random() * 3 + (type === 'victory' ? 2.5 : 1.8),
        color: palette[Math.floor(Math.random() * palette.length)],
        type,
      })
    }
    // limit particles to avoid overstimulation
    if (GameState.particles.length > 400) {
      GameState.particles.splice(0, GameState.particles.length - 400)
    }
  }

  function updateParticles(dt) {
    for (let i = GameState.particles.length - 1; i >= 0; i--) {
      const p = GameState.particles[i]
      p.vy += 0.04 // light gravity
      p.x += p.vx * (dt * 60)
      p.y += p.vy * (dt * 60)
      p.life -= dt
      if (p.life <= 0 || p.y > HEIGHT + 40) {
        GameState.particles.splice(i, 1)
      }
    }
  }

  function drawParticles() {
    for (const p of GameState.particles) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 1.2))
      ctx.fillStyle = p.color
      // draw small star-like diamond for variety
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - p.size)
      ctx.lineTo(p.x + p.size * 0.6, p.y)
      ctx.lineTo(p.x, p.y + p.size)
      ctx.lineTo(p.x - p.size * 0.6, p.y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  // UI toast messages (small, unobtrusive)
  function pushToast(text, duration = 1.0) {
    GameState.toasts.push({
      text,
      t: duration,
      ttl: duration,
      x: WIDTH / 2,
      y: HEIGHT - 110 - Math.random() * 12,
    })
    if (GameState.toasts.length > 4) GameState.toasts.shift()
  }

  function updateToasts(dt) {
    for (let i = GameState.toasts.length - 1; i >= 0; i--) {
      const s = GameState.toasts[i]
      s.ttl -= dt
      if (s.ttl <= 0) GameState.toasts.splice(i, 1)
    }
  }

  function drawToasts() {
    ctx.font = '14px Arial'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < GameState.toasts.length; i++) {
      const t = GameState.toasts[i]
      const alpha = Math.max(0, Math.min(1, t.ttl / t.t))
      const w = ctx.measureText(t.text).width + 18
      ctx.save()
      ctx.globalAlpha = alpha * 0.95
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      roundRect(ctx, t.x - w / 2, t.y - 16, w, 32, 8)
      ctx.fillStyle = 'rgba(33, 33, 33, 0.92)'
      roundRect(ctx, t.x - w / 2 + 2, t.y - 14, w - 4, 28, 6)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(t.text, t.x - w / 2 + 9, t.y)
      ctx.restore()
    }
  }

  // ---------------- Drone movement sound (gentle whoosh) ----------------
  let lastDronePan = 0
  function maybePlayDroneMoveSound() {
    if (!audio.enabled || !audio.context) return
    try {
      const pan = (GameState.droneX - WIDTH / 2) / (WIDTH / 2)
      // only play subtle whoosh if pan changed noticeably
      if (Math.abs(pan - lastDronePan) > 0.18) {
        audio.playClick(pan * 0.7)
        lastDronePan = pan
      }
    } catch (e) {
      // ignore
    }
  }

  // ---------------- Drawing UI and Game Elements ----------------
  function render() {
    clear()

    // animated clouds (parallax)
    drawCloud(80 + Math.sin(GameState.wobble * 0.6) * 10, 60, 1.1, Math.cos(GameState.wobble * 0.4) * 6, 0.95)
    drawCloud(420 - Math.cos(GameState.wobble * 0.9) * 18, 44, 1.0, 0, 0.92)
    drawCloud(600 + Math.sin(GameState.wobble * 0.55) * 10, 84, 1.2, -6, 0.96)

    // calm floating shapes / markers
    for (let i = 0; i < 6; i++) {
      ctx.save()
      const xx = 60 + i * 110 + Math.sin(GameState.wobble + i) * 6
      const yy = 130 + Math.cos(GameState.wobble * 0.8 + i) * 6
      ctx.globalAlpha = 0.9
      ctx.fillStyle = ['#ffd54f', '#b39ddb', '#a5d6a7', '#ffab91'][i % 4]
      ctx.beginPath()
      ctx.moveTo(xx, yy - 8)
      ctx.lineTo(xx + 6, yy)
      ctx.lineTo(xx, yy + 8)
      ctx.lineTo(xx - 6, yy)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // Drone drawn with wobble
    const wobbleAmount = GameState.animationTime > 0 ? 1.2 : GameState.wobble
    drawDrone(GameState.droneX, GameState.droneY, wobbleAmount, false)

    // UI: Score box (top-left)
    ctx.font = IMPORTANT_FONT
    ctx.textBaseline = 'top'
    const scoreText = `Stars: ${GameState.score} / ${GameState.target}`
    const scoreMetrics = ctx.measureText(scoreText)
    const scoreW = scoreMetrics.width + 2 * PADDING + 40
    const scoreH = 36
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    roundRect(ctx, SCORE_X, SCORE_Y, scoreW, scoreH, 10)
    ctx.fillStyle = 'rgba(3, 169, 244, 0.95)'
    roundRect(ctx, SCORE_X + 2, SCORE_Y + 2, scoreW - 4, scoreH - 4, 8)
    ctx.fill()
    // small star icon
    ctx.fillStyle = '#ffd54f'
    const sx = SCORE_X + 8
    const sy = SCORE_Y + 6
    drawSmallStar(sx + 6, sy + 12, 6)
    ctx.fillStyle = '#fff'
    ctx.fillText(scoreText, SCORE_X + 36, SCORE_Y + 7)

    // Lives box (top-right)
    ctx.font = IMPORTANT_FONT
    const livesText = `Fails left: ${Math.max(0, GameState.maxWrong - GameState.wrong)}`
    const livesMetrics = ctx.measureText(livesText)
    const livesW = livesMetrics.width + 2 * PADDING + 54
    const livesH = 36
    const livesX = LIVES_X - livesW
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    roundRect(ctx, livesX, LIVES_Y, livesW, livesH, 10)
    ctx.fillStyle = 'rgba(244, 143, 177, 0.98)'
    roundRect(ctx, livesX + 2, LIVES_Y + 2, livesW - 4, livesH - 4, 8)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(livesText, livesX + PADDING, LIVES_Y + 7)

    // Audio icon
    const audRect = getAudioIconRect()
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(audRect.x, audRect.y, audRect.w, audRect.h)
    // draw speaker
    ctx.beginPath()
    ctx.moveTo(audRect.x + 3, audRect.y + 5)
    ctx.lineTo(audRect.x + 9, audRect.y + 5)
    ctx.lineTo(audRect.x + 13, audRect.y + 2)
    ctx.lineTo(audRect.x + 13, audRect.y + 18)
    ctx.lineTo(audRect.x + 9, audRect.y + 15)
    ctx.lineTo(audRect.x + 3, audRect.y + 15)
    ctx.closePath()
    ctx.fillStyle = audio.enabled ? '#fff' : '#bdbdbd'
    ctx.fill()
    if (!audio.enabled) {
      ctx.strokeStyle = '#ff8a80'
      ctx.beginPath()
      ctx.moveTo(audRect.x + 2, audRect.y + 2)
      ctx.lineTo(audRect.x + audRect.w - 2, audRect.y + audRect.h - 2)
      ctx.stroke()
    }

    // Question card
    ctx.font = TITLE_FONT
    ctx.textBaseline = 'top'
    const qText = `What is ${GameState.question.text}?`
    const qMetrics = ctx.measureText(qText)
    const qW = Math.min(WIDTH - 2 * PADDING, Math.max(320, qMetrics.width + 2 * PADDING))
    const qX = (WIDTH - qW) / 2
    const qY = 170
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    roundRect(ctx, qX, qY, qW, 58, 12)
    ctx.fillStyle = '#0288d1'
    roundRect(ctx, qX + 2, qY + 2, qW - 4, 54, 10)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = IMPORTANT_FONT
    // adapt font size if needed
    let fontToUse = IMPORTANT_FONT
    ctx.font = fontToUse
    if (ctx.measureText(qText).width > qW - 2 * PADDING) {
      fontToUse = '18px "Segoe UI", Roboto, Arial'
      ctx.font = fontToUse
    }
    ctx.fillText(qText, qX + PADDING, qY + 14)

    // Options layout
    const optionY = qY + 76
    const areaPadding = 12
    optionAreas = []
    ctx.font = BODY_FONT
    let widths = GameState.question.options.map((opt) => ctx.measureText(String(opt)).width + 2 * areaPadding + 48)
    const totalMinWidth = widths.reduce((a, b) => a + b, 0)
    const gap = Math.max(12, Math.floor((WIDTH - 2 * PADDING - totalMinWidth) / (OPTION_COUNT + 1)))
    let curX = PADDING + gap
    for (let i = 0; i < GameState.question.options.length; i++) {
      const opt = GameState.question.options[i]
      const w = widths[i]
      const h = 56
      const selected = GameState.selectedIndex === i
      // highlight animation pulse
      const pulse = selected ? 1 + 0.03 * Math.sin(GameState.wobble * 8) : 1
      ctx.save()
      ctx.translate(curX + w / 2, optionY + h / 2)
      ctx.scale(pulse, pulse)
      ctx.translate(-(curX + w / 2), -(optionY + h / 2))
      // background
      ctx.fillStyle = selected ? 'rgba(255, 249, 240, 0.97)' : 'rgba(255,255,255,0.96)'
      roundRect(ctx, curX, optionY, w, h, 10)
      ctx.fillStyle = selected ? '#ffb300' : '#607d8b'
      roundRect(ctx, curX + 2, optionY + 2, w - 4, h - 4, 8)
      ctx.fill()
      // number bubble
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.fillStyle = '#fff'
      ctx.arc(curX + 20, optionY + h / 2, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = selected ? '#ff6f00' : '#455a64'
      ctx.font = 'bold 14px Arial'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${i + 1}`, curX + 14, optionY + h / 2 - 1)
      // option text
      ctx.fillStyle = '#fff'
      ctx.font = BODY_FONT
      ctx.fillText(String(opt), curX + 44, optionY + 18)
      ctx.restore()

      optionAreas.push({ x: curX, y: optionY, w, h, index: i })
      curX += w + gap
    }

    // bottom instructions with background
    ctx.font = BODY_FONT
    ctx.textBaseline = 'top'
    const instructions =
      'Use arrow keys or 1-3 to choose. Press Enter to confirm. Press M to toggle sound. Press R to restart.'
    const maxWidth = WIDTH - 2 * PADDING
    ctx.font = BODY_FONT
    const instrWidth = ctx.measureText(instructions).width
    let instrLines = []
    if (instrWidth > maxWidth) {
      const words = instructions.split(' ')
      let line = ''
      for (let w of words) {
        const trial = line ? line + ' ' + w : w
        if (ctx.measureText(trial).width > maxWidth && line) {
          instrLines.push(line)
          line = w
        } else {
          line = trial
        }
      }
      if (line) instrLines.push(line)
    } else {
      instrLines = [instructions]
    }
    const instrH = instrLines.length * 20 + 14
    const instrW = maxWidth
    const instrX = (WIDTH - instrW) / 2
    const instrY = INSTRUCTIONS_Y
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    roundRect(ctx, instrX, instrY, instrW, instrH, 12)
    ctx.fillStyle = '#37474f'
    roundRect(ctx, instrX + 2, instrY + 2, instrW - 4, instrH - 4, 10)
    ctx.fill()
    ctx.fillStyle = '#fff'
    for (let i = 0; i < instrLines.length; i++) {
      ctx.fillText(instrLines[i], instrX + PADDING, instrY + 8 + i * 20)
    }

    // particles & toasts
    drawParticles()
    drawToasts()

    // overlay end screens if needed
    if (GameState.state === 'victory') {
      drawEndScreen(true)
    } else if (GameState.state === 'gameover') {
      drawEndScreen(false)
    }

    // small audio warning if unavailable
    if (!audio.isAvailable()) {
      ctx.font = '14px Arial'
      const warn = 'Audio unavailable. Press M to toggle (visual only).'
      const m = ctx.measureText(warn).width
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      roundRect(ctx, WIDTH - m - 2 * PADDING - 8, HEIGHT - 44, m + 2 * PADDING + 8, 34, 8)
      ctx.fillStyle = '#6d4c41'
      roundRect(ctx, WIDTH - m - 2 * PADDING - 6, HEIGHT - 42, m + 2 * PADDING + 4, 30, 6)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(warn, WIDTH - m - PADDING - 4, HEIGHT - 36)
    }
  }

  function drawSmallStar(x, y, size) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, y - size)
    ctx.lineTo(x + size * 0.4, y - size * 0.2)
    ctx.lineTo(x + size, y - size * 0.1)
    ctx.lineTo(x + size * 0.5, y + size * 0.2)
    ctx.lineTo(x + size * 0.6, y + size)
    ctx.lineTo(x, y + size * 0.4)
    ctx.lineTo(x - size * 0.6, y + size)
    ctx.lineTo(x - size * 0.5, y + size * 0.2)
    ctx.lineTo(x - size, y - size * 0.1)
    ctx.lineTo(x - size * 0.4, y - size * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  function drawEndScreen(victory) {
    ctx.save()
    ctx.fillStyle = 'rgba(2, 20, 40, 0.66)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    const boxW = WIDTH - 120
    const boxH = 220
    const boxX = 60
    const boxY = (HEIGHT - boxH) / 2
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    roundRect(ctx, boxX, boxY, boxW, boxH, 14)
    ctx.fillStyle = victory ? '#2e7d32' : '#b71c1c'
    roundRect(ctx, boxX + 4, boxY + 4, boxW - 8, boxH - 8, 12)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.font = '26px "Segoe UI", Roboto, Arial'
    ctx.textBaseline = 'top'
    const title = victory ? 'Hooray! Drone delivered the stars!' : 'Oops! Drone needs a recharge!'
    const titleWidth = ctx.measureText(title).width
    ctx.fillText(title, boxX + (boxW - titleWidth) / 2, boxY + 20)

    ctx.font = '18px "Segoe UI", Roboto, Arial'
    const sub = victory ? `You collected ${GameState.score} stars! Great job.` : `You collected ${GameState.score} stars this time.`
    const subWidth = ctx.measureText(sub).width
    ctx.fillText(sub, boxX + (boxW - subWidth) / 2, boxY + 70)

    ctx.font = '16px Arial'
    const instr = 'Click anywhere or press R to restart.'
    const instrW = ctx.measureText(instr).width
    ctx.fillText(instr, boxX + (boxW - instrW) / 2, boxY + boxH - 54)

    // friendly drone illustration on end screen
    drawDrone(boxX + 110, boxY + 130, GameState.wobble * 1.5, true)

    ctx.restore()
  }

  // ---------------- Main Loop ----------------
  let lastTime = performance.now()
  function loop(now) {
    const dt = Math.min(0.06, (now - lastTime) / 1000)
    lastTime = now
    update(dt)
    render()
    requestAnimationFrame(loop)
  }

  function update(dt) {
    // drone movement smoothing
    const dx = GameState.droneTargetX - GameState.droneX
    const dy = GameState.droneTargetY - GameState.droneY
    const speed = dt * 6
    GameState.droneX += dx * Math.min(1, speed)
    GameState.droneY += dy * Math.min(1, speed)

    if (GameState.animationTime > 0) GameState.animationTime = Math.max(0, GameState.animationTime - dt)

    GameState.wobble += dt * 3

    // update particles & toasts
    updateParticles(dt)
    updateToasts(dt)

    // maybe play drone move sound if moved significantly
    maybePlayDroneMoveSound()
  }

  // Start animation loop
  requestAnimationFrame(loop)

  // Ensure focus for keyboard controls
  canvas.focus()

  // Try to initialize audio on first user gesture (for browsers requiring gesture)
  function tryInitAudioOnGesture() {
    audio
      .init()
      .then(() => {
        try {
          if (audio.context && audio.context.state === 'suspended') audio.context.resume()
        } catch (e) {
          /* ignore */
        }
      })
      .catch(() => {})
    window.removeEventListener('pointerdown', tryInitAudioOnGesture)
    window.removeEventListener('keydown', tryInitAudioOnGesture)
  }
  window.addEventListener('pointerdown', tryInitAudioOnGesture)
  window.addEventListener('keydown', tryInitAudioOnGesture)

  // Expose minimal debug hooks (no external dependencies)
  try {
    // attach to container for optional debugging without polluting global
    container._droneGame = {
      restart: restartGame,
      audioAvailable: () => audio.isAvailable(),
      toggleAudio: () => {
        audio.toggle()
      },
    }
  } catch (e) {
    // ignore if not permitted
  }
})()