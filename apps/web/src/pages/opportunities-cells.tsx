import { useRef, type ReactNode, type SyntheticEvent } from 'react'
import { Timer, TriangleAlert } from '@pv/ui'
import { Badge, Icon, cn, type IconGlyph } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  type ActivityFreshnessLevel,
  type OpportunityBookRow,
  type OpportunityOwner,
} from '@pv/contracts'
import { dmy } from '@/lib/date'
import { DUE_LABEL, lateLevel } from '@/data/contracts'
import {
  activityAgo,
  amountVndOf,
  BADGE_INK,
  isLateClose,
  NO_SALE,
  OVERDUE_WORD,
  saleOwnersOf,
  stageClockOf,
  standingLabel,
  STATE_TONE,
} from '@/data/opportunities'
import { AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { MoneyCell } from '@/components/money-cell'
import { DateCell, Missing, PicCell } from '@/components/book-cells'
import { ROW_ICON } from '@/components/table-bits'

/** Module 3 · the deal book's cells, one per column (ADR 0077 §3–4), split out
 *  of `opportunities.tsx`. Every verdict here is the server's — overdue in
 *  column (`position`), activity freshness, the next step's due level;
 *  a cell only picks the words and the ink, and every inked warning also wears
 *  a glyph and words for whoever cannot see the colour. Rows are a fixed 56px,
 *  so every cell is at most two lines. */

const PENDING_SIGN_WORD = 'chờ duyệt ký'

/** Freshness ink and its spoken word: `fresh` keeps the row's own colour. */
const FRESHNESS_INK: Record<ActivityFreshnessLevel, string | undefined> = {
  fresh: undefined,
  warn: 'text-warning',
  alert: 'text-destructive-foreground',
}
const FRESHNESS_WORD: Record<ActivityFreshnessLevel, string | undefined> = {
  fresh: undefined,
  warn: 'lâu chưa có hoạt động',
  alert: 'quá lâu chưa có hoạt động',
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
  const contact = op.primaryContact
  return (
    <span className="flex min-w-0 flex-col gap-1" title={`${op.code} · ${op.account} — ${op.name}`}>
      <span className="truncate text-[13px] font-semibold">{op.name}</span>
      <span className="text-muted-foreground flex min-w-0 gap-1 text-[11.5px] italic">
        <span className="min-w-0 truncate">{op.account}</span>
        <span aria-hidden>·</span>
        {!contact ? (
          <span className="max-w-[45%] shrink-0 truncate">Chưa có người liên hệ</span>
        ) : onEmail && contact.email ? (
          <button
            type="button"
            title={`Soạn email gửi ${contact.email}`}
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
          <span className="max-w-[45%] shrink-0 truncate" title={contact.email ?? 'Chưa có email'}>
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
  const clock = stageClockOf(op)
  const overdue = clock?.overdue ?? false
  const stage = op.stage === null ? null : OPPORTUNITY_STAGE_LABEL[op.stage]
  const suffix = overdue ? OVERDUE_WORD : op.pendingSign ? PENDING_SIGN_WORD : null

  return (
    <Badge
      tone={overdue ? 'warning' : STATE_TONE[op.state]}
      /* Tone inks fall under 4.5:1 on a hovered row (law 13); the tint still carries the colour. */
      className={cn('min-w-0 max-w-full', BADGE_INK)}
      title={stage && clock ? `Giai đoạn "${stage}" · ${clock.label}` : 'Cơ hội đã kết thúc'}
    >
      <span className="min-w-0 truncate">
        {standingLabel(op)}
        {suffix && ` · ${suffix}`}
      </span>
    </Badge>
  )
}

/** The deal's figure in VND, full digits; a foreign currency keeps its own
 *  figure in `title`. */
export function AmountCell({ op }: { op: OpportunityBookRow }) {
  const amountVnd = amountVndOf(op)
  return (
    <MoneyCell
      amount={amountVnd}
      missing="Chưa có giá trị dự kiến"
      title={
        amountVnd === null || op.amount === null || op.currency === 'VND'
          ? undefined
          : `${op.amount.toLocaleString('vi-VN')} ${op.currency} quy ra đồng`
      }
    />
  )
}

/** A closed deal prints the day it closed; an open one its expected day, in
 *  warning once that day has passed. */
export function CloseCell({ op }: { op: OpportunityBookRow }) {
  const closed = op.stage === null
  const day = closed ? op.closedAt : op.expectedClose
  const late = isLateClose(op)
  const empty = closed ? 'Chưa ghi ngày kết thúc' : 'Chưa đặt ngày dự kiến chốt'
  if (day === null) return <DateCell day={day} empty={empty} />
  return (
    <span
      className={cn('flex items-center gap-1', late && 'text-warning')}
      title={
        closed
          ? 'Ngày kết thúc thực tế'
          : late
            ? 'Cơ hội đã quá ngày dự kiến chốt'
            : 'Ngày dự kiến chốt'
      }
    >
      {late && <Flag icon={TriangleAlert} word={OVERDUE_WORD} />}
      <DateCell day={day} empty={empty} />
    </span>
  )
}

/** Each owner as the shared PIC cell reads them: the lane's word, the primary flag. */
const LANE_WORD: Record<OpportunityOwner['role'], string> = { BD: 'BD', SALE: 'Sale' }
const picsOf = (owners: readonly OpportunityOwner[]) =>
  owners.map((o) => ({ id: o.id, name: o.name, role: LANE_WORD[o.role], primary: o.primary }))

/** A lane's owners. Also the nurturing deal tab's Sale cell. */
export function PeopleCell({ owners, missing }: { owners: OpportunityOwner[]; missing: string }) {
  return <PicCell people={picsOf(owners)} empty={missing} />
}

/** The Sale lane's people, then the act that fills it — the lead book's
 *  `LeadPicCell`: accept on a `new` deal, assign on one with no seller (ADR
 *  0071). The assign verdict is the server's (`canAssign`). */
export function SaleCell({ op, canAccept }: { op: OpportunityBookRow; canAccept: boolean }) {
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
      <PicCell people={picsOf(owners)} empty={NO_SALE} max={2} action={bare ? undefined : acts} />
      {bare && acts}
    </span>
  )
}

/** Open deals: days since the last customer-facing activity, inked by the
 *  server's verdict. Closed deals: the day they closed. */
export function LastActivityCell({ op }: { op: OpportunityBookRow }) {
  if (op.state !== 'open') {
    return (
      <span className="text-muted-foreground" title="Ngày kết thúc cơ hội">
        <DateCell day={op.closedAt} empty="Chưa ghi ngày kết thúc" />
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
      title={at ? `Hoạt động cuối ${dmy(at)}` : 'Chưa có hoạt động nào'}
    >
      {word && <Flag icon={Timer} word={word} />}
      <span className="truncate">{at ? activityAgo(at) : 'Chưa có'}</span>
    </span>
  )
}

/** The last column, "title · due" on one line: the title truncates, the due
 *  day never does. The accept and assign acts sit in the Sale column. */
export function NextStepCell({ op }: { op: OpportunityBookRow }) {
  const step = op.nextStep
  if (!step) return <Missing why="Chưa đặt việc tiếp theo" />
  const late = lateLevel(step.dueLevel)
  return (
    <span
      className="flex min-w-0"
      title={`${step.text} · hạn ${dmy(step.due)}${late ? ` · ${DUE_LABEL[late]}` : ''}`}
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
          {late && <Flag icon={TriangleAlert} word={DUE_LABEL[late]} />}
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
