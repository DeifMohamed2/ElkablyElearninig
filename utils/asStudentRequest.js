/**
 * Wraps the Express request so studentController handlers see req.session.user
 * as the JWT-identified student, without persisting a browser session.
 */
function asStudentRequest(req, userDoc) {
  const sessionUser = {
    id: userDoc._id,
    role: 'student',
    sessionToken: userDoc.sessionToken,
    isCompleteData: userDoc.isCompleteData,
    name: userDoc.name,
    firstName: userDoc.firstName,
    lastName: userDoc.lastName,
    studentEmail: userDoc.studentEmail,
    username: userDoc.username,
    grade: userDoc.grade,
    schoolName: userDoc.schoolName,
    studentCode: userDoc.studentCode,
    studentNumber: userDoc.studentNumber,
    studentCountryCode: userDoc.studentCountryCode,
    parentNumber: userDoc.parentNumber,
    parentCountryCode: userDoc.parentCountryCode,
    englishTeacher: userDoc.englishTeacher,
    isActive: userDoc.isActive,
    preferences: userDoc.preferences
      ? { ...userDoc.preferences }
      : {},
  };

  const extra = {};
  const baseSession = req.session || {};

  const session = new Proxy(baseSession, {
    get(target, prop) {
      if (prop === 'user') return sessionUser;
      if (Object.prototype.hasOwnProperty.call(extra, prop)) return extra[prop];
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      extra[prop] = value;
      return true;
    },
  });

  return new Proxy(req, {
    get(target, prop) {
      if (prop === 'session') return session;
      if (prop === 'flash') return target.flash || (() => {});
      return Reflect.get(target, prop);
    },
  });
}

function wrapStudentHandler(handler) {
  return async (req, res, next) => {
    try {
      const fakeReq = asStudentRequest(req, req.studentMobileUser);
      fakeReq.headers = {
        ...req.headers,
        accept: req.headers.accept || 'application/json',
      };
      await handler(fakeReq, res, next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { asStudentRequest, wrapStudentHandler };
