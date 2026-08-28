import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Inbox,
  Lock,
  Mail,
  Megaphone,
  Phone,
  Pin,
  TriangleAlert,
  type IconGlyph,
} from '@pv/ui'
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
  ScreenDetailGrid,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  Separator,
  Skeleton,
} from '@pv/ui'
import {
  LEAD_CATEGORIES,
  LEAD_TIERS,
  opportunityOfLead,
  PIPELINE_STAGES,
  type ExitReason,
  type Lead,
  type LeadTier,
} from '@pv/engines/fixtures/das-vina'
import { campaignLabel, sourceKindLabel, type LeadMotion, type LeadProfile } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useSession } from '@/app/auth'
import { dmy } from '@/lib/date'
import { useDirectory } from '@/data/directory'
import { EXIT_REASON_LABEL, NO_CAMPAIGN_ICON, peopleOn } from '@/data/leads'
import {
  leadOf,
  leadProfileQuery,
  realContact,
  NO_TOUCHES,
  NO_TRANSCRIPT,
} from '@/data/lead-profile'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import { AssignedPills, AssignMenu } from '@/components/assign-menu'
import { ConvertDialog, ConvertedCard } from '@/components/convert-dialog'
import { ExitDialog } from '@/components/exit-dialog'
import {
  ActivityCard,
  MailTimelineCard,
  NextActionCard,
  NotesCard,
  ProfileCard,
} from './lead-parts'

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
 *  ------------------------------------------------------------------
 *  HỒ SƠ ĐỌC TỪ MÁY CHỦ · `GET /sales/leads/:code`
 *  ------------------------------------------------------------------
 *  Màn không còn tra lead trong sổ đóng băng. Đường tra cũ (`find()` trên 100
 *  dòng fixture) trả `null` cho mọi mã ngoài `LD-0101…LD-0200`, nên sau khi sổ
 *  cắt sang máy chủ thì bấm bất kỳ dòng nào của trang 1 cũng rơi vào nhánh
 *  rỗng — một cái thẻ bé xíu trông như màn trắng.
 *
 *  Bốn ca, bốn câu khác nhau, vì bốn ca là bốn việc phải làm tiếp khác nhau:
 *   · **đang tải** — khung xương, y như trước;
 *   · **404** — không có lead nào mang mã đó (câu riêng của màn này, vì chỉ màn
 *     này biết thứ không tìm thấy là một mã lead người dùng vừa bấm);
 *   · **403 `ngoài-phạm-vi`** — lead CÓ THẬT, chỉ là không thuộc phạm vi người
 *     đang xem. Câu chung ở `app/api/errors.ts` chỉ đúng một đường đi tiếp:
 *     hỏi người đang giữ nó. Không phải đăng nhập lại, không phải xin thêm
 *     quyền — họ đã có `lead.xem` rồi;
 *   · **còn lại** (mạng · máy chủ · mã sai dạng) — câu chung của loại lỗi đó.
 *
 *  Sáu khối còn nằm trên `app/desk.ts` (ghim · ghi chú · việc · giao việc ·
 *  chuyển đổi · báo rơi) chưa có endpoint nào, nên chúng giữ nguyên và đọc một
 *  bản `Lead` dựng từ hồ sơ thật — xem `leadOf` ở `data/lead-profile.ts`. */

const TIER_TONE: Record<LeadTier, 'draft' | 'running' | 'success'> = {
  'dau-moi': 'draft',
  mql: 'running',
  sql: 'success',
}

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))
const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))
const STAGE_LIMIT = new Map(PIPELINE_STAGES.map((s) => [s.key, s.limitDays]))

