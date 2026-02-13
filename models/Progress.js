const mongoose = require('mongoose');

const ProgressSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: false,
    },
    content: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    contentType: {
      type: String,
      enum: [
        'video',
        'pdf',
        'quiz',
        'homework',
        'reading',
        'assignment',
        'link',
      ],
      required: false,
    },
    activity: {
      type: String,
      required: true,
      enum: [
        'course_started',
        'course_completed',
        'topic_started',
        'topic_completed',
        'content_viewed',
        'content_completed',
        'content_failed',
        'quiz_attempted',
        'quiz_completed',
        'quiz_passed',
        'quiz_failed',
        'homework_started',
        'homework_submitted',
        'homework_graded',
        'assignment_started',
        'assignment_submitted',
        'assignment_graded',
        'certificate_earned',
        'badge_earned',
        'streak_achieved',
        'milestone_reached',
      ],
    },
    details: {
      // Flexible object to store activity-specific data
      score: Number,
      timeSpent: Number, // in minutes
      attempts: Number,
      points: Number,
      streak: Number,
      milestone: String,
      badge: String,
      certificate: String,
      feedback: String,
      grade: String,
      completionPercentage: Number, // for videos, readings, etc.
      lastPosition: Number, // for videos, last watched position
      totalDuration: Number, // total content duration
      metadata: mongoose.Schema.Types.Mixed,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'failed', 'paused', 'locked'],
      default: 'active',
    },
    points: {
      type: Number,
      default: 0,
      min: 0,
    },
    experience: {
      type: Number,
      default: 0,
      min: 0,
    },
    prerequisites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Content',
      },
    ],
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Content',
      },
    ],
    unlockConditions: {
      type: String,
      enum: ['immediate', 'prerequisites_completed', 'time_based', 'manual'],
      default: 'immediate',
    },
    completionCriteria: {
      type: String,
      enum: ['view', 'complete', 'pass_quiz', 'submit_assignment'],
      default: 'view',
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Compound index for efficient queries
ProgressSchema.index({ student: 1, course: 1, timestamp: -1 });
ProgressSchema.index({ student: 1, activity: 1 });
ProgressSchema.index({ course: 1, activity: 1 });
ProgressSchema.index({ student: 1, course: 1, content: 1 });
ProgressSchema.index({ student: 1, topic: 1, content: 1 });

// Virtual for activity duration (if applicable)
ProgressSchema.virtual('duration').get(function () {
  if (this.details && this.details.timeSpent) {
    const minutes = this.details.timeSpent;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${remainingMinutes}m`;
  }
  return null;
});

// Static method to get student progress summary
ProgressSchema.statics.getStudentProgress = async function (
  studentId,
  courseId = null,
) {
  const matchStage = { student: new mongoose.Types.ObjectId(studentId) };
  if (courseId) {
    matchStage.course = new mongoose.Types.ObjectId(courseId);
  }

  const progress = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$activity',
        count: { $sum: 1 },
        totalPoints: { $sum: '$points' },
        totalExperience: { $sum: '$experience' },
        lastActivity: { $max: '$timestamp' },
        activities: {
          $push: {
            timestamp: '$timestamp',
            points: '$points',
            experience: '$experience',
            details: '$details',
          },
        },
      },
    },
    {
      $sort: { lastActivity: -1 },
    },
  ]);

  return progress;
};

// Static method to get course analytics
ProgressSchema.statics.getCourseAnalytics = async function (courseId) {
  const analytics = await this.aggregate([
    { $match: { course: new mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: '$activity',
        count: { $sum: 1 },
        uniqueStudents: { $addToSet: '$student' },
        averagePoints: { $avg: '$points' },
        averageExperience: { $avg: '$experience' },
        totalPoints: { $sum: '$points' },
        totalExperience: { $sum: '$experience' },
      },
    },
    {
      $addFields: {
        uniqueStudentCount: { $size: '$uniqueStudents' },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  return analytics;
};

// Static method to get leaderboard
ProgressSchema.statics.getLeaderboard = async function (
  courseId = null,
  limit = 10,
) {
  const matchStage = {};
  if (courseId) {
    matchStage.course = new mongoose.Types.ObjectId(courseId);
  }

  const leaderboard = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$student',
        totalPoints: { $sum: '$points' },
        totalExperience: { $sum: '$experience' },
        activitiesCount: { $sum: 1 },
        lastActivity: { $max: '$timestamp' },
        completedActivities: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
          },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'studentInfo',
      },
    },
    {
      $unwind: '$studentInfo',
    },
    {
      $project: {
        studentId: '$_id',
        studentName: '$studentInfo.name',
        studentCode: '$studentInfo.studentCode',
        totalPoints: 1,
        totalExperience: 1,
        activitiesCount: 1,
        completedActivities: 1,
        lastActivity: 1,
        completionRate: {
          $multiply: [
            { $divide: ['$completedActivities', '$activitiesCount'] },
            100,
          ],
        },
      },
    },
    {
      $sort: { totalPoints: -1, totalExperience: -1 },
    },
    {
      $limit: limit,
    },
  ]);

  return leaderboard;
};

// Static method to get student achievements
ProgressSchema.statics.getStudentAchievements = async function (studentId) {
  const achievements = await this.aggregate([
    { $match: { student: new mongoose.Types.ObjectId(studentId) } },
    {
      $group: {
        _id: '$activity',
        count: { $sum: 1 },
        totalPoints: { $sum: '$points' },
        totalExperience: { $sum: '$experience' },
        firstAchievement: { $min: '$timestamp' },
        lastAchievement: { $max: '$timestamp' },
        details: { $first: '$details' },
      },
    },
    {
      $sort: { lastAchievement: -1 },
    },
  ]);

  // Calculate badges and milestones
  const totalPoints = achievements.reduce(
    (sum, achievement) => sum + achievement.totalPoints,
    0,
  );
  const totalExperience = achievements.reduce(
    (sum, achievement) => sum + achievement.totalExperience,
    0,
  );
  const totalActivities = achievements.reduce(
    (sum, achievement) => sum + achievement.count,
    0,
  );

  const badges = [];
  const milestones = [];

  // Define badge criteria
  if (totalPoints >= 1000)
    badges.push({ name: 'Point Master', description: 'Earned 1000+ points' });
  if (totalExperience >= 5000)
    badges.push({ name: 'Experience Expert', description: 'Gained 5000+ XP' });
  if (totalActivities >= 50)
    badges.push({
      name: 'Active Learner',
      description: 'Completed 50+ activities',
    });

  // Define milestone criteria
  if (totalPoints >= 500)
    milestones.push({
      name: 'Half Century',
      description: '500 points milestone',
    });
  if (totalExperience >= 2500)
    milestones.push({
      name: 'Quarter Master',
      description: '2500 XP milestone',
    });

  return {
    achievements,
    badges,
    milestones,
    summary: {
      totalPoints,
      totalExperience,
      totalActivities,
      averagePoints:
        totalActivities > 0 ? Math.round(totalPoints / totalActivities) : 0,
    },
  };
};

// Instance method to calculate progress percentage
ProgressSchema.methods.calculateProgressPercentage = function () {
  // This would need to be implemented based on specific course structure
  // For now, return a placeholder
  return Math.round(Math.random() * 100);
};

// Static method to track content progress
ProgressSchema.statics.trackContentProgress = async function (
  studentId,
  courseId,
  topicId,
  contentId,
  contentType,
  activity,
  details = {},
) {
  // For 'content_viewed', check if we already have a recent entry (within last 5 minutes)
  if (activity === 'content_viewed') {
    const recentView = await this.findOne({
      student: studentId,
      course: courseId,
      content: contentId,
      activity: 'content_viewed',
      timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // 5 minutes ago
    });

    if (recentView) {
      // Update existing entry instead of creating new one
      recentView.timestamp = new Date();
      recentView.details = { ...recentView.details, ...details };
      return await recentView.save();
    }
  }

  // For completion activities, check if already completed
  if (
    [
      'content_completed',
      'quiz_passed',
      'homework_submitted',
      'assignment_submitted',
    ].includes(activity)
  ) {
    const existingCompletion = await this.findOne({
      student: studentId,
      course: courseId,
      content: contentId,
      activity: activity,
      status: 'completed',
    });

    if (existingCompletion) {
      return existingCompletion; // Don't create duplicate completion
    }
  }

  const progressData = {
    student: studentId,
    course: courseId,
    topic: topicId,
    content: contentId,
    contentType: contentType,
    activity: activity,
    details: details,
    timestamp: new Date(),
    status:
      activity.includes('completed') || activity.includes('passed')
        ? 'completed'
        : 'active',
  };

  // Calculate points based on activity type
  const pointsMap = {
    content_viewed: 1,
    content_completed: 5,
    quiz_passed: 10,
    quiz_completed: 5,
    homework_submitted: 8,
    assignment_submitted: 15,
    topic_completed: 20,
    course_completed: 100,
  };

  progressData.points = pointsMap[activity] || 0;
  progressData.experience = progressData.points * 2; // XP is double the points

  return await this.create(progressData);
};

// Static method to check if content is unlocked for student
ProgressSchema.statics.isContentUnlocked = async function (
  studentId,
  courseId,
  contentId,
  contentData,
) {
  // If content has no prerequisites, it's unlocked
  if (!contentData.prerequisites || contentData.prerequisites.length === 0) {
    return { unlocked: true, reason: 'No prerequisites' };
  }

  // Get all content IDs for the course to check order-based unlocking
  const Course = mongoose.model('Course');
  const course = await Course.findById(courseId).populate({
    path: 'topics',
    populate: { path: 'content' },
  });

  if (!course) {
    return { unlocked: false, reason: 'Course not found' };
  }

  // Find all content items in order
  const allContent = [];
  course.topics.forEach((topic) => {
    topic.content.forEach((contentItem) => {
      allContent.push({
        id: contentItem._id,
        order: contentItem.order,
        topicOrder: topic.order,
      });
    });
  });

  // Sort by topic order, then content order
  allContent.sort((a, b) => {
    if (a.topicOrder !== b.topicOrder) {
      return a.topicOrder - b.topicOrder;
    }
    return a.order - b.order;
  });

  // Find current content index
  const currentIndex = allContent.findIndex(
    (c) => c.id.toString() === contentId.toString(),
  );
  if (currentIndex === -1) {
    return { unlocked: false, reason: 'Content not found' };
  }

  // Check if all previous content is completed (sequential unlocking)
  for (let i = 0; i < currentIndex; i++) {
    const prevContentId = allContent[i].id;

    // Check if this previous content is completed
    const prevContentCompleted = await this.findOne({
      student: studentId,
      course: courseId,
      content: prevContentId,
      activity: {
        $in: [
          'content_completed',
          'quiz_passed',
          'homework_submitted',
          'assignment_submitted',
        ],
      },
      status: 'completed',
    });

    if (!prevContentCompleted) {
      return {
        unlocked: false,
        reason: `Complete "${allContent[i].title || 'previous content'}" first`,
        missingContent: prevContentId,
      };
    }
  }

  // Also check explicit prerequisites if any
  if (contentData.prerequisites && contentData.prerequisites.length > 0) {
    const prerequisiteProgress = await this.find({
      student: studentId,
      course: courseId,
      content: { $in: contentData.prerequisites },
      activity: {
        $in: [
          'content_completed',
          'quiz_passed',
          'homework_submitted',
          'assignment_submitted',
        ],
      },
      status: 'completed',
    });

    const completedPrerequisites = prerequisiteProgress.map((p) =>
      p.content.toString(),
    );
    const allPrerequisites = contentData.prerequisites.map((p) => p.toString());
    const missingPrerequisites = allPrerequisites.filter(
      (p) => !completedPrerequisites.includes(p),
    );

    if (missingPrerequisites.length > 0) {
      return {
        unlocked: false,
        reason: 'Prerequisites not met',
        missingPrerequisites: missingPrerequisites,
      };
    }
  }

  return { unlocked: true, reason: 'All prerequisites completed' };
};

// Static method to get student content progress for a course
ProgressSchema.statics.getStudentContentProgress = async function (
  studentId,
  courseId,
) {
  const progress = await this.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        course: new mongoose.Types.ObjectId(courseId),
      },
    },
    {
      $group: {
        _id: '$content',
        contentType: { $first: '$contentType' },
        activities: { $push: '$activity' },
        status: { $last: '$status' },
        lastActivity: { $max: '$timestamp' },
        totalPoints: { $sum: '$points' },
        totalExperience: { $sum: '$experience' },
        timeSpent: { $sum: '$details.timeSpent' },
      },
    },
    {
      $lookup: {
        from: 'topics',
        localField: '_id',
        foreignField: 'content._id',
        as: 'contentInfo',
      },
    },
  ]);

  return progress;
};

// Static method to get next content in sequence
ProgressSchema.statics.getNextContent = async function (
  studentId,
  courseId,
  currentContentId,
) {
  const Course = mongoose.model('Course');
  const course = await Course.findById(courseId).populate({
    path: 'topics',
    populate: { path: 'content' },
  });

  if (!course) {
    return null;
  }

  // Get all content items in order
  const allContent = [];
  course.topics.forEach((topic) => {
    topic.content.forEach((contentItem) => {
      allContent.push({
        id: contentItem._id,
        title: contentItem.title,
        type: contentItem.type,
        order: contentItem.order,
        topicOrder: topic.order,
        topicId: topic._id,
        content: contentItem,
      });
    });
  });

  // Sort by topic order, then content order
  allContent.sort((a, b) => {
    if (a.topicOrder !== b.topicOrder) {
      return a.topicOrder - b.topicOrder;
    }
    return a.order - b.order;
  });

  // Find current content index
  const currentIndex = allContent.findIndex(
    (c) => c.id.toString() === currentContentId.toString(),
  );
  if (currentIndex === -1 || currentIndex >= allContent.length - 1) {
    return null; // No next content
  }

  // Return next content
  return allContent[currentIndex + 1];
};

// Static method to update course progress automatically
ProgressSchema.statics.updateCourseProgress = async function (
  studentId,
  courseId,
) {
  // Get all content progress for the course
  const contentProgress = await this.getStudentContentProgress(
    studentId,
    courseId,
  );

  // Calculate overall progress
  const totalContent = contentProgress.length;
  const completedContent = contentProgress.filter(
    (p) =>
      p.activities.includes('content_completed') ||
      p.activities.includes('quiz_passed') ||
      p.activities.includes('homework_submitted') ||
      p.activities.includes('assignment_submitted'),
  ).length;

  const progressPercentage =
    totalContent > 0 ? Math.round((completedContent / totalContent) * 100) : 0;

  // Update user's course progress
  const User = mongoose.model('User');
  const user = await User.findById(studentId);
  if (user) {
    await user.updateCourseProgress(courseId, progressPercentage);
  }

  return progressPercentage;
};

// Pre-save middleware to validate progress data
ProgressSchema.pre('save', function (next) {
  // Validate that required fields are present based on activity type
  if (
    this.activity === 'topic_started' ||
    this.activity === 'topic_completed'
  ) {
    if (!this.topic) {
      return next(new Error('Topic is required for topic-related activities'));
    }
  }

  // Validate quiz-related activities
  if (this.activity.includes('quiz')) {
    if (!this.details.score && this.details.score !== 0) {
      return next(new Error('Score is required for quiz activities'));
    }
  }

  next();
});

// Performance indexes
ProgressSchema.index({ student: 1, course: 1 });
ProgressSchema.index({ completed: 1 });
ProgressSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Progress', ProgressSchema);
