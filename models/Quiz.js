const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Quiz title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    code: {
      type: String,
      required: [true, 'Quiz code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [20, 'Code cannot exceed 20 characters'],
      match: [
        /^[A-Z0-9-]+$/,
        'Code can only contain uppercase letters, numbers, and hyphens',
      ],
    },
    thumbnail: {
      url: {
        type: String,
        trim: true,
      },
      publicId: {
        type: String,
        trim: true,
      },
      originalName: {
        type: String,
        trim: true,
      },
    },
    // Support for multiple question banks
    questionBanks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuestionBank',
      },
    ],
    // Legacy field - kept for backward compatibility
    questionBank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionBank',
    },
    selectedQuestions: [
      {
        question: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Question',
          required: true,
        },
        // Track which bank this question came from
        sourceBank: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'QuestionBank',
          required: true,
        },
        order: {
          type: Number,
          required: true,
          min: 1,
        },
        points: {
          type: Number,
          required: true,
          min: 1,
          default: 1,
        },
      },
    ],
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [0, 'Duration must be 0 or greater (0 = no time limit)'],
      max: [480, 'Duration cannot exceed 480 minutes'],
    },
    testType: {
      type: String,
      required: [true, 'Test type is required'],
      enum: {
        values: ['EST', 'SAT', 'ACT'],
        message: 'Test type must be EST, SAT, or ACT',
      },
    },
    difficulty: {
      type: String,
      required: [true, 'Difficulty level is required'],
      enum: {
        values: ['easy', 'medium', 'hard'],
        message: 'Difficulty must be easy, medium, or hard',
      },
    },
    passingScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 60,
    },
    maxAttempts: {
      type: Number,
      min: 1,
      max: 10,
      default: 3,
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: [2000, 'Instructions cannot exceed 2000 characters'],
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, 'Tag cannot exceed 50 characters'],
      },
    ],
    shuffleQuestions: {
      type: Boolean,
      default: false,
    },
    shuffleOptions: {
      type: Boolean,
      default: false,
    },
    showCorrectAnswers: {
      type: Boolean,
      default: true,
    },
    showResults: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'inactive', 'archived'],
      default: 'draft',
    },
    // Soft delete fields
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    deleteReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Delete reason cannot exceed 500 characters'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for total questions
quizSchema.virtual('totalQuestions').get(function () {
  return this.selectedQuestions ? this.selectedQuestions.length : 0;
});

// Virtual for total points
quizSchema.virtual('totalPoints').get(function () {
  if (!this.selectedQuestions) return 0;
  return this.selectedQuestions.reduce(
    (total, q) => total + (q.points || 1),
    0
  );
});

// Virtual for average difficulty
quizSchema.virtual('averageDifficulty').get(function () {
  if (!this.selectedQuestions || this.selectedQuestions.length === 0)
    return 'medium';

  // This would need to be populated with actual question difficulties
  // For now, return the quiz's difficulty level
  return this.difficulty;
});

// Index for better performance
quizSchema.index({ questionBank: 1 });
quizSchema.index({ status: 1 });
quizSchema.index({ createdBy: 1 });
quizSchema.index({ createdAt: -1 });
quizSchema.index({ isDeleted: 1 });
quizSchema.index({ deletedAt: -1 });

// Instance method to validate quiz
quizSchema.methods.validateQuiz = function () {
  const errors = [];

  if (!this.selectedQuestions || this.selectedQuestions.length === 0) {
    errors.push('Quiz must have at least one question');
  }

  if (this.selectedQuestions && this.selectedQuestions.length > 100) {
    errors.push('Quiz cannot have more than 100 questions');
  }

  if (
    this.duration &&
    this.duration > 0 &&
    this.selectedQuestions &&
    this.selectedQuestions.length > 0
  ) {
    const estimatedTime = this.selectedQuestions.length * 2; // 2 minutes per question
    if (this.duration < estimatedTime * 0.5) {
      errors.push('Duration seems too short for the number of questions');
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
};

// Static method to get quiz statistics
quizSchema.statics.getQuizStats = async function () {
  const stats = await this.aggregate([
    {
      $match: { isDeleted: { $ne: true } },
    },
    {
      $group: {
        _id: null,
        totalQuizzes: { $sum: 1 },
        activeQuizzes: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
        },
        draftQuizzes: {
          $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] },
        },
        averageQuestions: { $avg: { $size: '$selectedQuestions' } },
        averageDuration: { $avg: '$duration' },
      },
    },
  ]);

  // Get trash count separately using aggregate to bypass pre-hook
  const trashResult = await this.aggregate([
    { $match: { isDeleted: true } },
    { $count: 'count' },
  ]);
  const trashCount = trashResult.length > 0 ? trashResult[0].count : 0;

  return stats.length > 0
    ? {
        ...stats[0],
        trashQuizzes: trashCount,
      }
    : {
        totalQuizzes: 0,
        activeQuizzes: 0,
        draftQuizzes: 0,
        trashQuizzes: trashCount,
        averageQuestions: 0,
        averageDuration: 0,
      };
};

