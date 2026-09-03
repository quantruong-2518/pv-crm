import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, X } from '@pv/ui'
import { Badge, Button, Chip, Drawer, Icon, Input, Select, Textarea, cn } from '@pv/ui'
import {
  draftOpportunity,
  OPPORTUNITY_STATES,
  type OpportunityDraft,
  type OpportunityState,
} from '@pv/engines/fixtures/das-vina'
import {
  OPPORTUNITY_DESCRIPTION_MAX,
  OPPORTUNITY_NAME_MAX,
  type LeadProfile,
  type OpportunityCreateResponse,
} from '@pv/contracts'
import { userMessage, type FieldErrors } from '@/app/api'
import { useApproverName, useDirectory } from '@/data/directory'
import { profileForm } from '@/data/lead-profile'
import { missingOf, toggled } from '@/data/opportunities'
import {
  createBodyOf,
  CREATE_STATES,
  draftErrorsOf,
  usePromoteLead,
} from '@/data/opportunities-write'
import { dmy } from '@/lib/date'
import {
  AmountRow,
  AttachmentsField,
  Field,
  LossBlock,
  PeopleRow,
  ProbabilityField,
  ProductsField,
  STAGE_LABEL,
  STATE_LABEL,
} from './ops-fields'

/** Đổi lead thành cơ hội — phiếu điền, mở đè lên hồ sơ.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ PANEL ĐÈ CHỨ KHÔNG PHẢI MỘT MÀN
 *  ------------------------------------------------------------------
 *  Người điền phiếu này đang ĐỌC DỞ hồ sơ: họ vừa xem khách đau ở đâu, ai ký
 *  cuối, khoảng tiền bao nhiêu — và chín trên mười ô của phiếu lấy đúng từ đó.
 *  Chuyển sang một màn riêng là cắt mất phần tra cứu ngay lúc cần nó nhất.
 *  Panel giữ hồ sơ nguyên chỗ phía sau, đóng lại là đọc tiếp.
 *
 *  `Drawer` (T-04) đã là hộp thoại thật — `role="dialog"`, `aria-modal`, tấm
 *  che, Escape, bẫy tiêu điểm. Dựng thêm một Modal căn giữa chỉ để có hình khác
 *  là đẻ ra ngôn ngữ đè màn thứ hai trong cùng một app.
 *
 *  ------------------------------------------------------------------
 *  PHIẾU MỞ RA LÀ ĐÃ GẦN ĐỦ — VÀ MỒI TỪ HỒ SƠ THẬT
 *  ------------------------------------------------------------------
 *  `draftOpportunity` mồi sẵn mã, tên, tiền, người bán, mô tả. Người dùng SỬA
 *  một bản nháp chứ không GÕ một tờ giấy trắng. Ba ô hệ không đoán được — ngày
 *  đóng, trạng thái, tệp đính kèm — là ba ô duy nhất thật sự phải nghĩ.
 *
 *  Phiếu nhận HỒ SƠ TRÊN DÂY, không nhận dòng sổ. Bản cũ nhận `Lead` và
 *  `draftOpportunity` tự sinh hồ sơ từ mã lead — với một mã ngoài dải đóng
 *  băng, hàm sinh đó tra nguồn `SR-…` trong `SOURCES` của fixture và NÉM, làm
 *  vỡ cả màn hồ sơ chứ không riêng phiếu này (dialog nằm trong cây kể cả khi
 *  chưa mở). `profileForm` là đường dịch duy nhất, dùng chung với `ProfileCard`
 *  — cùng một hồ sơ thì thẻ đọc và phiếu điền không được đọc ra hai bản.
 *
 *  Đi qua `useMemo` cũng là để GIỮ NGUYÊN thứ đang gõ dở: `profile` từ
 *  react-query giữ nguyên tham chiếu giữa các lần vẽ lại, nên bản nháp mồi
 *  không đổi, nên `useEffect` bên dưới không nạp đè lên ô người dùng vừa gõ.
 *
 *  ------------------------------------------------------------------
 *  Ô NHẬP DÙNG CHUNG VỚI MÀN HỒ SƠ CƠ HỘI — sửa 23/08
 *  ------------------------------------------------------------------
 *  Bốn khối ô (`Field` · `AmountRow` · `PeopleRow` · `LossBlock`) đã chuyển sang
 *  `components/ops-fields.tsx`, và bản kiểm "còn thiếu gì" (`missingOf`) sang
 *  `data/opportunities.ts` — cả hai dùng chung với `pages/opportunity-detail.tsx`. Cùng một phiếu
 *  điền ở hai chỗ thì phải là một bộ ô và một bản kiểm, không phải hai bản
 *  chép — lý do đầy đủ ở docblock của hai file đó.
 *
 *  ------------------------------------------------------------------
 *  CLOSE LOST MỞ RA MỘT KHỐI KHÁC
 *  ------------------------------------------------------------------
 *  Chọn "Close lost" là mở khối lý do thua, và khối đó CHẶN nút gửi cho tới khi
 *  có lý do. Một đơn thua không ghi lý do là một bài học mất trắng — sổ vẫn trừ
 *  đúng số tiền, nhưng không ai học được gì từ nó. */

