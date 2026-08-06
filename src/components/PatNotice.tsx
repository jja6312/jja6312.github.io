import { Link } from 'react-router-dom'

// PAT 없이는 원격 조회·쓰기를 제공할 수 없는 공개 탭의 안내
export default function PatNotice() {
  return (
    <div className="card" style={{ padding: '30px 24px', textAlign: 'center', fontSize: 14.5, color: 'var(--text-dim)' }}>
      이 탭의 원격 조회·등록에는 <b style={{ color: 'var(--partial)' }}>PAT가 필요</b>합니다.<br />
      <Link to="/feedback" style={{ color: 'var(--accent)' }}>피드백 탭의 PAT 설정</Link>에서 등록할 수 있습니다. 잠금 데이터 열람은 PAT 없이 가능합니다.
    </div>
  )
}
