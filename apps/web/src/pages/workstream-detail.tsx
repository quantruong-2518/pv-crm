import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, type RailObject } from '@pv/ui'
import {
  CLOSE_REASON_LABEL,
  JOURNEY_BORN_BY_LABEL,
  JOURNEY_STATUS_LABEL,
  type WorkstreamJourneyResponse,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dmy } from '@/lib/date'
import { chainPath } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { runDays } from '@/data/workstreams'
import { RecordHeader } from '@/components/record/record-header'
import { RecordShell } from '@/components/record/record-shell'
import { RunStrip } from '@/components/record/run-strip'
import { CommJourney } from '@/components/run/comm-journey'
import { RunContacts } from '@/components/run/run-contacts'
import { WorkstreamTree } from './workstream-tree'
import { POOL, type PathOf } from './workstream-tree-model'

/** One run — `/sales/workstreams/:code`, the run overview on the record shell
 *  (ADR 0078 §2): run strip, header, then the body — the four-lane tree, whose
 *  cards already carry what is late — and the rail — the whole run's comms and
 *  its lead's contacts. No files: a run has none of its own.
 *
 *  No drawer: a node of the tree opens its object's profile, and every act the
 *  drawer offered lives there. No floating bar: whom to contact is a question
 *  for the lead, deal or contract, not for the run. */

type Journey = WorkstreamJourneyResponse
type Go = (path: string) => void

export default function WorkstreamDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: journey, isPending, error } = useQuery(workstreamJourneyQuery(code))

  return (
    <AppShell {...chrome.shell}>
      {journey ? (
        <RunScreen journey={journey} />
      ) : (
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: `Mã ${code} không có trong sổ, hoặc hành trình nằm ngoài phạm vi của bạn.`,
            fallback: 'Không mở được hành trình.',
            back: { label: 'Về sổ hành trình', onClick: () => navigate('/sales/workstreams') },
          }}
        />
      )}
    </AppShell>
  )
}

function RunScreen({ journey }: { journey: Journey }) {
  const navigate = useNavigate()
  /* `chainPath` has no contract door; the strip gates it the same way. */
  const canOpenContract = useCan('contract.view')
  const pathOf: PathOf = (kind, code) =>
    kind !== 'HĐ'
      ? chainPath(kind, code)
      : canOpenContract
        ? `/sales/contracts/${encodeURIComponent(code)}`
        : undefined
  const lead = { kind: 'lead', code: journey.lead.code } as const

  return (
    <RecordShell
      strip={
        <RunStrip
          workstreamCode={journey.code}
          current={{ kind: 'workstream', code: journey.code }}
          fallback={railOf(journey, navigate)}
        />
      }
      header={<RunHeader journey={journey} />}
      main={<WorkstreamTree key={journey.code} journey={journey} go={navigate} pathOf={pathOf} />}
      railLabel="Liên hệ và người liên hệ của hành trình"
      rail={
        <>
          <CommJourney workstreamCode={journey.code} />
          <RunContacts subject={lead} />
        </>
      }
    />
  )
}

/** The strip's stand-in when the run cannot be re-read: previous journey,
 *  this one, its lead and account, then every journey it grew into. */
function railOf(j: Journey, go: Go): RailObject[] {
  const chip = (kind: 'WS' | 'LD' | 'AC', code: string): RailObject => {
    const path = chainPath(kind, code)
    return path ? { code, onOpen: () => go(path) } : { code }
  }
  return [
    ...(j.previous ? [chip('WS', j.previous.code)] : []),
    { code: j.code, source: true },
    chip('LD', j.lead.code),
    ...(j.accountCode !== null ? [chip('AC', j.accountCode)] : []),
    ...j.next.map((n) => chip('WS', n.code)),
  ]
}

/** The customer, then one meta line: ordinal, status or close reason, dates,
 *  the journey it grew from (its one door, the strip has none), the lead's
 *  holder. The code is the strip's, not repeated here. */
function RunHeader({ journey: j }: { journey: Journey }) {
  const previous = j.previous && chainPath('WS', j.previous.code)
  return (
    <RecordHeader
      title={j.customer}
      meta={[
        `Hành trình ${j.ordinal}`,
        j.status === 'closed'
          ? j.closeReason && CLOSE_REASON_LABEL[j.closeReason]
          : JOURNEY_STATUS_LABEL[j.status],
        <span className="tnum">
          mở {dmy(j.openedAt)}
          {j.closedAt !== null && ` · đóng ${dmy(j.closedAt)}`} · {runDays(j, Date.now())} ngày
        </span>,
        j.previous && previous && (
          <Link to={previous} className="text-foreground underline underline-offset-2">
            nối từ hành trình {j.previous.ordinal} ({JOURNEY_BORN_BY_LABEL[j.previous.bornBy]})
          </Link>
        ),
        j.lead.holder ? `Người giữ ${j.lead.holder.name}` : POOL,
      ]}
    />
  )
}
