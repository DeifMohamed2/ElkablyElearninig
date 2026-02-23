// Find students with unauthorized access to BNDBAS124 (Basics OLD bundle)
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.DATABASE_URL);
  const User = require('../models/User');
  const Course = require('../models/Course');
  const BundleCourse = require('../models/BundleCourse');
  
  console.log('=== CHECKING BUNDLE BNDBAS124 ===\n');
  
  // Find the bundle
  const bundle = await BundleCourse.findOne({ bundleCode: 'BNDBAS124' }).lean();
  if (!bundle) {
    console.log('❌ Bundle BNDBAS124 not found!');
    await mongoose.disconnect();
    return;
  }
  
  console.log('Bundle:', bundle.title);
  console.log('Bundle ID:', bundle._id);
  
  // Get courses in this bundle
  const bundleCourseIds = bundle.courses.map(c => c.toString());
  console.log('\nCourses in bundle:');
  
  const coursesInBundle = await Course.find({ _id: { $in: bundleCourseIds } }).lean();
  for (const c of coursesInBundle) {
    console.log(`  - [${c.order}] ${c.courseCode} ${c.title}`);
  }
  
  // Also check for OLD courses (order 10-18)
  const oldCourses = await Course.find({ 
    title: { $regex: /OLD$/i }
  }).lean();
  
  console.log('\n=== OLD Courses (by title) ===');
  for (const c of oldCourses) {
    console.log(`  - [${c.order}] ${c.courseCode} ${c.title}`);
  }
  
  const oldCourseIds = oldCourses.map(c => c._id.toString());
  
  // Find all students enrolled in OLD courses
  console.log('\n=== STUDENTS WITH OLD COURSE ENROLLMENTS ===\n');
  
  const students = await User.find({
    'enrolledCourses.course': { $in: oldCourseIds }
  }).lean();
  
  let unauthorizedCount = 0;
  const unauthorizedStudents = [];
  
  for (const s of students) {
    const purchasedIds = s.purchasedCourses.map(p => p.course.toString());
    const oldEnrollments = s.enrolledCourses.filter(e => oldCourseIds.includes(e.course.toString()));
    
    // Check if any OLD enrollment is not purchased
    const unauthorized = [];
    for (const e of oldEnrollments) {
      if (!purchasedIds.includes(e.course.toString())) {
        const course = oldCourses.find(c => c._id.toString() === e.course.toString());
        unauthorized.push({
          course,
          progress: e.progress
        });
      }
    }
    
    if (unauthorized.length > 0) {
      unauthorizedCount++;
      unauthorizedStudents.push({
        studentCode: s.studentCode,
        name: `${s.firstName} ${s.lastName}`,
        id: s._id,
        unauthorized
      });
      
      console.log(`⚠️ [${s.studentCode}] ${s.firstName} ${s.lastName}`);
      for (const u of unauthorized) {
        console.log(`   - [${u.course?.order}] ${u.course?.courseCode} ${u.course?.title} (${u.progress}%)`);
      }
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total students with OLD course enrollments:', students.length);
  console.log('Students with UNAUTHORIZED OLD access:', unauthorizedCount);
  
  // Output student codes for easy copy
  if (unauthorizedStudents.length > 0) {
    console.log('\n=== STUDENT CODES (for reference) ===');
    console.log(unauthorizedStudents.map(s => s.studentCode).join(', '));
  }
  
  await mongoose.disconnect();
}

check();
