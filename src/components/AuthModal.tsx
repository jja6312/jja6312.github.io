import { useEffect, useRef, useState } from 'react'
import { useHub } from '../store'
import { levelForPw, storePw, getStoredPw, MAX_LEVEL } from '../lib/auth'
import { getPat } from '../lib/githubDb'
import LockIcon from './LockIcon'

// 자물쇠 n개(닫힘) 표시
function Locks({ n }: { n: number }) {
  return <span className="lockrow">{Array.from({ length: n }).map((_, i) => <LockIcon key={i} size={13} />)}</span>
}

export default function AuthModal() {
  const { authModalOpen, authWant, closeAuth, authLevel, setAuthLevel, showToast } = useHub()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (authModalOpen) { setPw(''); setErr(''); setBusy(false); setTimeout(() => inputRef.current?.focus(), 10) }
  }, [authModalOpen])
  if (!authModalOpen) return null

  const hasPat = !!getPat()
  const hasPw = !!getStoredPw()

  const submit = async () => {
    if (!pw.trim() || busy) return
    setBusy(true); setErr('')
    const lv = await levelForPw(pw.trim())
    setBusy(false)
    if (lv === 0) { setErr('비밀번호가 맞지 않습니다.'); return }
    storePw(pw.trim())
    setAuthLevel(Math.max(lv, hasPat ? MAX_LEVEL : 0))
    showToast(`로그인됨 — 자물쇠 ${lv}개 항목까지 열람 가능`)
    if (authWant && lv < authWant) showToast(`단, 이 항목은 자물쇠 ${authWant}개 권한이 필요합니다`)
    closeAuth()
  }
  const logout = () => { storePw(''); setAuthLevel(hasPat ? MAX_LEVEL : 0); showToast('로그아웃됨'); closeAuth() }

  return (
    <div className="palette" onClick={closeAuth}>
      <div className="auth-box" onClick={e => e.stopPropagation()}>
        <div className="auth-hd">
          <b>로그인</b>
          <span className="auth-cur px">현재 레벨 {authLevel}{authLevel > 0 && <> <Locks n={authLevel} /></>}</span>
        </div>
        {authWant > 0 && (
          <div className="auth-want">
            <Locks n={authWant} /> <span>이 항목은 자물쇠 <b>{authWant}개</b> 권한이 필요합니다.</span>
          </div>
        )}
        <p className="auth-desc">
          자물쇠 비밀번호를 입력하면 그 레벨까지 열람됩니다. 자물쇠 <b>3개</b>(회의록·Announcement)는 본인 <b>PAT</b>로만 열립니다.
        </p>
        <input ref={inputRef} className="cmdinput auth-input" type="password" placeholder="비밀번호"
          value={pw} onChange={e => { setPw(e.target.value); setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') closeAuth() }} />
        {err && <div className="auth-err px">{err}</div>}
        <div className="auth-actions">
          {hasPw && <button className="auth-ghost" onClick={logout}>로그아웃</button>}
          <button className="submitbtn" disabled={busy} onClick={submit}>{busy ? '확인 중…' : '로그인'}</button>
        </div>
      </div>
    </div>
  )
}
