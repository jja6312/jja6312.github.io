import { useEffect, useRef, useState } from 'react'
import { useHub } from '../store'
import { levelForPw, storePw, getStoredPw, MAX_LEVEL } from '../lib/auth'
import { getPat, setPat, getFile } from '../lib/githubDb'
import LockIcon from './LockIcon'

// 자물쇠 n개 표시
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

  const loggedIn = !!getStoredPw() || !!getPat()

  const submit = async () => {
    if (!pw.trim() || busy) return
    setBusy(true); setErr('')
    const val = pw.trim()
    // 1) 레벨1·2 비번인가
    const lv = await levelForPw(val)
    if (lv > 0) {
      storePw(val)
      setAuthLevel(Math.max(lv, getPat() ? MAX_LEVEL : 0))
      setBusy(false)
      showToast(`로그인됨 — 자물쇠 ${lv}개 항목까지 열람 가능`)
      if (authWant && lv < authWant) showToast(`단, 이 항목은 자물쇠 ${authWant}개 권한이 필요합니다`)
      closeAuth(); return
    }
    // 2) 비번이 아니면 PAT 로 시도 — blog-db 접근이 되면 유효(자물쇠 3 = 마스터)
    let ok = false
    try { await getFile(val, 'auth/verifiers.json'); ok = true } catch { ok = false }
    setBusy(false)
    if (ok) {
      setPat(val); setAuthLevel(MAX_LEVEL)
      showToast('PAT 로그인됨 — 전체(자물쇠 3개) 열람 가능')
      closeAuth()
    } else {
      setErr('비밀번호 또는 PAT 가 맞지 않습니다.')
    }
  }
  const logout = () => { storePw(''); setPat(''); setAuthLevel(0); showToast('로그아웃됨'); closeAuth() }

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
          자물쇠 비밀번호를 입력하면 그 레벨까지 열람됩니다. 자물쇠 <b>3개</b>(회의록·Announcement)는 본인 <b>PAT</b>로 열립니다 — 아래에 PAT 를 그대로 입력해도 됩니다.
        </p>
        <input ref={inputRef} className="cmdinput auth-input" type="password" placeholder="비밀번호 또는 PAT"
          value={pw} onChange={e => { setPw(e.target.value); setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') closeAuth() }} />
        {err && <div className="auth-err px">{err}</div>}
        <div className="auth-actions">
          {loggedIn && <button className="auth-ghost" onClick={logout}>로그아웃</button>}
          <button className="submitbtn" disabled={busy} onClick={submit}>{busy ? '확인 중…' : '로그인'}</button>
        </div>
      </div>
    </div>
  )
}
