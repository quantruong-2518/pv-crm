import { useRef, useState, type ReactNode } from 'react'
import { Paperclip, Plus, Trash2, Upload, X } from '@pv/ui'
import { Button, Icon, Input, Select, billions, cn } from '@pv/ui'
import { isSellerRole, OPPORTUNITY_FILES_MAX } from '@pv/contracts'
import { CURRENCIES, type CurrencyCode, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import { message, useI18n } from '@/app/i18n'
import type { SetDraft } from '@/data/deal-draft'
import { fxLineText, useTodayFx, vndAt } from '@/data/fx-rate'
import { useSalesPeople } from '@/data/directory'
import { useProductCatalog } from '@/data/sales-config'
import { PersonTokenField } from '@/components/person-token-field'
import { Field } from '@/components/ops-fields'

/** Module 3 · the boxes of the DEAL FORM.
 *
 *  Drawn by both doors onto the same piece of paper — the form card
 *  (`pages/opportunity-form-card.tsx`) and the convert panel
 *  (`components/convert-dialog.tsx`). They answer one layout: tags and a
 *  searchable picker instead of walls of toggles, so the eye lands on what
 *  was CHOSEN rather than on everything that was not. `ops-fields.tsx` keeps
 *  the frame (`Field`) and the loss block.
 *
 *  Nothing here is in `@pv/ui`: every one of them calls an app query, and the
 *  library may not know a branch (package boundary · CLAUDE.md). */

/** How far the money box may grow — the same safe-integer ceiling the wire
 *  already holds, moved to the keystroke that would cross it. */
const AMOUNT_MAX = Number.MAX_SAFE_INTEGER

/** The deal's amount — ONE box, with a suffix naming its own currency.
 *
 *  Only the opening drawer passes `onCurrency`, because that is the one door
 *  where a currency is chosen: the picker is then JOINED to the box instead of
 *  standing as a field of its own. Everywhere else the suffix carries the
 *  answer, and it reads `CURRENCIES` rather than printing "VND": a box that
 *  says VND over a dollar figure is the most expensive lie this screen could
 *  tell. */
export function AmountField({
  draft,
  onSet,
  errors,
  lockNote,
  tag,
  onCurrency,
}: {
  draft: OpportunityDraft
  onSet: SetDraft
  errors?: string[]
  /** A small mark beside the label — where the seeded figure came from. */
  tag?: ReactNode
  onCurrency?: (code: CurrencyCode) => void
  /** Why the box is shut, when it is. A locked box with no reason beside it is
   *  a dead end — money moves the contract once a deal is signed. */
  lockNote?: string | null
}) {
  const { t, number, lang } = useI18n()
  const amount = draft.amount
  const currency = draft.currency
  const fx = useTodayFx(currency)
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

  return (
    <Field
      label={
        <>
          {t(message('Giá trị đơn', 'Deal value', '딜 금액'))}
          {tag}
        </>
      }
      required
      plain={Boolean(onCurrency)}
      errors={errors}
      hint={
        lockNote ??
        (amount === null || amount === 0
          ? undefined
          : currency === 'VND'
            ? billions(amount)
            : fx === null
              ? undefined
              : fxLineText(vndAt(amount, fx), fx, lang))
      }
    >
      {/* `suffix` of `Input` (A-04) rather than a shell built here: the focus
          and invalid rings then come from the same place as every other box on
          this form, instead of a copy that drifts on the next edit. */}
      <div className="flex min-w-0 items-stretch">
        <Input
          inputMode="numeric"
          aria-label={t(message('Giá trị đơn', 'Deal value', '딜 금액'))}
          aria-required
          disabled={Boolean(lockNote)}
          invalid={Boolean(errors?.length)}
          suffix={onCurrency ? undefined : `${symbol} ${currency}`}
          className={cn(
            'tnum text-right font-mono',
            onCurrency && 'pointer-coarse:h-12 rounded-r-none',
          )}
          value={amount === null ? '' : number(amount)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '')
            if (digits === '') {
              onSet('amount', null)
              return
            }
            /* REFUSE the keystroke rather than cut the number down to size: a
               box that silently drops the tail turns one amount into another,
               plausible-looking one. */
            const next = Number(digits)
            if (next > AMOUNT_MAX) return
            onSet('amount', next)
          }}
        />
        {onCurrency && (
          <Select
            label={t(message('Đồng tiền', 'Currency', '통화'))}
            hideLabel
            value={currency}
            neutralValue={currency}
            valueContent={`${symbol} ${currency}`}
            onChange={(v) => onCurrency(v as CurrencyCode)}
            options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
            className="pointer-coarse:[&>button]:h-12 w-32 shrink-0 [&>button]:rounded-l-none"
          />
        )}
      </div>
    </Field>
  )
}

