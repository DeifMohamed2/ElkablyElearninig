const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');
const Topic = require('../models/Topic');
const User = require('../models/User');
const Admin = require('../models/Admin');
const QuestionBank = require('../models/QuestionBank');
const Question = require('../models/Question');
const Progress = require('../models/Progress');
const Purchase = require('../models/Purchase');
const Quiz = require('../models/Quiz');
const BrilliantStudent = require('../models/BrilliantStudent');
const ZoomMeeting = require('../models/ZoomMeeting');
const PromoCode = require('../models/PromoCode');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const ExcelExporter = require('../utils/excelExporter');
const zoomService = require('../utils/zoomService');
const whatsappNotificationService = require('../utils/whatsappNotificationService');



// Admin Dashboard with Real Data
const getAdminDashboard = async (req, res) => {
  try {
    console.log('Fetching dashboard data...');

    // Fetch real data from database using correct field names
    const [
      totalStudents,
      activeStudents,
      newStudentsThisMonth,
      totalCourses,
      publishedCourses,
      draftCourses,
      totalRevenue,
      monthlyRevenue,
      totalOrders,
      recentStudents,
      newOrders,
      topCourses,
      studentGrowth,
      revenueData,
      progressStats,
      brilliantStudentsStats,
    ] = await Promise.all([
      // Student statistics - using correct field names from User model
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({
        role: 'student',
        createdAt: {
          $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
        },
      }),

      // Course statistics
      Course.countDocuments(),
      Course.countDocuments({ status: 'published' }),
      Course.countDocuments({ status: 'draft' }),

      // Revenue statistics - excluding refunded orders
      Purchase.aggregate([
        {
          $match: {
            status: { $in: ['completed', 'paid'] },
            $or: [{ refundedAt: { $exists: false } }, { refundedAt: null }],
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Purchase.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
            },
            status: { $in: ['completed', 'paid'] },
            $or: [{ refundedAt: { $exists: false } }, { refundedAt: null }],
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Purchase.countDocuments({
        status: { $in: ['completed', 'paid'] },
        $or: [{ refundedAt: { $exists: false } }, { refundedAt: null }],
      }),

      // Recent activity - using correct field names
      User.find({ role: 'student' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName studentEmail createdAt'),

      // New orders (last 24 hours) for notifications
      Purchase.find({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        status: { $in: ['completed', 'paid'] },
      })
        .populate('user', 'firstName lastName studentEmail')
        .sort({ createdAt: -1 })
        .limit(10),

      // Top performing courses (including featured) - Get courses with enrollment data
      Course.find({ status: { $in: ['published', 'draft'] } })
        .populate('bundle', 'title')
        .sort({ createdAt: -1 })
        .limit(6)
        .select('title level category status price featured bundle'),

      // Student growth data (last 7 days)
      User.aggregate([
        {
          $match: {
            role: 'student',
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Revenue data (last 7 days)
      Purchase.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            status: 'completed',
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: '$total' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Progress statistics
      Progress.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$completed', true] }, 1, 0],
              },
            },
          },
        },
      ]),

      // Brilliant students statistics
      BrilliantStudent.getStatistics().catch(err => {
        console.error('Error fetching brilliant students statistics:', err);
        return {};
      }),
    ]);

    console.log('Data fetched successfully:', {
      totalStudents,
      totalCourses,
      totalRevenue: totalRevenue[0]?.total || 0,
    });

    // Calculate engagement metrics based on real data
    const progressData = progressStats[0] || { total: 0, completed: 0 };

    // Calculate engagement score based on multiple factors
    let totalEnrolledStudents = 0;
    let activeStudentsCount = 0;
    let studentsWithProgress = 0;

    try {
      totalEnrolledStudents = await User.countDocuments({
        role: 'student',
        'enrolledCourses.0': { $exists: true },
      });
    } catch (error) {
      console.error('Error counting enrolled students:', error);
    }

    try {
      activeStudentsCount = await User.countDocuments({
        role: 'student',
        'enrolledCourses.status': 'active',
        isActive: true,
      });
    } catch (error) {
      console.error('Error counting active students:', error);
    }

    try {
      studentsWithProgress = await User.countDocuments({
        role: 'student',
        'enrolledCourses.contentProgress.0': { $exists: true },
      });
    } catch (error) {
      console.error('Error counting students with progress:', error);
    }

    // Calculate engagement score based on active students and progress
    let engagementScore = 0;
    if (totalEnrolledStudents > 0) {
      const activeEngagement =
        (activeStudentsCount / totalEnrolledStudents) * 40; // 40% weight
      const progressEngagement =
        progressData.total > 0
          ? (progressData.completed / progressData.total) * 60
          : 0; // 60% weight
      engagementScore = Math.round(activeEngagement + progressEngagement);
    }

    // Calculate growth percentages (mock for now - would need historical data)
    const studentGrowthPercent =
      totalStudents > 0 ? Math.floor(Math.random() * 20) + 5 : 0;
    const courseGrowthPercent =
      totalCourses > 0 ? Math.floor(Math.random() * 15) + 3 : 0;
    const revenueGrowthPercent =
      (totalRevenue[0]?.total || 0) > 0
        ? Math.floor(Math.random() * 25) + 10
        : 0;

    // Get WhatsApp status
    let whatsappStatus = 'disconnected';
    let whatsappMessages = 0;
    let whatsappTemplates = 0;
    
    try {
      const wasender = require('../utils/wasender');
      const sessionStatus = await wasender.getGlobalStatus();
      if (sessionStatus.success) {
        whatsappStatus = 'connected';
      }
      
      // WhatsAppTemplate model doesn't exist yet, so we'll set templates to 0
      whatsappTemplates = 0;
      // You can add message count logic here if you track sent messages
    } catch (error) {
      console.error('Error getting WhatsApp status:', error);
    }

    // Prepare dashboard data
    const dashboardData = {
      students: {
        total: totalStudents || 0,
        active: activeStudents || 0,
        newThisMonth: newStudentsThisMonth || 0,
        growth: studentGrowthPercent,
      },
      courses: {
        total: totalCourses || 0,
        published: publishedCourses || 0,
        draft: draftCourses || 0,
        growth: courseGrowthPercent,
      },
      revenue: {
        total: Math.round(totalRevenue[0]?.total || 0),
        thisMonth: Math.round(monthlyRevenue[0]?.total || 0),
        orders: totalOrders || 0,
        growth: revenueGrowthPercent,
      },
      engagement: {
        score: engagementScore,
        trend:
          engagementScore > 70
            ? 'up'
            : engagementScore > 50
            ? 'neutral'
            : 'down',
        change: engagementScore > 70 ? 5 : engagementScore > 50 ? 0 : -3,
        avgSession: '24m',
        completion:
          progressData.total > 0
            ? Math.round((progressData.completed / progressData.total) * 100)
            : 0,
        activeStudents: activeStudentsCount,
        totalEnrolled: totalEnrolledStudents,
        studentsWithProgress: studentsWithProgress,
      },
      brilliantStudents: {
        total: Object.values(brilliantStudentsStats || {}).reduce(
          (sum, stat) => sum + (stat.count || 0),
          0
        ),
        est: (brilliantStudentsStats && brilliantStudentsStats.EST) ? brilliantStudentsStats.EST.count || 0 : 0,
        dsat: (brilliantStudentsStats && brilliantStudentsStats.DSAT) ? brilliantStudentsStats.DSAT.count || 0 : 0,
        act: (brilliantStudentsStats && brilliantStudentsStats.ACT) ? brilliantStudentsStats.ACT.count || 0 : 0,
        avgScore:
          Object.keys(brilliantStudentsStats || {}).length > 0
            ? Object.values(brilliantStudentsStats).reduce(
                (sum, stat) => sum + (stat.avgScore || 0),
                0
              ) / Object.keys(brilliantStudentsStats).length
            : 0,
        stats: brilliantStudentsStats || {},
      },
      recentActivity: [
        // Recent students
        ...recentStudents.map((user, index) => ({
          icon: 'user-plus',
          message: `New student registered: ${user.firstName} ${user.lastName}`,
          time: `${index + 1} hour${index > 0 ? 's' : ''} ago`,
          type: 'student',
        })),
        // New orders
        ...newOrders.map((order, index) => ({
          icon: 'shopping-cart',
          message: `New order: ${order.orderNumber} - EGP ${order.total}`,
          time: `${index + 1} hour${index > 0 ? 's' : ''} ago`,
          type: 'order',
          orderId: order._id,
          customer: order.user
            ? `${order.user.firstName} ${order.user.lastName}`
            : 'Unknown',
        })),
      ]
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 10),
      topCourses: await Promise.all(
        topCourses.map(async (course) => {
          try {
            // Get actual enrollment data from User model
            const enrolledStudents = await User.find({
              role: 'student',
              'enrolledCourses.course': course._id,
            }).select('enrolledCourses');

            // Calculate enrollments and completions
            let enrollments = 0;
            let completedStudents = 0;
            let totalRevenue = 0;

            if (enrolledStudents.length > 0) {
              enrollments = enrolledStudents.length;

              // Count completed students
              completedStudents = enrolledStudents.filter((student) => {
                const enrollment = student.enrolledCourses.find(
                  (ec) =>
                    ec.course && ec.course.toString() === course._id.toString()
                );
                return enrollment && enrollment.status === 'completed';
              }).length;

              // Calculate revenue from individual course purchases
              const coursePurchases = await User.find({
                'purchasedCourses.course': course._id,
                'purchasedCourses.status': 'active',
              });

              totalRevenue = coursePurchases.reduce((sum, user) => {
                const purchase = user.purchasedCourses.find(
                  (pc) => pc.course.toString() === course._id.toString()
                );
                return sum + (purchase ? purchase.price : 0);
              }, 0);
            }

            const completionRate =
              enrollments > 0
                ? Math.round((completedStudents / enrollments) * 100)
                : 0;

            return {
              title: course.title,
              level: course.level || 'Beginner',
              category: course.category || 'General',
              status: course.status,
              featured: course.featured || false,
              enrollments: enrollments,
              completionRate: completionRate,
              revenue: totalRevenue,
            };
          } catch (error) {
            console.error('Error processing course:', course.title, error);
            return {
              title: course.title,
              level: course.level || 'Beginner',
              category: course.category || 'General',
              status: course.status,
              featured: course.featured || false,
              enrollments: 0,
              completionRate: 0,
              revenue: 0,
            };
          }
        })
      ),
      charts: {
        studentGrowth: studentGrowth,
        revenueData: revenueData,
      },
      newOrdersCount: newOrders.length,
      newOrders: newOrders.slice(0, 5), // Show latest 5 orders for notifications
      whatsappStatus: whatsappStatus,
      whatsappMessages: whatsappMessages,
      whatsappTemplates: whatsappTemplates,
    };

    console.log('Dashboard data prepared:', dashboardData);

    return res.render('admin/dashboard', {
      title: 'Dashboard | ELKABLY',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      dashboardData: dashboardData,
    });
  } catch (error) {
    console.error('Dashboard error:', error);

    // Fallback data in case of error
    const fallbackData = {
      students: { total: 0, active: 0, newThisMonth: 0, growth: 0 },
      courses: { total: 0, published: 0, draft: 0, growth: 0 },
      revenue: { total: 0, thisMonth: 0, orders: 0, growth: 0 },
      engagement: {
        score: 0,
        trend: 'neutral',
        change: 0,
        avgSession: '0m',
        completion: 0,
      },
      brilliantStudents: {
        total: 0,
        est: 0,
        dsat: 0,
        act: 0,
        avgScore: 0,
        stats: {},
      },
      recentActivity: [],
      topCourses: [],
      charts: { studentGrowth: [], revenueData: [] },
    };

    return res.render('admin/dashboard', {
      title: 'Dashboard | ELKABLY',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      dashboardData: fallbackData,
    });
  }
};

// Get all courses with filtering
const getCourses = async (req, res) => {
  try {
    const {
      status,
      level,
      bundle,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 12,
    } = req.query;

    // Build filter object
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (level) {
      filter.level = level;
    }

    if (bundle) {
      filter.bundle = bundle;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { courseCode: { $regex: search, $options: 'i' } },
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get courses with pagination
    const courses = await Course.find(filter)
      .populate('topics')
      .populate('bundle', 'title bundleCode')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalCourses = await Course.countDocuments(filter);
    const totalPages = Math.ceil(totalCourses / parseInt(limit));

    // Get course statistics
    const stats = await getCourseStats();

    // Get filter options
    const filterOptions = await getFilterOptions();

    return res.render('admin/courses', {
      title: 'Course Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      courses,
      stats,
      filterOptions,
      currentFilters: { status, level, bundle, search, sortBy, sortOrder },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCourses,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    req.flash('error_msg', 'Error loading courses');
    return res.redirect('/admin/dashboard');
  }
};

// Create new course
const createCourse = async (req, res) => {
  try {
    const {
      title,
      description,
      shortDescription,
      level,
      year,
      duration,
      price = 0,
      status = 'draft',
      bundleId,
      category,
      thumbnail,
    } = req.body;

    console.log('Creating course with data:', {
      title,
      thumbnail,
      bundleId,
      category,
    });

    // Validate bundle exists
    const bundle = await BundleCourse.findById(bundleId);
    if (!bundle) {
      req.flash('error_msg', 'Please select a valid bundle');
      return res.redirect('/admin/courses');
    }

    // Create new course
    const course = new Course({
      title: title.trim(),
      description: description ? description.trim() : '',
      shortDescription: shortDescription ? shortDescription.trim() : '',
      level,
      year, // Use provided year when creating course
      category: category.trim(),
      duration: duration && !isNaN(parseInt(duration)) ? parseInt(duration) : 0,
      price: parseFloat(price),
      status,
      createdBy: req.session.user.id,
      bundle: bundleId,
      thumbnail: thumbnail || '',
    });

    console.log('Course object before save:', {
      title: course.title,
      thumbnail: course.thumbnail,
      bundle: course.bundle,
    });

    await course.save();

    console.log('Course saved successfully with ID:', course._id);

    // Add course to bundle
    bundle.courses.push(course._id);
    await bundle.save();

    req.flash(
      'success_msg',
      'Course created and added to bundle successfully!'
    );
    res.redirect('/admin/courses');
  } catch (error) {
    console.error('Error creating course:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      req.flash(
        'error_msg',
        `Validation Error: ${validationErrors.join(', ')}`
      );
    } else {
      req.flash('error_msg', 'Error creating course');
    }

    res.redirect('/admin/courses');
  }
};

// Get single course
const getCourse = async (req, res) => {
  try {
    const { courseCode } = req.params;

    const course = await Course.findOne({ courseCode })
      .populate('topics')
      .populate('createdBy', 'userName');

    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect('/admin/courses');
    }

    return res.render('admin/course-detail', {
      title: `Course: ${course.title} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      course,
    });
  } catch (error) {
    console.error('Error fetching course:', error);
    req.flash('error_msg', 'Error loading course');
    res.redirect('/admin/courses');
  }
};

// Detailed Course Analytics page
const getCourseDetails = async (req, res) => {
  try {
    const { courseCode } = req.params;

    const course = await Course.findOne({ courseCode })
      .populate({ path: 'topics', options: { sort: { order: 1 } } })
      .populate('bundle', 'title bundleCode year')
      .lean();

    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect('/admin/courses');
    }

    // Find students enrolled in this course
    const enrolledStudents = await User.find({
      'enrolledCourses.course': course._id,
    })
      .select(
        'firstName lastName username studentEmail studentCode enrolledCourses lastLogin isActive grade schoolName'
      )
      .lean();

    // Map of topicId -> topic and content maps for quick lookup
    const topicIdToTopic = new Map();
    const contentIndex = new Map(); // key: contentId string -> { topicId, contentItem }
    (course.topics || []).forEach((t) => {
      topicIdToTopic.set(t._id.toString(), t);
      (t.content || []).forEach((ci) => {
        contentIndex.set(ci._id.toString(), {
          topicId: t._id.toString(),
          content: ci,
        });
      });
    });

    // Build enrolled student rows with progress for this course
    const studentsTable = enrolledStudents.map((stu) => {
      const enrollment = (stu.enrolledCourses || []).find(
        (e) => e.course && e.course.toString() === course._id.toString()
      );
      const progress = enrollment?.progress || 0;
      const status =
        enrollment?.status ||
        (progress >= 100
          ? 'completed'
          : progress > 0
          ? 'active'
          : 'not_started');
      return {
        _id: stu._id,
        name: `${stu.firstName} ${stu.lastName}`,
        email: stu.studentEmail,
        studentCode: stu.studentCode,
        grade: stu.grade,
        schoolName: stu.schoolName,
        status,
        progress,
        enrolledAt: enrollment?.enrolledAt || null,
        lastAccessed: enrollment?.lastAccessed || stu.lastLogin || null,
        isActive: !!stu.isActive,
      };
    });

    // Compute topics analytics using enrollment.contentProgress
    const topicsAnalytics = (course.topics || []).map((topic) => {
      // For each content item, compute views/completions/quiz stats
      const contents = (topic.content || []).map((ci) => {
        let viewers = 0;
        let completions = 0;
        let totalTimeSpent = 0;
        let attempts = 0;
        let scores = [];

        enrolledStudents.forEach((stu) => {
          const enrollment = (stu.enrolledCourses || []).find(
            (e) => e.course && e.course.toString() === course._id.toString()
          );
          if (!enrollment || !enrollment.contentProgress) return;
          const cp = enrollment.contentProgress.find(
            (p) => p.contentId && p.contentId.toString() === ci._id.toString()
          );
          if (!cp) return;
          // Viewed if has any progress or lastAccessed present
          viewers += 1;
          if (cp.completionStatus === 'completed') completions += 1;
          totalTimeSpent += cp.timeSpent || 0;
          if (
            (ci.type === 'quiz' || ci.type === 'homework') &&
            cp.quizAttempts &&
            cp.quizAttempts.length
          ) {
            attempts += cp.quizAttempts.length;
            if (typeof cp.bestScore === 'number') {
              scores.push(cp.bestScore);
            } else if (cp.quizAttempts[0]?.score !== undefined) {
              scores.push(
                cp.quizAttempts[cp.quizAttempts.length - 1].score || 0
              );
            }
          }
        });

        const averageTimeSpent =
          viewers > 0 ? Math.round((totalTimeSpent / viewers) * 10) / 10 : 0;
        const averageScore =
          scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null;
        const passRate =
          ci.type === 'quiz' || ci.type === 'homework'
            ? (() => {
                let passed = 0;
                let taken = 0;
                enrolledStudents.forEach((stu) => {
                  const enrollment = (stu.enrolledCourses || []).find(
                    (e) =>
                      e.course && e.course.toString() === course._id.toString()
                  );
                  if (!enrollment || !enrollment.contentProgress) return;
                  const cp = enrollment.contentProgress.find(
                    (p) =>
                      p.contentId &&
                      p.contentId.toString() === ci._id.toString()
                  );
                  if (!cp) return;
                  if (cp.quizAttempts && cp.quizAttempts.length) {
                    taken += 1;
                    const last = cp.quizAttempts[cp.quizAttempts.length - 1];
                    const passing =
                      cp.passingScore ||
                      ci.quizSettings?.passingScore ||
                      ci.homeworkSettings?.passingScore ||
                      60;
                    if ((last?.score || 0) >= passing) passed += 1;
                  }
                });
                return taken > 0 ? Math.round((passed / taken) * 100) : null;
              })()
            : null;

        return {
          _id: ci._id,
          title: ci.title,
          type: ci.type,
          viewers,
          completions,
          averageTimeSpent, // minutes
          attempts,
          averageScore,
          passRate,
          order: ci.order || 0,
        };
      });

      // Topic-level aggregates
      const totalContent = contents.length;
      const totalViewers = contents.reduce((s, c) => s + c.viewers, 0);
      const totalCompletions = contents.reduce((s, c) => s + c.completions, 0);

      return {
        _id: topic._id,
        title: topic.title,
        order: topic.order,
        contentCount: totalContent,
        totals: {
          viewers: totalViewers,
          completions: totalCompletions,
        },
        contents,
      };
    });

    // Overall analytics
    const totalEnrolled = studentsTable.length;
    const averageProgress =
      totalEnrolled > 0
        ? Math.round(
            studentsTable.reduce((s, st) => s + (st.progress || 0), 0) /
              totalEnrolled
          )
        : 0;
    const completedStudents = studentsTable.filter(
      (s) => s.progress >= 100
    ).length;
    const completionRate =
      totalEnrolled > 0
        ? Math.round((completedStudents / totalEnrolled) * 100)
        : 0;

    // Content completion rate based on all contents
    const allContentsCount = (course.topics || []).reduce(
      (sum, t) => sum + (t.content || []).length,
      0
    );
    let totalCompletedContentMarks = 0;
    enrolledStudents.forEach((stu) => {
      const enrollment = (stu.enrolledCourses || []).find(
        (e) => e.course && e.course.toString() === course._id.toString()
      );
      if (!enrollment || !enrollment.contentProgress) return;
      totalCompletedContentMarks += enrollment.contentProgress.filter(
        (cp) => cp.completionStatus === 'completed'
      ).length;
    });
    const contentCompletionRate =
      allContentsCount > 0 && totalEnrolled > 0
        ? Math.round(
            (totalCompletedContentMarks / (allContentsCount * totalEnrolled)) *
              100
          )
        : 0;

    const analytics = {
      totalEnrolled,
      averageProgress,
      completionRate,
      contentCompletionRate,
      topicsCount: course.topics?.length || 0,
    };

    return res.render('admin/course-detail', {
      title: `Course Details: ${course.title} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      course,
      students: studentsTable,
      topicsAnalytics,
      analytics,
    });
  } catch (error) {
    console.error('Error fetching course details:', error);
    req.flash('error_msg', 'Error loading course details');
    return res.redirect('/admin/courses');
  }
};

// Get course data for editing (API endpoint)
const getCourseData = async (req, res) => {
  try {
    const { courseCode } = req.params;

    const course = await Course.findOne({ courseCode })
      .populate('bundle', 'title bundleCode year _id')
      .lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Return course data in JSON format for the edit modal
    return res.json({
      success: true,
      course: {
        _id: course._id,
        courseCode: course.courseCode,
        title: course.title,
        description: course.description,
        shortDescription: course.shortDescription,
        level: course.level,
        category: course.category,
        duration: course.duration,
        price: course.price,
        discountPrice: course.discountPrice,
        status: course.status,
        isFeatured: course.isFeatured || false,
        tags: course.tags || [],
        thumbnail: course.thumbnail || '',
        bundle: course.bundle
          ? {
              _id: course.bundle._id,
              title: course.bundle.title,
              bundleCode: course.bundle.bundleCode,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Error fetching course data:', error);
    return res.status(500).json({
      success: false,
      message: 'Error loading course data',
    });
  }
};

// Update course
const updateCourse = async (req, res) => {
  try {
    const { courseCode } = req.params;
    const updateData = req.body;

    // Handle optional description fields
    if (updateData.description !== undefined) {
      updateData.description = updateData.description
        ? updateData.description.trim()
        : '';
    }
    if (updateData.shortDescription !== undefined) {
      updateData.shortDescription = updateData.shortDescription
        ? updateData.shortDescription.trim()
        : '';
    }

    // Remove empty fields (but keep description fields as they can be empty strings)
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === '' || updateData[key] === null) {
        // Don't delete description fields as they can be intentionally empty
        if (key !== 'description' && key !== 'shortDescription') {
          delete updateData[key];
        }
      }
    });

    // Find the current course to get the old bundle
    const currentCourse = await Course.findOne({ courseCode });
    if (!currentCourse) {
      if (
        req.xhr ||
        req.headers.accept?.indexOf('json') > -1 ||
        req.headers['content-type']?.includes('application/json')
      ) {
        return res.status(404).json({
          success: false,
          message: 'Course not found',
        });
      }
      req.flash('error_msg', 'Course not found');
      return res.redirect('/admin/courses');
    }

    const oldBundleId = currentCourse.bundle;
    const newBundleId = updateData.bundleId;

    console.log('Bundle update debug:', {
      courseCode,
      oldBundleId: oldBundleId ? oldBundleId.toString() : 'null',
      newBundleId: newBundleId || 'null',
      isChanging:
        newBundleId && (!oldBundleId || newBundleId !== oldBundleId.toString()),
    });

    // If bundle is being changed, handle bundle relationships
    const isBundleChanging =
      newBundleId && (!oldBundleId || newBundleId !== oldBundleId.toString());

    if (isBundleChanging) {
      // Validate new bundle exists
      const newBundle = await BundleCourse.findById(newBundleId);
      if (!newBundle) {
        if (
          req.xhr ||
          req.headers.accept?.indexOf('json') > -1 ||
          req.headers['content-type']?.includes('application/json')
        ) {
          return res.status(400).json({
            success: false,
            message: 'Invalid bundle selected',
          });
        }
        req.flash('error_msg', 'Invalid bundle selected');
        return res.redirect(`/admin/courses/${courseCode}`);
      }

      // Remove course from old bundle (if it exists)
      if (oldBundleId) {
        await BundleCourse.findByIdAndUpdate(oldBundleId, {
          $pull: { courses: currentCourse._id },
        });
      }

      // Add course to new bundle
      await BundleCourse.findByIdAndUpdate(newBundleId, {
        $addToSet: { courses: currentCourse._id },
      });

      // Update course with new bundle and related fields
      updateData.bundle = newBundleId;
      updateData.subject = newBundle.subject;
      updateData.year = newBundle.year;

      console.log('Bundle relationships updated:', {
        removedFromOldBundle: oldBundleId || 'none',
        addedToNewBundle: newBundleId,
        newSubject: newBundle.subject,
        newYear: newBundle.year,
      });
    }

    // Update the course
    const course = await Course.findOneAndUpdate(
      { courseCode },
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (
      req.xhr ||
      req.headers.accept?.indexOf('json') > -1 ||
      req.headers['content-type']?.includes('application/json')
    ) {
      return res.json({
        success: true,
        message: 'Course updated successfully!',
        course: course,
      });
    }

    req.flash('success_msg', 'Course updated successfully!');
    res.redirect(`/admin/courses/${courseCode}`);
  } catch (error) {
    console.error('Error updating course:', error);

    if (
      req.xhr ||
      req.headers.accept?.indexOf('json') > -1 ||
      req.headers['content-type']?.includes('application/json')
    ) {
      return res.status(500).json({
        success: false,
        message: 'Error updating course',
      });
    }

    req.flash('error_msg', 'Error updating course');
    res.redirect('/admin/courses');
  }
};

// Delete course
const deleteCourse = async (req, res) => {
  try {
    const { courseCode } = req.params;

    // Find the course first
    const course = await Course.findOne({ courseCode });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Check if course is already archived
    if (course.status === 'archived') {
      // Permanently delete the course and its associated topics
      // Use the course's ObjectId to delete topics
      await Topic.deleteMany({ course: course._id });

      // Remove course from all users' enrollments and purchases
      await User.updateMany(
        {},
        {
          $pull: {
            enrolledCourses: { course: course._id },
            purchasedCourses: { course: course._id },
          },
        }
      );

      // Remove course from wishlists (handle both object and array formats)
      await User.updateMany(
        { 'wishlist.courses': course._id },
        {
          $pull: {
            'wishlist.courses': course._id,
          },
        }
      );

      // Delete the course
      await Course.findOneAndDelete({ courseCode });

      return res.json({
        success: true,
        message:
          'Course permanently deleted from database and removed from all users!',
        action: 'deleted',
      });
    } else {
      // Archive the course instead of deleting
      await Course.findOneAndUpdate(
        { courseCode },
        {
          status: 'archived',
          isActive: false,
        }
      );

      return res.json({
        success: true,
        message: 'Course moved to archived status!',
        action: 'archived',
      });
    }
  } catch (error) {
    console.error('Error deleting course:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting course',
    });
  }
};

// Get course content management page
const getCourseContent = async (req, res) => {
  try {
    const { courseCode } = req.params;

    const course = await Course.findOne({ courseCode })
      .populate({
        path: 'topics',
        options: { sort: { order: 1 } },
        populate: {
          path: 'content.zoomMeeting',
          model: 'ZoomMeeting',
        },
      })
      .populate('bundle', 'title bundleCode year');

    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect('/admin/courses');
    }

    // Calculate course stats
    const totalTopics = course.topics ? course.topics.length : 0;
    const publishedTopics = course.topics
      ? course.topics.filter((topic) => topic.isPublished).length
      : 0;
    const totalContentItems = course.topics
      ? course.topics.reduce(
          (total, topic) => total + (topic.content ? topic.content.length : 0),
          0
        )
      : 0;
    const estimatedDuration = course.topics
      ? course.topics.reduce(
          (total, topic) => total + (topic.estimatedTime || 0),
          0
        )
      : 0;

    // Get all topics for prerequisite selection
    const allTopics = await Topic.find({ course: course._id })
      .select('_id title order')
      .sort({ order: 1 });

    // Get all content items from all topics for content prerequisites
    const allContentItems = [];
    if (course.topics && course.topics.length > 0) {
      for (const topic of course.topics) {
        if (topic.content && topic.content.length > 0) {
          topic.content.forEach((contentItem, index) => {
            allContentItems.push({
              _id: contentItem._id,
              title: contentItem.title,
              type: contentItem.type,
              topicTitle: topic.title,
              topicOrder: topic.order,
              contentOrder: index + 1,
            });
          });
        }
      }
    }

    // Get question banks for quiz/homework content
    const questionBanks = await QuestionBank.find({ status: 'active' })
      .select('name bankCode description totalQuestions tags')
      .sort({ name: 1 });

    return res.render('admin/course-content', {
      title: `Course Content: ${course.title} | ELKABLY`,
      courseCode,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      course,
      allTopics, // For topic prerequisite selection
      allContentItems, // For content prerequisite selection
      questionBanks, // For quiz/homework content creation
      stats: {
        totalTopics,
        publishedTopics,
        totalContentItems,
        estimatedDuration: Math.round((estimatedDuration / 60) * 10) / 10, // Convert to hours
        enrolledStudents: course.enrolledStudents
          ? course.enrolledStudents.length
          : 0,
      },
    });
  } catch (error) {
    console.error('Error fetching course content:', error);
    req.flash('error_msg', 'Error loading course content');
    res.redirect('/admin/courses');
  }
};

// Create topic
const createTopic = async (req, res) => {
  try {
    const { courseCode } = req.params;
    const {
      title,
      description,
      estimatedTime,
      isPublished,
      difficulty,
      tags,
      unlockConditions,
    } = req.body;

    const course = await Course.findOne({ courseCode });
    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect('/admin/courses');
    }

    // Get the next order number
    const topicCount = await Topic.countDocuments({ course: course._id });

    // Process tags
    const topicTags = tags
      ? (Array.isArray(tags) ? tags : [tags]).filter((tag) => tag.trim())
      : [];

    const topic = new Topic({
      course: course._id,
      title: title.trim(),
      description: description ? description.trim() : '',
      order: topicCount + 1,
      estimatedTime: estimatedTime && !isNaN(parseInt(estimatedTime)) ? parseInt(estimatedTime) : 0,
      isPublished: isPublished === 'on',
      difficulty: difficulty || 'beginner',
      tags: topicTags,
      unlockConditions: unlockConditions || 'immediate',
      createdBy: req.session.user.id,
    });

    await topic.save();

    // Add topic to course
    course.topics.push(topic._id);
    await course.save();

    req.flash('success_msg', 'Topic created successfully!');
    res.redirect(`/admin/courses/${courseCode}/content`);
  } catch (error) {
    console.error('Error creating topic:', error);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      req.flash(
        'error_msg',
        `Validation Error: ${validationErrors.join(', ')}`
      );
    } else {
      req.flash('error_msg', 'Error creating topic');
    }

    res.redirect(`/admin/courses/${req.params.courseCode}/content`);
  }
};

// Update topic
const updateTopic = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;
    const {
      title,
      description,
      estimatedTime,
      isPublished,
      order,
      difficulty,
      tags,
      unlockConditions,
    } = req.body;

    // Validate topicId
    if (!topicId || topicId === 'reorder') {
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topic ID',
        });
      }
      req.flash('error_msg', 'Invalid topic ID');
      return res.redirect(`/admin/courses/${courseCode}/content`);
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(404).json({
          success: false,
          message: 'Topic not found',
        });
      }
      req.flash('error_msg', 'Topic not found');
      return res.redirect(`/admin/courses/${courseCode}/content`);
    }

    // Safely update fields with proper validation
    if (title) topic.title = title.trim();
    if (description) {
      const trimmedDescription = description.trim();
      if (trimmedDescription.length < 10) {
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
          return res.status(400).json({
            success: false,
            message: 'Description must be at least 10 characters long',
            errors: {
              description: 'Description must be at least 10 characters long',
            },
          });
        }
        req.flash(
          'error_msg',
          'Description must be at least 10 characters long'
        );
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }
      topic.description = trimmedDescription;
    }
    if (estimatedTime !== undefined)
      topic.estimatedTime = estimatedTime && !isNaN(parseInt(estimatedTime)) ? parseInt(estimatedTime) : 0;
    if (isPublished !== undefined)
      topic.isPublished = isPublished === 'on' || isPublished === true;
    if (order) topic.order = order && !isNaN(parseInt(order)) ? parseInt(order) : topic.order;

    if (difficulty) topic.difficulty = difficulty;
    if (unlockConditions) topic.unlockConditions = unlockConditions;

    // Update tags
    if (tags !== undefined) {
      const topicTags = tags
        ? (Array.isArray(tags) ? tags : [tags]).filter((tag) => tag.trim())
        : [];
      topic.tags = topicTags;
    }

    await topic.save();

    // Check if this is an AJAX request
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.json({
        success: true,
        message: 'Topic updated successfully!',
        topic: {
          id: topic._id,
          title: topic.title,
          description: topic.description,
          estimatedTime: topic.estimatedTime,
          isPublished: topic.isPublished,
          order: topic.order,
          difficulty: topic.difficulty,
          tags: topic.tags,
          unlockConditions: topic.unlockConditions,
        },
      });
    }

    // Regular form submission - redirect
    req.flash('success_msg', 'Topic updated successfully!');
    res.redirect(`/admin/courses/${courseCode}/content`);
  } catch (error) {
    console.error('Error updating topic:', error);

    // Check if this is an AJAX request
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      // Handle validation errors specifically
      if (error.name === 'ValidationError') {
        const validationErrors = {};
        Object.keys(error.errors).forEach((key) => {
          validationErrors[key] = error.errors[key].message;
        });

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors,
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || 'Error updating topic',
      });
    }

    // Handle validation errors for regular form submission
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors)
        .map((key) => error.errors[key].message)
        .join(', ');
      req.flash('error_msg', `Validation failed: ${validationErrors}`);
    } else {
      req.flash('error_msg', 'Error updating topic');
    }

    res.redirect(`/admin/courses/${req.params.courseCode}/content`);
  }
};

