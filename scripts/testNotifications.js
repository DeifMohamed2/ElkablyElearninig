/**
 * Test Script: Send All Notification Types
 * 
 * This script sends all types of notifications to a specific parent phone number
 * to test the notification system thoroughly.
 * 
 * Usage: node scripts/testNotifications.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Test parent phone number
const TEST_PARENT_PHONE = '01156012078';

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✅ Connected to database');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

// Find student(s) with this parent phone
const findStudentByParentPhone = async (parentPhone) => {
  // Normalize phone - remove leading zero if present
  const normalizedPhone = parentPhone.startsWith('0') ? parentPhone.substring(1) : parentPhone;
  
  // Try different phone formats
  const phoneFormats = [
    parentPhone,
    normalizedPhone,
    `0${normalizedPhone}`,
  ];

  for (const phone of phoneFormats) {
    const student = await User.findOne({
      $or: [
        { parentNumber: phone },
        { parentNumber: { $regex: phone.replace(/^0+/, ''), $options: 'i' } },
      ],
      role: 'student',
    });
    
    if (student) {
      console.log(`✅ Found student: ${student.firstName} ${student.lastName} (${student.studentCode})`);
      return student;
    }
  }
  
  return null;
};

// Create test notification directly in database
const createTestNotification = async (student, type, title, body, fullMessage, data = {}) => {
  try {
    const notification = await Notification.createNotification({
      parentPhone: student.parentNumber,
      parentCountryCode: student.parentCountryCode || '+20',
      student: student._id,
      type,
      title,
      body,
      fullMessage,
      data,
      priority: 'normal',
      deliveryStatus: {
        fcm: { sent: false },
        sms: { sent: false },
        whatsapp: { sent: false },
      },
    });
    
    console.log(`  ✅ Created: ${type} - ${title.substring(0, 50)}...`);
    return notification;
  } catch (error) {
    console.error(`  ❌ Failed to create ${type}:`, error.message);
    return null;
  }
};

// Generate all notification types
const generateAllNotifications = async (student) => {
  const studentName = student.firstName || 'Student';
  const notifications = [];

  console.log('\n📱 Creating test notifications...\n');

  // 1. Welcome Notification
  notifications.push(await createTestNotification(
    student,
    'welcome',
    `🎉 Welcome to ELKABLY - ${studentName}`,
    `Welcome! Code: ${student.studentCode} | Grade: ${student.grade || 'N/A'}`,
    `🎉 Welcome to ELKABLY!\n\n🎓 Student: ${studentName}\n🆔 Code: ${student.studentCode}\n🏫 School: ${student.schoolName || 'N/A'}\n📚 Grade: ${student.grade || 'N/A'}\n\n🎯 Your learning journey begins now!\n\n🏆 ELKABLY TEAM`,
    { studentCode: student.studentCode, grade: student.grade || '' }
  ));

  // 2. Quiz Completion - High Score
  notifications.push(await createTestNotification(
    student,
    'quiz_completion',
    `🎉 Quiz Completed - ${studentName}`,
    `Math Chapter 1 Quiz: 9/10 (90%) - Outstanding performance!`,
    `📚 Quiz Completed!\n\n🎓 Student: ${studentName}\n📝 Quiz: Math Chapter 1 Quiz\n📊 Score: 9/10 (90%)\n\nOutstanding performance!\n\n🏆 ELKABLY TEAM`,
    { quizId: 'test-quiz-1', quizTitle: 'Math Chapter 1 Quiz', score: '9', totalQuestions: '10', percentage: '90' }
  ));

  // 3. Quiz Completion - Medium Score
  notifications.push(await createTestNotification(
    student,
    'quiz_completion',
    `👍 Quiz Completed - ${studentName}`,
    `English Grammar Quiz: 7/10 (70%) - Good job! Great progress!`,
    `📚 Quiz Completed!\n\n🎓 Student: ${studentName}\n📝 Quiz: English Grammar Quiz\n📊 Score: 7/10 (70%)\n\nGood job! Great progress!\n\n🏆 ELKABLY TEAM`,
    { quizId: 'test-quiz-2', quizTitle: 'English Grammar Quiz', score: '7', totalQuestions: '10', percentage: '70' }
  ));

  // 4. Quiz Completion - Low Score
  notifications.push(await createTestNotification(
    student,
    'quiz_completion',
    `💪 Quiz Completed - ${studentName}`,
    `Science Test: 4/10 (40%) - More practice needed.`,
    `📚 Quiz Completed!\n\n🎓 Student: ${studentName}\n📝 Quiz: Science Test\n📊 Score: 4/10 (40%)\n\nMore practice needed.\n\n🏆 ELKABLY TEAM`,
    { quizId: 'test-quiz-3', quizTitle: 'Science Test', score: '4', totalQuestions: '10', percentage: '40' }
  ));

  // 5. Content Completion
  notifications.push(await createTestNotification(
    student,
    'content_completion',
    `📖 Progress Update - ${studentName}`,
    `Completed "Introduction to Algebra" in Week 1`,
    `📖 Content Progress!\n\n🎓 Student: ${studentName}\n📚 Week: Week 1 - Mathematics\n📝 Content: Introduction to Algebra\n\n🎉 Your student is making great progress!\n\n🏆 ELKABLY TEAM`,
    { contentId: 'test-content-1', contentTitle: 'Introduction to Algebra', courseId: 'test-course-1', courseTitle: 'Week 1 - Mathematics' }
  ));

  // 6. Topic Completion
  notifications.push(await createTestNotification(
    student,
    'topic_completion',
    `📚 Topic Completed - ${studentName}`,
    `Completed "Linear Equations" in Week 2`,
    `📚 Topic Completed!\n\n🎓 Student: ${studentName}\n📖 Week: Week 2 - Advanced Math\n📝 Topic: Linear Equations\n\n🎉 Excellent work! Keep encouraging them!\n\n🏆 ELKABLY TEAM`,
    { topicId: 'test-topic-1', topicTitle: 'Linear Equations', courseId: 'test-course-2', courseTitle: 'Week 2 - Advanced Math' }
  ));

  // 7. Course Completion
  notifications.push(await createTestNotification(
    student,
    'course_completion',
    `🎓 Week Completed - ${studentName}`,
    `Successfully completed "Week 3 - Final Review"! Congratulations!`,
    `🎓 Week Completed!\n\n🎓 Student: ${studentName}\n📚 Week: Week 3 - Final Review\n\n🏆 Congratulations! Your student has successfully completed the week!\n\n🎉 Excellent work!\n\n🏆 ELKABLY TEAM`,
    { courseId: 'test-course-3', courseTitle: 'Week 3 - Final Review' }
  ));

  // 8. Purchase Notification
  notifications.push(await createTestNotification(
    student,
    'purchase',
    `🎉 Payment Confirmed - ${studentName}`,
    `Order #ORD-2026-001: 3 item(s) - EGP 1500`,
    `🎉 Payment Confirmed Successfully!\n\n🎓 Student: ${studentName}\n📦 Order: #ORD-2026-001\n📚 Items: 3 item(s)\n💰 Total: EGP 1500\n\n🏆 Thank you for your purchase!\n\n🏆 ELKABLY TEAM`,
    { orderId: 'test-order-1', orderNumber: 'ORD-2026-001', total: '1500' }
  ));

  // 9. Course Enrollment
  notifications.push(await createTestNotification(
    student,
    'course_enrollment',
    `📚 Enrollment Confirmed - ${studentName}`,
    `Enrolled in "Week 4 - Advanced Topics" - Mathematics`,
    `📚 Enrollment Confirmed!\n\n🎓 Student: ${studentName}\n📖 Week: Week 4 - Advanced Topics\n📚 Subject: Mathematics\n\n🎯 Ready to learn! Access materials now!\n\n🏆 ELKABLY TEAM`,
    { courseId: 'test-course-4', courseTitle: 'Week 4 - Advanced Topics', subject: 'Mathematics' }
  ));

  // 10. Bundle Enrollment
  notifications.push(await createTestNotification(
    student,
    'bundle_enrollment',
    `📦 Course Enrollment - ${studentName}`,
    `Enrolled in "Complete Math Course" (12 weeks) - Mathematics`,
    `📦 Course Enrollment Confirmed!\n\n🎓 Student: ${studentName}\n📚 Course: Complete Math Course\n📖 Weeks: 12 included\n📚 Subject: Mathematics\n\n🎯 Access all week materials now!\n\n🏆 ELKABLY TEAM`,
    { bundleId: 'test-bundle-1', bundleTitle: 'Complete Math Course', weeksCount: '12' }
  ));

  // 11. Zoom Meeting - Good Attendance
  notifications.push(await createTestNotification(
    student,
    'zoom_meeting',
    `📹 Live Session - ${studentName}`,
    `Math Live Class: 95% attendance (55 minutes)`,
    `📹 Live Session Update\n\n🎓 Student: ${studentName}\n📺 Session: Math Live Class\n📚 Course: Week 5 - Live Sessions\n📊 Attendance: 95%\n⏱️ Time: 55 minutes\n\n✅ Completed! Great job!\n\n🏆 ELKABLY TEAM`,
    { meetingId: 'test-meeting-1', meetingName: 'Math Live Class', attendancePercentage: '95', timeSpent: '55', joinedLate: 'false' }
  ));

  // 12. Zoom Meeting - Joined Late
  notifications.push(await createTestNotification(
    student,
    'zoom_meeting',
    `📹 Live Session - ${studentName}`,
    `English Speaking Practice: 60% attendance (30 minutes) ⚠️ Joined Late`,
    `📹 Live Session Update\n\n🎓 Student: ${studentName}\n📺 Session: English Speaking Practice\n📚 Course: Week 6 - English\n📊 Attendance: 60%\n⏱️ Time: 30 minutes\n⚠️ Joined Late\n\n✅ Completed! Great job!\n\n🏆 ELKABLY TEAM`,
    { meetingId: 'test-meeting-2', meetingName: 'English Speaking Practice', attendancePercentage: '60', timeSpent: '30', joinedLate: 'true' }
  ));

  // 13. Zoom Meeting - Low Attendance
  notifications.push(await createTestNotification(
    student,
    'zoom_meeting',
    `📹 Live Session - ${studentName}`,
    `Science Lab Session: 30% attendance (15 minutes)`,
    `📹 Live Session Update\n\n🎓 Student: ${studentName}\n📺 Session: Science Lab Session\n📚 Course: Week 7 - Science\n📊 Attendance: 30%\n⏱️ Time: 15 minutes\n\n⚠️ More attendance needed\n\n🏆 ELKABLY TEAM`,
    { meetingId: 'test-meeting-3', meetingName: 'Science Lab Session', attendancePercentage: '30', timeSpent: '15', joinedLate: 'false' }
  ));

  // 14. Zoom Non-Attendance - Watched Recording
  notifications.push(await createTestNotification(
    student,
    'zoom_non_attendance',
    `📹 Live Session Update - ${studentName}`,
    `History Discussion: Attended recording session (not live)`,
    `📹 Live Session Update\n\n🎓 Student: ${studentName}\n📺 Session: History Discussion\n📚 Course: Week 8 - History\n\nAttended recording session (not live)\n\n🏆 ELKABLY TEAM`,
    { meetingId: 'test-meeting-4', meetingName: 'History Discussion', watchedRecording: 'true' }
  ));

  // 15. Zoom Non-Attendance - Did Not Attend
  notifications.push(await createTestNotification(
    student,
    'zoom_non_attendance',
    `📹 Live Session Update - ${studentName}`,
    `Art Class: Did not attend live session`,
    `📹 Live Session Update\n\n🎓 Student: ${studentName}\n📺 Session: Art Class\n📚 Course: Week 9 - Art\n\nDid not attend live session\n\n🏆 ELKABLY TEAM`,
    { meetingId: 'test-meeting-5', meetingName: 'Art Class', watchedRecording: 'false' }
  ));

  // 16. General Notification
  notifications.push(await createTestNotification(
    student,
    'general',
    `📢 Important Update - ${studentName}`,
    `New study materials have been added to your courses!`,
    `📢 Important Update\n\n🎓 Student: ${studentName}\n\nNew study materials have been added to your courses. Check them out now!\n\n🏆 ELKABLY TEAM`,
    { category: 'update' }
  ));

  // 17. Announcement
  notifications.push(await createTestNotification(
    student,
    'announcement',
    `📣 System Announcement`,
    `Platform maintenance scheduled for tomorrow at 2 AM`,
    `📣 System Announcement\n\nDear Parents,\n\nPlatform maintenance is scheduled for tomorrow at 2 AM Egyptian time. The system will be unavailable for approximately 30 minutes.\n\nThank you for your understanding.\n\n🏆 ELKABLY TEAM`,
    { maintenanceDate: '2026-01-21', duration: '30 minutes' }
  ));

  return notifications.filter(n => n !== null);
};

// Main function
const main = async () => {
  console.log('🚀 Starting Notification Test Script');
  console.log('=====================================\n');
  console.log(`📱 Target Parent Phone: ${TEST_PARENT_PHONE}\n`);

  await connectDB();

  // Find student with this parent phone
  const student = await findStudentByParentPhone(TEST_PARENT_PHONE);

  if (!student) {
    console.log('\n❌ No student found with parent phone:', TEST_PARENT_PHONE);
    console.log('\n📝 Creating a temporary test record...');
    
    // Show available students for reference
    const sampleStudents = await User.find({ role: 'student' })
      .select('firstName lastName parentNumber studentCode')
      .limit(5);
    
    if (sampleStudents.length > 0) {
      console.log('\n📋 Available students in database:');
      sampleStudents.forEach(s => {
        console.log(`   - ${s.firstName} ${s.lastName} | Parent: ${s.parentNumber} | Code: ${s.studentCode}`);
      });
      console.log('\n💡 Update TEST_PARENT_PHONE in this script to match an existing parent phone.');
    }
    
    await mongoose.disconnect();
    process.exit(1);
  }

  // Generate all notifications
  const notifications = await generateAllNotifications(student);

  console.log('\n=====================================');
  console.log(`✅ Created ${notifications.length} test notifications`);
  console.log('=====================================\n');

  // Show summary
  const summary = {};
  notifications.forEach(n => {
    summary[n.type] = (summary[n.type] || 0) + 1;
  });

  console.log('📊 Summary by type:');
  Object.entries(summary).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  // Get total unread count
  const unreadCount = await Notification.getUnreadCount(student.parentNumber);
  console.log(`\n📬 Total unread notifications: ${unreadCount}`);

  console.log('\n✅ Test completed successfully!');
  console.log('💡 Login to parent app with:');
  console.log(`   Phone: ${TEST_PARENT_PHONE}`);
  console.log(`   Student Code: ${student.studentCode}`);

  await mongoose.disconnect();
  console.log('\n👋 Database disconnected');
};

// Run the script
main().catch(error => {
  console.error('❌ Script error:', error);
  mongoose.disconnect();
  process.exit(1);
});
