# Admin Controller Performance Audit Report

**File:** `controllers/adminController.js` (17,975 lines)  
**Date:** March 2, 2026  

---

## Summary

| Category | Issues Found |
|----------|-------------|
| Missing `.lean()` | 30+ queries |
| Sequential queries (need `Promise.all`) | 12 functions |
| Missing `.select()` | 20+ queries |
| N+1 Query Patterns | 8 functions |
| Heavy `.populate()` | 10+ queries |
| Missing pagination / unbounded queries | 15+ queries |
| Redundant / duplicate queries | 6 functions |

---

## CRITICAL ISSUES (Highest Impact)

---

### 1. `getGuestUsers` — Lines 17200–17395

**Issues:**
- **FETCHES ALL GUESTS TWICE** — Line 17264: `GuestUser.find({}).lean()` loads EVERY guest in the DB just to compute aggregate stats, AFTER already loading paginated guests at line 17248. This means every page load scans the entire collection.
- **Stats should use aggregation**, not loading all documents into memory.

**Fix:**
```js
// Replace allGuests fetch with aggregation:
const stats = await GuestUser.aggregate([
  {
    $unwind: '$quizAttempts'
  },
  {
    $unwind: '$quizAttempts.attempts'
  },
  {
    $match: { 'quizAttempts.attempts.status': 'completed' }
  },
  {
    $group: {
      _id: null,
      totalAttempts: { $sum: 1 },
      passedAttempts: { $sum: { $cond: ['$quizAttempts.attempts.passed', 1, 0] } },
      avgScore: { $avg: '$quizAttempts.attempts.score' }
    }
  }
]);
```

---

### 2. `exportStudentData` (bulk) — Lines 9018–9080

**Issues:**
- **N+1 QUERY**: Line 9033 — `Progress.find({ student: student._id })` executed INSIDE a `.map()` over ALL students. If 1000 students, that's 1000 extra DB queries.
- Missing `.lean()` on the main student query (line 9018 has it, but `Progress.find` at 9033 also has `.lean()` — OK).

**Fix:**
```js
// Pre-fetch all progress data in one query:
const allStudentIds = students.map(s => s._id);
const allProgress = await Progress.find({ student: { $in: allStudentIds } })
  .populate('course', 'title courseCode')
  .populate('topic', 'title')
  .sort({ timestamp: -1 })
  .lean();

// Group by student
const progressByStudent = {};
allProgress.forEach(p => {
  const sid = p.student.toString();
  if (!progressByStudent[sid]) progressByStudent[sid] = [];
  progressByStudent[sid].push(p);
});

// Then use progressByStudent[student._id.toString()] in the map
```

---

### 3. `exportStudentData` (single) — Lines 8437–8900

**Issues:**
- **MASSIVE N+1 PATTERN** — Lines 8478–8483: Inside `Promise.all(student.enrolledCourses.map(...))`, each course's topics trigger ANOTHER `Promise.all` that runs `Progress.find(...)` for each topic. So an enrolled student with 5 courses × 10 topics = 50+ DB queries.
- **Lines 8783–8786**: ANOTHER nested loop runs `Progress.find({ student, course })` inside `purchasedBundles.map → bundle.courses.map`. If student has 3 bundles × 5 courses = 15 more queries.
- **Line 8871**: Yet ANOTHER `Progress.find({ student: studentId })` fetching ALL progress data for the activity timeline.
- **Heavy `.populate()` without field selection** at line 8872: `.populate('course')` and `.populate('topic')` load entire documents.

**Fix:**
- Pre-fetch ALL progress data for the student in a SINGLE query at the top
- Use `allProgressData` throughout instead of querying repeatedly
- Add `.select()` to all populates

---

### 4. `getContentDetailsPage` — Lines 2693–3030

**Issues:**
- **Missing `.lean()`** — Lines 2697–2705: `Course.findOne().populate({ path: 'topics', populate: { path: 'content' }})` — no `.lean()` on a deeply populated query. Returns full Mongoose documents.
- **Missing `.lean()`** — Line 2710: `Topic.findById(topicId)` — no `.lean()`.
- **Missing `.lean()`** — Line 2748: `User.find({...}).select(...)` — fetches enrolled students without `.lean()`. These are Mongoose documents with full overhead.
- **Sequential queries** — Lines 2697, 2710, 2748 are 3 sequential awaits that are independent until the course check at line 2706.
- **Heavy `.populate()`** — Line 2699: Populating ALL topics with ALL content for the entire course when only one topic's content is needed.

