const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer = require('multer');

// Validate AWS credentials
const validateAWSCredentials = () => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION;
  const bucketName = process.env.AWS_S3_BUCKET_NAME;

  if (!accessKeyId || !secretAccessKey || !region || !bucketName) {
    console.error('Missing AWS credentials:');
    console.error('AWS_ACCESS_KEY_ID:', accessKeyId ? 'Set' : 'Missing');
    console.error('AWS_SECRET_ACCESS_KEY:', secretAccessKey ? 'Set' : 'Missing');
    console.error('AWS_REGION:', region || 'Missing');
    console.error('AWS_S3_BUCKET_NAME:', bucketName || 'Missing');
    return false;
  }

  // Check if credentials are not just whitespace
  if (!accessKeyId.trim() || !secretAccessKey.trim()) {
    console.error('AWS credentials appear to be empty or whitespace');
    return false;
  }

  return true;
};

// Validate credentials before creating client
if (!validateAWSCredentials()) {
  console.error('AWS S3 configuration is invalid. Please check your environment variables.');
}

// Configure AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME?.trim() || 'elkably-elearning-documents';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow documents and PDFs
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/x-zip-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and document files are allowed'), false);
    }
  }
});

// Upload file to S3
const uploadToS3 = async (file, folder = 'documents') => {
  try {
    // Validate credentials first
    if (!validateAWSCredentials()) {
      return {
        success: false,
        error: 'AWS credentials are not properly configured'
      };
    }

    // Properly encode the filename to handle spaces and special characters
    const sanitizedFileName = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.-]/g, '');
    const fileName = `${Date.now()}-${sanitizedFileName}`;
    const key = `${folder}/${fileName}`;

    console.log('Attempting to upload to S3:', {
      bucket: BUCKET_NAME,
      key: key,
      region: process.env.AWS_REGION,
      hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    });

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL removed - bucket likely has ACL disabled for security
    };

    const command = new PutObjectCommand(uploadParams);
    const result = await s3Client.send(command);

    // Return the public URL (bucket should be configured for public read access)
    // Properly encode the URL to handle special characters like +, spaces, etc.
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodedKey}`;
    
    console.log('S3 upload successful:', publicUrl);
    
    return {
      success: true,
      url: publicUrl,
      key: key,
      fileName: fileName,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    
    // Provide more specific error messages
    let errorMessage = error.message;
    if (error.name === 'CredentialsProviderError') {
      errorMessage = 'AWS credentials are invalid or expired';
    } else if (error.name === 'NoSuchBucket') {
      errorMessage = `S3 bucket '${BUCKET_NAME}' does not exist`;
    } else if (error.name === 'AccessDenied') {
      errorMessage = 'Access denied. Check your AWS permissions';
    } else if (error.name === 'InvalidAccessKeyId') {
      errorMessage = 'Invalid AWS Access Key ID';
    } else if (error.name === 'SignatureDoesNotMatch') {
      errorMessage = 'AWS Secret Access Key is incorrect';
    } else if (error.name === 'AccessControlListNotSupported') {
      errorMessage = 'S3 bucket has ACL disabled. Files uploaded successfully but may need bucket policy for public access.';
    }
    
    return {
      success: false,
      error: errorMessage,
      details: error.message
    };
  }
};

// Delete file from S3
const deleteFromS3 = async (key) => {
  try {
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    const command = new DeleteObjectCommand(deleteParams);
    const result = await s3Client.send(command);

    return {
      success: true,
      result: result
    };
  } catch (error) {
    console.error('S3 delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Generate presigned URL for secure uploads (alternative method)
const generatePresignedUrl = async (fileName, contentType, folder = 'documents') => {
  try {
    const key = `${folder}/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      // ACL removed - bucket likely has ACL disabled for security
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
    
    return {
      success: true,
      presignedUrl: presignedUrl,
      key: key,
      publicUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(key).replace(/%2F/g, '/')}`
    };
  } catch (error) {
    console.error('Presigned URL generation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get file info from S3
const getFileInfo = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const result = await s3Client.send(command);
    
    return {
      success: true,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
      publicUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(key).replace(/%2F/g, '/')}`
    };
  } catch (error) {
    console.error('Get file info error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Test S3 connection and credentials
const testS3Connection = async () => {
  try {
    console.log('Testing S3 connection...');
    console.log('Region:', process.env.AWS_REGION);
    console.log('Bucket:', BUCKET_NAME);
    console.log('Has Access Key:', !!process.env.AWS_ACCESS_KEY_ID);
    console.log('Has Secret Key:', !!process.env.AWS_SECRET_ACCESS_KEY);
    
    // Try to list objects in the bucket (this requires minimal permissions)
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: 'test-connection.txt' // This will likely fail, but will test credentials
    });
    
    try {
      await s3Client.send(command);
    } catch (error) {
      // Expected to fail since the file doesn't exist, but credential errors will be caught
      if (error.name === 'NoSuchKey') {
        console.log('✅ S3 credentials are valid (test file not found as expected)');
        return { success: true, message: 'Credentials are valid' };
      } else if (error.name === 'NoSuchBucket') {
        console.log('❌ S3 bucket does not exist:', BUCKET_NAME);
        return { success: false, message: `Bucket '${BUCKET_NAME}' does not exist` };
      } else if (error.name === 'AccessDenied' || error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch') {
        console.log('❌ S3 credentials are invalid');
        return { success: false, message: 'Invalid AWS credentials' };
      } else {
        console.log('❌ S3 connection test failed:', error.message);
        return { success: false, message: error.message };
      }
    }
  } catch (error) {
    console.log('❌ S3 connection test error:', error.message);
    return { success: false, message: error.message };
  }
};

module.exports = {
  s3Client,
  upload,
  uploadToS3,
  deleteFromS3,
  generatePresignedUrl,
  getFileInfo,
  testS3Connection,
  validateAWSCredentials,
  BUCKET_NAME
};
