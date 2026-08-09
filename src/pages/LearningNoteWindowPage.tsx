import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import LearningNoteModal from '../components/LearningNoteModal'
import { useHub } from '../store'

export default function LearningNoteWindowPage() {
  const [params, setParams] = useSearchParams()
  const sheetId = params.get('sheet') || ''
  const sheetTitle = params.get('title') || '학습 메모'
  const requestedNoteId = params.get('note') || undefined
  const comments = useHub(state => state.comments)
  const saveLearningNote = useHub(state => state.saveLearningNote)
  const showToast = useHub(state => state.showToast)

  const note = useMemo(() => {
    const notes = comments
      .filter(comment => comment.kind === 'note' && comment.sheet === sheetId)
      .sort((a, b) => Date.parse(b.updated || b.created) - Date.parse(a.updated || a.created))
    return notes.find(comment => comment.id === requestedNoteId) ?? notes[0]
  }, [comments, requestedNoteId, sheetId])

  useEffect(() => {
    document.title = `${sheetTitle} · 학습 메모`
  }, [sheetTitle])

  if (!sheetId) {
    return <main className="learning-note-invalid">학습지 정보가 없어 메모장을 열 수 없습니다.</main>
  }

  return (
    <LearningNoteModal
      sheetTitle={sheetTitle}
      initialText={note?.text ?? ''}
      onClose={() => window.close()}
      onSave={text => {
        try {
          const noteId = saveLearningNote(sheetId, sheetTitle, text, note?.id)
          if (params.get('note') !== noteId) {
            const next = new URLSearchParams(params)
            next.set('note', noteId)
            setParams(next, { replace: true })
          }
          window.opener?.postMessage({ type: 'learning-note-saved', sheet: sheetId, noteId }, window.location.origin)
          showToast('학습 메모를 댓글에 저장했습니다.')
        } catch (error) {
          showToast('메모 저장 공간이 부족합니다. 큰 이미지를 줄인 뒤 다시 저장해주세요.')
          throw error
        }
      }}
    />
  )
}
