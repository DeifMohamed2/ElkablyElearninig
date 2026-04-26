/**
 * Student mobile API — JSON handlers and thin wrappers around studentController
 * using JWT-injected session (see utils/asStudentRequest.js).
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Quiz = require('../models/Quiz');
const QuizModule = require('../models/QuizModule');
const Progress = require('../models/Progress');
const BundleCourse = require('../models/BundleCourse');
const Topic = require('../models/Topic');
const ZoomMeeting = require('../models/ZoomMeeting');
const { wrapStudentHandler } = require('../utils/asStudentRequest');
const {
  normalizeZoomMeetingForMobile,
  wrapResJsonWithMobileBunnyRecording,
} = require('../utils/mobileBunnyRecording');
const studentController = require('./studentController');
const { buildProfilePayload } = require('./studentMobileAuthController');

const studentId = (req) => req.studentMobileUser._id;

/** Shared slim course shape — no topics/content population (topicCount from id array length) */
const SLIM_COURSE_SELECT =
  'title shortDescription thumbnail courseCode order topics requiresSequential isFullyBooked fullyBookedMessage bundle';

const buildSlimCourseCard = (c) => {
  if (!c) return null;
  const topicIds = c.topics || [];
  const b = c.bundle;
  return {
    _id: c._id,
    title: c.title,
    shortDescription: c.shortDescription || '',
    thumbnail: c.thumbnail || '',
    courseCode: c.courseCode,
    order: c.order,
    requiresSequential: c.requiresSequential !== false,
    topicCount: Array.isArray(topicIds) ? topicIds.length : 0,
    isFullyBooked: !!c.isFullyBooked,
    fullyBookedMessage: c.fullyBookedMessage || 'FULLY BOOKED',
    bundle: b
      ? {
          _id: b._id,
          title: b.title,
          thumbnail: b.thumbnail || '',
          bundleCode: b.bundleCode,
        }
      : null,
  };
};

/** Dashboard cards — slim course + enrollment progress fields */
const toDashboardActiveCourse = (enrollment) => {
  const card = buildSlimCourseCard(enrollment.course);
  if (!card) return null;
  return {
    ...card,
    progress: enrollment.progress,
    lastAccessed: enrollment.lastAccessed,
    status: enrollment.status,
  };
};

const buildContentTitleLookup = (topics) => {
  const map = new Map();
  for (const t of topics) {
    for (const c of t.content || []) {
      if (c && c._id) map.set(c._id.toString(), c.title || '');
    }
  }
  return map;
};

/** Outline row only — full payload from GET /content/:contentId */
const slimOutlineContentItem = (contentItem, titleById, extra) => {
  const prereq = contentItem.prerequisites || [];
  const zoomRef = contentItem.zoomMeeting;
  const zoomMeetingId =
    zoomRef != null
      ? typeof zoomRef === 'object' && zoomRef._id
        ? zoomRef._id.toString()
        : String(zoomRef)
      : null;
  return {
    _id: contentItem._id,
    type: contentItem.type,
    title: contentItem.title,
    order: contentItem.order,
    duration: contentItem.duration,
    isRequired: contentItem.isRequired,
    completionCriteria: contentItem.completionCriteria,
    prerequisiteIds: prereq.map((p) => p.toString()),
    prerequisiteTitles: prereq.map(
      (id) => titleById.get(id.toString()) || 'Previous content',
    ),
    zoomMeetingId: contentItem.type === 'zoom' ? zoomMeetingId : null,
    ...extra,
  };
};

const buildCourseOutlineSummary = (course) => {
  const card = buildSlimCourseCard(course);
  const createdBy =
    course.createdBy && typeof course.createdBy === 'object'
      ? { _id: course.createdBy._id, name: course.createdBy.name }
      : course.createdBy || null;
  return {
    ...card,
    description: (course.description || '').slice(0, 500),
    shortDescription: course.shortDescription || '',
    status: course.status,
    isActive: course.isActive,
    createdBy,
  };
};

/** Same numeric result as User.calculateTopicProgress without reloading the course from DB */
const averageTopicProgressFromEnrollment = (topic, enrollment) => {
  const items = topic.content || [];
  if (!items.length) return 0;
  let total = 0;
  for (const item of items) {
    const cp = enrollment.contentProgress.find(
      (x) => x.contentId.toString() === item._id.toString(),
    );
    total += cp ? (cp.progressPercentage || 0) : 0;
  }
  return Math.round(total / items.length);
};

const enrollmentHasCompletedTopic = (enrollment, topicId) => {
  const tid = topicId.toString();
  return (enrollment.completedTopics || []).some(
    (id) => id != null && id.toString() === tid,
  );
};

const toPlainSettings = (s) => {
  if (!s) return {};
  const o = s.toObject ? s.toObject() : { ...s };
  return {
    passingCriteria: o.passingCriteria,
    passingScore: o.passingScore,
    maxAttempts: o.maxAttempts,
    duration: o.duration,
    shuffleQuestions: o.shuffleQuestions,
    shuffleOptions: o.shuffleOptions,
    showCorrectAnswers: o.showCorrectAnswers,
    showResults: o.showResults,
    instructions: o.instructions || '',
  };
};

/** Single settings object for mobile quiz/homework (no duplicate quizTake.settings). */
function slimActivitySettings(raw, type) {
  const p = toPlainSettings(raw);
  const maxAttemptsDefault = type === 'quiz' ? 3 : 1;
  return {
    passingCriteria: p.passingCriteria,
    passingScore: typeof p.passingScore === 'number' ? p.passingScore : type === 'quiz' ? 60 : 0,
    maxAttempts:
      typeof p.maxAttempts === 'number' ? p.maxAttempts : maxAttemptsDefault,
    duration: p.duration,
    shuffleQuestions: !!p.shuffleQuestions,
    shuffleOptions: !!p.shuffleOptions,
    showCorrectAnswers: p.showCorrectAnswers !== false,
    showResults: p.showResults !== false,
    instructions: p.instructions || '',
  };
}

const QUIZ_HOMEWORK_TYPES = new Set(['quiz', 'homework']);

const ANSWER_REVIEW_DISABLED_TITLE = 'Answer Review Not Available';
const ANSWER_REVIEW_DISABLED_BODY =
  'Answer review is not enabled for this quiz. Contact your instructor if you have questions about your answers.';

/** GET /content/:id — no stems/options; use secure quiz POSTs to load questions. */
function contentItemSummaryForDetailsPage(slimContentItem) {
  if (!slimContentItem) return null;
  const { selectedQuestions: _omit, ...rest } = slimContentItem;
  return rest;
}

function attemptSummaryForMobile(contentType, rawContentItem, contentProgress) {
  const maxAttempts =
    contentType === 'quiz'
      ? rawContentItem.quizSettings?.maxAttempts || 3
      : rawContentItem.homeworkSettings?.maxAttempts || 1;
  const used = contentProgress?.attempts ?? 0;
  const recorded = contentProgress?.quizAttempts?.length ?? 0;
  return {
    maxAttempts,
    attemptsUsed: used,
    attemptsRemaining: Math.max(0, maxAttempts - used),
    recordedAttemptsCount: recorded,
  };
}

function quizAttemptToPlain(attempt) {
  if (attempt == null) return null;
  if (typeof attempt.toObject === 'function') {
    return attempt.toObject({ virtuals: false });
  }
  if (typeof attempt === 'object') {
    return { ...attempt };
  }
  return attempt;
}

/**
 * Content-details only — plain JSON, no Mongoose internals, no answers.
 * Per-question data: GET /content/:id/results
 */
function slimQuizAttemptForContentDetails(attempt) {
  const plain = quizAttemptToPlain(attempt);
  if (!plain || typeof plain !== 'object') return plain;
  return {
    _id: plain._id,
    attemptNumber: plain.attemptNumber,
    score: plain.score,
    totalQuestions: plain.totalQuestions,
    correctAnswers: plain.correctAnswers,
    timeSpent: plain.timeSpent,
    startedAt: plain.startedAt,
    completedAt: plain.completedAt,
    status: plain.status,
    passed: plain.passed,
    passingScore: plain.passingScore,
  };
}

function contentProgressForMobileDetails(contentProgress) {
  if (!contentProgress) return null;
  const plain =
    typeof contentProgress.toObject === 'function'
      ? contentProgress.toObject({ virtuals: false })
      : { ...contentProgress };
  if (Array.isArray(plain.quizAttempts)) {
    plain.quizAttempts = plain.quizAttempts.map(slimQuizAttemptForContentDetails);
  }
  return plain;
}

/**
 * When answer review is disabled: no questions, banks, or stems — only labels/settings for the UI.
 */
