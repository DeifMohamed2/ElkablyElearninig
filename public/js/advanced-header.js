/**
 * Advanced Header JavaScript for Mr Mohrr7am
 * Handles header scroll effects, glass morphism, and mobile navigation
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize all header functionality
  initializeHeaderScrollEffects();
  initializeMobileNavigation();
  initializeThemeToggle();
  initializeUserDropdown();
  initializeCartToggle();
  initializeScrollProgress();
  initializeNavigationDropdown();
  initializeSmoothScrolling();
});

/**
 * Initialize header scroll effects with glass morphism
 */
function initializeHeaderScrollEffects() {
  const header = document.querySelector('.advanced-header');
  const headerGlassEffect = document.querySelector('.header-glass-effect');
  const headerGradientOverlay = document.querySelector('.header-gradient-overlay');
  const headerMathPatterns = document.querySelector('.header-math-patterns');
  
  if (!header) return;

  let lastScrollY = window.scrollY;
  let ticking = false;

  function updateHeader() {
    const scrollY = window.scrollY;
    const scrollDirection = scrollY > lastScrollY ? 'down' : 'up';
    // const scrollProgress = scrollY / 200; // Define scrollProgress at function level
    
    // Add scrolled class for basic scroll effects
    if (scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    // Enhanced glass effect based on scroll position
    if (headerGlassEffect) {
      const glassOpacity = 0.08 + (scrollProgress * 0.12); // 0.08 to 0.2
      const blurAmount = 15 + (scrollProgress * 10); // 15px to 25px
      
      headerGlassEffect.style.background = `rgba(255, 255, 255, ${glassOpacity})`;
      headerGlassEffect.style.backdropFilter = `blur(${blurAmount}px)`;
      headerGlassEffect.style.webkitBackdropFilter = `blur(${blurAmount}px)`;
    }

    // Dynamic gradient overlay
    if (headerGradientOverlay) {
      const gradientOpacity = 0.7 + (scrollProgress * 0.3);
      headerGradientOverlay.style.opacity = gradientOpacity;
    }

    // Animate math patterns based on scroll
    if (headerMathPatterns) {
      const patterns = headerMathPatterns.querySelectorAll('.math-pattern');
      patterns.forEach((pattern, index) => {
        const speed = 0.5 + (index * 0.1);
        const yOffset = scrollY * speed;
        const rotation = scrollY * 0.1;
        pattern.style.transform = `translateY(${yOffset}px) rotate(${rotation}deg)`;
      });
    }

    // Add subtle parallax effect to header backdrop
    if (scrollY > 0) {
      const parallaxOffset = scrollY * 0.3;
      header.style.transform = `translateY(${parallaxOffset}px)`;
    } else {
      header.style.transform = 'translateY(0)';
    }

    lastScrollY = scrollY;
    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      requestAnimationFrame(updateHeader);
      ticking = true;
    }
  }

  // Throttled scroll event listener
  window.addEventListener('scroll', requestTick, { passive: true });
  
  // Initial call
  updateHeader();
}

/**
 * Initialize mobile navigation functionality
 */
function initializeMobileNavigation() {
  const mobileToggle = document.querySelector('.header-mobile-toggle');
  const navSection = document.querySelector('.header-nav-section');
  const navLinks = document.querySelectorAll('.nav-link');

  if (!mobileToggle || !navSection) return;

  // Toggle mobile menu
  mobileToggle.addEventListener('click', function() {
    const isActive = navSection.classList.contains('active');
    
    if (isActive) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  // Close mobile menu when clicking on nav links
  navLinks.forEach(link => {
    link.addEventListener('click', function() {
      if (window.innerWidth <= 992) {
        closeMobileMenu();
      }
    });
  });


  // Close mobile menu when clicking outside
  document.addEventListener('click', function(e) {
    if (navSection.classList.contains('active') && 
        !navSection.contains(e.target) && 
        !mobileToggle.contains(e.target)) {
      closeMobileMenu();
    }
  });

  // Close mobile menu on window resize
  window.addEventListener('resize', function() {
    if (window.innerWidth > 992) {
      closeMobileMenu();
    }
  });

  function openMobileMenu() {
    navSection.classList.add('active');
    mobileToggle.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Animate nav links
    const navItems = navSection.querySelectorAll('.nav-item');
    navItems.forEach((item, index) => {
      item.style.animationDelay = `${index * 0.1}s`;
      item.classList.add('animate-in');
    });
  }

  function closeMobileMenu() {
    navSection.classList.remove('active');
    mobileToggle.classList.remove('active');
    document.body.style.overflow = '';
    
    // Remove animation classes
    const navItems = navSection.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.classList.remove('animate-in');
    });
    
    // Close any open dropdowns
    document.querySelectorAll('.nav-item-dropdown.active').forEach(item => {
      item.classList.remove('active');
    });
  }
}

