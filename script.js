// Prevent browser scrolling when using arrow keys in games
document.addEventListener('keydown', function (e) {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
    }
});

// Global audio management: ensure previous games' audio never continues after switching
(() => {
  try {
    // Create a registry to track and disable AudioContexts created by games
    const originalAudioContext = window.AudioContext || window.webkitAudioContext;
    if (!originalAudioContext) return; // Nothing to patch on very old browsers

    const disabledContexts = new WeakSet();
    const activeContexts = new Set();
    const activeMediaEls = new Set();

    // Expose cleanup so loader can silence all previous game audio
    window.__cleanupAllGameAudio = async function cleanupAllGameAudio() {
      try {
        const ops = [];
        activeContexts.forEach((ctx) => {
          try {
            // Mark as disabled first so any future resume() calls no-op
            disabledContexts.add(ctx);
            // Suspend to silence immediately without tearing down graphs
            ops.push(Promise.resolve().then(() => ctx.suspend()).catch(() => {}));
          } catch (_) {}
        });
        await Promise.allSettled(ops);
        // Also pause/rewind any HTML media elements that were played
        activeMediaEls.forEach((el) => {
          try {
            el.pause();
            el.currentTime = 0;
          } catch (_) {}
        });
      } catch (_) {}
    };

    // Wrapper constructor that registers each created context
    function PatchedAudioContext(...args) {
      const Ctor = originalAudioContext; // AudioContext
      const ctx = new Ctor(...args);
      activeContexts.add(ctx);
      // Harden resume/close per instance
      try {
        const originalResume = ctx.resume && ctx.resume.bind(ctx);
        if (originalResume) {
          ctx.resume = function() {
            if (disabledContexts.has(ctx)) return Promise.resolve();
            return originalResume();
          };
        }
      } catch (_) {}
      try {
        const originalClose = ctx.close && ctx.close.bind(ctx);
        if (originalClose) {
          ctx.close = function() {
            disabledContexts.add(ctx);
            activeContexts.delete(ctx);
            return originalClose();
          };
        }
      } catch (_) {}
      return ctx;
    }

    // Patch global constructors
    if (window.AudioContext) {
      window.AudioContext = PatchedAudioContext;
    }
    if (window.webkitAudioContext) {
      window.webkitAudioContext = PatchedAudioContext;
    }

    // Patch HTMLMediaElement play/pause to track any media used by games (defensive)
    try {
      const HME = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
      if (HME) {
        const originalPlay = HME.play;
        const originalPause = HME.pause;
        if (originalPlay) {
          HME.play = function() {
            try { activeMediaEls.add(this); } catch (_) {}
            return originalPlay.apply(this, arguments);
          };
        }
        if (originalPause) {
          HME.pause = function() {
            try { activeMediaEls.delete(this); } catch (_) {}
            return originalPause.apply(this, arguments);
          };
        }
      }
    } catch (_) {}

    // Patch resume so disabled contexts cannot be resumed by old game listeners
    const resumeProto = originalAudioContext && originalAudioContext.prototype && originalAudioContext.prototype.resume;
    if (resumeProto) {
      const patchedResume = function () {
        if (disabledContexts.has(this)) {
          // Pretend resume succeeded, but keep it silent
          return Promise.resolve();
        }
        return resumeProto.apply(this, arguments);
      };
      // Assign on the real prototype so existing contexts are covered
      try { originalAudioContext.prototype.resume = patchedResume; } catch (_) {}
    }

    // Optional: when page unloads, silence everything
    window.addEventListener('beforeunload', () => {
      try { window.__cleanupAllGameAudio && window.__cleanupAllGameAudio(); } catch (_) {}
    });

    // Provide a general game cleanup hook caller
    window.__cleanupCurrentGame = async function cleanupCurrentGame() {
      try {
        // Invalidate any previously scheduled RAF/timeouts tied to old game
        try { window.__advanceRafGeneration && window.__advanceRafGeneration(); } catch (_) {}
        // Call per-game cleanup if provided
        if (typeof window.__currentGameCleanup === 'function') {
          try { await window.__currentGameCleanup(); } catch (_) {}
        }
      } catch (_) {}
      // Always silence audio contexts from any prior games
      try { await window.__cleanupAllGameAudio(); } catch (_) {}
      // Clear the stage to remove any lingering canvases/elements
      try {
        const stage = document.getElementById('game-of-the-day-stage');
        if (stage) stage.innerHTML = '';
      } catch (_) {}
      // Reset hook
      window.__currentGameCleanup = null;
    };
  } catch (_) {
    // Best-effort only
  }
})();

