// Plan Digest / artifact 봉투 digest 의 브라우저·Node 공용 계산기.
// canonicalize(RFC 8785) 는 jsonCanonical.mjs 단일 구현을 공유하고, 해시는 표준 WebCrypto
// (브라우저 window.crypto·Node 20+ globalThis.crypto) subtle.digest 로 계산한다.
import { canonicalize } from './jsonCanonical.mjs'

export function canonicalString(value: unknown): string {
  return canonicalize(value)
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
