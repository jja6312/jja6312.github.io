interface TodoDataTransfer {
  effectAllowed: string
  dropEffect: string
  setData(format: string, data: string): void
}

export function startTodoCardDrag(dataTransfer: TodoDataTransfer | null | undefined, cardId: string): void
export function allowTodoCardDrop(dataTransfer: TodoDataTransfer | null | undefined): void
