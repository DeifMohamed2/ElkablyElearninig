const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    studentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 1,
      maxlength: 20,
    },
    parentNumber: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 15,
    },
    parentCountryCode: {
      type: String,
      required: true,
      enum: ['+966', '+20', '+971', '+965'], // Saudi, Egypt, UAE, Kuwait
      default: '+966',
    },
    studentCountryCode: {
      type: String,
      required: true,
      enum: ['+966', '+20', '+971', '+965'], // Saudi, Egypt, UAE, Kuwait
      default: '+966',
    },
    studentEmail: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    schoolName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    grade: {
      type: String,
      required: true,
      enum: ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13'],
    },
    englishTeacher: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    howDidYouKnow: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    studentCode: {
      type: String,
      unique: true,
      default: function() {
        return 'STU' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      }
    },
    role: {
      type: String,
      enum: ['student'],
      default: 'student',
      immutable: true,
    },
    isActive: {
      type: Boolean,
      default: false, // New users need admin approval
    },
    enrolledCourses: [{
      course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
      },
      enrolledAt: {
        type: Date,
        default: Date.now,
      },
      progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      lastAccessed: {
        type: Date,
        default: Date.now,
      },
      completedTopics: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Topic',
      }],
      status: {
        type: String,
        enum: ['active', 'completed', 'paused', 'dropped'],
        default: 'active',
      },
      // Embedded progress tracking for content items
      contentProgress: [{
        topicId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Topic',
          required: true
        },
        contentId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true
        },
        contentType: {
          type: String,
          enum: ['video', 'pdf', 'quiz', 'homework', 'assignment', 'reading', 'link'],
          required: true
        },
        completionStatus: {
          type: String,
          enum: ['not_started', 'in_progress', 'completed', 'failed'],
          default: 'not_started'
        },
        progressPercentage: {
          type: Number,
          default: 0,
          min: 0,
          max: 100
        },
        lastAccessed: {
          type: Date,
          default: Date.now
        },
        completedAt: {
          type: Date
        },
        score: {
          type: Number,
          min: 0,
          max: 100
        },
        timeSpent: {
          type: Number, // in minutes
          default: 0
        },
        attempts: {
          type: Number,
          default: 0
        },
        lastPosition: {
          type: Number, // for videos, last watched position in seconds
          default: 0
        },
        totalDuration: {
          type: Number, // total content duration in seconds
          default: 0
        },
        expectedEnd: {
          type: Date,
        },
        // Quiz/Homework specific fields
        quizAttempts: [{
          attemptNumber: {
            type: Number,
            required: true
          },
          score: {
            type: Number,
            min: 0,
            max: 100
          },
          totalQuestions: {
            type: Number,
            required: true
          },
          correctAnswers: {
            type: Number,
            required: true
          },
          timeSpent: {
            type: Number, // in seconds
            required: true
          },
          startedAt: {
            type: Date,
            required: true
          },
          completedAt: {
            type: Date,
            required: true
          },
          status: {
            type: String,
            enum: ['completed', 'abandoned', 'timeout'],
            default: 'completed'
          },
          answers: [{
            questionId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Question',
              required: true
            },
            selectedAnswer: {
              type: String,
              required: true
            },
            correctAnswer: {
              type: String,
              required: true
            },
            isCorrect: {
              type: Boolean,
              required: true
            },
            points: {
              type: Number,
              default: 1
            },
            timeSpent: {
              type: Number, // time spent on this question in seconds
              default: 0
            }
          }],
          passed: {
            type: Boolean,
            default: false
          },
          passingScore: {
            type: Number,
            default: 60
          }
        }],
        bestScore: {
          type: Number,
          default: 0
        },
        totalPoints: {
          type: Number,
          default: 0
        },
        metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }]
    }],
    purchasedBundles: [{
      bundle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BundleCourse',
      },
      purchasedAt: {
        type: Date,
        default: Date.now,
      },
      price: {
        type: Number,
        required: true,
      },
      orderNumber: {
        type: String,
        required: true,
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'cancelled'],
        default: 'active',
      },
    }],
    purchasedCourses: [{
      course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
      },
      purchasedAt: {
        type: Date,
        default: Date.now,
      },
      price: {
        type: Number,
        required: true,
      },
      orderNumber: {
        type: String,
        required: true,
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'cancelled'],
        default: 'active',
      },
    }],
    wishlist: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        courses: [],
        bundles: []
      }
    },
    quizAttempts: [{
      quiz: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
      },
      attempts: [{
        attemptNumber: {
          type: Number,
          required: true,
        },
        score: {
          type: Number,
          min: 0,
          max: 100,
        },
        totalQuestions: {
          type: Number,
          required: true,
        },
        correctAnswers: {
          type: Number,
          required: true,
        },
        timeSpent: {
          type: Number, // in seconds
          required: true,
        },
        startedAt: {
          type: Date,
          required: true,
        },
        completedAt: {
          type: Date,
          required: false,
        },
        status: {
          type: String,
          enum: ['in_progress', 'completed', 'abandoned', 'timeout'],
          default: 'in_progress',
        },
        answers: [{
          questionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question',
          },
          selectedAnswer: String,
          isCorrect: Boolean,
          points: Number,
        }],
        // Timing fields for quiz attempts
        expectedEnd: {
          type: Date,
        },
        remainingSeconds: {
          type: Number,
          default: 0,
        },
        isExpired: {
          type: Boolean,
          default: false,
        },
        passed: {
          type: Boolean,
          default: false,
        },
        passingScore: {
          type: Number,
          default: 60,
        },
      }],
      bestScore: {
        type: Number,
        default: 0,
      },
      lastAttempt: {
        type: Date,
        default: Date.now,
      },
    }],
    profilePicture: {
      type: String,
      default: '',
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light',
      },
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        quizReminders: {
          type: Boolean,
          default: true,
        },
        courseUpdates: {
          type: Boolean,
          default: true,
        },
      },
      language: {
        type: String,
        default: 'en',
      },
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});


