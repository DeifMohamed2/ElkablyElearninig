(() => {
  'use strict';

  const STORAGE_KEY = 'elkablyEidSeen_2026';
  const AUDIO_MUTED_KEY = 'elkablyEidAudioMuted_2026';

  const overlay = document.getElementById('eidOverlay');
  if (!overlay) return;

  const startBtn = document.getElementById('eidStartBtn');
  const introState = document.getElementById('eidIntroState');
  const celebrationState = document.getElementById('eidCelebrationState');
  const audioEl = document.getElementById('eidAudio');
  const fallingLayer = document.querySelector('.eid-falling-layer');

  let audioToggleBtn = null;
  let fallingIconsInterval = null;
  let isClosing = false;

  const ICON_PATHS = [
    '/images/EID%20ICONS%20AND%20photos/eid-mubarak.png',
    '/images/EID%20ICONS%20AND%20photos/eid-mubarak%20(1).png',
    '/images/EID%20ICONS%20AND%20photos/eid-al-fitr.png',
    '/images/EID%20ICONS%20AND%20photos/eid-mubarak_4354898.png',
    '/images/EID%20ICONS%20AND%20photos/eid-mubarak_10203127.png',
    '/images/EID%20ICONS%20AND%20photos/money.png',
    '/images/EID%20ICONS%20AND%20photos/mosque.png'
  ];

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // LocalStorage helpers
  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }

  // Scroll lock
  function lockScroll() {
    document.body.style.overflow = 'hidden';
  }

  function unlockScroll() {
    document.body.style.overflow = '';
  }

  // Mark as seen
  function markSeen() {
    safeLocalStorageSet(STORAGE_KEY, 'true');
  }

  // Audio functions - play once, overlay closes when audio ends
  async function playAudioFromGesture() {
    if (!audioEl) return;
    
    const wasMuted = safeLocalStorageGet(AUDIO_MUTED_KEY) === 'true';
    if (wasMuted) {
      audioEl.muted = true;
    } else {
      audioEl.volume = 0.85;
    }
    
    audioEl.loop = false; // Play once - overlay closes when sound ends
    
    try {
      await audioEl.play();
    } catch (err) {
      console.warn('Audio autoplay blocked:', err);
    }
  }

  function stopAudio() {
    if (!audioEl) return;
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {
      // ignore
    }
  }

  // Audio toggle button
  function createAudioToggleButton() {
    if (!audioEl || audioToggleBtn) return;

    audioToggleBtn = document.createElement('button');
    audioToggleBtn.id = 'eidAudioToggle';
    audioToggleBtn.type = 'button';
    audioToggleBtn.className = 'eid-audio-toggle';
    audioToggleBtn.setAttribute('aria-label', 'Toggle Eid audio');

    function updateButtonState() {
      const muted = audioEl.muted || audioEl.paused;
      audioToggleBtn.setAttribute('aria-pressed', muted ? 'false' : 'true');
      audioToggleBtn.setAttribute(
        'aria-label',
        muted ? 'Play Eid celebration audio' : 'Mute Eid celebration audio'
      );
      audioToggleBtn.textContent = muted ? '🔇' : '🔊';
    }

    audioToggleBtn.addEventListener('click', async () => {
      if (!audioEl) return;

      if (audioEl.paused) {
        audioEl.muted = false;
        audioEl.loop = false;
        try {
          await audioEl.play();
          safeLocalStorageSet(AUDIO_MUTED_KEY, 'false');
        } catch {
          audioEl.muted = true;
          safeLocalStorageSet(AUDIO_MUTED_KEY, 'true');
        }
      } else {
        audioEl.muted = !audioEl.muted;
        safeLocalStorageSet(AUDIO_MUTED_KEY, audioEl.muted ? 'true' : 'false');
      }

      updateButtonState();
    });

    updateButtonState();
    document.body.appendChild(audioToggleBtn);
  }

  // Falling icons animation - smooth drop from sky, looping
  function spawnFallingIcon() {
    if (!fallingLayer) return;

    const icon = document.createElement('img');
    icon.src = ICON_PATHS[Math.floor(Math.random() * ICON_PATHS.length)];
    icon.className = 'eid-falling-icon';
    icon.style.left = (Math.random() * 100) + '%';
    icon.style.animationDuration = (5 + Math.random() * 3) + 's';
    icon.style.animationDelay = (Math.random() * 0.3) + 's';
    icon.setAttribute('aria-hidden', 'true');

    fallingLayer.appendChild(icon);

    // Remove after animation completes
    setTimeout(() => {
      if (icon.parentNode === fallingLayer) {
        icon.remove();
      }
    }, 9000);
  }

  function startFallingIcons() {
    if (prefersReducedMotion) return;
    
    // Create initial batch - staggered for smooth flow
    for (let i = 0; i < 15; i++) {
      setTimeout(() => spawnFallingIcon(), i * 150);
    }

    // Continue spawning in loop for continuous falling effect
    fallingIconsInterval = setInterval(() => {
      if (celebrationState && !celebrationState.classList.contains('eid-hidden')) {
        spawnFallingIcon();
      } else {
        clearInterval(fallingIconsInterval);
        fallingIconsInterval = null;
      }
    }, 450);
  }

  function stopFallingIcons() {
    if (fallingIconsInterval) {
      clearInterval(fallingIconsInterval);
      fallingIconsInterval = null;
    }
    
    // Clear all falling icons
    if (fallingLayer) {
      fallingLayer.innerHTML = '';
    }
  }

  // Curtain opening animation
  function openCurtains() {
    overlay.classList.add('eid-opening');
  }

  // Transition from intro to celebration (triggered by button click - user gesture enables audio)
  async function startCelebration() {
    if (startBtn) startBtn.disabled = true;

    // Start audio immediately on user click - works reliably with user gesture
    await playAudioFromGesture();
    createAudioToggleButton();

    // When audio ends (~11s), close overlay with smooth animation
    if (audioEl) {
      audioEl.addEventListener('ended', () => {
        closeOverlay();
      }, { once: true });
    }

    // Fallback: close after 13s if 'ended' doesn't fire (e.g. audio error)
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        closeOverlay();
      }
    }, 13000);

    // Hide intro immediately
    if (introState) {
      introState.style.display = 'none';
      introState.classList.add('eid-hidden');
    }

    // Open curtains
    openCurtains();

    // Show celebration after a short delay
    const celebrationDelay = prefersReducedMotion ? 300 : 600;
    
    setTimeout(() => {
      if (celebrationState) {
        celebrationState.classList.remove('eid-hidden');
        celebrationState.classList.add('eid-visible');
      }
      // Start falling icons from sky (looping)
      startFallingIcons();
    }, celebrationDelay);
  }

  // Close overlay with smooth fade-out animation
  function closeOverlay() {
    if (isClosing) return;
    isClosing = true;

    markSeen();
    document.documentElement.dataset.eidSeen = 'true';
    stopFallingIcons();
    stopAudio();

    overlay.classList.remove('eid-active');
    overlay.classList.add('eid-fade-out');

    // Wait for fade-out transition to complete before removing
    setTimeout(() => {
      overlay.remove();
      unlockScroll();
      
      if (audioToggleBtn && audioToggleBtn.parentNode) {
        audioToggleBtn.remove();
      }
    }, 800);
  }

  // Initialize
  const hasSeen = safeLocalStorageGet(STORAGE_KEY);
  if (hasSeen) {
    overlay.remove();
    return;
  }

  // Show overlay immediately (CSS already makes it visible from first paint)
  lockScroll();
  overlay.classList.add('eid-active');

  // Start celebration on button click (user gesture ensures audio plays reliably)
  if (startBtn) {
    startBtn.addEventListener('click', startCelebration);
  }

  // Keyboard support (optional early exit)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeOverlay();
    }
  });

  // Cleanup on page unload
  window.addEventListener('pagehide', () => {
    stopAudio();
    stopFallingIcons();
  });

  // Announce to screen readers
  setTimeout(() => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = 'Eid Al-Fitr celebration overlay opened. Press Escape to close.';
    document.body.appendChild(announcement);
    
    setTimeout(() => announcement.remove(), 3000);
  }, 1000);

})();
