const mongoose = require('mongoose');

const brilliantStudentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  testType: {
    type: String,
    required: [true, 'Test type is required'],
    enum: {
      values: ['EST', 'DSAT', 'ACT'],
      message: 'Test type must be EST, DSAT, or ACT'
    }
  },
  
  score: {
    type: Number,
    required: [true, 'Score is required'],
    min: [0, 'Score cannot be negative'],
    validate: {
      validator: function(score) {
        if (this.testType === 'EST') {
          return score >= 0 && score <= 800;
        } else if (this.testType === 'DSAT') {
          return score >= 0 && score <= 1600;
        } else if (this.testType === 'ACT') {
          return score >= 0 && score <= 36;
        }
        return true;
      },
      message: 'Score must be within valid range for the test type'
    }
  },
  
  maxScore: {
    type: Number,
    required: [true, 'Maximum score is required'],
    validate: {
      validator: function(maxScore) {
        if (this.testType === 'EST') {
          return maxScore === 800;
        } else if (this.testType === 'DSAT') {
          return maxScore === 1600;
        } else if (this.testType === 'ACT') {
          return maxScore === 36;
        }
        return true;
      },
      message: 'Maximum score must match the test type'
    }
  },
  
  percentage: {
    type: Number,
    required: false,
    min: [0, 'Percentage cannot be negative'],
    max: [100, 'Percentage cannot exceed 100%']
  },
  
  image: {
    type: String,
    default: null,
    validate: {
      validator: function(image) {
        if (!image) return true;
        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(image);
      },
      message: 'Please provide a valid image URL'
    }
  },
  
  fallbackInitials: {
    type: String,
    required: [true, 'Fallback initials are required'],
    maxlength: [5, 'Initials cannot exceed 5 characters'],
    uppercase: true,
    trim: true
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  displayOrder: {
    type: Number,
    default: 0,
    min: [0, 'Display order cannot be negative']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted score display
brilliantStudentSchema.virtual('formattedScore').get(function() {
  return `${this.score}/${this.maxScore}`;
});

// Virtual for test type display name
brilliantStudentSchema.virtual('testTypeDisplayName').get(function() {
  const displayNames = {
    'EST': 'Egyptian Scholastic Test',
    'DSAT': 'Digital SAT',
    'ACT': 'American College Test'
  };
  return displayNames[this.testType] || this.testType;
});

// Indexes for better performance
brilliantStudentSchema.index({ testType: 1, isActive: 1, displayOrder: 1 });
brilliantStudentSchema.index({ percentage: -1 });
brilliantStudentSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate percentage
brilliantStudentSchema.pre('save', function(next) {
  if (this.score && this.maxScore) {
    this.percentage = Math.round((this.score / this.maxScore) * 100 * 100) / 100; // Round to 2 decimal places
  }
  next();
});

// Static method to get students by test type
brilliantStudentSchema.statics.getByTestType = function(testType, limit = 10) {
  return this.find({ 
    testType: testType, 
    isActive: true 
  })
  .sort({ displayOrder: 1, percentage: -1 })
  .limit(limit);
};

// Static method to get top performers
brilliantStudentSchema.statics.getTopPerformers = function(testType, limit = 5) {
  return this.find({ 
    testType: testType, 
    isActive: true 
  })
  .sort({ percentage: -1, score: -1 })
  .limit(limit);
};

// Static method to get statistics
brilliantStudentSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $match: { isActive: true }
    },
    {
      $group: {
        _id: '$testType',
        count: { $sum: 1 },
        avgPercentage: { $avg: '$percentage' },
        maxScore: { $max: '$score' },
        avgScore: { $avg: '$score' }
      }
    }
  ]);
  
  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      avgPercentage: Math.round(stat.avgPercentage * 100) / 100,
      maxScore: stat.maxScore,
      avgScore: Math.round(stat.avgScore * 100) / 100
    };
    return acc;
  }, {});
};

// Instance method to check if score is perfect
brilliantStudentSchema.methods.isPerfectScore = function() {
  return this.score === this.maxScore;
};

// Instance method to get score description
brilliantStudentSchema.methods.getScoreDescription = function() {
  if (this.isPerfectScore()) {
    return 'Perfect Score!';
  } else if (this.percentage >= 95) {
    return 'Outstanding!';
  } else if (this.percentage >= 90) {
    return 'Excellent!';
  } else if (this.percentage >= 85) {
    return 'Very Good!';
  } else {
    return 'Good Performance';
  }
};

module.exports = mongoose.model('BrilliantStudent', brilliantStudentSchema);
