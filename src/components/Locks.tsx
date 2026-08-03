import LockIcon from './LockIcon'

// 자물쇠 항상 표시 — level 개수만큼. authLevel 이 충분하면 열린 자물쇠(권한 있어도 자물쇠는 보인다).
export default function Locks({ level, authLevel }: { level: number; authLevel: number }) {
  if (!level) return null
  const unlocked = authLevel >= level
  return (
    <span className={`lockmark${unlocked ? ' unlocked' : ''}`}
      title={unlocked ? `자물쇠 ${level} — 열람 가능` : `자물쇠 ${level} — 권한 필요`}>
      {Array.from({ length: level }).map((_, i) => <LockIcon key={i} open={unlocked} />)}
    </span>
  )
}
