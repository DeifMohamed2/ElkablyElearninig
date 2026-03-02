/**
 * Migration Script: Fix Bulk Promo Code Status
 *
 * This script fixes bulk promo codes that have usageHistory entries
 * but usedByStudent was never set (due to the bug in purchaseController).
 *
 * Run: node scripts/fixBulkPromoCodeStatus.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PromoCode = require('../models/PromoCode');
const connectDB = require('../config/db');

async function fixBulkPromoCodeStatus() {
  try {
    await connectDB();
    console.log('Connected to database');

    // Find all bulk promo codes that have usage history but no usedByStudent
    const brokenCodes = await PromoCode.find({
      isBulkCode: true,
      isSingleUseOnly: true,
      usedByStudent: null,
      $or: [
        { currentUses: { $gt: 0 } },
        { 'usageHistory.0': { $exists: true } },
      ],
    }).populate('usageHistory.user', 'firstName lastName studentEmail email');

    console.log(
      `Found ${brokenCodes.length} bulk promo codes with missing usedByStudent`,
    );

    if (brokenCodes.length === 0) {
      console.log('No codes to fix. All data is consistent.');
      process.exit(0);
    }

    let fixed = 0;
    let errors = 0;

    for (const code of brokenCodes) {
      try {
        // Get the first usage entry (the student who used it)
        const firstUsage = code.usageHistory[0];
        if (firstUsage && firstUsage.user) {
          code.usedByStudent = firstUsage.user._id;

          // Try to get email from populated user
          if (firstUsage.user.studentEmail) {
            code.usedByStudentEmail =
              firstUsage.user.studentEmail.toLowerCase();
          } else if (firstUsage.user.email) {
            code.usedByStudentEmail = firstUsage.user.email.toLowerCase();
          }

          await code.save();
          fixed++;
          console.log(
            `  Fixed: ${code.code} -> usedByStudent: ${firstUsage.user._id}`,
          );
        } else {
          // If user reference exists but not populated, just set the ID
          if (firstUsage && firstUsage.user) {
            code.usedByStudent = firstUsage.user;
            await code.save();
            fixed++;
            console.log(
              `  Fixed (ID only): ${code.code} -> usedByStudent: ${firstUsage.user}`,
            );
          } else {
            console.log(
              `  Skipped: ${code.code} - no usage history user found`,
            );
          }
        }
      } catch (err) {
        errors++;
        console.error(`  Error fixing ${code.code}:`, err.message);
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Total found:  ${brokenCodes.length}`);
    console.log(`Fixed:        ${fixed}`);
    console.log(`Errors:       ${errors}`);

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

fixBulkPromoCodeStatus();
