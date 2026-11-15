import { Button, Icon, Input, X, cn } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'

/** The start-date field on the account panel (ADR 0156). Empty means fully ramped on
 *  edit, and the creation day on create, so the hint says which one applies. */

export function StartedOnField({
  value,
  creating,
  errors,
  onChange,
}: {
  /** `YYYY-MM-DD`, or `''` for none. */
  value: string
  creating: boolean
  errors: string[] | undefined
  onChange: (day: string) => void
}) {
  const { t } = useI18n()
  const label = t(message('Ngày vào làm', 'Start date', '입사일'))
  const wrong = Boolean(errors?.length)
  const empty = creating
    ? t(
        message(
          'Để trống thì lấy ngày tạo tài khoản.',
          'Leave empty to use the day the account is created.',
          '비워 두면 계정을 만든 날짜가 입사일이 됩니다.',
        ),
      )
    : t(
        message(
          'Để trống nếu người này đã làm từ trước.',
          'Leave empty if this person started earlier.',
          '이전부터 일한 사람이면 비워 두세요.',
        ),
      )

  const hint = wrong ? errors?.join(' ') : value === '' ? empty : ''

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2">
        <span
          className={cn(
            'text-[11px]',
            wrong ? 'text-destructive-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        <span className="flex items-center gap-2">
          <Input
            type="date"
            value={value}
            invalid={wrong}
            className="pointer-coarse:h-12"
            onChange={(event) => onChange(event.target.value)}
          />
          {value !== '' && (
            <Button
              size="md"
              variant="ghost"
              type="button"
              className="pointer-coarse:h-12 shrink-0"
              onClick={() => onChange('')}
            >
              <Icon icon={X} size={16} />
              {t(message('Bỏ trống', 'Clear', '비우기'))}
            </Button>
          )}
        </span>
      </label>
      {hint !== '' && (
        <span
          className={cn(
            'text-[11.5px] leading-[1.5]',
            wrong ? 'text-destructive-foreground' : 'text-muted-foreground',
          )}
        >
          {hint}
        </span>
      )}
    </div>
  )
}