/** Vietnamese labels for the two intake fields `OriginCard` draws, keyed by
 *  the exact UPPERCASE wire values from `@pv/contracts` — not looked up
 *  through `MOTION_FACE` / `INTAKE_FACE` in `data/intake.ts`.
 *
 *  Those two tables are the wrong door for this:
 *   · `MOTION_FACE` is keyed by `@pv/engines`'s `LEAD_MOTIONS`, the SAME six
 *     motions spelled lower-case (`inbound`, …) — a second declaration of one
 *     vocabulary, called out as known debt on `LeadMotion` in
 *     `packages/contracts/src/sales/enums.ts`. Reading through it here would
 *     open a third conversion site for that one enum, which is the exact
 *     thing that docblock says must not happen.
 *   · `INTAKE_FACE` is keyed by the older, five-value `LeadIntake` axis
 *     (`dong-bo` / `tay` / `tep` / `quet` / `api`), not by `LeadSourceKind`
 *     (`MANUAL` / `IMPORT` / `APOLLO` / `LANDING_PAGE`). The two axes are
 *     related but not a 1:1 map — `dong-bo` and `quet` have no counterpart in
 *     the stored enum, and `APOLLO` has none in the engine copy — so a lookup
 *     through it would either miss keys or fabricate a mapping that isn't
 *     true. The origin half no longer needs a table on this page at all:
 *     `sourceKindLabel` in `@pv/contracts` is the one both ends read.
 *
 *  `Record<…, string>` on the CONTRACT's own enum type, so a value the
 *  contract adds later and this table forgets is a compile error, not a
 *  silent fallback to the raw wire string. */
const LEAD_MOTION_LABEL: Record<LeadMotion, string> = {
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
  EVENT: 'Sự kiện',
  REFERRAL: 'Giới thiệu',
  PARTNER: 'Đối tác',
  RECYCLE: 'Đánh thức lại',
}

/** Quá hạn cột. Bản cũ gọi `isOverSla` của fixture, thứ đòi nguyên một `Lead`;
 *  hồ sơ nay là `LeadProfile` và chỉ chở hai ô cần thiết — cùng phép tính,
 *  cùng bảng hạn, không phải dựng một dòng sổ giả để hỏi một câu hai trường.
 *  (Cùng nước đi `pages/leads.tsx` đã làm cho dòng sổ.) */
function overSla(lead: LeadProfile): boolean {
  if (!lead.stage) return false
  return lead.daysHere > (STAGE_LIMIT.get(lead.stage) ?? Infinity)
}

