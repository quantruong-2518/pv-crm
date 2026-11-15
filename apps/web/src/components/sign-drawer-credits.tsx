import { Badge, Button, Checkbox, Icon, Input, Plus, Select, X } from '@pv/ui'
import {
  CONTRACT_CREDITS_MAX,
  CREDIT_TOTAL_BP,
  isSellerRole,
  splitByCredits,
  type CurrencyCode,
} from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import {
  OTHERS_MAX,
  creditsState,
  shareText,
  type CreditOther,
  type CreditsDraft,
  type CreditsIssue,
} from '@/data/contract-credits'
import { useSalesPeople } from '@/data/directory'
import { moneyIn } from '@/components/deal-money/money'
import { Field } from './ops-fields'

/** The credit-split block of the sign drawer (ADR 0155). The closer is the
 *  person pressing, so their row is fixed; the others come from the active
 *  sellers, the same pool the server accepts. Off sends no list at all. */

const CREDIT_ISSUE_WORD: Record<CreditsIssue, Message> = {
  person: message('Chọn người cùng chốt.', 'Pick the co-closer.', '공동 체결자를 선택하세요.'),
  sum: message(
    'Phần chia phải cộng đủ 100%.',
    'The shares must add up to 100%.',
    '배분 합계가 100%여야 합니다.',
  ),
  duplicate: message(
    'Mỗi người chỉ xuất hiện một lần.',
    'Each person can appear only once.',
    '한 사람은 한 번만 넣을 수 있습니다.',
  ),
}

const TIP = message(
  'Ký xong thì không đổi được phần chia.',
  'Once signed, the split cannot change.',
  '체결 후에는 배분을 바꿀 수 없습니다.',
)

export function SignCredits({
  draft,
  onChange,
  closer,
  amount,
  currency,
}: {
  draft: CreditsDraft
  onChange: (next: CreditsDraft) => void
  /** Whoever signs, or raises the request; `null` while the session is not read. */
  closer: { id: string; name: string } | null
  amount: number | null
  currency: CurrencyCode | ''
}) {
  const { t } = useI18n()
  const sellers = useSalesPeople().filter((a) => isSellerRole(a.roleIds))
  const state = creditsState(draft, closer?.id ?? '')
  const parts =
    state.credits && closer && amount !== null && amount > 0
      ? splitByCredits(amount, state.credits, closer.id)
      : []
  const money = moneyIn(currency === '' ? null : currency)
  const moneyOf = (id: string) => {
    const part = parts.find((p) => p.actorId === id)
    return part ? money(part.amountVnd) : ''
  }
  const setOther = (at: number, patch: Partial<CreditOther>) =>
    onChange({
      ...draft,
      others: draft.others.map((o, i) => (i === at ? { ...o, ...patch } : o)),
    })
  const label = t(message('Chia công', 'Credit split', '실적 배분'))

  return (
    <Field label={label} plain hint={t(TIP)}>
      <div className="flex flex-col gap-4">
        <Checkbox
          wrap
          checked={draft.on}
          disabled={closer === null}
          onChange={(on) =>
            onChange(
              on
                ? { on, closerPercent: '', others: [{ actorId: '', percent: '' }] }
                : { on, closerPercent: '', others: [] },
            )
          }
          label={t(
            message(
              'Hợp đồng này có người cùng chốt',
              'Closed together with others',
              '공동 체결자가 있는 계약',
            ),
          )}
          hint={t(
            message(
              'Không chia: toàn bộ giá trị ký tính cho người chốt.',
              'No split: the whole signed value goes to the closer.',
              '배분하지 않으면 체결 금액 전체가 체결 담당자에게 귀속됩니다.',
            ),
          )}
        />
        {draft.on && closer && (
          <div className="flex flex-col gap-3">
            <CreditRow
              who={
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-semibold">{closer.name}</span>
                  <span className="text-muted-foreground text-[11.5px]">
                    {t(message('Người chốt', 'Closer', '체결 담당'))}
                  </span>
                </span>
              }
              name={closer.name}
              percent={draft.closerPercent}
              onPercent={(closerPercent) => onChange({ ...draft, closerPercent })}
              money={moneyOf(closer.id)}
            />
            {draft.others.map((other, at) => {
              const taken = draft.others.map((o) => o.actorId)
              const options = sellers
                .filter(
                  (a) => a.id !== closer.id && (a.id === other.actorId || !taken.includes(a.id)),
                )
                .map((a) => ({ value: a.id, label: a.name }))
              const name = sellers.find((a) => a.id === other.actorId)?.name ?? ''
              return (
                <CreditRow
                  key={at}
                  who={
                    <Select
                      label={t(message('Người cùng chốt', 'Co-closer', '공동 체결자'))}
                      hideLabel
                      size="lg"
                      value={other.actorId}
                      neutralValue=""
                      onChange={(actorId) => setOther(at, { actorId })}
                      options={[
                        {
                          value: '',
                          label: t(message('Chọn người…', 'Choose a person…', '담당자 선택…')),
                        },
                        ...options,
                      ]}
                      className="w-full"
                    />
                  }
                  name={name}
                  percent={other.percent}
                  onPercent={(percent) => setOther(at, { percent })}
                  money={moneyOf(other.actorId)}
                  onRemove={
                    draft.others.length > 1
                      ? () =>
                          onChange({ ...draft, others: draft.others.filter((_, i) => i !== at) })
                      : undefined
                  }
                />
              )
            })}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {draft.others.length < OTHERS_MAX ? (
                <Button
                  size="md"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  onClick={() =>
                    onChange({ ...draft, others: [...draft.others, { actorId: '', percent: '' }] })
                  }
                >
                  <Icon icon={Plus} size={16} />
                  {t(
                    message(
                      `Thêm người (tối đa ${CONTRACT_CREDITS_MAX})`,
                      `Add a person (up to ${CONTRACT_CREDITS_MAX})`,
                      `인원 추가 (최대 ${CONTRACT_CREDITS_MAX}명)`,
                    ),
                  )}
                </Button>
              ) : (
                <span />
              )}
              <TotalLine total={state.total} />
            </div>
            <IssueLine issue={state.issue} />
          </div>
        )}
      </div>
    </Field>
  )
}

