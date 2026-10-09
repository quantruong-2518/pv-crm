import type { ReactNode } from 'react'
import { ArrowRight, Button, ChevronLeft, ChevronRight, Drawer, Icon } from '@pv/ui'
import { LEAD_STATE_HINT } from '@pv/contracts'
import { dmy } from '@/lib/date'
import type { PickKind, RailRung } from './workstream-tree-model'

/** One rung of a card's rail, opened in a drawer — the first door of a rung;
 *  the object's profile sits in the drawer's footer.
 *
 *  Only the lead ladder has words for what a step does (`LEAD_STATE_HINT`);
 *  the deal and contract drawers print the label, state and date and nothing
 *  invented. ‹ › walk the same ladder: the panel stays, the content swaps. */

/* Keyed by string, like `LADDER`: deal rungs reuse `new` and `assigned`, so
   only a lead rung may read these words. */
const LEAD_HINT: Readonly<Record<string, (typeof LEAD_STATE_HINT)[keyof typeof LEAD_STATE_HINT]>> =
  LEAD_STATE_HINT

function Entry({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-[12px]">{term}</dt>
      <dd className="m-0 text-[14px] leading-[1.6]">{children}</dd>
    </div>
  )
}

export function StepDrawer({
  open,
  kind,
  code,
  rungs,
  notes,
  at,
  meta,
  path,
  onStep,
  onClose,
  onOpen,
}: {
  open: boolean
  kind: PickKind
  code: string
  rungs: RailRung[]
  /** The rail's tooltip lines, keyed by rung; each already names itself. */
  notes: Partial<Record<string, string>> | undefined
  /** Index of the rung shown; kept after closing so the exit slide keeps its words. */
  at: number
  /** The rung's status pill — the only place its state word is printed. */
  meta: ReactNode
  /** The object's profile; undefined = the reader has no door to it. */
  path: string | undefined
  onStep: (at: number) => void
  onClose: () => void
  onOpen: (path: string) => void
}) {
  const rung = rungs[at]
  if (!rung) return null
  const hint = kind === 'lead' ? LEAD_HINT[rung.key] : undefined
  const when = rung.state !== 'skipped' && rung.at !== null ? dmy(rung.at) : null
  const note = notes?.[rung.key]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={rung.label ? `${at + 1}. ${rung.label}` : `Bước ${at + 1}`}
      subtitle={<span className="font-mono">{code}</span>}
      meta={meta}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="lg"
              className="w-12 px-0"
              aria-label="Bước trước"
              disabled={at === 0}
              onClick={() => onStep(at - 1)}
            >
              <Icon icon={ChevronLeft} size={16} />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-12 px-0"
              aria-label="Bước sau"
              disabled={at === rungs.length - 1}
              onClick={() => onStep(at + 1)}
            >
              <Icon icon={ChevronRight} size={16} />
            </Button>
          </div>
          <Button size="lg" disabled={!path} onClick={() => path && onOpen(path)}>
            <span>
              Mở <span className="font-mono">{code}</span>
            </span>
            <Icon icon={ArrowRight} size={16} />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="m-0 flex flex-col gap-4">
          {hint && (
            <>
              <Entry term="Bước này làm gì">{hint.does}</Entry>
              <Entry term="Ai làm">{hint.who}</Entry>
              {/* A stopped rung was left, not passed: its way onward never happened. */}
              {rung.state !== 'stopped' && <Entry term="Sang bước kế khi">{hint.next}</Entry>}
            </>
          )}
          {when && (
            <Entry term="Ngày">
              <span className="tnum">{when}</span>
            </Entry>
          )}
        </dl>
        {note && <p className="m-0 text-[14px] leading-[1.6]">{note}</p>}
      </div>
    </Drawer>
  )
}
