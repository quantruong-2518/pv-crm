import type { ReactElement } from 'react'
import type { MailRunRow } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { dmhm } from '@/lib/date'

/** A run has three timestamps and only ONE answers "where is this run right
 *  now" — `finishedAt` wins because it's the final word, `startedAt` answers
 *  "running since when", `scheduledAt` is a promise for later. `mail-runs.tsx`
 *  and `campaign-wave-parts.tsx`'s wave rows carried this exact three-branch logic
 *  as two hand-copied blocks; lives here so a new branch lands once, not in
 *  two screens that quietly drift apart.
 *
 *  `dmhm` and not `dm`: this is a SCHEDULING screen — two waves on the same
 *  day render identically under `dm`, and a bare "31/08" doesn't say 6am or
 *  11pm on a feature whose whole value is the hour. */
export function RunWhen({ run }: { run: MailRunRow }): ReactElement {
  const { t } = useI18n()
  if (run.finishedAt) {
    return (
      <span title={t(message('Kết thúc', 'Finished', '종료'))}>
        {t(message('Xong · ', 'Done · ', '완료 · '))}
        {dmhm(run.finishedAt)}
      </span>
    )
  }
  if (run.startedAt) {
    return (
      <span title={t(message('Bắt đầu', 'Started', '시작'))}>
        {t(message('Chạy · ', 'Running · ', '진행 · '))}
        {dmhm(run.startedAt)}
      </span>
    )
  }
  if (run.scheduledAt) {
    return (
      <span title={t(message('Hẹn giờ', 'Scheduled', '예약'))}>
        {t(message('Hẹn · ', 'Set · ', '예약 · '))}
        {dmhm(run.scheduledAt)}
      </span>
    )
  }
  return <span className="text-muted-foreground">—</span>
}
