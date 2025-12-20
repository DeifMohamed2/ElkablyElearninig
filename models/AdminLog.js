const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    adminName: {
      type: String,
      required: true,
    },
    adminPhone: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        // Course Actions
        'CREATE_COURSE',
        'UPDATE_COURSE',
        'DELETE_COURSE',
        'DUPLICATE_COURSE',
        'BULK_UPDATE_COURSE_STATUS',
        
        // Topic Actions
        'CREATE_TOPIC',
        'UPDATE_TOPIC',
        'DELETE_TOPIC',
        'DUPLICATE_TOPIC',
        'REORDER_TOPICS',
        'UPDATE_TOPIC_VISIBILITY',
        
        // Content Actions
        'CREATE_CONTENT',
        'UPDATE_CONTENT',
        'DELETE_CONTENT',
        'REORDER_CONTENT',
        'RESET_CONTENT_ATTEMPTS',
        
        // Bundle Actions
        'CREATE_BUNDLE',
        'UPDATE_BUNDLE',
        'DELETE_BUNDLE',
        'ADD_COURSE_TO_BUNDLE',
        'REMOVE_COURSE_FROM_BUNDLE',
        'REORDER_BUNDLE_COURSES',
        
        // Student Actions
        'CREATE_STUDENT',
        'UPDATE_STUDENT',
        'DELETE_STUDENT',
        'TOGGLE_STUDENT_STATUS',
        'BULK_IMPORT_STUDENTS',
        'ENROLL_STUDENT',
        'REMOVE_STUDENT_ENROLLMENT',
        'BULK_ENROLL_STUDENTS',
        
        // Quiz Actions
        'CREATE_QUIZ',
        'UPDATE_QUIZ',
        'DELETE_QUIZ',
        'RESTORE_QUIZ',
        'UPDATE_QUIZ_STATUS',
        'RESET_QUIZ_ATTEMPTS',
        'UPLOAD_QUIZ_THUMBNAIL',
        
        // Question Bank Actions
        'CREATE_QUESTION_BANK',
        'UPDATE_QUESTION_BANK',
        'DELETE_QUESTION_BANK',
        'SYNC_QUESTION_BANKS',
        
        // Question Actions
        'CREATE_QUESTION',
        'UPDATE_QUESTION',
        'DELETE_QUESTION',
        'DUPLICATE_QUESTION',
        'IMPORT_QUESTIONS',
        
        // Order Actions
        'REFUND_ORDER',
        'UPDATE_BOOK_ORDER_STATUS',
        'BULK_UPDATE_BOOK_ORDERS',
        
        // Admin Management
        'CREATE_ADMIN',
        'UPDATE_ADMIN',
        'DELETE_ADMIN',
        'TOGGLE_ADMIN_STATUS',
        
        // Promo Code Actions
        'CREATE_PROMO_CODE',
        'UPDATE_PROMO_CODE',
        'DELETE_PROMO_CODE',
        'CREATE_BULK_PROMO_CODES',
        'DELETE_BULK_COLLECTION',
        'TOGGLE_BULK_COLLECTION_STATUS',
        
        // Brilliant Students
        'CREATE_BRILLIANT_STUDENT',
        'UPDATE_BRILLIANT_STUDENT',
        'DELETE_BRILLIANT_STUDENT',
        'REORDER_BRILLIANT_STUDENTS',
        
        // Team Management
        'CREATE_TEAM_MEMBER',
        'UPDATE_TEAM_MEMBER',
        'DELETE_TEAM_MEMBER',
        'REORDER_TEAM_MEMBERS',
        
        // Game Room Actions
        'CREATE_GAME_ROOM',
        'UPDATE_GAME_ROOM',
        'DELETE_GAME_ROOM',
        'PERMANENT_DELETE_GAME_ROOM',
        
        // Zoom Meeting Actions
        'CREATE_ZOOM_MEETING',
        'START_ZOOM_MEETING',
        'END_ZOOM_MEETING',
        'DELETE_ZOOM_MEETING',
        
        // Communication Actions
        'SEND_BULK_SMS',
        'SEND_BULK_WHATSAPP',
        'SEND_TEST_MESSAGE',
        
        // Export Actions
        'EXPORT_STUDENTS',
        'EXPORT_COURSES',
        'EXPORT_ORDERS',
        'EXPORT_QUIZZES',
        'EXPORT_COMPREHENSIVE_REPORT',
        
        // Other Actions
        'CLEANUP_DUPLICATES',
        'UPLOAD_PDF',
      ],
    },
    actionCategory: {
      type: String,
      required: true,
      enum: [
        'COURSE_MANAGEMENT',
        'CONTENT_MANAGEMENT',
        'STUDENT_MANAGEMENT',
        'QUIZ_MANAGEMENT',
        'QUESTION_BANK_MANAGEMENT',
        'ORDER_MANAGEMENT',
        'ADMIN_MANAGEMENT',
        'PROMO_CODE_MANAGEMENT',
        'TEAM_MANAGEMENT',
        'GAME_ROOM_MANAGEMENT',
        'ZOOM_MANAGEMENT',
        'COMMUNICATION',
        'EXPORT',
        'SYSTEM',
      ],
    },
    description: {
      type: String,
      required: true,
    },
    targetModel: {
      type: String,
      enum: [
        'Course',
        'Topic',
        'Content',
        'BundleCourse',
        'User',
        'Quiz',
        'QuestionBank',
        'Question',
        'Purchase',
        'BookOrder',
        'Admin',
        'PromoCode',
        'BrilliantStudent',
        'TeamMember',
        'GameRoom',
        'ZoomMeeting',
        'Multiple',
        'System',
      ],
    },
    targetId: {
      type: String, // Can be ObjectId or custom ID like courseCode
    },
    targetName: {
      type: String, // Name of the affected entity
    },
    changes: {
      type: mongoose.Schema.Types.Mixed, // Stores before/after values for updates
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Additional context-specific data
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
      default: 'SUCCESS',
    },
    errorMessage: {
      type: String,
    },
    duration: {
      type: Number, // Time taken in milliseconds
    },
  },
  { 
    timestamps: true,
    // Add indexes for better query performance
    indexes: [
      { admin: 1, createdAt: -1 },
      { action: 1, createdAt: -1 },
      { actionCategory: 1, createdAt: -1 },
      { targetModel: 1, targetId: 1 },
      { createdAt: -1 },
    ],
  }
);

