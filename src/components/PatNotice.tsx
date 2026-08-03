import { Link } from 'react-router-dom'

// PAT 미등록 시 각 데이터 탭에서 보여주는 안내
export default function PatNotice() {
  return (
    <div className="card" style={{ padding: '30px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
      이 탭은 blog-db(private)를 읽고 씁니다 — <b style={{ color: 'var(--partial)' }}>PAT 등록이 필요</b>합니다.<br />
      <Link to="/feedback" style={{ color: 'var(--accent)' }}>피드백 탭의 PAT 설정</Link>에서 한 번 등록하면 모든 탭에 적용됩니다.
    </div>
  )
}
