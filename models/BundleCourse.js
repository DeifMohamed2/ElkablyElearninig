const mongoose = require('mongoose');

const BundleCourseSchema = new mongoose.Schema(
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
      trim: true,
      minlength: 5,
      maxlength: 1000,
      default: '',
    },
    shortDescription: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 200,
      default: '',
    },
    bundleCode: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    subject: {
      type: String,
      enum: ['Basics', 'Advanced'],
      required: true,
    },
    testType: {
      type: String,
      enum: ['EST', 'SAT', 'ACT'],
      required: true,
    },
    courseType: {
      type: String,
      enum: ['online', 'onground'],
      required: true,
      default: 'online',
    },
    courses: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    }],
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPrice: {
      type: Number,
      min: 0,
    },
    thumbnail: {
      type: String, // URL to thumbnail image
      default: '',
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    enrolledStudents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    tags: [{
      type: String,
      trim: true,
    }],
    prerequisites: [{
      type: String,
      trim: true,
    }],
    features: [{
      type: String,
      trim: true,
    }],
    duration: {
      type: Number, // Total duration in hours
      default: 0,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for course count
BundleCourseSchema.virtual('courseCount').get(function() {
  return this.courses ? this.courses.length : 0;
});

// Virtual for enrolled student count
BundleCourseSchema.virtual('enrolledCount').get(function() {
  return this.enrolledStudents ? this.enrolledStudents.length : 0;
});

// Virtual for savings calculation
BundleCourseSchema.virtual('savings').get(function() {
  if (this.discountPrice && this.price) {
    return this.price * (this.discountPrice / 100);
  }
  return 0;
});

// Virtual for final price after discount
BundleCourseSchema.virtual('finalPrice').get(function() {
  if (this.discountPrice && this.price) {
    return this.price - (this.price * (this.discountPrice / 100));
  }
  return this.price;
});

// Virtual for savings percentage (this is the discount percentage)
BundleCourseSchema.virtual('savingsPercentage').get(function() {
  if (this.discountPrice) {
    return this.discountPrice;
  }
  return 0;
});

// Calculate total duration from courses
BundleCourseSchema.virtual('totalDuration').get(function() {
  if (this.courses && this.courses.length > 0) {
    return this.courses.reduce((total, course) => {
      return total + (course.duration || 0);
    }, 0);
  }
  return 0;
});

// Pre-save middleware to generate bundle code
BundleCourseSchema.pre('save', async function (next) {
  if (this.isNew && !this.bundleCode) {
    let bundleCode;
    let isUnique = false;
    
    // Generate bundle code based on subject only (year removed)
    const subjectPrefix = this.subject.substring(0, 3).toUpperCase();
    
    while (!isUnique) {
      const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      bundleCode = `BND${subjectPrefix}${randomNum}`;
      
      const existingBundle = await this.constructor.findOne({ bundleCode });
      if (!existingBundle) {
        isUnique = true;
      }
    }
    
    this.bundleCode = bundleCode;
  }
  next();
});

// Pre-save middleware to calculate total duration
BundleCourseSchema.pre('save', async function (next) {
  if (this.isModified('courses') || this.isNew) {
    if (this.courses && this.courses.length > 0) {
      const Course = mongoose.model('Course');
      const courses = await Course.find({ _id: { $in: this.courses } });
      this.duration = courses.reduce((total, course) => total + (course.duration || 0), 0);
    }
  }
  next();
});

// Index for better query performance
// year removed
BundleCourseSchema.index({ status: 1 });
BundleCourseSchema.index({ createdBy: 1 });
BundleCourseSchema.index({ testType: 1 });
BundleCourseSchema.index({ courseType: 1, testType: 1, subject: 1 });
BundleCourseSchema.index({ courseType: 1, status: 1, isActive: 1 });

module.exports = mongoose.model('BundleCourse', BundleCourseSchema);
