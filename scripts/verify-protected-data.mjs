#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { webcrypto } from 'node:crypto'

const file = JSON.parse(readFileSync(resolve('public/protected-data.json'), 'utf8'))
const verifiers = JSON.parse(readFileSync(resolve('src/data/authVerifiers.json'), 'utf8'))
const { subtle } = webcrypto
const dec = new TextDecoder()
const fromB64 = value => new Uint8Array(Buffer.from(value, 'base64'))

async function passwordDecrypt(password, cipher) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(cipher.salt), iterations: 200_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )
  return JSON.parse(dec.decode(await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(cipher.iv) }, key, fromB64(cipher.ct),
  )))
}
async function rawDecrypt(keyB64, cipher) {
  const key = await subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['decrypt'])
  return JSON.parse(dec.decode(await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(cipher.iv) }, key, fromB64(cipher.ct),
  )))
}

for (const level of [1, 2, 3]) {
  const password = process.env[`HUB_LOCK_${level}`]
  if (!password) throw new Error(`HUB_LOCK_${level} 환경변수가 필요합니다`)
  if (await passwordDecrypt(password, verifiers[level]) !== 'jja-hub-auth-ok') throw new Error(`L${level} verifier 실패`)
  const keys = await passwordDecrypt(password, file.keyrings[level])
  const parts = await Promise.all(Object.entries(keys).map(([part, key]) => rawDecrypt(key, file.payloads[part])))
  const bundle = Object.assign({}, ...parts)
  if (!bundle.cliCatalog || Object.keys(bundle.cliCatalog.commands).length < 1) throw new Error(`L${level} CLI 누락`)
  if ((level >= 2) !== !!bundle.schedule) throw new Error(`L${level} schedule 범위 오류`)
  if ((level >= 3) !== !!bundle.meetings) throw new Error(`L${level} meetings 범위 오류`)
  console.log(`L${level} 복호화 OK · payload ${Object.keys(keys).length}개`)
}
