/**
 * Professional Logging System for Elkably E-Learning Platform
 * 
 * Features:
 * - Daily rotating log files
 * - Multiple log levels (error, warn, info, http, debug)
 * - Separate files for different log types
 * - JSON format for easy parsing
 * - Console output with colors for development
 * - Automatic cleanup of old logs (30 days)
 * 
 * Log Files Structure:
 * - logs/combined-%DATE%.log   - All logs
 * - logs/error-%DATE%.log      - Error logs only
 * - logs/http-%DATE%.log       - HTTP request logs
 * - logs/activity-%DATE%.log   - User activity logs
 * - logs/system-%DATE%.log     - System events
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format with colors for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Daily rotate file transport configuration
const createDailyRotateTransport = (filename, level = null) => {
  const config = {
    dirname: logsDir,
    filename: `${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,      // Compress old logs
    maxSize: '20m',           // Max file size 20MB
    maxFiles: '30d',          // Keep logs for 30 days
    format: customFormat,
  };
  
  if (level) {
    config.level = level;
  }
  
  return new DailyRotateFile(config);
};

// Create the main logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: customFormat,
  defaultMeta: { service: 'elkably-elearning' },
  transports: [
    // Combined logs - everything
    createDailyRotateTransport('combined'),
    
    // Error logs only
    createDailyRotateTransport('error', 'error'),
  ],
  exceptionHandlers: [
    createDailyRotateTransport('exceptions'),
  ],
  rejectionHandlers: [
    createDailyRotateTransport('rejections'),
  ],
});

// Add console transport for non-production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug',
  }));
}

// HTTP Request Logger (for Morgan integration)
const httpLogger = winston.createLogger({
  level: 'http',
  format: customFormat,
  defaultMeta: { type: 'http' },
  transports: [
    createDailyRotateTransport('http'),
  ],
});

// Activity Logger (user actions)
const activityLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: { type: 'activity' },
  transports: [
    createDailyRotateTransport('activity'),
  ],
});

// System Logger (system events)
const systemLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: { type: 'system' },
  transports: [
    createDailyRotateTransport('system'),
  ],
});

// Security Logger (login attempts, auth events)
const securityLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: { type: 'security' },
  transports: [
    createDailyRotateTransport('security'),
  ],
});

// Performance Logger (slow queries, performance issues)
const performanceLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: { type: 'performance' },
  transports: [
    createDailyRotateTransport('performance'),
  ],
});

/**
 * Log HTTP Request
 * @param {Object} data - Request data
 */
const logHttpRequest = (data) => {
  httpLogger.http('HTTP Request', {
    method: data.method,
    url: data.url,
    status: data.status,
    responseTime: data.responseTime,
    contentLength: data.contentLength,
    ip: data.ip,
    userAgent: data.userAgent,
    userId: data.userId,
    userRole: data.userRole,
    sessionId: data.sessionId,
  });
  
  // Also log to combined
  logger.http('HTTP Request', {
    method: data.method,
    url: data.url,
    status: data.status,
    responseTime: data.responseTime,
  });
};

/**
 * Log User Activity
 * @param {string} action - Action performed
 * @param {Object} data - Activity data
 */
const logActivity = (action, data) => {
  const logData = {
    action,
    userId: data.userId || null,
    userName: data.userName || 'Unknown',
    userRole: data.userRole || 'unknown',
    userPhone: data.userPhone || null,
    targetType: data.targetType || null,
    targetId: data.targetId || null,
    targetName: data.targetName || null,
    details: data.details || {},
    ip: data.ip || null,
    userAgent: data.userAgent || null,
    sessionId: data.sessionId || null,
    success: data.success !== false,
    errorMessage: data.errorMessage || null,
  };

  activityLogger.info(`Activity: ${action}`, logData);
  
  // Log important activities to combined
  if (['LOGIN', 'LOGOUT', 'PURCHASE', 'ENROLLMENT', 'PASSWORD_CHANGE'].includes(action)) {
    logger.info(`Activity: ${action}`, logData);
  }
};

/**
 * Log System Event
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const logSystem = (event, data = {}) => {
  systemLogger.info(`System: ${event}`, {
    event,
    ...data,
  });
  
  logger.info(`System: ${event}`, { event });
};

/**
 * Log Security Event
 * @param {string} event - Security event name
 * @param {Object} data - Event data
 */
const logSecurity = (event, data = {}) => {
  const logData = {
    event,
    ip: data.ip || null,
    userAgent: data.userAgent || null,
    userId: data.userId || null,
    userName: data.userName || null,
    userRole: data.userRole || null,
    success: data.success !== false,
    reason: data.reason || null,
    ...data,
  };

  securityLogger.info(`Security: ${event}`, logData);
  
  // Also log to main logger for important events
  if (['LOGIN_FAILED', 'UNAUTHORIZED_ACCESS', 'SUSPICIOUS_ACTIVITY'].includes(event)) {
    logger.warn(`Security: ${event}`, logData);
  } else {
    logger.info(`Security: ${event}`, logData);
  }
};

/**
 * Log Performance Issue
 * @param {string} metric - Performance metric
 * @param {Object} data - Performance data
 */
const logPerformance = (metric, data = {}) => {
  performanceLogger.info(`Performance: ${metric}`, {
    metric,
    value: data.value,
    threshold: data.threshold,
    duration: data.duration,
    operation: data.operation,
    ...data,
  });

  // Warn on slow operations
  if (data.duration && data.threshold && data.duration > data.threshold) {
    logger.warn(`Slow Operation: ${metric}`, {
      duration: data.duration,
      threshold: data.threshold,
      operation: data.operation,
    });
  }
};

