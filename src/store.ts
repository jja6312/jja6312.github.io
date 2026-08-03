import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Comment, Verdict } from './types'

export const xpNeeded = (level: number) => Math.round(100 * Math.pow(level, 1.5))

interface HubState {
  theme: 'dark' | 'light'
  xp: number
  level: number
  totalXp: number
  streak: number
  steps: Record<string, boolean>          // sheet:step → done
  results: Record<string, Verdict>        // sheet:scenario → verdict
  answers: Record<string, string>         // sheet:scenario → 제출 답안
  comments: Comment[]
  completedSheets: string[]
  lastActivity: Record<string, number>    // sheet → 마지막 학습 시각 (ALL 탭 정렬 기준)
  sidebarCollapsed: boolean               // 학습지 좌측 메뉴 접힘 (영속)
  // UI (비영속)
  toast: string | null
  levelFx: number
  cmtOpen: boolean
  helpOpen: boolean
  paletteOpen: boolean
  cmtTarget: string

  toggleTheme: () => void
  addXP: (n: number) => void
  showToast: (msg: string) => void
  markStep: (sheet: string, step: string) => void
  setResult: (sheet: string, scenario: string, verdict: Verdict, submitted: string) => void
  completeSheet: (sheet: string) => void
  addComment: (anchor: string, text: string) => void
  setCmtOpen: (v: boolean) => void
  setHelpOpen: (v: boolean) => void
  setPaletteOpen: (v: boolean) => void
  setCmtTarget: (v: string) => void
  toggleSidebar: () => void
}

export const useHub = create<HubState>()(
  persist(
    (set, get) => ({
      theme: (localStorage.getItem('hub-theme') as 'dark' | 'light') || 'dark',
      xp: 0, level: 1, totalXp: 0, streak: 1,
      steps: {}, results: {}, answers: {}, comments: [], completedSheets: [],
      lastActivity: {},
      sidebarCollapsed: false,
      toast: null, levelFx: 0, cmtOpen: false, helpOpen: false, paletteOpen: false, cmtTarget: '전체',

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        document.documentElement.dataset.theme = next
        localStorage.setItem('hub-theme', next)
        set({ theme: next })
      },

      addXP: (n) => {
        let { xp, level, levelFx } = get()
        xp += n
        let req = xpNeeded(level)
        while (xp >= req) { xp -= req; level++; levelFx++; req = xpNeeded(level) }
        set({ xp, level, levelFx, totalXp: get().totalXp + n })
        get().showToast(`+${n} XP`)
      },

      showToast: (msg) => {
        set({ toast: msg })
        setTimeout(() => { if (get().toast === msg) set({ toast: null }) }, 1500)
      },

      markStep: (sheet, step) => {
        const key = `${sheet}:${step}`
        if (get().steps[key]) return
        set({
          steps: { ...get().steps, [key]: true },
          lastActivity: { ...get().lastActivity, [sheet]: Date.now() },
        })
      },

      setResult: (sheet, scenario, verdict, submitted) => {
        const key = `${sheet}:${scenario}`
        if (get().results[key]) return
        set({
          results: { ...get().results, [key]: verdict },
          answers: { ...get().answers, [key]: submitted },
          lastActivity: { ...get().lastActivity, [sheet]: Date.now() },
        })
        get().markStep(sheet, scenario)
      },

      completeSheet: (sheet) => {
        if (get().completedSheets.includes(sheet)) return
        set({ completedSheets: [...get().completedSheets, sheet] })
      },

      addComment: (anchor, text) => {
        const c: Comment = {
          id: `cmt-${Date.now()}`,
          anchor, text,
          created: new Date().toISOString(),
        }
        set({ comments: [...get().comments, c], cmtOpen: true })
        get().addXP(5)
      },

      setCmtOpen: (v) => set({ cmtOpen: v }),
      setHelpOpen: (v) => set({ helpOpen: v }),
      setPaletteOpen: (v) => set({ paletteOpen: v }),
      setCmtTarget: (v) => set({ cmtTarget: v }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
    }),
    {
      name: 'hub-state-v1',
      partialize: (s) => ({
        xp: s.xp, level: s.level, totalXp: s.totalXp, streak: s.streak,
        steps: s.steps, results: s.results, answers: s.answers,
        comments: s.comments, completedSheets: s.completedSheets,
        lastActivity: s.lastActivity, sidebarCollapsed: s.sidebarCollapsed,
      }),
    },
  ),
)
