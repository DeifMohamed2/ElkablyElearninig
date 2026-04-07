const PDFDocument = require('pdfkit');

const MARGIN = 48;
const PAGE_BOTTOM = 780;

function ensureSpace(doc, dy = 60) {
  if (doc.y + dy > PAGE_BOTTOM) {
    doc.addPage();
    doc.y = MARGIN;
  }
}

function writeBanner(doc, title, metaLines) {
  doc.y = MARGIN;
  doc.fontSize(18).fillColor('#b80101').text(title || 'Elkably Analytics', { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#555555');
  (metaLines || []).forEach((line) => {
    doc.text(line, { width: 500 });
    doc.moveDown(0.15);
  });
  doc.moveDown(0.6);
  doc.fillColor('#333333');
}

function sectionTitle(doc, text) {
  ensureSpace(doc, 40);
  doc.fontSize(11).fillColor('#b80101').text(text, { underline: true });
  doc.moveDown(0.35);
  doc.fillColor('#222222');
}

function keyValueLines(doc, rows) {
  doc.fontSize(9);
  for (const row of rows || []) {
    ensureSpace(doc, 16);
    doc.fillColor('#000000').text(`${row.label}: `, { continued: true, width: 500 });
    doc.fillColor('#333333').text(String(row.value), { width: 380 });
  }
  doc.moveDown(0.5);
}

function textTable(doc, headers, rows, maxRows = 45) {
  doc.fontSize(8).fillColor('#333333');
  const head = (headers || []).join('  ·  ');
  ensureSpace(doc, 20);
  doc.font('Helvetica-Bold').text(head, { width: 500 });
  doc.font('Helvetica');
  doc.moveDown(0.25);
  const slice = (rows || []).slice(0, maxRows);
  for (const cells of slice) {
    ensureSpace(doc, 14);
    doc.text((cells || []).map((c) => String(c ?? '')).join('  ·  '), { width: 500 });
  }
  if ((rows || []).length > maxRows) {
    doc.moveDown(0.2);
    doc.fillColor('#888888').fontSize(7).text(`… and ${rows.length - maxRows} more row(s) (see Excel for full data).`, {
      width: 500,
    });
    doc.fillColor('#333333').fontSize(8);
  }
  doc.moveDown(0.5);
}

/**
 * Legacy compact summary + optional weekly bundle rows.
 */
function buildAnalyticsPdf(data) {
  return buildDashboardAnalyticsPdf({
    title: data.title || 'Elkably Analytics',
    metaLines: [`Period: ${data.from} → ${data.to}`],
    summaryRows: data.summaryRows || [],
    weeklyBundleRows: data.weeklyRows || [],
    weeklyTrendRows: null,
    distributionNotes: null,
  });
}

function buildDashboardAnalyticsPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const meta = [`Period: ${data.from} → ${data.to}`];
    if (data.filterDescription) meta.push(data.filterDescription);
    meta.push(`Generated: ${new Date().toISOString().slice(0, 19)}Z`);

    writeBanner(doc, data.title || 'Analytics — Dashboard', meta);

    sectionTitle(doc, 'Executive summary');
    keyValueLines(doc, data.summaryRows || []);

    if (data.testTypeRows && data.testTypeRows.length) {
      sectionTitle(doc, 'Revenue by test type');
      textTable(doc, ['Test type', 'Revenue (EGP)'], data.testTypeRows);
    }

    if (data.weeklyTrendRows && data.weeklyTrendRows.length) {
      sectionTitle(doc, 'Paid checkout by calendar week');
      textTable(doc, ['Week', 'Revenue (EGP)'], data.weeklyTrendRows);
    }

    if (data.topBundlesRows && data.topBundlesRows.length) {
      sectionTitle(doc, 'Students by bundle (top)');
      textTable(doc, ['Bundle', 'Students'], data.topBundlesRows);
    }

    if (data.topBundleRevRows && data.topBundleRevRows.length) {
      sectionTitle(doc, 'Revenue by bundle (top)');
      textTable(doc, ['Bundle', 'Revenue (EGP)'], data.topBundleRevRows);
    }

    if (data.topCourseRevRows && data.topCourseRevRows.length) {
      sectionTitle(doc, 'Revenue by course (top)');
      textTable(doc, ['Course', 'Revenue (EGP)'], data.topCourseRevRows);
    }

    if (data.weeklyBundleRows && data.weeklyBundleRows.length) {
      sectionTitle(doc, 'Weekly bundle breakdown (per course / week)');
      const rows = data.weeklyBundleRows.map((w) => [
        w.weekNumber != null ? `W${w.weekNumber}` : '—',
        (w.displayTitle || w.title || '').slice(0, 55),
        String(w.studentCount ?? 0),
        String(w.revenue ?? 0),
      ]);
      textTable(doc, ['Wk', 'Course', 'Enrolled', 'Revenue'], rows, 35);
    }

    if (data.footerNote) {
      ensureSpace(doc, 30);
      doc.fontSize(8).fillColor('#666666').text(data.footerNote, { width: 500 });
    }

    doc.end();
  });
}

function buildCompareAnalyticsPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const meta = [
      `Period: ${data.from} → ${data.to}`,
      `Mode: ${data.compare} · Factor: ${data.factor}`,
      `Generated: ${new Date().toISOString().slice(0, 19)}Z`,
    ];
    writeBanner(doc, 'Analytics — Compare', meta);

    if (data.hint) {
      doc.fontSize(9).fillColor('#b45309').text(`Note: ${data.hint}`, { width: 500 });
      doc.moveDown(0.6);
      doc.fillColor('#333333');
    }

    const labels = data.labels || [];
    if (data.factor === 'both') {
      const rev = data.valuesRevenue || [];
      const stu = data.valuesStudents || [];
      const rows = labels.map((lb, i) => [lb, String(rev[i] ?? ''), String(stu[i] ?? '')]);
      sectionTitle(doc, 'Comparison (revenue & students)');
      textTable(doc, ['Label', 'Revenue', 'Students'], rows, 50);
    } else {
      const vals = data.values || [];
      const rows = labels.map((lb, i) => [lb, String(vals[i] ?? '')]);
      sectionTitle(doc, `Comparison (${data.factor})`);
      textTable(doc, ['Label', data.factor === 'students' ? 'Students' : 'Revenue (EGP)'], rows, 50);
    }

    if (data.rangeNote) {
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor('#666666').text(data.rangeNote, { width: 500 });
    }

    doc.end();
  });
}

function buildWeeklyBundleAnalyticsPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const meta = [
      `Bundle: ${data.bundleTitle || data.bundleId}`,
      `Period: ${data.from} → ${data.to}`,
      `Generated: ${new Date().toISOString().slice(0, 19)}Z`,
    ];
    writeBanner(doc, 'Analytics — Weekly breakdown', meta);

    sectionTitle(doc, 'Totals');
    keyValueLines(doc, data.totalsRows || []);

    sectionTitle(doc, 'Per week / course');
    const rows = (data.rows || []).map((w) => [
      w.weekNumber != null ? `W${w.weekNumber}` : '—',
      (w.displayTitle || w.title || '').slice(0, 50),
      String(w.studentCount ?? 0),
      String(w.revenueDirect ?? 0),
      String(w.revenueAllocated ?? 0),
      String(w.revenueAdminPlaced ?? w.revenueImputed ?? 0),
      String(w.revenue ?? 0),
    ]);
    textTable(
      doc,
      ['Wk', 'Course', 'Enr.', 'Direct', 'Bundle', 'Admin', 'Total'],
      rows,
      40,
    );

    doc.end();
  });
}

function buildStudentLogAnalyticsPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const meta = [
      data.searchQuery ? `Search: "${data.searchQuery}"` : 'Student directory sample',
      `Generated: ${new Date().toISOString().slice(0, 19)}Z`,
      `Rows: ${(data.rows || []).length}`,
    ];
    writeBanner(doc, 'Analytics — Student log', meta);

    sectionTitle(doc, 'Results');
    const rows = (data.rows || []).map((r) => [
      [r.firstName, r.lastName].filter(Boolean).join(' '),
      String(r.studentCode ?? ''),
      String(r.studentEmail ?? ''),
      String(r.grade ?? ''),
      r.isActive ? 'Active' : 'Inactive',
      r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '',
    ]);
    textTable(doc, ['Name', 'Code', 'Email', 'Grade', 'Status', 'Signed up'], rows, 60);

    doc.end();
  });
}

module.exports = {
  buildAnalyticsPdf,
  buildDashboardAnalyticsPdf,
  buildCompareAnalyticsPdf,
  buildWeeklyBundleAnalyticsPdf,
  buildStudentLogAnalyticsPdf,
};
