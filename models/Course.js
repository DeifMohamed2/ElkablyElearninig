const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema(
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
    shortDescription: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 150,
    },
    courseCode: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced'],
      required: true,
    },
    year: {
      type: String,
      required: true,
      enum: ['Grade 10', 'Grade 11', 'Grade 12'],
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: Number, // in hours
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountPrice: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
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
    bundle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BundleCourse',
      required: true,
    },
    topics: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Topic',
      },
    ],
    enrolledStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    prerequisites: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for topic count
CourseSchema.virtual('topicCount').get(function () {
  return this.topics ? this.topics.length : 0;
});

// Virtual for enrolled student count
CourseSchema.virtual('enrolledCount').get(function () {
  return this.enrolledStudents ? this.enrolledStudents.length : 0;
});

// Virtual for savings calculation
CourseSchema.virtual('savings').get(function () {
  if (this.discountPrice && this.price) {
    return this.price * (this.discountPrice / 100);
  }
  return 0;
});

// Virtual for final price after discount
CourseSchema.virtual('finalPrice').get(function () {
  if (this.discountPrice && this.price) {
    return this.price - this.price * (this.discountPrice / 100);
  }
  return this.price;
});

// Virtual for savings percentage (this is the discount percentage)
CourseSchema.virtual('savingsPercentage').get(function () {
  if (this.discountPrice) {
    return this.discountPrice;
  }
  return 0;
});

// Generate course code before saving
CourseSchema.pre('save', async function (next) {
  if (this.isNew && !this.courseCode) {
    let courseCode;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      const prefix = this.title.substring(0, 3).toUpperCase();
      const timestamp = Date.now().toString().slice(-6);
      const randomNum = Math.floor(Math.random() * 100);
      courseCode = `${prefix}${timestamp}${randomNum}`;

      // Check if this courseCode already exists
      const existingCourse = await mongoose
        .model('Course')
        .findOne({ courseCode });
      if (!existingCourse) {
        isUnique = true;
      }
      attempts++;
    }

    this.courseCode = courseCode;
  }
  next();
});

module.exports = mongoose.model('Course', CourseSchema);
