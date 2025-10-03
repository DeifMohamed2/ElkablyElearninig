/**
 * Advanced Scroll Animations for Mr Mohrr7am
 * This file handles all scroll-triggered animations throughout the site
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize AOS (Animate On Scroll)
  initializeAOS();
  
  // Initialize scroll-triggered animations for sections
  initializeSectionAnimations();
  
  // Initialize scroll-triggered animations for elements
  initializeElementAnimations();
  
  // Initialize parallax effects
  initializeParallaxEffects();
  
  // Initialize floating elements
  initializeFloatingElements();
});

/**
 * Initialize AOS library for scroll animations
 */
function initializeAOS() {
  if (typeof AOS !== 'undefined') {
    console.log("Initializing AOS animations");
    AOS.init({
      duration: 1200,
      easing: 'ease-out-cubic',
      once: true,
      mirror: false,
      disable: false,
      startEvent: 'DOMContentLoaded',
      offset: 100,
      delay: 0
    });
    
    // Refresh AOS on window resize for better responsiveness
    window.addEventListener('resize', function() {
      AOS.refresh();
    });
    
    // Force refresh AOS after a short delay to ensure all elements are properly initialized
    setTimeout(function() {
      AOS.refresh();
    }, 500);
  } else {
    console.error("AOS library not loaded!");
    // Fallback to custom scroll animations
    initializeCustomScrollAnimations();
  }
}

/**
 * Custom scroll animations fallback when AOS is not available
 */
function initializeCustomScrollAnimations() {
  const animatedElements = document.querySelectorAll('[data-aos]');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const animationType = element.getAttribute('data-aos');
        const delay = element.getAttribute('data-aos-delay') || 0;
        
        setTimeout(() => {
          element.classList.add('aos-animate');
          element.style.opacity = '1';
          element.style.transform = 'translateY(0) translateX(0) scale(1)';
        }, parseInt(delay));
        
        observer.unobserve(element);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  animatedElements.forEach(element => {
    // Set initial state
    element.style.opacity = '0';
    element.style.transition = 'all 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    
    const animationType = element.getAttribute('data-aos');
    switch(animationType) {
      case 'fade-up':
        element.style.transform = 'translateY(30px)';
        break;
      case 'fade-down':
        element.style.transform = 'translateY(-30px)';
        break;
      case 'fade-left':
        element.style.transform = 'translateX(-30px)';
        break;
      case 'fade-right':
        element.style.transform = 'translateX(30px)';
        break;
      case 'zoom-in':
        element.style.transform = 'scale(0.8)';
        break;
      case 'flip-left':
        element.style.transform = 'rotateY(-90deg)';
        break;
      case 'flip-right':
        element.style.transform = 'rotateY(90deg)';
        break;
      default:
        element.style.transform = 'translateY(30px)';
    }
    
    observer.observe(element);
  });
}

/**
 * Initialize scroll-triggered animations for sections
 */
function initializeSectionAnimations() {
  const sections = document.querySelectorAll('section');
  
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('section-visible');
        
        // Trigger child animations when section becomes visible
        const animatedElements = entry.target.querySelectorAll('.animated-element');
        animateElements(animatedElements);
      }
    });
  }, { threshold: 0.1 });
  
  sections.forEach(section => {
    section.classList.add('section-animated');
    sectionObserver.observe(section);
  });
}

/**
 * Initialize scroll-triggered animations for individual elements
 */
function initializeElementAnimations() {
  const animatedElements = document.querySelectorAll('.animated-element:not(.animated)');
  
  const elementObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const animationType = element.dataset.animation || 'fade-in';
        const animationDelay = element.dataset.delay || 0;
        
        // Add animation class after delay
        setTimeout(() => {
          element.classList.add('animated', animationType);
        }, animationDelay);
        
        // Stop observing after animation
        elementObserver.unobserve(element);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  
  animatedElements.forEach(element => {
    elementObserver.observe(element);
  });
}

/**
 * Animate a collection of elements sequentially
 * @param {NodeList} elements - Elements to animate
 */
function animateElements(elements) {
  elements.forEach((element, index) => {
    const animationType = element.dataset.animation || 'fade-in';
    const baseDelay = element.dataset.delay ? parseInt(element.dataset.delay) : 0;
    const staggerDelay = element.dataset.stagger ? parseInt(element.dataset.stagger) : 100;
    const delay = baseDelay + (index * staggerDelay);
    
    setTimeout(() => {
      element.classList.add('animated', animationType);
    }, delay);
  });
}

/**
 * Initialize parallax effects for background elements
 */
function initializeParallaxEffects() {
  const parallaxElements = document.querySelectorAll('.parallax');
  
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    
    parallaxElements.forEach(element => {
      const speed = element.dataset.parallaxSpeed || 0.2;
      const direction = element.dataset.parallaxDirection || 'up';
      let yPos;
      
      if (direction === 'up') {
        yPos = -scrollY * speed;
      } else {
        yPos = scrollY * speed;
      }
      
      element.style.transform = `translate3d(0, ${yPos}px, 0)`;
    });
  });
}

