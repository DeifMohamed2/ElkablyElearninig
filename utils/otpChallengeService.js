const crypto = require('crypto');
const OtpChallenge = require('../models/OtpChallenge');

const PEPPER = () => process.env.OTP_PEPPER || process.env.STUDENT_JWT_SECRET || 'elkably-otp';

const hashCode = (code) =>
  crypto.createHash('sha256').update(`${PEPPER()}:${String(code).trim()}`).digest('hex');

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const buildRecipientKey = (purpose, countryCode, cleanDigits) =>
  `${purpose}:${countryCode}:${cleanDigits}`;

/**
 * Dispatch OTP via SMS (Egypt) or WhatsApp (non-Egypt) — same behavior as authController.sendOTP
 */
async function dispatchOtpMessage(fullPhoneNumber, message) {
  const isEgyptian = fullPhoneNumber.startsWith('+20') || fullPhoneNumber.startsWith('20');

  if (isEgyptian) {
    const { sendSms } = require('./sms');
    await sendSms({ recipient: fullPhoneNumber, message });
    return;
  }

  const wasender = require('./wasender');
  const SESSION_API_KEY =
    process.env.WASENDER_SESSION_API_KEY ||
    process.env.WHATSAPP_SESSION_API_KEY ||
    '';

  if (!SESSION_API_KEY) {
    throw new Error('WhatsApp session API key not configured');
  }

  const cleanPhone = fullPhoneNumber.replace(/^\+/, '').replace(/\D/g, '');
  const whatsappJid = `${cleanPhone}@s.whatsapp.net`;
  const result = await wasender.sendTextMessage(SESSION_API_KEY, whatsappJid, message);

  if (!result.success) {
    const errorMessage = result.message || '';
    const hasJidError =
      errorMessage.toLowerCase().includes('jid does not exist') ||
      errorMessage.toLowerCase().includes('does not exist on whatsapp') ||
      (result.errors &&
        result.errors.to &&
        result.errors.to.some((err) =>
          err.toLowerCase().includes('does not exist'),
        ));

    if (hasJidError) {
      throw new Error(
        'This phone number does not have WhatsApp or WhatsApp is not available for this number. Please use an Egyptian phone number (+20) to receive OTP via SMS, or ensure your phone number is registered on WhatsApp.',
      );
    }

    throw new Error(result.message || 'Failed to send WhatsApp message');
  }
}

async function createOrRotateChallenge({
  purpose,
  countryCode,
  phoneDigits,
  userId = null,
  messagePrefix,
  maxSendsPerWindow = 3,
  windowMs = 60 * 60 * 1000,
}) {
  const clean = String(phoneDigits).replace(/\D/g, '');
  const recipientKey = buildRecipientKey(purpose, countryCode, clean);
  const fullPhone = `${countryCode}${clean}`;

  let doc = await OtpChallenge.findOne({ purpose, recipientKey, consumed: false }).sort({
    createdAt: -1,
  });

  const now = Date.now();

  if (doc && doc.blockedUntil && doc.blockedUntil > new Date(now)) {
    const remainingMinutes = Math.ceil((doc.blockedUntil - now) / 60000);
    const err = new Error(
      `Too many OTP requests. Please try again after ${remainingMinutes} minute(s).`,
    );
    err.status = 429;
    err.blockedUntil = doc.blockedUntil;
    err.retryAfter = remainingMinutes;
    throw err;
  }

  if (doc && doc.blockedUntil && doc.blockedUntil <= new Date(now)) {
    doc.sendCount = 0;
    doc.blockedUntil = null;
  }

  if (doc && doc.sendCount >= maxSendsPerWindow) {
    const blockUntil = new Date(now + windowMs);
    doc.blockedUntil = blockUntil;
    await doc.save();
    const remainingMinutes = Math.ceil(windowMs / 60000);
    const err = new Error(
      `You have exceeded the maximum number of OTP requests (${maxSendsPerWindow}). Please try again after ${remainingMinutes} minute(s).`,
    );
    err.status = 429;
    err.blockedUntil = blockUntil;
    err.retryAfter = remainingMinutes;
    throw err;
  }

  const code = generateOtp();
  const codeHash = hashCode(code);
  const expiresAt = new Date(now + 5 * 60 * 1000);

  if (!doc) {
    doc = new OtpChallenge({
      purpose,
      recipientKey,
      userId,
      codeHash,
      expiresAt,
      sendCount: 1,
      verified: false,
      consumed: false,
    });
  } else {
    doc.codeHash = codeHash;
    doc.expiresAt = expiresAt;
    doc.sendCount = (doc.sendCount || 0) + 1;
    doc.verified = false;
    doc.verifyAttempts = 0;
    if (userId) doc.userId = userId;
  }

  await doc.save();

  const message = `${messagePrefix}: ${code}. Valid for 5 minutes. Do not share this code.`;
  await dispatchOtpMessage(fullPhone, message);

  return {
    attemptsRemaining: maxSendsPerWindow - doc.sendCount,
    expiresIn: 300,
  };
}

async function verifyChallengeCode({ purpose, countryCode, phoneDigits, code }) {
  const clean = String(phoneDigits).replace(/\D/g, '');
  const recipientKey = buildRecipientKey(purpose, countryCode, clean);

  const doc = await OtpChallenge.findOne({
    purpose,
    recipientKey,
    consumed: false,
  }).sort({ createdAt: -1 });

  if (!doc) {
    const err = new Error('OTP not found or expired. Please request a new OTP.');
    err.status = 400;
    throw err;
  }

  if (doc.expiresAt < new Date()) {
    const err = new Error('OTP has expired. Please request a new OTP.');
    err.status = 400;
    throw err;
  }

  if (hashCode(code) !== doc.codeHash) {
    doc.verifyAttempts = (doc.verifyAttempts || 0) + 1;
    await doc.save();
    const err = new Error('Invalid OTP. Please try again.');
    err.status = 400;
    throw err;
  }

  doc.verified = true;
  await doc.save();
  return doc;
}

async function assertVerifiedAndConsume({ purpose, countryCode, phoneDigits }) {
  const clean = String(phoneDigits).replace(/\D/g, '');
  const recipientKey = buildRecipientKey(purpose, countryCode, clean);

  const doc = await OtpChallenge.findOne({
    purpose,
    recipientKey,
    verified: true,
    consumed: false,
  }).sort({ createdAt: -1 });

  if (!doc || doc.expiresAt < new Date()) {
    const err = new Error(
      'Phone verification expired or missing. Please verify your student phone again.',
    );
    err.status = 400;
    throw err;
  }

  doc.consumed = true;
  await doc.save();
  return doc;
}

async function assertForgotVerifiedAndConsume(userId) {
  const doc = await OtpChallenge.findOne({
    purpose: 'forgot_password',
    userId,
    verified: true,
    consumed: false,
  }).sort({ createdAt: -1 });

  if (!doc || doc.expiresAt < new Date()) {
    const err = new Error('OTP verification expired. Please start forgot password again.');
    err.status = 400;
    throw err;
  }

  doc.consumed = true;
  await doc.save();
  return doc;
}

module.exports = {
  hashCode,
  generateOtp,
  buildRecipientKey,
  dispatchOtpMessage,
  createOrRotateChallenge,
  verifyChallengeCode,
  assertVerifiedAndConsume,
  assertForgotVerifiedAndConsume,
};
