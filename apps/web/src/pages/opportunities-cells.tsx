import { useRef, type ReactNode, type SyntheticEvent } from 'react'
import { Timer, TriangleAlert } from '@pv/ui'
import { AvatarGroup, Badge, Icon, billions, cn, type IconGlyph } from '@pv/ui'
import {
  OPPORTUNITY_STAGE_LABEL,
  type ActivityFreshnessLevel,
  type OpportunityBookRow,
  type OpportunityOwner,
} from '@pv/contracts'
import { dm } from '@/lib/date'
import { DUE_LABEL } from '@/data/contracts'
import {
  activityAgo,
  amountVndOf,
  BADGE_INK,
  isLateClose,
  namesOf,
  OVERDUE_WORD,
  stageClockOf,
  standingLabel,
  STATE_TONE,
} from '@/data/opportunities'
import { ACCEPT_QUEUE_ID, AcceptDealButton } from '@/components/opportunity-accept'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { PicCell } from '@/components/table-bits'
import { lateLevel } from './workstream-tree-model'

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

function Dash({ title }: { title: string }) {
  return (
    <span className="text-muted-foreground" title={title}>
      —
    </span>
  )
}

const stop = (event: SyntheticEvent) => event.stopPropagation()

/** Deal over `contact · email`, small and italic — the lead book's company cell.
 *  With `onEmail` the address opens the system's mail composer for this deal and
 *  stops the click, or the row would open as well; without it the address is
 *  plain text. */
