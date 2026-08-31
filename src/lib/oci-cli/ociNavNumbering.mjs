// OCI CLI 좌측 nav 분류 넘버링 — 순수 유도(데이터 재생성 없음).
// 대분류 = 정본 콘솔 순서 랭크 × 100 (Compute 100 · Storage 200 … Governance 1300).
// 소분류 = 기능 그룹 10블록 (그룹 g → base = 카테고리 + g*10 + 1), 항목 = 블록 내 순번.
//   예) Compute(100): Instances 101~110[instance=101…], Dedicated 111~120[…], Custom Images 121~130.
// order(정본 카테고리 순서 배열)를 인자로 받아 순수 유지 → node 테스트 가능.

/** 카테고리 라벨 → 대분류 코드(100단위). 정본 순서에 없으면 null. */
export function ociCategoryCode(label, order) {
  const idx = order.indexOf(label)
  return idx >= 0 ? (idx + 1) * 100 : null
}

/**
 * catalog categories(각 {label, groups:[{label, resources:string[]}]}) → resourceKey→코드 Map.
 * @param {{label:string, groups:{label:string, resources:string[]}[]}[]} categories
 * @param {readonly string[]} order
 * @returns {Map<string, number>}
 */
// 그룹이 예약하는 코드 폭 — 기본 10블록. 10개를 넘는 그룹은 10 단위로 확장해
// 다음 그룹 블록과 겹치지 않게 한다(현재 카탈로그 최대 그룹=10이라 항상 10블록).
function blockWidth(size) {
  return Math.max(10, Math.ceil(size / 10) * 10)
}

export function computeResourceCodes(categories, order) {
  const codes = new Map()
  for (const category of categories ?? []) {
    const base = ociCategoryCode(category.label, order)
    if (base == null) continue
    let offset = 1
    for (const group of category.groups) {
      const blockBase = base + offset
      group.resources.forEach((resource, r) => codes.set(resource, blockBase + r))
      offset += blockWidth(group.resources.length)
    }
  }
  return codes
}

/**
 * 한 카테고리의 그룹별 10블록 범위 (그룹 헤더 표시용).
 * @returns {Map<string, {start:number, end:number}>}  group.label → 범위
 */
export function groupCodeRanges(category, order) {
  const ranges = new Map()
  const base = ociCategoryCode(category.label, order)
  if (base == null) return ranges
  let offset = 1
  for (const group of category.groups) {
    const width = blockWidth(group.resources.length)
    const start = base + offset
    ranges.set(group.label, { start, end: start + width - 1 })
    offset += width
  }
  return ranges
}

/** 코드 표시 문자열. null 이면 빈 문자열. */
export function formatNavCode(code) {
  return code == null ? '' : String(code)
}
