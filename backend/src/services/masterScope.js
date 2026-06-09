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

function getActingUserId(req) {
  if (isScopedMaster(req.user)) return req.user._effectiveUserId;
  return req.user.id;
}

function getMasterViewMode(req) {
  return req.user._viewMode || 'teacher';
}

module.exports = {
  isMaster,
  isGlobalMaster,
  isScopedMaster,
  applyMasterScope,
  getActingUserId,
  getMasterViewMode,
};
