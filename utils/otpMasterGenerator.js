/**
 * OTP Master Generator Utility
 * Generates temporary OTP codes for admin use when SMS services fail
 * OTPs are stored in memory only and automatically expire
 */

// In-memory storage for active OTPs
const activeOTPs = new Map();

// Configuration
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const CLEANUP_INTERVAL_MS = 60000; // Clean up expired OTPs every minute

/**
 * Generate a random numeric OTP
 * @param {number} length - Length of the OTP
 * @returns {string} - Generated OTP
 */
function generateOTPCode(length = OTP_LENGTH) {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}

/**
 * Generate a unique ID for the OTP
 * @returns {string} - Unique ID
 */
function generateOTPId() {
  return `otp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a new master OTP
 * @param {string} generatedBy - Admin username who generated the OTP
 * @param {string} purpose - Optional purpose/note for the OTP
 * @returns {Object} - OTP details
 */
function generateMasterOTP(generatedBy, purpose = '') {
  const otpCode = generateOTPCode();
  const otpId = generateOTPId();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  
  const otpData = {
    id: otpId,
    code: otpCode,
    generatedBy,
    purpose,
    generatedAt: new Date(),
    expiresAt,
    used: false,
  };
  
  activeOTPs.set(otpId, otpData);
  
  return {
    id: otpId,
    code: otpCode,
    expiresAt,
    expiryMinutes: OTP_EXPIRY_MINUTES,
  };
}

/**
 * Validate a master OTP
 * @param {string} otpCode - OTP code to validate
 * @returns {Object} - Validation result
 */
function validateMasterOTP(otpCode) {
  // Clean up expired OTPs first
  cleanupExpiredOTPs();
  
  // Find the OTP by code
  for (const [id, otpData] of activeOTPs.entries()) {
    if (otpData.code === otpCode) {
      // Check if expired
      if (new Date() > otpData.expiresAt) {
        activeOTPs.delete(id);
        return {
          valid: false,
          message: 'OTP has expired',
        };
      }
      
      // Check if already used
      if (otpData.used) {
        return {
          valid: false,
          message: 'OTP has already been used',
        };
      }
      
      // Mark as used
      otpData.used = true;
      activeOTPs.set(id, otpData);
      
      return {
        valid: true,
        message: 'OTP is valid',
        otpData: {
          id: otpData.id,
          generatedBy: otpData.generatedBy,
          purpose: otpData.purpose,
          generatedAt: otpData.generatedAt,
        },
      };
    }
  }
  
  return {
    valid: false,
    message: 'Invalid OTP code',
  };
}

/**
 * Get all active OTPs
 * @returns {Array} - List of active OTPs
 */
function getActiveMasterOTPs() {
  cleanupExpiredOTPs();
  
  const otps = [];
  for (const [id, otpData] of activeOTPs.entries()) {
    otps.push({
      id: otpData.id,
      code: otpData.code,
      generatedBy: otpData.generatedBy,
      purpose: otpData.purpose,
      generatedAt: otpData.generatedAt,
      expiresAt: otpData.expiresAt,
      used: otpData.used,
      isExpired: new Date() > otpData.expiresAt,
    });
  }
  
  // Sort by generation time (newest first)
  return otps.sort((a, b) => b.generatedAt - a.generatedAt);
}

/**
 * Revoke a specific OTP
 * @param {string} otpId - ID of the OTP to revoke
 * @returns {boolean} - Success status
 */
function revokeMasterOTP(otpId) {
  return activeOTPs.delete(otpId);
}

/**
 * Clean up expired OTPs from memory
 */
function cleanupExpiredOTPs() {
  const now = new Date();
  for (const [id, otpData] of activeOTPs.entries()) {
    if (now > otpData.expiresAt) {
      activeOTPs.delete(id);
    }
  }
}

/**
 * Get statistics about OTP usage
 * @returns {Object} - Statistics
 */
function getOTPStats() {
  cleanupExpiredOTPs();
  
  let totalActive = 0;
  let totalUsed = 0;
  let totalUnused = 0;
  
  for (const [id, otpData] of activeOTPs.entries()) {
    totalActive++;
    if (otpData.used) {
      totalUsed++;
    } else {
      totalUnused++;
    }
  }
  
  return {
    totalActive,
    totalUsed,
    totalUnused,
  };
}

// Start automatic cleanup interval
setInterval(cleanupExpiredOTPs, CLEANUP_INTERVAL_MS);

module.exports = {
  generateMasterOTP,
  validateMasterOTP,
  getActiveMasterOTPs,
  revokeMasterOTP,
  getOTPStats,
  OTP_EXPIRY_MINUTES,
};
