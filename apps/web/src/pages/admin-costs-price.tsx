import { useId, useState } from 'react'
import { Button, Drawer, Icon, Input, Save, TriangleAlert, X, cn } from '@pv/ui'
import { AiPriceSet } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { Field } from '@/components/ops-fields'
import { priceOf, useSetAiPrice } from '@/data/ai-costs'

/** The set-a-price drawer of One Core · Admin · AI cost. One form for a new
 *  model, a new date and a correction: the server upserts on model + day.
 *  The page remounts it per opening (`key`), so a dropped edit never carries
 *  over to the next one. */

export type PriceSeed = { model: string; input: string; output: string; from: string }

type FieldKey = keyof AiPriceSet

const FIELD_OF: Record<string, FieldKey> = {
  model: 'model',
  inputUsdPerMTok: 'inputUsdPerMTok',
  outputUsdPerMTok: 'outputUsdPerMTok',
  effectiveFrom: 'effectiveFrom',
}

type Errors = Partial<Record<FieldKey, string[]>>

function errorsOf(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {}
  for (const issue of issues) {
    const key = FIELD_OF[String(issue.path[0])]
    if (key) out[key] = [...(out[key] ?? []), issue.message]
  }
  return out
}

const BOX = 'tnum pointer-coarse:h-12'

const TEXT = {
  inputPriceUSDPer1M: message(
    'Giá token đầu vào (USD/1 triệu token)',
    'Input price (USD per 1M tokens)',
    '입력 가격 (토큰 100만 개당 USD)',
  ),
  outputPriceUSDPer1M: message(
    'Giá token đầu ra (USD/1 triệu token)',
    'Output price (USD per 1M tokens)',
    '출력 가격 (토큰 100만 개당 USD)',
  ),
  aNewPriceReplacesThe: message(
    'Nếu đã có giá cùng ngày, giá mới sẽ thay thế giá cũ.',
    'A new price replaces the existing price for the same date.',
    '같은 날짜의 가격이 이미 있으면 새 가격으로 대체됩니다.',
  ),
}

export function PriceDrawer({
  open,
  seed,
  models,
  onClose,
}: {
  open: boolean
  seed: PriceSeed
  /** Model ids the screen has seen, offered while typing. */
  models: string[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const listId = useId()
  const [form, setForm] = useState(seed)
  const [errors, setErrors] = useState<Errors>({})
  const save = useSetAiPrice()
  const set = (key: keyof PriceSeed, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const submit = () => {
    const check = AiPriceSet.safeParse({
      model: form.model,
      inputUsdPerMTok: priceOf(form.input),
      outputUsdPerMTok: priceOf(form.output),
      effectiveFrom: form.from,
    })
    if (!check.success) return setErrors(errorsOf(check.error.issues))
    setErrors({})
    save.mutate(check.data, {
      onSuccess: (row) => {
        toastDone(
          t(
            message(
              `Đã lưu giá cho ${row.model}`,
              `Price saved for ${row.model}`,
              `${row.model} 가격 저장 완료`,
            ),
          ),
        )
        onClose()
      },
    })
  }

  const shown = (key: FieldKey) => errors[key] ?? save.error?.errors?.[key]
  /* A refusal no box prints (a key outside the four) still says something. */
  const onABox = Object.keys(FIELD_OF).some((key) => save.error?.errors?.[key]?.length)
  const failure = save.error && !onABox ? userMessage(save.error) : null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(message('Đặt giá', 'Set model price', '모델 가격 설정'))}
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
        <Field label={t(message('Mô hình', 'Model', '모델'))} required errors={shown('model')}>
          <Input
            value={form.model}
            list={listId}
            aria-label={t(message('Mô hình', 'Model', '모델'))}
            aria-required
            autoComplete="off"
            spellCheck={false}
            invalid={Boolean(shown('model'))}
            className="pointer-coarse:h-12 font-mono"
            onChange={(e) => set('model', e.target.value)}
          />
        </Field>
        <datalist id={listId}>
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label={t(TEXT.inputPriceUSDPer1M)} required errors={shown('inputUsdPerMTok')}>
            <Input
              inputMode="decimal"
              value={form.input}
              aria-label={t(TEXT.inputPriceUSDPer1M)}
              aria-required
              invalid={Boolean(shown('inputUsdPerMTok'))}
              className={BOX}
              onChange={(e) => set('input', e.target.value)}
            />
          </Field>
          <Field label={t(TEXT.outputPriceUSDPer1M)} required errors={shown('outputUsdPerMTok')}>
            <Input
              inputMode="decimal"
              value={form.output}
              aria-label={t(TEXT.outputPriceUSDPer1M)}
              aria-required
              invalid={Boolean(shown('outputUsdPerMTok'))}
              className={BOX}
              onChange={(e) => set('output', e.target.value)}
            />
          </Field>
        </section>

        <Field
          label={t(message('Có hiệu lực từ ngày', 'Effective date', '적용 시작일'))}
          required
          hint={t(TEXT.aNewPriceReplacesThe)}
          errors={shown('effectiveFrom')}
        >
          <Input
            type="date"
            value={form.from}
            aria-label={t(message('Có hiệu lực từ ngày', 'Effective date', '적용 시작일'))}
            aria-required
            invalid={Boolean(shown('effectiveFrom'))}
            className={cn(BOX, 'sm:max-w-48')}
            onChange={(e) => set('from', e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  )
}
