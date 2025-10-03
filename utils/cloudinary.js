const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (this should already be done in app.js)
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dusod9wxt',
//   api_key: process.env.CLOUDINARY_API_KEY || '353635965973632',
//   api_secret: process.env.CLOUDINARY_API_SECRET || 'rFWFSn4g-dHGj48o3Uu1YxUMZww'
// });

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
  deleteImage
};