**Fix:**
```js
// 1. Add .lean() to all queries
// 2. Don't populate all topics — only need the specific topic
// 3. Run course + topic queries in parallel:
const [course, topic] = await Promise.all([
  Course.findOne({ courseCode })
    .populate('bundle', 'title bundleCode year')
    .select('_id title bundle')
    .lean(),
  Topic.findById(topicId).lean(),
]);
// Then separately fetch enrolled students with .lean()
```

---

### 5. `getCoursesForSMS` — Lines 15996–16029

**Issues:**
- **N+1 QUERY**: Line 16005 — Inside `courses.map()`, runs `Progress.find({ course: course._id }).distinct('student')` for EACH course. If 50 courses → 50 DB queries.
- **Missing `.lean()`** on `Course.find({})` at line 15998.

**Fix:**
```js
// Single aggregation:
const courseStudentCounts = await Progress.aggregate([
  { $group: { _id: '$course', students: { $addToSet: '$student' } } },
  { $project: { _id: 1, studentCount: { $size: '$students' } } }
]);
```

---

### 6. `getBundlesForSMS` — Lines 16031–16080

**Issues:**
- **N+1 × 2 QUERY**: For each bundle (line 16041): `BundleCourse.findById(bundle._id).populate('courses')` (re-fetching each bundle individually!) THEN `Progress.find({ course: { $in: courseIds } }).distinct('student')`.
- **Missing `.lean()`** on `BundleCourse.find({})` at line 16033.

**Fix:**
```js
// Load bundles with courses in one query
const bundles = await BundleCourse.find({})
  .populate('courses', '_id')
  .select('_id title courses')
  .lean();

// Then single aggregation for all student counts
```

---

### 7. `skipContentForStudents` — Lines 16984–17200

**Issues:**
- **N+1 QUERY** — Line 17036: `User.findById(studentId)` called INSIDE a `for` loop over `studentIds`. If bulk-skipping 100 students → 100 individual DB reads + 100 individual saves.

**Fix:**
```js
// Fetch all students at once:
const students = await User.find({ _id: { $in: studentIds } });
// Process them, then use bulkWrite for saves
```

---

### 8. `enrollStudentsToCourse` — Lines 13258–13376

**Issues:**
- **N+1 PATTERN** — Line 13340: `student.safeEnrollInCourse(courseId)` + WhatsApp notification FOR EACH student in a sequential `for` loop. Each enrollment likely triggers a `.save()`.
- Students are already loaded (line 13278), but enrollment + save is sequential.

**Fix:**
```js
// Process enrollments in parallel batches:
const BATCH_SIZE = 10;
for (let i = 0; i < students.length; i += BATCH_SIZE) {
  const batch = students.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(async (student) => {
    await student.safeEnrollInCourse(courseId, finalStartingOrder);
    // fire-and-forget notifications
  }));
}
```

---

### 9. `enrollStudentsToBundle` — Lines 13379–13530

**Issues:**
- **DOUBLE N+1** — Line 13476: For EACH student, EACH `courseId` calls `student.safeEnrollInCourse(courseId)` sequentially. With 10 students × 5 courses = 50 sequential DB operations in a `for ... for` loop.
- Each student also gets a `.save()` (line 13483).

**Fix:** Same batch approach as above, and consider using `bulkWrite`.

---

## HIGH-IMPACT ISSUES

---

### 10. `getCourse` — Lines 668–693

**Issues:**
- **Missing `.lean()`** — Line 672: `Course.findOne({ courseCode }).populate('topics').populate('createdBy', 'userName')` — no `.lean()`.
- **Heavy `.populate('topics')`** — Populates ALL topics with ALL content (including nested subdocuments) when the page may only need topic titles.

**Fix:**
```js
const course = await Course.findOne({ courseCode })
  .populate({ path: 'topics', select: 'title order _id' })
  .populate('createdBy', 'userName')
  .lean();
```

---

### 11. `getBrilliantStudents` — Lines 10043–10107

