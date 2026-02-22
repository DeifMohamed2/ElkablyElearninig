# Professional Logging System Documentation

## Overview

The Elkably E-Learning platform now includes a comprehensive logging system that tracks:
- All HTTP requests with detailed information
- User activities (students, admins, parents)
- Security events (login attempts, unauthorized access)
- System events (server start, database connection)
- Performance metrics (slow requests, slow queries)
- Error tracking with full stack traces

## ✅ Currently Auto-Tracked Activities

The following activities are **automatically tracked** (already integrated into controllers):

### Authentication
- ✅ Student login (success/failure)
- ✅ Admin login (success/failure)
- ✅ Student logout
- ✅ Admin logout

### Student Activities
- ✅ View course details
- ✅ Start quiz attempt
- ✅ Submit quiz (with score)
- ✅ Complete content (video, PDF, etc.)

### Purchases
- ✅ Purchase completed
- ✅ Purchase failed

### System Events
- ✅ Server started
- ✅ Database connected
- ✅ All HTTP requests (automatic)
- ✅ Slow requests (>3 seconds)
- ✅ 401/403/429 security events

## Log Files Location

All logs are stored in the `/logs` directory with daily rotation:

```
logs/
├── combined-2024-01-15.log      # All logs
├── error-2024-01-15.log         # Error logs only
├── http-2024-01-15.log          # HTTP request logs
├── activity-2024-01-15.log      # User activity logs
├── security-2024-01-15.log      # Security events
├── system-2024-01-15.log        # System events
├── performance-2024-01-15.log   # Performance metrics
├── exceptions-2024-01-15.log    # Uncaught exceptions
└── rejections-2024-01-15.log    # Unhandled promise rejections
```

### Log Retention
- Logs are automatically rotated daily
- Old logs are compressed (gzipped)
- Logs older than 30 days are automatically deleted
- Maximum file size: 20MB per file

## Usage Examples

### 1. Basic Logging in Controllers

```javascript
const { logger, logError, logActivity } = require('../utils/logger');

// Simple logging
logger.info('Processing request', { userId: user.id });
logger.warn('Resource running low', { type: 'memory' });
logger.error('Failed to process', { error: err.message });
logger.debug('Debug info', { data: someData });

// Log errors with full context
logError('Failed to process payment', error, {
  userId: req.session.user.id,
  paymentId: payment.id,
});
```

### 2. Activity Tracking (Recommended)

Use the specialized trackers for consistent activity logging:

```javascript
const { StudentTracker, AdminTracker, PurchaseTracker } = require('../utils/activityTracker');

// Student Activities
StudentTracker.login(req, student, true);        // Successful login
StudentTracker.login(req, student, false, 'Invalid password');  // Failed login
StudentTracker.viewCourse(req, course._id, course.title);
StudentTracker.startQuiz(req, quiz._id, quiz.title);
StudentTracker.submitQuiz(req, quiz._id, quiz.title, score, totalQuestions);
StudentTracker.watchVideo(req, video._id, video.title, watchDuration);
StudentTracker.downloadPdf(req, pdf._id, pdf.title);

// Admin Activities
AdminTracker.login(req, admin, true);
AdminTracker.createCourse(req, courseData);
AdminTracker.updateCourse(req, courseId, courseName, changes);
AdminTracker.enrollStudent(req, studentId, studentName, courseId, courseName);

// Purchase Activities
PurchaseTracker.initiated(req, purchaseId, courseId, courseName, amount);
PurchaseTracker.completed(req, purchaseId, courseId, courseName, amount, 'card');
PurchaseTracker.failed(req, purchaseId, courseId, courseName, amount, 'Card declined');
```

### 3. Security Tracking

```javascript
const { SecurityTracker } = require('../utils/activityTracker');

// Track security events
SecurityTracker.unauthorizedAccess(req, '/admin/dashboard', 'Not logged in');
SecurityTracker.permissionDenied(req, '/admin/users', 'superAdmin');
SecurityTracker.suspiciousActivity(req, 'Multiple failed logins', { attempts: 5 });
SecurityTracker.bruteForceAttempt(req, 10, 'admin@example.com');
```

### 4. Function Performance Tracking

```javascript
const { FunctionTracker } = require('../utils/activityTracker');

// Manual tracking
const startTime = Date.now();
try {
  await someExpensiveOperation();
  FunctionTracker.track('someExpensiveOperation', 'purchaseController', req, startTime);
} catch (error) {
  FunctionTracker.trackError('someExpensiveOperation', 'purchaseController', error, req, startTime);
}

// Automatic wrapper (for controller functions)
const trackedFunction = FunctionTracker.wrap(
  originalFunction,
  'functionName',
  'moduleName'
);
```

### 5. System Events

```javascript
const { logSystem } = require('../utils/logger');

// Log system events
logSystem('CRON_JOB_START', { jobName: 'cleanupExpiredSessions' });
logSystem('CRON_JOB_COMPLETE', { jobName: 'cleanupExpiredSessions', duration: 1500 });
logSystem('CACHE_CLEARED', { cacheType: 'user-sessions' });
```

