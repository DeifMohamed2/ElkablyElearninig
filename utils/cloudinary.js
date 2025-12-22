const cloudinary = require('cloudinary').v2;
const localUpload = require('./localUpload');

// Check if we should use local storage (default: true)
const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE !== 'false';

// Configure Cloudinary (for backward compatibility)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dusod9wxt',
  api_key: process.env.CLOUDINARY_API_KEY || '353635965973632',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'rFWFSn4g-dHGj48o3Uu1YxUMZww'
});

// Upload image - uses local storage by default, Cloudinary if USE_LOCAL_STORAGE=false
const uploadImage = async (fileBuffer, options = {}) => {
  if (USE_LOCAL_STORAGE) {
    // Use local storage
    const result = await localUpload.uploadImage(fileBuffer, {
      folder: options.folder || 'photos',
      originalName: options.originalName,
      mimetype: options.mimetype,
      filename: options.filename,
    });
    
    // Return in same format as Cloudinary for compatibility
    return {
      url: result.url,
      publicId: result.filename, // Use filename as publicId equivalent
      originalName: result.originalName
    };
  } else {
    // Use Cloudinary (legacy)
    try {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: 'quiz-thumbnails',
            resource_type: 'auto',
            transformation: [
              { width: 400, height: 300, crop: 'fill', quality: 'auto' },
              { format: 'auto' }
            ],
            ...options
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        ).end(fileBuffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        originalName: result.original_filename
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error('Failed to upload image to Cloudinary');
    }
  }
};

// Upload document/file - uses local storage by default
const uploadDocument = async (fileBuffer, fileName, options = {}) => {
  if (USE_LOCAL_STORAGE) {
    // Use local storage
    const result = await localUpload.uploadDocument(fileBuffer, fileName, {
      folder: options.folder || 'documents',
    });
    
    return {
      url: result.url,
      publicId: result.filename,
      originalName: result.originalName
    };
  } else {
    // Use Cloudinary (legacy)
    try {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: 'zoom-reports',
            resource_type: 'raw', // Use 'raw' for documents
            public_id: fileName.replace(/\.[^/.]+$/, ''), // Remove extension for public_id
            ...options
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        ).end(fileBuffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        originalName: fileName
      };
    } catch (error) {
      console.error('Cloudinary document upload error:', error);
      throw new Error('Failed to upload document to Cloudinary');
    }
  }
};

// Delete image - handles both local and Cloudinary
const deleteImage = async (publicIdOrUrl) => {
  if (USE_LOCAL_STORAGE) {
    // Use local storage delete
    return await localUpload.deleteImage(publicIdOrUrl);
  } else {
    // Use Cloudinary delete (legacy)
    try {
      const result = await cloudinary.uploader.destroy(publicIdOrUrl);
      return result;
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new Error('Failed to delete image from Cloudinary');
    }
  }
};

module.exports = {
  uploadImage,
  uploadDocument,
  deleteImage,
  cloudinary,
  USE_LOCAL_STORAGE
};
