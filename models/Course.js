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
      trim: true,
      maxlength: 500,
      default: '',
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: 150,
      default: '',
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
    // Sequential ordering within bundle (Week 1, Week 2, etc.)
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Whether course requires previous courses to be completed
    requiresSequential: {
      type: Boolean,
      default: true,
    },
    // Fully booked / closed enrollment
    isFullyBooked: {
      type: Boolean,
      default: false,
    },
    fullyBookedMessage: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'FULLY BOOKED',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
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
      // Extract prefix from title - remove special characters and take first 3 alphanumeric characters
      const titlePrefix = this.title
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 3)
        .toUpperCase();
      // If title has no alphanumeric chars, use default prefix
      const prefix = titlePrefix.length >= 2 ? titlePrefix : 'CRS';

      const timestamp = Date.now().toString().slice(-6);
      const randomNum = Math.floor(Math.random() * 100)
        .toString()
        .padStart(2, '0');
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

// Static method to check if a course is unlocked for a student
CourseSchema.statics.isCourseUnlocked = async function (studentId, courseId) {
  const Course = mongoose.model('Course');
  const User = mongoose.model('User');
  const Progress = mongoose.model('Progress');

  try {
    // Get the course
    const course = await Course.findById(courseId);
    if (!course) {
      return { unlocked: false, reason: 'Course not found' };
    }

    // If sequential requirement is disabled, course is always unlocked
    if (!course.requiresSequential) {
      return { unlocked: true, reason: 'No sequential requirement' };
    }

    // Get all courses in the same bundle, sorted by order
    const bundleCourses = await Course.find({ bundle: course.bundle }).sort({
      order: 1,
    });

    // Find current course index
    const currentIndex = bundleCourses.findIndex(
      (c) => c._id.toString() === courseId.toString(),
    );

    // First course is always unlocked
    if (currentIndex === 0) {
      return { unlocked: true, reason: 'First course in bundle' };
    }

    // Check if student is enrolled in the bundle
    const student = await User.findById(studentId);
    if (!student) {
      return { unlocked: false, reason: 'Student not found' };
    }

    // Check if student has a startingOrder set for any course in this bundle
    // This allows admin to enroll students from a specific week/order
    let bundleStartingOrder = null;
    for (const bundleCourse of bundleCourses) {
      const enrollment = student.enrolledCourses.find(
        (e) => e.course && e.course.toString() === bundleCourse._id.toString(),
      );
      if (
        enrollment &&
        enrollment.startingOrder !== null &&
        enrollment.startingOrder !== undefined
      ) {
        // Use the minimum startingOrder found in the bundle (in case of multiple enrollments)
        if (
          bundleStartingOrder === null ||
          enrollment.startingOrder < bundleStartingOrder
        ) {
          bundleStartingOrder = enrollment.startingOrder;
        }
      }
    }

    // If student has a startingOrder set, they can access courses from that order onwards
    // BUT they still need to complete previous courses sequentially
    if (bundleStartingOrder !== null) {
      // If this course is before the startingOrder, check if student already has progress
      if (course.order < bundleStartingOrder) {
        // Check if student has already started this course (has any progress)
        const courseProgress = student.getCourseProgress(courseId);

        // If student has progress on this course, allow them to continue
        if (courseProgress > 0) {
          return {
            unlocked: true,
            reason: `Course already started with ${courseProgress}% progress - access allowed`,
          };
        }

        // No progress, course remains locked
        return {
          unlocked: false,
          reason: `You were enrolled from week ${bundleStartingOrder + 1}. This course is from an earlier week.`,
        };
      }

      // If this course is at or after startingOrder, check if previous courses (from startingOrder onwards) are completed
      // Find the starting index where order >= bundleStartingOrder
      let startingIndex = 0;
      for (let idx = 0; idx < bundleCourses.length; idx++) {
        if (bundleCourses[idx].order >= bundleStartingOrder) {
          startingIndex = idx;
          break;
        }
      }

      // Check all courses from startingIndex to currentIndex (exclusive)
      // Example: If startingOrder = 1 (Week 2, index 1) and checking Week 3 (order = 2, index = 2):
      //   - Loop from i = 1 to i < 2, checking if Week 2 (index 1) is completed
      for (let i = startingIndex; i < currentIndex; i++) {
        const previousCourse = bundleCourses[i];

        // Check if previous course is completed
        const isCompleted = await student.isCourseCompleted(previousCourse._id);

        if (!isCompleted) {
          return {
            unlocked: false,
            reason: `Complete "${previousCourse.title}" first`,
            previousCourse: {
              id: previousCourse._id,
              title: previousCourse.title,
              order: previousCourse.order,
            },
          };
        }
      }

      // All previous courses from startingOrder are completed
      return {
        unlocked: true,
        reason: `Enrolled from week ${bundleStartingOrder + 1} and prerequisites completed`,
      };
    }

    // Normal sequential completion check (for students enrolled from the beginning)
    // Check if previous courses are completed
    for (let i = 0; i < currentIndex; i++) {
      const previousCourse = bundleCourses[i];

      // Check if previous course is completed
      const isCompleted = await student.isCourseCompleted(previousCourse._id);

      if (!isCompleted) {
        return {
          unlocked: false,
          reason: `Complete "${previousCourse.title}" first`,
          previousCourse: {
            id: previousCourse._id,
            title: previousCourse.title,
            order: previousCourse.order,
          },
        };
      }
    }

    return { unlocked: true, reason: 'All prerequisites completed' };
  } catch (error) {
    console.error('Error checking course unlock status:', error);
    return { unlocked: false, reason: 'Error checking unlock status' };
  }
};

// Instance method to get unlock status for a student
CourseSchema.methods.getUnlockStatus = async function (studentId) {
  const Course = mongoose.model('Course');
  return await Course.isCourseUnlocked(studentId, this._id);
};

// Static method to get all courses in a bundle with unlock status for a student
CourseSchema.statics.getBundleCoursesWithStatus = async function (
  bundleId,
  studentId,
) {
  const Course = mongoose.model('Course');
  const courses = await Course.find({ bundle: bundleId })
    .sort({ order: 1 })
    .populate('topics');

  const coursesWithStatus = await Promise.all(
    courses.map(async (course) => {
      const unlockStatus = await course.getUnlockStatus(studentId);
      return {
        ...course.toObject(),
        isUnlocked: unlockStatus.unlocked,
        unlockReason: unlockStatus.reason,
        previousCourse: unlockStatus.previousCourse,
      };
    }),
  );

  return coursesWithStatus;
};

// Performance indexes
CourseSchema.index({ status: 1, createdAt: -1 });
CourseSchema.index({ bundle: 1, status: 1 });
CourseSchema.index({ courseCode: 1 });

module.exports = mongoose.model('Course', CourseSchema);
