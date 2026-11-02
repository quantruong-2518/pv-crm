import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, Drawer, Input, Textarea } from '@pv/ui'
import { HOLD_NOTE_MAX, type Hold, type HoldSubjectType } from '@pv/contracts'
import { useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { localSlot } from '@/lib/date'
import { usePatchHold, useSetHold } from '@/data/holds'
import { HOLD_COPY, holdChangedToast, holdSetToast } from '@/data/hold-copy'
import { StepFooter } from '@/components/step-footer'

/** The date input's `min` — a hint only: the door judges "later than today"
 *  by its own clock. `localSlot` is the app's one reader of `Date.now()`. */
const tomorrow = () => localSlot(MINUTES_PER_DAY).slice(0, 10)
const MINUTES_PER_DAY = 24 * 60

/** A hold on a lead or a deal (ADR 0097 §3): the meet-again date and a note.
 *  With no open `hold` it opens one; with one it is the change-date dialog
 *  and patches the date and note in place. The door's 409 (no holder,
 *  sign request waiting, date not in the future) prints in the footer and the
 *  drawer stays open. */
export function HoldDialog({
  subjectType,
  code,
  caption,
  hold,
  open,
  onClose,
}: {
  subjectType: HoldSubjectType
  code: string
  /** The subtitle's subject — code and company, as the caller words it. */
  caption: ReactNode
  /** The open hold; `null` opens a new one. */
  hold: Hold | null
  open: boolean
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const [until, setUntil] = useState('')
  const [note, setNote] = useState('')
  const set = useSetHold(subjectType, code)
  const patch = usePatchHold(subjectType, code)
  const door = hold ? patch : set
  const { reset: resetSet } = set
  const { reset: resetPatch } = patch

  const seedUntil = hold?.until ?? ''
  const seedNote = hold?.note ?? ''
  useEffect(() => {
    if (!open) return
    setUntil(seedUntil)
    setNote(seedNote)
    resetSet()
    resetPatch()
  }, [open, seedUntil, seedNote, resetSet, resetPatch])

  const trimmed = note.trim()
  const changed = !hold || until !== hold.until || trimmed !== (hold.note ?? '')
  const ready = until !== '' && changed
  const finish = (text: string) => {
    toastDone(text)
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(hold ? HOLD_COPY.changeDay : HOLD_COPY.title)}
      subtitle={
        <>
          {caption}
          {t(HOLD_COPY.reminderTail)}
        </>
      }
      footer={
        <StepFooter
          error={door.error}
          pending={door.isPending}
          hint={until === '' ? t(HOLD_COPY.pickDay) : ''}
          onClose={onClose}
          confirm={{
            icon: CalendarClock,
            label: t(hold ? HOLD_COPY.saveDay : HOLD_COPY.title),
            disabled: !ready,
            onClick: () =>
              hold
                ? patch.mutate(
                    /* Only what changed: an overdue date sent back unchanged would be refused. */
                    {
                      ...(until !== hold.until ? { until } : {}),
                      ...(trimmed !== (hold.note ?? '') ? { note: trimmed || null } : {}),
                    },
                    { onSuccess: () => finish(holdChangedToast(code, lang)) },
                  )
                : set.mutate(
                    { until, ...(trimmed === '' ? {} : { note: trimmed }) },
                    { onSuccess: () => finish(holdSetToast(code, lang)) },
                  ),
          }}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {t(HOLD_COPY.resumeDay)}
            <span className="text-destructive-foreground" aria-hidden="true">
              {' '}
              *
            </span>
          </span>
          <Input
            type="date"
            value={until}
            min={tomorrow()}
            aria-required
            className="h-12"
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">{t(HOLD_COPY.note)}</span>
          <Textarea
            autoGrow
            rows={3}
            value={note}
            maxLength={HOLD_NOTE_MAX}
            placeholder={t(HOLD_COPY.notePlaceholder)}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
    </Drawer>
  )
}
