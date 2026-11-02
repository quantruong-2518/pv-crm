import { Avatar, Check, Drawer, Icon, Skeleton, cn } from '@pv/ui'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { noCollectorText, useCollectorCandidates } from '@/data/contract-collector'
import type { Contract } from '@/data/contracts'
import { useChangeCollector } from '@/data/contracts-write'

/** Swapping the payment PIC on a signed contract (ADR 0111), for the head of
 *  sales and the director. One tap on a person writes it: the PIC is one
 *  seat, so there is no second step to confirm. The list is the same one the
 *  sign door offers; the current PIC is marked and cannot be picked again. */

export function ChangeCollectorDrawer({
  contract,
  open,
  onClose,
}: {
  contract: Contract
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const candidates = useCollectorCandidates(open)
  const change = useChangeCollector(contract.code)
  const busy = change.isPending

  const pick = (collectorId: string) =>
    change.mutate(
      { collectorId },
      {
        onSuccess: () => {
          toastDone(
            t(
              message(
                'Đã đổi người thu tiền.',
                'Payment collector changed.',
                '수금 담당자를 변경했습니다.',
              ),
            ),
          )
          onClose()
        },
      },
    )

  const close = () => {
    if (busy) return
    change.reset()
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title={t(message('Đổi người thu tiền', 'Change payment collector', '수금 담당자 변경'))}
      subtitle={
        <>
          <span className="font-mono">{contract.code}</span> · {contract.customer}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {change.error && (
          <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]" role="alert">
            {userMessage(change.error)}
          </p>
        )}
        {candidates.isPending ? (
          <Skeleton height={120} />
        ) : candidates.isError ? (
          <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]" role="alert">
            {t(
              message(
                'Không tải được danh sách người thu tiền.',
                'Could not load the list of payment collectors.',
                '수금 담당자 목록을 불러오지 못했습니다.',
              ),
            )}
          </p>
        ) : candidates.data.length === 0 ? (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
            {noCollectorText()}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {candidates.data.map((person) => {
              const current = person.id === contract.collectorId
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={busy || current}
                    onClick={() => pick(person.id)}
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 rounded-md p-3 text-left',
                      current ? 'bg-primary/16' : 'hover:bg-surface-ink/6',
                      busy && !current && 'opacity-60',
                    )}
                  >
                    <Avatar name={person.name} size="md" card={false} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[13px] font-semibold">{person.name}</span>
                      <span className="text-muted-foreground truncate text-[11.5px] leading-[1.5]">
                        {current
                          ? t(
                              message(
                                'Đang thu tiền hợp đồng này',
                                'Currently collecting for this contract',
                                '현재 이 계약의 수금 담당',
                              ),
                            )
                          : person.role}
                      </span>
                    </span>
                    {current && <Icon icon={Check} size={16} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Drawer>
  )
}
