/**
 * Parse "Week N" from course title — shared with aggregations that run in JS after queries.
 */
function weekNumberFromCourseTitle(title) {
  if (!title || typeof title !== 'string') return null;
  const m = title.match(/^\s*Week\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

module.exports = { weekNumberFromCourseTitle };
