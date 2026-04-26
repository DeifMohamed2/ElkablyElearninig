const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const zoomService = require('../utils/zoomService');
const { isAdmin, isStudent, isAuthenticated } = require('../middlewares/auth');
const {
  isStudentOrMobileZoom,
  dispatchJoinZoomMeeting,
} = require('../middlewares/zoomStudentAuth');
const {
  createZoomMeeting,
  startZoomMeeting,
  endZoomMeeting,
  getZoomMeetingStats,
  deleteZoomMeeting,
} = require('../controllers/adminController');
const {
  joinZoomMeeting,
  leaveZoomMeeting,
  getZoomMeetingHistory,
} = require('../controllers/studentController');
const { applyBunnyStreamFieldsFromRecordingInput } = require('../utils/mobileBunnyRecording');

// ==================== ADMIN ROUTES ====================

// Create Zoom meeting for a topic
router.post(
  '/admin/courses/:courseCode/topics/:topicId/zoom/create',
  isAdmin,
  createZoomMeeting,
);

// Start Zoom meeting (unlock for students)
router.post('/admin/zoom/:meetingId/start', isAdmin, startZoomMeeting);

// End Zoom meeting
router.post('/admin/zoom/:meetingId/end', isAdmin, endZoomMeeting);

// Add recording URL to ended meeting
router.post(
  '/admin/zoom/:meetingId/add-recording',
  isAdmin,
  async (req, res) => {
    try {
      const { meetingId } = req.params;
      const { recordingUrl } = req.body;

      if (!recordingUrl || !recordingUrl.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Recording URL is required',
        });
      }

      const ZoomMeeting = require('../models/ZoomMeeting');
      const zoomMeeting = await ZoomMeeting.findById(meetingId);

      if (!zoomMeeting) {
        return res.status(404).json({
          success: false,
          message: 'Zoom meeting not found',
        });
      }

      if (zoomMeeting.status !== 'ended') {
        return res.status(400).json({
          success: false,
          message: 'Can only add recording URL to ended meetings',
        });
      }

      const trimmed = recordingUrl.trim();
      zoomMeeting.recordingUrl = trimmed;
      zoomMeeting.recordingStatus = 'completed';
      applyBunnyStreamFieldsFromRecordingInput(zoomMeeting, trimmed);
      await zoomMeeting.save();

      console.log(`✅ Recording URL added to meeting ${meetingId}`);

      res.json({
        success: true,
        message: 'Recording URL added successfully',
        zoomMeeting: zoomMeeting,
      });
    } catch (error) {
      console.error('❌ Error adding recording URL:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to add recording URL',
      });
    }
  },
);

// Get fresh start URL for host (start_url tokens expire)
router.get('/admin/zoom/:meetingId/start-url', isAdmin, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const ZoomMeeting = require('../models/ZoomMeeting');
    const zoomMeeting = await ZoomMeeting.findById(meetingId);

    if (!zoomMeeting) {
      return res
        .status(404)
        .json({ success: false, message: 'Zoom meeting not found' });
    }

    if (zoomMeeting.status !== 'active') {
      return res
        .status(400)
        .json({ success: false, message: 'Meeting is not active' });
    }

    // Fetch fresh meeting details from Zoom API to get a non-expired start_url
    const meetingDetails = await zoomService.getMeetingDetails(
      zoomMeeting.meetingId,
    );

    if (!meetingDetails || !meetingDetails.start_url) {
      return res
        .status(500)
        .json({
          success: false,
          message: 'Could not retrieve fresh start URL from Zoom',
        });
    }

    // Update stored startUrl for reference
    zoomMeeting.startUrl = meetingDetails.start_url;
    await zoomMeeting.save();

    res.json({ success: true, startUrl: meetingDetails.start_url });
  } catch (error) {
    console.error('❌ Error getting fresh start URL:', error);
    res
      .status(500)
      .json({
        success: false,
        message: error.message || 'Failed to get start URL',
      });
  }
});

// Get Zoom meeting statistics
router.get('/admin/zoom/:meetingId/stats', isAdmin, getZoomMeetingStats);

// Delete Zoom meeting
router.delete('/admin/zoom/:meetingId', isAdmin, deleteZoomMeeting);

// ==================== STUDENT ROUTES ====================

// Debug endpoint to check Zoom configuration
router.get('/debug/config', (req, res) => {
  res.json({
    hasClientId: !!process.env.ZOOM_CLIENT_ID,
    hasClientSecret: !!process.env.ZOOM_CLIENT_SECRET,
    hasAccountId: !!process.env.ZOOM_ACCOUNT_ID,
    hasUserId: !!process.env.ZOOM_USER_ID,
    clientIdLength: process.env.ZOOM_CLIENT_ID
      ? process.env.ZOOM_CLIENT_ID.length
      : 0,
    appType: 'Server-to-Server OAuth',
    features: [
      'Meeting Creation',
      'Meeting Management',
      'Participant Reports',
      'Webhooks',
    ],
  });
});

// Join Zoom meeting (web session or mobile Bearer JWT — same as /api/student/zoom/meetings/:id/join)
router.post(
  '/student/zoom/:meetingId/join',
  isStudentOrMobileZoom,
  dispatchJoinZoomMeeting(joinZoomMeeting),
);

