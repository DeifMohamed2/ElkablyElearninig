const Admin = require('../models/Admin');
const User = require('../models/User');
const TeamMember = require('../models/TeamMember');
const axios = require('axios');

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
  if (howDidYouKnow && howDidYouKnow.trim().length < 3) {
    errors.push({ msg: 'Please tell us how you heard about Mr Kably (at least 3 characters)' });
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
    });

    const savedUser = await newUser.save();
    
    // Send student data to online system API
    try {
      await sendStudentToOnlineSystem(savedUser);
    } catch (apiError) {
      console.error('Failed to sync with online system:', apiError);
      // Continue with registration process even if API call fails
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
          { parentNumber: inputValue },
          { $expr: { $eq: [{ $concat: ['$studentCountryCode', '$studentNumber'] }, inputValue] } },
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
const logoutUser = (req, res) => {
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

// ==================== TEAM MANAGEMENT ====================

// Get team management page
const getTeamManagementPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filters = {
      search: req.query.search || '',
      isActive: req.query.isActive || ''
    };

    const [teamMembers, totalMembers] = await TeamMember.getForAdmin(page, limit, filters);
    const totalPages = Math.ceil(totalMembers / limit);

    // Get statistics
    const stats = {
      total: await TeamMember.countDocuments(),
      active: await TeamMember.countDocuments({ isActive: true }),
      inactive: await TeamMember.countDocuments({ isActive: false })
    };

    res.render('admin/team-management', {
      title: 'Team Management | ELKABLY',
      teamMembers,
      pagination: {
        currentPage: page,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        prevPage: page - 1,
        nextPage: page + 1,
        totalMembers
      },
      stats,
      filters
    });
  } catch (error) {
    console.error('Error loading team management page:', error);
    req.flash('error_msg', 'Failed to load team management page');
    res.redirect('/admin');
  }
};

// Get single team member for editing
const getTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const teamMember = await TeamMember.findById(id);
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    res.json({
      success: true,
      data: teamMember
    });
  } catch (error) {
    console.error('Error getting team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get team member'
    });
  }
};

// Create new team member
const createTeamMember = async (req, res) => {
  try {
    const { name, position, image, fallbackInitials, displayOrder, isActive } = req.body;

    // Validate required fields
    if (!name || !position) {
      return res.status(400).json({
        success: false,
        message: 'Name and position are required'
      });
    }

    const teamMember = new TeamMember({
      name,
      position,
      image: image || null,
      fallbackInitials,
      displayOrder: parseInt(displayOrder) || 0,
      isActive: isActive === 'true'
    });

    await teamMember.save();

    res.json({
      success: true,
      message: 'Team member created successfully',
      data: teamMember
    });
  } catch (error) {
    console.error('Error creating team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create team member'
    });
  }
};

// Update team member
const updateTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, position, image, fallbackInitials, displayOrder, isActive } = req.body;

    const teamMember = await TeamMember.findById(id);
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    // Update fields
    teamMember.name = name;
    teamMember.position = position;
    teamMember.image = image || null;
    teamMember.fallbackInitials = fallbackInitials;
    teamMember.displayOrder = parseInt(displayOrder) || 0;
    teamMember.isActive = isActive === 'true';

    await teamMember.save();

    res.json({
      success: true,
      message: 'Team member updated successfully',
      data: teamMember
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update team member'
    });
  }
};

// Delete team member
const deleteTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const teamMember = await TeamMember.findById(id);
    
    if (!teamMember) {
      return res.status(404).json({
        success: false,
        message: 'Team member not found'
      });
    }

    await TeamMember.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Team member deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting team member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete team member'
    });
  }
};

// Export team members
const exportTeamMembers = async (req, res) => {
  try {
    const teamMembers = await TeamMember.find({})
      .sort({ displayOrder: 1, createdAt: -1 })
      .select('name position image fallbackInitials displayOrder isActive createdAt');

    // Simple CSV export
    const csvHeader = 'Name,Position,Image URL,Fallback Initials,Display Order,Active,Created At\n';
    const csvData = teamMembers.map(member => 
      `"${member.name}","${member.position}","${member.image || ''}","${member.fallbackInitials}",${member.displayOrder},${member.isActive},"${member.createdAt.toISOString()}"`
    ).join('\n');

    const csv = csvHeader + csvData;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="team-members-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export team members'
    });
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

    // Validation
    if (!firstName || firstName.trim().length < 2) {
      errors.push({ msg: 'First name must be at least 2 characters' });
    }
    if (!lastName || lastName.trim().length < 2) {
      errors.push({ msg: 'Last name must be at least 2 characters' });
    }
    if (!studentNumber || studentNumber.trim().length < 10) {
      errors.push({ msg: 'Student phone number must be at least 10 characters' });
    }
    if (!parentNumber || parentNumber.trim().length < 10) {
      errors.push({ msg: 'Parent phone number must be at least 10 characters' });
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
    if (!howDidYouKnow || howDidYouKnow.trim().length < 3) {
      errors.push({ msg: 'Please tell us how you heard about Mr Kably (at least 3 characters)' });
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
  // Team Management
  getTeamManagementPage,
  getTeamMember,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  exportTeamMembers,

  // External System API
  createStudentFromExternalSystem,
};

