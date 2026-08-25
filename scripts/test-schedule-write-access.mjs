#!/usr/bin/env node
import assert from 'node:assert/strict'
import { canWriteSchedule } from '../src/lib/scheduleWriteAccess.mjs'

assert.equal(canWriteSchedule({ hasPat: false, authLevel: 0, hasSnapshot: false }), false)
assert.equal(canWriteSchedule({ hasPat: false, authLevel: 2, hasSnapshot: true }), false)
assert.equal(canWriteSchedule({ hasPat: false, authLevel: 3, hasSnapshot: false }), false)
assert.equal(canWriteSchedule({ hasPat: false, authLevel: 3, hasSnapshot: true }), true)
assert.equal(canWriteSchedule({ hasPat: true, authLevel: 0, hasSnapshot: false }), true)

console.log('schedule write access 테스트 통과 — 자물쇠 3 로컬 관리와 PAT 원격 저장 분리')
