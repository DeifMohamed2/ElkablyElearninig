const AdminLog = require('../models/AdminLog');

/**
 * Middleware to log admin actions
 * Usage: Add this middleware after the action is completed
 */
const logAdminAction = (action, actionCategory, targetModel = null) => {
  return async (req, res, next) => {
    // Store the original json method
    const originalJson = res.json.bind(res);
    const startTime = Date.now();

    // Override res.json to capture response
    res.json = function (data) {
      // Only log if admin is authenticated
      if (req.session && req.session.admin) {
        const admin = req.session.admin;
        const duration = Date.now() - startTime;

        // Determine if action was successful
        const status = data.success === false ? 'FAILED' : 'SUCCESS';

        // Create log entry asynchronously (don't wait for it)
        const logData = {
          admin: admin._id,
          adminName: admin.userName,
          adminPhone: admin.phoneNumber,
          action,
          actionCategory,
          targetModel,
          status,
          duration,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent'),
        };

        // Add error message if failed
        if (status === 'FAILED' && data.message) {
          logData.errorMessage = data.message;
        }

        // Store log data in request for controller to add more details
        req.logData = logData;

        // If controller didn't call completeLog, create log now
        setImmediate(() => {
          if (req.logData && !req.logData._logged) {
            AdminLog.createLog(req.logData);
          }
        });
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
};

/**
 * Helper function to complete log with additional details
 * Call this in controller before sending response
 */
const completeLog = (req, details = {}) => {
  if (req.logData) {
    Object.assign(req.logData, details);
    req.logData._logged = true;
    
    // Create log entry
    AdminLog.createLog(req.logData);
  }
};

/**
 * Create a log entry directly (for use in controllers)
 */
const createLog = async (req, {
  action,
  actionCategory,
  description,
  targetModel = null,
  targetId = null,
  targetName = null,
  changes = null,
  metadata = null,
  status = 'SUCCESS',
  errorMessage = null,
}) => {
  // Check for admin in session (using req.session.user which is set during login)
  if (!req.session || !req.session.user) {
    return null;
  }

  // Only log if user is admin or superAdmin
  if (req.session.user.role !== 'admin' && req.session.user.role !== 'superAdmin') {
    return null;
  }

  // Get admin details from database
  const Admin = require('../models/Admin');
  const admin = await Admin.findById(req.session.user.id);
  
  if (!admin) {
    return null;
  }

  const logData = {
    admin: admin._id,
    adminName: admin.userName || req.session.user.name || 'Unknown',
    adminPhone: admin.phoneNumber || 'N/A',
    action,
    actionCategory,
    description,
    targetModel,
    targetId,
    targetName,
    changes,
    metadata,
    status,
    errorMessage,
    ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown',
    userAgent: req.get('user-agent') || 'Unknown',
  };

  return await AdminLog.createLog(logData);
};

/**
 * Helper to get action category from action name
 */
const getActionCategory = (action) => {
  const categoryMap = {
    // Course actions
    CREATE_COURSE: 'COURSE_MANAGEMENT',
    UPDATE_COURSE: 'COURSE_MANAGEMENT',
    DELETE_COURSE: 'COURSE_MANAGEMENT',
    DUPLICATE_COURSE: 'COURSE_MANAGEMENT',
    BULK_UPDATE_COURSE_STATUS: 'COURSE_MANAGEMENT',

    // Topic actions
    CREATE_TOPIC: 'CONTENT_MANAGEMENT',
    UPDATE_TOPIC: 'CONTENT_MANAGEMENT',
    DELETE_TOPIC: 'CONTENT_MANAGEMENT',
    DUPLICATE_TOPIC: 'CONTENT_MANAGEMENT',
    REORDER_TOPICS: 'CONTENT_MANAGEMENT',
    UPDATE_TOPIC_VISIBILITY: 'CONTENT_MANAGEMENT',

    // Content actions
    CREATE_CONTENT: 'CONTENT_MANAGEMENT',
    UPDATE_CONTENT: 'CONTENT_MANAGEMENT',
    DELETE_CONTENT: 'CONTENT_MANAGEMENT',
    REORDER_CONTENT: 'CONTENT_MANAGEMENT',
    RESET_CONTENT_ATTEMPTS: 'CONTENT_MANAGEMENT',

    // Bundle actions
    CREATE_BUNDLE: 'COURSE_MANAGEMENT',
    UPDATE_BUNDLE: 'COURSE_MANAGEMENT',
    DELETE_BUNDLE: 'COURSE_MANAGEMENT',
    ADD_COURSE_TO_BUNDLE: 'COURSE_MANAGEMENT',
    REMOVE_COURSE_FROM_BUNDLE: 'COURSE_MANAGEMENT',
    REORDER_BUNDLE_COURSES: 'COURSE_MANAGEMENT',

    // Student actions
    CREATE_STUDENT: 'STUDENT_MANAGEMENT',
    UPDATE_STUDENT: 'STUDENT_MANAGEMENT',
    DELETE_STUDENT: 'STUDENT_MANAGEMENT',
    TOGGLE_STUDENT_STATUS: 'STUDENT_MANAGEMENT',
    BULK_IMPORT_STUDENTS: 'STUDENT_MANAGEMENT',
    ENROLL_STUDENT: 'STUDENT_MANAGEMENT',
    REMOVE_STUDENT_ENROLLMENT: 'STUDENT_MANAGEMENT',
    BULK_ENROLL_STUDENTS: 'STUDENT_MANAGEMENT',

    // Quiz actions
    CREATE_QUIZ: 'QUIZ_MANAGEMENT',
    UPDATE_QUIZ: 'QUIZ_MANAGEMENT',
    DELETE_QUIZ: 'QUIZ_MANAGEMENT',
    RESTORE_QUIZ: 'QUIZ_MANAGEMENT',
    UPDATE_QUIZ_STATUS: 'QUIZ_MANAGEMENT',
    RESET_QUIZ_ATTEMPTS: 'QUIZ_MANAGEMENT',
    UPLOAD_QUIZ_THUMBNAIL: 'QUIZ_MANAGEMENT',

    // Question Bank actions
    CREATE_QUESTION_BANK: 'QUESTION_BANK_MANAGEMENT',
    UPDATE_QUESTION_BANK: 'QUESTION_BANK_MANAGEMENT',
    DELETE_QUESTION_BANK: 'QUESTION_BANK_MANAGEMENT',
    SYNC_QUESTION_BANKS: 'QUESTION_BANK_MANAGEMENT',

    // Question actions
    CREATE_QUESTION: 'QUESTION_BANK_MANAGEMENT',
    UPDATE_QUESTION: 'QUESTION_BANK_MANAGEMENT',
    DELETE_QUESTION: 'QUESTION_BANK_MANAGEMENT',
    DUPLICATE_QUESTION: 'QUESTION_BANK_MANAGEMENT',
    IMPORT_QUESTIONS: 'QUESTION_BANK_MANAGEMENT',

    // Order actions
    REFUND_ORDER: 'ORDER_MANAGEMENT',
    UPDATE_BOOK_ORDER_STATUS: 'ORDER_MANAGEMENT',
    BULK_UPDATE_BOOK_ORDERS: 'ORDER_MANAGEMENT',

    // Admin Management
    CREATE_ADMIN: 'ADMIN_MANAGEMENT',
    UPDATE_ADMIN: 'ADMIN_MANAGEMENT',
    DELETE_ADMIN: 'ADMIN_MANAGEMENT',
    TOGGLE_ADMIN_STATUS: 'ADMIN_MANAGEMENT',

    // Promo Code actions
    CREATE_PROMO_CODE: 'PROMO_CODE_MANAGEMENT',
    UPDATE_PROMO_CODE: 'PROMO_CODE_MANAGEMENT',
    DELETE_PROMO_CODE: 'PROMO_CODE_MANAGEMENT',
    CREATE_BULK_PROMO_CODES: 'PROMO_CODE_MANAGEMENT',
    DELETE_BULK_COLLECTION: 'PROMO_CODE_MANAGEMENT',
    TOGGLE_BULK_COLLECTION_STATUS: 'PROMO_CODE_MANAGEMENT',

    // Brilliant Students
    CREATE_BRILLIANT_STUDENT: 'STUDENT_MANAGEMENT',
    UPDATE_BRILLIANT_STUDENT: 'STUDENT_MANAGEMENT',
    DELETE_BRILLIANT_STUDENT: 'STUDENT_MANAGEMENT',
    REORDER_BRILLIANT_STUDENTS: 'STUDENT_MANAGEMENT',

    // Team Management
    CREATE_TEAM_MEMBER: 'TEAM_MANAGEMENT',
    UPDATE_TEAM_MEMBER: 'TEAM_MANAGEMENT',
    DELETE_TEAM_MEMBER: 'TEAM_MANAGEMENT',
    REORDER_TEAM_MEMBERS: 'TEAM_MANAGEMENT',

    // Game Room actions
    CREATE_GAME_ROOM: 'GAME_ROOM_MANAGEMENT',
    UPDATE_GAME_ROOM: 'GAME_ROOM_MANAGEMENT',
    DELETE_GAME_ROOM: 'GAME_ROOM_MANAGEMENT',
    PERMANENT_DELETE_GAME_ROOM: 'GAME_ROOM_MANAGEMENT',

    // Zoom Meeting actions
    CREATE_ZOOM_MEETING: 'ZOOM_MANAGEMENT',
    START_ZOOM_MEETING: 'ZOOM_MANAGEMENT',
    END_ZOOM_MEETING: 'ZOOM_MANAGEMENT',
    DELETE_ZOOM_MEETING: 'ZOOM_MANAGEMENT',

    // Communication actions
    SEND_BULK_SMS: 'COMMUNICATION',
    SEND_BULK_WHATSAPP: 'COMMUNICATION',
    SEND_TEST_MESSAGE: 'COMMUNICATION',

    // Export actions
    EXPORT_STUDENTS: 'EXPORT',
    EXPORT_COURSES: 'EXPORT',
    EXPORT_ORDERS: 'EXPORT',
    EXPORT_QUIZZES: 'EXPORT',
    EXPORT_COMPREHENSIVE_REPORT: 'EXPORT',

    // Other actions
    CLEANUP_DUPLICATES: 'SYSTEM',
    UPLOAD_PDF: 'SYSTEM',
  };

  return categoryMap[action] || 'SYSTEM';
};

module.exports = {
  logAdminAction,
  completeLog,
  createLog,
  getActionCategory,
};



