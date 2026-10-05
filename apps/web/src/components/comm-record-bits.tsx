import { useNavigate } from 'react-router-dom'
import { ArrowRight, Button, GlassCard, Icon, SectionTitle, cn } from '@pv/ui'
import type { DebriefView } from '@pv/contracts'
import { dmhm } from '@/lib/date'
import { COMM_CARD_SURFACE, summaryTextOf } from '@/data/comm-record-detail'
import { commRecordPath } from '@/data/comm-records'
import { ChannelPill, CommLateMark, CommStateBadge, StepCopyLine } from './comm-bits'

/** The one read view of a comm (ADR 0075): summary, answers and step as the
 *  server kept them. `panel` sits under a subject's timeline and links to the
 *  comm's page; `page` is the right column of that page once the comm is done,
 *  where the header above already names channel, time and state. */
export function CommRecordRead({ row, as }: { row: DebriefView; as: 'panel' | 'page' }) {
  const navigate = useNavigate()
  const body = (
    <>
      {as === 'panel' && row.title && (
        <h4 className="m-0 text-[13px] font-semibold">{row.title}</h4>
      )}
      <p
        className={cn(
          'm-0 whitespace-pre-wrap break-words text-[13px] leading-[1.6]',
          row.summary.state === 'visible' ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {summaryTextOf(row.summary)}
      </p>

      <dl className="m-0 grid gap-x-3 gap-y-2 text-[12.5px] sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <dt className="text-muted-foreground">Người ghi</dt>
        <dd className="m-0">{row.owner.name}</dd>
        {row.closedAt && (
          <>
            <dt className="text-muted-foreground">Xác nhận lúc</dt>
            <dd className="m-0 tabular-nums">{dmhm(row.closedAt)}</dd>
          </>
        )}
        {row.answers.map((answer) => (
          <AnswerLine key={answer.criterionId} q={answer.criterionName} a={answer.answerName} />
        ))}
      </dl>

      {row.step ? (
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-muted-foreground text-[12px] font-medium">Bước tiếp theo</span>
          <StepCopyLine step={row.step} />
        </div>
      ) : (
        row.state === 'done' && (
          <p className="text-muted-foreground m-0 text-[12px]">
            Lượt liên hệ này không đặt bước tiếp theo.
          </p>
        )
      )}
    </>
  )

  if (as === 'page') {
    return (
      <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Nội dung đã xác nhận">
        <SectionTitle size="detail">Đã xác nhận</SectionTitle>
        {body}
      </GlassCard>
    )
  }

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
