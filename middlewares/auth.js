const User = require('../models/User');

// Helper function to safely call req.flash() when sessions are available
const safeFlash = (req, type, message) => {
  try {
    // Check if req.session exists and req.flash is available
    if (req.session && typeof req.flash === 'function') {
      req.flash(type, message);
    } else {
      // Log the message if flash is not available (e.g., in Socket.IO contexts)
      console.log(`[Flash Message] ${type}: ${message}`);
    }
  } catch (err) {
    // If flash fails, log the error and the message
    console.error('Error calling req.flash():', err.message);
    console.log(`[Flash Message] ${type}: ${message}`);
  }
};

// Middleware to check if user is authenticated
const isAuthenticated = async (req, res, next) => {
  if (req.session && req.session.user && req.session.user.id) {
    // For students, validate session token to ensure single device login
    if (req.session.user.role === 'student') {
      try {
        const user = await User.findById(req.session.user.id);
        
        // If user doesn't exist or session token doesn't match, invalidate session
        if (!user || !user.sessionToken || user.sessionToken !== req.session.user.sessionToken) {
          // Clear session token from user document if user exists
          if (user && user.sessionToken) {
            user.sessionToken = null;
            await user.save();
          }
          
          // Destroy session and redirect to login
          req.session.destroy((err) => {
            if (err) {
              console.error('Error destroying session:', err);
            }
          });
          res.clearCookie('elkably.session');
          safeFlash(req, 'error_msg', 'Your account is being used on another device. Please log in again.');
          return res.redirect('/auth/login');
        }
      } catch (err) {
        console.error('Error validating session token:', err);
        safeFlash(req, 'error_msg', 'An error occurred. Please log in again.');
        return res.redirect('/auth/login');
      }
    }
    
    return next();
  }
  safeFlash(req, 'error_msg', 'Please log in to access this page');
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
  safeFlash(req, 'error_msg', 'Unauthorized: Admins only');
  res.redirect('/auth/login');
};

// Middleware to check if user is student
const isStudent = async (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'student') {
    // Validate session token for single device login
    try {
      const user = await User.findById(req.session.user.id);
      
      // If user doesn't exist or session token doesn't match, invalidate session
      if (!user || !user.sessionToken || user.sessionToken !== req.session.user.sessionToken) {
        // Clear session token from user document if user exists
        if (user && user.sessionToken) {
          user.sessionToken = null;
          await user.save();
        }
        
        // Destroy session and redirect to login
        req.session.destroy((err) => {
          if (err) {
            console.error('Error destroying session:', err);
          }
        });
        res.clearCookie('elkably.session');
        safeFlash(req, 'error_msg', 'Your account is being used on another device. Please log in again.');
        return res.redirect('/auth/login');
      }
      
      return next();
    } catch (err) {
      console.error('Error validating session token:', err);
      safeFlash(req, 'error_msg', 'An error occurred. Please log in again.');
      return res.redirect('/auth/login');
    }
  }
  safeFlash(req, 'error_msg', 'Unauthorized: Students only');
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
      safeFlash(req, 'info_msg', 'Please complete your profile to continue');
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

