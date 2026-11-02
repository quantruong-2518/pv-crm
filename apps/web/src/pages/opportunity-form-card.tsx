import { useMemo } from 'react'
import { Save, TriangleAlert, X } from '@pv/ui'
import { Button, Drawer, Icon, Input, Textarea, cn } from '@pv/ui'
import {
  OPPORTUNITY_DESCRIPTION_MAX,
  OPPORTUNITY_NAME_MAX,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import {
  BD_LANE,
  SALE_LANE,
  laneText,
  refusalOf,
  saleOwnersOf,
  toggled,
} from '@/data/opportunities'
import { noSellerSentence } from '@/data/deal-sale'
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
 *  The value strip's edit button opens the terms — close date, value, win
 *  probability, products — under `acts.editTerms`; the description card's opens
 *  name, description and files, and the floating bar's more menu the BD lane, both
 *  under `acts.editDetails`. The seller is read-only here: past `new` only the
 *  assign act changes it (ADR 0071).
 *
 *  The parent remounts this per opening (`key`), so each drawer starts from the
 *  server's copy and an abandoned edit never rides on the next save. */

const TITLE: Record<DealEditPart, ReturnType<typeof message>> = {
  terms: message('Sửa phiếu cơ hội', 'Edit opportunity details', '영업 기회 정보 수정'),
  details: message(
    'Sửa tên, mô tả và tệp',
    'Edit name, description, and files',
    '이름, 설명 및 파일 수정',
  ),
  owners: message('Sửa người chịu trách nhiệm', 'Edit owners', '담당자 수정'),
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
  const { t } = useI18n()
  /* `useMemo` keeps the seed's reference while `op` is the same cached row. */
  const saved = useMemo(() => draftOf(op), [op])
  const draft = useDealDraft({ saved, op, part })
  /* A re-read may shut the door under an open drawer; its reason blocks the save. */
  const refusal = refusalOf(part === 'terms' ? op.acts.editTerms : op.acts.editDetails)
  const save = () =>
    draft.submit(() => {
      toastDone(t(message(`Đã lưu ${op.code}.`, `${op.code} saved.`, `${op.code} 저장 완료.`)))
      onClose()
    })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(TITLE[part])}
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
        <OwnersFields draft={draft} op={op} />
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
  const { t, number } = useI18n()
  const blocking = Boolean(draft.error) || draft.missing.length > 0 || refusal !== null
  /* The server's refusal outranks every other sentence: it is why nothing saved. */
  const line = draft.error
    ? userMessage(draft.error)
    : (refusal ??
      (draft.missing.length > 0
        ? t(
            message(
              `Còn thiếu ${draft.missing.join(' · ')}`,
              `Missing: ${draft.missing.join(' · ')}`,
              `누락: ${draft.missing.join(' · ')}`,
            ),
          )
        : draft.dirty.length > 0
          ? t(
              message(
                `${number(draft.dirty.length)} ô chưa lưu.`,
                `${number(draft.dirty.length)} unsaved fields.`,
                `저장하지 않은 항목 ${number(draft.dirty.length)}개.`,
              ),
            )
          : t(message('Chưa sửa ô nào.', 'No changes yet.', '변경 사항이 없습니다.'))))

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
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
        <Button size="lg" disabled={!draft.canSubmit || refusal !== null} onClick={onSave}>
          <Icon icon={Save} size={16} />
          {draft.busy
            ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
            : t(message('Lưu', 'Save', '저장'))}
        </Button>
      </div>
    </div>
  )
}

