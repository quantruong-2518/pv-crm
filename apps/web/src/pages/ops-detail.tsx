import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Handshake, Inbox, Mail, Phone, RotateCcw, Users } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Chip,
  GlassCard,
  Icon,
  Input,
  Kicker,
  MetaPill,
  SectionTitle,
  ScreenDetailGrid,
  ScreenHeader,
  ScreenLayout,
  Select,
  Separator,
  Skeleton,
  Textarea,
  billions,
  cn,
} from '@pv/ui'
import {
  campaignLabel,
  type LeadProfile,
  type OpportunityRow,
  type OpportunityState,
} from '@pv/contracts'
import { toDong, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dm, dmy } from '@/lib/date'
import { leadProfileQuery, realContact, NO_TOUCHES, NO_TRANSCRIPT } from '@/data/lead-profile'
import { opsTouchesQuery } from '@/data/touches'
import {
  bdOwnersOf,
  isLateClose,
  isRottingOp,
  missingOf,
  namesOf,
  opsProfileQuery,
  saleOwnersOf,
  STATE_TONE,
  toggled,
} from '@/data/ops'
import { CREATE_STATES, draftOf, updateBodyOf, useSaveOpportunity } from '@/data/ops-write'
import {
  AmountRow,
  AttachmentsField,
  Field,
  LossBlock,
  PeopleRow,
  STAGE_LABEL,
  STATE_LABEL,
  type SetDraft,
} from '@/components/ops-fields'
import { SignDrawer } from '@/components/sign-drawer'
import { ActivityCard } from './lead-parts'

/** Module 3 · Hồ sơ một cơ hội — `/sales/ops/:code`.
 *
 *  ------------------------------------------------------------------
 *  CÙNG BỐ CỤC VỚI HỒ SƠ LEAD
 *  ------------------------------------------------------------------
 *   0 · ĐẦU TRANG — tên cơ hội và trạng thái, rồi một hàng pill phân loại.
 *   1 · CỘT CHÍNH (3 phần) — thứ người dùng SỬA: cả phiếu cơ hội, một thẻ.
 *   2 · CỘT PHỤ (1 phần) — thứ người dùng TRA: lead gốc, ai đứng đơn, và dòng
 *       thời gian (dùng lại nguyên `ActivityCard` của module 2 — đời của đơn
 *       CHÍNH LÀ đời của lead sinh ra nó, dựng một dòng thời gian thứ hai chỉ
 *       để kể lại cùng chuỗi sự kiện là tự mâu thuẫn).
 *   3 · THANH CÔNG CỤ dính đáy — ai gọi cho ai bên trái, đi đâu bên phải.
 *
 *  ------------------------------------------------------------------
 *  NỘI DUNG PHIẾU LÀ ĐÚNG NỘI DUNG POPUP
 *  ------------------------------------------------------------------
 *  Popup "Đổi lead thành cơ hội" và thẻ phiếu ở đây dùng CHUNG một bộ ô nhập
 *  (`components/ops-fields.tsx`), kể cả bản kiểm "còn thiếu gì". Chúng chỉ khác
 *  chỗ đặt: popup nằm đè lên hồ sơ lead vì người điền đang đọc dở hồ sơ đó, còn
 *  đây là một trang vì đơn đã tồn tại và người ta quay lại nó nhiều lần.
 *
 *  Sửa xong phải bấm lưu — giống hệt hồ sơ lead, và giống vì cùng một lý do:
 *  tự lưu từng phím bỏ mất trạng thái "tôi đang sửa dở", mà đó chính là lúc
 *  người dùng cần thấy còn bao nhiêu ô chưa lưu và có đường lùi.
 *
 *  ------------------------------------------------------------------
 *  ĐÃ CẮT SANG MÁY CHỦ — 28/08
 *  ------------------------------------------------------------------
 *  Hai lượt đọc thật (`GET /sales/ops/:code` và `GET /sales/leads/:code`) và
 *  một lượt ghi thật (`PATCH /sales/ops/:code`). Bàn làm việc trên máy
 *  (`desk.ops`) rời khỏi màn này hoàn toàn: nó từng là chỗ giữ bản sửa vì chưa
 *  có cửa ghi, và giữ lại bên cạnh một cửa ghi thật là dựng hai nguồn cho cùng
 *  một phiếu — người dùng lưu, rồi thấy bản cũ của desk đè lên bản vừa lưu.
 *
 *  Nút "Về bản gốc" cũng đi theo, và đó là mất mát THẬT chứ không phải dọn
 *  dẹp: "bản gốc" của một dòng máy chủ là một phiên bản trước, thứ chỉ có
 *  nghĩa khi có lịch sử phiên bản để lùi về. Cho tới lúc đó, đường lùi là "Bỏ
 *  sửa" — huỷ những ô chưa lưu, thứ duy nhất màn thật sự lùi được. */

