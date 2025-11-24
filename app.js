const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const methodOverride = require('method-override');

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'dusod9wxt',
  api_key: process.env.CLOUDINARY_API_KEY || '353635965973632',
  api_secret:
    process.env.CLOUDINARY_API_SECRET || 'rFWFSn4g-dHGj48o3Uu1YxUMZww',
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow specific file types
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];

    const allowedExtensions = /\.(pdf|doc|docx|txt|jpg|jpeg|png)$/i;

    if (
      allowedMimeTypes.includes(file.mimetype) &&
      allowedExtensions.test(file.originalname)
    ) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, TXT, and image files are allowed'));
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
      return res.status(413).json({
        success: false,
        message: 'File too large. Maximum file size is 100MB.',
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
    });
  }
  next(err);
};

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import CSS helper
const cssHelper = require('./helpers/cssHelper');

// Make CSS helper available to all views
app.use((req, res, next) => {
  res.locals.cssHelper = cssHelper;
  next();
});

// Middleware
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
      mongoUrl:
        'mongodb+srv://deif:1qaz2wsx@3devway.aa4i6ga.mongodb.net/Elkably-Elearning?retryWrites=true&w=majority&appName=Cluster0',
      touchAfter: 24 * 3600, // lazy session update - only touch the session if it's been more than 24 hours
      ttl: 7 * 24 * 60 * 60, // 7 days session expiration
    }),
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    name: 'elkably.session', // Custom session name to avoid conflicts
  })
);

// Session debugging middleware (commented out for production)
app.use((req, res, next) => {
  if (req.path.includes('/purchase/cart/add')) {
    console.log('Cart Add Request - Session ID:', req.sessionID);
    console.log('Cart Add Request - User in session:', req.session.user);
    console.log('Cart Add Request - Cart in session:', req.session.cart);
  }
  next();
});
app.use(flash());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

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
  res.locals.cart = req.session.cart || [];
  res.locals.cartCount = req.session.cart ? req.session.cart.length : 0;
  res.locals.upload = upload;
  res.locals.cloudinary = cloudinary;

  // Populate req.user for backward compatibility
  req.user = req.session.user || null;

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

// Special handling for webhook routes that need raw body
app.use('/purchase/webhook', express.raw({ type: 'application/json' }));

app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/student', studentRoutes);
app.use('/admin/quizzes', quizRoutes);
app.use('/purchase', purchaseRoutes);
app.use('/zoom', zoomRoutes);

// 404 Error handler
app.use((req, res) => {
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

// Make io accessible in routes
app.set('io', io);
console.log('Socket.IO initialized', io.engine.clientsCount);

// Database connection and server startup
const dbURI =
  'mongodb+srv://deif:1qaz2wsx@3devway.aa4i6ga.mongodb.net/Elkably-Elearning?retryWrites=true&w=majority&appName=Cluster0';
  // 'mongodb://localhost:27017/Elkably-Elearning';
const PORT = process.env.PORT || 4091;

mongoose
  .connect(dbURI)
  .then((result) => {
    server.listen(PORT, () => {
      console.log('Connected to database and listening on port', PORT);
      console.log('Server is running on http://localhost:' + PORT);
      console.log(`Socket.IO enabled for real-time game functionality`);
    });
  })
  .catch((err) => {
    console.log('Database connection error:', err);
    process.exit(1);
  });


if (process.env.NODE_ENV === 'production') {
  console.log = console.warn = console.error = console.info = () => {};
}