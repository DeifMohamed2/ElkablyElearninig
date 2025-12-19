/**
 * Script to create or upgrade an admin to super admin
 * 
 * Usage:
 * node scripts/createSuperAdmin.js <phone_number>
 * 
 * Example:
 * node scripts/createSuperAdmin.js +201234567890
 */

const mongoose = require('mongoose');
const Admin = require('../models/Admin');
require('dotenv').config();

const dbURI = process.env.MONGODB_URI || 'mongodb+srv://deif:1qaz2wsx@3devway.aa4i6ga.mongodb.net/Elkably-Elearning?retryWrites=true&w=majority&appName=Cluster0';

async function createSuperAdmin() {
  try {
    // Get phone number from command line arguments
    const phoneNumber = process.argv[2];

    if (!phoneNumber) {
      console.error('❌ Error: Please provide a phone number');
      console.log('Usage: node scripts/createSuperAdmin.js <phone_number>');
      console.log('Example: node scripts/createSuperAdmin.js +201234567890');
      process.exit(1);
    }

    // Connect to database
    console.log('🔌 Connecting to database...');
    await mongoose.connect(dbURI);
    console.log('✅ Connected to database');

    // Find admin by phone number
    const admin = await Admin.findOne({ phoneNumber });

    if (!admin) {
      console.error(`❌ Error: No admin found with phone number: ${phoneNumber}`);
      console.log('\nAvailable admins:');
      const allAdmins = await Admin.find({}, 'userName phoneNumber email role');
      allAdmins.forEach(a => {
        console.log(`  - ${a.userName} (${a.phoneNumber}) - Role: ${a.role}`);
      });
      process.exit(1);
    }

    // Check if already super admin
    if (admin.role === 'superAdmin') {
      console.log(`ℹ️  Admin "${admin.userName}" is already a super admin`);
      process.exit(0);
    }

    // Update to super admin
    admin.role = 'superAdmin';
    await admin.save();

    console.log('✅ Successfully upgraded admin to super admin!');
    console.log('\nAdmin Details:');
    console.log(`  Name: ${admin.userName}`);
    console.log(`  Phone: ${admin.phoneNumber}`);
    console.log(`  Email: ${admin.email || 'N/A'}`);
    console.log(`  Role: ${admin.role}`);
    console.log('\n🎉 This admin can now access the Admin Logs page!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
createSuperAdmin();





