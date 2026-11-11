import { useState } from 'react'
import { Button, Drawer, Icon, Input, Save, TriangleAlert, X, cn } from '@pv/ui'
import { FxRatePutBody, vnDayOf } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { Field } from '@/components/ops-fields'
import { dmy } from '@/lib/date'
import { FX_RATE_LABEL, rateOf, useSetFxRate } from '@/data/fx-rate-admin'

/** The set-a-rate drawer of One Core · Admin · Rates. One form for a day that
 *  already has a rate and for a day that has none: the server upserts on
 *  currency + day, and a hand-typed rate beats the bank's. The page remounts
 *  it per opening (`key`), so a dropped edit never carries to the next one. */

export type RateSeed = {
  day: string
  rate: string
  /** A listed day is fixed; a new one is picked. */
  fixedDay: boolean
}

export function RateDrawer({
  open,
  seed,
  onClose,
}: {
  open: boolean
  seed: RateSeed
  onClose: () => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState(seed)
  const [errors, setErrors] = useState<string[]>([])
  const save = useSetFxRate()
  const rateLabel = t(FX_RATE_LABEL)
  const dayLabel = t(message('Ngày', 'Day', '날짜'))

  const submit = () => {
    const check = FxRatePutBody.safeParse({ rate: rateOf(form.rate) })
    if (!check.success) return setErrors(check.error.issues.map((i) => i.message))
    setErrors([])
    save.mutate(
      { day: form.day, ...check.data },
      {
        onSuccess: (row) => {
          toastDone(
            t(
              message(
                `Đã lưu tỷ giá ngày ${dmy(row.day)}`,
                `Rate saved for ${dmy(row.day)}`,
                `${dmy(row.day)} 환율을 저장했습니다`,
              ),
            ),
          )
          onClose()
        },
      },
    )
  }

  const shown = errors.length ? errors : save.error?.errors?.rate
  const failure = save.error && !save.error.errors?.rate?.length ? userMessage(save.error) : null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(message('Đặt tỷ giá', 'Set rate', '환율 설정'))}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            aria-live="polite"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 text-[11.5px] leading-[1.5]',
              failure ? 'text-destructive-foreground' : 'text-muted-foreground',
            )}
          >
            {failure && <Icon icon={TriangleAlert} size={16} className="shrink-0" />}
            {failure}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="lg" variant="ghost" disabled={save.isPending} onClick={onClose}>
              <Icon icon={X} size={16} />
              {t(message('Huỷ', 'Cancel', '취소'))}
            </Button>
            <Button size="lg" disabled={save.isPending} onClick={submit}>
              <Icon icon={Save} size={16} />
              {save.isPending
                ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
                : t(message('Lưu', 'Save', '저장'))}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-5">
        <Field label={dayLabel} required plain={seed.fixedDay}>
          {seed.fixedDay ? (
            <span className="tnum flex h-11 items-center text-[13px]">{dmy(form.day)}</span>
          ) : (
            <Input
              type="date"
              value={form.day}
              max={vnDayOf(new Date())}
              aria-label={dayLabel}
              aria-required
              className="pointer-coarse:h-12 sm:max-w-48"
              onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
            />
          )}
        </Field>
        <Field
          label={rateLabel}
          required
          hint={t(
            message(
              'Thay tỷ giá đang có của ngày này.',
              'Replaces the rate this day already has.',
              '이 날짜의 기존 환율을 바꿉니다.',
            ),
          )}
          errors={shown}
        >
          <Input
            inputMode="decimal"
            value={form.rate}
            aria-label={rateLabel}
            aria-required
            invalid={Boolean(shown?.length)}
            className="tnum pointer-coarse:h-12 sm:max-w-48"
            onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
          />
        </Field>
      </div>
    </Drawer>
  )
}