type Props = {
  profile: LeadProfile
  open: boolean
  onClose: () => void
  /** The row the server just wrote. Optional because the two screens that open
   *  this form want two different endings: the lead profile stays where it is
   *  (its bottom-bar button flips to the new deal by itself), while the
   *  opportunity book jumps to the deal — the only place that can show the CODE
   *  this form deliberately refuses to promise. */
  onCreated?: (row: OpportunityCreateResponse) => void
}

export function ConvertDialog({ profile, open, onClose, onCreated }: Props) {
  const staff = useDirectory()
  const approver = useApproverName()
  const form = useMemo(() => profileForm(profile), [profile])
  /* Gọi KHÔNG kèm danh sách mã đã cấp — tham số thứ ba của `draftOpportunity`
     mặc định rỗng. Danh sách đó từng đọc `desk.deals` để phiếu thứ hai không
     lấy lại mã của phiếu thứ nhất; nay dãy mã nằm ở `sales.opportunity_code_seq`
     và chỉ máy chủ cấp, nên `draft.code` không còn được bày ra ở đâu và không
     có gì để tránh trùng. Chữ ký của hàm thì giữ nguyên — nó là của
     `@pv/engines`, và sổ cơ hội đóng băng vẫn dùng tham số đó. */
  const seed = useMemo(() => draftOpportunity(form, staff), [form, staff])
  const [draft, setDraft] = useState<OpportunityDraft>(seed)
  const [errors, setErrors] = useState<FieldErrors>({})

  const promote = usePromoteLead()
  const { reset } = promote

  /* Mở phiếu là một lần bắt đầu mới: nạp lại bản nháp. Không nạp lại thì đóng
     rồi mở lại vẫn thấy thứ mình vừa gõ dở của lần trước — hoặc tệ hơn, của
     một lead khác.

     Câu từ chối của lần trước đi cùng bản nháp, và cả `promote.reset()` nữa:
     giữ lại thì phiếu mới mở ra đã đỏ sẵn mấy ô, nói về một lượt gửi của một
     lead khác. */
  useEffect(() => {
    if (!open) return
    setDraft(seed)
    setErrors({})
    reset()
  }, [open, seed, reset])

  /* Typing into a box the server just complained about clears that complaint.
     A red mark that survives the fix reads as "still wrong", and the user
     stops believing any of the other red marks. Same rule the lead form runs
     on — see `set` in `components/lead-create-dialog.tsx`. */
  const set = <K extends keyof OpportunityDraft>(key: K, value: OpportunityDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _fixed, ...rest } = current
      return rest
    })
  }

  const lost = draft.state === 'close-lost'
  const stage = OPPORTUNITY_STATES.find((s) => s.key === draft.state)?.stage ?? null

  const missing = missingOf(draft)
  const ready = missing.length === 0 && !promote.isPending

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Đổi lead thành cơ hội"
      subtitle={
        <>
          <span className="font-mono">{profile.code}</span> · {profile.company} — phiếu này tạo một
          dòng mới trong sổ cơ hội và nối nó vào đúng lead đang mở.
        </>
      }
      meta={<Badge tone={lost ? 'danger' : 'running'}>{STATE_LABEL.get(draft.state)}</Badge>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'text-[11.5px] leading-[1.5]',
              ready ? 'text-muted-foreground' : 'text-warning',
            )}
            aria-live="polite"
          >
            {/* Ba câu, và câu lỗi thắng hai câu kia: người vừa bấm mà bị từ
                chối cần biết vì sao TRƯỚC khi biết chuyện gì lẽ ra đã xảy ra.
                `userMessage` dịch Problem của máy chủ; ô nào sai thì chính nó
                gọi tên ô đó. */}
            {promote.error
              ? userMessage(promote.error)
              : promote.isPending
                ? 'Đang gửi phiếu…'
                : ready
                  ? `Đổi xong, ${profile.company} rời sổ lead và đứng ở sổ cơ hội. Mã do máy chủ cấp lúc lưu. ${approver} gật thì đơn vào cột thật.`
                  : `Chưa đổi được — còn thiếu ${missing.join(' · ')}.`}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="md" variant="ghost" onClick={onClose}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button
              size="md"
              disabled={!ready}
              onClick={() => {
                promote.mutate(createBodyOf(profile.code, draft), {
                  /* Đóng phiếu CHỈ khi máy chủ đã nhận. Đóng trước rồi mới gửi
                     là cách chắc chắn nhất để một phiếu bị từ chối biến mất
                     không dấu vết, và người dùng tin là đã xong.

                     Không ghi gì vào `app/desk.ts` nữa (29/08). Bản cũ gọi
                     `convert()` để hồ sơ lead nhớ "đã đổi rồi"; câu đó nay hỏi
                     máy chủ, và `usePromoteLead` đã vô hiệu hoá sổ cơ hội —
                     `opportunitiesOfLeadQuery` nối dài khoá của sổ nên nó chạy lại theo,
                     và nút dưới thanh đáy tự lật sang "Cơ hội OP-…". */
                  onSuccess: (row) => {
                    onCreated?.(row)
                    onClose()
                  },
                  /* The server has the last word, and when it refuses it names
                     the box; `draftErrorsOf` turns its spelling into the
                     form's. An EMPTY map is not "no complaint" — it is a
                     complaint about no one field, and the duplicate-deal 409
                     is the common case. The footer sentence carries those. */
                  onError: (error) => setErrors(draftErrorsOf(error.errors)),
                })
              }}
            >
              <Icon icon={ArrowRight} size={16} />
              {promote.isPending ? 'Đang đổi…' : 'Đổi thành cơ hội'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 sm:grid-cols-2">
          {/* KHÔNG in mã ở đây nữa — 28/08.
              Ô này từng bày `draft.code`, một mã do trình duyệt tự đoán bằng
              cách đếm trên sổ nó đang thấy. Bấm thử mới lộ ra hậu quả: phiếu
              hiện "OP-0305", máy chủ cấp "OP-5001", và người vừa bấm đi tìm một
              mã không tồn tại. Dãy mã nằm ở `sales.opportunity_code_seq` và chỉ
              máy chủ đọc được nó — trình duyệt không có cách nào biết trước.
              Hứa một con số mình không cấp được thì thà đừng hứa. */}
          <Field label="Mã cơ hội" hint="Máy chủ cấp lúc lưu, theo dãy mã của sổ.">
            <span className="text-muted-foreground flex h-10 items-center text-[12.5px]">
              cấp khi lưu
            </span>
          </Field>

          <Field
            label="Account"
            hint="Đi thẳng từ lead — một cơ hội không đổi được sang khách khác."
          >
            <span className="flex h-10 flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold">{draft.account}</span>
              {draft.accountCode !== '' && <Chip variant="source">{draft.accountCode}</Chip>}
            </span>
          </Field>

          <Field label="Tên cơ hội" required errors={errors.name} className="sm:col-span-2">
            <Input
              value={draft.name}
              aria-label="Tên cơ hội"
              aria-required
              maxLength={OPPORTUNITY_NAME_MAX}
              invalid={Boolean(errors.name)}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field
            label="Ngày đóng dự kiến"
            required
            errors={errors.closedDate}
            hint={draft.closedDate !== '' ? `Đọc là ${dmy(draft.closedDate)}.` : undefined}
          >
            <Input
              type="date"
              value={draft.closedDate}
              aria-label="Ngày đóng dự kiến"
              aria-required
              invalid={Boolean(errors.closedDate)}
              onChange={(e) => set('closedDate', e.target.value)}
            />
          </Field>

          <Field
            label="Trạng thái"
            plain
            errors={errors.state}
            hint={
              stage
                ? `Vào cột "${STAGE_LABEL.get(stage)}" của sổ cơ hội.`
                : 'Đóng sổ ngay — đơn ra khỏi năm cột, không nằm cột nào. Chốt THẮNG không đặt ở đây: đơn thắng là đơn có hợp đồng, ký ở hồ sơ cơ hội.'
            }
          >
            <Select
              label="Trạng thái"
              hideLabel
              value={draft.state}
              neutralValue={draft.state}
              onChange={(v) => set('state', v as OpportunityState)}
              options={CREATE_STATES.map((s) => ({ value: s.key, label: s.label }))}
              className="w-full"
            />
          </Field>
        </section>

        <AmountRow draft={draft} onSet={set} errors={errors} />

        <PeopleRow
          label="Sale đứng đơn"
          required
          hint="Người chốt. Phần chốt của hoa hồng chia theo danh sách này, nên đừng để trống cho xong."
          picked={draft.saleOwners}
          errors={errors.saleOwners}
          onToggle={(id) => set('saleOwners', toggled(draft.saleOwners, id))}
        />

        <PeopleRow
          label="BD mở cửa"
          hint="Người moi được ô bắt buộc và mở được khách. Công trạng mở cửa ghi cho danh sách này, tách khỏi phần chốt."
          picked={draft.bdOwners}
          errors={errors.bdOwners}
          onToggle={(id) => set('bdOwners', toggled(draft.bdOwners, id))}
        />

        <ProbabilityField
          value={draft.probability}
          errors={errors.probability}
          onSet={(next) => set('probability', next)}
        />

        <ProductsField
          picked={draft.products}
          errors={errors.products}
          onToggle={(id) => set('products', toggled(draft.products, id))}
        />

        <Field
          label="Mô tả"
          errors={errors.description}
          hint="Mở sẵn bằng ô 6 của init data — việc khách muốn giải. Sửa lại cho đúng phạm vi đang chào."
        >
          <Textarea
            autoGrow
            rows={3}
            maxLength={OPPORTUNITY_DESCRIPTION_MAX}
            invalid={Boolean(errors.description)}
            value={draft.description}
            aria-label="Mô tả cơ hội"
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        <AttachmentsField draft={draft} onSet={set} errors={errors.attachments} />

        {lost && <LossBlock draft={draft} onSet={set} errors={errors} />}
      </div>
    </Drawer>
  )
}
