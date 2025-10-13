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

// Dashboard - Main student dashboard
const dashboard = async (req, res) => {
  try {
    const studentId = req.session.user.id;

    // Get student with populated data
    const student = await User.findById(studentId)
      .populate({
        path: 'enrolledCourses.course',
        populate: {
          path: 'topics',
          model: 'Topic',
        },
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
      title: 'Student Dashboard',
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

// Enrolled Courses - View all enrolled courses
const enrolledCourses = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    const student = await User.findById(studentId).populate({
      path: 'enrolledCourses.course',
      populate: {
        path: 'topics bundle',
        model: 'Topic',
      },
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

    const enrolledCourses = validEnrollments
      .sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed))
      .slice(skip, skip + limit);

    const totalCourses = validEnrollments.length;
    const totalPages = Math.ceil(totalCourses / limit);

    res.render('student/enrolled-courses', {
      title: 'My Enrolled Courses',
      student,
      enrolledCourses,
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

    res.render('student/course-details', {
      title: `${course.title} - Course Details`,
      student,
      course,
      enrollment,
      topicsWithProgress,
      courseProgress,
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

          // Get prerequisite names for better user experience
          let prerequisiteNames = [];
          if (
            contentItem.prerequisites &&
            contentItem.prerequisites.length > 0
          ) {
            // Find prerequisite content names
            const allContent = course.topics.flatMap((t) => t.content);
            prerequisiteNames = contentItem.prerequisites.map((prereqId) => {
              const prereqContent = allContent.find(
                (c) => c._id.toString() === prereqId.toString()
              );
              return prereqContent ? prereqContent.title : 'Unknown Content';
            });
          }

          return {
            ...contentItem.toObject(),
            isUnlocked: unlockStatus.unlocked,
            isCompleted: isCompleted,
            actualProgress: actualProgress,
            unlockReason: unlockStatus.reason,
            canAccess: unlockStatus.unlocked || isCompleted,
            prerequisiteNames: prerequisiteNames,
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

    res.render('student/course-content', {
      title: `${course.title} - Course Content`,
      student,
      course,
      enrollment,
      topicsWithProgress,
      user: req.session.user, // Pass user session for admin checks
      getContentIcon, // Pass the helper function to the template
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
    const isCompleted = contentProgress
      ? contentProgress.completionStatus === 'completed'
      : false;
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
      const nextUnlockStatus = student.isContentUnlocked(
        course._id,
        nextContent._id,
        nextContent
      );
      nextContentAccessible = nextUnlockStatus.unlocked;
    }

    console.log('Content Item Debug:', contentItem);

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

    res.render('student/content-details', {
      title: `${contentItem.title} - Content`,
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

    console.log('Updating content progress:', {
      studentId,
      courseId,
      topicId,
      contentId,
      contentType,
      progressData,
    });

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

    console.log(
      'After update - enrollment contentProgress length:',
      updatedEnrollment.contentProgress.length
    );
    console.log('Updated contentProgress:', updatedEnrollment.contentProgress);

    // Get updated progress
    const updatedProgress = updatedStudent.getContentProgressDetails(
      courseId,
      contentId
    );

    res.json({
      success: true,
      contentProgress: updatedProgress,
      courseProgress: updatedEnrollment.progress,
      totalContentProgress: updatedEnrollment.contentProgress.length,
      message: 'Progress updated successfully',
    });
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

    // Get all active quizzes with enhanced data
    const quizzes = await Quiz.find({
      status: 'active',
    })
      .populate('questionBank', 'name description totalQuestions')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }); // Include virtual fields like totalQuestions

    const totalQuizzes = await Quiz.countDocuments({ status: 'active' });
    const totalPages = Math.ceil(totalQuizzes / limit);

    // Get student's quiz attempts
    const studentQuizAttempts = student.quizAttempts || [];

    res.render('student/quizzes', {
      title: 'Available Quizzes',
      student,
      quizzes,
      studentQuizAttempts,
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

    // Shuffle questions if enabled
    let questions = quiz.selectedQuestions;
    if (quiz.shuffleQuestions) {
      questions = questions.sort(() => Math.random() - 0.5);
    }

    // Shuffle options if enabled
    if (quiz.shuffleOptions) {
      questions.forEach((q) => {
        if (q.question.options && Array.isArray(q.question.options)) {
          q.question.options = q.question.options.sort(
            () => Math.random() - 0.5
          );
        }
      });
    }

    res.render('student/take-quiz', {
      title: `${quiz.title} - Quiz`,
      student,
      quiz: {
        ...quiz.toObject(),
        selectedQuestions: questions,
      },
      attemptNumber: studentQuizAttempt
        ? studentQuizAttempt.attempts.length + 1
        : 1,
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
        // Handle MCQ and True/False questions
        isCorrect = userAnswer === question.correctAnswer;
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
      title: 'My Wishlist',
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
      title: 'Order History',
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

    // Find the specific order
    const purchaseHistory = student.getPurchaseHistory();
    const order = purchaseHistory.find((p) => p.orderNumber === orderNumber);

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/student/order-history');
    }

    // Populate item details
    const Course = require('../models/Course');
    const BundleCourse = require('../models/BundleCourse');

    let item = null;
    if (order.type === 'course') {
      item = await Course.findById(order.course)
        .populate('topics', 'title description')
        .select(
          'title description shortDescription thumbnail level duration tags topics price'
        );
    } else if (order.type === 'bundle') {
      item = await BundleCourse.findById(order.bundle)
        .populate(
          'courses',
          'title description shortDescription thumbnail level duration'
        )
        .select(
          'title description shortDescription thumbnail year subject courseType price discountPrice duration tags courses'
        );
    }

    res.render('student/order-details', {
      title: `Order #${orderNumber}`,
      student,
      order: { ...order, item },
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
      title: 'My Homework Attempts',
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
      title: 'My Profile',
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

// Update Profile
const updateProfile = async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updates.password;
    delete updates.role;
    delete updates.isActive;
    delete updates.studentCode;
    delete updates.email; // Email should not be editable
    delete updates.username; // Username should not be editable

    // Only allow specific fields to be updated
    const allowedFields = [
      'firstName',
      'lastName',
      'schoolName',
      'englishTeacher',
      'howDidYouKnow',
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
        englishTeacher: student.englishTeacher,
        howDidYouKnow: student.howDidYouKnow,
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
      title: 'Settings',
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

    // Upload to Cloudinary
    const { uploadImage } = require('../utils/cloudinary');
    const uploadResult = await uploadImage(req.file.buffer, {
      folder: 'profile-pictures',
      transformation: [
        {
          width: 300,
          height: 300,
          crop: 'fill',
          gravity: 'face',
          quality: 'auto',
        },
        { format: 'auto' },
      ],
    });

    // Delete old profile picture if it exists
    if (
      student.profilePicture &&
      student.profilePicture.includes('cloudinary')
    ) {
      try {
        const { deleteImage } = require('../utils/cloudinary');
        const publicId = student.profilePicture.split('/').pop().split('.')[0];
        await deleteImage(`profile-pictures/${publicId}`);
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
    const studentId = req.session.user.id;

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Delete the student account
    await User.findByIdAndDelete(studentId);

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
    });

    res.json({
      success: true,
      message: 'Account deleted successfully',
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
    console.log('Populated Content Item:', populatedContentItem);
    res.render('student/take-content-quiz', {
      title: `Taking ${contentItem.title}`,
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

    console.log('Submitting content quiz:', {
      studentId,
      contentId,
      courseId,
      topicId,
      contentType,
      answers,
    });

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
        // Handle MCQ and True/False questions
        const correctAnswer = question.correctAnswer;
        const correctAnswerStr = Array.isArray(correctAnswer)
          ? correctAnswer[0]
          : correctAnswer;
        isCorrect = userAnswer === correctAnswerStr;
      }

      if (isCorrect) {
        correctAnswers++;
        totalPoints += selectedQ.points || 1;
        points = selectedQ.points || 1;
      }

      detailedAnswers.push({
        questionId: question._id,
        selectedAnswer: userAnswer || '',
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

    // Get passing score
    const passingScore =
      contentType === 'quiz'
        ? contentItem.quizSettings?.passingScore || 60
        : contentItem.homeworkSettings?.passingScore || 60;

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
      title: `${contentItem.title} - Results`,
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

    // Shuffle questions if enabled
    let questions = quiz.selectedQuestions;
    if (quiz.shuffleQuestions) {
      questions = questions.sort(() => Math.random() - 0.5);
    }

    // Shuffle options if enabled
    if (quiz.shuffleOptions) {
      questions.forEach((q) => {
        if (q.question.options && Array.isArray(q.question.options)) {
          q.question.options = q.question.options.sort(
            () => Math.random() - 0.5
          );
        }
      });
    }

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

      detailedAnswers.push({
        questionId: question._id,
        selectedAnswer: userAnswer || '',
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

    res.render('student/standalone-quiz-results', {
      title: `${quiz.title} - Results`,
      quiz,
      student,
      attemptHistory,
      bestScore,
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

    console.log('Student requesting to join Zoom meeting:', meetingId);

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

    console.log('🔍 Found meeting in database:', {
      dbMeetingId: zoomMeeting.meetingId,
      meetingName: zoomMeeting.meetingName,
      status: zoomMeeting.status,
      joinUrl: zoomMeeting.joinUrl ? 'Present' : 'Missing',
    });

    // Validate meeting exists in Zoom (optional but recommended)
    try {
      const zoomMeetingDetails = await zoomService.getMeetingDetails(
        zoomMeeting.meetingId
      );
      console.log('✅ Meeting exists in Zoom:', zoomMeetingDetails.id);
    } catch (zoomError) {
      console.warn('⚠️ Could not verify meeting in Zoom:', zoomError.message);
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

    console.log('🔍 Enrollment check:', {
      studentId: studentId,
      meetingCourseId: zoomMeeting.course._id.toString(),
      studentCourses: student.enrolledCourses.map((e) =>
        e.course ? e.course._id.toString() : 'null'
      ),
      isEnrolled: isEnrolled,
    });

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

    // Generate tracking join URL for external Zoom client
    const studentInfo = {
      name: student.name || `${student.firstName} ${student.lastName}`.trim(),
      email: student.studentEmail || student.email,
      id: studentId,
    };

    const trackingJoinUrl = zoomService.generateTrackingJoinUrl(
      zoomMeeting.meetingId,
      studentInfo,
      zoomMeeting.password
    );

    console.log('✅ Student authorized to join meeting');
    console.log('📊 Meeting details:', {
      meetingId: zoomMeeting.meetingId,
      studentName: studentInfo.name,
      studentEmail: studentInfo.email,
      joinMethod: 'external_client',
    });

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

    console.log('✅ Student leave recorded');

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
  // Zoom Meeting functions
  joinZoomMeeting,
  leaveZoomMeeting,
  getZoomMeetingHistory,
};
