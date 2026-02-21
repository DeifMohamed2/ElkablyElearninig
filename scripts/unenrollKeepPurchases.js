/**
 * Script to unenroll students but keep their purchases
 * This reverses the enrollment fix while preserving purchase data
 * 
 * Usage:
 *   node scripts/unenrollKeepPurchases.js                    # Find all affected users
 *   node scripts/unenrollKeepPurchases.js --user=<id>        # Unenroll specific user
 *   node scripts/unenrollKeepPurchases.js --unenroll-all     # Unenroll ALL affected users
 *   node scripts/unenrollKeepPurchases.js --dry-run          # Preview without changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const UNENROLL_ALL = process.argv.includes('--unenroll-all');
const SPECIFIC_USER_ID = process.argv.find(arg => arg.startsWith('--user='))?.split('=')[1];

// List of user IDs that were fixed (from the previous run)
const AFFECTED_USER_IDS = [
  '6944620d5525b27e264e9e45', // Logy Yasser
  '69432011bfb67f0c6c7ddc4a', // Jena Magdy
  '6943e492bfb67f0c6c7e0f6e', // ahmed safi
  '6952c52e736f6d73e45ea2eb', // Mohamed Elkholy
  '694fc49f44ce4da9946c0eda', // Bavly Michel
  '6950005444ce4da99470ca12', // Nada Mohamed
  '6946d0c2f40fa6b569963d93', // Salma Elsaadany
  '695027da736f6d73e438627d', // Yousef Alaa
  '69498ede9ac7ae0d3d4572a2', // Ahmed Mohamed
  '69482eb8f865424bce0458d1', // Omar Hani
  '694ac758c6ac17a906a38326', // Rakaz Tharwat
  '694960c7e92aedc1acb3069d', // Jana Khaled
  '695a49f1f33c0a4a3fd45e30', // Ali Shawky
  '6947cdc0f865424bce02e6a8', // Malak Fayed
  '6947eb2ef865424bce032ca2', // Yassin Nabil
  '69443dea5525b27e264e815d', // Moaz Elmorshedy
  '6946e7bcf40fa6b5699667f6', // Hassan Hamdy
  '69504f36736f6d73e43a634f', // Aliaa Elsenosy
  '695b74bbf33c0a4a3ff37b17', // Youssof Mostafa
  '6950172944ce4da99472863c', // Retaj Ahmed
  '69518959736f6d73e44a5a38', // Saifeldin Senger
  '6949afc9c6ac17a9069fb039', // basel alaa
  '694be7dfdfb2e61fd0ac445d', // Malak Muhammad
  '695be895310a1516c5bf91a0', // Abdelaziz Abaza
  '69481a09f865424bce04006c', // Jana Tarek
  '694edaa044ce4da99467244c', // Malak Tamer
  '6949a352c6ac17a9069f79fe', // Zein Elsabaa
  '69512472736f6d73e44065a6', // Zeyad Hosam
  '695287c3736f6d73e4558f4c', // yara yasser
  '69495f2ae92aedc1acb2ee83', // dana nakawa
  '6953c8d177bea8cdd7dc9490', // sara MAHMOUD
  '69517f7b736f6d73e449ba13', // yousef daifalla
  '69455dd98a6d1ce41e93cbba', // retag eldawy
  '69447bfe5525b27e264ea4ab', // mohamed khaled
  '694699dbe96a70c89086f0bb', // lojayn ahmed
  '69652b0440f0648906768a0a', // Dareen mostafa
  '6950259b736f6d73e4383b8f', // Abdelraman mohamed
  '6958079f77bea8cdd72c7fbf', // Habiba Karim
  '694d33b444ce4da9945bccde', // yassin weaam
  '698397138fbdbf1aeffbf48c', // Yousef Osama ahmed
  '694ace61c6ac17a906a38d6b', // Marcelino Saad (the original one)
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(colors[color], ...args, colors.reset);
}

async function connectDB() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    log('green', '✅ Connected to MongoDB');
  } catch (error) {
    log('red', '❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function unenrollUser(userId) {
  const user = await User.findById(userId)
    .populate('purchasedCourses.course', 'title courseCode')
    .populate('enrolledCourses.course', 'title courseCode');

  if (!user) {
    log('red', `❌ User not found: ${userId}`);
    return { unenrolled: 0 };
  }

  log('blue', `\n📋 User: ${user.firstName} ${user.lastName}`);
  console.log(`   📱 Phone: ${user.studentNumber}`);
  console.log(`   🆔 Student Code: ${user.studentCode}`);

  // Get purchased course IDs
  const purchasedCourseIds = (user.purchasedCourses || [])
    .filter(p => p.status === 'active' && p.course)
    .map(p => (p.course._id || p.course).toString());

  // Get current enrolled course IDs
  const enrolledBefore = user.enrolledCourses.length;

  if (DRY_RUN) {
    log('yellow', `   🔸 DRY RUN - Would remove ${enrolledBefore} enrollments, keep ${purchasedCourseIds.length} purchases`);
    return { unenrolled: enrolledBefore, dryRun: true };
  }

  // Find enrollments that match purchased courses (these are the ones we added)
  const enrollmentsToRemove = user.enrolledCourses.filter(e => {
    if (!e.course) return false;
    const courseId = (e.course._id || e.course).toString();
    return purchasedCourseIds.includes(courseId);
  });

  const removedCourses = [];
  for (const enrollment of enrollmentsToRemove) {
    const courseId = (enrollment.course._id || enrollment.course).toString();
    const courseName = enrollment.course?.title || 'Unknown';
    removedCourses.push({ courseId, title: courseName });
    log('red', `   ❌ Removing enrollment: ${courseName}`);
  }

  // Remove only enrollments that match purchased courses
  user.enrolledCourses = user.enrolledCourses.filter(e => {
    if (!e.course) return true;
    const courseId = (e.course._id || e.course).toString();
    return !purchasedCourseIds.includes(courseId);
  });

  await user.save();

  log('green', `   ✅ Removed ${removedCourses.length} enrollment(s), kept ${user.purchasedCourses.length} purchase(s)`);

  return { unenrolled: removedCourses.length, removedCourses };
}

async function unenrollAllAffected() {
  log('cyan', `\n🔄 Processing ${AFFECTED_USER_IDS.length} affected users...\n`);

  let totalUnenrolled = 0;
  const results = [];

  for (const userId of AFFECTED_USER_IDS) {
    const result = await unenrollUser(userId);
    totalUnenrolled += result.unenrolled || 0;
    results.push({ userId, ...result });
  }

  console.log('\n' + '='.repeat(60));
  if (DRY_RUN) {
    log('yellow', `🔸 DRY RUN COMPLETE: Would unenroll ${totalUnenrolled} enrollments across ${AFFECTED_USER_IDS.length} users`);
  } else {
    log('green', `✅ COMPLETE: Removed ${totalUnenrolled} enrollments across ${AFFECTED_USER_IDS.length} users`);
  }
  log('blue', `   📦 All purchases remain intact`);
  console.log('='.repeat(60));

  return results;
}

async function main() {
  console.log('\n' + '='.repeat(60));
  log('cyan', '🔄 UNENROLL STUDENTS (KEEP PURCHASES)');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    log('yellow', '⚠️  DRY RUN MODE - No changes will be made\n');
  }

  await connectDB();

  try {
    if (SPECIFIC_USER_ID) {
      await unenrollUser(SPECIFIC_USER_ID);
    } else if (UNENROLL_ALL) {
      await unenrollAllAffected();
    } else {
      log('yellow', '\nOptions:');
      console.log('  Unenroll specific user: node scripts/unenrollKeepPurchases.js --user=<userId>');
      console.log('  Unenroll ALL affected:  node scripts/unenrollKeepPurchases.js --unenroll-all');
      console.log('  Preview changes:        node scripts/unenrollKeepPurchases.js --unenroll-all --dry-run');
      console.log(`\n  Affected users: ${AFFECTED_USER_IDS.length}`);
    }
  } catch (error) {
    log('red', '❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    log('blue', '\n👋 Disconnected from MongoDB');
  }
}

main();
