const AdminLog = require('../models/AdminLog');
const Admin = require('../models/Admin');
const ExcelExporter = require('../utils/excelExporter');

/**
 * Get admin logs page (only accessible to super admins)
 */
const getAdminLogs = async (req, res) => {
  try {
    // Check if user is super admin
    if (!req.session || !req.session.user) {
      req.flash('error_msg', 'Please log in to access this page');
      return res.redirect('/auth/login');
    }

    const admin = await Admin.findById(req.session.user.id);
    if (!admin || admin.role !== 'superAdmin') {
      req.flash('error_msg', 'Access denied. Only super admins can view logs.');
      return res.redirect('/admin/dashboard');
    }

    const {
      page = 1,
      limit = 50,
      adminId,
      action,
      actionCategory,
      targetModel,
      startDate,
      endDate,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Build filters
    const filters = {};
    if (adminId) filters.adminId = adminId;
    if (action) filters.action = action;
    if (actionCategory) filters.actionCategory = actionCategory;
    if (targetModel) filters.targetModel = targetModel;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (status) filters.status = status;
    if (search) filters.search = search;

    // Build sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Get logs
    const logsData = await AdminLog.getLogs(filters, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
    });

    // Get filter options
    const [admins, actions, categories, models] = await Promise.all([
      Admin.find({}, 'userName phoneNumber').lean(),
      AdminLog.distinct('action'),
      AdminLog.distinct('actionCategory'),
      AdminLog.distinct('targetModel'),
    ]);

    // Get statistics
    const stats = await AdminLog.getStats(filters);

    res.render('admin/admin-logs', {
      title: 'Admin Activity Logs',
      theme: req.cookies.theme || 'light',
      currentPage: 'admin-logs',
      user: req.session.user,
      admin: {
        _id: admin._id,
        userName: admin.userName,
        email: admin.email,
        phoneNumber: admin.phoneNumber,
        role: admin.role,
      },
      logs: logsData.logs,
      pagination: {
        page: logsData.page,
        totalPages: logsData.totalPages,
        total: logsData.total,
        hasMore: logsData.hasMore,
      },
      filters: {
        adminId,
        action,
        actionCategory,
        targetModel,
        startDate,
        endDate,
        status,
        search,
        sortBy,
        sortOrder,
      },
      filterOptions: {
        admins,
        actions,
        categories,
        models,
      },
      stats,
    });
  } catch (error) {
    console.error('Error fetching admin logs:', error);
    req.flash('error_msg', 'Error loading admin logs');
    res.redirect('/admin/dashboard');
  }
};

/**
 * Get single log details (API endpoint)
 */
const getLogDetails = async (req, res) => {
  try {
    // Check if user is super admin
    if (!req.session || !req.session.user) {
      return res.status(403).json({
        success: false,
        message: 'Please log in to access this page',
      });
    }

    const admin = await Admin.findById(req.session.user.id);
    if (!admin || admin.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const { logId } = req.params;
    const log = await AdminLog.findById(logId).populate('admin', 'userName phoneNumber email');

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found',
      });
    }

    res.json({
      success: true,
      log,
    });
  } catch (error) {
    console.error('Error fetching log details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching log details',
    });
  }
};

/**
 * Get admin logs statistics (API endpoint)
 */
const getLogsStats = async (req, res) => {
  try {
    // Check if user is super admin
    if (!req.session || !req.session.user) {
      return res.status(403).json({
        success: false,
        message: 'Please log in to access this page',
      });
    }

    const admin = await Admin.findById(req.session.user.id);
    if (!admin || admin.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const { startDate, endDate, adminId } = req.query;
    
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (adminId) filters.adminId = adminId;

    const stats = await AdminLog.getStats(filters);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching logs stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
    });
  }
};

/**
 * Export admin logs to Excel
 */
const exportLogs = async (req, res) => {
  try {
    // Check if user is super admin
    if (!req.session || !req.session.user) {
      return res.status(403).json({
        success: false,
        message: 'Please log in to access this page',
      });
    }

    const admin = await Admin.findById(req.session.user.id);
    if (!admin || admin.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const {
      adminId,
      action,
      actionCategory,
      targetModel,
      startDate,
      endDate,
      status,
      search,
    } = req.query;

    // Build filters
    const filters = {};
    if (adminId) filters.adminId = adminId;
    if (action) filters.action = action;
    if (actionCategory) filters.actionCategory = actionCategory;
    if (targetModel) filters.targetModel = targetModel;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (status) filters.status = status;
    if (search) filters.search = search;

    // Get all logs matching filters (no pagination for export)
    const logsData = await AdminLog.getLogs(filters, {
      page: 1,
      limit: 10000, // Max export limit
      sort: { createdAt: -1 },
    });

    // Prepare data for Excel
    const excelData = logsData.logs.map((log) => ({
      'Date & Time': new Date(log.createdAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      'Admin Name': log.adminName,
      'Admin Phone': log.adminPhone,
      'Action': log.action.replace(/_/g, ' '),
      'Category': log.actionCategory.replace(/_/g, ' '),
      'Description': log.description,
      'Target Model': log.targetModel || 'N/A',
      'Target Name': log.targetName || 'N/A',
      'Status': log.status,
      'IP Address': log.ipAddress || 'N/A',
      'Duration (ms)': log.duration || 'N/A',
    }));

    // Create Excel file
    const exporter = new ExcelExporter();
    const buffer = await exporter.exportToBuffer(
      excelData,
      'Admin Activity Logs',
      'Admin Logs Export'
    );

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=admin-logs-${Date.now()}.xlsx`
    );

    res.send(buffer);
  } catch (error) {
    console.error('Error exporting admin logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting logs',
    });
  }
};

/**
 * Delete old logs (cleanup)
 */
const deleteOldLogs = async (req, res) => {
  try {
    // Check if user is super admin
    if (!req.session || !req.session.user) {
      return res.status(403).json({
        success: false,
        message: 'Please log in to access this page',
      });
    }

    const admin = await Admin.findById(req.session.user.id);
    if (!admin || admin.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const { daysOld = 90 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld));

    const result = await AdminLog.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} logs older than ${daysOld} days`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Error deleting old logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting logs',
    });
  }
};

module.exports = {
  getAdminLogs,
  getLogDetails,
  getLogsStats,
  exportLogs,
  deleteOldLogs,
};



