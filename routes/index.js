const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/auth');
const {
  getLandingPage,
  getOnlineCourses,
  getOngroundCourses,
  getRecordedCourses,
  getBundleContent,
  getESTTests,
  getSATTests,
  getACTTests
} = require('../controllers/landingController');

// Landing page route
router.get('/', getLandingPage);

// Courses page route
router.get('/courses', (req, res) => {
  res.render('courses', {
    title: 'Courses - Mr Kably',
    theme: req.cookies.theme || 'light',
  });
});

// Online courses page route
router.get('/courses/online', getOnlineCourses);

// On-ground courses page route
router.get('/courses/onground', getOngroundCourses);

// Recorded courses page route
router.get('/courses/recorded', getRecordedCourses);

// Bundle course details route
router.get('/bundle/:id', getBundleContent);

// Bundle course content route
router.get('/bundle/:id/content', getBundleContent);

// Test type routes
router.get('/tests/est', getESTTests);
router.get('/tests/sat', getSATTests);
router.get('/tests/act', getACTTests);

// Dashboard route (protected) - Redirect based on user role
router.get('/dashboard', isAuthenticated, (req, res) => {
  if (req.session.user.role === 'admin') {
    return res.redirect('/admin/dashboard');
  } else if (req.session.user.role === 'student') {
    return res.redirect('/student/dashboard');
  }
  // Default fallback
  res.redirect('/auth/login');
});

// Theme toggle endpoint
router.post('/toggle-theme', (req, res) => {
  const currentTheme = req.cookies.theme || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';

  res.cookie('theme', newTheme, { maxAge: 365 * 24 * 60 * 60 * 1000 }); // 1 year
  res.json({ theme: newTheme });
});

module.exports = router;

