/**
 * Animation Initializer for Mr Mohrr7am
 * This file ensures all animations are properly initialized and working together
 */

document.addEventListener('DOMContentLoaded', function() {
  console.log("Animation Initializer: Starting...");
  
  // Initialize AOS (Animate On Scroll)
  if (typeof AOS !== 'undefined') {
    console.log("Animation Initializer: Setting up AOS");
    AOS.init({
      duration: 800,
      easing: 'ease-in-out',
      once: false,
      mirror: true,
      disable: false
    });
    
    // Force refresh AOS after a short delay
    setTimeout(function() {
      AOS.refresh();
      console.log("Animation Initializer: AOS refreshed");
    }, 500);
  } else {
    console.error("Animation Initializer: AOS library not loaded!");
  }
  
  // Initialize 3D math visualizations
  initializeAllMathVisualizations();
  
  // Initialize floating elements
  initializeAllFloatingElements();
  
  // Initialize counters
  initializeCounters();
  
  // Initialize scroll events
  initializeScrollEvents();
  
  console.log("Animation Initializer: Complete");
});

/**
 * Initialize all 3D math visualizations
 */
function initializeAllMathVisualizations() {
  console.log("Animation Initializer: Setting up 3D math visualizations");
  
  // Check if Three.js is loaded
  if (typeof THREE === 'undefined') {
    console.error("Animation Initializer: Three.js library not loaded!");
    return;
  }
  
  // Check for math3DScene element
  const math3DScene = document.getElementById('math3DScene');
  if (math3DScene) {
    console.log("Animation Initializer: Found math3DScene element");
    
    // Create a basic Three.js scene if not already initialized
    if (!math3DScene.querySelector('canvas')) {
      console.log("Animation Initializer: Creating basic Three.js scene");
      
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, math3DScene.clientWidth / math3DScene.clientHeight, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      
      renderer.setSize(math3DScene.clientWidth, math3DScene.clientHeight);
      math3DScene.appendChild(renderer.domElement);
      
      // Add ambient light
      const ambientLight = new THREE.AmbientLight(0x404040, 2);
      scene.add(ambientLight);
      
      // Add a simple rotating cube as a placeholder
      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x00c6ff,
        metalness: 0.5,
        roughness: 0.5
      });
      const cube = new THREE.Mesh(geometry, material);
      scene.add(cube);
      
      // Position camera
      camera.position.z = 5;
      
      // Animation loop
      function animate() {
        requestAnimationFrame(animate);
        
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.01;
        
        renderer.render(scene, camera);
      }
      
      animate();
      
      // Handle window resize
      window.addEventListener('resize', () => {
        camera.aspect = math3DScene.clientWidth / math3DScene.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(math3DScene.clientWidth, math3DScene.clientHeight);
      });
    }
  }
  
  // Check for heroCanvas element
  const heroCanvas = document.getElementById('heroCanvas');
  if (heroCanvas && heroCanvas.getContext) {
    console.log("Animation Initializer: Found heroCanvas element");
    
    // Initialize canvas if not already done
    const ctx = heroCanvas.getContext('2d');
    if (!heroCanvas.dataset.initialized) {
      console.log("Animation Initializer: Initializing hero canvas");
      
      // Set canvas dimensions
      heroCanvas.width = heroCanvas.parentElement.clientWidth;
      heroCanvas.height = heroCanvas.parentElement.clientHeight;
      
      // Mark as initialized
      heroCanvas.dataset.initialized = 'true';
      
      // Create simple animation
      function drawWave() {
        ctx.clearRect(0, 0, heroCanvas.width, heroCanvas.height);
        
        const time = Date.now() * 0.001;
        const colors = ['rgba(0, 198, 255, 0.2)', 'rgba(0, 114, 255, 0.2)'];
        
        colors.forEach((color, i) => {
          const amplitude = 20 - i * 5;
          const frequency = 0.02 + i * 0.005;
          const speed = time * (0.2 - i * 0.05);
          
          ctx.beginPath();
          ctx.moveTo(0, heroCanvas.height / 2);
          
          for (let x = 0; x < heroCanvas.width; x++) {
            const y = Math.sin(x * frequency + speed) * amplitude + heroCanvas.height / 2;
            ctx.lineTo(x, y);
          }
          
          ctx.lineTo(heroCanvas.width, heroCanvas.height);
          ctx.lineTo(0, heroCanvas.height);
          ctx.closePath();
          
          ctx.fillStyle = color;
          ctx.fill();
        });
        
        requestAnimationFrame(drawWave);
      }
      
      drawWave();
      
      // Handle window resize
      window.addEventListener('resize', () => {
        heroCanvas.width = heroCanvas.parentElement.clientWidth;
        heroCanvas.height = heroCanvas.parentElement.clientHeight;
      });
    }
  }
}

