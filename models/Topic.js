const mongoose = require('mongoose');

// Quiz/Homework Question Schema
const QuestionSelectionSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  points: {
    type: Number,
    default: 1,
    min: 1,
  },
  order: {
    type: Number,
    default: 0,
  },
});

// Quiz Settings Schema
const QuizSettingsSchema = new mongoose.Schema({
  duration: {
    type: Number, // in minutes
    default: 30,
    min: 1,
    max: 300,
  },
  passingScore: {
    type: Number,
    default: 60,
    min: 0,
    max: 100,
  },
  maxAttempts: {
    type: Number,
    default: 3,
    min: 1,
    max: 10,
  },
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
  instructions: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
});

// Homework Settings Schema
const HomeworkSettingsSchema = new mongoose.Schema({
  passingCriteria: {
    type: String,
    enum: ['pass', 'fail'],
    default: 'pass',
  },
  passingScore: {
    type: Number,
    default: 60,
    min: 0,
    max: 100,
  },
  maxAttempts: {
    type: Number,
    default: 1,
    min: 1,
    max: 5,
  },
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
    default: false,
  },
  instructions: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
});

const ContentItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'video',
        'pdf',
        'homework',
        'quiz',
        'reading',
        'link',
        'zoom',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    content: {
      type: String, // URL or file path (for non-quiz/homework/zoom content)
      required: function () {
        return !['quiz', 'homework', 'zoom'].includes(this.type);
      },
    },

    // Zoom Meeting specific field
    zoomMeeting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZoomMeeting',
      required: function () {
        return this.type === 'zoom';
      },
    },

    // Quiz/Homework specific fields
    questionBank: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionBank',
      required: function () {
        return ['quiz', 'homework'].includes(this.type);
      },
    },
    selectedQuestions: {
      type: [QuestionSelectionSchema],
      validate: {
        validator: function (questions) {
          return (
            !['quiz', 'homework'].includes(this.type) || questions.length > 0
          );
        },
        message: 'Quiz/Homework must have at least one question selected',
      },
    },
    quizSettings: {
      type: QuizSettingsSchema,
      required: function () {
        return this.type === 'quiz';
      },
    },
    homeworkSettings: {
      type: HomeworkSettingsSchema,
      required: function () {
        return this.type === 'homework';
      },
    },

    // General content fields
    duration: {
      type: Number, // in minutes
      default: 0,
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    prerequisites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ContentItem',
      },
    ],
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ContentItem',
      },
    ],
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    learningObjectives: [
      {
        type: String,
        trim: true,
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    completionCriteria: {
      type: String,
      enum: ['view', 'complete', 'pass_quiz'],
      default: function () {
        if (this.type === 'quiz' || this.type === 'homework') {
          return 'pass_quiz';
        }
        return 'view';
      },
    },
    unlockConditions: {
      type: String,
      enum: [
        'immediate',
        'previous_completed',
        'quiz_passed',
      ],
      default: 'immediate',
    },
  },
  { timestamps: true }
);

const TopicSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 500,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    order: {
      type: Number,
      required: true,
      default: 1,
    },
    content: [ContentItemSchema],
    estimatedTime: {
      type: Number, // in minutes
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    learningObjectives: [
      {
        type: String,
        trim: true,
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    unlockConditions: {
      type: String,
      enum: [
        'immediate',
        'previous_completed',
        'quiz_passed',
      ],
      default: 'immediate',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for content count
TopicSchema.virtual('contentCount').get(function () {
  return this.content ? this.content.length : 0;
});

// Virtual for estimated duration
TopicSchema.virtual('totalDuration').get(function () {
  if (!this.content) return 0;
  return this.content.reduce((total, item) => total + (item.duration || 0), 0);
});

// Content Item Methods
ContentItemSchema.methods.validateQuizSettings = function () {
  if (this.type === 'quiz' && !this.quizSettings) {
    throw new Error('Quiz content must have quiz settings');
  }
  if (this.type === 'homework' && !this.homeworkSettings) {
    throw new Error('Homework content must have homework settings');
  }
  return true;
};

ContentItemSchema.methods.getTotalPoints = function () {
  if (!this.selectedQuestions || this.selectedQuestions.length === 0) {
    return 0;
  }
  return this.selectedQuestions.reduce(
    (total, q) => total + (q.points || 1),
    0
  );
};

ContentItemSchema.methods.getQuestionCount = function () {
  return this.selectedQuestions ? this.selectedQuestions.length : 0;
};

// Sort content by order before saving
TopicSchema.pre('save', function (next) {
  if (this.content && this.content.length > 0) {
    this.content.sort((a, b) => a.order - b.order);

    // Validate quiz/homework content
    this.content.forEach((item) => {
      if (['quiz', 'homework'].includes(item.type)) {
        try {
          item.validateQuizSettings();
        } catch (error) {
          return next(error);
        }
      }
    });
  }
  next();
});

module.exports = mongoose.model('Topic', TopicSchema);