/** The two owner boxes — a picker with the chosen people INSIDE it.
 *
 *  Still multi-select, and that is not a detail to trade away for a tidier
 *  box: `saleOwners` is an array because commission splits between everyone on
 *  it, so a single-select control would silently drop the second name off any
 *  deal two people carried. With one person it reads exactly like a select.
 *
 *  `sellersOnly` is the SALE lane: only `isSellerRole` people are SUGGESTED,
 *  while a token already there stays drawn whoever it is (ADR 0071 §4). */
export function PersonPickField({
  label,
  hint,
  required,
  sellersOnly = false,
  picked,
  errors,
  onToggle,
}: {
  label: string
  hint: string
  required?: boolean
  sellersOnly?: boolean
  picked: string[]
  errors?: string[]
  onToggle: (id: string) => void
}) {
  const { t } = useI18n()
  const people = useSalesPeople()

  return (
    <Field label={label} required={required} hint={hint} errors={errors} plain>
      <PersonTokenField
        variant="inline"
        label={label}
        placeholder={t(message('Gõ tên để tìm…', 'Type a name to search…', '이름을 입력해 검색…'))}
        tokens={picked.map((id) => {
          const person = people.find((a) => a.id === id)
          /* An id with nobody behind it prints as itself: the person may have
             been locked out since, and the deal still carries their name. */
          return { id, name: person?.name ?? id, ...(person && { note: person.role }) }
        })}
        suggestions={people
          .filter((a) => !picked.includes(a.id) && (!sellersOnly || isSellerRole(a.roleIds)))
          .map((a) => ({ id: a.id, name: a.name, note: a.role }))}
        onPick={onToggle}
        onRemove={onToggle}
        emptyNote={
          sellersOnly
            ? t(
                message(
                  'Không còn Sale nào để thêm.',
                  'No more salespeople to add.',
                  '추가할 영업 담당자가 없습니다.',
                ),
              )
            : t(
                message(
                  'Cả phòng đã có trong danh sách này.',
                  'The whole team is already on this list.',
                  '팀 전체가 이 목록에 있습니다.',
                ),
              )
        }
      />
    </Field>
  )
}

/** The product lines this customer asked about — chosen ones as removable
 *  tags, the catalog behind one button.
 *
 *  Laying the whole catalog out as toggles buries the two or three answers in
 *  a wall of buttons nobody picked — and the question on both doors is "what
 *  did we pick". An entry switched OFF still shows while this deal holds it —
 *  hiding the tag would be editing history. */
