import { partialMatchKey, type QueryKey } from '@tanstack/react-query'
import type { EntityKind } from '@pv/contracts'
import { sessionIsLive } from '@/app/auth'
import { queryClient } from '@/app/query-client'
import { ACCOUNT_BOOK_KEY } from '@/data/accounts'
import { APPROVALS_KEY } from '@/data/approvals'
import { CAMPAIGN_BOOK_KEY } from '@/data/campaign-book'
import { campaignTotalsQuery, sourcesQuery } from '@/data/campaigns'
import { COMM_RECORDS_KEY } from '@/data/comm-record-detail'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import { CONTACT_BOOK_KEY } from '@/data/contacts'
import { CONTRACT_BOOK_KEY, contractTerminationReasonsQuery } from '@/data/contracts'
import { DIRECTORY_KEY } from '@/data/directory'
import { HOLD_LIST_KEY } from '@/data/holds'
import { PERFORMANCE_KEY } from '@/data/home-charts'
import { leadLabelOptionsQuery } from '@/data/lead-labels'
import { LEAD_STATE_KEYS } from '@/data/lead-exit'
import { LEAD_ORIGINS_KEY, STATS_KEY as LEAD_SOURCE_STATS_KEY } from '@/data/lead-origins'
import { LEAD_SCAN_KEY } from '@/data/lead-scan'
import { leadIndustryTagsQuery, leadStopReasonsQuery } from '@/data/leads'
import { LETTERS_KEY, masTemplatesQuery } from '@/data/mas'
import { MAIL_RUN_KEY } from '@/data/mail-runs'
import { MEETING_KEY } from '@/data/meetings'
import { NEXT_STEP_KEY } from '@/data/next-step'
import { POLICY_KEY } from '@/data/notification-policy'
import { OPPORTUNITY_BOOK_KEY } from '@/data/opportunities'
import { opportunityStopReasonsQuery } from '@/data/opportunities-write'
import { PARTNERS_KEY } from '@/data/partners'
import { contractKindsQuery, quotationReasonsQuery } from '@/data/quotations-write'
import { ROLES_KEY } from '@/data/roles'
import { leadMotionsQuery } from '@/data/sales-motions'
import { USERS_KEY } from '@/data/users'
import { WORKSTREAM_BOOK_KEY } from '@/data/workstreams'

/** Records written by someone else (ADR 0104): the server says which KIND, and
 *  this table says which cached reads that kind can have changed.
 *
 *  Each row lists key PREFIXES. A mounted query re-reads at once; the rest are
 *  only marked stale and re-read when next used. Left out on purpose:
 *  notifications (their own `changed` event), pins (per user, written here),
 *  signed-URL reads (workstream documents, lead attachments, comm `files`),
 *  and the audited content reads — thread messages, `record`, `workstream`
 *  under COMM_RECORDS_KEY — where every read writes an audit line. */

/* Spelled out because no file exports the prefix: `sales.config` is read by
   four files' own keys, `sales.kpi` by four local `monthKey`s, `sales.ops` by
   the deal profile. */
const SALES_CONFIG_KEY = ['sales', 'config'] as const
const SALES_KPI_KEY = ['sales', 'kpi'] as const
const OPS_KEY = ['sales', 'ops'] as const
/* The lead's own contacts and admission answers: `['sales','leads', code, …]`. */
const LEAD_SCOPED_KEY = ['sales', 'leads'] as const

/* Only the queue, counts, target and subject index of comm records: `record`,
   `workstream` and `files` under the same root are audited or signed. */
const COMM_QUEUE_KEYS = ['pending', 'counts', 'target', 'subject-index'].map(
  (part) => [...COMM_RECORDS_KEY, part] as const,
)

