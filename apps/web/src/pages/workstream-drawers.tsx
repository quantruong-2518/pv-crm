import type { ReactNode } from 'react'
import { Badge, Button, ChevronLeft, ChevronRight, Drawer, Icon, cn, vnd } from '@pv/ui'
import {
  CONTRACT_KIND_LABEL,
  JOURNEY_BORN_BY_LABEL,
  DOC_STATE_LABEL,
  JOURNEY_DEAL_OUTCOME_LABEL,
  LEAD_STATE_LABEL,
  type DocState,
  type DueLevel,
  type JourneyContract,
  type JourneyDeal,
  type JourneyGrowthDoor,
  type JourneyRungKey,
  type JourneySubStep,
  type JourneyWaitingDoor,
} from '@pv/contracts'
import { dm, dmy } from '@/lib/date'
import { chainPath } from '@/data/opportunities'
import { DueBadge } from '@/components/contract-bits'
import {
  anchorKind,
  contractLate,
  dealLate,
  LANES,
  lateLevel,
  leadStatus,
  moneyShort,
  POOL,
  railOf,
  rungLabel,
  rungStatus,
  STATE_WORD,
  stepAlong,
  type Journey,
  type PickKind,
  type RailRung,
  type Status,
  type TreePick,
} from './workstream-tree-model'
import { CodePill, RungDot, StatusPill } from './workstream-tree-cards'

/** The four detail drawers of the journey tree (canvas E-Main `panel*`): a
 *  lead or deal rung, a contract rung, a waiting door, a growth door.
 *
 *  Read-only: the only buttons walk the same ladder or open the object's own
 *  page. Sub-steps live here and nowhere else on the screen (handoff, logic
 *  level 5). Every fixed sentence is declared once in `TEXT`. */

type Go = (path: string) => void
type Pick = (pick: TreePick) => void

const PRESALE = LANES[0].phase
const SALE = LANES[1].phase
const POSTSALE = LANES[2].phase
const NEXT = LANES[3].phase

const TEXT = {
  ladder: 'Các bậc',
  inside: 'Bên trong',
  milestones: 'Các mốc triển khai',
  acceptance: 'Biên bản nghiệm thu',
  installments: 'Các đợt thanh toán',
  licence: 'Hiệu lực bản quyền',
  nextAction: 'Bước tiếp theo',
  aboutLead: 'Về lead',
  aboutDeal: 'Về cơ hội',
  aboutContract: 'Về hợp đồng',
  whyWaiting: 'Vì sao vào nhóm chờ chăm sóc',
  newNeed: 'Nhu cầu mới',
  enteredAt: 'Vào bậc',
  stayedLimit: 'Đã ở / hạn',
  stayed: 'Ở bậc này',
  expectedClose: 'Dự kiến chốt',
  days: 'ngày',
  due: 'hạn',
  holder: 'Người giữ',
  bornBy: 'Nguồn',
  fromJourney: 'từ hành trình',
  freshIntake: 'Nhập mới',
  outcome: 'Kết quả',
  value: 'Giá trị',
  contracts: 'hợp đồng',
  kind: 'Loại',
  signedAt: 'Ký',
  fromDeal: 'Từ cơ hội',
  implementer: 'Người triển khai',
  invoice: 'hoá đơn',
  paid: 'đã thu',
  invoiceNote:
    'Hoá đơn chỉ ghi nhận: số và ngày hoá đơn, ngày và số tiền đã thu. Hệ thống không phát hành hoá đơn.',
  movedAt: 'Ngày chuyển',
  from: 'Từ',
  reason: 'Lý do',
  concludedBy: 'Người kết luận',
  system: 'Hệ thống',
  doNotContact: 'Không liên hệ',
  campaign: 'Chiến dịch',
  lastTouch: 'Tương tác gần nhất',
  /* ADR 0068: a parked lead loops back on itself, same journey and holder;
     flow C4: a do-not-contact lead is never mailed, so only the manual door is
     left. Any mail sent counts as the first real touch. */
  wakeAny:
    'Đưa lead vào chiến dịch hoặc bấm tay "Chăm lại" là chính lead này quay lại chăm sóc, vẫn trong hành trình này và vẫn do người giữ cũ phụ trách.',
  wakeManual:
    'Chỉ bấm tay "Chăm lại": chính lead này quay lại chăm sóc trong hành trình này. Lead này không bao giờ được đưa vào chiến dịch hay nhận mail.',
  onReply: `Thư gửi đi hoặc một lần liên hệ thật là lead chuyển ngay sang ${LEAD_STATE_LABEL.working}.`,
  need: 'Nhu cầu',
  arose: 'Phát sinh từ',
  decidedBy: 'Người quyết định và giữ lead',
  newLead: 'Lead mới',
  openedAt: 'Ngày mở',
  whyNewTitle: 'Vì sao là hành trình mới',
  whyNew:
    'Nhu cầu nảy ra khi khách đang triển khai hoặc đang dùng thì mở hành trình mới, kể cả thay đổi nhỏ.',
  openLead: 'Mở lead',
  openDeal: 'Mở cơ hội',
  openJourney: 'Mở hành trình',
  prev: 'Bậc trước',
  nextRung: 'Bậc sau',
  close: 'Đóng chi tiết',
} as const

