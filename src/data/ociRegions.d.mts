export interface OciRegion {
  id: string
  key: string
  cityKo: string
  cityEn: string
  countryKo: string
  countryEn: string
  realm: string
  aliases?: string[]
}

export const OCI_REGIONS: readonly OciRegion[]
export function ociRegionLabel(region: OciRegion): string
export function findOciRegion(id: string): OciRegion | undefined
export function searchOciRegions(query: string, limit?: number): OciRegion[]
