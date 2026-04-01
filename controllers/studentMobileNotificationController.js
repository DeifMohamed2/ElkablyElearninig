const Notification = require('../models/Notification');

/** List row only — full payload from GET /notifications/:notificationId */
const toNotificationListItem = (n) => ({
  _id: n._id,
  type: n.type,
  title: n.title,
  body: n.body,
  isRead: n.isRead,
  priority: n.priority,
  createdAt: n.createdAt,
});

const getNotifications = async (req, res) => {
  try {
    const studentId = req.studentMobileUser._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
    const type = req.query.type || null;

    const result = await Notification.getStudentNotifications(studentId, {
      page,
      limit,
      unreadOnly,
      type,
    });

    return res.json({
      success: true,
      data: {
        notifications: result.notifications.map(toNotificationListItem),
        pagination: result.pagination,
      },
    });
  } catch (error) {
    console.error('getNotifications:', error);
    return res.status(500).json({ success: false, message: 'Failed to load notifications' });
  }
};

const getNotificationById = async (req, res) => {
  try {
    const n = await Notification.findOne({
      _id: req.params.notificationId,
      student: req.studentMobileUser._id,
    }).lean();

    if (!n) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.json({ success: true, data: { notification: n } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const updated = await Notification.markStudentNotificationAsRead(
      req.params.notificationId,
      req.studentMobileUser._id,
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.json({ success: true, message: 'Marked as read', data: { notification: updated } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await Notification.markAllStudentNotificationsAsRead(req.studentMobileUser._id);
    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed' });
  }
};

module.exports = {
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
};