function contentItemStubForResultsWithoutAnswerReview(contentItem) {
  if (!contentItem) return null;
  const raw =
    typeof contentItem.toObject === 'function'
      ? contentItem.toObject({ virtuals: false })
      : { ...contentItem };
  const n = Array.isArray(raw.selectedQuestions)
    ? raw.selectedQuestions.length
    : 0;
  return {
    _id: raw._id,
    type: raw.type,
    title: raw.title,
    description: (raw.description || '').slice(0, 500),
    order: raw.order,
    duration: raw.duration,
    isRequired: raw.isRequired,
    completionCriteria: raw.completionCriteria,
    questionCount: n,
    quizSettings:
      raw.type === 'quiz'
        ? slimActivitySettings(raw.quizSettings, 'quiz')
        : undefined,
    homeworkSettings:
      raw.type === 'homework'
        ? slimActivitySettings(raw.homeworkSettings, 'homework')
        : undefined,
  };
}

/** Standalone quiz — metadata only when answer review is disabled. */
function quizStubForResultsWithoutAnswerReview(quiz) {
  if (!quiz) return null;
  const raw =
    typeof quiz.toObject === 'function'
      ? quiz.toObject({ virtuals: false })
      : { ...quiz };
  const rows = raw.selectedQuestions || [];
  return {
    _id: raw._id,
    title: raw.title,
    description: (raw.description || '').slice(0, 500),
    code: raw.code,
    thumbnail: raw.thumbnail,
    duration: raw.duration,
    testType: raw.testType,
    difficulty: raw.difficulty,
    passingScore: raw.passingScore,
    maxAttempts: raw.maxAttempts,
    instructions: raw.instructions || '',
    tags: raw.tags || [],
    shuffleQuestions: !!raw.shuffleQuestions,
    shuffleOptions: !!raw.shuffleOptions,
    showCorrectAnswers: raw.showCorrectAnswers !== false,
    showResults: raw.showResults !== false,
    status: raw.status,
    questionCount: rows.length,
    totalPoints: rows.reduce((t, r) => t + (r.points || 1), 0),
    createdBy:
      raw.createdBy && typeof raw.createdBy === 'object' && raw.createdBy._id
        ? {
            _id: raw.createdBy._id,
            name: raw.createdBy.name,
          }
        : raw.createdBy,
  };
}

/** Remove per-question answer rows (and shuffle maps) from stored attempts. */
function redactQuizAttemptsForClosedReview(attempts) {
  return (attempts || []).map((a) => {
    const p = quizAttemptToPlain(a);
    if (!p || typeof p !== 'object') return p;
    const {
      answers: _a,
      shuffledOptionOrders: _so,
      shuffledQuestionOrder: _sq,
      ...rest
    } = p;
    return { ...rest };
  });
}

async function populateTopicContentItemWithQuestions(topicId, contentId) {
  const populated = await Topic.findById(topicId)
    .populate({
      path: 'content',
      match: { _id: contentId },
      populate: { path: 'selectedQuestions.question', model: 'Question' },
    })
    .lean();
  const rows = populated?.content || [];
  return (
    rows.find((c) => c._id && c._id.toString() === contentId.toString()) ||
    null
  );
}

function computeContentQuizResultsMeta(contentItem, contentProgress) {
  const attempts = contentProgress?.quizAttempts || [];
  const latestAttempt =
    attempts.length > 0 ? attempts[attempts.length - 1] : null;
  let canShowAnswers =
    contentItem.type === 'quiz'
      ? contentItem.quizSettings?.showCorrectAnswers !== false
      : contentItem.homeworkSettings?.showCorrectAnswers !== false;
  const lastPassed = !!latestAttempt?.passed;
  const hasFinishedAttempt = attempts.some((a) =>
    ['completed', 'timeout', 'abandoned'].includes(a.status),
  );
  if (!hasFinishedAttempt) {
    canShowAnswers = false;
  }
  const settings =
    contentItem.type === 'quiz'
      ? contentItem.quizSettings
      : contentItem.homeworkSettings;
  const showResults = settings?.showResults !== false;
  const maxAttempts =
    contentItem.type === 'quiz'
      ? contentItem.quizSettings?.maxAttempts || 3
      : contentItem.homeworkSettings?.maxAttempts || 1;
  const canRetake =
    !lastPassed && (contentProgress.attempts || 0) < maxAttempts;
  const answerReviewNotice = !canShowAnswers
    ? { title: ANSWER_REVIEW_DISABLED_TITLE, body: ANSWER_REVIEW_DISABLED_BODY }
    : null;
  return {
    latestAttempt,
    attemptHistory: attempts,
    canShowAnswers,
    lastPassed,
    showResults,
    canRetake,
    answerReviewNotice,
  };
}

/**
 * Build slim quiz/homework item + take session (formerly GET /content/:id/quiz).
 * @returns {{ error: { status: number, body: object } } | { slimContentItem: object, contentProgress: object, quizTake: object, resultsMeta?: object }}
 */
async function buildQuizHomeworkTakePayload(student, contentId, courseIdStr, topicDoc, contentItem) {
  const sid = student._id;

  const topicSummaries = await Topic.find({
    course: courseIdStr,
    isPublished: true,
  })
    .select('_id order title unlockConditions')
    .sort({ order: 1 })
    .lean();

  const currentTopicIndex = topicSummaries.findIndex(
    (t) => t._id.toString() === topicDoc._id.toString(),
  );

  if (!topicDoc.isPublished) {
    return { error: { status: 403, body: { success: false, message: 'Topic not available' } } };
  }

  if (
    topicDoc.unlockConditions === 'previous_completed' &&
    currentTopicIndex > 0
  ) {
    const prevMeta = topicSummaries[currentTopicIndex - 1];
    if (prevMeta) {
      const prevTopic = await Topic.findById(prevMeta._id).select('content._id').lean();
      const completedIds = student.getCompletedContentIds(courseIdStr);
      const prevTopicContentIds = (prevTopic?.content || []).map((c) =>
        c._id.toString(),
      );
      const allPrevCompleted =
        prevTopicContentIds.length === 0 ||
        prevTopicContentIds.every((id) => completedIds.includes(id));

      if (!allPrevCompleted) {
        return {
          error: {
            status: 403,
            body: {
              success: false,
              message: `Topic locked. Complete "${prevMeta.title}" first.`,
            },
          },
        };
      }
    }
  }

  const unlockContent = student.isContentUnlocked(courseIdStr, contentId, contentItem);
  if (!unlockContent.unlocked) {
    return {
      error: {
        status: 403,
        body: { success: false, message: unlockContent.reason || 'Content locked' },
      },
    };
  }

  const maxAttempts =
    contentItem.type === 'quiz'
      ? contentItem.quizSettings?.maxAttempts || 3
      : contentItem.homeworkSettings?.maxAttempts || 1;

  let contentProgress = student.getContentProgressDetails(courseIdStr, contentId);

  const selectedQuestions = (contentItem.selectedQuestions || []).map((sq) => ({
    _id: sq._id,
    order: sq.order,
    points: sq.points,
    questionId: sq.question != null ? sq.question.toString() : null,
  }));

  const slimContentItem = {
    _id: contentItem._id,
    type: contentItem.type,
    title: contentItem.title,
    description: (contentItem.description || '').slice(0, 500),
    order: contentItem.order,
    duration: contentItem.duration,
    isRequired: contentItem.isRequired,
    completionCriteria: contentItem.completionCriteria,
    prerequisites: (contentItem.prerequisites || []).map((p) => p.toString()),
    questionCount: selectedQuestions.length,
    selectedQuestions,
    quizSettings:
      contentItem.type === 'quiz'
        ? slimActivitySettings(contentItem.quizSettings, 'quiz')
        : undefined,
    homeworkSettings:
      contentItem.type === 'homework'
        ? slimActivitySettings(contentItem.homeworkSettings, 'homework')
        : undefined,
  };

  function buildResultsPayload(quizTakePartial) {
    const resultsMeta = computeContentQuizResultsMeta(
      contentItem,
      contentProgress,
    );
    return {
      slimContentItem,
      contentProgress,
      quizTake: quizTakePartial,
      resultsMeta,
    };
  }

  if (contentProgress && contentProgress.completionStatus === 'completed') {
    return buildResultsPayload({
      state: 'completed',
      redirectToResults: false,
      message: 'Already completed',
    });
  }

  const canAttempt = student.canAttemptQuiz(courseIdStr, contentId, maxAttempts);
  if (!canAttempt.canAttempt) {
    const attempts = contentProgress?.quizAttempts || [];
    if (attempts.length > 0) {
      return buildResultsPayload({
        state: 'results_only',
        reason: canAttempt.reason,
        message: canAttempt.reason,
      });
    }
    return {
      error: { status: 403, body: { success: false, message: canAttempt.reason } },
    };
  }

  const durationMinutes =
    contentItem.type === 'quiz'
      ? contentItem.quizSettings?.duration || 0
      : contentItem.homeworkSettings?.duration || contentItem.duration || 0;

  if (!contentProgress) {
    const expectedEnd =
      durationMinutes > 0
        ? new Date(Date.now() + durationMinutes * 60 * 1000)
        : null;
    await student.updateContentProgress(
      courseIdStr,
      topicDoc._id.toString(),
      contentId,
      contentItem.type,
      {
        completionStatus: 'in_progress',
        progressPercentage: 0,
        lastAccessed: new Date(),
        expectedEnd,
      },
    );
    const refreshed = await User.findById(sid);
    contentProgress = refreshed.getContentProgressDetails(courseIdStr, contentId);
  } else if (!contentProgress.expectedEnd && durationMinutes > 0) {
    const expectedEnd = new Date(Date.now() + durationMinutes * 60 * 1000);
    await student.updateContentProgress(
      courseIdStr,
      topicDoc._id.toString(),
      contentId,
      contentItem.type,
      {
        completionStatus:
          contentProgress.completionStatus === 'not_started'
            ? 'in_progress'
            : contentProgress.completionStatus,
        expectedEnd,
        lastAccessed: new Date(),
      },
    );
    const refreshed = await User.findById(sid);
    contentProgress = refreshed.getContentProgressDetails(courseIdStr, contentId);
  }

  let remainingSeconds = 0;
  let isExpired = false;
  if (contentProgress?.expectedEnd && durationMinutes > 0) {
    remainingSeconds = Math.max(
      0,
      Math.floor(
        (new Date(contentProgress.expectedEnd).getTime() - Date.now()) / 1000,
      ),
    );
    isExpired = remainingSeconds === 0;
  }

  const attemptNumber = contentProgress ? (contentProgress.attempts || 0) + 1 : 1;

  const quizTake = {
    state: 'active',
    attemptNumber,
    timing: {
      durationMinutes,
      remainingSeconds,
      isExpired,
    },
    desmosApiKey: process.env.DESMOS_API_KEY || '',
  };

  return { slimContentItem, contentProgress, quizTake };
}

