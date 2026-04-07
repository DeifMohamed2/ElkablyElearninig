/**
 * adminAnalyticsService — in-memory MongoDB
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Admin = require('../models/Admin');
const BundleCourse = require('../models/BundleCourse');
const Course = require('../models/Course');
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const analytics = require('../services/adminAnalyticsService');
const { formatWeeklyRowSubtitle } = require('../utils/analyticsLabels');

let mongoServer;

async function createStudent(overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const u = new User({
    firstName: 'Al',
    lastName: 'Student',
    studentNumber: `1${suffix.padEnd(10, '0')}`.slice(0, 11),
    studentCountryCode: '+20',
    parentNumber: `2${suffix.padEnd(10, '0')}`.slice(0, 11),
    parentCountryCode: '+20',
    studentEmail: `st_${suffix}@t.com`,
    username: `u_${suffix}`,
    schoolName: 'School',
    grade: 'Year 12',
    englishTeacher: 'Mr Kably',
    password: 'password123',
    howDidYouKnow: 'test',
    isActive: true,
    isCompleteData: true,
    ...overrides,
  });
  await u.save();
  return u;
}

function billingAddress() {
  return {
    firstName: 'P',
    lastName: 'A',
    email: 'p@t.com',
    phone: '01000000000',
    address: 'x',
    city: 'c',
    state: 's',
    zipCode: '1',
    country: 'EG',
  };
}

describe('adminAnalyticsService', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  afterEach(async () => {
    await Promise.all([
      Purchase.deleteMany({}),
      User.deleteMany({}),
      Course.deleteMany({}),
      BundleCourse.deleteMany({}),
      Admin.deleteMany({}),
    ]);
  });

  it('sums course vs bundle line revenue; weekly course revenue excludes bundle lines', async () => {
    const admin = await Admin.create({
      userName: 'adm',
      phoneNumber: '+201111111111',
      email: 'a@a.com',
      password: 'password123',
    });

    const bundle = await BundleCourse.create({
      title: 'SAT Pack',
      subject: 'Advanced',
      testType: 'SAT',
      courseType: 'online',
      price: 5000,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week 1 — Algebra',
      price: 500,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    const c2 = await Course.create({
      title: 'Week 2 — Geometry',
      price: 500,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 1,
    });

    bundle.courses = [c1._id, c2._id];
    await bundle.save();

    const student = await createStudent();
    const from = '2026-01-01';
    const to = '2026-12-31';
    const mid = new Date('2026-06-15');

    student.enrolledCourses = [
      { course: c1._id, enrolledAt: mid, progress: 10 },
      { course: c2._id, enrolledAt: mid, progress: 5 },
    ];
    await student.save();

    const purchase = await Purchase.create({
      user: student._id,
      items: [
        {
          itemType: 'bundle',
          item: bundle._id,
          itemTypeModel: 'BundleCourse',
          title: bundle.title,
          price: 1000,
          quantity: 1,
        },
        {
          itemType: 'course',
          item: c1._id,
          itemTypeModel: 'Course',
          title: c1.title,
          price: 200,
          quantity: 1,
        },
      ],
      subtotal: 1200,
      total: 1200,
      status: 'completed',
      paymentStatus: 'completed',
      billingAddress: billingAddress(),
      createdAt: mid,
    });

    student.purchasedBundles = [
      {
        bundle: bundle._id,
        purchasedAt: mid,
        price: 1000,
        orderNumber: purchase.orderNumber,
        status: 'active',
      },
    ];
    await student.save();

    const totals = await analytics.getRevenueTotals(from, to);
    expect(totals.totalRevenue).toBe(1200);
    expect(totals.courseRevenue[String(c1._id)].revenue).toBe(200);
    expect(totals.testTypeRevenue.SAT).toBe(1200);

    const metrics = await analytics.getStudentMetrics(from, to, null);
    expect(metrics.totalStudents).toBe(1);

    const summary = await analytics.getAnalyticsSummary({
      from,
      to,
      bundleIds: [],
      courseIds: [],
    });
    expect(summary.studentsByTestType.SAT).toBe(1);

    const weekly = await analytics.getBundleWeekBreakdown(String(bundle._id), from, to);
    const w1 = weekly.find((w) => w.weekNumber === 1);
    expect(w1.studentCount).toBe(1);
    expect(w1.revenueDirect).toBe(200);
    expect(w1.revenueAllocated).toBe(500);
    expect(w1.revenue).toBe(700);

    const w2 = weekly.find((w) => w.weekNumber === 2);
    expect(w2.studentCount).toBe(1);
    expect(w2.revenueDirect).toBe(0);
    expect(w2.revenueAllocated).toBe(500);
    expect(w2.revenue).toBe(500);

    expect(w1.bundleTitle).toBe('SAT Pack');
    expect(w1.bundleTestType).toBe('SAT');
    expect(w1.displayTitle).toBe(
      formatWeeklyRowSubtitle({
        courseTitle: c1.title,
        bundleTitle: bundle.title,
        testType: bundle.testType,
      }),
    );
    expect(w2.displayTitle).toBe(
      formatWeeklyRowSubtitle({
        courseTitle: c2.title,
        bundleTitle: bundle.title,
        testType: bundle.testType,
      }),
    );
  });

  it('counts distinct students in enrollment date range only', async () => {
    const admin = await Admin.create({
      userName: 'adm2',
      phoneNumber: '+201111111112',
      email: 'a2@a.com',
      password: 'password123',
    });

    const bundle = await BundleCourse.create({
      title: 'EST Pack',
      subject: 'Basics',
      testType: 'EST',
      courseType: 'online',
      price: 3000,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week 1',
      price: 100,
      bundle: bundle._id,
      createdBy: admin._id,
    });
    bundle.courses = [c1._id];
    await bundle.save();

    const s1 = await createStudent({ studentEmail: 'e1@t.com', username: 'u1x' });
    const s2 = await createStudent({ studentEmail: 'e2@t.com', username: 'u2x' });

    s1.enrolledCourses = [{ course: c1._id, enrolledAt: new Date('2026-03-01') }];
    s2.enrolledCourses = [{ course: c1._id, enrolledAt: new Date('2025-01-01') }];
    await s1.save();
    await s2.save();

    const m = await analytics.getStudentMetrics('2026-01-01', '2026-12-31', null);
    expect(m.totalStudents).toBe(1);
  });

  it('weekly breakdown counts completed enrollments in the date range', async () => {
    const admin = await Admin.create({
      userName: 'adm2b',
      phoneNumber: '+201111111119',
      email: 'a2b@a.com',
      password: 'password123',
    });

    const bundle = await BundleCourse.create({
      title: 'Status Pack',
      subject: 'Basics',
      testType: 'EST',
      courseType: 'recorded',
      price: 1000,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week 1',
      price: 100,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    bundle.courses = [c1._id];
    await bundle.save();

    const student = await createStudent();
    const mid = new Date('2026-03-15');
    student.enrolledCourses = [{ course: c1._id, enrolledAt: mid, status: 'completed', progress: 100 }];
    await student.save();

    const weekly = await analytics.getBundleWeekBreakdown(String(bundle._id), '2026-01-01', '2026-12-31');
    const w1 = weekly.find((w) => w.weekNumber === 1);
    expect(w1).toBeTruthy();
    expect(w1.studentCount).toBe(1);
  });

  it('allocates purchase revenue by net paid amount after promo (not list subtotal)', async () => {
    const admin = await Admin.create({
      userName: 'adm3',
      phoneNumber: '+201111111113',
      email: 'a3@a.com',
      password: 'password123',
    });

    const bundle = await BundleCourse.create({
      title: 'Promo Pack',
      subject: 'Advanced',
      testType: 'SAT',
      courseType: 'online',
      price: 5000,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week 1 — A',
      price: 500,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    const c2 = await Course.create({
      title: 'Week 2 — B',
      price: 500,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 1,
    });

    bundle.courses = [c1._id, c2._id];
    await bundle.save();

    const student = await createStudent();
    const from = '2026-01-01';
    const to = '2026-12-31';
    const mid = new Date('2026-06-15');

    await Purchase.create({
      user: student._id,
      items: [
        {
          itemType: 'bundle',
          item: bundle._id,
          itemTypeModel: 'BundleCourse',
          title: bundle.title,
          price: 1000,
          quantity: 1,
        },
        {
          itemType: 'course',
          item: c1._id,
          itemTypeModel: 'Course',
          title: c1.title,
          price: 200,
          quantity: 1,
        },
      ],
      subtotal: 1200,
      total: 900,
      status: 'completed',
      paymentStatus: 'completed',
      billingAddress: billingAddress(),
      createdAt: mid,
    });

    const totals = await analytics.getRevenueTotals(from, to);
    expect(totals.totalRevenue).toBe(900);
    expect(totals.courseRevenue[String(c1._id)].revenue).toBe(150);
    expect(totals.testTypeRevenue.SAT).toBe(900);
  });

  it('imputes current bundle list price for admin-only bundle enrollments (no purchase)', async () => {
    const admin = await Admin.create({
      userName: 'adm4',
      phoneNumber: '+201111111114',
      email: 'a4@a.com',
      password: 'password123',
    });

    const bundle = await BundleCourse.create({
      title: 'Admin Pack',
      subject: 'Basics',
      testType: 'EST',
      courseType: 'recorded',
      price: 2000,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week 1',
      price: 400,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    const c2 = await Course.create({
      title: 'Week 2',
      price: 600,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 1,
    });
    bundle.courses = [c1._id, c2._id];
    await bundle.save();

    const student = await createStudent();
    const mid = new Date('2026-06-01');
    student.enrolledCourses = [
      { course: c1._id, enrolledAt: mid, status: 'active' },
      { course: c2._id, enrolledAt: mid, status: 'active' },
    ];
    student.purchasedBundles = [
      {
        bundle: bundle._id,
        purchasedAt: mid,
        price: 2000,
        orderNumber: `ADMIN-${Date.now()}`,
        status: 'active',
      },
    ];
    await student.save();

    const from = '2026-01-01';
    const to = '2026-12-31';
    const weekly = await analytics.getBundleWeekBreakdown(String(bundle._id), from, to);
    const w1 = weekly.find((w) => w.weekNumber === 1);
    const w2 = weekly.find((w) => w.weekNumber === 2);
    expect(w1.revenueDirect).toBe(0);
    expect(w2.revenueDirect).toBe(0);
    expect(w1.revenueImputed).toBe(800);
    expect(w2.revenueImputed).toBe(1200);
    expect(w1.revenue).toBe(800);
    expect(w2.revenue).toBe(1200);

    const bundlePie = await analytics.getRevenuePieByBundleWithImputed(from, to, null);
    const row = bundlePie.find((r) => r.id === String(bundle._id));
    expect(row).toBeTruthy();
    expect(row.revenue).toBe(2000);
    expect(row.revenueImputed).toBe(2000);
    expect(row.revenueCash).toBe(0);
  });

  it('admin-placed uses Course.price, ignoring per-course discount %', async () => {
    const admin = await Admin.create({
      userName: 'adm4b',
      phoneNumber: '+201111111118',
      email: 'a4b@a.com',
      password: 'password123',
    });

    const bundle = await BundleCourse.create({
      title: 'Discount Week Pack',
      subject: 'Basics',
      testType: 'EST',
      courseType: 'recorded',
      price: 500,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week 1',
      price: 500,
      discountPrice: 6,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    bundle.courses = [c1._id];
    await bundle.save();

    const student = await createStudent();
    const mid = new Date('2026-06-01');
    student.enrolledCourses = [{ course: c1._id, enrolledAt: mid, status: 'active' }];
    await student.save();

    const from = '2026-01-01';
    const to = '2026-12-31';
    const weekly = await analytics.getBundleWeekBreakdown(String(bundle._id), from, to);
    const w1 = weekly.find((w) => w.weekNumber === 1);
    expect(w1.revenueImputed).toBe(500);
    expect(w1.courseListPrice).toBe(500);
  });

  it('admin bundle imputation uses BundleCourse.price, ignoring bundle discount %', async () => {
    const admin = await Admin.create({
      userName: 'adm4c',
      phoneNumber: '+201111111119',
      email: 'a4c@a.com',
      password: 'password123',
    });

    const bundle = await BundleCourse.create({
      title: 'Discount Bundle Pack',
      subject: 'Basics',
      testType: 'EST',
      courseType: 'recorded',
      price: 2000,
      discountPrice: 10,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week 1',
      price: 1000,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    const c2 = await Course.create({
      title: 'Week 2',
      price: 1000,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 1,
    });
    bundle.courses = [c1._id, c2._id];
    await bundle.save();

    const student = await createStudent();
    const mid = new Date('2026-06-01');
    student.enrolledCourses = [
      { course: c1._id, enrolledAt: mid, status: 'active' },
      { course: c2._id, enrolledAt: mid, status: 'active' },
    ];
    student.purchasedBundles = [
      {
        bundle: bundle._id,
        purchasedAt: mid,
        price: 2000,
        orderNumber: `ADMIN-${Date.now()}`,
        status: 'active',
      },
    ];
    await student.save();

    const from = '2026-01-01';
    const to = '2026-12-31';
    const weekly = await analytics.getBundleWeekBreakdown(String(bundle._id), from, to);
    const w1 = weekly.find((w) => w.weekNumber === 1);
    const w2 = weekly.find((w) => w.weekNumber === 2);
    expect(w1.revenueImputed).toBe(1000);
    expect(w2.revenueImputed).toBe(1000);
  });

  it('compareByBundles attributes bundle and course line cash per bundle', async () => {
    const admin = await Admin.create({
      userName: 'adm5',
      phoneNumber: '+201111111115',
      email: 'a5@a.com',
      password: 'password123',
    });

    const b1 = await BundleCourse.create({
      title: 'Compare B1',
      subject: 'Advanced',
      testType: 'SAT',
      courseType: 'online',
      price: 1000,
      createdBy: admin._id,
    });
    const b2 = await BundleCourse.create({
      title: 'Compare B2',
      subject: 'Basics',
      testType: 'EST',
      courseType: 'online',
      price: 800,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week One',
      price: 100,
      bundle: b1._id,
      createdBy: admin._id,
    });
    const c2 = await Course.create({
      title: 'Week One B',
      price: 50,
      bundle: b2._id,
      createdBy: admin._id,
    });
    b1.courses = [c1._id];
    b2.courses = [c2._id];
    await b1.save();
    await b2.save();

    const student = await createStudent();
    const mid = new Date('2026-07-01');
    await Purchase.create({
      user: student._id,
      items: [
        {
          itemType: 'bundle',
          item: b1._id,
          itemTypeModel: 'BundleCourse',
          title: b1.title,
          price: 400,
          quantity: 1,
        },
        {
          itemType: 'course',
          item: c2._id,
          itemTypeModel: 'Course',
          title: c2.title,
          price: 50,
          quantity: 1,
        },
      ],
      subtotal: 450,
      total: 450,
      status: 'completed',
      paymentStatus: 'completed',
      billingAddress: billingAddress(),
      createdAt: mid,
    });

    const from = '2026-01-01';
    const to = '2026-12-31';
    const cmp = await analytics.compareByBundles(from, to, [String(b1._id), String(b2._id)], 'revenue');
    expect(cmp.values[0]).toBe(400);
    expect(cmp.values[1]).toBe(50);
  });

  it('getStudentAnalyticsDetail: learning-only totals exclude book add-on line (internal nets still split books)', async () => {
    const admin = await Admin.create({
      userName: 'adm_stu',
      phoneNumber: '+201111111113',
      email: 'stu@a.com',
      password: 'password123',
    });
    const bundle = await BundleCourse.create({
      title: 'Basics Rec',
      subject: 'Basics',
      testType: 'SAT',
      courseType: 'online',
      price: 3600,
      createdBy: admin._id,
    });
    const c1 = await Course.create({
      title: 'Week 1',
      price: 100,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 1,
    });
    bundle.courses = [c1._id];
    await bundle.save();

    const student = await createStudent();
    const mid = new Date('2026-03-25');
    await Purchase.create({
      user: student._id,
      items: [
        {
          itemType: 'bundle',
          item: bundle._id,
          itemTypeModel: 'BundleCourse',
          title: bundle.title,
          price: 3600,
          quantity: 1,
        },
      ],
      subtotal: 3900,
      total: 3900,
      discountAmount: 0,
      booksSubtotal: 300,
      status: 'completed',
      paymentStatus: 'completed',
      billingAddress: billingAddress(),
      createdAt: mid,
    });

    const from = '2026-01-01';
    const to = '2026-12-31';
    const detail = await analytics.getStudentAnalyticsDetail(String(student._id), from, to);
    expect(detail).toBeTruthy();
    expect(detail.totalPaid).toBe(3600);
    expect(detail.sumCatalogLineList).toBe(3600);
    expect(detail.showPaymentExplainer).toBe(false);
    expect(detail.ordersDetail).toHaveLength(1);
    const ord = detail.ordersDetail[0];
    expect(ord.chargedTotal).toBe(3600);
    const sumNet = ord.lines.reduce((s, l) => s + l.netPaid, 0);
    expect(sumNet).toBe(3600);
    expect(ord.lines.find((l) => l.itemType === 'bundle').netPaid).toBe(3600);
    expect(ord.lines.some((l) => l.itemType === 'books')).toBe(false);
    expect(ord.booksSubtotal).toBeUndefined();

    const p = await Purchase.findOne({ user: student._id }).lean();
    const net = analytics.computePurchaseOrderLineNets(p);
    expect(net.lines.find((l) => l.itemType === 'books').netPaid).toBe(300);
  });

  it('getStudentAnalyticsDetail: paidInPeriod splits bundle net across courses by list price', async () => {
    const admin = await Admin.create({
      userName: 'adm_stu_split',
      phoneNumber: '+201111111124',
      email: 'stusplit@a.com',
      password: 'password123',
    });
    const bundle = await BundleCourse.create({
      title: 'Split Pack',
      subject: 'Basics',
      testType: 'SAT',
      courseType: 'online',
      price: 900,
      createdBy: admin._id,
    });
    const c1 = await Course.create({
      title: 'Week 1',
      price: 100,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    const c2 = await Course.create({
      title: 'Week 2',
      price: 300,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 1,
    });
    bundle.courses = [c1._id, c2._id];
    await bundle.save();

    const student = await createStudent();
    student.enrolledCourses = [
      { course: c1._id, enrolledAt: new Date('2026-04-01'), status: 'active', progress: 0 },
      { course: c2._id, enrolledAt: new Date('2026-04-01'), status: 'active', progress: 0 },
    ];
    await student.save();

    const mid = new Date('2026-05-01');
    await Purchase.create({
      user: student._id,
      items: [
        {
          itemType: 'bundle',
          item: bundle._id,
          itemTypeModel: 'BundleCourse',
          title: bundle.title,
          price: 400,
          quantity: 1,
        },
      ],
      subtotal: 400,
      total: 400,
      status: 'completed',
      paymentStatus: 'completed',
      billingAddress: billingAddress(),
      createdAt: mid,
    });

    const from = '2026-01-01';
    const to = '2026-12-31';
    const detail = await analytics.getStudentAnalyticsDetail(String(student._id), from, to);
    const e1 = detail.enrollments.find((e) => e.courseId === String(c1._id));
    const e2 = detail.enrollments.find((e) => e.courseId === String(c2._id));
    expect(e1.paidInPeriod).toBe(100);
    expect(e2.paidInPeriod).toBe(300);
    expect(e1.adminPlacedListValue).toBe(0);
    expect(e2.adminPlacedListValue).toBe(0);
    expect(e1.adminPlacedValueInPeriod).toBe(0);
    expect(e2.adminPlacedValueInPeriod).toBe(0);
  });

  it('getStudentAnalyticsDetail: adminPlacedListValue applies outside enrollment date range', async () => {
    const admin = await Admin.create({
      userName: 'adm_stu2',
      phoneNumber: '+201111111120',
      email: 'stu2@a.com',
      password: 'password123',
    });
    const bundle = await BundleCourse.create({
      title: 'List Col Pack',
      subject: 'Basics',
      testType: 'SAT',
      courseType: 'online',
      price: 800,
      createdBy: admin._id,
    });
    const c1 = await Course.create({
      title: 'Week 1',
      price: 250,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    bundle.courses = [c1._id];
    await bundle.save();

    const student = await createStudent();
    student.enrolledCourses = [
      { course: c1._id, enrolledAt: new Date('2024-06-01'), status: 'completed' },
    ];
    await student.save();

    const detail = await analytics.getStudentAnalyticsDetail(
      String(student._id),
      '2026-01-01',
      '2026-12-31',
    );
    expect(detail).toBeTruthy();
    const row = detail.enrollments.find((e) => e.courseId === String(c1._id));
    expect(row).toBeTruthy();
    expect(row.adminPlacedValueInPeriod).toBeNull();
    expect(row.adminPlacedListValue).toBe(250);
  });

  it('admin list: course line on purchase covers only that week, not whole bundle', async () => {
    const admin = await Admin.create({
      userName: 'adm_cover1',
      phoneNumber: '+201111111121',
      email: 'cov1@a.com',
      password: 'password123',
    });
    const bundle = await BundleCourse.create({
      title: 'A la carte bundle',
      subject: 'Basics',
      testType: 'EST',
      courseType: 'online',
      price: 2000,
      createdBy: admin._id,
    });
    const c1 = await Course.create({
      title: 'Week 1',
      price: 300,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    const c2 = await Course.create({
      title: 'Week 2',
      price: 500,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 1,
    });
    bundle.courses = [c1._id, c2._id];
    await bundle.save();

    const student = await createStudent();
    const mid = new Date('2026-06-01');
    student.enrolledCourses = [
      { course: c1._id, enrolledAt: mid, status: 'active' },
      { course: c2._id, enrolledAt: mid, status: 'active' },
    ];
    await student.save();

    await Purchase.create({
      user: student._id,
      items: [
        {
          itemType: 'course',
          item: c2._id,
          itemTypeModel: 'Course',
          title: c2.title,
          price: 500,
          quantity: 1,
        },
      ],
      subtotal: 500,
      total: 500,
      status: 'completed',
      paymentStatus: 'completed',
      billingAddress: billingAddress(),
      createdAt: mid,
    });

    const detail = await analytics.getStudentAnalyticsDetail(
      String(student._id),
      '2026-01-01',
      '2026-12-31',
    );
    const r1 = detail.enrollments.find((e) => e.courseId === String(c1._id));
    const r2 = detail.enrollments.find((e) => e.courseId === String(c2._id));
    expect(r1.adminPlacedListValue).toBe(300);
    expect(r2.adminPlacedListValue).toBe(0);
  });

  it('admin list: non-admin purchasedBundles covers all courses in bundle without purchase items', async () => {
    const admin = await Admin.create({
      userName: 'adm_cover2',
      phoneNumber: '+201111111122',
      email: 'cov2@a.com',
      password: 'password123',
    });
    const bundle = await BundleCourse.create({
      title: 'Full bundle access',
      subject: 'Basics',
      testType: 'SAT',
      courseType: 'online',
      price: 1500,
      createdBy: admin._id,
    });
    const c1 = await Course.create({
      title: 'Week 1',
      price: 400,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 0,
    });
    const c2 = await Course.create({
      title: 'Week 2',
      price: 600,
      bundle: bundle._id,
      createdBy: admin._id,
      order: 1,
    });
    bundle.courses = [c1._id, c2._id];
    await bundle.save();

    const student = await createStudent();
    const mid = new Date('2026-06-15');
    student.enrolledCourses = [
      { course: c1._id, enrolledAt: mid, status: 'active' },
      { course: c2._id, enrolledAt: mid, status: 'active' },
    ];
    student.purchasedBundles = [
      {
        bundle: bundle._id,
        purchasedAt: mid,
        price: 1500,
        orderNumber: 'ORD-999001-001',
        status: 'active',
      },
    ];
    await student.save();

    const detail = await analytics.getStudentAnalyticsDetail(
      String(student._id),
      '2026-01-01',
      '2026-12-31',
    );
    const r1 = detail.enrollments.find((e) => e.courseId === String(c1._id));
    const r2 = detail.enrollments.find((e) => e.courseId === String(c2._id));
    expect(r1.adminPlacedListValue).toBe(0);
    expect(r2.adminPlacedListValue).toBe(0);
  });

  it('bundle/course filter scopes summary, distributions, and weekly paid trend', async () => {
    const admin = await Admin.create({
      userName: 'adm_scope',
      phoneNumber: '+201111111123',
      email: 'scope@a.com',
      password: 'password123',
    });

    const b1 = await BundleCourse.create({
      title: 'Scope Bundle A',
      subject: 'Advanced',
      testType: 'SAT',
      courseType: 'online',
      price: 1000,
      createdBy: admin._id,
    });
    const b2 = await BundleCourse.create({
      title: 'Scope Bundle B',
      subject: 'Basics',
      testType: 'EST',
      courseType: 'online',
      price: 800,
      createdBy: admin._id,
    });

    const c1 = await Course.create({
      title: 'Week 1 A',
      price: 100,
      bundle: b1._id,
      createdBy: admin._id,
      order: 0,
    });
    const c2 = await Course.create({
      title: 'Week 1 B',
      price: 50,
      bundle: b2._id,
      createdBy: admin._id,
      order: 0,
    });
    b1.courses = [c1._id];
    b2.courses = [c2._id];
    await b1.save();
    await b2.save();

    const student = await createStudent();
    const mid = new Date('2026-08-10T12:00:00Z');
    await Purchase.create({
      user: student._id,
      items: [
        {
          itemType: 'bundle',
          item: b1._id,
          itemTypeModel: 'BundleCourse',
          title: b1.title,
          price: 500,
          quantity: 1,
        },
      ],
      subtotal: 500,
      total: 500,
      status: 'completed',
      paymentStatus: 'completed',
      billingAddress: billingAddress(),
      createdAt: mid,
    });
    await Purchase.create({
      user: student._id,
      items: [
        {
          itemType: 'bundle',
          item: b2._id,
          itemTypeModel: 'BundleCourse',
          title: b2.title,
          price: 300,
          quantity: 1,
        },
      ],
      subtotal: 300,
      total: 300,
      status: 'completed',
      paymentStatus: 'completed',
      billingAddress: billingAddress(),
      createdAt: mid,
    });

    const from = '2026-01-01';
    const to = '2026-12-31';

    const allSummary = await analytics.getAnalyticsSummary({
      from,
      to,
      bundleIds: [],
      courseIds: [],
    });
    expect(allSummary.revenueIsScoped).toBe(false);
    expect(allSummary.cashRevenue).toBe(800);
    expect(allSummary.totalRevenue).toBe(allSummary.cashRevenue);

    const scopedSummary = await analytics.getAnalyticsSummary({
      from,
      to,
      bundleIds: [String(b1._id)],
      courseIds: [],
    });
    expect(scopedSummary.revenueIsScoped).toBe(true);
    expect(scopedSummary.cashRevenue).toBe(500);
    expect(scopedSummary.totalRevenue).toBe(500);
    expect(scopedSummary.testTypeRevenue.SAT).toBe(500);
    expect(scopedSummary.testTypeRevenue.EST).toBeUndefined();
    expect(scopedSummary.platformCashRevenue).toBe(800);
    expect(scopedSummary.platformTotalRevenue).toBe(800);

    const scope = await analytics.resolveScopeCourseIds([String(b1._id)], []);
    const scopedTotals = await analytics.getRevenueTotalsForScope(from, to, [String(b1._id)], scope);
    expect(scopedTotals.totalRevenue).toBe(500);

    const dist = await analytics.getAnalyticsDistributionCharts(from, to, [String(b1._id)], []);
    expect(dist.revenueByBundle.length).toBe(1);
    expect(dist.revenueByBundle[0].id).toBe(String(b1._id));
    expect(dist.revenueByBundle[0].revenueCash).toBe(500);

    const trend = await analytics.getScopedWeeklyRevenue(from, to, [String(b1._id)], scope);
    const trendSum = trend.reduce((s, p) => s + p.revenue, 0);
    expect(trendSum).toBe(500);
  });
});