// Update topic visibility (AJAX endpoint)
const updateTopicVisibility = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;
    const { isPublished } = req.body;

    // Validate topicId
    if (!topicId || topicId === 'reorder') {
      return res.status(400).json({
        success: false,
        message: 'Invalid topic ID',
      });
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    // Update visibility
    topic.isPublished = isPublished === true || isPublished === 'true';
    await topic.save();

    res.json({
      success: true,
      message: 'Topic visibility updated successfully',
      isPublished: topic.isPublished,
    });
  } catch (error) {
    console.error('Error updating topic visibility:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating topic visibility',
    });
  }
};

// Get topic details
const getTopicDetails = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;

    const course = await Course.findOne({ courseCode }).populate(
      'bundle',
      'title bundleCode year'
    );

    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect('/admin/courses');
    }

    const topic = await Topic.findById(topicId).populate('content.zoomMeeting');
    if (!topic) {
      req.flash('error_msg', 'Topic not found');
      return res.redirect(`/admin/courses/${courseCode}/content`);
    }

    // Get students enrolled in this course
    const enrolledStudents = await User.find({
      'enrolledCourses.course': course._id,
    })
      .select(
        'firstName lastName username studentEmail studentCode parentNumber parentCountryCode studentNumber studentCountryCode enrolledCourses lastLogin isActive grade schoolName'
      )
      .lean();

    // Prepare a quick lookup for topic content ids
    const topicContentIds = new Set(
      (topic.content || []).map((ci) => ci._id.toString())
    );

    // Build students table specific to this topic
    const students = enrolledStudents.map((stu) => {
      const enrollment = (stu.enrolledCourses || []).find(
        (e) => e.course && e.course.toString() === course._id.toString()
      );

      let topicCompletedCount = 0;
      let topicViewed = false;
      let timeSpentMinutes = 0;
      let lastAccessed = enrollment?.lastAccessed || stu.lastLogin || null;

      if (
        enrollment &&
        enrollment.contentProgress &&
        enrollment.contentProgress.length > 0
      ) {
        const cps = enrollment.contentProgress.filter(
          (cp) => cp.contentId && topicContentIds.has(cp.contentId.toString())
        );
        topicViewed = cps.length > 0;
        cps.forEach((cp) => {
          if (cp.completionStatus === 'completed') topicCompletedCount += 1;
          timeSpentMinutes += cp.timeSpent || 0;
          if (
            cp.lastAccessed &&
            (!lastAccessed ||
              new Date(cp.lastAccessed) > new Date(lastAccessed))
          ) {
            lastAccessed = cp.lastAccessed;
          }
        });
      }

      const totalTopicItems = topic.content ? topic.content.length : 0;
      const progress =
        totalTopicItems > 0
          ? Math.round((topicCompletedCount / totalTopicItems) * 100)
          : 0;
      const status =
        progress >= 100
          ? 'completed'
          : topicViewed
          ? 'in-progress'
          : 'not-started';

      // Format phones with country codes
      const parentPhone = `${stu.parentCountryCode || ''} ${
        stu.parentNumber || ''
      }`.trim();
      const studentPhone = `${stu.studentCountryCode || ''} ${
        stu.studentNumber || ''
      }`.trim();

      return {
        id: stu._id,
        name: `${stu.firstName} ${stu.lastName}`,
        email: stu.studentEmail,
        studentCode: stu.studentCode,
        parentPhone,
        studentPhone,
        progress,
        lastActivity: lastAccessed,
        timeSpentMinutes: timeSpentMinutes,
        status,
      };
    });

    // Content-level analytics for this topic
    const contentStats = (topic.content || []).map((ci) => {
      let viewers = 0;
      let completions = 0;
      let totalTimeSpent = 0;
      let attempts = 0;
      let scores = [];
      let bestScore = null;
      let bestPerformer = null; // { name, studentId, score }

      enrolledStudents.forEach((stu) => {
        const enrollment = (stu.enrolledCourses || []).find(
          (e) => e.course && e.course.toString() === course._id.toString()
        );
        if (!enrollment || !enrollment.contentProgress) return;
        const cp = enrollment.contentProgress.find(
          (p) => p.contentId && p.contentId.toString() === ci._id.toString()
        );
        if (!cp) return;
        viewers += 1;
        if (cp.completionStatus === 'completed') completions += 1;
        totalTimeSpent += cp.timeSpent || 0;
        if (
          (ci.type === 'quiz' || ci.type === 'homework') &&
          cp.quizAttempts &&
          cp.quizAttempts.length
        ) {
          attempts += cp.quizAttempts.length;
          const candidateScore =
            typeof cp.bestScore === 'number'
              ? cp.bestScore
              : cp.quizAttempts[cp.quizAttempts.length - 1]?.score || 0;
          scores.push(candidateScore);
          if (bestScore === null || candidateScore > bestScore) {
            bestScore = candidateScore;
            bestPerformer = {
              name: `${stu.firstName} ${stu.lastName}`,
              studentId: stu._id,
              score: candidateScore,
              studentCode: stu.studentCode,
            };
          }
        }
      });

      const averageTimeSpent =
        viewers > 0 ? Math.round((totalTimeSpent / viewers) * 10) / 10 : 0;
      const averageScore =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;

      return {
        _id: ci._id,
        title: ci.title,
        type: ci.type,
        viewers,
        completions,
        averageTimeSpent, // minutes
        attempts,
        averageScore,
        bestPerformer,
        order: ci.order || 0,
        zoomMeeting: ci.zoomMeeting || null, // Include Zoom meeting data
      };
    });

    // Overall analytics for the topic
    const totalStudents = students.length;
    const viewedStudents = students.filter(
      (s) => s.status !== 'not-started'
    ).length;
    const completedStudents = students.filter(
      (s) => s.status === 'completed'
    ).length;
    const inProgressStudents = students.filter(
      (s) => s.status === 'in-progress'
    ).length;
    const notStartedStudents = students.filter(
      (s) => s.status === 'not-started'
    ).length;
    const completionRate =
      totalStudents > 0
        ? Math.round((completedStudents / totalStudents) * 100)
        : 0;

    // Calculate average time spent across all students
    const totalTimeSpent = students.reduce(
      (sum, s) => sum + s.timeSpentMinutes,
      0
    );
    const averageTimeSpent =
      totalStudents > 0 ? Math.round(totalTimeSpent / totalStudents) : 0;

    // Calculate quiz/homework specific analytics
    let totalQuizAttempts = 0;
    let totalQuizScores = [];
    let passRate = null;
    let averageQuizScore = null;

    enrolledStudents.forEach((stu) => {
      const enrollment = (stu.enrolledCourses || []).find(
        (e) => e.course && e.course.toString() === course._id.toString()
      );
      if (!enrollment || !enrollment.contentProgress) return;

      (topic.content || []).forEach((ci) => {
        if (ci.type === 'quiz' || ci.type === 'homework') {
          const cp = enrollment.contentProgress.find(
            (p) => p.contentId && p.contentId.toString() === ci._id.toString()
          );
          if (cp && cp.quizAttempts) {
            totalQuizAttempts += cp.quizAttempts.length;
            cp.quizAttempts.forEach((attempt) => {
              if (attempt.score !== null && attempt.score !== undefined) {
                totalQuizScores.push(attempt.score);
              }
            });
          }
        }
      });
    });

    if (totalQuizScores.length > 0) {
      averageQuizScore = Math.round(
        totalQuizScores.reduce((a, b) => a + b, 0) / totalQuizScores.length
      );
      const passingScore = 60; // Default passing score
      const passedAttempts = totalQuizScores.filter(
        (score) => score >= passingScore
      ).length;
      passRate = Math.round((passedAttempts / totalQuizScores.length) * 100);
    }

    const analytics = {
      totalStudents,
      viewedStudents,
      completedStudents,
      inProgressStudents,
      notStartedStudents,
      completionRate,
      averageTimeSpent,
      totalQuizAttempts,
      averageQuizScore,
      passRate,
      totalContentItems: topic.content ? topic.content.length : 0,
      totalTimeSpent: Math.round(totalTimeSpent),
    };

    return res.render('admin/topic-details', {
      title: `Topic Details: ${topic.title} | ELKABLY`,
      courseCode,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      course,
      topic,
      analytics,
      students,
      contentStats,
    });
  } catch (error) {
    console.error('Error fetching topic details:', error);
    req.flash('error_msg', 'Error loading topic details');
    res.redirect('/admin/courses');
  }
};

// API: Get per-content student stats for a topic content
const getTopicContentStudentStats = async (req, res) => {
  try {
    const { courseCode, topicId, contentId } = req.params;

    const course = await Course.findOne({ courseCode }).select('_id');
    if (!course)
      return res
        .status(404)
        .json({ success: false, message: 'Course not found' });

    const topic = await Topic.findById(topicId);
    if (!topic)
      return res
        .status(404)
        .json({ success: false, message: 'Topic not found' });

    const contentItem = topic.content.id(contentId);
    if (!contentItem)
      return res
        .status(404)
        .json({ success: false, message: 'Content not found' });

    const enrolledStudents = await User.find({
      'enrolledCourses.course': course._id,
    })
      .select('firstName lastName studentEmail studentCode enrolledCourses')
      .lean();

    const rows = [];
    enrolledStudents.forEach((stu) => {
      const enrollment = (stu.enrolledCourses || []).find(
        (e) => e.course && e.course.toString() === course._id.toString()
      );
      if (!enrollment || !enrollment.contentProgress) return;
      const cp = enrollment.contentProgress.find(
        (p) => p.contentId && p.contentId.toString() === contentId
      );
      if (!cp) return;
      const attempts = cp.quizAttempts || [];
      rows.push({
        studentId: stu._id,
        name: `${stu.firstName} ${stu.lastName}`,
        email: stu.studentEmail,
        studentCode: stu.studentCode,
        completionStatus: cp.completionStatus,
        progressPercentage: cp.progressPercentage || 0,
        timeSpent: cp.timeSpent || 0,
        lastAccessed: cp.lastAccessed || null,
        attempts: attempts.map((a) => ({
          attemptNumber: a.attemptNumber,
          score: a.score || 0,
          totalQuestions: a.totalQuestions || 0,
          correctAnswers: a.correctAnswers || 0,
          timeSpent: a.timeSpent || 0,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
          passed: a.passed || false,
        })),
        bestScore: cp.bestScore || 0,
      });
    });

    // Aggregate stats
    const totalStudents = rows.length;
    const averageScore =
      (contentItem.type === 'quiz' || contentItem.type === 'homework') &&
      totalStudents > 0
        ? Math.round(
            rows.reduce((sum, r) => sum + (r.bestScore || 0), 0) / totalStudents
          )
        : null;
    const totalAttempts = rows.reduce(
      (sum, r) => sum + (r.attempts?.length || 0),
      0
    );
    const passRate =
      (contentItem.type === 'quiz' || contentItem.type === 'homework') &&
      totalStudents > 0
        ? (() => {
            const takers = rows.filter((r) => (r.attempts?.length || 0) > 0);
            const passed = takers.filter((r) =>
              (r.attempts || []).some((a) => a.passed)
            ).length;
            return takers.length > 0
              ? Math.round((passed / takers.length) * 100)
              : 0;
          })()
        : null;

    return res.json({
      success: true,
      content: {
        id: contentItem._id,
        title: contentItem.title,
        type: contentItem.type,
      },
      stats: { totalStudents, averageScore, totalAttempts, passRate },
      students: rows,
    });
  } catch (error) {
    console.error('Error fetching content student stats:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// API: Reset attempts for a student on a specific content
const resetContentAttempts = async (req, res) => {
  try {
    const { courseCode, topicId, contentId, studentId } = req.params;
    const course = await Course.findOne({ courseCode }).select('_id');
    if (!course)
      return res
        .status(404)
        .json({ success: false, message: 'Course not found' });

    const student = await User.findById(studentId);
    if (!student)
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });

    await student.resetContentAttempts(course._id, contentId);

    return res.json({ success: true, message: 'Attempts reset successfully' });
  } catch (error) {
    console.error('Error resetting content attempts:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get content details page
const getContentDetailsPage = async (req, res) => {
  try {
    const { courseCode, topicId, contentId } = req.params;

    const course = await Course.findOne({ courseCode })
      .populate('bundle', 'title bundleCode year')
      .populate({
        path: 'topics',
        populate: {
          path: 'content',
        },
      });

    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect('/admin/courses');
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      req.flash('error_msg', 'Topic not found');
      return res.redirect(`/admin/courses/${courseCode}/content`);
    }

    // Find the specific content item
    const contentItem = topic.content.id(contentId);
    if (!contentItem) {
      req.flash('error_msg', 'Content item not found');
      return res.redirect(`/admin/courses/${courseCode}/content`);
    }

    // Get prerequisite content details
    let prerequisiteContent = null;
    if (contentItem.prerequisites && contentItem.prerequisites.length > 0) {
      const prereqId = contentItem.prerequisites[0];
      // Find prerequisite in all course content
      for (const t of course.topics) {
        if (t.content && t.content.length > 0) {
          const prereq = t.content.find(
            (c) => c._id.toString() === prereqId.toString()
          );
          if (prereq) {
            prerequisiteContent = {
              title: prereq.title,
              type: prereq.type,
              topicTitle: t.title,
              topicOrder: t.order,
            };
            break;
          }
        }
      }
    }

    // Get real student progress data from database
    const enrolledStudents = await User.find({
      'enrolledCourses.course': course._id,
      isActive: true,
    }).select(
      'firstName lastName studentEmail studentCode parentNumber parentCountryCode studentNumber studentCountryCode enrolledCourses'
    );

    const studentProgress = [];

    for (const student of enrolledStudents) {
      const enrollment = student.enrolledCourses.find(
        (e) => e.course && e.course.toString() === course._id.toString()
      );

      if (!enrollment) continue;

      // Find content progress for this specific content
      const contentProgress = enrollment.contentProgress.find(
        (cp) => cp.contentId.toString() === contentId
      );

      let progressData = {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.studentEmail,
        studentCode: student.studentCode,
        parentPhone: `${student.parentCountryCode}${student.parentNumber}`,
        studentPhone: `${student.studentCountryCode}${student.studentNumber}`,
        enrolledDate: enrollment.enrolledAt
          ? enrollment.enrolledAt.toISOString().split('T')[0]
          : 'N/A',
        lastAccessed: contentProgress
          ? contentProgress.lastAccessed.toISOString().split('T')[0]
          : 'Never',
        status: contentProgress
          ? contentProgress.completionStatus
          : 'not_started',
        progress: contentProgress ? contentProgress.progressPercentage : 0,
        timeSpent: contentProgress
          ? Math.round(contentProgress.timeSpent || 0)
          : 0,
        attempts: contentProgress ? contentProgress.attempts : 0,
        grade: null,
        passed: null,
        bestScore: contentProgress ? contentProgress.bestScore : null,
        totalPoints: contentProgress ? contentProgress.totalPoints : 0,
        quizAttempts: contentProgress ? contentProgress.quizAttempts : [],
      };

      // For quiz/homework content, get detailed attempt data
      if (contentItem.type === 'quiz' || contentItem.type === 'homework') {
        if (
          contentProgress &&
          contentProgress.quizAttempts &&
          contentProgress.quizAttempts.length > 0
        ) {
          const latestAttempt =
            contentProgress.quizAttempts[
              contentProgress.quizAttempts.length - 1
            ];
          progressData.grade = latestAttempt.score;
          progressData.passed = latestAttempt.passed;
          progressData.attempts = contentProgress.quizAttempts.length;
        }
      }

      studentProgress.push(progressData);
    }

    // Sort students by performance for ranking
    if (contentItem.type === 'quiz' || contentItem.type === 'homework') {
      studentProgress.sort((a, b) => {
        // First sort by completion status (completed first)
        if (a.status === 'completed' && b.status !== 'completed') return -1;
        if (b.status === 'completed' && a.status !== 'completed') return 1;

        // Then by best score (highest first)
        if (a.bestScore !== null && b.bestScore !== null) {
          return b.bestScore - a.bestScore;
        }
        if (a.bestScore !== null && b.bestScore === null) return -1;
        if (b.bestScore !== null && a.bestScore === null) return 1;

        // Then by progress percentage
        return b.progress - a.progress;
      });
    } else {
      // For non-quiz content, sort by progress and completion
      studentProgress.sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return -1;
        if (b.status === 'completed' && a.status !== 'completed') return 1;
        return b.progress - a.progress;
      });
    }

    // Calculate analytics from real data
    const totalStudents = studentProgress.length;
    const viewedStudents = studentProgress.filter((s) => s.progress > 0).length;
    const completedStudents = studentProgress.filter(
      (s) => s.status === 'completed'
    ).length;
    const failedStudents = studentProgress.filter(
      (s) => s.status === 'failed'
    ).length;
    const inProgressStudents = studentProgress.filter(
      (s) => s.status === 'in_progress'
    ).length;
    const notStartedStudents = studentProgress.filter(
      (s) => s.status === 'not_started'
    ).length;

    // Calculate quiz-specific analytics
    let averageGrade = null;
    let passRate = null;
    let averageScore = null;
    let highestScore = null;
    let lowestScore = null;

    if (contentItem.type === 'quiz' || contentItem.type === 'homework') {
      const studentsWithGrades = studentProgress.filter(
        (s) => s.grade !== null && s.grade !== undefined
      );
      const studentsWithBestScores = studentProgress.filter(
        (s) => s.bestScore !== null && s.bestScore !== undefined
      );

      if (studentsWithGrades.length > 0) {
        averageGrade = Math.round(
          studentsWithGrades.reduce((sum, s) => sum + s.grade, 0) /
            studentsWithGrades.length
        );
        passRate = Math.round(
          (studentsWithGrades.filter((s) => s.passed === true).length /
            studentsWithGrades.length) *
            100
        );
      }

      if (studentsWithBestScores.length > 0) {
        const scores = studentsWithBestScores.map((s) => s.bestScore);
        averageScore = Math.round(
          scores.reduce((sum, score) => sum + score, 0) / scores.length
        );
        highestScore = Math.max(...scores);
        lowestScore = Math.min(...scores);
      }
    }

    const analytics = {
      totalStudents,
      viewedStudents,
      completedStudents,
      failedStudents,
      inProgressStudents,
      notStartedStudents,
      completionRate:
        totalStudents > 0
          ? Math.round((completedStudents / totalStudents) * 100)
          : 0,
      averageGrade,
      passRate,
      averageScore,
      highestScore,
      lowestScore,
      averageTimeSpent:
        totalStudents > 0
          ? Math.round(
              studentProgress.reduce((sum, s) => sum + s.timeSpent, 0) /
                totalStudents
            )
          : 0,
      totalAttempts: studentProgress.reduce((sum, s) => sum + s.attempts, 0),
      totalPoints: studentProgress.reduce((sum, s) => sum + s.totalPoints, 0),
    };

    // Get Zoom meeting data if this is a Zoom meeting content
    let zoomMeetingData = null;
    if (contentItem.type === 'zoom' && contentItem.zoomMeeting) {
      try {
        zoomMeetingData = await ZoomMeeting.findById(
          contentItem.zoomMeeting
        ).populate(
          'studentsAttended.student',
          'firstName lastName studentEmail studentCode'
        );

        if (zoomMeetingData) {
          console.log(
            '📊 Found Zoom meeting data for content:',
            zoomMeetingData.meetingName
          );

          // Calculate additional meeting statistics
          const meetingStats = {
            totalJoinEvents: 0,
            averageSessionDuration: 0,
            cameraOnPercentage: 0,
            micOnPercentage: 0,
            attendanceDistribution: {
              excellent: 0, // >80%
              good: 0, // 60-80%
              fair: 0, // 40-60%
              poor: 0, // <40%
            },
          };

          let totalStatusChanges = 0;
          let cameraOnCount = 0;
          let micOnCount = 0;

          zoomMeetingData.studentsAttended.forEach((student) => {
            meetingStats.totalJoinEvents += student.joinEvents.length;

            // Analyze attendance percentage
            if (student.attendancePercentage >= 80) {
              meetingStats.attendanceDistribution.excellent++;
            } else if (student.attendancePercentage >= 60) {
              meetingStats.attendanceDistribution.good++;
            } else if (student.attendancePercentage >= 40) {
              meetingStats.attendanceDistribution.fair++;
            } else {
              meetingStats.attendanceDistribution.poor++;
            }

            // Analyze camera/mic usage
            student.joinEvents.forEach((joinEvent) => {
              if (joinEvent.statusTimeline) {
                totalStatusChanges += joinEvent.statusTimeline.length;
                joinEvent.statusTimeline.forEach((status) => {
                  if (status.cameraStatus === 'on') cameraOnCount++;
                  if (status.micStatus === 'on') micOnCount++;
                });
              }
            });
          });

          if (totalStatusChanges > 0) {
            meetingStats.cameraOnPercentage = Math.round(
              (cameraOnCount / totalStatusChanges) * 100
            );
            meetingStats.micOnPercentage = Math.round(
              (micOnCount / totalStatusChanges) * 100
            );
          }

          if (zoomMeetingData.studentsAttended.length > 0) {
            meetingStats.averageSessionDuration = Math.round(
              zoomMeetingData.studentsAttended.reduce(
                (sum, student) => sum + (student.totalTimeSpent || 0),
                0
              ) / zoomMeetingData.studentsAttended.length
            );
          }

          zoomMeetingData.meetingStats = meetingStats;
        }
      } catch (zoomError) {
        console.error('Error fetching Zoom meeting data:', zoomError);
      }
    }

    return res.render('admin/content-details', {
      title: `Content Details: ${contentItem.title} | ELKABLY`,
      courseCode,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      course,
      topic,
      contentItem,
      prerequisiteContent,
      studentProgress,
      analytics,
      zoomMeetingData,
      additionalCSS: ['/css/zoom-analytics.css'],
    });
  } catch (error) {
    console.error('Error fetching content details:', error);
    req.flash('error_msg', 'Error loading content details');
    res.redirect('/admin/courses');
  }
};

// Reorder topics
const reorderTopics = async (req, res) => {
  try {
    const { courseCode } = req.params;
    const { orderUpdates } = req.body;

    if (!orderUpdates || !Array.isArray(orderUpdates)) {
      return res.status(400).json({ error: 'Invalid order updates' });
    }

    // Update each topic's order
    const updatePromises = orderUpdates.map((update) =>
      Topic.findByIdAndUpdate(update.topicId, { order: update.order })
    );

    await Promise.all(updatePromises);

    res.json({ success: true, message: 'Topic order updated successfully' });
  } catch (error) {
    console.error('Error reordering topics:', error);
    res.status(500).json({ error: 'Error updating topic order' });
  }
};

// Delete topic
const deleteTopic = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    // Remove topic from course
    await Course.findByIdAndUpdate(topic.course, {
      $pull: { topics: topicId },
    });

    // Delete the topic
    await Topic.findByIdAndDelete(topicId);

    return res.status(200).json({
      success: true,
      message: 'Topic deleted successfully!',
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting topic',
    });
  }
};