// Record join attempt for analytics
router.post(
  '/student/zoom/:meetingId/join-attempt',
  isStudent,
  async (req, res) => {
    try {
      const { meetingId } = req.params;
      const studentId = req.session.user.id;

      // Record the join attempt
      await zoomService.recordAttendance(meetingId, studentId, 'join_attempt');

      res.json({ success: true, message: 'Join attempt recorded' });
    } catch (error) {
      // Error recording join attempt
      res
        .status(500)
        .json({ success: false, message: 'Failed to record join attempt' });
    }
  },
);

// Leave Zoom meeting (record attendance)
router.post('/student/zoom/:meetingId/leave', isStudent, leaveZoomMeeting);

// Mark recording as watched
router.post(
  '/student/zoom/:meetingId/mark-recording-watched',
  isStudent,
  async (req, res) => {
    try {
      const { meetingId } = req.params;
      const studentId = req.session.user.id;

      const ZoomMeeting = require('../models/ZoomMeeting');
      const User = require('../models/User');
      const Topic = require('../models/Topic');

      const zoomMeeting = await ZoomMeeting.findById(meetingId)
        .populate('course')
        .populate('topic');

      if (!zoomMeeting) {
        return res.status(404).json({
          success: false,
          message: 'Zoom meeting not found',
        });
      }

      const student = await User.findById(studentId);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found',
        });
      }

      // Check if student already watched the recording
      const alreadyWatched = zoomMeeting.studentsWatchedRecording.some(
        (record) => record.student.toString() === studentId,
      );

      if (!alreadyWatched) {
        // Add student to watched recording list
        zoomMeeting.studentsWatchedRecording.push({
          student: studentId,
          watchedAt: new Date(),
          completedWatching: true,
          watchDuration: zoomMeeting.duration || 0,
        });

        await zoomMeeting.save();
      }

      // Auto-mark content as completed when recording is watched
      try {
        // Get course and topic IDs (handle both populated and non-populated)
        const courseId = zoomMeeting.course._id || zoomMeeting.course;
        const topicId = zoomMeeting.topic._id || zoomMeeting.topic;

        const topic = await Topic.findById(topicId);

        if (topic && topic.content) {
          const zoomContentItem = topic.content.find(
            (item) =>
              item.type === 'zoom' &&
              item.zoomMeeting &&
              item.zoomMeeting.toString() === zoomMeeting._id.toString(),
          );

          if (zoomContentItem) {
            // Refresh student to get latest data before updating
            const freshStudent = await User.findById(studentId);

            // Update content progress to mark as completed
            await freshStudent.updateContentProgress(
              courseId,
              topicId,
              zoomContentItem._id,
              'zoom',
              {
                completionStatus: 'completed',
                progressPercentage: 100,
                lastAccessed: new Date(),
                completedAt: new Date(),
              },
            );
          }
        }
      } catch (progressError) {
        // Don't fail the request if progress update fails
      }

      res.json({
        success: true,
        message: 'Recording marked as watched and content marked as completed',
      });
    } catch (error) {
      // Error marking recording as watched
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to mark recording as watched',
      });
    }
  },
);

// Get student's Zoom meeting history
router.get('/student/zoom/history', isStudent, getZoomMeetingHistory);

// ==================== ZOOM WEBHOOK ROUTES ====================

/**
 * Zoom webhook endpoint for receiving meeting events
 * This endpoint handles:
 * - endpoint.url_validation (for webhook URL validation)
 * - meeting.started
 * - meeting.ended
 * - meeting.participant_joined
 * - meeting.participant_left
 * - recording.completed
 */
router.post('/webhook', async (req, res) => {
  try {
    const { event, payload } = req.body;

    console.log('🎯 Zoom webhook received:', event);

    // Handle URL validation challenge from Zoom
    if (event === 'endpoint.url_validation') {
      const plainToken = payload?.plainToken;

      if (!plainToken) {
        console.error('❌ Missing plainToken in validation request');
        return res.status(400).json({
          error: 'Missing plainToken in validation payload',
        });
      }

      // Get webhook secret token from environment
      const webhookSecret = process.env.ZOOM_Token;

      if (!webhookSecret) {
        console.error(
          '❌ ZOOM_WEBHOOK_SECRET_TOKEN or ZOOM_WEBHOOK_SECRET not set in environment',
        );
        return res.status(500).json({
          error: 'Webhook secret not configured',
        });
      }

      // Generate encrypted token using HMAC SHA-256
      const encryptedToken = crypto
        .createHmac('sha256', webhookSecret)
        .update(plainToken)
        .digest('hex');

      console.log('✅ URL validation response sent');

      // Return both tokens for Zoom to verify
      return res.status(200).json({
        plainToken: plainToken,
        encryptedToken: encryptedToken,
      });
    }

    // Process other webhook events
    await zoomService.processWebhook(event, payload);

    // Respond with 200 to acknowledge receipt
    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    // Still return 200 to prevent Zoom from retrying
    res.status(200).json({ status: 'error', message: error.message });
  }
});

/**
 * Zoom webhook validation endpoint
 * Zoom sends a validation request when setting up webhooks
 */
router.get('/webhook', (req, res) => {
  res.status(200).send('Zoom webhook endpoint is active');
});

// ==================== UTILITY ROUTES ====================

/**
 * Get meeting report and statistics
 * Used for admin dashboards and analytics
 */
router.get('/admin/zoom/:meetingId/report', isAdmin, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const report = await zoomService.getComprehensiveMeetingReport(meetingId);

    res.json({
      success: true,
      report: report,
    });
  } catch (error) {
    console.error('❌ Report generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate meeting report',
    });
  }
});

module.exports = router;
