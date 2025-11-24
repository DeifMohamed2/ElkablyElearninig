const BundleCourse = require('../models/BundleCourse');
const Course = require('../models/Course');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const BrilliantStudent = require('../models/BrilliantStudent');
const GameRoom = require('../models/GameRoom');
const TeamMember = require('../models/TeamMember');

// Get landing page data
const getLandingPage = async (req, res) => {
  try {
    // Execute all database queries in parallel for better performance
    const [
      onlineBundles,
      ongroundBundles,
      recordedBundles,
      featuredQuizzes,
      testCounts,
      featuredGameRooms,
      stats,
      brilliantStudents,
      teamMembers,
      user
    ] = await Promise.all([
      // Get featured bundles with minimal data
      BundleCourse.find({
        courseType: 'online',
        status: 'published',
        isActive: true,
      })
        .select('title shortDescription price image courseType createdAt')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),

      BundleCourse.find({
        courseType: 'onground',
        status: 'published',
        isActive: true,
      })
        .select('title shortDescription price image courseType createdAt')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),

      BundleCourse.find({
        courseType: 'recorded',
        status: 'published',
        isActive: true,
      })
        .select('title shortDescription price image courseType createdAt')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),

      // Get featured quizzes with minimal data
      Quiz.find({
        status: 'active',
      })
        .select('title description testType difficulty timeLimit totalQuestions createdAt')
        .sort({ createdAt: -1 })
        .limit(4)
        .lean(),

      // Get test counts in parallel
      Promise.all([
        Quiz.countDocuments({ testType: 'EST', status: 'active' }),
        Quiz.countDocuments({ testType: 'SAT', status: 'active' }),
        Quiz.countDocuments({ testType: 'ACT', status: 'active' }),
      ]).then(([EST, SAT, ACT]) => ({ EST, SAT, ACT })),

      // Get featured game rooms with minimal data
      GameRoom.find({
        isActive: true,
        isPublic: true,
        gameState: { $in: ['waiting', 'starting'] },
      })
        .select('title gameState currentPlayers maxPlayers totalTime questions category difficulty createdAt')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),

      // Get stats in parallel
      Promise.all([
        BundleCourse.countDocuments({
          courseType: 'online',
          status: 'published',
          isActive: true,
        }),
        BundleCourse.countDocuments({
          courseType: 'onground',
          status: 'published',
          isActive: true,
        }),
        BundleCourse.countDocuments({
          courseType: 'recorded',
          status: 'published',
          isActive: true,
        }),
        Quiz.countDocuments({ status: 'active' }),
        GameRoom.countDocuments({
          isActive: true,
          isPublic: true,
        }),
        BundleCourse.aggregate([
          { $match: { status: 'published', isActive: true } },
          { $project: { enrolledCount: { $size: '$enrolledStudents' } } },
          { $group: { _id: null, total: { $sum: '$enrolledCount' } } },
        ])
      ]).then(([onlineBundles, ongroundBundles, recordedBundles, totalQuizzes, totalGameRooms, totalStudents]) => ({
        onlineBundles,
        ongroundBundles,
        recordedBundles,
        totalQuizzes,
        totalGameRooms,
        totalStudents: totalStudents[0]?.total || 0,
      })),

      // Get brilliant students for each test type in parallel (load all active students)
      Promise.all([
        BrilliantStudent.getByTestType('EST'),
        BrilliantStudent.getByTestType('DSAT'),
        BrilliantStudent.getByTestType('ACT'),
      ]).then(([est, dsat, act]) => ({ est, dsat, act })),

      // Get team members
      TeamMember.getActiveMembers(),

      // Get user data if logged in (minimal data)
      req.session.user ? User.findById(req.session.user.id): null
    ]);



    res.render('index', {
      title: 'Home | ELKABLY',
      theme: req.cookies.theme || 'light',
      onlineBundles,
      ongroundBundles,
      recordedBundles,
      featuredQuizzes,
      featuredGameRooms,
      user,
      cart: req.session.cart || [],
      testCounts,
      brilliantStudents,
      teamMembers,
      stats,
    });
  } catch (error) {
    console.error('Error fetching landing page data:', error);
    res.render('index', {
      title: 'Home | ELKABLY',
      theme: req.cookies.theme || 'light',
      onlineBundles: [],
      ongroundBundles: [],
      recordedBundles: [],
      featuredQuizzes: [],
      featuredGameRooms: [],
      cart: req.session.cart || [],
      testCounts: { EST: 0, SAT: 0, ACT: 0 },
      brilliantStudents: {
        est: [],
        dsat: [],
        act: [],
      },
      teamMembers: [],
      stats: {
        onlineBundles: 0,
        ongroundBundles: 0,
        recordedBundles: 0,
        totalQuizzes: 0,
        totalGameRooms: 0,
        totalStudents: 0,
      },
    });
  }
};

