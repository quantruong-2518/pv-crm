import { useState, type ReactNode } from 'react'
import {
  GlassCard,
  Input,
  SegmentedControl,
  Select,
  StatusDot,
  Textarea,
  type StatusDotState,
} from '@pv/ui'
import {
  OPPORTUNITY_DESCRIPTION_MAX,
  OPPORTUNITY_NAME_MAX,
  type OpportunityState,
} from '@pv/contracts'
import { toggled } from '@/data/opportunities'
import { CREATE_STATES } from '@/data/opportunities-write'
import type { DealDraft } from '@/data/deal-draft'
import { Field, LossBlock, STATE_LABEL } from '@/components/ops-fields'
import {
  AmountField,
  AttachmentsDropField,
  PersonPickField,
  ProductTagsField,
} from '@/components/deal-fields'

/** Module 3 · the deal form — ONE card behind all three doors.
 *
 *  `/sales/opportunities/:code` reads and edits it, `/sales/opportunities/new`
 *  types a fresh one, and both get the same boxes in the same order for the
 *  same reason the lead screens share `LeadForm`: a deal typed on one door and
 *  opened on the other must not look like two different pieces of paper.
 *
 *  NO BUTTONS HERE. Save, discard and sign live on the sticky bar, which is
 *  where the screen's primary action belongs; two save buttons are two answers
 *  to "which one actually saves".
 *
 *  Two boxes the form no longer draws — win probability and currency — are
 *  still carried through by `useDealDraft`, untouched. Dropping a box from a
 *  screen is not the same act as clearing its value. */

/** A dot before the status name. Colour answers "is this deal still alive",
 *  the word answers "at which step" — the same split `STATE_TONE` makes. */
const STATE_DOT: Record<OpportunityState, StatusDotState> = {
  'close-won': 'ok',
  'close-lost': 'bad',
  nego: 'current',
  'quote-sent': 'current',
  pending: 'next',
}

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
  const lost = work.state === 'close-lost'

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

        <section className="grid gap-4 sm:grid-cols-3">
          <StateBox draft={draft} />

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

        {lost && <LossBlock draft={work} onSet={set} errors={errors} />}
      </div>
    </fieldset>
  )
}

const MISSING_NOTE = 'Còn thiếu — chưa lưu được phiếu.'

/** The status box, and the one box on this form that writes itself through.
 *
 *  THE DOT RIDES INSIDE THE CONTROL, in front of the value — it is a fact
 *  about the deal, not a decoration on the word naming the box. Beside the
 *  label it read as a speck of dust; `Select`'s `leading` slot is its place.
 *
 *  A locked state prints the value instead of a shut picker: `Select` has no
 *  `disabled` prop, and adding one to the library for one caller would change
 *  its API. The reader reads WHY rather than clicking a grey box. */
function StateBox({ draft }: { draft: DealDraft }) {
  const state = draft.work.state
  const dot = <StatusDot state={STATE_DOT[state]} />

  return (
    <Field label="Trạng thái" required plain errors={draft.errors.state} hint={draft.stateHint}>
      {draft.stateLocked ? (
        <span className="text-foreground flex h-10 items-center gap-2 text-[12.5px] font-semibold">
          {dot}
          {STATE_LABEL.get(state)}
        </span>
      ) : (
        <Select
          label="Trạng thái"
          hideLabel
          leading={dot}
          value={state}
          neutralValue={state}
          onChange={(v) => draft.setState(v as OpportunityState)}
          options={CREATE_STATES.map((s) => ({ value: s.key, label: s.label }))}
          className="w-full"
        />
      )}
    </Field>
  )
}
