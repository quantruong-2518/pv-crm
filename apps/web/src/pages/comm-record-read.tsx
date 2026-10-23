import { daysUntil } from '@pv/engines'
import { Button, CalendarDays, GlassCard, Icon, MetaPill, Pencil, cn } from '@pv/ui'
import type { DebriefAnswer, DebriefStepCopy, DebriefView } from '@pv/contracts'
import { dmy, hm } from '@/lib/date'
import { CommFileShowcase } from '@/components/comm-file-showcase'
import { STEP_LABEL } from '@/components/comm-next-step-fields'
import { CommRecordFrame, CommStepCard, CommStepper } from '@/components/comm-record-frame'
import { CommTurns } from '@/components/comm-turns'
import { daysPhrase } from '@/data/contracts'
import {
  COMM_NOUN,
  commStepTitles,
  useAnchorTurn,
  UNREACHED_LINE,
  commKindLine,
  summaryTextOf,
  todayDay,
} from '@/data/comm-record-detail'
import { useMinuteClock } from '@/data/minute-clock'

/** The read view of `/comms/:id`: a confirmed record as its three steps, each
 *  card done; an unreached one, or an open one seen by somebody who is not its
 *  owner, as one card of what was said and filed. Nothing here writes: `onEdit`
 *  is the owner's door to `CommEditWorkspace` (ADR 0122), given only when the
 *  server says the record is `editableByMe`. */

export function CommReadView({ record, onEdit }: { record: DebriefView; onEdit?: () => void }) {
  const titles = commStepTitles(record)
  const done = record.state === 'done'
  const noun = COMM_NOUN[record.channel]

  return (
    <CommRecordFrame
      record={record}
      title={record.title ?? record.subject.label}
      subjectInTitle={record.title === null}
      meta={<ReadMeta record={record} />}
      caption={closedCaption(record)}
      actions={
        onEdit && (
          <Button size="lg" variant="secondary" onClick={onEdit}>
            <Icon icon={Pencil} size={16} />
            Sửa
          </Button>
        )
      }
      note={
        record.closedAt === null ? `Chỉ ${record.owner.name} xác nhận được lượt liên hệ này.` : null
      }
    >
      {done ? (
        <>
          <CommStepper labels={titles} states={titles.map(() => 'done' as const)} />
          <CommStepCard index={0} anchored title={titles[0]}>
            <div className="flex min-w-0 flex-col gap-2">
              <span className={STEP_LABEL}>Ghi chú {noun}</span>
              <p
                className={cn(
                  'bg-muted m-0 whitespace-pre-line break-words rounded-lg p-4 text-[16px] leading-[1.6]',
                  record.summary.state !== 'visible' && 'text-muted-foreground',
                )}
              >
                {summaryTextOf(record.summary)}
              </p>
            </div>
            <CommFileShowcase id={record.id} />
          </CommStepCard>
          <CommTurns threadId={record.threadId} />
          <CommStepCard index={1} anchored title={titles[1]}>
            <AnswerTiles answers={record.answers} />
          </CommStepCard>
          <CommStepCard index={2} anchored title={titles[2]}>
            {record.step ? (
              <StepRow step={record.step} />
            ) : (
              <p className="text-muted-foreground m-0 text-[13px]">Không đặt bước tiếp theo.</p>
            )}
          </CommStepCard>
        </>
      ) : (
        <GlassCard role="region" aria-label={titles[0]} className="flex flex-col gap-6 p-5 sm:p-6">
          <h2 className="m-0 text-[18px] font-semibold leading-[1.45]">{titles[0]}</h2>
          <p className="text-muted-foreground m-0 text-[14px] leading-[1.6]">
            {record.state === 'unreached' ? UNREACHED_LINE : summaryTextOf(record.summary)}
          </p>
          <CommFileShowcase id={record.id} />
        </GlassCard>
      )}
      {!done && <CommTurns threadId={record.threadId} />}
    </CommRecordFrame>
  )
}

/** Same day as the comm: the hour alone; a later day says which. */
function closedCaption(record: DebriefView): string | null {
  const at = record.closedAt
  if (!at) return null
  const when = dmy(at) === dmy(record.createdAt) ? hm(at) : `${hm(at)}, ${dmy(at)}`
  const verb = record.state === 'unreached' ? 'đóng' : 'xác nhận'
  return `${record.owner.name} ${verb} lúc ${when}`
}

/** Kind and direction, date then time, and how long a call ran. */
export function ReadMeta({ record }: { record: DebriefView }) {
  const anchor = useAnchorTurn(record)
  const seconds = anchor?.durationSec ?? 0
  return (
    <span className="tnum">
      {commKindLine(record.channel, anchor?.direction ?? null)} · {dmy(record.createdAt)} lúc{' '}
      {hm(record.createdAt)}
      {seconds > 0 && ` · ${Math.max(1, Math.round(seconds / 60))} phút`}
    </span>
  )
}

/** One tile per answer, in words: an evaluation is never a score (ADR 0074). */
function AnswerTiles({ answers }: { answers: readonly DebriefAnswer[] }) {
  if (answers.length === 0) {
    return <p className="text-muted-foreground m-0 text-[13px]">Chưa có câu hỏi đánh giá.</p>
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {answers.map((answer) => (
        <li key={answer.criterionId} className="bg-muted flex flex-col gap-2 rounded-lg p-4">
          <span className="text-[14px] font-semibold leading-[1.5]">{answer.criterionName}</span>
          <strong className="text-accent-foreground break-words text-[16px] font-semibold leading-[1.5]">
            {answer.answerName}
          </strong>
        </li>
      ))}
    </ul>
  )
}

export function StepRow({ step }: { step: DebriefStepCopy }) {
  /* Subscribed only so the count turns over at midnight without a reload. */
  useMinuteClock()
  const days = daysUntil(step.due, todayDay())
  return (
    <div className="bg-muted flex flex-wrap items-center gap-4 rounded-lg p-4">
      <MetaPill tone="accent">{step.kind.name}</MetaPill>
      <strong className="min-w-0 flex-1 basis-64 break-words text-[16px] font-semibold leading-[1.5]">
        {step.text}
      </strong>
      <span className="flex flex-col items-end gap-1">
        <span className="tnum inline-flex items-center gap-2 text-[13px] font-semibold">
          <Icon icon={CalendarDays} size={16} className="text-muted-foreground" />
          Làm trước {dmy(step.due)}
        </span>
        <span
          className={cn(
            'tnum text-[12px]',
            days < 0 ? 'text-destructive-foreground' : 'text-muted-foreground',
          )}
        >
          {daysPhrase(days)}
        </span>
      </span>
    </div>
  )
}
