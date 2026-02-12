/**
 * Send Test Notifications Script
 * 
 * Tests all notification types in the ELKABLY system via Firebase FCM.
 * Finds a student by parent phone number and sends sample notifications
 * for each notification type (welcome, quiz, content, topic, course, purchase, etc.)
 * 
 * Usage:
 *   node scripts/sendTestNotifications.js
 *   node scripts/sendTestNotifications.js --phone=01003202768
 *   node scripts/sendTestNotifications.js --studentCode=123456
 *   node scripts/sendTestNotifications.js --type=welcome          (send only one type)
 *   node scripts/sendTestNotifications.js --type=all              (send all types, default)
 */

const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const Notification = require('../models/Notification');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const DB_URI = process.env.DATABASE_URL;

// Parse CLI arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value || true;
  return acc;
}, {});

const TARGET_PHONE = args.phone || '01003202768';
const TARGET_CODE = args.studentCode || null;
const NOTIFICATION_TYPE = args.type || 'all';
const DELAY_MS = 2000; // delay between notifications

// ─── HELPERS ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function logSection(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

function logResult(result) {
  if (result.success) {
    console.log(`  ✅ Notification saved (ID: ${result.notificationId})`);
    console.log(`  📱 FCM sent: ${result.fcmSent ? 'Yes' : 'No (no FCM token)'}`);
    if (result.messageId) console.log(`  🆔 FCM Message ID: ${result.messageId}`);
  } else {
    console.log(`  ❌ Failed: ${result.error}`);
  }
}