export function ProductTagsField({
  picked,
  errors,
  onToggle,
}: {
  picked: string[]
  errors?: string[]
  onToggle: (id: string) => void
}) {
  const { t } = useI18n()
  const products = useProductCatalog()
  const shown = products.filter((p) => p.active || picked.includes(p.id))
  const free = shown.filter((p) => !picked.includes(p.id))
  const [browsing, setBrowsing] = useState(false)

  /* NO "0 / 0" AND NO PROMISE OF A CATALOG THAT IS NOT THERE. An empty list
     is a trip to the Settings screen, not a fraction — and the older wording
     pointed below itself, where only the button stood. */
  const hint =
    shown.length === 0
      ? t(
          message(
            'Danh mục Sản phẩm/dịch vụ chưa có mục nào. Nhập ở Thiết lập.',
            'The product/service catalog is empty. Add items in Settings.',
            '제품/서비스 목록이 비어 있습니다. 설정에서 추가하세요.',
          ),
        )
      : t(
          message(
            `Đã chọn ${picked.length} / ${shown.length} thẻ.`,
            `Selected ${picked.length} of ${shown.length} tags.`,
            `태그 ${shown.length}개 중 ${picked.length}개 선택됨.`,
          ),
        )

  return (
    <Field
      label={t(
        message(
          'Sản phẩm / dịch vụ quan tâm',
          'Products / services of interest',
          '관심 제품 / 서비스',
        ),
      )}
      plain
      errors={errors}
      hint={hint}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {picked.map((id) => {
            const name = shown.find((p) => p.id === id)?.name ?? id
            return (
              <span
                key={id}
                className="text-on-tint-primary bg-primary/24 flex items-center gap-2 rounded-sm py-1 pl-3 pr-1 text-[12px] font-medium"
              >
                {name}
                <button
                  type="button"
                  aria-label={t(
                    message(`Bỏ thẻ ${name}`, `Remove tag ${name}`, `태그 ${name} 제거`),
                  )}
                  onClick={() => onToggle(id)}
                  className="motion-std hover:bg-surface-ink/16 pointer-coarse:size-12 flex size-6 shrink-0 items-center justify-center rounded-sm"
                >
                  <Icon icon={X} size={14} />
                </button>
              </span>
            )
          })}
          {/* Shut when there is nothing to open — the hint above already says
              where the catalog is filled in. */}
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={browsing}
            disabled={shown.length === 0}
            className="pointer-coarse:h-12"
            onClick={() => setBrowsing((open) => !open)}
          >
            <Icon icon={Plus} size={16} />
            {t(message('Thêm thẻ', 'Add tag', '태그 추가'))}
          </Button>
        </div>

        {browsing &&
          (free.length === 0 ? (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              {t(
                message(
                  'Đã chọn hết danh mục.',
                  'The whole catalog is selected.',
                  '목록의 모든 항목을 선택했습니다.',
                ),
              )}
            </p>
          ) : (
            <div
              role="group"
              aria-label={t(
                message('Danh mục sản phẩm/dịch vụ', 'Product/service catalog', '제품/서비스 목록'),
              )}
              className="bg-surface-ink/5 flex flex-wrap gap-2 rounded-md p-3"
            >
              {free.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={
                    p.active
                      ? undefined
                      : t(
                          message(
                            'Mục đã tắt, đơn này vẫn đang chọn.',
                            'This item is turned off; the deal still has it selected.',
                            '꺼진 항목이지만 이 딜에는 아직 선택되어 있습니다.',
                          ),
                        )
                  }
                  onClick={() => onToggle(p.id)}
                  className={cn(
                    'motion-std bg-surface-ink/9 hover:bg-surface-ink/16 pointer-coarse:h-12 flex h-10 items-center rounded-md px-3 text-[12px]',
                    p.active ? '' : 'opacity-60',
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ))}
      </div>
    </Field>
  )
}

/** Attachments — a COMPACT drop zone, name and size only.
 *
 *  `FileDrop` of `@pv/ui` takes exactly one file and draws a 64px glyph, so it
 *  cannot stand in a two-column row beside a five-line textarea; this one takes
 *  many, and keeps the POC promise: name and size only, nothing uploaded.
 *
 *  THE BUTTON IS A REAL BUTTON. A zone that only answers drag-and-drop is dead
 *  ground to a keyboard and to an iPad, so the pointer gesture is the extra
 *  road, never the only one. */
export function AttachmentsDropField({
  draft,
  onSet,
  errors,
  compact = false,
}: {
  draft: OpportunityDraft
  onSet: SetDraft
  errors?: string[]
  /** One line, no stretching: for a form that does not set it beside a
   *  textarea whose bottom edge it has to meet. */
  compact?: boolean
}) {
  const { t, number } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const room = OPPORTUNITY_FILES_MAX - draft.attachments.length

  /* `slice(0, room)` because one trip through a `multiple` picker — or one
     drop — can hand back thirty files at once. Taking what fits keeps the
     batch instead of refusing all of it. */
  const take = (files: FileList | null) => {
    const picked = [...(files ?? [])]
      .slice(0, Math.max(0, room))
      .map((f) => ({ name: f.name, size: f.size }))
    if (picked.length > 0) onSet('attachments', [...draft.attachments, ...picked])
  }

  return (
    <Field
      label={t(message('Tệp đính kèm', 'Attachments', '첨부 파일'))}
      plain
      grow={!compact}
      errors={errors}
    >
      <div className={cn('flex min-h-0 min-w-0 flex-col gap-2', !compact && 'flex-1')}>
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files)
          }}
          className={cn(
            /* `flex-1` so the zone takes the height the row hands it and its
               bottom edge lines up with the description box beside it. */
            'motion-std flex min-h-0 w-full min-w-0 items-center gap-3 rounded-md',
            compact ? 'px-3 py-2' : 'flex-1 p-4',
            /* Not a tinted ground on drag: the two lines on it are muted text,
               and azure under them drops below the 4.5:1 floor of law 13. */
            over ? 'bg-surface-ink/16' : 'bg-surface-ink/5',
          )}
        >
          <Icon icon={Upload} size={20} className="text-muted-foreground shrink-0" />
          <span
            className={cn(
              'flex min-w-0 flex-1',
              compact ? 'items-baseline gap-2' : 'flex-col gap-1',
            )}
          >
            <span className="shrink-0 text-[12.5px] font-semibold">
              {t(message('Kéo tệp vào đây', 'Drag files here', '파일을 여기로 끌어다 놓으세요'))}
            </span>
            <span className="text-muted-foreground truncate text-[11px] leading-[1.5]">
              {draft.attachments.length === 0
                ? t(
                    message(
                      `Chưa có tệp nào · tối đa ${OPPORTUNITY_FILES_MAX} tệp`,
                      `No files yet · up to ${OPPORTUNITY_FILES_MAX} files`,
                      `파일 없음 · 최대 ${OPPORTUNITY_FILES_MAX}개`,
                    ),
                  )
                : t(
                    message(
                      `${draft.attachments.length} tệp · tối đa ${OPPORTUNITY_FILES_MAX} tệp`,
                      `${draft.attachments.length} ${draft.attachments.length === 1 ? 'file' : 'files'} · up to ${OPPORTUNITY_FILES_MAX} files`,
                      `파일 ${draft.attachments.length}개 · 최대 ${OPPORTUNITY_FILES_MAX}개`,
                    ),
                  )}
            </span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={room <= 0}
            className="pointer-coarse:h-12 shrink-0"
            onClick={() => fileRef.current?.click()}
          >
            <Icon icon={Paperclip} size={16} />
            {t(message('Chọn tệp', 'Choose files', '파일 선택'))}
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          aria-label={t(message('Chọn tệp đính kèm', 'Choose attachments', '첨부 파일 선택'))}
          onChange={(e) => {
            take(e.target.files)
            e.target.value = ''
          }}
        />

        {draft.attachments.length > 0 && (
          <ul className="flex flex-col gap-2">
            {draft.attachments.map((f) => (
              <li
                key={f.name}
                className="bg-surface-ink/5 flex items-center gap-3 rounded-md px-3 py-2"
              >
                <Icon icon={Paperclip} size={16} className="text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[12px]">{f.name}</span>
                <span className="text-muted-foreground tnum font-mono text-[11px]">
                  {number(Math.max(1, Math.round(f.size / 1024)))} KB
                </span>
                <button
                  type="button"
                  aria-label={t(
                    message(`Bỏ tệp ${f.name}`, `Remove file ${f.name}`, `파일 ${f.name} 제거`),
                  )}
                  onClick={() =>
                    onSet(
                      'attachments',
                      draft.attachments.filter((x) => x.name !== f.name),
                    )
                  }
                  className="motion-std text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 flex size-8 shrink-0 items-center justify-center rounded-md"
                >
                  <Icon icon={Trash2} size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  )
}