// Compare password
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Generate unique student code before saving
UserSchema.pre('save', async function (next) {
  if (this.isNew && !this.studentCode) {
    let studentCode;
    let isUnique = false;
    
    while (!isUnique) {
      studentCode = 'STU' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const existingUser = await this.constructor.findOne({ studentCode });
      if (!existingUser) {
        isUnique = true;
      }
    }
    
    this.studentCode = studentCode;
  }
  next();
});

// Virtual for full name
UserSchema.virtual('name').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for total enrolled courses
UserSchema.virtual('totalEnrolledCourses').get(function() {
  return this.enrolledCourses ? this.enrolledCourses.length : 0;
});

// Virtual for completed courses
UserSchema.virtual('completedCourses').get(function() {
  if (!this.enrolledCourses) return 0;
  return this.enrolledCourses.filter(course => course.status === 'completed').length;
});

// Virtual for total quiz attempts
UserSchema.virtual('totalQuizAttempts').get(function() {
  if (!this.quizAttempts) return 0;
  return this.quizAttempts.reduce((total, quiz) => total + quiz.attempts.length, 0);
});

// Virtual for average quiz score
UserSchema.virtual('averageQuizScore').get(function() {
  if (!this.quizAttempts || this.quizAttempts.length === 0) return 0;
  
  const allScores = this.quizAttempts.flatMap(quiz => 
    quiz.attempts.map(attempt => attempt.score)
  );
  
  if (allScores.length === 0) return 0;
  
  const sum = allScores.reduce((total, score) => total + score, 0);
  return Math.round(sum / allScores.length);
});

// Instance method to get course progress
UserSchema.methods.getCourseProgress = function(courseId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  return enrollment ? enrollment.progress : 0;
};

// Instance method to update course progress
UserSchema.methods.updateCourseProgress = async function(courseId, progress, topicId = null) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (enrollment) {
    enrollment.progress = Math.min(Math.max(progress, 0), 100);
    enrollment.lastAccessed = new Date();
    
    if (topicId && !enrollment.completedTopics.includes(topicId)) {
      enrollment.completedTopics.push(topicId);
    }
    
    if (enrollment.progress === 100) {
      enrollment.status = 'completed';
    }
    
    return await this.save();
  }
  
  return null;
};

// Instance method to get content completion status
UserSchema.methods.isContentCompleted = async function(courseId, contentId) {
  const Progress = mongoose.model('Progress');
  const completion = await Progress.findOne({
    student: this._id,
    course: courseId,
    content: contentId,
    activity: { $in: ['content_completed', 'quiz_passed', 'homework_submitted', 'assignment_submitted'] },
    status: 'completed'
  });
  
  return !!completion;
};

