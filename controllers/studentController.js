const User = require('../models/User');
const Course = require('../models/Course');
const Quiz = require('../models/Quiz');
const Progress = require('../models/Progress');
const BundleCourse = require('../models/BundleCourse');
const Topic = require('../models/Topic');
const Question = require('../models/Question');
const QuestionBank = require('../models/QuestionBank');
const ZoomMeeting = require('../models/ZoomMeeting');
const mongoose = require('mongoose');
const zoomService = require('../utils/zoomService');
const whatsappSMSNotificationService = require('../utils/whatsappSMSNotificationService');

// Dashboard - Main student dashboard
const dashboard = async (req, res) => {
  try {
    const studentId = req.session.user.id;

    // Get student with populated data
    const student = await User.findById(studentId)
      .populate({
        path: 'enrolledCourses.course',
        populate: [
          {
            path: 'topics',
            model: 'Topic',
          },
          {
            path: 'bundle',
            select: 'title bundleCode thumbnail',
            model: 'BundleCourse',
          },
        ],
      })
      .populate('wishlist')
      .populate({
        path: 'quizAttempts.quiz',
        model: 'Quiz',
      });

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    // Get recent progress
    const recentProgress = await Progress.find({ student: studentId })
      .populate('course', 'title thumbnail')
      .populate('topic', 'title')
      .sort({ timestamp: -1 })
      .limit(10);

    // Get statistics
    const stats = {
      totalCourses: student.enrolledCourses.length,
      completedCourses: student.completedCourses,
      totalQuizAttempts: student.totalQuizAttempts,
      averageScore: student.averageQuizScore,
      totalPoints: student.quizAttempts.reduce(
        (total, quiz) =>
          total +
          quiz.attempts.reduce(
            (quizTotal, attempt) => quizTotal + (attempt.score || 0),
            0
          ),
        0
      ),
      wishlistCount: student.wishlist.length,
    };

    // Get active courses (recently accessed)
    const activeCourses = student.enrolledCourses
      .filter(
        (enrollment) => enrollment.status === 'active' && enrollment.course
      )
      .sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed))
      .slice(0, 6)
      .map((enrollment) => ({
        ...enrollment.course.toObject(),
        progress: enrollment.progress,
        lastAccessed: enrollment.lastAccessed,
        status: enrollment.status,
      }));

    // Get upcoming quizzes (if any)
    const courseIds = student.enrolledCourses
      .filter((e) => e.course)
      .map((e) => e.course._id);

    const upcomingQuizzes =
      courseIds.length > 0
        ? await Quiz.find({
            status: 'active',
            _id: { $in: courseIds },
          })
            .populate('questionBank')
            .sort({ createdAt: -1 })
            .limit(5)
        : [];

    res.render('student/dashboard', {
      title: 'Student Dashboard | ELKABLY',
      student,
      stats,
      recentProgress,
      activeCourses,
      upcomingQuizzes,
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error_msg', 'Error loading dashboard');
    res.redirect('/auth/login');
  }
};

// Enrolled Courses - View all enrolled courses with filtering
const enrolledCourses = async (req, res) => {
  try {
    const studentId = req.session.user.id;

    // Get filter parameters
    const searchQuery = req.query.search || '';
    const progressFilter = req.query.progress || 'all';
    const bundleFilter = req.query.bundle || 'all';
    const sortBy = req.query.sort || 'lastAccessed';

    const student = await User.findById(studentId).populate({
      path: 'enrolledCourses.course',
      populate: [
        {
          path: 'topics',
          model: 'Topic',
        },
        {
          path: 'bundle',
          select: 'title bundleCode thumbnail',
        },
      ],
    });

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    // Filter out enrollments with null/deleted courses and recalculate progress
    const validEnrollments = student.enrolledCourses.filter(
      (enrollment) => enrollment.course
    );

    await Promise.all(
      validEnrollments.map(async (enrollment) => {
        await student.calculateCourseProgress(enrollment.course);
      })
    );

    // Update the student's enrolled courses to only include valid ones
    student.enrolledCourses = validEnrollments;
    await student.save();

    // Apply filters
    let filteredCourses = validEnrollments;

    // Search by course name
    if (searchQuery) {
      filteredCourses = filteredCourses.filter((enrollment) =>
        enrollment.course.title
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      );
    }

    // Filter by bundle
    if (bundleFilter !== 'all') {
      filteredCourses = filteredCourses.filter(
        (enrollment) =>
          enrollment.course.bundle &&
          enrollment.course.bundle._id.toString() === bundleFilter
      );
    }

    // Filter by progress percentage
    if (progressFilter !== 'all') {
      filteredCourses = filteredCourses.filter((enrollment) => {
        const progress = enrollment.progress || 0;
        switch (progressFilter) {
          case 'not-started':
            return progress === 0;
          case 'in-progress':
            return progress > 0 && progress < 100;
          case 'completed':
            return progress === 100;
          case 'high-progress':
            return progress >= 75;
          case 'low-progress':
            return progress < 25;
          default:
            return true;
        }
      });
    }

    // Sort courses
    switch (sortBy) {
      case 'name':
        filteredCourses.sort((a, b) =>
          a.course.title.localeCompare(b.course.title)
        );
        break;
      case 'progress':
        filteredCourses.sort((a, b) => (b.progress || 0) - (a.progress || 0));
        break;
      case 'enrolledAt':
        filteredCourses.sort(
          (a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt)
        );
        break;
      case 'lastAccessed':
      default:
        filteredCourses.sort(
          (a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed)
        );
        break;
    }

    // Get unlock status for each course
    const Course = require('../models/Course');
    const coursesWithUnlockStatus = await Promise.all(
      filteredCourses.map(async (enrollment) => {
        const unlockStatus = await Course.isCourseUnlocked(
          studentId,
          enrollment.course._id
        );
        return {
          ...enrollment.toObject(),
          isUnlocked: unlockStatus.unlocked,
          unlockReason: unlockStatus.reason,
          previousCourse: unlockStatus.previousCourse,
        };
      })
    );

    // Display all results without pagination
    const totalCourses = coursesWithUnlockStatus.length;
    const enrolledCourses = coursesWithUnlockStatus;

    // Get available bundles for filter dropdown
    const BundleCourse = require('../models/BundleCourse');
    const BookOrder = require('../models/BookOrder');
    const bundleIds = validEnrollments
      .map((e) => e.course.bundle?._id)
      .filter(Boolean)
      .filter((id, index, arr) => arr.indexOf(id) === index); // Remove duplicates

    const availableBundles = await BundleCourse.find({
      _id: { $in: bundleIds },
    }).select('_id title');

    // Get book purchase info for each bundle
    const bundleBookInfo = {};
    for (const bundleId of bundleIds) {
      const bundle = await BundleCourse.findById(bundleId)
        .select('_id title bundleCode hasBook bookName bookPrice thumbnail');
      
      if (bundle && bundle.hasBook && bundle.bookPrice > 0) {
        // Check if student has purchased the bundle
        const hasPurchasedBundle = student.hasPurchasedBundle(bundleId.toString());
        
        if (hasPurchasedBundle) {
          // Check if student has already ordered the book
          const hasOrderedBook = await BookOrder.hasUserOrderedBook(
            studentId,
            bundleId
          );
          
          if (!hasOrderedBook) {
            bundleBookInfo[bundleId.toString()] = {
              bundleId: bundle._id.toString(),
              bundleTitle: bundle.title,
              bundleCode: bundle.bundleCode,
              bookName: bundle.bookName,
              bookPrice: bundle.bookPrice,
              thumbnail: bundle.thumbnail || '/images/bundle-placeholder.jpg',
            };
          }
        }
      }
    }

    res.render('student/enrolled-courses', {
      title: 'My Enrolled Weeks | ELKABLY',
      student,
      enrolledCourses,
      totalCourses: totalCourses,
      availableBundles,
      bundleBookInfo, // Pass book purchase info for bundles
      filters: {
        search: searchQuery,
        progress: progressFilter,
        bundle: bundleFilter,
        sort: sortBy,
      },
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCourses: totalCourses,
        hasNext: false,
        hasPrev: false,
        nextPage: 1,
        prevPage: 1,
      },
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Enrolled courses error:', error);
    req.flash('error_msg', 'Error loading enrolled courses');
    res.redirect('/student/dashboard');
  }
};

// Course Details - View specific course details and progress
const courseDetails = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const courseId = req.params.id;

    const student = await User.findById(studentId);
    const enrollment = student.enrolledCourses.find(
      (e) => e.course.toString() === courseId
    );

    if (!enrollment) {
      req.flash('error_msg', 'You are not enrolled in this course');
      return res.redirect('/student/enrolled-courses');
    }

    const course = await Course.findById(courseId)
      .populate('topics')
      .populate('bundle', 'name')
      .populate('createdBy', 'name');

    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect('/student/enrolled-courses');
    }

    // Get course progress
    const courseProgress = await Progress.find({
      student: studentId,
      course: courseId,
    }).sort({ timestamp: -1 });

    // Calculate topic progress based on actual completion percentages
    const topicsWithProgress = await Promise.all(
      course.topics.map(async (topic) => {
        const topicProgress = await student.calculateTopicProgress(
          courseId,
          topic._id
        );
        return {
          ...topic.toObject(),
          completed: enrollment.completedTopics.includes(topic._id),
          progress: topicProgress,
        };
      })
    );

    // Check if course has a bundle and if student can purchase the book
    let bookPurchaseInfo = null;
    if (course.bundle) {
      const BundleCourse = require('../models/BundleCourse');
      const BookOrder = require('../models/BookOrder');
      
      const bundle = await BundleCourse.findById(course.bundle._id || course.bundle)
        .select('_id title bundleCode hasBook bookName bookPrice thumbnail');
      
      if (bundle && bundle.hasBook && bundle.bookPrice > 0) {
        // Check if student has purchased the bundle
        const hasPurchasedBundle = student.hasPurchasedBundle(bundle._id.toString());
        
        if (hasPurchasedBundle) {
          // Check if student has already ordered the book
          const hasOrderedBook = await BookOrder.hasUserOrderedBook(
            studentId,
            bundle._id
          );
          
          if (!hasOrderedBook) {
            bookPurchaseInfo = {
              bundleId: bundle._id.toString(),
              bundleTitle: bundle.title,
              bundleCode: bundle.bundleCode,
              bookName: bundle.bookName,
              bookPrice: bundle.bookPrice,
              thumbnail: bundle.thumbnail || '/images/bundle-placeholder.jpg',
            };
          }
        }
      }
    }

    res.render('student/course-details', {
      title: `${course.title} - Course Details | ELKABLY`,
      student,
      course,
      enrollment,
      topicsWithProgress,
      courseProgress,
      bookPurchaseInfo, // Pass book purchase info to view
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Course details error:', error);
    req.flash('error_msg', 'Error loading course details');
    res.redirect('/student/enrolled-courses');
  }
};

// Helper function to get content type icons
const getContentIcon = (type) => {
  const icons = {
    video: 'play-circle',
    pdf: 'file-pdf',
    quiz: 'question-circle',
    homework: 'tasks',
    assignment: 'clipboard-list',
    reading: 'book-open',
    link: 'external-link-alt',
    zoom: 'video', // Add Zoom meeting icon
  };
  return icons[type] || 'file';
};

// Course Content - View course content with topics and prerequisites
const courseContent = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const courseId = req.params.id;

    const student = await User.findById(studentId);
    const enrollment = student.enrolledCourses.find(
      (e) => e.course.toString() === courseId
    );

    if (!enrollment) {
      req.flash('error_msg', 'You are not enrolled in this course');
      return res.redirect('/student/enrolled-courses');
    }

    const course = await Course.findById(courseId)
      .populate({
        path: 'topics',
        populate: [
          {
            path: 'content',
            model: 'ContentItem',
          },
          {
            path: 'content.zoomMeeting',
            model: 'ZoomMeeting',
          },
        ],
      })
      .populate('bundle', 'name')
      .populate('createdBy', 'name');

    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect('/student/enrolled-courses');
    }

    // Check if course is unlocked
    const unlockStatus = await Course.isCourseUnlocked(studentId, courseId);
    if (!unlockStatus.unlocked) {
      req.flash(
        'error_msg',
        unlockStatus.reason ||
          'This course is locked. Please complete the previous courses first.'
      );
      return res.redirect('/student/enrolled-courses');
    }

    // Get completed content IDs for this course
    const completedContentIds = student.getCompletedContentIds(courseId);

    // Process topics with enhanced content status
    const topicsWithProgress = await Promise.all(
      course.topics.map(async (topic) => {
        const topicCompleted = enrollment.completedTopics.includes(topic._id);

        // Calculate topic progress based on actual completion percentages
        const topicProgress = await student.calculateTopicProgress(
          courseId,
          topic._id
        );

        // Process content items with enhanced unlock/completion status
        const contentWithStatus = topic.content.map((contentItem, index) => {
          const isCompleted = completedContentIds.includes(
            contentItem._id.toString()
          );
          const unlockStatus = student.isContentUnlocked(
            courseId,
            contentItem._id,
            contentItem
          );

          // Get content progress details for more accurate completion status
          const contentProgressDetails = student.getContentProgressDetails(
            courseId,
            contentItem._id
          );
          const actualProgress = contentProgressDetails
            ? contentProgressDetails.progressPercentage
            : 0;

          // Get watch count for video content
          const watchCount = contentProgressDetails?.watchCount || 0;

          // Get prerequisite names and IDs for better user experience
          let prerequisiteNames = [];
          let prerequisiteData = [];
          if (
            contentItem.prerequisites &&
            contentItem.prerequisites.length > 0
          ) {
            // Find prerequisite content names and IDs
            const allContent = course.topics.flatMap((t) => t.content);
            prerequisiteData = contentItem.prerequisites.map((prereqId) => {
              const prereqContent = allContent.find(
                (c) => c._id.toString() === prereqId.toString()
              );
              return {
                id: prereqId.toString(),
                title: prereqContent ? prereqContent.title : 'Unknown Content',
              };
            });
            prerequisiteNames = prerequisiteData.map((p) => p.title);
          }

          return {
            ...contentItem.toObject(),
            isUnlocked: unlockStatus.unlocked,
            isCompleted: isCompleted,
            actualProgress: actualProgress,
            watchCount: watchCount,
            unlockReason: unlockStatus.reason,
            canAccess: unlockStatus.unlocked || isCompleted,
            prerequisiteNames: prerequisiteNames,
            prerequisiteData: prerequisiteData,
            contentIndex: index,
            topicId: topic._id,
          };
        });

        return {
          ...topic.toObject(),
          content: contentWithStatus,
          completed: topicCompleted,
          progress: topicProgress,
        };
      })
    );

    // Check if course has a bundle and if student can purchase the book
    let bookPurchaseInfo = null;
    if (course.bundle) {
      const BundleCourse = require('../models/BundleCourse');
      const BookOrder = require('../models/BookOrder');
      
      const bundle = await BundleCourse.findById(course.bundle._id || course.bundle)
        .select('_id title bundleCode hasBook bookName bookPrice thumbnail');
      
      if (bundle && bundle.hasBook && bundle.bookPrice > 0) {
        // Check if student has purchased the bundle
        const hasPurchasedBundle = student.hasPurchasedBundle(bundle._id.toString());
        
        if (hasPurchasedBundle) {
          // Check if student has already ordered the book
          const hasOrderedBook = await BookOrder.hasUserOrderedBook(
            studentId,
            bundle._id
          );
          
          if (!hasOrderedBook) {
            bookPurchaseInfo = {
              bundleId: bundle._id.toString(),
              bundleTitle: bundle.title,
              bundleCode: bundle.bundleCode,
              bookName: bundle.bookName,
              bookPrice: bundle.bookPrice,
              thumbnail: bundle.thumbnail || '/images/bundle-placeholder.jpg',
            };
          }
        }
      }
    }

    res.render('student/course-content', {
      title: `${course.title} - Course Content | ELKABLY`,
      student,
      course,
      enrollment,
      topicsWithProgress,
      user: req.session.user, // Pass user session for admin checks
      getContentIcon, // Pass the helper function to the template
      bookPurchaseInfo, // Pass book purchase info to view
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Course content error:', error);
    req.flash('error_msg', 'Error loading course content');
    res.redirect('/student/enrolled-courses');
  }
};