// Defensive canvas patch: clamp gradient color stops to [0,1] to avoid IndexSizeError
(() => {
  try {
    const CG = window.CanvasGradient && window.CanvasGradient.prototype;
    if (CG && typeof CG.addColorStop === 'function') {
      const originalAddColorStop = CG.addColorStop;
      CG.addColorStop = function(offset, color) {
        let o = Number(offset);
        if (!Number.isFinite(o)) o = 0;
        if (o < 0) o = 0;
        if (o > 1) o = 1;
        return originalAddColorStop.call(this, o, color);
      };
    }
  } catch (_) { /* noop */ }
})();

// Global resource capture to auto-clean event listeners, timers, rafs installed by games
(() => {
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;
  const originalRAF = window.requestAnimationFrame;
  const originalCancelRAF = window.cancelAnimationFrame;

  let captureMode = false;
  let capturedListeners = [];
  let capturedTimeouts = [];
  let capturedIntervals = [];
  let capturedRAFs = [];

  // Generation guard: invalidate ongoing animation/interval loops when switching games
  window.__rafGeneration = 0;
  window.__advanceRafGeneration = function() {
    window.__rafGeneration = (window.__rafGeneration || 0) + 1;
  };

  // Monkey-patch to record only during capture
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (captureMode && listener) {
      capturedListeners.push({ target: this, type, listener, options });
    }
    return originalAdd.call(this, type, listener, options);
  };

  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    // Best-effort: also remove from captured list if present
    if (listener) {
      capturedListeners = capturedListeners.filter(
        (rec) => !(rec.target === this && rec.type === type && rec.listener === listener)
      );
    }
    return originalRemove.call(this, type, listener, options);
  };

  window.setTimeout = function(handler, timeout, ...args) {
    const genAtSchedule = window.__rafGeneration || 0;
    const wrapped = function() {
      if ((window.__rafGeneration || 0) !== genAtSchedule) return;
      if (typeof handler === 'function') return handler.apply(this, arguments);
      try { return eval(handler); } catch (_) { return undefined; }
    };
    const id = originalSetTimeout(wrapped, timeout, ...args);
    if (captureMode) capturedTimeouts.push(id);
    return id;
  };

  window.clearTimeout = function(id) {
    capturedTimeouts = capturedTimeouts.filter((x) => x !== id);
    return originalClearTimeout(id);
  };

  window.setInterval = function(handler, timeout, ...args) {
    const genAtSchedule = window.__rafGeneration || 0;
    const wrapped = function() {
      if ((window.__rafGeneration || 0) !== genAtSchedule) return;
      if (typeof handler === 'function') return handler.apply(this, arguments);
      try { return eval(handler); } catch (_) { return undefined; }
    };
    const id = originalSetInterval(wrapped, timeout, ...args);
    if (captureMode) capturedIntervals.push(id);
    return id;
  };

  window.clearInterval = function(id) {
    capturedIntervals = capturedIntervals.filter((x) => x !== id);
    return originalClearInterval(id);
  };

  window.requestAnimationFrame = function(callback) {
    const genAtSchedule = window.__rafGeneration || 0;
    const wrapped = function(ts) {
      if ((window.__rafGeneration || 0) !== genAtSchedule) return; // do not invoke old-game frame
      return callback(ts);
    };
    const id = originalRAF(wrapped);
    if (captureMode) capturedRAFs.push(id);
    return id;
  };

  window.cancelAnimationFrame = function(id) {
    capturedRAFs = capturedRAFs.filter((x) => x !== id);
    return originalCancelRAF(id);
  };

  window.__beginCaptureGameResources = function() {
    capturedListeners = [];
    capturedTimeouts = [];
    capturedIntervals = [];
    capturedRAFs = [];
    captureMode = true;
  };

  window.__endCaptureGameResources = function() {
    captureMode = false;
    // Snapshot arrays for this game instance
    return {
      listeners: capturedListeners.slice(),
      timeouts: capturedTimeouts.slice(),
      intervals: capturedIntervals.slice(),
      rafs: capturedRAFs.slice(),
    };
  };

  window.__registerCleanupForSnapshot = function(snapshot) {
    window.__currentGameCleanup = async function() {
      try {
        // Remove event listeners
        if (snapshot && snapshot.listeners) {
          snapshot.listeners.forEach(({ target, type, listener, options }) => {
            try { originalRemove.call(target, type, listener, options); } catch (_) {}
          });
        }
        // Clear timers
        if (snapshot && snapshot.timeouts) snapshot.timeouts.forEach((id) => { try { originalClearTimeout(id); } catch (_) {} });
        if (snapshot && snapshot.intervals) snapshot.intervals.forEach((id) => { try { originalClearInterval(id); } catch (_) {} });
        // Cancel RAFs
        if (snapshot && snapshot.rafs) snapshot.rafs.forEach((id) => { try { originalCancelRAF(id); } catch (_) {} });
      } catch (_) {}
      // Silence any audio contexts lingering
      try { await window.__cleanupAllGameAudio(); } catch (_) {}
    };
  };
})();

