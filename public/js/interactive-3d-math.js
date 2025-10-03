/**
 * Interactive 3D Math Visualizations
 * This file handles the creation and animation of 3D mathematical objects
 * using Three.js for Mr Mohrr7am educational platform
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize 3D scenes
  initMath3DScene();
  initHeroCanvas();
});

/**
 * Initialize the main 3D math scene in the hero section
 */
function initMath3DScene() {
  // Support both IDs: math3DScene and math-3d-scene
  const container = document.getElementById('math3DScene') || document.querySelector('.math-3d-scene');
  if (!container) return;

  // Set up scene, camera, and renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  
  // Add ambient and directional light
  const ambientLight = new THREE.AmbientLight(0x404040, 2);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);
  
  // Create mathematical objects
  const objects = createMathObjects();
  objects.forEach(obj => scene.add(obj));
  
  // Position camera
  camera.position.z = 5;
  
  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  
  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Rotate all objects
    objects.forEach((obj, index) => {
      obj.rotation.x += 0.005 * (index % 2 === 0 ? 1 : -1);
      obj.rotation.y += 0.01 * (index % 3 === 0 ? 1 : -1);
    });
    
    renderer.render(scene, camera);
  }
  
  animate();
  
  // Make the scene interactive with mouse movement
  container.addEventListener('mousemove', (event) => {
    const rect = container.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;
    
    // Tilt the entire scene based on mouse position
    scene.rotation.y = mouseX * 0.3;
    scene.rotation.x = mouseY * 0.3;
  });
  
  // Add touch support for mobile
  container.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const touch = event.touches[0];
    const mouseX = ((touch.clientX - rect.left) / container.clientWidth) * 2 - 1;
    const mouseY = -((touch.clientY - rect.top) / container.clientHeight) * 2 + 1;
    
    scene.rotation.y = mouseX * 0.3;
    scene.rotation.x = mouseY * 0.3;
  }, { passive: false });
}

/**
 * Create various mathematical 3D objects
 * @returns {Array} Array of Three.js objects
 */
function createMathObjects() {
  const objects = [];
  
  // Create a torus knot (representing complex mathematical functions)
  const torusKnotGeometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 16, 2, 3);
  const torusKnotMaterial = new THREE.MeshPhongMaterial({
    color: 0x00c6ff,
    shininess: 100,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  });
  const torusKnot = new THREE.Mesh(torusKnotGeometry, torusKnotMaterial);
  torusKnot.scale.set(0.8, 0.8, 0.8);
  objects.push(torusKnot);
  
  // Create a dodecahedron (representing geometric solids)
  const dodecahedronGeometry = new THREE.DodecahedronGeometry(0.7);
  const dodecahedronMaterial = new THREE.MeshPhongMaterial({
    color: 0xff4e50,
    shininess: 100,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  });
  const dodecahedron = new THREE.Mesh(dodecahedronGeometry, dodecahedronMaterial);
  dodecahedron.position.set(2, 0, 0);
  objects.push(dodecahedron);
  
  // Create a parametric surface (representing mathematical functions)
  function klein(u, v, target) {
    u *= Math.PI;
    v *= 2 * Math.PI;
    
    u = u * 2;
    let x, y, z;
    if (u < Math.PI) {
      x = 3 * Math.cos(u) * (1 + Math.sin(u)) + (2 * (1 - Math.cos(u) / 2)) * Math.cos(u) * Math.cos(v);
      y = 8 * Math.sin(u) + (2 * (1 - Math.cos(u) / 2)) * Math.sin(u) * Math.cos(v);
    } else {
      x = 3 * Math.cos(u) * (1 + Math.sin(u)) + (2 * (1 - Math.cos(u) / 2)) * Math.cos(v + Math.PI);
      y = 8 * Math.sin(u);
    }
    
    z = (2 * (1 - Math.cos(u) / 2)) * Math.sin(v);
    
    target.set(x, y, z).multiplyScalar(0.25);
  }
  
  const parametricGeometry = new THREE.ParametricGeometry(klein, 25, 25);
  const parametricMaterial = new THREE.MeshPhongMaterial({
    color: 0x4CAF50,
    shininess: 100,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    wireframe: false
  });
  const parametricSurface = new THREE.Mesh(parametricGeometry, parametricMaterial);
  parametricSurface.position.set(-2, 0, 0);
  parametricSurface.scale.set(0.8, 0.8, 0.8);
  objects.push(parametricSurface);
  
  // Create a 3D graph (representing coordinate systems)
  const graphGroup = new THREE.Group();
  
  // X, Y, Z axes
  const axisLength = 1.5;
  const axisWidth = 0.02;
  
  // X axis (red)
  const xAxisGeometry = new THREE.CylinderGeometry(axisWidth, axisWidth, axisLength * 2, 32);
  const xAxisMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const xAxis = new THREE.Mesh(xAxisGeometry, xAxisMaterial);
  xAxis.rotation.z = Math.PI / 2;
  graphGroup.add(xAxis);
  
  // Y axis (green)
  const yAxisGeometry = new THREE.CylinderGeometry(axisWidth, axisWidth, axisLength * 2, 32);
  const yAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const yAxis = new THREE.Mesh(yAxisGeometry, yAxisMaterial);
  graphGroup.add(yAxis);
  
  // Z axis (blue)
  const zAxisGeometry = new THREE.CylinderGeometry(axisWidth, axisWidth, axisLength * 2, 32);
  const zAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
  const zAxis = new THREE.Mesh(zAxisGeometry, zAxisMaterial);
  zAxis.rotation.x = Math.PI / 2;
  graphGroup.add(zAxis);
  
  // Add a function plot (z = sin(x) * cos(y))
  const resolution = 20;
  const size = 1;
  
  const plotGeometry = new THREE.BufferGeometry();
  const vertices = [];
  const colors = [];
  
  for (let i = 0; i <= resolution; i++) {
    const x = (i / resolution - 0.5) * size * 2;
    
    for (let j = 0; j <= resolution; j++) {
      const y = (j / resolution - 0.5) * size * 2;
      const z = Math.sin(x * 5) * Math.cos(y * 5) * 0.5;
      
      vertices.push(x, z, y); // Note: y and z swapped for better visualization
      
      // Add colors based on height
      const color = new THREE.Color();
      color.setHSL(0.7 + z * 0.4, 1, 0.5);
      colors.push(color.r, color.g, color.b);
    }
  }
  
  // Create faces (triangles)
  const indices = [];
  const verticesPerRow = resolution + 1;
  
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const a = i * verticesPerRow + j;
      const b = i * verticesPerRow + j + 1;
      const c = (i + 1) * verticesPerRow + j;
      const d = (i + 1) * verticesPerRow + j + 1;
      
      // Two triangles per square
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }
  
  plotGeometry.setIndex(indices);
  plotGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  plotGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  const plotMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    wireframe: false,
    transparent: true,
    opacity: 0.8
  });
  
  const functionPlot = new THREE.Mesh(plotGeometry, plotMaterial);
  graphGroup.add(functionPlot);
  
  graphGroup.position.set(0, -2, 0);
  graphGroup.scale.set(0.8, 0.8, 0.8);
  objects.push(graphGroup);
  
  return objects;
}

