import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CircleCheckBig,
  ClipboardList,
  Coins,
  Orbit,
  Send,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AiAction,
  AppShell,
  Badge,
  Button,
  Chip,
  ContextRail,
  CostBand,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  InsetPanel,
  LoadingBlock,
  PageHeader,
  SectionTitle,
  StatCard,
} from '@pv/ui'
import { DAS_VINA_FROZEN_AT, dasVina } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import { PLAN_ANCHOR, planBoardQuery, planMeasureText, type PlanTargetRow } from '@/data/plan'

/** Module 4 · Số liệu & kế hoạch (docs/kien-truc-san-pham.md · "Năm module
 *  Pebble Sales"). Trả hai câu, theo đúng thứ tự đọc của màn: **kỳ này phòng
 *  còn thiếu gì**, rồi **việc phải làm là gì và trong khoảng nào**.
 *
 *  Câu thứ hai KHÔNG còn là "tháng tới phòng nên làm gì": từ 20/08 khối đề xuất
 *  mở đầu bằng việc cứu nhịp của chính kỳ đang chạy, nên mỗi đề xuất mang chân
 *  trời riêng (`PlanProposal.horizon`) thay vì cả khối mang một cái tên chung.
 *
 *  Màn này ĂN ĐẦU RA của module 1 + 2 + 3, nên nó làm cuối. Nó không đẻ số mới:
 *  mọi con số trên màn suy từ sổ lead, sổ cơ hội, tám nguồn và bảng thước đã có.
 *
 *  --------------------------------------------------------------------------
 *  KHỐI ĐẦU MÀN LÀ CHỈ TIÊU, KHÔNG PHẢI SỐ ĐO
 *  --------------------------------------------------------------------------
 *  Đợt 20/08 đổi thứ tự đọc của cả màn. Trước đó màn mở bằng bốn ô số "phòng
 *  đang đứng ở đâu" — bốn con số đã đo, không con số nào là đích. Chỉ tiêu của
 *  kỳ khi ấy chỉ đọc được ở MỘT chỗ trong cả hệ: bên trong Drawer của màn
 *  Performance, sau ba cú bấm không cú nào có đường dẫn riêng.
 *
 *  Giờ khối đầu màn là bảng chỉ tiêu: mỗi thước nói đủ bốn thứ — chỉ tiêu của
 *  kỳ, đã đạt tới lát cắt, còn thiếu, nhịp cần có — và khai luôn mẫu số của
 *  chính nó. Đó là con số điều phối cả vòng bốn module, nên nó đứng trước.
 *
 *  --------------------------------------------------------------------------
 *  LUẬT 9 LÀ XƯƠNG SỐNG CỦA MÀN, KHÔNG PHẢI MỘT MỤC TRONG CHECKLIST
 *  --------------------------------------------------------------------------
 *  Đây là màn AI nặng nhất của hệ, nên nó phải là màn kỷ luật nhất. Ba bước từ
 *  đề xuất tới hành động đều CHỜ NGƯỜI BẤM, và không bước nào rút ngắn được:
 *
 *    1. trợ lý đề xuất  → người bấm "Thêm vào kế hoạch"
 *    2. kế hoạch thành hình → người bấm "Gửi … duyệt"
 *    3. người gật gật    → lúc đó mới có ai bắt tay vào làm
 *
 *  Nút cuối cùng của màn là *gửi duyệt*, không phải *làm ngay*. Trên màn không
 *  có nút nào rút gọn ba bước thành một — thiếu bước nào thì hệ đã tự quyết hộ
 *  người, và đó đúng là thứ luật 9 cấm.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. Vào được màn này là vai có
 *  nhánh Sales — cửa ở `app/guard.tsx`, không kiểm lại ở đây.
 *
 *  Số lấy qua `useQuery`, mọi phép tính nằm ở `data/plan.ts` (kể cả câu "Căn
 *  cứ", xem ghi chú ở đầu file đó). Màn này chỉ bày và giữ đúng một thứ trạng
 *  thái riêng của nó: người dùng đã nhặt đề xuất nào vào kế hoạch. */

