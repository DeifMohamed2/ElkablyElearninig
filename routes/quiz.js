const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const multer = require('multer');
const { isAdmin } = require('../middlewares/auth');

// Configure multer for thumbnail uploads
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for thumbnails
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error('Only JPEG, PNG, and GIF images are allowed for thumbnails')
      );
    }
  },
});
const {
  getAllQuizzes,
  getCreateQuiz,
  getQuestionsFromBank,
  getQuestionsFromMultipleBanks,
  getQuestionPreview,
  createQuiz,
  getEditQuiz,
  updateQuiz,
  getQuizDetails,
  deleteQuiz,
  restoreQuiz,
  getTrashQuizzes,
  getQuizStatsAPI,
  updateQuizStatus,
  resetStudentQuizAttempts,
  getQuizStats,
  uploadQuizThumbnail,
  getQuizThumbnail,
  updateQuizThumbnail,
  getQuizStudentReview,
} = require('../controllers/quizController');

// Import admin controller for export
const { exportQuizDetails } = require('../controllers/adminController');

// Validation rules
const quizValidation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Title must be between 3 and 200 characters'),
  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      // If description is provided, it must be between 10 and 1000 characters
      if (value && value.length > 0) {
        if (value.length < 10 || value.length > 1000) {
          throw new Error('Description must be between 10 and 1000 characters if provided');
        }
      }
      return true;
    }),
  body('code')
    .trim()
    .isLength({ min: 3, max: 20 })
    .matches(/^[A-Z0-9-]+$/)
    .withMessage(
      'Code must be 3-20 characters, uppercase letters, numbers, and hyphens only'
    ),
  body('questionBank')
    .optional()
    .isMongoId()
    .withMessage('Valid question bank is required'),
  body('questionBanks')
    .optional()
    .custom((value) => {
      // If questionBanks is provided, it must be an array of MongoDB ObjectIds
      if (value) {
        if (Array.isArray(value)) {
          if (value.length === 0) {
            throw new Error('At least one question bank is required');
          }
          // Validate each ID
          const mongoose = require('mongoose');
          for (const id of value) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
              throw new Error('Invalid question bank ID in questionBanks array');
            }
          }
        } else {
          throw new Error('questionBanks must be an array');
        }
      }
      return true;
    }),
  body('questionBank')
    .custom((value, { req }) => {
      // At least one of questionBank or questionBanks must be provided
      if (!value && (!req.body.questionBanks || req.body.questionBanks.length === 0)) {
        throw new Error('At least one question bank is required');
      }
      return true;
    }),
  body('duration')
    .isInt({ min: 0, max: 480 })
    .withMessage(
      'Duration must be between 0 and 480 minutes (0 = no time limit)'
    ),
  body('difficulty')
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Difficulty must be easy, medium, or hard'),
  body('passingScore')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Passing score must be between 0 and 100'),
  body('maxAttempts')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Max attempts must be between 1 and 10'),
  body('instructions')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Instructions cannot exceed 2000 characters'),
];

const idValidation = [
  param('id').isMongoId().withMessage('Invalid quiz ID'),
  param('bankId').isMongoId().withMessage('Invalid question bank ID'),
  param('questionId').isMongoId().withMessage('Invalid question ID'),
];

// Apply authentication middleware to all routes
router.use(isAdmin);

// Quiz listing and management routes
router.get('/', getAllQuizzes);
router.get('/create', getCreateQuiz);

// Specific routes (must come before parameterized routes)
router.get('/trash', getTrashQuizzes);
router.get('/stats', getQuizStatsAPI);

// API routes for question bank operations
router.get('/api/banks/:bankId/questions', getQuestionsFromBank);
router.post('/api/banks/multiple/questions', getQuestionsFromMultipleBanks);
router.get('/api/questions/:questionId/preview', getQuestionPreview);

// Statistics
router.get('/api/stats', getQuizStats);

// Parameterized routes (must come after specific routes)
router.get('/:id', getQuizDetails);
router.get('/:id/edit', getEditQuiz);
router.get('/:id/review/:studentId', getQuizStudentReview);

// Quiz CRUD operations
router.post('/create', quizValidation, createQuiz);
router.put(
  '/:id',
  [...idValidation.slice(0, 1), ...quizValidation],
  updateQuiz
);
router.delete('/:id', idValidation.slice(0, 1), deleteQuiz);
router.post('/:id/restore', idValidation.slice(0, 1), restoreQuiz);

// Quiz status management
router.patch('/:id/status', idValidation.slice(0, 1), updateQuizStatus);

// Student quiz attempts management
router.post(
  '/:id/reset-student/:studentId',
  idValidation.slice(0, 1),
  resetStudentQuizAttempts
);

// Export quiz details
router.get('/:id/export', isAdmin, exportQuizDetails);

// Thumbnail management routes
router.post(
  '/upload-thumbnail',
  thumbnailUpload.single('thumbnail'),
  uploadQuizThumbnail
);
router.get('/:id/thumbnail', idValidation.slice(0, 1), getQuizThumbnail);
router.put('/:id/thumbnail', idValidation.slice(0, 1), updateQuizThumbnail);

module.exports = router;
