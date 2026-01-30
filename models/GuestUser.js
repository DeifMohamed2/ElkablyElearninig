const mongoose = require('mongoose');

const guestUserSchema = new mongoose.Schema(
  {
    // Basic Info
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    phoneCountryCode: {
      type: String,
      required: true,
      enum: ['+966', '+20', '+971', '+965'],
      default: '+966',
    },
    parentPhone: {
      type: String,
      required: [true, 'Parent phone number is required'],
      trim: true,
    },
    parentPhoneCountryCode: {
      type: String,
      required: true,
      enum: ['+966', '+20', '+971', '+965'],
      default: '+966',
    },

    // Session tracking
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sessionToken: {
      type: String,
      default: null,
    },
    sessionExpiresAt: {
      type: Date,
      default: function () {
        // Session expires after 24 hours
        return new Date(Date.now() + 24 * 60 * 60 * 1000);
      },
    },

    // Quiz Attempts - Similar to User model
    quizAttempts: [
      {
        quiz: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Quiz',
          required: true,
        },
        bestScore: {
          type: Number,
          default: 0,
          min: 0,
          max: 100,
        },
        totalAttempts: {
          type: Number,
          default: 0,
        },
        attempts: [
          {
            attemptNumber: {
              type: Number,
              required: true,
            },
            startedAt: {
              type: Date,
              required: true,
              default: Date.now,
            },
            completedAt: {
              type: Date,
            },
            expectedEnd: {
              type: Date,
            },
            score: {
              type: Number,
              min: 0,
              max: 100,
            },
            totalQuestions: {
              type: Number,
              min: 0,
            },
            correctAnswers: {
              type: Number,
              min: 0,
            },
            wrongAnswers: {
              type: Number,
              min: 0,
            },
            skippedAnswers: {
              type: Number,
              min: 0,
            },
            timeSpent: {
              type: Number, // in seconds
              min: 0,
            },
            passed: {
              type: Boolean,
              default: false,
            },
            status: {
              type: String,
              enum: ['in_progress', 'completed', 'timeout', 'abandoned'],
              default: 'in_progress',
            },
            // Store the order of questions (indices) for this attempt
            questionOrder: [Number],
            // Store the shuffled options for each question (if shuffleOptions is enabled)
            optionsOrder: [
              {
                questionIndex: Number,
                optionsIndices: [Number],
              },
            ],
            // Store answers for each question
            answers: [
              {
                questionId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: 'Question',
                },
                selectedAnswer: mongoose.Schema.Types.Mixed,
                isCorrect: Boolean,
                points: {
                  type: Number,
                  default: 0,
                },
                timeSpent: {
                  type: Number,
                  default: 0,
                },
              },
            ],
          },
        ],
      },
    ],

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },

    // IP and device tracking for analytics
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },

    // Notes from admin
    adminNotes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for full phone number
guestUserSchema.virtual('fullPhone').get(function () {
  return `${this.phoneCountryCode}${this.phone}`;
});

guestUserSchema.virtual('fullParentPhone').get(function () {
  return `${this.parentPhoneCountryCode}${this.parentPhone}`;
});

// Virtual for total quiz attempts
guestUserSchema.virtual('totalQuizAttempts').get(function () {
  return this.quizAttempts.reduce((total, qa) => total + qa.totalAttempts, 0);
});

// Virtual for average score
guestUserSchema.virtual('averageScore').get(function () {
  const scores = [];
  this.quizAttempts.forEach((qa) => {
    qa.attempts.forEach((attempt) => {
      if (attempt.status === 'completed' && attempt.score !== undefined) {
        scores.push(attempt.score);
      }
    });
  });
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
});

// Indexes
guestUserSchema.index({ email: 1 });
guestUserSchema.index({ phone: 1 });
guestUserSchema.index({ createdAt: -1 });
guestUserSchema.index({ 'quizAttempts.quiz': 1 });
guestUserSchema.index({ sessionExpiresAt: 1 });

