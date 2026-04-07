const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET =
  process.env.STUDENT_JWT_SECRET ||
  process.env.JWT_SECRET ||
  'elkably-student-mobile-secret';

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

/**
 * Resolve student User from Authorization Bearer JWT, or null if absent/invalid.
 * Used by mobile API auth and by web Zoom routes that accept the same token.
 */
const resolveStudentFromMobileAuthHeader = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || decoded.type !== 'student' || !decoded.userId) return null;

    const user = await User.findById(decoded.userId);
    if (!user || user.role !== 'student') return null;

    const matchesMobile =
      user.mobileSessionToken &&
      user.mobileSessionToken === decoded.sessionToken;
    const matchesLegacy =
      !user.mobileSessionToken &&
      user.sessionToken &&
      user.sessionToken === decoded.sessionToken;

    if (!matchesMobile && !matchesLegacy) return null;

    return { user, decoded };
  } catch {
    return null;
  }
};

/**
 * Bearer JWT for student mobile. Validates User.mobileSessionToken (separate from
 * browser sessionToken so web + one mobile device can stay signed in).
 */
const authenticateStudentMobile = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const resolved = await resolveStudentFromMobileAuthHeader(req);
    if (!resolved) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    req.studentMobileUser = resolved.user;
    req.studentMobileToken = resolved.decoded;
    next();
  } catch (error) {
    console.error('Student mobile authentication error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

/**
 * Same as authenticateStudentMobile but allows students with incomplete profile
 * (only for /complete-data and similar).
 */
const authenticateStudentMobileAllowIncomplete = async (req, res, next) => {
  return authenticateStudentMobile(req, res, next);
};

module.exports = {
  authenticateStudentMobile,
  authenticateStudentMobileAllowIncomplete,
  resolveStudentFromMobileAuthHeader,
  JWT_SECRET,
  verifyToken,
};