/** Mirrors Course.js sequencing helpers (not exported from model) — keep logic aligned with isCourseUnlocked */
function weekNumberFromCourseTitle(title) {
  if (!title || typeof title !== 'string') return null;
  const m = title.match(/^\s*Week\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function sortBundleCoursesForSequenceMobile(courses) {
  return [...courses].sort((a, b) => {
    const wa = weekNumberFromCourseTitle(a.title);
    const wb = weekNumberFromCourseTitle(b.title);
    if (wa != null && wb != null && wa !== wb) return wa - wb;
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    return String(a._id).localeCompare(String(b._id));
  });
}

function allBundleCoursesShareSameOrderMobile(courses) {
  if (!courses || courses.length <= 1) return false;
  const first = courses[0].order ?? 0;
  return courses.every((c) => (c.order ?? 0) === first);
}

/**
 * Course id on an enrollment (ObjectId ref or populated subdoc).
 * Course.isCourseUnlocked uses User without populate — refs are ObjectIds and .toString() works.
 * getEnrolledCourses populates course; comparing enrollment.course.toString() to bundle ids often fails,
 * which breaks minEnrolledIdx / bundleStartingOrder and wrongly requires "Complete Week 1 first".
 */
function enrollCourseIdStr(enrollment) {
  const c = enrollment?.course;
  if (!c) return '';
  return (c._id != null ? c._id : c).toString();
}

/** Populated enrollments: User#getCourseProgress uses course.toString() and can miss the row */
function enrollmentProgressForCourse(student, courseId) {
  const cid = courseId.toString();
  const e = student.enrolledCourses.find(
    (x) => x.course && enrollCourseIdStr(x) === cid,
  );
  return e ? e.progress || 0 : 0;
}

function isCourseCompletedSync(student, courseId) {
  const cid = courseId.toString();
  const enrollment = student.enrolledCourses.find(
    (e) => e.course && enrollCourseIdStr(e) === cid,
  );
  if (!enrollment) return false;
  return enrollment.status === 'completed' || (enrollment.progress || 0) >= 100;
}

/**
 * Same outcome as Course.isCourseUnlocked(studentId, courseId) without refetching User
 * (avoids N User.findById calls on list endpoints).
 */
function unlockStatusForCourseSequential(student, course, bundleCourses) {
  const courseId = course._id;
  const uniformOrder = allBundleCoursesShareSameOrderMobile(bundleCourses);
  const currentIndex = bundleCourses.findIndex(
    (c) => c._id.toString() === courseId.toString(),
  );
  if (currentIndex === 0) {
    return { unlocked: true, reason: 'First course in bundle' };
  }
  let minEnrolledIdx = Infinity;
  for (let i = 0; i < bundleCourses.length; i++) {
    const cid = bundleCourses[i]._id.toString();
    const has = student.enrolledCourses.some(
      (e) => e.course && enrollCourseIdStr(e) === cid,
    );
    if (has) minEnrolledIdx = Math.min(minEnrolledIdx, i);
  }
  if (minEnrolledIdx !== Infinity && currentIndex < minEnrolledIdx) {
    const courseProgress = enrollmentProgressForCourse(student, courseId);
    if (courseProgress > 0) {
      return {
        unlocked: true,
        reason: `Course already started with ${courseProgress}% progress - access allowed`,
      };
    }
    return {
      unlocked: false,
      reason: `This week is before your enrollment range. Your access starts at "${bundleCourses[minEnrolledIdx].title}".`,
    };
  }
  let bundleStartingOrder = null;
  for (const bundleCourse of bundleCourses) {
    const bId = bundleCourse._id.toString();
    const enrollment = student.enrolledCourses.find(
      (e) => e.course && enrollCourseIdStr(e) === bId,
    );
    if (
      enrollment &&
      enrollment.startingOrder !== null &&
      enrollment.startingOrder !== undefined
    ) {
      if (
        bundleStartingOrder === null ||
        enrollment.startingOrder < bundleStartingOrder
      ) {
        bundleStartingOrder = enrollment.startingOrder;
      }
    }
  }
  let chainStart = 0;
  if (bundleStartingOrder !== null && !uniformOrder) {
    // Match Course.isCourseUnlocked: use course.order as-is (undefined < n is false; do not coerce to 0)
    if (course.order < bundleStartingOrder) {
      const courseProgress = enrollmentProgressForCourse(student, courseId);
      if (courseProgress > 0) {
        return {
          unlocked: true,
          reason: `Course already started with ${courseProgress}% progress - access allowed`,
        };
      }
      return {
        unlocked: false,
        reason: `You were enrolled from week ${bundleStartingOrder + 1}. This course is from an earlier week.`,
      };
    }
    for (let idx = 0; idx < bundleCourses.length; idx++) {
      if ((bundleCourses[idx].order ?? 0) >= bundleStartingOrder) {
        chainStart = idx;
        break;
      }
    }
  }
  if (minEnrolledIdx !== Infinity) {
    if (uniformOrder) {
      chainStart = minEnrolledIdx;
    } else {
      chainStart = Math.max(chainStart, minEnrolledIdx);
    }
  }
  for (let i = chainStart; i < currentIndex; i++) {
    const previousCourse = bundleCourses[i];
    if (!isCourseCompletedSync(student, previousCourse._id)) {
      return {
        unlocked: false,
        reason: `Complete "${previousCourse.title}" first`,
        previousCourse: {
          id: previousCourse._id,
          title: previousCourse.title,
          order: previousCourse.order,
        },
      };
    }
  }
  const successReason =
    bundleStartingOrder !== null && !uniformOrder
      ? `Enrolled from week ${bundleStartingOrder + 1} and prerequisites completed`
      : 'All prerequisites completed';
  return { unlocked: true, reason: successReason };
}

/**
 * Single-course unlock: delegate to model static so mobile matches web (studentController)
 * exactly. Batched list path still uses unlockStatusForCourseSequential + batch queries.
 */
async function resolveCourseUnlockForStudent(student, course) {
  if (!course || !course._id) {
    return { unlocked: false, reason: 'Course not found', previousCourse: null };
  }
  const st = await Course.isCourseUnlocked(student._id, course._id);
  return {
    unlocked: st.unlocked,
    reason: st.reason,
    previousCourse: st.previousCourse || null,
  };
}

/** One Course.find per distinct bundle; uses already-loaded student */
async function batchUnlockStatusesForMobile(student, enrollments) {
  const byCourseId = new Map();
  const bundleIds = new Set();

  for (const enrollment of enrollments) {
    const c = enrollment.course;
    if (!c || !c._id) continue;
    const cid = c._id.toString();
    if (c.requiresSequential === false) {
      byCourseId.set(cid, {
        unlocked: true,
        reason: 'No sequential requirement',
        previousCourse: null,
      });
      continue;
    }
    const b = c.bundle && (c.bundle._id || c.bundle);
    if (!b) {
      byCourseId.set(cid, {
        unlocked: true,
        reason: 'No sequential requirement',
        previousCourse: null,
      });
      continue;
    }
    bundleIds.add(b.toString());
  }

  const bundleCache = new Map();
  await Promise.all(
    [...bundleIds].map(async (bid) => {
      const raw = await Course.find({ bundle: bid })
        .sort({ order: 1, _id: 1 })
        .select('title order _id bundle requiresSequential')
        .lean();
      bundleCache.set(bid, sortBundleCoursesForSequenceMobile(raw));
    }),
  );

  for (const enrollment of enrollments) {
    const c = enrollment.course;
    if (!c || !c._id) continue;
    const cid = c._id.toString();
    if (byCourseId.has(cid)) continue;

    const b = c.bundle && (c.bundle._id || c.bundle);
    const bundleCourses = bundleCache.get(b.toString());
    if (!bundleCourses || !bundleCourses.length) {
      byCourseId.set(cid, {
        unlocked: false,
        reason: 'Course not found',
        previousCourse: null,
      });
      continue;
    }
    const st = unlockStatusForCourseSequential(student, c, bundleCourses);
    byCourseId.set(cid, {
      unlocked: st.unlocked,
      reason: st.reason,
      previousCourse: st.previousCourse || null,
    });
  }

  return byCourseId;
}

const getDashboard = async (req, res) => {
  try {
    const uid = studentId(req);
    const student = await User.findById(uid).populate({
      path: 'enrolledCourses.course',
      select: SLIM_COURSE_SELECT,
      populate: {
        path: 'bundle',
        select: 'title bundleCode thumbnail',
        model: 'BundleCourse',
      },
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const recentProgress = await Progress.find({ student: uid })
      .populate('course', 'title thumbnail')
      .populate('topic', 'title')
      .sort({ timestamp: -1 })
      .limit(10);

    const stats = {
      totalCourses: student.enrolledCourses.length,
      completedCourses: student.completedCourses,
      totalQuizAttempts: student.totalQuizAttempts,
      averageScore: student.averageQuizScore,
      totalPoints: student.quizAttempts.reduce(
        (total, quiz) =>
          total +
          quiz.attempts.reduce(
            (quizTotal, attempt) => quizTotal + (attempt.score || 0),
            0,
          ),
        0,
      ),
      wishlistCount: student.wishlist?.length || 0,
    };

    const activeCourses = student.enrolledCourses
      .filter((enrollment) => enrollment.status === 'active' && enrollment.course)
      .sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed))
      .slice(0, 6)
      .map(toDashboardActiveCourse)
      .filter(Boolean);

    // Quiz._id is not course id; a proper "quizzes for my courses" query needs another schema link.
    const upcomingQuizzes = [];

    return res.json({
      success: true,
      data: {
        student: buildProfilePayload(student),
        stats,
        recentProgress,
        activeCourses,
        upcomingQuizzes,
      },
    });
  } catch (error) {
    console.error('Mobile dashboard error:', error);
    return res.status(500).json({ success: false, message: 'Error loading dashboard' });
  }
};

const getEnrolledCourses = async (req, res) => {
  try {
    const uid = studentId(req);
    const searchQuery = req.query.search || '';
    const progressFilter = req.query.progress || 'all';
    const bundleFilter = req.query.bundle || 'all';
    const sortBy = req.query.sort || 'lastAccessed';

    const student = await User.findById(uid).populate({
      path: 'enrolledCourses.course',
      select: SLIM_COURSE_SELECT,
      populate: {
        path: 'bundle',
        select: 'title bundleCode thumbnail',
        model: 'BundleCourse',
      },
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const validEnrollments = student.enrolledCourses.filter((e) => e.course);

    // Do not recalculate progress here: calculateCourseProgress loads each course with
    // all topics and student.save() rewrites the whole user — too slow for a list API.
    // Progress is updated when the student completes content via other mobile routes.

    let filtered = validEnrollments;

    if (searchQuery) {
      filtered = filtered.filter((enrollment) =>
        enrollment.course.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (bundleFilter !== 'all') {
      filtered = filtered.filter(
        (enrollment) =>
          enrollment.course.bundle &&
          enrollment.course.bundle._id.toString() === bundleFilter,
      );
    }
    if (progressFilter !== 'all') {
      filtered = filtered.filter((enrollment) => {
        const progress = enrollment.progress || 0;
        switch (progressFilter) {
          case 'not-started':
            return progress === 0;
          case 'in-progress':
            return progress > 0 && progress < 100;
          case 'completed':
            return progress === 100;
          case 'high-progress':
            return progress >= 75;
          case 'low-progress':
            return progress < 25;
          default:
            return true;
        }
      });
    }

    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => a.course.title.localeCompare(b.course.title));
        break;
      case 'progress':
        filtered.sort((a, b) => (b.progress || 0) - (a.progress || 0));
        break;
      case 'enrolledAt':
        filtered.sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt));
        break;
      default:
        filtered.sort(
          (a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed),
        );
    }

    const unlockByCourseId = await batchUnlockStatusesForMobile(student, filtered);

    const coursesWithUnlockStatus = filtered.map((enrollment) => {
      const unlockStatus = unlockByCourseId.get(enrollment.course._id.toString()) || {
        unlocked: false,
        reason: 'Unknown',
        previousCourse: null,
      };
      const completedTopics = enrollment.completedTopics || [];
      return {
        _id: enrollment._id,
        course: buildSlimCourseCard(enrollment.course),
        enrolledAt: enrollment.enrolledAt,
        progress: enrollment.progress,
        lastAccessed: enrollment.lastAccessed,
        status: enrollment.status,
        startingOrder: enrollment.startingOrder,
        completedTopics: completedTopics.map((id) =>
          id != null && id.toString ? id.toString() : id,
        ),
        isUnlocked: unlockStatus.unlocked,
        unlockReason: unlockStatus.reason,
        previousCourse: unlockStatus.previousCourse || null,
      };
    });

    const bundleIds = validEnrollments
      .map((e) => e.course.bundle?._id)
      .filter(Boolean)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const availableBundles = await BundleCourse.find({
      _id: { $in: bundleIds },
    }).select('_id title');

    return res.json({
      success: true,
      data: {
        courses: coursesWithUnlockStatus,
        availableBundles,
        filters: { search: searchQuery, progress: progressFilter, bundle: bundleFilter, sort: sortBy },
      },
    });
  } catch (error) {
    console.error('Mobile enrolled courses error:', error);
    return res.status(500).json({ success: false, message: 'Error loading courses' });
  }
};

/**
 * GET /courses/:courseId/content
 * Course overview + topic/content outline (slim). Full content → GET /content/:contentId
 */
const getCourseContent = async (req, res) => {
  try {
    const uid = studentId(req);
    const courseId = req.params.courseId;

    const [student, course] = await Promise.all([
      User.findById(uid),
      Course.findById(courseId)
        .populate({
          path: 'topics',
          options: { sort: { order: 1 } },
          populate: {
            path: 'content.zoomMeeting',
            model: 'ZoomMeeting',
          },
        })
        .populate('bundle', 'title thumbnail bundleCode')
        .populate('createdBy', 'name')
        .lean(),
    ]);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const enrollment = student.enrolledCourses.find(
      (e) => e.course.toString() === courseId,
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course',
      });
    }

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const unlockStatus = await resolveCourseUnlockForStudent(student, course);
    if (!unlockStatus.unlocked) {
      return res.status(403).json({
        success: false,
        message: unlockStatus.reason || 'This course is locked.',
        unlockReason: unlockStatus.reason,
      });
    }

    const titleById = buildContentTitleLookup(course.topics);

    const recentActivity = await Progress.find({
      student: uid,
      course: courseId,
    })
      .sort({ timestamp: -1 })
      .limit(20)
      .populate('topic', 'title')
      .lean();

    const recentActivitySlim = recentActivity.map((p) => ({
      timestamp: p.timestamp,
      activity: p.activity,
      contentType: p.contentType,
      topicId: p.topic?._id || p.topic,
      topicTitle: p.topic && p.topic.title ? p.topic.title : null,
      contentId: p.content,
    }));

    const enrollmentSummary = {
      progress: enrollment.progress,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      lastAccessed: enrollment.lastAccessed,
      startingOrder: enrollment.startingOrder,
      completedTopics: (enrollment.completedTopics || []).map((id) =>
        id.toString(),
      ),
    };

    const completedContentIds = student.getCompletedContentIds(courseId);
    const publishedTopics = course.topics
      .filter((topic) => topic.isPublished === true)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const topicsWithProgress = publishedTopics.map((topic, topicIndex) => {
      const topicCompleted = enrollmentHasCompletedTopic(enrollment, topic._id);
      const topicProgress = averageTopicProgressFromEnrollment(topic, enrollment);

      let topicUnlocked = true;
      let topicUnlockReason = null;

      if (topic.unlockConditions === 'previous_completed' && topicIndex > 0) {
        const previousTopic = publishedTopics[topicIndex - 1];
        if (previousTopic) {
          const previousTopicContentIds = (previousTopic.content || []).map((c) =>
            c._id.toString(),
          );
          const allPreviousTopicCompleted =
            previousTopicContentIds.length === 0 ||
            previousTopicContentIds.every((contentId) =>
              completedContentIds.includes(contentId),
            );

          if (!allPreviousTopicCompleted) {
            topicUnlocked = false;
            topicUnlockReason = `Complete all content in "${previousTopic.title}" first`;
          }
        }
      }

      const contentWithStatus = (topic.content || []).map((contentItem, index) => {
        const isCompleted = completedContentIds.includes(contentItem._id.toString());

        if (!topicUnlocked && !isCompleted) {
          return slimOutlineContentItem(contentItem, titleById, {
            isUnlocked: false,
            isCompleted,
            actualProgress: 0,
            watchCount: 0,
            unlockReason: topicUnlockReason,
            canAccess: false,
            contentIndex: index,
            topicId: topic._id,
          });
        }

        const unlock = student.isContentUnlocked(courseId, contentItem._id, contentItem);
        const contentProgressDetails = student.getContentProgressDetails(
          courseId,
          contentItem._id,
        );
        const actualProgress = contentProgressDetails
          ? contentProgressDetails.progressPercentage
          : 0;
        const watchCount = contentProgressDetails?.watchCount || 0;

        return slimOutlineContentItem(contentItem, titleById, {
          isUnlocked: unlock.unlocked,
          isCompleted,
          actualProgress,
          watchCount,
          unlockReason: unlock.reason,
          canAccess: unlock.unlocked || isCompleted,
          contentIndex: index,
          topicId: topic._id,
        });
      });

      return {
        _id: topic._id,
        title: topic.title,
        description: (topic.description || '').slice(0, 300),
        order: topic.order,
        isPublished: topic.isPublished,
        estimatedTime: topic.estimatedTime,
        difficulty: topic.difficulty,
        unlockConditions: topic.unlockConditions,
        contentCount: (topic.content || []).length,
        completed: topicCompleted,
        progress: topicProgress,
        isUnlocked: topicUnlocked,
        unlockReason: topicUnlockReason,
        content: contentWithStatus,
      };
    });

    return res.json({
      success: true,
      data: {
        course: buildCourseOutlineSummary(course),
        enrollment: enrollmentSummary,
        topicsWithProgress,
        recentActivity: recentActivitySlim,
        lockedContentId: req.query.lockedContent || null,
      },
    });
  } catch (error) {
    console.error('Mobile course content error:', error);
    return res.status(500).json({ success: false, message: 'Error loading content' });
  }
};

