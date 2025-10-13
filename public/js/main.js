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

  // Initialize floating formula word rotation
  initFloatingFormulaRotation();
});

// Floating Formula Word Rotation
function initFloatingFormulaRotation() {
  // Define word arrays for each formula card using the provided Arabic words
  const allWords = [
    'Tab3an ghlat',
    'Okeeshan',
    'Ya Doctor',
    '5alek re5m',
    'A3adi',
    'Y5rbt kda',
    'Za2 za2a',
    'Zay el gardal',
    'Shdyd el so2al da',
    'Howa ana bta3 kebda',
    'Assalam alikom',
    'Bravo',
    'Ezayko ya shbab',
    'Sha2leb w 2el2eb',
    'Da3s',
    'Dy 7aga teet',
    'Salam moz2kt',
    'Gebna Nesto'
  ];

  // Distribute words across formula cards
  const wordArrays = {
    'formula-1': allWords.slice(0, 4),
    'formula-2': allWords.slice(4, 8),
    'formula-3': allWords.slice(8, 12),
    'formula-4': allWords.slice(12, 16),
    'formula-5': allWords.slice(16, 18)
  };

  // Get all formula cards
  const formulaCards = document.querySelectorAll('.formula-card');
  
  // Initialize word rotation for each card
  formulaCards.forEach((card, index) => {
    const cardClass = card.classList[1]; // Get the second class (formula-1, formula-2, etc.)
    const words = wordArrays[cardClass] || ['Default Word'];
    
    // Start rotation immediately without fade
    rotateWords(card, words);
    
    // Continue rotation every 8 seconds
    setInterval(() => {
      rotateWords(card, words);
    }, 7000);
  });
}

function rotateWords(card, words) {
  const textElement = card.querySelector('.formula-text');
  if (!textElement) return;
  
  // Get current word index
  let currentIndex = parseInt(textElement.getAttribute('data-word-index')) || 0;
  
  // Move to next word (cycle back to 0 if at end)
  currentIndex = (currentIndex + 1) % words.length;
  
  // Add fade-out class
  textElement.classList.add('fade-out');
  
  // After fade-out animation completes, change text and fade in
  setTimeout(() => {
    textElement.textContent = words[currentIndex];
    textElement.setAttribute('data-word-index', currentIndex);
    
    // Remove fade-out and add fade-in
    textElement.classList.remove('fade-out');
    textElement.classList.add('fade-in');
    
    // Remove fade-in class after animation completes
    setTimeout(() => {
      textElement.classList.remove('fade-in');
    }, 800);
  }, 800); // Wait for fade-out to complete
}