**Issues:**
- **Missing `.lean()`** — Line 10065: `BrilliantStudent.find(filter).sort(...).skip(...).limit(...)` — no `.lean()`.
- **Sequential queries** — Lines 10071, 10073, 10076: `countDocuments`, `getStatistics`, and `distinct` are run sequentially. Could be parallelized with `Promise.all`.

**Fix:**
```js
const [students, totalStudents, stats, testTypes] = await Promise.all([
  BrilliantStudent.find(filter).sort({...}).skip(skip).limit(limit).lean(),
  BrilliantStudent.countDocuments(filter),
  BrilliantStudent.getStatistics(),
  BrilliantStudent.distinct('testType'),
]);
```

---

### 12. `getBrilliantStudentsStats` — Lines 10519–10542

**Issues:**
- **Sequential queries** — Lines 10521, 10522, 10523: `getStatistics()`, `countDocuments()`, `countDocuments({ isActive: true })` — 3 sequential queries.

**Fix:**
```js
const [stats, totalStudents, activeStudents] = await Promise.all([
  BrilliantStudent.getStatistics(),
  BrilliantStudent.countDocuments(),
  BrilliantStudent.countDocuments({ isActive: true }),
]);
```

---

### 13. `exportBrilliantStudents` — Lines 10543–10580

**Issues:**
- **Missing `.lean()`** — Line 10560: `BrilliantStudent.find(filter).sort(...)` — no `.lean()`.

**Fix:** Add `.lean()`.

---

### 14. `exportCourses` — Lines 10588–10620

**Issues:**
- **No pagination / unbounded** — Line 10590: `Course.find({})` fetches ALL courses.
- **Heavy `.populate('enrolledStudents', ...)`** — Populates all enrolled student documents for every course.

**Fix:** Use aggregation to get enrolled student counts instead of populating.

---

### 15. `exportOrders` — Lines 10622–10668

**Issues:**
- **No pagination / unbounded** — Line 10624: `Purchase.find({})` fetches ALL orders.
- `.populate('student', ...)` — note the field is `user` not `student` based on other code, so this may not even work.

---

### 16. `exportQuizzes` — Lines 10669–10696

**Issues:**
- **No pagination / unbounded** — Line 10671: `Quiz.find({})` fetches ALL quizzes.
- **Heavy `.populate('questions')`** — Populates ALL questions for ALL quizzes. Very expensive.

**Fix:** Only fetch quiz metadata, not all questions.

---

### 17. `exportComprehensiveReport` — Lines 10697–10790

**Issues:**
- **Fetches EVERYTHING** — Line 10704: `User.find({ role: 'student' })` — ALL students. Line 10705: `Course.find({})` — ALL courses. Line 10706: `Purchase.find({})` — ALL orders. Line 10709: `Quiz.find({}).populate('questions')` — ALL quizzes with ALL questions. Line 10710: `BrilliantStudent.find({})` — all brilliant students.
- This is a memory bomb for large datasets.

**Fix:** Stream data using cursors or process in batches. Use `select()` to limit fields.

---

### 18. `getQuestionBanksForContent` — Lines 5742–5773

**Issues:**
- **Missing `.lean()`** — Line 5756: `QuestionBank.find({ status: 'active' }).select(...).sort(...)` — no `.lean()`.

---

### 19. `getQuestionsFromBankForContent` — Lines 5774–5852

**Issues:**
- **Missing `.lean()`** — Lines 5811, 5820: `Question.find(filter).select(...).sort(...)` — no `.lean()`.

---

### 20. `getQuestionsFromMultipleBanksForContent` — Lines 5853–5929

**Issues:** Already uses `.lean()` — OK. But no limit/pagination — fetches ALL matching questions.

---

### 21. `getTopicDetails` — Lines 2267–2535

**Issues:**
- **Sequential queries** — Lines 2271, 2281, 2288 are 3 sequential awaits (course, topic, enrolledStudents).
- **Missing `.lean()`** on topic query (line 2281): `Topic.findById(topicId).populate('content.zoomMeeting')`.
- Topic query at line 2281 populates `content.zoomMeeting` without field selection.

**Fix:**
```js
const [course, topic] = await Promise.all([
  Course.findOne({ courseCode }).populate('bundle', 'title bundleCode year').lean(),
  Topic.findById(topicId).populate('content.zoomMeeting', 'meetingId status').lean(),
]);
// Then fetch enrolledStudents
```

---