const getContentDetails = async (req, res) => {
  try {
    const uid = studentId(req);
    const contentId = req.params.contentId;
    const contentObjectId = mongoose.Types.ObjectId.isValid(contentId)
      ? new mongoose.Types.ObjectId(contentId)
      : null;
    if (!contentObjectId) {
      return res.status(400).json({ success: false, message: 'Invalid content id' });
    }

    const [student, topicDoc] = await Promise.all([
      User.findById(uid),
      Topic.findOne({ 'content._id': contentObjectId })
        .select(
          'course title order _id unlockConditions isPublished estimatedTime difficulty description content',
        )
        .lean(),
    ]);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (!topicDoc || !topicDoc.course) {
      return res.status(404).json({
        success: false,
        message: 'Content not found or you are not enrolled in this course',
      });
    }

    const courseIdStr = topicDoc.course.toString();
    const enrolled = student.enrolledCourses.some(
      (e) => e.course && e.course.toString() === courseIdStr,
    );
    if (!enrolled) {
      return res.status(404).json({
        success: false,
        message: 'Content not found or you are not enrolled in this course',
      });
    }

    const contentItemRaw = (topicDoc.content || []).find(
      (c) => c._id.toString() === contentId,
    );
    if (!contentItemRaw) {
      return res.status(404).json({
        success: false,
        message: 'Content not found or you are not enrolled in this course',
      });
    }

    const courseMini = await Course.findById(courseIdStr)
      .select('title requiresSequential bundle order _id')
      .lean();

    if (!courseMini) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const courseUnlockStatus = await resolveCourseUnlockForStudent(student, courseMini);
    if (!courseUnlockStatus.unlocked) {
      return res.status(403).json({
        success: false,
        message: courseUnlockStatus.reason || 'Course is locked',
      });
    }

    let contentItem = { ...contentItemRaw };
    if (contentItem.type === 'zoom' && contentItem.zoomMeeting) {
      const ref = contentItem.zoomMeeting;
      const zmId =
        ref && typeof ref === 'object' && ref._id != null ? ref._id : ref;
      const meeting = await ZoomMeeting.findById(zmId).lean();
      contentItem = { ...contentItem, zoomMeeting: meeting || ref };
    }
    if (contentItem.type === 'zoom' && contentItem.zoomMeeting) {
      const zm = contentItem.zoomMeeting;
      if (zm && typeof zm === 'object') {
        contentItem = {
          ...contentItem,
          zoomMeeting: normalizeZoomMeetingForMobile(zm),
        };
      }
    }

    const unlockStatus = student.isContentUnlocked(
      courseMini._id,
      contentItem._id,
      contentItem,
    );
    let contentProgress = student.getContentProgressDetails(
      courseMini._id,
      contentItem._id,
    );

    const topicShape = {
      _id: topicDoc._id,
      title: topicDoc.title,
      order: topicDoc.order,
    };

    if (QUIZ_HOMEWORK_TYPES.has(contentItem.type) && unlockStatus.unlocked) {
      const qh = await buildQuizHomeworkTakePayload(
        student,
        contentId,
        courseIdStr,
        topicDoc,
        contentItem,
      );
      if (qh.error) {
        return res.status(qh.error.status).json(qh.error.body);
      }
      const data = {
        contentItem: contentItemSummaryForDetailsPage(qh.slimContentItem),
        course: { _id: courseMini._id, title: courseMini.title },
        topic: topicShape,
        unlockStatus,
        contentProgress: contentProgressForMobileDetails(qh.contentProgress),
        quizTake: qh.quizTake,
        attemptSummary: attemptSummaryForMobile(
          contentItem.type,
          contentItem,
          qh.contentProgress,
        ),
      };
      if (qh.resultsMeta) {
        data.canShowAnswers = qh.resultsMeta.canShowAnswers;
        data.answerReviewAllowed = qh.resultsMeta.canShowAnswers;
        data.answerReviewStatus = qh.resultsMeta.canShowAnswers
          ? 'allowed'
          : 'not_allowed';
        data.lastPassed = qh.resultsMeta.lastPassed;
        data.showResults = qh.resultsMeta.showResults;
        data.canRetake = qh.resultsMeta.canRetake;
        data.answerReviewNotice = qh.resultsMeta.answerReviewNotice;
      }
      return res.json({
        success: true,
        data,
      });
    }

    return res.json({
      success: true,
      data: {
        contentItem,
        course: { _id: courseMini._id, title: courseMini.title },
        topic: topicShape,
        unlockStatus,
        contentProgress,
      },
    });
  } catch (error) {
    console.error('Mobile content details error:', error);
    return res.status(500).json({ success: false, message: 'Error loading content' });
  }
};

