/**
 * Debug Loader for Mr Mohrr7am
 * This file checks if all required libraries and scripts are properly loaded
 */

document.addEventListener('DOMContentLoaded', function() {
  console.log("Debug Loader: Starting checks...");
  
  // Check core libraries
  checkLibrary('THREE', 'Three.js');
  checkLibrary('AOS', 'AOS (Animate On Scroll)');
  checkLibrary('GSAP', 'GSAP');
  checkLibrary('anime', 'Anime.js');
  checkLibrary('math', 'Math.js');
  checkLibrary('katex', 'KaTeX');
  
  // Check custom scripts
  checkScript('math-animations.js');
  checkScript('interactive-background.js');
  checkScript('advanced-math-animations.js');
  checkScript('interactive-3d-math.js');
  checkScript('interactive-elements.js');
  checkScript('scroll-animations.js');
  checkScript('animation-initializer.js');
  
  // Check DOM elements
  checkElement('math3DScene', 'Math 3D Scene');
  checkElement('heroCanvas', 'Hero Canvas');
  checkElement('heroParticles', 'Hero Particles');
  checkElement('floating-equations-new', 'Floating Equations');
  checkElement('scroll-progress', 'Scroll Progress Bar');
  checkElement('backToTop', 'Back to Top Button');
  
  console.log("Debug Loader: Checks complete");
});

/**
 * Check if a library is loaded
 */
function checkLibrary(varName, displayName) {
  if (typeof window[varName] !== 'undefined') {
    console.log(`✅ ${displayName} is loaded`);
  } else {
    console.error(`❌ ${displayName} is NOT loaded`);
  }
}

/**
 * Check if a script is loaded by looking for its file name in all script tags
 */
function checkScript(scriptName) {
  const scripts = document.querySelectorAll('script');
  let found = false;
  
  scripts.forEach(script => {
    if (script.src && script.src.includes(scriptName)) {
      found = true;
    }
  });
  
  if (found) {
    console.log(`✅ ${scriptName} is loaded`);
  } else {
    console.error(`❌ ${scriptName} is NOT loaded`);
  }
}

/**
 * Check if an element exists in the DOM
 */
function checkElement(selector, displayName) {
  const element = selector.startsWith('#') ? 
    document.getElementById(selector.substring(1)) : 
    (selector.startsWith('.') ? 
      document.querySelector(selector) : 
      (document.getElementById(selector) || document.querySelector(`.${selector}`)));
  
  if (element) {
    console.log(`✅ ${displayName} element found`);
  } else {
    console.error(`❌ ${displayName} element NOT found`);
  }
}
