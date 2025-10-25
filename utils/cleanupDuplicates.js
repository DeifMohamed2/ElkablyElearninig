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

// Clean up duplicates for all users
const cleanupAllDuplicates = async () => {
  try {
    console.log('Starting duplicate cleanup for all users...');
    
    const users = await User.find({ role: 'student' });
    console.log(`Found ${users.length} students to process`);
    
    let totalDuplicatesRemoved = 0;
    let usersWithDuplicates = 0;
    
    for (const user of users) {
      const result = await user.cleanupDuplicates();
      
      if (result.duplicatesRemoved > 0) {
        usersWithDuplicates++;
        totalDuplicatesRemoved += result.duplicatesRemoved;
        console.log(`User ${user._id} (${user.firstName} ${user.lastName}): Removed ${result.duplicatesRemoved} duplicates`);
        console.log(`  - Enrollments removed: ${result.enrollmentsRemoved}`);
        console.log(`  - Course purchases removed: ${result.coursePurchasesRemoved}`);
        console.log(`  - Bundle purchases removed: ${result.bundlePurchasesRemoved}`);
      }
    }
    
    console.log('\n=== CLEANUP SUMMARY ===');
    console.log(`Total users processed: ${users.length}`);
    console.log(`Users with duplicates: ${usersWithDuplicates}`);
    console.log(`Total duplicates removed: ${totalDuplicatesRemoved}`);
    
  } catch (error) {
    console.error('Error during cleanup:', error);
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
    
    const result = await user.cleanupDuplicates();
    
    console.log(`User ${user._id} (${user.firstName} ${user.lastName}): Removed ${result.duplicatesRemoved} duplicates`);
    console.log(`  - Enrollments removed: ${result.enrollmentsRemoved}`);
    console.log(`  - Course purchases removed: ${result.coursePurchasesRemoved}`);
    console.log(`  - Bundle purchases removed: ${result.bundlePurchasesRemoved}`);
    
  } catch (error) {
    console.error('Error during user cleanup:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0] === '--user') {
    // Clean up specific user
    const userId = args[1];
    if (!userId) {
      console.log('Please provide a user ID');
      process.exit(1);
    }
    await cleanupUserDuplicates(userId);
  } else {
    // Clean up all users
    await cleanupAllDuplicates();
  }
  
  console.log('Cleanup completed');
  process.exit(0);
};

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  cleanupAllDuplicates,
  cleanupUserDuplicates
};
