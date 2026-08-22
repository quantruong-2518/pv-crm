import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Inbox, Mail, Phone, Pin, TriangleAlert } from 'lucide-react'
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
  Kicker,
  MetaPill,
  SectionTitle,
  Separator,
  Skeleton,
} from '@pv/ui'
import {
  dasVina,
  isOverSla,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  leadContact,
  leadOrigin,
  PIPELINE_STAGES,
  staffEmail,
  type ExitReason,
  type Lead,
  type LeadTier,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useSession } from '@/app/session'
import { dm, dmy } from '@/lib/date'
import { leadBookQuery, ORIGIN_FACE, peopleOn } from '@/data/leads'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { AssignedPills, AssignMenu } from '@/components/assign-menu'
import { ConvertDialog, ConvertedCard } from '@/components/convert-dialog'
import { ExitDialog } from '@/components/exit-dialog'
import { ActivityCard, NextActionCard, NotesCard, ProfileCard } from './lead-parts'

/** Module 2 · Hồ sơ một lead — `/sales/leads/:code`.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ MỘT TRANG RIÊNG
 *  ------------------------------------------------------------------
 *  Hồ sơ này có một form ba mươi ô, một ô soạn tự do, một danh sách việc và cả
 *  dòng thời gian có nguyên văn. Nhét vào panel bên phải của sổ thì vừa bóp
 *  bảng còn 60% chiều rộng vừa bắt người dùng cuộn năm màn hình trong một cột
 *  hẹp. Danh sách và hồ sơ là hai việc khác nhau nên là hai trang khác nhau; sổ
 *  giữ đường quay lại ở góc trái trên.
 *
 *  ------------------------------------------------------------------
 *  BỐ CỤC — hai cột 3:1 (chốt 22/08, bản 3)
 *  ------------------------------------------------------------------
 *   0 · ĐẦU TRANG — tên account và trạng thái, rồi một hàng pill phân loại.
 *       Không còn nút nào ở đây: ghim và giao việc đã xuống thanh công cụ.
 *
 *   1 · CỘT CHÍNH (3 phần) — thứ người dùng SỬA, xếp theo thứ tự điền:
 *       hồ sơ lead → thông tin quan trọng → việc tiếp theo.
 *
 *   2 · CỘT PHỤ (1 phần) — thứ người dùng TRA: lead từ đâu về, ai đang cầm, và
 *       dòng thời gian đã gộp cả transcript vào trong.
 *
 *   3 · THANH CÔNG CỤ dính đáy — ai gọi cho ai bên trái, làm gì bên phải.
 *
 *  ------------------------------------------------------------------
 *  HAI THỨ ĐÃ GỠ, VÀ CÁI GIÁ CỦA CHÚNG
 *  ------------------------------------------------------------------
 *  · **Khối tóm tắt bốn ô** (đau ở đâu · tiền · ai quyết · cổng). Dựng ra để
 *    khỏi phải quét ba mươi ô nhập, nhưng khi cột chính chỉ còn 3/4 màn thì form
 *    đã tự đọc được, và khối tóm tắt thành một bản sao thứ hai của cùng bốn
 *    trường — hai chỗ hiện một dữ liệu là hai chỗ để lệch nhau.
 *
 *  · **ContextRail** (luật 10). Đây là NỢ LUẬT có ý thức, giống hệt nợ đã ghi ở
 *    `pages/leads.tsx`: bốn chip mã treo trên đầu hồ sơ không ai bấm, vì mã cơ
 *    hội và mã báo giá của lead này đã nằm trong cụm Sổ sách của chính form, ở
 *    đúng chỗ người ta đi tìm chúng. Rail quay lại khi nào có màn thật để nó mở
 *    sang — không sớm hơn.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. */

const TIER_TONE: Record<LeadTier, 'draft' | 'running' | 'success'> = {
  'dau-moi': 'draft',
  mql: 'running',
  sql: 'success',
}

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))
const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))