// Get online courses page
const getOnlineCourses = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, subject, testType } = req.query;

    const filter = {
      courseType: 'online',
      status: 'published',
      isActive: true,
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } },
      ];
    }
    if (subject) filter.subject = subject;
    if (testType) filter.testType = testType;

    console.log('Online courses filter:', filter);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bundles = await BundleCourse.find(filter)
      .populate('courses')
      .populate('createdBy', 'userName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log('Found online bundles:', bundles.length);

    const totalBundles = await BundleCourse.countDocuments(filter);
    const totalPages = Math.ceil(totalBundles / parseInt(limit));

    // Get filter options
    const subjects = await BundleCourse.distinct('subject', {
      courseType: 'online',
      status: 'published',
      isActive: true,
    });
    const testTypes = await BundleCourse.distinct('testType', {
      courseType: 'online',
      status: 'published',
      isActive: true,
    });

    // Get user with purchase information if logged in
    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user.id);
      // .populate('wishlist.courses')
      // .populate('wishlist.bundles');
      // .populate('purchasedBundles.bundle')
      // .populate('purchasedCourses.course')
      // .populate('enrolledCourses.course');
    }

    res.render('online-courses', {
      title: 'Online Courses | ELKABLY',
      theme: req.cookies.theme || 'light',
      bundles,
      user,
      cart: req.session.cart || [],
      filterOptions: { subjects, testTypes },
      currentFilters: { search, subject, testType },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBundles,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching online courses:', error);
    req.flash('error_msg', 'Error loading online courses');
    res.render('online-courses', {
      title: 'Online Courses | ELKABLY',
      theme: req.cookies.theme || 'light',
      bundles: [],
      cart: req.session.cart || [],
      filterOptions: { subjects: [], testTypes: [] },
      currentFilters: {},
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalBundles: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  }
};

// Get onground courses page
const getOngroundCourses = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, subject, testType } = req.query;

    const filter = {
      courseType: 'onground',
      status: 'published',
      isActive: true,
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } },
      ];
    }
    if (subject) filter.subject = subject;
    if (testType) filter.testType = testType;

    console.log('Onground courses filter:', filter);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bundles = await BundleCourse.find(filter)
      .populate('courses')
      .populate('createdBy', 'userName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log('Found onground bundles:', bundles.length);

    const totalBundles = await BundleCourse.countDocuments(filter);
    const totalPages = Math.ceil(totalBundles / parseInt(limit));

    // Get filter options
    const subjects = await BundleCourse.distinct('subject', {
      courseType: 'onground',
      status: 'published',
      isActive: true,
    });
    const testTypes = await BundleCourse.distinct('testType', {
      courseType: 'onground',
      status: 'published',
      isActive: true,
    });

    // Get user with purchase information if logged in
    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user.id);
      // .populate('wishlist.courses')
      // .populate('wishlist.bundles');
      // .populate('purchasedBundles.bundle')
      // .populate('purchasedCourses.course')
      // .populate('enrolledCourses.course');
    }

    res.render('onground-courses', {
      title: 'On-Ground Courses | ELKABLY',
      theme: req.cookies.theme || 'light',
      bundles,
      user,
      cart: req.session.cart || [],
      filterOptions: { subjects, testTypes },
      currentFilters: { search, subject, testType },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBundles,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching onground courses:', error);
    req.flash('error_msg', 'Error loading onground courses');
    res.render('onground-courses', {
      title: 'On-Ground Courses | ELKABLY',
      theme: req.cookies.theme || 'light',
      bundles: [],
      cart: req.session.cart || [],
      filterOptions: { subjects: [], testTypes: [] },
      currentFilters: {},
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalBundles: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  }
};

// Get recorded courses page
const getRecordedCourses = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, subject, testType } = req.query;

    const filter = {
      courseType: 'recorded',
      status: 'published',
      isActive: true,
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } },
      ];
    }
    if (subject) filter.subject = subject;
    if (testType) filter.testType = testType;

    console.log('Recorded courses filter:', filter);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bundles = await BundleCourse.find(filter)
      .populate('courses')
      .populate('createdBy', 'userName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log('Found recorded bundles:', bundles.length);

    const totalBundles = await BundleCourse.countDocuments(filter);
    const totalPages = Math.ceil(totalBundles / parseInt(limit));

    // Get filter options
    const subjects = await BundleCourse.distinct('subject', {
      courseType: 'recorded',
      status: 'published',
      isActive: true,
    });
    const testTypes = await BundleCourse.distinct('testType', {
      courseType: 'recorded',
      status: 'published',
      isActive: true,
    });

    // Get user with purchase information if logged in
    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user.id);
    }

    res.render('recorded-courses', {
      title: 'Recorded Courses | ELKABLY',
      theme: req.cookies.theme || 'light',
      bundles,
      user,
      cart: req.session.cart || [],
      filterOptions: { subjects, testTypes },
      currentFilters: { search, subject, testType },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBundles,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching recorded courses:', error);
    req.flash('error_msg', 'Error loading recorded courses');
    res.render('recorded-courses', {
      title: 'Recorded Courses | ELKABLY',
      theme: req.cookies.theme || 'light',
      bundles: [],
      cart: req.session.cart || [],
      filterOptions: { subjects: [], testTypes: [] },
      currentFilters: {},
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalBundles: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  }
};

// Get bundle course content (all courses in the bundle)
const getBundleContent = async (req, res) => {
  try {
    const { id } = req.params;

    const bundle = await BundleCourse.findById(id)
      .populate('courses')
      .populate('createdBy', 'userName')
      .populate('enrolledStudents', 'userName email');

    if (!bundle) {
      req.flash('error_msg', 'Bundle course not found');
      return res.redirect('/courses');
    }

    if (bundle.status !== 'published' || !bundle.isActive) {
      req.flash('error_msg', 'This bundle course is not available');
      return res.redirect('/courses');
    }

    // Get related bundles
    const relatedBundles = await BundleCourse.find({
      _id: { $ne: bundle._id },
      courseType: bundle.courseType,
      status: 'published',
      isActive: true,
    })
      .populate('courses')
      .limit(4);

    // Get user with purchase information if logged in
    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user.id);
      // .populate('wishlist.courses')
      // .populate('wishlist.bundles');
      // .populate('purchasedBundles.bundle')
      // .populate('purchasedCourses.course')
      // .populate('enrolledCourses.course');
    }

    res.render('bundle-content', {
      title: `${bundle.title} | ELKABLY`,
      theme: req.cookies.theme || 'light',
      bundle,
      relatedBundles,
      user,
      cart: req.session.cart || [],
    });
  } catch (error) {
    console.error('Error fetching bundle content:', error);
    req.flash('error_msg', 'Error loading bundle content');
    res.redirect('/courses');
  }
};