/** Ô nào của phiếu người dùng sửa được. `code` · `account` · `accountCode`
 *  không có mặt: một cơ hội không đổi được sang khách khác, và mã thì hệ cấp.
 *  Đúng bằng bộ trường của `OpportunityUpdate` — đổi một bên thì đổi cả hai. */
const EDITABLE = [
  'name',
  'closedDate',
  'state',
  'amount',
  'currency',
  'saleOwners',
  'bdOwners',
  'description',
  'attachments',
  'lossReason',
  'lossNote',
] as const satisfies readonly (keyof OpportunityDraft)[]

/** Ô nào đã đổi giữa hai bản phiếu.
 *
 *  So từng ô chứ không so cả object: hai object luôn khác nhau về tham chiếu,
 *  và một dirty state luôn bật là một dirty state vô dụng. Ba ô chở MẢNG nên so
 *  bằng nội dung — chọn rồi bỏ chọn đúng một người phải ra "không đổi gì". */
function changedFields(base: OpportunityDraft, work: OpportunityDraft): string[] {
  return EDITABLE.filter((key) => {
    const a = base[key]
    const b = work[key]
    if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) !== JSON.stringify(b)
    return a !== b
  })
}

export function OpsDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()

  const { data: op, isPending, error } = useQuery(opsProfileQuery(code))

  /* Hồ sơ lead gốc, đọc THẬT. `enabled` chờ đơn về trước vì mã lead nằm trên
     chính dòng đó — không có nó thì không biết hỏi lead nào. Lỗi của lượt này
     KHÔNG làm hỏng màn: một cơ hội vẫn đọc được khi lead của nó ngoài phạm vi
     người đang xem, và thẻ bên phải nói ra điều đó thay vì để trống. */
  const { data: lead = null } = useQuery({
    ...leadProfileQuery(op?.leadCode ?? ''),
    enabled: Boolean(op?.leadCode),
  })

  /* Dòng thời gian của ĐƠN, không phải của lead — quyết định #5 của
     `docs/ban-giao-co-hoi.md`. Đơn sinh ra SAU khi lead đã đi được một đoạn,
     nên trộn hai chuỗi thì câu "đơn này đã đi qua những gì" trả lời lẫn cả
     những việc xảy ra trước khi đơn tồn tại.

     `enabled` chờ đơn về, cùng lý do với hồ sơ lead ngay trên: mã nằm trên
     chính dòng đó. Hỏng lượt này KHÔNG làm hỏng màn — `?? NO_TOUCHES` giữ
     nguyên lời khai cũ, và một dòng thời gian rỗng vẫn là một thẻ đọc được. */
  const { data: touches = NO_TOUCHES } = useQuery({
    ...opsTouchesQuery(op?.code ?? ''),
    enabled: Boolean(op?.code),
  })

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      <ScreenLayout>
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </ScreenLayout>,
    )
  }

  if (!op) {
    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyOp
            code={code}
            message={isApiError(error) ? userMessage(error) : undefined}
            onBack={() => navigate('/sales/ops')}
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  const late = isLateClose(op)
  const rotting = isRottingOp(op)

  return shell(
    <ScreenLayout>
      {/* Dòng tên chỉ chở HAI thứ: tên cơ hội và trạng thái. Mọi nhãn phân loại
          — mã, account, cột, tiền, ngày đóng — xuống hàng pill dưới. */}
      <ScreenHeader
        back={{ label: 'Sổ cơ hội', onClick: () => navigate('/sales/ops') }}
        kicker="Cơ hội"
        title={op.name}
        meta={
          <>
            <Badge tone={STATE_TONE[op.state]}>{STATE_LABEL.get(op.state)}</Badge>
            <Chip>{op.code}</Chip>
            <MetaPill>{op.account}</MetaPill>
            {op.accountCode && <Chip variant="source">{op.accountCode}</Chip>}
            {op.stage && (
              <MetaPill tone={rotting ? 'warning' : 'accent'}>
                {STAGE_LABEL.get(op.stage)}
                {op.daysInStage !== null && ` · ${op.daysInStage} ngày`}
                {rotting && ' · quá hạn cột'}
              </MetaPill>
            )}
            {op.amount !== null && op.currency !== null && (
              <MetaPill mono>{billions(toDong(op.amount, op.currency))}</MetaPill>
            )}
            {op.expectedClose !== null && (
              <MetaPill mono tone={late ? 'warning' : undefined}>
                {op.stage === null ? 'đóng' : 'đóng dự kiến'} {dmy(op.expectedClose)}
              </MetaPill>
            )}
          </>
        }
      />

      <ScreenDetailGrid
        sideLabel="Ngữ cảnh cơ hội"
        main={<DealCard op={op} />}
        side={
          <>
            <LeadCard op={op} lead={lead} onOpen={() => navigate(`/sales/leads/${op.leadCode}`)} />
            <PeopleCard op={op} />
            {/* Đọc THẬT từ `GET /sales/ops/:code/touches`. Khoá bằng mã ĐƠN chứ
              không mã lead: `code` là thứ `ActivityCard` dùng để dựng lại tab
              và mục đang mở, nên nó phải đổi đúng lúc dòng thời gian đổi.

              Thẻ không còn treo vào `lead` nữa. Trước đây nó gác như vậy vì
              `code` phải mượn mã lead; giờ đơn tự có dòng thời gian của mình,
              và một đơn mà lead nằm ngoài phạm vi người xem vẫn phải kể được
              đời của chính nó.

              `turns` vẫn `NO_TRANSCRIPT`, cố ý: máy chủ không có transcript và
              sẽ chưa có. Hằng số nói ra điều đó, một `[]` trần thì không. */}
            <ActivityCard code={op.code} history={touches} turns={NO_TRANSCRIPT} />
          </>
        }
      />

      <ToolsBar op={op} lead={lead} onOpenLead={() => navigate(`/sales/leads/${op.leadCode}`)} />
    </ScreenLayout>,
  )
}