// ─── NOTIFICATION SENDERS ──────────────────────────────────────────────────────
const notificationTests = {
  /**
   * 1. Welcome Notification
   */
  welcome: async (firebase, student) => {
    logSection('1. WELCOME Notification');
    console.log(`  Sending welcome notification for ${student.firstName}...`);
    const result = await firebase.sendWelcomeNotification(student._id);
    logResult(result);
    return result;
  },

  /**
   * 2. Quiz Completion Notification
   */
  quiz_completion: async (firebase, student) => {
    logSection('2. QUIZ COMPLETION Notification');
    const mockQuiz = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Unit 5 - Grammar Test',
    };
    const score = 8;
    const totalQuestions = 10;
    console.log(`  Sending quiz completion: ${score}/${totalQuestions} on "${mockQuiz.title}"...`);
    const result = await firebase.sendQuizCompletionNotification(student._id, mockQuiz, score, totalQuestions);
    logResult(result);
    return result;
  },

  /**
   * 3. Content Completion Notification
   */
  content_completion: async (firebase, student) => {
    logSection('3. CONTENT COMPLETION Notification');
    const mockContent = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Lesson 3 - Past Tense Video',
    };
    const mockCourse = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Week 7 - Grammar Basics',
    };
    console.log(`  Sending content completion: "${mockContent.title}" in "${mockCourse.title}"...`);
    const result = await firebase.sendContentCompletionNotification(student._id, mockContent, mockCourse);
    logResult(result);
    return result;
  },

  /**
   * 4. Topic Completion Notification
   */
  topic_completion: async (firebase, student) => {
    logSection('4. TOPIC COMPLETION Notification');
    const mockTopic = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Present Perfect Tense',
    };
    const mockCourse = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Week 8 - Advanced Grammar',
    };
    console.log(`  Sending topic completion: "${mockTopic.title}" in "${mockCourse.title}"...`);
    const result = await firebase.sendTopicCompletionNotification(student._id, mockTopic, mockCourse);
    logResult(result);
    return result;
  },

  /**
   * 5. Course/Week Completion Notification
   */
  course_completion: async (firebase, student) => {
    logSection('5. COURSE/WEEK COMPLETION Notification');
    const mockCourse = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Week 10 - Final Review',
    };
    console.log(`  Sending course completion: "${mockCourse.title}"...`);
    const result = await firebase.sendCourseCompletionNotification(student._id, mockCourse);
    logResult(result);
    return result;
  },

  /**
   * 6. Purchase Notification
   */
  purchase: async (firebase, student) => {
    logSection('6. PURCHASE Notification');
    const mockPurchase = {
      _id: new mongoose.Types.ObjectId(),
      orderNumber: 'TEST-' + Date.now(),
      total: 250,
      items: [{ title: 'Week 5' }, { title: 'Week 6' }],
      bookOrders: [],
    };
    console.log(`  Sending purchase confirmation: Order #${mockPurchase.orderNumber}, EGP ${mockPurchase.total}...`);
    const result = await firebase.sendPurchaseNotification(student._id, mockPurchase);
    logResult(result);
    return result;
  },

  /**
   * 7. Course Enrollment Notification
   */
  course_enrollment: async (firebase, student) => {
    logSection('7. COURSE ENROLLMENT Notification');
    const mockCourse = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Week 12 - Speaking Skills',
      subject: 'English',
    };
    console.log(`  Sending course enrollment: "${mockCourse.title}"...`);
    const result = await firebase.sendCourseEnrollmentNotification(student._id, mockCourse);
    logResult(result);
    return result;
  },

  /**
   * 8. Bundle Enrollment Notification
   */
  bundle_enrollment: async (firebase, student) => {
    logSection('8. BUNDLE ENROLLMENT Notification');
    const mockBundle = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Full Term Bundle - Year 10',
      courses: [{ _id: '1' }, { _id: '2' }, { _id: '3' }, { _id: '4' }],
    };
    console.log(`  Sending bundle enrollment: "${mockBundle.title}" (${mockBundle.courses.length} weeks)...`);
    const result = await firebase.sendBundleEnrollmentNotification(student._id, mockBundle);
    logResult(result);
    return result;
  },

  /**
   * 9. Zoom Meeting Attendance Notification
   */
  zoom_meeting: async (firebase, student) => {
    logSection('9. ZOOM MEETING ATTENDANCE Notification');
    const mockMeeting = {
      meetingId: '123456789',
      meetingName: 'Live Class - Week 5 Grammar',
      attendancePercentage: 85,
      timeSpent: 45,
      joinedLate: false,
    };
    console.log(`  Sending zoom attendance: "${mockMeeting.meetingName}" (${mockMeeting.attendancePercentage}%)...`);
    const result = await firebase.sendZoomMeetingNotification(student._id, mockMeeting);
    logResult(result);
    return result;
  },

  /**
   * 10. Zoom Non-Attendance Notification
   */
  zoom_non_attendance: async (firebase, student) => {
    logSection('10. ZOOM NON-ATTENDANCE Notification');
    const mockMeeting = {
      meetingId: '987654321',
      meetingName: 'Live Class - Week 6 Vocabulary',
      watchedRecording: false,
    };
    console.log(`  Sending zoom non-attendance: "${mockMeeting.meetingName}"...`);
    const result = await firebase.sendZoomNonAttendanceNotification(student._id, mockMeeting);
    logResult(result);
    return result;
  },

  /**
   * 11. Custom/General Notification
   */
  general: async (firebase, student) => {
    logSection('11. CUSTOM/GENERAL Notification');
    const title = '📢 Test Notification';
    const body = 'This is a test notification from the ELKABLY system.';
    const fullMessage = `📢 Test Notification\n\nThis is a test notification sent from the sendTestNotifications script.\n\n🎓 Student: ${student.firstName} ${student.lastName}\n🆔 Code: ${student.studentCode}\n\n🏆 ELKABLY TEAM`;
    console.log(`  Sending custom notification: "${title}"...`);
    const result = await firebase.sendCustomNotification(student._id, title, body, fullMessage);
    logResult(result);
    return result;
  },

  /**
   * 12. Announcement Notification
   */
  announcement: async (firebase, student) => {
    logSection('12. ANNOUNCEMENT Notification');
    const title = '📣 Important Announcement';
    const body = 'New study materials have been uploaded for your grade!';
    const fullMessage = `📣 Important Announcement\n\nNew study materials have been uploaded for your grade!\n\nPlease check the app for the latest content.\n\n🏆 ELKABLY TEAM`;
    console.log(`  Sending announcement: "${title}"...`);
    const result = await firebase.sendCustomNotification(
      student._id, title, body, fullMessage, {},
      { type: 'announcement', priority: 'high' }
    );
    logResult(result);
    return result;
  },
};

