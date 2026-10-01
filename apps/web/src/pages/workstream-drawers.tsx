import type { ReactNode } from 'react'
import { Badge, Drawer, vnd } from '@pv/ui'
import {
  CONTRACT_KIND_LABEL,
  JOURNEY_BORN_BY_LABEL,
  DOC_STATE_LABEL,
  JOURNEY_DEAL_OUTCOME_LABEL,
  LEAD_STATE_LABEL,
  type DocState,
  type JourneyContract,
  type JourneyDeal,
  type JourneyDealStop,
  type JourneyGrowthDoor,
  type JourneyRungKey,
  type JourneyWaitingDoor,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { dmy } from '@/lib/date'
import { ACCEPTOR_LABEL, acceptorText } from '@/data/deal-sale'
import { chainPath, formatStageClock } from '@/data/opportunities'
import { AcceptDealButton } from '@/components/opportunity-accept'
import {
  anchorKind,
  contractLate,
  dealLate,
  LANES,
  leadStatus,
  moneyShort,
  POOL,
  railOf,
  rungLabel,
  rungStatus,
  stepAlong,
  STOPPED_AT,
  stoppedRungLabel,
  type Journey,
  type PickKind,
  type RailRung,
  type Status,
  type TreePick,
} from './workstream-tree-model'
import { CodePill, StatusPill } from './workstream-tree-cards'
import {
  DuePill,
  Facts,
  Footer,
  Kicker,
  Ladder,
  Note,
  Section,
  Stats,
  SubSteps,
} from './workstream-drawer-bits'
import { DealAssignSection, DealStepSection } from './workstream-drawer-step'
import { TEXT } from './workstream-drawer-text'

/** The four detail drawers of the journey tree (canvas E-Main `panel*`): a
 *  lead or deal rung, a contract rung, a waiting door, a growth door.
 *
 *  Read-only but for two acts on a deal: the accept (`AcceptDealButton`) and
 *  the next step on its current rung, edited by the profile's own form — never
 *  a milestone or a stop. Sub-steps live here and nowhere else on the screen
 *  (handoff, logic level 5). Shared pieces live in `workstream-drawer-bits.tsx`
 *  and every fixed sentence in `TEXT` (`workstream-drawer-text.ts`). */

type Go = (path: string) => void
type Pick = (pick: TreePick) => void

const PRESALE = LANES[0].phase
const SALE = LANES[1].phase
const POSTSALE = LANES[2].phase
const NEXT = LANES[3].phase

/* Words come from the contract; the tone is this screen's reading. */
const DOC_TONE: Record<DocState, Status['tone']> = {
  complete: 'success',
  'awaiting-signature': 'warning',
  missing: 'draft',
}

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
type Ctx = {
  journey: Journey
  go: Go
  onPick: Pick
  canAccept: boolean
  canAssign: boolean
  canEdit: boolean
}

/** Where focus lands after an accept from the footer re-picks the rung. */
const DRAWER_BODY_ID = 'journey-drawer-body'

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

function dealView(ctx: Ctx, deal: JourneyDeal, key: JourneyRungKey): View | null {
  const { go, onPick } = ctx
  const rungs = railOf('deal', deal.rungs, dealLate(deal))
  const r = rungs.find((x) => x.key === key)
  const raw = deal.rungs.find((x) => x.key === key)
  if (!r || !raw) return null
  const path = chainPath('OP', deal.code)
  const current = raw.state === 'current'
  /* The book's and the profile's clock, one formatter. */
  const clock = current && raw.days !== null ? formatStageClock(raw.days, raw.limitDays) : null
  const stay: [string, string] = clock
    ? [clock.limit === null ? TEXT.stayed : TEXT.stayedLimit, clock.label]
    : [TEXT.stayed, raw.days === null ? '—' : `${raw.days} ${TEXT.days}`]
  const acceptor = acceptorText(deal)
  /* Not links: contract routes are parked, so `chainPath` has no contract door. */
  const signed: [string, ReactNode][] =
    deal.contractCodes.length === 0
      ? []
      : [
          [
            TEXT.contracts,
            <span key="contracts" className="flex flex-wrap justify-end gap-2">
              {deal.contractCodes.map((c) => (
                <CodePill key={c} kind="HĐ" code={c} go={go} />
              ))}
            </span>,
          ],
        ]
  const live = current && deal.outcome === 'open'
  const awaiting = deal.rungs.some((x) => x.key === 'new' && x.state === 'current')
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
        extra={
          ctx.canAccept
            ? {
                node: (
                  <AcceptDealButton
                    code={deal.code}
                    show={awaiting}
                    size="lg"
                    onAccepted={() => onPick({ kind: 'deal', code: deal.code, rung: 'assigned' })}
                    returnFocus={() => document.getElementById(DRAWER_BODY_ID)}
                  />
                ),
                leads: awaiting,
              }
            : undefined
        }
        cta={path ? { label: TEXT.openDeal, onClick: () => go(path) } : undefined}
      />
    ),
    body: (
      <>
        <Ladder kind="deal" code={deal.code} rungs={rungs} on={key} onPick={onPick} />
        <SubSteps
          title={key === 'engaged' ? TEXT.activities : `${TEXT.inside} ${r.label}`}
          steps={raw.subSteps}
        />
        {key === 'engaged' && raw.subSteps.length === 0 && (
          <Section title={TEXT.activities}>
            <p className="text-muted-foreground m-0 text-[14px]">{TEXT.noActivities}</p>
          </Section>
        )}
        <Stats
          items={[
            [TEXT.enteredAt, raw.at ? dmy(raw.at) : '—'],
            stay,
            [TEXT.expectedClose, deal.expectedClose ? dmy(deal.expectedClose) : '—'],
          ]}
        />
        {raw.by && <Facts rows={[[TEXT.recordedBy, raw.by.name]]} />}
        {live && ctx.canAssign && raw.key !== 'new' && (
          <DealAssignSection key={`assign:${deal.code}`} code={deal.code} />
        )}
        {live && (
          <DealStepSection key={deal.code} deal={deal} stage={raw.key} canEdit={ctx.canEdit} />
        )}
        {deal.stop && <StopLog stop={deal.stop} at={stoppedRungLabel(deal)} />}
        <Section title={TEXT.aboutDeal}>
          <Facts
            rows={[
              [TEXT.value, deal.amount === null ? '—' : moneyShort(deal.amount)],
              [TEXT.holder, person(deal.holder)],
              ...(acceptor ? [[ACCEPTOR_LABEL, acceptor] as [string, ReactNode]] : []),
              [TEXT.outcome, JOURNEY_DEAL_OUTCOME_LABEL[deal.outcome]],
              ...signed,
            ]}
          />
        </Section>
      </>
    ),
  }
}

