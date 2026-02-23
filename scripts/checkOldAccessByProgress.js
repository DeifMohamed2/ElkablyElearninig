// Check OLD access - categorize by progress
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.DATABASE_URL);
  const User = require('../models/User');
  const Course = require('../models/Course');
  const AdminLog = require('../models/AdminLog');
  
  // Get OLD courses
  const oldCourses = await Course.find({ 
    title: { $regex: /OLD$/i }
  }).lean();
  const oldCourseIds = oldCourses.map(c => c._id.toString());
  const courseMap = {};
  for (const c of oldCourses) {
    courseMap[c._id.toString()] = c;
  }
  
  // Find all students enrolled in OLD courses
  const students = await User.find({
    'enrolledCourses.course': { $in: oldCourseIds }
  }).lean();
  
  // Get admin enrollment logs
  const adminEnrollmentLogs = await AdminLog.find({
    action: { $regex: /enroll/i }
  }).lean();
  
  const adminEnrolled = new Set();
  for (const log of adminEnrollmentLogs) {
    if (log.targetId) adminEnrolled.add(log.targetId.toString());
    if (log.details?.studentId) adminEnrolled.add(log.details.studentId.toString());
  }
  
  console.log('=== CATEGORIZING OLD ACCESS ===\n');
  
  const keepStudents = []; // Has progress OR admin enrolled
  const removeStudents = []; // No progress AND not admin enrolled
  
  for (const student of students) {
    const purchasedIds = student.purchasedCourses.map(p => p.course.toString());
    
    // Get unpurchased OLD enrollments
    const oldEnrollments = student.enrolledCourses.filter(e => 
      oldCourseIds.includes(e.course.toString()) && !purchasedIds.includes(e.course.toString())
    );
    
    if (oldEnrollments.length === 0) continue;
    
    const isAdminEnrolled = adminEnrolled.has(student._id.toString());
    const hasProgress = oldEnrollments.some(e => e.progress > 0);
    const maxProgress = Math.max(...oldEnrollments.map(e => e.progress));
    const totalProgress = oldEnrollments.reduce((sum, e) => sum + e.progress, 0);
    
    const info = {
      studentCode: student.studentCode,
      name: `${student.firstName} ${student.lastName}`,
      id: student._id.toString(),
      oldEnrollments: oldEnrollments.length,
      hasProgress,
      maxProgress,
      totalProgress,
      isAdminEnrolled,
      enrollments: oldEnrollments.map(e => ({
        code: courseMap[e.course.toString()]?.courseCode,
        progress: e.progress
      }))
    };
    
    if (hasProgress || isAdminEnrolled) {
      keepStudents.push(info);
    } else {
      removeStudents.push(info);
    }
  }
  
  console.log('=== STUDENTS TO KEEP (has progress or admin enrolled) ===');
  console.log(`Count: ${keepStudents.length}\n`);
  
  for (const s of keepStudents) {
    const reason = s.isAdminEnrolled ? '(ADMIN)' : `(max ${s.maxProgress}% progress)`;
    console.log(`✅ [${s.studentCode}] ${s.name} ${reason}`);
    for (const e of s.enrollments) {
      if (e.progress > 0) {
        console.log(`     - ${e.code}: ${e.progress}%`);
      }
    }
  }
  
  console.log('\n=== STUDENTS TO REMOVE (0% progress, not admin enrolled) ===');
  console.log(`Count: ${removeStudents.length}\n`);
  
  for (const s of removeStudents) {
    console.log(`🗑️ [${s.studentCode}] ${s.name} - ${s.oldEnrollments} OLD courses (all 0%)`);
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total with unpurchased OLD access:', keepStudents.length + removeStudents.length);
  console.log('KEEP (has progress or admin):', keepStudents.length);
  console.log('REMOVE (0% progress):', removeStudents.length);
  
  // Output student codes for removal
  if (removeStudents.length > 0) {
    console.log('\n=== STUDENT CODES TO REMOVE ===');
    console.log(removeStudents.map(s => s.studentCode).join(', '));
  }
  
  await mongoose.disconnect();
}

check();