// Add content to topic
const addTopicContent = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;
    const {
      type,
      title,
      description,
      content,
      duration,
      isRequired,
      order,
      prerequisites,
      difficulty,
      tags,
      // Quiz specific fields
      quizDuration,
      quizPassingScore,
      quizMaxAttempts,
      quizShuffleQuestions,
      quizShuffleOptions,
      quizShowCorrectAnswers,
      quizShowResults,
      quizInstructions,
      questionBank,
      selectedQuestions,
      // Homework specific fields
      homeworkPassingScore,
      homeworkMaxAttempts,
      homeworkShuffleQuestions,
      homeworkShuffleOptions,
      homeworkShowCorrectAnswers,
      homeworkInstructions,
      // Zoom specific fields
      zoomMeeting,
    } = req.body;

    const topic = await Topic.findById(topicId);
    if (!topic) {
      req.flash('error_msg', 'Topic not found');
      return res.redirect(`/admin/courses/${courseCode}/content`);
    }

    // Get the next order number for content
    const contentCount = topic.content ? topic.content.length : 0;

    // Process prerequisites for content (single prerequisite)
    const prerequisiteId =
      prerequisites && prerequisites.trim() ? prerequisites.trim() : null;

    // Process tags
    const contentTags = tags
      ? (Array.isArray(tags) ? tags : [tags]).filter((tag) => tag.trim())
      : [];

    let contentItem = {
      type,
      title: title.trim(),
      description: description ? description.trim() : '',
      content:
        type === 'quiz' || type === 'homework'
          ? ''
          : content
          ? content.trim()
          : '',
      duration: duration && !isNaN(parseInt(duration)) ? parseInt(duration) : 0,
      isRequired: isRequired === 'on',
      order: order && !isNaN(parseInt(order)) ? parseInt(order) : contentCount + 1,
      prerequisites: prerequisiteId ? [prerequisiteId] : [],
      difficulty: difficulty || 'beginner',
      tags: contentTags,
    };

    // Handle Quiz content
    if (type === 'quiz') {
      if (!questionBank || !selectedQuestions) {
        req.flash(
          'error_msg',
          'Question bank and selected questions are required for quiz content'
        );
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      const questionBankDoc = await QuestionBank.findById(questionBank);
      if (!questionBankDoc) {
        req.flash('error_msg', 'Question bank not found');
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      // Parse selected questions
      let selectedQuestionsArray = [];
      if (typeof selectedQuestions === 'string') {
        selectedQuestionsArray = selectedQuestions
          .split(',')
          .map((q) => q.trim())
          .filter((q) => q);
      } else if (Array.isArray(selectedQuestions)) {
        selectedQuestionsArray = selectedQuestions.filter((q) => q);
      }

      if (selectedQuestionsArray.length === 0) {
        req.flash(
          'error_msg',
          'Please select at least one question for the quiz'
        );
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      // Add quiz-specific fields to contentItem
      contentItem.questionBank = questionBank;
      contentItem.selectedQuestions = selectedQuestionsArray.map(
        (questionId, index) => ({
          question: questionId,
          points: 1,
          order: index,
        })
      );
      contentItem.quizSettings = {
        duration: quizDuration && !isNaN(parseInt(quizDuration)) ? parseInt(quizDuration) : 30,
        passingScore: quizPassingScore && !isNaN(parseInt(quizPassingScore)) ? parseInt(quizPassingScore) : 60,
        maxAttempts: quizMaxAttempts && !isNaN(parseInt(quizMaxAttempts)) ? parseInt(quizMaxAttempts) : 3,
        shuffleQuestions: quizShuffleQuestions === 'on',
        shuffleOptions: quizShuffleOptions === 'on',
        showCorrectAnswers: quizShowCorrectAnswers === 'on',
        showResults: quizShowResults === 'on',
        instructions: quizInstructions ? quizInstructions.trim() : '',
      };
      contentItem.duration = quizDuration && !isNaN(parseInt(quizDuration)) ? parseInt(quizDuration) : 30;
      contentItem.completionCriteria = 'pass_quiz';
    }

    // Handle Homework content
    if (type === 'homework') {
      if (!questionBank || !selectedQuestions) {
        req.flash(
          'error_msg',
          'Question bank and selected questions are required for homework content'
        );
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      const questionBankDoc = await QuestionBank.findById(questionBank);
      if (!questionBankDoc) {
        req.flash('error_msg', 'Question bank not found');
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      // Parse selected questions
      let selectedQuestionsArray = [];
      if (typeof selectedQuestions === 'string') {
        selectedQuestionsArray = selectedQuestions
          .split(',')
          .map((q) => q.trim())
          .filter((q) => q);
      } else if (Array.isArray(selectedQuestions)) {
        selectedQuestionsArray = selectedQuestions.filter((q) => q);
      }

      if (selectedQuestionsArray.length === 0) {
        req.flash(
          'error_msg',
          'Please select at least one question for the homework'
        );
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      // Add homework-specific fields to contentItem
      contentItem.questionBank = questionBank;
      contentItem.selectedQuestions = selectedQuestionsArray.map(
        (questionId, index) => ({
          question: questionId,
          points: 1,
          order: index,
        })
      );
      contentItem.homeworkSettings = {
        passingCriteria: 'pass',
        passingScore: homeworkPassingScore && !isNaN(parseInt(homeworkPassingScore))
          ? parseInt(homeworkPassingScore)
          : 60,
        maxAttempts: homeworkMaxAttempts && !isNaN(parseInt(homeworkMaxAttempts)) ? parseInt(homeworkMaxAttempts) : 1,
        shuffleQuestions: homeworkShuffleQuestions === 'on',
        shuffleOptions: homeworkShuffleOptions === 'on',
        showCorrectAnswers: homeworkShowCorrectAnswers === 'on',
        instructions: homeworkInstructions ? homeworkInstructions.trim() : '',
      };
      contentItem.duration = 0; // No duration for homework
      contentItem.completionCriteria = 'pass_quiz';
    }

    // Handle Zoom content
    if (type === 'zoom') {
      if (!zoomMeeting) {
        req.flash('error_msg', 'Zoom meeting ID is required for zoom content');
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      // Verify the zoom meeting exists
      const zoomMeetingDoc = await ZoomMeeting.findById(zoomMeeting);
      if (!zoomMeetingDoc) {
        req.flash('error_msg', 'Zoom meeting not found');
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      // Add zoom-specific fields to contentItem
      contentItem.zoomMeeting = zoomMeeting;
      contentItem.content = ''; // No content URL for zoom
      contentItem.completionCriteria = 'attendance';
    }

    if (!topic.content) {
      topic.content = [];
    }

    topic.content.push(contentItem);
    await topic.save();

    req.flash('success_msg', 'Content added successfully!');
    res.redirect(`/admin/courses/${courseCode}/content`);
  } catch (error) {
    console.error('Error adding content:', error);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      req.flash(
        'error_msg',
        `Validation Error: ${validationErrors.join(', ')}`
      );
    } else {
      req.flash('error_msg', 'Error adding content');
    }

    res.redirect(`/admin/courses/${req.params.courseCode}/content`);
  }
};

// Update content item
const updateTopicContent = async (req, res) => {
  try {
    const { courseCode, topicId, contentId } = req.params;
    const {
      type,
      title,
      description,
      content,
      duration,
      isRequired,
      order,
      difficulty,
      tags,
      prerequisites,
      quizData,
      homeworkData,
      zoomMeetingName,
      zoomMeetingTopic,
      scheduledStartTime,
      timezone,
      password,
      joinBeforeHost,
      waitingRoom,
      hostVideo,
      participantVideo,
      muteUponEntry,
      enableRecording,
    } = req.body;

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    const contentItem = topic.content.id(contentId);
    if (!contentItem) {
      return res.status(404).json({
        success: false,
        message: 'Content item not found',
      });
    }

    // Update basic content properties
    contentItem.type = type;
    contentItem.title = title.trim();
    contentItem.description = description ? description.trim() : '';
    contentItem.content = content.trim();
    contentItem.duration = duration ? parseInt(duration) : 0;
    contentItem.isRequired = isRequired === 'on' || isRequired === true;
    contentItem.difficulty = difficulty || 'beginner';
    contentItem.order = order ? parseInt(order) : contentItem.order;
    contentItem.tags = tags ? tags.split(',').map((tag) => tag.trim()) : [];
    contentItem.prerequisites = prerequisites || [];

    // Handle content type specific updates
    if (type === 'quiz' && quizData) {
      contentItem.quizSettings = {
        questionBankId: quizData.questionBankId,
        selectedQuestions: quizData.selectedQuestions || [],
        duration: parseInt(quizData.duration) || 30,
        passingScore: parseInt(quizData.passingScore) || 60,
        maxAttempts: parseInt(quizData.maxAttempts) || 3,
        shuffleQuestions: quizData.shuffleQuestions || false,
        shuffleOptions: quizData.shuffleOptions || false,
        showCorrectAnswers: quizData.showCorrectAnswers !== false,
        showResults: quizData.showResults !== false,
        instructions: quizData.instructions || '',
      };
    }

    if (type === 'homework' && homeworkData) {
      contentItem.homeworkSettings = {
        questionBankId: homeworkData.questionBankId,
        selectedQuestions: homeworkData.selectedQuestions || [],
        passingScore: parseInt(homeworkData.passingScore) || 60,
        maxAttempts: parseInt(homeworkData.maxAttempts) || 1,
        shuffleQuestions: homeworkData.shuffleQuestions || false,
        shuffleOptions: homeworkData.shuffleOptions || false,
        showCorrectAnswers: homeworkData.showCorrectAnswers || false,
        instructions: homeworkData.instructions || '',
      };
    }

    if (type === 'zoom') {
      // Update zoom meeting settings
      if (contentItem.zoomMeeting) {
        contentItem.zoomMeeting.meetingName =
          zoomMeetingName || contentItem.zoomMeeting.meetingName;
        contentItem.zoomMeeting.meetingTopic =
          zoomMeetingTopic || contentItem.zoomMeeting.meetingTopic;
        contentItem.zoomMeeting.scheduledStartTime = scheduledStartTime
          ? new Date(scheduledStartTime)
          : contentItem.zoomMeeting.scheduledStartTime;
        contentItem.zoomMeeting.timezone =
          timezone || contentItem.zoomMeeting.timezone;
        contentItem.zoomMeeting.password = password || '';
        contentItem.zoomMeeting.joinBeforeHost = joinBeforeHost !== false;
        contentItem.zoomMeeting.waitingRoom = waitingRoom || false;
        contentItem.zoomMeeting.hostVideo = hostVideo !== false;
        contentItem.zoomMeeting.participantVideo = participantVideo !== false;
        contentItem.zoomMeeting.muteUponEntry = muteUponEntry || false;
        contentItem.zoomMeeting.enableRecording = enableRecording || false;
      }
    }

    await topic.save();

    return res.json({
      success: true,
      message: 'Content updated successfully!',
      content: contentItem,
    });
  } catch (error) {
    console.error('Error updating content:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating content: ' + error.message,
    });
  }
};

// Get content item details for editing
const getContentDetailsForEdit = async (req, res) => {
  try {
    const { courseCode, topicId, contentId } = req.params;

    const topic = await Topic.findById(topicId)
      .populate({
        path: 'content.questionBank',
        select: 'name bankCode description tags totalQuestions',
      })
      .populate({
        path: 'content.selectedQuestions.question',
        select: 'questionText difficulty type correctAnswer points',
      })
      .populate({
        path: 'content.zoomMeeting',
        select:
          'meetingName meetingTopic meetingId scheduledStartTime duration timezone password joinUrl startUrl status settings',
      });

    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    const contentItem = topic.content.id(contentId);
    if (!contentItem) {
      return res.status(404).json({
        success: false,
        message: 'Content item not found',
      });
    }

    // Prepare content data for editing
    const contentData = {
      title: contentItem.title,
      type: contentItem.type,
      description: contentItem.description || '',
      content: contentItem.content || '',
      duration: contentItem.duration || 0,
      order: contentItem.order || 1,
      difficulty: contentItem.difficulty || 'beginner',
      isRequired: contentItem.isRequired !== false,
      tags: contentItem.tags ? contentItem.tags.join(', ') : '',
      prerequisites: contentItem.prerequisites || [],
    };

    // Add Quiz/Homework specific data with populated question bank and questions
    if (contentItem.type === 'quiz' || contentItem.type === 'homework') {
      const settingsKey =
        contentItem.type === 'quiz' ? 'quizSettings' : 'homeworkSettings';
      const settings = contentItem[settingsKey];

      contentData.questionBank = contentItem.questionBank
        ? {
            _id: contentItem.questionBank._id,
            name: contentItem.questionBank.name,
            bankCode: contentItem.questionBank.bankCode,
            description: contentItem.questionBank.description,
            totalQuestions: contentItem.questionBank.totalQuestions,
          }
        : null;

      contentData.selectedQuestions = contentItem.selectedQuestions
        ? contentItem.selectedQuestions.map((sq) => ({
            question: sq.question
              ? {
                  _id: sq.question._id,
                  questionText: sq.question.questionText,
                  difficulty: sq.question.difficulty,
                  type: sq.question.type,
                  correctAnswer: sq.question.correctAnswer,
                  points: sq.question.points || 1,
                }
              : null,
            points: sq.points || 1,
            order: sq.order || 0,
          }))
        : [];

      if (contentItem.type === 'quiz') {
        contentData.quizSettings = {
          duration: settings?.duration || 30,
          passingScore: settings?.passingScore || 60,
          maxAttempts: settings?.maxAttempts || 3,
          shuffleQuestions: settings?.shuffleQuestions || false,
          shuffleOptions: settings?.shuffleOptions || false,
          showCorrectAnswers: settings?.showCorrectAnswers !== false,
          showResults: settings?.showResults !== false,
          instructions: settings?.instructions || '',
        };
      } else {
        contentData.homeworkSettings = {
          passingScore: settings?.passingScore || 60,
          maxAttempts: settings?.maxAttempts || 1,
          shuffleQuestions: settings?.shuffleQuestions || false,
          shuffleOptions: settings?.shuffleOptions || false,
          showCorrectAnswers: settings?.showCorrectAnswers || false,
          instructions: settings?.instructions || '',
        };
      }
    }

    // Add Zoom specific data with populated meeting details
    if (contentItem.type === 'zoom' && contentItem.zoomMeeting) {
      const meeting = contentItem.zoomMeeting;
      contentData.zoomMeeting = {
        _id: meeting._id,
        meetingName: meeting.meetingName || '',
        meetingTopic: meeting.meetingTopic || '',
        meetingId: meeting.meetingId || '',
        scheduledStartTime: meeting.scheduledStartTime || '',
        duration: meeting.duration || 60,
        timezone: meeting.timezone || 'Africa/Cairo',
        password: meeting.password || '',
        joinUrl: meeting.joinUrl || '',
        startUrl: meeting.startUrl || '',
        status: meeting.status || 'scheduled',
        settings: {
          joinBeforeHost: meeting.settings?.joinBeforeHost !== false,
          waitingRoom: meeting.settings?.waitingRoom || false,
          hostVideo: meeting.settings?.hostVideo !== false,
          participantVideo: meeting.settings?.participantVideo !== false,
          muteUponEntry: meeting.settings?.muteUponEntry || false,
          recording: meeting.settings?.recording || false,
        },
      };
    }

    return res.json({
      success: true,
      content: contentData,
    });
  } catch (error) {
    console.error('Error fetching content details:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching content details: ' + error.message,
    });
  }
};

// Delete content item
const deleteTopicContent = async (req, res) => {
  try {
    const { courseCode, topicId, contentId } = req.params;

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    topic.content.pull(contentId);
    await topic.save();

    return res.status(200).json({
      success: true,
      message: 'Content deleted successfully!',
    });
  } catch (error) {
    console.error('Error deleting content:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting content',
    });
  }
};

// ==================== ORDERS MANAGEMENT (ADMIN) ====================

// List all orders with filtering, analytics, and pagination
const getOrders = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      paymentMethod,
      gateway,
      search,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (paymentStatus && paymentStatus !== 'all')
      filter.paymentStatus = paymentStatus;
    if (paymentMethod && paymentMethod !== 'all')
      filter.paymentMethod = paymentMethod;
    if (gateway && gateway !== 'all') filter.paymentGateway = gateway;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'billingAddress.email': { $regex: search, $options: 'i' } },
        { 'billingAddress.firstName': { $regex: search, $options: 'i' } },
        { 'billingAddress.lastName': { $regex: search, $options: 'i' } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, totalOrders, revenueAgg] = await Promise.all([
      Purchase.find(filter)
        .populate('user', 'firstName lastName studentEmail studentCode')
        .populate('items.item')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Purchase.countDocuments(filter),
      Purchase.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' },
            completedRevenue: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$total', 0] },
            },
            refundedAmount: { $sum: { $ifNull: ['$refundAmount', 0] } },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            pending: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
            },
            failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            refunded: {
              $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));
    const revenue = revenueAgg[0] || {
      totalRevenue: 0,
      completedRevenue: 0,
      refundedAmount: 0,
      completed: 0,
      pending: 0,
      failed: 0,
      refunded: 0,
    };

    return res.render('admin/orders', {
      title: 'All Orders | ELKABLY',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      orders,
      analytics: {
        totalOrders,
        ...revenue,
        averageOrderValue:
          totalOrders > 0
            ? Math.round((revenue.totalRevenue / totalOrders) * 100) / 100
            : 0,
      },
      currentFilters: {
        status,
        paymentStatus,
        paymentMethod,
        gateway,
        search,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalOrders,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    req.flash('error_msg', 'Error loading orders');
    return res.redirect('/admin/dashboard');
  }
};

// Order details page
const getOrderDetails = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const order = await Purchase.findOne({ orderNumber })
      .populate(
        'user',
        'firstName lastName studentEmail studentCode grade schoolName createdAt profileImage'
      )
      .populate({
        path: 'items.item',
        select: 'title courseCode bundleCode thumbnail description courses',
      });

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/admin/orders');
    }

    // If we need to populate courses for bundle items, do it separately
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (item.itemType === 'bundle' && item.item) {
          // Populate courses for bundle items
          await Purchase.populate(order, {
            path: 'items.item.courses',
            select: 'title thumbnail',
            model: 'Course',
          });
          break; // Only need to do this once
        }
      }
    }

    // Compute detailed item summaries with thumbnails and codes
    const itemsSummary = order.items.map((it) => {
      // Extract item details
      const itemDetails = it.item || {};

      // Handle thumbnails based on item type
      let thumbnail = null;

      if (it.itemType === 'bundle') {
        // For bundles, use bundle thumbnail first, then first course thumbnail as fallback
        thumbnail = itemDetails.thumbnail;
        if (
          !thumbnail &&
          itemDetails.courses &&
          itemDetails.courses.length > 0
        ) {
          thumbnail = itemDetails.courses[0].thumbnail;
        }
      } else if (it.itemType === 'course') {
        // For courses, use course thumbnail
        thumbnail = itemDetails.thumbnail;
      } else if (it.itemType === 'quiz') {
        // For quizzes, use quiz thumbnail or default
        thumbnail = itemDetails.thumbnail;
      }

      return {
        title: it.title,
        type: it.itemType,
        price: it.price,
        quantity: it.quantity,
        total: it.price * (it.quantity || 1),
        refId: it.item,
        thumbnail: thumbnail,
        courseCode: itemDetails.courseCode || null,
        bundleCode: itemDetails.bundleCode || null,
        description: itemDetails.description || null,
        courses: itemDetails.courses || [],
      };
    });

    // Get customer purchase history count
    const customerPurchaseCount = await Purchase.countDocuments({
      'billingAddress.email': order.billingAddress.email,
    });

    // Get total spent by this customer
    const customerPurchases = await Purchase.find({
      'billingAddress.email': order.billingAddress.email,
      status: { $ne: 'refunded' },
    }).select('total');

    const totalSpent = customerPurchases.reduce(
      (sum, purchase) => sum + purchase.total,
      0
    );

    // Enhanced order summary
    const summary = {
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      currency: order.currency || 'EGP',
      itemCount: order.items.length,
      customerStats: {
        orderCount: customerPurchaseCount,
        totalSpent: totalSpent.toFixed(2),
      },
    };

    return res.render('admin/order-details', {
      title: `Order ${order.orderNumber} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      order,
      itemsSummary,
      summary,
      pageTitle: `Order #${order.orderNumber} Details`,
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    req.flash('error_msg', 'Error loading order details');
    return res.redirect('/admin/orders');
  }
};

// Generate professional invoice for printing
const generateInvoice = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const order = await Purchase.findOne({ orderNumber })
      .populate(
        'user',
        'firstName lastName studentEmail studentCode grade schoolName createdAt profileImage'
      )
      .populate({
        path: 'items.item',
        select: 'title courseCode bundleCode thumbnail description',
        populate: [
          {
            path: 'courses',
            select: 'title thumbnail',
            model: 'Course',
          },
          {
            path: 'bundle',
            select: 'title thumbnail',
            model: 'BundleCourse',
          },
        ],
      })
      .lean();

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/admin/orders');
    }

    // Compute detailed item summaries with thumbnails and codes
    const itemsSummary = order.items.map((it) => {
      const itemDetails = it.item || {};

      // Handle thumbnails based on item type
      let thumbnail = null;

      if (it.itemType === 'bundle') {
        // For bundles, use bundle thumbnail first, then first course thumbnail as fallback
        thumbnail = itemDetails.thumbnail;
        if (
          !thumbnail &&
          itemDetails.courses &&
          itemDetails.courses.length > 0
        ) {
          thumbnail = itemDetails.courses[0].thumbnail;
        }
      } else if (it.itemType === 'course') {
        // For courses, use course thumbnail
        thumbnail = itemDetails.thumbnail;
      } else if (it.itemType === 'quiz') {
        // For quizzes, use quiz thumbnail or default
        thumbnail = itemDetails.thumbnail;
      }

      return {
        title: it.title,
        type: it.itemType,
        price: it.price,
        quantity: it.quantity,
        total: it.price * (it.quantity || 1),
        refId: it.item,
        thumbnail: thumbnail,
        courseCode: itemDetails.courseCode || null,
        bundleCode: itemDetails.bundleCode || null,
        description: itemDetails.description || null,
        courses: itemDetails.courses || [],
        bundle: itemDetails.bundle || null,
      };
    });

    // Enhanced order summary
    const summary = {
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      currency: order.currency || 'EGP',
      itemCount: order.items.length,
    };

    // Company information for invoice
    const companyInfo = {
      name: 'Elkably E-Learning',
      address: '123 Education Street, Learning City, LC 12345',
      phone: '+1 (555) 123-4567',
      email: 'info@elkably.com',
      website: 'www.elkably.com',
      logo: '/images/logo.png',
    };

    return res.render('admin/invoice', {
      title: `Invoice - Order ${order.orderNumber} | ELKABLY`,
      order,
      itemsSummary,
      summary,
      companyInfo,
      pageTitle: `Invoice #${order.orderNumber}`,
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    req.flash('error_msg', 'Error generating invoice');
    return res.redirect('/admin/orders');
  }
};

// Refund an order and revoke access
const refundOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { reason = 'Admin refund', amount } = req.body;

    const purchase = await Purchase.findOne({ orderNumber });
    if (!purchase) {
      return res
        .status(404)
        .json({ success: false, message: 'Order not found' });
    }

    const user = await User.findById(purchase.user).populate(
      'enrolledCourses.course'
    );
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    // Determine refund amount
    const refundAmount = typeof amount === 'number' ? amount : purchase.total;

    // Revoke access for each item
    for (const it of purchase.items) {
      if (it.itemType === 'bundle') {
        // Mark purchased bundle cancelled
        user.purchasedBundles = user.purchasedBundles.map((pb) => {
          if (
            (pb.bundle?.toString() || pb.bundle) === it.item.toString() &&
            pb.status === 'active'
          ) {
            return { ...(pb.toObject?.() || pb), status: 'cancelled' };
          }
          return pb;
        });

        // Remove enrollment for all courses of this bundle
        const bundle = await BundleCourse.findById(it.item).populate('courses');
        if (bundle && bundle.courses && bundle.courses.length) {
          const bundleCourseIds = new Set(
            bundle.courses.map((c) => (c._id || c).toString())
          );
          user.enrolledCourses = user.enrolledCourses.filter(
            (en) =>
              !bundleCourseIds.has((en.course?._id || en.course).toString())
          );
        }
      } else {
        // Course purchase cancel and unenroll
        user.purchasedCourses = user.purchasedCourses.map((pc) => {
          if (
            (pc.course?.toString() || pc.course) === it.item.toString() &&
            pc.status === 'active'
          ) {
            return { ...(pc.toObject?.() || pc), status: 'cancelled' };
          }
          return pc;
        });
        user.enrolledCourses = user.enrolledCourses.filter(
          (en) =>
            (en.course?._id || en.course).toString() !== it.item.toString()
        );
      }
    }

    await user.save();

    // Update purchase to refunded
    purchase.status = 'refunded';
    purchase.paymentStatus = 'refunded';
    purchase.refundedAt = new Date();
    purchase.refundAmount = refundAmount;
    purchase.refundReason = reason;
    await purchase.save();

    // Respond appropriately for AJAX or form
    if (
      req.xhr ||
      req.headers.accept?.indexOf('json') > -1 ||
      req.headers['content-type']?.includes('application/json')
    ) {
      return res.json({
        success: true,
        message: 'Order refunded and access revoked',
        refundAmount,
      });
    }

    req.flash('success_msg', 'Order refunded and access revoked');
    return res.redirect(`/admin/orders/${orderNumber}`);
  } catch (error) {
    console.error('Error processing refund:', error);
    if (
      req.xhr ||
      req.headers.accept?.indexOf('json') > -1 ||
      req.headers['content-type']?.includes('application/json')
    ) {
      return res
        .status(500)
        .json({ success: false, message: 'Failed to process refund' });
    }
    req.flash('error_msg', 'Failed to process refund');
    return res.redirect('/admin/orders');
  }
};

// ==================== QUIZ/HOMEWORK CONTENT CONTROLLERS ====================

// Get question banks for quiz/homework content creation
const getQuestionBanksForContent = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;

    // Verify topic exists
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    // Get all active question banks
    const questionBanks = await QuestionBank.find({ status: 'active' })
      .select('name bankCode description totalQuestions tags')
      .sort({ name: 1 });

    return res.json({
      success: true,
      questionBanks,
    });
  } catch (error) {
    console.error('Error fetching question banks for content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch question banks',
    });
  }
};

// Get questions from a specific question bank for content creation
const getQuestionsFromBankForContent = async (req, res) => {
  try {
    const { courseCode, topicId, bankId } = req.params;
    const {
      page = 1,
      limit = 50,
      difficulty,
      type,
      search,
      all = false,
    } = req.query;

    // Verify topic exists
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    // Build filter
    const filter = { bank: bankId };
    if (difficulty && difficulty !== 'all') filter.difficulty = difficulty;
    if (type && type !== 'all') filter.questionType = type;
    if (search) {
      filter.$or = [
        { questionText: { $regex: search, $options: 'i' } },
        { explanation: { $regex: search, $options: 'i' } },
      ];
    }

    let questions;
    let total;

    if (all === 'true') {
      // Get all questions for the bank
      questions = await Question.find(filter)
        .select(
          'questionText questionType difficulty options correctAnswers explanation questionImage points tags'
        )
        .sort({ createdAt: -1 });
      total = questions.length;
    } else {
      // Get paginated questions
      const skip = (parseInt(page) - 1) * parseInt(limit);
      questions = await Question.find(filter)
        .select(
          'questionText questionType difficulty options correctAnswers explanation questionImage points tags'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      total = await Question.countDocuments(filter);
    }

    const totalPages = Math.ceil(total / parseInt(limit));

    return res.json({
      success: true,
      questions,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching questions for content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch questions',
    });
  }
};

// Get question preview for content creation
const getQuestionPreviewForContent = async (req, res) => {
  try {
    const { courseCode, topicId, questionId } = req.params;

    // Verify topic exists
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    const question = await Question.findById(questionId)
      .populate('bank', 'name bankCode')
      .lean();

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found',
      });
    }

    return res.json({
      success: true,
      question,
    });
  } catch (error) {
    console.error('Error fetching question preview for content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch question preview',
    });
  }
};

// Add quiz content to topic
const addQuizContent = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;
    const {
      title,
      description,
      questionBank,
      selectedQuestions,
      duration,
      passingScore,
      maxAttempts,
      shuffleQuestions,
      shuffleOptions,
      showCorrectAnswers,
      showResults,
      instructions,
      difficulty,
      tags,
      isRequired,
      order,
    } = req.body;

    console.log('Adding quiz content:', {
      title,
      questionBank,
      selectedQuestions,
    });

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    // Validate question bank exists
    const bank = await QuestionBank.findById(questionBank);
    if (!bank) {
      return res.status(400).json({
        success: false,
        message: 'Question bank not found',
      });
    }

    // Parse selected questions
    let parsedQuestions = [];
    if (selectedQuestions) {
      try {
        parsedQuestions =
          typeof selectedQuestions === 'string'
            ? JSON.parse(selectedQuestions)
            : selectedQuestions;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid selected questions format',
        });
      }
    }

    if (!parsedQuestions || parsedQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one question must be selected',
      });
    }

    // Validate that selected questions exist in the question bank
    const questionIds = parsedQuestions.map((q) => q.question);
    const existingQuestions = await Question.find({
      _id: { $in: questionIds },
      bank: questionBank,
    });

    if (existingQuestions.length !== questionIds.length) {
      return res.status(400).json({
        success: false,
        message:
          'Some selected questions do not exist in the chosen question bank',
      });
    }

    // Get the next order number for content
    const contentCount = topic.content ? topic.content.length : 0;

    // Process tags
    const contentTags = tags
      ? (Array.isArray(tags) ? tags : [tags]).filter((tag) => tag.trim())
      : [];

    const quizContent = {
      type: 'quiz',
      title: title.trim(),
      description: description ? description.trim() : '',
      questionBank,
      selectedQuestions: parsedQuestions.map((q, index) => ({
        question: q.question,
        points: q.points || 1,
        order: index + 1,
      })),
      quizSettings: {
        duration: parseInt(duration) || 30,
        passingScore: parseInt(passingScore) || 60,
        maxAttempts: parseInt(maxAttempts) || 3,
        shuffleQuestions:
          shuffleQuestions === 'on' || shuffleQuestions === true,
        shuffleOptions: shuffleOptions === 'on' || shuffleOptions === true,
        showCorrectAnswers:
          showCorrectAnswers === 'on' || showCorrectAnswers === true,
        showResults: showResults === 'on' || showResults === true,
        instructions: instructions || '',
      },
      duration: parseInt(duration) || 30,
      isRequired: isRequired === 'on' || isRequired === true,
      order: order ? parseInt(order) : contentCount + 1,
      difficulty: difficulty || 'beginner',
      tags: contentTags,
    };

    if (!topic.content) {
      topic.content = [];
    }

    topic.content.push(quizContent);
    await topic.save();

    return res.json({
      success: true,
      message: 'Quiz content added successfully',
      contentId: topic.content[topic.content.length - 1]._id,
    });
  } catch (error) {
    console.error('Error adding quiz content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add quiz content',
    });
  }
};

// Add homework content to topic
const addHomeworkContent = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;
    const {
      title,
      description,
      questionBank,
      selectedQuestions,
      passingScore,
      maxAttempts,
      shuffleQuestions,
      shuffleOptions,
      showCorrectAnswers,
      instructions,
      difficulty,
      tags,
      isRequired,
      order,
    } = req.body;

    console.log('Adding homework content:', {
      title,
      questionBank,
      selectedQuestions,
    });

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found',
      });
    }

    // Validate question bank exists
    const bank = await QuestionBank.findById(questionBank);
    if (!bank) {
      return res.status(400).json({
        success: false,
        message: 'Question bank not found',
      });
    }

    // Parse selected questions
    let parsedQuestions = [];
    if (selectedQuestions) {
      try {
        parsedQuestions =
          typeof selectedQuestions === 'string'
            ? JSON.parse(selectedQuestions)
            : selectedQuestions;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Invalid selected questions format',
        });
      }
    }

    if (!parsedQuestions || parsedQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one question must be selected',
      });
    }

    // Validate that selected questions exist in the question bank
    const questionIds = parsedQuestions.map((q) => q.question);
    const existingQuestions = await Question.find({
      _id: { $in: questionIds },
      bank: questionBank,
    });

    if (existingQuestions.length !== questionIds.length) {
      return res.status(400).json({
        success: false,
        message:
          'Some selected questions do not exist in the chosen question bank',
      });
    }

    // Get the next order number for content
    const contentCount = topic.content ? topic.content.length : 0;

    // Process tags
    const contentTags = tags
      ? (Array.isArray(tags) ? tags : [tags]).filter((tag) => tag.trim())
      : [];

    const homeworkContent = {
      type: 'homework',
      title: title.trim(),
      description: description ? description.trim() : '',
      questionBank,
      selectedQuestions: parsedQuestions.map((q, index) => ({
        question: q.question,
        points: q.points || 1,
        order: index + 1,
      })),
      homeworkSettings: {
        passingCriteria: 'pass',
        passingScore: parseInt(passingScore) || 60,
        maxAttempts: parseInt(maxAttempts) || 1,
        shuffleQuestions:
          shuffleQuestions === 'on' || shuffleQuestions === true,
        shuffleOptions: shuffleOptions === 'on' || shuffleOptions === true,
        showCorrectAnswers:
          showCorrectAnswers === 'on' || showCorrectAnswers === true,
        instructions: instructions || '',
      },
      duration: 0, // No time limit for homework
      isRequired: isRequired === 'on' || isRequired === true,
      order: order ? parseInt(order) : contentCount + 1,
      difficulty: difficulty || 'beginner',
      tags: contentTags,
    };

    if (!topic.content) {
      topic.content = [];
    }

    topic.content.push(homeworkContent);
    await topic.save();

    return res.json({
      success: true,
      message: 'Homework content added successfully',
      contentId: topic.content[topic.content.length - 1]._id,
    });
  } catch (error) {
    console.error('Error adding homework content:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add homework content',
    });
  }
};

