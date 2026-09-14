export const PROFILE_SCHEMA_VERSION: number
export const SEARCH_TYPE_TO_TARGET: Record<string, string>

export interface OciLookupName {
  name: string
  compartmentId?: string
}

export interface OciProfileCompartment {
  name: string
  id: string
}

export interface OciProfile {
  v: number
  name: string
  tenancyId?: string
  tenancyName?: string
  namespace?: string
  homeRegion?: string
  regions: string[]
  compartments: OciProfileCompartment[]
  names: Record<string, OciLookupName[]>
  collectedAt?: string
}

export interface ProfileSummary {
  regions: number
  compartments: number
  resources: number
}

export function renderProfileCollectScript(): string
export function parseCollectedProfiles(text: string): { profiles: OciProfile[]; error?: string }
export function lookupNamesFor(
  profile: OciProfile | null | undefined,
  target: string,
  opts?: { compartmentId?: string },
): string[]
export function profileSummary(profile: OciProfile): ProfileSummary
export function mergeProfiles(existing: OciProfile[], incoming: OciProfile[]): OciProfile[]
