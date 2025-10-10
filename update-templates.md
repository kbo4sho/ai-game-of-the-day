# Game Files Update Templates

This document contains comprehensive update templates for all file types in the AI Game of the Day repository.

## 1. JavaScript Game Files Template (~110 files)

### Current Issues Identified:
- Inconsistent code style (some use ES5, others ES6+)
- Varying audio implementation patterns
- Different accessibility implementations
- Inconsistent error handling
- Mixed canvas drawing patterns
- Variable performance optimization levels

### Update Template for .js Files:

#### A. Code Modernization
```javascript
// BEFORE: Old-style variable declarations
var stage = document.getElementById('game-of-the-day-stage');
var canvas = document.createElement('canvas');
var ctx = canvas.getContext('2d');

// AFTER: Modern const/let declarations
const STAGE_ID = 'game-of-the-day-stage';
const WIDTH = 720;
const HEIGHT = 480;

const container = document.getElementById(STAGE_ID);
if (!container) {
  throw new Error(`Container element with ID "${STAGE_ID}" not found.`);
}

const canvas = document.createElement('canvas');
canvas.width = WIDTH;
canvas.height = HEIGHT;
const ctx = canvas.getContext('2d');
```

#### B. Enhanced Audio Implementation
```javascript
// BEFORE: Basic audio setup
var audioCtx = new AudioContext();

// AFTER: Robust audio with error handling
let audioCtx = null;
let audioEnabled = true;
let audioInitError = false;

function initAudio() {
  if (audioCtx || audioInitError) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      throw new Error('Web Audio API not supported');
    }
    audioCtx = new AudioContext();
    
    // Resume on user interaction
    document.addEventListener('click', () => {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    }, { once: true });
    
  } catch (e) {
    console.warn('Audio initialization failed:', e);
    audioInitError = true;
    audioEnabled = false;
  }
}

function playTone({ freq = 440, type = 'sine', duration = 0.15, volume = 0.12 } = {}) {
  if (!audioEnabled || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    osc.type = type;
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(600, freq * 2);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration - 0.02);
    
    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}
```

#### C. Improved Accessibility
```javascript
// BEFORE: Basic canvas setup
canvas.width = 720;
canvas.height = 480;

// AFTER: Enhanced accessibility
canvas.width = WIDTH;
canvas.height = HEIGHT;
canvas.tabIndex = 0; // Make focusable
canvas.setAttribute('role', 'application');
canvas.setAttribute('aria-label', 'Educational math game. Use arrow keys to move, space to interact, M to toggle audio, Escape to restart.');

// Add keyboard navigation
const keys = {};
canvas.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  
  // Handle common accessibility keys
  if (e.key === 'Escape') {
    restartGame();
    e.preventDefault();
  }
  if (e.key === 'm' || e.key === 'M') {
    toggleAudio();
    e.preventDefault();
  }
});

canvas.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// Ensure canvas stays focused
canvas.addEventListener('click', () => canvas.focus());
```

#### D. Performance Optimizations
```javascript
// BEFORE: Basic game loop
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// AFTER: Optimized game loop with delta time
let lastTime = performance.now();

function gameLoop(currentTime) {
  const deltaTime = Math.min(0.05, (currentTime - lastTime) / 1000);
  lastTime = currentTime;
  
  try {
    update(deltaTime);
    render();
  } catch (error) {
    console.error('Game loop error:', error);
  }
  
  requestAnimationFrame(gameLoop);
}

// Object pooling for particles/effects
class ObjectPool {
  constructor(createFn, resetFn, initialSize = 10) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.pool = [];
    this.active = [];
    
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }
  
  get() {
    const obj = this.pool.pop() || this.createFn();
    this.active.push(obj);
    return obj;
  }
  
  release(obj) {
    const index = this.active.indexOf(obj);
    if (index > -1) {
      this.active.splice(index, 1);
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }
}
```

#### E. Enhanced Visual Effects
```javascript
// BEFORE: Basic drawing
ctx.fillStyle = '#ff0000';
ctx.fillRect(x, y, width, height);

// AFTER: Enhanced visuals with gradients and effects
function drawEnhancedRect(x, y, width, height, color1, color2) {
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  
  roundRect(ctx, x, y, width, height, 8);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
```

#### F. Error Handling and Cleanup
```javascript
// BEFORE: No cleanup
// (games just run indefinitely)

// AFTER: Proper cleanup and error handling
class Game {
  constructor() {
    this.running = false;
    this.animationId = null;
    this.audioNodes = [];
    
    // Bind cleanup on page unload
    window.addEventListener('beforeunload', () => this.cleanup());
  }
  
  start() {
    this.running = true;
    this.gameLoop();
  }
  
  stop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.cleanup();
  }
  
  cleanup() {
    // Clean up audio nodes
    this.audioNodes.forEach(node => {
      try {
        node.disconnect();
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    
    // Clean up event listeners
    canvas.removeEventListener('keydown', this.handleKeyDown);
    canvas.removeEventListener('keyup', this.handleKeyUp);
  }
  
  gameLoop() {
    if (!this.running) return;
    
    try {
      this.update();
      this.render();
    } catch (error) {
      console.error('Game error:', error);
      this.stop();
      return;
    }
    
    this.animationId = requestAnimationFrame(() => this.gameLoop());
  }
}
```

