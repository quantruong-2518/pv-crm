import { Button, Icon, UserRoundPlus } from '@pv/ui'
import { userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { useResumeLead } from '@/data/lead-exit'

/** The claim button on a row of the nurturing pool: the caller becomes the holder.
 *  Shared by the lead book's PIC cell and the nurturing page. Stops the click
 *  so the row does not open as well. */
export function ClaimLeadButton({ code }: { code: string }) {
  const claim = useResumeLead(code)
  return (
    <Button
      size="sm"
      variant="ghost"
      className="pointer-coarse:h-12"
      disabled={claim.isPending}
      onClick={(event) => {
        event.stopPropagation()
        claim.mutate(undefined, {
          onSuccess: () => toastDone(`Đã nhận ${code}.`),
          onError: (error) => toastFail('Không nhận được lead.', userMessage(error)),
        })
      }}
    >
      <Icon icon={UserRoundPlus} size={16} />
      Nhận lead
    </Button>
  )
}