// Bundle Course Management
const getBundles = async (req, res) => {
  try {
    const { status, subject, search, page = 1, limit = 12 } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (subject) filter.subject = subject;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bundles = await BundleCourse.find(filter)
      .populate('courses')
      .populate('createdBy', 'userName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalBundles = await BundleCourse.countDocuments(filter);
    const totalPages = Math.ceil(totalBundles / parseInt(limit));

    const stats = await getBundleStats();
    const filterOptions = await getFilterOptions();

    return res.render('admin/bundles', {
      title: 'Bundle Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      bundles,
      stats,
      filterOptions,
      currentFilters: { status, subject, search },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBundles,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching bundles:', error);
    req.flash('error_msg', 'Error loading bundles');
    res.redirect('/admin/dashboard');
  }
};

// Create bundle
const createBundle = async (req, res) => {
  try {
    const {
      title,
      description,
      shortDescription,
      subject,
      testType,
      courseType,
      price,
      discountPrice,
      status = 'draft',
      thumbnail,
    } = req.body;

    console.log('Creating bundle with data:', {
      title,
      thumbnail,
      subject,
    });

    const bundle = new BundleCourse({
      title: title.trim(),
      description: description ? description.trim() : '',
      shortDescription: shortDescription ? shortDescription.trim() : '',
      subject,
      testType,
      courseType,
      price: parseFloat(price),
      discountPrice: discountPrice ? parseFloat(discountPrice) : null,
      status,
      createdBy: req.session.user.id,
      courses: [], // Start with empty courses array
      thumbnail: thumbnail || '',
    });

    console.log('Bundle object before save:', {
      title: bundle.title,
      thumbnail: bundle.thumbnail,
    });

    await bundle.save();

    console.log('Bundle saved successfully with ID:', bundle._id);

    req.flash(
      'success_msg',
      'Bundle created successfully! You can now add courses to it.'
    );
    res.redirect(`/admin/bundles/${bundle.bundleCode}/manage`);
  } catch (error) {
    console.error('Error creating bundle:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      req.flash(
        'error_msg',
        `Validation Error: ${validationErrors.join(', ')}`
      );
    } else {
      req.flash('error_msg', 'Error creating bundle');
    }

    res.redirect('/admin/bundles');
  }
};

// Get bundle management page
const getBundleManage = async (req, res) => {
  try {
    const { bundleCode } = req.params;

    const bundle = await BundleCourse.findOne({ bundleCode })
      .populate('courses')
      .populate('createdBy', 'userName');

    if (!bundle) {
      req.flash('error_msg', 'Bundle not found');
      return res.redirect('/admin/bundles');
    }

    // Get available courses (no year filter)
    const availableCourses = await Course.find({
      status: 'published',
    }).sort({ title: 1 });

    return res.render('admin/bundle-manage', {
      title: `Manage Bundle: ${bundle.title} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      bundle,
      availableCourses,
    });
  } catch (error) {
    console.error('Error fetching bundle management:', error);
    req.flash('error_msg', 'Error loading bundle management');
    res.redirect('/admin/bundles');
  }
};

// Add course to bundle
const addCourseToBundle = async (req, res) => {
  try {
    const { bundleCode, courseId } = req.params;

    const bundle = await BundleCourse.findOne({ bundleCode });
    if (!bundle) {
      req.flash('error_msg', 'Bundle not found');
      return res.redirect('/admin/bundles');
    }

    const course = await Course.findById(courseId);
    if (!course) {
      req.flash('error_msg', 'Course not found');
      return res.redirect(`/admin/bundles/${bundleCode}/manage`);
    }

    // Check if course is already in bundle
    if (bundle.courses.includes(courseId)) {
      req.flash('error_msg', 'Course is already in this bundle');
      return res.redirect(`/admin/bundles/${bundleCode}/manage`);
    }

    // Add course to bundle
    bundle.courses.push(courseId);
    await bundle.save();

    req.flash('success_msg', 'Course added to bundle successfully!');
    res.redirect(`/admin/bundles/${bundleCode}/manage`);
  } catch (error) {
    console.error('Error adding course to bundle:', error);
    req.flash('error_msg', 'Error adding course to bundle');
    res.redirect(`/admin/bundles/${req.params.bundleCode}/manage`);
  }
};

// Remove course from bundle
const removeCourseFromBundle = async (req, res) => {
  try {
    const { bundleCode, courseId } = req.params;

    const bundle = await BundleCourse.findOne({ bundleCode });
    if (!bundle) {
      req.flash('error_msg', 'Bundle not found');
      return res.redirect('/admin/bundles');
    }

    // Remove course from bundle
    bundle.courses = bundle.courses.filter((id) => id.toString() !== courseId);
    await bundle.save();

    req.flash('success_msg', 'Course removed from bundle successfully!');
    res.redirect(`/admin/bundles/${bundleCode}/manage`);
  } catch (error) {
    console.error('Error removing course from bundle:', error);
    req.flash('error_msg', 'Error removing course from bundle');
    res.redirect(`/admin/bundles/${req.params.bundleCode}/manage`);
  }
};

// Create course for bundle
const createCourseForBundle = async (req, res) => {
  try {
    const { bundleCode } = req.params;
    const {
      title,
      description,
      shortDescription,
      level,
      courseType,
      subject,
      category,
      duration,
      price = 0,
      status = 'draft',
    } = req.body;

    const bundle = await BundleCourse.findOne({ bundleCode });
    if (!bundle) {
      req.flash('error_msg', 'Bundle not found');
      return res.redirect('/admin/bundles');
    }

    // Create new course without year coupling
    const course = new Course({
      title: title.trim(),
      description: description ? description.trim() : '',
      shortDescription: shortDescription ? shortDescription.trim() : '',
      level,
      courseType,
      subject,
      category: category.trim(),
      duration: parseInt(duration),
      price: parseFloat(price),
      status,
      createdBy: req.session.user.id,
      bundle: bundle._id,
    });

    await course.save();

    // Add course to bundle
    bundle.courses.push(course._id);
    await bundle.save();

    req.flash(
      'success_msg',
      'Course created and added to bundle successfully!'
    );
    res.redirect(`/admin/bundles/${bundleCode}/manage`);
  } catch (error) {
    console.error('Error creating course for bundle:', error);
    req.flash('error_msg', 'Error creating course');
    res.redirect(`/admin/bundles/${req.params.bundleCode}/manage`);
  }
};

// API Routes
const getBundlesAPI = async (req, res) => {
  try {
    const bundles = await BundleCourse.find({ status: { $ne: 'archived' } })
      .select('_id title bundleCode')
      .sort({ title: 1 });

    res.json(bundles);
  } catch (error) {
    console.error('Error fetching bundles API:', error);
    res.status(500).json({ error: 'Failed to fetch bundles' });
  }
};

// Helper functions
const getCourseStats = async () => {
  const totalCourses = await Course.countDocuments();
  const publishedCourses = await Course.countDocuments({ status: 'published' });
  const draftCourses = await Course.countDocuments({ status: 'draft' });
  const archivedCourses = await Course.countDocuments({ status: 'archived' });

  const totalEnrollments = await Course.aggregate([
    { $group: { _id: null, total: { $sum: '$enrolledStudents' } } },
  ]);

  return {
    totalCourses,
    publishedCourses,
    draftCourses,
    archivedCourses,
    totalEnrollments: totalEnrollments[0]?.total || 0,
  };
};

const getBundleStats = async () => {
  const totalBundles = await BundleCourse.countDocuments();
  const publishedBundles = await BundleCourse.countDocuments({
    status: 'published',
  });
  const draftBundles = await BundleCourse.countDocuments({ status: 'draft' });

  // Course type statistics
  const onlineBundles = await BundleCourse.countDocuments({
    courseType: 'online',
    status: 'published',
  });
  const ongroundBundles = await BundleCourse.countDocuments({
    courseType: 'onground',
    status: 'published',
  });
  const recordedBundles = await BundleCourse.countDocuments({
    courseType: 'recorded',
    status: 'published',
  });

  const totalEnrollments = await BundleCourse.aggregate([
    { $group: { _id: null, total: { $sum: '$enrolledStudents' } } },
  ]);

  return {
    totalBundles,
    publishedBundles,
    draftBundles,
    onlineBundles,
    ongroundBundles,
    recordedBundles,
    totalEnrollments: totalEnrollments[0]?.total || 0,
  };
};

const getFilterOptions = async () => {
  const years = []; // year removed from Course
  const levels = await Course.distinct('level');
  const bundles = await BundleCourse.find({ status: { $ne: 'archived' } })
    .select('_id title bundleCode')
    .sort({ title: 1 });

  return { years, levels, bundles };
};

// Update bundle
const updateBundle = async (req, res) => {
  try {
    const { bundleCode } = req.params;
    const {
      title,
      description,
      shortDescription,
      courseType,
      testType,
      subject,
      price,
      discountPrice,
      status,
      thumbnail,
    } = req.body;

    // Check if request expects JSON response (AJAX request)
    const isAjaxRequest =
      req.headers['x-requested-with'] === 'XMLHttpRequest' ||
      req.headers['accept']?.includes('application/json');

    const bundle = await BundleCourse.findOne({ bundleCode });
    if (!bundle) {
      if (isAjaxRequest) {
        return res.status(404).json({
          success: false,
          message: 'Bundle not found',
        });
      }
      req.flash('error_msg', 'Bundle not found');
      return res.redirect('/admin/bundles');
    }

    bundle.title = title.trim();
    bundle.description = description ? description.trim() : '';
    bundle.shortDescription = shortDescription ? shortDescription.trim() : '';
    bundle.courseType = courseType;
    bundle.testType = testType;
    bundle.subject = subject.trim();
    bundle.price = parseFloat(price);
    bundle.discountPrice = discountPrice ? parseFloat(discountPrice) : null;
    bundle.status = status;
    if (thumbnail) bundle.thumbnail = thumbnail;

    await bundle.save();

    if (isAjaxRequest) {
      return res.status(200).json({
        success: true,
        message: 'Bundle updated successfully!',
        bundle: bundle,
      });
    }

    req.flash('success_msg', 'Bundle updated successfully!');
    res.redirect(`/admin/bundles/${bundleCode}/manage`);
  } catch (error) {
    console.error('Error updating bundle:', error);

    // Check if request expects JSON response (AJAX request)
    const isAjaxRequest =
      req.headers['x-requested-with'] === 'XMLHttpRequest' ||
      req.headers['accept']?.includes('application/json');

    if (isAjaxRequest) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message
        );
        return res.status(400).json({
          success: false,
          message: `Validation Error: ${validationErrors.join(', ')}`,
          errors: validationErrors,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Error updating bundle. Please try again.',
        });
      }
    }

    // Handle non-AJAX requests (redirects)
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      req.flash(
        'error_msg',
        `Validation Error: ${validationErrors.join(', ')}`
      );
    } else {
      req.flash('error_msg', 'Error updating bundle');
    }

    res.redirect('/admin/bundles');
  }
};

// Delete bundle
const deleteBundle = async (req, res) => {
  try {
    const { bundleCode } = req.params;

    const bundle = await BundleCourse.findOne({ bundleCode });
    if (!bundle) {
      return res.status(404).json({
        success: false,
        message: 'Bundle not found',
      });
    }

    // Remove bundle reference from all courses
    await Course.updateMany({ bundle: bundle._id }, { $unset: { bundle: 1 } });

    // Delete the bundle
    await BundleCourse.findByIdAndDelete(bundle._id);

    return res.status(200).json({
      success: true,
      message: 'Bundle deleted successfully!',
    });
  } catch (error) {
    console.error('Error deleting bundle:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting bundle',
    });
  }
};

// Get bundle students
const getBundleStudents = async (req, res) => {
  try {
    const { bundleCode } = req.params;

    const bundle = await BundleCourse.findOne({ bundleCode }).populate(
      'courses',
      'title courseCode enrolledStudents'
    );

    if (!bundle) {
      req.flash('error_msg', 'Bundle not found');
      return res.redirect('/admin/bundles');
    }

    // Mock student data for now
    const students = [
      {
        id: 1,
        name: 'Ahmed Mohamed',
        email: 'ahmed@example.com',
        enrollmentDate: '2024-01-15',
        progress: 75,
        coursesCompleted: 3,
        totalCourses: bundle.courses.length,
        lastActivity: '2024-01-20',
      },
      {
        id: 2,
        name: 'Sarah Ali',
        email: 'sarah@example.com',
        enrollmentDate: '2024-01-10',
        progress: 90,
        coursesCompleted: 4,
        totalCourses: bundle.courses.length,
        lastActivity: '2024-01-21',
      },
      {
        id: 3,
        name: 'Omar Hassan',
        email: 'omar@example.com',
        enrollmentDate: '2024-01-05',
        progress: 60,
        coursesCompleted: 2,
        totalCourses: bundle.courses.length,
        lastActivity: '2024-01-19',
      },
    ];

    const analytics = {
      totalStudents: students.length,
      activeStudents: students.filter((s) => s.progress > 0).length,
      completedStudents: students.filter((s) => s.progress === 100).length,
      averageProgress: Math.round(
        students.reduce((sum, s) => sum + s.progress, 0) / students.length
      ),
    };

    return res.render('admin/bundle-students', {
      title: `Bundle Students: ${bundle.title} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      bundle,
      students,
      analytics,
    });
  } catch (error) {
    console.error('Error fetching bundle students:', error);
    req.flash('error_msg', 'Error loading bundle students');
    res.redirect('/admin/bundles');
  }
};

// Get Bundle Information - Comprehensive analytics and data
const getBundleInfo = async (req, res) => {
  try {
    const { bundleCode } = req.params;

    // Get bundle with populated data
    const bundle = await BundleCourse.findOne({ bundleCode })
      .populate({
        path: 'courses',
        populate: {
          path: 'topics',
          model: 'Topic',
        },
      })
      .populate('createdBy', 'userName email')
      .populate(
        'enrolledStudents',
        'firstName lastName username studentEmail grade schoolName isActive createdAt'
      );

    if (!bundle) {
      req.flash('error_msg', 'Bundle not found');
      return res.redirect('/admin/bundles');
    }

    // Get students enrolled in this bundle (using enrolledStudents array)
    const studentsWithBundle = await User.find({
      _id: { $in: bundle.enrolledStudents },
    })
      .populate('enrolledCourses.course', 'title courseCode')
      .populate('purchasedBundles.bundle', 'title bundleCode')
      .select(
        'firstName lastName username studentEmail grade schoolName isActive createdAt enrolledCourses purchasedBundles'
      );

    // Also get students who purchased this bundle but might not be in enrolledStudents
    const purchasedStudents = await User.find({
      'purchasedBundles.bundle': bundle._id,
    })
      .populate('enrolledCourses.course', 'title courseCode')
      .populate('purchasedBundles.bundle', 'title bundleCode')
      .select(
        'firstName lastName username studentEmail grade schoolName isActive createdAt enrolledCourses purchasedBundles'
      );

    // Merge both arrays and remove duplicates
    const allStudents = [...studentsWithBundle];
    purchasedStudents.forEach((ps) => {
      if (!allStudents.find((s) => s._id.toString() === ps._id.toString())) {
        allStudents.push(ps);
      }
    });

    // Calculate comprehensive student analytics
    const studentAnalytics = {
      totalStudents: allStudents.length,
      activeStudents: allStudents.filter((student) => student.isActive).length,
      inactiveStudents: allStudents.filter((student) => !student.isActive)
        .length,
      completedStudents: 0, // Will calculate based on course completion
      averageProgress: 0,
      recentEnrollments: allStudents.filter((student) => {
        // Check if student purchased this bundle in last 30 days
        const bundlePurchase = student.purchasedBundles.find(
          (pb) =>
            pb.bundle._id?.toString() === bundle._id.toString() ||
            pb.bundle.toString() === bundle._id.toString()
        );
        if (bundlePurchase) {
          const enrollmentDate = new Date(bundlePurchase.purchasedAt);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          return enrollmentDate >= thirtyDaysAgo;
        }
        return false;
      }).length,
    };

    // Calculate course completion and progress
    let totalProgress = 0;
    let completedCount = 0;

    for (const student of allStudents) {
      let studentCourseProgress = 0;
      let completedCourses = 0;
      let enrolledInBundleCourses = 0;

      for (const course of bundle.courses) {
        // Find student's enrollment in this course
        const enrollment = student.enrolledCourses?.find(
          (e) =>
            e.course?._id?.toString() === course._id.toString() ||
            e.course?.toString() === course._id.toString()
        );

        if (enrollment) {
          enrolledInBundleCourses++;
          studentCourseProgress += enrollment.progress || 0;
          if (enrollment.progress >= 100) {
            completedCourses++;
          }
        }
      }

      // Calculate average progress only for courses student is enrolled in
      const averageCourseProgress =
        enrolledInBundleCourses > 0
          ? studentCourseProgress / enrolledInBundleCourses
          : 0;
      totalProgress += averageCourseProgress;

      // Consider student completed if they finished 80% or more of bundle courses
      if (completedCourses >= Math.ceil(bundle.courses.length * 0.8)) {
        completedCount++;
      }
    }

    studentAnalytics.averageProgress =
      allStudents.length > 0
        ? Math.round(totalProgress / allStudents.length)
        : 0;
    studentAnalytics.completedStudents = completedCount;

    // Calculate financial analytics
    const financialAnalytics = {
      totalRevenue: 0,
      discountedRevenue: 0,
      fullPriceRevenue: 0,
      averageRevenuePerStudent: 0,
      monthlyRevenue: Array(12).fill(0),
      totalPotentialRevenue: allStudents.length * bundle.price,
      conversionRate: 0,
    };

    // Calculate revenue from bundle purchases
    for (const student of allStudents) {
      const bundlePurchase = student.purchasedBundles.find(
        (pb) =>
          pb.bundle._id?.toString() === bundle._id.toString() ||
          pb.bundle.toString() === bundle._id.toString()
      );

      if (bundlePurchase) {
        const paidPrice = bundlePurchase.price || bundle.finalPrice;
        financialAnalytics.totalRevenue += paidPrice;

        if (paidPrice < bundle.price) {
          financialAnalytics.discountedRevenue += paidPrice;
        } else {
          financialAnalytics.fullPriceRevenue += paidPrice;
        }

        // Monthly revenue tracking
        const purchaseMonth = new Date(bundlePurchase.purchasedAt).getMonth();
        financialAnalytics.monthlyRevenue[purchaseMonth] += paidPrice;
      }
    }

    financialAnalytics.averageRevenuePerStudent =
      allStudents.length > 0
        ? financialAnalytics.totalRevenue / allStudents.length
        : 0;

    // Calculate course-specific analytics
    const courseAnalytics = bundle.courses.map((course) => {
      const enrolledInCourse = allStudents.filter((student) =>
        student.enrolledCourses?.some(
          (e) =>
            e.course?._id?.toString() === course._id.toString() ||
            e.course?.toString() === course._id.toString()
        )
      ).length;

      const completedCourse = allStudents.filter((student) =>
        student.enrolledCourses?.some(
          (e) =>
            (e.course?._id?.toString() === course._id.toString() ||
              e.course?.toString() === course._id.toString()) &&
            e.progress >= 100
        )
      ).length;

      return {
        courseId: course._id,
        title: course.title,
        enrolledStudents: enrolledInCourse,
        completedStudents: completedCourse,
        completionRate:
          enrolledInCourse > 0
            ? Math.round((completedCourse / enrolledInCourse) * 100)
            : 0,
        topicsCount: course.topics?.length || 0,
        averageRating:
          course.ratings?.length > 0
            ? Math.round(
                (course.ratings.reduce((sum, r) => sum + r.rating, 0) /
                  course.ratings.length) *
                  10
              ) / 10
            : 0,
      };
    });

    console.log('Bundle Analytics Debug:', {
      bundleId: bundle._id,
      bundleCode: bundle.bundleCode,
      totalEnrolledStudents: bundle.enrolledStudents?.length || 0,
      studentsFound: allStudents.length,
      courseCount: bundle.courses.length,
      studentAnalytics,
      courseAnalytics: courseAnalytics.map((c) => ({
        title: c.title,
        enrolled: c.enrolledStudents,
        completed: c.completedStudents,
        rate: c.completionRate,
      })),
    });

    // Calculate engagement metrics
    const engagementMetrics = {
      dailyActiveUsers: 0, // Would need activity tracking
      weeklyActiveUsers: 0,
      averageSessionDuration: 0,
      contentCompletionRate: 0,
      quizAttempts: 0,
      averageQuizScore: 0,
    };

    // Get quiz performance data
    const Quiz = require('../models/Quiz');
    const quizzes = await Quiz.find({
      bundleId: bundle._id,
    }).populate('attempts.student', 'firstName lastName');

    let totalQuizAttempts = 0;
    let totalQuizScore = 0;

    quizzes.forEach((quiz) => {
      if (quiz.attempts) {
        totalQuizAttempts += quiz.attempts.length;
        totalQuizScore += quiz.attempts.reduce(
          (sum, attempt) => sum + (attempt.score || 0),
          0
        );
      }
    });

    engagementMetrics.quizAttempts = totalQuizAttempts;
    engagementMetrics.averageQuizScore =
      totalQuizAttempts > 0
        ? Math.round(totalQuizScore / totalQuizAttempts)
        : 0;

    // Calculate content completion rate
    let totalContent = 0;
    let completedContent = 0;

    bundle.courses.forEach((course) => {
      if (course.topics) {
        course.topics.forEach((topic) => {
          if (topic.content) {
            totalContent += topic.content.length;
            // This would need proper progress tracking implementation
          }
        });
      }
    });

    engagementMetrics.contentCompletionRate =
      totalContent > 0
        ? Math.round((completedContent / totalContent) * 100)
        : 0;

    // Get recent activity (would need activity tracking)
    const recentActivity = [
      {
        type: 'enrollment',
        description: `${studentAnalytics.recentEnrollments} new enrollments this month`,
        timestamp: new Date(),
        icon: 'user-plus',
        color: 'success',
      },
      {
        type: 'completion',
        description: `${studentAnalytics.completedStudents} students completed the bundle`,
        timestamp: new Date(),
        icon: 'graduation-cap',
        color: 'primary',
      },
      {
        type: 'revenue',
        description: `$${Math.round(
          financialAnalytics.totalRevenue
        )} total revenue generated`,
        timestamp: new Date(),
        icon: 'coins',
        color: 'warning',
      },
    ];

    // Grade distribution
    const gradeDistribution = {};
    allStudents.forEach((student) => {
      const grade = student.grade || 'Unknown';
      gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
    });

    // School distribution
    const schoolDistribution = {};
    allStudents.forEach((student) => {
      const school = student.schoolName || 'Unknown';
      schoolDistribution[school] = (schoolDistribution[school] || 0) + 1;
    });

    return res.render('admin/bundle-info', {
      title: `Bundle Information: ${bundle.title} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      bundle,
      studentsWithBundle: allStudents,
      studentAnalytics,
      financialAnalytics,
      courseAnalytics,
      engagementMetrics,
      recentActivity,
      gradeDistribution,
      schoolDistribution,
    });
  } catch (error) {
    console.error('Error fetching bundle information:', error);
    req.flash('error_msg', 'Error loading bundle information');
    res.redirect('/admin/bundles');
  }
};

// ==================== STUDENT MANAGEMENT CONTROLLERS ====================

// Get all students with comprehensive filtering and analytics
const getStudents = async (req, res) => {
  try {
    const {
      status,
      grade,
      school,
      bundle,
      course,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20,
      enrollmentStart,
      enrollmentEnd,
      lastActivityStart,
      lastActivityEnd,
    } = req.query;

    // Build filter object
    const filter = {};

    if (status && status !== 'all') {
      filter.isActive = status === 'active';
    }

    if (grade && grade !== 'all') {
      filter.grade = grade;
    }

    if (school && school !== 'all') {
      filter.schoolName = new RegExp(school, 'i');
    }

    if (search) {
      filter.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { studentEmail: new RegExp(search, 'i') },
        { username: new RegExp(search, 'i') },
        { studentNumber: new RegExp(search, 'i') },
        { studentCode: new RegExp(search, 'i') },
        { schoolName: new RegExp(search, 'i') },
      ];
    }

    if (enrollmentStart || enrollmentEnd) {
      filter.createdAt = {};
      if (enrollmentStart) filter.createdAt.$gte = new Date(enrollmentStart);
      if (enrollmentEnd) filter.createdAt.$lte = new Date(enrollmentEnd);
    }

    if (lastActivityStart || lastActivityEnd) {
      filter.lastLogin = {};
      if (lastActivityStart)
        filter.lastLogin.$gte = new Date(lastActivityStart);
      if (lastActivityEnd) filter.lastLogin.$lte = new Date(lastActivityEnd);
    }

    // Bundle filter
    if (bundle && bundle !== 'all') {
      filter.purchasedBundles = {
        $elemMatch: { bundle: new mongoose.Types.ObjectId(bundle) },
      };
    }

    // Course filter
    if (course && course !== 'all') {
      filter.enrolledCourses = {
        $elemMatch: { course: new mongoose.Types.ObjectId(course) },
      };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get students with pagination and populated data
    const students = await User.find(filter)
      .populate({
        path: 'enrolledCourses.course',
        select: 'title courseCode status',
      })
      .populate({
        path: 'purchasedBundles.bundle',
        select: 'title bundleCode status',
      })
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalStudents = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalStudents / parseInt(limit));

    // Calculate analytics for current filtered students
    const analytics = await calculateStudentAnalytics(filter);

    // Get filter options
    const filterOptions = await getStudentFilterOptions();

    // Add calculated fields to each student
    const studentsWithCalculations = students.map((student) => {
      const totalCourses = student.enrolledCourses
        ? student.enrolledCourses.length
        : 0;
      const activeCourses = student.enrolledCourses
        ? student.enrolledCourses.filter((ec) => ec.status === 'active').length
        : 0;
      const completedCourses = student.enrolledCourses
        ? student.enrolledCourses.filter((ec) => ec.status === 'completed')
            .length
        : 0;
      const totalBundles = student.purchasedBundles
        ? student.purchasedBundles.length
        : 0;

      // Calculate overall progress (this would need actual progress data)
      const overallProgress =
        totalCourses > 0
          ? Math.round((completedCourses / totalCourses) * 100)
          : 0;

      // Calculate days since enrollment
      const daysSinceEnrollment = Math.floor(
        (new Date() - new Date(student.createdAt)) / (1000 * 60 * 60 * 24)
      );

      // Calculate days since last activity
      const daysSinceLastActivity = student.lastLogin
        ? Math.floor(
            (new Date() - new Date(student.lastLogin)) / (1000 * 60 * 60 * 24)
          )
        : null;

      return {
        ...student,
        analytics: {
          totalCourses,
          activeCourses,
          completedCourses,
          totalBundles,
          overallProgress,
          daysSinceEnrollment,
          daysSinceLastActivity,
        },
      };
    });

    return res.render('admin/students', {
      title: 'Student Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      students: studentsWithCalculations,
      analytics,
      filterOptions,
      currentFilters: {
        status,
        grade,
        school,
        bundle,
        course,
        search,
        sortBy,
        sortOrder,
        enrollmentStart,
        enrollmentEnd,
        lastActivityStart,
        lastActivityEnd,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalStudents,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    req.flash('error_msg', 'Error loading students');
    return res.redirect('/admin/dashboard');
  }
};

// Get detailed student information with comprehensive analytics
const getStudentDetails = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student with all populated data
    const student = await User.findById(studentId)
      .populate({
        path: 'enrolledCourses.course',
        populate: {
          path: 'topics',
          model: 'Topic',
        },
      })
      .populate({
        path: 'purchasedBundles.bundle',
        populate: {
          path: 'courses',
          model: 'Course',
        },
      })
      .populate({
        path: 'quizAttempts.quiz',
        model: 'Quiz',
      })
      .select('-password')
      .lean();

    if (!student) {
      req.flash('error_msg', 'Student not found');
      return res.redirect('/admin/students');
    }

    // Get detailed progress data
    const progressData = await Progress.find({ student: studentId })
      .populate('course', 'title courseCode')
      .populate('topic', 'title')
      .sort({ timestamp: -1 })
      .lean();

    // Calculate comprehensive analytics for the overview section
    const detailedAnalytics = await calculateStudentDetailedAnalytics(
      studentId,
      student
    );

    // Calculate completed content from the contentProgress arrays directly
    let totalContentCompleted = 0;
    let totalContentItems = 0;

    if (student.enrolledCourses && student.enrolledCourses.length > 0) {
      student.enrolledCourses.forEach((course) => {
        if (course.contentProgress && course.contentProgress.length > 0) {
          totalContentItems += course.contentProgress.length;
          totalContentCompleted += course.contentProgress.filter(
            (content) => content.completionStatus === 'completed'
          ).length;
        }
      });
    }

    // Count quiz attempts - only count standalone quiz attempts to avoid double counting
    // Content quizzes are tracked separately and should not be double-counted
    const totalQuizAttempts = student.quizAttempts
      ? student.quizAttempts.reduce(
          (total, qa) => total + qa.attempts.length,
          0
        )
      : 0;

    // Build analytics for the header card section
    const analytics = {
      totalEnrolledCourses: student.enrolledCourses
        ? student.enrolledCourses.length
        : 0,
      totalPurchasedBundles: student.purchasedBundles
        ? student.purchasedBundles.length
        : 0,
      totalQuizAttempts: totalQuizAttempts,
      averageQuizScore: calculateAverageQuizScore(student),
      totalTimeSpent: calculateTotalTimeSpent(student, progressData),
      completionRate:
        totalContentItems > 0
          ? Math.round((totalContentCompleted / totalContentItems) * 100)
          : 0,
      completedCourses: student.enrolledCourses
        ? student.enrolledCourses.filter((c) => c.status === 'completed').length
        : 0,
      totalContentCompleted: totalContentCompleted,
      totalContentItems: totalContentItems,
      lastLogin: student.lastLogin
        ? formatLastLoginTime(student.lastLogin)
        : 'Never',
    };

    // Build detailed course progress with topics
    const detailedCourses = [];
    if (student.enrolledCourses && student.enrolledCourses.length > 0) {
      for (const enrolledCourse of student.enrolledCourses) {
        if (enrolledCourse.course && enrolledCourse.course.topics) {
          const course = enrolledCourse.course;

          // Get content count from topics
          const totalContent = course.topics.reduce((total, topic) => {
            return total + (topic.content ? topic.content.length : 0);
          }, 0);

          // Use the contentProgress array for accurate completion data
          const courseContentProgress = enrolledCourse.contentProgress || [];
          const completedContent = courseContentProgress.filter(
            (content) => content.completionStatus === 'completed'
          ).length;

          // Map topics with their progress
          const topicsProgress = course.topics.map((topic) => {
            // Find content for this topic in the contentProgress array
            const topicContentProgress = courseContentProgress.filter(
              (content) =>
                content.topicId &&
                content.topicId.toString() === topic._id.toString()
            );

            const topicContentCount = topic.content ? topic.content.length : 0;
            const topicCompletedContent = topicContentProgress.filter(
              (content) => content.completionStatus === 'completed'
            ).length;

            // Build content items array for detailed display
            const contentItems = topic.content
              ? topic.content.map((contentItem) => {
                  // Find corresponding progress data
                  const progressData = topicContentProgress.find(
                    (cp) =>
                      cp.contentId &&
                      cp.contentId.toString() === contentItem._id.toString()
                  );

                  // Extract score from progress data (could be bestScore or score)
                  let score = undefined;
                  let quizAttempts = [];

                  if (progressData) {
                    // For quiz/homework content, get the best score and attempts
                    if (
                      contentItem.type === 'quiz' ||
                      contentItem.type === 'homework'
                    ) {
                      score = progressData.bestScore || progressData.score;
                      quizAttempts = progressData.quizAttempts || [];
                    }
                  }

                  return {
                    _id: contentItem._id,
                    title: contentItem.title,
                    type: contentItem.type,
                    completed: progressData
                      ? progressData.completionStatus === 'completed'
                      : false,
                    completedDate: progressData
                      ? progressData.completedDate
                      : null,
                    score: score,
                    timeSpent: progressData
                      ? progressData.timeSpent
                      : undefined,
                    lastAccessed: progressData
                      ? progressData.lastAccessed
                      : null,
                    quizAttempts: quizAttempts,
                    totalPoints: progressData
                      ? progressData.totalPoints
                      : undefined,
                  };
                })
              : [];

            return {
              _id: topic._id,
              title: topic.title,
              contentCount: topicContentCount,
              completedContent: topicCompletedContent,
              progress:
                topicContentCount > 0
                  ? Math.round(
                      (topicCompletedContent / topicContentCount) * 100
                    )
                  : 0,
              contentItems: contentItems,
            };
          });

          const completedTopics = topicsProgress.filter(
            (t) => t.progress === 100
          ).length;

          // Calculate overall course progress
          const courseProgress =
            totalContent > 0
              ? Math.round((completedContent / totalContent) * 100)
              : enrolledCourse.progress || 0; // Fallback to stored progress value

          detailedCourses.push({
            course: {
              _id: course._id,
              title: course.title,
              courseCode: course.courseCode,
            },
            progress: courseProgress,
            detailedProgress: {
              completedTopics,
              totalTopics: course.topics.length,
              completedContent,
              totalContent,
              topicsProgress,
            },
          });
        }
      }
    }

    // Build course progress summary for the courses tab
    const courseProgress = detailedCourses.map((dc) => {
      const enrolledCourse = student.enrolledCourses.find(
        (ec) =>
          ec.course && ec.course._id.toString() === dc.course._id.toString()
      );

      return {
        courseTitle: dc.course.title,
        courseCode: dc.course.courseCode,
        progressPercentage: dc.progress,
        completedContent: dc.detailedProgress.completedContent,
        totalContent: dc.detailedProgress.totalContent,
        timeSpent: calculateCourseTimeSpent(progressData, dc.course._id),
        status:
          dc.progress === 100
            ? 'completed'
            : dc.progress > 0
            ? 'active'
            : 'not_started',
        enrolledAt: enrolledCourse.enrolledAt
          ? new Date(enrolledCourse.enrolledAt)
          : new Date(),
        lastAccessed: enrolledCourse.lastAccessed
          ? new Date(enrolledCourse.lastAccessed)
          : enrolledCourse.enrolledAt
          ? new Date(enrolledCourse.enrolledAt)
          : new Date(),
      };
    });

    // Build detailed quiz performance for the quizzes tab
    const detailedQuizPerformance = [];
    if (student.quizAttempts && student.quizAttempts.length > 0) {
      const groupedQuizzes = {};

      student.quizAttempts.forEach((quizAttempt) => {
        if (quizAttempt.quiz) {
          const quizId = quizAttempt.quiz._id || quizAttempt.quiz;
          if (!groupedQuizzes[quizId]) {
            groupedQuizzes[quizId] = {
              quizTitle: quizAttempt.quiz.title || 'Quiz',
              code: quizAttempt.quiz.code || 'N/A',
              totalQuestions: quizAttempt.quiz.selectedQuestions
                ? quizAttempt.quiz.selectedQuestions.length
                : 10,
              passingScore: quizAttempt.quiz.passingScore || 60,
              attempts: [],
            };
          }

          quizAttempt.attempts.forEach((attempt, index) => {
            groupedQuizzes[quizId].attempts.push({
              attemptNumber: index + 1,
              score: attempt.score,
              correctAnswers: Math.floor(
                (attempt.score / 100) * groupedQuizzes[quizId].totalQuestions
              ),
              totalQuestions: groupedQuizzes[quizId].totalQuestions,
              timeSpent:
                attempt.timeSpent || Math.floor(Math.random() * 1800) + 300,
              completedAt: attempt.completedAt || new Date(),
              passed: attempt.score >= groupedQuizzes[quizId].passingScore,
            });
          });

          // Calculate quiz statistics
          const scores = groupedQuizzes[quizId].attempts.map((a) => a.score);
          groupedQuizzes[quizId].bestScore = Math.max(...scores);
          groupedQuizzes[quizId].averageScore = Math.round(
            scores.reduce((a, b) => a + b, 0) / scores.length
          );
          groupedQuizzes[quizId].totalAttempts =
            groupedQuizzes[quizId].attempts.length;
          groupedQuizzes[quizId].passRate = Math.round(
            (groupedQuizzes[quizId].attempts.filter((a) => a.passed).length /
              groupedQuizzes[quizId].totalAttempts) *
              100
          );
        }
      });

      detailedQuizPerformance.push(...Object.values(groupedQuizzes));
    }

    // Build recent activity from contentProgress data
    const recentActivity = [];

    // First try to get activities from contentProgress arrays
    if (student.enrolledCourses && student.enrolledCourses.length > 0) {
      // Create a flat array of all content progress entries with course information
      const allContentProgress = [];

      student.enrolledCourses.forEach((course) => {
        if (course.contentProgress && course.contentProgress.length > 0) {
          course.contentProgress.forEach((progress) => {
            // Add only items with completionDate or lastAccessedDate
            if (progress.completionDate || progress.lastAccessedDate) {
              allContentProgress.push({
                courseTitle: course.course?.title || 'Course',
                courseId: course.course?._id,
                contentTitle: progress.contentTitle || 'Content',
                contentType: progress.contentType || 'content',
                topicTitle: progress.topicTitle || '',
                completionStatus: progress.completionStatus,
                completionDate: progress.completionDate,
                lastAccessedDate: progress.lastAccessedDate,
                score: progress.score,
              });
            }
          });
        }
      });

      // Sort by most recent activity (either completion or last access)
      allContentProgress.sort((a, b) => {
        const dateA = a.completionDate || a.lastAccessedDate || new Date(0);
        const dateB = b.completionDate || b.lastAccessedDate || new Date(0);
        return new Date(dateB) - new Date(dateA);
      });

      // Take the 10 most recent activities
      const recentContentProgress = allContentProgress.slice(0, 10);

      // Format for display
      recentContentProgress.forEach((progress) => {
        let activityType, description;

        if (
          progress.contentType === 'quiz' ||
          progress.contentType === 'homework'
        ) {
          activityType = 'quiz_attempt';
          if (progress.completionStatus === 'completed') {
            description = `Completed ${progress.contentType} "${
              progress.contentTitle
            }" with score ${progress.score || 'N/A'}/10`;
          } else {
            description = `Accessed ${progress.contentType} "${progress.contentTitle}"`;
          }
        } else {
          activityType = 'content_progress';
          if (progress.completionStatus === 'completed') {
            description = `Completed lesson "${progress.contentTitle}"`;
          } else {
            description = `Accessed lesson "${progress.contentTitle}"`;
          }
        }

        if (progress.topicTitle) {
          description += ` in topic "${progress.topicTitle}"`;
        }

        recentActivity.push({
          type: activityType,
          title: progress.courseTitle,
          description: description,
          date: progress.completionDate || progress.lastAccessedDate,
        });
      });
    }

    // If we don't have enough activities from contentProgress, add from progressData
    if (recentActivity.length < 10 && progressData && progressData.length > 0) {
      const additionalActivities = progressData
        .slice(0, 10 - recentActivity.length)
        .map((activity) => ({
          type: activity.activity.includes('quiz')
            ? 'quiz_attempt'
            : 'content_progress',
          title: activity.course ? activity.course.title : 'Course Activity',
          description: `${activity.activity.replace(/_/g, ' ')} ${
            activity.topic ? `in ${activity.topic.title}` : ''
          }`,
          date: activity.timestamp,
        }));

      recentActivity.push(...additionalActivities);
    }

    // Ensure activities are sorted by date (newest first)
    recentActivity.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Helper function for content type icons
    const getContentTypeIcon = (type) => {
      switch (type) {
        case 'video':
          return 'video';
        case 'quiz':
          return 'question-circle';
        case 'homework':
          return 'tasks';
        case 'pdf':
          return 'file-pdf';
        case 'reading':
          return 'book';
        case 'assignment':
          return 'clipboard';
        case 'link':
          return 'link';
        default:
          return 'file';
      }
    };

    // Helper function for score badge classes
    const getScoreBadgeClass = (score) => {
      if (score >= 90) return 'score-excellent';
      if (score >= 70) return 'score-good';
      if (score >= 50) return 'score-average';
      return 'score-poor';
    };

    // Helper function for formatting time spent
    const formatTimeSpent = (seconds) => {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    };

    return res.render('admin/student-details', {
      title: `Student Details - ${student.firstName} ${student.lastName} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      student,
      analytics,
      detailedCourses,
      courseProgress,
      detailedQuizPerformance,
      recentActivity,
      progressData,
      getContentTypeIcon,
      getScoreBadgeClass,
      formatTimeSpent,
    });
  } catch (error) {
    console.error('Error fetching student details:', error);
    req.flash('error_msg', 'Error loading student details');
    return res.redirect('/admin/students');
  }
};

// Toggle student status (active/inactive)
const toggleStudentStatus = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { isActive } = req.body;

    const student = await User.findById(studentId);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });
    }

    student.isActive = isActive;
    await student.save();

    // Log the action
    console.log(
      `Admin ${req.session.user.username || 'admin'} ${
        isActive ? 'activated' : 'deactivated'
      } student ${student.username}`
    );

    return res.json({
      success: true,
      message: `Student ${isActive ? 'activated' : 'deactivated'} successfully`,
      newStatus: student.isActive ? 'active' : 'inactive',
    });
  } catch (error) {
    console.error('Error toggling student status:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Export student data
const exportStudentData = async (req, res) => {
  try {
    const { studentId } = req.params;

    // If we have a specific studentId, export just that student with comprehensive details
    if (studentId) {
      const student = await User.findById(studentId)
        .populate({
          path: 'enrolledCourses.course',
          populate: {
            path: 'topics',
            model: 'Topic',
          },
        })
        .populate({
          path: 'purchasedBundles.bundle',
          select: 'title bundleCode price courses',
          populate: {
            path: 'courses',
            select: 'title courseCode',
          },
        })
        .populate({
          path: 'quizAttempts.quiz',
          select: 'title code course passingScore',
        })
        .select('-password')
        .lean();

      if (!student) {
        req.flash('error_msg', 'Student not found');
        return res.redirect('/admin/students');
      }

      // Get comprehensive course progress with topics and content
      const comprehensiveCourseProgress = await Promise.all(
        (student.enrolledCourses || []).map(async (enrollment) => {
          const course = enrollment.course;
          if (!course) return null;

          // Get progress data for this course using correct field name
          const progressData = await Progress.find({
            student: studentId, // Changed from 'user' to 'student'
            course: course._id,
          })
            .populate('topic')
            .lean();

          // Get detailed topics with content
          const topics = await Promise.all(
            (course.topics || []).map(async (topic) => {
              const topicProgress = progressData.filter(
                (p) =>
                  p.topic && p.topic._id.toString() === topic._id.toString()
              );

              const contentProgress = (topic.content || []).map((content) => {
                const contentProgressData = topicProgress.find(
                  (p) =>
                    p.content && p.content.toString() === content._id.toString()
                );

                // Also check user's embedded contentProgress for this content
                const userContentProgress = enrollment.contentProgress?.find(
                  (cp) =>
                    cp.contentId &&
                    cp.contentId.toString() === content._id.toString()
                );

                // Determine actual status from progress data or user data
                let actualStatus = 'Not Started';
                let actualScore = null;
                let actualAttempts = 0;
                let actualTimeSpent = 0;

                if (contentProgressData) {
                  actualStatus = contentProgressData.status || 'Not Started';
                  actualScore = contentProgressData.score;
                  actualAttempts = contentProgressData.attempts || 0;
                  actualTimeSpent = contentProgressData.timeSpent || 0;
                } else if (userContentProgress) {
                  const statusMap = {
                    not_started: 'Not Started',
                    in_progress: 'In Progress',
                    completed: 'Completed',
                    failed: 'Failed',
                  };
                  actualStatus =
                    statusMap[userContentProgress.completionStatus] ||
                    'Not Started';
                  actualScore = userContentProgress.score;
                  actualAttempts = userContentProgress.attempts || 0;
                  actualTimeSpent = userContentProgress.timeSpent || 0;
                }

                const contentResult = {
                  title: content.title || 'Untitled Content',
                  contentType: content.type || content.contentType || 'Unknown', // Fix content type detection
                  status: actualStatus,
                  score: actualScore,
                  attempts: actualAttempts,
                  timeSpent: actualTimeSpent,
                  lastAccessed:
                    contentProgressData?.lastAccessed ||
                    userContentProgress?.lastAccessed ||
                    null,
                  // Add question count for quiz/homework content
                  questionCount:
                    ['quiz', 'homework'].includes(content.type) &&
                    content.selectedQuestions
                      ? content.selectedQuestions.length
                      : null,
                };

                // Debug content type detection
                if (contentResult.contentType === 'Unknown') {
                  console.log(
                    `Unknown content type for: ${content.title}, Available fields:`,
                    Object.keys(content)
                  );
                  console.log(
                    'Content object:',
                    JSON.stringify(content, null, 2)
                  );
                }

                return contentResult;
              });

              const completedContent = contentProgress.filter(
                (c) => c.status === 'Completed'
              ).length;
              const topicProgressPercentage =
                (topic.content || []).length > 0
                  ? Math.round((completedContent / topic.content.length) * 100)
                  : 0;

              return {
                title: topic.title,
                order: topic.order,
                progress: topicProgressPercentage,
                status:
                  topicProgressPercentage === 100
                    ? 'Completed'
                    : topicProgressPercentage > 0
                    ? 'In Progress'
                    : 'Not Started',
                totalContent: (topic.content || []).length,
                completedContent,
                timeSpent: topicProgress.reduce(
                  (sum, p) => sum + (p.timeSpent || 0),
                  0
                ),
                lastAccessed:
                  topicProgress.length > 0
                    ? Math.max(
                        ...topicProgress.map(
                          (p) => new Date(p.lastAccessed || 0)
                        )
                      )
                    : null,
                content: contentProgress,
              };
            })
          );

          const completedTopics = topics.filter(
            (t) => t.status === 'Completed'
          ).length;
          const courseProgress =
            topics.length > 0
              ? Math.round((completedTopics / topics.length) * 100)
              : 0;

          // Determine actual course status based on progress and enrollment data
          let courseStatus = 'Not Started';
          if (progressData.length > 0 || enrollment.progress > 0) {
            if (courseProgress === 100) {
              courseStatus = 'Completed';
            } else if (courseProgress > 0 || progressData.length > 0) {
              courseStatus = 'In Progress';
            }
          }

          // Override with user's enrollment status if available
          if (enrollment.status) {
            const statusMap = {
              active: courseProgress > 0 ? 'In Progress' : 'Enrolled',
              completed: 'Completed',
              paused: 'Paused',
              dropped: 'Dropped',
            };
            courseStatus = statusMap[enrollment.status] || courseStatus;
          }

          console.log(
            `Course ${course.title}: Progress Data Count: ${progressData.length}, Course Progress: ${courseProgress}%, Enrollment Status: ${enrollment.status}, Final Status: ${courseStatus}`
          );

          return {
            courseTitle: course.title,
            courseCode: course.courseCode,
            enrollmentDate: enrollment.enrollmentDate || enrollment.enrolledAt,
            progress: Math.max(courseProgress, enrollment.progress || 0), // Use the higher value
            status: courseStatus,
            timeSpent: progressData.reduce(
              (sum, p) => sum + (p.timeSpent || 0),
              0
            ),
            lastAccessed:
              Math.max(
                progressData.length > 0
                  ? Math.max(
                      ...progressData.map((p) => new Date(p.lastAccessed || 0))
                    )
                  : 0,
                enrollment.lastAccessed ? new Date(enrollment.lastAccessed) : 0
              ) || null,
            completedTopics,
            totalTopics: topics.length,
            completionRate: Math.max(courseProgress, enrollment.progress || 0),
            topics,
          };
        })
      );

      // Get comprehensive quiz performance
      const quizAttempts = student.quizAttempts || [];
      const comprehensiveQuizPerformance = [];

      // Group attempts by quiz
      const quizGroups = {};
      quizAttempts.forEach((quizAttempt) => {
        if (quizAttempt.quiz) {
          const quizId =
            quizAttempt.quiz._id?.toString() || quizAttempt.quiz.toString();
          if (!quizGroups[quizId]) {
            quizGroups[quizId] = {
              quiz: quizAttempt.quiz,
              attempts: [],
            };
          }
          if (quizAttempt.attempts) {
            quizGroups[quizId].attempts.push(...quizAttempt.attempts);
          }
        }
      });

      // Process each quiz group
      for (const [quizId, quizData] of Object.entries(quizGroups)) {
        try {
          const quiz = quizData.quiz;
          const attempts = quizData.attempts;

          if (attempts.length === 0) continue;

          // Get quiz details to get question count
          const quizDetails = await Quiz.findById(quizId).lean();
          const course = quiz.course
            ? await Course.findById(quiz.course).lean()
            : null;

          const scores = attempts.map((a) => a.score || 0);
          const bestScore = Math.max(...scores);
          const averageScore =
            scores.reduce((sum, score) => sum + score, 0) / scores.length;
          const lowestScore = Math.min(...scores);
          const totalTimeSpent = attempts.reduce(
            (sum, a) => sum + (a.timeSpent || 0),
            0
          );
          const passedAttempts = attempts.filter(
            (a) =>
              a.status === 'passed' ||
              (a.score || 0) >=
                (quiz.passingScore || quizDetails?.passingScore || 60)
          ).length;

          // Calculate total questions from quiz details
          const totalQuestions =
            quizDetails?.selectedQuestions?.length ||
            quiz.selectedQuestions?.length ||
            attempts[0]?.totalQuestions ||
            0;

          comprehensiveQuizPerformance.push({
            quizTitle: quiz.title || 'Unknown Quiz',
            code: quiz.code || 'N/A',
            courseName: course?.title || 'Unknown Course',
            bestScore,
            averageScore: Math.round(averageScore),
            lowestScore,
            totalAttempts: attempts.length,
            passRate: Math.round((passedAttempts / attempts.length) * 100),
            totalTimeSpent,
            averageTimeSpent: Math.round(totalTimeSpent / attempts.length),
            totalQuestions, // Add total questions
            attempts: attempts.map((attempt, index) => ({
              attemptNumber: index + 1,
              createdAt: attempt.createdAt,
              score: attempt.score || 0,
              maxScore: attempt.maxScore || 100,
              percentage:
                attempt.percentage ||
                Math.round(
                  ((attempt.score || 0) / (attempt.maxScore || 100)) * 100
                ),
              timeSpent: attempt.timeSpent || 0,
              status: attempt.status || 'Unknown',
              correctAnswers: attempt.correctAnswers || 0,
              totalQuestions: attempt.totalQuestions || totalQuestions,
              accuracy:
                (attempt.totalQuestions || totalQuestions) > 0
                  ? Math.round(
                      ((attempt.correctAnswers || 0) /
                        (attempt.totalQuestions || totalQuestions)) *
                        100
                    )
                  : 0,
              questionDetails: attempt.questionDetails || [],
            })),
          });
        } catch (error) {
          console.error('Error processing quiz data:', error);
        }
      }

      // Get comprehensive purchase history
      const comprehensivePurchaseHistory = await Promise.all(
        (student.purchasedBundles || []).map(async (purchase) => {
          const bundle = purchase.bundle;
          if (!bundle) return null;

          // Get courses included in this bundle
          const includedCourses = await Promise.all(
            (bundle.courses || []).map(async (courseRef) => {
              const courseId = courseRef._id || courseRef;
              const course = courseRef.title
                ? courseRef
                : await Course.findById(courseId).lean();
              const enrollment = student.enrolledCourses?.find(
                (e) =>
                  e.course && e.course._id.toString() === courseId.toString()
              );

              const progressData = await Progress.find({
                student: studentId,
                course: courseId,
              }).lean();

              const progress =
                progressData.length > 0
                  ? Math.round(
                      progressData.reduce(
                        (sum, p) => sum + (p.progress || 0),
                        0
                      ) / progressData.length
                    )
                  : 0;

              return {
                title: course?.title || 'Unknown Course',
                courseCode: course?.courseCode || 'N/A',
                enrollmentDate:
                  enrollment?.enrollmentDate || enrollment?.enrolledAt || null,
                progress,
                status:
                  progress === 100
                    ? 'Completed'
                    : progress > 0
                    ? 'In Progress'
                    : 'Not Started',
                timeSpent: progressData.reduce(
                  (sum, p) => sum + (p.timeSpent || 0),
                  0
                ),
                lastAccessed:
                  progressData.length > 0
                    ? Math.max(
                        ...progressData.map(
                          (p) => new Date(p.lastAccessed || 0)
                        )
                      )
                    : null,
              };
            })
          );

          const bundleProgress =
            includedCourses.length > 0
              ? Math.round(
                  includedCourses.reduce(
                    (sum, course) => sum + course.progress,
                    0
                  ) / includedCourses.length
                )
              : 0;

          return {
            bundleTitle: bundle.title,
            bundleCode: bundle.bundleCode,
            orderNumber: purchase.orderNumber,
            price: purchase.price || bundle.price,
            purchaseDate: purchase.purchaseDate || purchase.purchasedAt,
            expiryDate: purchase.expiryDate || purchase.expiresAt,
            status: purchase.status || 'Active',
            paymentMethod: purchase.paymentMethod || 'Unknown',
            usagePercentage: bundleProgress,
            includedCourses: includedCourses.filter(
              (course) => course !== null
            ),
          };
        })
      );

      // Generate activity timeline
      const activityTimeline = [];

      // Add login activities (if loginHistory exists)
      if (student.loginHistory) {
        student.loginHistory.forEach((login) => {
          activityTimeline.push({
            timestamp: login.timestamp,
            activityType: 'Login',
            description: 'User logged into the system',
            duration: login.duration || 0,
            status: 'Completed',
            details: `IP: ${login.ipAddress || 'Unknown'}`,
          });
        });
      }

      // Add progress activities
      const allProgressData = await Progress.find({ student: studentId })
        .populate('course')
        .populate('topic')
        .lean();

      allProgressData.forEach((progress) => {
        activityTimeline.push({
          timestamp: progress.lastAccessed || progress.createdAt,
          activityType: 'Content Access',
          description: `Accessed content in ${
            progress.topic?.title || 'Unknown Topic'
          }`,
          courseOrQuiz: progress.course?.title || 'Unknown Course',
          duration: progress.timeSpent || 0,
          scoreOrProgress: `${progress.progress || 0}/10`,
          status: progress.status || 'Unknown',
          details: `Topic: ${progress.topic?.title || 'Unknown'}`,
        });
      });

      // Add quiz activities
      quizAttempts.forEach((quizAttempt) => {
        if (quizAttempt.attempts) {
          quizAttempt.attempts.forEach((attempt) => {
            activityTimeline.push({
              timestamp: attempt.createdAt,
              activityType: 'Quiz Attempt',
              description: `Attempted quiz: ${
                quizAttempt.quiz?.title || 'Unknown Quiz'
              }`,
              courseOrQuiz: quizAttempt.quiz?.title || 'Quiz',
              duration: attempt.timeSpent || 0,
              scoreOrProgress: `${attempt.score || 0}/10`,
              status: attempt.status || 'Unknown',
              details: `Score: ${attempt.score || 0}/${
                attempt.maxScore || 100
              }`,
            });
          });
        }
      });

      // Sort activities by timestamp
      activityTimeline.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      // Generate engagement analytics
      const engagementAnalytics = {
        totalLoginDays: student.loginHistory?.length || 0,
        avgSessionDuration:
          student.loginHistory?.length > 0
            ? student.loginHistory.reduce(
                (sum, session) => sum + (session.duration || 0),
                0
              ) / student.loginHistory.length
            : 0,
        engagementScore: calculateEngagementScore(student, allProgressData),
        activityStreak: calculateActivityStreak(activityTimeline),
        contentInteractionRate: calculateContentInteractionRate(
          student,
          allProgressData
        ),
        quizParticipationRate: calculateQuizParticipationRate(student),
        weeklyPattern: calculateWeeklyPattern(activityTimeline),
      };

      // Prepare comprehensive export data
      const studentData = {
        ...student,
        comprehensiveCourseProgress: comprehensiveCourseProgress.filter(
          (course) => course !== null
        ),
        comprehensiveQuizPerformance,
        comprehensivePurchaseHistory: comprehensivePurchaseHistory.filter(
          (purchase) => purchase !== null
        ),
        activityTimeline,
        engagementAnalytics,
        // Calculate summary stats
        totalTimeSpent: calculateTotalTimeSpent(student, allProgressData),
        averageQuizScore: calculateAverageQuizScore(student),
        completionRate:
          comprehensiveCourseProgress.length > 0
            ? Math.round(
                comprehensiveCourseProgress.reduce(
                  (sum, course) => sum + course.progress,
                  0
                ) / comprehensiveCourseProgress.length
              )
            : 0,
        engagementScore: engagementAnalytics.engagementScore,

        // Legacy format for backward compatibility
        courseProgress: comprehensiveCourseProgress.map((course) => ({
          courseTitle: course.courseTitle,
          courseCode: course.courseCode,
          enrollmentDate: course.enrollmentDate,
          progress: course.progress,
          status: course.status,
          lastAccessed: course.lastAccessed,
        })),

        quizPerformance: comprehensiveQuizPerformance.map((quiz) => ({
          quizTitle: quiz.quizTitle,
          code: quiz.code,
          bestScore: quiz.bestScore,
          averageScore: quiz.averageScore,
          attempts: quiz.totalAttempts,
          passRate: quiz.passRate,
        })),

        purchaseHistory: comprehensivePurchaseHistory.map((purchase) => ({
          bundleTitle: purchase.bundleTitle,
          bundleCode: purchase.bundleCode,
          price: purchase.price,
          purchaseDate: purchase.purchaseDate,
          expiryDate: purchase.expiryDate,
          status: purchase.status,
        })),
      };

      const exporter = new ExcelExporter();
      const workbook = await exporter.exportStudents([studentData], true);
      const buffer = await workbook.xlsx.writeBuffer();

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${
        student.studentCode || student._id
      }-comprehensive-report-${timestamp}.xlsx`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.send(buffer);
    }

    // For bulk export of multiple students
    const { filters } = req.query;
    const filter = buildStudentFilter(filters ? JSON.parse(filters) : {});

    const students = await User.find(filter)
      .populate({
        path: 'enrolledCourses.course',
        select: 'title courseCode',
      })
      .populate({
        path: 'purchasedBundles.bundle',
        select: 'title bundleCode',
      })
      .select('-password')
      .lean();

    // Add analytics to each student
    const studentsWithAnalytics = await Promise.all(
      students.map(async (student) => {
        const progressData = await Progress.find({ student: student._id })
          .populate('course', 'title courseCode')
          .populate('topic', 'title')
          .sort({ timestamp: -1 })
          .lean();

        return {
          ...student,
          totalTimeSpent: calculateTotalTimeSpent(student, progressData),
          averageQuizScore: calculateAverageQuizScore(student),
          completionRate:
            student.enrolledCourses?.length > 0
              ? Math.round(
                  student.enrolledCourses.reduce(
                    (sum, ec) => sum + (ec.progress || 0),
                    0
                  ) / student.enrolledCourses.length
                )
              : 0,
          engagementScore: calculateEngagementScore(student, progressData),
        };
      })
    );

    const exporter = new ExcelExporter();
    const workbook = await exporter.exportStudents(
      studentsWithAnalytics,
      false
    );
    const buffer = await workbook.xlsx.writeBuffer();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `students-comprehensive-report-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting student data:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Update student information
const updateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated
    delete updateData.password;
    delete updateData.studentCode;
    delete updateData.role;

    const student = await User.findByIdAndUpdate(studentId, updateData, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });
    }

    return res.json({
      success: true,
      message: 'Student updated successfully',
      student,
    });
  } catch (error) {
    console.error('Error updating student:', error);
    return res.status(500).json({ success: false, message: 'Update failed' });
  }
};

// Delete student (permanent delete)
const deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Validate studentId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format',
      });
    }

    // Find student before deletion for logging
    const student = await User.findById(studentId);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });
    }

    // Store student info for logging
    const studentInfo = {
      id: student._id,
      name: `${student.firstName} ${student.lastName}`,
      email: student.studentEmail,
      username: student.username,
    };

    // Log the action with detailed information BEFORE deletion
    console.log(
      `Admin ${req.session.user?.username || 'unknown'} deleting student:`,
      {
        studentId: studentInfo.id,
        studentName: studentInfo.name,
        studentEmail: studentInfo.email,
        deletedAt: new Date().toISOString(),
        deletedBy: req.session.user?.id || 'unknown',
      }
    );

    // Permanently delete the student from database
    await User.findByIdAndDelete(studentId);

    console.log(`Student ${studentInfo.name} (${studentInfo.id}) permanently deleted from database`);

    return res.json({
      success: true,
      message: 'Student has been permanently deleted from the system',
      deletedStudent: {
        id: studentInfo.id,
        name: studentInfo.name,
        email: studentInfo.email,
      },
    });
  } catch (error) {
    console.error('Error deleting student:', error);

    // Handle specific database errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format',
      });
    }

    return res.status(500).json({
      success: false,
      message:
        'Failed to delete student. Please try again or contact support if the problem persists.',
    });
  }
};

// Helper functions for student management

const calculateStudentAnalytics = async (filter = {}) => {
  try {
    // Basic counts
    const totalStudents = await User.countDocuments(filter);
    const activeStudents = await User.countDocuments({
      ...filter,
      isActive: true,
    });
    const inactiveStudents = await User.countDocuments({
      ...filter,
      isActive: false,
    });

    // Grade distribution
    const gradeDistribution = await User.aggregate([
      { $match: filter },
      { $group: { _id: '$grade', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // School distribution (top 10)
    const schoolDistribution = await User.aggregate([
      { $match: filter },
      { $group: { _id: '$schoolName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Enrollment trends (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const enrollmentTrends = await User.aggregate([
      {
        $match: {
          ...filter,
          createdAt: { $gte: twelveMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Average courses per student
    const courseStats = await User.aggregate([
      { $match: filter },
      {
        $project: {
          totalCourses: { $size: { $ifNull: ['$enrolledCourses', []] } },
          totalBundles: { $size: { $ifNull: ['$purchasedBundles', []] } },
        },
      },
      {
        $group: {
          _id: null,
          avgCourses: { $avg: '$totalCourses' },
          avgBundles: { $avg: '$totalBundles' },
          totalCourses: { $sum: '$totalCourses' },
          totalBundles: { $sum: '$totalBundles' },
        },
      },
    ]);

    return {
      totalStudents,
      activeStudents,
      inactiveStudents,
      gradeDistribution,
      schoolDistribution,
      enrollmentTrends,
      courseStats: courseStats[0] || {
        avgCourses: 0,
        avgBundles: 0,
        totalCourses: 0,
        totalBundles: 0,
      },
    };
  } catch (error) {
    console.error('Error calculating student analytics:', error);
    return {
      totalStudents: 0,
      activeStudents: 0,
      inactiveStudents: 0,
      gradeDistribution: [],
      schoolDistribution: [],
      enrollmentTrends: [],
      courseStats: {
        avgCourses: 0,
        avgBundles: 0,
        totalCourses: 0,
        totalBundles: 0,
      },
    };
  }
};

const getStudentFilterOptions = async () => {
  try {
    const grades = await User.distinct('grade');
    const schools = await User.distinct('schoolName');
    const bundles = await BundleCourse.find({ status: { $ne: 'archived' } })
      .select('_id title bundleCode')
      .sort({ title: 1 });
    const courses = await Course.find({ status: { $ne: 'archived' } })
      .select('_id title courseCode')
      .sort({ title: 1 });

    return { grades, schools, bundles, courses };
  } catch (error) {
    console.error('Error getting filter options:', error);
    return { grades: [], schools: [], bundles: [], courses: [] };
  }
};

const calculateStudentDetailedAnalytics = async (studentId, student) => {
  try {
    // Course statistics
    const totalCourses = student.enrolledCourses
      ? student.enrolledCourses.length
      : 0;

    // Determine course status based on content progress
    let activeCourses = 0;
    let completedCourses = 0;
    let pausedCourses = 0;

    if (student.enrolledCourses) {
      student.enrolledCourses.forEach((course) => {
        // Calculate actual progress based on contentProgress array
        if (course.course && course.course.topics && course.contentProgress) {
          // Calculate total content from topics
          const totalContentCount = course.course.topics.reduce(
            (sum, topic) => sum + (topic.content ? topic.content.length : 0),
            0
          );

          // Calculate completed content
          const completedCount = course.contentProgress.filter(
            (content) => content.completionStatus === 'completed'
          ).length;

          // Calculate progress percentage
          const actualProgress =
            totalContentCount > 0
              ? Math.round((completedCount / totalContentCount) * 100)
              : course.progress || 0;

          // Determine status based on actual progress
          if (actualProgress >= 100) {
            completedCourses++;
          } else if (actualProgress > 0) {
            activeCourses++;
          } else if (course.status === 'paused') {
            pausedCourses++;
          }
        } else {
          // Fall back to stored status if contentProgress isn't available
          if (course.status === 'completed') completedCourses++;
          else if (course.status === 'active') activeCourses++;
          else if (course.status === 'paused') pausedCourses++;
        }
      });
    }

    // Bundle statistics
    const totalBundles = student.purchasedBundles
      ? student.purchasedBundles.length
      : 0;

    // Progress statistics - use contentProgress for accurate measurement
    let totalProgress = 0;
    let totalContentCount = 0;
    let completedContentCount = 0;

    if (student.enrolledCourses) {
      student.enrolledCourses.forEach((course) => {
        if (course.contentProgress) {
          totalContentCount += course.contentProgress.length;
          completedContentCount += course.contentProgress.filter(
            (content) => content.completionStatus === 'completed'
          ).length;
        }
      });

      // Calculate average progress
      totalProgress =
        totalContentCount > 0
          ? Math.round((completedContentCount / totalContentCount) * 100)
          : 0;
    }

    const averageProgress = totalProgress;

    // Time-based analytics
    const daysSinceEnrollment = Math.floor(
      (new Date() - new Date(student.createdAt)) / (1000 * 60 * 60 * 24)
    );
    const daysSinceLastActivity = student.lastLogin
      ? Math.floor(
          (new Date() - new Date(student.lastLogin)) / (1000 * 60 * 60 * 24)
        )
      : null;

    // Content completion statistics - this is already calculated above
    // Using previously calculated totalContentCount and completedContentCount
    const inProgressContent = student.enrolledCourses
      ? student.enrolledCourses.reduce((sum, course) => {
          if (course.contentProgress) {
            return (
              sum +
              course.contentProgress.filter(
                (cp) => cp.completionStatus === 'in_progress'
              ).length
            );
          }
          return sum;
        }, 0)
      : 0;

    const contentCompletionRate =
      totalContentCount > 0
        ? Math.round((completedContentCount / totalContentCount) * 100)
        : 0;

    // Calculate last access dates across all content
    const lastAccessDates = [];
    if (student.enrolledCourses) {
      student.enrolledCourses.forEach((course) => {
        if (course.contentProgress) {
          course.contentProgress.forEach((cp) => {
            if (cp.lastAccessedDate) {
              lastAccessDates.push(new Date(cp.lastAccessedDate));
            }
          });
        }
        if (course.lastAccessed) {
          lastAccessDates.push(new Date(course.lastAccessed));
        }
      });
    }

    // Find the most recent access date
    const lastContentAccess =
      lastAccessDates.length > 0
        ? new Date(Math.max(...lastAccessDates.map((date) => date.getTime())))
        : null;

    // Calculate days since last content access
    const daysSinceLastContentAccess = lastContentAccess
      ? Math.floor((new Date() - lastContentAccess) / (1000 * 60 * 60 * 24))
      : null;

    return {
      courses: {
        total: totalCourses,
        active: activeCourses,
        completed: completedCourses,
        paused: pausedCourses,
        averageProgress,
      },
      bundles: {
        total: totalBundles,
      },
      content: {
        total: totalContentCount,
        completed: completedContentCount,
        inProgress: inProgressContent,
        completionRate: contentCompletionRate,
      },
      timeMetrics: {
        daysSinceEnrollment,
        daysSinceLastActivity,
        daysSinceLastContentAccess,
        lastContentAccess,
      },
    };
  } catch (error) {
    console.error('Error calculating detailed analytics:', error);
    return {
      courses: {
        total: 0,
        active: 0,
        completed: 0,
        paused: 0,
        averageProgress: 0,
      },
      bundles: { total: 0 },
      content: { total: 0, completed: 0, inProgress: 0, completionRate: 0 },
      timeMetrics: { daysSinceEnrollment: 0, daysSinceLastActivity: null },
    };
  }
};

const calculateCourseAnalytics = async (studentId, enrolledCourses) => {
  try {
    if (!enrolledCourses || enrolledCourses.length === 0) {
      return [];
    }

    const courseAnalytics = enrolledCourses.map((enrollment) => {
      const course = enrollment.course;

      // Calculate content completion for this course
      let totalTopics = 0;
      let completedTopics = 0;
      let totalContent = 0;
      let completedContent = 0;

      if (course.topics) {
        totalTopics = course.topics.length;
        completedTopics = enrollment.completedTopics
          ? enrollment.completedTopics.length
          : 0;
      }

      if (enrollment.contentProgress) {
        totalContent = enrollment.contentProgress.length;
        completedContent = enrollment.contentProgress.filter(
          (cp) => cp.completionStatus === 'completed'
        ).length;
      }

      const topicCompletionRate =
        totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
      const contentCompletionRate =
        totalContent > 0
          ? Math.round((completedContent / totalContent) * 100)
          : 0;

      // Calculate time spent (sum from contentProgress)
      const totalTimeSpent = enrollment.contentProgress
        ? enrollment.contentProgress.reduce(
            (sum, cp) => sum + (cp.timeSpent || 0),
            0
          )
        : 0;

      // Calculate days since enrollment
      const daysSinceEnrollment = Math.floor(
        (new Date() - new Date(enrollment.enrolledAt)) / (1000 * 60 * 60 * 24)
      );

      return {
        courseId: course._id,
        title: course.title,
        courseCode: course.courseCode,
        status: enrollment.status,
        progress: enrollment.progress || 0,
        topicCompletion: {
          completed: completedTopics,
          total: totalTopics,
          rate: topicCompletionRate,
        },
        contentCompletion: {
          completed: completedContent,
          total: totalContent,
          rate: contentCompletionRate,
        },
        timeSpent: totalTimeSpent,
        daysSinceEnrollment,
        lastAccessed: enrollment.lastAccessed,
      };
    });

    return courseAnalytics;
  } catch (error) {
    console.error('Error calculating course analytics:', error);
    return [];
  }
};

const calculateQuizAnalytics = async (studentId) => {
  try {
    // This would need to be implemented based on your quiz structure
    // For now, returning placeholder data
    return {
      totalQuizzes: 0,
      completedQuizzes: 0,
      averageScore: 0,
      totalAttempts: 0,
      recentAttempts: [],
    };
  } catch (error) {
    console.error('Error calculating quiz analytics:', error);
    return {
      totalQuizzes: 0,
      completedQuizzes: 0,
      averageScore: 0,
      totalAttempts: 0,
      recentAttempts: [],
    };
  }
};

const getStudentActivityTimeline = async (studentId) => {
  try {
    const progressActivities = await Progress.find({ student: studentId })
      .populate('course', 'title')
      .populate('topic', 'title')
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    const activities = progressActivities.map((progress) => ({
      type: 'progress',
      description: `Made progress in ${
        progress.course?.title || 'Unknown Course'
      }`,
      details: progress.topic?.title || 'Topic progress',
      timestamp: progress.timestamp,
      data: progress,
    }));

    return activities;
  } catch (error) {
    console.error('Error getting activity timeline:', error);
    return [];
  }
};

const calculateEngagementMetrics = async (studentId, student) => {
  try {
    // Calculate various engagement metrics
    const totalSessions = 1; // This would need session tracking
    const avgSessionDuration = 0; // This would need session tracking
    const streakDays = 0; // This would need daily activity tracking
    const lastActivityDate = student.lastLogin;

    return {
      totalSessions,
      avgSessionDuration,
      streakDays,
      lastActivityDate,
      engagementScore: 0, // This would be calculated based on various factors
    };
  } catch (error) {
    console.error('Error calculating engagement metrics:', error);
    return {
      totalSessions: 0,
      avgSessionDuration: 0,
      streakDays: 0,
      lastActivityDate: null,
      engagementScore: 0,
    };
  }
};

const buildStudentFilter = (queryParams) => {
  const filter = {};

  if (queryParams.status && queryParams.status !== 'all') {
    filter.isActive = queryParams.status === 'active';
  }

  if (queryParams.grade && queryParams.grade !== 'all') {
    filter.grade = queryParams.grade;
  }

  if (queryParams.school && queryParams.school !== 'all') {
    filter.schoolName = new RegExp(queryParams.school, 'i');
  }

  if (queryParams.search) {
    filter.$or = [
      { firstName: new RegExp(queryParams.search, 'i') },
      { lastName: new RegExp(queryParams.search, 'i') },
      { studentEmail: new RegExp(queryParams.search, 'i') },
      { username: new RegExp(queryParams.search, 'i') },
      { studentNumber: new RegExp(queryParams.search, 'i') },
      { studentCode: new RegExp(queryParams.search, 'i') },
    ];
  }

  return filter;
};

// Calculate average quiz score for a student
const calculateAverageQuizScore = (student) => {
  if (!student.quizAttempts || student.quizAttempts.length === 0) {
    return 0;
  }

  let totalScore = 0;
  let totalAttempts = 0;

  student.quizAttempts.forEach((quizAttempt) => {
    if (quizAttempt.attempts && quizAttempt.attempts.length > 0) {
      quizAttempt.attempts.forEach((attempt) => {
        totalScore += attempt.score || 0;
        totalAttempts++;
      });
    }
  });

  return totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0;
};

// Calculate total time spent by a student across all courses
const calculateTotalTimeSpent = (student, progressData) => {
  // Use progress data if available to get accurate time spent
  if (progressData && progressData.length > 0) {
    // Sum up timeSpent from all progress records
    const totalMinutes = progressData.reduce((total, record) => {
      return total + (record.timeSpent || 0);
    }, 0);

    // Convert minutes to hours, rounded to 1 decimal place
    return Math.round((totalMinutes / 60) * 10) / 10;
  }

  // Fallback: estimate based on content completion
  if (student.enrolledCourses && student.enrolledCourses.length > 0) {
    let estimatedTime = student.enrolledCourses.reduce((total, course) => {
      // Assume each content item takes about 20 minutes
      const contentCompleted = course.contentProgress
        ? course.contentProgress.filter(
            (cp) => cp.completionStatus === 'completed'
          ).length
        : 0;

      return total + contentCompleted * 20;
    }, 0);

    // Convert minutes to hours, rounded to 1 decimal place
    return Math.round((estimatedTime / 60) * 10) / 10;
  }

  return 0;
};

// Format last login time in a user-friendly format
const formatLastLoginTime = (lastLogin) => {
  if (!lastLogin) return 'Never';

  const now = new Date();
  const loginDate = new Date(lastLogin);
  const diffTime = Math.abs(now - loginDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today
    return (
      'Today at ' +
      loginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  } else if (diffDays === 1) {
    // Yesterday
    return (
      'Yesterday at ' +
      loginDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  } else if (diffDays < 7) {
    // Within the last week
    return `${diffDays} days ago`;
  } else {
    // More than a week ago
    return loginDate.toLocaleDateString();
  }
};

// Calculate time spent on a specific course
const calculateCourseTimeSpent = (progressData, courseId) => {
  if (!progressData || progressData.length === 0 || !courseId) {
    return 0;
  }

  // Filter progress data for the specific course
  const courseProgress = progressData.filter(
    (p) => p.course && p.course._id.toString() === courseId.toString()
  );

  // Sum up time spent
  const totalMinutes = courseProgress.reduce((total, record) => {
    return total + (record.timeSpent || 0);
  }, 0);

  // Convert to hours
  return Math.round((totalMinutes / 60) * 10) / 10;
};

// Calculate engagement score based on various metrics
const calculateEngagementScore = (student, progressData) => {
  let score = 0;

  // Recent login activity (up to 30 points)
  if (student.lastLogin) {
    const daysSinceLastLogin = Math.floor(
      (new Date() - new Date(student.lastLogin)) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLastLogin === 0) score += 30;
    else if (daysSinceLastLogin <= 3) score += 25;
    else if (daysSinceLastLogin <= 7) score += 20;
    else if (daysSinceLastLogin <= 14) score += 15;
    else if (daysSinceLastLogin <= 30) score += 10;
    else score += 5;
  }

  // Course enrollment and progress (up to 30 points)
  if (student.enrolledCourses && student.enrolledCourses.length > 0) {
    score += Math.min(student.enrolledCourses.length * 5, 15); // Up to 15 points for number of courses

    // Average progress across courses
    const avgProgress =
      student.enrolledCourses.reduce(
        (sum, course) => sum + (course.progress || 0),
        0
      ) / student.enrolledCourses.length;
    score += Math.floor((avgProgress / 100) * 15); // Up to 15 points for progress
  }

  // Quiz participation (up to 20 points)
  if (student.quizAttempts && student.quizAttempts.length > 0) {
    // Points for number of quizzes attempted
    score += Math.min(student.quizAttempts.length * 3, 10);

    // Points for average quiz score
    const avgScore = calculateAverageQuizScore(student);
    score += Math.floor((avgScore / 100) * 10);
  }

  // Progress activity frequency (up to 20 points)
  if (progressData && progressData.length > 0) {
    // More recent activities get more points
    const activityCount = progressData.length;
    score += Math.min(activityCount / 2, 10);

    // Consistency of activity (check timestamps)
    // This is a simplified approach - ideally would check activity patterns over time
    const uniqueDates = new Set(
      progressData.map((p) => new Date(p.timestamp).toDateString())
    ).size;
    score += Math.min(uniqueDates, 10);
  }

  return score;
};

// ========================================
// BRILLIANT STUDENTS MANAGEMENT
// ========================================

// Get all brilliant students with filtering and pagination
const getBrilliantStudents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};

    if (req.query.testType && req.query.testType !== 'all') {
      filter.testType = req.query.testType;
    }

    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }

    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: 'i' };
    }

    // Get students with pagination
    const students = await BrilliantStudent.find(filter)
      .sort({ displayOrder: 1, percentage: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalStudents = await BrilliantStudent.countDocuments(filter);
    const totalPages = Math.ceil(totalStudents / limit);

    // Get statistics
    const stats = await BrilliantStudent.getStatistics();

    // Get filter options
    const testTypes = await BrilliantStudent.distinct('testType');

    res.render('admin/brilliant-students', {
      title: 'Brilliant Students Management',
      students,
      pagination: {
        currentPage: page,
        totalPages,
        totalStudents,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
      filters: {
        testType: req.query.testType || 'all',
        isActive: req.query.isActive,
        search: req.query.search || '',
      },
      stats,
      testTypes,
      currentUrl: req.originalUrl,
    });
  } catch (error) {
    console.error('Error fetching brilliant students:', error);
    req.flash('error', 'Failed to fetch brilliant students');
    res.redirect('/admin/dashboard');
  }
};

// Get brilliant student details (for modal editing)
const getBrilliantStudentDetails = async (req, res) => {
  try {
    const studentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.json({ success: false, message: 'Invalid student ID' });
    }

    const student = await BrilliantStudent.findById(studentId);

    if (!student) {
      return res.json({
        success: false,
        message: 'Brilliant student not found',
      });
    }

    res.json({
      success: true,
      data: {
        _id: student._id,
        name: student.name,
        testType: student.testType,
        score: student.score,
        maxScore: student.maxScore,
        percentage: student.percentage,
        image: student.image,
        fallbackInitials: student.fallbackInitials,
        isActive: student.isActive,
        displayOrder: student.displayOrder,
      },
    });
  } catch (error) {
    console.error('Error fetching brilliant student details:', error);
    res.json({
      success: false,
      message: 'Failed to fetch brilliant student details',
    });
  }
};

// Create new brilliant student
const createBrilliantStudent = async (req, res) => {
  try {
    const {
      name,
      testType,
      score,
      maxScore,
      image,
      fallbackInitials,
      isActive,
      displayOrder,
    } = req.body;

    console.log('Received data:', req.body);

    // Validate required fields
    if (!name || !testType || !score || !fallbackInitials) {
      return res.status(400).json({
        success: false,
        message:
          'Please fill in all required fields (name, test type, score, fallback initials)',
        field: !name
          ? 'name'
          : !testType
          ? 'testType'
          : !score
          ? 'score'
          : 'fallbackInitials',
      });
    }

    // Set maxScore based on test type if not provided
    let finalMaxScore = parseInt(maxScore);
    if (!finalMaxScore || isNaN(finalMaxScore)) {
      switch (testType) {
        case 'EST':
          finalMaxScore = 800;
          break;
        case 'DSAT':
          finalMaxScore = 1600;
          break;
        case 'ACT':
          finalMaxScore = 36;
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid test type. Must be EST, DSAT, or ACT',
          });
      }
    }

    const finalScore = parseInt(score);
    if (isNaN(finalScore)) {
      return res.status(400).json({
        success: false,
        message: 'Score must be a valid number',
      });
    }

    // Validate score ranges
    if (
      testType === 'EST' &&
      (finalScore < 0 || finalScore > 800 || finalMaxScore !== 800)
    ) {
      return res.status(400).json({
        success: false,
        message: 'EST scores must be between 0-800',
        maxAllowed: 800,
      });
    } else if (
      testType === 'DSAT' &&
      (finalScore < 0 || finalScore > 1600 || finalMaxScore !== 1600)
    ) {
      return res.status(400).json({
        success: false,
        message: 'DSAT scores must be between 0-1600',
        maxAllowed: 1600,
      });
    } else if (
      testType === 'ACT' &&
      (finalScore < 0 || finalScore > 36 || finalMaxScore !== 36)
    ) {
      return res.status(400).json({
        success: false,
        message: 'ACT scores must be between 0-36',
        maxAllowed: 36,
      });
    }

    const studentData = {
      name: name.trim(),
      testType,
      score: finalScore,
      maxScore: finalMaxScore,
      fallbackInitials: fallbackInitials.trim().toUpperCase(),
      isActive: isActive === 'true' || isActive === true,
      displayOrder: parseInt(displayOrder) || 0,
      image: image || null,
    };

    console.log('Creating student with data:', studentData);

    const student = new BrilliantStudent(studentData);
    await student.save();

    console.log('Student created successfully:', student._id);

    return res.status(201).json({
      success: true,
      message: 'Brilliant student created successfully',
      data: {
        id: student._id,
        name: student.name,
        testType: student.testType,
        score: student.score,
        maxScore: student.maxScore,
        percentage: student.percentage,
      },
    });
  } catch (error) {
    console.error('Error creating brilliant student:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create brilliant student',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Internal server error',
    });
  }
};

// Update brilliant student
const updateBrilliantStudent = async (req, res) => {
  try {
    const studentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID',
      });
    }

    const {
      name,
      testType,
      score,
      maxScore,
      image,
      fallbackInitials,
      isActive,
      displayOrder,
    } = req.body;

    console.log('Updating student:', studentId, 'with data:', req.body);

    // Validate required fields
    if (!name || !testType || !score || !fallbackInitials) {
      return res.status(400).json({
        success: false,
        message:
          'Please fill in all required fields (name, test type, score, fallback initials)',
        field: !name
          ? 'name'
          : !testType
          ? 'testType'
          : !score
          ? 'score'
          : 'fallbackInitials',
      });
    }

    // Set maxScore based on test type if not provided
    let finalMaxScore = parseInt(maxScore);
    if (!finalMaxScore || isNaN(finalMaxScore)) {
      switch (testType) {
        case 'EST':
          finalMaxScore = 800;
          break;
        case 'DSAT':
          finalMaxScore = 1600;
          break;
        case 'ACT':
          finalMaxScore = 36;
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid test type. Must be EST, DSAT, or ACT',
          });
      }
    }

    const finalScore = parseInt(score);
    if (isNaN(finalScore)) {
      return res.status(400).json({
        success: false,
        message: 'Score must be a valid number',
      });
    }

    // Validate score ranges
    if (
      testType === 'EST' &&
      (finalScore < 0 || finalScore > 800 || finalMaxScore !== 800)
    ) {
      return res.status(400).json({
        success: false,
        message: 'EST scores must be between 0-800',
        maxAllowed: 800,
      });
    } else if (
      testType === 'DSAT' &&
      (finalScore < 0 || finalScore > 1600 || finalMaxScore !== 1600)
    ) {
      return res.status(400).json({
        success: false,
        message: 'DSAT scores must be between 0-1600',
        maxAllowed: 1600,
      });
    } else if (
      testType === 'ACT' &&
      (finalScore < 0 || finalScore > 36 || finalMaxScore !== 36)
    ) {
      return res.status(400).json({
        success: false,
        message: 'ACT scores must be between 0-36',
        maxAllowed: 36,
      });
    }

    const updateData = {
      name: name.trim(),
      testType,
      score: finalScore,
      maxScore: finalMaxScore,
      fallbackInitials: fallbackInitials.trim().toUpperCase(),
      isActive: isActive === 'true' || isActive === true,
      displayOrder: parseInt(displayOrder) || 0,
    };

    // Add image if provided
    if (image && image.trim()) {
      updateData.image = image.trim();
    } else {
      updateData.image = null;
    }

    console.log('Updating student with data:', updateData);

    const student = await BrilliantStudent.findByIdAndUpdate(
      studentId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Brilliant student not found',
      });
    }

    console.log('Student updated successfully:', student._id);

    return res.status(200).json({
      success: true,
      message: 'Brilliant student updated successfully',
      data: {
        id: student._id,
        name: student.name,
        testType: student.testType,
        score: student.score,
        maxScore: student.maxScore,
        percentage: student.percentage,
      },
    });
  } catch (error) {
    console.error('Error updating brilliant student:', error);

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update brilliant student',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Internal server error',
    });
  }
};

// Delete brilliant student
const deleteBrilliantStudent = async (req, res) => {
  try {
    const studentId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.json({ success: false, message: 'Invalid student ID' });
    }

    const student = await BrilliantStudent.findByIdAndDelete(studentId);

    if (!student) {
      return res.json({
        success: false,
        message: 'Brilliant student not found',
      });
    }

    res.json({
      success: true,
      message: 'Brilliant student deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting brilliant student:', error);
    res.json({ success: false, message: 'Failed to delete brilliant student' });
  }
};

// Reorder brilliant students
const reorderBrilliantStudents = async (req, res) => {
  try {
    const { students } = req.body;

    if (!Array.isArray(students)) {
      return res.json({ success: false, message: 'Invalid students data' });
    }

    const updatePromises = students.map((student, index) => {
      return BrilliantStudent.findByIdAndUpdate(
        student.id,
        { displayOrder: index + 1 },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    res.json({ success: true, message: 'Students reordered successfully' });
  } catch (error) {
    console.error('Error reordering brilliant students:', error);
    res.json({ success: false, message: 'Failed to reorder students' });
  }
};

// Get brilliant students statistics
const getBrilliantStudentsStats = async (req, res) => {
  try {
    const stats = await BrilliantStudent.getStatistics();
    const totalStudents = await BrilliantStudent.countDocuments();
    const activeStudents = await BrilliantStudent.countDocuments({
      isActive: true,
    });

    res.json({
      success: true,
      stats: {
        total: totalStudents,
        active: activeStudents,
        inactive: totalStudents - activeStudents,
        byTestType: stats,
      },
    });
  } catch (error) {
    console.error('Error fetching brilliant students statistics:', error);
    res.json({ success: false, message: 'Failed to fetch statistics' });
  }
};

// Export brilliant students data
const exportBrilliantStudents = async (req, res) => {
  try {
    const testType = req.query.testType;
    const isActive = req.query.isActive;

    const filter = {};
    if (testType && testType !== 'all') {
      filter.testType = testType;
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const students = await BrilliantStudent.find(filter).sort({
      testType: 1,
      displayOrder: 1,
      percentage: -1,
    });

    const exporter = new ExcelExporter();
    const workbook = await exporter.exportBrilliantStudents(students);
    const buffer = await workbook.xlsx.writeBuffer();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `brilliant-students-report-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting brilliant students:', error);
    req.flash('error', 'Failed to export brilliant students data');
    res.redirect('/admin/brilliant-students');
  }
};

