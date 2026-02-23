// Check OLD access details - admin enrolled vs unauthorized
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.DATABASE_URL);
  const User = require('../models/User');
  const Course = require('../models/Course');
  const AdminLog = require('../models/AdminLog');
  
  // The 9 students from course ID conflict issue
  const conflictStudents = ['745479', '763670', '519052', '698036', '704253', '262886', '480626', '468284', '449905'];
  
  // Get OLD courses
  const oldCourses = await Course.find({ 
    title: { $regex: /OLD$/i }
  }).lean();
  const oldCourseIds = oldCourses.map(c => c._id.toString());
  
  // Find all students enrolled in OLD courses
  const students = await User.find({
    'enrolledCourses.course': { $in: oldCourseIds }
  }).lean();
  
  console.log('=== CHECKING OLD ACCESS DETAILS ===\n');
  
  // Check admin logs for manual enrollment
  const adminEnrollmentLogs = await AdminLog.find({
    action: { $regex: /enroll/i }
  }).lean();
  
  console.log('Admin enrollment logs found:', adminEnrollmentLogs.length);
  
  // Build map of admin-enrolled students
  const adminEnrolled = new Set();
  for (const log of adminEnrollmentLogs) {
    if (log.targetId) {
      adminEnrolled.add(log.targetId.toString());
    }
    // Also check details
    if (log.details?.studentId) {
      adminEnrolled.add(log.details.studentId.toString());
    }
  }
  
  console.log('Students with admin enrollment history:', adminEnrolled.size);
  console.log('');
  
  // Categorize students
  const unauthorized = [];
  const adminEnrolledStudents = [];
  const conflictOverlap = [];
  
  for (const student of students) {
    const purchasedIds = student.purchasedCourses.map(p => p.course.toString());
    
    // Check OLD enrollments
    const oldEnrollments = student.enrolledCourses.filter(e => 
      oldCourseIds.includes(e.course.toString()) && !purchasedIds.includes(e.course.toString())
    );
    
    if (oldEnrollments.length > 0) {
      const isAdminEnrolled = adminEnrolled.has(student._id.toString());
      const isConflictStudent = conflictStudents.includes(student.studentCode);
      
      const info = {
        studentCode: student.studentCode,
        name: `${student.firstName} ${student.lastName}`,
        id: student._id.toString(),
        oldEnrollments: oldEnrollments.length,
        isAdminEnrolled,
        isConflictStudent
      };
      
      if (isAdminEnrolled) {
        adminEnrolledStudents.push(info);
      } else {
        unauthorized.push(info);
      }
      
      if (isConflictStudent) {
        conflictOverlap.push(info);
      }
    }
  }
  
  console.log('=== THE 9 CONFLICT STUDENTS CHECK ===');
  console.log('Checking if they are in the 71 unauthorized OLD access list:\n');
  
  for (const code of conflictStudents) {
    const found = [...unauthorized, ...adminEnrolledStudents].find(s => s.studentCode === code);
    if (found) {
      console.log(`✅ [${code}] ${found.name} - FOUND in OLD access list (${found.oldEnrollments} OLD courses)`);
    } else {
      console.log(`❌ [${code}] - NOT in OLD access list`);
    }
  }
  
  console.log('\n=== OVERLAP SUMMARY ===');
  console.log(`Of the 9 conflict students, ${conflictOverlap.length} have unauthorized OLD access`);
  
  console.log('\n=== ADMIN ENROLLED STUDENTS (SHOULD KEEP) ===');
  console.log(`Count: ${adminEnrolledStudents.length}`);
  for (const s of adminEnrolledStudents.slice(0, 10)) {
    console.log(`  [${s.studentCode}] ${s.name} - ${s.oldEnrollments} OLD courses`);
  }
  if (adminEnrolledStudents.length > 10) {
    console.log(`  ... and ${adminEnrolledStudents.length - 10} more`);
  }
  
  console.log('\n=== UNAUTHORIZED STUDENTS (TO REMOVE) ===');
  console.log(`Count: ${unauthorized.length}`);
  
  console.log('\n=== FINAL SUMMARY ===');
  console.log('Total with OLD access:', students.length);
  console.log('Admin enrolled (KEEP):', adminEnrolledStudents.length);
  console.log('Unauthorized (REMOVE):', unauthorized.length);
  console.log('Conflict students overlap:', conflictOverlap.length, 'of 9');
  
  await mongoose.disconnect();
}

check();
