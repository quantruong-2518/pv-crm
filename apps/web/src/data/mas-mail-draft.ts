import { useEffect, useState } from 'react'

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

const NO_SELECTION: ReadonlySet<string> = new Set()

export function useMasMailDraft(
  open: boolean,
  initialCode?: string,
  initialCodes?: readonly string[],
) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION)
  const [previewCode, setPreviewCode] = useState('')
  const [campaignCode, setCampaignCode] = useState(NO_CAMPAIGN)
  /* `null` = not typed by anybody, so the panel keeps deriving it from the
     list and the template (G3) instead of freezing the first guess. */
  const [sequenceName, setSequenceName] = useState<string | null>(null)
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
    setSequenceName(null)
    setTrackEngagement(true)
    setSaveAsTemplate(false)
    setTemplateName('')
  }, [open, initialCode, initialCodes])

  return {
    selected,
    setSelected,
    previewCode,
    setPreviewCode,
    campaignCode,
    setCampaignCode,
    sequenceName,
    setSequenceName,
    trackEngagement,
    setTrackEngagement,
    saveAsTemplate,
    setSaveAsTemplate,
    templateName,
    setTemplateName,
  }
}

export type MasMailDraft = ReturnType<typeof useMasMailDraft>
