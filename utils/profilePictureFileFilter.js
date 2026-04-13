/**
 * Multer fileFilter for profile pictures — accepts any image/* and common
 * extensions (mobile often omits extension or sends application/octet-stream).
 */
const IMAGE_FILENAME_EXT =
  /\.(jpe?g|png|gif|webp|bmp|tif{1,2}|tiff|heic|heif|avif|svg|ico|jfif|pjp|pjpeg)$/i;

function profilePictureFileFilter(req, file, cb) {
  const mime = (file.mimetype || '').toLowerCase().trim();
  const name = file.originalname || '';

  if (mime.startsWith('image/')) {
    return cb(null, true);
  }

  if (mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    if (IMAGE_FILENAME_EXT.test(name)) {
      return cb(null, true);
    }
  }

  if (name && IMAGE_FILENAME_EXT.test(name)) {
    return cb(null, true);
  }

  cb(
    new Error(
      'Only image files are allowed (e.g. JPEG, PNG, GIF, WebP, HEIC, BMP, TIFF, AVIF, SVG)',
    ),
  );
}

module.exports = { profilePictureFileFilter, IMAGE_FILENAME_EXT };
