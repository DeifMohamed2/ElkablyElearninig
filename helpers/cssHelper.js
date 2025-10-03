/**
 * CSS Helper Functions for Admin Views
 * Provides utilities for managing CSS imports and page-specific styles
 */

/**
 * Get the appropriate CSS file name for a given page
 * @param {string} pageName - The name of the page
 * @returns {string} - The CSS file name
 */
function getPageCSS(pageName) {
  const cssMap = {
    'dashboard': 'dashboard',
    'courses': 'courses',
    'course-detail': 'courses',
    'course-content': 'courses',
    'bundles': 'bundles',
    'bundle-info': 'bundles',
    'bundle-manage': 'bundles',
    'quizzes': 'quizzes',
    'create-quiz': 'quizzes',
    'edit-quiz': 'quizzes',
    'quiz-details': 'quizzes',
    'quiz-review': 'quizzes',
    'question-banks': 'question-banks',
    'question-bank-details': 'question-banks',
    'students': 'students',
    'student-details': 'students',
    'orders': 'orders',
    'order-details': 'orders'
  };
  
  return cssMap[pageName] || null;
}

/**
 * Generate CSS import links for admin pages
 * @param {string} pageName - The name of the page
 * @param {Array} additionalCSS - Additional CSS files to include
 * @returns {Object} - Object containing CSS configuration
 */
function generateCSSConfig(pageName, additionalCSS = []) {
  const pageCSS = getPageCSS(pageName);
  
  return {
    pageCSS: pageCSS,
    additionalCSS: additionalCSS,
    hasPageCSS: !!pageCSS
  };
}

/**
 * Get all available CSS files for admin pages
 * @returns {Array} - Array of available CSS file names
 */
function getAvailableCSSFiles() {
  return [
    'dashboard',
    'courses',
    'bundles',
    'quizzes',
    'question-banks',
    'students',
    'orders'
  ];
}

/**
 * Validate if a CSS file exists for a given page
 * @param {string} pageName - The name of the page
 * @returns {boolean} - Whether the CSS file exists
 */
function validatePageCSS(pageName) {
  const availableFiles = getAvailableCSSFiles();
  const pageCSS = getPageCSS(pageName);
  return availableFiles.includes(pageCSS);
}

/**
 * Get CSS file path for a given page
 * @param {string} pageName - The name of the page
 * @returns {string} - The CSS file path
 */
function getCSSFilePath(pageName) {
  const pageCSS = getPageCSS(pageName);
  return pageCSS ? `/css/adminCSS/${pageCSS}.css` : null;
}

/**
 * Generate CSS import HTML for EJS templates
 * @param {string} pageName - The name of the page
 * @param {Array} additionalCSS - Additional CSS files to include
 * @returns {string} - HTML string for CSS imports
 */
function generateCSSImports(pageName, additionalCSS = []) {
  const pageCSS = getPageCSS(pageName);
  let html = '';
  
  // Main admin CSS
  html += '<link rel="stylesheet" href="/css/adminCSS/admin-main.css">\n';
  
  // Page specific CSS
  if (pageCSS) {
    html += `<link rel="stylesheet" href="/css/adminCSS/${pageCSS}.css">\n`;
  }
  
  // Additional CSS
  additionalCSS.forEach(css => {
    html += `<link rel="stylesheet" href="${css}">\n`;
  });
  
  return html;
}

/**
 * Get CSS class names for page-specific styling
 * @param {string} pageName - The name of the page
 * @returns {string} - CSS class names
 */
function getPageCSSClasses(pageName) {
  const pageCSS = getPageCSS(pageName);
  const baseClasses = 'admin-page';
  
  if (pageCSS) {
    return `${baseClasses} admin-page-${pageCSS}`;
  }
  
  return baseClasses;
}

/**
 * Check if a page has specific CSS styling
 * @param {string} pageName - The name of the page
 * @returns {boolean} - Whether the page has specific CSS
 */
function hasPageSpecificCSS(pageName) {
  return !!getPageCSS(pageName);
}

module.exports = {
  getPageCSS,
  generateCSSConfig,
  getAvailableCSSFiles,
  validatePageCSS,
  getCSSFilePath,
  generateCSSImports,
  getPageCSSClasses,
  hasPageSpecificCSS
};
