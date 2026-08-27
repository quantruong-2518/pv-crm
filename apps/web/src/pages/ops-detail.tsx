import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Inbox, Mail, Phone, RotateCcw, Users } from 'lucide-react'
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
  Select,
  Separator,
  Skeleton,
  Textarea,
  billions,
  cn,
} from '@pv/ui'
import {
  dasVina,
  leadContact,
  leadTranscript,
  OPPORTUNITY_STATES,
  toDong,
  type FrozenLead,
  type Opportunity,
  type OpportunityState,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { useLeadDesk } from '@/app/desk'
import { dm, dmy } from '@/lib/date'
import { frozenLeadBookQuery } from '@/data/leads'
import { NO_TRANSCRIPT } from '@/data/lead-profile'
import {
  actorNames,
  isLateClose,
  isRottingOp,
  mergeOps,
  missingOf,
  opsBookQuery,
  stageOfState,
  STATE_TONE,
  toggled,
} from '@/data/ops'
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
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */

/** Ô nào của phiếu người dùng sửa được. `code` · `account` · `accountCode` ·
 *  `leadCode` không có mặt: một cơ hội không đổi được sang khách khác, và mã
 *  thì hệ cấp. `stage` cũng không — nó đi theo `state`, không sửa rời. */
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
] as const satisfies readonly (keyof Opportunity)[]

/** Ô nào đã đổi giữa hai bản phiếu.
 *
 *  So từng ô chứ không so cả object: hai object luôn khác nhau về tham chiếu,
 *  và một dirty state luôn bật là một dirty state vô dụng. Ba ô chở MẢNG nên so
 *  bằng nội dung — chọn rồi bỏ chọn đúng một người phải ra "không đổi gì". */
function changedFields(base: Opportunity, work: Opportunity): string[] {
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

  const { data: fixtureBook = [], isPending } = useQuery(opsBookQuery)
  const { data: leadBook = [] } = useQuery(frozenLeadBookQuery)
  const deals = useLeadDesk((s) => s.deals)
  const patches = useLeadDesk((s) => s.ops)

  const book = useMemo(() => mergeOps(fixtureBook, deals, patches), [fixtureBook, deals, patches])
  /* Sổ CHƯA đè bản sửa — thẻ phiếu cần nó để đếm "mấy ô khác bản gốc". Dựng
     bằng chính `mergeOps` với patch rỗng, không dựng bằng một đường thứ hai. */
  const raw = useMemo(() => mergeOps(fixtureBook, deals, {}), [fixtureBook, deals])
  const op = book.find((o) => o.code === code) ?? null
  const base = raw.find((o) => o.code === code) ?? null
  const lead = op ? (leadBook.find((l) => l.code === op.leadCode) ?? null) : null
  /* Màn này đứng trên sổ ĐÓNG BĂNG, nên nguyên văn hội thoại ở đây là dữ liệu
     có thật của kịch bản — khác `lead-detail`, nơi máy chủ chưa có bảng lần
     chạm. `ActivityCard` bắt mỗi người gọi tự khai mình đứng trên nền nào; đây
     là lời khai của màn cơ hội. Kiểu `FrozenLead` của `leadBook` là thứ cho
     phép gọi hàm sinh này. */
  const turns = useMemo(() => (lead ? leadTranscript(lead) : NO_TRANSCRIPT), [lead])

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      <div className="flex flex-col gap-4">
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>,
    )
  }

  if (!op) {
    return shell(
      <GlassCard className="p-5 lg:p-6">
        <EmptyOp code={code} onBack={() => navigate('/sales/ops')} />
      </GlassCard>,
    )
  }

  const late = isLateClose(op)
  const rotting = isRottingOp(op)

  return shell(
    <div className="flex flex-col gap-4 lg:gap-6">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => navigate('/sales/ops')}
        className="self-start"
      >
        <Icon icon={ArrowLeft} size={16} />
        Sổ cơ hội
      </Button>

      {/* Dòng tên chỉ chở HAI thứ: tên cơ hội và trạng thái. Mọi nhãn phân loại
          — mã, account, cột, tiền, ngày đóng — xuống hàng pill dưới. */}
      <div className="flex min-w-0 flex-col gap-2">
        <Kicker>Cơ hội</Kicker>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">{op.name}</h2>
          <Badge tone={STATE_TONE[op.state]}>{STATE_LABEL.get(op.state)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{op.code}</Chip>
          <MetaPill>{op.account}</MetaPill>
          {op.accountCode !== '' && <Chip variant="source">{op.accountCode}</Chip>}
          {op.stage && (
            <MetaPill tone={rotting ? 'warning' : 'accent'}>
              {STAGE_LABEL.get(op.stage)}
              {rotting && ' · quá hạn cột'}
            </MetaPill>
          )}
          {op.amount !== null && (
            <MetaPill mono>{billions(toDong(op.amount, op.currency))}</MetaPill>
          )}
          <MetaPill mono tone={late ? 'warning' : undefined}>
            {op.stage === null ? 'đóng' : 'đóng dự kiến'} {dmy(op.closedDate)}
          </MetaPill>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_1fr] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <DealCard op={op} base={base ?? op} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <LeadCard op={op} lead={lead} onOpen={() => navigate(`/sales/leads/${op.leadCode}`)} />
          <PeopleCard op={op} />
          {lead && <ActivityCard code={lead.code} history={lead.history} turns={turns} />}
        </div>
      </div>

      <ToolsBar op={op} lead={lead} onOpenLead={() => navigate(`/sales/leads/${op.leadCode}`)} />
    </div>,
  )
}