// Move the game canvas into the stage area if it is created by the JS
window.addEventListener('DOMContentLoaded', function () {
    const stage = document.getElementById('game-of-the-day-stage');
    stage.tabIndex = 0;

    // Animate the stage on initial load
    stage.classList.add('game-loading-animation');
    setTimeout(() => {
        stage.classList.remove('game-loading-animation');
    }, 800);
    // Wait a tick for the game script to run
    setTimeout(() => {
        const gameCanvas = document.getElementById('game');
        if (gameCanvas && stage) {
            stage.appendChild(gameCanvas);
        }
    }, 100);

    // Initialize daily games section
    initializeDailyGames();
    // Add the date message for today
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    setDateMessage(todayString);
    // Auto-load today's game
    try { loadTodaysGame(); } catch (e) { console.error('Failed to auto-load today\'s game:', e); }
});

// Daily Games functionality
function initializeDailyGames() {
    const container = document.getElementById('daily-games-container');
    if (!container) return;

    // Get today's date in local timezone
    const today = new Date();
    const todayString = formatDateString(today); // YYYY-MM-DD format in local timezone

    // Fetch all available game dates from the index.json file
    fetch('games/index.json')
        .then(res => res.json())
        .then(dates => {
            // Sort dates chronologically (newest first)
            dates.sort().reverse();
            
            // Create cards for all available games
            const cards = dates.map(dateString => {
                const isToday = dateString === todayString;
                return {
                    date: dateString,
                    status: isToday ? 'today' : 'available',
                    isToday: isToday
                };
            });

            // Render the cards with spacers at the start and end
            container.innerHTML =
                cards.map(card => {
                    // Format date as MM/DD/YYYY for simple display
                    const [year, month, day] = card.date.split('-').map(Number);
                    const mm = String(month).padStart(2, '0');
                    const dd = String(day).padStart(2, '0');
                    const dateLabel = `${mm}/${dd}/${year}`;
                    return `
                        <div class="daily-game-card ${card.isToday ? 'today active' : ''}" 
                             onclick="loadDailyGame('${card.date}'); console.log('Clicked daily game: ${card.date}');">
                            <h4>${dateLabel}</h4>
                        </div>
                    `;
                }).join('') +
                '<div class="daily-game-spacer"></div>';

            // Activate and center today's card on page load
            updateActiveCard(todayString);
        })
        .catch(error => {
            console.error('Failed to load game dates:', error);
            container.innerHTML = '<div class="error-message">Failed to load available games</div>';
        });
}

