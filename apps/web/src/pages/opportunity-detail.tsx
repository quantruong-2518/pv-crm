import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Check,
  Handshake,
  Inbox,
  Lock,
  Mail,
  Phone,
  RotateCcw,
  TriangleAlert,
  Users,
  type IconGlyph,
} from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  Chip,
  ContextRail,
  FlowVector,
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
  StageTrack,
  Separator,
  Skeleton,
  Textarea,
  billions,
  cn,
} from '@pv/ui'
import {
  campaignLabel,
  OPPORTUNITY_DESCRIPTION_MAX,
  OPPORTUNITY_NAME_MAX,
  type LeadProfile,
  type OpportunityProfileResponse,
  type OpportunityRow,
  type OpportunityState,
} from '@pv/contracts'
import { PIPELINE_STAGES, toMoneyVnd, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import { isApiError, userMessage, type FieldErrors } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dm, dmy } from '@/lib/date'
import { leadProfileQuery, realContact, NO_TOUCHES } from '@/data/lead-profile'
import {
  NO_STEPS,
  opportunityTouchesQuery,
  opportunityVectorQuery,
  type TouchFocus,
} from '@/data/touches'
import {
  bdOwnersOf,
  isLateClose,
  missingOf,
  namesOf,
  opportunityProfileQuery,
  railOf,
  saleOwnersOf,
  stageTrackOf,
  STATE_TONE,
  toggled,
} from '@/data/opportunities'
import {
  CREATE_STATES,
  draftErrorsOf,
  draftOf,
  opportunityStageHistoryQuery,
  updateBodyOf,
  useMoveStage,
  useSaveOpportunity,
} from '@/data/opportunities-write'
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
  type SetDraft,
} from '@/components/ops-fields'
import { DetailSidePanel } from '@/components/detail-side-panel'
import { GateRefusal, SignDrawer } from '@/components/sign-drawer'
import { OpportunityGateCard } from '@/components/gate-checklist'
import { gateRefusalOf } from '@/data/stage-gate'
import { ActivityCard } from '@/components/lead-history-card'

