// Math Bubble Animations with Equations
document.addEventListener('DOMContentLoaded', () => {
  // Math equations to display in bubbles
  const mathEquations = [
    'E = mc²',
    'a² + b² = c²',
    'F = G(m₁m₂)/r²',
    'πr²',
    '∫f(x)dx',
    'sin²θ + cos²θ = 1',
    'y = mx + b',
    'x = (-b ± √(b² - 4ac))/2a',
    '∑n²',
    'log₁₀(x)',
    '2 + 2 = 4',
    '3 × 4 = 12',
    '10 ÷ 2 = 5',
    'x + 5 = 9',
    '2x = 10',
    '3x + 2 = 11',
    'x² = 16',
    '√25 = 5'
  ];

  // Create bubbles with equations
  function createMathBubbles() {
    const mathBackground = document.querySelector('.math-background');
    if (!mathBackground) return;
    
    // Clear existing bubbles
    mathBackground.innerHTML = '';
    
    // Create 20 bubbles with random equations
    for (let i = 0; i < 20; i++) {
      createBubble(mathBackground);
    }
    
    // Create bubbles periodically
    setInterval(() => {
      if (document.querySelector('.math-background')) {
        createBubble(mathBackground);
      }
    }, 3000);
  }
  
  // Create a single bubble with equation
  function createBubble(container) {
    // Create bubble element
    const bubble = document.createElement('div');
    bubble.className = 'math-bubble';
    
    // Random equation
    const equation = mathEquations[Math.floor(Math.random() * mathEquations.length)];
    bubble.textContent = equation;
    
    // Random position, size, and animation duration
    const size = Math.floor(Math.random() * 60) + 40; // 40-100px
    const posX = Math.random() * 100; // 0-100%
    const delay = Math.random() * 2; // 0-2s
    const duration = Math.random() * 10 + 10; // 10-20s
    const opacity = Math.random() * 0.4 + 0.1; // 0.1-0.5
    
    // Apply styles
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${posX}%`;
    bubble.style.bottom = '-100px';
    bubble.style.animationDelay = `${delay}s`;
    bubble.style.animationDuration = `${duration}s`;
    bubble.style.opacity = opacity;
    
    // Add to container
    container.appendChild(bubble);
    
    // Remove bubble after animation completes
    setTimeout(() => {
      if (bubble && bubble.parentNode) {
        bubble.parentNode.removeChild(bubble);
      }
    }, (duration + delay) * 1000);
  }

  // Typing animation for math equations
  function initTypingAnimation() {
    const typingContainer = document.querySelector('.typing-text');
    if (!typingContainer) return;
    
    const mathEquations = [
      'x² + y² = r²',
      '∫(sin x)dx = -cos x + C',
      'lim(x→∞) (1 + 1/x)^x = e',
      'f\'(x) = lim(h→0) [f(x+h) - f(x)]/h',
      'a² + b² = c²',
      'E = mc²',
      '1 + 1 = 2',
      'x + 5 = 10 → x = 5',
      '2x - 3 = 7 → x = 5'
    ];
    
    let currentIndex = 0;
    
    function typeNextEquation() {
      const equation = mathEquations[currentIndex];
      
      // Clear previous text
      typingContainer.textContent = '';
      
      // Type the equation character by character
      let charIndex = 0;
      const typeInterval = setInterval(() => {
        if (charIndex < equation.length) {
          typingContainer.textContent += equation[charIndex];
          charIndex++;
        } else {
          clearInterval(typeInterval);
          
          // Wait before typing the next equation
          setTimeout(() => {
            currentIndex = (currentIndex + 1) % mathEquations.length;
            typeNextEquation();
          }, 3000);
        }
      }, 100);
    }
    
    // Start typing animation
    typeNextEquation();
  }

  // Initialize animations
  createMathBubbles();
  initTypingAnimation();
});

// 3D Math Visualization with Three.js
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on the homepage
  const heroSection = document.querySelector('.hero-section');
  if (!heroSection) return;
  
  // Create container for 3D visualization
  const container = document.createElement('div');
  container.className = 'three-math-container';
  heroSection.appendChild(container);
  
  // Scene setup
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  
  const renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  
  // Add responsive resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  // Create 3D math objects
  const objects = [];
  const mathSymbols = [
    { shape: 'cube', color: 0x3498db, size: 1 },
    { shape: 'sphere', color: 0x2ecc71, size: 0.7 },
    { shape: 'cone', color: 0xe74c3c, size: 0.8 },
    { shape: 'cylinder', color: 0xf1c40f, size: 0.6 },
    { shape: 'torus', color: 0x9b59b6, size: 0.5 }
  ];
  
  // Create objects
  mathSymbols.forEach((symbol, index) => {
    let geometry, material, mesh;
    
    // Create different shapes
    switch(symbol.shape) {
      case 'cube':
        geometry = new THREE.BoxGeometry(symbol.size, symbol.size, symbol.size);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(symbol.size, 32, 32);
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(symbol.size, symbol.size * 2, 32);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(symbol.size, symbol.size, symbol.size * 2, 32);
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(symbol.size, symbol.size / 3, 16, 100);
        break;
    }
    
    // Create material with wireframe
    material = new THREE.MeshBasicMaterial({
      color: symbol.color,
      wireframe: true
    });
    
    // Create mesh
    mesh = new THREE.Mesh(geometry, material);
    
    // Position in 3D space
    const angle = (index / mathSymbols.length) * Math.PI * 2;
    const radius = 5;
    mesh.position.x = Math.cos(angle) * radius;
    mesh.position.y = Math.sin(angle) * radius / 2;
    mesh.position.z = -5 - index;
    
    // Add to scene and objects array
    scene.add(mesh);
    objects.push({
      mesh,
      rotationSpeed: {
        x: 0.01 + Math.random() * 0.01,
        y: 0.01 + Math.random() * 0.01,
        z: 0.01 + Math.random() * 0.01
      },
      floatSpeed: 0.01 + Math.random() * 0.01,
      floatOffset: Math.random() * Math.PI * 2
    });
  });
  
  // Position camera
  camera.position.z = 10;
  
  // Animation loop
  let time = 0;
  function animate() {
    requestAnimationFrame(animate);
    
    time += 0.01;
    
    // Animate each object
    objects.forEach(obj => {
      // Rotation
      obj.mesh.rotation.x += obj.rotationSpeed.x;
      obj.mesh.rotation.y += obj.rotationSpeed.y;
      obj.mesh.rotation.z += obj.rotationSpeed.z;
      
      // Floating motion
      obj.mesh.position.y += Math.sin(time + obj.floatOffset) * obj.floatSpeed / 10;
    });
    
    renderer.render(scene, camera);
  }
  
  // Start animation
  animate();
});
