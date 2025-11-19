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
  
  // Handle hash on page load (when redirecting from other pages)
  handleHashOnPageLoad();
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
    // Add scrolled class for basic scroll effects
    if (scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
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
 * Initialize mobile navigation functionality - Removed mobile toggle
 */
function initializeMobileNavigation() {
  // Mobile toggle functionality removed - navigation now uses dropdown in header
}

/**
 * Initialize theme toggle functionality
 */
function initializeThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  
  if (!themeToggle) return;

  // Get current theme from localStorage or default to light
  const currentTheme = localStorage.getItem('theme') || 'light';
  
  // Apply initial theme
  applyTheme(currentTheme);

  // Mark as initialized to prevent conflicts with theme-manager.js
  themeToggle.setAttribute('data-advanced-header-initialized', 'true');

  themeToggle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Add loading state to prevent multiple clicks
    themeToggle.disabled = true;
    themeToggle.classList.add('theme-toggling');
    
    const currentTheme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // Apply new theme
    applyTheme(newTheme);
    
    // Remove loading state after animation
    setTimeout(() => {
      themeToggle.disabled = false;
      themeToggle.classList.remove('theme-toggling');
    }, 300);
  });

  function applyTheme(theme) {
    // Remove existing theme classes from both html and body
    document.documentElement.classList.remove('light-theme', 'dark-theme');
    document.body.classList.remove('light-theme', 'dark-theme');
    
    // Add new theme class to both html and body
    document.documentElement.classList.add(`${theme}-theme`);
    document.body.classList.add(`${theme}-theme`);
    
    // Save to localStorage
    localStorage.setItem('theme', theme);
    
    // Update toggle appearance
    updateThemeToggle(theme);
    
    // Trigger custom event for other components
    window.dispatchEvent(new CustomEvent('themeChanged', { 
      detail: { theme: theme } 
    }));
  }

  function updateThemeToggle(theme) {
    const lightContainer = document.querySelector('.light-icon-container');
    const darkContainer = document.querySelector('.dark-icon-container');
    
    if (!lightContainer || !darkContainer) return;
    
    // Use CSS classes instead of inline styles for better performance
    if (theme === 'light') {
      lightContainer.style.display = 'none';
      lightContainer.style.opacity = '0';
      lightContainer.style.transform = 'scale(0.5) rotate(-180deg)';
      lightContainer.style.visibility = 'hidden';
      
      darkContainer.style.display = 'flex';
      darkContainer.style.opacity = '1';
      darkContainer.style.transform = 'scale(1) rotate(0deg)';
      darkContainer.style.visibility = 'visible';
    } else {
      lightContainer.style.display = 'flex';
      lightContainer.style.opacity = '1';
      lightContainer.style.transform = 'scale(1) rotate(0deg)';
      lightContainer.style.visibility = 'visible';
      
      darkContainer.style.display = 'none';
      darkContainer.style.opacity = '0';
      darkContainer.style.transform = 'scale(0.5) rotate(180deg)';
      darkContainer.style.visibility = 'hidden';
    }
  }
}

/**
 * Initialize user dropdown functionality
 */