// ---------------------------------------------------------------------------

function EmptyOp({
  code,
  message,
  onBack,
}: {
  code: string
  message?: string
  onBack: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={Inbox} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">
        {message ?? (
          <>
            Sổ không có đơn nào mang mã <span className="font-mono">{code}</span>.
          </>
        )}
      </p>
      <Button size="sm" variant="ghost" onClick={onBack}>
        Về sổ cơ hội
      </Button>
    </div>
  )
}

/** Cả phiếu cơ hội, một thẻ — đúng những ô popup hỏi, cùng bộ component.
 *
 *  Bốn cụm, xếp theo thứ tự người đọc cần: đơn là gì → bao nhiêu tiền → ai đứng
 *  đơn → mô tả và giấy tờ. Khối lý do thua chỉ mở khi trạng thái là Close lost,
 *  và nó CHẶN nút lưu cho tới khi có lý do — một đơn thua không ghi lý do là
 *  một bài học mất trắng. */
function DealCard({ op }: { op: OpportunityRow }) {
  const save = useSaveOpportunity(op.code)

  /* Dòng máy chủ → hình phiếu. Qua `useMemo` để `work` không bị nạp lại mỗi
     lần vẽ: `op` giữ nguyên tham chiếu giữa các lần render của react-query, nên
     bản nháp mồi cũng vậy, nên `useEffect` bên dưới không đè lên ô đang gõ. */
  const saved = useMemo(() => draftOf(op), [op])
  const [work, setWork] = useState<OpportunityDraft>(saved)

  /* Đổi đơn (hoặc nhận bản vừa lưu từ máy chủ) thì nạp lại ô nhập. Không nạp
     lại thì bấm sang đơn khác vẫn thấy phiếu của đơn trước. */
  useEffect(() => setWork(saved), [saved])

  /* Mọi ô sửa được đều là ô của `OpportunityDraft`, nên hàm ghi mang đúng kiểu
     mà bộ ô dùng chung đòi — không phải ép kiểu chỗ nào. */
  const set: SetDraft = (key, value) => setWork((w) => ({ ...w, [key]: value }))

  const dirty = changedFields(saved, work)
  const missing = missingOf(work)
  const lost = work.state === 'close-lost'
  const stage = CREATE_STATES.find((s) => s.key === work.state)?.stage ?? null
  const blocked = dirty.length === 0 || missing.length > 0 || save.isPending

  return (
    <GlassCard className="flex flex-col gap-6 p-5 lg:p-6" aria-label="Phiếu cơ hội">
      <SectionTitle
        size="lg"
        kicker={`Lead gốc ${op.leadCode}`}
        hint="Đúng những ô của phiếu đổi lead thành cơ hội. Dấu sao là ô bắt buộc."
        actions={
          dirty.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setWork(saved)}>
              <Icon icon={RotateCcw} size={16} />
              Bỏ sửa · {dirty.length} ô
            </Button>
          ) : undefined
        }
      >
        Phiếu cơ hội
      </SectionTitle>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Mã cơ hội" hint="Máy chủ cấp lúc đổi lead, không sửa được.">
          <span className="flex h-10 items-center">
            <Chip>{op.code}</Chip>
          </span>
        </Field>

        <Field label="Account" hint="Đi thẳng từ lead — một cơ hội không đổi được sang khách khác.">
          <span className="flex h-10 flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold">{op.account}</span>
            {op.accountCode && <Chip variant="source">{op.accountCode}</Chip>}
          </span>
        </Field>

        <Field label="Tên cơ hội" required className="sm:col-span-2">
          <Input
            value={work.name}
            aria-label="Tên cơ hội"
            aria-required
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>

        <Field
          label="Ngày đóng dự kiến"
          required
          hint={work.closedDate !== '' ? `Đọc là ${dmy(work.closedDate)}.` : undefined}
        >
          <Input
            type="date"
            value={work.closedDate}
            aria-label="Ngày đóng dự kiến"
            aria-required
            onChange={(e) => set('closedDate', e.target.value)}
          />
        </Field>

        {/* Gợi ý nói ba câu KHÁC NHAU, vì ba tình huống khác nhau — và câu thứ
            nhất là bản vá cho một chỗ đọc sai: bản trước luôn in "Vào cột X"
            suy từ trạng thái, nên một đơn đang đứng ở "Đã demo" (cột không có
            trạng thái nào trỏ tới) đọc ra "Vào cột Đang tìm hiểu" ngay bên dưới
            cái pill ghi "Đã demo". Trạng thái chưa đổi thì lưu KHÔNG dời cột,
            và câu chữ phải nói đúng thế. */}
        <Field
          label="Trạng thái"
          plain
          hint={
            work.state === saved.state
              ? op.stage
                ? `Đang ở cột "${STAGE_LABEL.get(op.stage)}". Lưu không dời cột — đổi trạng thái mới dời.`
                : 'Đơn đã đóng sổ, không nằm cột nào.'
              : stage
                ? `Lưu sẽ chuyển đơn sang cột "${STAGE_LABEL.get(stage)}".`
                : 'Đóng sổ ngay — đơn ra khỏi năm cột. Chốt THẮNG không đặt ở đây: đơn thắng là đơn có hợp đồng.'
          }
        >
          <Select
            label="Trạng thái"
            hideLabel
            value={work.state}
            neutralValue={work.state}
            onChange={(v) => set('state', v as OpportunityState)}
            options={CREATE_STATES.map((s) => ({ value: s.key, label: s.label }))}
            className="w-full"
          />
        </Field>
      </section>

      <AmountRow draft={work} onSet={set} />

      <PeopleRow
        label="Sale đứng đơn"
        required
        hint="Người chốt. Phần chốt của hoa hồng chia theo danh sách này, nên đừng để trống cho xong."
        picked={work.saleOwners}
        onToggle={(id) => set('saleOwners', toggled(work.saleOwners, id))}
      />

      <PeopleRow
        label="BD mở cửa"
        hint="Người moi được ô bắt buộc và mở được khách. Công trạng mở cửa ghi cho danh sách này, tách khỏi phần chốt."
        picked={work.bdOwners}
        onToggle={(id) => set('bdOwners', toggled(work.bdOwners, id))}
      />

      <Field
        label="Mô tả"
        hint="Mở sẵn bằng ô 6 của init data — việc khách muốn giải. Sửa lại cho đúng phạm vi đang chào."
      >
        <Textarea
          autoGrow
          rows={3}
          value={work.description}
          aria-label="Mô tả cơ hội"
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <AttachmentsField draft={work} onSet={set} />

      {lost && <LossBlock draft={work} onSet={set} />}

      <Separator />

      <div className="flex flex-wrap items-center gap-4">
        <Button size="md" disabled={blocked} onClick={() => save.mutate(updateBodyOf(work))}>
          <Icon icon={Check} size={16} />
          {save.isPending
            ? 'Đang lưu…'
            : `Lưu ${dirty.length > 0 ? `${dirty.length} ô đã sửa` : 'phiếu'}`}
        </Button>
        <Button
          size="md"
          variant="ghost"
          disabled={dirty.length === 0 || save.isPending}
          onClick={() => setWork(saved)}
        >
          Bỏ sửa
        </Button>
        <span
          className={cn(
            'text-[11.5px] leading-[1.5]',
            (missing.length > 0 || save.error) && 'text-warning',
          )}
          aria-live="polite"
        >
          {/* Lỗi máy chủ thắng mọi câu khác: người vừa bấm Lưu mà không thấy gì
              đổi cần biết vì sao, trước cả "còn mấy ô chưa lưu". */}
          {save.error
            ? userMessage(save.error)
            : missing.length > 0
              ? `Chưa lưu được — còn thiếu ${missing.join(' · ')}.`
              : dirty.length > 0
                ? `${dirty.length} ô chưa lưu — rời màn bây giờ là mất.`
                : 'Phiếu đã khớp với bản trên máy chủ.'}
        </span>
      </div>
    </GlassCard>
  )
}

