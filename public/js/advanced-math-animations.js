// Advanced Math Animations using Three.js
document.addEventListener('DOMContentLoaded', () => {
  // Initialize 3D math animation
  initMathAnimation();
  
  // Initialize scroll animations
  initScrollAnimations();
});

// 3D Math Animation with Three.js
function initMathAnimation() {
  const container = document.getElementById('math-animation-container');
  if (!container) return;
  
  // Set up scene
  const scene = new THREE.Scene();
  
  // Set up camera
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.z = 5;
  
  // Set up renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  
  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  
  // Create group for all objects
  const group = new THREE.Group();
  scene.add(group);
  
  // Add ambient light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  // Add directional light
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);
  
  // Create mathematical objects
  createMathObjects(group);
  
  // Add mathematical formulas as 3D text
  addMathFormulas(group);
  
  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Rotate the entire group
    group.rotation.y += 0.005;
    group.rotation.x += 0.002;
    
    // Rotate individual objects
    group.children.forEach((child) => {
      if (child.userData.rotationSpeed) {
        child.rotation.x += child.userData.rotationSpeed.x;
        child.rotation.y += child.userData.rotationSpeed.y;
        child.rotation.z += child.userData.rotationSpeed.z;
      }
    });
    
    renderer.render(scene, camera);
  }
  
  // Start animation
  animate();
}

// Create mathematical 3D objects
function createMathObjects(group) {
  // Materials
  const materials = [
    new THREE.MeshPhongMaterial({ color: 0x4285F4, shininess: 100 }), // Blue
    new THREE.MeshPhongMaterial({ color: 0xEA4335, shininess: 100 }), // Red
    new THREE.MeshPhongMaterial({ color: 0xFBBC05, shininess: 100 }), // Yellow
    new THREE.MeshPhongMaterial({ color: 0x34A853, shininess: 100 }), // Green
    new THREE.MeshPhongMaterial({ color: 0x9C27B0, shininess: 100 })  // Purple
  ];
  
  // Create a sphere (representing a circle/sphere in 3D)
  const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
  const sphere = new THREE.Mesh(sphereGeometry, materials[0]);
  sphere.position.set(-2, 1, 0);
  sphere.userData.rotationSpeed = { x: 0.01, y: 0.01, z: 0 };
  group.add(sphere);
  
  // Create a cube
  const cubeGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const cube = new THREE.Mesh(cubeGeometry, materials[1]);
  cube.position.set(2, 1, 0);
  cube.userData.rotationSpeed = { x: 0.01, y: 0.01, z: 0.01 };
  group.add(cube);
  
  // Create a cone
  const coneGeometry = new THREE.ConeGeometry(0.5, 1, 32);
  const cone = new THREE.Mesh(coneGeometry, materials[2]);
  cone.position.set(0, -1.5, 0);
  cone.userData.rotationSpeed = { x: 0, y: 0.01, z: 0 };
  group.add(cone);
  
  // Create a torus (donut shape)
  const torusGeometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100);
  const torus = new THREE.Mesh(torusGeometry, materials[3]);
  torus.position.set(-2, -1, 0);
  torus.userData.rotationSpeed = { x: 0.01, y: 0.01, z: 0.01 };
  group.add(torus);
  
  // Create a tetrahedron
  const tetraGeometry = new THREE.TetrahedronGeometry(0.7);
  const tetrahedron = new THREE.Mesh(tetraGeometry, materials[4]);
  tetrahedron.position.set(2, -1, 0);
  tetrahedron.userData.rotationSpeed = { x: 0.01, y: 0, z: 0.01 };
  group.add(tetrahedron);
  
  // Create connecting lines between objects (representing mathematical relationships)
  createConnectionLines(group, [sphere, cube, cone, torus, tetrahedron]);
}

// Create lines connecting the mathematical objects
function createConnectionLines(group, objects) {
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
  
  // Connect objects with lines
  for (let i = 0; i < objects.length; i++) {
    const obj1 = objects[i];
    const obj2 = objects[(i + 1) % objects.length];
    
    const points = [obj1.position, obj2.position];
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);
  }
}

