const mongoose = require('mongoose');

const QuestionBankSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    bankCode: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    subject: {
      type: String,
      default: 'Mathematics',
      trim: true,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    questions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
    }],
    tags: [{
      type: String,
      trim: true,
    }],
    totalQuestions: {
      type: Number,
      default: 0,
    },
    totalEasy: {
      type: Number,
      default: 0,
    },
    totalMedium: {
      type: Number,
      default: 0,
    },
    totalHard: {
      type: Number,
      default: 0,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for question count
QuestionBankSchema.virtual('questionCount').get(function() {
  return this.questions ? this.questions.length : 0;
});

// Generate bank code before saving
QuestionBankSchema.pre('save', async function(next) {
  if (this.isNew && !this.bankCode) {
    let bankCode;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      const prefix = this.name.substring(0, 3).toUpperCase();
      const timestamp = Date.now().toString().slice(-6);
      const randomNum = Math.floor(Math.random() * 100);
      bankCode = `QB${prefix}${timestamp}${randomNum}`;
      
      // Check if this bankCode already exists
      const existingBank = await mongoose.model('QuestionBank').findOne({ bankCode });
      if (!existingBank) {
        isUnique = true;
      }
      attempts++;
    }
    
    this.bankCode = bankCode;
  }
  next();
});

// Update question counts when questions are added/removed
QuestionBankSchema.methods.updateQuestionCounts = async function() {
  const Question = mongoose.model('Question');
  const counts = await Question.aggregate([
    { $match: { bank: this._id } },
    {
      $group: {
        _id: '$difficulty',
        count: { $sum: 1 }
      }
    }
  ]);

  this.totalQuestions = counts.reduce((sum, item) => sum + item.count, 0);
  this.totalEasy = counts.find(c => c._id === 'Easy')?.count || 0;
  this.totalMedium = counts.find(c => c._id === 'Medium')?.count || 0;
  this.totalHard = counts.find(c => c._id === 'Hard')?.count || 0;

  await this.save();
};

// Sync questions array with actual questions in database
QuestionBankSchema.methods.syncQuestionsArray = async function() {
  const Question = mongoose.model('Question');
  const actualQuestions = await Question.find({ bank: this._id }).select('_id');
  this.questions = actualQuestions.map(q => q._id);
  await this.save();
};

module.exports = mongoose.model('QuestionBank', QuestionBankSchema);
