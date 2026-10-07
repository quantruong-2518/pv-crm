import { userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { useDisableLeads } from '@/data/lead-disable'

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
            toastDone(`Đã khôi phục ${changed.length} lead`)
            onDone?.()
          },
          onError: (error) => toastFail('Không khôi phục được lead.', userMessage(error)),
        },
      ),
  }
}
