function isMaster(user) {
  return user?.role === 'master';
}

function applyMasterScope(req) {
  if (!isMaster(req.user)) return;

  const studentUserId = req.user.master_student_user_id;
  const teacherUserId = req.user.master_teacher_user_id;
  if (!studentUserId && !teacherUserId) return;

  const viewMode = String(req.headers['x-master-view-mode'] || 'teacher').toLowerCase() === 'student'
    ? 'student'
    : 'teacher';
  const effectiveUserId = viewMode === 'student' ? studentUserId : teacherUserId;
  if (!effectiveUserId) return;

  req.user._scoped = true;
  req.user._viewMode = viewMode;
  req.user._effectiveUserId = effectiveUserId;
}

function isGlobalMaster(user) {
  return isMaster(user) && !user?._scoped;
}

function isScopedMaster(user) {
  return isMaster(user) && !!user?._scoped;
}

function getMasterViewMode(req) {
  return req.user._viewMode || 'teacher';
}

function getActingUserId(req) {
  if (isScopedMaster(req.user)) return req.user._effectiveUserId;
  return req.user.id;
}

/** 시연 계정(test10) — 학생 화면에서 김학생처럼 동작 */
function isActingAsStudent(req) {
  if (req.user?.role === 'student') return true;
  return isScopedMaster(req.user) && getMasterViewMode(req) === 'student';
}

/** 시연 계정(test10) — 교사 화면에서 김교사처럼 동작 */
function isActingAsTeacher(req) {
  if (req.user?.role === 'teacher') return true;
  return isScopedMaster(req.user) && getMasterViewMode(req) === 'teacher';
}

module.exports = {
  isMaster,
  isGlobalMaster,
  isScopedMaster,
  applyMasterScope,
  getActingUserId,
  getMasterViewMode,
  isActingAsStudent,
  isActingAsTeacher,
};