/** Lead sinh ra đơn này — dây nối ngược về module 2.
 *
 *  Một cơ hội không tự sinh ra: nó là một lead đã qua cổng init data. Người đọc
 *  hồ sơ đơn hay phải quay lại chỗ đó để xem transcript và mười ô đã moi. */
function LeadCard({
  op,
  lead,
  onOpen,
}: {
  op: OpportunityRow
  lead: LeadProfile | null
  onOpen: () => void
}) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Lead gốc">
      <SectionTitle
        kicker="Sinh ra từ"
        size="md"
        actions={
          lead ? (
            <Button size="sm" variant="ghost" onClick={onOpen}>
              Mở hồ sơ lead
            </Button>
          ) : undefined
        }
      >
        {lead ? lead.company : op.account}
      </SectionTitle>

      {lead ? (
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{lead.code}</Chip>
          <MetaPill>{lead.province ?? '—'}</MetaPill>
          <MetaPill mono>vào sổ {dm(lead.createdAt)}</MetaPill>
          <MetaPill>{campaignLabel(lead.source)}</MetaPill>
        </div>
      ) : (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa đọc được hồ sơ lead <span className="font-mono">{op.leadCode}</span> — có thể nó nằm
          ngoài phạm vi quyền của bạn.
        </p>
      )}
    </GlassCard>
  )
}

