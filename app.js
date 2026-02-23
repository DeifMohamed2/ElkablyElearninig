const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const flash = require('connect-flash');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const methodOverride = require('method-override');
const compression = require('compression');
const morgan = require('morgan');

// Professional Logging System
const { logger, logSystem, logError, morganStream } = require('./utils/logger');
const { requestTracker, errorTracker } = require('./middlewares/requestTracker');

// Load environment variables
dotenv.config();

// Initialize Firebase Cloud Messaging (FCM) for push notifications
const firebaseNotificationService = require('./utils/firebaseNotificationService');
if (firebaseNotificationService.isReady()) {
  console.log('🔥 Firebase FCM is ready for push notifications');
} else {
  console.warn('⚠️ Firebase FCM not configured - push notifications disabled');
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'dusod9wxt',
  api_key: process.env.CLOUDINARY_API_KEY || '353635965973632',
  api_secret:
    process.env.CLOUDINARY_API_SECRET || 'rFWFSn4g-dHGj48o3Uu1YxUMZww',
});

// Configure multer for document uploads (PDFs, etc. - 100MB limit)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for documents
  },
  fileFilter: (req, file, cb) => {
    // Allow specific file types (documents only, images handled separately)
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];

    const allowedExtensions = /\.(pdf|doc|docx|txt)$/i;

    if (
      allowedMimeTypes.includes(file.mimetype) &&
      allowedExtensions.test(file.originalname)
    ) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'));
    }
  },
});

// Configure multer for image uploads (5MB limit)
const imageStorage = multer.memoryStorage();
const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    const allowedExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;

    if (
      allowedMimeTypes.includes(file.mimetype) &&
      allowedExtensions.test(file.originalname)
    ) {
      return cb(null, true);
    } else {
      cb(
        new Error(
          'Only image files (JPEG, PNG, JPG, WebP, GIF) are allowed. Maximum size is 5MB.',
        ),
      );
    }
  },
});

// Get MongoDB connection for session store

// Create Express app
const app = express();

