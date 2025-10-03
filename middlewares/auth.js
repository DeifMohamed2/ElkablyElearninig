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

// Alternative naming for consistency
const ensureAuthenticated = isAuthenticated;
const ensureStudent = isStudent;
const ensureAdmin = isAdmin;

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
  isAdmin,
  isStudent,
  ensureAuthenticated,
  ensureStudent,
  ensureAdmin,
};

