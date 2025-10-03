const express = require('express');
const router = express.Router();
const { isNotAuthenticated } = require('../middlewares/auth');
const { 
  getLoginPage, 
  getRegisterPage, 
  registerUser, 
  loginUser, 
  logoutUser,
  getCreateAdminPage,
  createAdmin,
} = require('../controllers/authController');

// Login page
router.get('/login', isNotAuthenticated, getLoginPage);
// Login submit
router.post('/login', loginUser);

// Register page
router.get('/register', isNotAuthenticated, getRegisterPage);
// Register submit
router.post('/register', registerUser);

// Logout handle
router.get('/logout', logoutUser);

// Hidden admin creation (token-protected)
router.get('/admin/create', getCreateAdminPage);
router.post('/admin/create', createAdmin);

module.exports = router;