export function LeadDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: book = [], isPending } = useQuery(leadBookQuery)

  const me = useSession((s) => s.actor)
  const assigns = useLeadDesk((s) => s.assigns)
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)
  const savedName = useLeadDesk((s) => s.profiles[code]?.company)
  const deal = useLeadDesk((s) => s.deals[code])

  const [converting, setConverting] = useState(false)
  const [exiting, setExiting] = useState(false)
  /* Lý do vừa báo trong phiên này. Chưa có backend nên nó chết cùng lần mở màn
     — và đó là điều đúng: một đề nghị chưa ai gật thì chưa phải sự thật của sổ. */
  const [reported, setReported] = useState<ExitReason | null>(null)

  const lead = book.find((l) => l.code === code) ?? null

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

  if (!lead) {
    return shell(
      <GlassCard className="p-5 lg:p-6">
        <EmptyLead code={code} onBack={() => navigate('/sales/leads')} />
      </GlassCard>,
    )
  }

  const origin = leadOrigin(lead)
  const people = peopleOn(lead, assigns, dasVina.actors)
  /* Tên account đọc từ bản hồ sơ ĐÃ LƯU: sửa tên trong form thì đầu trang phải
     đổi theo, nếu không màn tự mâu thuẫn với chính ô nhập của nó. */
  const accountName = savedName ?? lead.company

  const openSource = () => navigate(`/sales/campaigns?source=${origin.code}`)

  return shell(
    <div className="flex flex-col gap-4 lg:gap-6">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => navigate('/sales/leads')}
        className="self-start"
      >
        <Icon icon={ArrowLeft} size={16} />
        Sổ lead
      </Button>

      {/* Dòng tên chỉ chở HAI thứ: tên account và trạng thái. Mọi nhãn phân
          loại — mã, bậc, ngành, tỉnh, cột — xuống hàng pill dưới. Bậc là một
          CÁCH XẾP LOẠI lead, trạng thái là lead ĐANG SỐNG HAY KHÔNG; để hai
          badge cạnh nhau trên dòng tên thì chúng đọc ra như một cặp cùng loại. */}
      <div className="flex min-w-0 flex-col gap-2">
        <Kicker>Account</Kicker>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">{accountName}</h2>
          <StatusBadge lead={lead} reported={reported} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{lead.code}</Chip>
          <Badge tone={TIER_TONE[lead.tier]}>{TIER_LABEL.get(lead.tier) ?? lead.tier}</Badge>
          <MetaPill>{CATEGORY_LABEL.get(lead.category) ?? lead.category}</MetaPill>
          <MetaPill>{lead.province}</MetaPill>
          <MetaPill mono>vào sổ {dmy(lead.createdAt)}</MetaPill>
          {lead.stage && (
            <MetaPill tone={isOverSla(lead) ? 'warning' : 'accent'}>
              {STAGE_LABEL.get(lead.stage)} · {lead.daysHere} ngày
            </MetaPill>
          )}
        </div>
      </div>

      <AssignedPills lead={lead} />
      <ConvertedCard lead={lead} />

      <div className="grid items-start gap-4 lg:grid-cols-[3fr_1fr] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <ProfileCard lead={lead} />
          <NotesCard lead={lead} />
          <NextActionCard lead={lead} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <OriginCard lead={lead} onOpen={openSource} />
          <PeopleCard lead={lead} people={people} />
          <ActivityCard lead={lead} />
        </div>
      </div>

      <ToolsBar
        lead={lead}
        pinned={pins.includes(lead.code)}
        converted={Boolean(deal)}
        reported={reported}
        onPin={() => me && togglePin(me.id, lead.code)}
        onExit={() => setExiting(true)}
        onConvert={() => setConverting(true)}
      />

      <ConvertDialog lead={lead} open={converting} onClose={() => setConverting(false)} />
      <ExitDialog
        lead={lead}
        open={exiting}
        onClose={() => setExiting(false)}
        onReport={setReported}
      />
    </div>,
  )
}

// ---------------------------------------------------------------------------

function EmptyLead({ code, onBack }: { code: string; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={Inbox} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">
        Sổ không có dòng nào mang mã <span className="font-mono">{code}</span>. Sổ là 100 dòng của
        kỳ 01/05 → 17/08; mã ngoài khoảng đó không tồn tại.
      </p>
      <Button size="sm" variant="ghost" onClick={onBack}>
        Về sổ lead
      </Button>
    </div>
  )
}

