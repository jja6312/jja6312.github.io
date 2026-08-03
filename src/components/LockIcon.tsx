// PAT 게이팅 항목 표시용 자물쇠 — 잠금(닫힘)/해제(열림) 두 상태. 색은 CSS var 상속.
export default function LockIcon({ open = false, size = 11 }: { open?: boolean; size?: number }) {
  return (
    <svg className="lock-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      {open
        ? <path d="M8 11V7a4 4 0 0 1 7.5-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        : <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}