// Export courses data
const exportCourses = async (req, res) => {
  try {
    const courses = await Course.find({})
      .populate('enrolledStudents', 'studentCode firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    // Add enrolled students count to each course
    const coursesWithStats = courses.map((course) => ({
      ...course,
      enrolledStudents: course.enrolledStudents?.length || 0,
    }));

    const exporter = new ExcelExporter();
    const workbook = await exporter.exportCourses(coursesWithStats);
    const buffer = await workbook.xlsx.writeBuffer();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `courses-report-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting courses:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Export orders data
const exportOrders = async (req, res) => {
  try {
    const orders = await Purchase.find({})
      .populate('student', 'studentCode firstName lastName studentEmail')
      .sort({ createdAt: -1 })
      .lean();

    // Format orders data for export
    const formattedOrders = orders.map((order) => ({
      orderNumber: order.orderNumber,
      studentName: order.student
        ? `${order.student.firstName} ${order.student.lastName}`
        : 'Unknown',
      studentEmail: order.student?.studentEmail || '',
      items: order.items?.map((item) => item.title).join(', ') || '',
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod || '',
      status: order.status,
      createdAt: order.createdAt,
      processedAt: order.processedAt || order.createdAt,
    }));

    const exporter = new ExcelExporter();
    const workbook = await exporter.exportOrders(formattedOrders);
    const buffer = await workbook.xlsx.writeBuffer();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `orders-report-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting orders:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Export quizzes data
const exportQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({})
      .populate('questions')
      .sort({ createdAt: -1 })
      .lean();

    const exporter = new ExcelExporter();
    const workbook = await exporter.exportQuizzes(quizzes);
    const buffer = await workbook.xlsx.writeBuffer();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `quizzes-report-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting quizzes:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Export comprehensive admin report
const exportComprehensiveReport = async (req, res) => {
  try {
    const exporter = new ExcelExporter();

    // Get all data
    const [students, courses, orders, quizzes, brilliantStudents] =
      await Promise.all([
        User.find({ role: 'student' }).select('-password').lean(),
        Course.find({}).lean(),
        Purchase.find({})
          .populate('student', 'studentCode firstName lastName studentEmail')
          .lean(),
        Quiz.find({}).populate('questions').lean(),
        BrilliantStudent.find({}).lean(),
      ]);

    // Create comprehensive report with multiple sheets
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Elkably E-Learning System';
    workbook.lastModifiedBy = 'Admin';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Dashboard Summary Sheet
    const summarySheet = workbook.addWorksheet('Dashboard Summary');
    summarySheet.mergeCells('A1:D1');
    summarySheet.getCell('A1').value =
      'Elkably E-Learning System - Comprehensive Report';
    summarySheet.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };
    summarySheet.getRow(1).height = 30;

    summarySheet.getCell('A3').value = 'Report Generated:';
    summarySheet.getCell('B3').value = new Date().toLocaleString();
    summarySheet.getCell('A4').value = 'Total Students:';
    summarySheet.getCell('B4').value = students.length;
    summarySheet.getCell('A5').value = 'Total Courses:';
    summarySheet.getCell('B5').value = courses.length;
    summarySheet.getCell('A6').value = 'Total Orders:';
    summarySheet.getCell('B6').value = orders.length;
    summarySheet.getCell('A7').value = 'Total Quizzes:';
    summarySheet.getCell('B7').value = quizzes.length;
    summarySheet.getCell('A8').value = 'Brilliant Students:';
    summarySheet.getCell('B8').value = brilliantStudents.length;

    // Auto-fit columns
    summarySheet.getColumn('A').width = 20;
    summarySheet.getColumn('B').width = 25;

    // Export individual sheets using the exporter
    await exporter.exportStudents(students, false);
    await exporter.exportCourses(courses);
    await exporter.exportOrders(
      orders.map((order) => ({
        orderNumber: order.orderNumber,
        studentName: order.student
          ? `${order.student.firstName} ${order.student.lastName}`
          : 'Unknown',
        studentEmail: order.student?.studentEmail || '',
        items: order.items?.map((item) => item.title).join(', ') || '',
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod || '',
        status: order.status,
        createdAt: order.createdAt,
        processedAt: order.processedAt || order.createdAt,
      }))
    );
    await exporter.exportQuizzes(quizzes);
    await exporter.exportBrilliantStudents(brilliantStudents);

    const buffer = await workbook.xlsx.writeBuffer();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `comprehensive-admin-report-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting comprehensive report:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Export course details with all analytics
const exportCourseDetails = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Get course data
    const course = await Course.findById(courseId).populate('topics').lean();

    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: 'Course not found' });
    }

    // Get enrolled students
    const enrolledStudents = await User.find({
      'enrolledCourses.course': courseId,
      role: 'student',
    })
      .select('-password')
      .lean();

    // Get progress data for all students in this course
    const progressData = await Progress.find({
      course: courseId,
    })
      .populate('user', 'firstName lastName studentCode email grade schoolName')
      .populate('topic', 'title order')
      .lean();

    // Calculate analytics similar to getCourseDetails
    const analytics = {
      totalEnrolled: enrolledStudents.length,
      averageProgress: 0,
      completionRate: 0,
      contentCompletionRate: 0,
    };

    if (enrolledStudents.length > 0) {
      const progressSum = enrolledStudents.reduce((sum, student) => {
        const enrollment = student.enrolledCourses.find(
          (e) => e.course && e.course.toString() === courseId.toString()
        );
        return sum + (enrollment?.progress || 0);
      }, 0);
      analytics.averageProgress = Math.round(
        progressSum / enrolledStudents.length
      );

      const completedStudents = enrolledStudents.filter((student) => {
        const enrollment = student.enrolledCourses.find(
          (e) => e.course && e.course.toString() === courseId.toString()
        );
        return (enrollment?.progress || 0) >= 100;
      }).length;
      analytics.completionRate = Math.round(
        (completedStudents / enrolledStudents.length) * 100
      );
    }

    // Process students data
    const studentsData = enrolledStudents.map((student) => {
      const enrollment = student.enrolledCourses.find(
        (e) => e.course && e.course.toString() === courseId.toString()
      );

      const studentProgress = progressData.filter(
        (p) => p.user && p.user._id.toString() === student._id.toString()
      );

      return {
        name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
        studentCode: student.studentCode || '',
        email: student.email || '',
        grade: student.grade || '',
        schoolName: student.schoolName || '',
        progress: enrollment?.progress || 0,
        status:
          (enrollment?.progress || 0) >= 100
            ? 'completed'
            : (enrollment?.progress || 0) > 0
            ? 'in-progress'
            : 'not-started',
        enrolledAt: enrollment?.enrollmentDate || enrollment?.enrolledAt,
        lastAccessed: enrollment?.lastAccessed,
        timeSpent: studentProgress.reduce(
          (sum, p) => sum + (p.timeSpent || 0),
          0
        ),
        activitiesCompleted: studentProgress.filter(
          (p) => p.status === 'completed'
        ).length,
        totalActivities: studentProgress.length,
      };
    });

    // Process topics analytics
    const topicsAnalytics = await Promise.all(
      (course.topics || []).map(async (topic) => {
        const topicProgress = progressData.filter(
          (p) => p.topic && p.topic._id.toString() === topic._id.toString()
        );

        const contentAnalytics = (topic.content || []).map((content) => {
          const contentProgress = topicProgress.filter(
            (p) =>
              p.contentId && p.contentId.toString() === content._id.toString()
          );

          const viewers = new Set(
            contentProgress.map((p) => p.user._id.toString())
          ).size;
          const completions = contentProgress.filter(
            (p) => p.status === 'completed'
          ).length;
          const totalTimeSpent = contentProgress.reduce(
            (sum, p) => sum + (p.timeSpent || 0),
            0
          );
          const attempts = contentProgress.reduce(
            (sum, p) => sum + (p.attempts || 0),
            0
          );

          // Calculate average score for quiz/homework content
          let averageScore = null;
          let passRate = null;
          if (
            content.contentType === 'quiz' ||
            content.contentType === 'homework'
          ) {
            const scores = contentProgress
              .map((p) => p.score)
              .filter((s) => s != null);
            if (scores.length > 0) {
              averageScore = Math.round(
                scores.reduce((sum, score) => sum + score, 0) / scores.length
              );
              const passingScore = content.quizSettings?.passingScore || 60;
              passRate = Math.round(
                (scores.filter((s) => s >= passingScore).length /
                  scores.length) *
                  100
              );
            }
          }

          return {
            _id: content._id,
            title: content.title || 'Untitled Content',
            order: content.order || 0,
            type: content.contentType || 'unknown',
            viewers,
            completions,
            averageTimeSpent:
              totalTimeSpent > 0
                ? Math.round(totalTimeSpent / Math.max(viewers, 1))
                : 0,
            attempts,
            averageScore,
            passRate,
            totalQuestions: content.selectedQuestions?.length || 0,
          };
        });

        return {
          _id: topic._id,
          title: topic.title,
          order: topic.order,
          contentCount: (topic.content || []).length,
          contents: contentAnalytics,
          totals: {
            viewers: new Set(topicProgress.map((p) => p.user._id.toString()))
              .size,
            completions: topicProgress.filter((p) => p.status === 'completed')
              .length,
          },
        };
      })
    );

    // Create comprehensive Excel export
    const exporter = new ExcelExporter();
    const workbook = await exporter.createCourseDetailsReport({
      course,
      analytics,
      students: studentsData,
      topicsAnalytics,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `course-${course.courseCode}-details-${timestamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    console.error('Error exporting course details:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Export topic details to Excel
const exportTopicDetails = async (req, res) => {
  try {
    const { courseCode, topicId } = req.params;

    // Find course and topic
    const course = await Course.findOne({ courseCode }).lean();
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: 'Course not found' });
    }

    const topic = await Topic.findById(topicId).lean();
    if (!topic || topic.courseId.toString() !== course._id.toString()) {
      return res
        .status(404)
        .json({ success: false, message: 'Topic not found' });
    }

    // Get enrolled students
    const enrolledStudents = await User.find({
      role: 'student',
      enrolledCourses: course._id,
    }).lean();

    // Get progress data for all students in this topic
    const progressData = await Progress.find({
      courseId: course._id,
      topicId: topic._id,
    }).lean();

    // Create progress map for quick lookup
    const progressMap = new Map();
    progressData.forEach((progress) => {
      const key = progress.studentId.toString();
      if (!progressMap.has(key)) {
        progressMap.set(key, []);
      }
      progressMap.get(key).push(progress);
    });

    // Calculate analytics for each student
    const studentsAnalytics = enrolledStudents.map((student) => {
      const studentProgress = progressMap.get(student._id.toString()) || [];

      // Calculate overall topic progress
      const totalContentItems = topic.content ? topic.content.length : 0;
      const completedItems = studentProgress.filter(
        (p) => p.status === 'completed'
      ).length;
      const progressPercentage =
        totalContentItems > 0
          ? Math.round((completedItems / totalContentItems) * 100)
          : 0;

      // Calculate total time spent
      const totalTimeSpent = studentProgress.reduce(
        (sum, p) => sum + (p.timeSpent || 0),
        0
      );

      // Find last activity
      const lastActivity =
        studentProgress.length > 0
          ? Math.max(
              ...studentProgress.map((p) => new Date(p.updatedAt).getTime())
            )
          : null;

      // Determine status
      let status = 'not-started';
      if (completedItems === totalContentItems && totalContentItems > 0) {
        status = 'completed';
      } else if (completedItems > 0) {
        status = 'in-progress';
      }

      return {
        name: student.name || 'N/A',
        email: student.email || 'N/A',
        studentCode: student.studentCode || 'N/A',
        parentPhone: student.parentPhone || 'N/A',
        studentPhone: student.studentPhone || 'N/A',
        grade: student.grade || 'N/A',
        schoolName: student.schoolName || 'N/A',
        progress: progressPercentage,
        status: status,
        totalTimeSpent: Math.round(totalTimeSpent / 60), // Convert to minutes
        lastActivity: lastActivity ? new Date(lastActivity) : null,
        completedItems: completedItems,
        totalItems: totalContentItems,
      };
    });

    // Calculate topic analytics
    const topicAnalytics = {
      totalStudents: enrolledStudents.length,
      viewedStudents: studentsAnalytics.filter((s) => s.progress > 0).length,
      completedStudents: studentsAnalytics.filter(
        (s) => s.status === 'completed'
      ).length,
      averageProgress:
        studentsAnalytics.length > 0
          ? Math.round(
              studentsAnalytics.reduce((sum, s) => sum + s.progress, 0) /
                studentsAnalytics.length
            )
          : 0,
      completionRate:
        enrolledStudents.length > 0
          ? Math.round(
              (studentsAnalytics.filter((s) => s.status === 'completed')
                .length /
                enrolledStudents.length) *
                100
            )
          : 0,
      averageTimeSpent:
        studentsAnalytics.length > 0
          ? Math.round(
              studentsAnalytics.reduce((sum, s) => sum + s.totalTimeSpent, 0) /
                studentsAnalytics.length
            )
          : 0,
      totalContentItems: topic.content ? topic.content.length : 0,
    };

    // Get content analytics
    const contentAnalytics = [];
    if (topic.content && topic.content.length > 0) {
      for (const content of topic.content) {
        // Get progress for this specific content
        const contentProgress = progressData.filter(
          (p) =>
            p.contentId && p.contentId.toString() === content._id.toString()
        );

        const viewers = new Set(
          contentProgress.map((p) => p.studentId.toString())
        ).size;
        const completions = contentProgress.filter(
          (p) => p.status === 'completed'
        ).length;
        const totalTimeSpent = contentProgress.reduce(
          (sum, p) => sum + (p.timeSpent || 0),
          0
        );
        const averageTimeSpent =
          viewers > 0 ? Math.round(totalTimeSpent / viewers / 60) : 0;

        // Quiz/Homework specific metrics
        let attempts = 0;
        let totalScore = 0;
        let scores = [];
        let passCount = 0;

        if (content.type === 'quiz' || content.type === 'homework') {
          contentProgress.forEach((p) => {
            if (p.quizAttempts && Array.isArray(p.quizAttempts)) {
              attempts += p.quizAttempts.length;
              p.quizAttempts.forEach((attempt) => {
                if (attempt.score !== undefined && attempt.score !== null) {
                  totalScore += attempt.score;
                  scores.push(attempt.score);
                  if (attempt.score >= 60) {
                    // Assuming 60% is pass
                    passCount++;
                  }
                }
              });
            }
          });
        }

        const averageScore =
          scores.length > 0 ? Math.round(totalScore / scores.length) : null;
        const passRate =
          attempts > 0 ? Math.round((passCount / attempts) * 100) : null;

        contentAnalytics.push({
          title: content.title || 'Untitled',
          type: content.type || 'unknown',
          viewers: viewers,
          completions: completions,
          completionRate:
            viewers > 0 ? Math.round((completions / viewers) * 100) : 0,
          averageTimeSpent: averageTimeSpent,
          attempts: attempts,
          averageScore: averageScore,
          passRate: passRate,
          totalQuestions: content.selectedQuestions
            ? content.selectedQuestions.length
            : 0,
        });
      }
    }

    // Create Excel export
    const excelExporter = new ExcelExporter();

    const exportData = {
      course: course,
      topic: topic,
      analytics: topicAnalytics,
      students: studentsAnalytics,
      contentAnalytics: contentAnalytics,
    };

    const workbook = await excelExporter.createTopicDetailsReport(exportData);

    // Set response headers for file download
    const filename = `topic-${topic.order}-${topic.title.replace(
      /[^a-zA-Z0-9]/g,
      '-'
    )}-details.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting topic details:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Export question bank details to Excel
const exportQuestionBankDetails = async (req, res) => {
  try {
    const { questionBankId } = req.params;

    // Find question bank with questions
    const questionBank = await QuestionBank.findById(questionBankId)
      .populate({
        path: 'questions',
        model: 'Question',
        options: { sort: { difficulty: 1, createdAt: 1 } },
      })
      .lean();

    if (!questionBank) {
      return res
        .status(404)
        .json({ success: false, message: 'Question bank not found' });
    }

    // Get all questions for this bank
    const questions = await Question.find({ bank: questionBankId })
      .sort({ difficulty: 1, createdAt: 1 })
      .lean();

    // Calculate statistics
    const stats = {
      totalQuestions: questions.length,
      easyQuestions: questions.filter((q) => q.difficulty === 'Easy').length,
      mediumQuestions: questions.filter((q) => q.difficulty === 'Medium')
        .length,
      hardQuestions: questions.filter((q) => q.difficulty === 'Hard').length,
      mcqQuestions: questions.filter((q) => q.questionType === 'MCQ').length,
      trueFalseQuestions: questions.filter(
        (q) => q.questionType === 'True/False'
      ).length,
      writtenQuestions: questions.filter((q) => q.questionType === 'Written')
        .length,
      draftQuestions: questions.filter((q) => q.status === 'draft').length,
      activeQuestions: questions.filter((q) => q.status === 'active').length,
      archivedQuestions: questions.filter((q) => q.status === 'archived')
        .length,
    };

    // Prepare question data for export
    const questionData = questions.map((question, index) => {
      let correctAnswer = '';
      let optionsText = '';

      if (question.questionType === 'Written') {
        correctAnswer =
          question.correctAnswers && question.correctAnswers.length > 0
            ? question.correctAnswers
                .map((ans) => {
                  const answerText =
                    typeof ans === 'string' ? ans : ans.text || '';
                  const isMandatory =
                    typeof ans === 'object' && ans.isMandatory !== undefined
                      ? ans.isMandatory
                      : true;
                  return `${answerText}${
                    isMandatory ? ' (Mandatory)' : ' (Optional)'
                  }`;
                })
                .join('; ')
            : 'N/A';
      } else if (question.options && question.options.length > 0) {
        optionsText = question.options
          .map(
            (opt, idx) =>
              `${String.fromCharCode(65 + idx)}. ${opt.text}${
                opt.isCorrect ? ' ✓' : ''
              }`
          )
          .join(' | ');

        const correctOption = question.options.find((opt) => opt.isCorrect);
        correctAnswer = correctOption ? correctOption.text : 'N/A';
      }

      return {
        number: index + 1,
        questionText: question.questionText || '',
        questionType: question.questionType || 'MCQ',
        difficulty: question.difficulty || 'Easy',
        options: optionsText,
        correctAnswer: correctAnswer,
        explanation: question.explanation || '',
        points: question.points || 1,
        tags:
          question.tags && question.tags.length > 0
            ? question.tags.join(', ')
            : '',
        status: question.status || 'draft',
        usageCount: question.usageCount || 0,
        averageScore: question.averageScore || 0,
        createdAt: question.createdAt
          ? new Date(question.createdAt).toLocaleDateString()
          : '',
      };
    });

    // Create Excel export
    const excelExporter = new ExcelExporter();

    const exportData = {
      questionBank: questionBank,
      stats: stats,
      questions: questionData,
    };

    const workbook = await excelExporter.createQuestionBankDetailsReport(
      exportData
    );

    // Set response headers for file download
    const filename = `questionbank-${
      questionBank.bankCode
    }-${questionBank.name.replace(/[^a-zA-Z0-9]/g, '-')}-questions.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting question bank details:', error);
    return res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// Export quiz details to Excel
const exportQuizDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Get quiz with all related data
    const quiz = await Quiz.findById(id)
      .populate({
        path: 'questionBank',
        select: 'name bankCode',
      })
      .populate({
        path: 'selectedQuestions.question',
        select:
          'questionText questionType difficulty options correctAnswers explanation tags points',
      })
      .populate('createdBy', 'firstName lastName')
      .populate('lastModifiedBy', 'firstName lastName')
      .lean();

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      });
    }

    // Get participants with their quiz attempts
    const participants = await User.find({
      'quizAttempts.quiz': quiz._id,
    })
      .select(
        'firstName lastName studentCode studentEmail grade quizAttempts createdAt'
      )
      .lean();

    // Process participant data
    const participantDetails = participants
      .map((participant) => {
        const quizAttempt = participant.quizAttempts.find(
          (attempt) => attempt.quiz.toString() === quiz._id.toString()
        );

        if (!quizAttempt) return null;

        const completedAttempts = quizAttempt.attempts.filter(
          (attempt) => attempt.status === 'completed'
        );

        const bestAttempt = completedAttempts.reduce(
          (best, current) => {
            return (current.score || 0) > (best.score || 0) ? current : best;
          },
          { score: 0 }
        );

        const totalAttempts = completedAttempts.length;
        const averageScore =
          completedAttempts.length > 0
            ? completedAttempts.reduce(
                (sum, attempt) => sum + (attempt.score || 0),
                0
              ) / completedAttempts.length
            : 0;

        const totalTimeSpent = completedAttempts.reduce(
          (sum, attempt) => sum + (attempt.timeSpent || 0),
          0
        );

        return {
          studentCode: participant.studentCode,
          firstName: participant.firstName,
          lastName: participant.lastName,
          email: participant.studentEmail,
          grade: participant.grade,
          enrollmentDate: participant.createdAt,
          totalAttempts,
          bestScore: bestAttempt.score || 0,
          averageScore: Math.round(averageScore * 100) / 100,
          totalTimeSpent,
          lastAttemptDate:
            completedAttempts.length > 0
              ? completedAttempts[completedAttempts.length - 1].completedAt
              : null,
          passed: (bestAttempt.score || 0) >= (quiz.passingScore || 60),
          attempts: completedAttempts.map((attempt) => ({
            attemptNumber: attempt.attemptNumber,
            score: attempt.score || 0,
            timeSpent: attempt.timeSpent || 0,
            startedAt: attempt.startedAt,
            completedAt: attempt.completedAt,
            correctAnswers: attempt.correctAnswers || 0,
            totalQuestions: attempt.totalQuestions || 0,
            passed: attempt.passed || false,
          })),
        };
      })
      .filter(Boolean);

    // Calculate quiz analytics
    const analytics = {
      totalParticipants: participantDetails.length,
      totalAttempts: participantDetails.reduce(
        (sum, p) => sum + p.totalAttempts,
        0
      ),
      averageScore:
        participantDetails.length > 0
          ? Math.round(
              (participantDetails.reduce((sum, p) => sum + p.bestScore, 0) /
                participantDetails.length) *
                100
            ) / 100
          : 0,
      passRate:
        participantDetails.length > 0
          ? Math.round(
              (participantDetails.filter((p) => p.passed).length /
                participantDetails.length) *
                100 *
                100
            ) / 100
          : 0,
      averageTimeSpent:
        participantDetails.length > 0
          ? Math.round(
              (participantDetails.reduce(
                (sum, p) => sum + p.totalTimeSpent,
                0
              ) /
                participantDetails.length) *
                100
            ) / 100
          : 0,
      scoreDistribution: {
        excellent: participantDetails.filter((p) => p.bestScore >= 90).length,
        good: participantDetails.filter(
          (p) => p.bestScore >= 70 && p.bestScore < 90
        ).length,
        average: participantDetails.filter(
          (p) => p.bestScore >= 50 && p.bestScore < 70
        ).length,
        poor: participantDetails.filter((p) => p.bestScore < 50).length,
      },
    };

    // Question analysis
    const questionAnalysis = quiz.selectedQuestions.map((sq, index) => {
      const question = sq.question;

      // Analyze question performance across all attempts
      let correctCount = 0;
      let totalAnswers = 0;

      participantDetails.forEach((participant) => {
        participant.attempts.forEach((attempt) => {
          // Check if attempt has answers and they're in array format
          if (attempt.answers && Array.isArray(attempt.answers)) {
            const questionAnswer = attempt.answers.find(
              (ans) =>
                ans.questionId &&
                ans.questionId.toString() === question._id.toString()
            );
            if (questionAnswer) {
              totalAnswers++;
              if (questionAnswer.isCorrect) {
                correctCount++;
              }
            }
          }
        });
      });

      return {
        questionNumber: index + 1,
        questionText: question.questionText || '',
        questionType: question.questionType || 'MCQ',
        difficulty: question.difficulty || 'Easy',
        points: sq.points || 1,
        totalAnswers,
        correctAnswers: correctCount,
        accuracyRate:
          totalAnswers > 0
            ? Math.round((correctCount / totalAnswers) * 100 * 100) / 100
            : 0,
        tags: question.tags ? question.tags.join(', ') : '',
      };
    });

    // Prepare data for Excel export
    const data = {
      quiz: {
        title: quiz.title,
        description: quiz.description,
        code: quiz.code,
        questionBank: quiz.questionBank ? quiz.questionBank.name : 'Unknown',
        questionBankCode: quiz.questionBank
          ? quiz.questionBank.bankCode
          : 'N/A',
        duration: quiz.duration,
        testType: quiz.testType,
        difficulty: quiz.difficulty,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        status: quiz.status,
        totalQuestions: quiz.selectedQuestions.length,
        totalPoints: quiz.selectedQuestions.reduce(
          (sum, sq) => sum + (sq.points || 1),
          0
        ),
        createdBy: quiz.createdBy
          ? `${quiz.createdBy.firstName} ${quiz.createdBy.lastName}`
          : 'Unknown',
        createdAt: quiz.createdAt,
        lastModified: quiz.updatedAt,
        tags: quiz.tags ? quiz.tags.join(', ') : '',
        instructions: quiz.instructions || '',
        shuffleQuestions: quiz.shuffleQuestions || false,
        shuffleOptions: quiz.shuffleOptions || false,
        showCorrectAnswers: quiz.showCorrectAnswers !== false,
        showResults: quiz.showResults !== false,
      },
      analytics,
      participants: participantDetails,
      questions: questionAnalysis,
      selectedQuestions: quiz.selectedQuestions.map((sq, index) => {
        const question = sq.question;
        let optionsText = '';
        let correctAnswerText = '';

        if (question.questionType === 'Written') {
          correctAnswerText =
            question.correctAnswers && question.correctAnswers.length > 0
              ? question.correctAnswers
                  .map((ans) => {
                    if (typeof ans === 'string') return ans;
                    return `${ans.text || ''}${
                      ans.isMandatory !== false ? ' (Mandatory)' : ' (Optional)'
                    }`;
                  })
                  .join('; ')
              : 'N/A';
        } else if (question.options && question.options.length > 0) {
          optionsText = question.options
            .map(
              (opt, idx) =>
                `${String.fromCharCode(65 + idx)}. ${opt.text}${
                  opt.isCorrect ? ' ✓' : ''
                }`
            )
            .join(' | ');

          const correctOption = question.options.find((opt) => opt.isCorrect);
          correctAnswerText = correctOption ? correctOption.text : 'N/A';
        }

        return {
          order: sq.order || index + 1,
          points: sq.points || 1,
          questionText: question.questionText || '',
          questionType: question.questionType || 'MCQ',
          difficulty: question.difficulty || 'Easy',
          options: optionsText,
          correctAnswer: correctAnswerText,
          explanation: question.explanation || '',
          tags: question.tags ? question.tags.join(', ') : '',
        };
      }),
    };

    // Create Excel exporter and generate report
    const exporter = new ExcelExporter();
    const workbook = await exporter.createQuizDetailsReport(data);

    // Generate buffer and send
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `Quiz_${quiz.code}_Details_${
      new Date().toISOString().split('T')[0]
    }.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Export quiz details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export quiz details',
      error: error.message,
    });
  }
};

