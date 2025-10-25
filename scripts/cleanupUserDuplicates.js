const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/elkablyelearning', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Clean up duplicates for a specific user
const cleanupUserDuplicates = async (userId) => {
  try {
    console.log(`Starting duplicate cleanup for user: ${userId}`);
    
    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found');
      return;
    }
    
    console.log(`Found user: ${user.firstName} ${user.lastName} (${user.studentEmail})`);
    console.log(`Current enrollments: ${user.enrolledCourses.length}`);
    console.log(`Current course purchases: ${user.purchasedCourses.length}`);
    console.log(`Current bundle purchases: ${user.purchasedBundles.length}`);
    
    // Show current enrollments
    console.log('\nCurrent enrollments:');
    user.enrolledCourses.forEach((enrollment, index) => {
      console.log(`  ${index + 1}. Course: ${enrollment.course}, Enrolled: ${enrollment.enrolledAt}`);
    });
    
    const result = await user.cleanupDuplicates();
    
    console.log(`\nCleanup completed:`);
    console.log(`  - Total duplicates removed: ${result.duplicatesRemoved}`);
    console.log(`  - Enrollments removed: ${result.enrollmentsRemoved}`);
    console.log(`  - Course purchases removed: ${result.coursePurchasesRemoved}`);
    console.log(`  - Bundle purchases removed: ${result.bundlePurchasesRemoved}`);
    
    console.log(`\nAfter cleanup:`);
    console.log(`  - Enrollments: ${user.enrolledCourses.length}`);
    console.log(`  - Course purchases: ${user.purchasedCourses.length}`);
    console.log(`  - Bundle purchases: ${user.purchasedBundles.length}`);
    
  } catch (error) {
    console.error('Error during user cleanup:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  
  const userId = process.argv[2];
  if (!userId) {
    console.log('Please provide a user ID as an argument');
    console.log('Usage: node scripts/cleanupUserDuplicates.js <userId>');
    process.exit(1);
  }
  
  await cleanupUserDuplicates(userId);
  
  console.log('Cleanup completed');
  process.exit(0);
};

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  cleanupUserDuplicates
};