export function LeadDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: lead, isPending, error } = useQuery(leadProfileQuery(code))

  const me = useSession((s) => s.actor)
  /* Sổ người của máy chủ. Gọi TRƯỚC mọi nhánh `return` sớm bên dưới — màn này
     thoát ra ở ba chỗ (đang tải, lỗi, không thấy), và một hook nằm sau chúng
     là một hook chạy khi có lead mà không chạy khi không. */
  const staff = useDirectory()
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

  if (!lead) {
    /* Một `kind`, một câu. Màn không đọc `status` số và không bắt chuỗi trong
       `message` — `app/api/errors.ts` đã phân loại một lần cho cả app, và hai
       màn tự đọc lấy một mã lỗi là hai câu khác nhau cho cùng một sự cố. */
    const failure = isApiError(error) ? error : null
    const missing = failure?.kind === 'không-thấy'
    const denied = failure?.kind === 'thiếu-quyền'

    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyLead
            icon={missing ? Inbox : denied ? Lock : TriangleAlert}
            note={
              missing ? (
                <>
                  Không tìm thấy lead nào mang mã <span className="font-mono">{code}</span>. Kiểm
                  tra lại mã, hoặc mở lại từ sổ lead.
                </>
              ) : (
                (failure && userMessage(failure)) || 'Không đọc được hồ sơ lead này.'
              )
            }
            onBack={() => navigate('/sales/leads')}
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  /* Sáu khối trên `app/desk.ts` vẫn đọc hình `Lead` của fixture — dựng MỘT bản
     ở đây thay vì để mỗi khối tự quy đổi lấy. */
  const legacy = leadOf(lead)
  /* Người liên hệ THẬT trên dây — KHÔNG phải `leadContact(legacy)`. Trước đây
     `nextActions` tự gọi hàm sinh đó bên trong, và với một mã ngoài dải đóng
     băng (Apollo) nó nặn ra một cái tên và một số điện thoại không có thật. */
  const contact = realContact(lead)
  const people = peopleOn(legacy, assigns, staff)
  /* Tên account đọc từ bản hồ sơ ĐÃ LƯU: sửa tên trong form thì đầu trang phải
     đổi theo, nếu không màn tự mâu thuẫn với chính ô nhập của nó. */
  const accountName = savedName ?? lead.company

  /* Gated on the CAMPAIGN id, not on `source`: `source` is now an object and
     is always present, so `if (lead.source)` would be true for every lead and
     the button would offer to open a campaign that is not there. */
  const openSource = () => {
    const id = lead.source.campaignId
    if (id) navigate(`/sales/campaigns?campaign=${encodeURIComponent(id)}`)
  }

  /* Lead đã lên SQL thì nó ĐÃ có một dòng trong sổ cơ hội — mời đổi lần nữa là
     mời tạo đơn thứ hai cho cùng một khách, và sổ cơ hội cộng ra một con số
     không có thật. Nút đổi vì thế thành đường sang đúng đơn đó. */
  const existingOp = opportunityOfLead(lead.code)

  return shell(
    <ScreenLayout>
      <GlassCard className="flex flex-col gap-4 p-4 sm:p-5 lg:p-6">
        {/* Dòng tên chỉ chở HAI thứ: tên account và trạng thái. Mọi nhãn phân
            loại — mã, bậc, ngành, tỉnh, cột — xuống hàng pill dưới. Bậc là một
            CÁCH XẾP LOẠI lead, trạng thái là lead ĐANG SỐNG HAY KHÔNG; để hai
            badge cạnh nhau trên dòng tên thì chúng đọc ra như một cặp cùng loại. */}
        {/* Trường VẮNG nghĩa là chưa moi được, không phải rỗng — nên chỗ nào
            chưa có thì in "—" chứ không bỏ pill đi: một hàng pill thiếu chỗ
            này thừa chỗ kia không đọc ra được là "chưa biết" hay "không có". */}
        <ScreenHeader
          back={{ label: 'Sổ lead', onClick: () => navigate('/sales/leads') }}
          kicker="Account"
          title={accountName}
          meta={
            <>
              <StatusBadge lead={lead} reported={reported} />
              <Chip>{lead.code}</Chip>
              {lead.tier ? (
                <Badge tone={TIER_TONE[lead.tier]}>{TIER_LABEL.get(lead.tier) ?? lead.tier}</Badge>
              ) : (
                <Badge tone="draft">—</Badge>
              )}
              <MetaPill>
                {lead.category ? (CATEGORY_LABEL.get(lead.category) ?? lead.category) : '—'}
              </MetaPill>
              <MetaPill>{lead.province ?? '—'}</MetaPill>
              <MetaPill mono>vào sổ {dmy(lead.createdAt)}</MetaPill>
              {lead.stage && (
                <MetaPill tone={overSla(lead) ? 'warning' : 'accent'}>
                  {STAGE_LABEL.get(lead.stage)} · {lead.daysHere} ngày
                </MetaPill>
              )}
            </>
          }
        />

        <AssignedPills lead={legacy} />
        <ConvertedCard lead={legacy} />
      </GlassCard>

      <ScreenDetailGrid
        sideLabel="Ngữ cảnh lead"
        main={
          <>
            <ProfileCard profile={lead} />
            <NextActionCard lead={legacy} contact={contact} />
            <NotesCard lead={legacy} />
          </>
        }
        side={
          <>
            <OriginCard lead={lead} onOpen={openSource} />
            <PeopleCard lead={lead} people={people} />
            {/* TRƯỚC `ActivityCard`, và thứ tự đó là một quyết định: thẻ này
              cụ thể hơn — đúng những lá thư đã gửi cho đúng người này — còn
              dòng thời gian bên dưới là dòng chảy chung của lead. Câu người mở
              hồ sơ hỏi trước khi viết thêm một lá nữa là "mình đã viết cho họ
              mấy lần rồi". */}
            <MailTimelineCard code={lead.code} />
            {/* Máy chủ chưa có bảng lần chạm — hai hằng NÓI RA điều đó, thay vì
              một `[]` gõ tại chỗ đọc ra như "lead này chưa ai chạm". */}
            <ActivityCard code={lead.code} history={NO_TOUCHES} turns={NO_TRANSCRIPT} />
          </>
        }
      />

      <ToolsBar
        lead={lead}
        legacy={legacy}
        pinned={pins.includes(lead.code)}
        converted={Boolean(deal)}
        opCode={existingOp?.code}
        onOpenOp={() => existingOp && navigate(`/sales/ops/${existingOp.code}`)}
        reported={reported}
        onPin={() => me && togglePin(me.id, lead.code)}
        onExit={() => setExiting(true)}
        onConvert={() => setConverting(true)}
      />

      {/* Hồ sơ TRÊN DÂY, không phải `legacy`: phiếu đổi mồi từ hồ sơ thật chứ
          không sinh lại hồ sơ từ mã lead — xem docblock của `ConvertDialog`. */}
      <ConvertDialog profile={lead} open={converting} onClose={() => setConverting(false)} />
      <ExitDialog
        lead={legacy}
        open={exiting}
        onClose={() => setExiting(false)}
        onReport={setReported}
      />
    </ScreenLayout>,
  )
}

