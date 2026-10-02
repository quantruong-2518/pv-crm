import type { ReactNode } from 'react'
import { Badge, StatusDot, cn, vnd, type StatusDotState } from '@pv/ui'
import {
  DOC_STATE_LABEL,
  type DocState,
  type JourneyContract,
  type JourneyRungState,
} from '@pv/contracts'
import { dm, dmy } from '@/lib/date'
import { BADGE_INK } from '@/data/opportunities'
import { DueBadge } from '@/components/contract-bits'

/** What sits inside a contract's rungs, read-only, off the run's journey:
 *  deployment milestones, acceptance documents, installments with their
 *  recorded invoice and payment, the licence period. The retired journey
 *  drawer showed these; the contract profile and the tree's contract node now
 *  do, so a reader with `workstream.view` but not `contract.view` keeps them. */

/* Words come from the contract; the tone is this block's reading. */
const DOC_TONE: Record<DocState, 'success' | 'warning' | 'draft'> = {
  complete: 'success',
  'awaiting-signature': 'warning',
  missing: 'draft',
}

const STEP_DOT: Record<JourneyRungState, StatusDotState> = {
  done: 'ok',
  current: 'current',
  stopped: 'bad',
  skipped: 'next',
  upcoming: 'next',
}

const INVOICE_NOTE =
  'Hoá đơn chỉ ghi nhận: số và ngày hoá đơn, ngày và số tiền đã thu. Hệ thống không phát hành hoá đơn.'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h3 className="text-muted-foreground m-0 text-[12px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}

const ROWS = 'm-0 flex list-none flex-col p-0'
const ROW = 'flex min-w-0 flex-wrap items-center gap-2 py-2 text-[12.5px] leading-[1.5]'

export function ContractInside({ contract: c }: { contract: JourneyContract }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {c.milestones.length > 0 && (
        <Section title="Các mốc triển khai">
          <ul role="list" className={ROWS}>
            {c.milestones.map((m, i) => (
              <li key={`${i}:${m.label}`} className={ROW}>
                <StatusDot state={STEP_DOT[m.state]} />
                <span
                  className={cn(
                    'min-w-0 grow break-words',
                    m.state === 'current' && 'font-semibold',
                  )}
                >
                  {m.label}
                  {m.note && (
                    <span className="text-muted-foreground block text-[12px]">{m.note}</span>
                  )}
                </span>
                <span className="text-muted-foreground tnum text-[12px]">
                  {m.at ? dm(m.at) : m.due && `hạn ${dm(m.due)}`}
                </span>
                {/* `done` is a money word, so a finished milestone shows its date only. */}
                {m.dueLevel && m.dueLevel !== 'done' && <DueBadge level={m.dueLevel} />}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.acceptance.length > 0 && (
        <Section title="Biên bản nghiệm thu">
          <ul role="list" className={ROWS}>
            {c.acceptance.map((a, i) => (
              <li key={`${i}:${a.label}`} className={ROW}>
                <span className="min-w-0 grow break-words">{a.label}</span>
                {a.at && (
                  <span className="text-muted-foreground tnum text-[12px]">{dmy(a.at)}</span>
                )}
                <Badge tone={DOC_TONE[a.state]} className={cn(a.state === 'missing' && BADGE_INK)}>
                  {DOC_STATE_LABEL[a.state]}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.installments.length > 0 && (
        <Section title="Các đợt thanh toán">
          <ul role="list" className={ROWS}>
            {c.installments.map((i) => (
              <li key={i.no} className="flex min-w-0 flex-col gap-1 py-2">
                <span className="flex flex-wrap items-center gap-2 text-[12.5px] leading-[1.5]">
                  <span className="min-w-0 grow break-words font-medium">{i.label}</span>
                  <span className="tnum">{vnd(i.amount)}</span>
                  <DueBadge level={i.dueLevel} />
                </span>
                <span className="text-muted-foreground tnum text-[12px] leading-[1.5]">
                  {[
                    `${i.share}%`,
                    `hạn ${dmy(i.due)}`,
                    i.invoicedAt &&
                      ['hoá đơn', i.invoiceNo, dmy(i.invoicedAt)].filter(Boolean).join(' '),
                    i.paidAt &&
                      `đã thu ${dmy(i.paidAt)}${i.paidAmount === null ? '' : ` · ${vnd(i.paidAmount)}`}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground m-0 text-[12px] leading-[1.5]">{INVOICE_NOTE}</p>
        </Section>
      )}
      {c.licence && (
        <Section title="Hiệu lực bản quyền">
          <p className="tnum m-0 text-[12.5px] leading-[1.5]">
            {dmy(c.licence.from)} – {dmy(c.licence.to)}
          </p>
        </Section>
      )}
    </div>
  )
}