/**
 * Log Error with full context
 * @param {string} message - Error message
 * @param {Error|Object} error - Error object or additional data
 * @param {Object} context - Additional context
 */
const logError = (message, error, context = {}) => {
  const errorData = {
    message: error.message || message,
    stack: error.stack || null,
    code: error.code || null,
    ...context,
  };

  logger.error(message, errorData);
};

/**
 * Log Function Call (for tracking important functions)
 * @param {string} functionName - Name of the function
 * @param {Object} data - Function parameters and result
 */
const logFunction = (functionName, data = {}) => {
  const logData = {
    function: functionName,
    module: data.module || 'unknown',
    params: data.params || {},
    result: data.result || null,
    success: data.success !== false,
    duration: data.duration || null,
    userId: data.userId || null,
    error: data.error || null,
  };

  activityLogger.info(`Function: ${functionName}`, logData);
  
  // Log errors to main logger
  if (!data.success) {
    logger.warn(`Function Failed: ${functionName}`, logData);
  }
};

/**
 * Decorator to automatically log function execution
 * @param {Function} fn - Function to wrap
 * @param {string} name - Function name
 * @param {string} module - Module name
 */
const withLogging = (fn, name, module = 'unknown') => {
  return async function(...args) {
    const startTime = Date.now();
    try {
      const result = await fn.apply(this, args);
      logFunction(name, {
        module,
        duration: Date.now() - startTime,
        success: true,
      });
      return result;
    } catch (error) {
      logFunction(name, {
        module,
        duration: Date.now() - startTime,
        success: false,
        error: error.message,
      });
      throw error;
    }
  };
};

/**
 * Create a child logger with additional context
 * @param {Object} defaultMeta - Default metadata to include
 */
const createChildLogger = (defaultMeta) => {
  return logger.child(defaultMeta);
};

/**
 * Morgan stream for HTTP logging integration
 */
const morganStream = {
  write: (message) => {
    // Parse Morgan's combined format
    httpLogger.http(message.trim());
  },
};

/**
 * Get log statistics
 */
const getLogStats = async () => {
  const stats = {
    logsDirectory: logsDir,
    files: [],
  };

  try {
    const files = fs.readdirSync(logsDir);
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const fileStat = fs.statSync(filePath);
      stats.files.push({
        name: file,
        size: fileStat.size,
        modified: fileStat.mtime,
      });
    }
  } catch (error) {
    stats.error = error.message;
  }

  return stats;
};

// Predefined activity actions for consistency
const ActivityActions = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  OTP_SENT: 'OTP_SENT',
  OTP_VERIFIED: 'OTP_VERIFIED',
  REGISTRATION: 'REGISTRATION',
  
  // Student
  VIEW_COURSE: 'VIEW_COURSE',
  VIEW_TOPIC: 'VIEW_TOPIC',
  VIEW_CONTENT: 'VIEW_CONTENT',
  START_QUIZ: 'START_QUIZ',
  SUBMIT_QUIZ: 'SUBMIT_QUIZ',
  WATCH_VIDEO: 'WATCH_VIDEO',
  DOWNLOAD_PDF: 'DOWNLOAD_PDF',
  
  // Purchase
  PURCHASE_INITIATED: 'PURCHASE_INITIATED',
  PURCHASE_COMPLETED: 'PURCHASE_COMPLETED',
  PURCHASE_FAILED: 'PURCHASE_FAILED',
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  
  // Admin
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ADMIN_LOGOUT: 'ADMIN_LOGOUT',
  CREATE_COURSE: 'CREATE_COURSE',
  UPDATE_COURSE: 'UPDATE_COURSE',
  DELETE_COURSE: 'DELETE_COURSE',
  ENROLL_STUDENT: 'ENROLL_STUDENT',
  REMOVE_ENROLLMENT: 'REMOVE_ENROLLMENT',
  CREATE_QUIZ: 'CREATE_QUIZ',
  UPDATE_QUIZ: 'UPDATE_QUIZ',
  DELETE_QUIZ: 'DELETE_QUIZ',
  
  // Parent
  PARENT_LOGIN: 'PARENT_LOGIN',
  PARENT_VIEW_PROGRESS: 'PARENT_VIEW_PROGRESS',
  PARENT_VIEW_REPORT: 'PARENT_VIEW_REPORT',
  
  // System
  SERVER_START: 'SERVER_START',
  SERVER_STOP: 'SERVER_STOP',
  DATABASE_CONNECT: 'DATABASE_CONNECT',
  DATABASE_DISCONNECT: 'DATABASE_DISCONNECT',
  CACHE_CLEAR: 'CACHE_CLEAR',
  CRON_JOB_START: 'CRON_JOB_START',
  CRON_JOB_COMPLETE: 'CRON_JOB_COMPLETE',
};

// Security events
const SecurityEvents = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  IP_BLOCKED: 'IP_BLOCKED',
  BRUTE_FORCE_ATTEMPT: 'BRUTE_FORCE_ATTEMPT',
};

module.exports = {
  logger,
  httpLogger,
  activityLogger,
  systemLogger,
  securityLogger,
  performanceLogger,
  
  // Logging functions
  logHttpRequest,
  logActivity,
  logSystem,
  logSecurity,
  logPerformance,
  logError,
  logFunction,
  withLogging,
  createChildLogger,
  
  // Morgan integration
  morganStream,
  
  // Utilities
  getLogStats,
  
  // Constants
  ActivityActions,
  SecurityEvents,
};
