import { useState, type ReactNode } from 'react'
import { GlassCard, Input, SegmentedControl, Textarea } from '@pv/ui'
import { OPPORTUNITY_DESCRIPTION_MAX, OPPORTUNITY_NAME_MAX } from '@pv/contracts'
import { toggled } from '@/data/opportunities'
import type { DealDraft } from '@/data/deal-draft'
import { Field } from '@/components/ops-fields'
import {
  AmountField,
  AttachmentsDropField,
  PersonPickField,
  ProductTagsField,
} from '@/components/deal-fields'

/** Module 3 · the deal form — ONE card behind both doors.
 *
 *  `/sales/opportunities/:code` reads and edits it, `/sales/opportunities/new`
 *  types a fresh one, and both get the same boxes in the same order for the
 *  same reason the lead screens share `LeadForm`: a deal typed on one door and
 *  opened on the other must not look like two different pieces of paper.
 *
 *  NO BUTTONS HERE. Save, discard and sign live on the sticky bar; two save
 *  buttons are two answers to "which one actually saves". Win probability and
 *  currency are carried through by `useDealDraft` untouched — dropping a box is
 *  not the same act as clearing its value.
 *
 *  NO STATUS BOX AND NO LOSS BLOCK since ADR 0064. A seller picks neither state
 *  nor column: where the deal stands is READ-ONLY on the sticky bar and moved by
 *  the three doors beside it (`opportunity-parts.tsx`). */

export function DealFormCard({
  draft,
  history,
}: {
  draft: DealDraft
  /** The history tab. Absent on the create door — a deal that does not exist
   *  yet has no timeline, and a tab promising one it cannot fill is worse than
   *  no tab at all. */
  history?: { count: number; node: ReactNode }
}) {
  const [tab, setTab] = useState<'info' | 'history'>('info')
  const open = history ? tab : 'info'

  return (
    <GlassCard
      variant="b"
      className="flex min-w-0 flex-col gap-5 p-4 sm:p-5 lg:p-6"
      aria-label="Phiếu cơ hội"
    >
      {history && (
        <SegmentedControl
          label="Phần phiếu"
          hideLabel
          tone="quiet"
          value={open}
          options={[
            { value: 'info', label: 'Thông tin' },
            { value: 'history', label: 'Lịch sử', count: history.count },
          ]}
          onChange={(next) => setTab(next as 'info' | 'history')}
        />
      )}

      {open === 'history' && history ? history.node : <InfoTab draft={draft} />}
    </GlassCard>
  )
}

function InfoTab({ draft }: { draft: DealDraft }) {
  const { work, set, errors } = draft

  /* A reader without `opportunity.edit` gets every box shut BEFORE typing,
     not a lit Save button that ends in a 403. */
  return (
    <fieldset disabled={!draft.canEdit} className="contents">
      <div className="flex min-w-0 flex-col gap-5">
        <Field label="Tên cơ hội" required errors={errors.name}>
          <Input
            value={work.name}
            aria-label="Tên cơ hội"
            aria-required
            maxLength={OPPORTUNITY_NAME_MAX}
            invalid={Boolean(errors.name)}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>

        <section className="grid gap-4 sm:grid-cols-2">
          {/* A REQUIRED BOX LEFT EMPTY SAYS SO HERE, not only on the sticky bar.
            The bar names what blocks the save; without this, the reader has to
            carry that sentence back up the form to find the box it means. */}
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
              onChange={(e) => set('closedDate', e.target.value)}
            />
          </Field>

          <AmountField draft={work} onSet={set} errors={errors.amount} lockNote={draft.moneyHint} />
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {/* A native disabled fieldset shuts every control inside it — the sale
            owners of a signed deal move the contract, so the server asks for
            `opportunity.close` there and the box locks before anyone types. */}
          <fieldset disabled={draft.moneyLocked} className="contents">
            <PersonPickField
              label="Sale đứng đơn"
              required
              hint={draft.moneyHint ?? 'Người chốt — nhận phần trăm hoa hồng chốt.'}
              picked={work.saleOwners}
              errors={errors.saleOwners}
              onToggle={(id) => set('saleOwners', toggled(work.saleOwners, id))}
            />
          </fieldset>

          <PersonPickField
            label="BD mở cửa"
            hint="Người mở được khách — nhận công trạng mở cửa."
            picked={work.bdOwners}
            errors={errors.bdOwners}
            onToggle={(id) => set('bdOwners', toggled(work.bdOwners, id))}
          />
        </section>

        <ProductTagsField
          picked={work.products}
          errors={errors.products}
          onToggle={(id) => set('products', toggled(work.products, id))}
        />

        {/* No `items-start`: the two cells STRETCH, so the textarea and the drop
          zone end on the same line. Both boxes carry `grow` to take the height
          the row hands them. */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Mô tả" grow errors={errors.description}>
            {/* `resize-none` over `autoGrow`: a box that sizes itself fights the
              row that just sized it, and the drag handle is not in the design. */}
            <Textarea
              rows={5}
              className="h-full resize-none"
              maxLength={OPPORTUNITY_DESCRIPTION_MAX}
              invalid={Boolean(errors.description)}
              value={work.description}
              aria-label="Mô tả cơ hội"
              placeholder="Việc khách muốn giải — một hai câu là đủ."
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>

          <AttachmentsDropField draft={work} onSet={set} errors={errors.attachments} />
        </section>
      </div>
    </fieldset>
  )
}

const MISSING_NOTE = 'Còn thiếu — chưa lưu được phiếu.'