/** Icon nhận dạng cho từng ô số, khoá theo `PlanStat.key`.
 *
 *  Bảng nằm ở TẦNG MÀN chứ không ở `data/plan.ts`: icon là chuyện trình bày,
 *  còn file dữ liệu chỉ được biết con số và câu chữ của nó. Khoá lạ thì tra ra
 *  `undefined` và thẻ đơn giản là không có icon — thiếu một hình trang trí không
 *  đáng để làm hỏng cả màn. */
const STAT_ICON: Record<string, LucideIcon> = {
  'dang-muc': TriangleAlert,
  'qua-sla': Timer,
  'lead-tot': CircleCheckBig,
  'gia-lead-tot': Coins,
}

/** Nhãn của cột "Nhịp", khoá theo `PlanTargetRow.pace`.
 *
 *  Ba mức, ba nghĩa rời hẳn nhau: đã đủ chỉ tiêu · chưa đủ nhưng đang theo kịp
 *  nhịp thời gian · chưa đủ và đã tụt lại. Không dùng tone `danger`: chữ của nó
 *  (`--destructive-foreground`) đo được 4,34:1 trên `.glass-a`, dưới ngưỡng luật
 *  13 — nợ đã ghi nhận, đang chờ một đợt riêng, nên màn không rước thêm chỗ
 *  dùng mới. */
const PACE_BADGE: Record<
  PlanTargetRow['pace'],
  { tone: 'success' | 'running' | 'warning'; text: string }
> = {
  'da-du': { tone: 'success', text: 'Đã đủ' },
  'du-nhip': { tone: 'running', text: 'Đủ nhịp' },
  'hut-nhip': { tone: 'warning', text: 'Hụt nhịp' },
}

/** Mã object → đường dẫn hồ sơ của nó, `null` khi hệ chưa có màn nào để mở.
 *
 *  Đây là chỗ module 4 nối lại vào vòng: đọc xong "SK-0106 đắt hơn ít nhất 6,6
 *  lần" thì phải sang được hồ sơ nguồn để cắt tiền, đọc xong một mã lead thì
 *  phải mở được hồ sơ lead. Trước 20/08 cả màn không có một `navigate` nào —
 *  mọi chip là chữ, kể cả những chip có màn thật đứng sau.
 *
 *  `OP-` cố tình trả `null`: hệ CHƯA có màn hồ sơ đơn, và một chip bấm được mà
 *  không mở gì tệ hơn một chip là chữ (ràng buộc 11). Chỗ nào hàng chip lẫn hai
 *  loại thì màn phải nói ra — xem câu ở khối "Kế hoạch đã chốt". */
function routeOfCode(code: string): string | null {
  if (/^(?:CD|SK)-\d{4}$/.test(code)) return `/sales/campaigns/${code}`
  if (/^LD-\d{4}$/.test(code)) return `/sales/leads/${code}`
  return null
}

