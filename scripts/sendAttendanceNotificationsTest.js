const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const Group = require('../models/Group');
const { sendNotificationMessage } = require('../utils/notificationSender');

// Database connection string (from existing scripts)
const dbURI = 'mongodb+srv://deif:1qaz2wsx@3devway.aa4i6ga.mongodb.net/elkably?retryWrites=true&w=majority&appName=Cluster0';
const TARGET_PARENT_PHONE = '01003202768';

// Message templates
const MESSAGES = {
    PRESENT: (name, group) => `✅ ${name} - Present
Group: ${group.CenterName} ${group.Grade} ${group.GroupTime}
Absences: 0
Paid: ${group.cost || 0}
Remaining: 0
HW: submitted with steps`,

    LATE: (name, group) => `⏰ ${name} - Late
Group: ${group.CenterName} ${group.Grade} ${group.GroupTime}
Absences: 0
Paid: ${group.cost || 0}
Remaining: 0
HW: not submitted`,

    ABSENT: (name, group) => `⛔ ${name} - Absent
Group: ${group.CenterName} ${group.Grade} ${group.GroupTime}
Absences: 1
Paid: 0
Remaining: ${group.cost || 0}
HW: Not submitted`,

    PRESENT_OTHER: (name, group) => `✅ ${name} - Present From Other Group
Group: ${group.CenterName} ${group.Grade} ${group.GroupTime}
Absences: 0
Paid: ${group.cost || 0}
Remaining: 0
HW: submitted with steps`
};

/**
 * Send Push Notification Only (and save to DB)
 */
async function sendPushNotification(message, phone, countryCode = '20', studentId = null) {
    try {
        const phoneAsString = (typeof phone === 'string' ? phone : String(phone || '')).trim();
        if (!phoneAsString) {
            console.warn('Skipping message - No phone number provided');
            return { success: false, message: 'No phone number provided' };
        }

        let countryCodeWithout0 = countryCode ? String(countryCode).replace(/^0+/, '') : '20';
        let cleanedPhone = phoneAsString.replace(/\D/g, '');
        if (cleanedPhone.startsWith('0')) cleanedPhone = cleanedPhone.slice(1);

        let phoneNumber = `${countryCodeWithout0}${cleanedPhone}`.replace(/\D/g, '');
        if (!phoneNumber.startsWith('2')) phoneNumber = `2${phoneNumber}`;

        console.log(`Sending Push Notification to: ${phoneNumber}`);
        console.log(`Message content:\n${message}\n`);

        // Use the existing utility which authenticates with FCM and SAVES the notification to the DB
        const result = await sendNotificationMessage(phoneNumber, message, {}, countryCodeWithout0, studentId);

        if (result.success) {
            console.log('✓ Push notification sent & saved successfully');
        } else {
            console.log('x Push notification failed/not sent:', result.message);
            console.log('  (Note: If the user has no FCM token, it might not be saved/sent)');
        }

        return result;
    } catch (err) {
        console.error('Error sending message:', err.message);
        return { success: false, message: err.message };
    }
}

async function run() {
    try {
        console.log(`Connecting to MongoDB...`);
        await mongoose.connect(dbURI);
        console.log('Connected to MongoDB.');

        // Find student
        console.log(`Searching for student with parent phone: ${TARGET_PARENT_PHONE}...`);
        // Normalize phone search (simple regex for last 9 digits)
        const phoneRegex = new RegExp(TARGET_PARENT_PHONE.slice(-9));
        const student = await User.findOne({ parentPhone: { $regex: phoneRegex } });

        if (!student) {
            console.error('Student not found!');
            process.exit(1);
        }

        console.log(`Found student: ${student.Username} (${student.Code})`);

        // Get group info (or mock it if not in a group)
        const group = await Group.findOne({
            CenterName: student.centerName,
            Grade: student.Grade,
            gradeType: student.gradeType,
            GroupTime: student.groupTime
        }) || {
            CenterName: student.centerName || 'Unknown',
            Grade: student.Grade || 'Unknown',
            GroupTime: student.groupTime || 'Unknown',
            cost: 100
        };

        const firstName = student.Username.split(' ')[0];

        // 1. Send PRESENT
        console.log('\n--- Sending PRESENT Status ---');
        await sendPushNotification(
            MESSAGES.PRESENT(firstName, group),
            student.parentPhone,
            student.parentPhoneCountryCode,
            student._id
        );
        await new Promise(r => setTimeout(r, 2000));

        // 2. Send LATE
        console.log('\n--- Sending LATE Status ---');
        await sendPushNotification(
            MESSAGES.LATE(firstName, group),
            student.parentPhone,
            student.parentPhoneCountryCode,
            student._id
        );
        await new Promise(r => setTimeout(r, 2000));

        // 3. Send ABSENT
        console.log('\n--- Sending ABSENT Status ---');
        await sendPushNotification(
            MESSAGES.ABSENT(firstName, group),
            student.parentPhone,
            student.parentPhoneCountryCode,
            student._id
        );
        await new Promise(r => setTimeout(r, 2000));

        // 4. Send PRESENT FROM OTHER GROUP
        console.log('\n--- Sending PRESENT FROM OTHER GROUP Status ---');
        await sendPushNotification(
            MESSAGES.PRESENT_OTHER(firstName, group),
            student.parentPhone,
            student.parentPhoneCountryCode,
            student._id
        );

        console.log('\nAll messages processed!');
        process.exit(0);

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

run();