// Add virtual for formatted date
AdminLogSchema.virtual('formattedDate').get(function () {
  return this.createdAt.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Add static method to create log entry
AdminLogSchema.statics.createLog = async function (logData) {
  try {
    const log = new this(logData);
    await log.save();
    return log;
  } catch (error) {
    console.error('Error creating admin log:', error);
    // Don't throw error to prevent logging failures from breaking operations
    return null;
  }
};

// Add static method to get logs with filters
AdminLogSchema.statics.getLogs = async function (filters = {}, options = {}) {
  const {
    adminId,
    action,
    actionCategory,
    targetModel,
    startDate,
    endDate,
    status,
    search,
  } = filters;

  const {
    page = 1,
    limit = 50,
    sort = { createdAt: -1 },
  } = options;

  const query = {};

  if (adminId) query.admin = adminId;
  if (action) query.action = action;
  if (actionCategory) query.actionCategory = actionCategory;
  if (targetModel) query.targetModel = targetModel;
  if (status) query.status = status;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (search) {
    query.$or = [
      { description: { $regex: search, $options: 'i' } },
      { adminName: { $regex: search, $options: 'i' } },
      { targetName: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    this.find(query)
      .populate('admin', 'userName phoneNumber email')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: skip + logs.length < total,
  };
};

// Add static method to get statistics
AdminLogSchema.statics.getStats = async function (filters = {}) {
  const { startDate, endDate, adminId } = filters;
  
  const matchQuery = {};
  if (adminId) matchQuery.admin = mongoose.Types.ObjectId(adminId);
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $facet: {
        byCategory: [
          { $group: { _id: '$actionCategory', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        byAction: [
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        byAdmin: [
          { $group: { _id: '$admin', adminName: { $first: '$adminName' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ],
        total: [
          { $count: 'count' },
        ],
      },
    },
  ]);

  return stats[0];
};

module.exports = mongoose.model('AdminLog', AdminLogSchema);








