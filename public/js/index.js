/**
 * Index Page JavaScript for Mr Mohrr7am
 */

document.addEventListener('DOMContentLoaded', function() {
  // Theme Toggle Functionality
  initThemeToggle();
  
  // Floating Math Elements Animation
  createFloatingMath();
  
  // Initialize highlight animations
  initHighlightAnimations();
  
  // Initialize interactive demo controls
  initInteractiveDemo();
  
  // Initialize testimonial carousel
  initTestimonialCarousel();
  
  // Initialize scroll animations
  initScrollAnimations();
  
  // Initialize particle system for hero section
  createParticleSystem();
});

/**
 * Initialize theme toggle functionality
 */
function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const body = document.body;
  
  // Check for saved theme preference or default to dark
  const currentTheme = localStorage.getItem('theme') || 'dark';
  body.setAttribute('data-theme', currentTheme);
  body.className = currentTheme + '-theme';
  
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      const currentTheme = body.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      body.setAttribute('data-theme', newTheme);
      body.className = newTheme + '-theme';
      localStorage.setItem('theme', newTheme);
    });
  }
}

/**
 * Create floating math elements
 */
function createFloatingMath() {
  const container = document.getElementById('floatingMath');
  if (!container) return;
  
  const equations = ['π', '∑', '∫', '√', '∞', 'α', 'β', 'θ', 'Δ', 'λ'];
  
  setInterval(() => {
    if (container.children.length < 15) {
      const element = document.createElement('div');
      element.className = 'math-element';
      element.textContent = equations[Math.floor(Math.random() * equations.length)];
      element.style.left = Math.random() * 100 + 'vw';
      element.style.animationDuration = (Math.random() * 10 + 15) + 's';
      element.style.fontSize = (Math.random() * 20 + 20) + 'px';
      container.appendChild(element);
      
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }, 25000);
    }
  }, 2000);
}

/**
 * Initialize highlight animations
 */
function initHighlightAnimations() {
  const highlights = document.querySelectorAll('.highlight-item');
  
  // Create intersection observer to trigger highlights when visible
  const highlightObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        highlightObserver.unobserve(entry.target);
      }
    });
  });
  
  // Observe each highlight element
  highlights.forEach(highlight => {
    highlightObserver.observe(highlight);
  });
}

/**
 * Initialize interactive demo controls
 */
