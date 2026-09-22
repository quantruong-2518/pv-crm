import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, X } from '@pv/ui'
import { Button, Drawer, Icon, Input, Select, Textarea, cn } from '@pv/ui'
import {
  CURRENCIES,
  draftOpportunity,
  type CurrencyCode,
  type OpportunityDraft,
} from '@pv/engines/fixtures/das-vina'
import {
  OPPORTUNITY_DESCRIPTION_MAX,
  OPPORTUNITY_NAME_MAX,
  type LeadProfile,
  type OpportunityCreateResponse,
} from '@pv/contracts'
import { userMessage, type ApiError, type FieldErrors } from '@/app/api'
import { useDirectory } from '@/data/directory'
import { profileForm } from '@/data/lead-profile'
import { missingOf, toggled } from '@/data/opportunities'
import { createBodyOf, draftErrorsOf, usePromoteLead } from '@/data/opportunities-write'
import { AmountField, AttachmentsDropField, PersonPickField, ProductTagsField } from './deal-fields'
import { Field } from './ops-fields'

/** Turn a lead into a deal — a panel over the profile it reads from.
 *
 *  A panel and not a screen because the person filling this in is HALF WAY
 *  through the profile behind it: nine boxes out of ten come from what they
 *  just read. `Drawer` (T-04) is already a real dialog, so a second overlay
 *  language would buy nothing.
 *
 *  SAME BOXES AS THE DEAL FORM, in the same order (`deal-fields.tsx` ·
 *  `pages/opportunity-form-card.tsx`): a deal typed here and opened there must
 *  not read as two different pieces of paper. What this panel keeps of its own
 *  is the currency picker — the only door where a currency is chosen.
 *
 *  Takes the PROFILE ON THE WIRE, not a book row: `profileForm` is the one
 *  translation, shared with `LeadForm`. Through `useMemo` so the seeded draft
 *  keeps its reference and the effect below never lands on top of typing. */

type Props = {
  profile: LeadProfile
  open: boolean
  onClose: () => void
  /** The row the server just wrote. Optional because the two screens that open
   *  this form want two different endings: the lead profile stays where it is,
   *  while the opportunity book jumps to the deal — the only place that can
   *  show the CODE this form deliberately refuses to promise. */
  onCreated?: (row: OpportunityCreateResponse) => void
}

export function ConvertDialog({ profile, open, onClose, onCreated }: Props) {
  const staff = useDirectory()
  const form = useMemo(() => profileForm(profile), [profile])
  /* Seeded WITHOUT a list of codes already handed out: the sequence lives in
     `sales.opportunity_code_seq`, only the server reads it, so there is
     nothing here to avoid colliding with. */
  const seed = useMemo(() => draftOpportunity(form, staff), [form, staff])
  const [draft, setDraft] = useState<OpportunityDraft>(seed)
  const [errors, setErrors] = useState<FieldErrors>({})

  const promote = usePromoteLead()
  const { reset } = promote

  /* Opening is a fresh start: re-seed, and drop the previous refusal with it.
     Kept, the panel would open already red about a submission that belonged to
     another lead. */
  useEffect(() => {
    if (!open) return
    setDraft(seed)
    setErrors({})
    reset()
  }, [open, seed, reset])

  /* Typing into a box the server just refused clears that refusal — a red mark
     surviving the fix reads as "still wrong", and people stop believing the
     other red marks. Same rule as `set` in `pages/lead-parts.tsx`. */
  const set = <K extends keyof OpportunityDraft>(key: K, value: OpportunityDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _fixed, ...rest } = current
      return rest
    })
  }

  const missing = missingOf(draft)

  const submit = () =>
    promote.mutate(createBodyOf(profile.code, draft), {
      /* Close ONLY once the server has accepted. Closing first and sending
         after is the surest way for a refused ticket to vanish without a trace
         while the user believes it went through. */
      onSuccess: (row) => {
        onCreated?.(row)
        onClose()
      },
      onError: (error) => setErrors(draftErrorsOf(error.errors)),
    })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Đổi lead thành cơ hội"
      subtitle={
        <>
          <span className="font-mono">{profile.code}</span> · {profile.company}
        </>
      }
      footer={
        <ConvertBar
          missing={missing}
          pending={promote.isPending}
          error={promote.error}
          onClose={onClose}
          onSubmit={submit}
        />
      }
    >
      <ConvertFields draft={draft} onSet={set} errors={errors} />
    </Drawer>
  )
}

