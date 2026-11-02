import { useQuery } from '@tanstack/react-query'
import type { ContractCollectorCandidates } from '@pv/contracts'
import { getLang, message, translate, type Lang } from '@/app/i18n'
import { contractCollectorCandidatesQuery } from '@/data/contracts'
import { PERMISSION_LABEL } from '@/data/roles'

/** Who may be picked as the payment PIC. Nobody is pre-picked, the closer
 *  included: the PIC is a choice, and a default is how the wrong one sticks. */
export function useCollectorCandidates(open: boolean) {
  return useQuery({ ...contractCollectorCandidatesQuery, enabled: open })
}

/** Said under the box the moment the list comes back empty, not when the rest is filled. */
export const noCollectorText = (lang: Lang = getLang()) => {
  const permission = PERMISSION_LABEL['contract.record-payment']
  return translate(
    message(
      `Chưa ai có quyền ${permission}. Nhờ quản trị viên cấp quyền.`,
      `No one has the permission "${permission}". Ask an admin to grant it.`,
      `"${permission}" 권한을 가진 사람이 없습니다. 관리자에게 권한 부여를 요청하세요.`,
    ),
    lang,
  )
}

/** What the footer says about the PIC while none is picked. A load failure is
 *  said here only, and an empty list only under the box (`noCollectorText`). */
export function collectorNote(
  failed: boolean,
  candidates: ContractCollectorCandidates | undefined,
  restFilled: boolean,
) {
  if (failed) {
    return translate(
      message(
        'Không tải được danh sách người thu tiền.',
        'Could not load the list of payment collectors.',
        '수금 담당자 목록을 불러오지 못했습니다.',
      ),
    )
  }
  if (!restFilled || candidates?.length === 0) return ''
  return translate(
    message('Chọn người thu tiền.', 'Choose a payment collector.', '수금 담당자를 선택하세요.'),
  )
}
