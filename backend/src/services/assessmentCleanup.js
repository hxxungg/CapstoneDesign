/**
 * 수행평가(assessment) 삭제 시 연관 데이터 전체 제거
 */
async function deleteParticipationLogs(conn, partIds) {
  if (!partIds.length) return;

  const [subs] = await conn.query(
    'SELECT id FROM log_db.submissions WHERE participation_id IN (?)',
    [partIds]
  );
  const subIds = subs.map((s) => s.id);

  if (subIds.length > 0) {
    await conn.query('DELETE FROM log_db.submissions_step WHERE submission_id IN (?)', [subIds]);
  }

  await conn.query('DELETE FROM log_db.submissions WHERE participation_id IN (?)', [partIds]);
  await conn.query('DELETE FROM log_db.ai_logs WHERE participation_id IN (?)', [partIds]);
  await conn.query('DELETE FROM log_db.url_logs WHERE participation_id IN (?)', [partIds]);
  await conn.query('DELETE FROM log_db.step_compliance_scores WHERE participation_id IN (?)', [partIds]);
  await conn.query('DELETE FROM teacher_db.evaluations WHERE participation_id IN (?)', [partIds]);
}

async function deleteAssessmentCascade(conn, assessmentId) {
  const [parts] = await conn.query(
    'SELECT id FROM student_db.participations WHERE assessment_id = ?',
    [assessmentId]
  );
  const partIds = parts.map((p) => p.id);

  await deleteParticipationLogs(conn, partIds);

  if (partIds.length > 0) {
    await conn.query('DELETE FROM student_db.participations WHERE assessment_id = ?', [assessmentId]);
  }

  await conn.query('DELETE FROM teacher_db.assessment_steps WHERE assessment_id = ?', [assessmentId]);
  await conn.query('DELETE FROM teacher_db.assessments WHERE id = ?', [assessmentId]);
}

module.exports = {
  deleteParticipationLogs,
  deleteAssessmentCascade,
};