/**
 * Initialize all floating elements
 */
function initializeAllFloatingElements() {
  console.log("Animation Initializer: Setting up floating elements");
  
  // Get all elements that should float
  const floatingElements = document.querySelectorAll('.floating-element, .math-element, .equation-item');
  console.log(`Animation Initializer: Found ${floatingElements.length} floating elements`);
  
  floatingElements.forEach((element, index) => {
    // Skip elements that are already being animated
    if (element.dataset.animationId) return;
    
    // Get animation parameters from data attributes or use defaults
    const amplitude = element.dataset.floatAmplitude || 15;
    const period = element.dataset.floatPeriod || 3 + (index % 3);
    const phase = index * 0.5; // Stagger phases for varied motion
    
    // Apply floating animation
    animateFloatingElement(element, parseFloat(amplitude), parseFloat(period), phase);
  });
}

/**
 * Animate a floating element
 */
function animateFloatingElement(element, amplitude, period, phase) {
  if (!element) return;
  
  // Create a unique animation ID
  const animationId = `float-${Math.random().toString(36).substr(2, 9)}`;
  element.dataset.animationId = animationId;
  
  let startTime = Date.now() / 1000;
  startTime -= phase; // Apply phase shift
  
  function updatePosition() {
    // Check if element still exists in DOM and animation hasn't been stopped
    if (!document.body.contains(element) || element.dataset.animationId !== animationId) {
      return; // Stop animation
    }
    
    const elapsed = Date.now() / 1000 - startTime;
    const yPos = amplitude * Math.sin(2 * Math.PI * elapsed / period);
    const xPos = (amplitude * 0.3) * Math.sin(2 * Math.PI * elapsed / (period * 1.3));
    const rotation = amplitude * 0.05 * Math.sin(2 * Math.PI * elapsed / (period * 1.5));
    
    element.style.transform = `translateX(${xPos}px) translateY(${yPos}px) rotate(${rotation}deg)`;
    
    requestAnimationFrame(updatePosition);
  }
  
  updatePosition();
}

/**
 * Initialize counter animations
 */
function initializeCounters() {
  console.log("Animation Initializer: Setting up counters");
  
  // Find all elements with data-count attribute
  const counters = document.querySelectorAll('[data-count]');
  console.log(`Animation Initializer: Found ${counters.length} counters`);
  
  // Set up intersection observer to trigger counters when visible
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const counter = entry.target;
        const target = parseInt(counter.dataset.count);
        const duration = parseInt(counter.dataset.duration || 2000);
        
        // Animate the counter
        animateCounter(counter, target, duration);
        
        // Stop observing once triggered
        observer.unobserve(counter);
      }
    });
  }, { threshold: 0.5 });
  
  // Observe each counter
  counters.forEach(counter => {
    observer.observe(counter);
  });
}

/**
 * Animate a counter from 0 to target
 */
function animateCounter(element, target, duration) {
  if (!element) return;
  
  let startTime = null;
  let currentFrame = null;
  
  function updateCounter(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = timestamp - startTime;
    const percentage = Math.min(progress / duration, 1);
    
    // Use easing function for smoother animation
    const easing = t => t<.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1;
    const easedPercentage = easing(percentage);
    
    // Calculate current value
    const currentValue = Math.floor(easedPercentage * target);
    
    // Format with commas if needed
    element.textContent = currentValue.toLocaleString();
    
    if (percentage < 1) {
      currentFrame = requestAnimationFrame(updateCounter);
    } else {
      element.textContent = target.toLocaleString();
    }
  }
  
  // Start animation
  currentFrame = requestAnimationFrame(updateCounter);
}

/**
 * Initialize scroll-triggered events
 */
function initializeScrollEvents() {
  console.log("Animation Initializer: Setting up scroll events");
  
  // Back to top button
  const backToTopButton = document.getElementById('backToTop');
  if (backToTopButton) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopButton.classList.add('active');
      } else {
        backToTopButton.classList.remove('active');
      }
    });
    
    backToTopButton.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  
  // Parallax effects
  const parallaxElements = document.querySelectorAll('.parallax');
  if (parallaxElements.length > 0) {
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
  
  // Scroll progress bar
  const scrollProgress = document.getElementById('scroll-progress');
  if (scrollProgress) {
    window.addEventListener('scroll', () => {
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      
      scrollProgress.style.width = scrolled + '%';
    });
  }
}