// Instance method to get all completed content for a course
UserSchema.methods.getCompletedContent = async function(courseId) {
  const Progress = mongoose.model('Progress');
  const completedContent = await Progress.find({
    student: this._id,
    course: courseId,
    activity: { $in: ['content_completed', 'quiz_passed', 'homework_submitted', 'assignment_submitted'] },
    status: 'completed'
  }).select('content activity timestamp');
  
  return completedContent;
};

// Instance method to add quiz attempt
UserSchema.methods.addQuizAttempt = async function(quizId, attemptData) {
  let quizAttempt = this.quizAttempts.find(
    attempt => attempt.quiz.toString() === quizId.toString()
  );
  
  if (!quizAttempt) {
    quizAttempt = {
      quiz: quizId,
      attempts: [],
      bestScore: 0,
      lastAttempt: new Date()
    };
    this.quizAttempts.push(quizAttempt);
  }
  
  const attemptNumber = quizAttempt.attempts.length + 1;
  const newAttempt = {
    attemptNumber,
    ...attemptData,
    startedAt: new Date(attemptData.startedAt),
    completedAt: new Date(attemptData.completedAt)
  };
  
  quizAttempt.attempts.push(newAttempt);
  quizAttempt.lastAttempt = new Date();
  
  // Update best score
  if (attemptData.score > quizAttempt.bestScore) {
    quizAttempt.bestScore = attemptData.score;
  }
  
  return await this.save();
};

// Instance method to start a standalone quiz attempt with timing
UserSchema.methods.startQuizAttempt = async function(quizId, durationMinutes) {
  // Check if there's already an active attempt
  const existingQuizAttempt = this.quizAttempts.find(
    attempt => attempt.quiz.toString() === quizId.toString()
  );
  
  if (existingQuizAttempt) {
    const activeAttempt = existingQuizAttempt.attempts.find(attempt => attempt.status === 'in_progress');
    if (activeAttempt) {
      // Return existing active attempt
      return {
        student: this,
        newAttempt: activeAttempt,
        attemptNumber: activeAttempt.attemptNumber
      };
    }
  }
  
  // Create new quiz attempt entry if it doesn't exist
  let quizAttempt = existingQuizAttempt;
  if (!quizAttempt) {
    quizAttempt = {
      quiz: quizId,
      attempts: [],
      bestScore: 0,
      lastAttempt: new Date()
    };
    this.quizAttempts.push(quizAttempt);
  }
  
  // Calculate the next attempt number based on existing attempts
  const attemptNumber = quizAttempt.attempts.length + 1;
  const startedAt = new Date();
  const expectedEnd = new Date(startedAt.getTime() + (durationMinutes * 60 * 1000));
  
  const newAttempt = {
    attemptNumber,
    startedAt,
    expectedEnd,
    remainingSeconds: durationMinutes * 60,
    isExpired: false,
    status: 'in_progress',
    answers: [],
    totalQuestions: 0,
    correctAnswers: 0,
    timeSpent: 0,
    score: 0,
    passed: false,
    passingScore: 60
  };
  
  quizAttempt.attempts.push(newAttempt);
  quizAttempt.lastAttempt = new Date();
  
  const savedStudent = await this.save();
  
  // Return the saved student and the new attempt for verification
  return {
    student: savedStudent,
    newAttempt: newAttempt,
    attemptNumber: attemptNumber
  };
};

// Instance method to update quiz attempt timing
UserSchema.methods.updateQuizAttemptTiming = async function(quizId, attemptNumber, remainingSeconds) {
  const quizAttempt = this.quizAttempts.find(
    attempt => attempt.quiz.toString() === quizId.toString()
  );
  
  if (!quizAttempt) {
    throw new Error('Quiz attempt not found');
  }
  
  const attempt = quizAttempt.attempts.find(
    att => att.attemptNumber === attemptNumber
  );
  
  if (!attempt) {
    throw new Error('Attempt not found');
  }
  
  attempt.remainingSeconds = remainingSeconds;
  attempt.isExpired = remainingSeconds <= 0;
  
  if (attempt.isExpired) {
    attempt.status = 'timeout';
    attempt.completedAt = new Date();
  }
  
  return await this.save();
};

