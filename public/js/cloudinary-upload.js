// Cloudinary Upload Handler with Progress Bar (Images Only)
class CloudinaryUploader {
  constructor() {
    this.CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dusod9wxt/upload';
    this.CLOUDINARY_UPLOAD_PRESET = 'order_project';
    this.maxFileSize = 10 * 1024 * 1024; // 10MB for images
    this.allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    this.allowedTypes = this.allowedImageTypes; // Only images allowed
  }

  // Note: Content upload (PDFs/documents) is now handled by S3 uploader
  // This Cloudinary uploader is only for images/photos

  // Initialize upload functionality for a specific form
  init(formSelector, inputSelector, previewSelector, progressSelector, fieldName = 'thumbnail') {
    const form = document.querySelector(formSelector);
    const input = document.querySelector(inputSelector);
    const preview = document.querySelector(previewSelector);
    const progress = document.querySelector(progressSelector);

    if (!form || !input || !preview || !progress) {
      console.error('Cloudinary upload elements not found');
      return;
    }

    // Handle file selection
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleFileSelection(file, preview, progress);
        // Auto-upload the file when selected
        this.uploadFile(file, preview, progress, (url) => {
          console.log('File upload successful, URL:', url);
          input.dataset.uploaded = 'true';
          input.dataset.cloudinaryUrl = url;
          // Set the hidden field value immediately (support both thumbnail and questionImage)
          const hiddenField = form.querySelector(`input[name="${fieldName}"]`) || form.querySelector('input[name="thumbnail"]');
          if (hiddenField) {
            hiddenField.value = url;
            console.log('Set hidden field value to:', url);
            // Add visual indicator that thumbnail is ready
            hiddenField.style.backgroundColor = '#d4edda';
            hiddenField.style.border = '1px solid #c3e6cb';
          } else {
            console.error('Hidden field not found!');
          }
        });
      }
    });

    // Handle drag and drop
    preview.addEventListener('dragover', (e) => {
      e.preventDefault();
      preview.classList.add('drag-over');
    });

    preview.addEventListener('dragleave', (e) => {
      e.preventDefault();
      preview.classList.remove('drag-over');
    });

    preview.addEventListener('drop', (e) => {
      e.preventDefault();
      preview.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) {
        input.files = e.dataTransfer.files;
        this.handleFileSelection(file, preview, progress);
        // Auto-upload the file when dropped
        this.uploadFile(file, preview, progress, (url) => {
          console.log('File upload successful (drag&drop), URL:', url);
          input.dataset.uploaded = 'true';
          input.dataset.cloudinaryUrl = url;
          // Set the hidden field value immediately
          const hiddenField = form.querySelector('input[name="thumbnail"]');
          if (hiddenField) {
            hiddenField.value = url;
            console.log('Set hidden field value to:', url);
            // Add visual indicator that thumbnail is ready
            hiddenField.style.backgroundColor = '#d4edda';
            hiddenField.style.border = '1px solid #c3e6cb';
          } else {
            console.error('Hidden field not found!');
          }
        });
      }
    });

  // Handle form submission
  form.addEventListener('submit', (e) => {
    const file = input.files[0];
    const hiddenField = form.querySelector(`input[name="${fieldName}"]`) || form.querySelector('input[name="thumbnail"]');
    
    console.log('Form submission - File:', file);
    console.log('Form submission - Hidden field:', hiddenField);
    console.log('Form submission - Uploaded status:', input.dataset.uploaded);
    console.log('Form submission - Cloudinary URL:', input.dataset.cloudinaryUrl);
    
    if (file && !input.dataset.uploaded) {
      e.preventDefault();
      console.log('Preventing form submission - uploading file first');
      this.uploadFile(file, preview, progress, (url) => {
        input.dataset.uploaded = 'true';
        input.dataset.cloudinaryUrl = url;
        // Set the hidden field value
        if (hiddenField) {
          hiddenField.value = url;
          console.log('Set hidden field value to:', url);
        }
        form.submit();
      });
    } else if (file && input.dataset.uploaded && input.dataset.cloudinaryUrl) {
      // File was already uploaded, ensure hidden field has the URL
      if (hiddenField) {
        hiddenField.value = input.dataset.cloudinaryUrl;
        console.log('Using existing upload URL:', input.dataset.cloudinaryUrl);
      }
    } else if (!file && hiddenField) {
      // No file selected, ensure hidden field is empty
      hiddenField.value = '';
      console.log('No file selected - cleared hidden field');
    }
    
    // Final check before submission
    if (hiddenField) {
      console.log('Final hidden field value before submission:', hiddenField.value);
    }
  });
  }

  // Handle content file selection and validation
  handleContentFileSelection(file, preview, progress, urlInput) {
    // Validate file
    if (!this.validateFile(file)) {
      return;
    }

    // Show preview for content files
    this.showContentPreview(file, preview);
    
    // Show progress bar
    this.showProgress(progress, 0);
    
    // Auto-upload the file
    this.uploadFile(file, preview, progress, (url) => {
      console.log('Content file upload successful, URL:', url);
      urlInput.value = url;
      urlInput.dataset.uploaded = 'true';
      urlInput.style.backgroundColor = '#d4edda';
      urlInput.style.border = '1px solid #c3e6cb';
    }, true);
  }

  // Handle file selection and validation
  handleFileSelection(file, preview, progress) {
    // Validate file
    if (!this.validateFile(file)) {
      return;
    }

    // Show preview
    this.showPreview(file, preview);
    
    // Show progress bar
    this.showProgress(progress, 0);
  }

  // Validate file
  validateFile(file) {
    // Check file size
    if (file.size > this.maxFileSize) {
      this.showError(`File size must be less than ${this.maxFileSize / (1024 * 1024)}MB`);
      return false;
    }

    // Check file type
    if (!this.allowedTypes.includes(file.type)) {
      this.showError('Only images (JPEG, PNG, JPG, WebP) are allowed for thumbnails');
      return false;
    }

    return true;
  }

  // Note: Content preview removed - now handled by S3 uploader

  // Show file preview
  showPreview(file, preview) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `
        <img src="${e.target.result}" alt="Preview" class="preview-image">
        <div class="preview-overlay">
          <i class="fas fa-cloud-upload-alt"></i>
          <p>Click or drag to upload</p>
          <small>${file.name}</small>
        </div>
      `;
    };
    reader.readAsDataURL(file);
  }

  // Show progress bar
  showProgress(progress, percent) {
    progress.style.display = 'block';
    progress.innerHTML = `
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="progress-text">${percent}%</div>
      </div>
    `;
  }

  // Upload file to Cloudinary (images only)
  uploadFile(file, preview, progress, callback) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();

    // Upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        this.showProgress(progress, percent);
      }
    });

    // Upload complete
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        this.showSuccess(preview, progress, response.secure_url);
        if (callback) callback(response.secure_url);
      } else {
        this.showError('Upload failed. Please try again.');
      }
    });

    // Upload error
    xhr.addEventListener('error', () => {
      this.showError('Upload failed. Please check your connection.');
    });

    // Start upload
    xhr.open('POST', this.CLOUDINARY_URL, true);
    xhr.send(formData);
  }

  // Show success state (images only)
  showSuccess(preview, progress, url) {
    // For images, show image with success overlay
    preview.innerHTML = `
      <img src="${url}" alt="Uploaded Image" class="preview-image">
      <div class="preview-overlay" style="opacity: 1; background: rgba(40, 167, 69, 0.9);">
        <i class="fas fa-check-circle" style="color: white;"></i>
        <p>Upload Successful!</p>
        <small>Image uploaded to Cloudinary</small>
      </div>
    `;
    progress.style.display = 'none';
  }

  // Show error message
  showError(message) {
    // Create or update error message
    let errorDiv = document.querySelector('.upload-error');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.className = 'upload-error alert alert-danger';
      document.body.appendChild(errorDiv);
    }
    
    errorDiv.innerHTML = `
      <i class="fas fa-exclamation-triangle me-2"></i>
      ${message}
    `;
    errorDiv.style.display = 'block';

    // Hide after 5 seconds
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  }

  // Note: File icon functions removed - now handled by S3 uploader for documents

  // Format file size
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Initialize uploaders when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  const uploader = new CloudinaryUploader();

  // Initialize for course creation modal (only if elements exist)
  if (document.querySelector('#createCourseForm')) {
    uploader.init(
      '#createCourseForm',
      '#courseThumbnail',
      '#courseThumbnailPreview',
      '#courseThumbnailProgress'
    );
  }

  // Initialize for bundle creation modal (only if elements exist)
  if (document.querySelector('#createBundleForm')) {
    uploader.init(
      '#createBundleForm',
      '#bundleThumbnail',
      '#bundleThumbnailPreview',
      '#bundleThumbnailProgress'
    );
  }

  // Initialize for edit bundle modal (only if elements exist)
  if (document.querySelector('#editBundleForm')) {
    uploader.init(
      '#editBundleForm',
      '#editBundleThumbnail',
      '#editBundleThumbnailPreview',
      '#editBundleThumbnailProgress'
    );
  }
});
