// Check for course ID conflicts (enrolled in wrong course with same title) - OPTIMIZED
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.DATABASE_URL);
  const User = require('../models/User');
  const Course = require('../models/Course');
  
  console.log('Loading data...');
  const students = await User.find({ 'purchasedCourses.0': { $exists: true } }).lean();
  const allCourses = await Course.find({}).lean();
  
  // Build course ID map
  const courseById = {};
  for (const c of allCourses) {
    courseById[c._id.toString()] = c;
  }
  
  // Build title to courses map (normalize without OLD suffix)
  const titleMap = {};
  for (const c of allCourses) {
    const baseTitle = c.title.replace(' OLD', '').trim();
    if (!titleMap[baseTitle]) {
      titleMap[baseTitle] = [];
    }
    titleMap[baseTitle].push(c._id.toString());
  }
  
  // Check for conflicts
  let conflicts = 0;
  const conflictStudents = [];
  
  console.log('Checking', students.length, 'students...\n');
  
  for (const s of students) {
    const studentConflicts = [];
    const enrolled = new Set(s.enrolledCourses.map(e => e.course.toString()));
    
    for (const p of s.purchasedCourses) {
      const purchasedId = p.course.toString();
      const purchasedCourse = courseById[purchasedId];
      if (!purchasedCourse) continue;
      
      // Check if enrolled in this exact course
      if (!enrolled.has(purchasedId)) {
        // Not enrolled in purchased course - check if enrolled in a different course with similar title
        const baseTitle = purchasedCourse.title.replace(' OLD', '').trim();
        const similarIds = titleMap[baseTitle] || [];
        
        for (const similarId of similarIds) {
          if (similarId === purchasedId) continue;
          
          if (enrolled.has(similarId)) {
            const enrolledCourse = courseById[similarId];
            const enrollment = s.enrolledCourses.find(e => e.course.toString() === similarId);
            studentConflicts.push({
              purchased: purchasedCourse,
              enrolledIn: enrolledCourse,
              progress: enrollment?.progress || 0
            });
          }
        }
      }
    }
    
    if (studentConflicts.length > 0) {
      conflicts++;
      conflictStudents.push({ student: s, conflicts: studentConflicts });
    }
  }
  
  console.log('=== STUDENTS WITH COURSE ID CONFLICTS ===\n');
  for (const { student, conflicts: studentConflicts } of conflictStudents) {
    console.log(`⚠️ [${student.studentCode}] ${student.firstName} ${student.lastName}`);
    for (const c of studentConflicts) {
      console.log(`   PURCHASED: [${c.purchased.order}] ${c.purchased.courseCode} "${c.purchased.title}"`);
      console.log(`   ENROLLED:  [${c.enrolledIn.order}] ${c.enrolledIn.courseCode} "${c.enrolledIn.title}" (${c.progress}%)`);
    }
    console.log('');
  }
  
  console.log('=== SUMMARY ===');
  console.log('Total students with purchases:', students.length);
  console.log('Students with course ID conflicts:', conflicts);
  
  if (conflicts === 0) {
    console.log('\n✅ No course ID conflicts found!');
  } else {
    console.log('\n❌ These students are enrolled in WRONG courses (same title, different ID)');
  }
  
  await mongoose.disconnect();
}

check();