// Get EST test type page
const getESTTests = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, difficulty } = req.query;
    const skip = (page - 1) * limit;

    const filter = {
      testType: 'EST',
      status: 'active',
      isDeleted: { $ne: true },
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (difficulty) filter.difficulty = difficulty;

    const quizzes = await Quiz.find(filter)
      .populate('questionBank', 'name bankCode description totalQuestions')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean({ virtuals: true });

    const total = await Quiz.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Get filter options
    const difficulties = await Quiz.distinct('difficulty', {
      testType: 'EST',
      status: 'active',
    });

    const user = req.session.user || null;

    res.render('test-type', {
      title: 'EST Test Preparation | ELKABLY',
      theme: req.cookies.theme || 'light',
      testType: 'EST',
      testTypeName: 'Egyptian Scholastic Test',
      testTypeDescription:
        'Comprehensive preparation for the Egyptian Scholastic Test with math and science focus',
      quizzes,
      user,
      cart: req.session.cart || [],
      filterOptions: { difficulties },
      currentFilters: { search, difficulty },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page < totalPages ? parseInt(page) + 1 : null,
        prevPage: page > 1 ? parseInt(page) - 1 : null,
      },
    });
  } catch (error) {
    console.error('Error fetching EST tests:', error);
    res.status(500).render('500', {
      title: 'Server Error',
      theme: req.cookies.theme || 'light',
      error: 'Failed to load EST tests',
    });
  }
};

