// 안전한 POSIX 셸 인용. cliOptionModel.quoteCliValue 와 동일 알고리즘(안전 charset 외에는
// single-quote + '\'' 이스케이프)을 유지해 blueprint 생성 bash 가 기존 레시피 출력과 일치하게 한다.
const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/

/** @param {string} value @param {boolean} [always] @returns {string} */
export function shq(value, always = false) {
  return always || value === '' || !SAFE.test(value)
    ? `'${value.replaceAll("'", "'\\''")}'`
    : value
}

// bash 변수 참조는 절대 인용 규칙을 우회하지 않는다: 항상 "$VAR" 형태로 큰따옴표로 감싼다.
/** @param {string} name @returns {string} */
export function shref(name) {
  return `"$${name}"`
}