// Instance method to complete quiz attempt
UserSchema.methods.completeQuizAttempt = async function(quizId, attemptNumber, attemptData) {
  const quizAttempt = this.quizAttempts.find(
    attempt => attempt.quiz.toString() === quizId.toString()
  );
  
  if (!quizAttempt) {
    throw new Error('Quiz attempt not found');
  }
  
  const attempt = quizAttempt.attempts.find(
    att => att.attemptNumber === attemptNumber
  );
  
  if (!attempt) {
    throw new Error('Attempt not found');
  }
  
  // Update attempt data
  Object.assign(attempt, {
    ...attemptData,
    completedAt: new Date(),
    status: 'completed',
    passed: attemptData.score >= attempt.passingScore
  });
  
  // Update best score
  if (attemptData.score > quizAttempt.bestScore) {
    quizAttempt.bestScore = attemptData.score;
  }
  
  quizAttempt.lastAttempt = new Date();
  
  return await this.save();
};

// Instance method to add course to wishlist
UserSchema.methods.addCourseToWishlist = async function(courseId) {
  if (!this.wishlist.courses.includes(courseId)) {
    this.wishlist.courses.push(courseId);
    
    // Mark the wishlist field as modified to ensure it gets saved
    this.markModified('wishlist');
    
    try {
      const savedUser = await this.save();
      return savedUser;
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }
  return this;
};

// Instance method to add bundle to wishlist
UserSchema.methods.addBundleToWishlist = async function(bundleId) {
  if (!this.wishlist.bundles.includes(bundleId)) {
    this.wishlist.bundles.push(bundleId);
    
    // Mark the wishlist field as modified to ensure it gets saved
    this.markModified('wishlist');
    
    try {
      const savedUser = await this.save();
      return savedUser;
    } catch (error) {
      console.error('Error saving user:', error);
      throw error;
    }
  }
  return this;
};


// Instance method to remove course from wishlist
UserSchema.methods.removeCourseFromWishlist = async function(courseId) {
  this.wishlist.courses = this.wishlist.courses.filter(
    id => id.toString() !== courseId.toString()
  );
  
  // Mark the wishlist field as modified to ensure it gets saved
  this.markModified('wishlist');
  
  try {
    const savedUser = await this.save();
    return savedUser;
  } catch (error) {
    console.error('Error saving user:', error);
    throw error;
  }
};

// Instance method to remove bundle from wishlist
UserSchema.methods.removeBundleFromWishlist = async function(bundleId) {
  console.log('Removing bundle from wishlist:', bundleId);
  console.log('Wishlist before removal:', this.wishlist.bundles);

  // iterate and console log the wishlist.bundles
  this.wishlist.bundles.forEach(id => {
    console.log('Wishlist bundle:', id, bundleId, id.toString() === bundleId.toString());
  });

  this.wishlist.bundles = this.wishlist.bundles.filter(
    id => id.toString() !== bundleId.toString()
  );
  console.log('Wishlist after removal:', this.wishlist.bundles);
  
  // Mark the wishlist field as modified to ensure it gets saved
  this.markModified('wishlist');
  
  try {
    const savedUser = await this.save();
    console.log('User saved successfully, wishlist:', savedUser.wishlist);
    return savedUser;
  } catch (error) {
    console.error('Error saving user:', error);
    throw error;
  }
};

// Instance method to check if course is in wishlist
UserSchema.methods.isCourseInWishlist = function(courseId) {
  return this.wishlist.courses.some(id => id.toString() === courseId.toString());
};

// Instance method to check if bundle is in wishlist
UserSchema.methods.isBundleInWishlist = function(bundleId) {
  return this.wishlist.bundles.some(id => id.toString() === bundleId.toString());
};

// Legacy method for backward compatibility
UserSchema.methods.addToWishlist = async function(itemId, itemType = 'course') {
  if (itemType === 'course') {
    return await this.addCourseToWishlist(itemId);
  } else if (itemType === 'bundle') {
    return await this.addBundleToWishlist(itemId);
  }
  return this;
};

// Legacy method for backward compatibility
UserSchema.methods.removeFromWishlist = async function(itemId, itemType = 'course') {
  if (itemType === 'course') {
    return await this.removeCourseFromWishlist(itemId);
  } else if (itemType === 'bundle') {
    return await this.removeBundleFromWishlist(itemId);
  }
  return this;
};

// Legacy method for backward compatibility
UserSchema.methods.isInWishlist = function(itemId, itemType = 'course') {
  if (itemType === 'course') {
    return this.isCourseInWishlist(itemId);
  } else if (itemType === 'bundle') {
    return this.isBundleInWishlist(itemId);
  }
  return false;
};

// Instance method to get enrollment status
UserSchema.methods.isEnrolled = function(courseId) {

  // Then check if any enrollment matches the courseId
  const isEnrolled = this.enrolledCourses.some(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  return isEnrolled;
};

// Instance method to check if user has purchased a course
UserSchema.methods.hasPurchasedCourse = function(courseId) {
  return this.purchasedCourses.some(
    purchase => purchase.course && purchase.course.toString() === courseId.toString() && purchase.status === 'active'
  );
};

// Instance method to check if user has purchased a bundle
UserSchema.methods.hasPurchasedBundle = function(bundleId) {
  return this.purchasedBundles.some(
    purchase => purchase.bundle && purchase.bundle.toString() === bundleId.toString() && purchase.status === 'active'
  );
};

// Instance method to check if user has access to a course (either through individual purchase or bundle purchase)
UserSchema.methods.hasAccessToCourse = function(courseId) {
  console.log('Checking if user has access to course:', courseId);
  // Check if user has purchased the course individually
  if (this.hasPurchasedCourse(courseId)) {
    console.log('User has purchased the course individually');
    return true;
  }
  
  // Check if user has access through any purchased bundle
  // This would require checking if the course is part of any bundle the user has purchased
  // For now, we'll check if the user is enrolled in the course (which happens when they purchase a bundle)
  console.log('User is enrolled in the course');
  return this.isEnrolled(courseId);
};

// Instance method to check if user has access to a course through a specific bundle
UserSchema.methods.hasAccessToCourseThroughBundle = function(courseId, bundleId) {
  // Check if user has purchased the specific bundle
  if (!this.hasPurchasedBundle(bundleId)) {
    return false;
  }
  
  // Check if the course is part of the bundle (this would require the bundle to be populated)
  // For now, we'll check if the user is enrolled in the course
  return this.isEnrolled(courseId);
};

// Instance method to add purchased course
UserSchema.methods.addPurchasedCourse = async function(courseId, price, orderNumber) {
  if (!this.hasPurchasedCourse(courseId)) {
    this.purchasedCourses.push({
      course: courseId,
      price: price,
      orderNumber: orderNumber,
      purchasedAt: new Date(),
      status: 'active'
    });
    return await this.save();
  }
  return this;
};

// Instance method to add purchased bundle
UserSchema.methods.addPurchasedBundle = async function(bundleId, price, orderNumber) {
  if (!this.hasPurchasedBundle(bundleId)) {
    this.purchasedBundles.push({
      bundle: bundleId,
      price: price,
      orderNumber: orderNumber,
      purchasedAt: new Date(),
      status: 'active'
    });
    return await this.save();
  }
  return this;
};

// Instance method to enroll in all courses from a bundle
UserSchema.methods.enrollInBundleCourses = async function(bundle) {
  if (!bundle.courses || bundle.courses.length === 0) {
    return this;
  }

  for (const course of bundle.courses) {
    if (!this.isEnrolled(course._id || course)) {
      this.enrolledCourses.push({
        course: course._id || course,
        enrolledAt: new Date(),
        progress: 0,
        lastAccessed: new Date(),
        completedTopics: [],
        status: 'active'
      });
    }
  }

  return await this.save();
};

// Instance method to get total spent
UserSchema.methods.getTotalSpent = function() {
  const courseTotal = this.purchasedCourses
    .filter(purchase => purchase.status === 'active')
    .reduce((sum, purchase) => sum + purchase.price, 0);
  
  const bundleTotal = this.purchasedBundles
    .filter(purchase => purchase.status === 'active')
    .reduce((sum, purchase) => sum + purchase.price, 0);
  
  return courseTotal + bundleTotal;
};

// Instance method to get purchase history
UserSchema.methods.getPurchaseHistory = function() {
  const coursePurchases = this.purchasedCourses.map(purchase => ({
    ...purchase.toObject(),
    type: 'course'
  }));
  
  const bundlePurchases = this.purchasedBundles.map(purchase => ({
    ...purchase.toObject(),
    type: 'bundle'
  }));
  
  return [...coursePurchases, ...bundlePurchases]
    .sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
};

// Instance method to get content progress for a specific course
UserSchema.methods.getContentProgress = function(courseId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  return enrollment ? enrollment.contentProgress : [];
};

// Instance method to update content progress
UserSchema.methods.updateContentProgress = async function(courseId, topicId, contentId, contentType, progressData) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) {
    throw new Error('User is not enrolled in this course');
  }
  
  // Find existing content progress
  let contentProgress = enrollment.contentProgress.find(
    cp => cp.contentId.toString() === contentId.toString()
  );
  
  if (!contentProgress) {
    // Create new content progress entry
    contentProgress = {
      topicId,
      contentId,
      contentType,
      ...progressData
    };
    enrollment.contentProgress.push(contentProgress);
  } else {
    // Update existing content progress
    Object.assign(contentProgress, progressData);
  }
  
  // Update last accessed
  enrollment.lastAccessed = new Date();
  
  // Calculate overall course progress based on actual completion percentages
  await this.calculateCourseProgress(courseId);
  
  // Update topic completion
  const topicProgress = enrollment.contentProgress.filter(
    cp => cp.topicId.toString() === topicId.toString()
  );
  const topicCompletedContent = topicProgress.filter(
    cp => cp.completionStatus === 'completed'
  ).length;
  
  if (topicCompletedContent === topicProgress.length && topicProgress.length > 0) {
    if (!enrollment.completedTopics.includes(topicId)) {
      enrollment.completedTopics.push(topicId);
    }
  }
  
  // Mark course as completed if all content is completed
  if (enrollment.progress === 100) {
    enrollment.status = 'completed';
  }
  
  return await this.save();
};

