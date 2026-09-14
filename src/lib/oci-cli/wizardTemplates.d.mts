import type { WizardGraph } from './wizardCompose.d.mts'

export interface WizardTemplate {
  id: string
  label: string
  description: string
  tags: string[]
  build: () => WizardGraph
}

export const WIZARD_TEMPLATES: WizardTemplate[]