// ---------------------------------------------------------------------------

/** Màn không mở được — MỘT khối, ba câu, và cái hình đổi theo câu.
 *
 *  Một component cho cả ba vì cả ba là cùng một trạng thái của màn ("không có
 *  hồ sơ để vẽ") và cùng một đường đi tiếp ("về sổ lead"). Cái khác nhau là
 *  CÂU, và câu là thứ được truyền vào — chứ không phải ba khối rỗng gần giống
 *  nhau, thứ chắc chắn sẽ trôi khỏi nhau ở lần sửa thứ hai. */
function EmptyLead({
  icon,
  note,
  onBack,
}: {
  icon: IconGlyph
  note: ReactNode
  onBack: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={icon} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">{note}</p>
      <Button size="sm" variant="ghost" onClick={onBack}>
        Về sổ lead
      </Button>
    </div>
  )
}

/** Trạng thái của lead — bốn nhánh, và nhánh đầu KHÔNG còn mã hợp đồng.
 *
 *  Trước đây badge in "Đã ký · HĐ-2711". Mã đó đến từ `lead.contractCode` của
 *  fixture, và cột ấy không còn: lead → hợp đồng nay là 1-n nên không cột nào
 *  gọi tên được "cái" hợp đồng. Thứ sống sót là `signed`, một boolean — nên
 *  badge giữ TRẠNG THÁI và bỏ mã, thay vì bịa một mã hoặc kéo mã cũ của
 *  fixture đi theo. Mã quay lại ngày hồ sơ chở một DANH SÁCH cơ hội. */
function StatusBadge({ lead, reported }: { lead: LeadProfile; reported: ExitReason | null }) {
  if (lead.signed) return <Badge tone="success">Đã ký</Badge>
  if (lead.exitReason) {
    return (
      <Badge tone="danger">Đã rơi · {EXIT_REASON_LABEL[lead.exitReason] ?? lead.exitReason}</Badge>
    )
  }
  if (reported) return <Badge tone="warning">Đã báo · {reported}</Badge>
  if (overSla(lead)) return <Badge tone="warning">Quá hạn cột</Badge>
  return <Badge tone="running">Đang chạy</Badge>
}

/** Lead này từ đâu về — TRA TỪ SỔ NGUỒN THẬT.
 *
 *  ------------------------------------------------------------------
 *  BỐN PILL ĐÃ RỤNG, VÀ VÌ SAO KHÔNG LẤP LẠI
 *  ------------------------------------------------------------------
 *  Bản cũ gọi `leadOrigin(lead)` của fixture: nó tra mã nguồn trong `SOURCES`
 *  và **ném** khi không thấy — mà 119 dòng trên Neon trỏ vào mã của sổ nguồn
 *  thật (`SR-…`), không phải mã fixture. Giữ nó là mở lead nào cũng vỡ màn.
 *
 *  Hồ sơ chở `source` — một OBJECT hai nửa — nên chỗ này không còn tra cứu gì
 *  nữa: tên chiến dịch đi kèm mã ngay trên dây (`campaignName`), nhãn của loại
 *  xuất xứ lấy từ bảng dùng chung với máy chủ. Trước đây khối này phải tự gọi
 *  `GET /sales/config` rồi dựng một `Map` để đổi mã lấy tên; cái `useQuery` đó
 *  đã đi cùng với phép tra.
 *
 *  Cái gì KHÔNG có đường về thì vẫn thôi, không đoán: chủ nguồn, ngày bắt đầu
 *  chạy, kênh của đợt, và khối địa điểm/số người đến của sự kiện đều là dữ
 *  liệu của fixture chiến dịch, không có trong hợp đồng này. Vẽ lại chúng bằng
 *  giá trị suy đoán là đúng thứ một màn hồ sơ không được phép làm.
 *
 *  `campaignLabel` chọn giữa BA trạng thái — có tên · không thuộc chiến dịch ·
 *  có mã mà tra không ra. Hai cái sau trông giống nhau trên màn nếu gộp làm
 *  một, mà chúng là hai vấn đề ngược nhau: một cái bình thường, một cái nghĩa
 *  là có dòng đang trỏ vào chỗ trống. */
