const BundleCourse = require('../models/BundleCourse');
const Course = require('../models/Course');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const BrilliantStudent = require('../models/BrilliantStudent');
const GameRoom = require('../models/GameRoom');

// Get landing page data
const getLandingPage = async (req, res) => {
  try {
    // Get featured online bundles
    const onlineBundles = await BundleCourse.find({ 
      courseType: 'online', 
      status: 'published',
      isActive: true 
    })
    .populate('courses')
    .sort({ createdAt: -1 })
    .limit(6);

    console.log('Landing page - Found online bundles:', onlineBundles.length);

    // Get featured onground bundles
    const ongroundBundles = await BundleCourse.find({ 
      courseType: 'onground', 
      status: 'published',
      isActive: true 
    })
    .populate('courses')
    .sort({ createdAt: -1 })
    .limit(6);

    console.log('Landing page - Found onground bundles:', ongroundBundles.length);

    // Get featured quizzes for free tests section
    const featuredQuizzes = await Quiz.find({
      status: 'active'
    })
    .populate('questionBank', 'name description')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .limit(4)
    .lean({ virtuals: true });

    console.log('Landing page - Found featured quizzes:', featuredQuizzes.length);

    // Get featured game rooms for the games section
    const featuredGameRooms = await GameRoom.find({
      isActive: true,
      isPublic: true,
      gameState: { $in: ['waiting', 'starting'] }
    })
    .populate('createdBy', 'username')
    .populate('currentPlayers.user', 'username profilePicture')
    .sort({ createdAt: -1 })
    .limit(6);

    console.log('Landing page - Found featured game rooms:', featuredGameRooms.length);

    // Get stats
    const totalOnlineBundles = await BundleCourse.countDocuments({ 
      courseType: 'online', 
      status: 'published',
      isActive: true 
    });
    
    const totalOngroundBundles = await BundleCourse.countDocuments({ 
      courseType: 'onground', 
      status: 'published',
      isActive: true 
    });

    const totalQuizzes = await Quiz.countDocuments({ status: 'active' });
    const totalGameRooms = await GameRoom.countDocuments({ 
      isActive: true, 
      isPublic: true 
    });

    console.log('Landing page - Total online bundles:', totalOnlineBundles);
    console.log('Landing page - Total onground bundles:', totalOngroundBundles);
    console.log('Landing page - Total quizzes:', totalQuizzes);
    console.log('Landing page - Total game rooms:', totalGameRooms);

    // Debug: Check all bundles regardless of status
    const allBundles = await BundleCourse.find({});
    console.log('All bundles in database:', allBundles.length);
    allBundles.forEach(bundle => {
      console.log(`Bundle: ${bundle.title}, Type: ${bundle.courseType}, Status: ${bundle.status}, Active: ${bundle.isActive}`);
    });

    const totalStudents = await BundleCourse.aggregate([
      { $match: { status: 'published', isActive: true } },
      { $project: { enrolledCount: { $size: '$enrolledStudents' } } },
      { $group: { _id: null, total: { $sum: '$enrolledCount' } } }
    ]);

    // Get brilliant students for each test type
    const [estStudents, dsatStudents, actStudents] = await Promise.all([
      BrilliantStudent.getByTestType('EST', 4),
      BrilliantStudent.getByTestType('DSAT', 4),
      BrilliantStudent.getByTestType('ACT', 4)
    ]);

    console.log('Landing page - Found EST students:', estStudents.length);
    console.log('Landing page - Found DSAT students:', dsatStudents.length);
    console.log('Landing page - Found ACT students:', actStudents.length);

    // Get user with purchase information if logged in
    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user.id)
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
      brilliantStudents: {
        est: estStudents,
        dsat: dsatStudents,
        act: actStudents
      },
      stats: {
        onlineBundles: totalOnlineBundles,
        ongroundBundles: totalOngroundBundles,
        totalQuizzes: totalQuizzes,
        totalGameRooms: totalGameRooms,
        totalStudents: totalStudents[0]?.total || 0
      }
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
      brilliantStudents: {
        est: [],
        dsat: [],
        act: []
      },
      stats: {
        onlineBundles: 0,
        ongroundBundles: 0,
        totalQuizzes: 0,
        totalGameRooms: 0,
        totalStudents: 0
      }
    });
  }
};

// Get online courses page
const getOnlineCourses = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, year, subject } = req.query;
    
    const filter = {
      courseType: 'online',
      status: 'published',
      isActive: true
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (year) filter.year = year;
    if (subject) filter.subject = subject;

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
    const years = await BundleCourse.distinct('year', { courseType: 'online', status: 'published' });
    const subjects = await BundleCourse.distinct('subject', { courseType: 'online', status: 'published' });

    // Get user with purchase information if logged in
    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user.id)
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
      filterOptions: { years, subjects },
      currentFilters: { search, year, subject },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBundles,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching online courses:', error);
    req.flash('error_msg', 'Error loading online courses');
    res.render('online-courses', {
      title: 'Online Courses - Mr Kably',
      theme: req.cookies.theme || 'light',
      bundles: [],
      cart: req.session.cart || [],
      filterOptions: { years: [], subjects: [] },
      currentFilters: {},
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalBundles: 0,
        hasNext: false,
        hasPrev: false
      }
    });
  }
};

// Get onground courses page
const getOngroundCourses = async (req, res) => {
  try {
    const { page = 1, limit = 12, search, year, subject } = req.query;
    
    const filter = {
      courseType: 'onground',
      status: 'published',
      isActive: true
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (year) filter.year = year;
    if (subject) filter.subject = subject;

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
    const years = await BundleCourse.distinct('year', { courseType: 'onground', status: 'published' });
    const subjects = await BundleCourse.distinct('subject', { courseType: 'onground', status: 'published' });

    // Get user with purchase information if logged in
    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user.id)
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
      filterOptions: { years, subjects },
      currentFilters: { search, year, subject },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBundles,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching onground courses:', error);
    req.flash('error_msg', 'Error loading onground courses');
    res.render('onground-courses', {
      title: 'On-Ground Courses - Mr Kably',
      theme: req.cookies.theme || 'light',
      bundles: [],
      cart: req.session.cart || [],
      filterOptions: { years: [], subjects: [] },
      currentFilters: {},
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalBundles: 0,
        hasNext: false,
        hasPrev: false
      }
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
      isActive: true
    })
    .populate('courses')
    .limit(4);

    // Get user with purchase information if logged in
    let user = null;
    if (req.session.user) {
      user = await User.findById(req.session.user.id)
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
      cart: req.session.cart || []
    });
  } catch (error) {
    console.error('Error fetching bundle content:', error);
    req.flash('error_msg', 'Error loading bundle content');
    res.redirect('/courses');
  }
};

module.exports = {
  getLandingPage,
  getOnlineCourses,
  getOngroundCourses,
  getBundleContent
};