// Add 3D text for mathematical formulas
function addMathFormulas(group) {
  // This is a placeholder - Three.js doesn't have built-in text support
  // In a real implementation, you would use a library like troika-three-text
  // or create custom geometry for the text
  
  // For now, we'll add some simple placeholder objects
  const formulaGeometry = new THREE.PlaneGeometry(0.5, 0.2);
  const formulaMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffffff,
    transparent: true,
    opacity: 0.7
  });
  
  // Create several "formula" planes
  const positions = [
    { x: 0, y: 2, z: 0 },
    { x: -1.5, y: 0, z: 1 },
    { x: 1.5, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 }
  ];
  
  positions.forEach((pos) => {
    const formula = new THREE.Mesh(formulaGeometry, formulaMaterial);
    formula.position.set(pos.x, pos.y, pos.z);
    // Make it always face the camera
    formula.lookAt(0, 0, 5);
    group.add(formula);
  });
}

// Initialize scroll animations
function initScrollAnimations() {
  // Get all shapes
  const shapes = document.querySelectorAll('.math-shape');
  if (!shapes.length) return;
  
  // Create scroll observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      // If element is visible
      if (entry.isIntersecting) {
        entry.target.style.opacity = '0.7';
        entry.target.style.transform = 'scale(1)';
      } else {
        entry.target.style.opacity = '0';
        entry.target.style.transform = 'scale(0.5)';
      }
    });
  }, { threshold: 0.1 });
  
  // Observe all shapes
  shapes.forEach(shape => {
    observer.observe(shape);
  });
  
  // Add scroll event listener for parallax effect
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    
    // Apply parallax effect to shapes
    shapes.forEach((shape, index) => {
      const speed = 0.1 + (index * 0.05);
      const yPos = scrollY * speed;
      shape.style.transform = `translateY(${yPos}px) rotate(${yPos / 10}deg)`;
    });
    
    // Apply effect to hero content
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
      heroContent.style.transform = `translateY(${scrollY * 0.2}px)`;
    }
  });
}

// Function to create dynamic math equation particles
function createMathEquations() {
  const container = document.querySelector('.math-background');
  if (!container) return;
  
  const equations = [
    'E = mc²',
    'F = ma',
    'a² + b² = c²',
    '∫f(x)dx',
    'y = mx + b',
    'sin²θ + cos²θ = 1',
    'F = G(m₁m₂)/r²',
    'PV = nRT',
    'e^(iπ) + 1 = 0'
  ];
  
  // Create equation elements
  for (let i = 0; i < 15; i++) {
    const equation = document.createElement('div');
    equation.className = 'math-equation';
    equation.textContent = equations[Math.floor(Math.random() * equations.length)];
    
    // Random position
    equation.style.left = `${Math.random() * 100}%`;
    equation.style.top = `${Math.random() * 100}%`;
    
    // Random size
    const size = Math.random() * 1 + 0.5;
    equation.style.fontSize = `${size}rem`;
    
    // Random opacity
    equation.style.opacity = Math.random() * 0.5 + 0.1;
    
    // Add to container
    container.appendChild(equation);
    
    // Animate equation
    animateEquation(equation);
  }
}

// Animate a single equation element
function animateEquation(element) {
  // Initial position
  let x = parseFloat(element.style.left);
  let y = parseFloat(element.style.top);
  
  // Random movement
  const dx = (Math.random() - 0.5) * 0.1;
  const dy = (Math.random() - 0.5) * 0.1;
  
  // Animation function
  function animate() {
    // Update position
    x += dx;
    y += dy;
    
    // Check boundaries
    if (x < 0 || x > 100) x = Math.random() * 100;
    if (y < 0 || y > 100) y = Math.random() * 100;
    
    // Apply position
    element.style.left = `${x}%`;
    element.style.top = `${y}%`;
    
    // Continue animation
    requestAnimationFrame(animate);
  }
  
  // Start animation
  animate();
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
  initMathAnimation();
  initScrollAnimations();
  createMathEquations();
});
