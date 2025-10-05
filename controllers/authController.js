const Admin = require('../models/Admin');
const User = require('../models/User');

// Get login page
const getLoginPage = (req, res) => {
  res.render('auth/login', {
    title: 'Login',
    theme: req.cookies.theme || 'light',
  });
};

// Get register page
const getRegisterPage = (req, res) => {
  res.render('auth/register', {
    title: 'Register',
    theme: req.cookies.theme || 'light',
  });
};

// Admin create page (hidden, token-protected)
const getCreateAdminPage = (req, res) => {
  const token = req.query.token || '';
  const setupToken = process.env.ADMIN_SETUP_TOKEN || 'only-you-know-this';
  console.log(token, setupToken);
  if (token !== setupToken) {
    req.flash('error_msg', 'Unauthorized access');
    return res.redirect('/auth/login');
  }
  return res.render('admin/create-admin', {
    title: 'Create Admin',
    theme: req.cookies.theme || 'light',
    token: token,
  });
};

// Create admin account (hidden, token-protected)
const createAdmin = async (req, res) => {
  const { userName, phoneNumber, password, token, email } = req.body;
  const setupToken = process.env.ADMIN_SETUP_TOKEN || 'only-you-know-this';
  let errors = [];

  if (!token || token !== setupToken) {
    errors.push({ msg: 'Unauthorized access' });
  }
  if (!userName || !phoneNumber || !password) {
    errors.push({ msg: 'Please fill in all required fields' });
  }
  const phoneRegex = /^\+?[\d\s\-\(\)]{6,20}$/;
  if (phoneNumber && !phoneRegex.test(phoneNumber)) {
    errors.push({ msg: 'Please enter a valid phone number' });
  }
  if (password && password.length < 6) {
    errors.push({ msg: 'Password must be at least 6 characters long' });
  }

  if (errors.length > 0) {
    return res.status(400).render('admin/create-admin', {
      title: 'Create Admin',
      theme: req.cookies.theme || 'light',
      errors,
      userName,
      phoneNumber,
      email,
    });
  }

  try {
    const existing = await Admin.findOne({ phoneNumber: phoneNumber.trim() });
    if (existing) {
      errors.push({ msg: 'Phone number already used' });
      return res.status(400).render('admin/create-admin', {
        title: 'Create Admin',
        theme: req.cookies.theme || 'light',
        errors,
        userName,
        phoneNumber,
        email,
      });
    }

    const admin = new Admin({
      userName: userName.trim(),
      phoneNumber: phoneNumber.trim(),
      password,
      email: email ? email.toLowerCase().trim() : undefined,
    });
    const saved = await admin.save();

    req.session.user = {
      id: saved._id,
      name: saved.userName,
      email: saved.email,
      role: saved.role,
      isActive: saved.isActive,
      phoneNumber: saved.phoneNumber,
    };
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Create admin error:', err);
    errors.push({ msg: 'An error occurred. Please try again.' });
    return res.status(500).render('admin/create-admin', {
      title: 'Create Admin',
      theme: req.cookies.theme || 'light',
      errors,
      userName,
      phoneNumber,
      email,
    });
  }
};

