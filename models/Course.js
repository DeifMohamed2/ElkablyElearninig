const mongoose = require('mongoose');

function weekNumberFromCourseTitle(title) {
  if (!title || typeof title !== 'string') return null;
  const m = title.match(/^\s*Week\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function sortBundleCoursesForSequence(courses) {
  return [...courses].sort((a, b) => {
    const wa = weekNumberFromCourseTitle(a.title);
    const wb = weekNumberFromCourseTitle(b.title);
    if (wa != null && wb != null && wa !== wb) return wa - wb;
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a._id).localeCompare(String(b._id));
  });
}

function allBundleCoursesShareSameOrder(courses) {
  if (!courses || courses.length <= 1) return false;
  const first = courses[0].order ?? 0;
  return courses.every((c) => (c.order ?? 0) === first);
}

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
      default: 'Beginner',
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    duration: {
      type: Number, // legacy hours field; not user-edited
      default: 0,
      min: 0,
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

  try {
    const course = await Course.findById(courseId);
    if (!course) {
      return { unlocked: false, reason: 'Course not found' };
    }

    if (!course.requiresSequential) {
      return { unlocked: true, reason: 'No sequential requirement' };
    }

    const rawBundleCourses = await Course.find({ bundle: course.bundle }).sort({
      order: 1,
      _id: 1,
    });
    const bundleCourses = sortBundleCoursesForSequence(rawBundleCourses);
    const uniformOrder = allBundleCoursesShareSameOrder(bundleCourses);

    const currentIndex = bundleCourses.findIndex(
      (c) => c._id.toString() === courseId.toString(),
    );

    if (currentIndex === 0) {
      return { unlocked: true, reason: 'First course in bundle' };
    }

    const student = await User.findById(studentId);
    if (!student) {
      return { unlocked: false, reason: 'Student not found' };
    }

    let minEnrolledIdx = Infinity;
    for (let i = 0; i < bundleCourses.length; i++) {
      const cid = bundleCourses[i]._id.toString();
      const has = student.enrolledCourses.some(
        (e) => e.course && e.course.toString() === cid,
      );
      if (has) minEnrolledIdx = Math.min(minEnrolledIdx, i);
    }

    if (minEnrolledIdx !== Infinity && currentIndex < minEnrolledIdx) {
      const courseProgress = student.getCourseProgress(courseId);
      if (courseProgress > 0) {
        return {
          unlocked: true,
          reason: `Course already started with ${courseProgress}% progress - access allowed`,
        };
      }
      return {
        unlocked: false,
        reason: `This week is before your enrollment range. Your access starts at "${bundleCourses[minEnrolledIdx].title}".`,
      };
    }

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
        if (
          bundleStartingOrder === null ||
          enrollment.startingOrder < bundleStartingOrder
        ) {
          bundleStartingOrder = enrollment.startingOrder;
        }
      }
    }

    let chainStart = 0;
    if (bundleStartingOrder !== null && !uniformOrder) {
      if (course.order < bundleStartingOrder) {
        const courseProgress = student.getCourseProgress(courseId);
        if (courseProgress > 0) {
          return {
            unlocked: true,
            reason: `Course already started with ${courseProgress}% progress - access allowed`,
          };
        }
        return {
          unlocked: false,
          reason: `You were enrolled from week ${bundleStartingOrder + 1}. This course is from an earlier week.`,
        };
      }
      for (let idx = 0; idx < bundleCourses.length; idx++) {
        if ((bundleCourses[idx].order ?? 0) >= bundleStartingOrder) {
          chainStart = idx;
          break;
        }
      }
    }

    if (minEnrolledIdx !== Infinity) {
      if (uniformOrder) {
        chainStart = minEnrolledIdx;
      } else {
        chainStart = Math.max(chainStart, minEnrolledIdx);
      }
    }

    for (let i = chainStart; i < currentIndex; i++) {
      const previousCourse = bundleCourses[i];
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

    const successReason =
      bundleStartingOrder !== null && !uniformOrder
        ? `Enrolled from week ${bundleStartingOrder + 1} and prerequisites completed`
        : 'All prerequisites completed';

    return { unlocked: true, reason: successReason };
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
    .sort({ order: 1, _id: 1 })
    .populate('topics');
  const sortedCourses = sortBundleCoursesForSequence(courses);

  const coursesWithStatus = await Promise.all(
    sortedCourses.map(async (course) => {
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
// Sequential course ordering within a bundle (isCourseUnlocked)
CourseSchema.index({ bundle: 1, order: 1 });
// Active course listing for students/landing pages
CourseSchema.index({ isActive: 1, status: 1 });
// Admin-created course lookups
CourseSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Course', CourseSchema);
