// RFC 8785 (JSON Canonicalization Scheme) — Node 생성기와 브라우저 엔진이 공유하는 단일 모듈.
// 객체 key 는 UTF-16 code unit 순으로 정렬, 배열 순서 보존, 문자열/숫자는 ECMAScript JSON 직렬화
// (JSON.stringify 의 문자열·숫자 규칙이 RFC 8785 와 일치). undefined key 는 제외한다.
// jq -S 로 대체하지 않는다.

export function canonicalize(value) {
  if (value === undefined) throw new TypeError('cannot canonicalize undefined')
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('cannot canonicalize non-finite number')
    return JSON.stringify(value)
  }
  if (t === 'string' || t === 'boolean') return JSON.stringify(value)
  if (t !== 'object') throw new TypeError(`cannot canonicalize ${t}`)
  if (Array.isArray(value)) return '[' + value.map(v => canonicalize(v === undefined ? null : v)).join(',') + ']'
  const keys = Object.keys(value).filter(k => value[k] !== undefined).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}'
}

export function canonicalBytes(value) {
  return new TextEncoder().encode(canonicalize(value))
}
