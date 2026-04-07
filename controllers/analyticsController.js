const crypto = require('crypto');
const ExcelJS = require('exceljs');
const cache = require('../utils/cache');
const {
  buildDashboardAnalyticsPdf,
  buildCompareAnalyticsPdf,
  buildWeeklyBundleAnalyticsPdf,
  buildStudentLogAnalyticsPdf,
} = require('../utils/analyticsPdf');
const {
  styleTableHeaderRow,
  insertSheetBanner,
  safeFilenamePart,
  workbookProvenance,
} = require('../utils/analyticsExport');
const analytics = require('../services/adminAnalyticsService');

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function parseIds(val) {
  if (val == null || val === '') return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr
    .flatMap((item) => {
      if (item == null || item === '') return [];
      return String(item).split(',');
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseWeeks(val) {
  const raw = Array.isArray(val) ? val : val != null && val !== '' ? [val] : [];
  const expanded = raw.flatMap((v) => String(v).split(/[\s,]+/)).filter(Boolean);
  return expanded.map((w) => parseInt(w, 10)).filter((n) => !Number.isNaN(n));
}

function cacheKey(prefix, parts) {
  const h = crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 20);
  return `${prefix}_${h}`;
}

function shouldBypassCache(req) {
  return req.query.nocache === '1' || req.query.nocache === 'true';
}

async function withCache(req, key, ttlSec, fn) {
  if (shouldBypassCache(req)) return fn();
  return cache.getOrSet(key, fn, ttlSec);
}

const getAnalyticsPage = async (req, res) => {
  try {
    const { from, to } = defaultDateRange();
    const meta = await analytics.getMetaLists();
    return res.render('admin/analytics', {
      title: 'Admin Analytics',
      currentPage: 'analytics',
      theme: req.cookies.theme || 'light',
      user: req.user,
      cacheBuster: Date.now(),
      pageCSS: 'dashboard',
      additionalCSS: [
        'https://cdn.jsdelivr.net/npm/tom-select@2.3.1/dist/css/tom-select.bootstrap5.min.css',
        '/css/adminCSS/analytics.css',
      ],
      initialFrom: from,
      initialTo: to,
      bundlesJson: JSON.stringify(
        meta.bundles.map((b) => ({
          id: String(b._id),
          title: b.title,
          bundleCode: b.bundleCode,
          testType: b.testType,
        })),
      ),
      coursesJson: JSON.stringify(
        meta.courses.map((c) => ({
          id: String(c._id),
          title: c.title,
          courseCode: c.courseCode,
          bundleId: c.bundle ? String(c.bundle._id || c.bundle) : null,
          bundleTitle: c.bundle && c.bundle.title ? c.bundle.title : '',
        })),
      ),
    });
  } catch (err) {
    console.error('getAnalyticsPage', err);
    req.flash('error', 'Could not load analytics page');
    return res.redirect('/admin/dashboard');
  }
};

const getAnalyticsSummaryApi = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleIds = parseIds(req.query.bundleIds);
    const courseIds = parseIds(req.query.courseIds);
    const key = cacheKey('analytics_summary', { from, to, bundleIds, courseIds });
    const data = await withCache(req, key, 60, () =>
      analytics.getAnalyticsSummary({ from, to, bundleIds, courseIds }),
    );
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getAnalyticsSummaryApi', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalyticsDistributionsApi = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleIds = parseIds(req.query.bundleIds);
    const courseIds = parseIds(req.query.courseIds);
    const key = cacheKey('analytics_dist', { from, to, bundleIds, courseIds });
    const data = await withCache(req, key, 60, () =>
      analytics.getAnalyticsDistributionCharts(from, to, bundleIds, courseIds),
    );
    return res.json({ success: true, data });
  } catch (err) {
    console.error('getAnalyticsDistributionsApi', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalyticsCompareApi = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const compare = req.query.compare || 'courses';
    const rawFactor = String(req.query.factor || 'revenue').toLowerCase();
    const factor =
      rawFactor === 'students' ? 'students' : rawFactor === 'both' ? 'both' : 'revenue';
    const bundleIds = parseIds(req.query.bundleIds);
    const courseIds = parseIds(req.query.courseIds);
    const compareCourseIds = parseIds(req.query.compareCourseIds);
    const compareBundleIds = parseIds(req.query.compareBundleIds);
    const weekBundleId = req.query.weekBundleId;
    const weeks = parseWeeks(req.query.weeks);
    const fromA = req.query.fromA || from;
    const toA = req.query.toA || to;
    const fromB = req.query.fromB || from;
    const toB = req.query.toB || to;

    const key = cacheKey('analytics_cmp', {
      compare,
      factor,
      from,
      to,
      bundleIds,
      courseIds,
      compareCourseIds,
      compareBundleIds,
      weekBundleId,
      weeks,
      fromA,
      toA,
      fromB,
      toB,
    });

    const data = await withCache(req, key, 60, async () => {
      if (compare === 'ranges') {
        const r = await analytics.compareRanges(
          { bundleIds, courseIds },
          fromA,
          toA,
          fromB,
          toB,
        );
        if (factor === 'both') {
          return {
            ...r,
            valuesRevenue: r.totalRevenue,
            valuesStudents: r.totalStudents,
          };
        }
        return r;
      }

      const runSingle = async (f) => {
        if (compare === 'bundles' && compareBundleIds.length >= 2) {
          return analytics.compareByBundles(from, to, compareBundleIds, f);
        }
        if (compare === 'weeks' && weekBundleId && weeks.length >= 2) {
          return analytics.compareByWeeks(weekBundleId, from, to, weeks, f);
        }
        return analytics.compareByCourses(from, to, compareCourseIds, f);
      };

      if (factor === 'both') {
        const [rev, stu] = await Promise.all([runSingle('revenue'), runSingle('students')]);
        const labels =
          rev.labels && rev.labels.length > 0 ? rev.labels : stu.labels && stu.labels.length > 0 ? stu.labels : [];
        const revVals = rev.values || [];
        const stuVals = stu.values || [];
        const anyRev = revVals.some((x) => Number(x) > 0);
        const anyStu = stuVals.some((x) => Number(x) > 0);
        return {
          labels,
          valuesRevenue: revVals,
          valuesStudents: stuVals,
          hint:
            !anyRev && !anyStu
              ? rev.hint || stu.hint
              : undefined,
        };
      }

      return runSingle(factor);
    });

    return res.json({ success: true, data: { compare, factor, ...data } });
  } catch (err) {
    console.error('getAnalyticsCompareApi', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalyticsWeeklyApi = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleId = req.query.bundleId;
    if (!bundleId) {
      return res.status(400).json({ success: false, message: 'bundleId required' });
    }
    const key = cacheKey('analytics_weekly', { from, to, bundleId });
    const rows = await withCache(req, key, 60, () =>
      analytics.getBundleWeekBreakdown(bundleId, from, to),
    );
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const totalDirect = rows.reduce((s, r) => s + (r.revenueDirect || 0), 0);
    const totalAllocated = rows.reduce((s, r) => s + (r.revenueAllocated || 0), 0);
    const totalAdminPlaced = rows.reduce((s, r) => {
      const v = Number(r.revenueAdminPlaced ?? r.revenueImputed ?? 0);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    return res.json({
      success: true,
      data: {
        rows,
        totalRevenue,
        totalCourseRevenue: totalRevenue,
        totalDirect,
        totalAllocated,
        totalAdminPlaced,
        totalImputed: totalAdminPlaced,
      },
    });
  } catch (err) {
    console.error('getAnalyticsWeeklyApi', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalyticsDemographicsApi = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleIds = parseIds(req.query.bundleIds);
    const courseIds = parseIds(req.query.courseIds);
    const scope = await analytics.resolveScopeCourseIds(bundleIds, courseIds);
    if (Array.isArray(scope) && scope.length === 0) {
      return res.json({
        success: true,
        data: {
          grades: [],
          teachers: [],
          schools: [],
          countries: [],
          message: 'No courses match the selected bundles or courses.',
        },
      });
    }
    const scopeForDemo = scope && scope.length ? scope : null;
    const key = cacheKey('analytics_demo', { bundleIds, courseIds, all: !scopeForDemo });
    const demo = await withCache(req, key, 60, () => analytics.getDemographics(scopeForDemo));
    return res.json({
      success: true,
      data: {
        ...demo,
        scopeDescription: scopeForDemo
          ? 'Filtered by selected bundles/courses (active enrollments)'
          : 'All students with at least one active enrollment (platform-wide, not limited by the date filter above)',
      },
    });
  } catch (err) {
    console.error('getAnalyticsDemographicsApi', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalyticsWeeklyTrendApi = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleIds = parseIds(req.query.bundleIds);
    const courseIds = parseIds(req.query.courseIds);
    const scope = await analytics.resolveScopeCourseIds(bundleIds, courseIds);
    const key = cacheKey('analytics_week_trend', { from, to, bundleIds, courseIds });
    const points = await withCache(req, key, 60, async () => {
      if (scope === null) return analytics.getGlobalWeeklyRevenue(from, to);
      if (Array.isArray(scope) && scope.length === 0) return [];
      return analytics.getScopedWeeklyRevenue(from, to, bundleIds, scope);
    });
    return res.json({ success: true, data: { points } });
  } catch (err) {
    console.error('getAnalyticsWeeklyTrendApi', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalyticsStudentSearchApi = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }
    const rows = await analytics.searchStudents(q, 25);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getAnalyticsStudentSearchApi', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getAnalyticsStudentDetailApi = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const detail = await analytics.getStudentAnalyticsDetail(studentId, from, to);
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    return res.json({ success: true, data: detail });
  } catch (err) {
    console.error('getAnalyticsStudentDetailApi', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** Same computation as compare API (no cache) for exports. */
async function computeCompareExportPayload(query) {
  const { from, to } = { ...defaultDateRange(), ...query };
  const compare = query.compare || 'courses';
  const rawFactor = String(query.factor || 'revenue').toLowerCase();
  const factor =
    rawFactor === 'students' ? 'students' : rawFactor === 'both' ? 'both' : 'revenue';
  const bundleIds = parseIds(query.bundleIds);
  const courseIds = parseIds(query.courseIds);
  const compareCourseIds = parseIds(query.compareCourseIds);
  const compareBundleIds = parseIds(query.compareBundleIds);
  const weekBundleId = query.weekBundleId;
  const weeks = parseWeeks(query.weeks);
  const fromA = query.fromA || from;
  const toA = query.toA || from;
  const fromB = query.fromB || from;
  const toB = query.toB || to;

  let data;
  if (compare === 'ranges') {
    const r = await analytics.compareRanges({ bundleIds, courseIds }, fromA, toA, fromB, toB);
    data =
      factor === 'both'
        ? { ...r, valuesRevenue: r.totalRevenue, valuesStudents: r.totalStudents }
        : r;
  } else {
    const runSingle = async (f) => {
      if (compare === 'bundles' && compareBundleIds.length >= 2) {
        return analytics.compareByBundles(from, to, compareBundleIds, f);
      }
      if (compare === 'weeks' && weekBundleId && weeks.length >= 2) {
        return analytics.compareByWeeks(weekBundleId, from, to, weeks, f);
      }
      return analytics.compareByCourses(from, to, compareCourseIds, f);
    };
    if (factor === 'both') {
      const [rev, stu] = await Promise.all([runSingle('revenue'), runSingle('students')]);
      const labels =
        rev.labels && rev.labels.length > 0
          ? rev.labels
          : stu.labels && stu.labels.length > 0
            ? stu.labels
            : [];
      const revVals = rev.values || [];
      const stuVals = stu.values || [];
      const anyRev = revVals.some((x) => Number(x) > 0);
      const anyStu = stuVals.some((x) => Number(x) > 0);
      data = {
        labels,
        valuesRevenue: revVals,
        valuesStudents: stuVals,
        hint: !anyRev && !anyStu ? rev.hint || stu.hint : undefined,
      };
    } else {
      data = await runSingle(factor);
    }
  }

  return {
    from,
    to,
    fromA,
    toA,
    fromB,
    toB,
    compare,
    factor,
    bundleIds,
    courseIds,
    compareCourseIds,
    compareBundleIds,
    weekBundleId,
    weeks,
    ...data,
  };
}

const exportAnalyticsExcel = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleIds = parseIds(req.query.bundleIds);
    const courseIds = parseIds(req.query.courseIds);
    const payload = await analytics.getExportRows(from, to, bundleIds, courseIds);
    const { summary, demographics, weekly, distributions, weeklyTrend, filterDescription } = payload;

    const wb = new ExcelJS.Workbook();
    workbookProvenance(wb);

    const genLine = `Generated (UTC): ${new Date().toISOString().slice(0, 19)}Z`;
    const bannerBase = [
      'Elkably Analytics — Dashboard export',
      genLine,
      `Reporting period: ${from} → ${to}`,
      filterDescription,
    ];

    const shOverview = wb.addWorksheet('Overview', {
      views: [{ state: 'frozen', ySplit: 6 }],
    });
    insertSheetBanner(shOverview, bannerBase, 4);
    shOverview.getColumn(1).width = 22;
    shOverview.getColumn(2).width = 40;
    let r = bannerBase.length + 2;
    const overviewRows = [
      ['Report', 'Executive dashboard — revenue, enrollments, distributions'],
      ['Date range', `${from} to ${to}`],
      ['Filters', filterDescription],
      ['Sheets', 'Summary · Revenue by test type · Students by bundle · Revenue by bundle · Revenue by course · Weekly paid trend · Demographics · Bundle week detail (if one bundle filtered)'],
    ];
    overviewRows.forEach(([a, b]) => {
      shOverview.getCell(r, 1).value = a;
      shOverview.getCell(r, 1).font = { bold: true };
      shOverview.getCell(r, 2).value = b;
      r += 1;
    });

    const shSum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 6 }] });
    insertSheetBanner(shSum, bannerBase, 2);
    const hRow = bannerBase.length + 2;
    shSum.addRow(['Metric', 'Value']);
    styleTableHeaderRow(shSum.getRow(hRow));
    const sumRows = [
      {
        m: summary.revenueIsScoped
          ? 'Paid checkout (net of promo, filtered)'
          : 'Paid checkout (net of promo)',
        v: summary.cashRevenue,
      },
      {
        m: summary.revenueIsScoped
          ? 'Admin-placed revenue (filtered; list price)'
          : 'Admin-placed revenue (no paid order; list price)',
        v: summary.adminPlacedRevenue ?? summary.imputedRevenue,
      },
      {
        m: summary.revenueIsScoped ? 'Total revenue (filtered)' : 'Total revenue (platform)',
        v: summary.totalRevenue,
      },
    ];
    if (summary.revenueIsScoped && summary.platformTotalRevenue != null) {
      sumRows.push(
        { m: 'Platform paid checkout (reference)', v: summary.platformCashRevenue },
        { m: 'Platform admin-placed (reference)', v: summary.platformAdminPlacedRevenue },
        { m: 'Platform total revenue (reference)', v: summary.platformTotalRevenue },
      );
    }
    sumRows.push({ m: 'Distinct students (in range / filter)', v: summary.totalStudents });
    for (const [k, v] of Object.entries(summary.testTypeRevenue || {})) {
      sumRows.push({ m: `Revenue — test type ${k}`, v });
    }
    sumRows.forEach((row) => shSum.addRow([row.m, row.v]));
    shSum.getColumn(1).width = 36;
    shSum.getColumn(2).width = 22;

    const shTT = wb.addWorksheet('Revenue by test type', {
      views: [{ state: 'frozen', ySplit: 6 }],
    });
    insertSheetBanner(shTT, bannerBase, 2);
    const ttStart = bannerBase.length + 2;
    shTT.addRow(['Test type', 'Revenue (EGP)']);
    styleTableHeaderRow(shTT.getRow(ttStart));
    for (const [k, v] of Object.entries(summary.testTypeRevenue || {})) {
      shTT.addRow([k, v]);
    }
    shTT.getColumn(1).width = 20;
    shTT.getColumn(2).width = 18;

    const shStuB = wb.addWorksheet('Students by bundle', {
      views: [{ state: 'frozen', ySplit: 6 }],
    });
    insertSheetBanner(shStuB, bannerBase, 3);
    const sbStart = bannerBase.length + 2;
    shStuB.addRow(['Bundle', 'Students', 'Subtitle']);
    styleTableHeaderRow(shStuB.getRow(sbStart));
    (distributions.studentsByBundle || []).forEach((row) => {
      shStuB.addRow([row.label, row.count, row.subtitle || '']);
    });
    shStuB.getColumn(1).width = 40;
    shStuB.getColumn(2).width = 12;
    shStuB.getColumn(3).width = 28;

    const shRevB = wb.addWorksheet('Revenue by bundle', {
      views: [{ state: 'frozen', ySplit: 6 }],
    });
    insertSheetBanner(shRevB, bannerBase, 5);
    const rbStart = bannerBase.length + 2;
    shRevB.addRow(['Bundle', 'Total revenue', 'Paid checkout', 'Admin-placed']);
    styleTableHeaderRow(shRevB.getRow(rbStart));
    (distributions.revenueByBundle || []).forEach((row) => {
      shRevB.addRow([
        row.label,
        row.revenue,
        row.revenueCash ?? '',
        row.revenueAdminPlaced ?? row.revenueImputed ?? '',
      ]);
    });
    shRevB.getColumn(1).width = 38;
    shRevB.getColumn(2).width = 16;
    shRevB.getColumn(3).width = 16;
    shRevB.getColumn(4).width = 16;

    const shRevC = wb.addWorksheet('Revenue by course', {
      views: [{ state: 'frozen', ySplit: 6 }],
    });
    insertSheetBanner(shRevC, bannerBase, 5);
    const rcStart = bannerBase.length + 2;
    shRevC.addRow(['Course', 'Total revenue', 'Paid checkout', 'Admin-placed']);
    styleTableHeaderRow(shRevC.getRow(rcStart));
    const courses = (distributions.revenueByCourse || []).slice(0, 500);
    courses.forEach((row) => {
      shRevC.addRow([
        row.label,
        row.revenue,
        row.revenueCash ?? '',
        row.revenueAdminPlaced ?? row.revenueImputed ?? '',
      ]);
    });
    shRevC.getColumn(1).width = 44;
    shRevC.getColumn(2).width = 16;
    shRevC.getColumn(3).width = 16;
    shRevC.getColumn(4).width = 16;

    const shTrend = wb.addWorksheet('Weekly paid trend', {
      views: [{ state: 'frozen', ySplit: 6 }],
    });
    insertSheetBanner(shTrend, bannerBase, 2);
    const trStart = bannerBase.length + 2;
    shTrend.addRow(['Calendar week (ISO)', 'Paid checkout (EGP)']);
    styleTableHeaderRow(shTrend.getRow(trStart));
    (weeklyTrend || []).forEach((p) => {
      shTrend.addRow([p.label, p.revenue]);
    });
    shTrend.getColumn(1).width = 22;
    shTrend.getColumn(2).width = 22;

    const shDemo = wb.addWorksheet('Demographics', { views: [{ state: 'frozen', ySplit: 6 }] });
    insertSheetBanner(shDemo, bannerBase, 3);
    const dStart = bannerBase.length + 2;
    shDemo.addRow(['Category', 'Label', 'Count']);
    styleTableHeaderRow(shDemo.getRow(dStart));
    for (const row of demographics.grades || []) {
      shDemo.addRow(['Grade', row.label, row.count]);
    }
    for (const row of demographics.teachers || []) {
      shDemo.addRow(['Teacher', row.label, row.count]);
    }
    for (const row of demographics.schools || []) {
      shDemo.addRow(['School', row.label, row.count]);
    }
    for (const row of demographics.countries || []) {
      shDemo.addRow(['Country', row.label, row.count]);
    }
    shDemo.getColumn(1).width = 14;
    shDemo.getColumn(2).width = 28;
    shDemo.getColumn(3).width = 10;

    if (weekly && weekly.length) {
      const shWk = wb.addWorksheet('Bundle week breakdown', {
        views: [{ state: 'frozen', ySplit: 6 }],
      });
      insertSheetBanner(shWk, bannerBase, 9);
      const wStart = bannerBase.length + 2;
      shWk.addRow([
        'Week',
        'Course',
        'Full label',
        'Enrolled (period)',
        'Admin-placed enrollments',
        'Direct',
        'Bundle share',
        'Admin-placed',
        'Total',
      ]);
      styleTableHeaderRow(shWk.getRow(wStart));
      weekly.forEach((row) => {
        shWk.addRow([
          row.weekNumber ?? '',
          row.title,
          row.displayTitle ?? row.title,
          row.studentCount,
          row.adminPlacedEnrollmentCount ?? '',
          row.revenueDirect ?? 0,
          row.revenueAllocated ?? 0,
          row.revenueAdminPlaced ?? row.revenueImputed ?? 0,
          row.revenue,
        ]);
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-analytics-dashboard-${safeFilenamePart(from)}-${safeFilenamePart(to)}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportAnalyticsExcel', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

const exportAnalyticsPdf = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleIds = parseIds(req.query.bundleIds);
    const courseIds = parseIds(req.query.courseIds);
    const payload = await analytics.getExportRows(from, to, bundleIds, courseIds);
    const { summary, distributions, weeklyTrend, weekly, filterDescription } = payload;

    const summaryRows = [
      {
        label: summary.revenueIsScoped
          ? 'Paid checkout (filtered)'
          : 'Paid checkout (net of promo)',
        value: String(summary.cashRevenue),
      },
      {
        label: summary.revenueIsScoped
          ? 'Admin-placed (filtered)'
          : 'Admin-placed revenue (list price, no checkout)',
        value: String(summary.adminPlacedRevenue ?? summary.imputedRevenue),
      },
      {
        label: summary.revenueIsScoped ? 'Total revenue (filtered)' : 'Total revenue (platform)',
        value: String(summary.totalRevenue),
      },
    ];
    if (summary.revenueIsScoped && summary.platformTotalRevenue != null) {
      summaryRows.push(
        { label: 'Platform paid checkout (reference)', value: String(summary.platformCashRevenue) },
        {
          label: 'Platform admin-placed (reference)',
          value: String(summary.platformAdminPlacedRevenue),
        },
        { label: 'Platform total (reference)', value: String(summary.platformTotalRevenue) },
      );
    }
    summaryRows.push({ label: 'Students', value: String(summary.totalStudents) });

    const testTypeRows = Object.entries(summary.testTypeRevenue || {}).map(([k, v]) => [k, String(v)]);
    const topBundlesRows = (distributions.studentsByBundle || [])
      .slice(0, 15)
      .map((x) => [x.label, String(x.count)]);
    const topBundleRevRows = (distributions.revenueByBundle || [])
      .slice(0, 15)
      .map((x) => [x.label, String(x.revenue)]);
    const topCourseRevRows = (distributions.revenueByCourse || [])
      .slice(0, 20)
      .map((x) => [x.label, String(x.revenue)]);
    const trendRows = (weeklyTrend || []).map((p) => [p.label, String(p.revenue)]);

    const buf = await buildDashboardAnalyticsPdf({
      title: 'Elkably Analytics — Dashboard',
      from,
      to,
      filterDescription,
      summaryRows,
      testTypeRows,
      weeklyTrendRows: trendRows,
      topBundlesRows,
      topBundleRevRows,
      topCourseRevRows,
      weeklyBundleRows: weekly && weekly.length ? weekly : null,
      footerNote:
        'Full detail including demographics and extended course lists is available in the Excel export. Paid weekly trend excludes admin-placed (no payment date).',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-analytics-dashboard-${safeFilenamePart(from)}-${safeFilenamePart(to)}.pdf"`,
    );
    return res.send(buf);
  } catch (err) {
    console.error('exportAnalyticsPdf', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

const exportCompareExcel = async (req, res) => {
  try {
    const p = await computeCompareExportPayload(req.query);
    const wb = new ExcelJS.Workbook();
    workbookProvenance(wb);
    const banner = [
      'Elkably Analytics — Compare export',
      `Generated (UTC): ${new Date().toISOString().slice(0, 19)}Z`,
      `Primary period: ${p.from} → ${p.to}`,
      `Mode: ${p.compare} · Factor: ${p.factor}`,
    ];
    const sh = wb.addWorksheet('Compare', { views: [{ state: 'frozen', ySplit: 6 }] });
    insertSheetBanner(sh, banner, 5);
    const start = banner.length + 2;
    if (p.factor === 'both') {
      sh.addRow(['Label', 'Revenue (EGP)', 'Students']);
      styleTableHeaderRow(sh.getRow(start));
      const labels = p.labels || [];
      const rev = p.valuesRevenue || [];
      const stu = p.valuesStudents || [];
      for (let i = 0; i < labels.length; i++) {
        sh.addRow([labels[i], rev[i] ?? '', stu[i] ?? '']);
      }
      sh.getColumn(1).width = 42;
      sh.getColumn(2).width = 18;
      sh.getColumn(3).width = 14;
    } else if (p.compare === 'ranges') {
      sh.addRow(['Range', p.factor === 'students' ? 'Students' : 'Revenue (EGP)']);
      styleTableHeaderRow(sh.getRow(start));
      const labels = p.labels || ['Range A', 'Range B'];
      const vals =
        p.factor === 'students'
          ? p.totalStudents || []
          : p.totalRevenue || p.values || [];
      for (let i = 0; i < labels.length; i++) {
        sh.addRow([labels[i], vals[i] ?? '']);
      }
      sh.getColumn(1).width = 24;
      sh.getColumn(2).width = 22;
    } else {
      sh.addRow(['Label', p.factor === 'students' ? 'Students' : 'Revenue (EGP)']);
      styleTableHeaderRow(sh.getRow(start));
      const labels = p.labels || [];
      const vals = p.values || [];
      for (let i = 0; i < labels.length; i++) {
        sh.addRow([labels[i], vals[i] ?? '']);
      }
      sh.getColumn(1).width = 42;
      sh.getColumn(2).width = 22;
    }
    const shMeta = wb.addWorksheet('Parameters');
    shMeta.getCell(1, 1).value = 'Query parameters snapshot';
    shMeta.getCell(1, 1).font = { bold: true, size: 12, color: { argb: 'FFB80101' } };
    let mr = 3;
    const entries = Object.entries(req.query || {}).filter(([, v]) => v != null && v !== '');
    entries.forEach(([k, v]) => {
      shMeta.getCell(mr, 1).value = k;
      shMeta.getCell(mr, 2).value = String(v);
      mr += 1;
    });
    if (p.hint) {
      shMeta.getCell(mr + 1, 1).value = 'Note';
      shMeta.getCell(mr + 1, 2).value = p.hint;
    }
    shMeta.getColumn(1).width = 22;
    shMeta.getColumn(2).width = 56;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-analytics-compare-${safeFilenamePart(p.from)}-${safeFilenamePart(p.to)}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportCompareExcel', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};

const exportComparePdf = async (req, res) => {
  try {
    const p = await computeCompareExportPayload(req.query);
    const rangeNote =
      p.compare === 'ranges'
        ? `Range A: ${p.fromA} → ${p.toA} · Range B: ${p.fromB} → ${p.toB}`
        : undefined;
    let labels = p.labels || [];
    let values = p.values || [];
    if (p.compare === 'ranges' && p.factor !== 'both') {
      labels = labels.length ? labels : ['Range A', 'Range B'];
      values =
        p.factor === 'students'
          ? p.totalStudents || []
          : p.totalRevenue || [];
    }
    const buf = await buildCompareAnalyticsPdf({
      from: p.from,
      to: p.to,
      compare: p.compare,
      factor: p.factor,
      labels,
      values,
      valuesRevenue: p.valuesRevenue,
      valuesStudents: p.valuesStudents,
      hint: p.hint,
      rangeNote,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-analytics-compare-${safeFilenamePart(p.from)}-${safeFilenamePart(p.to)}.pdf"`,
    );
    return res.send(buf);
  } catch (err) {
    console.error('exportComparePdf', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};

const exportWeeklyExcel = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleId = req.query.bundleId;
    if (!bundleId) {
      return res.status(400).json({ success: false, message: 'bundleId is required' });
    }
    const rows = await analytics.getBundleWeekBreakdown(bundleId, from, to);
    const meta = await analytics.getMetaLists();
    const bundleDoc = meta.bundles.find((b) => String(b._id) === String(bundleId));
    const bundleTitle = bundleDoc ? bundleDoc.title : bundleId;

    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const totalDirect = rows.reduce((s, r) => s + (r.revenueDirect || 0), 0);
    const totalAllocated = rows.reduce((s, r) => s + (r.revenueAllocated || 0), 0);
    const totalAdminPlaced = rows.reduce((s, r) => {
      const v = Number(r.revenueAdminPlaced ?? r.revenueImputed ?? 0);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);

    const wb = new ExcelJS.Workbook();
    workbookProvenance(wb);
    const banner = [
      'Elkably Analytics — Weekly breakdown export',
      `Generated (UTC): ${new Date().toISOString().slice(0, 19)}Z`,
      `Bundle: ${bundleTitle}`,
      `Period: ${from} → ${to}`,
    ];
    const shT = wb.addWorksheet('Totals', { views: [{ state: 'frozen', ySplit: 6 }] });
    insertSheetBanner(shT, banner, 2);
    const tStart = banner.length + 2;
    shT.addRow(['Metric', 'Value']);
    styleTableHeaderRow(shT.getRow(tStart));
    const totals = [
      ['Total revenue (direct + bundle share + admin-placed)', totalRevenue],
      ['Direct (course checkouts)', totalDirect],
      ['Bundle pool allocation', totalAllocated],
      ['Admin-placed', totalAdminPlaced],
    ];
    totals.forEach((row) => shT.addRow(row));
    shT.getColumn(1).width = 44;
    shT.getColumn(2).width = 20;

    const sh = wb.addWorksheet('By week', { views: [{ state: 'frozen', ySplit: 6 }] });
    insertSheetBanner(sh, banner, 9);
    const start = banner.length + 2;
    sh.addRow([
      'Week',
      'Course',
      'Full label',
      'Enrolled (period)',
      'Admin-placed enrollments',
      'Direct',
      'Bundle share',
      'Admin-placed',
      'Total',
    ]);
    styleTableHeaderRow(sh.getRow(start));
    rows.forEach((row) => {
      sh.addRow([
        row.weekNumber ?? '',
        row.title,
        row.displayTitle ?? row.title,
        row.studentCount,
        row.adminPlacedEnrollmentCount ?? '',
        row.revenueDirect ?? 0,
        row.revenueAllocated ?? 0,
        row.revenueAdminPlaced ?? row.revenueImputed ?? 0,
        row.revenue,
      ]);
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-analytics-weekly-${safeFilenamePart(bundleId)}-${safeFilenamePart(from)}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportWeeklyExcel', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};

const exportWeeklyPdf = async (req, res) => {
  try {
    const { from, to } = { ...defaultDateRange(), ...req.query };
    const bundleId = req.query.bundleId;
    if (!bundleId) {
      return res.status(400).json({ success: false, message: 'bundleId is required' });
    }
    const rows = await analytics.getBundleWeekBreakdown(bundleId, from, to);
    const meta = await analytics.getMetaLists();
    const bundleDoc = meta.bundles.find((b) => String(b._id) === String(bundleId));
    const bundleTitle = bundleDoc ? bundleDoc.title : bundleId;
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const totalDirect = rows.reduce((s, r) => s + (r.revenueDirect || 0), 0);
    const totalAllocated = rows.reduce((s, r) => s + (r.revenueAllocated || 0), 0);
    const totalAdminPlaced = rows.reduce((s, r) => {
      const v = Number(r.revenueAdminPlaced ?? r.revenueImputed ?? 0);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);

    const buf = await buildWeeklyBundleAnalyticsPdf({
      bundleId,
      bundleTitle,
      from,
      to,
      totalsRows: [
        { label: 'Total revenue', value: String(totalRevenue) },
        { label: 'Direct', value: String(totalDirect) },
        { label: 'Bundle allocation', value: String(totalAllocated) },
        { label: 'Admin-placed', value: String(totalAdminPlaced) },
      ],
      rows,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-analytics-weekly-${safeFilenamePart(bundleId)}-${safeFilenamePart(from)}.pdf"`,
    );
    return res.send(buf);
  } catch (err) {
    console.error('exportWeeklyPdf', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};

const exportStudentsExcel = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter q is required (min 2 characters), same as student search.',
      });
    }
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const rows = await analytics.searchStudents(q, limit);

    const wb = new ExcelJS.Workbook();
    workbookProvenance(wb);
    const banner = [
      'Elkably Analytics — Student log export',
      `Generated (UTC): ${new Date().toISOString().slice(0, 19)}Z`,
      `Search: "${q}" · Row limit: ${limit}`,
    ];
    const sh = wb.addWorksheet('Results', { views: [{ state: 'frozen', ySplit: 6 }] });
    insertSheetBanner(sh, banner, 7);
    const start = banner.length + 2;
    sh.addRow(['Name', 'Student code', 'Email', 'Grade', 'Active', 'Signed up (date)']);
    styleTableHeaderRow(sh.getRow(start));
    rows.forEach((r) => {
      sh.addRow([
        [r.firstName, r.lastName].filter(Boolean).join(' '),
        r.studentCode,
        r.studentEmail,
        r.grade || '',
        r.isActive ? 'Yes' : 'No',
        r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '',
      ]);
    });
    sh.getColumn(1).width = 28;
    sh.getColumn(2).width = 14;
    sh.getColumn(3).width = 36;
    sh.getColumn(4).width = 14;
    sh.getColumn(5).width = 10;
    sh.getColumn(6).width = 14;

    const shNote = wb.addWorksheet('Notes');
    shNote.getCell(1, 1).value =
      'Use the same search text as on the analytics page. Open a student in the UI for orders, enrollments, and paid/admin breakdown. This export is a directory listing only.';
    shNote.getColumn(1).width = 72;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-analytics-students-${safeFilenamePart(q)}.xlsx"`,
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportStudentsExcel', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};

const exportStudentsPdf = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter q is required (min 2 characters).',
      });
    }
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
    const rows = await analytics.searchStudents(q, limit);
    const buf = await buildStudentLogAnalyticsPdf({ searchQuery: q, rows });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elkably-analytics-students-${safeFilenamePart(q)}.pdf"`,
    );
    return res.send(buf);
  } catch (err) {
    console.error('exportStudentsPdf', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAnalyticsPage,
  getAnalyticsSummaryApi,
  getAnalyticsDistributionsApi,
  getAnalyticsCompareApi,
  getAnalyticsWeeklyApi,
  getAnalyticsWeeklyTrendApi,
  getAnalyticsDemographicsApi,
  getAnalyticsStudentSearchApi,
  getAnalyticsStudentDetailApi,
  exportAnalyticsExcel,
  exportAnalyticsPdf,
  exportCompareExcel,
  exportComparePdf,
  exportWeeklyExcel,
  exportWeeklyPdf,
  exportStudentsExcel,
  exportStudentsPdf,
};
