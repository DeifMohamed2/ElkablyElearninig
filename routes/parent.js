/**
 * Parent Routes
 * 
 * API routes for the parent mobile application.
 * All routes are prefixed with /api/parent
 */

const express = require('express');
const router = express.Router();
const {
  login,
  refreshToken,
  updateFcmToken,
  logout,
  getStudents,
  getStudentDetails,
  getStudentProgress,
  getNotifications,
  getNotificationDetails,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  deleteNotification,
  authenticateParent,
} = require('../controllers/parentController');

// ==================== Public Routes (No Authentication Required) ====================

/**
 * POST /api/parent/login
 * Login for parent mobile app
 * Body: { parentPhone, countryCode, studentCode, fcmToken? }
 */
router.post('/login', login);

// ==================== Protected Routes (Authentication Required) ====================

// Apply authentication middleware to all routes below
router.use(authenticateParent);

// --- Token Management ---

/**
 * POST /api/parent/refresh-token
 * Refresh JWT token
 */
router.post('/refresh-token', refreshToken);

/**
 * POST /api/parent/update-fcm-token
 * Update FCM token for push notifications
 * Body: { fcmToken }
 */
router.post('/update-fcm-token', updateFcmToken);

/**
 * POST /api/parent/logout
 * Logout - clears FCM token
 */
router.post('/logout', logout);

// --- Students ---

/**
 * GET /api/parent/students
 * Get all students linked to the parent
 */
router.get('/students', getStudents);

/**
 * GET /api/parent/students/:studentId
 * Get detailed information about a specific student
 */
router.get('/students/:studentId', getStudentDetails);

/**
 * GET /api/parent/students/:studentId/progress
 * Get detailed progress for a specific student
 */
router.get('/students/:studentId/progress', getStudentProgress);

// --- Notifications ---

/**
 * GET /api/parent/notifications
 * Get notifications for the parent
 * Query: { page?, limit?, unreadOnly?, studentId?, type? }
 */
router.get('/notifications', getNotifications);

/**
 * GET /api/parent/notifications/unread-count
 * Get unread notification count
 */
router.get('/notifications/unread-count', getUnreadCount);

/**
 * GET /api/parent/notifications/:notificationId
 * Get a specific notification
 */
router.get('/notifications/:notificationId', getNotificationDetails);

/**
 * PUT /api/parent/notifications/:notificationId/read
 * Mark a notification as read
 */
router.put('/notifications/:notificationId/read', markNotificationAsRead);

/**
 * PUT /api/parent/notifications/mark-all-read
 * Mark all notifications as read
 */
router.put('/notifications/mark-all-read', markAllNotificationsAsRead);

/**
 * DELETE /api/parent/notifications/:notificationId
 * Delete a notification
 */
router.delete('/notifications/:notificationId', deleteNotification);

module.exports = router;
