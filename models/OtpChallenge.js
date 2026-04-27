const mongoose = require('mongoose');

/**
 * DB-backed OTP challenges for mobile API (stateless; no session cookies).
 */
const OtpChallengeSchema = new mongoose.Schema(
  {
    purpose: {
      type: String,
      required: true,
      enum: [
        'register_student',
        'forgot_password',
        'profile_phone',
      ],
      index: true,
    },
    /** Normalized lookup key, e.g. register_student:+966:5xxxxxxxx */
    recipientKey: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    codeHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    sendCount: {
      type: Number,
      default: 0,
    },
    verifyAttempts: {
      type: Number,
      default: 0,
    },
    blockedUntil: {
      type: Date,
      default: null,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    consumed: {
      type: Boolean,
      default: false,
    },
    /** Last time an OTP was dispatched for this challenge (resend spacing). */
    lastOtpSentAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OtpChallenge', OtpChallengeSchema);
