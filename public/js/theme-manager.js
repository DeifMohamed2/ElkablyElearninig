/**
 * Unified Theme System for Mr Mohrr7am
 * Handles theme switching across all pages
 * Note: This is now a fallback system - main theme toggle is handled by advanced-header.js
 */

class ThemeManager {
  constructor() {
    this.currentTheme = this.getStoredTheme() || 'light';
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    
    // Only initialize if advanced-header.js hasn't already handled it
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle && !themeToggle.hasAttribute('data-advanced-header-initialized')) {
      this.applyTheme(this.currentTheme);
      this.setupToggleListeners();
    }

    // Listen for storage changes (for cross-tab sync)
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme') {
        this.currentTheme = e.newValue || 'light';
        this.applyTheme(this.currentTheme);
      }
    });

    this.isInitialized = true;
  }

  getStoredTheme() {
    try {
      return localStorage.getItem('theme');
    } catch (e) {
      return null;
    }
  }

  setStoredTheme(theme) {
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.warn('Failed to save theme preference');
    }
  }

  applyTheme(theme) {
    // Remove existing theme classes from both html and body
    document.documentElement.classList.remove('light-theme', 'dark-theme');
    document.body.classList.remove('light-theme', 'dark-theme');

    // Add new theme class to both html and body
    document.documentElement.classList.add(`${theme}-theme`);
    document.body.classList.add(`${theme}-theme`);

    // Update theme toggle icons
    this.updateThemeIcons(theme);

    // Store theme preference
    this.setStoredTheme(theme);

    this.currentTheme = theme;
  }

  updateThemeIcons(theme) {
    const toggleButtons = document.querySelectorAll(
      '#themeToggle, .theme-toggle'
    );

    toggleButtons.forEach((button) => {
      const lightContainer = button.querySelector('.light-icon-container');
      const darkContainer = button.querySelector('.dark-icon-container');

      if (lightContainer && darkContainer) {
        if (theme === 'light') {
          lightContainer.style.display = 'none';
          lightContainer.style.opacity = '0';
          lightContainer.style.transform = 'scale(0.5) rotate(-180deg)';
          lightContainer.style.visibility = 'hidden';
          
          darkContainer.style.display = 'flex';
          darkContainer.style.opacity = '1';
          darkContainer.style.transform = 'scale(1) rotate(0deg)';
          darkContainer.style.visibility = 'visible';
        } else {
          lightContainer.style.display = 'flex';
          lightContainer.style.opacity = '1';
          lightContainer.style.transform = 'scale(1) rotate(0deg)';
          lightContainer.style.visibility = 'visible';
          
          darkContainer.style.display = 'none';
          darkContainer.style.opacity = '0';
          darkContainer.style.transform = 'scale(0.5) rotate(180deg)';
          darkContainer.style.visibility = 'hidden';
        }
      }
    });
  }

  toggleTheme() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
  }

  setupToggleListeners() {
    const toggleButtons = document.querySelectorAll(
      '#themeToggle, .theme-toggle'
    );

    toggleButtons.forEach((button) => {
      // Only add listener if not already handled by advanced-header.js
      if (!button.hasAttribute('data-advanced-header-initialized')) {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          this.toggleTheme();
        });
      }
    });
  }
}

// Initialize theme manager when DOM is ready (as fallback)
document.addEventListener('DOMContentLoaded', () => {
  // Delay initialization to let advanced-header.js handle it first
  setTimeout(() => {
    if (!window.themeManager) {
      window.themeManager = new ThemeManager();
      window.themeManager.init();
    }
  }, 100);
});

// Expose global function for manual theme switching
window.toggleTheme = () => {
  if (window.themeManager) {
    window.themeManager.toggleTheme();
  }
};
