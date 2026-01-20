# Firebase Notifications & Parent Mobile App API

This document describes the Firebase Cloud Messaging (FCM) notification system and Parent Mobile App API implementation.

## Table of Contents

1. [Firebase Setup](#firebase-setup)
2. [Environment Variables](#environment-variables)
3. [Parent API Endpoints](#parent-api-endpoints)
4. [Notification System](#notification-system)
5. [FCM Integration](#fcm-integration)

---

## Firebase Setup

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the setup wizard
3. Enable Cloud Messaging for your project

### Step 2: Generate Service Account Key

1. Go to Project Settings > Service Accounts
2. Click "Generate new private key"
3. Save the JSON file securely

### Step 3: Configure Environment Variables

Add the following to your `.env` file:

```env
# Option 1: Path to service account JSON file (recommended for local development)
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccountKey.json

# Option 2: Individual credentials (recommended for production)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Optional: Disable FCM notifications
FCM_NOTIFICATIONS_ENABLED=true

# Parent App JWT settings
PARENT_JWT_SECRET=your-secure-jwt-secret
PARENT_JWT_EXPIRES_IN=30d
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to Firebase service account JSON | One of these |
| `FIREBASE_PROJECT_ID` | Firebase project ID | One of these |
| `FIREBASE_CLIENT_EMAIL` | Service account email | Required with PROJECT_ID |
| `FIREBASE_PRIVATE_KEY` | Service account private key | Required with PROJECT_ID |
| `FCM_NOTIFICATIONS_ENABLED` | Enable/disable FCM (default: true) | Optional |
| `PARENT_JWT_SECRET` | JWT secret for parent auth | Recommended |
| `PARENT_JWT_EXPIRES_IN` | JWT expiration (default: 30d) | Optional |

---

## Parent API Endpoints

All endpoints are prefixed with `/api/parent`

### Authentication

#### Login
```
POST /api/parent/login
```

**Request Body:**
```json
{
  "parentPhone": "1234567890",
  "countryCode": "+20",
  "studentCode": "123456",
  "fcmToken": "optional_fcm_token"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "jwt_token",
    "parentPhone": "1234567890",
    "parentCountryCode": "+20",
    "students": [
      {
        "id": "student_id",
        "firstName": "John",
        "lastName": "Doe",
        "studentCode": "123456",
        "grade": "Year 10",
        "schoolName": "School Name",
        "profileImage": null,
        "isActive": true
      }
    ],
    "unreadNotificationCount": 5
  }
}
```

#### Refresh Token
```
POST /api/parent/refresh-token
Authorization: Bearer <token>
```

#### Update FCM Token
```
POST /api/parent/update-fcm-token
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "fcmToken": "new_fcm_token"
}
```

#### Logout
```
POST /api/parent/logout
Authorization: Bearer <token>
```

### Students

#### Get All Students
```
GET /api/parent/students
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "students": [
      {
        "id": "student_id",
        "firstName": "John",
        "lastName": "Doe",
        "studentCode": "123456",
        "grade": "Year 10",
        "schoolName": "School Name",
        "profileImage": null,
        "isActive": true,
        "email": "john@example.com",
        "enrolledCoursesCount": 3,
        "averageProgress": 75
      }
    ],
    "totalStudents": 1
  }
}
```

#### Get Student Details
```
GET /api/parent/students/:studentId
Authorization: Bearer <token>
```

#### Get Student Progress
```
GET /api/parent/students/:studentId/progress
Authorization: Bearer <token>
```

### Notifications

#### Get Notifications
```
GET /api/parent/notifications
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `unreadOnly` (default: false)
- `studentId` (optional)
- `type` (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "_id": "notification_id",
        "type": "quiz_completion",
        "title": "🎉 Quiz Completed - John",
        "body": "Math Quiz: 8/10 (80%) - Good job!",
        "fullMessage": "Full notification message...",
        "isRead": false,
        "createdAt": "2026-01-20T10:00:00.000Z",
        "student": {
          "firstName": "John",
          "lastName": "Doe",
          "studentCode": "123456"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3,
      "hasMore": true
    },
    "unreadCount": 5
  }
}
```

#### Get Notification Details
```
GET /api/parent/notifications/:notificationId
Authorization: Bearer <token>
```

#### Get Unread Count
```
GET /api/parent/notifications/unread-count
Authorization: Bearer <token>
```

#### Mark Notification as Read
```
PUT /api/parent/notifications/:notificationId/read
Authorization: Bearer <token>
```

#### Mark All as Read
```
PUT /api/parent/notifications/mark-all-read
Authorization: Bearer <token>
```

#### Delete Notification
```
DELETE /api/parent/notifications/:notificationId
Authorization: Bearer <token>
```

---

## Notification System

### Notification Types

| Type | Description |
|------|-------------|
| `welcome` | New student registration |
| `quiz_completion` | Student completed a quiz |
| `content_completion` | Student completed content |
| `topic_completion` | Student completed a topic |
| `course_completion` | Student completed a course/week |
| `purchase` | Payment confirmed |
| `course_enrollment` | Enrolled in a course |
| `bundle_enrollment` | Enrolled in a bundle |
| `zoom_meeting` | Live session attendance |
| `zoom_non_attendance` | Missed live session |
| `general` | General notification |
| `announcement` | System announcement |

### Notification Model

```javascript
{
  parentPhone: String,
  parentCountryCode: String,
  student: ObjectId (ref: User),
  type: String,
  title: String,
  body: String,
  fullMessage: String,
  data: Object,
  isRead: Boolean,
  readAt: Date,
  deliveryStatus: {
    fcm: { sent, sentAt, error, messageId },
    sms: { sent, sentAt, error },
    whatsapp: { sent, sentAt, error }
  },
  priority: 'low' | 'normal' | 'high',
  actionUrl: String,
  imageUrl: String,
  expiresAt: Date
}
```

---

## FCM Integration

### How It Works

1. **Parent Login**: When parent logs in with FCM token, it's saved to all their students' records
2. **Notification Trigger**: When SMS/WhatsApp notification is sent, FCM is also triggered
3. **Token Management**: Invalid tokens are automatically cleaned up
4. **Multi-Student Support**: One parent can receive notifications for multiple students

### Sending Notifications

All notification methods in `whatsappSMSNotificationService.js` now also send FCM notifications:

```javascript
// Example: Quiz completion notification
const notificationService = require('./utils/whatsappSMSNotificationService');

