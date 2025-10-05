const BundleCourse = require('../models/BundleCourse');
const Course = require('../models/Course');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const BrilliantStudent = require('../models/BrilliantStudent');
const GameRoom = require('../models/GameRoom');

// Get landing page data
const getLandingPage = async (req, res) => {
  try {
    // Get featured online bundles
    const onlineBundles = await BundleCourse.find({
      courseType: 'online',
      status: 'published',
      isActive: true,
    })
      .populate('courses')
      .sort({ createdAt: -1 })
      .limit(6);

    console.log('Landing page - Found online bundles:', onlineBundles.length);

    // Get featured onground bundles
    const ongroundBundles = await BundleCourse.find({
      courseType: 'onground',
      status: 'published',
      isActive: true,
    })
      .populate('courses')
      .sort({ createdAt: -1 })
      .limit(6);

    console.log(
      'Landing page - Found onground bundles:',
      ongroundBundles.length
    );

    // Get featured quizzes for free tests section
    const featuredQuizzes = await Quiz.find({
      status: 'active',
    })
      .populate('questionBank', 'name description')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(4)
      .lean({ virtuals: true });

    console.log(
      'Landing page - Found featured quizzes:',
      featuredQuizzes.length
    );

    // Get test counts for each test type
    const testCounts = {
      EST: await Quiz.countDocuments({ testType: 'EST', status: 'active' }),
      SAT: await Quiz.countDocuments({ testType: 'SAT', status: 'active' }),
      ACT: await Quiz.countDocuments({ testType: 'ACT', status: 'active' }),
    };

    console.log('Test counts:', testCounts);

    // Get featured game rooms for the games section
    const featuredGameRooms = await GameRoom.find({
      isActive: true,
      isPublic: true,
      gameState: { $in: ['waiting', 'starting'] },
    })
      .populate('createdBy', 'username')
      .populate('currentPlayers.user', 'username profilePicture')
      .sort({ createdAt: -1 })
      .limit(6);

    console.log(
      'Landing page - Found featured game rooms:',
      featuredGameRooms.length
    );

    // Get stats
    const totalOnlineBundles = await BundleCourse.countDocuments({
      courseType: 'online',
      status: 'published',
      isActive: true,
    });

    const totalOngroundBundles = await BundleCourse.countDocuments({
      courseType: 'onground',
      status: 'published',
      isActive: true,
    });

    const totalQuizzes = await Quiz.countDocuments({ status: 'active' });
    const totalGameRooms = await GameRoom.countDocuments({
      isActive: true,
      isPublic: true,
    });

    console.log('Landing page - Total online bundles:', totalOnlineBundles);
    console.log('Landing page - Total onground bundles:', totalOngroundBundles);
    console.log('Landing page - Total quizzes:', totalQuizzes);
    console.log('Landing page - Total game rooms:', totalGameRooms);

    // Debug: Check all bundles regardless of status
    const allBundles = await BundleCourse.find({});
    console.log('All bundles in database:', allBundles.length);
    allBundles.forEach((bundle) => {
      console.log(
        `Bundle: ${bundle.title}, Type: ${bundle.courseType}, Status: ${bundle.status}, Active: ${bundle.isActive}`
      );
    });

    const totalStudents = await BundleCourse.aggregate([
      { $match: { status: 'published', isActive: true } },
      { $project: { enrolledCount: { $size: '$enrolledStudents' } } },
      { $group: { _id: null, total: { $sum: '$enrolledCount' } } },
    ]);

    // Get brilliant students for each test type
    const [estStudents, dsatStudents, actStudents] = await Promise.all([
      BrilliantStudent.getByTestType('EST', 4),
      BrilliantStudent.getByTestType('DSAT', 4),
      BrilliantStudent.getByTestType('ACT', 4),
    ]);

    console.log('Landing page - Found EST students:', estStudents.length);
    console.log('Landing page - Found DSAT students:', dsatStudents.length);
    console.log('Landing page - Found ACT students:', actStudents.length);

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

    res.render('index', {
      title: 'Mr Kably - Mathematics Learning Platform',
      theme: req.cookies.theme || 'light',
      onlineBundles,
      ongroundBundles,
      featuredQuizzes,
      featuredGameRooms,
      user,
      cart: req.session.cart || [],
      testCounts,
      brilliantStudents: {
        est: estStudents,
        dsat: dsatStudents,
        act: actStudents,
      },
      stats: {
        onlineBundles: totalOnlineBundles,
        ongroundBundles: totalOngroundBundles,
        totalQuizzes: totalQuizzes,
        totalGameRooms: totalGameRooms,
        totalStudents: totalStudents[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching landing page data:', error);
    res.render('index', {
      title: 'Mr Kably - Mathematics Learning Platform',
      theme: req.cookies.theme || 'light',
      onlineBundles: [],
      ongroundBundles: [],
      featuredQuizzes: [],
      featuredGameRooms: [],
      cart: req.session.cart || [],
      testCounts: { EST: 0, SAT: 0, ACT: 0 },
      brilliantStudents: {
        est: [],
        dsat: [],
        act: [],
      },
      stats: {
        onlineBundles: 0,
        ongroundBundles: 0,
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
      title: 'Online Courses - Mr Kably',
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
      title: 'Online Courses - Mr Kably',
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
      title: 'On-Ground Courses - Mr Kably',
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
      title: 'On-Ground Courses - Mr Kably',
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
      title: `${bundle.title} - Mr Kably`,
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
      title: 'EST Test Preparation - Mr Kably',
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
      title: 'SAT Test Preparation - Mr Kably',
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
      title: 'ACT Test Preparation - Mr Kably',
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
  getBundleContent,
  getESTTests,
  getSATTests,
  getACTTests,
};
