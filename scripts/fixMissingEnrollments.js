/**
 * Script to investigate and fix missing enrollments
 * 
 * Usage:
 *   node scripts/fixMissingEnrollments.js                    # Find all users with issues
 *   node scripts/fixMissingEnrollments.js --user=<id>        # Investigate specific user
 *   node scripts/fixMissingEnrollments.js --user=<id> --fix  # Fix specific user
 *   node scripts/fixMissingEnrollments.js --fix-all          # Fix ALL users with issues
 *   node scripts/fixMissingEnrollments.js --dry-run          # Preview without changes
 * 
 * Root Cause: Race condition in payment processing where addPurchasedCourse()
 * saved the user, but the subsequent enrollment save failed due to version conflict.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');
const AdminLog = require('../models/AdminLog');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const FIX_ALL = process.argv.includes('--fix-all');
const FIX_ONE = process.argv.includes('--fix');
const SPECIFIC_USER_ID = process.argv.find(arg => arg.startsWith('--user='))?.split('=')[1];

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

async function investigateUser(userId) {
  console.log('\n' + '='.repeat(60));
  log('cyan', `🔍 INVESTIGATING USER: ${userId}`);
  console.log('='.repeat(60) + '\n');

  const user = await User.findById(userId)
    .populate('purchasedCourses.course', 'title courseCode')
    .populate('enrolledCourses.course', 'title courseCode')
    .lean();

  if (!user) {
    log('red', '❌ User not found');
    return null;
  }

  log('blue', `📋 User: ${user.firstName} ${user.lastName}`);
  console.log(`   📱 Student Phone: ${user.studentNumber}`);
  console.log(`   📧 Email: ${user.studentEmail}`);
  console.log(`   🆔 Student Code: ${user.studentCode}`);
  console.log('');

  // Purchased Courses
  log('yellow', '💳 PURCHASED COURSES:');
  if (user.purchasedCourses && user.purchasedCourses.length > 0) {
    user.purchasedCourses.forEach((p, idx) => {
      const courseName = p.course?.title || p.course || 'Unknown (deleted?)';
      console.log(`   ${idx + 1}. ${courseName}`);
      console.log(`      Order: ${p.orderNumber} | Price: ${p.price} EGP | Status: ${p.status}`);
      console.log(`      Date: ${new Date(p.purchasedAt).toLocaleString()}`);
    });
  } else {
    console.log('   (none)');
  }
  console.log('');

  // Enrolled Courses
  log('yellow', '📚 ENROLLED COURSES:');
  if (user.enrolledCourses && user.enrolledCourses.length > 0) {
    user.enrolledCourses.forEach((e, idx) => {
      const courseName = e.course?.title || e.course || 'Unknown (deleted?)';
      console.log(`   ${idx + 1}. ${courseName}`);
      console.log(`      Enrolled: ${new Date(e.enrolledAt).toLocaleString()} | Progress: ${e.progress}%`);
    });
  } else {
    console.log('   (none)');
  }
  console.log('');

  // Find discrepancies
  const purchasedCourseIds = (user.purchasedCourses || [])
    .filter(p => p.status === 'active' && p.course)
    .map(p => (p.course._id || p.course).toString());

  const enrolledCourseIds = (user.enrolledCourses || [])
    .filter(e => e.course)
    .map(e => (e.course._id || e.course).toString());

  const missingEnrollments = purchasedCourseIds.filter(
    id => !enrolledCourseIds.includes(id)
  );

  // Analysis
  if (missingEnrollments.length > 0) {
    log('red', `⚠️  DISCREPANCY FOUND!`);
    console.log(`   Purchased (active): ${purchasedCourseIds.length}`);
    console.log(`   Enrolled: ${enrolledCourseIds.length}`);
    console.log(`   Missing Enrollments: ${missingEnrollments.length}`);
    console.log('');

    log('yellow', '   Missing courses:');
    for (const courseId of missingEnrollments) {
      const course = await Course.findById(courseId).select('title courseCode').lean();
      const purchase = user.purchasedCourses.find(
        p => (p.course._id || p.course).toString() === courseId
      );
      console.log(`   - ${course?.title || 'Unknown'} (${courseId})`);
      console.log(`     Order: ${purchase?.orderNumber} | Date: ${new Date(purchase?.purchasedAt).toLocaleString()}`);
    }
  } else {
    log('green', '✅ No discrepancies found - enrollments are in sync');
  }

  // Trace Purchase records
  console.log('');
  log('cyan', '📦 PURCHASE RECORDS:');
  const purchases = await Purchase.find({ user: userId })
    .populate('items.item', 'title courseCode')
    .sort({ createdAt: -1 })
    .lean();

  if (purchases.length > 0) {
    purchases.forEach((p, idx) => {
      const statusColor = p.status === 'completed' ? 'green' : p.status === 'failed' ? 'red' : 'yellow';
      console.log(`\n   ${idx + 1}. Order: ${p.orderNumber}`);
      log(statusColor, `      Status: ${p.status} | Payment: ${p.paymentStatus}`);
      console.log(`      Total: ${p.total} EGP | Created: ${new Date(p.createdAt).toLocaleString()}`);
      if (p.completedAt) {
        console.log(`      Completed: ${new Date(p.completedAt).toLocaleString()}`);
      }
      console.log(`      Items:`);
      (p.items || []).forEach(item => {
        console.log(`        - ${item.title || item.item?.title || 'Unknown'} (${item.itemType})`);
      });
    });
  } else {
    console.log('   (no purchase records found - might be manual enrollment)');
  }

  return {
    user,
    missingEnrollments,
    purchases
  };
}

async function fixUserEnrollments(userId, missingCourseIds) {
  if (DRY_RUN) {
    log('yellow', '\n🔸 DRY RUN - No changes will be made');
    console.log('   Would add enrollments for:', missingCourseIds.length, 'courses');
    return { fixed: 0, dryRun: true };
  }

  log('blue', '\n🔧 FIXING ENROLLMENTS...');

  const user = await User.findById(userId);
  let fixedCount = 0;
  const fixedCourses = [];

  for (const courseId of missingCourseIds) {
    const course = await Course.findById(courseId).select('title').lean();

    // Double-check not already enrolled
    const alreadyEnrolled = user.enrolledCourses.some(
      e => e.course && e.course.toString() === courseId.toString()
    );

    if (alreadyEnrolled) {
      log('yellow', `   ⏭️  Already enrolled: ${course?.title || courseId}`);
      continue;
    }

    // Find the purchase date for this course
    const purchaseInfo = user.purchasedCourses.find(
      p => p.course && p.course.toString() === courseId.toString()
    );

    user.enrolledCourses.push({
      course: new mongoose.Types.ObjectId(courseId),
      enrolledAt: purchaseInfo?.purchasedAt || new Date(),
      progress: 0,
      lastAccessed: new Date(),
      completedTopics: [],
      status: 'active',
      contentProgress: [],
    });

    fixedCount++;
    fixedCourses.push({
      courseId,
      title: course?.title || 'Unknown',
      orderNumber: purchaseInfo?.orderNumber
    });
    log('green', `   ✅ Added enrollment: ${course?.title || courseId}`);
  }

  if (fixedCount > 0) {
    await user.save();

    // Log to AdminLog
    try {
      await AdminLog.createLog({
        admin: user._id, // System action, using user ID
        adminName: 'SYSTEM',
        adminPhone: 'SYSTEM',
        action: 'SYNC_ENROLLMENT',
        actionCategory: 'STUDENT_MANAGEMENT',
        description: `Fixed ${fixedCount} missing enrollment(s) for user ${user.firstName} ${user.lastName}`,
        targetModel: 'User',
        targetId: user._id.toString(),
        targetName: `${user.firstName} ${user.lastName}`,
        metadata: {
          fixedCourses,
          reason: 'Enrollment sync script - race condition fix',
          studentCode: user.studentCode,
          studentPhone: user.studentNumber
        },
        status: 'SUCCESS'
      });
    } catch (logError) {
      console.log('   (Could not create admin log:', logError.message, ')');
    }

    log('green', `\n✅ Fixed ${fixedCount} enrollment(s) for user!`);
  }

  return { fixed: fixedCount, dryRun: false };
}

async function findAllUsersWithMissingEnrollments() {
  log('cyan', '\n🔍 Searching for users with missing enrollments...\n');

  const users = await User.find({
    'purchasedCourses.0': { $exists: true },
    role: 'student'
  }).select('_id firstName lastName studentNumber studentCode purchasedCourses enrolledCourses').lean();

  const usersWithIssues = [];

  for (const user of users) {
    const purchasedActive = (user.purchasedCourses || [])
      .filter(p => p.status === 'active' && p.course)
      .map(p => p.course.toString());

    const enrolled = (user.enrolledCourses || [])
      .filter(e => e.course)
      .map(e => e.course.toString());

    const missing = purchasedActive.filter(id => !enrolled.includes(id));

    if (missing.length > 0) {
      usersWithIssues.push({
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        phone: user.studentNumber,
        studentCode: user.studentCode,
        purchasedCount: purchasedActive.length,
        enrolledCount: enrolled.length,
        missingCount: missing.length,
        missingCourseIds: missing
      });
    }
  }

  if (usersWithIssues.length === 0) {
    log('green', '✅ No users with missing enrollments found!');
    return usersWithIssues;
  }

  log('red', `Found ${usersWithIssues.length} user(s) with missing enrollments:\n`);

  usersWithIssues.forEach((u, idx) => {
    console.log(`${idx + 1}. ${u.name} (${u.phone})`);
    console.log(`   ID: ${u.userId}`);
    console.log(`   Student Code: ${u.studentCode}`);
    console.log(`   Purchased: ${u.purchasedCount}, Enrolled: ${u.enrolledCount}, Missing: ${u.missingCount}`);
    console.log('');
  });

  return usersWithIssues;
}

async function fixAllUsers(usersWithIssues) {
  if (usersWithIssues.length === 0) {
    return;
  }

  if (DRY_RUN) {
    log('yellow', '\n🔸 DRY RUN - No changes will be made');
    console.log(`   Would fix ${usersWithIssues.length} users with ${usersWithIssues.reduce((sum, u) => sum + u.missingCount, 0)} total missing enrollments`);
    return;
  }

  log('blue', `\n🔧 Fixing all ${usersWithIssues.length} users...\n`);

  let totalFixed = 0;
  const results = [];

  for (const u of usersWithIssues) {
    const result = await fixUserEnrollments(u.userId, u.missingCourseIds);
    totalFixed += result.fixed;
    results.push({
      ...u,
      fixed: result.fixed
    });
  }

  // Log bulk action
  try {
    await AdminLog.createLog({
      admin: new mongoose.Types.ObjectId('000000000000000000000000'), // System
      adminName: 'SYSTEM',
      adminPhone: 'SYSTEM',
      action: 'BULK_SYNC_ENROLLMENTS',
      actionCategory: 'STUDENT_MANAGEMENT',
      description: `Bulk fixed ${totalFixed} missing enrollment(s) across ${usersWithIssues.length} users`,
      targetModel: 'Multiple',
      targetId: 'bulk',
      metadata: {
        usersFixed: usersWithIssues.length,
        enrollmentsFixed: totalFixed,
        results: results.map(r => ({
          userId: r.userId,
          name: r.name,
          studentCode: r.studentCode,
          fixed: r.fixed
        })),
        reason: 'Enrollment sync script - race condition fix'
      },
      status: 'SUCCESS'
    });
  } catch (logError) {
    console.log('(Could not create bulk admin log:', logError.message, ')');
  }

  console.log('\n' + '='.repeat(60));
  log('green', `✅ BULK FIX COMPLETE: Fixed ${totalFixed} enrollments across ${usersWithIssues.length} users`);
  console.log('='.repeat(60));
}

async function main() {
  console.log('\n' + '='.repeat(60));
  log('cyan', '🔄 ENROLLMENT SYNC TOOL');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    log('yellow', '⚠️  DRY RUN MODE - No changes will be made\n');
  }

  await connectDB();

  try {
    if (SPECIFIC_USER_ID) {
      // Investigate specific user
      const result = await investigateUser(SPECIFIC_USER_ID);

      if (result && result.missingEnrollments.length > 0 && FIX_ONE) {
        await fixUserEnrollments(SPECIFIC_USER_ID, result.missingEnrollments);
      } else if (result && result.missingEnrollments.length > 0 && !FIX_ONE) {
        console.log('\n' + '-'.repeat(60));
        log('yellow', 'To fix this user, run:');
        console.log(`  node scripts/fixMissingEnrollments.js --user=${SPECIFIC_USER_ID} --fix`);
        console.log('-'.repeat(60));
      }
    } else {
      // Find all users with issues
      const usersWithIssues = await findAllUsersWithMissingEnrollments();

      if (usersWithIssues.length > 0 && FIX_ALL) {
        await fixAllUsers(usersWithIssues);
      } else if (usersWithIssues.length > 0) {
        console.log('\n' + '-'.repeat(60));
        log('yellow', 'Options:');
        console.log('  Investigate a user:  node scripts/fixMissingEnrollments.js --user=<userId>');
        console.log('  Fix a specific user: node scripts/fixMissingEnrollments.js --user=<userId> --fix');
        console.log('  Fix ALL users:       node scripts/fixMissingEnrollments.js --fix-all');
        console.log('  Preview changes:     node scripts/fixMissingEnrollments.js --fix-all --dry-run');
        console.log('-'.repeat(60));
      }
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
