/**
 * Firebase Cloud Messaging (FCM) Notification Service
 * 
 * This service handles all Firebase push notifications for the parent mobile app.
 * It mirrors the functionality of WhatsApp/SMS notifications but sends via FCM.
 * 
 * Setup Instructions:
 * 1. Create a Firebase project at https://console.firebase.google.com/
 * 2. Go to Project Settings > Service Accounts
 * 3. Click "Generate new private key" and save the JSON file
 * 4. Set the environment variables:
 *    - FIREBASE_PROJECT_ID: Your Firebase project ID
 *    - FIREBASE_CLIENT_EMAIL: Service account email
 *    - FIREBASE_PRIVATE_KEY: Private key (with \n replaced properly)
 *    OR
 *    - FIREBASE_SERVICE_ACCOUNT_PATH: Path to the service account JSON file
 */

const path = require('path');
const User = require('../models/User');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');
const Notification = require('../models/Notification');

class FirebaseNotificationService {
  constructor() {
    this.admin = null;
    this.initialized = false;
    this.initializationError = null;
    this._initialize();
  }

  /**
   * Initialize Firebase Admin SDK
   */
  _initialize() {
    try {
      // Check if firebase-admin is installed
      let admin;
      try {
        admin = require('firebase-admin');
      } catch (err) {
        console.warn('⚠️ firebase-admin package not installed. Run: npm install firebase-admin');
        this.initializationError = 'firebase-admin package not installed';
        return;
      }

      // Check if already initialized
      if (admin.apps.length > 0) {
        this.admin = admin;
        this.initialized = true;
        console.log('✅ Firebase Admin SDK already initialized');
        return;
      }

      // Try to initialize with service account file first
      const serviceAccountPath = path.resolve(__dirname, '../serviceAccount.json');
      
      if (serviceAccountPath) {
        try {
          const serviceAccount = require(serviceAccountPath);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          this.admin = admin;
          this.initialized = true;
          console.log('✅ Firebase Admin SDK initialized with service account file');
          return;
        } catch (err) {
          console.warn('⚠️ Could not load Firebase service account file:', err.message);
        }
      }

      // Try to initialize with environment variables
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (projectId && clientEmail && privateKey) {
        // Handle escaped newlines in private key
        privateKey = privateKey.replace(/\\n/g, '\n');
        
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.admin = admin;
        this.initialized = true;
        console.log('✅ Firebase Admin SDK initialized with environment variables');
        return;
      }

      // Firebase not configured
      console.warn('⚠️ Firebase not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY');
      this.initializationError = 'Firebase credentials not configured';
      
    } catch (error) {
      console.error('❌ Firebase initialization error:', error);
      this.initializationError = error.message;
    }
  }

  /**
   * Check if Firebase is ready
   */
  isReady() {
    return this.initialized && this.admin !== null;
  }