/**
 * Initialize the hero canvas with animated particles and waves
 */
function initHeroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Set canvas dimensions
  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Create particles
  const particles = [];
  const particleCount = 100;
  
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 2 + 1,
      color: `rgba(${Math.floor(Math.random() * 100 + 155)}, ${Math.floor(Math.random() * 100 + 155)}, 255, ${Math.random() * 0.5 + 0.2})`,
      speedX: Math.random() * 2 - 1,
      speedY: Math.random() * 2 - 1
    });
  }
  
  // Wave parameters
  const waves = [
    { amplitude: 20, frequency: 0.02, speed: 0.05, color: 'rgba(0, 198, 255, 0.2)', phase: 0 },
    { amplitude: 15, frequency: 0.03, speed: 0.03, color: 'rgba(0, 114, 255, 0.2)', phase: 2 },
    { amplitude: 10, frequency: 0.01, speed: 0.02, color: 'rgba(76, 175, 80, 0.2)', phase: 4 }
  ];
  
  // Animation loop
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw waves
    waves.forEach(wave => {
      drawWave(wave);
      wave.phase += wave.speed;
    });
    
    // Draw and update particles
    particles.forEach(particle => {
      drawParticle(particle);
      updateParticle(particle);
    });
    
    requestAnimationFrame(animate);
  }
  
  function drawWave(wave) {
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    
    for (let x = 0; x < canvas.width; x++) {
      const y = Math.sin(x * wave.frequency + wave.phase) * wave.amplitude + canvas.height / 2;
      ctx.lineTo(x, y);
    }
    
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    
    ctx.fillStyle = wave.color;
    ctx.fill();
  }
  
  function drawParticle(particle) {
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fillStyle = particle.color;
    ctx.fill();
  }
  
  function updateParticle(particle) {
    particle.x += particle.speedX;
    particle.y += particle.speedY;
    
    // Bounce off edges
    if (particle.x < 0 || particle.x > canvas.width) {
      particle.speedX *= -1;
    }
    
    if (particle.y < 0 || particle.y > canvas.height) {
      particle.speedY *= -1;
    }
  }
  
  animate();
}