export function DealCell({ op, onEmail }: { op: OpportunityBookRow; onEmail?: () => void }) {
  const contact = op.primaryContact
  return (
    <span className="flex min-w-0 flex-col gap-1" title={`${op.code} · ${op.account} — ${op.name}`}>
      <span className="truncate text-[13px] font-semibold">
        {op.account} · {op.name}
      </span>
      <span className="text-muted-foreground flex min-w-0 gap-1 text-[11.5px] italic">
        {contact ? (
          <>
            <span className="max-w-[45%] shrink-0 truncate">{contact.name}</span>
            <span aria-hidden>·</span>
            {!contact.email ? (
              <span className="truncate">Chưa có email</span>
            ) : onEmail ? (
              <button
                type="button"
                title={`Soạn email gửi ${contact.email}`}
                onClick={(event) => {
                  stop(event)
                  onEmail()
                }}
                onKeyDown={stop}
                className="hover:text-foreground pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-4 pointer-coarse:after:content-[''] relative truncate underline-offset-2 hover:underline"
              >
                {contact.email}
              </button>
            ) : (
              <span className="truncate">{contact.email}</span>
            )}
          </>
        ) : (
          <span className="truncate">Chưa có người liên hệ</span>
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
      /* `BADGE_INK` only where the pill wears the lost tone — law 13. */
      className={cn('min-w-0 max-w-full', !overdue && op.state === 'lost' && BADGE_INK)}
      title={
        stage && clock ? `Cột "${stage}" · ${clock.label}` : 'Đã đóng sổ — đơn ra khỏi bốn cột'
      }
    >
      <span className="min-w-0 truncate">
        {standingLabel(op)}
        {suffix && ` · ${suffix}`}
      </span>
    </Badge>
  )
}

/** Right-aligned and mono so thousands line up down the column; a foreign
 *  currency keeps its own figure in `title`. */
export function AmountCell({ op }: { op: OpportunityBookRow }) {
  const amountVnd = amountVndOf(op)
  if (op.amount === null || amountVnd === null) {
    return <Dash title="Chưa có giá trị đơn" />
  }
  return (
    <span
      className="tnum block truncate font-mono text-[11.5px]"
      title={
        op.currency === 'VND'
          ? undefined
          : `${op.amount.toLocaleString('vi-VN')} ${op.currency} quy ra đồng`
      }
    >
      {billions(amountVnd)}
    </span>
  )
}

/** A closed deal prints the day it closed; an open one its expected day, in
 *  warning once that day has passed. */
export function CloseCell({ op }: { op: OpportunityBookRow }) {
  const closed = op.stage === null
  const day = closed ? op.closedAt : op.expectedClose
  if (day === null) {
    return <Dash title={closed ? 'Chưa ghi ngày đóng' : 'Chưa đặt ngày đóng dự kiến'} />
  }
  const late = isLateClose(op)
  return (
    <span
      className={cn('tnum font-num flex items-center gap-1', late && 'text-warning')}
      title={
        closed
          ? 'Ngày đóng thật'
          : late
            ? 'Ngày dự kiến đã trôi qua — đơn này đáng lẽ đóng rồi'
            : 'Ngày dự kiến'
      }
    >
      {late && <Flag icon={TriangleAlert} word={OVERDUE_WORD} />}
      {dm(day)}
    </span>
  )
}

/** One person reads by name; two or more as avatars, names in the group's tooltip. */
export function PeopleCell({ owners, missing }: { owners: OpportunityOwner[]; missing: string }) {
  if (owners.length === 0) return <Dash title={missing} />
  const [only] = owners
  if (owners.length === 1 && only) return <PicCell name={only.name} empty={missing} avatar />
  return <AvatarGroup names={namesOf(owners)} max={2} />
}

/** Open deals: days since the last customer-facing activity, inked by the
 *  server's verdict. Closed deals: the day they closed. */
export function LastActivityCell({ op }: { op: OpportunityBookRow }) {
  if (op.state !== 'open') {
    if (op.closedAt === null) return <Dash title="Chưa ghi ngày đóng" />
    return (
      <span className="text-muted-foreground tnum font-num" title="Ngày đóng đơn">
        {dm(op.closedAt)}
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
          ? `Hoạt động cuối ${dm(at)}`
          : 'Chưa có cuộc gọi, cuộc gặp, email, Zalo, hoạt động chăm sóc hay báo giá nào'
      }
    >
      {word && <Flag icon={Timer} word={word} />}
      <span className="truncate">{at ? activityAgo(at) : 'Chưa có'}</span>
    </span>
  )
}

/** The last column. A row that waits on a head shows the act instead of the
 *  step (ADR 0071): accept on a `new` deal, assign on one with no seller. The
 *  assign verdict is the server's (`canAssign`); "no seller" picks the rows. */
export function NextStepCell({ op, canAccept }: { op: OpportunityBookRow; canAccept: boolean }) {
  const open = op.state === 'open'
  /* Mounted for every open row so the modal outlives the accept that moves it. */
  const accept = canAccept && open
  const accepting = accept && op.stage === 'new'
  const assigning = op.canAssign && !op.hasSeller

  return (
    <div className="flex min-w-0 items-center gap-2">
      {!accepting && !assigning && <StepText op={op} />}
      {accept && <RowAccept code={op.code} show={accepting} />}
      {assigning && (
        <RowAct>
          <AssignSaleButton op={op} hasSeller={false} size="sm" className="pointer-coarse:h-12" />
        </RowAct>
      )}
    </div>
  )
}

/** "title · due" on one line: the title truncates, the due day never does. */
function StepText({ op }: { op: OpportunityBookRow }) {
  const step = op.nextStep
  if (!step) return <Dash title="Chưa đặt việc tiếp theo" />
  const late = lateLevel(step.dueLevel)
  return (
    <span
      className="flex min-w-0"
      title={`${step.text} · hạn ${dm(step.due)}${late ? ` · ${DUE_LABEL[late]}` : ''}`}
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
          {dm(step.due)}
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
function RowAccept({ code, show }: { code: string; show: boolean }) {
  const box = useRef<HTMLSpanElement>(null)
  const next = useRef<HTMLElement | null>(null)
  const nextRow = () => {
    let row = box.current?.closest('[role="row"]')?.nextElementSibling ?? null
    while (row && !(row instanceof HTMLElement && row.tabIndex >= 0)) row = row.nextElementSibling
    return row
  }
  return (
    <span ref={box} className="flex shrink-0">
      <RowAct>
        <AcceptDealButton
          code={code}
          show={show}
          size="sm"
          className="pointer-coarse:h-12"
          onAccepted={() => (next.current = nextRow())}
          returnFocus={() =>
            next.current?.isConnected ? next.current : document.getElementById(ACCEPT_QUEUE_ID)
          }
        />
      </RowAct>
    </span>
  )
}