/** The bottom bar — one sentence, and it only ever carries what STANDS IN THE
 *  WAY. The refusal wins over the pending line: someone who just pressed the
 *  button and was turned down needs the reason, not a progress report. */
function ConvertBar({
  missing,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  missing: string[]
  pending: boolean
  error: ApiError | null
  onClose: () => void
  onSubmit: () => void
}) {
  const ready = missing.length === 0 && !pending

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span
        className={cn(
          'text-[11.5px] leading-[1.5]',
          ready ? 'text-muted-foreground' : 'text-warning',
        )}
        aria-live="polite"
      >
        {error
          ? userMessage(error)
          : pending
            ? 'Đang gửi phiếu…'
            : ready
              ? ''
              : `Còn thiếu ${missing.join(' · ')}.`}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="md" variant="ghost" onClick={onClose}>
          <Icon icon={X} size={16} />
          Huỷ
        </Button>
        <Button size="md" disabled={!ready} onClick={onSubmit}>
          <Icon icon={ArrowRight} size={16} />
          {pending ? 'Đang đổi…' : 'Đổi thành cơ hội'}
        </Button>
      </div>
    </div>
  )
}

/** The boxes, in the order the deal form card asks them.
 *
 *  THREE BOXES LEFT THE PANEL on 17/09: the code, the account and the win
 *  probability. The first two printed what the header already says, and none
 *  of the three took an answer a person filling this in could give. */
function ConvertFields({
  draft,
  onSet,
  errors,
}: {
  draft: OpportunityDraft
  onSet: <K extends keyof OpportunityDraft>(key: K, value: OpportunityDraft[K]) => void
  errors: FieldErrors
}) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Field label="Tên cơ hội" required errors={errors.name}>
        <Input
          value={draft.name}
          aria-label="Tên cơ hội"
          aria-required
          maxLength={OPPORTUNITY_NAME_MAX}
          invalid={Boolean(errors.name)}
          onChange={(e) => onSet('name', e.target.value)}
        />
      </Field>

      {/* Three boxes on ONE line: none needs the panel's full width, and the
          amount belongs beside the currency it is counted in. The status select
          that stood here left with ADR 0064 — the column follows recorded facts. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Field label="Ngày chốt dự kiến" required errors={errors.closedDate}>
          <Input
            type="date"
            value={draft.closedDate}
            aria-label="Ngày chốt dự kiến"
            aria-required
            invalid={Boolean(errors.closedDate)}
            onChange={(e) => onSet('closedDate', e.target.value)}
          />
        </Field>

        <AmountField draft={draft} onSet={onSet} errors={errors.amount} />

        <Field label="Đồng tiền" plain errors={errors.currency}>
          <Select
            label="Đồng tiền"
            hideLabel
            value={draft.currency}
            neutralValue={draft.currency}
            onChange={(v) => onSet('currency', v as CurrencyCode)}
            options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
            className="w-full"
          />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <PersonPickField
          label="Sale đứng đơn"
          required
          hint="Người chốt — nhận phần trăm hoa hồng chốt."
          picked={draft.saleOwners}
          errors={errors.saleOwners}
          onToggle={(id) => onSet('saleOwners', toggled(draft.saleOwners, id))}
        />

        <PersonPickField
          label="BD mở cửa"
          hint="Người mở được khách — nhận công trạng mở cửa."
          picked={draft.bdOwners}
          errors={errors.bdOwners}
          onToggle={(id) => onSet('bdOwners', toggled(draft.bdOwners, id))}
        />
      </section>

      <ProductTagsField
        picked={draft.products}
        errors={errors.products}
        onToggle={(id) => onSet('products', toggled(draft.products, id))}
      />

      {/* Both cells carry `grow`, so the textarea and the drop zone STRETCH to
          end on the same line. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Mô tả" grow errors={errors.description}>
          <Textarea
            rows={5}
            className="h-full resize-none"
            maxLength={OPPORTUNITY_DESCRIPTION_MAX}
            invalid={Boolean(errors.description)}
            value={draft.description}
            aria-label="Mô tả cơ hội"
            placeholder="Việc khách muốn giải — một hai câu là đủ."
            onChange={(e) => onSet('description', e.target.value)}
          />
        </Field>

        <AttachmentsDropField draft={draft} onSet={onSet} errors={errors.attachments} />
      </section>
    </div>
  )
}
