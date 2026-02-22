// Check ONLY for missing enrollments (purchased but NOT enrolled)
require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.DATABASE_URL);
  const User = require('../models/User');
  const Course = require('../models/Course');
  
  const students = await User.find({ 'purchasedCourses.0': { $exists: true } }).lean();
  
  let issues = 0;
  let totalMissing = 0;
  
  console.log('=== STUDENTS WITH MISSING ENROLLMENTS (Purchased but NOT enrolled) ===\n');
  
  for (const s of students) {
    const purchased = s.purchasedCourses.map(p => p.course.toString());
    const enrolled = s.enrolledCourses.map(e => e.course.toString());
    
    // Check for missing enrollments ONLY
    const missing = purchased.filter(id => !enrolled.includes(id));
    
    if (missing.length > 0) {
      issues++;
      totalMissing += missing.length;
      console.log(`\n❌ [${s.studentCode}] ${s.firstName} ${s.lastName}`);
      console.log(`   Missing ${missing.length} enrollments:`);
      
      for (const id of missing) {
        const c = await Course.findById(id).select('courseCode title order').lean();
        const purchase = s.purchasedCourses.find(p => p.course.toString() === id);
        console.log(`      - [${c?.order}] ${c?.courseCode} ${c?.title} (purchased: ${purchase?.purchasedAt?.toLocaleDateString()})`);
      }
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('Total students with purchases:', students.length);
  console.log('Students with MISSING enrollments:', issues);
  console.log('Total missing enrollments:', totalMissing);
  
  if (issues === 0) {
    console.log('\n✅ All purchased courses are enrolled!');
  }
  
  await mongoose.disconnect();
}

check();