function IssueLine({ issue }: { issue: CreditsIssue | null }) {
  const { t } = useI18n()
  if (issue === null) return null
  return <p className="text-destructive-foreground text-[11.5px]">{t(CREDIT_ISSUE_WORD[issue])}</p>
}

function CreditRow({
  who,
  name,
  percent,
  onPercent,
  money,
  onRemove,
}: {
  who: React.ReactNode
  name: string
  percent: string
  onPercent: (text: string) => void
  money: string
  onRemove?: (() => void) | undefined
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 basis-48">{who}</div>
      <div className="w-28 shrink-0">
        <Input
          inputMode="decimal"
          value={percent}
          suffix="%"
          shellClassName="h-12"
          className="tnum text-right"
          aria-label={t(
            message(`Phần của ${name}`.trim(), `Share of ${name}`.trim(), `${name} 몫`.trim()),
          )}
          onChange={(e) => onPercent(e.target.value)}
        />
      </div>
      <span className="tnum text-muted-foreground w-28 shrink-0 text-right text-[12.5px]">
        {money}
      </span>
      {onRemove && (
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:size-12"
          aria-label={t(message('Bỏ người này', 'Remove this person', '이 담당자 제거'))}
          onClick={onRemove}
        >
          <Icon icon={X} size={16} />
        </Button>
      )}
    </div>
  )
}

function TotalLine({ total }: { total: number }) {
  const { t } = useI18n()
  const whole = total === CREDIT_TOTAL_BP
  return (
    <span className="flex items-center gap-3" aria-live="polite">
      <span className="text-muted-foreground text-[12px]">
        {t(message('Tổng', 'Total', '합계'))}
      </span>
      <Badge tone={whole ? 'success' : 'warning'} className="tnum">
        {whole
          ? shareText(total)
          : t(
              message(
                `${shareText(total)} · phải cộng đủ 100%`,
                `${shareText(total)} · must add up to 100%`,
                `${shareText(total)} · 합계가 100%여야 합니다`,
              ),
            )}
      </Badge>
    </span>
  )
}
