import { useRef, type ReactNode, type SyntheticEvent } from 'react'
import { Timer, TriangleAlert } from '@pv/ui'
import { Badge, Icon, cn, type IconGlyph } from '@pv/ui'
import {
  type ActivityFreshnessLevel,
  type OpportunityBookRow,
  type OpportunityOwner,
} from '@pv/contracts'
import { dmy } from '@/lib/date'
import { message, translate, useI18n, type Message } from '@/app/i18n'
import { opportunityStageLabel, salesLabel } from '@/data/sales-labels-i18n'
import { dueLevelText } from '@/data/contract-copy'
import { fxBasisText, useTodayFx } from '@/data/fx-rate'
import { lateLevel } from '@/data/contracts'
import {
  activityAgo,
  amountVndOf,
  BADGE_INK,
  isLateClose,
  NO_SALE_COPY,
  OVERDUE_COPY,
  saleOwnersOf,
  stageClockOf,
  standingLabel,
  STATE_TONE,
} from '@/data/opportunities'
import { AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { MoneyCell } from '@/components/money-cell'
import { FxText } from '@/components/fx-line'
import { DateCell, Missing, PicCell } from '@/components/book-cells'
import { ROW_ICON } from '@/components/table-bits'

/** Module 3 · the deal book's cells, one per column (ADR 0077 §3–4), split out
 *  of `opportunities.tsx`. Every verdict here is the server's — overdue in
 *  column (`position`), activity freshness, the next step's due level;
 *  a cell only picks the words and the ink, and every inked warning also wears
 *  a glyph and words for whoever cannot see the colour. Rows are a fixed 56px,
 *  so every cell is at most two lines. */

const PENDING_SIGN_WORD = message('chờ duyệt ký', 'awaiting signature approval', '서명 승인 대기')

/** Freshness ink and its spoken word: `fresh` keeps the row's own colour. */
const FRESHNESS_INK: Record<ActivityFreshnessLevel, string | undefined> = {
  fresh: undefined,
  warn: 'text-warning',
  alert: 'text-destructive-foreground',
}
const FRESHNESS_WORD: Record<ActivityFreshnessLevel, Message | undefined> = {
  fresh: undefined,
  warn: message('lâu chưa có hoạt động', 'no activity for a while', '한동안 활동 없음'),
  alert: message(
    'quá lâu chưa có hoạt động',
    'no activity for too long',
    '활동 없는 기간이 너무 김',
  ),
}

/** The non-colour half of a warning: a glyph, and words a screen reader says. */
function Flag({ icon, word }: { icon: IconGlyph; word: string }) {
  return (
    <>
      <Icon icon={icon} size={14} className="shrink-0" />
      <span className="sr-only">{word}</span>
    </>
  )
}

const stop = (event: SyntheticEvent) => event.stopPropagation()

/** The deal's name over `company · contact`, small and italic — the lead book's company cell.
 *  With `onEmail` the contact's name opens the system's mail composer for this
 *  deal and stops the click, or the row would open as well; without it the
 *  name is plain text. The address itself rides in the tooltip. */
export function DealCell({ op, onEmail }: { op: OpportunityBookRow; onEmail?: () => void }) {
  const { t } = useI18n()
  const contact = op.primaryContact
  return (
    <span className="flex min-w-0 flex-col gap-1" title={`${op.code} · ${op.account} — ${op.name}`}>
      <span className="truncate text-[13px] font-semibold">{op.name}</span>
      <span className="text-muted-foreground flex min-w-0 gap-1 text-[11.5px] italic">
        <span className="min-w-0 truncate">{op.account}</span>
        <span aria-hidden>·</span>
        {!contact ? (
          <span className="max-w-[45%] shrink-0 truncate">
            {t(message('Chưa có người liên hệ', 'No contact yet', '연락처 없음'))}
          </span>
        ) : onEmail && contact.email ? (
          <button
            type="button"
            title={t(
              message(
                `Soạn email gửi ${contact.email}`,
                `Write an email to ${contact.email}`,
                `${contact.email}에게 이메일 작성`,
              ),
            )}
            onClick={(event) => {
              stop(event)
              onEmail()
            }}
            onKeyDown={stop}
            /* The hit area grows downward only: upward it would cover the
               deal name, and `truncate` here would clip it. */
            className="hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-0 pointer-coarse:after:-bottom-4 pointer-coarse:after:content-[''] relative max-w-[45%] shrink-0 underline-offset-2 hover:underline"
          >
            <span className="block truncate">{contact.name}</span>
          </button>
        ) : (
          <span
            className="max-w-[45%] shrink-0 truncate"
            title={contact.email ?? t(message('Chưa có email', 'No email yet', '이메일 없음'))}
          >
            {contact.name}
          </span>
        )}
      </span>
    </span>
  )
}

/** The stage pill (law 16). Overdue wins the suffix over a pending signature:
 *  overdue is the seller's to fix, the signature is the approver's. */
export function StageCell({ op }: { op: OpportunityBookRow }) {
  const { t, lang } = useI18n()
  const clock = stageClockOf(op)
  const overdue = clock?.overdue ?? false
  const stage = op.stage === null ? null : opportunityStageLabel(op.stage, lang)
  const suffix = overdue ? t(OVERDUE_COPY) : op.pendingSign ? t(PENDING_SIGN_WORD) : null

  return (
    <Badge
      tone={overdue ? 'warning' : STATE_TONE[op.state]}
      /* Tone inks fall under 4.5:1 on a hovered row (law 13); the tint still carries the colour. */
      className={cn('min-w-0 max-w-full', BADGE_INK)}
      title={
        stage && clock
          ? `${t(message('Giai đoạn', 'Stage', '단계'))} "${stage}" · ${salesLabel(clock.label, lang)}`
          : t(message('Cơ hội đã kết thúc', 'Opportunity closed', '기회 종료'))
      }
    >
      <span className="min-w-0 truncate">
        {salesLabel(standingLabel(op), lang)}
        {suffix && ` · ${suffix}`}
      </span>
    </Badge>
  )
}

/** The deal's figure in VND, full digits. A foreign currency keeps its own
 *  figure and the rate behind the conversion on one line under it. */
export function AmountCell({ op }: { op: OpportunityBookRow }) {
  const { t, number, lang } = useI18n()
  const fx = useTodayFx(op.currency)
  const amountVnd = amountVndOf(op, fx)
  /* The rate has not arrived: show the deal's own figure rather than a dash. */
  const waiting =
    amountVnd === null && op.amount !== null && op.currency !== null && op.currency !== 'VND'
  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      <MoneyCell
        amount={waiting ? op.amount : amountVnd}
        currency={waiting ? op.currency : undefined}
        missing={t(message('Chưa có giá trị dự kiến', 'No expected value yet', '예상 금액 없음'))}
      />
      {fx && amountVnd !== null && op.amount !== null && (
        <FxText
          text={`${number(op.amount)} ${op.currency} · ${number(fx.rate)}`}
          title={`${number(op.amount)} ${op.currency} · ${fxBasisText(fx, lang)}`}
          compact
        />
      )}
    </span>
  )
}