// Content Details - View specific content item
const contentDetails = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const contentId = req.params.id;

    const student = await User.findById(studentId);

    // Find the content across all enrolled courses
    let contentItem = null;
    let course = null;
    let topic = null;

    for (const enrollment of student.enrolledCourses) {
      const courseData = await Course.findById(enrollment.course).populate({
        path: 'topics',
        populate: [
          {
            path: 'content',
            model: 'ContentItem',
          },
          {
            path: 'content.zoomMeeting',
            model: 'ZoomMeeting',
          },
        ],
      });

      if (courseData) {
        for (const topicData of courseData.topics) {
          const foundContent = topicData.content.find(
            (c) => c._id.toString() === contentId
          );
          if (foundContent) {
            contentItem = foundContent;
            course = courseData;
            topic = topicData;
            break;
          }
        }
        if (contentItem) break;
      }
    }

    if (!contentItem) {
      req.flash(
        'error_msg',
        'Content not found or you are not enrolled in this course'
      );
      return res.redirect('/student/enrolled-courses');
    }

    // Check if content is unlocked
    const unlockStatus = student.isContentUnlocked(
      course._id,
      contentId,
      contentItem
    );
    if (!unlockStatus.unlocked) {
      req.flash('error_msg', `Content is locked: ${unlockStatus.reason}`);
      return res.redirect(`/student/course/${course._id}/content`);
    }

    // Get content progress with detailed data
    const contentProgress = student.getContentProgressDetails(
      course._id,
      contentId
    );

    // Special handling for Zoom content completion
    let isCompleted = contentProgress
      ? contentProgress.completionStatus === 'completed'
      : false;

    // For Zoom content, check if student attended live OR watched recording
    if (contentItem.type === 'zoom' && contentItem.zoomMeeting) {
      const zoomMeeting = contentItem.zoomMeeting;
      const studentIdStr = studentId.toString();

      // Check if student attended the live session
      const attendedLive =
        zoomMeeting.studentsAttended &&
        zoomMeeting.studentsAttended.some(
          (attendance) => attendance.student.toString() === studentIdStr
        );

      // Check if student watched the recording
      const watchedRecording =
        zoomMeeting.studentsWatchedRecording &&
        zoomMeeting.studentsWatchedRecording.some(
          (record) =>
            record.student.toString() === studentIdStr &&
            record.completedWatching
        );

      // If student either attended live OR watched recording, mark as completed
      if ((attendedLive || watchedRecording) && !isCompleted) {
        isCompleted = true;
        // Note: We don't automatically update the progress here to avoid side effects
        // The progress will be updated when they click "Mark as Watched" button
      }

    }

    const progressPercentage = contentProgress
      ? contentProgress.progressPercentage || 0
      : 0;

    // Get quiz attempts if it's a quiz/homework content
    let attempts = 0;
    let bestScore = 0;
    let attemptsList = [];
    if (contentProgress && contentProgress.quizAttempts) {
      attempts = contentProgress.quizAttempts.length;
      bestScore = contentProgress.bestScore || 0;
      attemptsList = contentProgress.quizAttempts;
    } else if (contentProgress) {
      attempts = contentProgress.attempts || 0;
      bestScore = contentProgress.bestScore || 0;
    }

    // Get navigation data (previous and next content)
    const allContent = course.topics.flatMap((t) =>
      t.content.map((c) => ({ ...c.toObject(), topicId: t._id }))
    );
    const currentIndex = allContent.findIndex(
      (c) => c._id.toString() === contentId
    );

    let previousContent = null;
    let nextContent = null;

    if (currentIndex > 0) {
      previousContent = allContent[currentIndex - 1];
    }

    if (currentIndex < allContent.length - 1) {
      nextContent = allContent[currentIndex + 1];
    }

    // Check if next content is accessible
    let nextContentAccessible = false;
    if (nextContent) {
      // First check the unlock status
      const nextUnlockStatus = student.isContentUnlocked(
        course._id,
        nextContent._id,
        nextContent
      );
      nextContentAccessible = nextUnlockStatus.unlocked;

      // Additional check: if current content is a prerequisite and is Zoom content
      // Make sure it's marked as completed if student attended OR watched recording
      if (
        !nextContentAccessible &&
        contentItem.type === 'zoom' &&
        isCompleted
      ) {
        // Recheck after considering Zoom completion
        const recheck = student.isContentUnlocked(
          course._id,
          nextContent._id,
          nextContent
        );
        nextContentAccessible = recheck.unlocked;
      }
    }


    // Compute server timing for quiz/homework to reflect resume and remaining time
    let serverTiming = null;
    let attemptPolicy = null;
    if (['quiz', 'homework'].includes(contentItem.type)) {
      const durationMinutes =
        contentItem.type === 'quiz'
          ? contentItem.quizSettings && contentItem.quizSettings.duration
            ? contentItem.quizSettings.duration
            : 0
          : contentItem.homeworkSettings &&
            contentItem.homeworkSettings.duration
          ? contentItem.homeworkSettings.duration
          : contentItem.duration || 0;
      const passingScore =
        contentItem.type === 'quiz'
          ? contentItem.quizSettings &&
            typeof contentItem.quizSettings.passingScore === 'number'
            ? contentItem.quizSettings.passingScore
            : 60
          : contentItem.homeworkSettings &&
            typeof contentItem.homeworkSettings.passingScore === 'number'
          ? contentItem.homeworkSettings.passingScore
          : 60;

      let remainingSeconds = 0;
      let isExpired = false;
      if (
        contentProgress &&
        contentProgress.expectedEnd &&
        durationMinutes > 0
      ) {
        remainingSeconds = Math.max(
          0,
          Math.floor(
            (new Date(contentProgress.expectedEnd).getTime() - Date.now()) /
              1000
          )
        );
        isExpired = remainingSeconds === 0;
      }
      serverTiming = {
        durationMinutes,
        passingScore,
        remainingSeconds,
        isExpired,
      };

      // Attempts policy
      const maxAttempts =
        contentItem.type === 'quiz'
          ? contentItem.quizSettings && contentItem.quizSettings.maxAttempts
            ? contentItem.quizSettings.maxAttempts
            : 0
          : contentItem.homeworkSettings &&
            contentItem.homeworkSettings.maxAttempts
          ? contentItem.homeworkSettings.maxAttempts
          : 0;
      const totalAttemptsUsed = attempts;
      const remainingAttempts =
        maxAttempts > 0 ? Math.max(0, maxAttempts - totalAttemptsUsed) : null;
      const outOfAttempts = maxAttempts > 0 && remainingAttempts === 0;
      attemptPolicy = { maxAttempts, remainingAttempts, outOfAttempts };
    }

    // Video watch limit info
    let watchLimitInfo = null;
    if (contentItem.type === 'video') {
      const watchCount = contentProgress?.watchCount || 0;
      const maxWatchCount = contentItem.maxWatchCount;
      const hasLimit = maxWatchCount !== null && maxWatchCount !== undefined && maxWatchCount !== -1;
      const watchesLeft = hasLimit ? Math.max(0, maxWatchCount - watchCount) : null;
      const limitReached = hasLimit && watchCount >= maxWatchCount;

      watchLimitInfo = {
        watchCount: watchCount,
        maxWatchCount: maxWatchCount,
        hasLimit: hasLimit,
        watchesLeft: watchesLeft,
        limitReached: limitReached,
        canWatch: !limitReached,
      };
    }

    res.render('student/content-details', {
      title: `${contentItem.title} - Content | ELKABLY`,
      student,
      course,
      topic,
      contentItem,
      contentProgress: {
        isCompleted: isCompleted,
        progressPercentage: progressPercentage,
        completionStatus: contentProgress
          ? contentProgress.completionStatus
          : 'not_started',
        lastAccessed: contentProgress ? contentProgress.lastAccessed : null,
        completedAt: contentProgress ? contentProgress.completedAt : null,
        attempts: attempts,
        bestScore: bestScore,
        attemptsList: attemptsList,
      },
      timing: serverTiming,
      attemptPolicy: attemptPolicy,
      watchLimitInfo: watchLimitInfo,
      requiresAcknowledgment:
        !isCompleted &&
        ['pdf', 'reading', 'link', 'assignment'].includes(contentItem.type),
      navigation: {
        previousContent: previousContent,
        nextContent: nextContent,
        nextContentAccessible: nextContentAccessible,
        currentIndex: currentIndex,
        totalContent: allContent.length,
      },
      getContentIcon, // Pass the helper function to the template
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Content details error:', error);
    req.flash('error_msg', 'Error loading content');
    res.redirect('/student/enrolled-courses');
  }
};

// Update Content Progress - AJAX endpoint to update progress
const updateContentProgress = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { courseId, topicId, contentId, contentType, progressData } =
      req.body;


    const student = await User.findById(studentId);

    // Validate enrollment
    const enrollment = student.enrolledCourses.find(
      (e) => e.course.toString() === courseId
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course',
      });
    }

    console.log(
      'Before update - enrollment contentProgress length:',
      enrollment.contentProgress.length
    );

    // Check if this is a NEW completion BEFORE updating (to avoid duplicate notifications)
    const existingProgress = enrollment.contentProgress.find(
      (cp) => cp.contentId.toString() === contentId.toString()
    );
    const wasAlreadyCompleted = existingProgress && 
      existingProgress.completionStatus === 'completed';
    const isNewCompletion = progressData && 
      progressData.completionStatus === 'completed' && 
      !wasAlreadyCompleted;

    // Get course and topic data for notification (before update)
    let contentTitle = 'Content';
    let isZoomContent = false;
    let shouldSendNotification = false;
    let contentItem = null;
    
    // Fetch content item for validation
    try {
      const course = await Course.findById(courseId);
      const topic = await Topic.findById(topicId);

      if (topic && topic.content) {
        contentItem = topic.content.find(
          (c) => c._id.toString() === contentId
        );
        if (contentItem) {
          contentTitle = contentItem.title;
          isZoomContent = contentItem.type === 'zoom';
          // Only send notification if NOT zoom content (zoom meeting end sends its own SMS)
          shouldSendNotification = !isZoomContent && isNewCompletion;
        }
      }
    } catch (error) {
      console.error('Error checking content type:', error);
    }

    // VIDEO WATCH LIMIT VALIDATION
    // If this is a video content and trying to mark as completed, check watch limit
    // Check on EVERY completion attempt (not just new completions) to enforce limits
    if (contentItem && contentItem.type === 'video' && progressData && progressData.completionStatus === 'completed') {
      const maxWatchCount = contentItem.maxWatchCount;
      
      // If maxWatchCount is set (not null/undefined/-1), enforce the limit
      if (maxWatchCount !== null && maxWatchCount !== undefined && maxWatchCount !== -1 && maxWatchCount > 0) {
        const currentWatchCount = existingProgress?.watchCount || 0;
        
        // Check if student has reached the watch limit BEFORE allowing this completion
        // Since watch count will increment after this check, we check if current count >= max
        if (currentWatchCount >= maxWatchCount) {
          return res.status(403).json({
            success: false,
            message: `You have reached the maximum watch limit (${maxWatchCount} times) for this video.`,
            watchCount: currentWatchCount,
            maxWatchCount: maxWatchCount,
            limitReached: true,
          });
        }
      }
      
      // ==================== ANTI-SKIP VALIDATION ====================
      // Validate that student actually watched 90% of the video (not just skipped to the end)
      if (progressData.watchData) {
        const watchData = progressData.watchData;
        const REQUIRED_WATCH_PERCENTAGE = 90;
        
        // Backend validation: Calculate actual watched time from segments
        let totalWatchedTime = 0;
        
        if (watchData.watchedSegments && Array.isArray(watchData.watchedSegments)) {
          // Merge and validate segments
          const segments = watchData.watchedSegments
            .filter(seg => seg.start >= 0 && seg.end > seg.start) // Valid segments only
            .sort((a, b) => a.start - b.start);
          
          // Merge overlapping segments to get accurate total
          const mergedSegments = [];
          for (const segment of segments) {
            if (mergedSegments.length === 0) {
              mergedSegments.push({start: segment.start, end: segment.end});
            } else {
              const last = mergedSegments[mergedSegments.length - 1];
              if (segment.start <= last.end + 0.5) {
                // Overlapping or adjacent - merge
                last.end = Math.max(last.end, segment.end);
              } else {
                // New separate segment
                mergedSegments.push({start: segment.start, end: segment.end});
              }
            }
          }
          
          // Calculate total watched time
          for (const segment of mergedSegments) {
            totalWatchedTime += (segment.end - segment.start);
          }
        }
        
        // Validate against video duration
        const videoDuration = watchData.videoDuration || 0;
        
        if (videoDuration > 0) {
          const actualWatchPercentage = (totalWatchedTime / videoDuration) * 100;
          
          // Log for debugging
          console.log(`Video Watch Validation - Student: ${studentId}, Content: ${contentId}`);
          console.log(`  Duration: ${videoDuration}s, Watched: ${totalWatchedTime.toFixed(2)}s (${actualWatchPercentage.toFixed(2)}%)`);
          console.log(`  Required: ${REQUIRED_WATCH_PERCENTAGE}%, Result: ${actualWatchPercentage >= REQUIRED_WATCH_PERCENTAGE ? 'PASS' : 'FAIL'}`);
          
          // Reject if student didn't watch enough
          if (actualWatchPercentage < REQUIRED_WATCH_PERCENTAGE) {
            return res.status(400).json({
              success: false,
              message: `You must watch at least ${REQUIRED_WATCH_PERCENTAGE}% of the video to complete it. You have watched ${actualWatchPercentage.toFixed(1)}%. Skipping is not allowed.`,
              watchPercentage: actualWatchPercentage,
              requiredPercentage: REQUIRED_WATCH_PERCENTAGE,
            });
          }
        }
      }
    }

    // Update content progress
    await student.updateContentProgress(
      courseId,
      topicId,
      contentId,
      contentType,
      progressData
    );

    // Refresh student data to get updated progress
    const updatedStudent = await User.findById(studentId);
    const updatedEnrollment = updatedStudent.enrolledCourses.find(
      (e) => e.course.toString() === courseId
    );


    // Get updated progress
    const updatedProgress = updatedStudent.getContentProgressDetails(
      courseId,
      contentId
    );

    // Send WhatsApp notification to parent for content completion
    // Only send if this is a NEW completion (not a re-completion)
    // Skip if this is a zoom content completion (zoom meeting end will send its own detailed SMS)
    try {
      // Check if content is completed AND it's a NEW completion
      // Skip zoom content - zoom meeting end will send detailed SMS
      if (progressData && progressData.completionStatus === 'completed' && !isZoomContent && isNewCompletion) {
        // Get course and topic data for notification (only if we need to send)
      const course = await Course.findById(courseId);
      const topic = await Topic.findById(topicId);

      // Find the actual content item to get its title
      let contentTitle = 'Content';
      if (topic && topic.content) {
        const contentItem = topic.content.find(
          (c) => c._id.toString() === contentId
        );
        if (contentItem) {
          contentTitle = contentItem.title;
        }
      }

        // Send notification for NEW completion
          await whatsappSMSNotificationService.sendContentCompletionNotification(
            studentId,
            { title: contentTitle, type: contentType },
            course
          );
      }
    } catch (whatsappError) {
      console.error('WhatsApp notification error:', whatsappError);
      // Don't fail the progress update if WhatsApp fails
    }

    // Prepare response with watch count info for videos
    const response = {
      success: true,
      contentProgress: updatedProgress,
      courseProgress: updatedEnrollment.progress,
      totalContentProgress: updatedEnrollment.contentProgress.length,
      message: 'Progress updated successfully',
    };
    
    // Add watch count info for video content
    if (contentItem && contentItem.type === 'video') {
      const finalProgress = updatedEnrollment.contentProgress.find(
        (cp) => cp.contentId.toString() === contentId.toString()
      );
      response.watchCount = finalProgress?.watchCount || 0;
      response.maxWatchCount = contentItem.maxWatchCount;
    }
    
    res.json(response);
  } catch (error) {
    console.error('Update content progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating progress',
    });
  }
};

