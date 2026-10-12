import { ADMISSION_VERDICT_LABEL } from '@pv/contracts'
import { MARKED_VERDICTS, admissionMarkOf } from '@/data/import-admission'
import type { BuiltRow } from '@/data/intake'

/** What the admission gate said about rows that WENT IN — a reading of the
 *  went-in list, never a bucket of its own: these rows are already counted
 *  there, and a tile beside it would make the tallies add up to more than the
 *  file. Draws nothing for a loader whose rows carry no verdict. */

/** The cell: the verdict's own label, and the company the new lead hangs on. */
export function AdmissionMark({ row }: { row: BuiltRow }) {
  const mark = admissionMarkOf(row)
  if (!mark) return <span className="text-muted-foreground">—</span>
  const code = mark === 'returning-account' ? row.accountCode : undefined
  return (
    <span
      className="block truncate leading-[1.6]"
      title={[ADMISSION_VERDICT_LABEL[mark], code].filter(Boolean).join(' · ')}
    >
      {ADMISSION_VERDICT_LABEL[mark]}
      {code && (
        <>
          {' '}
          · <span className="font-mono">{code}</span>
        </>
      )}
    </span>
  )
}

/** One line under the tallies: how many of the rows that went in are which. */
export function AdmissionTally({ rows }: { rows: readonly BuiltRow[] }) {
  const counts = MARKED_VERDICTS.map((verdict) => ({
    verdict,
    count: rows.filter((row) => row.admission === verdict).length,
  })).filter((entry) => entry.count > 0)
  if (counts.length === 0) return null

  return (
    <p className="text-glass-foreground tnum text-[11.5px] leading-[1.7]">
      Trong số dòng vào sổ —{' '}
      {counts.map((entry, i) => (
        <span key={entry.verdict}>
          {i > 0 && ' · '}
          {ADMISSION_VERDICT_LABEL[entry.verdict]}:{' '}
          <span className="font-num font-semibold">{entry.count}</span>
          {entry.verdict === 'returning-account' && ' (lead mới trên công ty đã có)'}
        </span>
      ))}
    </p>
  )
}