/** A closed deal prints the day it closed; an open one its expected day, in
 *  warning once that day has passed. */
export function CloseCell({ op }: { op: OpportunityBookRow }) {
  const { t } = useI18n()
  const closed = op.stage === null
  const day = closed ? op.closedAt : op.expectedClose
  const late = isLateClose(op)
  const empty = t(
    closed
      ? message('Chưa ghi ngày kết thúc', 'No end date recorded', '종료일 미기록')
      : message('Chưa đặt ngày dự kiến chốt', 'No expected close date set', '예상 마감일 미설정'),
  )
  if (day === null) return <DateCell day={day} empty={empty} />
  return (
    <span
      className={cn('flex items-center gap-1', late && 'text-warning')}
      title={t(
        closed
          ? message('Ngày kết thúc thực tế', 'Actual end date', '실제 종료일')
          : late
            ? message(
                'Cơ hội đã quá ngày dự kiến chốt',
                'The opportunity is past its expected close date',
                '예상 마감일이 지났습니다',
              )
            : message('Ngày dự kiến chốt', 'Expected close date', '예상 마감일'),
      )}
    >
      {late && <Flag icon={TriangleAlert} word={t(OVERDUE_COPY)} />}
      <DateCell day={day} empty={empty} />
    </span>
  )
}

/** Each owner as the shared PIC cell reads them: the lane's word, the primary flag. */
const LANE_WORD: Record<OpportunityOwner['role'], Message> = {
  BD: message('BD', 'BD', 'BD'),
  SALE: message('Sale', 'Sales', '영업'),
}
const picsOf = (owners: readonly OpportunityOwner[]) =>
  owners.map((o) => ({
    id: o.id,
    name: o.name,
    role: translate(LANE_WORD[o.role]),
    primary: o.primary,
  }))

/** A lane's owners. Also the nurturing deal tab's Sale cell. */
export function PeopleCell({ owners, missing }: { owners: OpportunityOwner[]; missing: string }) {
  useI18n()
  return <PicCell people={picsOf(owners)} empty={missing} />
}

/** The Sale lane's people, then the act that fills it — the lead book's
 *  `LeadPicCell`: accept on a `new` deal, assign on one with no seller (ADR
 *  0071). The assign verdict is the server's (`canAssign`). */
