export interface RenderedPolicyScript {
  title: string
  filename: string
  body: string
}

export interface PolicyRenderArgs {
  policyName: string
  description?: string
  statements: string[]
  compartmentInput: string
  profile?: string
  region?: string
}

export interface PolicyScriptSet {
  create: RenderedPolicyScript
  verify: RenderedPolicyScript
  rollback: RenderedPolicyScript
}

export function slugify(s: string): string
export function renderPolicyScripts(args: PolicyRenderArgs): PolicyScriptSet
