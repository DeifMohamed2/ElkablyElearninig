// Remove unauthorized OLD course enrollments (BNDBAS124)
// Only removes if student has 0% progress AND is not admin enrolled
require('dotenv').config();
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');

async function removeUnauthorizedOldAccess() {
  await mongoose.connect(process.env.DATABASE_URL);
  const User = require('../models/User');
  const Course = require('../models/Course');
  const AdminLog = require('../models/AdminLog');
  
  console.log(DRY_RUN ? '=== DRY RUN MODE ===' : '=== EXECUTING REMOVAL ===');
  console.log('');
  
  // Get OLD courses (title ends with OLD)
  const oldCourses = await Course.find({ 
    title: { $regex: /OLD$/i }
  }).lean();
  
  const oldCourseIds = oldCourses.map(c => c._id.toString());
  const courseMap = {};
  for (const c of oldCourses) {
    courseMap[c._id.toString()] = c;
  }
  
  console.log('OLD Courses to check:', oldCourses.length);
  for (const c of oldCourses) {
    console.log(`  - [${c.order}] ${c.courseCode} ${c.title}`);
  }
  console.log('');
  
  // Get admin enrollment logs to identify admin-enrolled students
  const adminEnrollmentLogs = await AdminLog.find({
    action: { $regex: /enroll/i }
  }).lean();
  
  const adminEnrolled = new Set();
  for (const log of adminEnrollmentLogs) {
    if (log.targetId) adminEnrolled.add(log.targetId.toString());
    if (log.details?.studentId) adminEnrolled.add(log.details.studentId.toString());
  }
  
  console.log('Admin enrolled students found:', adminEnrolled.size);
  console.log('');
  
  // Find all students enrolled in OLD courses
  const students = await User.find({
    'enrolledCourses.course': { $in: oldCourseIds }
  });
  
  let totalRemoved = 0;
  let studentsFixed = 0;
  let skippedWithProgress = 0;
  let skippedAdminEnrolled = 0;
  
  console.log('=== PROCESSING STUDENTS ===\n');
  
  for (const student of students) {
    const purchasedIds = student.purchasedCourses.map(p => p.course.toString());
    const isAdminEnrolled = adminEnrolled.has(student._id.toString());
    
    // Get unpurchased OLD enrollments
    const oldEnrollments = student.enrolledCourses.filter(e => 
      oldCourseIds.includes(e.course.toString()) && !purchasedIds.includes(e.course.toString())
    );
    
    if (oldEnrollments.length === 0) continue;
    
    // Check if has any progress
    const hasProgress = oldEnrollments.some(e => e.progress > 0);
    
    // SKIP if admin enrolled OR has progress
    if (isAdminEnrolled) {
      skippedAdminEnrolled++;
      console.log(`⏭️ [${student.studentCode}] ${student.firstName} ${student.lastName} - SKIP (admin enrolled)`);
      continue;
    }
    
    if (hasProgress) {
      skippedWithProgress++;
      const maxProgress = Math.max(...oldEnrollments.map(e => e.progress));
      console.log(`⏭️ [${student.studentCode}] ${student.firstName} ${student.lastName} - SKIP (has ${maxProgress}% progress)`);
      continue;
    }
    
    // REMOVE - no progress and not admin enrolled
    studentsFixed++;
    console.log(`📌 [${student.studentCode}] ${student.firstName} ${student.lastName}`);
    
    // Find indexes to remove (reverse order to avoid index shifting)
    const toRemove = [];
    for (let i = student.enrolledCourses.length - 1; i >= 0; i--) {
      const enrollment = student.enrolledCourses[i];
      const courseId = enrollment.course.toString();
      
      if (oldCourseIds.includes(courseId) && !purchasedIds.includes(courseId)) {
        const course = courseMap[courseId];
        toRemove.push({
          index: i,
          courseCode: course?.courseCode,
          title: course?.title,
          progress: enrollment.progress
        });
      }
    }
    
    for (const item of toRemove) {
      console.log(`   🗑️ Removing: ${item.courseCode} (${item.progress}%)`);
      
      if (!DRY_RUN) {
        student.enrolledCourses.splice(item.index, 1);
        totalRemoved++;
      } else {
        totalRemoved++;
      }
    }
    
    if (!DRY_RUN) {
      await student.save();
      console.log('   ✅ Saved');
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Students with 0% progress REMOVED:', studentsFixed);
  console.log('Enrollments removed:', totalRemoved);
  console.log('Skipped (has progress):', skippedWithProgress);
  console.log('Skipped (admin enrolled):', skippedAdminEnrolled);
  
  if (DRY_RUN) {
    console.log('\n⚠️ DRY RUN - No changes made');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Unauthorized OLD access removed (0% progress only)!');
  }
  
  await mongoose.disconnect();
}

removeUnauthorizedOldAccess();
