import { useState, type ReactNode } from 'react'
import { CalendarClock, ChevronDown, RefreshCw, Send } from '@pv/ui'
import { Button, Icon, Input, cn } from '@pv/ui'
import { localSlot } from '@/lib/date'
import { message, useI18n } from '@/app/i18n'
import { sendLabel, type LetterForm } from './letter-model'

/** The composer's strip: one sentence, Cancel, and a split Send whose menu
 *  picks between sending now and at an hour (G-Compose). Scheduling is a menu
 *  choice rather than a field in the letter card because it is about the
 *  send, not the letter. */
export function LetterFooter({
  status,
  warn,
  failed,
  form,
  setTiming,
  sendDisabled,
  sending,
  aids,
  onRetryCheck,
  onCancel,
  onSend,
}: {
  status: string
  warn: boolean
  /** A failed send or check — drawn in danger red, unlike a blocker. */
  failed: boolean
  form: LetterForm
  setTiming: (timing: LetterForm['timing'], at: string) => void
  sendDisabled: boolean
  sending: boolean
  /** Floats above the strip's right edge — the hints and `?` stack. */
  aids?: ReactNode
  /** Set only when the automatic check failed: the list did not change, so
   *  nothing else would ask again. */
  onRetryCheck?: () => void
  onCancel: () => void
  onSend: () => void
}) {
  const { t, lang } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const later = form.timing === 'later'
  const pick = (timing: LetterForm['timing']) => {
    setTiming(timing, timing === 'later' && form.at === '' ? localSlot(60) : form.at)
    setMenuOpen(false)
  }

  return (
    <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-4">
      {aids && <div className="absolute bottom-full right-0 mb-8">{aids}</div>}
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <span
          aria-live="polite"
          className={cn(
            'min-w-0 max-w-[460px] text-[12px] leading-5',
            failed
              ? 'text-destructive-foreground'
              : warn
                ? 'text-warning'
                : 'text-muted-foreground',
          )}
        >
          {status}
        </span>
        {later && (
          <label className="text-muted-foreground flex items-center gap-2 text-[12px]">
            {t(message('Giờ gửi', 'Send time', '발송 시각'))}
            <Input
              type="datetime-local"
              className="h-12 w-[220px]"
              value={form.at}
              onChange={(e) => setTiming('later', e.target.value)}
            />
          </label>
        )}
      </div>

      <div className="relative flex shrink-0 gap-2">
        {onRetryCheck && (
          <Button size="lg" variant="ghost" onClick={onRetryCheck}>
            <Icon icon={RefreshCw} size={16} />
            {t(message('Kiểm tra lại', 'Check again', '다시 확인'))}
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={onCancel}>
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
        <div className="flex gap-1">
          <Button size="lg" className="rounded-r-none" disabled={sendDisabled} onClick={onSend}>
            <Icon icon={later ? CalendarClock : Send} size={16} />
            {sending
              ? t(message('Đang tạo thư…', 'Creating letter…', '메일 생성 중…'))
              : sendLabel(form, lang)}
          </Button>
          <Button
            size="lg"
            className="w-12 rounded-l-none px-0"
            aria-label={t(message('Chọn thời điểm gửi', 'Choose when to send', '발송 시점 선택'))}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon icon={ChevronDown} size={16} />
          </Button>
        </div>
        {menuOpen && (
          <div
            role="menu"
            className="glass-overlay absolute bottom-full right-0 mb-2 flex min-w-[220px] flex-col rounded-lg p-1"
          >
            <MenuItem onClick={() => pick('now')}>
              {t(message('Gửi ngay', 'Send now', '즉시 발송'))}
            </MenuItem>
            <MenuItem onClick={() => pick('later')}>
              {t(message('Hẹn giờ gửi…', 'Schedule send…', '예약 발송…'))}
            </MenuItem>
          </div>
        )}
      </div>
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="motion-std hover:bg-surface-ink/9 flex h-12 items-center rounded-md px-4 text-left text-[14px] font-medium"
    >
      {children}
    </button>
  )
}