// Quizzes - View all available quizzes
const quizzes = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    const student = await User.findById(studentId);
    const enrolledCourseIds = student.enrolledCourses
      .filter((e) => e.course)
      .map((e) => e.course);

    // Get all active quizzes with enhanced data (no pagination for grouping)
    const allQuizzes = await Quiz.find({
      status: 'active',
    })
      .populate('questionBank', 'name description totalQuestions')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean({ virtuals: true }); // Include virtual fields like totalQuestions

    // Group quizzes by testType
    const groupedQuizzes = {
      EST: [],
      SAT: [],
      ACT: []
    };

    allQuizzes.forEach(quiz => {
      if (quiz.testType && groupedQuizzes[quiz.testType]) {
        groupedQuizzes[quiz.testType].push(quiz);
      }
    });

    // Get counts for each test type
    const testTypeCounts = {
      EST: groupedQuizzes.EST.length,
      SAT: groupedQuizzes.SAT.length,
      ACT: groupedQuizzes.ACT.length
    };

    const totalQuizzes = allQuizzes.length;

    // Get student's quiz attempts
    const studentQuizAttempts = student.quizAttempts || [];

    res.render('student/quizzes', {
      title: 'Available Quizzes | ELKABLY',
      student,
      quizzes: allQuizzes, // Keep for backward compatibility if needed
      groupedQuizzes, // New grouped structure
      testTypeCounts, // Counts for each test type
      studentQuizAttempts,
      pagination: {
        currentPage: page,
        totalPages: 1, // No pagination when grouped
        hasNext: false,
        hasPrev: false,
        nextPage: null,
        prevPage: null,
      },
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Quizzes error:', error);
    req.flash('error_msg', 'Error loading quizzes');
    res.redirect('/student/dashboard');
  }
};

// Take Quiz - Start a quiz
const takeQuiz = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const quizId = req.params.id;

    const student = await User.findById(studentId);
    const quiz = await Quiz.findById(quizId)
      .populate('selectedQuestions.question')
      .populate('questionBank');

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/student/quizzes');
    }

    // Check if quiz is active
    if (quiz.status !== 'active') {
      req.flash('error_msg', 'This quiz is not currently available');
      return res.redirect('/student/quizzes');
    }

    // Check attempt limit
    const studentQuizAttempt = student.quizAttempts.find(
      (attempt) => attempt.quiz.toString() === quizId
    );

    if (
      studentQuizAttempt &&
      studentQuizAttempt.attempts.length >= quiz.maxAttempts
    ) {
      req.flash(
        'error_msg',
        `You have reached the maximum number of attempts (${quiz.maxAttempts}) for this quiz`
      );
      return res.redirect('/student/quizzes');
    }

    // Note: Shuffling is now handled in getSecureStandaloneQuizQuestions
    // We just pass the original questions here, frontend will load shuffled version
    res.render('student/take-quiz', {
      title: `${quiz.title} - Quiz | ELKABLY`,
      student,
      quiz: {
        ...quiz.toObject(),
        selectedQuestions: quiz.selectedQuestions,
      },
      attemptNumber: studentQuizAttempt
        ? studentQuizAttempt.attempts.length + 1
        : 1,
      settings: {
        shuffleQuestions: quiz.shuffleQuestions || false,
        shuffleOptions: quiz.shuffleOptions || false,
        showCorrectAnswers: quiz.showCorrectAnswers !== false,
        showResults: quiz.showResults !== false,
        instructions: quiz.instructions || '',
      },
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Take quiz error:', error);
    req.flash('error_msg', 'Error starting quiz');
    res.redirect('/student/quizzes');
  }
};

// Submit Quiz - Submit quiz answers
const submitQuiz = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const quizId = req.params.id;
    const answers = req.body.answers || {};

    const student = await User.findById(studentId);
    const quiz = await Quiz.findById(quizId).populate(
      'selectedQuestions.question'
    );

    if (!quiz) {
      return res
        .status(404)
        .json({ success: false, message: 'Quiz not found' });
    }

    // Calculate score
    let correctAnswers = 0;
    let totalPoints = 0;
    const detailedAnswers = [];

    quiz.selectedQuestions.forEach((selectedQ) => {
      const question = selectedQ.question;
      const userAnswer = answers[question._id.toString()];
      let isCorrect = false;
      let points = 0;

      if (question.questionType === 'Written') {
        // Handle written questions with multiple correct answers using helper method
        isCorrect = question.isCorrectWrittenAnswer(userAnswer);
      } else {
        // Handle MCQ and True/False questions using the improved method
        // This now supports both text-based (shuffle-safe) and index-based (backward compatible) answers
        isCorrect = question.isCorrectMCQAnswer(userAnswer);
      }

      if (isCorrect) {
        correctAnswers++;
        totalPoints += selectedQ.points || 1;
        points = selectedQ.points || 1;
      }

      detailedAnswers.push({
        questionId: question._id,
        selectedAnswer: userAnswer,
        correctAnswer:
          question.questionType === 'Written'
            ? question.getAllCorrectAnswers()
            : Array.isArray(question.correctAnswer)
            ? question.correctAnswer[0]
            : question.correctAnswer,
        isCorrect,
        points,
        questionType: question.questionType,
      });
    });

    const score =
      quiz.selectedQuestions.length > 0
        ? Math.round((correctAnswers / quiz.selectedQuestions.length) * 100)
        : 0;

    const attemptData = {
      score,
      totalQuestions: quiz.selectedQuestions.length,
      correctAnswers,
      timeSpent: parseInt(req.body.timeSpent) || 0,
      startedAt: new Date(req.body.startedAt),
      completedAt: new Date(),
      status: 'completed',
      answers: detailedAnswers,
    };

    // Save quiz attempt
    await student.addQuizAttempt(quizId, attemptData);

    // Record progress
    const progress = new Progress({
      student: studentId,
      course: null, // Would need to be determined based on quiz-course relationship
      activity: score >= quiz.passingScore ? 'quiz_passed' : 'quiz_failed',
      details: {
        score,
        timeSpent: attemptData.timeSpent,
        points: totalPoints,
        quizTitle: quiz.title,
      },
      points: totalPoints,
      experience: totalPoints * 10, // Convert points to experience
    });
    await progress.save();

    // Send WhatsApp notification to parent
    try {
      await whatsappSMSNotificationService.sendQuizCompletionNotification(
        studentId,
        quiz,
        correctAnswers,
        quiz.selectedQuestions.length
      );
    } catch (whatsappError) {
      console.error('WhatsApp notification error:', whatsappError);
      // Don't fail the quiz submission if WhatsApp fails
    }

    res.json({
      success: true,
      score,
      correctAnswers,
      totalQuestions: quiz.selectedQuestions.length,
      passed: score >= quiz.passingScore,
      passingScore: quiz.passingScore,
      points: totalPoints,
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ success: false, message: 'Error submitting quiz' });
  }
};

// Wishlist - View wishlist
const wishlist = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    const student = await User.findById(studentId);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    // Get wishlist courses
    const Course = require('../models/Course');
    const BundleCourse = require('../models/BundleCourse');

    const wishlistCourseIds = student.wishlist.courses || [];
    const wishlistBundleIds = student.wishlist.bundles || [];

    // Fetch courses
    const wishlistCourses = await Course.find({
      _id: { $in: wishlistCourseIds },
    }).select(
      'title description shortDescription thumbnail level duration tags topics price'
    );

    // Fetch bundles
    const wishlistBundles = await BundleCourse.find({
      _id: { $in: wishlistBundleIds },
    })
      .populate('courses', 'title duration')
      .select(
        'title description shortDescription thumbnail year subject courseType price discountPrice duration tags courses'
      );

    // Combine and paginate
    const allItems = [
      ...wishlistCourses.map((course) => ({
        ...course.toObject(),
        type: 'course',
      })),
      ...wishlistBundles.map((bundle) => ({
        ...bundle.toObject(),
        type: 'bundle',
      })),
    ];

    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = allItems.slice(skip, skip + limit);

    res.render('student/wishlist', {
      title: 'My Wishlist | ELKABLY',
      student,
      wishlistCourses: paginatedItems.filter((item) => item.type === 'course'),
      wishlistBundles: paginatedItems.filter((item) => item.type === 'bundle'),
      pagination: {
        currentPage: page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Wishlist error:', error);
    req.flash('error_msg', 'Error loading wishlist');
    res.redirect('/student/dashboard');
  }
};

// Add to Wishlist
const addToWishlist = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const itemId = req.params.id;
    const itemType = req.query.type || 'course'; // 'course' or 'bundle'

    const student = await User.findById(studentId);

    if (itemType === 'course') {
      await student.addCourseToWishlist(itemId);
      req.flash('success_msg', 'Course added to wishlist');
    } else if (itemType === 'bundle') {
      await student.addBundleToWishlist(itemId);
      req.flash('success_msg', 'Bundle added to wishlist');
    }

    res.redirect('back');
  } catch (error) {
    console.error('Add to wishlist error:', error);
    req.flash('error_msg', 'Error adding item to wishlist');
    res.redirect('back');
  }
};

// Remove from Wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const itemId = req.params.id;
    const itemType = req.query.type || 'course'; // 'course' or 'bundle'

    const student = await User.findById(studentId);

    if (itemType === 'course') {
      await student.removeCourseFromWishlist(itemId);
      req.flash('success_msg', 'Course removed from wishlist');
    } else if (itemType === 'bundle') {
      await student.removeBundleFromWishlist(itemId);
      req.flash('success_msg', 'Bundle removed from wishlist');
    }

    res.redirect('back');
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    req.flash('error_msg', 'Error removing item from wishlist');
    res.redirect('back');
  }
};

