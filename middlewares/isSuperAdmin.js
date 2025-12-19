const Admin = require('../models/Admin');

/**
 * Middleware to check if the logged-in admin is a super admin
 */
const isSuperAdmin = async (req, res, next) => {
  try {
    // Check if admin is logged in (using req.session.user, not req.session.admin)
    if (!req.session || !req.session.user) {
      req.flash('error_msg', 'Please log in to access this page');
      return res.redirect('/auth/login');
    }

    // Check if user is admin or superAdmin
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'superAdmin') {
      req.flash('error_msg', 'Unauthorized: Admins only');
      return res.redirect('/auth/login');
    }

    // Get admin from database to check role
    const admin = await Admin.findById(req.session.user.id);

    if (!admin) {
      req.flash('error_msg', 'Admin account not found');
      return res.redirect('/auth/login');
    }

    // Check if admin is super admin
    if (admin.role !== 'superAdmin') {
      req.flash('error_msg', 'Access denied. This page is only accessible to super administrators.');
      return res.redirect('/admin/dashboard');
    }

    // Admin is super admin, proceed
    next();
  } catch (error) {
    console.error('Error in isSuperAdmin middleware:', error);
    req.flash('error_msg', 'An error occurred while checking permissions');
    res.redirect('/admin/dashboard');
  }
};

module.exports = { isSuperAdmin };



