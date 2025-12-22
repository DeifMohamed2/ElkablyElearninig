const { uploadImage } = require('../utils/cloudinary'); // This now uses local storage by default
const multer = require('multer');
const path = require('path');

// Configure multer for image uploads (5MB limit)
const imageStorage = multer.memoryStorage();
const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    const allowedExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;

    if (
      allowedMimeTypes.includes(file.mimetype) &&
      allowedExtensions.test(file.originalname)
    ) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, JPG, WebP, GIF) are allowed. Maximum size is 5MB.'));
    }
  },
});

// Middleware for image upload
const uploadImageMiddleware = imageUpload.single('image');

/**
 * Upload image endpoint
 * POST /api/upload/image
 */
const uploadImageHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided. Please select an image file.',
      });
    }

    // Check file size (double check, though multer should handle it)
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Image size exceeds 5MB limit. Please choose a smaller image.',
      });
    }

    // Determine upload folder based on uploadType
    const uploadType = req.body.uploadType || 'photos';
    const folderMapping = {
      'profile-pictures': 'profile-pictures',
      'quiz-thumbnails': 'thumbnails',
      'course-thumbnails': 'thumbnails',
      'bundle-thumbnails': 'thumbnails',
      'game-room-thumbnails': 'thumbnails',
      'question-images': 'questions',
      'option-images': 'questions',
      'explanation-images': 'questions',
      'brilliant-students': 'photos',
      'team-members': 'photos',
      'photos': 'photos',
    };

    const folder = folderMapping[uploadType] || 'photos';

    // Upload image using local storage
    const uploadResult = await uploadImage(req.file.buffer, {
      folder: uploadType,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    res.json({
      success: true,
      url: uploadResult.url,
      filename: uploadResult.publicId || uploadResult.filename || path.basename(uploadResult.url),
      message: 'Image uploaded successfully',
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload image. Please try again.',
    });
  }
};

module.exports = {
  uploadImageHandler,
  uploadImageMiddleware,
};

