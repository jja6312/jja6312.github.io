import { useCallback, useEffect, useRef, useState } from 'react'
import { useHub } from '../store'
import { getPat, getFile, putFile } from '../lib/githubDb'
import PatNotice from '../components/PatNotice'

interface Card { id: string; text: string; created: string; tags?: string[] }
interface Column { id: string; title: string; cards: Card[] }
interface Board { columns: Column[] }

const EMPTY: Board = {
  columns: [
    { id: 'todo', title: '할 일', cards: [] },
    { id: 'doing', title: '진행 중', cards: [] },
    { id: 'done', title: '완료', cards: [] },
  ],
}

type Sync = 'loading' | 'synced' | 'dirty' | 'saving' | 'error'
const syncLabel: Record<Sync, string> = {
  loading: '불러오는 중…', synced: '✓ 저장됨', dirty: '● 변경됨 (3초 후 commit)', saving: '↑ commit 중…', error: '⚠ 저장 실패',
}

export default function TodoPage() {
  const pat = getPat()
  const { showToast } = useHub()
  const [board, setBoard] = useState<Board>(EMPTY)
  const [sync, setSync] = useState<Sync>('loading')
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const shaRef = useRef<string | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boardRef = useRef(board)
  boardRef.current = board
  const dragRef = useRef<{ colId: string; cardId: string } | null>(null)

  useEffect(() => {
    if (!pat) return
    getFile(pat, 'todo/board.json').then(f => {
      if (f) {
        shaRef.current = f.sha
        try { setBoard(JSON.parse(f.content)) } catch { setBoard(EMPTY) }
      }
      setSync('synced')
    }).catch(() => setSync('error'))
  }, [pat])

  const save = useCallback(async () => {
    setSync('saving')
    const body = JSON.stringify(boardRef.current, null, 2) + '\n'
    try {
      shaRef.current = await putFile(pat, 'todo/board.json', body, 'todo: 보드 갱신', shaRef.current)
      setSync('synced')
    } catch {
      // sha 충돌 가능성 → 최신 sha 재취득 후 1회 재시도 (마지막 쓰기 우선)
      try {
        const f = await getFile(pat, 'todo/board.json')
        shaRef.current = await putFile(pat, 'todo/board.json', body, 'todo: 보드 갱신', f?.sha)
        setSync('synced')
      } catch {
        setSync('error'); showToast('board.json commit 실패')
      }
    }
  }, [pat, showToast])

  const markDirty = useCallback((next: Board) => {
    setBoard(next)
    setSync('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(save, 3000)   // 드래그 연타 → 3초 묶음 commit
  }, [save])

  const addCard = (colId: string) => {
    const text = (inputs[colId] || '').trim()
    if (!text) return
    const card: Card = { id: `card-${Date.now()}`, text, created: new Date().toISOString() }
    markDirty({ columns: board.columns.map(c => c.id === colId ? { ...c, cards: [...c.cards, card] } : c) })
    setInputs({ ...inputs, [colId]: '' })
  }
  const removeCard = (colId: string, cardId: string) =>
    markDirty({ columns: board.columns.map(c => c.id === colId ? { ...c, cards: c.cards.filter(x => x.id !== cardId) } : c) })

  const moveCard = (toCol: string, beforeCardId?: string) => {
    const src = dragRef.current
    if (!src) return
    dragRef.current = null
    const card = board.columns.find(c => c.id === src.colId)?.cards.find(x => x.id === src.cardId)
    if (!card || (src.colId === toCol && src.cardId === beforeCardId)) return
    const cols = board.columns.map(c => ({ ...c, cards: c.cards.filter(x => x.id !== src.cardId) }))
    const target = cols.find(c => c.id === toCol)!
    const idx = beforeCardId ? target.cards.findIndex(x => x.id === beforeCardId) : -1
    if (idx >= 0) target.cards.splice(idx, 0, card)
    else target.cards.push(card)
    markDirty({ columns: cols })
  }

  if (!pat) return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>
      <div className="crumb"><span className="px">TODO</span></div>
      <h1 className="sheet-h1">TODO</h1>
      <div style={{ height: 20 }} /><PatNotice />
    </div>
  )

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px 120px' }}>
      <div className="crumb"><span className="px">TODO</span></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 className="sheet-h1">TODO</h1>
        <span className="px" style={{
          fontSize: 10, marginLeft: 'auto',
          color: sync === 'synced' ? 'var(--accent)' : sync === 'error' ? 'var(--wrong)' : 'var(--partial)',
        }}>{syncLabel[sync]}</span>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 12.5, margin: '6px 0 20px' }}>
        카드를 드래그해서 옮기면 3초 debounce 후 blog-db <code className="mono">todo/board.json</code> 에 commit — 기기 간 동기화.
      </p>

      <div className="kanban">
        {board.columns.map(col => (
          <div key={col.id} className="kcol"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); moveCard(col.id) }}>
            <div className="kcol-hd">
              <b>{col.title}</b>
              <span className="px" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{col.cards.length}</span>
            </div>
            {col.cards.map(card => (
              <div key={card.id} className="kcard" draggable
                onDragStart={() => { dragRef.current = { colId: col.id, cardId: card.id } }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); moveCard(col.id, card.id) }}>
                <span style={{ flex: 1 }}>{card.text}</span>
                <button className="kdel" onClick={() => removeCard(col.id, card.id)} title="삭제">✕</button>
              </div>
            ))}
            <div className="kadd">
              <input className="cmdinput" style={{ fontFamily: 'Pretendard', fontSize: 12.5, padding: '8px 12px' }}
                placeholder="+ 카드 추가"
                value={inputs[col.id] || ''}
                onChange={e => setInputs({ ...inputs, [col.id]: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') addCard(col.id) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
