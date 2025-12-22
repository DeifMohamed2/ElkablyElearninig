// Local Upload Handler with Progress Bar (Images Only)
class LocalUploader {
  constructor() {
    this.maxFileSize = 5 * 1024 * 1024; // 5MB for images
    this.allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif'];
    this.allowedTypes = this.allowedImageTypes;
    this.uploadEndpoint = '/api/upload/image'; // Backend endpoint for image uploads
  }

  // Initialize upload functionality for a specific form
  init(formSelector, inputSelector, previewSelector, progressSelector, fieldName = 'thumbnail') {
    const form = document.querySelector(formSelector);
    const input = document.querySelector(inputSelector);
    const preview = document.querySelector(previewSelector);
    const progress = document.querySelector(progressSelector);

    if (!form || !input || !preview || !progress) {
      console.error('Local upload elements not found');
      return;
    }

    // Handle file selection
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (!this.validateFile(file, progress)) {
          input.value = ''; // Clear invalid file
          return;
        }
        this.handleFileSelection(file, preview, progress);
        // Auto-upload the file when selected
        this.uploadFile(file, preview, progress, (url) => {
          console.log('File upload successful, URL:', url);
          input.dataset.uploaded = 'true';
          input.dataset.localUrl = url;
          // Set the hidden field value immediately
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
        if (!this.validateFile(file, progress)) {
          return;
        }
        input.files = e.dataTransfer.files;
        this.handleFileSelection(file, preview, progress);
        // Auto-upload the file when dropped
        this.uploadFile(file, preview, progress, (url) => {
          console.log('File upload successful (drag&drop), URL:', url);
          input.dataset.uploaded = 'true';
          input.dataset.localUrl = url;
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
      console.log('Form submission - Local URL:', input.dataset.localUrl);
      
      if (file && !input.dataset.uploaded) {
        e.preventDefault();
        console.log('Preventing form submission - uploading file first');
        this.uploadFile(file, preview, progress, (url) => {
          input.dataset.uploaded = 'true';
          input.dataset.localUrl = url;
          // Set the hidden field value
          if (hiddenField) {
            hiddenField.value = url;
            console.log('Set hidden field value to:', url);
          }
          form.submit();
        });
      } else if (file && input.dataset.uploaded && input.dataset.localUrl) {
        // File was already uploaded, ensure hidden field has the URL
        if (hiddenField) {
          hiddenField.value = input.dataset.localUrl;
          console.log('Using existing upload URL:', input.dataset.localUrl);
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

  // Handle file selection and validation
  handleFileSelection(file, preview, progress) {
    // Show preview
    this.showPreview(file, preview);
    
    // Show progress bar
    this.showProgress(progress, 0);
  }

  // Validate file with proper error messages
  validateFile(file, progressContainer) {
    // Check file size
    if (file.size > this.maxFileSize) {
      const maxSizeMB = this.maxFileSize / (1024 * 1024);
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      this.showError(`File size (${fileSizeMB}MB) exceeds maximum allowed size of ${maxSizeMB}MB. Please choose a smaller image.`, progressContainer);
      return false;
    }

    // Check file type
    if (!this.allowedTypes.includes(file.type)) {
      this.showError('Only images (JPEG, PNG, JPG, WebP, GIF) are allowed. Please select an image file.', progressContainer);
      return false;
    }

    return true;
  }

  // Show file preview
  showPreview(file, preview) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `
        <img src="${e.target.result}" alt="Preview" class="preview-image">
        <div class="preview-overlay">
          <i class="fas fa-cloud-upload-alt"></i>
          <p>Click or drag to upload</p>
          <small>${file.name} (${this.formatFileSize(file.size)})</small>
        </div>
      `;
    };
    reader.readAsDataURL(file);
  }

  // Show progress bar
  showProgress(progress, percent) {
    if (!progress) return;
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

  // Upload file to local server
  uploadFile(file, preview, progress, callback) {
    const formData = new FormData();
    formData.append('image', file);
    
    // Determine upload type based on context
    const uploadType = this.determineUploadType(preview);
    if (uploadType) {
      formData.append('uploadType', uploadType);
    }

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
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.success && response.url) {
            this.showSuccess(preview, progress, response.url);
            if (callback) callback(response.url);
          } else {
            this.showError(response.message || 'Upload failed. Please try again.', progress);
          }
        } catch (e) {
          this.showError('Invalid response from server. Please try again.', progress);
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          this.showError(response.message || `Upload failed with status ${xhr.status}. Please try again.`, progress);
        } catch (e) {
          this.showError(`Upload failed with status ${xhr.status}. Please try again.`, progress);
        }
      }
    });

    // Upload error
    xhr.addEventListener('error', () => {
      this.showError('Upload failed. Please check your connection and try again.', progress);
    });

    // Upload abort
    xhr.addEventListener('abort', () => {
      this.showError('Upload was cancelled.', progress);
    });

    // Start upload
    xhr.open('POST', this.uploadEndpoint, true);
    xhr.send(formData);
  }

  // Determine upload type based on context
  determineUploadType(previewElement) {
    // Try to determine from form context
    const form = previewElement.closest('form');
    if (form) {
      if (form.id.includes('bundle') || form.id.includes('Bundle')) {
        return 'bundle-thumbnails';
      } else if (form.id.includes('course') || form.id.includes('Course')) {
        return 'course-thumbnails';
      } else if (form.id.includes('quiz') || form.id.includes('Quiz')) {
        return 'quiz-thumbnails';
      } else if (form.id.includes('question') || form.id.includes('Question')) {
        return 'question-images';
      } else if (form.id.includes('student') || form.id.includes('Student')) {
        return 'profile-pictures';
      } else if (form.id.includes('team') || form.id.includes('Team')) {
        return 'team-members';
      } else if (form.id.includes('brilliant') || form.id.includes('Brilliant')) {
        return 'brilliant-students';
      }
    }
    return 'photos'; // Default
  }

  // Show success state
  showSuccess(preview, progress, url) {
    // For images, show image with success overlay
    preview.innerHTML = `
      <img src="${url}" alt="Uploaded Image" class="preview-image">
      <div class="preview-overlay" style="opacity: 1; background: rgba(40, 167, 69, 0.9);">
        <i class="fas fa-check-circle" style="color: white; font-size: 2rem;"></i>
        <p style="color: white; font-weight: bold; margin-top: 10px;">Upload Successful!</p>
        <small style="color: white;">Image saved to server</small>
      </div>
    `;
    if (progress) {
      progress.style.display = 'none';
    }
  }

  // Show error message
  showError(message, progressContainer) {
    // Create or update error message
    let errorDiv = document.querySelector('.upload-error');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.className = 'upload-error alert alert-danger';
      errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px; max-width: 500px;';
      document.body.appendChild(errorDiv);
    }
    
    errorDiv.innerHTML = `
      <i class="fas fa-exclamation-triangle me-2"></i>
      <strong>Upload Error:</strong> ${message}
      <button type="button" class="btn-close" onclick="this.parentElement.style.display='none'" aria-label="Close"></button>
    `;
    errorDiv.style.display = 'block';

    // Hide progress if shown
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }

    // Hide after 8 seconds
    setTimeout(() => {
      if (errorDiv) {
        errorDiv.style.display = 'none';
      }
    }, 8000);
  }

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
  const uploader = new LocalUploader();

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

