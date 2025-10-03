document.addEventListener('DOMContentLoaded', function () {
  // Theme management is now handled by theme-manager.js
  // Removed duplicate theme toggle logic to prevent conflicts

  // Initialize math background animation if on landing page
  if (document.querySelector('.math-background')) {
    createMathBackground();
  }

  // Create math formulas background
  function createMathBackground() {
    const mathBackground = document.querySelector('.math-background');
    const formulas = [
      'E = mc²',
      'F = ma',
      'a² + b² = c²',
      'x = (-b ± √(b² - 4ac)) / 2a',
      '∫f(x)dx',
      '∑(n=1 to ∞) 1/n²',
      'sin²θ + cos²θ = 1',
      'e^(iπ) + 1 = 0',
      'lim(x→∞) (1 + 1/x)^x = e',
      'P(A|B) = P(B|A)P(A)/P(B)',
      '∇ × E = -∂B/∂t',
      "f(x) = f(a) + f'(a)(x-a) + ...",
      'dy/dx = lim(h→0) [f(x+h) - f(x)]/h',
      'z = x + iy',
      '∮ E·dl = -dΦB/dt',
    ];

    // Create 50 random formulas
    for (let i = 0; i < 50; i++) {
      const formula = document.createElement('div');
      formula.classList.add('math-formula');
      formula.textContent =
        formulas[Math.floor(Math.random() * formulas.length)];

      // Random position
      formula.style.left = `${Math.random() * 100}%`;
      formula.style.top = `${Math.random() * 100}%`;

      // Random size
      const size = Math.random() * 1.5 + 0.8;
      formula.style.fontSize = `${size}rem`;

      // Random rotation
      const rotation = Math.random() * 360;
      formula.style.transform = `rotate(${rotation}deg)`;

      // Random opacity
      formula.style.opacity = Math.random() * 0.2 + 0.05;

      mathBackground.appendChild(formula);
    }

    // Animate formulas
    animateFormulas();
  }

  // Animate math formulas
  function animateFormulas() {
    const formulas = document.querySelectorAll('.math-formula');

    formulas.forEach((formula) => {
      // Random animation duration
      const duration = Math.random() * 30 + 20;
      formula.style.transition = `transform ${duration}s linear, opacity 1s ease-in-out`;

      setInterval(() => {
        // Random movement
        const x = Math.random() * 20 - 10;
        const y = Math.random() * 20 - 10;
        const rotation = Math.random() * 20 - 10;

        formula.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;

        // Random opacity change
        formula.style.opacity = Math.random() * 0.2 + 0.05;
      }, duration * 1000);
    });
  }

  // Initialize scroll animations
  initScrollAnimations();

  // Scroll animations
  function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('.animate-on-scroll');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target;
            const animation = element.dataset.animation || 'fade-in';
            element.classList.add(animation);
            observer.unobserve(element);
          }
        });
      },
      {
        threshold: 0.1,
      }
    );

    animatedElements.forEach((element) => {
      observer.observe(element);
    });
  }

  // Form validation
  const forms = document.querySelectorAll('.needs-validation');

  Array.from(forms).forEach((form) => {
    form.addEventListener(
      'submit',
      (event) => {
        if (!form.checkValidity()) {
          event.preventDefault();
          event.stopPropagation();
        }

        form.classList.add('was-validated');
      },
      false
    );
  });
});
