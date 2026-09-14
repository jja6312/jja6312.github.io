const LOOKUP_COLLECTION_PATHS: Record<string, readonly string[]> = {
  // Announcements LIST는 일반적인 { data: [...] }가 아니라
  // { data: { items: [...], user-statuses: [...] } }를 반환한다.
  announcement: ['data', 'items'],
}

export function dynamicLookupItemIterator(target?: string): string {
  const path = LOOKUP_COLLECTION_PATHS[target ?? ''] ?? ['data']
  return `.${path.map(segment => `[${JSON.stringify(segment)}]`).join('')}[]?`
}
