import { useQuery } from '@tanstack/react-query'
import type { AssistantSubject } from '@pv/contracts'
import { contractDetailQuery } from './contracts'
import { leadProfileQuery } from './lead-profile'
import { opportunityProfileQuery } from './opportunities'

/** The name of the record on screen, read from what its own page loaded. The
 *  three reads are switched off, so nothing is fetched; they only watch the
 *  cache, and the name appears if the page finishes after the panel opened.
 *  With nothing cached the panel shows the code alone. */
export function useSubjectName({ kind, code }: AssistantSubject): string | undefined {
  const deal = useQuery({ ...opportunityProfileQuery(code), enabled: false }).data
  const lead = useQuery({ ...leadProfileQuery(code), enabled: false }).data
  const contract = useQuery({ ...contractDetailQuery(code), enabled: false }).data
  if (kind === 'opportunity') return deal?.account
  if (kind === 'lead') return lead?.company
  return contract?.customer
}
