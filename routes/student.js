const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { ensureAuthenticated, ensureStudent, ensureDataComplete } = require('../middlewares/auth');

// Import Game Room Controller
const {
  getAvailableGameRooms,
  joinGameRoom,
  getGameRoomPlay,
  leaveGameRoom,
  getMyGameHistory,
  getGameRoomData,
  getLeaderboard
} = require('../controllers/gameRoomController');
const multer = require('multer');

// Configure multer for profile picture uploads
const profilePictureUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for profile pictures
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    const allowedExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;
    
    if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.test(file.originalname)) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, WebP) are allowed for profile pictures'));
    }
  }
});

// Apply authentication middleware to all routes
router.use(ensureAuthenticated);
router.use(ensureStudent);
router.use(ensureDataComplete);

// Dashboard
router.get('/', studentController.dashboard);
router.get('/dashboard', studentController.dashboard);

// Enrolled Courses
router.get('/enrolled-courses', studentController.enrolledCourses);
router.get('/course/:id', studentController.courseDetails);
router.get('/course/:id/content', studentController.courseContent);
router.get('/content/:id', studentController.contentDetails);
router.post('/content/progress/update', studentController.updateContentProgress);
router.get('/debug/progress/:courseId', studentController.debugProgress);

// Content Quiz/Homework
router.get('/content/:id/take', studentController.takeContentQuiz);
router.post('/content/quiz/submit', studentController.submitContentQuiz);
router.get('/content/:id/results', studentController.quizResults);

// Secure Quiz Endpoints
router.post('/content/quiz/question', studentController.getSecureQuestion);
router.post('/content/quiz/all-questions', studentController.getSecureAllQuestions);
router.post('/content/quiz/check-answer', studentController.checkQuestionAnswered);

// Secure Standalone Quiz endpoints
router.post('/quiz/secure-questions', studentController.getSecureStandaloneQuizQuestions);

// Quizzes
router.get('/quizzes', studentController.quizzes);
router.get('/quiz/:id/details', studentController.getQuizDetails);
router.get('/quiz/:id/start', studentController.startQuizAttempt);
router.get('/quiz/:id/take', studentController.takeQuizPage);
router.post('/quiz/:id/submit', studentController.submitStandaloneQuiz);
router.get('/quiz/:id/results', studentController.getStandaloneQuizResults);

// Game Rooms
router.get('/game-rooms', getAvailableGameRooms);
router.get('/game-room/:roomCode/join', joinGameRoom);
router.get('/game-room/:roomCode/play', getGameRoomPlay);
router.get('/game-room/:roomCode/leave', leaveGameRoom);
router.get('/game-history', getMyGameHistory);
router.get('/api/game-room/:roomCode/data', getGameRoomData);
router.get('/api/game-room/:roomId/leaderboard', getLeaderboard);

// Wishlist
router.get('/wishlist', studentController.wishlist);
router.post('/wishlist/add/:id', studentController.addToWishlist);
router.delete('/wishlist/remove/:id', studentController.removeFromWishlist);

// Order History
router.get('/order-history', studentController.orderHistory);
router.get('/order/:orderNumber', studentController.orderDetails);

// Homework Attempts
router.get('/homework-attempts', studentController.homeworkAttempts);

// Profile
router.get('/profile', studentController.profile);
router.put('/profile/update', studentController.updateProfile);
router.post('/profile/update-picture', profilePictureUpload.single('profilePicture'), studentController.updateProfilePicture);

// Settings
router.get('/settings', studentController.settings);
router.put('/settings/update', studentController.updateSettings);
router.put('/settings/change-password', studentController.changePassword);
router.get('/settings/export-data', studentController.exportData);
router.delete('/settings/delete-account', studentController.deleteAccount);

// Error handler for multer file upload errors
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        success: false, 
        message: 'Profile picture too large. Maximum file size is 5MB.' 
      });
    }
    return res.status(400).json({ 
      success: false, 
      message: 'File upload error: ' + err.message 
    });
  }
  
  if (err.message.includes('Only image files')) {
    return res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
  
  next(err);
};

// Apply multer error handler
router.use(handleMulterError);

// Logout - redirect to auth logout
router.post('/logout', (req, res) => res.redirect('/auth/logout'));
router.get('/logout', (req, res) => res.redirect('/auth/logout'));

module.exports = router;
