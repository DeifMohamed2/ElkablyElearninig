/**
 * Parent Controller
 * 
 * Handles all API endpoints for the parent mobile application.
 * Parents can login using their phone number and any of their children's student codes.
 * One parent can have multiple students linked to their phone number.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');

// JWT secret for parent authentication
const JWT_SECRET = process.env.PARENT_JWT_SECRET || process.env.JWT_SECRET || 'elkably-parent-secret-key';
const JWT_EXPIRES_IN = process.env.PARENT_JWT_EXPIRES_IN || '350d';

/**
 * Normalize phone number for comparison
 * Removes country code prefixes and leading zeros for consistent matching
 */
const normalizePhoneNumber = (phone) => {
  if (!phone) return null;
  
  // Remove all non-digit characters
  let cleaned = String(phone).replace(/\D/g, '');
  
  // Remove common country codes if present at the start
  const countryCodes = ['20', '966', '971', '965'];
  for (const code of countryCodes) {
    if (cleaned.startsWith(code) && cleaned.length > 10) {
      cleaned = cleaned.substring(code.length);
      break;
    }
  }
  
  // Remove leading zero if present
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  return cleaned;
};

/**
 * Generate JWT token for parent
 */
const generateToken = (parentData) => {
  return jwt.sign(
    {
      parentPhone: parentData.parentPhone,
      parentCountryCode: parentData.parentCountryCode,
      studentIds: parentData.studentIds,
      type: 'parent',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * POST /api/parent/login
 * Login for parent mobile app
 * 
 * Body: {
 *   parentPhone: string (phone number - with or without country code),
 *   studentCode: string (any child's student code),
 *   fcmToken?: string (optional FCM token for push notifications)
 * }
 */
const login = async (req, res) => {
  try {
    const { parentPhone, studentCode, fcmToken } = req.body;

    // Validate required fields
    if (!parentPhone || !studentCode) {
      return res.status(400).json({
        success: false,
        message: 'Parent phone number and student code are required',
      });
    }

    // Normalize the input phone number
    const normalizedInputPhone = normalizePhoneNumber(parentPhone);

    // Find the student by student code
    const student = await User.findOne({
      studentCode: studentCode.trim(),
      role: 'student',
    });

    if (!student) {
      return res.status(401).json({
        success: false,
        message: 'Invalid student code',
      });
    }

    // Normalize the stored parent phone and compare
    const normalizedStoredPhone = normalizePhoneNumber(student.parentNumber);

    if (normalizedInputPhone !== normalizedStoredPhone) {
      return res.status(401).json({
        success: false,
        message: 'Phone number does not match student records',
      });
    }

    // Find ALL students linked to this parent phone (same normalized phone)
    const allStudents = await User.find({
      parentNumber: student.parentNumber,
      parentCountryCode: student.parentCountryCode,
      role: 'student',
    }).select('_id firstName lastName studentCode grade schoolName profileImage isActive parentNumber parentCountryCode');

    if (allStudents.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'No students found for this parent',
      });
    }

    const studentIds = allStudents.map(s => s._id);

    // Update FCM token for all students if provided
    if (fcmToken) {
      await User.updateMany(
        { _id: { $in: studentIds } },
        {
          $set: {
            parentFcmToken: fcmToken,
            parentFcmTokenUpdatedAt: new Date(),
          },
        }
      );
    }

    // Generate JWT token
    const token = generateToken({
      parentPhone: student.parentNumber,
      parentCountryCode: student.parentCountryCode,
      studentIds: studentIds.map(id => id.toString()),
    });

    // Get unread notification count
    const unreadCount = await Notification.getUnreadCount(student.parentNumber);

    // Format students for response
    const studentsData = allStudents.map(s => ({
      id: s._id,
      firstName: s.firstName,
      lastName: s.lastName,
      studentCode: s.studentCode,
      grade: s.grade,
      schoolName: s.schoolName,
      profileImage: s.profileImage || null,
      isActive: s.isActive,
    }));

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      data: {
        parentPhone: student.parentNumber,
        parentCountryCode: student.parentCountryCode,
        students: studentsData,
        unreadNotificationCount: unreadCount,
      },
    });
  } catch (error) {
    console.error('Parent login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * POST /api/parent/refresh-token
 * Refresh JWT token
 */
const refreshToken = async (req, res) => {
  try {
    const parentData = req.parentData;

    // Verify students still exist and get updated data
    const students = await User.find({
      parentNumber: parentData.parentPhone,
      parentCountryCode: parentData.parentCountryCode,
      role: 'student',
    }).select('_id');

    if (students.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'No students found for this parent',
      });
    }

    const studentIds = students.map(s => s._id.toString());

    // Generate new token
    const token = generateToken({
      parentPhone: parentData.parentPhone,
      parentCountryCode: parentData.parentCountryCode,
      studentIds,
    });

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: { token },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({
      success: false,
      message: 'Token refresh failed',
    });
  }
};

/**
 * POST /api/parent/update-fcm-token
 * Update FCM token for push notifications
 * 
 * Body: { fcmToken: string }
 */
const updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const parentData = req.parentData;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required',
      });
    }

    // Find all students for this parent
    const result = await User.updateMany(
      {
        parentNumber: parentData.parentPhone,
        parentCountryCode: parentData.parentCountryCode,
        role: 'student',
      },
      {
        $set: {
          parentFcmToken: fcmToken,
          parentFcmTokenUpdatedAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'FCM token updated successfully',
      data: {
        updatedStudents: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error('FCM token update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update FCM token',
    });
  }
};

/**
 * POST /api/parent/logout
 * Logout - clears FCM token from all linked students
 */
const logout = async (req, res) => {
  try {
    const parentData = req.parentData;

    // Clear FCM token for all students linked to this parent
    const result = await User.updateMany(
      {
        parentNumber: parentData.parentPhone,
        role: 'student',
      },
      {
        $set: { 
          parentFcmToken: null,
          parentFcmTokenUpdatedAt: null,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      data: {
        studentsUpdated: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
};

/**
 * GET /api/parent/students
 * Get all students linked to the parent
 */
const getStudents = async (req, res) => {
  try {
    const parentData = req.parentData;

    const students = await User.find({
      parentNumber: parentData.parentPhone,
      parentCountryCode: parentData.parentCountryCode,
      role: 'student',
    }).select(
      'firstName lastName studentCode grade schoolName profileImage isActive studentEmail enrolledCourses purchasedBundles'
    );

    // Calculate progress for each student
    const studentsWithProgress = await Promise.all(
      students.map(async (student) => {
        // Get enrolled courses count
        const enrolledCoursesCount = student.enrolledCourses?.length || 0;
        
        // Calculate average progress
        let averageProgress = 0;
        if (enrolledCoursesCount > 0) {
          const totalProgress = student.enrolledCourses.reduce(
            (sum, ec) => sum + (ec.progress || 0),
            0
          );
          averageProgress = Math.round(totalProgress / enrolledCoursesCount);
        }

        return {
          id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          studentCode: student.studentCode,
          grade: student.grade,
          schoolName: student.schoolName,
          profileImage: student.profileImage || null,
          isActive: student.isActive,
          email: student.studentEmail,
          enrolledCoursesCount,
          averageProgress,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        students: studentsWithProgress,
        totalStudents: studentsWithProgress.length,
      },
    });
  } catch (error) {
    console.error('Get students error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get students',
    });
  }
};

/**
 * GET /api/parent/students/:studentId
 * Get detailed information about a specific student
 */
const getStudentDetails = async (req, res) => {
  try {
    const { studentId } = req.params;
    const parentData = req.parentData;

    // Verify the student belongs to this parent
    const student = await User.findOne({
      _id: studentId,
      parentNumber: parentData.parentPhone,
      parentCountryCode: parentData.parentCountryCode,
      role: 'student',
    })
      .populate({
        path: 'enrolledCourses.course',
        select: 'title description thumbnail subject grade',
      })
      .populate({
        path: 'purchasedBundles.bundle',
        select: 'title description thumbnail subject',
      });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found or does not belong to this parent',
      });
    }

    // Format enrolled courses
    const enrolledCourses = student.enrolledCourses
      .filter(ec => ec.course)
      .map(ec => ({
        id: ec.course._id,
        title: ec.course.title,
        description: ec.course.description,
        thumbnail: ec.course.thumbnail,
        subject: ec.course.subject,
        grade: ec.course.grade,
        progress: ec.progress || 0,
        status: ec.status,
        enrolledAt: ec.enrolledAt,
        lastAccessed: ec.lastAccessed,
      }));

    // Format purchased bundles
    const purchasedBundles = student.purchasedBundles
      .filter(pb => pb.bundle)
      .map(pb => ({
        id: pb.bundle._id,
        title: pb.bundle.title,
        description: pb.bundle.description,
        thumbnail: pb.bundle.thumbnail,
        subject: pb.bundle.subject,
        purchasedAt: pb.purchasedAt,
        status: pb.status,
      }));

    return res.status(200).json({
      success: true,
      data: {
        student: {
          id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          studentCode: student.studentCode,
          grade: student.grade,
          schoolName: student.schoolName,
          englishTeacher: student.englishTeacher,
          profileImage: student.profileImage || null,
          email: student.studentEmail,
          isActive: student.isActive,
          createdAt: student.createdAt,
        },
        enrolledCourses,
        purchasedBundles,
      },
    });
  } catch (error) {
    console.error('Get student details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get student details',
    });
  }
};

/**
 * GET /api/parent/students/:studentId/progress
 * Get detailed progress for a specific student
 */
const getStudentProgress = async (req, res) => {
  try {
    const { studentId } = req.params;
    const parentData = req.parentData;

    // Verify the student belongs to this parent
    const student = await User.findOne({
      _id: studentId,
      parentNumber: parentData.parentPhone,
      parentCountryCode: parentData.parentCountryCode,
      role: 'student',
    })
      .populate({
        path: 'enrolledCourses.course',
        select: 'title topics',
        populate: {
          path: 'topics',
          select: 'title content',
        },
      })
      .select('firstName lastName enrolledCourses quizAttempts');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Calculate detailed progress
    const courseProgress = student.enrolledCourses
      .filter(ec => ec.course)
      .map(ec => {
        const course = ec.course;
        const totalTopics = course.topics?.length || 0;
        const completedTopics = ec.completedTopics?.length || 0;

        // Calculate content progress
        const contentProgress = ec.contentProgress || [];
        const completedContent = contentProgress.filter(
          cp => cp.completionStatus === 'completed'
        ).length;
        const totalContent = contentProgress.length;

        return {
          courseId: course._id,
          courseTitle: course.title,
          progress: ec.progress || 0,
          status: ec.status,
          totalTopics,
          completedTopics,
          totalContent,
          completedContent,
          lastAccessed: ec.lastAccessed,
        };
      });

    // Calculate quiz statistics
    const quizStats = {
      totalAttempts: 0,
      averageScore: 0,
      bestScore: 0,
      recentQuizzes: [],
    };

    if (student.quizAttempts && student.quizAttempts.length > 0) {
      let totalScore = 0;
      let attemptCount = 0;

      student.quizAttempts.forEach(qa => {
        if (qa.attempts && qa.attempts.length > 0) {
          qa.attempts.forEach(attempt => {
            attemptCount++;
            totalScore += attempt.score || 0;
            if (attempt.score > quizStats.bestScore) {
              quizStats.bestScore = attempt.score;
            }
          });
        }
      });

      quizStats.totalAttempts = attemptCount;
      quizStats.averageScore = attemptCount > 0 ? Math.round(totalScore / attemptCount) : 0;
    }

    return res.status(200).json({
      success: true,
      data: {
        studentName: `${student.firstName} ${student.lastName}`,
        courseProgress,
        quizStats,
        overallProgress: courseProgress.length > 0
          ? Math.round(courseProgress.reduce((sum, cp) => sum + cp.progress, 0) / courseProgress.length)
          : 0,
      },
    });
  } catch (error) {
    console.error('Get student progress error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get student progress',
    });
  }
};

/**
 * GET /api/parent/notifications
 * Get notifications for the parent
 * 
 * Query params:
 *   page: number (default 1)
 *   limit: number (default 20)
 *   unreadOnly: boolean (default false)
 *   studentId: string (optional - filter by student)
 *   type: string (optional - filter by notification type)
 */
const getNotifications = async (req, res) => {
  try {
    const parentData = req.parentData;
    const {
      page = 1,
      limit = 20,
      unreadOnly = 'false',
      studentId,
      type,
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true',
    };

    if (studentId) {
      // Verify the student belongs to this parent
      const student = await User.findOne({
        _id: studentId,
        parentNumber: parentData.parentPhone,
        parentCountryCode: parentData.parentCountryCode,
      });
      
      if (student) {
        options.studentId = studentId;
      }
    }

    if (type) {
      options.type = type;
    }

    const result = await Notification.getParentNotifications(
      parentData.parentPhone,
      options
    );

    // Get unread count
    const unreadCount = await Notification.getUnreadCount(parentData.parentPhone);

    return res.status(200).json({
      success: true,
      data: {
        notifications: result.notifications,
        pagination: result.pagination,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get notifications',
    });
  }
};

/**
 * GET /api/parent/notifications/:notificationId
 * Get a specific notification
 */
const getNotificationDetails = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const parentData = req.parentData;

    const notification = await Notification.findOne({
      _id: notificationId,
      parentPhone: parentData.parentPhone,
    }).populate('student', 'firstName lastName studentCode profileImage');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: { notification },
    });
  } catch (error) {
    console.error('Get notification details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get notification',
    });
  }
};