// Static method to get quizzes by difficulty
quizSchema.statics.getQuizzesByDifficulty = async function () {
  return await this.aggregate([
    {
      $group: {
        _id: '$difficulty',
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
};

// Static method to generate unique quiz code
quizSchema.statics.generateQuizCode = async function () {
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate a code with format: QUIZ-YYYYMMDD-XXX
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');

    code = `QUIZ-${year}${month}${day}-${random}`;

    // Check if code already exists
    const existingQuiz = await this.findOne({ code });
    if (!existingQuiz) {
      isUnique = true;
    }

    attempts++;
  }

  if (!isUnique) {
    throw new Error('Unable to generate unique quiz code');
  }

  return code;
};

// Instance method to check if user can attempt quiz
quizSchema.methods.canUserAttempt = function (userAttempts) {
  if (!userAttempts || userAttempts.length === 0) {
    return {
      canAttempt: true,
      reason: 'First attempt',
      attemptsLeft: this.maxAttempts,
    };
  }

  const userQuizAttempt = userAttempts.find(
    (attempt) => attempt.quiz.toString() === this._id.toString()
  );

  if (!userQuizAttempt) {
    return {
      canAttempt: true,
      reason: 'First attempt',
      attemptsLeft: this.maxAttempts,
    };
  }

  // Check if user has already passed the quiz
  const passedAttempt = userQuizAttempt.attempts.find(
    (attempt) => attempt.status === 'completed' && attempt.passed === true
  );

  if (passedAttempt) {
    return {
      canAttempt: false,
      reason: 'You have already passed this quiz',
      attemptsLeft: 0,
    };
  }

  // Count only completed attempts (not in-progress ones)
  const completedAttempts = userQuizAttempt.attempts.filter(
    (attempt) =>
      attempt.status === 'completed' ||
      attempt.status === 'timeout' ||
      attempt.status === 'abandoned'
  ).length;

  if (completedAttempts >= this.maxAttempts) {
    return {
      canAttempt: false,
      reason: 'Maximum attempts reached',
      attemptsLeft: 0,
    };
  }

  return {
    canAttempt: true,
    reason: 'Can attempt',
    attemptsLeft: this.maxAttempts - completedAttempts,
  };
};

// Instance method to get user's best score
quizSchema.methods.getUserBestScore = function (userAttempts) {
  if (!userAttempts || userAttempts.length === 0) {
    return null;
  }

  const userQuizAttempt = userAttempts.find(
    (attempt) => attempt.quiz.toString() === this._id.toString()
  );

  return userQuizAttempt ? userQuizAttempt.bestScore : null;
};

// Instance method to get user's attempt history
quizSchema.methods.getUserAttemptHistory = function (userAttempts) {
  if (!userAttempts || userAttempts.length === 0) {
    return [];
  }

  const userQuizAttempt = userAttempts.find(
    (attempt) => attempt.quiz.toString() === this._id.toString()
  );

  return userQuizAttempt ? userQuizAttempt.attempts : [];
};

// Instance method to get active attempt for user
quizSchema.methods.getActiveAttempt = function (userAttempts) {
  if (!userAttempts || userAttempts.length === 0) {
    return null;
  }

  const userQuizAttempt = userAttempts.find(
    (attempt) => attempt.quiz.toString() === this._id.toString()
  );

  if (!userQuizAttempt) {
    return null;
  }

  return userQuizAttempt.attempts.find(
    (attempt) => attempt.status === 'in_progress'
  );
};

// Pre-save middleware
quizSchema.pre('save', function (next) {
  // Ensure selectedQuestions array is properly ordered
  if (this.selectedQuestions && this.selectedQuestions.length > 0) {
    this.selectedQuestions.forEach((q, index) => {
      q.order = index + 1;
    });
  }

  next();
});

// Instance method for soft delete
quizSchema.methods.softDelete = async function (deletedBy, reason = '') {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.deleteReason = reason;
  this.status = 'archived'; // Change status to archived when soft deleted
  return await this.save();
};

// Instance method for hard delete (immediate delete)
quizSchema.methods.hardDelete = async function () {
  // Clean up related data before deletion
  await this.cleanupRelatedData();
  return await this.deleteOne();
};

// Instance method to cleanup related data
quizSchema.methods.cleanupRelatedData = async function () {
  const User = mongoose.model('User');

  // Remove quiz attempts from all users
  await User.updateMany(
    { 'quizAttempts.quiz': this._id },
    { $pull: { quizAttempts: { quiz: this._id } } }
  );

  // Remove quiz attempts from course content progress
  await User.updateMany(
    {},
    {
      $pull: {
        'enrolledCourses.$[].contentProgress.$[].quizAttempts': {},
      },
    }
  );

  console.log(`Cleaned up related data for quiz: ${this._id}`);
};

// Static method to find non-deleted quizzes
quizSchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, isDeleted: false });
};

// Static method to find deleted quizzes
quizSchema.statics.findDeleted = function (filter = {}) {
  // Use aggregate to bypass the pre-hook completely
  return this.aggregate([{ $match: { ...filter, isDeleted: true } }]);
};

// Static method to find quiz by ID regardless of deletion status
quizSchema.statics.findByIdAny = function (id) {
  // Use aggregate to bypass the pre-hook completely
  return this.aggregate([
    { $match: { _id: require('mongoose').Types.ObjectId(id) } },
  ]);
};

// Override find methods to exclude soft deleted by default
quizSchema.pre(/^find/, function (next) {
  // Only apply to queries that don't explicitly check isDeleted
  // Skip if this is a findDeleted call or if isDeleted is already specified
  if (this.getQuery().isDeleted === undefined && !this.op.includes('Deleted')) {
    this.find({ isDeleted: { $ne: true } });
  }
  next();
});

// Override countDocuments to exclude soft deleted by default
quizSchema.pre('countDocuments', function (next) {
  if (this.getQuery().isDeleted === undefined) {
    this.find({ isDeleted: { $ne: true } });
  }
  next();
});

// Pre-remove middleware to clean up related data
quizSchema.pre('remove', async function (next) {
  // Here you could add logic to clean up related quiz attempts, results, etc.
  next();
});

module.exports = mongoose.model('Quiz', quizSchema);
