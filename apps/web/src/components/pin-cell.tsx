import { Button, Icon, Pin, cn } from '@pv/ui'
import type { PinSubject } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { usePinToggle, usePins, useSetPins } from '@/data/pins'

/** The pin pieces both pinnable books share — the row's own pin and the
 *  selection bar's. Pins are per person, on the server (`data/pins.ts`). */

const failureOf = (error: unknown) => (isApiError(error) ? userMessage(error) : undefined)

/** Off, the button shows on row hover only — always on where there is no hover
 *  to reveal it. It stops the click from reaching the row, or pinning would
 *  also open the record. */
export function PinCell({
  subject,
  code,
  label,
}: {
  subject: PinSubject
  code: string
  label: string
}) {
  const { t } = useI18n()
  const { pinned: on, toggle } = usePinToggle(subject, code)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t(
        on
          ? message(`Bỏ ghim ${label}`, `Unpin ${label}`, `${label} 고정 해제`)
          : message(`Ghim ${label}`, `Pin ${label}`, `${label} 고정`),
      )}
      onClick={(e) => {
        e.stopPropagation()
        toggle()
      }}
      className={cn(
        'motion-std pointer-coarse:size-12 flex size-8 items-center justify-center rounded-md',
        on
          ? 'text-accent-foreground bg-primary/24'
          : 'text-muted-foreground hover:bg-surface-ink/9 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
      )}
    >
      <Icon icon={Pin} size={16} />
    </button>
  )
}

/** Pins the picked rows, or unpins them once every one is pinned — so a mixed
 *  selection always ends pinned. The selection clears at once; the toast
 *  waits for the server, which `mutateAsync` still reports after the bar unmounts. */
export function PinSelectionAction({
  subject,
  codes,
  noun,
  onDone,
}: {
  subject: PinSubject
  codes: readonly string[]
  noun: string
  onDone: () => void
}) {
  const { t } = useI18n()
  const pins = usePins(subject).codes
  const setPins = useSetPins(subject)
  const allPinned = codes.every((code) => pins.includes(code))

  const failed = (count: number) =>
    t(
      allPinned
        ? message(
            `Không bỏ ghim được ${count} ${noun}.`,
            `Could not unpin ${count} ${noun}.`,
            `${noun} ${count}개의 고정을 해제하지 못했습니다.`,
          )
        : message(
            `Không ghim được ${count} ${noun}.`,
            `Could not pin ${count} ${noun}.`,
            `${noun} ${count}개를 고정하지 못했습니다.`,
          ),
    )

  return (
    <Button
      size="lg"
      variant="ghost"
      onClick={() => {
        const count = codes.length
        void setPins.mutateAsync({ codes, pinned: !allPinned }).then(
          ({ changed }) => {
            const n = changed.length
            const done = t(
              allPinned
                ? message(
                    `Đã bỏ ghim ${n} ${noun}`,
                    `Unpinned ${n} ${noun}`,
                    `${noun} ${n}개 고정 해제함`,
                  )
                : message(`Đã ghim ${n} ${noun}`, `Pinned ${n} ${noun}`, `${noun} ${n}개 고정함`),
            )
            if (n === 0) toastFail(failed(count))
            else
              toastDone(
                count > n
                  ? t(
                      message(
                        `${done}, bỏ qua ${count - n}`,
                        `${done}, skipped ${count - n}`,
                        `${done}, ${count - n}개 제외`,
                      ),
                    )
                  : done,
              )
          },
          (error: unknown) => toastFail(failed(count), failureOf(error)),
        )
        onDone()
      }}
    >
      {allPinned ? t(message('Bỏ ghim', 'Unpin', '고정 해제')) : t(message('Ghim', 'Pin', '고정'))}
    </Button>
  )
}
