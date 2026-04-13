/**
 * Student mobile API — JSON routes under /api/student
 */
const express = require('express');
const multer = require('multer');
const auth = require('../controllers/studentMobileAuthController');
const mobile = require('../controllers/studentMobileController');
const notif = require('../controllers/studentMobileNotificationController');
const { authenticateStudentMobile } = require('../middlewares/studentMobileAuth');
const { profilePictureFileFilter } = require('../utils/profilePictureFileFilter');

const router = express.Router();

// Avoid TypeError when clients omit body or Content-Type (parsers leave req.body undefined)
router.use((req, res, next) => {
  if (req.body == null) req.body = {};
  next();
});

const profilePictureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: profilePictureFileFilter,
});

const requireCompleteProfile = (req, res, next) => {
  const u = req.studentMobileUser;
  if (u && u.isCompleteData === false) {
    return res.status(403).json({
      success: false,
      message: 'Please complete your profile to continue',
      requiresCompleteData: true,
    });
  }
  next();
};

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'Profile picture too large. Maximum file size is 5MB.',
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (
    err.message &&
    (err.message.includes('Only image files') ||
      err.message.includes('image files are allowed'))
  ) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
};

// ==================== Public ====================
router.post('/login', auth.login);
router.post('/register/send-otp', auth.registerSendOtp);
router.post('/register/verify-otp', auth.registerVerifyOtp);
router.post('/register', auth.register);
router.post('/forgot-password/initiate', auth.forgotPasswordInitiate);
router.post('/forgot-password/verify-otp', auth.forgotPasswordVerifyOtp);
router.post('/reset-password', auth.resetPassword);

// ==================== Authenticated ====================
router.use(authenticateStudentMobile);

router.post('/refresh-token', auth.refreshToken);
router.post('/logout', auth.logout);
router.post('/update-fcm-token', auth.updateFcmToken);
router.post('/complete-data', auth.completeStudentData);

router.use(requireCompleteProfile);

// Dashboard & courses
router.get('/dashboard', mobile.getDashboard);
router.get('/courses', mobile.getEnrolledCourses);
router.get('/courses/:courseId/content', mobile.getCourseContent);
router.get('/content/:contentId', mobile.getContentDetails);
router.post('/content/progress', mobile.updateContentProgress);
router.get('/debug/progress/:courseId', mobile.debugProgress);

// Content quiz (open GET /content/:contentId when unlocked — includes quizTake + legacy timing fields)
router.post('/content/quiz/submit', mobile.submitContentQuiz);
router.post('/content/quiz/question', mobile.getSecureQuestion);
router.post('/content/quiz/all-questions', mobile.getSecureAllQuestions);
router.post('/content/quiz/check-answer', mobile.checkQuestionAnswered);
router.get('/content/:contentId/results', mobile.getContentQuizResults);

// Standalone quizzes
router.get('/quizzes', mobile.getQuizzesList);
router.get('/quizzes/:quizId/details', mobile.getQuizDetailsJson);
router.get('/quizzes/:quizId/take', mobile.getTakeQuizJson);
router.post('/quiz/secure-questions', mobile.getSecureStandaloneQuizQuestions);
router.post('/quizzes/:quizId/submit', mobile.submitStandaloneQuiz);
router.get('/quizzes/:quizId/results', mobile.getStandaloneQuizResultsJson);

// Wishlist & orders
router.get('/wishlist', mobile.getWishlist);
router.post('/wishlist/add/:id', mobile.addWishlist);
router.delete('/wishlist/remove/:id', mobile.removeWishlist);
router.get('/order-history', mobile.getOrderHistory);
router.get('/order/:orderNumber', mobile.getOrderDetails);
router.get('/homework-attempts', mobile.getHomeworkAttempts);

// Profile & settings
router.get('/profile', mobile.getProfile);
router.put('/profile', mobile.updateProfile);
router.post(
  '/profile/picture',
  profilePictureUpload.single('profilePicture'),
  mobile.updateProfilePicture,
);
router.post('/profile/send-otp', auth.profileSendOtp);
router.post('/profile/verify-otp', auth.profileVerifyOtp);
router.get('/settings', mobile.getSettings);
router.put('/settings', mobile.updateSettings);
router.put('/settings/password', mobile.changePassword);

// Zoom
router.post('/zoom/meetings/:meetingId/join', mobile.joinZoomMeeting);
router.post('/zoom/meetings/:meetingId/leave', mobile.leaveZoomMeeting);
router.get('/zoom/history', mobile.getZoomMeetingHistory);

// Notifications
router.get('/notifications', notif.getNotifications);
router.get('/notifications/:notificationId', notif.getNotificationById);
router.put('/notifications/:notificationId/read', notif.markAsRead);
router.put('/notifications/mark-all-read', notif.markAllAsRead);

router.use(handleMulterError);

module.exports = router;
