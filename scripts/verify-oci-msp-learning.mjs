#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const data = JSON.parse(readFileSync(resolve('src/data/generated.json'), 'utf8'))
const curriculum = data.curricula.find(c => c.id === 'oci-msp-performance')
if (!curriculum) throw new Error('OCI MSP 성능레포트 커리큘럼 누락')
if (curriculum.topics.length !== 18) throw new Error(`학습지 수 오류: ${curriculum.topics.length}`)

for (const topic of curriculum.topics) {
  const sheet = data.sheets[topic.sheet]
  if (!sheet) throw new Error(`${topic.sheet}: generated sheet 누락`)
  if (sheet.concepts.length !== 4) throw new Error(`${topic.sheet}: 개념 ${sheet.concepts.length}개`)
  if (!sheet.lab || sheet.lab.steps.length !== 7) throw new Error(`${topic.sheet}: 실전 구축 7단계 누락`)
  if (!sheet.lab.situation || !sheet.lab.request) throw new Error(`${topic.sheet}: 실습 상황·요청 누락`)
  if (sheet.scenarios.length !== 5) throw new Error(`${topic.sheet}: 평가 ${sheet.scenarios.length}개`)
  const labText = sheet.lab.steps.map(step => step.body).join('\n')
  for (const required of ['oci monitoring metric list', 'summarize-metrics-data', 'MonitoringClient', 'summarize_metrics_data']) {
    if (!labText.includes(required)) throw new Error(`${topic.sheet}: 실습 필수 내용 누락: ${required}`)
  }
}

console.log('OCI MSP 사이트 데이터 검증 통과: 18학습지 · 각 개념4/실습7/평가5')
