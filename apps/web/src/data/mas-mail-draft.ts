import { useEffect, useState } from 'react'
import type { LeadRow, MailMergeKey, MailTemplateRow } from '@pv/contracts'
import { localSlot } from '@/lib/date'

/** Everything the three-step compose panel is holding while it is open.
 *
 *  It lives here and not inside the panel because the panel is now four files:
 *  a shell that owns the steps and the footer, and one component per step. A
 *  draft threaded through as twenty props would be twenty chances for step 3 to
 *  read a subject step 2 no longer has. */

/** "No template" and "no campaign" as VALUES rather than empty strings.
 *
 *  A `<Select>` whose value is `''` cannot tell "the user chose none" from "the
 *  list has not loaded", and `ObjectCode` refuses an empty string — so that
 *  confusion would arrive as a 400 after the letter is written. */
export const NO_TEMPLATE = 'none'
export const NO_CAMPAIGN = 'none'

/** What one recipient row needs, and nothing else: the panel is handed leads by
 *  whichever screen opened it, and asking for the whole `LeadRow` would tie the
 *  panel to a shape it reads five fields of. */
export type MasRecipient = Pick<
  LeadRow,
  'code' | 'company' | 'contactName' | 'contactTitle' | 'email'
>

export type MailSendTiming = 'now' | 'later'

/** The two merge slots the insert buttons write. Typed as `MailMergeKey` so a
 *  rename in the contract fails here rather than silently posting a letter with
 *  a slot nothing fills. `contact_name` over `contactName`: both are accepted,
 *  and the snake spelling is the one every stored template already uses. */
const RECIPIENT_KEY: MailMergeKey = 'contact_name'
const ACCOUNT_KEY: MailMergeKey = 'account'

export const MERGE_RECIPIENT = `{{${RECIPIENT_KEY}}}`
export const MERGE_ACCOUNT = `{{${ACCOUNT_KEY}}}`

const NO_SELECTION: ReadonlySet<string> = new Set()

export function useMasMailDraft(
  open: boolean,
  initialLeadCode?: string,
  initialLeadCodes?: readonly string[],
) {
  const [template, setTemplate] = useState(NO_TEMPLATE)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [cta, setCta] = useState<MailTemplateRow['cta']>()
  const [withCta, setWithCta] = useState(false)
  const [bookingUrl, setBookingUrl] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION)
  const [previewCode, setPreviewCode] = useState('')
  const [sendTiming, setSendTiming] = useState<MailSendTiming>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [campaignCode, setCampaignCode] = useState(NO_CAMPAIGN)
  /* ON by default, matching both the contract and the column's `DEFAULT true`.
     The request states it anyway — see the checkbox in step 3 — because a panel
     that leans on a default elsewhere stops explaining its own box. */
  const [trackEngagement, setTrackEngagement] = useState(true)
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  useEffect(() => {
    if (!open) return
    setTemplate(NO_TEMPLATE)
    setSubject('')
    setBody('')
    setCta(undefined)
    setWithCta(false)
    setBookingUrl('')
    const seeded = initialLeadCode ? [initialLeadCode] : (initialLeadCodes ?? [])
    setSelected(seeded.length > 0 ? new Set(seeded) : NO_SELECTION)
    setPreviewCode(seeded[0] ?? '')
    setSendTiming('now')
    setScheduledAt(localSlot())
    setCampaignCode(NO_CAMPAIGN)
    setTrackEngagement(true)
    setSaveAsTemplate(false)
    setTemplateName('')
  }, [open, initialLeadCode, initialLeadCodes])

  return {
    template,
    setTemplate,
    subject,
    setSubject,
    body,
    setBody,
    cta,
    setCta,
    withCta,
    setWithCta,
    bookingUrl,
    setBookingUrl,
    selected,
    setSelected,
    previewCode,
    setPreviewCode,
    sendTiming,
    setSendTiming,
    scheduledAt,
    setScheduledAt,
    campaignCode,
    setCampaignCode,
    trackEngagement,
    setTrackEngagement,
    saveAsTemplate,
    setSaveAsTemplate,
    templateName,
    setTemplateName,
  }
}

export type MasMailDraft = ReturnType<typeof useMasMailDraft>

/** The pair of button fields moves together or not at all — `MailCta` is one
 *  object on the wire and the `mail_template_cta_pair` CHECK says so. Emptying
 *  both drops the button rather than posting a half one. */
export function ctaWith(
  current: MailTemplateRow['cta'],
  patch: { label?: string; url?: string },
): MailTemplateRow['cta'] {
  const next = { label: patch.label ?? current?.label ?? '', url: patch.url ?? current?.url ?? '' }
  return next.label === '' && next.url === '' ? undefined : next
}

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
