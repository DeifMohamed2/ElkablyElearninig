/**
 * Enhanced Scroll Effects for Mr Mohrr7am
 * Handles advanced scroll animations, glass morphism, and smooth transitions
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize all enhanced scroll effects
  initializeEnhancedScrollAnimations();
  initializeGlassMorphismEffects();
  initializeSmoothScrolling();
  initializeParallaxElements();
  initializeStaggeredAnimations();
});

/**
 * Initialize enhanced scroll animations with better performance
 */
function initializeEnhancedScrollAnimations() {
  const animatedElements = document.querySelectorAll('[data-aos], .scroll-reveal, .scroll-reveal-left, .scroll-reveal-right, .scroll-reveal-scale');
  
  if (animatedElements.length === 0) return;

  // Create intersection observer with better performance
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const delay = element.getAttribute('data-aos-delay') || 0;
        
        setTimeout(() => {
          // Add animation classes
          element.classList.add('aos-animate', 'revealed');
          
          // Trigger custom animation events
          element.dispatchEvent(new CustomEvent('scrollReveal', {
            detail: { element, direction: 'in' }
          }));
        }, parseInt(delay));
        
        // Unobserve after animation
        observer.unobserve(element);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  // Observe all animated elements
  animatedElements.forEach(element => {
    // Set initial state for better performance
    if (!element.style.opacity) {
      element.style.willChange = 'opacity, transform';
    }
    observer.observe(element);
  });
}

/**
 * Initialize glass morphism effects that respond to scroll
 */
function initializeGlassMorphismEffects() {
  const glassElements = document.querySelectorAll('.glass-effect, .glass-effect-strong, .header-glass-effect');
  
  if (glassElements.length === 0) return;

  let ticking = false;

  function updateGlassEffects() {
    const scrollY = window.scrollY;
    const scrollProgress = Math.min(scrollY / 300, 1);
    
    glassElements.forEach(element => {
      const isHeader = element.classList.contains('header-glass-effect');
      const isStrong = element.classList.contains('glass-effect-strong');
      
      if (isHeader) {
        // Header glass effect is handled by advanced-header.js
        return;
      }
      
      // Calculate dynamic glass properties
      const baseOpacity = isStrong ? 0.15 : 0.1;
      const baseBlur = isStrong ? 20 : 10;
      
      const dynamicOpacity = baseOpacity + (scrollProgress * 0.1);
      const dynamicBlur = baseBlur + (scrollProgress * 10);
      
      // Apply glass morphism
      element.style.background = `rgba(255, 255, 255, ${dynamicOpacity})`;
      element.style.backdropFilter = `blur(${dynamicBlur}px)`;
      element.style.webkitBackdropFilter = `blur(${dynamicBlur}px)`;
      
      // Add subtle shadow based on scroll
      const shadowIntensity = scrollProgress * 0.2;
      element.style.boxShadow = `0 8px 32px rgba(0, 0, 0, ${0.1 + shadowIntensity})`;
    });
    
    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      requestAnimationFrame(updateGlassEffects);
      ticking = true;
    }
  }

  window.addEventListener('scroll', requestTick, { passive: true });
}

/**
 * Initialize smooth scrolling for anchor links
 */
function initializeSmoothScrolling() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  
  anchorLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      if (href === '#' || href === '#top') {
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
        return;
      }
      
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        
        const headerHeight = document.querySelector('.advanced-header')?.offsetHeight || 0;
        const targetPosition = target.offsetTop - headerHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
        
        // Update URL without jumping
        history.pushState(null, null, href);
      }
    });
  });
}

/**
 * Initialize parallax effects for background elements
 */
function initializeParallaxElements() {
  const parallaxElements = document.querySelectorAll('.parallax, [data-parallax]');
  
  if (parallaxElements.length === 0) return;

  let ticking = false;

  function updateParallax() {
    const scrollY = window.scrollY;
    
    parallaxElements.forEach(element => {
      const speed = element.dataset.parallaxSpeed || 0.5;
      const direction = element.dataset.parallaxDirection || 'up';
      const offset = element.dataset.parallaxOffset || 0;
      
      let yPos;
      if (direction === 'up') {
        yPos = -scrollY * speed + parseInt(offset);
      } else if (direction === 'down') {
        yPos = scrollY * speed + parseInt(offset);
      } else if (direction === 'left') {
        yPos = -scrollY * speed + parseInt(offset);
      } else if (direction === 'right') {
        yPos = scrollY * speed + parseInt(offset);
      }
      
      // Apply transform with better performance
      element.style.transform = `translate3d(0, ${yPos}px, 0)`;
    });
    
    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }

  window.addEventListener('scroll', requestTick, { passive: true });
}

/**
 * Initialize staggered animations for lists and grids
 */
function initializeStaggeredAnimations() {
  const staggerContainers = document.querySelectorAll('.stagger-container, .stagger-list');
  
  if (staggerContainers.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const container = entry.target;
        const items = container.querySelectorAll('.stagger-item, .stagger-list-item');
        
        // Animate items with stagger effect
        items.forEach((item, index) => {
          setTimeout(() => {
            item.classList.add('revealed');
          }, index * 100);
        });
        
        observer.unobserve(container);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  staggerContainers.forEach(container => {
    observer.observe(container);
  });
}

/**
 * Add scroll-triggered class to body for CSS animations
 */
function initializeScrollClasses() {
  let ticking = false;
  let lastScrollY = window.scrollY;

  function updateScrollClasses() {
    const scrollY = window.scrollY;
    const scrollDirection = scrollY > lastScrollY ? 'down' : 'up';
    
    // Add scroll direction classes
    document.body.classList.toggle('scroll-down', scrollDirection === 'down');
    document.body.classList.toggle('scroll-up', scrollDirection === 'up');
    
    // Add scroll position classes
    document.body.classList.toggle('scrolled', scrollY > 50);
    document.body.classList.toggle('scrolled-past-hero', scrollY > 300);
    
    lastScrollY = scrollY;
    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      requestAnimationFrame(updateScrollClasses);
      ticking = true;
    }
  }

  window.addEventListener('scroll', requestTick, { passive: true });
}

// Initialize scroll classes
document.addEventListener('DOMContentLoaded', initializeScrollClasses);

/**
 * Utility function to trigger scroll animations manually
 */
function triggerScrollAnimation(element, animationType = 'fade-up') {
  if (element) {
    element.setAttribute('data-aos', animationType);
    element.classList.add('aos-animate', 'revealed');
  }
}

/**
 * Utility function to reset scroll animations
 */
function resetScrollAnimation(element) {
  if (element) {
    element.classList.remove('aos-animate', 'revealed');
    element.style.opacity = '';
    element.style.transform = '';
  }
}

// Export utility functions
window.triggerScrollAnimation = triggerScrollAnimation;
window.resetScrollAnimation = resetScrollAnimation;


