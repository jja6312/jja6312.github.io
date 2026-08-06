import Locks from './Locks'

// 권한 부족 시 콘텐츠 대신 표시 — 로그인 유도. URL 직접·단축키 접근의 최종 방어선.
export default function LockedNotice({ level, authLevel, onLogin }: { level: number; authLevel: number; onLogin: () => void }) {
  return (
    <div className="card locked-card">
      <div className="locked-locks"><Locks level={level} authLevel={authLevel} /></div>
      <h2 className="locked-title">자물쇠 {level}개 권한이 필요합니다</h2>
      <p className="locked-desc">
        {`자물쇠 ${level} 비밀번호로 로그인하면 PAT 없이 열람할 수 있습니다.`}
      </p>
      <button className="submitbtn" onClick={onLogin}>로그인</button>
    </div>
  )
}
