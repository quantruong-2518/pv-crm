import { Button, Icon, Pin, cn } from '@pv/ui'
import type { PinSubject } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
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
  const { pinned: on, toggle } = usePinToggle(subject, code)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Bỏ ghim ${label}` : `Ghim ${label}`}
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
  const pins = usePins(subject).codes
  const setPins = useSetPins(subject)
  const allPinned = codes.every((code) => pins.includes(code))
  const verb = allPinned ? 'bỏ ghim' : 'ghim'

  return (
    <Button
      size="lg"
      variant="ghost"
      onClick={() => {
        const count = codes.length
        void setPins.mutateAsync({ codes, pinned: !allPinned }).then(
          ({ changed }) => {
            const done = `Đã ${verb} ${changed.length} ${noun}`
            if (changed.length === 0) toastFail(`Không ${verb} được ${count} ${noun}.`)
            else
              toastDone(count > changed.length ? `${done}, bỏ qua ${count - changed.length}` : done)
          },
          (error: unknown) => toastFail(`Không ${verb} được ${count} ${noun}.`, failureOf(error)),
        )
        onDone()
      }}
    >
      {allPinned ? 'Bỏ ghim' : 'Ghim'}
    </Button>
  )
}
