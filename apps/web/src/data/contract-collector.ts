import { useQuery } from '@tanstack/react-query'
import type { ContractCollectorCandidates } from '@pv/contracts'
import { contractCollectorCandidatesQuery } from '@/data/contracts'
import { PERMISSION_LABEL } from '@/data/roles'

/** Who may be picked as the payment PIC. Nobody is pre-picked, the closer
 *  included: the PIC is a choice, and a default is how the wrong one sticks. */
export function useCollectorCandidates(open: boolean) {
  return useQuery({ ...contractCollectorCandidatesQuery, enabled: open })
}

/** Said under the box the moment the list comes back empty, not when the rest is filled. */
export const NO_COLLECTOR = `Chưa ai có quyền ${PERMISSION_LABEL['contract.record-payment']}. Nhờ quản trị viên cấp quyền.`

/** What the footer says about the PIC while none is picked. A load failure is
 *  said here only, and an empty list only under the box (`NO_COLLECTOR`). */
export function collectorNote(
  failed: boolean,
  candidates: ContractCollectorCandidates | undefined,
  restFilled: boolean,
) {
  if (failed) return 'Không tải được danh sách người thu tiền.'
  if (!restFilled || candidates?.length === 0) return ''
  return 'Chọn người thu tiền.'
}
