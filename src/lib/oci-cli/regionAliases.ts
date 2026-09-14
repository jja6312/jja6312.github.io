// OCI 리전: 도시명(한국어/영어) → 리전 식별자. 사용자가 "서울/도쿄/시드니" 처럼 입력하면
// ap-seoul-1 같은 식별자로 자동 변환한다. 명령 생성 시(출력)와 입력 필드 양쪽에서 쓴다.
// 새 리전은 REGIONS 에 한 줄 추가하면 별칭·자동완성·해석이 모두 반영된다.

export interface OciRegion { id: string; ko: string; en: string; geo: string }

// 주요 상용 리전(식별자는 OCI 표준 <geo>-<city>-1). 불확실한 리전은 넣지 않는다.
export const REGIONS: OciRegion[] = [
  { id: 'ap-seoul-1', ko: '서울', en: 'Seoul', geo: 'Korea' },
  { id: 'ap-chuncheon-1', ko: '춘천', en: 'Chuncheon', geo: 'Korea' },
  { id: 'ap-tokyo-1', ko: '도쿄', en: 'Tokyo', geo: 'Japan' },
  { id: 'ap-osaka-1', ko: '오사카', en: 'Osaka', geo: 'Japan' },
  { id: 'ap-singapore-1', ko: '싱가포르', en: 'Singapore', geo: 'Singapore' },
  { id: 'ap-singapore-2', ko: '싱가포르2', en: 'Singapore West', geo: 'Singapore' },
  { id: 'ap-sydney-1', ko: '시드니', en: 'Sydney', geo: 'Australia' },
  { id: 'ap-melbourne-1', ko: '멜버른', en: 'Melbourne', geo: 'Australia' },
  { id: 'ap-mumbai-1', ko: '뭄바이', en: 'Mumbai', geo: 'India' },
  { id: 'ap-hyderabad-1', ko: '하이데라바드', en: 'Hyderabad', geo: 'India' },
  { id: 'ap-chuncheon-2', ko: '춘천2', en: 'Chuncheon 2', geo: 'Korea' },
  { id: 'us-ashburn-1', ko: '애슈번', en: 'Ashburn', geo: 'US East' },
  { id: 'us-phoenix-1', ko: '피닉스', en: 'Phoenix', geo: 'US West' },
  { id: 'us-sanjose-1', ko: '산호세', en: 'San Jose', geo: 'US West' },
  { id: 'us-chicago-1', ko: '시카고', en: 'Chicago', geo: 'US Midwest' },
  { id: 'ca-toronto-1', ko: '토론토', en: 'Toronto', geo: 'Canada' },
  { id: 'ca-montreal-1', ko: '몬트리올', en: 'Montreal', geo: 'Canada' },
  { id: 'sa-saopaulo-1', ko: '상파울루', en: 'Sao Paulo', geo: 'Brazil' },
  { id: 'sa-vinhedo-1', ko: '비녜두', en: 'Vinhedo', geo: 'Brazil' },
  { id: 'sa-santiago-1', ko: '산티아고', en: 'Santiago', geo: 'Chile' },
  { id: 'sa-bogota-1', ko: '보고타', en: 'Bogota', geo: 'Colombia' },
  { id: 'eu-frankfurt-1', ko: '프랑크푸르트', en: 'Frankfurt', geo: 'Germany' },
  { id: 'eu-amsterdam-1', ko: '암스테르담', en: 'Amsterdam', geo: 'Netherlands' },
  { id: 'eu-zurich-1', ko: '취리히', en: 'Zurich', geo: 'Switzerland' },
  { id: 'eu-milan-1', ko: '밀란', en: 'Milan', geo: 'Italy' },
  { id: 'eu-paris-1', ko: '파리', en: 'Paris', geo: 'France' },
  { id: 'eu-marseille-1', ko: '마르세유', en: 'Marseille', geo: 'France' },
  { id: 'eu-madrid-1', ko: '마드리드', en: 'Madrid', geo: 'Spain' },
  { id: 'eu-stockholm-1', ko: '스톡홀름', en: 'Stockholm', geo: 'Sweden' },
  { id: 'uk-london-1', ko: '런던', en: 'London', geo: 'UK' },
  { id: 'uk-cardiff-1', ko: '카디프', en: 'Cardiff', geo: 'UK' },
  { id: 'me-jeddah-1', ko: '제다', en: 'Jeddah', geo: 'Saudi Arabia' },
  { id: 'me-riyadh-1', ko: '리야드', en: 'Riyadh', geo: 'Saudi Arabia' },
  { id: 'me-dubai-1', ko: '두바이', en: 'Dubai', geo: 'UAE' },
  { id: 'me-abudhabi-1', ko: '아부다비', en: 'Abu Dhabi', geo: 'UAE' },
  { id: 'il-jerusalem-1', ko: '예루살렘', en: 'Jerusalem', geo: 'Israel' },
  { id: 'af-johannesburg-1', ko: '요하네스버그', en: 'Johannesburg', geo: 'South Africa' },
  { id: 'mx-queretaro-1', ko: '케레타로', en: 'Queretaro', geo: 'Mexico' },
  { id: 'mx-monterrey-1', ko: '몬테레이', en: 'Monterrey', geo: 'Mexico' },
]

const norm = (v: string) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '')

// 별칭(정규화) → 식별자. 도시(KO/EN), 공백제거형, 그리고 식별자 자기 자신.
const ALIAS_TO_ID: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const r of REGIONS) {
    map[norm(r.id)] = r.id
    map[norm(r.ko)] = r.id
    map[norm(r.en)] = r.id
    map[norm(r.en).replace(/-/g, '')] = r.id
  }
  return map
})()

/** 입력이 알려진 도시명/식별자면 정식 리전 식별자로, 아니면 원본(trim) 그대로. */
export function resolveRegion(input: string): string {
  const raw = String(input ?? '').trim()
  if (!raw) return raw
  return ALIAS_TO_ID[norm(raw)] ?? raw
}

/** datalist 자동완성용 — 식별자를 value 로, "식별자 · 도시" 를 라벨로. */
export const REGION_SUGGESTIONS: string[] = REGIONS.map(r => r.id)
export const REGION_LABEL: Record<string, string> = Object.fromEntries(
  REGIONS.map(r => [r.id, `${r.id} · ${r.ko}/${r.en}`]),
)
