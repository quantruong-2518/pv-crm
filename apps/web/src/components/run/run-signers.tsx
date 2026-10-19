import type { ContractParticipant } from '@pv/contracts'
import { SALE_PRIMARY_LABEL, marksPrimary } from '@/data/opportunities'
import { RunBlock } from './run-block'
import { LANE_SEAT } from './run-owners'
import { PersonList, PersonRow } from './run-person'

/** Who stood on the deal when the contract was signed — the server's frozen
 *  copy of its SALE and BD lanes (ADR 0086), read-only. Separate from
 *  `RunOwners`, which names who holds the contract TODAY; the two may differ.
 *  Draws nothing for a contract signed with nobody on the deal. */
export function RunSigners({ people }: { people: ContractParticipant[] }) {
  if (people.length === 0) return null
  const sale = people.filter((o) => o.role === 'SALE')

  return (
    <RunBlock title="PIC lúc ký">
      <PersonList>
        {people.map((o) => (
          <PersonRow
            key={`${o.role}-${o.id}`}
            name={o.name}
            tag={marksPrimary(o, sale) && SALE_PRIMARY_LABEL}
            lines={[LANE_SEAT[o.role]]}
          />
        ))}
      </PersonList>
    </RunBlock>
  )
}