### 22. `getTopicContentStudentStats` — Lines 2536–2640

**Issues:**
- **Sequential queries** — Lines 2542, 2548 are sequential (course, topic) when they could be parallel.
- **Missing `.lean()`** on `Topic.findById(topicId)` (line 2548).

---

### 23. `getStudentDetails` — Lines 7751–8225

**Issues:**
- **VERY HEAVY `.populate()`** — Lines 7757–7776: Populates `enrolledCourses.course` → `topics` (all topics with all content), `purchasedBundles.bundle` → `courses` (all courses), and `quizAttempts.quiz`. This is an extremely deep, multi-level populate.
- **Sequential queries** — Lines 7784 and 7821: `progressData` and `studentPurchases` are fetched sequentially after the student query. These are independent and can be parallelized.

**Fix:**
```js
const [progressData, studentPurchases, detailedAnalytics] = await Promise.all([
  Progress.find({ student: studentId }).populate('course', 'title courseCode').populate('topic', 'title').sort({ timestamp: -1 }).lean(),
  Purchase.find({ user: studentId }).populate({ path: 'items.item', select: 'title bundleCode courseCode' }).populate('appliedPromoCode', 'code discountPercentage').sort({ createdAt: -1 }).lean(),
  calculateStudentDetailedAnalytics(studentId, student),
]);
```
Also limit the depth of the initial student populate — don't load full topic content.

---

### 24. `getOrderDetails` — Lines 4688–4840

**Issues:**
- **Sequential queries** — Lines 4690, 4708, 4719, 4793, 4798: Multiple sequential queries (order → bookOrders → populate courses → customerPurchaseCount → customerPurchases).
- **Missing `.lean()` on initial order query** — Line 4690: `Purchase.findOne({ orderNumber }).populate(...)` — no `.lean()`.
- **Line 4719**: Re-populates inside a loop with `Purchase.populate(order, {...})`.
- **Line 4798**: `Purchase.find({...}).select('total')` — no `.lean()`.

**Fix:**
```js
// After fetching order, parallelize:
const [bookOrders, customerPurchaseCount, customerTotalSpent] = await Promise.all([
  BookOrder.find({ purchase: order._id }).populate(...).lean(),
  Purchase.countDocuments({ 'billingAddress.email': order.billingAddress.email }),
  Purchase.aggregate([
    { $match: { 'billingAddress.email': order.billingAddress.email, status: { $ne: 'refunded' } } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]),
]);
```

---

### 25. `refundOrder` — Lines 5272–5395

**Issues:**
- **Sequential queries** — Lines 5279, 5284: `Purchase.findOne` then `User.findById(...).populate('enrolledCourses.course')` are sequential.
- **Heavy `.populate('enrolledCourses.course')`** — Entire courses populated when only IDs are needed.
- **Sequential bundle saves** — Line 5357: `for (const bundle of bundlesUpdated) { await bundle.save(); }`.

**Fix:**
```js
// 1. Parallelize purchase + user fetch
// 2. Use bulkWrite for bundle saves
// 3. Don't populate enrolledCourses.course — only IDs are used
```

---

### 26. `completeFailedPayment` — Lines 5396–5485

**Issues:**
- **Heavy `.populate('user').populate('items.item')`** — Line 5405: Populates entire user document (including enrolledCourses, etc.) and entire item documents.

**Fix:** Add `.select()` to user populate: `.populate('user', 'firstName lastName studentEmail enrolledCourses purchasedBundles')`.

---

### 27. `verifyPendingPayment` — Lines 5486–5660

**Issues:**
- Same heavy populate as completeFailedPayment.

---

### 28. `addTopicContent` — Lines 3487–3795

**Issues:**
- **Redundant queries after save** — Lines 3749, 3750: After saving the topic, it re-queries `Course.findOne({ courseCode }).populate('topics')` and `Topic.findById(topicId)` JUST for logging. The data is already available.

**Fix:** Use the already-loaded course and topic data for logging.

---

### 29. `getTeamManagementPage` — Lines 15649–15700

**Issues:**
- **Sequential stats queries** — Lines 15682–15684: `TeamMember.countDocuments()`, `countDocuments({ isActive: true })`, `countDocuments({ isActive: false })` are 3 sequential queries.
- **Missing `.lean()`** on line 15672: `TeamMember.find(query).sort(...)` — no `.lean()`.
- Already loading all members (line 15672) so counts can be derived from the result.

