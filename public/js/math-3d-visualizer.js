/**
 * Math 3D Visualizer
 * A simplified version of the 3D math visualizations that ensures compatibility
 * with the existing structure of the index.ejs file
 */

document.addEventListener('DOMContentLoaded', function() {
  console.log("Math 3D Visualizer: Initializing...");
  initializeMath3DScene();
});

/**
 * Initialize the 3D math scene
 */
function initializeMath3DScene() {
  // Check for Three.js
  if (typeof THREE === 'undefined') {
    console.error("Math 3D Visualizer: Three.js not loaded");
    return;
  }
  
  // Find the container element (try different possible selectors)
  const container = document.getElementById('math3DScene') || 
                   document.querySelector('.math-3d-scene') || 
                   document.querySelector('[id*="math"][id*="scene"]');
  
  if (!container) {
    console.error("Math 3D Visualizer: No container element found");
    return;
  }
  
  console.log("Math 3D Visualizer: Container found", container);
  
  // Check if a renderer is already initialized
  if (container.querySelector('canvas')) {
    console.log("Math 3D Visualizer: Scene already initialized");
    return;
  }
  
  // Set up the scene, camera, and renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,
    powerPreference: 'high-performance'
  });
  
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);
  
  // Add lights
  const ambientLight = new THREE.AmbientLight(0x404040, 2);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);
  
  // Create a group to hold all objects
  const group = new THREE.Group();
  scene.add(group);
  
  // Create a simple mathematical object - a torus knot
  const torusKnotGeometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 16, 2, 3);
  const torusKnotMaterial = new THREE.MeshPhongMaterial({
    color: 0x00c6ff,
    shininess: 100,
    transparent: true,
    opacity: 0.9
  });
  const torusKnot = new THREE.Mesh(torusKnotGeometry, torusKnotMaterial);
  torusKnot.scale.set(0.8, 0.8, 0.8);
  group.add(torusKnot);
  
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
    
    // Rotate the group
    group.rotation.x += 0.005;
    group.rotation.y += 0.01;
    
    renderer.render(scene, camera);
  }
  
  animate();
  
  // Make the scene interactive with mouse movement
  container.addEventListener('mousemove', (event) => {
    const rect = container.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;
    
    // Tilt the group based on mouse position
    group.rotation.y = mouseX * 0.5;
    group.rotation.x = mouseY * 0.5;
  });
  
  // Add touch support for mobile
  container.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const touch = event.touches[0];
    const mouseX = ((touch.clientX - rect.left) / container.clientWidth) * 2 - 1;
    const mouseY = -((touch.clientY - rect.top) / container.clientHeight) * 2 + 1;
    
    group.rotation.y = mouseX * 0.5;
    group.rotation.x = mouseY * 0.5;
  }, { passive: false });
  
  console.log("Math 3D Visualizer: Scene initialized successfully");
}