/** List/browse payload only — full question ids from GET /quizzes/:quizId/details */
const slimStandaloneQuizListItem = (quiz) => {
  if (!quiz) return null;
  const copy = { ...quiz };
  const selected = copy.selectedQuestions || [];
  delete copy.selectedQuestions;
  copy.questionCount = selected.length;
  return copy;
};

/** Quiz detail screen — no question stems/options (use POST /quiz/secure-questions to take) */
const buildSlimStandaloneQuizDetails = (quiz) => {
  if (!quiz) return null;
  const rows = quiz.selectedQuestions || [];
  const selectedQuestions = rows.map((row) => ({
    _id: row._id,
    order: row.order,
    points: row.points ?? 1,
    questionId:
      row.question && row.question._id
        ? row.question._id.toString()
        : String(row.question),
  }));

  const qb = quiz.questionBank;
  const questionBank =
    qb && typeof qb === 'object' && qb._id
      ? {
          _id: qb._id,
          name: qb.name,
          description: qb.description,
          totalQuestions: qb.totalQuestions,
        }
      : qb;

  const mod = quiz.module;
  const module =
    mod && typeof mod === 'object' && mod._id
      ? {
          _id: mod._id,
          name: mod.name,
          code: mod.code,
          icon: mod.icon,
          color: mod.color,
          order: mod.order,
        }
      : mod;

  const cb = quiz.createdBy;
  const createdBy =
    cb && typeof cb === 'object' && cb._id
      ? { _id: cb._id, name: cb.name, email: cb.email }
      : cb;

  return {
    _id: quiz._id,
    title: quiz.title,
    description: quiz.description,
    code: quiz.code,
    thumbnail: quiz.thumbnail,
    questionBank,
    selectedQuestions,
    duration: quiz.duration,
    testType: quiz.testType,
    difficulty: quiz.difficulty,
    passingScore: quiz.passingScore,
    maxAttempts: quiz.maxAttempts,
    instructions: quiz.instructions,
    tags: quiz.tags || [],
    shuffleQuestions: !!quiz.shuffleQuestions,
    shuffleOptions: !!quiz.shuffleOptions,
    showCorrectAnswers: quiz.showCorrectAnswers !== false,
    showResults: quiz.showResults !== false,
    status: quiz.status,
    module,
    moduleOrder: quiz.moduleOrder,
    createdBy,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    totalQuestions: rows.length,
    totalPoints: rows.reduce((t, r) => t + (r.points || 1), 0),
  };
};