/** Ai đứng đơn. Sale chốt và BD mở cửa là HAI vai khác nhau — gộp vào một dòng
 *  là mất câu trả lời "hoa hồng chia cho ai". */
function PeopleCard({ op }: { op: OpportunityRow }) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Người đứng đơn">
      <SectionTitle size="sm">Đứng đơn</SectionTitle>

      <div className="flex flex-col gap-2">
        <Kicker tone="muted">Sale đứng đơn</Kicker>
        <AvatarGroup
          names={namesOf(saleOwnersOf(op))}
          max={5}
          size="md"
          emptyLabel="chưa ai đứng đơn"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Kicker tone="muted">BD mở cửa</Kicker>
        <AvatarGroup names={namesOf(bdOwnersOf(op))} max={5} size="md" emptyLabel="chưa ghi BD" />
      </div>

      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Phần chốt của hoa hồng chia theo danh sách trên, công trạng mở cửa theo danh sách dưới.
      </p>
    </GlassCard>
  )
}

/** Thanh công cụ dính đáy — AI ở trái, ĐI ĐÂU ở phải.
 *
 *  Cùng hình với thanh của hồ sơ lead, và cố ý: người dùng đi qua lại giữa hai
 *  màn cả ngày. Nửa phải ở đây KHÔNG có nút lưu — lưu nằm cuối chính cái phiếu,
 *  chỗ người ta vừa gõ xong. Hai nút lưu trên một màn là hai chỗ để hỏi "cái
 *  nào mới thật sự lưu".
 *
 *  Thanh DÍNH chứ không cố định tuyệt đối: nó ở trong luồng nội dung nên không
 *  đè lên sidebar, và dưới `lg` thì nhường chỗ cho BottomNav 84px của AppShell. */
