const Admin = require('../models/Admin');
const User = require('../models/User');
const TeamMember = require('../models/TeamMember');
const axios = require('axios');

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
    submissionId, // Track submission attempts
  } = req.body;

  // Check if this is a duplicate submission (browser refresh or back button)
  if (req.session.lastSubmissionId === submissionId) {
    console.log('Duplicate form submission detected:', submissionId);
    req.flash('error_msg', 'Your registration is already being processed. Please do not refresh or resubmit the form.');
    return res.redirect('/auth/register');
  }

  // Store current submission ID in session
  req.session.lastSubmissionId = submissionId;

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

  if (errors.length > 0) {
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
      title: 'Registration Successful',
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
      const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
      
      errors.push({
        msg: `${fieldName} is already in use`,
        field: field
      });
      
      console.log('Duplicate key error:', field, err.keyValue[field]);
      
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
      title: 'Team Management',
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


module.exports = {
  getLoginPage,
  getRegisterPage,
  registerUser,
  loginUser,
  logoutUser,
  getCreateAdminPage,
  createAdmin,
  // Team Management
  getTeamManagementPage,
  getTeamMember,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  exportTeamMembers,
  // Site Settings Management
};