const getQuizzesList = async (req, res) => {
  try {
    const uid = studentId(req);
    const student = await User.findById(uid);

    const allModules = await QuizModule.find({
      status: 'active',
      isDeleted: false,
    })
      .sort({ order: 1, name: 1 })
      .lean();

    const allQuizzesRaw = await Quiz.find({ status: 'active' })
      .populate('questionBank', 'name description totalQuestions')
      .populate('createdBy', 'name email')
      .populate('module', 'name code icon color order')
      .lean({ virtuals: true });

    const moduleOrderKey = (quiz) => {
      const m = quiz.module;
      if (m && typeof m === 'object' && m.order != null) return m.order;
      return 100000;
    };

    allQuizzesRaw.sort((a, b) => {
      const d = moduleOrderKey(a) - moduleOrderKey(b);
      if (d !== 0) return d;
      const moA = a.moduleOrder ?? 0;
      const moB = b.moduleOrder ?? 0;
      if (moA !== moB) return moA - moB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const allQuizzes = allQuizzesRaw.map(slimStandaloneQuizListItem);

    const groupedQuizzes = { EST: [], SAT: [], ACT: [] };
    allQuizzes.forEach((quiz) => {
      if (quiz.testType && groupedQuizzes[quiz.testType]) {
        groupedQuizzes[quiz.testType].push(quiz);
      }
    });

    const quizzesByModules = { EST: [], SAT: [], ACT: [] };

    ['EST', 'SAT', 'ACT'].forEach((testType) => {
      const testTypeModules = allModules
        .filter((m) => m.testType === testType)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)));
      const testTypeQuizzes = groupedQuizzes[testType];

      const moduleGroups = testTypeModules
        .map((mod) => ({
          module: mod,
          quizzes: testTypeQuizzes
            .filter(
              (q) => q.module && q.module._id.toString() === mod._id.toString(),
            )
            .sort((a, b) => (a.moduleOrder || 0) - (b.moduleOrder || 0)),
        }))
        .filter((g) => g.quizzes.length > 0);

      const unassignedQuizzes = testTypeQuizzes
        .filter((q) => !q.module)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      if (unassignedQuizzes.length > 0) {
        moduleGroups.push({
          module: {
            _id: 'unassigned',
            name: 'Other Quizzes',
            code: 'OTHER',
            icon: 'fa-question-circle',
            color: '#6b7280',
            order: 9999,
          },
          quizzes: unassignedQuizzes,
        });
      }

      quizzesByModules[testType] = moduleGroups;
    });

    return res.json({
      success: true,
      data: {
        quizzes: allQuizzes,
        groupedQuizzes,
        quizzesByModules,
        testTypeCounts: {
          EST: groupedQuizzes.EST.length,
          SAT: groupedQuizzes.SAT.length,
          ACT: groupedQuizzes.ACT.length,
        },
        studentQuizAttempts: student.quizAttempts || [],
      },
    });
  } catch (error) {
    console.error('getQuizzesList:', error);
    return res.status(500).json({ success: false, message: 'Error loading quizzes' });
  }
};

const getQuizDetailsJson = async (req, res) => {
  try {
    const uid = studentId(req);
    const { quizId } = req.params;

    const student = await User.findById(uid);
    const quiz = await Quiz.findById(quizId)
      .populate('questionBank', 'name description totalQuestions')
      .populate('createdBy', 'name email')
      .populate('module', 'name code icon color order');

    if (!quiz || quiz.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    const canAttempt = quiz.canUserAttempt(student.quizAttempts);
    const bestScore = quiz.getUserBestScore(student.quizAttempts);
    const attemptHistory = quiz.getUserAttemptHistory(student.quizAttempts);
    const activeAttempt = quiz.getActiveAttempt(student.quizAttempts);

    let timing = null;
    if (activeAttempt) {
      const now = new Date();
      const expectedEnd = new Date(activeAttempt.expectedEnd);
      const remainingSeconds = Math.max(0, Math.floor((expectedEnd - now) / 1000));
      timing = {
        durationMinutes: quiz.duration,
        remainingSeconds,
        isExpired: remainingSeconds <= 0,
        startedAt: activeAttempt.startedAt,
        expectedEnd: activeAttempt.expectedEnd,
      };
    }

    const slimQuiz = buildSlimStandaloneQuizDetails(quiz);

    return res.json({
      success: true,
      data: {
        quiz: slimQuiz,
        canAttempt,
        bestScore,
        attemptHistory,
        activeAttempt,
        timing,
        showResults: quiz.showResults !== false,
      },
    });
  } catch (error) {
    console.error('getQuizDetailsJson:', error);
    return res.status(500).json({ success: false, message: 'Error loading quiz' });
  }
};

const getStandaloneQuizResultsJson = async (req, res) => {
  try {
    const uid = studentId(req);
    const { quizId } = req.params;

    const student = await User.findById(uid);
    const quizMeta = await Quiz.findById(quizId).select('_id showResults');

    if (!quizMeta) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    if (quizMeta.showResults === false) {
      const hiddenAttempts = quizMeta.getUserAttemptHistory(
        student.quizAttempts,
      );
      const bestScoreHidden = quizMeta.getUserBestScore(student.quizAttempts);
      return res.json({
        success: true,
        data: {
          resultsHidden: true,
          message: 'Results are not available for this quiz',
          quiz: { _id: quizMeta._id },
          attemptCount: hiddenAttempts.length,
          bestScore: bestScoreHidden,
        },
      });
    }

    const attemptHistory = quizMeta.getUserAttemptHistory(student.quizAttempts);
    if (!attemptHistory || attemptHistory.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No quiz attempts found',
      });
    }

    const quiz = await Quiz.findById(quizId)
      .populate('selectedQuestions.question')
      .populate('createdBy', 'name');

    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    const bestScore = quiz.getUserBestScore(student.quizAttempts);
    const latestAttempt = attemptHistory[attemptHistory.length - 1];

    const hasFinishedAttempt = attemptHistory.some((a) =>
      ['completed', 'timeout', 'abandoned'].includes(a.status),
    );
    let canShowAnswers =
      quiz.showCorrectAnswers !== false && hasFinishedAttempt;
    const lastPassed = !!latestAttempt?.passed;

    const standaloneAnswerNotice = !canShowAnswers
      ? {
          title: ANSWER_REVIEW_DISABLED_TITLE,
          body: ANSWER_REVIEW_DISABLED_BODY,
        }
      : null;

    let quizOut = quiz;
    let attemptHistoryOut = attemptHistory;
    let latestAttemptOut = latestAttempt;
    if (!canShowAnswers) {
      quizOut = quizStubForResultsWithoutAnswerReview(quiz);
      attemptHistoryOut = redactQuizAttemptsForClosedReview(attemptHistory);
      latestAttemptOut =
        attemptHistoryOut.length > 0
          ? attemptHistoryOut[attemptHistoryOut.length - 1]
          : null;
    } else {
      attemptHistoryOut = (attemptHistory || []).map((a) => quizAttemptToPlain(a));
      latestAttemptOut =
        attemptHistoryOut.length > 0
          ? attemptHistoryOut[attemptHistoryOut.length - 1]
          : null;
    }

    return res.json({
      success: true,
      data: {
        quiz: quizOut,
        attemptHistory: attemptHistoryOut,
        bestScore,
        latestAttempt: latestAttemptOut,
        canShowAnswers,
        answerReviewAllowed: canShowAnswers,
        answerReviewStatus: canShowAnswers ? 'allowed' : 'not_allowed',
        lastPassed,
        answerReviewNotice: standaloneAnswerNotice,
        showResults: quiz.showResults !== false,
      },
    });
  } catch (error) {
    console.error('getStandaloneQuizResultsJson:', error);
    return res.status(500).json({ success: false, message: 'Error loading results' });
  }
};

