import { useState } from 'react'
import { ChevronDown } from '@pv/ui'
import { Icon, Textarea, cn } from '@pv/ui'
import { OPPORTUNITY_DESCRIPTION_MAX } from '@pv/contracts'
import type { OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { FieldErrors } from '@/app/api'
import { message, useI18n, type Message } from '@/app/i18n'
import { toggled } from '@/data/opportunities'
import { AttachmentsDropField, ProductTagsField } from './deal-fields'
import { Field, type SetDraft } from './ops-fields'

/** The extras section — three optional boxes folded into one summary row.
 *
 *  Shut by default because none of them blocks the ticket; a refusal the server
 *  sends for one of them forces the row open, or the red mark would sit behind
 *  a fold. */

const countText = (
  t: (copy: Message) => string,
  draft: OpportunityDraft,
  seed: OpportunityDraft,
) => {
  const description =
    draft.description.trim() === ''
      ? t(message('Chưa có mô tả', 'No description', '설명 없음'))
      : draft.description === seed.description
        ? t(message('Mô tả từ lead', 'Description from lead', '리드의 설명'))
        : t(message('Có mô tả', 'Has description', '설명 있음'))
  const [products, files] = [draft.products.length, draft.attachments.length]
  const counts = t(
    message(
      `${products} thẻ sản phẩm · ${files} tệp`,
      `${products} product tags · ${files} files`,
      `제품 태그 ${products}개 · 파일 ${files}개`,
    ),
  )
  return `${description} · ${counts}`
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
  const { t } = useI18n()
  const [folded, setFolded] = useState(true)
  const refused = Boolean(errors.products || errors.description || errors.attachments)
  const shown = !folded || refused

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={t(message('Bổ sung', 'Additional details', '추가 정보'))}
    >
      <button
        type="button"
        aria-expanded={shown}
        disabled={refused}
        onClick={() => setFolded(shown)}
        className="bg-surface-ink/9 hover:bg-surface-ink/16 motion-std flex h-12 w-full items-center gap-3 rounded-md px-4 text-left disabled:cursor-not-allowed"
      >
        <span className="text-[14px] font-semibold">
          {t(message('Bổ sung', 'Additional details', '추가 정보'))}
        </span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[12px]">
          {refused
            ? t(message('Có ô cần sửa', 'Some fields need fixing', '수정할 항목이 있습니다'))
            : countText(t, draft, seed)}
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
          <Field label={t(message('Mô tả', 'Description', '설명'))} errors={errors.description}>
            <Textarea
              rows={4}
              className="resize-none"
              maxLength={OPPORTUNITY_DESCRIPTION_MAX}
              invalid={Boolean(errors.description)}
              value={draft.description}
              aria-label={t(message('Mô tả cơ hội', 'Opportunity description', '기회 설명'))}
              placeholder={t(
                message(
                  'Khách cần gì, viết một hai câu.',
                  'What does the customer need? One or two sentences.',
                  '고객에게 필요한 것을 한두 문장으로 적어 주세요.',
                ),
              )}
              onChange={(e) => onSet('description', e.target.value)}
            />
          </Field>
          <AttachmentsDropField draft={draft} onSet={onSet} errors={errors.attachments} compact />
        </div>
      )}
    </section>
  )
}