// Order History - View purchase history
const orderHistory = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const student = await User.findById(studentId);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    // Get purchase history
    const purchaseHistory = student.getPurchaseHistory();
    const totalOrders = purchaseHistory.length;
    const totalPages = Math.ceil(totalOrders / limit);
    const paginatedOrders = purchaseHistory.slice(skip, skip + limit);

    // Populate course/bundle details for each order
    const Course = require('../models/Course');
    const BundleCourse = require('../models/BundleCourse');

    const populatedOrders = await Promise.all(
      paginatedOrders.map(async (order) => {
        if (order.type === 'course') {
          const course = await Course.findById(order.course).select(
            'title thumbnail level duration'
          );
          return { ...order, item: course };
        } else if (order.type === 'bundle') {
          const bundle = await BundleCourse.findById(order.bundle)
            .populate('courses', 'title duration')
            .select('title thumbnail year subject duration courses');
          return { ...order, item: bundle };
        }
        return order;
      })
    );

    res.render('student/order-history', {
      title: 'Order History | ELKABLY',
      student,
      orders: populatedOrders,
      pagination: {
        currentPage: page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Order history error:', error);
    req.flash('error_msg', 'Error loading order history');
    res.redirect('/student/dashboard');
  }
};

// Order Details - View specific order details
const orderDetails = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const orderNumber = req.params.orderNumber;

    const student = await User.findById(studentId);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    // First try to find in Purchase model (new system)
    const Purchase = require('../models/Purchase');
    let order = await Purchase.findOne({
      user: studentId,
      orderNumber: orderNumber,
    })
      .populate(
        'appliedPromoCode',
        'code name description discountType discountValue'
      )
      .populate('items.item')
      .lean();

    let isNewSystem = true;

    // If not found in Purchase model, try User model (legacy system)
    if (!order) {
      isNewSystem = false;
      const purchaseHistory = student.getPurchaseHistory();
      order = purchaseHistory.find((p) => p.orderNumber === orderNumber);

      if (!order) {
        req.flash('error_msg', 'Order not found');
        return res.redirect('/student/order-history');
      }
    }

    // Populate item details based on system and type
    const Course = require('../models/Course');
    const BundleCourse = require('../models/BundleCourse');

    let item = null;
    let itemType = 'unknown';
    let courseId = null;
    let bundleId = null;

    if (isNewSystem) {
      // New system - use items array
      const firstItem =
        order.items && order.items.length > 0 ? order.items[0] : null;

      if (firstItem && firstItem.itemType === 'course') {
        itemType = 'course';
        courseId = firstItem.item;
        item = await Course.findById(firstItem.item)
          .populate('topics', 'title description')
          .select(
            'title description shortDescription thumbnail level duration tags topics price'
          );
      } else if (firstItem && firstItem.itemType === 'bundle') {
        itemType = 'bundle';
        bundleId = firstItem.item;
        item = await BundleCourse.findById(firstItem.item)
          .populate(
            'courses',
            'title description shortDescription thumbnail level duration'
          )
          .select(
            'title description shortDescription thumbnail year subject courseType price discountPrice duration tags courses'
          );
      }
    } else {
      // Legacy system - use direct course/bundle fields
      if (order.type === 'course' && order.course) {
        itemType = 'course';
        courseId = order.course;
        item = await Course.findById(order.course)
          .populate('topics', 'title description')
          .select(
            'title description shortDescription thumbnail level duration tags topics price'
          );
      } else if (order.type === 'bundle' && order.bundle) {
        itemType = 'bundle';
        bundleId = order.bundle;
        item = await BundleCourse.findById(order.bundle)
          .populate(
            'courses',
            'title description shortDescription thumbnail level duration'
          )
          .select(
            'title description shortDescription thumbnail year subject courseType price discountPrice duration tags courses'
          );
      }
    }

    // Format the order data for the template
    const formattedOrder = {
      ...order,
      item: item,
      type: itemType,
      course: courseId,
      bundle: bundleId,
      price:
        order.price ||
        (order.items && order.items[0] ? order.items[0].price : 0),
      purchasedAt: order.purchasedAt || order.createdAt,
      // Ensure we have all necessary fields
      orderNumber: order.orderNumber,
      status: order.status || 'completed',
      total: order.total || order.price,
      subtotal: order.subtotal || order.price,
      tax: order.tax || 0,
      discountAmount: order.discountAmount || 0,
      originalAmount: order.originalAmount || order.price,
      appliedPromoCode: order.appliedPromoCode,
      promoCodeUsed: order.promoCodeUsed,
    };

    // Debug logging

    res.render('student/order-details', {
      title: `Order #${orderNumber} | ELKABLY`,
      student,
      order: formattedOrder,
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Order details error:', error);
    req.flash('error_msg', 'Error loading order details');
    res.redirect('/student/order-history');
  }
};

// My HW Attempts - View homework attempts
const homeworkAttempts = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const student = await User.findById(studentId);

    // Get homework-related progress
    const homeworkProgress = await Progress.find({
      student: studentId,
      activity: { $in: ['homework_submitted', 'homework_graded'] },
    })
      .populate('course', 'title')
      .populate('topic', 'title')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalAttempts = await Progress.countDocuments({
      student: studentId,
      activity: { $in: ['homework_submitted', 'homework_graded'] },
    });
    const totalPages = Math.ceil(totalAttempts / limit);

    res.render('student/homework-attempts', {
      title: 'My Homework Attempts | ELKABLY',
      student,
      homeworkProgress,
      pagination: {
        currentPage: page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Homework attempts error:', error);
    req.flash('error_msg', 'Error loading homework attempts');
    res.redirect('/student/dashboard');
  }
};

// My Profile - View and edit profile
const profile = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const student = await User.findById(studentId);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    // Get achievements
    const achievements = await Progress.getStudentAchievements(studentId);

    res.render('student/profile', {
      title: 'My Profile | ELKABLY',
      student,
      achievements,
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Profile error:', error);
    req.flash('error_msg', 'Error loading profile');
    res.redirect('/student/dashboard');
  }
};

// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP for profile phone number change
const sendProfileOTP = async (req, res) => {
  try {
    const { phoneNumber, countryCode } = req.body;

    if (!phoneNumber || !countryCode) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and country code are required',
      });
    }

    // Validate phone number format
    const cleanPhoneNumber = phoneNumber.replace(/[^\d]/g, '');
    if (!cleanPhoneNumber || cleanPhoneNumber.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
      });
    }

    // Rate limiting: Check OTP send attempts (3 attempts per hour)
    const attemptsKey = 'profile_otp_attempts';
    const attemptsBlockedKey = 'profile_otp_blocked_until';
    const maxAttempts = 3;
    const blockDuration = 60 * 60 * 1000; // 1 hour in milliseconds

    // Initialize attempts counter if not exists
    if (!req.session[attemptsKey]) {
      req.session[attemptsKey] = 0;
    }

    // Check if user is currently blocked
    const blockedUntil = req.session[attemptsBlockedKey];
    if (blockedUntil && Date.now() < blockedUntil) {
      const remainingMinutes = Math.ceil(
        (blockedUntil - Date.now()) / (60 * 1000)
      );
      return res.status(429).json({
        success: false,
        message: `Too many OTP requests. Please try again after ${remainingMinutes} minute(s).`,
        blockedUntil: blockedUntil,
        retryAfter: remainingMinutes,
      });
    }

    // Reset attempts if block period has passed
    if (blockedUntil && Date.now() >= blockedUntil) {
      req.session[attemptsKey] = 0;
      delete req.session[attemptsBlockedKey];
    }

    // Check if user has exceeded max attempts (check BEFORE incrementing)
    if (req.session[attemptsKey] >= maxAttempts) {
      const blockUntil = Date.now() + blockDuration;
      req.session[attemptsBlockedKey] = blockUntil;
      const remainingMinutes = Math.ceil(blockDuration / (60 * 1000));

      return res.status(429).json({
        success: false,
        message: `You have exceeded the maximum number of OTP requests (${maxAttempts}). Please try again after ${remainingMinutes} minute(s).`,
        blockedUntil: blockUntil,
        retryAfter: remainingMinutes,
      });
    }

    // Increment attempts counter (only if not blocked)
    req.session[attemptsKey] = (req.session[attemptsKey] || 0) + 1;

    // Generate OTP
    const otp = generateOTP();
    const fullPhoneNumber = countryCode + cleanPhoneNumber;

    // Store OTP in session with expiration (5 minutes)
    req.session.profile_otp = otp;
    req.session.profile_otp_expiry = Date.now() + 5 * 60 * 1000; // 5 minutes
    req.session.profile_phone_verified = false;
    req.session.profile_phone_number = fullPhoneNumber;

    // Check if country code is NOT Egyptian (+20)
    const isEgyptian = countryCode === '+20' || countryCode === '20';
    const message = `Your ELKABLY verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;

    try {
      if (isEgyptian) {
        // Send via SMS for Egyptian numbers
        const { sendSms } = require('../utils/sms');
        await sendSms({
          recipient: fullPhoneNumber,
          message: message,
        });
        console.log(`Profile OTP sent via SMS to ${fullPhoneNumber}`);
      } else {
        // Send via WhatsApp for non-Egyptian numbers
        const wasender = require('../utils/wasender');
        const SESSION_API_KEY = process.env.WASENDER_SESSION_API_KEY || process.env.WHATSAPP_SESSION_API_KEY || '';
        
        if (!SESSION_API_KEY) {
          throw new Error('WhatsApp session API key not configured');
        }

        // Format phone number for WhatsApp (remove + and ensure proper format)
        const cleanPhone = fullPhoneNumber.replace(/^\+/, '').replace(/\D/g, '');
        const whatsappJid = `${cleanPhone}@s.whatsapp.net`;
        
        const result = await wasender.sendTextMessage(SESSION_API_KEY, whatsappJid, message);
        
        if (!result.success) {
          // Check if the error is about JID not existing on WhatsApp
          const errorMessage = result.message || '';
          const hasJidError = errorMessage.toLowerCase().includes('jid does not exist') || 
                             errorMessage.toLowerCase().includes('does not exist on whatsapp') ||
                             (result.errors && result.errors.to && 
                              result.errors.to.some(err => err.toLowerCase().includes('does not exist')));
          
          if (hasJidError) {
            throw new Error('This phone number does not have WhatsApp or WhatsApp is not available for this number. Please use an Egyptian phone number (+20) to receive OTP via SMS, or ensure your phone number is registered on WhatsApp.');
          }
          
          throw new Error(result.message || 'Failed to send WhatsApp message');
        }
        
        console.log(`Profile OTP sent via WhatsApp to ${fullPhoneNumber}`);
      }

      return res.json({
        success: true,
        message: 'OTP sent successfully',
        expiresIn: 300, // 5 minutes in seconds
        attemptsRemaining: maxAttempts - req.session[attemptsKey],
      });
    } catch (error) {
      console.error(`${isEgyptian ? 'SMS' : 'WhatsApp'} sending error:`, error);

      // Clear session on failure
      delete req.session.profile_otp;
      delete req.session.profile_otp_expiry;

      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.',
        error: error.message,
      });
    }
  } catch (error) {
    console.error('Send profile OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while sending OTP',
      error: error.message,
    });
  }
};

// Verify OTP for profile phone number change
const verifyProfileOTP = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'OTP is required',
      });
    }

    const storedOTP = req.session.profile_otp;
    const expiryTime = req.session.profile_otp_expiry;

    // Check if OTP exists
    if (!storedOTP || !expiryTime) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired. Please request a new OTP.',
      });
    }

    // Check if OTP has expired
    if (Date.now() > expiryTime) {
      delete req.session.profile_otp;
      delete req.session.profile_otp_expiry;
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    // Verify OTP
    if (otp.toString() !== storedOTP.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.',
      });
    }

    // Mark phone as verified
    req.session.profile_phone_verified = true;

    // Clear OTP from session (one-time use)
    delete req.session.profile_otp;
    delete req.session.profile_otp_expiry;

    // Reset OTP attempts counter on successful verification
    delete req.session.profile_otp_attempts;
    delete req.session.profile_otp_blocked_until;

    return res.json({
      success: true,
      message: 'OTP verified successfully',
    });
  } catch (error) {
    console.error('Verify profile OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while verifying OTP',
      error: error.message,
    });
  }
};

// Update Profile
const updateProfile = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const updates = req.body;

    // Get current student data to compare phone numbers
    const currentStudent = await User.findById(studentId);
    if (!currentStudent) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Remove sensitive fields that shouldn't be updated directly
    delete updates.password;
    delete updates.role;
    delete updates.isActive;
    delete updates.studentCode;
    delete updates.email; // Email should not be editable
    delete updates.username; // Username should not be editable
    
    // Block phone number changes - students cannot change their phone numbers
    delete updates.studentNumber;
    delete updates.parentNumber;
    delete updates.studentCountryCode;
    delete updates.parentCountryCode;

    // Only allow specific fields to be updated
    const allowedFields = [
      'firstName',
      'lastName',
      'schoolName',
      'grade',
    ];
    const filteredUpdates = {};

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    });

    // Validate required fields
    if (
      filteredUpdates.firstName &&
      filteredUpdates.firstName.trim().length < 2
    ) {
      return res.status(400).json({
        success: false,
        message: 'First name must be at least 2 characters long',
      });
    }

    if (
      filteredUpdates.lastName &&
      filteredUpdates.lastName.trim().length < 2
    ) {
      return res.status(400).json({
        success: false,
        message: 'Last name must be at least 2 characters long',
      });
    }


    const student = await User.findByIdAndUpdate(studentId, filteredUpdates, {
      new: true,
      runValidators: true,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      student: {
        name: student.name,
        firstName: student.firstName,
        lastName: student.lastName,
        schoolName: student.schoolName,
        grade: student.grade,
        studentNumber: student.studentNumber,
        parentNumber: student.parentNumber,
        studentCountryCode: student.studentCountryCode,
        parentCountryCode: student.parentCountryCode,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating profile',
    });
  }
};

// Settings - View settings
const settings = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const student = await User.findById(studentId);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    res.render('student/settings', {
      title: 'Settings | ELKABLY',
      student,
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Settings error:', error);
    req.flash('error_msg', 'Error loading settings');
    res.redirect('/student/dashboard');
  }
};

// Update Settings
const updateSettings = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { theme, notifications, language } = req.body;

    const student = await User.findById(studentId);

    // Update preferences
    const updatedPreferences = { ...student.preferences };

    if (theme) {
      updatedPreferences.theme = theme;
    }

    if (notifications) {
      updatedPreferences.notifications = {
        ...updatedPreferences.notifications,
        ...notifications,
      };
    }

    if (language) {
      updatedPreferences.language = language;
    }

    student.preferences = updatedPreferences;
    await student.save();

    // Update session theme if theme was changed
    if (theme) {
      req.session.user.preferences = student.preferences;

      // Set theme cookie
      res.cookie('theme', theme, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: false,
      });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      preferences: student.preferences,
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating settings',
    });
  }
};

// Update Profile Picture
const updateProfilePicture = async (req, res) => {
  try {
    const studentId = req.session.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided',
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Upload image (uses local storage by default)
    const { uploadImage, deleteImage } = require('../utils/cloudinary');
    const uploadResult = await uploadImage(req.file.buffer, {
      folder: 'profile-pictures',
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    // Delete old profile picture if it exists (handles both Cloudinary and local)
    if (student.profilePicture) {
      try {
        // deleteImage now handles both Cloudinary URLs and local paths
        await deleteImage(student.profilePicture);
      } catch (deleteError) {
        console.error('Error deleting old profile picture:', deleteError);
        // Continue even if deletion fails
      }
    }

    // Update profile picture URL
    student.profilePicture = uploadResult.url;
    await student.save();

    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      profilePicture: student.profilePicture,
    });
  } catch (error) {
    console.error('Update profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile picture',
    });
  }
};

// Change Password
const changePassword = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Verify current password
    const isMatch = await student.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Update password
    student.password = newPassword;
    await student.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password',
    });
  }
};

// Export Data
const exportData = async (req, res) => {
  try {
    const studentId = req.session.user.id;

    const student = await User.findById(studentId)
      .populate('enrolledCourses.course')
      .populate('purchasedCourses.course')
      .populate('purchasedBundles.bundle');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Prepare data for export
    const exportData = {
      studentInfo: {
        name: student.name,
        email: student.studentEmail,
        username: student.username,
        studentCode: student.studentCode,
        grade: student.grade,
        schoolName: student.schoolName,
        joinedAt: student.createdAt,
      },
      learningProgress: {
        enrolledCourses: student.enrolledCourses.map((enrollment) => ({
          courseName: enrollment.course?.name || 'Unknown Course',
          progress: enrollment.progress,
          status: enrollment.status,
          enrolledAt: enrollment.enrolledAt,
          lastAccessed: enrollment.lastAccessed,
          completedTopics: enrollment.completedTopics.length,
        })),
        completedCourses: student.completedCourses,
        totalQuizAttempts: student.totalQuizAttempts,
        averageQuizScore: student.averageQuizScore,
      },
      purchases: {
        courses: student.purchasedCourses.map((purchase) => ({
          courseName: purchase.course?.name || 'Unknown Course',
          price: purchase.price,
          orderNumber: purchase.orderNumber,
          purchasedAt: purchase.purchasedAt,
          status: purchase.status,
        })),
        bundles: student.purchasedBundles.map((purchase) => ({
          bundleName: purchase.bundle?.name || 'Unknown Bundle',
          price: purchase.price,
          orderNumber: purchase.orderNumber,
          purchasedAt: purchase.purchasedAt,
          status: purchase.status,
        })),
      },
      preferences: student.preferences,
      exportedAt: new Date().toISOString(),
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-learning-data-${student.studentCode}-${
        new Date().toISOString().split('T')[0]
      }.json"`
    );

    res.json(exportData);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting data',
    });
  }
};