export function SaleCell({ op, canAccept }: { op: OpportunityBookRow; canAccept: boolean }) {
  const { t } = useI18n()
  const owners = saleOwnersOf(op)
  /* Mounted for every open row so the modal outlives the accept that moves it. */
  const accept = canAccept && op.state === 'open'
  const accepting = accept && op.stage === 'new'
  const assigning = op.canAssign && !op.hasSeller
  const bare = owners.length === 0 && !accepting && !assigning

  const acts = (
    <>
      {accept && <RowAccept code={op.code} owners={op.owners} show={accepting} />}
      {assigning && (
        <RowAct>
          <AssignSaleButton
            op={op}
            hasSeller={false}
            size="sm"
            variant="ghost"
            iconOnly
            className={ROW_ICON}
          />
        </RowAct>
      )}
    </>
  )
  /* Bare: the dash stands alone and the hidden accept box rides beside it. */
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PicCell
        people={picsOf(owners)}
        empty={t(NO_SALE_COPY)}
        max={2}
        action={bare ? undefined : acts}
      />
      {bare && acts}
    </span>
  )
}

/** Open deals: days since the last customer-facing activity, inked by the
 *  server's verdict. Closed deals: the day they closed. */
export function LastActivityCell({ op }: { op: OpportunityBookRow }) {
  const { t } = useI18n()
  if (op.state !== 'open') {
    return (
      <span
        className="text-muted-foreground"
        title={t(message('Ngày kết thúc cơ hội', 'Opportunity end date', '기회 종료일'))}
      >
        <DateCell
          day={op.closedAt}
          empty={t(message('Chưa ghi ngày kết thúc', 'No end date recorded', '종료일 미기록'))}
        />
      </span>
    )
  }
  const at = op.lastActivityAt
  const word = op.activityFreshness && FRESHNESS_WORD[op.activityFreshness]
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1',
        op.activityFreshness && FRESHNESS_INK[op.activityFreshness],
      )}
      title={
        at
          ? t(
              message(
                `Hoạt động cuối ${dmy(at)}`,
                `Last activity ${dmy(at)}`,
                `마지막 활동 ${dmy(at)}`,
              ),
            )
          : t(message('Chưa có hoạt động nào', 'No activity yet', '활동 없음'))
      }
    >
      {word && <Flag icon={Timer} word={t(word)} />}
      <span className="truncate">
        {at ? activityAgo(at) : t(message('Chưa có', 'None yet', '없음'))}
      </span>
    </span>
  )
}

/** The last column, "title · due" on one line: the title truncates, the due
 *  day never does. The accept and assign acts sit in the Sale column. */
export function NextStepCell({ op }: { op: OpportunityBookRow }) {
  const { t, lang } = useI18n()
  const step = op.nextStep
  if (!step) {
    return (
      <Missing
        why={t(message('Chưa đặt việc tiếp theo', 'No next step set', '다음 단계 미설정'))}
      />
    )
  }
  const late = lateLevel(step.dueLevel)
  const lateTag = late ? ` · ${dueLevelText(late, lang)}` : ''
  return (
    <span
      className="flex min-w-0"
      title={t(
        message(
          `${step.text} · hạn ${dmy(step.due)}${lateTag}`,
          `${step.text} · due ${dmy(step.due)}${lateTag}`,
          `${step.text} · 기한 ${dmy(step.due)}${lateTag}`,
        ),
      )}
    >
      <span className="truncate">{step.text}</span>
      <span className="shrink-0 whitespace-pre">
        {' · '}
        <span
          className={cn(
            'tnum font-num inline-flex items-center gap-1',
            late && 'text-destructive-foreground',
          )}
        >
          {late && <Flag icon={TriangleAlert} word={dueLevelText(late, lang)} />}
          {dmy(step.due)}
        </span>
      </span>
    </span>
  )
}

/** Stops clicks and keys from opening the row: modal events bubble through the
 *  React tree, out of the portal and into the row's own handler. */
function RowAct({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0" onClick={stop} onKeyDown={stop}>
      {children}
    </span>
  )
}

/** Accept from the row; focus then moves to the next row, else the queue chip. */
function RowAccept({
  code,
  owners,
  show,
}: {
  code: string
  owners: OpportunityOwner[]
  show: boolean
}) {
  const box = useRef<HTMLSpanElement>(null)
  const next = useRef<HTMLElement | null>(null)
  const nextRow = () => {
    let row = box.current?.closest('[role="row"]')?.nextElementSibling ?? null
    while (row && !(row instanceof HTMLElement && row.tabIndex >= 0)) row = row.nextElementSibling
    return row
  }
  return (
    /* `hidden`, not dropped: the stop wrapper must outlive the open modal, and
       a hidden box is no flex item, so the cell's gap skips it. */
    <span ref={box} className={show ? 'flex shrink-0' : 'hidden'}>
      <RowAct>
        <AcceptDealButton
          code={code}
          owners={owners}
          show={show}
          size="sm"
          variant="ghost"
          iconOnly
          className={ROW_ICON}
          onAccepted={() => (next.current = nextRow())}
          returnFocus={() => (next.current?.isConnected ? next.current : null)}
        />
      </RowAct>
    </span>
  )
}