/** Module 3 · Hồ sơ một cơ hội — `/sales/opportunities/:code`.
 *
 *  ------------------------------------------------------------------
 *  CÙNG BỐ CỤC VỚI HỒ SƠ LEAD (chốt 29/08)
 *  ------------------------------------------------------------------
 *  Người dùng đi qua lại giữa hai hồ sơ cả ngày, nên hai màn phải THẲNG HÀNG
 *  thật chứ không chỉ "trông giống": cùng thẻ glass-b bọc đầu trang, cùng lưới
 *  chia cột, cùng đường kẻ dọc, cùng bề rộng lưới chi tiết. Lệch vài pixel giữa
 *  hai màn đọc ra như hai sản phẩm khác nhau.
 *
 *   0 · ĐẦU TRANG — MỘT thẻ glass-b chia hai: trái là NHẬN DIỆN (tên đơn · mã ·
 *       account), phải là TÌNH TRẠNG (trạng thái · cột đang đứng · giá trị đơn
 *       và ngày đóng). Bản trước nhồi cả bảy thứ vào một hàng pill của
 *       `ScreenHeader` trần, và một hàng pill bảy món thì không món nào đọc được.
 *   1 · CỘT CHÍNH (3 phần) — thứ người dùng SỬA: cả phiếu cơ hội, một thẻ.
 *   2 · CỘT PHỤ (1 phần) — thứ người dùng TRA: lead gốc, ai đứng đơn, và dòng
 *       thời gian (dùng lại nguyên `ActivityCard` của module 2 — đời của đơn
 *       CHÍNH LÀ đời của lead sinh ra nó, dựng một dòng thời gian thứ hai chỉ
 *       để kể lại cùng chuỗi sự kiện là tự mâu thuẫn).
 *   3 · THANH CÔNG CỤ dính đáy — ai gọi cho ai bên trái, đi đâu bên phải.
 *
 *  ------------------------------------------------------------------
 *  MỘT CHỖ CỐ Ý KHÁC HỒ SƠ LEAD: KHÔNG `sideFirst`
 *  ------------------------------------------------------------------
 *  Hồ sơ lead bật `sideFirst` để dưới `xl` cột phụ lên trước, và đúng: ở đó cột
 *  chính là form ba mươi ô để TRA, còn cột phụ chở VIỆC PHẢI LÀM (ghi buổi họp,
 *  soạn mail, bước tiếp theo) — trên tablet người ta mở một khách ra để làm
 *  việc chứ không để điền form.
 *
 *  Ở đây thì ngược hẳn. Cột chính CHÍNH LÀ phiếu người ta mở màn ra để sửa;
 *  cột phụ chỉ tra cứu (lead gốc · ai đứng đơn · dòng thời gian). Bật
 *  `sideFirst` là đẩy ba thẻ tra cứu lên trên đúng thứ người dùng đến để làm,
 *  rồi bắt họ cuộn qua chúng mỗi lần muốn sửa một ô.
 *
 *  ------------------------------------------------------------------
 *  NỢ LUẬT 10 — ĐÃ TRẢ 15/09
 *  ------------------------------------------------------------------
 *  Nợ cũ ghi rằng màn này ĐỦ ĐIỀU KIỆN dựng rail ngay — dữ liệu đã có
 *  (`op.leadCode` → `op.code` → `op.contractCode`), thứ thiếu là chỗ đặt — và
 *  điều kiện trả nợ là CÓ NGƯỜI GẬT BỐ CỤC. Có người gật, và rail nay nằm ngay
 *  dưới thẻ nhận diện.
 *
 *  Một chỗ đi khác lời hẹn cũ, cố ý: chuỗi KHÔNG ghép từ ba trường của dòng
 *  này. Luật 10 chốt `E1.story()` là đầu vào hợp lệ duy nhất, và lý do lộ ra
 *  ngay khi hồ sơ lead cũng cần rail — bên đó lead → cơ hội là 1-n nên không
 *  cột nào ghép được. Hai màn tự ghép chuỗi là hai bức tranh khác nhau về một
 *  bản ghi, đúng ngày ai đó thêm một mắt. Máy chủ đi đồ thị một lần, cắt theo
 *  quyền, trả cho cả hai.
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
 *  Hai lượt đọc thật (`GET /sales/opportunities/:code` và `GET /sales/leads/:code`) và
 *  một lượt ghi thật (`PATCH /sales/opportunities/:code`). Bàn làm việc trên máy
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
  'probability',
  'products',
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

export function OpportunityDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()

  const { data: op, isPending, error } = useQuery(opportunityProfileQuery(code))

  /* Hồ sơ lead gốc, đọc THẬT. `enabled` chờ đơn về trước vì mã lead nằm trên
     chính dòng đó — không có nó thì không biết hỏi lead nào. Lỗi của lượt này
     KHÔNG làm hỏng màn: một cơ hội vẫn đọc được khi lead của nó ngoài phạm vi
     người đang xem, và thẻ bên phải nói ra điều đó thay vì để trống. */
  const { data: lead = null } = useQuery({
    ...leadProfileQuery(op?.leadCode ?? ''),
    enabled: Boolean(op?.leadCode),
  })

  /* Dòng thời gian của ĐƠN, không phải của lead — quyết định 5 của ADR
     `docs/decisions/0018-opportunity-module-decisions.md`. Đơn sinh ra SAU khi
     lead đã đi được một đoạn, nên trộn hai chuỗi thì câu "đơn này đã đi qua
     những gì" trả lời lẫn cả những việc xảy ra trước khi đơn tồn tại.

     `enabled` chờ đơn về, cùng lý do với hồ sơ lead ngay trên: mã nằm trên
     chính dòng đó. Hỏng lượt này KHÔNG làm hỏng màn — `?? NO_TOUCHES` giữ
     nguyên lời khai cũ, và một dòng thời gian rỗng vẫn là một thẻ đọc được. */
  const { data: touches = NO_TOUCHES } = useQuery({
    ...opportunityTouchesQuery(op?.code ?? ''),
    enabled: Boolean(op?.code),
  })

  /* The holder chain, off the SAME query key as the timeline above — one fetch,
     two questions, exactly as the lead profile does it. §6·B asked for the
     vector on both profiles and only the lead had it until 14/09. */
  const { data: vector = NO_STEPS } = useQuery({
    ...opportunityVectorQuery(op?.code ?? ''),
    enabled: Boolean(op?.code),
  })

  /* Which timeline row a vector face last pointed at — the wire between the two
     blocks, same shape as the lead profile. */
  const [focusTouch, setFocusTouch] = useState<TouchFocus | null>(null)

  /* So a step can mark itself as the reader's own. Read here rather than inside
     `FlowVector`: the library holds no session, data goes in by props. */
  const me = useSession((s) => s.actor)

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
    /* Một `kind`, một câu — y hệt hồ sơ lead, và giống vì cùng một lý do: màn
       không đọc `status` số và không bắt chuỗi trong `message`, vì
       `app/api/errors.ts` đã phân loại một lần cho cả app. Ba ca là ba việc
       phải làm tiếp khác nhau, nên một `EmptyOp` chung cho cả ba là bảo người
       dùng "hỏng rồi" mà không nói hỏng kiểu gì. */
    const failure = isApiError(error) ? error : null
    const missing = failure?.kind === 'not-found'
    const denied = failure?.kind === 'forbidden'

    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyOp
            icon={missing ? Inbox : denied ? Lock : TriangleAlert}
            note={
              missing ? (
                <>
                  Sổ của bạn không có đơn nào mang mã <span className="font-mono">{code}</span>. Có
                  thể mã sai, hoặc đơn không đứng tên bạn — hỏi người giữ đơn, hoặc mở lại từ sổ.
                </>
              ) : (
                (failure && userMessage(failure)) || 'Không đọc được hồ sơ cơ hội này.'
              )
            }
            onBack={() => navigate('/sales/opportunities')}
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  const late = isLateClose(op)
  /* The column clock now comes from the SERVER's position, which reads
     `config_entry` — the limits somebody can actually edit on the Settings
     screen. `isRottingOp` answers the same question from `STAGE_LIMIT`, a
     constant copied out of the frozen fixture, and it still serves the book
     grid because a book row carries no position. On this screen the two would
     be two answers to one question, and the configured one is the true one. */
  const overdueBy = op.position?.overdueBy ?? null
  const rotting = overdueBy !== null && overdueBy > 0

  return shell(
    <ScreenLayout>
      <GlassCard variant="b" className="p-4">
        {/* HAI NỬA, HAI CÂU HỎI — cùng lưới với đầu trang hồ sơ lead.
            Trái là NHẬN DIỆN ("đơn nào, của khách nào"), phải là TÌNH TRẠNG
            ("đơn đang ở đâu, đáng bao nhiêu, bao giờ đóng"). Bản trước dồn cả
            bảy nhãn vào một hàng pill: trạng thái đứng lẫn giữa mã và account,
            còn tiền — thứ đắt nhất của màn này — nằm áp chót.

            Bọc glass-b và KHÔNG lồng thêm mặt kính nào bên trong: luật 12, nền
            đúng 4 lớp. Hai nửa chia bằng một đường kẻ dọc, không bằng thẻ con. */}
        {/* Trường VẮNG nghĩa là chưa moi được, không phải rỗng — nên chỗ nào
            chưa có thì in "—" chứ không bỏ pill đi: một hàng pill thiếu chỗ
            này thừa chỗ kia không đọc ra được là "chưa biết" hay "không có".
            Câu giải thích lấy đúng chữ của cột tương ứng bên `pages/opportunities.tsx`
            — cùng một ô trống thì cùng một lời khai, ở sổ hay ở hồ sơ. */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] lg:gap-6">
          <ScreenHeader
            back={{ label: 'Sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
            kicker="Cơ hội"
            title={op.name}
            meta={
              <>
                <Chip>{op.code}</Chip>
                <MetaPill>{op.account}</MetaPill>
                {op.accountCode && <Chip variant="source">{op.accountCode}</Chip>}
              </>
            }
          />

          <div className="border-surface-ink/10 flex min-w-0 flex-col justify-end gap-4 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATE_TONE[op.state]}>{STATE_LABEL.get(op.state)}</Badge>
              {op.stage && (
                <MetaPill tone={rotting ? 'warning' : 'accent'}>
                  {STAGE_LABEL.get(op.stage)}
                  {op.daysInStage !== null && ` · ${op.daysInStage} ngày`}
                  {/* One number, both readings: negative is time still in hand,
                      positive is time gone. `null` means the column has no
                      limit configured — nothing can be late here yet, which is
                      not the same as nothing being late, so it says neither. */}
                  {overdueBy !== null &&
                    (overdueBy > 0 ? ` · trễ ${overdueBy} ngày` : ` · còn ${-overdueBy} ngày`)}
                </MetaPill>
              )}
              {/* Who the deal is waiting ON, which is a different question from
                  who HOLDS it: an approval sitting with somebody else is the
                  reason a deal stops moving while its owner looks idle. */}
              {op.position?.waitingOn && (
                <MetaPill tone="warning">
                  chờ {op.position.waitingOn.person} · {op.position.waitingOn.role}
                </MetaPill>
              )}
            </div>

            {/* Nhãn nhóm, giống cách hồ sơ lead gắn nhãn "Nguồn lead": hai pill
                dưới đây là số của ĐƠN, không phải nhãn phân loại, nên chúng
                cần một cái tên chứ không thể đứng trần cạnh pill cột. */}
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-muted-foreground text-[12.5px] font-semibold">Giá trị đơn</span>
              <div className="flex flex-wrap items-center gap-2">
                <MetaPill
                  mono
                  title={
                    op.amount !== null && op.currency !== null
                      ? undefined
                      : 'Chưa moi được ô 9 — khoảng tiền khách nói'
                  }
                >
                  {op.amount !== null && op.currency !== null
                    ? billions(toMoneyVnd(op.amount, op.currency))
                    : '—'}
                </MetaPill>
                <MetaPill
                  mono
                  tone={late ? 'warning' : undefined}
                  title={op.expectedClose !== null ? undefined : 'Chưa đặt ngày đóng dự kiến'}
                >
                  {op.stage === null ? 'đóng' : 'đóng dự kiến'}{' '}
                  {op.expectedClose !== null ? dmy(op.expectedClose) : '—'}
                </MetaPill>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* THE OBJECT CHAIN this deal belongs to — lead, deal, contract. Rule 10.
          Built by `E1.story()` ON THE SERVER and already cut by permission, so
          a chip that appears is a record this reader may open.

          Directly under the identity card and ABOVE the vector below, because
          the two bars widen outwards: the rail says which WORK this is part
          of, the vector says who has carried it. Answering "who" before "what"
          reads backwards.

          The debt note this file carried until 15/09 said the missing piece was
          not data but a PLACE, and that building the rail needed somebody to
          approve the layout. Both are now settled. */}
      {op.chain.length > 1 && (
        <ContextRail objects={railOf(op.chain, op.code, navigate)} className="px-1" />
      )}

      {/* WHO HAS HELD THIS DEAL, in order — the left half of the flow vector,
          in the same place and for the same reason as on the lead profile: it
          is a fact about an object, not a task. A deal that never changed
          hands answers an empty chain and this block draws nothing, which is
          the true picture of a deal one person carried the whole way. */}
      {vector.length > 0 && (
        <GlassCard variant="b" className="p-4">
          <FlowVector
            steps={vector}
            you={me?.id}
            onOpen={(id) => setFocusTouch((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }))}
          />
        </GlassCard>
      )}

      {/* Cùng lưới chi tiết với hồ sơ lead — `w-full` để mép card hai màn thẳng
          hàng, `xl:self-stretch` + cột phụ DÍNH để ba thẻ tra cứu còn trong tầm
          mắt khi cuộn hết phiếu.

          KHÔNG `sideFirst`, và đó là chỗ duy nhất hai màn cố ý khác nhau — lý
          do đầy đủ ở docblock đầu file. */}
      <ScreenDetailGrid
        sideLabel="Ngữ cảnh cơ hội"
        className="w-full"
        sideClassName="relative xl:self-stretch"
        main={<DealCard op={op} />}
        side={
          <DetailSidePanel>
            <StageCard op={op} />
            <OpportunityGateCard op={op} />
            <LeadCard op={op} lead={lead} onOpen={() => navigate(`/sales/leads/${op.leadCode}`)} />
            <PeopleCard op={op} />
            {/* Đọc THẬT từ `GET /sales/opportunities/:code/touches` — dòng thời
              gian của ĐƠN, khoá bằng mã đơn chứ không mã lead.

              Thẻ không còn treo vào `lead` nữa. Trước đây nó gác như vậy vì
              `code` phải mượn mã lead; giờ đơn tự có dòng thời gian của mình,
              và một đơn mà lead nằm ngoài phạm vi người xem vẫn phải kể được
              đời của chính nó. */}
            <ActivityCard history={touches} focus={focusTouch} />
          </DetailSidePanel>
        }
      />

      <ToolsBar op={op} lead={lead} onOpenLead={() => navigate(`/sales/leads/${op.leadCode}`)} />
    </ScreenLayout>,
  )
}

