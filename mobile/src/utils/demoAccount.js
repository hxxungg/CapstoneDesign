/** 시연용 계정 — master_view 연결(김교사/김학생 전환) */
export function isDemoAccount(user) {
  return user?.role === 'master' && !!user?.master_view;
}

/** 전역 조회용 master@master.com 등 */
export function isGlobalMaster(user) {
  return user?.role === 'master' && !user?.master_view;
}