function formatDateString(date) {
    // Format date as YYYY-MM-DD in local timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDate(date) {
    const options = { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
}

function setDateMessage(dateString) {
    const gameSubtitle = document.querySelector('.game-of-the-day-stage p');
    // Remove any existing date message
    const existingDateMsg = document.querySelector('.date-message');
    if (existingDateMsg) existingDateMsg.remove();
    // Determine if dateString is today
    const today = new Date();
    const todayString = formatDateString(today);
    const dateMsg = document.createElement('div');
    dateMsg.className = 'date-message';
    dateMsg.style.cssText = 'color: var(--text-secondary); font-size: 0.7rem; font-weight: 300; opacity: 0.6; font-style: italic; text-align: center;';
    // if (dateString === todayString) {
    //     dateMsg.textContent = `Playing today's challenge`;
    // } else {
    //     dateMsg.textContent = `Playing the challenge for ${dateString}`;
    // }
    gameSubtitle.insertAdjacentElement('afterend', dateMsg);
}

function loadDailyGame(dateString) {
    console.log('loadDailyGame called with:', dateString);
    
    // Replace the game of the day with the selected daily game
    const gameStage = document.getElementById('game-of-the-day-stage');
    const gameTitle = document.querySelector('.game-of-the-day-stage h2');
    const gameSubtitle = document.querySelector('.game-of-the-day-stage p');
    
    // Animate the stage
    gameStage.classList.add('game-loading-animation');
    setTimeout(() => {
        gameStage.classList.remove('game-loading-animation');
    }, 800);

    // Always keep the header and preserve any existing link in the subtitle
    gameTitle.textContent = 'AI Game of the Day';
    if (gameSubtitle && !gameSubtitle.querySelector('a')) {
        gameSubtitle.textContent = '';
    }

    // Remove any existing date message
    const existingDateMsg = document.querySelector('.date-message');
    if (existingDateMsg) existingDateMsg.remove();

    // Add a date message below the subtitle
    setDateMessage(dateString);

    // Clean up any currently running game (audio, etc.)
    if (window.__cleanupCurrentGame) {
        window.__cleanupCurrentGame();
    }
    // Show loading
    gameStage.innerHTML = '<div class="loading">Loading game...</div>';
    
    // Remove any existing game scripts
    const existingScripts = document.querySelectorAll('script[src^="games/"]');
    existingScripts.forEach(script => script.remove());
    
    // Update the active card in the timeline
    updateActiveCard(dateString);
    
    // Delay game loading by 500ms to allow card animation to complete
    setTimeout(() => {
        // Add purple class to active card after 500ms
        const activeCard = document.querySelector('.daily-game-card.active');
        if (activeCard) {
            activeCard.classList.add('purple');
        }

        // Load the selected daily game using fetch and wrap in function scope
        fetch(`games/${dateString}.js`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(scriptContent => {
                console.log(`Successfully loaded daily game: ${dateString}`);
                
                // Check if the script content is valid (not too short or corrupted)
                if (scriptContent.length < 1000) {
                    throw new Error('Game file appears to be corrupted or incomplete');
                }
                
                // Wrap the script content in a function to isolate variables
                const wrappedScript = `
                    (function() {
                        try {
                            ${scriptContent}
                        } catch (error) {
                            console.error('Game execution error:', error);
                            const stage = document.getElementById('game-of-the-day-stage');
                            if (stage) {
                                stage.innerHTML = \`
                                    <div class="error-message">
                                        <p>This game encountered an error while loading.</p>
                                        <p>Error: \${error.message}</p>
                                    </div>
                                \`;
                            }
                        }
                    })();
                `;
                
                // Begin resource capture so we can clean this game later
                if (window.__advanceRafGeneration) window.__advanceRafGeneration();
                if (window.__beginCaptureGameResources) window.__beginCaptureGameResources();

                // Create a new script element with the wrapped content
                const script = document.createElement('script');
                script.textContent = wrappedScript;
                
                // Execute the script
                document.head.appendChild(script);

                // Finalize capture and register cleanup
                if (window.__endCaptureGameResources && window.__registerCleanupForSnapshot) {
                    const snapshot = window.__endCaptureGameResources();
                    window.__registerCleanupForSnapshot(snapshot);
                }
            })
            .catch(error => {
                console.error(`Failed to load daily game: ${dateString}`, error);
                let errorMessage = '';
                if (error.message.includes('corrupted')) {
                    errorMessage = `
                        <p>This game file appears to be corrupted or incomplete.</p>
                        <p>Please try a different date or contact support.</p>
                    `;
                } else if (error.message.includes('404')) {
                    errorMessage = `
                        <p>This daily challenge is not available yet.</p>
                        <p>Check back later or try a different date!</p>
                    `;
                } else {
                    errorMessage = `
                        <p>Failed to load this game: ${error.message}</p>
                        <p>Please try a different date.</p>
                    `;
                }
                gameStage.innerHTML = `
                    <div class="error-message">
                        ${errorMessage}
                    </div>
                `;
            });
    }, 500);
}

function loadTodaysGame() {
    // Reset to today's game
    const gameStage = document.getElementById('game-of-the-day-stage');
    const gameTitle = document.querySelector('.game-of-the-day-stage h2');
    const gameSubtitle = document.querySelector('.game-of-the-day-stage p');
    
    // Animate the stage
    gameStage.classList.add('game-loading-animation');
    setTimeout(() => {
        gameStage.classList.remove('game-loading-animation');
    }, 800);

    // Always keep the header and preserve any existing link in the subtitle
    gameTitle.textContent = 'AI Game of the Day';
    if (gameSubtitle && !gameSubtitle.querySelector('a')) {
        gameSubtitle.textContent = '';
    }

    // Remove any existing date message
    const existingDateMsg = document.querySelector('.date-message');
    if (existingDateMsg) existingDateMsg.remove();

    // Clean up any currently running game (audio, etc.)
    if (window.__cleanupCurrentGame) {
        window.__cleanupCurrentGame();
    }
    // Clear the current game stage
    gameStage.innerHTML = '';
    
    // Remove any existing game scripts
    const existingScripts = document.querySelectorAll('script[src^="games/"]');
    existingScripts.forEach(script => script.remove());
    
    // Update the active card to today's card
    const today = new Date();
    const todayString = formatDateString(today);
    updateActiveCard(todayString);
    
    // Load the latest game (today's game) using fetch and wrap in function scope
    fetch('games/latest.js')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(scriptContent => {
            console.log('Successfully loaded today\'s game');
            
            // Wrap the script content in a function to isolate variables
            const wrappedScript = `
                (function() {
                    ${scriptContent}
                })();
            `;
            
            // Begin resource capture so we can clean this game later
            if (window.__advanceRafGeneration) window.__advanceRafGeneration();
            if (window.__beginCaptureGameResources) window.__beginCaptureGameResources();

            // Create a new script element with the wrapped content
            const script = document.createElement('script');
            script.textContent = wrappedScript;
            
            // Execute the script
            document.head.appendChild(script);

            // Finalize capture and register cleanup
            if (window.__endCaptureGameResources && window.__registerCleanupForSnapshot) {
                const snapshot = window.__endCaptureGameResources();
                window.__registerCleanupForSnapshot(snapshot);
            }
        })
        .catch(error => {
            console.error('Failed to load today\'s game', error);
            gameStage.innerHTML = `
                <div class="error-message">
                    <p>Failed to load today's game.</p>
                </div>
            `;
        });
}

function updateActiveCard(dateString) {
    // Remove active and plugged-in classes from all cards
    const allCards = document.querySelectorAll('.daily-game-card');
    allCards.forEach(card => {
        card.classList.remove('active', 'plugged-in');
    });

    // Find the card that matches the current game
    const targetCard = document.querySelector(`[onclick*="${dateString}"]`);
    if (targetCard) {
        targetCard.classList.add('active');
        // No more button text or color change

        // Center the card under the plug (center of game area)
        const container = document.getElementById('daily-games-container');
        const gameStage = document.querySelector('.game-of-the-day-stage');
        if (container && gameStage) {
            const containerRect = container.getBoundingClientRect();
            const cardRect = targetCard.getBoundingClientRect();
            const gameRect = gameStage.getBoundingClientRect();

            // Center of the game area relative to the container
            const gameCenter = gameRect.left + gameRect.width / 2;
            const cardOffset = targetCard.offsetLeft + targetCard.offsetWidth / 2;
            const containerLeft = containerRect.left;

            // The scroll position needed to center the card under the plug
            const scrollTo = cardOffset - (gameCenter - containerLeft);

            container.scrollTo({
                left: scrollTo,
                behavior: 'smooth'
            });
        }

        // Animate: after a brief pause, add the plugged-in class
        setTimeout(() => {
            allCards.forEach(card => card.classList.remove('plugged-in'));
            targetCard.classList.add('plugged-in');
        }, 180);
    }
}

// Remove connector position JS and window resize handler, as the connector is now always fixed at center.

// Metadata modal functions
function showMetadata() {
    const modal = document.getElementById('metadata-modal');
    const content = document.getElementById('metadata-content');
    
    // Get the current game date
    const activeCard = document.querySelector('.daily-game-card.active');
    let gameDate = '';
    
    if (activeCard) {
        // Extract date from onclick attribute
        const onclickAttr = activeCard.getAttribute('onclick');
        console.log('Active card onclick:', onclickAttr);
        const match = onclickAttr.match(/loadDailyGame\('([^']+)'\)/);
        if (match) {
            gameDate = match[1];
            console.log('Extracted date from active card:', gameDate);
        }
    }
    
    // If no active card, use today's date
    if (!gameDate) {
        const today = new Date();
        gameDate = formatDateString(today);
        console.log('Using today\'s date:', gameDate);
    }
    
    console.log('Final game date for metadata:', gameDate);
    
    // Try to load metadata
    loadMetadata(gameDate);
    
    modal.style.display = 'flex';
}

function hideMetadata() {
    const modal = document.getElementById('metadata-modal');
    modal.style.display = 'none';
}

function loadMetadata(dateString) {
    const content = document.getElementById('metadata-content');
    
    console.log('Loading metadata for:', dateString);
    
    // Try to load the markdown metadata first
    fetch(`games/${dateString}.meta.md`)
        .then(response => {
            if (response.ok) {
                return response.text();
            }
            throw new Error('Markdown metadata not found');
        })
        .then(markdownContent => {
            console.log('Markdown metadata loaded successfully');
            // Simple markdown to HTML conversion for basic formatting
            let htmlContent = markdownContent
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`(.*?)`/g, '<code>$1</code>')
                .replace(/\n/g, '<br>');
            
            content.innerHTML = htmlContent;
        })
        .catch(error => {
            console.log('Markdown not found, trying JSON metadata');
            // If markdown not found, try JSON metadata
            return fetch(`games/${dateString}.meta.json`)
                .then(response => {
                    if (response.ok) {
                        return response.json();
                    }
                    throw new Error('JSON metadata not found');
                })
                .then(jsonData => {
                    console.log('JSON metadata loaded successfully');
                    // Format JSON data nicely
                    let htmlContent = '<h2>Game Metadata</h2>';
                    htmlContent += '<div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin: 1rem 0;">';
                    htmlContent += '<pre><code>' + JSON.stringify(jsonData, null, 2) + '</code></pre>';
                    htmlContent += '</div>';
                    content.innerHTML = htmlContent;
                });
        })
        .catch(error => {
            console.log('No metadata found:', error);
            content.innerHTML = `
                <h2>No Metadata Available</h2>
                <p>Metadata for ${dateString} is not available.</p>
                <p>This game may not have associated metadata files.</p>
                <p><strong>Debug info:</strong> Tried to load:</p>
                <ul>
                    <li><code>games/${dateString}.meta.md</code></li>
                    <li><code>games/${dateString}.meta.json</code></li>
                </ul>
            `;
        });
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('metadata-modal');
    if (event.target === modal) {
        hideMetadata();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        hideMetadata();
    }
});