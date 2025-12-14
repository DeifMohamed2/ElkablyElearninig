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
    try {
      const { object } = payload;
      const meetingId = object.id.toString();
      const recordingFiles = object.recording_files || [];
      
      console.log('📹 Recording completed event received for meeting:', meetingId);
      console.log('📋 Recording files available:', recordingFiles.length);

      // Find the Zoom meeting in database
      let zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
      const meetingExists = !!zoomMeeting;
      
      if (!meetingExists) {
        console.log('⚠️ Zoom meeting not found in database:', meetingId);
        console.log('📤 Will still process and upload recording...');
      } else {
        // Update status to indicate processing
        zoomMeeting.recordingStatus = 'uploading';
        await zoomMeeting.save();
      }

      // Log all recording files for debugging
      console.log('📋 Recording files details:');
      recordingFiles.forEach((file, index) => {
        console.log(`  File ${index + 1}:`, {
          type: file.file_type,
          size: file.file_size ? `${(file.file_size / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
          status: file.status,
          recording_type: file.recording_type,
          has_download_url: !!file.download_url,
        });
      });

      // Find MP4 recording file
      const mp4File = recordingFiles.find(
        (file) => file.file_type === 'MP4' && file.download_url && file.status === 'completed'
      );

      if (!mp4File) {
        console.log('⚠️ No completed MP4 recording file found');
        
        // Check if recording is still processing
        const processingFile = recordingFiles.find(
          (file) => file.file_type === 'MP4' && file.status === 'processing'
        );
        
        if (processingFile) {
          console.log('⏳ Recording is still processing, will retry later');
          if (meetingExists && zoomMeeting) {
            zoomMeeting.recordingStatus = 'processing';
            await zoomMeeting.save();
          }
          return;
        }
        
        // Save any available URL
        if (meetingExists && zoomMeeting) {
          zoomMeeting.recordingStatus = 'completed';
          zoomMeeting.recordingUrl = recordingFiles[0]?.download_url || null;
          await zoomMeeting.save();
        } else {
          console.log('📝 Meeting not in DB, skipping database update');
        }
        return;
      }

      console.log('📥 Found MP4 file, starting download from Zoom...');
      console.log('📊 File size:', mp4File.file_size ? `${(mp4File.file_size / 1024 / 1024).toFixed(2)} MB` : 'Unknown');
      console.log('📊 Recording type:', mp4File.recording_type);
      console.log('📊 Status:', mp4File.status);

      // Get Zoom access token
      const zoomToken = await this.getAccessToken();

      // Step 1: Download MP4 from Zoom
      // Zoom webhook download URLs are usually pre-signed and don't need auth
      // But some may require OAuth token, so we'll try both methods
      console.log('⬇️ Downloading video from Zoom...');
      let downloadResponse;
      let videoBuffer;

      // Method 1: Try without authentication first (most webhook URLs are pre-signed)
      try {
        console.log('🔐 Attempting download without authentication (pre-signed URL)...');
        downloadResponse = await axios.get(mp4File.download_url, {
          responseType: 'arraybuffer',
          // No Authorization header for pre-signed URLs
          timeout: 600000,
          maxRedirects: 5, // Allow redirects
          onDownloadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              if (percentCompleted % 10 === 0) {
                console.log(`⬇️ Download progress: ${percentCompleted}%`);
              }
            }
          },
        });
        videoBuffer = Buffer.from(downloadResponse.data);
        console.log('✅ Downloaded using pre-signed URL (no auth required)');
      } catch (noAuthError) {
        // If that fails, try with OAuth Bearer token
        if (noAuthError.response && (noAuthError.response.status === 401 || noAuthError.response.status === 403)) {
          console.log('⚠️ Pre-signed URL failed, trying with OAuth Bearer token...');
          try {
            downloadResponse = await axios.get(mp4File.download_url, {
              responseType: 'arraybuffer',
              headers: {
                Authorization: `Bearer ${zoomToken}`,
              },
              timeout: 600000,
              maxRedirects: 5,
              onDownloadProgress: (progressEvent) => {
                if (progressEvent.total) {
                  const percentCompleted = Math.round(
                    (progressEvent.loaded * 100) / progressEvent.total
                  );
                  if (percentCompleted % 10 === 0) {
                    console.log(`⬇️ Download progress: ${percentCompleted}%`);
                  }
                }
              },
            });
            videoBuffer = Buffer.from(downloadResponse.data);
            console.log('✅ Downloaded using OAuth Bearer token');
          } catch (authError) {
            // If Bearer token also fails, try using Zoom API to get the recording
            console.log('⚠️ Bearer token failed, trying via Zoom API...');
            try {
              const meetingUUID = object.uuid;
              
              // First, get the recording details from Zoom API
              const recordingsResponse = await axios.get(
                `https://api.zoom.us/v2/meetings/${meetingUUID}/recordings`,
                {
                  headers: {
                    Authorization: `Bearer ${zoomToken}`,
                  },
                }
              );

              // Find the MP4 file in the recordings
              const recordings = recordingsResponse.data.recording_files || [];
              const apiMp4File = recordings.find(
                (file) => file.file_type === 'MP4' && file.download_url
              );

              if (apiMp4File && apiMp4File.download_url) {
                // Try downloading from the API-provided URL
                downloadResponse = await axios.get(apiMp4File.download_url, {
                  responseType: 'arraybuffer',
                  headers: {
                    Authorization: `Bearer ${zoomToken}`,
                  },
                  timeout: 600000,
                  maxRedirects: 5,
                  onDownloadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                      const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                      );
                      if (percentCompleted % 10 === 0) {
                        console.log(`⬇️ Download progress: ${percentCompleted}%`);
                      }
                    }
                  },
                });
                videoBuffer = Buffer.from(downloadResponse.data);
                console.log('✅ Downloaded via Zoom API endpoint');
              } else {
                throw new Error('MP4 file not found in Zoom API recordings');
              }
            } catch (apiError) {
              console.error('❌ All download methods failed');
              console.error('Pre-signed URL error:', noAuthError.message);
              console.error('Bearer token error:', authError.message);
              console.error('API endpoint error:', apiError.message);
              throw new Error(`Failed to download recording: ${apiError.message || authError.message || noAuthError.message}`);
            }
          }
        } else {
          // Re-throw if it's not an auth error
          throw noAuthError;
        }
      }

      console.log(`✅ Video downloaded successfully: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

      // Validate the downloaded file
      // Check minimum file size (should be at least 100KB for a valid video)
      const minVideoSize = 100 * 1024; // 100 KB
      if (videoBuffer.length < minVideoSize) {
        console.error(`⚠️ Downloaded file is too small (${(videoBuffer.length / 1024).toFixed(2)} KB), likely not a valid video`);
        console.error('File header (first 20 bytes):', videoBuffer.slice(0, 20).toString('hex'));
        
        // Check if it's an HTML error page
        const contentPreview = videoBuffer.toString('utf8', 0, Math.min(500, videoBuffer.length));
        console.error('File content preview:', contentPreview.substring(0, 200));
        
        if (contentPreview.includes('<html') || contentPreview.includes('<!DOCTYPE') || contentPreview.includes('<HTML')) {
          throw new Error('Downloaded file is an HTML page, not a video. The download URL may be invalid or expired.');
        }
        
        if (contentPreview.includes('error') || contentPreview.includes('Error') || contentPreview.includes('ERROR')) {
          throw new Error(`Downloaded file contains an error message: ${contentPreview.substring(0, 200)}`);
        }
        
        console.warn('⚠️ File is very small but will attempt to upload anyway');
      }
      
      // Check if it's actually a video file (MP4 should start with specific bytes)
      // MP4 files typically start with 'ftyp' at bytes 4-8
      const isValidMP4 = videoBuffer.length > 12 && 
                         videoBuffer.toString('ascii', 4, 8).includes('ftyp');
      
      if (!isValidMP4) {
        console.error('⚠️ Downloaded file does not appear to be a valid MP4 video');
        console.error('File header (first 20 bytes):', videoBuffer.slice(0, 20).toString('hex'));
        console.error('Expected MP4 signature (ftyp) not found at bytes 4-8');
        
        // Try to identify what type of file it is
        const header = videoBuffer.slice(0, 4).toString('hex');
        const fileType = {
          '89504e47': 'PNG image',
          'ffd8ffe0': 'JPEG image',
          'ffd8ffe1': 'JPEG image',
          '25504446': 'PDF document',
          '504b0304': 'ZIP archive',
        }[header] || 'Unknown file type';
        
        console.error('File appears to be:', fileType);
        throw new Error(`Downloaded file is not a valid MP4 video (appears to be ${fileType})`);
      }
      
      console.log('✅ File validated as valid MP4 video');

      // Step 2: Upload to Bunny CDN
      if (!bunnyCDNService.isConfigured()) {
        console.log('⚠️ Bunny CDN not configured, saving Zoom URL only');
        if (meetingExists && zoomMeeting) {
          zoomMeeting.recordingStatus = 'completed';
          zoomMeeting.recordingUrl = mp4File.download_url;
          await zoomMeeting.save();
        } else {
          console.log('📝 Meeting not in DB, skipping database update');
        }
        return;
      }

      // Generate unique video ID from meeting UUID
      const videoId = object.uuid.replace(/[^a-zA-Z0-9]/g, '') || `zoom-${meetingId}-${Date.now()}`;
      const videoTitle = meetingExists && zoomMeeting?.meetingName 
        ? `${zoomMeeting.meetingName} - ${new Date().toLocaleDateString()}`
        : `Zoom Recording ${meetingId} - ${new Date().toLocaleDateString()}`;

      // Step 2: Try uploading to Bunny CDN (with fallback to Zoom URL)
      let uploadResult = null;
      try {
        console.log('📤 Uploading to Bunny CDN...');
        uploadResult = await bunnyCDNService.uploadVideo(
          videoBuffer,
          videoId,
          videoTitle
        );
        console.log('✅ Recording uploaded to Bunny CDN successfully!');
        console.log('📺 Bunny Video ID:', uploadResult.bunnyVideoId);
        console.log('🔗 Bunny Video URL:', uploadResult.videoUrl || bunnyCDNService.getPlaybackUrl(uploadResult.bunnyVideoId));
      } catch (bunnyError) {
        console.error('⚠️ Failed to upload to Bunny CDN, falling back to Zoom URL');
        console.error('Bunny CDN error:', bunnyError.message);
        // Continue with Zoom URL as fallback
        uploadResult = null;
      }

      // Step 3: Update database with recording information (if meeting exists)
      if (meetingExists && zoomMeeting) {
        zoomMeeting.recordingStatus = 'completed';
        zoomMeeting.recordingUrl = mp4File.download_url; // Always save Zoom URL as backup/primary
        
        // If Bunny CDN upload succeeded, save that info too
        if (uploadResult && uploadResult.bunnyVideoId) {
          zoomMeeting.bunnyVideoId = uploadResult.bunnyVideoId;
          zoomMeeting.bunnyVideoUrl = uploadResult.videoUrl || bunnyCDNService.getPlaybackUrl(uploadResult.bunnyVideoId);
          console.log('💾 Saved Bunny CDN information to database');
        } else {
          console.log('💾 Saved Zoom recording URL to database (Bunny CDN upload failed)');
        }
        
        await zoomMeeting.save();
      } else {
        if (uploadResult && uploadResult.bunnyVideoId) {
          console.log('✅ Recording uploaded to Bunny CDN successfully!');
          console.log('📺 Bunny Video ID:', uploadResult.bunnyVideoId);
          console.log('🔗 Bunny Video URL:', uploadResult.videoUrl || bunnyCDNService.getPlaybackUrl(uploadResult.bunnyVideoId));
        } else {
          console.log('✅ Recording downloaded successfully (Zoom URL available)');
          console.log('🔗 Zoom Recording URL:', mp4File.download_url);
        }
        console.log('⚠️ Meeting not in database - recording processed but not linked to meeting record');
      }
    } catch (error) {
      console.error('❌ Error handling recording completed:', error.message);
      
      // Try to save Zoom URL even if download/upload failed
      try {
        const { object } = payload;
        const meetingId = object.id.toString();
        const recordingFiles = object.recording_files || [];
        const mp4File = recordingFiles.find(
          (file) => file.file_type === 'MP4' && file.download_url
        );
        
        const zoomMeeting = await ZoomMeeting.findByMeetingId(meetingId);
        if (zoomMeeting) {
          // If we have a Zoom URL, save it even if upload failed
          if (mp4File && mp4File.download_url) {
            zoomMeeting.recordingStatus = 'completed';
            zoomMeeting.recordingUrl = mp4File.download_url;
            await zoomMeeting.save();
            console.log('💾 Saved Zoom recording URL despite upload failure');
          } else {
            zoomMeeting.recordingStatus = 'failed';
            await zoomMeeting.save();
          }
        }
      } catch (saveError) {
        console.error('❌ Failed to update recording status:', saveError);
      }

      // Log full error details for debugging
      if (error.response) {
        console.error('Error response:', {
          status: error.response.status,
          data: error.response.data,
        });
      }
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
