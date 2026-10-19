import { useId, useState } from 'react'
import { Button, Drawer, Icon, Input, Save, TriangleAlert, X, cn } from '@pv/ui'
import { AiPriceSet } from '@pv/contracts'
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
        toastDone(`Đã lưu giá cho ${row.model}`)
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
      title="Đặt giá"
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
              Huỷ
            </Button>
            <Button size="lg" disabled={save.isPending} onClick={submit}>
              <Icon icon={Save} size={16} />
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-5">
        <Field label="Mô hình" required errors={shown('model')}>
          <Input
            value={form.model}
            list={listId}
            aria-label="Mô hình"
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
          <Field
            label="Giá token vào (USD cho 1 triệu token)"
            required
            errors={shown('inputUsdPerMTok')}
          >
            <Input
              inputMode="decimal"
              value={form.input}
              aria-label="Giá token vào (USD cho 1 triệu token)"
              aria-required
              invalid={Boolean(shown('inputUsdPerMTok'))}
              className={BOX}
              onChange={(e) => set('input', e.target.value)}
            />
          </Field>
          <Field
            label="Giá token ra (USD cho 1 triệu token)"
            required
            errors={shown('outputUsdPerMTok')}
          >
            <Input
              inputMode="decimal"
              value={form.output}
              aria-label="Giá token ra (USD cho 1 triệu token)"
              aria-required
              invalid={Boolean(shown('outputUsdPerMTok'))}
              className={BOX}
              onChange={(e) => set('output', e.target.value)}
            />
          </Field>
        </section>

        <Field
          label="Áp dụng từ ngày"
          required
          hint="Trùng ngày đã có thì giá mới thay giá cũ."
          errors={shown('effectiveFrom')}
        >
          <Input
            type="date"
            value={form.from}
            aria-label="Áp dụng từ ngày"
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
