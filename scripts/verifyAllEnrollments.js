// Check all students for purchase/enrollment mismatches
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.DATABASE_URL);
  const User = require('../models/User');
  const Course = require('../models/Course');
  
  const students = await User.find({ 'purchasedCourses.0': { $exists: true } }).lean();
  
  let issues = 0;
  
  for (const s of students) {
    const purchased = s.purchasedCourses.map(p => p.course.toString());
    const enrolled = s.enrolledCourses.map(e => e.course.toString());
    
    // Check for missing enrollments (purchased but not enrolled)
    const missing = purchased.filter(id => !enrolled.includes(id));
    
    // Check for extra enrollments (enrolled but not purchased)
    const extra = enrolled.filter(id => !purchased.includes(id));
    
    if (missing.length > 0 || extra.length > 0) {
      issues++;
      console.log('\n⚠️ [' + s.studentCode + '] ' + s.firstName + ' ' + s.lastName);
      
      if (missing.length > 0) {
        console.log('   ❌ Missing enrollments: ' + missing.length);
        for (const id of missing) {
          const c = await Course.findById(id).select('courseCode title order').lean();
          console.log('      - [' + c?.order + '] ' + c?.courseCode + ' ' + c?.title);
        }
      }
      
      if (extra.length > 0) {
        console.log('   ⚠️ Extra enrollments (not purchased): ' + extra.length);
        for (const id of extra) {
          const c = await Course.findById(id).select('courseCode title order').lean();
          console.log('      - [' + c?.order + '] ' + c?.courseCode + ' ' + c?.title);
        }
      }
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total students with purchases: ' + students.length);
  console.log('Students with issues: ' + issues);
  
  if (issues === 0) {
    console.log('\n✅ All students have matching purchased <-> enrolled courses!');
  }
  
  await mongoose.disconnect();
}

check();
