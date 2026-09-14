// Oracle 공식 "Regions and Availability Domains" 표를 기준으로 한 상용 리전 검색 목록.
// 확인일: 2026-08-22
// https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm

export const OCI_REGIONS = [
  { id: 'ap-seoul-1', key: 'ICN', cityKo: '서울', cityEn: 'Seoul', countryKo: '대한민국', countryEn: 'South Korea', realm: 'OC1', aliases: ['한국', 'korea'] },
  { id: 'ap-chuncheon-1', key: 'YNY', cityKo: '춘천', cityEn: 'Chuncheon', countryKo: '대한민국', countryEn: 'South Korea', realm: 'OC1', aliases: ['한국', 'korea'] },
  { id: 'ap-osaka-1', key: 'KIX', cityKo: '오사카', cityEn: 'Osaka', countryKo: '일본', countryEn: 'Japan', realm: 'OC1' },
  { id: 'ap-tokyo-1', key: 'NRT', cityKo: '도쿄', cityEn: 'Tokyo', countryKo: '일본', countryEn: 'Japan', realm: 'OC1' },
  { id: 'ap-sydney-1', key: 'SYD', cityKo: '시드니', cityEn: 'Sydney', countryKo: '호주', countryEn: 'Australia', realm: 'OC1' },
  { id: 'ap-melbourne-1', key: 'MEL', cityKo: '멜버른', cityEn: 'Melbourne', countryKo: '호주', countryEn: 'Australia', realm: 'OC1' },
  { id: 'ap-hyderabad-1', key: 'HYD', cityKo: '하이데라바드', cityEn: 'Hyderabad', countryKo: '인도', countryEn: 'India', realm: 'OC1' },
  { id: 'ap-mumbai-1', key: 'BOM', cityKo: '뭄바이', cityEn: 'Mumbai', countryKo: '인도', countryEn: 'India', realm: 'OC1' },
  { id: 'ap-batam-1', key: 'HSG', cityKo: '바탐', cityEn: 'Batam', countryKo: '인도네시아', countryEn: 'Indonesia', realm: 'OC1' },
  { id: 'ap-kulai-2', key: 'JBP', cityKo: '쿨라이', cityEn: 'Kulai', countryKo: '말레이시아', countryEn: 'Malaysia', realm: 'OC1' },
  { id: 'ap-singapore-1', key: 'SIN', cityKo: '싱가포르', cityEn: 'Singapore', countryKo: '싱가포르', countryEn: 'Singapore', realm: 'OC1' },
  { id: 'ap-singapore-2', key: 'XSP', cityKo: '싱가포르 서부', cityEn: 'Singapore West', countryKo: '싱가포르', countryEn: 'Singapore', realm: 'OC1' },
  { id: 'sa-saopaulo-1', key: 'GRU', cityKo: '상파울루', cityEn: 'Sao Paulo', countryKo: '브라질', countryEn: 'Brazil', realm: 'OC1' },
  { id: 'sa-vinhedo-1', key: 'VCP', cityKo: '비녜두', cityEn: 'Vinhedo', countryKo: '브라질', countryEn: 'Brazil', realm: 'OC1' },
  { id: 'ca-montreal-1', key: 'YUL', cityKo: '몬트리올', cityEn: 'Montreal', countryKo: '캐나다', countryEn: 'Canada', realm: 'OC1' },
  { id: 'ca-toronto-1', key: 'YYZ', cityKo: '토론토', cityEn: 'Toronto', countryKo: '캐나다', countryEn: 'Canada', realm: 'OC1' },
  { id: 'sa-santiago-1', key: 'SCL', cityKo: '산티아고', cityEn: 'Santiago', countryKo: '칠레', countryEn: 'Chile', realm: 'OC1' },
  { id: 'sa-valparaiso-1', key: 'VAP', cityKo: '발파라이소', cityEn: 'Valparaiso', countryKo: '칠레', countryEn: 'Chile', realm: 'OC1' },
  { id: 'sa-bogota-1', key: 'BOG', cityKo: '보고타', cityEn: 'Bogota', countryKo: '콜롬비아', countryEn: 'Colombia', realm: 'OC1' },
  { id: 'eu-paris-1', key: 'CDG', cityKo: '파리', cityEn: 'Paris', countryKo: '프랑스', countryEn: 'France', realm: 'OC1' },
  { id: 'eu-marseille-1', key: 'MRS', cityKo: '마르세유', cityEn: 'Marseille', countryKo: '프랑스', countryEn: 'France', realm: 'OC1' },
  { id: 'eu-frankfurt-1', key: 'FRA', cityKo: '프랑크푸르트', cityEn: 'Frankfurt', countryKo: '독일', countryEn: 'Germany', realm: 'OC1' },
  { id: 'il-jerusalem-1', key: 'MTZ', cityKo: '예루살렘', cityEn: 'Jerusalem', countryKo: '이스라엘', countryEn: 'Israel', realm: 'OC1' },
  { id: 'eu-milan-1', key: 'LIN', cityKo: '밀라노', cityEn: 'Milan', countryKo: '이탈리아', countryEn: 'Italy', realm: 'OC1' },
  { id: 'eu-turin-1', key: 'NRQ', cityKo: '토리노', cityEn: 'Turin', countryKo: '이탈리아', countryEn: 'Italy', realm: 'OC1' },
  { id: 'mx-queretaro-1', key: 'QRO', cityKo: '케레타로', cityEn: 'Queretaro', countryKo: '멕시코', countryEn: 'Mexico', realm: 'OC1' },
  { id: 'mx-monterrey-1', key: 'MTY', cityKo: '몬테레이', cityEn: 'Monterrey', countryKo: '멕시코', countryEn: 'Mexico', realm: 'OC1' },
  { id: 'af-casablanca-1', key: 'LEJ', cityKo: '카사블랑카', cityEn: 'Casablanca', countryKo: '모로코', countryEn: 'Morocco', realm: 'OC1' },
  { id: 'eu-amsterdam-1', key: 'AMS', cityKo: '암스테르담', cityEn: 'Amsterdam', countryKo: '네덜란드', countryEn: 'Netherlands', realm: 'OC1' },
  { id: 'me-riyadh-1', key: 'RUH', cityKo: '리야드', cityEn: 'Riyadh', countryKo: '사우디아라비아', countryEn: 'Saudi Arabia', realm: 'OC1' },
  { id: 'me-jeddah-1', key: 'JED', cityKo: '제다', cityEn: 'Jeddah', countryKo: '사우디아라비아', countryEn: 'Saudi Arabia', realm: 'OC1' },
  { id: 'eu-jovanovac-1', key: 'BEG', cityKo: '요바노바츠', cityEn: 'Jovanovac', countryKo: '세르비아', countryEn: 'Serbia', realm: 'OC20' },
  { id: 'af-johannesburg-1', key: 'JNB', cityKo: '요하네스버그', cityEn: 'Johannesburg', countryKo: '남아프리카공화국', countryEn: 'South Africa', realm: 'OC1', aliases: ['남아공'] },
  { id: 'eu-madrid-1', key: 'MAD', cityKo: '마드리드', cityEn: 'Madrid', countryKo: '스페인', countryEn: 'Spain', realm: 'OC1' },
  { id: 'eu-madrid-3', key: 'ORF', cityKo: '마드리드 3', cityEn: 'Madrid 3', countryKo: '스페인', countryEn: 'Spain', realm: 'OC1' },
  { id: 'eu-stockholm-1', key: 'ARN', cityKo: '스톡홀름', cityEn: 'Stockholm', countryKo: '스웨덴', countryEn: 'Sweden', realm: 'OC1' },
  { id: 'eu-zurich-1', key: 'ZRH', cityKo: '취리히', cityEn: 'Zurich', countryKo: '스위스', countryEn: 'Switzerland', realm: 'OC1' },
  { id: 'me-abudhabi-1', key: 'AUH', cityKo: '아부다비', cityEn: 'Abu Dhabi', countryKo: '아랍에미리트', countryEn: 'UAE', realm: 'OC1' },
  { id: 'me-dubai-1', key: 'DXB', cityKo: '두바이', cityEn: 'Dubai', countryKo: '아랍에미리트', countryEn: 'UAE', realm: 'OC1' },
  { id: 'uk-london-1', key: 'LHR', cityKo: '런던', cityEn: 'London', countryKo: '영국', countryEn: 'United Kingdom', realm: 'OC1', aliases: ['uk'] },
  { id: 'uk-cardiff-1', key: 'CWL', cityKo: '뉴포트', cityEn: 'Newport', countryKo: '영국', countryEn: 'United Kingdom', realm: 'OC1', aliases: ['카디프', 'cardiff', 'uk'] },
  { id: 'us-ashburn-1', key: 'IAD', cityKo: '애쉬번', cityEn: 'Ashburn', countryKo: '미국', countryEn: 'United States', realm: 'OC1', aliases: ['usa'] },
  { id: 'us-chicago-1', key: 'ORD', cityKo: '시카고', cityEn: 'Chicago', countryKo: '미국', countryEn: 'United States', realm: 'OC1', aliases: ['usa'] },
  { id: 'us-phoenix-1', key: 'PHX', cityKo: '피닉스', cityEn: 'Phoenix', countryKo: '미국', countryEn: 'United States', realm: 'OC1', aliases: ['usa'] },
  { id: 'us-sanjose-1', key: 'SJC', cityKo: '산호세', cityEn: 'San Jose', countryKo: '미국', countryEn: 'United States', realm: 'OC1', aliases: ['usa'] },
]

export function ociRegionLabel(region) {
  return `${region.cityKo} (${region.id})`
}

export function findOciRegion(id) {
  return OCI_REGIONS.find(region => region.id === id)
}

export function searchOciRegions(query, limit = 8) {
  const q = query.trim().toLocaleLowerCase('ko-KR')
  if (!q) return OCI_REGIONS.slice(0, limit)
  const scored = OCI_REGIONS.map((region, index) => {
    const fields = [region.id, region.key, region.cityKo, region.cityEn, region.countryKo, region.countryEn, ...(region.aliases ?? [])]
      .map(value => value.toLocaleLowerCase('ko-KR'))
    const exact = fields.some(value => value === q)
    const starts = fields.some(value => value.startsWith(q))
    const contains = fields.some(value => value.includes(q))
    return { region, score: exact ? 0 : starts ? 1 : contains ? 2 : 99, index }
  }).filter(item => item.score < 99)
  scored.sort((a, b) => a.score - b.score || a.index - b.index)
  return scored.slice(0, limit).map(item => item.region)
}