const getTakeQuizJson = async (req, res) => {
  try {
    const uid = studentId(req);
    const { quizId } = req.params;

    let student = await User.findById(uid);
    const quiz = await Quiz.findById(quizId).populate('selectedQuestions.question');

    if (!quiz || quiz.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Quiz not found' });
    }

    const canAttempt = quiz.canUserAttempt(student.quizAttempts);
    if (!canAttempt.canAttempt) {
      return res.status(403).json({ success: false, message: canAttempt.reason });
    }

    let activeAttempt = quiz.getActiveAttempt(student.quizAttempts);

    if (!activeAttempt) {
      const attemptResult = await student.startQuizAttempt(quizId, quiz.duration);
      activeAttempt = attemptResult.newAttempt;
      student = await User.findById(uid);
    }

    if (!activeAttempt) {
      return res.status(400).json({ success: false, message: 'Failed to start attempt' });
    }

    const now = new Date();
    const expectedEnd = new Date(activeAttempt.expectedEnd);
    const remainingSeconds = Math.max(0, Math.floor((expectedEnd - now) / 1000));
    const isExpired = remainingSeconds <= 0;

    const timing = {
      durationMinutes: quiz.duration,
      remainingSeconds,
      isExpired,
      startedAt: activeAttempt.startedAt,
      expectedEnd: activeAttempt.expectedEnd,
      passingScore: quiz.passingScore,
    };

    return res.json({
      success: true,
      data: {
        quiz: {
          ...quiz.toObject(),
          selectedQuestions: quiz.selectedQuestions,
        },
        attemptNumber: activeAttempt.attemptNumber,
        timing,
        settings: {
          shuffleQuestions: quiz.shuffleQuestions || false,
          shuffleOptions: quiz.shuffleOptions || false,
          showCorrectAnswers: quiz.showCorrectAnswers !== false,
          showResults: quiz.showResults !== false,
          instructions: quiz.instructions || '',
        },
        desmosApiKey: process.env.DESMOS_API_KEY || '',
      },
    });
  } catch (error) {
    console.error('getTakeQuizJson:', error);
    return res.status(500).json({ success: false, message: 'Error starting quiz' });
  }
};

const getProfile = async (req, res) => {
  try {
    const student = await User.findById(studentId(req));
    if (!student) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    const achievements = await Progress.getStudentAchievements(studentId(req));
    return res.json({
      success: true,
      data: {
        student: buildProfilePayload(student),
        achievements,
      },
    });
  } catch (error) {
    console.error('getProfile:', error);
    return res.status(500).json({ success: false, message: 'Error loading profile' });
  }
};