// Instance method to reset attempts for a specific content in a course
UserSchema.methods.resetContentAttempts = async function(courseId, contentId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  if (!enrollment) {
    throw new Error('User is not enrolled in this course');
  }

  const contentProgress = enrollment.contentProgress.find(
    cp => cp.contentId.toString() === contentId.toString()
  );

  if (!contentProgress) {
    // Nothing to reset
    return this;
  }

  // Reset attempts-related fields
  contentProgress.quizAttempts = [];
  contentProgress.attempts = 0;
  contentProgress.bestScore = 0;
  contentProgress.totalPoints = 0;
  // If it was marked completed/failed due to attempts, revert to not started
  contentProgress.completionStatus = 'not_started';
  contentProgress.progressPercentage = 0;
  contentProgress.completedAt = null;

  return await this.save();
};

// Instance method to get content completion status
UserSchema.methods.isContentCompleted = function(courseId, contentId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) return false;
  
  const contentProgress = enrollment.contentProgress.find(
    cp => cp.contentId.toString() === contentId.toString()
  );
  
  return contentProgress ? contentProgress.completionStatus === 'completed' : false;
};

// Instance method to get content progress details
UserSchema.methods.getContentProgressDetails = function(courseId, contentId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) return null;
  
  return enrollment.contentProgress.find(
    cp => cp.contentId.toString() === contentId.toString()
  );
};