// ---------------------------------------------------------------------------

function EmptyOp({ code, onBack }: { code: string; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={Inbox} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">
        Sổ không có đơn nào mang mã <span className="font-mono">{code}</span>. Sổ cơ hội là 30 dòng
        của kỳ 01/05 → 17/08, cộng những phiếu vừa đổi trong phiên này.
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
function DealCard({ op, base }: { op: Opportunity; base: Opportunity }) {
  const patchOp = useLeadDesk((s) => s.patchOp)
  const resetOp = useLeadDesk((s) => s.resetOp)

  const [work, setWork] = useState<Opportunity>(op)

  /* Đổi đơn (hoặc nhận bản đã lưu mới) thì nạp lại ô nhập. Không nạp lại thì
     bấm sang đơn khác vẫn thấy phiếu của đơn trước. */
  useEffect(() => setWork(op), [op])

  /* Mọi ô sửa được đều là ô của `OpportunityDraft`, nên hàm ghi mang đúng kiểu
     mà bộ ô dùng chung đòi — không phải ép kiểu chỗ nào. */
  const set: SetDraft = (key, value) => setWork((w) => ({ ...w, [key]: value }))

  /* Hai con số khác nhau, và khác ở chỗ quan trọng: `dirty` là "chưa lưu",
     `edited` là "đã lưu nhưng khác bản dựng từ fixture". */
  const dirty = changedFields(op, work)
  const edited = changedFields(base, op)
  const missing = missingOf(work)
  const lost = work.state === 'close-lost'
  const stage = stageOfState(work.state)

  return (
    <GlassCard className="flex flex-col gap-6 p-5 lg:p-6" aria-label="Phiếu cơ hội">
      <SectionTitle
        size="lg"
        kicker={`Lead gốc ${op.leadCode}`}
        hint="Đúng những ô của phiếu đổi lead thành cơ hội. Dấu sao là ô bắt buộc."
        actions={
          edited.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => resetOp(op.code)}>
              <Icon icon={RotateCcw} size={16} />
              Về bản gốc · {edited.length} ô
            </Button>
          ) : undefined
        }
      >
        Phiếu cơ hội
      </SectionTitle>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Mã cơ hội" hint="Hệ cấp, tiếp nối mã lớn nhất đang có trong sổ.">
          <span className="flex h-10 items-center">
            <Chip>{work.code}</Chip>
          </span>
        </Field>

        <Field label="Account" hint="Đi thẳng từ lead — một cơ hội không đổi được sang khách khác.">
          <span className="flex h-10 flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold">{work.account}</span>
            {work.accountCode !== '' && <Chip variant="source">{work.accountCode}</Chip>}
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

        <Field
          label="Trạng thái"
          plain
          hint={
            stage
              ? `Vào cột "${STAGE_LABEL.get(stage)}" của sổ cơ hội.`
              : 'Hai kết cục đóng sổ — đơn ra khỏi năm cột, không nằm cột nào.'
          }
        >
          <Select
            label="Trạng thái"
            hideLabel
            value={work.state}
            neutralValue={work.state}
            onChange={(v) => set('state', v as OpportunityState)}
            options={OPPORTUNITY_STATES.map((s) => ({ value: s.key, label: s.label }))}
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
        <Button
          size="md"
          disabled={dirty.length === 0 || missing.length > 0}
          onClick={() =>
            /* Ghi đúng những ô vừa đổi, không ghi cả phiếu: patch là bản so với
               fixture, và chép cả phiếu vào đó làm mọi ô trông như đã sửa. */
            patchOp(op.code, { ...pick(work, dirty), stage })
          }
        >
          <Icon icon={Check} size={16} />
          Lưu {dirty.length > 0 ? `${dirty.length} ô đã sửa` : 'phiếu'}
        </Button>
        <Button size="md" variant="ghost" disabled={dirty.length === 0} onClick={() => setWork(op)}>
          Bỏ sửa
        </Button>
        <span
          className={cn('text-[11.5px] leading-[1.5]', missing.length > 0 && 'text-warning')}
          aria-live="polite"
        >
          {missing.length > 0
            ? `Chưa lưu được — còn thiếu ${missing.join(' · ')}.`
            : dirty.length > 0
              ? `${dirty.length} ô chưa lưu — rời màn bây giờ là mất.`
              : 'Chưa có backend: lưu là ghi vào bàn làm việc trên máy này.'}
        </span>
      </div>
    </GlassCard>
  )
}

