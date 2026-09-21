import { useMemo } from 'react'
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  CampaignPickableResponse,
  LeadOriginListResponse,
  LeadSourceStatsResponse,
  type LeadOriginCreate,
  type LeadOriginCreateResponse,
  type LeadOriginListQuery,
  type LeadOriginMergeResponse,
  type LeadOriginPatch,
  type LeadSourceStatsQuery,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** Level 2 of a lead's origin — the catalog, the campaign picker beside it on
 *  the create form, and the funnel counted by motion → origin → campaign.
 *
 *      GET   /sales/lead-origins              `lead.view`
 *      POST  /sales/lead-origins              `lead.edit` — anyone typing a lead
 *      PATCH /sales/lead-origins/:id          `lead-origin.manage`
 *      POST  /sales/lead-origins/:id/merge    `lead-origin.manage`
 *      GET   /sales/campaigns/pickable        `lead.edit` — it feeds the create form
 *      GET   /sales/leads/source-stats        `campaign.view`
 *
 *  A merge moves leads between origins, so it also refreshes the lead book and
 *  the stats; a rename only needs the catalog and the book's facet names. */

const LIST_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view' }
const CREATE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit' }
const MANAGE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead-origin.manage' }
const CAMPAIGN_NEED: ApiNeed = { branch: 'Sales', permission: 'campaign.view' }

const ORIGINS_PATH = '/sales/lead-origins'

export const LEAD_ORIGINS_KEY = ['sales', 'lead-origins'] as const
const STATS_KEY = ['sales', 'lead-source-stats'] as const
/** Same literal `data/lead-create.ts` copies, for the reason it states there. */
const LEAD_BOOK_KEY = ['sales', 'lead-book'] as const

export function paramsOf(query: Record<string, string | boolean | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

/** `keepPreviousData` so a picker does not flash empty between keystrokes. */
export const leadOriginsQuery = (query: LeadOriginListQuery) =>
  queryOptions({
    queryKey: [...LEAD_ORIGINS_KEY, query] as const,
    queryFn: ({ signal }) =>
      api.read<LeadOriginListResponse>(`${ORIGINS_PATH}${paramsOf(query)}`, {
        need: LIST_NEED,
        schema: LeadOriginListResponse,
        signal,
      }),
    placeholderData: keepPreviousData,
  })

export const pickableCampaignsQuery = (q: string | undefined) =>
  queryOptions({
    queryKey: ['sales', 'campaigns', 'pickable', q ?? ''] as const,
    queryFn: ({ signal }) =>
      api.read<CampaignPickableResponse>(`/sales/campaigns/pickable${paramsOf({ q })}`, {
        need: CREATE_NEED,
        schema: CampaignPickableResponse,
        signal,
      }),
    placeholderData: keepPreviousData,
  })

/** Origin id → name over the whole catalog, hidden rows included — for a
 *  screen that holds an `originId` and must print it. */
export function useOriginNames(): ReadonlyMap<string, string> {
  const { data } = useQuery(leadOriginsQuery({ includeInactive: true }))
  return useMemo(() => new Map((data?.rows ?? []).map((o) => [o.id, o.name])), [data])
}

export const leadSourceStatsQuery = (query: LeadSourceStatsQuery) =>
  queryOptions({
    queryKey: [...STATS_KEY, query] as const,
    queryFn: ({ signal }) =>
      api.read<LeadSourceStatsResponse>(`/sales/leads/source-stats${paramsOf(query)}`, {
        need: CAMPAIGN_NEED,
        schema: LeadSourceStatsResponse,
        signal,
      }),
  })

export function useCreateLeadOrigin() {
  const client = useQueryClient()
  return useMutation<LeadOriginCreateResponse, ApiError, LeadOriginCreate>({
    mutationFn: (body) =>
      api.write<LeadOriginCreateResponse>(ORIGINS_PATH, { body, need: CREATE_NEED }),
    onSuccess: () => void client.invalidateQueries({ queryKey: LEAD_ORIGINS_KEY }),
  })
}

export function usePatchLeadOrigin() {
  const client = useQueryClient()
  return useMutation<unknown, ApiError, { id: string; body: LeadOriginPatch }>({
    mutationFn: ({ id, body }) =>
      api.write(`${ORIGINS_PATH}/${id}`, { method: 'PATCH', body, need: MANAGE_NEED }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: LEAD_ORIGINS_KEY })
      void client.invalidateQueries({ queryKey: LEAD_BOOK_KEY })
    },
  })
}

export function useMergeLeadOrigin() {
  const client = useQueryClient()
  return useMutation<LeadOriginMergeResponse, ApiError, { id: string; into: string }>({
    mutationFn: ({ id, into }) =>
      api.write<LeadOriginMergeResponse>(`${ORIGINS_PATH}/${id}/merge`, {
        body: { into },
        need: MANAGE_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: LEAD_ORIGINS_KEY })
      void client.invalidateQueries({ queryKey: LEAD_BOOK_KEY })
      void client.invalidateQueries({ queryKey: STATS_KEY })
    },
  })
}