const getSettings = async (req, res) => {
  try {
    const student = await User.findById(studentId(req));
    if (!student) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.json({
      success: true,
      data: { preferences: student.preferences || {} },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error' });
  }
};

const getWishlist = async (req, res) => {
  try {
    const student = await User.findById(studentId(req));
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    const wishlistCourseIds = student.wishlist?.courses || [];
    const wishlistBundleIds = student.wishlist?.bundles || [];

    const wishlistCourses = await Course.find({
      _id: { $in: wishlistCourseIds },
    }).select(
      'title description shortDescription thumbnail tags topics price',
    );

    const wishlistBundles = await BundleCourse.find({
      _id: { $in: wishlistBundleIds },
    })
      .populate('courses', 'title')
      .select(
        'title description shortDescription thumbnail year subject courseType price discountPrice tags courses',
      );

    const allItems = [
      ...wishlistCourses.map((course) => ({ ...course.toObject(), type: 'course' })),
      ...wishlistBundles.map((bundle) => ({ ...bundle.toObject(), type: 'bundle' })),
    ];

    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / limit) || 1;
    const paginatedItems = allItems.slice(skip, skip + limit);

    return res.json({
      success: true,
      data: {
        items: paginatedItems,
        pagination: {
          currentPage: page,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('getWishlist:', error);
    return res.status(500).json({ success: false, message: 'Error loading wishlist' });
  }
};

const addWishlist = async (req, res) => {
  try {
    const student = await User.findById(studentId(req));
    const itemId = req.params.id;
    const explicit = req.query.type;

    if (explicit === 'bundle') {
      await student.addBundleToWishlist(itemId);
    } else if (explicit === 'course') {
      await student.addCourseToWishlist(itemId);
    } else {
      const [bundleDoc, courseDoc] = await Promise.all([
        BundleCourse.findById(itemId).select('_id').lean(),
        Course.findById(itemId).select('_id').lean(),
      ]);
      if (bundleDoc) await student.addBundleToWishlist(itemId);
      else if (courseDoc) await student.addCourseToWishlist(itemId);
      else {
        return res.status(404).json({
          success: false,
          message: 'Course or bundle not found',
        });
      }
    }

    return res.json({ success: true, message: 'Added to wishlist' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Error' });
  }
};

const removeWishlist = async (req, res) => {
  try {
    const student = await User.findById(studentId(req));
    const itemId = req.params.id;
    const idStr = String(itemId);
    const explicit = req.query.type;

    const inBundles = (student.wishlist?.bundles || []).some(
      (b) => b.toString() === idStr,
    );
    const inCourses = (student.wishlist?.courses || []).some(
      (c) => c.toString() === idStr,
    );

    if (explicit === 'bundle') {
      await student.removeBundleFromWishlist(itemId);
    } else if (explicit === 'course') {
      await student.removeCourseFromWishlist(itemId);
    } else if (inBundles) {
      await student.removeBundleFromWishlist(itemId);
    } else if (inCourses) {
      await student.removeCourseFromWishlist(itemId);
    } else {
      const [bundleDoc, courseDoc] = await Promise.all([
        BundleCourse.findById(itemId).select('_id').lean(),
        Course.findById(itemId).select('_id').lean(),
      ]);
      if (bundleDoc) await student.removeBundleFromWishlist(itemId);
      else if (courseDoc) await student.removeCourseFromWishlist(itemId);
      else {
        return res.status(404).json({
          success: false,
          message: 'Item not in wishlist',
        });
      }
    }

    return res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Error' });
  }
};

/** Mongoose adds virtual `id` === `_id` when virtuals are on; mobile JSON only needs `_id`. */
const stripRedundantId = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;
  const o = { ...doc };
  if (o._id != null && o.id !== undefined && String(o.id) === String(o._id)) {
    delete o.id;
  }
  return o;
};

const normalizeOrderHistoryRow = (row) => {
  const out = stripRedundantId({ ...row });
  if (out.item && typeof out.item === 'object') {
    out.item = stripRedundantId({ ...out.item });
    if (Array.isArray(out.item.courses)) {
      out.item.courses = out.item.courses.map((c) =>
        stripRedundantId(
          c != null && typeof c.toObject === 'function' ? c.toObject() : { ...c },
        ),
      );
    }
  }
  return out;
};

const getOrderHistory = async (req, res) => {
  try {
    const student = await User.findById(studentId(req));
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const purchaseHistory = student.getPurchaseHistory();
    const totalOrders = purchaseHistory.length;
    const totalPages = Math.ceil(totalOrders / limit) || 1;
    const paginatedOrders = purchaseHistory.slice(skip, skip + limit);

    const populatedOrders = await Promise.all(
      paginatedOrders.map(async (order) => {
        if (order.type === 'course') {
          const course = await Course.findById(order.course)
            .select('title thumbnail')
            .lean();
          return normalizeOrderHistoryRow({ ...order, item: course || null });
        }
        if (order.type === 'bundle') {
          const bundle = await BundleCourse.findById(order.bundle)
            .populate('courses', 'title')
            .select('title thumbnail year subject courses')
            .lean();
          return normalizeOrderHistoryRow({ ...order, item: bundle || null });
        }
        return normalizeOrderHistoryRow(order);
      }),
    );

    return res.json({
      success: true,
      data: {
        orders: populatedOrders,
        pagination: {
          currentPage: page,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('getOrderHistory:', error);
    return res.status(500).json({ success: false, message: 'Error loading orders' });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const uid = studentId(req);
    const { orderNumber } = req.params;
    const student = await User.findById(uid);

    const Purchase = require('../models/Purchase');
    let order = await Purchase.findOne({
      user: uid,
      orderNumber,
    })
      .populate('appliedPromoCode', 'code name description discountType discountValue')
      .populate('items.item')
      .lean();

    let isNewSystem = true;
    if (!order) {
      isNewSystem = false;
      const purchaseHistory = student.getPurchaseHistory();
      order = purchaseHistory.find((p) => p.orderNumber === orderNumber);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
    }

    let item = null;
    let itemType = 'unknown';
    let courseId = null;
    let bundleId = null;

    if (isNewSystem) {
      const firstItem = order.items && order.items.length > 0 ? order.items[0] : null;
      if (firstItem && firstItem.itemType === 'course') {
        itemType = 'course';
        courseId = firstItem.item;
        item = await Course.findById(firstItem.item)
          .populate('topics', 'title description')
          .select(
            'title description shortDescription thumbnail tags topics price',
          );
      } else if (firstItem && firstItem.itemType === 'bundle') {
        itemType = 'bundle';
        bundleId = firstItem.item;
        item = await BundleCourse.findById(firstItem.item)
          .populate('courses', 'title description shortDescription thumbnail')
          .select(
            'title description shortDescription thumbnail year subject courseType price discountPrice tags courses',
          );
      }
    } else {
      if (order.type === 'course' && order.course) {
        itemType = 'course';
        courseId = order.course;
        item = await Course.findById(order.course)
          .populate('topics', 'title description')
          .select(
            'title description shortDescription thumbnail tags topics price',
          );
      } else if (order.type === 'bundle' && order.bundle) {
        itemType = 'bundle';
        bundleId = order.bundle;
        item = await BundleCourse.findById(order.bundle)
          .populate('courses', 'title description shortDescription thumbnail')
          .select(
            'title description shortDescription thumbnail year subject courseType price discountPrice tags courses',
          );
      }
    }

    const formattedOrder = {
      ...order,
      item,
      type: itemType,
      course: courseId,
      bundle: bundleId,
      price:
        order.price ||
        (order.items && order.items[0] ? order.items[0].price : 0),
      purchasedAt: order.purchasedAt || order.createdAt,
      orderNumber: order.orderNumber,
      status: order.status || 'completed',
      total: order.total || order.price,
      subtotal: order.subtotal || order.price,
      tax: order.tax || 0,
      discountAmount: order.discountAmount || 0,
      originalAmount: order.originalAmount || order.price,
      appliedPromoCode: order.appliedPromoCode,
      promoCodeUsed: order.promoCodeUsed,
    };

    return res.json({ success: true, data: { order: formattedOrder } });
  } catch (error) {
    console.error('getOrderDetails:', error);
    return res.status(500).json({ success: false, message: 'Error loading order' });
  }
};

const getContentQuizResults = async (req, res) => {
  try {
    const uid = studentId(req);
    const contentId = req.params.contentId;

    const student = await User.findById(uid);
    let contentItem = null;
    let course = null;
    let topic = null;

    for (const enrollment of student.enrolledCourses) {
      const courseData = await Course.findById(enrollment.course).populate({
        path: 'topics',
        populate: { path: 'content.zoomMeeting', model: 'ZoomMeeting' },
      });

      if (courseData) {
        for (const topicData of courseData.topics) {
          const foundContent = topicData.content.find(
            (c) => c._id.toString() === contentId,
          );
          if (foundContent) {
            contentItem = foundContent;
            course = courseData;
            topic = topicData;
            break;
          }
        }
        if (contentItem) break;
      }
    }

    if (!contentItem || !['quiz', 'homework'].includes(contentItem.type)) {
      return res.status(404).json({
        success: false,
        message: 'Content not found or not a quiz/homework',
      });
    }

    const contentProgress = student.getContentProgressDetails(course._id, contentId);

    if (!contentProgress || contentProgress.quizAttempts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No quiz attempts found',
      });
    }

    const resultsMeta = computeContentQuizResultsMeta(
      contentItem,
      contentProgress,
    );

    let contentItemOut;
    if (resultsMeta.canShowAnswers) {
      contentItemOut =
        (await populateTopicContentItemWithQuestions(topic._id, contentId)) ||
        contentItem;
    } else {
      contentItemOut = contentItemStubForResultsWithoutAnswerReview(contentItem);
    }

    const progressPlain =
      contentProgress && typeof contentProgress.toObject === 'function'
        ? contentProgress.toObject({ virtuals: false })
        : contentProgress
          ? { ...contentProgress }
          : null;

    let contentProgressOut = progressPlain;
    let latestAttemptOut;
    let attemptHistoryOut;

    if (resultsMeta.canShowAnswers) {
      const fullAttempts = (contentProgress.quizAttempts || []).map((a) =>
        quizAttemptToPlain(a),
      );
      if (contentProgressOut) {
        contentProgressOut = { ...contentProgressOut, quizAttempts: fullAttempts };
      }
      attemptHistoryOut = fullAttempts;
      latestAttemptOut =
        fullAttempts.length > 0
          ? fullAttempts[fullAttempts.length - 1]
          : null;
    } else {
      const slimAttempts = redactQuizAttemptsForClosedReview(
        contentProgress.quizAttempts,
      );
      if (contentProgressOut) {
        contentProgressOut = {
          ...contentProgressOut,
          quizAttempts: slimAttempts,
        };
      }
      attemptHistoryOut = slimAttempts;
      latestAttemptOut =
        slimAttempts.length > 0
          ? slimAttempts[slimAttempts.length - 1]
          : null;
    }

    return res.json({
      success: true,
      data: {
        course: { _id: course._id, title: course.title },
        topic: { _id: topic._id, title: topic.title },
        contentItem: contentItemOut,
        contentProgress: contentProgressOut,
        latestAttempt: latestAttemptOut,
        attemptHistory: attemptHistoryOut,
        attemptSummary: attemptSummaryForMobile(
          contentItem.type,
          contentItem,
          contentProgress,
        ),
        canShowAnswers: resultsMeta.canShowAnswers,
        answerReviewAllowed: resultsMeta.canShowAnswers,
        answerReviewStatus: resultsMeta.canShowAnswers ? 'allowed' : 'not_allowed',
        lastPassed: resultsMeta.lastPassed,
        showResults: resultsMeta.showResults,
        canRetake: resultsMeta.canRetake,
        answerReviewNotice: resultsMeta.answerReviewNotice,
      },
    });
  } catch (error) {
    console.error('getContentQuizResults:', error);
    return res.status(500).json({ success: false, message: 'Error loading results' });
  }
};

const getHomeworkAttempts = async (req, res) => {
  try {
    const uid = studentId(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const homeworkProgress = await Progress.find({
      student: uid,
      activity: { $in: ['homework_submitted', 'homework_graded'] },
    })
      .populate('course', 'title')
      .populate('topic', 'title')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalAttempts = await Progress.countDocuments({
      student: uid,
      activity: { $in: ['homework_submitted', 'homework_graded'] },
    });
    const totalPages = Math.ceil(totalAttempts / limit) || 1;

    return res.json({
      success: true,
      data: {
        homeworkProgress,
        pagination: {
          currentPage: page,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('getHomeworkAttempts:', error);
    return res.status(500).json({ success: false, message: 'Error loading homework' });
  }
};

module.exports = {
  getDashboard,
  getEnrolledCourses,
  getCourseContent,
  getContentDetails,
  getQuizzesList,
  getQuizDetailsJson,
  getStandaloneQuizResultsJson,
  getTakeQuizJson,
  getProfile,
  getSettings,
  getWishlist,
  addWishlist,
  removeWishlist,
  getOrderHistory,
  getOrderDetails,
  getHomeworkAttempts,
  updateContentProgress: wrapStudentHandler(studentController.updateContentProgress),
  submitContentQuiz: wrapStudentHandler(studentController.submitContentQuiz),
  getContentQuizResults,
  getSecureQuestion: wrapStudentHandler(studentController.getSecureQuestion),
  getSecureAllQuestions: wrapStudentHandler(studentController.getSecureAllQuestions),
  checkQuestionAnswered: wrapStudentHandler(studentController.checkQuestionAnswered),
  submitStandaloneQuiz: wrapStudentHandler(studentController.submitStandaloneQuiz),
  getSecureStandaloneQuizQuestions: wrapStudentHandler(
    studentController.getSecureStandaloneQuizQuestions,
  ),
  updateProfile: wrapStudentHandler(studentController.updateProfile),
  updateSettings: wrapStudentHandler(studentController.updateSettings),
  updateProfilePicture: wrapStudentHandler(studentController.updateProfilePicture),
  changePassword: wrapStudentHandler(studentController.changePassword),
  joinZoomMeeting: wrapResJsonWithMobileBunnyRecording(
    wrapStudentHandler(studentController.joinZoomMeeting),
  ),
  leaveZoomMeeting: wrapStudentHandler(studentController.leaveZoomMeeting),
  getZoomMeetingHistory: wrapResJsonWithMobileBunnyRecording(
    wrapStudentHandler(studentController.getZoomMeetingHistory),
  ),
  debugProgress: wrapStudentHandler(studentController.debugProgress),
};
