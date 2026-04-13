const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const OtpChallenge = require('../models/OtpChallenge');
const {
  JWT_SECRET,
} = require('../middlewares/studentMobileAuth');
const {
  createOrRotateChallenge,
  verifyChallengeCode,
  assertVerifiedAndConsume,
  assertForgotVerifiedAndConsume,
  buildRecipientKey,
  hashCode,
} = require('../utils/otpChallengeService');
const whatsappSMSNotificationService = require('../utils/whatsappSMSNotificationService');

const JWT_EXPIRES_IN = process.env.STUDENT_JWT_EXPIRES_IN || '350d';

const signStudentToken = (user, sessionToken) =>
  jwt.sign(
    {
      type: 'student',
      userId: user._id.toString(),
      sessionToken,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

async function sendStudentToOnlineSystem(studentData) {
  try {
    const apiUrl = 'http://82.25.101.207:8400/createOnlineStudent';
    const apiKey = 'SNFIDNWL11SGNDWJD@##SSNWLSGNE!21121';

    const payload = {
      Username: `${studentData.firstName} ${studentData.lastName}`,
      phone: studentData.studentNumber,
      parentPhone: studentData.parentNumber,
      phoneCountryCode: studentData.studentCountryCode.replace('+', ''),
      parentPhoneCountryCode: studentData.parentCountryCode.replace('+', ''),
      email: studentData.studentEmail,
      schoolName: studentData.schoolName,
      Grade: studentData.grade,
      GradeLevel: studentData.grade,
      Code: 'K' + studentData.studentCode,
      apiKey: apiKey,
    };

    const response = await axios.post(apiUrl, payload);
    return response.data;
  } catch (error) {
    console.error('Error sending student to online system:', error.message);
    return { success: false, error: error.message };
  }
}

const buildProfilePayload = (user) => ({
  id: user._id,
  name: user.name,
  firstName: user.firstName,
  lastName: user.lastName,
  studentEmail: user.studentEmail,
  username: user.username,
  grade: user.grade,
  schoolName: user.schoolName,
  studentCode: user.studentCode,
  studentNumber: user.studentNumber,
  studentCountryCode: user.studentCountryCode,
  parentNumber: user.parentNumber,
  parentCountryCode: user.parentCountryCode,
  englishTeacher: user.englishTeacher,
  isActive: user.isActive,
  isCompleteData: user.isCompleteData,
  profilePicture: user.profilePicture || null,
  preferences: user.preferences || {},
});

/**
 * POST /api/student/login
 */
const login = async (req, res) => {
  try {
    const { email, password, rememberMe, fcmToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email/phone/username and password',
      });
    }

    const inputValue = String(email).trim();
    let user = null;

    if (inputValue.includes('@')) {
      user = await User.findOne({ studentEmail: inputValue.toLowerCase() });
    } else if (inputValue.match(/^[\d\s\-\(\)\+]+$/)) {
      user = await User.findOne({
        $or: [
          { studentNumber: inputValue },
          {
            $expr: {
              $eq: [
                { $concat: ['$studentCountryCode', '$studentNumber'] },
                inputValue,
              ],
            },
          },
        ],
      });
    } else {
      user = await User.findOne({
        username: { $regex: new RegExp(`^${inputValue}$`, 'i') },
      });
    }

    if (!user || user.role !== 'student') {
      return res.status(401).json({
        success: false,
        message: 'Invalid email, phone number, or username',
      });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch && user.isCompleteData === false) {
      if (user.studentCode && user.studentCode === String(password).trim()) {
        // allow student code login for incomplete profiles
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid email, phone number, or username',
        });
      }
    } else if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email, phone number, or username',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message:
          'Your account is pending approval. Please contact the administrator or wait for approval.',
      });
    }

    const mobileSessionToken = crypto.randomBytes(32).toString('hex');
    user.mobileSessionToken = mobileSessionToken;

    const trimmedFcm =
      fcmToken != null && String(fcmToken).trim() !== ''
        ? String(fcmToken).trim()
        : null;
    if (trimmedFcm) {
      user.studentFcmToken = trimmedFcm;
      user.studentFcmTokenUpdatedAt = new Date();
    }

    await user.save();

    const token = signStudentToken(user, mobileSessionToken);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        requiresCompleteData: user.isCompleteData === false,
        user: buildProfilePayload(user),
      },
    });
  } catch (error) {
    console.error('Student mobile login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const user = req.studentMobileUser;
    const mobileTok = user.mobileSessionToken || user.sessionToken;
    if (!mobileTok) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }
    const token = signStudentToken(user, mobileTok);
    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: { token },
    });
  } catch (error) {
    console.error('Student mobile refresh error:', error);
    return res.status(500).json({
      success: false,
      message: 'Token refresh failed',
    });
  }
};

