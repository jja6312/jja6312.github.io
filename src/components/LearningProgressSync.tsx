import { useEffect, useMemo, useRef, useState } from 'react'
import { getPat } from '../lib/githubDb'
import {
  loadPublicLearningProgress,
  makeLearningProgressSnapshot,
  publishLearningProgress,
} from '../lib/learningProgressDb'
import { useHub } from '../store'

export default function LearningProgressSync() {
  const authReady = useHub(state => state.authReady)
  const authLevel = useHub(state => state.authLevel)
  const steps = useHub(state => state.steps)
  const completedSheets = useHub(state => state.completedSheets)
  const lastActivity = useHub(state => state.lastActivity)
  const xp = useHub(state => state.xp)
  const level = useHub(state => state.level)
  const totalXp = useHub(state => state.totalXp)
  const streak = useHub(state => state.streak)
  const setPublic = useHub(state => state.setPublicLearningProgress)
  const mergeProgress = useHub(state => state.mergeLearningProgress)
  const setSync = useHub(state => state.setLearningProgressSync)
  const loaded = useRef(false)
  const [patVersion, setPatVersion] = useState(0)

  const fingerprint = useMemo(() => JSON.stringify({ steps, completedSheets, lastActivity }), [steps, completedSheets, lastActivity])

  useEffect(() => {
    if (!authReady) return
    let alive = true
    setSync('loading')
    loadPublicLearningProgress()
      .then(snapshot => {
        if (!alive) return
        setPublic(snapshot)
        if (authLevel === 3) mergeProgress(snapshot)
        loaded.current = true
        setSync(authLevel === 3 ? (getPat() ? 'synced' : 'local') : 'public')
      })
      .catch(error => {
        if (!alive) return
        loaded.current = true
        setSync('error', error instanceof Error ? error.message : '공개 진도를 불러오지 못했습니다')
      })
    return () => { alive = false }
  }, [authReady, authLevel, mergeProgress, setPublic, setSync])

  useEffect(() => {
    if (!loaded.current || authLevel !== 3) return
    const pat = getPat()
    if (!pat) {
      setSync('local')
      return
    }
    const timer = window.setTimeout(() => {
      const snapshot = makeLearningProgressSnapshot({ steps, completedSheets, lastActivity, xp, level, totalXp, streak })
      setSync('saving')
      publishLearningProgress(pat, snapshot)
        .then(() => {
          setPublic(snapshot)
          setSync('synced')
        })
        .catch(error => setSync('error', error instanceof Error ? error.message : '공개 진도를 저장하지 못했습니다'))
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [fingerprint, patVersion, authLevel, steps, completedSheets, lastActivity, xp, level, totalXp, streak, setPublic, setSync])

  useEffect(() => {
    const handlePat = () => {
      if (authLevel === 3) {
        setSync(getPat() ? 'saving' : 'local')
        setPatVersion(value => value + 1)
      }
    }
    window.addEventListener('hub-pat-changed', handlePat)
    return () => window.removeEventListener('hub-pat-changed', handlePat)
  }, [authLevel, setSync])

  return null
}
