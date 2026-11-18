import {
  ArrowUp,
  Badge,
  Button,
  ChevronRight,
  Drawer,
  GlassCard,
  Icon,
  Skeleton,
  StatusDot,
  cn,
} from '@pv/ui'
import { formatDate, useI18n } from '@/app/i18n'
import { refPath } from '@/data/assistant'
import type { PaneDeal, PaneRung, PaneView, RecordPane } from '@/data/assistant-record-pane'
import { ASSISTANT_COPY as C, VIEW_COPY as V, openLabel, stageDay } from '@/data/assistant-copy'
import { BADGE_INK, OVERDUE_COPY, STATE_TONE } from '@/data/opportunities'
import {
  leadStateLabel,
  opportunityStageLabel,
  opportunityStatusLabel,
} from '@/data/sales-labels-i18n'
import { compactMoney } from '@/components/deal-money/money'
import { CodeChip } from './assistant-bits'

/** The "record in discussion" pane (owner, 18/11): the record the answer is about, beside the thread on a
 *  large screen and in a bottom sheet on a phone. One surface, no inner cards: the chain
 *  lead, opportunity, contract runs down the page and only the stage the deal stands in
 *  carries detail. The next step is not here; the answer already says it. */

const TOUCH = 'pointer-coarse:h-12'
const PILL = cn('text-[12px]', BADGE_INK)
const DOT = { done: 'ok', current: 'current', rest: 'next' } as const

/** Pills start a capital; the book keeps "overdue" lower case in running text. */
function OverduePill() {
  const { t } = useI18n()
  const word = t(OVERDUE_COPY)
  return (
    <Badge tone="warning" className="text-[12px]">
      {word.charAt(0).toUpperCase() + word.slice(1)}
    </Badge>
  )
}

function Rung({ rung }: { rung: PaneRung }) {
  const { lang } = useI18n()
  const label = opportunityStageLabel(rung.key, lang)
  const current = rung.state === 'current'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <StatusDot state={DOT[rung.state]} />
      {current ? (
        <>
          <Badge tone="draft" className={PILL}>
            {label}
          </Badge>
          {rung.days !== null && (
            <span className="text-muted-foreground text-[12px]">
              {stageDay(rung.days, rung.limit, lang)}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted-foreground text-[13px]">{label}</span>
      )}
      {current && rung.overdue && <OverduePill />}
    </li>
  )
}

function DealRows({
  deal,
  openCode,
  onOpen,
}: {
  deal: PaneDeal
  openCode: string
  onOpen: (path: string) => void
}) {
  const { t, lang } = useI18n()
  const tone = STATE_TONE[deal.state]
  return (
    <>
      <li className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-[12px]">{t(V.deal)}</span>
          <span className="text-foreground min-w-0 truncate text-[13px] font-medium">
            {deal.name}
          </span>
          <Badge tone={tone} className={cn('text-[12px]', tone === 'draft' && BADGE_INK)}>
            {opportunityStatusLabel(deal.state, lang)}
          </Badge>
        </div>
        <ol className="m-0 flex list-none flex-col gap-2 p-0 pl-3">
          {deal.rungs.map((rung) => (
            <Rung key={rung.key} rung={rung} />
          ))}
        </ol>
      </li>
      <li className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-[12px]">{t(V.contract)}</span>
        {deal.contracts.length > 0 ? (
          deal.contracts.map((code) => (
            <CodeChip
              key={code}
              code={code}
              label={openLabel(code, lang)}
              open={code === openCode}
              onOpen={() => onOpen(refPath({ kind: 'contract', code }))}
            />
          ))
        ) : (
          <span className="text-muted-foreground text-[13px]">{t(V.noContract)}</span>
        )}
      </li>
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground text-[12px]">{label}</dt>
      <dd className="text-foreground tnum m-0 min-w-0 truncate text-right text-[13px] font-medium">
        {children}
      </dd>
    </div>
  )
}

/** The pane's content, the same on the large screen and in the phone's sheet. */
export function RecordPaneBody({
  view,
  onOpen,
  heading = true,
}: {
  view: PaneView | null
  onOpen: (path: string) => void
  /** The sheet already carries the title in its own bar. */
  heading?: boolean
}) {
  const { t, lang } = useI18n()
  if (!view) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton height={14} width="60%" />
        <Skeleton height={11} width="85%" delay={200} />
        <Skeleton height={11} width="70%" delay={400} />
      </div>
    )
  }
  const { deal } = view
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {heading ? (
            <h3 className="text-muted-foreground m-0 flex-1 text-[12px] font-semibold">
              {t(V.paneTitle)}
            </h3>
          ) : (
            <span className="flex-1" />
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(TOUCH, '-mr-2')}
            onClick={() => onOpen(refPath(view.ref))}
          >
            {openLabel(view.ref.code, lang)}
            <Icon icon={ChevronRight} size={16} />
          </Button>
        </div>
        <p className="text-foreground m-0 text-[15px] font-semibold">{view.company}</p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        <li className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-[12px]">{t(V.lead)}</span>
          <CodeChip
            code={view.leadCode}
            label={openLabel(view.leadCode, lang)}
            open={view.leadCode === view.ref.code}
            onOpen={() => onOpen(refPath({ kind: 'lead', code: view.leadCode }))}
          />
          {view.leadState && (
            <Badge tone="draft" className={PILL}>
              {leadStateLabel(view.leadState, lang)}
            </Badge>
          )}
        </li>
        {deal ? (
          <DealRows deal={deal} openCode={view.ref.code} onOpen={onOpen} />
        ) : (
          <li className="text-muted-foreground text-[13px]">{t(V.noDeal)}</li>
        )}
      </ol>
      {deal && (
        <dl className="m-0 flex flex-col gap-2">
          {deal.owner && <Fact label={t(V.owner)}>{deal.owner}</Fact>}
          {deal.amount !== null && (
            <Fact label={t(C.value)}>{compactMoney(deal.amount, deal.currency)}</Fact>
          )}
          {deal.expectedClose && (
            <Fact label={t(V.expectedClose)}>{formatDate(deal.expectedClose, lang)}</Fact>
          )}
        </dl>
      )}
    </div>
  )
}

