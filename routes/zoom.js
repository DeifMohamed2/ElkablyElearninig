const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const zoomService = require('../utils/zoomService');
const { isAdmin, isStudent, isAuthenticated } = require('../middlewares/auth');
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

// ==================== ADMIN ROUTES ====================

// Create Zoom meeting for a topic
router.post(
  '/admin/courses/:courseCode/topics/:topicId/zoom/create',
  isAdmin,
  createZoomMeeting
);

// Start Zoom meeting (unlock for students)
router.post('/admin/zoom/:meetingId/start', isAdmin, startZoomMeeting);

// End Zoom meeting
router.post('/admin/zoom/:meetingId/end', isAdmin, endZoomMeeting);

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

// Join Zoom meeting (redirect to external client)
router.post('/student/zoom/:meetingId/join', isStudent, joinZoomMeeting);

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
      console.error('Error recording join attempt:', error);
      res
        .status(500)
        .json({ success: false, message: 'Failed to record join attempt' });
    }
  }
);

// Leave Zoom meeting (record attendance)
router.post('/student/zoom/:meetingId/leave', isStudent, leaveZoomMeeting);

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
          error: 'Missing plainToken in validation payload' 
        });
      }

      // Get webhook secret token from environment
      const webhookSecret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || process.env.ZOOM_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.error('❌ ZOOM_WEBHOOK_SECRET_TOKEN or ZOOM_WEBHOOK_SECRET not set in environment');
        return res.status(500).json({ 
          error: 'Webhook secret not configured' 
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