const logout = async (req, res) => {
  try {
    const user = req.studentMobileUser;
    user.mobileSessionToken = null;
    user.studentFcmToken = null;
    user.studentFcmTokenUpdatedAt = null;
    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Student mobile logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
};

const updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required',
      });
    }
    const user = req.studentMobileUser;
    user.studentFcmToken = fcmToken;
    user.studentFcmTokenUpdatedAt = new Date();
    await user.save();
    return res.status(200).json({
      success: true,
      message: 'FCM token updated',
    });
  } catch (error) {
    console.error('Student FCM update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update FCM token',
    });
  }
};

/** POST /register/send-otp */
const registerSendOtp = async (req, res) => {
  try {
    const { studentCountryCode, studentNumber } = req.body;
    if (!studentCountryCode || !studentNumber) {
      return res.status(400).json({
        success: false,
        message: 'Student country code and student number are required',
      });
    }
    const clean = String(studentNumber).replace(/\D/g, '');
    const meta = await createOrRotateChallenge({
      purpose: 'register_student',
      countryCode: studentCountryCode,
      phoneDigits: clean,
      messagePrefix: 'Your ELKABLY verification code is',
    });
    return res.json({
      success: true,
      message: 'OTP sent successfully',
      expiresIn: meta.expiresIn,
      attemptsRemaining: meta.attemptsRemaining,
    });
  } catch (e) {
    if (e.status === 429) {
      return res.status(429).json({
        success: false,
        message: e.message,
        blockedUntil: e.blockedUntil,
        retryAfter: e.retryAfter,
      });
    }
    console.error('registerSendOtp:', e);
    return res.status(500).json({
      success: false,
      message: e.message || 'Failed to send OTP',
    });
  }
};

/** POST /register/verify-otp */
const registerVerifyOtp = async (req, res) => {
  try {
    const { studentCountryCode, studentNumber, otp } = req.body;
    if (!studentCountryCode || !studentNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Country code, student number, and OTP are required',
      });
    }
    const clean = String(studentNumber).replace(/\D/g, '');
    await verifyChallengeCode({
      purpose: 'register_student',
      countryCode: studentCountryCode,
      phoneDigits: clean,
      code: otp,
    });
    return res.json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({
      success: false,
      message: e.message || 'Verification failed',
    });
  }
};

