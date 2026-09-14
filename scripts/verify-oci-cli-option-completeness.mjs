#!/usr/bin/env node
// 옵션 메타데이터 완전성 게이트 (사용자 규칙, 2026-08-25):
//  - placeholder 는 select(bool/flag/choices)가 아닌 모든 옵션에서 비어있으면 안 된다.
//  - help 가 enum("Allowed/Accepted values", "one of ...")임을 명시하는데 choices 가 없으면 안 된다
//    → CHOICE_OVERRIDES 로 채워야 한다(CLI 가 free-string 으로 선언한 숨은 enum).
// 이 게이트가 있으면 새 리소스/옵션을 추가해도 placeholder·choices 누락이 CI 에서 잡힌다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fail = message => { throw new Error(message) }
const catalog = JSON.parse(readFileSync(resolve('.protected-cache/cliCatalog.json'), 'utf8'))

const surfaceOptions = surface => [
  ...(surface.sections ?? []).flatMap(section => section.options ?? []),
  ...(surface.advanced ?? []),
]
const surfacesOf = command => {
  const out = []
  const ops = Object.values(command.operations ?? {})
  if (ops.length) out.push(...ops); else out.push(command)
  out.push(...Object.values(command.actions ?? {}))
  return out
}

// help 가 "고정 선택지"를 명시하는 신호 (choices 가 있어야 함)
const ENUM_HELP = /allowed values|accepted values|valid values|one of the following|must be one of|공백으로 구분된 값 중/i

let checked = 0
let withChoices = 0
const missingPlaceholder = []
const missingChoices = []

for (const [resource, command] of Object.entries(catalog.commands)) {
  for (const surface of surfacesOf(command)) {
    for (const option of surfaceOptions(surface)) {
      checked += 1
      const isSelect = !!(option.flag || option.type === 'bool' || (option.choices && option.choices.length))
      if (option.choices && option.choices.length) withChoices += 1
      // (1) placeholder 필수 (select 제외)
      if (!isSelect && !String(option.placeholder ?? '').trim()) {
        missingPlaceholder.push(`${resource}:${option.name}`)
      }
      // (2) enum 을 명시한 help 인데 choices 없음
      if (!isSelect && ENUM_HELP.test(String(option.help ?? ''))) {
        missingChoices.push(`${resource}:${option.name} — ${String(option.help).slice(0, 60)}`)
      }
    }
  }
}

if (missingPlaceholder.length) {
  fail(`placeholder 누락 옵션 ${missingPlaceholder.length}개 — 시스템은 빈 placeholder 를 허용하지 않습니다:\n  ${missingPlaceholder.join('\n  ')}`)
}
if (missingChoices.length) {
  fail(`enum help 인데 choices 없는 옵션 ${missingChoices.length}개 — CHOICE_OVERRIDES 에 추가하세요:\n  ${missingChoices.join('\n  ')}`)
}

console.log(JSON.stringify({ checkedOptions: checked, withChoices, missingPlaceholder: 0, missingChoices: 0 }))
