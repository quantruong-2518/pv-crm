import { Button, Icon, UserRoundPlus } from '@pv/ui'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { useResumeLead } from '@/data/lead-exit'

/** The claim button on a row of the nurturing pool: the caller becomes the holder.
 *  Shared by the lead book's PIC cell and the nurturing page. Stops the click
 *  so the row does not open as well. */
export function ClaimLeadButton({ code }: { code: string }) {
  const { t } = useI18n()
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
          onSuccess: () =>
            toastDone(
              t(message(`Đã nhận ${code}.`, `Claimed ${code}.`, `${code}을(를) 받았습니다.`)),
            ),
          onError: (error) =>
            toastFail(
              t(
                message(
                  'Không nhận được lead.',
                  'Could not claim the lead.',
                  '리드를 받지 못했습니다.',
                ),
              ),
              userMessage(error),
            ),
        })
      }}
    >
      <Icon icon={UserRoundPlus} size={16} />
      {t(message('Nhận lead', 'Claim lead', '리드 받기'))}
    </Button>
  )
}
