import { useEffect, useState } from 'react'
import type { LeadProfile, MasCcAddress } from '@pv/contracts'

/** Everything the three-step compose panel is holding while it is open.
 *
 *  It lives here and not inside the panel because the panel is now four files:
 *  a shell that owns the steps and the footer, and one component per step. A
 *  draft threaded through as twenty props would be twenty chances for step 3 to
 *  read a subject step 2 no longer has. */

/** "No campaign" as a value rather than an empty string, which a select cannot
 * distinguish from a catalogue that has not loaded yet. */
export const NO_CAMPAIGN = 'none'

/** What one recipient row needs, and nothing else. `code` belongs to the source
 * book while the contact facts still come from its lead mailbox. */
export type MasRecipient = {
  /** Destination key written to the ledger: lead code or opportunity code. */
  code: string
  /** Lead used only for merge preview; an opportunity gets its mailbox here. */
  leadCode?: string
  company: string
  contactName: string
  contactTitle?: string
  email: string
  destinationLabel?: string
}

/** The panel takes a LIST of recipients; a detail screen holds exactly one, and
 *  none at all while the lead has no mailbox or no person to address. Shared by
 *  the lead screen and the deal screen — a deal writes to its origin lead's
 *  mailbox, so both build the same row from the same profile. */
export function masRecipientsOf(
  lead: LeadProfile | null,
  destination?: { code: string; label?: string },
): MasRecipient[] {
  if (!lead?.contactName || !lead.email) return []
  return [
    {
      code: destination?.code ?? lead.code,
      leadCode: lead.code,
      company: lead.company,
      contactName: lead.contactName,
      contactTitle: lead.contactTitle,
      email: lead.email,
      ...(destination?.label ? { destinationLabel: destination.label } : {}),
    },
  ]
}

const NO_SELECTION: ReadonlySet<string> = new Set()

export function useMasMailDraft(
  open: boolean,
  initialCode?: string,
  initialCodes?: readonly string[],
  defaultSequenceName?: string,
) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION)
  const [previewCode, setPreviewCode] = useState('')
  const [campaignCode, setCampaignCode] = useState(NO_CAMPAIGN)
  const [sequenceName, setSequenceName] = useState('')
  const [cc, setCc] = useState<ReadonlySet<MasCcAddress>>(new Set())
  /* ON by default, matching both the contract and the column's `DEFAULT true`.
     The request states it anyway — see the checkbox in step 3 — because a panel
     that leans on a default elsewhere stops explaining its own box. */
  const [trackEngagement, setTrackEngagement] = useState(true)
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  useEffect(() => {
    if (!open) return
    const seeded = initialCode ? [initialCode] : (initialCodes ?? [])
    setSelected(seeded.length > 0 ? new Set(seeded) : NO_SELECTION)
    setPreviewCode(seeded[0] ?? '')
    setCampaignCode(NO_CAMPAIGN)
    setSequenceName(defaultSequenceName ?? 'Chuỗi email')
    setCc(new Set())
    setTrackEngagement(true)
    setSaveAsTemplate(false)
    setTemplateName('')
  }, [open, initialCode, initialCodes, defaultSequenceName])

  return {
    selected,
    setSelected,
    previewCode,
    setPreviewCode,
    campaignCode,
    setCampaignCode,
    sequenceName,
    setSequenceName,
    cc,
    setCc,
    trackEngagement,
    setTrackEngagement,
    saveAsTemplate,
    setSaveAsTemplate,
    templateName,
    setTemplateName,
  }
}

export type MasMailDraft = ReturnType<typeof useMasMailDraft>

/** A template code from the name somebody typed.
 *
 *  `MailTemplateCode` accepts lowercase ASCII, digits and dashes only, and the
 *  name is Vietnamese — so diacritics come off, the crossed D folds to a plain
 *  one, and everything else collapses to a dash. An empty result means the name
 *  held nothing usable, and the caller says so rather than posting a code the
 *  server will refuse. */
export function templateCodeFrom(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0110\u0111]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
}
