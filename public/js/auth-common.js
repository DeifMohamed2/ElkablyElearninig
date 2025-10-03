/**
 * Common JavaScript for Authentication Pages
 */

document.addEventListener('DOMContentLoaded', function () {
  // Note: Theme management is now handled by theme-manager.js

  // Toggle password visibility for primary password field
  const togglePassword = document.getElementById('togglePassword');
  if (togglePassword) {
    togglePassword.addEventListener('click', function () {
      const passwordInput = document.getElementById('password');
      const icon = this.querySelector('i');

      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    });
  }

  // Toggle password visibility for confirmation password field
  const togglePassword2 = document.getElementById('togglePassword2');
  if (togglePassword2) {
    togglePassword2.addEventListener('click', function () {
      const passwordInput = document.getElementById('password2');
      const icon = this.querySelector('i');

      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    });
  }

  // Enhanced form validation - only for forms with needs-validation class
  const forms = document.querySelectorAll('.needs-validation');

  Array.prototype.slice.call(forms).forEach(function (form) {
    form.addEventListener(
      'submit',
      function (event) {
        if (!form.checkValidity()) {
          event.preventDefault();
          event.stopPropagation();
        }
        form.classList.add('was-validated');
      },
      false
    );
  });

  // Password match validation for registration
  const password = document.getElementById('password');
  const password2 = document.getElementById('password2');

  if (password && password2) {
    function validatePassword() {
      if (password.value !== password2.value) {
        password2.setCustomValidity("Passwords don't match");
        password2.classList.add('is-invalid');
      } else {
        password2.setCustomValidity('');
        password2.classList.remove('is-invalid');
        if (password2.value.length >= 6) {
          password2.classList.add('is-valid');
        }
      }
    }

    password.addEventListener('change', validatePassword);
    password2.addEventListener('keyup', validatePassword);
    password.addEventListener('keyup', validatePassword);
  }

  // Real-time validation for specific fields
  const emailInput = document.getElementById('email');
  if (emailInput) {
    emailInput.addEventListener('blur', function () {
      const inputValue = this.value.trim();
      if (!inputValue) return;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/;
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;

      // Check if it's a valid email, phone number, or username
      if (!emailRegex.test(inputValue) && !phoneRegex.test(inputValue) && !usernameRegex.test(inputValue)) {
        this.setCustomValidity(
          'Please enter a valid email address, phone number, or username'
        );
        this.classList.add('is-invalid');
      } else {
        this.setCustomValidity('');
        this.classList.remove('is-invalid');
        this.classList.add('is-valid');
      }
    });
  }

  // Age validation
  const ageInput = document.getElementById('age');
  if (ageInput) {
    ageInput.addEventListener('input', function () {
      const age = parseInt(this.value);
      if (this.value && (isNaN(age) || age < 10 || age > 100)) {
        this.setCustomValidity('Age must be between 10 and 100');
        this.classList.add('is-invalid');
      } else {
        this.setCustomValidity('');
        this.classList.remove('is-invalid');
        if (this.value) {
          this.classList.add('is-valid');
        }
      }
    });
  }

  // Student phone number validation - simplified as main validation is in validatePhoneNumbers
  const studentPhoneInput = document.getElementById('studentPhoneNumber');

  // Parent phone number validation
  const parentPhoneInput = document.getElementById('parentPhoneNumber');
  if (parentPhoneInput) {
    parentPhoneInput.addEventListener('blur', function () {
      validatePhoneNumbers();
    });
  }

  // Function to validate phone numbers are different
  function validatePhoneNumbers() {
    const studentPhone = studentPhoneInput
      ? studentPhoneInput.value.trim()
      : '';
    const parentPhone = parentPhoneInput ? parentPhoneInput.value.trim() : '';

    // Validate student phone format
    if (studentPhoneInput) {
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/;
      if (studentPhone && !phoneRegex.test(studentPhone)) {
        studentPhoneInput.setCustomValidity(
          'Please enter a valid student phone number (10-15 digits)'
        );
        studentPhoneInput.classList.add('is-invalid');
      } else if (studentPhone && parentPhone && studentPhone === parentPhone) {
        studentPhoneInput.setCustomValidity(
          'Student phone number must be different from parent phone number'
        );
        studentPhoneInput.classList.add('is-invalid');
      } else {
        studentPhoneInput.setCustomValidity('');
        studentPhoneInput.classList.remove('is-invalid');
        if (studentPhone) {
          studentPhoneInput.classList.add('is-valid');
        }
      }
    }

    // Validate parent phone format
    if (parentPhoneInput) {
      const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/;
      if (parentPhone && !phoneRegex.test(parentPhone)) {
        parentPhoneInput.setCustomValidity(
          'Please enter a valid parent phone number (10-15 digits)'
        );
        parentPhoneInput.classList.add('is-invalid');
      } else if (studentPhone && parentPhone && studentPhone === parentPhone) {
        parentPhoneInput.setCustomValidity(
          'Parent phone number must be different from student phone number'
        );
        parentPhoneInput.classList.add('is-invalid');
      } else {
        parentPhoneInput.setCustomValidity('');
        parentPhoneInput.classList.remove('is-invalid');
        if (parentPhone) {
          parentPhoneInput.classList.add('is-valid');
        }
      }
    }
  }

  // Update student phone validation to also check for differences
  if (studentPhoneInput) {
    studentPhoneInput.addEventListener('blur', function () {
      validatePhoneNumbers();
    });
  }

  // Name validation
  const nameInput = document.getElementById('name');
  if (nameInput) {
    nameInput.addEventListener('input', function () {
      if (this.value && (this.value.length < 2 || this.value.length > 50)) {
        this.setCustomValidity('Name must be between 2 and 50 characters');
        this.classList.add('is-invalid');
      } else {
        this.setCustomValidity('');
        this.classList.remove('is-invalid');
        if (this.value) {
          this.classList.add('is-valid');
        }
      }
    });
  }

  // School name validation
  const schoolNameInput = document.getElementById('schoolName');
  if (schoolNameInput) {
    schoolNameInput.addEventListener('input', function () {
      if (this.value && (this.value.length < 2 || this.value.length > 100)) {
        this.setCustomValidity(
          'School name must be between 2 and 100 characters'
        );
        this.classList.add('is-invalid');
      } else {
        this.setCustomValidity('');
        this.classList.remove('is-invalid');
        if (this.value) {
          this.classList.add('is-valid');
        }
      }
    });
  }

  // Auto-dismiss alerts after 5 seconds
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach(function (alert) {
    setTimeout(function () {
      if (alert && alert.parentNode) {
        alert.style.transition = 'opacity 0.5s';
        alert.style.opacity = '0';
        setTimeout(function () {
          if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
          }
        }, 500);
      }
    }, 5000);
  });
});