/** The fail log of a lost deal (ADR 0069 §1), titled with the outcome's own word. */
function StopLog({ stop, at }: { stop: JourneyDealStop; at: string | null }) {
  return (
    <Section title={JOURNEY_DEAL_OUTCOME_LABEL.lost}>
      <Facts
        rows={[
          ...(at ? [[STOPPED_AT, at] as [string, ReactNode]] : []),
          [TEXT.reason, stop.reason],
          ...(stop.note ? [[TEXT.note, stop.note] as [string, ReactNode]] : []),
          [TEXT.concludedBy, stop.concludedBy?.name ?? TEXT.system],
        ]}
      />
      {stop.doNotContact && (
        <span className="flex">
          <Badge tone="warning">{TEXT.doNotContact}</Badge>
        </span>
      )}
    </Section>
  )
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
    [TEXT.kind, c.kind && CONTRACT_KIND_LABEL[c.kind]],
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
          {c.kind && CONTRACT_KIND_LABEL[c.kind]}
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

/** The code, a dot, then the rung label (OP-0289 · the `engaged` label): the anchor's ladder is read off the data, never guessed. */
function fromText(j: Journey, from: { code: string; rung: string }) {
  const kind = anchorKind(j, from.code)
  const label = kind ? rungLabel(kind, from.rung) : undefined
  return label ? `${from.code} · ${label}` : from.code
}

function waitingView({ journey, go }: Ctx, d: JourneyWaitingDoor): View {
  const path = chainPath('LD', d.leadCode)
  return {
    title: LEAD_STATE_LABEL.nurturing,
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
            {/* null = not recorded: promise nothing, unlike false */}
            <span>
              {d.doNotContact === null
                ? TEXT.wakeUnknown
                : d.doNotContact
                  ? TEXT.wakeManual
                  : TEXT.wakeAny}
            </span>
            {d.doNotContact === false && <span>{TEXT.onReply}</span>}
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
  const canAccept = useCan('opportunity.accept')
  /* The next-step door's own permission; the server scopes it to the deal. */
  const canEdit = useCan('opportunity.edit')
  const canAssign = useCan('opportunity.assign')
  const view = picked
    ? viewOf({ journey, go, onPick, canAccept, canAssign, canEdit }, picked)
    : null
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
      <div id={DRAWER_BODY_ID} tabIndex={-1} className="flex flex-col gap-6 outline-none">
        {view?.body}
      </div>
    </Drawer>
  )
}