// Static method to find or create guest user
guestUserSchema.statics.findOrCreateBySession = async function (sessionId, userData) {
  let guestUser = await this.findOne({ sessionId });
  
  if (!guestUser) {
    guestUser = await this.create({
      sessionId,
      ...userData,
    });
  }
  
  return guestUser;
};

// Static method to find by email (for returning guests)
guestUserSchema.statics.findByEmail = async function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to generate a unique session ID
guestUserSchema.statics.generateSessionId = function () {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `guest_${timestamp}_${randomPart}`;
};

// Instance method to start a quiz attempt
guestUserSchema.methods.startQuizAttempt = async function (quizId, duration) {
  // Find existing quiz attempt record
  let quizAttempt = this.quizAttempts.find(
    (qa) => qa.quiz.toString() === quizId.toString()
  );

  // If no existing record, create one
  if (!quizAttempt) {
    quizAttempt = {
      quiz: quizId,
      bestScore: 0,
      totalAttempts: 0,
      attempts: [],
    };
    this.quizAttempts.push(quizAttempt);
    // Get reference to the newly added item
    quizAttempt = this.quizAttempts[this.quizAttempts.length - 1];
  }

  // Check for in-progress attempt
  const inProgressAttempt = quizAttempt.attempts.find(
    (a) => a.status === 'in_progress'
  );

  if (inProgressAttempt) {
    // Check if the attempt has expired
    if (inProgressAttempt.expectedEnd && new Date() > inProgressAttempt.expectedEnd) {
      inProgressAttempt.status = 'timeout';
      inProgressAttempt.completedAt = new Date();
    } else {
      // Return existing in-progress attempt
      await this.save();
      return {
        isNewAttempt: false,
        attemptNumber: inProgressAttempt.attemptNumber,
        startedAt: inProgressAttempt.startedAt,
        expectedEnd: inProgressAttempt.expectedEnd,
      };
    }
  }

  // Create new attempt
  const attemptNumber = quizAttempt.attempts.length + 1;
  const startedAt = new Date();
  const expectedEnd = duration > 0
    ? new Date(startedAt.getTime() + duration * 60 * 1000)
    : null;

  const newAttempt = {
    attemptNumber,
    startedAt,
    expectedEnd,
    status: 'in_progress',
    answers: [],
    questionOrder: [],
    optionsOrder: [],
  };

  quizAttempt.attempts.push(newAttempt);
  quizAttempt.totalAttempts = quizAttempt.attempts.length;

  await this.save();

  return {
    isNewAttempt: true,
    attemptNumber,
    startedAt,
    expectedEnd,
    newAttempt: quizAttempt.attempts[quizAttempt.attempts.length - 1],
  };
};

// Instance method to get active attempt for a quiz
guestUserSchema.methods.getActiveAttempt = function (quizId) {
  const quizAttempt = this.quizAttempts.find(
    (qa) => qa.quiz.toString() === quizId.toString()
  );

  if (!quizAttempt) return null;

  return quizAttempt.attempts.find((a) => a.status === 'in_progress');
};

