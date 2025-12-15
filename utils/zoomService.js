const axios = require('axios');
const jwt = require('jsonwebtoken');
const ZoomMeeting = require('../models/ZoomMeeting');
const User = require('../models/User');
const bunnyCDNService = require('./bunnyCDNService');

class ZoomService {
  constructor() {
    this.accountId = process.env.ZOOM_ACCOUNT_ID;
    this.clientId = process.env.ZOOM_CLIENT_ID;
    this.clientSecret = process.env.ZOOM_CLIENT_SECRET;
    this.userId = process.env.ZOOM_USER_ID || process.env.ZOOM_EMAIL;
  }

  /**
   * Get Zoom OAuth access token using Server-to-Server OAuth
   */
  async getAccessToken() {
    try {
      const response = await axios.post('https://zoom.us/oauth/token', null, {
        params: {
          grant_type: 'account_credentials',
          account_id: this.accountId,
        },
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
              'base64'
            ),
        },
      });

      console.log('✅ Zoom access token obtained successfully');
      return response.data.access_token;
    } catch (error) {
      console.error(
        '❌ Zoom Token Error:',
        error.response?.data || error.message
      );
      throw new Error('Failed to obtain Zoom access token');
    }
  }

  /**
   * Generate join URL with tracking parameters for external Zoom client
   * Format: Firstname_SecondName(studentID)
   */
  generateTrackingJoinUrl(meetingId, studentInfo, password = '') {
    try {
      const baseUrl = 'https://zoom.us/j/' + meetingId;
      const params = new URLSearchParams();

      if (password) {
        params.append('pwd', password);
      }

      // Format name as Firstname_SecondName(studentCode)
      // Use studentCode instead of MongoDB _id
      const studentCode = studentInfo.studentCode || studentInfo.id;
      
      // Extract first name and last name from studentInfo.name
      let formattedName = '';
      if (studentInfo.name) {
        // Clean the name - remove any URL encoding artifacts and normalize spaces
        const cleanName = studentInfo.name.trim().replace(/%/g, ' ').replace(/\s+/g, ' ');
        const nameParts = cleanName.split(/\s+/);
        // Clean each part to remove special characters (keep only letters)
        const firstName = (nameParts[0] || '').trim().replace(/[^A-Za-z]/g, '');
        const lastName = nameParts.slice(1)
          .map(part => part.replace(/[^A-Za-z]/g, ''))
          .filter(part => part.length > 0)
          .join('_');
        
        // Format as Firstname_SecondName(studentCode) - use underscore, not space
        if (lastName) {
          formattedName = `${firstName}_${lastName}(${studentCode})`;
        } else {
          formattedName = `${firstName}(${studentCode})`;
        }
      } else if (studentInfo.firstName && studentInfo.lastName) {
        // Use firstName and lastName directly if available
        const firstName = (studentInfo.firstName || '').trim().replace(/[^A-Za-z]/g, '');
        const lastName = (studentInfo.lastName || '').trim().replace(/[^A-Za-z]/g, '');
        formattedName = `${firstName}_${lastName}(${studentCode})`;
      } else {
        formattedName = `Student(${studentCode})`;
      }

      // Add tracking parameters with properly formatted name
      params.append('uname', encodeURIComponent(formattedName));
      if (studentInfo.email) {
        params.append('email', encodeURIComponent(studentInfo.email));
      }
      params.append('from', 'elearning-platform');
      params.append('student_id', studentInfo.id); // Add student ID for tracking

      const finalUrl = params.toString()
        ? `${baseUrl}?${params.toString()}`
        : baseUrl;

      console.log('✅ Generated join URL for external client:', finalUrl);
      console.log('👤 Formatted name:', formattedName);
      console.log('📧 Email included in join URL:', studentInfo.email);
      return finalUrl;
    } catch (error) {
      console.error('❌ Join URL generation error:', error);
      throw new Error('Failed to generate join URL');
    }
  }

  /**
   * Create a new Zoom meeting
   * @param {Object} meetingData - Meeting configuration
   * @returns {Object} Created meeting data from Zoom API
   */
  async createMeeting(meetingData) {
    try {
      const token = await this.getAccessToken();

      const {
        topic,
        scheduledStartTime,
        duration = 60,
        timezone = 'UTC',
        password,
        settings = {},
      } = meetingData;

      // Prepare meeting configuration
      // Ensure all settings are properly applied
      const joinBeforeHost = settings.joinBeforeHost === true || settings.joinBeforeHost === 'true';
      const waitingRoom = settings.waitingRoom === true || settings.waitingRoom === 'true';
      
      // IMPORTANT: If join_before_host is enabled, waiting_room should be disabled
      // Otherwise students will still need to wait for host to admit them
      const finalWaitingRoom = joinBeforeHost ? false : waitingRoom;
      
      const meetingConfig = {
        topic: topic || 'E-Learning Live Session',
        type: 2, // Scheduled meeting
        start_time:
          scheduledStartTime ||
          new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        duration: parseInt(duration),
        timezone: timezone,
        password: password,
        settings: {
          // Apply settings explicitly - ensure boolean values are properly set
          join_before_host: joinBeforeHost,
          waiting_room: finalWaitingRoom, // Disabled if join_before_host is true
          host_video: settings.hostVideo !== false && settings.hostVideo !== 'false',
          participant_video: settings.participantVideo !== false && settings.participantVideo !== 'false',
          audio: 'both',
          auto_recording: settings.autoRecording || (settings.recording === true || settings.recording === 'true' ? 'cloud' : 'none'),
          mute_upon_entry: settings.muteUponEntry === true || settings.muteUponEntry === 'true',
          enforce_login: false,
          use_pmi: false,
          approval_type: 2, // No registration required
          registration_type: 1,
        },
      };
      
      console.log('🔧 Zoom meeting settings:', {
        join_before_host: meetingConfig.settings.join_before_host,
        waiting_room: meetingConfig.settings.waiting_room,
        host_video: meetingConfig.settings.host_video,
        participant_video: meetingConfig.settings.participant_video,
        mute_upon_entry: meetingConfig.settings.mute_upon_entry,
        auto_recording: meetingConfig.settings.auto_recording,
      });

      console.log('🔍 Creating Zoom meeting:', topic);

      const response = await axios.post(
        `https://api.zoom.us/v2/users/${this.userId}/meetings`,
        meetingConfig,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Zoom meeting created successfully:', response.data.id);

      return {
        meetingId: response.data.id.toString(),
        meetingTopic: response.data.topic,
        joinUrl: response.data.join_url,
        startUrl: response.data.start_url,
        password: response.data.password,
        startTime: response.data.start_time,
        duration: response.data.duration,
        timezone: response.data.timezone,
        hostId: response.data.host_id,
      };
    } catch (error) {
      console.error(
        '❌ Error creating Zoom meeting:',
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to create Zoom meeting: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Update an existing Zoom meeting
   */
  async updateMeeting(meetingId, updates) {
    try {
      const token = await this.getAccessToken();

      console.log('🔄 Updating Zoom meeting:', meetingId);

      const response = await axios.patch(
        `https://api.zoom.us/v2/meetings/${meetingId}`,
        updates,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Zoom meeting updated successfully');
      return response.data;
    } catch (error) {
      console.error(
        '❌ Error updating Zoom meeting:',
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to update Zoom meeting: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Delete a Zoom meeting
   */
  async deleteMeeting(meetingId) {
    try {
      const token = await this.getAccessToken();

      console.log('🗑️ Deleting Zoom meeting:', meetingId);

      await axios.delete(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('✅ Zoom meeting deleted successfully');
      return true;
    } catch (error) {
      console.error(
        '❌ Error deleting Zoom meeting:',
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to delete Zoom meeting: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * End a Zoom meeting by updating its status to end the session
   */
  async endMeetingOnZoom(meetingId) {
    try {
      const token = await this.getAccessToken();

      console.log('🔚 Ending Zoom meeting on servers:', meetingId);

      // Zoom doesn't have a direct "end meeting" API for scheduled meetings
      // But we can update the meeting status or use other methods
      const response = await axios.patch(
        `https://api.zoom.us/v2/meetings/${meetingId}/status`,
        {
          action: 'end',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Zoom meeting ended on servers successfully');
      return response.data;
    } catch (error) {
      // If the status endpoint doesn't work, try alternative method
      if (error.response?.status === 404 || error.response?.status === 400) {
        console.log(
          '📝 Status endpoint not available, trying alternative method...'
        );

        try {
          // Alternative: Update meeting to a past time to effectively end it
          const token = await this.getAccessToken();

          await axios.patch(
            `https://api.zoom.us/v2/meetings/${meetingId}`,
            {
              start_time: new Date(Date.now() - 1000).toISOString(),
              duration: 1,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          console.log('✅ Meeting ended using alternative method');
          return true;
        } catch (altError) {
          console.warn('⚠️ Alternative method also failed:', altError.message);
          throw error; // Throw original error
        }
      }

      console.error(
        '❌ Error ending Zoom meeting:',
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to end Zoom meeting: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Kick unauthorized participant from meeting
   */
  async kickParticipant(meetingId, participantId, participantName) {
    try {
      const token = await this.getAccessToken();

      console.log(
        '🦶 Attempting to kick unauthorized participant:',
        participantName
      );

      // Zoom API to remove participant from meeting
      const response = await axios.patch(
        `https://api.zoom.us/v2/meetings/${meetingId}/events`,
        {
          method: 'meeting.participant_left',
          params: {
            participant: {
              id: participantId,
              user_name: participantName,
              leave_reason: 'Unauthorized access - not enrolled in course',
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(
        '✅ Unauthorized participant kicked from meeting:',
        participantName
      );
      return response.data;
    } catch (error) {
      // If direct kick doesn't work, try alternative approaches
      console.warn('⚠️ Direct kick failed, trying alternative approach...');

      try {
        // Alternative: Update meeting settings to require authentication
        const token = await this.getAccessToken();

        await axios.patch(
          `https://api.zoom.us/v2/meetings/${meetingId}`,
          {
            settings: {
              enforce_login: true,
              enforce_login_domains: 'your-domain.com', // Your domain
              approval_type: 1, // Manual approval required
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log(
          '⚠️ Meeting security updated to prevent unauthorized access'
        );
        return true;
      } catch (altError) {
        console.error(
          '❌ Failed to kick participant or update meeting security:',
          altError.message
        );
        console.log(
          '📝 Manual intervention required to remove unauthorized participant:',
          participantName
        );
        return false;
      }
    }
  }

  /**
   * Get meeting details from Zoom API
   */
  async getMeetingDetails(meetingId) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.get(
        `https://api.zoom.us/v2/meetings/${meetingId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error(
        '❌ Error getting meeting details:',
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to get meeting details: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Handle participant joined event
   */
  async handleParticipantJoined(payload) {
    try {
      const { object } = payload;
      const meetingId = object.id.toString();
      const participant = object.participant;

      console.log('👋 Participant joined - Raw data:', {
        user_name: participant.user_name,
        email: participant.email,
        id: participant.id,
        join_time: participant.join_time,
      });

      // Find the Zoom meeting in database
      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId).populate(
        'course'
      );
      if (!zoomMeeting) {
        console.log('❌ Zoom meeting not found in database:', meetingId);
        return;
      }

      // Clean and prepare participant data
      const participantName = participant.user_name
        ? decodeURIComponent(participant.user_name.replace(/\+/g, ' '))
        : 'Unknown Participant';

      let participantEmail = participant.email || participant.user_email;

      // If no email provided, try to extract from participant name
      if (!participantEmail) {
        const emailMatch = participantName.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          participantEmail = emailMatch[0];
        }
      }

      console.log('📋 Processed participant data:', {
        name: participantName,
        email: participantEmail,
        id: participant.id,
      });

      // SECURITY CHECK: Validate name format - must be Firstname_SecondName(studentCode)
      // Pattern: Firstname_SecondName(studentCode) or Firstname(studentCode)
      // studentCode is numeric (e.g., 160181), not MongoDB ObjectId
      const nameFormatPattern = /^[A-Za-z]+([_\s][A-Za-z]+)?\(\d+\)$/;
      const isValidNameFormat = nameFormatPattern.test(participantName);
      
      if (!isValidNameFormat) {
        console.log(
          '🚫 BLOCKING participant - Invalid name format:',
          participantName
        );
        console.log('⚠️ Expected format: Firstname_SecondName(studentCode)');
        console.log('⚠️ Only enrolled students with proper format are allowed');

        // Try to kick the participant out of the meeting
        await this.kickParticipant(meetingId, participant.id, participantName);
        return; // Don't record attendance for unauthorized participants
      }

      // First, try to find existing attendance record using the new helper method
      let user = null;
      const existingAttendance = zoomMeeting.findStudentInAttendance({
        email: participantEmail,
        name: participantName,
        zoomParticipantId: participant.id,
      });

      if (existingAttendance && existingAttendance.student) {
        // Found existing attendance record, get the user
        user = await User.findById(existingAttendance.student);
        console.log(
          '✅ Found user from existing attendance record:',
          user?.name
        );

        // Update the existing record with webhook join event
        zoomMeeting.updateStudentAttendance({
          studentId: user._id,
          name: participantName,
          email: participantEmail || user.studentEmail || user.email,
          zoomParticipantId: participant.id,
          joinTime: new Date(participant.join_time || new Date()),
          cameraStatus: 'off', // Default to off on join - updated by subsequent events
          micStatus: 'off', // Default to off on join - updated by subsequent events
        });

        await zoomMeeting.save();
        console.log('✅ Updated existing attendance record from webhook');
        return;
      }

      // If not found in attendance, try database lookup
      if (
        !user &&
        participantEmail &&
        !participantEmail.includes('@unknown.com')
      ) {
        // Try exact email match first
        user = await User.findOne({
          $or: [
            { studentEmail: participantEmail },
            { email: participantEmail },
          ],
        });

        // If no exact match, try case-insensitive search
        if (!user) {
          user = await User.findOne({
            $or: [
              {
                studentEmail: {
                  $regex: new RegExp(`^${participantEmail}$`, 'i'),
                },
              },
              { email: { $regex: new RegExp(`^${participantEmail}$`, 'i') } },
            ],
          });
        }

        // If still no match, try to find by name similarity
        if (
          !user &&
          participantName &&
          participantName !== 'Unknown Participant'
        ) {
          user = await User.findOne({
            $or: [
              { name: { $regex: new RegExp(participantName, 'i') } },
              {
                firstName: {
                  $regex: new RegExp(participantName.split(' ')[0], 'i'),
                },
              },
            ],
          });
        }
      }

      // Block external participants - only allow enrolled students
      if (!user) {
        console.log(
          '🚫 BLOCKING external participant (not in database):',
          participantName
        );
        console.log('⚠️ Only enrolled students are allowed to join meetings');

        // Try to kick the participant out of the meeting
        await this.kickParticipant(meetingId, participant.id, participantName);
        return; // Don't record attendance for external participants
      }

      // Check if user is enrolled in the course
      const isEnrolled = user.enrolledCourses.some(
        (enrollment) =>
          enrollment.course &&
          enrollment.course.toString() === zoomMeeting.course._id.toString()
      );

      if (!isEnrolled) {
        console.log(
          '🚫 BLOCKING participant (not enrolled in course):',
          user.name
        );
        console.log('📚 User must be enrolled in course to join meeting');

        // Try to kick the participant out of the meeting
        await this.kickParticipant(meetingId, participant.id, user.name);
        return; // Don't record attendance for non-enrolled users
      }

      console.log(
        '✅ Authorized participant found:',
        user.name || user.firstName
      );

      // Update attendance with validated data (only for authorized users)
      zoomMeeting.updateStudentAttendance({
        studentId: user._id, // Always have a valid student ID now
        name: participantName,
        email: participantEmail || user.studentEmail || user.email,
        zoomParticipantId: participant.id,
        joinTime: new Date(participant.join_time || new Date()),
        cameraStatus: 'off', // Default to off on join - updated by subsequent events
        micStatus: 'off', // Default to off on join - updated by subsequent events
      });

      await zoomMeeting.save();
      console.log('✅ Attendance recorded for authorized participant');
    } catch (error) {
      console.error('❌ Error handling participant joined:', error);
    }
  }

  /**
   * Handle participant left event
   */
  async handleParticipantLeft(payload) {
    try {
      const { object } = payload;
      const meetingId = object.id.toString();
      const participant = object.participant;

      console.log('👋 Participant left - Raw data:', {
        user_name: participant.user_name,
        email: participant.email,
        id: participant.id,
        leave_time: participant.leave_time,
      });

      // Find the Zoom meeting in database
      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      if (!zoomMeeting) {
        console.log('❌ Zoom meeting not found in database:', meetingId);
        return;
      }

      // Clean and prepare participant data
      const participantName = participant.user_name
        ? decodeURIComponent(participant.user_name.replace(/\+/g, ' '))
        : 'Unknown Participant';

      let participantEmail = participant.email || participant.user_email;

      // If no email provided, try to extract from participant name
      if (!participantEmail) {
        const emailMatch = participantName.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          participantEmail = emailMatch[0];
        }
      }

      console.log('📋 Processing leave for participant:', {
        name: participantName,
        email: participantEmail,
        id: participant.id,
      });

      // Find the student using the new helper method
      const existingAttendance = zoomMeeting.findStudentInAttendance({
        email: participantEmail,
        name: participantName,
        zoomParticipantId: participant.id,
      });

      if (!existingAttendance) {
        console.log(
          '⚠️ No attendance record found for leaving participant:',
          participantName
        );
        return;
      }

      // Update attendance with leave time using the student ID from existing record
      zoomMeeting.updateStudentAttendance({
        studentId: existingAttendance.student,
        name: participantName,
        email: participantEmail || existingAttendance.email,
        zoomParticipantId: participant.id,
        leaveTime: new Date(participant.leave_time || new Date()),
      });

      await zoomMeeting.save();
      console.log('✅ Attendance recorded for leave event');
    } catch (error) {
      console.error('❌ Error handling participant left:', error);
    }
  }

  /**
   * Handle meeting started event
   */
  async handleMeetingStarted(payload) {
    try {
      const { object } = payload;
      const meetingId = object.id.toString();

      console.log('🚀 Meeting started:', meetingId);

      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      if (zoomMeeting) {
        await zoomMeeting.startMeeting();
        console.log('✅ Meeting status updated to active');
      }
    } catch (error) {
      console.error('❌ Error handling meeting started:', error);
    }
  }

  /**
   * Handle meeting ended event
   */
  async handleMeetingEnded(payload) {
    try {
      const { object } = payload;
      const meetingId = object.id.toString();

      console.log('🏁 Meeting ended:', meetingId);

      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      if (zoomMeeting) {
        await zoomMeeting.endMeeting();
        console.log('✅ Meeting ended and statistics calculated');
      }
    } catch (error) {
      console.error('❌ Error handling meeting ended:', error);
    }
  }

  /**
   * Handle recording completed event
   * Downloads MP4 from Zoom and uploads to Bunny CDN
   */
  async handleRecordingCompleted(payload) {
    // Must be function-scoped so catch() can access them
    let zoomMeeting = null;
    let meetingExists = false;

    try {
      const { object } = payload;
      const meetingId = object.id.toString();
      const recordingFiles = object.recording_files || [];
      const downloadTokenFromWebhook =
        payload?.download_token || object?.download_token || null;

    console.log('📹 Recording completed for meeting:', meetingId);
    console.log('📋 Recording files available:', recordingFiles.length);

      // Try DB lookup (optional)
      zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      meetingExists = !!zoomMeeting;

    // ✅ Prevent duplicate processing: Check if recording already completed
    if (meetingExists && zoomMeeting.recordingStatus === 'completed') {
      console.log('⏭️ Recording already processed, skipping duplicate webhook');
      return; // Exit early if already completed
    }

    // ✅ Prevent race conditions: Check if recording is currently uploading
    if (meetingExists && zoomMeeting.recordingStatus === 'uploading') {
      console.log('⏳ Recording upload already in progress, skipping duplicate webhook');
      return; // Exit early if upload is in progress
    }

    if (!meetingExists) {
      console.log('⚠️ Meeting not found in DB, continuing anyway');
    } else {
      zoomMeeting.recordingStatus = 'uploading';
      await zoomMeeting.save();
    }

    // Log files
    recordingFiles.forEach((file, index) => {
      console.log(`📄 File ${index + 1}:`, {
        type: file.file_type,
        sizeMB: file.file_size
          ? (file.file_size / 1024 / 1024).toFixed(2)
          : 'unknown',
        status: file.status,
        recording_type: file.recording_type,
        has_download_url: !!file.download_url,
      });
    });

    // Find completed MP4
    const mp4File = recordingFiles.find(
      f =>
        f.file_type === 'MP4' &&
        f.status === 'completed' &&
        f.download_url
    );

    if (!mp4File) {
      console.log('⏳ No completed MP4 yet (still processing)');
      if (meetingExists) {
        zoomMeeting.recordingStatus = 'processing';
        await zoomMeeting.save();
      }
      return;
    }

    console.log('📥 MP4 found, downloading...');
    console.log('📊 Type:', mp4File.recording_type);
    console.log(
      '📊 Size:',
      mp4File.file_size
        ? `${(mp4File.file_size / 1024 / 1024).toFixed(2)} MB`
        : 'unknown'
    );

    console.log('🔐 Downloading recording from Zoom...');
    
    // Get OAuth access token for API calls
    const token = await this.getAccessToken();
    
    let downloadResponse = null;
    let lastDownloadError = null;

    // Strategy 1: Try using Zoom API recording download endpoint (most reliable)
    // Format: GET /meetings/{meetingId}/recordings/{recordingId}/files/{fileId}/download
    if (mp4File.id && object.uuid) {
      try {
        console.log('🔁 Attempt #1: Using Zoom API recording download endpoint');
        
        // Use the recording file ID from webhook
        const apiDownloadUrl = `https://api.zoom.us/v2/meetings/${meetingId}/recordings/${object.uuid}/files/${mp4File.id}/download`;
        
        console.log('🔗 API Download URL:', apiDownloadUrl);
        
        downloadResponse = await axios.get(apiDownloadUrl, {
          responseType: 'arraybuffer',
          timeout: 600000,
          maxRedirects: 10,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'video/mp4,application/octet-stream,*/*',
          },
          validateStatus: (status) => status >= 200 && status < 400,
        });

        console.log('✅ Download successful via API endpoint');
      } catch (apiError) {
        lastDownloadError = apiError;
        const status = apiError.response?.status;
        console.warn(
          `⚠️ API endpoint download failed (status=${status || 'n/a'}):`,
          apiError.message
        );
        
        // If 404, the file ID might not be available, try webhook URL
        if (status !== 404) {
          // For other errors, continue to try webhook URL
        }
      }
    }

    // Strategy 2: Try webhook download URL with different auth methods
    if (!downloadResponse && mp4File.download_url) {
      console.log('🔁 Attempt #2: Using webhook download URL');
      console.log('🔗 Download URL (preview):', mp4File.download_url.substring(0, 60) + '...');
      
      // Try multiple approaches for webhook URLs
      const downloadAttempts = [];
      
      // Attempt 2a: Try with OAuth token as query param
      if (token) {
        downloadAttempts.push({
          url: mp4File.download_url + (mp4File.download_url.includes('?') ? '&' : '?') + `access_token=${encodeURIComponent(token)}`,
          method: 'oauth_token_query',
        });
      }
      
      // Attempt 2b: Try with download_token from webhook if available
      if (downloadTokenFromWebhook) {
        downloadAttempts.push({
          url: mp4File.download_url + (mp4File.download_url.includes('?') ? '&' : '?') + `access_token=${encodeURIComponent(downloadTokenFromWebhook)}`,
          method: 'webhook_download_token',
        });
      }
      
      // Attempt 2c: Try without any token (some webhook URLs are public but expire quickly)
      downloadAttempts.push({
        url: mp4File.download_url,
        method: 'no_token',
      });

      for (let i = 0; i < downloadAttempts.length; i++) {
        const attempt = downloadAttempts[i];
        try {
          console.log(`🔁 Webhook download attempt #${i + 1} (${attempt.method})`);

          const resp = await axios.get(attempt.url, {
            responseType: 'arraybuffer',
            timeout: 600000,
            maxRedirects: 10,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
              Accept: 'video/mp4,application/octet-stream,*/*',
            },
            validateStatus: (status) => status >= 200 && status < 400,
          });

          const contentType = resp.headers?.['content-type'];
          console.log('📦 Download response:', {
            status: resp.status,
            contentType,
            contentLength: resp.headers?.['content-length'],
          });

          // Check if we got HTML instead of video
          if (contentType && contentType.toLowerCase().includes('text/html')) {
            throw new Error(`Zoom returned HTML instead of video (method=${attempt.method})`);
          }

          downloadResponse = resp;
          console.log(`✅ Download successful via ${attempt.method}`);
          break;
        } catch (err) {
          lastDownloadError = err;
          const status = err.response?.status;
          console.warn(
            `⚠️ Webhook download attempt failed (status=${status || 'n/a'}, method=${attempt.method}):`,
            err.message
          );

          // If unauthorized/forbidden, try next method; otherwise stop
          if (status === 401 || status === 403) continue;
          // For other errors, continue trying
        }
      }
    }

    // Strategy 3: Fetch recording details from API and use the download URL from there
    if (!downloadResponse) {
      try {
        console.log('🔁 Attempt #3: Fetching recording details from API and using API download URL');
        
        const recordingsResponse = await axios.get(
          `https://api.zoom.us/v2/meetings/${meetingId}/recordings`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const recordings = recordingsResponse.data;
        if (recordings.recording_files && recordings.recording_files.length > 0) {
          // Find the MP4 file
          const apiMp4File = recordings.recording_files.find(
            f => f.file_type === 'MP4' && f.status === 'completed'
          );

          if (apiMp4File && apiMp4File.download_url) {
            console.log('🔗 Using download URL from API response');
            
            // Try downloading with OAuth token
            downloadResponse = await axios.get(apiMp4File.download_url, {
              responseType: 'arraybuffer',
              timeout: 600000,
              maxRedirects: 10,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'video/mp4,application/octet-stream,*/*',
              },
              validateStatus: (status) => status >= 200 && status < 400,
            });

            console.log('✅ Download successful via API recording details');
          }
        }
      } catch (apiError) {
        lastDownloadError = apiError;
        console.warn('⚠️ API recording details fetch failed:', apiError.message);
      }
    }

    if (!downloadResponse) {
      const status = lastDownloadError?.response?.status;
      throw new Error(
        `Failed to download Zoom recording after all attempts (status=${status || 'n/a'}): ${
          lastDownloadError?.message || 'Unknown error'
        }`
      );
    }

      const videoBuffer = Buffer.from(downloadResponse.data);
      const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);

      console.log(`✅ Downloaded video: ${sizeMB} MB`);
      console.log(
        `📊 Expected size: ${(mp4File.file_size / 1024 / 1024).toFixed(2)} MB`
      );

      // Check if size matches (allow 10% variance for encoding overhead)
      const expectedSize = mp4File.file_size || 0;
      const sizeDifference = Math.abs(videoBuffer.length - expectedSize);
      const sizeVariancePercent =
        expectedSize > 0 ? (sizeDifference / expectedSize) * 100 : 0;

      if (expectedSize > 0 && sizeVariancePercent > 50) {
        console.warn(
          `⚠️ Size mismatch detected: expected ${(
            expectedSize /
            1024 /
            1024
          ).toFixed(2)} MB, got ${sizeMB} MB`
        );
        console.warn(
          `⚠️ This might indicate a download error (HTML error page instead of video)`
        );

        // Log first 200 bytes to debug
        const preview = videoBuffer
          .slice(0, 200)
          .toString('utf8', 0, Math.min(200, videoBuffer.length));
        console.log('📄 File preview (first 200 bytes):', preview.substring(0, 100));

        // Check if it's HTML (error page)
        if (
          preview.toLowerCase().includes('<html') ||
          preview.toLowerCase().includes('<!doctype')
        ) {
          throw new Error(
            'Downloaded file is an HTML page, not a video. Recording may still be processing or token is invalid.'
          );
        }
      }

      // Validate MP4 (check for ftyp box in first 32 bytes)
      const isMP4 =
        videoBuffer.length > 12 &&
        videoBuffer.toString('ascii', 4, 8).includes('ftyp');

      if (!isMP4) {
        // Try to detect file type
        const header = videoBuffer.slice(0, 16).toString('hex');
        console.error('❌ Invalid MP4 file. Header (hex):', header);
        console.error(
          '❌ Header (ascii):',
          videoBuffer
            .slice(0, 32)
            .toString('ascii')
            .replace(/[^\x20-\x7E]/g, '.')
        );
        throw new Error(`Downloaded file is not a valid MP4. Header: ${header}`);
      }

    console.log('✅ MP4 validated');

    // Upload to Bunny
    let uploadResult = null;

    if (bunnyCDNService.isConfigured()) {
      const videoId =
        object.uuid.replace(/[^a-zA-Z0-9]/g, '') ||
        `zoom-${meetingId}-${Date.now()}`;

      const title = meetingExists && zoomMeeting?.meetingName
        ? zoomMeeting.meetingName
        : `Zoom Recording ${meetingId}`;

      console.log('📤 Uploading to Bunny CDN...');
      uploadResult = await bunnyCDNService.uploadVideo(
        videoBuffer,
        videoId,
        title
      );

      console.log('✅ Uploaded to Bunny:', uploadResult.bunnyVideoId);
    } else {
      console.log('⚠️ Bunny CDN not configured, skipping upload');
    }

    // Save DB (optional)
    if (meetingExists) {
      zoomMeeting.recordingStatus = 'completed';
      
      // Save Bunny CDN embed code if available, otherwise save original Zoom URL as backup
      if (uploadResult?.bunnyVideoId) {
        // Generate and save Bunny CDN embed code
        const embedCode = bunnyCDNService.getEmbedCode(uploadResult.bunnyVideoId, {
          autoplay: true,
          loop: false,
          muted: false,
          preload: true,
          responsive: true,
        });
        zoomMeeting.recordingUrl = embedCode;
        zoomMeeting.bunnyVideoId = uploadResult.bunnyVideoId;
        zoomMeeting.bunnyVideoUrl =
          uploadResult.videoUrl ||
          bunnyCDNService.getPlaybackUrl(uploadResult.bunnyVideoId);
        
        console.log('💾 Saved Bunny CDN embed code to recordingUrl');
      } else {
        // Fallback: save original Zoom download URL if Bunny upload failed
        zoomMeeting.recordingUrl = mp4File.download_url;
        console.log('💾 Saved original Zoom URL to recordingUrl (Bunny upload not available)');
      }

      await zoomMeeting.save();
      console.log('💾 Recording info saved to DB');
    }

    console.log('🎉 Recording processing finished successfully');

    } catch (error) {
      console.error('❌ Recording processing failed:', error.message);

      // Update status to failed if meeting exists
      if (meetingExists && zoomMeeting) {
        try {
          zoomMeeting.recordingStatus = 'failed';
          zoomMeeting.recordingError = error.message;
          await zoomMeeting.save();
        } catch (saveError) {
          console.error('❌ Failed to save error status:', saveError.message);
        }
      }

      // Provide actionable guidance
      console.error('\n🔍 Troubleshooting steps:');
      console.error('1. Ensure Zoom app scopes include recording:read:admin');
      console.error('2. Ensure cloud recording is enabled in Zoom account settings');
      console.error('3. Webhook may fire before file is downloadable—retry in 2-5 minutes');
      console.error('4. If 401/403 persists, recording may belong to another Zoom account/user\n');
    }
  }



  /**
   * Manually retry recording download (for failed recordings)
   * @param {String} meetingId - Zoom meeting ID
   * @returns {Promise<Object>} Processing result
   */
  async retryRecordingDownload(meetingId) {
    try {
      console.log('🔄 Manually retrying recording download for meeting:', meetingId);
      
      // Get recording details from Zoom API
      const token = await this.getAccessToken();
      const response = await axios.get(
        `https://api.zoom.us/v2/meetings/${meetingId}/recordings`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const recordingData = response.data;
      
      // Simulate webhook payload
      const payload = {
        download_token: token,
        object: {
          id: meetingId,
          uuid: recordingData.uuid,
          recording_files: recordingData.recording_files,
        },
      };

      // Process using existing handler
      await this.handleRecordingCompleted(payload);
      
      console.log('✅ Manual retry completed');
      return { success: true };
    } catch (error) {
      console.error('❌ Manual retry failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process webhook event
   */
  async processWebhook(event, payload) {
    try {
      console.log('🎯 Processing webhook event:', event);

      switch (event) {
        case 'meeting.participant_joined':
          await this.handleParticipantJoined(payload);
          break;

        case 'meeting.participant_left':
          await this.handleParticipantLeft(payload);
          break;

        case 'meeting.started':
          await this.handleMeetingStarted(payload);
          break;

        case 'meeting.ended':
          await this.handleMeetingEnded(payload);
          break;

        case 'recording.completed':
          await this.handleRecordingCompleted(payload);
          break;

        // Camera and microphone status change events
        case 'meeting.participant_video_started':
          await this.handleParticipantVideoStarted(payload);
          break;

        case 'meeting.participant_video_stopped':
          await this.handleParticipantVideoStopped(payload);
          break;

        case 'meeting.participant_audio_started':
          await this.handleParticipantAudioStarted(payload);
          break;

        case 'meeting.participant_audio_stopped':
          await this.handleParticipantAudioStopped(payload);
          break;

        default:
          console.log('ℹ️ Unhandled event type:', event);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Webhook processing error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle participant video started event
   */
  async handleParticipantVideoStarted(payload) {
    try {
      const { object } = payload;
      const meetingId = object.id.toString();
      const participant = object.participant;

      // Clean and prepare participant data
      const participantName = participant.user_name
        ? decodeURIComponent(participant.user_name.replace(/\+/g, ' '))
        : 'Unknown Participant';

      let participantEmail = participant.email || participant.user_email;

      // If no email provided, try to extract from participant name
      if (!participantEmail) {
        const emailMatch = participantName.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          participantEmail = emailMatch[0];
        }
      }

      console.log('📹 Participant turned video ON:', participantName);

      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      if (zoomMeeting) {
        zoomMeeting.updateStudentStatus(
          {
            email: participantEmail,
            name: participantName,
            zoomParticipantId: participant.id,
          },
          { cameraStatus: 'on' }
        );

        await zoomMeeting.save();
        console.log('✅ Updated camera status to ON for:', participantName);
      }
    } catch (error) {
      console.error('❌ Error handling video started:', error);
    }
  }

  /**
   * Handle participant video stopped event
   */
  async handleParticipantVideoStopped(payload) {
    try {
      const { object } = payload;
      const meetingId = object.id.toString();
      const participant = object.participant;

      // Clean and prepare participant data
      const participantName = participant.user_name
        ? decodeURIComponent(participant.user_name.replace(/\+/g, ' '))
        : 'Unknown Participant';

      let participantEmail = participant.email || participant.user_email;

      // If no email provided, try to extract from participant name
      if (!participantEmail) {
        const emailMatch = participantName.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          participantEmail = emailMatch[0];
        }
      }

      console.log('📹 Participant turned video OFF:', participantName);

      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      if (zoomMeeting) {
        zoomMeeting.updateStudentStatus(
          {
            email: participantEmail,
            name: participantName,
            zoomParticipantId: participant.id,
          },
          { cameraStatus: 'off' }
        );

        await zoomMeeting.save();
        console.log('✅ Updated camera status to OFF for:', participantName);
      }
    } catch (error) {
      console.error('❌ Error handling video stopped:', error);
    }
  }

  /**
   * Handle participant audio started event
   */
  async handleParticipantAudioStarted(payload) {
    try {
      const { object } = payload;
      const meetingId = object.id.toString();
      const participant = object.participant;

      // Clean and prepare participant data
      const participantName = participant.user_name
        ? decodeURIComponent(participant.user_name.replace(/\+/g, ' '))
        : 'Unknown Participant';

      let participantEmail = participant.email || participant.user_email;

      // If no email provided, try to extract from participant name
      if (!participantEmail) {
        const emailMatch = participantName.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          participantEmail = emailMatch[0];
        }
      }

      console.log('🎤 Participant turned audio ON:', participantName);

      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      if (zoomMeeting) {
        zoomMeeting.updateStudentStatus(
          {
            email: participantEmail,
            name: participantName,
            zoomParticipantId: participant.id,
          },
          { micStatus: 'on' }
        );

        await zoomMeeting.save();
        console.log('✅ Updated microphone status to ON for:', participantName);
      }
    } catch (error) {
      console.error('❌ Error handling audio started:', error);
    }
  }

  /**
   * Handle participant audio stopped event
   */
  async handleParticipantAudioStopped(payload) {
    try {
      const { object } = payload;
      const meetingId = object.id.toString();
      const participant = object.participant;

      // Clean and prepare participant data
      const participantName = participant.user_name
        ? decodeURIComponent(participant.user_name.replace(/\+/g, ' '))
        : 'Unknown Participant';

      let participantEmail = participant.email || participant.user_email;

      // If no email provided, try to extract from participant name
      if (!participantEmail) {
        const emailMatch = participantName.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
          participantEmail = emailMatch[0];
        }
      }

      console.log('🎤 Participant turned audio OFF:', participantName);

      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      if (zoomMeeting) {
        zoomMeeting.updateStudentStatus(
          {
            email: participantEmail,
            name: participantName,
            zoomParticipantId: participant.id,
          },
          { micStatus: 'off' }
        );

        await zoomMeeting.save();
        console.log(
          '✅ Updated microphone status to OFF for:',
          participantName
        );
      }
    } catch (error) {
      console.error('❌ Error handling audio stopped:', error);
    }
  }

  /**
   * Process participant report and update database
   */
  async processParticipantReport(zoomMeeting, reportData) {
    try {
      console.log(
        '📊 Processing participant report for meeting:',
        zoomMeeting.meetingId
      );

      if (!reportData.participants || !Array.isArray(reportData.participants)) {
        console.warn('No participants data in report');
        return;
      }

      for (const participant of reportData.participants) {
        // Try to find the user by email
        let user = null;
        if (participant.user_email) {
          user = await User.findOne({
            $or: [
              { email: participant.user_email },
              { studentEmail: participant.user_email },
            ],
          });
        }

        // Calculate participation duration
        const joinTime = new Date(participant.join_time);
        const leaveTime = new Date(participant.leave_time);
        const duration = Math.round((leaveTime - joinTime) / (1000 * 60)); // minutes

        // Update attendance record
        zoomMeeting.updateStudentAttendance({
          studentId: user?._id,
          name: participant.name || participant.user_name,
          email: participant.user_email,
          zoomParticipantId: participant.id,
          joinTime: joinTime,
          leaveTime: leaveTime,
          duration: duration,
          cameraStatus: participant.camera ? 'on' : 'off',
          micStatus: participant.microphone ? 'on' : 'off',
        });
      }

      // Calculate final statistics
      zoomMeeting.calculateAttendanceStats();
      await zoomMeeting.save();

      console.log('✅ Participant report processed successfully');
    } catch (error) {
      console.error('❌ Error processing participant report:', error);
    }
  }

  /**
   * Manually record attendance (for backup/testing)
   */
  async recordAttendance(meetingId, userId, action = 'join') {
    try {
      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId).populate(
        'course'
      );
      if (!zoomMeeting) {
        console.warn('Meeting not found in database:', meetingId);
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        console.warn('User not found:', userId);
        return;
      }

      // Check if user is enrolled in the course
      const isEnrolled = user.enrolledCourses.some(
        (enrollment) =>
          enrollment.course &&
          enrollment.course.toString() === zoomMeeting.course._id.toString()
      );

      if (!isEnrolled) {
        console.log(
          '🚫 User not enrolled in course, blocking attendance record:',
          user.name
        );
        return;
      }

      const attendanceData = {
        studentId: userId,
        name: user.name || `${user.firstName} ${user.lastName}`.trim(),
        email: user.studentEmail || user.email,
        action: action,
        timestamp: new Date(),
      };

      if (action === 'join' || action === 'join_attempt') {
        zoomMeeting.updateStudentAttendance({
          ...attendanceData,
          joinTime: new Date(),
          cameraStatus: 'off', // Default for manual join
          micStatus: 'off', // Default for manual join
        });
      } else if (action === 'leave') {
        zoomMeeting.updateStudentAttendance({
          ...attendanceData,
          leaveTime: new Date(),
        });
      }

      await zoomMeeting.save();
      console.log('✅ Manual attendance recorded:', action);
    } catch (error) {
      console.error('❌ Error recording attendance:', error);
    }
  }

  /**
   * Get comprehensive meeting statistics with fresh data
   */
  async getMeetingStatistics(meetingId) {
    try {
      const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      if (!zoomMeeting) {
        throw new Error('Meeting not found in database');
      }

      // Get fresh participant data from Zoom API if meeting has ended
      if (zoomMeeting.status === 'ended') {
        try {
          const zoomReport = await this.getParticipantReport(meetingId);
          await this.processParticipantReport(zoomMeeting, zoomReport);
        } catch (apiError) {
          console.warn('Could not fetch fresh Zoom data:', apiError.message);
        }
      }

      const stats = {
        meetingId: zoomMeeting.meetingId,
        meetingName: zoomMeeting.meetingName,
        status: zoomMeeting.status,
        totalParticipants: zoomMeeting.totalParticipants,
        maxConcurrentParticipants: zoomMeeting.maxConcurrentParticipants,
        averageAttendancePercentage: zoomMeeting.averageAttendancePercentage,
        duration: zoomMeeting.actualDuration,
        studentsAttended: zoomMeeting.studentsAttended.map((student) => ({
          name: student.name,
          email: student.email,
          totalTimeSpent: student.totalTimeSpent,
          attendancePercentage: student.attendancePercentage,
          joinEvents: student.joinEvents.length,
          firstJoinTime: student.firstJoinTime,
          lastLeaveTime: student.lastLeaveTime,
        })),
      };

      return stats;
    } catch (error) {
      console.error('❌ Error getting meeting statistics:', error);
      throw error;
    }
  }

  /**
   * Get detailed participant report from Zoom API
   */
  async getParticipantReport(meetingId) {
    try {
      const token = await this.getAccessToken();

      console.log('📊 Getting participant report for meeting:', meetingId);

      const response = await axios.get(
        `https://api.zoom.us/v2/report/meetings/${meetingId}/participants`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            page_size: 300, // Max participants to retrieve
            include_fields: 'registrant_id,customer_key',
          },
        }
      );

      console.log('✅ Participant report retrieved successfully');
      return response.data;
    } catch (error) {
      console.error(
        '❌ Error getting participant report:',
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to get participant report: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Get meeting instance participants (for live meetings)
   */
  async getMeetingParticipants(meetingId) {
    try {
      const token = await this.getAccessToken();

      console.log('👥 Getting live participants for meeting:', meetingId);

      const response = await axios.get(
        `https://api.zoom.us/v2/meetings/${meetingId}/participants`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            page_size: 300,
          },
        }
      );

      console.log('✅ Live participants retrieved successfully');
      return response.data;
    } catch (error) {
      console.error(
        '❌ Error getting live participants:',
        error.response?.data || error.message
      );
      return { participants: [] }; // Return empty if meeting not active
    }
  }

  /**
   * Get comprehensive meeting report with all data
   */
  async getComprehensiveMeetingReport(meetingId) {
    try {
      const [meetingDetails, participantReport] = await Promise.allSettled([
        this.getMeetingDetails(meetingId),
        this.getParticipantReport(meetingId),
      ]);

      const report = {
        meeting:
          meetingDetails.status === 'fulfilled' ? meetingDetails.value : null,
        participants:
          participantReport.status === 'fulfilled'
            ? participantReport.value
            : { participants: [] },
        timestamp: new Date(),
      };

      console.log('📋 Comprehensive report generated:', {
        meetingExists: !!report.meeting,
        participantCount: report.participants.participants?.length || 0,
      });

      return report;
    } catch (error) {
      console.error('❌ Error generating comprehensive report:', error);
      throw error;
    }
  }
}

module.exports = new ZoomService();
