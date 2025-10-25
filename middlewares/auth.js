// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.id) {
    return next();
  }
  req.flash('error_msg', 'Please log in to access this page');
  res.redirect('/auth/login');
};

// Middleware to check if user is not authenticated
const isNotAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return next();
  }
  // If user is already authenticated, redirect to appropriate dashboard
  if (req.session.user.role === 'admin') {
    return res.redirect('/admin/dashboard');
  } else if (req.session.user.role === 'student') {
    return res.redirect('/student/dashboard');
  }
  return next();
};

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error_msg', 'Unauthorized: Admins only');
  res.redirect('/auth/login');
};

// Middleware to check if user is student
const isStudent = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'student') {
    return next();
  }
  req.flash('error_msg', 'Unauthorized: Students only');
  res.redirect('/auth/login');
};

// Middleware to check if student has completed their data
const isDataComplete = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'student') {
    // Allow access to complete-data page even if data is incomplete
    if (req.path === '/auth/complete-data' || req.path === '/auth/complete-data') {
      return next();
    }
    
    // Check if student data is complete
    if (req.session.user.isCompleteData === false) {
      req.flash('info_msg', 'Please complete your profile to continue');
      return res.redirect('/auth/complete-data');
    }
  }
  return next();
};

// Alternative naming for consistency
const ensureAuthenticated = isAuthenticated;
const ensureStudent = isStudent;
const ensureAdmin = isAdmin;
const ensureDataComplete = isDataComplete;

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
  isAdmin,
  isStudent,
  isDataComplete,
  ensureAuthenticated,
  ensureStudent,
  ensureAdmin,
  ensureDataComplete,
};

