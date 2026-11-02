import type { ReactNode } from 'react'
import { Chip, FileText, Icon, RadialGauge, type RadialGaugeTone } from '@pv/ui'
import type { OpportunityMoneyContract } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { dm } from '@/lib/date'
import { QUOTE_PENDING, standingText } from '@/data/installment-copy'
import { useContractKindLabel } from '@/data/sales-config'
import { NO_AMOUNT_COPY, compactMoney, kindLabel, ratioOfShare, type Standing } from './money'
import type { Paper } from './papers'
import { TintBadge } from './tint-badge'

/** The face of each card in the contract block: what the paper is, how far
 *  collecting has come and where it stands. A paper whose payments this reader
 *  may not see gets no badge and no ring. */

const RING_TONE: Record<Standing['tone'], RadialGaugeTone> = {
  danger: 'danger',
  success: 'success',
  running: 'primary',
}

export function QuoteCard({ paper }: { paper: Extract<Paper, { kind: 'quote' }> }) {
  const { negotiation: n, round } = paper
  const { t, lang } = useI18n()
  const resolveKind = useContractKindLabel()
  return (
    <>
      <Top
        badge={<TintBadge tone="running">{t(QUOTE_PENDING)}</TintBadge>}
        side={t(message('chưa ký', 'not signed', '미체결'))}
      />
      <Body
        ring={<Placeholder />}
        kind={kindLabel(n.kind, resolveKind, lang)}
        amount={n.amount === null ? t(NO_AMOUNT_COPY) : compactMoney(n.amount, n.currency)}
      />
      <span className="text-muted-foreground tnum text-[12px]">
        {round
          ? t(message(`Lần ${round.roundNo}`, `Round ${round.roundNo}`, `${round.roundNo}차`))
          : t(message('Báo giá', 'Quotation', '견적서'))}
        {round?.validUntil &&
          t(
            message(
              ` · hiệu lực đến ${dm(round.validUntil)}`,
              ` · valid until ${dm(round.validUntil)}`,
              ` · ${dm(round.validUntil)}까지 유효`,
            ),
          )}
      </span>
    </>
  )
}

export function ContractCard({
  contract: c,
  standing,
}: {
  contract: OpportunityMoneyContract
  standing: Standing | null
}) {
  const { t, lang } = useI18n()
  const resolveKind = useContractKindLabel()
  return (
    <>
      <Top
        badge={
          standing && (
            <TintBadge tone={standing.tone}>{standingText(standing.tone, lang)}</TintBadge>
          )
        }
        side={t(
          message(`ký ${dm(c.signedAt)}`, `signed ${dm(c.signedAt)}`, `${dm(c.signedAt)} 체결`),
        )}
      />
      <Body
        ring={<Ring contract={c} standing={standing} />}
        kind={kindLabel(c.kind, resolveKind, lang)}
        amount={c.amount === null ? t(NO_AMOUNT_COPY) : compactMoney(c.amount, c.currency)}
      />
      <span className="flex items-center gap-2">
        <Chip>{c.code}</Chip>
        <span className="text-muted-foreground tnum text-[12px]">{metaOf(c, t)}</span>
      </span>
    </>
  )
}

const metaOf = (c: OpportunityMoneyContract, t: (copy: Message) => string) =>
  [
    c.rounds.length > 0 &&
      t(
        message(
          `${c.rounds.length} lần báo giá`,
          `${c.rounds.length} quotation rounds`,
          `견적 ${c.rounds.length}회`,
        ),
      ),
    c.files.contract > 0
      ? t(
          message(
            `${c.files.contract} tệp`,
            `${c.files.contract} files`,
            `파일 ${c.files.contract}개`,
          ),
        )
      : t(message('chưa có tệp', 'no files yet', '파일 없음')),
  ]
    .filter(Boolean)
    .join(' · ')

function Top({ badge, side }: { badge: ReactNode; side: string }) {
  return (
    <span className="flex items-center gap-2">
      {badge}
      <span className="text-muted-foreground tnum ml-auto text-[12px]">{side}</span>
    </span>
  )
}

function Body({ ring, kind, amount }: { ring: ReactNode; kind: string; amount: string }) {
  return (
    <span className="flex items-center gap-4">
      {ring}
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-semibold">{kind}</span>
        <span className="tnum font-num text-[18px] font-semibold leading-[1.3]">{amount}</span>
      </span>
    </span>
  )
}

function Ring({
  contract: c,
  standing,
}: {
  contract: OpportunityMoneyContract
  standing: Standing | null
}) {
  const { t } = useI18n()
  if (!standing || c.collectedShare === null) return <Placeholder />
  return (
    <RadialGauge
      size={64}
      value={ratioOfShare(c.collectedShare)}
      center={`${c.collectedShare}%`}
      label={t(message('Đã thu', 'Collected', '수금액'))}
      tone={RING_TONE[standing.tone]}
    />
  )
}

/** A quote, or a paper with no figure to ring. */
function Placeholder() {
  return (
    <span className="bg-surface-ink/9 text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-md">
      <Icon icon={FileText} size={20} />
    </span>
  )
}
