const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const guestController = require('../controllers/guestController');

// Validation rules
const guestRegistrationValidation = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('phone')
    .trim()
    .isLength({ min: 8, max: 15 })
    .withMessage('Please provide a valid phone number'),
  body('parentPhone')
    .trim()
    .isLength({ min: 8, max: 15 })
    .withMessage('Please provide a valid parent phone number'),
];

// Guest authentication page
router.get('/auth', guestController.getGuestAuthPage);

// Register as guest user
router.post('/register', guestRegistrationValidation, guestController.registerGuestUser);

// Guest dashboard
router.get('/dashboard', guestController.getGuestDashboard);

// Guest quiz routes
router.get('/quiz/:id/details', guestController.getGuestQuizDetails);
router.get('/quiz/:id/start', guestController.startGuestQuizAttempt);
router.get('/quiz/:id/take', guestController.takeGuestQuizPage);
router.post('/quiz/:id/submit', guestController.submitGuestQuiz);
router.get('/quiz/:id/results', guestController.getGuestQuizResults);

// Secure quiz questions API
router.post('/quiz/secure-questions', guestController.getSecureGuestQuizQuestions);

// Logout
router.get('/logout', guestController.logoutGuestUser);

module.exports = router;