const KEYS_OF_KIND: Record<EntityKind, readonly QueryKey[]> = {
  lead: [
    ...LEAD_STATE_KEYS,
    LEAD_ORIGINS_KEY,
    LEAD_SOURCE_STATS_KEY,
    PARTNERS_KEY,
    leadIndustryTagsQuery.queryKey,
    LEAD_SCOPED_KEY,
    NEXT_STEP_KEY,
  ],
  opportunity: [OPPORTUNITY_BOOK_KEY, OPS_KEY, NEXT_STEP_KEY],
  account: [ACCOUNT_BOOK_KEY],
  contact: [CONTACT_BOOK_KEY, LEAD_SCOPED_KEY],
  contract: [CONTRACT_BOOK_KEY, ['sales', 'overdue-reasons']],
  workstream: [WORKSTREAM_BOOK_KEY, NEXT_STEP_KEY],
  meeting: [MEETING_KEY],
  comm: COMM_QUEUE_KEYS,
  approval: [APPROVALS_KEY],
  /* The campaign page prints a wave's send progress, so it follows mail. */
  mail: [MAIL_RUN_KEY, LETTERS_KEY, CAMPAIGN_BOOK_KEY],
  campaign: [CAMPAIGN_BOOK_KEY, campaignTotalsQuery.queryKey, sourcesQuery.queryKey],
  scan: [LEAD_SCAN_KEY],
  config: [
    SALES_CONFIG_KEY,
    leadLabelOptionsQuery.queryKey,
    leadStopReasonsQuery.queryKey,
    leadMotionsQuery().queryKey,
    commVocabularyQuery.queryKey,
    opportunityStopReasonsQuery.queryKey,
    contractTerminationReasonsQuery.queryKey,
    quotationReasonsQuery.queryKey,
    contractKindsQuery.queryKey,
    masTemplatesQuery.queryKey,
    POLICY_KEY,
    ROLES_KEY,
  ],
  kpi: [SALES_KPI_KEY],
  /* A hold also moves the lead state and the deal's profile and book. */
  hold: [HOLD_LIST_KEY, ...LEAD_STATE_KEYS, OPPORTUNITY_BOOK_KEY, OPS_KEY],
  user: [USERS_KEY, DIRECTORY_KEY, ROLES_KEY],
}

/** One call for all prefixes: kinds overlap (workstream is under lead and
 *  workstream), and one sweep per kind would read the same query twice.
 *  `cancelRefetch: false` because at one event a second a slow read would
 *  otherwise be aborted before it lands. Behind the expiry lock a read is
 *  refused and would swap the kept screen for an error, so nothing runs. */
function dropReads(prefixes: readonly QueryKey[]) {
  if (!sessionIsLive()) return
  void queryClient.invalidateQueries(
    {
      predicate: (query) => prefixes.some((prefix) => partialMatchKey(query.queryKey, prefix)),
      refetchType: 'active',
    },
    { cancelRefetch: false },
  )
}

/** KPI and home figures are computed from these kinds' rows. Re-reading them on
 *  every event would recompute each in every open tab up to once a second, so
 *  they are swept at most once a minute; the jitter keeps tabs from asking in
 *  the same second. */
const AGGREGATE_KEYS = [SALES_KPI_KEY, PERFORMANCE_KEY] as const
const AGGREGATE_SOURCES = new Set<EntityKind>([
  'lead',
  'opportunity',
  'contract',
  'meeting',
  'comm',
  'approval',
])
const AGGREGATE_EVERY_MS = 60_000
let aggregateSweep: ReturnType<typeof setTimeout> | undefined

function sweepAggregatesSoon() {
  if (aggregateSweep) return
  aggregateSweep = setTimeout(
    () => {
      aggregateSweep = undefined
      dropReads(AGGREGATE_KEYS)
    },
    AGGREGATE_EVERY_MS * (1 + Math.random() / 4),
  )
}

export function onEntityChange(kinds: readonly EntityKind[]) {
  dropReads(kinds.flatMap((kind) => KEYS_OF_KIND[kind]))
  if (kinds.some((kind) => AGGREGATE_SOURCES.has(kind))) sweepAggregatesSoon()
}

/** The first `ready` of a page load has nothing stale behind it; a later one
 *  follows a drop or a hidden tab, when events were missed. Module-level so a
 *  re-hold after the grace shut still counts as a return. */
let seenReady = false

export function onStreamReady() {
  if (!seenReady) {
    seenReady = true
    return
  }
  dropReads([...Object.values(KEYS_OF_KIND).flat(), ...AGGREGATE_KEYS])
}
