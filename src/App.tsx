import { useEffect, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Header from './components/Header'
import { Toast, LevelFx, HelpOverlay } from './components/Overlays'
import CommandPalette from './components/CommandPalette'
import AuthModal from './components/AuthModal'
import { currentLevel } from './lib/auth'
import LearningHome from './pages/LearningHome'
import SheetPage from './pages/SheetPage'
import ReviewPage from './pages/ReviewPage'
import FeedbackPage from './pages/FeedbackPage'
import KnowledgePage from './pages/KnowledgePage'
import SchedulePage from './pages/SchedulePage'
import ProfilePage from './pages/ProfilePage'
import { useHub } from './store'

const STEP_IDS = ['c1', 'c2', 'c3', 's1', 's2', 's3', 's4', 's5']

function Hotkeys() {
  const nav = useNavigate()
  const gPending = useRef(false)
  const stepIdx = useRef(-1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useHub.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); s.setPaletteOpen(!s.paletteOpen); return
      }
      // target 이 Element 가 아닐 수 있음(window 등) — matches 가 없으면 입력창이 아니라고 본다
      const target = e.target as HTMLElement | null
      if (target?.matches?.('input,textarea,select')) return
      if (s.paletteOpen) return

      if (gPending.current) {
        gPending.current = false
        // g 시퀀스 = 탭 이동 (탭 하나당 하나씩, 헤더 순서와 동일)
        if (e.key === 'l') nav('/learning')
        else if (e.key === 'r') nav('/learning/review')
        else if (e.key === 'f') nav('/feedback')
        else if (e.key === 'k') nav('/knowledge')
        else if (e.key === 's') nav('/knowledge/troubleshooting')
        else if (e.key === 'a') nav('/knowledge/announcements')
        else if (e.key === 'c') nav('/knowledge/oci-cli')
        else if (e.key === 't') nav('/knowledge/terraform')
        else if (e.key === 'q') nav('/knowledge/quote')
        else if (e.key === 'm') nav('/knowledge/meetings')   // 회의록 = 지식모음 하위
        else if (e.key === 'd') nav('/schedule/todo')  // t 는 Terraform 이 가져감 → Do(일정관리)
        else if (e.key === 'p') nav('/profile')
        // 메뉴바 순서 g1~g5 (학습·복습·지식모음·일정관리·프로필)
        else if (e.key === '1') nav('/learning')
        else if (e.key === '2') nav('/learning/review')
        else if (e.key === '3') nav('/knowledge')
        else if (e.key === '4') nav('/schedule/calendar')
        else if (e.key === '5') nav('/profile')
        return
      }
      if (e.key === 'g') { gPending.current = true; setTimeout(() => { gPending.current = false }, 800); return }
      if (e.key === 'd') s.toggleTheme()
      else if (e.key === 'c') s.setCmtOpen(!s.cmtOpen)
      else if (e.key === '?') s.setHelpOpen(!s.helpOpen)
      else if (e.key === 'Escape') { s.setHelpOpen(false); s.setPaletteOpen(false) }
      else if (e.key === 'j' || e.key === 'k') {
        stepIdx.current = Math.max(0, Math.min(STEP_IDS.length - 1, stepIdx.current + (e.key === 'j' ? 1 : -1)))
        document.getElementById(STEP_IDS[stepIdx.current])?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])
  return null
}

function Shell() {
  const cmtOpen = useHub(s => s.cmtOpen)
  const setAuthLevel = useHub(s => s.setAuthLevel)
  useEffect(() => {
    document.body.classList.toggle('cmt-open', cmtOpen)
  }, [cmtOpen])

  const uiScale = useHub(s => s.uiScale)
  useEffect(() => {
    // 화면 배율 — Chromium/Safari 지원 zoom. 1이면 제거
    ;(document.documentElement.style as unknown as { zoom: string }).zoom = uiScale === 1 ? '' : String(uiScale)
  }, [uiScale])
  // 앱 로드 시 저장된 비번/PAT 로 현재 권한 레벨 계산
  useEffect(() => { currentLevel().then(setAuthLevel) }, [setAuthLevel])

  return (
    <>
      <Hotkeys />
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/learning" replace />} />
        <Route path="/learning" element={<LearningHome />} />
        <Route path="/learning/review" element={<ReviewPage />} />
        <Route path="/learning/:section" element={<LearningHome />} />
        <Route path="/learning/:curriculumId/:sheetId" element={<SheetPage />} />
        <Route path="/review" element={<Navigate to="/learning/review" replace />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/knowledge/:section" element={<KnowledgePage />} />
        {/* 구 경로 호환 */}
        <Route path="/troubleshooting" element={<Navigate to="/knowledge/troubleshooting" replace />} />
        <Route path="/announcements" element={<Navigate to="/knowledge/announcements" replace />} />
        <Route path="/meetings" element={<Navigate to="/knowledge/meetings" replace />} />
        <Route path="/schedule" element={<Navigate to="/schedule/calendar" replace />} />
        <Route path="/schedule/:view" element={<SchedulePage />} />
        {/* 구 경로 호환 */}
        <Route path="/todo" element={<Navigate to="/schedule/todo" replace />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/learning" replace />} />
      </Routes>
      <Toast />
      <LevelFx />
      <HelpOverlay />
      <CommandPalette />
      <AuthModal />
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