/** POST /register */
const register = async (req, res) => {
  const {
    firstName,
    lastName,
    studentNumber,
    studentCountryCode,
    parentNumber,
    parentCountryCode,
    studentEmail,
    username,
    schoolName,
    grade,
    englishTeacher,
    password,
    password2,
    howDidYouKnow,
  } = req.body;

  const errors = [];

  if (
    !firstName ||
    !lastName ||
    !studentNumber ||
    !studentCountryCode ||
    !parentNumber ||
    !parentCountryCode ||
    !studentEmail ||
    !username ||
    !schoolName ||
    !grade ||
    !englishTeacher ||
    !password ||
    !password2 ||
    !howDidYouKnow
  ) {
    errors.push('Please fill in all required fields');
  }

  const cleanStudent = String(studentNumber).replace(/\D/g, '');

  // duplicate validation (aligned with registerUser)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (studentEmail && !emailRegex.test(studentEmail)) {
    errors.push('Please enter a valid email address');
  }
  if (password !== password2) {
    errors.push('Passwords do not match');
  }
  if (password && password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }
  const validCountryCodes = ['+966', '+20', '+971', '+965'];
  if (studentCountryCode && !validCountryCodes.includes(studentCountryCode)) {
    errors.push('Please select a valid country code for student number');
  }
  if (parentCountryCode && !validCountryCodes.includes(parentCountryCode)) {
    errors.push('Please select a valid country code for parent number');
  }
  const phoneLengthStandards = {
    '+966': 9,
    '+20': 11,
    '+971': 9,
    '+965': 8,
  };
  if (
    studentNumber &&
    parentNumber &&
    studentNumber.trim() === parentNumber.trim() &&
    studentCountryCode === parentCountryCode
  ) {
    errors.push('Student and parent phone numbers cannot be the same');
  }
  const cleanStudentDigits = studentNumber.replace(/[^\d]/g, '');
  const cleanParentDigits = parentNumber.replace(/[^\d]/g, '');
  if (studentCountryCode && phoneLengthStandards[studentCountryCode]) {
    if (cleanStudentDigits.length !== phoneLengthStandards[studentCountryCode]) {
      errors.push(
        `Student number must be ${phoneLengthStandards[studentCountryCode]} digits for the selected country`,
      );
    }
  }
  if (parentCountryCode && phoneLengthStandards[parentCountryCode]) {
    if (cleanParentDigits.length !== phoneLengthStandards[parentCountryCode]) {
      errors.push(
        `Parent number must be ${phoneLengthStandards[parentCountryCode]} digits for the selected country`,
      );
    }
  }

    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    try {
      const [existingEmail, existingUsername, existingStudentNumber] =
      await Promise.all([
        User.findOne({ studentEmail: studentEmail.toLowerCase() }),
        User.findOne({ username: username.trim() }),
        User.findOne({ studentNumber: studentNumber.trim() }),
      ]);

    if (existingEmail) errors.push('Student email is already registered');
    if (existingUsername) errors.push('Username is already taken');
    if (existingStudentNumber) errors.push('Student number is already registered');

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    try {
      await assertVerifiedAndConsume({
        purpose: 'register_student',
        countryCode: studentCountryCode,
        phoneDigits: cleanStudent,
      });
    } catch (e) {
      return res.status(400).json({
        success: false,
        message:
          e.message || 'Student phone must be verified with OTP before registration',
      });
    }

    const newUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      studentNumber: studentNumber.trim(),
      studentCountryCode: studentCountryCode,
      parentNumber: parentNumber.trim(),
      parentCountryCode: parentCountryCode,
      studentEmail: studentEmail.toLowerCase().trim(),
      username: username.trim(),
      schoolName: schoolName.trim(),
      grade,
      englishTeacher: englishTeacher.trim(),
      password,
      howDidYouKnow: howDidYouKnow.trim(),
      isActive: true,
      isCompleteData: true,
    });

    const savedUser = await newUser.save();

    try {
      await sendStudentToOnlineSystem(savedUser);
    } catch (apiError) {
      console.error('Online sync:', apiError);
    }

    try {
      await whatsappSMSNotificationService.sendWelcomeMessage(savedUser._id);
    } catch (wErr) {
      console.error('WhatsApp welcome:', wErr);
    }

    const mobileSessionToken = crypto.randomBytes(32).toString('hex');
    savedUser.mobileSessionToken = mobileSessionToken;
    await savedUser.save();
    const token = signStudentToken(savedUser, mobileSessionToken);

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token,
        requiresCompleteData: false,
        user: buildProfilePayload(savedUser),
      },
    });
  } catch (error) {
    console.error('Mobile register error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Registration failed',
    });
  }
};

/** POST /forgot-password/initiate — resolve account and send OTP in one step */
const forgotPasswordInitiate = async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || String(identifier).trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid phone number, username, or email',
      });
    }

    const inputValue = String(identifier).trim();
    let user = null;

    if (inputValue.includes('@')) {
      user = await User.findOne({ studentEmail: inputValue.toLowerCase() });
    } else if (inputValue.match(/^[\d\s\-\(\)\+]+$/)) {
      user = await User.findOne({
        $or: [
          { studentNumber: inputValue },
          {
            $expr: {
              $eq: [
                { $concat: ['$studentCountryCode', '$studentNumber'] },
                inputValue,
              ],
            },
          },
        ],
      });
    } else {
      user = await User.findOne({
        username: { $regex: new RegExp(`^${inputValue}$`, 'i') },
      });
    }

    if (!user || user.role !== 'student') {
      return res.status(404).json({
        success: false,
        message:
          'Account not found. Please check your phone number, username, or email.',
      });
    }

    const clean = String(user.studentNumber).replace(/\D/g, '');
    const meta = await createOrRotateChallenge({
      purpose: 'forgot_password',
      countryCode: user.studentCountryCode,
      phoneDigits: clean,
      userId: user._id,
      messagePrefix: 'Your ELKABLY password reset code is',
    });

    return res.json({
      success: true,
      message: 'OTP sent to your registered phone number.',
      userId: user._id.toString(),
      phoneNumber: user.studentNumber,
      countryCode: user.studentCountryCode,
      expiresIn: meta.expiresIn,
      attemptsRemaining: meta.attemptsRemaining,
    });
  } catch (e) {
    if (e.status === 429) {
      return res.status(429).json({
        success: false,
        message: e.message,
        blockedUntil: e.blockedUntil,
        retryAfter: e.retryAfter,
      });
    }
    console.error('forgotPasswordInitiate:', e);
    return res.status(500).json({
      success: false,
      message: e.message || 'An error occurred. Please try again.',
    });
  }
};