// Register user
const registerUser = async (req, res) => {
  const {
    firstName,
    lastName,
    studentNumber,
    studentCountryCode,
    parentNumber,
    parentCountryCode,
    studentEmail,
    username,
    schoolName,
    grade,
    englishTeacher,
    password,
    password2,
    howDidYouKnow,
  } = req.body;

  let errors = [];

  // Check required fields
  if (
    !firstName ||
    !lastName ||
    !studentNumber ||
    !studentCountryCode ||
    !parentNumber ||
    !parentCountryCode ||
    !studentEmail ||
    !username ||
    !schoolName ||
    !grade ||
    !englishTeacher ||
    !password ||
    !password2 ||
    !howDidYouKnow
  ) {
    errors.push({ msg: 'Please fill in all required fields' });
  }

  // Validate first name
  if (firstName && (firstName.length < 2 || firstName.length > 50)) {
    errors.push({ msg: 'First name must be between 2 and 50 characters' });
  }

  // Validate last name
  if (lastName && (lastName.length < 2 || lastName.length > 50)) {
    errors.push({ msg: 'Last name must be between 2 and 50 characters' });
  }

  // Validate student number
  if (studentNumber && (studentNumber.length < 1 || studentNumber.length > 20)) {
    errors.push({ msg: 'Student number must be between 1 and 20 characters' });
  }

  // Validate student email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (studentEmail && !emailRegex.test(studentEmail)) {
    errors.push({ msg: 'Please enter a valid email address' });
  }

  // Validate username
  if (username && (username.length < 3 || username.length > 30)) {
    errors.push({ msg: 'Username must be between 3 and 30 characters' });
  }

  // Validate username format (alphanumeric and underscores only)
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (username && !usernameRegex.test(username)) {
    errors.push({ msg: 'Username can only contain letters, numbers, and underscores' });
  }

  // Check passwords match
  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match' });
  }

  // Check password strength
  if (password && password.length < 6) {
    errors.push({ msg: 'Password must be at least 6 characters long' });
  }

  // Validate country codes
  const validCountryCodes = ['+966', '+20', '+971', '+965'];
  if (studentCountryCode && !validCountryCodes.includes(studentCountryCode)) {
    errors.push({ msg: 'Please select a valid country code for student number' });
  }
  if (parentCountryCode && !validCountryCodes.includes(parentCountryCode)) {
    errors.push({ msg: 'Please select a valid country code for parent number' });
  }

  // Validate phone numbers (without country code)
  const phoneRegex = /^[\d\s\-\(\)]{8,12}$/;
  if (parentNumber && !phoneRegex.test(parentNumber)) {
    errors.push({
      msg: 'Please enter a valid parent phone number (8-12 digits)',
    });
  }
  if (studentNumber && !phoneRegex.test(studentNumber)) {
    errors.push({
      msg: 'Please enter a valid student phone number (8-12 digits)',
    });
  }

  // Validate school name
  if (schoolName && (schoolName.length < 2 || schoolName.length > 100)) {
    errors.push({ msg: 'School name must be between 2 and 100 characters' });
  }

  // Validate grade
  const validGrades = [
    'Year 7',
    'Year 8',
    'Year 9',
    'Year 10',
    'Year 11',
    'Year 12',
    'Year 13',
  ];
  if (grade && !validGrades.includes(grade)) {
    errors.push({ msg: 'Please select a valid grade' });
  }

  // Validate English teacher name
  if (englishTeacher && (englishTeacher.length < 2 || englishTeacher.length > 100)) {
    errors.push({ msg: 'English teacher name must be between 2 and 100 characters' });
  }

  // Validate how did you know response
  if (howDidYouKnow && howDidYouKnow.length > 500) {
    errors.push({ msg: 'Response must be less than 500 characters' });
  }

  if (errors.length > 0) {
    return res.render('auth/register', {
      title: 'Register',
      theme: req.cookies.theme || 'light',
      errors,
      firstName,
      lastName,
      studentNumber,
      parentNumber,
      studentEmail,
      username,
      schoolName,
      grade,
      englishTeacher,
      howDidYouKnow,
    });
  }

  try {
    // Check if student email exists
    const existingEmail = await User.findOne({ studentEmail: studentEmail.toLowerCase() });

    if (existingEmail) {
      errors.push({ msg: 'Student email is already registered' });
      return res.render('auth/register', {
        title: 'Register',
        theme: req.cookies.theme || 'light',
        errors,
        firstName,
        lastName,
        studentNumber,
        studentCountryCode,
        parentNumber,
        parentCountryCode,
        studentEmail,
        username,
        schoolName,
        grade,
        englishTeacher,
        howDidYouKnow,
      });
    }

    // Check if username exists
    const existingUsername = await User.findOne({
      username: username.trim(),
    });

    if (existingUsername) {
      errors.push({ msg: 'Username is already taken' });
      return res.render('auth/register', {
        title: 'Register',
        theme: req.cookies.theme || 'light',
        errors,
        firstName,
        lastName,
        studentNumber,
        studentCountryCode,
        parentNumber,
        parentCountryCode,
        studentEmail,
        username,
        schoolName,
        grade,
        englishTeacher,
        howDidYouKnow,
      });
    }

    // Check if student number exists
    const existingStudentNumber = await User.findOne({
      studentNumber: studentNumber.trim(),
    });

    if (existingStudentNumber) {
      errors.push({ msg: 'Student number is already registered' });
      return res.render('auth/register', {
        title: 'Register',
        theme: req.cookies.theme || 'light',
        errors,
        firstName,
        lastName,
        studentNumber,
        studentCountryCode,
        parentNumber,
        parentCountryCode,
        studentEmail,
        username,
        schoolName,
        grade,
        englishTeacher,
        howDidYouKnow,
      });
    }

    // Create new user
    const newUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      studentNumber: studentNumber.trim(),
      studentCountryCode: studentCountryCode,
      parentNumber: parentNumber.trim(),
      parentCountryCode: parentCountryCode,
      studentEmail: studentEmail.toLowerCase().trim(),
      username: username.trim(),
      schoolName: schoolName.trim(),
      grade,
      englishTeacher: englishTeacher.trim(),
      password,
      howDidYouKnow: howDidYouKnow.trim(),
      isActive: false, // New users need admin approval
    });

    const savedUser = await newUser.save();

    // Show success page with student code
    res.render('auth/registration-success', {
      title: 'Registration Successful',
      theme: req.cookies.theme || 'light',
      studentName: savedUser.name,
      studentCode: savedUser.studentCode,
    });
  } catch (err) {
    console.error('Registration error:', err);

    // Handle mongoose validation errors
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map((e) => ({
        msg: e.message,
      }));
      errors.push(...validationErrors);
      return res.render('auth/register', {
        title: 'Register',
        theme: req.cookies.theme || 'light',
        errors,
        firstName,
        lastName,
        studentNumber,
        studentCountryCode,
        parentNumber,
        parentCountryCode,
        studentEmail,
        username,
        schoolName,
        grade,
        englishTeacher,
        howDidYouKnow,
      });
    }

    // Handle duplicate key errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      errors.push({
        msg: `${
          field.charAt(0).toUpperCase() + field.slice(1)
        } is already in use`,
      });
      return res.render('auth/register', {
        title: 'Register',
        theme: req.cookies.theme || 'light',
        errors,
        firstName,
        lastName,
        studentNumber,
        studentCountryCode,
        parentNumber,
        parentCountryCode,
        studentEmail,
        username,
        schoolName,
        grade,
        englishTeacher,
        howDidYouKnow,
      });
    }

    req.flash(
      'error_msg',
      'An error occurred during registration. Please try again.'
    );
    res.redirect('/auth/register');
  }
};

