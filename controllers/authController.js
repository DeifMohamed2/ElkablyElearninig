const Admin = require('../models/Admin');
const User = require('../models/User');
const axios = require('axios');
const whatsappSMSNotificationService = require('../utils/whatsappSMSNotificationService');
const crypto = require('crypto');
const { sendSms } = require('../utils/sms');

// Get login page
const getLoginPage = (req, res) => {
  res.render('auth/login', {
    title: 'Login | ELKABLY',
    theme: req.cookies.theme || 'light',
  });
};

// Get register page
const getRegisterPage = (req, res) => {
  res.render('auth/register', {
    title: 'Register | ELKABLY',
    theme: req.cookies.theme || 'light',
    studentPhoneVerified: req.session.student_phone_verified || false,
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
    title: 'Create Admin | ELKABLY',
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
      title: 'Create Admin | ELKABLY',
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
        title: 'Create Admin | ELKABLY',
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
      title: 'Create Admin | ELKABLY',
      theme: req.cookies.theme || 'light',
      errors,
      userName,
      phoneNumber,
      email,
    });
  }
};

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP to phone number
const sendOTP = async (req, res) => {
  try {
    const { phoneNumber, countryCode, type } = req.body; // type: 'student' or 'parent'
    
    if (!phoneNumber || !countryCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number and country code are required' 
      });
    }

    // Validate phone number format
    const cleanPhoneNumber = phoneNumber.replace(/[^\d]/g, '');
    if (!cleanPhoneNumber || cleanPhoneNumber.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid phone number format' 
      });
    }

    // Rate limiting: Check OTP send attempts (3 attempts per hour)
    const attemptsKey = `${type}_otp_attempts`;
    const attemptsBlockedKey = `${type}_otp_blocked_until`;
    const maxAttempts = 3;
    const blockDuration = 60 * 60 * 1000; // 1 hour in milliseconds

    // Initialize attempts counter if not exists
    if (!req.session[attemptsKey]) {
      req.session[attemptsKey] = 0;
    }

    // Check if user is currently blocked
    const blockedUntil = req.session[attemptsBlockedKey];
    if (blockedUntil && Date.now() < blockedUntil) {
      const remainingMinutes = Math.ceil((blockedUntil - Date.now()) / (60 * 1000));
      return res.status(429).json({
        success: false,
        message: `Too many OTP requests. Please try again after ${remainingMinutes} minute(s).`,
        blockedUntil: blockedUntil,
        retryAfter: remainingMinutes
      });
    }

    // Reset attempts if block period has passed
    if (blockedUntil && Date.now() >= blockedUntil) {
      req.session[attemptsKey] = 0;
      delete req.session[attemptsBlockedKey];
    }

    // Check if user has exceeded max attempts (check BEFORE incrementing)
    if (req.session[attemptsKey] >= maxAttempts) {
      const blockUntil = Date.now() + blockDuration;
      req.session[attemptsBlockedKey] = blockUntil;
      const remainingMinutes = Math.ceil(blockDuration / (60 * 1000));
      
      return res.status(429).json({
        success: false,
        message: `You have exceeded the maximum number of OTP requests (${maxAttempts}). Please try again after ${remainingMinutes} minute(s).`,
        blockedUntil: blockUntil,
        retryAfter: remainingMinutes
      });
    }

    // Increment attempts counter (only if not blocked)
    req.session[attemptsKey] = (req.session[attemptsKey] || 0) + 1;

    // Generate OTP
    const otp = generateOTP();
    console.log('OTP:', otp);
    const fullPhoneNumber = countryCode + cleanPhoneNumber;

    // Store OTP in session with expiration (5 minutes)
    const otpKey = `${type}_otp`;
    const otpExpiryKey = `${type}_otp_expiry`;
    
    req.session[otpKey] = otp;
    req.session[otpExpiryKey] = Date.now() + (5 * 60 * 1000); // 5 minutes
    req.session[`${type}_phone_verified`] = false;
    req.session[`${type}_phone_number`] = fullPhoneNumber;

    // Send OTP via SMS
    const message = `Your ELKABLY verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
    
    try {
      await sendSms({
        recipient: fullPhoneNumber,
        message: message,
      });
      
      console.log(`OTP sent to ${fullPhoneNumber} for ${type}`);
      
      return res.json({
        success: true,
        message: 'OTP sent successfully',
        expiresIn: 300, // 5 minutes in seconds
        attemptsRemaining: maxAttempts - req.session[attemptsKey]
      });
    } catch (smsError) {
      console.error('SMS sending error:', smsError);
      
      // Clear session on SMS failure
      delete req.session[otpKey];
      delete req.session[otpExpiryKey];
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.',
        error: smsError.message,
      });
    }
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while sending OTP',
      error: error.message,
    });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { otp, type } = req.body; // type: 'student' or 'parent'
    
    if (!otp || !type) {
      return res.status(400).json({
        success: false,
        message: 'OTP and type are required',
      });
    }

    const otpKey = `${type}_otp`;
    const otpExpiryKey = `${type}_otp_expiry`;
    const storedOTP = req.session[otpKey];
    const expiryTime = req.session[otpExpiryKey];

    // Check if OTP exists
    if (!storedOTP || !expiryTime) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired. Please request a new OTP.',
      });
    }

    // Check if OTP has expired
    if (Date.now() > expiryTime) {
      delete req.session[otpKey];
      delete req.session[otpExpiryKey];
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    // Verify OTP
    if (otp.toString() !== storedOTP.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.',
      });
    }

    // Mark phone as verified
    req.session[`${type}_phone_verified`] = true;
    
    // Clear OTP from session (one-time use)
    delete req.session[otpKey];
    delete req.session[otpExpiryKey];
    
    // Reset OTP attempts counter on successful verification
    const attemptsKey = `${type}_otp_attempts`;
    const attemptsBlockedKey = `${type}_otp_blocked_until`;
    delete req.session[attemptsKey];
    delete req.session[attemptsBlockedKey];

    return res.json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while verifying OTP',
      error: error.message,
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
    submissionId, // Track submission attempts
  } = req.body;

  // Check if this is a duplicate submission (browser refresh or back button)
  // Only check if submissionId is provided
  if (submissionId && req.session.lastSubmissionId === submissionId) {
    console.log('Duplicate form submission detected:', submissionId);
    req.flash('error_msg', 'Your registration is already being processed. Please do not refresh or resubmit the form.');
    return res.redirect('/auth/register');
  }

  // Store current submission ID in session only if provided
  if (submissionId) {
    req.session.lastSubmissionId = submissionId;
  }

  let errors = [];

  // Verify OTP for student phone number
  if (!req.session.student_phone_verified) {
    errors.push({ 
      msg: 'Student phone number must be verified with OTP before registration',
      field: 'studentNumber'
    });
  }

  // SECURITY: Verify student phone number matches the verified one (prevent tampering)
  if (req.session.student_phone_verified) {
    const cleanStudentNumber = studentNumber.replace(/[^\d]/g, '');
    const verifiedStudentPhone = req.session.student_phone_number || '';
    const expectedStudentPhone = studentCountryCode + cleanStudentNumber;
    
    if (!verifiedStudentPhone || verifiedStudentPhone !== expectedStudentPhone) {
      console.error('Security violation: Student phone number mismatch', {
        verified: verifiedStudentPhone,
        submitted: expectedStudentPhone
      });
      errors.push({ 
        msg: 'Student phone number does not match the verified number. Phone number cannot be changed after verification.',
        field: 'studentNumber'
      });
      // Clear verification to force re-verification
      delete req.session.student_phone_verified;
      delete req.session.student_phone_number;
    }
  }

  // If OTP verification failed, return early with errors
  if (errors.length > 0) {
    console.log('OTP verification errors:', errors);
    return res.render('auth/register', {
      title: 'Register | ELKABLY',
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
      studentPhoneVerified: req.session.student_phone_verified || false,
    });
  }

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

  // Phone number length standards by country code
  const phoneLengthStandards = {
    '+966': 9,  // Saudi Arabia: 9 digits
    '+20': 11,  // Egypt: 11 digits (including leading 0)
    '+971': 9,  // UAE: 9 digits
    '+965': 8   // Kuwait: 8 digits
  };

  // Check if student and parent numbers are the same
  if (studentNumber && parentNumber && 
      studentNumber.trim() === parentNumber.trim() && 
      studentCountryCode === parentCountryCode) {
    errors.push({ msg: 'Student and parent phone numbers cannot be the same' });
  }

  // Validate phone number lengths based on country
  if (studentNumber && studentCountryCode) {
    const cleanStudentNumber = studentNumber.replace(/[^\d]/g, '');
    const expectedLength = phoneLengthStandards[studentCountryCode];
    if (expectedLength && cleanStudentNumber.length !== expectedLength) {
      errors.push({ 
        msg: `Student number must be ${expectedLength} digits for the selected country` 
      });
    }
  }

  if (parentNumber && parentCountryCode) {
    const cleanParentNumber = parentNumber.replace(/[^\d]/g, '');
    const expectedLength = phoneLengthStandards[parentCountryCode];
    if (expectedLength && cleanParentNumber.length !== expectedLength) {
      errors.push({ 
        msg: `Parent number must be ${expectedLength} digits for the selected country` 
      });
    }
  }

  // Basic phone number format validation (digits, spaces, hyphens, parentheses only)
  const phoneRegex = /^[\d\s\-\(\)]+$/;
  if (parentNumber && !phoneRegex.test(parentNumber)) {
    errors.push({
      msg: 'Parent phone number can only contain digits, spaces, hyphens, and parentheses',
    });
  }
  if (studentNumber && !phoneRegex.test(studentNumber)) {
    errors.push({
      msg: 'Student phone number can only contain digits, spaces, hyphens, and parentheses',
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
  if (howDidYouKnow && howDidYouKnow.trim().length < 5) {
    errors.push({ msg: 'Please tell us how you heard about Mr Kably (at least 5 characters)' });
  }

  if (errors.length > 0) {
    return res.render('auth/register', {
      title: 'Register | ELKABLY',
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
      studentPhoneVerified: req.session.student_phone_verified || false,
    });
  }

  try {
    // Check for existing user data in parallel for better performance
    const [existingEmail, existingUsername, existingStudentNumber] = await Promise.all([
      User.findOne({ studentEmail: studentEmail.toLowerCase() }),
      User.findOne({ username: username.trim() }),
      User.findOne({ studentNumber: studentNumber.trim() })
    ]);

    // Collect all validation errors at once
    if (existingEmail) {
      errors.push({ 
        msg: 'Student email is already registered',
        field: 'studentEmail'
      });
    }

    if (existingUsername) {
      errors.push({ 
        msg: 'Username is already taken',
        field: 'username'
      });
    }

    if (existingStudentNumber) {
      errors.push({ 
        msg: 'Student number is already registered',
        field: 'studentNumber'
      });
    }

    // Return all errors at once if any exist
    if (errors.length > 0) {
      console.log('Registration validation errors:', errors);
      return res.render('auth/register', {
        title: 'Register | ELKABLY',
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
      isActive: true, // Students are active by default
      isCompleteData: true, // Normal registration provides all required data
    });

    const savedUser = await newUser.save();
    
    // Clear OTP verification flags after successful registration
    delete req.session.student_phone_verified;
    delete req.session.student_phone_number;
    delete req.session.student_otp;
    delete req.session.student_otp_expiry;
    // Clear rate limiting counters after successful registration
    delete req.session.student_otp_attempts;
    delete req.session.student_otp_blocked_until;
    
    // Send student data to online system API
    try {
      await sendStudentToOnlineSystem(savedUser);
    } catch (apiError) {
      console.error('Failed to sync with online system:', apiError);
      // Continue with registration process even if API call fails
    }

    // Send WhatsApp welcome message to parent
    try {
      await whatsappSMSNotificationService.sendWelcomeMessage(savedUser._id);
    } catch (whatsappError) {
      console.error('WhatsApp welcome message error:', whatsappError);
      // Don't fail the registration if WhatsApp fails
    }

    // Show success page with student code
    res.render('auth/registration-success', {
      title: 'Registration Successful | ELKABLY',
      theme: req.cookies.theme || 'light',
      studentName: savedUser.name,
      studentCode: savedUser.studentCode,
    });
  } catch (err) {
    console.error('Registration error:', err);

    // Reset submission ID to allow retrying
    req.session.lastSubmissionId = null;

    // Handle mongoose validation errors
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map((e) => ({
        msg: e.message,
        field: e.path
      }));
      errors.push(...validationErrors);
      
      console.log('Mongoose validation errors:', validationErrors);
      
      return res.render('auth/register', {
        title: 'Register | ELKABLY',
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
      const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
      
      errors.push({
        msg: `${fieldName} is already in use`,
        field: field
      });
      
      console.log('Duplicate key error:', field, err.keyValue[field]);
      
      return res.render('auth/register', {
        title: 'Register | ELKABLY',
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

    // Handle network errors with API
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.error('Network error during registration:', err);
      req.flash(
        'error_msg',
        'Network connection issue. Your registration is saved but some services may be unavailable. Please try logging in.'
      );
      return res.redirect('/auth/login');
    }

    // Log the full error for debugging
    console.error('Unhandled registration error:', err);
    
    // Generic error for other cases
    req.flash(
      'error_msg',
      'An error occurred during registration. Please try again or contact support if the issue persists.'
    );
    res.redirect('/auth/register');
  }
};

// Login user
const loginUser = async (req, res) => {
  const { email, password, rememberMe, submissionId } = req.body;
  let errors = [];
  
  // Check if this is a duplicate submission (browser refresh or back button)
  if (req.session.lastLoginSubmissionId === submissionId) {
    console.log('Duplicate login submission detected:', submissionId);
    req.flash('error_msg', 'Your login request is already being processed. Please do not refresh or resubmit the form.');
    return res.redirect('/auth/login');
  }
  
  // Store current submission ID in session
  req.session.lastLoginSubmissionId = submissionId;

  // Validate input
  if (!email || !password) {
    errors.push({ msg: 'Please provide both email/phone and password' });
  }

  if (errors.length > 0) {
    // Reset submission ID to allow retrying
    req.session.lastLoginSubmissionId = null;
    
    return res.render('auth/login', {
      title: 'Login | ELKABLY',
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
          { studentNumber: inputValue },
          { $expr: { $eq: [{ $concat: ['$studentCountryCode', '$studentNumber'] }, inputValue] } },
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
    console.log('User found:', user);
    if (!user) {
      errors.push({ msg: 'Invalid email, phone number, or username' });
      return res.render('auth/login', {
        title: 'Login | ELKABLY',
        theme: req.cookies.theme || 'light',
        errors,
        email,
      });
    }

    // Match password (both models implement matchPassword)
    const isMatch = await user.matchPassword(password);

    // Special handling for students with incomplete data - allow login with student code
    if (!isMatch && user.role === 'student' && user.isCompleteData === false) {
      // Try to match with student code
      if (user.studentCode && user.studentCode === password.trim()) {
        console.log('Student logged in with student code:', user.studentCode);
        // Allow login with student code for incomplete data students
      } else {
        errors.push({ msg: 'Invalid email, phone number, or username' });
        return res.render('auth/login', {
          title: 'Login | ELKABLY',
          theme: req.cookies.theme || 'light',
          errors,
          email,
        });
      }
    } else if (!isMatch) {
      errors.push({ msg: 'Invalid email, phone number, or username' });
      return res.render('auth/login', {
        title: 'Login | ELKABLY',
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
          title: 'Login | ELKABLY',
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

    // Generate session token for students to enforce single device login
    let sessionToken = null;
    if (user.role === 'student') {
      sessionToken = crypto.randomBytes(32).toString('hex');
      // Update user with new session token (this invalidates any previous sessions)
      user.sessionToken = sessionToken;
      await user.save();
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
        isCompleteData: user.isCompleteData,
        sessionToken: sessionToken, // Store session token in session for validation
      };
    }

    // Save session and redirect based on role
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        errors.push({ msg: 'An error occurred during login. Please try again.' });
        return res.render('auth/login', {
          title: 'Login | ELKABLY',
          theme: req.cookies.theme || 'light',
          errors,
          email,
        });
      }

      // Simple redirect based on role
      if (user.role === 'admin') {
        return res.redirect('/admin/dashboard');
      } else {
        // Check if student data is complete
        if (user.isCompleteData === false) {
          req.flash('info_msg', 'Please complete your profile to access all features');
          return res.redirect('/auth/complete-data');
        }
        return res.redirect('/student/dashboard');
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    
    // Reset submission ID to allow retrying
    req.session.lastLoginSubmissionId = null;
    
    // Handle different types of errors
    if (err.name === 'MongoServerError') {
      errors.push({ msg: 'Database connection error. Please try again later.' });
    } else if (err.name === 'ValidationError') {
      errors.push({ msg: 'Invalid login credentials. Please check your information.' });
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      errors.push({ msg: 'Network connection issue. Please check your internet connection and try again.' });
    } else {
      errors.push({ msg: 'An error occurred during login. Please try again.' });
    }
    
    // Log detailed error for debugging
    console.error('Login error details:', {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: err.stack
    });
    
    return res.render('auth/login', {
      title: 'Login | ELKABLY',
      theme: req.cookies.theme || 'light',
      errors,
      email,
    });
  }
};

// Logout user
const logoutUser = async (req, res) => {
  // Clear session token from user document if student
  if (req.session && req.session.user && req.session.user.role === 'student' && req.session.user.id) {
    try {
      const user = await User.findById(req.session.user.id);
      if (user) {
        user.sessionToken = null;
        await user.save();
      }
    } catch (err) {
      console.error('Error clearing session token on logout:', err);
    }
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.clearCookie('elkably.session');
    res.redirect('/auth/login');
  });
};

// Function to send student data to the online system API
const sendStudentToOnlineSystem = async (studentData) => {
  try {
    const apiUrl = 'https://942dd72bdca3.ngrok-free.app/api/createOnlineStudent';
    const apiKey = 'SNFIDNWL11SGNDWJD@##SSNWLSGNE!21121';
    
    const payload = {
      Username: `${studentData.firstName} ${studentData.lastName}`,
      phone: studentData.studentNumber,  
      parentPhone: studentData.parentNumber,
      phoneCountryCode: studentData.studentCountryCode.replace('+', ''),
      parentPhoneCountryCode: studentData.parentCountryCode.replace('+', ''),
      email: studentData.studentEmail,
      schoolName: studentData.schoolName,
      Grade: studentData.grade,
      GradeLevel: studentData.grade,
      Code:"K"+studentData.studentCode,
      apiKey: apiKey
    };

    console.log('Sending student data to online system:', payload);
    
    const response = await axios.post(apiUrl, payload);
    
    console.log('Online system API response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending student to online system:', error.message);
    // Don't throw the error, just log it - we don't want to break the registration flow
    return { success: false, error: error.message };
  }
};

// Get complete data page
const getCompleteDataPage = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student') {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/auth/login');
    }

    const user = await User.findById(req.session.user.id);

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/login');
    }

    // If data is already complete, redirect to dashboard
    if (user.isCompleteData) {
      return res.redirect('/student/dashboard');
    }

    res.render('auth/complete-data', {
      title: 'Complete Your Profile | ELKABLY',
      theme: req.cookies.theme || 'light',
      user: user,
      errors: [],
      studentPhoneVerified: req.session.student_phone_verified || false,
    });
  } catch (error) {
    console.error('Error loading complete data page:', error);
    req.flash('error_msg', 'An error occurred. Please try again.');
    res.redirect('/auth/login');
  }
};

// Complete student data
const completeStudentData = async (req, res) => {
  try {
    if (!req.session.user || req.session.user.role !== 'student') {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/auth/login');
    }

    const userId = req.session.user.id;
    const user = await User.findById(userId);

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/login');
    }

    // If data is already complete, redirect to dashboard
    if (user.isCompleteData) {
      return res.redirect('/student/dashboard');
    }

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
      submissionId, // Track submission attempts
    } = req.body;

    // Check if this is a duplicate submission (browser refresh or back button)
    // Only check if submissionId is provided
    if (submissionId && req.session.lastCompleteDataSubmissionId === submissionId) {
      console.log('Duplicate complete data submission detected:', submissionId);
      req.flash('error_msg', 'Your profile completion is already being processed. Please do not refresh or resubmit the form.');
      return res.redirect('/auth/complete-data');
    }

    // Store current submission ID in session only if provided
    if (submissionId) {
      req.session.lastCompleteDataSubmissionId = submissionId;
    }

    let errors = [];

    // Check required fields (same pattern as registerUser)
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

    // Validation
    if (firstName && firstName.trim().length < 2) {
      errors.push({ msg: 'First name must be at least 2 characters' });
    }
    if (lastName && lastName.trim().length < 2) {
      errors.push({ msg: 'Last name must be at least 2 characters' });
    }
    
    // Phone number length standards by country code
    const phoneLengthStandards = {
      '+966': 9,  // Saudi Arabia: 9 digits
      '+20': 11,  // Egypt: 11 digits (including leading 0)
      '+971': 9,  // UAE: 9 digits
      '+965': 8   // Kuwait: 8 digits
    };
    
    // Validate country codes
    const validCountryCodes = ['+966', '+20', '+971', '+965'];
    if (studentCountryCode && !validCountryCodes.includes(studentCountryCode)) {
      errors.push({ msg: 'Please select a valid country code for student number' });
    }
    if (parentCountryCode && !validCountryCodes.includes(parentCountryCode)) {
      errors.push({ msg: 'Please select a valid country code for parent number' });
    }
    
    // Check if student and parent numbers are the same
    if (studentNumber && parentNumber && 
        studentNumber.trim() === parentNumber.trim() && 
        studentCountryCode === parentCountryCode) {
      errors.push({ msg: 'Student and parent phone numbers cannot be the same' });
    }
    
    // Validate phone number lengths based on country (only if both are present)
    if (studentNumber && studentCountryCode) {
      const cleanStudentNumber = studentNumber.replace(/[^\d]/g, '');
      const expectedLength = phoneLengthStandards[studentCountryCode];
      if (expectedLength && cleanStudentNumber.length !== expectedLength) {
        errors.push({ 
          msg: `Student number must be ${expectedLength} digits for the selected country` 
        });
      }
    }

    if (parentNumber && parentCountryCode) {
      const cleanParentNumber = parentNumber.replace(/[^\d]/g, '');
      const expectedLength = phoneLengthStandards[parentCountryCode];
      if (expectedLength && cleanParentNumber.length !== expectedLength) {
        errors.push({ 
          msg: `Parent number must be ${expectedLength} digits for the selected country` 
        });
      }
    }
    
    // Basic phone number format validation (digits, spaces, hyphens, parentheses only)
    const phoneRegex = /^[\d\s\-\(\)]+$/;
    if (parentNumber && !phoneRegex.test(parentNumber)) {
      errors.push({
        msg: 'Parent phone number can only contain digits, spaces, hyphens, and parentheses',
      });
    }
    if (studentNumber && !phoneRegex.test(studentNumber)) {
      errors.push({
        msg: 'Student phone number can only contain digits, spaces, hyphens, and parentheses',
      });
    }
    if (!studentEmail || !studentEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      errors.push({ msg: 'Please enter a valid student email' });
    }
    if (!username || username.trim().length < 3) {
      errors.push({ msg: 'Username must be at least 3 characters' });
    }
    if (!schoolName || schoolName.trim().length < 2) {
      errors.push({ msg: 'School name must be at least 2 characters' });
    }
    if (!grade) {
      errors.push({ msg: 'Please select your grade' });
    }
    if (!englishTeacher || englishTeacher.trim().length < 2) {
      errors.push({ msg: 'English teacher name must be at least 2 characters' });
    }
    if (!password || password.length < 5) {
      errors.push({ msg: 'Password must be at least 5 characters' });
    }
    if (password !== password2) {
      errors.push({ msg: 'Passwords do not match' });
    }
    if (!howDidYouKnow || howDidYouKnow.trim().length < 5) {
      errors.push({ msg: 'Please tell us how you heard about Mr Kably (at least 5 characters)' });
    }

    // Check for duplicates
    const existingEmail = await User.findOne({ studentEmail: studentEmail.toLowerCase() });
    if (existingEmail && existingEmail._id.toString() !== userId) {
      errors.push({ msg: 'Email is already registered' });
    }

    const existingUsername = await User.findOne({ username: username.toLowerCase() });
    if (existingUsername && existingUsername._id.toString() !== userId) {
      errors.push({ msg: 'Username is already taken' });
    }

    // MANDATORY: Check if email is still the temporary one
    if (user.studentEmail && user.studentEmail.startsWith('temp_')) {
      if (studentEmail.toLowerCase().trim() === user.studentEmail.toLowerCase()) {
        errors.push({ msg: 'You must change your email address. The temporary email cannot be used.' });
      }
    }

    // MANDATORY: Check if username is still the temporary one
    if (user.username && user.username.startsWith('student_')) {
      if (username.toLowerCase().trim() === user.username.toLowerCase()) {
        errors.push({ msg: 'You must change your username. The temporary username cannot be used.' });
      }
    }

    // MANDATORY: Check if password is still the student code
    if (user.studentCode && password.trim() === user.studentCode) {
      errors.push({ msg: 'You must create a new password. You cannot use your student code as your password.' });
    }

    if (errors.length > 0) {
      // Reset submission ID to allow retrying
      req.session.lastCompleteDataSubmissionId = null;
      
      return res.render('auth/complete-data', {
        title: 'Complete Your Profile | ELKABLY',
        theme: req.cookies.theme || 'light',
        user: user,
        errors,
        studentPhoneVerified: req.session.student_phone_verified || false,
      });
    }

    // Update user data
    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.studentNumber = studentNumber.trim();
    user.studentCountryCode = studentCountryCode;
    user.parentNumber = parentNumber.trim();
    user.parentCountryCode = parentCountryCode;
    user.studentEmail = studentEmail.toLowerCase().trim();
    user.username = username.toLowerCase().trim();
    user.schoolName = schoolName.trim();
    user.grade = grade;
    user.englishTeacher = englishTeacher.trim();
    user.password = password;
    user.howDidYouKnow = howDidYouKnow.trim();
    user.isCompleteData = true;

    await user.save();

    // Update session
    req.session.user = {
      id: user._id,
      name: user.name,
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
      isCompleteData: user.isCompleteData,
    };

    req.flash('success_msg', 'Profile completed successfully! Welcome to Elkably.');
    res.redirect('/student/dashboard');
  } catch (error) {
    console.error('Error completing student data:', error);
    
    // Reset submission ID to allow retrying
    req.session.lastCompleteDataSubmissionId = null;
    
    req.flash('error_msg', 'An error occurred. Please try again.');
    res.redirect('/auth/complete-data');
  }
};

// ==================== EXTERNAL SYSTEM API ====================

// Create student from external system (similar to bulk import)
const createStudentFromExternalSystem = async (req, res) => {
  try {
    const {
      studentName,
      studentPhone,
      parentPhone,
      studentCode,
      apiKey
    } = req.body;

    // Validate API key for security
    const validApiKey = process.env.EXTERNAL_SYSTEM_API_KEY || 'SNFIDNWL11SGNDWJD@##SSNWLSGNE!21121';
    if (!apiKey || apiKey !== validApiKey) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized: Invalid API key' 
      });
    }

    // Validate required fields
    if (!studentName || !studentPhone || !parentPhone || !studentCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields', 
        requiredFields: ['studentName', 'studentPhone', 'parentPhone', 'studentCode'] 
      });
    }

    // Parse student name
    const nameParts = studentName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || 'Student';

    // Parse phone numbers (expecting format: +966XXXXXXXXX or just XXXXXXXXX)
    let studentNumber = studentPhone.toString().trim();
    let parentNumber = parentPhone.toString().trim();

    // Remove any non-numeric characters except +
    studentNumber = studentNumber.replace(/[^\d+]/g, '');
    parentNumber = parentNumber.replace(/[^\d+]/g, '');

    // Determine country code
    let studentCountryCode = '+20';
    let parentCountryCode = '+20';

    // Handle student phone country code
    if (studentNumber.startsWith('+')) {
      if (studentNumber.startsWith('+966')) {
        studentCountryCode = '+966';
        studentNumber = studentNumber.substring(4);
      } else if (studentNumber.startsWith('+20')) {
        studentCountryCode = '+20';
        studentNumber = studentNumber.substring(3);
      } else if (studentNumber.startsWith('+971')) {
        studentCountryCode = '+971';
        studentNumber = studentNumber.substring(4);
      } else if (studentNumber.startsWith('+965')) {
        studentCountryCode = '+965';
        studentNumber = studentNumber.substring(4);
      } else {
        // If starts with + but not a recognized code, default to +966
        studentCountryCode = '+20';
        studentNumber = studentNumber.substring(1);
      }
    }

    // Handle parent phone country code
    if (parentNumber.startsWith('+')) {
      if (parentNumber.startsWith('+966')) {
        parentCountryCode = '+966';
        parentNumber = parentNumber.substring(4);
      } else if (parentNumber.startsWith('+20')) {
        parentCountryCode = '+20';
        parentNumber = parentNumber.substring(3);
      } else if (parentNumber.startsWith('+971')) {
        parentCountryCode = '+971';
        parentNumber = parentNumber.substring(4);
      } else if (parentNumber.startsWith('+965')) {
        parentCountryCode = '+965';
        parentNumber = parentNumber.substring(4);
      } else {
        // If starts with + but not a recognized code, default to +966
        parentCountryCode = '+20';
        parentNumber = parentNumber.substring(1);
      }
    }

    // Check if student code already exists
    const existingStudent = await User.findOne({ studentCode: studentCode.toString() });
    if (existingStudent) {
      return res.status(409).json({ 
        success: false, 
        message: 'Student code already exists',
        existingStudent: {
          id: existingStudent._id,
          name: existingStudent.name,
          code: existingStudent.studentCode
        }
      });
    }

    // Check if phone number already exists
    const existingPhone = await User.findOne({ studentNumber: studentNumber });
    if (existingPhone) {
      return res.status(409).json({ 
        success: false, 
        message: 'Phone number already registered',
        existingStudent: {
          id: existingPhone._id,
          name: existingPhone.name,
          phone: existingPhone.studentNumber
        }
      });
    }

    // Generate temporary email and username
    const tempEmail = `temp_${studentCode}@elkably.com`;
    const tempUsername = `student_${studentCode}`;

    // Create student with incomplete data
    const newStudent = new User({
      firstName,
      lastName,
      studentNumber,
      studentCountryCode,
      parentNumber,
      parentCountryCode,
      studentEmail: tempEmail,
      username: tempUsername,
      schoolName: 'To Be Completed',
      grade: 'Year 10',
      englishTeacher: 'To Be Completed',
      password: studentCode, // Temporary password (student code)
      howDidYouKnow: 'External System Import',
      studentCode: studentCode.toString(),
      isCompleteData: false,
      isActive: true,
    });

    const savedStudent = await newStudent.save();

    // Return success response with student data
    return res.status(201).json({
      success: true,
      message: 'Student created successfully from external system',
      studentData: {
        id: savedStudent._id,
        firstName: savedStudent.firstName,
        lastName: savedStudent.lastName,
        studentCode: savedStudent.studentCode,
        studentPhone: `${savedStudent.studentCountryCode}${savedStudent.studentNumber}`,
        parentPhone: `${savedStudent.parentCountryCode}${savedStudent.parentNumber}`,
        email: savedStudent.studentEmail,
        username: savedStudent.username,
        isCompleteData: savedStudent.isCompleteData,
        isActive: savedStudent.isActive,
        createdAt: savedStudent.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating student from external system:', error);
    
    // Handle duplicate key errors
    if (error.name === 'MongoServerError' && error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        success: false, 
        message: 'Duplicate entry', 
        field: field,
        error: `The ${field} is already in use.`
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error', 
        errors: validationErrors 
      });
    }
    
    // Handle other errors
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
};

module.exports = {
  getLoginPage,
  getRegisterPage,
  registerUser,
  loginUser,
  logoutUser,
  getCreateAdminPage,
  createAdmin,
  getCompleteDataPage,
  completeStudentData,
  // OTP functions
  sendOTP,
  verifyOTP,
  // External System API
  createStudentFromExternalSystem,
};

