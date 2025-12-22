const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Base directory for uploaded files
const BASE_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

// Folder mapping for different upload types
const UPLOAD_FOLDERS = {
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
  'thumbnails': 'thumbnails',
  'questions': 'questions',
};

/**
 * Get file extension from filename or mimetype
 */
function getFileExtension(filename, mimetype) {
  if (filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext) return ext;
  }
  
  // Fallback to mimetype
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  
  return mimeMap[mimetype] || '.jpg';
}

/**
 * Generate unique filename
 */
function generateFilename(originalName, mimetype) {
  const ext = getFileExtension(originalName, mimetype);
  const uniqueId = uuidv4().substring(0, 8);
  const timestamp = Date.now();
  return `${timestamp}-${uniqueId}${ext}`;
}

/**
 * Upload image to local storage
 * @param {Buffer} fileBuffer - File buffer
 * @param {Object} options - Upload options
 * @param {string} options.folder - Folder type (profile-pictures, quiz-thumbnails, etc.)
 * @param {string} options.filename - Optional custom filename
 * @param {string} options.originalName - Original filename
 * @param {string} options.mimetype - File mimetype
 * @returns {Promise<Object>} Upload result with url and filename
 */
async function uploadImage(fileBuffer, options = {}) {
  try {
    const folderType = options.folder || 'photos';
    const targetFolder = UPLOAD_FOLDERS[folderType] || 'photos';
    const uploadDir = path.join(BASE_UPLOAD_DIR, targetFolder);

    // Create directory if it doesn't exist
    await fs.mkdir(uploadDir, { recursive: true });

    // Generate filename
    const filename = options.filename || generateFilename(
      options.originalName,
      options.mimetype
    );

    const filePath = path.join(uploadDir, filename);

    // Write file
    await fs.writeFile(filePath, fileBuffer);

    // Return relative URL path (from public directory)
    const relativePath = `/uploads/${targetFolder}/${filename}`;

    return {
      url: relativePath,
      filename: filename,
      originalName: options.originalName || filename,
      path: filePath,
    };
  } catch (error) {
    console.error('Local upload error:', error);
    throw new Error('Failed to upload image to local storage');
  }
}

/**
 * Upload document/file to local storage
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Original filename
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with url and filename
 */
async function uploadDocument(fileBuffer, fileName, options = {}) {
  try {
    const folderType = options.folder || 'documents';
    const uploadDir = path.join(BASE_UPLOAD_DIR, folderType);

    // Create directory if it doesn't exist
    await fs.mkdir(uploadDir, { recursive: true });

    // Generate filename
    const ext = path.extname(fileName) || '.pdf';
    const uniqueId = uuidv4().substring(0, 8);
    const timestamp = Date.now();
    const filename = `${timestamp}-${uniqueId}${ext}`;

    const filePath = path.join(uploadDir, filename);

    // Write file
    await fs.writeFile(filePath, fileBuffer);

    // Return relative URL path
    const relativePath = `/uploads/${folderType}/${filename}`;

    return {
      url: relativePath,
      filename: filename,
      originalName: fileName,
      path: filePath,
    };
  } catch (error) {
    console.error('Local document upload error:', error);
    throw new Error('Failed to upload document to local storage');
  }
}

/**
 * Delete file from local storage
 * @param {string} filePath - Relative path from public directory (e.g., /uploads/photos/image.jpg)
 * @returns {Promise<boolean>} Success status
 */
async function deleteFile(filePath) {
  try {
    // Remove leading slash and handle both absolute and relative paths
    let normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    
    // If it starts with 'uploads/', remove it to get relative path
    if (normalizedPath.startsWith('uploads/')) {
      normalizedPath = normalizedPath.substring(8);
    }

    const fullPath = path.join(BASE_UPLOAD_DIR, normalizedPath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      // File doesn't exist, consider it deleted
      return true;
    }

    // Delete file
    await fs.unlink(fullPath);
    return true;
  } catch (error) {
    console.error('Local delete error:', error);
    // Don't throw error, just log it (file might not exist)
    return false;
  }
}

/**
 * Delete file by URL (handles both Cloudinary URLs and local paths)
 * @param {string} url - File URL (Cloudinary or local)
 * @returns {Promise<boolean>} Success status
 */
async function deleteImage(url) {
  if (!url) return true;

  // If it's a Cloudinary URL, we can't delete it locally
  if (url.includes('cloudinary')) {
    console.warn('Cannot delete Cloudinary URL locally:', url);
    return false;
  }

  // It's a local path
  return await deleteFile(url);
}

module.exports = {
  uploadImage,
  uploadDocument,
  deleteFile,
  deleteImage,
  BASE_UPLOAD_DIR,
  UPLOAD_FOLDERS,
};

