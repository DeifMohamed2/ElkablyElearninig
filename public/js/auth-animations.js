/**
 * Authentication Pages Animations for Mr Mohrr7am
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize auth particles
  initAuthParticles();
  
  // Initialize floating elements
  initFloatingElements();
  
  // Add animation to links
  initAnimatedLinks();
  
  // Add form animations
  initFormAnimations();

  // Add subtle 3D tilt and glow to auth card
  initAuthCardTilt();

  // Initialize multi-step registration form
  initMultiStepForm();
});

/**
 * Initialize particles for auth pages
 */
function initAuthParticles() {
  const loginParticles = document.getElementById('auth-particles');
  const registerParticles = document.getElementById('auth-particles-register');
  
  if (loginParticles) {
    createParticles(loginParticles);
  }
  
  if (registerParticles) {
    createParticles(registerParticles);
  }
}

/**
 * Create particles in the given container
 * @param {HTMLElement} container - The container element
 */
function createParticles(container) {
  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  container.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  
  // Resize handler
  window.addEventListener('resize', () => {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  });
  
  // Particle class
  class Particle {
    constructor() {
      this.reset();
    }
    
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 3 + 1;
      this.speedX = (Math.random() - 0.5) * 0.5;
      this.speedY = (Math.random() - 0.5) * 0.5;
      this.color = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1})`;
    }
    
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      
      if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
        this.reset();
      }
    }
    
    draw() {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Create particles
  const particles = [];
  const particleCount = Math.min(50, Math.floor((canvas.width * canvas.height) / 15000));
  
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
    
    requestAnimationFrame(animate);
  }
  
  animate();
}

/**
 * Initialize floating elements
 */
function initFloatingElements() {
  const floatingElements = document.querySelectorAll('.floating-element');
  
  floatingElements.forEach((element, index) => {
    // Get animation parameters from data attributes or use defaults
    const amplitude = element.dataset.floatAmplitude || 15;
    const period = element.dataset.floatPeriod || 3;
    const phase = index * 0.5; // Stagger phases for varied motion
    
    // Apply floating animation
    animateFloating(element, parseFloat(amplitude), parseFloat(period), phase);
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
  let startTime = Date.now() / 1000;
  startTime -= phase; // Apply phase shift
  
  function updatePosition() {
    const elapsed = Date.now() / 1000 - startTime;
    const yPos = amplitude * Math.sin(2 * Math.PI * elapsed / period);
    const rotation = amplitude * 0.05 * Math.sin(2 * Math.PI * elapsed / (period * 1.5));
    
    element.style.transform = `translateY(${yPos}px) rotate(${rotation}deg)`;
    
    requestAnimationFrame(updatePosition);
  }
  
  updatePosition();
}

/**
 * Initialize multi-step registration form
 */
function initMultiStepForm() {
  const form = document.querySelector('.auth-form');
  if (!form || !form.querySelector('.form-step')) return;

  const steps = form.querySelectorAll('.form-step');
  const stepItems = document.querySelectorAll('.step-item');
  const nextBtn = document.getElementById('nextStep');
  const prevBtn = document.getElementById('prevStep');
  const submitBtn = document.getElementById('submitBtn');
  
  let currentStep = 1;
  const totalSteps = steps.length;

  // Show current step
  function showStep(step) {
    steps.forEach((s, index) => {
      s.classList.toggle('active', index + 1 === step);
    });
    
    stepItems.forEach((item, index) => {
      item.classList.toggle('active', index + 1 === step);
    });

    // Update navigation buttons
    prevBtn.style.display = step > 1 ? 'flex' : 'none';
    nextBtn.style.display = step < totalSteps ? 'flex' : 'none';
    submitBtn.style.display = step === totalSteps ? 'flex' : 'none';
  }

  // Validate current step
  function validateStep(step) {
    const currentStepElement = steps[step - 1];
    const inputs = currentStepElement.querySelectorAll('input[required], select[required]');
    let isValid = true;

    inputs.forEach(input => {
      if (!input.value.trim()) {
        input.classList.add('is-invalid');
        isValid = false;
      } else {
        input.classList.remove('is-invalid');
      }
    });

    return isValid;
  }

  // Next step
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        currentStep++;
        showStep(currentStep);
        
        // Add smooth transition
        const currentStepElement = steps[currentStep - 1];
        currentStepElement.style.opacity = '0';
        currentStepElement.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
          currentStepElement.style.opacity = '1';
          currentStepElement.style.transform = 'translateY(0)';
        }, 50);
      }
    });
  }

  // Previous step
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      currentStep--;
      showStep(currentStep);
      
      // Add smooth transition
      const currentStepElement = steps[currentStep - 1];
      currentStepElement.style.opacity = '0';
      currentStepElement.style.transform = 'translateY(-20px)';
      
      setTimeout(() => {
        currentStepElement.style.opacity = '1';
        currentStepElement.style.transform = 'translateY(0)';
      }, 50);
    });
  }

  // Real-time validation
  const allInputs = form.querySelectorAll('input, select');
  allInputs.forEach(input => {
    input.addEventListener('blur', () => {
      if (input.hasAttribute('required') && !input.value.trim()) {
        input.classList.add('is-invalid');
      } else {
        input.classList.remove('is-invalid');
      }
    });

    input.addEventListener('input', () => {
      if (input.classList.contains('is-invalid') && input.value.trim()) {
        input.classList.remove('is-invalid');
      }
    });
  });

  // Initialize first step
  showStep(1);
}

/**
 * Initialize animated links
 */
function initAnimatedLinks() {
  const links = document.querySelectorAll('.animated-link');
  
  links.forEach(link => {
    link.addEventListener('mouseenter', () => {
      link.classList.add('pulse');
    });
    
    link.addEventListener('animationend', () => {
      link.classList.remove('pulse');
    });
  });
}

/**
 * Initialize form animations
 */
function initFormAnimations() {
  const inputs = document.querySelectorAll('.form-control');
  
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      input.parentElement.classList.add('input-focused');
    });
    
    input.addEventListener('blur', () => {
      input.parentElement.classList.remove('input-focused');
    });
  });
}


/**
 * Add subtle 3D tilt with mouse position glow to .auth-card
 */
function initAuthCardTilt() {
  const card = document.querySelector('.auth-card');
  if (!card) return;

  card.setAttribute('data-tilt-active', 'true');

  // Inject glow edge element once
  if (!card.querySelector('.glow-edge')) {
    const glow = document.createElement('div');
    glow.className = 'glow-edge';
    card.appendChild(glow);
  }

  const maxRotate = 6; // degrees
  const damp = 24; // for easing revert

  function onMove(e) {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const x = (e.clientX - cx) / (rect.width / 2);
    const y = (e.clientY - cy) / (rect.height / 2);
    const rotX = Math.max(-1, Math.min(1, y)) * -maxRotate;
    const rotY = Math.max(-1, Math.min(1, x)) * maxRotate;

    card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;

    // Update glow center
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mx', `${mx}%`);
    card.style.setProperty('--my', `${my}%`);
  }

  function onLeave() {
    // Smoothly reset
    card.style.transition = 'transform 180ms ease-out';
    card.style.transform = 'rotateX(0deg) rotateY(0deg)';
    setTimeout(() => { card.style.transition = ''; }, damp * 8);
  }

  card.addEventListener('mousemove', onMove);
  card.addEventListener('mouseleave', onLeave);
}
