import { useRef, useState } from 'react'
import { ArrowRight, Button, Drawer, Icon, Lock, SegmentedControl, cn } from '@pv/ui'
import type { MailSubjectKind } from '@pv/contracts'
import { dm, dmhm } from '@/lib/date'
import { contractReadOnlyNote } from '@/data/contracts'
import { useContractKindLabel } from '@/data/sales-config'
import { HoldMark } from '@/components/hold-strip'
import { CommJourney } from '@/components/run/comm-journey'
import { RunContacts } from '@/components/run/run-contacts'
import { RunOwners } from '@/components/run/run-owners'
import { NextAction, RungDot, StatusPill } from './workstream-tree-cards'
import {
  CHAIN_KIND,
  STATE_WORD,
  contractLate,
  contractStatus,
  dealLate,
  dealStatus,
  leadStatus,
  railOf,
  rungStatus,
  type Journey,
  type PathOf,
  type PickKind,
  type RailRung,
  type Status,
} from './workstream-tree-model'

/** One drawer for every card of the tree: the people the flow is about at the
 *  top, then two tabs — the flow (who holds it and each rung: when it moved,
 *  who moved it, what was done) and the contact history. Nothing is read a
 *  second time: the rungs travel with the journey, and the people and comms
 *  come from the blocks the record screens already use. */

const SUBJECT: Record<PickKind, MailSubjectKind> = {
  lead: 'lead',
  deal: 'opportunity',
  contract: 'contract',
}

type Picked = {
  kind: PickKind
  title: string
  status: Status | null
  rungs: RailRung[]
  hold: Journey['lead']['hold']
  next: Journey['deals'][number]['nextAction']
  /** Why this reader cannot write the object: set on a contract only. */
  readOnly: string | null
}

function pickOf(
  journey: Journey,
  code: string,
  kindLabel: (kind: string) => string,
): Picked | null {
  const { lead } = journey
  if (lead.code === code) {
    return {
      kind: 'lead',
      title: 'Lead',
      status: leadStatus(lead),
      rungs: railOf('lead', lead.rungs, null),
      hold: lead.hold,
      next: null,
      readOnly: null,
    }
  }
  const deal = journey.deals.find((d) => d.code === code)
  if (deal) {
    return {
      kind: 'deal',
      title: deal.name,
      status: dealStatus(deal),
      rungs: railOf('deal', deal.rungs, dealLate(deal)),
      hold: deal.hold,
      next: deal.outcome === 'open' ? deal.nextAction : null,
      readOnly: null,
    }
  }
  const contract = journey.contracts.find((c) => c.code === code)
  if (!contract) return null
  return {
    kind: 'contract',
    title: (contract.kind && kindLabel(contract.kind)) || 'Hợp đồng',
    status: contractStatus(contract),
    rungs: railOf('contract', contract.rungs, contractLate(contract)),
    hold: null,
    next: null,
    readOnly:
      contract.canEdit === false
        ? contractReadOnlyNote(contract.holder?.name, contract.canCollect === true)
        : null,
  }
}

function Timeline({ rungs }: { rungs: RailRung[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {rungs.map((r, i) => {
        const reached = r.state !== 'upcoming' && r.state !== 'skipped'
        const who = [r.by && `Bởi ${r.by.name}`, r.days !== null && `${r.days} ngày`]
          .filter(Boolean)
          .join(' · ')
        return (
          <li key={r.key} className="flex min-h-14 gap-3">
            <span className="flex w-3.5 shrink-0 flex-col items-center">
              <span className="pt-1">
                <RungDot rung={r} />
              </span>
              {i < rungs.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'mt-1 w-0.5 flex-1 rounded-full',
                    r.litOut ? 'bg-success' : 'bg-surface-ink/16',
                  )}
                />
              )}
            </span>
            <div className="flex min-w-0 grow flex-col gap-1 pb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[14px] font-semibold">{r.label}</span>
                <span className="text-muted-foreground tnum text-[12px]">
                  {reached && r.at
                    ? dmhm(r.at)
                    : r.state === 'skipped'
                      ? STATE_WORD.skipped
                      : STATE_WORD.upcoming}
                </span>
              </div>
              {(r.state === 'current' || r.state === 'stopped') && (
                <span className="self-start">
                  <StatusPill status={rungStatus(r.state, r.late)} />
                </span>
              )}
              {reached && who && <span className="text-muted-foreground text-[12px]">{who}</span>}
              {r.subSteps.map((s) => (
                <span key={`${s.label}-${s.at ?? ''}`} className="text-[12px] leading-[1.5]">
                  {s.label}
                  {s.at && <span className="text-muted-foreground tnum"> · {dm(s.at)}</span>}
                  {s.note && <span className="text-muted-foreground"> · {s.note}</span>}
                </span>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function CardDrawer({
  journey,
  code,
  onClose,
  go,
  pathOf,
}: {
  journey: Journey
  /** The card open; null closes the drawer. */
  code: string | null
  onClose: () => void
  go: (path: string) => void
  pathOf: PathOf
}) {
  const kindLabel = useContractKindLabel()
  const [tab, setTab] = useState('flow')
  /* The last card stays read while the drawer slides out. */
  const shown = useRef(code)
  if (code) shown.current = code
  const at = shown.current
  const picked = at ? pickOf(journey, at, kindLabel) : null
  if (!at || !picked) return null
  const path = pathOf(CHAIN_KIND[picked.kind], at)
  const subject = { kind: SUBJECT[picked.kind], code: at }

  return (
    <Drawer
      open={code !== null}
      onClose={onClose}
      title={picked.title}
      subtitle={<span className="font-mono">{at}</span>}
      meta={
        <span className="flex flex-wrap items-center gap-2">
          {picked.status && <StatusPill status={picked.status} />}
          <HoldMark hold={picked.hold} due />
        </span>
      }
      footer={
        <div className="flex justify-end">
          <Button size="lg" disabled={!path} onClick={() => path && go(path)}>
            <span>
              Mở <span className="font-mono">{at}</span>
            </span>
            <Icon icon={ArrowRight} size={16} />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {picked.readOnly && (
          <p className="text-muted-foreground m-0 flex items-start gap-2 text-[12.5px] leading-[1.6]">
            <Icon icon={Lock} size={16} className="mt-1 shrink-0" />
            {picked.readOnly}
          </p>
        )}
        <RunContacts subject={subject} />
        <SegmentedControl
          label="Nội dung của thẻ"
          hideLabel
          value={tab}
          onChange={setTab}
          options={[
            { value: 'flow', label: 'Tiến trình' },
            { value: 'comm', label: 'Lịch sử liên hệ' },
          ]}
        />
        {tab === 'flow' ? (
          <>
            <RunOwners workstreamCode={journey.code} focus={at} />
            {picked.next && <NextAction action={picked.next} />}
            <Timeline rungs={picked.rungs} />
          </>
        ) : (
          <CommJourney workstreamCode={journey.code} subject={subject} />
        )}
      </div>
    </Drawer>
  )
}
