const axios = require('axios');

/**
 * Bunny CDN Service for uploading and managing videos
 * Handles Zoom recording uploads to Bunny Stream
 */
class BunnyCDNService {
  constructor() {
    this.apiKey = process.env.BUNNY_API_KEY;
    this.libraryId = process.env.BUNNY_LIBRARY_ID;
    this.baseUrl = 'https://video.bunnycdn.com';
  }

  /**
   * Check if Bunny CDN is properly configured
   */
  isConfigured() {
    const configured = !!(this.apiKey && this.libraryId);
    if (!configured) {
      console.log('⚠️ Bunny CDN not configured:', {
        hasApiKey: !!this.apiKey,
        hasLibraryId: !!this.libraryId,
        libraryId: this.libraryId,
      });
    }
    return configured;
  }

  /**
   * Upload video buffer to Bunny CDN
   * @param {Buffer} videoBuffer - Video file buffer
   * @param {String} videoId - Unique video ID (will be used as video identifier)
   * @param {String} title - Video title (optional)
   * @returns {Promise<Object>} Upload response with video ID and URL
   */
  async uploadVideo(videoBuffer, videoId, title = 'Zoom Recording') {
    try {
      if (!this.isConfigured()) {
        throw new Error('Bunny CDN is not configured. Please set BUNNY_API_KEY and BUNNY_LIBRARY_ID environment variables.');
      }

      // Validate API key format (should not be empty)
      if (!this.apiKey || this.apiKey.trim().length === 0) {
        throw new Error('BUNNY_API_KEY is empty or invalid. Please check your environment variables.');
      }

      console.log(`📤 Starting upload to Bunny CDN: ${videoId}`);
      console.log(`📊 Video size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`🔑 Using Library ID: ${this.libraryId}`);
      console.log(`🔑 API Key present: ${this.apiKey ? 'Yes (' + this.apiKey.substring(0, 8) + '...)' : 'No'}`);

      // Step 1: Create video in library
      const createUrl = `${this.baseUrl}/library/${this.libraryId}/videos`;
      console.log(`📝 Creating video in library: ${createUrl}`);
      
      const createResponse = await axios.post(
        createUrl,
        {
          title: title,
        },
        {
          headers: {
            AccessKey: this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const bunnyVideoId = createResponse.data.guid || createResponse.data.videoLibraryId;
      
      if (!bunnyVideoId) {
        throw new Error('Failed to create video in Bunny CDN: No video ID returned');
      }

      console.log(`✅ Video created in Bunny CDN: ${bunnyVideoId}`);

      // Step 2: Upload video content
      await axios.put(
        `${this.baseUrl}/library/${this.libraryId}/videos/${bunnyVideoId}`,
        videoBuffer,
        {
          headers: {
            AccessKey: this.apiKey,
            'Content-Type': 'application/octet-stream',
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          // Increase timeout for large files (5 minutes)
          timeout: 300000,
          // Show upload progress
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              if (percentCompleted % 10 === 0) {
                console.log(`📤 Upload progress: ${percentCompleted}%`);
              }
            }
          },
        }
      );

      console.log(`✅ Video uploaded successfully to Bunny CDN: ${bunnyVideoId}`);

      // Step 3: Get video details (including playback URL)
      const videoDetails = await this.getVideoDetails(bunnyVideoId);

      return {
        success: true,
        bunnyVideoId: bunnyVideoId,
        videoUrl: videoDetails.videoUrl || null,
        thumbnailUrl: videoDetails.thumbnailUrl || null,
        duration: videoDetails.duration || null,
      };
    } catch (error) {
      console.error('❌ Error uploading to Bunny CDN:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          hasAccessKey: !!error.config?.headers?.AccessKey,
        },
      });
      
      // Provide helpful error messages based on status code
      if (error.response?.status === 401) {
        console.error('🔐 Authentication failed. Please check:');
        console.error('  1. BUNNY_API_KEY is set correctly in environment variables');
        console.error('  2. API key has proper permissions for video upload');
        console.error('  3. API key is not expired or revoked');
        console.error(`  4. Library ID (${this.libraryId}) is correct`);
      } else if (error.response?.status === 404) {
        console.error('🔍 Library not found. Please check:');
        console.error(`  1. Library ID (${this.libraryId}) is correct`);
        console.error('  2. Library exists in your Bunny CDN account');
      }
      
      // Clean up: Delete video if creation succeeded but upload failed
      if (error.response?.data?.guid) {
        try {
          await this.deleteVideo(error.response.data.guid);
        } catch (deleteError) {
          console.error('⚠️ Failed to cleanup video after upload error');
        }
      }

      const errorMessage = error.response?.data?.Message || 
                           error.response?.data?.message || 
                           error.message;
      
      throw new Error(`Failed to upload to Bunny CDN: ${errorMessage}`);
    }
  }

  /**
   * Get video details from Bunny CDN
   * @param {String} videoId - Bunny video ID
   * @returns {Promise<Object>} Video details
   */
  async getVideoDetails(videoId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/library/${this.libraryId}/videos/${videoId}`,
        {
          headers: {
            AccessKey: this.apiKey,
          },
        }
      );

      return {
        videoUrl: response.data.videoLibraryId 
          ? `https://vz-${this.libraryId}.b-cdn.net/${videoId}/play_720p.mp4`
          : null,
        thumbnailUrl: response.data.thumbnailFileName
          ? `https://vz-${this.libraryId}.b-cdn.net/${videoId}/${response.data.thumbnailFileName}`
          : null,
        duration: response.data.length || null,
        title: response.data.title || null,
        status: response.data.status || null,
      };
    } catch (error) {
      console.error('❌ Error getting video details:', error.response?.data || error.message);
      throw new Error(
        `Failed to get video details: ${error.response?.data?.Message || error.message}`
      );
    }
  }