export function PlanPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const { data: board } = useQuery(planBoardQuery)
  const navigate = useNavigate()

  /* Kế hoạch đang dựng là chuyện RIÊNG của màn — chưa gửi thì chưa ai khác cần
     biết. Lên E3 khi bấm gửi duyệt, không phải khi bấm thêm. */
  const [picked, setPicked] = useState<string[]>([])
  const [sent, setSent] = useState(false)

  const chosen = useMemo(
    () => (board?.proposals ?? []).filter((p) => picked.includes(p.id)),
    [board, picked],
  )

  /* Luật 10 · rail dựng thẳng từ E1, màn không tự viết chip. Mỏ neo là đơn lớn
     nhất đang chạy — kế hoạch tháng tới xoay quanh chỗ nhiều tiền nhất đang
     đứng im. Rail nằm NGOÀI nhánh chờ dữ liệu: màn lúc chờ vẫn là một màn.

     `source` bật cho ĐÚNG object đang mở. Luật 10 và docblock của ContextRail
     nói "chip azure = object của câu chuyện đang mở, chip trắng mờ = object
     liên quan"; bản trước viết `!== PLAN_ANCHOR` nên tô azure cho mọi object
     TRỪ cái đang mở — ba chip azure vây quanh một chip mờ, đúng ngược nghĩa và
     phá luôn luật 3 (azure phải đếm được).

     Chip KHÔNG bấm được: `onOpen` rỗng biến chip thành một cái nút vào được
     bằng Tab, có con trỏ pointer, bấm thì không xảy ra gì. Chưa có màn hồ sơ
     object để mở thì để nó là chữ. */
  const rail = useMemo(() => {
    const story = dasVina.graph.story(PLAN_ANCHOR)
    if (story.length === 0) return [{ code: PLAN_ANCHOR, source: true }]
    return story.map((o) => ({ code: o.code, source: o.code === PLAN_ANCHOR }))
  }, [])

  const toggle = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    /* Sửa kế hoạch sau khi đã gửi thì bản đang chờ duyệt không còn đúng nữa —
       kéo về nháp, buộc người gửi lại. Im lặng đổi nội dung của một yêu cầu
       đang chờ là cách êm ái để người gật duyệt nhầm thứ. */
    setSent(false)
  }

  return (
    <AppShell {...chrome.shell}>
      <div className="flex flex-col gap-5 lg:gap-6">
        <PageHeader
          title="Số liệu & kế hoạch"
          subtitle={
            <>
              DAS Vina · lát cắt{' '}
              <span className="font-mono">{DAS_VINA_FROZEN_AT.slice(11, 16)}</span> ngày{' '}
              <span className="font-mono">{dm(DAS_VINA_FROZEN_AT)}</span> · module 4 đọc lại số của
              module 1 + 2 + 3 quanh đơn lớn nhất đang chạy, không đẻ số mới
            </>
          }
          rail={<ContextRail objects={rail} />}
        />

        {!board ? (
          /* Khung chờ cao xấp xỉ NỘI DUNG THẬT, đo ở 1512px: bảng chỉ tiêu kèm
             chú thích ~540 · hàng bốn ô số ~110 · bảng giá mỗi lead tốt ~520 ·
             hai cột đề xuất + kế hoạch ~1.100. Bản trước đặt 248/96/160×2 ≈
             724px cho ≈ 2.500px nội dung, nên lúc số về màn nhảy gần hai nghìn
             pixel. Bốn khối cao khác nhau là bốn LoadingBlock, không phải một
             cái nhân `lines` — `lines` chỉ đúng khi các dải cao bằng nhau. */
          <div className="flex flex-col gap-4 lg:gap-6">
            <LoadingBlock height={700} label="Đang tải bảng chỉ tiêu của kỳ" />
            <LoadingBlock height={110} label="Đang tải bốn ô số của phòng" />
            <LoadingBlock height={570} label="Đang tải bảng giá mỗi lead tốt" />
            <LoadingBlock height={540} lines={2} label="Đang tải đề xuất và kế hoạch" />
          </div>
        ) : (
          <>
            {/* 1 · CHỈ TIÊU CỦA KỲ — con số điều phối cả vòng.
                Bảng nên nằm trên glass-b cấp một (luật 8). */}
            <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
              <SectionTitle
                size="sm"
                kicker="Điều phối bằng con số kế hoạch"
                hint={board.targets.headline}
                actions={
                  <Badge tone={board.targets.daysLeft > 0 ? 'running' : 'draft'}>
                    Còn {board.targets.daysLeft} ngày
                  </Badge>
                }
              >
                Chỉ tiêu {board.targets.label} · còn thiếu bao nhiêu
              </SectionTitle>

              {/* MỖI Ô ĐÚNG MỘT DÒNG. `DataTable` khoá dòng ở `h-11` (44px), nên
                  ô xếp dọc hai dòng vỡ ngay ở tablet 1024: bản trước nhét công
                  thức xuống dưới tên thước, đo được 54/44 ở bốn trên năm dòng và
                  chữ đè lên tiêu đề của dòng kế. Truncate hai dòng thì bảng
                  không vỡ nhưng công thức mất nghĩa — mà một mẫu số đọc dở dang
                  còn tệ hơn không đọc. Công thức và tên người vì thế xuống hẳn
                  danh sách chú ngay dưới bảng. */}
              <DataTable
                columns={[
                  { header: 'Thước', width: '1.6fr' },
                  { header: 'Vai chịu', width: '0.8fr' },
                  /* "cả vai" là mẫu số: chỉ tiêu ở đây đã nhân cho số người mang
                     vai, còn màn Performance in chỉ tiêu của MỘT người dưới nhãn
                     gần y hệt. Dòng Sale là chỗ duy nhất chênh lộ ra (3 so với
                     1), tức kiểu lệch khó thấy nhất. */
                  { header: 'Chỉ tiêu kỳ · cả vai', width: '1.1fr', align: 'right' },
                  {
                    header: `Đã đạt · tới ${board.targets.cutoff}`,
                    width: '1.1fr',
                    align: 'right',
                  },
                  { header: 'Còn thiếu', width: '0.8fr', align: 'right' },
                  { header: 'Nhịp cần có', width: '1.2fr' },
                  /* Không đặt tên cột này là "Nhịp": nó đứng ngay cạnh "Nhịp cần
                     có" mà lại là một LỜI CHẤM, không phải một con số nữa. */
                  { header: 'Chấm nhịp', width: '0.9fr' },
                ]}
                rows={board.targets.rows.map((r) => ({
                  id: r.key,
                  cells: [
                    <b key="m" className="block truncate text-[12.5px] font-semibold">
                      {r.metric}
                    </b>,
                    <span key="r" className="block truncate text-[12.5px]">
                      {r.role}
                    </span>,
                    <span key="t" className="tnum font-num text-[13px] font-semibold">
                      {planMeasureText(r.unit, r.target)}
                    </span>,
                    <span key="d" className="tnum font-num text-[13px]">
                      {planMeasureText(r.unit, r.done)}
                    </span>,
                    <span key="g" className="tnum font-num text-[13px] font-semibold">
                      {planMeasureText(r.unit, r.missing)}
                    </span>,
                    <span key="p" className="block truncate text-[12.5px]">
                      {r.perDayText}
                    </span>,
                    <Badge key="v" tone={PACE_BADGE[r.pace].tone}>
                      {PACE_BADGE[r.pace].text}
                    </Badge>,
                  ],
                }))}
              />

              <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                Chỉ tiêu lấy từ bảng thước ở module 5 · Cấu hình rồi nhân cho số người mang vai, nên
                cột chỉ tiêu là số của CẢ VAI chứ không của một người; cột &ldquo;Đã đạt&rdquo; đo
                tới lát cắt {board.targets.cutoff} còn chỉ tiêu tính tới hết kỳ{' '}
                {board.targets.window}, nên đừng đọc phần chưa đi hết là phần đã hụt.
                {board.targets.absentNote ? ` ${board.targets.absentNote}` : ''}
              </p>

              {/* Mẫu số và người — hai thứ vừa bị đẩy ra khỏi ô bảng. Ở đây chúng
                  có chỗ để đứng đủ: tên của cả ba người vai Sale in ra hết, vì
                  "ai làm phần còn thiếu" là câu bảng chỉ tiêu sinh ra để trả lời
                  và ô &ldquo;3 người&rdquo; thì không trả lời được. */}
              <div className="flex flex-col gap-2">
                <b className="text-[12.5px] font-semibold">Mỗi thước đếm cái gì, và ai mang nó</b>
                <ul className="flex flex-col gap-2">
                  {board.targets.rows.map((r) => (
                    <li key={r.key} className="flex flex-col gap-1">
                      <span className="text-[12.5px] leading-[1.5]">
                        <b className="font-semibold">{r.metric}</b> · {r.role}:{' '}
                        {r.owners.join(' · ')}
                      </span>
                      <span className="text-muted-foreground font-mono text-[10.5px] leading-[1.5]">
                        {r.formula}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Câu ngay trên bảng chỉ sang module 5 bằng CHỮ. Chỗ sửa chỉ tiêu
                  tháng là mục 5.6.2 của màn Cấu hình; `/sales/config` có thật
                  trong `routes.tsx` nên nút không hứa gì nó không đưa tới. */}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="md" variant="ghost" onClick={() => navigate('/sales/config')}>
                  <Icon icon={ArrowRight} size={16} />
                  Sửa chỉ tiêu ở Cấu hình
                </Button>
                <p className="text-muted-foreground min-w-0 flex-1 text-[12.5px] leading-[1.5]">
                  Màn này đọc chỉ tiêu; nơi đặt ra nó là module 5.
                </p>
              </div>
            </GlassCard>

            {/* 2 · Phòng đang đứng ở đâu — bốn số một kế hoạch cần, và bằng
                chứng tiền của chúng.

                Thẻ dùng bản `compact`: bốn ô này không có sparkline và không có
                delta (lý do delta ở khối "Cố tình không làm" dưới cùng), nên bản
                `hero` cao 150px để lại đúng một mảng trắng dưới nhãn. */}
            <section className="flex flex-col gap-4">
              <SectionTitle size="md" hint={board.statsNote}>
                Phòng đang đứng ở đâu
              </SectionTitle>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {board.stats.map((s) => (
                  <StatCard
                    key={s.key}
                    size="compact"
                    icon={STAT_ICON[s.key]}
                    value={s.value}
                    label={s.label}
                    hint={s.hint}
                  />
                ))}
              </div>

              {/* Bảng giá mỗi lead tốt — bằng chứng của đề xuất ngân sách. Mỗi
                  dòng hiện DẢI chứ không hiện một con số trần: cận trên là số
                  dùng để quyết chi tiền, mà trên cỡ mẫu 9–22 lead nó cách điểm
                  tới ba lần. Thứ tự vẫn xếp theo điểm (quyết định D-03) — thứ bị
                  chặn là câu chữ, không phải thứ tự. */}
              <GlassCard variant="b" className="flex flex-col gap-3 p-5 lg:p-6">
                <SectionTitle size="sm" kicker="Tiền đã đi đâu" hint={board.rankingNote}>
                  Giá mỗi lead tốt theo nguồn
                </SectionTitle>
                <DataTable
                  columns={[
                    { header: 'Hạng', width: '0.4fr' },
                    { header: 'Mã', width: '0.9fr' },
                    { header: 'Lead tốt', width: '0.7fr', align: 'right' },
                    { header: 'Giá mỗi lead tốt · dải 95%', width: '2fr' },
                  ]}
                  rows={board.ranking.map((r, i) => ({
                    id: r.code,
                    cells: [
                      <span key="r" className="tnum font-num text-muted-foreground">
                        {i + 1}
                      </span>,
                      /* Cả tám mã ở bảng này là mã nguồn, nên cả cột bấm được —
                         không có chỗ lẫn giữa "bấm được" và "là chữ". */
                      <Chip
                        key="c"
                        variant="object"
                        onOpen={() => navigate(`/sales/campaigns/${r.code}`)}
                      >
                        {r.code}
                      </Chip>,
                      <span key="g" className="tnum font-num">
                        {r.good}/{r.leads}
                      </span>,
                      <CostBand
                        key="b"
                        variant="table"
                        point={r.band.point}
                        lo={r.band.lo}
                        hi={r.band.hi}
                        enough={r.enough}
                      />,
                    ],
                  }))}
                />
                <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
                  {board.rankingClaim}
                </p>
              </GlassCard>
            </section>

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
              {/* 3 · Đề xuất. Mỗi khối là một <AiAction>: có căn cứ số thật, có
                  nút, và có dòng "Chưa tạo gì cả" ngay dưới nút. */}
              <section id="de-xuat" className="flex flex-col gap-4">
                <div className="flex items-start gap-2">
                  {/* Luật 15 · icon Trợ lý AI là `orbit`, size 20 vì đây là đầu
                      một khối chứ không phải icon trong nút. */}
                  <Icon icon={Orbit} size={20} className="text-accent-foreground shrink-0" />
                  {/* KHÔNG còn tên "Đề xuất cho tháng tới": việc đứng đầu khối
                      là cứu nhịp của 14 ngày cuối THÁNG NÀY, nên một cái tên
                      chung "tháng tới" biến bản gửi duyệt thành lời khai sai
                      ngay ở dòng tiêu đề. Mỗi việc mang chân trời của nó. */}
                  <SectionTitle
                    size="md"
                    className="min-w-0 flex-1"
                    hint={`${board.proposals.length} việc · mỗi việc một căn cứ số riêng và một chân trời riêng · việc đầu bám khoảng cách tới chỉ tiêu`}
                  >
                    Đề xuất việc phải làm
                  </SectionTitle>
                </div>

                {board.proposals.map((p) => {
                  const added = picked.includes(p.id)
                  return (
                    /* KHÔNG dùng `done` của AiAction: nó in cứng chữ "Đã thực
                       hiện", mà bấm nút ở đây mới chỉ là ĐƯA VÀO KẾ HOẠCH —
                       chưa ai làm gì, và {board.approver} còn chưa gật. Giữ nút
                       lại và đổi nhãn để rút ra được, thay vì báo một việc đã
                       xong khi nó chưa xong.
                       Vì `done` luôn false nên `empty` là chỗ DUY NHẤT của cả
                       hai câu trạng thái — hai câu ấy trước 20/08 là hai thẻ
                       `<p>` màn tự dựng bên ngoài khối. */
                    <AiAction
                      key={p.id}
                      variant="panel"
                      /* Chân trời đứng TRÊN câu đề xuất, không phải trong một
                         Badge: nền của khối đã nhuộm azure nên chữ ở đây phải
                         lấy nhóm `--on-tint-*` (luật 1), mà không tone nào của
                         Badge dùng nhóm đó. */
                      suggestion={
                        <span className="flex flex-col gap-1">
                          <span className="text-on-tint-primary-muted text-[11.5px] leading-[1.5]">
                            Phải xong trong: {p.horizon}
                          </span>
                          <span>{p.suggestion}</span>
                        </span>
                      }
                      basis={p.basis}
                      /* Nhãn khác hẳn nút "Bỏ khỏi kế hoạch" ở danh sách bên
                         dưới — hai nút cùng tên trên một màn thì người dùng
                         không biết mình đang rút cái nào. */
                      confirmLabel={added ? 'Đã thêm · bấm để rút' : p.confirmLabel}
                      empty={
                        added ? (
                          <>
                            Đã nằm trong kế hoạch, người làm là{' '}
                            <b className="text-on-tint-primary font-semibold">{p.owner}</b>. Vẫn
                            chưa gửi cho ai.
                          </>
                        ) : p.owner === board.approver ? (
                          /* Người làm TRÙNG người gật thì câu chung in ra "X vẫn
                             phải gật trước khi X bắt tay vào làm" — một câu vô
                             nghĩa (luật 15) làm hỏng đúng thứ nó sinh ra để giữ:
                             chuỗi "người làm khác người gật" của luật 9. */
                          <>
                            Chưa tạo gì cả. Bấm nút trên thì đề xuất mới vào kế hoạch — việc này do
                            chính {board.approver} làm, nhưng vẫn phải đi qua bước gửi duyệt.
                          </>
                        ) : (
                          <>
                            Chưa tạo gì cả. Bấm nút trên thì đề xuất mới vào kế hoạch, và{' '}
                            {board.approver} vẫn phải gật trước khi {p.owner} bắt tay vào làm.
                          </>
                        )
                      }
                      onConfirm={() => {
                        toggle(p.id)
                        /* Nối E3 khi có backend: `proposeFromAi` với đúng
                           `basis` ở trên. Đề xuất vào hệ ở trạng thái chờ,
                           không phải trạng thái đã làm. */
                      }}
                    />
                  )
                })}
              </section>

              {/* 4 · Kế hoạch đã chốt. Danh sách → nằm trên glass-b (luật 8). */}
              <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
                <div className="flex items-center gap-2">
                  <Icon icon={ClipboardList} size={16} className="shrink-0" />
                  <SectionTitle
                    size="sm"
                    className="min-w-0 flex-1"
                    hint="Mã nguồn và mã lead bấm được để mở hồ sơ; mã đơn là chữ, vì hệ chưa có màn hồ sơ đơn."
                  >
                    Kế hoạch đã chốt
                  </SectionTitle>
                </div>

                {chosen.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    message="Chưa tạo gì cả. Kế hoạch chỉ chứa thứ người bấm thêm vào — trợ lý không tự chốt việc nào, kể cả việc nó vừa đề xuất."
                    /* EmptyState LUÔN vẽ một nút, nên nút phải làm được việc
                       thật — nút bấm không phản hồi tệ hơn không có nút. */
                    action={{
                      label: 'Xem đề xuất',
                      onClick: () =>
                        document
                          .getElementById('de-xuat')
                          ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
                    }}
                    className="py-8"
                  />
                ) : (
                  <ol className="flex flex-col gap-3">
                    {chosen.map((p, i) => (
                      <li key={p.id}>
                        <InsetPanel pad="sm" className="flex flex-col gap-2">
                          <span className="text-[12.5px] font-semibold leading-[1.5]">
                            <span className="tnum font-num">{i + 1}.</span> {p.suggestion}
                          </span>
                          {/* Căn cứ đi CÙNG việc sang chỗ người gật. Gửi mỗi câu
                              đề xuất là bắt người ta gật vào niềm tin. */}
                          <span className="text-glass-foreground text-[11.5px] leading-[1.5]">
                            Căn cứ: {p.basis}
                          </span>
                          {/* Hai dòng rời, không nối bằng dấu chấm giữa: chân
                              trời tự nó đã chứa một dấu chấm giữa ("Tháng 8 ·
                              2026"), nối thêm một cái nữa thì câu đọc ra ba vế
                              ngang hàng. */}
                          <span className="text-[11.5px]">
                            Người làm: <b className="font-semibold">{p.owner}</b>
                          </span>
                          <span className="text-[11.5px]">
                            Phải xong trong: <b className="font-semibold">{p.horizon}</b>
                          </span>
                          {p.codes.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              {p.codes.map((code) => {
                                const to = routeOfCode(code)
                                return (
                                  <Chip
                                    key={code}
                                    onOpen={to === null ? undefined : () => navigate(to)}
                                  >
                                    {code}
                                  </Chip>
                                )
                              })}
                            </div>
                          )}
                          {/* Nút NGHIỆP VỤ, không phải nút trang trí: `sm` đo
                              được 32px, dưới ngưỡng tablet của luật 13. */}
                          <Button size="md" variant="ghost" onClick={() => toggle(p.id)}>
                            <Icon icon={X} size={16} />
                            Bỏ khỏi kế hoạch
                          </Button>
                        </InsetPanel>
                      </li>
                    ))}
                  </ol>
                )}

                {sent ? (
                  <div className="flex flex-col gap-2">
                    <Badge tone="running" className="self-start">
                      Đã gửi {board.approver} · đang chờ duyệt
                    </Badge>
                    <Button size="md" variant="ghost" onClick={() => setSent(false)}>
                      Rút lại
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="md"
                    disabled={chosen.length === 0}
                    onClick={() => {
                      setSent(true)
                      /* Nối E3 khi có backend: cả kế hoạch đi thành MỘT yêu cầu
                         duyệt, không phải ba yêu cầu rời — người gật cần thấy
                         tháng tới phòng làm gì, không phải ba mẩu việc. */
                    }}
                  >
                    <Icon icon={Send} size={16} />
                    Gửi {board.approver} duyệt
                  </Button>
                )}
              </GlassCard>
            </div>
          </>
        )}

        <NotDoing />
      </div>
    </AppShell>
  )
}

