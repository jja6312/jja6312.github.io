// 브라우저가 카드 이동을 실제 드래그 작업으로 인식하도록 payload를 명시한다.
// dragRef는 React 화면 내부의 출발 위치를, dataTransfer는 브라우저의 native DnD 계약을 담당한다.
export function startTodoCardDrag(dataTransfer, cardId) {
  if (!dataTransfer) return
  dataTransfer.effectAllowed = 'move'
  dataTransfer.setData('text/plain', cardId)
}

export function allowTodoCardDrop(dataTransfer) {
  if (dataTransfer) dataTransfer.dropEffect = 'move'
}