// ─── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  try {
    // 1. Connect to database
    if (!DB_URI) {
      console.error('❌ DATABASE_URL not found in .env file!');
      process.exit(1);
    }

    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB.');

    // 2. Initialize Firebase
    console.log('🔥 Initializing Firebase...');
    const firebaseService = require('../utils/firebaseNotificationService');

    if (!firebaseService.isReady()) {
      console.error('❌ Firebase is not initialized! Check serviceAccount.json or env variables.');
      process.exit(1);
    }
    console.log('✅ Firebase is ready.');

    // 3. Find student
    let student;
    if (TARGET_CODE) {
      console.log(`🔍 Searching for student with code: ${TARGET_CODE}...`);
      student = await User.findOne({ studentCode: TARGET_CODE });
    } else {
      console.log(`🔍 Searching for student with parent phone: ${TARGET_PHONE}...`);
      const phoneRegex = new RegExp(TARGET_PHONE.replace(/^0+/, '').slice(-9));
      student = await User.findOne({ parentNumber: { $regex: phoneRegex } });
    }

    if (!student) {
      console.error('❌ Student not found! Try a different --phone or --studentCode.');
      process.exit(1);
    }

    console.log(`✅ Found student:`);
    console.log(`   Name: ${student.firstName} ${student.lastName}`);
    console.log(`   Code: ${student.studentCode}`);
    console.log(`   Grade: ${student.grade}`);
    console.log(`   Parent Phone: ${student.parentCountryCode}${student.parentNumber}`);
    console.log(`   FCM Token: ${student.parentFcmToken ? 'Present ✅' : 'Missing ❌'}`);

    if (!student.parentFcmToken) {
      console.warn('\n⚠️  No FCM token found for this student\'s parent.');
      console.warn('   Notifications will be saved to DB but NOT pushed to the device.');
      console.warn('   The parent needs to log in to the mobile app to register their FCM token.\n');
    }

    // 4. Send notifications
    const results = { success: 0, failed: 0, tests: [] };

    if (NOTIFICATION_TYPE === 'all') {
      // Send all notification types
      const testKeys = Object.keys(notificationTests);
      console.log(`\n📬 Sending ${testKeys.length} notification types...\n`);

      for (const key of testKeys) {
        try {
          const result = await notificationTests[key](firebaseService, student);
          if (result.success) results.success++;
          else results.failed++;
          results.tests.push({ type: key, ...result });
        } catch (err) {
          console.log(`  ❌ Error: ${err.message}`);
          results.failed++;
          results.tests.push({ type: key, success: false, error: err.message });
        }
        await sleep(DELAY_MS);
      }
    } else {
      // Send single notification type
      const testFn = notificationTests[NOTIFICATION_TYPE];
      if (!testFn) {
        console.error(`❌ Unknown notification type: "${NOTIFICATION_TYPE}"`);
        console.log(`   Available types: ${Object.keys(notificationTests).join(', ')}`);
        process.exit(1);
      }

      try {
        const result = await testFn(firebaseService, student);
        if (result.success) results.success++;
        else results.failed++;
        results.tests.push({ type: NOTIFICATION_TYPE, ...result });
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
        results.failed++;
        results.tests.push({ type: NOTIFICATION_TYPE, success: false, error: err.message });
      }
    }

    // 5. Summary
    logSection('SUMMARY');
    console.log(`  Total:   ${results.success + results.failed}`);
    console.log(`  ✅ Success: ${results.success}`);
    console.log(`  ❌ Failed:  ${results.failed}`);

    // Count saved notifications
    const recentNotifications = await Notification.countDocuments({
      student: student._id,
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // last 5 minutes
    });
    console.log(`  📦 Notifications in DB (last 5 min): ${recentNotifications}`);

    console.log('\n✅ All done!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

run();