// Error handler for multer file upload errors
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // Check if it's an image upload (5MB limit) or document upload (100MB limit)
      const isImageUpload =
        req.path.includes('/upload/image') ||
        req.file?.mimetype?.startsWith('image/');
      const maxSize = isImageUpload ? '5MB' : '100MB';
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum file size is ${maxSize}.`,
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
    });
  }

  // Handle custom file filter errors
  if (
    err.message &&
    (err.message.includes('Only image files') ||
      err.message.includes('Maximum size is 5MB'))
  ) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next(err);
};

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Disable EJS template caching for development
app.set('view cache', false);

// Import CSS helper
const cssHelper = require('./helpers/cssHelper');

// Make CSS helper and cache buster available to all views
app.use((req, res, next) => {
  res.locals.cssHelper = cssHelper;
  res.locals.cacheBuster = Date.now();
  next();
});

// Middleware
app.use(compression({ level: 6, threshold: 1024 })); // Compress responses > 1KB

// HTTP request logging with Morgan (combined format to file)
app.use(morgan('combined', { stream: morganStream }));

// Development console logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Request tracking middleware (detailed logging)
app.use(requestTracker({
  slowRequestThreshold: 3000, // Log slow requests > 3 seconds
  excludePaths: ['/health', '/favicon.ico', '/robots.txt'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'elkably-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.DATABASE_URL,
      touchAfter: 24 * 3600, // lazy session update - only touch the session if it's been more than 24 hours
      ttl: 7 * 24 * 60 * 60, // 7 days session expiration
    }),
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    name: 'elkably.session', // Custom session name to avoid conflicts
  }),
);

app.use(flash());

// Static files with short cache time - ETag ensures fresh files when changed
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1m', // 1 minute cache - short enough to get updates quickly
    etag: true, // Enable ETags - browser will validate if file changed
    lastModified: true,
  }),
);

// Use multer error handler
app.use(handleMulterError);

// Global variables middleware
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.success = req.flash('success');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.info = req.flash('info');
  res.locals.info_msg = req.flash('info_msg');
  res.locals.user = req.session.user || null;
  res.locals.guestUser = req.session.guestUser || null;
  res.locals.cart = req.session.cart || [];
  res.locals.cartCount = req.session.cart ? req.session.cart.length : 0;
  res.locals.upload = upload;
  res.locals.imageUpload = imageUpload;
  res.locals.cloudinary = cloudinary;

  // Populate req.user for backward compatibility
  req.user = req.session.user || null;
  req.guestUser = req.session.guestUser || null;

  next();
});

// Routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/student');
const quizRoutes = require('./routes/quiz');
const purchaseRoutes = require('./routes/purchase');
const zoomRoutes = require('./routes/zoom');
const uploadRoutes = require('./routes/upload');
const parentRoutes = require('./routes/parent');
const guestRoutes = require('./routes/guest');
const {
  createStudentFromExternalSystem,
} = require('./controllers/authController');

// Special handling for webhook routes that need raw body
app.use('/purchase/webhook', express.raw({ type: 'application/json' }));

// External System API - Register endpoint (for external systems to create students)
// This endpoint accepts POST requests from external systems
app.post('/Register', express.json(), createStudentFromExternalSystem);

app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/student', studentRoutes);
app.use('/admin/quizzes', quizRoutes);
app.use('/purchase', purchaseRoutes);
app.use('/zoom', zoomRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/parent', parentRoutes);
app.use('/guest', guestRoutes);

// Error tracking middleware
app.use(errorTracker);

// Global error handler - must be before 404 handler
app.use((err, req, res, next) => {
  // Log error with full context
  logError('Global Error Handler', err, {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userId: req.session?.user?.id || req.session?.admin?._id,
  });
  console.error('Global error handler:', err);

  // If it's an API route (starts with /admin/ and expects JSON), return JSON
  if (
    req.path.startsWith('/admin/') &&
    (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')
  ) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'An error occurred',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // Otherwise, pass to next error handler or render error page
  next(err);
});

// 404 Error handler
app.use((req, res) => {
  // If it's an API route expecting JSON, return JSON 404
  if (
    req.path.startsWith('/admin/') &&
    (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')
  ) {
    return res.status(404).json({
      success: false,
      message: 'Route not found',
    });
  }

  res.status(404).render('404', {
    title: '404 - Page Not Found',
    theme: req.cookies.theme || 'light',
  });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Initialize Game Socket Handler
const GameSocketHandler = require('./utils/gameSocket');
new GameSocketHandler(io);

// Initialize Pending Payment Verification Job
const { startPendingPaymentJob } = require('./jobs/pendingPaymentVerification');

// Make io accessible in routes
app.set('io', io);
console.log('Socket.IO initialized', io.engine.clientsCount);

// Database connection and server startup
const dbURI = process.env.DATABASE_URL;
const PORT = process.env.PORT || 4091;

mongoose
  .connect(dbURI)
  .then((result) => {
    // Log database connection
    logSystem('DATABASE_CONNECTED', {
      database: dbURI.replace(/\/\/.*@/, '//**:**@'), // Hide credentials
    });
    logger.info('Database connected successfully');

    server.listen(PORT, '0.0.0.0', () => {
      // Log server startup
      logSystem('SERVER_STARTED', {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
      });
      
      console.log('Connected to database and listening on port', PORT);
      console.log('server is running in', 'http://localhost:' + PORT);
      console.log('Server is running on http://0.0.0.0:' + PORT);
      console.log('Server accessible on http://82.25.101.207:' + PORT);
      logger.info(`🚀 Server started on port ${PORT}`);

      // Start the pending payment verification job after server is ready
      startPendingPaymentJob();
    });
  })
  .catch((err) => {
    logError('Database connection failed', err);
    console.log('Database connection error:', err);
    process.exit(1);
  });

if (process.env.NODE_ENV === 'production') {
  console.log = console.warn = console.error = console.info = () => {};
}