await notificationService.sendQuizCompletionNotification(
  studentId,
  quizData,
  score,
  totalQuestions
);
// This sends: SMS/WhatsApp + FCM + saves to Notification model
```

### Direct FCM Usage

```javascript
const firebaseService = require('./utils/firebaseNotificationService');

// Send custom notification
await firebaseService.sendCustomNotification(
  studentId,
  'Title',
  'Body',
  'Full message content',
  { customData: 'value' },
  { priority: 'high' }
);

// Send to multiple students
await firebaseService.sendBulkNotification(
  studentIds,
  'Title',
  'Body'
);

// Send to course students
await firebaseService.sendToCourseStudents(
  courseId,
  'Title',
  'Body'
);
```

### Mobile App Integration

#### Android (Firebase Cloud Messaging)

```kotlin
// In your Application class
FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
    // Send token to server via /api/parent/update-fcm-token
}
```

#### iOS (APNs via Firebase)

```swift
// In AppDelegate
func application(_ application: UIApplication,
                 didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Messaging.messaging().apnsToken = deviceToken
}

Messaging.messaging().token { token, error in
    // Send token to server via /api/parent/update-fcm-token
}
```

---

## Error Handling

All API responses follow this format:

**Success:**
```json
{
  "success": true,
  "message": "Success message",
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error (development only)"
}
```

### Common Error Codes

| Status | Message |
|--------|---------|
| 400 | Bad Request - Missing required fields |
| 401 | Unauthorized - Invalid credentials or token |
| 404 | Not Found - Resource not found |
| 500 | Server Error - Internal error |

---

## Security Considerations

1. **JWT Tokens**: Use strong secrets and appropriate expiration
2. **Phone Verification**: Phone numbers are verified against student records
3. **Parent-Student Binding**: Parents can only access their own students' data
4. **FCM Token Cleanup**: Invalid tokens are automatically removed
5. **Rate Limiting**: Consider adding rate limiting for login attempts

---

## Files Created/Modified

### New Files
- `models/Notification.js` - Notification model
- `utils/firebaseNotificationService.js` - Firebase FCM service
- `controllers/parentController.js` - Parent API controller
- `routes/parent.js` - Parent API routes
- `docs/FIREBASE_PARENT_API.md` - This documentation

### Modified Files
- `models/User.js` - Added `parentFcmToken` and `parentFcmTokenUpdatedAt` fields
- `utils/whatsappSMSNotificationService.js` - Integrated FCM sending
- `app.js` - Registered parent routes
- `package.json` - Added `firebase-admin` dependency