// Login user
const loginUser = async (req, res) => {
  const { email, password, rememberMe } = req.body;
  let errors = [];

  // Validate input
  if (!email || !password) {
    errors.push({ msg: 'Please provide both email/phone and password' });
  }

  if (errors.length > 0) {
    return res.render('auth/login', {
      title: 'Login',
      theme: req.cookies.theme || 'light',
      errors,
      email,
    });
  }

  try {
    let user;
    const inputValue = email.trim();

    // Simple check if input contains @ (email)
    if (inputValue.includes('@')) {
      // Try to find by email in both User and Admin models
      user = await User.findOne({ studentEmail: inputValue.toLowerCase() });
      if (!user) {
        user = await Admin.findOne({ email: inputValue.toLowerCase() });
      }
    } else if (inputValue.match(/^[\d\s\-\(\)\+]+$/)) {
      // If input contains only digits, spaces, dashes, parentheses, or plus (phone number)
      user = await User.findOne({ 
        $or: [
          { parentNumber: inputValue },
          { $expr: { $eq: [{ $concat: ['$parentCountryCode', '$parentNumber'] }, inputValue] } }
        ]
      });
      if (!user) {
        user = await Admin.findOne({ phoneNumber: inputValue });
      }
    } else {
      // Otherwise treat as username
      user = await User.findOne({ 
        username: { $regex: new RegExp(`^${inputValue}$`, 'i') }
      });
      if (!user) {
        user = await Admin.findOne({ 
          userName: { $regex: new RegExp(`^${inputValue}$`, 'i') } 
        });
      }
    }

    if (!user) {
      errors.push({ msg: 'Invalid email, phone number, or username' });
      return res.render('auth/login', {
        title: 'Login',
        theme: req.cookies.theme || 'light',
        errors,
        email,
      });
    }

    // Match password (both models implement matchPassword)
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      errors.push({ msg: 'Invalid email, phone number, or username' });
      return res.render('auth/login', {
        title: 'Login',
        theme: req.cookies.theme || 'light',
        errors,
        email,
      });
    }

      // Check if user is active (only for students)
      if (user.role === 'student' && user.isActive === false) {
        errors.push({
          msg: 'Your account is pending approval. Please contact the administrator or wait for approval.',
        });
        return res.render('auth/login', {
          title: 'Login',
          theme: req.cookies.theme || 'light',
          errors,
          email,
        });
      }

    // Set session configuration based on remember me
    if (rememberMe) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    } else {
      req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 1 day
    }

    // Create session
    if (user.role === 'admin') {
      req.session.user = {
        id: user._id,
        name: user.userName || user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
        isActive: user.isActive,
      };
    } else {
      req.session.user = {
        id: user._id,
        name: user.name, // This uses the virtual field
        firstName: user.firstName,
        lastName: user.lastName,
        studentEmail: user.studentEmail,
        username: user.username,
        role: user.role,
        grade: user.grade,
        schoolName: user.schoolName,
        studentCode: user.studentCode,
        studentNumber: user.studentNumber,
        studentCountryCode: user.studentCountryCode,
        parentNumber: user.parentNumber,
        parentCountryCode: user.parentCountryCode,
        englishTeacher: user.englishTeacher,
        isActive: user.isActive,
      };
    }

    // Save session and redirect based on role
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        errors.push({ msg: 'An error occurred during login. Please try again.' });
        return res.render('auth/login', {
          title: 'Login',
          theme: req.cookies.theme || 'light',
          errors,
          email,
        });
      }

      // Simple redirect based on role
      if (user.role === 'admin') {
        return res.redirect('/admin/dashboard');
      } else {
        return res.redirect('/student/dashboard');
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    errors.push({ msg: 'An error occurred during login. Please try again.' });
    return res.render('auth/login', {
      title: 'Login',
      theme: req.cookies.theme || 'light',
      errors,
      email,
    });
  }
};

// Logout user
const logoutUser = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.clearCookie('elkably.session');
    res.redirect('/auth/login');
  });
};

module.exports = {
  getLoginPage,
  getRegisterPage,
  registerUser,
  loginUser,
  logoutUser,
  getCreateAdminPage,
  createAdmin,
};

