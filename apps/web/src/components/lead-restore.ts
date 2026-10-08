import { userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { useDisableLeads } from '@/data/lead-disable'

/** "Applied X, skipped Y" — a lead already in the asked state is left out by the server, not failed. */
export function appliedMessage(verb: string, changed: number, asked: number) {
  const done = `Đã ${verb} ${changed} lead`
  return asked > changed ? `${done}, bỏ qua ${asked - changed} lead đã ở trạng thái này` : done
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
            toastDone(appliedMessage('khôi phục', changed.length, codes.length))
            onDone?.()
          },
          onError: (error) => toastFail('Không khôi phục được lead.', userMessage(error)),
        },
      ),
  }
}
