import { useMemo } from 'react'
import { Save, TriangleAlert, X } from '@pv/ui'
import { Button, Drawer, Icon, Input, Textarea, cn } from '@pv/ui'
import {
  OPPORTUNITY_DESCRIPTION_MAX,
  OPPORTUNITY_NAME_MAX,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { namesOf, refusalOf, saleOwnersOf, toggled } from '@/data/opportunities'
import { draftOf } from '@/data/opportunities-write'
import { useDealDraft, type DealDraft, type DealEditPart } from '@/data/deal-draft'
import { Field } from '@/components/ops-fields'
import {
  AmountField,
  AttachmentsDropField,
  PersonPickField,
  ProductTagsField,
} from '@/components/deal-fields'

/** Module 3 · the deal form, behind three drawers of the profile (ADR 0077 §5–6).
 *
 *  The value strip's edit button opens the terms — name, close date, value, win
 *  probability, products — under `acts.editTerms`; the description card's opens
 *  description and files, the owners card's the BD lane, both under
 *  `acts.editDetails`. The seller is read-only here: past `new` only the assign
 *  act changes it (ADR 0071). The always-open form and its save bar are gone.
 *
 *  The parent remounts this per opening (`key`), so each drawer starts from the
 *  server's copy and an abandoned edit never rides on the next save. */

const TITLE: Record<DealEditPart, string> = {
  terms: 'Sửa phiếu cơ hội',
  details: 'Sửa mô tả và tệp',
  owners: 'Sửa người chịu trách nhiệm',
}

export function DealEditDrawer({
  op,
  part,
  open,
  onClose,
}: {
  op: OpportunityProfileResponse
  part: DealEditPart
  open: boolean
  onClose: () => void
}) {
  /* `useMemo` keeps the seed's reference while `op` is the same cached row. */
  const saved = useMemo(() => draftOf(op), [op])
  const draft = useDealDraft({ saved, op, part })
  /* A re-read may shut the door under an open drawer; its reason blocks the save. */
  const refusal = refusalOf(part === 'terms' ? op.acts.editTerms : op.acts.editDetails)
  const save = () =>
    draft.submit(() => {
      toastDone(`Đã lưu ${op.code}.`)
      onClose()
    })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={TITLE[part]}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}
        </>
      }
      footer={<EditFooter draft={draft} refusal={refusal} onCancel={onClose} onSave={save} />}
    >
      {part === 'terms' ? (
        <TermsFields draft={draft} />
      ) : part === 'owners' ? (
        <OwnersFields draft={draft} sellers={namesOf(saleOwnersOf(op))} />
      ) : (
        <DetailsFields draft={draft} />
      )}
    </Drawer>
  )
}

function EditFooter({
  draft,
  refusal,
  onCancel,
  onSave,
}: {
  draft: DealDraft
  refusal: string | null
  onCancel: () => void
  onSave: () => void
}) {
  const blocking = Boolean(draft.error) || draft.missing.length > 0 || refusal !== null
  /* The server's refusal outranks every other sentence: it is why nothing saved. */
  const line = draft.error
    ? userMessage(draft.error)
    : (refusal ??
      (draft.missing.length > 0
        ? `Còn thiếu ${draft.missing.join(' · ')}`
        : draft.dirty.length > 0
          ? `${draft.dirty.length} ô chưa lưu.`
          : 'Chưa sửa ô nào.'))

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 text-[11.5px] leading-[1.5]',
          blocking ? 'text-destructive-foreground' : 'text-muted-foreground',
        )}
        aria-live="polite"
      >
        {blocking && <Icon icon={TriangleAlert} size={16} className="shrink-0" />}
        {line}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" disabled={draft.busy} onClick={onCancel}>
          <Icon icon={X} size={16} />
          Huỷ
        </Button>
        <Button size="lg" disabled={!draft.canSubmit || refusal !== null} onClick={onSave}>
          <Icon icon={Save} size={16} />
          {draft.busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </div>
  )
}

function TermsFields({ draft }: { draft: DealDraft }) {
  const { work, set, errors } = draft

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Field label="Tên cơ hội" required errors={errors.name}>
        <Input
          value={work.name}
          aria-label="Tên cơ hội"
          aria-required
          maxLength={OPPORTUNITY_NAME_MAX}
          invalid={Boolean(errors.name)}
          className="pointer-coarse:h-12"
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <section className="grid gap-4 sm:grid-cols-2">
        {/* An empty required box says so here, not only in the footer. */}
        <Field
          label="Ngày chốt dự kiến"
          required
          errors={errors.closedDate ?? (work.closedDate === '' ? [MISSING_NOTE] : undefined)}
        >
          <Input
            type="date"
            value={work.closedDate}
            aria-label="Ngày chốt dự kiến"
            aria-required
            invalid={Boolean(errors.closedDate) || work.closedDate === ''}
            className="pointer-coarse:h-12"
            onChange={(e) => set('closedDate', e.target.value)}
          />
        </Field>

        <AmountField draft={work} onSet={set} errors={errors.amount} />
      </section>

      {/* Empty stays `null`: "nobody judged it" is not 0% (contract's `probability`). */}
      <Field
        label="Khả năng thắng (%)"
        hint="0–100. Để trống nếu chưa đánh giá."
        errors={errors.probability}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={work.probability ?? ''}
          aria-label="Khả năng thắng (%)"
          invalid={Boolean(errors.probability)}
          className="tnum pointer-coarse:h-12 sm:max-w-40"
          onChange={(e) => set('probability', percentOf(e.target.value, work.probability))}
        />
      </Field>

      <ProductTagsField
        picked={work.products}
        errors={errors.products}
        onToggle={(id) => set('products', toggled(work.products, id))}
      />
    </div>
  )
}

function DetailsFields({ draft }: { draft: DealDraft }) {
  const { work, set, errors } = draft

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Field label="Mô tả" errors={errors.description}>
        <Textarea
          rows={6}
          className="resize-none"
          maxLength={OPPORTUNITY_DESCRIPTION_MAX}
          invalid={Boolean(errors.description)}
          value={work.description}
          aria-label="Mô tả cơ hội"
          placeholder="Việc khách muốn giải — một hai câu là đủ."
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <AttachmentsDropField draft={work} onSet={set} errors={errors.attachments} />
    </div>
  )
}

function OwnersFields({ draft, sellers }: { draft: DealDraft; sellers: string[] }) {
  const { work, set, errors } = draft

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PersonPickField
        label="BD mở cửa"
        hint="Người mở được khách — nhận công trạng mở cửa."
        picked={work.bdOwners}
        errors={errors.bdOwners}
        onToggle={(id) => set('bdOwners', toggled(work.bdOwners, id))}
      />
      <Field plain label="Sale đứng đơn" hint="Đổi Sale qua nút Giao Sale trên thanh thao tác.">
        <p className="text-foreground m-0 text-[13px] leading-[1.5]">
          {sellers.length > 0 ? sellers.join(', ') : 'Chưa có'}
        </p>
      </Field>
    </div>
  )
}

/** Whole numbers 0–100; a keystroke past the range keeps the last value. */
function percentOf(typed: string, last: number | null): number | null {
  if (typed.trim() === '') return null
  const n = Number(typed)
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : last
}

const MISSING_NOTE = 'Còn thiếu — chưa lưu được phiếu.'