// Delete Account
const deleteAccount = async (req, res) => {
  try {
    // Account deletion is currently blocked
    return res.status(403).json({
      success: false,
      message: 'Account deletion is temporarily disabled. Please contact support if you need assistance.',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting account',
    });
  }
};

// Take Content Quiz - Start taking quiz/homework
const takeContentQuiz = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const contentId = req.params.id;

    const student = await User.findById(studentId);

    // Find the content across all enrolled courses
    let contentItem = null;
    let course = null;
    let topic = null;

    for (const enrollment of student.enrolledCourses) {
      const courseData = await Course.findById(enrollment.course).populate({
        path: 'topics',
        populate: {
          path: 'content',
          model: 'ContentItem',
        },
      });

      if (courseData) {
        for (const topicData of courseData.topics) {
          const foundContent = topicData.content.find(
            (c) => c._id.toString() === contentId
          );
          if (foundContent) {
            contentItem = foundContent;
            course = courseData;
            topic = topicData;
            break;
          }
        }
        if (contentItem) break;
      }
    }

    if (!contentItem) {
      req.flash(
        'error_msg',
        'Content not found or you are not enrolled in this course'
      );
      return res.redirect('/student/enrolled-courses');
    }

    // Check if content is quiz or homework
    if (!['quiz', 'homework'].includes(contentItem.type)) {
      req.flash('error_msg', 'This content is not a quiz or homework');
      return res.redirect(`/student/content/${contentId}`);
    }

    // Check if content is unlocked
    const unlockStatus = student.isContentUnlocked(
      course._id,
      contentId,
      contentItem
    );
    if (!unlockStatus.unlocked) {
      req.flash('error_msg', `Content is locked: ${unlockStatus.reason}`);
      return res.redirect(`/student/course/${course._id}/content`);
    }

    // Check attempt limits
    const maxAttempts =
      contentItem.type === 'quiz'
        ? contentItem.quizSettings?.maxAttempts || 3
        : contentItem.homeworkSettings?.maxAttempts || 1;

    const canAttempt = student.canAttemptQuiz(
      course._id,
      contentId,
      maxAttempts
    );
    if (!canAttempt.canAttempt) {
      req.flash('error_msg', `Cannot attempt: ${canAttempt.reason}`);
      return res.redirect(`/student/content/${contentId}`);
    }

    // Check existing content progress and persistent timing
    let contentProgress = student.getContentProgressDetails(
      course._id,
      contentId
    );

    if (contentProgress && contentProgress.completionStatus === 'completed') {
      req.flash(
        'info_msg',
        'You have already completed this quiz successfully!'
      );
      return res.redirect(`/student/content/${contentId}/results`);
    }

    // Determine duration in minutes and passing score for quiz/homework
    const durationMinutes =
      contentItem.type === 'quiz'
        ? contentItem.quizSettings && contentItem.quizSettings.duration
          ? contentItem.quizSettings.duration
          : 0
        : contentItem.homeworkSettings && contentItem.homeworkSettings.duration
        ? contentItem.homeworkSettings.duration
        : contentItem.duration || 0;
    const passingScore =
      contentItem.type === 'quiz'
        ? contentItem.quizSettings &&
          typeof contentItem.quizSettings.passingScore === 'number'
          ? contentItem.quizSettings.passingScore
          : 60
        : contentItem.homeworkSettings &&
          typeof contentItem.homeworkSettings.passingScore === 'number'
        ? contentItem.homeworkSettings.passingScore
        : 60;

    // If no progress, create with in_progress and expectedEnd; if exists and no expectedEnd, set it
    if (!contentProgress) {
      const expectedEnd =
        durationMinutes > 0
          ? new Date(Date.now() + durationMinutes * 60 * 1000)
          : null;
      await student.updateContentProgress(
        course._id.toString(),
        topic._id.toString(),
        contentId,
        contentItem.type,
        {
          completionStatus: 'in_progress',
          progressPercentage: 0,
          lastAccessed: new Date(),
          expectedEnd: expectedEnd,
        }
      );
      // refresh contentProgress after update
      const refreshed = await User.findById(studentId);
      contentProgress = refreshed.getContentProgressDetails(
        course._id,
        contentId
      );
    } else if (!contentProgress.expectedEnd && durationMinutes > 0) {
      // Set expectedEnd if missing
      const expectedEnd = new Date(Date.now() + durationMinutes * 60 * 1000);
      await student.updateContentProgress(
        course._id.toString(),
        topic._id.toString(),
        contentId,
        contentItem.type,
        {
          completionStatus:
            contentProgress.completionStatus === 'not_started'
              ? 'in_progress'
              : contentProgress.completionStatus,
          expectedEnd: expectedEnd,
          lastAccessed: new Date(),
        }
      );
      const refreshed = await User.findById(studentId);
      contentProgress = refreshed.getContentProgressDetails(
        course._id,
        contentId
      );
    }

    // Calculate remaining time in seconds based on expectedEnd
    let remainingSeconds = 0;
    let isExpired = false;
    if (contentProgress && contentProgress.expectedEnd && durationMinutes > 0) {
      remainingSeconds = Math.max(
        0,
        Math.floor(
          (new Date(contentProgress.expectedEnd).getTime() - Date.now()) / 1000
        )
      );
      isExpired = remainingSeconds === 0;
      // If expired and still not completed/failed, mark as failed progress-wise (attempt will be created on client auto-submit)
      if (
        isExpired &&
        contentProgress.completionStatus !== 'completed' &&
        contentProgress.completionStatus !== 'failed'
      ) {
        await student.updateContentProgress(
          course._id.toString(),
          topic._id.toString(),
          contentId,
          contentItem.type,
          {
            completionStatus: 'failed',
            progressPercentage: contentProgress.progressPercentage || 0,
            lastAccessed: new Date(),
          }
        );
      }
    }

    // Get content progress to determine attempt number
    const attemptNumber = contentProgress
      ? (contentProgress.attempts || 0) + 1
      : 1;

    // Populate questions for the quiz/homework
    const populatedContent = await Topic.findById(topic._id).populate({
      path: 'content',
      match: { _id: contentId },
      populate: {
        path: 'selectedQuestions.question',
        model: 'Question',
      },
    });

    const populatedContentItem = populatedContent.content.find(
      (c) => c._id.toString() === contentId
    );
    // Get quiz settings
    const settings = populatedContentItem.type === 'quiz' 
      ? populatedContentItem.quizSettings 
      : populatedContentItem.homeworkSettings;

    res.render('student/take-content-quiz', {
      title: `Taking ${contentItem.title} | ELKABLY`,
      student,
      course,
      topic,
      contentItem: populatedContentItem,
      attemptNumber,
      timing: {
        durationMinutes: durationMinutes,
        remainingSeconds: remainingSeconds,
        isExpired: isExpired,
        passingScore: passingScore,
      },
      settings: {
        shuffleQuestions: settings?.shuffleQuestions || false,
        shuffleOptions: settings?.shuffleOptions || false,
        showCorrectAnswers: settings?.showCorrectAnswers !== false,
        showResults: settings?.showResults !== false,
        instructions: settings?.instructions || '',
      },
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Take content quiz error:', error);
    req.flash('error_msg', 'Error starting quiz');
    res.redirect('/student/enrolled-courses');
  }
};

// Submit Content Quiz - Submit quiz/homework answers
const submitContentQuiz = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const {
      contentId,
      courseId,
      topicId,
      contentType,
      answers,
      timeSpent,
      startedAt,
      completedAt,
      attemptNumber,
    } = req.body;

    const student = await User.findById(studentId);

    // Find the content to get questions and settings
    let contentItem = null;
    let course = null;
    let topic = null;

    for (const enrollment of student.enrolledCourses) {
      const courseData = await Course.findById(enrollment.course).populate({
        path: 'topics',
        populate: {
          path: 'content',
          model: 'ContentItem',
        },
      });

      if (courseData) {
        for (const topicData of courseData.topics) {
          const foundContent = topicData.content.find(
            (c) => c._id.toString() === contentId
          );
          if (foundContent) {
            contentItem = foundContent;
            course = courseData;
            topic = topicData;
            break;
          }
        }
        if (contentItem) break;
      }
    }

    if (!contentItem) {
      return res.status(404).json({
        success: false,
        message: 'Content not found',
      });
    }

    // Validate enrollment
    const enrollment = student.enrolledCourses.find(
      (e) => e.course.toString() === courseId
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course',
      });
    }

    // Get questions with populated data
    const populatedContent = await Topic.findById(topic._id).populate({
      path: 'content',
      match: { _id: contentId },
      populate: {
        path: 'selectedQuestions.question',
        model: 'Question',
      },
    });

    const populatedContentItem = populatedContent.content.find(
      (c) => c._id.toString() === contentId
    );

    if (!populatedContentItem || !populatedContentItem.selectedQuestions) {
      return res.status(400).json({
        success: false,
        message: 'No questions found for this content',
      });
    }

    // Calculate score and prepare answers
    let correctAnswers = 0;
    let totalQuestions = populatedContentItem.selectedQuestions.length;
    let totalPoints = 0;
    const detailedAnswers = [];

    populatedContentItem.selectedQuestions.forEach((selectedQ, index) => {
      const question = selectedQ.question;
      const userAnswer = answers[question._id.toString()];
      let isCorrect = false;
      let points = 0;

      if (question.questionType === 'Written') {
        // Handle written questions with multiple correct answers using helper method
        isCorrect = question.isCorrectWrittenAnswer(userAnswer);
      } else {
        // Handle MCQ and True/False questions using the improved method
        // This now supports both text-based (shuffle-safe) and index-based (backward compatible) answers
        isCorrect = question.isCorrectMCQAnswer(userAnswer);
      }

      if (isCorrect) {
        correctAnswers++;
        totalPoints += selectedQ.points || 1;
        points = selectedQ.points || 1;
      }

      // Only include answered questions or provide a default value for unanswered ones
      const answerValue =
        userAnswer ||
        (question.questionType === 'Written' ? 'No answer provided' : '0');

      detailedAnswers.push({
        questionId: question._id,
        selectedAnswer: answerValue,
        correctAnswer:
          question.questionType === 'Written'
            ? question.getAllCorrectAnswers()
            : Array.isArray(question.correctAnswer)
            ? question.correctAnswer[0]
            : question.correctAnswer,
        isCorrect,
        points,
        questionType: question.questionType,
        timeSpent: 0, // Could be calculated per question if needed
      });
    });

    const score =
      totalQuestions > 0
        ? Math.round((correctAnswers / totalQuestions) * 100)
        : 0;

    // Get passing score (default: Quiz 50%, Homework 0% - students just need to submit)
    const passingScore =
      contentType === 'quiz'
        ? (contentItem.quizSettings?.passingScore !== undefined ? contentItem.quizSettings.passingScore : 50)
        : (contentItem.homeworkSettings?.passingScore !== undefined ? contentItem.homeworkSettings.passingScore : 0);

    const passed = score >= passingScore;

    // Prepare attempt data
    const attemptData = {
      score,
      totalQuestions,
      correctAnswers,
      timeSpent: parseInt(timeSpent) || 0,
      startedAt: new Date(startedAt),
      completedAt: new Date(completedAt),
      status: 'completed',
      answers: detailedAnswers,
      passed,
      passingScore,
    };

    // Save quiz attempt
    await student.addQuizAttempt(
      courseId,
      topicId,
      contentId,
      contentType,
      attemptData
    );

    // Send WhatsApp notification to parent for content quiz completion
    try {
      await whatsappSMSNotificationService.sendQuizCompletionNotification(
        studentId,
        {
          title: contentItem.title || 'Content Quiz',
          type: contentType,
        },
        correctAnswers,
        totalQuestions
      );
    } catch (whatsappError) {
      console.error('WhatsApp notification error:', whatsappError);
      // Don't fail the quiz submission if WhatsApp fails
    }

    // Get next content for navigation
    const allContent = course.topics.flatMap((t) =>
      t.content.map((c) => ({ ...c.toObject(), topicId: t._id }))
    );
    const currentIndex = allContent.findIndex(
      (c) => c._id.toString() === contentId
    );
    let nextContentId = null;

    if (currentIndex < allContent.length - 1) {
      const nextContent = allContent[currentIndex + 1];
      const nextUnlockStatus = student.isContentUnlocked(
        courseId,
        nextContent._id,
        nextContent
      );
      if (nextUnlockStatus.unlocked) {
        nextContentId = nextContent._id;
      }
    }

    res.json({
      success: true,
      score,
      correctAnswers,
      totalQuestions,
      passed,
      passingScore,
      points: totalPoints,
      nextContentId,
      message: passed
        ? 'Congratulations! You passed!'
        : 'Keep trying! You can do better next time.',
      clearLocalCache: true,
    });
  } catch (error) {
    console.error('Submit content quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting quiz',
    });
  }
};

// Quiz Results - View quiz results and answers
const quizResults = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const contentId = req.params.id;

    const student = await User.findById(studentId);

    // Find the content across all enrolled courses
    let contentItem = null;
    let course = null;
    let topic = null;

    for (const enrollment of student.enrolledCourses) {
      const courseData = await Course.findById(enrollment.course).populate({
        path: 'topics',
        populate: {
          path: 'content',
          model: 'ContentItem',
        },
      });

      if (courseData) {
        for (const topicData of courseData.topics) {
          const foundContent = topicData.content.find(
            (c) => c._id.toString() === contentId
          );
          if (foundContent) {
            contentItem = foundContent;
            course = courseData;
            topic = topicData;
            break;
          }
        }
        if (contentItem) break;
      }
    }

    if (!contentItem) {
      req.flash(
        'error_msg',
        'Content not found or you are not enrolled in this course'
      );
      return res.redirect('/student/enrolled-courses');
    }

    // Check if content is quiz or homework
    if (!['quiz', 'homework'].includes(contentItem.type)) {
      req.flash('error_msg', 'This content is not a quiz or homework');
      return res.redirect(`/student/content/${contentId}`);
    }

    // Get content progress
    const contentProgress = student.getContentProgressDetails(
      course._id,
      contentId
    );

    if (!contentProgress || contentProgress.quizAttempts.length === 0) {
      req.flash('error_msg', 'No quiz attempts found');
      return res.redirect(`/student/content/${contentId}`);
    }

    // Get the latest attempt
    const latestAttempt =
      contentProgress.quizAttempts[contentProgress.quizAttempts.length - 1];

    // Get questions with populated data for answer review
    const populatedContent = await Topic.findById(topic._id).populate({
      path: 'content',
      match: { _id: contentId },
      populate: {
        path: 'selectedQuestions.question',
        model: 'Question',
      },
    });

    const populatedContentItem = populatedContent.content.find(
      (c) => c._id.toString() === contentId
    );

    // Check if answers can be shown; also require last attempt to be passed
    let canShowAnswers =
      contentItem.type === 'quiz'
        ? contentItem.quizSettings?.showCorrectAnswers !== false
        : contentItem.homeworkSettings?.showCorrectAnswers !== false;
    const lastPassed = !!latestAttempt?.passed;
    if (!lastPassed) {
      canShowAnswers = false;
    }

    res.render('student/quiz-results', {
      title: `${contentItem.title} - Results | ELKABLY`,
      student,
      course,
      topic,
      contentItem: populatedContentItem,
      contentProgress,
      latestAttempt,
      canShowAnswers,
      lastPassed,
      theme: req.cookies.theme || student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Quiz results error:', error);
    req.flash('error_msg', 'Error loading quiz results');
    res.redirect('/student/enrolled-courses');
  }
};

