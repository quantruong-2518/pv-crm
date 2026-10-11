import { ADMISSION_VERDICT_LABEL, type AdmissionVerdict } from '@pv/contracts'
import type { BuiltRow } from '@/data/intake'

/** The two admission verdicts worth a second look on a row that went in. The
 *  others either need no remark (`new-account`) or never reach the went-in
 *  list of a file load. */
export const MARKED_VERDICTS = [
  'returning-account',
  'needs-review',
] as const satisfies readonly AdmissionVerdict[]

export const admissionMarkOf = (row: BuiltRow): (typeof MARKED_VERDICTS)[number] | undefined =>
  MARKED_VERDICTS.find((verdict) => verdict === row.admission)

export const hasAdmissionMarks = (rows: readonly BuiltRow[]): boolean =>
  rows.some((row) => admissionMarkOf(row) !== undefined)

/** Search text of one row's mark, so the list's search box finds it. */
export function admissionMarkText(row: BuiltRow): string {
  const mark = admissionMarkOf(row)
  return mark ? `${ADMISSION_VERDICT_LABEL[mark]} ${row.accountCode ?? ''}` : ''
}
