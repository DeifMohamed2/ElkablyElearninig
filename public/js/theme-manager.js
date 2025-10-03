/**
 * Unified Theme System for Mr Mohrr7am
 * Handles theme switching across all pages
 */

class ThemeManager {
  constructor() {
    this.currentTheme = this.getStoredTheme() || 'dark';
    this.init();
  }

  init() {
    // Apply initial theme
    this.applyTheme(this.currentTheme);

    // Setup theme toggle listeners
    this.setupToggleListeners();

    // Listen for storage changes (for cross-tab sync)
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme') {
        this.currentTheme = e.newValue || 'dark';
        this.applyTheme(this.currentTheme);
      }
    });
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
    const body = document.body;

    // Remove existing theme classes
    body.classList.remove('light-theme', 'dark-theme');

    // Add new theme class
    body.classList.add(`${theme}-theme`);

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
      const lightIcon = button.querySelector('.light-icon');
      const darkIcon = button.querySelector('.dark-icon');

      if (lightIcon && darkIcon) {
        if (theme === 'dark') {
          // Show sun icon in dark theme (to switch to light)
          lightIcon.style.display = 'inline-block';
          darkIcon.style.display = 'none';
        } else {
          // Show moon icon in light theme (to switch to dark)
          lightIcon.style.display = 'none';
          darkIcon.style.display = 'inline-block';
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
      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleTheme();
      });
    });
  }
}

// Initialize theme manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.themeManager = new ThemeManager();
});

// Expose global function for manual theme switching
window.toggleTheme = () => {
  if (window.themeManager) {
    window.themeManager.toggleTheme();
  }
};