/* Words come from the contract; the tone is this screen's reading. */
const DOC_TONE: Record<DocState, Status['tone']> = {
  complete: 'success',
  'awaiting-signature': 'warning',
  missing: 'draft',
}

// ---------------------------------------------------------------------------
// PIECES
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground m-0 text-[12px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 flex flex-col">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2 text-[14px]">
          <dt className="text-muted-foreground shrink-0">{label}</dt>
          <dd className="tnum m-0 min-w-0 break-words text-right">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-muted flex flex-col gap-1 rounded-md px-4 py-3 text-[14px]">
      <span className="text-muted-foreground text-[12px] font-semibold">{title}</span>
      <span>{children}</span>
    </div>
  )
}

/** The `done` due word is a money word (open question #24), so a finished
 *  milestone shows its date and no due pill. */
function DuePill({ level, money = false }: { level: DueLevel | null; money?: boolean }) {
  if (level === null || (level === 'done' && !money)) return null
  return <DueBadge level={level} className="shrink-0 normal-case tracking-normal" />
}

function SubStepRow({ step }: { step: JourneySubStep }) {
  const when = step.at ? dm(step.at) : step.due ? `${TEXT.due} ${dm(step.due)}` : null
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="flex pt-1">
        <RungDot rung={{ state: step.state, late: lateLevel(step.dueLevel) }} />
      </span>
      <span className="flex min-w-0 grow flex-col gap-1">
        <span className={cn('text-[14px]', step.state === 'current' && 'font-semibold')}>
          {step.label}
        </span>
        {step.note && <span className="text-muted-foreground text-[12px]">{step.note}</span>}
      </span>
      {when && <span className="text-muted-foreground tnum shrink-0 text-[12px]">{when}</span>}
      <DuePill level={step.dueLevel} />
    </li>
  )
}

function SubSteps({ title, steps }: { title: string; steps: JourneySubStep[] }) {
  if (steps.length === 0) return null
  return (
    <Section title={title}>
      <ul className="m-0 flex list-none flex-col p-0">
        {steps.map((s, i) => (
          <SubStepRow key={`${i}:${s.label}`} step={s} />
        ))}
      </ul>
    </Section>
  )
}

