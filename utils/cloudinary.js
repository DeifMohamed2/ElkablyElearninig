const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dusod9wxt',
  api_key: process.env.CLOUDINARY_API_KEY || '353635965973632',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'rFWFSn4g-dHGj48o3Uu1YxUMZww'
});

// Upload image to Cloudinary
const uploadImage = async (fileBuffer, options = {}) => {
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
};

// Upload document/file to Cloudinary (for Excel, PDF, etc.)
const uploadDocument = async (fileBuffer, fileName, options = {}) => {
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
};

// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete image from Cloudinary');
  }
};

module.exports = {
  uploadImage,
  uploadDocument,
  deleteImage,
  cloudinary
};
