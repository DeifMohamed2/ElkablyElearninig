# Database Index Audit Report

**Date:** March 2, 2026  
**Scope:** All Mongoose models in `/models/`

---

## Table of Contents

1. [User.js](#1-userjs) — **CRITICAL**
2. [Purchase.js](#2-purchasejs) — **CRITICAL**
3. [Progress.js](#3-progressjs) — **CRITICAL**
4. [Course.js](#4-coursejs) — **CRITICAL**
5. [Topic.js](#5-topicjs) — **CRITICAL (ZERO INDEXES)**
6. [Question.js](#6-questionjs)
7. [QuestionBank.js](#7-questionbankjs) — **CRITICAL (ALMOST NO INDEXES)**
8. [BundleCourse.js](#8-bundlecoursejs)
9. [Quiz.js](#9-quizjs)
10. [QuizModule.js](#10-quizmodulejs)
11. [GuestUser.js](#11-guestuserjs)
12. [BrilliantStudent.js](#12-brilliantstudentjs)
13. [PromoCode.js](#13-promocodejs)
14. [BookOrder.js](#14-bookorderjs)
15. [Admin.js](#15-adminjs)
16. [AdminLog.js](#16-adminlogjs) — **WARNING**
17. [Notification.js](#17-notificationjs)
18. [GameRoom.js](#18-gameroomjs)
19. [GameSession.js](#19-gamesessionjs)
20. [TeamMember.js](#20-teammemberjs)
21. [ZoomMeeting.js](#21-zoommeetingjs)
22. [Copy-Paste Ready Code](#copy-paste-ready-code)

---

## 1. User.js

### Existing Indexes

| Index                                                | Type     | Source               |
| ---------------------------------------------------- | -------- | -------------------- |
| `{ studentNumber: 1 }`                               | Unique   | `unique: true` field |
| `{ studentEmail: 1 }`                                | Unique   | `unique: true` field |
| `{ username: 1 }`                                    | Unique   | `unique: true` field |
| `{ studentCode: 1 }`                                 | Unique   | `unique: true` field |
| `{ isParentPhoneChecked: 1 }`                        | Single   | `index: true` field  |
| `{ parentFcmToken: 1 }`                              | Single   | `index: true` field  |
| `{ sessionToken: 1 }`                                | Single   | `index: true` field  |
| `{ role: 1, isActive: 1 }`                           | Compound | `schema.index()`     |
| `{ role: 1, createdAt: -1 }`                         | Compound | `schema.index()`     |
| `{ role: 1, grade: 1 }`                              | Compound | `schema.index()`     |
| `{ role: 1, schoolName: 1 }`                         | Compound | `schema.index()`     |
| `{ role: 1, 'enrolledCourses.course': 1 }`           | Compound | `schema.index()`     |
| `{ role: 1, 'purchasedBundles.bundle': 1 }`          | Compound | `schema.index()`     |
| `{ role: 1, lastLogin: -1 }`                         | Compound | `schema.index()`     |
| `{ studentCode: 1, role: 1 }`                        | Compound | `schema.index()`     |
| `{ parentNumber: 1, parentCountryCode: 1, role: 1 }` | Compound | `schema.index()`     |
| `{ 'enrolledCourses.course': 1 }`                    | Single   | `schema.index()`     |

### Missing Indexes

**1. `{ studentNumber: 1, studentCode: 1 }`** — Login via phone + student code

> Used by `User.statics.findByPhoneAndCode` for student login authentication. Without this compound index, it does separate scans on two fields.

**2. `{ isActive: 1, createdAt: -1 }`** — Admin dashboard new student filtering

> Admin pages filter by `isActive` and sort by `createdAt`. The existing `role+isActive` index helps, but a standalone `isActive + createdAt` covers queries that don't include `role`.

**3. `{ createdAt: -1 }`** — Standalone date sort

> Many admin queries sort by creation date. Without a leading `createdAt` index, MongoDB can't use the compound `role+createdAt` index when `role` isn't in the filter.

**4. `{ studentNumber: 1, parentCountryCode: 1 }`** — Parent phone search

> Admin searches by student phone number are very common. The unique index on `studentNumber` covers exact lookups, but combined filters (phone + country code) benefit from a compound index.

---

## 2. Purchase.js

### Existing Indexes

| Index                            | Type     | Source               |
| -------------------------------- | -------- | -------------------- |
| `{ orderNumber: 1 }`             | Unique   | `unique: true` field |
| `{ paymobTransactionId: 1 }`     | Single   | `index: true` field  |
| `{ paymobOrderId: 1 }`           | Single   | `index: true` field  |
| `{ paymobIntentionId: 1 }`       | Single   | `index: true` field  |
| `{ libraryNotificationSent: 1 }` | Single   | `index: true` field  |
| `{ status: 1, createdAt: -1 }`   | Compound | `schema.index()`     |
| `{ createdAt: -1 }`              | Single   | `schema.index()`     |
| `{ user: 1, status: 1 }`         | Compound | `schema.index()`     |
| `{ status: 1, refundedAt: 1 }`   | Compound | `schema.index()`     |
| `{ paymentStatus: 1 }`           | Single   | `schema.index()`     |

### Missing Indexes

**1. `{ user: 1, createdAt: -1 }`** — User purchase history listing

> `getUserPurchases` and admin "Customer Purchases" tab query by `user` and sort by `createdAt: -1`. The existing `user+status` index doesn't cover this efficiently.

**2. `{ 'items.item': 1 }`** — Find purchases containing a specific course/bundle

> Admin queries for "purchases containing course X" scan the `items` array. This index enables efficient lookup.

**3. `{ paymentStatus: 1, createdAt: -1 }`** — Admin payment dashboard queries

> The existing `paymentStatus` standalone index can't efficiently support sorted queries. Adding `createdAt` avoids an in-memory sort.

**4. `{ status: 1, paymentStatus: 1 }`** — Combined status filtering

> Admin dashboard often filters by both `status` and `paymentStatus` together (e.g., pending payments that are still processing).

---

## 3. Progress.js

### Existing Indexes

| Index                                      | Type     | Source                                         |
| ------------------------------------------ | -------- | ---------------------------------------------- |
| `{ student: 1, course: 1, timestamp: -1 }` | Compound | `schema.index()`                               |
| `{ student: 1, activity: 1 }`              | Compound | `schema.index()`                               |
| `{ course: 1, activity: 1 }`               | Compound | `schema.index()`                               |
| `{ student: 1, course: 1, content: 1 }`    | Compound | `schema.index()`                               |
| `{ student: 1, topic: 1, content: 1 }`     | Compound | `schema.index()`                               |
| `{ student: 1, course: 1 }`                | Compound | `schema.index()` (redundant — prefix of first) |
| `{ completed: 1 }`                         | Single   | `schema.index()` **BUG**                       |
| `{ timestamp: -1 }`                        | Single   | `schema.index()`                               |

### Issues Found

**BUG: `{ completed: 1 }` index references a non-existent field.** The Progress model has a `status` field (not `completed`). This index wastes disk space and provides zero benefit.

### Missing Indexes

**1. `{ student: 1, course: 1, activity: 1, status: 1 }`** — Content completion checks

> `trackContentProgress` and `isContentUnlocked` query by student + course + content + activity + status. This compound index covers these critical hot-path queries.

**2. `{ course: 1, timestamp: -1 }`** — Course analytics

> `getCourseAnalytics` aggregates by course and groups by activity. A course+timestamp index optimizes the `$match` stage.

**3. `{ status: 1 }`** — Status filtering

> Replace the buggy `{ completed: 1 }` index. Used when filtering progress records by status.

---

## 4. Course.js

### Existing Indexes

| Index                          | Type     | Source               |
| ------------------------------ | -------- | -------------------- |
| `{ courseCode: 1 }`            | Unique   | `unique: true` field |
| `{ status: 1, createdAt: -1 }` | Compound | `schema.index()`     |
| `{ bundle: 1, status: 1 }`     | Compound | `schema.index()`     |

### Missing Indexes

**1. `{ bundle: 1, order: 1 }`** — Sequential course ordering within a bundle

> `isCourseUnlocked` uses `Course.find({ bundle: course.bundle }).sort({ order: 1 })` — a compound index on bundle+order avoids in-memory sorting.

**2. `{ category: 1, status: 1 }`** — Category-based filtering

> Admin filters courses by category and status (e.g., "published courses in Math category").

**3. `{ isActive: 1, status: 1 }`** — Active course listings

> Landing pages and student views filter by `isActive` and `status: 'published'`.

**4. `{ createdBy: 1 }`** — Admin-created course lookups

> Querying courses created by a specific admin.

---

## 5. Topic.js — **CRITICAL: ZERO INDEXES**

### Existing Indexes

| Index  | Type | Source |
| ------ | ---- | ------ |
| (none) | —    | —      |

Topic has **no indexes at all** (not even `unique` fields). This is the most critical finding.

### Missing Indexes

**1. `{ course: 1, order: 1 }`** — Primary query pattern

> Almost every Topic query filters by `course` and sorts by `order`. This is the single most impactful missing index. Used by `Topic.find({ course: course._id }).sort({ order: 1 })` which appears in many admin operations.

**2. `{ course: 1 }`** — Topic count and listing

> Used by `Topic.countDocuments({ course: course._id })` and simple lookups.

**3. `{ isPublished: 1 }`** — Published topic filtering

> Student-facing queries filter by publication status.

**4. `{ createdBy: 1 }`** — Admin-created topic lookups.

---

## 6. Question.js

### Existing Indexes

| Index                                           | Type     | Source           |
| ----------------------------------------------- | -------- | ---------------- |
| `{ bank: 1, difficulty: 1 }`                    | Compound | `schema.index()` |
| `{ bank: 1, tags: 1 }`                          | Compound | `schema.index()` |
| `{ bank: 1, status: 1 }`                        | Compound | `schema.index()` |
| `{ questionText: 'text', explanation: 'text' }` | Text     | `schema.index()` |

### Missing Indexes

**1. `{ bank: 1, isActive: 1 }`** — Active question filtering per bank

> Admin question bank management filters active questions.

**2. `{ bank: 1, createdAt: -1 }`** — Chronological listing per bank

> Admin views questions sorted by creation date within a bank.

---

## 7. QuestionBank.js — **CRITICAL: ALMOST NO INDEXES**

### Existing Indexes

| Index             | Type   | Source               |
| ----------------- | ------ | -------------------- |
| `{ bankCode: 1 }` | Unique | `unique: true` field |

### Missing Indexes

**1. `{ status: 1, isActive: 1 }`** — Active bank listing

> `QuestionBank.find({ status: 'active' })` is called frequently in admin operations.

**2. `{ testType: 1, status: 1 }`** — Test type filtering

> Admin filters banks by test type (EST, SAT, ACT).

**3. `{ createdBy: 1 }`** — Admin-created bank lookups.

**4. `{ createdAt: -1 }`** — Date-sorted bank listing.

---

## 8. BundleCourse.js

### Existing Indexes

| Index                                        | Type     | Source               |
| -------------------------------------------- | -------- | -------------------- |
| `{ bundleCode: 1 }`                          | Unique   | `unique: true` field |
| `{ status: 1 }`                              | Single   | `schema.index()`     |
| `{ createdBy: 1 }`                           | Single   | `schema.index()`     |
| `{ testType: 1 }`                            | Single   | `schema.index()`     |
| `{ courseType: 1, testType: 1, subject: 1 }` | Compound | `schema.index()`     |
| `{ courseType: 1, status: 1, isActive: 1 }`  | Compound | `schema.index()`     |

### Missing Indexes

**1. `{ isActive: 1, status: 1, createdAt: -1 }`** — Active bundle listing with date sort

> Landing pages and admin list active published bundles sorted by date.

---

## 9. Quiz.js

### Existing Indexes

| Index                 | Type   | Source               |
| --------------------- | ------ | -------------------- |
| `{ code: 1 }`         | Unique | `unique: true` field |
| `{ questionBank: 1 }` | Single | `schema.index()`     |
| `{ status: 1 }`       | Single | `schema.index()`     |
| `{ createdBy: 1 }`    | Single | `schema.index()`     |
| `{ createdAt: -1 }`   | Single | `schema.index()`     |
| `{ isDeleted: 1 }`    | Single | `schema.index()`     |
| `{ deletedAt: -1 }`   | Single | `schema.index()`     |

### Missing Indexes

**1. `{ module: 1, moduleOrder: 1 }`** — Module-based quiz ordering

> Quiz listing within a module uses `module` filter and `moduleOrder` sort.

**2. `{ testType: 1, status: 1 }`** — Test type filtering

> Admin filters quizzes by test type and status.

**3. `{ isDeleted: 1, status: 1 }`** — Soft-delete filtered queries

> The pre-find hook adds `isDeleted: {$ne: true}`, combined with status filtering.

**4. `{ module: 1, isDeleted: 1 }`** — Virtual `quizzes` count on QuizModule

> QuizModule has a virtual that queries `Quiz` by `{ module: id, isDeleted: false }`.

---

## 10. QuizModule.js

### Existing Indexes

| Index                                  | Type              | Source                                        |
| -------------------------------------- | ----------------- | --------------------------------------------- |
| `{ code: 1 }`                          | Unique + Explicit | `unique: true` + `schema.index()` (redundant) |
| `{ testType: 1, status: 1, order: 1 }` | Compound          | `schema.index()`                              |
| `{ isDeleted: 1 }`                     | Single            | `schema.index()`                              |

### Missing Indexes

**1. `{ isDeleted: 1, testType: 1, order: 1 }`** — Pre-find hook + test type filter

> The pre-find hook adds `isDeleted: false`. Combined with testType and order for listing.

---

## 11. GuestUser.js

### Existing Indexes

| Index                        | Type              | Source                         |
| ---------------------------- | ----------------- | ------------------------------ |
| `{ sessionId: 1 }`           | Unique + Explicit | `unique: true` + `index: true` |
| `{ email: 1 }`               | Single            | `schema.index()`               |
| `{ phone: 1 }`               | Single            | `schema.index()`               |
| `{ createdAt: -1 }`          | Single            | `schema.index()`               |
| `{ 'quizAttempts.quiz': 1 }` | Single            | `schema.index()`               |
| `{ sessionExpiresAt: 1 }`    | Single            | `schema.index()`               |

### Missing Indexes

**1. `{ isActive: 1, createdAt: -1 }`** — Active guest listing

> Admin guest management filters active guests sorted by date.

**2. `{ lastActiveAt: -1 }`** — Recent activity sorting

> Stats query filters by `lastActiveAt >= 24h ago`.

---

## 12. BrilliantStudent.js

### Existing Indexes

| Index                                           | Type     | Source           |
| ----------------------------------------------- | -------- | ---------------- |
| `{ testType: 1, isActive: 1, displayOrder: 1 }` | Compound | `schema.index()` |
| `{ percentage: -1 }`                            | Single   | `schema.index()` |
| `{ createdAt: -1 }`                             | Single   | `schema.index()` |

**Well indexed. No missing critical indexes.**

---

## 13. PromoCode.js

### Existing Indexes

| Index                                          | Type     | Source               |
| ---------------------------------------------- | -------- | -------------------- |
| `{ code: 1 }`                                  | Unique   | `unique: true` field |
| `{ isActive: 1, validFrom: 1, validUntil: 1 }` | Compound | `schema.index()`     |
| `{ 'usageHistory.user': 1 }`                   | Single   | `schema.index()`     |
| `{ isBulkCode: 1, bulkCollectionId: 1 }`       | Compound | `schema.index()`     |
| `{ bulkCollectionName: 1 }`                    | Single   | `schema.index()`     |
| `{ isSingleUseOnly: 1, usedByStudent: 1 }`     | Compound | `schema.index()`     |

### Missing Indexes

**1. `{ createdBy: 1 }`** — Admin-created promo code tracking.

**2. `{ createdAt: -1 }`** — Date-sorted promo code listing.

---

## 14. BookOrder.js

### Existing Indexes

| Index                    | Type     | Source                           |
| ------------------------ | -------- | -------------------------------- |
| `{ orderNumber: 1 }`     | Single   | `index: true` field (NOT unique) |
| `{ user: 1, bundle: 1 }` | Compound | `schema.index()`                 |
| `{ status: 1 }`          | Single   | `schema.index()`                 |
| `{ createdAt: -1 }`      | Single   | `schema.index()`                 |

### Missing Indexes

**1. `{ purchase: 1 }`** — Find book orders by purchase ID

> Admin order detail page calls `BookOrder.find({ purchase: order._id })`.

**2. `{ user: 1, status: 1 }`** — User book order filtering

> `getUserBookOrders` filters by user and optional status.

**3. `{ status: 1, createdAt: -1 }`** — Admin dashboard sorted queries

> Admin lists book orders by status with date sort.

---

## 15. Admin.js

### Existing Indexes

| Index                | Type   | Source               |
| -------------------- | ------ | -------------------- |
| `{ phoneNumber: 1 }` | Unique | `unique: true` field |

### Missing Indexes

**1. `{ role: 1, isActive: 1 }`** — Admin listing filter

> Admin management page filters by role and active status.

---

## 16. AdminLog.js — **WARNING**

### Existing Indexes (POSSIBLE BUG)

The indexes are defined in the **schema options object** rather than using `schema.index()` calls:

```javascript
{
  timestamps: true,
  indexes: [            // <-- This is NOT standard Mongoose
    { admin: 1, createdAt: -1 },
    { action: 1, createdAt: -1 },
    // ...
  ],
}
```

**Mongoose does NOT support `indexes` in schema options.** These indexes are **NOT being created**. This is a critical bug — AdminLog queries for the admin activity log are doing full collection scans.

### Missing Indexes (All of them — none are actually created)

Should be converted to proper `schema.index()` calls:

```
{ admin: 1, createdAt: -1 }
{ action: 1, createdAt: -1 }
{ actionCategory: 1, createdAt: -1 }
{ targetModel: 1, targetId: 1 }
{ createdAt: -1 }
```

Plus additional:

**`{ status: 1, createdAt: -1 }`** — Failed action filtering.

---

## 17. Notification.js

### Existing Indexes

| Index                                          | Type     | Source              |
| ---------------------------------------------- | -------- | ------------------- |
| `{ parentPhone: 1 }`                           | Single   | `index: true` field |
| `{ student: 1 }`                               | Single   | `index: true` field |
| `{ type: 1 }`                                  | Single   | `index: true` field |
| `{ isRead: 1 }`                                | Single   | `index: true` field |
| `{ parentPhone: 1, isRead: 1, createdAt: -1 }` | Compound | `schema.index()`    |
| `{ parentPhone: 1, createdAt: -1 }`            | Compound | `schema.index()`    |
| `{ student: 1, createdAt: -1 }`                | Compound | `schema.index()`    |

**Well indexed. No missing critical indexes.**

---

## 18. GameRoom.js

### Existing Indexes

| Index                          | Type     | Source               |
| ------------------------------ | -------- | -------------------- |
| `{ roomCode: 1 }`              | Unique   | `unique: true` field |
| `{ isActive: 1, isPublic: 1 }` | Compound | `schema.index()`     |
| `{ gameState: 1 }`             | Single   | `schema.index()`     |
| `{ createdBy: 1 }`             | Single   | `schema.index()`     |

**Adequately indexed.**

---

## 19. GameSession.js

### Existing Indexes

| Index                        | Type     | Source           |
| ---------------------------- | -------- | ---------------- |
| `{ user: 1, gameRoom: 1 }`   | Compound | `schema.index()` |
| `{ gameRoom: 1, status: 1 }` | Compound | `schema.index()` |
| `{ gameRoom: 1, score: -1 }` | Compound | `schema.index()` |
| `{ socketId: 1 }`            | Single   | `schema.index()` |

**Well indexed.**

---

## 20. TeamMember.js

### Existing Indexes

| Index                              | Type     | Source           |
| ---------------------------------- | -------- | ---------------- |
| `{ displayOrder: 1, isActive: 1 }` | Compound | `schema.index()` |
| `{ isActive: 1 }`                  | Single   | `schema.index()` |

**Adequately indexed.**

---

## 21. ZoomMeeting.js

### Existing Indexes

| Index                               | Type              | Source                         |
| ----------------------------------- | ----------------- | ------------------------------ |
| `{ meetingId: 1 }`                  | Unique + Explicit | `unique: true` + `index: true` |
| `{ status: 1 }`                     | Single            | `index: true` field            |
| `{ topic: 1, status: 1 }`           | Compound          | `schema.index()`               |
| `{ course: 1, status: 1 }`          | Compound          | `schema.index()`               |
| `{ scheduledStartTime: 1 }`         | Single            | `schema.index()`               |
| `{ 'studentsAttended.student': 1 }` | Single            | `schema.index()`               |

**Well indexed.**

---

## Copy-Paste Ready Code

### User.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Login via phone + student code (findByPhoneAndCode)
UserSchema.index({ studentNumber: 1, studentCode: 1 });
// Admin dashboard: inactive student filtering sorted by date
UserSchema.index({ isActive: 1, createdAt: -1 });
// Standalone date sort for queries without role filter
UserSchema.index({ createdAt: -1 });
```

### Purchase.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// User purchase history listing (sorted by date)
PurchaseSchema.index({ user: 1, createdAt: -1 });
// Find purchases containing a specific course/bundle item
PurchaseSchema.index({ 'items.item': 1 });
// Admin payment dashboard: payment status + date sort
PurchaseSchema.index({ paymentStatus: 1, createdAt: -1 });
// Combined status filtering
PurchaseSchema.index({ status: 1, paymentStatus: 1 });
```

### Progress.js — Fix bug + add missing indexes

**STEP 1: Remove buggy index** — Find and delete this line:

```javascript
ProgressSchema.index({ completed: 1 });
```

**STEP 2: Add new indexes** (before `module.exports`):

```javascript
// === NEW/FIXED INDEXES ===
// Replace buggy { completed: 1 } with correct field name
ProgressSchema.index({ status: 1 });
// Content completion checks (student + course + activity + status)
ProgressSchema.index({ student: 1, course: 1, activity: 1, status: 1 });
// Course analytics ($match stage optimization)
ProgressSchema.index({ course: 1, timestamp: -1 });
```

### Course.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Sequential course ordering within a bundle (isCourseUnlocked)
CourseSchema.index({ bundle: 1, order: 1 });
// Category-based admin filtering
CourseSchema.index({ category: 1, status: 1 });
// Active course listing for students/landing pages
CourseSchema.index({ isActive: 1, status: 1 });
// Admin-created course lookups
CourseSchema.index({ createdBy: 1 });
```

### Topic.js — Add before `module.exports` (NO indexes currently exist)

```javascript
// ==================== Performance Indexes ====================
// Primary query pattern: topics in a course, sorted by order
TopicSchema.index({ course: 1, order: 1 });
// Topic count and listing by course
TopicSchema.index({ course: 1 });
// Published topic filtering (student-facing)
TopicSchema.index({ isPublished: 1 });
// Admin-created topic lookups
TopicSchema.index({ createdBy: 1 });
```

### Question.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Active question filtering per bank
QuestionSchema.index({ bank: 1, isActive: 1 });
// Chronological listing per bank
QuestionSchema.index({ bank: 1, createdAt: -1 });
```

### QuestionBank.js — Add before `module.exports`

```javascript
// ==================== Performance Indexes ====================
// Active bank listing
QuestionBankSchema.index({ status: 1, isActive: 1 });
// Test type filtering
QuestionBankSchema.index({ testType: 1, status: 1 });
// Admin-created bank lookups
QuestionBankSchema.index({ createdBy: 1 });
// Date-sorted bank listing
QuestionBankSchema.index({ createdAt: -1 });
```

### BundleCourse.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Active bundle listing with date sort
BundleCourseSchema.index({ isActive: 1, status: 1, createdAt: -1 });
```

### Quiz.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Module-based quiz ordering
quizSchema.index({ module: 1, moduleOrder: 1 });
// Test type filtering
quizSchema.index({ testType: 1, status: 1 });
// Soft-delete + status compound (pre-find hook optimization)
quizSchema.index({ isDeleted: 1, status: 1 });
// Module quiz listing (used by QuizModule virtual)
quizSchema.index({ module: 1, isDeleted: 1 });
```

### QuizModule.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Pre-find hook + test type filter combined
quizModuleSchema.index({ isDeleted: 1, testType: 1, order: 1 });
```

### GuestUser.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Active guest listing with date sort
guestUserSchema.index({ isActive: 1, createdAt: -1 });
// Recent activity sorting
guestUserSchema.index({ lastActiveAt: -1 });
```

### PromoCode.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Admin-created promo code tracking
promoCodeSchema.index({ createdBy: 1 });
// Date-sorted promo code listing
promoCodeSchema.index({ createdAt: -1 });
```

### BookOrder.js — Add after existing indexes (before `module.exports`)

```javascript
// === NEW INDEXES ===
// Find book orders by purchase ID (admin order details)
BookOrderSchema.index({ purchase: 1 });
// User book order filtering by status
BookOrderSchema.index({ user: 1, status: 1 });
// Admin dashboard: status + date sort
BookOrderSchema.index({ status: 1, createdAt: -1 });
```

### Admin.js — Add before `module.exports`

```javascript
// ==================== Performance Indexes ====================
// Admin listing filter by role and active status
AdminSchema.index({ role: 1, isActive: 1 });
```

### AdminLog.js — **CRITICAL FIX**: Convert broken schema-option indexes to proper `schema.index()` calls

**STEP 1: Remove the `indexes` property from schema options.** Change:

```javascript
{
  timestamps: true,
  indexes: [
    { admin: 1, createdAt: -1 },
    { action: 1, createdAt: -1 },
    { actionCategory: 1, createdAt: -1 },
    { targetModel: 1, targetId: 1 },
    { createdAt: -1 },
  ],
}
```

To:

```javascript
{
  timestamps: true;
}
```

**STEP 2: Add proper `schema.index()` calls** before `module.exports`:

```javascript
// ==================== Performance Indexes ====================
// Admin activity log queries
AdminLogSchema.index({ admin: 1, createdAt: -1 });
AdminLogSchema.index({ action: 1, createdAt: -1 });
AdminLogSchema.index({ actionCategory: 1, createdAt: -1 });
AdminLogSchema.index({ targetModel: 1, targetId: 1 });
AdminLogSchema.index({ createdAt: -1 });
AdminLogSchema.index({ status: 1, createdAt: -1 });
```

---

## Summary

| Severity     | Model           | Issue                                                  |
| ------------ | --------------- | ------------------------------------------------------ |
| **CRITICAL** | Topic.js        | ZERO indexes — all queries do full collection scans    |
| **CRITICAL** | AdminLog.js     | Indexes defined in wrong format — NONE are created     |
| **CRITICAL** | QuestionBank.js | Only 1 unique index — missing all query indexes        |
| **BUG**      | Progress.js     | `{ completed: 1 }` index references non-existent field |
| **HIGH**     | Course.js       | Missing `bundle+order` index for sequential unlocking  |
| **HIGH**     | Purchase.js     | Missing `user+createdAt` for purchase history          |
| **HIGH**     | User.js         | Missing `studentNumber+studentCode` for login          |
| **HIGH**     | Quiz.js         | Missing `module+moduleOrder` for module quiz listing   |
| **MEDIUM**   | BookOrder.js    | Missing `purchase` index for order details             |
| **MEDIUM**   | Question.js     | Missing `bank+isActive` filter index                   |
| **MEDIUM**   | GuestUser.js    | Missing activity-based indexes                         |
| **LOW**      | BundleCourse.js | Minor: missing active+status+date compound             |
| **LOW**      | PromoCode.js    | Minor: missing createdBy and createdAt                 |
| **LOW**      | Admin.js        | Minor: missing role+isActive compound                  |

**Total new indexes to add: ~40**  
**Bugfix: 2** (Progress.js wrong field, AdminLog.js wrong format)