// Debug endpoint to view progress data
const debugProgress = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const courseId = req.params.courseId;

    const student = await User.findById(studentId);
    const enrollment = student.enrolledCourses.find(
      (e) => e.course.toString() === courseId
    );

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Course enrollment not found',
      });
    }

    // Recalculate progress for this course
    await student.calculateCourseProgress(courseId);
    await student.save();

    // Get course structure for comparison
    const course = await Course.findById(courseId).populate('topics');

    res.json({
      success: true,
      studentId: studentId,
      courseId: courseId,
      enrollment: {
        course: enrollment.course,
        progress: enrollment.progress,
        lastAccessed: enrollment.lastAccessed,
        completedTopics: enrollment.completedTopics,
        contentProgress: enrollment.contentProgress,
        contentProgressCount: enrollment.contentProgress.length,
      },
      course: {
        title: course.title,
        topics: course.topics.map((topic) => ({
          id: topic._id,
          title: topic.title,
          contentCount: topic.content.length,
          content: topic.content.map((content) => ({
            id: content._id,
            title: content.title,
            type: content.type,
          })),
        })),
      },
      allEnrollments: student.enrolledCourses
        .filter((e) => e.course)
        .map((e) => ({
          course: e.course,
          progress: e.progress,
          contentProgressCount: e.contentProgress
            ? e.contentProgress.length
            : 0,
        })),
    });
  } catch (error) {
    console.error('Debug progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching progress data',
    });
  }
};

// Logout function removed - using centralized auth logout

// Get quiz details for student
const getQuizDetails = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    console.log('Quiz ID:', quizId);
    // Check if user is authenticated
    if (!req.session.user || !req.session.user.id) {
      req.flash('error_msg', 'Authentication required');
      return res.redirect('/auth/login');
    }

    const student = await User.findById(req.session.user.id);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    const quiz = await Quiz.findById(quizId)
      .populate('selectedQuestions.question')
      .populate('createdBy', 'name');

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/student/quizzes');
    }

    if (quiz.status !== 'active') {
      req.flash('error_msg', 'This quiz is not currently available');
      return res.redirect('/student/quizzes');
    }

    // Check if user can attempt the quiz
    const canAttempt = quiz.canUserAttempt(student.quizAttempts);
    const bestScore = quiz.getUserBestScore(student.quizAttempts);
    const attemptHistory = quiz.getUserAttemptHistory(student.quizAttempts);
    const activeAttempt = quiz.getActiveAttempt(student.quizAttempts);

    // Calculate timing information if there's an active attempt
    let timing = null;
    if (activeAttempt) {
      const now = new Date();
      const expectedEnd = new Date(activeAttempt.expectedEnd);
      const remainingSeconds = Math.max(
        0,
        Math.floor((expectedEnd - now) / 1000)
      );
      const isExpired = remainingSeconds <= 0;

      timing = {
        durationMinutes: quiz.duration,
        remainingSeconds,
        isExpired,
        startedAt: activeAttempt.startedAt,
        expectedEnd: activeAttempt.expectedEnd,
      };
    }

    res.render('student/quiz-details', {
      title: `${quiz.title} - Quiz Details`,
      quiz,
      student,
      canAttempt,
      bestScore,
      attemptHistory,
      activeAttempt,
      timing,
      theme: student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Get quiz details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading quiz details',
    });
  }
};

// Start quiz attempt - Simplified to just redirect to take page
const startQuizAttempt = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Check if user is authenticated
    if (!req.session.user || !req.session.user.id) {
      req.flash('error_msg', 'Authentication required');
      return res.redirect('/auth/login');
    }

    const student = await User.findById(req.session.user.id);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/student/quizzes');
    }

    if (quiz.status !== 'active') {
      req.flash('error_msg', 'This quiz is not currently available');
      return res.redirect('/student/quizzes');
    }

    // Check if user can attempt the quiz
    const canAttempt = quiz.canUserAttempt(student.quizAttempts);
    if (!canAttempt.canAttempt) {
      req.flash('error_msg', canAttempt.reason);
      return res.redirect(`/student/quiz/${quizId}/details`);
    }

    // Check for active attempt
    const activeAttempt = quiz.getActiveAttempt(student.quizAttempts);
    if (activeAttempt) {
      // Redirect to existing attempt
      return res.redirect(`/student/quiz/${quizId}/take`);
    }

    // Start new attempt and redirect to take page
    await student.startQuizAttempt(quizId, quiz.duration);

    // Redirect to take quiz page
    return res.redirect(`/student/quiz/${quizId}/take`);
  } catch (error) {
    console.error('Start quiz error:', error);
    req.flash('error_msg', 'Error starting quiz');
    res.redirect(`/student/quiz/${req.params.id}/details`);
  }
};

// Take quiz page (resume existing attempt or create new one)
const takeQuizPage = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Check if user is authenticated
    if (!req.session.user || !req.session.user.id) {
      req.flash('error_msg', 'Authentication required');
      return res.redirect('/auth/login');
    }

    let student = await User.findById(req.session.user.id);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    const quiz = await Quiz.findById(quizId).populate(
      'selectedQuestions.question'
    );

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/student/quizzes');
    }

    if (quiz.status !== 'active') {
      req.flash('error_msg', 'This quiz is not currently available');
      return res.redirect('/student/quizzes');
    }

    // Check if user can attempt the quiz
    const canAttempt = quiz.canUserAttempt(student.quizAttempts);
    if (!canAttempt.canAttempt) {
      req.flash('error_msg', canAttempt.reason);
      return res.redirect(`/student/quiz/${quizId}/details`);
    }

    // Check for active attempt
    let activeAttempt = quiz.getActiveAttempt(student.quizAttempts);

    // If no active attempt, create one
    if (!activeAttempt) {
      const attemptResult = await student.startQuizAttempt(
        quizId,
        quiz.duration
      );
      // Use the returned attempt data directly
      activeAttempt = attemptResult.newAttempt;
      // Refresh student data to get the updated quiz attempts
      student = await User.findById(req.session.user.id);
    }

    if (!activeAttempt) {
      req.flash('error_msg', 'Failed to start quiz attempt');
      return res.redirect(`/student/quiz/${quizId}/details`);
    }

    // Note: Shuffling is now handled in getSecureStandaloneQuizQuestions
    // We just pass the original questions here, frontend will load shuffled version
    let questions = quiz.selectedQuestions;

    // Calculate timing
    const now = new Date();
    const expectedEnd = new Date(activeAttempt.expectedEnd);
    const remainingSeconds = Math.max(
      0,
      Math.floor((expectedEnd - now) / 1000)
    );
    const isExpired = remainingSeconds <= 0;

    const timing = {
      durationMinutes: quiz.duration,
      remainingSeconds,
      isExpired,
      startedAt: activeAttempt.startedAt,
      expectedEnd: activeAttempt.expectedEnd,
      passingScore: quiz.passingScore,
    };

    res.render('student/take-quiz', {
      title: `Taking ${quiz.title}`,
      quiz: {
        ...quiz.toObject(),
        selectedQuestions: questions,
      },
      student,
      attemptNumber: activeAttempt.attemptNumber,
      timing,
      settings: {
        shuffleQuestions: quiz.shuffleQuestions || false,
        shuffleOptions: quiz.shuffleOptions || false,
        showCorrectAnswers: quiz.showCorrectAnswers !== false,
        showResults: quiz.showResults !== false,
        instructions: quiz.instructions || '',
      },
      theme: student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Take quiz error:', error);
    req.flash('error_msg', 'Error loading quiz');
    res.redirect(`/student/quiz/${req.params.id}/details`);
  }
};

// Submit standalone quiz
const submitStandaloneQuiz = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { answers, timeSpent } = req.body;

    // Check if user is authenticated
    if (!req.session.user || !req.session.user.id) {
      return res
        .status(401)
        .json({ success: false, message: 'Authentication required' });
    }

    const student = await User.findById(req.session.user.id);

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });
    }

    const quiz = await Quiz.findById(quizId).populate(
      'selectedQuestions.question'
    );

    if (!quiz) {
      return res
        .status(404)
        .json({ success: false, message: 'Quiz not found' });
    }

    // Check for active attempt
    const activeAttempt = quiz.getActiveAttempt(student.quizAttempts);
    if (!activeAttempt) {
      return res
        .status(400)
        .json({ success: false, message: 'No active attempt found' });
    }

    // Calculate score
    let correctAnswers = 0;
    let totalPoints = 0;
    const detailedAnswers = [];

    quiz.selectedQuestions.forEach((selectedQ, index) => {
      const question = selectedQ.question;
      const userAnswer = answers[question._id.toString()];
      let isCorrect = false;
      let points = 0;

      if (question.questionType === 'Written') {
        // Handle written questions with multiple correct answers
        if (question.correctAnswers && question.correctAnswers.length > 0) {
          // Normalize user answer for comparison
          const normalizedUserAnswer = userAnswer
            ? userAnswer.trim().toLowerCase()
            : '';

          // Check against all correct answers
          for (const correctAnswerObj of question.correctAnswers) {
            const correctAnswer = correctAnswerObj.text
              ? correctAnswerObj.text.trim().toLowerCase()
              : '';

            // Check for exact match or if user answer contains any of the comma-separated answers
            if (correctAnswer.includes(',')) {
              // Handle multiple answers separated by commas (e.g., "x+2,x+1")
              const correctAnswers = correctAnswer
                .split(',')
                .map((a) => a.trim().toLowerCase());
              if (
                correctAnswers.some(
                  (answer) =>
                    answer === normalizedUserAnswer ||
                    normalizedUserAnswer.includes(answer)
                )
              ) {
                isCorrect = true;
                break;
              }
            } else {
              // Single correct answer
              if (
                normalizedUserAnswer === correctAnswer ||
                normalizedUserAnswer.includes(correctAnswer)
              ) {
                isCorrect = true;
                break;
              }
            }
          }
        }
      } else {
        // Handle MCQ and True/False questions
        isCorrect = userAnswer === question.correctAnswer;
      }

      points = isCorrect ? selectedQ.points || 1 : 0;

      if (isCorrect) {
        correctAnswers++;
      }
      totalPoints += points;

      // Only include answered questions or provide a default value for unanswered ones
      const answerValue =
        userAnswer ||
        (question.questionType === 'Written' ? 'No answer provided' : '0');

      detailedAnswers.push({
        questionId: question._id,
        selectedAnswer: answerValue,
        correctAnswer:
          question.questionType === 'Written'
            ? question.correctAnswers
              ? question.correctAnswers.map((a) => a.text).join(', ')
              : ''
            : question.correctAnswer,
        isCorrect,
        points,
        questionType: question.questionType,
      });
    });

    const score = Math.round(
      (correctAnswers / quiz.selectedQuestions.length) * 100
    );
    const passed = score >= quiz.passingScore;

    // Complete the attempt
    await student.completeQuizAttempt(quizId, activeAttempt.attemptNumber, {
      score,
      totalQuestions: quiz.selectedQuestions.length,
      correctAnswers,
      timeSpent: timeSpent || 0,
      answers: detailedAnswers,
      passed,
      passingScore: quiz.passingScore,
    });

    // Send WhatsApp notification to parent for standalone quiz completion
    try {
      await whatsappSMSNotificationService.sendQuizCompletionNotification(
        req.session.user.id,
        quiz,
        correctAnswers,
        quiz.selectedQuestions.length
      );
    } catch (whatsappError) {
      console.error('WhatsApp notification error:', whatsappError);
      // Don't fail the quiz submission if WhatsApp fails
    }

    res.json({
      success: true,
      data: {
        score,
        correctAnswers,
        totalQuestions: quiz.selectedQuestions.length,
        passed,
        passingScore: quiz.passingScore,
        timeSpent: timeSpent || 0,
      },
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ success: false, message: 'Error submitting quiz' });
  }
};

// Get standalone quiz results
const getStandaloneQuizResults = async (req, res) => {
  try {
    const { id: quizId } = req.params;

    // Check if user is authenticated
    if (!req.session.user || !req.session.user.id) {
      req.flash('error_msg', 'Authentication required');
      return res.redirect('/auth/login');
    }

    const student = await User.findById(req.session.user.id);

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/auth/login');
    }

    const quiz = await Quiz.findById(quizId)
      .populate('selectedQuestions.question')
      .populate('createdBy', 'name');

    if (!quiz) {
      req.flash('error_msg', 'Quiz not found');
      return res.redirect('/student/quizzes');
    }

    const attemptHistory = quiz.getUserAttemptHistory(student.quizAttempts);
    const bestScore = quiz.getUserBestScore(student.quizAttempts);

    // Get the latest attempt for the score display
    const latestAttempt =
      attemptHistory && attemptHistory.length > 0
        ? attemptHistory[attemptHistory.length - 1]
        : null;

    // Check if answers can be shown
    let canShowAnswers = quiz.showCorrectAnswers !== false;
    const lastPassed = !!latestAttempt?.passed;
    if (!lastPassed) {
      canShowAnswers = false;
    }

    res.render('student/standalone-quiz-results', {
      title: `${quiz.title} - Results`,
      quiz,
      student,
      attemptHistory,
      bestScore,
      latestAttempt,
      canShowAnswers,
      lastPassed,
      theme: student.preferences?.theme || 'light',
    });
  } catch (error) {
    console.error('Get quiz results error:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading quiz results',
    });
  }
};

module.exports = {
  dashboard,
  enrolledCourses,
  courseDetails,
  courseContent,
  contentDetails,
  updateContentProgress,
  takeContentQuiz,
  submitContentQuiz,
  quizResults,
  debugProgress,
  quizzes,
  takeQuiz,
  submitQuiz,
  wishlist,
  addToWishlist,
  removeFromWishlist,
  orderHistory,
  orderDetails,
  homeworkAttempts,
  profile,
  updateProfile,
  sendProfileOTP,
  verifyProfileOTP,
  settings,
  updateSettings,
  // New profile and settings functions
  updateProfilePicture,
  changePassword,
  exportData,
  deleteAccount,
  // New standalone quiz functions
  getQuizDetails,
  startQuizAttempt,
  takeQuizPage,
  submitStandaloneQuiz,
  getStandaloneQuizResults,
};

// ==================== ZOOM MEETING FUNCTIONALITY ====================

/**
 * Join Zoom meeting - Redirect to external Zoom client with tracking
 */
const joinZoomMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const studentId = req.session.user.id;


    // Find the Zoom meeting
    const zoomMeeting = await ZoomMeeting.findById(meetingId)
      .populate('topic', 'title')
      .populate('course', 'title');

    if (!zoomMeeting) {
      return res.status(404).json({
        success: false,
        message: 'Zoom meeting not found',
      });
    }


    // Validate meeting exists in Zoom (optional but recommended)
    try {
      const zoomMeetingDetails = await zoomService.getMeetingDetails(
        zoomMeeting.meetingId
      );
    } catch (zoomError) {
      // Continue anyway - might be a permissions issue
    }

    // Check if meeting is available (started)
    if (zoomMeeting.status === 'scheduled') {
      return res.status(403).json({
        success: false,
        message:
          'This meeting has not started yet. Please wait for the instructor to start the meeting.',
        scheduledTime: zoomMeeting.scheduledStartTime,
      });
    }

    if (zoomMeeting.status === 'ended') {
      return res.status(403).json({
        success: false,
        message: 'This meeting has ended.',
        recordingUrl: zoomMeeting.recordingUrl,
      });
    }

    // Get student information with populated enrolled courses
    const student = await User.findById(studentId).populate(
      'enrolledCourses.course'
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Check if student is enrolled in the course (with debug mode)
    const isEnrolled = student.enrolledCourses.some(
      (enrollment) =>
        enrollment.course &&
        enrollment.course._id.toString() === zoomMeeting.course._id.toString()
    );


    // For development/testing, you can temporarily disable this check
    const skipEnrollmentCheck =
      process.env.NODE_ENV === 'development' &&
      process.env.SKIP_ENROLLMENT_CHECK === 'true';

    if (!isEnrolled && !skipEnrollmentCheck) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course.',
        debug: {
          meetingCourse: zoomMeeting.course._id.toString(),
          studentCourses: student.enrolledCourses.map((e) =>
            e.course ? e.course._id.toString() : 'null'
          ),
          suggestion: 'Add SKIP_ENROLLMENT_CHECK=true to .env for testing',
        },
      });
    }

    // Record join attempt in our database (webhook will handle actual join/leave events)
    await zoomService.recordAttendance(
      zoomMeeting.meetingId,
      studentId,
      'join_attempt'
    );
    
    // Auto-mark content as completed when student joins live session
    // This ensures progress is updated immediately when they join
    try {
      const courseId = zoomMeeting.course._id || zoomMeeting.course;
      const topicId = zoomMeeting.topic._id || zoomMeeting.topic;
      const Topic = require('../models/Topic');
      const topic = await Topic.findById(topicId);
      
      if (topic && topic.content) {
        const zoomContentItem = topic.content.find(
          (item) => item.type === 'zoom' && 
          item.zoomMeeting && 
          item.zoomMeeting.toString() === zoomMeeting._id.toString()
        );

        if (zoomContentItem) {
          // Refresh student to get latest data before updating
          const freshStudent = await User.findById(studentId);
          
          // Check if already completed to avoid duplicate updates
          const existingProgress = freshStudent.enrolledCourses
            .find(e => e.course.toString() === courseId.toString())
            ?.contentProgress
            ?.find(cp => cp.contentId.toString() === zoomContentItem._id.toString());
          
          if (!existingProgress || existingProgress.completionStatus !== 'completed') {
            // Update content progress to mark as completed
            await freshStudent.updateContentProgress(
              courseId,
              topicId,
              zoomContentItem._id,
              'zoom',
              {
                completionStatus: 'completed',
                progressPercentage: 100,
                lastAccessed: new Date(),
                completedAt: new Date()
              }
            );
          }
        }
      }
    } catch (progressError) {
      // Don't fail the request if progress update fails
    }

    // Generate tracking join URL for external Zoom client
    // Format name as Firstname_SecondName(studentCode)
    const studentInfo = {
      name: student.name || `${student.firstName} ${student.lastName}`.trim(),
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      email: student.studentEmail || student.email,
      id: student.studentCode || studentId, // Use studentCode instead of _id
      studentCode: student.studentCode || studentId.toString(), // Ensure studentCode is available
    };

    const trackingJoinUrl = zoomService.generateTrackingJoinUrl(
      zoomMeeting.meetingId,
      studentInfo,
      zoomMeeting.password
    );


    // Return join URL for external redirect
    res.json({
      success: true,
      meeting: {
        meetingId: zoomMeeting.meetingId,
        meetingName: zoomMeeting.meetingName,
        meetingTopic: zoomMeeting.meetingTopic,
        joinUrl: trackingJoinUrl, // Direct Zoom join URL
        originalJoinUrl: zoomMeeting.joinUrl, // Fallback URL
        password: zoomMeeting.password,
        startTime: zoomMeeting.scheduledStartTime,
        course: zoomMeeting.course,
        topic: zoomMeeting.topic,
      },
      student: {
        name: studentInfo.name,
        email: studentInfo.email,
      },
      joinMethod: 'external_redirect',
    });
  } catch (error) {
    console.error('❌ Error joining Zoom meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to join Zoom meeting',
    });
  }
};

/**
 * Leave Zoom meeting - Update attendance record
 */
const leaveZoomMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const studentId = req.session.user.id;

    console.log('Student leaving Zoom meeting:', meetingId);

    const zoomMeeting = await ZoomMeeting.findById(meetingId);

    if (!zoomMeeting) {
      return res.status(404).json({
        success: false,
        message: 'Zoom meeting not found',
      });
    }

    // Record leave event (manual tracking as backup)
    await zoomService.recordAttendance(
      zoomMeeting.meetingId,
      studentId,
      'leave'
    );


    res.json({
      success: true,
      message: 'Successfully recorded your participation',
    });
  } catch (error) {
    console.error('❌ Error leaving Zoom meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to record meeting leave',
    });
  }
};

/**
 * Get student's Zoom meeting attendance history
 */
const getZoomMeetingHistory = async (req, res) => {
  try {
    const studentId = req.session.user.id;

    console.log('Getting Zoom meeting history for student:', studentId);

    // Find all meetings where student attended
    const meetings = await ZoomMeeting.find({
      'studentsAttended.student': studentId,
    })
      .populate('course', 'title thumbnail')
      .populate('topic', 'title')
      .sort({ scheduledStartTime: -1 });

    // Extract student's attendance data from each meeting
    const attendanceHistory = meetings.map((meeting) => {
      const studentAttendance = meeting.studentsAttended.find(
        (att) => att.student.toString() === studentId
      );

      return {
        meeting: {
          id: meeting._id,
          name: meeting.meetingName,
          topic: meeting.topic,
          course: meeting.course,
          scheduledStart: meeting.scheduledStartTime,
          actualStart: meeting.actualStartTime,
          actualEnd: meeting.actualEndTime,
          duration: meeting.actualDuration || meeting.duration,
          status: meeting.status,
          recordingUrl: meeting.recordingUrl,
        },
        attendance: {
          totalTimeSpent: studentAttendance?.totalTimeSpent || 0,
          attendancePercentage: studentAttendance?.attendancePercentage || 0,
          firstJoin: studentAttendance?.firstJoinTime,
          lastLeave: studentAttendance?.lastLeaveTime,
          joinCount: studentAttendance?.joinEvents.length || 0,
        },
      };
    });

    res.json({
      success: true,
      history: attendanceHistory,
    });
  } catch (error) {
    console.error('❌ Error getting meeting history:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get meeting history',
    });
  }
};

// Secure endpoint to get a single question
const getSecureQuestion = async (req, res) => {
  try {
    const { contentId, questionIndex, attemptNumber } = req.body;
    const studentId = req.session.user.id;

    console.log('Secure Question Request:', {
      contentId,
      questionIndex,
      attemptNumber,
    });

    // Validate required fields
    if (!contentId || questionIndex === undefined || !attemptNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields for question request',
      });
    }

    const student = await User.findById(studentId);

    // Find the content item
    let contentItem = null;
    for (const enrollment of student.enrolledCourses) {
      const courseData = await Course.findById(enrollment.course).populate({
        path: 'topics',
        populate: {
          path: 'content',
          model: 'ContentItem',
          populate: {
            path: 'selectedQuestions.question',
            populate: {
              path: 'options',
            },
          },
        },
      });

      if (courseData) {
        for (const topicData of courseData.topics) {
          contentItem = topicData.content.find(
            (c) => c._id.toString() === contentId
          );
          if (contentItem) break;
        }
        if (contentItem) break;
      }
    }

    if (!contentItem) {
      return res.status(404).json({
        success: false,
        message: 'Content item not found',
      });
    }

    // Validate question index
    if (
      questionIndex < 0 ||
      questionIndex >= contentItem.selectedQuestions.length
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid question index',
      });
    }

    // Get the specific question (without correct answers)
    const selectedQuestion = contentItem.selectedQuestions[questionIndex];
    const question = selectedQuestion.question;

    // Create secure question object (no correct answers)
    const secureQuestion = {
      _id: question._id,
      questionText: question.questionText,
      questionType: question.questionType,
      questionImage: question.questionImage,
      points: selectedQuestion.points || 1,
      options:
        question.questionType !== 'Written'
          ? question.options.map((option) => ({
              _id: option._id,
              text: option.text,
              image: option.image,
              // NO correctAnswer field for security
            }))
          : [],
    };

    res.json({
      success: true,
      question: secureQuestion,
      totalQuestions: contentItem.selectedQuestions.length,
      questionIndex: questionIndex,
    });
  } catch (error) {
    console.error('Error getting secure question:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading question. Please try again.',
    });
  }
};

// Secure endpoint to load all questions at once (without correct answers)
const getSecureAllQuestions = async (req, res) => {
  try {
    const { contentId, attemptNumber } = req.body;
    const studentId = req.session.user.id;

    console.log('Secure All Questions Request:', { contentId, attemptNumber });

    // Validate required fields
    if (!contentId || !attemptNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields for questions request',
      });
    }

    const student = await User.findById(studentId);

    // Find the content item and course
    let contentItem = null;
    let course = null;
    let topic = null;
    for (const enrollment of student.enrolledCourses) {
      const courseData = await Course.findById(enrollment.course).populate({
        path: 'topics',
        populate: {
          path: 'content',
          model: 'ContentItem',
          populate: {
            path: 'selectedQuestions.question',
            populate: {
              path: 'options',
            },
          },
        },
      });

      if (courseData) {
        for (const topicData of courseData.topics) {
          contentItem = topicData.content.find(
            (c) => c._id.toString() === contentId
          );
          if (contentItem) {
            course = courseData;
            topic = topicData;
            break;
          }
        }
        if (contentItem) break;
      }
    }

    if (!contentItem) {
      return res.status(404).json({
        success: false,
        message: 'Content item not found',
      });
    }

    // Get quiz settings
    const settings = contentItem.type === 'quiz' 
      ? contentItem.quizSettings 
      : contentItem.homeworkSettings;

    // Get content progress to check for existing shuffled order
    const contentProgress = student.getContentProgressDetails(
      course._id,
      contentId
    );

    // Get or create shuffled order for this attempt
    let shuffledQuestionOrder = [];
    let shuffledOptionOrders = new Map();

    if (contentProgress && contentProgress.quizAttempts) {
      const attempt = contentProgress.quizAttempts.find(
        (a) => a.attemptNumber === parseInt(attemptNumber)
      );

      if (attempt && attempt.shuffledQuestionOrder && attempt.shuffledQuestionOrder.length > 0) {
        // Use existing shuffled order
        shuffledQuestionOrder = attempt.shuffledQuestionOrder;
        if (attempt.shuffledOptionOrders) {
          shuffledOptionOrders = new Map(Object.entries(attempt.shuffledOptionOrders));
        }
      } else if (settings?.shuffleQuestions || settings?.shuffleOptions) {
        // Create new shuffled order and save it
        const originalQuestions = contentItem.selectedQuestions.map((_, idx) => idx);
        // Define seed for deterministic shuffling (used for both questions and options)
        const seed = `${studentId}-${contentId}-${attemptNumber}`;
        
        if (settings.shuffleQuestions) {
          // Fisher-Yates shuffle for deterministic but random order
          shuffledQuestionOrder = [...originalQuestions];
          let seedValue = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          for (let i = shuffledQuestionOrder.length - 1; i > 0; i--) {
            seedValue = (seedValue * 9301 + 49297) % 233280; // Simple PRNG
            const j = seedValue % (i + 1);
            [shuffledQuestionOrder[i], shuffledQuestionOrder[j]] = [shuffledQuestionOrder[j], shuffledQuestionOrder[i]];
          }
        } else {
          shuffledQuestionOrder = originalQuestions;
        }

        // Shuffle options for each question if needed
        if (settings.shuffleOptions) {
          contentItem.selectedQuestions.forEach((selectedQuestion, qIdx) => {
            const question = selectedQuestion.question;
            if (question.questionType !== 'Written' && question.options && question.options.length > 0) {
              const originalOptionIndices = question.options.map((_, idx) => idx);
              const shuffledOptions = [...originalOptionIndices];
              const optionSeed = `${seed}-${question._id}`;
              let optionSeedValue = optionSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
              for (let i = shuffledOptions.length - 1; i > 0; i--) {
                optionSeedValue = (optionSeedValue * 9301 + 49297) % 233280;
                const j = optionSeedValue % (i + 1);
                [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
              }
              shuffledOptionOrders.set(question._id.toString(), shuffledOptions);
            }
          });
        }

        // Save shuffled order to attempt
        if (attempt) {
          attempt.shuffledQuestionOrder = shuffledQuestionOrder;
          attempt.shuffledOptionOrders = Object.fromEntries(shuffledOptionOrders);
          await student.save();
        } else {
          // Create attempt entry if it doesn't exist
          if (!contentProgress) {
            await student.updateContentProgress(
              course._id.toString(),
              topic._id.toString(),
              contentId,
              contentItem.type,
              {
                completionStatus: 'in_progress',
                progressPercentage: 0,
                lastAccessed: new Date(),
              }
            );
            const refreshed = await User.findById(studentId);
            const refreshedProgress = refreshed.getContentProgressDetails(course._id, contentId);
            if (refreshedProgress && !refreshedProgress.quizAttempts) {
              refreshedProgress.quizAttempts = [];
            }
            if (refreshedProgress && refreshedProgress.quizAttempts) {
              refreshedProgress.quizAttempts.push({
                attemptNumber: parseInt(attemptNumber),
                shuffledQuestionOrder: shuffledQuestionOrder,
                shuffledOptionOrders: Object.fromEntries(shuffledOptionOrders),
                totalQuestions: contentItem.selectedQuestions.length,
                correctAnswers: 0,
                timeSpent: 0,
                startedAt: new Date(),
                completedAt: new Date(),
                status: 'completed',
                answers: [],
                passed: false,
                passingScore: settings?.passingScore || 60,
              });
              await refreshed.save();
            }
          }
        }
      } else {
        // No shuffling needed
        shuffledQuestionOrder = contentItem.selectedQuestions.map((_, idx) => idx);
      }
    } else {
      // No progress yet, create shuffled order if needed
      if (settings?.shuffleQuestions || settings?.shuffleOptions) {
        const originalQuestions = contentItem.selectedQuestions.map((_, idx) => idx);
        // Define seed for deterministic shuffling (used for both questions and options)
        const seed = `${studentId}-${contentId}-${attemptNumber}`;
        
        if (settings.shuffleQuestions) {
          shuffledQuestionOrder = [...originalQuestions];
          let seedValue = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          for (let i = shuffledQuestionOrder.length - 1; i > 0; i--) {
            seedValue = (seedValue * 9301 + 49297) % 233280;
            const j = seedValue % (i + 1);
            [shuffledQuestionOrder[i], shuffledQuestionOrder[j]] = [shuffledQuestionOrder[j], shuffledQuestionOrder[i]];
          }
        } else {
          shuffledQuestionOrder = originalQuestions;
        }

        if (settings.shuffleOptions) {
          contentItem.selectedQuestions.forEach((selectedQuestion) => {
            const question = selectedQuestion.question;
            if (question.questionType !== 'Written' && question.options && question.options.length > 0) {
              const originalOptionIndices = question.options.map((_, idx) => idx);
              const shuffledOptions = [...originalOptionIndices];
              const optionSeed = `${seed}-${question._id}`;
              let optionSeedValue = optionSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
              for (let i = shuffledOptions.length - 1; i > 0; i--) {
                optionSeedValue = (optionSeedValue * 9301 + 49297) % 233280;
                const j = optionSeedValue % (i + 1);
                [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
              }
              shuffledOptionOrders.set(question._id.toString(), shuffledOptions);
            }
          });
        }
      } else {
        shuffledQuestionOrder = contentItem.selectedQuestions.map((_, idx) => idx);
      }
    }

    // Create secure questions array in shuffled order
    const secureQuestions = shuffledQuestionOrder.map((originalIndex, displayIndex) => {
      const selectedQuestion = contentItem.selectedQuestions[originalIndex];
      const question = selectedQuestion.question;
      
      let options = [];
      if (question.questionType !== 'Written' && question.options && question.options.length > 0) {
        const optionOrder = shuffledOptionOrders.get(question._id.toString());
        if (optionOrder && optionOrder.length > 0) {
          // Use shuffled option order
          options = optionOrder.map((optIdx) => ({
            _id: question.options[optIdx]._id,
            text: question.options[optIdx].text,
            image: question.options[optIdx].image,
          }));
        } else {
          // No shuffling or order not found, use original order
          options = question.options.map((option) => ({
            _id: option._id,
            text: option.text,
            image: option.image,
          }));
        }
      }

      return {
        _id: question._id,
        questionText: question.questionText,
        questionType: question.questionType,
        questionImage: question.questionImage,
        points: selectedQuestion.points || 1,
        index: displayIndex, // Display index (0-based in shuffled order)
        originalIndex: originalIndex, // Original index for reference
        options: options,
      };
    });

    res.json({
      success: true,
      questions: secureQuestions,
      totalQuestions: secureQuestions.length,
      settings: {
        shuffleQuestions: settings?.shuffleQuestions || false,
        shuffleOptions: settings?.shuffleOptions || false,
        showCorrectAnswers: settings?.showCorrectAnswers !== false,
        showResults: settings?.showResults !== false,
        instructions: settings?.instructions || '',
      },
    });
  } catch (error) {
    console.error('Error getting secure questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading questions. Please try again.',
    });
  }
};

