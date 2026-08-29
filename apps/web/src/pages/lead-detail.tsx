import { useState, type ReactNode } from 'react'
import { ArrowRight, Inbox, Lock, Mail, Phone, Pin, TriangleAlert, type IconGlyph } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  GlassCard,
  Icon,
  MetaPill,
  ScreenDetailGrid,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
} from '@pv/ui'
import {
  LEAD_CATEGORIES,
  LEAD_TIERS,
  PIPELINE_STAGES,
  type ExitReason,
  type Lead,
  type LeadTier,
} from '@pv/engines/fixtures/das-vina'
import { campaignLabel, sourceKindLabel, type LeadMotion, type LeadProfile } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { pinsOf, useLeadDesk } from '@/app/desk'
import { useCan, useSession } from '@/app/auth'
import { dmy } from '@/lib/date'
import { EXIT_REASON_LABEL, NO_OWNER_TITLE } from '@/data/leads'
import { leadOf, leadProfileQuery } from '@/data/lead-profile'
import { opportunitiesOfLeadQuery } from '@/data/opportunities'
import { AssignMenu } from '@/components/assign-menu'
import { ConvertDialog } from '@/components/convert-dialog'
import { DetailSidePanel } from '@/components/detail-side-panel'
import { ExitDialog } from '@/components/exit-dialog'
import { MeetingsCard } from '@/components/meetings-card'
import { MasMailModal } from '@/components/mas-mail-modal'
import { MailTimelineCard, NextActionCard, NotesCard, ProfileCard } from './lead-parts'

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
 *  BỐ CỤC — hai cột 3:2, HỒ SƠ trái · TÁC VỤ phải (chốt 29/08, bản 4)
 *  ------------------------------------------------------------------
 *  Bản 3 chia theo "sửa được / chỉ đọc". Sai trục: người mở một lead ra không
 *  hỏi "cái nào sửa được", họ hỏi "khách này là ai" rồi "giờ tôi làm gì". Nên
 *  bản 4 chia theo đúng hai câu đó: cuộc họp sang phải, còn nguồn lead nằm
 *  ngay dưới thông tin nhận diện để không tạo thêm một section tra cứu.
 *
 *   0 · ĐẦU TRANG — tên account và trạng thái, rồi một hàng pill phân loại.
 *       Không còn nút nào ở đây: ghim và giao việc đã xuống thanh công cụ.
 *
 *   1 · CỘT TRÁI (3 phần) — HỒ SƠ. Đúng một khối, và nó GẬP theo nhóm: nhóm
 *       nào còn ô bắt buộc trống thì mở, nhóm đã đủ thì gập kèm ✓. Ba mươi ô
 *       mở sẵn là lý do màn này bị kêu "nhiều quá"; xem `FieldGroup`.
 *
 *   2 · CỘT PHẢI (2 phần) — TÁC VỤ, xếp theo dòng quyết định:
 *       cuộc họp → mail MAS → đề xuất bước tiếp theo → ghi chú → tra cứu.
 *       Cột đi theo luồng cuộn của trang và chỉ bám đáy khi đã hiện trọn vẹn;
 *       không tạo thêm một thanh cuộn lồng khó điều khiển.
 *
 *   3 · THANH CÔNG CỤ dính đáy — ai gọi cho ai bên trái, làm gì bên phải.
 *
 *  Dưới `xl` về MỘT cột và cột phải lên TRƯỚC (`sideFirst`): trên tablet người
 *  ta mở một khách ra để làm việc, không phải để điền form.
 *
 *  Nợ phải biết: hai khối đứng ở vị trí trang trọng nhất cột phải — việc tiếp
 *  theo và ghi chú — vẫn đọc `app/desk.ts`, tức state trong trình duyệt, chưa
 *  có endpoint. Bố cục mới làm chúng trông như dữ liệu thật hơn trước, trong
 *  khi mở ở máy khác là mất. Chủ dự án đã được báo và chốt giữ nguyên vị trí.
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
 *  Năm khối còn nằm trên `app/desk.ts` (ghim · ghi chú · việc · giao việc ·
 *  báo rơi) chưa có endpoint nào, nên chúng giữ nguyên và đọc một bản `Lead`
 *  dựng từ hồ sơ thật — xem `leadOf` ở `data/lead-profile.ts`.
 *
 *  "Đã đổi thành cơ hội chưa" thì KHÔNG còn ở đó nữa (29/08): nó đọc
 *  `opportunitiesOfLeadQuery` — `GET /sales/opportunities?leadCode=…` — thay cho `opportunityOfLead`
 *  của fixture và cho `desk.deals`. Cả hai chống đỡ cũ đều mù: một cái không
 *  thấy lead tạo sau lát cắt đóng băng, một cái không thấy máy nào khác. */

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
  const canWrite = useCan('lead.sửa')
  /* Sổ người của máy chủ. Gọi TRƯỚC mọi nhánh `return` sớm bên dưới — màn này
     thoát ra ở ba chỗ (đang tải, lỗi, không thấy), và một hook nằm sau chúng
     là một hook chạy khi có lead mà không chạy khi không. */
  const pins = useLeadDesk((s) => pinsOf(s, me?.id))
  const togglePin = useLeadDesk((s) => s.togglePin)
  const savedName = useLeadDesk((s) => s.profiles[code]?.company)
  /* "Khách này đã được đổi thành cơ hội chưa" — hỏi MÁY CHỦ, cùng lý do hook
     phải nằm trên ba nhánh `return` sớm. Xem `opportunitiesOfLeadQuery`. */
  const priorOps = useQuery(opportunitiesOfLeadQuery(code))

  const [converting, setConverting] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [composing, setComposing] = useState(false)
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
  /* Tên account đọc từ bản hồ sơ ĐÃ LƯU: sửa tên trong form thì đầu trang phải
     đổi theo, nếu không màn tự mâu thuẫn với chính ô nhập của nó. */
  const accountName = savedName ?? lead.company
  const masRecipients =
    lead.contactName && lead.email
      ? [
          {
            code: lead.code,
            company: accountName,
            contactName: lead.contactName,
            contactTitle: lead.contactTitle,
            email: lead.email,
          },
        ]
      : []
  const masBlocker = !lead.email
    ? 'Lead chưa có địa chỉ email.'
    : !lead.contactName
      ? 'Lead chưa có người liên hệ.'
      : undefined

  /* Lead đã có một dòng trong sổ cơ hội thì mời đổi lần nữa là mời tạo đơn thứ
     hai cho cùng một khách, và sổ cơ hội cộng ra một con số không có thật. Nút
     đổi vì thế thành đường sang đúng đơn đó.

     Lấy dòng ĐẦU TIÊN máy chủ trả: một lead giữ được nhiều đơn, nhưng nút này
     chỉ có một chỗ để đi tới, và thứ tự của sổ là thứ tự máy chủ đã sắp — màn
     không sắp lại lần hai. */
  const existingOp = priorOps.data?.[0]
  const openOpCode = existingOp?.code

  /* CHƯA BIẾT thì KHÔNG MỜI ĐỔI. Lượt đọc chưa về — hoặc về bằng một lỗi — là
     đúng cái trạng thái mà bản cũ đọc nhầm thành "chưa có đơn nào", rồi mở đơn
     thứ hai. Nút vẫn đứng nguyên chỗ, chỉ tắt và nói vì sao; hai câu khác nhau
     vì hai đường đi tiếp khác nhau: một cái chờ là xong, một cái phải tải lại. */
  const opBlocker = priorOps.data
    ? undefined
    : priorOps.isPending
      ? 'Đang kiểm tra lead này đã có cơ hội chưa…'
      : 'Chưa đọc được sổ cơ hội nên chưa biết lead này đã có đơn chưa. Tải lại trang rồi thử lại.'

  return shell(
    <ScreenLayout>
      <GlassCard variant="b" className="p-4">
        {/* Dòng tên chỉ chở HAI thứ: tên account và trạng thái. Mọi nhãn phân
            loại — mã, bậc, ngành, tỉnh, cột — xuống hàng pill dưới. Bậc là một
            CÁCH XẾP LOẠI lead, trạng thái là lead ĐANG SỐNG HAY KHÔNG; để hai
            badge cạnh nhau trên dòng tên thì chúng đọc ra như một cặp cùng loại. */}
        {/* Trường VẮNG nghĩa là chưa moi được, không phải rỗng — nên chỗ nào
            chưa có thì in "—" chứ không bỏ pill đi: một hàng pill thiếu chỗ
            này thừa chỗ kia không đọc ra được là "chưa biết" hay "không có". */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:gap-6">
          <ScreenHeader
            back={{ label: 'Sổ lead', onClick: () => navigate('/sales/leads') }}
            title={accountName}
            className="gap-3 [&>div]:gap-3 [&_h2]:normal-case [&_h2]:tracking-[-.4px]"
            meta={
              <>
                <Chip>{lead.code}</Chip>
                {lead.tier && (
                  <Badge tone={TIER_TONE[lead.tier]}>
                    {TIER_LABEL.get(lead.tier) ?? lead.tier}
                  </Badge>
                )}
                {lead.category && (
                  <MetaPill>Ngành: {CATEGORY_LABEL.get(lead.category) ?? lead.category}</MetaPill>
                )}
                {lead.province && <MetaPill>Khu vực: {lead.province}</MetaPill>}
                <MetaPill mono>Tạo ngày {dmy(lead.createdAt)}</MetaPill>
              </>
            }
          />

          <div className="flex min-w-0 flex-col justify-end gap-4 border-t border-white/10 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge lead={lead} reported={reported} />
              {lead.stage && (
                <MetaPill tone={overSla(lead) ? 'warning' : 'accent'}>
                  {STAGE_LABEL.get(lead.stage)} · {lead.daysHere} ngày
                </MetaPill>
              )}
            </div>

            {/* PIC ĐỨNG TRÊN NGUỒN, và thứ tự đó là một quyết định.
                "Ai đang giữ" được hỏi mỗi lần mở hồ sơ — trước khi bấm gọi,
                người ta liếc xem lead này có phải của mình không, vì nếu không
                thì cuộc gọi đó là chen ngang. "Về bằng đường nào" thì tra một
                lần rồi thôi. Khối đọc nhiều hơn đứng trên.

                In `ownerName` — cái NHÃN. Hòm thư lui về `title` của pill,
                đúng như cột PIC của sổ lead (`components/table-bits.tsx`): hai
                màn của cùng một dòng dữ liệu phải in ra cùng một thứ, nếu
                không thì bảng nói một đằng hồ sơ nói một nẻo.

                Cả ba trường người giữ đến từ MỘT phép join ở máy chủ
                (`lead.repository.ts` · `leftJoin(actor, …)`), nên chúng luôn
                vắng cùng nhau — chỉ cần một nhánh trống, không cần ba. */}
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-muted-foreground text-[12.5px] font-semibold">Lead PIC</span>
              <div className="flex flex-wrap items-center gap-2">
                {lead.ownerName ? (
                  <MetaPill avatar={lead.ownerName} title={lead.ownerEmail}>
                    {lead.ownerName}
                  </MetaPill>
                ) : (
                  <MetaPill title={NO_OWNER_TITLE}>Chưa ai nhận</MetaPill>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-muted-foreground text-[12.5px] font-semibold">Nguồn lead</span>
              <div className="flex flex-wrap items-center gap-2">
                <MetaPill>{campaignLabel(lead.source)}</MetaPill>
                <Chip variant="source">{sourceKindLabel(lead.source)}</Chip>
                {lead.motion && <MetaPill>{LEAD_MOTION_LABEL[lead.motion]}</MetaPill>}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* HAI CỘT, HAI CÂU HỎI — bố cục chốt 29/08.
          Trái là HỒ SƠ ("khách này là ai"), phải là TÁC VỤ ("giờ tôi làm gì").
          Bản trước trộn hai thứ: hồ sơ và cuộc họp cùng bên trái, còn cột phải
          xếp lẫn thẻ tra cứu với thẻ thao tác.

          Giữ đúng grid chuẩn 3:1 của màn chi tiết. Grid và hai cột đều chiếm
          trọn chiều ngang khả dụng để các mép card luôn thẳng hàng. */}
      <ScreenDetailGrid
        sideLabel="Việc cần làm với lead này"
        className="w-full"
        sideClassName="relative xl:self-stretch"
        /* Dưới xl về một cột và TÁC VỤ lên trước: trên tablet người ta mở một
           khách ra để làm việc, không phải để điền form. */
        sideFirst
        main={<ProfileCard profile={lead} />}
        side={
          <DetailSidePanel>
            {/* Đọc dữ kiện trước khi quyết định: đã họp gì → email đang ở đâu →
                bước tiếp theo là gì. Ghi chú nằm sau luồng chính. */}
            <MeetingsCard code={lead.code} canEdit={canWrite} />
            <MailTimelineCard
              code={lead.code}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(masBlocker)}
                  title={masBlocker}
                  onClick={() => setComposing(true)}
                >
                  <Icon icon={Mail} size={16} />
                  Gửi mail
                </Button>
              }
            />
            <NextActionCard lead={legacy} />
            <NotesCard lead={legacy} />
          </DetailSidePanel>
        }
      />

      <ToolsBar
        lead={lead}
        legacy={legacy}
        pinned={pins.includes(lead.code)}
        opCode={openOpCode}
        opBlocker={opBlocker}
        onOpenOp={() => openOpCode && navigate(`/sales/opportunities/${openOpCode}`)}
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
      <MasMailModal
        open={composing}
        onClose={() => setComposing(false)}
        leads={masRecipients}
        initialLeadCode={masRecipients.length > 0 ? lead.code : undefined}
        defaultLabel={`Gửi mail · ${accountName}`}
        onQueued={() => setComposing(false)}
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
/** Thanh công cụ dính đáy — AI ở trái, LÀM GÌ ở phải.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO PIC ĐỨNG NGAY CẠNH KHÁCH
 *  ------------------------------------------------------------------
 *  Thanh này chia làm hai nửa theo câu hỏi nó trả lời, không theo loại
 *  component:
 *
 *   · nửa trái = **AI** — khách là ai (người liên hệ + chức danh);
 *   · nửa phải = **LÀM GÌ** — hai nút giữ chỗ (ghim · giao việc), rồi ba nút
 *     hành động thật, nút chuyển cơ hội là nút đặc duy nhất.
 *
 *  Nút cuối có BA mặt, không phải hai: lead đã có đơn trong sổ cơ hội thì nó là
 *  đường SANG đơn đó, không phải lời mời đổi lần nữa (23/08); và trong lúc sổ
 *  chưa trả lời thì nó TẮT kèm lý do. Mặt thứ ba mới là mặt quan trọng — mời
 *  đổi khi chưa biết là đúng cách mở đơn thứ hai cho một khách đã có đơn.
 *
 *  PIC KHÔNG nằm ở đây, nó nằm trên khối nhận diện ở đầu trang. Bản cũ định
 *  đặt nó cạnh khối khách trong chính thanh này, với lý do đúng — trước khi
 *  bấm gọi người ta liếc "mình gọi cho ai" và "lead này của ai", vì nếu không
 *  phải tên mình thì cuộc gọi đó là chen ngang. Cái sai là CHỖ: nửa trái của
 *  thanh này `hidden lg:flex`, nên đặt PIC vào đây là giấu nó khỏi tablet và
 *  điện thoại, đúng hai thiết bị luật 3 bắt phải chạy được. Khối đầu trang
 *  hiện ở cả ba cỡ và vẫn nằm trong tầm mắt lúc quyết định gọi.
 *
 *  Thanh DÍNH chứ không cố định tuyệt đối: nó ở trong luồng nội dung nên không
 *  đè lên sidebar, và dưới `lg` thì nhường chỗ cho BottomNav 84px của AppShell. */
function ToolsBar({
  lead,
  legacy,
  pinned,
  opCode,
  opBlocker,
  reported,
  onPin,
  onExit,
  onConvert,
  onOpenOp,
}: {
  lead: LeadProfile
  /** Hình `Lead` của fixture. `AssignMenu` nhận nó CHỈ để `assigneeOptions`
   *  xếp thứ tự gợi ý người nhận — phép ghi của khối đó đã cắt sang máy chủ và
   *  đọc mọi giá trị từ `lead` (hồ sơ trên dây), không từ hình này. */
  legacy: Lead
  pinned: boolean
  /** Mã cơ hội lead này ĐÃ có trong sổ, nếu có. */
  opCode?: string
  /** Vì sao CHƯA mời đổi được — sổ cơ hội chưa trả lời. Vắng = đã biết chắc
   *  lead này chưa có đơn nào. */
  opBlocker?: string
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
  /* Máy chủ trả KHOÁ lý do rơi (`khong-goi-duoc`); màn in NHÃN. */
  const exitLabel = lead.exitReason
    ? (EXIT_REASON_LABEL[lead.exitReason] ?? lead.exitReason)
    : undefined
  return (
    <div className="z-10 lg:sticky lg:bottom-4">
      <GlassCard
        variant="b"
        className="bg-hc-surface shadow-panel grid gap-3 p-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center"
        aria-label="Thanh công cụ"
      >
        <div className="hidden min-w-0 max-w-[320px] flex-col gap-1 lg:flex">
          <span className="text-muted-foreground text-[12px]">Liên hệ</span>
          <span className="truncate text-[13px] font-semibold">
            {contactLine || 'Chưa có người liên hệ'}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex flex-wrap items-center gap-1 rounded-md bg-white/5 p-1">
            <Button
              size="md"
              variant={pinned ? 'default' : 'ghost'}
              aria-pressed={pinned}
              onClick={onPin}
            >
              <Icon icon={Pin} size={16} />
              {pinned ? 'Đã ghim' : 'Ghim'}
            </Button>
            <AssignMenu lead={legacy} profile={lead} buttonVariant="secondary" />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md bg-white/5 p-1">
            <Button
              size="md"
              variant="secondary"
              disabled={!lead.phone}
              title={lead.phone ?? 'Chưa có số điện thoại'}
              onClick={() => {
                if (lead.phone) window.location.href = `tel:${lead.phone}`
              }}
            >
              <Icon icon={Phone} size={16} />
              {lead.contactName ? `Gọi ${lead.contactName}` : 'Gọi khách'}
            </Button>

            {(reported ?? exitLabel) ? (
              <Badge tone="warning">Đã báo · {reported ?? exitLabel}</Badge>
            ) : (
              <Button size="md" variant="destructive" onClick={onExit}>
                <Icon icon={TriangleAlert} size={16} />
                Báo không phù hợp
              </Button>
            )}

            {opCode ? (
              <Button size="md" onClick={onOpenOp}>
                <Icon icon={ArrowRight} size={16} />
                Cơ hội {opCode}
              </Button>
            ) : (
              <Button size="md" disabled={Boolean(opBlocker)} title={opBlocker} onClick={onConvert}>
                <Icon icon={ArrowRight} size={16} />
                Chuyển thành cơ hội
              </Button>
            )}
          </div>

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