### 6. Performance Tracking

```javascript
const { logPerformance } = require('../utils/logger');

// Track slow operations
logPerformance('DATABASE_QUERY', {
  operation: 'findStudentWithEnrollments',
  duration: 5500,
  threshold: 3000,
  query: 'Student.findById().populate()',
});

logPerformance('API_CALL', {
  operation: 'fetchPaymentStatus',
  duration: 2000,
  service: 'paymob',
});
```

## Complete Controller Example

```javascript
// controllers/studentController.js
const { StudentTracker, PurchaseTracker } = require('../utils/activityTracker');
const { logError, logPerformance } = require('../utils/logger');

exports.enrollInCourse = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { courseId } = req.params;
    const student = req.session.user;
    
    // ... enrollment logic ...
    
    // Track enrollment
    StudentTracker.viewCourse(req, courseId, course.title);
    
    // Track performance if slow
    const duration = Date.now() - startTime;
    if (duration > 2000) {
      logPerformance('SLOW_ENROLLMENT', {
        duration,
        threshold: 2000,
        courseId,
        studentId: student.id,
      });
    }
    
    return res.json({ success: true, message: 'Enrolled successfully' });
    
  } catch (error) {
    // Log error with full context
    logError('Enrollment failed', error, {
      studentId: req.session?.user?.id,
      courseId: req.params.courseId,
    });
    
    return res.status(500).json({
      success: false,
      message: 'Failed to enroll in course',
    });
  }
};
```

## Log Format

All logs are stored in JSON format for easy parsing:

```json
{
  "timestamp": "2024-01-15 10:30:45.123",
  "level": "info",
  "message": "Activity: LOGIN",
  "service": "elkably-elearning",
  "type": "activity",
  "action": "LOGIN",
  "userId": "65a4f1234567890abcdef",
  "userName": "Ahmed Hassan",
  "userRole": "student",
  "userPhone": "+201234567890",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "success": true
}
```

## HTTP Request Log Format

```json
{
  "timestamp": "2024-01-15 10:30:45.123",
  "level": "http",
  "message": "HTTP Request",
  "type": "http",
  "requestId": "req_1705312245123_abc123",
  "method": "GET",
  "url": "/student/dashboard",
  "path": "/student/dashboard",
  "status": 200,
  "responseTime": 156,
  "contentLength": 12456,
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "userId": "65a4f1234567890abcdef",
  "userRole": "student",
  "sessionId": "sess_abc123xyz"
}
```

## Viewing Logs

### Real-time Monitoring (Development)
The console will show colored logs in development mode.

### Viewing Log Files
```bash
# View latest combined logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# View error logs
tail -f logs/error-$(date +%Y-%m-%d).log

# View activity logs
tail -f logs/activity-$(date +%Y-%m-%d).log

# Search for specific user
grep "65a4f1234567890abcdef" logs/activity-*.log

# Pretty print JSON logs
tail -f logs/combined-$(date +%Y-%m-%d).log | jq '.'
```

### Using Log Analysis Tools
The JSON format is compatible with:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Grafana Loki**
- **AWS CloudWatch**
- **Datadog**
- **Splunk**

## Environment Variables

```env
# Set log level (error, warn, info, http, verbose, debug)
LOG_LEVEL=debug

# Set to 'production' to disable console logs
NODE_ENV=production
```

## Best Practices

1. **Use Specialized Trackers**: Use `StudentTracker`, `AdminTracker`, etc. for consistent logging
2. **Include Context**: Always include relevant IDs (userId, courseId, etc.)
3. **Track Performance**: Log slow operations for optimization
4. **Security First**: Always log security events
5. **Don't Log Sensitive Data**: Never log passwords, tokens, or personal data

## Activity Actions Reference

```javascript
const { ActivityActions } = require('../utils/logger');

// Auth Actions
ActivityActions.LOGIN
ActivityActions.LOGOUT
ActivityActions.REGISTRATION
ActivityActions.PASSWORD_CHANGE

// Student Actions
ActivityActions.VIEW_COURSE
ActivityActions.VIEW_TOPIC
ActivityActions.START_QUIZ
ActivityActions.SUBMIT_QUIZ

// Admin Actions
ActivityActions.CREATE_COURSE
ActivityActions.UPDATE_COURSE
ActivityActions.ENROLL_STUDENT

// Purchase Actions
ActivityActions.PURCHASE_INITIATED
ActivityActions.PURCHASE_COMPLETED
ActivityActions.PURCHASE_FAILED
```

## Security Events Reference

```javascript
const { SecurityEvents } = require('../utils/logger');

SecurityEvents.LOGIN_SUCCESS
SecurityEvents.LOGIN_FAILED
SecurityEvents.UNAUTHORIZED_ACCESS
SecurityEvents.RATE_LIMIT_EXCEEDED
SecurityEvents.SUSPICIOUS_ACTIVITY
SecurityEvents.BRUTE_FORCE_ATTEMPT
```