/** Beside the thread from `lg`: one `glass-a` surface that stays in view while the thread scrolls. */
export function RecordPane({
  pane,
  onOpen,
  className,
}: {
  pane: RecordPane
  onOpen: (path: string) => void
  className?: string
}) {
  const { t } = useI18n()
  return (
    <GlassCard aria-label={t(V.paneTitle)} className={cn('hidden flex-col p-5 lg:flex', className)}>
      <RecordPaneBody view={pane.view} onOpen={onOpen} />
    </GlassCard>
  )
}

/** The row on a phone, inside the composer's surface: record and stage, and a chevron that
 *  lifts the pane as a sheet. Hidden from `lg`, where the pane itself is beside the thread.
 *  The sheet's state is the page's, so a chip press can lift it too. 48px, the touch floor (law 13). */
export function RecordSheetRow({
  pane,
  open,
  onOpenChange,
  onOpen,
}: {
  pane: RecordPane
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (path: string) => void
}) {
  const { t, lang } = useI18n()
  const { view } = pane
  const rung = view?.deal?.rungs.find((r) => r.state === 'current')
  const stage = rung
    ? opportunityStageLabel(rung.key, lang)
    : view?.leadState
      ? leadStateLabel(view.leadState, lang)
      : null

  return (
    <>
      <button
        type="button"
        aria-label={t(V.openPane)}
        className="motion-std hover:bg-surface-ink/5 flex h-12 w-full items-center gap-3 rounded-md px-1 text-left lg:hidden"
        onClick={() => onOpenChange(true)}
      >
        {view ? (
          <>
            <span className="text-foreground font-mono text-[13px] font-semibold">
              {view.ref.code}
            </span>
            {stage && (
              <Badge tone="draft" className={cn(PILL, 'min-w-0 truncate')}>
                {stage}
              </Badge>
            )}
            {rung?.overdue && <OverduePill />}
          </>
        ) : (
          <Skeleton height={12} width="40%" />
        )}
        <span className="flex-1" />
        <Icon icon={ArrowUp} size={16} className="text-muted-foreground shrink-0" />
      </button>
      <Drawer
        open={open}
        onClose={() => onOpenChange(false)}
        side="bottom"
        title={t(V.paneTitle)}
        closeLabel={t(C.close)}
      >
        <RecordPaneBody
          heading={false}
          view={view}
          onOpen={(path) => {
            onOpenChange(false)
            onOpen(path)
          }}
        />
      </Drawer>
    </>
  )
}