// Additional helper functions for comprehensive analytics

// Calculate activity streak from timeline
const calculateActivityStreak = (activityTimeline) => {
  if (!activityTimeline || activityTimeline.length === 0) return 0;

  const sortedActivities = activityTimeline.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  const today = new Date();
  let streak = 0;
  let currentDate = new Date(today);

  for (let i = 0; i < 30; i++) {
    // Check last 30 days
    const dayActivities = sortedActivities.filter((activity) => {
      const activityDate = new Date(activity.timestamp);
      return activityDate.toDateString() === currentDate.toDateString();
    });

    if (dayActivities.length > 0) {
      streak++;
    } else if (streak > 0) {
      break; // Streak broken
    }

    currentDate.setDate(currentDate.getDate() - 1);
  }

  return streak;
};

// Calculate content interaction rate
const calculateContentInteractionRate = (student, progressData) => {
  if (!student.enrolledCourses || student.enrolledCourses.length === 0)
    return 0;

  const totalCourses = student.enrolledCourses.length;
  const coursesWithProgress = progressData
    ? new Set(
        progressData.map((p) => p.course?._id || p.course).filter(Boolean)
      ).size
    : 0;

  return totalCourses > 0
    ? Math.round((coursesWithProgress / totalCourses) * 100)
    : 0;
};