// Instance method to check if content is unlocked (prerequisites met)
UserSchema.methods.isContentUnlocked = function(courseId, contentId, contentData) {
  // If content has no prerequisites, it's unlocked
  if (!contentData.prerequisites || contentData.prerequisites.length === 0) {
    return { unlocked: true, reason: 'No prerequisites' };
  }
  
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) {
    return { unlocked: false, reason: 'Not enrolled in course' };
  }
  
  // Check if all prerequisites are completed
  const completedContentIds = enrollment.contentProgress
    .filter(cp => cp.completionStatus === 'completed')
    .map(cp => cp.contentId.toString());
  
  const allPrerequisites = contentData.prerequisites.map(p => p.toString());
  const missingPrerequisites = allPrerequisites.filter(p => !completedContentIds.includes(p));
  
  if (missingPrerequisites.length > 0) {
    return { 
      unlocked: false, 
      reason: 'Prerequisites not met',
      missingPrerequisites: missingPrerequisites
    };
  }
  
  return { unlocked: true, reason: 'All prerequisites completed' };
};

// Instance method to recalculate all progress for debugging
UserSchema.methods.recalculateAllProgress = async function() {
  const Course = mongoose.model('Course');
  
  for (const enrollment of this.enrolledCourses) {
    await this.calculateCourseProgress(enrollment.course);
  }
  
  return await this.save();
};

