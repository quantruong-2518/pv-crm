import { LeadAiFillField, type LeadPatch } from '@pv/contracts'
import { UNKNOWN_NAME } from './lead-person-name'
import type { LeadRowDb } from './lead.schema'

/** The one rule for "can this lead be AI-filled", read by the fill door (which
 *  refuses with it) and by the profile (`LeadProfile.canAiFill`, which hides the
 *  button with it). A leaf: `LeadService` and `LeadAiFillService` both import
 *  it, and neither may import the other's file for it. Editing rights are the
 *  callers' half — the door checks the holder, the profile `canEdit`. */

export type AiFillBlock = 'no-company-or-contact' | 'nothing-empty'

/** Fillable fields with no value. `category` is `category_id`; `industries`
 *  live in `sales.lead_industry`, so the caller passes how many the lead holds. */
export function emptyFillable(row: LeadRowDb, industries: number): LeadAiFillField[] {
  return LeadAiFillField.options.filter((field) =>
    field === 'industries'
      ? industries === 0
      : (field === 'category' ? row.categoryId : row[field]) === null,
  )
}

/** The patch door's field for each fillable one: a person's edit there drops
 *  the AI mark, and the enricher's values pass its schema. Two are id fields. */
export const patchFieldOf = (field: LeadAiFillField): keyof LeadPatch =>
  field === 'category' ? 'categoryId' : field === 'industries' ? 'industryIds' : field

/** The scan stores the mailbox as the company and `UNKNOWN_NAME` as the person
 *  when the file printed neither: nothing to search for. */
export function aiFillBlock(row: LeadRowDb, industries: number): AiFillBlock | null {
  const company = row.company.trim() !== '' && !row.company.includes('@')
  if (!company || row.contactName === UNKNOWN_NAME) return 'no-company-or-contact'
  return emptyFillable(row, industries).length === 0 ? 'nothing-empty' : null
}
