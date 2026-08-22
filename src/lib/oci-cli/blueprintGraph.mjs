// DAG 위상정렬 + 역순(rollback) + 조상 집합. 순수 함수. cycle 은 빌드 게이트에서 이미 거르지만
// 방어적으로 감지해 예외를 던진다.

/** @param {{id:string, dependsOn?:string[]}[]} nodes */
export function topoOrder(nodes) {
  const ids = new Set(nodes.map(n => n.id))
  const deps = new Map(nodes.map(n => [n.id, (n.dependsOn || []).filter(d => ids.has(d))]))
  const state = new Map()
  const order = []
  const visit = (id, stack) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'active') throw new Error(`blueprint DAG cycle: ${[...stack, id].join(' -> ')}`)
    state.set(id, 'active')
    for (const d of deps.get(id) || []) visit(d, [...stack, id])
    state.set(id, 'done')
    order.push(id)
  }
  for (const n of nodes) visit(n.id, [])
  return order
}

/** rollback 순서 = 생성 역순 */
export function reverseOrder(nodes) {
  return topoOrder(nodes).slice().reverse()
}

/** @returns {Map<string, Set<string>>} nodeId → 모든 조상 nodeId */
export function ancestorMap(nodes) {
  const deps = new Map(nodes.map(n => [n.id, n.dependsOn || []]))
  const cache = new Map()
  const compute = id => {
    if (cache.has(id)) return cache.get(id)
    const acc = new Set()
    for (const d of deps.get(id) || []) {
      acc.add(d)
      for (const a of compute(d)) acc.add(a)
    }
    cache.set(id, acc)
    return acc
  }
  for (const n of nodes) compute(n.id)
  return cache
}
