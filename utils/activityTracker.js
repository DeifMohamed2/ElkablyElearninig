/**
 * Activity Tracker Utility
 * 
 * Easy-to-use helper functions to track user activities throughout the application.
 * Use this in controllers to log important user actions.
 */

const { logActivity, logSecurity, logFunction, ActivityActions, SecurityEvents } = require('./logger');

/**
 * Extract user info from request object
 */
const extractUserInfo = (req) => {
  if (!req) return {};
  
  const info = {
    ip: req.headers?.['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection?.remoteAddress || 'Unknown',
    userAgent: req.get?.('user-agent') || req.headers?.['user-agent'] || 'Unknown',
    sessionId: req.sessionID || null,
    requestId: req.requestId || null,
  };

  // Check different user types in session
  if (req.session) {
    if (req.session.user) {
      info.userId = req.session.user.id || req.session.user._id;
      info.userName = req.session.user.name || req.session.user.userName;
      info.userRole = req.session.user.role || 'user';
      info.userPhone = req.session.user.phone || req.session.user.phoneNumber;
    } else if (req.session.admin) {
      info.userId = req.session.admin._id;
      info.userName = req.session.admin.userName;
      info.userRole = req.session.admin.role || 'admin';
      info.userPhone = req.session.admin.phoneNumber;
    } else if (req.session.student) {
      info.userId = req.session.student.id || req.session.student._id;
      info.userName = req.session.student.name;
      info.userRole = 'student';
      info.userPhone = req.session.student.phone;
    } else if (req.session.parent) {
      info.userId = req.session.parent.id || req.session.parent._id;
      info.userName = req.session.parent.name;
      info.userRole = 'parent';
      info.userPhone = req.session.parent.phone;
    }
  }

  return info;
};

/**
 * Track a user activity
 * @param {Object} req - Express request object
 * @param {string} action - Action name (use ActivityActions constants)
 * @param {Object} details - Additional details about the action
 */
const trackActivity = (req, action, details = {}) => {
  const userInfo = extractUserInfo(req);
  
  logActivity(action, {
    ...userInfo,
    ...details,
  });
};

/**
 * Track student activities - specialized trackers
 */
const StudentTracker = {
  // Login/Logout
  login: (req, student, success = true, errorMessage = null) => {
    const userInfo = extractUserInfo(req);
    logActivity(ActivityActions.LOGIN, {
      ...userInfo,
      userId: student?._id || student?.id,
      userName: student?.name,
      userRole: 'student',
      userPhone: student?.phone,
      success,
      errorMessage,
    });
    
    logSecurity(success ? SecurityEvents.LOGIN_SUCCESS : SecurityEvents.LOGIN_FAILED, {
      ...userInfo,
      userId: student?._id,
      userName: student?.name,
      userRole: 'student',
      success,
      reason: errorMessage,
    });
  },

  logout: (req) => {
    const userInfo = extractUserInfo(req);
    logActivity(ActivityActions.LOGOUT, {
      ...userInfo,
      userRole: 'student',
    });
  },

  // Course viewing
  viewCourse: (req, courseId, courseName) => {
    trackActivity(req, ActivityActions.VIEW_COURSE, {
      targetType: 'Course',
      targetId: courseId,
      targetName: courseName,
    });
  },

  viewTopic: (req, topicId, topicName, courseId) => {
    trackActivity(req, ActivityActions.VIEW_TOPIC, {
      targetType: 'Topic',
      targetId: topicId,
      targetName: topicName,
      details: { courseId },
    });
  },

  viewContent: (req, contentId, contentType, topicId) => {
    trackActivity(req, ActivityActions.VIEW_CONTENT, {
      targetType: 'Content',
      targetId: contentId,
      details: { contentType, topicId },
    });
  },

  // Quiz
  startQuiz: (req, quizId, quizName) => {
    trackActivity(req, ActivityActions.START_QUIZ, {
      targetType: 'Quiz',
      targetId: quizId,
      targetName: quizName,
    });
  },

  submitQuiz: (req, quizId, quizName, score, totalQuestions) => {
    trackActivity(req, ActivityActions.SUBMIT_QUIZ, {
      targetType: 'Quiz',
      targetId: quizId,
      targetName: quizName,
      details: { score, totalQuestions, percentage: Math.round((score / totalQuestions) * 100) },
    });
  },

  // Video/Content
  watchVideo: (req, videoId, videoName, watchDuration) => {
    trackActivity(req, ActivityActions.WATCH_VIDEO, {
      targetType: 'Video',
      targetId: videoId,
      targetName: videoName,
      details: { watchDuration },
    });
  },

  downloadPdf: (req, pdfId, pdfName) => {
    trackActivity(req, ActivityActions.DOWNLOAD_PDF, {
      targetType: 'PDF',
      targetId: pdfId,
      targetName: pdfName,
    });
  },

  // Registration
  register: (req, student, success = true, errorMessage = null) => {
    const userInfo = extractUserInfo(req);
    logActivity(ActivityActions.REGISTRATION, {
      ...userInfo,
      userId: student?._id,
      userName: student?.name,
      userRole: 'student',
      userPhone: student?.phone,
      success,
      errorMessage,
    });
  },
};

/**
 * Track admin activities
 */
const AdminTracker = {
  login: (req, admin, success = true, errorMessage = null) => {
    const userInfo = extractUserInfo(req);
    logActivity(ActivityActions.ADMIN_LOGIN, {
      ...userInfo,
      userId: admin?._id,
      userName: admin?.userName,
      userRole: admin?.role || 'admin',
      userPhone: admin?.phoneNumber,
      success,
      errorMessage,
    });
    
    logSecurity(success ? SecurityEvents.LOGIN_SUCCESS : SecurityEvents.LOGIN_FAILED, {
      ...userInfo,
      userId: admin?._id,
      userName: admin?.userName,
      userRole: 'admin',
      success,
      reason: errorMessage,
    });
  },

  logout: (req, admin) => {
    const userInfo = extractUserInfo(req);
    logActivity(ActivityActions.ADMIN_LOGOUT, {
      ...userInfo,
      userId: admin?._id,
      userName: admin?.userName,
      userRole: 'admin',
    });
  },

  // Course management
  createCourse: (req, course) => {
    trackActivity(req, ActivityActions.CREATE_COURSE, {
      targetType: 'Course',
      targetId: course?._id,
      targetName: course?.title,
    });
  },

  updateCourse: (req, courseId, courseName, changes) => {
    trackActivity(req, ActivityActions.UPDATE_COURSE, {
      targetType: 'Course',
      targetId: courseId,
      targetName: courseName,
      details: { changes },
    });
  },

  deleteCourse: (req, courseId, courseName) => {
    trackActivity(req, ActivityActions.DELETE_COURSE, {
      targetType: 'Course',
      targetId: courseId,
      targetName: courseName,
    });
  },

  // Student management
  enrollStudent: (req, studentId, studentName, courseId, courseName) => {
    trackActivity(req, ActivityActions.ENROLL_STUDENT, {
      targetType: 'Student',
      targetId: studentId,
      targetName: studentName,
      details: { courseId, courseName },
    });
  },

  removeEnrollment: (req, studentId, studentName, courseId, courseName) => {
    trackActivity(req, ActivityActions.REMOVE_ENROLLMENT, {
      targetType: 'Student',
      targetId: studentId,
      targetName: studentName,
      details: { courseId, courseName },
    });
  },

  // Quiz management
  createQuiz: (req, quiz) => {
    trackActivity(req, ActivityActions.CREATE_QUIZ, {
      targetType: 'Quiz',
      targetId: quiz?._id,
      targetName: quiz?.title,
    });
  },

  updateQuiz: (req, quizId, quizName, changes) => {
    trackActivity(req, ActivityActions.UPDATE_QUIZ, {
      targetType: 'Quiz',
      targetId: quizId,
      targetName: quizName,
      details: { changes },
    });
  },

  deleteQuiz: (req, quizId, quizName) => {
    trackActivity(req, ActivityActions.DELETE_QUIZ, {
      targetType: 'Quiz',
      targetId: quizId,
      targetName: quizName,
    });
  },
};

/**
 * Track parent activities
 */
const ParentTracker = {
  login: (req, parent, success = true, errorMessage = null) => {
    const userInfo = extractUserInfo(req);
    logActivity(ActivityActions.PARENT_LOGIN, {
      ...userInfo,
      userId: parent?._id,
      userName: parent?.name,
      userRole: 'parent',
      userPhone: parent?.phone,
      success,
      errorMessage,
    });
  },

  viewProgress: (req, studentId, studentName) => {
    trackActivity(req, ActivityActions.PARENT_VIEW_PROGRESS, {
      targetType: 'Student',
      targetId: studentId,
      targetName: studentName,
    });
  },

  viewReport: (req, reportType, studentId) => {
    trackActivity(req, ActivityActions.PARENT_VIEW_REPORT, {
      targetType: 'Report',
      details: { reportType, studentId },
    });
  },
};

/**
 * Track purchase activities
 */
const PurchaseTracker = {
  initiated: (req, purchaseId, courseId, courseName, amount) => {
    trackActivity(req, ActivityActions.PURCHASE_INITIATED, {
      targetType: 'Purchase',
      targetId: purchaseId,
      details: { courseId, courseName, amount },
    });
  },

  completed: (req, purchaseId, courseId, courseName, amount, paymentMethod) => {
    trackActivity(req, ActivityActions.PURCHASE_COMPLETED, {
      targetType: 'Purchase',
      targetId: purchaseId,
      details: { courseId, courseName, amount, paymentMethod },
      success: true,
    });
  },

  failed: (req, purchaseId, courseId, courseName, amount, errorMessage) => {
    trackActivity(req, ActivityActions.PURCHASE_FAILED, {
      targetType: 'Purchase',
      targetId: purchaseId,
      details: { courseId, courseName, amount },
      success: false,
      errorMessage,
    });
  },

  refundRequested: (req, purchaseId, reason) => {
    trackActivity(req, ActivityActions.REFUND_REQUESTED, {
      targetType: 'Purchase',
      targetId: purchaseId,
      details: { reason },
    });
  },

  refundCompleted: (req, purchaseId, amount) => {
    trackActivity(req, ActivityActions.REFUND_COMPLETED, {
      targetType: 'Purchase',
      targetId: purchaseId,
      details: { amount },
    });
  },
};

/**
 * Track security events
 */
const SecurityTracker = {
  unauthorizedAccess: (req, resource, reason) => {
    const userInfo = extractUserInfo(req);
    logSecurity(SecurityEvents.UNAUTHORIZED_ACCESS, {
      ...userInfo,
      resource,
      reason,
    });
  },

  suspiciousActivity: (req, activityType, details) => {
    const userInfo = extractUserInfo(req);
    logSecurity(SecurityEvents.SUSPICIOUS_ACTIVITY, {
      ...userInfo,
      activityType,
      details,
    });
  },

  permissionDenied: (req, resource, requiredRole) => {
    const userInfo = extractUserInfo(req);
    logSecurity(SecurityEvents.PERMISSION_DENIED, {
      ...userInfo,
      resource,
      requiredRole,
    });
  },

  bruteForceAttempt: (req, attemptCount, targetUser) => {
    const userInfo = extractUserInfo(req);
    logSecurity(SecurityEvents.BRUTE_FORCE_ATTEMPT, {
      ...userInfo,
      attemptCount,
      targetUser,
    });
  },
};

/**
 * Track function execution time
 */
const FunctionTracker = {
  track: (functionName, module, req = null, startTime) => {
    const duration = Date.now() - startTime;
    const userInfo = req ? extractUserInfo(req) : {};
    
    logFunction(functionName, {
      module,
      duration,
      userId: userInfo.userId,
      success: true,
    });
  },

  trackError: (functionName, module, error, req = null, startTime) => {
    const duration = Date.now() - startTime;
    const userInfo = req ? extractUserInfo(req) : {};
    
    logFunction(functionName, {
      module,
      duration,
      userId: userInfo.userId,
      success: false,
      error: error.message,
    });
  },

  /**
   * Wrapper to automatically track function execution
   */
  wrap: (fn, functionName, module) => {
    return async function(req, res, ...args) {
      const startTime = Date.now();
      try {
        const result = await fn.call(this, req, res, ...args);
        FunctionTracker.track(functionName, module, req, startTime);
        return result;
      } catch (error) {
        FunctionTracker.trackError(functionName, module, error, req, startTime);
        throw error;
      }
    };
  },
};

module.exports = {
  trackActivity,
  extractUserInfo,
  
  // Specialized trackers
  StudentTracker,
  AdminTracker,
  ParentTracker,
  PurchaseTracker,
  SecurityTracker,
  FunctionTracker,
  
  // Re-export constants
  ActivityActions,
  SecurityEvents,
};
