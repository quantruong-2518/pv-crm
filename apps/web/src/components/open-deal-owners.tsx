import type { ReactNode } from 'react'
import { Plus } from '@pv/ui'
import { Avatar, Button, Icon, cn } from '@pv/ui'
import { isSellerRole, type OpportunityOpenContext, type StageKey } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type { OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { FieldErrors } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { useDirectory, useSalesPeople } from '@/data/directory'
import { BD_LANE, SALE_LANE, SALE_PRIMARY_COPY, primaryFit, toggled } from '@/data/opportunities'
import { bornStage, lastBdLocked } from '@/data/opportunity-open'
import { opportunityStageLabel } from '@/data/sales-labels-i18n'
import { SectionHead } from './open-deal-basics'
import { PersonTokenField } from './person-token-field'
import { SalePrimaryPick } from './sale-primary-pick'
import type { SetDraft } from './ops-fields'

/** The owners section — the BD lane, the Sale lane, and where the deal is born
 *  once these are filled.
 *
 *  The lanes keep the semantics of `PersonPickField` (ids, multi-select,
 *  sellers only suggested on the Sale lane) and only change how they read:
 *  a label on the left, the chosen people as chips beside it. With two or more
 *  on the Sale lane, one more control asks which of them is the primary. */

const COPY = {
  headAccepts: message(
    'trưởng phòng tạo là đã nhận',
    'creating it as a department head counts as taking ownership',
    '부서장이 만들면 담당을 맡은 것으로 처리됩니다',
  ),
  lastOwner: message(
    'không bỏ được khi chỉ còn bạn chịu trách nhiệm',
    'cannot be removed while you are the only owner left',
    '본인만 담당자로 남아 있으면 제거할 수 없습니다',
  ),
  saleSearch: message(
    'Gõ tên Sale để tìm…',
    'Type a salesperson’s name to search…',
    '영업 담당자 이름을 입력해 검색…',
  ),
  saleLeaveEmpty: message(
    'Để trống, trưởng phòng giao khi Nhận PIC',
    'Leave empty; the department head assigns when taking ownership',
    '비워 두세요. 담당을 맡을 때 부서장이 지정합니다',
  ),
  noSaleLeft: message(
    'Không còn Sale nào để thêm.',
    'No more salespeople to add.',
    '추가할 영업 담당자가 없습니다.',
  ),
}

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
  salePrimary,
  onSalePrimary,
  onSet,
}: {
  draft: OpportunityDraft
  errors: FieldErrors
  me: Actor | null
  canAccept: boolean
  accountOwner: NonNullable<OpportunityOpenContext['account']>['owner'] | undefined
  /** The lane's primary as the form stands; absent on an empty lane. */
  salePrimary: string | undefined
  onSalePrimary: (id: string) => void
  onSet: SetDraft
}) {
  const { t } = useI18n()
  const you = t(message('bạn', 'you', '나'))
  const bdLabel = t(message(BD_LANE.label, 'Business development', '사업 개발'))
  const saleLabel = t(message(SALE_LANE.label, 'Salesperson', '영업 담당자'))
  const owners = t(message('Người chịu trách nhiệm', 'Owners', '담당자'))
  const people = useSalesPeople()
  const fitIds = primaryFit(draft.saleOwners, useDirectory())
  const byId = (id: string) => people.find((a) => a.id === id)
  const locked = lastBdLocked(draft, canAccept)
  const suggested = accountOwner ? byId(accountOwner.id) : undefined
  const sellers = draft.saleOwners.map((id) => ({ id, name: byId(id)?.name ?? id }))
  /* The server refuses a seller naming anyone else on the Sale lane without the
     assign grant, so the form does not offer a name it would turn back. A BD
     opener still proposes the seller. */
  const mayAssign = useCan('opportunity.assign')
  const canAssign = mayAssign || !isSellerRole(me?.roleIds)
  const offerSuggested =
    canAssign &&
    suggested &&
    isSellerRole(suggested.roleIds) &&
    !draft.saleOwners.includes(suggested.id)

  return (
    <section className="flex flex-col gap-4" aria-label={owners}>
      <SectionHead>{owners}</SectionHead>

      <div className="flex flex-col gap-3">
        {canAccept && me && (
          <Lane label={t(message('Nhận PIC', 'Take ownership', '담당 맡기'))}>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="bg-surface-ink/9 flex items-center gap-2 rounded-md p-1 pr-3 text-[12px] font-medium">
                <Avatar size="sm" name={me.name} />
                {me.name}
                <span className="text-muted-foreground font-normal">· {you}</span>
              </span>
              <span className="text-muted-foreground text-[11px]">{t(COPY.headAccepts)}</span>
            </div>
          </Lane>
        )}

        <Lane label={bdLabel}>
          <PersonTokenField
            variant="inline"
            label={bdLabel}
            placeholder={t(
              message('Gõ tên để tìm…', 'Type a name to search…', '이름을 입력해 검색…'),
            )}
            tokens={draft.bdOwners.map((id) => ({
              id,
              name: byId(id)?.name ?? id,
              ...(id === me?.id && { tag: you }),
              ...(locked && { locked: true }),
            }))}
            suggestions={people
              .filter((a) => !draft.bdOwners.includes(a.id))
              .map((a) => ({ id: a.id, name: a.name, note: a.role }))}
            onPick={(id) => onSet('bdOwners', toggled(draft.bdOwners, id))}
            onRemove={(id) => !locked && onSet('bdOwners', toggled(draft.bdOwners, id))}
            hint={locked ? t(COPY.lastOwner) : undefined}
            emptyNote={t(
              message('Không còn ai để thêm.', 'No one left to add.', '추가할 사람이 없습니다.'),
            )}
          />
          {errors.bdOwners && <Refusal text={errors.bdOwners.join(' · ')} />}
        </Lane>

        <Lane label={saleLabel}>
          <PersonTokenField
            variant="inline"
            label={saleLabel}
            placeholder={canAccept ? t(COPY.saleSearch) : t(COPY.saleLeaveEmpty)}
            tokens={sellers.map((s) => ({
              ...s,
              ...(fitIds.length > 1 &&
                s.id === salePrimary && {
                  tag: t(SALE_PRIMARY_COPY),
                }),
            }))}
            suggestions={people
              .filter(
                (a) =>
                  !draft.saleOwners.includes(a.id) &&
                  isSellerRole(a.roleIds) &&
                  (canAssign || a.id === me?.id),
              )
              .map((a) => ({ id: a.id, name: a.name, note: a.role }))}
            onPick={(id) => onSet('saleOwners', toggled(draft.saleOwners, id))}
            onRemove={(id) => onSet('saleOwners', toggled(draft.saleOwners, id))}
            emptyNote={t(COPY.noSaleLeft)}
          />
          {errors.saleOwners && <Refusal text={errors.saleOwners.join(' · ')} />}
          <div className="pt-2 empty:hidden">
            <SalePrimaryPick
              people={sellers.filter((s) => fitIds.includes(s.id))}
              value={salePrimary}
              errors={errors.salePrimary}
              onChange={onSalePrimary}
            />
          </div>
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
              <span className="text-muted-foreground text-[11px]">
                {t(message('người phụ trách công ty', 'company owner', '고객사 담당자'))}
              </span>
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

const STEPS: { key: StageKey; here: Message; elsewhere: Message }[] = [
  {
    key: 'new',
    here: message('cơ hội vào đây', 'the opportunity starts here', '기회가 여기서 시작됩니다'),
    elsewhere: message('bỏ qua', 'skipped', '건너뜀'),
  },
  {
    key: 'assigned',
    here: message(
      'cơ hội vào thẳng đây',
      'the opportunity goes straight here',
      '기회가 바로 여기로 들어갑니다',
    ),
    elsewhere: message(
      'trưởng phòng bấm Nhận PIC',
      'the department head takes ownership',
      '부서장이 담당을 맡음',
    ),
  },
  {
    key: 'engaged',
    here: message('', '', ''),
    elsewhere: message(
      'Sale bắt đầu làm',
      'the salesperson starts work',
      '영업 담당자가 작업 시작',
    ),
  },
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
  const { t, lang } = useI18n()
  const born = bornStage(canAccept)
  const card = wsCode ? (
    <span className="font-mono">{wsCode}</span>
  ) : (
    t(message('lượt bán', 'workstream', '영업 건'))
  )

  return (
    <div className="bg-surface-ink/9 flex flex-col gap-3 rounded-md px-4 py-3">
      <span className="text-muted-foreground text-[12px]">
        {t(message('Sau khi tạo', 'After creating', '만든 후'))}
      </span>
      <ol className="m-0 flex list-none gap-3 p-0">
        {STEPS.map((step) => {
          const here = step.key === born
          return (
            <li key={step.key} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn('h-1 rounded-sm', here ? 'bg-primary' : 'bg-surface-ink/16')} />
              <span className={cn('text-[13px]', here ? 'font-semibold' : 'text-muted-foreground')}>
                {opportunityStageLabel(step.key, lang)}
              </span>
              <span className="text-muted-foreground text-[12px]">
                {t(here ? step.here : step.elsewhere)}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
        {t(message('Bảng lượt bán: thẻ ', 'Workstream board: card ', '영업 건 보드: 카드 '))}
        {card}
        {t(message(' chuyển sang cơ hội · ', ' moves to opportunity · ', '이(가) 기회로 이동 · '))}
        {opportunityStageLabel(born, lang)}.
        {!canAccept &&
          limitDays !== null &&
          t(
            message(
              ` Hạn Nhận PIC là ${limitDays} ngày, quá hạn thì thẻ hiện trễ.`,
              ` The deadline to take ownership is ${limitDays} days; after that the card shows as late.`,
              ` 담당을 맡는 기한은 ${limitDays}일이며, 지나면 카드에 지연으로 표시됩니다.`,
            ),
          )}
      </p>
    </div>
  )
}