function ToolsBar({
  op,
  lead,
  onOpenLead,
}: {
  op: OpportunityRow
  lead: LeadProfile | null
  onOpenLead: () => void
}) {
  /* Người liên hệ đọc từ HỒ SƠ THẬT, cùng hàm dịch mà `lead-detail` dùng —
     màn này không còn tra `leadContact` của fixture, nên không còn nợ "sổ đóng
     băng không chứa mã ngoài dải" nào để ghi ở đây. */
  const contact = lead ? realContact(lead) : null
  const owner = saleOwnersOf(op)[0]

  /* ẨN HẲN, không hiện rồi làm mờ — quyết định #4 của `docs/ban-giao-co-hoi.md`.
     Một nút mờ là một lời hứa: "cái này làm được, chỉ chưa lúc này". Với
     `presales` thì không bao giờ là lúc — vai đó dựng số và chạy demo, chữ ký
     thuộc về người đứng tên đơn — nên nút mờ ở đó chỉ dạy người dùng đi tìm
     điều kiện không tồn tại.

     `useCan` hỏi ĐÚNG hàm E2 mà `app/api/client.ts` hỏi trước khi thả một byte
     nào ra dây (`access.allows`), nên giao diện và hàng rào không nói ngược
     nhau. Ẩn nút KHÔNG phải là phân quyền: hàng rào thật vẫn ở tầng api, và cửa
     máy chủ vẫn khai `@Need({ permission: 'cơ-hội.chốt' })`. */
  const canSign = useCan('cơ-hội.chốt')
  const [signing, setSigning] = useState(false)

  /* Ba trạng thái, và chúng loại nhau theo đúng thứ tự này:

      đã ký  → pill tĩnh mang số hợp đồng. Hiện với MỌI vai, kể cả vai không ký
               được: "đơn này đã xong" là thông tin, không phải hành động.
               `contractCode` chỉ có mặt khi `state === 'close-won'`, nên nó vừa
               là điều kiện vừa là nội dung — không cần hỏi hai câu.
      đã thua → không vẽ gì. Máy chủ trả 409 cho một đơn đã thua, và một nút chỉ
               để ăn 409 thì thà đừng có.
      còn lại → nút mở panel ký, cho vai có quyền. */
  const signed = op.contractCode !== undefined
  const lost = op.state === 'close-lost'

  return (
    <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-10 lg:bottom-0">
      <GlassCard
        variant="b"
        /* `backdrop-blur` là NGOẠI LỆ có lý do của glass-b — cùng lý do với
           thanh của hồ sơ lead: có NỘI DUNG TRÔI phía sau. */
        className="shadow-panel flex flex-wrap items-center gap-4 p-4 backdrop-blur-xl"
        aria-label="Thanh công cụ"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <Kicker tone="muted">Khách</Kicker>
          {contact ? (
            <div className="flex flex-wrap items-center gap-2">
              <MetaPill avatar={contact.name}>
                {contact.name}
                {contact.title && ` · ${contact.title}`}
              </MetaPill>
              {contact.phone && (
                <MetaPill icon={Phone} mono>
                  {contact.phone}
                </MetaPill>
              )}
              {contact.email && <MetaPill icon={Mail}>{contact.email}</MetaPill>}
            </div>
          ) : (
            <span className="text-warning text-[11.5px] leading-[1.5]">
              Chưa đọc được người liên hệ — chưa gọi được cho ai.
            </span>
          )}
        </div>

        <Separator className="hidden h-8 w-px lg:block" />

        <div className="flex min-w-0 flex-col gap-1">
          <Kicker tone="muted">Sale đứng đơn</Kicker>
          {owner ? (
            <span className="flex items-center gap-2">
              <Avatar name={owner.name} size="sm" />
              <span className="text-[12.5px] font-semibold">{owner.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground text-[11.5px]">Chưa ai đứng đơn</span>
          )}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Button
            size="md"
            variant="ghost"
            disabled={!contact?.phone}
            title={contact?.phone ?? 'Chưa moi được kênh gọi lại được'}
          >
            <Icon icon={Phone} size={16} />
            {contact ? `Gọi ${contact.name}` : 'Gọi khách'}
          </Button>

          <Button size="md" onClick={onOpenLead}>
            <Icon icon={Users} size={16} />
            Hồ sơ lead · {op.leadCode}
          </Button>

          {signed ? (
            <MetaPill icon={Handshake} tone="success" mono>
              Đã ký · {op.contractCode}
            </MetaPill>
          ) : lost || !canSign ? null : (
            <Button size="md" onClick={() => setSigning(true)}>
              <Icon icon={Handshake} size={16} />
              Chốt thắng
            </Button>
          )}

          {/* Chỗ trống đúng bằng nút Trợ lý AI nổi (60px, `bottom-8 right-8` của
              AppShell) — không chừa thì nút đè lên đúng hành động cuối. */}
          <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
        </div>

        <SignDrawer op={op} open={signing} onClose={() => setSigning(false)} />
      </GlassCard>
    </div>
  )
}

export default OpsDetailPage
