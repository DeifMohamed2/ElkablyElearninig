/**
 * Week badge label: prefer "Week N" from title when DB `order` is wrong or uniform.
 */
function displayWeekNumberFromCourse(course) {
  if (!course) return '';
  const t = course.title;
  if (t && typeof t === 'string') {
    const m = t.match(/^\s*Week\s*(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  if (course.order != null && course.order !== '') return course.order;
  return '';
}

/** 0-based starting week index for enrollments (matches startingOrder field semantics). */
function startingOrderFromCourseTitleOrOrder(course) {
  if (!course) return null;
  const t = course.title;
  if (t && typeof t === 'string') {
    const m = t.match(/^\s*Week\s*(\d+)/i);
    if (m) return parseInt(m[1], 10) - 1;
  }
  if (course.order !== undefined && course.order !== null) return course.order;
  return null;
}

module.exports = {
  displayWeekNumberFromCourse,
  startingOrderFromCourseTitleOrOrder,
};