/** Every rung of the object, each a 48px button that moves the selection. */
function Ladder({
  kind,
  code,
  rungs,
  on,
  onPick,
}: {
  kind: PickKind
  code: string
  rungs: RailRung[]
  on: JourneyRungKey
  onPick: Pick
}) {
  return (
    <Section title={TEXT.ladder}>
      <ol className="m-0 grid list-none grid-cols-5 gap-1 p-0">
        {rungs.map((r) => {
          const picked = r.key === on
          return (
            <li key={r.key} className="min-w-0">
              <button
                type="button"
                aria-current={picked ? 'step' : undefined}
                aria-label={`${r.label} · ${rungStatus(r.state, r.late).label}`}
                onClick={() => onPick({ kind, code, rung: r.key })}
                className={cn(
                  'motion-std flex min-h-16 w-full flex-col items-start gap-2 rounded-md px-2 py-3 text-left',
                  picked
                    ? 'bg-surface-ink/9 shadow-[inset_0_0_0_1px_var(--primary)]'
                    : 'bg-muted hover:bg-surface-ink/9',
                )}
              >
                <RungDot rung={r} />
                <span className={cn('break-words text-[12px]', picked && 'font-semibold')}>
                  {r.label}
                </span>
                <span className="text-muted-foreground tnum text-[11px]">
                  {r.at ? dm(r.at) : r.state === 'skipped' ? STATE_WORD.skipped : '—'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', items.length > 2 && 'sm:grid-cols-3')}>
      {items.map(([label, value]) => (
        <div key={label} className="bg-muted flex flex-col gap-1 rounded-md p-3">
          <span className="text-muted-foreground text-[12px]">{label}</span>
          <span className="tnum text-[16px] font-semibold">{value}</span>
        </div>
      ))}
    </div>
  )
}

function Footer({
  prev,
  next,
  cta,
}: {
  prev?: () => void
  next?: () => void
  cta?: { label: string; onClick: () => void }
}) {
  /* `aria-disabled`, not `disabled`: a disabled button drops focus to <body>
     when the last rung is reached from the keyboard. */
  const nav = (go?: () => void) =>
    ({
      'aria-disabled': !go,
      onClick: go ?? (() => undefined),
      className: cn(
        'hover:bg-surface-ink/16 w-12 px-0',
        !go && 'text-muted-foreground cursor-not-allowed',
      ),
    }) as const
  return (
    <div className="flex items-center gap-2">
      {(prev || next) && (
        <>
          <Button variant="ghost" size="lg" aria-label={TEXT.prev} {...nav(prev)}>
            <Icon icon={ChevronLeft} size={16} />
          </Button>
          <Button variant="ghost" size="lg" aria-label={TEXT.nextRung} {...nav(next)}>
            <Icon icon={ChevronRight} size={16} />
          </Button>
        </>
      )}
      <span className="grow" />
      {cta && (
        <Button size="lg" onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  )
}

const Kicker = ({ phase, children }: { phase: string; children: ReactNode }) => (
  <span className="flex flex-wrap items-center gap-2">
    <span className="font-semibold">{phase}</span>
    {children}
  </span>
)

const person = (p: { name: string } | null) => p?.name ?? '—'

// ---------------------------------------------------------------------------
// THE FOUR BODIES — each returns the Drawer's props
// ---------------------------------------------------------------------------

type View = {
  title: string
  subtitle: ReactNode
  meta?: ReactNode
  footer: ReactNode
  body: ReactNode
}
type Ctx = { journey: Journey; go: Go; onPick: Pick }

function walk(kind: PickKind, code: string, rungs: RailRung[], key: JourneyRungKey, onPick: Pick) {
  const keys = rungs.map((r) => r.key)
  const to = (step: -1 | 1) => {
    const k = stepAlong(keys, key, step)
    return k === undefined ? undefined : () => onPick({ kind, code, rung: k })
  }
  return { prev: to(-1), next: to(1) }
}

function leadView({ journey, go, onPick }: Ctx, key: JourneyRungKey): View | null {
  const lead = journey.lead
  const rungs = railOf('lead', lead.rungs, null)
  const r = rungs.find((x) => x.key === key)
  const raw = lead.rungs.find((x) => x.key === key)
  if (!r || !raw) return null
  const path = chainPath('LD', lead.code)
  const born = journey.previous
    ? `${JOURNEY_BORN_BY_LABEL[journey.previous.bornBy]} ${TEXT.fromJourney} ${journey.previous.ordinal}`
    : TEXT.freshIntake
  return {
    title: r.label,
    subtitle: (
      <Kicker phase={PRESALE}>
        <CodePill kind="LD" code={lead.code} go={go} />
        <span>{journey.customer}</span>
      </Kicker>
    ),
    meta: <StatusPill status={rungStatus(r.state, r.late)} />,
    footer: (
      <Footer
        {...walk('lead', lead.code, rungs, key, onPick)}
        cta={path ? { label: TEXT.openLead, onClick: () => go(path) } : undefined}
      />
    ),
    body: (
      <>
        <Ladder kind="lead" code={lead.code} rungs={rungs} on={key} onPick={onPick} />
        <Stats
          items={[
            [TEXT.enteredAt, raw.at ? dmy(raw.at) : '—'],
            [TEXT.stayed, raw.days === null ? '—' : `${raw.days} ${TEXT.days}`],
          ]}
        />
        <Section title={TEXT.aboutLead}>
          <Facts
            rows={[
              [TEXT.holder, lead.holder?.name ?? POOL],
              [TEXT.bornBy, born],
              [TEXT.outcome, leadStatus(lead)?.label ?? '—'],
            ]}
          />
        </Section>
      </>
    ),
  }
}

function dealView({ go, onPick }: Ctx, deal: JourneyDeal, key: JourneyRungKey): View | null {
  const rungs = railOf('deal', deal.rungs, dealLate(deal))
  const r = rungs.find((x) => x.key === key)
  const raw = deal.rungs.find((x) => x.key === key)
  if (!r || !raw) return null
  const path = chainPath('OP', deal.code)
  const current = raw.state === 'current'
  const stay: [string, string] =
    current && raw.limitDays !== null && raw.days !== null
      ? [TEXT.stayedLimit, `${raw.days} / ${raw.limitDays} ${TEXT.days}`]
      : [TEXT.stayed, raw.days === null ? '—' : `${raw.days} ${TEXT.days}`]
  const outcome =
    deal.outcome === 'won'
      ? `${JOURNEY_DEAL_OUTCOME_LABEL.won} · ${deal.contractCodes.length} ${TEXT.contracts}`
      : JOURNEY_DEAL_OUTCOME_LABEL[deal.outcome]
  const action = current ? deal.nextAction : null
  return {
    title: r.label,
    subtitle: (
      <Kicker phase={SALE}>
        <CodePill kind="OP" code={deal.code} go={go} />
        <span>{deal.name}</span>
      </Kicker>
    ),
    meta: <StatusPill status={rungStatus(r.state, r.late)} />,
    footer: (
      <Footer
        {...walk('deal', deal.code, rungs, key, onPick)}
        cta={path ? { label: TEXT.openDeal, onClick: () => go(path) } : undefined}
      />
    ),
    body: (
      <>
        <Ladder kind="deal" code={deal.code} rungs={rungs} on={key} onPick={onPick} />
        <SubSteps title={`${TEXT.inside} ${r.label}`} steps={raw.subSteps} />
        <Stats
          items={[
            [TEXT.enteredAt, raw.at ? dmy(raw.at) : '—'],
            stay,
            [TEXT.expectedClose, deal.expectedClose ? dmy(deal.expectedClose) : '—'],
          ]}
        />
        {action && (
          <Section title={TEXT.nextAction}>
            <div className="bg-muted flex flex-wrap items-center gap-2 rounded-md px-4 py-3 text-[14px]">
              <span className="min-w-0 grow break-words font-semibold">{action.text}</span>
              <span className="text-muted-foreground tnum text-[12px]">
                {dmy(action.due)} · {action.doer.name}
              </span>
              <DuePill level={action.dueLevel} />
            </div>
          </Section>
        )}
        <Section title={TEXT.aboutDeal}>
          <Facts
            rows={[
              [TEXT.value, deal.amount === null ? '—' : moneyShort(deal.amount)],
              [TEXT.holder, person(deal.holder)],
              [TEXT.outcome, outcome],
            ]}
          />
        </Section>
      </>
    ),
  }
}

function Installments({ contract }: { contract: JourneyContract }) {
  return (
    <Section title={TEXT.installments}>
      <ul className="m-0 flex list-none flex-col p-0">
        {contract.installments.map((i) => (
          <li key={i.no} className="flex flex-col gap-1 py-2 text-[14px]">
            <span className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 grow break-words font-medium">{i.label}</span>
              <span className="tnum">{vnd(i.amount)}</span>
              <DuePill level={i.dueLevel} money />
            </span>
            <span className="text-muted-foreground tnum text-[12px]">
              {[
                `${i.share}%`,
                `${TEXT.due} ${dmy(i.due)}`,
                i.invoicedAt &&
                  [TEXT.invoice, i.invoiceNo, dmy(i.invoicedAt)].filter(Boolean).join(' '),
                i.paidAt &&
                  `${TEXT.paid} ${dmy(i.paidAt)}${i.paidAmount === null ? '' : ` · ${vnd(i.paidAmount)}`}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground m-0 text-[12px]">{TEXT.invoiceNote}</p>
    </Section>
  )
}

function contractView({ go, onPick }: Ctx, c: JourneyContract, key: JourneyRungKey): View | null {
  const rungs = railOf('contract', c.rungs, contractLate(c))
  const r = rungs.find((x) => x.key === key)
  if (!r) return null
  const facts: [string, ReactNode][] = [
    [TEXT.kind, CONTRACT_KIND_LABEL[c.kind]],
    [TEXT.value, c.amount === null ? '—' : moneyShort(c.amount)],
    [TEXT.signedAt, dmy(c.signedAt)],
    [TEXT.fromDeal, <CodePill key="deal" kind="OP" code={c.dealCode} go={go} />],
    [TEXT.holder, person(c.holder)],
    ...(c.implementer ? [[TEXT.implementer, c.implementer.name] as [string, ReactNode]] : []),
  ]
  return {
    title: r.label,
    subtitle: (
      <Kicker phase={POSTSALE}>
        <CodePill kind="HĐ" code={c.code} go={go} />
        <span>
          {CONTRACT_KIND_LABEL[c.kind]}
          {c.amount === null ? '' : ` · ${moneyShort(c.amount)}`}
        </span>
      </Kicker>
    ),
    meta: <StatusPill status={rungStatus(r.state, r.late)} />,
    /* No CTA: contract codes have no open route while the module is parked. */
    footer: <Footer {...walk('contract', c.code, rungs, key, onPick)} />,
    body: (
      <>
        <Ladder kind="contract" code={c.code} rungs={rungs} on={key} onPick={onPick} />
        {key === 'deploy' && <SubSteps title={TEXT.milestones} steps={c.milestones} />}
        {key === 'accept' && c.acceptance.length > 0 && (
          <Section title={TEXT.acceptance}>
            <ul className="m-0 flex list-none flex-col p-0">
              {c.acceptance.map((a, i) => (
                <li
                  key={`${i}:${a.label}`}
                  className="flex flex-wrap items-center gap-2 py-2 text-[14px]"
                >
                  <span className="min-w-0 grow break-words">{a.label}</span>
                  {a.at && (
                    <span className="text-muted-foreground tnum text-[12px]">{dmy(a.at)}</span>
                  )}
                  <StatusPill
                    status={{ label: DOC_STATE_LABEL[a.state], tone: DOC_TONE[a.state] }}
                  />
                </li>
              ))}
            </ul>
          </Section>
        )}
        {key === 'collect' && <Installments contract={c} />}
        {key === 'done' && c.licence && (
          <Section title={TEXT.licence}>
            <p className="tnum m-0 text-[14px]">
              {dmy(c.licence.from)} – {dmy(c.licence.to)}
            </p>
          </Section>
        )}
        <Section title={TEXT.aboutContract}>
          <Facts rows={facts} />
        </Section>
      </>
    ),
  }
}

/** "OP-0289 · POC": the anchor's ladder is read off the data, never guessed. */
function fromText(j: Journey, from: { code: string; rung: string }) {
  const kind = anchorKind(j, from.code)
  const label = kind ? rungLabel(kind, from.rung) : undefined
  return label ? `${from.code} · ${label}` : from.code
}

function waitingView({ journey, go }: Ctx, d: JourneyWaitingDoor): View {
  const path = chainPath('LD', d.leadCode)
  return {
    title: JOURNEY_DEAL_OUTCOME_LABEL.waiting,
    subtitle: (
      <Kicker phase={NEXT}>
        <CodePill kind="LD" code={d.leadCode} go={go} />
      </Kicker>
    ),
    meta: d.doNotContact ? <Badge tone="warning">{TEXT.doNotContact}</Badge> : undefined,
    footer: <Footer cta={path ? { label: TEXT.openLead, onClick: () => go(path) } : undefined} />,
    body: (
      <>
        <Section title={TEXT.whyWaiting}>
          <Facts
            rows={[
              [TEXT.movedAt, dmy(d.at)],
              [TEXT.from, fromText(journey, d.from)],
              [TEXT.reason, d.reason],
              [TEXT.concludedBy, d.concludedBy?.name ?? TEXT.system],
              ...(d.campaignName !== null
                ? [[TEXT.campaign, d.campaignName] as [string, ReactNode]]
                : []),
              ...(d.lastTouch !== null
                ? [
                    [TEXT.lastTouch, `${dmy(d.lastTouch.at)} · ${d.lastTouch.text}`] as [
                      string,
                      ReactNode,
                    ],
                  ]
                : []),
            ]}
          />
        </Section>
        <Note title={JOURNEY_BORN_BY_LABEL.wake}>
          <span className="flex flex-col gap-2">
            <span>{d.doNotContact ? TEXT.wakeManual : TEXT.wakeAny}</span>
            {!d.doNotContact && <span>{TEXT.onReply}</span>}
          </span>
        </Note>
      </>
    ),
  }
}

function growthView({ journey, go }: Ctx, d: JourneyGrowthDoor): View {
  const path = chainPath('WS', d.journeyCode)
  return {
    title: JOURNEY_BORN_BY_LABEL.growth,
    subtitle: (
      <Kicker phase={NEXT}>
        <CodePill kind="WS" code={d.journeyCode} go={go} />
      </Kicker>
    ),
    footer: (
      <Footer cta={path ? { label: TEXT.openJourney, onClick: () => go(path) } : undefined} />
    ),
    body: (
      <>
        <Section title={TEXT.newNeed}>
          <Facts
            rows={[
              [TEXT.need, d.need],
              [TEXT.arose, fromText(journey, d.from)],
              [TEXT.decidedBy, d.decidedBy.name],
              [TEXT.newLead, <CodePill key="lead" kind="LD" code={d.leadCode} go={go} />],
              [TEXT.openedAt, dmy(d.at)],
            ]}
          />
        </Section>
        <Note title={TEXT.whyNewTitle}>{TEXT.whyNew}</Note>
      </>
    ),
  }
}

function viewOf(ctx: Ctx, pick: TreePick): View | null {
  const j = ctx.journey
  if (pick.kind === 'door') {
    const door = j.doors.find((d) => d.leadCode === pick.code)
    if (!door) return null
    return door.kind === 'growth' ? growthView(ctx, door) : waitingView(ctx, door)
  }
  if (pick.kind === 'lead') return pick.code === j.lead.code ? leadView(ctx, pick.rung) : null
  if (pick.kind === 'deal') {
    const deal = j.deals.find((d) => d.code === pick.code)
    return deal ? dealView(ctx, deal, pick.rung) : null
  }
  const contract = j.contracts.find((c) => c.code === pick.code)
  return contract ? contractView(ctx, contract, pick.rung) : null
}

export function JourneyDrawer({
  journey,
  picked,
  onPick,
  onClose,
  go,
}: {
  journey: Journey
  picked: TreePick | null
  onPick: Pick
  onClose: () => void
  go: Go
}) {
  const view = picked ? viewOf({ journey, go, onPick }, picked) : null
  return (
    <Drawer
      open={view !== null}
      onClose={onClose}
      closeLabel={TEXT.close}
      title={view?.title ?? ''}
      subtitle={view?.subtitle}
      meta={view?.meta}
      footer={view?.footer}
    >
      <div className="flex flex-col gap-6">{view?.body}</div>
    </Drawer>
  )
}
