const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    // The parent phone number (used as identifier for parent app)
    parentPhone: {
      type: String,
      required: true,
      index: true,
    },
    parentCountryCode: {
      type: String,
      required: true,
      default: '+20',
    },
    // The student this notification is about
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Notification type for categorization
    type: {
      type: String,
      required: true,
      enum: [
        'welcome',
        'quiz_completion',
        'content_completion',
        'topic_completion',
        'course_completion',
        'purchase',
        'course_enrollment',
        'bundle_enrollment',
        'zoom_meeting',
        'zoom_non_attendance',
        'general',
        'announcement',
      ],
      index: true,
    },
    // Notification title (short)
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    // Notification body/message
    body: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    // Full message content (for detail view)
    fullMessage: {
      type: String,
      maxlength: 5000,
    },
    // Additional data payload
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Read status
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    // Delivery status tracking
    deliveryStatus: {
      fcm: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date },
        error: { type: String },
        messageId: { type: String },
      },
      sms: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date },
        error: { type: String },
      },
      whatsapp: {
        sent: { type: Boolean, default: false },
        sentAt: { type: Date },
        error: { type: String },
      },
    },
    // Priority level
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
    },
    // Optional link/action
    actionUrl: {
      type: String,
    },
    // Icon or image URL
    imageUrl: {
      type: String,
    },
    // Expiration date (optional - for time-sensitive notifications)
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
NotificationSchema.index({ parentPhone: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ parentPhone: 1, createdAt: -1 });
NotificationSchema.index({ student: 1, createdAt: -1 });

// Virtual for formatted date
NotificationSchema.virtual('formattedDate').get(function () {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Static method to get unread count for a parent
NotificationSchema.statics.getUnreadCount = async function (parentPhone) {
  return await this.countDocuments({ parentPhone, isRead: false });
};

// Static method to mark notification as read
NotificationSchema.statics.markAsRead = async function (notificationId, parentPhone) {
  const notification = await this.findOneAndUpdate(
    { _id: notificationId, parentPhone },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  return notification;
};

// Static method to mark all notifications as read for a parent
NotificationSchema.statics.markAllAsRead = async function (parentPhone) {
  const result = await this.updateMany(
    { parentPhone, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  return result;
};

// Static method to get notifications for a parent with pagination
NotificationSchema.statics.getParentNotifications = async function (
  parentPhone,
  options = {}
) {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false,
    type = null,
    studentId = null,
  } = options;

  const query = { parentPhone };
  
  if (unreadOnly) {
    query.isRead = false;
  }
  
  if (type) {
    query.type = type;
  }
  
  if (studentId) {
    query.student = studentId;
  }

  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('student', 'firstName lastName studentCode grade schoolName profileImage')
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + notifications.length < total,
    },
  };
};

// Static method to delete old notifications (cleanup job)
NotificationSchema.statics.deleteOldNotifications = async function (daysOld = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    isRead: true,
  });
  
  return result;
};

// Static method to create and save a notification
NotificationSchema.statics.createNotification = async function (notificationData) {
  const notification = new this(notificationData);
  await notification.save();
  return notification;
};

// Instance method to update delivery status
NotificationSchema.methods.updateDeliveryStatus = async function (channel, status) {
  const update = {};
  update[`deliveryStatus.${channel}`] = {
    sent: status.success,
    sentAt: new Date(),
    error: status.error || null,
    messageId: status.messageId || null,
  };
  
  Object.assign(this.deliveryStatus[channel], update[`deliveryStatus.${channel}`]);
  await this.save();
  return this;
};

module.exports = mongoose.model('Notification', NotificationSchema);
