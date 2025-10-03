// Interactive Elements for the Landing Page
document.addEventListener('DOMContentLoaded', () => {
  // Initialize testimonials slider
  initTestimonialsSlider();
  
  // Initialize tilt effect on feature cards
  initTiltEffect();
  
  // Initialize scroll animations
  initScrollAnimations();
  
  // Initialize demo section particles
  initDemoParticles();
});

// Testimonials Slider
function initTestimonialsSlider() {
  const slider = document.getElementById('testimonials-slider');
  if (!slider) return;
  
  const dots = document.querySelectorAll('.testimonial-dot');
  const prevBtn = document.getElementById('prev-testimonial');
  const nextBtn = document.getElementById('next-testimonial');
  const testimonials = slider.querySelectorAll('.testimonial-card-modern');
  
  let currentIndex = 0;
  const totalTestimonials = testimonials.length;
  
  // Set up click events for dots
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      goToTestimonial(index);
    });
  });
  
  // Set up click events for navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      goToTestimonial(currentIndex - 1);
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      goToTestimonial(currentIndex + 1);
    });
  }
  
  // Function to navigate to a specific testimonial
  function goToTestimonial(index) {
    // Handle wrap-around
    if (index < 0) {
      index = totalTestimonials - 1;
    } else if (index >= totalTestimonials) {
      index = 0;
    }
    
    // Update current index
    currentIndex = index;
    
    // Calculate scroll position
    const testimonial = testimonials[index];
    const scrollLeft = testimonial.offsetLeft - (slider.clientWidth - testimonial.clientWidth) / 2;
    
    // Scroll to the testimonial
    slider.scrollTo({
      left: scrollLeft,
      behavior: 'smooth'
    });
    
    // Update active dot
    dots.forEach((dot, i) => {
      if (i === index) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }
  
  // Handle scroll events to update active dot
  slider.addEventListener('scroll', () => {
    const scrollPosition = slider.scrollLeft;
    
    // Find the testimonial closest to the center of the viewport
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    testimonials.forEach((testimonial, index) => {
      const testimonialCenter = testimonial.offsetLeft + testimonial.clientWidth / 2;
      const sliderCenter = scrollPosition + slider.clientWidth / 2;
      const distance = Math.abs(testimonialCenter - sliderCenter);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    // Update current index and active dot if needed
    if (closestIndex !== currentIndex) {
      currentIndex = closestIndex;
      
      dots.forEach((dot, i) => {
        if (i === currentIndex) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
  });
  
  // Auto-advance testimonials every 5 seconds
  setInterval(() => {
    if (!document.hidden) {
      goToTestimonial(currentIndex + 1);
    }
  }, 5000);
}

// Tilt Effect for Feature Cards
function initTiltEffect() {
  const cards = document.querySelectorAll('[data-tilt]');
  
  cards.forEach(card => {
    const maxTilt = card.getAttribute('data-tilt-max') || 5;
    
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const tiltX = ((y - centerY) / centerY) * maxTilt;
      const tiltY = ((centerX - x) / centerX) * maxTilt;
      
      card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.05, 1.05, 1.05)`;
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
    });
  });
}

// Scroll Animations
function initScrollAnimations() {
  const sections = document.querySelectorAll('section');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('section-visible');
      }
    });
  }, { threshold: 0.1 });
  
  sections.forEach(section => {
    observer.observe(section);
    section.classList.add('section-animated');
  });
  
  // Animate shapes on scroll
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    const shapes = document.querySelectorAll('.math-shape, .floating-shape, .testimonial-shape');
    
    shapes.forEach((shape, index) => {
      const speed = 0.05 + (index * 0.01);
      const yPos = scrollY * speed;
      const rotation = scrollY * 0.02 * (index % 2 === 0 ? 1 : -1);
      
      shape.style.transform = `translateY(${yPos}px) rotate(${rotation}deg)`;
    });
  });
}

// Demo Section Particles
function initDemoParticles() {
  const container = document.getElementById('demo-particles');
  if (!container) return;
  
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
  const particleCount = Math.min(100, Math.floor((canvas.width * canvas.height) / 10000));
  
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
