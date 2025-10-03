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
const mongoose = require('mongoose');

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
      brilliantStudentsStats
    ] = await Promise.all([
      // Student statistics - using correct field names from User model
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'student', isActive: true }),
      User.countDocuments({ 
        role: 'student', 
        createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) }
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
            $or: [
              { refundedAt: { $exists: false } },
              { refundedAt: null }
            ]
          }
        },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Purchase.aggregate([
        { 
          $match: { 
            createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) },
            status: { $in: ['completed', 'paid'] },
            $or: [
              { refundedAt: { $exists: false } },
              { refundedAt: null }
            ]
          }
        },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Purchase.countDocuments({ 
        status: { $in: ['completed', 'paid'] },
        $or: [
          { refundedAt: { $exists: false } },
          { refundedAt: null }
        ]
      }),
      
      // Recent activity - using correct field names
      User.find({ role: 'student' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('firstName lastName studentEmail createdAt'),
      
      // New orders (last 24 hours) for notifications
      Purchase.find({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        status: { $in: ['completed', 'paid'] }
      })
        .populate('user', 'firstName lastName studentEmail')
        .sort({ createdAt: -1 })
        .limit(10),
      
      // Top performing courses (including featured)
      Course.find({ status: { $in: ['published', 'draft'] } })
        .populate({
          path: 'enrolledStudents',
          select: 'enrolledCourses',
          populate: {
            path: 'enrolledCourses.course',
            select: '_id'
          }
        })
        .sort({ enrolledStudents: -1 })
        .limit(6)
        .select('title level category status enrolledStudents price featured'),
      
      // Student growth data (last 7 days)
      User.aggregate([
        {
          $match: {
            role: 'student',
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Revenue data (last 7 days)
      Purchase.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: '$total' }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Progress statistics
      Progress.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$completed', true] }, 1, 0]
              }
            }
          }
        }
      ]),
      
      // Brilliant students statistics
      BrilliantStudent.getStatistics()
    ]);

    console.log('Data fetched successfully:', {
      totalStudents,
      totalCourses,
      totalRevenue: totalRevenue[0]?.total || 0
    });

    // Calculate engagement metrics based on real data
    const progressData = progressStats[0] || { total: 0, completed: 0 };
    
    // Calculate engagement score based on multiple factors
    const totalEnrolledStudents = await User.countDocuments({ 
      role: 'student', 
      'enrolledCourses.0': { $exists: true } 
    });
    
    const activeStudentsCount = await User.countDocuments({ 
      role: 'student', 
      'enrolledCourses.status': 'active',
      isActive: true
    });
    
    const studentsWithProgress = await User.countDocuments({ 
      role: 'student', 
      'enrolledCourses.contentProgress.0': { $exists: true }
    });
    
    // Calculate engagement score based on active students and progress
    let engagementScore = 0;
    if (totalEnrolledStudents > 0) {
      const activeEngagement = (activeStudentsCount / totalEnrolledStudents) * 40; // 40% weight
      const progressEngagement = progressData.total > 0 ? (progressData.completed / progressData.total) * 60 : 0; // 60% weight
      engagementScore = Math.round(activeEngagement + progressEngagement);
    }

    // Calculate growth percentages (mock for now - would need historical data)
    const studentGrowthPercent = totalStudents > 0 ? Math.floor(Math.random() * 20) + 5 : 0;
    const courseGrowthPercent = totalCourses > 0 ? Math.floor(Math.random() * 15) + 3 : 0;
    const revenueGrowthPercent = (totalRevenue[0]?.total || 0) > 0 ? Math.floor(Math.random() * 25) + 10 : 0;

    // Prepare dashboard data
    const dashboardData = {
      students: {
        total: totalStudents || 0,
        active: activeStudents || 0,
        newThisMonth: newStudentsThisMonth || 0,
        growth: studentGrowthPercent
      },
      courses: {
        total: totalCourses || 0,
        published: publishedCourses || 0,
        draft: draftCourses || 0,
        growth: courseGrowthPercent
      },
      revenue: {
        total: Math.round(totalRevenue[0]?.total || 0),
        thisMonth: Math.round(monthlyRevenue[0]?.total || 0),
        orders: totalOrders || 0,
        growth: revenueGrowthPercent
      },
      engagement: {
        score: engagementScore,
        trend: engagementScore > 70 ? 'up' : engagementScore > 50 ? 'neutral' : 'down',
        change: engagementScore > 70 ? 5 : engagementScore > 50 ? 0 : -3,
        avgSession: '24m',
        completion: progressData.total > 0 ? Math.round((progressData.completed / progressData.total) * 100) : 0,
        activeStudents: activeStudentsCount,
        totalEnrolled: totalEnrolledStudents,
        studentsWithProgress: studentsWithProgress
      },
      brilliantStudents: {
        total: Object.values(brilliantStudentsStats).reduce((sum, stat) => sum + (stat.count || 0), 0),
        est: brilliantStudentsStats.EST?.count || 0,
        dsat: brilliantStudentsStats.DSAT?.count || 0,
        act: brilliantStudentsStats.ACT?.count || 0,
        avgScore: Object.values(brilliantStudentsStats).reduce((sum, stat) => sum + (stat.avgScore || 0), 0) / Object.keys(brilliantStudentsStats).length || 0,
        stats: brilliantStudentsStats
      },
      recentActivity: [
        // Recent students
        ...recentStudents.map((user, index) => ({
          icon: 'user-plus',
          message: `New student registered: ${user.firstName} ${user.lastName}`,
          time: `${index + 1} hour${index > 0 ? 's' : ''} ago`,
          type: 'student'
        })),
        // New orders
        ...newOrders.map((order, index) => ({
          icon: 'shopping-cart',
          message: `New order: ${order.orderNumber} - $${order.total}`,
          time: `${index + 1} hour${index > 0 ? 's' : ''} ago`,
          type: 'order',
          orderId: order._id,
          customer: order.user ? `${order.user.firstName} ${order.user.lastName}` : 'Unknown'
        }))
      ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10),
      topCourses: topCourses.map(course => {
        // Calculate completion rate based on enrolled students
        let completionRate = 0;
        if (course.enrolledStudents && course.enrolledStudents.length > 0) {
          // Count students who have completed the course
          const completedStudents = course.enrolledStudents.filter(student => {
            // Check if the student has this course in their enrolledCourses with status 'completed'
            return student.enrolledCourses && student.enrolledCourses.some(enrollment => 
              enrollment.course.toString() === course._id.toString() && enrollment.status === 'completed'
            );
          }).length;
          
          completionRate = Math.round((completedStudents / course.enrolledStudents.length) * 100);
        }
        
        return {
          title: course.title,
          level: course.level || 'Beginner',
          category: course.category || 'General',
          status: course.status,
          featured: course.featured || false,
          enrollments: course.enrolledStudents?.length || 0,
          completionRate: completionRate,
          revenue: Math.round((course.enrolledStudents?.length || 0) * (course.price || 0))
        };
      }),
      charts: {
        studentGrowth: studentGrowth,
        revenueData: revenueData
      },
      newOrdersCount: newOrders.length,
      newOrders: newOrders.slice(0, 5) // Show latest 5 orders for notifications
    };

    console.log('Dashboard data prepared:', dashboardData);

    return res.render('admin/dashboard', {
      title: 'Elkably Analytics Dashboard',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      dashboardData: dashboardData
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    
    // Fallback data in case of error
    const fallbackData = {
      students: { total: 0, active: 0, newThisMonth: 0, growth: 0 },
      courses: { total: 0, published: 0, draft: 0, growth: 0 },
      revenue: { total: 0, thisMonth: 0, orders: 0, growth: 0 },
      engagement: { score: 0, trend: 'neutral', change: 0, avgSession: '0m', completion: 0 },
      recentActivity: [],
      topCourses: [],
      charts: { studentGrowth: [], revenueData: [] }
    };

    return res.render('admin/dashboard', {
      title: 'Elkably Analytics Dashboard',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      dashboardData: fallbackData
    });
  }
};