function initInteractiveDemo() {
  const conceptButtons = document.querySelectorAll('.concept-btn');
  const rotationSlider = document.getElementById('rotationSpeed');
  const complexitySlider = document.getElementById('complexity');
  const resetBtn = document.getElementById('resetDemo');
  const randomizeBtn = document.getElementById('randomizeDemo');
  const equationDisplay = document.querySelector('.equation-text');
  const mathObject = document.getElementById('mathObject');
  
  const equations = {
    geometry: ['A = πr²', 'V = (4/3)πr³', 'c² = a² + b²', 'P = 2πr', 'S = 4πr²'],
    calculus: ['dy/dx = lim(h→0)', '∫ f(x)dx', '∂f/∂x', '∑(n=1 to ∞)', 'lim(x→∞)'],
    algebra: ['ax² + bx + c = 0', 'y = mx + b', 'x = (-b ± √(b²-4ac))/2a', 'log(xy) = log(x) + log(y)']
  };
  
  // Initialize concept buttons
  conceptButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      conceptButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      const concept = this.getAttribute('data-concept');
      const conceptEquations = equations[concept];
      const randomEquation = conceptEquations[Math.floor(Math.random() * conceptEquations.length)];
      
      if (equationDisplay) {
        equationDisplay.textContent = randomEquation;
      }
      
      // Change cube faces based on concept
      updateCubeFaces(concept);
    });
  });
  
  // Initialize rotation speed slider
  if (rotationSlider) {
    rotationSlider.addEventListener('input', function() {
      this.nextElementSibling.textContent = parseFloat(this.value).toFixed(1);
      
      // Update animation speed
      if (mathObject) {
        const speed = parseFloat(this.value);
        mathObject.style.animationDuration = (8 / speed) + 's';
      }
    });
  }
  
  // Initialize complexity slider
  if (complexitySlider) {
    complexitySlider.addEventListener('input', function() {
      this.nextElementSibling.textContent = this.value;
      
      // Update cube size based on complexity
      if (mathObject) {
        const complexity = parseInt(this.value);
        const size = 80 + (complexity * 4);
        mathObject.style.width = size + 'px';
        mathObject.style.height = size + 'px';
        
        // Update cube faces
        const faces = mathObject.querySelectorAll('.cube-face');
        faces.forEach(face => {
          face.style.width = size + 'px';
          face.style.height = size + 'px';
          const halfSize = size / 2;
          
          if (face.classList.contains('front')) face.style.transform = `translateZ(${halfSize}px)`;
          if (face.classList.contains('back')) face.style.transform = `translateZ(-${halfSize}px) rotateY(180deg)`;
          if (face.classList.contains('right')) face.style.transform = `translateX(${halfSize}px) rotateY(90deg)`;
          if (face.classList.contains('left')) face.style.transform = `translateX(-${halfSize}px) rotateY(-90deg)`;
          if (face.classList.contains('top')) face.style.transform = `translateY(-${halfSize}px) rotateX(90deg)`;
          if (face.classList.contains('bottom')) face.style.transform = `translateY(${halfSize}px) rotateX(-90deg)`;
        });
      }
    });
  }
  
  // Initialize reset button
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      if (rotationSlider) {
        rotationSlider.value = 2;
        rotationSlider.nextElementSibling.textContent = '2.0';
        if (mathObject) {
          mathObject.style.animationDuration = '4s';
        }
      }
      
      if (complexitySlider) {
        complexitySlider.value = 5;
        complexitySlider.nextElementSibling.textContent = '5';
        if (mathObject) {
          mathObject.style.width = '120px';
          mathObject.style.height = '120px';
          const faces = mathObject.querySelectorAll('.cube-face');
          faces.forEach(face => {
            face.style.width = '120px';
            face.style.height = '120px';
            const halfSize = 60;
            
            if (face.classList.contains('front')) face.style.transform = `translateZ(${halfSize}px)`;
            if (face.classList.contains('back')) face.style.transform = `translateZ(-${halfSize}px) rotateY(180deg)`;
            if (face.classList.contains('right')) face.style.transform = `translateX(${halfSize}px) rotateY(90deg)`;
            if (face.classList.contains('left')) face.style.transform = `translateX(-${halfSize}px) rotateY(-90deg)`;
            if (face.classList.contains('top')) face.style.transform = `translateY(-${halfSize}px) rotateX(90deg)`;
            if (face.classList.contains('bottom')) face.style.transform = `translateY(${halfSize}px) rotateX(-90deg)`;
          });
        }
      }
      
      if (equationDisplay) {
        equationDisplay.textContent = 'y = sin(x) + cos(2x)';
      }
      
      // Reset cube faces
      updateCubeFaces('geometry');
    });
  }
  
  // Initialize randomize button
  if (randomizeBtn) {
    randomizeBtn.addEventListener('click', function() {
      if (rotationSlider) {
        rotationSlider.value = Math.random() * 5;
        rotationSlider.nextElementSibling.textContent = parseFloat(rotationSlider.value).toFixed(1);
        if (mathObject) {
          const speed = parseFloat(rotationSlider.value);
          mathObject.style.animationDuration = (8 / speed) + 's';
        }
      }
      
      if (complexitySlider) {
        complexitySlider.value = Math.floor(Math.random() * 10) + 1;
        complexitySlider.nextElementSibling.textContent = complexitySlider.value;
        if (mathObject) {
          const complexity = parseInt(complexitySlider.value);
          const size = 80 + (complexity * 4);
          mathObject.style.width = size + 'px';
          mathObject.style.height = size + 'px';
          
          const faces = mathObject.querySelectorAll('.cube-face');
          faces.forEach(face => {
            face.style.width = size + 'px';
            face.style.height = size + 'px';
            const halfSize = size / 2;
            
            if (face.classList.contains('front')) face.style.transform = `translateZ(${halfSize}px)`;
            if (face.classList.contains('back')) face.style.transform = `translateZ(-${halfSize}px) rotateY(180deg)`;
            if (face.classList.contains('right')) face.style.transform = `translateX(${halfSize}px) rotateY(90deg)`;
            if (face.classList.contains('left')) face.style.transform = `translateX(-${halfSize}px) rotateY(-90deg)`;
            if (face.classList.contains('top')) face.style.transform = `translateY(-${halfSize}px) rotateX(90deg)`;
            if (face.classList.contains('bottom')) face.style.transform = `translateY(${halfSize}px) rotateX(-90deg)`;
          });
        }
      }
      
      if (equationDisplay) {
        const allEquations = Object.values(equations).flat();
        const randomEquation = allEquations[Math.floor(Math.random() * allEquations.length)];
        equationDisplay.textContent = randomEquation;
      }
      
      // Randomize concept
      const concepts = ['geometry', 'calculus', 'algebra'];
      const randomConcept = concepts[Math.floor(Math.random() * concepts.length)];
      conceptButtons.forEach(btn => btn.classList.remove('active'));
      document.querySelector(`[data-concept="${randomConcept}"]`).classList.add('active');
      updateCubeFaces(randomConcept);
    });
  }
}