/**
 * Initialize theme toggle functionality
 */
function initializeThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const lightIcon = document.querySelector('.light-icon');
  const darkIcon = document.querySelector('.dark-icon');
  const lightContainer = document.querySelector('.light-icon-container');
  const darkContainer = document.querySelector('.dark-icon-container');

  if (!themeToggle) return;

  // Get current theme
  const currentTheme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';

  // Set initial state
  updateThemeToggle(currentTheme);

  themeToggle.addEventListener('click', function() {
    const isLight = document.documentElement.classList.contains('light-theme');
    const newTheme = isLight ? 'dark' : 'light';
    
    // Toggle theme classes
    document.documentElement.classList.toggle('light-theme');
    document.documentElement.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme');
    document.body.classList.toggle('dark-theme');
    
    // Save to localStorage
    localStorage.setItem('theme', newTheme);
    
    // Update toggle appearance
    updateThemeToggle(newTheme);
    
    // Trigger custom event for other components
    window.dispatchEvent(new CustomEvent('themeChanged', { 
      detail: { theme: newTheme } 
    }));
  });

  function updateThemeToggle(theme) {
    if (theme === 'light') {
      lightContainer.style.opacity = '1';
      lightContainer.style.transform = 'scale(1)';
      darkContainer.style.opacity = '0';
      darkContainer.style.transform = 'scale(0.8)';
    } else {
      lightContainer.style.opacity = '0';
      lightContainer.style.transform = 'scale(0.8)';
      darkContainer.style.opacity = '1';
      darkContainer.style.transform = 'scale(1)';
    }
  }
}

/**
 * Initialize user dropdown functionality
 */
function initializeUserDropdown() {
  const userDropdown = document.getElementById('userDropdown');
  const dropdownMenu = document.querySelector('.user-dropdown-menu');
  const dropdownContainer = document.querySelector('.user-account-dropdown');

  console.log('Initializing user dropdown:', { userDropdown, dropdownMenu, dropdownContainer });

  if (!userDropdown || !dropdownMenu) {
    console.log('User dropdown elements not found');
    return;
  }

  userDropdown.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('User dropdown clicked');
    
    const isExpanded = userDropdown.getAttribute('aria-expanded') === 'true';
    
    if (isExpanded) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function(e) {
    if (dropdownContainer && !dropdownContainer.contains(e.target)) {
      closeDropdown();
    }
  });

  // Close dropdown on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  // Close dropdown when scrolling
  window.addEventListener('scroll', function() {
    closeDropdown();
  });

  // Close dropdown when window is resized
  window.addEventListener('resize', function() {
    closeDropdown();
  });

  function openDropdown() {
    console.log('Opening dropdown');
    
    // Calculate position based on button location
    const buttonRect = userDropdown.getBoundingClientRect();
    const headerHeight = document.querySelector('.advanced-header')?.offsetHeight || 90;
    
    // Position dropdown below header, aligned with button
    dropdownMenu.style.top = `${headerHeight + 10}px`;
    dropdownMenu.style.right = `${window.innerWidth - buttonRect.right}px`;
    
    // Ensure dropdown doesn't go off screen
    const dropdownWidth = 320;
    const rightPosition = window.innerWidth - buttonRect.right;
    
    if (rightPosition + dropdownWidth > window.innerWidth - 20) {
      dropdownMenu.style.right = '20px';
    }
    
    // Show dropdown
    dropdownContainer.classList.add('show');
    userDropdown.setAttribute('aria-expanded', 'true');
    dropdownMenu.style.opacity = '1';
    dropdownMenu.style.visibility = 'visible';
    dropdownMenu.style.transform = 'translateY(0) scale(1)';
    
    // Add body class to prevent scrolling
    document.body.classList.add('dropdown-open');
    
    console.log('Dropdown opened');
  }

  function closeDropdown() {
    console.log('Closing dropdown');
    
    if (dropdownContainer) {
      dropdownContainer.classList.remove('show');
    }
    
    if (userDropdown) {
      userDropdown.setAttribute('aria-expanded', 'false');
    }
    
    if (dropdownMenu) {
      dropdownMenu.style.opacity = '0';
      dropdownMenu.style.visibility = 'hidden';
      dropdownMenu.style.transform = 'translateY(-20px) scale(0.95)';
    }
    
    // Remove body class
    document.body.classList.remove('dropdown-open');
    
    console.log('Dropdown closed');
  }
}

/**
 * Initialize cart toggle functionality
 */
