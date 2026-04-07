const { isStudent, safeFlash } = require('./auth');
const { resolveStudentFromMobileAuthHeader } = require('./studentMobileAuth');
const { asStudentRequest } = require('../utils/asStudentRequest');

/**
 * Web: existing cookie session + sessionToken check (isStudent).
 * No web session: accept same Bearer JWT as /api/student/* so mobile can POST /zoom/student/zoom/:id/join.
 */
const isStudentOrMobileZoom = async (req, res, next) => {
  const hasWebStudent = !!(
    req.session &&
    req.session.user &&
    req.session.user.role === 'student'
  );

  if (hasWebStudent) {
    return isStudent(req, res, next);
  }

  const resolved = await resolveStudentFromMobileAuthHeader(req);
  if (resolved) {
    req.studentMobileUserForZoom = resolved.user;
    return next();
  }

  safeFlash(req, 'error_msg', 'Unauthorized: Students only');
  return res.redirect('/auth/login');
};

function dispatchJoinZoomMeeting(joinZoomMeeting) {
  return async (req, res, next) => {
    try {
      if (req.studentMobileUserForZoom) {
        const fakeReq = asStudentRequest(req, req.studentMobileUserForZoom);
        await joinZoomMeeting(fakeReq, res);
        return;
      }
      await joinZoomMeeting(req, res);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  isStudentOrMobileZoom,
  dispatchJoinZoomMeeting,
};
