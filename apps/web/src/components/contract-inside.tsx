import type { ReactNode } from 'react'
import { Badge, StatusDot, cn, type StatusDotState } from '@pv/ui'
import {
  DOC_STATE_LABEL,
  type DocState,
  type JourneyContract,
  type JourneyRungState,
} from '@pv/contracts'
import { dm, dmy } from '@/lib/date'
import { BADGE_INK } from '@/data/opportunities'
import { DueBadge } from '@/components/contract-bits'
import { formatCurrency, message, useI18n, type Message } from '@/app/i18n'

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

const INVOICE_NOTE = message(
  'Chỉ ghi số và ngày hoá đơn, ngày và số tiền đã thu.',
  'Only the invoice number and date, and the date and amount collected, are recorded.',
  '송장 번호와 날짜, 수금 날짜와 금액만 기록합니다.',
)

const DOC_STATE: Record<DocState, Message> = {
  complete: message(DOC_STATE_LABEL.complete, 'Complete', '완비'),
  'awaiting-signature': message(
    DOC_STATE_LABEL['awaiting-signature'],
    'Awaiting signature',
    '서명 대기',
  ),
  missing: message(DOC_STATE_LABEL.missing, 'Missing', '없음'),
}

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
  const { t } = useI18n()
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {c.milestones.length > 0 && (
        <Section title={t(message('Các mốc triển khai', 'Deployment milestones', '구축 단계'))}>
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
                  {m.at
                    ? dm(m.at)
                    : m.due &&
                      t(message(`hạn ${dm(m.due)}`, `due ${dm(m.due)}`, `기한 ${dm(m.due)}`))}
                </span>
                {/* `done` is a money word, so a finished milestone shows its date only. */}
                {m.dueLevel && m.dueLevel !== 'done' && <DueBadge level={m.dueLevel} />}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.acceptance.length > 0 && (
        <Section title={t(message('Biên bản nghiệm thu', 'Acceptance documents', '검수 문서'))}>
          <ul role="list" className={ROWS}>
            {c.acceptance.map((a, i) => (
              <li key={`${i}:${a.label}`} className={ROW}>
                <span className="min-w-0 grow break-words">{a.label}</span>
                {a.at && (
                  <span className="text-muted-foreground tnum text-[12px]">{dmy(a.at)}</span>
                )}
                <Badge tone={DOC_TONE[a.state]} className={cn(a.state === 'missing' && BADGE_INK)}>
                  {t(DOC_STATE[a.state])}
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.installments.length > 0 && (
        <Section title={t(message('Các đợt thanh toán', 'Installments', '납부 회차'))}>
          <ul role="list" className={ROWS}>
            {c.installments.map((i) => (
              <li key={i.no} className="flex min-w-0 flex-col gap-1 py-2">
                <span className="flex flex-wrap items-center gap-2 text-[12.5px] leading-[1.5]">
                  <span className="min-w-0 grow break-words font-medium">{i.label}</span>
                  <span className="tnum">{formatCurrency(i.amount, 'VND')}</span>
                  <DueBadge level={i.dueLevel} />
                </span>
                <span className="text-muted-foreground tnum text-[12px] leading-[1.5]">
                  {[
                    `${i.share}%`,
                    t(message(`hạn ${dmy(i.due)}`, `due ${dmy(i.due)}`, `기한 ${dmy(i.due)}`)),
                    i.invoicedAt &&
                      [t(message('hoá đơn', 'invoice', '송장')), i.invoiceNo, dmy(i.invoicedAt)]
                        .filter(Boolean)
                        .join(' '),
                    i.paidAt &&
                      `${t(message(`đã thu ${dmy(i.paidAt)}`, `collected ${dmy(i.paidAt)}`, `수금 ${dmy(i.paidAt)}`))}${i.paidAmount === null ? '' : ` · ${formatCurrency(i.paidAmount, 'VND')}`}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground m-0 text-[12px] leading-[1.5]">{t(INVOICE_NOTE)}</p>
        </Section>
      )}
      {c.licence && (
        <Section title={t(message('Hiệu lực bản quyền', 'Licence validity', '라이선스 유효 기간'))}>
          <p className="tnum m-0 text-[12.5px] leading-[1.5]">
            {dmy(c.licence.from)} – {dmy(c.licence.to)}
          </p>
        </Section>
      )}
    </div>
  )
}