function StatusBadge({ lead, reported }: { lead: Lead; reported: ExitReason | null }) {
  if (lead.contractCode) return <Badge tone="success">Đã ký · {lead.contractCode}</Badge>
  if (lead.exitReason) return <Badge tone="danger">Đã rơi · {lead.exitReason}</Badge>
  if (reported) return <Badge tone="warning">Đã báo · {reported}</Badge>
  if (isOverSla(lead)) return <Badge tone="warning">Quá hạn cột</Badge>
  return <Badge tone="running">Đang chạy</Badge>
}

/** Lead này từ đâu về — bốn kiểu, bốn cách kể.
 *
 *  Chiến dịch và sự kiện mở được sang màn nguồn; hai kiểu tự nhiên vẫn mở được
 *  vì chúng CÓ mặt trong sổ nguồn — chỉ khác là chúng không có đợt nào để xem. */
function OriginCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const origin = leadOrigin(lead)
  const face = ORIGIN_FACE[origin.kind]
  const isEvent = origin.kind === 'su-kien'

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Lead đến từ đâu">
      <SectionTitle
        kicker="Đến từ"
        size="md"
        actions={
          <Button size="sm" variant="ghost" onClick={onOpen}>
            {face.openLabel}
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Icon icon={face.icon} size={18} className="text-accent-foreground" />
          {origin.label}
        </span>
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="source">{origin.code}</Chip>
        <MetaPill tone="accent">{face.label}</MetaPill>
        <MetaPill avatar={origin.owner}>{origin.owner}</MetaPill>
        <MetaPill mono>chạy từ {dm(origin.startedAt)}</MetaPill>
        {origin.channel && (
          <MetaPill icon={CHANNEL_ICON[origin.channel]}>{CHANNEL_LABEL[origin.channel]}</MetaPill>
        )}
      </div>

      {isEvent && (
        <div className="flex flex-wrap gap-3 rounded-md bg-white/5 p-3 text-[11.5px]">
          <span>{origin.venue}</span>
          <span>
            <span className="tnum font-num">{origin.checkedIn}</span>/
            <span className="tnum font-num">{origin.registered}</span> người đến trên số đăng ký
          </span>
        </div>
      )}
    </GlassCard>
  )
}

/** Ai đang làm việc trên lead này. Chủ lead và người được giao việc là HAI vai
 *  khác nhau — gộp vào một dòng là mất câu trả lời "ai chịu trách nhiệm". */
function PeopleCard({ lead, people }: { lead: Lead; people: string[] }) {
  return (
    <GlassCard className="flex flex-col gap-3 p-5 lg:p-6" aria-label="Người đang làm">
      <SectionTitle size="sm">Đang làm</SectionTitle>
      <AvatarGroup names={people} max={5} size="md" emptyLabel="chưa ai nhận" />
      <p className="text-[11.5px] leading-[1.5]">
        Người giữ:{' '}
        {lead.owner ? (
          <b className="font-semibold">{lead.owner}</b>
        ) : (
          <span className="text-muted-foreground">còn ở kho chung, chưa ai nhận</span>
        )}
      </p>
    </GlassCard>
  )
}

/** Thanh công cụ dính đáy — AI ở trái, LÀM GÌ ở phải.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO PIC ĐỨNG NGAY CẠNH KHÁCH
 *  ------------------------------------------------------------------
 *  Thanh này chia làm hai nửa theo câu hỏi nó trả lời, không theo loại
 *  component:
 *
 *   · nửa trái = **AI** — khách là ai (công ty + người liên hệ + số gọi được)
 *     và PIC bên mình là ai;
 *   · nửa phải = **LÀM GÌ** — hai nút giữ chỗ (ghim · giao việc), rồi ba nút
 *     hành động thật, nút chuyển cơ hội là nút đặc duy nhất.
 *
 *  PIC nằm ngay sau khối khách, TRƯỚC vạch ngăn, vì hai thứ đó là một cặp đọc
 *  cùng nhau: trước khi bấm gọi, người ta liếc "mình đang gọi cho ai" và "lead
 *  này đang đứng tên ai" — nếu không phải tên mình thì cuộc gọi đó là chen
 *  ngang. Đẩy PIC sang nửa phải là trộn một thông tin vào giữa các nút; đẩy
 *  xuống một khối riêng trong trang là bắt cuộn đi tìm đúng lúc sắp gọi.
 *
 *  Thanh DÍNH chứ không cố định tuyệt đối: nó ở trong luồng nội dung nên không
 *  đè lên sidebar, và dưới `lg` thì nhường chỗ cho BottomNav 84px của AppShell. */