// ---------------------------------------------------------------------------

/** Màn không mở được — MỘT khối, ba câu, và cái hình đổi theo câu.
 *
 *  Một component cho cả ba vì cả ba là cùng một trạng thái của màn ("không có
 *  đơn để vẽ") và cùng một đường đi tiếp ("về sổ cơ hội"). Cái khác nhau là
 *  CÂU, và câu là thứ được truyền vào — chứ không phải ba khối rỗng gần giống
 *  nhau, thứ chắc chắn sẽ trôi khỏi nhau ở lần sửa thứ hai. */
function EmptyOp({ icon, note, onBack }: { icon: IconGlyph; note: ReactNode; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={icon} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">{note}</p>
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
  const [errors, setErrors] = useState<FieldErrors>({})

  /* Đổi đơn (hoặc nhận bản vừa lưu từ máy chủ) thì nạp lại ô nhập. Không nạp
     lại thì bấm sang đơn khác vẫn thấy phiếu của đơn trước.

     Câu từ chối đi cùng: nó nói về bản nháp vừa bị thay, nên giữ lại là tô đỏ
     một ô của đơn khác. */
  useEffect(() => {
    setWork(saved)
    setErrors({})
  }, [saved])

  /* Mọi ô sửa được đều là ô của `OpportunityDraft`, nên hàm ghi mang đúng kiểu
     mà bộ ô dùng chung đòi — không phải ép kiểu chỗ nào.

     Gõ vào ô máy chủ vừa chê là xoá lời chê đó — cùng luật `ConvertDialog` áp:
     một vệt đỏ sống sót qua lượt sửa đọc ra "vẫn còn sai". */
  const set: SetDraft = (key, value) => {
    setWork((w) => ({ ...w, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _fixed, ...rest } = current
      return rest
    })
  }

  const dirty = changedFields(saved, work)
  const missing = missingOf(work)
  const lost = work.state === 'close-lost'
  const stage = CREATE_STATES.find((s) => s.key === work.state)?.stage ?? null
  const blocked = dirty.length === 0 || missing.length > 0 || save.isPending
  const gate = gateRefusalOf(save.error)

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

        <Field label="Tên cơ hội" required errors={errors.name} className="sm:col-span-2">
          <Input
            value={work.name}
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
          hint={work.closedDate !== '' ? `Đọc là ${dmy(work.closedDate)}.` : undefined}
        >
          <Input
            type="date"
            value={work.closedDate}
            aria-label="Ngày đóng dự kiến"
            aria-required
            invalid={Boolean(errors.closedDate)}
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
          errors={errors.state}
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

      <AmountRow draft={work} onSet={set} errors={errors} />

      <PeopleRow
        label="Sale đứng đơn"
        required
        hint="Người chốt. Phần chốt của hoa hồng chia theo danh sách này, nên đừng để trống cho xong."
        picked={work.saleOwners}
        errors={errors.saleOwners}
        onToggle={(id) => set('saleOwners', toggled(work.saleOwners, id))}
      />

      <PeopleRow
        label="BD mở cửa"
        hint="Người moi được ô bắt buộc và mở được khách. Công trạng mở cửa ghi cho danh sách này, tách khỏi phần chốt."
        picked={work.bdOwners}
        errors={errors.bdOwners}
        onToggle={(id) => set('bdOwners', toggled(work.bdOwners, id))}
      />

      <ProbabilityField
        value={work.probability}
        errors={errors.probability}
        onSet={(next) => set('probability', next)}
      />

      <ProductsField
        picked={work.products}
        errors={errors.products}
        onToggle={(id) =>
          set(
            'products',
            work.products.includes(id)
              ? work.products.filter((p) => p !== id)
              : [...work.products, id],
          )
        }
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
          value={work.description}
          aria-label="Mô tả cơ hội"
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <AttachmentsField draft={work} onSet={set} errors={errors.attachments} />

      {lost && <LossBlock draft={work} onSet={set} errors={errors} />}

      <Separator />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="md"
          disabled={blocked}
          onClick={() =>
            save.mutate(updateBodyOf(work), {
              /* The server names the box it refused, and `draftErrorsOf` turns
                 its spelling into the form's. An EMPTY map is not "no
                 complaint" — it is a complaint about no one field, and the
                 sentence to the right carries those. */
              onError: (error) => setErrors(draftErrorsOf(error.errors)),
            })
          }
        >
          <Icon icon={Check} size={16} />
          {save.isPending
            ? 'Đang lưu…'
            : `Lưu ${dirty.length > 0 ? `${dirty.length} ô đã sửa` : 'phiếu'}`}
        </Button>
        <Button
          size="md"
          variant="ghost"
          disabled={dirty.length === 0 || save.isPending}
          onClick={() => {
            setWork(saved)
            setErrors({})
          }}
        >
          Bỏ sửa
        </Button>
        {gate ? (
          <GateRefusal criteria={gate} />
        ) : (
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
        )}
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
 *  là mất câu trả lời "hoa hồng chia cho ai".
 *
 *  IN TÊN, KHÔNG CHỈ AVATAR. Thẻ này từng dùng `AvatarGroup` — đúng thứ nó
 *  sinh ra để làm, nhưng docblock của chính nó nói rõ chỗ dùng: một Ô BẢNG,
 *  nơi xếp tên thành chữ sẽ vỡ ô ở người thứ hai. Trong một thẻ ở cột phải thì
 *  ngược lại: một đĩa tròn hai chữ cái bắt người đọc rê chuột lên mới biết
 *  "ĐB" là ai, trong khi thẻ có cả chiều rộng để nói thẳng.
 *
 *  Và nó phải giống hồ sơ lead. Khối "Lead PIC" ở `pages/lead-detail.tsx` in
 *  avatar KÈM tên bằng đúng `MetaPill` này; hai màn chi tiết của cùng một
 *  phòng mà một bên in tên còn một bên bắt rê chuột là hai câu trả lời khác
 *  nhau cho cùng một câu hỏi "ai đang giữ việc này". */
/** Which column the deal stands in, how to move it, and where it has been.
 *
 *  ------------------------------------------------------------------
 *  WHY MOVING A COLUMN IS NOT PART OF THE FORM IN THE MAIN COLUMN
 *  ------------------------------------------------------------------
 *  The form on the left sends ALL thirteen fields on every Save, and the Save
 *  button only lights up when something is dirty. Putting the column picker in
 *  there would mean dragging a card to another column also sends money, owners
 *  and the close date — including fields the user is half-editing and does not
 *  want saved yet. The `PATCH :code/stage` door carries exactly one field, and
 *  this card is the only place that calls it.
 *
 *  A column move takes effect IMMEDIATELY, with no Save button, and that is
 *  deliberate rather than an inconsistency with the form beside it: a one-field
 *  gesture has no half-edited state to hold on to.
 *
 *  ------------------------------------------------------------------
 *  A CLOSED DEAL STANDS IN NO COLUMN
 *  ------------------------------------------------------------------
 *  Winning or losing takes a deal off the five-column board. The server refuses
 *  a column move for such a deal; the screen locks the picker FIRST, so nobody
 *  clicks and only then reads a refusal. */
/** A column's label, falling back to the key itself when the label table has
 *  no entry for it.
 *
 *  Falling back to the key rather than to a dash: `PIPELINE_STAGES` is a
 *  fixture constant, so a column added on the configuration screen but not yet
 *  in that constant has no label — and printing the raw key is ugly but TRUE,
 *  while printing a dash hides a column that really exists. The same reasoning
 *  `exitReasonRows` applies when the row counts disagree. */
const stageName = (key: NonNullable<OpportunityRow['stage']>) => STAGE_LABEL.get(key) ?? key

function StageCard({ op }: { op: OpportunityProfileResponse }) {
  const move = useMoveStage(op.code)
  const canEdit = useCan('opportunity.edit')
  const history = useQuery(opportunityStageHistoryQuery(op.code))
  const gate = gateRefusalOf(move.error)

  const stage = op.stage
  const track = stageTrackOf(op)
  /* Two reasons to lock, one sentence for each. The shared `Select` has no
     `disabled` prop, and adding one to the shared layer for a single screen
     would change the library's API to suit one call site — so locking here
     means NOT drawing the picker at all, and drawing a read-only pill with the
     reason instead. The user reads why, rather than clicking a grey box that
     says nothing. */
  const lockedBecause =
    stage === null
      ? 'Đơn đã đóng sổ — thắng hoặc thua thì không đứng ở cột nào.'
      : !canEdit
        ? 'Vai của bạn không sửa được cơ hội.'
        : null

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Cột và lịch sử">
      <SectionTitle
        size="sm"
        hint={
          lockedBecause ??
          'Đổi cột ăn ngay, không cần bấm Lưu. Không đụng tới trạng thái, tiền hay người đứng đơn.'
        }
      >
        Cột của đơn
      </SectionTitle>

      {lockedBecause !== null || stage === null ? (
        <MetaPill>
          {stage === null ? 'Không đứng cột nào' : (STAGE_LABEL.get(stage) ?? stage)}
        </MetaPill>
      ) : (
        <Select
          label="Cột đang đứng"
          value={stage}
          neutralValue={stage}
          onChange={(v) => {
            /* Re-picking the column the deal already stands in is a no-op. The
               server also returns the old row rather than writing an empty
               history entry, but stopping here saves a round trip on the most
               common gesture of all: opening the menu and changing one's mind. */
            if (v === stage || move.isPending) return
            move.mutate({ stage: v as NonNullable<OpportunityRow['stage']> })
          }}
          options={PIPELINE_STAGES.map((s) => ({ value: s.key, label: s.label }))}
          className="w-full"
        />
      )}

      {/* The bar sits UNDER the select, it does not replace it: the bar answers
          "how far has this deal got" in one glance, the select is where a
          column changes. A closed deal has no bar — `stageTrackOf` returns
          `null` and the pill above already says why. */}
      {track && <StageTrack steps={track.steps} current={track.current} caption />}

      {gate ? (
        <GateRefusal criteria={gate} />
      ) : (
        move.isError && (
          <p role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
            {userMessage(move.error)}
          </p>
        )
      )}

      <Separator />

      <Kicker tone="muted">Đã đi qua</Kicker>

      {history.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (history.data?.rows.length ?? 0) === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa có lượt đổi cột nào được ghi. Đơn mở trước ngày sổ lịch sử chạy thì bắt đầu từ lượt
          chuyển tiếp theo — số cũ không suy ngược lại được.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {history.data?.rows.map((e) => (
            <li key={e.id} className="flex flex-col gap-1">
              <span className="text-[12px] leading-[1.5]">
                {/* A  at either end is a real event, not missing data:
                    entering the board when the deal opened, leaving it when the
                    deal was signed or lost. */}
                {e.from === null
                  ? `Vào bảng ở ${e.to === null ? '—' : stageName(e.to)}`
                  : e.to === null
                    ? `Ra khỏi bảng từ ${stageName(e.from)}`
                    : `${stageName(e.from)} → ${stageName(e.to)}`}
              </span>
              <span className="text-muted-foreground text-[11px] leading-[1.5]">
                {dm(e.at)} · {e.by}
                {e.daysInFrom !== null && ` · đứng ${e.daysInFrom} ngày`}
              </span>
              {e.note !== undefined && (
                <span className="text-muted-foreground text-[11px] leading-[1.5]">{e.note}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </GlassCard>
  )
}

function PeopleCard({ op }: { op: OpportunityRow }) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Người đứng đơn">
      <SectionTitle size="sm">Đứng đơn</SectionTitle>

      <div className="flex flex-col gap-2">
        <Kicker tone="muted">Sale đứng đơn</Kicker>
        <PeopleLine names={namesOf(saleOwnersOf(op))} empty="chưa ai đứng đơn" />
      </div>

      <div className="flex flex-col gap-2">
        <Kicker tone="muted">BD mở cửa</Kicker>
        <PeopleLine names={namesOf(bdOwnersOf(op))} empty="chưa ghi BD" />
      </div>

      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Phần chốt của hoa hồng chia theo danh sách trên, công trạng mở cửa theo danh sách dưới.
      </p>
    </GlassCard>
  )
}

/** Một danh sách người, mỗi người một pill avatar + tên — hoặc câu "chưa ai".
 *
 *  Câu rỗng đi vào bằng props chứ không mặc định một câu chung: "chưa ai đứng
 *  đơn" và "chưa ghi BD" là hai sự thật khác nhau — một cái là đơn chưa có
 *  người chốt, một cái là đơn không đi qua BD — và một câu dùng chung sẽ xoá
 *  mất sự khác nhau đó ở đúng thẻ người ta đọc để chia hoa hồng. */
function PeopleLine({ names, empty }: { names: string[]; empty: string }) {
  if (names.length === 0) {
    return <span className="text-muted-foreground text-[11.5px]">{empty}</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {names.map((name) => (
        <MetaPill key={name} avatar={name}>
          {name}
        </MetaPill>
      ))}
    </div>
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
 *  đè lên sidebar. Nhưng chỉ dính TỪ `lg` TRỞ LÊN, và khối "Khách" cũng chỉ
 *  hiện từ đó: ở 390×844 thanh này chở ba pill liên hệ + avatar + ba nút, xuống
 *  dòng thành 200–260px, lại dính ngay sát nóc BottomNav 84px — còn chừng 500px
 *  để đọc cả cái phiếu. Một thanh công cụ ăn một phần ba màn không còn là công
 *  cụ. Dưới `lg` nó trôi theo nội dung, ở cuối trang, chỗ nó vốn thuộc về.
 *
 *  Nền ĐẶC (`bg-hc-surface`), KHÔNG `backdrop-blur`. `packages/tokens/globals.css`
 *  chỗ định nghĩa `.glass-b` nói thẳng là không dùng `backdrop-filter`: `--popover`
 *  ở alpha .84 nên chỉ 16% nền lọt qua, blur một nền tĩnh ở 16% cường độ là thứ
 *  mắt không thấy nhưng trình duyệt vẫn phải chụp lại vùng nền rồi lọc mỗi lần
 *  vẽ — mà đây là phần tử `sticky`, tức vẽ lại mỗi frame cuộn. Thanh của hồ sơ
 *  lead cũng dùng nền đặc; bản trước ở đây ghi là blur "cùng lý do với thanh
 *  của hồ sơ lead", và câu đó sai sự thật. */
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

  /* ẨN HẲN, không hiện rồi làm mờ — quyết định 4 của ADR
     `docs/decisions/0018-opportunity-module-decisions.md`.
     Một nút mờ là một lời hứa: "cái này làm được, chỉ chưa lúc này". Với
     `presales` thì không bao giờ là lúc — vai đó dựng số và chạy demo, chữ ký
     thuộc về người đứng tên đơn — nên nút mờ ở đó chỉ dạy người dùng đi tìm
     điều kiện không tồn tại.

     `useCan` hỏi ĐÚNG hàm E2 mà `app/api/client.ts` hỏi trước khi thả một byte
     nào ra dây (`access.allows`), nên giao diện và hàng rào không nói ngược
     nhau. Ẩn nút KHÔNG phải là phân quyền: hàng rào thật vẫn ở tầng api, và cửa
     máy chủ vẫn khai `@Need({ permission: 'opportunity.close' })`. */
  const canSign = useCan('opportunity.close')
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
    <div className="z-10 lg:sticky lg:bottom-4">
      <GlassCard
        variant="b"
        className="bg-hc-surface shadow-panel flex flex-wrap items-center gap-3 p-3"
        aria-label="Thanh công cụ"
      >
        <div className="hidden min-w-0 flex-col gap-1 lg:flex">
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
          {/* `tel:` chứ không phải một nút chỉ để sáng lên — cùng nước đi với
              thanh của hồ sơ lead. Bản trước có `disabled` mà không có
              `onClick`: có số thì nút bật, bấm không ra gì, và người dùng đọc
              cái đó thành màn hỏng chứ không thành "chức năng chưa có". */}
          <Button
            size="md"
            variant="secondary"
            disabled={!contact?.phone}
            title={contact?.phone ?? 'Chưa moi được kênh gọi lại được'}
            onClick={() => {
              if (contact?.phone) window.location.href = `tel:${contact.phone}`
            }}
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

export default OpportunityDetailPage