/** POST /forgot-password/verify-otp */
const forgotPasswordVerifyOtp = async (req, res) => {
  try {
    const { userId, phoneNumber, countryCode, otp } = req.body;
    if (!userId || !phoneNumber || !countryCode || !otp) {
      return res.status(400).json({
        success: false,
        message: 'userId, phone, country code and OTP are required',
      });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid account' });
    }
    const clean = String(phoneNumber).replace(/\D/g, '');
    await verifyChallengeCode({
      purpose: 'forgot_password',
      countryCode,
      phoneDigits: clean,
      code: otp,
    });

    return res.json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({
      success: false,
      message: e.message || 'Verification failed',
    });
  }
};

/** POST /reset-password */
const resetPassword = async (req, res) => {
  try {
    const { userId, newPassword, confirmPassword } = req.body;
    if (!userId || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'userId, new password and confirm password are required',
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match',
      });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== 'student') {
      return res.status(400).json({
        success: false,
        message: 'Invalid account',
      });
    }

    await assertForgotVerifiedAndConsume(user._id);

    user.password = newPassword;
    user.sessionToken = null;
    user.mobileSessionToken = null;
    await user.save();

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now log in.',
    });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({
      success: false,
      message: e.message || 'Password reset failed',
    });
  }
};

/** POST /complete-data (JWT, incomplete student only) */
const completeStudentData = async (req, res) => {
  try {
    const user = req.studentMobileUser;
    if (user.isCompleteData) {
      return res.status(400).json({
        success: false,
        message: 'Profile is already complete',
      });
    }

    const {
      firstName,
      lastName,
      studentNumber,
      studentCountryCode,
      parentNumber,
      parentCountryCode,
      studentEmail,
      username,
      schoolName,
      grade,
      englishTeacher,
      password,
      password2,
      howDidYouKnow,
    } = req.body;

    const errors = [];

    if (
      !firstName ||
      !lastName ||
      !studentNumber ||
      !studentCountryCode ||
      !parentNumber ||
      !parentCountryCode ||
      !studentEmail ||
      !username ||
      !schoolName ||
      !grade ||
      !englishTeacher ||
      !password ||
      !password2 ||
      !howDidYouKnow
    ) {
      errors.push('Please fill in all required fields');
    }

    if (password !== password2) {
      errors.push('Passwords do not match');
    }
    if (password && password.length < 5) {
      errors.push('Password must be at least 5 characters long');
    }

    const existingEmail = await User.findOne({
      studentEmail: studentEmail.toLowerCase(),
    });
    if (existingEmail && existingEmail._id.toString() !== user._id.toString()) {
      errors.push('Email is already registered');
    }

    const existingUsername = await User.findOne({
      username: username.toLowerCase(),
    });
    if (existingUsername && existingUsername._id.toString() !== user._id.toString()) {
      errors.push('Username is already taken');
    }

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }

    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.studentNumber = studentNumber.trim();
    user.studentCountryCode = studentCountryCode;
    user.parentNumber = parentNumber.trim();
    user.parentCountryCode = parentCountryCode;
    user.studentEmail = studentEmail.toLowerCase().trim();
    user.username = username.toLowerCase().trim();
    user.schoolName = schoolName.trim();
    user.grade = grade;
    user.englishTeacher = englishTeacher.trim();
    user.password = password;
    user.howDidYouKnow = howDidYouKnow.trim();
    user.isCompleteData = true;

    await user.save();

    const fresh = await User.findById(user._id);
    let mobileTok = fresh.mobileSessionToken;
    if (!mobileTok) {
      mobileTok = crypto.randomBytes(32).toString('hex');
      fresh.mobileSessionToken = mobileTok;
      await fresh.save();
    }
    const token = signStudentToken(fresh, mobileTok);

    return res.json({
      success: true,
      message: 'Profile completed successfully',
      data: {
        token,
        requiresCompleteData: false,
        user: buildProfilePayload(fresh),
      },
    });
  } catch (error) {
    console.error('completeStudentData mobile:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to complete profile',
    });
  }
};

