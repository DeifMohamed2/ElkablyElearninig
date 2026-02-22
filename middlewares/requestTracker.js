/**
 * Request Tracker Middleware
 * 
 * Tracks every HTTP request with detailed information including:
 * - Request method, URL, query params
 * - Response status and time
 * - User information (if authenticated)
 * - IP address and user agent
 * - Request/Response size
 */

const { logHttpRequest, logPerformance, logSecurity, SecurityEvents } = require('../utils/logger');

// Generate unique request ID
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Main request tracking middleware
 * Add this at the beginning of middleware chain
 */
const requestTracker = (options = {}) => {
  const {
    slowRequestThreshold = 3000,  // Log slow requests > 3 seconds
    excludePaths = ['/health', '/favicon.ico', '/robots.txt'],
    logBody = false,               // Don't log request body by default (security)
    logQuery = true,               // Log query parameters
  } = options;

  return (req, res, next) => {
    // Skip excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Add request ID
    req.requestId = generateRequestId();
    res.setHeader('X-Request-ID', req.requestId);

    // Start time
    const startTime = Date.now();
    const startHrTime = process.hrtime();

    // Get user info from session
    const getUserInfo = () => {
      if (req.session) {
        // Check for different user types
        if (req.session.user) {
          return {
            userId: req.session.user.id || req.session.user._id,
            userName: req.session.user.name || req.session.user.userName,
            userRole: req.session.user.role || 'user',
            userPhone: req.session.user.phone || req.session.user.phoneNumber,
          };
        }
        if (req.session.admin) {
          return {
            userId: req.session.admin._id,
            userName: req.session.admin.userName,
            userRole: req.session.admin.role || 'admin',
            userPhone: req.session.admin.phoneNumber,
          };
        }
        if (req.session.student) {
          return {
            userId: req.session.student.id || req.session.student._id,
            userName: req.session.student.name,
            userRole: 'student',
            userPhone: req.session.student.phone,
          };
        }
        if (req.session.parent) {
          return {
            userId: req.session.parent.id || req.session.parent._id,
            userName: req.session.parent.name,
            userRole: 'parent',
            userPhone: req.session.parent.phone,
          };
        }
      }
      return { userId: null, userName: 'Anonymous', userRole: 'guest' };
    };

    // Get IP address (handle proxies)
    const getClientIp = (req) => {
      return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
             req.headers['x-real-ip'] ||
             req.connection?.remoteAddress ||
             req.socket?.remoteAddress ||
             req.ip ||
             'Unknown';
    };

    // Capture original end method
    const originalEnd = res.end;
    const originalJson = res.json;

    // Capture response body size
    let responseSize = 0;

    // Override res.end
    res.end = function(chunk, encoding) {
      if (chunk) {
        responseSize += chunk.length || 0;
      }
      
      // Calculate response time
      const diff = process.hrtime(startHrTime);
      const responseTime = Math.round((diff[0] * 1000) + (diff[1] / 1000000));

      // Get user info
      const userInfo = getUserInfo();

      // Build log data
      const logData = {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        path: req.path,
        query: logQuery ? req.query : undefined,
        status: res.statusCode,
        responseTime: responseTime,
        contentLength: responseSize,
        ip: getClientIp(req),
        userAgent: req.get('user-agent') || 'Unknown',
        referer: req.get('referer') || null,
        userId: userInfo.userId,
        userName: userInfo.userName,
        userRole: userInfo.userRole,
        sessionId: req.sessionID || null,
      };

      // Log the request
      logHttpRequest(logData);

      // Log slow requests
      if (responseTime > slowRequestThreshold) {
        logPerformance('SLOW_REQUEST', {
          duration: responseTime,
          threshold: slowRequestThreshold,
          operation: `${req.method} ${req.path}`,
          url: req.originalUrl,
          userId: userInfo.userId,
        });
      }

      // Log security-relevant events
      if (res.statusCode === 401) {
        logSecurity(SecurityEvents.UNAUTHORIZED_ACCESS, {
          ip: logData.ip,
          userAgent: logData.userAgent,
          url: req.originalUrl,
          method: req.method,
        });
      }

      if (res.statusCode === 403) {
        logSecurity(SecurityEvents.PERMISSION_DENIED, {
          ip: logData.ip,
          userAgent: logData.userAgent,
          userId: userInfo.userId,
          url: req.originalUrl,
          method: req.method,
        });
      }

      if (res.statusCode === 429) {
        logSecurity(SecurityEvents.RATE_LIMIT_EXCEEDED, {
          ip: logData.ip,
          userAgent: logData.userAgent,
          userId: userInfo.userId,
          url: req.originalUrl,
        });
      }

      // Call original end
      return originalEnd.call(this, chunk, encoding);
    };

    // Override res.json for tracking JSON responses
    res.json = function(data) {
      // Track response status from data
      if (data && typeof data === 'object') {
        // Store success/failure status for activity logging
        req.responseSuccess = data.success !== false;
        req.responseMessage = data.message || null;
      }
      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Error tracking middleware - place this after routes
 */
const errorTracker = (err, req, res, next) => {
  const { logError } = require('../utils/logger');
  
  const errorData = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
    userAgent: req.get('user-agent'),
    userId: req.session?.user?.id || req.session?.admin?._id || null,
    sessionId: req.sessionID,
  };

  logError('Unhandled Request Error', err, errorData);

  next(err);
};

module.exports = {
  requestTracker,
  errorTracker,
  generateRequestId,
};
