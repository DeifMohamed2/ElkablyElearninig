const mongoose = require('mongoose');

const quizModuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Module name is required'],
      trim: true,
      maxlength: [100, 'Module name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    code: {
      type: String,
      required: [true, 'Module code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [20, 'Code cannot exceed 20 characters'],
      match: [
        /^[A-Z0-9-]+$/,
        'Code can only contain uppercase letters, numbers, and hyphens',
      ],
    },
    testType: {
      type: String,
      required: [true, 'Test type is required'],
      enum: {
        values: ['EST', 'SAT', 'ACT'],
        message: 'Test type must be EST, SAT, or ACT',
      },
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
    },
    icon: {
      type: String,
      default: 'fa-folder',
      trim: true,
    },
    color: {
      type: String,
      default: '#dc2626',
      trim: true,
      match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color'],
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
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

// Virtual for quiz count (populated dynamically)
quizModuleSchema.virtual('quizzes', {
  ref: 'Quiz',
  localField: '_id',
  foreignField: 'module',
  match: { isDeleted: false },
});

// Virtual for quiz count
quizModuleSchema.virtual('quizCount', {
  ref: 'Quiz',
  localField: '_id',
  foreignField: 'module',
  match: { isDeleted: false },
  count: true,
});

// Index for efficient queries
quizModuleSchema.index({ testType: 1, status: 1, order: 1 });
quizModuleSchema.index({ code: 1 });
quizModuleSchema.index({ isDeleted: 1 });

// Pre-find middleware to exclude deleted modules by default
quizModuleSchema.pre(/^find/, function (next) {
  if (this.getQuery().isDeleted === undefined) {
    this.where({ isDeleted: false });
  }
  next();
});

// Static method to generate unique module code
quizModuleSchema.statics.generateModuleCode = async function (testType = 'EST') {
  const prefix = testType.substring(0, 3).toUpperCase();
  const count = await this.countDocuments({});
  const randomNum = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  const code = `MOD-${prefix}-${count + 1}${randomNum}`;
  
  // Check if code already exists
  const existing = await this.findOne({ code });
  if (existing) {
    return this.generateModuleCode(testType);
  }
  
  return code;
};

// Static method to get module statistics
quizModuleSchema.statics.getModuleStats = async function () {
  const Quiz = mongoose.model('Quiz');
  
  const [totalModules, activeModules, modulesByType] = await Promise.all([
    this.countDocuments({ isDeleted: false }),
    this.countDocuments({ isDeleted: false, status: 'active' }),
    this.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$testType', count: { $sum: 1 } } },
    ]),
  ]);

  const typeStats = {};
  modulesByType.forEach((item) => {
    typeStats[item._id] = item.count;
  });

  return {
    total: totalModules,
    active: activeModules,
    inactive: totalModules - activeModules,
    byType: {
      EST: typeStats.EST || 0,
      SAT: typeStats.SAT || 0,
      ACT: typeStats.ACT || 0,
    },
  };
};

// Instance method for soft delete
quizModuleSchema.methods.softDelete = async function (adminId, reason) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = adminId;
  this.deleteReason = reason;
  return this.save();
};

// Instance method for restore
quizModuleSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  this.deleteReason = undefined;
  return this.save();
};

const QuizModule = mongoose.model('QuizModule', quizModuleSchema);

module.exports = QuizModule;
