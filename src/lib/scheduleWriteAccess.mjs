// 일정관리의 쓰기 권한은 원격(PAT)과 자물쇠 3의 로컬 관리자 모드를 구분한다.
// 정적 사이트에 쓰기 토큰을 넣지 않으므로, PAT 없는 변경은 이 브라우저에만 보관한다.
export function canWriteSchedule({ hasPat, authLevel, hasSnapshot }) {
  return Boolean(hasPat) || (authLevel === 3 && hasSnapshot)
}
