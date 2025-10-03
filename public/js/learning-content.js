// Learning Content JavaScript

class LearningContent {
  constructor() {
    this.fabOpen = false;
    this.progressChart = null;

    this.init();
  }

  init() {
    console.log('Initializing Learning Content...');
    this.bindElements();
    this.bindEvents();
    this.initializeAnimations();
    this.initializeProgressChart();
    this.startProgressAnimation();
  }

  bindElements() {
    // Floating Action Button
    this.fabMain = document.getElementById('fabMain');
    this.fabOptions = this.fabMain?.parentElement.querySelector('.fab-options');

    // Action buttons
    this.actionButtons = document.querySelectorAll('.card-action-btn');
    this.fabOptionButtons = document.querySelectorAll('.fab-option');

    // Cards
    this.contentCards = document.querySelectorAll('.content-card');
  }

  bindEvents() {
    // Floating Action Button
    if (this.fabMain) {
      this.fabMain.addEventListener('click', () => this.toggleFab());
    }

    // FAB Options
    this.fabOptionButtons.forEach((button) => {
      button.addEventListener('click', (e) => this.handleFabAction(e));
    });

    // Card Action Buttons
    this.actionButtons.forEach((button) => {
      button.addEventListener('click', (e) => this.handleCardAction(e));
    });

    // Card Hover Effects
    this.contentCards.forEach((card) => {
      card.addEventListener('mouseenter', () => this.onCardHover(card));
      card.addEventListener('mouseleave', () => this.onCardLeave(card));
    });

    // Close FAB when clicking outside
    document.addEventListener('click', (e) => {
      if (this.fabOpen && !e.target.closest('.fab-container')) {
        this.closeFab();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
  }

  initializeAnimations() {
    // Add staggered animation to cards
    this.contentCards.forEach((card, index) => {
      card.style.animationDelay = `${index * 0.1}s`;
    });

    // Initialize 3D object rotation
    this.init3DRotation();
  }

  init3DRotation() {
    const mathObject = document.querySelector('.math-object.rotating');
    if (mathObject) {
      // Add interactive rotation on hover
      mathObject.addEventListener('mouseenter', () => {
        mathObject.style.animationPlayState = 'paused';
      });

      mathObject.addEventListener('mouseleave', () => {
        mathObject.style.animationPlayState = 'running';
      });
    }
  }

  initializeProgressChart() {
    const canvas = document.getElementById('progressChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Sample data for the progress chart
    const data = [65, 72, 68, 85, 78, 92, 88];
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    this.drawProgressChart(ctx, width, height, data, labels);
  }

  drawProgressChart(ctx, width, height, data, labels) {
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    const maxValue = Math.max(...data);
    const stepX = chartWidth / (data.length - 1);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
    gradient.addColorStop(1, 'rgba(102, 126, 234, 0.05)');

    // Draw area under curve
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);

    data.forEach((value, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (value / maxValue) * chartHeight;
      if (index === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.lineTo(width - padding, height - padding);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    data.forEach((value, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (value / maxValue) * chartHeight;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw points
    data.forEach((value, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (value / maxValue) * chartHeight;

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#667eea';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'white';
      ctx.fill();
    });
  }

  startProgressAnimation() {
    // Animate progress ring
    const progressRing = document.querySelector('.progress-ring-fill');
    if (progressRing) {
      const circumference = 2 * Math.PI * 50; // radius = 50
      const progress = 40; // 40%
      const offset = circumference - (progress / 100) * circumference;

      progressRing.style.strokeDasharray = circumference;
      progressRing.style.strokeDashoffset = circumference;

      setTimeout(() => {
        progressRing.style.strokeDashoffset = offset;
      }, 500);
    }

    // Animate difficulty progress bars
    const progressBars = document.querySelectorAll(
      '.difficulty-item .progress-fill'
    );
    progressBars.forEach((bar, index) => {
      const width = bar.style.width;
      bar.style.width = '0%';

      setTimeout(() => {
        bar.style.width = width;
      }, 800 + index * 200);
    });
  }

  toggleFab() {
    if (this.fabOpen) {
      this.closeFab();
    } else {
      this.openFab();
    }
  }

  openFab() {
    this.fabOpen = true;
    this.fabMain.classList.add('active');
    this.fabOptions.classList.add('show');
  }

  closeFab() {
    this.fabOpen = false;
    this.fabMain.classList.remove('active');
    this.fabOptions.classList.remove('show');
  }

  handleFabAction(e) {
    const action = e.currentTarget.dataset.action;

    // Show notification based on action
    let message = '';
    switch (action) {
      case 'practice':
        message = 'Starting quick practice session...';
        this.startQuickPractice();
        break;
      case 'lesson':
        message = 'Continuing your current lesson...';
        this.continueLesson();
        break;
      case 'help':
        message = 'Opening help center...';
        this.openHelp();
        break;
    }

    if (window.studentNotifications && message) {
      window.studentNotifications.show(message, 'info');
    }

    this.closeFab();
  }

  handleCardAction(e) {
    const card = e.target.closest('.content-card');
    const cardType = this.getCardType(card);

    let message = '';
    switch (cardType) {
      case 'lessons':
        message = 'Opening lesson player...';
        this.openLessons();
        break;
      case 'practice':
        message = 'Starting practice session...';
        this.startPractice();
        break;
      case 'assessment':
        message = 'Opening assessments...';
        this.openAssessments();
        break;
      case 'visualization':
        message = 'Loading 3D math explorer...';
        this.open3DExplorer();
        break;
      case 'progress':
        message = 'Opening detailed progress report...';
        this.openProgressReport();
        break;
      case 'support':
        message = 'Connecting to support...';
        this.openSupport();
        break;
    }

    if (window.studentNotifications && message) {
      window.studentNotifications.show(message, 'info');
    }
  }

  getCardType(card) {
    if (card.classList.contains('lessons-card')) return 'lessons';
    if (card.classList.contains('practice-card')) return 'practice';
    if (card.classList.contains('assessment-card')) return 'assessment';
    if (card.classList.contains('visualization-card')) return 'visualization';
    if (card.classList.contains('progress-card')) return 'progress';
    if (card.classList.contains('support-card')) return 'support';
    return 'unknown';
  }

  onCardHover(card) {
    // Add subtle glow effect
    card.style.boxShadow = '0 20px 60px rgba(102, 126, 234, 0.3)';

    // Rotate the icon slightly
    const icon = card.querySelector('.card-icon');
    if (icon) {
      icon.style.transform = 'scale(1.1) rotate(5deg)';
    }
  }

  onCardLeave(card) {
    // Remove glow effect
    card.style.boxShadow = '';

    // Reset icon
    const icon = card.querySelector('.card-icon');
    if (icon) {
      icon.style.transform = '';
    }
  }

  handleKeyboard(e) {
    switch (e.key) {
      case 'Escape':
        if (this.fabOpen) {
          this.closeFab();
        }
        break;
      case ' ':
        if (e.target === document.body) {
          e.preventDefault();
          this.toggleFab();
        }
        break;
    }
  }

  // Action Methods
  startQuickPractice() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          'Quick practice feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  continueLesson() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          'Lesson continuation feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  openHelp() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          'Help center feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  openLessons() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          'Lesson player feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  startPractice() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          'Practice session feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  openAssessments() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          'Assessment center feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  open3DExplorer() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          '3D Math Explorer feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  openProgressReport() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          'Detailed progress report feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  openSupport() {
    setTimeout(() => {
      if (window.studentNotifications) {
        window.studentNotifications.show(
          'Support center feature coming soon!',
          'info'
        );
      }
    }, 1000);
  }

  // Public methods
  refreshProgress() {
    this.startProgressAnimation();
    this.initializeProgressChart();
  }

  updateStats(newStats) {
    // Method to update statistics from external sources
    console.log('Updating stats:', newStats);
  }
}

// Animation utilities for learning content
const LearningAnimations = {
  // Pulse animation for important elements
  pulse(element) {
    element.style.animation = 'pulse 0.6s ease-in-out';
    setTimeout(() => {
      element.style.animation = '';
    }, 600);
  },

  // Shake animation for errors
  shake(element) {
    element.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => {
      element.style.animation = '';
    }, 500);
  },

  // Success animation
  success(element) {
    element.style.animation = 'bounceIn 0.6s ease-in-out';
    setTimeout(() => {
      element.style.animation = '';
    }, 600);
  },
};

// Helper functions
const LearningUtils = {
  // Format percentage
  formatPercentage(value) {
    return `${Math.round(value)}%`;
  },

  // Format duration
  formatDuration(minutes) {
    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    }
  },

  // Calculate progress
  calculateProgress(completed, total) {
    return total > 0 ? (completed / total) * 100 : 0;
  },

  // Generate random ID
  generateId() {
    return 'learning_' + Math.random().toString(36).substr(2, 9);
  },
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Wait for common scripts to initialize
  setTimeout(() => {
    window.learningContent = new LearningContent();
    console.log('Learning Content initialized');
  }, 100);
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }

    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }

    @keyframes bounceIn {
        0% {
            transform: scale(0.3);
            opacity: 0;
        }
        50% {
            transform: scale(1.05);
        }
        70% {
            transform: scale(0.9);
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }

    @keyframes slideInUp {
        from {
            transform: translateY(30px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