// Secure endpoint to check if a question is answered
const checkQuestionAnswered = async (req, res) => {
  try {
    const { contentId, questionIndex, attemptNumber } = req.body;
    const studentId = req.session.user.id;

    // Find existing progress for this attempt
    const progress = await Progress.findOne({
      student: studentId,
      content: contentId,
      attemptNumber: attemptNumber,
    });

    if (!progress || !progress.answers) {
      return res.json({
        success: true,
        answered: false,
      });
    }

    const student = await User.findById(studentId);

    // Find the content item to get question ID
    let contentItem = null;
    for (const enrollment of student.enrolledCourses) {
      const courseData = await Course.findById(enrollment.course).populate({
        path: 'topics',
        populate: {
          path: 'content',
          model: 'ContentItem',
          populate: {
            path: 'selectedQuestions.question',
          },
        },
      });

      if (courseData) {
        for (const topicData of courseData.topics) {
          contentItem = topicData.content.find(
            (c) => c._id.toString() === contentId
          );
          if (contentItem) break;
        }
        if (contentItem) break;
      }
    }

    if (!contentItem || questionIndex >= contentItem.selectedQuestions.length) {
      return res.json({
        success: true,
        answered: false,
      });
    }

    const questionId =
      contentItem.selectedQuestions[questionIndex].question._id.toString();
    const answered = progress.answers[questionId] !== undefined;

    res.json({
      success: true,
      answered: answered,
    });
  } catch (error) {
    console.error('Error checking question answered status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking answer status',
    });
  }
};

// Secure endpoint to get standalone quiz questions (without correct answers)
const getSecureStandaloneQuizQuestions = async (req, res) => {
  try {
    const { quizId, attemptNumber } = req.body;
    const studentId = req.session.user.id;

    // Validate required fields
    if (!quizId || !attemptNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields for quiz questions request',
      });
    }

    // Find the quiz
    const quiz = await Quiz.findById(quizId).populate({
      path: 'selectedQuestions.question',
      populate: {
        path: 'options',
      },
    });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Get quiz attempt to check for existing shuffled order
    const quizAttempt = student.quizAttempts.find(
      (attempt) => attempt.quiz.toString() === quizId
    );

    let shuffledQuestionOrder = [];
    let shuffledOptionOrders = new Map();

    if (quizAttempt && quizAttempt.attempts) {
      const attempt = quizAttempt.attempts.find(
        (a) => a.attemptNumber === parseInt(attemptNumber)
      );

      if (attempt && attempt.shuffledQuestionOrder && attempt.shuffledQuestionOrder.length > 0) {
        // Use existing shuffled order
        shuffledQuestionOrder = attempt.shuffledQuestionOrder;
        if (attempt.shuffledOptionOrders) {
          shuffledOptionOrders = new Map(Object.entries(attempt.shuffledOptionOrders));
        }
      } else if (quiz.shuffleQuestions || quiz.shuffleOptions) {
        // Create new shuffled order
        const originalQuestions = quiz.selectedQuestions.map((_, idx) => idx);
        // Define seed for deterministic shuffling (used for both questions and options)
        const seed = `${studentId}-${quizId}-${attemptNumber}`;
        
        if (quiz.shuffleQuestions) {
          shuffledQuestionOrder = [...originalQuestions];
          let seedValue = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          for (let i = shuffledQuestionOrder.length - 1; i > 0; i--) {
            seedValue = (seedValue * 9301 + 49297) % 233280;
            const j = seedValue % (i + 1);
            [shuffledQuestionOrder[i], shuffledQuestionOrder[j]] = [shuffledQuestionOrder[j], shuffledQuestionOrder[i]];
          }
        } else {
          shuffledQuestionOrder = originalQuestions;
        }

        if (quiz.shuffleOptions) {
          quiz.selectedQuestions.forEach((selectedQuestion) => {
            const question = selectedQuestion.question;
            if (question.questionType !== 'Written' && question.options && question.options.length > 0) {
              const originalOptionIndices = question.options.map((_, idx) => idx);
              const shuffledOptions = [...originalOptionIndices];
              const optionSeed = `${seed}-${question._id}`;
              let optionSeedValue = optionSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
              for (let i = shuffledOptions.length - 1; i > 0; i--) {
                optionSeedValue = (optionSeedValue * 9301 + 49297) % 233280;
                const j = optionSeedValue % (i + 1);
                [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
              }
              shuffledOptionOrders.set(question._id.toString(), shuffledOptions);
            }
          });
        }

        // Save shuffled order to attempt
        if (attempt) {
          attempt.shuffledQuestionOrder = shuffledQuestionOrder;
          attempt.shuffledOptionOrders = Object.fromEntries(shuffledOptionOrders);
          await student.save();
        } else {
          // Create attempt entry if it doesn't exist
          if (!quizAttempt.attempts) {
            quizAttempt.attempts = [];
          }
          quizAttempt.attempts.push({
            attemptNumber: parseInt(attemptNumber),
            shuffledQuestionOrder: shuffledQuestionOrder,
            shuffledOptionOrders: Object.fromEntries(shuffledOptionOrders),
            totalQuestions: quiz.selectedQuestions.length,
            correctAnswers: 0,
            timeSpent: 0,
            startedAt: new Date(),
            completedAt: null,
            status: 'in_progress',
            answers: [],
            passed: false,
            passingScore: quiz.passingScore || 60,
          });
          await student.save();
        }
      } else {
        // No shuffling needed
        shuffledQuestionOrder = quiz.selectedQuestions.map((_, idx) => idx);
      }
    } else if (quiz.shuffleQuestions || quiz.shuffleOptions) {
      // No attempt yet, create shuffled order
      const originalQuestions = quiz.selectedQuestions.map((_, idx) => idx);
      // Define seed for deterministic shuffling (used for both questions and options)
      const seed = `${studentId}-${quizId}-${attemptNumber}`;
      
      if (quiz.shuffleQuestions) {
        shuffledQuestionOrder = [...originalQuestions];
        let seedValue = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        for (let i = shuffledQuestionOrder.length - 1; i > 0; i--) {
          seedValue = (seedValue * 9301 + 49297) % 233280;
          const j = seedValue % (i + 1);
          [shuffledQuestionOrder[i], shuffledQuestionOrder[j]] = [shuffledQuestionOrder[j], shuffledQuestionOrder[i]];
        }
      } else {
        shuffledQuestionOrder = originalQuestions;
      }

      if (quiz.shuffleOptions) {
        quiz.selectedQuestions.forEach((selectedQuestion) => {
          const question = selectedQuestion.question;
          if (question.questionType !== 'Written' && question.options && question.options.length > 0) {
            const originalOptionIndices = question.options.map((_, idx) => idx);
            const shuffledOptions = [...originalOptionIndices];
            const optionSeed = `${seed}-${question._id}`;
            let optionSeedValue = optionSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            for (let i = shuffledOptions.length - 1; i > 0; i--) {
              optionSeedValue = (optionSeedValue * 9301 + 49297) % 233280;
              const j = optionSeedValue % (i + 1);
              [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
            }
            shuffledOptionOrders.set(question._id.toString(), shuffledOptions);
          }
        });
      }

      // Create quizAttempt and attempt entry if they don't exist
      if (!quizAttempt) {
        student.quizAttempts.push({
          quiz: quizId,
          attempts: [],
        });
        await student.save();
        // Refresh to get the newly created quizAttempt
        const refreshed = await User.findById(studentId);
        const refreshedQuizAttempt = refreshed.quizAttempts.find(
          (attempt) => attempt.quiz.toString() === quizId
        );
        if (refreshedQuizAttempt) {
          refreshedQuizAttempt.attempts.push({
            attemptNumber: parseInt(attemptNumber),
            shuffledQuestionOrder: shuffledQuestionOrder,
            shuffledOptionOrders: Object.fromEntries(shuffledOptionOrders),
            totalQuestions: quiz.selectedQuestions.length,
            correctAnswers: 0,
            timeSpent: 0,
            startedAt: new Date(),
            completedAt: null,
            status: 'in_progress',
            answers: [],
            passed: false,
            passingScore: quiz.passingScore || 60,
          });
          await refreshed.save();
        }
      } else {
        // quizAttempt exists but no attempts array or no attempt for this attemptNumber
        if (!quizAttempt.attempts) {
          quizAttempt.attempts = [];
        }
        quizAttempt.attempts.push({
          attemptNumber: parseInt(attemptNumber),
          shuffledQuestionOrder: shuffledQuestionOrder,
          shuffledOptionOrders: Object.fromEntries(shuffledOptionOrders),
          totalQuestions: quiz.selectedQuestions.length,
          correctAnswers: 0,
          timeSpent: 0,
          startedAt: new Date(),
          completedAt: null,
          status: 'in_progress',
          answers: [],
          passed: false,
          passingScore: quiz.passingScore || 60,
        });
        await student.save();
      }
    } else {
      shuffledQuestionOrder = quiz.selectedQuestions.map((_, idx) => idx);
    }

    // Create secure questions array in shuffled order
    const secureQuestions = shuffledQuestionOrder.map((originalIndex, displayIndex) => {
      const selectedQuestion = quiz.selectedQuestions[originalIndex];
      const question = selectedQuestion.question;
      
      let options = [];
      if (question.questionType !== 'Written' && question.options && question.options.length > 0) {
        const optionOrder = shuffledOptionOrders.get(question._id.toString());
        if (optionOrder && optionOrder.length > 0) {
          options = optionOrder.map((optIdx) => ({
            _id: question.options[optIdx]._id,
            text: question.options[optIdx].text,
            image: question.options[optIdx].image,
          }));
        } else {
          options = question.options.map((option) => ({
            _id: option._id,
            text: option.text,
            image: option.image,
          }));
        }
      }

      return {
        _id: question._id,
        questionText: question.questionText,
        questionType: question.questionType,
        questionImage: question.questionImage,
        points: selectedQuestion.points || 1,
        index: displayIndex,
        originalIndex: originalIndex,
        options: options,
      };
    });

    res.json({
      success: true,
      questions: secureQuestions,
      totalQuestions: secureQuestions.length,
      settings: {
        shuffleQuestions: quiz.shuffleQuestions || false,
        shuffleOptions: quiz.shuffleOptions || false,
        showCorrectAnswers: quiz.showCorrectAnswers !== false,
        showResults: quiz.showResults !== false,
        instructions: quiz.instructions || '',
      },
    });
  } catch (error) {
    console.error('Error getting secure standalone quiz questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading quiz questions. Please try again.',
    });
  }
};

module.exports = {
  dashboard,
  enrolledCourses,
  courseDetails,
  courseContent,
  contentDetails,
  updateContentProgress,
  takeContentQuiz,
  submitContentQuiz,
  quizResults,
  debugProgress,
  quizzes,
  takeQuiz,
  submitQuiz,
  wishlist,
  addToWishlist,
  removeFromWishlist,
  orderHistory,
  orderDetails,
  homeworkAttempts,
  profile,
  updateProfile,
  sendProfileOTP,
  verifyProfileOTP,
  settings,
  updateSettings,
  // New profile and settings functions
  updateProfilePicture,
  changePassword,
  exportData,
  deleteAccount,
  // New standalone quiz functions
  getQuizDetails,
  startQuizAttempt,
  takeQuizPage,
  submitStandaloneQuiz,
  getStandaloneQuizResults,
  // Secure Quiz functions
  getSecureQuestion,
  getSecureAllQuestions,
  checkQuestionAnswered,
  // Zoom Meeting functions
  joinZoomMeeting,
  leaveZoomMeeting,
  getZoomMeetingHistory,
  // Secure standalone quiz functions
  getSecureStandaloneQuizQuestions,
};