## 2. JSON Metadata Files Template (~88 files)

### Current Structure Analysis:
- Inconsistent field names and formats
- Missing accessibility and performance data
- Varying levels of detail

### Standardized JSON Template:
```json
{
  "generated_date": "2025-10-10",
  "generated_timestamp": "2025-10-10T00:26:48.223367Z",
  "model": "gpt-5-mini",
  "theme": "machines",
  "prompt": "Original generation prompt...",
  "response_tokens": 9547,
  "game_filename": "2025-10-10.js",
  "game_size_bytes": 29965,
  "last_updated": "2025-10-10T12:00:00Z",
  "version": "2.0",
  
  "game_info": {
    "title": "Machine Merge Math",
    "description": "Educational math game teaching addition and subtraction through machine repair",
    "age_group": "7-9 years",
    "learning_objectives": ["addition", "subtraction", "problem_solving", "pattern_recognition"],
    "difficulty_level": "beginner",
    "estimated_play_time_minutes": 5,
    "max_levels": 5
  },
  
  "functionality": {
    "score": 8,
    "max_score": 8,
    "percentage": 100.0,
    "passing": true,
    "issues": [],
    "warnings": []
  },
  
  "accessibility": {
    "keyboard_controls": true,
    "screen_reader_support": true,
    "audio_visual_cues": true,
    "focus_management": true,
    "color_contrast_compliant": true,
    "aria_labels": true,
    "score": 95
  },
  
  "performance": {
    "load_time_ms": 150,
    "memory_usage_mb": 8.5,
    "fps_target": 60,
    "canvas_optimized": true,
    "object_pooling": true,
    "score": 90
  },
  
  "dependencies": {
    "has_external_deps": false,
    "canvas_methods_used": 12,
    "web_audio_features": ["oscillators", "filters", "gain_nodes"],
    "issues": [],
    "warnings": []
  },
  
  "visual_audio": {
    "improved_visuals_audio": true,
    "visual_effects": ["gradients", "shadows", "animations", "particles"],
    "audio_effects": ["background_music", "sfx", "feedback_sounds"],
    "improve_prompt": "Enhanced visual and audio improvement prompt...",
    "improve_response_tokens": 20227
  },
  
  "code_quality": {
    "formatted_code": true,
    "modern_js_features": true,
    "error_handling": true,
    "code_comments": true,
    "consistent_style": true,
    "formatting_response_tokens": 21957
  },
  
  "educational_value": {
    "curriculum_alignment": "Common Core Math K-2",
    "skill_progression": true,
    "immediate_feedback": true,
    "adaptive_difficulty": false,
    "engagement_score": 85
  }
}
```

## 3. Markdown Documentation Template (~87 files)

### Current Issues:
- Inconsistent formatting
- Missing gameplay instructions
- Limited accessibility information
- No learning objectives

