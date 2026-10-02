import { useQuery } from '@tanstack/react-query'
import type { RailObject } from '@pv/ui'
import {
  CONTRACT_KIND_LABEL,
  OPPORTUNITY_CONTACT_ROLE_LABEL,
  type JourneyContract,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import type { Contract } from '@/data/contracts'
import { opportunityProfileQuery, railOf } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import type { BarContact } from '@/components/record/action-bar'

/** The contract row carries no run code and no name, so both are read off its
 *  deal (the deal screen's cache), and so are the people the contact bar
 *  reaches: the deal's contacts, which the rail lists under the signer. Needs
 *  `opportunity.view`: without it, no run. The run's journey then gives the
 *  contract's rungs and what sits inside them (`workstream.view`). */

/** The mail row's refusal without `lead.send-email`, word for word as
 *  `comm-actions.tsx` says it. */
export const MAIL_BLOCKED = 'Cần quyền gửi email cho lead.'

/** `denied` = no `workstream.view`; `unread` = no run, or this contract is not in it. */
export type RunRead = 'pending' | 'denied' | 'unread' | 'ready'

export function useContractRun(contract: Contract) {
  const canViewDeal = useCan('opportunity.view')
  const canViewRun = useCan('workstream.view')
  const deal = useQuery({
    ...opportunityProfileQuery(contract.opportunityCode),
    enabled: canViewDeal,
  })
  const workstreamCode = deal.data?.workstream?.code ?? null
  const journey = useQuery({
    ...workstreamJourneyQuery(workstreamCode ?? ''),
    enabled: canViewRun && workstreamCode !== null,
  })
  const inside = journey.data?.contracts.find((c) => c.code === contract.code) ?? null
  const contacts: BarContact[] = (deal.data?.contacts ?? []).map((c) => ({
    ...c,
    role: c.role && OPPORTUNITY_CONTACT_ROLE_LABEL[c.role],
  }))
  const read: RunRead = !canViewRun
    ? 'denied'
    : deal.isLoading || journey.isLoading
      ? 'pending'
      : inside
        ? 'ready'
        : 'unread'
  /* The strip already names the customer; the header names the deal. */
  const title =
    deal.data?.name ?? (contract.kind ? CONTRACT_KIND_LABEL[contract.kind] : contract.customer)

  return { workstreamCode, contacts, inside, read, title }
}

/** The strip's stand-in when the run cannot be read: lead, deal, contract,
 *  like the lead's and the deal's server chain. The contract chip is the one open. */
export function contractChain(contract: Contract, go: (path: string) => void): RailObject[] {
  return railOf(
    [
      { kind: 'LD', code: contract.leadCode, label: '' },
      { kind: 'OP', code: contract.opportunityCode, label: '' },
      { kind: 'HĐ', code: contract.code, label: '' },
    ],
    contract.code,
    go,
  )
}

/** Whether a contract has anything inside its rungs to show (`ContractInside`). */
export const hasInside = (c: JourneyContract) =>
  c.milestones.length > 0 || c.acceptance.length > 0 || c.installments.length > 0 || !!c.licence
