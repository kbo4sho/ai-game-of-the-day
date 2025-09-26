(function () {
  // Machine Math Game - Visual & Audio Enhancements
  // Renders into element with id "game-of-the-day-stage"
  // Canvas-based visuals, Web Audio API sounds (generated). All visuals drawn with canvas methods.

  // --------- Setup and Constants ----------
  const STAGE_ID = "game-of-the-day-stage";
  const WIDTH = 720;
  const HEIGHT = 480;

  const COLORS = {
    bgTop: "#E6F7F8",
    bgBottom: "#F9FCFD",
    panel: "#F0FAF8",
    machine: "#DFF2EC",
    gear: "#FFDDB7",
    gearAccent: "#FFB86B",
    highlight: "#5BC0C8",
    text: "#12343A",
    wrong: "#E85A4F",
    correct: "#3FB141",
    muted: "#A0A0A0",
    cloud: "rgba(255,255,255,0.9)"
  };

  const MAX_LEVEL = 6;

  // Accessibility live region
  let liveRegion = null;

  // Canvas & context
  const stage = document.getElementById(STAGE_ID);
  if (!stage) {
    console.error(`Element with id "${STAGE_ID}" not found.`);
    return;
  }
  stage.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Machine Math game canvas");
  canvas.style.width = WIDTH + "px";
  canvas.style.height = HEIGHT + "px";
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";
  stage.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Canvas 2D context not supported.");
    return;
  }

  // Create an aria-live region for screen readers (visually hidden but accessible)
  liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.style.position = "absolute";
  liveRegion.style.left = "-9999px";
  liveRegion.style.width = "1px";
  liveRegion.style.height = "1px";
  liveRegion.style.overflow = "hidden";
  stage.appendChild(liveRegion);

  // --------- Audio Setup (Web Audio API) ----------
  let audioCtx = null;
  let audioEnabled = true;
  let bgGainNode = null;
  let bgNodes = {}; // hold background nodes for control
  let scheduledChimeInterval = null;

  function safeCreateAudioContext() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio API not supported in this browser.");
      audioCtx = new AC();
      // resume on user interaction if necessary
      if (audioCtx.state === "suspended") {
        const resume = () => {
          audioCtx.resume().catch(() => {});
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
        };
        window.addEventListener("pointerdown", resume);
        window.addEventListener("keydown", resume);
      }
      return true;
    } catch (err) {
      console.warn("Audio context could not be created:", err);
      audioEnabled = false;
      audioCtx = null;
      return false;
    }
  }

  safeCreateAudioContext();

  // Utility to create a short tone with basic ADSR envelope
  function playTone(frequency = 440, duration = 0.25, type = "sine", when = 0, gainValue = 0.08) {
    if (!audioEnabled || !audioCtx) return null;
    try {
      const now = audioCtx.currentTime + when;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      o.type = type;
      o.frequency.value = frequency;
      filter.type = "lowpass";
      filter.frequency.value = Math.max(600, frequency * 2);

      g.gain.value = 0;
      o.connect(filter);
      filter.connect(g);
      g.connect(audioCtx.destination);

      // Envelope: quick attack, gentle decay, short sustain, release
      const attack = Math.min(0.02, duration * 0.2);
      const release = Math.min(0.06, duration * 0.3);
      const sustainTime = Math.max(0, duration - attack - release);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gainValue, now + attack);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * 0.6), now + attack + sustainTime);
      g.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustainTime + release);

      o.start(now);
      o.stop(now + duration + 0.02);

      // return nodes for possible manipulation
      return { oscillator: o, gain: g, filter };
    } catch (err) {
      console.warn("playTone error:", err);
      return null;
    }
  }

  // Soft chime pattern for success
  function playCorrect() {
    if (!audioEnabled || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      // gentle ascending bells
      playTone(880, 0.12, "triangle", 0, 0.06);
      playTone(1100, 0.12, "triangle", 0.11, 0.05);
      playTone(1320, 0.22, "sine", 0.23, 0.08);
      // small harmonic finish
      playTone(660, 0.18, "sine", 0.5, 0.04);
    } catch (err) {
      console.warn("playCorrect error:", err);
    }
  }

  // Short dissonant but soft tone for wrong
  function playWrong() {
    if (!audioEnabled || !audioCtx) return;
    try {
      playTone(220, 0.28, "sawtooth", 0, 0.08);
      playTone(260, 0.18, "sawtooth", 0.06, 0.05);
    } catch (err) {
      console.warn("playWrong error:", err);
    }
  }

  // Soft click for placement
  function playClick() {
    if (!audioEnabled || !audioCtx) return;
    try {
      // use a bandpass filtered noise-like oscillator
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filt = audioCtx.createBiquadFilter();
      o.type = "square";
      o.frequency.value = 1200;
      filt.type = "highpass";
      filt.frequency.value = 800;
      g.gain.value = 0;
      o.connect(filt);
      filt.connect(g);
      g.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.start(now);
      o.stop(now + 0.14);
    } catch (err) {
      console.warn("playClick error:", err);
    }
  }

  // Gentle background layer (drone + slow bell pattern)
  function startBackgroundHum() {
    if (!audioEnabled || !audioCtx) return;
    try {
      if (bgGainNode) return; // already running
      const now = audioCtx.currentTime;

      // Drone oscillator (low, warm)
      const drone = audioCtx.createOscillator();
      drone.type = "sine";
      drone.frequency.value = 60;
      const droneGain = audioCtx.createGain();
      droneGain.gain.value = 0.01;

      // gentle high shimmer oscillator
      const shimmer = audioCtx.createOscillator();
      shimmer.type = "sine";
      shimmer.frequency.value = 340;
      const shimmerGain = audioCtx.createGain();
      shimmerGain.gain.value = 0.002;

      // lowpass filter to keep it soft
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1000;

      // Master background gain for on/off
      bgGainNode = audioCtx.createGain();
      bgGainNode.gain.value = 0.02;

      drone.connect(filter);
      shimmer.connect(filter);
      filter.connect(bgGainNode);
      bgGainNode.connect(audioCtx.destination);

      drone.connect(filter); // already connected
      shimmer.connect(filter);

      drone.start(now);
      shimmer.start(now);

      bgNodes.drone = drone;
      bgNodes.shimmer = shimmer;
      bgNodes.filter = filter;

      // Scheduled soft chiming every 6-12 seconds to give life (not intrusive)
      scheduledChimeInterval = setInterval(() => {
        if (!audioEnabled || !audioCtx) return;
        // pick a gentle random triad around middle C
        const base = 392 + (Math.random() > 0.5 ? 0 : 12); // G3 or G4
        playTone(base, 0.12, "triangle", 0, 0.02);
        playTone(base * 1.26, 0.12, "triangle", 0.08, 0.015);
      }, 7000 + Math.random() * 3000);
    } catch (err) {
      console.warn("startBackgroundHum error:", err);
    }
  }

  function stopBackgroundHum() {
    if (!audioEnabled || !audioCtx) return;
    try {
      if (bgNodes.drone) {
        try {
          bgNodes.drone.stop();
          bgNodes.drone.disconnect();
        } catch (e) {}
      }
      if (bgNodes.shimmer) {
        try {
          bgNodes.shimmer.stop();
          bgNodes.shimmer.disconnect();
        } catch (e) {}
      }
      if (bgNodes.filter) {
        try {
          bgNodes.filter.disconnect();
        } catch (e) {}
      }
      bgNodes = {};
      if (bgGainNode) {
        try {
          bgGainNode.disconnect();
        } catch (e) {}
        bgGainNode = null;
      }
      if (scheduledChimeInterval) {
        clearInterval(scheduledChimeInterval);
        scheduledChimeInterval = null;
      }
    } catch (err) {
      console.warn("stopBackgroundHum error:", err);
    }
  }

  // Start background hum if audio works
  if (audioEnabled && audioCtx) {
    try {
      startBackgroundHum();
    } catch (e) {
      console.warn("Background hum failed:", e);
    }
  }

  // Allow toggling audio with 'M'
  function toggleAudio() {
    audioEnabled = !audioEnabled;
    if (!audioEnabled) {
      stopBackgroundHum();
      announce("Audio muted.");
    } else {
      if (!audioCtx) safeCreateAudioContext();
      if (audioCtx) startBackgroundHum();
      announce("Audio unmuted.");
    }
  }

  // --------- Game State ----------
  let level = 1;
  let availableGears = []; // array of numbers or null
  let slots = []; // built gears (numbers or null)
  let selectedIndex = 0; // index of selected gear or slot
  let selectedMode = "gear"; // 'gear' or 'slot'
  let target = 0;
  let maxSlots = 3;
  let messageText =
    "Welcome! Use arrow keys to pick gears and press Space to load into the machine. Press S to start the machine.";
  let showHint = false;
  let gameWon = false;
  let muteVisual = !audioEnabled;

  // Visual animation state
  let gearAngles = []; // rotate each available gear slightly
  let gearAngularVel = [];
  let slotAngles = [];
  let slotAngularVel = [];
  let cloudOffset = 0;
  let mousePos = { x: WIDTH / 2, y: HEIGHT / 2 };

  // Confetti particles for celebration
  const confetti = [];

  // Helper for announcing to screen reader
  function announce(text) {
    if (!liveRegion) return;
    try {
      liveRegion.textContent = text;
    } catch (e) {
      console.warn("announce failed:", e);
    }
  }

  // Create a solvable level:
  function generateLevel(lvl) {
    // Determine number of slots based on level (increase gradually up to 5)
    maxSlots = Math.min(3 + Math.floor((lvl - 1) / 2), 5);
    // Choose n numbers that will form the solution
    const solution = [];
    const pool = [];
    // Create a pool of numbers appropriate to level
    const maxVal = Math.min(12 + lvl * 2, 20);
    for (let i = 1; i <= maxVal; i++) pool.push(i);

    // Randomly pick maxSlots numbers from pool to be the solution
    for (let i = 0; i < maxSlots; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      solution.push(pool.splice(idx, 1)[0]);
    }

    // target is sum of solution
    target = solution.reduce((a, b) => a + b, 0);

    // Now create available gears: include the solution numbers, plus some distractors
    const gears = solution.slice();
    // Add distractors: up to 6 available total
    const totalGears = Math.max(6, Math.min(8, 4 + lvl));
    while (gears.length < totalGears) {
      // pick random from pool or from set 1..maxVal
      const candidate = 1 + Math.floor(Math.random() * maxVal);
      // avoid too many duplicates of same value so there's a chance to choose right combos
      if (gears.filter((x) => x === candidate).length < 2) {
        gears.push(candidate);
      }
    }

    // Shuffle gears
    for (let i = gears.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gears[i], gears[j]] = [gears[j], gears[i]];
    }

    availableGears = gears;
    slots = new Array(maxSlots).fill(null);
    selectedIndex = 0;
    selectedMode = "gear";
    messageText = `Level ${lvl}: Build a sum of ${target} using ${maxSlots} slots.`;
    showHint = false;
    gameWon = false;
    // initialize rotation arrays with gentle random values
    gearAngles = new Array(availableGears.length).fill(0).map(() => Math.random() * Math.PI * 2);
    gearAngularVel = new Array(availableGears.length).fill(0).map(() => (Math.random() - 0.5) * 0.02);
    slotAngles = new Array(slots.length).fill(0).map(() => (Math.random() - 0.5) * 0.05);
    slotAngularVel = new Array(slots.length).fill(0).map(() => (Math.random() - 0.5) * 0.02);
    announce(messageText);
  }

  // Place a gear into selected slot (or remove if slot selected)
  function loadGearToSlot(gearIndex, slotIndex) {
    if (gearIndex < 0 || gearIndex >= availableGears.length) return false;
    if (slotIndex < 0 || slotIndex >= slots.length) return false;
    if (availableGears[gearIndex] == null) {
      messageText = "That gear spot is empty.";
      announce(messageText);
      playWrong();
      return false;
    }
    if (slots[slotIndex] !== null) {
      // replace: swap
      const temp = slots[slotIndex];
      slots[slotIndex] = availableGears[gearIndex];
      availableGears[gearIndex] = temp;
      // gentle angular impulse when swapping
      slotAngularVel[slotIndex] = (Math.random() - 0.5) * 0.18;
      gearAngularVel[gearIndex] = (Math.random() - 0.5) * 0.12;
    } else {
      // place gear into slot and remove from available list (set to null)
      slots[slotIndex] = availableGears[gearIndex];
      availableGears[gearIndex] = null;
      // move gear angle state into slot for smooth rotation
      const angle = gearAngles[gearIndex] || 0;
      slotAngles[slotIndex] = angle;
      slotAngularVel[slotIndex] = (Math.random() - 0.5) * 0.06;
      // keep arrays consistent
      compactAvailableGears();
    }
    // audio and small click
    playClick();
    messageText = `Placed a gear in slot ${slotIndex + 1}.`;
    announce(messageText);
    return true;
  }

  function removeFromSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= slots.length) return false;
    if (slots[slotIndex] === null) return false;
    // Return gear to availableGears; find a null spot or push
    let found = false;
    for (let i = 0; i < availableGears.length; i++) {
      if (availableGears[i] === null) {
        availableGears[i] = slots[slotIndex];
        // transfer rotation back
        gearAngles[i] = slotAngles[slotIndex] || 0;
        gearAngularVel[i] = (Math.random() - 0.5) * 0.08;
        found = true;
        break;
      }
    }
    if (!found) {
      availableGears.push(slots[slotIndex]);
      gearAngles.push(slotAngles[slotIndex] || 0);
      gearAngularVel.push((Math.random() - 0.5) * 0.08);
    }
    slots[slotIndex] = null;
    compactAvailableGears();
    playClick();
    messageText = `Removed gear from slot ${slotIndex + 1}.`;
    announce(messageText);
    return true;
  }

  function compactAvailableGears() {
    // Remove undefineds but keep null placeholders to maintain visual spacing
    const newGears = availableGears.filter((g) => g !== undefined);
    // Ensure arrays in sync
    availableGears = newGears;
    // Make sure gearAngles arrays match length; if too short, add
    while (gearAngles.length < availableGears.length) {
      gearAngles.push(Math.random() * Math.PI * 2);
      gearAngularVel.push((Math.random() - 0.5) * 0.06);
    }
    while (gearAngles.length > availableGears.length) {
      gearAngles.pop();
      gearAngularVel.pop();
    }
    // Keep at least 6 visual spots for layout when few gears exist
    while (availableGears.length < 6) {
      availableGears.push(null);
      gearAngles.push(Math.random() * Math.PI * 2);
      gearAngularVel.push(0);
    }
  }

  function computeSlotSum() {
    return slots.reduce((sum, v) => (v ? sum + v : sum), 0);
  }

  // Validate the machine: if sum equals target it's correct
  function startMachine() {
    const sum = computeSlotSum();
    if (slots.includes(null)) {
      messageText = `Fill all ${maxSlots} slots before starting!`;
      playWrong();
      announce(messageText);
      // subtle shake hint
      triggerShake();
      return false;
    }
    if (sum === target) {
      // success
      playCorrect();
      // celebratory animation spawn
      spawnConfetti(24);
      messageText = `Nice! You built ${target}.`;
      announce(messageText);
      gameWon = true;
      setTimeout(() => {
        level++;
        if (level > MAX_LEVEL) {
          // game finished
          messageText = "You fixed the Great Machine! You win! Press R to play again.";
          announce(messageText);
          // more confetti on final
          spawnConfetti(48);
        } else {
          generateLevel(level);
        }
      }, 900);
      return true;
    } else {
      playWrong();
      // brief shake effect
      triggerShake();
      messageText = `Not quite. Your machine produced ${sum}, but the target is ${target}. Try again or press H for a hint.`;
      announce(messageText);
      return false;
    }
  }

  function provideHint() {
    showHint = true;
    const sum = computeSlotSum();
    if (slots.includes(null)) {
      messageText = `Hint: Try picking a combination that adds to ${target}.`;
    } else {
      if (sum < target) {
        messageText = `Hint: Your sum ${sum} is too low. Try larger numbers.`;
      } else {
        messageText = `Hint: Your sum ${sum} is too high. Try smaller numbers.`;
      }
    }
    playTone(440, 0.18, "triangle", 0, 0.06);
    announce(messageText);
  }

  function resetLevel() {
    generateLevel(level);
  }

  function resetGame() {
    level = 1;
    generateLevel(level);
  }

  // Build initial level
  generateLevel(level);

  // ---------- Input Handling (mouse and keyboard) ----------
  // Convert mouse position to gear index or slot index
  function getHitAt(x, y) {
    // Gear area on left bottom
    const gearArea = { x: 40, y: 320, w: 640, h: 140 };
    // Each gear drawn horizontally
    const gearWidth = 88;
    const gearGap = 16;
    const baseX = 60;
    const baseY = 340;
    // Use drawnIndex mapping so clicks map to the visual position, but keep returned index matching availableGears indices
    let drawnIndex = 0;
    for (let i = 0; i < availableGears.length; i++) {
      const val = availableGears[i];
      const gx = baseX + drawnIndex * (gearWidth + gearGap);
      const gy = baseY;
      const gw = gearWidth;
      const gh = gearWidth;
      if (x >= gx && x <= gx + gw && y >= gy && y <= gy + gh) {
        return { type: "gear", index: i, drawnIndex };
      }
      drawnIndex++;
    }

    // Slot area on machine center
    const slotsWidth = slots.length * 80 + (slots.length - 1) * 20;
    const sx = WIDTH / 2 - slotsWidth / 2;
    const sy = 170;
    for (let i = 0; i < slots.length; i++) {
      const gx = sx + i * 100;
      const gy = sy;
      const gw = 80;
      const gh = 80;
      if (x >= gx && x <= gx + gw && y >= gy && y <= gy + gh) {
        return { type: "slot", index: i };
      }
    }

    // Start button
    const btn = getStartButtonRect();
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      return { type: "start" };
    }

    // Audio toggle
    const aud = getAudioIconRect();
    if (x >= aud.x && x <= aud.x + aud.w && y >= aud.y && y <= aud.y + aud.h) {
      return { type: "audio" };
    }

    return null;
  }

  function canvasPointerHandler(e) {
    let rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left) * (canvas.width / rect.width);
    let y = (e.clientY - rect.top) * (canvas.height / rect.height);
    mousePos.x = x;
    mousePos.y = y;
    const hit = getHitAt(x, y);
    if (!hit) return;
    if (hit.type === "gear") {
      // select gear (toggle mode)
      selectedMode = "gear";
      selectedIndex = hit.index;
      announce(`Selected gear ${availableGears[hit.index] || "empty"}`);
      // subtle select sound
      playTone(720, 0.06, "triangle", 0, 0.03);
    } else if (hit.type === "slot") {
      selectedMode = "slot";
      selectedIndex = hit.index;
      announce(`Selected slot ${hit.index + 1}`);
      playTone(620, 0.06, "triangle", 0, 0.03);
    } else if (hit.type === "start") {
      startMachine();
    } else if (hit.type === "audio") {
      toggleAudio();
      muteVisual = !audioEnabled;
    }
  }

  canvas.addEventListener("pointerdown", canvasPointerHandler);

  // Click-to-place: when gear selected and then clicking slot will place
  canvas.addEventListener("pointerup", (e) => {
    let rect = canvas.getBoundingClientRect();
    let x = (e.clientX - rect.left) * (canvas.width / rect.width);
    let y = (e.clientY - rect.top) * (canvas.height / rect.height);
    mousePos.x = x;
    mousePos.y = y;
    const hit = getHitAt(x, y);
    if (!hit) return;
    if (hit.type === "slot" && selectedMode === "gear") {
      // Place selected gear into this slot
      if (availableGears[selectedIndex] == null) {
        messageText = "You selected an empty gear spot.";
        announce(messageText);
        playWrong();
        return;
      }
      loadGearToSlot(selectedIndex, hit.index);
    } else if (hit.type === "gear" && selectedMode === "slot") {
      // If a slot is selected and gear is clicked, swap or place
      const targetSlot = selectedIndex;
      if (slots[targetSlot] == null) {
        // place gear into slot
        loadGearToSlot(hit.index, targetSlot);
      } else {
        // swap
        const tmp = slots[targetSlot];
        slots[targetSlot] = availableGears[hit.index];
        availableGears[hit.index] = tmp;
        compactAvailableGears();
        playClick();
        // small angular impulses
        slotAngularVel[targetSlot] = (Math.random() - 0.5) * 0.12;
      }
    }
  });

  // Track mouse for robot eye follow
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mousePos.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  // Keyboard controls
  window.addEventListener("keydown", (e) => {
    if (gameWon && level > MAX_LEVEL) {
      // if fully completed, allow R to restart
      if (e.key.toLowerCase() === "r") resetGame();
      return;
    }
    switch (e.key) {
      case "ArrowLeft":
        // move selection left inside current mode
        if (selectedMode === "gear") {
          selectedIndex = Math.max(0, selectedIndex - 1);
        } else {
          selectedIndex = Math.max(0, selectedIndex - 1);
        }
        announceSelection();
        break;
      case "ArrowRight":
        if (selectedMode === "gear") {
          selectedIndex = Math.min(availableGears.length - 1, selectedIndex + 1);
        } else {
          selectedIndex = Math.min(slots.length - 1, selectedIndex + 1);
        }
        announceSelection();
        break;
      case "ArrowUp":
        // switch to gear mode
        selectedMode = "gear";
        selectedIndex = Math.min(selectedIndex, Math.max(0, availableGears.length - 1));
        announceSelection();
        break;
      case "ArrowDown":
        selectedMode = "slot";
        selectedIndex = Math.min(selectedIndex, Math.max(0, slots.length - 1));
        announceSelection();
        break;
      case " ":
      case "Enter":
        // act: if gear selected and slot selection exists, try placing in currently highlighted slot
        if (selectedMode === "gear") {
          // place into first empty slot or currently selected slot
          let targetSlot = slots.findIndex((s) => s === null);
          if (targetSlot === -1) targetSlot = 0;
          loadGearToSlot(selectedIndex, targetSlot);
        } else {
          // slot selected: if slot has gear, remove it; if empty, try fill with selected gear if any (none)
          if (slots[selectedIndex] !== null) {
            removeFromSlot(selectedIndex);
          } else {
            // try to put currently highlighted gear (if any) into this slot
            const gearIdx = availableGears.findIndex((g) => g !== null && g !== undefined);
            if (gearIdx !== -1) {
              loadGearToSlot(gearIdx, selectedIndex);
            } else {
              messageText = "No available gears to place.";
              playWrong();
              announce(messageText);
            }
          }
        }
        break;
      case "s":
      case "S":
        startMachine();
        break;
      case "r":
      case "R":
        resetLevel();
        break;
      case "h":
      case "H":
        provideHint();
        break;
      case "m":
      case "M":
        toggleAudio();
        muteVisual = !audioEnabled;
        break;
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        // quick select gear by number 1..9 mapping to index
        {
          const idx = parseInt(e.key, 10) - 1;
          if (idx >= 0 && idx < availableGears.length) {
            selectedMode = "gear";
            selectedIndex = idx;
            announceSelection();
          }
        }
        break;
      default:
        break;
    }
  });

  function announceSelection() {
    if (selectedMode === "gear") {
      const val = availableGears[selectedIndex];
      announce(val ? `Selected gear ${val}` : "Selected empty gear spot");
      // soft blip
      playTone(720, 0.05, "triangle", 0, 0.02);
    } else {
      const val = slots[selectedIndex];
      announce(val ? `Selected slot ${selectedIndex + 1} with value ${val}` : `Selected empty slot ${selectedIndex + 1}`);
      playTone(620, 0.05, "triangle", 0, 0.02);
    }
  }

  // ---------- Drawing Utilities ----------
  function drawRoundedRect(x, y, w, h, r = 10, fill = true, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Draw gear with optional rotation angle
  function drawGear(cx, cy, radius, teeth = 8, holeRadius = 10, baseColor = COLORS.gear, accent = COLORS.gearAccent, angle = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // rim with teeth: draw alternating triangles
    for (let i = 0; i < teeth; i++) {
      const angleT = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 0.6) / teeth) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angleT) * (radius - 6), Math.sin(angleT) * (radius - 6));
      ctx.lineTo(Math.cos(nextAngle) * (radius + 6), Math.sin(nextAngle) * (radius + 6));
      ctx.lineTo(
        Math.cos(((i + 1) / teeth) * Math.PI * 2) * (radius - 6),
        Math.sin(((i + 1) / teeth) * Math.PI * 2) * (radius - 6)
      );
      ctx.closePath();
      // gradient for teeth
      const tg = ctx.createLinearGradient(-radius, -radius, radius, radius);
      tg.addColorStop(0, accent);
      tg.addColorStop(1, "#F9A94C");
      ctx.fillStyle = tg;
      ctx.fill();
    }
    // body
    ctx.beginPath();
    ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(-radius / 3, -radius / 3, 2, 0, 0, radius);
    bg.addColorStop(0, "#FFFFFF");
    bg.addColorStop(0.5, baseColor);
    bg.addColorStop(1, "#E8CFA5");
    ctx.fillStyle = bg;
    ctx.fill();

    // embossed ring
    ctx.beginPath();
    ctx.arc(0, 0, radius - 16, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();

    // center hole
    ctx.beginPath();
    ctx.arc(0, 0, holeRadius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.machine;
    ctx.fill();

    // subtle shading
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-radius / 3, -radius / 3, radius / 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // small screws
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (radius - 20), Math.sin(a) * (radius - 20), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function getStartButtonRect() {
    const w = 130;
    const h = 46;
    const x = WIDTH - w - 20;
    const y = HEIGHT - h - 20;
    return { x, y, w, h };
  }

  function getAudioIconRect() {
    const w = 36;
    const h = 36;
    const x = 20;
    const y = 20;
    return { x, y, w, h };
  }

  // ---------- Visual Effects Helpers ----------
  let globalShake = 0;
  function triggerShake() {
    globalShake = 0.9;
  }

  function spawnConfetti(count = 20) {
    for (let i = 0; i < count; i++) {
      confetti.push({
        x: Math.random() * WIDTH,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 2,
        vy: 1 + Math.random() * 2,
        size: 6 + Math.random() * 6,
        color: randomChoice(["#FFD700", "#FF6B6B", "#4BC0C8", "#7BED9F", "#C084FC"]),
        rot: Math.random() * Math.PI * 2,
        drot: (Math.random() - 0.5) * 0.2
      });
    }
  }

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---------- Main Render Loop ----------
  let lastTick = performance.now();
  let shake = 0;
  function render() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;

    // Update animations
    if (shake > 0) shake = Math.max(0, shake - dt * 3);
    if (globalShake > 0) globalShake = Math.max(0, globalShake - dt * 2);
    cloudOffset += dt * 8;

    // update gear rotations
    for (let i = 0; i < gearAngles.length; i++) {
      gearAngles[i] += gearAngularVel[i] || 0;
      // small damping
      gearAngularVel[i] *= 0.995;
    }
    for (let i = 0; i < slotAngles.length; i++) {
      slotAngles[i] += slotAngularVel[i] || 0;
      slotAngularVel[i] *= 0.996;
    }

    // confetti updates
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.rot += p.drot;
      if (p.y > HEIGHT + 20) confetti.splice(i, 1);
    }

    // Clear canvas
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Background gradient sky
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Soft moving clouds (parallax)
    ctx.save();
    ctx.globalAlpha = 0.95;
    for (let c = 0; c < 3; c++) {
      const cx = (cloudOffset * (0.6 + c * 0.3) + c * 200) % (WIDTH + 200) - 100;
      const cy = 40 + c * 28;
      ctx.fillStyle = COLORS.cloud;
      drawCloud(cx, cy, 140 + c * 20, 30 + c * 8);
    }
    ctx.restore();

    // Apply a global subtle shake transform when machine shakes
    ctx.save();
    const shakeAmt = (Math.sin(now / 60) * shake + Math.sin(now / 90) * globalShake) * 6;
    ctx.translate(shakeAmt, Math.cos(now / 120) * shakeAmt * 0.2);

    // big machine panel with soft textures
    ctx.save();
    const panelX = 60;
    const panelY = 40;
    const panelW = WIDTH - 120;
    const panelH = 240;
    // soft inner shadow
    ctx.fillStyle = COLORS.panel;
    drawRoundedRect(panelX, panelY, panelW, panelH, 18, true, false);

    // gentle vertical stripe on machine body for depth
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#000";
    for (let i = 0; i < panelH; i += 10) {
      ctx.fillRect(panelX + panelW - 80, panelY + i, 6, 6);
    }
    ctx.globalAlpha = 1;

    // decorative pipes
    ctx.fillStyle = "#CDEDE5";
    ctx.beginPath();
    ctx.roundRect
      ? (ctx.roundRect(panelX + 14, panelY + panelH - 36, panelW - 28, 12, 6), ctx.fill())
      : ctx.fillRect(panelX + 14, panelY + panelH - 36, panelW - 28, 12);
    ctx.fillRect(panelX + 18, panelY + 20, 12, panelH - 48);
    ctx.fillRect(panelX + panelW - 30, panelY + 20, 12, panelH - 48);
    ctx.restore();

    // Robot friendly face on top-left of machine
    ctx.save();
    const faceX = panelX + 28;
    const faceY = panelY + 28;
    drawRobotFace(faceX, faceY, mousePos);
    ctx.restore();

    // Target display with soft glow
    ctx.save();
    ctx.fillStyle = COLORS.machine;
    ctx.strokeStyle = "#BBD6D2";
    ctx.lineWidth = 2;
    const targetX = WIDTH / 2 - 120;
    const targetY = 90;
    // glow
    ctx.shadowColor = "rgba(88,192,200,0.12)";
    ctx.shadowBlur = 14;
    drawRoundedRect(targetX - 8, targetY - 18, 240, 72, 10, true, false);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.text;
    ctx.font = "22px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Target: ${target}`, targetX + 120, targetY + 30);
    ctx.restore();

    // Slots area
    ctx.save();
    const sx = WIDTH / 2 - (slots.length * 80 + (slots.length - 1) * 20) / 2;
    const sy = 170;
    for (let i = 0; i < slots.length; i++) {
      const x = sx + i * 100;
      const y = sy;
      // slot background with depth
      ctx.fillStyle = "#F8FFFC";
      drawRoundedRect(x, y, 80, 80, 10, true, false);
      // border highlight if selected
      if (selectedMode === "slot" && selectedIndex === i) {
        ctx.strokeStyle = COLORS.highlight;
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, y + 2, 76, 76);
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.04)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, 78, 78);
      }
      // if it has a gear, draw with rotation
      if (slots[i] !== null && slots[i] !== undefined) {
        drawGear(x + 40, y + 40, 30, 10, 8, COLORS.gear, COLORS.gearAccent, slotAngles[i] || 0);
        ctx.fillStyle = COLORS.text;
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(String(slots[i]), x + 40, y + 48);
      } else {
        // placeholder with faint inner circle
        ctx.fillStyle = "#F3FFFB";
        ctx.beginPath();
        ctx.arc(x + 40, y + 40, 18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Available gears - bottom area
    ctx.save();
    const baseX = 60;
    const baseY = 340;
    ctx.fillStyle = "#F7FBFE";
    drawRoundedRect(40, 316, 640, 140, 12, true);
    // draw each available gear
    let drawn = 0;
    for (let i = 0; i < availableGears.length; i++) {
      const val = availableGears[i];
      const gx = baseX + drawn * 104;
      const gy = baseY;
      if (val === null || val === undefined) {
        // empty placeholder
        ctx.fillStyle = "#EEEEF2";
        drawRoundedRect(gx, gy, 88, 88, 14, true);
        drawn++;
        continue;
      }
      // draw gear with its own rotation
      const angle = gearAngles[i] || 0;
      drawGear(gx + 44, gy + 44, 36, 10, 8, COLORS.gear, COLORS.gearAccent, angle);
      // number
      ctx.fillStyle = COLORS.text;
      ctx.font = "18px Arial";
      ctx.textAlign = "center";
      ctx.fillText(String(val), gx + 44, gy + 52);
      // highlight if selected
      if (selectedMode === "gear" && selectedIndex === i) {
        // pulsing stroke
        ctx.save();
        const pulse = 1 + Math.sin(now / 220) * 0.08;
        ctx.strokeStyle = COLORS.highlight;
        ctx.lineWidth = 3 * pulse;
        ctx.strokeRect(gx + 2, gy + 2, 84, 84);
        ctx.restore();
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.strokeRect(gx + 1, gy + 1, 86, 86);
      }
      drawn++;
    }
    ctx.restore();

    // Start button
    const btn = getStartButtonRect();
    ctx.save();
    // button with subtle gradient
    const btnGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x + btn.w, btn.y + btn.h);
    btnGrad.addColorStop(0, "#9DE0E6");
    btnGrad.addColorStop(1, "#6FC7CD");
    ctx.fillStyle = btnGrad;
    drawRoundedRect(btn.x, btn.y, btn.w, btn.h, 8, true);
    ctx.fillStyle = "#053233";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Start Machine", btn.x + btn.w / 2, btn.y + btn.h / 2 + 7);
    ctx.restore();

    // Audio icon
    const aud = getAudioIconRect();
    ctx.save();
    ctx.fillStyle = muteVisual ? COLORS.muted : COLORS.highlight;
    drawRoundedRect(aud.x, aud.y, aud.w, aud.h, 8, true);
    ctx.fillStyle = muteVisual ? "#FFFFFF" : "#052727";
    // speaker triangle
    ctx.beginPath();
    ctx.moveTo(aud.x + 8, aud.y + 10);
    ctx.lineTo(aud.x + 18, aud.y + 18);
    ctx.lineTo(aud.x + 8, aud.y + 26);
    ctx.closePath();
    ctx.fill();
    if (!audioEnabled) {
      // draw cross
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(aud.x + 22, aud.y + 12);
      ctx.lineTo(aud.x + 30, aud.y + 24);
      ctx.moveTo(aud.x + 30, aud.y + 12);
      ctx.lineTo(aud.x + 22, aud.y + 24);
      ctx.stroke();
    } else {
      // sound waves
      ctx.strokeStyle = muteVisual ? "#FFFFFF" : "#073737";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(aud.x + 28, aud.y + 18, 6, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();

    // Message panel with semi-transparency and soft shadow
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.shadowColor = "rgba(0,0,0,0.06)";
    ctx.shadowBlur = 8;
    drawRoundedRect(60, 260, 600, 40, 8, true);
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.text;
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(messageText, 76, 285);
    ctx.restore();

    // Hint area
    ctx.save();
    const hintX = 60;
    const hintY = 300;
    ctx.font = "13px Arial";
    ctx.textAlign = "left";
    if (showHint) {
      ctx.fillStyle = "#F8FFEE";
      drawRoundedRect(hintX, hintY, 280, 28, 6, true);
      ctx.fillStyle = "#075A4A";
      ctx.fillText("Hint shown above. Press H for another hint.", hintX + 10, hintY + 18);
    } else {
      ctx.fillStyle = "#F3F7F9";
      drawRoundedRect(hintX, hintY, 280, 28, 6, true);
      ctx.fillStyle = "#07424C";
      ctx.fillText("Tip: Press H for a gentle hint. Press M to mute/unmute.", hintX + 10, hintY + 18);
    }
    ctx.restore();

    // Level indicator and progress
    ctx.save();
    ctx.fillStyle = COLORS.text;
    ctx.font = "16px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`Level ${level} / ${MAX_LEVEL}`, WIDTH - 20, 30);
    ctx.restore();

    // Draw confetti
    if (confetti.length > 0) {
      ctx.save();
      for (const p of confetti) {
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.rotate(-p.rot);
        ctx.translate(-p.x, -p.y);
      }
      ctx.restore();
    }

    // If game fully won show celebration overlay
    if (level > MAX_LEVEL) {
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.fillStyle = COLORS.correct;
      for (let i = 0; i < 40; i++) {
        const rx = (Math.sin(i * 12.3 + now / 500) + 1) * WIDTH * Math.random() * 0.5 + WIDTH * 0.25;
        const ry = Math.random() * HEIGHT;
        ctx.fillRect(rx % WIDTH, ry, 4, 8);
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "28px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Great job! The Great Machine is fixed!", WIDTH / 2, HEIGHT / 2);
      ctx.font = "16px Arial";
      ctx.fillText("Press R to play again.", WIDTH / 2, HEIGHT / 2 + 32);
      ctx.restore();
    }

    ctx.restore(); // restore after global shake transform

    requestAnimationFrame(render);
  }

  // Helper: draw soft cloud with ellipses
  function drawCloud(cx, cy, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.2, cy, w * 0.34, h * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.12, cy - h * 0.12, w * 0.46, h * 0.86, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.45, cy + h * 0.06, w * 0.28, h * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.cloud;
    ctx.fill();
    ctx.restore();
  }

  // Helper: draw friendly robot face (eyes follow mouse)
  function drawRobotFace(x, y, mouse) {
    // base face
    ctx.save();
    ctx.fillStyle = "#F6FBFF";
    drawRoundedRect(x - 10, y - 10, 92, 60, 12, true);
    // eyes bases
    const leftEye = { cx: x + 20, cy: y + 20 };
    const rightEye = { cx: x + 52, cy: y + 20 };
    const eyeRadius = 8;
    // pupil offset based on mouse pos
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    for (const e of [leftEye, rightEye]) {
      const dx = mouse.x - (x + 40);
      const dy = mouse.y - (y + 30);
      const ang = Math.atan2(dy, dx);
      const dist = clamp(Math.hypot(dx, dy) / 80, 0, 1);
      const px = e.cx + Math.cos(ang) * dist * 3;
      const py = e.cy + Math.sin(ang) * dist * 3;
      // eye white
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(e.cx, e.cy, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      // pupil
      ctx.fillStyle = "#052727";
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // mouth subtle
    ctx.strokeStyle = "rgba(5,39,39,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 38);
    ctx.quadraticCurveTo(x + 40, y + 44, x + 62, y + 38);
    ctx.stroke();
    ctx.restore();
  }

  requestAnimationFrame(render);

  // ---------- Error Handling Notes and Robustness ----------
  window.addEventListener("unhandledrejection", (e) => {
    console.warn("Unhandled promise rejection in game:", e.reason);
  });

  window.addEventListener("error", (err) => {
    console.warn("Game error:", err.message);
  });

  // ---------- Initial instructions and accessibility ----------
  announce(
    "Machine Math: Use left/right arrows to choose items, up/down to switch between gears and slots, space to place or remove. Press S to start, H for a hint, M to mute."
  );

  // Expose minimal debug controls on the stage element for screen readers (visually hidden)
  const srControls = document.createElement("div");
  srControls.style.position = "absolute";
  srControls.style.left = "-9999px";
  srControls.innerHTML =
    "Controls: Arrow keys to navigate. Space or Enter to place. S to start. H for hint. R to reset. M to toggle sound.";
  stage.appendChild(srControls);

  // For usability, ensure initial audio context user gesture requirement handled on first pointerdown
  function ensureAudioOnGesture() {
    if (!audioCtx) safeCreateAudioContext();
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    window.removeEventListener("pointerdown", ensureAudioOnGesture);
  }
  window.addEventListener("pointerdown", ensureAudioOnGesture);

  // Utility small API
  window._machineMath = {
    resetGame,
    resetLevel,
    generateLevel,
    toggleAudio,
    getState: () => ({ level, target, slots, availableGears })
  };
})();