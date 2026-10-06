import type { ReactNode } from 'react'
import { Plus } from '@pv/ui'
import { Avatar, Button, Icon, cn } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  isSellerRole,
  type OpportunityOpenContext,
  type StageKey,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type { OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { FieldErrors } from '@/app/api'
import { useSalesPeople } from '@/data/directory'
import { toggled } from '@/data/opportunities'
import { bornStage, lastBdLocked } from '@/data/opportunity-open'
import { SectionHead } from './open-deal-basics'
import { PersonTokenField } from './person-token-field'
import type { SetDraft } from './ops-fields'

/** The owners section — the BD lane, the Sale lane, and where the deal is born
 *  once these are filled.
 *
 *  The lanes keep the semantics of `PersonPickField` (ids, multi-select,
 *  sellers only suggested on the Sale lane) and only change how they read:
 *  a label on the left, the chosen people as chips beside it. */

const Lane = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid items-start gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
    <span className="text-muted-foreground pt-3 text-[12px] font-medium">{label}</span>
    <div className="min-w-0">{children}</div>
  </div>
)

export function OwnersSection({
  draft,
  errors,
  me,
  canAccept,
  accountOwner,
  onSet,
}: {
  draft: OpportunityDraft
  errors: FieldErrors
  me: Actor | null
  canAccept: boolean
  accountOwner: NonNullable<OpportunityOpenContext['account']>['owner'] | undefined
  onSet: SetDraft
}) {
  const people = useSalesPeople()
  const byId = (id: string) => people.find((a) => a.id === id)
  const locked = lastBdLocked(draft, canAccept)
  const suggested = accountOwner ? byId(accountOwner.id) : undefined
  const offerSuggested =
    suggested && isSellerRole(suggested.roleIds) && !draft.saleOwners.includes(suggested.id)

  return (
    <section className="flex flex-col gap-4" aria-label="Người chịu trách nhiệm">
      <SectionHead>Người chịu trách nhiệm</SectionHead>

      <div className="flex flex-col gap-3">
        {canAccept && me && (
          <Lane label="Nhận PIC">
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="bg-surface-ink/9 flex items-center gap-2 rounded-md p-1 pr-3 text-[12px] font-medium">
                <Avatar size="sm" name={me.name} />
                {me.name}
                <span className="text-muted-foreground font-normal">· bạn</span>
              </span>
              <span className="text-muted-foreground text-[11px]">trưởng phòng tạo là đã nhận</span>
            </div>
          </Lane>
        )}

        <Lane label="BD mở cửa">
          <PersonTokenField
            variant="inline"
            label="BD mở cửa"
            placeholder="Gõ tên để tìm…"
            tokens={draft.bdOwners.map((id) => ({
              id,
              name: byId(id)?.name ?? id,
              ...(id === me?.id && { tag: 'bạn' }),
              ...(locked && { locked: true }),
            }))}
            suggestions={people
              .filter((a) => !draft.bdOwners.includes(a.id))
              .map((a) => ({ id: a.id, name: a.name, note: a.role }))}
            onPick={(id) => onSet('bdOwners', toggled(draft.bdOwners, id))}
            onRemove={(id) => !locked && onSet('bdOwners', toggled(draft.bdOwners, id))}
            hint={locked ? 'không bỏ được khi chỉ còn bạn chịu trách nhiệm' : undefined}
            emptyNote="Cả phòng đã có trong danh sách này."
          />
          {errors.bdOwners && <Refusal text={errors.bdOwners.join(' · ')} />}
        </Lane>

        <Lane label="Sale đứng đơn">
          <PersonTokenField
            variant="inline"
            label="Sale đứng đơn"
            placeholder={
              canAccept ? 'Gõ tên Sale để tìm…' : 'Để trống — trưởng phòng giao khi Nhận PIC'
            }
            tokens={draft.saleOwners.map((id) => ({ id, name: byId(id)?.name ?? id }))}
            suggestions={people
              .filter((a) => !draft.saleOwners.includes(a.id) && isSellerRole(a.roleIds))
              .map((a) => ({ id: a.id, name: a.name, note: a.role }))}
            onPick={(id) => onSet('saleOwners', toggled(draft.saleOwners, id))}
            onRemove={(id) => onSet('saleOwners', toggled(draft.saleOwners, id))}
            emptyNote="Không còn Sale nào để thêm."
          />
          {errors.saleOwners && <Refusal text={errors.saleOwners.join(' · ')} />}
          {offerSuggested && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => onSet('saleOwners', [...draft.saleOwners, suggested.id])}
              >
                <Icon icon={Plus} size={16} />
                {suggested.name}
              </Button>
              <span className="text-muted-foreground text-[11px]">người phụ trách công ty</span>
            </div>
          )}
        </Lane>
      </div>
    </section>
  )
}

const Refusal = ({ text }: { text: string }) => (
  <p role="alert" className="text-destructive-foreground m-0 pt-2 text-[11px] leading-[1.5]">
    {text}
  </p>
)

const STEPS: { key: StageKey; here: string; elsewhere: string }[] = [
  { key: 'new', here: 'cơ hội vào đây', elsewhere: 'bỏ qua' },
  { key: 'assigned', here: 'cơ hội vào thẳng đây', elsewhere: 'trưởng phòng bấm Nhận PIC' },
  { key: 'engaged', here: '', elsewhere: 'Sale bắt đầu làm' },
]

/** Where the deal lands, drawn as the three rungs it can be born on. Only a
 *  head skips the first: their own act is the accept (ADR 0071 §3). */
export function AfterCreate({
  canAccept,
  wsCode,
  limitDays,
}: {
  canAccept: boolean
  wsCode: string | undefined
  limitDays: number | null
}) {
  const born = bornStage(canAccept)
  const card = wsCode ? <span className="font-mono">{wsCode}</span> : 'lượt bán'

  return (
    <div className="bg-surface-ink/9 flex flex-col gap-3 rounded-md px-4 py-3">
      <span className="text-muted-foreground text-[12px]">Sau khi tạo</span>
      <ol className="m-0 flex list-none gap-3 p-0">
        {STEPS.map((step) => {
          const here = step.key === born
          return (
            <li key={step.key} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn('h-1 rounded-sm', here ? 'bg-primary' : 'bg-surface-ink/16')} />
              <span className={cn('text-[13px]', here ? 'font-semibold' : 'text-muted-foreground')}>
                {OPPORTUNITY_STAGE_LABEL[step.key]}
              </span>
              <span className="text-muted-foreground text-[12px]">
                {here ? step.here : step.elsewhere}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
        Bảng lượt bán: thẻ {card} chuyển sang cơ hội · {OPPORTUNITY_STAGE_LABEL[born]}.
        {!canAccept &&
          limitDays !== null &&
          ` Hạn Nhận PIC là hạn cột Khởi tạo ở Thiết lập (${limitDays} ngày) — quá hạn thì thẻ hiện trễ.`}
      </p>
    </div>
  )
}