/**
 * PUT /api/parent/notifications/:notificationId/read
 * Mark a notification as read
 */
const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const parentData = req.parentData;

    const notification = await Notification.markAsRead(
      notificationId,
      parentData.parentPhone
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Get updated unread count
    const unreadCount = await Notification.getUnreadCount(parentData.parentPhone);

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: {
        notification,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
    });
  }
};

/**
 * PUT /api/parent/notifications/mark-all-read
 * Mark all notifications as read
 */
const markAllNotificationsAsRead = async (req, res) => {
  try {
    const parentData = req.parentData;

    const result = await Notification.markAllAsRead(parentData.parentPhone);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        modifiedCount: result.modifiedCount,
        unreadCount: 0,
      },
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
    });
  }
};

/**
 * GET /api/parent/notifications/unread-count
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
  try {
    const parentData = req.parentData;

    const unreadCount = await Notification.getUnreadCount(parentData.parentPhone);

    return res.status(200).json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
    });
  }
};

/**
 * DELETE /api/parent/notifications/:notificationId
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const parentData = req.parentData;

    const result = await Notification.deleteOne({
      _id: notificationId,
      parentPhone: parentData.parentPhone,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
    });
  }
};

/**
 * Middleware: Authenticate parent from JWT
 */
const authenticateParent = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded || decoded.type !== 'parent') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Verify at least one student still exists
    const studentExists = await User.exists({
      parentNumber: decoded.parentPhone,
      parentCountryCode: decoded.parentCountryCode,
      role: 'student',
    });

    if (!studentExists) {
      return res.status(401).json({
        success: false,
        message: 'No students found for this parent',
      });
    }

    // Attach parent data to request
    req.parentData = {
      parentPhone: decoded.parentPhone,
      parentCountryCode: decoded.parentCountryCode,
      studentIds: decoded.studentIds,
    };

    next();
  } catch (error) {
    console.error('Parent authentication error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

module.exports = {
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
};