/** Profile phone OTP — DB (mobile) */
const profileSendOtp = async (req, res) => {
  try {
    const { phoneNumber, countryCode } = req.body;
    if (!phoneNumber || !countryCode) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and country code are required',
      });
    }

    const validCountryCodes = ['+966', '+20', '+971', '+965'];
    if (!validCountryCodes.includes(countryCode)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid country code',
      });
    }

    const user = req.studentMobileUser;
    const clean = String(phoneNumber).replace(/\D/g, '');
    const phoneLengthStandards = {
      '+966': 9,
      '+20': 11,
      '+971': 9,
      '+965': 8,
    };
    const expectedLen = phoneLengthStandards[countryCode];
    if (clean.length !== expectedLen) {
      return res.status(400).json({
        success: false,
        message: `Student number must be ${expectedLen} digits for the selected country`,
      });
    }

    const taken = await User.findOne({
      studentNumber: clean,
      _id: { $ne: user._id },
    })
      .select('_id')
      .lean();
    if (taken) {
      return res.status(400).json({
        success: false,
        message: 'This phone number is already registered to another account',
      });
    }

    const parentDigits = String(user.parentNumber || '').replace(/\D/g, '');
    if (
      user.parentCountryCode === countryCode &&
      parentDigits &&
      parentDigits === clean
    ) {
      return res.status(400).json({
        success: false,
        message: 'Student and parent phone numbers cannot be the same',
      });
    }

    const recipientKey = `profile_phone:${user._id}:${countryCode}:${clean}`;

    // reuse createOrRotateChallenge by extending - simpler: inline purpose in model
    const otpChallengeService = require('../utils/otpChallengeService');

    const code = otpChallengeService.generateOtp();
    const codeHash = otpChallengeService.hashCode(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OtpChallenge.deleteMany({
      purpose: 'profile_phone',
      recipientKey,
      consumed: false,
    });

    const doc = new OtpChallenge({
      purpose: 'profile_phone',
      recipientKey,
      userId: user._id,
      codeHash,
      expiresAt,
      sendCount: 1,
      verified: false,
    });
    await doc.save();

    const fullPhone = `${countryCode}${clean}`;
    await otpChallengeService.dispatchOtpMessage(
      fullPhone,
      `Your ELKABLY verification code is: ${code}. Valid for 5 minutes. Do not share this code.`,
    );

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      expiresIn: 300,
    });
  } catch (error) {
    console.error('profileSendOtp:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send OTP',
    });
  }
};

const profileVerifyOtp = async (req, res) => {
  try {
    const { phoneNumber, countryCode, otp } = req.body;
    if (!phoneNumber || !countryCode || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, country code and OTP are required',
      });
    }

    const validCountryCodes = ['+966', '+20', '+971', '+965'];
    if (!validCountryCodes.includes(countryCode)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid country code',
      });
    }

    const user = req.studentMobileUser;
    const clean = String(phoneNumber).replace(/\D/g, '');
    const phoneLengthStandards = {
      '+966': 9,
      '+20': 11,
      '+971': 9,
      '+965': 8,
    };
    const expectedLen = phoneLengthStandards[countryCode];
    if (clean.length !== expectedLen) {
      return res.status(400).json({
        success: false,
        message: `Student number must be ${expectedLen} digits for the selected country`,
      });
    }

    const recipientKey = `profile_phone:${user._id}:${countryCode}:${clean}`;

    const doc = await OtpChallenge.findOne({
      purpose: 'profile_phone',
      recipientKey,
      consumed: false,
    }).sort({ createdAt: -1 });

    if (!doc || doc.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired',
      });
    }

    if (hashCode(otp) !== doc.codeHash) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    const existingOther = await User.findOne({
      studentNumber: clean,
      _id: { $ne: user._id },
    }).select('_id');
    if (existingOther) {
      return res.status(400).json({
        success: false,
        message: 'This phone number is already registered to another account',
      });
    }

    const parentDigits = String(user.parentNumber || '').replace(/\D/g, '');
    if (
      user.parentCountryCode === countryCode &&
      parentDigits &&
      parentDigits === clean
    ) {
      return res.status(400).json({
        success: false,
        message: 'Student and parent phone numbers cannot be the same',
      });
    }

    doc.verified = true;
    doc.consumed = true;
    await doc.save();

    const fresh = await User.findById(user._id);
    fresh.studentCountryCode = countryCode;
    fresh.studentNumber = clean;
    await fresh.save();

    return res.json({
      success: true,
      message: 'Phone number verified and updated successfully',
      data: {
        studentCountryCode: fresh.studentCountryCode,
        studentNumber: fresh.studentNumber,
        user: buildProfilePayload(fresh),
      },
    });
  } catch (error) {
    console.error('profileVerifyOtp:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This phone number is already registered to another account',
      });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Verification failed',
    });
  }
};

module.exports = {
  login,
  refreshToken,
  logout,
  updateFcmToken,
  registerSendOtp,
  registerVerifyOtp,
  register,
  forgotPasswordInitiate,
  forgotPasswordVerifyOtp,
  resetPassword,
  completeStudentData,
  profileSendOtp,
  profileVerifyOtp,
  signStudentToken,
  buildProfilePayload,
};
