 (() => {
  // Open World Exploration Math Game: "Tens & Trails" (Visuals + Audio Enhanced)
  // Renders entirely inside #game-of-the-day-stage using a 720x480 canvas.
  // All graphics are canvas-drawn; all sounds use Web Audio API oscillators.
  // Focus concept unchanged: place value (tens and ones) and addition/subtraction within 60.

  // Utility helpers
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

   // Stage and canvas (support both standalone page and homepage stage)
   const stage =
     document.getElementById('tens-and-trails-stage') ||
     document.getElementById('game-of-the-day-stage') ||
     document.body;
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 480;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Tens and Trails open-world math game. Use arrow keys or WASD to explore. Collect tens rods and ones pebbles to match gate numbers. Press H for help.');
  stage.innerHTML = '';
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Accessibility live region
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  live.style.position = 'absolute';
  live.style.left = '-9999px';
  live.style.top = '0';
  stage.appendChild(live);
  const narrate = (msg) => {
    try {
      live.textContent = msg;
    } catch (e) {
      console.warn('Narration update failed:', e);
    }
  };

  // Input state
  const keys = new Set();
  let firstInteraction = false;

  // Audio Manager (enhanced + optional royalty-free song)
  const AudioManager = (() => {
    let ctx = null;
    let master = null;
    let compressor = null;
    let ambienceGain = null;
    let fxBus = null;
    let started = false;
    let muted = false;
    let stepCooldown = 0;
    let stepSide = -1; // alternate L/R
    // Optional external song
    let bgSongEl = null;
    let bgSongNode = null;
    let songLoaded = false;
    let songTried = false;

    const safe = (fn) => {
      try {
        fn && fn();
      } catch (e) {
        console.warn('Audio error:', e);
      }
    };

    const start = () => {
      if (started) return;
      started = true;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        ctx = new Ctx();
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 24;
        compressor.ratio.value = 2.5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        master = ctx.createGain();
        master.gain.value = 0.6;

        fxBus = ctx.createGain();
        fxBus.gain.value = 0.6;

        master.connect(compressor);
        fxBus.connect(compressor);
        compressor.connect(ctx.destination);

        ambienceGain = ctx.createGain();
        ambienceGain.gain.value = 0.07;
        ambienceGain.connect(master);

        // Try external royalty-free track first; fall back to synth score
        tryStartSong();
        // Fallback after short grace if song cannot load
        setTimeout(() => {
          if (!songLoaded) {
            startAmbience();
            startGroove();
          }
        }, 1800);
      } catch (e) {
        console.warn('Web Audio not available:', e);
        ctx = null;
      }
    };

    function tryStartSong() {
      if (songTried) return; songTried = true;
      // Put your royalty-free song at assets/music/theme.mp3
      // License: ensure CC0/royalty-free. This loader will gracefully fall back if missing.
      const url = 'assets/music/theme.mp3';
      const audio = new Audio();
      audio.src = url;
      audio.loop = true;
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audio.volume = 0.5;
      const onReady = () => {
        try {
          bgSongEl = audio;
          if (ctx && ctx.createMediaElementSource) {
            bgSongNode = ctx.createMediaElementSource(bgSongEl);
            bgSongNode.connect(master);
          }
          bgSongEl.play().catch(() => {});
          songLoaded = true;
        } catch (e) {
          console.warn('Song route failed, using synth score.', e);
        }
        cleanupListeners();
      };
      const onError = () => { cleanupListeners(); };
      const cleanupListeners = () => {
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('error', onError);
      };
      audio.addEventListener('canplay', onReady);
      audio.addEventListener('canplaythrough', onReady);
      audio.addEventListener('error', onError);
      // Kick loading
      audio.load();
    }

    const resumeIfSuspended = () => {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch((e) => console.warn('Audio resume failed:', e));
      }
    };

    const createNoiseBuffer = () => {
      if (!ctx) return null;
      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 1.0));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    };

    const startAmbience = () => {
      if (!ctx) return;
      // Ocean hush (filtered noise) + slow lapping + gentle pad
      const noiseBuffer = createNoiseBuffer();
      if (noiseBuffer) {
        const hush = ctx.createBufferSource();
        hush.buffer = noiseBuffer;
        hush.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 600;
        const hushGain = ctx.createGain();
        hushGain.gain.value = 0.15;
        hush.connect(lp);
        lp.connect(hushGain);
        hushGain.connect(ambienceGain);
        safe(() => hush.start());

        // Lapping waves: amplitude-modulated filtered noise
        const lap = ctx.createBufferSource();
        lap.buffer = noiseBuffer;
        lap.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 400;
        bp.Q.value = 1.2;
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.12;
        lfoGain.gain.value = 0.12;
        const lapGain = ctx.createGain();
        lapGain.gain.value = 0.0; // modulated
        lfo.connect(lfoGain);
        lfoGain.connect(lapGain.gain);
        lap.connect(bp);
        bp.connect(lapGain);
        lapGain.connect(ambienceGain);
        safe(() => {
          lap.start();
          lfo.start();
        });
      }

      // Gentle pad: triangle+sine blend with light chorus
      const padGain = ctx.createGain();
      padGain.gain.value = 0.028;
      const chorusDelay = ctx.createDelay(0.05);
      chorusDelay.delayTime.value = 0.018;
      const chorusLFO = ctx.createOscillator();
      const chorusLFOGain = ctx.createGain();
      chorusLFO.frequency.value = 0.18;
      chorusLFOGain.gain.value = 0.006;
      chorusLFO.connect(chorusLFOGain);
      chorusLFOGain.connect(chorusDelay.delayTime);
      const panL = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panL) { panL.pan.value = -0.12; padGain.connect(panL); panL.connect(master); }
      else { padGain.connect(master); }
      padGain.connect(chorusDelay); chorusDelay.connect(master);

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc3.type = 'sine';
      const chordSeq = [
        [220, 277.18], // A, C#
        [196, 246.94], // G, B
        [174.61, 220], // F, A
        [196, 261.63] // G, C
      ];
      let chordIndex = 0;
      osc1.frequency.value = chordSeq[0][0];
      osc2.frequency.value = chordSeq[0][1];
      osc3.frequency.value = chordSeq[0][0] * 1.5;
      osc1.detune.value = -4;
      osc2.detune.value = 5;
      osc3.detune.value = 0;
      osc1.connect(padGain);
      osc2.connect(padGain);
      osc3.connect(padGain);
      safe(() => {
        osc1.start();
        osc2.start();
        osc3.start();
        chorusLFO.start();
      });

      // Slow chord change
      const changeChord = () => {
        if (!ctx) return;
        chordIndex = (chordIndex + 1) % chordSeq.length;
        const [f1, f2] = chordSeq[chordIndex];
        osc1.frequency.linearRampToValueAtTime(f1, ctx.currentTime + 2.5);
        osc2.frequency.linearRampToValueAtTime(f2, ctx.currentTime + 2.5);
        if (osc3) osc3.frequency.linearRampToValueAtTime(f1 * 1.5, ctx.currentTime + 2.5);
        setTimeout(changeChord, 9000);
      };
      setTimeout(changeChord, 9000);

      // Pad dynamics via LFO
      const dynLFO = ctx.createOscillator();
      const dynGain = ctx.createGain();
      dynLFO.frequency.value = 0.05;
      dynGain.gain.value = 0.015;
      dynLFO.connect(dynGain);
      dynGain.connect(padGain.gain);
      safe(() => dynLFO.start());
    };

    // Simple upbeat groove + melodic arpeggio
    let beatTimer = null;
    let arpTimer = null;
    let bpm = 88; // light lo-fi tempo
    let beatCount = 0;

    function playKick(time) {
      try {
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, time);
        o.frequency.exponentialRampToValueAtTime(50, time + 0.12);
        g.connect(fxBus);
        o.connect(g);
        g.gain.exponentialRampToValueAtTime(0.22, time + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
        o.start(time);
        o.stop(time + 0.2);
      } catch (_) {}
    }

    function playHat(time) {
      const noise = createNoiseBuffer();
      if (!noise) return;
      try {
        const s = ctx.createBufferSource(); s.buffer = noise; s.loop = false;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 2.0;
        const g = ctx.createGain(); g.gain.value = 0.0001;
        s.connect(bp); bp.connect(g); g.connect(fxBus);
        g.gain.exponentialRampToValueAtTime(0.05, time + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
        s.start(time); s.stop(time + 0.08);
      } catch (_) {}
    }

    function playSnare(time) {
      const noise = createNoiseBuffer(); if (!noise) return;
      try {
        const s = ctx.createBufferSource(); s.buffer = noise; s.loop = false;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.2;
        const g = ctx.createGain(); g.gain.value = 0.0001;
        s.connect(bp); bp.connect(g); g.connect(fxBus);
        g.gain.exponentialRampToValueAtTime(0.08, time + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
        s.start(time); s.stop(time + 0.12);
      } catch (_) {}
    }

    function playPluck(time, freq, pan = 0) {
      try {
        const clickSrc = ctx.createBufferSource(); const nb = createNoiseBuffer(); if (!nb) return; clickSrc.buffer = nb; clickSrc.loop = false;
        const clickBP = ctx.createBiquadFilter(); clickBP.type = 'bandpass'; clickBP.frequency.value = freq * 2.2; clickBP.Q.value = 5.0;
        const clickGain = ctx.createGain(); clickGain.gain.value = 0.0001;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq, time);
        const bodyLP = ctx.createBiquadFilter(); bodyLP.type = 'lowpass'; bodyLP.frequency.value = 2800; bodyLP.Q.value = 0.5;
        const bodyGain = ctx.createGain(); bodyGain.gain.value = 0.0001;
        let out = bodyGain; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; bodyGain.connect(p); out = p; }
        const echoOut = addEcho(out, 0.26, 0.25, 2600, 0.32); echoOut.connect(fxBus);
        clickSrc.connect(clickBP); clickBP.connect(clickGain); clickGain.connect(out);
        o.connect(bodyLP); bodyLP.connect(bodyGain);
        bodyGain.gain.exponentialRampToValueAtTime(0.22, time + 0.01);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
        clickGain.gain.exponentialRampToValueAtTime(0.08, time + 0.004);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
        clickSrc.start(time); o.start(time); o.stop(time + 0.32);
      } catch (_) {}
    }

    function chordRootHz(index) {
      // Match pad chord sequence roots roughly
      const roots = [220];
      return roots[index % roots.length];
    }

    function startGroove() {
      if (!ctx) return;
      const beatMs = 60000 / bpm;
      if (!beatTimer) {
        beatTimer = setInterval(() => {
          resumeIfSuspended();
          const t = ctx.currentTime + 0.02; // slight lookahead
          const step = beatCount % 8;
          // Kicks on 1 & 5, snares on 3 & 7, hats every beat
          if (step === 0 || step === 4) playKick(t);
          if (step === 2 || step === 6) playSnare(t);
          playHat(t);
          beatCount = (beatCount + 1) % 64;
        }, beatMs);
      }
      if (!arpTimer) {
        const scale = [0, 2, 4, 7, 9, 12]; // major pentatonic degrees
        let noteStep = 4;
        arpTimer = setInterval(() => {
          resumeIfSuspended();
          const chordRoot = chordRootHz(Math.floor((beatCount / 8) % 4));
          const deg = scale[noteStep % scale.length];
          const freq = chordRoot * Math.pow(2, deg / 12);
          const pan = Math.sin(noteStep * 0.7) * 0.4;
          const when = ctx.currentTime + 0.01;
          playPluck(when, freq, pan);
          noteStep++;
        }, (beatMs / 2) | 0); // 8th notes
      }
    }

    const playTone = (freq, duration = 0.1, type = 'sine', vol = 0.2, panValue = 0) => {
      if (!ctx || muted) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 5000;
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = 0.0001;
      o.connect(f);
      f.connect(g);
      let outNode = g;
      let p = null;
      if (ctx.createStereoPanner) {
        p = ctx.createStereoPanner();
        p.pan.value = panValue;
        g.connect(p);
        outNode = p;
      }
      outNode.connect(fxBus);

      const now = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(vol, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      safe(() => {
        o.start(now);
        o.stop(now + duration + 0.05);
      });
    };

    const addEcho = (input, time = 0.18, feedback = 0.25, cutoff = 2000, gain = 0.6) => {
      if (!ctx) return input;
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = time;
      const fb = ctx.createGain();
      fb.gain.value = feedback;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      const out = ctx.createGain();
      out.gain.value = gain;
      input.connect(out);
      input.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      delay.connect(out);
      return out;
    };

    const pickup = () => {
      if (!ctx || muted) return;
      resumeIfSuspended();
      // Sparkly up-gliss
      playTone(880, 0.08, 'sine', 0.22, -0.1);
      setTimeout(() => playTone(1244.5, 0.12, 'triangle', 0.18, 0.1), 70);
      setTimeout(() => playTone(1661.2, 0.1, 'sine', 0.12, 0), 140);
    };

    const correct = () => {
      if (!ctx || muted) return;
      resumeIfSuspended();
      const base = 523.25; // C5
      const tones = [0, 4, 7, 12];
      tones.forEach((semi, i) => {
        setTimeout(() => {
          playTone(base * Math.pow(2, semi / 12), 0.16, 'triangle', 0.24, i % 2 ? 0.15 : -0.15);
        }, i * 110);
      });
      // Add soft echo tail
      try {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 1046.5;
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        const echoOut = addEcho(g, 0.22, 0.3, 1800, 0.4);
        echoOut.connect(fxBus);
        const n = ctx.currentTime;
        g.gain.exponentialRampToValueAtTime(0.18, n + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, n + 0.3);
        o.connect(g);
        o.start(n);
        o.stop(n + 0.35);
      } catch (e) {
        // non-fatal
      }
    };

    const incorrect = () => {
      if (!ctx || muted) return;
      resumeIfSuspended();
      // Gentle down-gliss
      playTone(320, 0.14, 'sawtooth', 0.13, -0.1);
      setTimeout(() => playTone(220, 0.2, 'sawtooth', 0.1, 0.1), 90);
    };

    const step = (onLand = true) => {
      if (!ctx || muted) return;
      const nowT = performance.now();
      if (nowT < stepCooldown) return;
      stepCooldown = nowT + 120;
      resumeIfSuspended();
      stepSide *= -1;
      const pan = stepSide * 0.2;

      // Short percussive thump: filtered noise burst + low sine
      try {
        const noiseBuffer = createNoiseBuffer();
        if (noiseBuffer) {
          const src = ctx.createBufferSource();
          src.buffer = noiseBuffer;
          src.loop = false;

          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = onLand ? 260 : 180;
          bp.Q.value = onLand ? 2.0 : 1.2;

          const g = ctx.createGain();
          g.gain.value = 0.0001;

          let out = g;
          let panner = null;
          if (ctx.createStereoPanner) {
            panner = ctx.createStereoPanner();
            panner.pan.value = pan;
            g.connect(panner);
            out = panner;
          }

          out.connect(fxBus);
          src.connect(bp);
          bp.connect(g);

          const n = ctx.currentTime;
          g.gain.exponentialRampToValueAtTime(onLand ? 0.08 : 0.06, n + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, n + 0.08);
          src.start(n);
          src.stop(n + 0.1);
        }

        // Low sine transient
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = onLand ? 120 : 95;
        const g2 = ctx.createGain();
        g2.gain.value = 0.0001;
        let out2 = g2;
        if (ctx.createStereoPanner) {
          const p2 = ctx.createStereoPanner();
          p2.pan.value = pan;
          g2.connect(p2);
          out2 = p2;
        }
        out2.connect(fxBus);
        const n2 = ctx.currentTime;
        g2.gain.exponentialRampToValueAtTime(onLand ? 0.05 : 0.04, n2 + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, n2 + 0.08);
        o.connect(g2);
        o.start(n2);
        o.stop(n2 + 0.1);
      } catch (e) {
        // fallback tiny blip
        playTone(onLand ? 110 : 90, 0.05, 'square', 0.05, pan);
      }
    };

    const toggleMute = () => {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.6;
      if (fxBus) fxBus.gain.value = muted ? 0 : 0.6;
      if (ambienceGain) ambienceGain.gain.value = muted ? 0 : 0.07;
      try { if (bgSongEl) bgSongEl.muted = muted; } catch (_) {}
      return muted;
    };

    const isMuted = () => muted;

    // Visibility handling (suspend to be polite)
    document.addEventListener('visibilitychange', () => {
      try {
        if (!ctx) return;
        if (document.hidden) {
          ctx.suspend();
          try { if (bgSongEl && !bgSongEl.paused) bgSongEl.pause(); } catch (_) {}
        } else {
          ctx.resume();
          try { if (bgSongEl && songLoaded && !muted) bgSongEl.play().catch(() => {}); } catch (_) {}
        }
      } catch (e) {
        // non-fatal
      }
    });

    // Safe start on pointer as well
    const startOnInteraction = () => {
      start();
      resumeIfSuspended();
      window.removeEventListener('pointerdown', startOnInteraction);
      window.removeEventListener('touchstart', startOnInteraction);
    };
    window.addEventListener('pointerdown', startOnInteraction);
    window.addEventListener('touchstart', startOnInteraction, { passive: true });

    return { start, pickup, correct, incorrect, step, playTone, toggleMute, isMuted };
  })();

  // Visual effects
  const effects = [];
  const addRing = (x, y, color = 'white') => {
    effects.push({ type: 'ring', x, y, r: 2, maxR: 32, alpha: 1, color });
  };
  const addConfetti = (x, y) => {
    for (let i = 0; i < 60; i++) {
      effects.push({
        type: 'confetti',
        x: x + rand(-10, 10),
        y: y + rand(-10, 10),
        vx: rand(-1.8, 1.8),
        vy: rand(-2.2, -0.6),
        life: rand(70, 130),
        color: `hsl(${randInt(0, 360)}, 85%, 62%)`
      });
    }
  };
  const addSparkle = (x, y, color = '#ffffff') => {
    for (let i = 0; i < 10; i++) {
      effects.push({
        type: 'sparkle',
        x: x,
        y: y,
        vx: rand(-0.5, 0.5),
        vy: rand(-1.0, -0.2),
        life: rand(20, 35),
        color
      });
    }
  };

  // World and Entities
  const world = {
    width: 1440,
    height: 960,
    islands: [],
    clouds: [],
    items: [],
    gates: [],
    npcs: [],
    shards: []
  };

  // Player
  const player = {
    x: 200,
    y: 200,
    vx: 0,
    vy: 0,
    speed: 2.0,
    tens: 0,
    ones: 0,
    facing: 0,
    name: 'Pip the Compass Kid'
  };

  // Camera
  const camera = { x: 0, y: 0 };

  // UI state
  let showHelp = true;
  let lastMessageTime = 0;
  let solvedCount = 0;
  const targetSolveTotal = 3;
  let gameWon = false;

  // World generation
  const initWorld = () => {
    // Islands as clumped circles
    world.islands = [];
    const clusters = 6;
    for (let c = 0; c < clusters; c++) {
      const cx = rand(200, world.width - 200);
      const cy = rand(200, world.height - 200);
      const lumps = randInt(4, 8);
      const baseHue = randInt(85, 135);
      const cluster = [];
      for (let l = 0; l < lumps; l++) {
        cluster.push({
          x: cx + rand(-120, 120),
          y: cy + rand(-80, 80),
          r: rand(60, 130),
          hue: baseHue + randInt(-10, 10)
        });
      }
      world.islands.push(cluster);
    }

    // Clouds
    world.clouds = [];
    for (let i = 0; i < 16; i++) {
      world.clouds.push({
        x: rand(0, world.width),
        y: rand(0, world.height),
        vx: rand(0.08, 0.25),
        size: rand(40, 90),
        alpha: rand(0.12, 0.28),
        wobble: rand(0, Math.PI * 2)
      });
    }

    // Gates and shards
    world.gates = [];
    world.shards = [];
    const gatePositions = [
      { x: 260, y: 780 },
      { x: 1050, y: 300 },
      { x: 1100, y: 820 },
      { x: 700, y: 520 },
      { x: 400, y: 420 }
    ];
    gatePositions.sort(() => Math.random() - 0.5);
    const chosen = gatePositions.slice(0, targetSolveTotal);
    chosen.forEach((pos, i) => {
      const target = randInt(14, 59);
      world.gates.push({
        x: pos.x,
        y: pos.y,
        target,
        open: false,
        id: `gate${i}`,
        hintShown: false
      });
      world.shards.push({
        x: pos.x + rand(-30, 30),
        y: pos.y + rand(-30, 30),
        collected: false,
        gateId: `gate${i}`
      });
    });

    // NPCs
    world.npcs = [
      {
        type: 'mapcat',
        name: 'Maple the Mapcat',
        x: player.x + 80,
        y: player.y - 20,
        message: 'Psst! Gates open when your tens and ones add to the gate number. Collect 10-sticks and 1-stones!',
        talkRadius: 80
      },
      {
        type: 'whale',
        name: 'Bloop the Bubble Whale',
        x: world.width - 200,
        y: 180,
        message: 'Bubble tip: Press Q to drop a 1, E to drop a 10. Space to try a gate. M to mute.',
        talkRadius: 80
      }
    ];

    // Items: tens and ones on land
    world.items = [];
    const tensCount = 18;
    const onesCount = 50;
    const randomLandPoint = () => {
      for (let attempts = 0; attempts < 200; attempts++) {
        const x = rand(60, world.width - 60);
        const y = rand(60, world.height - 60);
        if (isLand(x, y)) return { x, y };
      }
      return { x: rand(60, world.width - 60), y: rand(60, world.height - 60) };
    };
    for (let i = 0; i < tensCount; i++) {
      const p = randomLandPoint();
      world.items.push({ type: 'ten', x: p.x, y: p.y, picked: false, wobble: rand(0, Math.PI * 2) });
    }
    for (let i = 0; i < onesCount; i++) {
      const p = randomLandPoint();
      world.items.push({ type: 'one', x: p.x, y: p.y, picked: false, wobble: rand(0, Math.PI * 2) });
    }

    // Start near first island center
    if (world.islands.length > 0) {
      const firstCluster = world.islands[0];
      let sx = 0, sy = 0;
      firstCluster.forEach((l) => {
        sx += l.x;
        sy += l.y;
      });
      player.x = sx / firstCluster.length;
      player.y = sy / firstCluster.length;
    }

    player.tens = 1;
    player.ones = 5;
    solvedCount = 0;
    gameWon = false;
    showHelp = true;

    narrate('Explore the islands! Collect tens and ones. Find a gate and match its number with your bag.');
    enqueueMessage('Welcome, explorer! Use arrows or WASD to move. Space to try a gate. Q/E to drop 1/10. H for help.');
  };

  const isLand = (x, y) => {
    for (const cluster of world.islands) {
      for (const lump of cluster) {
        const dx = x - lump.x;
        const dy = y - lump.y;
        if (dx * dx + dy * dy <= lump.r * lump.r) return true;
      }
    }
    return false;
  };

  // Messaging
  const messageQueue = [];
  const enqueueMessage = (text, duration = 4000) => {
    messageQueue.push({ text, duration, time: performance.now() });
  };

  // Drawing state
  let waterWaveT = 0;

  const drawBackground = () => {
    const t = performance.now() / 1000;
    waterWaveT += 0.02;

    // Sky gradient + sun glow
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#bfeaff');
    sky.addColorStop(0.5, '#a5dcff');
    sky.addColorStop(1, '#7ec9ef');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sun
    const sunX = 120;
    const sunY = 80;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 80);
    sunGrad.addColorStop(0, 'rgba(255, 243, 200, 0.9)');
    sunGrad.addColorStop(1, 'rgba(255, 243, 200, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 80, 0, Math.PI * 2);
    ctx.fill();

    // Water base
    const water = ctx.createLinearGradient(0, 120, 0, canvas.height);
    water.addColorStop(0, '#9ddff7');
    water.addColorStop(1, '#5fb9df');
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Water shimmer stripes
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < canvas.height; y += 12) {
      const amp = 6 + Math.sin(y / 60 + t * 0.7) * 4;
      const offset = Math.sin(y / 30 + t * 0.6) * 12;
      ctx.fillRect(offset, y + Math.sin((y + t * 60) * 0.02) * 2, canvas.width, 2);
      ctx.fillRect(offset + amp, y + 6 + Math.cos((y + t * 60) * 0.02) * 2, canvas.width, 1.5);
    }
    ctx.restore();

    // Clouds with gentle wobble
    for (const cl of world.clouds) {
      const cx = cl.x - camera.x * 0.5;
      const cy = cl.y - camera.y * 0.5 + Math.sin(t * 0.5 + cl.wobble) * 3;
      if (cx < -200) cl.x += world.width + 400;
      if (cx > world.width + 200) cl.x -= world.width + 400;

      ctx.save();
      ctx.globalAlpha = cl.alpha;
      ctx.fillStyle = '#ffffff';
      drawCloud(cx, cy, cl.size);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      drawCloudOutline(cx, cy, cl.size);
      ctx.restore();
      cl.x += cl.vx * 0.35;
    }

    // Islands: sand ring + grass blob + soft shoreline foam
    for (const cluster of world.islands) {
      // Sand ring (underlay)
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 10;
      for (const lump of cluster) {
        const x = lump.x - camera.x;
        const y = lump.y - camera.y;

        // Sand
        ctx.beginPath();
        ctx.arc(x, y, lump.r + 10, 0, Math.PI * 2);
        ctx.fillStyle = '#f6e1a7';
        ctx.fill();

        // Grass
        ctx.beginPath();
        ctx.arc(x, y, lump.r, 0, Math.PI * 2);
        const grass = ctx.createRadialGradient(x, y, 10, x, y, lump.r);
        grass.addColorStop(0, `hsl(${lump.hue}, 50%, 58%)`);
        grass.addColorStop(1, `hsl(${lump.hue}, 42%, 52%)`);
        ctx.fillStyle = grass;
        ctx.fill();

        // Texture dots
        ctx.globalAlpha = 0.08;
        for (let i = 0; i < 24; i++) {
          ctx.beginPath();
          ctx.arc(x + rand(-lump.r, lump.r), y + rand(-lump.r, lump.r), rand(1, 2.5), 0, Math.PI * 2);
          ctx.fillStyle = '#0a3d20';
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Shore foam ring
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t + x * 0.02 + y * 0.02);
        ctx.strokeStyle = '#e4fbff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, lump.r + 14 + Math.sin(t + x * 0.02) * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  };

  const drawCloud = (x, y, size) => {
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.6, size * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x - size * 0.35, y + size * 0.05, size * 0.45, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + size * 0.35, y + size * 0.02, size * 0.5, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawCloudOutline = (x, y, size) => {
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.6, size * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - size * 0.35, y + size * 0.05, size * 0.45, size * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + size * 0.35, y + size * 0.02, size * 0.5, size * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawItems = () => {
    const t = performance.now() / 1000;
    for (const it of world.items) {
      if (it.picked) continue;
      const x = it.x - camera.x;
      const y = it.y - camera.y;
      const bob = Math.sin(t * 2 + (it.wobble || 0)) * 2;

      // Glow aura
      ctx.save();
      ctx.globalAlpha = 0.15 + 0.1 * Math.sin(t * 3 + (it.wobble || 0));
      ctx.fillStyle = it.type === 'ten' ? '#ffec9c' : '#a5fff3';
      ctx.beginPath();
      ctx.arc(x, y + bob, it.type === 'ten' ? 14 : 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Shadow
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, y + bob + 10, it.type === 'ten' ? 9 : 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Item itself
      if (it.type === 'ten') {
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.rotate(0.1 * Math.sin(t * 2 + (it.wobble || 0)));
        ctx.fillStyle = '#f7d35b';
        ctx.strokeStyle = '#b19020';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-6, -18, 12, 36, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#453a00';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('10', 0, 0);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.fillStyle = '#3bd4b8';
        ctx.strokeStyle = '#1a8a78';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0a5248';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('1', 0, 0);
        ctx.restore();
      }
    }
  };

  const drawNPCs = () => {
    for (const n of world.npcs) {
      const x = n.x - camera.x;
      const y = n.y - camera.y;
      if (n.type === 'mapcat') drawMapcat(x, y);
      if (n.type === 'whale') drawWhale(x, y);

      // Name tag
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      const w = ctx.measureText(n.name).width + 12;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 40, w, 18, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.name, x, y - 31);
      ctx.restore();
    }
  };

  const drawMapcat = (x, y) => {
    const t = performance.now() / 1000;
    const tail = Math.sin(t * 3) * 4;
    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 14, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body
    ctx.fillStyle = '#f6d2a2';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.save();
    ctx.rotate(0.1);
    ctx.translate(18, 0);
    ctx.rotate(tail * 0.02);
    ctx.fillStyle = '#f6d2a2';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Head
    ctx.beginPath();
    ctx.arc(0, -16, 12, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.beginPath();
    ctx.moveTo(-8, -24);
    ctx.lineTo(-2, -18);
    ctx.lineTo(-12, -18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, -24);
    ctx.lineTo(2, -18);
    ctx.lineTo(12, -18);
    ctx.closePath();
    ctx.fill();
    // Patches
    ctx.fillStyle = '#b5e3ab';
    ctx.beginPath();
    ctx.arc(5, -14, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a3d7f0';
    ctx.beginPath();
    ctx.arc(-6, -6, 5, 0, Math.PI * 2);
    ctx.fill();
    // Face
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-4, -18, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -18, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -15, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const drawWhale = (x, y) => {
    const t = performance.now() / 1000;
    const bob = Math.sin(t * 2) * 2;
    ctx.save();
    ctx.translate(x, y + bob);

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 14, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body
    ctx.fillStyle = '#87baf0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.quadraticCurveTo(36, -10, 44, -4);
    ctx.quadraticCurveTo(38, 4, 26, 8);
    ctx.closePath();
    ctx.fill();
    // Eye
    ctx.fillStyle = '#203a56';
    ctx.beginPath();
    ctx.arc(-8, -3, 2, 0, Math.PI * 2);
    ctx.fill();
    // Bubble spout
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-4, -18, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-6, -24, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const drawPlayer = () => {
    const x = player.x - camera.x;
    const y = player.y - camera.y;
    const t = performance.now() / 1000;
    const speedMag = Math.hypot(player.vx, player.vy);
    const step = Math.min(1, speedMag / 2);
    const bob = Math.sin(t * 8 * step) * 2;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(player.facing);

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 16, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Legs
    ctx.strokeStyle = '#6d4c41';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const legSwing = Math.sin(t * 8 * step) * 5;
    ctx.beginPath();
    ctx.moveTo(-4, 10);
    ctx.lineTo(-4, 18 + legSwing * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, 10);
    ctx.lineTo(4, 18 - legSwing * 0.2);
    ctx.stroke();

    // Body
    ctx.fillStyle = '#ffd3e0';
    ctx.beginPath();
    ctx.ellipse(0, 4, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Backpack
    ctx.fillStyle = '#5e94d8';
    ctx.beginPath();
    ctx.roundRect(-10, -2, 8, 14, 3);
    ctx.fill();

    // Arms
    ctx.strokeStyle = '#f2c6a5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-12, 6 + legSwing * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(12, 6 - legSwing * 0.1);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#ffe9b5';
    ctx.beginPath();
    ctx.arc(0, -12, 10, 0, Math.PI * 2);
    ctx.fill();

    // Face
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-3, -14, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(3, -14, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-2, -9, 4, 1);

    // Compass hat
    ctx.fillStyle = '#d7f7ff';
    ctx.beginPath();
    ctx.arc(0, -20, 7, 0, Math.PI * 2);
    ctx.fill();
    // Arrow spins slowly
    ctx.save();
    ctx.translate(0, -20);
    ctx.rotate((performance.now() / 1000) % (Math.PI * 2));
    ctx.strokeStyle = '#2a7fa3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(3, -2);
    ctx.lineTo(-3, -2);
    ctx.closePath();
    ctx.fillStyle = '#2a7fa3';
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Water ripple if over water
    if (!isLand(player.x, player.y)) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#e4fbff';
      ctx.lineWidth = 1.5;
      const r = 10 + Math.sin(performance.now() / 300) * 2;
      ctx.beginPath();
      ctx.arc(x, y + 14, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  const drawGatesAndShards = () => {
    const t = performance.now() / 1000;
    for (const g of world.gates) {
      const x = g.x - camera.x;
      const y = g.y - camera.y;

      // Proximity aura
      const close = dist(player, g) < 60;
      if (close && !g.open) {
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.08 * Math.sin(performance.now() / 200);
        ctx.strokeStyle = '#88ffb5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 38, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Totem body
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = g.open ? '#c6f0b9' : '#d4c8a0';
      ctx.strokeStyle = '#8e805a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-22, -34, 44, 68, 10);
      ctx.fill();
      ctx.stroke();

      // Decorative chevrons
      ctx.strokeStyle = g.open ? '#2e6b35' : '#6e6645';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-16, -6);
      ctx.lineTo(-8, -10);
      ctx.lineTo(0, -6);
      ctx.lineTo(8, -10);
      ctx.lineTo(16, -6);
      ctx.stroke();

      // Eyes and mouth
      ctx.fillStyle = g.open ? '#3d6e42' : '#5e5539';
      ctx.beginPath();
      ctx.arc(-8, -12, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, -12, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-8, 4, 16, 3);

      // Number
      ctx.fillStyle = g.open ? '#2a532e' : '#4a452f';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.target.toString(), 0, 22);

      // Glow if open
      if (g.open) {
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 3);
        ctx.strokeStyle = '#a6ffb5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-26, -38, 52, 76, 12);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    // Shards render only if gate open
    for (const s of world.shards) {
      if (s.collected) continue;
      const gate = world.gates.find((gt) => gt.id === s.gateId);
      if (!gate || !gate.open) continue;
      const x = s.x - camera.x;
      const y = s.y - camera.y;
      drawStarBurst(x, y, 8);
    }
  };

  const drawStarBurst = (x, y, r) => {
    const t = performance.now() / 1000;
    // Rays
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((t % (Math.PI * 2)) * 0.5);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(255, 215, 64, 0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const ang = i * (Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * (r + 2), Math.sin(ang) * (r + 2));
      ctx.lineTo(Math.cos(ang) * (r + 8 + Math.sin(t * 3) * 2), Math.sin(ang) * (r + 8 + Math.sin(t * 3) * 2));
      ctx.stroke();
    }
    ctx.restore();
    // Star
    drawStar(x, y, r, 'hsl(50, 90%, 60%)', '#9f7f00');
  };

  const drawStar = (x, y, r, fill, stroke) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((performance.now() / 1000) % (Math.PI * 2));
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.5;
      ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const drawEffects = () => {
    for (let i = effects.length - 1; i >= 0; i--) {
      const ef = effects[i];
      if (ef.type === 'ring') {
        const x = ef.x - camera.x;
        const y = ef.y - camera.y;
        ctx.save();
        ctx.globalAlpha = ef.alpha;
        const grad = ctx.createRadialGradient(x, y, ef.r * 0.6, x, y, ef.r);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, ef.color);
        ctx.strokeStyle = ef.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, ef.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ef.r += 1.4;
        ef.alpha -= 0.02;
        if (ef.r > ef.maxR || ef.alpha <= 0) effects.splice(i, 1);
      } else if (ef.type === 'confetti') {
        const x = ef.x - camera.x;
        const y = ef.y - camera.y;
        ctx.save();
        ctx.globalAlpha = Math.max(0, ef.life / 130);
        ctx.fillStyle = ef.color;
        ctx.fillRect(x, y, 3, 3);
        ctx.restore();
        ef.x += ef.vx;
        ef.y += ef.vy;
        ef.vy += 0.03;
        ef.life -= 1;
        if (ef.life <= 0) effects.splice(i, 1);
      } else if (ef.type === 'sparkle') {
        const x = ef.x - camera.x;
        const y = ef.y - camera.y;
        ctx.save();
        ctx.globalAlpha = Math.max(0, ef.life / 35);
        ctx.fillStyle = ef.color;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ef.x += ef.vx;
        ef.y += ef.vy;
        ef.vy += 0.02;
        ef.life -= 1;
        if (ef.life <= 0) effects.splice(i, 1);
      }
    }
  };

  const drawUI = () => {
    // Top bar with soft gradient
    const barGrad = ctx.createLinearGradient(0, 0, 0, 46);
    barGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    barGrad.addColorStop(1, 'rgba(255,255,255,0.82)');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, canvas.width, 46);
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.beginPath();
    ctx.moveTo(0, 46);
    ctx.lineTo(canvas.width, 46);
    ctx.stroke();

    // Inventory label
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Bag:', 10, 18);

    // Ten icon
    ctx.save();
    ctx.translate(60, 12);
    ctx.fillStyle = '#f7d35b';
    ctx.strokeStyle = '#b19020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-8, -10, 16, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#453a00';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('10', 0, 0);
    ctx.restore();
    ctx.fillStyle = '#333';
    ctx.fillText(`x ${player.tens}`, 82, 18);

    // One icon
    ctx.save();
    ctx.translate(140, 12);
    ctx.fillStyle = '#3bd4b8';
    ctx.strokeStyle = '#1a8a78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0a5248';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', 0, 0);
    ctx.restore();
    ctx.fillStyle = '#333';
    ctx.fillText(`x ${player.ones}`, 162, 18);

    // Total
    const total = player.tens * 10 + player.ones;
    ctx.fillText(`Total: ${total}`, 220, 18);

    // Solved
    ctx.fillText(`Gates solved: ${solvedCount}/${targetSolveTotal}`, 340, 18);

    // Mute indicator
    ctx.textAlign = 'right';
    ctx.fillText(`Audio: ${AudioManager.isMuted() ? 'Off (M to toggle)' : 'On (M to toggle)'}`, canvas.width - 10, 18);

    // Controls line
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#555';
    ctx.fillText('Move: Arrows/WASD  •  Space: Try gate  •  Q: Drop 1  •  E: Drop 10  •  H: Help  •  R: Reset', 10, 36);

    // Messages
    const now = performance.now();
    if (messageQueue.length > 0) {
      const msg = messageQueue[0];
      const age = now - msg.time;
      if (age > msg.duration) {
        messageQueue.shift();
      } else {
        const alpha = Math.min(1, 1 - Math.abs(age - msg.duration / 2) / (msg.duration / 2));
        ctx.save();
        ctx.globalAlpha = 0.15 + 0.85 * alpha;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        const pad = 14;
        const textWidth = Math.min(600, canvas.width - 80);
        // Background bubble
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        const bx = (canvas.width - textWidth) / 2 - pad;
        const by = canvas.height - 90;
        const bw = textWidth + pad * 2;
        const bh = 56;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#212121';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        wrapText(msg.text, canvas.width / 2, canvas.height - 60, textWidth, 20);
        ctx.restore();
      }
    }

    // Help overlay
    if (showHelp) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#fffef8';
      ctx.fillRect(40, 60, canvas.width - 80, canvas.height - 120);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 60, canvas.width - 80, canvas.height - 120);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tens & Trails - Open World Math', canvas.width / 2, 90);
      ctx.font = '16px sans-serif';
      const instructions =
        'Goal: Explore the islands and open 3 ancient number gates.\n' +
        'Collect 10-sticks and 1-stones. Your bag total must match a gate number to open it.\n' +
        'Controls:\n' +
        '• Move: Arrow keys or WASD\n' +
        '• Try Gate: Space (stand near a totem)\n' +
        '• Drop a 1: Q   • Drop a 10: E\n' +
        '• Toggle Sound: M\n' +
        '• Help On/Off: H\n' +
        '• Reset World: R\n\n' +
        'Tip: Think in tens and ones! For example, to make 37: 3 tens and 7 ones.\n' +
        'NPC Friends:\n' +
        '• Maple the Mapcat gives hints.\n' +
        '• Bloop the Bubble Whale shares tips.\n' +
        'Have fun exploring!';
      wrapText(instructions, canvas.width / 2, 120, canvas.width - 120, 22);
      ctx.restore();
    }

    // Win overlay
    if (gameWon) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(80, 120, canvas.width - 160, 240);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 4;
      ctx.strokeRect(80, 120, canvas.width - 160, 240);
      ctx.fillStyle = '#226a3d';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Hooray! You opened all the gates!', canvas.width / 2, 170);
      ctx.fillStyle = '#333';
      ctx.font = '18px sans-serif';
      wrapText('You used tens and ones like a true explorer. Press R to reset the world and play again, or keep wandering the islands.', canvas.width / 2, 210, canvas.width - 200, 24);
      ctx.restore();
    }
  };

  const wrapText = (text, x, y, maxWidth, lineHeight) => {
    const lines = text.split('\n');
    ctx.textAlign = 'center';
    for (let ln of lines) {
      const words = ln.split(' ');
      let line = '';
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, y);
          line = words[n] + ' ';
          y += lineHeight;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
  };

  // Update logic (mechanics unchanged)
  const update = (dt) => {
    // Movement
    const up = keys.has('ArrowUp') || keys.has('KeyW');
    const down = keys.has('ArrowDown') || keys.has('KeyS');
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');

    let ax = 0, ay = 0;
    if (up) ay -= 1;
    if (down) ay += 1;
    if (left) ax -= 1;
    if (right) ax += 1;

    let moving = false;
    if (ax !== 0 || ay !== 0) {
      const len = Math.hypot(ax, ay) || 1;
      player.vx = (ax / len) * player.speed;
      player.vy = (ay / len) * player.speed;
      player.facing = Math.atan2(ay, ax);
      moving = true;
    } else {
      player.vx *= 0.7;
      player.vy *= 0.7;
    }

    if (moving) {
      // Different footstep timbre for land vs water
      AudioManager.step(isLand(player.x, player.y));
    }

    // Position and camera
    const nx = player.x + player.vx;
    const ny = player.y + player.vy;
    player.x = clamp(nx, 20, world.width - 20);
    player.y = clamp(ny, 20, world.height - 20);

    camera.x = clamp(player.x - canvas.width / 2, 0, world.width - canvas.width);
    camera.y = clamp(player.y - canvas.height / 2, 0, world.height - canvas.height);

    // Item pickups
    const nowT = performance.now();
    for (const it of world.items) {
      if (it.picked) continue;
      if (it.noPickupUntil && nowT < it.noPickupUntil) continue;
      if (dist(player, it) < 18) {
        it.picked = true;
        if (it.type === 'ten') player.tens += 1;
        else player.ones += 1;
        AudioManager.start();
        AudioManager.pickup();
        addRing(it.x, it.y, it.type === 'ten' ? '#b19020' : '#1a8a78');
        addSparkle(it.x, it.y, it.type === 'ten' ? '#fff1a8' : '#a5fff3');
        narrate(it.type === 'ten' ? 'Picked a 10-stick.' : 'Picked a 1-stone.');
      }
    }

    // NPC hints
    for (const n of world.npcs) {
      const close = dist(player, n) < n.talkRadius;
      if (close && performance.now() - lastMessageTime > 5000) {
        enqueueMessage(n.message, 5000);
        narrate(`${n.name} says: ${n.message}`);
        lastMessageTime = performance.now();
      }
    }

    // Shard collection
    for (const s of world.shards) {
      if (s.collected) continue;
      const g = world.gates.find((gt) => gt.id === s.gateId);
      if (!g || !g.open) continue;
      if (dist(player, s) < 18) {
        s.collected = true;
        addRing(s.x, s.y, '#ffc107');
        addSparkle(s.x, s.y, '#ffe082');
        AudioManager.pickup();
        enqueueMessage('Star Shard collected! Keep exploring.', 3000);
      }
    }

    // Win check
    if (!gameWon && solvedCount >= targetSolveTotal) {
      gameWon = true;
      AudioManager.correct();
      addConfetti(player.x, player.y);
      narrate('You opened all the gates! Great job using tens and ones.');
    }
  };

  // Gate interaction and drops (mechanics unchanged)
  const tryGate = () => {
    let nearbyGate = null;
    for (const g of world.gates) {
      if (!g.open && dist(player, g) < 36) {
        nearbyGate = g;
        break;
      }
    }
    if (!nearbyGate) {
      enqueueMessage('No gate nearby. Find a stone totem and stand close.', 2000);
      narrate('No gate nearby.');
      return;
    }

    const total = player.tens * 10 + player.ones;
    const t = nearbyGate.target;
    if (total === t) {
      nearbyGate.open = true;
      solvedCount += 1;
      AudioManager.correct();
      addConfetti(nearbyGate.x, nearbyGate.y);
      enqueueMessage(`Gate opened! Great match: ${player.tens} tens + ${player.ones} ones = ${t}`, 4500);
      narrate(`Gate opened. Your total equals ${t}.`);
    } else {
      const diff = t - total;
      if (diff > 0) {
        enqueueMessage(`Need ${diff} more. Tip: ${Math.floor(diff / 10)} tens and ${diff % 10} ones would make it.`, 4500);
        narrate(`You need ${diff} more to open this gate.`);
      } else {
        const over = -diff;
        enqueueMessage(`Too many by ${over}. Drop some items (Q drops 1, E drops 10).`, 4500);
        narrate(`You have ${over} too many.`);
      }
      AudioManager.incorrect();
      addRing(nearbyGate.x, nearbyGate.y, '#ff6b6b');
    }
  };

  const dropOne = () => {
    if (player.ones <= 0) {
      enqueueMessage('No 1-stones to drop.', 1500);
      narrate('No ones to drop.');
      return;
    }
    player.ones -= 1;
    const angle = player.facing;
    const dropDist = 28; // ensure outside immediate pickup radius (18)
    const dx = Math.cos(angle) * dropDist;
    const dy = Math.sin(angle) * dropDist;
    const px = clamp(player.x + dx, 10, world.width - 10);
    const py = clamp(player.y + dy, 10, world.height - 10);
    world.items.push({ type: 'one', x: px, y: py, picked: false, wobble: rand(0, Math.PI * 2), noPickupUntil: performance.now() + 500 });
    AudioManager.playTone(260, 0.07, 'sine', 0.12, -0.05);
    addRing(px, py, '#1a8a78');
  };

  const dropTen = () => {
    if (player.tens <= 0) {
      enqueueMessage('No 10-sticks to drop.', 1500);
      narrate('No tens to drop.');
      return;
    }
    player.tens -= 1;
    const angle = player.facing;
    const dropDist = 28;
    const dx = Math.cos(angle) * dropDist;
    const dy = Math.sin(angle) * dropDist;
    const px = clamp(player.x + dx, 10, world.width - 10);
    const py = clamp(player.y + dy, 10, world.height - 10);
    world.items.push({ type: 'ten', x: px, y: py, picked: false, wobble: rand(0, Math.PI * 2), noPickupUntil: performance.now() + 500 });
    AudioManager.playTone(180, 0.08, 'triangle', 0.12, 0.05);
    addRing(px, py, '#b19020');
  };

  // Keyboard handlers
  window.addEventListener('keydown', (e) => {
    if (!firstInteraction) {
      firstInteraction = true;
      AudioManager.start();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.code);

    const key = (e.key || '').toLowerCase();
    switch (e.code) {
      case 'Space':
        tryGate();
        break;
      case 'KeyQ':
        dropOne();
        break;
      case 'KeyE':
        dropTen();
        break;
      // fallthrough to handle other keys after switch
      case 'KeyH':
        showHelp = !showHelp;
        narrate(showHelp ? 'Help opened.' : 'Help closed.');
        break;
      case 'KeyM': {
        const muted = AudioManager.toggleMute();
        enqueueMessage(`Audio ${muted ? 'muted' : 'unmuted'}`, 1200);
        narrate(`Audio ${muted ? 'off' : 'on'}.`);
        break;
      }
      case 'KeyR':
        initWorld();
        enqueueMessage('World reset. New gates await!', 1800);
        narrate('World reset.');
        break;
      default:
        // Keyboard-layout fallback using e.key when e.code differs
        if (key === 'q') {
          e.preventDefault();
          dropOne();
        } else if (key === 'e') {
          e.preventDefault();
          dropTen();
        }
        break;
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  // Polyfill for roundRect if needed
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // Main loop
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = (now - last) / 16.67;
    last = now;

    update(dt);

    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawGatesAndShards();
    drawItems();
    drawNPCs();
    drawPlayer();
    drawEffects();
    drawUI();

    requestAnimationFrame(loop);
  };

  // Initialize and start
  initWorld();
  loop();
})();