function initializeCartToggle() {
  const cartToggle = document.getElementById('cartToggle');
  const cartSidebar = document.getElementById('cartSidebar');
  const cartSidebarClose = document.getElementById('cartSidebarClose');
  const cartSidebarOverlay = document.getElementById('cartSidebarOverlay');

  if (!cartToggle || !cartSidebar) return;

  // Open cart sidebar
  cartToggle.addEventListener('click', function() {
    cartSidebar.classList.add('cart-sidebar-open');
    document.body.classList.add('cart-sidebar-active');
  });

  // Close cart sidebar
  if (cartSidebarClose) {
    cartSidebarClose.addEventListener('click', closeCartSidebar);
  }

  if (cartSidebarOverlay) {
    cartSidebarOverlay.addEventListener('click', closeCartSidebar);
  }

  // Close cart on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && cartSidebar.classList.contains('cart-sidebar-open')) {
      closeCartSidebar();
    }
  });

  function closeCartSidebar() {
    cartSidebar.classList.remove('cart-sidebar-open');
    document.body.classList.remove('cart-sidebar-active');
  }
}

/**
 * Initialize scroll progress indicator
 */
function initializeScrollProgress() {
  const progressBar = document.getElementById('scroll-progress');
  
  if (!progressBar) return;

  let ticking = false;

  function updateProgress() {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    
    progressBar.style.width = scrolled + '%';
    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      requestAnimationFrame(updateProgress);
      ticking = true;
    }
  }

  window.addEventListener('scroll', requestTick, { passive: true });
}

/**
 * Smooth scroll to section
 */
function smoothScrollTo(targetId) {
  const target = document.querySelector(targetId);
  if (target) {
    const headerHeight = document.querySelector('.advanced-header').offsetHeight;
    const targetPosition = target.offsetTop - headerHeight - 20;
    
    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth'
    });
  }
}

/**
 * Add scroll-triggered animations to elements
 */
function initializeScrollAnimations() {
  const animatedElements = document.querySelectorAll('[data-aos]');
  
  if (animatedElements.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const animationType = element.getAttribute('data-aos');
        const delay = element.getAttribute('data-aos-delay') || 0;
        
        setTimeout(() => {
          element.classList.add('aos-animate');
        }, parseInt(delay));
        
        observer.unobserve(element);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  animatedElements.forEach(element => {
    observer.observe(element);
  });
}

// Initialize scroll animations when DOM is ready
document.addEventListener('DOMContentLoaded', initializeScrollAnimations);

/**
 * Initialize navigation dropdown functionality
 * Note: Dropdown functionality removed - Brilliant Students now links directly to first section
 */
function initializeNavigationDropdown() {
  // Dropdown functionality removed - Brilliant Students now scrolls directly to #brilliant-students-est
  // This function is kept for potential future use but is currently empty
}

/**
 * Initialize smooth scrolling for navigation links
 */
function initializeSmoothScrolling() {
  const smoothScrollLinks = document.querySelectorAll('.smooth-scroll');
  
  smoothScrollLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      if (href.startsWith('#')) {
        e.preventDefault();
        
        const targetId = href.substring(1);
        const target = document.getElementById(targetId);
        
        if (target) {
          const headerHeight = document.querySelector('.advanced-header')?.offsetHeight || 0;
          const targetPosition = target.offsetTop - headerHeight - 20;
          
          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });
          
          // Update active navigation item
          updateActiveNavigationItem(href);
          
          // Close mobile menu if open
          const navSection = document.querySelector('.header-nav-section');
          const mobileToggle = document.querySelector('.header-mobile-toggle');
          if (navSection.classList.contains('active')) {
            navSection.classList.remove('active');
            mobileToggle.classList.remove('active');
            document.body.style.overflow = '';
          }
        }
      }
    });
  });
}

/**
 * Update active navigation item based on scroll position
 */
function updateActiveNavigationItem(targetHref) {
  const navLinks = document.querySelectorAll('.nav-link');
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === targetHref) {
      link.classList.add('active');
    }
  });
}

/**
 * Initialize scroll-based active navigation highlighting
 */
function initializeScrollBasedNavigation() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
  
  if (sections.length === 0 || navLinks.length === 0) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const sectionId = entry.target.id;
        const correspondingLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);
        
        if (correspondingLink) {
          // Remove active class from all links
          navLinks.forEach(link => link.classList.remove('active'));
          
          // Add active class to current link
          correspondingLink.classList.add('active');
        }
      }
    });
  }, {
    threshold: 0.3,
    rootMargin: '-100px 0px -100px 0px'
  });
  
  sections.forEach(section => {
    observer.observe(section);
  });
}

// Initialize scroll-based navigation
document.addEventListener('DOMContentLoaded', initializeScrollBasedNavigation);

// Export functions for global use
window.smoothScrollTo = smoothScrollTo;
