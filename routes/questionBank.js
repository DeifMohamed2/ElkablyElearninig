const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middlewares/auth');
const {
  // Question Bank Routes
  getQuestionBanks,
  createQuestionBank,
  getQuestionBank,
  updateQuestionBank,
  deleteQuestionBank,

  // Question Routes
  getQuestions,
  createQuestion,
  getQuestion,
  updateQuestion,
  deleteQuestion,
  duplicateQuestion,

  // Search and Filter Routes
  searchQuestions,
  getQuestionStats,
  exportQuestions,
  importQuestions,

  // Utility Routes
  syncAllQuestionBanks,
} = require('../controllers/questionBankController');

// Import export function from adminController
const { exportQuestionBankDetails } = require('../controllers/adminController');

// Question Bank Routes
router.get('/banks', isAdmin, getQuestionBanks);
router.post('/banks/create', isAdmin, createQuestionBank);
router.get('/banks/:bankCode', isAdmin, getQuestionBank);
router.put('/banks/:bankCode', isAdmin, updateQuestionBank);
router.delete('/banks/:bankCode', isAdmin, deleteQuestionBank);

// Question Routes within a Bank
router.get('/banks/:bankCode/questions', isAdmin, getQuestions);
router.post('/banks/:bankCode/questions/create', isAdmin, createQuestion);
router.get('/banks/:bankCode/questions/:questionId', isAdmin, getQuestion);
router.put('/banks/:bankCode/questions/:questionId', isAdmin, updateQuestion);
router.delete(
  '/banks/:bankCode/questions/:questionId',
  isAdmin,
  deleteQuestion
);
router.post(
  '/banks/:bankCode/questions/:questionId/duplicate',
  isAdmin,
  duplicateQuestion
);

// Search and Filter Routes
router.get('/banks/:bankCode/questions/search', isAdmin, searchQuestions);
router.get('/banks/:bankCode/stats', isAdmin, getQuestionStats);
router.get('/banks/:bankCode/export', isAdmin, exportQuestions);
router.post('/banks/:bankCode/import', isAdmin, importQuestions);

// Excel Export Route (using question bank ID)
router.get('/:questionBankId/export', isAdmin, exportQuestionBankDetails);

// Utility Routes
router.post('/sync-all-banks', isAdmin, syncAllQuestionBanks);

module.exports = router;