/** Cố tình không làm — bốn thứ bị bỏ có chủ ý, kèm lý do.
 *
 *  Khối này ở lại trên màn (không phải trong comment) vì ba trong bốn dòng là
 *  thứ người xem sẽ hỏi ngay: "sao không có dự báo", "sao không có mũi tên
 *  tăng/giảm". Trả lời một lần trên màn rẻ hơn trả lời mười lần trong họp. */
function NotDoing() {
  const items = [
    {
      title: 'Không dự báo doanh số tháng tới',
      body: 'Chỉ tiêu ở đầu màn là số NGƯỜI ĐẶT, đã nằm sẵn trong bảng thước của module 5. Dự báo là số MÁY ĐOÁN, mà DAS Vina là một lát cắt đóng băng nên mọi đường cong tháng tới sẽ là số không ai ký.',
    },
    {
      title: 'Không có delta trên bốn ô số',
      body: 'Delta là so với kỳ trước, mà kỳ trước không tồn tại trong kịch bản này. Ô số ở đây nói "đang là bao nhiêu", không nói "đang tăng hay giảm".',
    },
    {
      title: 'Không tự gửi cho ai',
      body: 'Trợ lý không thêm việc vào kế hoạch, không gửi duyệt, không báo cho ai. Cả ba bước đều chờ người bấm — luật 9.',
    },
    {
      title: 'Không chấm điểm từng người ở đây',
      body: 'Bảng chỉ tiêu cắt theo THƯỚC của cả phòng, không theo người. "Ai đang làm được, ai đang tắc" vẫn là câu hỏi của màn Performance.',
    },
  ]

  return (
    <GlassCard className="flex flex-col gap-3 p-5 lg:p-6">
      <SectionTitle size="sm">Cố tình không làm</SectionTitle>
      <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[12.5px] font-semibold">{it.title}</b>
            <span className="text-muted-foreground text-[12.5px] leading-[1.6]">{it.body}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

export default PlanPage
