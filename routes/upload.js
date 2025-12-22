const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/auth');
const {
  uploadImageHandler,
  uploadImageMiddleware,
} = require('../controllers/uploadController');

// Image upload endpoint (protected - requires authentication)
router.post(
  '/image',
  isAuthenticated,
  uploadImageMiddleware,
  uploadImageHandler
);

module.exports = router;

