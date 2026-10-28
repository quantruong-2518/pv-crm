import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  IndustryReportResponse,
  LeadIndustryOptionsResponse,
  type ConfigEntryCreate,
  type ConfigEntryMerge,
  type ConfigList,
  type ConfigProposalReceipt,
  type IndustryReportPeriod,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** Categories and industries — the `CATEGORY` and `INDUSTRY` config lists.
 *
 *      GET  /sales/lead-industries            `lead.view` — both lists, for pickers
 *      GET  /sales/reports/industries         the per-industry report
 *      POST /sales/config/:list               add a category, or an industry under one
 *      POST /sales/config/INDUSTRY/merge      fold one industry into another
 *
 *  Switched-off rows come back too: a lead keeps naming an industry archived
 *  after it was picked. Pickers offer active rows only. */

const LEAD_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view' }
const PROPOSE_NEED: ApiNeed = { branch: 'Sales', permission: 'config.propose' }
/* Same door as the source report it sits beside. */
const REPORT_NEED: ApiNeed = { branch: 'Sales', permission: 'campaign.view' }

export const leadIndustryOptionsQuery = queryOptions({
  queryKey: ['sales', 'lead-industries'] as const,
  queryFn: ({ signal }) =>
    api.read<LeadIndustryOptionsResponse>('/sales/lead-industries', {
      need: LEAD_NEED,
      schema: LeadIndustryOptionsResponse,
      signal,
    }),
  ...cacheTier.reference,
})

type Options = LeadIndustryOptionsResponse | undefined

/** Active categories as select options; `keep`, the one already chosen,
 *  stays listed when switched off so the box can still name it. */
export function categoryOptions(data: Options, keep?: string) {
  return (data?.categories ?? [])
    .filter((c) => c.active || c.id === keep)
    .map((c) => ({ value: c.id, label: c.name }))
}

/** What may be added to a lead: active industries of its category, not yet on it. */
export function industryChoices(data: Options, categoryId: string, picked: readonly string[]) {
  return (data?.industries ?? []).filter(
    (i) => i.active && i.categoryId === categoryId && !picked.includes(i.id),
  )
}

/** The name behind an id of either list; the id itself is the last resort. */
export function configName(data: Options, id: string): string {
  return (
    data?.industries.find((i) => i.id === id)?.name ??
    data?.categories.find((c) => c.id === id)?.name ??
    id
  )
}

/** A category change (`''` = none) drops industries of another category and
 *  keeps the ungrouped ones, as the server does. An id not in the list yet is
 *  kept: the server's answer settles it. */
export function industriesOf(data: Options, ids: readonly string[], categoryId: string): string[] {
  return ids.filter((id) => {
    const owner = data?.industries.find((i) => i.id === id)?.categoryId
    return owner === undefined || owner === null || owner === categoryId
  })
}

export const INDUSTRY_REPORT_KEY = ['sales', 'reports', 'industries'] as const

export const industryReportQuery = (period: IndustryReportPeriod) =>
  queryOptions({
    queryKey: [...INDUSTRY_REPORT_KEY, period] as const,
    queryFn: ({ signal }) =>
      api.read<IndustryReportResponse>(`/sales/reports/industries?period=${period}`, {
        need: REPORT_NEED,
        schema: IndustryReportResponse,
        signal,
      }),
    ...cacheTier.aggregate,
  })

/** Nothing changes until approved; the inbox did, and so did the waiting notes. */
function sent(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ['sales', 'config', 'catalog'] })
  void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
}

/** Propose one new row — a category with its Sale, or an industry with its category. */
export function useProposeConfigCreate() {
  const client = useQueryClient()
  return useMutation<
    ConfigProposalReceipt,
    ApiError,
    { list: ConfigList; body: ConfigEntryCreate }
  >({
    mutationFn: ({ list, body }) =>
      api.write<ConfigProposalReceipt>(`/sales/config/${list}`, {
        method: 'POST',
        body,
        need: PROPOSE_NEED,
      }),
    onSuccess: () => sent(client),
  })
}

export function useProposeIndustryMerge() {
  const client = useQueryClient()
  return useMutation<ConfigProposalReceipt, ApiError, ConfigEntryMerge>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>('/sales/config/INDUSTRY/merge', {
        method: 'POST',
        body,
        need: PROPOSE_NEED,
      }),
    onSuccess: () => sent(client),
  })
}