function OriginCard({ lead, onOpen }: { lead: LeadProfile; onOpen: () => void }) {
  const campaign = lead.source.campaignName

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5" aria-label="Lead đến từ đâu">
      <SectionTitle
        kicker="Đến từ"
        size="md"
        actions={
          lead.source.campaignId ? (
            <Button size="sm" variant="ghost" onClick={onOpen}>
              Xem nguồn
            </Button>
          ) : undefined
        }
      >
        <span className="flex items-center gap-2">
          <Icon
            icon={campaign ? Megaphone : NO_CAMPAIGN_ICON}
            size={18}
            className="text-accent-foreground"
          />
          {campaignLabel(lead.source)}
        </span>
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        {/* The origin KIND, in words. This chip used to print `lead.source`
            raw — which was the bare `SR-09` catalogue key, because back then
            the field held nothing else. Both halves now arrive named:
            `campaignName` above, `sourceKindLabel` here, one table shared with
            the server (`@pv/contracts`) so the book and this card cannot end
            up calling one value two things. */}
        <Chip variant="source">{sourceKindLabel(lead.source)}</Chip>
        {/* The other axis, never folded into the chip beside it (see
            `LeadMotion`'s docblock on why joining axes makes both
            unfilterable). Renders only when present: the 100 legacy fixture
            rows predate the server having an intake concept at all, so it is
            absent there, while the Apollo import rows (`LD-0201…`) carry it.
            Absent means "not dug out", not a value to guess at. */}
        {lead.motion && <MetaPill>{LEAD_MOTION_LABEL[lead.motion]}</MetaPill>}
      </div>
    </GlassCard>
  )
}

/** Ai đang làm việc trên lead này. Chủ lead và người được giao việc là HAI vai
 *  khác nhau — gộp vào một dòng là mất câu trả lời "ai chịu trách nhiệm".
 *
 *  In `ownerName` — cái NHÃN. Không có ai đứng tên thì `ownerId` cũng vắng, và
 *  hai thứ đó luôn vắng cùng nhau vì cả ba trường người giữ đến từ một phép
 *  join duy nhất ở máy chủ. */