function ToolsBar({
  lead,
  pinned,
  converted,
  reported,
  onPin,
  onExit,
  onConvert,
}: {
  lead: Lead
  pinned: boolean
  converted: boolean
  reported: ExitReason | null
  onPin: () => void
  onExit: () => void
  onConvert: () => void
}) {
  const contact = leadContact(lead)
  const ownerRole = dasVina.actors.find((a) => a.name === lead.owner)?.role

  return (
    <div className="sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-10 lg:bottom-0">
      <GlassCard
        variant="b"
        /* `backdrop-blur` là NGOẠI LỆ có lý do của glass-b: mặt kính b cố ý bỏ
           blur vì nó nằm trên một cái nền tĩnh (xem globals.css). Thanh này thì
           có NỘI DUNG TRÔI phía sau, và 16% lọt qua của --popover đủ để chữ bên
           dưới đội lên chữ của thanh. */
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
              {contact.channel && (
                <MetaPill icon={CHANNEL_ICON[contact.channel]} tone="accent">
                  {CHANNEL_LABEL[contact.channel]}
                </MetaPill>
              )}
            </div>
          ) : (
            <span className="text-warning text-[11.5px] leading-[1.5]">
              Chưa moi được người liên hệ — chưa gọi được cho ai.
            </span>
          )}
        </div>

        <Separator className="hidden h-8 w-px lg:block" />

        <div className="flex min-w-0 flex-col gap-1">
          <Kicker tone="muted">PIC của lead</Kicker>
          {lead.owner ? (
            <span className="flex items-center gap-2">
              <Avatar name={lead.owner} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[12.5px] font-semibold">
                  {lead.owner}
                  {ownerRole && (
                    <span className="text-muted-foreground font-normal"> · {ownerRole}</span>
                  )}
                </span>
                {/* Hòm thư công ty, cùng thứ sổ lead in ở cột Lead PIC — hai màn
                    nói về một người thì phải nói cùng một mã. */}
                <span className="text-muted-foreground truncate font-mono text-[10.5px]">
                  {staffEmail(lead.owner)}
                </span>
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-[11.5px]">
              Còn ở kho chung, chưa ai nhận
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Button
            size="md"
            variant={pinned ? 'default' : 'ghost'}
            aria-pressed={pinned}
            onClick={onPin}
          >
            <Icon icon={Pin} size={16} />
            {pinned ? 'Đã ghim' : 'Ghim'}
          </Button>
          <AssignMenu lead={lead} placement="up" />

          <Separator className="hidden h-8 w-px lg:block" />

          <Button
            size="md"
            variant="ghost"
            disabled={!contact?.phone}
            title={contact?.phone ?? 'Chưa moi được kênh gọi lại được'}
          >
            <Icon icon={Phone} size={16} />
            {contact ? `Gọi ${contact.name}` : 'Gọi PIC'}
          </Button>

          {(reported ?? lead.exitReason) ? (
            <Badge tone="warning">Đã báo · {reported ?? lead.exitReason}</Badge>
          ) : (
            <Button size="md" variant="destructive" onClick={onExit}>
              <Icon icon={TriangleAlert} size={16} />
              Lead có vấn đề
            </Button>
          )}

          {converted ? (
            <Badge tone="success">Đã đổi thành cơ hội</Badge>
          ) : (
            <Button size="md" onClick={onConvert}>
              <Icon icon={ArrowRight} size={16} />
              Chuyển thành cơ hội
            </Button>
          )}

          {/* Chỗ trống đúng bằng nút Trợ lý AI nổi (60px, `bottom-8 right-8` của
              AppShell). Thanh này chạm mép phải cùng chỗ với nút đó, nên không
              chừa thì nút đè lên đúng hành động cuối. */}
          <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
        </div>
      </GlassCard>
    </div>
  )
}

export default LeadDetailPage