/**
 * Initialize floating animations for decorative elements
 */
function initializeFloatingElements() {
  console.log("Initializing floating elements");
  const floatingElements = document.querySelectorAll('.floating-element');
  console.log(`Found ${floatingElements.length} floating elements`);
  
  floatingElements.forEach((element, index) => {
    // Get animation parameters from data attributes or use defaults
    const amplitude = element.dataset.floatAmplitude || 15;
    const period = element.dataset.floatPeriod || 3;
    const phase = index * 0.5; // Stagger phases for varied motion
    
    console.log(`Animating element ${index} with amplitude ${amplitude} and period ${period}`);
    
    // Apply floating animation
    animateFloating(element, parseFloat(amplitude), parseFloat(period), phase);
  });
  
  // Also initialize floating equations and math elements
  const mathElements = document.querySelectorAll('.math-element, .equation-item');
  console.log(`Found ${mathElements.length} math elements`);
  
  mathElements.forEach((element, index) => {
    if (!element.classList.contains('floating-element')) {
      // Add floating class if not already present
      element.classList.add('floating-element-math');
      
      // Get animation parameters or use defaults with different ranges for variety
      const amplitude = 10 + Math.random() * 10; // 10-20
      const period = 2 + Math.random() * 3; // 2-5
      const phase = index * 0.7; // Stagger phases
      
      // Apply floating animation
      animateFloating(element, amplitude, period, phase);
    }
  });
}

/**
 * Animate a floating element with custom parameters
 * @param {Element} element - The element to animate
 * @param {number} amplitude - The maximum distance to move
 * @param {number} period - The time period of one complete cycle
 * @param {number} phase - The starting phase of the animation
 */
function animateFloating(element, amplitude, period, phase) {
  if (!element) {
    console.error("Cannot animate undefined element");
    return;
  }
  
  // Store original transform if it exists
  const originalTransform = element.style.transform || '';
  const hasOriginalTransform = originalTransform !== '';
  
  let startTime = Date.now() / 1000;
  startTime -= phase; // Apply phase shift
  
  // Create a unique animation ID for this element
  const animationId = `float-${Math.random().toString(36).substr(2, 9)}`;
  element.dataset.animationId = animationId;
  
  function updatePosition() {
    // Check if element still exists in DOM and animation hasn't been stopped
    if (!document.body.contains(element) || element.dataset.animationId !== animationId) {
      return; // Stop animation
    }
    
    const elapsed = Date.now() / 1000 - startTime;
    const yPos = amplitude * Math.sin(2 * Math.PI * elapsed / period);
    
    // Add some horizontal movement for more natural floating
    const xPos = (amplitude * 0.3) * Math.sin(2 * Math.PI * elapsed / (period * 1.3));
    
    const rotation = amplitude * 0.05 * Math.sin(2 * Math.PI * elapsed / (period * 1.5));
    
    // Apply new transform while preserving original transform if it exists
    if (hasOriginalTransform) {
      element.style.transform = `${originalTransform} translateX(${xPos}px) translateY(${yPos}px) rotate(${rotation}deg)`;
    } else {
      element.style.transform = `translateX(${xPos}px) translateY(${yPos}px) rotate(${rotation}deg)`;
    }
    
    requestAnimationFrame(updatePosition);
  }
  
  // Start the animation
  updatePosition();
  
  // Return a function to stop the animation if needed
  return function stopAnimation() {
    element.dataset.animationId = '';
  };
}

/**
 * Add scroll-triggered reveal animations to cards
 */
document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.card');
  
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('card-revealed');
      }
    });
  }, { threshold: 0.1 });
  
  cards.forEach(card => {
    card.classList.add('card-animated');
    cardObserver.observe(card);
  });
});

/**
 * Initialize scroll progress indicator
 */
document.addEventListener('DOMContentLoaded', () => {
  const progressBar = document.getElementById('scroll-progress');
  if (!progressBar) return;
  
  window.addEventListener('scroll', () => {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    
    progressBar.style.width = scrolled + '%';
  });
});

/**
 * Add scroll-triggered counter animations
 */
document.addEventListener('DOMContentLoaded', () => {
  const counters = document.querySelectorAll('.counter-number');
  
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const counter = entry.target;
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = parseInt(counter.getAttribute('data-duration') || 2000);
        let startTime = null;
        
        function updateCounter(timestamp) {
          if (!startTime) startTime = timestamp;
          const progress = timestamp - startTime;
          const percentage = Math.min(progress / duration, 1);
          
          const currentValue = Math.floor(percentage * target);
          counter.textContent = currentValue.toLocaleString();
          
          if (percentage < 1) {
            requestAnimationFrame(updateCounter);
          } else {
            counter.textContent = target.toLocaleString();
          }
        }
        
        requestAnimationFrame(updateCounter);
        counterObserver.unobserve(counter);
      }
    });
  }, { threshold: 0.5 });
  
  counters.forEach(counter => {
    counterObserver.observe(counter);
  });
});
