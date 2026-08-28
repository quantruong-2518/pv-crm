import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, X } from '@pv/ui'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  Chip,
  Drawer,
  Icon,
  Input,
  MetaPill,
  Select,
  Textarea,
  billions,
  cn,
} from '@pv/ui'
import {
  dasVina,
  draftOpportunity,
  HEAD_OF_SALES,
  OPPORTUNITY_STATES,
  toDong,
  type Lead,
  type OpportunityDraft,
  type OpportunityState,
} from '@pv/engines/fixtures/das-vina'
import type { LeadProfile } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useLeadDesk } from '@/app/desk'
import { profileForm } from '@/data/lead-profile'
import { missingOf, toggled } from '@/data/ops'
import { createBodyOf, CREATE_STATES, usePromoteLead } from '@/data/ops-write'
import { dmy } from '@/lib/date'
import {
  AmountRow,
  AttachmentsField,
  Field,
  LossBlock,
  PeopleRow,
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
 *  `data/ops.ts` — cả hai dùng chung với `pages/ops-detail.tsx`. Cùng một phiếu
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
}

export function ConvertDialog({ profile, open, onClose }: Props) {
  const convert = useLeadDesk((s) => s.convert)
  const deals = useLeadDesk((s) => s.deals)

  /* Mã đã cấp trong phiên này. Không đưa vào thì phiếu thứ hai lấy lại đúng mã
     của phiếu thứ nhất — hai dòng sổ trùng mã, và không ai phân biệt được. */
  const taken = useMemo(() => Object.values(deals).map((d) => d.code), [deals])
  const form = useMemo(() => profileForm(profile), [profile])
  const seed = useMemo(() => draftOpportunity(form, dasVina.actors, taken), [form, taken])
  const [draft, setDraft] = useState<OpportunityDraft>(seed)

  /* Mở phiếu là một lần bắt đầu mới: nạp lại bản nháp. Không nạp lại thì đóng
     rồi mở lại vẫn thấy thứ mình vừa gõ dở của lần trước — hoặc tệ hơn, của
     một lead khác. */
  useEffect(() => {
    if (open) setDraft(seed)
  }, [open, seed])

  const set = <K extends keyof OpportunityDraft>(key: K, value: OpportunityDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const lost = draft.state === 'close-lost'
  const stage = OPPORTUNITY_STATES.find((s) => s.key === draft.state)?.stage ?? null

  const promote = usePromoteLead()

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
                  ? `Đổi xong, ${profile.company} rời sổ lead và đứng ở sổ cơ hội. Mã do máy chủ cấp lúc lưu. ${HEAD_OF_SALES} gật thì đơn vào cột thật.`
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

                     `convert` vẫn ghi vào desk, nhưng nay CHỈ còn một người
                     đọc: thẻ `ConvertedCard` ngay dưới thanh đáy của hồ sơ
                     lead, thứ trả lời "rồi, xong" cho người vừa bấm. Sổ cơ hội
                     KHÔNG đọc nó nữa — nó đã đọc thẳng máy chủ, và gộp thêm
                     bản desk vào đó là để một đơn hiện hai lần.

                     Ngày hồ sơ lead hỏi được máy chủ "lead này có cơ hội nào
                     chưa", dòng này biến mất cùng cả `desk.deals`. */
                  onSuccess: (row) => {
                    convert(profile.code, { ...draft, code: row.code })
                    onClose()
                  },
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

          <Field label="Tên cơ hội" required className="sm:col-span-2">
            <Input
              value={draft.name}
              aria-label="Tên cơ hội"
              aria-required
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field
            label="Ngày đóng dự kiến"
            required
            hint={draft.closedDate !== '' ? `Đọc là ${dmy(draft.closedDate)}.` : undefined}
          >
            <Input
              type="date"
              value={draft.closedDate}
              aria-label="Ngày đóng dự kiến"
              aria-required
              onChange={(e) => set('closedDate', e.target.value)}
            />
          </Field>

          <Field
            label="Trạng thái"
            plain
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

        <AmountRow draft={draft} onSet={set} />

        <PeopleRow
          label="Sale đứng đơn"
          required
          hint="Người chốt. Phần chốt của hoa hồng chia theo danh sách này, nên đừng để trống cho xong."
          picked={draft.saleOwners}
          onToggle={(id) => set('saleOwners', toggled(draft.saleOwners, id))}
        />

        <PeopleRow
          label="BD mở cửa"
          hint="Người moi được ô bắt buộc và mở được khách. Công trạng mở cửa ghi cho danh sách này, tách khỏi phần chốt."
          picked={draft.bdOwners}
          onToggle={(id) => set('bdOwners', toggled(draft.bdOwners, id))}
        />

        <Field
          label="Mô tả"
          hint="Mở sẵn bằng ô 6 của init data — việc khách muốn giải. Sửa lại cho đúng phạm vi đang chào."
        >
          <Textarea
            autoGrow
            rows={3}
            value={draft.description}
            aria-label="Mô tả cơ hội"
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

        <AttachmentsField draft={draft} onSet={set} />

        {lost && <LossBlock draft={draft} onSet={set} />}
      </div>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------

/** Thẻ đọc của một phiếu đã gửi — dùng ở màn hồ sơ lead, ngay dưới thanh đáy.
 *
 *  Đổi xong mà màn không đổi gì thì người dùng bấm lại lần nữa. Thẻ này là câu
 *  trả lời "rồi, xong": mã mới, trạng thái, tiền, người đứng đơn, đường sang
 *  hồ sơ cơ hội vừa tạo, và đường lùi vì chưa có backend nào để rút phiếu về. */
export function ConvertedCard({ lead }: { lead: Lead }) {
  const deal = useLeadDesk((s) => s.deals[lead.code])
  const undo = useLeadDesk((s) => s.undoConvert)
  const navigate = useNavigate()
  if (!deal) return null

  const lost = deal.state === 'close-lost'
  const names = [...deal.saleOwners, ...deal.bdOwners].map(
    (id) => dasVina.actors.find((a) => a.id === id)?.name ?? id,
  )

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-white/5 p-4">
      <Chip variant="source">{deal.code}</Chip>
      <Badge tone={lost ? 'danger' : 'running'}>{STATE_LABEL.get(deal.state)}</Badge>
      <span className="min-w-0 truncate text-[12.5px] font-semibold">{deal.name}</span>
      {deal.amount !== null && (
        <MetaPill mono>{billions(toDong(deal.amount, deal.currency))}</MetaPill>
      )}
      <MetaPill mono>đóng dự kiến {dmy(deal.closedDate)}</MetaPill>
      {names.map((n) => (
        <MetaPill key={n} avatar={n}>
          {n}
        </MetaPill>
      ))}
      {lost && (deal.lossReason !== '' || deal.lossNote !== '') && (
        <span className="text-warning text-[11.5px]">
          Thua · {deal.lossReason !== '' ? deal.lossReason : deal.lossNote}
        </span>
      )}
      <span className="text-muted-foreground text-[11.5px]">chờ {HEAD_OF_SALES} gật</span>
      <Button size="sm" onClick={() => navigate(`/sales/ops/${deal.code}`)}>
        <Icon icon={ArrowRight} size={16} />
        Mở hồ sơ cơ hội
      </Button>
      <Button size="sm" variant="ghost" onClick={() => undo(lead.code)}>
        Rút phiếu
      </Button>
    </div>
  )
}