  /**
   * Format time spent in human-readable format
   */
  formatTimeSpent(minutes) {
    if (!minutes || minutes === 0) return '0 minutes';
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      if (remainingMinutes > 0) {
        const minsFormatted = remainingMinutes % 1 === 0 
          ? remainingMinutes.toString() 
          : remainingMinutes.toFixed(1);
        return `${hours} hour${hours > 1 ? 's' : ''} ${minsFormatted} minute${remainingMinutes !== 1 ? 's' : ''}`;
      } else {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
      }
    } else {
      const minsFormatted = minutes % 1 === 0 
        ? minutes.toString() 
        : minutes.toFixed(1);
      return `${minsFormatted} minute${minutes !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Get FCM tokens for a parent (from all their students)
   */
  async getParentFcmTokens(parentPhone, parentCountryCode) {
    try {
      // Find all students with this parent phone
      const students = await User.find({
        parentNumber: parentPhone,
        parentCountryCode: parentCountryCode,
        parentFcmToken: { $exists: true, $ne: null, $ne: '' },
      }).select('parentFcmToken');

      // Collect unique FCM tokens
      const tokens = [...new Set(students.map(s => s.parentFcmToken).filter(Boolean))];
      return tokens;
    } catch (error) {
      console.error('Error getting parent FCM tokens:', error);
      return [];
    }
  }

  /**
   * Get FCM token for a specific student's parent
   */
  async getStudentParentFcmToken(studentId) {
    try {
      const student = await User.findById(studentId).select('parentFcmToken parentNumber parentCountryCode');
      if (!student) return null;
      
      // If the student has a direct token, use it
      if (student.parentFcmToken) {
        return {
          token: student.parentFcmToken,
          parentPhone: student.parentNumber,
          parentCountryCode: student.parentCountryCode,
        };
      }
      
      // Otherwise, look for any sibling with the same parent phone that has a token
      const sibling = await User.findOne({
        parentNumber: student.parentNumber,
        parentCountryCode: student.parentCountryCode,
        parentFcmToken: { $exists: true, $ne: null, $ne: '' },
      }).select('parentFcmToken');

      if (sibling) {
        return {
          token: sibling.parentFcmToken,
          parentPhone: student.parentNumber,
          parentCountryCode: student.parentCountryCode,
        };
      }

      return {
        token: null,
        parentPhone: student.parentNumber,
        parentCountryCode: student.parentCountryCode,
      };
    } catch (error) {
      console.error('Error getting student parent FCM token:', error);
      return null;
    }
  }

  /**
   * Send FCM notification to a single token
   */
  async sendToToken(token, title, body, data = {}, options = {}) {
    if (!this.isReady()) {
      console.warn('⚠️ Firebase not initialized, skipping FCM notification');
      return { success: false, error: this.initializationError || 'Firebase not initialized' };
    }

    try {
      const message = {
        token,
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          // Ensure all data values are strings
          ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          ),
        },
        android: {
          priority: options.priority === 'high' ? 'high' : 'normal',
          notification: {
            channelId: options.channelId || 'elkably_notifications',
            icon: options.icon || 'notification_icon',
            color: options.color || '#4CAF50',
            sound: options.sound || 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title,
                body,
              },
              sound: options.sound || 'default',
              badge: options.badge || 0,
            },
          },
        },
      };

      // Add image if provided
      if (options.imageUrl) {
        message.notification.imageUrl = options.imageUrl;
        message.android.notification.imageUrl = options.imageUrl;
        message.apns.fcmOptions = { image: options.imageUrl };
      }

      const response = await this.admin.messaging().send(message);
      console.log('✅ FCM message sent successfully:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('❌ FCM send error:', error);
      
      // Handle invalid token
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        return { success: false, error: 'Invalid or expired token', invalidToken: true };
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Send FCM notification to multiple tokens
   */
  async sendToTokens(tokens, title, body, data = {}, options = {}) {
    if (!this.isReady()) {
      console.warn('⚠️ Firebase not initialized, skipping FCM notification');
      return { success: false, error: this.initializationError || 'Firebase not initialized' };
    }

    if (!tokens || tokens.length === 0) {
      return { success: false, error: 'No tokens provided' };
    }

    try {
      const message = {
        notification: {
          title,
          body,
        },
        data: {
          ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          ),
        },
        android: {
          priority: options.priority === 'high' ? 'high' : 'normal',
          notification: {
            channelId: options.channelId || 'elkably_notifications',
            icon: options.icon || 'notification_icon',
            color: options.color || '#4CAF50',
            sound: options.sound || 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title,
                body,
              },
              sound: options.sound || 'default',
              badge: options.badge || 0,
            },
          },
        },
        tokens,
      };

      if (options.imageUrl) {
        message.notification.imageUrl = options.imageUrl;
      }

      const response = await this.admin.messaging().sendEachForMulticast(message);
      
      console.log(`✅ FCM multicast: ${response.successCount} successful, ${response.failureCount} failed`);
      
      // Collect invalid tokens for cleanup
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(tokens[idx]);
          }
        }
      });

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
      };
    } catch (error) {
      console.error('❌ FCM multicast error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save notification to database and send FCM
   */
  async sendAndSaveNotification(studentId, type, title, body, fullMessage, data = {}, options = {}) {
    try {
      const student = await User.findById(studentId).select(
        'firstName lastName studentCode parentNumber parentCountryCode parentFcmToken'
      );
      
      if (!student) {
        console.error('Student not found:', studentId);
        return { success: false, error: 'Student not found' };
      }

      // Create notification record
      const notification = await Notification.createNotification({
        parentPhone: student.parentNumber,
        parentCountryCode: student.parentCountryCode,
        student: studentId,
        type,
        title,
        body,
        fullMessage,
        data,
        priority: options.priority || 'normal',
        actionUrl: options.actionUrl,
        imageUrl: options.imageUrl,
      });

      // Get FCM tokens for the parent
      const tokenInfo = await this.getStudentParentFcmToken(studentId);
      
      if (!tokenInfo || !tokenInfo.token) {
        console.log('📱 No FCM token available for parent, notification saved to database only');
        return {
          success: true,
          notificationId: notification._id,
          fcmSent: false,
          message: 'Notification saved, no FCM token available',
        };
      }

      // Send FCM notification
      const fcmResult = await this.sendToToken(tokenInfo.token, title, body, {
        ...data,
        notificationId: notification._id.toString(),
        type,
        studentId: studentId.toString(),
      }, options);

      // Update notification with delivery status
      await notification.updateDeliveryStatus('fcm', {
        success: fcmResult.success,
        error: fcmResult.error,
        messageId: fcmResult.messageId,
      });

      // If token is invalid, clear it from the user
      if (fcmResult.invalidToken) {
        await User.updateMany(
          { parentNumber: student.parentNumber, parentCountryCode: student.parentCountryCode },
          { $set: { parentFcmToken: null } }
        );
      }

      return {
        success: true,
        notificationId: notification._id,
        fcmSent: fcmResult.success,
        fcmError: fcmResult.error,
        messageId: fcmResult.messageId,
      };
    } catch (error) {
      console.error('❌ Error in sendAndSaveNotification:', error);
      return { success: false, error: error.message };
    }
  }

  // ==================== Notification Message Generators ====================

  /**
   * Generate quiz completion notification
   */
  getQuizCompletionNotification(student, quizData, score, totalQuestions, percentage) {
    const studentName = student.firstName || student.name || 'Student';
    const quizTitle = quizData.title || 'Quiz';
    const grade = `${score}/${totalQuestions}`;

    let emoji, message;
    if (percentage >= 90) {
      emoji = '🎉';
      message = 'Outstanding performance!';
    } else if (percentage >= 70) {
      emoji = '👍';
      message = 'Good job! Great progress!';
    } else if (percentage >= 50) {
      emoji = '📈';
      message = 'Keep encouraging them!';
    } else {
      emoji = '💪';
      message = 'More practice needed.';
    }

    return {
      title: `${emoji} Quiz Completed - ${studentName}`,
      body: `${quizTitle}: ${grade} (${percentage}%) - ${message}`,
      fullMessage: `📚 Quiz Completed!\n\n🎓 Student: ${studentName}\n📝 Quiz: ${quizTitle}\n📊 Score: ${grade} (${percentage}%)\n\n${message}\n\n🏆 ELKABLY TEAM`,
    };
  }

  /**
   * Generate content completion notification
   */
  getContentCompletionNotification(student, contentData, courseData) {
    const studentName = student.firstName || student.name || 'Student';
    const contentTitle = contentData.title || 'Content';
    const weekTitle = courseData.title || 'Week';

    return {
      title: `📖 Progress Update - ${studentName}`,
      body: `Completed "${contentTitle}" in ${weekTitle}`,
      fullMessage: `📖 Content Progress!\n\n🎓 Student: ${studentName}\n📚 Week: ${weekTitle}\n📝 Content: ${contentTitle}\n\n🎉 Your student is making great progress!\n\n🏆 ELKABLY TEAM`,
    };
  }

  /**
   * Generate topic completion notification
   */
  getTopicCompletionNotification(student, topicData, courseData) {
    const studentName = student.firstName || student.name || 'Student';
    const topicTitle = topicData.title || 'Topic';
    const weekTitle = courseData.title || 'Week';

    return {
      title: `📚 Topic Completed - ${studentName}`,
      body: `Completed "${topicTitle}" in ${weekTitle}`,
      fullMessage: `📚 Topic Completed!\n\n🎓 Student: ${studentName}\n📖 Week: ${weekTitle}\n📝 Topic: ${topicTitle}\n\n🎉 Excellent work! Keep encouraging them!\n\n🏆 ELKABLY TEAM`,
    };
  }

  /**
   * Generate course/week completion notification
   */
  getCourseCompletionNotification(student, courseData) {
    const studentName = student.firstName || student.name || 'Student';
    const weekTitle = courseData.title || 'Week';

    return {
      title: `🎓 Week Completed - ${studentName}`,
      body: `Successfully completed "${weekTitle}"! Congratulations!`,
      fullMessage: `🎓 Week Completed!\n\n🎓 Student: ${studentName}\n📚 Week: ${weekTitle}\n\n🏆 Congratulations! Your student has successfully completed the week!\n\n🎉 Excellent work!\n\n🏆 ELKABLY TEAM`,
    };
  }

  /**
   * Generate purchase notification
   */
  getPurchaseNotification(student, purchaseData) {
    const studentName = student.firstName || 'Student';
    const orderNum = purchaseData.orderNumber || purchaseData._id?.toString() || 'N/A';
    const total = purchaseData.total || 0;
    const cartItems = purchaseData.items ? purchaseData.items.length : 0;
    const bookItems = purchaseData.bookOrders ? purchaseData.bookOrders.length : 0;
    const totalItems = cartItems + bookItems;

    return {
      title: `🎉 Payment Confirmed - ${studentName}`,
      body: `Order #${orderNum}: ${totalItems} item(s) - EGP ${total}`,
      fullMessage: `🎉 Payment Confirmed Successfully!\n\n🎓 Student: ${studentName}\n📦 Order: #${orderNum}\n📚 Items: ${totalItems} item(s)\n💰 Total: EGP ${total}\n\n🏆 Thank you for your purchase!\n\n🏆 ELKABLY TEAM`,
    };
  }

  /**
   * Generate welcome notification
   */
  getWelcomeNotification(student) {
    const studentName = student.firstName || 'Student';
    const studentCode = student.studentCode || '';
    const schoolName = student.schoolName || '';
    const grade = student.grade || '';

    let body = `Welcome! Code: ${studentCode}`;
    if (grade) body += ` | Grade: ${grade}`;

    let fullMessage = `🎉 Welcome to ELKABLY!\n\n🎓 Student: ${studentName}\n🆔 Code: ${studentCode}`;
    if (schoolName) fullMessage += `\n🏫 School: ${schoolName}`;
    if (grade) fullMessage += `\n📚 Grade: ${grade}`;
    fullMessage += `\n\n🎯 Your learning journey begins now!\n\n🏆 ELKABLY TEAM`;

    return {
      title: `🎉 Welcome to ELKABLY - ${studentName}`,
      body,
      fullMessage,
    };
  }

  /**
   * Generate course enrollment notification
   */
  getCourseEnrollmentNotification(student, courseData) {
    const studentName = student.firstName || student.name || 'Student';
    const weekTitle = courseData.title || 'Week';
    const subject = courseData.subject || '';

    let body = `Enrolled in "${weekTitle}"`;
    if (subject) body += ` - ${subject}`;

    return {
      title: `📚 Enrollment Confirmed - ${studentName}`,
      body,
      fullMessage: `📚 Enrollment Confirmed!\n\n🎓 Student: ${studentName}\n📖 Week: ${weekTitle}${subject ? `\n📚 Subject: ${subject}` : ''}\n\n🎯 Ready to learn! Access materials now!\n\n🏆 ELKABLY TEAM`,
    };
  }

  /**
   * Generate bundle enrollment notification
   */
  getBundleEnrollmentNotification(student, bundleData) {
    const studentName = student.firstName || student.name || 'Student';
    const courseTitle = bundleData.title || 'Course';
    const weeksCount = bundleData.courses ? bundleData.courses.length : 0;
    const subject = bundleData.subject || '';

    let body = `Enrolled in "${courseTitle}" (${weeksCount} weeks)`;
    if (subject) body += ` - ${subject}`;

    return {
      title: `📦 Course Enrollment - ${studentName}`,
      body,
      fullMessage: `📦 Course Enrollment Confirmed!\n\n🎓 Student: ${studentName}\n📚 Course: ${courseTitle}\n📖 Weeks: ${weeksCount} included${subject ? `\n📚 Subject: ${subject}` : ''}\n\n🎯 Access all week materials now!\n\n🏆 ELKABLY TEAM`,
    };
  }

  /**
   * Generate zoom meeting attendance notification
   */
  getZoomMeetingNotification(student, meetingData) {
    const studentName = student.firstName || 'Student';
    const meetingName = meetingData.meetingName || 'Live Session';
    const attendancePercent = meetingData.attendancePercentage || 0;
    const attendanceFormatted = attendancePercent % 1 === 0 
      ? attendancePercent.toString() 
      : attendancePercent.toFixed(1);
    const timeSpent = this.formatTimeSpent(meetingData.timeSpent || 0);
    const joinedLate = meetingData.joinedLate || false;

    let body = `${meetingName}: ${attendanceFormatted}% attendance (${timeSpent})`;
    if (joinedLate) body += ' ⚠️ Joined Late';

    let fullMessage = `📹 Live Session Update\n\n🎓 Student: ${studentName}\n📺 Session: ${meetingName}`;
    if (meetingData.courseTitle) fullMessage += `\n📚 Course: ${meetingData.courseTitle}`;
    fullMessage += `\n📊 Attendance: ${attendanceFormatted}%\n⏱️ Time: ${timeSpent}`;
    if (joinedLate) fullMessage += `\n⚠️ Joined Late`;
    fullMessage += attendancePercent >= 50 
      ? `\n\n✅ Completed! Great job!\n\n🏆 ELKABLY TEAM`
      : `\n\n⚠️ More attendance needed\n\n🏆 ELKABLY TEAM`;

    return {
      title: `📹 Live Session - ${studentName}`,
      body,
      fullMessage,
    };
  }

  /**
   * Generate zoom meeting non-attendance notification
   */
  getZoomNonAttendanceNotification(student, meetingData) {
    const studentName = student.firstName || 'Student';
    const meetingName = meetingData.meetingName || 'Live Session';
    const watchedRecording = meetingData.watchedRecording || false;

    const status = watchedRecording 
      ? 'Attended recording session (not live)'
      : 'Did not attend live session';

    return {
      title: `📹 Live Session Update - ${studentName}`,
      body: `${meetingName}: ${status}`,
      fullMessage: `📹 Live Session Update\n\n🎓 Student: ${studentName}\n📺 Session: ${meetingName}${meetingData.courseTitle ? `\n📚 Course: ${meetingData.courseTitle}` : ''}\n\n${status}\n\n🏆 ELKABLY TEAM`,
    };
  }

  // ==================== High-Level Notification Methods ====================

  /**
   * Send quiz completion notification
   */
  async sendQuizCompletionNotification(studentId, quizData, score, totalQuestions) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const percentage = Math.round((score / totalQuestions) * 100);
      const notification = this.getQuizCompletionNotification(student, quizData, score, totalQuestions, percentage);

      return await this.sendAndSaveNotification(
        studentId,
        'quiz_completion',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          quizId: quizData._id?.toString() || '',
          quizTitle: quizData.title || '',
          score: score.toString(),
          totalQuestions: totalQuestions.toString(),
          percentage: percentage.toString(),
        }
      );
    } catch (error) {
      console.error('Error sending quiz completion FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send content completion notification
   */
  async sendContentCompletionNotification(studentId, contentData, courseData) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getContentCompletionNotification(student, contentData, courseData);

      return await this.sendAndSaveNotification(
        studentId,
        'content_completion',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          contentId: contentData._id?.toString() || '',
          contentTitle: contentData.title || '',
          courseId: courseData._id?.toString() || '',
          courseTitle: courseData.title || '',
        }
      );
    } catch (error) {
      console.error('Error sending content completion FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send topic completion notification
   */
  async sendTopicCompletionNotification(studentId, topicData, courseData) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getTopicCompletionNotification(student, topicData, courseData);

      return await this.sendAndSaveNotification(
        studentId,
        'topic_completion',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          topicId: topicData._id?.toString() || '',
          topicTitle: topicData.title || '',
          courseId: courseData._id?.toString() || '',
          courseTitle: courseData.title || '',
        }
      );
    } catch (error) {
      console.error('Error sending topic completion FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send course completion notification
   */
  async sendCourseCompletionNotification(studentId, courseData) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getCourseCompletionNotification(student, courseData);

      return await this.sendAndSaveNotification(
        studentId,
        'course_completion',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          courseId: courseData._id?.toString() || '',
          courseTitle: courseData.title || '',
        },
        { priority: 'high' }
      );
    } catch (error) {
      console.error('Error sending course completion FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send purchase notification
   */
  async sendPurchaseNotification(studentId, purchaseData) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getPurchaseNotification(student, purchaseData);

      return await this.sendAndSaveNotification(
        studentId,
        'purchase',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          orderId: purchaseData._id?.toString() || '',
          orderNumber: purchaseData.orderNumber || '',
          total: (purchaseData.total || 0).toString(),
        },
        { priority: 'high' }
      );
    } catch (error) {
      console.error('Error sending purchase FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send welcome notification
   */
  async sendWelcomeNotification(studentId) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getWelcomeNotification(student);

      return await this.sendAndSaveNotification(
        studentId,
        'welcome',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          studentCode: student.studentCode || '',
          grade: student.grade || '',
        },
        { priority: 'high' }
      );
    } catch (error) {
      console.error('Error sending welcome FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send course enrollment notification
   */
  async sendCourseEnrollmentNotification(studentId, courseData) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getCourseEnrollmentNotification(student, courseData);

      return await this.sendAndSaveNotification(
        studentId,
        'course_enrollment',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          courseId: courseData._id?.toString() || '',
          courseTitle: courseData.title || '',
          subject: courseData.subject || '',
        }
      );
    } catch (error) {
      console.error('Error sending course enrollment FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bundle enrollment notification
   */
  async sendBundleEnrollmentNotification(studentId, bundleData) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getBundleEnrollmentNotification(student, bundleData);

      return await this.sendAndSaveNotification(
        studentId,
        'bundle_enrollment',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          bundleId: bundleData._id?.toString() || '',
          bundleTitle: bundleData.title || '',
          weeksCount: (bundleData.courses?.length || 0).toString(),
        }
      );
    } catch (error) {
      console.error('Error sending bundle enrollment FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send zoom meeting attendance notification
   */
  async sendZoomMeetingNotification(studentId, meetingData) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getZoomMeetingNotification(student, meetingData);

      return await this.sendAndSaveNotification(
        studentId,
        'zoom_meeting',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          meetingId: meetingData.meetingId?.toString() || '',
          meetingName: meetingData.meetingName || '',
          attendancePercentage: (meetingData.attendancePercentage || 0).toString(),
          timeSpent: (meetingData.timeSpent || 0).toString(),
          joinedLate: (meetingData.joinedLate || false).toString(),
        }
      );
    } catch (error) {
      console.error('Error sending zoom meeting FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send zoom meeting non-attendance notification
   */
  async sendZoomNonAttendanceNotification(studentId, meetingData) {
    try {
      const student = await User.findById(studentId);
      if (!student) return { success: false, error: 'Student not found' };

      const notification = this.getZoomNonAttendanceNotification(student, meetingData);

      return await this.sendAndSaveNotification(
        studentId,
        'zoom_non_attendance',
        notification.title,
        notification.body,
        notification.fullMessage,
        {
          meetingId: meetingData.meetingId?.toString() || '',
          meetingName: meetingData.meetingName || '',
          watchedRecording: (meetingData.watchedRecording || false).toString(),
        }
      );
    } catch (error) {
      console.error('Error sending zoom non-attendance FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send custom/general notification
   */
  async sendCustomNotification(studentId, title, body, fullMessage = null, data = {}, options = {}) {
    try {
      return await this.sendAndSaveNotification(
        studentId,
        options.type || 'general',
        title,
        body,
        fullMessage || body,
        data,
        options
      );
    } catch (error) {
      console.error('Error sending custom FCM:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk notification to multiple students
   */
  async sendBulkNotification(studentIds, title, body, fullMessage = null, data = {}, options = {}) {
    const results = [];
    
    for (const studentId of studentIds) {
      try {
        const result = await this.sendCustomNotification(
          studentId,
          title,
          body,
          fullMessage,
          data,
          options
        );
        results.push({ studentId, ...result });
      } catch (error) {
        results.push({ studentId, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      success: successCount > 0,
      successCount,
      failureCount,
      results,
    };
  }

  /**
   * Send notification to all students in a course
   */
  async sendToCourseStudents(courseId, title, body, fullMessage = null, data = {}, options = {}) {
    try {
      const course = await Course.findById(courseId).populate('enrolledStudents', '_id');
      if (!course) return { success: false, error: 'Course not found' };

      const studentIds = course.enrolledStudents.map(s => s._id);
      return await this.sendBulkNotification(studentIds, title, body, fullMessage, data, options);
    } catch (error) {
      console.error('Error sending to course students:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to all students in a bundle
   */
  async sendToBundleStudents(bundleId, title, body, fullMessage = null, data = {}, options = {}) {
    try {
      const bundle = await BundleCourse.findById(bundleId).populate('enrolledStudents', '_id');
      if (!bundle) return { success: false, error: 'Bundle not found' };

      const studentIds = bundle.enrolledStudents.map(s => s._id);
      return await this.sendBulkNotification(studentIds, title, body, fullMessage, data, options);
    } catch (error) {
      console.error('Error sending to bundle students:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up invalid FCM tokens from database
   */
  async cleanupInvalidTokens(invalidTokens) {
    if (!invalidTokens || invalidTokens.length === 0) return;

    try {
      const result = await User.updateMany(
        { parentFcmToken: { $in: invalidTokens } },
        { $set: { parentFcmToken: null } }
      );
      console.log(`🧹 Cleaned up ${result.modifiedCount} invalid FCM tokens`);
    } catch (error) {
      console.error('Error cleaning up invalid tokens:', error);
    }
  }
}

module.exports = new FirebaseNotificationService();