// Get all courses with filtering
const getCourses = async (req, res) => {
  try {
    const {
      status,
      year,
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

    if (year) {
      filter.year = year;
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
      title: 'Course Management',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      courses,
      stats,
      filterOptions,
      currentFilters: {
        status,
        year,
        level,
        bundle,
        search,
        sortBy,
        sortOrder,
      },
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
      description: description.trim(),
      shortDescription: shortDescription.trim(),
      level,
      subject: bundle.subject,
      year: bundle.year, // Use bundle's year
      category: category.trim(),
      duration: parseInt(duration),
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
      title: `Course: ${course.title}`,
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
      title: `Course Details: ${course.title}`,
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
              year: course.bundle.year,
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

    // Remove empty fields
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === '' || updateData[key] === null) {
        delete updateData[key];
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
      isChanging: newBundleId && (!oldBundleId || newBundleId !== oldBundleId.toString())
    });

    // If bundle is being changed, handle bundle relationships
    const isBundleChanging = newBundleId && (
      !oldBundleId || 
      newBundleId !== oldBundleId.toString()
    );

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
        await BundleCourse.findByIdAndUpdate(
          oldBundleId,
          { $pull: { courses: currentCourse._id } }
        );
      }

      // Add course to new bundle
      await BundleCourse.findByIdAndUpdate(
        newBundleId,
        { $addToSet: { courses: currentCourse._id } }
      );

      // Update course with new bundle and related fields
      updateData.bundle = newBundleId;
      updateData.subject = newBundle.subject;
      updateData.year = newBundle.year;
      
      console.log('Bundle relationships updated:', {
        removedFromOldBundle: oldBundleId || 'none',
        addedToNewBundle: newBundleId,
        newSubject: newBundle.subject,
        newYear: newBundle.year
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
        message: 'Course not found' 
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
            'enrolledCourses': { course: course._id },
            'purchasedCourses': { course: course._id }
          }
        }
      );
      
      // Remove course from wishlists (handle both object and array formats)
      await User.updateMany(
        { 'wishlist.courses': course._id },
        {
          $pull: {
            'wishlist.courses': course._id
          }
        }
      );
      
      // Delete the course
      await Course.findOneAndDelete({ courseCode });
      
      return res.json({ 
        success: true, 
        message: 'Course permanently deleted from database and removed from all users!',
        action: 'deleted'
      });
    } else {
      // Archive the course instead of deleting
      await Course.findOneAndUpdate(
        { courseCode },
        { 
          status: 'archived',
          isActive: false 
        }
      );
      
      return res.json({ 
        success: true, 
        message: 'Course moved to archived status!',
        action: 'archived'
      });
    }
  } catch (error) {
    console.error('Error deleting course:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error deleting course' 
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
      title: `Course Content: ${course.title}`,
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
      description: description.trim(),
      order: topicCount + 1,
      estimatedTime: estimatedTime ? parseInt(estimatedTime) : 0,
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
            errors: { description: 'Description must be at least 10 characters long' }
          });
        }
        req.flash('error_msg', 'Description must be at least 10 characters long');
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }
      topic.description = trimmedDescription;
    }
    if (estimatedTime !== undefined)
      topic.estimatedTime = parseInt(estimatedTime) || 0;
    if (isPublished !== undefined)
      topic.isPublished = isPublished === 'on' || isPublished === true;
    if (order) topic.order = parseInt(order);

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
        Object.keys(error.errors).forEach(key => {
          validationErrors[key] = error.errors[key].message;
        });
        
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      }
      
      return res.status(500).json({
        success: false,
        message: error.message || 'Error updating topic',
      });
    }

    // Handle validation errors for regular form submission
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(key => error.errors[key].message).join(', ');
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

    const topic = await Topic.findById(topicId);
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
    const totalTimeSpent = students.reduce((sum, s) => sum + s.timeSpentMinutes, 0);
    const averageTimeSpent = totalStudents > 0 ? Math.round(totalTimeSpent / totalStudents) : 0;

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
            cp.quizAttempts.forEach(attempt => {
              if (attempt.score !== null && attempt.score !== undefined) {
                totalQuizScores.push(attempt.score);
              }
            });
          }
        }
      });
    });

    if (totalQuizScores.length > 0) {
      averageQuizScore = Math.round(totalQuizScores.reduce((a, b) => a + b, 0) / totalQuizScores.length);
      const passingScore = 60; // Default passing score
      const passedAttempts = totalQuizScores.filter(score => score >= passingScore).length;
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
      totalTimeSpent: Math.round(totalTimeSpent)
    };

    return res.render('admin/topic-details', {
      title: `Topic Details: ${topic.title}`,
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

// Get content details
const getContentDetails = async (req, res) => {
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
      isActive: true
    }).select('firstName lastName studentEmail studentCode parentNumber parentCountryCode studentNumber studentCountryCode enrolledCourses');

    const studentProgress = [];

    for (const student of enrolledStudents) {
      const enrollment = student.enrolledCourses.find(
        e => e.course && e.course.toString() === course._id.toString()
      );

      if (!enrollment) continue;

      // Find content progress for this specific content
      const contentProgress = enrollment.contentProgress.find(
        cp => cp.contentId.toString() === contentId
      );

      let progressData = {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.studentEmail,
        studentCode: student.studentCode,
        parentPhone: `${student.parentCountryCode}${student.parentNumber}`,
        studentPhone: `${student.studentCountryCode}${student.studentNumber}`,
        enrolledDate: enrollment.enrolledAt ? enrollment.enrolledAt.toISOString().split('T')[0] : 'N/A',
        lastAccessed: contentProgress ? contentProgress.lastAccessed.toISOString().split('T')[0] : 'Never',
        status: contentProgress ? contentProgress.completionStatus : 'not_started',
        progress: contentProgress ? contentProgress.progressPercentage : 0,
        timeSpent: contentProgress ? Math.round(contentProgress.timeSpent || 0) : 0,
        attempts: contentProgress ? contentProgress.attempts : 0,
        grade: null,
        passed: null,
        bestScore: contentProgress ? contentProgress.bestScore : null,
        totalPoints: contentProgress ? contentProgress.totalPoints : 0,
        quizAttempts: contentProgress ? contentProgress.quizAttempts : []
      };

      // For quiz/homework content, get detailed attempt data
      if (contentItem.type === 'quiz' || contentItem.type === 'homework') {
        if (contentProgress && contentProgress.quizAttempts && contentProgress.quizAttempts.length > 0) {
          const latestAttempt = contentProgress.quizAttempts[contentProgress.quizAttempts.length - 1];
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
      const studentsWithGrades = studentProgress.filter((s) => s.grade !== null && s.grade !== undefined);
      const studentsWithBestScores = studentProgress.filter((s) => s.bestScore !== null && s.bestScore !== undefined);
      
      if (studentsWithGrades.length > 0) {
        averageGrade = Math.round(
          studentsWithGrades.reduce((sum, s) => sum + s.grade, 0) / studentsWithGrades.length
        );
        passRate = Math.round(
          (studentsWithGrades.filter((s) => s.passed === true).length / studentsWithGrades.length) * 100
        );
      }

      if (studentsWithBestScores.length > 0) {
        const scores = studentsWithBestScores.map(s => s.bestScore);
        averageScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
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
      completionRate: totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0,
      averageGrade,
      passRate,
      averageScore,
      highestScore,
      lowestScore,
      averageTimeSpent: totalStudents > 0 ? Math.round(
        studentProgress.reduce((sum, s) => sum + s.timeSpent, 0) / totalStudents
      ) : 0,
      totalAttempts: studentProgress.reduce((sum, s) => sum + s.attempts, 0),
      totalPoints: studentProgress.reduce((sum, s) => sum + s.totalPoints, 0),
    };

    return res.render('admin/content-details', {
      title: `Content Details: ${contentItem.title}`,
      courseCode,
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      course,
      topic,
      contentItem,
      prerequisiteContent,
      studentProgress,
      analytics,
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
        message: 'Topic not found'
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
      message: 'Topic deleted successfully!'
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting topic'
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
      content: (type === 'quiz' || type === 'homework') ? '' : (content ? content.trim() : ''),
      duration: duration ? parseInt(duration) : 0,
      isRequired: isRequired === 'on',
      order: order ? parseInt(order) : contentCount + 1,
      prerequisites: prerequisiteId ? [prerequisiteId] : [],
      difficulty: difficulty || 'beginner',
      tags: contentTags,
    };

    // Handle Quiz content
    if (type === 'quiz') {
      if (!questionBank || !selectedQuestions) {
        req.flash('error_msg', 'Question bank and selected questions are required for quiz content');
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
        selectedQuestionsArray = selectedQuestions.split(',').map(q => q.trim()).filter(q => q);
      } else if (Array.isArray(selectedQuestions)) {
        selectedQuestionsArray = selectedQuestions.filter(q => q);
      }

      if (selectedQuestionsArray.length === 0) {
        req.flash('error_msg', 'Please select at least one question for the quiz');
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      // Add quiz-specific fields to contentItem
      contentItem.questionBank = questionBank;
      contentItem.selectedQuestions = selectedQuestionsArray.map((questionId, index) => ({
        question: questionId,
        points: 1,
        order: index
      }));
      contentItem.quizSettings = {
        duration: quizDuration ? parseInt(quizDuration) : 30,
        passingScore: quizPassingScore ? parseInt(quizPassingScore) : 60,
        maxAttempts: quizMaxAttempts ? parseInt(quizMaxAttempts) : 3,
        shuffleQuestions: quizShuffleQuestions === 'on',
        shuffleOptions: quizShuffleOptions === 'on',
        showCorrectAnswers: quizShowCorrectAnswers === 'on',
        showResults: quizShowResults === 'on',
        instructions: quizInstructions ? quizInstructions.trim() : ''
      };
      contentItem.duration = quizDuration ? parseInt(quizDuration) : 30;
      contentItem.completionCriteria = 'pass_quiz';
    }

    // Handle Homework content
    if (type === 'homework') {
      if (!questionBank || !selectedQuestions) {
        req.flash('error_msg', 'Question bank and selected questions are required for homework content');
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
        selectedQuestionsArray = selectedQuestions.split(',').map(q => q.trim()).filter(q => q);
      } else if (Array.isArray(selectedQuestions)) {
        selectedQuestionsArray = selectedQuestions.filter(q => q);
      }

      if (selectedQuestionsArray.length === 0) {
        req.flash('error_msg', 'Please select at least one question for the homework');
        return res.redirect(`/admin/courses/${courseCode}/content`);
      }

      // Add homework-specific fields to contentItem
      contentItem.questionBank = questionBank;
      contentItem.selectedQuestions = selectedQuestionsArray.map((questionId, index) => ({
        question: questionId,
        points: 1,
        order: index
      }));
      contentItem.homeworkSettings = {
        passingCriteria: 'pass',
        passingScore: homeworkPassingScore ? parseInt(homeworkPassingScore) : 60,
        maxAttempts: homeworkMaxAttempts ? parseInt(homeworkMaxAttempts) : 1,
        shuffleQuestions: homeworkShuffleQuestions === 'on',
        shuffleOptions: homeworkShuffleOptions === 'on',
        showCorrectAnswers: homeworkShowCorrectAnswers === 'on',
        instructions: homeworkInstructions ? homeworkInstructions.trim() : ''
      };
      contentItem.duration = 0; // No duration for homework
      contentItem.completionCriteria = 'pass_quiz';
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
    const { type, title, description, content, duration, isRequired, order } =
      req.body;

    const topic = await Topic.findById(topicId);
    if (!topic) {
      req.flash('error_msg', 'Topic not found');
      return res.redirect(`/admin/courses/${courseCode}/content`);
    }

    const contentItem = topic.content.id(contentId);
    if (!contentItem) {
      req.flash('error_msg', 'Content item not found');
      return res.redirect(`/admin/courses/${courseCode}/content`);
    }

    contentItem.type = type;
    contentItem.title = title.trim();
    contentItem.description = description ? description.trim() : '';
    contentItem.content = content.trim();
    contentItem.duration = duration ? parseInt(duration) : 0;
    contentItem.isRequired = isRequired === 'on';
    if (order) contentItem.order = parseInt(order);

    await topic.save();

    req.flash('success_msg', 'Content updated successfully!');
    res.redirect(`/admin/courses/${courseCode}/content`);
  } catch (error) {
    console.error('Error updating content:', error);
    req.flash('error_msg', 'Error updating content');
    res.redirect(`/admin/courses/${req.params.courseCode}/content`);
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
        message: 'Topic not found'
      });
    }

    topic.content.pull(contentId);
    await topic.save();

    return res.status(200).json({
      success: true,
      message: 'Content deleted successfully!'
    });
  } catch (error) {
    console.error('Error deleting content:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting content'
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
      title: 'All Orders',
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
        select: 'title courseCode bundleCode thumbnail description',
        populate: [
          {
            path: 'courses',
            select: 'title thumbnail',
            model: 'Course'
          },
          {
            path: 'bundle',
            select: 'title thumbnail',
            model: 'BundleCourse'
          }
        ]
      })
      .lean();

    if (!order) {
      req.flash('error_msg', 'Order not found');
      return res.redirect('/admin/orders');
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
        if (!thumbnail && itemDetails.courses && itemDetails.courses.length > 0) {
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
      currency: order.currency || 'USD',
      itemCount: order.items.length,
      customerStats: {
        orderCount: customerPurchaseCount,
        totalSpent: totalSpent.toFixed(2),
      },
    };

    return res.render('admin/order-details', {
      title: `Order ${order.orderNumber}`,
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
            model: 'Course'
          },
          {
            path: 'bundle',
            select: 'title thumbnail',
            model: 'BundleCourse'
          }
        ]
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
        if (!thumbnail && itemDetails.courses && itemDetails.courses.length > 0) {
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
      currency: order.currency || 'USD',
      itemCount: order.items.length,
    };

    // Company information for invoice
    const companyInfo = {
      name: 'Elkably E-Learning',
      address: '123 Education Street, Learning City, LC 12345',
      phone: '+1 (555) 123-4567',
      email: 'info@elkably.com',
      website: 'www.elkably.com',
      logo: '/images/logo.png'
    };

    return res.render('admin/invoice', {
      title: `Invoice - Order ${order.orderNumber}`,
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
    const { status, year, subject, search, page = 1, limit = 12 } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (year) filter.year = year;
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
      title: 'Bundle Management',
      theme: req.cookies.theme || 'light',
      user: req.session.user,
      bundles,
      stats,
      filterOptions,
      currentFilters: { status, year, subject, search },
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
      year,
      subject = 'All Subjects',
      price,
      discountPrice,
      status = 'draft',
      thumbnail,
    } = req.body;

    console.log('Creating bundle with data:', {
      title,
      thumbnail,
      year,
      subject,
    });

    const bundle = new BundleCourse({
      title: title.trim(),
      description: description.trim(),
      shortDescription: shortDescription.trim(),
      year,
      subject: subject.trim(),
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
      year: bundle.year,
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

    // Get available courses for this year
    const availableCourses = await Course.find({
      year: bundle.year,
      status: 'published',
    }).sort({ title: 1 });

    return res.render('admin/bundle-manage', {
      title: `Manage Bundle: ${bundle.title}`,
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

    // Create new course with bundle's year
    const course = new Course({
      title: title.trim(),
      description: description.trim(),
      shortDescription: shortDescription.trim(),
      level,
      subject: bundle.subject,
      year: bundle.year, // Use bundle's year
      category: category.trim(),
      duration: parseInt(duration),
      price: parseFloat(price),
      status,
      createdBy: req.session.user.id,
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
      .select('_id title bundleCode year')
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

  const totalEnrollments = await BundleCourse.aggregate([
    { $group: { _id: null, total: { $sum: '$enrolledStudents' } } },
  ]);

  return {
    totalBundles,
    publishedBundles,
    draftBundles,
    totalEnrollments: totalEnrollments[0]?.total || 0,
  };
};

const getFilterOptions = async () => {
  const years = await Course.distinct('year');
  const levels = await Course.distinct('level');
  const bundles = await BundleCourse.find({ status: { $ne: 'archived' } })
    .select('_id title bundleCode year')
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
      year,
      subject,
      price,
      discountPrice,
      status,
      thumbnail,
    } = req.body;

    // Check if request expects JSON response (AJAX request)
    const isAjaxRequest = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                         req.headers['accept']?.includes('application/json');

    const bundle = await BundleCourse.findOne({ bundleCode });
    if (!bundle) {
      if (isAjaxRequest) {
        return res.status(404).json({
          success: false,
          message: 'Bundle not found'
        });
      }
      req.flash('error_msg', 'Bundle not found');
      return res.redirect('/admin/bundles');
    }

    bundle.title = title.trim();
    bundle.description = description.trim();
    bundle.shortDescription = shortDescription.trim();
    bundle.year = year;
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
        bundle: bundle
      });
    }

    req.flash('success_msg', 'Bundle updated successfully!');
    res.redirect(`/admin/bundles/${bundleCode}/manage`);
  } catch (error) {
    console.error('Error updating bundle:', error);

    // Check if request expects JSON response (AJAX request)
    const isAjaxRequest = req.headers['x-requested-with'] === 'XMLHttpRequest' || 
                         req.headers['accept']?.includes('application/json');

    if (isAjaxRequest) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message
        );
        return res.status(400).json({
          success: false,
          message: `Validation Error: ${validationErrors.join(', ')}`,
          errors: validationErrors
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Error updating bundle. Please try again.'
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
        message: 'Bundle not found'
      });
    }

    // Remove bundle reference from all courses
    await Course.updateMany({ bundle: bundle._id }, { $unset: { bundle: 1 } });

    // Delete the bundle
    await BundleCourse.findByIdAndDelete(bundle._id);

    return res.status(200).json({
      success: true,
      message: 'Bundle deleted successfully!'
    });
  } catch (error) {
    console.error('Error deleting bundle:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting bundle'
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
      title: `Bundle Students: ${bundle.title}`,
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
        icon: 'dollar-sign',
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
      title: `Bundle Information: ${bundle.title}`,
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
      title: 'Student Management',
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
            }" with score ${progress.score || 'N/A'}%`;
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
      title: `Student Details - ${student.firstName} ${student.lastName}`,
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
    const { format = 'csv' } = req.query;

    // If we have a specific studentId, export just that student
    if (studentId) {
      const student = await User.findById(studentId)
        .populate({
          path: 'enrolledCourses.course',
          select: 'title courseCode',
        })
        .populate({
          path: 'purchasedBundles.bundle',
          select: 'title bundleCode',
        })
        .populate({
          path: 'quizAttempts.quiz',
          select: 'title code',
        })
        .select('-password')
        .lean();

      if (!student) {
        req.flash('error_msg', 'Student not found');
        return res.redirect('/admin/students');
      }

      // Get detailed analytics data
      const progressData = await Progress.find({ student: studentId })
        .populate('course', 'title courseCode')
        .populate('topic', 'title')
        .sort({ timestamp: -1 })
        .lean();

      // Generate comprehensive export data including analytics
      const exportData = {
        personalInfo: {
          studentCode: student.studentCode,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.studentEmail,
          username: student.username,
          grade: student.grade,
          schoolName: student.schoolName,
          phone: student.studentNumber,
          parentPhone: student.parentNumber,
          isActive: student.isActive,
          enrollmentDate: student.createdAt,
          lastLogin: student.lastLogin,
        },
        courseProgress:
          student.enrolledCourses?.map((ec) => ({
            courseTitle: ec.course?.title || 'Unknown Course',
            courseCode: ec.course?.courseCode || 'N/A',
            enrollmentDate: ec.enrolledAt,
            progress: ec.progress || 0,
            status: ec.status || 'not_started',
            lastAccessed: ec.lastAccessed,
          })) || [],
        quizPerformance:
          student.quizAttempts?.map((qa) => ({
            quizTitle: qa.quiz?.title || 'Quiz',
            code: qa.quiz?.code || 'N/A',
            bestScore: Math.max(...qa.attempts.map((a) => a.score || 0), 0),
            averageScore:
              qa.attempts.length > 0
                ? Math.round(
                    qa.attempts.reduce((sum, a) => sum + (a.score || 0), 0) /
                      qa.attempts.length
                  )
                : 0,
            attempts: qa.attempts.length,
            passRate:
              qa.attempts.length > 0
                ? Math.round(
                    (qa.attempts.filter(
                      (a) => (a.score || 0) >= (qa.quiz?.passingScore || 60)
                    ).length /
                      qa.attempts.length) *
                      100
                  )
                : 0,
          })) || [],
        purchaseHistory:
          student.purchasedBundles?.map((pb) => ({
            bundleTitle: pb.bundle?.title || 'Unknown Bundle',
            bundleCode: pb.bundle?.bundleCode || 'N/A',
            price: pb.price || 0,
            purchaseDate: pb.purchasedAt,
            expiryDate: pb.expiresAt,
            status: pb.status || 'unknown',
          })) || [],
        analytics: {
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
        },
      };

      if (format === 'csv') {
        // Generate CSV from the comprehensive data
        const csvData = generateSingleStudentCSV(exportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${student.studentCode}-export.csv`
        );
        return res.send(csvData);
      } else if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${student.studentCode}-export.json`
        );
        return res.json(exportData);
      } else if (format === 'pdf') {
        req.flash('info_msg', 'PDF export not yet implemented');
        return res.redirect(`/admin/students/${studentId}`);
      }

      return res.redirect(`/admin/students/${studentId}`);
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

    if (format === 'csv') {
      const csvData = generateComprehensiveStudentCSV(students);
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `students_comprehensive_export_${timestamp}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.send(csvData);
    } else if (format === 'json') {
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `students_comprehensive_export_${timestamp}.json`;
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.json(students);
    }
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

// Delete student (soft delete by deactivating)
const deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Validate studentId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid student ID format' 
      });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: 'Student not found' });
    }

    // Check if student is already deleted
    if (student.deletedAt) {
      return res.status(400).json({ 
        success: false, 
        message: 'Student has already been deleted' 
      });
    }

    // Store student info for logging
    const studentInfo = {
      id: student._id,
      name: `${student.firstName} ${student.lastName}`,
      email: student.studentEmail,
      username: student.username
    };

    // Soft delete by deactivating and marking as deleted
    student.isActive = false;
    student.deletedAt = new Date();
    student.deletedBy = req.session.user?.id || 'admin';
    await student.save();

    // Log the action with detailed information
    console.log(`Admin ${req.session.user?.username || 'unknown'} deleted student:`, {
      studentId: studentInfo.id,
      studentName: studentInfo.name,
      studentEmail: studentInfo.email,
      deletedAt: new Date().toISOString(),
      deletedBy: req.session.user?.id || 'unknown'
    });

    return res.json({
      success: true,
      message: 'Student has been successfully deleted from the system',
      deletedStudent: {
        id: studentInfo.id,
        name: studentInfo.name,
        email: studentInfo.email
      }
    });
  } catch (error) {
    console.error('Error deleting student:', error);
    
    // Handle specific database errors
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid student ID format' 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to delete student. Please try again or contact support if the problem persists.' 
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

// Generate CSV for a single student's detailed export
const generateSingleStudentCSV = (exportData) => {
  const {
    personalInfo,
    courseProgress,
    quizPerformance,
    purchaseHistory,
    analytics,
  } = exportData;

  let csvRows = [];

  // Personal Information Section
  csvRows.push('PERSONAL INFORMATION');
  csvRows.push(
    'Student Code,First Name,Last Name,Email,Username,Grade,School,Phone,Parent Phone,Status,Enrollment Date,Last Login'
  );
  csvRows.push(
    `"${personalInfo.studentCode}","${personalInfo.firstName}","${
      personalInfo.lastName
    }","${personalInfo.email}","${personalInfo.username}","${
      personalInfo.grade
    }","${personalInfo.schoolName}","${personalInfo.phone}","${
      personalInfo.parentPhone
    }","${personalInfo.isActive ? 'Active' : 'Inactive'}","${new Date(
      personalInfo.enrollmentDate
    ).toLocaleDateString()}","${
      personalInfo.lastLogin
        ? new Date(personalInfo.lastLogin).toLocaleDateString()
        : 'Never'
    }"`
  );
  csvRows.push('');

  // Analytics Summary
  csvRows.push('ANALYTICS SUMMARY');
  csvRows.push(
    'Total Time Spent (hours),Average Quiz Score,Completion Rate,Engagement Score'
  );
  csvRows.push(
    `"${analytics.totalTimeSpent}","${analytics.averageQuizScore}%","${analytics.completionRate}%","${analytics.engagementScore}/100"`
  );
  csvRows.push('');

  // Course Progress
  if (courseProgress.length > 0) {
    csvRows.push('COURSE PROGRESS');
    csvRows.push(
      'Course Title,Course Code,Enrollment Date,Progress,Status,Last Accessed'
    );
    courseProgress.forEach((course) => {
      csvRows.push(
        `"${course.courseTitle}","${course.courseCode}","${new Date(
          course.enrollmentDate
        ).toLocaleDateString()}","${course.progress}%","${course.status}","${
          course.lastAccessed
            ? new Date(course.lastAccessed).toLocaleDateString()
            : 'N/A'
        }"`
      );
    });
    csvRows.push('');
  }

  // Quiz Performance
  if (quizPerformance.length > 0) {
    csvRows.push('QUIZ PERFORMANCE');
    csvRows.push(
      'Quiz Title,Quiz Code,Best Score,Average Score,Number of Attempts,Pass Rate'
    );
    quizPerformance.forEach((quiz) => {
      csvRows.push(
        `"${quiz.quizTitle}","${quiz.code}","${quiz.bestScore}%","${quiz.averageScore}%","${quiz.attempts}","${quiz.passRate}%"`
      );
    });
    csvRows.push('');
  }

  // Purchase History
  if (purchaseHistory.length > 0) {
    csvRows.push('PURCHASE HISTORY');
    csvRows.push(
      'Bundle Title,Bundle Code,Price,Purchase Date,Expiry Date,Status'
    );
    purchaseHistory.forEach((purchase) => {
      csvRows.push(
        `"${purchase.bundleTitle}","${purchase.bundleCode}","$${
          purchase.price
        }","${new Date(purchase.purchaseDate).toLocaleDateString()}","${
          purchase.expiryDate
            ? new Date(purchase.expiryDate).toLocaleDateString()
            : 'N/A'
        }","${purchase.status}"`
      );
    });
  }

  return csvRows.join('\n');
};

const generateStudentCSV = (students) => {
  const headers = [
    'Student Code',
    'First Name',
    'Last Name',
    'Email',
    'Username',
    'Grade',
    'School',
    'Status',
    'Enrollment Date',
    'Total Courses',
    'Active Courses',
    'Completed Courses',
    'Total Bundles',
  ];

  const csvRows = [headers.join(',')];

  students.forEach((student) => {
    const row = [
      student.studentCode,
      student.firstName,
      student.lastName,
      student.studentEmail,
      student.username,
      student.grade,
      student.schoolName,
      student.isActive ? 'Active' : 'Inactive',
      new Date(student.createdAt).toLocaleDateString(),
      student.enrolledCourses ? student.enrolledCourses.length : 0,
      student.enrolledCourses
        ? student.enrolledCourses.filter((ec) => ec.status === 'active').length
        : 0,
      student.enrolledCourses
        ? student.enrolledCourses.filter((ec) => ec.status === 'completed')
            .length
        : 0,
      student.purchasedBundles ? student.purchasedBundles.length : 0,
    ];

    csvRows.push(row.map((field) => `"${field}"`).join(','));
  });

  return csvRows.join('\n');
};

// Enhanced comprehensive CSV generation
const generateComprehensiveStudentCSV = (students) => {
  const headers = [
    'Student Code',
    'First Name',
    'Last Name',
    'Email',
    'Username',
    'Grade',
    'School Name',
    'English Teacher',
    'Phone Number',
    'Parent Phone',
    'Parent Country Code',
    'Status',
    'Enrollment Date',
    'Last Login',
    'Days Since Enrollment',
    'Days Since Last Activity',
    'Total Enrolled Courses',
    'Active Courses',
    'Completed Courses',
    'Total Purchased Bundles',
    'Active Bundles',
    'Total Quiz Attempts',
    'Average Quiz Score',
    'Best Quiz Score',
    'Overall Progress (%)',
    'Total Time Spent (hours)',
    'Engagement Score',
    'Course Details',
    'Bundle Details',
    'Quiz Performance Details'
  ];

  const rows = students.map(student => {
    const totalCourses = student.enrolledCourses?.length || 0;
    const activeCourses = student.enrolledCourses?.filter(ec => ec.status === 'active').length || 0;
    const completedCourses = student.enrolledCourses?.filter(ec => ec.progress >= 100).length || 0;
    const totalBundles = student.purchasedBundles?.length || 0;
    const activeBundles = student.purchasedBundles?.filter(pb => pb.status === 'active').length || 0;
    const totalQuizAttempts = student.quizAttempts?.reduce((sum, qa) => sum + qa.attempts.length, 0) || 0;
    const averageQuizScore = calculateAverageQuizScore(student);
    const bestQuizScore = student.quizAttempts?.reduce((best, qa) => {
      const maxScore = Math.max(...qa.attempts.map(a => a.score || 0), 0);
      return Math.max(best, maxScore);
    }, 0) || 0;
    const overallProgress = totalCourses > 0 ? 
      Math.round(student.enrolledCourses.reduce((sum, ec) => sum + (ec.progress || 0), 0) / totalCourses) : 0;
    const engagementScore = calculateEngagementScore(student, []);
    
    const enrollmentDate = student.createdAt ? new Date(student.createdAt) : null;
    const lastLogin = student.lastLogin ? new Date(student.lastLogin) : null;
    const now = new Date();
    
    const daysSinceEnrollment = enrollmentDate ? 
      Math.floor((now - enrollmentDate) / (1000 * 60 * 60 * 24)) : 0;
    const daysSinceLastActivity = lastLogin ? 
      Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24)) : null;

    // Course details
    const courseDetails = student.enrolledCourses?.map(ec => 
      `${ec.course?.title || 'Unknown'} (${ec.progress || 0}%)`
    ).join('; ') || 'None';

    // Bundle details
    const bundleDetails = student.purchasedBundles?.map(pb => 
      `${pb.bundle?.title || 'Unknown'} - ${pb.status || 'Unknown'}`
    ).join('; ') || 'None';

    // Quiz performance details
    const quizDetails = student.quizAttempts?.map(qa => 
      `${qa.quiz?.title || 'Quiz'}: ${Math.max(...qa.attempts.map(a => a.score || 0), 0)}% (${qa.attempts.length} attempts)`
    ).join('; ') || 'None';

    return [
      student.studentCode || '',
      student.firstName || '',
      student.lastName || '',
      student.studentEmail || '',
      student.username || '',
      student.grade || '',
      student.schoolName || '',
      student.englishTeacher || '',
      student.studentNumber || '',
      student.parentNumber || '',
      student.parentCountryCode || '',
      student.isActive ? 'Active' : 'Inactive',
      enrollmentDate ? enrollmentDate.toLocaleDateString() : '',
      lastLogin ? lastLogin.toLocaleDateString() : 'Never',
      daysSinceEnrollment,
      daysSinceLastActivity !== null ? daysSinceLastActivity : 'Never',
      totalCourses,
      activeCourses,
      completedCourses,
      totalBundles,
      activeBundles,
      totalQuizAttempts,
      averageQuizScore,
      bestQuizScore,
      overallProgress,
      '0', // Total time spent - would need to calculate from progress data
      engagementScore,
      courseDetails,
      bundleDetails,
      quizDetails
    ];
  });

  // Add metadata header
  const metadata = [
    `# Elkably Student Management System - Comprehensive Export`,
    `# Generated on: ${new Date().toLocaleString()}`,
    `# Total Students: ${students.length}`,
    `# Export Type: Comprehensive Student Data`,
    `#`,
    ``
  ];

  const csvContent = [
    ...metadata,
    headers.join(','),
    ...rows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  return csvContent;
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
        prevPage: page - 1
      },
      filters: {
        testType: req.query.testType || 'all',
        isActive: req.query.isActive,
        search: req.query.search || ''
      },
      stats,
      testTypes,
      currentUrl: req.originalUrl
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
      return res.json({ success: false, message: 'Brilliant student not found' });
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
        displayOrder: student.displayOrder
      }
    });
  } catch (error) {
    console.error('Error fetching brilliant student details:', error);
    res.json({ success: false, message: 'Failed to fetch brilliant student details' });
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
      displayOrder
    } = req.body;
    
    console.log('Received data:', req.body);
    
    // Validate required fields
    if (!name || !testType || !score || !fallbackInitials) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields (name, test type, score, fallback initials)',
        field: !name ? 'name' : !testType ? 'testType' : !score ? 'score' : 'fallbackInitials'
      });
    }
    
    // Set maxScore based on test type if not provided
    let finalMaxScore = parseInt(maxScore);
    if (!finalMaxScore || isNaN(finalMaxScore)) {
      switch(testType) {
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
            message: 'Invalid test type. Must be EST, DSAT, or ACT'
          });
      }
    }
    
    const finalScore = parseInt(score);
    if (isNaN(finalScore)) {
      return res.status(400).json({
        success: false,
        message: 'Score must be a valid number'
      });
    }
    
    // Validate score ranges
    if (testType === 'EST' && (finalScore < 0 || finalScore > 800 || finalMaxScore !== 800)) {
      return res.status(400).json({
        success: false,
        message: 'EST scores must be between 0-800',
        maxAllowed: 800
      });
    } else if (testType === 'DSAT' && (finalScore < 0 || finalScore > 1600 || finalMaxScore !== 1600)) {
      return res.status(400).json({
        success: false,
        message: 'DSAT scores must be between 0-1600',
        maxAllowed: 1600
      });
    } else if (testType === 'ACT' && (finalScore < 0 || finalScore > 36 || finalMaxScore !== 36)) {
      return res.status(400).json({
        success: false,
        message: 'ACT scores must be between 0-36',
        maxAllowed: 36
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
      image: image || null
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
        percentage: student.percentage
      }
    });
  } catch (error) {
    console.error('Error creating brilliant student:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to create brilliant student',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
        message: 'Invalid student ID'
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
      displayOrder
    } = req.body;
    
    console.log('Updating student:', studentId, 'with data:', req.body);
    
    // Validate required fields
    if (!name || !testType || !score || !fallbackInitials) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields (name, test type, score, fallback initials)',
        field: !name ? 'name' : !testType ? 'testType' : !score ? 'score' : 'fallbackInitials'
      });
    }
    
    // Set maxScore based on test type if not provided
    let finalMaxScore = parseInt(maxScore);
    if (!finalMaxScore || isNaN(finalMaxScore)) {
      switch(testType) {
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
            message: 'Invalid test type. Must be EST, DSAT, or ACT'
          });
      }
    }
    
    const finalScore = parseInt(score);
    if (isNaN(finalScore)) {
      return res.status(400).json({
        success: false,
        message: 'Score must be a valid number'
      });
    }
    
    // Validate score ranges
    if (testType === 'EST' && (finalScore < 0 || finalScore > 800 || finalMaxScore !== 800)) {
      return res.status(400).json({
        success: false,
        message: 'EST scores must be between 0-800',
        maxAllowed: 800
      });
    } else if (testType === 'DSAT' && (finalScore < 0 || finalScore > 1600 || finalMaxScore !== 1600)) {
      return res.status(400).json({
        success: false,
        message: 'DSAT scores must be between 0-1600',
        maxAllowed: 1600
      });
    } else if (testType === 'ACT' && (finalScore < 0 || finalScore > 36 || finalMaxScore !== 36)) {
      return res.status(400).json({
        success: false,
        message: 'ACT scores must be between 0-36',
        maxAllowed: 36
      });
    }
    
    const updateData = {
      name: name.trim(),
      testType,
      score: finalScore,
      maxScore: finalMaxScore,
      fallbackInitials: fallbackInitials.trim().toUpperCase(),
      isActive: isActive === 'true' || isActive === true,
      displayOrder: parseInt(displayOrder) || 0
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
        message: 'Brilliant student not found'
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
        percentage: student.percentage
      }
    });
  } catch (error) {
    console.error('Error updating brilliant student:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to update brilliant student',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
      return res.json({ success: false, message: 'Brilliant student not found' });
    }
    
    res.json({ success: true, message: 'Brilliant student deleted successfully' });
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
    const activeStudents = await BrilliantStudent.countDocuments({ isActive: true });
    
    res.json({
      success: true,
      stats: {
        total: totalStudents,
        active: activeStudents,
        inactive: totalStudents - activeStudents,
        byTestType: stats
      }
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
    
    const students = await BrilliantStudent.find(filter)
      .sort({ testType: 1, displayOrder: 1, percentage: -1 });
    
    // Convert to CSV format
    const csvHeader = 'Name,Test Type,Score,Max Score,Percentage,Category,University,Major,Graduation Year,Active,Display Order,Testimonial\n';
    const csvRows = students.map(student => {
      return [
        student.name,
        student.testType,
        student.score,
        student.maxScore,
        student.percentage,
        student.category,
        student.university || '',
        student.major || '',
        student.graduationYear || '',
        student.isActive ? 'Yes' : 'No',
        student.displayOrder,
        student.testimonial || ''
      ].join(',');
    }).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=brilliant-students.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting brilliant students:', error);
    req.flash('error', 'Failed to export brilliant students data');
    res.redirect('/admin/brilliant-students');
  }
};

module.exports = {
  getAdminDashboard,
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
  getContentDetails,
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
  exportBrilliantStudents
};