/** Đúng những ô có tên trong `keys`, cắt ra khỏi một phiếu. */
function pick(op: Opportunity, keys: string[]): Partial<Opportunity> {
  return Object.fromEntries(
    keys.map((k) => [k, op[k as keyof Opportunity]]),
  ) as Partial<Opportunity>
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
  op: Opportunity
  lead: FrozenLead | null
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
          <MetaPill>{lead.province}</MetaPill>
          <MetaPill mono>vào sổ {dm(lead.createdAt)}</MetaPill>
          <MetaPill mono>nguồn {lead.source}</MetaPill>
        </div>
      ) : (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Không tra được dòng lead <span className="font-mono">{op.leadCode}</span> trong sổ của kỳ
          này.
        </p>
      )}
    </GlassCard>
  )
}

/** Ai đứng đơn. Sale chốt và BD mở cửa là HAI vai khác nhau — gộp vào một dòng
 *  là mất câu trả lời "hoa hồng chia cho ai". */
function PeopleCard({ op }: { op: Opportunity }) {
  const sales = actorNames(op.saleOwners)
  const bds = actorNames(op.bdOwners)

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Người đứng đơn">
      <SectionTitle size="sm">Đứng đơn</SectionTitle>

      <div className="flex flex-col gap-2">
        <Kicker tone="muted">Sale đứng đơn</Kicker>
        <AvatarGroup names={sales} max={5} size="md" emptyLabel="chưa ai đứng đơn" />
      </div>

      <div className="flex flex-col gap-2">
        <Kicker tone="muted">BD mở cửa</Kicker>
        <AvatarGroup names={bds} max={5} size="md" emptyLabel="chưa ghi BD" />
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
  op: Opportunity
  lead: FrozenLead | null
  onOpenLead: () => void
}) {
  /* `lead` ở đây đến từ `frozenLeadBookQuery` (sổ ĐÓNG BĂNG) — màn cơ hội chưa
     cắt sang `GET /sales/leads/:code`, nên không có `LeadProfile` thật nào để
     đọc. `leadContact(lead)` vẫn đúng kịch bản ở ĐÚNG chỗ này vì sổ đóng băng
     không bao giờ chứa mã ngoài `LD-0101…LD-0200` (19 dòng Apollo thật không
     có mặt trong sổ này, nên không có cơ hội nào của chúng để lộ ra đây) — nợ
     này khác nợ đã vá ở `nextActions`, và chỉ hết khi màn cơ hội có endpoint
     hồ sơ lead thật để đọc. */
  const contact = lead ? leadContact(lead) : null
  const owner = actorNames(op.saleOwners)[0]
  const ownerActor = dasVina.actors.find((a) => a.name === owner)
  const ownerRole = ownerActor?.role

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
                {contact.name} · {contact.title}
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
              Chưa moi được người liên hệ — chưa gọi được cho ai.
            </span>
          )}
        </div>

        <Separator className="hidden h-8 w-px lg:block" />

        <div className="flex min-w-0 flex-col gap-1">
          <Kicker tone="muted">Sale đứng đơn</Kicker>
          {owner ? (
            <span className="flex items-center gap-2">
              <Avatar name={owner} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[12.5px] font-semibold">
                  {owner}
                  {ownerRole && (
                    <span className="text-muted-foreground font-normal"> · {ownerRole}</span>
                  )}
                </span>
                {/* Hòm thư công ty, cùng thứ hai cái sổ in ở cột người — ba màn
                    nói về một người thì phải nói cùng một mã. Đọc THẲNG
                    `ownerActor.email` — actor đã tra ở trên để lấy `ownerRole`
                    có sẵn hòm thư thật của chính nó, không cần đoán lại bằng
                    `staffEmail(name)`. */}
                <span className="text-muted-foreground truncate font-mono text-[10.5px]">
                  {ownerActor?.email ?? '—'}
                </span>
              </span>
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

          <Button size="md" onClick={onOpenLead} disabled={!lead}>
            <Icon icon={Users} size={16} />
            Hồ sơ lead · {op.leadCode}
          </Button>

          {/* Chỗ trống đúng bằng nút Trợ lý AI nổi (60px, `bottom-8 right-8` của
              AppShell) — không chừa thì nút đè lên đúng hành động cuối. */}
          <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
        </div>
      </GlassCard>
    </div>
  )
}

export default OpsDetailPage