function TermsFields({ draft }: { draft: DealDraft }) {
  const { t } = useI18n()
  const { work, set, errors } = draft

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="grid gap-4 sm:grid-cols-2">
        {/* An empty required box says so here, not only in the footer. */}
        <Field
          label={t(message('Ngày chốt dự kiến', 'Expected close date', '예상 종료일'))}
          required
          errors={
            errors.closedDate ??
            (work.closedDate === ''
              ? [
                  t(
                    message(
                      'Còn thiếu, chưa lưu được phiếu.',
                      'Required before this opportunity can be saved.',
                      '영업 기회를 저장하려면 입력해야 합니다.',
                    ),
                  ),
                ]
              : undefined)
          }
        >
          <Input
            type="date"
            value={work.closedDate}
            aria-label={t(message('Ngày chốt dự kiến', 'Expected close date', '예상 종료일'))}
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
        label={t(message('Khả năng thắng (%)', 'Win probability (%)', '수주 확률(%)'))}
        hint={t(
          message(
            '0–100. Để trống nếu chưa đánh giá.',
            '0–100. Leave blank if not assessed.',
            '0–100. 평가 전이면 비워 두세요.',
          ),
        )}
        errors={errors.probability}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={work.probability ?? ''}
          aria-label={t(message('Khả năng thắng (%)', 'Win probability (%)', '수주 확률(%)'))}
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
  const { t } = useI18n()
  const { work, set, errors } = draft

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Field
        label={t(message('Tên cơ hội', 'Opportunity name', '영업 기회 이름'))}
        required
        errors={errors.name}
      >
        <Input
          value={work.name}
          aria-label={t(message('Tên cơ hội', 'Opportunity name', '영업 기회 이름'))}
          aria-required
          maxLength={OPPORTUNITY_NAME_MAX}
          invalid={Boolean(errors.name)}
          className="pointer-coarse:h-12"
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <Field label={t(message('Mô tả', 'Description', '설명'))} errors={errors.description}>
        <Textarea
          rows={6}
          className="resize-none"
          maxLength={OPPORTUNITY_DESCRIPTION_MAX}
          invalid={Boolean(errors.description)}
          value={work.description}
          aria-label={t(message('Mô tả cơ hội', 'Opportunity description', '영업 기회 설명'))}
          placeholder={t(
            message(
              'Khách cần gì, một hai câu.',
              'What does the customer need? A sentence or two.',
              '고객이 필요로 하는 내용을 한두 문장으로 적어 주세요.',
            ),
          )}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <AttachmentsDropField draft={work} onSet={set} errors={errors.attachments} />
    </div>
  )
}

/** The swap hint only where the more menu offers the swap (`dealMoreChoices`). */
function OwnersFields({ draft, op }: { draft: DealDraft; op: OpportunityProfileResponse }) {
  const { t } = useI18n()
  const { work, set, errors } = draft
  const sellers = saleOwnersOf(op)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PersonPickField
        label={BD_LANE.label}
        hint={t(
          message(
            'Người mở được khách sẽ được ghi nhận.',
            'Credit goes to the person who opened the account.',
            '고객을 발굴한 담당자에게 실적이 반영됩니다.',
          ),
        )}
        picked={work.bdOwners}
        errors={errors.bdOwners}
        onToggle={(id) => set('bdOwners', toggled(work.bdOwners, id))}
      />
      <Field
        plain
        label={SALE_LANE.label}
        hint={
          sellers.length === 0
            ? noSellerSentence(op.state === 'won', op.acts.assign.ok)
            : op.state === 'open' && op.acts.assign.ok
              ? op.pendingSign
                ? t(
                    message(
                      'Đang chờ duyệt ký: không thể thêm hoặc bớt Sale. Đổi Sale chính trong menu Khác.',
                      'Signature approval is pending, so salespeople cannot be added or removed. Change the primary salesperson from More.',
                      '서명 승인을 기다리는 중에는 영업 담당자를 추가하거나 제거할 수 없습니다. 더보기 메뉴에서 주 담당자를 변경하세요.',
                    ),
                  )
                : t(
                    message(
                      'Đổi Sale trong mục Đổi Sale của menu Khác.',
                      'Change the salesperson from More → Change salesperson.',
                      '더보기 → 영업 담당자 변경에서 담당자를 바꾸세요.',
                    ),
                  )
              : undefined
        }
      >
        <p className="text-foreground m-0 text-[13px] leading-[1.5]">
          {sellers.length > 0
            ? laneText(sellers)
            : t(message('Chưa có', 'Not assigned', '지정되지 않음'))}
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
