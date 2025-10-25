const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { isAdmin } = require('../middlewares/auth');
const { upload } = require('../utils/s3Service');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bulk-import-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadFile = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    const allowedExtensions = ['.xlsx', '.xls'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

const {
  testS3,
  uploadDocument,
  getAdminDashboard,
  getCourses,
  createCourse,
  getCourse,
  getCourseDetails,
  getCourseData,
  updateCourse,
  deleteCourse,
  getCourseContent,
  createTopic,
  updateTopic,
  updateTopicVisibility,
  getTopicDetails,
  reorderTopics,
  deleteTopic,
  addTopicContent,
  updateTopicContent,
  deleteTopicContent,
  getContentDetailsPage,
  getContentDetailsForEdit,
  getBundles,
  createBundle,
  updateBundle,
  deleteBundle,
  getBundleManage,
  getBundleInfo,
  getBundleStudents,
  addCourseToBundle,
  removeCourseFromBundle,
  createCourseForBundle,
  getBundlesAPI,
  // Student Management Controllers
  getStudents,
  getStudentDetails,
  toggleStudentStatus,
  exportStudentData,
  updateStudent,
  deleteStudent,
  // Quiz/Homework Content Controllers
  getQuestionBanksForContent,
  getQuestionsFromBankForContent,
  getQuestionPreviewForContent,
  addQuizContent,
  addHomeworkContent,
  getTopicContentStudentStats,
  resetContentAttempts,
  // Orders
  getOrders,
  getOrderDetails,
  generateInvoice,
  refundOrder,
  // Brilliant Students Management
  getBrilliantStudents,
  getBrilliantStudentDetails,
  createBrilliantStudent,
  updateBrilliantStudent,
  deleteBrilliantStudent,
  reorderBrilliantStudents,
  getBrilliantStudentsStats,
  exportBrilliantStudents,
  // Admin Management
  getCreateAdminForm,
  createNewAdmin,
  // Export functions
  exportCourses,
  exportOrders,
  exportQuizzes,
  exportComprehensiveReport,
  exportCourseDetails,
  exportTopicDetails,
  exportQuizDetails,
  // Zoom Meeting Management
  createZoomMeeting,
  startZoomMeeting,
  endZoomMeeting,
  getZoomMeetingStats,
  deleteZoomMeeting,
  // Bulk Import
  bulkImportStudents,
  // Student Enrollment
  enrollStudentsToCourse,
  enrollStudentsToBundle,
  bulkEnrollStudentsToCourse,
  bulkEnrollStudentsToBundle,
  getStudentsForEnrollment,
  removeStudentFromCourse,
  removeStudentFromBundle,
  // Promo Codes Management
  getPromoCodes,
  getPromoCode,
  createPromoCode,
  getPromoCodeUsage,
  deletePromoCode,
  updatePromoCode,
} = require('../controllers/adminController');

// Import Question Bank routes
const questionBankRoutes = require('./questionBank');

// Import Game Room Controller
const {
  getAdminGameRooms,
  getCreateGameRoom,
  createGameRoom,
  getEditGameRoom,
  updateGameRoom,
  deleteGameRoom,
  permanentDeleteGameRoom,
  getGameRoomStats,
  getQuestionsByBank,
} = require('../controllers/gameRoomController');

// Import Team and Site Settings Controllers
const {
  getTeamManagementPage,
  getTeamMember,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  exportTeamMembers,
} = require('../controllers/authController');

// Admin Dashboard
router.get('/dashboard', isAdmin, getAdminDashboard);

// Course Routes
router.get('/courses', isAdmin, getCourses);
router.post('/courses/create', isAdmin, createCourse);
router.get('/courses/:courseCode', isAdmin, getCourse);
router.get('/courses/:courseCode/details', isAdmin, getCourseDetails);
router.get('/courses/:courseCode/data', isAdmin, getCourseData);
router.put('/courses/:courseCode', isAdmin, updateCourse);
router.delete('/courses/:courseCode', isAdmin, deleteCourse);

// Course Content Management
router.get('/courses/:courseCode/content', isAdmin, getCourseContent);
router.get(
  '/courses/:courseCode/topics/:topicId/details',
  isAdmin,
  getTopicDetails
);
router.post('/courses/:courseCode/topics/create', isAdmin, createTopic);
router.put('/courses/:courseCode/topics/reorder', isAdmin, reorderTopics);
router.put(
  '/courses/:courseCode/topics/:topicId/visibility',
  isAdmin,
  updateTopicVisibility
);
router.put('/courses/:courseCode/topics/:topicId', isAdmin, updateTopic);
router.delete('/courses/:courseCode/topics/:topicId', isAdmin, deleteTopic);
router.post(
  '/courses/:courseCode/topics/:topicId/content/create',
  isAdmin,
  addTopicContent
);
router.get(
  '/courses/:courseCode/topics/:topicId/content/:contentId/details',
  isAdmin,
  getContentDetailsPage
);
router.get(
  '/courses/:courseCode/topics/:topicId/content/:contentId/edit-details',
  isAdmin,
  getContentDetailsForEdit
);
router.get(
  '/courses/:courseCode/topics/:topicId/content/:contentId/students',
  isAdmin,
  getTopicContentStudentStats
);
router.post(
  '/courses/:courseCode/topics/:topicId/content/:contentId/students/:studentId/reset',
  isAdmin,
  resetContentAttempts
);
router.put(
  '/courses/:courseCode/topics/:topicId/content/:contentId',
  isAdmin,
  updateTopicContent
);
router.delete(
  '/courses/:courseCode/topics/:topicId/content/:contentId',
  isAdmin,
  deleteTopicContent
);

// Quiz/Homework Content Routes
router.get(
  '/courses/:courseCode/topics/:topicId/question-banks',
  isAdmin,
  getQuestionBanksForContent
);
router.get(
  '/courses/:courseCode/topics/:topicId/question-banks/:bankId/questions',
  isAdmin,
  getQuestionsFromBankForContent
);
router.get(
  '/courses/:courseCode/topics/:topicId/questions/:questionId/preview',
  isAdmin,
  getQuestionPreviewForContent
);
router.post(
  '/courses/:courseCode/topics/:topicId/content/quiz',
  isAdmin,
  addQuizContent
);
router.post(
  '/courses/:courseCode/topics/:topicId/content/homework',
  isAdmin,
  addHomeworkContent
);

// Document Upload Routes (S3)
router.get('/test-s3', isAdmin, testS3);
router.post('/upload/document', isAdmin, upload.single('file'), uploadDocument);

// Bundle Course Routes
router.get('/bundles', isAdmin, getBundles);
router.post('/bundles/create', isAdmin, createBundle);
router.get('/bundles/:bundleCode/info', isAdmin, getBundleInfo);
router.put('/bundles/:bundleCode', isAdmin, updateBundle);
router.delete('/bundles/:bundleCode', isAdmin, deleteBundle);
router.get('/bundles/:bundleCode/manage', isAdmin, getBundleManage);
router.get('/bundles/:bundleCode/students', isAdmin, getBundleStudents);
router.post(
  '/bundles/:bundleCode/courses/:courseId/add',
  isAdmin,
  addCourseToBundle
);
router.delete(
  '/bundles/:bundleCode/courses/:courseId/remove',
  isAdmin,
  removeCourseFromBundle
);
router.post(
  '/bundles/:bundleCode/courses/create',
  isAdmin,
  createCourseForBundle
);

// API Routes
router.get('/api/bundles', isAdmin, getBundlesAPI);

// Student Management Routes
router.get('/students', isAdmin, getStudents);
router.get('/students/export', isAdmin, exportStudentData);
router.post('/students/bulk-import', isAdmin, uploadFile.single('excelFile'), bulkImportStudents);
router.get('/students/:studentId', isAdmin, getStudentDetails);
router.get('/students/:studentId/export', isAdmin, exportStudentData);
router.put('/students/:studentId/status', isAdmin, toggleStudentStatus);
router.put('/students/:studentId', isAdmin, updateStudent);
router.delete('/students/:studentId', isAdmin, deleteStudent);

// Student Enrollment Routes
router.get('/api/students-for-enrollment', isAdmin, getStudentsForEnrollment);
router.post('/courses/:courseId/enroll', isAdmin, enrollStudentsToCourse);
router.post('/courses/:courseId/bulk-enroll', isAdmin, uploadFile.single('excelFile'), bulkEnrollStudentsToCourse);
router.delete('/courses/:courseId/students/:studentId', isAdmin, removeStudentFromCourse);
router.post('/bundles/:bundleId/enroll', isAdmin, enrollStudentsToBundle);
router.post('/bundles/:bundleId/bulk-enroll', isAdmin, uploadFile.single('excelFile'), bulkEnrollStudentsToBundle);
router.delete('/bundles/:bundleId/students/:studentId', isAdmin, removeStudentFromBundle);

// Question Bank Routes
router.use('/question-banks', questionBankRoutes);

// Orders Management
router.get('/orders', isAdmin, getOrders);
router.get('/orders/export', isAdmin, exportOrders);
router.get('/orders/:orderNumber', isAdmin, getOrderDetails);
router.get('/orders/:orderNumber/invoice', isAdmin, generateInvoice);
router.post('/orders/:orderNumber/refund', isAdmin, refundOrder);

// Game Rooms Management Routes
router.get('/game-rooms', isAdmin, getAdminGameRooms);
router.get('/game-rooms/create', isAdmin, getCreateGameRoom);
router.post('/game-rooms/create', isAdmin, createGameRoom);
router.get('/game-rooms/:id/edit', isAdmin, getEditGameRoom);
router.put('/game-rooms/:id', isAdmin, updateGameRoom);
router.delete('/game-rooms/:id/delete', isAdmin, deleteGameRoom);
router.get('/game-rooms/:id/delete', isAdmin, deleteGameRoom); // GET route for simple navigation
router.post(
  '/game-rooms/:id/permanent-delete',
  isAdmin,
  permanentDeleteGameRoom
); // Permanent delete route
router.get('/game-rooms/:id/stats', isAdmin, getGameRoomStats);
// API - fetch questions by bank
router.get(
  '/api/question-banks/:bankId/questions',
  isAdmin,
  getQuestionsByBank
);

// Admin Management Routes
router.get('/create-admin', isAdmin, getCreateAdminForm);
router.post('/create-admin', isAdmin, createNewAdmin);

// Brilliant Students Management Routes
router.get('/brilliant-students', isAdmin, getBrilliantStudents);
router.post('/brilliant-students', isAdmin, createBrilliantStudent);
router.get('/brilliant-students/export', isAdmin, exportBrilliantStudents);
router.get('/brilliant-students/stats', isAdmin, getBrilliantStudentsStats);
router.post('/brilliant-students/reorder', isAdmin, reorderBrilliantStudents);
router.get('/brilliant-students/:id', isAdmin, getBrilliantStudentDetails);
router.put('/brilliant-students/:id', isAdmin, updateBrilliantStudent);
router.delete('/brilliant-students/:id', isAdmin, deleteBrilliantStudent);

// Excel Export Routes
router.get('/export/courses', isAdmin, exportCourses);
router.get('/courses/:courseId/export', isAdmin, exportCourseDetails);
router.get(
  '/courses/:courseCode/topics/:topicId/export',
  isAdmin,
  exportTopicDetails
);
router.get('/export/orders', isAdmin, exportOrders);
router.get('/export/quizzes', isAdmin, exportQuizzes);
router.get('/export/comprehensive', isAdmin, exportComprehensiveReport);

// Team Management Routes
router.get('/team-management', isAdmin, getTeamManagementPage);
router.post('/team-management', isAdmin, createTeamMember);
router.get('/team-management/export', isAdmin, exportTeamMembers);
router.get('/team-management/:id', isAdmin, getTeamMember);
router.put('/team-management/:id', isAdmin, updateTeamMember);
router.delete('/team-management/:id', isAdmin, deleteTeamMember);

// Promo Codes Management Routes
router.get('/promo-codes', isAdmin, getPromoCodes);
router.get('/promo-codes/:id', isAdmin, getPromoCode);
router.post('/promo-codes/create', isAdmin, createPromoCode);
router.get('/promo-codes/:id/usage', isAdmin, getPromoCodeUsage);
router.put('/promo-codes/:id/update', isAdmin, updatePromoCode);
router.delete('/promo-codes/:id/delete', isAdmin, deletePromoCode);

module.exports = router;
