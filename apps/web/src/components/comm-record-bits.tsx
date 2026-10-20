import { useNavigate } from 'react-router-dom'
import { ArrowRight, Button, Icon, cn } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { dmhm } from '@/lib/date'
import { COMM_CARD_SURFACE, UNREACHED_LINE, summaryTextOf } from '@/data/comm-record-detail'
import { commRecordPath } from '@/data/comm-records'
import { ChannelPill, CommLateMark, CommStateBadge, StepCopyLine } from './comm-bits'

/** A comm read under a subject's timeline (ADR 0075): summary, answers and step
 *  as the server kept them, and the door to the comm's own page. */
export function CommRecordRead({ row }: { row: DebriefView }) {
  const navigate = useNavigate()
  const unreached = row.state === 'unreached'
  const cancelled = row.state === 'cancelled'
  const body = (
    <>
      {row.title && <h4 className="m-0 text-[13px] font-semibold">{row.title}</h4>}
      {!cancelled && (
        <p
          className={cn(
            'm-0 whitespace-pre-wrap break-words text-[13px] leading-[1.6]',
            !unreached && row.summary.state === 'visible'
              ? 'text-foreground'
              : 'text-muted-foreground',
          )}
        >
          {unreached ? UNREACHED_LINE : summaryTextOf(row.summary)}
        </p>
      )}

      <dl className="m-0 grid gap-x-3 gap-y-2 text-[12.5px] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <dt className="text-muted-foreground">Người ghi</dt>
        <dd className="m-0">{row.owner.name}</dd>
        {row.closedAt && (
          <>
            <dt className="text-muted-foreground">
              {unreached ? 'Đóng lúc' : cancelled ? 'Huỷ lúc' : 'Xác nhận lúc'}
            </dt>
            <dd className="m-0 tabular-nums">{dmhm(row.closedAt)}</dd>
          </>
        )}
        {row.answers.map((answer) => (
          <AnswerLine key={answer.criterionId} q={answer.criterionName} a={answer.answerName} />
        ))}
      </dl>

      {unreached ? null : row.step ? (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-muted-foreground text-[12px] font-medium">Bước tiếp theo</span>
          <StepCopyLine step={row.step} />
        </div>
      ) : (
        row.state === 'done' && (
          <p className="text-muted-foreground m-0 text-[12px]">Không đặt bước tiếp theo.</p>
        )
      )}
    </>
  )

  return (
    <section
      aria-label="Chi tiết liên hệ"
      className={cn('flex min-w-0 flex-col gap-4 rounded-lg p-4', COMM_CARD_SURFACE)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ChannelPill channel={row.channel} />
        <h3 className="m-0 text-[14px] font-semibold tabular-nums">{dmhm(row.createdAt)}</h3>
        <CommStateBadge state={row.state} />
        <CommLateMark late={row.late} />
      </div>
      {body}
      <Button
        size="md"
        variant="secondary"
        className="pointer-coarse:h-12 self-start"
        onClick={() => navigate(commRecordPath(row.id))}
      >
        Mở lượt liên hệ
        <Icon icon={ArrowRight} size={16} />
      </Button>
    </section>
  )
}

function AnswerLine({ q, a }: { q: string; a: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{q}</dt>
      <dd className="m-0 font-medium">{a}</dd>
    </>
  )
}
