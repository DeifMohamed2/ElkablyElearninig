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
 * Bearer JWT for student mobile. Validates User.sessionToken (single-device).
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

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded || decoded.type !== 'student' || !decoded.userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user || user.role !== 'student') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    if (!user.sessionToken || user.sessionToken !== decoded.sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }

    req.studentMobileUser = user;
    req.studentMobileToken = decoded;
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
  JWT_SECRET,
  verifyToken,
};