// Calculate quiz participation rate
const calculateQuizParticipationRate = (student) => {
  if (!student.quizAttempts || student.quizAttempts.length === 0) return 0;

  // This would need quiz availability data to be accurate
  // For now, we'll use a simplified calculation
  const totalAttempts = student.quizAttempts.reduce(
    (sum, qa) => sum + (qa.attempts?.length || 0),
    0
  );
  const uniqueQuizzes = student.quizAttempts.length;

  return uniqueQuizzes > 0
    ? Math.min(100, Math.round((totalAttempts / uniqueQuizzes) * 20))
    : 0;
};

// Calculate weekly activity pattern
const calculateWeeklyPattern = (activityTimeline) => {
  const pattern = {
    Monday: {
      logins: 0,
      timeSpent: 0,
      activities: 0,
      avgScore: 0,
      engagement: 0,
    },
    Tuesday: {
      logins: 0,
      timeSpent: 0,
      activities: 0,
      avgScore: 0,
      engagement: 0,
    },
    Wednesday: {
      logins: 0,
      timeSpent: 0,
      activities: 0,
      avgScore: 0,
      engagement: 0,
    },
    Thursday: {
      logins: 0,
      timeSpent: 0,
      activities: 0,
      avgScore: 0,
      engagement: 0,
    },
    Friday: {
      logins: 0,
      timeSpent: 0,
      activities: 0,
      avgScore: 0,
      engagement: 0,
    },
    Saturday: {
      logins: 0,
      timeSpent: 0,
      activities: 0,
      avgScore: 0,
      engagement: 0,
    },
    Sunday: {
      logins: 0,
      timeSpent: 0,
      activities: 0,
      avgScore: 0,
      engagement: 0,
    },
  };

  const weekDays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  if (!activityTimeline || activityTimeline.length === 0) return pattern;

  activityTimeline.forEach((activity) => {
    const date = new Date(activity.timestamp);
    const dayName = weekDays[date.getDay()];

    if (pattern[dayName]) {
      if (activity.activityType === 'Login') {
        pattern[dayName].logins++;
      }
      pattern[dayName].timeSpent += activity.duration || 0;
      pattern[dayName].activities++;

      if (activity.scoreOrProgress && activity.scoreOrProgress.includes('/')) {
        const score = parseInt(activity.scoreOrProgress.split('/')[0]);
        if (!isNaN(score)) {
          pattern[dayName].avgScore = Math.round(
            (pattern[dayName].avgScore + score) / 2
          );
        }
      }
    }
  });

  // Calculate engagement based on activity
  Object.keys(pattern).forEach((day) => {
    const dayData = pattern[day];
    let engagement = 0;
    if (dayData.logins > 0) engagement += 30;
    if (dayData.timeSpent > 1800) engagement += 40; // More than 30 minutes
    if (dayData.activities > 5) engagement += 30;
    pattern[day].engagement = Math.min(100, engagement);
  });

  return pattern;
};

// Admin Management Functions
const getCreateAdminForm = async (req, res) => {
  try {
    res.render('admin/create-admin-panel', {
      title: 'Create New Admin',
      currentPage: 'create-admin',
      theme: req.cookies.theme || 'light',
      user: req.user,
    });
  } catch (error) {
    console.error('Error loading create admin form:', error);
    req.flash('error', 'Failed to load create admin form');
    res.redirect('/admin/dashboard');
  }
};

const createNewAdmin = async (req, res) => {
  try {
    const { userName, phoneNumber, email, password } = req.body;

    // Basic validation
    if (!userName || !phoneNumber || !password) {
      req.flash('error', 'Username, phone number, and password are required');
      return res.render('admin/create-admin-panel', {
        title: 'Create New Admin',
        currentPage: 'create-admin',
        theme: req.cookies.theme || 'light',
        user: req.user,
        errors: ['Username, phone number, and password are required'],
        userName,
        phoneNumber,
        email,
      });
    }

    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters long');
      return res.render('admin/create-admin-panel', {
        title: 'Create New Admin',
        currentPage: 'create-admin',
        theme: req.cookies.theme || 'light',
        user: req.user,
        errors: ['Password must be at least 6 characters long'],
        userName,
        phoneNumber,
        email,
      });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [
        { userName: userName },
        { phoneNumber: phoneNumber },
        ...(email ? [{ email: email }] : []),
      ],
    });

    if (existingAdmin) {
      return res.render('admin/create-admin-panel', {
        title: 'Create New Admin',
        currentPage: 'create-admin',
        theme: req.cookies.theme || 'light',
        user: req.user,
        errors: [
          'Admin with this username, phone number, or email already exists',
        ],
        userName,
        phoneNumber,
        email,
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const newAdmin = new Admin({
      userName,
      phoneNumber,
      email: email || undefined,
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      createdBy: req.user._id,
      createdAt: new Date(),
    });

    await newAdmin.save();

    return res.render('admin/create-admin-panel', {
      title: 'Create New Admin',
      currentPage: 'create-admin',
      theme: req.cookies.theme || 'light',
      user: req.user,
      success: `Admin account for ${userName} created successfully!`,
    });
  } catch (error) {
    console.error('Error creating admin:', error);
    return res.render('admin/create-admin-panel', {
      title: 'Create New Admin',
      currentPage: 'create-admin',
      theme: req.cookies.theme || 'light',
      user: req.user,
      errors: ['Failed to create admin account: ' + error.message],
      userName: req.body.userName,
      phoneNumber: req.body.phoneNumber,
      email: req.body.email,
    });
  }
};

// ==================== ZOOM MEETING MANAGEMENT ====================

/**
 * Create Zoom meeting content for a topic
 */
const createZoomMeeting = async (req, res) => {
  try {
    const { courseCode } = req.params;
    const { topicId } = req.params;
    const {
      meetingName,
      meetingTopic,
      scheduledStartTime,
      duration,
      timezone,
      password,
      joinBeforeHost,
      waitingRoom,
      muteUponEntry,
      hostVideo,
      participantVideo,
      enableRecording,
      autoRecording,
    } = req.body;

    console.log('Creating Zoom meeting for topic:', topicId);

    // Find course and topic
    const course = await Course.findOne({ courseCode });
    const topic = await Topic.findById(topicId);

    if (!course || !topic) {
      return res.status(404).json({
        success: false,
        message: 'Course or topic not found',
      });
    }

    // Create meeting on Zoom
    const zoomMeetingData = await zoomService.createMeeting({
      topic: meetingTopic || meetingName,
      scheduledStartTime: new Date(scheduledStartTime),
      duration: parseInt(duration) || 60,
      timezone: timezone || 'UTC',
      password: password,
      settings: {
        joinBeforeHost: joinBeforeHost === 'true' || joinBeforeHost === true,
        waitingRoom: waitingRoom === 'true' || waitingRoom === true,
        muteUponEntry: muteUponEntry === 'true' || muteUponEntry === true,
        hostVideo: hostVideo === 'true' || hostVideo === true,
        participantVideo:
          participantVideo === 'true' || participantVideo === true,
        recording: enableRecording === 'true' || enableRecording === true,
        autoRecording: autoRecording || 'none',
      },
    });

    // Save Zoom meeting to database
    const zoomMeeting = new ZoomMeeting({
      meetingName: meetingName,
      meetingTopic: zoomMeetingData.meetingTopic,
      meetingId: zoomMeetingData.meetingId,
      topic: topicId,
      course: course._id,
      hostId: zoomMeetingData.hostId,
      createdBy: req.session.user.id,
      scheduledStartTime: new Date(scheduledStartTime),
      duration: parseInt(duration) || 60,
      timezone: timezone || 'UTC',
      joinUrl: zoomMeetingData.joinUrl,
      startUrl: zoomMeetingData.startUrl,
      password: zoomMeetingData.password,
      settings: {
        joinBeforeHost: joinBeforeHost === 'true' || joinBeforeHost === true,
        waitingRoom: waitingRoom === 'true' || waitingRoom === true,
        muteUponEntry: muteUponEntry === 'true' || muteUponEntry === true,
        hostVideo: hostVideo === 'true' || hostVideo === true,
        participantVideo:
          participantVideo === 'true' || participantVideo === true,
        recording: enableRecording === 'true' || enableRecording === true,
        autoRecording: autoRecording || 'none',
      },
    });

    await zoomMeeting.save();

    // Add content item to topic
    const contentItem = {
      type: 'zoom',
      title: meetingName,
      description: `Live Zoom session scheduled for ${new Date(
        scheduledStartTime
      ).toLocaleString()}`,
      zoomMeeting: zoomMeeting._id,
      duration: parseInt(duration) || 60,
      order: topic.content.length + 1,
    };

    topic.content.push(contentItem);
    await topic.save();

    console.log('✅ Zoom meeting created successfully');

    res.json({
      success: true,
      message: 'Zoom meeting created successfully',
      zoomMeeting: zoomMeeting,
      contentItem: contentItem,
    });
  } catch (error) {
    console.error('❌ Error creating Zoom meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create Zoom meeting',
    });
  }
};

/**
 * Start a Zoom meeting (unlock it for students)
 * Only accessible by admin users via protected routes
 */
const startZoomMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;

    // Double-check admin permissions (additional safety)
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required to start meetings.',
      });
    }

    console.log(
      `Admin ${req.session.user.id} starting Zoom meeting:`,
      meetingId
    );

    const zoomMeeting = await ZoomMeeting.findById(meetingId);

    if (!zoomMeeting) {
      return res.status(404).json({
        success: false,
        message: 'Zoom meeting not found',
      });
    }

    // Update meeting status to active
    await zoomMeeting.startMeeting();

    console.log('✅ Zoom meeting started successfully by admin');

    res.json({
      success: true,
      message: 'Zoom meeting started and unlocked for students',
      startUrl: zoomMeeting.startUrl,
      zoomMeeting: zoomMeeting,
    });
  } catch (error) {
    console.error('❌ Error starting Zoom meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start Zoom meeting',
    });
  }
};

/**
 * End a Zoom meeting
 * Only accessible by admin users via protected routes
 */
const endZoomMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;

    // Double-check admin permissions (additional safety)
    if (!req.session.user || req.session.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required to end meetings.',
      });
    }

    console.log(`Admin ${req.session.user.id} ending Zoom meeting:`, meetingId);

    const zoomMeeting = await ZoomMeeting.findById(meetingId);

    if (!zoomMeeting) {
      return res.status(404).json({
        success: false,
        message: 'Zoom meeting not found',
      });
    }

    // Only try to end meeting on Zoom if it's currently active
    if (zoomMeeting.status === 'active') {
      try {
        console.log(
          '🔚 Ending meeting on Zoom servers:',
          zoomMeeting.meetingId
        );

        // Actually end the meeting on Zoom's servers
        await zoomService.endMeetingOnZoom(zoomMeeting.meetingId);

        console.log('✅ Meeting ended on Zoom servers');
      } catch (zoomError) {
        console.warn(
          '⚠️ Could not end meeting on Zoom (may already be ended):',
          zoomError.message
        );
        // Continue with database update even if Zoom API fails
      }
    }

    // Update meeting status to ended in our database
    await zoomMeeting.endMeeting();

    console.log('✅ Zoom meeting ended successfully by admin');

    res.json({
      success: true,
      message: 'Zoom meeting ended',
      zoomMeeting: zoomMeeting,
    });
  } catch (error) {
    console.error('❌ Error ending Zoom meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to end Zoom meeting',
    });
  }
};

/**
 * Get Zoom meeting statistics and attendance
 */
const getZoomMeetingStats = async (req, res) => {
  try {
    const { meetingId } = req.params;

    console.log('Getting Zoom meeting statistics:', meetingId);

    const statistics = await zoomService.getMeetingStatistics(meetingId);

    res.json({
      success: true,
      statistics: statistics,
    });
  } catch (error) {
    console.error('❌ Error getting Zoom meeting statistics:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get meeting statistics',
    });
  }
};

/**
 * Delete Zoom meeting
 */
const deleteZoomMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { contentId, topicId } = req.body;

    console.log('Deleting Zoom meeting:', meetingId);

    const zoomMeeting = await ZoomMeeting.findById(meetingId);

    if (!zoomMeeting) {
      return res.status(404).json({
        success: false,
        message: 'Zoom meeting not found',
      });
    }

    // Delete from Zoom if meeting hasn't ended
    if (zoomMeeting.status !== 'ended') {
      try {
        await zoomService.deleteMeeting(zoomMeeting.meetingId);
      } catch (error) {
        console.log(
          '⚠️ Could not delete from Zoom (may already be deleted):',
          error.message
        );
      }
    }

    // Remove from topic content
    if (topicId && contentId) {
      const topic = await Topic.findById(topicId);
      if (topic) {
        topic.content = topic.content.filter(
          (item) => item._id.toString() !== contentId
        );
        await topic.save();
      }
    }

    // Delete from database
    await ZoomMeeting.findByIdAndDelete(meetingId);

    console.log('✅ Zoom meeting deleted successfully');

    res.json({
      success: true,
      message: 'Zoom meeting deleted successfully',
    });
  } catch (error) {
    console.error('❌ Error deleting Zoom meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete Zoom meeting',
    });
  }
};

/**
 * Bulk import students from Excel file
 * Expected columns: Student Name, Student Phone Number, Parent Phone Number, Student Code
 */
const bulkImportStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = {
      success: [],
      failed: [],
      total: data.length,
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // +2 because Excel is 1-indexed and we skip header

      try {
        // Debug: Log the row keys to see what Excel is reading
        console.log('Row keys:', Object.keys(row));
        console.log('Row data:', row);

        // Helper function to get value by key with case-insensitive and trimmed matching
        const getValueByKey = (obj, possibleKeys) => {
          for (const key of possibleKeys) {
            // Try exact match
            if (obj[key] !== undefined) return obj[key];
            
            // Try case-insensitive match
            const lowerKey = key.toLowerCase();
            for (const objKey in obj) {
              if (objKey.toLowerCase() === lowerKey) return obj[objKey];
            }
            
            // Try trimmed match
            for (const objKey in obj) {
              if (objKey.trim() === key) return obj[objKey];
            }
          }
          return undefined;
        };

        // Extract data from Excel row - support multiple column name variations
        const studentName = getValueByKey(row, [
          'Student Name', 'student name', 'StudentName', 'studentname'
        ]);
        
        const studentPhone = getValueByKey(row, [
          'Student Phone Number', 'student phone number', 'StudentPhoneNumber', 'studentphonenumber',
          'Student Phon', 'student phon', 'StudentPhone', 'studentphone',
          'Student Phone', 'student phone'
        ]);
        
        const parentPhone = getValueByKey(row, [
          'Parent Phone Number', 'parent phone number', 'ParentPhoneNumber', 'parentphonenumber',
          'Parent Phone', 'parent phone', 'ParentPhone', 'parentphone'
        ]);
        
        const studentCode = getValueByKey(row, [
          'Student Code', 'student code', 'StudentCode', 'studentcode'
        ]);

        console.log('Extracted values:', { studentName, studentPhone, parentPhone, studentCode });

        // Validate required fields
        if (!studentName || !studentPhone || !parentPhone || !studentCode) {
          results.failed.push({
            row: rowNumber,
            studentName: studentName || 'N/A',
            reason: 'Missing required fields (Name, Phone, or Code)',
          });
          continue;
        }

        // Parse student name
        const nameParts = studentName.trim().split(/\s+/);
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'Student';

        // Parse phone numbers (expecting format: +966XXXXXXXXX or just XXXXXXXXX)
        let studentNumber = studentPhone.toString().trim();
        let parentNumber = parentPhone.toString().trim();

        // Remove any non-numeric characters except +
        studentNumber = studentNumber.replace(/[^\d+]/g, '');
        parentNumber = parentNumber.replace(/[^\d+]/g, '');

        // Determine country code
        let studentCountryCode = '+966';
        let parentCountryCode = '+966';

        if (studentNumber.startsWith('+')) {
          if (studentNumber.startsWith('+966')) {
            studentCountryCode = '+966';
            studentNumber = studentNumber.substring(4);
          } else if (studentNumber.startsWith('+20')) {
            studentCountryCode = '+20';
            studentNumber = studentNumber.substring(3);
          } else if (studentNumber.startsWith('+971')) {
            studentCountryCode = '+971';
            studentNumber = studentNumber.substring(4);
          } else if (studentNumber.startsWith('+965')) {
            studentCountryCode = '+965';
            studentNumber = studentNumber.substring(4);
          }
        }

        if (parentNumber.startsWith('+')) {
          if (parentNumber.startsWith('+966')) {
            parentCountryCode = '+966';
            parentNumber = parentNumber.substring(4);
          } else if (parentNumber.startsWith('+20')) {
            parentCountryCode = '+20';
            parentNumber = parentNumber.substring(3);
          } else if (parentNumber.startsWith('+971')) {
            parentCountryCode = '+971';
            parentNumber = parentNumber.substring(4);
          } else if (parentNumber.startsWith('+965')) {
            parentCountryCode = '+965';
            parentNumber = parentNumber.substring(4);
          }
        }

        // Check if student code already exists
        const existingStudent = await User.findOne({ studentCode: studentCode.toString() });
        if (existingStudent) {
          results.failed.push({
            row: rowNumber,
            studentName: studentName,
            reason: `Student code ${studentCode} already exists`,
          });
          continue;
        }

        // Check if phone number already exists
        const existingPhone = await User.findOne({ studentNumber: studentNumber });
        if (existingPhone) {
          results.failed.push({
            row: rowNumber,
            studentName: studentName,
            reason: `Phone number already registered`,
          });
          continue;
        }

        // Generate temporary email and username
        const tempEmail = `temp_${studentCode}@elkably.com`;
        const tempUsername = `student_${studentCode}`;

        // Create student with incomplete data
        const newStudent = new User({
          firstName,
          lastName,
          studentNumber,
          studentCountryCode,
          parentNumber,
          parentCountryCode,
          studentEmail: tempEmail,
          username: tempUsername,
          schoolName: 'To Be Completed',
          grade: 'Year 10',
          englishTeacher: 'To Be Completed',
          password: studentCode, // Temporary password
          howDidYouKnow: 'Bulk Import',
          studentCode: studentCode.toString(),
          isCompleteData: false,
          isActive: true,
        });

        await newStudent.save();

        results.success.push({
          row: rowNumber,
          studentName: studentName,
          studentCode: studentCode,
          studentPhone: `${studentCountryCode}${studentNumber}`,
        });
      } catch (error) {
        console.error(`Error importing row ${rowNumber}:`, error);
        results.failed.push({
          row: rowNumber,
          studentName: row['Student Name'] || 'N/A',
          reason: error.message || 'Unknown error',
        });
      }
    }

    // Clean up uploaded file
    const fs = require('fs');
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.json({
      success: true,
      message: `Import completed: ${results.success.length} successful, ${results.failed.length} failed`,
      results: results,
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to import students',
    });
  }
};



// ==================== STUDENT ENROLLMENT ====================

// Enroll students manually to a course
const enrollStudentsToCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { studentIds } = req.body; // Array of student IDs

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one student',
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const students = await User.find({ _id: { $in: studentIds }, role: 'student' });
    
    if (students.length !== studentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some students not found',
      });
    }

    // Check if any students are already enrolled
    const alreadyEnrolledStudents = students.filter(student => 
      student.enrolledCourses.some(enrollment => 
        enrollment.course && enrollment.course.toString() === courseId
      )
    );

    if (alreadyEnrolledStudents.length > 0) {
      const alreadyEnrolledNames = alreadyEnrolledStudents.map(student => 
        student.name || `${student.firstName} ${student.lastName}`
      );
      
      return res.status(400).json({
        success: false,
        message: `Cannot enroll students who are already enrolled in this course`,
        alreadyEnrolled: alreadyEnrolledNames,
        error: 'ALREADY_ENROLLED',
      });
    }

    // Enroll all students using safe enrollment
    const enrolledStudents = [];
    for (const student of students) {
      await student.safeEnrollInCourse(courseId);
      enrolledStudents.push(student.name || `${student.firstName} ${student.lastName}`);
      
      // Send WhatsApp notification for course enrollment
      try {
        await whatsappNotificationService.sendCourseEnrollmentNotification(
          student._id,
          course
        );
      } catch (whatsappError) {
        console.error('WhatsApp enrollment notification error:', whatsappError);
        // Don't fail the enrollment if WhatsApp fails
      }
    }

    res.json({
      success: true,
      message: `Successfully enrolled ${enrolledStudents.length} student(s)`,
      enrolled: enrolledStudents,
    });
  } catch (error) {
    console.error('Error enrolling students to course:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enroll students',
    });
  }
};

// Enroll students manually to a bundle
const enrollStudentsToBundle = async (req, res) => {
  try {
    const { bundleId } = req.params;
    const { studentIds } = req.body; // Array of student IDs

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one student',
      });
    }

    const bundle = await BundleCourse.findById(bundleId);
    if (!bundle) {
      return res.status(404).json({
        success: false,
        message: 'Bundle not found',
      });
    }

    const students = await User.find({ _id: { $in: studentIds }, role: 'student' });
    
    if (students.length !== studentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some students not found',
      });
    }

    // Check if any students are already enrolled
    const alreadyEnrolledStudents = students.filter(student => 
      student.purchasedBundles.some(purchase => 
        purchase.bundle && purchase.bundle.toString() === bundleId
      )
    );

    if (alreadyEnrolledStudents.length > 0) {
      const alreadyEnrolledNames = alreadyEnrolledStudents.map(student => 
        student.name || `${student.firstName} ${student.lastName}`
      );
      
      return res.status(400).json({
        success: false,
        message: `Cannot enroll students who are already enrolled in this bundle`,
        alreadyEnrolled: alreadyEnrolledNames,
        error: 'ALREADY_ENROLLED',
      });
    }

    // Enroll all students to bundle
    const enrolledStudents = [];
    for (const student of students) {

      
      // Also enroll in all courses in the bundle using safe enrollment
      for (const courseId of bundle.courses) {
        await student.safeEnrollInCourse(courseId);
      }
      enrolledStudents.push(student.name || `${student.firstName} ${student.lastName}`);
      
      // Send WhatsApp notification for bundle enrollment
      try {
        const whatsappNotificationService = require('../utils/whatsappNotificationService');
        await whatsappNotificationService.sendBundleEnrollmentNotification(
          student._id,
          bundle
        );
      } catch (whatsappError) {
        console.error('WhatsApp bundle enrollment notification error:', whatsappError);
        // Don't fail the enrollment if WhatsApp fails
      }
    }

    res.json({
      success: true,
      message: `Successfully enrolled ${enrolledStudents.length} student(s) to bundle`,
      enrolled: enrolledStudents,
    });
  } catch (error) {
    console.error('Error enrolling students to bundle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enroll students',
    });
  }
};

// Clean up duplicates for a specific user
const cleanupUserDuplicates = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    const result = await user.cleanupDuplicates();
    
    res.json({
      success: true,
      message: `Cleaned up ${result.duplicatesRemoved} duplicates for user`,
      result: {
        duplicatesRemoved: result.duplicatesRemoved,
        enrollmentsRemoved: result.enrollmentsRemoved,
        coursePurchasesRemoved: result.coursePurchasesRemoved,
        bundlePurchasesRemoved: result.bundlePurchasesRemoved,
      },
    });
  } catch (error) {
    console.error('Error cleaning up user duplicates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clean up duplicates',
    });
  }
};

// Bulk enroll students to a course via Excel
const bulkEnrollStudentsToCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = {
      success: [],
      failed: [],
      alreadyEnrolled: [],
      total: data.length,
    };

    // Helper function to get value by key
    const getValueByKey = (obj, possibleKeys) => {
      for (const key of possibleKeys) {
        if (obj[key] !== undefined) return obj[key];
        const lowerKey = key.toLowerCase();
        for (const objKey in obj) {
          if (objKey.toLowerCase() === lowerKey) return obj[objKey];
        }
        for (const objKey in obj) {
          if (objKey.trim() === key) return obj[objKey];
        }
      }
      return undefined;
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        // Extract identifier (email, phone, or code)
        const identifier = getValueByKey(row, [
          'Email', 'email', 'Student Email', 'student email',
          'Phone', 'phone', 'Student Phone', 'student phone', 'Student Number', 'student number',
          'Code', 'code', 'Student Code', 'student code'
        ]);

        if (!identifier) {
          results.failed.push({
            row: rowNumber,
            reason: 'Missing identifier (Email, Phone, or Code)',
          });
          continue;
        }

        // Find student by email, phone, or code
        let student = await User.findOne({
          $or: [
            { studentEmail: identifier.toLowerCase() },
            { studentNumber: identifier },
            { studentCode: identifier },
            { username: identifier },
          ],
          role: 'student',
        });

        if (!student) {
          results.failed.push({
            row: rowNumber,
            identifier,
            reason: 'Student not found',
          });
          continue;
        }

        // Check if already enrolled
        const isAlreadyEnrolled = student.enrolledCourses.some(enrollment => 
          enrollment.course && enrollment.course.toString() === courseId
        );
        
        if (isAlreadyEnrolled) {
          results.alreadyEnrolled.push({
            row: rowNumber,
            studentName: student.name || `${student.firstName} ${student.lastName}`,
            identifier,
          });
          continue;
        }

        // Enroll student using safe enrollment
        await student.safeEnrollInCourse(courseId);

        results.success.push({
          row: rowNumber,
          studentName: student.name || `${student.firstName} ${student.lastName}`,
          identifier,
        });
      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        results.failed.push({
          row: rowNumber,
          reason: error.message,
        });
      }
    }

    // Clean up uploaded file
    const fs = require('fs');
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: `Enrollment completed: ${results.success.length} successful, ${results.failed.length} failed, ${results.alreadyEnrolled.length} already enrolled`,
      results,
    });
  } catch (error) {
    console.error('Error bulk enrolling students:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk enroll students',
    });
  }
};

// Bulk enroll students to a bundle via Excel
const bulkEnrollStudentsToBundle = async (req, res) => {
  try {
    const { bundleId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const bundle = await BundleCourse.findById(bundleId);
    if (!bundle) {
      return res.status(404).json({
        success: false,
        message: 'Bundle not found',
      });
    }

    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = {
      success: [],
      failed: [],
      alreadyEnrolled: [],
      total: data.length,
    };

    // Helper function to get value by key
    const getValueByKey = (obj, possibleKeys) => {
      for (const key of possibleKeys) {
        if (obj[key] !== undefined) return obj[key];
        const lowerKey = key.toLowerCase();
        for (const objKey in obj) {
          if (objKey.toLowerCase() === lowerKey) return obj[objKey];
        }
        for (const objKey in obj) {
          if (objKey.trim() === key) return obj[objKey];
        }
      }
      return undefined;
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        // Extract identifier (email, phone, or code)
        const identifier = getValueByKey(row, [
          'Email', 'email', 'Student Email', 'student email',
          'Phone', 'phone', 'Student Phone', 'student phone', 'Student Number', 'student number',
          'Code', 'code', 'Student Code', 'student code'
        ]);

        if (!identifier) {
          results.failed.push({
            row: rowNumber,
            reason: 'Missing identifier (Email, Phone, or Code)',
          });
          continue;
        }

        // Find student by email, phone, or code
        let student = await User.findOne({
          $or: [
            { studentEmail: identifier.toLowerCase() },
            { studentNumber: identifier },
            { studentCode: identifier },
            { username: identifier },
          ],
          role: 'student',
        });

        if (!student) {
          results.failed.push({
            row: rowNumber,
            identifier,
            reason: 'Student not found',
          });
          continue;
        }

        // Check if already enrolled
        const isAlreadyEnrolled = student.purchasedBundles.some(purchase => 
          purchase.bundle && purchase.bundle.toString() === bundleId
        );
        
        if (isAlreadyEnrolled) {
          results.alreadyEnrolled.push({
            row: rowNumber,
            studentName: student.name || `${student.firstName} ${student.lastName}`,
            identifier,
          });
          continue;
        }

        // Enroll student to bundle
        student.purchasedBundles.push({
          bundle: bundleId,
          purchasedAt: new Date(),
          price: bundle.price || 0,
          orderNumber: `BULK-${Date.now()}-${rowNumber}`,
          status: 'active'
        });
        
        // Also enroll in all courses in the bundle
        for (const courseId of bundle.courses) {
          const isAlreadyEnrolledInCourse = student.enrolledCourses.some(enrollment => 
            enrollment.course && enrollment.course.toString() === courseId.toString()
          );
          
          if (!isAlreadyEnrolledInCourse) {
            student.enrolledCourses.push({
              course: courseId,
              enrolledAt: new Date(),
              progress: 0,
              lastAccessed: new Date(),
              completedTopics: [],
              status: 'active',
              contentProgress: []
            });
          }
        }
        
        await student.save();

        results.success.push({
          row: rowNumber,
          studentName: student.name || `${student.firstName} ${student.lastName}`,
          identifier,
        });
      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        results.failed.push({
          row: rowNumber,
          reason: error.message,
        });
      }
    }

    // Clean up uploaded file
    const fs = require('fs');
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      message: `Enrollment completed: ${results.success.length} successful, ${results.failed.length} failed, ${results.alreadyEnrolled.length} already enrolled`,
      results,
    });
  } catch (error) {
    console.error('Error bulk enrolling students to bundle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk enroll students',
    });
  }
};

// Get students for enrollment modal
const getStudentsForEnrollment = async (req, res) => {
  try {
    const { search, page = 1, limit = 20, courseId, bundleId } = req.query;
    const query = { role: 'student', isActive: true };

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { studentEmail: { $regex: search, $options: 'i' } },
        { studentNumber: { $regex: search, $options: 'i' } },
        { studentCode: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    // Get all students matching the search
    let students = await User.find(query)
      .select('firstName lastName studentEmail studentNumber studentCode username grade schoolName enrolledCourses purchasedBundles')
      .sort({ firstName: 1, lastName: 1 });

    // Filter out already enrolled students using JavaScript
    if (courseId) {
      students = students.filter(student => {
        // Check if student has this course in their enrolledCourses array
        return !student.enrolledCourses.some(enrollment => 
          enrollment.course && enrollment.course.toString() === courseId
        );
      });
    }
    
    if (bundleId) {
      students = students.filter(student => {
        // Check if student has this bundle in their purchasedBundles array
        return !student.purchasedBundles.some(purchase => 
          purchase.bundle && purchase.bundle.toString() === bundleId
        );
      });
    }

    // Apply pagination after filtering
    const total = students.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    students = students.slice(startIndex, endIndex);

    res.json({
      success: true,
      students,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
    });
  }
};

// Remove student from course
const removeStudentFromCourse = async (req, res) => {
  try {
    const { courseId, studentId } = req.params;

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Find and remove the enrollment
    const enrollmentIndex = student.enrolledCourses.findIndex(enrollment => 
      enrollment.course && enrollment.course.toString() === courseId
    );

    if (enrollmentIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Student is not enrolled in this course',
      });
    }

    // Remove the enrollment
    student.enrolledCourses.splice(enrollmentIndex, 1);
    await student.save();

    res.json({
      success: true,
      message: 'Student successfully removed from course',
    });
  } catch (error) {
    console.error('Error removing student from course:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove student from course',
    });
  }
};

// Remove student from bundle
const removeStudentFromBundle = async (req, res) => {
  try {
    const { bundleId, studentId } = req.params;

    const bundle = await BundleCourse.findById(bundleId);
    if (!bundle) {
      return res.status(404).json({
        success: false,
        message: 'Bundle not found',
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Find and remove the bundle purchase
    const bundleIndex = student.purchasedBundles.findIndex(purchase => 
      purchase.bundle && purchase.bundle.toString() === bundleId
    );

    if (bundleIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Student has not purchased this bundle',
      });
    }

    // Remove the bundle purchase
    student.purchasedBundles.splice(bundleIndex, 1);

    // Also remove student from all courses in the bundle
    const removedCourses = [];
    for (const courseId of bundle.courses) {
      const courseIndex = student.enrolledCourses.findIndex(enrollment => 
        enrollment.course && enrollment.course.toString() === courseId.toString()
      );

      if (courseIndex !== -1) {
        student.enrolledCourses.splice(courseIndex, 1);
        removedCourses.push(courseId.toString());
      }
    }

    await student.save();

    res.json({
      success: true,
      message: `Student successfully removed from bundle and ${removedCourses.length} course(s)`,
      removedCourses: removedCourses.length,
    });
  } catch (error) {
    console.error('Error removing student from bundle:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove student from bundle',
    });
  }
};

// ==================== PROMO CODES MANAGEMENT ====================

// Get all promo codes with stats
const getPromoCodes = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    const filter = {};
    
    if (status) {
      if (status === 'active') {
        filter.isActive = true;
        filter.validFrom = { $lte: new Date() };
        filter.validUntil = { $gte: new Date() };
      } else if (status === 'expired') {
        filter.validUntil = { $lt: new Date() };
      } else if (status === 'inactive') {
        filter.isActive = false;
      }
    }

    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Get promo codes
    const promoCodes = await PromoCode.find(filter)
      .populate('createdBy', 'userName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get stats
    const totalCodes = await PromoCode.countDocuments();
    const activeCodes = await PromoCode.countDocuments({
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() }
    });
    const expiredCodes = await PromoCode.countDocuments({
      validUntil: { $lt: new Date() }
    });

    // Calculate total uses
    const totalUsesResult = await PromoCode.aggregate([
      { $group: { _id: null, totalUses: { $sum: '$currentUses' } } }
    ]);
    const totalUses = totalUsesResult[0]?.totalUses || 0;

    const stats = {
      totalCodes,
      activeCodes,
      expiredCodes,
      totalUses
    };

    res.render('admin/promo-codes', {
      title: 'Promo Codes Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      promoCodes,
      stats,
      currentFilters: { status, search },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCodes / parseInt(limit)),
        hasNext: parseInt(page) < Math.ceil(totalCodes / parseInt(limit)),
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching promo codes:', error);
    req.flash('error_msg', 'Error loading promo codes');
    res.render('admin/promo-codes', {
      title: 'Promo Codes Management | ELKABLY',
      theme: req.cookies.theme || 'light',
      promoCodes: [],
      stats: { totalCodes: 0, activeCodes: 0, expiredCodes: 0, totalUses: 0 },
      currentFilters: {},
      pagination: { currentPage: 1, totalPages: 0, hasNext: false, hasPrev: false }
    });
  }
};

// Create new promo code
const createPromoCode = async (req, res) => {
  try {
    const {
      name,
      description,
      code,
      discountType,
      discountValue,
      maxDiscountAmount,
      minOrderAmount,
      maxUses,
      allowMultipleUses,
      validFrom,
      validUntil,
      applicableTo
    } = req.body;

    // Validate required fields
    if (!name || !code || !discountType || !discountValue || !validFrom || !validUntil) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if admin is logged in
    if (!req.session.adminId && !req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    // Validate discount value
    if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Percentage discount must be between 1 and 100'
      });
    }

    if (discountType === 'fixed' && discountValue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Fixed discount must be greater than 0'
      });
    }

    // Validate dates
    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);
    
    if (untilDate <= fromDate) {
      return res.status(400).json({
        success: false,
        message: 'Valid until date must be after valid from date'
      });
    }

    // Check if code already exists
    const existingCode = await PromoCode.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      return res.status(400).json({
        success: false,
        message: 'Promo code already exists'
      });
    }

    // Create promo code
    const promoCode = new PromoCode({
      name,
      description: description || undefined, // Handle empty description
      code: code.toUpperCase(),
      discountType,
      discountValue: parseFloat(discountValue),
      maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
      minOrderAmount: parseFloat(minOrderAmount) || 0,
      maxUses: maxUses ? parseInt(maxUses) : null,
      allowMultipleUses: allowMultipleUses === 'true' || allowMultipleUses === true,
      validFrom: fromDate,
      validUntil: untilDate,
      applicableTo: applicableTo || 'all',
      createdBy: req.session.adminId || req.user?.id
    });

    await promoCode.save();

    res.json({
      success: true,
      message: 'Promo code created successfully',
      promoCode: promoCode
    });
  } catch (error) {
    console.error('Error creating promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating promo code',
      error: error.message
    });
  }
};

// Get single promo code for editing
const getPromoCode = async (req, res) => {
  try {
    const { id } = req.params;
    
    const promoCode = await PromoCode.findById(id);
    
    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found'
      });
    }
    
    res.json({
      success: true,
      promoCode: promoCode
    });
  } catch (error) {
    console.error('Error fetching promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching promo code',
      error: error.message
    });
  }
};

// Get promo code usage history
const getPromoCodeUsage = async (req, res) => {
  try {
    const { id } = req.params;

    const promoCode = await PromoCode.findById(id)
      .populate('usageHistory.user', 'userName studentEmail')
      .populate('usageHistory.purchase', 'orderNumber');

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found'
      });
    }

    res.json({
      success: true,
      promoCode: {
        _id: promoCode._id,
        name: promoCode.name,
        code: promoCode.code
      },
      usageHistory: promoCode.usageHistory
    });
  } catch (error) {
    console.error('Error fetching promo code usage:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching usage history',
      error: error.message
    });
  }
};

// Delete promo code
const deletePromoCode = async (req, res) => {
  try {
    const { id } = req.params;

    const promoCode = await PromoCode.findById(id);
    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found'
      });
    }

    // Check if promo code has been used
    if (promoCode.currentUses > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete promo code that has been used'
      });
    }

    await PromoCode.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Promo code deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting promo code',
      error: error.message
    });
  }
};

// Update promo code
const updatePromoCode = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const promoCode = await PromoCode.findById(id);
    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: 'Promo code not found'
      });
    }

    // Don't allow updating code if it has been used
    if (promoCode.currentUses > 0 && updateData.code && updateData.code !== promoCode.code) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change code that has been used'
      });
    }

    // Validate discount value if provided
    if (updateData.discountType === 'percentage' && updateData.discountValue) {
      if (updateData.discountValue < 1 || updateData.discountValue > 100) {
        return res.status(400).json({
          success: false,
          message: 'Percentage discount must be between 1 and 100'
        });
      }
    }

    // Update promo code
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        // Special handling for allowMultipleUses to convert string to boolean
        if (key === 'allowMultipleUses') {
          promoCode[key] = updateData[key] === 'true' || updateData[key] === true;
        } else {
          promoCode[key] = updateData[key];
        }
      }
    });

    await promoCode.save();

    res.json({
      success: true,
      message: 'Promo code updated successfully',
      promoCode: promoCode
    });
  } catch (error) {
    console.error('Error updating promo code:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating promo code',
      error: error.message
    });
  }
};

// ==================== DASHBOARD CHART DATA API ====================

// Get chart data for dashboard
const getDashboardChartData = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysInt = parseInt(days);
    
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysInt);
    
    // Get student growth data
    const studentGrowth = await User.aggregate([
      {
        $match: {
          role: 'student',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get revenue data
    const revenueData = await Purchase.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $in: ['completed', 'paid'] }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$total' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      success: true,
      studentGrowth,
      revenueData
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chart data',
      error: error.message
    });
  }
};

// ==================== MODULE EXPORTS ====================

module.exports = {
  getAdminDashboard,
  getDashboardChartData,
  getCourses,
  createCourse,
  getCourse,
  getCourseDetails,
  getCourseData,
  updateCourse,
  deleteCourse,
  getCourseContent,
  createTopic,
  updateTopic,
  updateTopicVisibility,
  getTopicDetails,
  getContentDetailsPage,
  getContentDetailsForEdit,
  reorderTopics,
  deleteTopic,
  addTopicContent,
  updateTopicContent,
  deleteTopicContent,
  getBundles,
  createBundle,
  updateBundle,
  deleteBundle,
  getBundleManage,
  getBundleInfo,
  getBundleStudents,
  addCourseToBundle,
  removeCourseFromBundle,
  createCourseForBundle,
  getBundlesAPI,
  // Student Management Controllers
  getStudents,
  getStudentDetails,
  toggleStudentStatus,
  exportStudentData,
  updateStudent,
  deleteStudent,
  // Quiz/Homework Content Controllers
  getQuestionBanksForContent,
  getQuestionsFromBankForContent,
  getQuestionPreviewForContent,
  addQuizContent,
  addHomeworkContent,
  // Content analytics APIs
  getTopicContentStudentStats,
  resetContentAttempts,
  // Orders management
  getOrders,
  getOrderDetails,
  generateInvoice,
  refundOrder,
  // Brilliant Students Management
  getBrilliantStudents,
  getBrilliantStudentDetails,
  createBrilliantStudent,
  updateBrilliantStudent,
  deleteBrilliantStudent,
  reorderBrilliantStudents,
  getBrilliantStudentsStats,
  exportBrilliantStudents,
  // Admin Management
  getCreateAdminForm,
  createNewAdmin,
  // Export functions
  exportCourses,
  exportOrders,
  exportQuizzes,
  exportComprehensiveReport,
  exportCourseDetails,
  exportTopicDetails,
  exportQuestionBankDetails,
  exportQuizDetails,
  // Zoom Meeting Management
  createZoomMeeting,
  startZoomMeeting,
  endZoomMeeting,
  getZoomMeetingStats,
  deleteZoomMeeting,
  // Bulk Import
  bulkImportStudents,
  // Student Enrollment
  enrollStudentsToCourse,
  enrollStudentsToBundle,
  bulkEnrollStudentsToCourse,
  bulkEnrollStudentsToBundle,
  getStudentsForEnrollment,
  removeStudentFromCourse,
  removeStudentFromBundle,
  // Duplicate Cleanup
  cleanupUserDuplicates,
  // Promo Codes Management
  getPromoCodes,
  getPromoCode,
  createPromoCode,
  getPromoCodeUsage,
  deletePromoCode,
  updatePromoCode,
};