function initializeUserDropdown() {
  const userDropdown = document.getElementById('userDropdown');
  const dropdownMenu = document.getElementById('userDropdownMenu');
  const dropdownContainer = document.querySelector('.user-account-dropdown');
  const mobileOverlay = document.getElementById('mobileDropdownOverlay');

  if (!userDropdown || !dropdownMenu || !dropdownContainer) {
    console.warn('Dropdown elements not found');
    return;
  }

  // Remove any existing event listeners
  userDropdown.removeAttribute('onclick');
  
  userDropdown.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if mobile view (768px and below)
    const isMobile = window.innerWidth <= 768;
    
    // On mobile, redirect to dashboard instead of opening dropdown
    if (isMobile) {
      // Check if user is logged in (check if dashboard link exists)
      const dashboardLink = dropdownMenu.querySelector('a[href="/student/dashboard"]');
      if (dashboardLink) {
        window.location.href = '/student/dashboard';
        return;
      }
    }
    
    // Desktop behavior: toggle dropdown
    const isExpanded = userDropdown.getAttribute('aria-expanded') === 'true';
    
    if (isExpanded) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  // Mobile overlay click handler
  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', function() {
      closeDropdown();
    });
  }

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
  }, { passive: true });

  // Close dropdown when window is resized
  window.addEventListener('resize', function() {
    closeDropdown();
  });

  function openDropdown() {
    // Calculate position based on button location
    const buttonRect = userDropdown.getBoundingClientRect();
    const headerHeight = document.querySelector('.advanced-header')?.offsetHeight || 90;
    
    // Position dropdown below header, aligned with button
    dropdownMenu.style.top = `${headerHeight + 10}px`;
    dropdownMenu.style.right = `${window.innerWidth - buttonRect.right}px`;
    
    // Ensure dropdown doesn't go off screen
    const dropdownWidth = 380; // Updated to match CSS width
    const rightPosition = window.innerWidth - buttonRect.right;
    
    if (rightPosition + dropdownWidth > window.innerWidth - 20) {
      dropdownMenu.style.right = '20px';
    }
    
    // Show dropdown with animation
    dropdownContainer.classList.add('show');
    userDropdown.setAttribute('aria-expanded', 'true');
    
    // Set initial state for animation
    dropdownMenu.style.display = 'block';
    dropdownMenu.style.opacity = '0';
    dropdownMenu.style.transform = 'translateY(-20px) scale(0.95)';
    dropdownMenu.style.visibility = 'visible';
    dropdownMenu.style.pointerEvents = 'none';
    dropdownMenu.style.zIndex = '999999';
    
    // Force reflow
    dropdownMenu.offsetHeight;
    
    // Animate in
    requestAnimationFrame(() => {
      dropdownMenu.style.opacity = '1';
      dropdownMenu.style.transform = 'translateY(0) scale(1)';
      dropdownMenu.style.pointerEvents = 'auto';
    });
    
    // Show mobile overlay
    if (mobileOverlay && window.innerWidth <= 768) {
      mobileOverlay.style.display = 'block';
      mobileOverlay.style.opacity = '0';
      requestAnimationFrame(() => {
        mobileOverlay.style.opacity = '1';
      });
    }
    
    // Prevent body scroll on mobile
    if (window.innerWidth <= 768) {
      document.body.style.overflow = 'hidden';
    }
    
    // Add body class
    document.body.classList.add('dropdown-open');
  }

  function closeDropdown() {
    if (!dropdownContainer.classList.contains('show')) {
      return; // Already closed
    }
    
    // Animate out
    dropdownMenu.style.opacity = '0';
    dropdownMenu.style.transform = 'translateY(-20px) scale(0.95)';
    dropdownMenu.style.pointerEvents = 'none';
    
    // Hide mobile overlay
    if (mobileOverlay) {
      mobileOverlay.style.opacity = '0';
      setTimeout(() => {
        mobileOverlay.style.display = 'none';
      }, 300);
    }
    
    // Remove classes after animation
    setTimeout(() => {
      dropdownContainer.classList.remove('show');
      userDropdown.setAttribute('aria-expanded', 'false');
      dropdownMenu.style.display = 'none';
      dropdownMenu.style.visibility = 'hidden';
    }, 300);
    
    // Restore body scroll
    document.body.style.overflow = '';
    document.body.classList.remove('dropdown-open');
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

  if (!cartToggle || !cartSidebar) {
    return;
  }

  // Open cart sidebar
  cartToggle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    cartSidebar.classList.add('cart-sidebar-open');
    document.body.classList.add('cart-sidebar-active');
    
    // Prevent body scroll when cart is open
    document.body.style.overflow = 'hidden';
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
    document.body.style.overflow = '';
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

/**
 * Handle hash on page load - scroll to section when redirected from other pages
 */
function handleHashOnPageLoad() {
  // Check if URL has a hash
  if (window.location.hash) {
    const hash = window.location.hash;
    const targetId = hash.substring(1);
    
    // Wait a bit for page to fully load and render
    setTimeout(() => {
      const target = document.getElementById(targetId);
      
      if (target) {
        const headerHeight = document.querySelector('.advanced-header')?.offsetHeight || 0;
        const targetPosition = target.offsetTop - headerHeight - 20;
        
        // Scroll to target section
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
        
        // Update active navigation item
        updateActiveNavigationItem(hash);
      }
    }, 100); // Small delay to ensure DOM is fully rendered
  }
}

// Export functions for global use
window.smoothScrollTo = smoothScrollTo;
