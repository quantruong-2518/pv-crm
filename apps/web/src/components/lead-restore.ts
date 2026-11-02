import { userMessage } from '@/app/api'
import { message, translate } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { useDisableLeads } from '@/data/lead-disable'

/** "Applied X, skipped Y" — a lead already in the asked state is left out by the server, not failed. */
export function appliedMessage(verb: 'disable' | 'restore', changed: number, asked: number) {
  const skipped = asked - changed
  const done =
    verb === 'disable'
      ? message(
          `Đã vô hiệu hoá ${changed} lead`,
          `Disabled ${changed} ${changed === 1 ? 'lead' : 'leads'}`,
          `리드 ${changed}개를 비활성화했습니다`,
        )
      : message(
          `Đã khôi phục ${changed} lead`,
          `Restored ${changed} ${changed === 1 ? 'lead' : 'leads'}`,
          `리드 ${changed}개를 복원했습니다`,
        )
  if (asked <= changed) return translate(done)
  const rest = message(
    `${done.vi}, bỏ qua ${skipped} lead đã ở trạng thái này`,
    `${done.en}, skipped ${skipped} already in this state`,
    `${done.ko}, 이미 이 상태인 리드 ${skipped}개는 건너뛰었습니다`,
  )
  return translate(rest)
}

/** Switch leads back on, with the one toast both doors print — the book's
 *  selection bar and the profile's notice. No confirm: it only puts back what
 *  was there. Apart from `lead-disable.tsx` because a component file may
 *  export components only (fast refresh). */
export function useRestoreLeads() {
  const write = useDisableLeads()

  return {
    pending: write.isPending,
    restore: (codes: string[], onDone?: () => void) =>
      write.mutate(
        { codes, disabled: false },
        {
          onSuccess: ({ changed }) => {
            toastDone(appliedMessage('restore', changed.length, codes.length))
            onDone?.()
          },
          onError: (error) =>
            toastFail(
              translate(
                message(
                  'Không khôi phục được lead.',
                  'Could not restore the lead.',
                  '리드를 복원하지 못했습니다.',
                ),
              ),
              userMessage(error),
            ),
        },
      ),
  }
}