**Fix:**
```js
// Derive stats from loaded data:
const stats = {
  total: teamMembers.length,
  active: teamMembers.filter(m => m.isActive).length,
  inactive: teamMembers.filter(m => !m.isActive).length,
};
```

---

### 30. `exportTeamMembers` — Lines 15870–15912

**Issues:**
- **Missing `.lean()`** — Line 15872: `TeamMember.find({}).sort(...).select(...)` — no `.lean()`.

---

### 31. `getStudentsForSMS` — Lines 15938–15992

**Issues:**
- **Missing `.lean()`** — Line 15954: `User.find(query).select(...).sort(...)` — no `.lean()`.

---

### 32. `exportBookOrders` — Lines 5216–5270

**Issues:**
- **No pagination / unbounded** — Line 5244: `BookOrder.find(filter)` with no limit. Could return thousands of records.

---

### 33. `getBookOrders` — Lines 4950–5120

**Issues:**
- Runs user search + purchase search SEQUENTIALLY (lines 5008, 5020) when they're independent.

**Fix:** Parallelize with `Promise.all`.

---

### 34. `getBundlesAPI` — Lines 6802–6815

**Issues:**
- **Missing `.lean()`** — Line 6804: `BundleCourse.find({...}).select(...).sort(...)` — no `.lean()`.

---

### 35. `getBundles` — Lines 6343–6420

**Issues:**
- **Heavy `.populate('courses')`** — Line 6370: Populates ALL courses for each bundle with ALL fields. Only summary data is needed for the listing page.

**Fix:**
```js
.populate('courses', 'title courseCode status _id')
```

---

### 36. `exportGuestUsers` — Lines 17699–17800

**Issues:**
- **No pagination / unbounded** — Line 17701: `GuestUser.find({}).populate(...).lean()` — loads ALL guests.

---

### 37. `getGuestsByQuiz` — Lines 17560–17655

**Issues:**
- **Missing `.lean()` partially** — The guest query at line 17577 does include `.lean()`, but the quiz query at line 17562 doesn't.
- **No pagination on results** — Accepts `page` and `limit` parameters but never applies them to the query (line 17577).

---

### 38. `duplicateCourse` — Lines 1494–1840

**Issues:**
- **Heavy `.populate('bundle')`** — Line 1504: Populates the entire bundle document when only `bundle._id` and `bundle.title` are needed.

---

### 39. `getCourseContent` — Lines 1844–1937

**Issues:**
- **Missing `.select()`** — Line 1907: `QuestionBank.find({ status: 'active' })` fetches entire bank documents when only `_id` and `name` are needed.

---

### 40. `getBulkCollectionDetails` — Lines 15149–15185

**Issues:**
- **Missing `.lean()`** — Line 15154: `PromoCode.find({ bulkCollectionId }).populate(...)` — no `.lean()`.

---

### 41. `exportBulkCollection` — Lines 15186–15303

**Issues:**
- **Missing `.lean()`** — Line 15191: `PromoCode.find({ bulkCollectionId }).populate(...)` — no `.lean()`.

---

### 42. `createAdminForm` / `createNewAdmin` — Lines 11826–11975

**Issues:**
- **Repeated identical query** — Lines 11829, 11854, 11873, 11901, 11936, 11952: `Admin.find({}).select().lean()` is called multiple times across different branches of the same handler. Should be queried once at the top.

---

### 43. `sendBulkSMS` — Lines 16150–16630

**Issues:**
- **Multiple independent queries not parallelized** — Lines 16253, 16261, 16271, 16311, 16321: Depending on `targetType`, it fetches course/bundle, then enrollments, then students, all sequentially.
- **Heavy `Course.findById(targetId).populate('enrolledStudents')`** — Line 16253: Loads all enrolled student documents.
- **Missing `.lean()`** throughout.

---

### 44. `getPromoCode` — Lines 14710–14740

**Issues:**
- **Missing `.lean()`** — Line 14714: `PromoCode.findById(id).populate(...)` — no `.lean()`.

---

### 45. `getPromoCodeUsage` — Lines 14741–14775

**Issues:**
- **Missing `.lean()`** — Line 14745: `PromoCode.findById(id).populate(...)` — no `.lean()`.

