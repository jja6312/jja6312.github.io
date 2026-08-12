import { useHub } from '../store'

const EMPTY_STEPS: Record<string, boolean> = {}
const EMPTY_ACTIVITY: Record<string, number> = {}

export function useVisibleLearningProgress() {
  const authLevel = useHub(state => state.authLevel)
  const ownerSteps = useHub(state => state.steps)
  const ownerCompleted = useHub(state => state.completedSheets)
  const ownerActivity = useHub(state => state.lastActivity)
  const publicProgress = useHub(state => state.publicLearningProgress)
  const canManage = authLevel === 3

  return {
    canManage,
    steps: canManage ? ownerSteps : (publicProgress?.steps ?? EMPTY_STEPS),
    completedSheets: canManage ? ownerCompleted : (publicProgress?.completedSheets ?? []),
    lastActivity: canManage ? ownerActivity : (publicProgress?.lastActivity ?? EMPTY_ACTIVITY),
    updatedAt: publicProgress?.updatedAt ?? null,
  }
}