// Get SAT test type page
const getSATTests = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, difficulty } = req.query;
    const skip = (page - 1) * limit;

    const filter = {
      testType: 'SAT',
      status: 'active',
      isDeleted: { $ne: true },
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (difficulty) filter.difficulty = difficulty;

    const quizzes = await Quiz.find(filter)
      .populate('questionBank', 'name bankCode description totalQuestions')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean({ virtuals: true });

    const total = await Quiz.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Get filter options
    const difficulties = await Quiz.distinct('difficulty', {
      testType: 'SAT',
      status: 'active',
    });

    const user = req.session.user || null;

    res.render('test-type', {
      title: 'SAT Test Preparation | ELKABLY',
      theme: req.cookies.theme || 'light',
      testType: 'SAT',
      testTypeName: 'Scholastic Assessment Test',
      testTypeDescription:
        'Comprehensive preparation for the Scholastic Assessment Test for college admissions',
      quizzes,
      user,
      cart: req.session.cart || [],
      filterOptions: { difficulties },
      currentFilters: { search, difficulty },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page < totalPages ? parseInt(page) + 1 : null,
        prevPage: page > 1 ? parseInt(page) - 1 : null,
      },
    });
  } catch (error) {
    console.error('Error fetching SAT tests:', error);
    res.status(500).render('500', {
      title: 'Server Error',
      theme: req.cookies.theme || 'light',
      error: 'Failed to load SAT tests',
    });
  }
};

// Get ACT test type page
const getACTTests = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, difficulty } = req.query;
    const skip = (page - 1) * limit;

    const filter = {
      testType: 'ACT',
      status: 'active',
      isDeleted: { $ne: true },
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (difficulty) filter.difficulty = difficulty;

    const quizzes = await Quiz.find(filter)
      .populate('questionBank', 'name bankCode description totalQuestions')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean({ virtuals: true });

    const total = await Quiz.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Get filter options
    const difficulties = await Quiz.distinct('difficulty', {
      testType: 'ACT',
      status: 'active',
    });

    const user = req.session.user || null;

    res.render('test-type', {
      title: 'ACT Test Preparation | ELKABLY',
      theme: req.cookies.theme || 'light',
      testType: 'ACT',
      testTypeName: 'American College Testing',
      testTypeDescription:
        'Comprehensive preparation for the American College Testing with science reasoning',
      quizzes,
      user,
      cart: req.session.cart || [],
      filterOptions: { difficulties },
      currentFilters: { search, difficulty },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page < totalPages ? parseInt(page) + 1 : null,
        prevPage: page > 1 ? parseInt(page) - 1 : null,
      },
    });
  } catch (error) {
    console.error('Error fetching ACT tests:', error);
    res.status(500).render('500', {
      title: 'Server Error',
      theme: req.cookies.theme || 'light',
      error: 'Failed to load ACT tests',
    });
  }
};

module.exports = {
  getLandingPage,
  getOnlineCourses,
  getOngroundCourses,
  getRecordedCourses,
  getBundleContent,
  getESTTests,
  getSATTests,
  getACTTests,
};