---

### 46. `getStudentsForSkipContent` — Lines 16895–16980

**Issues:**
- **Missing `.lean()`** — Line 16916: `User.find({...}).select(...)` — no `.lean()`. Since student data is iterated and manipulated, `.lean()` would improve performance.
- **Sequential queries** — Course fetch (line 16908) and student fetch (line 16916) are sequential, could be parallel.

---

## MEDIUM-IMPACT ISSUES

---

### 47. `bulkImportStudents` — Lines 12771–13131

**Issues:** 
- Processes CSV rows one-by-one with individual user lookups and saves. Could use `bulkWrite()` for inserts.

---

### 48. `reorderTeamMembers` — Lines 15844–15870

**Issues:**
- **N+1 updates** — Line 15860: `findByIdAndUpdate` in a `.map()` for each member. Uses `Promise.all` which helps, but `bulkWrite` would be more efficient.

---

### 49. Various `Admin.find({})` calls — Lines 11829–11955, 15454–15633

**Issues:**
- Admin management functions repeatedly call `Admin.find({}).select().lean()` — this is done before every admin creation/update/delete to verify uniqueness or build lists. Consider caching the admin list.

---

### 50. `getContentDetailsForEdit` — Lines 4251–4425

**Issues:**
- **Three sequential populates** — Lines 4256–4268: `Topic.findById(topicId).populate(...).populate(...).populate(...)` — OK as chained on single query, but `QuestionBank.find` at line 4315 is a separate sequential query.

---

## RECOMMENDED PRIORITY ORDER

### Priority 1 — Immediate (highest ROI):
1. **`getGuestUsers`** — Remove the second full-collection scan; use aggregation
2. **`exportStudentData` (bulk)** — Fix N+1 Progress queries
3. **`exportStudentData` (single)** — Fix deeply nested N+1 queries
4. **`getCoursesForSMS`** — Fix N+1 with aggregation
5. **`getBundlesForSMS`** — Fix N+1 + redundant fetches
6. **`skipContentForStudents`** — Batch student fetches
7. **`enrollStudentsToBundle`** — Fix double N+1

### Priority 2 — High:
8. Add `.lean()` to ALL read-only queries (30+ locations)
9. **`getStudentDetails`** — Reduce populate depth + parallelize
10. **`getContentDetailsPage`** — Parallelize + reduce populate
11. **`getOrderDetails`** — Parallelize sequential queries
12. **`getBundles`** — Limit `.populate('courses')` fields

### Priority 3 — Medium:
13. Add `.select()` to heavily populated queries
14. Add pagination to export endpoints or use streaming
15. Cache frequently-accessed reference data (question banks, admin lists)
16. **`exportComprehensiveReport`** — Stream/batch process

---

## QUICK-WIN CHECKLIST

Add `.lean()` to these specific lines:
- Line 672: `getCourse` — Course.findOne
- Line 2281: `getTopicDetails` — Topic.findById  
- Line 2548: `getTopicContentStudentStats` — Topic.findById
- Line 2748: `getContentDetailsPage` — User.find
- Line 4690: `getOrderDetails` — Purchase.findOne
- Line 4798: `getOrderDetails` — Purchase.find
- Line 5756: `getQuestionBanksForContent` — QuestionBank.find
- Line 5811 / 5820: `getQuestionsFromBankForContent` — Question.find
- Line 6804: `getBundlesAPI` — BundleCourse.find
- Line 10065: `getBrilliantStudents` — BrilliantStudent.find
- Line 10560: `exportBrilliantStudents` — BrilliantStudent.find
- Line 14714: `getPromoCode` — PromoCode.findById
- Line 14745: `getPromoCodeUsage` — PromoCode.findById
- Line 15154: `getBulkCollectionDetails` — PromoCode.find
- Line 15191: `exportBulkCollection` — PromoCode.find
- Line 15672: `getTeamManagementPage` — TeamMember.find
- Line 15872: `exportTeamMembers` — TeamMember.find
- Line 15954: `getStudentsForSMS` — User.find
- Line 15998: `getCoursesForSMS` — Course.find
- Line 16033: `getBundlesForSMS` — BundleCourse.find
- Line 16916: `getStudentsForSkipContent` — User.find
- Line 17701: `exportGuestUsers` — already has `.lean()` ✓