  /**
   * Delete video from Bunny CDN
   * @param {String} videoId - Bunny video ID
   * @returns {Promise<Boolean>} Success status
   */
  async deleteVideo(videoId) {
    try {
      await axios.delete(
        `${this.baseUrl}/library/${this.libraryId}/videos/${videoId}`,
        {
          headers: {
            AccessKey: this.apiKey,
          },
        }
      );

      console.log(`✅ Video deleted from Bunny CDN: ${videoId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting video:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Generate playback token for secure video access (optional)
   * @param {String} videoId - Bunny video ID
   * @param {Number} expirySeconds - Token expiry in seconds (default: 3600 = 1 hour)
   * @returns {String} Playback token
   */
  generatePlaybackToken(videoId, expirySeconds = 3600) {
    // This requires Bunny Stream token authentication setup
    // For now, returning null (public access)
    // You can implement token-based authentication if needed
    return null;
  }

  /**
   * Get video playback URL with optional token
   * @param {String} videoId - Bunny video ID
   * @param {Number} quality - Video quality (360, 480, 720, 1080, original)
   * @param {String} token - Optional playback token
   * @returns {String} Playback URL
   */
  getPlaybackUrl(videoId, quality = '720p', token = null) {
    const baseUrl = `https://vz-${this.libraryId}.b-cdn.net/${videoId}`;
    
    if (quality === 'original') {
      const url = `${baseUrl}/play.mp4`;
      return token ? `${url}?token=${token}` : url;
    }

    const url = `${baseUrl}/play_${quality}.mp4`;
    return token ? `${url}?token=${token}` : url;
  }

  /**
   * Generate Bunny CDN embed iframe code
   * @param {String} videoId - Bunny video ID
   * @param {Object} options - Embed options
   * @param {Boolean} options.autoplay - Autoplay video (default: true)
   * @param {Boolean} options.loop - Loop video (default: false)
   * @param {Boolean} options.muted - Mute video (default: false)
   * @param {Boolean} options.preload - Preload video (default: true)
   * @param {Boolean} options.responsive - Responsive embed (default: true)
   * @returns {String} HTML embed code
   */
  getEmbedCode(videoId, options = {}) {
    const {
      autoplay = true,
      loop = false,
      muted = false,
      preload = true,
      responsive = true,
    } = options;

    // Bunny CDN embed URL format: https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}
    const embedUrl = `https://iframe.mediadelivery.net/embed/${this.libraryId}/${videoId}?autoplay=${autoplay}&loop=${loop}&muted=${muted}&preload=${preload}&responsive=${responsive}`;

    // Generate responsive embed iframe code
    const embedCode = `<div style="position:relative;padding-top:56.25%;"><iframe src="${embedUrl}" loading="lazy" style="border:0;position:absolute;top:0;height:100%;width:100%;" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;" allowfullscreen="true"></iframe></div>`;

    return embedCode;
  }
}

module.exports = new BunnyCDNService();