// Instance method to get completed content IDs for a course
UserSchema.methods.getCompletedContentIds = function(courseId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) return [];
  
  return enrollment.contentProgress
    .filter(cp => cp.completionStatus === 'completed')
    .map(cp => cp.contentId.toString());
};

// Instance method to add quiz attempt to content progress
UserSchema.methods.addQuizAttempt = async function(courseId, topicId, contentId, contentType, attemptData) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) {
    throw new Error('User is not enrolled in this course');
  }
  
  // Find existing content progress
  let contentProgress = enrollment.contentProgress.find(
    cp => cp.contentId.toString() === contentId.toString()
  );
  
  if (!contentProgress) {
    // Create new content progress entry
    contentProgress = {
      topicId,
      contentId,
      contentType,
      completionStatus: 'not_started',
      progressPercentage: 0,
      lastAccessed: new Date(),
      attempts: 0,
      quizAttempts: [],
      bestScore: 0,
      totalPoints: 0
    };
    enrollment.contentProgress.push(contentProgress);
  }
  
  // Add the new attempt
  const attemptNumber = contentProgress.quizAttempts.length + 1;
  const newAttempt = {
    attemptNumber,
    ...attemptData,
    startedAt: new Date(attemptData.startedAt),
    completedAt: new Date(attemptData.completedAt)
  };
  
  contentProgress.quizAttempts.push(newAttempt);
  contentProgress.attempts = contentProgress.quizAttempts.length;
  contentProgress.lastAccessed = new Date();
  
  // Update best score
  if (attemptData.score > contentProgress.bestScore) {
    contentProgress.bestScore = attemptData.score;
  }
  
  // Update total points
  contentProgress.totalPoints = contentProgress.quizAttempts.reduce((total, attempt) => {
    return total + attempt.answers.reduce((attemptTotal, answer) => attemptTotal + (answer.points || 0), 0);
  }, 0);
  
  // Update completion status based on passing score
  const passingScore = attemptData.passingScore || 60;
  if (attemptData.score >= passingScore) {
    contentProgress.completionStatus = 'completed';
    contentProgress.progressPercentage = 100;
    contentProgress.completedAt = new Date();
  } else {
    contentProgress.completionStatus = 'failed';
    contentProgress.progressPercentage = Math.round((attemptData.score / 100) * 100);
  }
  
  // Clear any prior active timing for this content; a new attempt should start fresh
  contentProgress.expectedEnd = null;
  
  // Update overall course progress
  await this.calculateCourseProgress(courseId);
  
  return await this.save();
};

// Instance method to get quiz attempt history for content
UserSchema.methods.getQuizAttemptHistory = function(courseId, contentId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) return [];
  
  const contentProgress = enrollment.contentProgress.find(
    cp => cp.contentId.toString() === contentId.toString()
  );
  
  return contentProgress ? contentProgress.quizAttempts : [];
};

// Instance method to get best quiz score for content
UserSchema.methods.getBestQuizScore = function(courseId, contentId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) return null;
  
  const contentProgress = enrollment.contentProgress.find(
    cp => cp.contentId.toString() === contentId.toString()
  );
  
  return contentProgress ? contentProgress.bestScore : null;
};

// Instance method to calculate course progress based on actual completion percentages
UserSchema.methods.calculateCourseProgress = async function(courseId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) return 0;
  
  // Get all content for this course from the Course model
  const Course = mongoose.model('Course');
  const course = await Course.findById(courseId).populate('topics');
  
  if (!course || !course.topics) return 0;
  
  // Get all content items from all topics
  const allContentItems = course.topics.flatMap(topic => 
    topic.content.map(contentItem => ({
      contentId: contentItem._id,
      topicId: topic._id
    }))
  );
  
  if (allContentItems.length === 0) return 0;
  
  // Calculate progress based on actual completion percentages
  let totalProgress = 0;
  let contentCount = 0;
  
  allContentItems.forEach(contentItem => {
    const contentProgress = enrollment.contentProgress.find(
      cp => cp.contentId.toString() === contentItem.contentId.toString()
    );
    
    if (contentProgress) {
      // Use actual progress percentage
      totalProgress += contentProgress.progressPercentage || 0;
    } else {
      // If no progress recorded, it's 0%
      totalProgress += 0;
    }
    contentCount++;
  });
  
  // Calculate average progress
  const averageProgress = contentCount > 0 ? Math.round(totalProgress / contentCount) : 0;
  
  // Update enrollment progress
  enrollment.progress = averageProgress;
  
  // Mark course as completed if progress is 100%
  if (averageProgress === 100) {
    enrollment.status = 'completed';
  } else if (enrollment.status === 'completed' && averageProgress < 100) {
    enrollment.status = 'active';
  }
  
  return averageProgress;
};

