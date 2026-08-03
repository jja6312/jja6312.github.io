// Web Crypto 기반 비번 암호화 — 정적 사이트에서 서버 없이 단계별 권한을 구현하는 핵심.
// PBKDF2(SHA-256)로 비번에서 키를 유도하고 AES-GCM 으로 암·복호화한다.
// 레벨별 데이터는 그 레벨 비번으로 암호화해 저장 → 비번 입력 시 브라우저가 복호화(PAT 불필요).

const enc = new TextEncoder()
const dec = new TextDecoder()
const ITER = 200_000                 // PBKDF2 반복 (생성 스크립트와 반드시 동일)

const toB64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const x of u) s += String.fromCharCode(x)
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

export interface Cipher { salt: string; iv: string; ct: string }   // 모두 base64

// TS 5.7 의 Uint8Array<ArrayBufferLike> vs BufferSource 엄격 검사 회피용 캐스팅
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource

async function deriveKey(pw: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', bs(enc.encode(pw)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations: ITER, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJSON(pw: string, data: unknown): Promise<Cipher> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(pw, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, key, bs(enc.encode(JSON.stringify(data))))
  return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) }
}

export async function decryptJSON<T>(pw: string, c: Cipher): Promise<T> {
  const key = await deriveKey(pw, fromB64(c.salt))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(fromB64(c.iv)) }, key, bs(fromB64(c.ct)))
  return JSON.parse(dec.decode(pt)) as T
}

// 검증 토큰 — 비번으로 알려진 표식을 암호화. 복호화 성공 = 비번 일치.
// (원문 비번은 어디에도 저장하지 않는다. verifier 만으로 검증.)
export const VERIFY_MARK = 'jja-hub-auth-ok'
export const makeVerifier = (pw: string) => encryptJSON(pw, VERIFY_MARK)
export async function checkVerifier(pw: string, c: Cipher): Promise<boolean> {
  try { return (await decryptJSON<string>(pw, c)) === VERIFY_MARK } catch { return false }
}
