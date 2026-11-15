import type { ContractCredit } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { invalid } from '@api/platform/http/problem'
import { actorsByIds, isActiveSeller } from './opportunity-owners'

const CLOSER_ABSENT = 'Người chốt hợp đồng phải có trong phần chia.'
const NOT_SELLER = 'Chỉ chia cho người có vai Sale hoặc Account Executive đang hoạt động.'

/** The split of a signature (ADR 0155), judged where the closer is known: the
 *  signer on a direct sign, the request's raiser on an approval. The sum and
 *  the repeats are the contract's own check; who may hold a share is the
 *  server's. The closer is exempt from the seller rule: ADR 0113 already
 *  decided who may sign, and a director closing may split with their Sales. */
export async function assertCredits(
  handle: Db,
  credits: readonly ContractCredit[] | undefined,
  closerId: string,
): Promise<void> {
  if (!credits?.length) return
  if (!credits.some((c) => c.actorId === closerId)) {
    throw invalid({ credits: [CLOSER_ABSENT] }, CLOSER_ABSENT)
  }
  const others = credits.map((c) => c.actorId).filter((id) => id !== closerId)
  const sellers = new Set(
    (await actorsByIds(handle, others)).filter(isActiveSeller).map((a) => a.id),
  )
  if (others.some((id) => !sellers.has(id))) {
    throw invalid({ credits: [NOT_SELLER] }, NOT_SELLER)
  }
}

/** "Nari 60%, Hoa 40%" for the approver's one-line consequence. */
export const creditLine = (
  credits: readonly ContractCredit[],
  names: ReadonlyMap<string, string>,
): string =>
  credits
    .map(
      (c) => `${names.get(c.actorId) ?? c.actorId} ${(c.shareBp / 100).toLocaleString('vi-VN')}%`,
    )
    .join(', ')
