/**
 * Canonical display strings for admin analytics — keep in sync with Tom Select
 * options on the analytics page (bundles / courses).
 */

function formatBundlePickerLabel(bundle) {
  if (!bundle) return '';
  const title = (bundle.title || '').trim();
  const tt = (bundle.testType || '').trim();
  if (!title) return tt ? `(${tt})` : '';
  return tt ? `${title} (${tt})` : title;
}

function formatCoursePickerLabel(courseTitle, bundleTitle) {
  const ct = (courseTitle || '').trim();
  const bt = (bundleTitle || '').trim();
  if (!ct) return bt;
  return bt ? `${ct} — ${bt}` : ct;
}

/**
 * Weekly row subtitle: course — bundle (testType), matching picker conventions.
 */
function formatWeeklyRowSubtitle({ courseTitle, bundleTitle, testType }) {
  const ct = (courseTitle || '').trim();
  const bt = (bundleTitle || '').trim();
  const tt = (testType || '').trim();

  const coursePart = formatCoursePickerLabel(ct, bt);
  if (!coursePart) return tt ? `(${tt})` : '';
  if (!tt) return coursePart;
  return `${coursePart} (${tt})`;
}

module.exports = {
  formatBundlePickerLabel,
  formatCoursePickerLabel,
  formatWeeklyRowSubtitle,
};