function PeopleCard({ lead, people }: { lead: LeadProfile; people: string[] }) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-5" aria-label="Người đang làm">
      <SectionTitle size="sm">Đang làm</SectionTitle>
      <AvatarGroup names={people} max={5} size="md" emptyLabel="chưa ai nhận" />
      <p className="text-[11.5px] leading-[1.5]">
        Người giữ:{' '}
        {lead.ownerName ? (
          <b className="font-semibold">{lead.ownerName}</b>
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
 *  Nút cuối đổi mặt theo trạng thái: lead đã có đơn trong sổ cơ hội thì nó là
 *  đường SANG đơn đó, không phải lời mời đổi lần nữa (23/08).
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
  legacy,
  pinned,
  converted,
  opCode,
  reported,
  onPin,
  onExit,
  onConvert,
  onOpenOp,
}: {
  lead: LeadProfile
  /** Hình `Lead` của fixture, chỉ để đưa cho `AssignMenu` — khối giao việc còn
   *  nằm trên `app/desk.ts` và chưa có endpoint nào để cắt sang. */
  legacy: Lead
  pinned: boolean
  converted: boolean
  /** Mã cơ hội lead này ĐÃ có trong sổ, nếu có. */
  opCode?: string
  reported: ExitReason | null
  onPin: () => void
  onExit: () => void
  onConvert: () => void
  onOpenOp: () => void
}) {
  /* Người liên hệ đọc THẲNG từ hồ sơ. Bản cũ gọi `leadContact(lead)`, một hàm
     SINH tên và số điện thoại từ mã lead — tất định, khớp với 100 dòng đóng
     băng, và bịa ra một con người cho mọi mã ngoài khoảng đó. Bốn trường thật
     đã có trên dây, nên không còn lý do gì để đoán. */
  const contactLine = lead.contactTitle
    ? `${lead.contactName} · ${lead.contactTitle}`
    : lead.contactName
  /* Vai của người giữ tra bằng ID, không bằng TÊN. Tên trùng nhau và đổi khi
     người ta cưới xin; `ownerId` là thứ duy nhất được phép đem đi so. */
  const ownerRole = useDirectory().find((a) => a.id === lead.ownerId)?.role
  /* Máy chủ trả KHOÁ lý do rơi (`khong-goi-duoc`); màn in NHÃN. */
  const exitLabel = lead.exitReason
    ? (EXIT_REASON_LABEL[lead.exitReason] ?? lead.exitReason)
    : undefined
  /* Người liên hệ THẬT cho `AssignMenu` — cùng lý do đã ghi ở `contact` của
     component cha; xem docblock của `nextActions` (`data/leads.ts`). */
  const contact = realContact(lead)

  return (
    <div className="z-10 lg:sticky lg:bottom-4">
      <GlassCard
        variant="b"
        /* `backdrop-blur` là NGOẠI LỆ có lý do của glass-b: mặt kính b cố ý bỏ
           blur vì nó nằm trên một cái nền tĩnh (xem globals.css). Thanh này thì
           có NỘI DUNG TRÔI phía sau, và 16% lọt qua của --popover đủ để chữ bên
           dưới đội lên chữ của thanh. */
        className="shadow-panel grid gap-4 p-4 backdrop-blur-xl xl:grid-cols-[minmax(280px,1.4fr)_1px_minmax(180px,.6fr)_auto] xl:items-center"
        aria-label="Thanh công cụ"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <Kicker tone="muted">Khách</Kicker>
          {lead.contactName ? (
            <div className="flex flex-wrap items-center gap-2">
              <MetaPill avatar={lead.contactName}>{contactLine}</MetaPill>
              {lead.phone && (
                <MetaPill icon={Phone} mono>
                  {lead.phone}
                </MetaPill>
              )}
              {lead.email && <MetaPill icon={Mail}>{lead.email}</MetaPill>}
              {lead.contactChannel && (
                <MetaPill icon={CHANNEL_ICON[lead.contactChannel]} tone="accent">
                  {CHANNEL_LABEL[lead.contactChannel]}
                </MetaPill>
              )}
            </div>
          ) : (
            <span className="text-warning text-[11.5px] leading-[1.5]">
              Chưa moi được người liên hệ — chưa gọi được cho ai.
            </span>
          )}
        </div>

        <Separator className="hidden h-8 w-px xl:block" />

        <div className="flex min-w-0 flex-col gap-1">
          <Kicker tone="muted">PIC của lead</Kicker>
          {lead.ownerName ? (
            <span className="flex items-center gap-2">
              <Avatar name={lead.ownerName} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[12.5px] font-semibold">
                  {lead.ownerName}
                  {ownerRole && (
                    <span className="text-muted-foreground font-normal"> · {ownerRole}</span>
                  )}
                </span>
                {/* Hòm thư công ty, cùng thứ sổ lead in ở cột Lead PIC — hai màn
                    nói về một người thì phải nói cùng một mã. Đọc `ownerEmail`
                    của máy chủ chứ không suy từ tên: `staffEmail(name)` là một
                    quy ước đặt tên của fixture, và đoán sai ở đây là một lá thư
                    gửi vào một hòm không tồn tại. */}
                <span className="text-muted-foreground truncate font-mono text-[10.5px]">
                  {lead.ownerEmail ?? '—'}
                </span>
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-[11.5px]">
              Còn ở kho chung, chưa ai nhận
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
          <Button
            size="md"
            variant={pinned ? 'default' : 'ghost'}
            aria-pressed={pinned}
            onClick={onPin}
          >
            <Icon icon={Pin} size={16} />
            {pinned ? 'Đã ghim' : 'Ghim'}
          </Button>
          <AssignMenu lead={legacy} contact={contact} placement="up" />

          <Separator className="hidden h-8 w-px lg:block" />

          <Button
            size="md"
            variant="ghost"
            disabled={!lead.phone}
            title={lead.phone ?? 'Chưa moi được kênh gọi lại được'}
          >
            <Icon icon={Phone} size={16} />
            {lead.contactName ? `Gọi ${lead.contactName}` : 'Gọi PIC'}
          </Button>

          {(reported ?? exitLabel) ? (
            <Badge tone="warning">Đã báo · {reported ?? exitLabel}</Badge>
          ) : (
            <Button size="md" variant="destructive" onClick={onExit}>
              <Icon icon={TriangleAlert} size={16} />
              Lead có vấn đề
            </Button>
          )}

          {opCode ? (
            <Button size="md" onClick={onOpenOp}>
              <Icon icon={ArrowRight} size={16} />
              Cơ hội {opCode}
            </Button>
          ) : converted ? (
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