// Instance method to calculate topic progress based on actual completion percentages
UserSchema.methods.calculateTopicProgress = async function(courseId, topicId) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) return 0;
  
  // Get topic content from the Course model
  const Course = mongoose.model('Course');
  const course = await Course.findById(courseId).populate('topics');
  
  if (!course || !course.topics) return 0;
  
  const topic = course.topics.find(t => t._id.toString() === topicId.toString());
  if (!topic || !topic.content) return 0;
  
  if (topic.content.length === 0) return 0;
  
  // Calculate progress based on actual completion percentages
  let totalProgress = 0;
  let contentCount = 0;
  
  topic.content.forEach(contentItem => {
    const contentProgress = enrollment.contentProgress.find(
      cp => cp.contentId.toString() === contentItem._id.toString()
    );
    
    if (contentProgress) {
      // Use actual progress percentage
      totalProgress += contentProgress.progressPercentage || 0;
    } else {
      // If no progress recorded, it's 0%
      totalProgress += 0;
    }
    contentCount++;
  });
  
  // Calculate average progress
  const averageProgress = contentCount > 0 ? Math.round(totalProgress / contentCount) : 0;
  
  // Update topic completion status
  const topicProgress = enrollment.contentProgress.filter(
    cp => cp.topicId.toString() === topicId.toString()
  );
  
  // Mark topic as completed if all content is 100% completed
  if (averageProgress === 100 && !enrollment.completedTopics.includes(topicId)) {
    enrollment.completedTopics.push(topicId);
  } else if (averageProgress < 100 && enrollment.completedTopics.includes(topicId)) {
    enrollment.completedTopics = enrollment.completedTopics.filter(
      id => id.toString() !== topicId.toString()
    );
  }
  
  return averageProgress;
};

// Instance method to check if user can attempt quiz/homework
UserSchema.methods.canAttemptQuiz = function(courseId, contentId, maxAttempts = 3) {
  const enrollment = this.enrolledCourses.find(
    enrollment => enrollment.course && enrollment.course.toString() === courseId.toString()
  );
  
  if (!enrollment) return { canAttempt: false, reason: 'Not enrolled in course' };
  
  const contentProgress = enrollment.contentProgress.find(
    cp => cp.contentId.toString() === contentId.toString()
  );
  
  if (!contentProgress) return { canAttempt: true, reason: 'First attempt' };
  
  if (contentProgress.attempts >= maxAttempts) {
    return { canAttempt: false, reason: 'Maximum attempts reached' };
  }
  
  return { canAttempt: true, reason: 'Can attempt', attemptsLeft: maxAttempts - contentProgress.attempts };
};

// Instance method to reset quiz attempts for a specific quiz
UserSchema.methods.resetQuizAttempts = async function(quizId) {
  // Find the quiz attempt entry
  const quizAttemptIndex = this.quizAttempts.findIndex(
    attempt => attempt.quiz.toString() === quizId.toString()
  );
  
  if (quizAttemptIndex === -1) {
    return { success: false, message: 'No quiz attempts found for this quiz' };
  }
  
  // Remove the entire quiz attempt entry
  this.quizAttempts.splice(quizAttemptIndex, 1);
  
  // Mark the quizAttempts field as modified
  this.markModified('quizAttempts');
  
  try {
    await this.save();
    return { success: true, message: 'Quiz attempts reset successfully' };
  } catch (error) {
    console.error('Error resetting quiz attempts:', error);
    return { success: false, message: 'Failed to reset quiz attempts' };
  }
};

module.exports = mongoose.model('User', UserSchema);
