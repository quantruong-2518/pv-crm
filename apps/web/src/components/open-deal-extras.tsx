import { useState } from 'react'
import { ChevronDown } from '@pv/ui'
import { Icon, Textarea, cn } from '@pv/ui'
import { OPPORTUNITY_DESCRIPTION_MAX } from '@pv/contracts'
import type { OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { FieldErrors } from '@/app/api'
import { toggled } from '@/data/opportunities'
import { AttachmentsDropField, ProductTagsField } from './deal-fields'
import { Field, type SetDraft } from './ops-fields'

/** The extras section — three optional boxes folded into one summary row.
 *
 *  Shut by default because none of them blocks the ticket; a refusal the server
 *  sends for one of them forces the row open, or the red mark would sit behind
 *  a fold. */

const countText = (draft: OpportunityDraft, seed: OpportunityDraft) => {
  const description =
    draft.description.trim() === ''
      ? 'Chưa có mô tả'
      : draft.description === seed.description
        ? 'Mô tả từ lead'
        : 'Có mô tả'
  return `${description} · ${draft.products.length} thẻ sản phẩm · ${draft.attachments.length} tệp`
}

export function ExtrasSection({
  draft,
  seed,
  errors,
  onSet,
}: {
  draft: OpportunityDraft
  seed: OpportunityDraft
  errors: FieldErrors
  onSet: SetDraft
}) {
  const [folded, setFolded] = useState(true)
  const refused = Boolean(errors.products || errors.description || errors.attachments)
  const shown = !folded || refused

  return (
    <section className="flex flex-col gap-4" aria-label="Bổ sung">
      <button
        type="button"
        aria-expanded={shown}
        disabled={refused}
        onClick={() => setFolded(shown)}
        className="bg-surface-ink/9 hover:bg-surface-ink/16 motion-std flex h-12 w-full items-center gap-3 rounded-md px-4 text-left disabled:cursor-not-allowed"
      >
        <span className="text-[14px] font-semibold">Bổ sung</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[12px]">
          {refused ? 'Mở sẵn vì máy chủ từ chối một ô ở đây' : countText(draft, seed)}
        </span>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn('text-muted-foreground motion-std shrink-0', shown && 'rotate-180')}
        />
      </button>

      {shown && (
        <div className="flex flex-col gap-4">
          <ProductTagsField
            picked={draft.products}
            errors={errors.products}
            onToggle={(id) => onSet('products', toggled(draft.products, id))}
          />
          <Field label="Mô tả" errors={errors.description}>
            <Textarea
              rows={4}
              className="resize-none"
              maxLength={OPPORTUNITY_DESCRIPTION_MAX}
              invalid={Boolean(errors.description)}
              value={draft.description}
              aria-label="Mô tả cơ hội"
              placeholder="Việc khách muốn giải — một hai câu là đủ."
              onChange={(e) => onSet('description', e.target.value)}
            />
          </Field>
          <AttachmentsDropField draft={draft} onSet={onSet} errors={errors.attachments} compact />
        </div>
      )}
    </section>
  )
}
