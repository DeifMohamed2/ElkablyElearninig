// Interactive Math Background Animations
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on a page with math-background
  const mathBackground = document.querySelector('.math-background');
  if (!mathBackground) return;

  // Create interactive particles
  createMathParticles(mathBackground);
  
  // If on auth page, add special animations
  if (document.querySelector('.math-auth-bg')) {
    initAuthPageAnimations();
  }
});

// Create interactive math particles
function createMathParticles(container) {
  // Math symbols and numbers for particles
  const mathSymbols = ['+', '-', '×', '÷', '=', '<', '>', '±', '∑', '∫', 'π', '√', '∞'];
  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const allSymbols = [...mathSymbols, ...numbers];
  
  // Create canvas for particles
  const canvas = document.createElement('canvas');
  canvas.className = 'math-particles-canvas';
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';
  
  container.appendChild(canvas);
  
  // Set canvas size
  const resizeCanvas = () => {
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
  };
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Get canvas context
  const ctx = canvas.getContext('2d');
  
  // Particle class
  class MathParticle {
    constructor() {
      this.reset();
    }
    
    reset() {
      // Random position
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      
      // Random size
      this.size = Math.random() * 20 + 10;
      
      // Random speed
      this.speedX = Math.random() * 1 - 0.5;
      this.speedY = Math.random() * 1 - 0.5;
      
      // Random symbol
      this.symbol = allSymbols[Math.floor(Math.random() * allSymbols.length)];
      
      // Random opacity
      this.opacity = Math.random() * 0.5 + 0.1;
      
      // Random rotation
      this.rotation = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() * 0.02) - 0.01;
    }
    
    update() {
      // Move particle
      this.x += this.speedX;
      this.y += this.speedY;
      
      // Rotate particle
      this.rotation += this.rotationSpeed;
      
      // Check boundaries
      if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
        this.reset();
      }
    }
    
    draw() {
      ctx.save();
      
      // Translate to position
      ctx.translate(this.x, this.y);
      
      // Rotate
      ctx.rotate(this.rotation);
      
      // Draw symbol
      ctx.font = `${this.size}px 'Courier New', monospace`;
      ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.symbol, 0, 0);
      
      ctx.restore();
    }
  }
  
  // Create particles
  const particles = [];
  const particleCount = Math.min(50, Math.floor((canvas.width * canvas.height) / 20000));
  
  for (let i = 0; i < particleCount; i++) {
    particles.push(new MathParticle());
  }
  
  // Mouse interaction
  let mouse = {
    x: null,
    y: null,
    radius: 100
  };
  
  container.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  
  container.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });
  
  // Animation loop
  function animate() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw particles
    particles.forEach(particle => {
      particle.update();
      
      // Mouse interaction
      if (mouse.x !== null && mouse.y !== null) {
        const dx = particle.x - mouse.x;
        const dy = particle.y - mouse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < mouse.radius) {
          const force = (mouse.radius - distance) / mouse.radius;
          const angle = Math.atan2(dy, dx);
          
          particle.x += Math.cos(angle) * force * 2;
          particle.y += Math.sin(angle) * force * 2;
        }
      }
      
      particle.draw();
    });
    
    requestAnimationFrame(animate);
  }
  
  // Start animation
  animate();
}

// Special animations for auth pages
function initAuthPageAnimations() {
  // Floating math symbols around the form
  const formContainer = document.querySelector('.auth-card');
  if (!formContainer) return;
  
  // Create floating symbols
  const symbolsCount = 10;
  const symbols = ['+', '-', '×', '÷', '=', 'π', '√'];
  
  for (let i = 0; i < symbolsCount; i++) {
    const symbol = document.createElement('div');
    symbol.className = 'floating-math-symbol';
    symbol.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    
    // Random position around the form
    const angle = (i / symbolsCount) * Math.PI * 2;
    const distance = 100 + Math.random() * 100;
    
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    
    // Apply styles
    symbol.style.position = 'absolute';
    symbol.style.left = `calc(50% + ${x}px)`;
    symbol.style.top = `calc(50% + ${y}px)`;
    symbol.style.fontSize = `${Math.random() * 20 + 20}px`;
    symbol.style.color = 'rgba(255, 255, 255, 0.3)';
    symbol.style.fontFamily = "'Courier New', monospace";
    symbol.style.fontWeight = 'bold';
    symbol.style.pointerEvents = 'none';
    symbol.style.zIndex = '0';
    symbol.style.animation = `float ${Math.random() * 5 + 5}s ease-in-out infinite alternate`;
    
    document.querySelector('.math-auth-bg').appendChild(symbol);
  }
  
  // Add pulsing effect to form inputs
  const inputs = document.querySelectorAll('.auth-form input');
  
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      const inputGroup = input.closest('.input-group');
      if (inputGroup) {
        inputGroup.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
        inputGroup.style.transform = 'scale(1.02)';
        inputGroup.style.boxShadow = '0 0 15px rgba(52, 152, 219, 0.5)';
      }
    });
    
    input.addEventListener('blur', () => {
      const inputGroup = input.closest('.input-group');
      if (inputGroup) {
        inputGroup.style.transform = 'scale(1)';
        inputGroup.style.boxShadow = 'none';
      }
    });
  });
}
