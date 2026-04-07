const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const Course = require('../models/Course');
const BundleCourse = require('../models/BundleCourse');
const { weekNumberFromCourseTitle } = require('../utils/weekLabelFromCourse');
const { formatWeeklyRowSubtitle } = require('../utils/analyticsLabels');

/**
 * Nominal course list (Course.price only). Used for revenue split and admin-placed
 * attribution — per-course % discounts apply to standalone checkout, not to “week value”
 * inside bundle analytics.
 */
function courseCatalogListPrice(c) {
  if (!c) return 0;
  return Math.max(0, Number(c.price) || 0);
}

/** Nominal bundle list (BundleCourse.price only) for admin-placed bundle attribution. */
function bundleCatalogListPrice(b) {
  if (!b) return 0;
  return Math.max(0, Number(b.price) || 0);
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Promo-aware net line amount: scale each course/bundle line so line sums match
 * what the customer actually paid (purchase.total), excluding unpaid discount.
 */
function purchaseNetScalingStages() {
  return [
    {
      $addFields: {
        itemsSum: {
          $reduce: {
            input: { $ifNull: ['$items', []] },
            initialValue: 0,
            in: {
              $add: [
                '$$value',
                {
                  $cond: [
                    { $in: ['$$this.itemType', ['course', 'bundle']] },
                    { $ifNull: ['$$this.price', 0] },
                    0,
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $addFields: {
        preTotal: {
          $add: ['$itemsSum', { $ifNull: ['$booksSubtotal', 0] }],
        },
        paidTotal: { $ifNull: ['$total', 0] },
      },
    },
    {
      $addFields: {
        netScale: {
          $cond: {
            if: { $gt: ['$preTotal', 0] },
            then: { $divide: ['$paidTotal', '$preTotal'] },
            else: 0,
          },
        },
      },
    },
  ];
}

function purchaseLineNetStage() {
  return {
    $addFields: {
      lineNet: {
        $cond: {
          if: { $in: ['$items.itemType', ['course', 'bundle']] },
          then: {
            $multiply: [{ $ifNull: ['$items.price', 0] }, '$netScale'],
          },
          else: 0,
        },
      },
    },
  };
}

/**
 * In-memory mirror of purchase net scaling (same as aggregation) for student detail UI.
 * @returns {{ itemsSum: number, booksSubtotal: number, preTotal: number, paidTotal: number, netScale: number, lines: Array<{itemType: string, title: string, listPrice: number, netPaid: number}> }}
 */
function computePurchaseOrderLineNets(purchase) {
  const items = purchase.items || [];
  let itemsSum = 0;
  for (const it of items) {
    if (it.itemType === 'course' || it.itemType === 'bundle') {
      itemsSum += Number(it.price) || 0;
    }
  }
  const books = Number(purchase.booksSubtotal) || 0;
  const preTotal = itemsSum + books;
  const paidTotal = Number(purchase.total) || 0;
  const netScale = preTotal > 0 ? paidTotal / preTotal : 0;

  const lines = [];
  for (const it of items) {
    if (it.itemType !== 'course' && it.itemType !== 'bundle') continue;
    const item = it.item;
    let label = it.title;
    if (it.itemType === 'course' && item && item.title) label = item.title;
    if (it.itemType === 'bundle' && item && item.title) label = `Bundle: ${item.title}`;
    const listPrice = Number(it.price) || 0;
    lines.push({
      itemType: it.itemType,
      title: label,
      listPrice: roundMoney(listPrice),
      netPaid: roundMoney(listPrice * netScale),
    });
  }
  if (books > 0) {
    lines.push({
      itemType: 'books',
      title: 'Books / add-ons',
      listPrice: roundMoney(books),
      netPaid: roundMoney(books * netScale),
    });
  }

  const sumNet = lines.reduce((s, l) => s + l.netPaid, 0);
  const drift = roundMoney(paidTotal - sumNet);
  if (lines.length && Math.abs(drift) >= 0.01) {
    const last = lines[lines.length - 1];
    last.netPaid = roundMoney(last.netPaid + drift);
  }

  return {
    itemsSum: roundMoney(itemsSum),
    booksSubtotal: roundMoney(books),
    preTotal: roundMoney(preTotal),
    paidTotal: roundMoney(paidTotal),
    netScale: preTotal > 0 ? roundMoney(netScale) : 0,
    lines,
  };
}

/**
 * Net paid in the given orders attributed to each course: direct course lines + each course's
 * share of bundle line net (by catalog list-price weights). Uses the same net scaling as order receipts.
 */
async function computeStudentPaidAttributedByCourse(purchasesLean) {
  const map = new Map();
  const bundleCoursesCache = new Map();

  for (const p of purchasesLean || []) {
    const net = computePurchaseOrderLineNets(p);
    const cbItems = (p.items || []).filter(
      (it) => it.itemType === 'course' || it.itemType === 'bundle',
    );
    const cbLines = (net.lines || []).filter(
      (ln) => ln.itemType === 'course' || ln.itemType === 'bundle',
    );
    if (cbItems.length !== cbLines.length) continue;

    for (let i = 0; i < cbItems.length; i++) {
      const it = cbItems[i];
      const line = cbLines[i];
      const netPaid = Number(line.netPaid) || 0;
      if (netPaid <= 0) continue;

      if (it.itemType === 'course' && it.item) {
        const cid = String(it.item._id || it.item);
        map.set(cid, roundMoney((map.get(cid) || 0) + netPaid));
        continue;
      }

      if (it.itemType === 'bundle' && it.item) {
        const bid = it.item._id || it.item;
        const bKey = String(bid);
        let bCourses = bundleCoursesCache.get(bKey);
        if (!bCourses) {
          bCourses = await Course.find({ bundle: bid }).select('price discountPrice').lean();
          bundleCoursesCache.set(bKey, bCourses);
        }
        if (!bCourses.length) continue;
        let tw = 0;
        const weights = [];
        for (const c of bCourses) {
          const w = Math.max(courseCatalogListPrice(c), 0.01);
          weights.push({ id: String(c._id), w });
          tw += w;
        }
        if (tw <= 0) tw = bCourses.length || 1;
        for (const { id, w } of weights) {
          const share = netPaid * (w / tw);
          map.set(id, roundMoney((map.get(id) || 0) + share));
        }
      }
    }
  }

  return map;
}

function toObjectIds(ids) {
  if (!ids || !ids.length) return [];
  return ids.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
}

function parseRangeEnd(to) {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  return end;
}

function buildPurchaseMatch(from, to) {
  return {
    status: 'completed',
    paymentStatus: 'completed',
    createdAt: { $gte: new Date(from), $lte: parseRangeEnd(to) },
    $or: [{ refundedAt: { $exists: false } }, { refundedAt: null }],
  };
}

function buildEnrollmentDateMatch(from, to) {
  return {
    $gte: new Date(from),
    $lte: parseRangeEnd(to),
  };
}

/**
 * Union of explicit course ids + all courses in selected bundles.
 * @returns {Promise<mongoose.Types.ObjectId[]|null>} null = no restriction (all courses)
 */
async function resolveScopeCourseIds(bundleIds, courseIds) {
  const cIds = toObjectIds(courseIds);
  const bIds = toObjectIds(bundleIds);
  const set = new Set(cIds.map(String));

  if (bIds.length) {
    const fromBundles = await Course.find({ bundle: { $in: bIds } })
      .select('_id')
      .lean();
    fromBundles.forEach((c) => set.add(String(c._id)));
  }

  if (set.size === 0) {
    if ((courseIds && courseIds.length) || (bundleIds && bundleIds.length)) return [];
    return null;
  }

  return [...set].map((id) => new mongoose.Types.ObjectId(id));
}

async function getRevenueTotals(from, to) {
  const match = buildPurchaseMatch(from, to);
  const netPipePrefix = [{ $match: match }, ...purchaseNetScalingStages(), { $unwind: '$items' }, purchaseLineNetStage()];

  const [totalRow, byCourse, byBundleTestType] = await Promise.all([
    Purchase.aggregate([...netPipePrefix, { $group: { _id: null, revenue: { $sum: '$lineNet' } } }]),
    Purchase.aggregate([
      ...netPipePrefix,
      { $match: { 'items.itemType': 'course' } },
      {
        $group: {
          _id: '$items.item',
          revenue: { $sum: '$lineNet' },
        },
      },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'c',
        },
      },
      { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'bundlecourses',
          localField: 'c.bundle',
          foreignField: '_id',
          as: 'b',
        },
      },
      { $unwind: { path: '$b', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          courseId: '$_id',
          revenue: 1,
          title: { $ifNull: ['$c.title', 'Course'] },
          testType: { $ifNull: ['$b.testType', 'Unknown'] },
        },
      },
    ]),
    Purchase.aggregate([
      ...netPipePrefix,
      { $match: { 'items.itemType': 'bundle' } },
      {
        $lookup: {
          from: 'bundlecourses',
          localField: 'items.item',
          foreignField: '_id',
          as: 'b',
        },
      },
      { $unwind: { path: '$b', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            testType: '$b.testType',
            bundleId: '$b._id',
            title: '$b.title',
          },
          revenue: { $sum: '$lineNet' },
        },
      },
    ]),
  ]);

  const totalRevenue = totalRow[0]?.revenue || 0;

  const courseRevenue = {};
  byCourse.forEach((r) => {
    courseRevenue[String(r.courseId)] = {
      revenue: r.revenue,
      title: r.title || 'Course',
    };
  });

  const testTypeRevenue = {};
  const bundleRevenue = {};
  byBundleTestType.forEach((r) => {
    const tt = r._id?.testType || 'Unknown';
    testTypeRevenue[tt] = (testTypeRevenue[tt] || 0) + r.revenue;
    if (r._id?.bundleId) {
      bundleRevenue[String(r._id.bundleId)] = {
        revenue: r.revenue,
        title: r._id.title || '',
        testType: tt,
      };
    }
  });

  // Course-only checkouts: attribute net revenue to the parent bundle's test type
  // so SAT/EST (etc.) KPIs sum with bundle lines to match platform cash total.
  byCourse.forEach((r) => {
    const tt = r.testType || 'Unknown';
    testTypeRevenue[tt] = (testTypeRevenue[tt] || 0) + (r.revenue || 0);
  });

  return {
    totalRevenue,
    courseRevenue,
    testTypeRevenue,
    bundleRevenue,
  };
}

/** After unwind + lineNet: keep bundle lines in bundleIds and/or course lines in scope. */
function buildScopedLineMatchStage(bundleIds, scopeCourseIds) {
  const bIds = toObjectIds(bundleIds);
  const scope = scopeCourseIds || [];
  const or = [];
  if (bIds.length) {
    or.push({ 'items.itemType': 'bundle', 'items.item': { $in: bIds } });
  }
  if (scope.length) {
    or.push({ 'items.itemType': 'course', 'items.item': { $in: scope } });
  }
  if (!or.length) {
    return { $match: { $expr: { $eq: [1, 0] } } };
  }
  return { $match: { $or: or } };
}

/**
 * Cash revenue + splits for selected bundles/courses only (same attribution rules as getRevenueTotals).
 */
async function getRevenueTotalsForScope(from, to, bundleIds, scopeCourseIds) {
  const match = buildPurchaseMatch(from, to);
  const netPipePrefix = [
    { $match: match },
    ...purchaseNetScalingStages(),
    { $unwind: '$items' },
    purchaseLineNetStage(),
    buildScopedLineMatchStage(bundleIds, scopeCourseIds),
  ];

  const [totalRow, byCourse, byBundleTestType] = await Promise.all([
    Purchase.aggregate([...netPipePrefix, { $group: { _id: null, revenue: { $sum: '$lineNet' } } }]),
    Purchase.aggregate([
      ...netPipePrefix,
      { $match: { 'items.itemType': 'course' } },
      {
        $group: {
          _id: '$items.item',
          revenue: { $sum: '$lineNet' },
        },
      },
      {
        $lookup: {
          from: 'courses',
          localField: '_id',
          foreignField: '_id',
          as: 'c',
        },
      },
      { $unwind: { path: '$c', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'bundlecourses',
          localField: 'c.bundle',
          foreignField: '_id',
          as: 'b',
        },
      },
      { $unwind: { path: '$b', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          courseId: '$_id',
          revenue: 1,
          title: { $ifNull: ['$c.title', 'Course'] },
          testType: { $ifNull: ['$b.testType', 'Unknown'] },
        },
      },
    ]),
    Purchase.aggregate([
      ...netPipePrefix,
      { $match: { 'items.itemType': 'bundle' } },
      {
        $lookup: {
          from: 'bundlecourses',
          localField: 'items.item',
          foreignField: '_id',
          as: 'b',
        },
      },
      { $unwind: { path: '$b', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            testType: '$b.testType',
            bundleId: '$b._id',
            title: '$b.title',
          },
          revenue: { $sum: '$lineNet' },
        },
      },
    ]),
  ]);

  const totalRevenue = totalRow[0]?.revenue || 0;

  const courseRevenue = {};
  byCourse.forEach((r) => {
    courseRevenue[String(r.courseId)] = {
      revenue: r.revenue,
      title: r.title || 'Course',
    };
  });

  const testTypeRevenue = {};
  const bundleRevenue = {};
  byBundleTestType.forEach((r) => {
    const tt = r._id?.testType || 'Unknown';
    testTypeRevenue[tt] = (testTypeRevenue[tt] || 0) + r.revenue;
    if (r._id?.bundleId) {
      bundleRevenue[String(r._id.bundleId)] = {
        revenue: r.revenue,
        title: r._id.title || '',
        testType: tt,
      };
    }
  });

  byCourse.forEach((r) => {
    const tt = r.testType || 'Unknown';
    testTypeRevenue[tt] = (testTypeRevenue[tt] || 0) + (r.revenue || 0);
  });

  return {
    totalRevenue,
    courseRevenue,
    testTypeRevenue,
    bundleRevenue,
  };
}

async function getAllowedBundleObjectIds(bundleIds, scopeCourseIds) {
  const bIds = toObjectIds(bundleIds);
  if (bIds.length) return bIds;
  const s = scopeCourseIds || [];
  if (!s.length) return [];
  const raw = await Course.distinct('bundle', { _id: { $in: s } });
  return toObjectIds(raw.filter(Boolean).map(String));
}

async function getStudentMetrics(from, to, scopeCourseIds) {
  const enrolledAt = buildEnrollmentDateMatch(from, to);
  const base = [{ $match: { role: 'student' } }, { $unwind: '$enrolledCourses' }, {
    $match: {
      'enrolledCourses.enrolledAt': enrolledAt,
      ...(scopeCourseIds && scopeCourseIds.length
        ? { 'enrolledCourses.course': { $in: scopeCourseIds } }
        : {}),
    },
  }];

  const [distinctCount, perCourse] = await Promise.all([
    User.aggregate([...base, { $group: { _id: '$_id' } }, { $count: 'total' }]),
    User.aggregate([
      ...base,
      {
        $group: {
          _id: '$enrolledCourses.course',
          students: { $addToSet: '$_id' },
        },
      },
      {
        $project: {
          courseId: '$_id',
          count: { $size: '$students' },
        },
      },
    ]),
  ]);

  const totalStudents = distinctCount[0]?.total || 0;
  const studentsByCourse = {};
  perCourse.forEach((r) => {
    studentsByCourse[String(r.courseId)] = r.count;
  });

  return { totalStudents, studentsByCourse };
}

async function getEnrollmentPieByBundle(from, to, scopeCourseIds) {
  const enrolledAt = buildEnrollmentDateMatch(from, to);
  const ecMatch = {
    'enrolledCourses.enrolledAt': enrolledAt,
    ...(scopeCourseIds && scopeCourseIds.length
      ? { 'enrolledCourses.course': { $in: scopeCourseIds } }
      : {}),
  };

  const rows = await User.aggregate([
    { $match: { role: 'student' } },
    { $unwind: '$enrolledCourses' },
    { $match: ecMatch },
    {
      $lookup: {
        from: 'courses',
        localField: 'enrolledCourses.course',
        foreignField: '_id',
        as: 'c',
      },
    },
    { $unwind: '$c' },
    {
      $lookup: {
        from: 'bundlecourses',
        localField: 'c.bundle',
        foreignField: '_id',
        as: 'b',
      },
    },
    { $unwind: '$b' },
    {
      $group: {
        _id: '$b._id',
        label: { $first: '$b.title' },
        testType: { $first: '$b.testType' },
        subject: { $first: '$b.subject' },
        students: { $addToSet: '$_id' },
      },
    },
    {
      $project: {
        bundleId: '$_id',
        label: 1,
        testType: 1,
        subject: 1,
        count: { $size: '$students' },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return rows.map((r) => ({
    id: String(r.bundleId),
    label: r.label || 'Bundle',
    subtitle: [r.testType, r.subject].filter(Boolean).join(' · '),
    count: r.count,
  }));
}

async function getRevenuePieByBundle(from, to, allowedBundleIds) {
  const match = buildPurchaseMatch(from, to);
  const bundleLineMatch = { 'items.itemType': 'bundle' };
  const pipeline = [
    { $match: match },
    ...purchaseNetScalingStages(),
    { $unwind: '$items' },
    purchaseLineNetStage(),
    { $match: bundleLineMatch },
  ];
  if (Array.isArray(allowedBundleIds) && allowedBundleIds.length) {
    pipeline.push({ $match: { 'items.item': { $in: allowedBundleIds } } });
  }
  if (Array.isArray(allowedBundleIds) && allowedBundleIds.length === 0) {
    return [];
  }
  pipeline.push(
    {
      $lookup: {
        from: 'bundlecourses',
        localField: 'items.item',
        foreignField: '_id',
        as: 'b',
      },
    },
    { $unwind: '$b' },
    {
      $group: {
        _id: '$b._id',
        label: { $first: '$b.title' },
        testType: { $first: '$b.testType' },
        revenue: { $sum: '$lineNet' },
      },
    },
    { $sort: { revenue: -1 } },
  );

  const rows = await Purchase.aggregate(pipeline);

  return rows.map((r) => ({
    id: String(r._id),
    label: r.label || 'Bundle',
    testType: r.testType,
    revenue: r.revenue,
  }));
}

/** Merge paid bundle rows with per-course imputed revenue (admin-placed). */
async function mergeBundleRevenueWithImputed(cashRows, imputedMap) {
  const imputedByBundle = new Map();

  const positive = [...imputedMap.entries()].filter(([, v]) => v > 0);
  if (positive.length) {
    const crs = await Course.find({
      _id: { $in: toObjectIds(positive.map(([k]) => k)) },
    })
      .select('bundle')
      .lean();
    for (const c of crs) {
      if (!c.bundle) continue;
      const cid = String(c._id);
      const amt = imputedMap.get(cid) || 0;
      if (amt <= 0) continue;
      const bid = String(c.bundle);
      imputedByBundle.set(bid, roundMoney((imputedByBundle.get(bid) || 0) + amt));
    }
  }

  const cashMap = new Map(cashRows.map((r) => [String(r.id), r]));
  const allBundleIds = new Set([...cashMap.keys(), ...imputedByBundle.keys()]);

  const missingMeta = [...allBundleIds].filter((id) => !cashMap.has(id));
  const extraBundles =
    missingMeta.length > 0
      ? await BundleCourse.find({ _id: { $in: toObjectIds(missingMeta) } })
          .select('title testType')
          .lean()
      : [];

  const metaById = new Map(
    cashRows.map((r) => [String(r.id), { label: r.label, testType: r.testType }]),
  );
  for (const b of extraBundles) {
    metaById.set(String(b._id), { label: b.title || 'Bundle', testType: b.testType });
  }

  const merged = [];
  for (const id of allBundleIds) {
    const meta = metaById.get(id) || { label: 'Bundle', testType: '' };
    const cash = cashMap.get(id)?.revenue ?? 0;
    const imp = imputedByBundle.get(id) || 0;
    const rImp = roundMoney(imp);
    merged.push({
      id,
      label: meta.label,
      testType: meta.testType,
      revenue: roundMoney(cash + imp),
      revenueCash: roundMoney(cash),
      revenueImputed: rImp,
      revenueAdminPlaced: rImp,
    });
  }
  merged.sort((a, b) => b.revenue - a.revenue);
  return merged;
}

/**
 * Bundle revenue for charts: paid checkout (net) + admin-placed value, by bundle.
 */
async function getRevenuePieByBundleWithImputed(from, to, scopeCourseIds) {
  const [cashRows, courseIds] = await Promise.all([
    getRevenuePieByBundle(from, to),
    distinctCoursesWithEnrollmentInRange(from, to, scopeCourseIds),
  ]);

  const imputedMap = await getImputedRevenueByCourse(from, to, courseIds);
  return mergeBundleRevenueWithImputed(cashRows, imputedMap);
}

async function getRevenuePieByCourseLine(from, to, scopeCourseIds) {
  const match = buildPurchaseMatch(from, to);
  const pipeline = [
    { $match: match },
    ...purchaseNetScalingStages(),
    { $unwind: '$items' },
    purchaseLineNetStage(),
    { $match: { 'items.itemType': 'course' } },
  ];
  if (scopeCourseIds && scopeCourseIds.length) {
    pipeline.push({ $match: { 'items.item': { $in: scopeCourseIds } } });
  }
  pipeline.push(
    {
      $group: {
        _id: '$items.item',
        revenue: { $sum: '$lineNet' },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'c',
      },
    },
    {
      $project: {
        courseId: '$_id',
        title: { $arrayElemAt: ['$c.title', 0] },
        revenue: 1,
      },
    },
    { $sort: { revenue: -1 } },
  );

  const rows = await Purchase.aggregate(pipeline);
  return rows.map((r) => ({
    id: String(r.courseId),
    label: r.title || 'Course',
    revenue: r.revenue,
  }));
}

/** Merge paid course-line rows with imputed (admin-placed) revenue per course. */
async function mergeCourseRevenueWithImputed(cashRows, imputedMap) {
  const byId = new Map(
    cashRows.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        label: r.label,
        revenueCash: r.revenue,
        revenueImputed: 0,
        revenueAdminPlaced: 0,
        revenue: r.revenue,
      },
    ]),
  );

  const imputedOnly = [];
  for (const [cid, imp] of imputedMap.entries()) {
    if (imp <= 0) continue;
    const cur = byId.get(cid);
    if (cur) {
      const rImp = roundMoney(imp);
      cur.revenueImputed = rImp;
      cur.revenueAdminPlaced = rImp;
      cur.revenue = roundMoney(cur.revenueCash + imp);
    } else {
      imputedOnly.push(cid);
    }
  }

  if (imputedOnly.length) {
    const crs = await Course.find({ _id: { $in: toObjectIds(imputedOnly) } })
      .select('title')
      .lean();
    for (const c of crs) {
      const id = String(c._id);
      const imp = imputedMap.get(id) || 0;
      if (imp <= 0) continue;
      const rImp = roundMoney(imp);
      byId.set(id, {
        id,
        label: c.title || 'Course',
        revenueCash: 0,
        revenueImputed: rImp,
        revenueAdminPlaced: rImp,
        revenue: roundMoney(imp),
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * One pass for the distributions API: shared course scope + single imputed computation.
 */
async function getAnalyticsDistributionCharts(from, to, bundleIds, courseIds) {
  const scope = await resolveScopeCourseIds(bundleIds, courseIds);
  if (Array.isArray(scope) && scope.length === 0) {
    return { studentsByBundle: [], revenueByBundle: [], revenueByCourse: [] };
  }

  const allowedBundles =
    scope === null ? null : await getAllowedBundleObjectIds(bundleIds, scope);

  const [studentsByBundle, cashBundleRows, cashCourseRows, courseIdsForImp] = await Promise.all([
    getEnrollmentPieByBundle(from, to, scope),
    getRevenuePieByBundle(from, to, allowedBundles),
    getRevenuePieByCourseLine(from, to, scope),
    distinctCoursesWithEnrollmentInRange(from, to, scope),
  ]);

  const imputedMap = await getImputedRevenueByCourse(from, to, courseIdsForImp);
  const [revenueByBundle, revenueByCourse] = await Promise.all([
    mergeBundleRevenueWithImputed(cashBundleRows, imputedMap),
    mergeCourseRevenueWithImputed(cashCourseRows, imputedMap),
  ]);

  return { studentsByBundle, revenueByBundle, revenueByCourse };
}

/**
 * Course-line revenue for charts: paid checkout (net) + admin-placed for that course.
 */
async function getRevenuePieByCourseLineWithImputed(from, to, scopeCourseIds) {
  const [cashRows, courseIds] = await Promise.all([
    getRevenuePieByCourseLine(from, to, scopeCourseIds),
    distinctCoursesWithEnrollmentInRange(from, to, scopeCourseIds),
  ]);

  const imputedMap = await getImputedRevenueByCourse(from, to, courseIds);
  return mergeCourseRevenueWithImputed(cashRows, imputedMap);
}

/**
 * Profile breakdown (grade, teacher, school, country) for students with at least one
 * enrollment on the scoped courses (any status) — not tied to the analytics date range.
 */
async function getDemographics(scopeCourseIds) {
  const courseFilter =
    scopeCourseIds && scopeCourseIds.length
      ? { 'enrolledCourses.course': { $in: scopeCourseIds } }
      : {};

  const baseStages = [
    { $match: { role: 'student' } },
    { $unwind: '$enrolledCourses' },
    {
      $match: {
        ...courseFilter,
      },
    },
    { $group: { _id: '$_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
  ];

  const codeToCountry = {
    '+20': 'EG',
    '+966': 'SA',
    '+971': 'UAE',
    '+965': 'KW',
  };

  const [grades, teachers, schools, countries] = await Promise.all([
    User.aggregate([
      ...baseStages,
      { $group: { _id: '$grade', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      ...baseStages,
      { $group: { _id: '$englishTeacher', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      ...baseStages,
      { $group: { _id: '$schoolName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      ...baseStages,
      {
        $group: {
          _id: '$studentCountryCode',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    grades: grades.map((g) => ({ label: g._id || 'Unknown', count: g.count })),
    teachers: teachers.map((g) => ({ label: g._id || 'Unknown', count: g.count })),
    schools: schools.map((g) => ({ label: g._id || 'Unknown', count: g.count })),
    countries: countries.map((g) => ({
      label: codeToCountry[g._id] || g._id || 'Unknown',
      count: g.count,
    })),
  };
}

function isAdminEnrollmentOrderNumber(orderNumber) {
  const on = (orderNumber || '').toString();
  return /^ADMIN|^BULK/i.test(on);
}

/** ObjectId or populated { _id } from lean+populate user subdocs. */
function refId(ref) {
  if (ref == null) return null;
  if (typeof ref === 'object' && ref._id != null) return ref._id;
  return ref;
}

/**
 * “Admin-placed” revenue: catalog list value (Course.price / BundleCourse.price, no % discounts
 * on those fields) for enrollments in range with no matching paid checkout. Admin bundle
 * enrollments split nominal bundle price across weeks by nominal course prices.
 */
/**
 * @param {{ enrollmentRowsOverride?: object[], purchasesOverride?: object[] }} [options]
 *        Single-student imputation when both arrays are set (same rules as platform aggregate).
 */
async function computeImputedRevenueByCourseWithCounts(from, to, courseObjectIds, options = {}) {
  const ids = toObjectIds(courseObjectIds);
  const map = new Map();
  const imputedEnrollmentCountByCourseId = new Map();
  for (const id of ids) {
    const s = String(id);
    map.set(s, 0);
    imputedEnrollmentCountByCourseId.set(s, 0);
  }
  if (!ids.length) return { revenueByCourseId: map, imputedEnrollmentCountByCourseId };

  const enrolledAt = buildEnrollmentDateMatch(from, to);
  const courses = await Course.find({ _id: { $in: ids } })
    .select('bundle price discountPrice')
    .lean();
  const courseById = Object.fromEntries(courses.map((c) => [String(c._id), c]));
  const bundleIdStrs = [...new Set(courses.map((c) => String(c.bundle)).filter(Boolean))];
  const bundleObjIds = toObjectIds(bundleIdStrs);
  const bundles = await BundleCourse.find({ _id: { $in: bundleObjIds } })
    .select('price discountPrice')
    .lean();

  const bundleMeta = new Map();
  if (bundleObjIds.length) {
    const allBundleCourses = await Course.find({ bundle: { $in: bundleObjIds } })
      .select('bundle price discountPrice')
      .lean();
    const coursesByBundle = new Map();
    for (const c of allBundleCourses) {
      const bid = String(c.bundle);
      if (!coursesByBundle.has(bid)) coursesByBundle.set(bid, []);
      coursesByBundle.get(bid).push(c);
    }
    for (const b of bundles) {
      const bidStr = String(b._id);
      const bCourses = coursesByBundle.get(bidStr) || [];
      let tw = 0;
      const w = [];
      for (const c of bCourses) {
        const wt = Math.max(courseCatalogListPrice(c), 0.01);
        w.push({ id: String(c._id), wt });
        tw += wt;
      }
      if (tw <= 0) tw = bCourses.length || 1;
      bundleMeta.set(bidStr, {
        courses: w,
        totalW: tw,
        bundle: b,
      });
    }
  }

  let enrollments;
  let purchases;
  if (options.enrollmentRowsOverride && options.purchasesOverride != null) {
    enrollments = options.enrollmentRowsOverride;
    purchases = options.purchasesOverride;
  } else {
    enrollments = await User.aggregate([
      { $match: { role: 'student' } },
      { $unwind: '$enrolledCourses' },
      {
        $match: {
          'enrolledCourses.course': { $in: ids },
          'enrolledCourses.enrolledAt': enrolledAt,
        },
      },
      {
        $project: {
          userId: '$_id',
          courseId: '$enrolledCourses.course',
          purchasedBundles: 1,
          purchasedCourses: 1,
        },
      },
    ]);
    if (!enrollments.length) return { revenueByCourseId: map, imputedEnrollmentCountByCourseId };

    const userIds = [...new Set(enrollments.map((e) => e.userId))];
    purchases = await Purchase.find({
      user: { $in: userIds },
      status: 'completed',
      paymentStatus: 'completed',
      $or: [{ refundedAt: null }, { refundedAt: { $exists: false } }],
    })
      .select('user items')
      .lean();
  }

  if (!enrollments.length) return { revenueByCourseId: map, imputedEnrollmentCountByCourseId };

  const extraBundleIds = new Set();
  for (const p of purchases) {
    for (const it of p.items || []) {
      if (it.itemType === 'bundle' && it.item && !bundleMeta.has(String(it.item))) {
        extraBundleIds.add(String(it.item));
      }
    }
  }
  if (extraBundleIds.size > 0) {
    const extraOids = toObjectIds([...extraBundleIds]);
    const [extraBundleDocs, extraCourses] = await Promise.all([
      BundleCourse.find({ _id: { $in: extraOids } }).select('price discountPrice').lean(),
      Course.find({ bundle: { $in: extraOids } }).select('bundle price discountPrice').lean(),
    ]);
    const extraByBundle = new Map();
    for (const c of extraCourses) {
      const bid = String(c.bundle);
      if (!extraByBundle.has(bid)) extraByBundle.set(bid, []);
      extraByBundle.get(bid).push(c);
    }
    const extraBundleById = new Map(extraBundleDocs.map((b) => [String(b._id), b]));
    for (const bidStr of extraBundleIds) {
      const b = extraBundleById.get(bidStr);
      if (!b) continue;
      const bCourses = extraByBundle.get(bidStr) || [];
      let tw = 0;
      const w = [];
      for (const c of bCourses) {
        const wt = Math.max(courseCatalogListPrice(c), 0.01);
        w.push({ id: String(c._id), wt });
        tw += wt;
      }
      if (tw <= 0) tw = bCourses.length || 1;
      bundleMeta.set(bidStr, { courses: w, totalW: tw, bundle: b });
    }
  }

  // Paid cover from receipts: course line items only. Whole-bundle checkout is reflected on
  // the user via purchasedBundles (hasNonAdminBundleAccess), not by expanding bundle lines here.
  const paidPair = new Set();
  for (const p of purchases) {
    const uid = String(p.user);
    for (const it of p.items || []) {
      if (it.itemType === 'course' && it.item) {
        paidPair.add(`${uid}:${String(it.item)}`);
      }
    }
  }

  function hasNonAdminCoursePurchase(row, courseId) {
    const pcs = row.purchasedCourses || [];
    for (const pc of pcs) {
      if (String(refId(pc.course)) !== String(courseId) || pc.status !== 'active') continue;
      if (isAdminEnrollmentOrderNumber(pc.orderNumber)) continue;
      return true;
    }
    return false;
  }

  function hasNonAdminBundleAccess(row, bundleId) {
    const pbs = row.purchasedBundles || [];
    for (const pb of pbs) {
      if (String(refId(pb.bundle)) !== String(bundleId) || pb.status !== 'active') continue;
      if (isAdminEnrollmentOrderNumber(pb.orderNumber)) continue;
      return true;
    }
    return false;
  }

  for (const row of enrollments) {
    const uid = String(row.userId);
    const cid = String(row.courseId);
    const c = courseById[cid];
    if (!c) continue;

    if (paidPair.has(`${uid}:${cid}`)) continue;
    if (hasNonAdminCoursePurchase(row, cid)) continue;

    const bid = c.bundle ? String(c.bundle) : null;
    if (bid && hasNonAdminBundleAccess(row, bid)) continue;

    const meta = bid ? bundleMeta.get(bid) : null;
    const pbs = row.purchasedBundles || [];
    const adminPb =
      bid &&
      pbs.some(
        (pb) =>
          String(refId(pb.bundle)) === bid &&
          pb.status === 'active' &&
          isAdminEnrollmentOrderNumber(pb.orderNumber),
      );

    if (adminPb && meta) {
      const wEntry = meta.courses.find((x) => x.id === cid);
      const w = wEntry ? wEntry.wt : Math.max(courseCatalogListPrice(c), 0.01);
      const share = (bundleCatalogListPrice(meta.bundle) * w) / meta.totalW;
      imputedEnrollmentCountByCourseId.set(cid, (imputedEnrollmentCountByCourseId.get(cid) || 0) + 1);
      map.set(cid, roundMoney((map.get(cid) || 0) + share));
    } else {
      imputedEnrollmentCountByCourseId.set(cid, (imputedEnrollmentCountByCourseId.get(cid) || 0) + 1);
      map.set(cid, roundMoney((map.get(cid) || 0) + courseCatalogListPrice(c)));
    }
  }

  return { revenueByCourseId: map, imputedEnrollmentCountByCourseId };
}

async function getImputedRevenueByCourse(from, to, courseObjectIds) {
  const { revenueByCourseId } = await computeImputedRevenueByCourseWithCounts(from, to, courseObjectIds);
  return revenueByCourseId;
}

/**
 * Admin-placed list value for one student: enrollments that started in range (any status),
 * same rules as platform imputation.
 */
async function computeStudentAdminPlacedInPeriod(userLean, from, to) {
  const enrolledAt = buildEnrollmentDateMatch(from, to);
  const rows = [];
  for (const e of userLean.enrolledCourses || []) {
    if (!e.course) continue;
    const ea = e.enrolledAt;
    if (!ea || ea < enrolledAt.$gte || ea > enrolledAt.$lte) continue;
    const courseRef = e.course;
    const courseId = courseRef && courseRef._id ? courseRef._id : courseRef;
    if (!courseId) continue;
    rows.push({
      userId: userLean._id,
      courseId,
      purchasedBundles: userLean.purchasedBundles || [],
      purchasedCourses: userLean.purchasedCourses || [],
    });
  }
  if (!rows.length) {
    return { total: 0, byCourseId: {}, lines: [] };
  }

  const courseIdStrs = [...new Set(rows.map((r) => String(r.courseId)))];
  const purchases = await Purchase.find({
    user: userLean._id,
    status: 'completed',
    paymentStatus: 'completed',
    $or: [{ refundedAt: null }, { refundedAt: { $exists: false } }],
  })
    .select('user items')
    .lean();

  const { revenueByCourseId } = await computeImputedRevenueByCourseWithCounts(
    from,
    to,
    toObjectIds(courseIdStrs),
    { enrollmentRowsOverride: rows, purchasesOverride: purchases },
  );

  const lines = [];
  let total = 0;
  for (const cid of courseIdStrs) {
    const amt = revenueByCourseId.get(cid) || 0;
    if (amt <= 0) continue;
    total += amt;
    const ent = (userLean.enrolledCourses || []).find(
      (x) => String(x.course?._id || x.course) === cid,
    );
    lines.push({
      courseId: cid,
      title: ent?.course?.title || 'Course',
      amount: roundMoney(amt),
    });
  }

  const byCourseId = Object.fromEntries(
    courseIdStrs.map((cid) => [cid, roundMoney(revenueByCourseId.get(cid) || 0)]),
  );

  return { total: roundMoney(total), byCourseId, lines };
}

/**
 * Per-course unpaid list attribution for the student (all current enrollments, any date).
 * Same paid-cover rules as platform imputation; `from`/`to` are unused when overrides are set.
 */
async function computeStudentAdminPlacedListByCourse(userLean) {
  const seen = new Set();
  const rows = [];
  for (const e of userLean.enrolledCourses || []) {
    if (!e.course) continue;
    const courseRef = e.course;
    const courseId = courseRef && courseRef._id ? courseRef._id : courseRef;
    const cid = String(courseId);
    if (seen.has(cid)) continue;
    seen.add(cid);
    rows.push({
      userId: userLean._id,
      courseId,
      purchasedBundles: userLean.purchasedBundles || [],
      purchasedCourses: userLean.purchasedCourses || [],
    });
  }
  if (!rows.length) return { byCourseId: {} };

  const courseIdStrs = rows.map((r) => String(r.courseId));
  const purchases = await Purchase.find({
    user: userLean._id,
    status: 'completed',
    paymentStatus: 'completed',
    $or: [{ refundedAt: null }, { refundedAt: { $exists: false } }],
  })
    .select('user items')
    .lean();

  const { revenueByCourseId } = await computeImputedRevenueByCourseWithCounts(
    '1970-01-01',
    '2099-12-31',
    toObjectIds(courseIdStrs),
    { enrollmentRowsOverride: rows, purchasesOverride: purchases },
  );

  const byCourseId = Object.fromEntries(
    courseIdStrs.map((cid) => [cid, roundMoney(revenueByCourseId.get(cid) || 0)]),
  );
  return { byCourseId };
}

/** Course ids used to compute admin-placed revenue (scope or all enrollments in range). */
async function distinctCoursesWithEnrollmentInRange(from, to, scopeCourseIds) {
  if (Array.isArray(scopeCourseIds) && scopeCourseIds.length === 0) return [];
  if (scopeCourseIds && scopeCourseIds.length) return scopeCourseIds;
  return User.distinct('enrolledCourses.course', {
    role: 'student',
    enrolledCourses: {
      $elemMatch: {
        enrolledAt: buildEnrollmentDateMatch(from, to),
      },
    },
  });
}

async function getImputedRevenueTotalInRange(from, to, scopeCourseIds) {
  if (Array.isArray(scopeCourseIds) && scopeCourseIds.length === 0) return 0;

  const courseIds = await distinctCoursesWithEnrollmentInRange(from, to, scopeCourseIds);

  const map = await getImputedRevenueByCourse(from, to, courseIds);
  let sum = 0;
  map.forEach((v) => {
    sum += v;
  });
  return roundMoney(sum);
}

async function mergeImputedIntoTestTypeRevenue(from, to, scopeCourseIds, testTypeRevenue) {
  const out = { ...(testTypeRevenue || {}) };
  if (Array.isArray(scopeCourseIds) && scopeCourseIds.length === 0) return out;

  const courseIds = await distinctCoursesWithEnrollmentInRange(from, to, scopeCourseIds);

  const imputed = await getImputedRevenueByCourse(from, to, courseIds);
  const withAmt = [...imputed.entries()].filter(([, v]) => v > 0);
  if (!withAmt.length) return out;

  const oid = toObjectIds(withAmt.map(([k]) => k));
  const crs = await Course.find({ _id: { $in: oid } })
    .select('bundle')
    .populate('bundle', 'testType')
    .lean();

  for (const c of crs) {
    const id = String(c._id);
    const add = imputed.get(id) || 0;
    if (add <= 0) continue;
    const tt = c.bundle?.testType || 'Other';
    out[tt] = roundMoney((out[tt] || 0) + add);
  }
  return out;
}

async function getBundleWeekBreakdown(bundleId, from, to) {
  if (!mongoose.Types.ObjectId.isValid(bundleId)) return [];
  const bid = new mongoose.Types.ObjectId(bundleId);
  const courses = await Course.find({ bundle: bid })
    .populate('bundle', 'title testType')
    .sort({ order: 1, _id: 1 })
    .lean();

  const courseIds = courses.map((c) => c._id);
  if (!courseIds.length) return [];

  const enrolledAt = buildEnrollmentDateMatch(from, to);
  const dateMatch = buildPurchaseMatch(from, to);

  const [studentRows, revenueRows] = await Promise.all([
    User.aggregate([
      { $match: { role: 'student' } },
      { $unwind: '$enrolledCourses' },
      {
        $match: {
          'enrolledCourses.course': { $in: courseIds },
          'enrolledCourses.enrolledAt': enrolledAt,
        },
      },
      {
        $group: {
          _id: '$enrolledCourses.course',
          students: { $addToSet: '$_id' },
        },
      },
      {
        $project: {
          courseId: '$_id',
          studentCount: { $size: '$students' },
        },
      },
    ]),
    Purchase.aggregate([
      { $match: dateMatch },
      ...purchaseNetScalingStages(),
      { $unwind: '$items' },
      purchaseLineNetStage(),
      {
        $match: {
          'items.itemType': 'course',
          'items.item': { $in: courseIds },
        },
      },
      {
        $group: {
          _id: '$items.item',
          revenue: { $sum: '$lineNet' },
        },
      },
    ]),
  ]);

  const byStudents = Object.fromEntries(
    studentRows.map((r) => [String(r.courseId), r.studentCount]),
  );
  const byRevDirect = Object.fromEntries(revenueRows.map((r) => [String(r._id), r.revenue]));

  let totalW = 0;
  const weights = {};
  for (const c of courses) {
    const id = String(c._id);
    const w = courseCatalogListPrice(c);
    weights[id] = w > 0 ? w : 1;
    totalW += weights[id];
  }
  if (totalW <= 0) totalW = courses.length || 1;

  const bundleRevAgg = await Purchase.aggregate([
    { $match: dateMatch },
    ...purchaseNetScalingStages(),
    { $unwind: '$items' },
    purchaseLineNetStage(),
    {
      $match: {
        'items.itemType': 'bundle',
        'items.item': bid,
      },
    },
    { $group: { _id: null, total: { $sum: '$lineNet' } } },
  ]);
  const bundlePool = bundleRevAgg[0]?.total || 0;

  const allocated = {};
  for (const c of courses) {
    const id = String(c._id);
    allocated[id] = bundlePool > 0 ? (bundlePool * weights[id]) / totalW : 0;
  }

  const { revenueByCourseId: imputedMap, imputedEnrollmentCountByCourseId } =
    await computeImputedRevenueByCourseWithCounts(from, to, courseIds);

  const weeklyRows = courses.map((c) => {
    const wn = weekNumberFromCourseTitle(c.title) ?? (c.order != null ? c.order + 1 : null);
    const id = String(c._id);
    const direct = byRevDirect[id] || 0;
    const alloc = allocated[id] || 0;
    const adminPl = imputedMap.get(id) || 0;
    const rImp = roundMoney(adminPl);
    const bundleDoc = c.bundle && typeof c.bundle === 'object' ? c.bundle : null;
    const bundleTitle = bundleDoc?.title || '';
    const bundleTestType = bundleDoc?.testType || '';
    const displayTitle = formatWeeklyRowSubtitle({
      courseTitle: c.title,
      bundleTitle,
      testType: bundleTestType,
    });
    return {
      courseId: id,
      title: c.title,
      bundleTitle: bundleTitle || undefined,
      bundleTestType: bundleTestType || undefined,
      displayTitle,
      weekNumber: wn,
      studentCount: byStudents[id] || 0,
      adminPlacedEnrollmentCount: imputedEnrollmentCountByCourseId.get(id) || 0,
      courseListPrice: roundMoney(courseCatalogListPrice(c)),
      revenueDirect: roundMoney(direct),
      revenueAllocated: roundMoney(alloc),
      revenueImputed: rImp,
      revenueAdminPlaced: rImp,
      revenue: roundMoney(direct + alloc + adminPl),
    };
  });

  return weeklyRows;
}

/**
 * Course-line revenue plus this course's share of any bundle purchases for bundles that include the course.
 */
async function getPerCourseRevenueWithAllocation(from, to, courseObjectIds) {
  const ids = toObjectIds(courseObjectIds);
  if (!ids.length) return new Map();

  const match = buildPurchaseMatch(from, to);
  const directRows = await Purchase.aggregate([
    { $match: match },
    ...purchaseNetScalingStages(),
    { $unwind: '$items' },
    purchaseLineNetStage(),
    {
      $match: {
        'items.itemType': 'course',
        'items.item': { $in: ids },
      },
    },
    {
      $group: {
        _id: '$items.item',
        revenue: { $sum: '$lineNet' },
      },
    },
  ]);

  const result = new Map();
  directRows.forEach((r) => result.set(String(r._id), r.revenue || 0));

  const metas = await Course.find({ _id: { $in: ids } }).select('bundle').lean();
  const bundleIdStrs = [...new Set(metas.map((m) => String(m.bundle)).filter(Boolean))];
  if (!bundleIdStrs.length) return result;

  const bundleObjIds = toObjectIds(bundleIdStrs);
  const bundleLines = await Purchase.aggregate([
    { $match: match },
    ...purchaseNetScalingStages(),
    { $unwind: '$items' },
    purchaseLineNetStage(),
    {
      $match: {
        'items.itemType': 'bundle',
        'items.item': { $in: bundleObjIds },
      },
    },
    {
      $project: {
        bid: '$items.item',
        price: '$lineNet',
      },
    },
  ]);

  const cache = new Map();
  for (const line of bundleLines) {
    const bid = line.bid;
    const bKey = String(bid);
    let bCourses = cache.get(bKey);
    if (!bCourses) {
      bCourses = await Course.find({ bundle: bid }).select('price discountPrice').lean();
      cache.set(bKey, bCourses);
    }
    let tw = 0;
    const wMap = new Map();
    for (const c of bCourses) {
      const w = Math.max(courseCatalogListPrice(c), 0.01);
      wMap.set(String(c._id), w);
      tw += w;
    }
    if (tw <= 0) tw = bCourses.length || 1;
    const price = line.price || 0;
    for (const c of bCourses) {
      const cid = String(c._id);
      if (ids.some((i) => String(i) === cid)) {
        const share = price * (wMap.get(cid) / tw);
        result.set(cid, (result.get(cid) || 0) + share);
      }
    }
  }

  return result;
}

async function getGlobalWeeklyRevenue(from, to) {
  const match = buildPurchaseMatch(from, to);
  const rows = await Purchase.aggregate([
    { $match: match },
    ...purchaseNetScalingStages(),
    { $unwind: '$items' },
    purchaseLineNetStage(),
    {
      $group: {
        _id: {
          y: { $year: '$createdAt' },
          w: { $isoWeek: '$createdAt' },
        },
        revenue: { $sum: '$lineNet' },
      },
    },
    { $sort: { '_id.y': 1, '_id.w': 1 } },
  ]);

  return rows.map((r) => ({
    year: r._id.y,
    week: r._id.w,
    label: `${r._id.y} · W${String(r._id.w).padStart(2, '0')}`,
    revenue: roundMoney(r.revenue || 0),
  }));
}

/** Paid checkout only, by ISO week — lines matching bundle/course filter. */
async function getScopedWeeklyRevenue(from, to, bundleIds, scopeCourseIds) {
  const match = buildPurchaseMatch(from, to);
  const rows = await Purchase.aggregate([
    { $match: match },
    ...purchaseNetScalingStages(),
    { $unwind: '$items' },
    purchaseLineNetStage(),
    buildScopedLineMatchStage(bundleIds, scopeCourseIds),
    {
      $group: {
        _id: {
          y: { $year: '$createdAt' },
          w: { $isoWeek: '$createdAt' },
        },
        revenue: { $sum: '$lineNet' },
      },
    },
    { $sort: { '_id.y': 1, '_id.w': 1 } },
  ]);

  return rows.map((r) => ({
    year: r._id.y,
    week: r._id.w,
    label: `${r._id.y} · W${String(r._id.w).padStart(2, '0')}`,
    revenue: roundMoney(r.revenue || 0),
  }));
}

async function compareByCourses(from, to, courseIds, factor) {
  const ids = toObjectIds(courseIds);
  if (ids.length < 2) {
    return {
      labels: [],
      values: [],
      hint: 'Choose at least two courses in “Compare courses” (search and select multiple).',
    };
  }

  if (factor === 'revenue') {
    const [revMap, imputedMap] = await Promise.all([
      getPerCourseRevenueWithAllocation(from, to, ids),
      getImputedRevenueByCourse(from, to, ids),
    ]);
    const titles = await Course.find({ _id: { $in: ids } }).select('title').lean();
    const titleById = Object.fromEntries(titles.map((t) => [String(t._id), t.title]));
    return {
      labels: ids.map((id) => titleById[String(id)] || 'Course'),
      values: ids.map((id) =>
        roundMoney((revMap.get(String(id)) || 0) + (imputedMap.get(String(id)) || 0)),
      ),
    };
  }

  const enrolledAt = buildEnrollmentDateMatch(from, to);
  const rows = await User.aggregate([
    { $match: { role: 'student' } },
    { $unwind: '$enrolledCourses' },
    {
      $match: {
        'enrolledCourses.course': { $in: ids },
        'enrolledCourses.enrolledAt': enrolledAt,
      },
    },
    {
      $group: {
        _id: { course: '$enrolledCourses.course', student: '$_id' },
      },
    },
    {
      $group: {
        _id: '$_id.course',
        value: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'c',
      },
    },
    {
      $project: {
        _id: 1,
        value: 1,
        title: { $arrayElemAt: ['$c.title', 0] },
      },
    },
  ]);
  const map = Object.fromEntries(rows.map((r) => [String(r._id), r]));
  return {
    labels: ids.map((id) => map[String(id)]?.title || String(id)),
    values: ids.map((id) => map[String(id)]?.value || 0),
  };
}

/**
 * Compare whole bundles: paid bundle/course lines per bundle + admin-placed rollup.
 * Students = distinct learners with ≥1 enrollment (in date range, any status) in any course of that bundle.
 */
async function compareByBundles(from, to, bundleIds, factor) {
  const bIds = toObjectIds(bundleIds);
  if (bIds.length < 2) {
    return {
      labels: [],
      values: [],
      hint: 'Choose at least two bundles in “Compare bundles” (search and select multiple).',
    };
  }

  const titles = await BundleCourse.find({ _id: { $in: bIds } })
    .select('title')
    .lean();
  const titleById = Object.fromEntries(titles.map((t) => [String(t._id), t.title]));

  const coursesInBundles = await Course.find({ bundle: { $in: bIds } }).select('_id bundle').lean();
  const courseIdList = coursesInBundles.map((c) => c._id);
  const courseToBundle = new Map(coursesInBundles.map((c) => [String(c._id), String(c.bundle)]));

  if (factor === 'revenue') {
    const match = buildPurchaseMatch(from, to);
    const netStages = [...purchaseNetScalingStages(), { $unwind: '$items' }, purchaseLineNetStage()];

    const [fromBundleLines, fromCourseLines, imputedMap] = await Promise.all([
      Purchase.aggregate([
        { $match: match },
        ...netStages,
        { $match: { 'items.itemType': 'bundle', 'items.item': { $in: bIds } } },
        { $group: { _id: '$items.item', revenue: { $sum: '$lineNet' } } },
      ]),
      courseIdList.length
        ? Purchase.aggregate([
            { $match: match },
            ...netStages,
            {
              $match: {
                'items.itemType': 'course',
                'items.item': { $in: courseIdList },
              },
            },
            { $group: { _id: '$items.item', revenue: { $sum: '$lineNet' } } },
          ])
        : Promise.resolve([]),
      getImputedRevenueByCourse(from, to, courseIdList),
    ]);

    const cashByBundle = new Map();
    for (const r of fromBundleLines) {
      const id = String(r._id);
      cashByBundle.set(id, (cashByBundle.get(id) || 0) + (r.revenue || 0));
    }
    for (const r of fromCourseLines) {
      const bid = courseToBundle.get(String(r._id));
      if (!bid) continue;
      cashByBundle.set(bid, (cashByBundle.get(bid) || 0) + (r.revenue || 0));
    }

    const imputedByBundle = new Map();
    for (const bid of bIds.map(String)) {
      imputedByBundle.set(bid, 0);
    }
    for (const c of coursesInBundles) {
      const cid = String(c._id);
      const bid = String(c.bundle);
      const amt = imputedMap.get(cid) || 0;
      if (amt <= 0) continue;
      imputedByBundle.set(bid, (imputedByBundle.get(bid) || 0) + amt);
    }

    return {
      labels: bIds.map((id) => titleById[String(id)] || 'Bundle'),
      values: bIds.map((id) => {
        const s = String(id);
        return roundMoney((cashByBundle.get(s) || 0) + (imputedByBundle.get(s) || 0));
      }),
    };
  }

  const enrolledAt = buildEnrollmentDateMatch(from, to);
  if (!courseIdList.length) {
    return {
      labels: bIds.map((id) => titleById[String(id)] || 'Bundle'),
      values: bIds.map(() => 0),
    };
  }

  const rows = await User.aggregate([
    { $match: { role: 'student' } },
    { $unwind: '$enrolledCourses' },
    {
      $match: {
        'enrolledCourses.course': { $in: courseIdList },
        'enrolledCourses.enrolledAt': enrolledAt,
      },
    },
    {
      $lookup: {
        from: 'courses',
        localField: 'enrolledCourses.course',
        foreignField: '_id',
        as: 'c',
      },
    },
    { $unwind: '$c' },
    { $match: { 'c.bundle': { $in: bIds } } },
    {
      $group: {
        _id: { bundle: '$c.bundle', student: '$_id' },
      },
    },
    {
      $group: {
        _id: '$_id.bundle',
        value: { $sum: 1 },
      },
    },
  ]);
  const countMap = Object.fromEntries(rows.map((r) => [String(r._id), r.value]));

  return {
    labels: bIds.map((id) => titleById[String(id)] || 'Bundle'),
    values: bIds.map((id) => countMap[String(id)] || 0),
  };
}

async function compareByWeeks(bundleId, from, to, weekNumbers, factor) {
  const bid = toObjectIds([bundleId])[0];
  if (!bid || !weekNumbers || weekNumbers.length < 2) {
    return {
      labels: [],
      values: [],
      hint: 'Pick a bundle and enter at least two week numbers (e.g. 1, 2, 4).',
    };
  }

  const courses = await Course.find({ bundle: bid }).lean();
  const weekToCourseId = new Map();
  for (const c of courses) {
    const wn =
      weekNumberFromCourseTitle(c.title) ?? (c.order != null ? c.order + 1 : null);
    if (wn != null && weekNumbers.includes(wn) && !weekToCourseId.has(wn)) {
      weekToCourseId.set(wn, c._id);
    }
  }

  const orderedWeeks = weekNumbers.filter((w) => weekToCourseId.has(w));
  if (orderedWeeks.length < 2) {
    return {
      labels: [],
      values: [],
      hint:
        'Those week numbers were not found in this bundle (check titles like “Week 1” or course order).',
    };
  }
  const courseIds = orderedWeeks.map((w) => weekToCourseId.get(w));

  const cmp = await compareByCourses(from, to, courseIds, factor);
  return {
    labels: orderedWeeks.map((w) => `Week ${w}`),
    values: cmp.values,
  };
}

async function compareRanges(params, fromA, toA, fromB, toB) {
  if (!fromB || !toB) {
    return {
      labels: ['Range A', 'Range B'],
      totalRevenue: [0, 0],
      totalStudents: [0, 0],
      hint: 'Choose both start and end dates for range B.',
    };
  }
  const [summaryA, summaryB] = await Promise.all([
    getAnalyticsSummary({ ...params, from: fromA, to: toA }),
    getAnalyticsSummary({ ...params, from: fromB, to: toB }),
  ]);
  return {
    labels: ['Range A', 'Range B'],
    totalRevenue: [summaryA.totalRevenue, summaryB.totalRevenue],
    totalStudents: [summaryA.totalStudents, summaryB.totalStudents],
    scopedRevenue: [
      summaryA.scopedRevenue ?? summaryA.totalRevenue,
      summaryB.scopedRevenue ?? summaryB.totalRevenue,
    ],
  };
}

async function getStudentCountsByTestType(from, to, scopeCourseIds) {
  const enrolledAt = buildEnrollmentDateMatch(from, to);
  const ecMatch = {
    'enrolledCourses.enrolledAt': enrolledAt,
    ...(scopeCourseIds && scopeCourseIds.length
      ? { 'enrolledCourses.course': { $in: scopeCourseIds } }
      : {}),
  };

  const rows = await User.aggregate([
    { $match: { role: 'student' } },
    { $unwind: '$enrolledCourses' },
    { $match: ecMatch },
    {
      $lookup: {
        from: 'courses',
        localField: 'enrolledCourses.course',
        foreignField: '_id',
        as: 'c',
      },
    },
    { $unwind: '$c' },
    {
      $lookup: {
        from: 'bundlecourses',
        localField: 'c.bundle',
        foreignField: '_id',
        as: 'b',
      },
    },
    { $unwind: '$b' },
    {
      $group: {
        _id: { student: '$_id', testType: '$b.testType' },
      },
    },
    {
      $group: {
        _id: '$_id.testType',
        count: { $sum: 1 },
      },
    },
  ]);

  const out = {};
  rows.forEach((r) => {
    if (r._id) out[r._id] = r.count;
  });
  return out;
}

async function getAnalyticsSummary({ from, to, bundleIds, courseIds }) {
  const scope = await resolveScopeCourseIds(bundleIds, courseIds);

  if (scope === null) {
    const [rev, students, studentsByTestType, imputedGlobal] = await Promise.all([
      getRevenueTotals(from, to),
      getStudentMetrics(from, to, null),
      getStudentCountsByTestType(from, to, null),
      getImputedRevenueTotalInRange(from, to, null),
    ]);
    const testTypeWithImputed = await mergeImputedIntoTestTypeRevenue(
      from,
      to,
      null,
      rev.testTypeRevenue,
    );
    const platformTotal = roundMoney(rev.totalRevenue + imputedGlobal);
    const testTypeSum = roundMoney(
      Object.values(testTypeWithImputed).reduce((s, v) => s + (Number(v) || 0), 0),
    );
    const revenueTypesMatchTotal = Math.abs(testTypeSum - platformTotal) < 0.05;

    return {
      from,
      to,
      cashRevenue: rev.totalRevenue,
      imputedRevenue: imputedGlobal,
      adminPlacedRevenue: imputedGlobal,
      totalRevenue: platformTotal,
      scopedRevenue: null,
      scopedCashRevenue: null,
      testTypeRevenue: testTypeWithImputed,
      testTypeRevenueSum: testTypeSum,
      revenueTypesMatchTotal,
      courseRevenue: rev.courseRevenue,
      bundleRevenue: rev.bundleRevenue,
      totalStudents: students.totalStudents,
      studentsByCourse: students.studentsByCourse,
      studentsByTestType,
      filterActive: false,
      revenueIsScoped: false,
      platformCashRevenue: rev.totalRevenue,
      platformAdminPlacedRevenue: imputedGlobal,
      platformTotalRevenue: platformTotal,
    };
  }

  if (!scope.length) {
    const [students, studentsByTestType, platformRev, imputedGlobal] = await Promise.all([
      getStudentMetrics(from, to, scope),
      getStudentCountsByTestType(from, to, scope),
      getRevenueTotals(from, to),
      getImputedRevenueTotalInRange(from, to, null),
    ]);
    const platformTotal = roundMoney(platformRev.totalRevenue + imputedGlobal);
    return {
      from,
      to,
      cashRevenue: 0,
      imputedRevenue: 0,
      adminPlacedRevenue: 0,
      totalRevenue: 0,
      scopedRevenue: null,
      scopedCashRevenue: 0,
      testTypeRevenue: {},
      testTypeRevenueSum: 0,
      revenueTypesMatchTotal: true,
      courseRevenue: {},
      bundleRevenue: {},
      totalStudents: students.totalStudents,
      studentsByCourse: students.studentsByCourse,
      studentsByTestType,
      filterActive: true,
      revenueIsScoped: true,
      platformCashRevenue: platformRev.totalRevenue,
      platformAdminPlacedRevenue: imputedGlobal,
      platformTotalRevenue: platformTotal,
    };
  }

  const [platformRev, revScoped, students, studentsByTestType, imputedGlobal, imputedScoped] =
    await Promise.all([
      getRevenueTotals(from, to),
      getRevenueTotalsForScope(from, to, bundleIds, scope),
      getStudentMetrics(from, to, scope),
      getStudentCountsByTestType(from, to, scope),
      getImputedRevenueTotalInRange(from, to, null),
      getImputedRevenueTotalInRange(from, to, scope),
    ]);
  const testTypeWithImputed = await mergeImputedIntoTestTypeRevenue(
    from,
    to,
    scope,
    revScoped.testTypeRevenue,
  );
  const cashScoped = revScoped.totalRevenue;
  const totalScoped = roundMoney(cashScoped + imputedScoped);
  const testTypeSum = roundMoney(
    Object.values(testTypeWithImputed).reduce((s, v) => s + (Number(v) || 0), 0),
  );
  const platformTotal = roundMoney(platformRev.totalRevenue + imputedGlobal);
  const revenueTypesMatchTotal = Math.abs(testTypeSum - totalScoped) < 0.05;

  return {
    from,
    to,
    cashRevenue: cashScoped,
    imputedRevenue: imputedScoped,
    adminPlacedRevenue: imputedScoped,
    totalRevenue: totalScoped,
    scopedRevenue: null,
    scopedCashRevenue: cashScoped,
    testTypeRevenue: testTypeWithImputed,
    testTypeRevenueSum: testTypeSum,
    revenueTypesMatchTotal,
    courseRevenue: revScoped.courseRevenue,
    bundleRevenue: revScoped.bundleRevenue,
    totalStudents: students.totalStudents,
    studentsByCourse: students.studentsByCourse,
    studentsByTestType,
    filterActive: true,
    revenueIsScoped: true,
    platformCashRevenue: platformRev.totalRevenue,
    platformAdminPlacedRevenue: imputedGlobal,
    platformTotalRevenue: platformTotal,
  };
}

async function getMetaLists() {
  const [bundles, courses] = await Promise.all([
    BundleCourse.find({})
      .select('title bundleCode testType subject')
      .sort({ title: 1 })
      .lean(),
    Course.find({})
      .select('title courseCode bundle order')
      .populate('bundle', 'title testType')
      .sort({ title: 1 })
      .lean(),
  ]);
  return { bundles, courses };
}

async function searchStudents(query, limit = 20) {
  const q = (query || '').trim();
  if (!q) return [];

  const re = new RegExp(escapeRegex(q), 'i');
  const or = [
    { studentCode: new RegExp(`^${escapeRegex(q)}`, 'i') },
    { firstName: re },
    { lastName: re },
  ];

  return User.find({ role: 'student', $or: or })
    .select('firstName lastName studentCode studentEmail createdAt isActive grade')
    .limit(limit)
    .sort({ lastName: 1, firstName: 1 })
    .lean();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Student detail: reduce displayed unpaid list after attributing paid checkout (incl. bundle split). */
function unpaidAfterPaidAttributed(rawUnpaid, paidAttributed) {
  return roundMoney(Math.max(0, (Number(rawUnpaid) || 0) - (Number(paidAttributed) || 0)));
}

async function getStudentAnalyticsDetail(studentId, from, to) {
  if (!mongoose.Types.ObjectId.isValid(studentId)) return null;

  const user = await User.findById(studentId)
    .populate({
      path: 'enrolledCourses.course',
      select: 'title courseCode bundle order',
      populate: { path: 'bundle', select: 'title testType bundleCode' },
    })
    .populate({ path: 'purchasedBundles.bundle', select: 'title testType bundleCode' })
    .populate({
      path: 'purchasedCourses.course',
      select: 'title courseCode bundle',
      populate: { path: 'bundle', select: 'title testType' },
    })
    .lean();

  if (!user || user.role !== 'student') return null;

  const purchaseMatch = {
    ...buildPurchaseMatch(from, to),
    user: user._id,
  };

  const purchases = await Purchase.find(purchaseMatch)
    .sort({ createdAt: -1 })
    .populate('items.item')
    .lean();

  const enrolledAtRange = buildEnrollmentDateMatch(from, to);
  const [adminPlacedPeriod, adminPlacedList, paidByCourseInRange] = await Promise.all([
    computeStudentAdminPlacedInPeriod(user, from, to),
    computeStudentAdminPlacedListByCourse(user),
    computeStudentPaidAttributedByCourse(purchases),
  ]);

  const adminPlacedLinesInPeriodAdjusted = adminPlacedPeriod.lines
    .map((ln) => {
      const paid = roundMoney(paidByCourseInRange.get(String(ln.courseId)) || 0);
      return {
        ...ln,
        amount: unpaidAfterPaidAttributed(ln.amount, paid),
      };
    })
    .filter((ln) => ln.amount > 0);
  const adminPlacedValueInPeriodTotalAdjusted = roundMoney(
    adminPlacedLinesInPeriodAdjusted.reduce((s, ln) => s + ln.amount, 0),
  );

  const enrollments = (user.enrolledCourses || []).map((e) => {
    const c = e.course;
    const week = c && weekNumberFromCourseTitle(c.title);
    const cid = c ? String(c._id) : null;
    const ea = e.enrolledAt;
    const inPeriod = ea && ea >= enrolledAtRange.$gte && ea <= enrolledAtRange.$lte;
    const paid = cid == null ? 0 : roundMoney(paidByCourseInRange.get(cid) || 0);
    let adminPlacedValueInPeriod = null;
    if (inPeriod && cid) {
      const rawP =
        adminPlacedPeriod.byCourseId[cid] !== undefined ? adminPlacedPeriod.byCourseId[cid] : 0;
      const adj = unpaidAfterPaidAttributed(rawP, paid);
      adminPlacedValueInPeriod = adj > 0 ? adj : 0;
    }
    const rawList = cid == null ? 0 : roundMoney(adminPlacedList.byCourseId[cid] ?? 0);
    const adminPlacedListValue =
      cid == null ? null : unpaidAfterPaidAttributed(rawList, paid);
    const paidInPeriod = cid == null ? null : paid;
    return {
      courseId: cid,
      title: c?.title,
      bundleTitle: c?.bundle?.title,
      testType: c?.bundle?.testType,
      enrolledAt: e.enrolledAt,
      progress: e.progress ?? 0,
      status: e.status,
      weekNumber: week,
      contentProgressCount: Array.isArray(e.contentProgress) ? e.contentProgress.length : 0,
      completedContent: Array.isArray(e.contentProgress)
        ? e.contentProgress.filter((x) => x.completionStatus === 'completed').length
        : 0,
      adminPlacedValueInPeriod,
      adminPlacedListValue,
      paidInPeriod,
    };
  });

  const paymentLines = [];
  const ordersDetail = [];
  let sumCatalogLineList = 0;
  let showPaymentExplainer = false;
  let totalPaidLearning = 0;

  for (const p of purchases) {
    const net = computePurchaseOrderLineNets(p);
    const learningLines = (net.lines || []).filter(
      (line) => line.itemType === 'course' || line.itemType === 'bundle',
    );

    for (const line of learningLines) {
      sumCatalogLineList = roundMoney(sumCatalogLineList + line.listPrice);
      paymentLines.push({
        orderNumber: p.orderNumber,
        createdAt: p.createdAt,
        itemType: line.itemType,
        title: line.title,
        price: line.listPrice,
        listPrice: line.listPrice,
        netPaid: line.netPaid,
      });
    }

    const learningCharged = roundMoney(
      learningLines.reduce((s, line) => s + (Number(line.netPaid) || 0), 0),
    );
    totalPaidLearning = roundMoney(totalPaidLearning + learningCharged);

    if (net.itemsSum > 0) {
      if ((Number(p.discountAmount) || 0) > 0) {
        showPaymentExplainer = true;
      }
      if (net.preTotal > 0 && Math.abs(net.netScale - 1) > 0.0001) {
        showPaymentExplainer = true;
      }
    }

    if (learningLines.length === 0) {
      continue;
    }

    ordersDetail.push({
      orderNumber: p.orderNumber,
      createdAt: p.createdAt,
      status: p.status,
      paymentStatus: p.paymentStatus,
      currency: p.currency || 'EGP',
      subtotal: roundMoney(Number(p.subtotal) || 0),
      discountAmount: roundMoney(Number(p.discountAmount) || 0),
      promoCodeUsed: p.promoCodeUsed || null,
      itemsSum: net.itemsSum,
      chargedTotal: learningCharged,
      netScale: net.netScale,
      lines: learningLines,
    });
  }

  const totalPaid = totalPaidLearning;

  const adminPlacedAccess = [];
  for (const pb of user.purchasedBundles || []) {
    if (pb.status !== 'active' || !isAdminEnrollmentOrderNumber(pb.orderNumber)) continue;
    const b = pb.bundle;
    adminPlacedAccess.push({
      kind: 'bundle',
      title: b?.title || 'Bundle',
      testType: b?.testType || null,
      orderNumber: pb.orderNumber,
      purchasedAt: pb.purchasedAt,
      listPrice: roundMoney(Number(pb.price) || 0),
    });
  }
  for (const pc of user.purchasedCourses || []) {
    if (pc.status !== 'active' || !isAdminEnrollmentOrderNumber(pc.orderNumber)) continue;
    const c = pc.course;
    adminPlacedAccess.push({
      kind: 'course',
      title: c?.title || 'Course',
      bundleTitle: c?.bundle?.title || null,
      orderNumber: pc.orderNumber,
      purchasedAt: pc.purchasedAt,
      listPrice: roundMoney(Number(pc.price) || 0),
    });
  }
  adminPlacedAccess.sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));

  return {
    profile: {
      id: String(user._id),
      firstName: user.firstName,
      lastName: user.lastName,
      studentCode: user.studentCode,
      studentEmail: user.studentEmail,
      grade: user.grade,
      schoolName: user.schoolName,
      englishTeacher: user.englishTeacher,
      studentCountryCode: user.studentCountryCode,
      createdAt: user.createdAt,
      isActive: user.isActive,
    },
    enrollments,
    purchases: purchases.map((p) => {
      const netP = computePurchaseOrderLineNets(p);
      const learningTotal = roundMoney(
        (netP.lines || [])
          .filter((l) => l.itemType === 'course' || l.itemType === 'bundle')
          .reduce((s, l) => s + (Number(l.netPaid) || 0), 0),
      );
      return {
        orderNumber: p.orderNumber,
        createdAt: p.createdAt,
        total: learningTotal,
        status: p.status,
        items: (p.items || [])
          .filter((it) => it.itemType === 'course' || it.itemType === 'bundle')
          .map((it) => ({
            itemType: it.itemType,
            title: it.title,
            price: it.price,
          })),
      };
    }),
    paymentLines,
    ordersDetail,
    adminPlacedAccess,
    adminPlacedValueInPeriodTotal: adminPlacedValueInPeriodTotalAdjusted,
    adminPlacedLinesInPeriod: adminPlacedLinesInPeriodAdjusted,
    totalPaid,
    orderCount: ordersDetail.length,
    sumCatalogLineList,
    showPaymentExplainer,
  };
}

async function getExportRows(from, to, bundleIds, courseIds) {
  const scope = await resolveScopeCourseIds(bundleIds, courseIds);
  const [summary, demo, distributions, weeklyTrend] = await Promise.all([
    getAnalyticsSummary({ from, to, bundleIds, courseIds }),
    Array.isArray(scope) && scope.length === 0
      ? Promise.resolve({ grades: [], teachers: [], schools: [], countries: [] })
      : getDemographics(scope && scope.length ? scope : null),
    getAnalyticsDistributionCharts(from, to, bundleIds, courseIds),
    (async () => {
      if (scope === null) return getGlobalWeeklyRevenue(from, to);
      if (Array.isArray(scope) && scope.length === 0) return [];
      return getScopedWeeklyRevenue(from, to, bundleIds, scope);
    })(),
  ]);
  const weekly =
    bundleIds && bundleIds.length === 1
      ? await getBundleWeekBreakdown(bundleIds[0], from, to)
      : [];

  const filterParts = [];
  if (bundleIds && bundleIds.length) filterParts.push(`Bundles: ${bundleIds.length} selected`);
  if (courseIds && courseIds.length) filterParts.push(`Courses: ${courseIds.length} selected`);
  const filterDescription = filterParts.length ? filterParts.join(' · ') : 'No bundle/course filter (platform view)';

  return {
    summary,
    demographics: demo,
    weekly,
    distributions,
    weeklyTrend,
    filterDescription,
  };
}

module.exports = {
  buildPurchaseMatch,
  buildEnrollmentDateMatch,
  parseRangeEnd,
  resolveScopeCourseIds,
  getRevenueTotals,
  getStudentMetrics,
  getStudentCountsByTestType,
  getAnalyticsSummary,
  getEnrollmentPieByBundle,
  getRevenuePieByBundle,
  getRevenuePieByBundleWithImputed,
  getRevenuePieByCourseLine,
  getRevenuePieByCourseLineWithImputed,
  getAnalyticsDistributionCharts,
  getDemographics,
  getBundleWeekBreakdown,
  getGlobalWeeklyRevenue,
  getScopedWeeklyRevenue,
  getRevenueTotalsForScope,
  getPerCourseRevenueWithAllocation,
  compareByCourses,
  compareByBundles,
  compareByWeeks,
  compareRanges,
  getMetaLists,
  searchStudents,
  getStudentAnalyticsDetail,
  getExportRows,
  toObjectIds,
  computePurchaseOrderLineNets,
};