/**
 * Update cube faces based on concept
 */
function updateCubeFaces(concept) {
  const mathObject = document.getElementById('mathObject');
  if (!mathObject) return;
  
  const faces = mathObject.querySelectorAll('.cube-face');
  const symbols = {
    geometry: ['π', '∑', '∫', '√', '∞', 'θ'],
    calculus: ['d', '∫', '∂', '∑', 'lim', '→'],
    algebra: ['x', 'y', 'z', 'a', 'b', 'c']
  };
  
  const conceptSymbols = symbols[concept] || symbols.geometry;
  
  faces.forEach((face, index) => {
    face.textContent = conceptSymbols[index % conceptSymbols.length];
  });
}

/**
 * Initialize testimonial carousel
 */
function initTestimonialCarousel() {
  const testimonialCards = document.querySelectorAll('.testimonial-card-new');
  const prevBtn = document.getElementById('prevTestimonial');
  const nextBtn = document.getElementById('nextTestimonial');
  const dots = document.querySelectorAll('.dot');
  let currentTestimonial = 0;
  let autoplayInterval;
  
  if (testimonialCards.length === 0) return;
  
  // Show a specific testimonial
  function showTestimonial(index) {
    testimonialCards.forEach(card => {
      card.classList.remove('active');
      card.style.display = 'none';
    });
    dots.forEach(dot => dot.classList.remove('active'));
    
    if (testimonialCards[index]) {
      testimonialCards[index].classList.add('active');
      testimonialCards[index].style.display = 'block';
    }
    
    if (dots[index]) {
      dots[index].classList.add('active');
    }
  }
  
  // Initialize next button
  if (nextBtn) {
    nextBtn.addEventListener('click', function() {
      currentTestimonial = (currentTestimonial + 1) % testimonialCards.length;
      showTestimonial(currentTestimonial);
      resetAutoplay();
    });
  }
  
  // Initialize previous button
  if (prevBtn) {
    prevBtn.addEventListener('click', function() {
      currentTestimonial = (currentTestimonial - 1 + testimonialCards.length) % testimonialCards.length;
      showTestimonial(currentTestimonial);
      resetAutoplay();
    });
  }
  
  // Initialize dots
  dots.forEach((dot, index) => {
    dot.addEventListener('click', function() {
      currentTestimonial = index;
      showTestimonial(currentTestimonial);
      resetAutoplay();
    });
  });
  
  // Start autoplay
  function startAutoplay() {
    autoplayInterval = setInterval(() => {
      currentTestimonial = (currentTestimonial + 1) % testimonialCards.length;
      showTestimonial(currentTestimonial);
    }, 5000);
  }
  
  // Reset autoplay
  function resetAutoplay() {
    clearInterval(autoplayInterval);
    startAutoplay();
  }
  
  // Initialize first testimonial
  showTestimonial(0);
  
  // Initialize autoplay
  startAutoplay();
}

/**
 * Initialize scroll animations
 */
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('aos-animate');
      }
    });
  }, observerOptions);
  
  document.querySelectorAll('[data-aos]').forEach(el => {
    observer.observe(el);
  });
  
  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

/**
 * Create particle system for hero section
 */
function createParticleSystem() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const particles = [];
  const particleCount = 50;
  
  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.radius = Math.random() * 2 + 1;
      this.opacity = Math.random() * 0.5 + 0.2;
    }
    
    update() {
      this.x += this.vx;
      this.y += this.vy;
      
      if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }
    
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(30, 64, 175, ${this.opacity})`;
      ctx.fill();
    }
  }
  
  // Create particles
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }
  
  // Animation loop
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach(particle => {
      particle.update();
      particle.draw();
    });
    
    // Draw connections
    particles.forEach((particle, i) => {
      particles.slice(i + 1).forEach(otherParticle => {
        const dx = particle.x - otherParticle.x;
        const dy = particle.y - otherParticle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 100) {
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(otherParticle.x, otherParticle.y);
          ctx.strokeStyle = `rgba(30, 64, 175, ${0.1 * (1 - distance / 100)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    });
    
    requestAnimationFrame(animate);
  }
  
  animate();
  
  // Handle window resize
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

// Add event listener for "Watch Demo" button
document.addEventListener('DOMContentLoaded', function() {
  const watchDemoBtn = document.getElementById('watchDemo');
  if (watchDemoBtn) {
    watchDemoBtn.addEventListener('click', function() {
      alert('Demo video will play here. This feature is coming soon!');
    });
  }
});