// Instance method to submit quiz attempt
guestUserSchema.methods.submitQuizAttempt = async function (
  quizId,
  answers,
  timeSpent
) {
  const quizAttempt = this.quizAttempts.find(
    (qa) => qa.quiz.toString() === quizId.toString()
  );

  if (!quizAttempt) {
    throw new Error('Quiz attempt not found');
  }

  const activeAttempt = quizAttempt.attempts.find(
    (a) => a.status === 'in_progress'
  );

  if (!activeAttempt) {
    throw new Error('No active attempt found');
  }

  // Calculate results
  const totalQuestions = answers.length;
  const correctAnswers = answers.filter((a) => a.isCorrect).length;
  const wrongAnswers = answers.filter((a) => !a.isCorrect && a.selectedAnswer !== null).length;
  const skippedAnswers = answers.filter((a) => a.selectedAnswer === null).length;
  const score = totalQuestions > 0
    ? Math.round((correctAnswers / totalQuestions) * 100)
    : 0;

  // Update attempt
  activeAttempt.completedAt = new Date();
  activeAttempt.status = 'completed';
  activeAttempt.score = score;
  activeAttempt.totalQuestions = totalQuestions;
  activeAttempt.correctAnswers = correctAnswers;
  activeAttempt.wrongAnswers = wrongAnswers;
  activeAttempt.skippedAnswers = skippedAnswers;
  activeAttempt.timeSpent = timeSpent;
  activeAttempt.answers = answers;

  // Check if passed (using default 60% passing score)
  activeAttempt.passed = score >= 60;

  // Update best score
  if (score > quizAttempt.bestScore) {
    quizAttempt.bestScore = score;
  }

  this.lastActiveAt = new Date();
  await this.save();

  return {
    score,
    totalQuestions,
    correctAnswers,
    wrongAnswers,
    skippedAnswers,
    passed: activeAttempt.passed,
    attemptNumber: activeAttempt.attemptNumber,
  };
};

// Instance method to get quiz attempt history
guestUserSchema.methods.getQuizAttemptHistory = function (quizId) {
  const quizAttempt = this.quizAttempts.find(
    (qa) => qa.quiz.toString() === quizId.toString()
  );

  if (!quizAttempt) return [];

  return quizAttempt.attempts
    .filter((a) => a.status === 'completed')
    .sort((a, b) => b.attemptNumber - a.attemptNumber);
};

// Static method to get guest user statistics
guestUserSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $facet: {
        totalGuests: [{ $count: 'count' }],
        activeGuests: [
          {
            $match: {
              lastActiveAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          },
          { $count: 'count' },
        ],
        totalAttempts: [
          { $unwind: '$quizAttempts' },
          { $unwind: '$quizAttempts.attempts' },
          { $count: 'count' },
        ],
        completedAttempts: [
          { $unwind: '$quizAttempts' },
          { $unwind: '$quizAttempts.attempts' },
          { $match: { 'quizAttempts.attempts.status': 'completed' } },
          { $count: 'count' },
        ],
        averageScore: [
          { $unwind: '$quizAttempts' },
          { $unwind: '$quizAttempts.attempts' },
          { $match: { 'quizAttempts.attempts.status': 'completed' } },
          {
            $group: {
              _id: null,
              avgScore: { $avg: '$quizAttempts.attempts.score' },
            },
          },
        ],
      },
    },
  ]);

  const result = stats[0];
  return {
    totalGuests: result.totalGuests[0]?.count || 0,
    activeGuests: result.activeGuests[0]?.count || 0,
    totalAttempts: result.totalAttempts[0]?.count || 0,
    completedAttempts: result.completedAttempts[0]?.count || 0,
    averageScore: Math.round(result.averageScore[0]?.avgScore || 0),
  };
};

// Static method to get all guests with pagination
guestUserSchema.statics.getGuestsWithPagination = async function (options = {}) {
  const {
    page = 1,
    limit = 20,
    search = '',
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const filter = {};
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const [guests, total] = await Promise.all([
    this.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('quizAttempts.quiz', 'title code testType')
      .lean({ virtuals: true }),
    this.countDocuments(filter),
  ]);

  return {
    guests,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
};

// Pre-save middleware to update lastActiveAt
guestUserSchema.pre('save', function (next) {
  if (this.isModified('quizAttempts')) {
    this.lastActiveAt = new Date();
  }
  next();
});

// Clean up expired sessions periodically
guestUserSchema.statics.cleanupExpiredSessions = async function () {
  const result = await this.updateMany(
    { sessionExpiresAt: { $lt: new Date() } },
    { $set: { isActive: false } }
  );
  return result.modifiedCount;
};

module.exports = mongoose.model('GuestUser', guestUserSchema);
