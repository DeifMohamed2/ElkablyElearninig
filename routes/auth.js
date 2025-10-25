const express = require('express');
const router = express.Router();
const { isNotAuthenticated, isAuthenticated } = require('../middlewares/auth');
const { 
  getLoginPage, 
  getRegisterPage, 
  registerUser, 
  loginUser, 
  logoutUser,
  getCreateAdminPage,
  createAdmin,
  getCompleteDataPage,
  completeStudentData,
  createStudentFromExternalSystem,
} = require('../controllers/authController');

// Login page
router.get('/login', isNotAuthenticated, getLoginPage);
// Login submit
router.post('/login', loginUser);

// Register page
router.get('/register', isNotAuthenticated, getRegisterPage);
// Register submit
router.post('/register', registerUser);

// Complete data page (for students with incomplete profiles)
router.get('/complete-data', isAuthenticated, getCompleteDataPage);
router.post('/complete-data', isAuthenticated, completeStudentData);

// Logout handle
router.get('/logout', logoutUser);

// Hidden admin creation (token-protected)
router.get('/admin/create-admin', getCreateAdminPage);
router.post('/admin/create-admin', createAdmin);

// External System API
router.post('/api/create-student-external', createStudentFromExternalSystem);




module.exports = router;
