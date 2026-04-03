/**
 * Create an Admin document in MongoDB (same as /auth/admin/create-admin, for CLI/CI).
 *
 * Usage (env — good for passwords, avoids shell history):
 *   ADMIN_SEED_USER_NAME="..." ADMIN_SEED_PHONE="..." ADMIN_SEED_PASSWORD="..." \
 *   [ADMIN_SEED_EMAIL=...] [ADMIN_SEED_ROLE=admin|superAdmin] \
 *   node scripts/createAdmin.js
 *
 * Usage (CLI):
 *   node scripts/createAdmin.js "<userName>" "<phoneNumber>" "<password>" [email] [admin|superAdmin]
 *
 * Requires DATABASE_URL (see .env).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const phoneRegex = /^\+?[\d\s\-\(\)]{6,20}$/;

function parseArgs() {
  const argv = process.argv.slice(2);
  if (argv.length >= 3) {
    const [userName, phoneNumber, password, fourth, fifth] = argv;
    let email;
    let role = 'admin';
    if (fourth) {
      if (fourth === 'admin' || fourth === 'superAdmin') {
        role = fourth;
      } else {
        email = fourth;
        if (fifth === 'admin' || fifth === 'superAdmin') {
          role = fifth;
        }
      }
    }
    return {
      userName,
      phoneNumber,
      password,
      email: email || undefined,
      role,
    };
  }

  const roleRaw = process.env.ADMIN_SEED_ROLE;
  const role =
    roleRaw === 'superAdmin' ? 'superAdmin' : 'admin';

  return {
    userName: process.env.ADMIN_SEED_USER_NAME,
    phoneNumber: process.env.ADMIN_SEED_PHONE,
    password: process.env.ADMIN_SEED_PASSWORD,
    email: process.env.ADMIN_SEED_EMAIL || undefined,
    role,
  };
}

function validate({ userName, phoneNumber, password, role }) {
  const errors = [];
  if (!userName || !phoneNumber || !password) {
    errors.push('userName, phoneNumber, and password are required (CLI args or ADMIN_SEED_* env).');
  }
  if (phoneNumber && !phoneRegex.test(phoneNumber)) {
    errors.push('Invalid phone number format.');
  }
  if (password && password.length < 6) {
    errors.push('Password must be at least 6 characters.');
  }
  if (role !== 'admin' && role !== 'superAdmin') {
    errors.push('role must be admin or superAdmin.');
  }
  return errors;
}

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const raw = parseArgs();
  const userName = raw.userName ? String(raw.userName).trim() : '';
  const phoneNumber = raw.phoneNumber ? String(raw.phoneNumber).trim() : '';
  const password =
    typeof raw.password === 'string' ? raw.password.trim() : raw.password;
  const email = raw.email ? String(raw.email).toLowerCase().trim() : undefined;
  const role = raw.role;

  const errors = validate({ userName, phoneNumber, password, role });
  if (errors.length) {
    console.error(errors.join(' '));
    if (!userName || !phoneNumber || !password) {
      console.error(`
Examples:
  npm run create-admin -- "Admin Name" "+201234567890" "your-password"

  Or add to .env (then npm run create-admin):
  ADMIN_SEED_USER_NAME=Admin Name
  ADMIN_SEED_PHONE=+201234567890
  ADMIN_SEED_PASSWORD=your-password
  Optional: ADMIN_SEED_EMAIL=, ADMIN_SEED_ROLE=admin|superAdmin
`);
    }
    process.exit(1);
  }

  await mongoose.connect(uri);

  const existing = await Admin.findOne({ phoneNumber });
  if (existing) {
    console.error('An admin with this phone number already exists.');
    process.exit(1);
  }

  const admin = new Admin({
    userName,
    phoneNumber,
    password,
    email,
    role,
    isActive: true,
  });
  await admin.save();

  console.log(`Admin created: ${userName} (${phoneNumber}), role=${role}, id=${admin._id}`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  mongoose.connection.close().finally(() => process.exit(1));
});
