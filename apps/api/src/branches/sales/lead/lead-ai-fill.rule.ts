import { LeadAiFillField } from '@pv/contracts'
import { UNKNOWN_NAME } from './lead-person-name'
import type { LeadRowDb } from './lead.schema'

/** The one rule for "can this lead be AI-filled", read by the fill door (which
 *  refuses with it) and by the profile (`LeadProfile.canAiFill`, which hides the
 *  button with it). A leaf: `LeadService` and `LeadAiFillService` both import
 *  it, and neither may import the other's file for it. Editing rights are the
 *  callers' half — the door checks the holder, the profile `canEdit`. */

export type AiFillBlock = 'no-company-or-contact' | 'nothing-empty'

/** Fillable fields with no value; `industries` is empty as `[]`. */
export function emptyFillable(row: LeadRowDb): LeadAiFillField[] {
  return LeadAiFillField.options.filter((field) => {
    const value = row[field]
    return value === null || (Array.isArray(value) && value.length === 0)
  })
}

/** The scan stores the mailbox as the company and `UNKNOWN_NAME` as the person
 *  when the file printed neither: nothing to search for. */
export function aiFillBlock(row: LeadRowDb): AiFillBlock | null {
  const company = row.company.trim() !== '' && !row.company.includes('@')
  if (!company || row.contactName === UNKNOWN_NAME) return 'no-company-or-contact'
  return emptyFillable(row).length === 0 ? 'nothing-empty' : null
}