### Enhanced Markdown Template:
```markdown
# 🎮 Game of the Day - 2025-10-10

## 📊 Quick Stats
| Attribute | Value |
|-----------|-------|
| **Theme** | Machines |
| **Learning Focus** | Addition & Subtraction |
| **Age Group** | 7-9 years |
| **Play Time** | 5-10 minutes |
| **Difficulty** | Beginner |
| **Accessibility Score** | 95/100 |

## 🎯 Learning Objectives
- ✅ Practice addition and subtraction within 20
- ✅ Develop problem-solving strategies
- ✅ Improve number sense and mental math
- ✅ Build confidence with math concepts
- ✅ Enhance hand-eye coordination

## 🎮 How to Play

### Getting Started
1. **Goal**: Collect machine parts with numbers that add up to the target sum
2. **Movement**: Use arrow keys or WASD to move your character
3. **Interaction**: Press Space or click to pick up/drop parts
4. **Submit**: Press Enter to test your combination in the machine

### Game Mechanics
- **Conveyor Belts**: Parts move automatically on belts
- **Robot Arm**: Use it to grab and position parts
- **Target Display**: Shows the number you need to reach
- **Attempts**: You have 3 tries per level before restarting

### Winning Strategy
- Look for pairs of numbers that add to your target
- Don't rush - observe the moving parts first
- Remember: exact matches light the bulb, too much breaks it!

## 🎨 Visual & Audio Features

### Visual Elements
- 🌈 Calming gradient backgrounds
- ⚙️ Animated gears and machinery
- ✨ Particle effects for correct answers
- 🎯 Clear visual feedback for all actions
- 🔍 High contrast for better visibility

### Audio Features
- 🎵 Gentle background ambient sounds
- 🔊 Success/error audio feedback
- 🎶 Pleasant sound effects for interactions
- 🔇 Toggle sound on/off with 'M' key
- 🎧 Screen reader compatible

## ♿ Accessibility Features

### Keyboard Navigation
- **Arrow Keys**: Move character/cursor
- **Space**: Primary interaction (pick/drop)
- **Enter**: Submit/confirm actions
- **M**: Toggle audio on/off
- **Escape**: Restart game
- **H**: Show/hide help

### Screen Reader Support
- Comprehensive ARIA labels
- Live region updates for game state
- Descriptive alt text for all visual elements
- Keyboard-only gameplay possible

### Visual Accessibility
- High contrast color scheme
- Clear, readable fonts (minimum 14px)
- Visual indicators for audio cues
- No flashing or seizure-inducing effects

## 🔧 Technical Details

### Performance
- **Canvas Size**: 720×480 pixels
- **Target FPS**: 60 FPS
- **Memory Usage**: < 10MB
- **Load Time**: < 2 seconds
- **Mobile Friendly**: Responsive design

### Browser Compatibility
- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+
- ⚠️ IE not supported

### Technologies Used
- **Graphics**: HTML5 Canvas API
- **Audio**: Web Audio API (no external files)
- **Input**: Keyboard & Mouse events
- **Styling**: Vanilla CSS
- **Language**: Modern JavaScript (ES6+)

## 📈 Educational Alignment

### Curriculum Standards
- **Common Core**: K.OA.1, K.OA.2, 1.OA.1, 1.OA.6
- **NCTM**: Number & Operations, Problem Solving
- **21st Century Skills**: Critical thinking, Digital literacy

### Assessment Opportunities
- Observe problem-solving strategies
- Note speed and accuracy of calculations
- Track progress across difficulty levels
- Identify areas needing reinforcement

## 🐛 Known Issues & Limitations
- None currently identified
- Report issues to: [repository issues page]

## 📝 Generation Metadata

### Creation Details
- **Generated**: 2025-10-10T00:26:48.223367Z
- **Model**: gpt-5-mini
- **Tokens Used**: 9,547 (generation) + 20,227 (improvements)
- **File Size**: 29,965 bytes
- **Version**: 2.0 (Enhanced)

### Quality Scores
- **Functionality**: 8/8 (100%)
- **Accessibility**: 95/100
- **Performance**: 90/100
- **Educational Value**: 85/100
- **Code Quality**: 92/100

## 🔄 Version History
- **v2.0**: Enhanced visuals, audio, and accessibility
- **v1.0**: Initial AI-generated version

---

*This game was automatically generated and enhanced using AI technology as part of the AI Game of the Day project.*
```

## 4. Index.json Update Template

### Enhanced Index Structure:
```json
{
  "metadata": {
    "last_updated": "2025-10-10T12:00:00Z",
    "total_games": 110,
    "version": "2.0",
    "repository": "https://github.com/kbo4sho/ai-game-of-the-day"
  },
  "games": [
    {
      "date": "2025-10-10",
      "filename": "2025-10-10.js",
      "title": "Machine Merge Math",
      "theme": "machines",
      "model": "gpt-5-mini",
      "learning_objectives": ["addition", "subtraction"],
      "age_group": "7-9",
      "difficulty": "beginner",
      "accessibility_score": 95,
      "performance_score": 90,
      "educational_score": 85,
      "file_size_bytes": 29965,
      "featured": false,
      "hall_of_fame": false
    }
  ],
  "statistics": {
    "themes": {
      "machines": 5,
      "space": 8,
      "nature": 12,
      "electricity": 6
    },
    "models_used": {
      "gpt-4.1-mini": 45,
      "gpt-5-mini": 65
    },
    "average_scores": {
      "accessibility": 92.3,
      "performance": 88.7,
      "educational": 86.1
    }
  },
  "featured_games": [
    "2025-10-10",
    "2025-09-15",
    "2025-08-22"
  ],
  "hall_of_fame": [
    "2025-07-14",
    "2025-08-01",
    "2025-09-30"
  ]
}
```

## 5. Application Strategy

### Automated Updates:
1. **Scan all files** in each category
2. **Apply templates** systematically
3. **Preserve unique content** while standardizing structure
4. **Validate results** after each batch
5. **Create backups** before major changes

### Manual Review Points:
- Game-specific content and mechanics
- Unique visual/audio features
- Special accessibility considerations
- Educational content accuracy

### Testing Requirements:
- Functionality testing for all games
- Accessibility testing with screen readers
- Performance benchmarking
- Cross-browser compatibility checks

---

*These templates ensure consistent, high-quality updates across all game files while preserving the unique characteristics of each game.*